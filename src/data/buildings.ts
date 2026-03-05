import type { ResourceStock } from './resources';

export type BuildingType = 'yurt' | 'lumberCamp' | 'office' | 'stockpile';

export interface BuildingConfig {
  cost: Partial<ResourceStock>;
  refund: Partial<ResourceStock>;
}

export const BUILDINGS: Record<BuildingType, BuildingConfig> = {
  yurt: { cost: { wood: 10 }, refund: { wood: 5 } },
  lumberCamp: { cost: { wood: 15 }, refund: { wood: 8 } },
  office: { cost: { wood: 20 }, refund: { wood: 10 } },
  stockpile: { cost: { wood: 25 }, refund: { wood: 12 } }
};
