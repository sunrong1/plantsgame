# PVZ 像素版 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个完整的 Phaser 3 塔防游戏，包含 3 种植物、2 种僵尸、3 波僵尸进攻循环

**Architecture:** 基于 Phaser 3 的场景系统，分层架构 (配置层/实体层/系统层/场景层)。项目使用 Vite 构建，TypeScript 编写，使用纯 Canvas 渲染像素风格画面。

**Tech Stack:** Phaser 3.60+ | TypeScript | Vite | HTML5 Canvas

---

## 文件结构

```
/root/repos/plants-game/
├── index.html                    # HTML 入口
├── package.json                  # 依赖配置
├── tsconfig.json                 # TypeScript 配置
├── vite.config.ts               # Vite 构建配置
├── public/                       # 静态资源
│   └── assets/                  # 游戏素材 (暂用占位图)
├── src/
│   ├── main.ts                  # 游戏入口
│   ├── config/
│   │   ├── game.ts              # 全局游戏配置
│   │   ├── plants.ts            # 植物配置数据
│   │   └── zombies.ts           # 僵尸配置数据
│   ├── types/
│   │   └── index.ts             # TypeScript 类型定义
│   ├── entities/
│   │   ├── Plant.ts             # 植物实体类
│   │   ├── Zombie.ts            # 僵尸实体类
│   │   └── Projectile.ts        # 豌豆子弹实体
│   ├── systems/
│   │   ├── GridManager.ts       # 草坪网格管理
│   │   ├── WaveManager.ts       # 波次管理
│   │   └── EconomyManager.ts    # 阳光经济管理
│   └── scenes/
│       ├── BootScene.ts         # 加载场景
│       ├── PlayScene.ts         # 主游戏场景
│       └── UIScene.ts           # UI 叠加场景
└── docs/superpowers/
    ├── specs/                   # 设计文档
    └── plans/                   # 实施计划
```

---

## Task 1: 项目脚手架

### 创建 package.json

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "pvz-pixel",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "phaser": "^3.60.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "vite": "^5.0.0"
  }
}
```

- [ ] **Step 2: 创建 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: 创建 vite.config.ts**

```typescript
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
});
```

- [ ] **Step 4: 创建 index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PVZ 像素版</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #1a1a2e;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
    }
    #game-container {
      border: 4px solid #333;
      border-radius: 8px;
      overflow: hidden;
    }
  </style>
</head>
<body>
  <div id="game-container"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

- [ ] **Step 5: 创建 public/assets 目录并添加占位图**

创建简单的 SVG 占位图用于开发阶段。文件路径: `public/assets/` (使用纯色方块代替)

- [ ] **Step 6: 提交**

```bash
git add package.json tsconfig.json vite.config.ts index.html
git commit -m "chore: set up Vite + Phaser + TypeScript project scaffold"
```

---

## Task 2: 类型定义

### 创建 src/types/index.ts

- [ ] **Step 1: 创建完整的类型定义文件**

```typescript
// ============================================================
// 核心类型定义
// ============================================================

/** 网格坐标 */
export interface GridPosition {
  row: number;    // 0-4
  col: number;    // 0-8
}

/** 阳光资源 */
export interface Sunlight {
  id: string;
  x: number;
  y: number;
  value: number;
  createdAt: number;
  sprite: Phaser.GameObjects.Image;
}

/** 植物状态 */
export type PlantState = 'idle' | 'attacking' | 'producing' | 'dead';

/** 僵尸状态 */
export type ZombieState = 'walking' | 'attacking' | 'dying' | 'dead';

// ============================================================
// 配置数据结构
// ============================================================

export interface PlantConfig {
  id: string;
  name: string;
  cost: number;
  hp: number;
  damage?: number;          // 攻击伤害 (peashooter)
  attackInterval?: number; // 攻击间隔 ms (peashooter)
  produceInterval?: number; // 产阳光间隔 ms (sunflower)
  produceAmount?: { base: number; variance: number };
  animationFrames: number;  // 帧动画帧数
}

export interface ZombieConfig {
  id: string;
  name: string;
  hp: number;
  speed: number;            // 像素/秒 (格/1.5秒 = 33.33像素/秒)
  damage: number;
  attackInterval: number;   // ms
  isFlag?: boolean;
}

export interface WaveConfig {
  delay: number;            // 相对于游戏开始的延迟 (ms)
  count: number;            // 僵尸数量
  interval: number;         // 每只僵尸间隔 (ms)
  zombieType: 'normal' | 'flag' | 'mixed';
}

