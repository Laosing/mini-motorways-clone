export const FIXED_TIMESTEP = 1 / 60;
export const SAVE_KEY = 'minimotorways-v0.1-save';

export const GAME_CONFIG = {
  mapWidth: 40,
  mapHeight: 24,
  cameraScale: 32,
  gridCellSize: 8,
  dayLengthSeconds: 20,
  autosaveIntervalSeconds: 10,

  // Gameplay Settings
  worker: {
    speed: 2,
    size: 0.2, // cells diameter
    waitTimer: 0,
    renderOrder: 20,
    stuckThreshold: 0.01,
    stuckTimerMax: 10
  },

  building: {
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
  },

  demand: {
    pinSize: 0.1,
    pinSpacing: 0.22
  },

  spawning: {
    loopLength: 600,
    officeMinDistance: 2,
    officeMaxDistanceOffset: 3,
    houseMinDistance: 1,
    houseMaxDistanceFactor: 1 // multiplied by office count
  },

  colors: {
    grass: '#E8E7D1',
    path: '#333333',
    house: '#FFFFFF',
    red: '#F15B5B',
    blue: '#4DA1FF',
    yellow: '#FFD93D',
    white: '#FFFFFF',
    black: '#1A1A1A',
    ui: '#333333',
    grid: '#0000000D',
    shade: '#00000026',
    shade2: '#00000040',
    outlineWidth: 0.12
  }
} as const;
