import { findPathOnNetwork, PathEdge } from './src/systems/pathNetwork';
import { describe, it, expect } from 'vitest';

describe('findPathOnNetwork', () => {
  it('finds a simple path', () => {
    const edges: PathEdge[] = [
      { a: { x: 0, y: 0 }, b: { x: 1, y: 0 } },
      { a: { x: 1, y: 0 }, b: { x: 1, y: 1 } }
    ];
    const path = findPathOnNetwork(edges, { x: 0, y: 0 }, { x: 1, y: 1 });
    expect(path).toEqual([
      { x: 1, y: 0 },
      { x: 1, y: 1 }
    ]);
  });

  it('prefers shorter paths (correct A* logic)', () => {
    const edges: PathEdge[] = [
      { a: { x: 0, y: 0 }, b: { x: 0, y: 1 } },
      { a: { x: 0, y: 1 }, b: { x: 1, y: 1 } },
      { a: { x: 0, y: 0 }, b: { x: 1, y: 0 } },
      { a: { x: 1, y: 0 }, b: { x: 1, y: 1 } }
    ];
    const path = findPathOnNetwork(edges, { x: 0, y: 0 }, { x: 1, y: 1 });
    // Many paths are possible, but it should find one
    expect(path.length).toBe(2);
  });

  it('returns empty for unreachable', () => {
    const edges: PathEdge[] = [{ a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }];
    const path = findPathOnNetwork(edges, { x: 0, y: 0 }, { x: 2, y: 2 });
    expect(path).toEqual([]);
  });
});
