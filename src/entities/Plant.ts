import Phaser from 'phaser';
import type { PlantEntity, PlantConfig, GridPosition } from '../types';
import { PLANT_CONFIG_MAP } from '../config';

export class Plant {
  static create(
    scene: Phaser.Scene,
    plantType: string,
    position: GridPosition,
    existingId?: string
  ): PlantEntity {
    const config = PLANT_CONFIG_MAP.get(plantType)!;
    const id = existingId || `plant_${Date.now()}_${Math.random()}`;

    const x = 25 + position.col * 50 + 25;
    const y = 60 + position.row * 50 + 25;

    const graphics = scene.add.graphics();
    const color = plantType === 'peashooter' ? 0x90EE90 :
                  plantType === 'sunflower' ? 0xFFD700 : 0xDEB887;
    graphics.fillStyle(color, 1);
    graphics.fillRect(-20, -20, 40, 40);
    graphics.lineStyle(2, 0x000000, 1);
    graphics.strokeRect(-20, -20, 40, 40);

    const container = scene.add.container(x, y, [graphics]);
    container.setData('plantId', id);

    return {
      id,
      type: plantType,
      position,
      hp: config.hp,
      maxHp: config.hp,
      state: 'idle',
      lastActionTime: Date.now(),
      sprite: container as unknown as Phaser.GameObjects.Sprite,
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