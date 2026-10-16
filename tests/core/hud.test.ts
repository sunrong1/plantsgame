/**
 * `core/hud.ts` 的性质守卫（Story 1.13 / AC-B6、G44–G48、G55/G55a）。
 *
 * ── 这个文件守什么 ────────────────────────────────────────────────────────
 * 四组判据的**性质**（不是「返回了一个数」）。`epics.md` 的硬约束是
 * 「组件只读 `state`，**不得自行计算**」⇒ 判据必须先站得住，组件才有资格调用它。
 *
 * ── 为什么 AC-B6b 必须合成 State，不能走真实战斗流程 ──────────────────────
 * 「一帧掉到 0」是区分**夹后差值**与**未夹 heartsLost** 的**唯一**输入：
 * 前者在 `prev.hearts=2 → next.hearts=0` 时返回 2，后者返回本回合抵达的只数
 * （可能 >2）。`deferred-work.md` 记载该局面在 20000 个随机种子里一次都没逼出来
 * （连同回合抵达两只都没有）⇒ 这里直接造 state，不指望流程能走到。
 *
 * ── 判据纪律 ──────────────────────────────────────────────────────────────
 * 1. **构造上恒真的断言 = 假绿**（1.10 Debug Log #3）。每条矩阵性质都带
 *    「**既不是全 true 也不是全 false**」的自检行 —— 否则判据可能根本没被触发。
 * 2. **`HEARTS` 从 `core` 导入而不是写死 3** —— 起始心数是可调参数
 *    （`deferred-work.md` 登记过「第一顺位可调 3 → 4」），写死会让整档断言假红。
 * 3. 本文件**不做源码变异**：仓库里 `tests/core/**` 一律是行为守卫，
 *    变异验证走 T9 的「改 `src/` → 实跑 → 记红数 → 还原」，不在这里假装。
 */

import { describe, expect, it } from 'vitest'

import {
  HEARTS,
  advanceProgress,
  answer,
  createInitialState,
  heartSlots,
  heartsLostBetween,
  lostSlotIndexes,
  progressDisplay,
  reduce,
  restartLevel,
  type Progress,
  type State,
} from '../../src/core'
import { correctOptionId, makeSyntheticDeck } from '../fixtures/synthetic-deck'

// ── 测试用的题单与构造 ──────────────────────────────────────────────────────

/** 3 题合成题单（塔型轮转 ⇒ 三种塔型都出现，与 `build.test.ts` 同一 fixture）。 */
const DECK = makeSyntheticDeck(3, 1)

/** 一局刚开好的 state。 */
function freshState(): State {
  return createInitialState({ unitNumber: 1, deck: DECK })
}

/**
 * 把 state 的心数改成指定值。
 *
 * ⚠️ 只改 `hearts`、不改 `phase` —— `heartSlots` / `heartsLostBetween` /
 * `lostSlotIndexes` 都只读 `hearts`，而改 `phase` 会牵动 `assertPhaseMirror`。
 * 本文件里唯一需要 `phase: level-failed` 的地方单独造（见 AC-B6d）。
 */
function withHearts(state: State, hearts: number): State {
  return { ...state, hearts }
}

/** 把 state 的已掌握词条改成指定值（`advanceProgress` 的输入侧）。 */
function withMastered(state: State, ids: readonly string[]): State {
  return { ...state, masteredEntryIds: ids }
}

/** 空的跨局进度（Story 的开局态）。 */
function emptyProgress(): Progress {
  return { currentUnitIndex: 1, masteredWordIds: [] }
}

// ── AC-B6a / G44：heartSlots ──────────────────────────────────────────────

