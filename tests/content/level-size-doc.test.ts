/**
 * G341 —— `docs/level-size.md` 的每个数字都要能从代码复算出来（Story 2.10 `[CR]` 补丁 15）。
 *
 * ── 守什么 ──────────────────────────────────────────────────────────────────
 * 换源之后「一局 = 10 题」（`QUESTIONS_PER_LEVEL`）与「1 关 = 1 教材 Unit」
 * 互相冲突 ⇒ 本项目第一次需要知道「**每个教材单元切成几局、每局几题**」。
 * 那份 census 落在 `docs/level-size.md` ⇒ 于是它必须**每一个数都能复算**，
 * 教材改了 / 切片口径改了，本文件必须**红**。
 *
 * ⚠️ **期望值全部来自实算**，没有一个是写死的：
 *   · 单词卡数 / 去重句卡数 = 教材语料（`tests/helpers/textbook-corpus.ts` 的**唯一**解析器）
 *     的实算；
 *   · 局序列 = `src/core/deck-slice.ts` 的 `QUESTIONS_PER_LEVEL`（唯一定义处）切出来。
 * ⇒ 写死「单元 2 = 11 条」这种字面量就是**拿实算值验实算值**（恒真断言），
 *   所以本文件一个数字字面量都不写。
 *
 * ── 为什么不是 G321 ─────────────────────────────────────────────────────────
 * G321 守的是 `docs/card-distribution.md`（卡型分布与词图 census）。
 * 本文件守的是**另一份文档、另一套口径**（局规模）⇒ 另起一个编号，
 * 免得「G341 是哪条」这个问题答不上来（R-36：编号全仓唯一）。
 *
 * ── 负向夹具（R-50 首选路径：不改磁盘文件，直接喂「改坏了的文档」）──────────
 * 夹具**按位置定位 + 按位置扰动**（不写死文档里的具体数值）——
 * 那些数值是实算值，夹具写死它们就会在下次内容变更时集体失效（假绿的温床）。
 *
 * 不在 `src/core/` 下 —— NFR16：测试全部在 `tests/`。
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { QUESTIONS_PER_LEVEL } from '../../src/core'
import { loadTextbookBooks, normalizeEnglish, textbookUnitOf } from '../helpers/textbook-corpus'
import { plain, sectionOf, tableRows } from '../fixtures/markdown-table'

/** 文档路径（相对仓库根）。 */
const DOC_PATH = 'docs/level-size.md'

/** 仓库根（`process.cwd()` 是 vitest 的工作目录 = 仓库根）。 */
const root = process.cwd()

/** 一处漂移。 */
interface Drift {
  /** 漂移的位置（人可读：哪一节、哪一行、哪一列）。 */
  where: string
  /** 漂移的内容（文档写的 vs 实算的）。 */
  detail: string
}

/** 某个单元的实算规模。 */
interface UnitCensus {
  /** 单词卡数 = 教材 `Look and learn` 的词数。 */
  readonly words: number
  /** 去重后的句卡数 = 教材 `Say and act` 里的句子数（同一句只算一次）。 */
  readonly sentences: number
  /** 词条总数 N = 单词卡 + 句卡。 */
  readonly total: number
  /** 局序列（每局几题）。 */
  readonly levels: readonly number[]
  /** 末局题数。 */
  readonly last: number
}

/**
 * 某单元的实算规模。
 *
 * ⚠️ **局序列按 `QUESTIONS_PER_LEVEL` 切**，不写死 10 ——
 *   切片口径是 `src/core/deck-slice.ts` 的**唯一定义处**（R-02），
 *   这里抄一个 10 就是第二份事实源。
 */
function censusOf(unitNumber: number, books = loadTextbookBooks()): UnitCensus {
  const { unit } = textbookUnitOf(unitNumber, books)
  // ⚠️ **去重**按归一化后的句子（去标点 + 折叠空白 + 小写）——
  //   教材的转写里同一句话会在多个演练段落里重复出现。
  const sentences = new Set(unit.sentences.map(normalizeEnglish))
  const total = unit.vocabulary.length + sentences.size
  const levels: number[] = []
  let left = total
  while (left > 0) {
    const size = Math.min(QUESTIONS_PER_LEVEL, left)
    levels.push(size)
    left -= size
  }
  return {
    words: unit.vocabulary.length,
    sentences: sentences.size,
    total,
    levels,
    last: levels[levels.length - 1] ?? 0,
  }
}

/** 全部 24 个单元的实算规模。 */
function allCensus(): readonly { unit: number; census: UnitCensus }[] {
  const books = loadTextbookBooks()
  const out: { unit: number; census: UnitCensus }[] = []
  for (let n = 1; n <= 24; n += 1) {
    out.push({ unit: n, census: censusOf(n, books) })
  }
  return out
}

