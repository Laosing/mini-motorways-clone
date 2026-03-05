import * as LJS from 'littlejsengine';
import { COLORS, COLOR_RESOURCES } from '@core/colors';
import type { Building, DestinationType } from './Building';

const PX_TO_CELL = 1 / 8; // Each cell is 8 SVG-pixels wide

function hexToColor(hex: string): LJS.Color {
  return new LJS.Color().setHex(hex);
}

export class FarmAnimal extends LJS.EngineObject {
  readonly animalId: string;
  readonly kind: DestinationType;
  readonly farm: Building;

  // Motion targets relative to farm top-left (in SVG pixels)
  tx: number;
  ty: number;

  // Motion settings
  moveChance = 0.998;
  moveSpeed = 0.045 * PX_TO_CELL; // Cell units per frame at 60fps
  rotateSpeed = 0.06;

  hasDemand = false;

  // Custom scale for animation
  currentScale = 0;

  constructor(
    farm: Building,
    animalId: string,
    initialSvgX: number,
    initialSvgY: number
  ) {
    super(
      LJS.vec2(
        farm.x - 0.5 + initialSvgX * PX_TO_CELL,
        farm.y - 0.5 + initialSvgY * PX_TO_CELL
      ),
      LJS.vec2(3.3 * PX_TO_CELL, 2.1 * PX_TO_CELL)
    );

    this.farm = farm;
    this.animalId = animalId;
    this.kind = farm.destination;
    this.angle = LJS.rand(0, Math.PI * 2);

    this.tx = initialSvgX;
    this.ty = initialSvgY;

    // Set renderOrder to be above terrain
    this.renderOrder = 10;

    // Spawn animation
    setTimeout(() => {
      this.currentScale = 1;
    }, 100);
  }

  update() {
    // 1. Target picking (Wander)
    const padding = 2.5;
    const rangeX = this.farm.width * 8; // in SVG pixels
    const rangeY = this.farm.height * 8;
    const dt = LJS.timeDelta * 60; // Normalize for 60fps logic

    if (LJS.rand() > this.moveChance) {
      this.tx = LJS.rand(padding, rangeX - padding);
      this.ty = LJS.rand(padding, rangeY - padding);
    }

    // 2. Convert current world pos to relative SVG pixels for target comparison
    const relX = (this.pos.x - (this.farm.x - 0.5)) * 8;
    const relY = (this.pos.y - (this.farm.y - 0.5)) * 8;

    const steerX = this.tx - relX;
    const steerY = this.ty - relY;
    const distSq = steerX * steerX + steerY * steerY;

    if (distSq > 0.25) {
      const heading = LJS.vec2(steerX, steerY).normalize();
      const desiredVel = heading.scale(this.moveSpeed);
      const steer = desiredVel.subtract(this.velocity);

      this.velocity = this.velocity.add(steer.scale(0.04 * dt));
    } else {
      this.velocity = this.velocity.scale(Math.pow(0.9, dt));
    }

    // 3. organic avoidance
    for (const other of LJS.engineObjects) {
      if (other === this || !(other instanceof FarmAnimal)) continue;
      const delta = this.pos.subtract(other.pos);
      const dSq = delta.lengthSquared();
      const avoidDist = 4.5 * PX_TO_CELL;
      if (dSq < avoidDist * avoidDist && dSq > 0.0001) {
        const dist = Math.sqrt(dSq);
        const force = (avoidDist - dist) * 0.012 * dt * PX_TO_CELL;
        this.velocity = this.velocity.add(delta.normalize().scale(force));
      }
    }

    // 4. Boundary pushes
    if (relX < padding) this.velocity.x += 0.02 * dt * PX_TO_CELL;
    if (relX > rangeX - padding) this.velocity.x -= 0.02 * dt * PX_TO_CELL;
    if (relY < padding) this.velocity.y += 0.02 * dt * PX_TO_CELL;
    if (relY > rangeY - padding) this.velocity.y -= 0.02 * dt * PX_TO_CELL;

    // 5. Apply damping
    this.velocity = this.velocity.scale(Math.pow(0.92, dt));

    super.update(); // Move based on velocity

    // 6. Hard constraint
    const finalRelX = LJS.clamp(
      (this.pos.x - (this.farm.x - 0.5)) * 8,
      padding,
      rangeX - padding
    );
    const finalRelY = LJS.clamp(
      (this.pos.y - (this.farm.y - 0.5)) * 8,
      padding,
      rangeY - padding
    );
    this.pos = LJS.vec2(
      this.farm.x - 0.5 + finalRelX * PX_TO_CELL,
      this.farm.y - 0.5 + finalRelY * PX_TO_CELL
    );

    // 7. Rotation
    if (this.velocity.lengthSquared() > 0.00001) {
      const targetRotation = Math.atan2(this.velocity.y, this.velocity.x);
      let diff = targetRotation - this.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.angle += diff * 0.08 * dt;
    }
  }

  private static _cachedRenderSize = LJS.vec2();
  private static _cachedHeadColor = new LJS.Color();
  private static _cachedFrontOffset = LJS.vec2();
  private static _cachedHornSize = LJS.vec2();
  private static _cachedEyeOffset = LJS.vec2();
  private static _cachedBubblePos = LJS.vec2();
  private static _cachedBubbleRectPos = LJS.vec2();
  private static _cachedBubbleRectSize = LJS.vec2();
  private static _cachedBubbleCirclePos = LJS.vec2();

