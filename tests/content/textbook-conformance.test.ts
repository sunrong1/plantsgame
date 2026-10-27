/**
 * 教材一致性守卫 **G335 – G339**（Story 2.10 换源批次）。
 *
 * ── 守什么 ────────────────────────────────────────────────────────────────
 *   单元 1 / 2 的内容**整体换成教材**（一起版 1A Unit 1 / Unit 2）之后，
 *   「换源」这件事本身需要**机器守卫**。没有它们，「换源」只是一次人工替换 ——
 *   下次有人改 JSON，内容会悄悄漂回自建词表，而**没有任何报错**。
 *
 *   · **G335** —— 单词卡的题面词 === 教材该单元 `Look and learn` 的词表
 *     （**一条不少、一条不多**，逐词相等）。
 *   · **G336** —— 句子卡的题面（归一化后）全部取自教材该单元 `Say and act`
 *     的句子集合；**且**教材的每一个句子都被用到（**一条不剩**）；**且**
 *     同一个单元里**没有两张卡面文字相同的卡**。
 *   · **G337** —— 旧自建词表**零残留**（作废 id / 作废题面 / 沿用登记）。
 *   · **G338** —— 游戏单元 ↔ 教材单元的**映射**本身被独立钉住。
 *   · **G339** —— 选项里的**干扰项**取自教材（**不得凭空造词**）。
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
 *     · **M416** → G339：把一个干扰项改成教材里没有的词
 *   ⚠️ **M414**（末锚点改回 30 / 25 / 45 ⇒ G194 红）**不在本文件** ——
 *     它改的是 `src/content/distribution.ts` 的**源码**，走真的变异验证流程
 *     （改坏 → 跑测试 → 复原），结果记在 story 文档的变异矩阵里。
 *
 * 不在 `src/core/` 下 —— NFR16：测试全部在 `tests/`。
 */

import { describe, expect, it } from 'vitest'

import { getUnit, UNITS } from '../../src/content'
import { LAST_UNIT } from '../../src/content/distribution'
import type { CardKind } from '../../src/content/schema'
import {
  LAST_GAME_UNIT,
  loadTextbookBooks,
  normalizeEnglish,
  TOTAL_TEXTBOOK_WORDS,
  UNITS_PER_BOOK,
  textbookUnitOf,
  type TextbookBook,
  type TextbookUnit,
} from '../helpers/textbook-corpus'

const books = loadTextbookBooks()

/**
 * 本守卫覆盖的单元 —— **从内容层导出**（2026-10-27 `[CR]` 修）。
 *
 * ⚠️ **为什么不能写死 `[1, 2]`**：写死就是**第二份事实源**（R-37）——
 *   Story 2.6 录完单元 3–7 之后，这一条守卫会**继续只查单元 1–2**，
 *   而新单元**一行都没被查** ⇒ 覆盖面的收缩**没有任何报错**。
 *   ⇒ 覆盖面 = **内容层实际录了哪些单元** ⇒ 新单元自动进覆盖面。
 * ⚠️ **代价（一并记在这里）**：Story 2.6 起，新单元若不满足教材一致性，
 *   本守卫会**当场红** ⇒ 这是**期望行为**（它就是那批单元的验收判据之一）。
 *   教材里 10 个单元**没有 `Say and act` 句型**（⇒ 句子集合为空 ⇒ G336 方向二真空成立、
 *   方向一也无处可查）⇒ 它们只能做单词卡，这与延后条目 DF-222 记的是同一件事。
 */
