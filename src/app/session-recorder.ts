/**
 * 会话录制器（Story 1.17 / AC-B1、AC-B3）。
 *
 * ── 它记什么 ───────────────────────────────────────────────────────────────
 * 一局的**输入序列**：起始 state + 每一次 dispatch 的 action。
 * 有了这两样，`core/session-replay.ts` 就能把那一瞬原样重演 ——
 * 而那正是 AR39 说的「可复现的现场」。
 *
 * ⚠️ **为什么不记 `next`**：`next` 完全可以由 `(initialState, actions)` 重算出来
 *   （`replaySession` 正是这么做的），记下来只会让导出文件大一倍并引入
 *   「两份可能对不上」的风险。`recordStep` 的第三个参数留着是为了将来做
 *   「步进回放 / 单步对比」不必改签名 —— **它当前不参与导出**，
 *   守卫 **G98** 逐条盯着这件事（把 `next` 的痕迹混进导出就会露出来）。
 *
 * ── 为什么住在 `app/` 而不是 `core/` ───────────────────────────────────────
 * 本模块只做记账，零 DOM、零 Vue，所以「它其实可以放 core」——
 * 但它的**调用点**在 `store.applyAction`（app 层），而它的存在理由是
 * 「会话导出的文件格式」（跨进程、跨版本），与 `core/session-replay.ts` 的
 * 「进程内回放入参形状」是两件事。⚠️ 两处刻意**不共享类型**（R-08 禁 `core/` 依赖 `app/`），
 *   理由与 `session-replay.ts` 的注释同款。
 *
 * ── 🔥 「录制常开，导出按需」 ────────────────────────────────────────────────
 * AC 逐字要求「每回合记录一条」—— 那不是一个开关。
 * 代价是每次 dispatch push 一个引用：`State` 全是 `readonly` 的普通对象，
 * **push 引用不产生深拷贝**，单次成本 O(1)。
 * ⇒ 真正的「导出」是面板上的一个按钮（Story 1.17 的 `DebugPanel`），
 *   而本模块的 `exportSession()` 只交出**引用**，序列化留给调用方。
 *
 * ── ⚠️ 不深拷贝、不冻结 ────────────────────────────────────────────────────
 * `State` 的 `grid` 刻意是 `Record` 而不是 `Map`（`types.ts` 的注释逐字解释过：
 *   为了可序列化）⇒ 整份 `State` 可 `JSON.stringify` ⇒ 录制的快照天然自足。
 * ⚠️ **反过来**：哪天有人给 `State` 加了循环引用，`tests/core/session-replay.test.ts`
 *   的 **G100**（真 `JSON.parse` 往返）会立刻红 —— 那正是它的价值。
 */

import type { Action, State } from '../core'

/**
 * 导出会话的**文件格式** —— AR39 的落点，也是 Story 3.1 的输入契约。
 *
 * ⚠️ **形状是契约**：Story 3.1 逐字要求「每个问题都附带一份
 *   `{ initialState, actions[] }` 的 session JSON」。改这个形状就是改 3.1 的契约，
 *   必须走 `/gds-correct-course`。
 *
 * ⚠️ 与 `core/session-replay.ts` 的 `ReplayInput` **结构相同但刻意不共享类型**。
 */
export interface SessionExport {
  readonly initialState: State
  readonly actions: readonly Action[]
}

/**
 * 已录下的会话。`initialState === null` 表示**一条 action 都没录过**。
 *
 * ⚠️ 用 `null` 而不是「拿当前 state 当起点」：起点必须来自**第一条 action 之前的快照**，
 *   而调用点在 `applyAction` 里、`state.value` 被替换**之前**，那一刻拿到的就是对的。
 */
interface Recording {
  initialState: State | null
  actions: Action[]
}

/** 模块级单例 —— 会话是**全应用唯一**的一份，与 `state` 同样性质。 */
const recording: Recording = { initialState: null, actions: [] }

/**
 * 记一步 dispatch。**唯一的调用点在 `store.applyAction` 的最前面。**
 *
 * ⚠️ **必须排在 `reduce` 之前**：`initialState` 要的是「第 1 条 action **之前**的 state」，
 *   而 `reduce(prev, action)` 返回的是**新对象**，不会改 `prev` ——
 *   但排在它之后会让「起点」这件事依赖「reduce 不改入参」这条隐含性质。
 *   排在前面则由本函数自己保证，与 reducer 的实现无关。
 *
 * @param action 本次 dispatch 的 action —— 记的是**玩家点的**那一个，
 *   **不是**任何 dev 补偿后的结果（AC-B6 / 裁决 6：补偿不进回放，
 *   否则回放出来的局面带 dev 态，那不叫复现）。
 * @param prev dispatch 之前的 state 快照（作为第一条时的 `initialState`）。
 * @param next dispatch 之后的 state —— **当前不参与导出**，留参数是为了将来做步进回放。
 */
export function recordStep(action: Action, prev: State, next: State): void {
  if (recording.initialState === null) {
    recording.initialState = prev
  }
  recording.actions.push(action)
  // ⚠️ `next` 当前刻意不用。删掉它会让将来「步进回放」改签名，
  //   留着它则让本模块**现在**就带着一个不参与导出的参数 ——
  //   守卫 G98 逐条盯着这件事，所以它不会悄悄变成第二个真值源。
  void next
}

/**
 * 交出已录的会话。
 *
 * ⚠️ **一条 action 都没录过时**，起点退回**当前** `state` 的调用方兜底 ——
 *   本模块拿不到 `state`（那是 `store.ts` 的 ref），所以由调用方决定。
 *   本函数此时交出 `initialState: null`，那是「还没录过」的唯一信号。
 */
export function exportSession(): SessionExport {
  if (recording.initialState === null) {
    throw new Error(
      '[session] 还没有可导出的会话：一条 action 都没 dispatch 过。' +
        '导出一个空起点会让回放从一个孩子从没见过的局面开始 —— 那不叫复现。',
    )
  }
  return { initialState: recording.initialState, actions: recording.actions }
}

/**
 * 清空录制 —— 挂在 `RESTART_LEVEL` 上（AC-B5）。
 *
 * ⚠️ 判据是 `action.type` 而不是相位：重打是**新一局**，
 *   上一局的 `initialState` 对新一局毫无意义（而且是从失败局面开始的那一份）。
 */
export function resetSession(): void {
  recording.initialState = null
  recording.actions.length = 0
}

/** 是否已经录到过至少一条 action（面板据此决定「导出会话」按钮可不可点）。 */
export function isRecording(): boolean {
  return recording.initialState !== null
}
