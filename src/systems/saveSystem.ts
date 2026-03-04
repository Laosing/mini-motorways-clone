import type { Game, Snapshot } from '@core/Game';
import { SAVE_KEY } from '@core/config';

export function saveNow(game: Game): void {
  localStorage.setItem(SAVE_KEY, JSON.stringify(game.toSnapshot()));
}

export function loadSnapshot(): Snapshot | null {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as Snapshot;
  } catch {
    return null;
  }
}

export function autosaveIfNeeded(_game: Game, _elapsed: number): void {}
