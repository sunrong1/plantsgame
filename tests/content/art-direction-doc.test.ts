/**
 * `docs/art-direction.md` §5.4「目视核对台账」的**文档守卫**（守卫 **G343**）。
 *
 * ── 这个文件守什么 ─────────────────────────────────────────────────────────
 *   台账的**形式**（不是「目视结论对不对」）：
 *   ① **行数** === 已交付词图数（每张交付的词图都必须有一行台账）；
 *   ② 每行的 `entryId` ∈ **已交付词图的词条 id 集合**，且**一条不漏、一条不重**；
 *   ③ 每行的「两个选项 `id`」是**两个**真实存在的词条 id（不是笔误、不是已删除的 id）；
 *   ④ 每行的「结论」是 `可读` / `难辨` / `不可读` **三个词之一**；
 *   ⑤ 文末的**汇总行**（「全表 N 行汇总：可读 a / 难辨 b / 不可读 c」）
 *      与逐行数出来的三个计数**逐个相等**；
 *   ⑥ 每个单元的**分行汇总**（「单元 N（第 a–b 行）汇总：…」）与对应那几行**逐个相等**。
 *
 * ── 为什么这条洞值得堵（2026-10-28 `[CR]` 第二轮的实测）──────────────────
 *   §5.4 的台账是「视角一致性」这条 👁 判据**唯一的留痕**。
 *   而在此之前**没有任何测试读 `docs/art-direction.md`** ——
 *   `grep -rn "art-direction" tests/` 只命中测试文件自己的注释
 *   ⇒ 台账**整块零守卫**。
 *   症状是静默的：换源后词图从 60 张变成 6 张、其中 2 张是改名移入的
 *   （`u1-book` → `u2-book`、`u1-pencil` → `u2-pencil`）、只有 3 张是新画的，
 *   而台账从头到尾没人核对 ⇒ **「6 张里其实只有 3 张是新画的」这件事，
 *   任何读者都只能靠人肉数文件名才知道**。
 *
 * ── ⚠️ **这条守卫明确不守什么**（边界写在这里，别让下一个人以为它管得更多）──
 *   · **不守「目视结论对不对」** —— §5.4 是 👁 判据（「同一批选项卡之间朝同一侧」
 *     没有机器判据，**永远建不了守卫**）。本文件只守台账的**形式**。
 *   · **不守「目视依据」那一列写得对不对** —— 那是散文。
 *   · **不守每张图的几何指标** —— 那由 `tests/assets/word-image-composition.test.ts`
 *     与 `tests/scripts/word-image-metrics.test.ts` 守。
 *   ⚠️ 换句话说：**「可读 6 / 难辨 0 / 不可读 0」这个结论本身仍然只靠人眼**；
 *     本守卫保证的是「这个结论**对得上它自己列的那 6 行**，且那 6 行**对得上真实产物**」。
 *
 * ── 期望值一律**现算**（R-56）───────────────────────────────────────────────
 *   「已交付的词图有哪些」来自**内容层**（`src/content` 的 `UNITS` 里 kind === 'word'
 *   的词条）—— 不是从文档里读回来的，也不是写死的字面量。
 *   ⇒ 词图增删时台账行数跟着变，本守卫会红。
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
import { plain, sectionOf, tableRows } from '../fixtures/markdown-table'

/** 文档路径（相对仓库根）。 */
const DOC_PATH = 'docs/art-direction.md'

/** 仓库根（`process.cwd()` 是 vitest 的工作目录 = 仓库根）。 */
const root = process.cwd()

/** 台账的「结论」只有这三个词（§5.4 的措辞）。 */
const VERDICTS = ['可读', '难辨', '不可读'] as const

/**
 * 结论词在 {@link VERDICTS} 里的下标（不是结论词 ⇒ **-1**）。
 *
 * ⚠️ **计数一律用下标数组，不拿中文当对象键** —— R-13 要求代码实体一律英文，
 *   而这三个中文词在本文里是**文档里的值**（台账那一列写的就是这三个词），
 *   不是键。⇒ 键用下标，值才是中文。
 */
function verdictIndex(verdict: string): number {
  return (VERDICTS as readonly string[]).indexOf(verdict)
}

/**
 * **已交付的词图对应的词条 id**（= 内容层里 `kind === 'word'` 的词条）。
 *
 * ⚠️ 事实源是**内容层**（`src/content` 的 `UNITS`），不是文档、不是写死的字面量。
 *   词图与词条一一对应是 AC-4.1，词条是事实源。
 */
const DELIVERED_WORD_IDS: readonly string[] = UNITS.flatMap((unit) =>
  unit.entries.filter((entry) => entry.card.kind === 'word').map((entry) => entry.entryId),
).sort()

