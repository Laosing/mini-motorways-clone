export const FIXED_TIMESTEP = 1 / 60;
export const SAVE_KEY = 'minimotorways-v0.1-save';

export const GAME_CONFIG = {
  mapWidth: 40,
  mapHeight: 24,
  cameraScale: 32,
  gridCellSize: 8,
  dayLengthSeconds: 20,
  autosaveIntervalSeconds: 10,
  startingResources: {
    wood: 30
  },
  winWoodTarget: 120,
  maxDaysWithoutFood: 3
} as const;
