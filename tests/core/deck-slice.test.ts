/**
 * 题单切片判据（Story 1.19 / AC-B1..B9，裁决 1、2）。
 *
 * ── 这份测试在钉什么 ──────────────────────────────────────────────────────
 * 1.19 把「一局 = 10 题」从设计口径落成实现（裁决 1）。切片判据住在 `core/`，
 * 是 R-02「组件/app 层不得出现第二份判据」的落点，也是 AC-B1 逐字要求的
 * 「纯函数 + 不 import `content/` + 不碰 `State`」。
 *
 * ⚠️ **合成题单，不 import `src/content/`**：`tests/core/` 整层都不引内容层
 *   （与 `hud.ts` 文件头同款纪律）—— 这里要验的是判据的**行为**
 *   （顺序、去重、边界），不是单元 1 的 37 条内容。
 *   真实词表那条（37 ⇒ 10/10/10/7）由 `tests/app/store-deck-slice.test.ts` 覆盖。
 *
 * ⚠️ **`deck` 在一局内不变**（AC-B7）：切片只发生在开局组装那一刻，
 *   而 `RESTART_LEVEL` 走的是 `createInitialState({ deck: state.deck })`。
 *   那条路径由本文件末尾的「重打不重新切片」一组覆盖。
 */

import { describe, expect, it } from 'vitest'

import {
  HEARTS,
  QUESTIONS_PER_LEVEL,
  answer,
  assertInvariants,
  continueRound,
  createInitialState,
  createUnitCompletedState,
  endBuild,
  isCorrect,
  reduce,
  resolveRound,
  restartLevel,
  sliceDeckForLevel,
} from '../../src/core/index.js'
import type { DeckEntry, State } from '../../src/core/types.js'

/** 造一条题单条目。`id` 即 `entryId`；卡型与塔型不参与本判据，但要填合法。 */
function entry(id: string): DeckEntry {
  const cardId = `c-${id}`
  return {
    entryId: id,
    wordId: id,
    towerType: 'direct',
    card: {
      kind: 'word',
      promptText: `prompt ${id}`,
      options: [
        { id: `${cardId}-ok`, text: id, correct: true },
        { id: `${cardId}-no`, text: `x-${id}`, correct: false },
      ],
    },
  }
}

/** 造一份 n 条的题单，顺序即数组顺序（单元 JSON 的原序）。 */
function deckOf(n: number, offset = 0): DeckEntry[] {
  return Array.from({ length: n }, (_, i) => entry(`e${i + offset}`))
}

/** entryId 列表 —— 切片结果的断言只比 id 序列，比整个对象更可读。 */
function ids(entries: readonly DeckEntry[]): string[] {
  return entries.map((e) => e.entryId)
}

/** 把一局真打通关（每题答对、不建塔），返回 `CONTINUE` 造出的终态。 */
function playToComplete(unitNumber: number, deck: readonly DeckEntry[]): State {
  // ⚠️ **调用方必须给一份「不打塔也输不了」的短题单**（本文件只用 1 条）：
  //   不建塔时每回合有僵尸抵达房子，10 题 ⇒ 第 6 回合 3 心耗尽 ⇒ `level-failed`，
  //   `reduce` 在那个相位下对 `CONTINUE` **抛错**（这正是 AC-D4 的失败门槛）。
  //   本条判据要的是**终态形状**，1 题足够 ⇒ 不必在夹具里建塔
  //   （建了就得顺带断言塔位合法性，那是 1.12 的判据）。
  let s = createInitialState({ unitNumber, deck })
  for (let i = 0; i < deck.length; i += 1) {
    const phase = s.phase
    if (phase.kind !== 'awaiting-answer') throw new Error('夹具坏了：不在答题相位')
    const correct = phase.question.card.options.find((o) => isCorrect(phase.question.card, o.id))
    if (correct === undefined) throw new Error('夹具坏了：正确项缺失')
    s = reduce(s, answer(correct.id))
    s = reduce(s, endBuild())
    s = reduce(s, resolveRound())
    s = reduce(s, continueRound())
  }
  return s
}

