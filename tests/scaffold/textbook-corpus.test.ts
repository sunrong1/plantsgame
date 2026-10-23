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
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../', import.meta.url))

const CORPUS_DIR = `${root}docs/textbook-oxford-shanghai/`
const CORPUS_FILES = ['01a-units.md', '01b-units.md']
const GDD_PATH = `${root}_bmad-output/planning-artifacts/gdds/gdd-plants-game-2026-10-11/gdd.md`

/** 一个单元的词表解析结果。 */
export interface CorpusUnit {
  /** 教材里的单元号（1–12，每册各一套）。 */
  unitNo: number
  /** 词表条目（按 `｜` 分隔的实际条目数）。 */
  itemCount: number
  /** 行末「（N 词）」的人工标记数。 */
  markedCount: number
}

/** 一册的解析结果。 */
export interface CorpusBook {
  file: string
  units: CorpusUnit[]
  /** 行末「本册词条合计：N」的人工计数。 */
  markedTotal: number
}

/**
 * 解析一册词表。
 *
 * ⚠️ **两个数都要取**（实际条目数 + 人工标记数）—— 判据要比对它们，
 *   只取一个就等于「用抄录者自己的话来验抄录者」。
 */
export function parseBook(file: string, text: string): CorpusBook {
  const units: CorpusUnit[] = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const heading = lines[i].match(/^### .*Unit (\d+)/)
    if (!heading) continue
    const unitNo = Number(heading[1])
    // 词表行：本单元第一行含「词表（Look and learn）」的行
    let itemCount = -1
    let markedCount = -1
    for (let j = i + 1; j < lines.length && !lines[j].startsWith('### '); j++) {
      const l = lines[j]
      if (!l.includes('词表（Look and learn）')) continue
      const marker = l.match(/（(\d+)\s*词）/)
      markedCount = marker ? Number(marker[1]) : -1
      const body = l.split('：').slice(1).join('：')
      const withoutMarker = body.replace(/　*_\s*（\d+\s*词）_\s*$/, '')
      itemCount = withoutMarker
        .split('｜')
        .map((s) => s.trim())
        .filter((s) => s !== '').length
      break
    }
    units.push({ unitNo, itemCount, markedCount })
  }
  const total = text.match(/本册词条合计：\*\*(\d+)\*\*/)
  return { file, units, markedTotal: total ? Number(total[1]) : -1 }
}

/**
 * G297 的判据本体：一册词表必须**自洽**。
 *
 * ⚠️ **判据粒度**：逐单元比「标记数 vs 实际条目数」，再比「各单元之和 vs 本册合计」
 *   —— **三层**。只查一层的话，「每单元都对、合计错」与「合计对、某单元错」都会漏。
 */
export function checkBookSelfConsistent(book: CorpusBook): string[] {
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

const books = CORPUS_FILES.map((f) => parseBook(f, readFileSync(`${CORPUS_DIR}${f}`, 'utf8')))
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
