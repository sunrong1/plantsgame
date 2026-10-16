/**
 * `SAVE` 接线的失败路径守卫（Story 1.15 / AC-E4、AC-E5）。
 *
 * ── 守什么 ──────────────────────────────────────────────────────────────────
 * 「写盘出岔子时回合照样往前走」这件事在界面上与「写盘正常」**长得一模一样**：
 * 两种情况下孩子都在答题、塔在打僵尸、进度条在动。唯一区别是**进度关掉页面就没了**，
 * 而那一刻**没有任何报错**。⇒ 只有一条专门制造「`writeSave` 抛错」的用例能看见它。
 *
 * ── 为什么单独一个文件 ──────────────────────────────────────────────────────
 * 本用例必须让 `writeSave` **真的抛**。真实实现**绝不抛**（它自己 catch 一切并返回
 * boolean，AC-B3 / AC-B6）—— 所以这里只能用 `vi.mock` 换掉整个模块。
 * 而 `tests/services/save.test.ts` 验的恰恰是**真实实现**的四条降级路径，
 * 两者混在一个文件里会互相顶掉。故按 R-37 分成两个文件，各守一件事。
 *
 * ⚠️ **`playSfx` 也被 mock 掉了**：本用例要断言「循环里的其他条目**照常执行**」，
 *   而那「其他条目」就是音效 —— 它必须是可观测的 mock，不能真去解码音频。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Progress, State } from '../../src/core'

vi.mock('../../src/services/audio', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/audio')>()
  return { ...actual, playSfx: vi.fn(), startBgmIfReady: vi.fn() }
})

// 🚨 **必须 mock 整个模块**：`writeSave` 是具名 ESM 导出，
//   对真实命名空间 `vi.spyOn` 会抛 `Cannot redefine property`（1.14 逐字记过）。
vi.mock('../../src/services/save', () => ({
  SAVE_KEY: 'plantsgame.save',
  SAVE_SCHEMA_VERSION: 1,
  writeSave: vi.fn(),
  readSave: vi.fn(() => null),
  clearSave: vi.fn(),
  isSaveDegraded: () => false,
  saveDegradations: () => [],
}))

const core = await import('../../src/core')
const { entriesOf } = await import('../../src/content')
const { writeSave } = await import('../../src/services/save')
const { playSfx } = await import('../../src/services/audio')
const { applyAction, state, progress } = await import('../../src/app/store')
const { runEffectsFromStore } = await import('../../src/app/effects-runner')

const playMock = vi.mocked(playSfx)
const writeMock = vi.mocked(writeSave)

const stubProgress: Progress = { currentUnitIndex: 0, masteredWordIds: [] }

/** 一份结构合法的 state（`deck` 用真实内容，保证 `reduce` 能跑）。 */
function freshState(): State {
  return core.createInitialState({ unitNumber: 1, deck: entriesOf(1) })
}

/** 构造一个「掉心 + 通关」同时成立的 `(prev, next)`，保证产出 ≥ 1 条音效。 */
function multiCuePair(): { prev: State; next: State } {
  const base = freshState()
  return {
    prev: { ...base, hearts: 3, phase: { kind: 'resolving' } },
    next: { ...base, hearts: 2, phase: { kind: 'level-complete' } },
  }
}

beforeEach(() => {
  playMock.mockReset()
  writeMock.mockReset()
  writeMock.mockReturnValue(true)
  state.value = freshState()
  progress.value = { currentUnitIndex: 0, masteredWordIds: [] }
})

describe('AC-C3 —— SAVE 真的被接到写盘上', () => {
  it('awaiting-build 的一次 dispatch 会真的调用 writeSave', () => {
    applyAction(core.answer(correctIdOfCurrentQuestion()))

    expect(state.value.phase.kind, '前置：答完应在 awaiting-build').toBe('awaiting-build')
    expect(writeMock, 'awaiting-build 是写盘点之一，必须落盘').toHaveBeenCalledTimes(1)
    expect(
      writeMock.mock.calls[0][1]?.phase.kind,
      '第二个参数必须是对局本身，而不是 null —— 只有局末才存 null',
    ).toBe('awaiting-build')
  })

  it('⚠️ 落盘的 progress 比内存里少一条（偏离 3 的实测钉子）', () => {
    // ⚠️ **这条断言写的是本 story 已登记的取舍，不是理想形状**：
    //   `applyAction` 里 `runEffectsFromStore` 排在 `advanceProgress` **之前**
    //   （后者逐字要求排在 `state.value = next` 之后 —— 1.13 AC-B3），
    //   ⇒ 落盘的 `progress` 少一条本次答对的词。
    //   把它钉成断言，是为了**将来有人调换那两步时会被这条红**，
    //   而不是等到 `[CR]` 才有人想起来问「当初为什么是这个顺序」。
    applyAction(core.answer(correctIdOfCurrentQuestion()))

    const persisted = writeMock.mock.calls[0][0]
    expect(
      persisted.masteredWordIds.length,
      '落盘的 masteredWordIds 比内存里少一条 —— 这是偏离 3 记录的那个取舍',
    ).toBe(progress.value.masteredWordIds.length - 1)
    expect(
      persisted.masteredWordIds,
      '少的那一条正是本题 —— 若是别的，才说明判据另有偏差',
    ).toEqual([])
  })

  it('resolving 不落盘（裁决 6 表里的两条负向之一）', () => {
    applyAction(core.answer(correctIdOfCurrentQuestion()))
    expect(writeMock, '前置：awaiting-build 写了一次').toHaveBeenCalledTimes(1)
    writeMock.mockClear()

    applyAction(core.endBuild())

    expect(state.value.phase.kind, '前置：END_BUILD 之后应停在 resolving').toBe('resolving')
    // ⚠️ **写死 0**，不用 toBeLessThanOrEqual(1)：后者会让「误加了一次」照样通过。
    expect(writeMock, 'resolving 不得落盘（真实一帧，用户看不到也退不出）').not.toHaveBeenCalled()
  })

  it('round-over 落盘（裁决 6 表的主路径）', () => {
    applyAction(core.answer(correctIdOfCurrentQuestion()))
    applyAction(core.endBuild())
    writeMock.mockClear()

    applyAction(core.resolveRound())

    expect(state.value.phase.kind, '前置：结算后应停在 round-over').toBe('round-over')
    expect(writeMock, 'round-over 必须落盘').toHaveBeenCalledTimes(1)
    expect(writeMock.mock.calls[0][1]?.phase.kind, '落盘的是 round-over 那一刻的对局').toBe(
      'round-over',
    )
  })
})

