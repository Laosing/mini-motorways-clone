import * as LJS from 'littlejsengine';
import { GAME_CONFIG, SAVE_KEY } from './config';
import { SeededRng } from './rng';
import { StateMachine } from './stateMachine';
import { EventBus } from './events';
import { GridMap } from '@world/GridMap';
import { generateWorld } from '@world/generation';
import { applyCamera, type Camera } from '@world/camera';
import {
  Building,
  type StructureRole,
  type DestinationType
} from '@entities/Building';
import { Worker } from '@entities/Worker';
import { type Entity, makeId, primeIdCounterFromIds } from '@entities/Entity';
import { drawWorld } from '@systems/renderSystem';
import { handleInput } from '@systems/inputSystem';
import { updateWorkers } from '@systems/taskSystem';
import { loadSnapshot, saveNow } from '@systems/saveSystem';
import { setupHUD, updateHUD } from '@ui/hud';
import type { PathEdge, Roundabout } from '@systems/pathNetwork';

const SPAWNING_LOOP_LENGTH = 600;
const TYPES: DestinationType[] = ['red', 'blue', 'yellow'];

interface SpawnPositionOptions {
  width?: number;
  height?: number;
  anchor?: { x: number; y: number; width: number; height: number };
  minDistance?: number;
  maxDistance?: number;
  maxNumAttempts?: number;
}

export interface BuildingSnapshot {
  id: string;
  role: StructureRole;
  destination: DestinationType;
  width: number;
  height: number;
  x: number;
  y: number;
  pos: { x: number; y: number };
  size: { x: number; y: number };
  assignedWorkerIds: string[];
  entrance: { x: number; y: number };
  entryTile: { x: number; y: number };
  demandTimers: number[];
  active: boolean;
  demand: number;
  numIssues: number;
  needyness: number;
  numDemand: number;
}

export interface WorkerSnapshot {
  id: string;
  x: number;
  y: number;
  pos: { x: number; y: number };
  homeHouseId: string;
  destinationType: DestinationType;
  task: import('@entities/Worker').WorkerTask;
  path: { x: number; y: number }[];
  assignedOfficeId: string | null;
  dx: number;
  dy: number;
  rotation: number;
  originalRouteLength: number;
  lastReachedPos: { x: number; y: number } | null;
  waitTimer: number;
}

export interface Snapshot {
  day: number;
  timeInDay: number;
  gridTiles: ReturnType<GridMap['snapshot']>;
  buildings: BuildingSnapshot[];
  workers: WorkerSnapshot[];
  paths: PathEdge[];
  roundabouts?: Roundabout[];
  seed: number;
  servedTrips: number;
  updateCount: number;
  autoSpawningEnabled?: boolean;
  currentTool?: 'road' | 'roundabout';
}

export class Game {
  readonly state = new StateMachine();
  readonly events = new EventBus();
  readonly rng: SeededRng;
  grid: GridMap;
  camera: Camera;
  buildings: Building[] = [];
  workers: Worker[] = [];
  paths: PathEdge[] = [];
  day = 1;
  timeInDay = 0;
  statusText = '';
  cursorTile: { x: number; y: number } | null = null;
  dragStartTile: { x: number; y: number } | null = null;
  dragTool: 'road' | 'roundabout' | null = null;
  pathPreview: PathEdge[] = [];
  servedTrips = 0;
  updateCount = 0;
  private updateRandomness1 = 0;
  private updateRandomness2 = 0;
  private updateRandomness3 = 0;
  private updateRandomness4 = 0;
  private houseFailed = false;
  autoSpawningEnabled = true;
  pathsChanged = true;
  currentTool: 'road' | 'roundabout' = 'road';
  roundabouts: Roundabout[] = [];

  constructor(seed = Date.now() >>> 0) {
    this.rng = new SeededRng(seed);
    this.grid = new GridMap(GAME_CONFIG.mapWidth, GAME_CONFIG.mapHeight);
    this.camera = {
      x: GAME_CONFIG.mapWidth / 2,
      y: GAME_CONFIG.mapHeight / 2,
      scale: GAME_CONFIG.cameraScale
    };
  }

