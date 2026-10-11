# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在本仓库工作时的指引。

## 项目状态：绿字段重做中

本仓库于 2026-10-11 通过 BMAD Method 从零重做。**当前没有产品代码。**

旧实现（Vue 3 + Phaser 3 塔防，已发布至 v5.x）已归档在 git tag `legacy-v5.x-final`。
若需要查阅旧代码（美术资源命名、平衡数值、移动端踩坑记录等）：

```bash
git ls-tree -r legacy-v5.x-final --name-only     # 看旧文件清单
git show legacy-v5.x-final:src/config/plants.ts  # 读单个旧文件
```

**除非 PRD/架构阶段明确要求，不要从旧代码复制实现。** 它的作用是参考，不是蓝本。

## 技术栈：尚未决定

技术栈由 BMAD `[CA]` 架构阶段拍板。届时本节会被替换为实际的栈、命令和约定。
在此之前不要假设 Vue/Phaser/Vite/Vitest 仍然适用。

## BMAD 工作流

本项目使用 [BMad Method](https://docs.bmad-method.org/)，BMM 模块。

### 规划阶段（产出写入 `_bmad-output/planning-artifacts/`）

| 顺序 | 菜单码 | 技能 | 必做 |
|---|---|---|---|
| 1 | CB | `bmad-product-brief` | 可选 |
| 2 | PRD | `bmad-prd` | **必做** |
| 3 | CU | `bmad-ux` | 可选（UI 占比大时强烈建议） |
| 4 | CA | `bmad-architecture` | **必做** |
| 5 | CE | `bmad-create-epics-and-stories` | **必做** |
| 6 | SP | `bmad-sprint-planning` | **必做** |

### 交付阶段

| 菜单码 | 技能 | 必做 |
|---|---|---|
| BD | `bmad-build` | **必做** |
| CR | `bmad-code-review` | 可选 |
| QA | `bmad-qa-generate-e2e-tests` | 可选 |
| ER | `bmad-retrospective` | 可选 |

随时可用：`[BH]` `bmad-help`（我在哪、下一步做什么）、`[PC]` `bmad-project-context`、
`[SPC]` `bmad-spec`、`[RS]` `bmad-deep-recon`、`[RV]` `bmad-review`。

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
  planning-artifacts/       PRD、架构、epics
  implementation-artifacts/ sprint 状态、story
docs/               项目知识库（BMAD 的 project_knowledge 指向这里）
```

## 提交约定

遵循 Conventional Commits（`feat:`、`fix:`、`docs:`、`test:`、`refactor:`、`chore:`）。

不要在规划阶段写产品代码 —— 那是 `[BD]` bmad-build 的职责。
