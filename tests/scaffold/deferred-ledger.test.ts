/**
 * 延后账本三层形态的结构守卫 —— 钉住 R-43。
 *
 * 守什么：
 * - **活账本** `deferred-work.md` 只列**仍然开放**的条目，一行一条、六列齐全、
 *   DF-ID 唯一且连续、状态取值受限、恢复条件可判定、行数不越上限；
 * - **详情层** `deferred-details.md` 每个 DF-ID 一个 `## DF-NNN` 小节，
 *   且状态 / 归属 / 恢复条件 / 一句话与账本**逐字一致**；
 * - **归档层** `_bmad-output/archive/deferred/` 每个来源段都有「分诊结论」四元组，
 *   README 的全量对照表与之一一对应。
 *
 * 为什么：2026-10-22 之前，`deferred-work.md` **一个文件同时是活账本、历史存档与结清日志**，
 * 涨到 3517 行 / 270KB / 41 个来源段 —— 「早就结清了的历史」和「还开着的待办」混在一起，
 * 读者无法判断哪条该做，整份读进上下文又纯是污染。拆成三层之后，
 * 「还开着的」第一次有了**可判定的边界**；而这个边界需要机器守卫钉住，
 * 否则下一轮登记会把它写回一个文件里。
 *
 * 出处：`_bmad-output/implementation-artifacts/deferred-ledger-restructure.md` §8（G-a..G-h）。
 * ⚠️ 两条上限（G-e 的行数、R-35 的「一句话 ≤ 120 字」）是**拿到 189 条真实开放条目后实测校准**的，
 * 不是拍的数 —— 详见各常量旁的注释。
 *
 * 不在 src/core/ 下 —— NFR16：测试全部在 tests/。
 */
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../', import.meta.url))

const LEDGER_PATH = `${root}_bmad-output/implementation-artifacts/deferred-work.md`
const DETAILS_PATH = `${root}_bmad-output/implementation-artifacts/deferred-details.md`
const ARCHIVE_DIR = `${root}_bmad-output/archive/deferred/`

/**
 * 活账本的**行数上限**。
 *
 * ⚠️ **实测校准，不是拍的数。** plan §14 #1 原写「≤ 80 行」，那是**分诊之前**的假设 ——
 * 分诊后真实开放条目是 **189 条**（不是 60 条），账本实测 **218 行**。
 * 定 80 会让守卫当场变红；定「等于现值」则一条新登记就触红。
 * 260 行 = 189 条 + 头部/模板/说明约 70 行，留约 **25 条**新登记的余量，
 * 又离拆分前的 3517 行差一个数量级 —— 这才是「防它再长回去」的真实含义。
 */
const LEDGER_MAX_LINES = 260

/**
 * 「一句话」列的字数上限。
 *
 * ⚠️ **实测校准。** 189 条里最长的一条实测 **111 字**（含路径与反引号代码片段），
 * 中位数约 60 字。R-35 原写「≤ 60 字」会让 **93 条**当场违规 —— 那是判据写窄了，不是条目写长了。
 */
const SUMMARY_MAX_CHARS = 120

/** 状态列的合法取值（R-35 登记表）。 */
const ALLOWED_STATUS = ['待裁决', '待触发', '待排期']

/** 分诊结论的合法取值。 */
const ALLOWED_VERDICT = ['开放', '已结', '作废']

/**
 * 恢复条件列里的**占位符**黑名单。
 *
 * R-35 的原话：「恢复条件必须能被判定」。空字符串能过「非空」这一关，
 * 但「以后再说」与空字符串是同一种病 —— 判据必须能把这两种都挡住。
 */
const PLACEHOLDER_RESTORE = ['以后再说', '以后再议', '待定', '暂不定', '先放着', 'TODO', 'TBD', '???']

/** 表格行里的转义竖线（`\|`）还原成真竖线 —— 表格内一个裸 `|` 会把行劈成两半。 */
function unescapePipes(s: string): string {
  return s.replace(/\\\|/g, '|')
}

/** 拆一行 markdown 表格 —— 只在**未被反斜杠转义**的 `|` 处切。 */
function splitCells(line: string): string[] {
  return line.split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim())
}

interface LedgerRow {
  id: string
  status: string
  owner: string
  restore: string
  summary: string
  detail: string
}

