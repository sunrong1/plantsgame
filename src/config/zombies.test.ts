import { describe, it, expect } from 'vitest';
import { ZOMBIE_CONFIGS, ZOMBIE_CONFIG_MAP } from './zombies';

describe('僵尸配置', () => {
  it('2种僵尸: 普通(HP100) 和 旗帜(HP200)', () => {
    expect(ZOMBIE_CONFIGS).toHaveLength(2);
    expect(ZOMBIE_CONFIG_MAP.get('normal')?.hp).toBe(100);
    expect(ZOMBIE_CONFIG_MAP.get('flag')?.hp).toBe(200);
    expect(ZOMBIE_CONFIG_MAP.get('flag')?.isFlag).toBe(true);
  });

  it('移动速度33.33像素/秒, 攻击20伤害/秒', () => {
    const normal = ZOMBIE_CONFIG_MAP.get('normal');
    expect(normal?.speed).toBeCloseTo(33.33, 1);
    expect(normal?.damage).toBe(20);
    expect(normal?.attackInterval).toBe(1000);
  });
});