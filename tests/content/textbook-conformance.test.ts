/**
 * 教材一致性守卫 **G335 – G338**（Story 2.10 换源批次）。
 *
 * ── 守什么 ────────────────────────────────────────────────────────────────
 *   单元 1 / 2 的内容**整体换成教材**（一起版 1A Unit 1 / Unit 2）之后，
 *   「换源」这件事本身需要**机器守卫**。没有它们，「换源」只是一次人工替换 ——
 *   下次有人改 JSON，内容会悄悄漂回自建词表，而**没有任何报错**。
 *
 *   · **G335** —— 单词卡的题面词 === 教材该单元 `Look and learn` 的词表
 *     （**一条不少、一条不多**，逐词相等）。
 *   · **G336** —— 句子卡的题面（归一化后）全部取自教材该单元 `Say and act`
 *     的句子集合；**且**教材的每一个句子都被用到（**一条不剩**）。
 *   · **G337** —— 旧自建词表**零残留**（作废 id / 作废题面 / 沿用登记）。
 *   · **G338** —— 游戏单元 ↔ 教材单元的**映射**本身被独立钉住。
 *
 * ── 为什么教材要**解析**而不是抄一份（R-37）────────────────────────────────
 *   本文件的全部价值在于「**教材改了它会红**」。
 *   ⇒ 在测试里再抄一份词表 = 第二个事实源 ⇒ 教材改了，抄的那份没改 ⇒ **全绿**。
 *   ⇒ 解析器住在 `tests/helpers/textbook-corpus.ts`（**唯一出处**），
 *     本文件与 `tests/content/card-distribution-doc.test.ts`（G321）**共用同一份**。
 *
 * ── 判据纪律（R-51）────────────────────────────────────────────────────────
 *   每条守卫的判据本体都是**纯函数**（吃数据、吐违规清单），
 *   正向用例与**反向自测**调**同一份**判据 ⇒ 判据被掏空时反向自测照样红。
 *
 * ── 变异验证（R-50）────────────────────────────────────────────────────────
 *   本文件的「变异」按 R-50 的**替代手段**实现：**负向夹具**
 *   （把违规形态喂进判据本体，断言它报出问题）——
 *   判据不依赖源码书写风格、也不靠 `?raw` 读源码 ⇒ 不命中 R-50 的触发条件。
 *   编号与 story 文档 §6.6 的变异表一一对应：
 *     · **M410** → G335：把一条单词卡的题面改成一个教材里没有的词
 *     · **M411** → G336（方向一）：把一条句子卡的题面改掉
 *     · **M412** → G336（方向二）：少用一句教材句子（删掉一张卡）
 *     · **M413** → G337：往内容里塞一个作废 id
 *     · **M415** → G338：把教材映射的册次边界挪一位
 *   ⚠️ **M414**（末锚点改回 30 / 25 / 45 ⇒ G194 红）**不在本文件** ——
 *     它改的是 `src/content/distribution.ts` 的**源码**，走真的变异验证流程
 *     （改坏 → 跑测试 → 复原），结果记在 story 文档的变异矩阵里。
 *
 * 不在 `src/core/` 下 —— NFR16：测试全部在 `tests/`。
 */

import { describe, expect, it } from 'vitest'

import { getUnit } from '../../src/content'
import type { CardKind } from '../../src/content/schema'
import {
  loadTextbookBooks,
  normalizeEnglish,
  textbookUnitOf,
  type TextbookBook,
  type TextbookUnit,
} from '../helpers/textbook-corpus'

const books = loadTextbookBooks()

/** 本 story 覆盖的两个游戏单元。 */
const COVERED_UNITS = [1, 2] as const

