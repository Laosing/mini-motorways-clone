import * as LJS from 'littlejsengine';
import type { Game } from '@core/Game';
import { areAdjacent, edgeKey } from './pathNetwork';
import { GAME_CONFIG } from '@core/config';

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

  // Prevent pathing through buildings. A building tile can only have ONE edge (it's a terminal node).
  const isInternalOccupiedNode = (pos: { x: number; y: number }): boolean => {
    if (!game.grid.get(pos.x, pos.y)?.occupantId) return false;
    // If it's already part of at least one edge, we cannot add another to/from it.
    return game.paths.some(
      (p) =>
        (p.a.x === pos.x && p.a.y === pos.y) ||
        (p.b.x === pos.x && p.b.y === pos.y)
    );
  };

  if (isInternalOccupiedNode(from) || isInternalOccupiedNode(to)) return false;

  game.paths.push({ a: from, b: to });
  return true;
}

function stepToward(
  from: { x: number; y: number },
  to: { x: number; y: number }
): { x: number; y: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return {
    x: from.x + Math.sign(dx),
    y: from.y + Math.sign(dy)
  };
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

  if (LJS.mouseWasPressed(0) && game.cursorTile) {
    game.dragStartTile = game.cursorTile;
  }

  if (LJS.mouseIsDown(0) && game.dragStartTile && game.cursorTile) {
    let current = game.dragStartTile;
    const target = game.cursorTile;

    // Tiny Yurts style progression: advance path one neighboring cell at a time.
    // This keeps diagonals stable and prevents dropped segments on fast drags.
    let safety = 0;
    while ((current.x !== target.x || current.y !== target.y) && safety < 32) {
      const next = stepToward(current, target);
      if (!tryAddEdge(game, current, next)) break;
      current = next;
      safety += 1;
    }

    game.dragStartTile = current;
  }

  if (LJS.mouseWasReleased(0)) {
    game.dragStartTile = null;
  }

  if (LJS.mouseIsDown(2) && game.cursorTile) {
    const t = game.cursorTile;
    game.paths = game.paths.filter((p) => {
      const matches =
        (p.a.x === t.x && p.a.y === t.y) || (p.b.x === t.x && p.b.y === t.y);
      return !matches;
    });
  }
}
