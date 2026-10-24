---
module: core-balance
path: src/core/balance.ts
deps:
  - "[[core-types]]"
status: draft
last_sync: "2026-10-23T18:40:00+08:00"
hash: "aa01383b"
---

# 战斗数值单一事实源

**职责**：塔伤害 / 射程 / 造价、僵尸血量 / 速度、阳光速率全部在本文件。

**核心 API**：
```
`BALANCE_TIERS` · `costOf()` · `ZOMBIE_HP` · `SLOW_FACTOR`
```

**设计约束**：
组件与单元内容 JSON 都不得重复定义这些值。形态是档位表（tier 数组），不是散落的常量。

**已知坑点**：
两处各存一份，迟早一改一漏——而「一改一漏」正是 decision-log.md 里三次手算错误的同一个根因，只是换了个位置。
