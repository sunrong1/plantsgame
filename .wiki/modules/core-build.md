---
module: core-build
path: src/core/build.ts
deps:
  - "[[core-types]]"
  - "[[core-balance]]"
  - "[[core-grid]]"
status: draft
last_sync: "2026-10-23T18:40:00+08:00"
hash: "51087382"
---

# 建造判据

**职责**：UI 层关于「能不能放 / 会打到哪里 / 多少钱 / 手上有几张卡」的答案来源。

**核心 API**：
```
`canPlace()` · `buildBlockedReason()` · `coverCellsAt()` · `costOf()`
```

**设计约束**：
组件只要读本文件的返回值，任何一条战斗数值都不许在组件里重算。变异 M64/M65 + 源码守卫 G33a/G33b 守这条。

**已知坑点**：
coverCellsAt 画「真实伤害形状」而不是圆——这是三方文档正面冲突后的裁决（epics.md/gdd.md/game-architecture.md 各说各话），裁决记录在文件头。最容易被后来人「修回去」。
