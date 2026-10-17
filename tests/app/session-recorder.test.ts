/**
 * 会话录制器的**行为守卫**（Story 1.17 / AC-B1、AC-B5，G97 / G98 / G101）。
 *
 * ── 这个文件守什么 ────────────────────────────────────────────────────────
 * 三条判据，各自对应本 story 最容易写错的一处：
 *   1. **`initialState` 是第一条 action 的 `prev`**，不是 `createInitialState()` 的重算（AC-B1① / G97）。
 *      两者在**开局第一步**上恰好相等 ⇒ 只有走到第二步以后才分得开。
 *   2. **`actions` 的顺序就是 dispatch 顺序**，一条不漏一条不多（AC-B1② / G98）。
 *   3. **重打要重置会话**（AC-B5 / G101）—— 否则导出的 JSON 里挂着上一局的 `initialState`，
 *      而回放会从一个孩子从没见过的局面开始。
 *
 * ── 判据纪律 ──────────────────────────────────────────────────────────────
 * · **走真的 `applyAction` 链路**，不直接调 `recordStep`：
 *   判据只钉在纯函数上时，「谁调了它、调了没有」会整个漏掉 ——
 *   `docs/rules/architecture.md` 的 R-06 段逐字记着这个形态的两次实测。
 * · **`store` 是模块级单例**，`beforeEach` 复位 `state` + 会话（与 `store-save.test.ts` 同款）。
 * · 本文件不做源码变异，变异走 M127 / M128。
 */

import { beforeEach, describe, expect, it } from 'vitest'

import {
  applyAction,
  backToStart,
  enterLevel,
  exportSession,
  isRecording,
  progress,
  recordStep,
  resetSession,
  restartLevel,
  selectTowerCard,
  startRound,
  state,
} from '../../src/app/store'
import { answer, createInitialState } from '../../src/core'
import type { Action, State } from '../../src/core'
import { writeSave } from '../../src/services/save'
import { afterEachUninstall, installFakeStorage } from '../fixtures/fake-storage'
import { correctOptionId, makeSyntheticDeck } from '../fixtures/synthetic-deck'

// ── 夹具 ───────────────────────────────────────────────────────────────────

/**
 * 合成题单 —— 本文件验的是接线，题单内容无关紧要。
 *
 * ⚠️ **25 题是为了走得到 `level-failed`**：答对全部题目会先触发 `level-complete`，
 *   而「重打」那个门面只在失败相位才动 —— 题单太短的话这一组用例永远走不到。
 */
const DECK = makeSyntheticDeck(25, 1)

/** 当前正在问的那道题（非答题相位抛错 —— 测试写错步骤要立刻炸）。 */
function currentQuestion(current: State = state.value) {
  if (current.phase.kind !== 'awaiting-answer') {
    throw new Error(`当前阶段是 ${current.phase.kind}，没有正在问的题`)
  }
  return current.phase.question
}

/** 当前正在问的那道题的 `entryId`。 */
function currentEntryId(current: State = state.value): string {
  return currentQuestion(current).entryId
}

/** 正确答掉当前那道题 —— 返回产出的 action，便于逐字比对。 */
function answerCorrectly(): Action {
  const action = answer(correctOptionId(currentQuestion()))
  applyAction(action)
  return action
}

/**
 * 走到 `level-failed`（心数归零）—— 不建塔，让僵尸一路走到房子。
 *
 * ⚠️ **不建塔是刻意的**：建了塔就可能打赢，而「重打」门面只在失败相位生效，
 *   题单再长也保证不了那一刻 ⇒ 让它**必然失败**。
 */
function driveToFailure(): void {
  for (let i = 0; i < 40 && state.value.phase.kind !== 'level-failed'; i += 1) {
    if (state.value.phase.kind !== 'awaiting-answer') break
    answerCorrectly()
    startRound()
  }
}

beforeEach(() => {
  // ⚠️ **必须装 fake storage**：不装的话 `writeSave` 会因 `localStorage` 不存在而
  //   静默降级（记一条 `[save]` WARN），于是每条用例都在跑「写盘失败」那条路 ——
  //   而本文件要验的与会话录制无关。与 `store-save.test.ts` 同一理由（R-37）。
  installFakeStorage()
  // ⚠️ **`store` 是模块级单例**（`state` / `progress` / 会话录制三样都是），
  //   所以每个用例都要自己复位 —— 否则上一个用例把相位推进到 `awaiting-build`，
  //   下一个用例的「当前那道题」就取不到了。与 `store-save.test.ts` 同款处置。
  state.value = createInitialState({ unitNumber: 1, deck: DECK })
  resetSession()
})

