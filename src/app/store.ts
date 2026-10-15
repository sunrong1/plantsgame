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
import { createInitialState, reduce } from '../core'
import type { Action, State } from '../core'
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
