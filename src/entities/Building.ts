import * as LJS from 'littlejsengine';
import type { Entity } from './Entity';
import { COLOR_RESOURCES } from '@core/colors';
import { BUILDING_CONFIG, COLOR_CONFIG, DEMAND_CONFIG } from '@core/config';

export type DestinationType = 'red' | 'blue' | 'yellow';
export type StructureRole = 'house' | 'office';

export class Building extends LJS.EngineObject implements Entity {
  readonly id: string;
  readonly type = 'building';
  readonly role: StructureRole;
  readonly destination: DestinationType;
  readonly width: number;
  readonly height: number;
  active: boolean = true;
  // Total demand value (sum of all active demand timers)
  demand: number = 0;
  // Base demand per active demand slot
  needyness: number = 0;
  // Number of demand slots
  numDemand: number = 0;
  // Number of active demand pins
  numIssues: number = 0;
  assignedWorkerIds: string[] = [];
  readonly entrance: { x: number; y: number };
  readonly entryTile: { x: number; y: number };

  // Track demand timers internally without animal objects
  private _demandTimers: number[] = [];

  constructor(
    pos: LJS.Vector2,
    size: LJS.Vector2,
    id: string,
    role: StructureRole,
    destination: DestinationType,
    entrance: { x: number; y: number },
    entryTile?: { x: number; y: number },
    needyness: number = 0,
    numDemand: number = 0
  ) {
    super(pos, size);
    this.id = id;
    this.role = role;
    this.destination = destination;
    this.entrance = entrance;
    this.entryTile = entryTile || {
      x: Math.round(this.x),
      y: Math.round(this.y)
    };
    this.width = size.x;
    this.height = size.y;
    this.needyness = needyness;
    this.numDemand = numDemand;
    this.renderOrder = BUILDING_CONFIG.renderOrder; // Above terrain, below workers

    // Initialize timers for potential demand "slots"
    for (let i = 0; i < numDemand; i++) {
      const { min, max } = BUILDING_CONFIG.initialDemandTimerRange;
      this._demandTimers.push(Math.random() * (max - min) + min);
    }
  }

  get demandTimers() {
    return this._demandTimers;
  }
  set demandTimers(val: number[]) {
    this._demandTimers = val;
  }

  // Compatibility getters/setters
  get x() {
    return this.pos.x - (this.width - 1) / 2;
  }
  set x(val: number) {
    this.pos.x = val + (this.width - 1) / 2;
  }
  get y() {
    return this.pos.y - (this.height - 1) / 2;
  }
  set y(val: number) {
    this.pos.y = val + (this.height - 1) / 2;
  }

  render() {
    if (this.role === 'house') {
      this.renderHouse();
    } else {
      this.renderOffice();
    }
    this.renderDemandPins();
  }

  private static _cachedHousePoints: LJS.Vector2[] = [];
  private _cachedOfficePoints: LJS.Vector2[] = [];
  private _lastRenderSize = LJS.vec2();

  private renderHouse() {
    const destColor = this.getDestinationColor();

    if (Building._cachedHousePoints.length === 0) {
      const segments = 32;
      for (let i = 0; i < segments; i++) {
        Building._cachedHousePoints.push(
          LJS.vec2(0, 0.35).rotate(i * ((Math.PI * 2) / segments))
        );
      }
    }
    // Solid fill with consistent border
    LJS.drawPoly(
      Building._cachedHousePoints,
      destColor,
      COLOR_CONFIG.outlineWidth,
      COLOR_RESOURCES.white,
      this.pos
    );
  }

  private renderOffice() {
    const destColor = this.getDestinationColor();
    const padding = 0.15;
    const r = 0.3;
    const w = this.size.x - padding;
    const h = this.size.y - padding;

    if (
      this._cachedOfficePoints.length === 0 ||
      this._lastRenderSize.x !== this.size.x ||
      this._lastRenderSize.y !== this.size.y
    ) {
      this._lastRenderSize.set(this.size.x, this.size.y);
      this._cachedOfficePoints = [];
      const segments = 8;
      const hw = w / 2;
      const hh = h / 2;

      const corners = [
        { x: hw - r, y: hh - r, start: 0 },
        { x: -hw + r, y: hh - r, start: Math.PI / 2 },
        { x: -hw + r, y: -hh + r, start: Math.PI },
        { x: hw - r, y: -hh + r, start: (3 * Math.PI) / 2 }
      ];

      for (const corner of corners) {
        for (let i = 0; i <= segments; i++) {
          const angle = corner.start + (i / segments) * (Math.PI / 2);
          this._cachedOfficePoints.push(
            LJS.vec2(
              corner.x + Math.cos(angle) * r,
              corner.y + Math.sin(angle) * r
            )
          );
        }
      }
    }

    LJS.drawPoly(
      this._cachedOfficePoints,
      destColor, // Solid fill
      COLOR_CONFIG.outlineWidth,
      COLOR_RESOURCES.white,
      this.pos
    );
  }

  private renderDemandPins() {
    if (this.numIssues <= 0) return;

    const color = COLOR_RESOURCES.black; // Demand pins are dark in MM
    const pinSize = DEMAND_CONFIG.pinSize;
    const spacing = DEMAND_CONFIG.pinSpacing;
    const pinsPerRow = Math.floor((this.width - 0.3) / spacing);

    for (let i = 0; i < this.numIssues; i++) {
      const row = Math.floor(i / pinsPerRow);
      const col = i % pinsPerRow;

      const offsetX =
        (col - (Math.min(this.numIssues, pinsPerRow) - 1) / 2) * spacing;
      const offsetY =
        (row - Math.floor((this.numIssues - 1) / pinsPerRow) / 2) * spacing;

      LJS.drawCircle(this.pos.add(LJS.vec2(offsetX, offsetY)), pinSize, color);
    }
  }

  private getDestinationColor() {
    return this.destination === 'red'
      ? COLOR_RESOURCES.red
      : this.destination === 'blue'
        ? COLOR_RESOURCES.blue
        : this.destination === 'yellow'
          ? COLOR_RESOURCES.yellow
          : COLOR_RESOURCES.ui;
  }

  public forceTestDemand(hasDemand: boolean): void {
    if (hasDemand) {
      this.numIssues = this.numDemand;
      this._demandTimers = this._demandTimers.map(() => 0);
    } else {
      this.numIssues = 0;
      this._demandTimers = this._demandTimers.map(() => 10);
    }
    this.demand = this.numIssues * this.needyness;
  }
}
