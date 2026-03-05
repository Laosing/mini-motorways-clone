import type { Game } from '@core/Game';
import type { Building } from '@entities/Building';
import type { Villager } from '@entities/Villager';
import * as LJS from 'littlejsengine';
import {
  advanceBody,
  applyCrowdAvoidance,
  resolveBodyOverlaps,
  resolveBodyOverlapsSingle,
  steerToward,
  type AvoidanceConfig,
  type SteeringConfig
} from './motion';
import { findPathOnNetwork } from './pathNetwork';
import { toKey } from '@utils/grid';

const PX_TO_CELL = 1 / 8;
const CLOSE_ENOUGH = 2 * PX_TO_CELL;
const CLOSE_ENOUGH_DEST = 0.45;
const MAX_SPEED = 0.35 * PX_TO_CELL;
const MIN_CRUISE_SPEED = 0.04 * PX_TO_CELL;
const ARRIVAL_RADIUS = 2.5 * PX_TO_CELL;
const LOOKAHEAD_DISTANCE = 5.0 * PX_TO_CELL;
const STEER_ACCEL = 0.04 * PX_TO_CELL; // Increased from 0.015 for better responsiveness
const LANE_OFFSET = 1.2 * PX_TO_CELL;
const MOVE_DAMPING = 0.95;
const IDLE_DAMPING = 0.85;
const VILLAGER_RADIUS = 1.35 * PX_TO_CELL;
const VILLAGER_DIAMETER = VILLAGER_RADIUS * 2;
const SLOW_DISTANCE = 6.0 * PX_TO_CELL;
const AVOID_DISTANCE = VILLAGER_DIAMETER + 1.2 * PX_TO_CELL;
const COLLISION_DISTANCE = VILLAGER_DIAMETER;
const TURNYNESS = 0.01 * PX_TO_CELL;
const CROWD_CFG: AvoidanceConfig = {
  slowDistance: SLOW_DISTANCE,
  avoidDistance: AVOID_DISTANCE,
  collisionDistance: COLLISION_DISTANCE,
  turniness: TURNYNESS,
  slowdownStrength: 0.25,
  maxSpeed: MAX_SPEED
};
const STEER_CFG: SteeringConfig = {
  maxSpeed: MAX_SPEED,
  minCruiseSpeed: MIN_CRUISE_SPEED,
  arrivalRadius: ARRIVAL_RADIUS,
  steerAccel: STEER_ACCEL,
  damping: MOVE_DAMPING
};

// Cached vectors for task system
const _v1 = LJS.vec2();
const _v2 = LJS.vec2();
const _v3 = LJS.vec2();
const _v4 = LJS.vec2();

function getLookaheadTarget(
  position: LJS.Vector2,
  path: Array<{ x: number; y: number }>
): LJS.Vector2 {
  _v1.set(position.x, position.y);
  let remaining = LOOKAHEAD_DISTANCE;

  for (const node of path) {
    const nx = node.x;
    const ny = node.y;
    const dx = nx - _v1.x;
    const dy = ny - _v1.y;
    const len = Math.sqrt(dx * dx + dy * dy);

    if (len > 0.0001) {
      if (len >= remaining) {
        // Return a new vector here as it's used as a target
        return LJS.vec2(
          _v1.x + (dx / len) * remaining,
          _v1.y + (dy / len) * remaining
        );
      }
      remaining -= len;
    }
    _v1.set(nx, ny);
  }

  const last = path[path.length - 1];
  return LJS.vec2(last.x, last.y);
}

function getLaneOffsetVector(
  from: LJS.Vector2,
  to: LJS.Vector2,
  offset: number
): LJS.Vector2 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.001) return LJS.vec2(0, 0);
  // Perpendicular vector for Right Hand Traffic (RHT)
  return LJS.vec2((dy / len) * offset, (-dx / len) * offset);
}

