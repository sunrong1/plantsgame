/**
 * 「跳到任意回合」（Story 1.17 / Task 7.1、AR40、裁决 7）。
 *
 * ── 这个文件守什么 ────────────────────────────────────────────────────────
 * AR40 逐字要「无需重打 10 回合即可到达指定回合」，而 `deferred-work.md`
 * （Story 1.15 第 4 条）逐字警告：**任何新增的「回到战场」路径若不经过
 * `enterLevel()`，就读不到存档**。
 * ⚠️ 而 G86 只管「谁调 `readSave`」，**管不到「每条进关路径都调了」** ——
 *   1.16 的偏离表第 2 条已经把这个缺口登记过一次。
 * ⇒ 新守卫 **G118**：跳回合的门面必须经 `enterLevel()`，且**不得**直接
 *   `state.value = …`。
 *
 * ── 判据分两层，两层都必要 ────────────────────────────────────────────────
 * · **源码层**：`jumpToTurn` 的函数体里有没有 `enterLevel(`、有没有 `state.value =`。
 *   源码判据本身要能失明（见下面那条反向自测）。
 * · **行为层**：
 *   ① 「读到了存档」—— 跳之前把内存换成一份 `masteredEntryIds` 为空的**新局**，
 *      跳之后若那份为空就说明**根本没读档**；
 *   ② 「走的是真 action」—— `SAVE` 只有 `applyAction` 的第 3 步会写，
 *      所以「盘上的回合号跟着跳到了」这件事，`state.value = …` 伪造不出来。
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { beforeEach, describe, expect, it } from 'vitest'

import {
  applyAction,
  devSetInfiniteHearts,
  isRecording,
  jumpToTurn,
  progress,
  resetSession,
  startRound,
  state,
  view,
} from '../../src/app/store'
import { answer, createInitialState, isCorrect } from '../../src/core'
import { readSave, writeSave } from '../../src/services/save'

import { afterEachUninstall, installFakeStorage } from '../fixtures/fake-storage'
import { exportedFunctionBody } from '../fixtures/exported-function-body'
import { stripComments } from '../fixtures/strip-comments'
import { makeSyntheticDeck } from '../fixtures/synthetic-deck'

const root = process.cwd()
const DECK = makeSyntheticDeck(25, 1)

beforeEach(() => {
  installFakeStorage()
  devSetInfiniteHearts(false)
  resetSession()
  state.value = createInitialState({ unitNumber: 1, deck: DECK })
  progress.value = { currentUnitIndex: 0, masteredWordIds: [] }
  view.value = 'start'
})

afterEachUninstall()

/** 把当前这道题答对（判据用 core 的 `isCorrect`，不在这里重写一遍）。 */
function answerCurrentCorrectly(): void {
  if (state.value.phase.kind !== 'awaiting-answer') return
  const { card } = state.value.phase.question
  const option = card.options.find((candidate) => isCorrect(card, candidate.id))
  if (option === undefined) throw new Error('这道题没有正确项 —— 夹具失效')
  applyAction(answer(option.id))
}

/** 用门面把对局推进 `count` 个回合（真 action，一个回合 = 答题 + 开战）。 */
function advanceRounds(count: number): void {
  for (let i = 0; i < count; i += 1) {
    answerCurrentCorrectly()
    startRound()
  }
}

// ── G118 —— 跳回合必须先进关（读得到存档），且不直接改 state ────────────────