// ══════════════════════════════════════════════════════════════════════════════
// 换源前的快照（**作废事实**，但它仍是事实）
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 换源**前**两个单元的全部 75 个词条 id（2026-10-26 快照，`git show HEAD:` 实测）。
 *
 * ⚠️ **黑名单是「换源前的快照」** —— 它记录的是**已作废但确实存在过**的东西。
 *   新增一条就要在这里登记，否则「作废」这件事就没有守卫。
 * ⚠️ **这 75 个里有 6 个在换源后仍然存在**（见 {@link REUSED_ENTRY_IDS}）——
 *   换源是**内容重写**，不是「另起炉灶」：教材里出现的同一句话沿用同一个 id，
 *   便于存档兼容，也便于「这条录音没重录」这件事可核。
 */
const RETIRED_ENTRY_IDS: readonly string[] = [
  // ── 旧单元 1 的 35 个（另 2 个沿用，见 REUSED_ENTRY_IDS）────────────────
  'u1-hello',
  'u1-goodbye',
  'u1-teacher',
  'u1-student',
  'u1-friend',
  'u1-father',
  'u1-mother',
  'u1-brother',
  'u1-sister',
  'u1-cat',
  'u1-dog',
  'u1-rabbit',
  'u1-panda',
  'u1-bird',
  'u1-fish',
  'u1-ball',
  'u1-book',
  'u1-pen',
  'u1-pencil',
  'u1-bag',
  'u1-desk',
  'u1-chair',
  'u1-red',
  'u1-blue',
  'u1-yellow',
  'u1-one',
  'u1-two',
  'u1-three',
  'u1-beautiful',
  'u1-happy',
  'u1-s-i-have-a-ball-for-my-dog',
  'u1-s-how-are-you',
  'u1-s-i-am-fine',
  'u1-s-nice-to-meet-you',
  'u1-s-thank-you',
  // ── 旧单元 2 的 34 个（另 4 个沿用，见 REUSED_ENTRY_IDS）────────────────
  'u2-tiger',
  'u2-monkey',
  'u2-duck',
  'u2-pig',
  'u2-cow',
  'u2-bear',
  'u2-elephant',
  'u2-lion',
  'u2-giraffe',
  'u2-frog',
  'u2-mouse',
  'u2-egg',
  'u2-ice-cream',
  'u2-apple',
  'u2-banana',
  'u2-bread',
  'u2-milk',
  'u2-kite',
  'u2-balloon',
  'u2-clock',
  'u2-drum',
  'u2-crayon',
  'u2-sun',
  'u2-green',
  'u2-pink',
  'u2-four',
  'u2-doctor',
  'u2-driver',
  'u2-goodbye',
  'u2-s-i-see-a-tiger-and-a-dog',
  'u2-s-what-is-it',
  'u2-s-it-is-a-tiger',
  'u2-s-i-am-hungry',
  'u2-s-you-are-welcome',
]

/**
 * 换源前后**都存在**的 6 个词条 id，以及它们**当前**的题面。
 *
 * ⚠️ **这份登记是「沿用」的凭据**：它们出现在作废快照里，却**不算残留** ——
 *   因为换源后的内容里它们承载的是**教材里的同一句话 / 同一个词**。
 *   登记它们的**当前题面** ⇒ 有人悄悄改了题面（却没重录）时，这条守卫会红。
 *   ⚠️ 改题面 = 改录音（**录音不可重生成**，架构 `:425-430`）⇒ 这条不是形式主义。
 * ⚠️ 另 4 个（`u1-s-good-afternoon` / `u2-ruler` / `u2-s-here-you-are` / `u2-s-how-nice`）
 *   的题面**逐字未变** ⇒ 它们的录音**直接复用**；其余 2 个改了题面 ⇒ **重录**。
 */
const REUSED_ENTRY_IDS: Readonly<Record<string, string>> = {
  'u1-s-good-morning': 'Good morning.',
  'u1-s-good-afternoon': 'Good afternoon!',
  'u2-ruler': 'ruler',
  'u2-s-here-you-are': 'Here you are.',
  'u2-s-thank-you': 'Thank you.',
  'u2-s-how-nice': 'How nice!',
}

