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
  ctx.strokeStyle = 'rgba(0,0,0,0.02)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, s - 1, s - 1);

  // No need for procedural road tiles as we use crisp vector lines now
  for (let mask = 1; mask < 16; mask++) {
    const tx = (mask % 8) * s;
    const ty = Math.floor(mask / 8) * s;
    ctx.fillStyle = COLORS.grass;
    ctx.fillRect(tx, ty, s, s);
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

  // Draw paths with vector lines for a crisp look
  const pColor = COLOR_RESOURCES.path;
  const pWidth = 0.35;
  const border = COLORS.outlineWidth;
  const jointRadius = pWidth * 0.52;

  const drawRoadNetwork = (
    edges: any[],
    color: LJS.Color,
    isBorder: boolean
  ) => {
    if (edges.length === 0) return;
    const w = isBorder ? pWidth + border : pWidth;
    const r = isBorder ? jointRadius + border / 2 : jointRadius;

    // Pass 1: Lines
    for (const edge of edges) {
      tempPosA.set(edge.a.x, edge.a.y);
      tempPosB.set(edge.b.x, edge.b.y);
      LJS.drawLine(tempPosA, tempPosB, w, color);
    }

    // Pass 2: Joints
    const nodes = new Set<string>();
    for (const edge of edges) {
      nodes.add(`${edge.a.x},${edge.a.y}`);
      nodes.add(`${edge.b.x},${edge.b.y}`);
    }
    nodes.forEach((key) => {
      const [nx, ny] = key.split(',').map(Number);
      tempPosA.set(nx, ny);
      LJS.drawCircle(tempPosA, r, color);
    });
  };

  // Draw main network: Border then Fill
  drawRoadNetwork(game.paths, COLOR_RESOURCES.white, true);
  drawRoadNetwork(game.paths, pColor, false);

  // Draw preview network: Border then Fill (with alpha)
  const previewWhite = new LJS.Color(1, 1, 1, 0.4);
  const previewFill = new LJS.Color(pColor.r, pColor.g, pColor.b, 0.2);
  drawRoadNetwork(game.pathPreview, previewWhite, true);
  drawRoadNetwork(game.pathPreview, previewFill, false);

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