/** §2 逐单元表：24 行 × 5 列逐格比对。 */
function checkSection2(raw: string): Drift[] {
  const drift: Drift[] = []
  const section = sectionOf(raw, '## 2.')
  if (section === '') {
    drift.push({ where: '§2', detail: '找不到「## 2.」小节 —— 逐单元实算表不在文档里了' })
    return drift
  }
  const rows = tableRows(section)
  const dataRows = rows.filter((cells) => /^\d+$/.test(plain(cells[0])))
  if (dataRows.length !== 24) {
    drift.push({
      where: '§2',
      detail: `逐单元表有 ${dataRows.length} 行数据，应为 24 行（教材 24 个单元）`,
    })
    return drift
  }
  const columnNames = ['单词卡', '句卡', '词条总数 N', '局序列', '末局题数']
  for (const cells of dataRows) {
    const unit = Number(plain(cells[0]))
    const c = censusOf(unit)
    const expected = [
      String(c.words),
      String(c.sentences),
      String(c.total),
      c.levels.join(' + '),
      String(c.last),
    ]
    for (let i = 0; i < expected.length; i += 1) {
      const actual = plain(cells[i + 1] ?? '')
      if (actual !== expected[i]) {
        drift.push({
          where: `§2 单元 ${unit} · ${columnNames[i]}`,
          detail: `文档写 ${actual}，实算 ${expected[i]}`,
        })
      }
    }
  }
  return drift
}

/** §3 汇总表：三行的单元数与单元清单。 */
function checkSection3(raw: string): Drift[] {
  const drift: Drift[] = []
  const section = sectionOf(raw, '## 3.')
  if (section === '') {
    drift.push({ where: '§3', detail: '找不到「## 3.」小节 —— 三个汇总数字不在文档里了' })
    return drift
  }
  const rows = tableRows(section)
  const census = allCensus()

  // ── 三行的判据（全部实算，不写死）────────────────────────────────────────
  const lastBelow5 = census.filter((row) => row.census.last < 5).map((row) => row.unit)
  const singleLevel4to5 = census
    .filter((row) => row.census.levels.length === 1 && row.census.total >= 4 && row.census.total <= 5)
    .map((row) => row.unit)
  const singleLevelAtMost5 = census
    .filter((row) => row.census.levels.length === 1 && row.census.total <= 5)
    .map((row) => row.unit)

  const expectations: { readonly key: string; readonly units: readonly number[] }[] = [
    { key: '末局不足 5 题', units: lastBelow5 },
    { key: '整本只有一局', units: singleLevel4to5 },
    { key: '单局不超过 5 题', units: singleLevelAtMost5 },
  ]

  for (const { key, units } of expectations) {
    const row = rows.find((cells) => plain(cells[0]).includes(key))
    if (row === undefined) {
      drift.push({ where: '§3', detail: `汇总表里找不到「${key}」那一行` })
      continue
    }
    const documentedCount = Number(plain(row[1] ?? ''))
    if (!Number.isFinite(documentedCount)) {
      drift.push({ where: `§3 · ${key}`, detail: '解析不出单元数' })
      continue
    }
    if (documentedCount !== units.length) {
      drift.push({
        where: `§3 · ${key} · 单元数`,
        detail: `文档写 ${documentedCount}，实算 ${units.length}（${units.join('、')}）`,
      })
    }
    const documentedUnits = plain(row[2] ?? '')
      .split('、')
      .map((piece) => Number(piece.trim()))
      .filter((n) => Number.isFinite(n))
    if (
      documentedUnits.length !== units.length ||
      documentedUnits.some((value, index) => value !== units[index])
    ) {
      drift.push({
        where: `§3 · ${key} · 单元清单`,
        detail: `文档写 [${documentedUnits.join('、')}]，实算 [${units.join('、')}]`,
      })
    }
  }
  return drift
}

/** 文档原文（负向夹具在它上面改）。 */
const docText = readFileSync(join(root, DOC_PATH), 'utf8')

describe('G341 —— `docs/level-size.md` 的每个数字都要能从代码复算出来', () => {
  it('§2 逐单元表（24 行 × 5 列）逐格等于教材 + 切片口径的实算值', () => {
    expect(
      checkSection2(docText),
      '§2 的逐单元表与教材语料 / `QUESTIONS_PER_LEVEL` 的实算值不一致 —— 回改本文件。\n' +
        '⚠️ 事实源是 `docs/textbook-oxford-shanghai/`（解析器 = `tests/helpers/textbook-corpus.ts`）' +
        '与 `src/core/deck-slice.ts` ⇒ 改教材或改切片口径时，本文件必须跟着改。',
    ).toEqual([])
  })

  it('§3 的三个汇总数字与单元清单都等于实算值', () => {
    expect(
      checkSection3(docText),
      '§3 的汇总数字与实算不一致 —— 回改本文件。\n' +
        '⚠️ 这三个数字是「哪些单元的局不成局」的唯一口径 ⇒ 引用它们时必须用这里的值。',
    ).toEqual([])
  })
})

