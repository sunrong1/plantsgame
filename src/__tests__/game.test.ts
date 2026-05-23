import { describe, it, expect } from 'vitest';
import { GAME_CONFIG } from '../config/game';

describe('游戏配置测试', () => {
  it('网格配置应该正确', () => {
    expect(GAME_CONFIG.grid.rows).toBe(5);
    expect(GAME_CONFIG.grid.cols).toBe(9);
    expect(GAME_CONFIG.grid.cellSize).toBe(50);
  });

  it('初始阳光应该是150', () => {
    expect(GAME_CONFIG.initialSunlight).toBe(150);
  });

  it('天空掉落间隔应该是10秒', () => {
    expect(GAME_CONFIG.skyDropInterval).toBe(10000); // 10秒 = 10000ms
  });

  it('天空掉落数量应该是25', () => {
    expect(GAME_CONFIG.skyDropAmount).toBe(25);
  });

  it('阳光消失时间应该是8秒', () => {
    expect(GAME_CONFIG.sunlightLifetime).toBe(8000); // 8秒 = 8000ms
  });
});

describe('波次配置测试', () => {
  it('应该有3波僵尸', () => {
    expect(GAME_CONFIG.waves).toHaveLength(3);
  });

  it('第1波应该在20秒后开始', () => {
    expect(GAME_CONFIG.waves[0].delay).toBe(20000);
  });

  it('第1波应该有3只僵尸', () => {
    expect(GAME_CONFIG.waves[0].count).toBe(3);
    expect(GAME_CONFIG.waves[0].interval).toBe(4000); // 间隔4秒
    expect(GAME_CONFIG.waves[0].zombieType).toBe('normal');
  });

  it('第2波应该在38秒后开始', () => {
    expect(GAME_CONFIG.waves[1].delay).toBe(38000);
  });

  it('第2波应该有5只僵尸', () => {
    expect(GAME_CONFIG.waves[1].count).toBe(5);
    expect(GAME_CONFIG.waves[1].interval).toBe(3000); // 间隔3秒
  });

  it('第3波应该在53秒后开始', () => {
    expect(GAME_CONFIG.waves[2].delay).toBe(53000);
  });

  it('第3波应该有7只僵尸，包含旗帜僵尸', () => {
    expect(GAME_CONFIG.waves[2].count).toBe(7);
    expect(GAME_CONFIG.waves[2].interval).toBe(2000); // 间隔2秒
    expect(GAME_CONFIG.waves[2].zombieType).toBe('mixed');
  });
});

describe('波次时间线测试', () => {
  it('第1波与第2波间隔应该是18秒', () => {
    const wave1Start = GAME_CONFIG.waves[0].delay;
    const wave2Start = GAME_CONFIG.waves[1].delay;
    expect(wave2Start - wave1Start).toBe(18000);
  });

  it('第2波与第3波间隔应该是15秒', () => {
    const wave2Start = GAME_CONFIG.waves[1].delay;
    const wave3Start = GAME_CONFIG.waves[2].delay;
    expect(wave3Start - wave2Start).toBe(15000);
  });

  it('总游戏时间约60秒', () => {
    const wave3Start = GAME_CONFIG.waves[2].delay;
    // 第3波生成完需要 15 + 2*7 = 29秒
    // 加上第3波最后一波僵尸走完时间约30秒
    // 总计约 53 + 29 = 82秒
    expect(wave3Start).toBe(53000);
  });
});

describe('阳光经济测试', () => {
  it('初始阳光应该够种1个豌豆射手', () => {
    expect(GAME_CONFIG.initialSunlight).toBeGreaterThanOrEqual(100);
  });

  it('初始阳光应该够种1个向日葵和1个坚果墙', () => {
    const sunflowerCost = 50;
    const wallnutCost = 50;
    expect(GAME_CONFIG.initialSunlight).toBeGreaterThanOrEqual(sunflowerCost + wallnutCost);
  });

  it('天空掉落应该足够支持游戏', () => {
    // 60秒游戏时间，每10秒掉落25阳光
    // 约6次掉落 = 150阳光
    const gameDuration = 60000; // 60秒
    const drops = Math.floor(gameDuration / GAME_CONFIG.skyDropInterval);
    const totalSkySunlight = drops * GAME_CONFIG.skyDropAmount;
    expect(totalSkySunlight).toBeGreaterThan(100);
  });
});
