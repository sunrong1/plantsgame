/**
 * 回合状态机（Story 1.5 / AC-1…AC-8、AC-11、AC-12、AC-13、AC-14；子任务 7.1）。
 *
 * ── 守什么 ────────────────────────────────────────────────────────────────
 * `reduce` 是**唯一**的状态变更点（架构决策 2）。本文件守三件事：
 *
 *  1. **阶段转换表的每一条边**（AC-1、AC-14）。六种 `Phase` 全部可被观测到 ——
 *     少一种能出现的 Phase，六种里就有一种是死分支，而死分支不会有任何报错。
 *  2. **每一条非法的边都抛错**（AC-2、FR54）。非法 action 静默忽略的后果是
 *     界面上「点了没反应」，而重进游戏后状态又对不上 —— 极难溯源。
 *  3. **每一条结算规则的后果**（AC-3、AC-4、AC-5、AC-6、AC-11、AC-12）。
 *
 * ── 为什么这么写 ──────────────────────────────────────────────────────────
 * 「非法 action 拒绝」用**矩阵**而不是逐条散测：六个 Phase × 六个 Action 共 36 种组合，
 * 逐条写必然漏掉几格，而漏掉的那格恰好是 [CR] 删掉 `PLACE_TOWER` 之外某条边时的现场。
 * 矩阵里把「合法边」显式列出来，漏一条边或加一条边都会立刻红。
 *
 * ⚠️ 断言一律读常量算式（`sunPerCorrectFor(1)`、`HEARTS`），不写死 `50` / `3` ——
 * Story 3.2 / 2.3 会调这些数值，写死会让「调数值」与「改断言」变成两件事。
 */

import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  COLS,
  HEARTS,
  HOUSE_COL,
  ZOMBIE_HP,
  ZOMBIE_MOVE_PER_ROUND,
  ZOMBIE_ROW,
  ZOMBIE_SPAWN_COL,
  answer,
  assertInvariants,
  cellKey,
  continueRound,
  costOf,
  createInitialState,
  endBuild,
  initialSunFor,
  isCorrect,
  placeTower,
  reduce,
  resolveRound,
  restartLevel,
  sunPerCorrectFor,
} from '../../src/core'
import type { Action, DeckEntry, Phase, State, Tower } from '../../src/core'
import { correctOptionId, makeSyntheticDeck, wrongOptionId } from '../fixtures/synthetic-deck.js'
import { answerCurrent, greedyBuildActions, runLevel } from '../fixtures/level-driver.js'

// ── 驱动辅助 ─────────────────────────────────────────────────────────────

/** `src/core/` 的根 —— 「源码里没有随机与时间依赖」那条断言要真的去读它。 */
const CORE_ROOT_URL = new URL('../../src/core/', import.meta.url)

/** 需要扫的 core 源文件：状态变更的全部实现都在这几个文件里。 */
const CORE_SOURCE_FILES = ['reducer.ts', 'turn.ts', 'combat.ts', 'grid.ts', 'balance.ts', 'actions.ts']

/** 一局用的题单：10 题（断言 3/4 需要 10 题的规模）。 */
const DECK = makeSyntheticDeck(10)

/** 单元 1 的开局 state。 */
function fresh(): State {
  return createInitialState({ unitNumber: 1, deck: DECK })
}

/** 当前正在问的那道题。非 awaiting-answer 时抛错 —— 写错测试步骤要立刻炸。 */
function currentQuestion(state: State): DeckEntry {
  if (state.phase.kind !== 'awaiting-answer') {
    throw new Error(`当前阶段是 ${state.phase.kind}，没有正在问的题`)
  }
  return state.phase.question
}

/**
 * 走完一个回合：答题 → （可选建塔）→ 结束建造 → 结算。
 * 不含 CONTINUE —— 「要不要进入下一回合」在断言 4 里是变量，留在调用方决定。
 */
function playRound(state: State, correct: boolean, build?: (after: State) => Action[]): State {
  const answered = answerCurrent(state, correct)
  const actions = build === undefined ? [] : build(answered)
  let next = answered
  for (const a of actions) {
    next = reduce(next, a)
  }
  return reduce(reduce(next, endBuild()), resolveRound())
}

/**
 * 📎 **1.19 CR 新增**：取出 state 上那份**收窄过的** `awaiting-build` 相位。
 *
 * ⚠️ **为什么需要它而不是写 `as`**：`Phase` 是六变体联合，直接写
 *   `base.phase.question` 编译不过（另外五个变体没有这个字段），
 *   而本仓库对 `as` 的态度是「它常用来把断言变得不再断言」。
 *   ⇒ 收窄写在**判据之外的一个具名 helper** 里，读代码的人一眼知道
 *     「这里断言过前置」，而不是「这里被按了一下类型」。
 *
 * ⚠️ **收窄失败就抛**：静默返回一个假的 build 相位，会让下面那些
 *   「必须抛」/「必须不抛」的判据变成在测另一个东西。
 */
function buildPhaseOf(state: State): Extract<State['phase'], { readonly kind: 'awaiting-build' }> {
  if (state.phase.kind !== 'awaiting-build') {
    throw new Error(`前置：当前相位是 ${state.phase.kind}，不是 awaiting-build`)
  }
  return state.phase
}

/** 走到某个阶段的 state。用法：`atPhase('round-over')`。 */
function atPhase(kind: Phase['kind'], deck: readonly DeckEntry[] = DECK): State {
  let state = createInitialState({ unitNumber: 1, deck })
  if (kind === 'awaiting-answer') {
    return state
  }
  state = answerCurrent(state, true)
  if (kind === 'awaiting-build') {
    return state
  }
  state = reduce(state, endBuild())
  if (kind === 'resolving') {
    return state
  }
  state = reduce(state, resolveRound())
  if (kind === 'round-over') {
    return state
  }
  throw new Error(`atPhase 只能走到 round-over 及更早，收到 ${kind}（终态请直接跑出来）`)
}

/** 走到 `level-failed`：开局连错到心耗尽。 */
function failedState(howManyWrong = 4): State {
  let state = fresh()
  let guard = 0
  while (state.phase.kind !== 'level-failed') {
    guard += 1
    if (guard > 20) {
      throw new Error(`连错 ${howManyWrong} 题仍未进入 level-failed —— 掉心链路断了`)
    }
    state = playRound(state, false)
    if (state.phase.kind === 'round-over') {
      state = reduce(state, continueRound())
    }
  }
  return state
}

/** 走到 `level-complete`：全部答对，且按贪心策略建塔。 */
function completeState(deck: readonly DeckEntry[] = DECK): State {
  let state = createInitialState({ unitNumber: 1, deck })
  let guard = 0
  while (state.phase.kind !== 'level-complete') {
    guard += 1
    if (guard > deck.length + 5) {
      throw new Error(
        `全部答对且按贪心建塔后仍未进入 level-complete（已跑 ${guard} 回合）—— 通关不可达意味着门槛或结算有误`,
      )
    }
    // ⚠️ 必须建塔：全程不建塔时，僵尸必抵房子（第 4 次结算起每回合掉 1 心），
    // 「全对也过不了关」—— 那不是设计，是关卡不可完成。
    const answered = answerCurrent(state, true)
    let withTowers = answered
    for (const action of greedyBuildActions(answered)) {
      withTowers = reduce(withTowers, action)
    }
    state = reduce(reduce(withTowers, endBuild()), resolveRound())
    if (state.phase.kind === 'round-over') {
      state = reduce(state, continueRound())
    }
  }
  return state
}

