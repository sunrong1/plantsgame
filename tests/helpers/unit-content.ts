/**
 * 「一个单元的内容是否符合内容规则」这组判据的**唯一**出处。
 *
 * ── 为什么抽出来（Story 2.6 / Task 5.1）─────────────────────────────────────
 *   这些判据原先是 `tests/content/unit-02.test.ts` 里的**模块私有函数**
 *   （卡型配比 / id 前缀 / 塔型与正确项 / 选项指针），
 *   而 Story 2.6 要给单元 3–7 各写一份同款守卫。
 *   ⇒ 两个选择：
 *     ① 复制五份到五个测试文件里 ⇒ **五条复制链**（R-37）——
 *        五份判据会漂移，改了规则只改一份 ⇒ 其余四份恒绿。
 *     ② 抽到这里共用 ⇒ 一处改，五处生效。
 *   ⇒ 选 ②。
 *   ⚠️ **G278–G282 的编号与含义一个字没变** —— 判据只是**搬了家**（R-36 的编号连续性）。
 *
 * ── 判据纪律（R-51）────────────────────────────────────────────────────────
 *   每条判据本体都是**函数**（吃数据、吐违规或抛断言），
 *   正向用例与**反向自测**调**同一份** ⇒ 判据被掏空时反向自测照样红。
 *   ⚠️ 反向自测必须喂「**整个列表、只坏一处**」的夹具 ——
 *     只喂一条的话，判据的**第一条**（比如「塔型集合 == 三种」）会先炸
 *     ⇒ 反向自测变成「被别的断言撑起来的假通过」。
 *
 * ── 判据的「口径」全部来自内容层 / 规则层，**不在本文件里重抄数字** ──────────
 *   · 卡型份额来自 `src/content/distribution.ts` 的 `targetCardDistribution`；
 *   · 选项数来自 `src/content/option-count.ts` 的 `targetOptionCount`
 *     （住在 `tests/helpers/option-counts.ts`）；
 *   · 塔型三选一来自 `src/content/schema.ts` 的 `TowerTypeSchema`。
 *   ⇒ 本文件只负责「怎么判」，不负责「判什么值」（R-37）。
 */

import { expect } from 'vitest'

import { targetCardDistribution } from '../../src/content/distribution'
import type { CardKind, DeckEntry, TowerType } from '../../src/content/schema'

// ══════════════════════════════════════════════════════════════════════════════
// 工具
// ══════════════════════════════════════════════════════════════════════════════

/** 三族卡的条数（实测值，不是写死的）。 */
export function countsByKind(list: readonly DeckEntry[]): Record<CardKind, number> {
  const counts: Record<CardKind, number> = { word: 0, keyword: 0, response: 0 }
  for (const entry of list) counts[entry.card.kind] += 1
  return counts
}

/** 本单元的词图目录（图片选项必须落在它里面）。 */
function wordDirOf(unitNumber: number): string {
  return `/assets/words/unit-${String(unitNumber).padStart(2, '0')}/`
}

// ══════════════════════════════════════════════════════════════════════════════
// G278 —— 卡型配比（`docs/card-distribution.md` §5.1.1 的两条判据）
// ══════════════════════════════════════════════════════════════════════════════

/**
 * **G278 的判据本体** —— 两条判据：
 *   ① 总量守恒：`Σ_k c_k === N`；
 *   ② 逐族误差：`|c_k − s_k × N| ≤ 0.5`（0.5 张是「四舍五入到最近整数」的定义，
 *      **不是宽容度**）。
 *
 * ⚠️ **为什么不是零容差**：`docs/card-distribution.md` 给的是**实数份额**，
 *   而内容给的是**整数条数** ⇒ 整数化必然有偏差（§5.1.1 的口径）。
 *   ⇒ 单元 1 是**锚点**（G190 零容差，因为它就是规则由它反推出来的）；
 *     别的单元按这两条判据验，**不**要求 `c_k / N === s_k` ——
 *     那条断言在非锚点单元上**必然**红，且它的红不指向任何真问题。
 */
