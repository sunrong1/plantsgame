# `.wiki/` 使用说明

> 这是给 AI Coding Agent 用的项目知识库。
> **它不是给人读的手册** —— 它的读者是下一个要改这个仓库的 Agent。

## 一句话

> 先读 `_MAP.md` 定位模块 → 再读 `modules/<name>.md` 看摘要 → 最后按 `path` 读源码的**特定行范围**。

## 目录结构

```
.wiki/
├── _MAP.md              # 全局架构地图（首要入口）
├── Dashboard.md         # Obsidian 仪表盘（dataview 查询）
├── modules/             # 52 个模块摘要，每个对应一个源文件
│   ├── core-reducer.md
│   ├── core-build.md
│   └── ...
└── glossary/            # 术语表（按 domain 拆分）
    ├── glossary-battle.md
    ├── glossary-content.md
    └── glossary-engineering.md
```

## 每个模块摘要长什么样

```yaml
---
module: core-build
path: src/core/build.ts          # ← 源文件路径
deps:                             # ← 依赖的其他模块（双链）
  - "[[core-types]]"
  - "[[core-balance]]"
  - "[[core-grid]]"
status: draft                     # ← draft(待复核) | verified
last_sync: "2026-10-23T18:40:00+08:00"
hash: "51087382"                 # ← 源码内容指纹，用于检测过期
---
```

正文固定四段：**职责 / 核心 API / 设计约束 / 已知坑点**。

**「已知坑点」这一段是整个 wiki 里最值钱的部分。** 它记的是「代码里看不出、但改代码时一定会踩」的事。

## 它比 grep 强在哪

改「建造时能不能放塔」这个逻辑 —— `grep -rln "canPlace\|buildBlockedReason" src/` 给出 5 个文件：

```
src/components/battle/BattleField.vue
src/core/build.ts
src/core/grid.ts
src/core/index.ts
src/core/reducer.ts
```

**但这个列表有两个陷阱：**

- `core-types.ts` / `core-balance.ts` 没出现，可改造价时必然要动
- `BattleField.vue` 出现了，但按项目纪律它**只该读** `core-build.ts` 的返回值，不许自己重算

`.wiki` 回答的是「谁拥有这个逻辑」，grep 回答的是「谁提到了这个词」。

```
$ cat .wiki/modules/core-build.md
职责：UI 层关于「能不能放 / 会打到哪里 / 多少钱 / 手上有几张卡」的答案来源
设计约束：组件只要读本文件的返回值，任何一条战斗数值都不许在组件里重算
已知坑点：coverCellsAt 画「真实伤害形状」而不是圆 —— 三方文档正面冲突后的裁决
```

**最后那句 grep 永远搜不到。**

## 三条硬规则

**1. 不要一次读整个 `src/`**

52 个模块、65,775 行。展开 `deps` 最多 2 层，总 token 不超过 4000。读源码一次最多 200 行。

**2. 改了源码要同步摘要**

```bash
# 改了 src/core/build.ts 之后
md5sum src/core/build.ts | cut -c1-8   # 更新 hash
# 同时更新 last_sync，并复核摘要内容
```

摘要过期是**警告**不是错误 —— 别为了让 lint 变绿而只改 hash 不改内容。

**3. `status: draft` 的依赖关系是推断的**

`deps` 是 LLM 根据代码推出来的，**可能不准**。第一次用某个模块时，顺手核一下。

## 在 Obsidian 里打开

把 `.wiki/` 作为 vault 打开，Dataview 插件会让 `Dashboard.md` 的查询自动跑起来。

## 三层来源

| 层 | 覆盖 | 特点 |
|---|---|---|
| L1 AST | `.ts` 文件的导出与引用 | 确定性高，零幻觉 |
| L1.5 文件头注释 | `.vue` 组件（AST 在这里是 0 覆盖） | 项目自己写的契约，最可信 |
| L2 LLM | 全部 | 唯一可能产生幻觉的层 → `status: draft` |

## 怎么用（复制给 Agent）

```
读 .wiki/_MAP.md 定位我要改的模块，
再读 .wiki/modules/<module>.md，
然后按 YAML.path 读源码的特定行范围。
一次最多 200 行。
```

## 已知局限

- `deps` 是推断的，可能漏边或错边
- 摘要是一次性生成的，源码改了不会自动更新
- 没有自动化 lint 脚本（下一步可以补：hash 校验 + 双链检查 + 路径存在性）
- 术语表只覆盖了 15 个核心术语，边界情况没穷举