describe('AC-1 / AC-8 —— createInitialState 造出回合 1', () => {
  it('开局即 awaiting-answer，携带题单第 1 题', () => {
    const state = fresh()
    expect(state.phase.kind, '开局必须直接进入 awaiting-answer —— 另加一个「回合开始」阶段会让六种 Phase 变七种且无一可测').toBe(
      'awaiting-answer',
    )
    expect(
      currentQuestion(state).entryId,
      '第一题必须是题单的首个未答对条目 —— 若不是，重考回合的顺序就不由题单决定',
    ).toBe(DECK[0].entryId)
  })

  it('初始心数 / 阳光 / 回合号 / 战场', () => {
    const state = fresh()
    expect(state.hearts, '初始心数由 HEARTS 唯一定义 —— 写死会让 balance.ts 的调整不生效').toBe(HEARTS)
    expect(state.sun, '开局阳光必须是 initialSunFor(unitNumber) —— 单元 1 为 0').toBe(initialSunFor(1))
    expect(state.turn, '回合号从 1 起 —— 从 0 起会让日志里的 turn 与题面序号对不上').toBe(1)
    expect(state.towers.length, '开局场上无塔').toBe(0)
    expect(state.grid, '开局的格子索引必须为空对象 —— 用 null 或 Map 会让决策 5 的序列化静默丢战场').toEqual({})
    expect(state.masteredEntryIds.length, '开局没有答对过任何题').toBe(0)
    expect(state.unlocked.length, '开局的塔卡一张都没解锁').toBe(0)
  })

  it('AC-6 —— 第 1 只僵尸在开局就入场，位置为 ZOMBIE_SPAWN_COL', () => {
    const state = fresh()
    expect(state.zombies.length, 'AC-6：僵尸在回合开始时入场 —— 缺了这只，开局就没有掉心来源').toBe(1)
    expect(state.zombies[0].col, `入场列必须是 ZOMBIE_SPAWN_COL = ${ZOMBIE_SPAWN_COL}`).toBe(ZOMBIE_SPAWN_COL)
    expect(state.zombies[0].hp, '入场僵尸必须是满血 —— 少一点血会让「几题掉心」的门槛凭空偏移').toBe(ZOMBIE_HP)
  })

  it('题单原样进入 state（一局内固定全集）', () => {
    expect(fresh().deck.length, 'state.deck 必须是本局题单的全集 —— 子集会让重考无处可考').toBe(DECK.length)
  })

  it('题单为空时抛错（不造出一个永远答不出题的局）', () => {
    // 空题单 ⇒ 第一回合就没有题可问，而 UI 会停在 awaiting-answer 等一个不存在的选项。
    expect(
      () => createInitialState({ unitNumber: 1, deck: [] }),
      '空题单必须抛错 —— 否则开局就卡在一个永远等不到答案的阶段，且无任何报错',
    ).toThrow()
  })

  it('单元号落在未填档位上时抛错（沿用 tierForUnit 的口径，不静默回退）', () => {
    // Epic 1 只填了单元 1–4。用单元 9 造局若静默回退到首档，平衡模拟会在
    // 未校准的数值上跑出一整张「看起来有效」的门槛表。
    expect(() => createInitialState({ unitNumber: 9, deck: DECK }), '未填档位必须抛错（AC-3），不得回退默认值').toThrow()
  })
})

describe('AC-3 / AC-4 —— 答题结算', () => {
  it('答对：阳光按档位增加、题目入 mastered、塔卡入 unlocked', () => {
    const answered = answerCurrent(fresh(), true)
    const question = currentQuestion(fresh())
    const expectedSun = initialSunFor(1) + sunPerCorrectFor(1)

    expect(answered.sun, `答对必须按 sunPerCorrectFor(unitNumber) 加阳光（当前应为 ${expectedSun}）—— 写死 50 会让 Story 2.3 的档位调整不生效`).toBe(expectedSun)
    expect(answered.masteredEntryIds, '答对的题必须进入 masteredEntryIds —— 它是「该题不再被选中」的唯一表达').toContain(
      question.entryId,
    )
    expect(answered.unlocked, '答对必须解锁该题的塔卡 —— 不解锁则孩子答对了却建不了任何塔').toContain(question.entryId)
    expect(answered.phase.kind, '答题后进入建造阶段').toBe('awaiting-build')
  })

  it('答对：僵尸不被自动消灭（塔是唯一能杀死它的东西）', () => {
    const before = fresh()
    const after = answerCurrent(before, true)
    expect(
      after.zombies.length,
      '答对不得消灭僵尸 —— 消灭权只属于塔，否则战斗层形同虚设，孩子答对了就万事大吉',
    ).toBe(before.zombies.length)
    expect(after.zombies[0].col, '答题不改变僵尸位置 —— 推进只发生在 resolving').toBe(before.zombies[0].col)
  })

  it('答错：阳光不变、不解锁、不入 mastered', () => {
    const before = fresh()
    const after = answerCurrent(before, false)

    expect(after.sun, '答错不得改变阳光 —— 扣阳光会让答题与战斗两层耦合，「塔防」退化成「答题罚款」').toBe(before.sun)
    expect(after.unlocked.length, '答错不得解锁塔卡 —— 解锁是答对的奖励，否则多答错几次就能攒出塔').toBe(0)
    expect(after.masteredEntryIds.length, '答错不得进入 masteredEntryIds —— 否则该题永远不会再被考，孩子学不会').toBe(0)
    expect(after.phase.kind, '答错同样进入建造阶段 —— 答错也占用一个回合，否则答错可以无成本跳过').toBe('awaiting-build')
  })

  it('答错：场上僵尸照常留下（掉心的唯一来源）', () => {
    const after = answerCurrent(fresh(), false)
    expect(after.zombies.length, '答错后僵尸照常留在场上推进 —— 这是掉心的唯一来源，删掉它关卡永不失败').toBe(1)
  })

  it('AC-5 —— 答错的题下一回合仍被选中（重考）', () => {
    const first = currentQuestion(fresh()).entryId
    const afterRound = reduce(playRound(fresh(), false), continueRound())
    expect(
      currentQuestion(afterRound).entryId,
      `答错的题（${first}）必须被重新选中 —— 否则「没学会的词一定会被再教一次」这条核心承诺不成立`,
    ).toBe(first)
  })

  it('AC-5 —— 答对的题不再被选中，且题单数组本身一局内不变', () => {
    let state = playRound(fresh(), true)
    const deckReference = state.deck
    state = reduce(state, continueRound())
    expect(
      currentQuestion(state).entryId,
      '答对的题不得再次被选中 —— 「已答对不再出现」全靠 masteredEntryIds 表达',
    ).toBe(DECK[1].entryId)
    expect(state.deck, 'deck 数组在一局内不得被替换 —— 重建题单会让存档里的 mastered 与新题单对不上').toBe(deckReference)
    expect(
      state.deck,
      '题单不得与调用方共用数组引用 —— 内容层一次 sort()/splice() 就会悄悄改掉一局进行中的存档在考什么',
    ).not.toBe(DECK)
  })

  it('选了不存在的选项 id 时抛错（不静默当作答错）', () => {
    // 静默 false 会把「组件传错了 id」伪装成「孩子答错了」，界面上是「怎么点都错」。
    expect(
      () => reduce(fresh(), answer('u1-word-01-o99')),
      '未知 optionId 必须抛错 —— 静默当作答错会让渲染层的 id 错误永远查不出来',
    ).toThrow()
  })

  it('isCorrect 与 reducer 用的是同一份判定（FR14 唯一实现）', () => {
    // 两条判定实现漂移时，界面上会随机出现「判对却没阳光」。
    const state = fresh()
    const question = currentQuestion(state)
    const correctId = correctOptionId(question)
    const answered = reduce(state, answer(correctId))
    expect(
      answered.sun > state.sun,
      'reducer 的判定与 isCorrect 必须同源 —— 不同源时「判对却没反应」会被当成规则如此',
    ).toBe(isCorrect(question.card, correctId))
  })
})