  init(): void {
    this.state.transition('Boot');
    const loaded = loadSnapshot();
    const isCompatibleSave = Boolean(
      loaded &&
      Array.isArray(loaded.buildings) &&
      loaded.buildings.every((b) => b.role === 'house' || b.role === 'office')
    );

    if (loaded && isCompatibleSave) {
      this.restore(loaded);
      this.ensureTwoWorkersPerHouse();
      this.statusText = 'Loaded save';
    } else {
      generateWorld(this.grid, this.rng);
    }

    applyCamera(this.camera);
    setupHUD(this);
    this.startPlay();
  }

  startPlay(): void {
    this.state.transition('Play');
  }

  togglePause(): void {
    if (this.state.is('Play')) this.state.transition('Pause');
    else if (this.state.is('Pause')) this.state.transition('Play');
  }

  reset(): void {
    if (confirm('Reset the game and delete save?')) {
      localStorage.removeItem(SAVE_KEY);
      window.location.reload();
    }
  }

  toggleAutoSpawning(): void {
    this.autoSpawningEnabled = !this.autoSpawningEnabled;
  }

  update(dt: number): void {
    if (LJS.keyWasPressed('Space')) this.togglePause();
    if (LJS.keyWasPressed('KeyS')) this.save();
    if (LJS.keyWasPressed('KeyR')) this.reset();
    if (this.state.is('Menu')) {
      if (LJS.mouseWasPressed(0)) this.startPlay();
      return;
    }
    if (!this.state.is('Play')) return;

    handleInput(this);

    this.spawnBySchedule();
    this.updateOfficeDemand(dt);
    updateWorkers(this, dt);

    this.updateCount += 1;
    this.timeInDay += dt;
    if (this.timeInDay >= GAME_CONFIG.dayLengthSeconds) {
      this.timeInDay -= GAME_CONFIG.dayLengthSeconds;
      this.day += 1;
    }

    updateHUD(this);
  }

  render(): void {
    applyCamera(this.camera);
    drawWorld(this);
  }

  save(): void {
    saveNow(this);
    this.statusText = 'Saved';
  }

  get offices(): Building[] {
    return this.buildings.filter((b) => b.role === 'office');
  }

  get houses(): Building[] {
    return this.buildings.filter((b) => b.role === 'house');
  }

  get animalCount(): number {
    let count = 0;
    for (const office of this.offices) count += office.numIssues;
    return count;
  }

  get redCount(): number {
    let count = 0;
    for (const office of this.offices.filter((f) => f.destination === 'red'))
      count += office.numIssues;
    return count;
  }

  get blueCount(): number {
    let count = 0;
    for (const office of this.offices.filter((f) => f.destination === 'blue'))
      count += office.numIssues;
    return count;
  }

  get yellowCount(): number {
    let count = 0;
    for (const office of this.offices.filter((f) => f.destination === 'yellow'))
      count += office.numIssues;
    return count;
  }

  /** Test Helper: Manually add a building at a specific location */
  public addTestBuilding(
    x: number,
    y: number,
    role: StructureRole,
    type: DestinationType,
    width = 1,
    height = 1
  ): Building {
    const entrance = { x, y: y + 1 }; // Default for test
    const building = new Building(
      LJS.vec2(x + (width - 1) / 2, y + (height - 1) / 2),
      LJS.vec2(width, height),
      makeId(role),
      role,
      type,
      entrance,
      { x, y }
    );
    this.buildings.push(building);
    this.setStructureOccupancy(building, building.id);
    if (role === 'office') {
      const cfg = this.officeConfig(type);
      building.needyness = cfg.needyness;
      building.numDemand = cfg.numDemand;
      this.ensureOfficeDemand(building);
    }
    return building;
  }

  /** Test Helper: Rapidly add a path between two points */
  public addTestPath(x1: number, y1: number, x2: number, y2: number): void {
    this.paths.push({ a: { x: x1, y: y1 }, b: { x: x2, y: y2 } });
    this.pathsChanged = true;
  }

