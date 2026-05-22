import Phaser from 'phaser';
import { UIScene } from './UIScene';
import { PlayScene } from './PlayScene';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // Create textures programmatically
    this.createPlaceholderTextures();
  }

  create(): void {
    this.scene.add('PlayScene', PlayScene, true);
    this.scene.add('UIScene', UIScene, true);

    this.scene.start('PlayScene');
  }

  private createPlaceholderTextures(): void {
    const textures = this.textures;

    // 草地格子 - 绿色
    const grassCanvas = textures.createCanvas('grass_tile', 50, 50);
    if (grassCanvas) {
      const ctx = grassCanvas.context;
      ctx.fillStyle = '#32CD32';
      ctx.fillRect(0, 0, 50, 50);
      grassCanvas.refresh();
    }

    // 豌豆射手 - 浅绿色
    const peashooterCanvas = textures.createCanvas('peashooter', 40, 40);
    if (peashooterCanvas) {
      const ctx = peashooterCanvas.context;
      ctx.fillStyle = '#90EE90';
      ctx.fillRect(0, 0, 40, 40);
      peashooterCanvas.refresh();
    }

    // 向日葵 - 金色
    const sunflowerCanvas = textures.createCanvas('sunflower', 40, 40);
    if (sunflowerCanvas) {
      const ctx = sunflowerCanvas.context;
      ctx.fillStyle = '#FFD700';
      ctx.fillRect(0, 0, 40, 40);
      sunflowerCanvas.refresh();
    }

    // 坚果墙 - 棕色
    const wallnutCanvas = textures.createCanvas('wallnut', 40, 40);
    if (wallnutCanvas) {
      const ctx = wallnutCanvas.context;
      ctx.fillStyle = '#DEB887';
      ctx.fillRect(0, 0, 40, 40);
      wallnutCanvas.refresh();
    }

    // 普通僵尸 - 暗绿色
    const zombieNormalCanvas = textures.createCanvas('zombie_normal', 40, 50);
    if (zombieNormalCanvas) {
      const ctx = zombieNormalCanvas.context;
      ctx.fillStyle = '#556B2F';
      ctx.fillRect(0, 0, 40, 50);
      zombieNormalCanvas.refresh();
    }

    // 旗帜僵尸 - 深红色
    const zombieFlagCanvas = textures.createCanvas('zombie_flag', 40, 50);
    if (zombieFlagCanvas) {
      const ctx = zombieFlagCanvas.context;
      ctx.fillStyle = '#8B0000';
      ctx.fillRect(0, 0, 40, 50);
      zombieFlagCanvas.refresh();
    }

    // 豌豆 - 亮绿色圆形
    const peaCanvas = textures.createCanvas('pea', 16, 16);
    if (peaCanvas) {
      const ctx = peaCanvas.context;
      ctx.fillStyle = '#32CD32';
      ctx.beginPath();
      ctx.arc(8, 8, 8, 0, Math.PI * 2);
      ctx.fill();
      peaCanvas.refresh();
    }

    // 阳光 - 黄色圆形
    const sunlightCanvas = textures.createCanvas('sunlight', 30, 30);
    if (sunlightCanvas) {
      const ctx = sunlightCanvas.context;
      ctx.fillStyle = '#FFFF00';
      ctx.beginPath();
      ctx.arc(15, 15, 15, 0, Math.PI * 2);
      ctx.fill();
      sunlightCanvas.refresh();
    }
  }
}