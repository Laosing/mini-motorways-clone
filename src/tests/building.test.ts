import { describe, expect, it } from 'vitest';
import * as LJS from 'littlejsengine';
import { Building } from '@entities/Building';

describe('Building', () => {
  it('creates a house with correct properties', () => {
    const house = new Building(
      LJS.vec2(5, 5),
      LJS.vec2(1, 1),
      'house-1',
      'house',
      'red',
      { x: 5, y: 6 },
      { x: 5, y: 5 }
    );

    expect(house.id).toBe('house-1');
    expect(house.role).toBe('house');
    expect(house.destination).toBe('red');
    expect(house.width).toBe(1);
    expect(house.height).toBe(1);
    expect(house.x).toBe(5);
    expect(house.y).toBe(5);
    expect(house.entrance).toEqual({ x: 5, y: 6 });
    expect(house.entryTile).toEqual({ x: 5, y: 5 });
  });

  it('creates an office with demand configuration', () => {
    const office = new Building(
      LJS.vec2(10, 10),
      LJS.vec2(2, 3),
      'office-1',
      'office',
      'blue',
      { x: 10, y: 12 },
      { x: 10, y: 11 },
      240, // needyness
      3 // numDemand
    );

    expect(office.role).toBe('office');
    expect(office.destination).toBe('blue');
    expect(office.width).toBe(2);
    expect(office.height).toBe(3);
    expect(office.needyness).toBe(240);
    expect(office.numDemand).toBe(3);
    expect(office.demandTimers.length).toBe(3);
  });

  it('initializes demand timers with random values', () => {
    const office = new Building(
      LJS.vec2(0, 0),
      LJS.vec2(1, 1),
      'office-1',
      'office',
      'yellow',
      { x: 0, y: 1 },
      { x: 0, y: 0 },
      1300,
      5
    );

    expect(office.demandTimers.length).toBe(5);
    // All timers should be initialized between 5 and 15
    for (const timer of office.demandTimers) {
      expect(timer).toBeGreaterThan(4);
      expect(timer).toBeLessThan(16);
    }
  });

  it('forceTestDemand enables demand', () => {
    const office = new Building(
      LJS.vec2(0, 0),
      LJS.vec2(1, 1),
      'office-1',
      'office',
      'red',
      { x: 0, y: 1 },
      { x: 0, y: 0 },
      225,
      3
    );

    office.forceTestDemand(true);

    expect(office.numIssues).toBe(3);
    expect(office.demand).toBe(675); // 3 * 225
    expect(office.demandTimers.every((t) => t === 0)).toBe(true);
  });

  it('forceTestDemand disables demand', () => {
    const office = new Building(
      LJS.vec2(0, 0),
      LJS.vec2(1, 1),
      'office-1',
      'office',
      'blue',
      { x: 0, y: 1 },
      { x: 0, y: 0 },
      240,
      3
    );

    office.forceTestDemand(false);

    expect(office.numIssues).toBe(0);
    expect(office.demand).toBe(0);
    expect(office.demandTimers.every((t) => t === 10)).toBe(true);
  });

  it('handles multi-tile office coordinate conversion', () => {
    const office = new Building(
      LJS.vec2(10, 10), // pos is center
      LJS.vec2(3, 2),
      'office-1',
      'office',
      'red',
      { x: 11, y: 11 },
      { x: 10, y: 10 }
    );

    // For 3x2 office centered at (10, 10):
    // x = pos.x - (width - 1) / 2 = 10 - 1 = 9
    // y = pos.y - (height - 1) / 2 = 10 - 0.5 = 9.5
    expect(office.x).toBeCloseTo(9, 1);
    expect(office.y).toBeCloseTo(9.5, 1);
  });

  it('sets assigned villager IDs correctly', () => {
    const office = new Building(
      LJS.vec2(0, 0),
      LJS.vec2(1, 1),
      'office-1',
      'office',
      'yellow',
      { x: 0, y: 1 },
      { x: 0, y: 0 }
    );

    office.assignedVillagerIds = ['villager-1', 'villager-2'];

    expect(office.assignedVillagerIds).toHaveLength(2);
    expect(office.assignedVillagerIds).toContain('villager-1');
  });

  it('correctly computes position from tile coordinates', () => {
    const house = new Building(
      LJS.vec2(5, 5), // pos is center for 1x1
      LJS.vec2(1, 1),
      'house-1',
      'house',
      'blue',
      { x: 5, y: 6 },
      { x: 5, y: 5 }
    );

    expect(house.x).toBe(5);
    expect(house.y).toBe(5);
    expect(house.pos.x).toBe(5);
    expect(house.pos.y).toBe(5);
  });

  it('supports all three destination types', () => {
    const destinations: Array<'red' | 'blue' | 'yellow'> = ['red', 'blue', 'yellow'];

    for (const dest of destinations) {
      const building = new Building(
        LJS.vec2(0, 0),
        LJS.vec2(1, 1),
        'b-1',
        'office',
        dest,
        { x: 0, y: 1 },
        { x: 0, y: 0 }
      );

      expect(building.destination).toBe(dest);
    }
  });
});
