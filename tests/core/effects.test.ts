/**
 * `core/effects.ts` 的行为守卫（Story 1.14 / AC-B、AC-C，G62/G63/G64）。
 *
 * ── 这个文件守什么 ────────────────────────────────────────────────────────
 * 七事件 → SfxCue 的**映射判据**，不是「函数返回了一个数组」。三条纪律各自对应
 * 本 story 最容易写错的地方：
 *   1. **答题判据必须读 `prev.phase.question`**（AC-C2）—— 读 `next.phase` 是 TS2339，
 *      而最顺手的 `as` 会让它恒假 ⇒ 一条音效都不播而全部测试照绿（事故卡 #1）。
 *   2. **掉心判据必须复用 `lostSlotIndexes`**（AC-C6）—— 另算一份，画面与声音迟早分叉。
 *   3. **返回顺序即播放顺序**（AC-C5）—— 三 cue 并发时固定 `zombie-died → heart-lost → …`。
 *
 * ── 为什么造 state 而不是走完整流程 ───────────────────────────────────────
 * 「一次 RESOLVE_ROUND 同时打死僵尸 + 掉心 + 通关」这个组合，在真实战斗里要么
 * 逼不出（要先答对所有题）、要么不可复现。与 `hud.test.ts` 同款纪律：直接合成
 * `(prev, next)` 对，判据才站得住。真实流程的连通性由 `reducer` 自己的测试守。
 *
 * ── 判据纪律 ──────────────────────────────────────────────────────────────
 * · 每个 cue 至少一条**独立**路径（AC-C4 / G64）—— 否则「恒真判据」与「死分支」分不开。
 * · `HEARTS` 从 core 导入不写死。
 * · 本文件不做源码变异（仓库里 `tests/core/**` 一律行为守卫），变异走 T8。
 */

import { describe, expect, it } from 'vitest'

import {
  HEARTS,
  ZOMBIE_ROW,
  answer,
  cellKey,
  continueRound,
  createInitialState,
  endBuild,
  placeTower,
  reduce,
  resolveRound,
  restartLevel,
  runEffects,
  type Effect,
  type SfxCue,
  type State,
} from '../../src/core'
import { correctOptionId, makeSyntheticDeck, wrongOptionId } from '../fixtures/synthetic-deck'

// ── 测试用的题单与构造 ──────────────────────────────────────────────────────

/** 3 题合成题单（塔型轮转 ⇒ 三种塔型都出现）。 */
const DECK = makeSyntheticDeck(3, 1)

/** 一局刚开好的 state（phase = awaiting-answer，带第 1 题）。 */
function freshState(): State {
  return createInitialState({ unitNumber: 1, deck: DECK })
}

/** 当前正在问的那道题（freshState 恒在 awaiting-answer）。 */
function currentQuestion(state: State) {
  if (state.phase.kind !== 'awaiting-answer') {
    throw new Error(`当前阶段是 ${state.phase.kind}，没有正在问的题`)
  }
  return state.phase.question
}

/** 跑一次 action，返回 `(prev, next, effects)` —— 一次 applyAction 的完整快照。 */
function dispatch(prev: State, action: Parameters<typeof reduce>[1]) {
  const next = reduce(prev, action)
  return { prev, next, effects: runEffects(action, prev, next) }
}

/** 只取 SFX cue（过滤掉未来可能的其它 kind —— 本 story 只产 SFX，但这让断言不脆弱）。 */
function cues(effects: readonly Effect[]): readonly SfxCue[] {
  return effects.filter((e): e is Extract<Effect, { kind: 'SFX' }> => e.kind === 'SFX').map((e) => e.cue)
}

// ════════════════════════════════════════════════════════════════════════
// AC-C1 / G64 —— 七个 cue 各有一条会产出它的独立路径（无死 cue）
// ════════════════════════════════════════════════════════════════════════

