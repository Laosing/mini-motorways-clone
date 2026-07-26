import { describe, expect, it } from 'vitest';
import { Game, hasOneTileBuildingClearance } from '@core/Game';

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
});
