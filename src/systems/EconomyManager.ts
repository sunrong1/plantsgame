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
    const x = 100 + Math.random() * 300;
    const y = 80 + Math.random() * 200;
    this.createSunlight(x, y, GAME_CONFIG.skyDropAmount);
  }

  spawnPlantDrop(x: number, y: number, amount: number): void {
    this.createSunlight(x + 20, y - 30, amount);
  }

  private createSunlight(x: number, y: number, amount: number): void {
    const id = `sun_${Date.now()}_${Math.random()}`;
    const createdAt = Date.now();

    const graphics = this.scene.add.graphics();
    graphics.fillStyle(0xFFFF00, 1);
    graphics.fillCircle(15, 15, 15);
    graphics.lineStyle(2, 0xFFA500, 1);
    graphics.strokeCircle(15, 15, 12);

    const container = this.scene.add.container(x, y, [graphics]);
    container.setSize(30, 30);
    container.setInteractive();
    container.setData('isSunlight', true);

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