describe('AC-C1 / G64 —— 七事件映射表：每个 cue 都有至少一条会产出它的路径', () => {
  it('G64：answer-correct —— 答对（mastered 新增恰好一道且等于 prev.phase.question）', () => {
    const prev = freshState()
    const question = currentQuestion(prev)
    const { effects } = dispatch(prev, answer(correctOptionId(question)))
    expect(
      cues(effects),
      '答对必须恰好产出 answer-correct —— 判据读 prev.phase.question 且 mastered 多出该 entryId',
    ).toContain('answer-correct')
  })

  it('G64：answer-wrong —— 答错（上一行判据不成立）', () => {
    const prev = freshState()
    const question = currentQuestion(prev)
    const { effects } = dispatch(prev, answer(wrongOptionId(question)))
    expect(
      cues(effects),
      '答错必须恰好产出 answer-wrong —— 判据是 answer-correct 的严格反面',
    ).toContain('answer-wrong')
  })

  it('G64：tower-placed —— 建塔（PLACE_TOWER 恒真，AC-C3 陷阱 3）', () => {
    // 先答对一题拿到塔卡与阳光，再建塔。
    let state = freshState()
    const q = currentQuestion(state)
    state = reduce(state, answer(correctOptionId(q)))
    // 解锁的是 q.entryId —— 建它。塔必须建在僵尸行（ZOMBIE_ROW），否则整局不开火。
    const cell = cellKey(ZOMBIE_ROW, 1)
    const { effects } = dispatch(state, placeTower(q.entryId, cell))
    expect(cues(effects), '建塔必须产出 tower-placed —— reducer 成功即恒真，无需额外相位判据').toContain(
      'tower-placed',
    )
  })

  it('G64：zombie-died —— 结算打死僵尸（next.zombies.length < prev.zombies.length）', () => {
    // 造一个「有塔且打得到僵尸」的建塔相位，然后结算。
    const { prev, next, effects } = zombieDeathDispatch()
    expect(next.zombies.length, '这条路径必须真的少了一只僵尸 —— 否则判据没被触发').toBeLessThan(prev.zombies.length)
    expect(cues(effects), '结算少了一只僵尸必须产出 zombie-died').toContain('zombie-died')
  })

  it('G64：heart-lost —— 掉心（lostSlotIndexes(prev,next).length > 0）', () => {
    const { prev, next, effects } = heartLostDispatch()
    expect(
      next.hearts,
      '这条路径必须真的掉了一颗心 —— 否则判据没被触发',
    ).toBeLessThan(prev.hearts)
    expect(cues(effects), '掉心必须产出 heart-lost').toContain('heart-lost')
  })

  it('G64：level-complete —— 通关（next.phase.kind === level-complete）', () => {
    const { effects } = levelCompleteDispatch()
    expect(cues(effects), '全部答对推进到通关必须产出 level-complete').toContain('level-complete')
  })

  it('G64：level-failed —— 失败（next.phase.kind === level-failed）', () => {
    const { effects } = levelFailedDispatch()
    expect(cues(effects), '心数耗尽必须产出 level-failed').toContain('level-failed')
  })
})

// ════════════════════════════════════════════════════════════════════════
// AC-C2 / 事故卡 #1 —— 答题判据必须读 prev.phase.question
// ════════════════════════════════════════════════════════════════════════

describe('AC-C2 —— 答题判据读 prev.phase.question，不是 next.phase', () => {
  it('G64b：ANSWER 之后 next.phase 已推进（无 question），判据仍须正确', () => {
    const prev = freshState()
    const question = currentQuestion(prev)
    const action = answer(correctOptionId(question))
    const next = reduce(prev, action)
    // ⚠️ 自检：next.phase 确实已不是 awaiting-answer，且**没有 question 字段**。
    //   这正是「判据读 prev.phase」的必要性 —— 若实现读 next.phase，
    //   在 TS 里要么 TS2339（无 as）要么恒假（有 as）。
    expect(next.phase.kind, 'ANSWER 之后相位已推进').not.toBe('awaiting-answer')
    const cuesHere = cues(runEffects(action, prev, next))
    expect(cuesHere, '读 prev.phase 才能在相位推进后仍判对错').toContain('answer-correct')
  })

  it('G64b：答错与答对必须落在**不同的** cue 上（两者不可能同时出现）', () => {
    const prev = freshState()
    const question = currentQuestion(prev)
    const right = cues(runEffects(answer(correctOptionId(question)), prev, reduce(prev, answer(correctOptionId(question)))))
    const wrong = cues(runEffects(answer(wrongOptionId(question)), prev, reduce(prev, answer(wrongOptionId(question)))))
    expect(right, '答对不产 answer-wrong').not.toContain('answer-wrong')
    expect(wrong, '答错不产 answer-correct').not.toContain('answer-correct')
  })
})

