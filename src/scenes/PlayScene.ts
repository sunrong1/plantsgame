import Phaser from 'phaser';
import type { PlantEntity, ZombieEntity, ProjectileEntity, GridPosition } from '../types';
import { GridManager } from '../systems/GridManager';
import { EconomyManager } from '../systems/EconomyManager';
import { WaveManager } from '../systems/WaveManager';
import { Plant } from '../entities/Plant';
import { Zombie } from '../entities/Zombie';
import { Projectile } from '../entities/Projectile';
import { GAME_CONFIG, PLANT_CONFIG_MAP } from '../config';

export class PlayScene extends Phaser.Scene {
  private gridManager!: GridManager;
  private economyManager!: EconomyManager;
  private waveManager!: WaveManager;

  private plants: Map<string, PlantEntity> = new Map();
  private zombies: Map<string, ZombieEntity> = new Map();
  private projectiles: ProjectileEntity[] = [];

  private selectedPlant: string | null = null;
  private previewSprite: Phaser.GameObjects.Image | null = null;

  private gameState: 'playing' | 'won' | 'lost' = 'playing';
  private thirdWaveCleared: boolean = false;

  constructor() {
    super({ key: 'PlayScene' });
  }

  create(): void {
    this.gridManager = new GridManager(this);
    this.economyManager = new EconomyManager(this);

    this.waveManager = new WaveManager(
      this,
      (zombie) => this.onZombieSpawn(zombie),
      (wave) => this.onWaveComplete(wave)
    );

    this.time.addEvent({
      delay: GAME_CONFIG.skyDropInterval,
      callback: () => {
        if (this.gameState === 'playing') {
          this.economyManager.spawnSkyDrop();
        }
      },
      loop: true,
    });

    this.setupInput();

    this.time.delayedCall(1000, () => {
      this.waveManager.startWaves();
    });
  }

  update(time: number, delta: number): void {
    if (this.gameState !== 'playing') return;

    this.updateZombies(time, delta);
    this.updatePlants(time);
    this.updateProjectiles(delta);
    this.checkGameOver();
  }

