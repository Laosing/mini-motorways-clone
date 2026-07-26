import { describe, expect, it } from 'vitest';
import { Game } from '@core/Game';
import { SPAWNING_CONFIG } from '@core/config';

type HouseSpawnInternals = {
  trySpawnFirstHouseOfLoop(): boolean;
  trySpawnSecondHouseOfLoop(): boolean;
};

function spawningInternals(game: Game): HouseSpawnInternals {
  return game as unknown as HouseSpawnInternals;
}

function neighborhoodDistance(
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

describe('house neighborhoods', () => {
  it('spawns the first house of a cycle near houses of the same color', () => {
    const game = new Game(17);
    game.addTestBuilding(30, 15, 'office', 'red', 2, 3);
    const existingRedHouse = game.addTestBuilding(4, 4, 'house', 'red');

    expect(spawningInternals(game).trySpawnFirstHouseOfLoop()).toBe(true);

    const spawnedHouse = game.houses.at(-1);
    expect(spawnedHouse?.destination).toBe('red');
    expect(
      neighborhoodDistance(spawnedHouse!, existingRedHouse)
    ).toBeLessThanOrEqual(SPAWNING_CONFIG.houseNeighborhoodRadius + 1);
    expect(
      neighborhoodDistance(spawnedHouse!, game.offices[0])
    ).toBeGreaterThan(SPAWNING_CONFIG.houseNeighborhoodRadius + 1);
  });

  it('keeps the second house of a cycle in its color neighborhood', () => {
    const game = new Game(23);
    game.addTestBuilding(30, 15, 'office', 'red', 2, 3);
    const existingRedHouse = game.addTestBuilding(5, 5, 'house', 'red');

    expect(spawningInternals(game).trySpawnSecondHouseOfLoop()).toBe(true);

    const spawnedHouse = game.houses.at(-1);
    expect(spawnedHouse?.destination).toBe('red');
    expect(
      neighborhoodDistance(spawnedHouse!, existingRedHouse)
    ).toBeLessThanOrEqual(SPAWNING_CONFIG.houseNeighborhoodRadius + 1);
  });
});
