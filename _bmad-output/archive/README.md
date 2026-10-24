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

## 📎 归档后的路径引用（2026-10-25 夜，批量改写）

**`git mv` 会把**别处**写着这个文档的路径一起作废。** 归档层内共有 **30 处**
「`_bmad-output/implementation-artifacts/<X>.md`」形式的引用，其目标已随归档移走
⇒ 本批统一改成 `archive/` 前缀（**只改目录段，文件名一字未动**）。
依据与守卫见 [`docs/rules/process.md` 的 R-40](../../docs/rules/process.md) 与守卫 **G309**。

**未改的 6 处，各有理由**（守卫 G309 的例外清单，逐条写明）：

- **5 处**指向 `1-5-回合状态机与题单.md` —— 那是 **DF-028** 正在等人裁决的
  `.claude/settings.local.json` 里**真的失效**的 Bash 授权路径；
  那几处写的**正是那个失效路径本身**，改成新路径反而会掩盖问题。
- **1 处**是上面第 3 条命令里的 `git show 5049e69:<旧路径>` ——
  那是**历史 commit 上的路径**，在那个 commit 上真实存在，不是失效引用。

⚠️ 活跃目录（`_bmad-output/implementation-artifacts/`）里的引用**不改成 `archive/` 路径** ——
R-40 的 AC-4 守卫禁止活跃文档引用归档里的具体文件 ⇒ 那里改成**键**。
（**判据只写在 R-40 一处**，此处不复制 —— R-37。）

## 谁负责把它移进来

执行该 story `[DS]` 的那个 agent，在收尾时执行 `git mv`。
不要另开一次专门归档 —— 归档属于收尾动作的一部分。
**归档的同一个 commit 里**必须把指向被归档文档的路径引用一并改掉（G309）。
