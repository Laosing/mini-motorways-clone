import { describe, expect, it } from 'vitest';
import { Game } from '@core/Game';
import { updateVillagers } from '@systems/taskSystem';

// legacy filename kept, now validates the Tiny Yurts-style service loop

describe('service loop', () => {
  it('people only leave home when path exists to matching office', () => {
    const game = new Game(1);
    game.init();
    game.startPlay();

    for (let i = 0; i < 520; i += 1) game.update(1 / 60);

    const villager = game.villagers[0];
    expect(villager).toBeDefined();
    expect(villager.task).toBe('idle');

    updateVillagers(game, 0.1);
    expect(villager.task).toBe('idle');

    const home = game.houses.find((y) => y.id === villager.homeHouseId)!;
    const office = game.offices.find(
      (f) => f.destination === villager.destinationType
    )!;
    // Set up demand using the new demandTimers system
    if (!office.demandTimers.length) {
      office.demandTimers = [0];
      office.numAnimals = 1;
    } else {
      office.demandTimers = office.demandTimers.map((_: any, i: number) =>
        i === 0 ? 0 : 10
      );
    }
    office.numIssues = 1;
    office.demand = office.needyness;

    // Create a minimal Manhattan path between house and matching office.
    let x = home.x;
    let y = home.y;
    while (x !== office.x) {
      const nextX = x + Math.sign(office.x - x);
      game.paths.push({ a: { x, y }, b: { x: nextX, y } });
      x = nextX;
    }
    while (y !== office.y) {
      const nextY = y + Math.sign(office.y - y);
      game.paths.push({ a: { x, y }, b: { x, y: nextY } });
      y = nextY;
    }

    updateVillagers(game, 0.1);
    expect(['toOffice', 'atOffice']).toContain(villager.task);
  });
});
