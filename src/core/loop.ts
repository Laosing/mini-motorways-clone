import * as LJS from 'littlejsengine';
import { FIXED_TIMESTEP } from './config';
import type { Game } from './Game';

export function wireEngine(game: Game): void {
  let accumulator = 0;

  function gameInit(): void {
    LJS.setShowSplashScreen(false);
    LJS.setCanvasPixelated(false);
    LJS.setCanvasClearColor(new LJS.Color().setHex('#8a5')); // COLORS.grass
    game.init();
  }

  function gameUpdate(): void {
    accumulator += LJS.timeDelta;
    while (accumulator >= FIXED_TIMESTEP) {
      game.update(FIXED_TIMESTEP);
      accumulator -= FIXED_TIMESTEP;
    }
  }

  function gameUpdatePost(): void {}

  function gameRender(): void {
    game.render();
  }

  function gameRenderPost(): void {}

  const root = document.getElementById('game-root') ?? document.body;
  void LJS.engineInit(
    gameInit,
    gameUpdate,
    gameUpdatePost,
    gameRender,
    gameRenderPost,
    [],
    root
  );
}