describe('AC-12 —— 建造的 reducer 侧规则', () => {
  it('放置扣阳光、写 grid 与 towers，且阶段自环（仍是 awaiting-build）', () => {
    const answered = answerCurrent(fresh(), true)
    const entry = currentQuestion(fresh())
    const cost = costOf(entry.towerType, 1)

    const built = reduce(answered, placeTower(entry.entryId, cellKey(ZOMBIE_ROW, 4)))

    expect(built.sun, `建造必须扣 costOf(towerType, unitNumber) = ${cost} —— 不扣阳光等于白送塔`).toBe(answered.sun - cost)
    expect(built.towers.length, '建成的塔必须进入 towers').toBe(1)
    expect(
      built.grid[cellKey(ZOMBIE_ROW, 4)],
      '建成的塔必须写入 grid —— 存档与「格子是否被占」的判定都读 grid',
    ).toBe(built.towers[0].id)
    expect(built.phase.kind, '建造后仍是 awaiting-build（自环）—— 一次回合可以建多株塔').toBe('awaiting-build')
  })

  it('塔的 wordId 与 towerType 来自题单条目，不由 action 决定（FR23）', () => {
    const answered = answerCurrent(fresh(), true)
    const entry = currentQuestion(fresh())
    const built = reduce(answered, placeTower(entry.entryId, cellKey(ZOMBIE_ROW, 4)))

    expect(built.towers[0].wordId, '塔的显示名必须来自题单条目的 wordId —— 让组件自己传就是允许词与塔错配').toBe(entry.wordId)
    expect(built.towers[0].towerType, '塔型必须来自题单条目的 towerType —— 战斗数值只由它决定（AC-8）').toBe(entry.towerType)
  })

  it('FR33 —— 同一张塔卡可反复建多株，且 unlocked 不因建造而减少', () => {
    // 需要阳光：单元 1 每答对一题 +50、直射塔 50 —— 一回合只够建一株，
    // 所以跑两回合（两株）才能验证「同一张卡建多株」。第二回合卡仍是第一张
    // —— 解锁列表在第二轮又追加了别的卡，但我们显式指定第一张。
    const firstEntry = DECK[0].entryId
    let state = fresh()
    for (let round = 0; round < 2; round += 1) {
      state = answerCurrent(state, true)
      state = reduce(state, placeTower(firstEntry, cellKey(ZOMBIE_ROW, 4 + round)))
      state = reduce(state, endBuild())
      state = reduce(state, resolveRound())
      state = reduce(state, continueRound())
    }

    expect(state.towers.length, '同一张塔卡必须能建多株 —— unlocked 是数组不是集合（FR33）').toBe(2)
    expect(
      state.towers.map((q) => q.wordId),
      '两株塔必须绑定同一个词（FR33）—— 若建第二株时被解除了塔卡，这一步就建不出来',
    ).toEqual([DECK[0].wordId, DECK[0].wordId])
    expect(state.unlocked, '建造不得把塔卡从 unlocked 里移除 —— 移除后第二株就建不出来').toContain(firstEntry)
  })

  it('阳光不足时抛错', () => {
    // ⚠️ 这条断言必须**真的走到** `state.sun < cost` 那一步。
    //   开局 `fresh()` 处在 `awaiting-answer` 且 `sun = 0` / `unlocked = []` ——
    //   拿它去建塔会先被**阶段守卫**拦下，抛的是「还在等孩子答题」，
    //   跟阳光毫无关系（`[CR]` 2026-10-14 变异验证：关掉阳光守卫后本条仍全绿）。
    //   真正的走法：答对一题拿到刚好一株塔的钱 → 建掉它 → 阳光归零但仍在建造阶段 →
    //   这时再建第二株，才会撞上 `state.sun < cost`。
    const answered = answerCurrent(fresh(), true)
    const afterFirst = reduce(answered, placeTower(DECK[0].entryId, cellKey(ZOMBIE_ROW, 3)))

    expect(afterFirst.phase.kind, '前提：建完一株后仍处在建造阶段，否则下面撞上的不是阳光守卫').toBe('awaiting-build')
    expect(afterFirst.sun, '前提：建完一株后阳光归零（单元 1 每答对一题的钱刚好够一株直射塔）').toBe(0)

    expect(
      () => reduce(afterFirst, placeTower(DECK[0].entryId, cellKey(ZOMBIE_ROW, 4))),
      '阳光不足必须抛错 —— 静默忽略会让点击建塔毫无反应',
    ).toThrow(/阳光不足/)
  })

  it('未解锁的塔卡不得建造（哪怕阳光够）', () => {
    const answered = answerCurrent(fresh(), true)
    const unUnlocked = DECK[5]
    expect(
      () => reduce(answered, placeTower(unUnlocked.entryId, cellKey(ZOMBIE_ROW, 4))),
      '未解锁的塔卡必须拒绝 —— 允许的话「答对才建塔」这条激励链消失，孩子可以开局白嫖所有词',
    ).toThrow()
  })

  it('题单里没有的 entryId 时抛错（脏存档路径）', () => {
    // ⚠️ 不能直接拿 `'u1-does-not-exist'` 去建塔 —— 它**没被解锁**，
    //   会先被①号 `unlocked.includes` 拦下，`requireEntry` 根本没被调用
    //   （`[CR]` 2026-10-14 变异验证：关掉 `requireEntry` 的 throw 全套件仍绿）。
    //   `requireEntry` 真正要守的是**脏存档**：断点续学恢复出来的 state 里
    //   `unlocked` 带着一个当前题单里已经不存在的 entryId（内容改版后旧存档的残留）。
    //   这种 state 过得了①号，却过不了 `deck.find` —— 那才是它的用武之地。
    const answered = answerCurrent(fresh(), true)
    const dirty = { ...answered, unlocked: [...answered.unlocked, 'u1-removed-in-v2'] }

    expect(
      () => reduce(dirty, placeTower('u1-removed-in-v2', cellKey(ZOMBIE_ROW, 4))),
      '已解锁但题单里查不到的 entryId 必须抛错 —— 静默放过会造出一座词与塔型都无从追溯的塔，而战斗数值照常生效',
    ).toThrow(/题单里没有 entryId/)
  })

  it('目标格已占用时抛错（FR30）', () => {
    let built = answerCurrent(fresh(), true)
    const entry = currentQuestion(fresh())
    const occupied = cellKey(ZOMBIE_ROW, 4)
    built = reduce(built, placeTower(entry.entryId, occupied))

    expect(() => reduce(built, placeTower(entry.entryId, occupied)), '同一格不得建两座塔 —— 静默放过会让 grid 与 towers 双向不一致，塔永远打不到').toThrow()
  })

  it('僵尸入场格不得建塔（射程单边 ⇒ 建在那里的塔永远打不到东西）', () => {
    const answered = answerCurrent(fresh(), true)
    expect(answered.sun, '前提：阳光够建一株塔，否则撞上的不是这条规则').toBeGreaterThan(0)

    expect(
      () => reduce(answered, placeTower(DECK[0].entryId, cellKey(ZOMBIE_ROW, ZOMBIE_SPAWN_COL))),
      '僵尸入场格不得建塔 —— 射程单边（只打自己左边的格子），建在这里的塔整局一动不动，孩子却白花了全部阳光',
    ).toThrow(/僵尸入场格/)
  })

  it('房子格不得建塔（僵尸走到这一格就已离场，塔在它脚下从未开火）', () => {
    const answered = answerCurrent(fresh(), true)
    expect(answered.sun, '前提：阳光够建一株塔，否则撞上的不是这条规则').toBeGreaterThan(0)

    expect(
      () => reduce(answered, placeTower(DECK[0].entryId, cellKey(ZOMBIE_ROW, HOUSE_COL))),
      '房子格不得建塔 —— 僵尸走到这一格就已经离场并丢心，塔在它脚下却从未开过火',
    ).toThrow(/房子格/)
  })

  it('格子键非法时抛错（不静默当作空格）', () => {
    const answered = answerCurrent(fresh(), true)
    const entry = currentQuestion(fresh())
    // ⚠️ 用「非规范写法」而不是「越界」：越界由 assertInsideGrid 抛（已有测试），
    // 而 '02,8' 能解析成合法坐标却不等于任何 cellKey 会产出的键 —— 那才是静默失配的入口。
    expect(() => reduce(answered, placeTower(entry.entryId, '02,8')), '非规范格子键必须抛错 —— 否则塔会建到与存档键失配的格子上，表现为「塔凭空消失」').toThrow()
  })

  it('建造顺序即数组顺序（攻击顺序依赖它，自主设计 #7）', () => {
    // 两回合各建一株，且**故意先建 col 7 再建 col 4**（与列号升序相反）：
    // 若实现偷偷按 col 排序，本断言变红 —— 而「先建哪座塔」正是玩家能决策的东西。
    const entry = DECK[0].entryId
    let state = fresh()
    for (const col of [7, 4]) {
      state = answerCurrent(state, true)
      state = reduce(state, placeTower(entry, cellKey(ZOMBIE_ROW, col)))
      state = reduce(reduce(state, endBuild()), resolveRound())
      state = reduce(state, continueRound())
    }

    expect(
      state.towers.map((q) => q.col),
      'towers 必须保持建造顺序 —— 攻击顺序即此顺序，排序会让「先建哪座塔」失去后果',
    ).toEqual([7, 4])
  })
})

