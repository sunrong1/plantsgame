import type { ZombieConfig } from '../types';

export const ZOMBIE_CONFIGS: ZombieConfig[] = [
  {
    id: 'normal',
    name: '普通僵尸',
    hp: 100,
    speed: 33.33, // 50像素/1.5秒
    damage: 20,
    attackInterval: 1000,
  },
  {
    id: 'flag',
    name: '旗帜僵尸',
    hp: 200,
    speed: 33.33,
    damage: 20,
    attackInterval: 1000,
    isFlag: true,
  },
];

export const ZOMBIE_CONFIG_MAP = new Map(
  ZOMBIE_CONFIGS.map(config => [config.id, config])
);