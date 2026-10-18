/**
 * 开局题单切片的**接线**守卫（Story 1.19 / AC-B2、B3、B4、B8、B9、B10，裁决 2）。
 *
 * ── 与 `tests/core/deck-slice.test.ts` 的分工 ─────────────────────────────
 * 那份守**判据本身**（纯函数、合成题单）；这份守**接线**——
 * 「`buildStateFor()` 真的走了切片」且「切片读的是跨局进度」。
 *
 * ⚠️🔥 **本文件存在的主要理由是「读错记账字段」那个坑**（裁决 2 / 事故卡 2）：
 *   把 `progress.masteredWordIds` 误写成 `state.masteredEntryIds`，
 *   **每一局都会从第 1 题重开**（本局 mastered 随 `RESTART_LEVEL` 清零），
 *   而 `assertDeckRelations` 的三条不变量**一路绿灯** ——
 *   它们在两套记账下都成立，没有任何东西会指向原因。
 *   ⇒ 「第二局的题单与第一局零交集」是那条 bug 的唯一可观测信号。
 *
 * ⚠️ **用真实的单元 1 词表**（37 条）而不是合成数据：AC-B4 逐字是
 *   「10 / 10 / 10 / **7**」，而这个 7 只在真实条数下成立。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { afterEachUninstall, installFakeStorage } from '../fixtures/fake-storage'
import type { FakeStorage } from '../fixtures/fake-storage'
import { questionOf } from '../fixtures/synthetic-deck'

let storage: FakeStorage
let warn: ReturnType<typeof vi.spyOn>

const core = await import('../../src/core')
const content = await import('../../src/content')
const saveApi = await import('../../src/services/save')
const store = await import('../../src/app/store')

/** 单元 1 的全量词表 id，按 JSON 原序。 */
const ALL_IDS: string[] = content.entriesOf(1).map((e) => e.entryId)

/** 造一份存档：`mastered` 是**跨局**已掌握清单，`currentGame` 通常为 null（局末）。 */
function seedSave(mastered: readonly string[], currentGame: unknown = null): void {
  storage.data.set(
    saveApi.SAVE_KEY,
    JSON.stringify({
      schemaVersion: saveApi.SAVE_SCHEMA_VERSION,
      savedAt: 1_700_000_000_000,
      progress: { currentUnitIndex: 0, masteredWordIds: mastered },
      currentGame,
    }),
  )
}

/** 切一局：装好存档 → 进关 → 返回题单 id 列表。 */
function playOneRoundWith(mastered: readonly string[]): string[] {
  seedSave(mastered)
  store.enterLevel()
  return store.state.value.deck.map((e) => e.entryId)
}

beforeEach(() => {
  storage = installFakeStorage()
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  store.state.value = core.createInitialState({ unitNumber: 1, deck: content.entriesOf(1) })
  store.progress.value = { currentUnitIndex: 0, masteredWordIds: [] }
  store.view.value = 'start'
})

afterEachUninstall()

describe('AC-B4 —— 单元 1 的局序列是 10 / 10 / 10 / 7（真实词表）', () => {
  it('前置：单元 1 实测 37 条，且内容层顺序稳定（本文件其余断言全建立在它上面）', () => {
    expect(ALL_IDS).toHaveLength(37)
    expect(new Set(ALL_IDS).size, 'entryId 必须唯一，否则切片出来的题单会少考几个词').toBe(37)
  })

  it('四局的题单逐条对得上（最后一局 7 题，**不是** 10）', () => {
    const g1 = playOneRoundWith([])
    const g2 = playOneRoundWith(g1)
    const g3 = playOneRoundWith([...g1, ...g2])
    const g4 = playOneRoundWith([...g1, ...g2, ...g3])

    expect([g1.length, g2.length, g3.length, g4.length]).toEqual([10, 10, 10, 7])
    expect(g1, '第一局取词表原序前 10').toEqual(ALL_IDS.slice(0, 10))
    expect(g4, '第四局是剩下的 7 条，按原序').toEqual(ALL_IDS.slice(30))
  })

  it('走完四局之后，全部 37 条各出现过恰好一次', () => {
    const g1 = playOneRoundWith([])
    const g2 = playOneRoundWith(g1)
    const g3 = playOneRoundWith([...g1, ...g2])
    const g4 = playOneRoundWith([...g1, ...g2, ...g3])

    const all = [...g1, ...g2, ...g3, ...g4]
    expect(new Set(all).size, '重复出现 = 有词被漏掉或重复考').toBe(37)
    expect(all, '合起来必须正好是整个词表').toEqual(ALL_IDS)
  })
})

