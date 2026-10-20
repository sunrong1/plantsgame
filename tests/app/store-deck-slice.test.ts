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

/**
 * 真打一局到通关，返回 `CONTINUE` 造出的终态。
 *
 * ⚠️ 题单只给 **1 条**：判据要的是**终态的形状**，不必在夹具里建塔
 *   （建了就得顺带断言塔位合法性，那是 1.12 的判据）。
 * ⚠️ 走**真实 reducer**（答题 → 建造 → 结算 → 继续），不是手拼 state ——
 *   手拼出来的那份与 `createUnitCompletedState` 是同一个函数的产物，
 *   拿它比「同形」是**自己和自己比**。
 */
function playToComplete(unitNumber: number): ReturnType<typeof core.createInitialState> {
  const deck = content.entriesOf(1).slice(0, 1)
  let s = core.createInitialState({ unitNumber, deck })
  for (let i = 0; i < deck.length; i += 1) {
    const phase = s.phase
    if (phase.kind !== 'awaiting-answer') throw new Error('夹具坏了：不在答题相位')
    const correct = phase.question.card.options.find((o) => core.isCorrect(phase.question.card, o.id))
    if (correct === undefined) throw new Error('夹具坏了：正确项缺失')
    s = core.reduce(s, core.answer(correct.id))
    s = core.reduce(s, core.endBuild())
    s = core.reduce(s, core.resolveRound())
    s = core.reduce(s, core.continueRound())
  }
  return s
}

/**
 * 判据本体：把 `n` 局题单**两两**比一遍，返回**有交集的每一对**。
 *
 * ⚠️📎 **`[CR]` 第七轮补**：首版只比了三个**相邻**对，而用例标题逐字写着
 *   「四局**两两**都成立」⇒ 判据粒度**粗于它声称要守的东西**（R-51 第四种形态）。
 *   ⇒ 现在比**全部 C(n,2) 对**。
 */
