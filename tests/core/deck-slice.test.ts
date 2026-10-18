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
 *
 * 📎 **Story 1.20 续写了这份文件的夹具**：塔型默认改成三型轮转（见 `deckOf` 的注释），
 *   并在末尾新增「相邻不同型」一组 —— 守卫 G173。
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
import type { DeckEntry, State, TowerType } from '../../src/core/types.js'

/**
 * 三种塔型的轮转 —— 单元 1 在 JSON 序上就是这个形状
 * （实测 2026-10-19：前 10 条 = `direct slow aoe` 轮转 ×3 余 `direct`，全 37 条相邻重复 0）。
 */
const TOWER_TYPE_CYCLE: readonly TowerType[] = ['direct', 'slow', 'aoe']

/** 造一条题单条目。`id` 即 `entryId`；卡型不参与本判据，但要填合法。 */
function entry(id: string, towerType: TowerType = 'direct'): DeckEntry {
  const cardId = `c-${id}`
  return {
    entryId: id,
    wordId: id,
    towerType,
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

/**
 * 造一份 n 条的题单，顺序即数组顺序（单元 JSON 的原序）。
 *
 * ⚠️ **塔型默认走 `TOWER_TYPE_CYCLE` 轮转，不再一律 `'direct'`**（Story 1.20 / B3）。
 *   改之前这份文件的 34 条用例**零条能感知塔型构成** —— 夹具逐字注释还写着
 *   「卡型与塔型不参与本判据」，于是 1.20 新增的「相邻不同型」规则
 *   **根本不可能被这套用例回归到**。默认改成轮转之后，这 34 条用例全部落在
 *   「已合规输入」这一支上，钉的是 A2（恒等变换）。
 *   要造别的形状走第三个参数；要造全同型（A3 的降级路径）走 {@link allDirectDeckOf}。
 */
function deckOf(
  n: number,
  offset = 0,
  types: readonly TowerType[] = TOWER_TYPE_CYCLE,
): DeckEntry[] {
  return Array.from({ length: n }, (_, i) => entry(`e${i + offset}`, types[i % types.length]))
}

/** 造一份**全部同型**的题单 —— 「相邻不同型」在它上面数学无解（Story 1.20 / A3）。 */
function allDirectDeckOf(n: number, offset = 0): DeckEntry[] {
  return deckOf(n, offset, ['direct'])
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

// ── G173 ─────────────────────────────────────────────────────────────────

describe('G173 —— 相邻两题的塔型不同（Story 1.20 / A1..A3、裁决 1）', () => {
  /**
   * 判据本体：**真的去跑重排、真的逐对比较 `towerType`**。
   *
   * ⚠️📎 **必须是行为判据，不能是源码扫描**（AC B5）：1.19 的变异 **M172′** 留下过
   *   实测记录 —— 「不许写死数字」+「必须出现 `entriesOf(...).length`」两条文本判据
   *   对 `entriesOf(1).length * 1.62` 这种**等比缩放**全绿。
   *   文本判据盯的是「写法像不像」，本函数盯的是「输出对不对」。
   *
   * @returns 相邻同型的**下标**（即 `deck[i]` 与 `deck[i-1]` 同型的那些 `i`）。
   *   返回下标而不是布尔/计数：变异之后能逐字报出「第几题还撞着」，
   *   而一个 `count === 0` 只能告诉你「红了」，不知道红在哪。
   */
  function sameTypeAdjacencies(deck: readonly DeckEntry[]): number[] {
    const hits: number[] = []
    for (let i = 1; i < deck.length; i += 1) {
      if (deck[i].towerType === deck[i - 1].towerType) hits.push(i)
    }
    return hits
  }

  /** 一份**故意非合规**的题单：塔型逐位给定，形状刻意贴着「连着同型」造。 */
  const VIOLATING = ['direct', 'direct', 'slow', 'direct', 'aoe', 'aoe', 'slow'] as const

  it('判据自测：它能在「非合规」上报出下标、在「合规」上报空（R-53）', () => {
    expect(
      sameTypeAdjacencies(deckOf(7, 0, VIOLATING)),
      '判据在已知非合规的夹具上报不出下标 —— 守卫是装饰（R-53）',
    ).toEqual([1, 5])
    expect(
      sameTypeAdjacencies(deckOf(7)),
      '判据把天然合规的轮转题单也判成违规 —— 判据错了（R-53）',
    ).toEqual([])
    expect(sameTypeAdjacencies([]), '空题单不该有任何相邻对').toEqual([])
  })

  it('① 非合规输入被重排成「相邻不同型」（A1）', () => {
    const source = deckOf(7, 0, VIOLATING)
    const out = sliceDeckForLevel(source, [])
    expect(
      sameTypeAdjacencies(out),
      '重排之后仍有相邻两题同型 —— 一局打完孩子会连着见同一株植物',
    ).toEqual([])
    // ⚠️📎 **`[CR]` 2026-10-19 按 R-57 改判据**：这一条原先逐字钉住输出等于
    //   `['e0','e2','e1','e4','e3','e5','e6']`，那是**旧单向贪心恰好产出的那一个排列**。
    //   判据比豁免项细：合规排列**不唯一**，钉死一个就会把「换一种同样正确的排法」
    //   判成回归 —— 真正的判据是上面那条「零相邻同型」。
    //   「不是空转」交给下面这两条，它们不依赖具体排列：⑤ 钉确定性，⑥ 钉内容守恒。
    expect(ids(out), '输入本来就不合规，输出却与输入同序 —— 重排没生效').not.toEqual(ids(source))
  })

  it('② 已合规输入返回原序，逐条 id 与塔型都不变（A2 —— 硬 AC）', () => {
    // 🔥 这条是**保住 10+ 条现有测试的唯一办法**：
    //   `tests/app/store-deck-slice.test.ts` 逐字断言「四局连起来 == 整个词表」，
    //   任何非恒等的重排都会打红它。**看到那条红了，先怀疑这里，不要改那条测试。**
    const source = deckOf(10)
    const out = sliceDeckForLevel(source, [])
    expect(ids(out), '已合规输入被改了顺序 —— 原序承诺被悄悄废掉').toEqual(ids(source))
    expect(
      out.map((e) => e.towerType),
      '连塔型都变了 —— 那就不是重排而是换题',
    ).toEqual(source.map((e) => e.towerType))
  })

  it('③ 全同型输入降级为原序，**且不抛错**（A3）', () => {
    // ⚠️ 全同型时「相邻不同型」数学上无解。这条降级路径**不是可选的优雅性**——
    //   本文件原先 34 条用例的夹具全是 `'direct'`，一条抛错或死循环的实现在那里当场炸掉。
    const source = allDirectDeckOf(10)
    expect(() => sliceDeckForLevel(source, [])).not.toThrow()
    expect(ids(sliceDeckForLevel(source, [])), '无解时必须退回原序').toEqual(ids(source))
  })

  it('④ 局部无解时降级，且**降级到最优**，不抛错（A3 的部分形态）', () => {
    // `direct slow slow slow slow`：4 条 slow / 1 条 direct，n=5 ⇒ `maxCount 4 > ceil(5/2)=3`
    //   ⇒ 「相邻不同型」在数学上**无解**。
    // 与 ③ 分开写成两条：一条判「全同型」，一条判「局部无解」，
    // 二者的坏法不同，**判据粒度不能粗于豁免项**（R-51 第四种形态 / AC 3.3）。
    //
    // ⚠️📎 **`[CR]` 2026-10-19 按 R-57 改判据**：这一条原先断言输出等于原序
    //   `['e0'..'e4']` 且 `sameTypeAdjacencies` 等于 `[2,3,4]`（3 处）。
    //   两个问题：① 「降级 = 保持原序」只在**前面没换过**的输入上成立，
    //   那是实现细节不是 AC（A3 只承诺不抛错）；② `[2,3,4]` 比**最优**还差一处
    //   ——穷举实测该多重集的最少相邻同型数是 **2**，旧的贪心产出 3 处，
    //   等于把「做得不够好」钉成了期望值。
    // ⇒ 现在只断言**真 AC**：不抛错、条数守恒、相邻同型数 = 最优 2 处。
    const source = deckOf(5, 0, ['direct', 'slow', 'slow', 'slow', 'slow'])
    let out: readonly DeckEntry[] = []
    expect(() => {
      out = sliceDeckForLevel(source, [])
    }, '无解时必须降级，绝不抛错').not.toThrow()
    expect(out, '降级不许靠丢条目达成').toHaveLength(source.length)
    expect(
      sameTypeAdjacencies(out).length,
      '无解时的降级必须落到**最优**（该多重集的最少相邻同型数是 2），不是随便凑',
    ).toBe(2)
  })

  it('⑤ 确定性：同一份输入连跑三次，逐条输出完全相同（A4 / 零随机）', () => {
    // ⚠️ 洗牌型实现在这一条上会红（随机源每次不同），而**本仓库已经踩过它**：
    //   洗牌会让同一次存档恢复在不同机器上得到不同题单。
    const source = deckOf(10, 0, VIOLATING)
    const first = ids(sliceDeckForLevel(source, []))
    for (let run = 0; run < 2; run += 1) {
      expect(ids(sliceDeckForLevel(source, [])), `第 ${run + 2} 次输出与第一次不同 —— 不是纯函数`).toEqual(
        first,
      )
    }
  })

  it('⑥ 条数与内容守恒：只换位置，不增不减不改内容（A1 不许靠丢条目达成）', () => {
    const source = deckOf(10, 0, VIOLATING)
    const out = sliceDeckForLevel(source, [])
    expect(out, '条数变了 —— 重排不许增删').toHaveLength(source.length)
    expect(
      out.map((e) => e.entryId).sort(),
      '条目集合变了 —— 重排不许改内容',
    ).toEqual(source.map((e) => e.entryId).sort())
  })

  it('⑦ 不改动传入的两个参数（R-01 / A4 的纯函数那一半）', () => {
    const source = deckOf(10, 0, VIOLATING)
    const mastered = ['e3']
    const beforeEntries = ids(source)
    const beforeMastered = [...mastered]
    sliceDeckForLevel(source, mastered)
    expect(ids(source), '就地改动会改掉内容层那一份词表').toEqual(beforeEntries)
    expect(mastered, '就地改动会改掉存档层那一份进度').toEqual(beforeMastered)
  })

  it('⑧ 输出是新数组：就地改动结果不影响源词表', () => {
    const source = deckOf(10, 0, VIOLATING)
    const result = sliceDeckForLevel(source, [])
    expect(result).not.toBe(source)
    result.splice(0, result.length)
    expect(source).toHaveLength(10)
  })
})

// ── G175 ─────────────────────────────────────────────────────────────────

describe('G175 —— 「有解就必须排干净」（Story 1.20 `[CR]` 补，A1 的可解分支）', () => {
  /**
   * ⚠️📎 **这一组存在的理由：G173 对 F1 那一整类坏法零覆盖。**
   *
   * 主评审 2026-10-19 实测（变异 **CR1**）：把
   * `return reorderAdjacentTowerTypes(pending.slice(…))` 改回 `return pending.slice(…)`、
   * `unit-01.json` **一个字不动** ⇒ **69 条里只有 `G173①` 红，`G174` 三条全绿**。
   * 根因：`G173①` 的 `VIOLATING` 恰好是贪心**能**修的形状，`G173④` 的夹具**真无解**。
   * ⇒ 「尾部同型**且有解**」这一类，此前一条夹具都没有。
   */
  function sameTypeAdjacencies(deck: readonly DeckEntry[]): number[] {
    const hits: number[] = []
    for (let i = 1; i < deck.length; i += 1) {
      if (deck[i].towerType === deck[i - 1].towerType) hits.push(i)
    }
    return hits
  }

  /** 可解判据：`maxCount ≤ ceil(n/2)`（鸽笼的紧条件）。n=5 的 4:1 ⇒ 无解。 */
  function isSolvable(types: readonly TowerType[]): boolean {
    const counts = new Map<TowerType, number>()
    for (const t of types) counts.set(t, (counts.get(t) ?? 0) + 1)
    return Math.max(...counts.values()) <= Math.ceil(types.length / 2)
  }

  /** 旧单向贪心在这个形状上会放弃：同型集中在**尾部**，伙伴只在**左侧**。 */
  const TAIL_RUN: readonly TowerType[] = ['direct', 'direct', 'slow', 'slow', 'slow']

  it('判据自测：夹具本身「非合规」且「有解」（R-53 —— 两条前提都要先证明）', () => {
    expect(sameTypeAdjacencies(deckOf(5, 0, TAIL_RUN)), '夹具必须本来就不合规').toEqual([1, 3, 4])
    expect(isSolvable(TAIL_RUN), '夹具必须是有解的，否则这条会退化成 G173④ 那条降级判据').toBe(true)
    expect(isSolvable(['direct', 'slow', 'slow', 'slow', 'slow']), '对照组：4:1 确实无解').toBe(false)
  })

  it('⑨ 尾部同型且有解 → 排干净（旧实现在这里会放弃，A1）', () => {
    // ⚠️ 这一条正是旧实现的漏网形状：同型集中在尾部，而往后找不到伙伴。
    const out = sliceDeckForLevel(deckOf(5, 0, TAIL_RUN), [])
    expect(
      sameTypeAdjacencies(out),
      '尾部同型且**有解**（2:3，max 3 ≤ ⌈5/2⌉）仍留了相邻同型 —— 有解就必须排干净',
    ).toEqual([])
  })

  it('⑩ 单元 1 的真实反例形状（单点录入扰动）也能排干净', () => {
    // 把单元 1 前 10 条的第 8 题由 `slow` 改成 `direct` —— 这是 Epic 2 手工录入
    // 13 个新单元时**预期内的失败模式**，不是假想的输入。
    // `[CR]` 实测旧实现在这里产出 `… direct aoe direct direct`（末两题同型）。
    const perturbed: readonly TowerType[] = [
      'direct', 'slow', 'aoe', 'direct', 'slow', 'aoe', 'direct', 'direct', 'aoe', 'direct',
    ]
    expect(isSolvable(perturbed), '反例必须是有解的').toBe(true)
    expect(
      sameTypeAdjacencies(sliceDeckForLevel(deckOf(10, 0, perturbed), [])),
      '单点录入扰动导致的重排失败 —— 正是本 story 要拦的那一类',
    ).toEqual([])
  })

  it('⑪ 穷举：长度 1..10 的**全部**三型序列 —— 有解的必零相邻同型，无解的不抛错', () => {
    // ⚠️ 为什么穷举而不用抽样：A1 的成立与否只取决于塔型的**多重集 + 排列**，
    //   3 型 × 长度 ≤ 10 的空间只有 88572 条 —— 小到可以**证明**，不必抽样。
    //   「抽样没抽到」与「不存在反例」在守卫里长得一模一样（R-50 第 4 条的教训）。
    const TYPES: readonly TowerType[] = ['direct', 'slow', 'aoe']
    let solvable = 0
    let unsolvable = 0
    for (let n = 1; n <= 10; n += 1) {
      for (let code = 0; code < 3 ** n; code += 1) {
        let rest = code
        const types: TowerType[] = []
        for (let i = 0; i < n; i += 1) {
          types.push(TYPES[rest % 3])
          rest = Math.floor(rest / 3)
        }
        const source = deckOf(n, 0, types)
        const out = sliceDeckForLevel(source, [])
        // 条数与内容守恒（A1 不许靠丢条目达成）—— 穷举顺带覆盖，不再单列判据。
        expect(out.length, `长度 ${n} 的 ${types.join(',')} 丢了条目`).toBe(n)
        if (isSolvable(types)) {
          solvable += 1
          expect(
            sameTypeAdjacencies(out),
            `长度 ${n} 的 ${types.join(',')} 本来有解却留了相邻同型（A1）`,
          ).toEqual([])
        } else {
          unsolvable += 1
        }
      }
    }
    // ⚠️ 自测：确认这段穷举**真的覆盖了无解输入** —— 否则降级路径就是零覆盖。
    //   穷举实测（2026-10-19）：长度 1..10 共 88572 条，其中**有解 70191 条、无解 18381 条**
    //   （无解按长度：n2:3 / n3:3 / n4:27 / n5:33 / n6:219 / n7:297 / n8:1731 / n9:2505 / n10:13563
    //     —— 短序列与极端偏斜的多重集才是无解的来源）。
    expect(unsolvable, '穷举里一条无解输入都没抽到 ⇒ 降级路径这条就没被覆盖').toBe(18381)
    expect(solvable, '可解输入的条数变了 ⇒ 穷举空间或判据被改动过，需要复核').toBe(70191)
  })
})
