---
title: 'Game Architecture'
project: 'plants-game'
date: '2026-10-12'
author: 'sunrong'
version: '1.0'
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8, 9]
status: 'complete'
engine: 'none — Vue 3.5 + Vite 8 + TypeScript (no game engine)'
platform: '华为 Android 平板浏览器（竖屏）'

# Source Documents
gdd: '_bmad-output/planning-artifacts/gdds/gdd-plants-game-2026-10-11/gdd.md'
epics: '_bmad-output/planning-artifacts/epics.md'   # 正式版（[CE] 已完成）；epics-draft.md 是 GDD 阶段的草案
brief: null
---

# Game Architecture

## Executive Summary

PVZ Pixel 是一款**回合制**塔防（每回合结算，非实时），面向华为 Android 平板浏览器。

**核心架构判断：不使用游戏引擎。** 本作无实时循环、无物理、无网络，游戏引擎 90% 的能力用不上。战场以 DOM + CSS 呈现（文字承载学习内容，DOM 的字体渲染直接影响认读质量），技术栈为 Vue 3.5 + Vite 8 + TypeScript strict。

**核心约束：纯逻辑层零 DOM、零 Vue，由 `tsconfig` 的 `lib` 在类型层面强制。** 战斗与回合逻辑是纯函数 reducer，其收益贯穿全局：同一串 action 可重放出一模一样的一局（平衡回归测试）、存档即序列化 state（断点续学无需重建逻辑）、平衡模拟直接 import 真实实现（消除数值双份漂移）、家长口述的 bug 可导出为可复现的 action 序列。

### 关键决策速览

| # | 决策 | 一句话理由 |
|---|---|---|
| 1 | **不使用游戏引擎** | 实时循环、物理、网络 —— 本作一个都不需要 |
| 2 | **范围塔 = 同行 3 格** | 僵尸全在第 3 行；圆形 vs 同行的实质差别只有横向格数，5 格严重超模 |
| 3 | **纯 reducer 状态管理** | 可序列化、可重放 —— 存档、平衡测试、bug 复现三者共用同一机制 |
| 4 | **Phase 是 State 的一部分** | 回合含两处无限等待；不入 State 则存档与合法性校验都无从谈起 |
| 5 | **进度与对局是两套独立持久化** | 战场每局清空，进度只增不减 —— 生命周期不同 |
| 6 | **JSON + Zod 内容校验** | 教材内容是录入工作不是编程工作 |
| 7 | **HTTPS 静态托管** | Service Worker 仅在安全上下文注册；局域网部署会让离线化静默失效 |
| 8 | **错误分层：逻辑层 throw，运行时静默降级** | 孩子面前永不出现技术错误；但逻辑不变量必须抛出来 |
| 9 | **平衡模拟重写为 TS** | Python 与 TS 两份数值必然漂移 —— 「三次手算错误」的根因换个位置复发 |

## Document Status

**状态：** 已完成 —— GDS Architecture Workflow 全部 9 步

**下一步：** `[CE]` gds-create-epics-and-stories（输入本文档 + GDD）

---

## Project Context

### Game Overview

**PVZ Pixel** — 以英语听辨为核心机制的塔防游戏。听不懂就没有塔，战线失守。学习直接决定孩子能做什么。

### Technical Scope

**平台:** 华为 Android 平板（浏览器，竖屏）
**类型:** 回合制塔防（**非实时**）
**项目复杂度:** 技术低 / 内容高

### Core Gameplay 的架构含义

**关键判断：本作为回合制，非实时游戏。**

所有时序以「回合」为单位 —— 塔每回合攻击一次、僵尸每回合跳 2 格、射程内每回合命中一次。无连续移动、无物理、无碰撞检测、无网络同步。

⇒ 架构应按 **确定性状态机 + 渲染层** 设计，而非实时游戏循环。

⇒ 核心战斗逻辑应可脱离浏览器运行（纯 TS、无 DOM 依赖），使数值与时序能被自动化测试覆盖 —— 这直接服务于「GDD 中所有回合/时序推导必须经模拟实测，不得手算」的既定教训（决策日志记录的三次手算错误）。

### Core Systems

| 系统 | 复杂度 | GDD 依据 |
|---|---|---|
| TTS / 音频 | **高** | Art and Audio Direction；支柱 1 唯一入口 |
| 内容数据流水线 | **高** | Asset Requirements；Epic 2 主体 |
| 回合状态机 | **高** | Core Gameplay Loop |
| 战斗结算 | 中 | Tower Defense Specific Elements |
| 存档 / 断点续学 | 中 | Level Design Framework（硬需求） |
| 资源加载 | 中 | Performance Requirements |
| 射程可视化 | 中 | Path and Placement Strategy |
| 进度 / 关卡 | 低 | Player Progression |

### Technical Requirements

| 项 | 指标 |
|---|---|
| 帧率 | 60 FPS（场景极小，压力主要在图片加载而非渲染） |
| 冷启动 | ≤ 3s（首屏可交互） |
| 单元切换 | ≤ 2s（词图已缓存时 ≤ 0.5s） |
| TTS 起声 | ≤ 500ms |
| 答题反馈 | ≤ 100ms |
| 内存 | 连续 30 分钟无明显增长 |

### 需架构裁决的设计歧义

1. **范围塔口径** —— 「射程 2 格（圆形半径）」与「攻击同行 3 格」两种表述并存。半径 2 的圆在同一行横跨 5 格，不是 3 格。须在本文档中统一裁决。（决策日志遗留项 1）

### Complexity Drivers

**高复杂度:**
- TTS / 音频链路 —— 手势解锁、长句发音、英美音色、语音浮层遮挡，四个已知坑
- 内容数据流水线 —— 200-400 词 × 卡型 × 塔绑定 × 词图，须支持非程序批量录入与校验
- 回合状态机 —— 答题 → 结算 → 建造 → 攻击 → 推进 → 重考，状态边界必须清晰

**新颖概念（无标准模式可循）:**
- 答错即「无人阻拦的僵尸」—— 学习结果直接物化为战场实体，学习层与战斗层通过战场状态耦合
- 射程必须实时可见 —— 不可见会造成 6 岁半无法自解的挫败；这既是 UI 需求也是设计约束

**无复杂度:**
- 实时渲染、物理、网络同步、AI 寻路 —— 本作均不需要

### Technical Risks

| 风险 | 等级 | 应对 |
|---|---|---|
| 词图产能 200-400 张 | **P0（项目级）** | 架构须让内容可增量录入，单单元跑通不阻塞后续 |
| 教材长句 TTS 清晰度 | P1 | Epic 1 验证；降级方案为预置录音 |
| Android 音频手势解锁 | P1 | 「开始游戏」按钮承担解锁职责，不可异步补做 |
| 语音浮层遮挡战场 | P1 | 布局须预留安全区 |
| 减速/范围塔与重考回合未被模拟覆盖 | P2 | 架构须保证战斗逻辑可自动化测试 |

---

## Engine & Framework

### 技术栈（2026-10-12 核实版本）

