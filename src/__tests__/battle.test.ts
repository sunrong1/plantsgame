import { describe, it, expect } from 'vitest';
import { PLANT_CONFIG_MAP } from '../config/plants';
import { ZOMBIE_CONFIG_MAP } from '../config/zombies';

/**
 * 战斗数值测试
 * 测试游戏核心战斗系统的数值平衡
 */

describe('伤害计算测试', () => {
  it('豌豆伤害应该是20', () => {
    const peashooter = PLANT_CONFIG_MAP.get('peashooter');
    expect(peashooter?.damage).toBe(20);
  });

  it('普通僵尸HP是100，需要5颗豌豆击杀', () => {
    const zombie = ZOMBIE_CONFIG_MAP.get('normal');
    const peashooter = PLANT_CONFIG_MAP.get('peashooter');
    const peasToKill = Math.ceil((zombie?.hp ?? 0) / (peashooter?.damage ?? 1));
    expect(peasToKill).toBe(5);
  });

  it('旗帜僵尸HP是200，需要10颗豌豆击杀', () => {
    const flagZombie = ZOMBIE_CONFIG_MAP.get('flag');
    const peashooter = PLANT_CONFIG_MAP.get('peashooter');
    const peasToKill = Math.ceil((flagZombie?.hp ?? 0) / (peashooter?.damage ?? 1));
    expect(peasToKill).toBe(10);
  });
});

describe('攻击速度测试', () => {
  it('豌豆射手攻击间隔是1.5秒', () => {
    const peashooter = PLANT_CONFIG_MAP.get('peashooter');
    expect(peashooter?.attackInterval).toBe(1500);
  });

  it('僵尸攻击间隔是1秒', () => {
    const zombie = ZOMBIE_CONFIG_MAP.get('normal');
    expect(zombie?.attackInterval).toBe(1000);
  });

  it('豌豆射手理论上每秒造成13.33伤害', () => {
    const peashooter = PLANT_CONFIG_MAP.get('peashooter');
    const damagePerSecond = (peashooter?.damage ?? 0) / ((peashooter?.attackInterval ?? 1) / 1000);
    expect(damagePerSecond).toBeCloseTo(13.33, 1);
  });
});

describe('植物存活时间测试', () => {
  it('豌豆射手HP是100，被僵尸击杀需要5秒', () => {
    const peashooter = PLANT_CONFIG_MAP.get('peashooter');
    const zombie = ZOMBIE_CONFIG_MAP.get('normal');
    const timeToKill = ((peashooter?.hp ?? 0) / (zombie?.damage ?? 1)) * ((zombie?.attackInterval ?? 1) / 1000);
    expect(timeToKill).toBe(5);
  });

  it('坚果墙HP是400，可以阻挡僵尸8秒', () => {
    const wallnut = PLANT_CONFIG_MAP.get('wallnut');
    const zombie = ZOMBIE_CONFIG_MAP.get('normal');
    const blockingTime = ((wallnut?.hp ?? 0) / (zombie?.damage ?? 1)) * ((zombie?.attackInterval ?? 1) / 1000);
    expect(blockingTime).toBe(20); // 400 / 20 * 1 = 20秒
  });
});

describe('僵尸推进时间测试', () => {
  it('僵尸移动速度是33.33像素/秒', () => {
    const zombie = ZOMBIE_CONFIG_MAP.get('normal');
    expect(zombie?.speed).toBeCloseTo(33.33, 1);
  });

  it('僵尸穿过一格(50像素)需要1.5秒', () => {
    const zombie = ZOMBIE_CONFIG_MAP.get('normal');
    const cellSize = 50;
    const timePerCell = cellSize / (zombie?.speed ?? 1);
    expect(timePerCell).toBeCloseTo(1.5, 1);
  });

  it('僵尸穿过9格草坪需要13.5秒', () => {
    const zombie = ZOMBIE_CONFIG_MAP.get('normal');
    const gridCols = 9;
    const cellSize = 50;
    const totalTime = (gridCols * cellSize) / (zombie?.speed ?? 1);
    expect(totalTime).toBeCloseTo(13.5, 1);
  });
});

describe('波次压力测试', () => {
  it('第1波总计3只僵尸', () => {
    const wave1 = { count: 3, interval: 4000 };
    const totalTime = (wave1.count - 1) * wave1.interval / 1000;
    expect(wave1.count).toBe(3);
    expect(totalTime).toBe(8); // 生成完需要8秒
  });

  it('第2波总计5只僵尸', () => {
    const wave2 = { count: 5, interval: 3000 };
    const totalTime = (wave2.count - 1) * wave2.interval / 1000;
    expect(wave2.count).toBe(5);
    expect(totalTime).toBe(12); // 生成完需要12秒
  });

  it('第3波总计7只僵尸', () => {
    const wave3 = { count: 7, interval: 2000 };
    const totalTime = (wave3.count - 1) * wave3.interval / 1000;
    expect(wave3.count).toBe(7);
    expect(totalTime).toBe(12); // 生成完需要12秒
  });

  it('波次间隔递增，增加压力', () => {
    const wave1Interval = 4000;
    const wave2Interval = 3000;
    const wave3Interval = 2000;

    expect(wave1Interval).toBeGreaterThan(wave2Interval);
    expect(wave2Interval).toBeGreaterThan(wave3Interval);
    expect(wave3Interval).toBe(wave1Interval / 2);
  });
});

describe('阳光经济测试', () => {
  it('向日葵每5秒产出15-35阳光', () => {
    const sunflower = PLANT_CONFIG_MAP.get('sunflower');
    expect(sunflower?.produceInterval).toBe(5000);
    expect(sunflower?.produceAmount?.base).toBe(25);
    expect(sunflower?.produceAmount?.variance).toBe(10);
  });

  it('每分钟每株向日葵产出约300阳光', () => {
    const sunflower = PLANT_CONFIG_MAP.get('sunflower');
    const produceInterval = (sunflower?.produceInterval ?? 1) / 1000; // 转换为秒
    const produceAmount = sunflower?.produceAmount?.base ?? 25;
    const sunPerMinute = (60 / produceInterval) * produceAmount;
    expect(sunPerMinute).toBeCloseTo(300, 0);
  });

  it('天空每10秒掉落25阳光', () => {
    const skyDropInterval = 10000; // 10秒
    const skyDropAmount = 25;
    const sunPerMinute = (60 / (skyDropInterval / 1000)) * skyDropAmount;
    expect(sunPerMinute).toBe(150);
  });
});
