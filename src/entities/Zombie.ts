import Phaser from 'phaser';
import type { ZombieEntity, ZombieConfig } from '../types';
import { GAME_CONFIG } from '../config';

export class Zombie {
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
    const y = 60 + row * 50 + 25;

    const graphics = scene.add.graphics();
    const color = config.isFlag ? 0x8B0000 : 0x556B2F;
    graphics.fillStyle(color, 1);
    graphics.fillRect(-20, -25, 40, 50);
    graphics.lineStyle(2, 0x000000, 1);
    graphics.strokeRect(-20, -25, 40, 50);

    if (config.isFlag) {
      const flag = scene.add.graphics();
      flag.fillStyle(0xFF0000, 1);
      flag.fillTriangle(10, -20, 10, -5, 25, -12);
      graphics.lineStyle(2, 0x000000, 1);
      graphics.strokeCircle(0, -15, 5);
    }

    const container = scene.add.container(x, y, [graphics]);
    container.setData('zombieId', id);
    container.setData('row', row);

    return {
      id,
      type: config.id,
      position: { row, col: GAME_CONFIG.grid.cols },
      hp: config.hp,
      maxHp: config.hp,
      state: 'walking',
      targetPlant: null,
      lastAttackTime: 0,
      sprite: container as unknown as Phaser.GameObjects.Sprite,
      config,
    };
  }

  static takeDamage(zombie: ZombieEntity, damage: number): void {
    zombie.hp -= damage;
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

    (zombie.sprite as unknown as Phaser.GameObjects.Container).x += dx;

    const gridX = (zombie.sprite as unknown as Phaser.GameObjects.Container).x;
    zombie.position.col = Math.max(0, Math.floor((gridX - 25) / 50));
  }

  static getCurrentX(zombie: ZombieEntity): number {
    return (zombie.sprite as unknown as Phaser.GameObjects.Container).x;
  }

  static getCurrentY(zombie: ZombieEntity): number {
    return (zombie.sprite as unknown as Phaser.GameObjects.Container).y;
  }

  static getRow(zombie: ZombieEntity): number {
    return (zombie.sprite as unknown as Phaser.GameObjects.Container).getData('row');
  }
}