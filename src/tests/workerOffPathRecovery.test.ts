import { describe, expect, it } from 'vitest';
import * as LJS from 'littlejsengine';
import { Game } from '@core/Game';
import { Worker } from '@entities/Worker';
import { updateWorkers } from '@systems/taskSystem';

describe('off-path worker recovery', () => {
  it('teleports the same worker home after five seconds off path', () => {
    const game = new Game(1);
    const home = game.addTestBuilding(2, 2, 'house', 'red');
    const office = game.addTestBuilding(10, 10, 'office', 'red', 2, 3);
    const worker = new Worker(LJS.vec2(8, 8), 'off-path', home.id, 'red');
    worker.task = 'toOffice';
    worker.target = { x: office.x, y: office.y };
    worker.path = [{ x: 9, y: 8 }];
    worker.assignedOfficeId = office.id;
    office.assignedWorkerIds = [worker.id];
    game.workers = [worker];

    updateWorkers(game, 4.9);
    expect(worker.task).toBe('toOffice');

    updateWorkers(game, 0.2);

    expect(game.workers[0]).toBe(worker);
    expect(worker.destroyed).toBe(false);
    expect(worker.x).toBe(home.x);
    expect(worker.y).toBe(home.y);
    expect(worker.task).toBe('idle');
    expect(worker.path).toEqual([]);
    expect(worker.target).toBeNull();
    expect(worker.assignedOfficeId).toBeNull();
    expect(office.assignedWorkerIds).not.toContain(worker.id);
  });

  it('resets the timer while the worker is on a path', () => {
    const game = new Game(2);
    const home = game.addTestBuilding(1, 1, 'house', 'blue');
    const worker = new Worker(LJS.vec2(5, 5), 'on-path', home.id, 'blue');
    worker.offPathTimer = 4.9;
    game.paths = [{ a: { x: 4, y: 5 }, b: { x: 6, y: 5 } }];
    game.workers = [worker];

    updateWorkers(game, 0.2);

    expect(worker.offPathTimer).toBe(0);
    expect(worker.x).toBe(5);
    expect(worker.y).toBe(5);
  });

  it('does not recover workers parked at an office', () => {
    const game = new Game(3);
    const home = game.addTestBuilding(1, 1, 'house', 'yellow');
    const worker = new Worker(LJS.vec2(8, 8), 'parked', home.id, 'yellow');
    worker.task = 'atOffice';
    worker.waitTimer = 10;
    worker.offPathTimer = 4.9;
    game.workers = [worker];

    updateWorkers(game, 0.2);

    expect(worker.task).toBe('atOffice');
    expect(worker.x).toBe(8);
    expect(worker.y).toBe(8);
    expect(worker.offPathTimer).toBe(0);
  });
});
