# PVZ 像素版 — 游戏设计文档 (GDD)

> 版本: 1.0 | 状态: 已批准 | 日期: 2026-05-22

---

## 1. 项目概述

### 1.1 简介

一款致敬经典塔防游戏的像素风格网页游戏。玩家在 5x9 草坪网格上种植植物、收集阳光、阻止僵尸入侵。目标是完成 3 波僵尸进攻后取得胜利。

### 1.2 技术栈

| 组件 | 技术 |
|------|------|
| 引擎 | Phaser 3 |
| 语言 | TypeScript |
| 构建工具 | Vite |
| 渲染 | HTML5 Canvas |
| 目标平台 | 浏览器 |

### 1.3 项目目标

- **核心战斗循环完整可玩**：种植 → 产阳光 → 僵尸进攻 → 胜负判定
- **代码架构可面试级别**：清晰分层、数据驱动、能回答设计决策
- **素材替换流程完整**：AI生成 → 去背 → 配置文件切换

---

## 2. 游戏规格

### 2.1 界面布局

```
┌─────────────────────────────────────────────┐
│  ☀️ 150  |  🌱 100  🌻 50  🥜 50  |  ⏸ 暂停 │  <- 顶部资源栏
├─────────────────────────────────────────────┤
│                                             │
│  [草坪 5行 x 9列网格]                        │
│                                             │
│  ← 僵尸入侵方向                              │
└─────────────────────────────────────────────┘
```

- **网格尺寸**: 5 行 × 9 列
- **格子大小**: 50×50 像素
- **整体画布**: 530×350 像素 (含边距)

### 2.2 交互流程

1. 点击底部植物卡片 → 选中高亮
2. 鼠标悬停草坪 → 半透明预览
3. 点击有效格子 → 完成种植
4. 右键 / ESC → 取消选中

---

## 3. 植物系统

### 3.1 植物配置

| ID | 名称 | 成本 | HP | 攻击间隔 | 伤害 | 产阳光 | 动画 |
|----|------|------|-----|---------|------|--------|------|
| `peashooter` | 豌豆射手 | 100 | 100 | 1500ms | 20 | — | 射击 (3帧) |
| `sunflower` | 向日葵 | 50 | 100 | — | — | 25±10 / 5秒 | 摇摆 (4帧) |
| `wallnut` | 坚果墙 | 50 | 400 | — | — | — | 受伤 (2帧) |

### 3.2 植物行为

**豌豆射手**
- 持续检测前方是否有僵尸
- 有目标时，每 1.5 秒向右侧发射 1 颗豌豆
- 豌豆速度: 300 像素/秒
- 无目标时停止射击

**向日葵**
- 每 5 秒产出一批阳光
- 产出量: 基础值 25 + 随机 [-10, +10]
- 阳光需要玩家点击收集

**坚果墙**
- 无攻击能力
- HP 降至 0 时死亡，不会消失（被啃食）
- 死亡后僵尸可以继续前进

---

## 4. 阳光经济系统

### 4.1 产出规则

| 来源 | 频率 | 数量 | 说明 |
|------|------|------|------|
| 初始 | — | 150 | 游戏开始时发放 |
| 天空掉落 | 每 10 秒 | 25 (固定) | 提供保底节奏 |
| 向日葵 | 每 5 秒/株 | 15~35 (随机) | 激励收集 |

### 4.2 收集规则

- 阳光生成后需要玩家点击收集
- 未收集的阳光在 8 秒后消失
- 收集范围: 点击半径 40 像素内

---

## 5. 僵尸系统

### 5.1 僵尸配置

| ID | 名称 | HP | 移动速度 | 攻击力 | 攻击间隔 | 首次出现 |
|----|------|-----|---------|--------|---------|---------|
| `normal` | 普通僵尸 | 100 | 1格/1.5秒 | 20 | 1000ms | 第1波 |
| `flag` | 旗帜僵尸 | 200 | 1格/1.5秒 | 20 | 1000ms | 第3波 |

