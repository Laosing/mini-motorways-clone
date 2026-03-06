import * as LJS from 'littlejsengine';
import type { Game } from '@core/Game';
import { areAdjacent, edgeKey, createRoundaboutEdges } from './pathNetwork';
import {
  isValidRoundaboutPlacement,
  placeRoundabout,
  removeRoundabout
} from './placementSystem';

function mouseToTile(game: Game): { x: number; y: number } | null {
  const wx = Math.floor(LJS.mousePos.x + 0.5);
  const wy = Math.floor(LJS.mousePos.y + 0.5);
  if (!game.grid.isInside(wx, wy)) return null;
  return { x: wx, y: wy };
}

function tryAddEdge(
  game: Game,
  from: { x: number; y: number },
  to: { x: number; y: number }
): boolean {
  if (!game.grid.isInside(to.x, to.y)) return false;
  if (!areAdjacent(from, to)) return false;

  const key = edgeKey(from, to);
  if (game.paths.some((p) => edgeKey(p.a, p.b) === key)) return true;

  const occupantA = game.grid.get(from.x, from.y)?.occupantId || undefined;
  const occupantB = game.grid.get(to.x, to.y)?.occupantId || undefined;

  // Enforce Office Entrance: if a tile is an office, the other end MUST be its designated entrance.
  const checkOfficeEntrance = (
    occupantId: string | undefined,
    otherPoint: { x: number; y: number }
  ): boolean => {
    if (!occupantId) return true;
    const building = game.buildings.find((b) => b.id === occupantId);
    if (!building || building.role !== 'office') return true;
    return (
      building.entrance.x === otherPoint.x &&
      building.entrance.y === otherPoint.y
    );
  };

  if (
    !checkOfficeEntrance(occupantA, to) ||
    !checkOfficeEntrance(occupantB, from)
  ) {
    return false;
  }

  // Preserve the rule: Buildings can only have ONE road connection (terminal node)
  const isInternalOccupiedNode = (pos: { x: number; y: number }): boolean => {
    if (!game.grid.get(pos.x, pos.y)?.occupantId) return false;
    return game.paths.some(
      (p) =>
        (p.a.x === pos.x && p.a.y === pos.y) ||
        (p.b.x === pos.x && p.b.y === pos.y)
    );
  };

  if (isInternalOccupiedNode(from) || isInternalOccupiedNode(to)) return false;

  game.paths.push({ a: { ...from }, b: { ...to } });
  game.pathsChanged = true;
  return true;
}

/**
 * Threshold logic for path dragging.
 * Returns true if the pointer has moved far enough into an adjacent cell to trigger placement.
 */
