import { describe, expect, it } from 'vitest';
import { Game } from '@core/Game';

type OfficeSpawnInternals = {
  trySpawnOffice(destination: 'red' | 'blue' | 'yellow'): boolean;
};

function spawningInternals(game: Game): OfficeSpawnInternals {
  return game as unknown as OfficeSpawnInternals;
}

function spawnOffice(seed: number, destination: 'red' | 'blue'): Game {
  const game = new Game(seed);
  expect(spawningInternals(game).trySpawnOffice(destination)).toBe(true);
  return game;
}

describe('mega offices', () => {
  it('occasionally spawns an exact 4x3 office alongside normal offices', () => {
    const normalGame = spawnOffice(1, 'red');
    const megaGame = spawnOffice(1972, 'red');

    expect(megaGame.offices[0]).toMatchObject({
      width: 4,
      height: 3,
      role: 'office'
    });
    expect(
      [
        megaGame.offices[0].entrances.length,
        normalGame.offices[0].entrances.length
      ].every((count) => count === 1 || count === 2)
    ).toBe(true);
  });

  it('occupies all twelve mega-office grid tiles', () => {
    const game = spawnOffice(1972, 'blue');
    const office = game.offices[0];
    for (let x = office.x; x < office.x + office.width; x++) {
      for (let y = office.y; y < office.y + office.height; y++) {
        expect(game.grid.get(x, y)?.occupantId).toBe(office.id);
      }
    }
  });
});