function steerAlongRoute(_game: Game, villager: Villager): void {
  if (!villager.path.length) return;

  _v2.set(villager.x, villager.y);

  // Proactively skip nodes we are already basically touching
  while (villager.path.length > 1) {
    const node = villager.path[0];
    const dx = _v2.x - node.x;
    const dy = _v2.y - node.y;
    if (dx * dx + dy * dy < 0.1225) {
      // 0.35 * 0.35
      villager.path.shift();
    } else {
      break;
    }
  }

  const targetNode = villager.path[0];
  _v3.set(targetNode.x, targetNode.y); // target

  const closeEnough =
    villager.path.length === 1 ? CLOSE_ENOUGH_DEST : CLOSE_ENOUGH;
  const dx = _v2.x - _v3.x;
  const dy = _v2.y - _v3.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < closeEnough) {
    const reached = villager.path.shift();
    if (reached) {
      villager.lastReachedPos = { x: reached.x, y: reached.y };
    }
    if (!villager.path.length) {
      villager.x = _v3.x;
      villager.y = _v3.y;
      villager.dx = 0;
      villager.dy = 0;
      villager.lastReachedPos = null;
    }
    return;
  }

  if (!villager.lastReachedPos) {
    villager.lastReachedPos = { x: villager.x, y: villager.y };
  }

  _v4.set(villager.lastReachedPos.x, villager.lastReachedPos.y); // prev
  const laneOffset = getLaneOffsetVector(_v4, _v3, LANE_OFFSET);

  // Use _v1 (from getLookaheadTarget logic partially)
  const lookaheadTarget = getLookaheadTarget(_v2, villager.path);

  // Reuse _v4 for steerTarget
  const baseTarget = villager.path.length === 1 ? _v3 : lookaheadTarget;
  _v4.set(baseTarget.x + laneOffset.x, baseTarget.y + laneOffset.y);

  const rampCfg: SteeringConfig = {
    ...STEER_CFG,
    minCruiseSpeed: villager.path.length === 1 ? 0 : MIN_CRUISE_SPEED,
    maxSpeed: MAX_SPEED * Math.min(1, dist / ARRIVAL_RADIUS)
  };
  steerToward(villager, _v4, rampCfg);
}

// Spatial partitioning for O(N) physics
const spatialGrid: Villager[][][] = []; // [y][x][villagers]
const activeCells: Villager[][] = []; // Keep track of populated cells for faster clearing

function updateSpatialGrid(game: Game) {
  const width = Math.ceil(game.grid.width);
  const height = Math.ceil(game.grid.height);

  // Clear only active cells from last frame
  for (let i = 0; i < activeCells.length; i++) {
    activeCells[i].length = 0;
  }
  activeCells.length = 0;

  // Populate grid
  for (let i = 0; i < game.villagers.length; i++) {
    const v = game.villagers[i];
    const gx = Math.floor(v.x);
    const gy = Math.floor(v.y);
    if (gx >= 0 && gx < width && gy >= 0 && gy < height) {
      if (!spatialGrid[gy]) spatialGrid[gy] = [];
      if (!spatialGrid[gy][gx]) spatialGrid[gy][gx] = [];
      const cell = spatialGrid[gy][gx];
      if (cell.length === 0) activeCells.push(cell);
      cell.push(v);
    }
  }
}

function getNearbyVillagers(
  game: Game,
  x: number,
  y: number,
  radius: number,
  out: Villager[]
) {
  out.length = 0;
  const height = Math.ceil(game.grid.height);
  const width = Math.ceil(game.grid.width);

  const minX = Math.max(0, Math.floor(x - radius));
  const maxX = Math.min(width - 1, Math.floor(x + radius));
  const minY = Math.max(0, Math.floor(y - radius));
  const maxY = Math.min(height - 1, Math.floor(y + radius));

  for (let gy = minY; gy <= maxY; gy++) {
    if (!spatialGrid[gy]) continue;
    for (let gx = minX; gx <= maxX; gx++) {
      const cell = spatialGrid[gy][gx];
      if (!cell || cell.length === 0) continue;
      for (let i = 0; i < cell.length; i++) {
        out.push(cell[i]);
      }
    }
  }
}

const _nearbyBuffer: Villager[] = [];
const _activeOthersBuffer: Villager[] = [];

