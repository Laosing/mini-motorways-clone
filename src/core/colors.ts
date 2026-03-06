import * as LJS from 'littlejsengine';
import { COLOR_CONFIG } from './config';

// Cached Color objects to avoid garbage collection pressure
export const COLOR_RESOURCES = {
  grass: new LJS.Color().setHex(COLOR_CONFIG.grass),
  path: new LJS.Color().setHex(COLOR_CONFIG.path),
  house: new LJS.Color().setHex(COLOR_CONFIG.house),
  red: new LJS.Color().setHex(COLOR_CONFIG.red),
  blue: new LJS.Color().setHex(COLOR_CONFIG.blue),
  yellow: new LJS.Color().setHex(COLOR_CONFIG.yellow),
  black: new LJS.Color().setHex(COLOR_CONFIG.black),
  ui: new LJS.Color().setHex(COLOR_CONFIG.ui),
  grid: new LJS.Color().setHex(COLOR_CONFIG.grid),
  shadow: new LJS.Color().setHex(COLOR_CONFIG.shade),
  transparent: new LJS.Color().setHex(COLOR_CONFIG.transparent),
  white: new LJS.Color().setHex(COLOR_CONFIG.white),
  cursorFill: new LJS.Color().setHex(COLOR_CONFIG.cursorFill),
  cursorStroke: new LJS.Color().setHex(COLOR_CONFIG.cursorStroke)
} as const;
