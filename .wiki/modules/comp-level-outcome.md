---
module: comp-level-outcome
path: src/components/hud/LevelOutcome.vue
deps:
  - "[[core-types]]"
  - "[[core-reducer]]"
  - "[[app-store]]"
status: draft
last_sync: "2026-10-24T08:30:00+08:00"
hash: "fd53c442"
source: header-comment
---

# 关卡结果

**职责**：终态浮层：判胜负 + 决定按钮的种类。

**核心 API**：
```
LevelOutcome
```

**设计约束**：
**判据住在 store，组件不许自己算** —— 「本单元学完了没有」是跨局进度的事实（`progress.masteredWordIds`），而守卫 G90 把本组件钉成「只读 `state.value.phase.kind`」⇒ 组件拿不到那份数据 ⇒ 只能问 store 门面 `levelOutcomeKind()`。

**文案仍在组件里**（不在 store）—— 守卫 G91 扫的是组件源码里的词表 ⇒ 把文案搬进 store 会让那条守卫扫不到它 ⇒ 悄悄变弱（R-51）。**分工是「store 说该做什么，组件说写成什么字」。**

**已知坑点**：
**🔥 Story 2.5 / Task 5.2：按钮从 2 种变 4 种。** 1.19 之后一个单元要打好几局（单元 1 = 4 局）⇒ 终态浮层不再只有「赢了/输了」两种含义。

「继续」与「回开始」必须分开：单元 2 是当前录入的最后一个单元 ⇒ 学完但没下一单元时是「回开始」（全书读完了），不是「继续」。

**⚠️ `outcomeKind` 是 computed，依赖是隐式的** —— `levelOutcomeKind()` 内部读 `state.value.phase.kind` 与 `progress.value.masteredWordIds`，两者都是 store 里的 `ref` ⇒ Vue 求值时照样记成依赖 ⇒ 通关那次 dispatch 之后按钮自动重算，组件不需要再监听什么。

**相关决策**：
- [Story 1.10 归档文档](_bmad-output/archive/1-10-战场渲染与网格.md) —— 战场与 HUD 的装配