/**
 * 换源**前**两个单元的 75 条**卡面题面**（2026-10-26 快照）。
 *
 * ⚠️ 这份清单**不直接当黑名单用** —— 里面有 4 条（`Good afternoon!` / `ruler` /
 *   `Here you are.` / `How nice!`）换源后**逐字仍在用**（它们是教材里的同一句 / 同一个词），
 *   直接拉黑会把正确的内容判死。
 * ⇒ 判据在运行时用**教材全集**做一次差集：只禁止「旧自建词表里有、而教材里根本没有」的题面。
 */
const RETIRED_PROMPT_TEXTS: readonly string[] = [
  'Hello',
  'Goodbye',
  'teacher',
  'student',
  'friend',
  'father',
  'mother',
  'brother',
  'sister',
  'cat',
  'dog',
  'rabbit',
  'panda',
  'bird',
  'fish',
  'ball',
  'book',
  'pen',
  'pencil',
  'bag',
  'desk',
  'chair',
  'red',
  'blue',
  'yellow',
  'one',
  'two',
  'three',
  'beautiful',
  'happy',
  'I have a ball for my dog.',
  'How are you?',
  'I am fine, thank you.',
  'Good morning!',
  'Good afternoon!',
  'Nice to meet you.',
  'Thank you!',
  'tiger',
  'monkey',
  'duck',
  'pig',
  'cow',
  'bear',
  'elephant',
  'lion',
  'giraffe',
  'frog',
  'mouse',
  'egg',
  'ice cream',
  'apple',
  'banana',
  'bread',
  'milk',
  'kite',
  'balloon',
  'clock',
  'drum',
  'ruler',
  'crayon',
  'sun',
  'green',
  'pink',
  'four',
  'doctor',
  'driver',
  'Goodbye',
  'I see a tiger and a dog.',
  'What is it?',
  'It is a tiger.',
  'How nice!',
  'I am hungry.',
  'Here you are.',
  'Thank you!',
  'You are welcome.',
]

/** 一册教材的单元数（两册各 12 个 ⇒ 全书 24 关）。 */
const UNITS_PER_BOOK = 12

/** 全书的教材词数（= 全书的单词卡数 = 全书的词图张数）。 */
const TOTAL_TEXTBOOK_WORDS = 97

// ══════════════════════════════════════════════════════════════════════════════
// 判据本体（纯函数）
// ══════════════════════════════════════════════════════════════════════════════

/** 一条内容词条的最小形状（判据只需要 id 与题面）。 */
interface ContentEntry {
  entryId: string
  card: { kind: CardKind; promptText: string }
}

/**
 * **G335 的判据本体** —— 单词卡题面词集合 === 教材词表（一条不少、一条不多）。
 *
 * ⚠️ **两个方向都要报**：只报「多了」会让「少录一个词」静悄悄通过。
 * ⚠️ 比较用**归一化后**的小写词（教材词表全小写；卡面题面也全小写），
 *   但**报错时要打出原文** —— 归一化后的串不好定位。
 */
function findVocabularyViolations(
  actual: readonly string[],
  expected: readonly string[],
): string[] {
  const problems: string[] = []
  const actualSet = new Set(actual.map((word) => word.toLowerCase()))
  const expectedSet = new Set(expected.map((word) => word.toLowerCase()))

  const extra = [...actualSet].filter((word) => !expectedSet.has(word))
  const missing = [...expectedSet].filter((word) => !actualSet.has(word))

  if (extra.length > 0) {
    problems.push(`单词卡里多了教材没有的词：${extra.join('、')}`)
  }
  if (missing.length > 0) {
    problems.push(`教材该单元的词没有全部落地（少 ${missing.join('、')}）`)
  }
  return problems
}

/**
 * **G336 的判据本体** —— 句子卡题面 ⊆ 教材句子，且教材句子一条不剩。
 *
 * ⚠️ **两个方向都必须有**（R-51 第 1 类的反面）：
 *   只守方向一时，「少做一张卡」不会红 —— 教材里那句就悄悄没人问了。
 */
