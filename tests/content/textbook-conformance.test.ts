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
  findBlockViolations,
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
  /** 这个选项是不是正确项。 */
  correct?: boolean
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
 * **G336 / G345 的判据本体** —— 语料句型行 ≡ 内容层的句子卡。
 *
 * ⚠️📎 **口径在 2026-10-28（Story 2.6，裁决 4）改过** —— 原来这里比的是
 *   「句子卡题面 ⊆ 教材该单元的**全部**句子 ∧ 教材句子一条不剩」。
 *   ⇒ 现在教材语料的句型行**只记被选中的那几句**（DF-222：句型行 = 选取），
 *     所以旧口径的「方向二（教材句子一条不剩）」在单元 3–7 上**必然红**
 *     （那些单元的教材句子比选中得多）。
 *   ⇒ 新口径：**语料句型行 == 内容层 `s-` 词条的卡面题面**（双向）。
 *
 * ⚠️ **自写句（`w-` 前缀）不参与「取自教材」的比对** —— 它们**按定义不在语料里**
 *   （§8.2：自写句只存在于内容层）⇒ 判据要把它们**分出来**，
 *   否则「自写句不在教材里」会被当成「卡面取自教材失败」。
 *
 * ── 六个方向 ────────────────────────────────────────────────────────────────
 *   | 方向 | 含义 | 归属 |
 *   |---|---|---|
 *   | `corpus-only` | 内容层 `s-` 卡面**不在**语料句型行里 | G336 + G345 |
 *   | `content-only` | 语料句型行里有句**没人用** | G336 + G345 |
 *   | `duplicate` | 同一个单元里有**两张卡面文字相同**的卡 | G336 + G345 |
 *   | `prefix` | 句子卡词条的前缀**既不是 `s-` 也不是 `w-`** | G345 |
 *   | `self-in-corpus` | `w-` 词条的题面**出现在**语料句型行里 | G345 |
 *   | `self-option` | `w-` 词条的**正确选项不是一条 `s-` 词条** | G345 |
 *
 * ⚠️ **「两张卡面文字相同」原来是被误报的**（2026-10-28 实测）：
 *   旧判据用「多重集合差集」的 `extra` 分支去报重复 ——
 *   而**任何**不在语料里的卡面都会落进 `extra` ⇒ 自写句被报成「重复」。
 *   ⇒ 现在「不在语料里」与「重复」是**两条独立的方向**。
 */
interface CorpusContentProblem {
  /** 方向（见上表）。 */
  readonly direction:
    | 'corpus-only'
    | 'content-only'
    | 'duplicate'
    | 'prefix'
    | 'self-in-corpus'
    | 'self-option'
  /** 人可读的说明。 */
  readonly detail: string
}

/** 内容层里「教材句」词条的前缀标记（entryId 里的 `-s-`）。 */
const TEXTBOOK_ENTRY_MARKER = '-s-'

/** 内容层里「自写句」词条的前缀标记（entryId 里的 `-w-`）。 */
const SELF_WRITTEN_ENTRY_MARKER = '-w-'

/**
 * **G336 / G345 的判据本体** —— 见 {@link CorpusContentProblem} 的六个方向。
 *
 * @param entries 被查单元的全部词条（内容层）
 * @param textbookSentences 该单元**语料句型行**里的句子（教材事实）
 */
