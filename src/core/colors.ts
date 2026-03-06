import * as LJS from 'littlejsengine';
import { GAME_CONFIG } from './config';

export const COLORS = {
  grass: GAME_CONFIG.colors.grass,
  path: GAME_CONFIG.colors.path,
  house: GAME_CONFIG.colors.house,
  red: GAME_CONFIG.colors.red,
  blue: GAME_CONFIG.colors.blue,
  yellow: GAME_CONFIG.colors.yellow,
  white: GAME_CONFIG.colors.white,
  black: GAME_CONFIG.colors.black,
  ui: GAME_CONFIG.colors.ui,
  grid: GAME_CONFIG.colors.grid,
  shade: GAME_CONFIG.colors.shade,
  shade2: GAME_CONFIG.colors.shade2,
  outlineWidth: GAME_CONFIG.colors.outlineWidth
} as const;

// Cached Color objects to avoid garbage collection pressure
export const COLOR_RESOURCES = {
  grass: new LJS.Color().setHex(COLORS.grass),
  path: new LJS.Color().setHex(COLORS.path),
  house: new LJS.Color().setHex(COLORS.house),
  red: new LJS.Color().setHex(COLORS.red),
  blue: new LJS.Color().setHex(COLORS.blue),
  yellow: new LJS.Color().setHex(COLORS.yellow),
  black: new LJS.Color().setHex(COLORS.black),
  ui: new LJS.Color().setHex(COLORS.ui),
  grid: new LJS.Color(0, 0, 0, 0.05),
  shadow: new LJS.Color(0, 0, 0, 0.15),
  transparent: new LJS.Color(0, 0, 0, 0),
  white: new LJS.Color(1, 1, 1, 1),
  cursorFill: new LJS.Color(0, 0, 0, 0.05),
  cursorStroke: new LJS.Color(0, 0, 0, 0.2)
} as const;
