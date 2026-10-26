/**
 * `docs/card-distribution.md` ↔ `src/content/distribution.ts` 的**文档守卫**
 * （DF-121；守卫 **G321**）。
 *
 * ── 这个文件守什么 ────────────────────────────────────────────────────────
 *   ① **§3 逐单元表**（24 行 × 6 列）逐格 === `targetCardDistribution` 的实算值
 *   ② **§4 的三个 Σ**（1..16 / 1..18 / 1..24）+ **教材 census 表**（1A / 1B / 合计）
 *      + **外推对照表**（16 / 18 / 24 单元的外推值 vs census 精确值 vs 差）
 *   ③ **§4.1 的四个批次数**（2.10 / 2.6 / 2.7 / 2.8，**教材逐单元词数之和**）与合计行
 *   ④ §3 的「复算方法」代码块仍在，且指向**真实实现**（文档承诺「任何人都能重跑」）
 *
 * ── 为什么这条洞值得堵（DF-121 的原委）────────────────────────────────────
 *   `docs/card-distribution.md` 抬头写着「本文件的每个数字都必须能从代码复算出来」，
 *   而在此之前**没有任何测试读这份 markdown**（`grep -rn "card-distribution" tests/`
 *   只命中测试文件自己的注释）⇒ §3 那张 20 行 × 7 列表、§4 的三个 Σ、
 *   §4.1 的四个批次数全部**零守卫**。
 *   而 §3 的表是本规则**唯一**被当成「实算」的产物，§4 与 §4.1 的数字又全部由它推出
 *   ⇒ 一处漂移，三处一起错。
 *   症状是静默的：读者照着「下修约 22%」排产，而按 16 单元算只有 17.6%。
 *
 * ── 📎 2026-10-26（Story 2.10 换源批次）判据换口径 ────────────────────────
 *   单元 1–2 换成教材词表后，**§4 与 §4.1 的口径整个换了**：
 *   旧的「每单元 37 词条 × 单词份额 × 单元数 = 480/540/600 张」**外推**作废，
 *   新的唯一口径是**教材 census**（`docs/textbook-oxford-shanghai/` 的
 *   `Look and learn` 逐单元词数之和 = **97 张**）。
 *   ⇒ §4 / §4.1 的期望值**不再由 `sumWordShare × E` 推出**，而是由
 *     **教材逐单元词数**（`tests/helpers/textbook-corpus.ts` 的 `textbookWordCount`）
 *     现算。
 *   ⚠️ **判据只换了期望值的来源，纪律一条没松**：
 *     ① 期望值**仍然现算**，不在测试里抄一份词表（R-56）；
 *     ② **仍然逐字比**（§4 的三个 Σ 逐字、census 表逐单元逐条）；
 *     ③ **负向夹具全部重做**（旧夹具打的是已作废的三行表），
 *        每一条都先断言「夹具真的把文档改坏了」。
 *   ⚠️ **变严的地方**：旧判据只比「文档写的估算值」；新判据还要求
 *     **§4.1 的批次数之和 === 教材 census 的全书总数** ⇒
 *     **少写一行批次**（例如把 2.8 那行删掉）会红，而旧判据对此**零反应**。
 *
 * ── 为什么期望值**现算**而不是抄成表（R-56）────────────────────────────────
 *   DF-121 逐字：「注意别把这变成 R-56 说的『硬编码期望表』——
 *   期望值要从**真实实现**现算，文档只是被核对的那一方。」
 *   ⇒ 本文件**没有任何一行**写着「单元 5 的 word 应该是 73.49%」；
 *   所有期望值要么由 `targetCardDistribution` 现算，要么由**另一份事实源**
 *   （真实内容 `unit-01.json` / `unit-02.json` 的词条条数）现算。
 *
 * ── 判据纪律 ──────────────────────────────────────────────────────────────
 *   ① 判据本体是**纯函数**（吃文档文本、吐违规清单）⇒ 负向夹具可以直接喂
 *      「改坏了的文档」，不必改磁盘上的文件（R-50 首选的「负向夹具」路径）。
 *   ② 每个负向夹具都先断言「它真的把文档改动了」—— 否则夹具是空转的。
 *   ③ 每条 `expect` 带中文失败消息（R-55）。
 *   ④ **文档与代码不一致时以代码为准**（`docs/card-distribution.md` 抬头的
 *      「🔥 两者不一致时以 `src/content/distribution.ts` 为准」）⇒
 *      失败消息指向「回改文档」，不是「回改代码」。
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { getUnit } from '../../src/content'
import { FIRST_UNIT, LAST_UNIT, targetCardDistribution } from '../../src/content/distribution'
import { textbookUnitOf, textbookWordCount } from '../helpers/textbook-corpus'

/** 文档路径（相对仓库根）。 */
const DOC_PATH = 'docs/card-distribution.md'

