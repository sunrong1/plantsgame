# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在本仓库工作时的指引。

## 项目状态

本仓库于 2026-10-11 通过 BMAD Method 从零重做。**当前没有产品代码。**

进度：`[GDD]` 已定稿（`_bmad-output/planning-artifacts/gdds/gdd-plants-game-2026-10-11/gdd.md`，
`status: final`，revision 3）。同目录的 `epics.md` 是草案，验收标准待 `[CE]` 细化。
下一步是 `[GA]` 游戏架构。

旧实现（Vue 3 + Phaser 3 塔防，已发布至 v5.x）已归档在 git tag `legacy-v5.x-final`。
若需要查阅旧代码（美术资源命名、平衡数值、移动端踩坑记录等）：

```bash
git ls-tree -r legacy-v5.x-final --name-only     # 看旧文件清单
git show legacy-v5.x-final:src/config/plants.ts  # 读单个旧文件
```

**除非 GDD/架构阶段明确要求，不要从旧代码复制实现。** 它的作用是参考，不是蓝本。

值得直接继承的旧资产：`SpeechService.preheat()`（Android 音频解锁踩坑的产物）。

## 技术栈：尚未决定

技术栈由 `[GA]` 游戏架构阶段拍板（`primary_platform: other`，浏览器平板优先）。
届时本节会被替换为实际的栈、命令和约定。在此之前不要假设 Vue/Phaser/Vite/Vitest 仍然适用。

## BMAD 工作流

本项目使用 [BMad Method](https://docs.bmad-method.org/)，**Game Dev Studio（GDS）模块**。

> BMM 模块的技能也装着，但本项目走 GDS 路径 —— 产出物在 `_bmad-output/`，
> 且 GDS 不需要 PRD（设计起点是 GDD，不是产品需求文档）。

### 1-preproduction（可选）

| 菜单码 | 技能 | 必做 |
|---|---|---|
| BG | `gds-brainstorm-game` | 可选 |
| GB | `gds-create-game-brief` | 可选 |
| DR | `gds-domain-research` | 可选 |

本项目已跳过这一阶段，直接进入设计。

### 2-design（产出写入 `_bmad-output/planning-artifacts/`）

| 顺序 | 菜单码 | 技能 | 必做 |
|---|---|---|---|
| 1 | GDD | `gds-gdd` | **必做** ✅ 已完成 |
| 2 | CU | `gds-ux` | 可选（UI 占比大时强烈建议） |
| 3 | PRD | `gds-prd` | 可选（通常从 GDD 派生） |

### 3-technical

| 顺序 | 菜单码 | 技能 | 必做 |
|---|---|---|---|
| 1 | GA | `gds-game-architecture` | **必做** |
| 2 | CE | `gds-create-epics-and-stories` | **必做** |
| 3 | IR | `gds-check-implementation-readiness` | **必做** |

### 4-production

| 顺序 | 菜单码 | 技能 | 必做 |
|---|---|---|---|
| 1 | SP | `gds-sprint-planning` | **必做** |
| 2 | CS | `gds-create-story` | **必做** |
| 3 | DS | `gds-dev-story` | **必做** |

### 随时可用

`[BH]` `bmad-help`（我在哪、下一步做什么）、`[PC]` `gds-generate-project-context`、
`[SS]` `gds-sprint-status`、`[QD]` `gds-quick-dev`（小改动一条龙）、
`[CC]` `gds-correct-course`（跑偏了怎么纠）、`[IN]` `gds-investigate`（取证式排查 bug）、
`[RV]` `bmad-review`、`[RS]` `bmad-deep-recon`。

Epic 收尾可选：`[CR]` `gds-code-review`、`[ER]` `gds-retrospective`。
游戏测试可选：`[TA]` `gds-test-automate`、`[PP]` `gds-playtest-plan`。

用 `/` 前缀调用对应 skill。**每个技能在新开的 context window 里跑** —— BMAD 的规划对话很长，
上下文污染会拉低后续 story 的质量。

## 语言

BMAD 对话与产出文档一律使用**中文**。
配置在 `_bmad/custom/config.user.toml`（个人配置，不提交仓库）。

## 目录约定

```
_bmad/              BMAD 方法论本体（安装器管理，已提交）
_bmad/custom/       个人/团队覆盖配置（*.user.toml 不提交）
_bmad-output/       BMAD 产出物
  planning-artifacts/
    gdds/<slug>/    GDD 及其配套（decision-log、epics 草案、balance-scan.py）
  implementation-artifacts/ sprint 状态、story
docs/               项目知识库（BMAD 的 project_knowledge 指向这里）
```

## 提交约定

遵循 Conventional Commits（`feat:`、`fix:`、`docs:`、`test:`、`refactor:`、`chore:`）。

不要在规划阶段写产品代码 —— 那是 `[DS]` gds-dev-story 的职责。
