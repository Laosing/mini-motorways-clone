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

// Cached vectors for zero-allocation physics
const _v1 = LJS.vec2();
const _v2 = LJS.vec2();
const _v3 = LJS.vec2();
const _v4 = LJS.vec2();
const _v5 = LJS.vec2();
const _v6 = LJS.vec2();
const _v7 = LJS.vec2();

export function steerToward(
  body: MovingBody,
  target: LJS.Vector2,
  cfg: SteeringConfig
): void {
  // Use _v1 for pos, _v2 for toTarget
  _v1.set(body.x, body.y);
  _v2.set(target.x - _v1.x, target.y - _v1.y);
  const dist = _v2.length();

  if (dist > 0.0001) {
    const invDist = 1 / dist;
    _v2.x *= invDist;
    _v2.y *= invDist;
  } else {
    _v2.set(0, 0);
  }

  const speedRamp = Math.min(1, dist / cfg.arrivalRadius);
  const targetSpeed = Math.max(cfg.minCruiseSpeed, cfg.maxSpeed * speedRamp);

  // _v2 is now heading, reuse it for desiredVelocity
  _v2.x *= targetSpeed;
  _v2.y *= targetSpeed;

  // _v3 for currentVelocity, _v4 for steer
  _v3.set(body.dx, body.dy);
  _v4.set(_v2.x - _v3.x, _v2.y - _v3.y);

  const steerLen = _v4.length();
  if (steerLen > cfg.steerAccel) {
    const invSteerLen = cfg.steerAccel / steerLen;
    _v4.x *= invSteerLen;
    _v4.y *= invSteerLen;
  }

  // Update body directly
  body.dx = (_v3.x + _v4.x) * cfg.damping;
  body.dy = (_v3.y + _v4.y) * cfg.damping;

  clampBodySpeed(body, cfg.maxSpeed);
}

export function applyCrowdAvoidance(
  body: MovingBody,
  others: MovingBody[],
  cfg: AvoidanceConfig
): void {
  // _v1: separation, _v2: selfPos, _v3: selfVel, _v4: heading
  _v1.set(0, 0);
  let slowdownFactor = 1;
  let brakeFactor = 0;

  _v2.set(body.x, body.y);
  _v3.set(body.dx, body.dy);
  const velLen = _v3.length();

  if (velLen > 0.001) {
    const invVelLen = 1 / velLen;
    _v4.set(_v3.x * invVelLen, _v3.y * invVelLen);
  } else {
    _v4.set(0, 0);
  }

  for (let i = 0; i < others.length; i++) {
    const other = others[i];
    if (other.id === body.id) continue;

    // _v5: delta
    _v5.set(_v2.x - other.x, _v2.y - other.y);
    const distSq = _v5.x * _v5.x + _v5.y * _v5.y;
    if (distSq < 0.00001 || distSq > cfg.slowDistance * cfg.slowDistance)
      continue;

    const dist = Math.sqrt(distSq);
    const invDist = 1 / dist;

    // Repulsion at very close range
    if (dist < cfg.collisionDistance) {
      const push = (cfg.collisionDistance - dist) * 0.3 * invDist;
      _v1.x += _v5.x * push;
      _v1.y += _v5.y * push;
    } else if (dist < cfg.avoidDistance) {
      // Gentle lateral nudge - reuse _v5 for normal, then lateral
      const nx = _v5.x * invDist;
      const ny = _v5.y * invDist;
      _v1.x += -ny * cfg.turniness;
      _v1.y += nx * cfg.turniness;
    }

    // Proactive braking if someone is in front of us
    if (dist < cfg.slowDistance && velLen > 0) {
      // _v6: toOtherDir (normalized)
      const tox = (other.x - _v2.x) * invDist;
      const toy = (other.y - _v2.y) * invDist;
      const dot = _v4.x * tox + _v4.y * toy;

      if (dot > 0.8) {
        const t = (cfg.slowDistance - dist) / cfg.slowDistance;
        brakeFactor = Math.max(brakeFactor, t * 0.3); // Softer braking
      }

      const t = (cfg.slowDistance - dist) / cfg.slowDistance;
      slowdownFactor = Math.min(slowdownFactor, 1 - t * cfg.slowdownStrength);
    }
  }

  const finalSlowdown = slowdownFactor * (1 - brakeFactor);
  body.dx = (_v3.x + _v1.x) * finalSlowdown;
  body.dy = (_v3.y + _v1.y) * finalSlowdown;

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
  _v1.set(body.x, body.y); // selfPos
  _v2.set(laneDir.x, laneDir.y); // laneHeading
  const laneLen = _v2.length();
  if (laneLen > 0.001) {
    _v2.x /= laneLen;
    _v2.y /= laneLen;
  }

  for (const other of others) {
    if (other.id === body.id) continue;
    _v3.set(other.x - _v1.x, other.y - _v1.y); // delta
    const dist = _v3.length();
    if (dist > cfg.slowDistance) continue;

    const project = _v3.x * _v2.x + _v3.y * _v2.y; // delta.dot(laneHeading)
    // lateralDelta = delta - laneHeading * project
    const latX = _v3.x - _v2.x * project;
    const latY = _v3.y - _v2.y * project;
    const lateralDist = Math.sqrt(latX * latX + latY * latY);

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

export function resolveBodyOverlapsSingle(
  body: MovingBody,
  others: MovingBody[],
  minDistance: number
): void {
  for (let i = 0; i < others.length; i++) {
    const other = others[i];
    if (other.id === body.id) continue;

    const dx = body.x - other.x;
    const dy = body.y - other.y;
    const distSq = dx * dx + dy * dy;
    if (distSq >= minDistance * minDistance) continue;

    const dist = Math.sqrt(distSq);
    let nx, ny;
    if (dist < 0.0001) {
      nx = 1;
      ny = 0;
    } else {
      nx = dx / dist;
      ny = dy / dist;
    }

    const pushAmount = (minDistance - dist) * 0.1; // Softer push
    body.x += nx * pushAmount;
    body.y += ny * pushAmount;
    other.x -= nx * pushAmount;
    other.y -= ny * pushAmount;
  }
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
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const distSq = dx * dx + dy * dy;
      if (distSq >= minDistance * minDistance) continue;

      const dist = Math.sqrt(distSq);
      let nx, ny;
      if (dist < 0.0001) {
        const phase = seedForPair ? seedForPair(a, b) : 0;
        nx = Math.cos(phase);
        ny = Math.sin(phase);
      } else {
        nx = dx / dist;
        ny = dy / dist;
      }

      const pushAmount = (minDistance - dist) * 0.2;
      a.x += nx * pushAmount;
      a.y += ny * pushAmount;
      b.x -= nx * pushAmount;
      b.y -= ny * pushAmount;
    }
  }
}

function clampBodySpeed(body: MovingBody, maxSpeed: number): void {
  const speedSq = body.dx * body.dx + body.dy * body.dy;
  if (speedSq <= maxSpeed * maxSpeed) return;
  const invSpeed = maxSpeed / Math.sqrt(speedSq);
  body.dx *= invSpeed;
  body.dy *= invSpeed;
}
