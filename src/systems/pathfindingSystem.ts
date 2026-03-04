import type { GridMap } from '@world/GridMap';
import { isBlocked } from '@world/occupancy';
import { manhattan, toKey } from '@utils/grid';

interface Node {
  x: number;
  y: number;
  g: number;
  f: number;
  parent: Node | null;
}

export function findPath(
  grid: GridMap,
  start: { x: number; y: number },
  goal: { x: number; y: number }
): Array<{ x: number; y: number }> {
  if (start.x === goal.x && start.y === goal.y) return [];

  const open: Node[] = [{ x: start.x, y: start.y, g: 0, f: 0, parent: null }];
  const closed = new Set<string>();

  while (open.length) {
    open.sort((a, b) => a.f - b.f);
    const current = open.shift()!;

    if (current.x === goal.x && current.y === goal.y) {
      const path: Array<{ x: number; y: number }> = [];
      let node: Node | null = current;
      while (node && node.parent) {
        path.unshift({ x: node.x, y: node.y });
        node = node.parent;
      }
      return path;
    }

    closed.add(toKey(current.x, current.y));

    const neighbors = [
      { x: current.x + 1, y: current.y },
      { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 }
    ];

    for (const n of neighbors) {
      const key = toKey(n.x, n.y);
      if (closed.has(key) || !grid.isInside(n.x, n.y)) continue;
      if (isBlocked(grid, n.x, n.y) && !(n.x === goal.x && n.y === goal.y)) continue;

      const g = current.g + 1;
      const h = manhattan(n.x, n.y, goal.x, goal.y);
      const existing = open.find((node) => node.x === n.x && node.y === n.y);
      if (!existing) {
        open.push({ x: n.x, y: n.y, g, f: g + h, parent: current });
      } else if (g < existing.g) {
        existing.g = g;
        existing.f = g + h;
        existing.parent = current;
      }
    }
  }

  return [];
}
