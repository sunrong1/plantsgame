---
module: core-combat
path: src/core/combat.ts
deps:
  - "[[core-types]]"
  - "[[core-balance]]"
status: draft
last_sync: "2026-10-23T18:40:00+08:00"
hash: "a2273973"
---

# 战斗单步原语

**职责**：提供射程判定 / 选目标 / 结算伤害 / 减速 / 单步移动五个单步原语。

**核心 API**：
```
`inRange()` · `pickTarget()` · `resolveDamage()` · `stepZombie()`
```

**设计约束**：
全部原语只收列号（towerCol），不感知塔的 row。僵尸恒在 ZOMBIE_ROW，「只有 row === ZOMBIE_ROW 的塔参与攻击」是编排层（turn.ts）的职责。

**已知坑点**：
[CR] 2026-10-13 实跑修正：旧注释称「先移动后攻击在减速塔上差一次命中（2 次 vs 3 次）」不成立——两种顺序对减速塔 col3 都是 3 次命中 / 75 伤害。已按「只写站得住的理由」纪律撤下该断言。