export function findCorpusContentViolations(
  entries: readonly ContentEntry[],
  textbookSentences: readonly string[],
): CorpusContentProblem[] {
  const problems: CorpusContentProblem[] = []
  const sentenceEntries = entries.filter((entry) => entry.card.kind !== 'word')

  const isTextbook = (entryId: string): boolean => entryId.includes(TEXTBOOK_ENTRY_MARKER)
  const isSelfWritten = (entryId: string): boolean => entryId.includes(SELF_WRITTEN_ENTRY_MARKER)

  // ── 方向 `prefix` —— 句子卡词条的前缀只能是 `s-` 或 `w-` ──────────────────
  const textbookEntries = sentenceEntries.filter((entry) => isTextbook(entry.entryId))
  const selfWrittenEntries = sentenceEntries.filter((entry) => isSelfWritten(entry.entryId))
  for (const entry of sentenceEntries) {
    if (isTextbook(entry.entryId) || isSelfWritten(entry.entryId)) continue
    problems.push({
      direction: 'prefix',
      detail:
        `句子卡词条 ${entry.entryId} 的 entryId 里既没有 \`${TEXTBOOK_ENTRY_MARKER}\` 也没有 ` +
        `\`${SELF_WRITTEN_ENTRY_MARKER}\` —— 它到底是教材句还是自写句？没人说得清`,
    })
  }

  // ── 语料的句子集合（归一化）────────────────────────────────────────────────
  const corpus = new Set(textbookSentences.map((text) => normalizeEnglish(text)))

  // ── 方向 `corpus-only` —— 内容层的教材句必须在语料里 ───────────────────────
  for (const entry of textbookEntries) {
    if (corpus.has(normalizeEnglish(entry.card.promptText))) continue
    problems.push({
      direction: 'corpus-only',
      detail: `句子卡 ${entry.entryId} 的题面「${entry.card.promptText}」不在教材该单元的句型行里`,
    })
  }

  // ── 方向 `content-only` —— 语料里的每一句都要被用到 ───────────────────────
  const used = new Set(textbookEntries.map((entry) => normalizeEnglish(entry.card.promptText)))
  for (const sentence of textbookSentences) {
    if (used.has(normalizeEnglish(sentence))) continue
    problems.push({
      direction: 'content-only',
      detail: `教材该单元的句子「${sentence}」一条都没被用到`,
    })
  }

  // ── 方向 `self-in-corpus` —— 自写句必须在教材里**没有** ───────────────────
  for (const entry of selfWrittenEntries) {
    if (!corpus.has(normalizeEnglish(entry.card.promptText))) continue
    problems.push({
      direction: 'self-in-corpus',
      detail:
        `自写句 ${entry.entryId} 的题面「${entry.card.promptText}」**就在**教材句型行里 —— ` +
        '那它就不是自写句（教材里有 ⇒ 该用教材的 id）',
    })
  }

  // ── 方向 `self-option` —— 自写句只能当卡面题面，它的答案必须是教材句 ──────
  const byId = new Map(entries.map((entry) => [entry.entryId, entry]))
  for (const entry of selfWrittenEntries) {
    const correct = entry.card.options.find((option) => option.correct)
    if (correct === undefined) {
      problems.push({
        direction: 'self-option',
        detail: `自写句 ${entry.entryId} 没有正确项`,
      })
      continue
    }
    const target = byId.get(correct.id)
    if (target !== undefined && isTextbook(target.entryId)) continue
    problems.push({
      direction: 'self-option',
      detail:
        `自写句 ${entry.entryId} 的正确选项 ${correct.id} 不是一条教材句（\`s-\`）—— ` +
        '自写句只能当**卡面题面**，它的答案必须是教材里教过的那一句',
    })
  }

  // ── 方向 `duplicate` —— 同一个单元里不许有两张卡面文字相同的卡 ────────────
  const seen = new Map<string, string>()
  for (const entry of sentenceEntries) {
    const normalized = normalizeEnglish(entry.card.promptText)
    const previous = seen.get(normalized)
    if (previous !== undefined) {
      problems.push({
        direction: 'duplicate',
        detail: `同一个单元里有两张卡面文字相同的卡：${previous} 与 ${entry.entryId}`,
      })
      continue
    }
    seen.set(normalized, entry.entryId)
  }

  return problems
}

/**
 * **G336 的判据本体** —— 只看那三个「教材一致性」的方向。
 *
 * ⚠️ **G336 与 G345 共用同一个函数**（R-37：一份判据，两个口径）——
 *   G336 = 教材一致性的那三条；G345 = 全部六条（含自写句那三条）。
 */
