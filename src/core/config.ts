export const FIXED_TIMESTEP = 1 / 60;
export const SAVE_KEY = 'minimotorways-v0.1-save';

export const ENGINE_CONFIG = {
  canvasWidth: 1280,
  canvasHeight: 720,
  cameraScale: 32,
  gridCellSize: 8
} as const;

export const MAP_CONFIG = {
  width: 40,
  height: 24
} as const;

export const GAMEPLAY_CONFIG = {
  dayLengthSeconds: 20,
  autosaveIntervalSeconds: 10
} as const;

export const WORKER_CONFIG = {
  speed: 2,
  size: 0.2, // cells diameter
  waitTimer: 0,
  renderOrder: 20,
  stuckThreshold: 0.01,
  stuckTimerMax: 10
} as const;

export const BUILDING_CONFIG = {
  renderOrder: 5,
  initialDemandTimerRange: {
    min: 5,
    max: 15
  },
  house: {
    width: 1,
    height: 1,
    residents: 2
  },
  office: {
    red: {
      needyness: 800,
      numDemand: 5,
      upgradeIncrement: 2,
      maxDemand: 7,
      size: {
        width: 2,
        height: 3
      }
    },
    blue: {
      needyness: 1000,
      numDemand: 5,
      upgradeIncrement: 3,
      maxDemand: 7,
      size: {
        width: 2,
        height: 3
      }
    },
    yellow: {
      needyness: 1300,
      numDemand: 5,
      upgradeIncrement: 4,
      maxDemand: 9,
      size: {
        width: 2,
        height: 3
      }
    }
  }
} as const;

export const DEMAND_CONFIG = {
  pinSize: 0.1,
  pinSpacing: 0.22
} as const;

export const SPAWNING_CONFIG = {
  loopLength: 600,
  officeMinDistance: 2,
  officeMaxDistanceOffset: 3,
  houseMinDistance: 1,
  houseMaxDistanceFactor: 1 // multiplied by office count
} as const;

export const COLOR_CONFIG = {
  grass: '#E8E7D1',
  path: '#333333',
  house: '#FFFFFF',
  red: '#F15B5B',
  blue: '#4DA1FF',
  yellow: '#FFD93D',
  white: '#FFFFFF',
  black: '#1A1A1A',
  ui: '#333333',
  grid: '#00000030',
  shade: '#00000026',
  shade2: '#00000040',
  transparent: '#00000000',
  cursorFill: '#0000000A',
  cursorStroke: '#00000020',
  outlineWidth: 0.12
} as const;