export function assertDistributionMatchesShare(
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

// ══════════════════════════════════════════════════════════════════════════════
// G279 —— id 前缀与 `entryId === wordId`
// ══════════════════════════════════════════════════════════════════════════════

/** **G279 的判据本体** —— 前缀 + `wordId === entryId` + id 不重复。 */
export function assertIdsAreWellFormed(list: readonly DeckEntry[], unitNumber: number): void {
  const prefix = `u${unitNumber}-`
  for (const entry of list) {
    expect(entry.entryId.startsWith(prefix), `${entry.entryId} 缺单元前缀`).toBe(true)
    expect(entry.wordId, `${entry.entryId} 的 wordId 与 entryId 不一致`).toBe(entry.entryId)
  }
  const ids = list.map((entry) => entry.entryId)
  expect(new Set(ids).size, 'entryId 有重复').toBe(ids.length)
}

// ══════════════════════════════════════════════════════════════════════════════
// G280 —— 塔型合法 + 每张卡恰有一个正确项 + 回应卡不自己答自己
// ══════════════════════════════════════════════════════════════════════════════

/** **G280 的判据本体**。 */
export function assertTowersAndAnswersAreWellFormed(list: readonly DeckEntry[]): void {
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

// ══════════════════════════════════════════════════════════════════════════════
// G281 —— 选项指针必须指向本单元真实存在的词条
// ══════════════════════════════════════════════════════════════════════════════

/** **G281 的判据本体** —— 指针命中 + 图片选项落在**本单元**的词图目录里。 */
export function assertOptionPointersResolve(list: readonly DeckEntry[], unitNumber: number): void {
  const ids = new Set(list.map((entry) => entry.entryId))
  const wordDir = wordDirOf(unitNumber)

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

// ══════════════════════════════════════════════════════════════════════════════
// G353 —— 塔型按词条下标轮转 `direct` / `slow` / `aoe`
// ══════════════════════════════════════════════════════════════════════════════

/**
 * **塔型轮转的顺序**（**唯一**出处 —— 测试里不许再抄一遍）。
 *
 * ⚠️ **为什么要有这条规则**：三种塔型的**手感**不同（直推 / 慢推 / 范围），
 *   而「同一局里连着三道题都是同一种塔」会让这一局的难度曲线走偏。
 *   ⇒ 规定：**按词条在单元里的下标**轮转 —— `index % 3` ⇒ 0 = direct、1 = slow、2 = aoe。
 */
export const TOWER_ROTATION: readonly TowerType[] = ['direct', 'slow', 'aoe']

/**
 * **G353 的判据本体** —— 第 `i` 条词条的塔型必须等于 `TOWER_ROTATION[i % 3]`。
 *
 * ⚠️ **下标是「单元里的全部词条」的下标**（不是「单词卡的下标」）——
 *   句子卡也占位，否则单词卡与句子卡各转各的，同一局里的塔型序列仍然是乱的。
 */
export function assertTowerTypesRotate(list: readonly DeckEntry[]): void {
  list.forEach((entry, index) => {
    const want = TOWER_ROTATION[index % TOWER_ROTATION.length]!
    expect(
      entry.towerType,
      `${entry.entryId}（本单元第 ${index + 1} 条）的塔型是 ${entry.towerType}，` +
        `而按轮转规则（第 ${index + 1} 条）应当是 ${want} —— ` +
        '三种塔型必须按词条下标轮转，否则同一局里的难度曲线会走偏',
    ).toBe(want)
  })
}

// ══════════════════════════════════════════════════════════════════════════════
// G352 —— 回应卡的正确选项必须**语义应答**
// ══════════════════════════════════════════════════════════════════════════════

/**
 * **G352 的判据本体**（**机器可判的那一半**）。
 *
 * ⚠️ **「语义应答」这件事本身判不了**（要人读句子才知道答得对不对）⇒
 *   这里只守**机器能回答的四条**：
 *   ① 正确选项的 id **不是**这张卡自己（否则孩子点「重复听到的那句」即可）；
 *   ② 正确选项的 id **指向本单元真实存在的词条**；
 *   ③ 正确选项指向的那条词条的题面 ∈ **本单元可用作应答的句子集合**
 *      （教材句型 + 自写句，由调用方算好传进来）；
 *   ④ 正确选项的题面 **≠** 本卡的题面（不许拿题面自己当答案）。
 *
 * @param list 被查单元的全部词条
 * @param answerableSentences 「可以当应答的句子」集合（**归一化后**）
 */
export function assertResponseAnswersAreWellFormed(
  list: readonly DeckEntry[],
  answerableSentences: ReadonlySet<string>,
): void {
  const byId = new Map(list.map((entry) => [entry.entryId, entry]))

  for (const entry of list.filter((item) => item.card.kind === 'response')) {
    const correct = entry.card.options.find((option) => option.correct)
    if (correct === undefined) {
      expect.fail(`${entry.entryId} 没有正确项 —— 回应卡必须有且仅有一个正确项`)
    }

    expect(
      correct.id !== entry.entryId,
      `${entry.entryId} 的正确选项就是它自己的卡面 ⇒ 孩子点「重复听到的那句」即可，无需理解`,
    ).toBe(true)

    const target = byId.get(correct.id)
    expect(target, `${entry.entryId} 的正确选项 ${correct.id} 不在本单元的词条里`).toBeDefined()
    if (target === undefined) continue

    const answerText = normalizeSentence(target.card.promptText)
    expect(
      answerableSentences.has(answerText),
      `${entry.entryId} 的正确选项指向 ${correct.id}，它的题面「${target.card.promptText}」` +
        '不在本单元可用作应答的句子集合里 —— 回应卡必须应答一句**本单元教过的**话',
    ).toBe(true)

    expect(
      answerText !== normalizeSentence(entry.card.promptText),
      `${entry.entryId} 的正确选项的题面与本卡题面相同 —— 孩子点什么都一样`,
    ).toBe(true)
  }
}

/**
 * 句子归一化（**去标点 + 折叠空白 + 小写**）。
 *
 * ⚠️ 与 `tests/helpers/textbook-corpus.ts` 的 `normalizeEnglish` **同口径** ——
 *   但**故意不共用**：那边是「教材 ↔ 卡面」的比对，这边是「卡面 ↔ 卡面」的比对，
 *   而教材解析器的归一化口径（去撇号）是**教材转写**的排版缺陷带来的补丁，
 *   不该被「卡面 ↔ 卡面」继承（两处各自演进、互不拖累）。
 */
export function normalizeSentence(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.!?,;:"'’`()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