describe('AC-B6a / G44 —— heartSlots 是逐槽布尔数组，不是心数', () => {
  it('长度恒为 HEARTS，true 的个数恒等于 state.hearts', () => {
    for (let hearts = 0; hearts <= HEARTS; hearts += 1) {
      const slots = heartSlots(withHearts(freshState(), hearts))
      expect(slots, `hearts=${hearts} 的槽数必须恒为 HEARTS（${HEARTS}）`).toHaveLength(HEARTS)
      expect(
        slots.filter(Boolean).length,
        `hearts=${hearts} 时 true 的个数必须恰好等于心数`,
      ).toBe(hearts)
    }
  })

  it('🚨 探测棒自检：矩阵既不是全 true 也不是全 false（否则上面那条可能恒真）', () => {
    // 取「掉到只剩一颗」这一档：它同时含 true 与 false，任何「长度对了但内容错」
    // 的实现（全 true / 全 false / 全反）都会在这里露馅。
    const slots = heartSlots(withHearts(freshState(), 1))

    expect(slots.some(Boolean), '矩阵里一个 true 都没有 —— 判据可能根本没被触发').toBe(true)
    expect(slots.some((alive) => !alive), '矩阵里一个 false 都没有 —— 判据可能恒真').toBe(true)
  })

  it('hearts=0 时全 false', () => {
    expect(heartSlots(withHearts(freshState(), 0)).some(Boolean)).toBe(false)
  })

  it('左低右高：耗尽的心在右端消失（第 i 位 = i < hearts）', () => {
    const slots = heartSlots(withHearts(freshState(), HEARTS - 1))

    expect(slots.slice(0, HEARTS - 1).every(Boolean), '靠左的几位必须都还活着').toBe(true)
    expect(
      slots[HEARTS - 1],
      '耗尽的心必须在**右端**消失 —— 孩子视线扫到的末端才是「最后一颗」',
    ).toBe(false)
  })
})

// ── AC-B6b / G45：heartsLostBetween 的夹后口径 ─────────────────────────────

describe('AC-B6b / G45 —— heartsLostBetween 是「实际掉了」不是「本回合抵达了」', () => {
  it('一帧掉到 0 时返回 prev.hearts（合成 State，不经战斗流程）', () => {
    const prev = withHearts(freshState(), 2)
    const next = withHearts(freshState(), 0)

    expect(heartsLostBetween(prev, next)).toBe(2)
  })

  it('未夹的 heartsLost 在同一局面下会是别的数 —— 这条断言才有鉴别力', () => {
    const prev = withHearts(freshState(), 2)
    const next = withHearts(freshState(), 0)
    // 本回合「抵达了 5 只」但只剩 2 颗心：未夹口径会返回 5。
    const unclamped = 5

    expect(heartsLostBetween(prev, next)).not.toBe(unclamped)
    expect(heartsLostBetween(prev, next)).toBe(prev.hearts)
  })

  it('掉 1 心、掉 2 心、不掉心、凭空加心都算得对', () => {
    const state = freshState()

    expect(heartsLostBetween(withHearts(state, 3), withHearts(state, 2))).toBe(1)
    expect(heartsLostBetween(withHearts(state, 3), withHearts(state, 1))).toBe(2)
    expect(heartsLostBetween(state, state)).toBe(0)
    // 心数只会减不该增；真出现增量为负时必须夹到 0，而不是返回负数
    // （负数会让下游 `for (const i of lost)` 静默空转，掉心动画不播且无报错）。
    expect(heartsLostBetween(withHearts(state, 1), withHearts(state, 3))).toBe(0)
  })

  it('返回值恒落在 [0, HEARTS]', () => {
    const state = freshState()
    for (let a = 0; a <= HEARTS; a += 1) {
      for (let b = 0; b <= HEARTS; b += 1) {
        const lost = heartsLostBetween(withHearts(state, a), withHearts(state, b))
        expect(lost, `hearts ${a} → ${b}`).toBeGreaterThanOrEqual(0)
        expect(lost, `hearts ${a} → ${b}`).toBeLessThanOrEqual(HEARTS)
      }
    }
  })
})

// ── AC-B6c / G46：advanceProgress 幂等 ───────────────────────────────────

