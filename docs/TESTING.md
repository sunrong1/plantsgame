# 测试体系

> 三级测试体系，按速度与覆盖面分层。

## 测试分级

| 级别 | 工具 | 触发时机 | 覆盖范围 | 速度 |
|------|------|----------|----------|------|
| **@fast** | Vitest | PR / 本地每次保存 | 单元测试（config、entities） | ~700ms |
| **@medium** | Playwright | PR / 本地提交前 | 跨设备功能测试 | ~3 min |
| **@slow** | Playwright | Nightly / 手动 | 视觉回归（截图对比） | ~5 min |

**@medium vs @slow 的区别**：两者都用 Playwright 跑，唯一区别是 @slow 跑 `toHaveScreenshot`，需要稳定的渲染状态和基线文件。

## 命令一览

```bash
# @fast
npm test                      # 单元测试
npm run test:watch            # 监听模式

# @medium（功能测试，三个视口都跑）
npm run test:cross-device
npm run test:cross-device:medium   # 只跑 @medium

# @slow（视觉回归）
npm run test:cross-device:slow
npm run test:cross-device:update-snapshots  # 刷新基线

# 调试
npm run test:e2e:ui           # Playwright UI 模式
npm run test:e2e:headed       # 有头浏览器
```

## 跨设备测试

Playwright 配置了三个 project（`playwright.config.ts`）：

| Project | 视口 | 模拟设备 |
|---------|------|----------|
| `huawei-mate-50` | 393×851 | 华为 Mate 50 竖屏 + touch |
| `huawei-tablet` | 768×1024 | 华为 11.5" 平板竖屏 + touch |
| `desktop-hd` | 1920×1080 | 桌面 |

**关键约束**：跨设备 spec 只在这三个 project 跑（`testMatch: /cross-device/.*\.spec\.ts/`），原有 e2e spec 继续在默认 chromium 上跑。

## 文件结构

```
e2e/
├── (原有 e2e，default chromium)
│   ├── game.spec.ts
│   ├── gameplay.spec.ts
│   ├── plant-cards.spec.ts
│   └── ui-alignment.spec.ts
└── cross-device/                          # 跨设备测试
    ├── helpers.ts                        # 共享工具
    ├── integration.spec.ts               # @medium
    ├── visual-regression.spec.ts         # @slow
    └── visual-regression.spec.ts-snapshots/  # 视觉基线（自动生成）
```

## 视觉基线管理

基线文件存放在 `e2e/cross-device/visual-regression.spec.ts-snapshots/<project-name>/` 下，按 project 命名：

```
canvas-huawei-mate-50.png
canvas-huawei-tablet.png
canvas-desktop-hd.png
```

**何时需要刷新基线**：
- 主动改动 UI（资源栏、网格、卡片样式）
- 修改 Game canvas 渲染（Phaser sprite 替换）
- 字体或 CSS 变量变更

**刷新方法**：

```bash
# 1. 确认改动是有意的
git diff e2e/cross-device/

# 2. 跑一遍更新基线
npm run test:cross-device:update-snapshots

# 3. 检查新基线
git status   # 应该有更新后的 .png 文件
git diff e2e/cross-device/visual-regression.spec.ts-snapshots/

# 4. commit
git add e2e/cross-device/
git commit -m "test: refresh visual baselines for <理由>"
```

**意外回归**：如果只是想跑测试但发现大量 diff，先检查是不是字体加载、动画、随机元素（阳光位置）造成。视觉基线对随机性很敏感，必要时：
- 在测试前 `await page.waitForTimeout(N)` 等待动画稳定
- 用 `maxDiffPixelRatio` 容忍小差异（默认 0.02 = 2%）

## 添加新测试

| 场景 | 位置 |
|------|------|
| 单元测试（纯函数、配置） | `src/**/__tests__/*.test.ts` 或 `*.test.ts`（与源文件同目录） |
| E2E 通用 | `e2e/*.spec.ts` |
| 跨设备 | `e2e/cross-device/*.spec.ts`，在 describe 名加 `@medium` 或 `@slow` |

跨设备 spec 模板：

```typescript
import { test, expect } from '@playwright/test';
import { waitForGameReady } from './helpers';

test.describe('@medium my feature', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
  });

  test('does the thing', async ({ page }) => {
    // ...
  });
});
```

## CI 集成

GitHub Actions（`.github/workflows/deploy.yml`）应在 deploy 之前跑：
- `npm test`（@fast）
- `npm run test:cross-device:medium`（@medium）

@slow 仅在 nightly workflow 跑，避免拖慢 PR 反馈。