function applyVillagerCrowdAvoidance(game: Game, villager: Villager): void {
  // If we've been stuck for several seconds, phase through others to resolve the jam
  if (villager.stuckTimer > 4.0) return;
  getNearbyVillagers(
    game,
    villager.x,
    villager.y,
    AVOID_DISTANCE,
    _nearbyBuffer
  );
  applyCrowdAvoidance(villager, _nearbyBuffer, CROWD_CFG);
}

function assignPeopleToOfficeIssues(game: Game): void {
  // 1. Group idle villagers by their home's entry tile node
  const idleMap = new Map<string, Villager[]>();
  for (const v of game.villagers) {
    if (v.task !== 'idle') continue;

    const home = game.houses.find((h) => h.id === v.homeHouseId);
    if (!home) continue;

    // Only consider villagers whose homes match the office's color type
    // This is a requirement from the existing logic
    const key = toKey(home.entryTile.x, home.entryTile.y);
    const list = idleMap.get(key) || [];
    list.push(v);
    idleMap.set(key, list);
  }

  // Build adjacency map for BFS (reuse this for all offices)
  const adj = new Map<string, Array<{ x: number; y: number }>>();
  for (const edge of game.paths) {
    const ka = toKey(edge.a.x, edge.a.y);
    const kb = toKey(edge.b.x, edge.b.y);

    const na = adj.get(ka) || [];
    na.push(edge.b);
    adj.set(ka, na);

    const nb = adj.get(kb) || [];
    nb.push(edge.a);
    adj.set(kb, nb);
  }

  for (const office of game.offices) {
    const requiredWorkers = office.numIssues;
    const currentAssigned = office.assignedVillagerIds.length;
    if (currentAssigned >= requiredWorkers) continue;

    let needed = requiredWorkers - currentAssigned;
    const officeEntry = office.entryTile;
    const officeEntryKey = toKey(officeEntry.x, officeEntry.y);

    // 2. BFS from office entry to find nearest idle villagers
    const queue: Array<{
      pos: { x: number; y: number };
      path: Array<{ x: number; y: number }>;
    }> = [{ pos: officeEntry, path: [officeEntry] }];
    const visited = new Set<string>([officeEntryKey]);

    while (queue.length > 0 && needed > 0) {
      const current = queue.shift()!;
      const currentKey = toKey(current.pos.x, current.pos.y);

      // Check if any idle villagers are at this node
      const candidates = idleMap.get(currentKey);
      if (candidates) {
        // Filter by destination type (e.g. red, blue)
        const matched = candidates.filter(
          (v) => v.destinationType === office.destination
        );

        while (matched.length > 0 && needed > 0) {
          const v = matched.shift()!;
          // Remove from index so they aren't assigned twice in this frame
          const list = idleMap.get(currentKey)!;
          const idx = list.indexOf(v);
          if (idx !== -1) list.splice(idx, 1);

          // Assign task
          v.task = 'toOffice';
          v.target = { x: officeEntry.x, y: officeEntry.y };
          // The BFS path is from office -> home, we need home -> office
          v.path = [...current.path].reverse();
          v.lastReachedPos = { x: v.x, y: v.y };
          v.originalRouteLength = v.path.length;
          v.assignedOfficeId = office.id;
          office.assignedVillagerIds.push(v.id);
          needed--;
        }
      }

      // Add neighbors to queue
      const neighbors = adj.get(currentKey) || [];
      for (const next of neighbors) {
        const nKey = toKey(next.x, next.y);
        if (!visited.has(nKey)) {
          visited.add(nKey);
          queue.push({
            pos: next,
            path: [...current.path, next]
          });
        }
      }
    }
  }
}

function unassignFromOffice(
  game: Game,
  villagerId: string,
  officeId: string | null
): void {
  if (!officeId) return;
  const office = game.offices.find((f) => f.id === officeId);
  if (!office) return;
  office.assignedVillagerIds = office.assignedVillagerIds.filter(
    (id) => id !== villagerId
  );
}