  /** Test Helper: Get an entity by its ID */
  public getEntityById(id: string): Entity | undefined {
    return (
      this.buildings.find((b) => b.id === id) ||
      this.workers.find((v) => v.id === id)
    );
  }

  toSnapshot(): Snapshot {
    return {
      day: this.day,
      timeInDay: this.timeInDay,
      gridTiles: this.grid.snapshot(),
      buildings: this.buildings.map((b) => ({
        id: b.id,
        role: b.role,
        destination: b.destination,
        width: b.width,
        height: b.height,
        x: b.x,
        y: b.y,
        pos: { x: b.pos.x, y: b.pos.y },
        size: { x: b.size.x, y: b.size.y },
        assignedWorkerIds: [...b.assignedWorkerIds],
        entrance: { ...b.entrance },
        entryTile: { ...b.entryTile },
        demandTimers: [...(b.demandTimers ?? [])],
        active: b.active,
        demand: b.demand,
        numIssues: b.numIssues,
        needyness: b.needyness,
        numDemand: b.numDemand
      })),
      workers: this.workers.map((v) => ({
        id: v.id,
        x: v.x,
        y: v.y,
        pos: { x: v.pos.x, y: v.pos.y },
        homeHouseId: v.homeHouseId,
        destinationType: v.destinationType,
        task: v.task,
        path: [...v.path],
        assignedOfficeId: v.assignedOfficeId,
        dx: v.dx,
        dy: v.dy,
        rotation: v.rotation,
        originalRouteLength: v.originalRouteLength,
        lastReachedPos: v.lastReachedPos ? { ...v.lastReachedPos } : null,
        waitTimer: v.waitTimer
      })),
      paths: this.paths.map((p) => ({
        a: { ...p.a },
        b: { ...p.b },
        direction: p.direction,
        roundaboutId: p.roundaboutId
      })),
      roundabouts: this.roundabouts.map((rb) => ({
        ...rb,
        edges: rb.edges.map((e) => ({ ...e }))
      })),
      seed: this.rng.getSeed(),
      servedTrips: this.servedTrips,
      updateCount: this.updateCount,
      autoSpawningEnabled: this.autoSpawningEnabled,
      currentTool: this.currentTool
    };
  }

