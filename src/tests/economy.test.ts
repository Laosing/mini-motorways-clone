import { describe, expect, it } from 'vitest';
import { Game } from '@core/Game';
import { updateVillagers } from '@systems/taskSystem';

// legacy filename kept, now validates the Tiny Yurts-style service loop

describe('service loop', () => {
  it('people only leave home when path exists to matching farm', () => {
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
    const farm = game.farms.find(
      (f) => f.destination === villager.destinationType
    )!;
    // Set up demand using the new demandTimers system
    if (!farm.demandTimers.length) {
      farm.demandTimers = [0];
      farm.numAnimals = 1;
    } else {
      farm.demandTimers = farm.demandTimers.map((_, i) => i === 0 ? 0 : 10);
    }
    farm.numIssues = 1;
    farm.demand = farm.needyness;

    // Create a minimal Manhattan path between house and matching farm.
    let x = home.x;
    let y = home.y;
    while (x !== farm.x) {
      const nextX = x + Math.sign(farm.x - x);
      game.paths.push({ a: { x, y }, b: { x: nextX, y } });
      x = nextX;
    }
    while (y !== farm.y) {
      const nextY = y + Math.sign(farm.y - y);
      game.paths.push({ a: { x, y }, b: { x, y: nextY } });
      y = nextY;
    }

    updateVillagers(game, 0.1);
    expect(['toFarm', 'atFarm']).toContain(villager.task);
  });
});
