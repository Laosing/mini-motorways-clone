import type { Game } from '@core/Game';
import {
  exportSnapshotFile,
  readSnapshotFile,
  SAVE_FILENAME
} from '@systems/saveSystem';

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

  const expandGridBtn = createBtn('btn-expand-grid', '2× Grid', '', () => {
    game.doubleGridSize();
    updateHUD(game);
  });
  expandGridBtn.title = 'Double the grid width and height';

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
    void exportSnapshotFile(game).then((destination) => {
      game.statusText =
        destination === 'repository'
          ? 'Saved to savegame.json'
          : 'Downloaded savegame.json';
      updateHUD(game);
    });
    updateHUD(game);
  });

  const loadInput = document.createElement('input');
  loadInput.type = 'file';
  loadInput.accept = '.json,application/json';
  loadInput.hidden = true;
  loadInput.onchange = () => {
    const file = loadInput.files?.[0];
    if (!file) return;

    void readSnapshotFile(file)
      .then((snapshot) => {
        game.restore(snapshot);
        game.save();
        game.statusText = `Loaded ${file.name}`;
        updateHUD(game);
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : 'Could not load save file.';
        game.statusText = message;
        window.alert(message);
        updateHUD(game);
      })
      .finally(() => {
        loadInput.value = '';
      });
  };

  const loadBtn = createBtn('btn-load', 'Load Game', '', () => {
    loadInput.value = '';
    loadInput.click();
  });
  loadBtn.title = `Load a ${SAVE_FILENAME} file`;
  buttonGroup.appendChild(loadInput);

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
    <div class="hud-stat"><span class="hud-label">Day</span><strong>${game.day}</strong></div>
    <div class="hud-divider" aria-hidden="true"></div>
    <div class="hud-stat"><span class="hud-label">Trips</span><strong>${game.servedTrips}</strong></div>
    <div class="hud-stat"><span class="hud-label">Houses</span><strong>${game.houses.length}</strong></div>
    <div class="hud-stat"><span class="hud-label">People</span><strong>${game.workers.length}</strong></div>
    <div class="hud-stat"><span class="hud-label">Grid</span><strong>${game.grid.width} × ${game.grid.height}</strong></div>
    <div class="hud-divider" aria-hidden="true"></div>
    <div class="hud-stat hud-destination hud-red"><span class="hud-dot" aria-hidden="true"></span><span class="hud-label">Red</span><strong>${game.redCount}</strong></div>
    <div class="hud-stat hud-destination hud-blue"><span class="hud-dot" aria-hidden="true"></span><span class="hud-label">Blue</span><strong>${game.blueCount}</strong></div>
    <div class="hud-stat hud-destination hud-yellow"><span class="hud-dot" aria-hidden="true"></span><span class="hud-label">Yellow</span><strong>${game.yellowCount}</strong></div>
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
