export interface Entity {
  id: string;
  type: 'building' | 'villager' | 'resourceNode';
  x: number;
  y: number;
}

let nextId = 1;
export function makeId(prefix: string): string {
  nextId += 1;
  return `${prefix}-${nextId}`;
}

export function primeIdCounterFromIds(ids: string[]): void {
  let maxSeen = nextId;
  for (const id of ids) {
    const match = /-(\d+)$/.exec(id);
    if (!match) continue;
    const n = Number(match[1]);
    if (Number.isFinite(n)) maxSeen = Math.max(maxSeen, n);
  }
  nextId = maxSeen;
}