/** 一处漂移。 */
interface Drift {
  /** 漂移的位置（人可读）。 */
  where: string
  /** 漂移的内容。 */
  detail: string
}

/** 从一个单元格里取出所有反引号里的 id。 */
function backtickedIds(cell: string): string[] {
  return [...cell.matchAll(/`([^`]+)`/g)].map((match) => match[1]!)
}

/**
 * 台账的**判据本体** —— 吃文档文本，吐违规清单。
 *
 * ⚠️ 判据只吃**字符串**，不读磁盘 ⇒ 负向夹具可以喂「改坏了的文档」。
 */
export function checkLedger(raw: string): Drift[] {
  const drift: Drift[] = []
  const section = sectionOf(raw, '#### 🗒 5.4')
  if (section === '') {
    drift.push({
      where: '§5.4 台账',
      detail: '找不到「#### 🗒 5.4 目视核对台账」小节 —— 台账不在文档里了',
    })
    return drift
  }

  const rows = tableRows(section)
  const header = rows.find((cells) => plain(cells[0] ?? '') === '#')
  if (header === undefined) {
    drift.push({ where: '§5.4 台账', detail: '找不到表头（第一列不是「#」）' })
    return drift
  }

  const dataRows = rows.filter((cells) => /^\d+$/.test(plain(cells[0] ?? '')))
  if (dataRows.length !== DELIVERED_WORD_IDS.length) {
    drift.push({
      where: '§5.4 台账 · 行数',
      detail:
        `台账有 ${dataRows.length} 行数据，而已交付词图有 ${DELIVERED_WORD_IDS.length} 张 ` +
        `（${DELIVERED_WORD_IDS.join(' / ')}）—— 每张交付的词图都必须有一行台账`,
    })
  }

  const seen = new Set<string>()
  dataRows.forEach((cells, index) => {
    const rowNo = plain(cells[0] ?? '')
    const where = `§5.4 台账 第 ${rowNo || index + 1} 行`

    // ② `entryId` 必须是真实存在的词条 id，且一条不重。
    const entryIds = backtickedIds(cells[1] ?? '')
    if (entryIds.length !== 1) {
      drift.push({
        where: `${where} · entryId`,
        detail: `「entryId」那一格里反引号包着的 id 有 ${entryIds.length} 个，应为 1 个`,
      })
      return
    }
    const entryId = entryIds[0]!
    if (!DELIVERED_WORD_IDS.includes(entryId)) {
      drift.push({
        where: `${where} · entryId`,
        detail:
          `台账写了 \`${entryId}\`，而已交付的词图词条是 ` +
          `${DELIVERED_WORD_IDS.join(' / ')} —— 台账引用了不存在的词图`,
      })
    }
    if (seen.has(entryId)) {
      drift.push({ where: `${where} · entryId`, detail: `\`${entryId}\` 在台账里出现了不止一次` })
    }
    seen.add(entryId)

    // ③ 「两个选项 id」必须恰是两个真实存在的词条 id。
    const optionIds = backtickedIds(cells[2] ?? '')
    if (optionIds.length !== 2) {
      drift.push({
        where: `${where} · 两个选项 id`,
        detail: `「两个选项 id」那一格里反引号包着的 id 有 ${optionIds.length} 个，应为 2 个`,
      })
    }
    for (const optionId of optionIds) {
      if (!DELIVERED_WORD_IDS.includes(optionId)) {
        drift.push({
          where: `${where} · 两个选项 id`,
          detail: `台账写了 \`${optionId}\`，而已交付的词图词条是 ${DELIVERED_WORD_IDS.join(' / ')}`,
        })
      }
    }

    // ④ 「结论」必须是三个词之一。
    const verdict = plain(cells[3] ?? '').trim()
    if (!(VERDICTS as readonly string[]).includes(verdict)) {
      drift.push({
        where: `${where} · 结论`,
        detail: `结论写的是「${verdict}」，只能是 ${VERDICTS.join(' / ')} 三个词之一`,
      })
    }
  })

  // ⑤ 全表汇总行。
  const totalCounts = [0, 0, 0]
  for (const cells of dataRows) {
    const index = verdictIndex(plain(cells[3] ?? '').trim())
    if (index >= 0) totalCounts[index] += 1
  }
  // ⚠️ **锚点必须精确到「全表 N 行汇总」** —— 早先这里只判「这一行同时含『全表』与『汇总』」，
  //   于是 §5.4 里任何一句**散文**（本轮新加的 G343 说明里就有「全表与逐单元的汇总数」）
  //   都会抢在真正的汇总行之前被选中 ⇒ 守卫报的是「解析不出汇总的三个数」，
  //   位置也落在 `§5.4 台账 · 全表汇总`（而不是逐项的 `· 可读`）⇒ 负向夹具的锚点随之失准。
  const totalLine = section
    .split('\n')
    .find((line) => /全表\s*\d+\s*行汇总/.test(line))
  if (totalLine === undefined) {
    drift.push({ where: '§5.4 台账 · 全表汇总', detail: '找不到「全表 N 行汇总：…」那一行' })
  } else {
    const matched = /全表\s*(\d+)\s*行汇总[：:]\s*`可读`\s*(\d+)\s*[/／]\s*`难辨`\s*(\d+)\s*[/／]\s*`不可读`\s*(\d+)/.exec(
      totalLine,
    )
    if (matched === null) {
      drift.push({
        where: '§5.4 台账 · 全表汇总',
        detail: `解析不出汇总的三个数（行：${totalLine.trim()}）`,
      })
    } else {
      const expected = totalCounts
      const actual = [matched[2], matched[3], matched[4]]
      for (const [i, verdict] of VERDICTS.entries()) {
        if (actual[i] !== String(expected[i])) {
          drift.push({
            where: `§5.4 台账 · 全表汇总 · ${verdict}`,
            detail: `汇总写 ${actual[i]}，而逐行数出来是 ${expected[i]}`,
          })
        }
      }
      if (matched[1] !== String(dataRows.length)) {
        drift.push({
          where: '§5.4 台账 · 全表汇总 · 行数',
          detail: `汇总写「全表 ${matched[1]} 行」，而表里实际有 ${dataRows.length} 行`,
        })
      }
    }
  }

  // ⑥ 每个单元的分行汇总。
  const unitSummaryPattern =
    /单元\s*(\d+)\s*（第\s*(\d+)\s*[–—-]\s*(\d+)\s*行）汇总[：:]\s*`可读`\s*(\d+)\s*张\s*[/／]\s*`难辨`\s*(\d+)\s*张\s*[/／]\s*`不可读`\s*(\d+)\s*张/g
  const unitSummaries = [...section.matchAll(unitSummaryPattern)]
  if (unitSummaries.length === 0) {
    drift.push({
      where: '§5.4 台账 · 分单元汇总',
      detail: '找不到「单元 N（第 a–b 行）汇总：可读 x 张 / 难辨 y 张 / 不可读 z 张」形式的汇总行',
    })
  }
  for (const match of unitSummaries) {
    const unitNo = match[1]!
    const from = Number(match[2])
    const to = Number(match[3])
    const where = `§5.4 台账 · 单元 ${unitNo} 汇总`
    const slice = dataRows.slice(from - 1, to)
    if (slice.length !== to - from + 1) {
      drift.push({
        where,
        detail: `汇总指向第 ${from}–${to} 行，而表里只有 ${dataRows.length} 行`,
      })
      continue
    }
    const counted = [0, 0, 0]
    for (const cells of slice) {
      const index = verdictIndex(plain(cells[3] ?? '').trim())
      if (index >= 0) counted[index] += 1
    }
    const expected = counted
    const actual = [match[4], match[5], match[6]]
    for (const [i, verdict] of VERDICTS.entries()) {
      if (actual[i] !== String(expected[i])) {
        drift.push({
          where: `${where} · ${verdict}`,
          detail: `汇总写 ${actual[i]} 张，而第 ${from}–${to} 行逐行数出来是 ${expected[i]} 张`,
        })
      }
    }
  }

  return drift
}