describe('AC-1 / AC-7 —— 阶段转换表逐条边', () => {
  it('awaiting-build --END_BUILD--> resolving（只切阶段，不结算）', () => {
    const answered = answerCurrent(fresh(), true)
    const resolving = reduce(answered, endBuild())

    expect(resolving.phase.kind, 'END_BUILD 只能切到 resolving —— 直接进 round-over 会让六种 Phase 少一种且战斗动画没有落脚点').toBe('resolving')
    expect(
      resolving.zombies[0].col,
      'END_BUILD 不得推进僵尸 —— 结算只发生在 RESOLVE_ROUND，否则「resolving 是真实一帧」就落空了',
    ).toBe(answered.zombies[0].col)
  })

  it('resolving --RESOLVE_ROUND--> round-over，且僵尸推进、塔开火', () => {
    let built = answerCurrent(fresh(), true)
    const entry = currentQuestion(fresh())
    built = reduce(built, placeTower(entry.entryId, cellKey(ZOMBIE_ROW, 7)))
    built = reduce(reduce(built, endBuild()), resolveRound())

    expect(built.phase.kind, '结算完成且未掉光心时进入 round-over').toBe('round-over')
    expect(built.zombies[0].col, 'RESOLVE_ROUND 必须推进僵尸 —— 不推进则掉心链路不存在，关卡永不失败').toBe(ZOMBIE_SPAWN_COL - ZOMBIE_MOVE_PER_ROUND)
    expect(built.zombies[0].hp, '塔在射程内必须开火 —— 不开火则战斗层与回合层脱钩').toBeLessThan(ZOMBIE_HP)
  })

  it('round-over --CONTINUE--> awaiting-answer：回合 +1、下一题僵尸入场', () => {
    const over = playRound(fresh(), true)
    const next = reduce(over, continueRound())

    expect(next.phase.kind, 'CONTINUE 回到 awaiting-answer').toBe('awaiting-answer')
    expect(next.turn, '回合号必须 +1 —— 日志与题面序号都读它').toBe(over.turn + 1)
    expect(next.zombies.length, 'AC-6：每个回合开始都有新僵尸入场 —— 缺了就少一个掉心来源，门槛会偏').toBe(over.zombies.length + 1)
    expect(next.zombies[next.zombies.length - 1].col, `新入场僵尸必须在 ZOMBIE_SPAWN_COL = ${ZOMBIE_SPAWN_COL}`).toBe(ZOMBIE_SPAWN_COL)
  })

  it('AC-6 —— 答错同样让僵尸入场（区别只在不给阳光与塔）', () => {
    const over = playRound(fresh(), false)
    const next = reduce(over, continueRound())
    expect(next.zombies.length, '答错回合也必须有僵尸入场 —— 否则「开局连错 ⇒ 无塔 ⇒ 掉心」的链条断在第一环').toBe(over.zombies.length + 1)
  })

  it('AC-8 —— 全部答对后 CONTINUE 进入 level-complete', () => {
    const complete = completeState()
    expect(complete.phase.kind, '题单全部答对时 CONTINUE 必须进入 level-complete —— 否则孩子永远看不到通关').toBe('level-complete')
    expect(complete.masteredEntryIds.length, '通关时全部题目都应已答对').toBe(DECK.length)
  })

  it('AC-11 —— 进入 level-complete 时战场被清空（两个终态对称）', () => {
    // 贪心策略确实建出了塔，所以「战场是空的」不是因为压根没建 —— 前提成立。
    const complete = completeState()
    expect(complete.phase.kind, '前提：这条断言必须在 level-complete 上跑').toBe('level-complete')
    expect(complete.towers.length, '通关时塔必须离场 —— 留着会让「通关了但还能改局面」成立，且持久化层会把它当成进行中的对局').toBe(0)
    expect(Object.keys(complete.grid).length, 'grid 必须与 towers 一起清空 —— 只清一半会让 grid 与 towers 立即双向不一致').toBe(0)
    expect(complete.zombies.length, '通关时僵尸必须离场 —— 下一回合不再推进它们，留着只是死数据').toBe(0)
  })

  it('AC-11 —— 结算后已建塔仍在场（FR82）', () => {
    const answered = answerCurrent(fresh(), true)
    const entry = currentQuestion(fresh())
    const built = reduce(answered, placeTower(entry.entryId, cellKey(ZOMBIE_ROW, 7)))
    const over = reduce(reduce(built, endBuild()), resolveRound())

    expect(over.towers.length, '结算后塔必须仍在场 —— 每回合清空会让「塔是持久资产」失效，递增阳光也就不再影响难度').toBe(1)
  })

  it('AC-5 —— level-failed --RESTART_LEVEL--> 回到 awaiting-answer 且战场重置', () => {
    const failed = failedState()
    expect(failed.phase.kind, '心耗尽时必须进入 level-failed —— 否则孩子输了也不知道为什么结束').toBe('level-failed')

    const restarted = reduce(failed, restartLevel())
    expect(restarted.phase.kind, '重打后回到 awaiting-answer').toBe('awaiting-answer')
    expect(restarted.hearts, '重打必须把心重置为 HEARTS').toBe(HEARTS)
    expect(restarted.sun, '重打必须把阳光重置为 initialSunFor(unitNumber)').toBe(initialSunFor(1))
    expect(restarted.masteredEntryIds.length, '重打必须清空 mastered —— 否则上一局的进度会带进这一局，孩子永远学不会开局的词').toBe(0)
    expect(restarted.towers.length, '重打必须清空战场（FR51）—— 带着上一局的塔重打等于换词不换局面').toBe(0)
    expect(restarted.zombies.length, '重打后第 1 只僵尸重新入场').toBe(1)
    expect(
      restarted.deck,
      '重打必须原样复用题单**内容**（AC-5）—— 换题单会让「这一局学完这个单元」的承诺失效。' +
        '注意是内容相等而非同一引用：`createInitialState` 会复制题单数组，' +
        '以免与调用方共用可变别名（`[CR]` 2026-10-14）',
    ).toEqual(failed.deck)
    expect(currentQuestion(restarted).entryId, '重打从题单第 1 题开始').toBe(DECK[0].entryId)
  })
})

