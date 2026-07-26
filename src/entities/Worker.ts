import * as LJS from 'littlejsengine';
import type { Entity } from './Entity';
import type { DestinationType } from './Building';
import { COLOR_RESOURCES } from '@core/colors';
import { WORKER_CONFIG } from '@core/config';

export type WorkerTask = 'idle' | 'toOffice' | 'atOffice' | 'toHome';

export class Worker extends LJS.EngineObject implements Entity {
  readonly id: string;
  readonly type = 'worker';
  speed: number = WORKER_CONFIG.speed;
  task: WorkerTask = 'idle';
  homeHouseId: string;
  destinationType: DestinationType;
  target: { x: number; y: number } | null = null;
  path: Array<{ x: number; y: number }> = [];
  waitTimer: number = WORKER_CONFIG.waitTimer;
  assignedOfficeId: string | null = null;
  parkingSpotIndex: number | null = null;
  officeEntry: { x: number; y: number } | null = null;
  originalRouteLength: number = 0;
  lastReachedPos: { x: number; y: number } | null = null;
  stuckTimer: number = 0;
  lastPosForStuck: { x: number; y: number } | null = null;

  constructor(
    pos: LJS.Vector2,
    id: string,
    homeHouseId: string,
    destinationType: DestinationType
  ) {
    // Engine footprint remains independent from the custom rendered body.
    super(pos, LJS.vec2(WORKER_CONFIG.size, WORKER_CONFIG.size));
    this.id = id;
    this.homeHouseId = homeHouseId;
    this.destinationType = destinationType;
    this.renderOrder = WORKER_CONFIG.renderOrder; // Above everything else
  }

  // Compatibility getters/setters for existing systems
  get x() {
    return this.pos.x;
  }
  set x(val: number) {
    this.pos.x = val;
  }
  get y() {
    return this.pos.y;
  }
  set y(val: number) {
    this.pos.y = val;
  }
  get dx() {
    return this.velocity.x;
  }
  set dx(val: number) {
    this.velocity.x = val;
  }
  get dy() {
    return this.velocity.y;
  }
  set dy(val: number) {
    this.velocity.y = val;
  }
  get rotation() {
    return this.angle;
  }
  set rotation(val: number) {
    this.angle = val;
  }

  update() {
    super.update();
  }

  // Position and velocity are integrated by taskSystem's fixed-step movement.
  // LittleJS calls this separately each rendered frame, so its default physics
  // would otherwise apply worker velocity a second time.
  updatePhysics() {}

  private static _cachedBodySize = LJS.vec2();
  private static _cachedOffset = LJS.vec2();
  private static _cachedPos = LJS.vec2();

  render() {
    const color =
      this.destinationType === 'red'
        ? COLOR_RESOURCES.red
        : this.destinationType === 'blue'
          ? COLOR_RESOURCES.blue
          : this.destinationType === 'yellow'
            ? COLOR_RESOURCES.yellow
            : COLOR_RESOURCES.ui;

    // Render shadow
    Worker._cachedOffset.set(0.02, -0.02);
    Worker._cachedPos.set(
      this.pos.x + Worker._cachedOffset.x,
      this.pos.y + Worker._cachedOffset.y
    );
    LJS.drawCircle(Worker._cachedPos, 0.15, COLOR_RESOURCES.shadow);

    // Render body
    Worker._cachedBodySize.set(0.3, 0.3);
    LJS.drawEllipse(this.pos, Worker._cachedBodySize, color, this.angle);
  }
}
