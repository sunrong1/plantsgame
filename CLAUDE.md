# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在本仓库工作时的指引。
**它是入口，不是事实源。** 任何与 `docs/rules/`、GDD、架构文档冲突的表述，以那些文件为准。

## 项目状态

回合制英语单词塔防，面向中文母语儿童（4–8 岁）。
Epic 1（工程基础设施 + 单元 1 内容）进行中。

> **唯一状态源是 `_bmad-output/implementation-artifacts/sprint-status.yaml`。**
> 本文件曾经复述 story 状态，已过时过一次（见 [R-30](docs/rules/process.md)）。
> **开工先读那个 yaml，不要凭记忆、不要读这里。**

## 技术栈

| 层 | 选择 | 版本 |
|---|---|---|
| 渲染 | **DOM + CSS，无游戏引擎** | — |
| UI 框架 | Vue | 3.5.x（3.6 仍是 RC，不采用） |
| 构建 | Vite | 8.x（Rolldown） |
| 测试 | Vitest | 5.x（需 Node ≥ 22.12） |
| 语言 | TypeScript | `strict: true` |
| 部署 | HTTPS 静态托管 + PWA | — |

**为什么没有游戏引擎：** 本作是**回合制**，无实时循环、无物理、无碰撞、无网络。
引擎 90% 的能力用不上；DOM 直接白送文字渲染（英文单词的认读质量直接受益）与竖屏自适应布局。

## 命令

```bash
npm run dev               # 开发服务器
npm run test              # Vitest（pretest 会先跑 validate:content）
npm run typecheck         # vitest 不查类型，改 .vue 后必跑（R-54）
npm run lint
npm run validate:content  # 内容校验，提交前必跑
npm run balance-sim       # 平衡模拟，import 真实 core/
```

## 架构硬约束

**全部工程规则住在 [`docs/rules/`](docs/rules/README.md)，每条只写一次。**
本文件只列入口，**不复述正文** —— 复述就是 [R-37](docs/rules/process.md) 说的那条复制链，
本仓库已经因此产出 6 类活着的错误信息。

| 主题 | ID 区间 | 何时必读 |
|---|---|---|
| [架构硬约束](docs/rules/architecture.md) | R-01..R-14 | **每次写代码前** |
| [数值与平衡](docs/rules/range-and-balance.md) | R-20..R-24 | 碰任何数值时（⚠️ 改之前问人） |
| [流程与文档](docs/rules/process.md) | R-30..R-41 | 记录 / 引用 / 作废约定时 |
| [测试与守卫](docs/rules/testing.md) | R-50..R-61 | 写测试或守卫时 |
| [内容与词图](docs/rules/content.md) | R-70..R-78 | 画词图或写 SVG 时 |

⚠️ 索引里有 **31 条规则目前没有守卫测试**（各条「守卫」字段如实标注）。
不要把「无守卫」当成「已覆盖」。

## BMAD 工作流

本项目使用 [BMad Method](https://docs.bmad-method.org/)，**Game Dev Studio（GDS）模块**。
走 GDS 路径 —— 产出物在 `_bmad-output/`，且不需要 PRD（设计起点是 GDD）。

| 阶段 | 状态 |
|---|---|
| 1-preproduction | 已跳过 |
| 2-design（`gds-gdd` / `gds-ux` / `gds-prd`） | ✅ 已完成 |
| 3-technical（`gds-game-architecture` / `gds-create-epics-and-stories` / `gds-check-implementation-readiness`） | ✅ 已完成 |
| 4-production（`gds-sprint-planning` → `gds-create-story` → `gds-dev-story`） | 进行中 |

**随时可用**：`/bmad-help`（我在哪）、`/gds-correct-course`（跑偏了怎么纠）、
`/gds-investigate`（取证式排查）、`/gds-quick-dev`（小改动一条龙）、
`/gds-code-review`、`/gds-retrospective`、`/bmad-review`。

**每个技能在新开的 context window 里跑** —— BMAD 的规划对话很长，上下文污染会拉低后续质量。

**epic / story 的完整定义只在 `_bmad-output/planning-artifacts/epics.md`（2,169 行）。**
只在需要新增或拆分 story 时才读，日常不要读 —— 读它会挤占一个 context window 的四分之一。

## 语言

BMAD 对话与产出文档一律使用**中文**。配置在 `_bmad/custom/config.user.toml`（不提交仓库）。

## 目录约定

```
_bmad/              BMAD 方法论本体（安装器管理）
_bmad/custom/       个人/团队覆盖配置（*.user.toml 不提交）
_bmad-output/
  planning-artifacts/       GDD、架构、epics —— 规划产物
  implementation-artifacts/ sprint-status.yaml + 当前活跃 story 文档
  archive/                  已完成（done）的 story 文档 —— 默认不读（R-40）
docs/               项目知识库；docs/rules/ 是工程规则的唯一裁决源
```

## 提交约定

Conventional Commits（`feat:` / `fix:` / `docs:` / `test:` / `refactor:` / `chore:`）。
不要在规划阶段写产品代码 —— 那是 `/gds-dev-story` 的职责。

## 常驻速查

- **状态机**：`backlog → (CS) → ready-for-dev → (DS) → review → (CR) → done`；
  done 的 story 文档在 `[DS]` 收尾时 `git mv` 进 `_bmad-output/archive/`（R-40）
- **改文件用 Edit / Write**，禁 shell 重定向 / `sed -i` / `python3 -c`（R-34）
- **发现「某文件属 Story X.X」的冲突**：以 `epics.md` 的 AC 正文为准，编号会随 Epic 归并重排（R-32）
- **引用文档用原文句子，不用行号** —— 行号随 revision 漂移（R-31）
- **收尾门槛逐项贴真实输出**，不写「应该会绿」（R-39）
