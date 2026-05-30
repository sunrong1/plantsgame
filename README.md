# PVZ 像素版 (Plants vs. Zombies Pixel Edition)

> 一款使用 Phaser 3 + Vue 3 + TypeScript 构建的塔防游戏，专为儿童英语学习设计。

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Phaser](https://img.shields.io/badge/Phaser-3.60-green.svg)](https://phaser.io/)
[![Vue](https://img.shields.io/badge/Vue-3.4-42B883.svg)](https://vuejs.org/)
[![Vite](https://img.shields.io/badge/Vite-5.0-646CFF.svg)](https://vitejs.dev/)
[![Vitest](https://img.shields.io/badge/Vitest-4.1-6BAF00.svg)](https://vitest.io/)

## 游戏预览

```
┌─────────────────────────────────────────────┐
│  ☀️ 150  |  🌱 100  🌻 50  🥜 50  💣 150   │
├─────────────────────────────────────────────┤
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│                  ← 僵尸入侵方向 ←            │
└─────────────────────────────────────────────┘
```

## 功能特性

### 核心玩法
- **5×9 草坪网格** - 策略性植物布局
- **4 种植物** - 豌豆射手、向日葵、坚果墙、樱桃炸弹
- **2 种僵尸** - 普通僵尸、旗帜僵尸（可爱卡通风格）
- **3 波僵尸进攻** - 递增难度曲线

### 英语学习系统
- **点击植物卡片** → 播放英语单词和句子
- **Web Speech API** - 无需音频文件
- **视觉强化** - 单词弹窗显示在屏幕下方

### 游戏系统
- 阳光资源管理（天空掉落 + 向日葵产出）
- 植物种植预览系统（绿色/红色指示）
- 智能豌豆攻击判定（只攻击同一行右侧僵尸）
- 僵尸 AI 寻路与攻击
- 樱桃炸弹范围爆炸
- 游戏胜利/失败判定
- 教程引导面板

### 技术架构
- **Vue 3 + Phaser 3 混合架构** - UI 层用 Vue，游戏层用 Phaser
- **事件桥接** - CustomEvent 实现 Vue 和 Phaser 通信
- **响应式设计** - 支持平板横屏/竖屏

## 快速开始

### 环境要求
- Node.js 18+
- npm 9+

### 安装与运行

```bash
# 克隆项目
git clone https://github.com/sunrong1/plantsgame.git
cd plants-game

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

访问 http://localhost:5173 开始游戏。

### 运行测试

```bash
npm test
```

### 构建生产版本

```bash
npm run build
npm run preview
```

## 项目结构

```
src/
├── main.ts                    # 游戏入口
├── config/                    # 配置数据
│   ├── game.ts               # 游戏配置 (网格、波次)
│   ├── plants.ts             # 植物配置
│   └── zombies.ts            # 僵尸配置
├── types/                     # TypeScript 类型定义
├── entities/                  # 游戏实体
│   ├── Plant.ts              # 植物实体类
│   ├── Zombie.ts             # 僵尸实体类
│   └── Projectile.ts        # 豌豆子弹
├── systems/                   # 游戏系统
│   ├── GridManager.ts        # 草坪网格管理
│   ├── WaveManager.ts        # 波次管理
│   ├── EconomyManager.ts     # 阳光经济
│   └── SpeechService.ts      # 英语语音服务
├── scenes/                    # Phaser 场景
│   ├── BootScene.ts          # 加载场景
│   ├── PlayScene.ts          # 主游戏场景
│   └── UIScene.ts           # UI 场景 (已废弃)
└── ui/                        # Vue UI 层
    ├── App.vue               # 主应用组件
    ├── bridge.ts             # Vue-Phaser 事件桥接
    └── components/           # Vue 组件
        ├── TopBar.vue        # 顶部资源栏
        ├── PlantCards.vue    # 植物卡片选择栏
        ├── SpeechOverlay.vue # 单词显示弹窗
        ├── Tutorial.vue      # 教程引导
        └── GameOverlay.vue   # 游戏结束画面
```

## 设计文档

详细的设计规范保存在 `docs/` 目录：

| 文档 | 说明 |
|------|------|
| `specs/2026-05-22-pvz-game-design.md` | 游戏设计文档 (GDD) |
| `specs/2026-05-28-english-learning-design.md` | 英语学习功能设计 |
| `plans/2026-05-22-pvz-implementation.md` | 游戏实现计划 |
| `plans/2026-05-28-english-learning-implementation.md` | 英语学习实现计划 |

## 游戏操作

| 操作 | 说明 |
|------|------|
| 点击植物卡片 | 选中该植物，播放英语 |
| 点击草坪格子 | 种植选中的植物 |
| ESC / 右键 | 取消选择 |
| 点击阳光 | 收集阳光 |

## 数值平衡

### 资源

| 资源 | 数值 |
|------|------|
| 初始阳光 | 150 |
| 天空掉落 | 每 10 秒 +25 |
| 向日葵产出 | 每 5 秒 15~35 |
| 阳光消失时间 | 8 秒 |

### 植物

| 植物 | 成本 | HP | 攻击/产阳光 |
|------|------|-----|------------|
| 豌豆射手 | 100 | 100 | 20 伤害 / 1.5秒 |
| 向日葵 | 50 | 100 | 25±10 阳光 / 5秒 |
| 坚果墙 | 50 | 400 | 阻挡 |
| 樱桃炸弹 | 150 | 100 | 消灭整行僵尸 |

### 僵尸

| 僵尸 | HP | 速度 | 攻击 |
|------|-----|------|------|
| 普通僵尸 | 100 | 33.33 像素/秒 | 20 / 秒 |
| 旗帜僵尸 | 200 | 33.33 像素/秒 | 20 / 秒 |

### 波次

| 波次 | 延迟 | 数量 | 间隔 |
|------|------|------|------|
| 第1波 | 20秒 | 6只 | 2.5秒 |
| 第2波 | 30秒 | 10只 | 1.8秒 |
| 第3波 | 30秒 | 18只 | 1秒 |

## 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v5.29.1 | 2026-05-30 | 优化移动端语音，加厚弹窗位置 |
| v5.28.9 | 2026-05-28 | 修复植物卡片和语音问题 |
| v5.28.3 | 2026-05-28 | 可爱版僵尸图片 |
| v5.27.1 | 2026-05-27 | Vue+Phaser混合架构 |
| v1.0 | 2026-05-22 | 初始版本 |

## 技术栈

- **游戏引擎**: Phaser 3.60+
- **UI框架**: Vue 3.4+
- **语言**: TypeScript 5.3
- **构建工具**: Vite 5.0
- **测试框架**: Vitest 4.1
- **渲染**: HTML5 Canvas

## 下一步开发计划

### 短期
- [ ] 添加寒冰射手（减速僵尸）
- [ ] 添加路障僵尸
- [ ] 完善游戏结束画面 UI

### 中期
- [ ] 添加墓碑障碍物
- [ ] 添加小推车道具
- [ ] 添加游戏暂停功能

### 长期
- [ ] 更多植物类型
- [ ] 更多僵尸类型
- [ ] 背景音乐与音效系统

## License

MIT