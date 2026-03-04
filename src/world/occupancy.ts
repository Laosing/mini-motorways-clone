import type { GridMap } from './GridMap';

export function isBlocked(grid: GridMap, x: number, y: number): boolean {
  const tile = grid.get(x, y);
  if (!tile) return true;
  return tile.terrain === 'water' || tile.occupantId !== null;
}
