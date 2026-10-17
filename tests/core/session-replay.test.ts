/**
 * 会话回放的**行为守卫**（Story 1.17 / AC-B2、AC-B3、G99 / G100）。
 *
 * ── 这个文件守什么 ────────────────────────────────────────────────────────
 * 「把 `{ initialState, actions[] }` 喂进 reducer 就能复现那一瞬」——
 * 这句话是 AR39 的全部内容，也是本项目**唯一**一个「复现」的定义。
 * 它今天**构造上成立**（`core/` 零随机、零时间、零 DOM），
 * 而本文件就是把它从「构造上」钉成「每次 `npm run test` 都在验」。
 *
 * ⚠️ **为什么不写成构建产物级 / CLI 级校验**（1.17 裁决 4）：
 *   `scripts/` 下的工具**不得** import `src/`（R-61），而回放要调 `reduce`。
 *   ⇒ 合法落点只剩 `src/core/` 的纯函数 + 本文件。
 *
 * ── 为什么必须真的走一遍 `JSON.parse`（AC-B3） ────────────────────────────
 * 「回放正确」与「导出的东西能被 `JSON.parse` 打开」是**两件事**。
 * 省掉中间那一步就验不到 `State` 里的循环引用 / `undefined` 键 / `Map`，
 * 而那正是家长拿到一份打不开的 JSON 时看到的症状。
 * ⇒ 本文件全程以 `JSON.stringify` → `JSON.parse` 的**往返**形态断言，
 *   比对用 `JSON.stringify` 的**逐字相等**而不是 `toMatchObject` ——
 *   后者会让「少一个键」照样绿的宽松断言无处藏（R-06 段同款纪律）。
 *
 * ── 会话为什么是真的「一局」而不是碎片（AC-B6） ───────────────────────────
 * 本文件跑 **≥ 3 回合且含一次答错触发重考**：只跑一个回合验的是「一局的碎片」，
 * 而「重考」正是 `masteredEntryIds` 只增不减那条性质唯一会被打破的地方。
 *
 * ── 判据纪律 ──────────────────────────────────────────────────────────────
 * · `DECK` 用合成题单（`synthetic-deck.ts`）—— 本仓库 `tests/core/**` 一律不碰内容层 JSON。
 * · 本文件不做源码变异，变异走 M129。
 */

import { describe, expect, it } from 'vitest'

import {
  answer,
  continueRound,
  createInitialState,
  endBuild,
  reduce,
  replaySession,
  resolveRound,
  type Action,
  type State,
} from '../../src/core'
import { greedyBuildActions } from '../fixtures/level-driver'
import { correctOptionId, makeSyntheticDeck, wrongOptionId } from '../fixtures/synthetic-deck'

/** 5 题合成题单 —— 够跑满 3 回合还留余量。 */
const DECK = makeSyntheticDeck(5, 1)

/** 一局的会话素材：`{ initialState, actions, finalState }`。 */
interface Session {
  readonly initialState: State
  readonly actions: readonly Action[]
  readonly finalState: State
}

/**
 * 跑一局**真**会话并把每一步 action 录下来。
 *
 * ⚠️ 与 `tests/fixtures/level-driver.ts` 的 `runLevel()` 的区别是刻意的：
 *   `runLevel` 只交出**终态与轨迹**，不交出 action 序列；
 *   而本 story 要验的恰恰是「这一串 action 能不能复现终态」。
 *   ⇒ 这里逐条 dispatch 并顺带记账。**两条路径的合法性由 reducer 自己保证**
 *   （非法 action 会 throw），本函数不做任何相位判断。
 *
 * @param correctAt 第 n 回合（1 起）是否答对。传 `false` 会触发重考。
 */
function playSession(correctAt: (turn: number) => boolean, maxTurns = 3): Session {
  const initialState = createInitialState({ unitNumber: 1, deck: DECK })
  const actions: Action[] = []
  let cursor: State = initialState

  const dispatch = (action: Action): State => {
    const next = reduce(cursor, action)
    actions.push(action)
    cursor = next
    return next
  }

  for (let turn = 1; turn <= maxTurns; turn += 1) {
    if (cursor.phase.kind !== 'awaiting-answer') break
    const question = cursor.phase.question
    const correct = correctAt(cursor.turn)
    dispatch(answer(correct ? correctOptionId(question) : wrongOptionId(question)))
    for (const action of greedyBuildActions(cursor)) {
      dispatch(action)
    }
    dispatch(endBuild())
    dispatch(resolveRound())
    if (phaseKind(cursor) === 'round-over') {
      dispatch(continueRound())
    }
  }

  return { initialState, actions, finalState: cursor }
}

