/**
 * dev-only 状态补偿缝的**行为守卫**（Story 1.17 / 裁决 5、6；G108）。
 *
 * ── 这个文件守什么 ────────────────────────────────────────────────────────
 * 「无限心 / 无限阳光 / 直接通关」三个开关。它们**不是**新的 `Action` 变体，
 * 而是插在 `reduce` 与 `runEffectsFromStore` 之间的一条**仅 DEV 生效**的补偿。
 *
 * | 开关 | 字面可实现？ | 实测原因 |
 * |---|---|---|
 * | 无限心 | ❌ | `assertCounters` 逐字 `hearts > HEARTS` 即抛错 |
 * | 无限阳光 | ✅ | `assertCounters` 对 `sun` 只查 `>= 0`，没有上界 |
 * | 直接通关 | ✅ | 补满 `masteredEntryIds` 后走**真** `CONTINUE` |
 *
 * 🔥 **本文件的两条判据都踩在「补偿不在 `reduce` 里」这个事实上**：
 *   `reduce` 每个分支的出口都过 `assertInvariants`（`reducer.ts:115-133`），
 *   而 `devAdjust` 的出口**在它之后** ⇒ 那道断言**一次都碰不到补偿后的值**。
 *   ⇒ 补偿把 `hearts` / `masteredEntryIds` 推成非法值这件事，只有本文件看得见。
 *
 * ── ⚠️ 「无限心」为什么必须连带改相位（实现期发现的偏离 6）──────────────────
 * 裁决 5 判据 1 逐字是「`hearts → Math.max(1, hearts)`」。**照抄这条达不到
 * 裁决 5 自己声明的语义**：`applyResolve`（`reducer.ts:306-314`）在同一次
 * `reduce` 里既把心数夹到 0，**又**把相位直接推成 `level-failed`；
 * 补偿发生在其后，只改心数**改不回相位** ⇒ 对局照样失败。
 * ⇒ 实现里连带把 `level-failed` 翻回 `round-over`。详见 story 文档的偏离 6。
 *
 * ── ⚠️ 「直接通关」为什么只在本回合**没有正在问的题**时补满 ────────────────
 * `assertDeckRelations`（`reducer.ts:513-516`）逐字：
 * `phase.kind === 'awaiting-answer'` 且当前题已在 `masteredEntryIds` 里 ⇒ **抛错**。
 * ⇒ 在 `awaiting-answer` 上补满是当场把对局推进非法态。守卫 G108 第二条专测它。
 *
 * ── 判据纪律 ──────────────────────────────────────────────────────────────
 * · **三个开关默认全关**，每个用例自己开自己复位。
 * · 走真的 `applyAction` 链路（顺序判据 G109 必须在真实顺序上判）。
 * · 本文件不做源码变异；顺序变异走 M134，G107 走 M135。
 */

import { beforeEach, describe, expect, it } from 'vitest'

import {
  applyAction,
  devFlags,
  devSetDirectWin,
  devSetInfiniteHearts,
  devSetInfiniteSun,
  exportSession,
  resetSession,
  state,
  startRound,
} from '../../src/app/store'
import { devAdjust } from '../../src/app/dev-adjust'
import {
  assertInvariants,
  createInitialState,
  HEARTS,
  nextQuestion,
  replaySession,
} from '../../src/core'
import type { State } from '../../src/core'
import { afterEachUninstall, installFakeStorage } from '../fixtures/fake-storage'
import { correctOptionId, makeSyntheticDeck } from '../fixtures/synthetic-deck'

// ── 夹具 ───────────────────────────────────────────────────────────────────

const DECK = makeSyntheticDeck(25, 1)

function currentQuestion(current: State = state.value) {
  if (current.phase.kind !== 'awaiting-answer') {
    throw new Error(`当前阶段是 ${current.phase.kind}，没有正在问的题`)
  }
  return current.phase.question
}

/** 正确答掉当前那道题。 */
function answerCorrectly(): void {
  applyAction({ type: 'ANSWER', optionId: correctOptionId(currentQuestion()) })
}

/** 走完一整个回合（结束建造 → 结算 → 推进）。 */
function playOneRound(): void {
  startRound()
}

/**
 * 空跑到「心数真的下降」为止 —— 不建塔，僵尸要走近 8 回合才摸到房子。
 *
 * ⚠️ **必须真的掉心**，否则下面所有「无限心」的断言都恒绿（装饰守卫，R-51）。
 */
function driveUntilHeartLost(): boolean {
  for (let i = 0; i < 60; i += 1) {
    if (state.value.phase.kind !== 'awaiting-answer') return state.value.hearts < HEARTS
    const before = state.value.hearts
    answerCorrectly()
    playOneRound()
    if (state.value.hearts < before) return true
  }
  return false
}

