import type { Game } from '@core/Game';
import type { Building } from '@entities/Building';
import type { Villager } from '@entities/Villager';
import * as LJS from 'littlejsengine';
import {
  advanceBody,
  applyCrowdAvoidance,
  resolveBodyOverlaps,
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
const LOOKAHEAD_DISTANCE = 2.0 * PX_TO_CELL;
const STEER_ACCEL = 0.02 * PX_TO_CELL;
const LANE_OFFSET = 1.35 * PX_TO_CELL; // Offset to keep villagers in lanes
const MOVE_DAMPING = 0.98;
const IDLE_DAMPING = 0.9;
// Keep villager collider in sync with SVG render radius (r=1.35 in svgRenderer).
const VILLAGER_RADIUS = 1.35 * PX_TO_CELL;
const VILLAGER_DIAMETER = VILLAGER_RADIUS * 2;
const SLOW_DISTANCE = 5.5 * PX_TO_CELL;
const AVOID_DISTANCE = VILLAGER_DIAMETER + 0.8 * PX_TO_CELL;
const COLLISION_DISTANCE = VILLAGER_DIAMETER;
const TURNYNESS = 0.02 * PX_TO_CELL;
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

function getLookaheadTarget(
  position: LJS.Vector2,
  path: Array<{ x: number; y: number }>
): LJS.Vector2 {
  let previous = position;
  let remaining = LOOKAHEAD_DISTANCE;

  for (const node of path) {
    const point = LJS.vec2(node.x, node.y);
    const seg = point.subtract(previous);
    const len = seg.length();
    if (len > 0.0001) {
      if (len >= remaining) {
        return previous.add(seg.normalize().scale(remaining));
      }
      remaining -= len;
    }
    previous = point;
  }

  const last = path[path.length - 1];
  return LJS.vec2(last.x, last.y);
}

function getLaneOffsetVector(
  from: LJS.Vector2,
  to: LJS.Vector2,
  offset: number
): LJS.Vector2 {
  const diff = to.subtract(from);
  const len = diff.length();
  if (len < 0.001) return LJS.vec2(0, 0);
  const dir = diff.scale(1 / len);
  // Perpendicular vector for Right Hand Traffic (RHT)
  return LJS.vec2(dir.y, -dir.x).scale(offset);
}

function steerAlongRoute(_game: Game, villager: Villager): void {
  if (!villager.path.length) return;

  const pos = LJS.vec2(villager.x, villager.y);

  // Proactively skip nodes we are already basically touching
  while (villager.path.length > 1) {
    const node = LJS.vec2(villager.path[0].x, villager.path[0].y);
    if (pos.distance(node) < 0.35) {
      villager.path.shift();
    } else {
      break;
    }
  }

  const target = LJS.vec2(villager.path[0].x, villager.path[0].y);
  const closeEnough =
    villager.path.length === 1 ? CLOSE_ENOUGH_DEST : CLOSE_ENOUGH;
  const dist = pos.distance(target);

  if (dist < closeEnough) {
    const reached = villager.path.shift();
    if (reached) {
      villager.lastReachedPos = { x: reached.x, y: reached.y };
    }
    if (!villager.path.length) {
      villager.x = target.x;
      villager.y = target.y;
      villager.dx = 0;
      villager.dy = 0;
      villager.lastReachedPos = null;
    }
    return;
  }

  if (!villager.lastReachedPos) {
    villager.lastReachedPos = { x: villager.x, y: villager.y };
  }

  const prev = LJS.vec2(villager.lastReachedPos.x, villager.lastReachedPos.y);
  const laneOffset = getLaneOffsetVector(prev, target, LANE_OFFSET);

  // Instead of just shifting the target, we want to steer toward a point on the "lane line"
  const lookaheadTarget = getLookaheadTarget(pos, villager.path);
  let steerTarget = (villager.path.length === 1 ? target : lookaheadTarget).add(
    laneOffset
  );

  const rampCfg: SteeringConfig = {
    ...STEER_CFG,
    minCruiseSpeed: villager.path.length === 1 ? 0 : MIN_CRUISE_SPEED,
    maxSpeed: MAX_SPEED * Math.min(1, dist / ARRIVAL_RADIUS)
  };
  steerToward(villager, steerTarget, rampCfg);
}

function applyVillagerCrowdAvoidance(game: Game, villager: Villager): void {
  const others = game.villagers.filter((o) => o.id !== villager.id);
  applyCrowdAvoidance(villager, others, CROWD_CFG);
}

function assignPeopleToFarmIssues(game: Game): void {
  for (const farm of game.farms) {
    const requiredWorkers = farm.numIssues;

    while (farm.assignedVillagerIds.length < requiredWorkers) {
      const candidates = game.villagers.filter(
        (v) => v.task === 'idle' && v.destinationType === farm.destination
      );
      if (!candidates.length) break;

      let chosen = candidates[0];
      let chosenRoute: Array<{ x: number; y: number }> = [];

      for (const candidate of candidates) {
        const home = game.yurts.find((y) => y.id === candidate.homeYurtId);
        if (!home) continue;

        for (const point of farmPoints(farm)) {
          const route = findPathOnNetwork(
            game.paths,
            { x: home.x, y: home.y },
            { x: point.x, y: point.y }
          );
          if (!route.length) continue;
          if (!chosenRoute.length || route.length < chosenRoute.length) {
            chosen = candidate;
            chosenRoute = route;
          }
        }
      }

      if (!chosenRoute.length) break;

      chosen.task = 'toFarm';
      chosen.target = chosenRoute.at(-1) ?? { x: farm.x, y: farm.y };
      chosen.path = chosenRoute;
      chosen.lastReachedPos = { x: chosen.x, y: chosen.y };
      chosen.originalRouteLength = chosenRoute.length;
      chosen.assignedFarmId = farm.id;
      farm.assignedVillagerIds.push(chosen.id);
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
    const home = game.yurts.find((y) => y.id === villager.homeYurtId);
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
  resolveBodyOverlaps(game.villagers, VILLAGER_DIAMETER);
}

export function updateVillagers(game: Game, dt: number): void {
  assignPeopleToFarmIssues(game);

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

    const speed = Math.hypot(villager.dx, villager.dy);
    if (speed > 0.005) {
      const targetRotation = Math.atan2(villager.dy, villager.dx);
      let diff = targetRotation - (villager.rotation || 0);
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      villager.rotation = (villager.rotation || 0) + diff * 0.25 * dt * 60;
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
        const home = game.yurts.find((y) => y.id === villager.homeYurtId);
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
