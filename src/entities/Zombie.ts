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

    // 使用纹理
    const textureKey = config.isFlag ? 'zombie_flag' : 'zombie_normal';
    const sprite = scene.add.image(x, y, textureKey);
    sprite.setData('zombieId', id);
    sprite.setData('row', row);

    return {
      id,
      type: config.id,
      position: { row, col: GAME_CONFIG.grid.cols },
      hp: config.hp,
      maxHp: config.hp,
      state: 'walking',
      targetPlant: null,
      lastAttackTime: 0, // 使用游戏内时间，初始化为0
      sprite,
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
