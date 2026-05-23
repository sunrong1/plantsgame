import { describe, it, expect } from 'vitest';
import { PLANT_CONFIGS, PLANT_CONFIG_MAP } from '../config/plants';

describe('植物配置测试', () => {
  it('应该有3种植物', () => {
    expect(PLANT_CONFIGS).toHaveLength(3);
  });

  it('每种植物应该有必填字段', () => {
    PLANT_CONFIGS.forEach(plant => {
      expect(plant.id).toBeDefined();
      expect(plant.name).toBeDefined();
      expect(plant.cost).toBeGreaterThan(0);
      expect(plant.hp).toBeGreaterThan(0);
      expect(plant.animationFrames).toBeGreaterThan(0);
    });
  });

  it('豌豆射手应该有攻击属性', () => {
    const peashooter = PLANT_CONFIG_MAP.get('peashooter');
    expect(peashooter?.damage).toBe(20);
    expect(peashooter?.attackInterval).toBe(1500);
  });

  it('向日葵应该有产阳光属性', () => {
    const sunflower = PLANT_CONFIG_MAP.get('sunflower');
    expect(sunflower?.produceInterval).toBe(5000);
    expect(sunflower?.produceAmount).toEqual({ base: 25, variance: 10 });
  });

  it('坚果墙应该没有攻击属性', () => {
    const wallnut = PLANT_CONFIG_MAP.get('wallnut');
    expect(wallnut?.damage).toBeUndefined();
    expect(wallnut?.produceInterval).toBeUndefined();
  });

  it('植物成本应该合理', () => {
    const peashooter = PLANT_CONFIG_MAP.get('peashooter');
    const sunflower = PLANT_CONFIG_MAP.get('sunflower');
    const wallnut = PLANT_CONFIG_MAP.get('wallnut');

    expect(peashooter?.cost).toBe(100);
    expect(sunflower?.cost).toBe(50);
    expect(wallnut?.cost).toBe(50);
  });

  it('植物HP应该合理', () => {
    const wallnut = PLANT_CONFIG_MAP.get('wallnut');
    const peashooter = PLANT_CONFIG_MAP.get('peashooter');

    // 坚果墙HP应该最高
    expect(wallnut?.hp).toBeGreaterThan(peashooter?.hp ?? 0);
    expect(wallnut?.hp).toBe(400);
  });
});

describe('向日葵产阳光计算', () => {
  it('基础产出应该是25', () => {
    const sunflower = PLANT_CONFIG_MAP.get('sunflower');
    expect(sunflower?.produceAmount?.base).toBe(25);
  });

  it('方差应该是10', () => {
    const sunflower = PLANT_CONFIG_MAP.get('sunflower');
    expect(sunflower?.produceAmount?.variance).toBe(10);
  });

  it('产出范围应该是15-35', () => {
    const sunflower = PLANT_CONFIG_MAP.get('sunflower');
    const { base, variance } = sunflower?.produceAmount ?? { base: 0, variance: 0 };
    const min = base - variance;
    const max = base + variance;
    expect(min).toBe(15);
    expect(max).toBe(35);
  });
});
