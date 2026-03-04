import { describe, expect, it } from 'vitest';
import { Game } from '@core/Game';

describe('smoke', () => {
  it('boots and enters play', () => {
    const game = new Game(2);
    game.init();
    game.startPlay();
    game.update(0.05);
    expect(game.state.state).toBe('Play');
  });
});
