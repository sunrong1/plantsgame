---
module: app-root
path: src/App.vue
deps:
  - "[[app-store]]"
  - "[[view-start]]"
  - "[[view-level]]"
  - "[[comp-debug-panel]]"
status: draft
last_sync: "2026-10-23T18:40:00+08:00"
hash: "6e7af1eb"
source: header-comment
---

# 应用根组件

**职责**：按 view 条件渲染 StartView / LevelView，不引路由。

**核心 API**：
```
App
```

**设计约束**：
视图切换走 app/store 的最小 view 态，**不提前建 src/app/router.ts**（Story 1.10 裁决 1）。

**已知坑点**：
① 两个子组件必须显式 import —— script setup 不做全局组件解析，漏掉会渲染成空自定义元素，而 vue-tsc / build / test / lint 全绿，页面只是白着（守卫 vue/no-undef-components）。② 调试面板挂本文件而不是 views/：AC-D5 原文与 G113 自相矛盾，按「面板不是可路由到达的页面」这条语义裁决挂根组件，src/views/ 保持零调试 import。③ 原注「那是 Story 1.15 的活」已作废 —— 1.15 的 AC 正文没有 router，view 至今仍是本文件唯一的切换依据。

**相关决策**：
- [Story 1.10 归档文档](_bmad-output/archive/1-10-战场渲染与网格.md) —— 本模块的设计由来与验收标准