  render() {
    if (this.currentScale <= 0) return;

    const color =
      this.kind === 'fish'
        ? COLOR_RESOURCES.fish
        : this.kind === 'ox'
          ? COLOR_RESOURCES.ox
          : COLOR_RESOURCES.goat;

    // Breathing scale
    const s = this.currentScale * (1 + Math.sin(LJS.time * 5) * 0.03);
    FarmAnimal._cachedRenderSize.set(this.size.x * s, this.size.y * s);

    // Draw body
    LJS.drawRect(this.pos, FarmAnimal._cachedRenderSize, color, this.angle);

    // Draw specific features
    const cosAngle = Math.cos(-this.angle);
    const sinAngle = Math.sin(-this.angle);

    if (this.kind === 'ox') {
      const lx = FarmAnimal._cachedRenderSize.x * 0.4;
      const ly = 0;
      FarmAnimal._cachedFrontOffset.set(
        lx * cosAngle - ly * sinAngle,
        lx * sinAngle + ly * cosAngle
      );

      FarmAnimal._cachedHornSize.set(
        0.3 * PX_TO_CELL * s,
        1.2 * PX_TO_CELL * s
      );
      FarmAnimal._cachedBubblePos.set(
        this.pos.x + FarmAnimal._cachedFrontOffset.x,
        this.pos.y + FarmAnimal._cachedFrontOffset.y
      );
      LJS.drawRect(
        FarmAnimal._cachedBubblePos,
        FarmAnimal._cachedHornSize,
        COLOR_RESOURCES.oxHorn,
        this.angle
      );
    } else if (this.kind === 'goat') {
      const lx = FarmAnimal._cachedRenderSize.x * 0.4;
      const ly = 0;
      FarmAnimal._cachedFrontOffset.set(
        lx * cosAngle - ly * sinAngle,
        lx * sinAngle + ly * cosAngle
      );

      FarmAnimal._cachedBubblePos.set(
        this.pos.x + FarmAnimal._cachedFrontOffset.x,
        this.pos.y + FarmAnimal._cachedFrontOffset.y
      );
      LJS.drawCircle(
        FarmAnimal._cachedBubblePos,
        0.85 * PX_TO_CELL * s,
        COLOR_RESOURCES.ui,
        0
      );
    } else if (this.kind === 'fish') {
      const lx = FarmAnimal._cachedRenderSize.x * 0.3;
      const ly = 0;
      FarmAnimal._cachedFrontOffset.set(
        lx * cosAngle - ly * sinAngle,
        lx * sinAngle + ly * cosAngle
      );

      // Use cached head color
      FarmAnimal._cachedHeadColor.set(
        LJS.clamp(color.r + 0.1),
        LJS.clamp(color.g + 0.1),
        LJS.clamp(color.b + 0.1),
        color.a
      );

      // Head shape
      FarmAnimal._cachedBubblePos.set(
        this.pos.x + FarmAnimal._cachedFrontOffset.x,
        this.pos.y + FarmAnimal._cachedFrontOffset.y
      );
      LJS.drawCircle(
        FarmAnimal._cachedBubblePos,
        0.8 * PX_TO_CELL * s,
        FarmAnimal._cachedHeadColor,
        0
      );
      // eye
      const ex = FarmAnimal._cachedRenderSize.x * 0.45;
      const ey = 0.2 * PX_TO_CELL * s;
      FarmAnimal._cachedEyeOffset.set(
        ex * cosAngle - ey * sinAngle,
        ex * sinAngle + ey * cosAngle
      );

      FarmAnimal._cachedBubblePos.set(
        this.pos.x + FarmAnimal._cachedEyeOffset.x,
        this.pos.y + FarmAnimal._cachedEyeOffset.y
      );
      LJS.drawCircle(
        FarmAnimal._cachedBubblePos,
        0.15 * PX_TO_CELL * s,
        COLOR_RESOURCES.black
      );
    }

    if (this.hasDemand) {
      FarmAnimal._cachedBubblePos.set(this.pos.x, this.pos.y + 0.5 * s);
      LJS.drawCircle(
        FarmAnimal._cachedBubblePos,
        0.15 * s,
        COLOR_RESOURCES.white
      );
      FarmAnimal._cachedBubbleRectPos.set(
        FarmAnimal._cachedBubblePos.x,
        FarmAnimal._cachedBubblePos.y + 0.03 * s
      );
      FarmAnimal._cachedBubbleRectSize.set(0.04 * s, 0.12 * s);
      LJS.drawRect(
        FarmAnimal._cachedBubbleRectPos,
        FarmAnimal._cachedBubbleRectSize,
        COLOR_RESOURCES.red
      );
      FarmAnimal._cachedBubbleCirclePos.set(
        FarmAnimal._cachedBubblePos.x,
        FarmAnimal._cachedBubblePos.y - 0.08 * s
      );
      LJS.drawCircle(
        FarmAnimal._cachedBubbleCirclePos,
        0.02 * s,
        COLOR_RESOURCES.red
      );
    }
  }
}