const COVERED_UNITS: readonly number[] = UNITS.map((unit) => unit.unitNumber)

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
 * ⚠️📎 **本数组只有 69 个**（2026-10-27 `[CR]` 实测更正）：其余 6 个是**沿用**的
 *   （登记在 {@link REUSED_ENTRY_IDS}）⇒ **69 + 6 = 75**，与快照总数一致。
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
 * 换源前后**都存在**的 6 个词条 id，以及它们**当前**的题面与**所属单元**。
 *
 * ⚠️ **这份登记是「沿用」的凭据**：它们出现在作废快照里，却**不算残留** ——
 *   因为换源后的内容里它们承载的是**教材里的同一句话 / 同一个词**。
 *   登记它们的**当前题面** ⇒ 有人悄悄改了题面（却没重录）时，这条守卫会红。
 *   ⚠️ 改题面 = 改录音（**录音不可重生成**，架构 `:425-430`）⇒ 这条不是形式主义。
 * ⚠️ 另 4 个（`u1-s-good-afternoon` / `u2-ruler` / `u2-s-here-you-are` / `u2-s-how-nice`）
 *   的题面**逐字未变** ⇒ 它们的录音**直接复用**；其余 2 个改了题面 ⇒ **重录**。
 * ⚠️📎 **必须登记所属单元**（2026-10-27 `[CR]` 修）：G337 改成**逐单元**判之后，
 *   「登记为沿用的词条 X 不在内容里了」这条**过期检查**也必须逐单元做 ——
 *   否则单元 1 的检查会报「`u2-s-thank-you` 不在内容里」（它在单元 2 里）⇒ 恒红。
 */
const REUSED_ENTRY_IDS: Readonly<Record<string, { unit: number; promptText: string }>> = {
  'u1-s-good-morning': { unit: 1, promptText: 'Good morning.' },
  'u1-s-good-afternoon': { unit: 1, promptText: 'Good afternoon!' },
  'u2-ruler': { unit: 2, promptText: 'ruler' },
  'u2-s-here-you-are': { unit: 2, promptText: 'Here you are.' },
  'u2-s-thank-you': { unit: 2, promptText: 'Thank you.' },
  'u2-s-how-nice': { unit: 2, promptText: 'How nice!' },
}

/**
 * 换源**前**两个单元的 75 条**卡面题面**（2026-10-26 快照）。
 *
 * ⚠️ 这份清单**不直接当黑名单用** —— 里面有 4 条（`Good afternoon!` / `ruler` /
 *   `Here you are.` / `How nice!`）换源后**逐字仍在用**（它们是教材里的同一句 / 同一个词），
 *   直接拉黑会把正确的内容判死。
 * ⇒ 判据在运行时用**该单元的教材全集**做一次差集：只禁止「旧自建词表里有、
 *   而**该单元**的教材里根本没有」的题面。
 * ⚠️📎 **差集必须逐单元算**（2026-10-27 `[CR]` 修）：此前用的是**全书 24 个单元**的
 *   教材全集 ⇒ `ice cream`（旧单元 2 的词）因为**1B Unit 5** 里有它而被放过，
 *   而单元 2（= 1A Unit 2）里根本不该出现它 ⇒ **差集漏了 39 条**。
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

// ══════════════════════════════════════════════════════════════════════════════
// 判据本体（纯函数）
// ══════════════════════════════════════════════════════════════════════════════

/** 一条内容词条的最小形状（判据只需要 id、题面与选项）。 */
interface ContentOption {
  id: string
  /** 文字选项的文本（图片选项没有这个字段）。 */
  text?: string
}

/** 一条内容词条。 */
interface ContentEntry {
  entryId: string
  card: { kind: CardKind; promptText: string; options: readonly ContentOption[] }
}

/**
 * **两个字符串多重集合的差**（**重复项算重数**，不是集合）。
 *
 * ⚠️ **为什么不能��� `Set`**：集合会把「两张卡面文字相同」这件事**抹掉** ——
 *   `new Set(['a','a','b'])` 与 `new Set(['a','b'])` **完全相等** ⇒
 *   「少做一张卡」与「多做一张重复卡」都**不报**。
 *   ⇒ 这里按**重数**比：`extra` = 实际多出来的，`missing` = 期望有而实际没有的。
 */
