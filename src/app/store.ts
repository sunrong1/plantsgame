/**
 * 应用状态与视图状态（Story 1.10 / AC-3）。
 *
 * ── 职责边界 ──────────────────────────────────────────────────────────────
 * 本文件是 **`State` 的唯一持有处**（架构决策 2：纯 reducer，否决 Pinia）。
 * 组件不持有战斗状态、不复制它、也不自己算 —— 只读 `state` 或 `applyAction()`。
 *
 * ── 刻意不做的事 ──────────────────────────────────────────────────────────
 * · **不建 `src/app/router.ts`** —— 属 Story 1.15。这里只有最小的 `view` 态（见下）。
 * · **不写 `runEffects` 的实现** —— 属 Story 1.13（`app/effects-runner.ts`）。
 *   本文件只提供 {@link speakQuestion} 这个**朗读门面**（Story 1.11 / 裁决 3），
 *   它与 `runEffects` 不是一回事：后者 action 驱动，前者是「用户点重听」触发的。
 *   下面是**显式的空位注释**，不是「先造一个空函数占位」——
 *   空函数会让「副作用已接上」这件事看起来成立，而实际上一条音效都没播过。
 * · **不做存档** —— 属 Story 1.15（决策 5 的 `SaveFile`）。
 * · **不含任何战斗规则计算** —— 数值只读 `towerType`（架构硬约束 3），
 *   全部计算在 `core/`。
 *
 * ── 架构硬约束 4：副作用只在 `app/effects-runner.ts` 执行 ─────────────────
 * `applyAction` 的四步顺序里第 3 步就是给它的。顺序本身是架构的一部分
 * （架构 `:660-668`），**不是可以随手调换的样板**：
 *   prev = state.value → next = reduce(prev, action) → runEffects(...) → state.value = next
 * `runEffects` 必须在 `state.value` 赋值**之前**跑 —— 它读的是 prev/next 两个快照，
 * 若放在赋值之后，prev 就已经取不到了。
 */

import { ref, type Ref } from 'vue'

import { entriesOf } from '../content'
import {
  advanceProgress,
  cellKey,
  continueRound,
  createInitialState,
  endBuild,
  placementBlockedReason,
  placeTower,
  reduce,
  resolveRound,
} from '../core'
import type { Action, Progress, State } from '../core'
import { playPronunciation } from '../services/pronunciation'

/**
 * 首个单元号。Epic 1 只有单元 1；「选单元」入口属 Story 1.15，
 * 且 GDD 无选关自由（架构 `:770-782` 专门有纠错说明，Story 1.15 也不得建
 * `UnitSelectView.vue`）。这里写死 1 而不是做成配置，是**有意的**。
 */
const FIRST_UNIT_NUMBER = 1

/**
 * 组装初始 state。
 *
 * ⚠️ **try/catch 归 app 层，这是本文件存在它的唯一理由。**
 *   `createInitialState` 会抛两种错，两种都指向**内容数据**而不是战斗逻辑：
 *     · 空题单 —— 会让开局卡在 `awaiting-answer` 等一个不存在的选项
 *     · 单元号未填档位 —— 静默回退到首档会让整个 Epic 跑在未校准的数值上
 *   在 `core/` 里包一层 try/catch 会把「哪一层的问题」这个信息抹掉，
 *   而报错现场离错误源头（某个单元 JSON）很远 —— 这正是
 *   `eslint.config.js` 里禁 `content/ → core/` 那条规则的理由。
 *
 * 这里**包了再抛**，不加前缀消音：包一层是为了把「app 层在开局组装」这条
 * 上下文写进消息，而不是把原错误换成一个笼统的「开局失败」。
 */
