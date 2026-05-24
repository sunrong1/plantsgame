import Phaser from 'phaser';
import type { ProjectileEntity } from '../types';

const PROJECTILE_SPEED = 300;

export class Projectile {
  private static projectiles: ProjectileEntity[] = [];

  static clear(): void {
    // 销毁所有子弹
    for (const p of this.projectiles) {
      p.sprite.destroy();
    }
    this.projectiles = [];
  }

  static create(
    scene: Phaser.Scene,
    x: number,
    y: number,
    damage: number
  ): ProjectileEntity {
    const id = `projectile_${Date.now()}_${Math.random()}`;

    // 使用纹理
    const sprite = scene.add.image(x, y, 'pea');

    // AI生成的图片是512x512，需要缩放到30x30
    const scale = 20 / 512;
    sprite.setScale(scale);

    const projectile: ProjectileEntity = {
      id,
      damage,
      x,
      y,
      speed: PROJECTILE_SPEED,
      sprite,
    };

    this.projectiles.push(projectile);
    return projectile;
  }

  static update(projectile: ProjectileEntity, delta: number): void {
    const dx = projectile.speed * (delta / 1000);
    projectile.sprite.x += dx;
    projectile.x += dx;
  }

  static getX(projectile: ProjectileEntity): number {
    return projectile.sprite.x;
  }

  static getY(projectile: ProjectileEntity): number {
    return projectile.sprite.y;
  }

  static getProjectiles(): ProjectileEntity[] {
    return this.projectiles;
  }

  static remove(projectile: ProjectileEntity): void {
    const index = this.projectiles.findIndex(p => p.id === projectile.id);
    if (index !== -1) {
      this.projectiles.splice(index, 1);
    }
    projectile.sprite.destroy();
  }

  static isOffScreen(projectile: ProjectileEntity, maxX: number): boolean {
    return projectile.sprite.x > maxX;
  }

  static checkCollision(
    projectile: ProjectileEntity,
    zombies: { id: string; x: number; y: number; row: number }[],
    projectileRow: number
  ): string | null {
    const px = this.getX(projectile);
    const py = this.getY(projectile);
    const hitRadiusSq = 30 * 30;

    for (const zombie of zombies) {
      // 只检查同行的僵尸
      if (zombie.row !== projectileRow) continue;

      const dx = px - zombie.x;
      const dy = py - zombie.y;
      const distSq = dx * dx + dy * dy;

      if (distSq < hitRadiusSq) {
        return zombie.id;
      }
    }

    return null;
  }
}
