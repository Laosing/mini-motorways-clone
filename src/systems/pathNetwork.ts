import { toKey, manhattan } from '@utils/grid';

export interface PathEdge {
  a: { x: number; y: number };
  b: { x: number; y: number };
}

export function edgeKey(
  a: { x: number; y: number },
  b: { x: number; y: number }
): string {
  const ka = toKey(a.x, a.y);
  const kb = toKey(b.x, b.y);
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

export function areAdjacent(
  a: { x: number; y: number },
  b: { x: number; y: number }
): boolean {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return (dx > 0 || dy > 0) && dx <= 1 && dy <= 1;
}

interface Node {
  key: string;
  pos: { x: number; y: number };
  g: number;
  f: number;
}

export function findPathOnNetwork(
  edges: PathEdge[],
  start: { x: number; y: number },
  goal: { x: number; y: number }
): Array<{ x: number; y: number }> {
  if (start.x === goal.x && start.y === goal.y) return [];

  const adj = new Map<string, Array<{ x: number; y: number }>>();
  for (const edge of edges) {
    const ka = toKey(edge.a.x, edge.a.y);
    const kb = toKey(edge.b.x, edge.b.y);

    const neighborsA = adj.get(ka) || [];
    neighborsA.push(edge.b);
    adj.set(ka, neighborsA);

    const neighborsB = adj.get(kb) || [];
    neighborsB.push(edge.a);
    adj.set(kb, neighborsB);
  }

  const startKey = toKey(start.x, start.y);
  const goalKey = toKey(goal.x, goal.y);

  const openList: Node[] = [
    {
      key: startKey,
      pos: start,
      g: 0,
      f: manhattan(start.x, start.y, goal.x, goal.y)
    }
  ];
  const closedSet = new Set<string>();
  const parentMap = new Map<string, { x: number; y: number }>();
  const gScores = new Map<string, number>();
  gScores.set(startKey, 0);

  while (openList.length > 0) {
    // Sort to get best f (primitive priority queue)
    openList.sort((a, b) => a.f - b.f);
    const current = openList.shift()!;

    if (current.key === goalKey) {
      const path: Array<{ x: number; y: number }> = [];
      let currPos = current.pos;
      let currKey = current.key;
      while (currKey !== startKey) {
        path.unshift(currPos);
        currPos = parentMap.get(currKey)!;
        currKey = toKey(currPos.x, currPos.y);
      }
      return path;
    }

    closedSet.add(current.key);

    const neighbors = adj.get(current.key) || [];
    for (const neighbor of neighbors) {
      const nKey = toKey(neighbor.x, neighbor.y);
      if (closedSet.has(nKey)) continue;

      const tentativeG = current.g + 1;
      const existingG = gScores.get(nKey) ?? Infinity;

      if (tentativeG < existingG) {
        parentMap.set(nKey, current.pos);
        gScores.set(nKey, tentativeG);
        const f =
          tentativeG + manhattan(neighbor.x, neighbor.y, goal.x, goal.y);

        const openNode = openList.find((n) => n.key === nKey);
        if (openNode) {
          openNode.g = tentativeG;
          openNode.f = f;
        } else {
          openList.push({ key: nKey, pos: neighbor, g: tentativeG, f });
        }
      }
    }
  }

  return [];
}
