import { describe, expect, it } from 'vitest';
import * as LJS from 'littlejsengine';
import { Game } from '@core/Game';
import { Worker } from '@entities/Worker';
import { updateWorkers } from '@systems/taskSystem';

function spawnFactoryWithEntranceCount(count: 1 | 2): Game {
  for (let seed = 1; seed <= 50; seed++) {
    const game = new Game(seed);
    game.init();
    game.update(0);
    if (game.offices[0]?.entrances.length === count) return game;
  }
  throw new Error(`Could not find deterministic ${count}-entrance factory`);
}

describe('factory entrances', () => {
  it('uses a 50% roll to create either one or two entrances', () => {
    const singleEntranceGame = spawnFactoryWithEntranceCount(1);
    const twoEntranceGame = spawnFactoryWithEntranceCount(2);

    expect(singleEntranceGame.offices[0].entrances).toHaveLength(1);
    expect(singleEntranceGame.paths).toHaveLength(1);
    expect(twoEntranceGame.offices[0].entrances).toHaveLength(2);
  });

  it('connects both entrance paths through the factory interior', () => {
    const game = spawnFactoryWithEntranceCount(2);

    const office = game.offices[0];
    expect(office).toBeDefined();
    expect(game.paths.every((path) => path.locked)).toBe(true);
    const restored = new Game(5);
    restored.restore(game.toSnapshot());
    expect(restored.paths.every((path) => path.locked)).toBe(true);

    const start = office.entrances[0].entryTile;
    const end = office.entrances[1].entryTile;

    let current = { ...start };
    while (current.x !== end.x || current.y !== end.y) {
      const next =
        current.x !== end.x
          ? {
              x: current.x + Math.sign(end.x - current.x),
              y: current.y
            }
          : {
              x: current.x,
              y: current.y + Math.sign(end.y - current.y)
            };
      expect(
        game.paths.some(
          (path) =>
            ((path.a.x === current.x && path.a.y === current.y) ||
              (path.b.x === current.x && path.b.y === current.y)) &&
            ((path.a.x === next.x && path.a.y === next.y) ||
              (path.b.x === next.x && path.b.y === next.y))
        )
      ).toBe(true);
      current = next;
    }
  });

  it('uses every interior tile without a path as a parking spot', () => {
    for (const entranceCount of [1, 2] as const) {
      const game = spawnFactoryWithEntranceCount(entranceCount);
      const office = game.offices[0];
      const isInsideOffice = (tile: { x: number; y: number }) =>
        tile.x >= office.x &&
        tile.x < office.x + office.width &&
        tile.y >= office.y &&
        tile.y < office.y + office.height;
      const pathTiles = new Set<string>();

      for (const path of game.paths) {
        if (isInsideOffice(path.a)) pathTiles.add(`${path.a.x},${path.a.y}`);
        if (isInsideOffice(path.b)) pathTiles.add(`${path.b.x},${path.b.y}`);
      }

      const expectedParkingTiles: Array<{ x: number; y: number }> = [];
      for (let y = office.y; y < office.y + office.height; y++) {
        for (let x = office.x; x < office.x + office.width; x++) {
          if (!pathTiles.has(`${x},${y}`)) {
            expectedParkingTiles.push({ x, y });
          }
        }
      }

      expect(office.parkingSpots).toEqual(expectedParkingTiles);
    }
  });

  it('uses parking spots as inactive and active demand dots', () => {
    const game = spawnFactoryWithEntranceCount(1);
    const office = game.offices[0];

    office.demandTimers = office.parkingSpots.map((_spot, index) =>
      index < 2 ? 0 : 5
    );
    office.numDemand = office.demandTimers.length;
    office.numIssues = 2;

    expect(office.isParkingSpotActive(0)).toBe(true);
    expect(office.isParkingSpotActive(1)).toBe(true);
    expect(office.isParkingSpotActive(2)).toBe(false);

    office.demandTimers = office.demandTimers.map(() => 5);
    office.numIssues = 0;
    expect(
      office.parkingSpots.every(
        (_spot, index) => !office.isParkingSpotActive(index)
      )
    ).toBe(true);
  });

  it('routes a worker through the reachable second entrance', () => {
    const game = new Game(3);
    const house = game.addTestBuilding(1, 1, 'house', 'yellow');
    const office = game.addTestBuilding(6, 1, 'office', 'yellow', 2, 3);
    const secondEntry = office.entrances[1].entryTile;
    const worker = new Worker(
      LJS.vec2(house.x, house.y),
      'worker-1',
      house.id,
      'yellow'
    );
    game.workers = [worker];

    let x = house.entryTile.x;
    let y = house.entryTile.y;
    while (y !== secondEntry.y) {
      const nextY = y + Math.sign(secondEntry.y - y);
      game.addTestPath(x, y, x, nextY);
      y = nextY;
    }
    while (x !== secondEntry.x) {
      const nextX = x + Math.sign(secondEntry.x - x);
      game.addTestPath(x, y, nextX, y);
      x = nextX;
    }

    office.demandTimers = [5, 0, 5];
    office.numDemand = 3;
    office.numIssues = 1;
    office.demand = office.needyness;
    updateWorkers(game, 0);

    expect(worker.task).toBe('toOffice');
    expect(worker.officeEntry).toEqual(secondEntry);
    expect(worker.parkingSpotIndex).toBe(1);
    expect(worker.target).toEqual(office.parkingSpots[1]);
    expect(worker.path.at(-2)).toEqual(secondEntry);
    expect(worker.path.at(-1)).toEqual(office.parkingSpots[1]);
  });

  it('completes factory arrival without snapping to the tile center', () => {
    const game = new Game(6);
    const house = game.addTestBuilding(1, 1, 'house', 'red');
    const office = game.addTestBuilding(6, 1, 'office', 'red', 2, 3);
    const target = office.parkingSpots[0];
    const arrivalX = target.x + 0.04;
    const worker = new Worker(
      LJS.vec2(arrivalX, target.y),
      'worker-smooth',
      house.id,
      'red'
    );
    worker.task = 'toOffice';
    worker.target = { ...target };
    worker.path = [{ ...target }];
    worker.assignedOfficeId = office.id;
    worker.parkingSpotIndex = 0;
    worker.officeEntry = { ...office.entrances[0].entryTile };
    office.assignedWorkerIds = [worker.id];
    office.demandTimers = [0];
    office.numDemand = 1;
    office.numIssues = 1;
    office.demand = office.needyness;
    game.workers = [worker];

    updateWorkers(game, 0);

    expect(worker.task).toBe('atOffice');
    expect(worker.x).toBeCloseTo(arrivalX);
    expect(worker.x).not.toBe(target.x);
    expect(worker.dx).toBe(0);
    expect(worker.dy).toBe(0);
  });

  it('reserves a different interior parking spot for each worker', () => {
    const game = new Game(9);
    const house = game.addTestBuilding(1, 1, 'house', 'red');
    const office = game.addTestBuilding(6, 1, 'office', 'red', 2, 3);
    const entry = office.entrances[0].entryTile;
    const workers = [
      new Worker(LJS.vec2(house.x, house.y), 'worker-a', house.id, 'red'),
      new Worker(LJS.vec2(house.x, house.y), 'worker-b', house.id, 'red')
    ];
    game.workers = workers;

    let x = house.entryTile.x;
    let y = house.entryTile.y;
    while (x !== entry.x) {
      const nextX = x + Math.sign(entry.x - x);
      game.addTestPath(x, y, nextX, y);
      x = nextX;
    }
    while (y !== entry.y) {
      const nextY = y + Math.sign(entry.y - y);
      game.addTestPath(x, y, x, nextY);
      y = nextY;
    }

    office.demandTimers = [0, 0];
    office.numDemand = 2;
    office.numIssues = 2;
    office.demand = office.needyness * 2;
    updateWorkers(game, 0);

    expect(workers.map((worker) => worker.parkingSpotIndex)).toEqual([0, 1]);
    expect(workers[0].target).toEqual(office.parkingSpots[0]);
    expect(workers[1].target).toEqual(office.parkingSpots[1]);
    expect(workers[0].path.at(-1)).not.toEqual(workers[1].path.at(-1));
  });

  it('leaves a parking spot through the reserved factory entrance', () => {
    const game = new Game(10);
    const house = game.addTestBuilding(1, 1, 'house', 'blue');
    const office = game.addTestBuilding(6, 1, 'office', 'blue', 2, 3);
    const entry = office.entrances[0].entryTile;
    const spot = office.parkingSpots[0];
    const worker = new Worker(
      LJS.vec2(spot.x, spot.y),
      'worker-return',
      house.id,
      'blue'
    );
    worker.task = 'atOffice';
    worker.waitTimer = 0;
    worker.assignedOfficeId = office.id;
    worker.parkingSpotIndex = 0;
    worker.officeEntry = { ...entry };
    office.assignedWorkerIds = [worker.id];
    game.workers = [worker];

    let x = entry.x;
    let y = entry.y;
    while (x !== house.entryTile.x) {
      const nextX = x + Math.sign(house.entryTile.x - x);
      game.addTestPath(x, y, nextX, y);
      x = nextX;
    }
    while (y !== house.entryTile.y) {
      const nextY = y + Math.sign(house.entryTile.y - y);
      game.addTestPath(x, y, x, nextY);
      y = nextY;
    }

    updateWorkers(game, 0);

    expect(worker.task).toBe('toHome');
    expect(worker.path[0]).toEqual(entry);
    expect(worker.parkingSpotIndex).toBeNull();
    expect(worker.officeEntry).toBeNull();
  });
});
