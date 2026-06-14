import type { GameConfig, WaveConfig } from '../types';

const WAVE_CONFIG: WaveConfig[] = [
  { delay: 10000, count: 4, interval: 3000, zombieType: 'normal' },
  { delay: 25000, count: 6, interval: 2500, zombieType: 'mixed' },
  { delay: 30000, count: 10, interval: 2000, zombieType: 'mixed' },
];

export const GAME_CONFIG: GameConfig = {
  grid: { rows: 5, cols: 9, cellSize: 80 },
  initialSunlight: 100,
  skyDropInterval: 7000,
  skyDropAmount: 35,
  sunlightLifetime: 8000,
  waves: WAVE_CONFIG,
};

// Fixed cellSize - game is centered with FIT mode
export function getCellSize(): number {
  return 80;
}

// Grid configuration with 9 columns and 5 rows
export const GRID_COLS = 9;
export const GRID_ROWS = 5;

// Dynamic offsetX - centers the grid within the game width
export function getOffsetX(gameWidth: number = 720): number {
  const gridWidth = GRID_COLS * getCellSize();
  return (gameWidth - gridWidth) / 2;
}

// Dynamic offsetY - centers the grid within the game height
export function getOffsetY(gameHeight: number = 1280): number {
  const gridHeight = GRID_ROWS * getCellSize();
  return (gameHeight - gridHeight) / 2;
}