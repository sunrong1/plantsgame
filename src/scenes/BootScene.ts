import Phaser from 'phaser';
import { PlayScene } from './PlayScene';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // 加载 AI 生成的图片
    this.load.image('peashooter', 'assets/peashooter_001.jpg');
    this.load.image('sunflower', 'assets/sunflower_001.jpg');
    this.load.image('wallnut', 'assets/wallnut_001.jpg');
    this.load.image('cherrybomb', 'assets/cherrybomb_001.jpg');
    this.load.image('zombie_normal', 'assets/zombie_normal_001.jpg');
    this.load.image('zombie_flag', 'assets/zombie_flag_001.jpg');
    this.load.image('pea', 'assets/pea_001.jpg');
    this.load.image('sunlight', 'assets/sunlight_001.jpg');
    this.load.image('lawn', 'assets/lawn_001.jpg');
  }

  create(): void {
    this.createTextures();
    this.setPixelArtStyle();
    this.scene.add('PlayScene', PlayScene, true);
    this.scene.start('PlayScene');
  }

  private setPixelArtStyle(): void {
    // 设置纹理为最近邻像素过滤，避免模糊缩放
    const keys = ['peashooter', 'sunflower', 'wallnut', 'cherrybomb', 'zombie_normal', 'zombie_flag', 'pea', 'sunlight', 'lawn'];
    keys.forEach(key => {
      const texture = this.textures.get(key);
      if (texture) {
        texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
    });
  }

  private createTextures(): void {
    const textures = this.textures;

    // 草地格子
    this.createGrassTile(textures);

    // 入侵箭头
    this.createInvasionArrow(textures);
  }

  private createInvasionArrow(textures: Phaser.Textures.TextureManager): void {
    const canvas = textures.createCanvas('invasion_arrow', 20, 250);
    if (!canvas) return;
    const ctx = canvas.context;

    ctx.fillStyle = '#2F4F4F';

    for (let i = 0; i < 5; i++) {
      const y = i * 50 + 10;
      ctx.beginPath();
      ctx.moveTo(0, y + 15);
      ctx.lineTo(20, y + 25);
      ctx.lineTo(0, y + 35);
      ctx.closePath();
      ctx.fill();
    }

    canvas.refresh();
  }

  private createGrassTile(textures: Phaser.Textures.TextureManager): void {
    const canvas = textures.createCanvas('grass_tile', 50, 50);
    if (!canvas) return;
    const ctx = canvas.context;

    ctx.fillStyle = '#228B22';
    ctx.fillRect(0, 0, 50, 50);

    ctx.fillStyle = '#32CD32';
    for (let i = 0; i < 20; i++) {
      ctx.fillRect(Math.random() * 50, Math.random() * 50, 2, 3);
    }

    canvas.refresh();
  }
}