---
module: app-effects-runner
path: src/app/effects-runner.ts
deps:
  - "[[core-effects]]"
  - "[[app-store]]"
status: draft
last_sync: "2026-10-23T18:40:00+08:00"
hash: "047b6646"
---

# 效果派发

**职责**：把 core 声明的效果派发到运行时。

**核心 API**：
```
`runEffectsFromStore()`
```

**设计约束**：
音效一律由 applyAction 触发本文件，组件不得自己播一遍——否则重复播放，守卫 G60 会判红。

**已知坑点**：