> **数据存储位置**: `src/config/zombies.ts`

### 5.2 僵尸行为

- 从网格右侧 (列 9) 出现
- 向左移动，遇到植物时停止并攻击
- 攻击坚果墙时，坚果墙 HP 减少
- HP 归零时播放死亡动画后移除
- 抵达网格左侧 (列 1) 时判定游戏失败

---

## 6. 波次系统

### 6.1 波次时间表

| 波次 | 开始时间 | 僵尸数量 | 间隔 | 特殊 |
|------|---------|---------|------|------|
| 第1波 | 游戏开始后 20 秒 | 3 只普通 | 每只 4 秒 | — |
| 第2波 | 第1波首次出现后 18 秒 | 5 只普通 | 每只 3 秒 | — |
| 第3波 | 第2波首次出现后 15 秒 | 7 只 (6普通+1旗帜) | 每只 2 秒 | 🚩 旗帜僵尸为首 |

### 6.2 时间线可视化

```
0秒      ──────────────────────────── 60秒
├────────┤
游戏开始  第1波(20s)  第2波(38s)  第3波(53s)
```

### 6.3 波次配置

```typescript
// 位于 src/config/game.ts
const WAVE_CONFIG = {
  wave1: { delay: 20000, count: 3, interval: 4000, zombieType: 'normal' },
  wave2: { delay: 38000, count: 5, interval: 3000, zombieType: 'normal' },
  wave3: { delay: 53000, count: 7, interval: 2000, zombieType: 'mixed' }, // 6普通 + 1旗帜
};
```

---

## 7. 胜负条件

### 7.1 胜利条件

第 3 波所有僵尸被消灭 → 显示胜利画面

### 7.2 失败条件

任意僵尸抵达草坪最左侧 (列 1) → 显示失败画面

---

## 8. TypeScript 接口定义

```typescript
// ============================================================
// 核心类型定义
// ============================================================

/** 网格坐标 */
interface GridPosition {
  row: number;    // 0-4
  col: number;    // 0-8
}

/** 阳光资源 */
interface Sunlight {
  id: string;
  x: number;
  y: number;
  value: number;
  createdAt: number;
}

/** 植物状态 */
type PlantState = 'idle' | 'attacking' | 'producing' | 'dead';

/** 僵尸状态 */
type ZombieState = 'walking' | 'attacking' | 'dying' | 'dead';

// ============================================================
// 配置数据结构
// ============================================================

interface PlantConfig {
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

interface ZombieConfig {
  id: string;
  name: string;
  hp: number;
  speed: number;            // 像素/秒
  damage: number;
  attackInterval: number;   // ms
  isFlag?: boolean;
}

interface WaveConfig {
  delay: number;            // 相对于游戏开始的延迟 (ms)
  count: number;            // 僵尸数量
  interval: number;         // 每只僵尸间隔 (ms)
  zombieType: 'normal' | 'flag' | 'mixed';
}

interface GameConfig {
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

interface PlantEntity {
  id: string;
  type: PlantConfig['id'];
  position: GridPosition;
  hp: number;
  state: PlantState;
  lastActionTime: number;
  sprite: Phaser.GameObjects.Sprite;
}

interface ZombieEntity {
  id: string;
  type: ZombieConfig['id'];
  position: GridPosition;
  hp: number;
  state: ZombieState;
  targetPlant: PlantEntity | null;
  sprite: Phaser.GameObjects.Sprite;
}

interface ProjectileEntity {
  id: string;
  damage: number;
  x: number;
  y: number;
  sprite: Phaser.GameObjects.Image;
}

// ============================================================
// 事件系统
// ============================================================

interface GameEvents {
  'plant:placed': { plant: PlantEntity; position: GridPosition };
  'plant:destroyed': { plant: PlantEntity; position: GridPosition };
  'zombie:spawned': { zombie: ZombieEntity };
  'zombie:killed': { zombie: ZombieEntity };
  'zombie:reached_end': { zombie: ZombieEntity };
  'sunlight:collected': { amount: number };
  'wave:started': { wave: number };
  'wave:cleared': { wave: number };
  'game:won': void;
  'game:lost': void;
}
```

