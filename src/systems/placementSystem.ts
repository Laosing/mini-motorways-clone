import type { Game } from '@core/Game';
import type { Roundabout } from './pathNetwork';
import { createRoundaboutEdges, validateRoundaboutLoop } from './pathNetwork';

export function isValidPlacement(
  _game: Game,
  _x: number,
  _y: number,
  _buildingType: string
): boolean {
  return false;
}

export function updatePlacementGhost(_game: Game): void {}

export function tryPlaceBuilding(
  _game: Game,
  _buildingType: string,
  _x: number,
  _y: number
): boolean {
  return false;
}

export function tryRemoveBuilding(
  _game: Game,
  _x: number,
  _y: number
): boolean {
  return false;
}

export function isValidRoundaboutPlacement(
  game: Game,
  x: number,
  y: number
): { valid: boolean; reason?: string } {
  const radius = 1;

  if (
    x - radius < 0 ||
    x + radius >= game.grid.width ||
    y - radius < 0 ||
    y + radius >= game.grid.height
  ) {
    return { valid: false, reason: 'Roundabout must be fully on grid' };
  }

  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      const tile = game.grid.get(x + dx, y + dy);
      if (tile?.occupantId) {
        return { valid: false, reason: 'Cannot place on buildings' };
      }
    }
  }

  return { valid: true };
}

export function placeRoundabout(game: Game, x: number, y: number): boolean {
  const validation = isValidRoundaboutPlacement(game, x, y);
  if (!validation.valid) return false;

  const radius = 1;

  // Remove existing paths in the roundabout area
  const beforePathCount = game.paths.length;
  game.paths = game.paths.filter((p) => {
    const aIn =
      p.a.x >= x - radius &&
      p.a.x <= x + radius &&
      p.a.y >= y - radius &&
      p.a.y <= y + radius;
    const bIn =
      p.b.x >= x - radius &&
      p.b.x <= x + radius &&
      p.b.y >= y - radius &&
      p.b.y <= y + radius;
    return !(aIn && bIn);
  });
  // Removed ${beforePathCount - game.paths.length} paths from roundabout area

  const newEdges = createRoundaboutEdges({ x, y });

  // Validate the roundabout loop before adding
  const loopValidation = validateRoundaboutLoop(newEdges);
  if (!loopValidation.valid) {
    console.error('Roundabout loop validation failed:', loopValidation.errors);
    return false;
  }

  game.paths.push(...newEdges);

  const roundabout: Roundabout = {
    id: `roundabout-${x}-${y}`,
    center: { x, y },
    direction: 'clockwise',
    edges: newEdges
  };
  game.roundabouts.push(roundabout);

  // Created roundabout with ${newEdges.length} edges

  // Invalidate all worker paths so they recalculate with the new roundabout
  game.invalidateWorkerPaths();

  game.pathsChanged = true;
  return true;
}

export function removeRoundabout(game: Game, x: number, y: number): boolean {
  const radius = 1;

  const roundaboutIdx = game.roundabouts.findIndex((rb) => {
    return (
      x >= rb.center.x - radius &&
      x <= rb.center.x + radius &&
      y >= rb.center.y - radius &&
      y <= rb.center.y + radius
    );
  });

  if (roundaboutIdx === -1) return false;

  const roundabout = game.roundabouts[roundaboutIdx];
  const roundaboutId = roundabout.id;

  // Removing roundabout ${roundaboutId}

  // Filter out paths with this roundabout ID
  const beforePathCount = game.paths.length;
  game.paths = game.paths.filter((p) => p.roundaboutId !== roundaboutId);
  const removedCount = beforePathCount - game.paths.length;

  // Verify we removed exactly the expected number of edges
  if (removedCount !== roundabout.edges.length) {
    console.warn(
      `Roundabout removal: expected to remove ${roundabout.edges.length} edges, removed ${removedCount}`
    );
  }

  game.roundabouts.splice(roundaboutIdx, 1);

  // Invalidate all worker paths so they recalculate without the removed roundabout
  game.invalidateWorkerPaths();

  game.pathsChanged = true;
  return true;
}
