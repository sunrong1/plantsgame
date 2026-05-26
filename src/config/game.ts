import type { GameConfig, WaveConfig } from '../types';

const WAVE_CONFIG: WaveConfig[] = [
  { delay: 20000, count: 6, interval: 2500, zombieType: 'normal' },
  { delay: 30000, count: 10, interval: 1800, zombieType: 'mixed' },
  { delay: 30000, count: 18, interval: 1000, zombieType: 'mixed' },
];

export const GAME_CONFIG: GameConfig = {
  grid: { rows: 5, cols: 9, cellSize: 80 },
  initialSunlight: 150,
  skyDropInterval: 10000,
  skyDropAmount: 25,
  sunlightLifetime: 8000,
  waves: WAVE_CONFIG,
};

// 动态计算 cellSize - 横竖屏自适应
export function getCellSize(): number {
  if (typeof window !== 'undefined') {
    const isLandscape = window.innerWidth > window.innerHeight;
    if (isLandscape) {
      // 横屏: 用屏幕宽度计算，9列，保留边距
      return Math.floor((window.innerWidth - 40) / 9);
    }
  }
  return 80; // 默认竖屏
}

// 动态计算 offsetX - 横屏居中偏左
export function getOffsetX(): number {
  if (typeof window !== 'undefined') {
    const isLandscape = window.innerWidth > window.innerHeight;
    if (isLandscape) {
      const cellSize = getCellSize();
      const gridWidth = cellSize * 9;
      return Math.floor((window.innerWidth - gridWidth) / 2);
    }
  }
  return 0;
}