/**
 * 教材词表（`docs/textbook-oxford-shanghai/`）必须是**可校验的事实源**。
 *
 * ── 为什么现在需要这两条 ──────────────────────────────────────────────────
 *   2026-10-23 用户裁决「词表来源 = 教材逐单元抄录」+「1 关 = 1 教材 Unit」，
 *   2026-10-24 的 `[CC]` 据此把 GDD 的关卡数改成 **24**、全书词图改成 **97 张**
 *   ⇒ **整条内容管线（每关 N 条、卡型分布锚点、选项数档位、词图批次）都挂在
 *   这份词表上**。
 *
 *   而这份词表是**手抄的 markdown**，每行末尾有一个「（N 词）」的人工计数：
 *   抄录时多写一个词而忘了改那个计数，**没有任何机制会报错** ——
 *   而错了的后果是「全书词图数错、每关 N 错、下一轮重算全错」。
 *   ⇒ **G297** 守它自己的自洽（标记数 == 实际条目数 == 每册合计）；
 *   ⇒ **G298** 守它与 GDD 的对得上（单元数 == 关卡数、词数 == GDD 写的全书面词卡数）。
 *
 * ── 两条判据的分工 ─────────────────────────────────────────────────────────
 *   · **G297 守「内部」**：抄录时打错字的那一半。
 *   · **G298 守「对外」**：抄对了，但 GDD 忘了跟着改的那一半。
 *   ⚠️ G298 的价值在 **DF-201 闭合那天**：教材版本一确认，词表就要重抄 ——
 *     重抄完若 GDD 没跟着改，G298 当场红 ⇒ **不会静默漂移**。
 *
 * 出处：`_bmad-output/planning-artifacts/sprint-change-proposal-2026-10-24.md`（口径变更）
 *       与 `sprint-change-proposal-2026-10-24-2.md`。
 *
 * 不在 src/core/ 下 —— NFR16：测试全部在 tests/。
 *
 * ── 📎 2026-10-27（Story 2.10 `[CR]`）：本文件**不再自带解析器** ────────────
 *   此前这里另有一份 `parseBook()`，规则与 `tests/helpers/textbook-corpus.ts`
 *   的 `parseTextbookBook()` **不一样**（它只按 `｜` 数条目、不切英文部分）⇒
 *   **两份解析器 = 两条复制链**（R-37），而「教材改了它会红」这个卖点
 *   只在 Story 2.10 那份上成立。
 *   ⇒ 现在**解析与自洽判据都住在 helpers 里**，本文件只负责
 *     **G298（词表 ↔ GDD 对得上）** 与反向自测。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  checkBookSelfConsistent,
  loadTextbookBooks,
  type TextbookBook,
} from '../helpers/textbook-corpus'

const root = fileURLToPath(new URL('../../', import.meta.url))

const GDD_PATH = `${root}_bmad-output/planning-artifacts/gdds/gdd-plants-game-2026-10-11/gdd.md`

/** 一册的解析结果 —— 来自**唯一**的解析器（`tests/helpers/textbook-corpus.ts`）。 */
type CorpusBook = TextbookBook

/** 剥掉 markdown 的 frontmatter（`---` 包围的那一段）。 */
function bodyOf(md: string): string {
  const m = md.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/)
  return m ? md.slice(m[0].length) : md
}

/** GDD 正文里「全书单词卡 = N 词 ⇒ N 张」的那一对数字。 */
export function gddWordImagePair(gddBody: string): { words: number; images: number } | null {
  const m = gddBody.match(/(\d+)\s*词\s*⇒\s*(\d+)\s*张/)
  return m ? { words: Number(m[1]), images: Number(m[2]) } : null
}

/** GDD 正文里「全书 N 个单词词」那一处。 */
export function gddBookWordCount(gddBody: string): number | null {
  const m = gddBody.match(/(\d+)\s*个单词词/)
  return m ? Number(m[1]) : null
}

/**
 * G298 的判据本体：词表与 GDD 必须对得上。
 *
 * ⚠️ **要同时对两处 GDD 正文**：§Asset Requirements 的「97 词 ⇒ 97 张」
 *   与 §Risks 的「97 个单词词」—— 只查一处的话，另一处会静静漂着。
 */