afterEachUninstall()

// ── G97 / G98 ──────────────────────────────────────────────────────────────

describe('会话录制（Story 1.17 / G97 / G98）', () => {
  it('G97：`initialState` 是第一条 action 之前的那个 state，不是开局重算', () => {
    const openingTurn = state.value.turn
    answerCorrectly()
    // 再走一步，让 `initialState` 与「重算出来的开局」彻底分开。
    startRound()
    answerCorrectly()

    const session = exportSession()

    expect(session.actions.length).toBeGreaterThanOrEqual(3)
    // 开局那份：还没 dispatch 过任何 action。
    expect(session.initialState.turn).toBe(openingTurn)
    // 🔥 关键断言：若实现改成调 `createInitialState()` 重算，它与快照**在开局时相等**
    //   ⇒ 必须让局面先前进到 `turn > 1`，两者才会分道扬镳（M127 专打这一条）。
    expect(state.value.turn).toBeGreaterThan(session.initialState.turn)
  })

  it('G97：`initialState` 是**逐字**那份开局 state，不是它的一份拷贝', () => {
    const opening = state.value
    const openingText = JSON.stringify(opening)

    answerCorrectly()

    // 「导出自足」的正面证据：导出的起点不带任何外部引用，
    // 整局的题单都在 `deck` 里（`State` 的既有性质）。
    expect(exportSession().initialState.deck.length).toBe(DECK.length)
    expect(JSON.stringify(exportSession().initialState)).toBe(openingText)
  })

  it('G97（补）：断点续学后的会话起点是**读档回来的那份**，不是重算的开局（M127 专打）', () => {
    // 🔥 **这条是 M127 变异逼出来的**（首版 G97 只从新开局起量）。
    // 为什么那条量不出来：会话从**新开局**开始时，第一条 action 的 `prev`
    // 与 `createInitialState({unitNumber, deck})` **逐字相等** ⇒
    // 把 `initialState` 改成重算，在那条路径上**构造上不可区分**（等价变异）。
    // 而 FR60 的真实场景是**断点续学**：`enterLevel()` 读档替换 `state.value`
    // 且**不 dispatch**（⇒ 会话还没开始录），于是第一条 action 的 `prev`
    // 是**玩到一半的局面** —— 这才是「起点被换成假起点」真正会露出来的地方。
    answerCorrectly()
    startRound()
    answerCorrectly()
    const savedTurn = state.value.turn
    const savedMastered = state.value.masteredEntryIds.length
    expect(savedTurn, '前置：存档那份应当不在第 1 回合').toBeGreaterThan(1)
    expect(savedMastered, '前置：存档那份应当答对过题').toBeGreaterThan(0)
    writeSave(progress.value, state.value)

    // 模拟「关掉页面再打开」：内存换成新开局、会话清空。
    resetSession()
    state.value = createInitialState({ unitNumber: 1, deck: DECK })
    enterLevel()
    expect(state.value.turn, '前置：应当读档成功').toBe(savedTurn)

    // ⚠️ 存档点是 `awaiting-build`（1.15 写盘表）⇒ 读档回来**没有正在问的题**，
    //   所以第一条 action 用 `startRound()`（它链发 END_BUILD 等真 action）。
    startRound()

    const session = exportSession()
    expect(
      session.initialState.turn,
      '起点被换成了重算出来的开局 —— 回放会从孩子**没玩到过**的盘面开始播',
    ).toBe(savedTurn)
    expect(session.initialState.masteredEntryIds.length).toBe(savedMastered)
  })

  it('G98：`actions` 的顺序就是 dispatch 顺序，一条不漏一条不多', () => {
    // ⚠️ 两个选项 id 必须**在 dispatch 之前**取好：`answerCorrectly()` 之后相位
    //   已经是 `awaiting-build`，那时候再问「当前那道题」会抛。
    const first = correctOptionId(currentQuestion())
    applyAction(answer(first))
    startRound()
    const second = correctOptionId(currentQuestion())
    applyAction(answer(second))

    const actions = exportSession().actions

    // ⚠️ **类型序列逐字比对**（而不是只断言长度）：只断言长度的话，
    //   一条 action 被**换掉**（而非漏掉）照样绿 ——
    //   而那正是回放会「复现出另一局」的形态。
    expect(actions.map((a) => a.type)).toEqual([
      'ANSWER',
      'END_BUILD',
      'RESOLVE_ROUND',
      'CONTINUE',
      'ANSWER',
    ])
    // 再逐字钉住两条 `ANSWER` 的载荷 —— 类型相同不等于内容相同。
    expect(actions[0]).toEqual(answer(first))
    expect(actions[4]).toEqual(answer(second))
  })

  it('G98：没录过时 `exportSession()` 抛错，`isRecording()` 为假', () => {
    // ⚠️ **不交出「拿当前 state 当起点」的降级结果**：起点必须来自第一条 action
    //   之前的快照，编造一个会让回放从一个孩子从没见过的局面开始 —— 那不叫复现。
    //   面板据此禁用「导出会话」按钮（见 `DebugPanel.vue` 的 `:disabled="!isRecording()"`）。
    expect(isRecording()).toBe(false)
    expect(() => exportSession()).toThrow(/一条 action 都没 dispatch 过/)
  })

  it('G98：不 dispatch 的门面（进关 / 回开始）不产生任何 action', () => {
    enterLevel()
    backToStart()

    expect(isRecording()).toBe(false)
  })

  // ⚠️📎 `[CR]` 2026-10-17 补的缺口：**跨局不复位**。
  //   上面那条在修复前后都绿 —— 它断言的是「没录过就别装录过」，
  //   而真正的 bug 是**录过之后换了一局却没清**。
  //   原实现里 `resetSession()` 只挂在 `restartLevel()` 与 `jumpToTurn()` 上，
  //   于是「通关 → 返回开始 → 再进关」这条路径上 `restoreNextUnit` 已经把
  //   `state.value` 换成一份**全新**的 state，`recordStep` 却因
  //   `initialState !== null` **沿用上一局的开局**当起点。
  it('[CR 2026-10-17] 通关 → 返回开始 → 再进关：录制必须从新一局起算', () => {
    // ⚠️ **必须换一份 3 题的题单**：本文件默认的 25 题题单在「不建塔」下会先
    //   心耗尽（实测走到 `level-failed`），永远走不到 `level-complete`，
    //   而本用例要的正是**通关**那条路径（通关才把 `currentGame` 存成 `null`，
    //   再进关时才会走 `restoreNextUnit` 换一份全新的 state）。
    state.value = createInitialState({ unitNumber: 1, deck: makeSyntheticDeck(3, 1) })
    resetSession()

    // ① 打完整局，录到东西
    for (let i = 0; i < 10 && state.value.phase.kind !== 'level-complete'; i += 1) {
      if (state.value.phase.kind !== 'awaiting-answer') break
      answerCorrectly()
      startRound()
    }
    expect(state.value.phase.kind, '前置：本用例要走通关路径').toBe('level-complete')
    expect(isRecording(), '前置：第一局已经录到了 action').toBe(true)

    // ② 回开始，再进关 —— `restoreNextUnit` 会换掉 `state.value`
    backToStart()
    enterLevel()

    expect(
      isRecording(),
      '换了一局却没清录制 —— 新一局的 action 会接在上一局的起点后面，' +
        '导出的 JSON 喂回 replaySession 必在第一条 action 上抛（那个函数按契约不接住）',
    ).toBe(false)
  })

  it('[CR 2026-10-17] 断点续学：回到战场后，录制从**恢复后**那份 state 起算', () => {
    // ⚠️ 与上一条**互为另一端**：上一条管「换局」，这一条管「同一局的续学」。
    //   断点续学后从恢复那份 state 起算才对 —— 复现要求是**孩子接下来真按的那一下**，
    //   而不是把关闭页面前的输入也算进来。
    answerCorrectly()
    startRound()
    const resumeTurn = state.value.turn
    writeSave({ currentUnitIndex: 0, masteredWordIds: [] }, state.value)
    expect(isRecording(), '前置：玩过，录制器是活的').toBe(true)

    backToStart()
    enterLevel()

    // ⚠️ 刚回来时**一条 action 都还没按**，此时 `exportSession()` 本就该抛
    //   （起点必须是第一条 action 之前的快照）⇒ 先按一下再量。
    expect(() => exportSession(), '刚回来还没按任何键，导出本就应当抛').toThrow()

    answerCorrectly()

    const resumed = exportSession()
    expect(
      resumed.initialState.turn,
      '续学后录制的起点是「恢复后那份 state」而不是「关闭页面前那一局的开局」—— ' +
        '起点错配会让导出的 JSON 回放出另一局',
    ).toBeGreaterThanOrEqual(resumeTurn)
    expect(
      resumed.initialState.turn,
      '前置：它不该还是第 1 回合（那就是没读档）',
    ).toBeGreaterThan(1)
  })

  it('AC-B1③：`next` 收下但当前不参与导出 —— 判据落在导出形状上', () => {
    // 手动喂一条：`next` 与 `prev` 刻意不同（`END_BUILD` 的载荷为空 ⇒ 逐字相等，
    // 所以用 `RESTART_LEVEL` 之外的一条**载荷非空**的：`PLACE_TOWER`）。
    const prev = state.value
    applyAction(answer(correctOptionId(currentQuestion())))

    const manual: Action = { type: 'END_BUILD' }
    recordStep(manual, prev, state.value)

    const actions = exportSession().actions
    expect(actions).toHaveLength(2)
    // ⚠️ 若实现哪天把 `next` 也编进导出，这里会多出内容而红 ——
    //   那正是「`next` 当前不参与导出」这条 AC 的全部含义。
    expect(JSON.stringify(actions[1])).toBe(JSON.stringify(manual))
  })

  it('`isRecording()` 在有任何 dispatch 后为真', () => {
    answerCorrectly()

    expect(isRecording()).toBe(true)
  })
})

