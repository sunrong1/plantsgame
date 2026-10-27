/**
 * `docs/option-count.md` ↔ `src/content/option-count.ts` 的**文档守卫**
 * （守卫 **G342**）。
 *
 * ── 这个文件守什么 ──────────────────────────────────────────────────────────
 *   ① **§1.1 档位表**（3 行 × 5 列）逐格 === `OPTION_COUNT_TIERS` 的实算值
 *   ② **§3 逐单元表**（24 行 × 3 列，左右两栏）逐格 === `targetOptionCount` 的实算值
 *   ③ **§3 的「复算方法」代码块**仍在，且指向**真实实现**（文档承诺「任何人都能重跑」）
 *   ④ **§4.1 的卡内编辑距离明细**：每一对的距离与真实内容算出来的一致，
 *      **且一对不漏**；每个单元的最小值与文档写的一致
 *
 * ── 为什么这条洞值得堵（2026-10-28 `[CR]` 第二轮的实测）──────────────────
 *   `docs/option-count.md` 抬头写着「本文件的每个数字都必须能从代码复算出来」，
 *   而在此之前**没有任何测试读这份 markdown**
 *   ⇒ §1.1 那张 3×5 的档位表、§3 那张 24×3 的逐单元表**全部零守卫**。
 *   ⚠️ 而 §1.1 的档位表是**产品裁决**（「改这九个数字 = 改难度曲线的一个点」）
 *     ⇒ 它恰恰是最需要有人盯的那张表。
 *   ⚠️ §4.1 的「单元 2 最小距离 = 5」也**零守卫**：它只有一句散文，
 *     而 5 正是**当前真正把阈值顶住的那个上界** ⇒ 改内容的人看不到它变了。
 *
 * ── 为什么期望值一律**现算**（R-56）────────────────────────────────────────
 *   档位表来自 `OPTION_COUNT_TIERS`，逐单元表来自 `targetOptionCount`，
 *   编辑距离来自**真实内容** + `scripts/validate-content.ts` 的
 *   `normalizeOptionText` / `editDistance` —— **本文件不抄任何一份期望表**。
 *   ⇒ 规则改了、档位改了、内容改了，本守卫跟着变；它只抓「文档没跟上」。
 *
 * ── 判据纪律 ────────────────────────────────────────────────────────────────
 *   ① 判据本体是**纯函数**（吃文档文本，吐违规清单）⇒ 负向夹具可以直接喂
 *      「改坏了的文档」，不必改磁盘上的文件（R-50 首选的「负向夹具」路径）。
 *   ② 每个负向夹具都先断言「它真的把文档改动了」—— 否则夹具是空转的。
 *   ③ 每条 `expect` 带中文失败消息（R-55）。
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { UNITS } from '../../src/content'
import { FIRST_UNIT, LAST_UNIT } from '../../src/content/distribution'
import { OPTION_COUNT_TIERS, targetOptionCount } from '../../src/content/option-count'
import { editDistance, normalizeOptionText } from '../../scripts/validate-content'
import { codeBlockOf, plain, sectionOf, tableRows } from '../fixtures/markdown-table'

/** 文档路径（相对仓库根）。 */
const DOC_PATH = 'docs/option-count.md'

/** 仓库根（`process.cwd()` 是 vitest 的工作目录 = 仓库根）。 */
const root = process.cwd()

/** 一处漂移。 */
interface Drift {
  /** 漂移的位置（人可读）。 */
  where: string
  /** 漂移的内容。 */
  detail: string
}

/** 三个卡型（顺序固定）。 */
const KINDS = ['word', 'keyword', 'response'] as const

/**
 * **每个单元的全部卡内文本对**及其归一化编辑距离。
 *
 * ⚠️ 口径与 `scripts/validate-content.ts` 的 `optionNearDuplicateProblems` **逐条一致**：
 *   · 只看**有 `text` 的**选项（单词卡的选项是图片，没有文本）；
 *   · 两边文本 `trim().toLowerCase()` 后完全相同 ⇒ 跳过（schema 已报过）；
 *   · 距离按**归一化后**的文本算（`normalizeOptionText` + `editDistance`）。
 */