function multisetDiff(
  actual: readonly string[],
  expected: readonly string[],
): { extra: string[]; missing: string[] } {
  const countOf = (items: readonly string[], item: string): number =>
    items.filter((candidate) => candidate === item).length

  const extra: string[] = []
  for (const item of new Set(actual)) {
    const over = countOf(actual, item) - countOf(expected, item)
    for (let i = 0; i < over; i += 1) extra.push(item)
  }
  const missing: string[] = []
  for (const item of new Set(expected)) {
    const under = countOf(expected, item) - countOf(actual, item)
    for (let i = 0; i < under; i += 1) missing.push(item)
  }
  return { extra, missing }
}

/**
 * **G335 的判据本体** —— 单词卡题面词集合 === 教材词表（一条不少、一条不多）。
 *
 * ⚠️ **两个方向都要报**：只报「多了」会让「少录一个词」静悄悄通过。
 * ⚠️ **按重数比，不按集合比**（见 {@link multisetDiff}）：教材词表里若有两个同名的词
 *   （抄录重复），单词卡也该有两张 ⇒ 集合比会把这种错放过。
 */
function findVocabularyViolations(
  actual: readonly string[],
  expected: readonly string[],
): string[] {
  const problems: string[] = []
  const actualList = actual.map((word) => word.toLowerCase())
  const expectedList = expected.map((word) => word.toLowerCase())
  const { extra, missing } = multisetDiff(actualList, expectedList)

  if (extra.length > 0) {
    problems.push(`单词卡里多了教材没有的词：${extra.join('、')}`)
  }
  if (missing.length > 0) {
    problems.push(`教材该单元的词没有全部落地（少 ${missing.join('、')}）`)
  }
  return problems
}

/**
 * **G336 的判据本体** —— 句子卡题面 ⊆ 教材句子，且教材句子一条不剩，且卡面不重复。
 *
 * ⚠️ **三个方向都必须有**（R-51 第 1 类的反面）：
 *   只守方向一时，「少做一张卡」不会红 —— 教材里那句就悄悄没人问了。
 * ⚠️ **第三个方向（卡面互不相同）**：教材 1A Unit 2 的句型里 `Here you are.`
 *   出现两次（两个活动段落各一次）⇒ **教材侧按去重后比**；
 *   但**卡面侧必须逐条比** —— 两张卡面文字相同 ⇒ 孩子看到两个一模一样的按钮，
 *   而「答对哪个」无从判断 ⇒ 那是**内容层的错**，必须报出来。
 */
function findSentenceViolations(
  cardPrompts: readonly string[],
  textbookSentences: readonly string[],
): string[] {
  const problems: string[] = []
  const cardList = cardPrompts.map((text) => normalizeEnglish(text))
  const textbookList = [...new Set(textbookSentences.map((text) => normalizeEnglish(text)))]
  const textbookSet = new Set(textbookList)

  const offTextbook = cardPrompts.filter((text) => !textbookSet.has(normalizeEnglish(text)))
  if (offTextbook.length > 0) {
    problems.push(`句子卡的题面不在教材该单元的句型里：${offTextbook.join('、')}`)
  }

  const { missing } = multisetDiff(cardList, textbookList)
  if (missing.length > 0) {
    problems.push(`教材该单元有句子一条都没被用到：${missing.join('、')}`)
  }

  const { extra } = multisetDiff(cardList, textbookList)
  if (extra.length > 0) {
    problems.push(`同一个单元里有两张卡面文字相同：${extra.join('、')}`)
  }
  return problems
}

/**
 * **G337 的判据本体** —— 旧自建词表零残留。
 *
 * @param entries 被查的内容词条
 * @param forbiddenPrompts 「旧题面里而**该单元**的教材里没有」的那些（运行时算好的差集）
 * @param unitNumber 被查的单元号（沿用登记按单元逐个核对）
 */
