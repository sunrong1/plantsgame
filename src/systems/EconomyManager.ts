import Phaser from 'phaser';
import type { Sunlight } from '../types';
import { GAME_CONFIG } from '../config';

export class EconomyManager {
  private scene: Phaser.Scene;
  private sunlight: number;
  private sunlightSprites: Sunlight[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.sunlight = GAME_CONFIG.initialSunlight;
  }

  getSunlight(): number {
    return this.sunlight;
  }

  spendSunlight(amount: number): boolean {
    if (this.sunlight < amount) return false;
    this.sunlight -= amount;
    return true;
  }

  addSunlight(amount: number): void {
    this.sunlight += amount;
  }

  spawnSkyDrop(): void {
    const x = 100 + Math.random() * 520;
    const y = 180 + Math.random() * 350;
    this.createSunlight(x, y, GAME_CONFIG.skyDropAmount);
  }

  spawnPlantDrop(x: number, y: number, amount: number): void {
    this.createSunlight(x + 20, y - 30, amount);
  }

  private createSunlight(x: number, y: number, amount: number): void {
    const id = `sun_${Date.now()}_${Math.random()}`;
    const createdAt = Date.now();

    // 绘制阳光
    const graphics = this.scene.add.graphics();
    // 外圈光芒
    graphics.fillStyle(0xFFD700, 1);
    graphics.fillCircle(20, 20, 20);
    // 内圈主体
    graphics.fillStyle(0xFFFF00, 1);
    graphics.fillCircle(20, 20, 15);
    // 中心高光
    graphics.fillStyle(0xFFFFFF, 0.5);
    graphics.fillCircle(20, 20, 5);

    // 触摸区域
    const container = this.scene.add.container(x, y, [graphics]);
    container.setSize(50, 50);
    container.setInteractive({ useHandCursor: true });
    container.setData('isSunlight', true);

    // 添加下落动画
    container.setAlpha(0);
    this.scene.tweens.add({
      targets: container,
      alpha: 1,
      y: y + 20,
      duration: 500,
      ease: 'Bounce.easeOut'
    });

    // 触摸时有放大反馈
    container.on('pointerover', () => {
      this.scene.tweens.add({
        targets: container,
        scale: 1.2,
        duration: 100
      });
    });

    container.on('pointerout', () => {
      this.scene.tweens.add({
        targets: container,
        scale: 1,
        duration: 100
      });
    });

    container.on('pointerdown', () => {
      this.collectSunlight(id);
    });

    this.sunlightSprites.push({
      id,
      x,
      y,
      value: amount,
      createdAt,
      sprite: container as unknown as Phaser.GameObjects.Image,
    });

    this.scene.time.delayedCall(GAME_CONFIG.sunlightLifetime, () => {
      this.removeSunlight(id);
    });
  }

  private collectSunlight(id: string): void {
    const index = this.sunlightSprites.findIndex(s => s.id === id);
    if (index === -1) return;

    const sun = this.sunlightSprites[index];
    this.addSunlight(sun.value);
    this.removeSunlight(id);
  }

  private removeSunlight(id: string): void {
    const index = this.sunlightSprites.findIndex(s => s.id === id);
    if (index === -1) return;

    const sun = this.sunlightSprites[index];
    sun.sprite.destroy();
    this.sunlightSprites.splice(index, 1);
  }

  getSunlightSprites(): Sunlight[] {
    return this.sunlightSprites;
  }
}