/** 取活账本「## 条目」小节里的条目行（模板行 `| DF-NNN |` 的 ID 不匹配 `DF-\d{3}`，自然被跳过）。 */
function parseLedgerRows(text: string): LedgerRow[] {
  const lines = text.split('\n')
  const start = lines.findIndex((l) => l.trim() === '## 条目')
  if (start < 0) return []
  const end = lines.findIndex((l, i) => i > start && /^## /.test(l))
  const stop = end < 0 ? lines.length : end
  const rows: LedgerRow[] = []
  for (let i = start + 1; i < stop; i++) {
    const line = lines[i]
    if (!line.startsWith('|')) continue
    const c = splitCells(line)
    if (!/^DF-\d{3}$/.test(c[0] ?? '')) continue
    rows.push({
      id: c[0],
      status: c[1] ?? '',
      owner: c[2] ?? '',
      restore: c[3] ?? '',
      summary: c[4] ?? '',
      detail: c[5] ?? '',
    })
  }
  return rows
}

/** G-a：每行都是**六列齐全**的合法条目行。 */
function checkRowShape(rows: LedgerRow[], rawText: string): string[] {
  const problems: string[] = []
  if (/^## Deferred from:/m.test(rawText)) {
    problems.push('活账本里又出现了 `## Deferred from:` 段 —— 归档内容回流进了活账本')
  }
  for (const r of rows) {
    const cells = [r.status, r.owner, r.restore, r.summary, r.detail]
    const labels = ['状态', '归属', '恢复条件', '一句话', '详情']
    const empty = labels.filter((_, i) => cells[i].trim() === '')
    if (empty.length > 0) {
      problems.push(`${r.id}：${empty.join(' / ')} 列为空`)
    }
    if (!/^\[`df-\d{3}`\]\(\.\/deferred-details\.md#df-\d{3}\)$/.test(r.detail)) {
      problems.push(`${r.id}：详情列不是指向 deferred-details.md 锚点的链接（实测「${r.detail}」）`)
    }
    if (unescapePipes(r.summary).length > SUMMARY_MAX_CHARS) {
      problems.push(
        `${r.id}：一句话 ${unescapePipes(r.summary).length} 字，超过 ${SUMMARY_MAX_CHARS} 字上限`,
      )
    }
  }
  return problems
}

/**
 * G-b 的两部分：
 * ① **层内唯一** —— 同一个 DF-ID 在活账本里出现两次、或在归档里出现两次，都是「一个号挂了两条」。
 * ② **跨层连续** —— 「已分配的全部编号」必须从 DF-001 起连续、无空洞。
 *
 * ⚠️ **连续性必须吃「活账本 ∪ 归档」的并集**，不能只吃活账本：
 * R-43 规定条目结清后**从活账本删掉那一行**（原文搬进归档）——
 * 若只看活账本，结清一条就在中间留个洞，守卫当场变红，
 * 于是「结清条目」这个**正常动作**被判成违规。
 * 归档那一篇的「分诊结论」表里保留着该条目的 DF-ID ⇒ 并集才是「已分配的全部编号」，
 * 「永不复用」（R-35）也才能被真正守住。
 *
 * ⚠️ 同一条**同时**出现在活账本与归档里是正常的（它还开着）⇒ 并集要**去重**后再判连续；
 * 「重复」只在**层内**判。
 */
function checkIdUniqueness(ids: string[], label: string): string[] {
  const seen = new Set<string>()
  const problems: string[] = []
  for (const id of ids) {
    if (seen.has(id)) problems.push(`${label}：DF-ID 重复：${id}（一个号挂了两条）`)
    seen.add(id)
  }
  return problems
}

function checkIdContinuity(ids: string[]): string[] {
  const problems: string[] = []
  const nums = [...new Set(ids)].map((id) => Number(id.slice(3))).sort((a, b) => a - b)
  if (nums.length === 0) {
    problems.push('一条条目都没有 —— 解析器可能空转了')
    return problems
  }
  for (let i = 0; i < nums.length; i++) {
    if (nums[i] !== i + 1) {
      problems.push(
        `DF-ID 不连续：第 ${i + 1} 个应为 DF-${String(i + 1).padStart(3, '0')}，实测 DF-${String(nums[i]).padStart(3, '0')}`,
      )
      break
    }
  }
  return problems
}

/** G-c：状态 ∈ {待裁决, 待触发, 待排期}。 */
function checkStatus(rows: LedgerRow[]): string[] {
  return rows
    .filter((r) => !ALLOWED_STATUS.includes(r.status))
    .map((r) => `${r.id}：状态「${r.status}」不在 {${ALLOWED_STATUS.join(' / ')}} 里`)
}

/** G-d：恢复条件非空，且不是占位符。 */
function checkRestore(rows: LedgerRow[]): string[] {
  const problems: string[] = []
  for (const r of rows) {
    const v = r.restore.trim()
    if (v === '') {
      problems.push(`${r.id}：恢复条件为空`)
      continue
    }
    for (const p of PLACEHOLDER_RESTORE) {
      if (v.includes(p)) {
        problems.push(`${r.id}：恢复条件是占位符（实测含「${p}」）—— 不可判定的恢复条件等于没登记`)
      }
    }
  }
  return problems
}

/** G-e：活账本行数不越上限。 */
function checkLineCount(text: string): string[] {
  const lines = text.split('\n')
  const count = lines.length - (lines.at(-1) === '' ? 1 : 0)
  return count > LEDGER_MAX_LINES
    ? [`活账本 ${count} 行，超过 ${LEDGER_MAX_LINES} 行上限 —— 正文被搬回来了`]
    : []
}

/**
 * G-f：活账本与详情文件里**不得出现 `deferred-work.md:<数字>` 行号引用**（把 R-31 机械化）。
 *
 * ⚠️ **豁免范围是「原始论证」区块内的逐字原文**，且只有这一处：
 * 那是被**逐字保留**的历史原文，改它就是篡改历史（R-43 的「不删任何原文」）。
 * 豁免的判据是**内容位置**（`### 原始论证` 到 `> 来源：` 之间），不是「看起来像引用」——
 * 所以别的地方写下 `deferred-work.md:123` 照样会红（见反向自检）。
 *
 * ⚠️ **归档层不在本判据射程内** —— `archive/deferred/` 里逐字保留的原文当然含旧行号
 * （那是历史的一部分）；本判据管的是**活跃层**（读者现在会照着读的那两层）。
 */
function checkLineNumberRefs(text: string): string[] {
  const problems: string[] = []
  const lines = text.split('\n')
  let inVerbatim = false
  lines.forEach((line, i) => {
    if (!inVerbatim && line.startsWith('### 原始论证')) {
      inVerbatim = true
      return
    }
    if (inVerbatim) {
      if (line.startsWith('> 来源：')) inVerbatim = false
      return
    }
    if (/deferred-work\.md:\d/.test(line)) {
      problems.push(`第 ${i + 1} 行：出现行号引用「${line.trim()}」—— 行号会随 revision 漂移，引用文档用原文句子（R-31）`)
    }
  })
  return problems
}

interface DetailsSection {
  id: string
  status: string
  owner: string
  restore: string
  summary: string
}

/** 解析详情文件的每个 `## DF-NNN` 小节。 */
function parseDetailsSections(text: string): Map<string, DetailsSection> {
  const lines = text.split('\n')
  const sections = new Map<string, DetailsSection>()
  for (let i = 0; i < lines.length; i++) {
    const m = /^## (DF-\d{3})$/.exec(lines[i])
    if (!m) continue
    const body = lines.slice(i + 1, i + 12)
    const statusLine = body.find((l) => l.startsWith('**状态**：')) ?? ''
    const summaryLine = body.find((l) => l.startsWith('**一句话**：')) ?? ''
    const s = /^\*\*状态\*\*：(.+?) · \*\*归属\*\*：(.+?) · \*\*恢复条件\*\*：(.+)$/.exec(statusLine)
    const o = /^\*\*一句话\*\*：(.+)$/.exec(summaryLine)
    sections.set(m[1], {
      id: m[1],
      status: s?.[1] ?? '',
      owner: s?.[2] ?? '',
      restore: s?.[3] ?? '',
      summary: o?.[1] ?? '',
    })
  }
  return sections
}

/** G-h：账本与详情**一一对应**且四个字段逐字一致。 */
function checkDetailsMatch(rows: LedgerRow[], sections: Map<string, DetailsSection>): string[] {
  const problems: string[] = []
  for (const r of rows) {
    const d = sections.get(r.id)
    if (!d) {
      problems.push(`${r.id}：详情文件里没有对应的 \`## ${r.id}\` 小节（指针指空）`)
      continue
    }
    if (d.status !== r.status) problems.push(`${r.id}：状态不一致（账本「${r.status}」/ 详情「${d.status}」）`)
    if (d.owner !== r.owner) problems.push(`${r.id}：归属不一致（账本「${r.owner}」/ 详情「${d.owner}」）`)
    if (d.restore !== r.restore)
      problems.push(`${r.id}：恢复条件不一致（账本「${r.restore}」/ 详情「${d.restore}」）`)
    if (unescapePipes(d.summary) !== unescapePipes(r.summary))
      problems.push(`${r.id}：一句话不一致（账本「${r.summary}」/ 详情「${d.summary}」）`)
  }
  for (const id of sections.keys()) {
    if (!rows.some((r) => r.id === id)) {
      problems.push(`${id}：详情文件里有小节，账本里没有这一行 —— 两层必须一一对应`)
    }
  }
  return problems
}

/** 取一个 markdown 小节里的表格数据行（去掉表头与分隔行）。 */
function tableRows(lines: string[], heading: string): string[] | null {
  const start = lines.findIndex((l) => l.trim() === heading)
  if (start < 0) return null
  const rows: string[] = []
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i]
    if (l.trim() === '') {
      if (rows.length > 0) break
      continue
    }
    if (!l.startsWith('|')) break
    rows.push(l)
  }
  return rows.slice(2)
}

