---
type: dashboard
created: 2026-10-23
---

# 📊 知识库仪表盘

> 用 Obsidian 打开 `.wiki/` 目录即可看到本文件。
> 下面三个查询自动聚合，无需手工维护。

## 最近更新的模块

```dataview
TABLE module, status, last_sync
FROM "modules"
SORT last_sync DESC
LIMIT 10
```

## 🔴 孤立模块（无依赖且不被依赖 —— 需检查）

```dataview
LIST
FROM "modules"
WHERE length(file.inlinks) = 0 AND length(file.outlinks) = 0
```

## 🟡 待复核（依赖关系是 LLM 推断的）

```dataview
TABLE module, path, deps
FROM "modules"
WHERE status = "draft"
SORT module ASC
```

## 🟢 已复核

```dataview
TABLE module, last_sync
FROM "modules"
WHERE status != "draft"
SORT module ASC
```

## 📚 术语表入口

- [[glossary/glossary-battle|战斗与回合]]
- [[glossary/glossary-content|内容与学习]]
- [[glossary/glossary-engineering|工程与规范]]