function findRetiredResidue(
  entries: readonly ContentEntry[],
  forbiddenPrompts: ReadonlySet<string>,
  unitNumber: number,
): string[] {
  const problems: string[] = []
  const retired = new Set(RETIRED_ENTRY_IDS)
  const present = new Set(entries.map((entry) => entry.entryId))

  for (const entry of entries) {
    if (retired.has(entry.entryId)) {
      problems.push(`作废的词条 id 仍在内容里：${entry.entryId}`)
    }
    const allowed = REUSED_ENTRY_IDS[entry.entryId]
    if (allowed !== undefined && entry.card.promptText !== allowed.promptText) {
      problems.push(
        `沿用的词条 ${entry.entryId} 的题面是「${entry.card.promptText}」，登记的是「${allowed.promptText}」—— ` +
          '改了题面就要重录（录音不可重生成）',
      )
    }
    if (forbiddenPrompts.has(normalizeRetiredPrompt(entry.card.promptText))) {
      problems.push(`旧自建词表的题面仍在内容里：${entry.card.promptText}`)
    }
  }

  for (const [id, record] of Object.entries(REUSED_ENTRY_IDS)) {
    if (record.unit !== unitNumber) continue
    if (!present.has(id)) {
      problems.push(`登记为「沿用」的词条 ${id} 不在内容里了 —— 登记已经过期`)
    }
  }
  return problems
}

/**
 * **G338 的判据本体** —— 游戏单元 ↔ 教材单元的映射。
 *
 * @param corpus 教材全集
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

/**
 * **G339 的判据本体** —— 选项（干扰项）必须取自教材，不得凭空造词。
 *
 * ⚠️ **AC 正文逐字**：「选项里的干扰项**必须取自教材词表**（本单元或已学单元），
 *   **不得凭空造词**」。
 *   这条 AC 在换源批次**零机器守卫** —— 实测把回应卡 `u1-s-hello` 的一个干扰项
 *   从教材句 `"Good afternoon!"` 改成**非教材词** `"teacher"`，
 *   **105/105 测试文件绿、2437/2437 测试绿、`validate:content` 通过**
 *   ⇒ G335/G336 只读 `entry.card.promptText`（卡面），校验器只查选项 id 悬空与
 *   重复显示文本，**都不查选项文本的词汇归属** ⇒ 干扰项可以是任何字。
 *
 * ── 三种卡型，三条不同的「取自教材」口径 ────────────────────────────────────
 *   · **单词卡**（选项是图片）—— 选项 id 必须指向**本单元某一张单词卡**，
 *     而那张卡的题面词必须在本单元的教材词表里。
 *     ⇒ 干扰词是**词图背后的词** ⇒ 判据必须顺着 id 查到词，不能只看图。
 *   · **关键词卡**（选项是文字）—— 选项文本必须在本单元的教材**词表**里
 *     （AC-1.4 逐字：关键词卡的正确项是「题面句里出现的那个教材词」）。
 *   · **回应卡**（选项是文字）—— 选项文本必须在本单元的教材**句型**里
 *     （AC-1.4 逐字：回应卡的正确项是「另一条词条」）。
 *
 * ⚠️ **为什么用「归一化后比较」**：教材转写里逗号后没有空格
 *   （`Give me a rubber,please.`），卡面是规范英语（`Give me a rubber, please.`）
 *   ⇒ 逐字比会把排版缺陷钉死（裁决 8）。
 */
