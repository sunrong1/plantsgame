/**
 * 三条回合层数值断言（Story 1.5 / AC-16；子任务 7.3）。
 *
 * ── 守什么 ────────────────────────────────────────────────────────────────
 * 断言 3 / 3b / 4 一起定义了**失败门槛曲线** —— GDD 与 `balance-scan.py` 里
 * 所有关于「孩子什么时候会输」的结论都建在它上面（AR23 / AR24）。
 * 这条曲线此前只存在于一份 Python 模拟器里，而那份模拟器有一个 `dict[col]`
 * 覆盖 bug：**每回合静默吞掉一只僵尸**（`zombies[8] = zombies.pop(8)` 把上一只
 * 覆盖掉），于是门槛「7 题」是错的。本文件用**真实 reducer** 重跑一遍，
 * 把门槛钉在 4 上。
 *
 * ── 为什么这么写（三条易踩的假绿）─────────────────────────────────────────
 * 1. **断言 4 必须写死作用域「前 10 回合内」**。后半程答错的僵尸在第 10 回合时
 *    还没走完路程，所以掉 0 心；若把它写成「直到本局自然结束都不掉心」，
 *    它会**假绿** —— 本文件用一条配套的反向断言（第 10 回合之后继续跑）把这件事
 *    钉死：真掉心的那一刻必须能被观测到。
 * 2. **断言 3 与 3b 只差一道题**。两条一起写才有判别力：只写断言 3 时，
 *    「掉了 3 心」这个结果既可能来自门槛是 4，也可能来自任何更大的数字。
 * 3. **每条断言都同时断言「结束回合数」**。门槛是「第几回合输」而不只是
 *    「输不输」—— 只断言 hearts 会让「晚一回合掉心」这类偏差（正是
 *    `hasPassedHouse` / `hasReachedHouse` 那一等号之差造成的）完全看不见。
 *
 * ⚠️ 期望值是 `[CS]` 2026-10-13 实测（见本 story Dev Notes「断言的实测真值」），
 * **不是手算**，也不是从 `balance-scan.py` 抄来的 —— 那份已被判定有 bug。
 */

import { describe, expect, it } from 'vitest'

import { HEARTS, createInitialState, endBuild, reduce, resolveRound } from '../../src/core'
import type { State } from '../../src/core'
import { makeSyntheticDeck } from '../fixtures/synthetic-deck.js'
import { answerCurrent, greedyBuildActions, runLevel } from '../fixtures/level-driver.js'

/** 断言 3/4 用的 10 题题单（entryId 带 `u1-` 前缀，守 AR29）。 */
const DECK = makeSyntheticDeck(10)

/** 断言 3 / 3b 的作用域：跑满 10 回合（与断言 4 同口径，两条才可比）。 */
const TEN_TURNS = 10

describe('AR23 —— 断言 3：开局连续答错 4 题 → 3 心耗尽 → 本局失败（AC-16）', () => {
  const run = runLevel({ deck: DECK, correctAt: () => false, maxTurns: TEN_TURNS })

  it('心耗尽并转入 level-failed', () => {
    expect(run.state.phase.kind, '开局连续答错必须判失败 —— 门槛失效时孩子输了也不知道为什么结束').toBe('level-failed')
    expect(run.state.hearts, '失败时心数必须是 0 —— 夹不到 0 会让 hearts ∈ [0, HEARTS] 与失败判定互相矛盾').toBe(0)
  })

  it('在第 6 回合结算时失败（不是第 4 回合，也不是第 10 回合）', () => {
    // ⚠️ 这一条才是「门槛是 4」的真正含义。第 1 只僵尸于回合 1 入场，
    //   走 ZOMBIE_SPAWN_COL / ZOMBIE_MOVE_PER_ROUND 回合抵达房子
    //   ⇒ 第 4 回合掉第 1 心、第 5 回合第 2 心、第 6 回合第 3 心 ⇒ 失败。
    expect(
      run.turnsPlayed,
      '失败必须发生在第 6 回合 —— 每只僵尸比入场回合晚 3 回合抵达（轨迹 8→6→4→2→0），第 4/5/6 回合各掉 1 心',
    ).toBe(6)
  })

  it('逐回合轨迹：掉心分别落在第 4、5、6 回合', () => {
    // ⚠️ 逐回合锁死「哪一回合掉哪一颗」。丢掉它的话，把丢心判据从
    //   hasReachedHouse 换成 hasPassedHouse（差一个等号）会让整条曲线
    //   整体后移一回合，而「总掉 3 心」这个总数**不变** —— 只断言总数守不住。
    const lost = run.log.filter((row) => row.heartsLost > 0).map((row) => row.turn)
    expect(lost, '掉心的回合必须恰为 4、5、6 —— 错位意味着丢心判据用错了口径或推进步数变了').toEqual([4, 5, 6])
    expect(
      run.log.every((row, i) => i < 3 || row.heartsLost === 1),
      '每回合只掉 1 心 —— 同回合掉 2 心会让门槛虚高一倍，而「僵尸按入场顺序逐只抵达」正是本层的设计',
    ).toBe(true)
  })

  it('全程一栋塔都没有（门槛的前提是「开局答错 ⇒ 没有塔 ⇒ 无人阻拦」）', () => {
    // 若「答错也给塔卡」这条被改掉，本断言会立刻变红 —— 门槛之所以是
    // 「开局连错几题」，正是因为答错既没钱也没卡。
    expect(run.log.every((row) => row.towers === 0), '答错不得解锁塔卡 —— 有塔就拦得住僵尸，门槛会整个消失').toBe(true)
  })
})

