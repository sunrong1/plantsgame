# 全局架构地图（_MAP）

> 本文件是 LLM 首要读取的索引。**先读这里定位模块，再读模块摘要，最后才按需读源码。**

> 覆盖 **52** 个模块 · 更新于 2026-10-24 · 全部 `status: draft`（依赖关系为 LLM 推断，需人工复核）

> 三层来源：AST（`.ts` 签名） + 文件头注释（`.vue` 契约） + LLM 综合

---


## core（战斗与回合内核）

| 模块 | 路径 | 职责 | 依赖 |
|---|---|---|---|
| `[[core-actions]]` | `src/core/actions.ts` | Action 构造器 | `[[core-types]]` |
| `[[core-balance]]` | `src/core/balance.ts` | 战斗数值单一事实源 | `[[core-types]]` |
| `[[core-build]]` | `src/core/build.ts` | 建造判据 | `[[core-types]]` `[[core-balance]]` `[[core-grid]]` |
| `[[core-combat]]` | `src/core/combat.ts` | 战斗单步原语 | `[[core-types]]` `[[core-balance]]` |
| `[[core-deck-slice]]` | `src/core/deck-slice.ts` | 题单切片 | `[[core-types]]` |
| `[[core-effects]]` | `src/core/effects.ts` | 效果定义 | `[[core-types]]` |
| `[[core-grid]]` | `src/core/grid.ts` | 网格规格与坐标换算 | `[[core-types]]` |
| `[[core-hud]]` | `src/core/hud.ts` | HUD 判据 | `[[core-types]]` `[[core-balance]]` |
| `[[core-index]]` | `src/core/index.ts` | core 公共出口 | `[[core-types]]` `[[core-balance]]` `[[core-grid]]` `[[core-actions]]` `[[core-combat]]` `[[core-hud]]` `[[core-reducer]]` `[[core-turn]]` `[[core-build]]` |
| `[[core-placeholder]]` | `src/core/placeholder.ts` | 占位图 | `[[core-types]]` |
| `[[core-reducer]]` | `src/core/reducer.ts` | 回合状态机 —— 唯一的状态变更点 | `[[core-types]]` `[[core-turn]]` `[[core-combat]]` `[[core-build]]` `[[core-deck-slice]]` `[[core-hud]]` `[[core-effects]]` |
| `[[core-session-replay]]` | `src/core/session-replay.ts` | 会话回放 | `[[core-types]]` `[[core-reducer]]` |
| `[[core-turn]]` | `src/core/turn.ts` | 回合结算编排 | `[[core-combat]]` `[[core-types]]` |
| `[[core-types]]` | `src/core/types.ts` | 战斗层实体类型 + 回合层类型 | `[[core-balance]]` |

## services（外部能力）

| 模块 | 路径 | 职责 | 依赖 |
|---|---|---|---|
| `[[services-asset-degradations]]` | `src/services/asset-degradations.ts` | 资源降级 | `[[services-asset-url]]` |
| `[[services-asset-prefetch]]` | `src/services/asset-prefetch.ts` | 资源预取 | `[[services-asset-url]]` |
| `[[services-asset-url]]` | `src/services/asset-url.ts` | 资源 URL 构造 | — |
| `[[services-audio]]` | `src/services/audio.ts` | 音频服务 | `[[services-pronunciation]]` |
| `[[services-pronunciation-status]]` | `src/services/pronunciation-status.ts` | 朗读状态 | `[[services-pronunciation]]` |
| `[[services-pronunciation]]` | `src/services/pronunciation.ts` | 朗读服务 | `[[services-audio]]` `[[content-index]]` |
| `[[services-save]]` | `src/services/save.ts` | 存档服务 | `[[core-types]]` |
| `[[services-sw-registration]]` | `src/services/sw-registration.ts` | Service Worker 注册 | — |

## app（应用门面与运行时）