describe('sliceDeckForLevel —— 一局题单切片（Story 1.19 / AC-B1、B4、B8）', () => {
  it('取词表原序的前 10 条（AC-B1 口径的第一句）', () => {
    expect(ids(sliceDeckForLevel(deckOf(37), []))).toEqual([
      'e0', 'e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8', 'e9',
    ])
  })

  it('不足 10 条时就是剩余条数（AC-B4：37 ⇒ 10/10/10/**7**）', () => {
    expect(ids(sliceDeckForLevel(deckOf(7, 30), []))).toEqual([
      'e30', 'e31', 'e32', 'e33', 'e34', 'e35', 'e36',
    ])
  })

  it('恰好 10 条时全部取走', () => {
    expect(sliceDeckForLevel(deckOf(10), [])).toHaveLength(QUESTIONS_PER_LEVEL)
  })

  it('空词表切出空题单，**不抛**（B6 的前置：抛不抛是 store 那层的责任）', () => {
    expect(sliceDeckForLevel([], [])).toEqual([])
  })

  it('已掌握条目被排除，其余按原序补位（AC-B8：跨局零交集）', () => {
    // 掌握 e0/e1/e2 ⇒ 本局从 e3 起取 10 条，**不是**「跳过 3 条再取前 10」——
    // 那样会取到 e0..e9 里被掌握的那 3 条，两局之间就有交集。
    expect(ids(sliceDeckForLevel(deckOf(37), ['e0', 'e1', 'e2']))).toEqual([
      'e3', 'e4', 'e5', 'e6', 'e7', 'e8', 'e9', 'e10', 'e11', 'e12',
    ])
  })

  it('掌握的是词表中段时按原序补位，不是「跳过再重数」', () => {
    expect(ids(sliceDeckForLevel(deckOf(37), ['e10', 'e11']))).toEqual([
      'e0', 'e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8', 'e9',
    ])
  })

  it('全部掌握 ⇒ 空题单（不崩，落点见 createUnitCompletedState）', () => {
    const mastered = deckOf(37).map((e) => e.entryId)
    expect(sliceDeckForLevel(deckOf(37), mastered)).toEqual([])
  })

  it('掌握集合里含词表之外的 id 时不报错、不影响结果（存档可能来自别的内容版本）', () => {
    expect(ids(sliceDeckForLevel(deckOf(37), ['not-in-this-unit', 'e0']))).toEqual([
      'e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8', 'e9', 'e10',
    ])
  })

  it('不改动传入的词表（纯函数，R-01）', () => {
    const source = deckOf(37)
    const before = ids(source)
    sliceDeckForLevel(source, ['e0'])
    expect(ids(source)).toEqual(before)
  })

  it('输出是新数组：就地改动结果不影响源词表', () => {
    const source = deckOf(37)
    const result = sliceDeckForLevel(source, [])
    expect(result).not.toBe(source)
    result.splice(0, result.length)
    expect(source).toHaveLength(37)
  })

  it('每局题数是单一常量，等于 10（裁决 1 的落点，AC-F5 第一条）', () => {
    expect(QUESTIONS_PER_LEVEL).toBe(10)
  })
})

