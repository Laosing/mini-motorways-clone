import { describe, expect, it } from 'vitest';
import { Game } from '@core/Game';
import {
  diagonalEdgeIntersectsOffice,
  panCameraByMouseDrag,
  removePathsAtTile,
  tryAddEdge
} from '@systems/inputSystem';

describe('camera input', () => {
  it('pans the camera opposite the middle-mouse drag', () => {
    const game = new Game(1);
    game.camera.x = 20;
    game.camera.y = 12;

    panCameraByMouseDrag(game, { x: 3, y: -2 });

    expect(game.camera.x).toBe(17);
    expect(game.camera.y).toBe(14);
  });

  it('allows a road connection at both factory entrances', () => {
    const game = new Game(2);
    const office = game.addTestBuilding(10, 10, 'office', 'red', 2, 3);

    for (const pair of office.entrances) {
      expect(tryAddEdge(game, pair.entryTile, pair.entrance)).toBe(true);
    }

    expect(game.paths).toHaveLength(2);
  });

  it('rejects diagonal roads placed on or through a factory', () => {
    const game = new Game(4);
    game.addTestBuilding(5, 5, 'office', 'red', 2, 3);

    expect(tryAddEdge(game, { x: 4, y: 4 }, { x: 5, y: 5 })).toBe(false);
    expect(tryAddEdge(game, { x: 4, y: 5 }, { x: 5, y: 4 })).toBe(false);
    expect(game.paths).toHaveLength(0);
  });

  it('allows diagonal roads that clear the factory footprint', () => {
    const game = new Game(5);
    game.addTestBuilding(5, 5, 'office', 'blue', 2, 3);

    expect(
      diagonalEdgeIntersectsOffice(game, { x: 3, y: 4 }, { x: 4, y: 3 })
    ).toBe(false);
    expect(tryAddEdge(game, { x: 3, y: 4 }, { x: 4, y: 3 })).toBe(true);
  });

  it('does not apply the factory crossing rule to houses', () => {
    const game = new Game(6);
    game.addTestBuilding(5, 5, 'house', 'yellow');

    expect(tryAddEdge(game, { x: 4, y: 5 }, { x: 5, y: 4 })).toBe(true);
  });

  it('removes player roads but preserves locked factory paths', () => {
    const game = new Game(3);
    game.paths = [
      { a: { x: 1, y: 1 }, b: { x: 2, y: 1 }, locked: true },
      { a: { x: 1, y: 1 }, b: { x: 1, y: 2 } }
    ];

    removePathsAtTile(game, { x: 1, y: 1 });

    expect(game.paths).toEqual([
      { a: { x: 1, y: 1 }, b: { x: 2, y: 1 }, locked: true }
    ]);
  });
});
