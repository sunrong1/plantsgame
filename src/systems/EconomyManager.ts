import Phaser from 'phaser';
import type { Sunlight } from '../types';
import { GAME_CONFIG } from '../config';
import { GameEvents, dispatchGameEvent } from '../ui/bridge';

export class EconomyManager {
  private scene: Phaser.Scene;
  private sunlight: number;
  private sunlightSprites: Sunlight[] = [];
  private offsetX: number;
  private offsetY: number;
  private cellSize: number;

  constructor(scene: Phaser.Scene, offsetX: number = 0, offsetY: number = 150, cellSize: number = 80) {
    this.scene = scene;
    this.sunlight = GAME_CONFIG.initialSunlight;
    this.offsetX = offsetX;
    this.offsetY = offsetY;
    this.cellSize = cellSize;
  }

  updateGridParams(offsetX: number, offsetY: number, cellSize: number): void {
    this.offsetX = offsetX;
    this.offsetY = offsetY;
    this.cellSize = cellSize;
  }

  getSunlight(): number {
    return this.sunlight;
  }

  spendSunlight(amount: number): boolean {
    if (this.sunlight < amount) return false;
    this.sunlight -= amount;
    dispatchGameEvent(GameEvents.SUNLIGHT_CHANGED, { sunlight: this.sunlight });
    return true;
  }

  addSunlight(amount: number): void {
    this.sunlight += amount;
    dispatchGameEvent(GameEvents.SUNLIGHT_CHANGED, { sunlight: this.sunlight });
  }

  spawnSkyDrop(): void {
    const gridWidth = GAME_CONFIG.grid.cols * this.cellSize;
    const x = this.offsetX + 50 + Math.random() * (gridWidth - 100);
    const y = this.offsetY + 30 + Math.random() * (GAME_CONFIG.grid.rows * this.cellSize - 60);
    this.createSunlight(x, y, GAME_CONFIG.skyDropAmount);
  }

  spawnPlantDrop(x: number, y: number, amount: number): void {
    this.createSunlight(x + 20, y - 30, amount);
  }

  private createSunlight(x: number, y: number, amount: number): void {
    const id = `sun_${Date.now()}_${Math.random()}`;
    const createdAt = Date.now();

    // 绘制阳光 - 更大的触摸区域
    const graphics = this.scene.add.graphics();
    // 外圈光芒
    graphics.fillStyle(0xFFD700, 1);
    graphics.fillCircle(25, 25, 25);
    // 内圈主体
    graphics.fillStyle(0xFFFF00, 1);
    graphics.fillCircle(25, 25, 18);
    // 中心高光
    graphics.fillStyle(0xFFFFFF, 0.6);
    graphics.fillCircle(25, 25, 6);

    // 触摸区域 - 增大到60px
    const container = this.scene.add.container(x, y, [graphics]);
    container.setSize(60, 60);
    container.setInteractive({ useHandCursor: true, pixelPerfect: false });
    container.setData('isSunlight', true);

    // 添加下落动画
    container.setAlpha(0);
    container.setScale(0.5);
    this.scene.tweens.add({
      targets: container,
      alpha: 1,
      scale: 1,
      y: y + 20,
      duration: 600,
      ease: 'Back.easeOut'
    });

    // 触摸时有放大反馈 + 轻微上浮
    container.on('pointerover', () => {
      this.scene.tweens.add({
        targets: container,
        scale: 1.3,
        duration: 150,
        ease: 'Power2'
      });
    });

    container.on('pointerout', () => {
      this.scene.tweens.add({
        targets: container,
        scale: 1,
        duration: 150,
        ease: 'Power2'
      });
    });

    // 点击收集 - 带视觉反馈
    container.on('pointerdown', () => {
      // 收集动画：快速放大后消失
      this.scene.tweens.add({
        targets: container,
        scale: 1.5,
        alpha: 0,
        y: container.y - 30,
        duration: 300,
        ease: 'Power2',
        onComplete: () => {
          this.collectSunlight(id);
        }
      });
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