function initialState(): State {
  try {
    return createInitialState({
      unitNumber: FIRST_UNIT_NUMBER,
      deck: entriesOf(FIRST_UNIT_NUMBER),
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(
      `[app] 组装单元 ${FIRST_UNIT_NUMBER} 的初始 state 失败：${reason}。` +
        '这一层错误几乎总是内容数据的问题（单元 JSON 缺失 / 词条为空 / 该单元未填数值档位），' +
        '先跑 `npm run validate:content`。',
      { cause: error },
    )
  }
}

/**
 * 战斗状态 —— 全应用**唯一**的一份。
 *
 * 用 `ref` 而不是 `shallowRef`：`reduce` 每次返回全新对象，浅层替换已足够触发更新；
 * 但深响应式的额外代价在这个规模（场上 ≤ 10 个实体、回合驱动、无连续运动）下可忽略，
 * 而它让 Story 1.13 的 HUD、1.16 的关卡流程不必考虑「我这份 state 是深是浅」。
 */
export const state: Ref<State> = ref(initialState())

// ── 跨局进度（Story 1.13 / 裁决 3）────────────────────────────────────────
//
// ⚠️ **`progress` 与 `state` 是两个不同的生命周期**，这是它必须独立持有的原因：
//   `restartLevel()` 重置的是 `State`（含 `masteredEntryIds`），
//   而「孩子已经学会哪些词」不随重打消失 —— FR58「累计所得只增不减」。
//   若把它塞进 `State`，`RESTART_LEVEL` 一执行进度就归零，孩子会发现
//   「刚才答对的白答了」，而界面上没有任何东西指向原因。
//
// ⚠️ **`currentUnitIndex` 本 story 不推进** —— 单元推进 / 通关 / 失败判定
//   属 Story 1.16（AC-H1 明令不许在本 story 动它）。它现在只是随 `Progress`
//   原样带过，让 1.15 序列化时形状就已经是对的。
//
// ⚠️ **不入 `State`** —— 与 `view` / `selectedEntryId` 不同，`progress` 是
//   **业务事实**而非 UI 态：它要被存档（1.15）。但它仍然不进 reducer，
//   因为 reducer 的输入输出必须是一局之内的状态，而它是跨局的（架构决策 5）。

/**
 * 跨局进度。唯一的变更点是 {@link applyAction} 末尾那行 `advanceProgress`。
 *
 * ⚠️ `currentUnitIndex` 初值是 **0**，与裁决 3 逐字一致（「本 story 初值 0」）。
 *   `[DS]` 交付时曾取 `1`，理由写作「AC-B5『1 起』」—— **AC-B5 全文没有「1 起」**
 *   （它只讲键名逐字锁死与 `readonly` 宽窄）。那是 R-37 的凭记忆改判据。
 *   `[CR]` 2026-10-16 已裁决**改回 0**，并同时删掉 `core/hud.ts` 里自加的「1 起」注释。
 *   ⇒ 0 基还有一条独立佐证：裁决 3 逐字写「**不用** `progress.currentUnitIndex + 1`」，
 *     那句话预设的正是 0 基。
 *   ⚠️ 改这个数前先看 `docs/rules/range-and-balance.md`（R-20..R-24）——
 *     它会被 1.15 **逐字序列化进存档**，基错了只能走迁移。
 *   （显示路径不依赖它：`ProgressBar` 用 `state.value.unitNumber`，故此改动对 HUD 可见输出零影响。）
 */
export const progress: Ref<Progress> = ref({ currentUnitIndex: 0, masteredWordIds: [] })

// ── 视图状态（Story 1.10 / 裁决 1）────────────────────────────────────────
//
// ⚠️ **`view` 是 UI 态，不是战斗态。** 它：
//   · **不进 `State`** —— 不参与 `reduce`，不会有 action 能改它
//   · **不存档** —— 关掉页面重开就该回到 `start`，存档的是进度与对局（决策 5）
//   · **不触发任何副作用** —— 切视图不播音效、不发请求
// 把 UI 态塞进 `State` 的代价是每一种 UI 都要占一个 `Action` 变体与一个 reducer 分支，
// 而它对「这局打成什么样」没有任何影响。

/** 当前显示哪个视图。Story 1.15 建 `router.ts` 时由它接管。 */
export const view: Ref<'start' | 'level'> = ref('start')

/** 进入战场。由 `StartView` 的 `onStart` 在音频解锁**之后**同步调用。 */
export function enterLevel(): void {
  view.value = 'level'
}

// ── 建造交互的视图状态与门面（Story 1.12 / AC-D4、AC-D5、AC-F2、AC-F3）──────
//
// ⚠️ **`selectedEntryId` 与 `view` 同一性质，是 UI 态，不是战斗态。** 它：
//   · **不进 `State`** —— 不参与 `reduce`，不会有 action 能改它
//   · **不存档** —— 关掉页面重开就该回到「没选中任何卡」
//   · **不触发任何副作用** —— 选中一张卡不播音效、不发请求
//
// ⚠️ 为什么它不能进 `State`：那会让「孩子此刻点了哪张卡」占一个 `Action` 变体与
//   一个 reducer 分支，而它对「这局打成什么样」没有任何影响 —— 与架构 `:842-849`
//   对 `State` 的两条纪律（回合内的两处无限等待才属 State）冲突。

/**
 * 当前选中的手牌卡 `entryId`。`null` = 没选中。
 *
 * ⚠️ **必须自动清空**，否则有个很具体的后果：孩子点「开战」进入下一回合，
 *   回来答题时上一张卡**还亮着**，于是他点战场就建出一座他没选过的塔。
 *   清空点有两个，`applyAction` 里的相位检查只是**其中一个**：
 *     ① `applyAction` —— 相位离开 `awaiting-build` 时置 `null`（AC-D4）
 *     ② `placeSelectedAt` —— **成功种下**后自己置 `null`（AC-D5）
 *   ⚠️ **② 不可省**：建塔之后 `phase.kind` **仍然是** `'awaiting-build'`，
 *     ① 那条检查**根本不触发**。守卫 **G42** 专测这一点。
 */
export const selectedEntryId: Ref<string | null> = ref(null)

/**
 * 派发后清掉不该跨阶段残留的 UI 态。
 *
 * ⚠️ 这段代码挂在 `applyAction` 里，所以**每一条** action 路径都会经过它 ——
 *   包括组件自己调的门面。挂在组件里则会漏掉「别的组件 dispatch」的那些路径。
 */
function clearSelectionIfLeavingBuildPhase(next: State): void {
  if (next.phase.kind !== 'awaiting-build') {
    selectedEntryId.value = null
  }
}

/**
 * 派发一个 action —— 状态变更的**唯一**入口。
 *
 * 四步顺序是架构的一部分（见文件头）。任何一步都不可省、不可换位。
 *
 * ⚠️ 组件**只调这个**，不自己改 `state.value`。直接赋值会跳过 `reduce` 的
 *   阶段校验与不变量断言（`assertInvariants`），战场就会推进到一个
 *   「格子与塔不一致」而界面看起来完全正常的态。
 */
export function applyAction(action: Action): void {
  const prev = state.value
  const next = reduce(prev, action)
  // 📎 **空位 —— `runEffects` 属 Story 1.13**（`app/effects-runner.ts`）。
  //
  // 它该在这里做什么：拿 `(action, prev, next)` 三个快照去播音效 / 触发触觉反馈，
  // 即架构硬约束 4 说的「副作用只走 effects-runner」。
  //
  // 为什么**不写一个空函数占位**：空函数会让 `applyAction` 的调用点看起来
  // 「已经接上副作用链路」，而实际上一个音效都没播过 —— 那正是本仓库反复
  // 抓到的「假绿」形态。留注释是诚实的：这一层现在**确实**不做副作用。
  // 接入时它必须排在 `state.value = next` **之前**（见文件头）。
  state.value = next
  // ⚠️ **📎 Story 1.12 在这一步之后加了一行**（AC-D4）：相位离开 `awaiting-build`
  //   时清掉选中态。排在赋值**之后**是刻意的 —— 判据必须读**新**相位。
  //   ⚠️ 这**不是**建塔成功那条路径的兜底：建塔后 `phase.kind` 仍是
  //   `'awaiting-build'`，这行不触发。成功那条见 `placeSelectedAt`（守卫 G42）。
  clearSelectionIfLeavingBuildPhase(next)
  // ⚠️ **📎 Story 1.13 在这一步之后加了第二行**（AC-B3 / 裁决 3）：
  //   把**新** state 的掌握记录并进跨局进度。
  //   排在赋值**之后**是刻意的 —— 必须读 `next`，读 `prev` 就永远慢一拍。
  //   ⚠️ `advanceProgress` 在**没有增量时返回入参本身**（AC-B3 第三条性质），
  //     所以这一行在绝大多数 dispatch 上**不产生引用变更** ⇒ `ProgressBar`
  //     不会每次 action 都重算。守卫 G54 正是靠这一点才有鉴别力。
  progress.value = advanceProgress(progress.value, next)
}

// ── 建造交互的三个门面（Story 1.12 / AC-D5、AC-F2、AC-F3）─────────────────
//
// ⚠️ **门面的存在理由不只是「方便」**：它是「组件层不碰 action 构造器」这条
//   边界的**落点**。`core/actions.ts:11-15` 明写「构造器若开始校验，组件就会有两套
//   入口」—— 反过来，组件直接 `applyAction(placeTower(id, cell))` 就绕过了下面这层
//   禁用判断：孩子点一下撞上一条抛错，界面上白着而没有任何东西指向原因
//   （架构 `:563` 压倒性原则「孩子面前永不出现技术错误」）。
//
// ⇒ **组件只调这三个函数**，不 import `core/actions`。

/**
 * 选中一张手牌卡；**再点同一张则取消**（AC-D2①）。
 *
 * ⚠️ **不校验这张卡此刻能不能建**：能不能放由 `placementBlockedReason` 在
 *   **落子那一格**上回答。选中态是 UI 态，此处多问一次只会把「卡已变灰」与
 *   「这张卡选不了」两件不同的事混在一起。
 */
export function selectTowerCard(entryId: string): void {
  selectedEntryId.value = selectedEntryId.value === entryId ? null : entryId
}

/**
 * 在 `(row, col)` 放下当前选中的卡。返回**是否真的种下了**。
 *
 * ⚠️ **内部先问 `placementBlockedReason`，非 `null` 直接 `return false`、不 dispatch**
 *   （AC-D3：点无效格子「不响应」且**不抛错** —— 组件层不许 throw，架构 `:567-606`）。
 *
 * ⚠️🚨 **成功种下后必须自己把 `selectedEntryId` 置 `null`**（AC-D2③ / AC-D5）：
 *   **别指望 `applyAction` 里那条相位检查兜底** —— 建塔之后 `phase.kind`
 *   **仍然是** `'awaiting-build'`，那条检查**根本不触发**。
 *   这是校验阶段抓出的一个「看起来有守卫、实际恒不触发」的洞，守卫 **G42** 专测它，
 *   变异 **M75** 专打它。
 *
 * @returns `true` = 塔已种下（且选中态已清）；`false` = 什么也没发生。
 */
export function placeSelectedAt(row: number, col: number): boolean {
  const entryId = selectedEntryId.value
  // 未选中任何卡 ⇒ 连判据都不必问（`placementBlockedReason` 需要一个 entryId）。
  if (entryId === null) {
    return false
  }
  if (placementBlockedReason(state.value, entryId, row, col) !== null) {
    return false
  }
  applyAction(placeTower(entryId, cellKey(row, col)))
  // 建塔之后相位仍是 awaiting-build ⇒ 上面的相位检查不触发 ⇒ 必须在这里清。
  selectedEntryId.value = null
  return true
}

/**
 * 「⚔ 开战」按钮的三连 dispatch（AC-F2，裁决 3）。
 *
 * ⚠️ **为什么这条链路归 1.12**：`applyAnswer` 答完立刻切到 `awaiting-build`
 *   （`reducer.ts` 的 `withBuildPhase`），而**没有任何 story 拥有 `END_BUILD`
 *   之后的那段链路** —— 1.13 管 HUD / effects-runner，1.16 管通关 / 失败 / 重打，
 *   两者的 AC 里都没有「结算这一回合」。不接上它，1.12 交付后游戏停在
 *   `awaiting-build`，**1.12 的成果无法真机验证**。
 *
 * ⚠️ **`CONTINUE` 前必须判 `round-over`**（AC-F2 / AC-F3）：
 *   `RESOLVE_ROUND` 在心数归零时把相位直接推到 `level-failed`，而 `applyContinue`
 *   对该相位会 `rejectAction` **抛错** —— 孩子点一次「开战」就看到一个技术错误。
 *   守卫 **G37** 专测这条，变异 **M69** 专打它。
 *
 * ⚠️ **三连是同步的**：`applyAction` 同步替换 `state.value`，中间不需要 `await`。
 * ⚠️ **终态不渲染画面**（AC-F4，属 Story 1.16）：手牌区与开战按钮随相位离开
 *   `awaiting-build` 自动消失，`BattleField` 照常渲染（reducer 已清空战场实体）。
 */
export function startRound(): void {
  // 守卫：按钮不该可点，但要有（AC-F3）—— 与 AC-D6 同一口径。
  if (currentPhaseKind() !== 'awaiting-build') {
    return
  }
  applyAction(endBuild())
  applyAction(resolveRound())
  if (currentPhaseKind() === 'round-over') {
    applyAction(continueRound())
  }
}

/**
 * 当前相位种类 —— **每次调用都重新从 `state.value` 读**。
 *
 * ⚠️ **为什么不能直接写 `state.value.phase.kind === 'round-over'`**：
 *   TypeScript 会把上一次 `if (state.value.phase.kind !== 'awaiting-build')`
 *   之后**return** 的事实窄化下来，于是中间两次 `applyAction` 改变的那份
 *   `state.value` 不被看见，后面那句比较直接编译报错 TS2367
 *   （`'awaiting-build'` 与 `'round-over'` 无交集）。
 *   ⇒ 用函数把「重新读一遍」这件事写进类型里，而不是靠 `as` 逃出去。
 *   本仓库对 `as` 的态度见 §8 教训 3：它常用来把**断言**变得不再断言。
 */
function currentPhaseKind(): State['phase']['kind'] {
  return state.value.phase.kind
}

/**
 * 朗读当前题 —— **朗读通路的唯一门面**（Story 1.11 / AC-D4 / 裁决 3）。
 *
 * ── 为什么组件不直接 import `pronunciation` ─────────────────────────────────
 * `StartView.vue:14-16` 立的纪律是「组件不直接碰 `services/`」，理由是音频解锁的
 * 三步顺序是一条架构约束，写在 `app/audio-unlock.ts` 里肉眼可查。
 * `pronunciation.ts` **完全落在那条理由之内** —— 它持有 `globalThis.AudioContext`
 * 且有解锁时序。
 * ⚠️ **但这条纪律不是「组件不碰整个 `services/`」**：无状态的 `asset-url.ts`
 *   由 1.10 为塔 / 僵尸开过直接 import 的口（守卫 G25 只禁 `pronunciation`）。
 *
 * ── 为什么**不**走 `effects-runner.ts` ──────────────────────────────────────
 * 它的签名 `runEffects(action, prev, next)` 是为 **action 驱动**设计的，
 * 而「孩子主动点重听」**不对应任何 action** —— 硬塞进去是形状错配。
 * 它属 Story 1.13，且那时的用法会是「本 facade 在 action 链路上转调它」。
 *
 * ── 🚨 为什么必须先做 phase 收窄 ──────────────────────────────────────────
 * `Phase` 是六变体联合，其中**五个没有 `question`**（`types.ts:307-314`）。
 * 不收窄就写 `state.value.phase.question` 会在**其余五种阶段**上抛
 * `Cannot read properties of undefined` —— 而卡面在 `awaiting-build` 期间
 * 仍然渲染（`lastQuestion`，AC-C5），点它就是必崩。
 * 写法与 `reducer.ts:180-182` 同型。
 */
export function speakQuestion(): void {
  const phase = state.value.phase
  if (phase.kind !== 'awaiting-answer') return
  // ⚠️ **`entryId` 必须传**（`pronunciation.ts:584-592`）：不传时直接走 TTS，
  //   而 TTS 再失败就只剩一条 console.warn —— `fallbackToRecording` 不播任何音频。
  //   也就是说「TTS 挂了也有录音兜底」这句话**只对传了 entryId 的调用方成立**。
  //
  //   朗读失败**绝不阻断回合**（FR5 / AR37）：`playPronunciation` 内部已保证
  //   「绝不向调用方抛」，所以这里**刻意不加 try/catch** ——
  //   再包一层会把「哪一层出的问题」这个信息抹掉，正是本文件 `initialState()`
  //   上方注释里说的那种损失。
  playPronunciation(phase.question.card.promptText, phase.question.entryId)
}