function isPastPlacementThreshold(
  from: { x: number; y: number },
  mousePos: LJS.Vector2
): { x: number; y: number } | null {
  const dx = mousePos.x - from.x;
  const dy = mousePos.y - from.y;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);

  // Enforce adjacency: mouse must be moving toward a neighbor
  // Increased significantly to handle fast mouse movements
  if (adx > 20.0 || ady > 20.0) return null;

  const targetX = from.x + Math.sign(Math.round(dx || 0));
  const targetY = from.y + Math.sign(Math.round(dy || 0));

  // Determine if it's a diagonal or orthogonal move
  const isDiagonal = Math.round(adx) >= 1 && Math.round(ady) >= 1;
  const isOrthogonal =
    !isDiagonal && (Math.round(adx) >= 1 || Math.round(ady) >= 1);

  if (isDiagonal) {
    // Manhattan distance threshold for diagonals (sticky)
    // 100% of 2.0 (the corner-to-corner Manhattan distance)
    if (adx + ady > 2.0) {
      return { x: targetX, y: targetY };
    }
  } else if (isOrthogonal) {
    // Stickiness threshold for orthogonals
    // 100% of 1.0 (the center-to-center distance)
    if (adx > 1.0 || ady > 1.0) {
      return { x: targetX, y: targetY };
    }
  }

  return null;
}
function getPotentialNeighbor(
  from: { x: number; y: number },
  mousePos: LJS.Vector2
): { x: number; y: number } | null {
  const dx = mousePos.x - from.x;
  const dy = mousePos.y - from.y;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);

  if (adx > 20.0 || ady > 20.0) return null;

  const targetX = from.x + Math.sign(Math.round(dx || 0));
  const targetY = from.y + Math.sign(Math.round(dy || 0));

  if (targetX === from.x && targetY === from.y) return null;

  return { x: targetX, y: targetY };
}
export function handleInput(game: Game): void {
  const panSpeed = 0.5;
  if (LJS.keyIsDown('ArrowLeft')) game.camera.x -= panSpeed;
  if (LJS.keyIsDown('ArrowRight')) game.camera.x += panSpeed;
  if (LJS.keyIsDown('ArrowUp')) game.camera.y += panSpeed;
  if (LJS.keyIsDown('ArrowDown')) game.camera.y -= panSpeed;

  if (LJS.mouseWheel) {
    game.camera.scale = Math.max(
      16,
      Math.min(80, game.camera.scale + LJS.mouseWheel * 2)
    );
  }

  game.cursorTile = mouseToTile(game);

  if (LJS.keyWasPressed('Space')) game.togglePause();
  if (LJS.keyWasPressed('KeyS')) game.save();
  if (LJS.keyWasPressed('KeyR')) game.reset();
  if (LJS.keyWasPressed('KeyT')) {
    game.currentTool =
      game.currentTool === 'roundabout' ? 'road' : 'roundabout';
  }

  // Left Click Start
  if (LJS.mouseWasPressed(0) && game.cursorTile) {
    game.dragStartTile = game.cursorTile;
    game.dragTool = game.currentTool;
  }

  // Roundabout placement (click to place)
  if (
    game.currentTool === 'roundabout' &&
    game.dragTool === 'roundabout' &&
    LJS.mouseWasReleased(0) &&
    game.cursorTile
  ) {
    placeRoundabout(game, game.cursorTile.x, game.cursorTile.y);
    game.dragStartTile = null;
    game.dragTool = null;
    game.pathPreview = [];
    return;
  }

  // Normal road drawing (only when not in roundabout mode)
  if (game.currentTool === 'road') {
    // Dragging
    if (LJS.mouseIsDown(0) && game.dragStartTile) {
      const nextNode = isPastPlacementThreshold(
        game.dragStartTile,
        LJS.mousePos
      );
      const potentialNode = getPotentialNeighbor(
        game.dragStartTile,
        LJS.mousePos
      );

      if (potentialNode) {
        game.pathPreview = [{ a: game.dragStartTile, b: potentialNode }];

        // Pivot logic: if we are dragging FROM a house and NOT yet past the threshold,
        // re-orient any existing single path segment to face the mouse.
        const start = game.dragStartTile;
        const isStartHouse = game.houses.some(
          (h) => h.x === start.x && h.y === start.y
        );

        if (isStartHouse && !nextNode) {
          const connectedIdx = game.paths.findIndex(
            (p) =>
              (p.a.x === start.x && p.a.y === start.y) ||
              (p.b.x === start.x && p.b.y === start.y)
          );

          if (connectedIdx !== -1) {
            const path = game.paths[connectedIdx];
            // Determine if this tile is occupied by something OTHER than a potential terminal end
            const isOccupied = game.grid.get(
              potentialNode.x,
              potentialNode.y
            )?.occupantId;

            if (!isOccupied) {
              // Update the end that isn't the house
              if (path.a.x === start.x && path.a.y === start.y) {
                path.b = { ...potentialNode };
              } else {
                path.a = { ...potentialNode };
              }
              game.pathsChanged = true;
            }
          }
        }
      } else {
        game.pathPreview = [];
      }

      if (nextNode) {
        if (tryAddEdge(game, game.dragStartTile, nextNode)) {
          game.dragStartTile = nextNode;
          game.pathPreview = [];
        }
      }
    }

    // Left Click End
    if (LJS.mouseWasReleased(0)) {
      game.dragStartTile = null;
      game.dragTool = null;
      game.pathPreview = [];
    }
  } else {
    // Clear drag state when in roundabout mode
    if (LJS.mouseWasReleased(0)) {
      game.dragStartTile = null;
      game.dragTool = null;
      game.pathPreview = [];
    }
  }

  // Right Click Delete
  if (LJS.mouseIsDown(2) && game.cursorTile) {
    const t = game.cursorTile;

    // Try to remove roundabout first
    if (removeRoundabout(game, t.x, t.y)) {
      return;
    }

    // Fall back to normal path deletion
    game.paths = game.paths.filter((p) => {
      const matches =
        (p.a.x === t.x && p.a.y === t.y) || (p.b.x === t.x && p.b.y === t.y);
      return !matches;
    });
  }
}