| 层 | 选择 | 版本 | 说明 |
|---|---|---|---|
| UI 框架 | Vue | 3.5.x（3.5.43） | 3.6 仍是 RC（Vapor Mode），不采用 |
| 构建 | Vite | 8.x | Rolldown 自 2026-03-12 起为默认打包器 |
| 测试 | Vitest | 5.x（5.0.3） | 需 Node ≥ 22.12；本机 Node v26.8.2 ✅ |
| 语言 | TypeScript | `strict: true` | |
| 渲染 | **DOM + CSS**（无游戏引擎） | — | |

### 选型理由

**核心判断：本作非实时、无物理、无网络，不需要游戏引擎。**

引擎 90% 的价值（主循环、补间、物理、碰撞、相机、输入抽象）在本项目中无一适用 —— 5×9 网格 + 十余单位，回合驱动，无连续运动。

选择 DOM 而非 Canvas 的三个具体理由：

1. **文字是学习内容本身。** 题面、选项、关键词均为英文，DOM 的字体渲染与文本布局（换行、字号自适应、无障碍）直接影响孩子能否读清。Canvas 需自行用 `Text`/`BitmapText` 复刻。
2. **布局需求 > 渲染需求。** 竖屏自适应、高分辨率竖屏下资源栏与战场间距（GDD 已记录的旧版痛点）是纯 CSS 问题。
3. **动效无需补间引擎。** 本作动效为「状态变化 → 加 class → CSS transition」，不存在需要逐帧编排的复杂动画。

### 已评估并否决的替代方案

| 方案 | 否决理由 |
|---|---|
| **Phaser 4.2.1** | Phaser 3 已于 2025-05 停止支持（3.90.0 为末版）。v4 重写整个 pipeline、Canvas 渲染器废弃、仅发布 4 个月仍在变动。旧项目虽用 Phaser 3，但 CLAUDE.md 已定为参考非蓝本 |
| **PixiJS 8.22** | 官方定位「渲染器 + 场景图，无输入抽象、无物理、无主循环」—— 主循环正是本项目不需要的。文字需自行管理（影响认读质量），响应式布局需自建 |
| **Unity / Godot / Unreal** | 3D 引擎，与 2D 网格游戏不匹配；导出链与浏览器直出需求冲突 |

### 框架提供 vs 需自行决策

> **✅ `[IR]` 2026-10-12：下表全部条目已决策，右侧标出决策编号。**
> 原表把 6 项标为「需决策」而其中 5 项早已在决策表中落定 —— 清单与实际状态不一致，
> 会让 `[DS]` 误以为这些点仍未想清楚。

| 组件 | 由谁解决 |
|---|---|
| 响应式状态、组件化、模板渲染 | Vue |
| 开发服务器、HMR、打包 | Vite |
| 单元测试运行器 | Vitest |
| 动效 | **决策 9** —— CSS transition，禁止 JS 补间库 |
| 音频解锁与播放 | **决策 4** —— Web Audio API，「开始游戏」内同步解锁 |
| TTS 朗读 | **决策 7** —— Web Speech API + 预录录音降级 |
| 网格布局与坐标映射 | **决策 10** —— CSS Grid + `aspect-ratio: 1/1` + 安全区 |
| 回合状态机 | **决策 2** —— 纯 reducer，不引状态库（核心，见下） |
| 存档 | **决策 5** —— localStorage 序列化整个 state |

### 关键架构约束：逻辑与视图分离

**核心战斗与回合逻辑必须是纯 TypeScript 模块，零 DOM、零 Vue 依赖。**

理由（三条，均指向决策日志已记录的教训）：

1. 决策日志记录了**三次因「手算未验证」导致的错误**（阳光孤儿机制、模拟器两个 bug、射程窗口）。GDD 已定规：「所有涉及回合/时序的推导，必须经模拟实测，不得手算。」⇒ 逻辑必须可被模拟脚本与 Vitest 直接调用。
2. 决策日志遗留项：减速塔、范围塔、重考回合**未被模拟覆盖**。纯逻辑层让补测成为一步之遥。
3. Vue 组件只负责把状态渲染成 DOM 并转发事件；**任何组件内不得出现战斗规则计算**。

### 剩余待决策项（详见 Step 4）

> **✅ `[IR]` 2026-10-12：本清单已全部闭合，不再是待决策项。**
> 保留原列表作为决策可追溯性记录，右侧标出落点。

- 动效实现规范 → **决策 9**
- 音频解锁方案与 `AudioContext` 生命周期 → **决策 4**
- TTS 音色选择与 fallback 策略 → **决策 7**
- 内容数据格式与录入校验 → **决策 3**
- 存档格式与断点续学粒度 → **决策 5**
- **范围塔口径裁决**（决策日志遗留项 1）→ **决策 1**
- 是否 PWA 离线化（平板可能无网）→ **决策 8**
- 词图加载策略（400 张图如何满足冷启动 ≤ 3s）→ **决策 6**
- **网格布局与坐标映射** → **决策 10**（`[IR]` MEDIUM-4 补入。
  此前它被列在「需决策」表里，却既不在决策表也不在决策正文 —— 是唯一一处「说了要决策但没人决策」的技术项）

---

## Architectural Decisions

### Decision Summary

| # | 类别 | 决策 | 理由 |
|---|---|---|---|
| 1 | 战斗规则 | **范围塔 = 同行 3 格** | 僵尸全在第 3 行 ⇒ 圆形与同行实为同一问题，只差横向格数 |
| 2 | 状态管理 | **纯 reducer（不引状态库）** | 可序列化、可重放 ⇒ 平衡测试与存档的基础 |
| 3 | 内容数据 | **JSON + Zod schema + 校验脚本** | 录入是数据工作不是编程工作；校验提前暴露内容错误 |
| 4 | 音频 | **「开始游戏」内同步完成全部解锁** | 手势上下文不可跨 `await` |
| 5 | 存档 | **序列化整个 state** | 「精确恢复到上一题」无需任何重建逻辑 |
| 6 | 资源加载 | **按单元预取** | 战斗中零加载停顿，保住 ≤100ms 反馈预算 |
| 7 | TTS | **探测 + 预录录音降级** | TTS 是支柱 1 唯一入口，须有非 TTS 通路 |
| 8 | 部署 | **HTTPS 静态托管 + PWA 离线化** | SW 仅在安全上下文注册；平板可能无网 |
| 9 | 动效 | **CSS transition，禁止 JS 补间库** | 动效离散，无需时间轴编排 |
| 10 | 网格布局 | **CSS Grid + `aspect-ratio: 1/1` 保格子正方形 + 安全区预留** | `[IR]` MEDIUM-4 补入，见下 §10 |
| 11 | 样式 token | **色板 / 字号阶梯 / 间距 / `--touch-min: 48px` / 动效时长五组 CSS 变量** | `[IR]` L12 + MEDIUM-5 补入 —— 目录声明了 token 却无清单；48px 同时关闭 L11 |

### 1. 范围塔口径裁决

**GDD 遗留歧义的裁决：**「射程 2 格（圆形半径）」与「攻击同行 3 格」并存，且半径 2 的圆在同行实跨 5 格。

**根因：僵尸固定在第 3 行**，因此范围塔的攻击形状无论写成圆还是同行，实际能命中的都只有第 3 行。真正待决的只有横向覆盖格数：

