# 横屏适配方案设计

**日期**: 2026-05-26
**版本**: v1.1

## 1. 问题描述

当前游戏针对竖屏 iPad 优化（720x1280），但平板横屏使用时游戏只占屏幕约一半，空白很多。

**当前状态**:
- 游戏基础分辨率: 720x1280 (竖屏)
- Grid: 9列 x 5行, cellSize 80px
- 横屏时缩放比 0.6，实际宽度仅 432px

## 2. 设计目标

- **列数保持一致**: 横竖屏都是 9 列
- **动态 cellSize**: 横屏时格子变大，撑满屏幕
- 横竖屏切换时自动调整

## 3. 技术方案

### 3.1 动态配置

修改 `game.ts` 的 `GAME_CONFIG.grid` 为动态计算:

```typescript
const GAME_CONFIG: GameConfig = {
  grid: {
    rows: 5,
    cols: 9,
    get cellSize(): number {
      // 竖屏: 基于 720 宽度
      // 横屏: 基于屏幕宽度计算
      if (typeof window !== 'undefined') {
        const width = window.innerWidth;
        return Math.floor(width / 9); // 简单计算，保留 20px 边距
      }
      return 80; // 默认值
    }
  },
  // ...
};
```

或者更简单的方案 - 直接在 `GridManager` 初始化时计算:

```typescript
class GridManager {
  private cellSize: number;

  constructor(scene: Phaser.Scene) {
    // 横屏检测
    const isLandscape = window.innerWidth > window.innerHeight;
    if (isLandscape) {
      // 横屏: 用 1024 宽度计算，9列，100px 格子
      this.cellSize = Math.floor((1024 - 40) / 9); // ~109px
    } else {
      this.cellSize = 80; // 竖屏保持 80
    }
  }
}
```

### 3.2 横竖屏参数

| 模式 | 屏幕 | 列数 | cellSize | Grid 宽度 |
|------|------|------|----------|-----------|
| 竖屏 | 720 | 9 | 80px | 720px |
| 横屏 | 1024 | 9 | ~100px | ~900px |

### 3.3 修改范围

| 文件 | 修改内容 |
|------|----------|
| `src/config/game.ts` | 暴露 `getCellSize()` 函数 |
| `src/systems/GridManager.ts` | 检测横竖屏，计算 `cellSize` |
| `src/entities/Plant.ts` | 使用 GridManager 的 cellSize |
| `src/entities/Zombie.ts` | 同上 |
| `src/scenes/PlayScene.ts` | 更新背景、箭头、爆炸效果 |

### 3.4 横屏界面布局

```
[顶部栏: 阳光 | Wave | 声音]  ← 保持不变
[植物卡片 1-4                    ]  ← 横屏时缩小
[===============================]
[  9x5 格子地图 (约 900px 宽)     ]
[                              右侧少量留白
```

## 4. 实现步骤

1. **修改 config/game.ts**
   - 添加 `getCellSize(isLandscape: boolean): number` 函数

2. **修改 GridManager.ts**
   - 构造函数检测横竖屏
   - 使用计算出的 cellSize 初始化 grid

3. **修改 Entity 坐标计算**
   - Plant.ts, Zombie.ts 从 GridManager 获取 cellSize

4. **修改 Scene 元素位置**
   - PlayScene: 背景、箭头等使用动态坐标

5. **测试**
   - 竖屏/横屏切换正常

## 5. 验证标准

- [ ] `npm run build` 成功
- [ ] 竖屏模式: 9列格子，80px，宽度约 720px
- [ ] 横屏模式: 9列格子，~100px，宽度约 900px
- [ ] 植物种植位置正确
- [ ] 僵尸生成位置正确
- [ ] 无控制台错误