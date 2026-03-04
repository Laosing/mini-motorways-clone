import * as LJS from 'littlejsengine';

export interface MovingBody {
  id: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
}

export interface SteeringConfig {
  maxSpeed: number;
  minCruiseSpeed: number;
  arrivalRadius: number;
  steerAccel: number;
  damping: number;
}

export interface AvoidanceConfig {
  slowDistance: number;
  avoidDistance: number;
  collisionDistance: number;
  turniness: number;
  slowdownStrength: number;
  maxSpeed: number;
}

export function steerToward(
  body: MovingBody,
  target: LJS.Vector2,
  cfg: SteeringConfig
): void {
  const pos = LJS.vec2(body.x, body.y);
  const toTarget = target.subtract(pos);
  const dist = toTarget.length();
  const heading = dist > 0.0001 ? toTarget.normalize() : LJS.vec2();
  const speedRamp = Math.min(1, dist / cfg.arrivalRadius);
  const targetSpeed = Math.max(cfg.minCruiseSpeed, cfg.maxSpeed * speedRamp);
  const desiredVelocity = heading.scale(targetSpeed);
  const currentVelocity = LJS.vec2(body.dx, body.dy);
  const steer = desiredVelocity.subtract(currentVelocity);
  const steerLen = steer.length();
  const steerStep =
    steerLen > cfg.steerAccel ? steer.normalize().scale(cfg.steerAccel) : steer;
  const nextVelocity = currentVelocity.add(steerStep).scale(cfg.damping);

  body.dx = nextVelocity.x;
  body.dy = nextVelocity.y;

  clampBodySpeed(body, cfg.maxSpeed);
}

export function applyCrowdAvoidance(
  body: MovingBody,
  others: MovingBody[],
  cfg: AvoidanceConfig
): void {
  let separation = LJS.vec2();
  let slowdownFactor = 1;
  let brakeFactor = 0;
  const selfPos = LJS.vec2(body.x, body.y);
  const selfVel = LJS.vec2(body.dx, body.dy);
  const velLen = selfVel.length();
  const heading = velLen > 0.001 ? selfVel.normalize() : LJS.vec2();

  for (const other of others) {
    if (other.id === body.id) continue;
    const otherPos = LJS.vec2(other.x, other.y);
    const delta = selfPos.subtract(otherPos);
    const dist = delta.length();
    if (dist < 0.0001) continue;

    // Repulsion at very close range
    if (dist < cfg.collisionDistance) {
      const push = delta
        .normalize()
        .scale((cfg.collisionDistance - dist) * 0.7);
      separation = separation.add(push);
    } else if (dist < cfg.avoidDistance) {
      // Gentle lateral nudge
      const n = delta.normalize();
      const lateral = LJS.vec2(-n.y, n.x).scale(cfg.turniness);
      separation = separation.add(lateral);
    }

    // Proactive braking if someone is in front of us
    if (dist < cfg.slowDistance && velLen > 0) {
      const toOther = otherPos.subtract(selfPos).normalize();
      const dot = heading.dot(toOther);
      if (dot > 0.8) {
        // They are directly in front of us
        const t = (cfg.slowDistance - dist) / cfg.slowDistance;
        brakeFactor = Math.max(brakeFactor, t * 0.5); // Less aggressive braking
      }

      const t = (cfg.slowDistance - dist) / cfg.slowDistance;
      slowdownFactor = Math.min(slowdownFactor, 1 - t * cfg.slowdownStrength);
    }
  }

  const adjusted = selfVel.add(separation);
  const finalSlowdown = slowdownFactor * (1 - brakeFactor);
  body.dx = adjusted.x * finalSlowdown;
  body.dy = adjusted.y * finalSlowdown;

  clampBodySpeed(body, cfg.maxSpeed);
}

export function applyTrafficFlow(
  body: MovingBody,
  others: MovingBody[],
  laneDir: LJS.Vector2,
  cfg: AvoidanceConfig
): void {
  let brakeFactor = 0;
  let slowdownFactor = 1;
  const selfPos = LJS.vec2(body.x, body.y);
  const selfVel = LJS.vec2(body.dx, body.dy);

  const laneHeading =
    laneDir.length() > 0.001 ? laneDir.normalize() : LJS.vec2();

  for (const other of others) {
    if (other.id === body.id) continue;
    const otherPos = LJS.vec2(other.x, other.y);
    const delta = otherPos.subtract(selfPos);
    const dist = delta.length();
    if (dist > cfg.slowDistance) continue;

    const project = delta.dot(laneHeading);
    const lateralDir = delta.subtract(laneHeading.scale(project));
    const lateralDist = lateralDir.length();

    // Narrow corridor for lane-following
    const isInLane = lateralDist < cfg.collisionDistance * 0.75;

    if (project > 0 && project < cfg.slowDistance && isInLane) {
      // Direct lead 'car' detection
      const gap = project;
      if (gap < cfg.collisionDistance) {
        brakeFactor = 1; // Emergency stop
      } else {
        const t =
          (cfg.slowDistance - gap) / (cfg.slowDistance - cfg.collisionDistance);
        brakeFactor = Math.max(brakeFactor, Math.min(1, t * 0.8));
      }
    }

    // General proximity slowdown (merging/intersections)
    if (dist < cfg.avoidDistance) {
      const mergeFactor = (cfg.avoidDistance - dist) / cfg.avoidDistance;
      slowdownFactor = Math.min(slowdownFactor, 1 - mergeFactor * 0.3);
    }
  }

  const finalSpeedMult = slowdownFactor * (1 - brakeFactor);
  body.dx *= finalSpeedMult;
  body.dy *= finalSpeedMult;
}

export function advanceBody(
  body: MovingBody,
  dt: number,
  tickScale = 60
): void {
  const scale = dt * tickScale;
  body.x += body.dx * scale;
  body.y += body.dy * scale;
}

export function resolveBodyOverlaps(
  bodies: MovingBody[],
  minDistance: number,
  seedForPair?: (a: MovingBody, b: MovingBody) => number
): void {
  for (let i = 0; i < bodies.length; i += 1) {
    for (let j = i + 1; j < bodies.length; j += 1) {
      const a = bodies[i];
      const b = bodies[j];
      const delta = LJS.vec2(a.x - b.x, a.y - b.y);
      let dist = delta.length();
      if (dist >= minDistance) continue;

      let normal = delta;
      if (dist < 0.0001) {
        const phase = seedForPair ? seedForPair(a, b) : 0;
        normal = LJS.vec2(Math.cos(phase), Math.sin(phase));
        dist = 0;
      } else {
        normal = normal.scale(1 / dist);
      }

      const pushAmount = (minDistance - dist) * 0.5;
      const push = normal.scale(pushAmount);
      a.x += push.x;
      a.y += push.y;
      b.x -= push.x;
      b.y -= push.y;
    }
  }
}

function clampBodySpeed(body: MovingBody, maxSpeed: number): void {
  const speed = Math.hypot(body.dx, body.dy);
  if (speed <= maxSpeed) return;
  const n = LJS.vec2(body.dx, body.dy).normalize().scale(maxSpeed);
  body.dx = n.x;
  body.dy = n.y;
}
