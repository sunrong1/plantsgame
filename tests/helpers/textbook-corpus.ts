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
 * ── ⚠️ **本文件是全仓唯一的教材解析器**（2026-10-27 `[CR]` 修）────────────
 *   此前 `tests/scaffold/textbook-corpus.test.ts` 另有一份 `parseBook()`，
 *   规则**不一样**（它按 `｜` 数条目、不切英文部分）⇒ 两份解析器 = 两条复制链，
 *   而「教材改了它会红」这个卖点只在其中一份上成立。
 *   ⇒ 那份已改为**委托到这里**（`parseTextbookBook`），判据也搬到这里
 *     （`checkBookSelfConsistent`）。
 *
 * ── 教材的行格式（`01a-units.md` / `01b-units.md`）──────────────────────────
 *   词表行：
 *     `- **词表（Look and learn）**：morning 早上 ｜ afternoon 下午　_（2 词）_`
 *   句型行：
 *     `- **句型（Say and act，逐句转写）**：Greetings 问候 ｜ Hello!你好! ｜ Good morning.早上好!`
 *   ⇒ 两种行都用 `｜`（全角竖线）分条目，条目的形态是「**英文 + 中文**」，
 *     所以**英文部分 = 第一个汉字之前的那一段**。
 *
 * ── 板块标记（Story 2.6，DF-222 的闭合手段）────────────────────────────────
 *   一句教材句子**属于哪个板块**（`Look and say` / `Say and act` / …）是**机器事实**，
 *   而「哪些板块可以做句子卡」（儿歌 / 故事台词**不行**）是**内容规则**
 *   ⇒ 语料里必须有**机器可读**的板块归属，否则「这句话是不是儿歌」只能靠人记。
 *   ⇒ **行内板块标记**：在句型行里，板块切换处插一个「板块名 + 中文」的条目
 *     （`Look and say看图说` / `Say and act说并做` / `Play a game做游戏`）——
 *     它**没有终止标点** ⇒ 不是句子（不做卡），但解析器认得出它 ⇒
 *     每一句都能落到一个板块上。
 *   ⚠️ **板块名的白名单住在本文件**（{@link BLOCK_NAMES}）——
 *     「这一条是不是板块标记」由它判定，不靠「看起来像不像板块名」。
 *   ⚠️ **表头（`句型（A / B，逐句转写）`）只是给人看的摘要**；
 *     机器事实是行内标记 ⇒ 摘要与事实对不上时**要报错**（`checkBookSelfConsistent` 第 7 层）。
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

/** 册次在文档里的标签（`docs/card-distribution.md` 的 census 表用这两个字样）。 */
export const BOOK_LABELS = ['1A', '1B'] as const

/**
 * 一册教材的单元数（两册各 12 个 ⇒ 全书 24 关）。
 *
 * ⚠️ **这是全仓唯一的「12」出处** —— `textbookUnitOf()` 的册次边界、
 *   G338 的覆盖范围、文档守卫 G321 的 1A/1B 区间映射都由它推出。
 */
export const UNITS_PER_BOOK = 12

/**
 * 全书的游戏单元数（= `UNITS_PER_BOOK` × 册数 = **24**）。
 *
 * ⚠️ 它**不是**手写的 24 —— 手写就会多出第二份事实源（R-37）。
 */
export const LAST_GAME_UNIT = UNITS_PER_BOOK * CORPUS_FILES.length

/**
 * 全书教材词数（= 全书的单词卡数 = 全书的词图张数）= **97**。
 *
 * ⚠️ **它是产品数字**（GDD 正文写的「97 词 ⇒ 97 张」），所以这里**必须写字面量**
 *   而不是现算 —— 现算就等于「拿实算值验实算值」（恒真断言）。
 *   ⇒ 它被**两条独立的守卫**钉住：
 *     · **G297 / G298**（`tests/scaffold/textbook-corpus.test.ts`）——
 *       教材词数与 GDD 正文对得上；
 *     · **G338**（本 story 的映射守卫）—— 教材实算 === 这个数。
 *   ⇒ 改这个数字 = 改内容口径，必须连带改 GDD。
 */
export const TOTAL_TEXTBOOK_WORDS = 97

