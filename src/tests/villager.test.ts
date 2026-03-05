import { describe, expect, it } from 'vitest';
import * as LJS from 'littlejsengine';
import { Villager } from '@entities/Villager';
import type { VillagerTask } from '@entities/Villager';

describe('Villager', () => {
  it('creates a villager with correct properties', () => {
    const villager = new Villager(
      LJS.vec2(5, 5),
      'villager-1',
      'house-1',
      'red'
    );

    expect(villager.id).toBe('villager-1');
    expect(villager.homeHouseId).toBe('house-1');
    expect(villager.destinationType).toBe('red');
    expect(villager.task).toBe('idle');
    expect(villager.x).toBe(5);
    expect(villager.y).toBe(5);
    expect(villager.speed).toBe(2);
  });

  it('starts with idle task', () => {
    const villager = new Villager(
      LJS.vec2(0, 0),
      'v-1',
      'h-1',
      'blue'
    );

    expect(villager.task).toBe('idle');
    expect(villager.path).toHaveLength(0);
    expect(villager.target).toBeNull();
  });

  it('supports all destination types', () => {
    const types: Array<'red' | 'blue' | 'yellow'> = ['red', 'blue', 'yellow'];

    for (const type of types) {
      const v = new Villager(LJS.vec2(0, 0), `v-${type}`, 'h-1', type);
      expect(v.destinationType).toBe(type);
    }
  });

  it('can have all task types', () => {
    const tasks: VillagerTask[] = ['idle', 'toOffice', 'atOffice', 'toHome'];

    for (const task of tasks) {
      const v = new Villager(LJS.vec2(0, 0), 'v-1', 'h-1', 'yellow');
      v.task = task;
      expect(v.task).toBe(task);
    }
  });

  it('stores path correctly', () => {
    const v = new Villager(LJS.vec2(0, 0), 'v-1', 'h-1', 'blue');
    const path = [
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 }
    ];

    v.path = path;

    expect(v.path).toHaveLength(3);
    expect(v.path[0]).toEqual({ x: 1, y: 0 });
  });

  it('stores assigned office ID', () => {
    const v = new Villager(LJS.vec2(0, 0), 'v-1', 'h-1', 'red');
    v.assignedOfficeId = 'office-1';

    expect(v.assignedOfficeId).toBe('office-1');
  });

  it('stores target location', () => {
    const v = new Villager(LJS.vec2(0, 0), 'v-1', 'h-1', 'yellow');
    v.target = { x: 10, y: 10 };

    expect(v.target).toEqual({ x: 10, y: 10 });
  });

  it('manages velocity via dx/dy getters/setters', () => {
    const v = new Villager(LJS.vec2(0, 0), 'v-1', 'h-1', 'blue');

    v.dx = 0.5;
    v.dy = 0.3;

    expect(v.dx).toBe(0.5);
    expect(v.dy).toBe(0.3);
  });

  it('manages rotation', () => {
    const v = new Villager(LJS.vec2(0, 0), 'v-1', 'h-1', 'red');

    v.rotation = Math.PI / 4;

    expect(v.rotation).toBeCloseTo(Math.PI / 4, 5);
  });

  it('stores last reached position', () => {
    const v = new Villager(LJS.vec2(0, 0), 'v-1', 'h-1', 'yellow');

    v.lastReachedPos = { x: 5, y: 5 };

    expect(v.lastReachedPos).toEqual({ x: 5, y: 5 });
  });

  it('has wait timer for atOffice task', () => {
    const v = new Villager(LJS.vec2(0, 0), 'v-1', 'h-1', 'blue');
    v.waitTimer = 1.5;

    expect(v.waitTimer).toBe(1.5);
  });

  it('tracks stuck timer for deadlock detection', () => {
    const v = new Villager(LJS.vec2(0, 0), 'v-1', 'h-1', 'red');
    v.stuckTimer = 0.5;

    expect(v.stuckTimer).toBe(0.5);
  });

  it('stores last position for stuck detection', () => {
    const v = new Villager(LJS.vec2(0, 0), 'v-1', 'h-1', 'yellow');
    v.lastPosForStuck = { x: 10, y: 10 };

    expect(v.lastPosForStuck).toEqual({ x: 10, y: 10 });
  });

  it('computes original route length', () => {
    const v = new Villager(LJS.vec2(0, 0), 'v-1', 'h-1', 'blue');
    v.originalRouteLength = 5;

    expect(v.originalRouteLength).toBe(5);
  });

  it('has correct render order', () => {
    const v = new Villager(LJS.vec2(0, 0), 'v-1', 'h-1', 'red');

    expect(v.renderOrder).toBe(20);
  });

  it('updates position through pos property', () => {
    const v = new Villager(LJS.vec2(5, 5), 'v-1', 'h-1', 'blue');

    expect(v.pos.x).toBe(5);
    expect(v.pos.y).toBe(5);

    v.pos.x = 10;
    v.pos.y = 10;

    expect(v.x).toBe(10);
    expect(v.y).toBe(10);
  });
});
