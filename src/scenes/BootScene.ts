import Phaser from 'phaser';
import { UIScene } from './UIScene';
import { PlayScene } from './PlayScene';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // 加载 AI 生成的图片素材
    this.load.image('peashooter', 'assets/peashooter_001.jpg');
    this.load.image('sunflower', 'assets/sunflower_001.jpg');
    this.load.image('wallnut', 'assets/wallnut_001.jpg');
    this.load.image('cherrybomb', 'assets/cherrybomb_001.jpg');
    this.load.image('zombie_normal', 'assets/zombie_normal_001.jpg');
    this.load.image('zombie_flag', 'assets/zombie_flag_001.jpg');
    this.load.image('pea', 'assets/pea_001.jpg');
    this.load.image('sunlight', 'assets/sunlight_001.jpg');
    this.load.image('lawn', 'assets/lawn_001.jpg');

    // 创建程序化纹理（箭头）作为补充
    this.createTextures();
  }

  create(): void {
    this.scene.add('PlayScene', PlayScene, true);
    this.scene.add('UIScene', UIScene, true);

    this.scene.start('PlayScene');
  }

  private createTextures(): void {
    const textures = this.textures;

    // 入侵箭头 - 程序化绘制（无素材）
    this.createInvasionArrow(textures);
  }

  private createInvasionArrow(textures: Phaser.Textures.TextureManager): void {
    const canvas = textures.createCanvas('invasion_arrow', 20, 250);
    if (!canvas) return;
    const ctx = canvas.context;

    ctx.fillStyle = '#2F4F4F';

    // 5个三角形箭头，覆盖250px高度
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
}