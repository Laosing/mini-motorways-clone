import type { Game } from '@core/Game';
import type { Worker } from '@entities/Worker';
import * as LJS from 'littlejsengine';
import {
  advanceBody,
  applyCrowdAvoidance,
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
const WORKER_RADIUS = 1.35 * PX_TO_CELL;
const WORKER_DIAMETER = WORKER_RADIUS * 2;
const SLOW_DISTANCE = 6.0 * PX_TO_CELL;
const AVOID_DISTANCE = WORKER_DIAMETER + 1.2 * PX_TO_CELL;
const COLLISION_DISTANCE = WORKER_DIAMETER;
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

function steerAlongRoute(_game: Game, worker: Worker): void {
  if (!worker.path.length) return;

  _v2.set(worker.x, worker.y);

  // Proactively skip nodes we are already basically touching
  while (worker.path.length > 1) {
    const node = worker.path[0];
    const dx = _v2.x - node.x;
    const dy = _v2.y - node.y;
    if (dx * dx + dy * dy < 0.1225) {
      // 0.35 * 0.35
      worker.path.shift();
    } else {
      break;
    }
  }

  const targetNode = worker.path[0];
  _v3.set(targetNode.x, targetNode.y); // target

  const closeEnough =
    worker.path.length === 1 ? CLOSE_ENOUGH_DEST : CLOSE_ENOUGH;
  const dx = _v2.x - _v3.x;
  const dy = _v2.y - _v3.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < closeEnough) {
    const reached = worker.path.shift();
    if (reached) {
      worker.lastReachedPos = { x: reached.x, y: reached.y };
    }
    if (!worker.path.length) {
      worker.x = _v3.x;
      worker.y = _v3.y;
      worker.dx = 0;
      worker.dy = 0;
      worker.lastReachedPos = null;
    }
    return;
  }

  if (!worker.lastReachedPos) {
    worker.lastReachedPos = { x: worker.x, y: worker.y };
  }

  _v4.set(worker.lastReachedPos.x, worker.lastReachedPos.y); // prev
  const laneOffset = getLaneOffsetVector(_v4, _v3, LANE_OFFSET);

  // Use _v1 (from getLookaheadTarget logic partially)
  const lookaheadTarget = getLookaheadTarget(_v2, worker.path);

  // Reuse _v4 for steerTarget
  const baseTarget = worker.path.length === 1 ? _v3 : lookaheadTarget;
  _v4.set(baseTarget.x + laneOffset.x, baseTarget.y + laneOffset.y);

  const rampCfg: SteeringConfig = {
    ...STEER_CFG,
    minCruiseSpeed: worker.path.length === 1 ? 0 : MIN_CRUISE_SPEED,
    maxSpeed: MAX_SPEED * Math.min(1, dist / ARRIVAL_RADIUS)
  };
  steerToward(worker, _v4, rampCfg);
}

// Spatial partitioning for O(N) physics
const spatialGrid: Worker[][][] = []; // [y][x][workers]
const activeCells: Worker[][] = []; // Keep track of populated cells for faster clearing

