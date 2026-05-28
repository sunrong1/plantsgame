import { describe, it, expect } from 'vitest';
import { GAME_CONFIG } from './game';
import { GRID_COLS, GRID_ROWS } from './game';

describe('游戏配置', () => {
  it('网格5行9列', () => {
    expect(GAME_CONFIG.grid.rows).toBe(5);
    expect(GAME_CONFIG.grid.cols).toBe(9);
  });

  it('初始阳光150', () => {
    expect(GAME_CONFIG.initialSunlight).toBe(150);
  });

  it('阳光每10秒掉落25', () => {
    expect(GAME_CONFIG.skyDropInterval).toBe(10000);
    expect(GAME_CONFIG.skyDropAmount).toBe(25);
  });
});

describe('波次配置', () => {
  it('3波僵尸', () => {
    expect(GAME_CONFIG.waves).toHaveLength(3);
  });

  it('第1波:6只/2.5秒间隔, 第2波:10只/1.8秒间隔, 第3波:18只/1秒间隔', () => {
    expect(GAME_CONFIG.waves[0]).toEqual({ delay: 20000, count: 6, interval: 2500, zombieType: 'normal' });
    expect(GAME_CONFIG.waves[1]).toEqual({ delay: 30000, count: 10, interval: 1800, zombieType: 'mixed' });
    expect(GAME_CONFIG.waves[2]).toEqual({ delay: 30000, count: 18, interval: 1000, zombieType: 'mixed' });
  });
});