function findSentenceViolations(
  cardPrompts: readonly string[],
  textbookSentences: readonly string[],
): string[] {
  const problems: string[] = []
  const cardSet = new Set(cardPrompts.map((text) => normalizeEnglish(text)))
  const textbookSet = new Set(textbookSentences.map((text) => normalizeEnglish(text)))

  const offTextbook = cardPrompts.filter((text) => !textbookSet.has(normalizeEnglish(text)))
  if (offTextbook.length > 0) {
    problems.push(`句子卡的题面不在教材该单元的句型里：${offTextbook.join('、')}`)
  }
  const unused = [...textbookSet].filter((sentence) => !cardSet.has(sentence))
  if (unused.length > 0) {
    problems.push(`教材该单元有句子一条都没被用到：${unused.join('、')}`)
  }
  return problems
}

/**
 * **G337 的判据本体** —— 旧自建词表零残留。
 *
 * @param entries 被查的内容词条
 * @param forbiddenPrompts 「旧题面里而教材里没有」的那些（运行时算好的差集）
 */
function findRetiredResidue(
  entries: readonly ContentEntry[],
  forbiddenPrompts: ReadonlySet<string>,
): string[] {
  const problems: string[] = []
  const retired = new Set(RETIRED_ENTRY_IDS)
  const present = new Set(entries.map((entry) => entry.entryId))

  for (const entry of entries) {
    if (retired.has(entry.entryId)) {
      problems.push(`作废的词条 id 仍在内容里：${entry.entryId}`)
    }
    const allowed = REUSED_ENTRY_IDS[entry.entryId]
    if (allowed !== undefined && entry.card.promptText !== allowed) {
      problems.push(
        `沿用的词条 ${entry.entryId} 的题面是「${entry.card.promptText}」，登记的是「${allowed}」—— ` +
          '改了题面就要重录（录音不可重生成）',
      )
    }
    if (forbiddenPrompts.has(normalizeEnglish(entry.card.promptText))) {
      problems.push(`旧自建词表的题面仍在内容里：${entry.card.promptText}`)
    }
  }

  for (const id of Object.keys(REUSED_ENTRY_IDS)) {
    if (!present.has(id)) {
      problems.push(`登记为「沿用」的词条 ${id} 不在内容里了 —— 登记已经过期`)
    }
  }
  return problems
}

/**
 * **G338 的判据本体** —— 游戏单元 ↔ 教材单元的映射。
 *
 * @param mapGameUnit 游戏单元号 → 教材里的（册序号，单元号）
 * @param expectedTotalWords 全书教材词数
 */
function findMappingViolations(
  corpus: readonly TextbookBook[],
  mapGameUnit: (gameUnitNumber: number) => { bookIndex: number; unitNo: number },
  expectedTotalWords: number,
): string[] {
  const problems: string[] = []

  for (const book of corpus) {
    if (book.units.length !== UNITS_PER_BOOK) {
      problems.push(`${book.file} 有 ${book.units.length} 个单元，应为 ${UNITS_PER_BOOK} 个`)
    }
  }

  for (let gameUnit = 1; gameUnit <= UNITS_PER_BOOK * corpus.length; gameUnit += 1) {
    const mapped = mapGameUnit(gameUnit)
    const book = corpus[mapped.bookIndex]
    if (book === undefined) {
      problems.push(`游戏单元 ${gameUnit} 映射到了不存在的册（序号 ${mapped.bookIndex}）`)
      continue
    }
    const unit = book.units.find((candidate) => candidate.unitNo === mapped.unitNo)
    if (unit === undefined) {
      problems.push(`游戏单元 ${gameUnit} 映射到 ${book.file} 的 Unit ${mapped.unitNo}，而那里没有这个单元`)
      continue
    }
    // 位置必须**连续**：游戏单元 n 落在全书第 n 个教材单元上。
    const position = mapped.bookIndex * UNITS_PER_BOOK + mapped.unitNo
    if (position !== gameUnit) {
      problems.push(
        `游戏单元 ${gameUnit} 落在全书第 ${position} 个教材单元上（${book.file} Unit ${mapped.unitNo}）—— ` +
          '册次边界错位',
      )
    }
  }

  const total = corpus.reduce(
    (sum, book) => sum + book.units.reduce((inner, u) => inner + u.vocabulary.length, 0),
    0,
  )
  if (total !== expectedTotalWords) {
    problems.push(`两册的词数合计是 ${total}，应为 ${expectedTotalWords}`)
  }
  return problems
}

