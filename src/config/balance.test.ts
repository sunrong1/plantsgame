import { describe, it, expect } from 'vitest';
import { GAME_CONFIG, PLANT_CONFIGS } from './';

describe('经济可达性', () => {
  it('第1波前能种至少1棵向日葵（最便宜植物）', () => {
    const timeToFirstWave = GAME_CONFIG.waves[0].delay / 1000;
    const skyDropsBeforeFirst = Math.floor(
      timeToFirstWave / (GAME_CONFIG.skyDropInterval / 1000),
    );
    const totalSunlight =
      GAME_CONFIG.initialSunlight + skyDropsBeforeFirst * GAME_CONFIG.skyDropAmount;
    const cheapest = Math.min(...PLANT_CONFIGS.map((p) => p.cost));
    expect(totalSunlight).toBeGreaterThanOrEqual(cheapest);
  });

  it('1棵向日葵 + 2次天空 ≈ 120 阳光 ≥ 豌豆射手成本', () => {
    // 向日葵种下后不再产 30 颗 (这是反馈阳光，所以按一个完整的产额计算)
    const sunflower = PLANT_CONFIGS.find((p) => p.id === 'sunflower')!;
    const peashooter = PLANT_CONFIGS.find((p) => p.id === 'peashooter')!;
    const total =
      sunflower.cost + sunflower.produceAmount!.base + GAME_CONFIG.skyDropAmount * 2;
    expect(total).toBeGreaterThanOrEqual(peashooter.cost);
  });
});

describe('波次难度曲线', () => {
  it('每波僵尸数不递减（难度递增或持平）', () => {
    const counts = GAME_CONFIG.waves.map((w) => w.count);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
    }
  });

  it('每波僵尸总数在合理范围（6岁孩子≤12只）', () => {
    GAME_CONFIG.waves.forEach((w) => {
      expect(w.count).toBeLessThanOrEqual(12);
    });
  });

  it('每波间隔不超过 5 秒（避免长时间等待）', () => {
    GAME_CONFIG.waves.forEach((w) => {
      expect(w.interval).toBeLessThanOrEqual(5000);
    });
  });
});

describe('阳光基础参数', () => {
  it('天空掉落金额大于 0', () => {
    expect(GAME_CONFIG.skyDropAmount).toBeGreaterThan(0);
  });

  it('天空掉落间隔在 5-15 秒内（合理）', () => {
    expect(GAME_CONFIG.skyDropInterval).toBeGreaterThanOrEqual(5000);
    expect(GAME_CONFIG.skyDropInterval).toBeLessThanOrEqual(15000);
  });

  it('阳光寿命足够孩子点击（≥6秒）', () => {
    expect(GAME_CONFIG.sunlightLifetime).toBeGreaterThanOrEqual(6000);
  });
});
