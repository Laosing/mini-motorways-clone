import type { SeededRng } from '@core/rng';
import type { GridMap } from './GridMap';

export function generateWorld(grid: GridMap, _rng: SeededRng): void {
  grid.forEach((tile) => {
    tile.terrain = 'grass';
    tile.resourceAmount = 0;
    tile.occupantId = null;
  });
}
