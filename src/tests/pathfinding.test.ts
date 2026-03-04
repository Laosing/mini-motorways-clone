import { describe, expect, it } from 'vitest';
import { GridMap } from '@world/GridMap';
import { findPath } from '@systems/pathfindingSystem';

describe('pathfinding', () => {
  it('finds route around blockers', () => {
    const grid = new GridMap(5, 5);
    grid.setOccupant(2, 1, 'blocked');
    grid.setOccupant(2, 2, 'blocked');
    grid.setOccupant(2, 3, 'blocked');

    const path = findPath(grid, { x: 0, y: 2 }, { x: 4, y: 2 });
    expect(path.length).toBeGreaterThan(0);
    expect(path[path.length - 1]).toEqual({ x: 4, y: 2 });
  });
});
