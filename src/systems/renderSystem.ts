import type { Game } from '@core/Game';
import * as LJS from 'littlejsengine';
import { COLORS, COLOR_RESOURCES } from '@core/colors';

let terrainLayer: LJS.TileLayer | undefined;
let pathLayer: LJS.TileLayer | undefined;
let mainTileInfo: LJS.TileInfo | undefined;

function ensureLayers(game: Game) {
  if (terrainLayer) return;

  const { width, height } = game.grid;
  const s = 16; // Tile size

  // Create procedural tileset canvas
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  // Tile 0: Grass
  ctx.fillStyle = COLORS.grass;
  ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = 'rgba(0,0,0,0.05)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, s - 1, s - 1);

  // Tiles 1-15: Path Bitmasks (N=1, E=2, S=4, W=8)
  for (let mask = 1; mask < 16; mask++) {
    const tx = (mask % 8) * s;
    const ty = Math.floor(mask / 8) * s;

    // Grass background
    ctx.fillStyle = COLORS.grass;
    ctx.fillRect(tx, ty, s, s);
    ctx.strokeStyle = 'rgba(0,0,0,0.05)';
    ctx.strokeRect(tx + 0.5, ty + 0.5, s - 1, s - 1);

    // Path lines
    ctx.strokeStyle = COLORS.path;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    const cx = tx + s / 2;
    const cy = ty + s / 2;

    if (mask & 1) {
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx, ty);
    }
    if (mask & 2) {
      ctx.moveTo(cx, cy);
      ctx.lineTo(tx + s, cy);
    }
    if (mask & 4) {
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx, ty + s);
    }
    if (mask & 8) {
      ctx.moveTo(cx, cy);
      ctx.lineTo(tx, cy);
    }
    ctx.stroke();

    // Inner highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Create texture and tile info
  const texture = new LJS.TextureInfo(canvas as any);
  mainTileInfo = new LJS.TileInfo(LJS.vec2(0, 0), LJS.vec2(s, s));
  mainTileInfo.textureInfo = texture;

  // Create layers
  // The layer center should be at (width/2 - 0.5, height/2 - 0.5)
  // so that tiles at (0,0) are centered at world (0,0)
  const layerPos = LJS.vec2(width / 2 - 0.5, height / 2 - 0.5);

  terrainLayer = new LJS.TileLayer(
    layerPos,
    LJS.vec2(width, height),
    mainTileInfo
  );
  terrainLayer.renderOrder = -10;

  pathLayer = new LJS.TileLayer(
    layerPos,
    LJS.vec2(width, height),
    mainTileInfo
  );
  pathLayer.renderOrder = -5;

  // Set initial terrain
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      terrainLayer.setData(LJS.vec2(x, y), new LJS.TileLayerData(0));
    }
  }
  terrainLayer.redraw();
}
export function drawWorld(game: Game): void {
  ensureLayers(game);

  const { width, height } = game.grid;

  // Draw grid lines
  const gridColor = COLOR_RESOURCES.grid;
  const tempPosA = LJS.vec2();
  const tempPosB = LJS.vec2();

  for (let x = 0; x <= width; x++) {
    tempPosA.set(x - 0.5, -0.5);
    tempPosB.set(x - 0.5, height - 0.5);
    LJS.drawLine(tempPosA, tempPosB, 0.02, gridColor);
  }
  for (let y = 0; y <= height; y++) {
    tempPosA.set(-0.5, y - 0.5);
    tempPosB.set(width - 0.5, y - 0.5);
    LJS.drawLine(tempPosA, tempPosB, 0.02, gridColor);
  }

  // Draw paths with vector lines for a crisp SVG-like look
  const pColor = COLOR_RESOURCES.path;
  const pWidth = 0.45;

  for (const edge of game.paths) {
    tempPosA.set(edge.a.x, edge.a.y);
    tempPosB.set(edge.b.x, edge.b.y);
    LJS.drawLine(tempPosA, tempPosB, pWidth, pColor);

    // Draw joints immediately instead of tracking in a Set
    LJS.drawCircle(tempPosA, pWidth, pColor);
    LJS.drawCircle(tempPosB, pWidth, pColor);
  }

  // Draw cursor
  if (
    game.cursorTile &&
    game.grid.isInside(game.cursorTile.x, game.cursorTile.y)
  ) {
    const p = game.cursorTile;
    const h = 0.5;
    const points = [
      LJS.vec2(-h, -h),
      LJS.vec2(h, -h),
      LJS.vec2(h, h),
      LJS.vec2(-h, h)
    ];
    LJS.drawPoly(
      points,
      COLOR_RESOURCES.cursorFill,
      0.05,
      COLOR_RESOURCES.cursorStroke,
      LJS.vec2(p.x, p.y)
    );
  }
}
