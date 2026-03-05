import { describe, expect, it } from 'vitest';
import { toKey, manhattan } from '@utils/grid';
import { clamp, distance } from '@utils/math';

describe('Grid Utilities', () => {
  describe('toKey', () => {
    it('creates unique keys for coordinates', () => {
      expect(toKey(0, 0)).toBe('0,0');
      expect(toKey(5, 10)).toBe('5,10');
      expect(toKey(-1, 3)).toBe('-1,3');
    });

    it('creates different keys for different positions', () => {
      const key1 = toKey(1, 2);
      const key2 = toKey(2, 1);
      const key3 = toKey(1, 2);

      expect(key1).not.toBe(key2);
      expect(key1).toBe(key3);
    });

    it('handles large coordinates', () => {
      const key = toKey(1000, 2000);
      expect(key).toBe('1000,2000');
    });

    it('handles zero coordinates', () => {
      const key = toKey(0, 0);
      expect(key).toBe('0,0');
    });

    it('produces parseable strings', () => {
      const key = toKey(42, 99);
      const parts = key.split(',');
      expect(parts).toHaveLength(2);
      expect(parseInt(parts[0], 10)).toBe(42);
      expect(parseInt(parts[1], 10)).toBe(99);
    });
  });

  describe('manhattan', () => {
    it('calculates Manhattan distance correctly', () => {
      expect(manhattan(0, 0, 0, 0)).toBe(0);
      expect(manhattan(0, 0, 5, 0)).toBe(5);
      expect(manhattan(0, 0, 0, 5)).toBe(5);
      expect(manhattan(0, 0, 5, 5)).toBe(10);
      expect(manhattan(1, 2, 4, 6)).toBe(7);
    });

    it('handles negative coordinates', () => {
      expect(manhattan(-5, -5, 5, 5)).toBe(20);
      expect(manhattan(-10, 0, 10, 0)).toBe(20);
    });

    it('is always non-negative', () => {
      expect(manhattan(10, 10, 0, 0)).toBeGreaterThanOrEqual(0);
      expect(manhattan(-10, -10, 10, 10)).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('Math Utilities', () => {
  describe('clamp', () => {
    it('returns value when within range', () => {
      expect(clamp(5, 0, 10)).toBe(5);
      expect(clamp(0, 0, 10)).toBe(0);
      expect(clamp(10, 0, 10)).toBe(10);
    });

    it('clamps values below minimum', () => {
      expect(clamp(-5, 0, 10)).toBe(0);
      expect(clamp(-100, 0, 10)).toBe(0);
    });

    it('clamps values above maximum', () => {
      expect(clamp(15, 0, 10)).toBe(10);
      expect(clamp(100, 0, 10)).toBe(10);
    });

    it('handles negative ranges', () => {
      expect(clamp(-5, -10, 0)).toBe(-5);
      expect(clamp(-15, -10, 0)).toBe(-10);
      expect(clamp(5, -10, 0)).toBe(0);
    });

    it('handles fractional values', () => {
      expect(clamp(2.5, 0, 5)).toBe(2.5);
      expect(clamp(-0.5, 0, 1)).toBe(0);
      expect(clamp(1.5, 0, 1)).toBe(1);
    });

    it('works with equal min and max', () => {
      expect(clamp(0, 5, 5)).toBe(5);
      expect(clamp(10, 5, 5)).toBe(5);
      expect(clamp(-10, 5, 5)).toBe(5);
    });
  });

  describe('distance', () => {
    it('calculates Euclidean distance correctly', () => {
      expect(distance(0, 0, 0, 0)).toBe(0);
      expect(distance(0, 0, 3, 0)).toBe(3);
      expect(distance(0, 0, 0, 4)).toBe(4);
      expect(distance(0, 0, 3, 4)).toBe(5); // 3-4-5 triangle
    });

    it('handles negative coordinates', () => {
      expect(distance(-3, -4, 0, 0)).toBe(5);
      expect(distance(-5, 0, 5, 0)).toBe(10);
    });

    it('is always non-negative', () => {
      expect(distance(10, 10, 0, 0)).toBeGreaterThanOrEqual(0);
      expect(distance(-10, -10, 10, 10)).toBeGreaterThanOrEqual(0);
    });

    it('returns same distance regardless of order', () => {
      const d1 = distance(0, 0, 3, 4);
      const d2 = distance(3, 4, 0, 0);
      expect(d1).toBe(d2);
    });
  });
});
