import * as LJS from 'littlejsengine';
import type { Entity } from './Entity';
import { COLORS, COLOR_RESOURCES } from '@core/colors';

export type DestinationType = 'ox' | 'goat' | 'fish';
export type StructureRole = 'house' | 'farm';

export class Building extends LJS.EngineObject implements Entity {
  readonly id: string;
  readonly type = 'building';
  readonly role: StructureRole;
  readonly destination: DestinationType;
  readonly width: number;
  readonly height: number;
  active: boolean = true;
  demand: number = 0;
  needyness: number = 0;
  numAnimals: number = 0;
  numIssues: number = 0; // This will now represent active demand pins
  assignedVillagerIds: string[] = [];
  readonly entrance: { x: number; y: number };

  // Track demand timers internally without animal objects
  private _demandTimers: number[] = [];

  constructor(
    pos: LJS.Vector2,
    size: LJS.Vector2,
    id: string,
    role: StructureRole,
    destination: DestinationType,
    entrance: { x: number; y: number },
    needyness: number = 0,
    numAnimals: number = 0
  ) {
    super(pos, size);
    this.id = id;
    this.role = role;
    this.destination = destination;
    this.entrance = entrance;
    this.width = size.x;
    this.height = size.y;
    this.needyness = needyness;
    this.numAnimals = numAnimals;
    this.renderOrder = 5; // Above terrain, below villagers

    // Initialize timers for potential demand "slots"
    for (let i = 0; i < numAnimals; i++) {
      this._demandTimers.push(Math.random() * 10 + 5);
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
      this.renderFarm();
    }
    this.renderDemandPins();
  }

  private static _cachedHousePoints: LJS.Vector2[] = [];
  private _cachedFarmPoints: LJS.Vector2[] = [];
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
      COLORS.outlineWidth,
      COLOR_RESOURCES.white,
      this.pos
    );
  }

  private renderFarm() {
    const destColor = this.getDestinationColor();
    const padding = 0.15;
    const r = 0.3;
    const w = this.size.x - padding;
    const h = this.size.y - padding;

    if (
      this._cachedFarmPoints.length === 0 ||
      this._lastRenderSize.x !== this.size.x ||
      this._lastRenderSize.y !== this.size.y
    ) {
      this._lastRenderSize.set(this.size.x, this.size.y);
      this._cachedFarmPoints = [];
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
          this._cachedFarmPoints.push(
            LJS.vec2(
              corner.x + Math.cos(angle) * r,
              corner.y + Math.sin(angle) * r
            )
          );
        }
      }
    }

    LJS.drawPoly(
      this._cachedFarmPoints,
      destColor, // Solid fill
      COLORS.outlineWidth,
      COLOR_RESOURCES.white,
      this.pos
    );
  }

  private renderDemandPins() {
    if (this.numIssues <= 0) return;

    const color = COLOR_RESOURCES.black; // Demand pins are dark in MM
    const pinSize = 0.1;
    const spacing = 0.22;
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
    return this.destination === 'ox'
      ? COLOR_RESOURCES.ox
      : this.destination === 'goat'
        ? COLOR_RESOURCES.goat
        : this.destination === 'fish'
          ? COLOR_RESOURCES.fish
          : COLOR_RESOURCES.ui;
  }

  public forceTestDemand(hasDemand: boolean): void {
    if (hasDemand) {
      this.numIssues = this.numAnimals;
      this._demandTimers = this._demandTimers.map(() => 0);
    } else {
      this.numIssues = 0;
      this._demandTimers = this._demandTimers.map(() => 10);
    }
    this.demand = this.numIssues * this.needyness;
  }
}
