/**
 * 单元 2 真实内容的守卫（Story 2.5 / Task 6.1；AC-6.1）。
 *
 * ── 守什么 ────────────────────────────────────────────────────────────────
 * 单元 2 是**第一个非锚点**的单元（锚点是单元 1 与单元 24）⇒
 * 它的内容是「规则落到地上」的第一处实测：
 *   · **G278** 卡型配比符合 `docs/card-distribution.md` §5.1.1 的**两条判据**
 *     （总量守恒 + 逐族误差 ≤ 0.5 张）—— **内容层与校验器都不守这一条**；
 *   · **G279** id 前缀与 `entryId === wordId`；
 *   · **G280** 塔型合法 + 每张卡恰有一个正确项 + 回应卡不自己答自己；
 *   · **G281** 每个选项都指向**本单元真实存在的词条**（含图片选项的目录归属）；
 *   · **G282** 逐卡选项数 === 档位规则（G264 的单元 2 版，判据**共用**）。
 *
 * ── 为什么每条守卫都有「反向自测」 ──────────────────────────────────────────
 *   `src/content/schema.ts` 的 `UnitSchema.superRefine` 已经是一道**载入期闸门**：
 *   前缀、词条 id 重复、悬空选项、选项形态、正确项个数 —— 违反其中任何一条，
 *   `getUnit(2)` 当场抛错、**整个测试文件根本起不来**。
 *   ⇒ 那些性质在**内容层**就已经 fail-fast，本文件的对应断言是**第二道**。
 *   ⚠️ **第二道不等于装饰**：判据本体是**函数**，每条守卫都配一条
 *     「把违规形态真写进去，断言判据会红」的反向自测（R-51）——
 *     反向自测**真的调用判据本体**，所以判据被掏空时它照样红。
 *   ⇒ 这样才能证明每条判据**有牙齿**，而不只是证明「内容层挡住了」。
 *
 * ── 为什么配比判据**不是**「与连续份额零容差」 ─────────────────────────────
 *   单元 1 的 G190 是零容差，因为它就是**锚点**（规则由它实测反推）。
 *   单元 2 不是锚点 ⇒ 规则给的是**实数份额**，而内容给的是**整数条数**
 *   ⇒ 整数化必然有偏差（§5.1.1 的口径）。
 *   ⇒ 这里按 §5.1.1 的两条判据验（`|c_k − s_k × N| ≤ 0.5`），
 *     **不**要求 `c_k / N === s_k` —— 那条断言在单元 2 上**必然**红，
 *     且它的红不指向任何真问题。
 *
 * ── 为什么选项数判据**共用**而不是复制 ─────────────────────────────────────
 *   `assertOptionCountsMatchRule` 原先是 `unit-01.test.ts` 的**模块私有**函数 ——
 *   复制一份到本文件就是一条复制链（R-37）：两份会漂移，改了规则只改一份
 *   ⇒ 单元 2 那份恒绿。⇒ 已抽到 `tests/helpers/option-counts.ts`，两边共用。
 */

import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { createInitialState } from '../../src/core/reducer'
import { getUnit } from '../../src/content'
import { targetCardDistribution } from '../../src/content/distribution'
import { UnitSchema } from '../../src/content/schema'
import type { CardKind, DeckEntry } from '../../src/content/schema'
import { assertOptionCountsMatchRule } from '../helpers/option-counts'
import { assertVoiceAssetsMatchEntries, readVoiceAssets } from '../helpers/voice-assets'

const unit = getUnit(2)
const entries = unit.entries

/** 三族卡的条数（实测值，不是写死的）。 */
function countsByKind(list: readonly DeckEntry[]): Record<CardKind, number> {
  const counts: Record<CardKind, number> = { word: 0, keyword: 0, response: 0 }
  for (const entry of list) counts[entry.card.kind] += 1
  return counts
}

// ══════════════════════════════════════════════════════════════════════════════
// G278 —— 卡型配比（§5.1.1 的两条判据）
// ══════════════════════════════════════════════════════════════════════════════

/**
 * **G278 的判据本体** —— 抽成函数，正向用例与反向自测**都调它**。
 *
 * ⚠️ 判据必须是函数而不是某条 `it` 的循环体：反向自测要能「把违规形态真写进去，
 *   断言这条守卫会红」—— 若判据只存在于循环体里，反向自测够不着它
 *   （只能另写一份手写比较，于是判据被改坏时反向自测照样绿 —— 本仓已知的假绿形态）。
 *
 * ⚠️ 两条判据**逐字取自 `docs/card-distribution.md` §5.1.1**：
 *   ① 总量守恒：`Σ_k c_k === N`；
 *   ② 逐族误差：`|c_k − s_k × N| ≤ 0.5`（0.5 张是「四舍五入到最近整数」的定义，
 *      **不是宽容度**）。
 */