// ════════════════════════════════════════════════════════════════════════
// AC-C4 / G63 —— 每个 cue 在一次调用里最多出现一次
// ════════════════════════════════════════════════════════════════════════

describe('AC-C4 / G63 —— 每个 cue 在一次调用里最多一条', () => {
  it('G63：答对一次只产出一条 answer-correct', () => {
    const prev = freshState()
    const question = currentQuestion(prev)
    const { effects } = dispatch(prev, answer(correctOptionId(question)))
    const count = cues(effects).filter((c) => c === 'answer-correct').length
    expect(count, '一次 ANSWER 只能有一条 answer-correct —— 七个事件各有音效≠一个 action 播七遍').toBe(1)
  })

  it('G63：建塔一次只产出一条 tower-placed', () => {
    let state = freshState()
    const q = currentQuestion(state)
    state = reduce(state, answer(correctOptionId(q)))
    const { effects } = dispatch(state, placeTower(q.entryId, cellKey(ZOMBIE_ROW, 1)))
    const count = cues(effects).filter((c) => c === 'tower-placed').length
    expect(count, '一次 PLACE_TOWER 只能有一条 tower-placed').toBe(1)
  })
})

// ════════════════════════════════════════════════════════════════════════
// AC-C5 / G62 —— 三 cue 并发时的固定顺序（因果顺序，非字典序）
// ════════════════════════════════════════════════════════════════════════

describe('AC-C5 / G62 —— 一次 RESOLVE_ROUND 可同时产出三个 cue，顺序固定', () => {
  it('G62：zombie-died → heart-lost → level-complete 的顺序不可倒', () => {
    const effects = tripleCueDispatch().effects
    const order = cues(effects)
    expect(
      order,
      '三 cue 并发时必须是 zombie-died → heart-lost → level-complete —— 因果顺序（先打死、再掉心、最后胜负）',
    ).toEqual(['zombie-died', 'heart-lost', 'level-complete'])
  })

  it('G62：输出是数组且有序（不是 Set / Object.keys 的产物）', () => {
    const effects = tripleCueDispatch().effects
    expect(Array.isArray(effects), 'runEffects 返回数组 —— 返回顺序即播放顺序').toBe(true)
    // ⚠️ `[DS]` 2026-10-17 —— **Story 1.17 又改了这条判据，不是把它放宽**（R-57）。
    //
    // 1.15 把 `every(e => e.kind === 'SFX')`（1.14 的范围断言，1.15 接入 SAVE 后必然红）
    // 改成**精确的 kind 序列**。1.17 加了第五个成员 `TRACE`（回合日志，排在**最前**）
    // ⇒ 序列变成 `TRACE + SFX×3 + SAVE`。
    //
    // ⚠️ **TRACE 排第一不是随意选的**：日志记的是「当时发生了什么」，
    //   音效与存档是「它引起了什么」⇒ 先记因、后记果。
    //   这条判据因此**比原断言更强**：它钉死了五个成员的相对次序，
    //   任何一条被挪位置都会红。放宽的写法（`e.kind === 'SFX' || e.kind === 'SAVE'`）
    //   会让「多产一条 SAVE」照绿 —— 那正是本仓库吃过三次亏的形状。
    expect(
      effects.map((e) => e.kind),
      '一次 RESOLVE_ROUND 的 kind 序列必须是 TRACE + SFX×3 + SAVE：' +
        'TRACE 记因排最前，SAVE 记果排最后（1.17 裁决 1 / 1.15 裁决 4 / AC-C1）',
    ).toEqual(['TRACE', 'SFX', 'SFX', 'SFX', 'SAVE'])
  })

  it('G62：SAVE 排在 level-complete 之后 —— 先判胜负再落盘', () => {
    const effects = tripleCueDispatch().effects
    const saveIndex = effects.findIndex((e) => e.kind === 'SAVE')
    const completeIndex = effects.findIndex(
      (e) => e.kind === 'SFX' && e.cue === 'level-complete',
    )
    expect(saveIndex, '这次结算没产出 SAVE —— 1.15 AC-C2 说 round-over 是写盘点').toBeGreaterThan(-1)
    expect(saveIndex, 'SAVE 必须排在 level-complete 之后（因果顺序，不是字典序）').toBeGreaterThan(
      completeIndex,
    )
  })
})

