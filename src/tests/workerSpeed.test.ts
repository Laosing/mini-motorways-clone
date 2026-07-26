import { describe, expect, it } from 'vitest';
import * as LJS from 'littlejsengine';
import { Game } from '@core/Game';
import { Worker } from '@entities/Worker';
import { updateWorkers } from '@systems/taskSystem';

function createMovingWorker(
  id: string,
  path: Array<{ x: number; y: number }>
): Worker {
  const worker = new Worker(LJS.vec2(1, 1), id, 'house-test', 'red');
  worker.task = 'toHome';
  worker.target = { ...path[path.length - 1] };
  worker.path = path.map((node) => ({ ...node }));
  worker.lastReachedPos = { x: 1, y: 1 };
  return worker;
}

describe('worker speed', () => {
  it('allows a higher top speed on straight road segments', () => {
    const straightGame = new Game(1);
    const turningGame = new Game(2);
    const straightWorker = createMovingWorker('straight', [
      { x: 2, y: 1 },
      { x: 3, y: 1 }
    ]);
    const turningWorker = createMovingWorker('turning', [
      { x: 2, y: 1 },
      { x: 2, y: 2 }
    ]);
    straightGame.workers = [straightWorker];
    turningGame.workers = [turningWorker];

    for (let frame = 0; frame < 30; frame++) {
      updateWorkers(straightGame, 0);
      updateWorkers(turningGame, 0);
    }

    expect(Math.hypot(straightWorker.dx, straightWorker.dy)).toBeGreaterThan(
      Math.hypot(turningWorker.dx, turningWorker.dy) * 1.25
    );
  });
});
