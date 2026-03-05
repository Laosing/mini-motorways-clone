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
  type DestinationType,
  type FarmAnimalState
} from '@entities/Building';
import { Villager } from '@entities/Villager';
import { type Entity, makeId, primeIdCounterFromIds } from '@entities/Entity';
import { drawWorld } from '@systems/renderSystem';
import { handleInput } from '@systems/inputSystem';
import { updateVillagers } from '@systems/taskSystem';
import { loadSnapshot, saveNow } from '@systems/saveSystem';
import { setupHUD, updateHUD } from '@ui/hud';
import type { PathEdge } from '@systems/pathNetwork';
import { FarmAnimal } from '@entities/Animal';

const SPAWNING_LOOP_LENGTH = 600;
const TYPES: DestinationType[] = ['ox', 'goat', 'fish'];

interface SpawnPositionOptions {
  width?: number;
  height?: number;
  anchor?: { x: number; y: number; width: number; height: number };
  minDistance?: number;
  maxDistance?: number;
  maxNumAttempts?: number;
}

export interface Snapshot {
  day: number;
  timeInDay: number;
  gridTiles: ReturnType<GridMap['snapshot']>;
  buildings: any[];
  villagers: any[];
  paths: PathEdge[];
  seed: number;
  servedTrips: number;
  updateCount: number;
  autoSpawningEnabled?: boolean;
}