/** 仓库根（`process.cwd()` 是 vitest 的工作目录 = 仓库根）。 */
const root = process.cwd()

/**
 * 估算基数 E = **单元 1 的实测词条数**（不是写死的字面量）。
 *
 * 文档 §3 的「E 词条里的单词卡」那两列是「单元 1 的实测值外推」⇒ 事实源是
 * `unit-01.json`，不是本文档也不是一个写死的字面量。
 */
const E = getUnit(FIRST_UNIT).entries.length

/** 规则覆盖的单元数（1..24）。 */
const UNIT_COUNT = LAST_UNIT - FIRST_UNIT + 1

/**
 * Σ w(n)，n 从 `from` 到 `to`（含端点）。
 *
 * 累加顺序**从前往后**（与文档 §3「复算方法」里的命令同序）⇒ 两边得到同一个 double。
 */
function sumWordShare(from: number, to: number): number {
  let sum = 0
  for (let n = from; n <= to; n += 1) sum += targetCardDistribution(n).word
  return sum
}

/**
 * 真实内容里某段单元的单词卡总数；**该段里有单元尚未录入时返回 `null`**。
 *
 * ⚠️ `getUnit` 对未录入的单元**抛错**（内容层不静默回退）⇒ 这里捕获它，
 *   把「这段还没有内容」与「这段的词图数对不上」区分开 ——
 *   前者不该报错（2.6 – 2.8 的批次还没有内容），后者必须报。
 */
function contentWordCardCount(from: number, to: number): number | null {
  let sum = 0
  for (let n = from; n <= to; n += 1) {
    let entries
    try {
      entries = getUnit(n).entries
    } catch {
      return null
    }
    sum += entries.filter((entry) => entry.card.kind === 'word').length
  }
  return sum
}

/** 一处漂移。 */
interface Drift {
  /** 漂移的位置（人可读：哪一节、哪一行、哪一列）。 */
  where: string
  /** 漂移的内容（文档写的 vs 实算的）。 */
  detail: string
}

/**
 * 取出某个小节的正文。
 *
 * ⚠️ 结束位置取「下一个 `##` / `###` 标题行」—— 不是下一个 `##`：
 *   §4 的正文下面挂着 `### 4.1`，若只认 `##` 就会把 §4.1 的表也算进 §4。
 * ⚠️ 代码块里的 `# 在仓库根目录执行` 是**单**个 `#` ⇒ 不匹配 `#{2,3}`，
 *   不会被误当成小节边界。
 */
function sectionOf(raw: string, headingPrefix: string): string {
  const lines = raw.split('\n')
  const start = lines.findIndex((line) => line.trim().startsWith(headingPrefix))
  if (start < 0) return ''
  let end = lines.length
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^#{2,3}\s/.test(lines[i])) {
      end = i
      break
    }
  }
  return lines.slice(start + 1, end).join('\n')
}

/** 取出小节里所有表格行（已切成单元格、已去掉首尾的 `|`）。 */
function tableRows(section: string): string[][] {
  return section
    .split('\n')
    .filter((line) => line.trim().startsWith('|'))
    .map((line) =>
      line
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((cell) => cell.trim()),
    )
    .filter((cells) => !cells.every((cell) => /^:?-+:?$/.test(cell)))
}

/** 去掉单元格里的强调标记（`**` / `*`），让解析不必照顾排版。 */
function plain(cell: string): string {
  return cell.replace(/\*\*/g, '').replace(/\*/g, '')
}

/** 取出小节里的第一个围栏代码块（按语言标注匹配）。 */
function codeBlockOf(section: string, language: string): string {
  const match = new RegExp('```' + language + '\\n([\\s\\S]*?)```').exec(section)
  return match?.[1] ?? ''
}

// ══════════════════════════════════════════════════════════════════════════════
// 判据本体（纯函数：吃文档文本，吐违规清单）
// ══════════════════════════════════════════════════════════════════════════════

