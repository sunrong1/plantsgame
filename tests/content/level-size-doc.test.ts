/**
 * G341 —— `docs/level-size.md` 的每个数字都要能从代码复算出来（Story 2.10 `[CR]` 补丁 15）。
 * G344 —— 同一份文档 §1.4 的「可行句卡数窗口」表（2026-10-28，DF-222 实测）。
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
 *   · 局序列 = `src/core/deck-slice.ts` 的 `QUESTIONS_PER_LEVEL`（唯一定义处）切出来；
 *   · §1.4 的窗口 = `src/content/distribution.ts` 的 `targetCardDistribution`
 *     加 §5.1.1 判据 2（`|c_k − s_k(n) × N| ≤ 0.5`）枚举出来。
 * ⇒ 写死「单元 2 = 11 条」这种字面量就是**拿实算值验实算值**（恒真断言），
 *   所以本文件一个数字字面量都不写。
 *
 * ── 为什么不是 G321 ─────────────────────────────────────────────────────────
 * G321 守的是 `docs/card-distribution.md`（卡型分布与词图 census）。
 * 本文件守的是**另一份文档、另一套口径**（局规模）⇒ 另起一个编号，
 * 免得「G341 是哪条」这个问题答不上来（R-36：编号全仓唯一）。
 * G344 与 G341 同属一份文档，但守的是**另一张表**（§1.4 的窗口）⇒ 同样另起编号。
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
import { targetCardDistribution } from '../../src/content/distribution'
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

/**
 * 逐族误差判据的容差。
 *
 * ⚠️ **`1e-9` 不是宽容度，是浮点补丁** —— 份额是分数（分母 276），
 * 双精度在「误差恰为 0.5」的边界上会算出 `0.5000000000000071` 这种值
 * （`docs/card-distribution.md` §5.1.1 记过这个坑）⇒ 精确算术下**是解**的
 * 组合会被浮点判掉。⇒ 判据写成 `<= 0.5 + 1e-9`，与精确算术同解。
 */
const DISTRIBUTION_EPSILON = 1e-9

/**
 * 枚举句卡数时的搜索上界。
 *
 * ⚠️ 真实上限是 24（教材某单元的全部对话句），写 60 是留余量；
 * **它不是规则的一部分** —— 窗口的两端都由实算决定，不受这个上界影响
 * （上界只要大于真实可能的句卡数即可）。
 */
const MAX_SENTENCES = 60

/** 某单元的可行句卡数窗口（`null` = 无解）。 */
interface SentenceWindow {
  /** 窗口下界（含）。 */
  readonly lo: number
  /** 窗口上界（含）。 */
  readonly hi: number
}

/**
 * 某单元的可行句卡数窗口。
 *
 * **判据逐字取 `docs/card-distribution.md` §5.1.1 判据 2**：`|c_k − s_k(n) × N| ≤ 0.5`
 * 对 word / keyword / response 三族各自成立，且 `c_word = w`（单词卡 = 教材词数，
 * 守卫 G335 钉死）⇒ 固定 (n, w) 之后，句卡数 S 落进一个闭区间。
 *
 * ⚠️ **份额取自 `targetCardDistribution`（唯一实现）** ——
 *   这里不自己复刻一份插值公式（那会变成第二个事实源，R-37）。
 */
function windowOf(unitNumber: number, words: number): SentenceWindow | null {
  return windowWithEpsilon(unitNumber, words, DISTRIBUTION_EPSILON)
}

/**
 * 同上，但容差可调 —— 只给「EPS 是补丁还是宽容度」那条对照用例用。
 *
 * ⚠️ **生产路径不走这个函数**（走 {@link windowOf}）——
 *   这里把容差暴露出来，只是为了让那条用例能在同一套枚举逻辑上跑两遍。
 */
function windowWithEpsilon(
  unitNumber: number,
  words: number,
  epsilon: number,
): SentenceWindow | null {
  const dist = targetCardDistribution(unitNumber)
  const feasible: number[] = []
  for (let sentences = 0; sentences <= MAX_SENTENCES; sentences += 1) {
    const total = words + sentences
    if (total === 0) continue
    if (Math.abs(words - dist.word * total) > 0.5 + epsilon) continue
    for (let keyword = 0; keyword <= sentences; keyword += 1) {
      const response = sentences - keyword
      if (
        Math.abs(keyword - dist.keyword * total) <= 0.5 + epsilon &&
        Math.abs(response - dist.response * total) <= 0.5 + epsilon
      ) {
        feasible.push(sentences)
        break
      }
    }
  }
  if (feasible.length === 0) return null
  return { lo: Math.min(...feasible), hi: Math.max(...feasible) }
}