// ════════════════════════════════════════════════════════════════════════
// AC-C3 陷阱 1 / AC-G4 / M117 —— RESTART_LEVEL 的心数回升不误报掉心
// ════════════════════════════════════════════════════════════════════════

describe('AC-C3 陷阱 1 —— RESTART_LEVEL 心数回升不产 heart-lost', () => {
  it('G63：重打本局（心数从低回到满）不产生 heart-lost', () => {
    // 先造一个 hearts=1 的 level-failed 局面，再重打 —— 心数**增加**。
    const failed = withHearts(levelFailedDispatch().next, 1)
    expect(failed.phase.kind, '重打只在 level-failed 合法').toBe('level-failed')
    const action = restartLevel()
    const next = reduce(failed, action)
    expect(next.hearts, '重打后心数回升到 HEARTS —— 这是本条测试的前提').toBe(HEARTS)
    const cuesHere = cues(runEffects(action, failed, next))
    expect(
      cuesHere,
      '心数增加时 lostSlotIndexes 返回 0 ⇒ 绝不误报掉心 —— 否则重打会炸出一声撞击音，而那一刻心是满的',
    ).not.toContain('heart-lost')
  })
})

// ════════════════════════════════════════════════════════════════════════
// AC-B5 —— 返回值是全新数组（每次调用新数组，不返回模块级单例）
// ════════════════════════════════════════════════════════════════════════

describe('AC-B5 —— 返回值是全新数组', () => {
  it('G62：两次同参调用返回不同的数组引用', () => {
    const prev = freshState()
    const question = currentQuestion(prev)
    const action = answer(correctOptionId(question))
    const next = reduce(prev, action)
    const a = runEffects(action, prev, next)
    const b = runEffects(action, prev, next)
    expect(a, '每次调用返回新数组 —— 否则调用方一 sort 就改了后续调用的结果').not.toBe(b)
  })

  it('G62：同参调用内容一致（纯函数的另一半）', () => {
    const prev = freshState()
    const question = currentQuestion(prev)
    const action = answer(correctOptionId(question))
    const next = reduce(prev, action)
    expect(cues(runEffects(action, prev, next))).toEqual(cues(runEffects(action, prev, next)))
  })
})

// ════════════════════════════════════════════════════════════════════════
// AC-B3 / AC-B4 —— Effect 是可辨识联合，四个 kind 一次建全；不改入参
// ════════════════════════════════════════════════════════════════════════