function realPairs(): Map<string, { entryId: string; unit: number; distance: number }> {
  const map = new Map<string, { entryId: string; unit: number; distance: number }>()
  for (const unit of UNITS) {
    for (const entry of unit.entries) {
      const texts = entry.card.options
        .filter((option): option is typeof option & { text: string } => 'text' in option)
        .map((option) => option.text)
      for (let i = 0; i < texts.length; i += 1) {
        for (let j = i + 1; j < texts.length; j += 1) {
          if (texts[i]!.trim().toLowerCase() === texts[j]!.trim().toLowerCase()) continue
          const a = normalizeOptionText(texts[i]!)
          const b = normalizeOptionText(texts[j]!)
          const distance = editDistance(a, b)
          // 键**无序**（`a ~ b` 与 `b ~ a` 是同一对）⇒ 排序后做键。
          map.set(`${entry.entryId}|${[a, b].sort().join(' ~ ')}`, {
            entryId: entry.entryId,
            unit: unit.unitNumber,
            distance,
          })
        }
      }
    }
  }
  return map
}

/** 每个单元的最小卡内编辑距离（该单元所有对的最小值）。 */
function realMinPerUnit(): Map<number, number> {
  const map = new Map<number, number>()
  for (const unit of UNITS) {
    const distances = [...realPairs().values()]
      .filter((pair) => pair.unit === unit.unitNumber)
      .map((pair) => pair.distance)
    if (distances.length > 0) map.set(unit.unitNumber, Math.min(...distances))
  }
  return map
}

/** §1.1 档位表：逐格比对。 */
function checkTierTable(raw: string): Drift[] {
  const drift: Drift[] = []
  const section = sectionOf(raw, '### 1.1')
  if (section === '') {
    drift.push({ where: '§1.1', detail: '找不到「### 1.1」小节 —— 档位表不在文档里了' })
    return drift
  }

  const rows = tableRows(section)
  const header = rows.find((cells) => plain(cells[0] ?? '') === '档')
  if (header === undefined) {
    drift.push({ where: '§1.1', detail: '档位表的表头第一列不是「档」' })
    return drift
  }

  const dataRows = rows.filter((cells) => /^\d+$/.test(plain(cells[0] ?? '')))
  if (dataRows.length !== OPTION_COUNT_TIERS.length) {
    drift.push({
      where: '§1.1',
      detail:
        `档位表有 ${dataRows.length} 行数据，而规则里是 ${OPTION_COUNT_TIERS.length} 档 —— ` +
        '档数变了，文档必须同步',
    })
    return drift
  }

  dataRows.forEach((cells, index) => {
    const tier = OPTION_COUNT_TIERS[index]!
    const where = `§1.1 档 ${index + 1}`
    const documentedTier = plain(cells[0] ?? '')
    if (documentedTier !== String(index + 1)) {
      drift.push({ where: `${where} · 档号`, detail: `文档写第 ${documentedTier} 档，应为第 ${index + 1} 档` })
    }

    const range = plain(cells[1] ?? '')
    const rangeMatch = /(\d+)\s*[–—-]\s*(\d+)/.exec(range)
    if (rangeMatch === null) {
      drift.push({ where: `${where} · 单元区间`, detail: `解析不出单元区间（单元格：${range}）` })
    } else if (Number(rangeMatch[1]) !== tier.unitRange[0] || Number(rangeMatch[2]) !== tier.unitRange[1]) {
      drift.push({
        where: `${where} · 单元区间`,
        detail: `文档写 ${range}，规则是 ${tier.unitRange[0]}–${tier.unitRange[1]}`,
      })
    }

    for (const [offset, kind] of KINDS.entries()) {
      const actual = plain(cells[2 + offset] ?? '')
      const expected = String(tier.counts[kind])
      if (actual !== expected) {
        drift.push({
          where: `${where} · ${kind}`,
          detail: `文档写 ${actual}，规则是 ${expected}`,
        })
      }
    }
  })

  return drift
}

