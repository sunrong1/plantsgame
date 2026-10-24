---
domain: engineering
related:
  - "[[core-reducer]]"
  - "[[core-actions]]"
  - "[[core-build]]"
  - "[[app-store]]"
created: 2026-10-23
---

# 术语表 · 工程与规范

| 术语 | 定义 | 代码位置 | 相关 |
|---|---|---|---|
| **单一事实源（SSOT）** | 一个值只允许有一个定义处；两处各存一份必然一改一漏 | 全局纪律 | `[[core-balance]]` |
| **Action 构造器** | 每个 action 的唯一诞生入口，收敛成可穷尽检查的代码 | `core/actions.ts` | `[[core-actions]]` |
| **阶段拒绝** | 非法 action 即抛错，绝不静默忽略 | `core/reducer.ts` | `[[core-reducer]]` |
| **门禁 / 守卫（G##）** | 源码级自动化检查，变异测试会验证它真能判红 | `scripts/` + `tests/` | — |
| **裁决** | 三方文档冲突后的最终决定，记录在文件头注释里 | 各文件头 | `[[core-build]]` |
| **store 门面** | 组件访问 core 的唯一入口，不直接 import 实现文件 | `app/store.ts` | `[[app-store]]` |
