# PVZ 像素版 - 开发文档

> 本文档记录项目的技术架构、设计决策和开发指南。

---

## 1. 技术架构

### 1.1 Vue + Phaser 混合架构

项目采用 Vue 3 作为 UI 层，Phaser 3 作为游戏引擎层的混合架构。

```
┌─────────────────────────────────────────────┐
│              Vue 3 App (HTML/CSS)           │
│  ┌──────────┐ ┌──────────┐ ┌────────────┐   │
│  │ TopBar   │ │ Plant    │ │SpeechOverlay│  │
│  │(阳光/波次)│ │ Cards    │ │ (单词显示) │   │
│  └──────────┘ └──────────┘ └────────────┘   │
└────────────────────┬────────────────────────┘
                     │ CustomEvent
┌────────────────────▼────────────────────────┐
│         Phaser 3 Game (Canvas)             │
│  - Grid rendering                          │
│  - Plant/Zombie sprites                     │
│  - Animation system                         │
│  - Physics & collision                      │
└─────────────────────────────────────────────┘
```

**为什么用混合架构？**
- Vue 擅长响应式 UI（按钮、卡片、弹窗）
- Phaser 擅长游戏渲染（精灵、动画、物理）
- 可以用现代 CSS 实现精美 UI，同时保留游戏性能

### 1.2 事件桥接机制

Vue 和 Phaser 之间通过 `CustomEvent` 和 `window` 对象通信。

```typescript
// src/ui/bridge.ts
export const GameEvents = {
  PLANT_SELECTED: 'game:plant-selected',   // Vue → Phaser
  SPEECH_LEARN: 'game:speech-learn',       // Vue → Phaser
  SUNLIGHT_CHANGED: 'game:sunlight-changed', // Phaser → Vue
  GAME_WON: 'game:won',                     // Phaser → Vue
  GAME_LOST: 'game:lost',                   // Phaser → Vue
};

// Vue 发送事件
window.dispatchEvent(new CustomEvent(GameEvents.PLANT_SELECTED, { detail: 'peashooter' }));

// Phaser 监听事件
window.addEventListener(GameEvents.PLANT_SELECTED, (e: CustomEvent) => {
  this.selectPlant(e.detail);
});
```

---

## 2. 目录结构

```
src/
├── main.ts                    # 游戏入口
│
├── config/                    # 配置数据（数据驱动）
│   ├── game.ts               # 游戏配置：网格大小、波次、时间
│   ├── plants.ts             # 植物配置：属性、数值
│   └── zombies.ts            # 僵尸配置：属性、数值
│
├── types/                     # TypeScript 类型定义
│   └── index.ts              # 所有接口和类型
│
├── entities/                  # 游戏实体类
│   ├── Plant.ts              # 植物：创建、攻击、产出
│   ├── Zombie.ts             # 僵尸：移动、攻击、死亡
│   └── Projectile.ts         # 豌豆：移动、碰撞
│
├── systems/                   # 游戏系统
│   ├── GridManager.ts        # 网格：渲染、单元格状态
│   ├── WaveManager.ts        # 波次：生成、计时
│   ├── EconomyManager.ts     # 经济：阳光生成、消耗
│   └── SpeechService.ts      # 语音：Web Speech API
│
├── scenes/                    # Phaser 场景
│   ├── BootScene.ts          # 加载：资源加载、进度
│   ├── PlayScene.ts          # 主游戏：整合所有系统
│   └── UIScene.ts           # UI层（已废弃，Vue接管）
│
└── ui/                        # Vue UI 层
    ├── App.vue               # 根组件
    ├── bridge.ts             # 事件桥接
    ├── main.ts               # Vue 入口
    └── components/           # Vue 组件
        ├── TopBar.vue        # 顶部：阳光、波次
        ├── PlantCards.vue    # 植物选择卡片
        ├── SpeechOverlay.vue # 单词显示弹窗
        ├── Tutorial.vue       # 新手引导
        └── GameOverlay.vue    # 游戏结束画面
```

---

## 3. 核心模块说明

### 3.1 配置层 (config/)

配置层是数据驱动的核心。所有游戏数值（植物HP、僵尸速度、波次时间）都集中在这里，方便调平衡。