// ══════════════════════════════════════════════════════════════════════════════
// 工具
// ══════════════════════════════════════════════════════════════════════════════

/** 某单元的**单词卡**题面词（归一化：小写 + 去首尾空白）。 */
function wordCardPrompts(entries: readonly ContentEntry[]): string[] {
  return entries
    .filter((entry) => entry.card.kind === 'word')
    .map((entry) => entry.card.promptText.trim().toLowerCase())
}

/** 某单元的**句子卡**题面（关键词卡 + 回应卡）。 */
function sentenceCardPrompts(entries: readonly ContentEntry[]): string[] {
  return entries
    .filter((entry) => entry.card.kind !== 'word')
    .map((entry) => entry.card.promptText.trim())
}

/** 某单元的教材句型（去重后）。 */
function distinctTextbookSentences(unit: TextbookUnit): string[] {
  return [...new Set(unit.sentences)]
}

/** 教材**全集**（24 个单元）的词汇与句型，归一化后放进一个集合。 */
function textbookAllText(): Set<string> {
  const all = new Set<string>()
  for (const book of books) {
    for (const unit of book.units) {
      for (const word of unit.vocabulary) all.add(normalizeEnglish(word))
      for (const sentence of unit.sentences) all.add(normalizeEnglish(sentence))
    }
  }
  return all
}

/**
 * 「旧题面里、而教材里根本没有」的那批（= 真正该禁的旧自建词表）。
 *
 * ⚠️ 这份差集**在运行时算** ⇒ 教材改了它跟着变 ⇒ 不会变成「过期黑名单」。
 */
function forbiddenRetiredPrompts(): Set<string> {
  const textbook = textbookAllText()
  const forbidden = new Set<string>()
  for (const text of RETIRED_PROMPT_TEXTS) {
    const normalized = normalizeEnglish(text)
    if (!textbook.has(normalized)) forbidden.add(normalized)
  }
  return forbidden
}

// ══════════════════════════════════════════════════════════════════════════════
// G335
// ══════════════════════════════════════════════════════════════════════════════