/** §3 逐单元表：20 行 × 6 列逐格比对。 */
function checkSection3(raw: string): Drift[] {
  const drift: Drift[] = []
  const section = sectionOf(raw, '## 3.')
  if (section === '') {
    drift.push({ where: '§3', detail: '找不到「## 3.」小节 —— 逐单元实算表不在文档里了' })
    return drift
  }

  const rows = tableRows(section)
  const header = rows.find((cells) => cells[0] === '单元')
  if (header === undefined) {
    drift.push({ where: '§3', detail: '逐单元表的表头不是「单元 | word | keyword | …」' })
    return drift
  }
  // 表头里的「37 词条」必须与 E 一致（E 变了，列名就得跟着改）。
  if (!header.some((cell) => cell.includes(`${E} 词条`))) {
    drift.push({
      where: '§3 表头',
      detail: `表头没有「${E} 词条」的字样（E = 单元 ${FIRST_UNIT} 的实测词条数 = ${E}）—— ` +
        '估算基数变了，列名必须同步改',
    })
  }

  const dataRows = rows.filter((cells) => /^\d+$/.test(cells[0]))
  if (dataRows.length !== UNIT_COUNT) {
    drift.push({
      where: '§3',
      detail: `逐单元表有 ${dataRows.length} 行数据，应为 ${UNIT_COUNT} 行（单元 ${FIRST_UNIT}..${LAST_UNIT}）`,
    })
    return drift
  }

  for (const cells of dataRows) {
    const unit = Number(cells[0])
    if (unit < FIRST_UNIT || unit > LAST_UNIT) {
      drift.push({
        where: `§3 单元 ${unit}`,
        detail: `表里出现了规则覆盖范围（${FIRST_UNIT}..${LAST_UNIT}）之外的单元号`,
      })
      continue
    }
    const dist = targetCardDistribution(unit)
    const sentenceLayer = dist.keyword + dist.response
    const expected = [
      `${(dist.word * 100).toFixed(2)}%`,
      `${(dist.keyword * 100).toFixed(2)}%`,
      `${(dist.response * 100).toFixed(2)}%`,
      `${(sentenceLayer * 100).toFixed(2)}%`,
      (E * dist.word).toFixed(1),
      (E * sentenceLayer).toFixed(1),
    ]
    const columnNames = ['word', 'keyword', 'response', '句/对话层', `${E} 词条里的单词卡`, `${E} 词条里的句/对话卡`]
    for (let i = 0; i < expected.length; i += 1) {
      const actual = plain(cells[i + 1] ?? '')
      if (actual !== expected[i]) {
        drift.push({
          where: `§3 单元 ${unit} · ${columnNames[i]}`,
          detail: `文档写 ${actual}，实算 ${expected[i]}`,
        })
      }
    }
  }
  return drift
}

/**
 * §4：三个 Σ + **教材 census 表** + **外推对照表**。
 *
 * ⚠️ **口径已换**（Story 2.10 换源批次，2026-10-26）：§4 的「全书词图总数」
 *   不再是「每单元 37 词条 × 单词份额 × 单元数」的外推，而是**教材 census** ——
 *   教材 24 个单元 `Look and learn` 的**逐单元词数之和**（精确值）。
 *   ⇒ 期望值的来源从 `sumWordShare × E` 换成 `textbookWordCount`
 *     （事实源 = `docs/textbook-oxford-shanghai/`，解析器 = `tests/helpers/textbook-corpus.ts`）。
 *   ⇒ **旧的三行表（新值 / 旧值 / 下修率）整块作废**，本判据不再看它。
 */
