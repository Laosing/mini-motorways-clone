import { toKey } from '@utils/grid';

export interface PathEdge {
  a: { x: number; y: number };
  b: { x: number; y: number };
}

export function edgeKey(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const ka = toKey(a.x, a.y);
  const kb = toKey(b.x, b.y);
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

export function areAdjacent(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return (dx > 0 || dy > 0) && dx <= 1 && dy <= 1;
}

export function findPathOnNetwork(
  edges: PathEdge[],
  start: { x: number; y: number },
  goal: { x: number; y: number }
): Array<{ x: number; y: number }> {
  if (start.x === goal.x && start.y === goal.y) return [];

  const adj = new Map<string, Array<{ x: number; y: number }>>();
  const pushNeighbor = (from: { x: number; y: number }, to: { x: number; y: number }): void => {
    const key = toKey(from.x, from.y);
    const curr = adj.get(key) ?? [];
    curr.push(to);
    adj.set(key, curr);
  };

  for (const edge of edges) {
    pushNeighbor(edge.a, edge.b);
    pushNeighbor(edge.b, edge.a);
  }

  const queue: Array<{ x: number; y: number }> = [start];
  const visited = new Set<string>([toKey(start.x, start.y)]);
  const parent = new Map<string, { x: number; y: number }>();

  while (queue.length) {
    const current = queue.shift()!;
    const neighbors = adj.get(toKey(current.x, current.y)) ?? [];

    for (const next of neighbors) {
      const nk = toKey(next.x, next.y);
      if (visited.has(nk)) continue;
      visited.add(nk);
      parent.set(nk, current);

      if (next.x === goal.x && next.y === goal.y) {
        const path: Array<{ x: number; y: number }> = [goal];
        let cursor = current;
        while (!(cursor.x === start.x && cursor.y === start.y)) {
          path.unshift(cursor);
          const p = parent.get(toKey(cursor.x, cursor.y));
          if (!p) break;
          cursor = p;
        }
        return path;
      }

      queue.push(next);
    }
  }

  return [];
}
