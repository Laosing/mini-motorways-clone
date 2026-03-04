import * as LJS from 'littlejsengine';
import { GAME_CONFIG, SAVE_KEY } from './config';
import { SeededRng } from './rng';
import { StateMachine } from './stateMachine';
import { EventBus } from './events';
import { GridMap } from '@world/GridMap';
import { generateWorld } from '@world/generation';
import { applyCamera, type Camera } from '@world/camera';
import type {
  Building,
  DestinationType,
  FarmAnimalState
} from '@entities/Building';
import type { Villager } from '@entities/Villager';
import { makeId, primeIdCounterFromIds } from '@entities/Entity';
import { drawWorld } from '@systems/renderSystem';
import { handleInput } from '@systems/inputSystem';
import { updateVillagers } from '@systems/taskSystem';
import { loadSnapshot, saveNow } from '@systems/saveSystem';
import { setupHUD, updateHUD } from '@ui/hud';
import type { PathEdge } from '@systems/pathNetwork';
import { renderSvgScene } from '@ui/svgRenderer';

const SPAWNING_LOOP_LENGTH = 3000;
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
  buildings: Building[];
  villagers: Villager[];
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
  private yurtFailed = false;
  autoSpawningEnabled = true;

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
      loaded.buildings.every((b) => b.role === 'yurt' || b.role === 'farm')
    );

    if (loaded && isCompatibleSave) {
      this.restore(loaded);
      this.ensureTwoVillagersPerYurt();
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

    updateHUD(this);
  }

  render(): void {
    applyCamera(this.camera);
    drawWorld(this);
    renderSvgScene(this);
  }

  save(): void {
    saveNow(this);
    this.statusText = 'Saved';
  }

  get farms(): Building[] {
    return this.buildings.filter((b) => b.role === 'farm');
  }

  get yurts(): Building[] {
    return this.buildings.filter((b) => b.role === 'yurt');
  }

  toSnapshot(): Snapshot {
    return {
      day: this.day,
      timeInDay: this.timeInDay,
      gridTiles: this.grid.snapshot(),
      buildings: this.buildings.map((b) => ({
        ...b,
        assignedVillagerIds: [...b.assignedVillagerIds],
        animals: b.animals?.map((a) => ({ ...a }))
      })),
      villagers: this.villagers.map((v) => ({ ...v, path: [...v.path] })),
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

    this.buildings = snapshot.buildings.map((b) => ({
      ...b,
      assignedVillagerIds: [...(b.assignedVillagerIds ?? [])],
      animals: b.animals?.map((a) => ({ ...a }))
    }));

    const seenVillagerIds = new Set<string>();
    this.villagers = snapshot.villagers.map((v) => ({
      ...v,
      id: (() => {
        if (!seenVillagerIds.has(v.id)) {
          seenVillagerIds.add(v.id);
          return v.id;
        }
        let uniqueId = makeId('person');
        while (seenVillagerIds.has(uniqueId)) uniqueId = makeId('person');
        seenVillagerIds.add(uniqueId);
        return uniqueId;
      })(),
      path: [...v.path],
      assignedFarmId: v.assignedFarmId ?? null,
      dx: v.dx ?? 0,
      dy: v.dy ?? 0,
      rotation: v.rotation ?? 0,
      originalRouteLength: v.originalRouteLength ?? v.path.length,
      lastReachedPos: v.lastReachedPos ?? null
    }));
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

  private updateFarmDemand(dt: number): void {
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
      this.updateRandomness1 = this.rng.int(0, 200);
      this.updateRandomness2 = this.rng.int(0, 200);
      this.updateRandomness3 = this.rng.int(0, 200);
      this.updateRandomness4 = this.rng.int(0, 200);
    }

    if (
      this.updateCount === 0 ||
      (this.updateCount > 1000 &&
        this.updateCount % SPAWNING_LOOP_LENGTH ===
          (this.farms.length ? this.updateRandomness1 : 0))
    ) {
      if (
        !this.trySpawnFarm(
          this.updateCount > 10000 &&
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
      500 + (this.farms.length > 1 ? this.updateRandomness2 : 0)
    ) {
      this.yurtFailed = !this.trySpawnFirstYurtOfLoop();
      return;
    }

    if (
      this.yurtFailed &&
      this.updateCount % SPAWNING_LOOP_LENGTH === 600 + this.updateRandomness2
    ) {
      this.yurtFailed = !this.trySpawnFirstYurtOfLoop();
      return;
    }

    if (
      this.yurtFailed &&
      this.updateCount % SPAWNING_LOOP_LENGTH === 700 + this.updateRandomness2
    ) {
      this.yurtFailed = !this.trySpawnFirstYurtOfLoop();
      return;
    }

    if (
      this.updateCount % SPAWNING_LOOP_LENGTH ===
      1500 + this.updateRandomness3
    ) {
      this.yurtFailed = !this.trySpawnSecondYurtOfLoop();
      return;
    }

    if (
      this.yurtFailed &&
      this.updateCount % SPAWNING_LOOP_LENGTH === 1600 + this.updateRandomness3
    ) {
      this.yurtFailed = !this.trySpawnSecondYurtOfLoop();
      return;
    }

    if (
      this.yurtFailed &&
      this.updateCount % SPAWNING_LOOP_LENGTH === 1700 + this.updateRandomness3
    ) {
      this.yurtFailed = !this.trySpawnSecondYurtOfLoop();
      return;
    }

    if (
      this.updateCount > 20000 &&
      this.updateCount % SPAWNING_LOOP_LENGTH === 2500 + this.updateRandomness4
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
    const farm: Building = {
      id: makeId('farm'),
      type: 'building',
      role: 'farm',
      destination,
      width: farmProps.width,
      height: farmProps.height,
      x: pos.x,
      y: pos.y,
      active: true,
      demand: 0,
      needyness: cfg.needyness,
      numAnimals: cfg.numAnimals,
      numIssues: 0,
      assignedVillagerIds: [],
      animals: []
    };
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

  private trySpawnFirstYurtOfLoop(): boolean {
    const farm = this.pickFarmForFirstYurt();
    if (!farm) return false;

    const pos = this.getRandomPosition({
      anchor: { x: farm.x, y: farm.y, width: 1, height: 1 },
      minDistance: 3,
      maxDistance: 2 + this.farms.length,
      maxNumAttempts: 40
    });
    if (!pos) return false;

    this.spawnYurtAt(pos.x, pos.y, farm.destination);
    return true;
  }

  private trySpawnSecondYurtOfLoop(): boolean {
    const type = this.getRandomExistingType();
    const sameTypeYurts = this.yurts.filter((y) => y.destination === type);
    const friendYurt = sameTypeYurts.length
      ? sameTypeYurts[this.rng.int(0, sameTypeYurts.length)]
      : null;
    if (!friendYurt) return false;

    const pos = this.getRandomPosition({
      anchor: { x: friendYurt.x, y: friendYurt.y, width: 1, height: 1 },
      minDistance: 1,
      maxDistance: Math.max(2, this.farms.length),
      maxNumAttempts: 40
    });
    if (!pos) return false;

    this.spawnYurtAt(pos.x, pos.y, type);
    return true;
  }

  private spawnYurtAt(
    x: number,
    y: number,
    destination: DestinationType
  ): void {
    const yurt: Building = {
      id: makeId('yurt'),
      type: 'building',
      role: 'yurt',
      destination,
      width: 1,
      height: 1,
      x,
      y,
      active: true,
      demand: 0,
      needyness: 0,
      numAnimals: 0,
      numIssues: 0,
      assignedVillagerIds: []
    };
    this.buildings.push(yurt);
    this.setStructureOccupancy(yurt, yurt.id);

    for (let p = 0; p < 2; p += 1) {
      const varianceX = this.rng.next() * 0.5 - 0.25;
      const varianceY = this.rng.next() * 0.5 - 0.25;
      this.villagers.push({
        id: makeId('person'),
        type: 'villager',
        x: x + varianceX,
        y: y + varianceY,
        speed: 2,
        task: 'idle',
        homeYurtId: yurt.id,
        destinationType: destination,
        target: null,
        path: [],
        waitTimer: 0,
        assignedFarmId: null,
        dx: 0,
        dy: 0,
        rotation: 0,
        originalRouteLength: 0,
        lastReachedPos: null
      });
    }
  }

  private ensureTwoVillagersPerYurt(): void {
    for (const yurt of this.yurts) {
      const residents = this.villagers.filter((v) => v.homeYurtId === yurt.id);
      const missing = Math.max(0, 2 - residents.length);
      for (let i = 0; i < missing; i += 1) {
        const varianceX = this.rng.next() * 0.5 - 0.25;
        const varianceY = this.rng.next() * 0.5 - 0.25;
        this.villagers.push({
          id: makeId('person'),
          type: 'villager',
          x: yurt.x + varianceX,
          y: yurt.y + varianceY,
          speed: 2,
          task: 'idle',
          homeYurtId: yurt.id,
          destinationType: yurt.destination,
          target: null,
          path: [],
          waitTimer: 0,
          assignedFarmId: null,
          dx: 0,
          dy: 0,
          rotation: 0,
          originalRouteLength: 0,
          lastReachedPos: null
        });
      }
    }
  }

  private pickFarmForFirstYurt(): Building | null {
    const fishFarm = this.farms.find((f) => f.destination === 'fish');
    const fishYurts = this.yurts.filter((y) => y.destination === 'fish');

    if (fishFarm && fishYurts.length < 2) return fishFarm;
    if (!this.farms.length) return null;
    if (this.farms.length > 2)
      return this.farms[this.rng.int(0, this.farms.length)];
    return this.farms[this.farms.length - 1];
  }

  private getRandomNewType(): DestinationType {
    if (this.farms.length < 2) return TYPES[this.farms.length] ?? 'ox';

    const goodTypes = TYPES.filter((t) => {
      const y = this.yurts.filter((yurt) => yurt.destination === t).length;
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
        this.yurts.filter((yurt) => yurt.destination === t).length
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
    for (const structure of this.buildings) {
      if (structure.width && structure.height) continue;
      if (structure.role === 'yurt') {
        structure.width = 1;
        structure.height = 1;
      } else if (structure.destination === 'fish') {
        structure.width = 2;
        structure.height = 2;
      } else {
        structure.width = 3;
        structure.height = 2;
      }
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
