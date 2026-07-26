import { describe, expect, it } from 'vitest';
import { Game } from '@core/Game';
import {
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
