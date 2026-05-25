# PVZ 儿童版 - 美术与交互规范 (STYLE_GUIDE)

> 本规范定义了面向 6 岁非英语母语儿童的游戏视觉风格与交互标准。

---

## 1. 目标用户与设计原则

**目标用户**
- 年龄：6 岁儿童
- 语言背景：非英语母语
- 设计目标：友好、鼓励探索的学习体验

**设计原则**
- 界面元素清晰、色彩鲜明，便于儿童识别
- 操作简单直接，减少认知负担
- 正向激励为主，避免失败惩罚感过重
- 英语学习自然融入游戏机制

---

## 2. 配色方案

| 用途 | 颜色名称 | Hex 值 |
|------|---------|--------|
| 天空背景 | Sky Blue | `#87CEEB` |
| 草地 | Grass Green | `#7CFC00` |
| 植物主色 | Plant Green | `#32CD32` |
| 阳光/货币 | Sun Gold | `#FFD700` |
| 僵尸 | Zombie Purple | `#B0A4C8` |
| UI 卡片背景 | Card White | `#FFF8E7` |
| 文字 | Text Brown | `#4A3B2C` |

**使用规范**
- 以上颜色为标准色，所有新 UI 元素必须使用此色板
- 状态变化时可使用透明度或亮度调整，不改变色相
- 危险/警告使用红色 `#FF6B6B`，成功使用绿色 `#4CAF50`

---

## 3. 字体规范

**英文字体**
- 首选字体：`Fredoka One`（Google Font）
- 回退字体：`Comic Sans MS`, ` cursive`

**中文字体**
- 使用系统默认字体（不强制指定）
- 建议：`Microsoft YaHei`, `PingFang SC`, `SimHei`

**字号标准**
| 元素 | 最小字号 |
|------|---------|
| 正文/按钮 | 18px |
| 标题 | 24px |
| 英文单词卡片 | 20px |
| 英语名字（小字） | 12px |

**行高**
- 正文：1.4
- 标题：1.2

---

## 4. 形状规范

**圆角**
- 所有卡片、按钮、对话框：`border-radius: 8px`
- 输入框：`border-radius: 4px`
- 头像/图标：`border-radius: 50%`

**实体描边**
- 植物、僵尸等游戏实体：`border: 2px solid #3A3A3A`
- 描边位于 sprite 边缘，增加可识别度

**间距**
- UI 内边距：12px
- 元素间距：8px
- 大区块间距：16px

---

## 5. 阴影规范

**UI 元素阴影**
```css
box-shadow: 2px 2px 4px rgba(0, 0, 0, 0.15);
```

**卡片悬浮状态**
```css
box-shadow: 4px 4px 8px rgba(0, 0, 0, 0.2);
transform: translateY(-2px);
```

**对话框/弹窗**
```css
box-shadow: 4px 4px 16px rgba(0, 0, 0, 0.25);
```

---

## 6. 动画原则

**缓动函数**
- 默认使用 `ease-in-out`
- 弹性效果使用 `cubic-bezier(0.68, -0.55, 0.265, 1.55)`

**动画类型与时长**
| 动画类型 | 时长 | 效果 |
|---------|------|------|
| 按钮点击 | 100ms | scale(0.95) |
| 元素出现 | 300ms | fadeIn + bounce |
| 元素消失 | 200ms | fadeOut |
| 收集反馈 | 400ms | scaleUp + fadeOut |
| 植物攻击 | 200ms | 轻微抖动 |
| 僵尸行走 | 持续 | 左右微摇 |

**禁止事项**
- 禁止突然闪现（无过渡效果）
- 禁止高频闪烁动画（可能诱发光敏性疾病）
- 禁止超过 1 秒的加载动画

---

## 7. 英语学习集成

### 7.1 植物卡片
- 显示中文名 + 英文名
- 格式：`豌豆射手 Peashooter`
- 英文部分使用 Fredoka One 字体

### 7.2 僵尸显示
- 僵尸头顶显示英语名字（小字 12px）
- 格式：`Zombie` / `Flag Zombie`
- 位置：僵尸 sprite 正上方 10px

### 7.3 阳光收集反馈
- 收集时弹出文字：`+25 SUN`
- 使用 Fredoka One 字体
- 金黄色 `#FFD700`，带轻微放大动画

### 7.4 关键事件短语

| 事件 | 显示短语 | 语音 |
|------|---------|------|
| 游戏开始 | "Let's Plant!" | "Let's plant!" |
| 波次开始 | "Here they come!" | "Here they come!" |
| 胜利 | "You Won!" | "You won!" |
| 失败 | "Try Again!" | "Try again!" |
| 收集阳光 | "+25 SUN" | （无语音） |

### 7.5 语音接口（Web Speech API）

**实现位置**：音效系统 `src/systems/AudioManager.ts`

**接口定义**：
```typescript
interface SpeechManager {
  speak(text: string): void;  // 触发语音
  isAvailable(): boolean;      // 检测浏览器支持
}
```

**使用示例**：
```typescript
const utterance = new SpeechSynthesisUtterance(text);
utterance.lang = 'en-US';
utterance.rate = 0.85;  // 慢速，便于儿童理解
speechSynthesis.speak(utterance);
```

---

## 8. 交互规范

**最小触摸区域**
- 所有可点击元素：`48px × 48px`
- 植物卡片：60px × 45px
- 阳光精灵：50px × 50px

**触摸反馈**
- 按下：元素缩小至 95%
- 释放：元素恢复 + 高亮边框
- 延迟反馈（无延迟，必须即时）

**儿童友好设计**
- 不使用右键菜单
- 误操作后 2 秒内可撤销
- 失败后立即显示"再试一次"按钮
- 不显示复杂数值（HP 用血条图形代替数字）

---

## 9. 图标与图片

**图片格式**：PNG with transparency

**命名规范**
- 小写 + 下划线：`peashooter_001.png`
- 植物：`{plant_type}_{index}.png`
- 僵尸：`zombie_{type}_{index}.png`

**图片尺寸**
- 植物：512×512（缩放至 48×48 显示）
- 僵尸：512×512（缩放至 48×56 显示）
- 图标：256×256

---

## 10. 审核检查清单

新增/修改 UI 元素时，确认以下所有项：

- [ ] 颜色使用规范色板
- [ ] 字号不小于 18px
- [ ] 圆角为 8px
- [ ] 包含 `box-shadow`
- [ ] 使用 `ease-in-out` 缓动
- [ ] 可点击区域 ≥ 48×48px
- [ ] 植物显示中英双语
- [ ] 僵尸显示英语名字
- [ ] 阳光收集显示 `+25 SUN`
- [ ] 无突然闪现的动画
- [ ] 无高频闪烁

---

*本规范为项目宪法，所有 UI 相关改动必须遵循。*
*最后更新：2026-05-25*