| 方案 | 每回合伤害 | 造价 | 结论 |
|---|---|---|---|
| 半径 2 的圆（字面执行 GDD） | 60 × 5 = **300** | 75 | **超模，否决**。造价形同虚设 |
| **同行 3 格（采纳）** | 60 × 3 = **180** | 75 | 3.6 倍伤害换 1.5 倍造价 |
| 同行 3 格不含自身列 | 60 × 2 = 120 | 75 | 削弱过度，接近直射塔 2 倍 |

**定案定义：**

```
范围塔攻击范围 = 以塔所在列为中心，沿僵尸所在行（固定第 3 行）
                 的 [列-1, 列, 列+1] 共 3 格
```

塔自身格不可能有僵尸，纳入仅为视觉连续与可理解性。

**平衡论证（为何此形状反而强化了 GDD 的定位）：** 单只僵尸时，范围塔 60 伤害 < 直射塔 2×50=100，且造价 75 > 50 —— **严格劣于直射塔**。只有当僵尸堆积时才因覆盖 3 格而胜出。这精确实现了 GDD「后期清场，贵」的定位，且避免了「买来就赢」的退化策略。

**射程可视化（两套形状必须都能画）：**
- **放置覆盖**：半径 3 的圆（与直射塔一致）
- **实际伤害**：横向 3 格条带

### 2. 状态管理

**方案：纯 reducer，不引状态管理库。**

```ts
// 纯逻辑层：零 DOM、零 Vue 依赖
type State = { /* 完整可序列化游戏状态 */ }
type Action = { /* 可辨识联合类型 */ }
function reduce(state: State, action: Action): State  // 纯函数

// 视图层：唯一持有状态的地方
const state = ref<State>(initialState)
```

**规则：**
- `reduce` 必须是纯函数，无副作用、无随机、无时间依赖
- 回合内的一切变化必须经由 `Action`，**禁止在组件内直接改 state**
- Vue 组件只做两件事：把 state 渲染成 DOM、转发用户操作为 `Action`

**否决 Pinia / 单例 / ECS 的理由：**
- **Pinia** —— 状态与 Vue 耦合后逻辑层无法脱离浏览器测试，违背逻辑/视图分离，且平衡模拟脚本将无法编写
- **单例（旧项目做法）** —— 全局可变状态最难测，正是决策日志中「三次手算错误」的土壤
- **ECS** —— 为 45 格网格上的十余单位上 ECS 属过度设计

**红利：** 同一串 `Action` 必然重放出完全相同的一局 —— 这是平衡回归测试与 bug 复现的基础，直接服务于「GDD 中所有回合/时序推导必须经模拟实测，不得手算」这条既定规约。

### 3. 内容数据格式

**方案：JSON 内容文件 + Zod schema + 独立校验脚本。**

**理由：** 全年 16-20 单元 ×（词 / 关键词 / 句子 / 回应 / 卡型 / 词图路径 / 塔绑定）是**录入工作，不是编程工作**。TS 常量文件要求编译，非程序无法编辑，且漏字段编译期未必报错。

**校验脚本必须能在提交前抓出：**
- 词图文件缺失或命名不符
- 塔绑定指向不存在的塔型
- 选项中混入其他单元的词条
- 卡型与选项形态不符（单词卡选项应为图片引用，关键词/回应卡应为英文文本）
- 卡面 TTS 文本为空

**存储位置：**
```
src/content/
  units/
    unit-01.json
    unit-02.json
  schema.ts            ← Zod schema
  index.ts             ← 按单元导出 + 启动时校验
scripts/
  validate-content.ts  ← 独立校验脚本，可单独 npm run
public/assets/
  words/unit-01/<词条id>.svg
  towers/<塔型id>.svg
  zombies/<僵尸id>.svg
```

**图片不进入 JS bundle** —— JSON 体积小、压缩率高；400 张图必须作为独立文件按单元加载。

### 4. 音频解锁

**方案：「开始游戏」点击处理器内，同步完成全部解锁。**

```ts
function onStartGameClick() {
  // ① Web Audio 解锁 —— 同步，不可 await
  audioCtx.resume()
  // ② TTS 预热 —— 继承 legacy SpeechService.preheat()
  speakSilentWarmup()      // volume = 0 的空 utterance，等 onend/onerror
  // ③ BGM buffer 预解
  bgmBuffer = decodeBgmOnce()
}
```

**硬约束（写入文档并作为代码评审项）：**

1. **三者之间不允许任何 `await`** —— 一旦让出，手势上下文丢失，解锁静默失败。这正是旧项目踩过的坑，且失败方式是无声的。
2. **`speechSynthesis.cancel()` 只在 `speechSynthesis.speaking === true` 时调用。** 空闲时调用会破坏 Android 刚解锁的音频会话。（继承自 legacy `SpeechService.speak()` 注释，代码里看不到、只能靠读旧实现知道的踩坑知识）
3. `preheat()` 等待 `onend` / `onerror` 二者之一即可标记完成，不得无限等待。

### 5. 存档 / 断点续学

**方案：序列化整个 reducer state 至 localStorage。**

**理由：** GDD 硬需求「精确恢复到上次答到的那一题」。因为 state 本身就是可序列化的普通对象，断点续学**不需要任何特殊设计** —— 存档即 `JSON.stringify(state)`，恢复即读回还原。

**否决备选：** 只存「答对记录」会使恢复出的局面丢失心数、阳光、场上僵尸、已建塔，实际变成重新开局，与需求直接矛盾。

**写入时机：每个回合结束后写一次**（约 20-30 秒间隔）。足够密集以满足断点续学，又不至于每次点击都写。

**存档结构：**
```ts
{
  schemaVersion: 1,      // 未来结构变更时迁移的依据
  savedAt: number,
  progress: {            // 跨局持久，只增不减
    currentUnitIndex: number
    masteredWordIds: string[]   // 已答对的词，跨单元累计
  },
  currentGame: State | null     // 当前这一局；局末清空为 null
}
```

**⚠️ 进度与对局是两套生命周期不同的数据，不可合并。**

GDD 明确：一局结束**战场状态清空，不跨局保留**；而「第 3 单元 · 21/60」跨局累积且**只增不减**。

- 进度条读 `progress`
- 断点续学读 `currentGame`
- 若把进度字段混进 `GameState`，局末清空战场时会把「21/60」一起清掉

**须实现：** 读取时校验 `schemaVersion`，不匹配则安全降级（提示重新开始，不得崩溃）。

### 6. 词图加载策略

**方案：按单元预取。**

- 进入单元前，预取该单元全部图片（15-30 张）并等待完成
- 同时后台预取下一单元（不阻塞）
- 战斗中所有图片已在内存 ⇒ **零加载停顿**，保住「答题反馈 ≤100ms」预算

**否决备选：** 逐张懒加载会在翻卡面时才加载，直接击穿反馈预算；全量预载 400 张必超冷启动 3s。

**词图规格（架构层锁定，避免阻塞 Epic 2 的内容流水线）：**

| 项 | 定案 |
|---|---|
| 格式 | **SVG**（与 GDD「扁平矢量」一致；分辨率无关；单文件约 2-10KB） |
| 命名 | **文件名 = 词条 id**（`public/assets/words/unit-01/u1-dog.svg`）。**id 带单元前缀**（`u1-dog`、`u2-apple`）—— 录音目录 `audio/voice/` **不按单元分层**，id 不带前缀则不同单元的同名词会撞名，而撞名后果是某个词发错音（对学习类产品是静默的严重错误）。 |
| 画布 | 正方形，`viewBox` 统一 |
| 具体尺寸、是否透明底 | **Epic 1 定稿**（但「SVG + 命名 = 词条 id」现在锁定） |