describe('AC-B3 / AC-B4 —— Effect 联合与纯度', () => {
  it('G62：产出的 Effect 都是可辨识联合的合法变体', () => {
    const prev = freshState()
    const question = currentQuestion(prev)
    const { effects } = dispatch(prev, answer(correctOptionId(question)))
    for (const e of effects) {
      // ⚠️ `[DS]` 2026-10-17 —— Story 1.17 加了第五个成员 `TRACE`（回合日志）。
      //   改的是**白名单的内容**，不是它的严格性：仍是「必须是 N 个变体之一」的穷尽名单，
      //   多一个未登记的 kind 照样红（R-57 留痕）。
      expect(
        ['SFX', 'ANIMATION', 'TTS', 'SAVE', 'TRACE'],
        'Effect.kind 必须是五个变体之一（TRACE 是 1.17 加的回合日志）',
      ).toContain(e.kind)
    }
  })

  it('G62：runEffects 不改入参（prev/next 保持不变）', () => {
    const prev = freshState()
    const question = currentQuestion(prev)
    const action = answer(correctOptionId(question))
    const next = reduce(prev, action)
    const prevBefore = JSON.stringify(prev)
    const nextBefore = JSON.stringify(next)
    runEffects(action, prev, next)
    expect(JSON.stringify(prev), 'runEffects 不得改变入参 prev').toBe(prevBefore)
    expect(JSON.stringify(next), 'runEffects 不得改变入参 next').toBe(nextBefore)
  })
})

// ── 场景构造（每个场景产出一个 `(prev, next, effects)` 快照）───────────────

/**
 * 造一个「结算打死一只僵尸」的 `(prev, next)` 快照。
 *
 * ⚠️ **合成而非走真实战斗流程**（与 `tripleCueDispatch` 同纪律）：
 *   真实流程里一只僵尸要挨够伤害才死，而伤害值（`ZOMBIE_HP=100` vs direct 塔 50/回合）
 *   是**平衡数值**——Story 3.2 会调它。把本守卫挂在那个数上，
 *   调平衡就会让音效判据的测试变红，而那条红与判据对错无关。
 *   `runEffects` 是 diff 函数，它看的是「next 少了一只僵尸」这件事本身。
 */
function zombieDeathDispatch() {
  const prev = synthesizeTripleState()
  const next: State = {
    ...prev,
    zombies: prev.zombies.filter((z) => z.id !== 'za'),
  }
  const action = resolveRound()
  return { prev, next, effects: runEffects(action, prev, next) }
}

/** 造一个「结算时掉一颗心」的场面：结算后 hearts 减少。 */
function heartLostDispatch() {
  // 直接构造：让一只僵尸贴到房子边（col=0），结算时被吃掉不掉心？——
  // 掉心要求僵尸**抵达房子外**。最稳的构造是让结算后的 next 真的少一颗心：
  // 用一个「无塔、僵尸已到 col=0」的局面，结算必然掉心。
  let state = freshState()
  const q = currentQuestion(state)
  state = reduce(state, answer(wrongOptionId(q))) // 答错 → 不解锁任何塔卡，无塔可建
  // 把唯一的僵尸推到 col=0（房子边），结算时抵达 → 掉心。
  const withZombieAtHouse = { ...state, zombies: state.zombies.map((z) => ({ ...z, col: 0 })) }
  const built = reduce(withZombieAtHouse, endBuild())
  const prev = built
  const action = resolveRound()
  const next = reduce(prev, action)
  return { prev, next, effects: runEffects(action, prev, next) }
}

/** 造一个「结算同时打死僵尸 + 掉心 + 通关」的三 cue 并发局面。 */
function tripleCueDispatch() {
  // ⚠️ 这三件事要在**一次** RESOLVE_ROUND 里同时成立。
  //   - 通关只在 CONTINUE 时判定（reducer 把 level-complete 放在 applyContinue），
  //     但 AC-C5 说的是「一次 action 产出三个 cue」，胜负判定也在 action 链路上。
  //   - 为构造三 cue 并发，最直接的是 CONTINUE 触发 level-complete，
  //     而它同一次不会掉心/打死僵尸 —— 所以真正的「三 cue 并发」在 CONTINUE 上。
  //   实际上：通关（level-complete）在 CONTINUE，打死僵尸+掉心在 RESOLVE_ROUND。
  //   ⇒ 一次 action 同时产生三者在纯 reducer 流程里不可达；
  //   但 AC-C5 明确要求 runEffects 在**合成**的 (prev,next) 上按固定顺序排列 ——
  //   所以这里直接合成一个 (prev,next) 对来验证顺序，而不是指望流程走出来。
  //   这与文件头「造 state 而不是走完整流程」的纪律一致。
  const prev = synthesizeTripleState()
  const next = synthesizeTripleNext(prev)
  const action = resolveRound()
  const effects = runEffects(action, prev, next)
  return { prev, next, effects }
}

