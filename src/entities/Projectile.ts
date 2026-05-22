import Phaser from 'phaser';
import type { ProjectileEntity } from '../types';

const PROJECTILE_SPEED = 300;

export class Projectile {
  private static projectiles: ProjectileEntity[] = [];

  static create(
    scene: Phaser.Scene,
    x: number,
    y: number,
    damage: number,
    existingId?: string
  ): ProjectileEntity {
    const id = existingId || `projectile_${Date.now()}_${Math.random()}`;

    const graphics = scene.add.graphics();
    graphics.fillStyle(0x32CD32, 1);
    graphics.fillCircle(8, 8, 8);
    graphics.lineStyle(2, 0x228B22, 1);
    graphics.strokeCircle(8, 8, 6);

    const container = scene.add.container(x, y, [graphics]);
    container.setSize(16, 16);

    const sprite = container as unknown as Phaser.GameObjects.Image;

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
    (projectile.sprite as unknown as Phaser.GameObjects.Container).x += dx;
    projectile.x += dx;
  }

  static getX(projectile: ProjectileEntity): number {
    return projectile.x;
  }

  static getY(projectile: ProjectileEntity): number {
    return projectile.y;
  }

  static getProjectiles(): ProjectileEntity[] {
    return this.projectiles;
  }

  static remove(projectile: ProjectileEntity): void {
    const index = this.projectiles.findIndex(p => p.id === projectile.id);
    if (index !== -1) {
      this.projectiles.splice(index, 1);
    }
    (projectile.sprite as unknown as Phaser.GameObjects.Container).destroy();
  }

  static isOffScreen(projectile: ProjectileEntity, maxX: number): boolean {
    return projectile.x > maxX;
  }

  static checkCollision(
    projectile: ProjectileEntity,
    zombies: { id: string; x: number; y: number; row: number }[]
  ): string | null {
    const px = this.getX(projectile);
    const py = this.getY(projectile);

    for (const zombie of zombies) {
      const dx = px - zombie.x;
      const dy = py - zombie.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < 30) {
        return zombie.id;
      }
    }

    return null;
  }
}