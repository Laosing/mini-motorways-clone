import { afterEach, describe, expect, it } from 'vitest';
import { Game } from '@core/Game';
import { setupHUD } from '@ui/hud';

describe('HUD grid controls', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('doubles the grid when the expand button is clicked', () => {
    document.body.innerHTML = '<div id="ui"></div>';
    const game = new Game(1);
    setupHUD(game);

    const button = document.getElementById('btn-expand-grid');
    expect(button?.textContent).toBe('2× Grid');

    button?.click();

    expect(game.grid.width).toBe(80);
    expect(game.grid.height).toBe(48);
    expect(document.querySelector('.hud-panel')?.textContent).toContain(
      '80 × 48'
    );
  });
});
