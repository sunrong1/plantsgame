import type { PlantConfig } from '../types';

export const PLANT_CONFIGS: PlantConfig[] = [
  {
    id: 'peashooter',
    name: '豌豆射手',
    cost: 100,
    hp: 100,
    damage: 20,
    attackInterval: 1500,
    animationFrames: 3,
  },
  {
    id: 'sunflower',
    name: '向日葵',
    cost: 50,
    hp: 100,
    produceInterval: 5000,
    produceAmount: { base: 25, variance: 10 },
    animationFrames: 4,
  },
  {
    id: 'wallnut',
    name: '坚果墙',
    cost: 50,
    hp: 400,
    animationFrames: 2,
  },
];

export const PLANT_CONFIG_MAP = new Map(
  PLANT_CONFIGS.map(config => [config.id, config])
);