| 模块 | 路径 | 职责 | 依赖 |
|---|---|---|---|
| `[[app-root]]` | `src/App.vue` | 应用根组件 | `[[app-store]]` `[[view-start]]` `[[view-level]]` `[[comp-debug-panel]]` |
| `[[app-audio-unlock]]` | `src/app/audio-unlock.ts` | 音频解锁 | `[[services-audio]]` |
| `[[app-dev-adjust]]` | `src/app/dev-adjust.ts` | 开发期数值调整 | `[[core-balance]]` `[[core-types]]` |
| `[[app-effects-runner]]` | `src/app/effects-runner.ts` | 效果派发 | `[[core-effects]]` `[[app-store]]` |
| `[[app-session-recorder]]` | `src/app/session-recorder.ts` | 会话录制 | `[[core-types]]` `[[app-store]]` |
| `[[app-store]]` | `src/app/store.ts` | 应用状态门面 | `[[core-reducer]]` `[[core-types]]` `[[core-hud]]` `[[core-actions]]` `[[app-effects-runner]]` `[[content-index]]` `[[services-pronunciation]]` `[[services-save]]` `[[services-asset-prefetch]]` `[[services-asset-degradations]]` |
| `[[app-main]]` | `src/main.ts` | 应用入口 | `[[app-root]]` `[[services-sw-registration]]` |
| `[[app-vite-env]]` | `src/vite-env.d.ts` | Vite 环境类型声明 | — |

## content（内容数据层）

| 模块 | 路径 | 职责 | 依赖 |
|---|---|---|---|
| `[[content-distribution]]` | `src/content/distribution.ts` | 单元分布 | `[[content-schema]]` |
| `[[content-index]]` | `src/content/index.ts` | 单元内容入口 | `[[content-schema]]` `[[content-distribution]]` |
| `[[content-option-count]]` | `src/content/option-count.ts` | 选项数量档位 | `[[content-schema]]` |
| `[[content-schema]]` | `src/content/schema.ts` | 内容数据 Schema | `[[content-index]]` |

## components（Vue 组件 · 靠头注释提取）

| 模块 | 路径 | 职责 | 依赖 |
|---|---|---|---|
| `[[comp-battlefield]]` | `src/components/battle/BattleField.vue` | 战场渲染 | `[[core-grid]]` `[[core-types]]` |
| `[[comp-rangeoverlay]]` | `src/components/battle/RangeOverlay.vue` | 射程预览 | `[[core-build]]` |
| `[[comp-tower]]` | `src/components/battle/Tower.vue` | 塔渲染 | `[[core-types]]` |
| `[[comp-zombie]]` | `src/components/battle/Zombie.vue` | 僵尸渲染 | `[[core-types]]` |
| `[[comp-debug-panel]]` | `src/components/debug/DebugPanel.vue` | 调试面板 | `[[app-dev-adjust]]` `[[app-store]]` |
| `[[comp-hand-card]]` | `src/components/hand/HandCard.vue` | 手牌卡面 | `[[core-types]]` `[[core-build]]` |
| `[[comp-hand-deck]]` | `src/components/hand/HandDeck.vue` | 手牌区 | `[[core-types]]` `[[core-deck-slice]]` |
| `[[comp-heart-row]]` | `src/components/hud/HeartRow.vue` | 心数行 | `[[core-types]]` |
| `[[comp-level-outcome]]` | `src/components/hud/LevelOutcome.vue` | 关卡结果 | `[[core-types]]` `[[core-reducer]]` `[[app-store]]` |
| `[[comp-progress-bar]]` | `src/components/hud/ProgressBar.vue` | 进度条 | `[[core-types]]` `[[core-deck-slice]]` |
| `[[comp-pronunciation-overlay]]` | `src/components/hud/PronunciationOverlay.vue` | 朗读浮层 | `[[services-pronunciation]]` `[[app-store]]` |
| `[[comp-sun-counter]]` | `src/components/hud/SunCounter.vue` | 阳光计数 | `[[core-types]]` `[[core-balance]]` |
| `[[comp-update-notice]]` | `src/components/hud/UpdateNotice.vue` | 更新提示 | — |
| `[[comp-answer-feedback]]` | `src/components/quiz/AnswerFeedback.vue` | 答题反馈 | `[[core-types]]` `[[core-reducer]]` |
| `[[comp-option-card]]` | `src/components/quiz/OptionCard.vue` | 选项卡 | `[[core-types]]` `[[content-option-count]]` |
| `[[comp-question-card]]` | `src/components/quiz/QuestionCard.vue` | 题面卡面 | `[[core-types]]` `[[core-reducer]]` |