beforeEach(() => {
  installFakeStorage()
  state.value = createInitialState({ unitNumber: 1, deck: DECK })
  devSetInfiniteHearts(false)
  devSetInfiniteSun(false)
  devSetDirectWin(false)
  // ⚠️ 必须重置录制器：`store` 与录制器都是**模块级单例**，测试之间不自动复位。
  //   不重置的话「导出的会话」会带上上一个用例的几十条 action
  //   （实测：4 条的期望收到 156 条），且回放从上一局失败局面开始 ⇒ 直接抛错。
  resetSession()
})

afterEachUninstall()

// ── 全关时补偿缝必须是**零操作**（含引用不变）────────────────────────────

describe('dev 开关默认全关（Story 1.17 / AC-D4）', () => {
  it('三个开关默认全关', () => {
    expect(devFlags.infiniteHearts).toBe(false)
    expect(devFlags.infiniteSun).toBe(false)
    expect(devFlags.directWin).toBe(false)
  })

  it('G108：全关时 `devAdjust` 返回**同一个对象**，一个字段都不改', () => {
    // ⚠️ 判「引用不变」而不是「逐字相等」：`reduce` 每步都返回新对象，
    //   补偿缝再 spread 一次会让整条链路的引用语义（守卫 G54 靠它判有无增量）失真。
    const before = state.value
    expect(devAdjust(before, before), '全关时补偿缝必须原样返回入参').toBe(before)
  })

  it('全关时打三个回合，`masteredEntryIds` 只增长一条 —— 补偿缝没插手', () => {
    for (let i = 0; i < 3; i += 1) {
      answerCorrectly()
      playOneRound()
    }
    expect(state.value.masteredEntryIds).toHaveLength(3)
    expect(devFlags.directWin).toBe(false)
  })
})

// ── G108 —— 补偿后的 state 仍能过 assertInvariants ────────────────────────

describe('G108 —— 补偿后的 state 仍能过 `assertInvariants`（裁决 5）', () => {
  it('G108：「无限心」掉心后回到 1 而不是 0，且不变量过得去', () => {
    expect(driveUntilHeartLost(), '前置：必须先跑出一次真实的掉心').toBe(true)
    const lost = state.value.hearts
    expect(lost).toBeGreaterThan(0)
    expect(lost).toBeLessThan(HEARTS)

    devSetInfiniteHearts(true)
    answerCorrectly()
    playOneRound()

    // 🔥 正题：`devAdjust` 的出口不在 `reduce` 里 ⇒ `assertInvariants` 一次都碰不到它。
    //   「补偿把心数推成非法值」这个 bug 只有在这里才看得见。
    expect(() => assertInvariants(state.value), '补偿把 hearts 推出了 [0, HEARTS]').not.toThrow()
    expect(state.value.hearts).toBeGreaterThanOrEqual(1)
    expect(state.value.hearts).toBeLessThanOrEqual(HEARTS)
  })

  it('G108：「无限心」开着时走不到 `level-failed`（相位也被翻回来了）', () => {
    devSetInfiniteHearts(true)

    for (let i = 0; i < 60 && state.value.phase.kind !== 'level-failed'; i += 1) {
      if (state.value.phase.kind !== 'awaiting-answer') break
      answerCorrectly()
      playOneRound()
      expect(state.value.hearts, '心数掉到 0 就不叫「无限」了').toBeGreaterThanOrEqual(1)
    }

    // ⚠️ 这条**单独**判相位而不是判心数：`reducer.ts:314` 已经把相位推成
    //   `level-failed` 了，只把心数抬回 1 是救不回来的（偏离 6）。
    expect(state.value.phase.kind, '开着「无限心」时仍然打到了失败 —— 补偿没把相位翻回来').not.toBe(
      'level-failed',
    )
  })

  it('G108：「无限心」只在真掉心时补，不许把满心改成非满心', () => {
    devSetInfiniteHearts(true)
    answerCorrectly()
    playOneRound()
    const full = state.value.hearts
    expect(full).toBe(HEARTS)
  })

  it('G108：「无限阳光」把阳光抬到 9999，且不变量过得去', () => {
    devSetInfiniteSun(true)
    answerCorrectly()
    playOneRound()

    expect(() => assertInvariants(state.value), '补偿把 sun 推出了非负区间').not.toThrow()
    expect(state.value.sun).toBeGreaterThanOrEqual(9999)
  })

  it('G108：「无限阳光」在**答题相位**也抬 —— 补偿不是只挂在结算之后', () => {
    devSetInfiniteSun(true)
    answerCorrectly()
    // 此刻相位是 awaiting-build，devAdjust 已把阳光抬上去。
    expect(state.value.sun).toBeGreaterThanOrEqual(9999)
  })

  it('G108：「直接通关」在 `awaiting-build` 上补满题单，且不变量过得去', () => {
    devSetDirectWin(true)
    answerCorrectly()

    expect(state.value.phase.kind).toBe('awaiting-build')
    expect(() => assertInvariants(state.value)).not.toThrow()
    expect(state.value.masteredEntryIds).toHaveLength(DECK.length)
    // ⚠️ 只增不减（FR58）：dev 补偿不许动 `deck` 本身。
    expect(state.value.deck).toHaveLength(DECK.length)
    expect(state.value.turn).toBe(1)
  })

  it('G108：「直接通关」在 `awaiting-answer` 上**不许**补满（会撞 assertDeckRelations）', () => {
    devSetDirectWin(true)
    // 此刻相位是 awaiting-answer，当前题还没答对。
    expect(state.value.phase.kind).toBe('awaiting-answer')

    // 🔥 若补偿不看相位就补满，`masteredEntryIds` 会含当前题 ⇒
    //   `assertInvariants` 逐字抛「刚学会又考一遍」⇒ 面板一开就崩。
    expect(() => assertInvariants(state.value)).not.toThrow()
    expect(state.value.masteredEntryIds).toHaveLength(0)
  })

  it('G108：「直接通关」是**让 `reduce` 自己判出通关**，不是造一个 level-complete', () => {
    devSetDirectWin(true)
    answerCorrectly()
    playOneRound()

    // 🔥 这才是正题：`level-complete` 必须是 **`reduce` 的产物**。
    //   若 `devAdjust` 直接造一个 `phase.kind === 'level-complete'` 的 state，
    //   1.16 的 G87–G96 与 1.5 的整组 reducer 守卫就全都失去了意义（R-41）。
    expect(state.value.phase.kind).toBe('level-complete')
    expect(nextQuestion(state.value.deck, state.value.masteredEntryIds)).toBeNull()
  })
})