/**
 * 某册教材对应的**游戏单元区间**（1A ⇒ 1..12，1B ⇒ 13..24）。
 *
 * ⚠️ 这是「游戏单元 ↔ 教材单元」映射的**唯一定义处**（G338 独立钉住它）——
 *   文档守卫 G321 的 census 表曾把 `13` / `12` 抄在测试里 ⇒ **第二份事实源**，
 *   映射一旦改动，G321 会拿旧区间去核 ⇒ 报出一个「看起来像文档漂移」的假错。
 *
 * @param bookIndex 册序号（0 = 1A，1 = 1B）
 */
export function gameUnitRangeOfBook(bookIndex: number): { from: number; to: number } {
  if (!Number.isInteger(bookIndex) || bookIndex < 0 || bookIndex >= CORPUS_FILES.length) {
    throw new Error(`册序号必须是 0..${CORPUS_FILES.length - 1} 的整数，收到 ${bookIndex}`)
  }
  const from = bookIndex * UNITS_PER_BOOK + 1
  return { from, to: from + UNITS_PER_BOOK - 1 }
}

/**
 * 按**文档里的册次标签**（`1A` / `1B`）取游戏单元区间。
 *
 * ⚠️ 文档守卫 G321 的 census 表按 `1A` / `1B` 两行走 ⇒ 它必须问「这个标签对应哪段单元」，
 *   而**不能**在测试里再抄一遍 `13` / `12`。
 */
export function gameUnitRangeOfBookLabel(label: string): { from: number; to: number } {
  const index = BOOK_LABELS.indexOf(label as (typeof BOOK_LABELS)[number])
  if (index === -1) {
    throw new Error(`册次标签必须是 ${BOOK_LABELS.join(' / ')} 之一，收到 ${label}`)
  }
  return gameUnitRangeOfBook(index)
}

/** 一册教材的解析结果。 */
export interface TextbookBook {
  /** 文件名（`01a-units.md` 之类）。 */
  file: string
  /** 该册的单元（按教材原序）。 */
  units: TextbookUnit[]
  /** 行末「本册词条合计：N」的人工计数。 */
  markedTotal: number
}

/**
 * 教材里出现过的**板块名** —— 判「这一条是不是板块标记」的**唯一依据**。
 *
 * ⚠️ 它是**教材的板块标题**的全集（`01a` / `01b` 两册的转写里出现过的那些），
 *   不是「可以做卡」的板块清单（那是 {@link DIALOGUE_BLOCKS}）。
 *   ⇒ 两个清单**故意不同**：前者回答「这是不是板块标题」，
 *     后者回答「这个板块的句子能不能做成句子卡」。
 */
export const BLOCK_NAMES = [
  'Look and learn',
  'Look and say',
  'Say and act',
  'Ask and answer',
  'Do a survey',
  'Play a game',
  'Listen and say',
  'Listen and act',
  'Listen and enjoy',
] as const

/** 板块名。 */
export type BlockName = (typeof BLOCK_NAMES)[number]

/**
 * 教材转写里的**板块名拼写变体** → 规范名。
 *
 * ⚠️ 只收**转写里的错拼**（`Listen an enjoy`），不收任何近义改写 ——
 *   收多了就会出现「两个写法都算板块名 ⇒ 同一个板块被算成两个」。
 */
const BLOCK_ALIASES: Readonly<Record<string, BlockName>> = {
  'Listen an enjoy': 'Listen and enjoy',
}

/**
 * **可以做句子卡的板块**（对话 / 演练板块）—— 儿歌与故事板块**不在**其中。
 *
 * ⚠️ 这是**内容规则**（`docs/textbook-oxford-shanghai/README.md` §五「入库边界」）：
 *   儿歌歌词全文与故事逐句台词**不入库** ⇒ `Listen and enjoy` 段的句子
 *   一条都不能进内容层。
 *   ⇒ 语料的**每一句**都必须落在这些板块里（G351），
 *   否则「从儿歌里抄了句」这件事会**静默**发生。
 */
export const DIALOGUE_BLOCKS: readonly BlockName[] = [
  'Look and say',
  'Say and act',
  'Ask and answer',
  'Do a survey',
  'Play a game',
  'Listen and say',
  'Listen and act',
]

/**
 * 一条教材句子（连同它属于哪个板块）。
 *
 * ⚠️ **板块归属是机器事实**，不是注释 ——
 *   「这句话是不是儿歌里的」必须能被机器回答，否则只能靠人记。
 */
