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
│  │  Plant   │ │ Speech   │ │  Game      │   │
│  │  Cards   │ │ Overlay  │ │  Overlay   │   │
│  │(资源+卡片)│ │(单词显示)│ │(胜利/失败) │   │
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

### 1.2 移动端缩放

`src/main.ts` 使用 `Phaser.Scale.FIT` 模式：

```typescript
scale: {
  mode: Phaser.Scale.ScaleModes.FIT,
  autoCenter: Phaser.Scale.Center.CENTER_BOTH,
}
```

- 游戏内部坐标固定 720×1280
- Phaser 在 CSS 层做 letterbox 等比缩放，canvas 显示尺寸自动适配视口
- `scene.scale.width/height` 始终是 720×1280 → `GridManager` 计算的 `offsetX/offsetY` 正确
- 早先使用的 `RESIZE` 模式会让 `scale.width/height` 跟随视口，导致窄屏手机 `offsetX` 变为负数，左半部分网格被裁切

### 1.3 Android 音频预热

Android Chrome 的 Web Speech API 必须**在用户手势的事件栈中**调用 `speak()` 才能激活音频会话。`SpeechService.preheat()` 解决了这个限制：

```typescript
// src/ui/App.vue
function onStartGame() {
  showTutorial.value = false;
  speechService.enable();
  speechService.preheat();  // 在"开始"按钮点击的事件栈中激活音频
}
```

```typescript
// src/systems/SpeechService.ts
preheat(): void {
  if (this._preheated || !this._enabled) return;
  const warmup = new SpeechSynthesisUtterance(' ');
  warmup.volume = 0;
  warmup.onend = () => { this._preheated = true; };
  warmup.onerror = () => { this._preheated = true; };
  speechSynthesis.speak(warmup);
}
```

`speak()` 和 `speakWord()` 中 `cancel()` 也加了守卫，仅在 `speechSynthesis.speaking === true` 时调用，避免误关闭刚激活的会话。

### 1.4 事件桥接机制

Vue 和 Phaser 之间通过 `CustomEvent` 和 `window` 对象通信。

```typescript
// src/ui/bridge.ts
export const GameEvents = {
  PLANT_SELECTED: 'game:plant-selected',   // Vue → Phaser
  SPEECH_LEARN: 'game:speech-learn',       // Vue → Phaser
  SUNLIGHT_CHANGED: 'game:sunlight-changed', // Phaser → Vue
  GAME_WON: 'game:won',                     // Phaser → Vue
  GAME_LOST: 'game:lost',                   // Phaser → Vue
  GRID_INFO: 'game:grid-info',             // Phaser → Vue (gridOffsetY, gridHeight)
  RESIZE: 'game:resize',                   // Phaser → Vue (canvas size)
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
    ├── styles/               # CSS 变量与动画
    └── components/           # Vue 组件
        ├── PlantCards.vue    # 资源栏 + 植物卡片（已合并 TopBar）
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
| SpeechService | 管理Web Speech API，播放英语单词+句子；`preheat()` 用于解锁 Android 音频会话 |

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

### 4.4 Android 真机测试

视觉缩放可在 Chrome DevTools 设备模式中验证，但**音频行为只能在真机复现**。

```bash
# 启动 dev server 并绑定所有网卡，让同 WiFi 的 Android 手机访问
npm run dev -- --host 0.0.0.0
# 输出: ➜  Network: http://10.0.0.X:5173/
```

手机 Chrome 访问该地址，逐项验证：
- 5×9 网格完整可见
- 植物卡片和单词弹窗不重叠地图
- 点击"开始"按钮 → 点击植物卡片 → 应能听到英语单词

**测试责任划分**：
- Claude 可验证：类型检查、桌面浏览器布局、DevTools 设备模拟视觉
- 用户验证：真机音频播放、触摸精度、视觉无裁切

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

### 5.4 为什么用 FIT 而不是 RESIZE 缩放？

- `FIT`：保持 720×1280 内部坐标，CSS 做 letterbox 等比缩放 → `GridManager` 计算的网格偏移正确
- `RESIZE`：Phaser 把画布拉伸到父容器，`scale.width/height` 变成视口尺寸 → 在窄屏手机上 `offsetX` 变负，网格被裁

### 5.5 为什么 SpeechService 需要 preheat？

- Android Chrome 必须有**用户手势栈内**的首次 `speak()` 才能激活音频会话
- 用户点植物卡片时已经离开"开始"按钮的事件栈 → 直接 speak 会静默失败
- `preheat()` 在"开始"按钮点击时创建静音 utterance 激活会话，后续 speak 正常工作

---

## 6. 待解决问题

- [ ] 横屏模式下的布局适配
- [ ] 游戏音效系统（豌豆射击、僵尸啃咬、爆炸等）

---

*本文档随项目更新同步维护*