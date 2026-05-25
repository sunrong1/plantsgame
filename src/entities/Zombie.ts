import Phaser from 'phaser';
import type { ZombieEntity, ZombieConfig } from '../types';
import { GAME_CONFIG } from '../config';

export class Zombie {
  private static healthBars: Map<string, Phaser.GameObjects.Graphics> = new Map();

  static create(
    scene: Phaser.Scene,
    config: ZombieConfig,
    row: number,
    index?: number
  ): ZombieEntity {
    const id = index !== undefined
      ? `zombie_${Date.now()}_${index}`
      : `zombie_${Date.now()}_${Math.random()}`;

    const x = 25 + GAME_CONFIG.grid.cols * 50 + 30;
    const y = 80 + row * 50 + 25;

    // 使用纹理
    const textureKey = config.isFlag ? 'zombie_flag' : 'zombie_normal';
    const sprite = scene.add.image(x, y, textureKey);
    sprite.setData('zombieId', id);
    sprite.setData('row', row);

    // AI生成的图片是512x512，需要缩放到目标尺寸
    const targetWidth = 48;
    const targetHeight = 56;
    const scaleX = targetWidth / 512;
    const scaleY = targetHeight / 512;
    sprite.setScale(scaleX, scaleY);

    const entity: ZombieEntity = {
      id,
      type: config.id,
      position: { row, col: GAME_CONFIG.grid.cols },
      hp: config.hp,
      maxHp: config.hp,
      state: 'walking',
      targetPlant: null,
      lastAttackTime: 0,
      sprite,
      config,
    };

    // 创建血条
    this.createHealthBar(scene, entity);

    return entity;
  }

  private static createHealthBar(scene: Phaser.Scene, zombie: ZombieEntity): void {
    const bar = scene.add.graphics();
    const x = zombie.sprite.x - 18;
    const y = zombie.sprite.y - 32;

    bar.lineStyle(1, 0x000000, 1);
    bar.fillStyle(0x4a3728, 1);
    bar.fillRect(x, y, 36, 5);
    bar.strokeRect(x, y, 36, 5);

    this.healthBars.set(zombie.id, bar);
    this.updateHealthBar(zombie);
  }

  static updateHealthBar(zombie: ZombieEntity): void {
    const bar = this.healthBars.get(zombie.id);
    if (!bar) return;

    const x = zombie.sprite.x - 18;
    const y = zombie.sprite.y - 32;
    const hpPercent = zombie.hp / zombie.maxHp;

    bar.clear();
    bar.lineStyle(1, 0x000000, 1);
    bar.fillStyle(0x4a3728, 1);
    bar.fillRect(x, y, 36, 5);
    bar.strokeRect(x, y, 36, 5);

    let color = 0x44BB44;
    if (hpPercent <= 0.3) color = 0xFF4444;
    else if (hpPercent <= 0.6) color = 0xFFCC00;

    bar.fillStyle(color, 1);
    bar.fillRect(x + 1, y + 1, Math.max(0, 34 * hpPercent), 3);
  }

  static removeHealthBar(zombieId: string): void {
    const bar = this.healthBars.get(zombieId);
    if (bar) {
      bar.destroy();
      this.healthBars.delete(zombieId);
    }
  }

  static takeDamage(zombie: ZombieEntity, damage: number): void {
    zombie.hp -= damage;
    this.updateHealthBar(zombie);
    if (zombie.hp <= 0) {
      zombie.state = 'dying';
    }
  }

  static isDead(zombie: ZombieEntity): boolean {
    return zombie.state === 'dying' || zombie.state === 'dead';
  }

  static updatePosition(zombie: ZombieEntity, delta: number): void {
    if (zombie.state !== 'walking') return;

    const speed = zombie.config.speed;
    const dx = -speed * (delta / 1000);

    zombie.sprite.x += dx;
    zombie.position.col = Math.max(0, Math.floor((zombie.sprite.x - 25) / 50));
  }

  static getCurrentX(zombie: ZombieEntity): number {
    return zombie.sprite.x;
  }

  static getCurrentY(zombie: ZombieEntity): number {
    return zombie.sprite.y;
  }

  static getRow(zombie: ZombieEntity): number {
    return zombie.sprite.getData('row');
  }
}
