/**
 * 朗读门面的守卫（Story 1.11 / AC-D4、裁决 3）。
 *
 * ── 为什么这条要单独立一个文件 ────────────────────────────────────────────
 * 组件侧有 G25 守着「`quiz/` 不许 import `pronunciation`」，但那只是**禁令**；
 * 门面的**正向行为**（phase 收窄 + 必须传 `entryId`）没有任何东西守着 ——
 * 而这两条各自都能在浏览器里静默失效：
 *   · 不收窄 → `awaiting-build` 上重听会拿不到题，抛异常或静默不出声
 *   · 不传 `entryId` → 录音兜底整个失效，而界面上**看不出任何异常**
 *     （`pronunciation.ts:584-592`：「TTS 挂了也有录音兜底」这句话
 *      **只对传了 `entryId` 的调用方成立**）
 *
 * ⚠️ **本文件是 Story Dev Notes §2 之外新增的测试文件。** 增它是因为上面两条
 *   AC-D4 判据在原计划的两个测试文件里都没有落点；不增就只能靠浏览器核对，
 *   而「没出声」在浏览器里和「孩子没点」长得一模一样。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { playPronunciation } from '../../src/services/pronunciation'
import { applyAction, speakQuestion, state } from '../../src/app/store'
import { answer, createInitialState } from '../../src/core'
import { entriesOf } from '../../src/content'

// `playPronunciation` 是具名 ESM 导出，对真实命名空间做 `vi.spyOn` 会抛
// `Cannot redefine property` —— 与 AC-E2 对 `applyAction` 的判断同因，
// 必须用 `vi.mock` 拦。
vi.mock('../../src/services/pronunciation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/pronunciation')>()
  return { ...actual, playPronunciation: vi.fn() }
})

const playMock = vi.mocked(playPronunciation)

/** 一份结构合法的 state（`deck` 用真实内容，保证 `nextQuestion` 能选出题）。 */
function freshState() {
  return createInitialState({ unitNumber: 1, deck: entriesOf(1) })
}

beforeEach(() => {
  playMock.mockClear()
  state.value = freshState()
})

describe('AC-D4 —— 门面转调 pronunciation，且必须传 entryId', () => {
  it('在 awaiting-answer 上朗读当前题的题面', () => {
    const question = state.value.phase.kind === 'awaiting-answer' ? state.value.phase.question : null
    expect(question).not.toBeNull()

    speakQuestion()

    expect(playMock).toHaveBeenCalledTimes(1)
    expect(playMock).toHaveBeenCalledWith(question!.card.promptText, question!.entryId)
  })

  it('🚨 entryId 必须是第二个实参 —— 漏了它录音兜底整个失效，而界面上看不出异常', () => {
    speakQuestion()

    const [, second] = playMock.mock.calls[0] ?? []

    // 逐字照 `pronunciation.ts:584-592`：不传 entryId 时直接走 TTS，
    // TTS 再失败就只剩一条 console.warn，`fallbackToRecording` 不播任何音频。
    expect(typeof second, '门面没有把 entryId 传下去 ⇒「TTS 挂了也有录音兜底」是句空话').toBe('string')
    expect(second).not.toBe('')
  })

  it('传的是 question.entryId（不是 option.id，也不是文件名）', () => {
    speakQuestion()

    const question = state.value.phase.kind === 'awaiting-answer' ? state.value.phase.question : null
    expect(playMock.mock.calls[0]?.[1]).toBe(question!.entryId)
  })
})

describe('AC-D4 —— 必须先做 phase 收窄', () => {
  it('awaiting-build 上调用不朗读，也不抛', () => {
    // 走到 awaiting-build：答对一道题即可（`applyAnswer` 末尾 `withBuildPhase`）。
    const question = state.value.phase.kind === 'awaiting-answer' ? state.value.phase.question : null
    const correctId = question!.card.options.find((o) => o.correct)!.id
    applyAction(answer(correctId))
    expect(state.value.phase.kind).toBe('awaiting-build')

    expect(() => speakQuestion()).not.toThrow()
    expect(playMock).toHaveBeenCalledTimes(0)
  })

  it('其余四个无题变体同样静默返回', () => {
    // AC-C5 ⑥：重听在 awaiting-build 期间**不提供**。`Phase` 是六变体联合，
    // 其中**五个**没有 `question` ⇒ 一条收窄必须覆盖它们全部，
    // 漏掉任何一个都会在某个阶段变成「点了没反应」或直接抛。
    //
    // ⚠️ 这里刻意不写 `as typeof state.value`：那正是 §8 教训 3 的失败形态 ——
    //   类型断言会让「这条 phase 真的是合法变体」这条编译期检查失灵。
    for (const phase of [
      { kind: 'resolving' },
      { kind: 'round-over' },
      { kind: 'level-complete' },
      { kind: 'level-failed' },
    ] as const) {
      state.value = { ...state.value, phase }

      expect(() => speakQuestion(), `阶段 ${phase.kind} 上门面没有静默返回`).not.toThrow()
    }
    expect(playMock).toHaveBeenCalledTimes(0)
  })
})