```typescript
// src/config/game.ts
export const GAME_CONFIG: GameConfig = {
  grid: { rows: 5, cols: 9, cellSize: 80 },
  waves: [
    { delay: 20000, count: 6, interval: 2500, zombieType: 'normal' },
    { delay: 30000, count: 10, interval: 1800, zombieType: 'mixed' },
    { delay: 30000, count: 18, interval: 1000, zombieType: 'mixed' },
  ],
};
```

### 3.2 实体层 (entities/)

实体类封装游戏对象的行为和状态。

```typescript
// src/entities/Zombie.ts
export class Zombie {
  static create(scene, config, row, index, cellSize, offsetX, offsetY): ZombieEntity {
    // 创建僵尸精灵，设置位置和属性
  }

  static updatePosition(zombie, delta, cellSize, minX): void {
    // 更新僵尸位置，支持边界限制
  }

  static takeDamage(zombie, damage): void {
    // 僵尸受伤，检查死亡
  }
}
```

### 3.3 系统层 (systems/)

系统层处理游戏逻辑，与渲染解耦。

| 系统 | 职责 |
|------|------|
| GridManager | 管理5×9网格，单元格状态，植物布局 |
| WaveManager | 管理僵尸波次生成，定时器 |
| EconomyManager | 管理阳光生成、消耗、掉落 |
| SpeechService | 管理Web Speech API，播放语音 |

### 3.4 场景层 (scenes/)

Phaser场景组织游戏流程。

```typescript
// BootScene → PlayScene
// BootScene: 加载资源，显示进度条
// PlayScene: 游戏主循环，更新所有系统
```

### 3.5 UI层 (ui/)

Vue组件处理非游戏UI（按钮、弹窗、文字）。

```
PlantCards → dispatchEvent(PLANT_SELECTED) → PlayScene.selectPlant()
                                              ↓
                                         GridManager.occupyCell()

App.vue ← listenEvent(SUNLIGHT_CHANGED) ← EconomyManager.spendSunlight()
```

---

## 4. 开发指南

### 4.1 添加新植物

1. 在 `src/config/plants.ts` 添加配置
2. 在 `src/entities/Plant.ts` 添加创建逻辑（如需要）
3. 在 `src/ui/App.vue` 的 plants 数组添加卡片数据
4. 在 `src/systems/SpeechService.ts` 的 LEARNING_DATA 添加英语内容

```typescript
// 1. config/plants.ts
export const PLANT_CONFIGS = [
  // ... existing plants ...
  { id: 'snowpea', name: '寒冰射手', cost: 175, hp: 100, damage: 15, attackInterval: 1500 },
];

// 2. ui/App.vue
const plants = [
  // ... existing plants ...
  { type: 'snowpea', name: '寒冰射手', cost: 175, description: '减速僵尸' },
];

// 3. systems/SpeechService.ts
export const LEARNING_DATA = {
  // ... existing ...
  snowpea: { word: 'Snow Pea', sentence: 'Snow Pea! This pea slows down zombies!' },
};
```

### 4.2 添加新僵尸

1. 在 `src/config/zombies.ts` 添加配置
2. 在 `src/entities/Zombie.ts` 添加创建逻辑（如需要）

### 4.3 调试技巧

```bash
# 启动开发服务器
npm run dev

# 运行测试
npm test

# TypeScript 类型检查
npx tsc --noEmit
```

---

## 5. 设计决策记录

### 5.1 为什么用 CSS 变量而非预处理器？

- 原生支持，无需构建转换
- 可以在运行时动态修改主题
- Vue scoped styles 天然支持

### 5.2 为什么用 CustomEvent 而非 Pinia/Vuex？

- 简单直接，不需要引入状态管理库
- Vue 和 Phaser 可以独立运行
- 事件驱动易于理解和调试

### 5.3 为什么格子大小从50改为80？

- 支持 iPad HD 分辨率 (720x1280)
- 更大的触摸目标，更适合儿童
- 与 AI 生成的 512x512 素材更匹配

---

## 6. 待解决问题

- [ ] 横屏模式下的布局适配
- [ ] 移动端触摸事件的精确度
- [ ] 游戏音效系统

---

*本文档随项目更新同步维护*