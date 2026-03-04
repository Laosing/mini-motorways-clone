import type { Game } from '@core/Game';

export function isValidPlacement(_game: Game, _x: number, _y: number, _buildingType: string): boolean {
  return false;
}

export function updatePlacementGhost(_game: Game): void {}

export function tryPlaceBuilding(_game: Game, _buildingType: string, _x: number, _y: number): boolean {
  return false;
}

export function tryRemoveBuilding(_game: Game, _x: number, _y: number): boolean {
  return false;
}