describe('AR23 边界 —— 断言 3b：开局连错 3 题 → 掉 2 心，仍未失败（AC-16）', () => {
  const run = runLevel({ deck: DECK, correctAt: (turn) => turn > 3, maxTurns: TEN_TURNS })

  it('掉 2 心，剩 1 心，未失败', () => {
    expect(run.state.phase.kind, '连错 3 题不得失败 —— 它是门槛的另一侧边界：门槛是 4 而不是 3 或 5').not.toBe('level-failed')
    expect(run.state.hearts, '连错 3 题应掉 2 心（剩 1 心）—— 与断言 3 的「掉 3 心」构成门槛两侧').toBe(HEARTS - 2)
  })

  it('跑满 10 回合仍未失败', () => {
    expect(run.turnsPlayed, '连错 3 题必须能跑满 10 回合 —— 提前结束说明门槛比设计更严，孩子没有第二次机会').toBe(TEN_TURNS)
  })

  it('与断言 3 只差一道题：门槛恰好夹在 3 与 4 之间', () => {
    // ⚠️ 判别力所在。两条断言单独看都只是「某个数字」，放在一起才证明
    //   「门槛 = 4」而不是「门槛 ≤ 4」或「门槛 ≥ 4」。
    const three = runLevel({ deck: DECK, correctAt: (turn) => turn > 3, maxTurns: TEN_TURNS })
    const four = runLevel({ deck: DECK, correctAt: (turn) => turn > 4, maxTurns: TEN_TURNS })
    expect(three.state.phase.kind, '连错 3 题必须通关').not.toBe('level-failed')
    expect(four.state.phase.kind, '连错 4 题必须失败 —— 这就是「开局连续答错 4 题」的门槛定义').toBe('level-failed')
  })
})

describe('AR24 —— 断言 4：答错 7 题但错在后半程 → 掉 0 心（AC-16）', () => {
  const run = runLevel({ deck: DECK, correctAt: (turn) => turn <= 3, maxTurns: TEN_TURNS })

  it('前 10 回合内一颗心都没掉', () => {
    expect(run.state.hearts, '后半程答错在前 10 回合内不掉心 —— 这条断言证明门槛由「开局」而不是「累计答错数」决定').toBe(HEARTS)
    expect(
      run.log.every((row) => row.heartsLost === 0),
      '逐回合都不掉心 —— 只断言总数会让「第 4 回合掉 1 心、第 6 回合掉回来」这类抵消骗过断言',
    ).toBe(true)
  })

  it('⚠️ 防假绿：同一答题模式一旦不建塔，后半程的僵尸照样把心掉光', () => {
    // 本条是断言 4 的**配套反证**。断言 4 的「掉 0 心」有两个可能的原因：
    //   (a) 后半程入场��僵尸还没走完路程；
    //   (b) 前半程建下的塔把后续僵尸全部打死了。
    // 只断言「0 心」区分不了 (a) 与 (b) —— 而两者的设计含义完全不同。
    // 把它与「不建塔」的同模式对照跑一遍，才能说明答案 4 的 0 心是**塔的功劳**。
    // （[DS] 2026-10-13 实测：确实是 (b)。塔在 col 1/2/3，僵尸于入场后第 2 回合
    //   进入 col 4，三座塔同回合合计 135 伤害 > 100 血，当场毙命。）
    const withoutTowers = runLevel({ deck: DECK, correctAt: (turn) => turn <= 3, build: false })
    expect(
      withoutTowers.log.some((row) => row.heartsLost > 0),
      '关掉建塔后同一答题模式必须掉心 —— 若仍然 0 心，说明「不掉心」与建塔无关，断言 4 的解释就站不住',
    ).toBe(true)
  })

  it('前半程答对 ⇒ 建下的塔确实在场上（断言 4 的机制前提）', () => {
    expect(run.log[0].towers, '第一回合答对就该建塔 —— 没有塔的话断言 4 的「不掉心」就与前半程无关').toBeGreaterThan(0)
  })
})

