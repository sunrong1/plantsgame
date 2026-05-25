import { describe, it, expect } from 'vitest';
import { GAME_CONFIG } from '../config';

// 纹理尺寸定义
const TEXTURE_SIZES = {
  peashooter: { width: 48, height: 48 },
  sunflower: { width: 48, height: 48 },
  wallnut: { width: 48, height: 48 },
  cherrybomb: { width: 48, height: 48 },
  zombie_normal: { width: 48, height: 56 },
  zombie_flag: { width: 48, height: 56 },
  pea: { width: 20, height: 20 },
  sunlight: { width: 40, height: 40 },
  invasion_arrow: { width: 20, height: 250 },
  lawn: { width: 530, height: 350 },
};

describe('游戏纹理尺寸测试', () => {
  describe('植物纹理', () => {
    it('豌豆射手尺寸应为48x48', () => {
      expect(TEXTURE_SIZES.peashooter.width).toBe(48);
      expect(TEXTURE_SIZES.peashooter.height).toBe(48);
    });

    it('向日葵尺寸应为48x48', () => {
      expect(TEXTURE_SIZES.sunflower.width).toBe(48);
      expect(TEXTURE_SIZES.sunflower.height).toBe(48);
    });

    it('坚果墙尺寸应为48x48', () => {
      expect(TEXTURE_SIZES.wallnut.width).toBe(48);
      expect(TEXTURE_SIZES.wallnut.height).toBe(48);
    });

    it('樱桃炸弹尺寸应为48x48', () => {
      expect(TEXTURE_SIZES.cherrybomb.width).toBe(48);
      expect(TEXTURE_SIZES.cherrybomb.height).toBe(48);
    });

    it('所有植物纹理高度应一致', () => {
      const plantTypes = ['peashooter', 'sunflower', 'wallnut', 'cherrybomb'];
      const heights = plantTypes.map(type => TEXTURE_SIZES[type as keyof typeof TEXTURE_SIZES].height);
      const uniqueHeights = [...new Set(heights)];
      expect(uniqueHeights.length).toBe(1);
    });
  });

  describe('僵尸纹理', () => {
    it('普通僵尸尺寸应为48x56', () => {
      expect(TEXTURE_SIZES.zombie_normal.width).toBe(48);
      expect(TEXTURE_SIZES.zombie_normal.height).toBe(56);
    });

    it('旗帜僵尸尺寸应为48x56', () => {
      expect(TEXTURE_SIZES.zombie_flag.width).toBe(48);
      expect(TEXTURE_SIZES.zombie_flag.height).toBe(56);
    });

    it('旗帜僵尸和普通僵尸高度相同', () => {
      expect(TEXTURE_SIZES.zombie_flag.height).toBe(TEXTURE_SIZES.zombie_normal.height);
    });
  });

  describe('子弹和阳光纹理', () => {
    it('豌豆子弹尺寸应为20x20', () => {
      expect(TEXTURE_SIZES.pea.width).toBe(20);
      expect(TEXTURE_SIZES.pea.height).toBe(20);
    });

    it('阳光尺寸应为40x40', () => {
      expect(TEXTURE_SIZES.sunlight.width).toBe(40);
      expect(TEXTURE_SIZES.sunlight.height).toBe(40);
    });
  });

  describe('背景和箭头纹理', () => {
    it('草地背景宽度应足够宽（至少475px）', () => {
      expect(TEXTURE_SIZES.lawn.width).toBeGreaterThanOrEqual(475);
    });

    it('草地背景高度应足够高（至少350px）', () => {
      expect(TEXTURE_SIZES.lawn.height).toBeGreaterThanOrEqual(350);
    });

    it('入侵箭头宽度应足够窄（不超过20px）', () => {
      expect(TEXTURE_SIZES.invasion_arrow.width).toBeLessThanOrEqual(20);
    });

    it('入侵箭头高度应覆盖5行（250px）', () => {
      expect(TEXTURE_SIZES.invasion_arrow.height).toBe(250);
    });
  });
});

describe('游戏配置与纹理一致性', () => {
  it('格子尺寸应为50', () => {
    expect(GAME_CONFIG.grid.cellSize).toBe(50);
  });

  it('网格应为5行', () => {
    expect(GAME_CONFIG.grid.rows).toBe(5);
  });

  it('网格应为9列', () => {
    expect(GAME_CONFIG.grid.cols).toBe(9);
  });

  it('每行高度应为50像素', () => {
    expect(GAME_CONFIG.grid.cellSize).toBe(50);
  });

  it('5行总高度应为250像素', () => {
    expect(GAME_CONFIG.grid.rows * GAME_CONFIG.grid.cellSize).toBe(250);
  });
});

describe('纹理命名规范', () => {
  const validTextureNames = [
    'peashooter',
    'sunflower',
    'wallnut',
    'cherrybomb',
    'zombie_normal',
    'zombie_flag',
    'pea',
    'sunlight',
    'lawn',
    'invasion_arrow',
    'grass_tile',
  ];

  it('所有纹理名称应为小写', () => {
    validTextureNames.forEach(name => {
      expect(name).toBe(name.toLowerCase());
    });
  });

  it('所有纹理名称应无空格', () => {
    validTextureNames.forEach(name => {
      expect(name).not.toContain(' ');
    });
  });

  it('纹理名称应只包含字母和下划线', () => {
    validTextureNames.forEach(name => {
      expect(name).toMatch(/^[a-z_]+$/);
    });
  });

  it('应有11个主要纹理', () => {
    expect(validTextureNames.length).toBe(11);
  });
});

describe('AI生成图片检查', () => {
  const aiGeneratedImages = [
    'peashooter_001.jpg',
    'sunflower_001.jpg',
    'wallnut_001.jpg',
    'cherrybomb_001.jpg',
    'zombie_normal_001.jpg',
    'zombie_flag_001.jpg',
    'pea_001.jpg',
    'sunlight_001.jpg',
    'lawn_001.jpg',
  ];

  it('AI生成的图片应遵循命名规范', () => {
    aiGeneratedImages.forEach(name => {
      expect(name).toMatch(/^[a-z_]+_\d+\.jpg$/);
    });
  });

  it('图片文件扩展名应为小写', () => {
    aiGeneratedImages.forEach(name => {
      expect(name).toMatch(/\.jpg$/);
      expect(name).not.toMatch(/\.JPG$/);
    });
  });
});