function checkSection4(raw: string): Drift[] {
  const drift: Drift[] = []
  const section = sectionOf(raw, '## 4.')
  if (section === '') {
    drift.push({ where: '§4', detail: '找不到「## 4.」小节 —— 词图总数的实算不在文档里了' })
    return drift
  }

  // ── 三个 Σ ──────────────────────────────────────────────────────────────
  const sigmaPattern = /对 `n = 1\.\.(\d+)` = \*\*([0-9.]+)\*\*/g
  const sigmas = [...section.matchAll(sigmaPattern)]
  if (sigmas.length === 0) {
    drift.push({
      where: '§4',
      detail: '找不到「对 `n = 1..N` = **数值**」形式的 Σ —— 三个 Σ 不在文档里了',
    })
  }
  for (const match of sigmas) {
    const upto = Number(match[1])
    const documentedText = match[2]
    const computed = sumWordShare(FIRST_UNIT, upto)
    // ⚠️ **逐字比**，不比数值 —— 数值比会放过「最后一位改了」这种漂移
    //   （改一位的差是 1e-14，而浮点噪声也是 1e-14 量级 ⇒ 数值容差分不开）。
    //   文档 §3 自己写的是「输出**逐字**对应本节的 §3 逐单元表」⇒ 这里用同一把尺子。
    //   累加顺序与 §3 的复算命令一致（n 从小到大）⇒ 两边得到同一个 double。
    const computedText = String(computed)
    if (documentedText !== computedText) {
      drift.push({
        where: `§4 Σ w(${FIRST_UNIT}..${upto})`,
        detail:
          Number(documentedText) === computed
            ? `文档写 ${documentedText}，实算 ${computedText} —— 数值相同但逐字不同：` +
              '请用 §3 复算命令的输出回填（文档承诺的是「逐字对应」）'
            : `文档写 ${documentedText}，实算 ${computedText}`,
      })
    }
  }

  const rows = tableRows(section)

  // ── 教材 census 表（1A / 1B 两行 + 合计行）──────────────────────────────
  const censusRows = rows.filter((cells) => /^(1A|1B)$/.test(plain(cells[0])))
  if (censusRows.length !== 2) {
    drift.push({
      where: '§4 · 教材 census 表',
      detail: `census 表有 ${censusRows.length} 行册次数据，应为 2 行（1A / 1B）—— ` +
        '§4 的唯一口径是教材逐单元词数之和，这张表不在文档里就等于没有口径',
    })
  }
  for (const cells of censusRows) {
    const book = plain(cells[0])
    // 游戏单元 ↔ 教材单元的映射：1–12 → 1A，13–24 → 1B（G338 独立钉住这条映射）。
    const from = book === '1A' ? FIRST_UNIT : 13
    const to = book === '1A' ? 12 : LAST_UNIT

    // 逐单元词数列：一格一个数，逐格与教材比。
    const listCell = plain(cells[2] ?? '')
    const documented = listCell
      .split(/[,，、]/)
      .map((piece) => Number(piece.trim()))
      .filter((n) => Number.isFinite(n))
    const expected: number[] = []
    for (let n = from; n <= to; n += 1) {
      expected.push(textbookUnitOf(n).unit.vocabulary.length)
    }
    if (documented.length !== expected.length || documented.some((v, i) => v !== expected[i])) {
      drift.push({
        where: `§4 · 教材 census 表 · ${book} 逐单元词数`,
        detail:
          `文档写 [${documented.join(', ')}]，教材实算 [${expected.join(', ')}]` +
          `（教材单元 ${from}–${to} 的 \`Look and learn\` 词数）`,
      })
    }

    // 小计列。
    const subtotal = /(\d+)\s*张/.exec(plain(cells[3] ?? ''))
    const expectedSubtotal = textbookWordCount(from, to)
    if (subtotal === null) {
      drift.push({ where: `§4 · 教材 census 表 · ${book}`, detail: '解析不出小计张数' })
    } else if (Number(subtotal[1]) !== expectedSubtotal) {
      drift.push({
        where: `§4 · 教材 census 表 · ${book} 小计`,
        detail: `文档写 ${subtotal[1]} 张，教材实算 ${expectedSubtotal} 张`,
      })
    }
  }

  // 合计行 = 全书 census。
  const censusTotalRow = rows.find((cells) => plain(cells[0]).includes('合计'))
  if (censusTotalRow === undefined) {
    drift.push({ where: '§4 · 教材 census 表', detail: '找不到合计行' })
  } else {
    const total = /(\d+)\s*张/.exec(plain(censusTotalRow[3] ?? ''))
    const expectedTotal = textbookWordCount(FIRST_UNIT, LAST_UNIT)
    if (total === null) {
      drift.push({ where: '§4 · 教材 census 表 · 合计', detail: '解析不出合计张数' })
    } else if (Number(total[1]) !== expectedTotal) {
      drift.push({
        where: '§4 · 教材 census 表 · 合计',
        detail: `文档写 ${total[1]} 张，教材实算 ${expectedTotal} 张（全书 24 个教材单元的词数之和）`,
      })
    }
  }

  // ── 外推对照表（16 / 18 / 24 单元：外推口径 vs census 精确值 vs 差）──────
  const compareRows = rows.filter((cells) => /^\d+\s*单元$/.test(plain(cells[0])))
  if (compareRows.length === 0) {
    drift.push({
      where: '§4 · 外推对照表',
      detail: '找不到「N 单元」形式的对照表行 —— 「为什么不再用份额外推」那段没有对照数据',
    })
  }
  for (const cells of compareRows) {
    const label = plain(cells[0])
    const units = Number(/^(\d+)/.exec(label)?.[1])
    if (!Number.isFinite(units)) continue

    // 外推口径 = Σw × E（文档保留它是为了说明「它错得有多离谱」）。
    const extrapolated = /([\d.]+)\s*张/.exec(plain(cells[1] ?? ''))
    const expectedExtrapolated = sumWordShare(FIRST_UNIT, units) * E
    if (extrapolated === null) {
      drift.push({ where: `§4 对照表「${label}」· 外推`, detail: '解析不出外推张数' })
    } else if (Number(extrapolated[1]) !== Number(expectedExtrapolated.toFixed(2))) {
      drift.push({
        where: `§4 对照表「${label}」· 外推`,
        detail: `文档写 ${extrapolated[1]}，实算 ${expectedExtrapolated.toFixed(2)}（Σw(${FIRST_UNIT}..${units}) × ${E}）`,
      })
    }

    // census 精确值 = 教材前 N 个单元的词数之和。
    const census = /(\d+)\s*张/.exec(plain(cells[2] ?? ''))
    const expectedCensus = textbookWordCount(FIRST_UNIT, units)
    if (census === null) {
      drift.push({ where: `§4 对照表「${label}」· census`, detail: '解析不出 census 张数' })
    } else if (Number(census[1]) !== expectedCensus) {
      drift.push({
        where: `§4 对照表「${label}」· census`,
        detail: `文档写 ${census[1]} 张，教材实算 ${expectedCensus} 张`,
      })
    }

    // 差 = 外推 ÷ census 的百分比。
    // ⚠️ **用 §3 复算命令打印出来的那个两位小数**做分子（`32.67`），不是全精度 ——
    //   文档 §4 的对照表与 §3 的复算输出是同一口径（两边都显示两位小数），
    //   拿全精度算会与文档差 0.1 个百分点（32.6739 / 74 = 44.1539 → 44.2%，
    //   而 32.67 / 74 = 44.1486 → 44.1%）。
    const ratio = /([\d.]+)%/.exec(plain(cells[3] ?? ''))
    const expectedRatio = (Number(expectedExtrapolated.toFixed(2)) / expectedCensus) * 100
    if (ratio === null) {
      drift.push({ where: `§4 对照表「${label}」· 差`, detail: '解析不出差值百分比' })
    } else if (Number(ratio[1]) !== Number(expectedRatio.toFixed(1))) {
      drift.push({
        where: `§4 对照表「${label}」· 差`,
        detail: `文档写 ${ratio[1]}%，实算 ${expectedRatio.toFixed(1)}%（外推 ${expectedExtrapolated.toFixed(2)} ÷ census ${expectedCensus}）`,
      })
    }
  }
  return drift
}