/** 走一遍真实的 JSON 往返 —— AC-B3 逐字要求的形态。 */
function jsonRoundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/**
 * 当前相位种类 —— **每次调用都重新读一遍**。
 *
 * ⚠️ 直接写 `cursor.phase.kind === 'round-over'` 会报 TS2367：
 *   循环顶上那句 `if (cursor.phase.kind !== 'awaiting-answer') break` 已经把
 *   `cursor` 收窄成「相位恒为 `awaiting-answer`」，而中间的 `cursor = next`
 *   发生在 `dispatch` 闭包里，TypeScript 看不见那次赋值 ⇒ 收窄不失效
 *   ⇒ 后面那句比较直接编译报错。与 `store.currentPhaseKind()` 同款处置，
 *   **不用 `as` 逃出去**（本仓库对 `as` 的态度见 `store.ts` 的注释）。
 */
function phaseKind(current: State): State['phase']['kind'] {
  return current.phase.kind
}

describe('会话回放（Story 1.17 / G99 / G100）', () => {
  it('G99：把同一份会话喂两次，终态逐字相等（回放是纯函数）', () => {
    const session = playSession((turn) => turn % 2 === 1)

    const first = replaySession(session)
    const second = replaySession(session)

    expect(session.actions.length).toBeGreaterThan(0)
    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
  })

  it('G100：会话走完一遍真 JSON 往返后，回放终态与原终态逐字相等', () => {
    const session = playSession((turn) => turn % 2 === 1)
    const finalText = JSON.stringify(session.finalState)

    // ⚠️ 中间的 `JSON.parse` 不能省 —— 它验的是「导出后打不开」这一类症状，
    //   而那正是 AC-B3 逐字要求落在这里的原因。
    const wire = jsonRoundTrip({ initialState: session.initialState, actions: [...session.actions] })

    expect(JSON.stringify(replaySession(wire))).toBe(finalText)
  })

  it('G100：导出的 JSON 自足 —— 不带任何内容层引用也能回放', () => {
    const session = playSession((turn) => turn % 2 === 1)

    const wire = jsonRoundTrip({ initialState: session.initialState, actions: [...session.actions] })

    // `deck` 是整局的题单全集（`State` 的既有性质），所以 `initialState` 自带全部内容。
    // 若将来有人给 `State` 加了循环引用，这一条会先红 —— 那正是它的价值（AC-B4）。
    expect(wire.initialState.deck.length).toBe(DECK.length)
    expect(JSON.stringify(replaySession(wire))).toBe(JSON.stringify(session.finalState))
  })

  it('AC-B6：会话至少 3 回合且含一次答错触发重考', () => {
    const allCorrect = playSession(() => true)
    const withWrong = playSession((turn) => turn !== 2)
    const answerCount = (s: Session) => s.actions.filter((a) => a.type === 'ANSWER').length

    expect(answerCount(allCorrect)).toBe(3)
    expect(answerCount(withWrong)).toBe(3)
    expect(withWrong.actions.some((a) => a.type === 'CONTINUE')).toBe(true)

    // ⚠️ **重考的正面证据不是「多答了几题」** —— 答错不推进 `turn`，
    //   所以答了几题的**条数**与全对时相同。真正的信号是
    //   `masteredEntryIds`（只增不减）落后于答题条数：
    //   全对时两者相等，答错一次就差一。
    //   ⚠️ `AnswerAction` 逐字只有 `{ type, optionId }`（不带 `entryId`），
    //   所以「同一个 entryId 被答两次」在 action 序列上**看不出来** ——
    //   只能从 state 侧数。这正是「记输入序列」这条设计的边界。
    expect(allCorrect.finalState.masteredEntryIds.length).toBe(answerCount(allCorrect))
    expect(withWrong.finalState.masteredEntryIds.length).toBeLessThan(answerCount(withWrong))
  })

  it('M129 的反面：少跑最后一条 action 时终态不同 —— 证明这条判据有鉴别力', () => {
    const session = playSession(() => true)

    const truncated = replaySession({
      initialState: session.initialState,
      actions: session.actions.slice(0, -1),
    })

    // ⚠️ 这不是守卫本身，是**守卫的鉴别力自检**：若这里也相等，
    //   说明「少跑一条」这个变异根本不会改变结果，G99/G100 就是装饰守卫（R-51）。
    expect(JSON.stringify(truncated)).not.toBe(JSON.stringify(session.finalState))
  })
})
