import { describe, expect, it } from 'vitest';
import {
  Game,
  hasHouseSpawnClearance,
  hasOneTileBuildingClearance
} from '@core/Game';

describe('building spawn spacing', () => {
  it('rejects adjacent and diagonal placements', () => {
    const game = new Game(1);
    game.addTestBuilding(5, 5, 'office', 'red', 2, 3);

    expect(hasOneTileBuildingClearance(game.buildings, 7, 5, 1, 1)).toBe(false);
    expect(hasOneTileBuildingClearance(game.buildings, 7, 8, 1, 1)).toBe(false);
  });

  it('allows placement with one complete empty tile between buildings', () => {
    const game = new Game(2);
    game.addTestBuilding(5, 5, 'office', 'blue', 2, 3);

    expect(hasOneTileBuildingClearance(game.buildings, 8, 5, 1, 1)).toBe(true);
    expect(hasOneTileBuildingClearance(game.buildings, 5, 9, 1, 1)).toBe(true);
  });

  it('prevents direct public house spawning beside a building', () => {
    const game = new Game(3);
    game.addTestBuilding(5, 5, 'office', 'yellow', 2, 3);

    game.spawnHouseAt(7, 5, 'yellow');

    expect(game.houses).toHaveLength(0);
  });

  it('allows houses to spawn directly beside other houses', () => {
    const game = new Game(4);
    game.addTestBuilding(5, 5, 'house', 'red');

    game.spawnHouseAt(6, 5, 'blue');

    expect(game.houses).toHaveLength(2);
    expect(game.houses[1]).toMatchObject({
      x: 6,
      y: 5,
      destination: 'blue'
    });
  });

  it('still prevents houses from overlapping other houses', () => {
    const game = new Game(5);
    game.addTestBuilding(5, 5, 'house', 'red');

    expect(hasHouseSpawnClearance(game.buildings, 5, 5, 1, 1)).toBe(false);
    game.spawnHouseAt(5, 5, 'yellow');

    expect(game.houses).toHaveLength(1);
  });

  it('keeps one empty tile around factories even when near a house', () => {
    const game = new Game(6);
    game.addTestBuilding(5, 5, 'house', 'red');

    expect(hasOneTileBuildingClearance(game.buildings, 6, 5, 2, 3)).toBe(false);
    expect(hasOneTileBuildingClearance(game.buildings, 7, 5, 2, 3)).toBe(true);
  });
});
