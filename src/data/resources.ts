export type ResourceType = 'wood' | 'food';

export type ResourceStock = Record<ResourceType, number>;

export const RESOURCE_DEFAULTS: ResourceStock = {
  wood: 0,
  food: 0
};