function findDistractorViolations(
  entries: readonly ContentEntry[],
  unit: TextbookUnit,
): string[] {
  const problems: string[] = []
  const vocabulary = new Set(unit.vocabulary.map((word) => normalizeEnglish(word)))
  const sentences = new Set(unit.sentences.map((sentence) => normalizeEnglish(sentence.text)))

  /** 本单元每张单词卡的 id → 题面词。 */
  const wordCardText = new Map<string, string>()
  for (const entry of entries) {
    if (entry.card.kind === 'word') {
      wordCardText.set(entry.entryId, entry.card.promptText.trim().toLowerCase())
    }
  }

  for (const entry of entries) {
    for (const option of entry.card.options) {
      if (entry.card.kind === 'word') {
        const text = wordCardText.get(option.id)
        if (text === undefined) {
          problems.push(
            `单词卡 ${entry.entryId} 的选项 ${option.id} 不在本单元的任何一张单词卡里 —— ` +
              '这个干扰词没有出处',
          )
          continue
        }
        if (!vocabulary.has(text)) {
          problems.push(
            `单词卡 ${entry.entryId} 的选项 ${option.id}（${text}）不在教材该单元的词表里 —— ` +
              '干扰项必须取自教材词表',
          )
        }
        continue
      }

      if (typeof option.text !== 'string') continue
      const text = normalizeEnglish(option.text)
      const isKeyword = entry.card.kind === 'keyword'
      const pool = isKeyword ? vocabulary : sentences
      if (!pool.has(text)) {
        problems.push(
          `${isKeyword ? '关键词' : '回应'}卡 ${entry.entryId} 的选项「${option.text}」` +
            `不在教材该单元的${isKeyword ? '词表' : '句型'}里 —— 干扰项必须取自教材，不得凭空造词`,
        )
      }
    }
  }
  return problems
}

// ══════════════════════════════════════════════════════════════════════════════
// 工具
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 「旧题面」专用的归一化：**保留句末标点**，其余归一。
 *
 * ⚠️ **为什么不用 {@link normalizeEnglish}**：它会把句末标点也去掉 ⇒
 *   旧题面 `Hello` 与新题面 `Hello!` 归一化后**完全相同** ⇒
 *   「旧题面不得重新出现」这条 AC 在它们之间**分不出来**。
 *   ⇒ 这里只归一大小写、空白与逗号后的空格，**句末标点逐字保留** ⇒
 *   `Hello` ≠ `Hello!`、`Good morning.` ≠ `Good morning!`。
 *   ⚠️ 逗号后的空格要归一：教材转写是 `Good afternoon,Kitty.`，
 *     卡面是 `Good afternoon, Kitty.` ⇒ 不归一会把**同一句**判成两句。
 */
function normalizeRetiredPrompt(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s*,\s*/g, ',')
    .replace(/\s+/g, ' ')
    .trim()
}

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
  return [...new Set(unit.sentences.map((sentence) => sentence.text))]
}

/**
 * 「旧题面里、而**该单元**的教材里根本没有」的那批（= 真正该禁的旧自建词表）。
 *
 * ⚠️ **差集逐单元算**（2026-10-27 `[CR]` 修）—— 理由见 {@link RETIRED_PROMPT_TEXTS}。
 */
function forbiddenRetiredPrompts(unit: TextbookUnit): Set<string> {
  const textbook = new Set<string>()
  for (const word of unit.vocabulary) textbook.add(normalizeRetiredPrompt(word))
  for (const sentence of unit.sentences) textbook.add(normalizeRetiredPrompt(sentence.text))
  const forbidden = new Set<string>()
  for (const text of RETIRED_PROMPT_TEXTS) {
    const normalized = normalizeRetiredPrompt(text)
    if (!textbook.has(normalized)) forbidden.add(normalized)
  }
  return forbidden
}

/**
 * 把内容层的词条整形成判据要的形状。
 *
 * ⚠️ **为什么多这一步**：`src/content` 的选项是 `ImageOption | TextOption` 的**并集**
 *   ⇒ 直接读 `option.text` 在 TypeScript 里**读不到**（那个属性不在并集的所有分支上）。
 *   ⇒ 这里显式整形成 `{ id, text? }` ⇒ 判据本体不必知道内容层的类型细节。
 */
