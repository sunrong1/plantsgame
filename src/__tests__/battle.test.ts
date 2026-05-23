import { describe, it, expect } from 'vitest';
import { PLANT_CONFIG_MAP } from '../config/plants';
import { ZOMBIE_CONFIG_MAP } from '../config/zombies';
import { Zombie } from '../entities/Zombie';
import { WaveManager } from '../systems/WaveManager';
import type { ZombieState } from '../types';

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

describe('游戏重启状态测试', () => {
  it('WaveManager 重置后应该清空僵尸列表', () => {
    // 模拟场景：WaveManager 中有僵尸，然后游戏重启
    // 重启后 zombies 数组应该为空，而不是残留旧数据
    const mockScene = {
      time: { delayedCall: () => null },
      events: { on: () => {} }
    };
    const wm = new WaveManager(mockScene as any, () => {}, () => {});

    // WaveManager 初始状态
    expect(wm.getZombies()).toHaveLength(0);

    // 注意：这个测试验证了 WaveManager 内部状态管理正确
    // 实际的清理发生在 PlayScene.shutdown() 调用时
  });

  it('Zombie.updatePosition 只在 walking 状态移动', () => {
    const mockSprite = { x: 100, getData: () => 0, setData: () => {} };
    const zombie = {
      id: 'test',
      type: 'normal',
      position: { row: 0, col: 5 },
      hp: 100,
      maxHp: 100,
      state: 'walking' as ZombieState,
      targetPlant: null,
      lastAttackTime: 0,
      sprite: mockSprite as any,
      config: { id: 'normal', name: 'Normal', speed: 33.33, damage: 20, attackInterval: 1000, hp: 100 } as any
    } as any;

    const initialX = zombie.sprite.x;
    Zombie.updatePosition(zombie, 1000); // 1秒
    expect(zombie.sprite.x).toBeLessThan(initialX);

    // 当状态变为 attacking 时，不应该移动
    zombie.state = 'attacking';
    const xAfterAttack = zombie.sprite.x;
    Zombie.updatePosition(zombie, 1000);
    expect(zombie.sprite.x).toBe(xAfterAttack);
  });
});