describe('G335 —— 单词卡题面词 === 教材该单元 `Look and learn` 的词表', () => {
  for (const unitNumber of COVERED_UNITS) {
    it(`单元 ${unitNumber}：一条不少、一条不多`, () => {
      const entries = getUnit(unitNumber).entries
      const textbook = textbookUnitOf(unitNumber, books).unit.vocabulary

      expect(
        findVocabularyViolations(wordCardPrompts(entries), textbook),
        `单元 ${unitNumber} 的单词卡与教材 1A Unit ${unitNumber} 的词表对不上 —— ` +
          '换源批次要求「逐词一致」，少一条是漏录，多一条是造词',
      ).toEqual([])
    })
  }

  it('🚨 反向自测（M410）：把一条单词卡的题面改成一个教材里没有的词 ⇒ 判据本体必须红', () => {
    const entries = getUnit(1).entries
    const textbook = textbookUnitOf(1, books).unit.vocabulary
    const mutated = wordCardPrompts(entries).map((word, index) =>
      index === 0 ? 'teacher' : word,
    )

    expect(
      findVocabularyViolations(mutated, textbook).length,
      '判据在「多一个教材里没有的词」的违规夹具上没红 ⇒ 判据本身失效（它可能恒真）',
    ).toBeGreaterThan(0)
  })

  it('🚨 反向自测：少录一个教材里的词 ⇒ 判据本体必须红（两个方向都要有）', () => {
    const entries = getUnit(1).entries
    const textbook = textbookUnitOf(1, books).unit.vocabulary
    const mutated = wordCardPrompts(entries).slice(1)

    expect(
      findVocabularyViolations(mutated, textbook).length,
      '判据在「少一个教材里的词」的违规夹具上没红 ⇒ 判据只守了「多了」那一半',
    ).toBeGreaterThan(0)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// G336
// ══════════════════════════════════════════════════════════════════════════════

describe('G336 —— 句子卡题面取自教材 `Say and act`，且教材句子一条不剩', () => {
  for (const unitNumber of COVERED_UNITS) {
    it(`单元 ${unitNumber}：方向一（题面取自教材）+ 方向二（教材句子一条不剩）`, () => {
      const entries = getUnit(unitNumber).entries
      const textbook = distinctTextbookSentences(textbookUnitOf(unitNumber, books).unit)

      expect(
        findSentenceViolations(sentenceCardPrompts(entries), textbook),
        `单元 ${unitNumber} 的句子卡与教材 1A Unit ${unitNumber} 的句型对不上 —— ` +
          '「取自教材」与「一条不剩」两个方向都必须成立',
      ).toEqual([])
    })
  }

  it('🚨 反向自测（M411）：把一条句子卡的题面改掉 ⇒ 方向一必须红', () => {
    const entries = getUnit(1).entries
    const textbook = distinctTextbookSentences(textbookUnitOf(1, books).unit)
    const mutated = sentenceCardPrompts(entries).map((text, index) =>
      index === 0 ? 'How are you?' : text,
    )

    const problems = findSentenceViolations(mutated, textbook)
    expect(
      problems.some((problem) => problem.includes('不在教材该单元的句型里')),
      `判据在「题面不在教材里」的违规夹具上没红 ⇒ 方向一失效。实际报出：${problems.join(' / ')}`,
    ).toBe(true)
  })

  it('🚨 反向自测（M412）：少用一句教材句子（删掉一张卡）⇒ 方向二必须红', () => {
    const entries = getUnit(2).entries
    const textbook = distinctTextbookSentences(textbookUnitOf(2, books).unit)
    const mutated = sentenceCardPrompts(entries).filter((text) => text !== 'How nice!')

    const problems = findSentenceViolations(mutated, textbook)
    expect(
      problems.some((problem) => problem.includes('一条都没被用到')),
      `判据在「教材句子没人用」的违规夹具上没红 ⇒ 方向二失效。实际报出：${problems.join(' / ')}`,
    ).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// G337
// ══════════════════════════════════════════════════════════════════════════════

describe('G337 —— 旧自建词表零残留', () => {
  it('两个单元里没有作废 id、没有旧自建题面，沿用登记与内容一致', () => {
    const forbidden = forbiddenRetiredPrompts()
    const entries = [...getUnit(1).entries, ...getUnit(2).entries]

    expect(
      findRetiredResidue(entries, forbidden),
      '旧自建词表有残留 —— 换源批次要求「零残留」：作废 id 一条不许留，' +
        '旧题面（教材里根本没有的那些）一条不许留，沿用登记的题面不许被悄悄改掉',
    ).toEqual([])
  })

  it('🚨 反向自测（M413）：往内容里塞一个作废 id ⇒ 判据本体必须红', () => {
    const forbidden = forbiddenRetiredPrompts()
    const entries = [...getUnit(1).entries, ...getUnit(2).entries]
    const mutated = [
      ...entries,
      { entryId: 'u1-dog', card: { kind: 'word' as CardKind, promptText: 'dog' } },
    ]

    const problems = findRetiredResidue(mutated, forbidden)
    expect(
      problems.some((problem) => problem.includes('作废的词条 id 仍在内容里')),
      `判据在「塞一个作废 id」的违规夹具上没红 ⇒ 判据本身失效。实际报出：${problems.join(' / ')}`,
    ).toBe(true)
  })

  it('🚨 反向自测：把沿用词条的题面改掉 ⇒ 判据本体必须红（登记不是摆设）', () => {
    const forbidden = forbiddenRetiredPrompts()
    const entries = [...getUnit(1).entries, ...getUnit(2).entries]
    const mutated = entries.map((entry) =>
      entry.entryId === 'u2-s-thank-you'
        ? { ...entry, card: { ...entry.card, promptText: 'Thank you!' } }
        : entry,
    )

    const problems = findRetiredResidue(mutated, forbidden)
    expect(
      problems.some((problem) => problem.includes('登记的是')),
      `判据在「沿用词条改了题面」的违规夹具上没红 ⇒ 登记没有牙齿。实际报出：${problems.join(' / ')}`,
    ).toBe(true)
  })

  it('🚨 反向自测：把一个旧自建题面塞回来 ⇒ 判据本体必须红', () => {
    const forbidden = forbiddenRetiredPrompts()
    const entries = [...getUnit(1).entries, ...getUnit(2).entries]
    const mutated = [
      ...entries,
      { entryId: 'u1-x-teacher', card: { kind: 'word' as CardKind, promptText: 'teacher' } },
    ]

    const problems = findRetiredResidue(mutated, forbidden)
    expect(
      problems.some((problem) => problem.includes('旧自建词表的题面仍在内容里')),
      `判据在「旧题面塞回来」的违规夹具上没红 ⇒ 旧题面那一条没有牙齿。实际报出：${problems.join(' / ')}`,
    ).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// G338
// ══════════════════════════════════════════════════════════════════════════════

describe('G338 —— 游戏单元 ↔ 教材单元的映射', () => {
  it('1–12 → 1A，13–24 → 1B；两册各 12 个单元；全书词数合计 97', () => {
    expect(
      findMappingViolations(
        books,
        (gameUnitNumber) => {
          const mapped = textbookUnitOf(gameUnitNumber, books)
          return { bookIndex: mapped.bookIndex, unitNo: mapped.unit.unitNo }
        },
        TOTAL_TEXTBOOK_WORDS,
      ),
      '教材映射对不上 —— G335 / G336 都靠它去取教材数据；' +
        '映射错了会让「两边都空 ⇒ 相等 ⇒ 全绿」的假绿出现',
    ).toEqual([])
  })

  it('🚨 反向自测（M415）：把册次边界挪一位（13 → 12）⇒ 判据本体必须红', () => {
    const shifted = (gameUnitNumber: number) => {
      const firstBookUnitCount = UNITS_PER_BOOK - 1
      const bookIndex = gameUnitNumber <= firstBookUnitCount ? 0 : 1
      const unitNo =
        gameUnitNumber <= firstBookUnitCount ? gameUnitNumber : gameUnitNumber - firstBookUnitCount
      return { bookIndex, unitNo }
    }

    const problems = findMappingViolations(books, shifted, TOTAL_TEXTBOOK_WORDS)
    expect(
      problems.length,
      '判据在「册次边界挪一位」的违规夹具上没红 ⇒ 映射那一条没有牙齿（它可能恒真）',
    ).toBeGreaterThan(0)
  })

  it('🚨 反向自测：把全书词数的期望值改掉 ⇒ 判据本体必须红', () => {
    const problems = findMappingViolations(
      books,
      (gameUnitNumber) => {
        const mapped = textbookUnitOf(gameUnitNumber, books)
        return { bookIndex: mapped.bookIndex, unitNo: mapped.unit.unitNo }
      },
      TOTAL_TEXTBOOK_WORDS + 1,
    )

    expect(
      problems.some((problem) => problem.includes('词数合计')),
      `判据在「词数合计不对」的违规夹具上没红 ⇒ 词数那一条没有牙齿。实际报出：${problems.join(' / ')}`,
    ).toBe(true)
  })
})
