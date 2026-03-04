import type { Game } from '@core/Game';
import type { Building } from '@entities/Building';
import * as LJS from 'littlejsengine';
import {
  advanceBody,
  applyCrowdAvoidance,
  resolveBodyOverlaps,
  steerToward,
  type AvoidanceConfig,
  type SteeringConfig
} from '@systems/motion';

const NS = 'http://www.w3.org/2000/svg';

// Tiny Yurts source values (src/colors.js, src/svg.js)
const gridCellSize = 8;
const colors = {
  grass: '#8a5',
  path: '#dca',
  yurt: '#fff',
  ox: '#b75',
  goat: '#abb',
  fish: '#f80',
  oxHorn: '#dee',
  black: '#000',
  ui: '#443',
  red: '#e31',
  grid: '#0001',
  shade: '#0000',
  shade2: '#0000'
} as const;

type AnimalKind = 'ox' | 'goat' | 'fish';

interface Scene {
  pathLayer: SVGGElement;
  pathShadowLayer: SVGGElement;
  baseLayer: SVGGElement;
  yurtLayer: SVGGElement;
  yurtAndPersonShadowLayer: SVGGElement;
  farmLayer: SVGGElement;
  animalShadowLayer: SVGGElement;
  animalLayer: SVGGElement;
  personLayer: SVGGElement;
  cursorLayer: SVGGElement;
}

interface PathPoint {
  x: number;
  y: number;
}

interface PathLike {
  id: number;
  points: [PathPoint, PathPoint];
}

interface YurtRender {
  baseShadow: SVGCircleElement;
  shadow: SVGPathElement;
  group: SVGGElement;
  decoration: SVGCircleElement;
}

interface AnimalRender {
  id: string;
  animalId: string;
  kind: AnimalKind;
  isBaby: boolean;
  bornAt: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  rotation: number;
  scale: number;
  dx: number;
  dy: number;
  width: number;
  height: number;
  moveChance: number;
  moveSpeed: number;
  rotateSpeed: number;
  body: SVGRectElement;
  group: SVGGElement;
  horns: SVGPathElement | null;
  demandGroup: SVGGElement;
  demandScaler: SVGGElement;
}

interface FarmRender {
  gridBlock: SVGRectElement;
  fence: SVGRectElement;
  fenceShadow: SVGRectElement;
  animals: AnimalRender[];
}

interface PathRender {
  path: SVGPathElement;
  border: SVGPathElement;
  shadow: SVGPathElement;
}

interface PersonRender {
  group: SVGGElement;
  body: SVGCircleElement;
}

let scene: Scene | null = null;
const yurtMap = new Map<string, YurtRender>();
const farmMap = new Map<string, FarmRender>();
const personMap = new Map<string, PersonRender>();
const pathMap = new Map<string, PathRender>();

function createSvgElement<T extends keyof SVGElementTagNameMap>(
  tag: T
): SVGElementTagNameMap[T] {
  return document.createElementNS(NS, tag);
}

const toSvgCoord = (c: number): number => gridCellSize / 2 + c * gridCellSize;

function typeColor(type: Building['destination'] | string): string {
  if (type === 'ox') return colors.ox;
  if (type === 'goat') return colors.goat;
  if (type === 'fish') return colors.fish;
  return colors.ui;
}

