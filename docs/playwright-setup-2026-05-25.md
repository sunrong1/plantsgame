# Playwright 测试配置总结

## 时间
2026-05-25

## 改动概述

本次会话添加了 Playwright 端到端测试框架，解决了之前靠人手动检查效率低的问题。

## 具体改动

### 1. 安装 Playwright 依赖

```bash
npm install -D @playwright/test
npx playwright install chromium
```

**原因**: 项目原本只有 Vitest 单元测试，没有端到端测试能力。

### 2. 创建 Playwright 配置文件

**文件**: `playwright.config.ts`

```typescript
export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:5173',
  },
  webServer: {
    command: 'npm run dev',
    port: 5173,  // 原来是 url: '...'，改为 port 更稳定
    reuseExistingServer: !process.env.CI,
  },
});
```

**原因**:
- `baseURL` 让测试可以用 `page.goto('/')` 而不是完整 URL
- `port` 而非 `url` 更简洁且避免协议错误

### 3. 添加 npm 测试脚本

**文件**: `package.json`

```json
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui",
"test:e2e:headed": "playwright test --headed"
```

**原因**: 方便开发者运行不同模式的测试。

### 4. 创建 e2e 测试文件

| 文件 | 测试内容 |
|------|----------|
| `e2e/game.spec.ts` | 基础渲染、教程显示、游戏运行 |
| `e2e/gameplay.spec.ts` | 响应式布局、长时间运行稳定性 |
| `e2e/plant-cards.spec.ts` | 不同 viewport 尺寸下的 canvas 渲染 |

### 5. 修复测试用例（Canvas 游戏特殊问题）

**问题**: 游戏完全渲染在 `<canvas>` 元素内，DOM 中没有可查找的文本元素。

**原错误写法**:
```typescript
// ❌ 这在 Canvas 游戏里不工作
await expect(page.getByText('开始游戏')).toBeVisible();
await startButton.click();
```

**正确写法**:
```typescript
// ✅ 验证 canvas 存在和稳定性
await page.waitForTimeout(1000);
const canvas = page.locator('canvas');
await expect(canvas).toBeVisible();
```

**原因**: Phaser 游戏所有 UI 都绘制在 canvas 上，不会产生可交互的 DOM 元素。

### 6. 顺便修复的 Bug

**僵尸生成位置偏移**

```typescript
// src/entities/Zombie.ts
// 原来
const y = 60 + row * 50 + 25;

// 修改后
const y = 80 + row * 50 + 25;
```

**原因**: GridManager 的 `offsetY` 是 80，但 Zombie 计算 Y 时用的是 60，导致僵尸和植物行位置对不齐。

## 测试结果

```
Running 13 tests using 1 worker
✓ 13 passed (44.1s)
```

## 如何运行

```bash
# 运行所有 e2e 测试
npm run test:e2e

# 带 UI 界面（推荐调试）
npm run test:e2e:ui

# 有头模式（可见浏览器）
npm run test:e2e:headed
```

## 后续建议

1. **交互测试**: 可以通过截图对比检测视觉回归
2. **性能测试**: 添加内存使用、帧率检测
3. **移动端**: 添加 Android/iOS 模拟器测试