describe('AC-B6c / G46 —— advanceProgress 幂等：同一个词条答对两次，长度不变', () => {
  it('连喂两次同一个 next，masteredWordIds 长度不变', () => {
    const answered = withMastered(freshState(), ['u1-word-01'])
    const once = advanceProgress(emptyProgress(), answered)
    const twice = advanceProgress(once, answered)

    expect(once.masteredWordIds).toHaveLength(1)
    expect(twice.masteredWordIds, '同一个 entryId 第二次出现必须被去重').toHaveLength(1)
    expect([...twice.masteredWordIds]).toEqual([...once.masteredWordIds])
  })

  it('不同词条会真的累加（否则「长度不变」恒真）', () => {
    const first = advanceProgress(emptyProgress(), withMastered(freshState(), ['u1-word-01']))
    const second = advanceProgress(
      first,
      withMastered(freshState(), ['u1-word-01', 'u1-word-02']),
    )

    expect(second.masteredWordIds).toHaveLength(2)
  })

  it('不改入参：返回的是新对象而不是就地改的', () => {
    const before = emptyProgress()
    const snapshot = [...before.masteredWordIds]
    advanceProgress(before, withMastered(freshState(), ['u1-word-01']))

    expect([...before.masteredWordIds], '入参的数组被就地改了').toEqual(snapshot)
    expect(Object.is(before, advanceProgress(before, withMastered(freshState(), ['u1-word-01'])))).toBe(
      false,
    )
  })

  it('入参顺序在返回里保持不变（增量的追加在末尾）', () => {
    const base = advanceProgress(emptyProgress(), withMastered(freshState(), ['u1-word-02']))
    const next = advanceProgress(base, withMastered(freshState(), ['u1-word-01', 'u1-word-02']))

    expect([...next.masteredWordIds]).toEqual(['u1-word-02', 'u1-word-01'])
  })
})

// ── AC-B6f / G54 的前提：无增量时返回入参本身 ────────────────────────────

describe('AC-B6f —— advanceProgress 无增量时返回同一个引用', () => {
  it('Object.is(prev, result) === true', () => {
    const progress = advanceProgress(emptyProgress(), withMastered(freshState(), ['u1-word-01']))
    const noGain = withMastered(freshState(), ['u1-word-01'])

    const result = advanceProgress(progress, noGain)

    expect(Object.is(progress, result), '无增量却换了引用 ⇒ progress 的变更次数会等于 action 次数').toBe(
      true,
    )
  })

  it('🚨 探测棒自检：真的有增量时引用必须变（否则上面那条恒真）', () => {
    const progress = advanceProgress(emptyProgress(), withMastered(freshState(), ['u1-word-01']))
    const gained = advanceProgress(progress, withMastered(freshState(), ['u1-word-02']))

    expect(Object.is(progress, gained), '有增量却没换引用 —— 增量根本没生效').toBe(false)
    expect(gained.masteredWordIds).toHaveLength(2)
  })

  it('空 progress 吃空增量也返回同一个引用', () => {
    const empty = emptyProgress()

    expect(Object.is(empty, advanceProgress(empty, withMastered(freshState(), [])))).toBe(true)
  })
})

// ── AC-B6d / G47 / M84：跨 RESTART_LEVEL 不回退 ───────────────────────────