function updateSpatialGrid(game: Game) {
  const width = Math.ceil(game.grid.width);
  const height = Math.ceil(game.grid.height);

  // Clear only active cells from last frame
  for (let i = 0; i < activeCells.length; i++) {
    activeCells[i].length = 0;
  }
  activeCells.length = 0;

  // Populate grid
  for (let i = 0; i < game.workers.length; i++) {
    const v = game.workers[i];
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

function getNearbyWorkers(
  game: Game,
  x: number,
  y: number,
  radius: number,
  out: Worker[]
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

const _nearbyBuffer: Worker[] = [];
const _activeOthersBuffer: Worker[] = [];

function applyWorkerCrowdAvoidance(game: Game, worker: Worker): void {
  // If we've been stuck for several seconds, phase through others to resolve the jam
  if (worker.stuckTimer > 4.0) return;
  getNearbyWorkers(game, worker.x, worker.y, AVOID_DISTANCE, _nearbyBuffer);
  applyCrowdAvoidance(worker, _nearbyBuffer, CROWD_CFG);
}

function assignPeopleToOfficeIssues(game: Game): void {
  // 1. Group idle workers by their home's entry tile node
  const idleMap = new Map<string, Worker[]>();
  for (const v of game.workers) {
    if (v.task !== 'idle') continue;

    const home = game.houses.find((h) => h.id === v.homeHouseId);
    if (!home) continue;

    // Only consider workers whose homes match the office's color type
    // This is a requirement from the existing logic
    const key = toKey(home.entryTile.x, home.entryTile.y);
    const list = idleMap.get(key) || [];
    list.push(v);
    idleMap.set(key, list);
  }

  // Build reversed adjacency map for BFS (searching FROM office TO home)
  const adj = new Map<string, Array<{ x: number; y: number }>>();
  for (const edge of game.paths) {
    const ka = toKey(edge.a.x, edge.a.y);
    const kb = toKey(edge.b.x, edge.b.y);

    // Check if this is a roundabout edge (has roundaboutId)
    const isRoundaboutEdge =
      edge.roundaboutId !== undefined && edge.roundaboutId !== null;
    if (isRoundaboutEdge) {
      // In reversed graph for BFS: if A -> B is the flow, we add B -> A
      const neighbors = adj.get(kb) || [];
      neighbors.push(edge.a);
      adj.set(kb, neighbors);
    } else {
      // Bidirectional edges remain the same in reverse
      const na = adj.get(ka) || [];
      na.push(edge.b);
      adj.set(ka, na);

      const nb = adj.get(kb) || [];
      nb.push(edge.a);
      adj.set(kb, nb);
    }
  }

  for (const office of game.offices) {
    const requiredWorkers = office.numIssues;
    const currentAssigned = office.assignedWorkerIds.length;
    if (currentAssigned >= requiredWorkers) continue;

    let needed = requiredWorkers - currentAssigned;
    const officeEntry = office.entryTile;
    const officeEntryKey = toKey(officeEntry.x, officeEntry.y);

    // 2. BFS from office entry to find nearest idle workers
    const queue: Array<{
      pos: { x: number; y: number };
      path: Array<{ x: number; y: number }>;
    }> = [{ pos: officeEntry, path: [officeEntry] }];
    const visited = new Set<string>([officeEntryKey]);

    while (queue.length > 0 && needed > 0) {
      const current = queue.shift()!;
      const currentKey = toKey(current.pos.x, current.pos.y);

      // Check if any idle workers are at this node
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
          office.assignedWorkerIds.push(v.id);
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
  workerId: string,
  officeId: string | null
): void {
  if (!officeId) return;
  const office = game.offices.find((f) => f.id === officeId);
  if (!office) return;
  office.assignedWorkerIds = office.assignedWorkerIds.filter(
    (id) => id !== workerId
  );
}

function sanitizeWorkerPosition(game: Game, worker: Worker): void {
  const maxX = game.grid.width - 1;
  const maxY = game.grid.height - 1;

  if (!Number.isFinite(worker.x) || !Number.isFinite(worker.y)) {
    const home = game.houses.find((y) => y.id === worker.homeHouseId);
    worker.x = home?.x ?? 0;
    worker.y = home?.y ?? 0;
    worker.dx = 0;
    worker.dy = 0;
    worker.path = [];
    worker.target = null;
    worker.task = 'idle';
    unassignFromOffice(game, worker.id, worker.assignedOfficeId);
    worker.assignedOfficeId = null;
    return;
  }

  worker.x = Math.min(maxX, Math.max(0, worker.x));
  worker.y = Math.min(maxY, Math.max(0, worker.y));
}

function resolveWorkerOverlaps(game: Game): void {
  for (let i = 0; i < game.workers.length; i++) {
    const a = game.workers[i];
    // Don't apply hard collisions to ghosting workers
    if (a.stuckTimer > 4.0) continue;

    getNearbyWorkers(game, a.x, a.y, WORKER_DIAMETER, _nearbyBuffer);

    // Also filter others in the buffer that are ghosting to avoid pushing them
    _activeOthersBuffer.length = 0;
    for (let j = 0; j < _nearbyBuffer.length; j++) {
      if (_nearbyBuffer[j].stuckTimer <= 4.0) {
        _activeOthersBuffer.push(_nearbyBuffer[j]);
      }
    }
    resolveBodyOverlapsSingle(a, _activeOthersBuffer, WORKER_DIAMETER);
  }
}

export function updateWorkers(game: Game, dt: number): void {
  updateSpatialGrid(game);

  // Only check for new assignments every 10 frames to save CPU
  if (game.updateCount % 10 === 0) {
    assignPeopleToOfficeIssues(game);
  }

  for (const worker of game.workers) {
    // If worker's path was invalidated, try to re-find it
    if (
      (worker.task === 'toOffice' || worker.task === 'toHome') &&
      worker.path.length === 0 &&
      worker.target
    ) {
      // Are we already close enough to arrival?
      const dx = worker.target.x - worker.x;
      const dy = worker.target.y - worker.y;
      const distSq = dx * dx + dy * dy;

      if (distSq > CLOSE_ENOUGH_DEST * CLOSE_ENOUGH_DEST) {
        // Stranded in the middle! Try to find a new route.
        const route = findPathOnNetwork(
          game.paths,
          { x: Math.round(worker.x), y: Math.round(worker.y) },
          { x: worker.target.x, y: worker.target.y }
        );

        if (route.length > 0) {
          worker.path = route;
          worker.lastReachedPos = { x: worker.x, y: worker.y };
          worker.originalRouteLength = route.length;
          worker.stuckTimer = 0;
        } else {
          // Truly dead-ended. Let the rescue logic handle it or let them be idle.
          // For now, we'll just keep them as-is and they might be rescued if they stay stuck.
        }
      }
    }

    if (worker.task === 'idle' || worker.task === 'atOffice') {
      worker.dx *= IDLE_DAMPING;
      worker.dy *= IDLE_DAMPING;
    }

    if (worker.task === 'toOffice' || worker.task === 'toHome') {
      steerAlongRoute(game, worker);
      applyWorkerCrowdAvoidance(game, worker);
    }

    advanceBody(worker, dt);
    sanitizeWorkerPosition(game, worker);

    // Stuck detection logic
    if (worker.task === 'toOffice' || worker.task === 'toHome') {
      const dx = worker.x - (worker.lastPosForStuck?.x ?? 0);
      const dy = worker.y - (worker.lastPosForStuck?.y ?? 0);
      const distSq = dx * dx + dy * dy;

      if (distSq < 0.001) {
        worker.stuckTimer += dt;
      } else {
        worker.stuckTimer = 0;
        worker.lastPosForStuck = { x: worker.x, y: worker.y };
      }

      if (worker.stuckTimer > 2.0) {
        // STATIONARY for 2s: Disable fine-grained avoidance to allow better steering
        if (worker.path.length > 0) {
          const node = worker.path[0];
          const nx = node.x - worker.x;
          const ny = node.y - worker.y;
          const mag = Math.sqrt(nx * nx + ny * ny);

          if (mag > 0.001) {
            // Strong nudge toward target node
            worker.dx += (nx / mag) * 0.05 * dt;
            worker.dy += (ny / mag) * 0.05 * dt;
          }

          // STATIONARY for 8s: Teleport to the current node to bypass physical blocks
          if (worker.stuckTimer > 8.0) {
            worker.x = node.x;
            worker.y = node.y;
            worker.stuckTimer = 1.0; // Reset slightly to prevent instant double teleport
          }

          // STATIONARY for 12s: Something is fundamentally broken, skip this node
          if (worker.stuckTimer > 12.0) {
            worker.path.shift();
            worker.stuckTimer = 0;
          }
        }
      }
    } else {
      worker.stuckTimer = 0;
      worker.lastPosForStuck = null;
    }

    const speed = Math.hypot(worker.dx, worker.dy);
    if (speed > 0.005) {
      const targetRotation = Math.atan2(worker.dy, worker.dx);
      let diff = targetRotation - (worker.rotation || 0);
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      worker.rotation = (worker.rotation || 0) + diff * 0.15 * dt * 60;
    }

    if (
      (worker.task === 'toOffice' || worker.task === 'toHome') &&
      worker.path.length === 0 &&
      worker.target
    ) {
      const dx = worker.target.x - worker.x;
      const dy = worker.target.y - worker.y;
      const distSq = dx * dx + dy * dy;

      if (distSq < CLOSE_ENOUGH_DEST * CLOSE_ENOUGH_DEST) {
        if (worker.task === 'toOffice') {
          const office = game.offices.find(
            (f) => f.id === worker.assignedOfficeId
          );
          if (office) {
            worker.x = worker.target.x;
            worker.y = worker.target.y;
            worker.dx = 0;
            worker.dy = 0;
            game.consumeOfficeIssue(office);
            game.servedTrips += 1;
            worker.task = 'atOffice';
            worker.lastReachedPos = null;
            worker.waitTimer = 1.2;
          } else {
            worker.task = 'idle';
            worker.lastReachedPos = null;
            unassignFromOffice(game, worker.id, worker.assignedOfficeId);
            worker.assignedOfficeId = null;
          }
        } else {
          worker.x = worker.target.x;
          worker.y = worker.target.y;
          worker.dx = 0;
          worker.dy = 0;
          worker.task = 'idle';
          worker.lastReachedPos = null;
          unassignFromOffice(game, worker.id, worker.assignedOfficeId);
          worker.assignedOfficeId = null;
        }
        worker.target = null;
      }
    }

    if (worker.task === 'atOffice') {
      worker.waitTimer -= dt;
      if (worker.waitTimer <= 0) {
        const home = game.houses.find((y) => y.id === worker.homeHouseId);
        if (!home) {
          worker.task = 'idle';
          unassignFromOffice(game, worker.id, worker.assignedOfficeId);
          worker.assignedOfficeId = null;
          continue;
        }

        const startX = Math.round(worker.x);
        const startY = Math.round(worker.y);
        const backRoute = findPathOnNetwork(
          game.paths,
          { x: startX, y: startY },
          { x: home.x, y: home.y }
        );

        if (backRoute.length) {
          worker.task = 'toHome';
          worker.target = { x: home.x, y: home.y };
          worker.path = backRoute;
          worker.lastReachedPos = { x: worker.x, y: worker.y };
          worker.originalRouteLength = backRoute.length;
        } else {
          // If no path back home, they are stranded.
          // Instead of immediate idle, we'll let the Rescue logic below handle the teleport.
          worker.task = 'idle';
          worker.target = null;
          worker.path = [];
          unassignFromOffice(game, worker.id, worker.assignedOfficeId);
          worker.assignedOfficeId = null;
        }
      }
    }

    // --- RESCUE STRANDED WORKERS ---
    // If a worker is idle but NOT at their home residence, they are "lost"
    if (worker.task === 'idle') {
      const home = game.houses.find((h) => h.id === worker.homeHouseId);
      if (home) {
        const dx = worker.x - home.x;
        const dy = worker.y - home.y;
        const distSq = dx * dx + dy * dy;

        // If more than 0.5 units from home tile
        if (distSq > 0.25) {
          worker.stuckTimer += dt;

          // Every 2 seconds, try to find a path home
          if (
            Math.floor(worker.stuckTimer) % 2 === 0 &&
            worker.stuckTimer > 1.0
          ) {
            const route = findPathOnNetwork(
              game.paths,
              { x: Math.round(worker.x), y: Math.round(worker.y) },
              { x: home.x, y: home.y }
            );
            if (route.length) {
              worker.task = 'toHome';
              worker.target = { x: home.x, y: home.y };
              worker.path = route;
              worker.stuckTimer = 0;
            }
          }

          // If stranded for 5+ seconds without a path, just teleport home
          if (worker.stuckTimer > 5.0) {
            worker.x = home.x;
            worker.y = home.y;
            worker.dx = 0;
            worker.dy = 0;
            worker.stuckTimer = 0;
          }
        } else {
          worker.stuckTimer = 0;
        }
      }
    }
  }

  resolveWorkerOverlaps(game);
  for (const worker of game.workers) sanitizeWorkerPosition(game, worker);
}