// ── 负向夹具（R-50 / R-51）─────────────────────────────────────────────────

/** 改一行表格里的某个单元格（按行首模式定位行、按 `split('|')` 的序号取列）。 */
function patchCell(
  doc: string,
  rowPattern: RegExp,
  cellIndex: number,
  patch: (cell: string) => string,
): string {
  const line = doc.split('\n').find((candidate) => rowPattern.test(candidate))
  if (line === undefined) return doc
  const cells = line.split('|')
  if (cells[cellIndex] === undefined) return doc
  cells[cellIndex] = patch(cells[cellIndex])
  return doc.replace(line, () => cells.join('|'))
}

/** 把单元格里的第一个整数加 1。 */
function bumpFirstInteger(cell: string): string {
  return cell.replace(/(\d+)/, (_match, num: string) => `${Number(num) + 1}`)
}

/** 把单元格里的「N + M」里的 N 加 1（局序列列）。 */
function bumpFirstLevel(cell: string): string {
  return cell.replace(/(\d+)/, (_match, num: string) => `${Number(num) + 1}`)
}

interface NegativeCase {
  readonly name: string
  readonly breakDoc: (doc: string) => string
  readonly expectWhere: RegExp
}

const NEGATIVE_CASES: readonly NegativeCase[] = [
  {
    name: '§2 某个单元的单词卡数改一位',
    breakDoc: (doc) => patchCell(doc, /^\|\s*3\s*\|/, 2, bumpFirstInteger),
    expectWhere: /§2 单元 3 · 单词卡/,
  },
  {
    name: '§2 某个单元的句卡数改一位',
    breakDoc: (doc) => patchCell(doc, /^\|\s*2\s*\|/, 3, bumpFirstInteger),
    expectWhere: /§2 单元 2 · 句卡/,
  },
  {
    name: '§2 某个单元的词条总数改一位',
    breakDoc: (doc) => patchCell(doc, /^\|\s*15\s*\|/, 4, bumpFirstInteger),
    expectWhere: /§2 单元 15 · 词条总数 N/,
  },
  {
    name: '§2 某个单元的局序列改一位',
    breakDoc: (doc) => patchCell(doc, /^\|\s*2\s*\|/, 5, bumpFirstLevel),
    expectWhere: /§2 单元 2 · 局序列/,
  },
  {
    name: '§2 某个单元的末局题数改一位',
    breakDoc: (doc) => patchCell(doc, /^\|\s*24\s*\|/, 6, bumpFirstInteger),
    expectWhere: /§2 单元 24 · 末局题数/,
  },
  {
    name: '§3 的「末局不足 5 题」那一行的单元数改一位',
    breakDoc: (doc) => patchCell(doc, /^\|\s*末局不足 5 题\s*\|/, 2, bumpFirstInteger),
    expectWhere: /§3 · 末局不足 5 题 · 单元数/,
  },
  {
    name: '§3 的「末局不足 5 题」那一行的单元清单少一个',
    breakDoc: (doc) =>
      patchCell(doc, /^\|\s*末局不足 5 题\s*\|/, 3, (cell) => cell.replace('24', '')),
    expectWhere: /§3 · 末局不足 5 题 · 单元清单/,
  },
  {
    name: '§3 的「整本只有一局」那一行的单元数改一位',
    breakDoc: (doc) => patchCell(doc, /^\|\s*整本只有一局/, 2, bumpFirstInteger),
    expectWhere: /§3 · 整本只有一局 · 单元数/,
  },
  {
    name: '§3 的「单局不超过 5 题」那一行的单元数改一位',
    breakDoc: (doc) => patchCell(doc, /^\|\s*单局不超过 5 题/, 2, bumpFirstInteger),
    expectWhere: /§3 · 单局不超过 5 题 · 单元数/,
  },
]

describe('G341 —— 负向夹具：每一处漂移都要被报出来（R-50 / R-51）', () => {
  for (const testCase of NEGATIVE_CASES) {
    it(`${testCase.name} ⇒ 必须报出漂移`, () => {
      const broken = testCase.breakDoc(docText)
      expect(broken, `负向夹具「${testCase.name}」没有真的改动文档 —— 夹具本身失效了`).not.toBe(docText)

      const drifts = [...checkSection2(broken), ...checkSection3(broken)]
      expect(
        drifts.length,
        `负向夹具「${testCase.name}」没有报出任何漂移 —— 这条守卫对这种改法是零反应（假绿）`,
      ).toBeGreaterThan(0)
      expect(
        drifts.map((d) => d.where).join(' / '),
        `负向夹具「${testCase.name}」报出的位置不对 —— 期望有一处匹配 ${testCase.expectWhere}`,
      ).toMatch(testCase.expectWhere)
    })
  }
})
