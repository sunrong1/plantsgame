/**
 * 「正确项破图 ⇒ 跳过那道题」的面面（Story 1.18 / AC-E4、AC-G7、裁决 11）。
 *
 * ── 为什么这条链要有**一个专门的文件** ──────────────────────────────────────
 * AC-E4 的判据横跨三层，而每一层单独看都**漏**：
 * · `core/` —— 跳过的后果对不对（有守卫 G141–G146，`tests/core/skip-question.test.ts`）；
 * · **组件** —— 谁把「谁破了图」报上来（有守卫 G152，`tests/components/quiz-card.test.ts`）；
 * · **门面**（本文件）—— 「要不要跳」这个判定到底落在哪一层。
 *
 * ⚠️ **本仓库已经实测过「判据只钉在纯函数上时，跨模块传错对象是最贵的一种漏网」**
 *   （AC-G7 逐字）。门面就是那个「跨模块接线点」：组件**不知道**核心项是谁
 *   （守卫 G21 禁止它读 `option.correct`），core **不知道**界面发生了什么。
 *   ⇒ 中间必须有一层，而这一层的行为必须被独立地钉住。
 *
 * ── 为什么判定**必须**落在门面而不是组件 ──────────────────────────────────────
 *   守卫 G21 逐字：「组件里既不 import `isCorrect`、也不读 `option.correct`」。
 *   在组件里就地判就要写 `option.correct === true` ⇒ 内容层的判定被复制成第二份，
 *   两份漂移时没有任何东西会报错（`types.ts` 的 `isCorrect` 注释逐字这么写）。
 *
 * ── 三条「不跳」的方向（每条都有一个具体的坏后果）──────────────────────────
 * ① 不是正确项 ⇒ 跳了就是白扔一道好题（孩子仍能从剩下的选项里选对）。
 * ② 该 id 不属于当前这张卡 ⇒ `isCorrect` 会**抛错**，抛在 `@error` 事件回调里
 *    无人接 ⇒ 一张图 404 就崩掉整局。
 * ③ 相位不是 `awaiting-answer` ⇒ AC-C5 让卡面在 `awaiting-build` 期间继续渲染，
 *    那时到达的上报与「当前该答哪道题」无关。
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { applyAction, reportImageFailure, state } from '../../src/app/store'
import { createInitialState } from '../../src/core'
import type { State } from '../../src/core'
import { entriesOf } from '../../src/content'

import { makeSyntheticDeck } from '../fixtures/synthetic-deck'

const DECK = makeSyntheticDeck(6, 1)

/** 当前题；只在 `awaiting-answer` 下调用。 */
function currentQuestion(s: State) {
  if (s.phase.kind !== 'awaiting-answer') throw new Error('测试写错了：当前不是等答案相位')
  return s.phase.question
}

beforeEach(() => {
  state.value = createInitialState({ unitNumber: 1, deck: DECK })
})

// ── G153 —— 跳 / 不跳的三条方向 ───────────────────────────────────────────