describe('AC-2 / AC-14 —— 非法 action 按阶段抛错（36 种组合的矩阵）', () => {
  /** 六个阶段各自可达的最小 state。终态用跑出来的，不用手搓。 */
  const states: readonly { readonly kind: Phase['kind']; readonly state: State }[] = [
    { kind: 'awaiting-answer', state: atPhase('awaiting-answer') },
    { kind: 'awaiting-build', state: atPhase('awaiting-build') },
    { kind: 'resolving', state: atPhase('resolving') },
    { kind: 'round-over', state: atPhase('round-over') },
    { kind: 'level-complete', state: completeState() },
    { kind: 'level-failed', state: failedState() },
  ]

  const actions: readonly { readonly action: Action; readonly legalIn: readonly Phase['kind'][] }[] = [
    { action: answer('u1-word-01-o1'), legalIn: ['awaiting-answer'] },
    { action: placeTower(DECK[0].entryId, cellKey(ZOMBIE_ROW, 4)), legalIn: ['awaiting-build'] },
    { action: endBuild(), legalIn: ['awaiting-build'] },
    { action: resolveRound(), legalIn: ['resolving'] },
    { action: continueRound(), legalIn: ['round-over'] },
    { action: restartLevel(), legalIn: ['level-failed'] },
  ]

  it('六个阶段全部可达（不允许有死分支）', () => {
    const reachable = new Set(states.map((s) => s.state.phase.kind))
    const all: readonly Phase['kind'][] = [
      'awaiting-answer',
      'awaiting-build',
      'resolving',
      'round-over',
      'level-complete',
      'level-failed',
    ]
    for (const kind of all) {
      expect(reachable.has(kind), `Phase '${kind}' 必须能被观测到 —— 观测不到的死分支意味着状态机少了一条边而测试看不出来`).toBe(true)
    }
  })

  it('合法的边不抛错', () => {
    for (const { state } of states) {
      for (const { action, legalIn } of actions) {
        if (!legalIn.includes(state.phase.kind)) {
          continue
        }
        // level-failed 的 RESTART_LEVEL 与 level-complete 是终态，只验证不抛；
        // 其余组合在各自测试里已有覆盖，这里只兜底「合法边被误判成非法」。
        expect(
          () => reduce(state, action),
          `${action.type} 在 ${state.phase.kind} 阶段是合法的，不得抛错 —— 误判会让合法的对局无法进行`,
        ).not.toThrow()
      }
    }
  })

  it('非法的边全部抛错（每种组合都要有一条 toThrow）', () => {
    let checked = 0
    for (const { state } of states) {
      for (const { action, legalIn } of actions) {
        if (legalIn.includes(state.phase.kind)) {
          continue
        }
        checked += 1
        expect(
          () => reduce(state, action),
          `${action.type} 在 ${state.phase.kind} 阶段非法，必须抛错 —— 静默忽略会让界面上「点了没反应」，且重进游戏后状态对不上`,
        ).toThrow()
      }
    }
    // 6 个 action × 6 个阶段 = 36 种组合，每种恰有一条合法边 ⇒ 30 条非法边。
    expect(checked, '非法组合数必须是 30 —— 减一条说明某条边被移出了合法集（本该有的转换没了）').toBe(30)
  })

  it('level-complete 是终态：任何 action 都抛错', () => {
    const complete = completeState()
    for (const { action } of actions) {
      expect(
        () => reduce(complete, action),
        `通关后派发 ${action.type} 必须抛错 —— 通关后战场已清空，继续操作会造出「通关了但还能改局面」的怪状态`,
      ).toThrow()
    }
  })

  it('非法 action 的错误消息写明「为什么错 → 会导致什么」', () => {
    // 错误消息是排查时唯一能指向调用方的东西。只写「非法 action」的话，
    // 看到的人不知道是组件派错了、还是存档里的阶段被改坏了。
    let message = ''
    try {
      reduce(atPhase('awaiting-answer'), placeTower(DECK[0].entryId, cellKey(ZOMBIE_ROW, 4)))
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    expect(message.includes('awaiting-answer'), '错误消息必须写明当前阶段 —— 不知道阶段就无法判断是谁派错了 action').toBe(true)
    expect(message.length, '错误消息不得为空 —— 空消息让排查只能靠加日志重跑一遍').toBeGreaterThan(10)
  })
})

describe('AC-13 —— 不变量断言', () => {
  /** 手搓一个坏 state：断言必须在**这些**形态上变红，否则它没在守。 */
  const corruptions: readonly { readonly name: string; readonly make: (base: State) => State }[] = [
    {
      name: '心数越界',
      make: (base) => ({ ...base, hearts: HEARTS + 1 }),
    },
    {
      name: '心数为负',
      make: (base) => ({ ...base, hearts: -1 }),
    },
    {
      name: '阳光为负',
      make: (base) => ({ ...base, sun: -1 }),
    },
    {
      name: 'grid 出现无主键（塔不在 grid 里）',
      make: (base) => ({ ...base, grid: { ...base.grid, '2,4': 'ghost-tower' } }),
    },
    {
      name: 'grid 键与塔的位置不一致',
      make: (base) => {
        const withTower = buildOneTower(base)
        return { ...withTower, grid: { ...withTower.grid, '2,6': withTower.towers[0].id } }
      },
    },
    {
      name: '塔不在 grid 索引里',
      make: (base) => {
        const withTower = buildOneTower(base)
        return { ...withTower, grid: {} }
      },
    },
    {
      name: '塔型非法',
      make: (base) => {
        const withTower = buildOneTower(base)
        const [first, ...rest] = withTower.towers
        // ⚠️ 必须 `as unknown as TowerType`：这正是「存档 / 内容 JSON 里的脏塔型」——
        //   它在真实数据里绕得过编译期检查（JSON 没有类型），所以断言必须能在
        //   这种**编译期构造不出来**的 state 上变红，否则守不住任何东西。
        const dirty = { ...first, towerType: 'laser' } as unknown as Tower
        return { ...withTower, towers: [dirty, ...rest] }
      },
    },
    {
      name: 'unlocked 含题单外的 entryId',
      make: (base) => ({ ...base, unlocked: [...base.unlocked, 'u1-not-in-deck'] }),
    },
    {
      name: 'mastered 含题单外的 entryId',
      make: (base) => ({ ...base, masteredEntryIds: ['u1-not-in-deck'] }),
    },
    {
      name: '僵尸血量越界',
      make: (base) => ({ ...base, zombies: [{ ...base.zombies[0], hp: ZOMBIE_HP + 1 }] }),
    },
    {
      // 📎 **1.19 CR**：改成 `{ ...phase, unlocked: [] }` 而不是重写整个 phase 字面量。
      //   理由与 `assertPhaseMirror` 那条新断言同款：**这两条要考的分别是
      //   「unlocked 镜像过期」与「sun 镜像过期」**。若顺手把 `question` 填错/填漏，
      //   `assertInvariants` 就会先被新断言拦下 —— `toThrow()` 照样绿，
      //   而它绿的原因是**另一条规则**，判据就此失去鉴别力
      //   （本仓库记过多次的「守卫红得指错了地方」）。
      name: 'awaiting-build 的 unlocked 镜像与 State 不一致',
      make: (base) => {
        const phase = buildPhaseOf(base)
        return { ...base, phase: { ...phase, unlocked: [] } }
      },
    },
    {
      name: 'awaiting-build 的 sun 镜像与 State 不一致',
      make: (base) => {
        const phase = buildPhaseOf(base)
        return { ...base, phase: { ...phase, sun: phase.sun + 1 } }
      },
    },
    {
      name: '回合号不是 >= 1 的整数',
      make: (base) => ({ ...base, turn: 0 }),
    },
  ]

  /** 一座合法塔的 state（用于「grid / 塔型」那几条变异）。入参已在 awaiting-build 且已答对一题。 */
  function buildOneTower(base: State): State {
    return reduce(base, placeTower(base.unlocked[0], cellKey(ZOMBIE_ROW, 4)))
  }

  it('合法 state 通过全部断言', () => {
    const states = [fresh(), atPhase('awaiting-build'), atPhase('round-over'), failedState(), completeState()]
    for (const state of states) {
      expect(() => assertInvariants(state), `这些 state 都是走正常路径跑出来的，必须通过断言 —— 否则断言本身写错了`).not.toThrow()
    }
  })

  for (const { name, make } of corruptions) {
    it(`拒绝：${name}`, () => {
      const base = atPhase('awaiting-build')
      const corrupted = make(base)
      expect(
        () => assertInvariants(corrupted),
        `assertInvariants 必须拒绝「${name}」—— 它放行意味着这个非法 state 能一路活到界面上，而界面上看不出任何异常`,
      ).toThrow()
    })
  }

  // 📎 **1.19 CR 新增：`awaiting-build` 题面那条断言的正反两面。**
  //   ⚠️ **反向自测不是形式**：上面那个矩阵里的每一条都是「必须抛」，
  //   而 `assertInvariants` 现在多了一条「题面必须在题单里」的断言 ——
  //   若它写得太宽（任何 awaiting-build 都抛），矩阵**全绿**，
  //   而「镜像一致就该放过」这条规则从此没人守（一条恒真的守卫守着恒真的规则）。
  it('G171 反向自测：题面属于题单时，`assertInvariants` 必须**放行**', () => {
    const base = atPhase('awaiting-build')
    const phase = buildPhaseOf(base)
    // 只重建一份「逐字等于 phase 上那份」的镜像 state —— 没有任何一处不一致。
    const intact: State = { ...base, phase: { ...phase, unlocked: [...phase.unlocked], sun: phase.sun } }

    expect(
      () => assertInvariants(intact),
      '题面属于本题单 + 两个镜像都与 State 一致 ⇒ 必须放行。它抛的话说明那条新断言写成了恒真',
    ).not.toThrow()
  })

  it('G171：题面不在题单里时必须抛（内容回滚 / 旧存档的形态）', () => {
    const base = atPhase('awaiting-build')
    const phase = buildPhaseOf(base)
    // ⚠️📎 **`[CR]` 第七轮更正注释与代码相矛盾的那一处**：
    //   首版注释逐字写着「把 **`wordId`** 改掉而 `entryId` 不动」，
    //   而代码改的恰恰是 **`entryId`**（`foreign` 那行）。
    //   ⚠️ 注释与代码相反 = 下一个人会照着注释去改 `wordId`，
    //     然后发现断言不红 —— 判据在**注释说的那个形态**上本来就绿。
    //   ⇒ 注释改成与代码一致：改的**就是** `entryId`，
    //     因为判据逐字是「`entryId` 在不在 `deck` 里」。
    const foreign: DeckEntry = { ...phase.question, entryId: 'u1-not-in-deck' }
    expect(
      foreign.entryId,
      '夹具前提：这道题必须**不在**题单里（改的正是 entryId）',
    ).not.toBe(phase.question.entryId)

    expect(
      () => assertInvariants({ ...base, phase: { ...phase, question: foreign } }),
      '题面不属于本题单 ⇒ 必须抛。放过它的话卡面会渲染一道答不对的题，而界面上看不出任何异常',
    ).toThrow(/不在本题单里/)
    // ⚠️📎 **`[CR]` 第七轮补消息判据**：首版是裸 `.toThrow()` ——
    //   它只说「抛了」，**不挑原因** ⇒ 任何别的错（镜像不一致、格子归属…）
    //   都满足它，而这条用例声称在守的是「题面 ∈ 题单」这一条。
    expect(
      () => assertInvariants({ ...base, phase: { ...phase, question: foreign } }),
      '抛的必须是「题面不在题单里」这一条 —— 抛别的错说明这条守卫在守别的东西',
    ).not.toThrow(/镜像|grid|格子/)
  })

  it('reduce 之后的不变量自动成立（断言挂在 reduce 出口）', () => {
    // AC-13 允许「测试里每次 reduce 后调用」或「内置于断言路径」。本实现选后者，
    // 因为它对**所有**调用路径都成立 —— 组件、模拟器、未来的 replay 工具都是。
    let state = fresh()
    for (let i = 0; i < 4; i += 1) {
      state = playRound(state, i % 2 === 0)
      if (state.phase.kind === 'round-over') {
        state = reduce(state, continueRound())
      }
      if (state.phase.kind === 'level-failed' || state.phase.kind === 'level-complete') {
        break
      }
    }
    expect(() => assertInvariants(state), '跑过多个回合后的 state 必须仍然满足全部不变量').not.toThrow()
  })

  it('僵尸恒在僵尸行（由类型保证：不变量列表不需要 row 断言）', () => {
    // AC-13 明写「场上僵尸仅存在于 ZOMBIE_ROW —— 由类型保证，Zombie 刻意没有 row」。
    // 本条守的是**那个类型决策还在**：一旦有人给 Zombie 加上 row 字段，这条编译失败。
    const state = fresh()
    expect(
      Object.keys(state.zombies[0]).sort(),
      'Zombie 不得有 row 字段 —— 「僵尸恒在僵尸行」靠类型里没有这个字段守住，不是靠运行时断言',
    ).toEqual(['col', 'hp', 'id', 'slowTurnsLeft'])
  })

  it('整个 state 可 JSON 序列化（决策 5）', () => {
    // 断点续学要序列化**整个** state。Map / Set / Date / 类实例会静默变成 {} 或 null，
    // 而恢复时只有「塔不见了」这一个症状，没有任何报错指向它。
    const { state } = runLevel({ deck: DECK, correctAt: () => true })
    const round = JSON.parse(JSON.stringify(state)) as State
    expect(round.towers.length, '序列化的 state 必须还原出全部塔 —— Map/Set 类型的字段会静默变成空对象').toBe(state.towers.length)
    expect(round.deck.length, '序列化的 state 必须还原出全部题目').toBe(state.deck.length)
    expect(round.zombies.length, '序列化的 state 必须还原出全部僵尸').toBe(state.zombies.length)
  })
})

describe('子任务 4.5 —— reduce 是纯函数', () => {
  it('不修改传入的 state（同串 action 重放出同一局）', () => {
    const start = atPhase('awaiting-build')
    const snapshot = JSON.stringify(start)
    const entry = currentQuestion(fresh())
    reduce(start, placeTower(entry.entryId, cellKey(ZOMBIE_ROW, 4)))

    expect(JSON.stringify(start), 'reduce 不得就地修改入参 —— 就地改会让「同一串 Action 重放出同一局」当场失效，存档回放与平衡模拟全部作废').toBe(snapshot)
  })

  it('ANSWER 这条路径同样不改入参（`[CR]` 2026-10-17 补）', () => {
    // ⚠️ 上一条只量了 `placeTower` **一条** action。而 `app/session-recorder.ts`
    //   的 `initialState` 取的是「第一条 action 之前」的快照，它之所以在
    //   `recordStep`（排在 `reduce` 之后）那一刻仍然正确，靠的就是这条性质。
    //   答对那道题走的正是 `applyAnswer` ⇒ `withBuildPhase`，
    //   **它把答题前的余额写进 `phase.sun` 那份只读镜像** ——
    //   一旦它就地改了入参，`initialState` 会静默带上被改过的内容，
    //   而会话回放的首帧与录制首帧不再一致（G100 的逐字相等随之失明）。
    //   ⇒ 这条守卫量的正是那条契约，不是「纯函数」的泛泛重复。
    const start = fresh()
    const snapshot = JSON.stringify(start)
    const next = reduce(start, answer(correctOptionId(currentQuestion(start))))

    expect(next.phase.kind, '前置：答对后必须落在 awaiting-build —— 那正是产出 phase.sun 镜像的相位').toBe('awaiting-build')
    expect(JSON.stringify(start), 'applyAnswer 不得就地修改入参 —— 它要写的是新 state，不是改旧的').toBe(snapshot)
  })

  it('一整串 action 跑完，每一步的入参都没被那条 reduce 就地改过（逐 dispatch 前后比对）', () => {
    const firstEntry = DECK[0].entryId
    const script: readonly ((s: State) => Action)[] = [
      (s) => answer(correctOptionId(currentQuestion(s))),
      () => placeTower(firstEntry, cellKey(ZOMBIE_ROW, 7)),
      () => endBuild(),
      () => resolveRound(),
      () => continueRound(),
    ]

    // 跨 `applyAnswer` / `applyBuild` / `applyResolve` / `applyContinue`
    // 四条分支逐个量：把**入参**在 reduce 前后各序列化一次并比对。
    // 比「只量某一条 action」强得多。
    const offenders: string[] = []
    let cursor = fresh()
    let steps = 0
    for (const step of script) {
      const before = JSON.stringify(cursor)
      const next = reduce(cursor, step(cursor))
      if (JSON.stringify(cursor) !== before) offenders.push(`第 ${steps + 1} 步`)
      cursor = next
      steps += 1
    }

    // 前置：本条必须真的跑满整串，否则「一条都没改」是空转。
    expect(steps, '脚本只跑了一半 —— 本条就退化成「没跑任何东西」的空断言').toBe(script.length)
    expect(
      offenders.join('、'),
      '这些 dispatch 就地改了入参 —— 会话录制的 initialState 会静默带上被改过的内容，' +
        '回放首帧与录制首帧不再一致（G100 的逐字相等随之失明）',
    ).toBe('')
  })

  it('同一串 Action 从同一个起点跑两次得到完全相同的结果', () => {
    const firstEntry = DECK[0].entryId
    const script: readonly ((s: State) => Action)[] = [
      (s) => answer(correctOptionId(currentQuestion(s))),
      () => placeTower(firstEntry, cellKey(ZOMBIE_ROW, 7)),
      () => endBuild(),
      () => resolveRound(),
      () => continueRound(),
      (s) => answer(wrongOptionId(currentQuestion(s))),
      () => endBuild(),
      () => resolveRound(),
    ]
    const run = (): State => script.reduce((s, step) => reduce(s, step(s)), fresh())
    expect(JSON.stringify(run()), '两次运行必须逐字节相同 —— reducer 里出现随机或时间依赖时本断言变红').toBe(JSON.stringify(run()))
  })

  it('不产生随机与时间依赖（源码里没有 Math.random / Date）', () => {
    // 平衡模拟要「同一策略跑出同一张门槛表」，存档回放要「同一串 action 还原同一局」。
    // 两者都要求 reduce 是纯函数，而随机/时间是纯函数最常见的两个破口。
    //
    // ⚠️ 这条**真的去读源码**（`[CR]` 2026-10-14）。此前它断言的是
    //   `typeof Math.random === 'function'` —— 那是关于 JS 运行时的事实，
    //   无论 reducer.ts 调不调用 `Math.random` 都恒为真；而紧邻的
    //   「两次运行必须逐字节相同」只能**概率上**抓到非确定性。
    //   结果是「reduce 是纯函数」这条约束**零覆盖**。
    const offenders: string[] = []
    for (const file of CORE_SOURCE_FILES) {
      const source = readFileSync(new URL(file, CORE_ROOT_URL), 'utf8')
      source.split('\n').forEach((line, index) => {
        // 注释与字符串里提到这些名字不算调用；只查真正的调用形态。
        const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '')
        if (/\bMath\.random\s*\(/.test(code) || /\bnew\s+Date\s*\(/.test(code) || /\bDate\.now\s*\(/.test(code)) {
          offenders.push(`${file}:${index + 1}  ${line.trim()}`)
        }
      })
    }
    expect(
      offenders.join('\n'),
      'core/ 里出现随机或时间依赖 —— 平衡模拟跑不出可复现的门槛表，存档回放也还原不出同一局',
    ).toBe('')
  })
})

describe('AC-8 —— 心与胜负的判定归属', () => {
  it('心未耗尽时不判失败（continue 之后仍能继续）', () => {
    const oneRound = playRound(fresh(), true)
    expect(oneRound.hearts, '首回合不该掉心 —— 僵尸第 1 回合只走到 col 6，离房子还有 3 回合').toBe(HEARTS)
    expect(oneRound.phase.kind, '未耗尽心数时不能判失败').toBe('round-over')
  })

  it('心耗尽判在 RESOLVE_ROUND 当刻，CONTINUE 不再重复判定', () => {
    const failed = failedState()
    expect(failed.hearts, '失败时心数必须是 0 —— 夹不到 0 会让 assertInvariants 的 hearts ∈ [0, HEARTS] 与失败判定互相矛盾').toBe(0)
    expect(
      () => reduce(failed, continueRound()),
      'CONTINUE 在 level-failed 阶段非法 —— 心耗尽已在 RESOLVE_ROUND 判过，再判一次就是第二个失败来源',
    ).toThrow()
  })

  it('通关与失败都要求「重打」走 RESTART_LEVEL，不靠 CONTINUE 推进', () => {
    expect(
      () => reduce(completeState(), continueRound()),
      '通关后 CONTINUE 非法 —— 通关是终态，推进会让「已通关」的 state 继续被改动',
    ).toThrow()
  })
})

describe('AC-1 —— 阶段字段的形状', () => {
  it('awaiting-answer 携带的题就是题单条目本身（引用相等）', () => {
    const state = fresh()
    expect(currentQuestion(state), 'phase.question 必须是题单条目本身而不是副本 —— 副本会让「这道题答对了吗」无从判定').toBe(DECK[0])
  })

  it('awaiting-build 携带的 unlocked / sun 与 State 恒等（镜像，唯一权威是 State）', () => {
    const answered = answerCurrent(fresh(), true)
    const built = reduce(answered, placeTower(currentQuestion(fresh()).entryId, cellKey(ZOMBIE_ROW, 4)))
    if (built.phase.kind !== 'awaiting-build') {
      throw new Error('期望仍在 awaiting-build')
    }
    expect(built.phase.unlocked, 'Phase 上的 unlocked 是 State 的只读镜像，必须恒等 —— 过期副本会让组件读到上一次的值').toEqual(built.unlocked)
    expect(built.phase.sun, 'Phase 上的 sun 是 State 的只读镜像，必须恒等').toBe(built.sun)
  })

  it('答题后镜像立刻反映新的阳光（不能是答题前的旧值）', () => {
    const answered = answerCurrent(fresh(), true)
    if (answered.phase.kind !== 'awaiting-build') {
      throw new Error('期望进入 awaiting-build')
    }
    expect(answered.phase.sun, '答题加的阳光必须立刻反映到 Phase 镜像上 —— 否则建造界面显示的还是答题前的余额').toBe(answered.sun)
  })

  it('resolving 阶段不携带战场副本（战斗动画靠前后快照，不靠 phase 里的副本）', () => {
    // phase 里再放一份战场就是第二个可写事实源，而 assertInvariants 只能守「两者相等」，
    // 守不住「哪份被改」。快照由 Story 1.14 的 effects-runner 从 State 的前后两份取。
    const resolving = atPhase('resolving')
    expect(
      Object.keys(resolving.phase).sort(),
      'resolving 不得携带战场副本 —— 快照是 effects-runner 的事，phase 里放副本等于第二事实源',
    ).toEqual(['kind'])
  })
})

describe('AC-15 —— state 是模拟器可直接驱动的形状', () => {
  it('整局可由 reduce 一路跑到底且无需组件参与（AR17 模拟跑真实实现）', () => {
    // balance-sim 必须 import 真实 core/ 而不是模型复刻（AC-15）。
    // 「无需组件参与」是它的前提：一旦某条规则只在组件里生效，模拟器就看不见它。
    const complete = completeState(makeSyntheticDeck(3))
    expect(complete.phase.kind, '三题题单全对后必须能跑到 level-complete').toBe('level-complete')
    expect(COLS > HOUSE_COL, '网格常量仍然自洽 —— 模拟器按常量建列，不写死格数').toBe(true)
  })
})

// 🔥📎 G178 —— 两个**带题面**的相位，题面都必须属于本题单（Story 1.19 `[CR]` 第六轮）
//
// ⚠️ **为什么单独成一条而不是并进建造期那条**：原判据只覆盖 `awaiting-build`，
//   而 `awaiting-answer` 是联合里**另一个携带 `Question` 的变体** ——
//   同型的损坏在它上面结构上完全可能，判据却纹丝不动（变异 N6 实测 0 红）。
describe('G178 —— 「题面 ∈ deck」对两个带题面的相位都成立', () => {
  /** 造一份题单只有 1 条、而题面指向一条**不在题单里**的 state。 */
  function orphanQuestionState(kind: 'awaiting-answer' | 'awaiting-build'): State {
    const deck = makeSyntheticDeck(1)
    const orphan = { ...deck[0], entryId: 'not-in-deck', wordId: 'not-in-deck' }
    const base = createInitialState({ unitNumber: 1, deck })
    const phase: State['phase'] =
      kind === 'awaiting-answer'
        ? { kind: 'awaiting-answer', question: orphan }
        : { kind: 'awaiting-build', question: orphan, unlocked: [], sun: base.sun }
    return { ...base, phase }
  }

  it('`awaiting-build` 携带题单外的题面 ⇒ 抛错', () => {
    expect(
      () => assertInvariants(orphanQuestionState('awaiting-build')),
      '建造期渲染一道题单外的题：`pickedRight` 恒 false，而界面上没有任何东西指向原因',
    ).toThrow(/不在本题单里/)
  })

  it('`awaiting-answer` 携带题单外的题面 ⇒ **同样**抛错（🔴 变异 N6 的落点）', () => {
    // ⚠️ **症状说明**：`nextQuestion` 永远不会重选一道不在题单里的题
    //   （它只在题单条目里筛），而孩子仍能点、能看到反馈条
    //   —— 于是被**卡在一道够不着的题**上，唯一出路是打输本局重开。
    expect(
      () => assertInvariants(orphanQuestionState('awaiting-answer')),
      '🔴 `awaiting-answer` 上的题面逃过了校验 —— 它是联合里另一个带 question 的变体，' +
        '同型的损坏在它上面结构上完全可能，而原判据只覆盖了 `awaiting-build`',
    ).toThrow(/不在本题单里/)
  })

  it('判据自测：两个变体用的是**同一条**判据，不是两条各写一遍的（R-53）', () => {
    // ⚠️ 这条不是测现状，是把「判据是共用的一条」钉住 ——
    //   若有人把 `awaiting-answer` 那支复制成第二份实现，两份会各自漂移。
    const buildMsg = (() => {
      try {
        assertInvariants(orphanQuestionState('awaiting-build'))
        return ''
      } catch (err) {
        return String(err)
      }
    })()
    const answerMsg = (() => {
      try {
        assertInvariants(orphanQuestionState('awaiting-answer'))
        return ''
      } catch (err) {
        return String(err)
      }
    })()
    expect(buildMsg, '建造期那一支居然没抛 —— 前置坏了').not.toBe('')
    expect(answerMsg, '答题期那一支居然没抛 —— 前置坏了').not.toBe('')
    expect(
      answerMsg.replace('awaiting-answer 携带', 'awaiting-build 携带'),
      '两个变体的报错只差相位名 ⇒ 判据是共用的一条；若差异更大，说明有人复制了实现',
    ).toBe(buildMsg)
  })

  it('正常对局两条路径都不受影响（题面来自题单 ⇒ 一路绿）', () => {
    const deck = makeSyntheticDeck(3)
    const fresh = createInitialState({ unitNumber: 1, deck })
    expect(() => assertInvariants(fresh), '开局态的前置坏了').not.toThrow()
    const phase = fresh.phase
    if (phase.kind !== 'awaiting-answer') throw new Error('夹具坏了')
    const hit = phase.question.card.options.find((o) => o.correct)
    if (hit === undefined) throw new Error('夹具坏了')
    expect(() => assertInvariants(reduce(fresh, answer(hit.id))), '答对后的建造期前置坏了').not.toThrow()
  })
})
