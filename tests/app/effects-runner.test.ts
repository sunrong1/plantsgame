/**
 * `app/effects-runner.ts` 的守卫（Story 1.14 / AC-E1 ~ AC-E4、G60、G69）。
 *
 * ── 为什么这些行为在浏览器里看不出来 ────────────────────────────────────────
 * 「音效没响」在界面上与「孩子没点到」**长得一模一样** —— 没有报错、没有差异、
 * 没有可截图的红。而本文件守的恰恰是几类只在特定路径上才出问题的行为：
 *   · 顺序错了（runEffects 排在赋值之后 ⇒ prev 取不到 ⇒ 一条音效都不响）
 *   · 抛错冒泡了（前一条音效炸了 ⇒ 回合卡死，孩子看着界面不动）
 *   · 顺序反了（通关音先于掉心音）
 *
 * ⚠️ **本文件 mock 掉 `services/audio`，不碰真实解码。** 验收判据是
 *   「链路结构对不对」，不是「声音好不好听」（裁决 2）。
 *
 * ⚠️ `playSfx` 是具名 ESM 导出，对真实命名空间做 `vi.spyOn` 会抛
 *   `Cannot redefine property` —— 必须用 `vi.mock`（与 `speak-question.test.ts` 同因）。
 *
 * ⚠️ **「一次产出多条 cue」的两条用例合成 `(prev, next)` 而不跑真实战斗** ——
 *   真实战斗耦合 `ZOMBIE_HP` / 单回合伤害等数值，Story 3.2 会重调它们，
 *   届时这两条守卫会因**与音效无关**的原因变红。
 *
 * 📎 **Story 1.15 起本文件还装 `fakeStorage`**：`runEffectsFromStore` 的第 4 参
 *   落盘、`enterLevel()` 读档，两条路径都会碰 `localStorage`。
 *   不装的话 `readSave()` 会在 try 里撞上 ReferenceError、降级成 `'read'`，
 *   `console.warn` 刷屏而**没有一条用例变红** —— 静默降级正是本 story 要防的东西，
 *   守卫自己先漏那就太难看了（`localStorage` 用 `tests/fixtures/fake-storage.ts`，
 *   R-37：全仓只有那一份）。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { OptionId, Progress, Question, State } from '../../src/core'
import { playSfx, startBgmIfReady, stopBgm } from '../../src/services/audio'
import { afterEachUninstall, installFakeStorage } from '../fixtures/fake-storage'

vi.mock('../../src/services/audio', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/audio')>()
  return { ...actual, playSfx: vi.fn(), startBgmIfReady: vi.fn(), stopBgm: vi.fn() }
})

const playMock = vi.mocked(playSfx)
const bgmMock = vi.mocked(startBgmIfReady)
const stopBgmMock = vi.mocked(stopBgm)

const core = await import('../../src/core')
const { entriesOf } = await import('../../src/content')
const { applyAction, enterLevel, state } = await import('../../src/app/store')
const { runEffectsFromStore } = await import('../../src/app/effects-runner')

/**
 * 一份空进度，只用于喂 `runEffectsFromStore` 的第 4 参。
 *
 * ⚠️ **本文件不验落盘内容** —— 那是 `tests/services/save.test.ts` 的活。
 *   这里只需要一个**结构合法**的值，让接线能跑通。
 */
const stubProgress: Progress = { currentUnitIndex: 0, masteredWordIds: [] }

/** 一份结构合法的 state（`deck` 用真实内容，保证 `nextQuestion` 能选出题）。 */
function freshState() {
  return core.createInitialState({ unitNumber: 1, deck: entriesOf(1) })
}

/**
 * 合成一个「一次 dispatch 同时产出 heart-lost + level-complete」的 `(prev, next)` 对。
 *
 * ⚠️ `State.hearts` 是**数字**（`State` 定义逐字），掉心判据由
 *   `heartSlots()` 把它展开成布尔数组 —— 早版这里误写成 `hearts: [true, false]`
 *   导致判据读不到、两条用例静默空转（`expected.length` 的自检把它当场抓住）。
 */
function multiCuePair(): { prev: State; next: State } {
  const base = freshState()
  const prev: State = { ...base, hearts: 3, phase: { kind: 'resolving' } }
  const next: State = { ...base, hearts: 2, phase: { kind: 'level-complete' } }
  return { prev, next }
}