function sanitizeVillagerPosition(game: Game, villager: Villager): void {
  const maxX = game.grid.width - 1;
  const maxY = game.grid.height - 1;

  if (!Number.isFinite(villager.x) || !Number.isFinite(villager.y)) {
    const home = game.houses.find((y) => y.id === villager.homeHouseId);
    villager.x = home?.x ?? 0;
    villager.y = home?.y ?? 0;
    villager.dx = 0;
    villager.dy = 0;
    villager.path = [];
    villager.target = null;
    villager.task = 'idle';
    unassignFromOffice(game, villager.id, villager.assignedOfficeId);
    villager.assignedOfficeId = null;
    return;
  }

  villager.x = Math.min(maxX, Math.max(0, villager.x));
  villager.y = Math.min(maxY, Math.max(0, villager.y));
}

function resolveVillagerOverlaps(game: Game): void {
  for (let i = 0; i < game.villagers.length; i++) {
    const a = game.villagers[i];
    // Don't apply hard collisions to ghosting villagers
    if (a.stuckTimer > 4.0) continue;

    getNearbyVillagers(game, a.x, a.y, VILLAGER_DIAMETER, _nearbyBuffer);

    // Also filter others in the buffer that are ghosting to avoid pushing them
    _activeOthersBuffer.length = 0;
    for (let j = 0; j < _nearbyBuffer.length; j++) {
      if (_nearbyBuffer[j].stuckTimer <= 4.0) {
        _activeOthersBuffer.push(_nearbyBuffer[j]);
      }
    }
    resolveBodyOverlapsSingle(a, _activeOthersBuffer, VILLAGER_DIAMETER);
  }
}