describe('createUnitCompletedState —— 切片为空时的「已学完」形态（Story 1.19 / AC-B6）', () => {
  it('相位是 level-complete，战场三件套全空', () => {
    const state = createUnitCompletedState(1)
    expect(state.phase.kind).toBe('level-complete')
    expect(state.towers).toEqual([])
    expect(state.grid).toEqual({})
    expect(state.zombies).toEqual([])
  })

  it('与「CONTINUE 判定全部答对」产出的终态**同形**（AC-B6：孩子看到的画面一致）', () => {
    // 这条是 B6 的鉴别力：判据不能只是「不抛」，得是**同一个画面**。
    // ⚠️ 只比四个字段 —— `hearts` / `sun` / `turn` 是打了一局之后的残留值，
    //   「已学完」那份没有对应的局可打，比它们会把判据钉到一个无意义的约束上。
    const played = playToComplete(1, deckOf(1))
    expect(played.phase.kind).toBe('level-complete')

    const empty = createUnitCompletedState(1)
    expect({
      phase: empty.phase,
      towers: empty.towers,
      grid: empty.grid,
      zombies: empty.zombies,
    }).toEqual({
      phase: played.phase,
      towers: played.towers,
      grid: played.grid,
      zombies: played.zombies,
    })
  })

  it('心数与阳光取开局值（不是打了一局之后的残值）', () => {
    const empty = createUnitCompletedState(1)
    const fresh = createInitialState({ unitNumber: 1, deck: deckOf(3) })
    expect(empty.hearts).toBe(HEARTS)
    expect(empty.hearts).toBe(fresh.hearts)
    expect(empty.sun).toBe(fresh.sun)
    expect(empty.turn).toBe(1)
  })

  it('三份记账字段全空 —— 复用 `createInitialState` 的初值（裁决 2 的不变量论证）', () => {
    const empty = createUnitCompletedState(1)
    expect(empty.masteredEntryIds).toEqual([])
    expect(empty.unlocked).toEqual([])
    expect(empty.skippedEntryIds).toEqual([])
  })

  it('守得住 createInitialState 的全部不变量（assertInvariants 抛就红）', () => {
    expect(() => assertInvariants(createUnitCompletedState(1))).not.toThrow()
  })

  it('终态**拒绝**每一条 action（与真打通关的那份同样不可操作）', () => {
    // `reduce` 在 `level-complete` 下走 `rejectAction` 抛错 ⇒ 「已学完」那份
    // 也必须抛，否则孩子能在通关画面上改局面。
    const s = createUnitCompletedState(1)
    expect(() => reduce(s, answer('c-e0-ok'))).toThrow(/本局已通关/)
  })

  // 📎📎 **`[CR]` 2026-10-18 加的反向断言 —— 空题单 + 重打是本 story 造出的新组合。**
  //   `createUnitCompletedState` 的 `deck: []` 与 `RESTART_LEVEL` 的
  //   `createInitialState({ deck: state.deck })` 是一对**互斥**的东西：
  //   后者对空题单**抛错**（「题单不能为空」）。今天不相撞**只因为**一道相位门 ——
  //   `reduce` 在 `level-complete` 下先 `rejectAction`。
  // ⚠️ 那道门是**唯一**的护栏，而它挂在相位上而不是挂在「空题单」上：
  //   1.18 的 `devAdjust` 已经干过一次「连带改相位」的事（`dev-adjust.ts`），
  //   所以「不可达」不等于「安全」。
  // ⇒ 三条断言把「不可达」和「不可达的理由」都钉住。
  it('空题单终态 + 重打 ⇒ 抛错，且抛的是「本局已通关」而不是「题单不能为空」', () => {
    const s = createUnitCompletedState(1)
    expect(s.deck, '夹具前提：这个终态必须是空题单').toEqual([])
    expect(() => reduce(s, restartLevel())).toThrow(/本局已通关/)
    // ⚠️ 关键的反向断言：出错原因必须是**相位门**，不是空题单那条抛错。
    //   若是后者，就说明有人绕过/改动了相位门 —— 那正是要防的形态。
    expect(() => reduce(s, restartLevel())).not.toThrow(/题单不能为空/)
  })

  it('「不可达」的理由是相位门，不是空题单这条不变量（把相位摘掉就会撞）', () => {
    // 这条不是测现状，是**把护栏的边界画出来**：若相位门哪天失效，
    // 撞上的是「题单不能为空」—— 一个孩子面前的技术错误（NFR13 要消灭的东西）。
    const s: State = { ...createUnitCompletedState(1), phase: { kind: 'level-failed' } }
    expect(
      () => reduce(s, restartLevel()),
      '空题单 + level-failed 竟然没抛 —— createInitialState 的空题单守卫被改坏了，' +
        '那么真实路径上那道相位门就是唯一护栏，而它一失效就是孩子面前的技术错误',
    ).toThrow(/题单不能为空/)
  })

  it('存档往返后仍是终态（AC-B6：断点续学不能把「已学完」变回一局）', () => {
    const roundTripped = JSON.parse(JSON.stringify(createUnitCompletedState(3)))
    expect(roundTripped.phase.kind).toBe('level-complete')
    expect(roundTripped.unitNumber).toBe(3)
  })

  it('单元号未填档位时抛错（与 createInitialState 同款，不静默回退）', () => {
    expect(() => createUnitCompletedState(999)).toThrow()
  })
})

describe('重打不重新切片（Story 1.19 / AC-B5、AC-B7）', () => {
  it('RESTART_LEVEL 复用原题单（AC-B5：`createInitialState({ deck: state.deck })`）', () => {
    // 打一局到失败，再重打 ⇒ 题单逐条不变。
    // ⚠️ 判据是**逐条 id 序列**而不是长度 —— 长度相同但内容换了一批，
    // 「重打换了题」这个回归照样逃过去。
    const deck = deckOf(QUESTIONS_PER_LEVEL)
    // 直接造一份失败态：`RESTART_LEVEL` 只在 `level-failed` 下合法，
    // 而「怎么打输」与本条判据无关（那是 1.16 的 AC）。
    const failedState: State = {
      ...createInitialState({ unitNumber: 1, deck }),
      phase: { kind: 'level-failed' },
    }

    const restarted = reduce(failedState, restartLevel())
    expect(ids(restarted.deck)).toEqual(ids(deck))
    expect(restarted.deck).toHaveLength(QUESTIONS_PER_LEVEL)
  })

  it('一局之内题单内容不变（AC-B7 / AC-5「题单原样复用」）', () => {
    const deck = deckOf(QUESTIONS_PER_LEVEL)
    let s = createInitialState({ unitNumber: 1, deck })
    const before = ids(s.deck)
    const phase = s.phase
    if (phase.kind !== 'awaiting-answer') throw new Error('夹具坏了')
    const correct = phase.question.card.options.find((o) => isCorrect(phase.question.card, o.id))!
    s = reduce(s, answer(correct.id))
    expect(ids(s.deck)).toEqual(before)
    s = reduce(s, endBuild())
    expect(ids(s.deck)).toEqual(before)
    s = reduce(s, resolveRound())
    expect(ids(s.deck)).toEqual(before)
    s = reduce(s, continueRound())
    expect(ids(s.deck)).toEqual(before)
  })
})