beforeEach(() => {
  playMock.mockReset()
  bgmMock.mockReset()
  installFakeStorage()
  state.value = freshState()
})

afterEachUninstall()

/** 初始相位上的当前题；不是 `awaiting-answer` 就直接判失败。 */
function currentQuestion(): Question {
  const phase = state.value.phase
  if (phase.kind !== 'awaiting-answer') throw new Error(`相位是 ${phase.kind}，不是 awaiting-answer`)
  return phase.question
}

/**
 * 该题的**正确**选项 id。
 *
 * ⚠️ 「哪个选项对」是**选项上的 `correct` 布尔**，不在 `Question` 上 ——
 *   早版写成 `question.correct` 拿到 `undefined`，reducer 当场抛
 *   「所选选项 undefined 不在这张卡的选项里」。正确性判定一律走
 *   `core.isCorrect(card, chosenId)`，本文件用 fixture 的
 *   `correctOptionId` / `wrongOptionId` 派生，**不自己再判一次对错**。
 */
function correctId(question: Question): OptionId {
  const hit = question.card.options.find((o) => o.correct)
  if (hit === undefined) throw new Error(`题 ${question.entryId} 没有正确项`)
  return hit.id
}

/** 该题的**错误**选项 id（第一个非正确项）。 */
function wrongId(question: Question): OptionId {
  const hit = question.card.options.find((o) => !o.correct)
  if (hit === undefined) throw new Error(`题 ${question.entryId} 没有错误选项`)
  return hit.id
}

describe('AC-E1 —— effects-runner 按 runEffects 的顺序逐条执行', () => {
  it('答对 ⇒ 恰好播 answer-correct 一次', () => {
    const question = currentQuestion()

    applyAction(core.answer(correctId(question)))

    expect(playMock).toHaveBeenCalledTimes(1)
    expect(playMock).toHaveBeenCalledWith('answer-correct')
  })

  it('答错 ⇒ 恰好播 answer-wrong 一次', () => {
    const question = currentQuestion()
    applyAction(core.answer(wrongId(question)))

    expect(playMock).toHaveBeenCalledTimes(1)
    expect(playMock).toHaveBeenCalledWith('answer-wrong')
  })

  it('🚨 顺序：runEffects 的输出顺序 = 播放顺序（AC-C5）', () => {
    const { prev, next } = multiCuePair()
    const expected = core
      .runEffects({ type: 'CONTINUE' }, prev, next)
      .filter((e) => e.kind === 'SFX')
      .map((e) => e.cue)
    expect(expected.length, '构造的 prev/next 对必须真能产出多条 cue，否则本用例空转').toBeGreaterThan(1)

    runEffectsFromStore({ type: 'CONTINUE' }, prev, next, stubProgress)

    expect(playMock.mock.calls.map((c) => c[0])).toEqual(expected)
  })
})

describe('AC-E4 / G69 —— 单条抛错不阻断后续条目，且绝不冒到 applyAction', () => {
  it('🚨 前一条音效抛错时，后一条仍被播放', () => {
    const { prev, next } = multiCuePair()
    const expected = core
      .runEffects({ type: 'CONTINUE' }, prev, next)
      .filter((e) => e.kind === 'SFX')
      .map((e) => e.cue)
    expect(expected.length, '构造失效：本用例需要 ≥2 条才能验「前一条炸了后一条照播」').toBeGreaterThan(1)

    // 🚨 只让**第一条**抛 —— 后面的必须照常播放。
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    playMock.mockImplementationOnce(() => {
      throw new Error('解码器内部异常')
    })

    expect(
      () => runEffectsFromStore({ type: 'CONTINUE' }, prev, next, stubProgress),
      '抛错不得冒到调用方',
    ).not.toThrow()
    expect(playMock.mock.calls.map((c) => c[0]), '前一条炸了，后一条仍必须被播').toEqual(expected)
    // ⚠️ AC-E4 的**另一半**：必须记 `[audio] WARN`。
    //   这条断言是变异 **M119**（把 catch 写成空块、吞掉不记日志）逼出来的 ——
    //   实测 M119 下「后续仍被播放」与「不抛出」两条都成立，
    //   **0 红**。吞掉不记日志意味着「第②③步炸了」这件事对开发者完全不可见，
    //   而 NFR13 的兜底恰恰建立在「失败可见」之上。⇒ 补这条断言。
    expect(
      warn.mock.calls.some((call) => String(call[0]).startsWith('[audio]')),
      '音效抛错必须记 `[audio] WARN` —— 静默吞掉会让失败在浏览器里完全不可见（M119）',
    ).toBe(true)
    warn.mockRestore()
  })

  it('🚨 applyAction 全程（reduce / 赋值 / 清选中 / 进度）都不因音效抛错而中断', () => {
    const question = currentQuestion()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    playMock.mockImplementation(() => {
      throw new Error('播放失败')
    })

    const before = state.value
    expect(() => applyAction(core.answer(correctId(question)))).not.toThrow()
    // 状态推进 ⇒ reduce 与赋值都跑完了；进度非空 ⇒ 第四步也跑完了。
    expect(state.value, '状态必须已经推进（说明 reduce 与后续步骤都跑完了）').not.toBe(before)
    expect(state.value.phase.kind).toBe('awaiting-build')
    warn.mockRestore()
  })
})

