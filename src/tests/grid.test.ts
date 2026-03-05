import { describe, expect, it } from 'vitest';
import { GridMap } from '@world/GridMap';
import { isBlocked } from '@world/occupancy';

describe('GridMap', () => {
  it('creates a grid with correct dimensions', () => {
    const grid = new GridMap(10, 15);

    expect(grid.width).toBe(10);
    expect(grid.height).toBe(15);
  });

  it('checks if position is inside grid boundaries', () => {
    const grid = new GridMap(5, 5);

    expect(grid.isInside(0, 0)).toBe(true);
    expect(grid.isInside(2, 3)).toBe(true);
    expect(grid.isInside(4, 4)).toBe(true);
    expect(grid.isInside(-1, 0)).toBe(false);
    expect(grid.isInside(0, -1)).toBe(false);
    expect(grid.isInside(5, 0)).toBe(false);
    expect(grid.isInside(0, 5)).toBe(false);
  });

  it('returns default grass terrain for new tiles', () => {
    const grid = new GridMap(10, 10);

    const tile = grid.get(5, 5);
    expect(tile).toBeDefined();
    expect(tile?.terrain).toBe('grass');
  });

  it('returns undefined for out-of-bounds get', () => {
    const grid = new GridMap(5, 5);

    expect(grid.get(-1, 0)).toBeUndefined();
    expect(grid.get(5, 0)).toBeUndefined();
    expect(grid.get(0, -1)).toBeUndefined();
    expect(grid.get(0, 5)).toBeUndefined();
  });

  it('sets and gets occupant ID', () => {
    const grid = new GridMap(10, 10);

    const tile = grid.get(3, 3);
    expect(tile?.occupantId).toBeNull();

    grid.setOccupant(3, 3, 'building-1');
    expect(grid.get(3, 3)?.occupantId).toBe('building-1');

    grid.setOccupant(3, 3, null);
    expect(grid.get(3, 3)?.occupantId).toBeNull();
  });

  it('iterates over all tiles', () => {
    const grid = new GridMap(3, 3);
    const tiles: Array<{ x: number; y: number }> = [];

    grid.forEach((tile) => {
      tiles.push({ x: tile.x, y: tile.y });
    });

    expect(tiles).toHaveLength(9);
    expect(tiles.some((t) => t.x === 0 && t.y === 0)).toBe(true);
    expect(tiles.some((t) => t.x === 2 && t.y === 2)).toBe(true);
  });

  it('creates snapshot and restores from it', () => {
    const grid = new GridMap(5, 5);
    const tile = grid.get(2, 2);
    if (tile) tile.terrain = 'water';
    const tile2 = grid.get(1, 1);
    if (tile2) tile2.occupantId = 'test-building';

    const snapshot = grid.snapshot();

    const newGrid = GridMap.fromSnapshot(5, 5, snapshot);

    expect(newGrid.get(2, 2)?.terrain).toBe('water');
    expect(newGrid.get(1, 1)?.occupantId).toBe('test-building');
    expect(newGrid.get(0, 0)?.terrain).toBe('grass');
  });

  it('snapshot preserves all tile data', () => {
    const grid = new GridMap(3, 3);
    const t1 = grid.get(1, 1);
    if (t1) t1.terrain = 'water';
    const t2 = grid.get(0, 0);
    if (t2) t2.occupantId = 'a';
    const t3 = grid.get(2, 2);
    if (t3) t3.occupantId = 'b';

    const snapshot = grid.snapshot();

    expect(snapshot).toHaveLength(9);
    expect(snapshot.some((t) => t.terrain === 'water')).toBe(true);
    expect(snapshot.filter((t) => t.occupantId !== null)).toHaveLength(2);
  });

  it('does not modify existing grid when creating snapshot', () => {
    const grid = new GridMap(3, 3);
    const tile = grid.get(1, 1);
    const originalTerrain = tile?.terrain;

    const snapshot = grid.snapshot();

    // Modify snapshot
    snapshot[0].terrain = 'water';

    // Original grid should be unchanged
    expect(grid.get(1, 1)?.terrain).toBe(originalTerrain);
  });
});

describe('Occupancy', () => {
  it('identifies water as blocked', () => {
    const grid = new GridMap(5, 5);
    const tile = grid.get(2, 2);
    if (tile) tile.terrain = 'water';

    expect(isBlocked(grid, 2, 2)).toBe(true);
  });

  it('identifies grass as not blocked', () => {
    const grid = new GridMap(5, 5);

    expect(isBlocked(grid, 2, 2)).toBe(false);
  });

  it('identifies occupied tiles as blocked', () => {
    const grid = new GridMap(5, 5);
    grid.setOccupant(2, 2, 'building-1');

    expect(isBlocked(grid, 2, 2)).toBe(true);
  });

  it('identifies unoccupied grass as not blocked', () => {
    const grid = new GridMap(5, 5);
    const tile = grid.get(2, 2);
    if (tile) {
      tile.terrain = 'grass';
      tile.occupantId = null;
    }

    expect(isBlocked(grid, 2, 2)).toBe(false);
  });

  it('returns true for out-of-bounds positions', () => {
    const grid = new GridMap(5, 5);

    expect(isBlocked(grid, -1, 0)).toBe(true);
    expect(isBlocked(grid, 0, -1)).toBe(true);
    expect(isBlocked(grid, 5, 0)).toBe(true);
    expect(isBlocked(grid, 0, 5)).toBe(true);
  });

  it('handles both water and occupancy blocking together', () => {
    const grid = new GridMap(5, 5);
    const t1 = grid.get(1, 1);
    if (t1) t1.terrain = 'water';
    grid.setOccupant(2, 2, 'building-1');

    expect(isBlocked(grid, 1, 1)).toBe(true); // Water
    expect(isBlocked(grid, 2, 2)).toBe(true); // Occupied
    expect(isBlocked(grid, 0, 0)).toBe(false); // Grass, unoccupied
  });
});