  private setupInput(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.y < 50) {
        this.handleUIClick(pointer.x, pointer.y);
      }
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.selectedPlant && pointer.y >= 50) {
        this.updatePreview(pointer.x, pointer.y);
      }
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.selectedPlant && pointer.y >= 50) {
        this.tryPlant(pointer.x, pointer.y);
      }
    });

    this.input.keyboard?.on('keydown-ESC', () => {
      this.cancelSelection();
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer, event: any) => {
      if (pointer.rightButtonDown()) {
        this.cancelSelection();
      }
    });
  }

  private handleUIClick(x: number, y: number): void {
    const cardStartX = 150;
    const cards = ['peashooter', 'sunflower', 'wallnut'];
    const cardWidth = 60;

    for (let i = 0; i < cards.length; i++) {
      const cardX = cardStartX + i * cardWidth;
      if (x >= cardX && x < cardX + cardWidth && y >= 10 && y <= 50) {
        const config = PLANT_CONFIG_MAP.get(cards[i])!;
        if (this.economyManager.getSunlight() >= config.cost) {
          this.selectPlant(cards[i]);
        }
        break;
      }
    }
  }

  private selectPlant(plantType: string): void {
    this.selectedPlant = plantType;

    if (this.previewSprite) {
      this.previewSprite.destroy();
    }

    const config = PLANT_CONFIG_MAP.get(plantType)!;
    this.previewSprite = this.add.image(0, 0, plantType);
    this.previewSprite.setAlpha(0.5);
    this.previewSprite.setTint(0x00FF00);
  }

  private updatePreview(x: number, y: number): void {
    if (!this.previewSprite || !this.selectedPlant) return;

    const cell = this.gridManager.getCellFromPixel(x, y);
    if (cell && this.gridManager.isCellEmpty(cell.row, cell.col)) {
      const pos = this.gridManager.getGridPosition(cell.row, cell.col);
      this.previewSprite.setPosition(pos.x, pos.y);
      this.previewSprite.setVisible(true);
    } else {
      this.previewSprite.setVisible(false);
    }
  }

  private tryPlant(x: number, y: number): void {
    if (!this.selectedPlant) return;

    const cell = this.gridManager.getCellFromPixel(x, y);
    if (!cell || !this.gridManager.isCellEmpty(cell.row, cell.col)) {
      return;
    }

    const config = PLANT_CONFIG_MAP.get(this.selectedPlant)!;
    if (!this.economyManager.spendSunlight(config.cost)) {
      return;
    }

    const plant = Plant.create(this as unknown as Phaser.Scene, this.selectedPlant, cell);
    this.plants.set(plant.id, plant);
    this.gridManager.occupyCell(cell.row, cell.col, plant.id);
    this.gridManager.addPlant(plant.sprite, plant.id);

    this.cancelSelection();
  }

  private cancelSelection(): void {
    this.selectedPlant = null;
    if (this.previewSprite) {
      this.previewSprite.destroy();
      this.previewSprite = null;
    }
  }

  private updatePlants(time: number): void {
    for (const plant of this.plants.values()) {
      if (Plant.isDead(plant)) continue;

      if (plant.type === 'sunflower') {
        const interval = Plant.getProduceInterval(plant);
        if (interval && time - plant.lastActionTime >= interval) {
          const amount = Plant.getProduceAmount(plant);
          if (amount) {
            const pos = this.gridManager.getGridPosition(plant.position.row, plant.position.col);
            this.economyManager.spawnPlantDrop(pos.x, pos.y, amount);
          }
          plant.lastActionTime = time;
        }
      }

      if (plant.type === 'peashooter') {
        const interval = Plant.getAttackInterval(plant);
        const damage = Plant.getDamage(plant);

        if (interval && damage && time - plant.lastActionTime >= interval) {
          const hasTarget = this.checkZombiesInRow(plant.position.row, plant.position.col);

          if (hasTarget) {
            const pos = this.gridManager.getGridPosition(plant.position.row, plant.position.col);
            const projectile = Projectile.create(this as unknown as Phaser.Scene, pos.x + 25, pos.y, damage);
            this.projectiles.push(projectile);
            plant.lastActionTime = time;
          }
        }
      }
    }
  }

  private checkZombiesInRow(row: number, shooterCol: number): boolean {
    for (const zombie of this.zombies.values()) {
      if (Zombie.getRow(zombie) !== row) continue;
      if (zombie.state === 'dead' || zombie.state === 'dying') continue;

      // 检查僵尸是否在射手右侧（可以被射手打到）
      const zombieX = Zombie.getCurrentX(zombie);
      const shooterX = 25 + shooterCol * 50 + 25; // 射手中心x

      if (zombieX > shooterX) {
        return true;
      }
    }
    return false;
  }

  private updateZombies(time: number, delta: number): void {
    for (const zombie of this.zombies.values()) {
      if (zombie.state === 'dying' || zombie.state === 'dead') continue;

      const currentX = Zombie.getCurrentX(zombie);
      const row = Zombie.getRow(zombie);

      const cellCol = Math.floor((currentX - 25) / 50);
      const targetPlant = this.findPlantAt(row, cellCol - 1);

      if (targetPlant) {
        zombie.state = 'attacking';
        zombie.targetPlant = targetPlant;

        if (time - zombie.lastAttackTime >= zombie.config.attackInterval) {
          Plant.takeDamage(targetPlant, zombie.config.damage);
          zombie.lastAttackTime = time;

          if (Plant.isDead(targetPlant)) {
            this.removePlant(targetPlant);
            zombie.state = 'walking';
            zombie.targetPlant = null;
          }
        }
      } else {
        zombie.state = 'walking';
        zombie.targetPlant = null;
        Zombie.updatePosition(zombie, delta);

        const newRow = Zombie.getRow(zombie);
        zombie.sprite.setData('row', newRow);
      }
    }
  }

  private findPlantAt(row: number, col: number): PlantEntity | null {
    const cellOccupant = this.gridManager.getCellOccupant(row, col);
    if (cellOccupant) {
      return this.plants.get(cellOccupant) || null;
    }
    return null;
  }

  private updateProjectiles(delta: number): void {
    const toRemove: ProjectileEntity[] = [];

    for (const projectile of this.projectiles) {
      Projectile.update(projectile, delta);

      const hitZombieId = Projectile.checkCollision(
        projectile,
        Array.from(this.zombies.values()).map(z => ({
          id: z.id,
          x: Zombie.getCurrentX(z),
          y: Zombie.getCurrentY(z),
          row: Zombie.getRow(z),
        }))
      );

      if (hitZombieId) {
        const zombie = this.zombies.get(hitZombieId);
        if (zombie) {
          Zombie.takeDamage(zombie, projectile.damage);

          if (Zombie.isDead(zombie)) {
            this.removeZombie(zombie);
          }
        }
        toRemove.push(projectile);
        continue;
      }

      if (Projectile.isOffScreen(projectile, 25 + GAME_CONFIG.grid.cols * 50 + 50)) {
        toRemove.push(projectile);
      }
    }

    for (const projectile of toRemove) {
      Projectile.remove(projectile);
      const index = this.projectiles.indexOf(projectile);
      if (index !== -1) {
        this.projectiles.splice(index, 1);
      }
    }
  }

  private onZombieSpawn(zombie: ZombieEntity): void {
    this.zombies.set(zombie.id, zombie);
  }

  private removeZombie(zombie: ZombieEntity): void {
    this.zombies.delete(zombie.id);
    (zombie.sprite as unknown as Phaser.GameObjects.Container).destroy();
    this.waveManager.removeZombie(zombie);
  }

  private removePlant(plant: PlantEntity): void {
    this.plants.delete(plant.id);
    this.gridManager.releaseCell(plant.position.row, plant.position.col);
    plant.sprite.destroy();
  }

  private onWaveComplete(wave: number): void {
    if (wave === 3) {
      this.thirdWaveCleared = true;
    }
  }

  private checkGameOver(): void {
    if (this.thirdWaveCleared && this.zombies.size === 0) {
      this.gameState = 'won';
      this.showGameOver('victory');
      return;
    }

    for (const zombie of this.zombies.values()) {
      const x = Zombie.getCurrentX(zombie);
      if (x <= 25) {
        this.gameState = 'lost';
        this.showGameOver('defeat');
        return;
      }
    }
  }

  private showGameOver(result: 'victory' | 'defeat'): void {
    const text = result === 'victory' ? '胜利!' : '失败...';
    const color = result === 'victory' ? 0x00FF00 : 0xFF0000;

    const graphics = this.add.graphics();
    graphics.fillStyle(0x000000, 0.7);
    graphics.fillRect(0, 0, 530, 350);

    const textObj = this.add.text(265, 175, text, {
      fontSize: '48px',
      color: `#${color.toString(16)}`,
      fontFamily: 'Arial',
    });
    textObj.setOrigin(0.5);

    const restartBtn = this.add.text(265, 230, '点击重新开始', {
      fontSize: '24px',
      color: '#FFFFFF',
      fontFamily: 'Arial',
    });
    restartBtn.setOrigin(0.5);
    restartBtn.setInteractive();
    restartBtn.on('pointerdown', () => {
      this.scene.restart();
    });
  }

  public getSunlight(): number {
    return this.economyManager.getSunlight();
  }
}