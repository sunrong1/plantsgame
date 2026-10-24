---
module: core-actions
path: src/core/actions.ts
deps:
  - "[[core-types]]"
status: draft
last_sync: "2026-10-23T18:40:00+08:00"
hash: "4d97cf13"
---

# Action 构造器

**职责**：每个 action 的诞生必须经过本文件，收敛成六行可被穷尽检查的代码。

**核心 API**：
```
`answer()` · `placeTower()` · `endBuild()` · `resolveRound()`
```

**设计约束**：
不做合法性判断（那是 reducer 的阶段转换表），不做载荷规范化。构造器只保证产出的对象是该 action 的规范形态。

**已知坑点**：
字面量联合在编译期拦不住拼写漂移：写 'END_BULID' 不报错，只会在 reducer 的阶段转换表里多出一个永远匹配不到的分支——状态机从此少一条边，而全部测试仍然绿。