describe('FR82 —— 断言 8：塔跨回合持久（AC-16）', () => {
  /** 造一个有塔的 awaiting-build state（建满一排，够观察持久性）。 */
  function withTowers(): State {
    const answered = answerCurrent(createInitialState({ unitNumber: 1, deck: DECK }), true)
    return greedyBuildActions(answered).reduce((s, action) => reduce(s, action), answered)
  }

  it('跑完一次 resolving 后已建塔仍在场，长度不变', () => {
    const built = withTowers()
    expect(built.towers.length, '前提：本轮确实建了塔 —— 没有塔就谈不上「持久」').toBeGreaterThan(0)

    const resolved = reduce(reduce(built, endBuild()), resolveRound())
    expect(resolved.towers.length, '结算不得清空已建塔 —— 每回合清空会让「塔是持久资产」失效，递增阳光也就不再影响难度').toBe(built.towers.length)
  })

  it('结算后每座塔的 id / 位置 / 塔型逐字不变（不是「数量相同」而已）', () => {
    // ⚠️ 判别力：只断言 length 时，「清空后重新建同样多座」也能通过。
    const built = withTowers()
    const resolved = reduce(reduce(built, endBuild()), resolveRound())
    expect(
      resolved.towers,
      '塔必须逐字不变（同一批对象）—— 若结算重建了塔，id 或位置会变，孩子会看到塔自己跳了一格',
    ).toEqual(built.towers)
  })

  it('塔跨多个回合持续累积（不是一个回合的例外）', () => {
    // 断言 8 的第二条腿：每回合都新建塔，且**旧塔一直在**。
    const run = runLevel({ deck: DECK, correctAt: () => true, maxTurns: 5 })
    expect(run.log[4].towers, '第 5 回合结束时塔数必须不小于第 1 回合 —— 只增不减说明没有清空').toBeGreaterThan(run.log[0].towers)
  })

  it('建起三座塔之后本单元的数值下再也无法失败（门槛完全由开局决定）', () => {
    // ⚠️ 这不是 bug，是 GDD 那条「失败门槛偏高是有意接受的取舍」的直接后果
    //   （`gdd.md` 失败门槛段：「接受几乎只有完全听不懂才会输」）。
    //   本条把它作为**事实**钉住：它同时是断言 3 的解释 ——
    //   「开局连错 4 题会输」之所以成立，正因为开局是唯一还没建塔的时段。
    //   改动塔的射程/伤害/造价时本条会变红，那正是应该被看见的信号。
    const run = runLevel({ deck: DECK, correctAt: (turn) => turn <= 3 })
    expect(run.state.towers.length, '前半程三题全对应建起三座塔 —— 本条的结论完全依赖这个数量').toBe(3)
    expect(
      run.log.every((row) => row.heartsLost === 0),
      '三座塔在场时本单元数值下一颗心都不掉 —— 若开始掉心，说明射程/伤害被调动了，GDD 的「失败罕见」取舍需要重新确认',
    ).toBe(true)
    expect(run.state.phase.kind, '该局应当一路走到底 —— 只要塔还在场就不可能失败').not.toBe('level-failed')
  })
})
