import Phaser from 'phaser';
import type { ZombieEntity } from '../types';
import { GAME_CONFIG, ZOMBIE_CONFIGS } from '../config';
import { Zombie } from '../entities/Zombie';

export class WaveManager {
  private scene: Phaser.Scene;
  private zombies: ZombieEntity[] = [];
  private currentWave: number = 0;
  private waveActive: boolean = false;
  private totalZombiesToSpawn: number = 0;
  private zombiesSpawned: number = 0;
  private spawnTimer: Phaser.Time.TimerEvent | null = null;
  private onZombieSpawn: (zombie: ZombieEntity) => void;
  private onWaveComplete: (wave: number) => void;
  private onWaveStart: (wave: number) => void;
  private cellSize: number;
  private offsetX: number;
  private offsetY: number;

  constructor(
    scene: Phaser.Scene,
    onZombieSpawn: (zombie: ZombieEntity) => void,
    onWaveComplete: (wave: number) => void,
    onWaveStart?: (wave: number) => void,
    cellSize: number = 80,
    offsetX: number = 0,
    offsetY: number = 150
  ) {
    this.scene = scene;
    this.onZombieSpawn = onZombieSpawn;
    this.onWaveComplete = onWaveComplete;
    this.onWaveStart = onWaveStart || (() => {});
    this.cellSize = cellSize;
    this.offsetX = offsetX;
    this.offsetY = offsetY;
  }

  startWaves(): void {
    this.currentWave = 0;
    this.startNextWave();
  }

  private startNextWave(): void {
    if (this.currentWave >= GAME_CONFIG.waves.length) {
      return;
    }

    this.currentWave++;
    this.waveActive = true;
    this.onWaveStart(this.currentWave);

    const waveConfig = GAME_CONFIG.waves[this.currentWave - 1];
    this.totalZombiesToSpawn = waveConfig.count;
    this.zombiesSpawned = 0;

    this.scene.time.delayedCall(waveConfig.delay, () => {
      this.spawnNextZombie();
    });
  }

  private spawnNextZombie(): void {
    if (this.currentWave > GAME_CONFIG.waves.length) return;

    const waveConfig = GAME_CONFIG.waves[this.currentWave - 1];

    let zombieType = 'normal';
    if (waveConfig.zombieType === 'mixed') {
      // 每波每3只僵尸中有1只旗帜僵尸（第1只一定是旗帜）
      if (this.zombiesSpawned % 3 === 0) {
        zombieType = 'flag';
      } else {
        zombieType = 'normal';
      }
    }

    const row = Math.floor(Math.random() * GAME_CONFIG.grid.rows);

    const config = ZOMBIE_CONFIGS.find(z => z.id === zombieType)!;
    const zombie = Zombie.create(this.scene, config, row, this.zombies.length, this.cellSize, this.offsetX, this.offsetY);

    this.zombies.push(zombie);
    this.onZombieSpawn(zombie);
    this.zombiesSpawned++;

    if (this.zombiesSpawned < this.totalZombiesToSpawn) {
      this.spawnTimer = this.scene.time.delayedCall(waveConfig.interval, () => {
        this.spawnNextZombie();
      });
    }
  }

  removeZombie(zombie: ZombieEntity): void {
    const index = this.zombies.findIndex(z => z.id === zombie.id);
    if (index !== -1) {
      this.zombies.splice(index, 1);
    }

    this.checkWaveComplete();
  }

  private checkWaveComplete(): void {
    if (!this.waveActive) return;

    if (
      this.zombiesSpawned >= this.totalZombiesToSpawn &&
      this.zombies.length === 0
    ) {
      this.waveActive = false;
      this.onWaveComplete(this.currentWave);

      this.scene.time.delayedCall(2000, () => {
        this.startNextWave();
      });
    }
  }

  getZombies(): ZombieEntity[] {
    return this.zombies;
  }

  getCurrentWave(): number {
    return this.currentWave;
  }

  isWaveActive(): boolean {
    return this.waveActive;
  }
}