/**
 * §4.1：四个批次数 + 合计行（**教材逐单元词数之和**，精确值，不是估算）。
 *
 * ⚠️ **口径已换**（Story 2.10 换源批次，2026-10-26）：
 *   旧判据算的是「Σw(区间) × E」的**估算值**（2.5 / 2.6 / 2.7 / 2.8），
 *   新口径下每一批的张数是**教材逐单元词数的精确和** ⇒ 期望值来自
 *   `textbookWordCount(from, to)`，**不再有「取整张数」这个概念**（精确值本身就是整数）。
 *   ⚠️ **批次行的正则必须能匹配两位小数**（`2.10`）—— 旧正则 `/^2\.\d$/` 匹配不上
 *   ⇒ 那一行**静默**不在覆盖面里（旧判据对它的零反应就是这个形态）。
 */
function checkSection41(raw: string): Drift[] {
  const drift: Drift[] = []
  const section = sectionOf(raw, '### 4.1')
  if (section === '') {
    drift.push({ where: '§4.1', detail: '找不到「### 4.1」小节 —— 逐批次规模表不在文档里了' })
    return drift
  }

  const rows = tableRows(section)
  /** 批次行（首列是 `2.5` / `2.10` 这种 story 号 —— **必须能匹配两位小数**）。 */
  const batchRows = rows.filter((cells) => /^2\.\d{1,2}$/.test(plain(cells[0])))
  if (batchRows.length === 0) {
    drift.push({ where: '§4.1', detail: '找不到「2.6 / 2.7 / 2.8 / 2.10」形式的批次行' })
    return drift
  }

  /** 每一批的实算值（用于合计行）。 */
  const batchValues = new Map<string, number>()

  for (const cells of batchRows) {
    const story = plain(cells[0])
    const rangeCell = plain(cells[1] ?? '')
    const valueCell = plain(cells[2] ?? '')
    const rangeMatch = /单元\s*(\d+)\s*[–—-]\s*(\d+)/.exec(rangeCell)
    const singleMatch = /单元\s*(\d+)/.exec(rangeCell)
    const from = rangeMatch === null ? Number(singleMatch?.[1]) : Number(rangeMatch[1])
    const to = rangeMatch === null ? from : Number(rangeMatch[2])
    if (!Number.isFinite(from) || !Number.isFinite(to)) {
      drift.push({ where: `§4.1 ${story}`, detail: `解析不出单元区间（单元格：${rangeCell}）` })
      continue
    }

    // 批次数 = 教材逐单元词数之和（**精确值**，不是估算）。
    const expected = textbookWordCount(from, to)
    const headline = /(\d+)\s*张/.exec(valueCell)
    if (headline === null) {
      drift.push({ where: `§4.1 ${story}`, detail: '解析不出批次数' })
      continue
    }
    if (Number(headline[1]) !== expected) {
      drift.push({
        where: `§4.1 ${story} · 批次数`,
        detail: `文档写 ${headline[1]} 张，教材实算 ${expected} 张（单元 ${from}–${to} 的 \`Look and learn\` 词数之和）`,
      })
    }

    // 该批的单元**已经录进内容**时，再与真实内容的单词卡数对一次（文档 ↔ 内容 ↔ 教材 三方一致）。
    const fromContent = contentWordCardCount(from, to)
    if (fromContent !== null && fromContent !== expected) {
      drift.push({
        where: `§4.1 ${story} · 与真实内容一致`,
        detail:
          `文档写 ${headline[1]} 张，真实内容里单元 ${from}–${to} 的单词卡是 ${fromContent} 张 —— ` +
          '内容与教材不一致时，先改内容再回改本文件',
      })
    }

    batchValues.set(story, expected)
  }

  // ── 合计行 ──────────────────────────────────────────────────────────────
  const totalRow = rows.find((cells) => plain(cells[0]).includes('合计'))
  if (totalRow === undefined) {
    drift.push({ where: '§4.1', detail: '找不到合计行' })
    return drift
  }
  const totalCell = plain(totalRow[2] ?? '')
  const totalMatch = /(\d+)\s*张/.exec(totalCell)
  if (totalMatch === null) {
    drift.push({ where: '§4.1 合计行', detail: '解析不出合计张数' })
    return drift
  }

  // 合计 = 各批**相加**（文档自己写的教训：「改了一行就重算合计」）。
  const total = [...batchValues.values()].reduce((a, b) => a + b, 0)
  if (Number(totalMatch[1]) !== total) {
    drift.push({
      where: '§4.1 合计行',
      detail: `文档写 ${totalMatch[1]} 张，各批实算相加 = ${total} 张`,
    })
  }

  // ⚠️ **合计还必须等于全书 census** —— 这一条是旧判据没有的：
  //   旧判据只比「文档写的合计 vs 各批相加」，**少一行批次**时两边一起变小 ⇒ 恒绿。
  //   现在多一个锚：合计 === 教材 24 个单元的词数之和 ⇒ 少写一行立刻红。
  const expectedBookTotal = textbookWordCount(FIRST_UNIT, LAST_UNIT)
  if (total !== expectedBookTotal) {
    drift.push({
      where: '§4.1 合计行 · 全书 census',
      detail: `各批实算相加 = ${total} 张，全书 census 实算 = ${expectedBookTotal} 张 —— 批次行少了或多了`,
    })
  }
  if (Number(totalMatch[1]) !== expectedBookTotal) {
    drift.push({
      where: '§4.1 合计行',
      detail: `文档写 ${totalMatch[1]} 张，全书 census 实算 = ${expectedBookTotal} 张`,
    })
  }
  return drift
}