### 7. 朗读通路：预生成录音为主，设备 TTS 为辅

**主通路：预生成录音** —— `public/assets/audio/voice/<词条id>.mp3`

| 项 | 值 |
|---|---|
| 生成方式 | 开发期批量调用 MiniMax TTS API |
| 模型 | `speech-2.8-hd` |
| 音色 | `English_LovelyGirl`（英式女童声） |
| 覆盖范围 | **全部单词 + 关键词 + 回应**（全量预生成，非仅长句） |
| 成本 | 一次性 ≈ ¥5 |

**为什么录音优先于设备 TTS：** 本作核心是英文单词的认读质量，而设备 TTS 是跨设备表现最不可控的一环。架构自己已记录反证：旧项目在华为设备上大概率走了 fallback（`gdd.md:519`）；EMUI + Chrome 上 `speechSynthesis` 可能报 0 voices（Story 1.2 §13）；**Android WebView 完全不支持原生 TTS**（chromium issue 710238）。

设备装了什么语音引擎就用什么音色 —— 发音因此不可复现，而这与架构自述的原则冲突：

> 音色选择以**教材录音**为准绳，而非以设备上有什么为准。（`epics.md` Story 3.4）

预生成录音把发音变成**产品的确定常量**，而非设备的偶然产物。

**辅通路：设备 `speechSynthesis`**

仅在录音文件缺失 / 加载失败时兜底。音色沿用 legacy 链降级：

```
Google UK English → Google US English → Microsoft Hazel/Susan
→ Samantha / Karen → 任意 en-US → 任意 en
```

**架构上不得假设任一音色存在。**

**朗读参数（辅通路的可配置常量，Epic 1 现场调）：**

| 类别 | 参数 | 来源 |
|---|---|---|
| 单词 | `rate 0.85 / pitch 1.05` | 沿用 legacy（针对儿童放缓） |
| 长句 | `rate 0.9`（起点） | legacy |

> 主通路的语速由**录音生成时**决定（speed 0.9），运行时不改音频文件。

**降级通路：**
- 降级须在架构层有固定位置（统一的 `playPronunciation(text)` 接口），**不是临时 if**
- 主备顺序：**录音 → 设备 TTS → 仅记 WARN**

**硬约束：朗读失败绝不阻断回合流转。** 支柱 1 的唯一入口不可用时，游戏仍须能进行 —— 架构上必须保证这一点，而不是依赖「任何一条通路一定可用」。

#### ⚠️ 两条不可协商的生成约束

1. **一次性全量生成，mp3 提交进 git，永不重新生成。**
   TTS API 无 `seed` / `temperature` 参数，不保证跨批次音色一致；且已观察到 `speech-01-*` 在 API 枚举中仍被接受、却已从模型列表消失 —— 模型下架或静默换权重会让分批生成的文件前后不一致。变更音色 = 200-400 个词全部重生成。
2. **生成必须用 `output_format: "hex"`，不得用 `"url"`。**
   `"url"` 返回的链接 **24 小时过期**，分批生成会在几天后静默拿到损坏文件。

### 8. PWA 离线化与部署

**方案：HTTPS 静态托管 + PWA 离线化。** Vite 插件 + `manifest.json`。

**理由：** 孩子的平板可能无网或处于飞行模式；黑屏是 6 岁半无法理解、家长也无法当场解决的失败模式。离线化把决策 6「按单元预取」从「这次玩得快」升级为「这次玩得成」。

**⚠️ 部署方式是离线化的前置条件，不是后续事项。**

Service Worker 仅在**安全上下文**（HTTPS 或 localhost）注册。三条路径的实际结果：

| 部署方式 | SW 能否工作 | 结论 |
|---|---|---|
| **HTTPS 静态托管** | ✅ | **采纳** |
| 局域网 IP（`http://192.168.x.x`） | ❌ 注册失败 | 离线化完全失效；开发机关机即不可玩 |
| 局域网 + 自签名证书 | ⚠️ 可行，但平板每次弹证书警告 | 需家长确认 |

**⇒ 部署目标定为 HTTPS 静态托管**（GitHub Pages / Cloudflare Pages 或自有服务器）。本项目无后端、内容量有限，免费额度足够。

**须一并处理的风险 —— 缓存版本管理：**
Service Worker 引入一个新的失败模式：改了代码但孩子平板上仍是旧版本。自用单用户、变更频率极低，成本可控，但须建立规则：

- 构建产物带内容哈希
- 激活新 SW 时提示「有新版本，下次启动生效」
- **不得在游戏进行中强制刷新**（会打断孩子正在玩的这一局）

### 9. 动效规范

**方案：CSS transition + Vue `<Transition>`，禁止引入 JS 补间库。**

**范式：「状态变化 → 切换 class → CSS 过渡」**，不编写逐帧动画。

**理由：** 本作动效均为离散事件反馈（答对上扬、答错下行、掉心碎裂、射程高亮、卡面选中），不需要时间轴编排或缓动函数库。

**须避免的模式：** 在 `watch` 里写 `setInterval`/rAF 逐帧改样式；把动画时长写进 TS 常量再驱动 JS。动画时长应写在 CSS 中。

### 10. 网格布局与坐标映射（`[IR]` MEDIUM-4 补入）

**方案：CSS Grid 显式行列，`aspect-ratio: 1/1` 保格子正方形，`env(safe-area-inset-*)` 预留浮层区。**

```css
.battle-grid {
  display: grid;
  grid-template-columns: repeat(9, 1fr);   /* 9 列 —— 与 core/grid.ts 的 COLS 常量同源 */
  gap: var(--space-grid-gap);
  padding-bottom: calc(var(--touch-min) + env(safe-area-inset-bottom, 0px));
  aspect-ratio: 9 / 5;                     /* 9 列 × 5 行，格子恒为正方形 */
}
.battle-cell { aspect-ratio: 1 / 1; }
```

**为什么不用绝对定位：** 5×9 = 45 个格子全部静态，且无重叠、无 z 轴动画。
绝对定位要自己算 45 个 `left/top`，换屏幕尺寸时全部重算 ——
CSS Grid 让布局完全由 CSS 负责，组件只负责把 `state` 映射成 `class`。

**为什么不用 canvas：** 决策 1 已定「范围塔 = 同行 3 格」，射程覆盖层是**大量半透明格子**。
canvas 每次射程变化都要重绘，且**文字渲染**会退回手工测量与换行 ——
本作的核心是英文单词的认读质量，DOM 的文字渲染是白送的。

**正方形为什么必须保证：** 塔与僵尸是像素画，**非正方形格子会拉伸像素**，
在「扁平矢量 + 像素风」之间必须二选一。架构已定 DOM 渲染，故以 `aspect-ratio` 保证格子为正方形。

**与 `core/grid.ts` 的关系（架构硬约束）：** 网格尺寸在 `core/` 中是常量
（`ROWS = 5` / `COLS = 9` / `ZOMBIE_ROW = 2`），**组件不得重定义**。
CSS 的 `repeat(9, 1fr)` 是硬编码的重复次数，但**取值必须与常量一致** ——
`[DS]` 实现 Story 1.3 时须加断言：读 `COLS` 生成 Grid 模板字符串，或在测试中比对。

