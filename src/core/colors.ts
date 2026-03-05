import * as LJS from 'littlejsengine';

export const COLORS = {
  grass: '#E8E7D1',
  path: '#333333',
  house: '#FFFFFF',
  red: '#F15B5B', // Vibrant Pastel Red
  blue: '#4DA1FF', // Vibrant Pastel Blue
  yellow: '#FFD93D', // Vibrant Pastel Yellow
  white: '#FFFFFF',
  black: '#1A1A1A',
  ui: '#333333',
  grid: '#0000000D', // 0.05 alpha
  shade: '#00000026', // 0.15 alpha
  shade2: '#00000040', // 0.25 alpha
  outlineWidth: 0.12
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
