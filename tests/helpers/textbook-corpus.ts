/**
 * 教材词表（`docs/textbook-oxford-shanghai/`）的**唯一解析处**。
 *
 * ── 为什么抽到这里 ──────────────────────────────────────────────────────────
 *   教材 markdown 是**手抄**的，而它现在是整条内容管线的事实源
 *   （每单元多少词、每单元多少句、全书多少张词图全都由它决定）。
 *   Story 2.10（换源批次）之后，至少有三处守卫要读它：
 *     · **G335**（单词卡题面词 === 教材 `Look and learn` 词表）
 *     · **G336**（句子卡题面 ⊆ 教材 `Say and act` 的句子，且一条不剩）
 *     · **G338**（游戏单元 ↔ 教材单元的映射）
 *   ⇒ 三处各抄一份解析器 = 三条复制链（R-37）：改教材格式要改三处，
 *     漏一处就有一处**静默**按老格式解析 ⇒ 「教材改了它会红」这个卖点当场失效。
 *   ⇒ 解析器抽到这里，三处**共用同一份**。
 *
 * ── 教材的行格式（`01a-units.md` / `01b-units.md`）──────────────────────────
 *   词表行：
 *     `- **词表（Look and learn）**：morning 早上 ｜ afternoon 下午　_（2 词）_`
 *   句型行：
 *     `- **句型（Say and act，逐句转写）**：Greetings 问候 ｜ Hello!你好! ｜ Good morning.早上好!`
 *   ⇒ 两种行都用 `｜`（全角竖线）分条目，条目的形态是「**英文 + 中文**」，
 *     所以**英文部分 = 第一个汉字之前的那一段**。
 *
 * ── 「场景 / 类别标签」怎么认 ───────────────────────────────────────────────
 *   教材的句型行里混着**不做卡**的条目：`Greetings 问候`（类别）、
 *   `On Sunday afternoon 星期天的下午`（场景）、`Let's count`（场景）。
 *   它们**没有终止标点**；真正的句子都有 `.` / `!` / `?` 结尾。
 *   ⇒ 判据：**英文部分以 `.` / `!` / `?` 结尾 ⇒ 句子；否则 ⇒ 标签**。
 *   ⚠️ 这条判据必须**只判一次**且**判在英文部分上** ——
 *     中文部分里也有 `。` / `！`（`你好!` 是半角感叹号，但 `早上好!` 之类
 *     的转写里什么标点都可能出现）⇒ 先切英文再判终止标点，顺序反了就会误判。
 *
 * ── 归一化（Story 2.10 裁决 8）──────────────────────────────────────────────
 *   教材转写里逗号后**没有空格**（`Give me a rubber,please.`），
 *   而卡面用的是规范英语（`Give me a rubber, please.`）。
 *   ⇒ 守卫比较的是**归一化后**的句子（去标点 + 折叠空白 + 小写），
 *     **不是逐字比较** —— 否则「教材转写与卡面逐字一致」会把排版缺陷也钉死。
 *
 * 不在 `src/` 下 —— NFR16：测试全部在 `tests/`。
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))

/** 教材词表所在目录。 */
export const CORPUS_DIR = join(root, 'docs/textbook-oxford-shanghai')

/** 两册教材的文件名（第一册 1A、第二册 1B）。 */
export const CORPUS_FILES = ['01a-units.md', '01b-units.md'] as const

/** 一册里的单元。 */
export interface TextbookUnit {
  /** 教材里的单元号（1–12，每册各一套）。 */
  unitNo: number
  /** `Look and learn` 的英文词（按教材原序）。 */
  vocabulary: string[]
  /** `Say and act` 的英文句子（按教材原序，**含重复**）。 */
  sentences: string[]
  /** `Say and act` 里被判为「场景 / 类别标签」的条目。 */
  labels: string[]
  /** 词表行的实际条目数（按 `｜` 切出来的条数）。 */
  itemCount: number
  /** 行末「（N 词）」的人工标记数。 */
  markedCount: number
}

/** 一册的解析结果。 */
export interface TextbookBook {
  /** 文件名（`01a-units.md` 之类）。 */
  file: string
  /** 该册的单元（按教材原序）。 */
  units: TextbookUnit[]
  /** 行末「本册词条合计：N」的人工计数。 */
  markedTotal: number
}

/** 教材的条目分隔符（全角竖线）。 */
const ITEM_SEPARATOR = '｜'

/** 句型行里，「不做卡」的标签与真正的句子的分界：终止标点。 */
const SENTENCE_TERMINATORS = ['.', '!', '?']

/**
 * 取条目的**英文部分** —— 第一个汉字之前的那一段。
 *
 * ⚠️ **切在第一个汉字处**而不是「切在第一个空白处」：
 *   教材的条目是「英文 + 中文」，英文**内部也有空格**
 *   （`Give me a rubber,please.`）⇒ 按空白切会把句子切碎。
 * ⚠️ 也不按「纯 ASCII 连续段」切：`…please.我要...` 这种条目开头是全角省略号
 *   ⇒ ASCII 连续段会从 `please.` 开始，丢掉前半截。
 */
function englishPartOf(item: string): string {
  const cut = item.search(/[一-鿿]/)
  const head = cut === -1 ? item : item.slice(0, cut)
  return head.trim()
}

/** 这一条是不是「真正的句子」（有终止标点）而不是「场景 / 类别标签」。 */
function isSentence(english: string): boolean {
  return SENTENCE_TERMINATORS.some((mark) => english.endsWith(mark))
}