describe('G118 —— 「跳到任意回合」必须经 `enterLevel()`（Story 1.17 / 裁决 7）', () => {
  it('G118：门面体内有 `enterLevel(`，且没有 `state.value = …`', () => {
    const source = stripComments(readFileSync(join(root, 'src/app/store.ts'), 'utf8'))
    // ⚠️📎 `[CR]` 2026-10-17 改用共享 fixture：本条第一版的切法是对的
    //   （切到下一个顶层 export 为止），而同一 story 的 G112 第一版切到文件末尾
    //   ⇒ 同一个形状的问题在两个文件里得出两种做法。两份会各自漂移（R-37），
    //   现在统一到 `tests/fixtures/exported-function-body.ts`。
    const body = exportedFunctionBody(source, 'export function jumpToTurn')

    expect(body, '跳回合没经过 enterLevel() ⇒ 读不到存档（deferred-work 1.15 第 4 条）').toMatch(
      /enterLevel\(/,
    )
    expect(body, '跳回合直接写 state.value ⇒ 绕开 applyAction 四步，写盘与副作用全丢').not.toMatch(
      /state\.value\s*=/,
    )
  })

  it('反向自测：一份「绕开 enterLevel 直接改 state」的探针会被判为违规', () => {
    const legal = 'if (view.value !== "level") enterLevel()\nwhile (state.value.turn < n) startRound()\n'
    const illegal = 'state.value = buildState(turn)\n'
    expect(legal.includes('enterLevel(') && !/state\.value\s*=/.test(legal)).toBe(true)
    expect(illegal.includes('enterLevel(') || /state\.value\s*=/.test(illegal)).toBe(true)
  })

  it('从开始界面跳回合 ⇒ 先进关（读到存档那份对局），再往后跳', () => {
    // ① 先造一份「玩到第 4 回合、答对过一道题」的存档。
    devSetInfiniteHearts(true)
    advanceRounds(3)
    expect(state.value.turn, '前置：应当已经在第 4 回合').toBe(4)
    expect(state.value.masteredEntryIds.length, '前置：答对过题').toBeGreaterThan(0)
    writeSave(progress.value, state.value)

    // ② 把内存换成一份**全新的**开局，并回到开始界面。
    devSetInfiniteHearts(false)
    resetSession()
    state.value = createInitialState({ unitNumber: 1, deck: DECK })
    view.value = 'start'

    // ③ 跳到第 6 回合。
    const result = jumpToTurn(6)

    expect(view.value, '跳回合没有进关 —— 它绕开了 enterLevel()').toBe('level')
    expect(state.value.turn).toBe(6)
    expect(
      state.value.masteredEntryIds.length,
      '跳完之后是一份全新的空开局 —— 说明存档根本没被读（G86 只管「谁调」，管不到「每条路径都调」）',
    ).toBeGreaterThan(0)
    expect(result.reachedTurn).toBe(6)
    expect(result.stoppedBy).toBe('reached')
  })

  it('跳回合走的是真 action ⇒ 盘上跟着写了（`state.value = …` 伪造不出这个）', () => {
    // ⚠️ **前置：盘上此刻一份存档都没有**。这一条守的是「跳回合经了
    //   `applyAction` 的第 3 步（副作用 → 写盘）」—— 直接 `state.value = …`
    //   造出来的局面在盘上不会留下任何痕迹。
    expect(readSave(), '前置：这一例开始时盘上应当是空的').toBeNull()

    devSetInfiniteHearts(true)
    jumpToTurn(4)

    expect(state.value.turn).toBe(4)
    const saved = readSave()
    expect(saved?.currentGame, '盘上没跟着写 —— 说明绕开了 applyAction 的第 3 步').not.toBeNull()
    // ⚠️ **不许断言 `saved.turn === 4`**：1.15 的写盘点是 `round-over` / `awaiting-build`
    //   （`core/effects.ts` 块 ④ 那张表），而 CONTINUE 把回合号 +1 发生在
    //   **下一相位** ⇒ 最后一次落盘的回合号天然比内存里那份小 1。
    //   把「小 1」当成缺陷去改 `effects.ts`，会破 1.15 的整组写盘守卫。
    expect(saved?.currentGame?.turn).toBeGreaterThanOrEqual(3)
  })

  it('终态拦停：心耗尽时跳不远，如实报告停在哪', () => {
    devSetInfiniteHearts(false)
    const result = jumpToTurn(12)

    expect(result.stoppedBy, '心耗尽了却报「到达」—— 那是撒谎').toBe('level-failed')
    expect(result.reachedTurn).toBeLessThan(12)
    expect(state.value.phase.kind).toBe('level-failed')
  })

  it('勾上「无限心」就跳得到远处（dev 补偿把失败翻回 `round-over`，跳回合要跟着走）', () => {
    devSetInfiniteHearts(true)
    const result = jumpToTurn(12)
    expect(result.stoppedBy).toBe('reached')
    expect(result.reachedTurn).toBe(12)
    expect(state.value.turn).toBe(12)
  })

  it('目标回合 ≤ 当前回合 ⇒ 原样不动', () => {
    devSetInfiniteHearts(true)
    advanceRounds(3)
    // ⚠️ **必须先落到战场上**：还在开始界面时 `jumpToTurn` 会按裁决 7 先
    //   `enterLevel()` 读档，而盘上存的是 `round-over` 那一份（回合号小 1）——
    //   那样量到的是「读档把局面换了」，不是「目标回合太靠前」。
    view.value = 'level'
    const result = jumpToTurn(2)
    expect(state.value.turn).toBe(4)
    expect(result.reachedTurn).toBe(4)
    expect(result.stoppedBy).toBe('reached')
  })

  it('目标回合被夹在 ≥ 1（面板上输入框可以是空的或负数）', () => {
    devSetInfiniteHearts(true)
    for (const raw of [0, -5, Number.NaN]) {
      resetSession()
      const result = jumpToTurn(raw)
      expect(state.value.turn, `目标 ${raw} 把局面弄坏了`).toBe(1)
      expect(result.reachedTurn).toBe(1)
    }
  })

  it('跳回合合成的回合**不进录制**（导出的 JSON 必须是玩家真按出来的）', () => {
    devSetInfiniteHearts(true)
    jumpToTurn(4)
    expect(
      isRecording(),
      '跳回合合成的回合被录进了会话 —— 那份 JSON 从一个假局面开始播，而复现要求是真输入',
    ).toBe(false)
  })

  // ⚠️📎 `[CR]` 2026-10-17 补。上面那条与「只在真跳了才清」**不构成鉴别力**：
  //   那条断言的是「跳完之后不录了」，对「无条件清」与「有条件清」都成立。
  //   而真正被修掉的 bug 是**反方向**：目标回合 ≤ 当前回合时循环体一次都不跑，
  //   `resetSession()` 却照跑 —— 家长点了没反应的那一下，把这局的复现现场弄丢了，
  //   而面板只显示「已到第 1 回合」读起来像成功了。
  it('[CR 2026-10-17] 目标回合 ≤ 当前回合时**不得**清掉会话录制', () => {
    devSetInfiniteHearts(true)
    advanceRounds(3)
    view.value = 'level'

    // 前置：先真的录到东西，否则「清掉」无从观测
    expect(isRecording(), '前置：advanceRounds 已经 dispatch 过，录制器应是活的').toBe(true)
    const before = state.value.turn

    const result = jumpToTurn(2)

    expect(result.stoppedBy).toBe('reached')
    expect(state.value.turn, '前置：这一次点击不该动局面').toBe(before)
    expect(
      isRecording(),
      '一次什么都没跳的点击清空了整局录制 —— 家长把「可复现的现场」丢了，' +
        '面板却显示「已到第 N 回合」读起来像成功了',
    ).toBe(true)
  })

  it('[CR 2026-10-17] 真的跳了才清录制（反向：不能因为上一条而无条件不调）', () => {
    devSetInfiniteHearts(true)
    jumpToTurn(4)
    expect(
      isRecording(),
      '真跳了之后反而不清 —— 导出的 JSON 会从跳回合造出来的假局面开始播',
    ).toBe(false)
  })

  it('[CR 2026-10-17] 步数预算耗尽如实报告，不得谎报成「不在能推进的阶段」', () => {
    // ⚠️📎 **题单必须造到 500 步以上，否则本条恒绿**（评审第一版就踩了这个坑）：
    //   本文件其余用例用 25 题的 `DECK`，而一个回合约 3 步 ⇒ 整局 75 步 ≪ 500
    //   ⇒ 真实内容下 500 步**够跑完整局**，`step-budget-exhausted` 构造上不可达。
    //   `[DS]` 的注释「正常路径根本走不到它」在 25 题的尺度上是对的，
    //   但那是**题单长度**带来的，不是机制保证的 —— 题单一长它就会被踩到。
    //   ⇒ 这里用 400 题的题单（约 1000 步）把那条路径真造出来，而不是接受 0 红。
    //   ⚠️ 这条**贵**：它要真跑满 500 次 dispatch，而每次 dispatch 都写一次盘
    //   （1.15 的写盘点）。400 题 ≈ 8 秒，故显式给 timeout。
    const BIG_DECK = makeSyntheticDeck(400, 1)
    state.value = createInitialState({ unitNumber: 1, deck: BIG_DECK })
    devSetInfiniteHearts(true)
    view.value = 'level'

    // 面板输入框的 `min="1"` 只挡下界，挡不住 99999。
    const result = jumpToTurn(99999)

    expect(
      result.reachedTurn,
      '前置：必须真的没到目标回合（400 题 ≈ 1000 步 > 500），否则下面那条判据恒绿',
    ).toBeLessThan(99999)
    expect(
      result.stoppedBy,
      '步数预算耗尽被报成别的 —— 那一刻相位恰恰是完全可推进的 round-over，谎报比不报更难查',
    ).toBe('step-budget-exhausted')
  }, 20_000)

  it('[CR 2026-10-17] 25 题的真实尺度上，预算够跑完整局 —— 如实报 `level-complete`', () => {
    // ⚠️ 与上一条**互为另一端**：上一条造大题单把它逼到预算上限，
    //   这一条确认在真实内容尺度上它不会被误触 —— 否则「加一个分支」很容易变成
    //   「把一个正常结局改报成异常」。
    devSetInfiniteHearts(true)
    view.value = 'level'
    const result = jumpToTurn(99999)
    expect(result.stoppedBy).toBe('level-complete')
    expect(result.reachedTurn).toBe(25)
  })

  it('类型面：目标回合是数字，面板直接传输入框的值即可', () => {
    // 锁住签名 —— 面板要用 `v-model.number` 的值直接调它，中间不加转换层。
    const result = jumpToTurn(Number('3'))
    expect(typeof result.reachedTurn).toBe('number')
    expect(result.reachedTurn).toBe(3)
  })
})
