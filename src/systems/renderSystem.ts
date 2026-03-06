import type { Game } from '@core/Game';
import * as LJS from 'littlejsengine';
import { COLOR_RESOURCES } from '@core/colors';
import { createRoundaboutEdges } from './pathNetwork';
import { isValidRoundaboutPlacement } from './placementSystem';
import { COLOR_CONFIG } from '@core/config';

let terrainLayer: LJS.TileLayer | undefined;
let mainTileInfo: LJS.TileInfo | undefined;

function ensureLayers(game: Game) {
  if (terrainLayer) return;

  const { width, height } = game.grid;
  const s = 16; // Tile size

  // Create procedural tileset canvas for grass
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = COLOR_CONFIG.grass;
  ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = 'rgba(0,0,0,0.02)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, s - 1, s - 1);

  // Fill tileset with grass
  for (let mask = 1; mask < 16; mask++) {
    const tx = (mask % 8) * s;
    const ty = Math.floor(mask / 8) * s;
    ctx.fillStyle = COLOR_CONFIG.grass;
    ctx.fillRect(tx, ty, s, s);
  }

  const texture = new LJS.TextureInfo(canvas as any);
  mainTileInfo = new LJS.TileInfo(LJS.vec2(0, 0), LJS.vec2(s, s));
  mainTileInfo.textureInfo = texture;

  const layerPos = LJS.vec2(width / 2 - 0.5, height / 2 - 0.5);
  terrainLayer = new LJS.TileLayer(
    layerPos,
    LJS.vec2(width, height),
    mainTileInfo
  );
  terrainLayer.renderOrder = -10;

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      terrainLayer.setData(LJS.vec2(x, y), new LJS.TileLayerData(0));
    }
  }
  terrainLayer.redraw();
}

/**
 * Draws a pass of the road network (either the border pass or the fill pass)
 * drawing all elements of that color at once to ensure fusion.
 */
function drawPathPass(edges: any[], width: number, color: LJS.Color) {
  if (edges.length === 0) return;
  const r = width;

  // 1. Draw all lines in this pass
  for (const edge of edges) {
    const a = LJS.vec2(edge.a.x, edge.a.y);
    const b = LJS.vec2(edge.b.x, edge.b.y);
    // Draw line with square caps (caps are covered by our own circles)
    LJS.drawLine(a, b, width, color);
  }

  // 2. Draw all joint circles in this pass to create rounds
  const nodes = new Set<string>();
  for (const edge of edges) {
    nodes.add(`${edge.a.x},${edge.a.y}`);
    nodes.add(`${edge.b.x},${edge.b.y}`);
  }

  const tempPos = LJS.vec2();
  nodes.forEach((key) => {
    const [nx, ny] = key.split(',').map(Number);
    tempPos.set(nx, ny);
    LJS.drawCircle(tempPos, r, color);
  });
}

function drawRoundaboutArrow(
  from: { x: number; y: number },
  to: { x: number; y: number }
): void {
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const angle = Math.atan2(dy, dx);

  const arrowSize = 0.15;

  LJS.drawPoly(
    [
      LJS.vec2(
        midX + Math.cos(angle) * arrowSize,
        midY + Math.sin(angle) * arrowSize
      ),
      LJS.vec2(
        midX + Math.cos(angle + 2.5) * arrowSize,
        midY + Math.sin(angle + 2.5) * arrowSize
      ),
      LJS.vec2(
        midX + Math.cos(angle - 2.5) * arrowSize,
        midY + Math.sin(angle - 2.5) * arrowSize
      )
    ],
    LJS.rgb(1, 1, 1)
  );
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

  // --- PATH RENDERING (FUSED MULTI-PASS) ---
  const pWidth = 0.52;
  const border = COLOR_CONFIG.outlineWidth;
  const pColor = COLOR_RESOURCES.path;

  // 1. MAIN NETWORK
  // Draw normal paths first
  const normalPaths = game.paths.filter(
    (p) => p.roundaboutId === undefined || p.roundaboutId === null
  );
  drawPathPass(normalPaths, pWidth + border * 2, COLOR_RESOURCES.white);
  drawPathPass(normalPaths, pWidth, pColor);

  // Draw roundabout edges with arrows
  const roundaboutEdges = game.paths.filter(
    (p) => p.roundaboutId !== undefined && p.roundaboutId !== null
  );
  drawPathPass(roundaboutEdges, pWidth + border * 2, COLOR_RESOURCES.white);
  drawPathPass(roundaboutEdges, pWidth, new LJS.Color(0.3, 0.4, 0.2));
  for (const edge of roundaboutEdges) {
    drawRoundaboutArrow(edge.a, edge.b);
  }

  // 2. PREVIEW NETWORK (Ghost Paths)
  const previewWhite = new LJS.Color(1, 1, 1, 0.3);
  const previewFill = new LJS.Color(pColor.r, pColor.g, pColor.b, 0.15);
  drawPathPass(game.pathPreview, pWidth + border * 2, previewWhite);
  drawPathPass(game.pathPreview, pWidth, previewFill);

  // Draw roundabout preview when tool is active
  if (game.currentTool === 'roundabout' && game.cursorTile) {
    const { x, y } = game.cursorTile;
    const validation = isValidRoundaboutPlacement(game, x, y);

    LJS.drawRect(
      LJS.vec2(x, y),
      LJS.vec2(3, 3),
      validation.valid
        ? new LJS.Color(0, 1, 0, 0.3)
        : new LJS.Color(1, 0, 0, 0.3)
    );

    if (validation.valid) {
      const previewEdges = createRoundaboutEdges({ x, y });
      for (const edge of previewEdges) {
        drawRoundaboutArrow(edge.a, edge.b);
      }
    }
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