## views（视图层）

| 模块 | 路径 | 职责 | 依赖 |
|---|---|---|---|
| `[[view-level]]` | `src/views/LevelView.vue` | 关卡视图 | `[[app-store]]` `[[core-reducer]]` `[[core-grid]]` |
| `[[view-start]]` | `src/views/StartView.vue` | 开始视图 | `[[app-store]]` `[[services-save]]` |

---

## 🔥 依赖热点（改动影响面最大）

> 这些模块被引用最多。**改之前先看引用方。**

| 模块 | 被依赖 | 路径 |
|---|---|---|
| `[[core-types]]` | 29 | `src/core/types.ts` |
| `[[app-store]]` | 8 | `src/app/store.ts` |
| `[[core-balance]]` | 7 | `src/core/balance.ts` |
| `[[core-reducer]]` | 7 | `src/core/reducer.ts` |
| `[[services-pronunciation]]` | 4 | `src/services/pronunciation.ts` |
| `[[core-grid]]` | 4 | `src/core/grid.ts` |
| `[[core-build]]` | 4 | `src/core/build.ts` |
| `[[core-hud]]` | 3 | `src/core/hud.ts` |
| `[[content-index]]` | 3 | `src/content/index.ts` |
| `[[core-deck-slice]]` | 3 | `src/core/deck-slice.ts` |
| `[[content-schema]]` | 3 | `src/content/schema.ts` |
| `[[core-combat]]` | 3 | `src/core/combat.ts` |

---

## 🔒 依赖方向（硬约束）

```
components ─┐
views ───────┼──> app（store 门面）──> core（纯逻辑）
             │                             ↑
content ─────┘                        services（外部能力）
```

- **core 零 DOM、零 Vue** —— `tsconfig.core.json` 的 lib 不含 DOM
- **组件不得计算任何战斗规则** —— 答案只能来自 `core/build.ts` / `core/balance.ts`
- **core 一律不打日志** —— `types: []` 会让 `console.log` 报 TS2584
- **core 依赖单向** —— `reducer → turn → combat`，不得反向
- **组件不得直接 import core 实现文件** —— 一律走 `core/index.ts`
- **core 不得 import `../content/`** —— `content/index.ts:37` 是静态 import JSON，拖进来会让 37 条词条进每一个 core 测试

---

## ⚠️ 高风险位置

| 位置 | 风险 |
|---|---|
| `core/build.ts` `coverCellsAt()` | 三方文档冲突后的裁决，最容易被「修回去」|
| `core/types.ts` ↔ `core/balance.ts` | 互相 import，靠 `import type` 擦除避免运行期循环 |
| `core/grid.ts` | 行号锚点会漂移，引用规格而不引用行号 |
| `core/combat.ts` 阶段顺序 | 旧注释的因果断言已被实跑推翻，别再引用旧数字 |
| `core/hud.ts` `advanceUnit()` | 参数已改名 `shouldAdvanceUnit`，签名不变但含义变了 |
| `app/store.ts` `levelOutcomeKind()` | 相位守卫刚补，判据与文档分家过 |
| `services/save.ts` | 存档恢复是独立形态的 bug 现场，1.15 当年漏判过 |
| `src/App.vue` | 子组件必须显式 import，漏了全绿但页面白屏 |

---

## 📖 术语表

- [[glossary/glossary-battle|战斗与回合]] · [[glossary/glossary-content|内容与学习]] · [[glossary/glossary-engineering|工程与规范]]

---

## 🧭 用法

```bash
# 1. 定位模块：读本文件
# 2. 读摘要：cat .wiki/modules/<module>.md
# 3. 按 YAML.path 读源码的特定行范围
```

> **deps 展开最多 2 层，总 token 不超过 4000。**
> **读源码一次最多 200 行。** 永远不要一次读整个 `src/`。
> **改了 `src/` 记得跑 `npm run lint:wiki`** —— hash 对不上就是摘要过期了。