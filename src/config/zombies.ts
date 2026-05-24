import type { ZombieConfig } from '../types';

export const ZOMBIE_CONFIGS: ZombieConfig[] = [
  {
    id: 'normal',
    name: '普通僵尸',
    hp: 100,
    speed: 50, // 降低速度，便于第一波建立防御
    damage: 20,
    attackInterval: 1000,
  },
  {
    id: 'flag',
    name: '旗帜僵尸',
    hp: 200,
    speed: 50,
    damage: 20,
    attackInterval: 1000,
    isFlag: true,
  },
];

export const ZOMBIE_CONFIG_MAP = new Map(
  ZOMBIE_CONFIGS.map(config => [config.id, config])
);