describe('AC-B6d / G47 —— progress 跨 RESTART_LEVEL 只增不减（FR58）', () => {
  /** 造一个「本局已失败」的 state —— `RESTART_LEVEL` 只在 `level-failed` 阶段合法。 */
  function failedState(hearts: number): State {
    return { ...withHearts(freshState(), hearts), phase: { kind: 'level-failed' } }
  }

  it('打掉的那一局掌握过 2 个词，重开后 progress 仍然握着这 2 个', () => {
    // 本局答对过 2 题 ⇒ masteredEntryIds 有 2 条
    const played = withMastered(failedState(0), ['u1-word-01', 'u1-word-02'])
    const progress = advanceProgress(emptyProgress(), played)
    expect(progress.masteredWordIds).toHaveLength(2)

    // 真实重开：reduce(state, restartLevel()) 会重置 State —— 包括 masteredEntryIds
    const restarted = reduce(played, restartLevel())
    expect(restarted.masteredEntryIds, 'restart 把本局的掌握记录清空了 —— 这正是它该做的').toHaveLength(0)

    // 再喂一次重开后的 state：progress 不得回退
    const after = advanceProgress(progress, restarted)

    expect([...after.masteredWordIds], '重开后 progress 回退了 —— 孩子已经学会的词被抹掉了').toEqual([
      'u1-word-01',
      'u1-word-02',
    ])
  })

  it('重开后答对新词是**追加**而不是替换', () => {
    const played = withMastered(failedState(0), ['u1-word-01'])
    const progress = advanceProgress(emptyProgress(), played)
    const restarted = reduce(played, restartLevel())

    const after = advanceProgress(progress, withMastered(restarted, ['u1-word-02']))

    expect([...after.masteredWordIds]).toEqual(['u1-word-01', 'u1-word-02'])
  })

  it('currentUnitIndex 原样带过（本 story 不推进单元 —— 那是 1.16 的活）', () => {
    const progress = advanceProgress({ currentUnitIndex: 1, masteredWordIds: [] }, freshState())

    expect(progress.currentUnitIndex).toBe(1)
  })
})

// ── AC-B6e / G48：progressDisplay ────────────────────────────────────────

describe('AC-B6e / G48 —— progressDisplay 的夹取与除零', () => {
  it('total=0 时 ratio=0，不返回 NaN', () => {
    const progress = advanceProgress(emptyProgress(), withMastered(freshState(), ['u1-word-01']))
    const shown = progressDisplay(progress, 1, 0)

    expect(shown.ratio, 'NaN 落进 width 会被整条丢弃 ⇒ 进度条退化成浏览器默认宽度且无报错').toBe(0)
    expect(Number.isNaN(shown.ratio)).toBe(false)
  })

  it('mastered > total 时 ratio 夹到 1（词表缩小过的存档）', () => {
    const progress = advanceProgress(
      emptyProgress(),
      withMastered(freshState(), ['u1-word-01', 'u1-word-02', 'u1-word-03']),
    )
    const shown = progressDisplay(progress, 1, 1)

    expect(shown.ratio).toBe(1)
  })

  it('mastered 只数属于本单元的条目（偏离 #7 的前缀口径）', () => {
    const progress = advanceProgress(
      emptyProgress(),
      withMastered(freshState(), ['u1-word-01', 'u2-word-01', 'u10-word-01']),
    )
    const shown = progressDisplay(progress, 1, 10)

    expect(shown.mastered, 'u2- / u10- 的词条不属于单元 1').toBe(1)
  })

  it('ratio 恒落在 [0,1]，且 mastered ≤ total 之外的输入也安全', () => {
    const progress = advanceProgress(emptyProgress(), withMastered(freshState(), ['u1-word-01']))
    for (const total of [0, 1, 2, 37, 1000]) {
      const shown = progressDisplay(progress, 1, total)
      expect(shown.ratio, `total=${total}`).toBeGreaterThanOrEqual(0)
      expect(shown.ratio, `total=${total}`).toBeLessThanOrEqual(1)
      expect(shown.total, 'total 必须原样回显调用方传入的分母').toBe(total)
      expect(shown.unitNumber).toBe(1)
    }
  })

  it('比值本身正确：3/37 不是 0.08 的近似误差', () => {
    const ids = ['u1-word-01', 'u1-word-02', 'u1-word-03'].map((_, i) => `u1-word-0${i + 1}`)
    const progress = advanceProgress(emptyProgress(), withMastered(freshState(), ids))

    const shown = progressDisplay(progress, 1, 37)

    expect(shown.mastered).toBe(3)
    expect(shown.total).toBe(37)
    expect(shown.ratio).toBeCloseTo(3 / 37, 10)
  })
})

