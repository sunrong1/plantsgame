import Phaser from 'phaser';
import type { PlantEntity, GridPosition } from '../types';
import { PLANT_CONFIG_MAP } from '../config';

export class Plant {
  static create(
    scene: Phaser.Scene,
    plantType: string,
    position: GridPosition
  ): PlantEntity {
    const config = PLANT_CONFIG_MAP.get(plantType)!;
    const id = `plant_${Date.now()}_${Math.random()}`;

    const x = 25 + position.col * 50 + 25;
    const y = 60 + position.row * 50 + 25;

    // 使用纹理
    const sprite = scene.add.image(x, y, plantType);
    sprite.setData('plantId', id);

    return {
      id,
      type: plantType,
      position,
      hp: config.hp,
      maxHp: config.hp,
      state: 'idle',
      lastActionTime: 0, // 使用游戏内时间，初始化为0
      sprite,
      config,
    };
  }

  static takeDamage(plant: PlantEntity, damage: number): void {
    plant.hp -= damage;
    if (plant.hp <= 0) {
      plant.state = 'dead';
    }
  }

  static isDead(plant: PlantEntity): boolean {
    return plant.state === 'dead';
  }

  static getProduceInterval(plant: PlantEntity): number | null {
    return plant.config.produceInterval || null;
  }

  static getProduceAmount(plant: PlantEntity): number | null {
    if (!plant.config.produceAmount) return null;
    const { base, variance } = plant.config.produceAmount;
    return base + Math.floor(Math.random() * (variance * 2 + 1)) - variance;
  }

  static getAttackInterval(plant: PlantEntity): number | null {
    return plant.config.attackInterval || null;
  }

  static getDamage(plant: PlantEntity): number | null {
    return plant.config.damage || null;
  }
}