/**
 * G-g：归档里每个条目都有分诊结论四元组（旧编号 / DF-ID / 结论 / 依据）。
 *
 * ⚠️ **DF-ID 可以是 `—`，但那有条件**：只允许**已结 / 作废**的行不占号；
 * 结论是「开放」的行必须带合法 DF-ID —— 否则一个开放条目会从编号体系里消失。
 * 豁免是**条件式**的，不是「这一格随便填」。
 */
function checkArchiveQuadruples(files: { name: string; text: string }[]): string[] {
  const problems: string[] = []
  for (const f of files) {
    const lines = f.text.split('\n')
    const rows = tableRows(lines, '## 分诊结论')
    const isSourceSection = /^## Deferred from:/m.test(f.text)
    if (rows === null) {
      if (isSourceSection) {
        problems.push(`${f.name}：有 \`## Deferred from:\` 来源段，却没有「分诊结论」小节`)
      }
      continue
    }
    for (const r of rows) {
      const c = splitCells(r)
      if (c.length !== 6) {
        problems.push(`${f.name}：分诊结论行不是六列（实测 ${c.length} 列）—— ${r.slice(0, 60)}`)
        continue
      }
      const [, oldNo, , dfId, verdict, basis] = c
      if (oldNo.trim() === '') problems.push(`${f.name}：分诊结论行缺「旧编号」`)
      if (!ALLOWED_VERDICT.includes(verdict))
        problems.push(`${f.name}：分诊结论「${verdict}」不在 {${ALLOWED_VERDICT.join(' / ')}} 里`)
      if (basis.trim() === '') problems.push(`${f.name}：分诊结论缺「依据（原句）」—— ${r.slice(0, 60)}`)
      const hasId = /^DF-\d{3}$/.test(dfId)
      if (!hasId && dfId !== '—') {
        problems.push(`${f.name}：DF-ID「${dfId}」既不是 DF-### 也不是「—」`)
      }
      if (verdict === '开放' && !hasId) {
        problems.push(`${f.name}：结论是「开放」却没有 DF-ID（实测「${dfId}」）—— 开放条目必须占号`)
      }
    }
  }
  return problems
}