/** 文档原文（负向夹具在它上面改）。 */
const docText = readFileSync(join(root, DOC_PATH), 'utf8')

describe('G343 —— `docs/art-direction.md` §5.4 台账与真实产物对得上（形式层面）', () => {
  it('台账的每一行、每一列、每一个汇总都与已交付的词图一致', () => {
    expect(
      checkLedger(docText),
      '§5.4 台账与真实产物对不上 —— 回改 `docs/art-direction.md`。\n' +
        '⚠️ 这条守卫只管**形式**（行数 / id / 结论词 / 汇总数），' +
        '**不管「目视结论对不对」** —— §5.4 是 👁 判据，永远建不了机器守卫。\n' +
        '⚠️ 已交付的词图就是内容层里 `kind === "word"` 的那些词条 —— ' +
        '新增一张词图却没有补台账行（或反过来），本守卫会红。',
    ).toEqual([])
  })
})

// ── 负向夹具（R-50 首选路径：不改磁盘文件，直接喂「改坏了的文档」）──────────
//
// ⚠️ **夹具刻意不写死文档里的具体数值**（如「把可读 6 改成可读 5」）——
//   那些数字是**人工目视**的产物，夹具写死就等于让夹具随人工结论一起漂移。
// ⇒ 夹具改成**按位置定位 + 按位置扰动**：找到「台账的第几行」「结论列」，
//   把它改掉 —— 与文档里现在写的是几无关，改多少次都不会失效。

