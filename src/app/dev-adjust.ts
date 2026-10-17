/**
 * 🔥 dev-only 状态补偿缝（Story 1.17 / 裁决 5、6）。
 *
 * ── 为什么它存在，而不是三个新的 `Action` 变体 ─────────────────────────────
 * | 开关 | 字面可实现？ | 实测原因 |
 * |---|---|---|
 * | 无限心 | ❌ | `reducer.ts:538` 的 `assertCounters` 逐字 `hearts > HEARTS` 即抛错 |
 * | 无限阳光 | ✅ | `assertCounters` 对 `sun` 只查 `>= 0`，**没有上界** |
 * | 直接通关 | ✅ | 补满 `masteredEntryIds` 后走**真** `CONTINUE` |
 *
 * ⇒ **不新增 `DEBUG_*` action、不改 `core/`、不改 `balance.ts`**
 * （R-20：心数上限是产品决策，改之前先问人；守卫 **G107** 盯住 `core/` 一个字没动）。
 *
 * ── 缝插在哪 ──────────────────────────────────────────────────────────────
 * `store.applyAction` 的第 2 步（`reduce`）**之后**、第 3 步（写盘 + 播副作用）
 * **之前**。理由是裁决 5 的判据二：`SAVE` effect 携带的那份必须与内存里孩子看到的
 * 一致，否则就出现「盘上一份、内存一份」。守卫 **G109** 钉住这个顺序。
 *
 * ── 🚨 补偿后的 state **不再过 `assertInvariants`** ─────────────────────────
 * `reduce` 每个分支的出口都过那道断言（`reducer.ts:115-133`），补偿发生在**其后**
 * ⇒ 那道断言**一次都碰不到补偿后的值**。
 * ⇒ 「三条判据都落在合法区间内」这条前提只能靠**注释 + 守卫 G108**兜，
 *   不能指望 `reduce` 顺手验一遍。
 *
 * ── 三条边界（裁决 6）──────────────────────────────────────────────────────
 * 1. **要写盘** —— 补偿后的值会被 `SAVE` 带走。保持读写一致比「dev 不写盘」更重要。
 * 2. **不进回放** —— 会话录制器挂在 `applyAction` 的录制点，拿到的是**玩家点的 action**。
 *    回放必须复现真实输入才叫复现；带 dev 态的局面那不叫复现。
 * 3. **不改 `balance.ts`** —— 一个字都不改。
 */

import { reactive } from 'vue'

import { HEARTS } from '../core'
import type { State } from '../core'

/** 三个调试开关的值。**面板只读它、只经 store 的门面改它**（守卫 G110）。 */
export interface DevFlags {
  infiniteHearts: boolean
  infiniteSun: boolean
  directWin: boolean
}

/**
 * 三个开关的**唯一**持有处。
 *
 * ⚠️ 用 `reactive` 而不是普通对象：面板是 Vue 组件，勾上开关后 HUD 要跟着变。
 *   普通对象的属性变化**不触发**更新 ⇒ 面板会显示一个已经不再生效的状态。
 *
 * ⚠️ **默认全关** —— 不是「默认值待定」，是判据：没人点过的面板不得改变对局。
 *   `tests/app/dev-adjust.test.ts` 第一组用例逐字守着这三条 `false`。
 */
export const devFlags: DevFlags = reactive({
  infiniteHearts: false,
  infiniteSun: false,
  directWin: false,
})

/** dev 补偿把阳光抬到的下限。**不是平衡数值** —— 它只出现在这个文件里。 */
const INFINITE_SUN = 9999

/**
 * 对一份刚算完的 state 做 dev 补偿。**全关时原样返回入参**（同一个引用）。
 *
 * ⚠️ **全关时必须返回入参本身、不能 spread 一次**：`reduce` 每步都返回新对象，
 *   补偿缝再无条件 spread 会让「引用不变 ⇔ 本次 dispatch 无增量」这条性质
 *   （守卫 G54 靠它判有无增量）整条失真。
 *
 * @param reduced `reduce` 刚算出的那份 —— 玩家**真的**输入得到的结果
 * @param prev 本次 dispatch 之前那份 —— 「无限心」要靠它知道本来有几颗心
 * @param flags 三个开关；默认读模块级的 {@link devFlags}
 */