/** G-g 附带：README 的全量对照表必须与各归档文件的分诊结论**对得上**。 */
function checkCrossReferenceTable(readmeText: string, files: { name: string; text: string }[]): string[] {
  const problems: string[] = []
  const rows = tableRows(readmeText.split('\n'), '## 全量对照表')
  if (rows === null) return ['归档 README 里没有「全量对照表」小节']
  const readmeIds: string[] = []
  for (const r of rows) {
    const c = splitCells(r)
    if (c.length !== 6) {
      problems.push(`README 对照表行不是六列（实测 ${c.length} 列）—— ${r.slice(0, 60)}`)
      continue
    }
    const [, , oldNo, , dfId, verdict] = c
    if (oldNo.trim() === '') problems.push(`README 对照表行缺「旧编号」—— ${r.slice(0, 60)}`)
    if (!ALLOWED_VERDICT.includes(verdict))
      problems.push(`README 对照表结论「${verdict}」不合法 —— ${r.slice(0, 60)}`)
    if (/^DF-\d{3}$/.test(dfId)) readmeIds.push(dfId)
  }
  const archiveIds: string[] = []
  for (const f of files) {
    const rows2 = tableRows(f.text.split('\n'), '## 分诊结论')
    if (!rows2) continue
    for (const r of rows2) {
      const c = splitCells(r)
      if (/^DF-\d{3}$/.test(c[3] ?? '')) archiveIds.push(c[3])
    }
  }
  const a = [...readmeIds].sort().join(',')
  const b = [...archiveIds].sort().join(',')
  if (a !== b) {
    problems.push(`README 对照表的 DF-ID 集合与归档文件的不一致（README ${readmeIds.length} 个 / 归档 ${archiveIds.length} 个）`)
  }
  return problems
}