  restore(snapshot: Snapshot): void {
    this.day = snapshot.day;
    this.timeInDay = snapshot.timeInDay;
    this.grid = GridMap.fromSnapshot(
      GAME_CONFIG.mapWidth,
      GAME_CONFIG.mapHeight,
      snapshot.gridTiles
    );

    const incomingIds = [
      ...snapshot.buildings.map((b) => b.id),
      ...snapshot.workers.map((v) => v.id)
    ];
    primeIdCounterFromIds(incomingIds);

    this.buildings = snapshot.buildings.map((b) => {
      const width = b.width ?? 1;
      const height = b.height ?? 1;

      // Fallback for different save formats
      let pos: LJS.Vector2;
      if (b.pos && typeof b.pos.x === 'number') {
        pos = LJS.vec2(b.pos.x, b.pos.y);
      } else if (typeof b.x === 'number') {
        pos = LJS.vec2(b.x + (width - 1) / 2, b.y + (height - 1) / 2);
      } else {
        // Absolute fallback to avoid NaN crash
        pos = LJS.vec2(GAME_CONFIG.mapWidth / 2, GAME_CONFIG.mapHeight / 2);
      }

      const building = new Building(
        pos,
        LJS.vec2(width, height),
        b.id,
        b.role,
        b.destination,
        b.entrance || { x: Math.round(pos.x), y: Math.round(pos.y) + 1 }, // Fallback
        b.entryTile || { x: Math.round(pos.x), y: Math.round(pos.y) }, // Fallback
        b.needyness,
        b.numDemand
      );
      building.assignedWorkerIds = [...(b.assignedWorkerIds ?? [])];
      building.demandTimers = b.demandTimers
        ? [...b.demandTimers]
        : b.animals
          ? b.animals.map((anim) => anim.demandTimer)
          : [];
      building.active = b.active ?? true;
      building.demand = b.demand ?? 0;
      building.numIssues = b.numIssues ?? 0;
      return building;
    });

    const seenWorkerIds = new Set<string>();
    this.workers = snapshot.workers.map((v) => {
      const vid = (() => {
        if (!seenWorkerIds.has(v.id)) {
          seenWorkerIds.add(v.id);
          return v.id;
        }
        let uniqueId = makeId('person');
        while (seenWorkerIds.has(uniqueId)) uniqueId = makeId('person');
        seenWorkerIds.add(uniqueId);
        return uniqueId;
      })();

      let pos: LJS.Vector2;
      if (v.pos && typeof v.pos.x === 'number') {
        pos = LJS.vec2(v.pos.x, v.pos.y);
      } else if (typeof v.x === 'number') {
        pos = LJS.vec2(v.x, v.y);
      } else {
        pos = LJS.vec2(0, 0);
      }

      const homeId = v.homeHouseId || vid;
      const worker = new Worker(pos, vid, homeId, v.destinationType);
      worker.task = v.task;
      worker.path = [...(v.path ?? [])];
      worker.assignedOfficeId = v.assignedOfficeId ?? null;
      worker.dx = v.dx ?? 0;
      worker.dy = v.dy ?? 0;
      worker.rotation = v.rotation ?? 0;
      worker.originalRouteLength = v.originalRouteLength ?? v.path?.length ?? 0;
      worker.lastReachedPos = v.lastReachedPos ?? null;
      worker.waitTimer = v.waitTimer ?? 0;
      return worker;
    });
    this.paths = (snapshot.paths ?? []).map((p) => ({
      a: { ...p.a },
      b: { ...p.b },
      direction: p.direction,
      roundaboutId: p.roundaboutId
    }));
    this.roundabouts = (snapshot.roundabouts ?? []).map((rb) => ({
      ...rb,
      edges: rb.edges.map((e) => ({ ...e }))
    }));
    this.currentTool = snapshot.currentTool ?? 'road';
    this.servedTrips = snapshot.servedTrips ?? 0;
    this.updateCount = snapshot.updateCount ?? 0;
    this.autoSpawningEnabled = snapshot.autoSpawningEnabled ?? true;
    this.backfillStructureSizes();
    this.backfillOfficeDemandState();
    this.rebuildOccupancyFromStructures();
    this.pathsChanged = true;
  }

  public updateOfficeDemand(dt: number): void {
    for (const office of this.offices) {
      this.ensureOfficeDemand(office);
      let activeIssues = 0;
      for (let i = 0; i < office.demandTimers.length; i++) {
        if (office.demandTimers[i] <= 0) {
          activeIssues++;
        } else {
          office.demandTimers[i] -= dt;
          if (office.demandTimers[i] < 0) office.demandTimers[i] = 0;
          if (office.demandTimers[i] === 0) activeIssues++;
        }
      }
      office.numIssues = activeIssues;
      office.demand = office.numIssues * office.needyness;
      office.assignedWorkerIds = office.assignedWorkerIds.filter((id) =>
        this.workers.some((v) => v.id === id)
      );
    }
  }

  consumeOfficeIssue(office: Building): boolean {
    this.ensureOfficeDemand(office);
    for (let i = 0; i < office.demandTimers.length; i++) {
      if (office.demandTimers[i] === 0) {
        office.demandTimers[i] = this.nextOfficeDemandTimerSeconds(office);
        office.numIssues = office.demandTimers.filter((t) => t === 0).length;
        office.demand = office.numIssues * office.needyness;
        return true;
      }
    }
    office.numIssues = 0;
    office.demand = 0;
    return false;
  }

  /**
   * Invalidate all active worker paths, forcing them to recalculate.
   * Called when roundabouts are placed or removed to ensure workers use updated paths.
   */
  public invalidateWorkerPaths(): void {
    for (const worker of this.workers) {
      worker.path = [];
      worker.lastReachedPos = null;
      // Keep the task and target but force recalculation
      if (worker.task === 'toOffice' || worker.task === 'toHome') {
        // worker.target is preserved to allow re-pathing
      }
    }
  }