// ── G55 / G55a：画面判据与音效判据不可能分叉 ──────────────────────────────

describe('G55 / G55a —— lostSlotIndexes 与 heartsLostBetween 的两条恒等式', () => {
  it('lostSlotIndexes 的长度恒等于 heartsLostBetween（全心数矩阵）', () => {
    const state = freshState()
    for (let a = 0; a <= HEARTS; a += 1) {
      for (let b = 0; b <= HEARTS; b += 1) {
        const prev = withHearts(state, a)
        const next = withHearts(state, b)
        expect(
          lostSlotIndexes(prev, next).length,
          `hearts ${a} → ${b}：动画对象与掉心计数不是同一个数`,
        ).toBe(heartsLostBetween(prev, next))
      }
    }
  })

  it('lostSlotIndexes 逐位等于「前帧 true 且后帧 false」的位置集合', () => {
    const state = freshState()
    for (let a = 0; a <= HEARTS; a += 1) {
      for (let b = 0; b <= HEARTS; b += 1) {
        const prev = withHearts(state, a)
        const next = withHearts(state, b)
        const before = heartSlots(prev)
        const after = heartSlots(next)
        const expected = before
          .map((alive, i) => (alive === true && after[i] === false ? i : -1))
          .filter((i) => i !== -1)

        expect([...lostSlotIndexes(prev, next)], `hearts ${a} → ${b}`).toEqual(expected)
      }
    }
  })

  it('🚨 探测棒自检：确实存在「非空且不止一个下标」的局面', () => {
    const state = freshState()
    const indexes = lostSlotIndexes(withHearts(state, HEARTS), withHearts(state, HEARTS - 2))

    expect(indexes.length, '一次掉 2 心必须给出 2 个下标 —— 只动「最后一颗」的实现会在这里露馅').toBe(2)
    expect(indexes.every((i) => Number.isInteger(i) && i >= 0 && i < HEARTS)).toBe(true)
  })

  it('不掉心时是空数组（不是 undefined —— 那会让 `for...of` 直接抛）', () => {
    const state = freshState()

    const none = lostSlotIndexes(state, state)

    expect(none).toEqual([])
    expect(none, '返回 undefined 会让组件的 for...of 抛 TypeError，且报错点在动画里').not.toBeUndefined()
  })

  it('一次掉 2 心时给的是**末两位**（左低右高 ⇒ 耗尽在右端）', () => {
    const state = freshState()
    const indexes = [...lostSlotIndexes(withHearts(state, HEARTS), withHearts(state, HEARTS - 2))]

    expect(indexes).toEqual([HEARTS - 2, HEARTS - 1])
  })
})

// ── 与真实答题链路串起来（AC-C1 的上游：SunCounter 读的那个 sun） ────────────

describe('HUD 判据接真实 reducer —— 答对会让 masteredEntryIds 增长', () => {
  it('答对后 reduce 产出的 state 真的带着新的 entryId', () => {
    const state = freshState()
    expect(state.phase.kind, '开局阶段必须是 awaiting-answer').toBe('awaiting-answer')

    const answered = reduce(state, answer(correctOptionId(DECK[0])))

    expect(answered.masteredEntryIds.length, '答对了却没记进 masteredEntryIds').toBe(1)

    const progress = advanceProgress(emptyProgress(), answered)
    const shown = progressDisplay(progress, answered.unitNumber, 37)
    expect(shown.mastered).toBe(1)
    expect(shown.ratio).toBeCloseTo(1 / 37, 10)
  })

  it('🚨 探测棒自检：题单本身是有题的（否则上面恒真）', () => {
    expect(DECK.length).toBeGreaterThan(0)
    expect(makeSyntheticDeck(3, 1)[0]?.entryId).toBe('u1-word-01')
  })
})