export function updateVillagers(game: Game, dt: number): void {
  updateSpatialGrid(game);
  // Only check for new assignments every 10 frames to save CPU
  if (game.updateCount % 10 === 0) {
    assignPeopleToOfficeIssues(game);
  }

  for (const villager of game.villagers) {
    if (villager.task === 'idle' || villager.task === 'atOffice') {
      villager.dx *= IDLE_DAMPING;
      villager.dy *= IDLE_DAMPING;
    }

    if (villager.task === 'toOffice' || villager.task === 'toHome') {
      steerAlongRoute(game, villager);
      applyVillagerCrowdAvoidance(game, villager);
    }

    advanceBody(villager, dt);
    sanitizeVillagerPosition(game, villager);

    // Stuck detection logic
    if (villager.task === 'toOffice' || villager.task === 'toHome') {
      const dx = villager.x - (villager.lastPosForStuck?.x ?? 0);
      const dy = villager.y - (villager.lastPosForStuck?.y ?? 0);
      const distSq = dx * dx + dy * dy;

      if (distSq < 0.001) {
        villager.stuckTimer += dt;
      } else {
        villager.stuckTimer = 0;
        villager.lastPosForStuck = { x: villager.x, y: villager.y };
      }

      if (villager.stuckTimer > 2.0) {
        // STATIONARY for 2s: Disable fine-grained avoidance to allow better steering
        if (villager.path.length > 0) {
          const node = villager.path[0];
          const nx = node.x - villager.x;
          const ny = node.y - villager.y;
          const mag = Math.sqrt(nx * nx + ny * ny);

          if (mag > 0.001) {
            // Strong nudge toward target node
            villager.dx += (nx / mag) * 0.05 * dt;
            villager.dy += (ny / mag) * 0.05 * dt;
          }

          // STATIONARY for 8s: Teleport to the current node to bypass physical blocks
          if (villager.stuckTimer > 8.0) {
            villager.x = node.x;
            villager.y = node.y;
            villager.stuckTimer = 1.0; // Reset slightly to prevent instant double teleport
          }

          // STATIONARY for 12s: Something is fundamentally broken, skip this node
          if (villager.stuckTimer > 12.0) {
            villager.path.shift();
            villager.stuckTimer = 0;
          }
        }
      }
    } else {
      villager.stuckTimer = 0;
      villager.lastPosForStuck = null;
    }

    const speed = Math.hypot(villager.dx, villager.dy);
    if (speed > 0.005) {
      const targetRotation = Math.atan2(villager.dy, villager.dx);
      let diff = targetRotation - (villager.rotation || 0);
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      villager.rotation = (villager.rotation || 0) + diff * 0.15 * dt * 60;
    }

    if (
      (villager.task === 'toOffice' || villager.task === 'toHome') &&
      !villager.path.length &&
      villager.target
    ) {
      if (villager.task === 'toOffice') {
        const office = game.offices.find(
          (f) => f.id === villager.assignedOfficeId
        );
        if (office) {
          villager.x = villager.target.x;
          villager.y = villager.target.y;
          villager.dx = 0;
          villager.dy = 0;
          game.consumeOfficeIssue(office);
          game.servedTrips += 1;
          villager.task = 'atOffice';
          villager.lastReachedPos = null;
          villager.waitTimer = 1.2;
        } else {
          villager.task = 'idle';
          villager.lastReachedPos = null;
          unassignFromOffice(game, villager.id, villager.assignedOfficeId);
          villager.assignedOfficeId = null;
        }
      } else {
        villager.x = villager.target.x;
        villager.y = villager.target.y;
        villager.dx = 0;
        villager.dy = 0;
        villager.task = 'idle';
        villager.lastReachedPos = null;
        unassignFromOffice(game, villager.id, villager.assignedOfficeId);
        villager.assignedOfficeId = null;
      }
      villager.target = null;
    }

    if (villager.task === 'atOffice') {
      villager.waitTimer -= dt;
      if (villager.waitTimer <= 0) {
        const home = game.houses.find((y) => y.id === villager.homeHouseId);
        if (!home) {
          villager.task = 'idle';
          unassignFromOffice(game, villager.id, villager.assignedOfficeId);
          villager.assignedOfficeId = null;
          continue;
        }

        const startX = Math.round(villager.x);
        const startY = Math.round(villager.y);
        const backRoute = findPathOnNetwork(
          game.paths,
          { x: startX, y: startY },
          { x: home.x, y: home.y }
        );

        if (backRoute.length) {
          villager.task = 'toHome';
          villager.target = { x: home.x, y: home.y };
          villager.path = backRoute;
          villager.lastReachedPos = { x: villager.x, y: villager.y };
          villager.originalRouteLength = backRoute.length;
        } else {
          // If no path back home, they are stranded.
          // Instead of immediate idle, we'll let the Rescue logic below handle the teleport.
          villager.task = 'idle';
          villager.target = null;
          villager.path = [];
          unassignFromOffice(game, villager.id, villager.assignedOfficeId);
          villager.assignedOfficeId = null;
        }
      }
    }

    // --- RESCUE STRANDED VILLAGERS ---
    // If a villager is idle but NOT at their home residence, they are "lost"
    if (villager.task === 'idle') {
      const home = game.houses.find((h) => h.id === villager.homeHouseId);
      if (home) {
        const dx = villager.x - home.x;
        const dy = villager.y - home.y;
        const distSq = dx * dx + dy * dy;

        // If more than 0.5 units from home tile
        if (distSq > 0.25) {
          villager.stuckTimer += dt;

          // Every 2 seconds, try to find a path home
          if (
            Math.floor(villager.stuckTimer) % 2 === 0 &&
            villager.stuckTimer > 1.0
          ) {
            const route = findPathOnNetwork(
              game.paths,
              { x: Math.round(villager.x), y: Math.round(villager.y) },
              { x: home.x, y: home.y }
            );
            if (route.length) {
              villager.task = 'toHome';
              villager.target = { x: home.x, y: home.y };
              villager.path = route;
              villager.stuckTimer = 0;
            }
          }

          // If stranded for 5+ seconds without a path, just teleport home
          if (villager.stuckTimer > 5.0) {
            villager.x = home.x;
            villager.y = home.y;
            villager.dx = 0;
            villager.dy = 0;
            villager.stuckTimer = 0;
          }
        } else {
          villager.stuckTimer = 0;
        }
      }
    }
  }

  resolveVillagerOverlaps(game);
  for (const villager of game.villagers)
    sanitizeVillagerPosition(game, villager);
}