**安全区：** 语音浮层（架构 §Cross-cutting）与底部手牌区各占一行，
战场 `padding-bottom` 至少让出一个触控目标高度（`--touch-min`，见 §11）。

### 11. `src/styles/` token 清单（L12 / MEDIUM-5 补入）

**架构目录声明了 `styles/`「全局样式与动效 token」，但从未列出清单 —— 承诺了一份不存在的产物。**
`[IR]` 补入最小集。**不求完备**（设计定稿后自然生长），但这几项必须有名字：

```css
:root {
  /* 色板 —— 由 Story 1.6 定稿写入 docs/art-direction.md（MEDIUM-5） */
  --color-bg: /* 草地底色 */;
  --color-path: /* 僵尸行走路径 */;
  --color-tower-shooter: --color-tower-slow: --color-tower-aoe:;
  --color-zombie:;
  --color-sun: --color-heart:;
  --color-correct: --color-wrong:;
  --color-overlay-range: /* 射程高亮，半透明 */;

  /* 字号阶梯 —— 认读质量依赖它，须足够大 */
  --text-question: --text-word-card: --text-hud:;

  /* 间距 */
  --space-grid-gap: --space-panel-pad:;

  /* 触控目标最小边长（= L11 的 px 数值来源） */
  --touch-min: 48px;

  /* 动效时长 —— 架构硬约束 5：时长写在 CSS，不写在 TS */
  --dur-fast: 120ms;   /* 答题反馈，须 ≤100ms 内可感知 */
  --dur-med: 240ms;
  --dur-slow: 400ms;
}
```

**`--touch-min: 48px` 同时关闭 L11。** GDD/FR77 只写「大于儿童手指可点范围」，不可机械验收；
48px 是 Android/W3C 无障碍触控目标的公认下限，儿童手指定义保守于此值。
**这不是拍脑袋的数** —— 它是行业下限，且明确写出后，`[CR]` 才有可判的标准。

### ⚠️ 显式约束：词图产能（架构层记录，CE 阶段须正面处理）

**架构已锁定 SVG 格式与命名规范，但这不会让产能问题消失 —— SVG 依然需要有人画。**

| 事实 | 数值 |
|---|---|
| 全年两册词量 | 200-400 词 |
| 所需插画 | **200-400 张，各不相同** ⚠️ 该图数基于未经核实的「全部词条都配图」假设；只有**单词卡**的词需要插画（关键词卡/回应卡的选项是文字）。真实数字由 Story 2.1 实测配图比例校准（`[IR]` MEDIUM-7） |
| 若平均 20 分钟/张 | **66-133 小时纯绘图**，不含返工 |
| 历史证据 | 旧版本历经 5 个大版本，`public/assets/` 仅积累 9 张图 |

**这是旧项目停滞的直接原因，且不会因本次重做而自动消失。**

GDD 已采用「逐步补」策略（每个单元做完再做下一个单元的图）作为缓解，但该策略只推迟投入，**不解决总产能**。

**⇒ `[CE]` 阶段必须正面处理，不得默认「Epic 2 就是把词图画完」。** 可考虑的杠杆：图片复用规则、程序化生成方案（与扁平矢量风格兼容）、缩小内容范围。此项为架构层记录，不在本次拍板范围。

---

## Cross-cutting Concerns

**压倒性原则：孩子面前永不出现技术错误。**

6 岁半看到报错即为死局 —— 没有重试、没有客服、没有说明书。以下每条规则都从这一原则推出。

### Error Handling

**三层策略，界限由「逻辑层 / 视图层」划定。**

| 层 | 策略 | 理由 |
|---|---|---|
| **纯逻辑层（`core/`）** | **必须 `throw`，禁止 catch** | 若 `reduce()` 吞掉不变量违反，数值会静默漂移且无人察觉。抛出来才被测试与模拟脚本逮住 |
| **内容加载层** | **启动时校验，失败即拒绝进入游戏** | 内容损坏是内容 bug。绝不能带着坏内容开局 —— 孩子会看到空卡面然后卡死 |
| **运行时（TTS / 图片 / 音频）** | **记录并静默降级，绝不阻断回合** | TTS 是支柱 1 唯一入口，但 TTS 挂了游戏仍须能玩 |

**边界断言放纯逻辑层，不放组件层。** 纯函数中的廉价 `assert` 天然覆盖所有调用路径；放在组件里则每个组件都得重复写且必然遗漏。

```ts
// core/ 纯逻辑层
function reduce(state: State, action: Action): State {
  switch (action.type) {
    case 'PLACE_TOWER': {
      assert(!state.grid[action.cell], `塔不能建在已占用格: ${action.cell}`)
      assert(state.sun >= cost, `阳光不足: ${state.sun} < ${cost}`)
      // ...
    }
  }
}
```

```ts
// services/ 运行时层 —— 同一项目内两种风格并存是有意的
function playPronunciation(text: string): void {
  if (!ttsAvailable) { void playFallbackRecording(text); return }  // 静默降级
  utterance.onerror = () => log.warn('tts failed', text)           // 记录，不抛
}
```

**必须断言的不变量（清单）：**
- 塔不可建在已占用格
- 阳光不可为负
- 僵尸血量 ∈ [0, 100]
- 场上僵尸仅存在于第 3 行
- 塔不因放置/建造阶段之外的原因出现或消失
- 手数 ≥ 0 且 ≤ 3

### Logging

**目的地：仅 console。本项目不设遥测（GDD 已定），不引入外部服务。**

| 级别 | 用途 |
|---|---|
| `ERROR` | 逻辑不变量被违反；内容校验失败 |
| `WARN` | 已处理的运行时失败（TTS / 图片 / 音频降级） |
| `INFO` | 回合转换；关卡开始/结束；存档写入 |
| `DEBUG` | 仅开发环境 |

**规则：**
- 每条日志带模块前缀：`[core]` `[tts]` `[save]` `[content]`
- **禁止在渲染路径打日志**
- `DEBUG` 级经 `import.meta.env.DEV` 门控

#### 会话回放导出（本项目的特殊需求）

**唯一的 bug 报告来源是家长口述「孩子说不对劲」** —— 没有 issue、没有 stack trace、没有复现步骤。纯 reducer 架构给出现成解法：**bug = 一串 `Action`。**

**规则：**
- 每回合记录一条：`[core] turn N  action=<T>  sun=<n>  hearts=<n>  zombies=<n>`
- 提供「导出会话」功能，输出 `{ initialState, actions[] }` JSON
- 复现 = 把该 JSON 喂进 reducer

**这使家长的一句话能转化为精确可复现的现场。** 成本极低（action 本来就要构造），价值极高。

### Configuration

| 类型 | 位置 | 说明 |
|---|---|---|
| 平衡数值 | `src/core/balance.ts` | GDD 首版数值集中于此。塔伤害/射程/造价、僵尸血量/速度、阳光速率 |
| TTS 参数（辅通路） | `src/services/pronunciation.ts` | `rate` / `pitch`，**Epic 1 现场调**的可配置常量 |
| 录音生成参数 | `scripts/gen-voice.ts`（Story 1-3） | `model` / `voice_id` / `speed`，**生成期常量**，改了要全量重生成 |
| 网格规格 | `src/core/grid.ts` | 5 行 × 9 列、僵尸行 = 第 3 行 |
| 调试开关 | `import.meta.env.DEV` + URL 参数 | 调试面板、网格覆盖层 |