/** 台账的逐单元表里第 n 行（n 从 1 起）的原文行。 */
function ledgerRowLine(doc: string, n: number): string | undefined {
  const section = sectionOf(doc, '#### 🗒 5.4')
  const rows = section
    .split('\n')
    .filter((line) => line.trim().startsWith('|'))
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => {
      const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|')
      return /^\d+$/.test(cells[0]?.trim() ?? '')
    })
  return rows[n - 1]?.line
}

/** 把台账第 n 行的某一格换成别的内容。 */
function patchLedgerCell(doc: string, n: number, cellIndex: number, next: string): string {
  const line = ledgerRowLine(doc, n)
  if (line === undefined) return doc
  const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|')
  if (cells[cellIndex] === undefined) return doc
  cells[cellIndex] = ` ${next} `
  const rebuilt = `|${cells.join('|')}|`
  return doc.replace(line, () => rebuilt)
}

/** 删掉台账的第 n 行。 */
function dropLedgerRow(doc: string, n: number): string {
  const line = ledgerRowLine(doc, n)
  if (line === undefined) return doc
  return doc
    .split('\n')
    .filter((candidate) => candidate !== line)
    .join('\n')
}

describe('G343 —— 负向夹具：每一处漂移都要被报出来（R-50 / R-51）', () => {
  const cases: readonly {
    name: string
    breakDoc: (doc: string) => string
    expectWhere: RegExp
  }[] = [
    {
      name: '台账少一行（删掉最后一行）⇒ 行数必须被报出来',
      breakDoc: (doc) => dropLedgerRow(doc, 6),
      expectWhere: /台账 · 行数/,
    },
    {
      name: '台账引用了一张不存在的词图 ⇒ entryId 必须被报出来',
      breakDoc: (doc) => patchLedgerCell(doc, 1, 1, '`u9-not-delivered`'),
      expectWhere: /第 1 行 · entryId/,
    },
    {
      name: '「两个选项 id」写成了一个 ⇒ 数量必须被报出来',
      breakDoc: (doc) => patchLedgerCell(doc, 1, 2, '`u1-morning`'),
      expectWhere: /第 1 行 · 两个选项 id/,
    },
    {
      name: '「两个选项 id」里有一个是不存在的 id ⇒ 逐个核对必须报出来',
      breakDoc: (doc) => patchLedgerCell(doc, 1, 2, '`u1-morning` `u9-not-delivered`'),
      expectWhere: /第 1 行 · 两个选项 id/,
    },
    {
      name: '结论写成了不在三个词里的那个 ⇒ 结论列必须被报出来',
      breakDoc: (doc) => patchLedgerCell(doc, 1, 3, '可辨认'),
      expectWhere: /第 1 行 · 结论/,
    },
    {
      name: '全表汇总的「可读」数与逐行数不符 ⇒ 汇总必须被报出来',
      // ⚠️ **锚点必须落在「全表」那一行** —— 文里有三处 `可读 x / 难辨 y`
      //   （单元 1、单元 2、全表），用泛化正则会改到**第一个**（单元 1 的）
      //   ⇒ 那条报的是「单元汇总」而不是「全表汇总」，位置就错了。
      breakDoc: (doc) =>
        doc.replace(
          /(全表\s*\d+\s*行汇总[：:]\s*`可读`\s*)(\d+)/,
          (_match, head: string, n: string) => head + String(Number(n) + 1),
        ),
      expectWhere: /全表汇总 · 可读/,
    },
    {
      name: '分单元汇总的数与逐行数不符 ⇒ 单元汇总必须被报出来',
      breakDoc: (doc) =>
        doc.replace(
          /(单元\s*\d+\s*（第\s*\d+\s*[–—-]\s*\d+\s*行）汇总[：:]\s*`可读`\s*)(\d+)/,
          (_match, head: string, n: string) => head + String(Number(n) + 1),
        ),
      expectWhere: /单元 \d+ 汇总 · 可读/,
    },
  ]

  for (const testCase of cases) {
    it(`${testCase.name} ⇒ 必须报出漂移`, () => {
      const broken = testCase.breakDoc(docText)
      // ⚠️ 先断言「夹具真的把文档改坏了」—— 否则这条用例是空转的。
      expect(broken, `负向夹具「${testCase.name}」没有真的改动文档 —— 夹具本身失效了`).not.toBe(docText)

      const drifts = checkLedger(broken)
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