function ensureScene(game: Game): Scene {
  if (scene) return scene;

  const width = game.grid.width * gridCellSize;
  const height = game.grid.height * gridCellSize;

  const host = document.getElementById('game-root') ?? document.body;
  const wrapper = document.createElement('div');
  wrapper.id = 'svg-board';
  wrapper.style.cssText =
    'position:fixed;inset:0;display:grid;place-items:center;pointer-events:none;z-index:2;';

  const svg = createSvgElement('svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  svg.style.width = '100vw';
  svg.style.height = '100vh';
  svg.style.maxHeight = '68vw';
  svg.style.maxWidth = '200vh';

  const defs = createSvgElement('defs');
  const pattern = createSvgElement('pattern');
  pattern.setAttribute('id', 'grid');
  pattern.setAttribute('width', String(gridCellSize));
  pattern.setAttribute('height', String(gridCellSize));
  pattern.setAttribute('patternUnits', 'userSpaceOnUse');

  const gridPath = createSvgElement('path');
  gridPath.setAttribute('d', `M${gridCellSize} 0 0 0 0 ${gridCellSize}`);
  gridPath.setAttribute('fill', 'none');
  gridPath.setAttribute('stroke', colors.grid);
  gridPath.setAttribute('stroke-width', '1');
  pattern.append(gridPath);
  defs.append(pattern);
  svg.append(defs);

  const bg = createSvgElement('rect');
  bg.setAttribute('fill', colors.grass);
  bg.setAttribute('x', '0');
  bg.setAttribute('y', '0');
  bg.setAttribute('width', String(width));
  bg.setAttribute('height', String(height));
  svg.append(bg);

  const grid = createSvgElement('rect');
  grid.setAttribute('width', String(width));
  grid.setAttribute('height', String(height));
  grid.setAttribute('fill', 'url(#grid)');
  svg.append(grid);

  const baseLayer = createSvgElement('g');
  const pathShadowLayer = createSvgElement('g');
  const pathLayer = createSvgElement('g');
  const yurtAndPersonShadowLayer = createSvgElement('g');
  const farmLayer = createSvgElement('g');
  const animalShadowLayer = createSvgElement('g');
  const animalLayer = createSvgElement('g');
  const yurtLayer = createSvgElement('g');
  const personLayer = createSvgElement('g');
  const cursorLayer = createSvgElement('g');

  svg.append(
    baseLayer,
    yurtAndPersonShadowLayer,
    pathShadowLayer,
    pathLayer,
    yurtLayer,
    farmLayer,
    animalShadowLayer,
    animalLayer,
    personLayer,
    cursorLayer
  );

  wrapper.append(svg);
  host.append(wrapper);

  scene = {
    pathLayer,
    pathShadowLayer,
    baseLayer,
    yurtLayer,
    yurtAndPersonShadowLayer,
    farmLayer,
    animalShadowLayer,
    animalLayer,
    personLayer,
    cursorLayer
  };

  return scene;
}

function buildJoinedPathDs(pathList: PathLike[]): string[] {
  const connections: Array<{
    path1: PathLike;
    path2: PathLike;
    points: [PathPoint, PathPoint, PathPoint];
  }> = [];

  pathList.forEach((path1) => {
    pathList.forEach((path2) => {
      if (path1.id === path2.id) return;
      if (
        connections.find(
          (c) => c.path1.id === path2.id && c.path2.id === path1.id
        )
      )
        return;

      if (
        path1.points[0].x === path2.points[0].x &&
        path1.points[0].y === path2.points[0].y
      ) {
        connections.push({
          path1,
          path2,
          points: [path1.points[1], path1.points[0], path2.points[1]]
        });
      } else if (
        path1.points[0].x === path2.points[1].x &&
        path1.points[0].y === path2.points[1].y
      ) {
        connections.push({
          path1,
          path2,
          points: [path1.points[1], path1.points[0], path2.points[0]]
        });
      } else if (
        path1.points[1].x === path2.points[0].x &&
        path1.points[1].y === path2.points[0].y
      ) {
        connections.push({
          path1,
          path2,
          points: [path1.points[0], path1.points[1], path2.points[1]]
        });
      } else if (
        path1.points[1].x === path2.points[1].x &&
        path1.points[1].y === path2.points[1].y
      ) {
        connections.push({
          path1,
          path2,
          points: [path1.points[0], path1.points[1], path2.points[0]]
        });
      }
    });
  });

  const ds: string[] = [];

  connections.forEach(({ points }) => {
    const M = `M${toSvgCoord(points[0].x)} ${toSvgCoord(points[0].y)}`;

    const Lx1 = toSvgCoord(points[0].x + (points[1].x - points[0].x) / 2);
    const Ly1 = toSvgCoord(points[0].y + (points[1].y - points[0].y) / 2);
    const L1 = `L${Lx1} ${Ly1}`;

    const Lx2 = toSvgCoord(points[2].x);
    const Ly2 = toSvgCoord(points[2].y);
    const L2 = `L${Lx2} ${Ly2}`;

    const Qx1 = toSvgCoord(points[1].x);
    const Qy1 = toSvgCoord(points[1].y);
    const Qx = toSvgCoord(points[1].x + (points[2].x - points[1].x) / 2);
    const Qy = toSvgCoord(points[1].y + (points[2].y - points[1].y) / 2);
    const Q = `Q${Qx1} ${Qy1} ${Qx} ${Qy}`;

    const start = connections.find(
      (c) => points[0].x === c.points[1].x && points[0].y === c.points[1].y
    )
      ? `M${Lx1} ${Ly1}`
      : `${M}${L1}`;

    const end = connections.find(
      (c) => points[2].x === c.points[1].x && points[2].y === c.points[1].y
    )
      ? ''
      : L2;

    ds.push(`${start}${Q}${end}`);
  });

  pathList.forEach((path) => {
    const connected = connections.find(
      (c) => c.path1.id === path.id || c.path2.id === path.id
    );
    if (connected) return;

    const p0 = path.points[0];
    const p1 = path.points[1];
    ds.push(
      `M${toSvgCoord(p0.x)} ${toSvgCoord(p0.y)}L${toSvgCoord(p1.x)} ${toSvgCoord(p1.y)}`
    );
  });

  return ds;
}

function addPathWithTransition(s: Scene, d: string): PathRender {
  const border = createSvgElement('path');
  border.setAttribute('d', d);
  border.setAttribute('fill', 'none');
  border.setAttribute('stroke', colors.ui);
  border.setAttribute('stroke-linecap', 'round');
  border.setAttribute('stroke-linejoin', 'round');
  border.style.transition = 'all .4s, opacity .2s';
  border.setAttribute('stroke-width', '0');
  border.setAttribute('opacity', '0');
  s.pathShadowLayer.append(border);

  const path = createSvgElement('path');
  path.setAttribute('d', d);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', colors.path);
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  path.style.transition = 'all .4s, opacity .2s';
  path.setAttribute('stroke-width', '0');
  path.setAttribute('opacity', '0');
  s.pathLayer.append(path);

  const shadow = createSvgElement('path');
  shadow.setAttribute('d', d);
  shadow.setAttribute('fill', 'none');
  shadow.setAttribute('stroke', colors.shade2);
  shadow.setAttribute('stroke-linecap', 'round');
  shadow.setAttribute('stroke-linejoin', 'round');
  shadow.setAttribute('stroke-width', '3');
  shadow.style.transform = 'translate(-0.5px,-0.5px)';
  s.pathShadowLayer.append(shadow);

  setTimeout(() => {
    border.setAttribute('stroke-width', '8');
    border.setAttribute('opacity', '1');
    path.setAttribute('stroke-width', '6.5');
    path.setAttribute('opacity', '1');
  }, 20);

  return { path, border, shadow };
}

function syncPaths(s: Scene, game: Game): void {
  const pathList = game.paths.map((p, id) => ({
    id,
    points: [p.a, p.b] as [PathPoint, PathPoint]
  }));
  const ds = buildJoinedPathDs(pathList);
  const next = new Set(ds);

  ds.forEach((d) => {
    const render = pathMap.get(d);
    if (render) {
      render.path.setAttribute('d', d);
      render.border.setAttribute('d', d);
      render.shadow.setAttribute('d', d);
      return;
    }

    const created = addPathWithTransition(s, d);
    pathMap.set(d, created);
  });

  for (const [d, render] of pathMap.entries()) {
    if (next.has(d)) continue;

    render.path.setAttribute('opacity', '0');
    render.path.setAttribute('stroke-width', '0');
    render.border.setAttribute('opacity', '0');
    render.border.setAttribute('stroke-width', '0');
    render.shadow.setAttribute('opacity', '0');

    setTimeout(() => {
      render.path.remove();
      render.border.remove();
      render.shadow.remove();
    }, 500);
    pathMap.delete(d);
  }
}

function addYurtRender(s: Scene, b: Building): YurtRender {
  const x = toSvgCoord(b.x);
  const y = toSvgCoord(b.y);

  const baseShadow = createSvgElement('circle');
  baseShadow.setAttribute('fill', colors.shade);
  baseShadow.setAttribute('r', '0');
  baseShadow.setAttribute('stroke', 'none');
  baseShadow.setAttribute('transform', `translate(${x},${y})`);
  baseShadow.style.opacity = '0';
  baseShadow.style.transition = 'all .4s';
  s.baseLayer.append(baseShadow);
  setTimeout(() => {
    baseShadow.setAttribute('r', '3');
    baseShadow.style.opacity = '1';
  }, 100);

  const shadow = createSvgElement('path');
  shadow.setAttribute('d', 'M0 0 0 0');
  shadow.setAttribute('stroke-width', '6');
  shadow.setAttribute('stroke', colors.shade2);
  shadow.style.transform = `translate(${x}px,${y}px)`;
  shadow.style.opacity = '0';
  shadow.style.transition = 'd .6s';
  s.yurtAndPersonShadowLayer.append(shadow);
  setTimeout(() => {
    shadow.style.opacity = '0.8';
  }, 800);
  setTimeout(() => {
    shadow.setAttribute('d', 'M0 0 2 2');
  }, 900);

  const group = createSvgElement('g');
  group.style.transform = `translate(${x}px,${y}px)`;
  s.yurtLayer.append(group);

  const circle = createSvgElement('circle');
  circle.setAttribute('r', '0');
  circle.setAttribute('fill', colors.yurt);
  circle.style.transition = 'r .4s';
  setTimeout(() => {
    circle.setAttribute('r', '3');
  }, 400);

  const decoration = createSvgElement('circle');
  decoration.setAttribute('fill', 'none');
  decoration.setAttribute('r', '1');
  decoration.setAttribute('stroke-dasharray', '6.3');
  decoration.setAttribute('stroke-dashoffset', '6.3');
  decoration.setAttribute('stroke', typeColor(b.destination));
  decoration.style.transition = 'stroke-dashoffset .5s';
  setTimeout(() => {
    decoration.setAttribute('stroke-dashoffset', '0');
  }, 700);

  group.append(circle, decoration);

  return { baseShadow, shadow, group, decoration };
}

function syncYurts(s: Scene, game: Game): void {
  const current = new Set(game.yurts.map((y) => y.id));

  for (const yurt of game.yurts) {
    let render = yurtMap.get(yurt.id);
    if (!render) {
      render = addYurtRender(s, yurt);
      yurtMap.set(yurt.id, render);
    }

    render.decoration.setAttribute('stroke', typeColor(yurt.destination));
  }

  for (const [id, render] of yurtMap.entries()) {
    if (current.has(id)) continue;
    render.baseShadow.remove();
    render.shadow.remove();
    render.group.remove();
    yurtMap.delete(id);
  }
}

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function createAnimalRender(
  s: Scene,
  farm: Building,
  idx: number,
  animalId: string
): AnimalRender {
  const kind: AnimalKind = farm.destination;
  const isBaby = false; // All animals start as adults for consistent size

  const width = 3.3;
  const height = 2.1;
  const roundness = kind === 'fish' ? 1 : 0.6;

  const group = createSvgElement('g');
  s.animalLayer.prepend(group);

  const body = createSvgElement('rect');
  body.setAttribute('fill', kind === 'fish' ? colors.fish : typeColor(kind));
  body.setAttribute('x', String(-width / 2));
  body.setAttribute('y', String(-height / 2));
  body.setAttribute('width', String(width));
  body.setAttribute('height', String(height));
  body.setAttribute('rx', String(roundness));
  group.append(body);

  let horns: SVGPathElement | null = null;
  if (kind === 'ox') {
    horns = createSvgElement('path');
    horns.setAttribute('fill', 'none');
    horns.setAttribute('stroke', colors.oxHorn);
    // Horns at the front (+X)
    horns.setAttribute('d', 'M-0.8 -1.2 C0.5 -1.2, 0.5 1.2, -0.8 1.2');
    horns.setAttribute('transform', `translate(${width / 2 - 0.5} 0)`);
    horns.setAttribute('stroke-width', '0.45');
    horns.style.opacity = isBaby ? '0' : '1';
    horns.style.transition = 'all 1s';
    group.append(horns);
  } else if (kind === 'goat') {
    // Sheep head at the front (+X)
    const head = createSvgElement('circle');
    head.setAttribute('r', '0.85');
    head.setAttribute('fill', colors.ui);
    head.setAttribute('opacity', '0.5');
    head.setAttribute('transform', `translate(${width / 2 - 0.2} 0)`);
    group.append(head);

    const earT = createSvgElement('ellipse');
    earT.setAttribute('rx', '0.6');
    earT.setAttribute('ry', '0.35');
    earT.setAttribute('fill', colors.goat);
    earT.setAttribute(
      'transform',
      `translate(${width / 2 - 0.4} -0.85) rotate(-35)`
    );
    group.append(earT);

    const earB = createSvgElement('ellipse');
    earB.setAttribute('rx', '0.6');
    earB.setAttribute('ry', '0.35');
    earB.setAttribute('fill', colors.goat);
    earB.setAttribute(
      'transform',
      `translate(${width / 2 - 0.4} 0.85) rotate(35)`
    );
    group.append(earB);
  }

  const padding = 3;
  const rangeX = farm.width * gridCellSize;
  const rangeY = farm.height * gridCellSize;
  const x = randomInRange(padding, rangeX - padding);
  const y = randomInRange(padding, rangeY - padding);

  const createdAt = performance.now();

  const demandGroup = createSvgElement('g');
  demandGroup.style.opacity = '0';
  s.animalLayer.append(demandGroup);

  const demandScaler = createSvgElement('g');
  demandScaler.style.transform = 'scale(0)';
  demandScaler.style.transformOrigin = 'bottom';
  demandScaler.style.transformBox = 'fill-box';
  demandScaler.style.transition = 'transform .2s ease, opacity .15s ease';
  demandGroup.append(demandScaler);

  const pinBubble = createSvgElement('path');
  pinBubble.setAttribute('fill', '#fff');
  pinBubble.setAttribute('d', 'm0 0-2-2a3 3 0 1 1 4 0z');
  pinBubble.setAttribute('transform', 'scale(0.7)');

  const warnCircleBg = createSvgElement('circle');
  warnCircleBg.setAttribute('fill', 'none');
  warnCircleBg.setAttribute('stroke-width', '1');
  warnCircleBg.setAttribute('stroke-linecap', 'square');
  warnCircleBg.setAttribute('r', '1');
  warnCircleBg.setAttribute('stroke', colors.ui);
  warnCircleBg.setAttribute('opacity', '0.2');
  warnCircleBg.setAttribute('transform', 'translate(0 -2.6) scale(0.8)');

  const demandStem = createSvgElement('path');
  demandStem.setAttribute('d', 'M0 -3.4 L0 -2.4');
  demandStem.setAttribute('fill', 'none');
  demandStem.setAttribute('stroke', colors.red);
  demandStem.setAttribute('stroke-width', '0.7');
  demandStem.setAttribute('stroke-linecap', 'round');
  demandStem.setAttribute('stroke-linejoin', 'round');

  const demandDot = createSvgElement('circle');
  demandDot.setAttribute('r', '0.28');
  demandDot.setAttribute('fill', colors.red);
  demandDot.setAttribute('transform', 'translate(0 -1.8)');

  demandScaler.append(pinBubble, warnCircleBg, demandStem, demandDot);

  return {
    id: `${farm.id}-a-${createdAt}-${idx}`,
    animalId,
    kind,
    isBaby,
    bornAt: createdAt,
    x,
    y,
    tx: x,
    ty: y,
    rotation: randomInRange(-Math.PI * 2, Math.PI * 2),
    scale: 0,
    dx: 0,
    dy: 0,
    width,
    height,
    moveChance: 0.998,
    moveSpeed: 0.045,
    rotateSpeed: 0.06,
    body,
    group,
    horns,
    demandGroup,
    demandScaler
  };
}

function updateAnimalMotion(farm: Building, animals: AnimalRender[]): void {
  const padding = 2.5;
  const rangeX = farm.width * gridCellSize;
  const rangeY = farm.height * gridCellSize;
  const dt = LJS.timeDelta * 60; // Normalize to 60fps

  for (const animal of animals) {
    // 1. Target picking (Wander)
    if (Math.random() > animal.moveChance) {
      animal.tx = randomInRange(padding, rangeX - padding);
      animal.ty = randomInRange(padding, rangeY - padding);
    }

    // 2. Movement logic - Force based
    const toTarget = LJS.vec2(animal.tx - animal.x, animal.ty - animal.y);
    const dist = toTarget.length();

    if (dist > 0.5) {
      const desiredVel = toTarget.normalize().scale(animal.moveSpeed);
      const steer = desiredVel.subtract(LJS.vec2(animal.dx, animal.dy));
      // Very gentle acceleration for peaceful movement
      animal.dx += steer.x * 0.04 * dt;
      animal.dy += steer.y * 0.04 * dt;
    } else {
      // Arrived at target: gentle slowdown
      animal.dx *= Math.pow(0.9, dt);
      animal.dy *= Math.pow(0.9, dt);
    }

    // 3. Organic Avoidance - separate as a light repulsive force
    for (const other of animals) {
      if (other.id === animal.id) continue;
      const delta = LJS.vec2(animal.x - other.x, animal.y - other.y);
      const d = delta.length();
      if (d < 4.5 && d > 0.001) {
        const force = (4.5 - d) * 0.012 * dt;
        const push = delta.normalize().scale(force);
        animal.dx += push.x;
        animal.dy += push.y;
      }
    }

    // 4. Boundary "Pushes" (avoiding the hard snap at edges)
    if (animal.x < padding) animal.dx += 0.02 * dt;
    if (animal.x > rangeX - padding) animal.dx -= 0.02 * dt;
    if (animal.y < padding) animal.dy += 0.02 * dt;
    if (animal.y > rangeY - padding) animal.dy -= 0.02 * dt;

    // 5. Apply velocity with higher damping to prevent orbits
    animal.dx *= Math.pow(0.92, dt);
    animal.dy *= Math.pow(0.92, dt);

    animal.x += animal.dx * dt;
    animal.y += animal.dy * dt;

    // 6. Constraints to stay inside farm
    animal.x = Math.min(rangeX - padding, Math.max(padding, animal.x));
    animal.y = Math.min(rangeY - padding, Math.max(padding, animal.y));

    // 7. Dynamic Rotation - always face current velocity smoothly
    const speed = Math.hypot(animal.dx, animal.dy);
    if (speed > 0.005) {
      const targetRotation = Math.atan2(animal.dy, animal.dx);
      let diff = targetRotation - animal.rotation;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      animal.rotation += diff * 0.08 * dt;
    }
  }

  // Final hard separation to prevent stacking during spawns/clutter
  resolveBodyOverlaps(animals, 4.0);
}

function renderAnimalTransforms(farm: Building, animals: AnimalRender[]): void {
  const demandByAnimalId = new Map(
    (farm.animals ?? []).map((a) => [a.id, a.hasDemand])
  );
  for (const animal of animals) {
    const centerX = farm.x * gridCellSize + animal.x;
    const centerY = farm.y * gridCellSize + animal.y;

    const scale = animal.scale;

    // No offset needed anymore as sprites are oriented horizontally (+X is front).
    animal.group.style.transform = `translate(${centerX}px, ${centerY}px) rotate(${
      (animal.rotation * 180) / Math.PI
    }deg) scale(${scale})`;

    const hasDemand = Boolean(demandByAnimalId.get(animal.animalId));
    const tooltipY = centerY - 2.8;
    animal.demandGroup.style.opacity = hasDemand ? '1' : '0';
    animal.demandGroup.style.transform = `translate(${centerX}px, ${tooltipY}px)`;
    animal.demandScaler.style.transform = `scale(${hasDemand ? 1 : 0})`;
  }
}

function syncFarmAnimals(s: Scene, farm: Building, render: FarmRender): void {
  const farmAnimals = farm.animals ?? [];
  const wantedIds = new Set(farmAnimals.map((a) => a.id));
  const byAnimalId = new Map(render.animals.map((a) => [a.animalId, a]));

  const next: AnimalRender[] = [];
  for (let i = 0; i < farmAnimals.length; i += 1) {
    const state = farmAnimals[i];
    let existing = byAnimalId.get(state.id);
    if (!existing) {
      const created = createAnimalRender(s, farm, i, state.id);
      existing = created;
      setTimeout(() => {
        if (render.animals.includes(created)) created.scale = 1;
      }, 500);
    }
    next.push(existing);
  }

  for (const stale of render.animals) {
    if (wantedIds.has(stale.animalId)) continue;
    stale.group.remove();
    stale.demandGroup.remove();
  }
  render.animals = next;

  updateAnimalMotion(farm, render.animals);
  renderAnimalTransforms(farm, render.animals);
}

function addFarmRender(s: Scene, b: Building): FarmRender {
  const roundness = 2;
  const fenceLineThickness = 1;
  const gridLineThickness = 0.5;
  const widthCells = b.width;
  const heightCells = b.height;

  const x = b.x * gridCellSize + fenceLineThickness / 2 + gridLineThickness / 2;
  const y = b.y * gridCellSize + fenceLineThickness / 2 + gridLineThickness / 2;
  const svgWidth =
    gridCellSize * widthCells - fenceLineThickness - gridLineThickness;
  const svgHeight =
    gridCellSize * heightCells - fenceLineThickness - gridLineThickness;

  const gridBlock = createSvgElement('rect');
  gridBlock.setAttribute('width', String(svgWidth));
  gridBlock.setAttribute('height', String(svgHeight));
  gridBlock.setAttribute('rx', String(roundness));
  gridBlock.setAttribute('transform', `translate(${x},${y})`);
  gridBlock.setAttribute('fill', colors.grass);
  gridBlock.style.opacity = b.destination === 'fish' ? '0' : '0';
  gridBlock.style.transition = 'opacity .8s';
  s.baseLayer.append(gridBlock);
  if (b.destination !== 'fish') {
    setTimeout(() => {
      gridBlock.style.opacity = '1';
    }, 1000);
  }

  const circumference =
    widthCells * gridCellSize * 2 + heightCells * gridCellSize * 2;

  const fence = createSvgElement('rect');
  fence.setAttribute('width', String(svgWidth));
  fence.setAttribute('height', String(svgHeight));
  fence.setAttribute('rx', String(roundness));
  fence.setAttribute('transform', `translate(${x},${y})`);
  fence.setAttribute('fill', 'none');
  fence.setAttribute('stroke-width', String(fenceLineThickness));
  fence.setAttribute('stroke', typeColor(b.destination));
  fence.setAttribute('stroke-dasharray', String(circumference));
  fence.setAttribute('stroke-dashoffset', String(circumference));
  fence.style.transition = 'all 1s';
  s.farmLayer.append(fence);

  const fenceShadow = createSvgElement('rect');
  fenceShadow.setAttribute('width', String(svgWidth));
  fenceShadow.setAttribute('height', String(svgHeight));
  fenceShadow.setAttribute('rx', String(roundness));
  fenceShadow.setAttribute('fill', 'none');
  fenceShadow.setAttribute('stroke-width', String(fenceLineThickness));
  fenceShadow.setAttribute('stroke', colors.shade2);
  fenceShadow.style.transform = `translate(${x - 0.5}px,${y - 0.5}px)`;
  fenceShadow.setAttribute('stroke-dasharray', String(circumference));
  fenceShadow.setAttribute('stroke-dashoffset', String(circumference));
  fenceShadow.style.transition = 'stroke-dashoffset 1s, transform .5s';
  s.farmLayer.append(fenceShadow);

  setTimeout(() => {
    fence.setAttribute('stroke-dashoffset', '0');
    fenceShadow.setAttribute('stroke-dashoffset', '0');
  }, 100);
  setTimeout(() => {
    fenceShadow.style.transform = `translate(${x}px,${y}px)`;
  }, 1000);

  return { gridBlock, fence, fenceShadow, animals: [] };
}

function syncFarms(s: Scene, game: Game): void {
  const current = new Set(game.farms.map((f) => f.id));

  for (const farm of game.farms) {
    let render = farmMap.get(farm.id);
    if (!render) {
      render = addFarmRender(s, farm);
      farmMap.set(farm.id, render);
    }

    syncFarmAnimals(s, farm, render);
  }

  for (const [id, render] of farmMap.entries()) {
    if (current.has(id)) continue;
    render.gridBlock.remove();
    render.fence.remove();
    render.fenceShadow.remove();
    render.animals.forEach((a) => {
      a.group.remove();
      a.demandGroup.remove();
    });
    farmMap.delete(id);
  }
}

function addPersonRender(s: Scene): PersonRender {
  const group = createSvgElement('g');
  const body = createSvgElement('circle');
  body.setAttribute('r', '1.35');
  body.setAttribute('opacity', '0.95');

  const head = createSvgElement('circle');
  head.setAttribute('r', '0.8');
  head.setAttribute('fill', colors.ui);
  head.setAttribute('opacity', '0.4');
  head.setAttribute('cx', '0.7');

  group.append(body, head);
  s.personLayer.append(group);

  return { group, body };
}

function syncPeople(s: Scene, game: Game): void {
  const current = new Set(game.villagers.map((v) => v.id));

  for (const villager of game.villagers) {
    let render = personMap.get(villager.id);
    if (!render) {
      render = addPersonRender(s);
      personMap.set(villager.id, render);
    }

    const x = toSvgCoord(villager.x);
    const y = toSvgCoord(villager.y);

    const rotationDeg = (villager.rotation * 180) / Math.PI;
    render.body.setAttribute('fill', typeColor(villager.destinationType));
    render.group.setAttribute(
      'transform',
      `translate(${x},${y}) rotate(${rotationDeg})`
    );
  }

  for (const [id, render] of personMap.entries()) {
    if (current.has(id)) continue;
    render.group.remove();
    personMap.delete(id);
  }
}

function renderCursor(s: Scene, game: Game): void {
  s.cursorLayer.innerHTML = '';

  if (
    !game.cursorTile ||
    !game.grid.isInside(game.cursorTile.x, game.cursorTile.y)
  )
    return;

  const rect = createSvgElement('rect');
  rect.setAttribute('x', String(game.cursorTile.x * gridCellSize));
  rect.setAttribute('y', String(game.cursorTile.y * gridCellSize));
  rect.setAttribute('width', String(gridCellSize));
  rect.setAttribute('height', String(gridCellSize));
  rect.setAttribute('fill', '#0001');
  rect.setAttribute('stroke', colors.red);
  rect.setAttribute('stroke-opacity', '0.15');
  rect.setAttribute('stroke-width', '1');
  s.cursorLayer.append(rect);
}

export function renderSvgScene(game: Game): void {
  const s = ensureScene(game);

  syncPaths(s, game);
  syncYurts(s, game);
  syncFarms(s, game);
  syncPeople(s, game);
  renderCursor(s, game);
}