export interface TextbookSentence {
  /** 英文句子（逐字，含标点）。 */
  text: string
  /**
   * 所属板块。
   *
   * ⚠️ `null` = **不知道**（这一句之前还没有板块标记），
   *   **不是**「不属于任何板块」⇒ 这两件事必须分得开，
   *   否则「漏写标记」与「这句真的没有板块」会被混为一谈。
   */
  block: string | null
}

/** 一册里的单元。 */
export interface TextbookUnit {
  /** 教材里的单元号（1–12，每册各一套）。 */
  unitNo: number
  /** `Look and learn` 的英文词（按教材原序；**多词词条整体保留**）。 */
  vocabulary: string[]
  /**
   * 词表行的**原始条目**（「英文 + 中文」整条，未切分）。
   *
   * ⚠️ 它存在的唯一理由：让「英文部分被切短了」这件事**可被发现**
   *   （见 {@link checkBookSelfConsistent} 的第 5 层判据）。
   *   ⇒ 有了它，判据才能问「这个词后面紧跟的是中文吗」——
   *   而这个问题**不依赖解析器自己**，所以它不是恒真断言。
   */
  vocabularyRaw: string[]
  /**
   * `Say and act` 的英文句子（按教材原序，**含重复**；**不含场景 / 类别标签**）。
   *
   * ⚠️ 每一句都带**板块归属**（Story 2.6）：这是「这句话能不能做成句子卡」的
   *   唯一机器依据（儿歌 / 故事台词**不做卡**）。
   */
  sentences: TextbookSentence[]
  /** `Say and act` 里被判为「场景 / 类别标签」的条目（**不做卡**）。 */
  labels: string[]
  /** 句型行里出现过的**行内板块标记**（按出现顺序）。 */
  blocks: string[]
  /**
   * 句型行**表头**声明的板块清单（`句型（A / B，逐句转写）` ⇒ `[A, B]`）。
   *
   * ⚠️ 它只是**给人看的摘要**；机器事实是 {@link blocks}。
   *   ⇒ 摘要与事实对不上时**要报错**（见 `checkBookSelfConsistent` 第 7 层），
   *     否则「表头说来自 `Say and act`、实际抄了 `Listen and enjoy`」没人会发现。
   */
  declaredBlocks: string[]
  /** 词表行的实际条目数（按 `｜` 切出来的条数）。 */
  itemCount: number
  /** 行末「（N 词）」的人工标记数。 */
  markedCount: number
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
 *
 * ⚠️📎 **词表也走这一条**（2026-10-27 `[CR]` 修）：词表条目**可以是多词的**
 *   （教材 1B Unit 5 的 `ice cream 冰淇淋`）⇒ 旧写法「按空白切第一个 token」
 *   会把它截成 `ice` ⇒ 教材里明明有 `ice cream`，解析结果里却只有 `ice`，
 *   而**没有任何报错**（G335 在 1A 上比的是 1A 的词，碰不到 1B 的 `ice cream`）。
 *   ⇒ 词表与句型**统一**走「切在第一个汉字处」。
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
 * 这一条是不是**板块标记**；是的话返回**规范板块名**，否则 `null`。
 *
 * ⚠️ **判据是白名单**（{@link BLOCK_NAMES}），不是「像不像板块名」——
 *   「像不像」会把教材里恰好叫 `Toys 玩具` 的场景标签误判成板块
 *   ⇒ 那一段的句子就拿到了**错的板块归属**（而归属是要做卡的判据）。
 * ⚠️ **末尾的句点不算**（教材转写里 `Listen and enjoy.` 带句点）。
 */
export function blockNameOf(english: string): string | null {
  const cleaned = english.replace(/\.+$/, '').trim()
  const canonical = BLOCK_ALIASES[cleaned] ?? cleaned
  return (BLOCK_NAMES as readonly string[]).includes(canonical) ? canonical : null
}

/**
 * 从句型行的**表头**里取出「声明的板块清单」。
 *
 * ⚠️ 表头形如 `句型（Look and say / Say and act，逐句转写）`
 *   ⇒ 取第一个全角逗号之前的那一段，再按 `/` 切开。
 *   ⚠️ **表头只是摘要**：机器事实是**行内标记**（{@link TextbookUnit.blocks}）
 *     ⇒ 表头与标记对不上时由 `checkBookSelfConsistent` 第 7 层报错。
 */
function declaredBlocksOf(line: string): string[] {
  const header = line.match(/句型（([^）]*)）/)
  if (header === null) return []
  const beforeComma = header[1].split('，')[0]
  return beforeComma
    .split('/')
    .map((part) => part.trim())
    .filter((part) => part !== '')
}

/**
 * 剥掉句型条目前的**演练序号**（`1 ` / `2 ` / `3 ` …）。
 *
 * ⚠️ **为什么必须剥**（2026-10-27 `[CR]` 实测）：教材的句型行里，每个「活动段落」
 *   的条目都以演练序号开头（`1 Oink...Oink...` / `2 Here you are.`）⇒
 *   不剥的话，同一句 `Here you are.` 会被解析成**两个不同的句子**
 *   （`2 Here you are.` 与 `Here you are.`）⇒ 归一化后不相等 ⇒
 *   G336 的「教材句子一条不剩」永远差一条，而**没有报错说明为什么**。
 *   ⇒ 实测全仓 28 条带序号的条目，**全部**是演练序号（没有一句真句子以数字开头）。
 *
 * ⚠️ 剥完之后若**只剩数字**（`4`），那是一条**被页面截断**的序号（原文如此）⇒
 *   它既不是句子也不是场景标签（是个残缺条目）⇒ **整条丢弃**，不进 `sentences` 也不进 `labels`。
 */
function stripDrillNumber(english: string): string {
  return english.replace(/^\d+\s+/, '')
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
 * ⚠️ **词表与句型都走 `englishPartOf`** —— 词表条目可以是多词的（`ice cream`），
 *   句型条目内部也有空格 ⇒ 两者都不能按空白切。
 * ⚠️ **句型行的匹配是「含 `句型（`」**（Story 2.6 改）——
 *   此前是「含 `句型（Say and act`」，于是**只认 `Say and act` 一个板块**：
 *   教材 1A Unit 4 / Unit 5 的句子在 `Look and say` / `Ask and answer` / `Play a game` 里
 *   ⇒ 那两个单元的句型行**整行被跳过**（DF-222 记的「单元 4 / 5 一句都没有」）。
 */
export function parseTextbookBook(file: string, text: string): TextbookBook {
  const units: TextbookUnit[] = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    const heading = lines[i].match(/^### .*Unit (\d+)/)
    if (!heading) continue
    const unitNo = Number(heading[1])

    let vocabulary: string[] = []
    let vocabularyRaw: string[] = []
    let itemCount = -1
    let markedCount = -1
    const sentences: TextbookSentence[] = []
    const labels: string[] = []
    const blocks: string[] = []
    let declaredBlocks: string[] = []
    /** 当前生效的板块（行内标记会切换它）。 */
    let currentBlock: string | null = null

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
        vocabularyRaw = items
        vocabulary = items.map((item) => englishPartOf(item)).filter((w) => w !== '')
        continue
      }
      if (line.includes('句型（')) {
        declaredBlocks = declaredBlocksOf(line)
        currentBlock = null
        const body = line.split('：').slice(1).join('：')
        const items = body
          .split(ITEM_SEPARATOR)
          .map((s) => s.trim())
          .filter((s) => s !== '')
        for (const item of items) {
          const raw = englishPartOf(item)
          if (raw === '') continue
          const english = stripDrillNumber(raw)
          // ⚠️ 剥掉序号后只剩数字 ⇒ 被页面截断的残条 ⇒ 整条丢弃。
          if (english === '' || /^\d+$/.test(english)) continue
          // ⚠️ **板块标记**（Story 2.6）：它切换「当前板块」，**自己不做卡**。
          const block = blockNameOf(english)
          if (block !== null) {
            blocks.push(block)
            currentBlock = block
            continue
          }
          if (isSentence(english)) {
            sentences.push({ text: english, block: currentBlock })
          } else {
            labels.push(english)
          }
        }
        continue
      }
    }

    units.push({
      unitNo,
      vocabulary,
      vocabularyRaw,
      sentences,
      labels,
      blocks,
      declaredBlocks,
      itemCount,
      markedCount,
    })
  }