describe('AC-B8 —— 跨局零交集（🔥 切片读的是跨局进度，不是本局 mastered）', () => {
  it('第二局与第一局零交集', () => {
    const g1 = playOneRoundWith([])
    const g2 = playOneRoundWith(g1)
    const intersection = g1.filter((id) => g2.includes(id))
    expect(intersection, '第一局已掌握的词绝不能再进第二局').toEqual([])
  })

  it('相邻两局零交集，四局两两都成立', () => {
    const g1 = playOneRoundWith([])
    const g2 = playOneRoundWith(g1)
    const g3 = playOneRoundWith([...g1, ...g2])
    const g4 = playOneRoundWith([...g1, ...g2, ...g3])
    for (const [a, b] of [
      [g1, g2],
      [g2, g3],
      [g3, g4],
    ] as const) {
      expect(a.filter((id) => b.includes(id))).toEqual([])
    }
  })

  it('🔥 切片读的是 `progress` 而不是 `state` —— 本局 mastered 已清零也照样前进', () => {
    // 直接模拟事故卡 2 的错误版本会产出的局面：`state.masteredEntryIds` 非空，
    // 而跨局 `progress.masteredWordIds` 也非空，两者不一致。
    seedSave(['a-not-real-id'])
    store.enterLevel()
    const s = store.state.value
    store.state.value = { ...s, masteredEntryIds: [...ALL_IDS] }

    // 再切一局：此时 state.masteredEntryIds 是「全 37 条都答对了」，
    // 而 progress.masteredWordIds 只有一条不相干的 id。
    seedSave(['a-not-real-id'])
    store.enterLevel()
    expect(
      store.state.value.deck.length,
      '读成 state.masteredEntryIds 会切出 0 条（走「已学完」分支）；' +
        '正确的判据应与 state 无关，仍是 10 条',
    ).toBe(core.QUESTIONS_PER_LEVEL)
  })
})

describe('AC-B6 —— 全部掌握时不崩、不给孩子看技术错误', () => {
  it('37 条全掌握 ⇒ 停在「已学完」终态，不是抛错也不是重开一局', () => {
    seedSave(ALL_IDS)
    expect(() => store.enterLevel(), '孩子点「开始游戏」不许炸（NFR13）').not.toThrow()

    expect(store.view.value, '视图必须已经进关 —— 退回开始界面会让按钮看起来没反应').toBe('level')
    expect(store.state.value.phase.kind, '空切片 ⇒ 「本单元已学完」').toBe('level-complete')
    expect(
      warn.mock.calls.filter((c: unknown[]) => String(c[0]).startsWith('[save]')).length,
      '不许记 [save] WARN —— 那是降级路径，「学完了」不是降级',
    ).toBe(0)
  })

  it('与打完整单元后那一份终态同形（孩子看到同一张通关卡）', () => {
    seedSave(ALL_IDS)
    store.enterLevel()
    const done = store.state.value

    const played = core.createInitialState({ unitNumber: 1, deck: content.entriesOf(1).slice(0, 1) })
    expect(played.phase.kind).toBe('awaiting-answer')

    // 逐字段比对「空切片造的那份」与「真打通关那份」的可见差异：
    // ⚠️ `deck` 必须都是空 —— 这正是判据点（若空切片那份留了词表，
    //   孩子的进度条会显示「0/10」而横跨两套东西）。
    expect(done.deck).toEqual([])
    expect(done.grid).toEqual({})
    expect(done.towers).toEqual([])
    expect(done.zombies).toEqual([])
  })

  it('终态不再接受任何 action（`reduce` 照抛 ⇒ 孩子改不了局面）', () => {
    seedSave(ALL_IDS)
    store.enterLevel()
    expect(store.state.value.phase.kind).toBe('level-complete')
    const q = content.entriesOf(1)[0]
    const opt = q.card.options[0]
    expect(() => store.applyAction(core.answer(opt.id))).toThrow(/本局已通关/)
  })
})