/** 合成一个「结算前」的状态：有僵尸、有塔、心未耗尽、场上僵尸数比 next 多。 */
function synthesizeTripleState(): State {
  const base = freshState()
  // 直接构造一个 awaiting-build 相位下、有 2 只僵尸、1 座塔、满心的 state。
  const q = currentQuestion(base)
  const unlocked = reduce(base, answer(correctOptionId(q)))
  return {
    ...unlocked,
    // phase 必须是 awaiting-build（END_BUILD 之后是 resolving，这里我们假装在结算前）
    zombies: [
      { id: 'za', col: 3, hp: 1, slowTurnsLeft: 0 }, // 会被塔打死
      { id: 'zb', col: 0, hp: 50, slowTurnsLeft: 0 }, // 会抵达掉心
      { id: 'zc', col: 8, hp: 50, slowTurnsLeft: 0 }, // 残留
    ],
  }
}

/** 合成对应的「结算后」状态：少一只僵尸（za 被打死）、掉一颗心、相位 level-complete。 */
function synthesizeTripleNext(prev: State): State {
  return {
    ...prev,
    zombies: prev.zombies.filter((z) => z.id !== 'za'), // 少一只 ⇒ zombie-died
    hearts: prev.hearts - 1, // 掉心 ⇒ heart-lost
    phase: { kind: 'level-complete' }, // 胜负 ⇒ level-complete
  }
}

/** 造一个「全部答对 ⇒ CONTINUE 推进到通关」的 dispatch（真实流程，level-complete）。 */
function levelCompleteDispatch() {
  let state = freshState()
  // 答对全部 3 题，每题之间走一次 build → resolve → continue。
  while (state.phase.kind === 'awaiting-answer') {
    const q = currentQuestion(state)
    state = reduce(state, answer(correctOptionId(q)))
    // 进 awaiting-build；结算 + 推进。
    state = reduce(state, endBuild())
    const beforeContinue = state
    state = reduce(state, resolveRound())
    if (state.phase.kind === 'round-over') {
      const action = continueRound()
      const next = reduce(state, action)
      const effects = runEffects(action, beforeContinue, next)
      if (cues(effects).includes('level-complete')) {
        return { prev: state, next, effects }
      }
      state = next
    }
  }
  // 兜底：正常流程下最后一次 CONTINUE 才会通关，这里不该走到。
  throw new Error('levelCompleteDispatch 未走到 level-complete —— 构造有问题')
}

/** 造一个「心数耗尽 ⇒ level-failed」的 dispatch。 */
function levelFailedDispatch() {
  // 只剩一颗心，且场上有抵达房子的僵尸 ⇒ 结算后 hearts 归零 ⇒ level-failed。
  const state = reduce(freshState(), answer(wrongOptionId(currentQuestion(freshState()))))
  const withZombieAtHouse = { ...state, zombies: state.zombies.map((z) => ({ ...z, col: 0 })) }
  const prev = withHearts(reduce(withZombieAtHouse, endBuild()), 1)
  const action = resolveRound()
  const next = reduce(prev, action)
  if (next.phase.kind !== 'level-failed') {
    throw new Error('levelFailedDispatch 构造未走到 level-failed')
  }
  return { prev, next, effects: runEffects(action, prev, next) }
}

/** 只改 hearts，不改 phase（见 hud.test.ts 同款 helper）。 */
function withHearts(state: State, hearts: number): State {
  return { ...state, hearts }
}
