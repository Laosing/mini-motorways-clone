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

function applyVillagerCrowdAvoidance(game: Game, villager: Villager): void {
  getNearbyVillagers(
    game,
    villager.x,
    villager.y,
    AVOID_DISTANCE,
    _nearbyBuffer
  );
  applyCrowdAvoidance(villager, _nearbyBuffer, CROWD_CFG);
}

function assignPeopleToFarmIssues(game: Game): void {
  for (const farm of game.farms) {
    const requiredWorkers = farm.numIssues;

    while (farm.assignedVillagerIds.length < requiredWorkers) {
      const candidates = game.villagers.filter(
        (v) => v.task === 'idle' && v.destinationType === farm.destination
      );
      if (!candidates.length) break;

      // Heuristic: identify candidate homes closest to the farm
      const farmCenterX = farm.x + farm.width / 2;
      const farmCenterY = farm.y + farm.height / 2;

      const scoredCandidates = candidates
        .map((v) => {
          const home = game.houses.find((y) => y.id === v.homeHouseId);
          if (!home) return { v, d2: Infinity };
          const dx = farmCenterX - home.x;
          const dy = farmCenterY - home.y;
          return { v, d2: dx * dx + dy * dy };
        })
        .filter((c) => c.d2 !== Infinity)
        .sort((a, b) => a.d2 - b.d2);

      let foundAny = false;
      // Try top candidates to avoid deep search on giant populations
      for (let i = 0; i < Math.min(scoredCandidates.length, 5); i++) {
        const candidate = scoredCandidates[i].v;
        const home = game.houses.find((y) => y.id === candidate.homeHouseId)!;

        // Try points in the farm
        const points = farmPoints(farm);
        for (const point of points) {
          const route = findPathOnNetwork(
            game.paths,
            { x: Math.round(home.x), y: Math.round(home.y) },
            { x: point.x, y: point.y }
          );

          if (route.length) {
            candidate.task = 'toFarm';
            candidate.target = route.at(-1) ?? { x: point.x, y: point.y };
            candidate.path = route;
            candidate.lastReachedPos = { x: candidate.x, y: candidate.y };
            candidate.originalRouteLength = route.length;
            candidate.assignedFarmId = farm.id;
            farm.assignedVillagerIds.push(candidate.id);
            foundAny = true;
            break;
          }
        }
        if (foundAny) break;
      }

      if (!foundAny) break;
    }
  }
}

function farmPoints(farm: Building): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  for (let x = 0; x < farm.width; x += 1) {
    for (let y = 0; y < farm.height; y += 1) {
      points.push({ x: farm.x + x, y: farm.y + y });
    }
  }
  return points;
}

function unassignFromFarm(
  game: Game,
  villagerId: string,
  farmId: string | null
): void {
  if (!farmId) return;
  const farm = game.farms.find((f) => f.id === farmId);
  if (!farm) return;
  farm.assignedVillagerIds = farm.assignedVillagerIds.filter(
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
    unassignFromFarm(game, villager.id, villager.assignedFarmId);
    villager.assignedFarmId = null;
    return;
  }

  villager.x = Math.min(maxX, Math.max(0, villager.x));
  villager.y = Math.min(maxY, Math.max(0, villager.y));
}

function resolveVillagerOverlaps(game: Game): void {
  for (let i = 0; i < game.villagers.length; i++) {
    const a = game.villagers[i];
    getNearbyVillagers(game, a.x, a.y, VILLAGER_DIAMETER, _nearbyBuffer);
    resolveBodyOverlapsSingle(a, _nearbyBuffer, VILLAGER_DIAMETER);
  }
}

export function updateVillagers(game: Game, dt: number): void {
  updateSpatialGrid(game);
  // Only check for new assignments every 10 frames to save CPU
  if (game.updateCount % 10 === 0) {
    assignPeopleToFarmIssues(game);
  }

  for (const villager of game.villagers) {
    if (villager.task === 'idle' || villager.task === 'atFarm') {
      villager.dx *= IDLE_DAMPING;
      villager.dy *= IDLE_DAMPING;
    }

    if (villager.task === 'toFarm' || villager.task === 'toHome') {
      steerAlongRoute(game, villager);
      applyVillagerCrowdAvoidance(game, villager);
    }

    advanceBody(villager, dt);
    sanitizeVillagerPosition(game, villager);

    // Stuck detection logic
    if (villager.task === 'toFarm' || villager.task === 'toHome') {
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
        // We've been practically stationary for 2 seconds while on a task
        // Attempt to "unjam" by nudging toward the target or resetting to the last valid node
        if (villager.path.length > 0) {
          const node = villager.path[0];
          // Teleport slightly toward node or just nudge hard
          const nx = node.x - villager.x;
          const ny = node.y - villager.y;
          const mag = Math.sqrt(nx * nx + ny * ny);
          if (mag > 0.001) {
            villager.x += (nx / mag) * 0.1;
            villager.y += (ny / mag) * 0.1;
          }
          // If still stuck after more time, just skip this node
          if (villager.stuckTimer > 4.0) {
            villager.path.shift();
            villager.stuckTimer = 1.0;
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
      (villager.task === 'toFarm' || villager.task === 'toHome') &&
      !villager.path.length &&
      villager.target
    ) {
      if (villager.task === 'toFarm') {
        const farm = game.farms.find((f) => f.id === villager.assignedFarmId);
        if (farm) {
          villager.x = villager.target.x;
          villager.y = villager.target.y;
          villager.dx = 0;
          villager.dy = 0;
          game.consumeFarmIssue(farm);
          game.servedTrips += 1;
          villager.task = 'atFarm';
          villager.lastReachedPos = null;
          villager.waitTimer = 1.2;
        } else {
          villager.task = 'idle';
          villager.lastReachedPos = null;
          unassignFromFarm(game, villager.id, villager.assignedFarmId);
          villager.assignedFarmId = null;
        }
      } else {
        villager.x = villager.target.x;
        villager.y = villager.target.y;
        villager.dx = 0;
        villager.dy = 0;
        villager.task = 'idle';
        villager.lastReachedPos = null;
        unassignFromFarm(game, villager.id, villager.assignedFarmId);
        villager.assignedFarmId = null;
      }
      villager.target = null;
    }

    if (villager.task === 'atFarm') {
      villager.waitTimer -= dt;
      if (villager.waitTimer <= 0) {
        const home = game.houses.find((y) => y.id === villager.homeHouseId);
        if (!home) {
          villager.task = 'idle';
          unassignFromFarm(game, villager.id, villager.assignedFarmId);
          villager.assignedFarmId = null;
          continue;
        }

        // Use the actual farm location as the path start, since we might have been pushed
        // slightly off the path node by crowds while working.
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
          villager.task = 'idle';
          villager.target = null;
          villager.path = [];
          unassignFromFarm(game, villager.id, villager.assignedFarmId);
          villager.assignedFarmId = null;
        }
      }
    }
  }

  resolveVillagerOverlaps(game);
  for (const villager of game.villagers)
    sanitizeVillagerPosition(game, villager);
}
