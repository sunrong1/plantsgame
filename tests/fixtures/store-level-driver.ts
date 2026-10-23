/**
 * store 侧跑完整一局的驱动 —— **全仓一份**（Story 2.5 / Task 5.3 / 5.6）。
 *
 * ── 为什么它住在 `fixtures/` 而不是某个测试文件里 ────────────────────────────
 *   1.16 的 `tests/app/level-flow.test.ts` 里有一份**同样的**驱动
 *   （答题 → 建塔 → 开战 → 直到通关）。2.5 要验「单元 1 要打 4 局」，
 *   于是又需要一份 —— 若各写各的，两份驱动就会**悄悄漂移**：
 *   一份建塔策略变了、另一份没变 ⇒ 「4 局」这个数字在两份文件里给出不同的答案，
 *   而**两边都绿**（这正是 `level-driver.ts` 文件头记着的那个坑：
 *   「门槛是 4」在两份驱动里给出不同的数）。
 *   ⇒ 本文件是那份驱动的**唯一**出处，`level-flow.test.ts` 与
 *     `tests/app/unit-advance.test.ts` 都从这里 import（R-37：一个判定一个来源）。
 *
 * ── 它与 `level-driver.ts` 的分工 ────────────────────────────────────────────
 *   · `level-driver.ts` 的 `runLevel` 走**纯 reducer 链路**（不碰 store），
 *     用来测数值门槛；
 *   · 本文件走**真 store 门面**（`applyAction` / `selectTowerCard` /
 *     `placeSelectedAt` / `startRound`）—— 因为 2.5 要验的那条判据
 *     （「本单元全部词条已掌握才推进」）**住在 store 的 `applyAction` 里**，
 *     绕开 store 就绕开了被测对象。
 *   ⚠️ **建塔策略仍然复用 `greedyBuildActions`**（R-37：全仓一份建塔策略）。
 *
 * ── 为什么走 store 门面而不是 `applyAction(action)` ──────────────────────────
 *   `placeSelectedAt` 才有「自动清选中态」那条边（守卫 G42），
 *   绕开它等于测的不是孩子实际走的那条路。
 */

import { answer, parseCellKey } from '../../src/core'
import type { OptionId } from '../../src/core'
import { applyAction, placeSelectedAt, selectTowerCard, startRound, state } from '../../src/app/store'
import { greedyBuildActions } from './level-driver'

/** 当前这道题的正确项 id。 */
export function correctOptionIdOfCurrentQuestion(): OptionId {
  const phase = state.value.phase
  if (phase.kind !== 'awaiting-answer') {
    throw new Error(`当前相位是 ${phase.kind}，没有可答的题`)
  }
  const correct = phase.question.card.options.find((o) => o.correct)
  if (correct === undefined) throw new Error('题上没有正确项')
  return correct.id
}

/**
 * 用**真的** store 门面跑完整一局，直到通关。
 *
 * ⚠️ `afterEachAnswer` 挂在**答题之后**（不是整局之后）——
 *   落盘的滞后只在「同一次 dispatch 里既结算了掌握记录、又命中了写盘点」时才露得出来，
 *   而 `ANSWER` 正是那一次 ⇒ 只在整局之后断言「落盘 = 内存」是一条恒绿判据。
 *   理由见 `tests/app/level-flow.test.ts` 的同名注释。
 */
export function driveStoreLevel(afterEachAnswer?: () => void): void {
  let guard = 0
  while (state.value.phase.kind === 'awaiting-answer') {
    guard += 1
    if (guard > 200) throw new Error('跑了一局还没通关 —— 判据或实现变了')

    applyAction(answer(correctOptionIdOfCurrentQuestion()))
    afterEachAnswer?.()

    for (const action of greedyBuildActions(state.value)) {
      if (action.type !== 'PLACE_TOWER') {
        throw new Error(`贪心策略产出了非建塔 action：${action.type}`)
      }
      const { row, col } = parseCellKey(action.cell)
      selectTowerCard(action.entryId)
      if (!placeSelectedAt(row, col)) {
        throw new Error(`贪心策略要建的格子被门面拒了：(row=${row}, col=${col}) —— 两份判据分叉了`)
      }
    }

    startRound()
  }

  if (state.value.phase.kind !== 'level-complete') {
    throw new Error(`跑完一局却停在 ${state.value.phase.kind}`)
  }
}