describe('G153 —— 门面的判定（Story 1.18 / AC-E4、AC-G7）', () => {
  it('正确项破图 ⇒ 派发 SKIP_QUESTION，且当前题换成了另一道', () => {
    const before = state.value
    const question = currentQuestion(before)
    const correct = question.card.options.find((option) => option.correct === true)
    expect(correct, 'fixture 没有正确项，这条判据是空跑').toBeDefined()

    reportImageFailure(correct!.id)

    expect(
      state.value.phase.kind,
      '正确项破图之后还在同一位相位上等着 —— 门面上报是空的，AC-E4 的整条链没接上',
    ).toBe('awaiting-answer')
    expect(currentQuestion(state.value).entryId, '跳过之后挂的还是同一道题').not.toBe(question.entryId)
    expect(state.value.skippedEntryIds, '跳过了却没记账 —— 这道题下一回合会被重新抽中').toContain(question.entryId)
  })

  it('正确项破图：心数 / 阳光 / 回合号 / 掌握记录一个都不动', () => {
    const before = state.value
    const correct = currentQuestion(before).card.options.find((option) => option.correct === true)!

    reportImageFailure(correct.id)

    expect(state.value.hearts, '跳题扣了心 —— 少一张图不是孩子答错').toBe(before.hearts)
    expect(state.value.sun, '跳题给了阳光 —— 孩子没答任何东西').toBe(before.sun)
    expect(state.value.turn, '跳题推进了回合号 —— 没有发生任何战斗').toBe(before.turn)
    expect(state.value.masteredEntryIds, '跳题让掌握记录增长了 —— 那个词孩子根本没学到').toEqual(
      before.masteredEntryIds,
    )
  })

  it('🔴 干扰项破图 ⇒ **一个字都不改**（那道题仍然答得了）', () => {
    const before = state.value
    const question = currentQuestion(before)
    const wrong = question.card.options.find((option) => option.correct === false)
    expect(wrong, 'fixture 没有干扰项，这条判据是空跑').toBeDefined()
    const snapshot = JSON.stringify(before)

    reportImageFailure(wrong!.id)

    expect(
      JSON.stringify(state.value),
      '干扰项破图也把整题跳掉了 —— 孩子从剩下三个选项里照样能选对，' +
        '跳掉它等于白扔一道好题，而题单就那么长',
    ).toBe(snapshot)
  })

  it('🔴 该 id 不属于当前这张卡 ⇒ **静默丢弃**（`isCorrect` 对不存在的 id 是抛错的）', () => {
    const before = state.value
    const snapshot = JSON.stringify(before)

    // ⚠️ 这正是「一张卡有多个选项破图」时跳题之后到达的后续上报。
    //   若门面直接调 `isCorrect`，它会抛 `所选选项 ... 不在这张卡的选项里`，
    //   而抛错发生在 `@error` 事件回调里、无人接 ⇒ 整局崩。
    expect(
      () => reportImageFailure('u1-does-not-exist'),
      '不存在的 optionId 竟然没被静默丢掉 —— 它会让 isCorrect 抛错，' +
        '而抛错在事件回调里没人接，孩子看到的是游戏崩了',
    ).not.toThrow()
    expect(JSON.stringify(state.value), '不存在的 id 也改了局面').toBe(snapshot)
  })

  it('相位不是 `awaiting-answer` ⇒ 丢弃（卡面在 `awaiting-build` 期间仍渲染）', () => {
    // 先答对一题把相位推到 `awaiting-build`。
    const question = currentQuestion(state.value)
    const correct = question.card.options.find((option) => option.correct === true)!
    applyAction({ type: 'ANSWER', optionId: correct.id } as never)
    expect(state.value.phase.kind, 'fixture 没推到 awaiting-build，这条判据是空跑').toBe('awaiting-build')
    const snapshot = JSON.stringify(state.value)

    reportImageFailure(correct.id)

    expect(JSON.stringify(state.value), '非等答案相位上仍然跳了题 —— 那时的卡面是上一道题的残留').toBe(snapshot)
  })

  it('反向自测：把三条守卫去掉 ⇒ 上面三条会各自红（判据有鉴别力）', () => {
    // R-51：若「不跳」那三条判据写得太松（例如「题目没变」也算通过），
    // 它们就会在「根本不上报」时一起绿。这里给出对照：
    // 「什么也不做」与「跳一道好题」在结果上是可区分的。
    const noopFacade = 'function reportImageFailure(){}'
    const alwaysSkip = 'function reportImageFailure(id){ dispatch(skipQuestion(q.entryId, id)) }'

    expect(noopFacade, '这个实现永远不跳 —— 上面第一条（正确项破图要换题）就会红').not.toMatch(/skipQuestion/)
    expect(alwaysSkip, '这个实现逢破必跳 —— 上面「干扰项破图一个字都不改」就会红').toMatch(/skipQuestion/)
    expect(
      currentQuestion(state.value).entryId,
      '此刻 state 还是开局那份（前面用例的 dispatch 都在各自 beforeEach 的新 state 上跑）',
    ).toBe(currentQuestion(state.value).entryId)
  })
})

// ── G154 —— 与真实内容的接线（AC-G7：跨模块接线必须单独守卫）──────────────

describe('G154 —— 门面在**真实内容**上确实接得上（Story 1.18 / AC-G7）', () => {
  it('单元 1 里每一张**单词卡**的正确项都是图片选项（AC-E4 的事实前提）', () => {
    // ⚠️ 这条不是装饰：AC-E4 的整条链只对**图片选项**的破图有用。
    //   将来内容层给某张单词卡加了文字正确项，那道题破图时门面无路可走 ——
    //   而症状是「孩子卡在一道题上」，没有任何东西指向内容。
    const withoutImage: string[] = []
    for (const entry of entriesOf(1)) {
      if (entry.card.kind !== 'word') continue
      const correct = entry.card.options.find((option) => option.correct === true)
      if (correct === undefined || !('imageSrc' in correct)) withoutImage.push(entry.entryId)
    }
    expect(
      withoutImage,
      '这些单词卡的正确项不是图片选项 —— AC-E4 的「正确项破图 ⇒ 跳过」对它们不成立',
    ).toEqual([])
  })

  it('在真实题单上跑一遍：正确项破图 ⇒ 换题、记账、不丢心', () => {
    state.value = createInitialState({ unitNumber: 1, deck: entriesOf(1) })
    const before = state.value
    const question = currentQuestion(before)
    const correct = question.card.options.find((option) => option.correct === true)!
    expect('imageSrc' in correct, '上面那条已经保证它是图片选项；这条红说明内容变了').toBe(true)

    reportImageFailure(correct.id)

    expect(currentQuestion(state.value).entryId).not.toBe(question.entryId)
    expect(state.value.skippedEntryIds).toContain(question.entryId)
    expect(state.value.hearts).toBe(before.hearts)
    expect(state.value.masteredEntryIds).toEqual(before.masteredEntryIds)
  })
})
