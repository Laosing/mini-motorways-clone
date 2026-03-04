export type TerrainType = 'grass' | 'water';

export interface Tile {
  x: number;
  y: number;
  terrain: TerrainType;
  occupantId: string | null;
  resourceAmount: number;
}
