import type { Entity } from './Entity';
import type { DestinationType } from './Building';

export type VillagerTask = 'idle' | 'toFarm' | 'atFarm' | 'toHome';

export interface Villager extends Entity {
  type: 'villager';
  speed: number;
  task: VillagerTask;
  homeYurtId: string;
  destinationType: DestinationType;
  target: { x: number; y: number } | null;
  path: Array<{ x: number; y: number }>;
  waitTimer: number;
  assignedFarmId: string | null;
  dx: number;
  dy: number;
  rotation: number;
  originalRouteLength: number;
  lastReachedPos: { x: number; y: number } | null;
}