/** §3 的「复算方法」代码块：必须存在，且指向真实实现。 */
function checkRecomputeBlock(raw: string): Drift[] {
  const drift: Drift[] = []
  const section = sectionOf(raw, '## 3.')
  const block = codeBlockOf(section, 'bash')
  if (block === '') {
    drift.push({
      where: '§3 复算方法',
      detail: '找不到 ```bash 代码块 —— 文档承诺「任何人可重跑」的那条命令不见了',
    })
    return drift
  }
  if (!block.includes("from './src/content/distribution.ts'")) {
    drift.push({
      where: '§3 复算方法',
      detail: '代码块没有 import 真实实现 `./src/content/distribution.ts` —— ' +
        '复刻一份算法的话，复算出来的数与代码无关',
    })
  }
  if (!block.includes('targetCardDistribution')) {
    drift.push({ where: '§3 复算方法', detail: '代码块没有调用 `targetCardDistribution`' })
  }
  if (!block.includes('toFixed(2)') || !block.includes('toFixed(1)')) {
    drift.push({
      where: '§3 复算方法',
      detail: '代码块的输出格式与 §3 表不一致（表用 `toFixed(2)` 记百分比、`toFixed(1)` 记条数）',
    })
  }
  return drift
}

// ══════════════════════════════════════════════════════════════════════════════
// 用例
// ══════════════════════════════════════════════════════════════════════════════

/** 文档原文（负向夹具在它上面改）。 */
const docText = readFileSync(join(root, DOC_PATH), 'utf8')

describe('G321 —— `docs/card-distribution.md` 的每个数字都要能从代码复算出来（DF-121）', () => {
  it('§3 逐单元表（24 行 × 6 列）逐格等于 `targetCardDistribution` 的实算值', () => {
    expect(
      checkSection3(docText),
      '§3 逐单元表与 `src/content/distribution.ts` 的实算值不一致 —— ' +
        '按文档抬头「🔥 两者不一致时以 `src/content/distribution.ts` 为准，并必须回改本文件」处理。\n' +
        '⚠️ 这张表是本规则唯一被当成「实算」的产物，§4 的三个 Σ 与 §4.1 的四个批次数都由它推出 ⇒ ' +
        '一处漂移，三处一起错。',
    ).toEqual([])
  })

  it('§4 的三个 Σ、教材 census 表与外推对照表都等于实算值', () => {
    expect(
      checkSection4(docText),
      '§4 的实算与代码/教材不一致 —— 回改本文件。\n' +
        '⚠️ §4 的唯一口径是**教材 census**（24 个教材单元的 `Look and learn` 词数之和 = 97 张）；' +
        '「每单元 37 词条 × 份额 × 单元数」的外推口径（480/540/600 张）**已整块作废** —— ' +
        '引用它时必须带「旧口径 / 已作废」标记。',
    ).toEqual([])
  })

  it('§4.1 的四个批次数与合计行都等于实算值', () => {
    expect(
      checkSection41(docText),
      '§4.1 的逐批次规模与教材/真实内容不一致 —— 回改本文件。\n' +
        '⚠️ 文档自己记着的教训：「改了一行就重算合计」是同一处编辑的一部分 —— ' +
        '本条会同时盯住批次行与合计行，且合计必须等于全书 census（少写一行批次会红）。',
    ).toEqual([])
  })

  it('§3 的「复算方法」代码块仍在，且指向真实实现', () => {
    expect(
      checkRecomputeBlock(docText),
      '§3 的复算方法代码块缺失或不再指向真实实现 —— ' +
        '文档承诺「任何人可重跑，数字必然一致」，而那正是人工核对这条守卫的手段。',
    ).toEqual([])
  })
})

