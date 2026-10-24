---
module: core-turn
path: src/core/turn.ts
deps:
  - "[[core-combat]]"
  - "[[core-types]]"
status: draft
last_sync: "2026-10-23T18:40:00+08:00"
hash: "50f52920"
---

# 回合结算编排

**职责**：把 combat.ts 的八个单步原语编排成一个完整回合。

**核心 API**：
```
`resolveCombatRound()`
```

**设计约束**：
编排层只做三件原语不做的事：行过滤（塔的 row）、按塔序逐座结算、四步顺序（攻击→推进→抵达→判胜负）。

**已知坑点**：
命名裁决：编排器叫 resolveCombatRound 而非 resolveRound——那个名字属 actions.ts 的构造器。第 4 步「判胜负」不在本文件，掉心与失败判定必须分开，否则有两个可写来源。