  const total = text.match(/本册词条合计：\*\*(\d+)\*\*/)
  return { file, units, markedTotal: total ? Number(total[1]) : -1 }
}

/** 读盘上的两册教材并解析。 */
export function loadTextbookBooks(): TextbookBook[] {
  return CORPUS_FILES.map((file) => parseTextbookBook(file, readFileSync(join(CORPUS_DIR, file), 'utf8')))
}

/**
 * **G297 的判据本体** —— 一册词表必须**自洽**。
 *
 * ⚠️ **判据粒度**：逐单元比「标记数 vs 实际条目数」，再比「各单元之和 vs 本册合计」
 *   —— **三层**。只查一层的话，「每单元都对、合计错」与「合计对、某单元错」都会漏。
 *
 * ⚠️ **第 4 层（2026-10-27 `[CR]` 补）**：「实际条目数」必须等于**解析出的词条数**。
 * ⚠️ **第 5 层（同上）**：「词条后面紧跟的必须是中文」——
 *   这一层才抓得住**多词词条被截短**（`ice cream 冰淇淋` 被切成 `ice`）。
 *   ⇒ 第 4 层**抓不到截短**（条目数与词条数都还是 4），
 *     而第 5 层**抓得到**：切短之后，`ice` 后面紧跟的是 `cream`（英文）而不是中文。
 *   ⇒ 第 5 层**不依赖解析器自己**（它问的是教材原文，不是「我切出来的东西」），
 *     所以它**不是恒真断言** —— 这正是它能当守卫的原因。
 */
