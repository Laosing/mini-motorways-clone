import { describe, expect, it } from 'vitest';
import { Game } from '@core/Game';

describe('Office Demand System', () => {
  it('initializes office demand timers', () => {
    const game = new Game(1);
    game.init();
    game.startPlay();

    const office = game.addTestBuilding(5, 5, 'office', 'red', 3, 2);

    expect(office.numDemand).toBe(3);
    expect(office.demandTimers.length).toBe(3);
  });

  it('decrements active demand timers', () => {
    const game = new Game(1);
    game.init();
    game.startPlay();

    const office = game.addTestBuilding(5, 5, 'office', 'blue', 2, 2);
    // Force one timer to be zero (active demand)
    office.demandTimers = [0, 5];

    game.updateOfficeDemand(1.0);

    expect(office.demandTimers[0]).toBe(0); // Still zero
    expect(office.demandTimers[1]).toBe(4); // Decremented
  });

  it('creates active issues when timers reach zero', () => {
    const game = new Game(1);
    game.init();
    game.startPlay();

    const office = game.addTestBuilding(5, 5, 'office', 'yellow', 3, 2);
    office.demandTimers = [0, 1, 0];

    game.updateOfficeDemand(0);

    expect(office.numIssues).toBe(2);
  });

  it('computes demand correctly based on active issues', () => {
    const game = new Game(1);
    game.init();
    game.startPlay();

    const office = game.addTestBuilding(5, 5, 'office', 'red', 3, 2);
    office.needyness = 100;
    office.demandTimers = [0, 5, 0];

    game.updateOfficeDemand(0);

    expect(office.numIssues).toBe(2);
    expect(office.demand).toBe(200); // 2 * 100
  });

  it('consumes office issue correctly', () => {
    const game = new Game(1);
    game.init();
    game.startPlay();

    const office = game.addTestBuilding(5, 5, 'office', 'blue', 3, 2);
    office.demandTimers = [0, 0, 5];
    office.numIssues = 2;

    const result = game.consumeOfficeIssue(office);

    expect(result).toBe(true);
    expect(office.numIssues).toBe(1);
    expect(office.demandTimers[0]).toBeGreaterThan(0); // Reset
    expect(office.demandTimers[1]).toBe(0); // Still active
  });

  it('returns false when no active issues to consume', () => {
    const game = new Game(1);
    game.init();
    game.startPlay();

    const office = game.addTestBuilding(5, 5, 'office', 'red', 3, 2);
    office.demandTimers = [5, 5, 5];
    office.numIssues = 0;

    const result = game.consumeOfficeIssue(office);

    expect(result).toBe(false);
    expect(office.numIssues).toBe(0);
  });

  it('resets demand timer on consumption based on office type', () => {
    const game = new Game(1);
    game.init();
    game.startPlay();

    const redOffice = game.addTestBuilding(0, 0, 'office', 'red', 3, 2);
    const blueOffice = game.addTestBuilding(10, 10, 'office', 'blue', 3, 2);
    const yellowOffice = game.addTestBuilding(20, 20, 'office', 'yellow', 5, 2);

    redOffice.demandTimers = [0, 5, 5];
    blueOffice.demandTimers = [0, 5, 5];
    yellowOffice.demandTimers = [0, 5, 5, 5, 5];

    game.consumeOfficeIssue(redOffice);
    game.consumeOfficeIssue(blueOffice);
    game.consumeOfficeIssue(yellowOffice);

    // Red office: 12 + random(0,10) → should be > 12
    expect(redOffice.demandTimers[0]).toBeGreaterThan(12);
    // Blue office: 9 + random(0,8) → should be > 9
    expect(blueOffice.demandTimers[0]).toBeGreaterThan(9);
    // Yellow office: 16 + random(0,12) → should be > 16
    expect(yellowOffice.demandTimers[0]).toBeGreaterThan(16);
  });

  it('cleans up assigned villager IDs for non-existent villagers', () => {
    const game = new Game(1);
    game.init();
    game.startPlay();

    const office = game.addTestBuilding(5, 5, 'office', 'red', 3, 2);
    office.assignedVillagerIds = ['non-existent-1', 'non-existent-2'];

    game.updateOfficeDemand(0);

    // Should remove non-existent villager IDs
    expect(office.assignedVillagerIds).toHaveLength(0);
  });

  it('keeps assigned villager IDs for existing villagers', () => {
    const game = new Game(1);
    game.init();
    game.startPlay();

    const office = game.addTestBuilding(5, 5, 'office', 'blue', 3, 2);
    const house = game.addTestBuilding(0, 0, 'house', 'blue');
    game.spawnHouseAt(0, 2, 'blue');

    const villager = game.villagers[0];
    office.assignedVillagerIds = [villager.id];

    game.updateOfficeDemand(0);

    expect(office.assignedVillagerIds).toContain(villager.id);
  });

  it('handles multiple offices with different destinations', () => {
    const game = new Game(1);
    game.init();
    game.startPlay();

    const redOffice = game.addTestBuilding(0, 0, 'office', 'red', 3, 2);
    const blueOffice = game.addTestBuilding(10, 10, 'office', 'blue', 3, 2);
    const yellowOffice = game.addTestBuilding(20, 20, 'office', 'yellow', 5, 2);

    redOffice.forceTestDemand(true);
    blueOffice.forceTestDemand(false);
    yellowOffice.forceTestDemand(true);

    game.updateOfficeDemand(0);

    expect(redOffice.numIssues).toBe(3);
    expect(blueOffice.numIssues).toBe(0);
    expect(yellowOffice.numIssues).toBe(5);
  });

  it('updates demand based on numDemand changes', () => {
    const game = new Game(1);
    game.init();
    game.startPlay();

    const office = game.addTestBuilding(5, 5, 'office', 'red', 3, 2);

    expect(office.numDemand).toBe(3);
    expect(office.demandTimers.length).toBe(3);

    office.numDemand = 5;
    game.updateOfficeDemand(0);

    expect(office.demandTimers.length).toBe(5);
  });
});