**⚠️ 平衡模拟的单一事实源：模拟重写为 TypeScript。**

GDD 目录里曾有一个 Python 的 `balance-scan.py` 早期估算脚本。它**已删除**：平衡数值只存在于 TypeScript 的 `scripts/balance-sim.ts`（import 真实 `src/core/`）。**绝不允许再并存第二份数值来源** —— 决策日志记录的「三次手算错误」正是那个根因，换个位置也会重演。

**定案：模拟脚本重写为 TypeScript，直接 `import` 真实的 `core/` reducer。**

- 模拟跑的就是游戏真实实现，不是模型复刻
- 单一语言、单一事实源
- 决策 2 的「纯 reducer」红利在此第二次兑现
- 同时自然覆盖决策日志遗留项 2、3：**减速塔、范围塔、重考回合** —— 这三项目前未被任何模拟覆盖，重写时必须纳入

### 副作用模型（不引入事件总线）

**定案：无事件总线。** 纯 reducer 架构下事件总线是多余的 —— 副作用可从「action + 状态变化」直接推导。

```ts
// app/ 层 —— 唯一的状态变更入口，顺序固定且可测
function applyAction(action: Action): void {
  const prev = state.value
  const next = reduce(prev, action)
  runEffects(action, prev, next)   // 纯函数 → 返回副作用列表
  state.value = next
}
```

- `runEffects(action, prev, next)` 是**纯函数**，返回待执行的副作用（音效、动效、TTS、存档）
- ⇒ **音效触发逻辑本身也可被测试**
- 顺序确定，无魔法；避免了事件总线的顺序不确定性问题

**禁止：** 组件内 `watch` 状态变化后自行播音效 —— 这会造成同一事件被播多次，且无法测试。

### Debug Tools

| 工具 | 用途 | 门控 |
|---|---|---|
| **会话回放导出** | 家长描述问题后精确复现 | DEV + 调试面板 |
| **内容校验 CLI** | `npm run validate:content`，提交前必跑 | 无门控，CI/本地均可 |
| **跳到任意回合** | 无需重打 10 回合即可测试后段平衡 —— 重考回合正是模拟未覆盖的缺口 | DEV |
| **调试面板** | 无限心 / 无限阳光 / 直接通关 —— 验证后期经济与关卡设计 | DEV |
| **网格与射程覆盖层** | 肉眼核对射程判定，尤其范围塔的横向 3 格 | DEV + URL 参数 |

**规则：调试 UI 不得进入生产构建**（`import.meta.env.DEV` 门控，且不做成可路由到达的页面）。

---

## Project Structure

### Organization Pattern

**分层 + 按功能细分（hybrid）。** 层次划分以**架构边界**为首要目的，而非按文件类型归类。

### 边界的强制手段（类型层面）

**「纯逻辑层零 DOM、零 Vue」这条约束不靠文档自觉，靠工具链强制：**

```jsonc
// tsconfig.core.json
{ "compilerOptions": { "lib": ["ES2022"] } }   // ← 不含 DOM
```

⇒ `window`、`document`、`localStorage`、`speechSynthesis` 在 `core/` 中**不存在类型**，写了即编译报错。

配合 ESLint `no-restricted-imports` 禁止 `core/` import `vue`。

**⇒ 边界从「约定」变为「不可能违反」。** 这是对 BMAD 多 context 窗口工作流固有风险（AI 在新窗口忘记约定）的直接对冲。

### Directory Structure

```
plants-game/
├── src/
│   ├── core/                    ← 纯逻辑。零 DOM、零 Vue、独立 tsconfig
│   │   ├── types.ts             State / Action 类型定义
│   │   ├── reducer.ts           reduce(state, action) —— 唯一状态变更点
│   │   ├── actions.ts           Action 构造器（保证 type 字面量一致）
│   │   ├── balance.ts           平衡数值 —— 单一事实源
│   │   ├── grid.ts              5×9 规格、僵尸行常量、坐标换算
│   │   ├── combat.ts            射程判定 / 伤害结算 / 目标选择 / 减速刷新
│   │   ├── turn.ts              回合流程编排（攻击 → 推进 → 判定胜负）
│   │   ├── effects.ts           runEffects(action, prev, next) —— 纯函数
│   │   └── index.ts             barrel：唯一对外出口
│   │
│   ├── content/                 ← 内容 schema 与加载（无 DOM）
│   │   ├── schema.ts            Zod schema
│   │   ├── loader.ts            按单元加载
│   │   └── index.ts
│   │
│   ├── services/                ← 浏览器副作用（允许 DOM）
│   │   ├── audio.ts             AudioContext 解锁、BGM、音效
│   │   ├── pronunciation.ts     预生成录音主路 + 设备 TTS 降级
│   │   ├── save.ts              localStorage 序列化 / 恢复
│   │   └── asset-loader.ts      按单元预取图片
│   │
│   ├── app/                     ← Vue 绑定层
│   │   ├── store.ts             持有 state 的 ref + applyAction
│   │   ├── effects-runner.ts    执行 runEffects 的返回列表
│   │   └── router.ts
│   │
│   ├── components/              ← Vue 组件
│   │   ├── battle/              BattleField / Zombie / Tower / RangeOverlay
│   │   ├── quiz/                QuestionCard / OptionCard / AnswerFeedback
│   │   ├── hud/                 SunCounter / HeartRow / ProgressBar
│   │   └── debug/               DebugPanel / ReplayExporter
│   │
│   ├── views/                   ← StartView / LevelView
│   │                               ⚠️ 不建 UnitSelectView —— 无选关自由（见下方说明）
│   └── styles/                  ← 全局样式与动效 token
│
├── scripts/
│   ├── validate-content.ts      内容校验 CLI
│   └── balance-sim.ts           平衡模拟 —— import 真实 core/
│
├── src/content/units/           ← 教材内容 JSON（unit-01.json ...）
├── tests/                       ← 全部 Vitest 测试，按模块分文件
├── public/assets/
│   ├── words/unit-01/<词条id>.svg
│   ├── towers/<塔型id>.svg
│   ├── zombies/<僵尸id>.svg
│   └── audio/{music,sfx,voice}/
├── docs/                        ← 项目知识库
└── _bmad-output/                ← BMAD 产出物
```

> 命名说明（`[CR] 2026-10-14` 更正）：GDD 早期把平衡脚本混称为 `balance-sim.py` / `balance-scan.py` 两个名字，引用行号已随文档修订失效。**现行唯一名称为 `balance-sim.ts`**，命令 `npm run balance-sim`。

