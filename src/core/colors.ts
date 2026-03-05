import * as LJS from 'littlejsengine';

export const COLORS = {
  grass: '#8a5',
  path: '#dca',
  house: '#fff',
  ox: '#b75',
  goat: '#abb',
  fish: '#f80',
  oxHorn: '#dee',
  black: '#000',
  ui: '#443',
  red: '#e31',
  grid: '#0001',
  shade: '#0003',
  shade2: '#0005'
} as const;

// Cached Color objects to avoid garbage collection pressure
export const COLOR_RESOURCES = {
  grass: new LJS.Color().setHex(COLORS.grass),
  path: new LJS.Color().setHex(COLORS.path),
  house: new LJS.Color().setHex(COLORS.house),
  ox: new LJS.Color().setHex(COLORS.ox),
  goat: new LJS.Color().setHex(COLORS.goat),
  fish: new LJS.Color().setHex(COLORS.fish),
  oxHorn: new LJS.Color().setHex(COLORS.oxHorn),
  black: new LJS.Color().setHex(COLORS.black),
  ui: new LJS.Color().setHex(COLORS.ui),
  red: new LJS.Color().setHex(COLORS.red),
  grid: new LJS.Color(0, 0, 0, 0.1),
  shadow: new LJS.Color(0, 0, 0, 0.2),
  transparent: new LJS.Color(0, 0, 0, 0),
  white: new LJS.Color(1, 1, 1, 1),
  cursorFill: new LJS.Color(1, 1, 1, 0.1),
  cursorStroke: new LJS.Color(1, 1, 1, 0.3)
} as const;
