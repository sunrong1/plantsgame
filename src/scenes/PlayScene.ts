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
    // Create grid manager first (createBackground uses it)
    this.gridManager = new GridManager(this);

    // Create layered background
    this.createBackground();

    this.economyManager = new EconomyManager(this, this.gridManager.getOffsetX(), this.gridManager.getOffsetY(), this.gridManager.getCellSize());

    this.waveManager = new WaveManager(
      this,
      (zombie) => this.onZombieSpawn(zombie),
      (wave) => this.onWaveComplete(wave),
      (wave) => this.onWaveStart(wave),
      this.gridManager.getCellSize(),
      this.gridManager.getOffsetX(),
      this.gridManager.getOffsetY()
    );

    // 创建入侵方向箭头
    this.createInvasionArrow();

    // 监听场景关闭事件，用于清理
    this.events.on('shutdown', this.shutdown, this);

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
    // 鼠标移动时更新预览位置
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.selectedPlant && pointer.y >= 60) {
        this.updatePreview(pointer.x, pointer.y);
      }
    });

    // 点击时尝试放置或取消
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      // 右键取消
      if (pointer.rightButtonDown()) {
        this.cancelSelection();
        return;
      }

      // 游戏区域放置
      if (pointer.y >= 60 && this.selectedPlant) {
        this.tryPlant(pointer.x, pointer.y);
      }
    });

    this.input.keyboard?.on('keydown-ESC', () => {
      this.cancelSelection();
    });

    // 监听来自 UIScene 的植物选择事件
    this.events.on('plantSelected', (plantType: string) => {
      this.selectPlant(plantType);
    });
  }

  private handleUIClick(x: number, y: number): void {
    // 已移除 - 现在由 UIScene 直接调用 selectPlant
  }

  private createBackground(): void {
    const cellSize = this.gridManager.getCellSize();
    const offsetX = this.gridManager.getOffsetX();
    const offsetY = this.gridManager.getOffsetY();
    const cols = 9;
    const rows = 5;

    // Sky area - soft blue above the grid
    const sky = this.add.graphics();
    sky.fillStyle(0x87CEEB, 1);
    sky.fillRect(0, 75, window.innerWidth, 75);

    // Lawn texture - centered on grid area
    const gridCenterX = offsetX + (cols * cellSize) / 2;
    const gridCenterY = offsetY + (rows * cellSize) / 2;
    this.add.image(gridCenterX, gridCenterY, 'lawn')
      .setScale(2.8)
      .setDepth(-1);

    // Decorative grass strip at bottom
    const bottomGrass = this.add.graphics();
    bottomGrass.fillStyle(0x3D6B33, 1);
    bottomGrass.fillRect(0, offsetY + rows * cellSize + 20, window.innerWidth, 30);
  }

  public selectPlant(plantType: string): void {
    this.selectedPlant = plantType;

    if (this.previewSprite) {
      this.previewSprite.destroy();
    }

    const config = PLANT_CONFIG_MAP.get(plantType)!;
    this.previewSprite = this.add.image(0, 0, plantType);
    this.previewSprite.setAlpha(0.5);
    this.previewSprite.setTint(0x00FF00);
    this.previewSprite.setVisible(false);

    // Pass preview to GridManager for hover control
    this.gridManager.setPreviewSprite(this.previewSprite);
  }

  private updatePreview(x: number, y: number): void {
    // Preview is now controlled by GridManager based on hover
    // This method kept for compatibility but does nothing
    // since GridManager handles the preview directly
  }

  private tryPlant(x: number, y: number): void {
    if (!this.selectedPlant) return;

    const cell = this.gridManager.getCellFromPixel(x, y);
    if (!cell) return;

    // 检查是否有阳光
    const config = PLANT_CONFIG_MAP.get(this.selectedPlant)!;
    if (!this.economyManager.spendSunlight(config.cost)) {
      this.showInvalidFeedback(x, y);
      return;
    }

    // 检查格子是否可用
    if (!this.gridManager.isCellEmpty(cell.row, cell.col)) {
      this.showInvalidFeedback(x, y);
      return;
    }

    // 放置植物
    if (this.selectedPlant === 'cherrybomb') {
      // 樱桃炸弹：立即消灭整排僵尸，不创建植物
      this.explodeRow(cell.row);
      this.cancelSelection();
      return;
    }

    const plant = Plant.create(this as unknown as Phaser.Scene, this.selectedPlant, cell, this.gridManager.getCellSize(), this.gridManager.getOffsetX(), this.gridManager.getOffsetY());
    this.plants.set(plant.id, plant);
    this.gridManager.occupyCell(cell.row, cell.col, plant.id);
    this.gridManager.addPlant(plant.sprite, plant.id);

    this.cancelSelection();
  }

  private explodeRow(row: number): void {
    // 获取该行所有僵尸并消灭
    const zombiesToRemove: ZombieEntity[] = [];
    for (const zombie of this.zombies.values()) {
      if (Zombie.getRow(zombie) === row && zombie.state !== 'dead') {
        Zombie.takeDamage(zombie, zombie.hp); // 立即杀死
        zombiesToRemove.push(zombie);
      }
    }

    // 屏幕震动效果
    this.cameras.main.shake(300, 0.008);

    // 显示爆炸效果
    const pos = this.gridManager.getGridPosition(row, 4); // 取中间列
    const explosion = this.add.graphics();
    explosion.fillStyle(0xFF4500, 0.8);
    explosion.fillCircle(pos.x, pos.y, 160);
    explosion.setDepth(10);

    this.tweens.add({
      targets: explosion,
      alpha: 0,
      scaleX: 2,
      scaleY: 2,
      duration: 500,
      onComplete: () => explosion.destroy()
    });

    // 延迟移除僵尸（让死亡动画显示）
    this.time.delayedCall(300, () => {
      for (const zombie of zombiesToRemove) {
        if (this.zombies.has(zombie.id)) {
          this.removeZombie(zombie);
        }
      }
    });
  }

  private showInvalidFeedback(x: number, y: number): void {
    const cell = this.gridManager.getCellFromPixel(x, y);
    if (!cell) return;

    const pos = this.gridManager.getGridPosition(cell.row, cell.col);
    const cellSize = this.gridManager.getCellSize();
    const feedback = this.add.graphics();
    feedback.lineStyle(3, 0xFF0000, 0.8);
    feedback.strokeRect(pos.x - cellSize / 2, pos.y - cellSize / 2, cellSize, cellSize);

    this.tweens.add({
      targets: feedback,
      alpha: 0,
      duration: 300,
      onComplete: () => feedback.destroy()
    });
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
            const projectile = Projectile.create(this as unknown as Phaser.Scene, pos.x + this.gridManager.getCellSize(), pos.y, damage);
            this.projectiles.push(projectile);
            plant.lastActionTime = time;
          }
        }
      }
    }
  }

  private checkZombiesInRow(row: number, shooterCol: number): boolean {
    const cellSize = this.gridManager.getCellSize();
    const offsetX = this.gridManager.getOffsetX();
    for (const zombie of this.zombies.values()) {
      if (Zombie.getRow(zombie) !== row) continue;
      if (zombie.state === 'dead' || zombie.state === 'dying') continue;

      // 检查僵尸是否在射手右侧（可以被射手打到）
      const zombieX = Zombie.getCurrentX(zombie);
      const shooterX = offsetX + shooterCol * cellSize + cellSize / 2; // 射手中心x

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
        Zombie.updatePosition(zombie, delta, this.gridManager.getCellSize());

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

    // 缓存僵尸数据，避免每帧创建新数组
    const zombieData = Array.from(this.zombies.values()).map(z => ({
      id: z.id,
      x: Zombie.getCurrentX(z),
      y: Zombie.getCurrentY(z),
      row: Zombie.getRow(z),
    }));

    for (const projectile of this.projectiles) {
      Projectile.update(projectile, delta);

      // 计算子弹所在行
      const projectileRow = Math.floor((projectile.y - this.gridManager.getOffsetY()) / this.gridManager.getCellSize());

      const hitZombieId = Projectile.checkCollision(
        projectile,
        zombieData,
        projectileRow
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

      if (Projectile.isOffScreen(projectile, this.gridManager.getOffsetX() + GAME_CONFIG.grid.cols * this.gridManager.getCellSize() + 80)) {
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

  private createDeathParticles(x: number, y: number): void {
    for (let i = 0; i < 8; i++) {
      const particle = this.add.graphics();
      particle.fillStyle(0xCC0000, 1);
      particle.fillRect(-2, -2, 4, 4);
      particle.setPosition(x, y);

      const angle = (Math.PI * 2 * i) / 8;
      const speed = 50 + Math.random() * 50;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;

      this.tweens.add({
        targets: particle,
        x: x + vx * 0.3,
        y: y + vy * 0.3,
        alpha: 0,
        duration: 400,
        ease: 'Quad.easeOut',
        onComplete: () => particle.destroy()
      });
    }
  }

  private removeZombie(zombie: ZombieEntity): void {
    this.createDeathParticles(zombie.sprite.x, zombie.sprite.y);
    this.zombies.delete(zombie.id);
    Zombie.removeHealthBar(zombie.id);
    zombie.sprite.destroy();
    this.waveManager.removeZombie(zombie);
  }

  private removePlant(plant: PlantEntity): void {
    this.plants.delete(plant.id);
    this.gridManager.releaseCell(plant.position.row, plant.position.col);
    Plant.removeHealthBar(plant.id);
    plant.sprite.destroy();
  }

  shutdown(): void {
    // 清理所有实体
    for (const zombie of this.zombies.values()) {
      zombie.sprite.destroy();
    }
    for (const plant of this.plants.values()) {
      plant.sprite.destroy();
    }
    Projectile.clear();

    this.plants.clear();
    this.zombies.clear();
    this.projectiles = [];
  }

  private onWaveComplete(wave: number): void {
    if (wave === 3) {
      this.thirdWaveCleared = true;
    }
    // Notify UI of wave change
    const uiScene = this.scene.get('UIScene') as any;
    if (uiScene && uiScene.updateWave) {
      uiScene.updateWave(wave, GAME_CONFIG.waves.length);
    }
  }

  private onWaveStart(wave: number): void {
    // Notify UI of wave start
    const uiScene = this.scene.get('UIScene') as any;
    if (uiScene && uiScene.updateWave) {
      uiScene.updateWave(wave, GAME_CONFIG.waves.length);
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

    const textObj = this.add.text(530, 350, text, {
      fontSize: '96px',
      color: `#${color.toString(16)}`,
      fontFamily: 'Arial',
    });
    textObj.setOrigin(0.5);

    const restartBtn = this.add.text(530, 460, '点击重新开始', {
      fontSize: '48px',
      color: '#FFFFFF',
      fontFamily: 'Arial',
    });
    restartBtn.setOrigin(0.5);
    restartBtn.setInteractive();
    restartBtn.on('pointerdown', () => {
      this.scene.restart();
    });
  }

  private createInvasionArrow(): void {
    const cellSize = this.gridManager.getCellSize();
    const offsetY = this.gridManager.getOffsetY();
    const rows = 5;
    // Position arrow at left side, aligned with grid rows
    const gridCenterY = offsetY + (rows * cellSize) / 2;
    const arrow = this.add.image(24, gridCenterY, 'invasion_arrow');
    arrow.setScale(2.5); // Slightly larger to match bigger cells
    arrow.setDepth(0);
  }

  public getSunlight(): number {
    return this.economyManager.getSunlight();
  }
}