function findSentenceViolations(
  entries: readonly ContentEntry[],
  textbookSentences: readonly string[],
): string[] {
  return findCorpusContentViolations(entries, textbookSentences)
    .filter(
      (problem) =>
        problem.direction === 'corpus-only' ||
        problem.direction === 'content-only' ||
        problem.direction === 'duplicate',
    )
    .map((problem) => problem.detail)
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
        correct: option.correct,
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

/**
 * ⚠️📎 **口径在 2026-10-28（Story 2.6，裁决 4）改过** ——
 *   原来这里比的是「句子卡题面 ⊆ 教材该单元的**全部**句子 ∧ 教材句子一条不剩」。
 *   ⇒ DF-222 决定教材语料的句型行**只记被选中的那几句**（句型行 = 选取），
 *     于是旧口径的「方向二（教材句子一条不剩）」在单元 3–7 上**必然红**
 *     （那些单元的教材句子比选中得多）。
 *   ⇒ 新口径：**语料句型行 ≡ 内容层 `s-` 词条的卡面题面**（双向）。
 *   ⚠️ **自写句（`w-` 前缀）不参与比对** —— 它们按定义不在语料里。
 */
describe('G336 —— 语料句型行 ≡ 内容层的教材句卡（取自教材 + 一条不剩 + 卡面不重复）', () => {
  for (const unitNumber of COVERED_UNITS) {
    it(`单元 ${unitNumber}：方向一（题面取自教材）+ 方向二（语料句子一条不剩）+ 卡面不重复`, () => {
      const entries = guardEntriesOf(unitNumber)
      const textbook = distinctTextbookSentences(textbookUnitOf(unitNumber, books).unit)

      expect(
        findSentenceViolations(entries, textbook),
        `单元 ${unitNumber} 的句子卡与教材的句型对不上 —— ` +
          '「取自教材」与「一条不剩」两个方向都必须成立，且同一个单元里不许有两张卡面相同的卡',
      ).toEqual([])
    })
  }

  it('🚨 反向自测（M411）：把一条句子卡的题面改掉 ⇒ 方向一必须红', () => {
    const entries = guardEntriesOf(1)
    const textbook = distinctTextbookSentences(textbookUnitOf(1, books).unit)
    // ⚠️ **夹具必须落在「句子卡」上** —— 单词卡的题面改了也不影响本判据
    //   （它比的是句子卡）⇒ 拿单词卡当夹具的话，这条反向自测**空转**。
    const mutated = entries.map((entry) =>
      entry.card.kind === 'word'
        ? entry
        : { ...entry, card: { ...entry.card, promptText: 'How are you?' } },
    )

    const problems = findSentenceViolations(mutated, textbook)
    expect(
      problems.some((problem) => problem.includes('不在教材该单元的句型行里')),
      `判据在「题面不在教材里」的违规夹具上没红 ⇒ 方向一失效。实际报出：${problems.join(' / ')}`,
    ).toBe(true)
  })

  it('🚨 反向自测（M412）：少用一句教材句子（删掉一张卡）⇒ 方向二必须红', () => {
    const entries = guardEntriesOf(2)
    const textbook = distinctTextbookSentences(textbookUnitOf(2, books).unit)
    const mutated = entries.filter(
      (entry) => !(entry.entryId === 'u2-s-how-nice' && entry.card.kind !== 'word'),
    )

    const problems = findSentenceViolations(mutated, textbook)
    expect(
      problems.some((problem) => problem.includes('一条都没被用到')),
      `判据在「教材句子没人用」的违规夹具上没红 ⇒ 方向二失效。实际报出：${problems.join(' / ')}`,
    ).toBe(true)
  })

  it('🚨 反向自测：两张卡面文字相同 ⇒ 必须红（按集合比的话这一条会被抹掉）', () => {
    const entries = guardEntriesOf(1)
    const textbook = distinctTextbookSentences(textbookUnitOf(1, books).unit)
    // ⚠️ **夹具把第一张句子卡的题面改成第二张的** —— 这样「重复」与「不在语料里」
    //   **同时**成立 ⇒ 断言必须点名 `duplicate` 那个方向，
    //   否则这条用例可能被「不在语料里」那条**撑起来**（R-51 的假通过形态）。
    const sentencePrompts = entries
      .filter((entry) => entry.card.kind !== 'word')
      .map((entry) => entry.card.promptText)
    const first = sentencePrompts[0]!
    const second = sentencePrompts[1]!
    let done = false
    const mutated = entries.map((entry) => {
      if (entry.card.kind === 'word' || done) return entry
      done = true
      return { ...entry, card: { ...entry.card, promptText: second } }
    })
    expect(first, '夹具要能拿到第二张句子卡的题面').not.toBe(second)

    const problems = findSentenceViolations(mutated, textbook)
    expect(
      problems.some((problem) => problem.includes('两张卡面文字相同')),
      `判据在「两张卡面相同」的违规夹具上没红 ⇒ 第三个方向失效。实际报出：${problems.join(' / ')}`,
    ).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// G345 —— 语料 ≡ 内容（**六个方向**，含自写句那三条）
// ══════════════════════════════════════════════════════════════════════════════

/**
 * **G345 的判据本体**是 {@link findCorpusContentViolations} ——
 *   与 G336 **共用同一个函数**（R-37：一份判据，两个口径），
 *   G345 看的是它的**全部六个方向**。
 *
 * ⚠️ **为什么要比 G336 更严**：G336 守的是「教材一致性」，
 *   而 Story 2.6 引入了**自写句**这个第三类内容 ⇒ 「一句卡面到底是教材句还是自写句」
 *   这件事必须**机器可判**，否则「教材文档与内容层各说各话」会静悄悄发生。
 */
describe('G345 —— 语料 ≡ 内容（教材句双向齐平 + 自写句不入语料 + 自写句的答案必须是教材句）', () => {
  for (const unitNumber of COVERED_UNITS) {
    it(`单元 ${unitNumber}：六个方向全过`, () => {
      const entries = guardEntriesOf(unitNumber)
      const textbook = distinctTextbookSentences(textbookUnitOf(unitNumber, books).unit)

      expect(
        findCorpusContentViolations(entries, textbook),
        `单元 ${unitNumber} 的语料与内容层对不上 —— ` +
          '「教材句双向齐平」+「自写句不入语料」+「自写句的答案必须是教材句」+「卡面互不相同」',
      ).toEqual([])
    })
  }

  it('🚨 反向自测（M421）：把一条 `s-` 卡面改成一个教材里没有的句 ⇒ 必须红', () => {
    const entries = guardEntriesOf(3)
    const textbook = distinctTextbookSentences(textbookUnitOf(3, books).unit)
    const mutated = entries.map((entry) =>
      entry.card.kind === 'word'
        ? entry
        : { ...entry, card: { ...entry.card, promptText: 'Look at my hat!' } },
    )

    const problems = findCorpusContentViolations(mutated, textbook)
    expect(
      problems.some((problem) => problem.direction === 'corpus-only'),
      `判据在「题面不在语料里」的违规夹具上没红 ⇒ 方向一失效。实际报出：${problems.map((p) => p.detail).join(' / ')}`,
    ).toBe(true)
  })

  it('🚨 反向自测（M430）：内容层少了一张教材句卡 ⇒ 语料里那一句没人用，必须红', () => {
    // ⚠️📎 **M430 的实现口径与 story 文档写的相反，如实记在这里**：
    //   story 文档写的是「把**语料句型行**的一句删掉（内容层还留着）」——
    //   那是**旧口径**（语料句型行记的是教材的**全部**句子）下的写法。
    //   ⇒ 新口径下（裁决 4：句型行 = **选取**）语料句型行**就是**内容层的选取结果，
    //     「删语料」与「内容多一句」是**同一件事**（= M421 那条方向）。
    //   ⇒ 要触到「语料里有句没人用」这个**独立**方向，必须**删内容层的卡**
    //     （语料那一行留着 ⇒ 那一句没人问了）。
    const entries = guardEntriesOf(3)
    const textbook = distinctTextbookSentences(textbookUnitOf(3, books).unit)
    const mutated = entries.filter((entry) => entry.card.kind === 'word')

    const problems = findCorpusContentViolations(mutated, textbook)
    expect(
      problems.some((problem) => problem.direction === 'content-only'),
      `判据在「语料里有句没人用」的违规夹具上没红 ⇒ 方向二失效。实际报出：${problems.map((p) => p.detail).join(' / ')}`,
    ).toBe(true)
  })

  it('🚨 反向自测：把语料句型行的一句删掉（内容层还留着）⇒ 方向一必须红', () => {
    const entries = guardEntriesOf(3)
    const textbook = distinctTextbookSentences(textbookUnitOf(3, books).unit)
    const mutated = textbook.slice(1)

    const problems = findCorpusContentViolations(entries, mutated)
    expect(
      problems.some((problem) => problem.direction === 'corpus-only'),
      `判据在「语料少一句、内容还留着」的违规夹具上没红 ⇒ 方向一失效。实际报出：${problems.map((p) => p.detail).join(' / ')}`,
    ).toBe(true)
  })

  it('🚨 反向自测：自写句的题面**出现在**语料里 ⇒ 必须红', () => {
    const entries = guardEntriesOf(4)
    const textbook = distinctTextbookSentences(textbookUnitOf(4, books).unit)
    // ⚠️ 把语料里加进自写句的题面 ⇒ 它就「既在语料里、又被标成自写句」⇒ 必须报出来。
    const mutated = [...textbook, 'Can you dance?']

    const problems = findCorpusContentViolations(entries, mutated)
    expect(
      problems.some((problem) => problem.direction === 'self-in-corpus'),
      `判据在「自写句出现在语料里」的违规夹具上没红 ⇒ 方向四失效。实际报出：${problems.map((p) => p.detail).join(' / ')}`,
    ).toBe(true)
  })

  it('🚨 反向自测：自写句的**正确选项也是自写句** ⇒ 必须红', () => {
    const entries = guardEntriesOf(7)
    const textbook = distinctTextbookSentences(textbookUnitOf(7, books).unit)
    // ⚠️ 夹具要**指向另一条 `w-` 词条** —— 只把正确项改成「不存在」会被别的原因抓住。
    const mutated = entries.map((entry) =>
      entry.entryId === 'u7-w-how-many-pencils'
        ? {
            ...entry,
            card: {
              ...entry.card,
              options: entry.card.options.map((option, index) =>
                index === 0 ? { ...option, id: 'u7-w-another-self-written' } : option,
              ),
            },
          }
        : entry,
    )

    const problems = findCorpusContentViolations(mutated, textbook)
    expect(
      problems.some((problem) => problem.direction === 'self-option'),
      `判据在「自写句的答案是自写句」的违规夹具上没红 ⇒ 方向五失效。实际报出：${problems.map((p) => p.detail).join(' / ')}`,
    ).toBe(true)
  })

  it('🚨 反向自测：句子卡词条的前缀**既不是 `s-` 也不是 `w-`** ⇒ 必须红', () => {
    const entries = guardEntriesOf(3)
    const textbook = distinctTextbookSentences(textbookUnitOf(3, books).unit)
    const mutated = entries.map((entry) =>
      entry.entryId === 'u3-s-my-mouth' ? { ...entry, entryId: 'u3-mystery-card' } : entry,
    )

    const problems = findCorpusContentViolations(mutated, textbook)
    expect(
      problems.some((problem) => problem.direction === 'prefix'),
      `判据在「前缀既不是 s- 也不是 w-」的违规夹具上没红 ⇒ 方向三失效。实际报出：${problems.map((p) => p.detail).join(' / ')}`,
    ).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// G346 —— 自写句的用词必须取自本单元词表 ∪ 本单元教材句里出现过的词
// ══════════════════════════════════════════════════════════════════════════════

/**
 * **G346 的判据本体** —— 自写句的每个词都必须有出处。
 *
 * ⚠️ **为什么这条要有**：自写句是**我们自己造的句子** ⇒ 它是全仓唯一一处
 *   「句子不是教材原话」的地方 ⇒ 造词的机会就在这里。
 *   ⇒ AC 正文逐字：「按 Story 2.5 §2.4 改写为自足句时，**用词仍须取自该单元词表**」。
 *
 * ⚠️ **词的切分口径**：按**空白 + 标点**切（`?` / `.` / `,` 都是分隔符），
 *   归一化后小写。教材转写里逗号后没有空格（`Good afternoon,Kitty.`）⇒
 *   不切标点会把 `afternoon,kitty` 当成一个词。
 *
 * @param selfWrittenSentences 自写句的题面
 * @param vocabulary 该单元的教材词表
 * @param textbookSentences 该单元语料句型行里的句子
 */
export function findSelfWrittenWordViolations(
  selfWrittenSentences: readonly string[],
  vocabulary: readonly string[],
  textbookSentences: readonly string[],
): string[] {
  const problems: string[] = []
  const known = new Set<string>()
  for (const word of vocabulary) known.add(normalizeEnglish(word))
  for (const sentence of textbookSentences) {
    for (const word of splitWords(sentence)) known.add(word)
  }

  for (const sentence of selfWrittenSentences) {
    for (const word of splitWords(sentence)) {
      if (known.has(word)) continue
      problems.push(
        `自写句「${sentence}」里的词「${word}」既不在本单元的词表里，` +
          '也不在本单元教材句里出现过的词里 —— 自写句只许**重新组合**本单元教过的词，不许造词',
      )
    }
  }
  return problems
}

/** 把一句英文切成词（空白 + 标点都是分隔符）。 */
function splitWords(text: string): string[] {
  return normalizeEnglish(text)
    .split(/[^a-z0-9']+/)
    .filter((word) => word !== '')
}

/** 内容层里某单元的**自写句题面**。 */
function selfWrittenPrompts(entries: readonly ContentEntry[]): string[] {
  return entries
    .filter((entry) => entry.card.kind !== 'word')
    .filter((entry) => entry.entryId.includes(SELF_WRITTEN_ENTRY_MARKER))
    .map((entry) => entry.card.promptText.trim())
}

describe('G346 —— 自写句的用词必须取自本单元词表 ∪ 本单元教材句里出现过的词', () => {
  for (const unitNumber of COVERED_UNITS) {
    it(`单元 ${unitNumber}：自写句里的每个词都有出处`, () => {
      const entries = guardEntriesOf(unitNumber)
      const textbookUnit = textbookUnitOf(unitNumber, books).unit
      const sentences = distinctTextbookSentences(textbookUnit)

      expect(
        findSelfWrittenWordViolations(
          selfWrittenPrompts(entries),
          textbookUnit.vocabulary,
          sentences,
        ),
        `单元 ${unitNumber} 的自写句里有**没有出处**的词 —— ` +
          'AC 正文逐字要求「用词仍须取自该单元词表」；造出来的词孩子没学过、也没有录音',
      ).toEqual([])
    })
  }

  it('🚨 反向自测（M422）：给一句自写句塞一个单元词表与教材句里都没有的词 ⇒ 必须红', () => {
    const problems = findSelfWrittenWordViolations(
      ['Can you dance?', 'Do you like elephants?'],
      ['dance', 'read', 'sing', 'draw'],
      ['I can sing.', 'I can dance.', 'What can you do?'],
    )

    expect(
      problems.some((problem) => problem.includes('elephants')),
      `判据在「塞了没出处的词」的违规夹具上没红 ⇒ 判据本身失效。实际报出：${problems.join(' / ')}`,
    ).toBe(true)
  })

  it('🚨 反向自测：教材句里出现过的词**也算**有出处 ⇒ 不许误报', () => {
    const problems = findSelfWrittenWordViolations(
      ['What can you do?'],
      ['dance', 'read', 'sing', 'draw'],
      ['I can sing.', 'What can you do?'],
    )

    expect(
      problems,
      '「What」「can」「you」「do」都出现在教材句里 ⇒ 不该被报成「没出处」',
    ).toEqual([])
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// G351 —— 每句都有板块归属，且板块 ∈ 对话板块白名单
// ══════════════════════════════════════════════════════════════════════════════

/**
 * **G351 的判据本体**住在 `tests/helpers/textbook-corpus.ts`
 * （{@link findBlockViolations}）—— 它问的是**语料**的问题
 * （「这句是不是儿歌里的」），所以住在解析器旁边。
 */
describe('G351 —— 每句教材句子都有板块归属，且板块 ∈ 对话板块白名单', () => {
  for (const unitNumber of COVERED_UNITS) {
    it(`单元 ${unitNumber}：没有「不知道属于哪个板块」的句子，也没有儿歌 / 故事板块的句子`, () => {
      const unit = textbookUnitOf(unitNumber, books).unit

      expect(
        findBlockViolations(unit),
        `单元 ${unitNumber} 的教材句子有板块归属问题 —— ` +
          '「不知道属于哪个板块」本身就是不可接受的状态（它可能来自儿歌 / 故事台词，' +
          '而那些**不入库**）；`Listen and enjoy` 段的句子一条都不能做成句子卡',
      ).toEqual([])
    })
  }

  it('🚨 反向自测（M427）：把一句的板块归属去掉 ⇒ 判据本体必须红', () => {
    const unit = textbookUnitOf(3, books).unit
    const broken = {
      ...unit,
      sentences: unit.sentences.map((sentence, index) =>
        index === 0 ? { ...sentence, block: null } : sentence,
      ),
    }

    const problems = findBlockViolations(broken)
    expect(
      problems.some((problem) => problem.includes('没有板块归属')),
      `判据在「板块归属去掉」的违规夹具上没红 ⇒ 判据本身失效。实际报出：${problems.join(' / ')}`,
    ).toBe(true)
  })

  it('🚨 反向自测：把一句归到 `Listen and enjoy`（儿歌板块）⇒ 判据本体必须红', () => {
    const unit = textbookUnitOf(3, books).unit
    const broken = {
      ...unit,
      sentences: unit.sentences.map((sentence, index) =>
        index === 0 ? { ...sentence, block: 'Listen and enjoy' } : sentence,
      ),
    }

    const problems = findBlockViolations(broken)
    expect(
      problems.some((problem) => problem.includes('不在可做卡的板块白名单里')),
      `判据在「归到儿歌板块」的违规夹具上没红 ⇒ 白名单那一条没有牙齿。实际报出：${problems.join(' / ')}`,
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
