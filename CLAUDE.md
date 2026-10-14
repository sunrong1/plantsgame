# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在本仓库工作时的指引。

## 项目状态

本仓库于 2026-10-11 通过 BMAD Method 从零重做。**当前没有产品代码。**

进度：`[GDD]` 已定稿（`_bmad-output/planning-artifacts/gdds/gdd-plants-game-2026-10-11/gdd.md`，
`status: final`，revision 3）。`[GA]` 游戏架构已定稿（`_bmad-output/planning-artifacts/game-architecture.md`，`status: complete`）。
下一步是 `[CE]` 拆 epic 与 story。

旧实现（Vue 3 + Phaser 3 塔防，已发布至 v5.x）已归档在 git tag `legacy-v5.x-final`。
若需要查阅旧代码（美术资源命名、平衡数值、移动端踩坑记录等）：

```bash
git ls-tree -r legacy-v5.x-final --name-only     # 看旧文件清单
git show legacy-v5.x-final:src/config/plants.ts  # 读单个旧文件
```

**除非 GDD/架构阶段明确要求，不要从旧代码复制实现。** 它的作用是参考，不是蓝本。

值得直接继承的旧资产：`SpeechService.preheat()`（Android 音频解锁踩坑的产物）。
注意旧实现用的是 **Phaser 3，该版本已于 2025-05 停止支持** —— 新项目不用 Phaser。

## 技术栈

由 `[GA]` 定稿，完整依据见 `_bmad-output/planning-artifacts/game-architecture.md`。

| 层 | 选择 | 版本 |
|---|---|---|
| 渲染 | **DOM + CSS，无游戏引擎** | — |
| UI 框架 | Vue | 3.5.x（3.6 仍是 RC，不采用） |
| 构建 | Vite | 8.x（Rolldown） |
| 测试 | Vitest | 5.x（需 Node ≥ 22.12） |
| 语言 | TypeScript | `strict: true` |
| 部署 | HTTPS 静态托管 + PWA | — |

**为什么没有游戏引擎：** 本作是**回合制**，无实时循环、无物理、无碰撞、无网络。
引擎 90% 的能力用不上；DOM 直接白送文字渲染（英文单词的认读质量直接受益）
与竖屏自适应布局。

## 命令

```bash
npm run dev               # 开发服务器
npm run test              # Vitest
npm run validate:content  # 内容校验，提交前必跑
npm run balance-sim       # 平衡模拟，import 真实 core/
```

## 架构硬约束

**这几条是 `[GA]` 定案的，违反即架构错误。实现前先读 `_bmad-output/planning-artifacts/game-architecture.md`。**

1. **`core/` 零 DOM、零 Vue** —— 由 `tsconfig.core.json` 的 `lib` 不含 `DOM` 强制，
   写 `window` / `localStorage` 会编译报错。配套 ESLint `no-restricted-imports`。
2. **组件内不得出现战斗规则计算** —— 只能读 state 或 dispatch action。
   答案只有一个来源：`core/`。⚠️ 这是 AI 最容易漂移的一条，`[CR]` 须重点检查。
3. **战斗数值只读 `tower.towerType`，永远不读 `wordId`** —— 否则同一塔型因绑定词
   不同而表现不同，平衡验证全部失效。
4. **副作用只在 `app/effects-runner.ts` 执行** —— 组件内禁止 `watch` 后自行播音效。
5. **动画时长写在 CSS，不写在 TS。**
6. **进度与对局是两套独立持久化** —— `SaveFile { progress, currentGame }`。
   战场每局清空，进度只增不减，混在一起会在局末丢掉「21/60」。
7. **范围塔 = 同行 3 格**（左 1 / 自身 / 右 1），不是半径 2 的圆（5 格严重超模）。
8. **音频解锁在「开始游戏」点击处理器内同步完成**，三者之间不允许 `await`；
   `speechSynthesis.cancel()` 只在 `speech === true` 时调用。
9. **TTS 失败绝不阻断回合流转** —— 必须有预录录音降级通路。
10. **平衡模拟是 TypeScript，不是 Python** —— 避免两份数值漂移。

## 待 `[CE]` 处理

**词图产能是项目级最大风险**：全年 200-400 词需 200-400 张各不相同的插画
（旧版本 5 个大版本只积累 9 张）。架构已锁定 SVG 格式与命名规范，但不解决产能本身。
拆 epic 时不得默认「Epic 2 就是把词图画完」。

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

---

## 📌 常驻速查（省 token 专用）

> 下面这些内容**每次新 session 都必须知道**，写在这里就不用重复读原始文件。
> 原始文件只在需要修改结构时才读。

### Epic 清单

```
Epic 1  工程基础设施 + 单元 1 内容（1-1 ~ 1-19）
  已 done: 1-1 工程脚手架 / 1-2 音频解锁+TTS / 1-3 朗读录音 / 1-4 战斗内核 / 1-5 回合状态机
  剩余:     1-6 内容数据层 → 1-19 首次试玩验证（生死线）
Epic 2  内容产能与难度阶梯（2-1 ~ 2-9）
Epic 3  打磨与验收（3-1 ~ 3-8）
```

**epic / story 完整定义见 `_bmad-output/planning-artifacts/epics.md`，
只在需要新增或拆分 story 时才读，日常不要读。**

### 状态速查

```
当前 sprint: Epic 1 进行中
下一个该做的 story: 从 sprint-status.yaml 里找第一个 backlog
状态机: backlog → (CS) → ready-for-dev → (DS) → review → (CR) → done
```

**`sprint-status.yaml` 是唯一状态源，每次开工先读它，不要凭记忆判断进度。**

### 文件位置

```
规划产物:   _bmad-output/planning-artifacts/
            ├── gdd.md                        游戏设计文档
            ├── game-architecture.md          架构决策
            ├── epics.md                      Epic/Story 定义（少读）
            └── gdds/<slug>/                  GDD 配套（decision-log 等）
实现产物:   _bmad-output/implementation-artifacts/
            ├── sprint-status.yaml            状态机
            └── <story-key>.md                单个 story 的上下文
```

### 工具使用纪律（省 token）

```
改文件用 Edit / Write，不要用 python3 -c 或 sed -i
  · Edit 只传 diff，参数体积比 Bash 改文件小一个数量级
  · Bash 只用于：跑测试、看 git 状态、查文件列表

读文件用 Read，不要 cat / head / tail
  · Read 走工具协议，可以被 review 看到
  · cat 的输出也会进上下文，但没有 Read 的缓存复用

同一个文件不要反复读
  · 上面「常驻速查」已经覆盖了高频查询
  · 真要读原文，读一次就够，别读 36 次
```

### 数值平衡参数（禁止擅自改）

```
心数上限、阳光递增公式、僵尸血量/速度、关卡阈值
这些是产品决策，改动前必须问人。
其他历史教训见 gdds/<slug>/decision-log.md，不要重新推导。
```
