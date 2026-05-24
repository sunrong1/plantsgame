import Phaser from 'phaser';
import type { PlantEntity, GridPosition } from '../types';
import { PLANT_CONFIG_MAP } from '../config';

export class Plant {
  private static healthBars: Map<string, Phaser.GameObjects.Graphics> = new Map();

  static create(
    scene: Phaser.Scene,
    plantType: string,
    position: GridPosition
  ): PlantEntity {
    const config = PLANT_CONFIG_MAP.get(plantType)!;
    const id = `plant_${Date.now()}_${Math.random()}`;

    const x = 50 + position.col * 50 + 25;
    const y = 120 + position.row * 50 + 25;

    // 使用纹理
    const sprite = scene.add.image(x, y, plantType);
    sprite.setData('plantId', id);

    // AI生成的图片是512x512，需要缩放到目标尺寸
    const targetSize = 48;
    const scale = targetSize / 512;
    sprite.setScale(scale);

    const entity: PlantEntity = {
      id,
      type: plantType,
      position,
      hp: config.hp,
      maxHp: config.hp,
      state: 'idle',
      lastActionTime: 0,
      sprite,
      config,
    };

    // 创建血条
    this.createHealthBar(scene, entity);

    return entity;
  }

  private static createHealthBar(scene: Phaser.Scene, plant: PlantEntity): void {
    const bar = scene.add.graphics();
    const x = plant.sprite.x - 20;
    const y = plant.sprite.y - 30;

    bar.lineStyle(1, 0x000000, 1);
    bar.fillStyle(0x4a3728, 1);
    bar.fillRect(x, y, 40, 6);
    bar.strokeRect(x, y, 40, 6);

    this.healthBars.set(plant.id, bar);
    this.updateHealthBar(plant);
  }

  static updateHealthBar(plant: PlantEntity): void {
    const bar = this.healthBars.get(plant.id);
    if (!bar) return;

    const x = plant.sprite.x - 20;
    const y = plant.sprite.y - 30;
    const hpPercent = plant.hp / plant.maxHp;

    bar.clear();
    bar.lineStyle(1, 0x000000, 1);
    bar.fillStyle(0x4a3728, 1);
    bar.fillRect(x, y, 40, 6);
    bar.strokeRect(x, y, 40, 6);

    let color = 0x44BB44;
    if (hpPercent <= 0.3) color = 0xFF4444;
    else if (hpPercent <= 0.6) color = 0xFFCC00;

    bar.fillStyle(color, 1);
    bar.fillRect(x + 1, y + 1, Math.max(0, 38 * hpPercent), 4);
  }

  static removeHealthBar(plantId: string): void {
    const bar = this.healthBars.get(plantId);
    if (bar) {
      bar.destroy();
      this.healthBars.delete(plantId);
    }
  }

  static takeDamage(plant: PlantEntity, damage: number): void {
    plant.hp -= damage;
    this.updateHealthBar(plant);
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
