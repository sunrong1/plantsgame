# 归档：已完成的 story 文档

## 是什么

这里存放**状态为 `done` 的 story 文档**。它们已落成代码与测试，
`sprint-status.yaml` 里的状态、以及 `src/` `tests/` 里的产物才是事实源。

## 默认不要读这里

这些文档共 **24 份 / 约 27,500 行**（2026-10-25 实测；不含本目录下的 `deferred/`）。
（2026-10-25 夜归档了 4 份：Story 1.11 / 1.12 / 2.1 的文档 + Story 2.1 的 `[CR]` 中间报告。）
在默认检索范围内它们只会有两种后果：
污染上下文，以及把里面**已过时的口径**当成现行事实 ——
本仓库已经因此踩过 6 类坑（`--color-*` 写成 12 实为 14、`jsdom 没装`
实为早已装好、`effects-runner` 归属错 9 处、旧 GDD 修订口径等）。

已完成 story 的约定已经抽进 [`docs/rules/`](../../docs/rules/README.md)，
以 R-ID 为准；本文档里的任何说法都不再是权威副本。

## 需要考古时怎么查

```bash
# 1. 只想知道某个已完成 story 讲过什么 —— 读归档目录本身
grep -rn "关键词" _bmad-output/archive/

# 2. 想追溯某个文件的历史（含归档前的每一次改动）
git log --oneline --follow -- _bmad-output/archive/1-4-战斗内核与-5-条数值断言.md

# 3. 想看某个时点的原貌
git show 5049e69:_bmad-output/implementation-artifacts/1-4-战斗内核与-5-条数值断言.md
```

## 什么时候移进来

`sprint-status.yaml` 里该 story 的状态**已经是 `done`** 时。
`review` 状态的留在 `_bmad-output/implementation-artifacts/`，
等 `[CR]` 结束、`[DS]` 把它标为 `done` 后再移。

## 谁负责把它移进来

执行该 story `[DS]` 的那个 agent，在收尾时执行 `git mv`。
不要另开一次专门归档 —— 归档属于收尾动作的一部分。
