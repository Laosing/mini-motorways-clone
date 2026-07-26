import { describe, expect, it } from 'vitest';
import * as LJS from 'littlejsengine';
import { Game } from '@core/Game';
import { WORKER_CONFIG } from '@core/config';
import { Worker } from '@entities/Worker';
import { updateWorkers } from '@systems/taskSystem';

describe('stuck worker recovery', () => {
  it('replaces a stuck worker at their house and clears office assignment', () => {
    const game = new Game(1);
    const house = game.addTestBuilding(4, 4, 'house', 'red');
    const office = game.addTestBuilding(10, 4, 'office', 'red', 2, 3);
    const worker = new Worker(LJS.vec2(5, 4), 'stuck-1', house.id, 'red');
    worker.task = 'toOffice';
    worker.target = { x: office.x, y: office.y };
    worker.path = [{ x: 6, y: 4 }];
    worker.assignedOfficeId = office.id;
    worker.lastPosForStuck = { x: worker.x, y: worker.y };
    worker.stuckTimer = WORKER_CONFIG.stuckTimerMax;
    office.assignedWorkerIds = [worker.id];
    game.workers = [worker];

    updateWorkers(game, 0);

    expect(game.workers).toHaveLength(1);
    const replacement = game.workers[0];
    expect(replacement.id).not.toBe(worker.id);
    expect(replacement.homeHouseId).toBe(house.id);
    expect(replacement.destinationType).toBe(house.destination);
    expect(replacement.task).toBe('idle');
    expect(Math.abs(replacement.x - house.x)).toBeLessThanOrEqual(0.25);
    expect(Math.abs(replacement.y - house.y)).toBeLessThanOrEqual(0.25);
    expect(office.assignedWorkerIds).not.toContain(worker.id);
    expect(worker.destroyed).toBe(true);
  });

  it('replaces an idle worker stranded away from home', () => {
    const game = new Game(2);
    const house = game.addTestBuilding(3, 3, 'house', 'blue');
    const worker = new Worker(LJS.vec2(8, 8), 'lost-1', house.id, 'blue');
    worker.stuckTimer = WORKER_CONFIG.stuckTimerMax - 0.1;
    game.workers = [worker];

    updateWorkers(game, 0.2);

    expect(game.workers).toHaveLength(1);
    expect(game.workers[0].id).not.toBe(worker.id);
    expect(game.workers[0].homeHouseId).toBe(house.id);
    expect(worker.destroyed).toBe(true);
  });
});
