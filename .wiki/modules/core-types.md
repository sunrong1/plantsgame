---
module: core-types
path: src/core/types.ts
deps:
  - "[[core-balance]]"
status: draft
last_sync: "2026-10-23T18:40:00+08:00"
hash: "ecddd778"
---

# 战斗层实体类型 + 回合层类型

**职责**：定义 Tower / Zombie 等战斗实体，以及 Story 1.5 追加的题单 / 题目 / State / Phase / Action 五个家族。

**核心 API**：
```
`State` · `Phase` · `Action` · `Tower` · `Zombie` · `DeckEntry` · `Question`
```

**设计约束**：
纯类型 + 纯函数，零 DOM 零 Vue（tsconfig.core.json 的 lib 不含 DOM）。Action 联合定义住在这里，构造器在 actions.ts。

**已知坑点**：
ZOMBIE_HP 从 balance.ts 取（数值单一事实源），balance 反向 import 的是 import type，编译期擦除，无运行期循环。

**相关决策**：
- [Story 1.5 归档文档](_bmad-output/archive/1-5-回合状态机与题单.md) —— 本模块的设计由来与验收标准