// ── 被守卫的真实文件 ───────────────────────────────────────────────────────

const ledgerText = readFileSync(LEDGER_PATH, 'utf8')
const detailsText = readFileSync(DETAILS_PATH, 'utf8')
const ledgerRows = parseLedgerRows(ledgerText)
const detailsSections = parseDetailsSections(detailsText)
const archiveFiles = readdirSync(ARCHIVE_DIR)
  .filter((f) => f.endsWith('.md'))
  .map((f) => ({ name: f, text: readFileSync(`${ARCHIVE_DIR}${f}`, 'utf8') }))
const readmeText = readFileSync(`${ARCHIVE_DIR}README.md`, 'utf8')

/**
 * 已分配的 DF-ID 全集 = 活账本里的 ∪ 归档「分诊结论」表里的。
 *
 * 闭合的条目从活账本消失，但它的编号留在归档里 ⇒ 这才是「已分配」的全集，
 * 「单调递增、永不复用」（R-35）只能对着它判。
 */
const archiveIds: string[] = archiveFiles.flatMap((f) => {
  const rows = tableRows(f.text.split('\n'), '## 分诊结论')
  if (!rows) return []
  return rows.map((r) => splitCells(r)[3] ?? '').filter((id) => /^DF-\d{3}$/.test(id))
})

const assignedIds: string[] = [...ledgerRows.map((r) => r.id), ...archiveIds]

describe('R-43 延后账本三层形态 —— 活账本', () => {
  it('G-a 每一行都是六列齐全的合法条目行（无空列、详情是指向锚点的链接、一句话不超长）', () => {
    const problems = checkRowShape(ledgerRows, ledgerText)
    expect(
      problems,
      `活账本的条目行不合规：\n${problems.join('\n')}`,
    ).toEqual([])
  })

  it('G-b DF-ID 层内唯一，且「已分配的全部编号」从 DF-001 起连续', () => {
    const problems = [
      ...checkIdUniqueness(ledgerRows.map((r) => r.id), '活账本'),
      ...checkIdUniqueness(archiveIds, '归档'),
      ...checkIdContinuity(assignedIds),
    ]
    expect(problems, `DF-ID 序列有问题：\n${problems.join('\n')}`).toEqual([])
  })

  it('G-c 状态取值 ∈ {待裁决, 待触发, 待排期}', () => {
    const problems = checkStatus(ledgerRows)
    expect(problems, `状态取值越界：\n${problems.join('\n')}`).toEqual([])
  })

  it('G-d 恢复条件非空且不是占位符', () => {
    const problems = checkRestore(ledgerRows)
    expect(problems, `恢复条件不可判定：\n${problems.join('\n')}`).toEqual([])
  })

  it('G-e 活账本行数不超过上限（防它再长回拆分前的体量）', () => {
    const problems = checkLineCount(ledgerText)
    expect(problems, `活账本又变长了：\n${problems.join('\n')}`).toEqual([])
  })
})

