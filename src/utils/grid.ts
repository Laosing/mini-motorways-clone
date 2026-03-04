export function toKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function manhattan(ax: number, ay: number, bx: number, by: number): number {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}
