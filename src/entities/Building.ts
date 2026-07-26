import * as LJS from 'littlejsengine';
import type { Entity } from './Entity';
import { COLOR_RESOURCES } from '@core/colors';
import { BUILDING_CONFIG, COLOR_CONFIG, PATH_CONFIG } from '@core/config';

export type DestinationType = 'red' | 'blue' | 'yellow';
export type StructureRole = 'house' | 'office';
export interface BuildingEntrance {
  entrance: { x: number; y: number };
  entryTile: { x: number; y: number };
}

const BUILDING_CORNER_RADIUS = 0.12;
const HOUSE_RENDER_SIZE = 0.9;

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
  readonly entrances: BuildingEntrance[];
  readonly parkingSpots: Array<{ x: number; y: number }>;

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
    numDemand: number = 0,
    entrances?: BuildingEntrance[]
  ) {
    super(pos, size);
    this.id = id;
    this.role = role;
    this.destination = destination;
    this.width = size.x;
    this.height = size.y;
    this.entrance = entrance;
    this.entryTile = entryTile || {
      x: Math.round(this.x),
      y: Math.round(this.y)
    };
    this.entrances = (
      entrances?.length
        ? entrances
        : [{ entrance: this.entrance, entryTile: this.entryTile }]
    ).map((pair) => ({
      entrance: { ...pair.entrance },
      entryTile: { ...pair.entryTile }
    }));
    this.parkingSpots = role === 'office' ? this.createParkingSpots() : [];
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
  }

  private static _cachedHousePoints: LJS.Vector2[] = [];
  private static _cachedEntranceInside = LJS.vec2();
  private static _cachedEntranceOutside = LJS.vec2();
  private static _cachedParkingSpot = LJS.vec2();
  private _cachedOfficePoints: LJS.Vector2[] = [];
  private _lastRenderSize = LJS.vec2();

  private renderHouse() {
    const destColor = this.getDestinationColor();

    if (Building._cachedHousePoints.length === 0) {
      const halfSize = HOUSE_RENDER_SIZE / 2;
      const radius = BUILDING_CORNER_RADIUS;
      const segments = 6;
      const corners = [
        { x: halfSize - radius, y: halfSize - radius, start: 0 },
        {
          x: -halfSize + radius,
          y: halfSize - radius,
          start: Math.PI / 2
        },
        {
          x: -halfSize + radius,
          y: -halfSize + radius,
          start: Math.PI
        },
        {
          x: halfSize - radius,
          y: -halfSize + radius,
          start: (3 * Math.PI) / 2
        }
      ];

      for (const corner of corners) {
        for (let i = 0; i <= segments; i++) {
          const angle = corner.start + (i / segments) * (Math.PI / 2);
          Building._cachedHousePoints.push(
            LJS.vec2(
              corner.x + Math.cos(angle) * radius,
              corner.y + Math.sin(angle) * radius
            )
          );
        }
      }
    }
    LJS.drawPoly(
      Building._cachedHousePoints,
      destColor,
      0,
      undefined,
      this.pos
    );
  }

  private renderOffice() {
    const destColor = this.getDestinationColor();
    const r = BUILDING_CORNER_RADIUS;
    const w = this.size.x;
    const h = this.size.y;

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
      COLOR_RESOURCES.transparent,
      COLOR_CONFIG.outlineWidth,
      destColor,
      this.pos
    );

    for (let index = 0; index < this.parkingSpots.length; index++) {
      const spot = this.parkingSpots[index];
      Building._cachedParkingSpot.set(spot.x, spot.y);
      LJS.drawCircle(
        Building._cachedParkingSpot,
        0.18,
        this.isParkingSpotActive(index)
          ? COLOR_RESOURCES.black
          : COLOR_RESOURCES.grid
      );
    }

    for (const pair of this.entrances) {
      Building._cachedEntranceInside.set(pair.entryTile.x, pair.entryTile.y);
      Building._cachedEntranceOutside.set(pair.entrance.x, pair.entrance.y);
      LJS.drawLine(
        Building._cachedEntranceInside,
        Building._cachedEntranceOutside,
        PATH_CONFIG.renderWidth,
        COLOR_RESOURCES.path
      );
    }
  }

  private createParkingSpots(): Array<{ x: number; y: number }> {
    const pathTiles = new Set<string>();
    const addPathTile = (tile: { x: number; y: number }) => {
      if (
        tile.x >= this.x &&
        tile.x < this.x + this.width &&
        tile.y >= this.y &&
        tile.y < this.y + this.height
      ) {
        pathTiles.add(`${tile.x},${tile.y}`);
      }
    };

    for (const entrance of this.entrances) {
      addPathTile(entrance.entryTile);
    }

    const start = this.entrances[0]?.entryTile;
    const end = this.entrances[1]?.entryTile;
    if (start && end) {
      const current = { ...start };
      while (current.x !== end.x) {
        current.x += Math.sign(end.x - current.x);
        addPathTile(current);
      }
      while (current.y !== end.y) {
        current.y += Math.sign(end.y - current.y);
        addPathTile(current);
      }
    }

    const spots: Array<{ x: number; y: number }> = [];
    for (let y = this.y; y < this.y + this.height; y++) {
      for (let x = this.x; x < this.x + this.width; x++) {
        if (!pathTiles.has(`${x},${y}`)) {
          spots.push({ x, y });
        }
      }
    }

    return spots;
  }

  public isParkingSpotActive(index: number): boolean {
    return (
      index >= 0 &&
      index < this.parkingSpots.length &&
      index < this.demandTimers.length &&
      this.demandTimers[index] === 0
    );
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
