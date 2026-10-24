# 术语表

> 领域术语的单一事实源。**每个术语一条 frontmatter**，才能进知识图谱。
>
> 术语表的 `related` 字段指向相关模块 —— 这样在 Obsidian graph view 里，
> 术语和模块是连着的。

## 分类

| 分类 | 术语数 | 入口 |
|---|---|---|
| 战斗与回合 | 6 | [[glossary/glossary-battle]] |
| 内容与学习 | 4 | [[glossary/glossary-content]] |
| 工程与规范 | 5 | [[glossary/glossary-engineering]] |

## 使用约定

- **新术语必须挂到某个分类文件**，并填 `related`
- **术语定义只写一处**，其他地方引用而不重复定义
- **与代码常量同名时，注明代码位置**（`core/balance.ts`）
