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

  it('places a JSON load button beside the save button', () => {
    document.body.innerHTML = '<div id="ui"></div>';
    const game = new Game(2);
    setupHUD(game);

    const saveButton = document.getElementById('btn-save');
    const loadButton = document.getElementById('btn-load');
    const fileInput =
      document.querySelector<HTMLInputElement>('input[type="file"]');

    expect(saveButton?.nextElementSibling).toBe(loadButton);
    expect(loadButton?.textContent).toBe('Load Game');
    expect(fileInput?.accept).toContain('.json');
    expect(fileInput?.hidden).toBe(true);
  });

  it('renders all game stats in one compact header bar', () => {
    document.body.innerHTML = '<div id="ui"></div>';
    const game = new Game(3);
    setupHUD(game);

    const hud = document.querySelector('.hud-panel');
    const labels = Array.from(hud?.querySelectorAll('.hud-label') ?? []).map(
      (label) => label.textContent
    );

    expect(document.querySelectorAll('.hud-panel')).toHaveLength(1);
    expect(labels).toEqual([
      'Day',
      'Trips',
      'Houses',
      'People',
      'Grid',
      'Red',
      'Blue',
      'Yellow'
    ]);
    expect(hud?.textContent).not.toContain('Game Stats');
  });
});