export function devAdjust(reduced: State, prev: State, flags: DevFlags = devFlags): State {
  if (!flags.infiniteHearts && !flags.infiniteSun && !flags.directWin) {
    return reduced
  }
  let next = reduced

  // ── 1. 无限心（裁决 5 判据 1）────────────────────────────────────────────
  //
  // ⚠️📎 **必须连带改相位，这是实现期发现的偏离 6**：裁决 5 逐字写的是
  //   「`hearts → Math.max(1, hearts)`」。**照抄那条达不到裁决 5 自己声明的语义** ——
  //   `applyResolve`（`reducer.ts:306-314`）在同一次 `reduce` 里既把心数夹到 0，
  //   **又**把相位直接推成 `level-failed`。补偿发生在其后，只改心数**改不回相位**
  //   ⇒ 对局照样失败，而面板上那个开关还亮着。
  //   ⇒ 这里把 `level-failed` 一并翻回 `round-over`：`round-over` 正是
  //     「这一回合结算完了，等玩家点开战」那个相位，也就是**差一点就归零**时
  //     本该到达的地方。玩家与真实规则的差别只剩「这一颗心不扣」。
  if (flags.infiniteHearts && reduced.phase.kind === 'level-failed') {
    // ⚠️ 夹在 **1** 而不是「回满」：`Math.max(1, prev.hearts)` 保证
    //   「本来就只剩 1 颗」与「本来有 3 颗」这两种情况都停在合法区间内，
    //   而心数**始终落在 `[0, HEARTS]`**（`assertCounters` 的硬边界）。
    next = { ...next, hearts: Math.max(1, prev.hearts), phase: { kind: 'round-over' } }
  }

  // ── 2. 无限阳光（裁决 5 判据 2）──────────────────────────────────────────
  // 只抬不降 ⇒ 恒满足 `sun >= 0`。`assertCounters` 对 sun 没有上界，所以这条合法。
  if (flags.infiniteSun && next.sun < INFINITE_SUN) {
    next = { ...next, sun: INFINITE_SUN }
  }

  // ── 3. 直接通关（裁决 5 判据 3）──────────────────────────────────────────
  //
  // ⚠️ **只在 `awaiting-build` 上补**（实现期实测的硬约束）：
  //   `assertDeckRelations`（`reducer.ts:513-516`）逐字判
  //   「`phase.kind === 'awaiting-answer'` 且当前题已在 `masteredEntryIds` 里」⇒ 抛错。
  //   在 `awaiting-answer` 上补满 = 当场把对局推进非法态 ⇒ 面板一勾就崩。
  //   `awaiting-build` 意味着「这道题已经答完、不在问了」，正是补满的安全窗口。
  //
  // ⚠️ **不许在这里直接造 `level-complete`**：`applyContinue`（`reducer.ts:328-345`）
  //   会走真 `CONTINUE`，`nextQuestion` 返回 `null` ⇒ `reduce` 真实产出终态。
  //   若这里自己造一个 `level-complete`，1.16 的 G87–G96 与 1.5 的整组 reducer
  //   守卫就全都失去了意义（R-41）。
  if (flags.directWin && next.phase.kind === 'awaiting-build') {
    next = { ...next, masteredEntryIds: next.deck.map((entry) => entry.entryId) }
  }

  return next
}

/** 心数的合法上界 —— 供面板文案与守卫引用，避免 `HEARTS` 的数字在两处各写一遍。 */
export const DEV_MAX_HEARTS = HEARTS

/**
 * 家长在 URL 上带 `?debug=1` 时，面板是否应该挂出来（AC-D4 / 裁决 11）。
 *
 * ⚠️ **`import.meta.env.DEV` 这道门必须在读 URL 之前** ——
 *   否则生产环境里任何人加一个 `?debug=1` 就能打开调试面板，
 *   那正是 **NFR22**（生产环境不得出现调试入口）要防的事。
 *   守卫 **G112** 逐字守这个顺序，并配一条「从 URL 起算」的探针做反向自测。
 *
 * ⚠️ **它只管「面板挂不挂」，不管三个开关的开或关** ——
 *   那三个默认全关（AC-D4），要开得在面板上点。URL 参数不预开任何开关：
 *   一个被 URL 静默改过的对局，连「面板上那个勾是怎么来的」都答不上来。
 *
 * ⚠️ **生产构建里整段被静态替换成 `false`**：Vite 把 `import.meta.env.DEV`
 *   换成字面量 `false` 后，`URLSearchParams` 这条路径成为死代码并被 tree-shake。
 */
export function isDebugPanelRequested(): boolean {
  if (!import.meta.env.DEV) return false
  const search = typeof globalThis.location === 'undefined' ? '' : globalThis.location.search
  return new URLSearchParams(search).get('debug') === '1'
}

// ── 三个开关的门面（AC-D2：组件只调 `store` 的门面，守卫 G110）────────────
//
// ⚠️ **为什么是三个 `boolean` 入参而不是一个「反转」的无参函数**：
//   无参的 `toggle()` 会让面板「点了到底开没开」只能靠回读 `devFlags` 才知道，
//   而点击后组件要立刻据此重画 —— 读的是异步更新的状态，中间那一帧是错的。
//   显式入参让「这一帧该是什么」是确定的。代价是调用点要多写一个 `= !`。

/** 开关「无限心」。 */
export function devSetInfiniteHearts(on: boolean): void {
  devFlags.infiniteHearts = on
}

/** 开关「无限阳光」。 */
export function devSetInfiniteSun(on: boolean): void {
  devFlags.infiniteSun = on
}

/** 开关「直接通关」。 */
export function devSetDirectWin(on: boolean): void {
  devFlags.directWin = on
}