---

## 9. 待确认问题

以下问题需要在开发过程中或 V1.0 完成后确认：

### 9.1 数值平衡 (调优阶段)

- [ ] 坚果墙 HP 400 是否足够？可能需要降低至 300 以增加紧迫感
- [ ] 向日葵产阳光量 25±10 是否合适？考虑调整至 30±5
- [ ] 天空掉落 10 秒间隔是否太频繁/稀疏？

### 9.2 美术资源 (素材阶段)

- [ ] 像素画分辨率: 128×128 还是 64×64？
- [ ] 每个植物需要哪些动画帧？
  - 豌豆射手: 待机、射击 (豌豆射手不需要待机动画，可以简化)
  - 向日葵: 摇摆 (4帧循环)
  - 坚果墙: 正常、受伤 (2帧)

### 9.3 功能扩展 (V2.0)

- [ ] 是否需要添加植物攻击范围检测（前方是否有僵尸）？
- [ ] 是否需要添加背景音乐和音效？
- [ ] 是否需要添加暂停菜单？

---

## 10. 备用方案记录

### 10.1 视觉风格选择

**选择**: 像素复古 (16-bit, 低分辨率像素画)

**备选方案**:
- 原版致敬风格 — 需要更复杂的骨骼动画，AI 生图一致性低
- 极简几何 — 缺少游戏感，不符合 PVZ 主题

**选择理由**:
1. AI 生成一致性强 ("16-bit, 128x128, 纯绿幕背景" 前缀)
2. 帧动画实现简单，无需骨骼动画
3. 复古质感饱满，资源量可控

### 10.2 阳光经济设计

**选择**: 固定+小随机 (25±10)

**备选方案**:
- 纯随机 (15-35) — 运气成分过大，节奏不稳
- 纯固定 (25) — 过于机械，缺少惊喜感
- 消耗后补充 — 增加复杂性，不适合 V1.0

**选择理由**: 固定基础值保证可预测性，小随机增加变化但不破坏节奏

### 10.3 代码分层

**选择**: 配置层 / 实体层 / 系统层 / 场景层分离

```
config/   <- 数据配置 (植物、僵尸、游戏参数)
entities/ <- 游戏实体类 (Plant, Zombie, Projectile)
systems/  <- 游戏系统 (GridManager, WaveManager, EconomyManager)
scenes/   <- Phaser 场景 (BootScene, PlayScene, UIScene)
```

**选择理由**:
1. 配置层独立 → 方便调平衡，无需改代码
2. 实体类封装 → 便于管理生命周期
3. 系统层抽象 → 核心逻辑与渲染分离，利于单元测试
4. 面试可解释性 → 能清晰说明每个模块的职责边界

---

## 11. 验收标准

### 11.1 功能验收

- [ ] 可以种植 3 种植物
- [ ] 向日葵每 5 秒产出阳光
- [ ] 天空每 10 秒掉落阳光
- [ ] 可以收集阳光
- [ ] 豌豆射手会向僵尸射击
- [ ] 僵尸会沿路径移动并攻击植物
- [ ] 第 3 波僵尸包含旗帜僵尸
- [ ] 消灭所有僵尸后显示胜利
- [ ] 僵尸到达最左侧显示失败

### 11.2 技术验收

- [ ] TypeScript 编译无错误
- [ ] Phaser 场景切换正常
- [ ] 帧动画播放流畅
- [ ] 植物和僵尸碰撞检测正确

---

## 12. 文档修订历史

| 日期 | 版本 | 变更内容 |
|------|------|---------|
| 2026-05-22 | 1.0 | 初始版本，基于 brainstorming 会话 |

---

*本文档由 Superpowers Brainstorming 技能生成*