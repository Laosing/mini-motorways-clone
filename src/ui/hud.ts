import type { Game } from '@core/Game';

let hudEl: HTMLDivElement | null = null;

export function setupHUD(game: Game): void {
  const root = document.getElementById('ui');
  if (!root) return;

  root.innerHTML = ''; // Clear existing

  hudEl = document.createElement('div');
  hudEl.className = 'hud-panel';
  root.appendChild(hudEl);

  const buttonGroup = document.createElement('div');
  buttonGroup.className = 'button-group';
  root.appendChild(buttonGroup);

  const createBtn = (
    id: string,
    text: string,
    className: string,
    onClick: () => void
  ) => {
    const btn = document.createElement('button');
    btn.id = id;
    btn.className = `game-btn ${className}`;
    btn.textContent = text;
    btn.onclick = onClick;
    buttonGroup.appendChild(btn);
    return btn;
  };

  createBtn('btn-pause', 'Pause', '', () => {
    game.togglePause();
    updateHUD(game);
  });

  createBtn('btn-spawn', 'Freeze Growth', 'warning', () => {
    game.toggleAutoSpawning();
    updateHUD(game);
  });

  createBtn('btn-save', 'Save Game', 'primary', () => {
    game.save();
    updateHUD(game);
  });

  createBtn('btn-reset', 'Reset', 'danger', () => {
    if (confirm('Are you sure you want to reset the entire world?')) {
      game.reset();
      updateHUD(game);
    }
  });

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

  hudEl.innerHTML = `
    <strong>Kingdom Stats</strong><br>
    State: ${game.state.state}<br>
    Day: ${game.day}<br>
    Trips Served: ${game.servedTrips}<br>
    Houses: ${game.houses.length} | People: ${game.villagers.length}<br>
    Oxen: ${game.oxenCount} | Sheep: ${game.sheepCount} | Fish: ${game.fishCount}<br>
    Demand - Ox:${oxDemand} Sheep:${goatDemand} Fish:${fishDemand}
  `;

  const pauseBtn = document.getElementById('btn-pause');
  if (pauseBtn) {
    const isPaused = game.state.is('Pause');
    pauseBtn.textContent = isPaused ? 'Resume Game' : 'Pause';
    pauseBtn.className = `game-btn ${isPaused ? 'primary' : ''}`;
  }

  const spawnBtn = document.getElementById('btn-spawn');
  if (spawnBtn) {
    spawnBtn.textContent = game.autoSpawningEnabled
      ? 'Freeze Growth'
      : 'Resume Growth';
    spawnBtn.className = `game-btn ${game.autoSpawningEnabled ? 'warning' : 'primary'}`;
  }
}