/** §3 逐单元表：逐格比对（左右两栏）。 */
function checkUnitTable(raw: string): Drift[] {
  const drift: Drift[] = []
  const section = sectionOf(raw, '## 3.')
  if (section === '') {
    drift.push({ where: '§3', detail: '找不到「## 3.」小节 —— 逐单元实算表不在文档里了' })
    return drift
  }

  const rows = tableRows(section)
  const header = rows.find((cells) => plain(cells[0] ?? '') === '单元')
  if (header === undefined) {
    drift.push({ where: '§3', detail: '逐单元表的表头第一列不是「单元」' })
    return drift
  }

  const seen = new Set<number>()
  for (const cells of rows) {
    // 一行里有**两组**（左栏 1..12、右栏 13..24）⇒ 按位置扫出所有「四个数字」为一组。
    for (let i = 0; i + 3 < cells.length; i += 1) {
      const group = cells.slice(i, i + 4).map((cell) => plain(cell))
      if (!group.every((cell) => /^\d+$/.test(cell))) continue
      const unit = Number(group[0])
      if (unit < FIRST_UNIT || unit > LAST_UNIT) continue
      if (seen.has(unit)) {
        drift.push({ where: `§3 单元 ${unit}`, detail: '该单元在表里出现了不止一次' })
        continue
      }
      seen.add(unit)
      for (const [offset, kind] of KINDS.entries()) {
        const expected = String(targetOptionCount(unit, kind))
        if (group[1 + offset] !== expected) {
          drift.push({
            where: `§3 单元 ${unit} · ${kind}`,
            detail: `文档写 ${group[1 + offset]}，实算 ${expected}`,
          })
        }
      }
      i += 3
    }
  }

  if (seen.size !== LAST_UNIT - FIRST_UNIT + 1) {
    drift.push({
      where: '§3',
      detail: `逐单元表覆盖了 ${seen.size} 个单元，应为 ${LAST_UNIT - FIRST_UNIT + 1} 个（${FIRST_UNIT}..${LAST_UNIT}）`,
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
  if (!block.includes("from './src/content/option-count.ts'")) {
    drift.push({
      where: '§3 复算方法',
      detail: '代码块没有 import 真实实现 `./src/content/option-count.ts` —— 复刻一份算法的话，复算出来的数与代码无关',
    })
  }
  if (!block.includes('targetOptionCount')) {
    drift.push({ where: '§3 复算方法', detail: '代码块没有调用 `targetOptionCount`' })
  }
  for (const kind of KINDS) {
    if (!block.includes(`'${kind}'`)) {
      drift.push({ where: '§3 复算方法', detail: `代码块没有遍历 \`${kind}\` 这一族` })
    }
  }
  if (!block.includes(`n <= ${LAST_UNIT}`)) {
    drift.push({
      where: '§3 复算方法',
      detail: `代码块的循环上界不是 ${LAST_UNIT}（规则覆盖 ${FIRST_UNIT}..${LAST_UNIT}）`,
    })
  }
  return drift
}

/** §4.1 的卡内编辑距离明细：逐对比对 + 一对不漏 + 最小值比对。 */
function checkDistances(raw: string): Drift[] {
  const drift: Drift[] = []
  const section = sectionOf(raw, '### 4.1')
  if (section === '') {
    drift.push({ where: '§4.1', detail: '找不到「### 4.1」小节 —— 卡内最小编辑距离不在文档里了' })
    return drift
  }

  const pairs = realPairs()
  const listed = new Set<string>()

  // 明细行：`entryId | "a" ~ "b" = N`
  const pairPattern = /^(.+?)\s*\|\s*"([^"]*)"\s*~\s*"([^"]*)"\s*=\s*(\d+)$/
  // 最小值行：`最小卡内编辑距离 = N <- entryId: a ~ b`
  const minPattern = /^最小卡内编辑距离\s*=\s*(\d+)\s*<-\s*([^:]+):\s*(.+?)\s*~\s*(.+)$/

  const blocks = [...section.matchAll(/```[a-z]*\n([\s\S]*?)```/g)].map((match) => match[1] ?? '')
  const lines = blocks.flatMap((block) => block.split('\n').map((line) => line.trim()))
  const minLines = lines.filter((line) => minPattern.test(line))
  const pairLines = lines.filter((line) => pairPattern.test(line))

  if (pairLines.length === 0) {
    drift.push({ where: '§4.1', detail: '找不到「entryId | \"a\" ~ \"b\" = N」形式的明细行' })
  }

  for (const line of pairLines) {
    const match = pairPattern.exec(line)!
    const entryId = match[1]!.trim()
    const a = match[2]!
    const b = match[3]!
    const documented = Number(match[4])
    const key = `${entryId}|${[a, b].sort().join(' ~ ')}`
    const real = pairs.get(key)
    if (real === undefined) {
      drift.push({
        where: `§4.1 明细 · ${entryId}`,
        detail: `文档列了这一对（"${a}" ~ "${b}"），但真实内容里**没有这一对**`,
      })
      continue
    }
    listed.add(key)
    if (real.distance !== documented) {
      drift.push({
        where: `§4.1 明细 · ${entryId} · "${a}" ~ "${b}"`,
        detail: `文档写 ${documented}，实算 ${real.distance}`,
      })
    }
  }

  // 一对不漏：真实内容里的每一对都必须在文档里出现。
  for (const [key, real] of pairs) {
    if (!listed.has(key)) {
      drift.push({
        where: `§4.1 明细 · ${real.entryId}`,
        detail: `真实内容里还有一对没被列出来（${key.split('|')[1]}）—— 文档承诺的是「每一对都列出来」`,
      })
    }
  }

  // 每个单元的最小值。
  const minPerUnit = realMinPerUnit()
  for (const [unitNumber, min] of minPerUnit) {
    const candidates = minLines.filter((line) => {
      const match = minPattern.exec(line)!
      const entryId = match[2]!.trim()
      return pairs.get(`${entryId}|${[match[3]!, match[4]!].sort().join(' ~ ')}`)?.unit === unitNumber
    })
    if (candidates.length === 0) {
      drift.push({
        where: `§4.1 最小值 · 单元 ${unitNumber}`,
        detail: `找不到单元 ${unitNumber} 的「最小卡内编辑距离 = N <- …」那一行（实算最小值 ${min}）`,
      })
      continue
    }
    for (const line of candidates) {
      const match = minPattern.exec(line)!
      const documented = Number(match[1])
      if (documented !== min) {
        drift.push({
          where: `§4.1 最小值 · 单元 ${unitNumber}`,
          detail: `文档写 ${documented}，实算 ${min}`,
        })
      }
    }
  }

  return drift
}

/** 文档原文（负向夹具在它上面改）。 */
const docText = readFileSync(join(root, DOC_PATH), 'utf8')

describe('G342 —— `docs/option-count.md` 的每个数字都要能从代码复算出来', () => {
  it('§1.1 档位表逐格等于 `OPTION_COUNT_TIERS` 的实算值', () => {
    expect(
      checkTierTable(docText),
      '§1.1 档位表与 `src/content/option-count.ts` 的实算值不一致 —— ' +
        '按文档抬头「🔥 两者不一致时以 `src/content/option-count.ts` 为准」处理。\n' +
        '⚠️ **改这九个数字 = 改难度曲线的一个点，属产品裁决**（R-20 / R-57）：' +
        '要改就同时改代码与文档，并让 G262–G276 重跑。',
    ).toEqual([])
  })

  it('§3 逐单元表逐格等于 `targetOptionCount` 的实算值', () => {
    expect(
      checkUnitTable(docText),
      '§3 逐单元表与实算值不一致 —— 回改本文件。\n' +
        '⚠️ 这张表是本规则唯一被当成「实算」的产物 ⇒ 一处漂移，读者照着它排产就跟着错。',
    ).toEqual([])
  })

  it('§3 的「复算方法」代码块仍在，且指向真实实现', () => {
    expect(
      checkRecomputeBlock(docText),
      '§3 的复算方法代码块缺失或不再指向真实实现 —— ' +
        '文档承诺「任何人可重跑，数字必然一致」，而那正是人工核对这条守卫的手段。',
    ).toEqual([])
  })

  it('§4.1 的卡内编辑距离明细与真实内容一致，且一对不漏', () => {
    expect(
      checkDistances(docText),
      '§4.1 的卡内编辑距离明细与真实内容算出来的不一致（或漏了一对）—— 回改本文件。\n' +
        '⚠️ **单元 2 的最小值 5 是当前真正把近邻阈值顶住的那个上界** ⇒ 它变了必须有人看见。',
    ).toEqual([])
  })
})

// ── 负向夹具（R-50 首选路径：不改磁盘文件，直接喂「改坏了的文档」）──────────
//
// ⚠️ **夹具刻意不写死文档里的具体数值** —— 那些数字是**规则**与**内容**的产物，
//   改了文档（连带改夹具的锚点）就会让夹具集体失效。
// ⇒ 夹具改成**按位置定位 + 按位置扰动**。

/** 把 §1.1 档位表第 n 行的第 k 格改掉（k 从 0 起）。 */
function patchTierCell(doc: string, n: number, cellIndex: number, next: string): string {
  const section = sectionOf(doc, '### 1.1')
  // ⚠️ 档号那一格在文档里是 **`**1**`**（带强调）⇒ 必须先 `plain()` 再判是不是数字。
  const dataLines = section.split('\n').filter((candidate) => {
    const trimmed = candidate.trim()
    if (!trimmed.startsWith('|')) return false
    const cells = trimmed.replace(/^\|/, '').replace(/\|$/, '').split('|')
    // ⚠️ `plain()` 只去强调标记，**不去空白** ⇒ 必须再 `.trim()` 一次。
    return /^\d+$/.test(plain(cells[0] ?? '').trim())
  })
  const target = dataLines[n - 1]
  if (target === undefined) return doc
  const cells = target.trim().replace(/^\|/, '').replace(/\|$/, '').split('|')
  if (cells[cellIndex] === undefined) return doc
  cells[cellIndex] = ` ${next} `
  return doc.replace(target.trim(), () => `|${cells.join('|')}|`)
}

/** 把 §3 逐单元表里某个单元的某一族改掉（k 从 0 起：0 = word）。 */
function patchUnitCell(doc: string, unit: number, kindOffset: number, next: string): string {
  const section = sectionOf(doc, '## 3.')
  const target = section
    .split('\n')
    .find((candidate) => new RegExp(`^\\|\\s*${unit}\\s*\\|`).test(candidate.trim()))
  if (target === undefined) return doc
  const cells = target.trim().replace(/^\|/, '').replace(/\|$/, '').split('|')
  const index = 1 + kindOffset
  if (cells[index] === undefined) return doc
  cells[index] = ` ${next} `
  return doc.replace(target.trim(), () => `|${cells.join('|')}|`)
}

describe('G342 —— 负向夹具：每一处漂移都要被报出来（R-50 / R-51）', () => {
  const cases: readonly {
    name: string
    breakDoc: (doc: string) => string
    expectWhere: RegExp
  }[] = [
    {
      name: '§1.1 档 1 的 word 选项数改一位 ⇒ 档位表必须被报出来',
      breakDoc: (doc) => patchTierCell(doc, 1, 2, '**5**'),
      expectWhere: /§1\.1 档 1 · word/,
    },
    {
      name: '§1.1 档 2 的单元区间改一位 ⇒ 区间必须被报出来',
      breakDoc: (doc) => patchTierCell(doc, 2, 1, '5–9'),
      expectWhere: /§1\.1 档 2 · 单元区间/,
    },
    {
      name: '§3 某个单元的 keyword 选项数改一位 ⇒ 逐单元表必须被报出来',
      breakDoc: (doc) => patchUnitCell(doc, 6, 1, '9'),
      expectWhere: /§3 单元 6 · keyword/,
    },
    {
      name: '§3 的复算方法代码块被删掉 ⇒ 复算方法必须被报出来',
      breakDoc: (doc) => doc.replace(/```bash\n[\s\S]*?```/, ''),
      expectWhere: /§3 复算方法/,
    },
    {
      name: '§4.1 明细里某一对的距离改一位 ⇒ 明细必须被报出来',
      breakDoc: (doc) => doc.replace(/^(u1-s-hello \| "good morning" ~ "good afternoon" = )7$/m, '$19'),
      expectWhere: /§4\.1 明细/,
    },
    {
      name: '§4.1 少列一对 ⇒ 「一对不漏」必须被报出来',
      breakDoc: (doc) =>
        doc
          .split('\n')
          .filter((line) => !/^u1-s-goodbye \| "hello" ~ "good afternoon" = 12$/.test(line.trim()))
          .join('\n'),
      expectWhere: /§4\.1 明细/,
    },
    {
      name: '§4.1 的最小值改一位 ⇒ 最小值必须被报出来',
      breakDoc: (doc) => doc.replace(/最小卡内编辑距离 = 5 <-/, '最小卡内编辑距离 = 4 <-'),
      expectWhere: /§4\.1 最小值/,
    },
  ]

  for (const testCase of cases) {
    it(`${testCase.name} ⇒ 必须报出漂移`, () => {
      const broken = testCase.breakDoc(docText)
      // ⚠️ 先断言「夹具真的把文档改坏了」—— 否则这条用例是空转的。
      expect(broken, `负向夹具「${testCase.name}」没有真的改动文档 —— 夹具本身失效了`).not.toBe(docText)

      const drifts = [
        ...checkTierTable(broken),
        ...checkUnitTable(broken),
        ...checkRecomputeBlock(broken),
        ...checkDistances(broken),
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
