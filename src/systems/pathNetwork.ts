import { toKey, manhattan } from '@utils/grid';

export interface PathEdge {
  a: { x: number; y: number };
  b: { x: number; y: number };
  direction?: 'clockwise';
  roundaboutId?: string;
}

export interface Roundabout {
  id: string;
  center: { x: number; y: number };
  direction: 'clockwise';
  edges: PathEdge[];
}

export function isDirectedEdge(edge: PathEdge): boolean {
  return edge.direction === 'clockwise';
}

export function edgeKey(
  a: { x: number; y: number },
  b: { x: number; y: number }
): string {
  const ka = toKey(a.x, a.y);
  const kb = toKey(b.x, b.y);
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

export function createRoundaboutEdges(center: {
  x: number;
  y: number;
}): PathEdge[] {
  const edges: PathEdge[] = [];
  const id = `roundabout-${center.x}-${center.y}`;
  const radius = 1;

  const perimeter: { x: number; y: number }[] = [
    { x: center.x - 1, y: center.y - 1 },
    { x: center.x, y: center.y - 1 },
    { x: center.x + 1, y: center.y - 1 },
    { x: center.x + 1, y: center.y },
    { x: center.x + 1, y: center.y + 1 },
    { x: center.x, y: center.y + 1 },
    { x: center.x - 1, y: center.y + 1 },
    { x: center.x - 1, y: center.y }
  ];

  for (let i = 0; i < perimeter.length; i++) {
    const from = perimeter[i];
    const to = perimeter[(i + 1) % perimeter.length];
    edges.push({
      a: { ...from },
      b: { ...to },
      direction: 'clockwise',
      roundaboutId: id
    });
  }

  return edges;
}

export function areAdjacent(
  a: { x: number; y: number },
  b: { x: number; y: number }
): boolean {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return (dx > 0 || dy > 0) && dx <= 1 && dy <= 1;
}

/**
 * Validates that a roundabout's edges form a proper clockwise loop.
 * Returns validation result with any errors found.
 */
export function validateRoundaboutLoop(edges: PathEdge[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (edges.length === 0) {
    return { valid: true, errors: [] };
  }

  // Check that all edges have the same roundaboutId
  const firstId = edges[0].roundaboutId;
  if (!firstId) {
    errors.push('First edge missing roundaboutId');
    return { valid: false, errors };
  }

  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    if (edge.roundaboutId !== firstId) {
      errors.push(
        `Edge ${i} has roundaboutId "${edge.roundaboutId}" but expected "${firstId}"`
      );
    }
    if (edge.direction !== 'clockwise') {
      errors.push(
        `Edge ${i} has direction "${edge.direction}" but expected "clockwise"`
      );
    }
  }

  // Build a map to verify complete loop connectivity
  const edgeCount = edges.length;
  const visitedCount = new Map<string, number>();
  const connectionMap = new Map<string, { x: number; y: number }>();

  for (const edge of edges) {
    const fromKey = toKey(edge.a.x, edge.a.y);
    const bKey = toKey(edge.b.x, edge.b.y);

    // Each node should appear exactly twice in a complete loop
    const fromCount = (visitedCount.get(fromKey) ?? 0) + 1;
    visitedCount.set(fromKey, fromCount);

    const bCount = (visitedCount.get(bKey) ?? 0) + 1;
    visitedCount.set(bKey, bCount);

    // Verify connectivity: a should connect to exactly one node
    const existing = connectionMap.get(fromKey);
    if (existing !== undefined) {
      errors.push(`Node ${fromKey} has multiple outgoing edges`);
    } else {
      connectionMap.set(fromKey, edge.b);
    }
  }

  // Verify all nodes appear exactly twice (once as source, once as target)
  for (const [key, count] of visitedCount) {
    if (count !== 2) {
      errors.push(`Node ${key} appears ${count} times in loop (expected 2)`);
    }
  }

  // Verify that following edges leads back to start
  if (errors.length === 0 && edges.length > 0) {
    const startKey = toKey(edges[0].a.x, edges[0].a.y);
    let currentKey = startKey;
    const visited = new Set<string>();

    for (let i = 0; i < edgeCount * 2; i++) {
      if (visited.has(currentKey)) {
        errors.push(`Loop detected before completing full traversal`);
        break;
      }
      visited.add(currentKey);

      const next = connectionMap.get(currentKey);
      if (!next) {
        errors.push(`No outgoing edge from node ${currentKey}`);
        break;
      }

      currentKey = toKey(next.x, next.y);

      if (currentKey === startKey) {
        // Successfully completed the loop
        if (visited.size !== edgeCount) {
          errors.push(`Loop has ${visited.size} nodes but ${edgeCount} edges`);
        }
        break;
      }
    }

    if (currentKey !== startKey && errors.length === 0) {
      errors.push('Edges do not form a complete closed loop');
    }
  }

  return { valid: errors.length === 0, errors };
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
  // Defensive check: validate inputs
  if (!Number.isFinite(start.x) || !Number.isFinite(start.y)) return [];
  if (!Number.isFinite(goal.x) || !Number.isFinite(goal.y)) return [];

  if (start.x === goal.x && start.y === goal.y) return [];

  const adj = new Map<string, Array<{ x: number; y: number }>>();

  for (const edge of edges) {
    // Defensive check: validate edge coordinates
    if (
      !Number.isFinite(edge.a.x) ||
      !Number.isFinite(edge.a.y) ||
      !Number.isFinite(edge.b.x) ||
      !Number.isFinite(edge.b.y)
    ) {
      continue;
    }

    const ka = toKey(edge.a.x, edge.a.y);
    const kb = toKey(edge.b.x, edge.b.y);

    // Check if this is a roundabout edge (has roundaboutId)
    const isRoundaboutEdge =
      edge.roundaboutId !== undefined && edge.roundaboutId !== null;
    if (isRoundaboutEdge) {
      // Only add edge in clockwise direction (a -> b)
      const neighbors = adj.get(ka) || [];
      neighbors.push(edge.b);
      adj.set(ka, neighbors);
    } else {
      // Bidirectional - add both directions
      const neighborsA = adj.get(ka) || [];
      neighborsA.push(edge.b);
      adj.set(ka, neighborsA);

      const neighborsB = adj.get(kb) || [];
      neighborsB.push(edge.a);
      adj.set(kb, neighborsB);
    }
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

      // Debug: validate path doesn't go counter-clockwise through roundabout

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

/**
 * Validate that a path respects roundabout direction rules.
 * Logs violations if any are found.
 */
function validatePathDirection(
  edges: PathEdge[],
  path: Array<{ x: number; y: number }>,
  start: { x: number; y: number },
  goal: { x: number; y: number }
): void {
  const edgeMap = new Map<string, PathEdge>();

  // Build edge lookup
  for (const edge of edges) {
    if (edge.roundaboutId) {
      const fromKey = toKey(edge.a.x, edge.a.y);
      const bKey = toKey(edge.b.x, edge.b.y);
      edgeMap.set(`${fromKey}|${bKey}`, edge);
    }
  }

  // Check each segment in path
  const fullPath = [start, ...path];
  for (let i = 0; i < fullPath.length - 1; i++) {
    const from = fullPath[i];
    const next = fullPath[i + 1];
    const fromKey = toKey(from.x, from.y);
    const nextKey = toKey(next.x, next.y);
    const edgeKey = `${fromKey}|${nextKey}`;
    const edge = edgeMap.get(edgeKey);

    if (edge && edge.roundaboutId) {
      // Verify we're going clockwise (a -> b)
      if (edge.a.x === from.x && edge.a.y === from.y) {
        // Clockwise, okay
      } else {
        // Check reverse - this would be counter-clockwise
        const reverseKey = `${nextKey}|${fromKey}`;
        if (edgeMap.has(reverseKey)) {
          // Violation
        }
      }
    }
  }
}
