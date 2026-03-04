import type { Entity } from './Entity';

export type DestinationType = 'ox' | 'goat' | 'fish';
export type StructureRole = 'yurt' | 'farm';

export interface FarmAnimalState {
  id: string;
  demandTimer: number;
  hasDemand: boolean;
}

export interface Building extends Entity {
  type: 'building';
  role: StructureRole;
  destination: DestinationType;
  width: number;
  height: number;
  active: boolean;
  demand: number;
  needyness: number;
  numAnimals: number;
  numIssues: number;
  assignedVillagerIds: string[];
  animals?: FarmAnimalState[];
}