describe('AC-E3 —— enterLevel 之后启动 BGM（裁决 5）', () => {
  it('enterLevel 会调用 startBgmIfReady', () => {
    enterLevel()
    expect(bgmMock).toHaveBeenCalledTimes(1)
  })

  it('BGM 不由 action 驱动 —— 普通 dispatch 不触发它', () => {
    // 走到 awaiting-build，依次过 END_BUILD → RESOLVE_ROUND → CONTINUE，
    // 覆盖「答题 / 结束建造 / 结算 / 继续」四类 action。
    applyAction(core.answer(correctId(currentQuestion())))
    expect(state.value.phase.kind).toBe('awaiting-build')
    bgmMock.mockClear()

    applyAction(core.endBuild())
    applyAction(core.resolveRound())
    applyAction(core.continueRound())

    expect(bgmMock, 'BGM 由「进关」触发，不是 action 触发（裁决 5）').not.toHaveBeenCalled()
  })
})

/**
 * 🚨 **G213 —— 退出战斗必须停 BGM（`[CR]` 新增，`stopBgm` 的接线半）。**
 *
 * BGM 在 `[DS]` 交付时**永远不响**（解码回调不接「该播了」这个事实），
 * 所以 `store.backToStart()` 的注释写「不停 BGM，BGM 停止策略属 1.14 / 1.18，本 story 不碰」——
 * 那在「BGM 从不响」的前提下是**无害的**。
 * 本 story 修好「BGM 会响」之后，同一句注释立刻变成真 bug：
 * **孩子点「返回开始界面」，战斗音乐还在响**（而且会一直循环 39 秒那一段）。
 *
 * ⚠️ `view` 的两个出口是 `enterLevel()` 与 `backToStart()`（`[CR]` 已核），
 *   ⇒ 停 BGM 只需要挂在这**一个**函数上；这一条判据守的就是那根线没断。
 *   行为本身（真停源节点、真撤意图）在 `tests/services/audio.test.ts` 的 **G206**。
 */
describe('G213 —— 退出战斗要停 BGM（接线半）', () => {
  it('backToStart 会调用 stopBgm', async () => {
    const { backToStart } = await import('../../src/app/store')
    stopBgmMock.mockClear()

    backToStart()

    expect(
      stopBgmMock,
      'BGM 现在真的会响 ⇒ 退出战斗必须真的停它，否则开始界面上一直放着战斗音乐',
    ).toHaveBeenCalledTimes(1)
  })

  it('反向自测：判据认的是 stopBgm 这个门面，不是「恰好调了某个函数」', async () => {
    const { backToStart } = await import('../../src/app/store')
    stopBgmMock.mockClear()
    const playBefore = playMock.mock.calls.length
    const bgmBefore = bgmMock.mock.calls.length

    backToStart()

    expect(stopBgmMock, '必须调 stopBgm').toHaveBeenCalledTimes(1)
    expect(playMock.mock.calls.length, '退出会战斗不该顺便播音效').toBe(playBefore)
    expect(bgmMock.mock.calls.length, '退出会战斗不该重新起播 BGM').toBe(bgmBefore)
  })
})