export interface GameConfig {
  grid: { rows: number; cols: number; cellSize: number };
  initialSunlight: number;
  skyDropInterval: number;
  skyDropAmount: number;
  sunlightLifetime: number;
  waves: WaveConfig[];
}

// ============================================================
// 实体接口
// ============================================================

export interface PlantEntity {
  id: string;
  type: PlantConfig['id'];
  position: GridPosition;
  hp: number;
  maxHp: number;
  state: PlantState;
  lastActionTime: number;
  sprite: Phaser.GameObjects.Sprite;
  config: PlantConfig;
}

export interface ZombieEntity {
  id: string;
  type: ZombieConfig['id'];
  position: GridPosition;
  hp: number;
  maxHp: number;
  state: ZombieState;
  targetPlant: PlantEntity | null;
  lastAttackTime: number;
  sprite: Phaser.GameObjects.Sprite;
  config: ZombieConfig;
}

export interface ProjectileEntity {
  id: string;
  damage: number;
  x: number;
  y: number;
  speed: number;
  sprite: Phaser.GameObjects.Image;
}
```

- [ ] **Step 2: 提交**

```bash
git add src/types/index.ts
git commit -m "feat: add TypeScript type definitions"
```

---

## Task 3: 游戏配置

### 创建 src/config/ 目录下的配置文件

- [ ] **Step 1: 创建 src/config/game.ts**

```typescript
import type { GameConfig, WaveConfig } from '../types';

const WAVE_CONFIG: WaveConfig[] = [
  { delay: 20000, count: 3, interval: 4000, zombieType: 'normal' },
  { delay: 38000, count: 5, interval: 3000, zombieType: 'normal' },
  { delay: 53000, count: 7, interval: 2000, zombieType: 'mixed' },
];

export const GAME_CONFIG: GameConfig = {
  grid: { rows: 5, cols: 9, cellSize: 50 },
  initialSunlight: 150,
  skyDropInterval: 10000,
  skyDropAmount: 25,
  sunlightLifetime: 8000,
  waves: WAVE_CONFIG,
};
```

- [ ] **Step 2: 创建 src/config/plants.ts**

```typescript
import type { PlantConfig } from '../types';

export const PLANT_CONFIGS: PlantConfig[] = [
  {
    id: 'peashooter',
    name: '豌豆射手',
    cost: 100,
    hp: 100,
    damage: 20,
    attackInterval: 1500,
    animationFrames: 3,
  },
  {
    id: 'sunflower',
    name: '向日葵',
    cost: 50,
    hp: 100,
    produceInterval: 5000,
    produceAmount: { base: 25, variance: 10 },
    animationFrames: 4,
  },
  {
    id: 'wallnut',
    name: '坚果墙',
    cost: 50,
    hp: 400,
    animationFrames: 2,
  },
];

export const PLANT_CONFIG_MAP = new Map(
  PLANT_CONFIGS.map(config => [config.id, config])
);
```

- [ ] **Step 3: 创建 src/config/zombies.ts**

```typescript
import type { ZombieConfig } from '../types';

export const ZOMBIE_CONFIGS: ZombieConfig[] = [
  {
    id: 'normal',
    name: '普通僵尸',
    hp: 100,
    speed: 33.33, // 50像素/1.5秒
    damage: 20,
    attackInterval: 1000,
  },
  {
    id: 'flag',
    name: '旗帜僵尸',
    hp: 200,
    speed: 33.33,
    damage: 20,
    attackInterval: 1000,
    isFlag: true,
  },
];

export const ZOMBIE_CONFIG_MAP = new Map(
  ZOMBIE_CONFIGS.map(config => [config.id, config])
);
```

- [ ] **Step 4: 创建 src/config/index.ts 导出**

```typescript
export * from './game';
export * from './plants';
export * from './zombies';
```

- [ ] **Step 5: 提交**

```bash
git add src/config/
git commit -m "feat: add game configuration (plants, zombies, waves)"
```

---

## Task 4: 草坪网格系统

### 创建 src/systems/GridManager.ts

- [ ] **Step 1: 创建 GridManager 类**

```typescript
import Phaser from 'phaser';
import type { GridPosition } from '../types';
import { GAME_CONFIG } from '../config';

export class GridManager {
  private scene: Phaser.Scene;
  private gridGraphics: Phaser.GameObjects.Graphics;
  private plantLayer: Phaser.GameObjects.Container;
  private grid: (string | null)[][]; // grid[row][col] = plantId or null

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.grid = this.createEmptyGrid();

    // 创建网格视觉
    this.gridGraphics = scene.add.graphics();
    this.drawGrid();