export function checkCorpusMatchesGdd(
  books: CorpusBook[],
  gddBody: string,
  gddLevelCount: number | null,
): string[] {
  const problems: string[] = []
  const unitCount = books.reduce((a, b) => a + b.units.length, 0)
  const wordCount = books.reduce(
    (a, b) => a + b.units.reduce((s, u) => s + Math.max(u.itemCount, 0), 0),
    0,
  )
  if (gddLevelCount === null) {
    problems.push('GDD 正文里取不到「关卡总数 N 关」这个数')
  } else if (unitCount !== gddLevelCount) {
    problems.push(`词表是 ${unitCount} 个单元，GDD 正文写的是 ${gddLevelCount} 关`)
  }
  const pair = gddWordImagePair(gddBody)
  if (pair === null) {
    problems.push('GDD 正文里取不到「N 词 ⇒ N 张」那一对数字')
  } else {
    if (pair.words !== wordCount) {
      problems.push(`GDD 正文写「${pair.words} 词」，词表实测是 ${wordCount} 词`)
    }
    if (pair.images !== pair.words) {
      problems.push(`GDD 正文写「${pair.words} 词 ⇒ ${pair.images} 张」，两个数不相等`)
    }
  }
  const bookWords = gddBookWordCount(gddBody)
  if (bookWords === null) {
    problems.push('GDD 正文里取不到「全书 N 个单词词」那一处')
  } else if (bookWords !== wordCount) {
    problems.push(`GDD 正文写「全书 ${bookWords} 个单词词」，词表实测是 ${wordCount} 词`)
  }
  return problems
}

// ── 被守卫的真实文件 ───────────────────────────────────────────────────────

const books = loadTextbookBooks()
const gddBody = bodyOf(readFileSync(GDD_PATH, 'utf8'))
const gddLevelCount = (() => {
  const m = gddBody.match(/关卡总数[^。]*?(\d+)\s*关/)
  return m ? Number(m[1]) : null
})()

describe('G297 教材词表必须自洽（标记数 == 实际条目数 == 本册合计）', () => {
  it('G297.1 两册词表逐单元自洽，且每册的合计等于各单元之和', () => {
    const problems = books.flatMap((b) => checkBookSelfConsistent(b))
    expect(problems, `教材词表不自洽：\n${problems.join('\n')}`).toEqual([])
  })

  it('G297.2 反向自测：把某一单元的行末标记数改掉，必须红（判据要比对两个数）', () => {
    const book = books[0]
    const first = book.units[0]
    expect(first, '构造失效：第一册里一个单元都没解析到').toBeDefined()
    const broken: CorpusBook = {
      ...book,
      units: book.units.map((u, i) => (i === 0 ? { ...u, markedCount: u.markedCount + 1 } : u)),
    }
    expect(
      checkBookSelfConsistent(broken).some((p) => p.includes('Unit')),
      '构造失效：把行末标记数 +1 竟没被判出来 —— 判据只数了一个来源',
    ).toBe(true)
  })
  it('G297.3 反向自测：给标签加一条「以终止标点结尾」的条目，必须红（labels 不是死字段）', () => {
    // ⚠️ **第 6 层判据的反向自测**（2026-10-27 `[CR]` 补）：
    //   `labels`（场景 / 类别标签）此前被解析出来却**从不消费** ⇒ 死字段，
    //   而「句子 vs 标签」的判据（英文部分是否以终止标点结尾）也就没人看着。
    //   ⇒ 这一层让 `labels` 成为判据的输入；没有反向自测就不知道它是不是恒绿。
    const book = books[0]
    const first = book.units[0]
    expect(first, '构造失效：第一册里一个单元都没解析到').toBeDefined()
    const broken: CorpusBook = {
      ...book,
      units: book.units.map((u, i) =>
        i === 0 ? { ...u, labels: [...u.labels, 'Greetings!'] } : u,
      ),
    }
    expect(
      checkBookSelfConsistent(broken).some((p) => p.includes('终止标点')),
      '构造失效：把一条标签改成「以终止标点结尾」竟没被判出来 —— labels 这一层是恒绿的',
    ).toBe(true)
  })
})

describe('G298 教材词表与 GDD 必须对得上', () => {
  it('G298.1 词表的单元数 == GDD 的关卡数，词数 == GDD 的全书单词卡数', () => {
    const problems = checkCorpusMatchesGdd(books, gddBody, gddLevelCount)
    expect(problems, `词表与 GDD 对不上：\n${problems.join('\n')}`).toEqual([])
  })

  it('G298.2 反向自测：把 GDD 的「97 词」改成 96，必须红（存在性检查抓不住这种错）', () => {
    const broken = gddBody.replace(
      /(\d+)\s*词\s*⇒\s*(\d+)\s*张/,
      (_m, w: string, imgs: string) => `${Number(w) - 1} 词 ⇒ ${imgs} 张`,
    )
    expect(broken, '构造失效：没能在 GDD 正文里找到「N 词 ⇒ N 张」那一处').not.toBe(gddBody)
    const problems = checkCorpusMatchesGdd(books, broken, gddLevelCount)
    expect(
      problems.some((p) => p.includes('词')),
      `构造失效：把 GDD 的词数改掉竟没被判出来：\n${problems.join('\n')}`,
    ).toBe(true)
  })
})