> **⚠️ `views/` 下没有 `UnitSelectView`，且不应新增。**
> GDD 明确规定「跨单元线性推进 —— 单一进度线，无多单元并行，**无选关自由**」
> （gdd.md:366，并列入 Out of Scope gdd.md:579）；epics 的 FR59 / OUT-OF-SCOPE-5
> 与 Story 1.15 的验收标准亦均要求无选关自由。
>
> 本行曾写作 `StartView / LevelView / UnitSelectView`，被 `[IR]` 评审判定为 HIGH-3：
> **架构正在制造它自己声明要防止的范围偏移。** 理由很直接 —— Story 1.1 要求按本目录结构
> 建立骨架，实现者照着写出一个 `UnitSelectView.vue` 是完全合理的行为，
> 而 epics 的 Out-of-Scope 核对表恰恰把「多单元并行 / 选关自由」列为**最易被违反**的项之一。
>
> 单元的推进由**存档中的 `progress.currentUnitIndex` 驱动**（见决策 5），
> 通关后自动进入下一单元，不需要也不应该有选择界面。
> 若将来确实需要选关，那是范围变更，须先改 GDD 与 epics，而不是先建目录。

### System Location Mapping

| 系统 | 位置 | 职责 |
|---|---|---|
| 回合状态机 | `core/turn.ts` | 回合流程编排 |
| 战斗结算 | `core/combat.ts` | 射程判定 / 伤害 / 目标选择 / 减速刷新 |
| 经济 | `core/reducer.ts` + `core/balance.ts` | 阳光与造价 |
| 卡型与题单 | `core/reducer.ts` | 答题判定、重考循环 |
| 内容 | `content/` | schema、加载、校验 |
| TTS / 音频 | `services/` | 解锁、降级、播放 |
| 存档 | `services/save.ts` | state 序列化 / 恢复 |
| 资源加载 | `services/asset-loader.ts` | 按单元预取 |
| 副作用编排 | `core/effects.ts` + `app/effects-runner.ts` | 纯函数产出列表，运行时执行 |
| 渲染 / UI | `components/` `views/` | 只渲染与转发 |

### Naming Conventions

| 元素 | 规范 | 示例 |
|---|---|---|
| `.vue` 文件 | PascalCase | `BattleField.vue` |
| `.ts` 文件 | kebab-case | `balance-sim.ts` |
| 类型 / 接口 | PascalCase | `GameState` |
| 函数 / 变量 | camelCase | `resolveTarget()` |
| 常量 | UPPER_SNAKE_CASE | `ZOMBIE_ROW = 2` |
| Action type | UPPER_SNAKE 字符串字面量 | `'PLACE_TOWER'` |
| 词条 id / 素材文件名 | **带单元前缀**的 kebab-case，**文件名 = id** | `u1-dog.svg` |
| 日志前缀 | 方括号小写 | `[core]` `[tts]` `[save]` `[content]` |

### Architectural Boundaries

**依赖方向：只能向下。**

```
components/ views/  →  app/  →  services/  →  core/
                                       content/  ↗
```

1. **`core/` 与 `content/` 不得 import `vue`，也不得 import 任何 `services/` 模块。** 由 `tsconfig.core.json` 的 `lib` 与 ESLint 规则强制。
2. **`components/` 不得自行计算任何战斗结果。** 只能读 state 或 dispatch action。
3. **任何组件内不得出现战斗规则计算。** 「答案」只有一个来源：`core/`。
4. **`app/store.ts` 的 `applyAction` 是唯一的状态变更入口。**
5. **测试全部置于 `tests/`，`core/` 目录内不出现 `.test.ts`。** 这既是整洁考虑，也是「core 不该碰任何浏览器东西」的额外视觉信号。

---

## Implementation Patterns

以下模式均为**本项目特有**，无通用范例可套。skill 模板中的引擎惯例（Prefab、Autoload、ScriptableObject、服务定位器）在本架构下不适用。

**明确不需要：** 对象池（场上 ≤ 10 个实体）、服务定位器、依赖注入容器（ES `import` 足够）、引擎场景/预制体体系。

### 模式 A：回合的等待阶段属于 State

**问题：** GDD 回合中存在两处无限等待 —— ② 等孩子选卡、⑤ 等建造（可反复放塔）。6 岁半可能盯着画面很久，也可能中途离开。

**若把回合写成 async 函数，立即产生三个问题：**
1. 存档无法记录「正卡在建造阶段」
2. 重进游戏不知该等选卡还是等放塔
3. reducer 无法拒绝非法操作

**定案：阶段是 State 的可辨识联合。**

```ts
type Phase =
  | { kind: 'awaiting-answer'; question: Question }
  | { kind: 'awaiting-build';  unlocked: string[]; sun: number }
  | { kind: 'resolving' }                 // 攻击 + 推进，一次性算完
  | { kind: 'round-over' }
  | { kind: 'level-complete' }
  | { kind: 'level-failed' }
```

**推论（必须遵守）：**
- `Phase` 是 `State` 的一部分 —— 否则决策 5「序列化整个 state」的断点续学无从谈起
- `reduce` 按阶段拒绝非法 action：`PLACE_TOWER` 仅在 `awaiting-build` 合法
- 组件**不得**自行推进阶段，只能 dispatch

### 模式 B：三种卡型共用一份判定逻辑

卡型差异**只在数据，不在代码**：题面内容、选项是图片还是文字。三者皆为「n 选 1，唯一正确项」。

```ts
type Card =
  | { kind: 'word';     promptText: string; options: ImageOption[] }
  | { kind: 'keyword';  promptText: string; options: TextOption[] }
  | { kind: 'response'; promptText: string; options: TextOption[] }

function isCorrect(card: Card, chosenId: OptionId): boolean   // 唯一实现
```

- **`kind` 仅用于渲染（图片卡 vs 文字卡）与卡型分布统计，不参与战斗**
- 「唯一正确项」是 **schema 级约束**（Zod 校验），不是运行时判断
- Epic 3 调整卡型分布或新增卡型时，只改数据与渲染，不动判定逻辑

### 模式 C：塔与词的绑定必须解耦

```ts
type Tower = {
  id: string
  towerType: 'direct' | 'slow' | 'aoe'   // ← 伤害 / 射程 / 造价 来源
  wordId: string                          // ← 显示名 / 词图 来源
}
```

**硬规则：战斗数值只能读 `towerType`，永远不读 `wordId`。**

理由：GDD 明确「塔为通用战斗单位，伤害/射程/费用与词义无关；同一株植物在不同单元因所绑定的词不同而呈现不同名字」。若显示名参与逻辑，同一塔型会因绑定词不同而表现不同，平衡验证全部失效。

### 模式 D：副作用只在 effects-runner 执行

- `core/effects.ts` 的 `runEffects(action, prev, next)` 是纯函数，返回副作用列表
- 实际执行**只允许**发生在 `app/effects-runner.ts`
- **组件内禁止 `watch` 状态变化后自行播放音效/动效** —— 否则同一事件被播多次，且无法测试

### 标准模式

| 类别 | 定案 | 理由 |
|---|---|---|
| **组件通信** | props 向下、事件向上；状态一律经 `app/store.ts` 的 `applyAction` | 无事件总线（决策：副作用模型） |
| **实体创建** | 工厂函数返回普通对象字面量 | 场上 ≤10 个实体，无性能考量；可序列化是硬要求 |
| **状态转换** | 可辨识联合 + `assertNever` 穷尽检查 | 新增阶段时编译期报错，不会静默漏处理 |
| **数据访问** | JSON 模块直接 `import`（Vite 处理），启动时 Zod 校验 | 无远程、无运行时拉取（决策：内容数据格式） |

