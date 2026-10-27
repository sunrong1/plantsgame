/**
 * 「一个单元的内容守卫」的**共用套件**（Story 2.6 / Task 5.4）。
 *
 * ── 为什么抽出来 ────────────────────────────────────────────────────────────
 *   Story 2.6 要给单元 3 / 4 / 5 / 6 / 7 各写一份「本单元的内容守卫」。
 *   ⇒ 五个文件里抄同一段判据 = **五条复制链**（R-37）——
 *     改判据只改一处的话，其余四份恒绿，而「每个单元都被守住了」这句话
 *     **当场变成假的**（守住的是四个旧版本）。
 *   ⇒ 套件抽到这里，`tests/content/unit-03.test.ts` … `unit-07.test.ts`
 *     各自只调一次 {@link unitContentSuite}。
 *
 * ⚠️ **判据本体住在 `tests/helpers/unit-content.ts`** —— 本文件只负责
 *   「把判据摆进 `describe` 里 + 给每条配一条反向自测」，不重抄判据。
 *   ⚠️ **反向自测的夹具必须落在「本单元真实存在的东西」上** ——
 *   拿别的单元的夹具来喂本单元的判据，测的就不是本单元了。
 *
 * ⚠️ **录音断言（G289）不在本套件里** —— 它要求磁盘上**已有**该单元的录音，
 *   而 Story 2.6 的 T4（录音）尚未完成（外部 TTS 调用被环境拦下）⇒
 *   现在加上必然红 ⇒ **不写**。录音补齐后必须回来加（见 story 文档 T5.4）。
 */

import { describe, expect, it } from 'vitest'

import { getUnit } from '../../src/content'
import { normalizeEnglish, textbookUnitOf } from './textbook-corpus'
import {
  assertDistributionMatchesShare,
  assertIdsAreWellFormed,
  assertOptionPointersResolve,
  assertResponseAnswersAreWellFormed,
  assertTowersAndAnswersAreWellFormed,
  assertTowerTypesRotate,
  countsByKind,
  normalizeSentence,
} from './unit-content'
import { assertOptionCountsMatchRule } from './option-counts'

/** 本单元「可以当应答的句子」集合（**归一化后**）—— 教材句型 ∪ 自写句。 */
function answerableSentencesOf(unitNumber: number): Set<string> {
  const set = new Set<string>()
  for (const sentence of textbookUnitOf(unitNumber).unit.sentences) {
    set.add(normalizeEnglish(sentence.text))
  }
  for (const entry of getUnit(unitNumber).entries) {
    if (entry.entryId.includes('-w-')) set.add(normalizeSentence(entry.card.promptText))
  }
  return set
}

/**
 * 给某个单元登记一整套内容守卫。
 *
 * @param unitNumber 被守的单元号（1 基）
 */
