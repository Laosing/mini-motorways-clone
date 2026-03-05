import * as LJS from 'littlejsengine';
import type { Entity } from './Entity';
import { COLORS, COLOR_RESOURCES } from '@core/colors';

export type DestinationType = 'ox' | 'goat' | 'fish';
export type StructureRole = 'house' | 'farm';

export interface FarmAnimalState {
  id: string;
  demandTimer: number;
  hasDemand: boolean;
}

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
  numIssues: number = 0;
  assignedVillagerIds: string[] = [];
  animals?: FarmAnimalState[] = [];

  constructor(
    pos: LJS.Vector2,
    size: LJS.Vector2,
    id: string,
    role: StructureRole,
    destination: DestinationType,
    needyness: number = 0,
    numAnimals: number = 0
  ) {
    super(pos, size);
    this.id = id;
    this.role = role;
    this.destination = destination;
    this.width = size.x;
    this.height = size.y;
    this.needyness = needyness;
    this.numAnimals = numAnimals;
    this.renderOrder = 5; // Above terrain, below villagers
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
  }

  private static _cachedHousePoints: LJS.Vector2[] = [];
  private _cachedFarmPoints: LJS.Vector2[] = [];
  private _lastRenderSize = LJS.vec2();

  private renderHouse() {
    const destColor = this.getDestinationColor();

    // Smoother circle (The border) - Cache points
    if (Building._cachedHousePoints.length === 0) {
      const segments = 32;
      for (let i = 0; i < segments; i++) {
        Building._cachedHousePoints.push(
          LJS.vec2(0, 0.28).rotate(i * ((Math.PI * 2) / segments))
        );
      }
    }
    LJS.drawPoly(
      Building._cachedHousePoints,
      COLOR_RESOURCES.transparent,
      0.15,
      destColor,
      this.pos
    );
  }

  private renderFarm() {
    const destColor = this.getDestinationColor();
    const padding = 0.2;
    const r = 0.4; // Corner radius
    const w = this.size.x - padding;
    const h = this.size.y - padding;

    // Only regenerate if size changed
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
      COLOR_RESOURCES.transparent,
      0.15,
      destColor,
      this.pos
    );
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
  /** Test Helper: Manually set demand state for all animals in this building */
  public forceTestDemand(hasDemand: boolean): void {
    if (!this.animals) return;
    for (const animal of this.animals) {
      animal.hasDemand = hasDemand;
      if (!hasDemand) animal.demandTimer = 10; // reset timer
    }
    this.numIssues = hasDemand ? this.animals.length : 0;
    this.demand = this.numIssues * this.needyness;
  }
}