### 一致性规则

| 规则 | 强制手段 |
|---|---|
| `core/` 不得碰 DOM / Vue | `tsconfig.core.json` 的 `lib` 无 DOM + ESLint `no-restricted-imports` |
| 组件不得计算战斗规则 | 代码评审项（无工具可强制，靠约定 + `[CR]` 检查） |
| 战斗数值只读 `towerType` | 代码评审项 |
| 副作用只在 effects-runner | 代码评审项 |
| 动画时长写在 CSS，不写在 TS | 代码评审项 |
| 内容改动后必须跑 `validate:content` | 提交前钩子 |

---

## Testing Strategy

**位置：** 全部测试置于 `tests/`，按被测模块分文件。`core/` 内不出现 `.test.ts`。

### 分层

| 层 | 测什么 | 工具 |
|---|---|---|
| **`core/` 单元测试** | reducer 转换、射程判定、伤害结算、目标选择、减速刷新、题单循环、阶段合法性 | Vitest |
| **平衡模拟** | 失败门槛、开局连错曲线、减速/范围塔表现、**重考回合的掉心行为** | `scripts/balance-sim.ts`（Vitest 或独立 tsx 运行） |
| **内容校验** | schema、词图存在性、塔绑定有效性、选项跨单元污染 | `scripts/validate-content.ts` |
| **组件测试** | 仅覆盖两处不可由逻辑层覆盖的行为：射程预览形状渲染、阶段切换的 UI 表现 | Vitest + `@vue/test-utils` |

### 必须落到测试的 GDD 数值断言

GDD 已用模拟定案、且**曾因手算出错**的数值，全部固化为断言：

```
✅ 直射塔（射程 3 格、50 伤害）单塔恰好击杀 100 血僵尸 —— 命中 2 次 = 100
✅ 僵尸从第 9 列走到房子 = 4 回合
✅ 开局连续答错 4 题 → 3 心耗尽（第 4/5/6 回合各掉 1 心）→ 本局失败
✅ 答错 7 题但错在后半程 → 掉心 0
✅ 单次答对所得阳光（50）≥ 最低塔造价（50）  ← 全关卡硬约束
✅ 范围塔仅 1 只僵尸时严格劣于直射塔（60<100 且 75>50）
✅ 减速持续 3 回合，被同塔重复命中刷新而非叠加
```

### 尚无覆盖、须在 Epic 1 补测的项

来自 GDD 决策日志遗留项，本架构为其提供可测基础（纯逻辑层）：

1. **减速塔与范围塔的战斗表现** —— 现有模拟只建模了直射塔
2. **重考回合的掉心行为** —— 「答错的词留在题单内循环直到答对」会产生第 11 回合之后的额外僵尸，现有失败门槛判定只覆盖前 10 回合

### 组件测试的边界

**不得为组件编写业务逻辑测试。** 逻辑层已覆盖的部分重复测一遍只会产生虚假的信心。组件测试仅限渲染与事件转发。

---

## Deployment

**目标：HTTPS 静态托管**（决策 8 的前置条件 —— SW 仅在安全上下文注册）。

| 项 | 定案 |
|---|---|
| 构建产物 | `npm run build` → 静态文件 |
| 托管 | GitHub Pages / Cloudflare Pages / 自有服务器 |
| 后端 | **无。** 本项目不设服务端、无遥测、无账号 |
| 运行环境 | 平板浏览器，竖屏 |
| 离线 | Service Worker 缓存；启动时缓存当前单元资源 |
| 更新 | 新 SW 激活后提示「下次启动生效」，**不在游戏进行中强制刷新** |

### 开发环境

```bash
npm install
npm run dev              # Vite 8 开发服务器
npm run test             # Vitest
npm run validate:content # 内容校验，提交前必跑
npm run balance-sim      # 平衡模拟，import 真实 core/
```

### 环境要求

| 项 | 版本 | 说明 |
|---|---|---|
| Node | ≥ 22.12（本机 v26.8.2） | Vitest 5 要求；Node 20 已 EOL |
| 包管理器 | npm 11.x（本机 11.19.1） | |

### AI 工具

- **Context7**（upstash/context7）—— 建议接入。让 AI 查阅 Vue / Vite 当前文档而非依赖训练数据。本项目选型时 Vue 3.6 尚为 RC、Vitest 5 刚发布，训练数据大概率过期，此工具价值显著。
- 引擎 MCP 不适用（无游戏引擎）。

---

## Architecture Validation

**验证日期：** 2026-10-12
**方法：** `.claude/skills/gds-game-architecture/checklist.md` 全项核对 + 占位符扫描

### 验证汇总

| 检查项 | 结果 | 说明 |
|---|---|---|
| 决策兼容性 | ✅ PASS | 纯 reducer ↔ 序列化存档 ↔ Phase 入 State 三者互相支撑，无冲突 |
| GDD 覆盖 | ✅ PASS | 8/8 系统有明确归属 |
| 模式完整性 | ✅ PASS | 4 个项目特有模式 + 4 类标准模式，均附具体示例 |
| 文档完整性 | ✅ PASS | 无占位符；执行摘要已补 |
| 边界可强制性 | ⚠️ 部分 | 仅逻辑/视图边界可工具强制；4 条规则依赖代码评审 |
| 版本具体性 | ✅ PASS | 全部 2026-10-12 联网核实；Node 版本本机确认 |

### 验证中发现并已修复的问题

| # | 问题 | 严重度 | 处理 |
|---|---|---|---|
| 1 | **进度与对局被混为一谈** —— GDD 中「战场每局清空」与「进度只增不减」生命周期不同；原架构只定义了序列化 `GameState`，局末清空会连带清掉「21/60」 | **高** | 已拆为 `SaveFile { progress, currentGame }` 两套独立结构 |
| 2 | **PWA 决策的前提未验证** —— SW 仅在 HTTPS/localhost 注册；最自然的局域网部署下会静默失效 | **高** | 部署方式定为 HTTPS 静态托管，写入决策 8 与 Deployment 章节 |
| 3 | 缺少执行摘要 | 低 | 已补 |
| 4 | 缺少测试策略章节 | 中 | 已补（含须落成断言的 7 条 GDD 数值） |
| 5 | MCP 建议未做（step 3 要求） | 低 | 引擎 MCP 不适用；已推荐 Context7 |

### 已知边界（非缺陷，但须知悉）

以下 4 条规则**无工具可强制**，只能靠 `[CR]` 代码评审把关：

| 规则 | 漂移风险 |
|---|---|
| 组件不得计算战斗规则 | **最高** —— AI 常顺手在组件里写 `if (hp <= 0)` |
| 战斗数值只读 `towerType` 不读 `wordId` | 一旦破坏，同一塔型因绑定词不同而表现不同，平衡验证全部失效 |
| 副作用只在 `effects-runner.ts` 执行 | 组件内 `watch` 后自行播音效会导致重复播放且不可测 |
| 动画时长写在 CSS | 防止把时长写进 TS 再驱动 JS |

### 覆盖率

- **决策：** 9 项全部拍板，无 TBD
- **系统：** 8/8
- **模式：** 4 个项目特有 + 4 类标准
- **待 `[CE]` 处理：** 词图产能（200-400 张，显式约束已记录）