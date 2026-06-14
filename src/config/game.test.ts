import { describe, it, expect } from 'vitest';
import { GAME_CONFIG } from './game';
import { GRID_COLS, GRID_ROWS } from './game';

describe('游戏配置', () => {
  it('网格5行9列', () => {
    expect(GAME_CONFIG.grid.rows).toBe(5);
    expect(GAME_CONFIG.grid.cols).toBe(9);
  });

  it('初始阳光100', () => {
    expect(GAME_CONFIG.initialSunlight).toBe(100);
  });

  it('阳光每7秒掉落35', () => {
    expect(GAME_CONFIG.skyDropInterval).toBe(7000);
    expect(GAME_CONFIG.skyDropAmount).toBe(35);
  });
});

describe('波次配置', () => {
  it('3波僵尸', () => {
    expect(GAME_CONFIG.waves).toHaveLength(3);
  });

  it('第1波:4只/3秒间隔, 第2波:6只/2.5秒间隔, 第3波:10只/2秒间隔', () => {
    expect(GAME_CONFIG.waves[0]).toEqual({ delay: 10000, count: 4, interval: 3000, zombieType: 'normal' });
    expect(GAME_CONFIG.waves[1]).toEqual({ delay: 25000, count: 6, interval: 2500, zombieType: 'mixed' });
    expect(GAME_CONFIG.waves[2]).toEqual({ delay: 30000, count: 10, interval: 2000, zombieType: 'mixed' });
  });
});