// ── 负向夹具（R-50 首选路径：不改磁盘文件，直接喂「改坏了的文档」）──────────
//
// ⚠️ **夹具刻意不写死文档里的具体数值**（如「把 73.49% 改成 73.50%」）——
//   那些数值是**产品裁决**，改了文档（连带改夹具的锚点）就会让夹具集体失效，
//   而失效的夹具正是「假绿」的温床。
// ⇒ 夹具改成**按位置定位 + 按位置扰动**：找到「第几个单元的第几个百分比」，
//   把它加 0.01 —— 与文档里现在写的是几无关，改多少次都不会失效。

/** 找到 §3 逐单元表里某个单元的那一行。 */
function unitRowLine(doc: string, unit: number): string | undefined {
  return doc.split('\n').find((line) => new RegExp(`^\\|\\s*${unit}\\s*\\|`).test(line))
}

/** 把某个单元行的**第 k 个百分比**（k 从 0 起）加 0.01。 */
function bumpUnitPercent(doc: string, unit: number, k: number): string {
  const line = unitRowLine(doc, unit)
  if (line === undefined) return doc
  let seen = -1
  const patched = line.replace(/([\d.]+)%/g, (match, num: string) => {
    seen += 1
    return seen === k ? `${(Number(num) + 0.01).toFixed(2)}%` : match
  })
  return doc.replace(line, () => patched)
}

/** 把某个单元行的**第 k 个小数**（k 从 0 起，即不跟 `%` 的那些）加 0.1。 */
function bumpUnitDecimal(doc: string, unit: number, k: number): string {
  const line = unitRowLine(doc, unit)
  if (line === undefined) return doc
  const cells = line.split('|')
  let seen = -1
  for (let i = 0; i < cells.length; i += 1) {
    const cell = cells[i].trim()
    // ⚠️ 按**单元格**判，不按正则扫行 —— 正则 `(\d+\.\d+)(?!%)` 会匹配到
    //   「45.00%」里面的「5.0」（回溯后 `%` 不在紧后面）⇒ 把百分比改坏。
    if (!/^[\d.]+$/.test(cell) || !cell.includes('.')) continue
    seen += 1
    if (seen === k) {
      cells[i] = ` ${(Number(cell) + 0.1).toFixed(1)} `
      break
    }
  }
  return doc.replace(line, () => cells.join('|'))
}

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

/** 把单元格里的「N 张」加 1 张。 */
function bumpCardCount(cell: string): string {
  return cell.replace(/(\d+)\s*张/, (_match, num: string) => `${Number(num) + 1} 张`)
}

/** 把单元格里的第一个两位小数加 0.01。 */
function bumpTwoDecimals(cell: string): string {
  return cell.replace(/(\d+\.\d+)/, (_match, num: string) => (Number(num) + 0.01).toFixed(2))
}

/** 把「逐单元词数」那个列表里的**第一个数**加 1（「2, 4, 5」⇒「3, 4, 5」）。 */
function bumpFirstNumberInList(cell: string): string {
  return cell.replace(/(\d+)/, (_match, num: string) => `${Number(num) + 1}`)
}

/** 把 §4 的第一个 Σ 的**最后一位**改掉（改一位，不改量级）。 */
function bumpFirstSigma(doc: string): string {
  return doc.replace(
    /(对 `n = 1\.\.\d+` = \*\*)([\d.]+)(\*\*)/,
    (_match, head: string, num: string, tail: string) => {
      const last = num.slice(-1)
      const bumped = last === '9' ? '8' : String(Number(last) + 1)
      return head + num.slice(0, -1) + bumped + tail
    },
  )
}

/** 一个负向夹具：怎么改文档 + 期望在哪个位置被报出来。 */
interface NegativeCase {
  /** 夹具名（进测试名）。 */
  name: string
  /** 怎么把文档改坏。 */
  breakDoc: (doc: string) => string
  /** 期望被报出来的位置（正则，匹配 `where`）。 */
  expectWhere: RegExp
}

