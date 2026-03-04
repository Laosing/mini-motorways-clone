import type { Game } from '@core/Game';

let hudEl: HTMLDivElement | null = null;

export function setupHUD(game: Game): void {
  const root = document.getElementById('ui');
  if (!root) return;

  hudEl = document.createElement('div');
  hudEl.style.cssText =
    'position:absolute;left:10px;top:10px;background:rgba(30,30,30,.72);color:#fff;padding:8px 10px;border-radius:6px;font-size:14px;pointer-events:none;';
  root.appendChild(hudEl);

  const btn = document.createElement('button');
  btn.id = 'toggle-spawn';
  btn.style.cssText =
    'position:absolute;left:10px;top:180px;background:#443;color:#fff;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:14px;';
  btn.onclick = () => {
    game.toggleAutoSpawning();
    updateHUD(game);
  };
  root.appendChild(btn);

  updateHUD(game);
}

export function setupBuildMenu(_game: Game): void {}

export function updateHUD(game: Game): void {
  if (!hudEl) return;
  const oxDemand = game.farms
    .filter((f) => f.destination === 'ox')
    .reduce((acc, f) => acc + (f.demand ?? 0), 0);
  const goatDemand = game.farms
    .filter((f) => f.destination === 'goat')
    .reduce((acc, f) => acc + (f.demand ?? 0), 0);
  const fishDemand = game.farms
    .filter((f) => f.destination === 'fish')
    .reduce((acc, f) => acc + (f.demand ?? 0), 0);

  hudEl.innerHTML = [
    `State: ${game.state.state}`,
    `Day: ${game.day}`,
    `Trips Served: ${game.servedTrips}`,
    `Yurts: ${game.yurts.length}`,
    `People: ${game.villagers.length}`,
    `Demand - Ox:${oxDemand} Goat:${goatDemand} Fish:${fishDemand}`,
    'Controls: LMB drag path, RMB erase, S save, R reset, Space pause'
  ].join('<br>');

  const btn = document.getElementById('toggle-spawn') as HTMLButtonElement;
  if (btn) {
    btn.textContent = game.autoSpawningEnabled
      ? 'Freeze Growth'
      : 'Resume Growth';
    btn.style.background = game.autoSpawningEnabled ? '#443' : '#a54';
  }
}
