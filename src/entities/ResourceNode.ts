import type { Entity } from './Entity';

export interface ResourceNode extends Entity {
  type: 'resourceNode';
  amount: number;
}