// ── G101 ───────────────────────────────────────────────────────────────────

describe('会话重置（Story 1.17 / G101 / AC-B5）', () => {
  it('G101：`RESTART_LEVEL` 之后会话回到「没录过」，`initialState` 是新一局', () => {
    driveToFailure()
    expect(state.value.phase.kind).toBe('level-failed')
    expect(isRecording()).toBe(true)

    restartLevel()

    // 重打是**新一局** ⇒ 会话起点必须跟着换，否则导出的 JSON 会从
    // 那个孩子刚失败的局面开始播。
    expect(state.value.turn).toBe(1)
    expect(isRecording()).toBe(false)

    // 🔥 再答一题：新的 `initialState` 必须带 turn 1 与 `awaiting-answer`，
    //   而不是上一局那个 `level-failed` 的快照。
    answerCorrectly()
    const session = exportSession()
    expect(session.initialState.turn).toBe(1)
    expect(session.initialState.phase.kind).toBe('awaiting-answer')
    expect(session.actions).toHaveLength(1)
  })

  it('G101：`RESTART_LEVEL` 本身不进新会话的 action 序列', () => {
    driveToFailure()
    restartLevel()
    answerCorrectly()

    const types = exportSession().actions.map((a) => a.type)
    // ⚠️ 复位必须排在 `applyAction` **之后**（见 `store.restartLevel` 的注释）：
    //   先复位再 dispatch 会把这一条 `RESTART_LEVEL` 也录进新一局 ——
    //   它属于上一局，而回放会拿它去跑一个刚刚重置过的起点。
    expect(types).not.toContain('RESTART_LEVEL')
    expect(types).toEqual(['ANSWER'])
  })

  it('`resetSession()` 把会话清回「没录过」', () => {
    answerCorrectly()
    startRound()
    answerCorrectly()
    expect(isRecording()).toBe(true)

    resetSession()

    expect(isRecording()).toBe(false)
    expect(() => exportSession()).toThrow()
  })

  it('[CR 2026-10-17] 已经交出去的会话不被后续 `resetSession()` 清空', () => {
    answerCorrectly()
    startRound()
    answerCorrectly()

    // ⚠️ 这条在修复前**恒绿**：上面那条「`resetSession()` 把会话清回没录过」
    //   只断言 `exportSession()` 这个**函数调用**会抛，完全没管
    //   「先前已经拿到的那份对象会怎样」。实测那份对象会从 12 条变成 0 条 ——
    //   `resetSession` 执行的是 `recording.actions.length = 0`，就地清空同一个数组。
    const exported = exportSession()
    const lenAtExport = exported.actions.length
    expect(lenAtExport, '前置：必须真的录到了 action').toBeGreaterThan(0)

    resetSession()

    expect(
      exported.actions.length,
      '已导出的会话被后续 reset 清空 —— 家长交出去的「可复现现场」在别人手上变成空的，' +
        '而把它喂 replaySession 不抛错，直接返回 initialState（一个孩子从没玩到过的局面）',
    ).toBe(lenAtExport)
  })

  it('选中 / 取消选中不产生 action（它不是 dispatch）', () => {
    const entryId = currentEntryId()
    selectTowerCard(entryId)
    selectTowerCard(entryId)

    expect(isRecording()).toBe(false)
  })
})
