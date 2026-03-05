import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Game } from '@core/Game';
import * as LJS from 'littlejsengine';

// Mock LittleJS globals and localStorage for Node testing
const mockLocalStorage: Record<string, string> = {};
global.localStorage = {
  getItem: vi.fn((key) => mockLocalStorage[key] || null),
  setItem: vi.fn((key, val) => {
    mockLocalStorage[key] = val;
  }),
  removeItem: vi.fn((key) => {
    delete mockLocalStorage[key];
  }),
  clear: vi.fn(() => {
    for (const key in mockLocalStorage) delete mockLocalStorage[key];
  }),
  length: 0,
  key: vi.fn()
} as any;

describe('Game Mechanics & Persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key in mockLocalStorage) delete mockLocalStorage[key];
  });

  it('correctly snapshots and restores game state', () => {
    const game = new Game(123);
    game.init();

    // Use new test helpers
    game.addTestBuilding(10, 10, 'house', 'red');
    game.addTestPath(10, 10, 11, 10);
    game.day = 5;
    game.servedTrips = 42;

    const snapshot = game.toSnapshot();

    // Create a new game instance and restore from snapshot
    const newGame = new Game(456);
    newGame.restore(snapshot);

    expect(newGame.day).toBe(5);
    expect(newGame.servedTrips).toBe(42);
    expect(newGame.buildings.length).toBe(snapshot.buildings.length);
    expect(newGame.paths.length).toBe(1);
    expect(newGame.paths[0].a).toEqual({ x: 10, y: 10 });

    // Verify building positions are restored correctly
    const restoredHouse = newGame.houses[0];
    expect(restoredHouse.x).toBe(10);
    expect(restoredHouse.y).toBe(10);
  });

  it('updates game time and days correctly', () => {
    const game = new Game(1);
    game.init();
    game.startPlay();

    const initialDay = game.day;
    const dayLength = 20; // GAME_CONFIG.dayLengthSeconds

    // Fast forward exactly one day
    game.update(dayLength);

    expect(game.day).toBe(initialDay + 1);
    expect(game.timeInDay).toBe(0);
  });

  it('handles animal demand state management', () => {
    const game = new Game(1);
    game.init();
    game.startPlay();

    // Use test helpers to create a controlled environment
    const farm = game.addTestBuilding(5, 5, 'farm', 'red', 3, 2);
    farm.forceTestDemand(true);

    expect(farm.numIssues).toBe(farm.numAnimals);
    expect(farm.demand).toBeGreaterThan(0);

    // Simulate resolution
    game.consumeFarmIssue(farm);
    expect(farm.numIssues).toBe(farm.numAnimals - 1);
  });
});