  private spawnBySchedule(): void {
    if (!this.autoSpawningEnabled) return;
    let upgradedThisLoop = false;

    if (this.updateCount % SPAWNING_LOOP_LENGTH === 0) {
      this.updateRandomness1 = this.rng.int(0, 40);
      this.updateRandomness2 = this.rng.int(0, 40);
      this.updateRandomness3 = this.rng.int(0, 40);
      this.updateRandomness4 = this.rng.int(0, 40);
    }

    if (
      this.updateCount === 0 ||
      (this.updateCount > 200 &&
        this.updateCount % SPAWNING_LOOP_LENGTH ===
          (this.offices.length ? this.updateRandomness1 : 0))
    ) {
      if (
        !this.trySpawnOffice(
          this.updateCount > 2000 &&
            !this.offices.some((f) => f.destination === 'yellow')
            ? 'yellow'
            : this.getRandomNewType()
        )
      ) {
        for (const office of this.offices) {
          if (!upgradedThisLoop && this.tryUpgradeOffice(office)) {
            upgradedThisLoop = true;
          }
        }
      }
      return;
    }

    if (
      this.updateCount % SPAWNING_LOOP_LENGTH ===
      100 + (this.offices.length > 1 ? this.updateRandomness2 : 0)
    ) {
      this.houseFailed = !this.trySpawnFirstHouseOfLoop();
      return;
    }

    if (
      this.houseFailed &&
      this.updateCount % SPAWNING_LOOP_LENGTH === 120 + this.updateRandomness2
    ) {
      this.houseFailed = !this.trySpawnFirstHouseOfLoop();
      return;
    }

    if (
      this.houseFailed &&
      this.updateCount % SPAWNING_LOOP_LENGTH === 140 + this.updateRandomness2
    ) {
      this.houseFailed = !this.trySpawnFirstHouseOfLoop();
      return;
    }

    if (
      this.updateCount % SPAWNING_LOOP_LENGTH ===
      300 + this.updateRandomness3
    ) {
      this.houseFailed = !this.trySpawnSecondHouseOfLoop();
      return;
    }

    if (
      this.houseFailed &&
      this.updateCount % SPAWNING_LOOP_LENGTH === 320 + this.updateRandomness3
    ) {
      this.houseFailed = !this.trySpawnSecondHouseOfLoop();
      return;
    }

    if (
      this.houseFailed &&
      this.updateCount % SPAWNING_LOOP_LENGTH === 340 + this.updateRandomness3
    ) {
      this.houseFailed = !this.trySpawnSecondHouseOfLoop();
      return;
    }

    if (
      this.updateCount > 4000 &&
      this.updateCount % SPAWNING_LOOP_LENGTH === 500 + this.updateRandomness4
    ) {
      if (!this.trySpawnOffice(this.getRandomNewType())) {
        for (const office of this.offices) {
          if (!upgradedThisLoop && this.tryUpgradeOffice(office)) {
            upgradedThisLoop = true;
          }
        }
      }
    }
  }