const NEGATIVE_CASES: readonly NegativeCase[] = [
  {
    name: '§3 某个单元的 word 份额改一位',
    breakDoc: (doc) => bumpUnitPercent(doc, 5, 0),
    expectWhere: /§3 单元 5 · word/,
  },
  {
    name: '§3 句/对话层那一列改一位',
    breakDoc: (doc) => bumpUnitPercent(doc, 20, 3),
    expectWhere: /§3 单元 20 · 句\/对话层/,
  },
  {
    name: '§3 的「E 词条里的单词卡」那一列改一位',
    breakDoc: (doc) => bumpUnitDecimal(doc, 20, 0),
    expectWhere: new RegExp(`§3 单元 20 · ${E} 词条里的单词卡`),
  },
  {
    name: '§4 的一个 Σ 改最后一位',
    breakDoc: (doc) => bumpFirstSigma(doc),
    expectWhere: /§4 Σ w\(1\.\.16\)/,
  },
  {
    name: '§4 教材 census 表的「逐单元词数」改一位',
    breakDoc: (doc) => patchCell(doc, /^\|\s*1A\s*\|/, 3, bumpFirstNumberInList),
    expectWhere: /§4 · 教材 census 表 · 1A 逐单元词数/,
  },
  {
    name: '§4 教材 census 表的「小计」改一位',
    breakDoc: (doc) => patchCell(doc, /^\|\s*1A\s*\|/, 4, bumpCardCount),
    expectWhere: /§4 · 教材 census 表 · 1A 小计/,
  },
  {
    name: '§4 教材 census 表的「合计」改一位',
    breakDoc: (doc) => patchCell(doc, /^\|\s*\*?\*?合计/, 4, bumpCardCount),
    expectWhere: /§4 · 教材 census 表 · 合计/,
  },
  {
    name: '§4 外推对照表的「外推口径」那一列改一位',
    breakDoc: (doc) => patchCell(doc, /^\|\s*16 单元\s*\|/, 2, bumpTwoDecimals),
    expectWhere: /§4 对照表「16 单元」· 外推/,
  },
  {
    name: '§4 外推对照表的「census」那一列改一位',
    breakDoc: (doc) => patchCell(doc, /^\|\s*16 单元\s*\|/, 3, bumpCardCount),
    expectWhere: /§4 对照表「16 单元」· census/,
  },
  {
    name: '§4 外推对照表的「差」那一列改一位',
    breakDoc: (doc) =>
      patchCell(
        doc,
        /^\|\s*16 单元\s*\|/,
        4,
        (cell) => cell.replace(/([\d.]+)%/, (_match, num: string) => `${(Number(num) + 0.1).toFixed(1)}%`),
      ),
    expectWhere: /§4 对照表「16 单元」· 差/,
  },
  {
    name: '§4.1 某一批的批次数改一位',
    breakDoc: (doc) => patchCell(doc, /^\|\s*2\.6\s*\|/, 3, bumpCardCount),
    expectWhere: /§4\.1 2\.6 · 批次数/,
  },
  {
    name: '§4.1 某一批的单元区间改一位',
    breakDoc: (doc) => patchCell(doc, /^\|\s*2\.7\s*\|/, 2, (cell) => cell.replace('13', '12')),
    expectWhere: /§4\.1 2\.7 · 批次数/,
  },
  {
    name: '§4.1 的 2.10 实测值改一位',
    breakDoc: (doc) => patchCell(doc, /^\|\s*2\.10\s*\|/, 3, bumpCardCount),
    expectWhere: /§4\.1 2\.10 · 批次数/,
  },
  {
    name: '§4.1 的合计改一位（批次行没跟着改）',
    breakDoc: (doc) => patchCell(doc, /^\|\s*四批合计\s*\|/, 3, bumpCardCount),
    expectWhere: /§4\.1 合计行/,
  },
  {
    name: '§4.1 少写一行批次（删掉 2.8 那行）⇒ 合计必须被报出来',
    breakDoc: (doc) =>
      doc
        .split('\n')
        .filter((line) => !/^\|\s*2\.8\s*\|/.test(line))
        .join('\n'),
    expectWhere: /§4\.1 合计行/,
  },
  {
    name: '§3 的复算方法代码块被删掉',
    breakDoc: (doc) => doc.replace(/```bash\n[\s\S]*?```/, ''),
    expectWhere: /§3 复算方法/,
  },
]

describe('G321 —— 负向夹具：每一处漂移都要被报出来（R-50 / R-51）', () => {
  for (const testCase of NEGATIVE_CASES) {
    it(`${testCase.name} ⇒ 必须报出漂移`, () => {
      const broken = testCase.breakDoc(docText)
      // ⚠️ 先断言「夹具真的把文档改坏了」—— 否则这条用例是空转的
      //   （夹具写错一个字符 → 文档没变 → 判据本来就没东西可报 → 假绿）。
      expect(broken, `负向夹具「${testCase.name}」没有真的改动文档 —— 夹具本身失效了`).not.toBe(docText)

      const drifts = [
        ...checkSection3(broken),
        ...checkSection4(broken),
        ...checkSection41(broken),
        ...checkRecomputeBlock(broken),
      ]
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
