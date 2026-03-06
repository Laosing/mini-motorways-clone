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

  const roundaboutBtn = document.createElement('button');
  roundaboutBtn.id = 'btn-roundabout';
  roundaboutBtn.className = 'game-btn';
  roundaboutBtn.textContent = '↻ Roundabout';
  roundaboutBtn.title = 'Toggle roundabout tool (T)';
  roundaboutBtn.onclick = () => {
    game.currentTool =
      game.currentTool === 'roundabout' ? 'road' : 'roundabout';
    updateRoundaboutButtonStyle(roundaboutBtn, game.currentTool);
  };
  buttonGroup.appendChild(roundaboutBtn);

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

function updateRoundaboutButtonStyle(
  btn: HTMLButtonElement,
  tool: string
): void {
  if (tool === 'roundabout') {
    btn.style.backgroundColor = '#4a9eff';
    btn.style.color = 'white';
  } else {
    btn.style.backgroundColor = '';
    btn.style.color = '';
  }
}

export function setupBuildMenu(_game: Game): void {}

export function updateHUD(game: Game): void {
  if (!hudEl) return;

  hudEl.innerHTML = `
    <div style="font-size: 16px; font-weight: 700; margin-bottom: 8px; color: #111;">Game Stats</div>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px;">
      <span>Day: <strong>${game.day}</strong></span>
      <span>Trips: <strong>${game.servedTrips}</strong></span>
      <span>Houses: <strong>${game.houses.length}</strong></span>
      <span>People: <strong>${game.workers.length}</strong></span>
    </div>
    <div style="margin-top: 10px; padding-top: 4px; border-top: 1px solid rgba(0,0,0,0.05);">
      <span style="color: #F15B5B;">Red: ${game.redCount}</span> |
      <span style="color: #4DA1FF;">Blue: ${game.blueCount}</span> |
      <span style="color: #FFD93D;">Yellow: ${game.yellowCount}</span>
    </div>
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

  const roundaboutBtn = document.getElementById('btn-roundabout');
  if (roundaboutBtn) {
    updateRoundaboutButtonStyle(
      roundaboutBtn as HTMLButtonElement,
      game.currentTool
    );
  }
}