function guardEntriesOf(unitNumber: number): ContentEntry[] {
  return getUnit(unitNumber).entries.map((entry) => ({
    entryId: entry.entryId,
    card: {
      kind: entry.card.kind,
      promptText: entry.card.promptText,
      options: entry.card.options.map((option) => ({
        id: option.id,
        ...('text' in option ? { text: option.text } : {}),
      })),
    },
  }))
}

// ══════════════════════════════════════════════════════════════════════════════
// G335
// ══════════════════════════════════════════════════════════════════════════════

describe('G335 —— 单词卡题面词 === 教材该单元 `Look and learn` 的词表', () => {
  for (const unitNumber of COVERED_UNITS) {
    it(`单元 ${unitNumber}：一条不少、一条不多`, () => {
      const entries = guardEntriesOf(unitNumber)
      const textbook = textbookUnitOf(unitNumber, books).unit.vocabulary

      expect(
        findVocabularyViolations(wordCardPrompts(entries), textbook),
        `单元 ${unitNumber} 的单词卡与教材的词表对不上 —— ` +
          '换源批次要求「逐词一致」，少一条是漏录，多一条是造词',
      ).toEqual([])
    })
  }

  it('🚨 反向自测（M410）：把一条单词卡的题面改成一个教材里没有的词 ⇒ 判据本体必须红', () => {
    const entries = guardEntriesOf(1)
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
    const entries = guardEntriesOf(1)
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
    it(`单元 ${unitNumber}：方向一（题面取自教材）+ 方向二（教材句子一条不剩）+ 卡面不重复`, () => {
      const entries = guardEntriesOf(unitNumber)
      const textbook = distinctTextbookSentences(textbookUnitOf(unitNumber, books).unit)

      expect(
        findSentenceViolations(sentenceCardPrompts(entries), textbook),
        `单元 ${unitNumber} 的句子卡与教材的句型对不上 —— ` +
          '「取自教材」与「一条不剩」两个方向都必须成立，且同一个单元里不许有两张卡面相同的卡',
      ).toEqual([])
    })
  }

  it('🚨 反向自测（M411）：把一条句子卡的题面改掉 ⇒ 方向一必须红', () => {
    const entries = guardEntriesOf(1)
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
    const entries = guardEntriesOf(2)
    const textbook = distinctTextbookSentences(textbookUnitOf(2, books).unit)
    const mutated = sentenceCardPrompts(entries).filter((text) => text !== 'How nice!')

    const problems = findSentenceViolations(mutated, textbook)
    expect(
      problems.some((problem) => problem.includes('一条都没被用到')),
      `判据在「教材句子没人用」的违规夹具上没红 ⇒ 方向二失效。实际报出：${problems.join(' / ')}`,
    ).toBe(true)
  })

  it('🚨 反向自测：两张卡面文字相同 ⇒ 必须红（按集合比的话这一条会被抹掉）', () => {
    const entries = guardEntriesOf(1)
    const textbook = distinctTextbookSentences(textbookUnitOf(1, books).unit)
    const mutated = sentenceCardPrompts(entries).map((text, index) =>
      index === 0 ? 'Goodbye!' : text,
    )

    const problems = findSentenceViolations(mutated, textbook)
    expect(
      problems.some((problem) => problem.includes('两张卡面文字相同')),
      `判据在「两张卡面相同」的违规夹具上没红 ⇒ 第三个方向失效。实际报出：${problems.join(' / ')}`,
    ).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// G337
// ══════════════════════════════════════════════════════════════════════════════

describe('G337 —— 旧自建词表零残留', () => {
  for (const unitNumber of COVERED_UNITS) {
    it(`单元 ${unitNumber}：没有作废 id、没有旧自建题面，沿用登记与内容一致`, () => {
      const unit = textbookUnitOf(unitNumber, books).unit
      const forbidden = forbiddenRetiredPrompts(unit)
      const entries = guardEntriesOf(unitNumber)

      expect(
        findRetiredResidue(entries, forbidden, unitNumber),
        `单元 ${unitNumber} 里还有旧自建词表的残留 —— 换源批次要求「零残留」：` +
          '作废 id 一条不许留，旧题面（**该单元**的教材里根本没有的那些）一条不许留，' +
          '沿用登记的题面不许被悄悄改掉',
      ).toEqual([])
    })
  }

  it('🚨 反向自测（M413）：往内容里塞一个作废 id ⇒ 判据本体必须红', () => {
    const forbidden = forbiddenRetiredPrompts(textbookUnitOf(1, books).unit)
    const entries = guardEntriesOf(1)
    const mutated = [
      ...entries,
      { entryId: 'u1-dog', card: { kind: 'word' as CardKind, promptText: 'dog', options: [] } },
    ]

    const problems = findRetiredResidue(mutated, forbidden, 1)
    expect(
      problems.some((problem) => problem.includes('作废的词条 id 仍在内容里')),
      `判据在「塞一个作废 id」的违规夹具上没红 ⇒ 判据本身失效。实际报出：${problems.join(' / ')}`,
    ).toBe(true)
  })

  it('🚨 反向自测：把沿用词条的题面改掉 ⇒ 判据本体必须红（登记不是摆设）', () => {
    const forbidden = forbiddenRetiredPrompts(textbookUnitOf(2, books).unit)
    const entries = guardEntriesOf(2)
    const mutated = entries.map((entry) =>
      entry.entryId === 'u2-s-thank-you'
        ? { ...entry, card: { ...entry.card, promptText: 'Thank you!' } }
        : entry,
    )

    const problems = findRetiredResidue(mutated, forbidden, 2)
    expect(
      problems.some((problem) => problem.includes('登记的是')),
      `判据在「沿用词条改了题面」的违规夹具上没红 ⇒ 登记没有牙齿。实际报出：${problems.join(' / ')}`,
    ).toBe(true)
  })

  it('🚨 反向自测：把一个旧自建题面塞回来 ⇒ 判据本体必须红', () => {
    const forbidden = forbiddenRetiredPrompts(textbookUnitOf(1, books).unit)
    const entries = guardEntriesOf(1)
    const mutated = [
      ...entries,
      {
        entryId: 'u1-x-teacher',
        card: { kind: 'word' as CardKind, promptText: 'teacher', options: [] },
      },
    ]

    const problems = findRetiredResidue(mutated, forbidden, 1)
    expect(
      problems.some((problem) => problem.includes('旧自建词表的题面仍在内容里')),
      `判据在「旧题面塞回来」的违规夹具上没红 ⇒ 旧题面那一条没有牙齿。实际报出：${problems.join(' / ')}`,
    ).toBe(true)
  })

  it('🚨 反向自测：把「旧题面塞回来」放在**另一个单元**里也必须红（差集是逐单元算的）', () => {
    // ⚠️ `ice cream` 是**旧单元 2**的题面；教材 1B Unit 5 里有它，但单元 2 = 1A Unit 2
    //   ⇒ 它在**单元 2** 里仍然该被禁。旧的「全书差集」口径会把它放过。
    const unit2 = textbookUnitOf(2, books).unit
    const forbidden = forbiddenRetiredPrompts(unit2)
    expect(
      forbidden.has('ice cream'),
      '「ice cream」在单元 2 的禁用差集里不见了 —— 差集又变回全书口径了（1B Unit 5 有它）',
    ).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// G338
// ══════════════════════════════════════════════════════════════════════════════

describe('G338 —— 游戏单元 ↔ 教材单元的映射', () => {
  it(`1–${UNITS_PER_BOOK} → 1A，${UNITS_PER_BOOK + 1}–${LAST_GAME_UNIT} → 1B；两册各 ${UNITS_PER_BOOK} 个单元；全书词数合计 ${TOTAL_TEXTBOOK_WORDS}`, () => {
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

  it('🚨 两份「单元总数」必须一致（教材的册次 × 每册单元数 === 内容规则覆盖的关卡数）', () => {
    // ⚠️ **这是两份独立的事实源**（教材结构 vs `src/content/distribution.ts` 的规则覆盖范围）。
    //   它们各自被别的守卫盯着，但**「它们相等」这件事本身**此前没人盯 ⇒
    //   一边改成 25、另一边还是 24 时，两边各自都绿，而中间那层映射已经错位。
    expect(
      LAST_GAME_UNIT,
      `教材结构推出的关卡数（${UNITS_PER_BOOK} × ${books.length} = ${LAST_GAME_UNIT}）` +
        `与内容规则覆盖的关卡数（${LAST_UNIT}）不一致 —— 映射的覆盖范围对不上`,
    ).toBe(LAST_UNIT)
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
    // ⚠️ **必须断言报出的是「册次边界错位」那一条**（2026-10-27 `[CR]` 修）——
    //   只断言 `length > 0` 时，判据哪怕因为**别的**理由报错（少一个单元、
    //   词数合计不对……）也会「通过」这条反向自测 ⇒ 反向自测自己就是空转的。
    expect(
      problems.some((problem) => problem.includes('册次边界错位')),
      `判据没有报出「册次边界错位」。实际报出：${problems.join(' / ')}`,
    ).toBe(true)
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

// ══════════════════════════════════════════════════════════════════════════════
// G339
// ══════════════════════════════════════════════════════════════════════════════

describe('G339 —— 选项里的干扰项必须取自教材，不得凭空造词', () => {
  for (const unitNumber of COVERED_UNITS) {
    it(`单元 ${unitNumber}：每一个选项都能追到教材`, () => {
      const entries = guardEntriesOf(unitNumber)
      const unit = textbookUnitOf(unitNumber, books).unit

      expect(
        findDistractorViolations(entries, unit),
        `单元 ${unitNumber} 的选项里出现了教材没有的词 —— ` +
          'AC 正文逐字要求「选项里的干扰项必须取自教材词表，不得凭空造词」；' +
          '凭空造的词既没有词图，也没有录音，孩子看到的是**教材里不存在的词**',
      ).toEqual([])
    })
  }

  it('🚨 反向自测（M416）：把一个干扰项改成教材里没有的词 ⇒ 判据本体必须红', () => {
    const entries = guardEntriesOf(1)
    const unit = textbookUnitOf(1, books).unit
    const mutated = entries.map((entry) =>
      entry.entryId === 'u1-s-hello'
        ? {
            ...entry,
            card: {
              ...entry.card,
              options: entry.card.options.map((option, index) =>
                index === 1 ? { ...option, text: 'teacher' } : option,
              ),
            },
          }
        : entry,
    )

    const problems = findDistractorViolations(mutated, unit)
    expect(
      problems.some((problem) => problem.includes('不得凭空造词')),
      `判据在「干扰项改成非教材词」的违规夹具上没红 ⇒ 判据本身失效。实际报出：${problems.join(' / ')}`,
    ).toBe(true)
  })

  it('🚨 反向自测：关键词卡的干扰项改成非教材词 ⇒ 判据本体必须红', () => {
    const entries = guardEntriesOf(1)
    const unit = textbookUnitOf(1, books).unit
    const mutated = entries.map((entry) =>
      entry.entryId === 'u1-s-good-morning'
        ? {
            ...entry,
            card: {
              ...entry.card,
              options: entry.card.options.map((option, index) =>
                index === 1 ? { ...option, text: 'teacher' } : option,
              ),
            },
          }
        : entry,
    )

    const problems = findDistractorViolations(mutated, unit)
    expect(
      problems.some((problem) => problem.includes('词表')),
      `判据在「关键词卡干扰项非教材词」的违规夹具上没红 ⇒ 词表那一条没有牙齿。实际报出：${problems.join(' / ')}`,
    ).toBe(true)
  })
})