describe('AC-E5 —— 🚨 写盘抛错也不得阻断回合', () => {
  it('writeSave 抛错时 runEffectsFromStore 绝不抛，且循环里的其他条目照常执行', () => {
    const { prev, next } = multiCuePair()
    const expected = core
      .runEffects({ type: 'CONTINUE' }, prev, next)
      .filter((e) => e.kind === 'SFX')
      .map((e) => e.cue)
    expect(expected.length, '构造失效：本用例需要 ≥2 条才能验「前一条炸了后一条照播」').toBeGreaterThan(1)

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    playMock.mockImplementationOnce(() => {
      throw new Error('解码器内部异常')
    })
    writeMock.mockImplementation(() => {
      throw new Error('localStorage.setItem 崩了（契约违约路径）')
    })

    expect(
      () => runEffectsFromStore({ type: 'CONTINUE' }, prev, next, stubProgress),
      '写盘抛错不得冒到调用方 —— 冒上去就是回合卡死',
    ).not.toThrow()

    expect(playMock.mock.calls.map((c) => c[0]), '音效条目照常播放').toEqual(expected)
    expect(
      warn.mock.calls.some((call) => String(call[0]).startsWith('[save]')),
      '写盘抛错必须记一条 `[save] WARN` —— 静默吞掉等于进度静默丢失',
    ).toBe(true)
    warn.mockRestore()
  })

  it('writeSave 抛错时 applyAction 全程照走（reduce / 赋值 / 清选中 / 进度）', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    writeMock.mockImplementation(() => {
      throw new Error('localStorage.setItem 崩了')
    })

    const before = state.value
    expect(() => applyAction(core.answer(correctIdOfCurrentQuestion()))).not.toThrow()

    expect(state.value, '状态必须已经推进（说明 reduce 与后续步骤都跑完了）').not.toBe(before)
    expect(state.value.phase.kind).toBe('awaiting-build')
    expect(
      progress.value.masteredWordIds.length,
      '进度也必须照常并入 —— 写盘失败只影响落盘，不影响内存里的学习记录',
    ).toBe(1)
    warn.mockRestore()
  })

  it('⚠️ SAVE 恒排在最后 —— 「后续条目仍执行」在当前判据下构造上不可达', () => {
    // ⚠️ **这不是一条「凑数」的用例，它是 AC-E5 半条 AC 的可达性记录**：
    //   `core/effects.ts` 的判据块 ④ 永远把 SAVE push 在最后 ⇒ 任何
    //   `(action, prev, next)` 的产物里 SAVE 后面都不可能还有条目。
    //   ⇒ AC 逐字那句「排在它后面的条目仍要执行」**今天写不出来**（1.14 AC-B6 同型）。
    //   本 story 的处置：AC-E5 按「不抛 + 回合照走 + 其余条目照播」三条断言兑现，
    //   并把「后续条目」这一半记为**构造上不可达**（见 story 的 AC-E5 段与偏离表）。
    const { prev, next } = multiCuePair()
    const kinds = core.runEffects({ type: 'CONTINUE' }, prev, next).map((e) => e.kind)

    expect(kinds[kinds.length - 1], 'SAVE 必须是最后一条').toBe('SAVE')
    expect(
      kinds.filter((k) => k === 'SAVE').length,
      '一次 dispatch 最多一条 SAVE —— 多于一条说明判据写错了',
    ).toBe(1)
  })
})

/** 当前题的**正确**选项 id。 */
function correctIdOfCurrentQuestion(): string {
  const phase = state.value.phase
  if (phase.kind !== 'awaiting-answer') throw new Error(`相位是 ${phase.kind}，不是 awaiting-answer`)
  const hit = phase.question.card.options.find((o) => o.correct)
  if (hit === undefined) throw new Error(`题 ${phase.question.entryId} 没有正确项`)
  return hit.id
}