/**
 * 归一化一句英文（去标点 + 折叠空白 + 小写）。
 *
 * ⚠️ **去标点会连词内的撇号一起去掉**（`Let's` → `lets`）——
 *   这正是我们要的：教材与卡面只在这一层上比，撇号写没写不影响是不是同一句。
 */
export function normalizeEnglish(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.!?,;:"'’`()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 解析一册教材。
 *
 * ⚠️ **词表条目的取法**：词表行是「`morning 早上 ｜ afternoon 下午`」，
 *   英文词是**第一个空白之前**的那一段（词条本身不含空格）⇒
 *   按空白切第一个 token 即可。
 * ⚠️ 而**句型条目不能按空白切**（`Hello!你好!` 没有空格，但
 *   `Good afternoon,Kitty.下午好,基蒂.` 的英文部分内部有空格）⇒
 *   句型走 `englishPartOf`。
 */
export function parseTextbookBook(file: string, text: string): TextbookBook {
  const units: TextbookUnit[] = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    const heading = lines[i].match(/^### .*Unit (\d+)/)
    if (!heading) continue
    const unitNo = Number(heading[1])

    let vocabulary: string[] = []
    let itemCount = -1
    let markedCount = -1
    const sentences: string[] = []
    const labels: string[] = []

    for (let j = i + 1; j < lines.length && !lines[j].startsWith('### '); j += 1) {
      const line = lines[j]
      if (line.includes('词表（Look and learn）')) {
        const marker = line.match(/（(\d+)\s*词）/)
        markedCount = marker ? Number(marker[1]) : -1
        const body = line.split('：').slice(1).join('：')
        const withoutMarker = body.replace(/　*_\s*（\d+\s*词）_\s*$/, '')
        const items = withoutMarker
          .split(ITEM_SEPARATOR)
          .map((s) => s.trim())
          .filter((s) => s !== '')
        itemCount = items.length
        vocabulary = items.map((item) => item.split(/\s+/)[0] ?? '').filter((w) => w !== '')
        continue
      }
      if (line.includes('句型（Say and act')) {
        const body = line.split('：').slice(1).join('：')
        const items = body
          .split(ITEM_SEPARATOR)
          .map((s) => s.trim())
          .filter((s) => s !== '')
        for (const item of items) {
          const english = englishPartOf(item)
          if (english === '') continue
          if (isSentence(english)) {
            sentences.push(english)
          } else {
            labels.push(english)
          }
        }
        continue
      }
    }

    units.push({ unitNo, vocabulary, sentences, labels, itemCount, markedCount })
  }

  const total = text.match(/本册词条合计：\*\*(\d+)\*\*/)
  return { file, units, markedTotal: total ? Number(total[1]) : -1 }
}

/** 读盘上的两册教材并解析。 */
export function loadTextbookBooks(): TextbookBook[] {
  return CORPUS_FILES.map((file) => parseTextbookBook(file, readFileSync(join(CORPUS_DIR, file), 'utf8')))
}

/**
 * 游戏单元号 ↔ 教材单元（**映射是本 story 的守卫之一** ⇒ 它住在可复用的地方）。
 *
 * ⚠️ 映射规则：**1–12 → 1A 的 U1–U12，13–24 → 1B 的 U1–U12**。
 *   错一位（13 → 1A U13）会让 G335 / G336 去查一个**不存在的**教材单元
 *   ⇒ 查不到时若返回空集合，「两边都空 ⇒ 相等 ⇒ 全绿」的**假绿**就出现了
 *   ⇒ 映射本身必须被**独立**钉住（见 G338）。
 *
 * @param gameUnitNumber 游戏单元号（1..24）
 * @throws 落在覆盖范围之外
 */
export function textbookUnitOf(
  gameUnitNumber: number,
  books: readonly TextbookBook[] = loadTextbookBooks(),
): { book: TextbookBook; unit: TextbookUnit; bookIndex: number } {
  if (!Number.isInteger(gameUnitNumber) || gameUnitNumber < 1 || gameUnitNumber > 24) {
    throw new Error(`游戏单元号必须是 1..24 的整数，收到 ${gameUnitNumber}`)
  }
  const bookIndex = gameUnitNumber <= 12 ? 0 : 1
  const book = books[bookIndex]
  if (book === undefined) {
    throw new Error(`教材文件缺失：books[${bookIndex}] —— 映射判据在这份文件上会真空成立`)
  }
  const unitNo = gameUnitNumber <= 12 ? gameUnitNumber : gameUnitNumber - 12
  const unit = book.units.find((candidate) => candidate.unitNo === unitNo)
  if (unit === undefined) {
    throw new Error(`${book.file} 里找不到 Unit ${unitNo} —— 映射判据在这份文件上会真空成立`)
  }
  return { book, unit, bookIndex }
}

/**
 * 某一段游戏单元区间对应的**教材词数之和**（= 该区间要画的词图张数）。
 *
 * ⚠️ 词图只跟**单词卡**走，而单词卡 = 教材 `Look and learn` 的词条
 *   ⇒ 区间内的词数之和就是该区间的词图张数。
 */
export function textbookWordCount(
  from: number,
  to: number,
  books: readonly TextbookBook[] = loadTextbookBooks(),
): number {
  let sum = 0
  for (let n = from; n <= to; n += 1) {
    sum += textbookUnitOf(n, books).unit.vocabulary.length
  }
  return sum
}