/** 某单元相对窗口的判定（文档 §1.4 的「判定」列）。 */
function verdictOf(unitNumber: number, words: number, sentences: number): string {
  const win = windowOf(unitNumber, words)
  if (win === null) return '无解'
  if (sentences < win.lo) return '低于窗口'
  if (sentences > win.hi) return '高于窗口'
  return '窗口内'
}

/** §1.4 窗口表：24 行 × 4 列逐格比对。 */
function checkSection14(raw: string): Drift[] {
  const drift: Drift[] = []
  const section = sectionOf(raw, '### 1.4')
  if (section === '') {
    drift.push({ where: '§1.4', detail: '找不到「### 1.4」小节 —— 窗口表不在文档里了' })
    return drift
  }
  const rows = tableRows(section)
  const dataRows = rows.filter((cells) => /^\d+$/.test(plain(cells[0])))
  if (dataRows.length !== 24) {
    drift.push({
      where: '§1.4',
      detail: `窗口表有 ${dataRows.length} 行数据，应为 24 行（教材 24 个单元）`,
    })
    return drift
  }
  const columnNames = ['教材词数', '可行句卡数窗口', '当前语料的句卡数', '判定']
  for (const cells of dataRows) {
    const unit = Number(plain(cells[0]))
    const c = censusOf(unit)
    const win = windowOf(unit, c.words)
    const expected = [
      String(c.words),
      win === null ? '——' : `${win.lo}–${win.hi}`,
      String(c.sentences),
      verdictOf(unit, c.words, c.sentences),
    ]
    for (let i = 0; i < expected.length; i += 1) {
      const actual = plain(cells[i + 1] ?? '')
      if (actual !== expected[i]) {
        drift.push({
          where: `§1.4 单元 ${unit} · ${columnNames[i]}`,
          detail: `文档写 ${actual}，实算 ${expected[i]}`,
        })
      }
    }
  }
  return drift
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
  text: string,
  rowPattern: RegExp,
  cellIndex: number,
  patch: (cell: string) => string,
): string {
  const line = text.split('\n').find((candidate) => rowPattern.test(candidate))
  if (line === undefined) return text
  const cells = line.split('|')
  if (cells[cellIndex] === undefined) return text
  cells[cellIndex] = patch(cells[cellIndex])
  return text.replace(line, () => cells.join('|'))
}

/**
 * **在某个小节里**改一行表格的某个单元格。
 *
 * ⚠️ **必须限定小节** —— 文档里有多张表，行首都可能是 `| 3 |`；
 *   不限定的话夹具会改到**另一张表**的同名行上（改坏了却报不出期望的位置）。
 */
