import { describe, expect, it } from 'vitest';
import * as LJS from 'littlejsengine';
import { Game } from '@core/Game';
import { Worker } from '@entities/Worker';
import { updateWorkers } from '@systems/taskSystem';

function movingWorker(
  id: string,
  x: number,
  y: number,
  path: Array<{ x: number; y: number }>
): Worker {
  const worker = new Worker(LJS.vec2(x, y), id, `home-${id}`, 'red');
  worker.task = 'toHome';
  worker.target = { ...path[path.length - 1] };
  worker.path = path.map((node) => ({ ...node }));
  worker.lastReachedPos = { x, y };
  return worker;
}

describe('worker edge lanes', () => {
  it('keeps the right lane on the bottom and top grid edges', () => {
    const game = new Game(1);
    const topY = game.grid.height - 1;
    const bottomEastbound = movingWorker('bottom-east', 1, 0, [
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 4, y: 0 }
    ]);
    const topWestbound = movingWorker('top-west', 4, topY, [
      { x: 3, y: topY },
      { x: 2, y: topY },
      { x: 1, y: topY }
    ]);
    game.workers = [bottomEastbound, topWestbound];

    updateWorkers(game, 1 / 60);

    expect(bottomEastbound.y).toBeLessThan(0);
    expect(topWestbound.y).toBeGreaterThan(topY);
  });

  it('keeps collision detection active outside edge-node centers', () => {
    const game = new Game(2);
    const first = new Worker(
      LJS.vec2(2, -0.15),
      'edge-first',
      'edge-home-first',
      'red'
    );
    const second = new Worker(
      LJS.vec2(2.2, -0.15),
      'edge-second',
      'edge-home-second',
      'red'
    );
    game.workers = [first, second];

    const initialDistance = Math.hypot(first.x - second.x, first.y - second.y);
    updateWorkers(game, 0);

    expect(Math.hypot(first.x - second.x, first.y - second.y)).toBeGreaterThan(
      initialDistance
    );
  });
});