export function checkBookSelfConsistent(book: TextbookBook): string[] {
  const problems: string[] = []
  if (book.units.length === 0) {
    problems.push(`${book.file}：一个单元都没解析到 —— 判据在这份文件上会真空成立`)
    return problems
  }
  for (const u of book.units) {
    if (u.markedCount < 0) {
      problems.push(`${book.file} Unit ${u.unitNo}：找不到「（N 词）」标记`)
      continue
    }
    if (u.itemCount < 0) {
      problems.push(`${book.file} Unit ${u.unitNo}：找不到词表行`)
      continue
    }
    if (u.itemCount !== u.markedCount) {
      problems.push(
        `${book.file} Unit ${u.unitNo}：行末标「${u.markedCount} 词」，实际条目是 ${u.itemCount} 个`,
      )
    }
    if (u.vocabulary.length !== u.itemCount) {
      problems.push(
        `${book.file} Unit ${u.unitNo}：词表行有 ${u.itemCount} 个条目，解析出 ${u.vocabulary.length} 个词条`,
      )
    }
    for (let i = 0; i < u.vocabulary.length; i += 1) {
      const word = u.vocabulary[i]
      const raw = u.vocabularyRaw[i]
      if (raw === undefined) continue
      const rest = raw.startsWith(word) ? raw.slice(word.length).trim() : ''
      if (rest === '' || !/^[一-鿿]/.test(rest)) {
        problems.push(
          `${book.file} Unit ${u.unitNo}：词条「${word}」与教材原文「${raw}」对不上 —— ` +
            '英文部分被切短了（多词词条必须整体保留）',
        )
      }
    }
    // ⚠️ **第 6 层（2026-10-27 `[CR]` 补）——「场景 / 类别标签」这一族必须站得住**。
    //   `labels`（不做卡的条目）此前被解析出来却**从不消费** ⇒ 它是一个**死字段**，
    //   而「句子 vs 标签」的判据（英文部分是否以 `.` / `!` / `?` 结尾）也就没人看着。
    //   ⇒ 现在问两件**教材原文能回答**的事：
    //   ① 标签里**不许**有终止标点（有 ⇒ 它本该是句子 ⇒ 被当标签跳过了 ⇒ 少了一张卡）；
    //   ② 标签与句子**不许**归一化后相同（相同 ⇒ 同一段文字被算了两遍）。
    //   ⇒ 这一层让 `labels` 从死字段变成判据的输入。
    for (const label of u.labels) {
      if (isSentence(label)) {
        problems.push(
          `${book.file} Unit ${u.unitNo}：标签「${label}」以终止标点结尾 —— ` +
            '它本该是**句子**（要做卡），被当成标签跳过了',
        )
      }
    }
    const sentenceSet = new Set(u.sentences.map((sentence) => normalizeEnglish(sentence.text)))
    for (const label of u.labels) {
      const normalized = normalizeEnglish(label)
      if (sentenceSet.has(normalized)) {
        problems.push(
          `${book.file} Unit ${u.unitNo}：「${label}」既是标签又是句子 —— ` +
            '同一段文字被算了两次（要么多一张卡，要么少一张卡）',
        )
      }
    }
    // ⚠️ **第 7 层（Story 2.6）——「表头声明的板块」与「行内标记」必须对得上**。
    //   表头（`句型（A / B，逐句转写）`）是**给人看的摘要**，
    //   行内标记（`Look and say看图说`）是**机器事实**（每句的板块归属）。
    //   ⇒ 两者对不上 = 「表头说抄的是 `Say and act`、实际抄的是 `Listen and enjoy`」
    //     —— 而**儿歌台词不做卡**（README §五）⇒ 这种漂移会直接变成一张不该有的卡。
    //   ⇒ 判据只查「标记 ⊆ 声明」这一个方向：
    //     声明了但没有标记的板块**不算错**（有些单元的某个板块一句也没抄）。
    for (const block of u.blocks) {
      if (!u.declaredBlocks.includes(block)) {
        problems.push(
          `${book.file} Unit ${u.unitNo}：行内板块标记「${block}」不在表头声明的板块清单里` +
            `（表头写的是：${u.declaredBlocks.join(' / ') || '（空）'}）—— ` +
            '表头是给人看的摘要，行内标记是机器事实，两者必须对得上',
        )
      }
    }
  }
  const sum = book.units.reduce((a, u) => a + Math.max(u.itemCount, 0), 0)
  if (book.markedTotal !== sum) {
    problems.push(`${book.file}：「本册词条合计」写 ${book.markedTotal}，各单元相加是 ${sum}`)
  }
  const unitNos = book.units.map((u) => u.unitNo)
  const dup = unitNos.filter((n, i) => unitNos.indexOf(n) !== i)
  if (dup.length > 0) {
    problems.push(`${book.file}：单元号重复 —— ${dup.join(' / ')}`)
  }
  return problems
}