export function unitContentSuite(unitNumber: number): void {
  const unit = getUnit(unitNumber)
  const entries = unit.entries
  const counts = countsByKind(entries)

  describe(`单元 ${unitNumber} 的内容守卫`, () => {
    // ══════════════════════════════════════════════════════════════════════════
    // G348 —— 卡型配比
    // ══════════════════════════════════════════════════════════════════════════
    it('G348 —— 卡型配比符合 `docs/card-distribution.md` §5.1.1 的两条判据', () => {
      assertDistributionMatchesShare(counts, unitNumber, entries.length)
    })

    it('🚨 反向自测（M424）：把一张关键词卡挪成别的族 ⇒ 逐族误差那条必须红', () => {
      // ⚠️ **夹具必须「总量守恒」** —— 否则判据的第一条（总量守恒）会先炸，
      //   这条反向自测就变成「被别的断言撑起来的假通过」（R-51）。
      const violated = { ...counts }
      violated.keyword -= 1
      violated.response += 1

      expect(
        () => assertDistributionMatchesShare(violated, unitNumber, entries.length),
        '判据在「逐族误差 > 0.5 张」的违规夹具上没红 ⇒ 判据本身失效',
      ).toThrow('逐族误差超过 0.5 张')
    })

    // ══════════════════════════════════════════════════════════════════════════
    // G349 —— 逐卡选项数 === 档位规则
    // ══════════════════════════════════════════════════════════════════════════
    it('G349 —— 每张卡的选项数与规则算出的目标值一致（逐卡核对，零容差）', () => {
      assertOptionCountsMatchRule(entries, unitNumber)
    })

    it('🚨 反向自测（M425）：给一张卡多塞一个选项 ⇒ 判据本体必须红', () => {
      const first = entries[0]!
      const padded = {
        ...first,
        card: { ...first.card, options: [...first.card.options, first.card.options[0]!] },
      }

      expect(
        () => assertOptionCountsMatchRule([padded], unitNumber),
        '判据在「多一个选项」的违规夹具上没红 ⇒ 判据本身失效（它可能恒真）',
      ).toThrow('而规则说单元')
    })

    // ══════════════════════════════════════════════════════════════════════════
    // G350 —— 选项指针 / 唯一正确项 / 回应卡不自己答自己
    // ══════════════════════════════════════════════════════════════════════════
    it('G350 —— 每个选项都指向本单元真实存在的词条，且每张卡恰有一个正确项', () => {
      assertOptionPointersResolve(entries, unitNumber)
      assertTowersAndAnswersAreWellFormed(entries)
    })

    it('🚨 反向自测（M426）：把一个选项指向本单元不存在的词条 ⇒ 判据本体必须红', () => {
      const first = entries[0]!
      const violated = [
        {
          ...first,
          card: {
            ...first.card,
            options: first.card.options.map((option, index) =>
              index === 0 ? { ...option, id: `u${unitNumber}-does-not-exist` } : option,
            ),
          },
        },
      ]

      expect(
        () => assertOptionPointersResolve(violated, unitNumber),
        '判据在「选项指向不存在的词条」的违规夹具上没红 ⇒ 判据本身失效',
      ).toThrow('指向不存在的词条')
    })

    it('🚨 反向自测：一张卡有两个正确项 ⇒ 「恰好一个」那半必须红', () => {
      const violated = entries.map((entry, index) =>
        index === 0
          ? {
              ...entry,
              card: {
                ...entry.card,
                options: entry.card.options.map((option, optionIndex) => ({
                  ...option,
                  correct: optionIndex < 2,
                })),
              },
            }
          : entry,
      )

      expect(
        () => assertTowersAndAnswersAreWellFormed(violated),
        '判据在「两个正确项」的违规夹具上没红 ⇒ 「恰好一个」只守住了「至少一个」这一半',
      ).toThrow('正确项数量不是 1')
    })

    // ══════════════════════════════════════════════════════════════════════════
    // G351 / G352 —— 回应卡的正确选项必须语义应答
    // ══════════════════════════════════════════════════════════════════════════
    it('G352 —— 回应卡的正确选项指向本单元教过的那一句（且不是它自己）', () => {
      assertResponseAnswersAreWellFormed(entries, answerableSentencesOf(unitNumber))
    })

    it('🚨 反向自测（M428）：把一张回应卡的正确选项改成题面自己 ⇒ 判据本体必须红', () => {
      const response = entries.find((entry) => entry.card.kind === 'response')
      expect(response, '本单元没有回应卡 —— 这条反向自测空转了').toBeDefined()
      if (response === undefined) return

      const violated = entries.map((entry) =>
        entry.entryId === response.entryId
          ? {
              ...entry,
              card: {
                ...entry.card,
                options: entry.card.options.map((option, index) =>
                  index === 0 ? { ...option, id: entry.entryId } : option,
                ),
              },
            }
          : entry,
      )

      expect(
        () => assertResponseAnswersAreWellFormed(violated, answerableSentencesOf(unitNumber)),
        '判据在「正确选项就是题面自己」的违规夹具上没红 ⇒ 判据本身失效',
      ).toThrow('就是它自己的卡面')
    })

    // ══════════════════════════════════════════════════════════════════════════
    // G353 —— 塔型按词条下标轮转
    // ══════════════════════════════════════════════════════════════════════════
    it('G353 —— 塔型按词条下标轮转 `direct` / `slow` / `aoe`', () => {
      assertTowerTypesRotate(entries)
    })

    it('🚨 反向自测（M429）：把一条词条的塔型改掉 ⇒ 判据本体必须红', () => {
      const violated = entries.map((entry, index) =>
        index === 0 ? { ...entry, towerType: 'aoe' as const } : entry,
      )

      expect(
        () => assertTowerTypesRotate(violated),
        '判据在「塔型被改掉」的违规夹具上没红 ⇒ 判据本身失效',
      ).toThrow('按轮转规则')
    })

    // ══════════════════════════════════════════════════════════════════════════
    // G279 —— id 前缀与 `entryId === wordId`（共用判据，编号不变）
    // ══════════════════════════════════════════════════════════════════════════
    it('G279 —— 所有 entryId 都带本单元前缀，且 wordId === entryId，且 id 互不重复', () => {
      assertIdsAreWellFormed(entries, unitNumber)
    })

    it('🚨 反向自测：wordId ≠ entryId ⇒ 判据本体必须红', () => {
      const violated = [{ ...entries[0]!, wordId: `u${unitNumber}-something-else` }]

      expect(
        () => assertIdsAreWellFormed(violated, unitNumber),
        '判据在「wordId ≠ entryId」的违规夹具上没红 ⇒ 判据本身失效',
      ).toThrow('wordId 与 entryId 不一致')
    })
  })
}
