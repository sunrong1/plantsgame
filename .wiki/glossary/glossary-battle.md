---
domain: battle
related:
  - "[[core-balance]]"
  - "[[core-turn]]"
  - "[[core-combat]]"
created: 2026-10-23
---

# 术语表 · 战斗与回合

| 术语 | 定义 | 代码位置 | 相关 |
|---|---|---|---|
| **回合（Turn）** | 一次完整的结算循环：攻击 → 推进 → 抵达 → 判胜负 | `core/turn.ts` | `[[core-turn]]` |
| **档位（Tier）** | 数值按档位表组织，而非散落的常量 | `core/balance.ts` | `[[core-balance]]` |
| **行过滤** | 只有 `row === ZOMBIE_ROW` 的塔参与攻击判定 —— 属编排层职责 | `core/turn.ts` | `[[core-combat]]` |
| **单步原语** | 不可再分的战斗操作（射程判定 / 选目标 / 结算伤害 / 减速 / 单步移动）| `core/combat.ts` | `[[core-combat]]` |
| **减速（slowTurnsLeft）** | 减速塔置位 3 回合；移动按**攻击后**的值决定格数 | `core/combat.ts` | `[[core-balance]]` |
| **掉心 vs 失败判定** | 两个独立概念：turn.ts 只报掉了几颗心，判归零归 reducer | `core/turn.ts` / `core/reducer.ts` | `[[core-reducer]]` |