/**
 * 教材单元 ↔ 游戏单元的**映射**（**映射是本 story 的守卫之一** ⇒ 它住在可复用的地方）。
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
  if (!Number.isInteger(gameUnitNumber) || gameUnitNumber < 1 || gameUnitNumber > LAST_GAME_UNIT) {
    throw new Error(`游戏单元号必须是 1..${LAST_GAME_UNIT} 的整数，收到 ${gameUnitNumber}`)
  }
  const bookIndex = gameUnitNumber <= UNITS_PER_BOOK ? 0 : 1
  const book = books[bookIndex]
  if (book === undefined) {
    throw new Error(`教材文件缺失：books[${bookIndex}] —— 映射判据在这份文件上会真空成立`)
  }
  const unitNo = gameUnitNumber <= UNITS_PER_BOOK ? gameUnitNumber : gameUnitNumber - UNITS_PER_BOOK
  const unit = book.units.find((candidate) => candidate.unitNo === unitNo)
  if (unit === undefined) {
    throw new Error(`${book.file} 里找不到 Unit ${unitNo} —— 映射判据在这份文件上会真空成立`)
  }
  return { book, unit, bookIndex }
}

/**
 * **G351 的判据本体** —— 每一句都要有**板块归属**，且板块 ∈ **对话板块白名单**。
 *
 * ⚠️ **为什么这条判据住在解析器旁边**：它问的是**语料**的问题
 *   （「这句是不是儿歌里的」），不是内容层的问题 ⇒ 它的输入是 {@link TextbookUnit}。
 * ⚠️ **两个方向都要报**：
 *   · **没有归属**（`block === null`）⇒ 这一句在**哪个板块**都不知道
 *     ⇒ 它可能来自儿歌 / 故事台词（README §五：那些**不入库**）——
 *     而「不知道」本身就是不可接受的状态。
 *   · **归属不在白名单里**（比如 `Listen and enjoy`）⇒ 它**就是**儿歌 / 故事板块
 *     ⇒ 这一句不该做成句子卡。
 * ⚠️ **白名单是 {@link DIALOGUE_BLOCKS}**（唯一出处）——
 *   不在本文件里再抄一份「能做卡的板块」清单（R-37）。
 *
 * @param unit 被查的教材单元
 */
export function findBlockViolations(unit: TextbookUnit): string[] {
  const problems: string[] = []
  for (const sentence of unit.sentences) {
    if (sentence.block === null) {
      problems.push(
        `教材 Unit ${unit.unitNo} 的句子「${sentence.text}」没有板块归属 —— ` +
          '句型行里它的前面必须有一个板块标记',
      )
      continue
    }
    if (!(DIALOGUE_BLOCKS as readonly string[]).includes(sentence.block)) {
      problems.push(
        `教材 Unit ${unit.unitNo} 的句子「${sentence.text}」属于板块「${sentence.block}」—— ` +
          `它不在可做卡的板块白名单里（${DIALOGUE_BLOCKS.join(' / ')}）`,
      )
    }
  }
  return problems
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