function pairwiseOverlaps(rounds: readonly (readonly string[])[]): { label: string; intersection: string[] }[] {
  const hits: { label: string; intersection: string[] }[] = []
  for (let i = 0; i < rounds.length; i += 1) {
    for (let j = i + 1; j < rounds.length; j += 1) {
      const intersection = rounds[i].filter((id) => rounds[j].includes(id))
      if (intersection.length > 0) {
        hits.push({ label: `第 ${i + 1} 局 vs 第 ${j + 1} 局`, intersection })
      }
    }
  }
  return hits
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
    const rounds = [g1, g2, g3, g4] as const
    // ⚠️ 判据比的是**全部 6 对**（C(4,2)），不是三个相邻对 —— 见 `pairwiseOverlaps`。
    expect(
      pairwiseOverlaps(rounds),
      '四局两两都有交集 —— 同一个词被考了两次',
    ).toEqual([])
  })

  it('判据自测：**非相邻**的一对撞上时，判据必须看得见（R-53）', () => {
    // ⚠️ 没有这一条，上面那条在「只漏非相邻对」的缺陷下照样绿 ——
    //   而那正是首版漏检的形态。
    // ⚠️ 造的是「g1 与 g4 撞了同一条，而三个**相邻**对都干净」：
    //   首版判据（只比相邻三对）在这里**全绿**。
    const rounds = [
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
      ['g', 'h', 'i'],
      ['a', 'j', 'k'],
    ]
    const hits = pairwiseOverlaps(rounds)
    expect(hits, 'g1 与 g4 撞了「a」，判据必须报出来').toHaveLength(1)
    expect(hits[0]?.label).toBe('第 1 局 vs 第 4 局')
    expect(hits[0]?.intersection).toEqual(['a'])
    // 反向：四局互不相交时，判据不许报任何东西（否则这条判据恒红）。
    expect(
      pairwiseOverlaps([
        ['a'],
        ['b'],
        ['c'],
        ['d'],
      ]),
      '判据把干净的输入也报成了有交集 ⇒ 这条判据恒红',
    ).toEqual([])
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

    // ⚠️📎 **`[CR]` 第七轮修：首版造了一个 `played` 却**从不拿它做比较**。**
    //   首版造的是 `createInitialState({ deck: 1 条 })` —— 那是**开局态**
    //   （`phase.kind === 'awaiting-answer'`），而后面四条断言比的是
    //   `done` 与**字面量** `[]` / `{}` ⇒ `played` 是个摆设，
    //   「与真打通关那份同形」这件事**根本没被比较过**。
    //
    //   ⇒ 现在造一份**真打通关**的终态（走 reducer：答题 → 建造 → 结算 → 继续），
    //     再与 `done` 逐字段比。
    const played = playToComplete(1)
    expect(played.phase.kind, '前置：这份必须真的是「打完了」的终态').toBe('level-complete')

    // 逐字段比对「空切片造的那份」与「真打通关那份」的**可见**差异：
    // ⚠️ 只比这四项（与 `tests/core/deck-slice.test.ts` 的同款判据逐字一致）——
    //   `hearts` / `sun` / `turn` 是**打了一局之后的残留值**，
    //   「已学完」那份没有对应的局可打，比它们会把判据钉到无意义的约束上。
    expect(done.phase, '🔴 两份终态的相位必须一致 —— 孩子看到的是同一张通关卡').toEqual(
      played.phase,
    )
    expect(done.grid).toEqual(played.grid)
    expect(done.towers).toEqual(played.towers)
    expect(done.zombies).toEqual(played.zombies)
    // ⚠️ `deck` **不参与**上面的比较：真打通关那份还留着它打过的那几条
    //   （打一局 = 10 题，题单不会自己清空），而「已学完」那份是空题单。
    //   ⇒ 空题单是**这一份自己的**判据，单独断言（进度条不许显示「0/10」）。
    expect(done.deck, '🔴 空切片造的那份留了词表 —— 孩子的进度条会显示「0/10」').toEqual([])
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

describe('G174 —— 真实单元 1 上「相邻不同型」由代码保证（Story 1.20 / A1、裁决 3）', () => {
  /**
   * 判据本体：真的跑一次切片、真的逐对比较 `towerType`。
   * ⚠️ 放在本文件而不是 `tests/core/deck-slice.test.ts`，是因为它**必须吃真实内容层**
   *   （`tests/core/` 整层不引 `src/content/`，那是同款纪律）。
   */
  function sameTypeAdjacencies(deck: readonly { towerType: string }[]): number[] {
    const hits: number[] = []
    for (let i = 1; i < deck.length; i += 1) {
      if (deck[i].towerType === deck[i - 1].towerType) hits.push(i)
    }
    return hits
  }

  it('前置：单元 1 在 JSON 原序上今天恰好已合规（那正是「巧合」的那一半）', () => {
    // ⚠️ 这条不是为了让守卫红，而是**把巧合显式记下来**：
    //   实测 2026-10-19 全 37 条相邻重复 0、分布 {direct:13, slow:13, aoe:11}。
    //   若哪天录入的人改了 JSON 而让这条变红，那是**巧合没了**，
    //   规则仍在（G173 / 本组的后两条），但那条恒等捷径也没了 —— 值得知道。
    const raw = content.entriesOf(1)
    expect(sameTypeAdjacencies(raw), '单元 1 的 JSON 原序不再天然合规').toEqual([])
  })

  it('切片结果在真实词表上没有任何相邻同型（A1）', () => {
    // 🔥 这条是「规则由代码保证」与「规则由手写 JSON 碰巧满足」的**分界线**。
    //
    // ⚠️📎 **`[CR]` 2026-10-19 重写**：原版四个 `mastered` 全是「前 N 条」这种**连续**切法，
    //   而单元 1 在 JSON 原序上本就合规（紧邻的「前置」那条已断言）⇒ 任何连续切片都是
    //   一段合规序列的**子序列**，相邻关系是它的子集 ⇒ **必然合规**。
    //   ⇒ 把整个重排删掉，这一条照样全绿。主评审实测（变异 CR1）确认：69 条里
    //   **只有 `G173①` 红**，本组三条全绿。**这一条原本对本特性零鉴别力。**
    //
    // 现在这一轮用的是**留下两处「洞」**的进度：pending 因此不是连续段，
    // 其原始顺序**自己就带相邻同型**（下面那条自测钉住这个前提）⇒ 拆掉重排它必红。
    const holey = ALL_IDS.filter(
      (_, i) => ![10, 13].includes(i) && i < 29,
    )
    for (const [label, mastered] of [
      ['开局（连续 10 条）', [] as string[]],
      ['第一局后（连续 20 条）', ALL_IDS.slice(0, 10)],
      ['前三局后（连续 30 条）', ALL_IDS.slice(0, 30)],
      ['留下两处「洞」的非连续进度', holey],
    ] as const) {
      const deck = core.sliceDeckForLevel(content.entriesOf(1), [...mastered])
      expect(
        sameTypeAdjacencies(deck),
        `${label}（已掌握 ${mastered.length} 条）的那一局仍有相邻同型 —— 重排没生效`,
      ).toEqual([])
    }
  })

  it('判据自测：非连续进度那一轮的**原始顺序本来就违规**（R-53 —— 没有它这条是恒绿的）', () => {
    // ⚠️ 没有这一条，上面第 4 轮就退化成「和另外三轮一样的恒绿断言」——
    //   这正是主评审实测到的那一整类零覆盖。
    const mastered = new Set(
      ALL_IDS.filter((_, i) => ![10, 13].includes(i) && i < 29),
    )
    const rawPending = content.entriesOf(1).filter((e) => !mastered.has(e.entryId))
    expect(rawPending.length, '夹具前提：pending 必须够切一局（≥ 10 条）').toBeGreaterThanOrEqual(10)
    expect(
      sameTypeAdjacencies(rawPending),
      '这一轮已经合规了 ⇒ 拆掉重排它也绿 ⇒ 白白浪费一轮断言',
    ).not.toEqual([])
  })

  it('四局连起来仍然正好是整个词表（原序承诺未被重排破坏，A2 的接线侧）', () => {
    // ⚠️ 与上面那条 AC-B4 的那条**逐字重复**不是冗余：
    //   AC-B4 那条守「切片对不对」，这条守「重排有没有偷偷换词」——
    //   两者在「重排丢了一条」时红，在「重排把 e3 挪到了别局」时红的形态不同。
    const g1 = playOneRoundWith([])
    const g2 = playOneRoundWith(g1)
    const g3 = playOneRoundWith([...g1, ...g2])
    const g4 = playOneRoundWith([...g1, ...g2, ...g3])
    expect([...g1, ...g2, ...g3, ...g4], '重排动过了词条归属 —— 原序承诺被破坏').toEqual(ALL_IDS)
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