function assertDistributionMatchesShare(
  counts: Record<CardKind, number>,
  unitNumber: number,
  total: number,
): void {
  const dist = targetCardDistribution(unitNumber)
  const sum = counts.word + counts.keyword + counts.response

  expect(
    sum,
    `总量不守恒：word ${counts.word} + keyword ${counts.keyword} + response ${counts.response} ` +
      `= ${sum}，而本单元有 ${total} 条 —— 少一条就有一条词条没被编排进去`,
  ).toBe(total)

  for (const kind of ['word', 'keyword', 'response'] as const) {
    const target = dist[kind] * total
    expect(
      Math.abs(counts[kind] - target),
      `${kind} 族录了 ${counts[kind]} 条，而规则算出来的是 ${target.toFixed(3)} 条 ` +
        `（份额 ${(dist[kind] * 100).toFixed(3)}% × ${total}）—— 逐族误差超过 0.5 张，` +
        '请按 §5.1.1 的最大余数法重新取整',
    ).toBeLessThanOrEqual(0.5)
  }
}

describe('G278 —— 卡型配比符合 §5.1.1 的两条判据（单元 2 = 11 条：4 / 2 / 5）', () => {
  it('单元 2 恰有 11 条词条，构成 4 词 + 2 关键词 + 5 回应', () => {
    // ⚠️ 2026-10-26（Story 2.10 换源批次）：38 → 11。
    //   单元 2 的内容**整体换成教材**（一起版 1A Unit 2 `My classmates`）——
    //   `Look and learn` 只有 **4 个词**（`book` / `ruler` / `pencil` / `rubber`），
    //   `Say and act` 有 **7 个不同句子**（`Here you are.` 与 `Thank you.` 各列两次）
    //   ⇒ 词条 = 4 单词卡 + 2 关键词卡（句中带词的 `Give me a rubber, please.` /
    //   `Give me a ruler, please.`）+ 5 回应卡 = **11 条**，教材 7 句**一句不剩**。
    expect(entries.length, '词条数变了 —— 教材该单元是 4 词 + 7 句，换源后规模就是 11').toBe(11)

    const counts = countsByKind(entries)
    expect(counts.word, '教材 1A Unit 2 的 `Look and learn` 有 4 个词，一词不落').toBe(4)
    expect(counts.keyword, '教材该单元只有 2 句句中带词（rubber / ruler）').toBe(2)
    expect(counts.response, '教材该单元 7 句里 2 句当关键词卡、5 句当回应卡').toBe(5)
  })

  it('总量守恒 + 逐族误差 ≤ 0.5 张', () => {
    assertDistributionMatchesShare(countsByKind(entries), 2, entries.length)
  })

  it('🚨 反向自测：把一张单词卡挪成关键词卡 ⇒ 判据本体必须红', () => {
    // ⚠️ R-51：判据必须真能咬住它要防的违规。
    //   违规夹具 = { word: 3, keyword: 3, response: 5 }（总量守恒 = 11，
    //   但 word 族误差 |3 − 3.6268| = 0.6268 > 0.5 ⇒ 逐族误差那条必须炸）。
    const violated = { word: 3, keyword: 3, response: 5 }

    expect(
      () => assertDistributionMatchesShare(violated, 2, 11),
      '判据在「逐族误差 > 0.5 张」的违规夹具上没红 ⇒ 判据本身失效（它可能恒真）',
    ).toThrow('逐族误差超过 0.5 张')
  })

  it('🚨 反向自测：少录一条 ⇒ 总量守恒那条必须红', () => {
    const violated = { word: 4, keyword: 2, response: 4 }

    expect(
      () => assertDistributionMatchesShare(violated, 2, 11),
      '判据在「总量不守恒」的违规夹具上没红 ⇒ 总量那条判据失效',
    ).toThrow('总量不守恒')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// G279 —— id 前缀与 entryId === wordId
// ══════════════════════════════════════════════════════════════════════════════

/** **G279 的判据本体** —— 正向用例与反向自测都调它。 */
function assertIdsAreWellFormed(list: readonly DeckEntry[], unitNumber: number): void {
  const prefix = `u${unitNumber}-`
  for (const entry of list) {
    expect(entry.entryId.startsWith(prefix), `${entry.entryId} 缺单元前缀`).toBe(true)
    expect(entry.wordId, `${entry.entryId} 的 wordId 与 entryId 不一致`).toBe(entry.entryId)
  }
  const ids = list.map((entry) => entry.entryId)
  expect(new Set(ids).size, 'entryId 有重复').toBe(ids.length)
}

describe('G279 —— id 前缀与 entryId === wordId', () => {
  it('所有 entryId 都带 u2- 前缀，且 wordId === entryId，且 id 互不重复', () => {
    assertIdsAreWellFormed(entries, 2)
  })

  it('🚨 反向自测：wordId ≠ entryId ⇒ 判据本体必须红', () => {
    // ⚠️ **这一条是 schema 挡不住的**：schema 只查 wordId 的**前缀**，
    //   不查它与 entryId 是否同一个词 ⇒ 「塔的显示名与词图来源」可以指向另一个词。
    const violated = [{ ...entries[0]!, wordId: 'u2-something-else' }]

    expect(
      () => assertIdsAreWellFormed(violated, 2),
      '判据在「wordId ≠ entryId」的违规夹具上没红 ⇒ 判据本身失效',
    ).toThrow('wordId 与 entryId 不一致')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// G280 —— 塔型合法 + 每张卡恰有一个正确项
// ══════════════════════════════════════════════════════════════════════════════

/** **G280 的判据本体** —— 正向用例与反向自测都调它。 */
function assertTowersAndAnswersAreWellFormed(list: readonly DeckEntry[]): void {
  const towerTypes = new Set(list.map((entry) => entry.towerType))
  expect([...towerTypes].sort(), '塔型集合不对 —— 只有 aoe / direct / slow 三种').toEqual([
    'aoe',
    'direct',
    'slow',
  ])

  for (const entry of list) {
    expect(
      entry.card.options.filter((option) => option.correct).length,
      `${entry.entryId} 的正确项数量不是 1`,
    ).toBe(1)
  }

  for (const entry of list.filter((item) => item.card.kind === 'response')) {
    const correct = entry.card.options.find((option) => option.correct)
    expect(
      correct?.id !== entry.entryId,
      `${entry.entryId} 的正确选项就是它自己的卡面 ⇒ 孩子点「重复听到的那句」即可，无需理解`,
    ).toBe(true)
  }
}

describe('G280 —— 塔型合法，且每张卡恰有一个正确项', () => {
  it('三种塔型都出现，且每张卡恰好一个正确项', () => {
    assertTowersAndAnswersAreWellFormed(entries)
  })

  it('🚨 反向自测：一张卡没有正确项 ⇒ 判据本体必须红', () => {
    // ⚠️ **夹具必须是「整个列表、只坏一张卡」**，不能只喂一张卡 ——
    //   判据本体的**第一条**是「塔型集合 == 三种」，只喂一张卡会在那里先炸
    //   ⇒ 反向自测就变成「被别的断言撑起来的假通过」（R-51）。
    //   ⇒ 断言里带**消息片段**（`toThrow('正确项数量不是 1')`），
    //   逼它必须**在正确项那条上**炸。
    const violated = entries.map((entry, index) =>
      index === 0
        ? {
            ...entry,
            card: {
              ...entry.card,
              options: entry.card.options.map((option) => ({ ...option, correct: false })),
            },
          }
        : entry,
    )

    expect(
      () => assertTowersAndAnswersAreWellFormed(violated),
      '判据在「没有正确项」的违规夹具上没红 ⇒ 判据本身失效',
    ).toThrow('正确项数量不是 1')
  })

  it('🚨 反向自测：一张卡有**两个**正确项 ⇒ 判据本体必须红', () => {
    // ⚠️ **这一条是补上的**：变异实测（M330）发现，只覆盖「0 个正确项」时，
    //   把判据从「恰好 1 个」放松成「至少 1 个」**照样全绿**
    //   —— 守卫的另一半（「不能有两个」）当时**没人守着**。
    //   ⇒ 「恰好一个」有**两个**失败方向，反向自测必须**两个方向都喂**。
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
})

// ══════════════════════════════════════════════════════════════════════════════
// G281 —— 选项指针必须指向本单元真实存在的词条
// ══════════════════════════════════════════════════════════════════════════════

/** **G281 的判据本体** —— 正向用例与反向自测都调它。 */
function assertOptionPointersResolve(list: readonly DeckEntry[], unitNumber: number): void {
  const ids = new Set(list.map((entry) => entry.entryId))
  const wordDir = `/assets/words/unit-${String(unitNumber).padStart(2, '0')}/`

  for (const entry of list) {
    for (const option of entry.card.options) {
      expect(ids.has(option.id), `${entry.entryId} 的选项 ${option.id} 指向不存在的词条`).toBe(true)
      if (!('imageSrc' in option)) continue
      expect(
        option.imageSrc.startsWith(wordDir),
        `${entry.entryId} 的选项 ${option.id} 的图片路径 ${option.imageSrc} 不在本单元的词图目录里`,
      ).toBe(true)
    }
  }
}

describe('G281 —— 每个选项都指向本单元真实存在的词条', () => {
  it('选项指针全部命中，且图片选项指向本单元自己的词图目录', () => {
    assertOptionPointersResolve(entries, 2)
  })

  it('句子层的卡（回应 / 关键词）也全部命中 —— 文字选项的指针同样要真', () => {
    const sentenceCards = entries.filter((entry) => entry.card.kind !== 'word')
    expect(sentenceCards.length, '本单元没有句子层的卡 —— 这一条是空的').toBeGreaterThan(0)

    const ids = new Set(entries.map((entry) => entry.entryId))
    for (const entry of sentenceCards) {
      for (const option of entry.card.options) {
        expect(ids.has(option.id), `${entry.entryId} 的选项 ${option.id} 指向不存在的词条`).toBe(true)
      }
    }
  })

  it('🚨 反向自测：一个选项指向不存在的词条 ⇒ 判据本体必须红', () => {
    const first = entries[0]!
    const violated = [
      {
        ...first,
        card: {
          ...first.card,
          options: first.card.options.map((option, index) =>
            index === 0 ? { ...option, id: 'u2-does-not-exist' } : option,
          ),
        },
      },
    ]

    expect(
      () => assertOptionPointersResolve(violated, 2),
      '判据在「选项指向不存在的词条」的违规夹具上没红 ⇒ 判据本身失效',
    ).toThrow('指向不存在的词条')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// G282 —— 逐卡选项数 === 档位规则（G264 的单元 2 版）
// ══════════════════════════════════════════════════════════════════════════════

describe('G282 —— 逐卡选项数 === 档位规则（G264 的单元 2 版）', () => {
  it('每张卡的选项数与规则算出的目标值一致（逐卡核对，零容差）', () => {
    assertOptionCountsMatchRule(entries, 2)
  })

  it('🚨 反向自测：给一张卡多塞一个选项 ⇒ 判据本体必须红', () => {
    const first = entries[0]!
    const padded = {
      ...first,
      card: { ...first.card, options: [...first.card.options, first.card.options[0]!] },
    }

    expect(
      () => assertOptionCountsMatchRule([padded], 2),
      '判据在「多一个选项」的违规夹具上没红 ⇒ 判据本身失效（它可能恒真）',
    ).toThrow('而规则说单元 2 的')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// G289 —— 本单元的词条与本单元的录音一一对应
// ══════════════════════════════════════════════════════════════════════════════

/**
 * **G289 的判据本体**在 `tests/helpers/voice-assets.ts`
 * （`assertVoiceAssetsMatchEntries`）—— 单元 1 与单元 2 **共用同一份**（R-37）。
 *
 * ⚠️ 为什么单元 2 需要它：[CR] 2026-10-23 的评审发现，单元 1 的 AC-15 那组断言
 *   （录音条数 / id 集合相等 / 非 0 字节 / manifest 哈希 / 「每条录音都有被朗读的地方」）
 *   原先是 `tests/content/unit-01.test.ts` 的**模块私有代码**，
 *   而单元 2 的测试文件**一条都没写**
 *   ⇒ 单元 2 的录音与词条脱节（少录一条 ⇒ 运行时静默降级到设备 TTS）时**没有任何报错**。
 *   ⇒ 判据抽到共用 helper，两边各调一次。
 *
 * ⚠️ 反向自测喂**假数据**而不是动磁盘：判据本体是纯函数（吃「磁盘事实」作为参数），
 *   所以每一轴都能被单独喂坏，且真能证明它有牙齿（R-51）。
 */
describe('G289 —— 本单元的词条与本单元的录音一一对应', () => {
  const { files, manifest } = readVoiceAssets('u2-')

  it('正向：单元 2 的词条与 u2- 前缀的录音六轴全过', () => {
    assertVoiceAssetsMatchEntries('u2-', entries, files, manifest)
  })

  it('🚨 反向自测：少一条录音 ⇒ 条数那条必须红', () => {
    expect(
      () => assertVoiceAssetsMatchEntries('u2-', entries, files.slice(1), manifest),
      '判据在「少一条录音」的违规夹具上没红 ⇒ 判据本身失效',
    ).toThrow('录音条数与词条数不一致')
  })

  it('🚨 反向自测：录音 id 与词条 id 对不上 ⇒ 集合那条必须红', () => {
    const renamed = files.map((file, index) => (index === 0 ? { ...file, id: 'u2-renamed' } : file))

    expect(
      () => assertVoiceAssetsMatchEntries('u2-', entries, renamed, manifest),
      '判据在「录音 id 与词条 id 不一致」的违规夹具上没红 ⇒ 判据本身失效',
    ).toThrow('内容与录音不一致')
  })

  it('🚨 反向自测：0 字节的录音 ⇒ 非空那条必须红', () => {
    const zeroed = files.map((file, index) => (index === 0 ? { ...file, bytes: 0 } : file))

    expect(
      () => assertVoiceAssetsMatchEntries('u2-', entries, zeroed, manifest),
      '判据在「0 字节录音」的违规夹具上没红 ⇒ 判据本身失效',
    ).toThrow('是 0 字节')
  })

  it('🚨 反向自测：录音内容与 manifest 不符 ⇒ 哈希那条必须红', () => {
    const tampered = files.map((file, index) =>
      index === 0 ? { ...file, sha256: '0000000000000000000000000000000000000000000000000000000000000000' } : file,
    )

    expect(
      () => assertVoiceAssetsMatchEntries('u2-', entries, tampered, manifest),
      '判据在「内容与 manifest 不符」的违规夹具上没红 ⇒ 判据本身失效',
    ).toThrow('内容与 manifest 不符')
  })

  it('🚨 反向自测：录音文本在任何卡面上都不出现 ⇒ 孤儿录音那条必须红', () => {
    const first = files[0]!
    const original = manifest.entries[first.id]!
    const tamperedManifest = {
      entries: { ...manifest.entries, [first.id]: { ...original, text: 'ZZZ-not-on-any-card' } },
    }

    expect(
      () => assertVoiceAssetsMatchEntries('u2-', entries, files, tamperedManifest),
      '判据在「孤儿录音」的违规夹具上没红 ⇒ 判据本身失效',
    ).toThrow('在任何一张卡的卡面上都不出现')
  })

  it('🚨 反向自测：卡面文字与录音文本不一致 ⇒ 第 ⑥ 轴必须红', () => {
    // ⚠️ 夹具要**交换**两张卡的卡面文字，而不是改掉一张 ——
    //   改掉一张会让「tiger」这个词从卡面上消失 ⇒ 第 ⑤ 轴（孤儿录音）**先**炸，
    //   断言就变成「被别的断言撑起来的假通过」（R-51）。
    //   ⇒ 交换 ⇒ 卡面文字的**集合**不变 ⇒ 第 ⑤ 轴照过，第 ⑥ 轴才炸。
    const i = entries.findIndex((entry) => entry.card.promptText !== entries[1]!.card.promptText)
    const j = i === 0 ? 1 : 0
    const swapped = entries.map((entry, index) => {
      if (index === i) return { ...entry, card: { ...entry.card, promptText: entries[j]!.card.promptText } }
      if (index === j) return { ...entry, card: { ...entry.card, promptText: entries[i]!.card.promptText } }
      return entry
    })

    expect(
      () => assertVoiceAssetsMatchEntries('u2-', swapped, files, manifest),
      '判据在「卡面文字与录音不一致」的违规夹具上没红 ⇒ 判据本身失效',
    ).toThrow('卡面文字与录音内容不一致')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 内容层自身的一致性（单元 2）
// ══════════════════════════════════════════════════════════════════════════════

describe('内容层自身的一致性（单元 2）', () => {
  it('unit-02.json 本身能通过 UnitSchema（数据与 schema 没有脱节）', () => {
    const raw = JSON.parse(
      readFileSync(new URL('../../src/content/units/unit-02.json', import.meta.url), 'utf8'),
    )
    const parsed = UnitSchema.safeParse(raw)

    expect(parsed.success, 'unit-02.json 过不了 schema ⇒ index.ts 的启动校验会在运行时炸').toBe(true)
  })

  it('内容导出的 deck 能直接喂给回合层（AC-9）', () => {
    const state = createInitialState({ unitNumber: 2, deck: entries })

    expect(state.deck.length).toBe(entries.length)
    expect(state.unitNumber).toBe(2)
  })
})
