import { describe, it, expect } from 'vitest';
import { ZOMBIE_CONFIGS, ZOMBIE_CONFIG_MAP } from '../config/zombies';

describe('僵尸配置测试', () => {
  it('应该有两种僵尸', () => {
    expect(ZOMBIE_CONFIGS).toHaveLength(2);
  });

  it('每种僵尸应该有必填字段', () => {
    ZOMBIE_CONFIGS.forEach(zombie => {
      expect(zombie.id).toBeDefined();
      expect(zombie.name).toBeDefined();
      expect(zombie.hp).toBeGreaterThan(0);
      expect(zombie.speed).toBeGreaterThan(0);
      expect(zombie.damage).toBeGreaterThan(0);
      expect(zombie.attackInterval).toBeGreaterThan(0);
    });
  });

  it('普通僵尸HP应该是100', () => {
    const normal = ZOMBIE_CONFIG_MAP.get('normal');
    expect(normal?.hp).toBe(100);
  });

  it('旗帜僵尸HP应该是200', () => {
    const flag = ZOMBIE_CONFIG_MAP.get('flag');
    expect(flag?.hp).toBe(200);
    expect(flag?.isFlag).toBe(true);
  });

  it('旗帜僵尸HP应该是普通僵尸的2倍', () => {
    const normal = ZOMBIE_CONFIG_MAP.get('normal');
    const flag = ZOMBIE_CONFIG_MAP.get('flag');
    expect(flag?.hp).toBe(normal?.hp ? normal.hp * 2 : 0);
  });

  it('两种僵尸应该有相同的移动速度', () => {
    const normal = ZOMBIE_CONFIG_MAP.get('normal');
    const flag = ZOMBIE_CONFIG_MAP.get('flag');
    expect(normal?.speed).toBe(flag?.speed);
  });

  it('僵尸攻击力应该是20/秒', () => {
    const normal = ZOMBIE_CONFIG_MAP.get('normal');
    expect(normal?.damage).toBe(20);
    expect(normal?.attackInterval).toBe(1000); // 1秒 = 1000ms
  });

  it('移动速度应该是33.33像素/秒 (50像素/1.5秒)', () => {
    ZOMBIE_CONFIGS.forEach(zombie => {
      expect(zombie.speed).toBeCloseTo(33.33, 1);
    });
  });
});
