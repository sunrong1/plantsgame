import type { GameConfig, WaveConfig } from '../types';

const WAVE_CONFIG: WaveConfig[] = [
  { delay: 20000, count: 6, interval: 2500, zombieType: 'mixed' },
  { delay: 30000, count: 10, interval: 1800, zombieType: 'mixed' },
  { delay: 40000, count: 14, interval: 1200, zombieType: 'mixed' },
];

export const GAME_CONFIG: GameConfig = {
  grid: { rows: 5, cols: 9, cellSize: 50 },
  initialSunlight: 150,
  skyDropInterval: 10000,
  skyDropAmount: 25,
  sunlightLifetime: 8000,
  waves: WAVE_CONFIG,
};