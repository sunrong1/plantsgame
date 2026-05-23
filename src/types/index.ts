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
  sprite: Phaser.GameObjects.Image;
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
  sprite: Phaser.GameObjects.Image;
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