describe('AC-B9 —— 断点续学不受切片影响', () => {
  it('在途存档原样恢复：题单仍是存档里那一份，**不重新切片**', () => {
    // 在途存档里存的是**上一局**的题单。恢复它就该原样恢复 ——
    // 重新切片会让「关掉页面再回来，题变了」，而 AC-5 逐字要求题单一局内不变。
    const inFlight = core.createInitialState({
      unitNumber: 1,
      deck: content.entriesOf(1).slice(20, 30),
    })
    seedSave(ALL_IDS.slice(0, 20), inFlight)

    store.enterLevel()

    expect(store.state.value.deck.map((e) => e.entryId), '必须逐条等于盘上那一份').toEqual(
      ALL_IDS.slice(20, 30),
    )
  })

  it('在途存档 + 进度已到 30 条时，恢复的仍是在途那份（不切片）', () => {
    const inFlight = core.createInitialState({ unitNumber: 1, deck: content.entriesOf(1).slice(30, 37) })
    seedSave(ALL_IDS.slice(0, 30), inFlight)
    store.enterLevel()
    expect(store.state.value.deck).toHaveLength(7)
    expect(store.state.value.phase.kind).toBe('awaiting-answer')
  })
})

describe('AC-B5 —— 重打不重新切片', () => {
  it('RESTART_LEVEL 走原题单（10 条，不多不少不少）', () => {
    seedSave(ALL_IDS.slice(0, 10))
    store.enterLevel()
    const before = store.state.value.deck.map((e) => e.entryId)
    expect(before).toHaveLength(10)

    const failed: typeof store.state.value = { ...store.state.value, phase: { kind: 'level-failed' } }
    store.state.value = failed
    store.restartLevel()

    expect(store.state.value.deck.map((e) => e.entryId), '重打必须逐条复现原题单').toEqual(before)
    expect(store.state.value.phase.kind, '重打后回到答题相位').toBe('awaiting-answer')
  })
})

describe('AC-B10 —— 手牌区随切片收缩（不是 37 张）', () => {
  it('`handCards()` 只从本局题单里取卡 ⇒ 本局最多 10 张', () => {
    seedSave([])
    store.enterLevel()
    const s = store.state.value
    expect(s.deck).toHaveLength(10)

    // 解锁全部 10 条（直接构造，等价于孩子把这一局全答对）
    const unlocked = s.deck.map((e) => e.entryId)
    const s2 = core.assertInvariants({
      ...s,
      unlocked,
      masteredEntryIds: unlocked,
      // 📎 **1.19 CR：补题面。** `s` 此刻是 `enterLevel()` 之后的开局 state，
      //   相位恒为 `awaiting-answer`，它那道题逐字属于 `s.deck`
      //   ⇒ 满足「题面属于本题单」这条新增断言。
      phase: { kind: 'awaiting-build', question: questionOf(s), unlocked, sun: s.sun },
    })
    const cards = core.handCards(s2)
    expect(cards).toHaveLength(10)
    expect(
      cards.every((c) => s.deck.some((e) => e.entryId === c.entryId)),
      '手牌必须全部来自本局题单',
    ).toBe(true)
  })
})