// ── 边界（裁决 6）──────────────────────────────────────────────────────────

describe('dev 补偿的三条边界（Story 1.17 / 裁决 6）', () => {
  it('边界一「不进回放」：导出的 `initialState` 里没有补偿过的值', () => {
    devSetInfiniteSun(true)
    answerCorrectly()
    playOneRound()
    expect(state.value.sun, '前置：内存里确实被补偿过').toBeGreaterThanOrEqual(9999)

    const session = exportSession()
    // 导出的 `initialState` 是**第一条 action 之前**那份 —— 那时补偿还没发生。
    expect(session.initialState.sun).toBeLessThan(9999)
  })

  it('边界一「不进回放」：导出的 actions 里只有玩家真的 dispatch 过的那些', () => {
    devSetDirectWin(true)
    answerCorrectly()
    playOneRound()

    const session = exportSession()
    expect(session.actions.map((a) => a.type)).toEqual([
      'ANSWER',
      'END_BUILD',
      'RESOLVE_ROUND',
      'CONTINUE',
    ])
  })

  it('边界一「不进回放」：导出的会话回放出来是**没有 dev 态**的那一局', () => {
    devSetDirectWin(true)
    answerCorrectly()
    playOneRound()
    const session = exportSession()
    // `exportSession` 导出的 `initialState` 不带 dev 态 ⇒ replaySession 从它重跑，
    // 补满 mastered 那一步不在录制里 ⇒ 不会补满。
    const replayed = replayedStateOf(session)
    expect(replayed.masteredEntryIds.length).toBeLessThan(session.initialState.deck.length)
  })

  it('关掉开关后补偿立刻不再生效', () => {
    // ⚠️ **不能断言「阳光掉回真实值」**：`sun` 在真实规则里**只增不减** ——
    //   补偿抬上去的 9999 没有理由自己回来，照那个写断言会得到一条恒红的假期望。
    //   真正可判的是「补偿不再往上抬」：**开着**时阳光被**钉**在 9999
    //   （答对带来的那点增量被 `Math.max` 吃掉），**关掉**后它才重新往上走。
    devSetInfiniteSun(false)
    answerCorrectly()
    playOneRound()
    const allOff = state.value.sun
    expect(allOff, '前置：全关时阳光应当是真实规则算出来的那个小数字').toBeLessThan(9999)

    devSetInfiniteSun(true)
    answerCorrectly()
    playOneRound()
    const pinned = state.value.sun
    expect(pinned, '前置：开着开关时阳光被顶到 9999').toBeGreaterThanOrEqual(9999)

    devSetInfiniteSun(false)
    answerCorrectly()
    playOneRound()
    expect(
      state.value.sun - pinned,
      '开关关掉之后阳光仍恒被钉在 9999 —— 补偿没有真的停下来',
    ).toBeGreaterThan(0)
  })

  it('生产构建下补偿缝是恒等函数（`import.meta.env.DEV` 那一层已判）', () => {
    // ⚠️ 本用例跑在 vitest 下（`import.meta.env.DEV === true`），所以它只能守
    //   「DEV 为真时补偿生效」；「DEV 为假时恒等」由 G112 的反向自测在源码上守。
    expect(import.meta.env.DEV).toBe(true)
    devSetInfiniteSun(true)
    const before = state.value
    expect(devAdjust(before, before), '开关开着时补偿缝必须产出新 state').not.toBe(before)
  })
})

/** 用导出的会话回放一遍，返回终态。 */
function replayedStateOf(session: ReturnType<typeof exportSession>): State {
  return replaySession(session)
}