    // 创建植物容器
    this.plantLayer = scene.add.container(0, 0);
  }

  private createEmptyGrid(): (string | null)[][] {
    return Array(GAME_CONFIG.grid.rows)
      .fill(null)
      .map(() => Array(GAME_CONFIG.grid.cols).fill(null));
  }

  private drawGrid(): void {
    const { cellSize } = GAME_CONFIG.grid;
    const offsetX = 25;
    const offsetY = 60;

    this.gridGraphics.clear();
    this.gridGraphics.lineStyle(1, 0x228B22, 0.5);

    for (let row = 0; row < GAME_CONFIG.grid.rows; row++) {
      for (let col = 0; col < GAME_CONFIG.grid.cols; col++) {
        const x = offsetX + col * cellSize;
        const y = offsetY + row * cellSize;
        this.gridGraphics.strokeRect(x, y, cellSize, cellSize);
      }
    }
  }

  isValidPosition(row: number, col: number): boolean {
    return (
      row >= 0 &&
      row < GAME_CONFIG.grid.rows &&
      col >= 0 &&
      col < GAME_CONFIG.grid.cols
    );
  }

  isCellEmpty(row: number, col: number): boolean {
    if (!this.isValidPosition(row, col)) return false;
    return this.grid[row][col] === null;
  }

  occupyCell(row: number, col: number, plantId: string): boolean {
    if (!this.isCellEmpty(row, col)) return false;
    this.grid[row][col] = plantId;
    return true;
  }

  releaseCell(row: number, col: number): void {
    if (!this.isValidPosition(row, col)) return;
    this.grid[row][col] = null;
  }

  getCellOccupant(row: number, col: number): string | null {
    if (!this.isValidPosition(row, col)) return null;
    return this.grid[row][col];
  }

  getPlantAt(row: number, col: number): Phaser.GameObjects.Sprite | null {
    const occupant = this.getCellOccupant(row, col);
    if (!occupant) return null;

    const children = this.plantLayer.list;
    for (const child of children) {
      if (child.getData('plantId') === occupant) {
        return child as Phaser.GameObjects.Sprite;
      }
    }
    return null;
  }

  getGridPosition(row: number, col: number): { x: number; y: number } {
    const { cellSize } = GAME_CONFIG.grid;
    return {
      x: 25 + col * cellSize + cellSize / 2,
      y: 60 + row * cellSize + cellSize / 2,
    };
  }

  getCellFromPixel(x: number, y: number): GridPosition | null {
    const { cellSize } = GAME_CONFIG.grid;
    const col = Math.floor((x - 25) / cellSize);
    const row = Math.floor((y - 60) / cellSize);

    if (!this.isValidPosition(row, col)) return null;
    return { row, col };
  }

  addPlant(sprite: Phaser.GameObjects.Sprite, plantId: string): void {
    sprite.setData('plantId', plantId);
    this.plantLayer.add(sprite);
  }

  removePlant(plantId: string): void {
    const children = [...this.plantLayer.list];
    for (const child of children) {
      if (child.getData('plantId') === plantId) {
        this.plantLayer.remove(child);
        child.destroy();
        break;
      }
    }
  }

  getPlantLayer(): Phaser.GameObjects.Container {
    return this.plantLayer;
  }

  getZombieSpawnPosition(row: number): { x: number; y: number } {
    const { cellSize, cols } = GAME_CONFIG.grid;
    return {
      x: 25 + cols * cellSize + 30, // 草坪右侧 30 像素
      y: 60 + row * cellSize + cellSize / 2,
    };
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/systems/GridManager.ts
git commit -m "feat: add GridManager for lawn grid system"
```

---

## Task 5: 阳光经济系统

### 创建 src/systems/EconomyManager.ts

- [ ] **Step 1: 创建 EconomyManager 类**

```typescript
import Phaser from 'phaser';
import type { Sunlight } from '../types';
import { GAME_CONFIG } from '../config';

export class EconomyManager {
  private scene: Phaser.Scene;
  private sunlight: number;
  private sunlightSprites: Sunlight[] = [];
  private sunlightContainer: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.sunlight = GAME_CONFIG.initialSunlight;
    this.sunlightContainer = scene.add.container(0, 0);

    // 监听阳光收集
    scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.tryCollectSunlight(pointer.x, pointer.y);
    });
  }

  getSunlight(): number {
    return this.sunlight;
  }

  spendSunlight(amount: number): boolean {
    if (this.sunlight < amount) return false;
    this.sunlight -= amount;
    return true;
  }

  addSunlight(amount: number): void {
    this.sunlight += amount;
  }

  spawnSkyDrop(): void {
    const x = 100 + Math.random() * 300;
    const y = 80 + Math.random() * 200;
    this.createSunlight(x, y, GAME_CONFIG.skyDropAmount);
  }

  spawnPlantDrop(x: number, y: number, amount: number): void {
    this.createSunlight(x + 20, y - 30, amount);
  }

  private createSunlight(x: number, y: number, amount: number): void {
    const id = `sun_${Date.now()}_${Math.random()}`;
    const createdAt = Date.now();

    // 临时使用圆形代替图片
    const graphics = this.scene.add.graphics();
    graphics.fillStyle(0xFFFF00, 1);
    graphics.fillCircle(15, 15, 15);
    graphics.lineStyle(2, 0xFFA500, 1);
    graphics.strokeCircle(15, 15, 12);

    const container = this.scene.add.container(x, y, [graphics]);
    container.setSize(30, 30);
    container.setInteractive();
    container.setData('isSunlight', true);

    // 点击收集
    container.on('pointerdown', () => {
      this.collectSunlight(id);
    });

    this.sunlightSprites.push({
      id,
      x,
      y,
      value: amount,
      createdAt,
      sprite: container as unknown as Phaser.GameObjects.Image,
    });

    // 8秒后消失
    this.scene.time.delayedCall(GAME_CONFIG.sunlightLifetime, () => {
      this.removeSunlight(id);
    });
  }

  private tryCollectSunlight(x: number, y: number): void {
    const collectRadius = 40;
    for (const sun of this.sunlightSprites) {
      const dx = sun.x - x;
      const dy = sun.y - y;
      if (Math.sqrt(dx * dx + dy * dy) < collectRadius) {
        this.collectSunlight(sun.id);
        break;
      }
    }
  }

  private collectSunlight(id: string): void {
    const index = this.sunlightSprites.findIndex(s => s.id === id);
    if (index === -1) return;

    const sun = this.sunlightSprites[index];
    this.addSunlight(sun.value);
    this.removeSunlight(id);
  }

  private removeSunlight(id: string): void {
    const index = this.sunlightSprites.findIndex(s => s.id === id);
    if (index === -1) return;

    const sun = this.sunlightSprites[index];
    sun.sprite.destroy();
    this.sunlightSprites.splice(index, 1);
  }

  update(): void {
    // 更新阳光掉落计时
  }

  getSunlightSprites(): Sunlight[] {
    return this.sunlightSprites;
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/systems/EconomyManager.ts
git commit -m "feat: add EconomyManager for sunlight system"
```

---

## Task 6: 波次管理系统

### 创建 src/systems/WaveManager.ts

- [ ] **Step 1: 创建 WaveManager 类**

```typescript
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

  constructor(
    scene: Phaser.Scene,
    onZombieSpawn: (zombie: ZombieEntity) => void,
    onWaveComplete: (wave: number) => void
  ) {
    this.scene = scene;
    this.onZombieSpawn = onZombieSpawn;
    this.onWaveComplete = onWaveComplete;
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

    const waveConfig = GAME_CONFIG.waves[this.currentWave - 1];
    this.totalZombiesToSpawn = waveConfig.count;
    this.zombiesSpawned = 0;

    // 延迟后开始生成
    this.scene.time.delayedCall(waveConfig.delay, () => {
      this.spawnNextZombie();
    });
  }

  private spawnNextZombie(): void {
    if (this.currentWave > GAME_CONFIG.waves.length) return;

    const waveConfig = GAME_CONFIG.waves[this.currentWave - 1];

    // 确定僵尸类型
    let zombieType = 'normal';
    if (waveConfig.zombieType === 'flag' && this.zombiesSpawned === 0) {
      zombieType = 'flag';
    } else if (waveConfig.zombieType === 'mixed') {
      if (this.zombiesSpawned === 0) {
        zombieType = 'flag';
      } else {
        zombieType = 'normal';
      }
    }

    // 随机选择行
    const row = Math.floor(Math.random() * GAME_CONFIG.grid.rows);

    // 创建僵尸
    const config = ZOMBIE_CONFIGS.find(z => z.id === zombieType)!;
    const zombie = Zombie.create(this.scene, config, row, this.zombies.length);

    this.zombies.push(zombie);
    this.onZombieSpawn(zombie);
    this.zombiesSpawned++;

    // 检查是否需要继续生成
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

    // 检查波次是否完成
    this.checkWaveComplete();
  }

  private checkWaveComplete(): void {
    if (!this.waveActive) return;

    // 只有当所有僵尸都生成完毕且没有存活僵尸时才结束波次
    if (
      this.zombiesSpawned >= this.totalZombiesToSpawn &&
      this.zombies.length === 0
    ) {
      this.waveActive = false;
      this.onWaveComplete(this.currentWave);

      // 开始下一波
      this.scene.time.delayedCall(3000, () => {
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
```

- [ ] **Step 2: 提交**

```bash
git add src/systems/WaveManager.ts
git commit -m "feat: add WaveManager for zombie wave spawning"
```

---

## Task 7: 植物实体

### 创建 src/entities/Plant.ts

- [ ] **Step 1: 创建 Plant 基类**

```typescript
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

    // 计算像素位置
    const x = 25 + position.col * 50 + 25;
    const y = 60 + position.row * 50 + 25;

    // 创建临时图形代替精灵图
    const graphics = scene.add.graphics();
    const color = plantType === 'peashooter' ? 0x90EE90 :
                  plantType === 'sunflower' ? 0xFFD700 : 0xDEB887;
    graphics.fillStyle(color, 1);
    graphics.fillRect(-20, -20, 40, 40);
    graphics.lineStyle(2, 0x000000, 1);
    graphics.strokeRect(-20, -20, 40, 40);

    const sprite = scene.add.sprite(x, y, '__DEFAULT') as Phaser.GameObjects.Sprite;
    sprite.setInteractive();

    // 为了让图形显示，创建一个容器
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
```

- [ ] **Step 2: 提交**

```bash
git add src/entities/Plant.ts
git commit -m "feat: add Plant entity class"
```

---

## Task 8: 僵尸实体

### 创建 src/entities/Zombie.ts

- [ ] **Step 1: 创建 Zombie 类**

```typescript
import Phaser from 'phaser';
import type { ZombieEntity, ZombieConfig } from '../types';
import { GAME_CONFIG } from '../config';

export class Zombie {
  static create(
    scene: Phaser.Scene,
    config: ZombieConfig,
    row: number,
    existingId?: string
  ): ZombieEntity {
    const id = existingId || `zombie_${Date.now()}_${Math.random()}`;

    // 僵尸起始位置 (草坪右侧外)
    const x = 25 + GAME_CONFIG.grid.cols * 50 + 30;
    const y = 60 + row * 50 + 25;

    // 创建临时图形
    const graphics = scene.add.graphics();
    const color = config.isFlag ? 0x8B0000 : 0x556B2F;
    graphics.fillStyle(color, 1);
    graphics.fillRect(-20, -25, 40, 50);
    graphics.lineStyle(2, 0x000000, 1);
    graphics.strokeRect(-20, -25, 40, 50);

    // 添加标签显示旗帜
    if (config.isFlag) {
      const flag = scene.add.graphics();
      flag.fillStyle(0xFF0000, 1);
      flag.fillTriangle(10, -20, 10, -5, 25, -12);
      graphics.lineStyle(2, 0x000000, 1);
      graphics.strokeCircle(0, -15, 5); // 头
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

    const speed = zombie.config.speed; // 像素/秒
    const dx = -speed * (delta / 1000);

    (zombie.sprite as unknown as Phaser.GameObjects.Container).x += dx;

    // 更新列位置
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
```

- [ ] **Step 2: 提交**

```bash
git add src/entities/Zombie.ts
git commit -m "feat: add Zombie entity class"
```

---

## Task 9: 豌豆子弹实体

### 创建 src/entities/Projectile.ts

- [ ] **Step 1: 创建 Projectile 类**

```typescript
import Phaser from 'phaser';
import type { ProjectileEntity } from '../types';

const PROJECTILE_SPEED = 300; // 像素/秒

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

    // 创建临时图形 (绿色圆形)
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
```

- [ ] **Step 2: 提交**

```bash
git add src/entities/Projectile.ts
git commit -m "feat: add Projectile entity for pea bullets"
```

---

## Task 10: Boot 场景

### 创建 src/scenes/BootScene.ts

- [ ] **Step 1: 创建 BootScene 类**

```typescript
import Phaser from 'phaser';
import { UIScene } from './UIScene';
import { PlayScene } from './PlayScene';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // 创建占位纹理
    this.createPlaceholderTextures();
  }

  create(): void {
    // 添加场景切换
    this.scene.add('PlayScene', PlayScene, true);
    this.scene.add('UIScene', UIScene, true);

    // 启动游戏场景
    this.scene.start('PlayScene');
  }

  private createPlaceholderTextures(): void {
    // 创建默认纹理用于开发阶段
    const graphics = this.make.graphics({ x: 0, y: 0, add: false });

    // 草地格子
    graphics.clear();
    graphics.fillStyle(0x32CD32, 1);
    graphics.fillRect(0, 0, 50, 50);
    graphics.generateTexture('grass_tile', 50, 50);

    // 植物占位
    graphics.clear();
    graphics.fillStyle(0x90EE90, 1);
    graphics.fillRect(0, 0, 40, 40);
    graphics.generateTexture('peashooter', 40, 40);

    graphics.clear();
    graphics.fillStyle(0xFFD700, 1);
    graphics.fillRect(0, 0, 40, 40);
    graphics.generateTexture('sunflower', 40, 40);

    graphics.clear();
    graphics.fillStyle(0xDEB887, 1);
    graphics.fillRect(0, 0, 40, 40);
    graphics.generateTexture('wallnut', 40, 40);

    // 僵尸占位
    graphics.clear();
    graphics.fillStyle(0x556B2F, 1);
    graphics.fillRect(0, 0, 40, 50);
    graphics.generateTexture('zombie_normal', 40, 50);

    graphics.clear();
    graphics.fillStyle(0x8B0000, 1);
    graphics.fillRect(0, 0, 40, 50);
    graphics.generateTexture('zombie_flag', 40, 50);

    // 豌豆
    graphics.clear();
    graphics.fillStyle(0x32CD32, 1);
    graphics.fillCircle(8, 8, 8);
    graphics.generateTexture('pea', 16, 16);

    // 阳光
    graphics.clear();
    graphics.fillStyle(0xFFFF00, 1);
    graphics.fillCircle(15, 15, 15);
    graphics.generateTexture('sunlight', 30, 30);

    graphics.destroy();
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/scenes/BootScene.ts
git commit -m "feat: add BootScene for asset loading"
```

---

## Task 11: 主游戏场景

### 创建 src/scenes/PlayScene.ts

- [ ] **Step 1: 创建 PlayScene 类 (第一部分: 初始化和核心系统)**

```typescript
import Phaser from 'phaser';
import type { PlantEntity, ZombieEntity, GridPosition } from '../types';
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
    // 初始化系统
    this.gridManager = new GridManager(this);
    this.economyManager = new EconomyManager(this);

    this.waveManager = new WaveManager(
      this,
      (zombie) => this.onZombieSpawn(zombie),
      (wave) => this.onWaveComplete(wave)
    );

    // 启动天空掉落定时器
    this.time.addEvent({
      delay: GAME_CONFIG.skyDropInterval,
      callback: () => {
        if (this.gameState === 'playing') {
          this.economyManager.spawnSkyDrop();
        }
      },
      loop: true,
    });

    // 设置输入
    this.setupInput();

    // 开始波次
    this.time.delayedCall(1000, () => {
      this.waveManager.startWaves();
    });
  }

  update(time: number, delta: number): void {
    if (this.gameState !== 'playing') return;

    // 更新僵尸
    this.updateZombies(delta);

    // 更新植物 (射击、产阳光)
    this.updatePlants(time);

    // 更新子弹
    this.updateProjectiles(delta);

    // 检查失败条件
    this.checkGameOver();
  }

  private setupInput(): void {
    // 植物卡片点击选择
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.y < 50) {
        // 点击顶部 UI 区域
        this.handleUIClick(pointer.x, pointer.y);
      }
    });

    // 草坪点击种植
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

    // ESC 取消选择
    this.input.keyboard?.on('keydown-ESC', () => {
      this.cancelSelection();
    });

    // 右键取消
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer, event: any) => {
      if (pointer.rightButtonDown()) {
        this.cancelSelection();
      }
    });
  }

  private handleUIClick(x: number, y: number): void {
    // 检查植物卡片区域
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

    // 创建预览精灵
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

    // 创建植物
    const plant = Plant.create(this.scene, this.selectedPlant, cell);
    this.plants.set(plant.id, plant);
    this.gridManager.occupyCell(cell.row, cell.col, plant.id);
    this.gridManager.addPlant(plant.sprite, plant.id);

    // 取消选择
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

      // 向日葵产阳光
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

      // 豌豆射手攻击
      if (plant.type === 'peashooter') {
        const interval = Plant.getAttackInterval(plant);
        const damage = Plant.getDamage(plant);

        if (interval && damage && time - plant.lastActionTime >= interval) {
          // 检查前方是否有僵尸
          const hasTarget = this.checkZombiesInRow(plant.position.row);

          if (hasTarget) {
            const pos = this.gridManager.getGridPosition(plant.position.row, plant.position.col);
            const projectile = Projectile.create(this.scene, pos.x + 25, pos.y, damage);
            this.projectiles.push(projectile);
            plant.lastActionTime = time;
          }
        }
      }
    }
  }

  private checkZombiesInRow(row: number): boolean {
    for (const zombie of this.zombies.values()) {
      if (Zombie.getRow(zombie) === row && zombie.state === 'walking') {
        return true;
      }
    }
    return false;
  }

  private updateZombies(delta: number): void {
    for (const zombie of this.zombies.values()) {
      if (zombie.state === 'dying' || zombie.state === 'dead') continue;

      const currentX = Zombie.getCurrentX(zombie);
      const row = Zombie.getRow(zombie);

      // 检查是否碰到植物
      const cellCol = Math.floor((currentX - 25) / 50);
      const targetPlant = this.findPlantAt(row, cellCol - 1);

      if (targetPlant) {
        // 停止移动并攻击
        zombie.state = 'attacking';
        zombie.targetPlant = targetPlant;

        // 攻击植物
        if (Date.now() - zombie.lastAttackTime >= zombie.config.attackInterval) {
          Plant.takeDamage(targetPlant, zombie.config.damage);
          zombie.lastAttackTime = Date.now();

          // 检查植物是否死亡
          if (Plant.isDead(targetPlant)) {
            this.removePlant(targetPlant);
            zombie.state = 'walking';
            zombie.targetPlant = null;
          }
        }
      } else {
        // 继续移动
        zombie.state = 'walking';
        zombie.targetPlant = null;
        Zombie.updatePosition(zombie, delta);

        // 更新行信息
        const newCol = Math.max(0, Math.floor((Zombie.getCurrentX(zombie) - 25) / 50));
        (zombie.sprite as unknown as Phaser.GameObjects.Container).setData('row', newCol);
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

      // 检查是否击中僵尸
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

      // 检查是否出界
      if (Projectile.isOffScreen(projectile, 25 + GAME_CONFIG.grid.cols * 50 + 50)) {
        toRemove.push(projectile);
      }
    }

    // 移除子弹
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
    // 检查胜利
    if (this.thirdWaveCleared && this.zombies.size === 0) {
      this.gameState = 'won';
      this.showGameOver('victory');
      return;
    }

    // 检查失败 (僵尸到达最左侧)
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

    // 重新开始按钮
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

  // 用于 UI 场景获取数据
  getSunlight(): number {
    return this.economyManager.getSunlight();
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/scenes/PlayScene.ts
git commit -m "feat: add PlayScene with main game loop"
```

---

## Task 12: UI 场景

### 创建 src/scenes/UIScene.ts

- [ ] **Step 1: 创建 UIScene 类**

```typescript
import Phaser from 'phaser';
import { GAME_CONFIG, PLANT_CONFIG_MAP } from '../config';
import type { PlayScene } from './PlayScene';

export class UIScene extends Phaser.Scene {
  private sunlightText!: Phaser.GameObjects.Text;
  private plantCards: Phaser.GameObjects.Container[] = [];
  private selectedCard: Phaser.GameObjects.Container | null = null;

  constructor() {
    super({ key: 'UIScene' });
  }

  create(): void {
    this.createTopBar();
    this.createPlantCards();

    // 定期更新 UI
    this.time.addEvent({
      delay: 100,
      callback: this.updateUI,
      callbackScope: this,
      loop: true,
    });
  }

  private createTopBar(): void {
    const graphics = this.add.graphics();
    graphics.fillStyle(0x333333, 1);
    graphics.fillRect(0, 0, 530, 50);

    // 阳光图标和数量
    const sunIcon = this.add.graphics();
    sunIcon.fillStyle(0xFFFF00, 1);
    sunIcon.fillCircle(30, 25, 15);

    this.sunlightText = this.add.text(50, 15, '150', {
      fontSize: '24px',
      color: '#FFFFFF',
      fontFamily: 'Arial',
    });
  }

  private createPlantCards(): void {
    const cardStartX = 150;
    const cardWidth = 60;
    const cardY = 10;

    const plants = ['peashooter', 'sunflower', 'wallnut'];

    plants.forEach((plantId, index) => {
      const config = PLANT_CONFIG_MAP.get(plantId)!;
      const x = cardStartX + index * cardWidth;

      const card = this.createCard(x, cardY, plantId, config.cost);
      this.plantCards.push(card);
    });
  }

  private createCard(
    x: number,
    y: number,
    plantType: string,
    cost: number
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);

    // 卡片背景
    const bg = this.add.graphics();
    bg.lineStyle(2, 0xFFFFFF, 0.8);
    bg.fillStyle(0x555555, 1);
    bg.fillRect(0, 0, 55, 40);
    bg.strokeRect(0, 0, 55, 40);

    // 植物图标 (使用占位图形)
    const icon = this.add.graphics();
    const color = plantType === 'peashooter' ? 0x90EE90 :
                  plantType === 'sunflower' ? 0xFFD700 : 0xDEB887;
    icon.fillStyle(color, 1);
    icon.fillRect(5, 5, 30, 30);
    icon.lineStyle(1, 0x000000, 1);
    icon.strokeRect(5, 5, 30, 30);

    // 成本
    const costText = this.add.text(20, 30, cost.toString(), {
      fontSize: '12px',
      color: '#FFFF00',
      fontFamily: 'Arial',
    });
    costText.setOrigin(0.5, 0.5);

    container.add([bg, icon, costText]);
    container.setSize(55, 40);
    container.setInteractive();

    // 点击选择
    container.on('pointerdown', () => {
      this.selectCard(container);
    });

    return container;
  }

  private selectCard(card: Phaser.GameObjects.Container): void {
    // 发送事件到 PlayScene
    const scene = this.scene.get('PlayScene') as PlayScene;
    const sunlight = scene.getSunlight();

    // 获取卡片索引
    const index = this.plantCards.indexOf(card);
    const plants = ['peashooter', 'sunflower', 'wallnut'];
    const plantType = plants[index];

    const config = PLANT_CONFIG_MAP.get(plantType)!;

    if (sunlight >= config.cost) {
      // 高亮显示
      if (this.selectedCard) {
        this.unhighlightCard(this.selectedCard);
      }

      this.selectedCard = card;
      this.highlightCard(card);

      // 通知 PlayScene
      this.events.emit('plantSelected', plantType);
    }
  }

  private highlightCard(card: Phaser.GameObjects.Container): void {
    const bg = card.list[0] as Phaser.GameObjects.Graphics;
    bg.clear();
    bg.lineStyle(3, 0x00FF00, 1);
    bg.fillStyle(0x555555, 1);
    bg.fillRect(0, 0, 55, 40);
    bg.strokeRect(0, 0, 55, 40);
  }

  private unhighlightCard(card: Phaser.GameObjects.Container): void {
    const bg = card.list[0] as Phaser.GameObjects.Graphics;
    bg.clear();
    bg.lineStyle(2, 0xFFFFFF, 0.8);
    bg.fillStyle(0x555555, 1);
    bg.fillRect(0, 0, 55, 40);
    bg.strokeRect(0, 0, 55, 40);
  }

  private updateUI(): void {
    const scene = this.scene.get('PlayScene') as PlayScene;
    if (scene && this.sunlightText) {
      this.sunlightText.setText(scene.getSunlight().toString());
    }
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/scenes/UIScene.ts
git commit -m "feat: add UIScene for game UI overlay"
```

---

## Task 13: 游戏入口

### 创建 src/main.ts

- [ ] **Step 1: 创建 main.ts**

```typescript
import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 530,
  height: 350,
  parent: 'game-container',
  backgroundColor: '#1a1a2e',
  scene: [BootScene],
  physics: {
    default: 'arcade',
    arcade: {
      debug: false,
    },
  },
};

const game = new Phaser.Game(config);

export default game;
```

- [ ] **Step 2: 添加 PlayScene 的 getSunlight 方法**

在 `src/scenes/PlayScene.ts` 的 `PlayScene` 类末尾添加:

```typescript
public getSunlight(): number {
  return this.economyManager.getSunlight();
}
```

- [ ] **Step 3: 提交**

```bash
git add src/main.ts src/scenes/PlayScene.ts
git commit -m "feat: add game entry point and main loop"
```

---

## Task 14: 系统集成测试

### 运行开发服务器验证

- [ ] **Step 1: 安装依赖**

```bash
cd /root/repos/plants-game
npm install
```

- [ ] **Step 2: 启动开发服务器**

```bash
npm run dev
```

- [ ] **Step 3: 验证**

访问 http://localhost:5173 确认:
- 页面加载无错误
- 草坪网格显示
- 植物卡片可点击
- 僵尸开始生成
- 豌豆可以发射

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "chore: initial game build verification"
```

---

## 实施检查清单

完成所有 Task 后，验证以下功能:

- [ ] `npm run dev` 成功启动
- [ ] 5x9 草坪网格正确显示
- [ ] 顶部 UI 显示阳光数量
- [ ] 点击植物卡片可以选中
- [ ] 可以在草坪上种植植物
- [ ] 向日葵定时产出阳光
- [ ] 天空定时掉落阳光
- [ ] 豌豆射手会向僵尸射击
- [ ] 僵尸沿路径移动
- [ ] 僵尸攻击植物
- [ ] 第 3 波出现旗帜僵尸
- [ ] 消灭所有僵尸后显示胜利
- [ ] 僵尸到达最左侧显示失败

---

*本文档由 Superpowers Writing Plans 技能生成*