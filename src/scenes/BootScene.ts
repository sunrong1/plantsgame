import Phaser from 'phaser';
import { UIScene } from './UIScene';
import { PlayScene } from './PlayScene';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    this.createPlaceholderTextures();
  }

  create(): void {
    this.scene.add('PlayScene', PlayScene, true);
    this.scene.add('UIScene', UIScene, true);

    this.scene.start('PlayScene');
  }

  private createPlaceholderTextures(): void {
    const graphics = this.make.graphics({ x: 0, y: 0, add: false });

    graphics.clear();
    graphics.fillStyle(0x32CD32, 1);
    graphics.fillRect(0, 0, 50, 50);
    graphics.generateTexture('grass_tile', 50, 50);

    graphics.clear();
    graphics.fillStyle(0x90EE90, 1);
    graphics.fillRect(0, 0, 40, 40);
    graphics.generateTexture('peashooter', 40, 40);

    graphics.clear();
    graphics.fillStyle(0xFFD700, 1);
    graphics.fillRect(0, 0, 40, 40);
    graphics.generateTexture('sunflower', 40, 40);

    graphics.clear();
    graphics.fillStyle(0xDEB887, 1);
    graphics.fillRect(0, 0, 40, 40);
    graphics.generateTexture('wallnut', 40, 40);

    graphics.clear();
    graphics.fillStyle(0x556B2F, 1);
    graphics.fillRect(0, 0, 40, 50);
    graphics.generateTexture('zombie_normal', 40, 50);

    graphics.clear();
    graphics.fillStyle(0x8B0000, 1);
    graphics.fillRect(0, 0, 40, 50);
    graphics.generateTexture('zombie_flag', 40, 50);

    graphics.clear();
    graphics.fillStyle(0x32CD32, 1);
    graphics.fillCircle(8, 8, 8);
    graphics.generateTexture('pea', 16, 16);

    graphics.clear();
    graphics.fillStyle(0xFFFF00, 1);
    graphics.fillCircle(15, 15, 15);
    graphics.generateTexture('sunlight', 30, 30);

    graphics.destroy();
  }
}