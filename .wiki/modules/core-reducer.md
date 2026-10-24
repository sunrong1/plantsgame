---
module: core-reducer
path: src/core/reducer.ts
deps:
  - "[[core-types]]"
  - "[[core-turn]]"
  - "[[core-combat]]"
  - "[[core-build]]"
  - "[[core-deck-slice]]"
  - "[[core-hud]]"
  - "[[core-effects]]"
status: draft
last_sync: "2026-10-23T18:40:00+08:00"
hash: "acf7c3e0"
---

# 回合状态机 —— 唯一的状态变更点

**职责**：所有状态变更的唯一入口，按阶段拒绝非法 action。

**核心 API**：
```
`reducer(state, action)` · `createInitialState()`
```

**设计约束**：
四条纪律：纯函数（无随机无时间依赖）/ 按阶段拒绝非法 action（非法即抛错，绝不静默忽略）/ 组件不得计算任何战斗规则 / 依赖方向 reducer → turn → combat 单向。

**已知坑点**：
state.deck 是本局题单固定全集，一局内永不变动；「已答对不再出现」由 masteredEntryIds 表达。不维护会重排的队列——队列一局内一变，存档里的 mastered 就可能对不上。