  private trySpawnOffice(destination: DestinationType): boolean {
    const officeProps = this.getRandomOfficeProps(destination);
    const anchor = this.offices.length
      ? this.offices[this.rng.int(0, this.offices.length)]
      : {
          x: Math.floor(this.grid.width / 2),
          y: Math.floor(this.grid.height / 2),
          width: 1,
          height: 1
        };

    const pos = this.getRandomPosition({
      width: officeProps.width,
      height: officeProps.height,
      anchor: {
        x: anchor.x,
        y: anchor.y,
        width: anchor.width,
        height: anchor.height
      },
      minDistance: this.offices.length ? 2 : 0,
      maxDistance: this.offices.length + 3,
      maxNumAttempts: 40
    });
    if (!pos) return false;

    const cfg = this.officeConfig(destination);

    // Pick a random valid entrance neighbor
    const allNeighbors: Array<{ x: number; y: number }> = [];
    // Orthogonal neighbors for a multi-tile office:
    // Top and Bottom edges
    for (let ox = 0; ox < officeProps.width; ox++) {
      allNeighbors.push({ x: pos.x + ox, y: pos.y - 1 }); // Top
      allNeighbors.push({ x: pos.x + ox, y: pos.y + officeProps.height }); // Bottom
    }
    // Left and Right edges
    for (let oy = 0; oy < officeProps.height; oy++) {
      allNeighbors.push({ x: pos.x - 1, y: pos.y + oy }); // Left
      allNeighbors.push({ x: pos.x + officeProps.width, y: pos.y + oy }); // Right
    }

    const validEntrances = allNeighbors.filter(
      (n) =>
        this.grid.isInside(n.x, n.y) && !this.grid.get(n.x, n.y)?.occupantId
    );
    const entrance =
      validEntrances.length > 0
        ? validEntrances[this.rng.int(0, validEntrances.length)]
        : { x: pos.x, y: pos.y - 1 };

    // Find the tile inside the office that is closest to the entrance tile
    const entryTile = {
      x: Math.max(pos.x, Math.min(pos.x + officeProps.width - 1, entrance.x)),
      y: Math.max(pos.y, Math.min(pos.y + officeProps.height - 1, entrance.y))
    };

    const office = new Building(
      LJS.vec2(
        pos.x + (officeProps.width - 1) / 2,
        pos.y + (officeProps.height - 1) / 2
      ),
      LJS.vec2(officeProps.width, officeProps.height),
      makeId('office'),
      'office',
      destination,
      entrance,
      entryTile,
      cfg.needyness,
      cfg.numDemand
    );
    this.ensureOfficeDemand(office);
    this.buildings.push(office);
    this.setStructureOccupancy(office, office.id);

    // Add exactly one starter path segment from the office to its entrance
    this.paths.push({ a: entryTile, b: entrance });
    this.pathsChanged = true;
    return true;
  }

  private officeConfig(destination: DestinationType): {
    needyness: number;
    numDemand: number;
  } {
    if (destination === 'red') return { needyness: 225, numDemand: 3 };
    if (destination === 'blue') return { needyness: 240, numDemand: 3 };
    return { needyness: 1300, numDemand: 5 };
  }

  private tryUpgradeOffice(office: Building): boolean {
    if (office.destination === 'red') {
      if (office.numDemand >= 5) return false;
      office.numDemand += 2;
      this.ensureOfficeDemand(office);
      return true;
    }
    if (office.destination === 'blue') {
      if (office.numDemand >= 7) return false;
      office.numDemand += 1;
      this.ensureOfficeDemand(office);
      return true;
    }
    if (office.numDemand >= 9) return false;
    office.numDemand += 4;
    this.ensureOfficeDemand(office);
    return true;
  }

  private trySpawnFirstHouseOfLoop(): boolean {
    const office = this.pickOfficeForFirstHouse();
    if (!office) return false;

    const pos = this.getRandomPosition({
      anchor: { x: office.x, y: office.y, width: 1, height: 1 },
      minDistance: 3,
      maxDistance: 2 + this.offices.length,
      maxNumAttempts: 40
    });
    if (!pos) return false;

    this.spawnHouseAt(pos.x, pos.y, office.destination);
    return true;
  }

  private trySpawnSecondHouseOfLoop(): boolean {
    const type = this.getRandomExistingType();
    const sameTypeHouses = this.houses.filter((y) => y.destination === type);
    const friendHouse = sameTypeHouses.length
      ? sameTypeHouses[this.rng.int(0, sameTypeHouses.length)]
      : null;
    if (!friendHouse) return false;

    const pos = this.getRandomPosition({
      anchor: { x: friendHouse.x, y: friendHouse.y, width: 1, height: 1 },
      minDistance: 1,
      maxDistance: Math.max(2, this.offices.length),
      maxNumAttempts: 40
    });
    if (!pos) return false;

    this.spawnHouseAt(pos.x, pos.y, type);
    return true;
  }