function patchCellInSection(
  doc: string,
  headingPrefix: string,
  rowPattern: RegExp,
  cellIndex: number,
  patch: (cell: string) => string,
): string {
  const section = sectionOf(doc, headingPrefix)
  if (section === '') return doc
  const patched = patchCell(section, rowPattern, cellIndex, patch)
  if (patched === section) return doc
  return doc.replace(section, () => patched)
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
    breakDoc: (doc) =>
      patchCellInSection(doc, '## 2.', /^\|\s*3\s*\|/, 2, bumpFirstInteger),
    expectWhere: /§2 单元 3 · 单词卡/,
  },
  {
    name: '§2 某个单元的句卡数改一位',
    breakDoc: (doc) =>
      patchCellInSection(doc, '## 2.', /^\|\s*2\s*\|/, 3, bumpFirstInteger),
    expectWhere: /§2 单元 2 · 句卡/,
  },
  {
    name: '§2 某个单元的词条总数改一位',
    breakDoc: (doc) =>
      patchCellInSection(doc, '## 2.', /^\|\s*15\s*\|/, 4, bumpFirstInteger),
    expectWhere: /§2 单元 15 · 词条总数 N/,
  },
  {
    name: '§2 某个单元的局序列改一位',
    breakDoc: (doc) =>
      patchCellInSection(doc, '## 2.', /^\|\s*2\s*\|/, 5, bumpFirstLevel),
    expectWhere: /§2 单元 2 · 局序列/,
  },
  {
    name: '§2 某个单元的末局题数改一位',
    breakDoc: (doc) =>
      patchCellInSection(doc, '## 2.', /^\|\s*24\s*\|/, 6, bumpFirstInteger),
    expectWhere: /§2 单元 24 · 末局题数/,
  },
  {
    name: '§3 的「末局不足 5 题」那一行的单元数改一位',
    breakDoc: (doc) =>
      patchCellInSection(doc, '## 3.', /^\|\s*末局不足 5 题\s*\|/, 2, bumpFirstInteger),
    expectWhere: /§3 · 末局不足 5 题 · 单元数/,
  },
  {
    name: '§3 的「末局不足 5 题」那一行的单元清单少一个',
    breakDoc: (doc) =>
      patchCellInSection(doc, '## 3.', /^\|\s*末局不足 5 题\s*\|/, 3, (cell) =>
        cell.replace('24', ''),
      ),
    expectWhere: /§3 · 末局不足 5 题 · 单元清单/,
  },
  {
    name: '§3 的「整本只有一局」那一行的单元数改一位',
    breakDoc: (doc) =>
      patchCellInSection(doc, '## 3.', /^\|\s*整本只有一局/, 2, bumpFirstInteger),
    expectWhere: /§3 · 整本只有一局 · 单元数/,
  },
  {
    name: '§3 的「单局不超过 5 题」那一行的单元数改一位',
    breakDoc: (doc) =>
      patchCellInSection(doc, '## 3.', /^\|\s*单局不超过 5 题/, 2, bumpFirstInteger),
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

// ── G344 —— §1.4 的窗口表 ──────────────────────────────────────────────────

const WINDOW_NEGATIVE_CASES: readonly NegativeCase[] = [
  {
    name: '§1.4 某个单元的教材词数改一位',
    breakDoc: (doc) =>
      patchCellInSection(doc, '### 1.4', /^\|\s*3\s*\|/, 2, bumpFirstInteger),
    expectWhere: /§1\.4 单元 3 · 教材词数/,
  },
  {
    name: '§1.4 某个单元的可行句卡数窗口改一位',
    breakDoc: (doc) =>
      patchCellInSection(doc, '### 1.4', /^\|\s*3\s*\|/, 3, bumpFirstInteger),
    expectWhere: /§1\.4 单元 3 · 可行句卡数窗口/,
  },
  {
    name: '§1.4 某个单元的当前句卡数改一位',
    breakDoc: (doc) =>
      patchCellInSection(doc, '### 1.4', /^\|\s*2\s*\|/, 4, bumpFirstInteger),
    expectWhere: /§1\.4 单元 2 · 当前语料的句卡数/,
  },
  {
    name: '§1.4 某个单元的判定改一个词',
    breakDoc: (doc) =>
      patchCellInSection(doc, '### 1.4', /^\|\s*3\s*\|/, 5, (cell) =>
        cell.replace('低于窗口', '窗口内'),
      ),
    expectWhere: /§1\.4 单元 3 · 判定/,
  },
]

describe('G344 —— §1.4 的「可行句卡数窗口」表逐格等于实算值', () => {
  it('24 行 × 4 列（教材词数 / 窗口 / 当前句卡数 / 判定）逐格相等', () => {
    expect(
      checkSection14(docText),
      '§1.4 的窗口表与「末锚点曲线 + 教材语料」的实算值不一致 —— 回改本文件。\n' +
        '⚠️ 窗口 = 固定 (单元号, 教材词数) 后满足 `|c_k − s_k(n) × N| ≤ 0.5` ' +
        '（`c_word = 教材词数`）的句卡数闭区间 ⇒ 曲线锚点改了或教材改了，本文件必须跟着改。',
    ).toEqual([])
  })

  it('浮点补丁不改变任何一个窗口（EPS 必须是补丁，不是宽容度）', () => {
    // ⚠️ **这一条防的是「EPS 变大 ⇒ 窗口变宽 ⇒ 守卫接受错文档」**：
    //   EPS 的存在理由是「误差恰为 0.5 时双精度会算出 0.5000000000000071」
    //   （`docs/card-distribution.md` §5.1.1 记过）⇒ 它只能修边界，不能放宽判据。
    //   ⇒ 实测：24 个单元的窗口在 EPS = 0 与 EPS = 1e-9 下**完全相同**。
    const books = loadTextbookBooks()
    for (let n = 1; n <= 24; n += 1) {
      const { unit } = textbookUnitOf(n, books)
      expect(
        windowWithEpsilon(n, unit.vocabulary.length, 0),
        `单元 ${n}：把浮点补丁去掉后窗口变了 —— 说明 EPS 在放宽判据（它只能是边界补丁）`,
      ).toEqual(windowWithEpsilon(n, unit.vocabulary.length, DISTRIBUTION_EPSILON))
    }
  })
})

describe('G344 —— 负向夹具：每一处漂移都要被报出来（R-50 / R-51）', () => {
  for (const testCase of WINDOW_NEGATIVE_CASES) {
    it(`${testCase.name} ⇒ 必须报出漂移`, () => {
      const broken = testCase.breakDoc(docText)
      expect(broken, `负向夹具「${testCase.name}」没有真的改动文档 —— 夹具本身失效了`).not.toBe(docText)

      const drifts = checkSection14(broken)
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
