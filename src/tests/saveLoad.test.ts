import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Game } from '@core/Game';
import { BUILDING_CONFIG } from '@core/config';
import { Worker } from '@entities/Worker';
import * as LJS from 'littlejsengine';

// Mock localStorage
const mockLocalStorage: Record<string, string> = {};
const mockGetItem = vi.fn((key: string) => mockLocalStorage[key] || null);
const mockSetItem = vi.fn((key: string, val: string) => {
  mockLocalStorage[key] = val;
});
const mockRemoveItem = vi.fn((key: string) => {
  delete mockLocalStorage[key];
});

global.localStorage = {
  getItem: mockGetItem,
  setItem: mockSetItem,
  removeItem: mockRemoveItem,
  clear: vi.fn(() => {
    for (const key in mockLocalStorage) delete mockLocalStorage[key];
  }),
  length: 0,
  key: vi.fn()
} as any;

describe('Save/Load System', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key in mockLocalStorage) delete mockLocalStorage[key];
  });

  it('creates a valid snapshot', () => {
    const game = new Game(42);
    game.init();
    game.startPlay();

    const snapshot = game.toSnapshot();

    expect(snapshot.day).toBeDefined();
    expect(snapshot.seed).toBe(42);
    expect(snapshot.buildings).toBeInstanceOf(Array);
    expect(snapshot.workers).toBeInstanceOf(Array);
    expect(snapshot.paths).toBeInstanceOf(Array);
    expect(snapshot.gridTiles).toBeInstanceOf(Array);
  });

  it('saves and restores game state', () => {
    const game1 = new Game(123);
    game1.init();
    game1.startPlay();

    game1.addTestBuilding(10, 10, 'house', 'red');
    game1.addTestBuilding(20, 20, 'office', 'blue', 2, 3);
    game1.addTestPath(10, 10, 11, 10);
    game1.day = 5;
    game1.servedTrips = 42;

    const snapshot = game1.toSnapshot();

    const game2 = new Game(456);
    game2.restore(snapshot);

    expect(game2.day).toBe(5);
    expect(game2.servedTrips).toBe(42);
    expect(game2.buildings.length).toBe(2);
    expect(game2.paths.length).toBe(1);
    expect(game2.houses.length).toBe(1);
    expect(game2.offices.length).toBe(1);
  });

  it('restores building properties correctly', () => {
    const game1 = new Game(1);
    game1.init();
    game1.startPlay();

    const house = game1.addTestBuilding(5, 5, 'house', 'blue');
    const office = game1.addTestBuilding(10, 10, 'office', 'red', 2, 3);

    const snapshot = game1.toSnapshot();
    const game2 = new Game(2);
    game2.restore(snapshot);

    const restoredHouse = game2.houses[0];
    const restoredOffice = game2.offices[0];

    expect(restoredHouse.id).toBe(house.id);
    expect(restoredHouse.role).toBe('house');
    expect(restoredHouse.destination).toBe('blue');
    expect(restoredHouse.x).toBe(5);
    expect(restoredHouse.y).toBe(5);

    expect(restoredOffice.id).toBe(office.id);
    expect(restoredOffice.role).toBe('office');
    expect(restoredOffice.destination).toBe('red');
    expect(restoredOffice.width).toBe(2);
    expect(restoredOffice.height).toBe(3);
  });

  it('restores worker properties correctly', () => {
    const game1 = new Game(1);
    game1.init();
    game1.startPlay();

    // Add a house manually to have a known house ID
    const house = game1.addTestBuilding(0, 0, 'house', 'yellow');
    // Add workers directly (not through spawnHouseAt which creates another house)
    const worker1 = new Worker(LJS.vec2(0.25, 0.25), 'v-1', house.id, 'yellow');
    const worker2 = new Worker(LJS.vec2(0.75, 0.75), 'v-2', house.id, 'yellow');
    game1.workers = [worker1, worker2];

    // Set worker properties
    const worker = game1.workers[0];
    worker.task = 'toOffice';
    worker.assignedOfficeId = 'some-office';
    worker.x = 5;
    worker.y = 5;

    const snapshot = game1.toSnapshot();
    const game2 = new Game(2);
    game2.restore(snapshot);

    const restored = game2.workers[0];

    expect(restored.id).toBe(worker.id);
    expect(restored.homeHouseId).toBe(house.id);
    expect(restored.destinationType).toBe('yellow');
    expect(restored.task).toBe('toOffice');
    expect(restored.assignedOfficeId).toBe('some-office');
    expect(restored.x).toBe(5);
    expect(restored.y).toBe(5);
  });

  it('restores path network', () => {
    const game1 = new Game(1);
    game1.init();
    game1.startPlay();

    game1.addTestPath(0, 0, 1, 0);
    game1.addTestPath(1, 0, 2, 0);
    game1.addTestPath(2, 0, 2, 1);

    const snapshot = game1.toSnapshot();
    const game2 = new Game(2);
    game2.restore(snapshot);

    expect(game2.paths).toHaveLength(3);
    expect(game2.paths[0]).toEqual({ a: { x: 0, y: 0 }, b: { x: 1, y: 0 } });
  });

  it('preserves grid terrain on restore', () => {
    const game1 = new Game(1);
    game1.init();
    game1.startPlay();

    const t1 = game1.grid.get(5, 5);
    const t2 = game1.grid.get(6, 6);
    if (t1) t1.terrain = 'water';
    if (t2) t2.terrain = 'water';

    const snapshot = game1.toSnapshot();
    const game2 = new Game(2);
    game2.restore(snapshot);

    expect(game2.grid.get(5, 5)?.terrain).toBe('water');
    expect(game2.grid.get(6, 6)?.terrain).toBe('water');
    expect(game2.grid.get(0, 0)?.terrain).toBe('grass');
  });

  it('restores office demand state', () => {
    const game1 = new Game(1);
    game1.init();
    game1.startPlay();

    const office = game1.addTestBuilding(5, 5, 'office', 'red', 3, 2);
    office.forceTestDemand(true);

    const snapshot = game1.toSnapshot();
    const game2 = new Game(2);
    game2.restore(snapshot);

    const restoredOffice = game2.offices[0];

    expect(restoredOffice.numDemand).toBe(BUILDING_CONFIG.office.red.numDemand);
    expect(restoredOffice.numIssues).toBe(BUILDING_CONFIG.office.red.numDemand);
    expect(restoredOffice.demandTimers.length).toBe(
      BUILDING_CONFIG.office.red.numDemand
    );
  });

  it('handles multi-tile buildings in snapshot', () => {
    const game1 = new Game(1);
    game1.init();
    game1.startPlay();

    const office = game1.addTestBuilding(10, 10, 'office', 'yellow', 2, 3);

    const snapshot = game1.toSnapshot();
    const game2 = new Game(2);
    game2.restore(snapshot);

    const restored = game2.offices[0];

    expect(restored.width).toBe(2);
    expect(restored.height).toBe(3);
    expect(restored.x).toBe(10);
    expect(restored.y).toBe(10);
  });

  it('preserves autoSpawningEnabled flag', () => {
    const game1 = new Game(1);
    game1.init();
    game1.startPlay();

    game1.autoSpawningEnabled = false;

    const snapshot = game1.toSnapshot();
    const game2 = new Game(2);
    game2.restore(snapshot);

    expect(game2.autoSpawningEnabled).toBe(false);
  });

  it('preserves updateCount', () => {
    const game1 = new Game(1);
    game1.init();
    game1.startPlay();

    for (let i = 0; i < 100; i++) {
      game1.update(0.016);
    }

    const snapshot = game1.toSnapshot();
    const game2 = new Game(2);
    game2.restore(snapshot);

    expect(game2.updateCount).toBe(100);
  });
});