describe('R-43 延后账本三层形态 —— 详情层与归档层', () => {
  it('G-f 活账本与详情文件里没有 `deferred-work.md:<数字>` 行号引用（R-31）', () => {
    const problems = [
      ...checkLineNumberRefs(ledgerText).map((p) => `deferred-work.md：${p}`),
      ...checkLineNumberRefs(detailsText).map((p) => `deferred-details.md：${p}`),
    ]
    expect(problems, `出现行号引用：\n${problems.join('\n')}`).toEqual([])
  })

  it('G-h 账本每个 DF-ID 在详情文件都有小节，且状态/归属/恢复条件/一句话逐字一致', () => {
    const problems = checkDetailsMatch(ledgerRows, detailsSections)
    expect(problems, `账本与详情对不上：\n${problems.join('\n')}`).toEqual([])
  })

  it('G-g 归档里每个条目都有分诊结论四元组，README 对照表与之对应', () => {
    const problems = [
      ...checkArchiveQuadruples(archiveFiles),
      ...checkCrossReferenceTable(readmeText, archiveFiles),
    ]
    expect(problems, `归档的分诊结论不齐：\n${problems.join('\n')}`).toEqual([])
  })
})

// ── 反向自检：每条断言「改坏它」都必须变红 ─────────────────────────────────
//
// ⚠️ 这不是形式主义。本仓库吃过三次「守卫允许了它要防的违规」的亏：
// 判 `toBeLessThanOrEqual(1)` 而实际值就是 1、`as` 强转让断言失灵、
// 只扫一个文件却声称「全仓无此形态」。下面每条自检都**调用判据本体**
// （`checkXxx`），把真实数据改坏一次，确认判据真的会报 ——
// 否则守卫只是一段永远为绿的代码（R-41：写永远为绿的守卫比不写更坏）。

