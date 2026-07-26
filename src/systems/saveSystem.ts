import type { Game, Snapshot } from '@core/Game';
import { SAVE_KEY } from '@core/config';

export const SAVE_FILENAME = 'savegame.json';

export function saveNow(game: Game): void {
  localStorage.setItem(SAVE_KEY, JSON.stringify(game.toSnapshot()));
}

export function formatSnapshotFile(game: Game): string {
  return `${JSON.stringify(game.toSnapshot(), null, 2)}\n`;
}

function isSnapshot(value: unknown): value is Snapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Record<string, unknown>;
  return (
    typeof snapshot.day === 'number' &&
    typeof snapshot.timeInDay === 'number' &&
    typeof snapshot.seed === 'number' &&
    Array.isArray(snapshot.gridTiles) &&
    Array.isArray(snapshot.buildings) &&
    Array.isArray(snapshot.workers) &&
    Array.isArray(snapshot.paths)
  );
}

export function parseSnapshotFile(contents: string): Snapshot {
  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch {
    throw new Error('The selected file is not valid JSON.');
  }

  if (!isSnapshot(value)) {
    throw new Error('The selected file is not a valid game snapshot.');
  }
  return value;
}

export async function readSnapshotFile(file: File): Promise<Snapshot> {
  return parseSnapshotFile(await file.text());
}

function downloadSnapshotFile(contents: string): void {
  const blob = new Blob([contents], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = SAVE_FILENAME;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function exportSnapshotFile(
  game: Game
): Promise<'repository' | 'download'> {
  const contents = formatSnapshotFile(game);

  try {
    const response = await fetch('/__save-game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: contents
    });
    const result = (await response.json()) as {
      written?: boolean;
      filename?: string;
    };
    if (
      response.ok &&
      result.written === true &&
      result.filename === SAVE_FILENAME
    ) {
      return 'repository';
    }
  } catch {
    // The endpoint only exists in the local Vite development server.
  }

  downloadSnapshotFile(contents);
  return 'download';
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
