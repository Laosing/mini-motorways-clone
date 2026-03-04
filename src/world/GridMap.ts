import type { Tile } from './Tile';

export class GridMap {
  readonly width: number;
  readonly height: number;
  private tiles: Tile[];

  constructor(width: number, height: number, tiles?: Tile[]) {
    this.width = width;
    this.height = height;
    this.tiles =
      tiles ??
      Array.from({ length: width * height }, (_, i) => ({
        x: i % width,
        y: Math.floor(i / width),
        terrain: 'grass',
        occupantId: null,
        resourceAmount: 0
      }));
  }

  isInside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  get(x: number, y: number): Tile | undefined {
    if (!this.isInside(x, y)) return undefined;
    return this.tiles[x + y * this.width];
  }

  setOccupant(x: number, y: number, occupantId: string | null): void {
    const tile = this.get(x, y);
    if (!tile) return;
    tile.occupantId = occupantId;
  }

  forEach(cb: (tile: Tile) => void): void {
    this.tiles.forEach(cb);
  }

  snapshot(): Tile[] {
    return this.tiles.map((tile) => ({ ...tile }));
  }

  static fromSnapshot(width: number, height: number, tiles: Tile[]): GridMap {
    return new GridMap(width, height, tiles.map((tile) => ({ ...tile })));
  }
}