describe('R-43 反向自检（改坏即红）', () => {
  it('G-a 自检：把一列清空 / 详情列改成行号链接，判据必须报出来', () => {
    const row = ledgerRows[0]
    const blanked: LedgerRow = { ...row, restore: '' }
    expect(
      checkRowShape([blanked], ledgerText).some((p) => p.includes('恢复条件')),
      '构造失效：清空「恢复条件」列没被判出来 —— 判据漏了一列',
    ).toBe(true)

    const badLink: LedgerRow = { ...row, detail: 'deferred-work.md:399-405' }
    expect(
      checkRowShape([badLink], ledgerText).some((p) => p.includes('详情列')),
      '构造失效：详情列换成行号引用没被判出来',
    ).toBe(true)

    // ⚠️ 转义竖线：`| DF-063 |` 那一行的「一句话」里有 `\|`，
    // 拆行时若按裸 `|` 切，它会被劈成 9 列 —— 判据必须按**未转义**的竖线切。
    const piped = ledgerRows.find((r) => r.summary.includes('\\|'))
    expect(piped, '构造失效：账本里已没有含转义竖线的一行，反向自检失去目标').toBeDefined()
    expect(
      checkRowShape([piped as LedgerRow], ledgerText),
      '构造失效：含 `\\|` 的行被判成了坏行 —— 拆行逻辑把转义竖线当成了分隔符',
    ).toEqual([])
  })

  it('G-b 自检：删掉中间一条 / 复制一条 ID，判据必须报出来；且「结清一条」不该误报', () => {
    // ⚠️ 要删的是**那个编号的全部出现**（活账本一次 + 归档一次），
    // 只删其中一次的话，去重后的集合根本没少东西 ⇒ 判据当然不报 —— 那不是构造失效，是构造没生效。
    const holed = assignedIds.filter((id) => id !== ledgerRows[4].id)
    expect(
      checkIdContinuity(holed).some((p) => p.includes('不连续')),
      '构造失效：删掉中间一条没报「不连续」',
    ).toBe(true)
    expect(
      checkIdUniqueness([...ledgerRows.map((r) => r.id), ledgerRows[3].id], '活账本').some((p) =>
        p.includes('重复'),
      ),
      '构造失效：复制一条 ID 没报「重复」',
    ).toBe(true)

    // ⚠️ **正常动作不得误报**：条目结清 ⇒ 从活账本删掉那一行、原文搬进归档。
    // 若判据只吃活账本，这里就会凭空多一个洞 ⇒ 「结清条目」被判成违规。
    const target = ledgerRows[5].id
    const ledgerWithout = ledgerRows.filter((r) => r.id !== target).map((r) => r.id)
    const union = [...new Set([...ledgerWithout, ...archiveIds])]
    expect(
      checkIdContinuity(union),
      `构造失效：把 ${target} 从活账本删掉（模拟条目结清归档）后守卫会误报 —— ` +
        '判据只吃了活账本，没有吃归档那一侧',
    ).toEqual([])
  })

  it('G-c 自检：状态改成「已完成」，判据必须报出来', () => {
    const row = ledgerRows[0]
    const bad: LedgerRow = { ...row, status: '已完成' }
    expect(
      checkStatus([bad]).some((p) => p.includes('状态')),
      '构造失效：非法状态没被判出来',
    ).toBe(true)
  })

  it('G-d 自检：恢复条件写成「以后再说」，判据必须报出来', () => {
    const row = ledgerRows[0]
    const bad: LedgerRow = { ...row, restore: '以后再说' }
    expect(
      checkRestore([bad]).some((p) => p.includes('占位符')),
      '构造失效：占位符恢复条件没被判出来',
    ).toBe(true)
  })

  it('G-e 自检：造一份超上限的账本，判据必须报出来', () => {
    const overlong = Array.from({ length: LEDGER_MAX_LINES + 1 }, (_, i) => `第 ${i + 1} 行`).join('\n')
    expect(
      checkLineCount(overlong).some((p) => p.includes('超过')),
      '构造失效：超长账本没被判出来',
    ).toBe(true)
  })

  it('G-f 自检：行号引用进账本必红；进「原始论证」的逐字原文则不红（豁免是位置式的）', () => {
    const injected = ledgerText.replace(
      /^(\| DF-001 \|)/m,
      '$1 `deferred-work.md:399-405` |',
    )
    expect(
      checkLineNumberRefs(injected).length,
      '构造失效：往账本里塞的行号引用没被判出来',
    ).toBeGreaterThan(0)

    // 同一段文字放进「原始论证」区块内 ⇒ 不该红（逐字原文豁免）
    const verbatim = detailsText.replace(
      /^(### 原始论证\n)/m,
      '$1\n- 见 `deferred-work.md:170-179`\n',
    )
    expect(
      checkLineNumberRefs(verbatim),
      '构造失效：逐字原文区块里的行号引用被判红了 —— 豁免范围被收窄成「全文」',
    ).toEqual([])
  })

  it('G-g 自检：抽掉依据 / 给开放条目抹掉 DF-ID，判据必须报出来', () => {
    const withRows = archiveFiles.find((f) => tableRows(f.text.split('\n'), '## 分诊结论')?.length)
    expect(withRows, '构造失效：找不到有分诊结论的归档文件').toBeDefined()
    const rows = tableRows((withRows as { name: string; text: string }).text.split('\n'), '## 分诊结论') ?? []
    const first = splitCells(rows[0])
    const noBasis = `| ${first[0]} | ${first[1]} | ${first[2]} | ${first[3]} | ${first[4]} |  |`
    const mutated = { name: (withRows as { name: string }).name, text: (withRows as { text: string }).text.replace(rows[0], noBasis) }
    expect(
      checkArchiveQuadruples([mutated]).some((p) => p.includes('依据')),
      '构造失效：抽掉「依据（原句）」没被判出来',
    ).toBe(true)

    // 结论是「开放」的行抹掉 DF-ID ⇒ 必须红（「—」只允许已结/作废）
    const openRow = rows.find((r) => splitCells(r)[4] === '开放')
    expect(openRow, '构造失效：归档里找不到结论为「开放」的行').toBeDefined()
    const oc = splitCells(openRow as string)
    const noId = `| ${oc[0]} | ${oc[1]} | ${oc[2]} | — | ${oc[4]} | ${oc[5]} |`
    const mutated2 = { name: (withRows as { name: string }).name, text: (withRows as { text: string }).text.replace(openRow as string, noId) }
    expect(
      checkArchiveQuadruples([mutated2]).some((p) => p.includes('开放')),
      '构造失效：开放条目没有 DF-ID 竟没被判出来 —— 「—」的豁免是无条件的',
    ).toBe(true)
  })

  it('G-h 自检：改掉详情里的恢复条件 / 删掉详情小节，判据必须报出来', () => {
    const row = ledgerRows[0]
    const drifted = new Map(detailsSections)
    drifted.set(row.id, { ...row, restore: '与详情层不一致的恢复条件' })
    expect(
      checkDetailsMatch([row], drifted).some((p) => p.includes('恢复条件不一致')),
      '构造失效：详情层漂移没被判出来',
    ).toBe(true)

    const orphan = new Map(detailsSections)
    orphan.delete(row.id)
    expect(
      checkDetailsMatch([row], orphan).some((p) => p.includes('没有对应的')),
      '构造失效：详情小节缺失没被判出来',
    ).toBe(true)
  })
})