  public spawnHouseAt(
    x: number,
    y: number,
    destination: DestinationType
  ): void {
    // Pick random orthogonal entrance for 1x1 house
    const neighbors = [
      { x: x + 1, y: y },
      { x: x - 1, y: y },
      { x: x, y: y + 1 },
      { x: x, y: y - 1 }
    ];
    const validEntrances = neighbors.filter(
      (n) =>
        this.grid.isInside(n.x, n.y) && !this.grid.get(n.x, n.y)?.occupantId
    );
    const entrance =
      validEntrances.length > 0
        ? validEntrances[this.rng.int(0, validEntrances.length)]
        : { x: x, y: y + 1 };

    const house = new Building(
      LJS.vec2(x, y),
      LJS.vec2(1, 1),
      makeId('house'),
      'house',
      destination,
      entrance,
      { x, y }
    );
    this.buildings.push(house);
    this.setStructureOccupancy(house, house.id);

    // Add a starter path from the house to its entrance
    this.paths.push({ a: { x, y }, b: entrance });
    this.pathsChanged = true;

    for (let p = 0; p < 2; p += 1) {
      const varianceX = this.rng.next() * 0.5 - 0.25;
      const varianceY = this.rng.next() * 0.5 - 0.25;
      this.workers.push(
        new Worker(
          LJS.vec2(x + varianceX, y + varianceY),
          makeId('person'),
          house.id,
          destination
        )
      );
    }
  }

  private ensureTwoWorkersPerHouse(): void {
    for (const house of this.houses) {
      const residents = this.workers.filter((v) => v.homeHouseId === house.id);
      const missing = Math.max(0, 2 - residents.length);
      for (let i = 0; i < missing; i += 1) {
        const varianceX = this.rng.next() * 0.5 - 0.25;
        const varianceY = this.rng.next() * 0.5 - 0.25;
        this.workers.push(
          new Worker(
            LJS.vec2(house.x + varianceX, house.y + varianceY),
            makeId('person'),
            house.id,
            house.destination
          )
        );
      }
    }
  }

  private pickOfficeForFirstHouse(): Building | null {
    const yellowOffice = this.offices.find((f) => f.destination === 'yellow');
    const yellowHouses = this.houses.filter((y) => y.destination === 'yellow');

    if (yellowOffice && yellowHouses.length < 2) return yellowOffice;
    if (!this.offices.length) return null;
    if (this.offices.length > 2)
      return this.offices[this.rng.int(0, this.offices.length)];
    return this.offices[this.offices.length - 1];
  }

  private getRandomNewType(): DestinationType {
    if (this.offices.length < 2) return TYPES[this.offices.length] ?? 'red';

    const goodTypes = TYPES.filter((t) => {
      const y = this.houses.filter((house) => house.destination === t).length;
      const f = this.offices.filter(
        (office) => office.destination === t
      ).length;
      return y > f;
    });

    if (goodTypes.length) return goodTypes[this.rng.int(0, goodTypes.length)];
    return TYPES[this.rng.int(0, TYPES.length)];
  }

  private getRandomExistingType(): DestinationType {
    if (this.offices.length < 2)
      return TYPES[Math.max(0, this.offices.length - 1)] ?? 'red';

    const scores = TYPES.map((t) => {
      const y = Math.max(
        1,
        this.houses.filter((house) => house.destination === t).length
      );
      const f = this.offices.filter(
        (office) => office.destination === t
      ).length;
      return { t, w: f / y };
    });

    const total = scores.reduce((acc, s) => acc + s.w, 0);
    if (total <= 0) return TYPES[this.rng.int(0, TYPES.length)];

    let r = this.rng.next() * total;
    for (const s of scores) {
      r -= s.w;
      if (r <= 0) return s.t;
    }
    return scores[scores.length - 1].t;
  }