export class Game {
  readonly state = new StateMachine();
  readonly events = new EventBus();
  readonly rng: SeededRng;
  grid: GridMap;
  camera: Camera;
  buildings: Building[] = [];
  villagers: Villager[] = [];
  paths: PathEdge[] = [];
  day = 1;
  timeInDay = 0;
  statusText = '';
  cursorTile: { x: number; y: number } | null = null;
  dragStartTile: { x: number; y: number } | null = null;
  servedTrips = 0;
  updateCount = 0;
  private updateRandomness1 = 0;
  private updateRandomness2 = 0;
  private updateRandomness3 = 0;
  private updateRandomness4 = 0;
  private houseFailed = false;
  autoSpawningEnabled = true;
  private animalMap = new Map<string, FarmAnimal>();

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
      loaded.buildings.every(
        (b) => b.role === 'yurt' || b.role === 'house' || b.role === 'farm'
      )
    );

    if (loaded && isCompatibleSave) {
      this.restore(loaded);
      this.ensureTwoVillagersPerHouse();
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
    this.updateFarmDemand(dt);
    updateVillagers(this, dt);

    this.updateCount += 1;
    this.timeInDay += dt;
    if (this.timeInDay >= GAME_CONFIG.dayLengthSeconds) {
      this.timeInDay -= GAME_CONFIG.dayLengthSeconds;
      this.day += 1;
    }

    this.syncAnimalGameObjects();

    updateHUD(this);
  }

  private activeIdsBuffer = new Set<string>();

  private syncAnimalGameObjects() {
    this.activeIdsBuffer.clear();

    for (let i = 0; i < this.buildings.length; i++) {
      const building = this.buildings[i];
      const states = building.animals ?? [];
      for (let j = 0; j < states.length; j++) {
        const state = states[j];
        this.activeIdsBuffer.add(state.id);
        let animal = this.animalMap.get(state.id);
        if (!animal) {
          const padding = 2.5;
          const initialX =
            this.rng.next() * (building.width * 8 - padding * 2) + padding;
          const initialY =
            this.rng.next() * (building.height * 8 - padding * 2) + padding;
          animal = new FarmAnimal(building, state.id, initialX, initialY);
          this.animalMap.set(state.id, animal);
        }
        animal.hasDemand = state.hasDemand;
      }
    }

    // Cleanup stale animals
    for (const [id, animal] of this.animalMap.entries()) {
      if (!this.activeIdsBuffer.has(id)) {
        animal.destroy();
        this.animalMap.delete(id);
      }
    }
  }

  render(): void {
    applyCamera(this.camera);
    drawWorld(this);
  }

  save(): void {
    saveNow(this);
    this.statusText = 'Saved';
  }

  get farms(): Building[] {
    return this.buildings.filter((b) => b.role === 'farm');
  }

  get houses(): Building[] {
    return this.buildings.filter((b) => b.role === 'house');
  }

  get animalCount(): number {
    return this.animalMap.size;
  }

  get oxenCount(): number {
    let count = 0;
    for (const animal of this.animalMap.values()) {
      if (animal.kind === 'ox') count++;
    }
    return count;
  }

  get sheepCount(): number {
    let count = 0;
    for (const animal of this.animalMap.values()) {
      if (animal.kind === 'goat') count++;
    }
    return count;
  }

  get fishCount(): number {
    let count = 0;
    for (const animal of this.animalMap.values()) {
      if (animal.kind === 'fish') count++;
    }
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
    const building = new Building(
      LJS.vec2(x + (width - 1) / 2, y + (height - 1) / 2),
      LJS.vec2(width, height),
      makeId(role),
      role,
      type
    );
    this.buildings.push(building);
    this.setStructureOccupancy(building, building.id);
    if (role === 'farm') {
      const cfg = this.farmConfig(type);
      building.needyness = cfg.needyness;
      building.numAnimals = cfg.numAnimals;
      this.ensureFarmAnimals(building);
    }
    return building;
  }

  /** Test Helper: Rapidly add a path between two points */
  public addTestPath(x1: number, y1: number, x2: number, y2: number): void {
    this.paths.push({ a: { x: x1, y: y1 }, b: { x: x2, y: y2 } });
  }

  /** Test Helper: Get an entity by its ID */
  public getEntityById(id: string): Entity | undefined {
    return (
      this.buildings.find((b) => b.id === id) ||
      this.villagers.find((v) => v.id === id)
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
        assignedVillagerIds: [...b.assignedVillagerIds],
        animals: b.animals?.map((a) => ({ ...a })),
        active: b.active,
        demand: b.demand,
        numIssues: b.numIssues,
        needyness: b.needyness,
        numAnimals: b.numAnimals
      })),
      villagers: this.villagers.map((v) => ({
        id: v.id,
        x: v.x,
        y: v.y,
        pos: { x: v.pos.x, y: v.pos.y },
        homeHouseId: v.homeHouseId,
        destinationType: v.destinationType,
        task: v.task,
        path: [...v.path],
        assignedFarmId: v.assignedFarmId,
        dx: v.dx,
        dy: v.dy,
        rotation: v.rotation,
        originalRouteLength: v.originalRouteLength,
        lastReachedPos: v.lastReachedPos ? { ...v.lastReachedPos } : null,
        waitTimer: v.waitTimer
      })),
      paths: this.paths.map((p) => ({ a: { ...p.a }, b: { ...p.b } })),
      seed: this.rng.getSeed(),
      servedTrips: this.servedTrips,
      updateCount: this.updateCount,
      autoSpawningEnabled: this.autoSpawningEnabled
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
      ...snapshot.villagers.map((v) => v.id)
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
        b.role === 'yurt' ? 'house' : b.role,
        b.destination,
        b.needyness,
        b.numAnimals
      );
      building.assignedVillagerIds = [...(b.assignedVillagerIds ?? [])];
      building.animals = b.animals?.map((a: any) => ({ ...a }));
      building.active = b.active ?? true;
      building.demand = b.demand ?? 0;
      building.numIssues = b.numIssues ?? 0;
      return building;
    });

    const seenVillagerIds = new Set<string>();
    this.villagers = snapshot.villagers.map((v) => {
      const vid = (() => {
        if (!seenVillagerIds.has(v.id)) {
          seenVillagerIds.add(v.id);
          return v.id;
        }
        let uniqueId = makeId('person');
        while (seenVillagerIds.has(uniqueId)) uniqueId = makeId('person');
        seenVillagerIds.add(uniqueId);
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

      const homeId = v.homeHouseId || v.homeYurtId;
      const villager = new Villager(pos, vid, homeId, v.destinationType);
      villager.task = v.task;
      villager.path = [...(v.path ?? [])];
      villager.assignedFarmId = v.assignedFarmId ?? null;
      villager.dx = v.dx ?? 0;
      villager.dy = v.dy ?? 0;
      villager.rotation = v.rotation ?? 0;
      villager.originalRouteLength =
        v.originalRouteLength ?? v.path?.length ?? 0;
      villager.lastReachedPos = v.lastReachedPos ?? null;
      villager.waitTimer = v.waitTimer ?? 0;
      return villager;
    });
    this.paths = (snapshot.paths ?? []).map((p) => ({
      a: { ...p.a },
      b: { ...p.b }
    }));
    this.servedTrips = snapshot.servedTrips ?? 0;
    this.updateCount = snapshot.updateCount ?? 0;
    this.autoSpawningEnabled = snapshot.autoSpawningEnabled ?? true;
    this.backfillStructureSizes();
    this.backfillFarmDemandState();
    this.rebuildOccupancyFromStructures();
  }

  public updateFarmDemand(dt: number): void {
    for (const farm of this.farms) {
      this.ensureFarmAnimals(farm);
      for (const animal of farm.animals ?? []) {
        if (animal.hasDemand) continue;
        const nextTimer = animal.demandTimer - dt;
        if (nextTimer <= 0) {
          animal.hasDemand = true;
          animal.demandTimer = 0;
        } else {
          animal.demandTimer = nextTimer;
        }
      }
      farm.numAnimals = (farm.animals ?? []).length;
      farm.numIssues = (farm.animals ?? []).filter((a) => a.hasDemand).length;
      farm.demand = farm.numIssues * farm.needyness;
      farm.assignedVillagerIds = farm.assignedVillagerIds.filter((id) =>
        this.villagers.some((v) => v.id === id)
      );
    }
  }

  consumeFarmIssue(farm: Building): boolean {
    this.ensureFarmAnimals(farm);
    const animals = farm.animals ?? [];
    for (const animal of animals) {
      if (!animal.hasDemand) continue;
      animal.hasDemand = false;
      animal.demandTimer = this.nextAnimalDemandTimerSeconds(farm);
      farm.numIssues = animals.filter((a) => a.hasDemand).length;
      farm.demand = farm.numIssues * farm.needyness;
      return true;
    }
    farm.numIssues = 0;
    farm.demand = 0;
    return false;
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
          (this.farms.length ? this.updateRandomness1 : 0))
    ) {
      if (
        !this.trySpawnFarm(
          this.updateCount > 2000 &&
            !this.farms.some((f) => f.destination === 'fish')
            ? 'fish'
            : this.getRandomNewType()
        )
      ) {
        for (const farm of this.farms) {
          if (!upgradedThisLoop && this.tryUpgradeFarm(farm)) {
            upgradedThisLoop = true;
          }
        }
      }
      return;
    }

    if (
      this.updateCount % SPAWNING_LOOP_LENGTH ===
      100 + (this.farms.length > 1 ? this.updateRandomness2 : 0)
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
      if (!this.trySpawnFarm(this.getRandomNewType())) {
        for (const farm of this.farms) {
          if (!upgradedThisLoop && this.tryUpgradeFarm(farm)) {
            upgradedThisLoop = true;
          }
        }
      }
    }
  }

  private trySpawnFarm(destination: DestinationType): boolean {
    const farmProps = this.getRandomFarmProps(destination);
    const anchor = this.farms.length
      ? this.farms[this.rng.int(0, this.farms.length)]
      : {
          x: Math.floor(this.grid.width / 2),
          y: Math.floor(this.grid.height / 2),
          width: 1,
          height: 1
        };

    const pos = this.getRandomPosition({
      width: farmProps.width,
      height: farmProps.height,
      anchor: {
        x: anchor.x,
        y: anchor.y,
        width: anchor.width,
        height: anchor.height
      },
      minDistance: this.farms.length ? 2 : 0,
      maxDistance: this.farms.length + 3,
      maxNumAttempts: 40
    });
    if (!pos) return false;

    const cfg = this.farmConfig(destination);
    const farm = new Building(
      LJS.vec2(
        pos.x + (farmProps.width - 1) / 2,
        pos.y + (farmProps.height - 1) / 2
      ),
      LJS.vec2(farmProps.width, farmProps.height),
      makeId('farm'),
      'farm',
      destination,
      cfg.needyness,
      cfg.numAnimals
    );
    this.ensureFarmAnimals(farm);
    this.buildings.push(farm);
    this.setStructureOccupancy(farm, farm.id);
    return true;
  }

  private farmConfig(destination: DestinationType): {
    needyness: number;
    numAnimals: number;
  } {
    if (destination === 'ox') return { needyness: 225, numAnimals: 3 };
    if (destination === 'goat') return { needyness: 240, numAnimals: 3 };
    return { needyness: 1300, numAnimals: 5 };
  }

  private tryUpgradeFarm(farm: Building): boolean {
    if (farm.destination === 'ox') {
      if (farm.numAnimals >= 5) return false;
      farm.numAnimals += 2;
      this.ensureFarmAnimals(farm);
      return true;
    }
    if (farm.destination === 'goat') {
      if (farm.numAnimals >= 7) return false;
      farm.numAnimals += 1;
      this.ensureFarmAnimals(farm);
      return true;
    }
    if (farm.numAnimals >= 9) return false;
    farm.numAnimals += 4;
    this.ensureFarmAnimals(farm);
    return true;
  }

  private trySpawnFirstHouseOfLoop(): boolean {
    const farm = this.pickFarmForFirstHouse();
    if (!farm) return false;

    const pos = this.getRandomPosition({
      anchor: { x: farm.x, y: farm.y, width: 1, height: 1 },
      minDistance: 3,
      maxDistance: 2 + this.farms.length,
      maxNumAttempts: 40
    });
    if (!pos) return false;

    this.spawnHouseAt(pos.x, pos.y, farm.destination);
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
      maxDistance: Math.max(2, this.farms.length),
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
    const house = new Building(
      LJS.vec2(x, y),
      LJS.vec2(1, 1),
      makeId('house'),
      'house',
      destination
    );
    this.buildings.push(house);
    this.setStructureOccupancy(house, house.id);

    for (let p = 0; p < 2; p += 1) {
      const varianceX = this.rng.next() * 0.5 - 0.25;
      const varianceY = this.rng.next() * 0.5 - 0.25;
      this.villagers.push(
        new Villager(
          LJS.vec2(x + varianceX, y + varianceY),
          makeId('person'),
          house.id,
          destination
        )
      );
    }
  }

  private ensureTwoVillagersPerHouse(): void {
    for (const house of this.houses) {
      const residents = this.villagers.filter(
        (v) => v.homeHouseId === house.id
      );
      const missing = Math.max(0, 2 - residents.length);
      for (let i = 0; i < missing; i += 1) {
        const varianceX = this.rng.next() * 0.5 - 0.25;
        const varianceY = this.rng.next() * 0.5 - 0.25;
        this.villagers.push(
          new Villager(
            LJS.vec2(house.x + varianceX, house.y + varianceY),
            makeId('person'),
            house.id,
            house.destination
          )
        );
      }
    }
  }

  private pickFarmForFirstHouse(): Building | null {
    const fishFarm = this.farms.find((f) => f.destination === 'fish');
    const fishHouses = this.houses.filter((y) => y.destination === 'fish');

    if (fishFarm && fishHouses.length < 2) return fishFarm;
    if (!this.farms.length) return null;
    if (this.farms.length > 2)
      return this.farms[this.rng.int(0, this.farms.length)];
    return this.farms[this.farms.length - 1];
  }

  private getRandomNewType(): DestinationType {
    if (this.farms.length < 2) return TYPES[this.farms.length] ?? 'ox';

    const goodTypes = TYPES.filter((t) => {
      const y = this.houses.filter((house) => house.destination === t).length;
      const f = this.farms.filter((farm) => farm.destination === t).length;
      return y > f;
    });

    if (goodTypes.length) return goodTypes[this.rng.int(0, goodTypes.length)];
    return TYPES[this.rng.int(0, TYPES.length)];
  }

  private getRandomExistingType(): DestinationType {
    if (this.farms.length < 2)
      return TYPES[Math.max(0, this.farms.length - 1)] ?? 'ox';

    const scores = TYPES.map((t) => {
      const y = Math.max(
        1,
        this.houses.filter((house) => house.destination === t).length
      );
      const f = this.farms.filter((farm) => farm.destination === t).length;
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

  private getRandomFarmProps(destination: DestinationType): {
    width: number;
    height: number;
  } {
    if (destination === 'fish') return { width: 2, height: 2 };
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

  private backfillFarmDemandState(): void {
    for (const structure of this.buildings) {
      if (structure.role !== 'farm') continue;
      this.ensureFarmAnimals(structure);
      structure.numAnimals = (structure.animals ?? []).length;
      structure.numIssues = (structure.animals ?? []).filter(
        (a) => a.hasDemand
      ).length;
      structure.demand = structure.numIssues * structure.needyness;
    }
  }

  private ensureFarmAnimals(farm: Building): void {
    if (farm.role !== 'farm') return;

    if (!farm.animals) farm.animals = [];

    while (farm.animals.length < farm.numAnimals) {
      farm.animals.push(this.makeFarmAnimal(farm));
    }

    if (farm.animals.length > farm.numAnimals) {
      farm.animals.length = farm.numAnimals;
    }
  }

  private makeFarmAnimal(farm: Building): FarmAnimalState {
    return {
      id: makeId(`animal-${farm.destination}`),
      demandTimer: this.nextAnimalDemandTimerSeconds(farm),
      hasDemand: false
    };
  }

  private nextAnimalDemandTimerSeconds(farm: Building): number {
    if (farm.destination === 'ox') return 12 + this.rng.next() * 10;
    if (farm.destination === 'goat') return 9 + this.rng.next() * 8;
    return 16 + this.rng.next() * 12;
  }
}
