import { describe, it, expect } from 'vitest';
import { PLANT_CONFIGS, PLANT_CONFIG_MAP } from './plants';

describe('植物配置', () => {
  it('4种植物: 豌豆射手(80阳光), 向日葵(50阳光), 坚果(50阳光), 樱桃炸弹(150阳光)', () => {
    expect(PLANT_CONFIGS).toHaveLength(4);
    expect(PLANT_CONFIG_MAP.get('peashooter')?.cost).toBe(80);
    expect(PLANT_CONFIG_MAP.get('sunflower')?.cost).toBe(50);
    expect(PLANT_CONFIG_MAP.get('wallnut')?.cost).toBe(50);
    expect(PLANT_CONFIG_MAP.get('cherrybomb')?.cost).toBe(150);
  });

  it('豌豆射手: 伤害30, 攻击间隔1.5秒', () => {
    const p = PLANT_CONFIG_MAP.get('peashooter');
    expect(p?.damage).toBe(30);
    expect(p?.attackInterval).toBe(1500);
  });

  it('向日葵: 每4秒产出30±10阳光', () => {
    const s = PLANT_CONFIG_MAP.get('sunflower');
    expect(s?.produceInterval).toBe(4000);
    expect(s?.produceAmount).toEqual({ base: 30, variance: 10 });
  });

  it('坚果墙: HP400, 无攻击', () => {
    const w = PLANT_CONFIG_MAP.get('wallnut');
    expect(w?.hp).toBe(400);
    expect(w?.damage).toBeUndefined();
  });
});