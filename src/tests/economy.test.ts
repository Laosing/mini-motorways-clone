import { describe, expect, it } from 'vitest';
import { Game } from '@core/Game';
import { updateVillagers } from '@systems/taskSystem';
import { Villager } from '@entities/Villager';
import * as LJS from 'littlejsengine';

describe('service loop', () => {
  it('people only leave home when path exists to matching office', () => {
    const game = new Game(1);
    game.init();
    game.startPlay();

    // Set up a controlled test scenario instead of relying on auto-spawning
    const house = game.addTestBuilding(0, 0, 'house', 'red');
    const office = game.addTestBuilding(5, 0, 'office', 'red', 3, 2);

    // Create a villager at the house
    const villager = new Villager(LJS.vec2(0, 0), 'v-1', house.id, 'red');
    game.villagers = [villager];

    // Villager should start idle
    expect(villager.task).toBe('idle');

    // Update with no demand - villager should stay idle
    updateVillagers(game, 0.1);
    expect(villager.task).toBe('idle');

    // Set up demand on the office
    office.demandTimers = [0];
    office.numDemand = 1;
    office.numIssues = 1;
    office.demand = office.needyness;

    // Create a minimal Manhattan path between house and matching office
    let x = house.x;
    let y = house.y;
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

    // After updating with demand and path, villager should get a task
    updateVillagers(game, 0.1);
    expect(['toOffice', 'atOffice']).toContain(villager.task);
  });
});