  private getRandomPosition(
    options: SpawnPositionOptions
  ): { x: number; y: number } | null {
    const width = options.width ?? 1;
    const height = options.height ?? 1;
    const anchor = options.anchor ?? {
      x: Math.floor(this.grid.width / 2),
      y: Math.floor(this.grid.height / 2),
      width: 1,
      height: 1
    };
    const minDistance = options.minDistance ?? 0;
    const maxDistance = options.maxDistance ?? 99;
    const maxNumAttempts = options.maxNumAttempts ?? 16;

    for (let i = 0; i < maxNumAttempts; i += 1) {
      const minX = Math.max(1, anchor.x - maxDistance);
      const maxX = Math.min(
        this.grid.width - 1 - width,
        anchor.x + anchor.width + maxDistance
      );
      const minY = Math.max(1, anchor.y - maxDistance);
      const maxY = Math.min(
        this.grid.height - 1 - height,
        anchor.y + anchor.height + maxDistance
      );

      const x = this.rng.int(minX, maxX + 1);
      const y = this.rng.int(minY, maxY + 1);

      if (
        x < anchor.x + anchor.width + minDistance &&
        x > anchor.x - minDistance &&
        y < anchor.y + anchor.height + minDistance &&
        y > anchor.y - minDistance
      ) {
        continue;
      }

      let blocked = false;
      for (let ox = 0; ox < width; ox += 1) {
        for (let oy = 0; oy < height; oy += 1) {
          const tile = this.grid.get(x + ox, y + oy);
          if (!tile || tile.terrain !== 'grass' || tile.occupantId) {
            blocked = true;
            break;
          }
        }
        if (blocked) break;
      }
      if (blocked) continue;

      const pathCollision = this.paths.some((p) => {
        for (let ox = 0; ox < width; ox += 1) {
          for (let oy = 0; oy < height; oy += 1) {
            const tx = x + ox;
            const ty = y + oy;
            if (
              (p.a.x === tx && p.a.y === ty) ||
              (p.b.x === tx && p.b.y === ty)
            )
              return true;
          }
        }
        return false;
      });
      if (pathCollision) continue;

      return { x, y };
    }

    return null;
  }

  private setStructureOccupancy(
    structure: Building,
    occupantId: string | null
  ): void {
    for (let ox = 0; ox < structure.width; ox += 1) {
      for (let oy = 0; oy < structure.height; oy += 1) {
        this.grid.setOccupant(structure.x + ox, structure.y + oy, occupantId);
      }
    }
  }

  private rebuildOccupancyFromStructures(): void {
    this.grid.forEach((tile) => {
      tile.occupantId = null;
    });
    for (const structure of this.buildings) {
      this.setStructureOccupancy(structure, structure.id);
    }
  }

  private getRandomOfficeProps(destination: DestinationType): {
    width: number;
    height: number;
  } {
    if (destination === 'yellow') return { width: 2, height: 2 };
    const portrait = this.rng.next() > 0.5;
    return portrait ? { width: 2, height: 3 } : { width: 3, height: 2 };
  }

  private backfillStructureSizes(): void {
    // Structural sizes are now handled in constructor, but for legacy saves:
    for (const structure of this.buildings) {
      if (structure.width && structure.height) continue;
      // Note: width/height are readonly on Building class now.
      // This logic should probably be moved to restore if needed.
    }
  }

  private backfillOfficeDemandState(): void {
    for (const structure of this.buildings) {
      if (structure.role !== 'office') continue;
      this.ensureOfficeDemand(structure);
      structure.numDemand = structure.demandTimers.length;
      structure.numIssues = structure.demandTimers.filter(
        (t) => t === 0
      ).length;
      structure.demand = structure.numIssues * structure.needyness;
    }
  }

  private ensureOfficeDemand(office: Building): void {
    if (office.role !== 'office') return;

    if (!office.demandTimers) office.demandTimers = [];

    while (office.demandTimers.length < office.numDemand) {
      office.demandTimers.push(this.nextOfficeDemandTimerSeconds(office));
    }

    if (office.demandTimers.length > office.numDemand) {
      office.demandTimers.length = office.numDemand;
    }
  }

  private nextOfficeDemandTimerSeconds(office: Building): number {
    if (office.destination === 'red') return 12 + this.rng.next() * 10;
    if (office.destination === 'blue') return 9 + this.rng.next() * 8;
    return 16 + this.rng.next() * 12;
  }
}
