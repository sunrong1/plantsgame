/**
 * 规划产物之间的一致性守卫 —— 钉住 R-37「同一件事只写一次，其余地方只许引用」。
 *
 * ── 为什么需要这两条 ──────────────────────────────────────────────────────
 *   2026-10-24 的 `[CC]`（关卡数 16-20 → 24 关、全书词图 200-400 → 97 张）暴露了两类
 *   **没人能靠肉眼长期守住**的漂移：
 *
 *   ① **同一个数字在几份产物里各写各的** —— GDD 改了、`epics.md` 没改、架构文档没改。
 *      这类漂移一旦发生，读者会把三份文档当成三个事实。⇒ **G293**：三处的关卡数必须一致。
 *
 *   ② **引用号指错了条目** —— `decision-log.md` 的「决定 4」段逐字写着 DF-202 / DF-203 / DF-204，
 *      而那三个号在活账本里是**完全不相干的三条**（全书完成画面 / 回应卡的正确项 / `food` 档区间）。
 *      ⚠️ **存在性检查照样通过**（那三个号确实存在）⇒ 只有**语义级**判据能抓住它。⇒ **G294**。
 *
 * ── 两条判据的形态 ─────────────────────────────────────────────────────────
 *   · **G293 守「一致性」，不守具体数值** —— 「24」这个数由 `decision-log.md` 的「决定 4」
 *     与 GDD 正文共同承载；守卫再抄一份 24 进来，就是 R-37 说的复制链。
 *     将来若再改关卡数，**改 GDD 就必须同时改另外两处**，而「改成几」是 `[CC]` 的事。
 *   · **G294 守「引用的条目必须真的在说这件事」** —— 判据取的是**账本那一行自己的描述**
 *     （活账本的一句话 / 归档层的标题），与被引用的那一行在正文里的主题词做交叉核对。
 *
 * 出处：`_bmad-output/planning-artifacts/sprint-change-proposal-2026-10-24.md` §1.3 / §4。
 *
 * ── 变异验证（R-50 四步，2026-10-24 实测）────────────────────────────────
 *   · **M344**：把 `gdd.md` 正文的关卡数 24 改成 20 ⇒ **G293.1 红**（1 红）⇒ 已复原。
 *   · **M345**：把 `decision-log.md` 决定 4 表格里的 DF-206 改成 DF-202 ⇒ **G294.1 红**（2 红）⇒ 已复原。
 *   两轮都先 `rm -rf node_modules/.vite`（R-50 第 0 步），再用 `grep` 证实变异落盘。
 *
 * 不在 src/core/ 下 —— NFR16：测试全部在 tests/。
 */
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../', import.meta.url))

const GDD_PATH = `${root}_bmad-output/planning-artifacts/gdds/gdd-plants-game-2026-10-11/gdd.md`
const EPICS_PATH = `${root}_bmad-output/planning-artifacts/epics.md`
const ARCHITECTURE_PATH = `${root}_bmad-output/planning-artifacts/game-architecture.md`
const DECISION_LOG_PATH = `${root}_bmad-output/planning-artifacts/gdds/gdd-plants-game-2026-10-11/decision-log.md`
const LEDGER_PATH = `${root}_bmad-output/implementation-artifacts/deferred-work.md`
const ARCHIVE_DIR = `${root}_bmad-output/archive/deferred/`

/** 表格行里的转义竖线（`\|`）还原成真竖线。 */
function unescapePipes(s: string): string {
  return s.replace(/\\\|/g, '|')
}

/** 拆一行 markdown 表格 —— 只在**未被反斜杠转义**的 `|` 处切。 */
function splitCells(line: string): string[] {
  return line.split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim())
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

// ── G293：关卡数在 GDD / epics / 架构三处必须一致 ───────────────────────────

/**
 * 剥掉 markdown 的 **frontmatter**（`---` 包围的那一段）。
 *
 * ⚠️ **必须剥**：GDD 的 frontmatter 里有一条 `revisionNote`，它**逐字引用了旧正文**
 * （「关卡总数约 16-20 关」）⇒ 不剥的话，判据会读到**历史引文**而不是现行正文。
 * 这就是「按整份文件 grep」最典型的坑：同一份文件里有两个答案。
 */
export function bodyOf(md: string): string {
  const m = md.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/)
  return m ? md.slice(m[0].length) : md
}

/**
 * 从一段正文里取「关卡总数 N 关」这个数。
 *
 * ⚠️ **匹配要窄**：只认「关卡总数」后面**第一个**数字，
 * 否则「关卡总数 24 关（1 关 = 1 教材 Unit，上册 12 关 + 下册 12 关）」会取到后面的 12。
 */
export function levelCountOf(text: string): number | null {
  const m = text.match(/关卡总数[^。]*?(\d+)\s*关/)
  return m ? Number(m[1]) : null
}

/** 从架构文档里取「全年 N 单元」这个数。 */
export function unitCountOf(text: string): number | null {
  const m = text.match(/全年\s*(\d+)\s*单元/)
  return m ? Number(m[1]) : null
}

/** `epics.md` 里 FR55 的两处回述（GDD 正文之外的唯一副本）。 */
export function fr55Counts(text: string): number[] {
  const out: number[] = []
  for (const line of text.split('\n')) {
    if (!line.startsWith('FR55:')) continue
    const m = line.match(/关卡总数[^。]*?(\d+)\s*关/) ?? line.match(/全年两册\s*(\d+)\s*关/)
    if (m) out.push(Number(m[1]))
  }
  return out
}

/**
 * G293 的判据本体：四处数字必须**全等**，且都取得到。
 *
 * ⚠️ **判据粒度**：它比「FR55 那一条」粗（它管全部四处），这是**故意的** ——
 * 一处漏改就会破等式，而「只查一处」是最常见的假绿来源。
 */
export function checkLevelCountConsistency(
  gdd: string,
  epics: string,
  architecture: string,
): string[] {
  const problems: string[] = []
  const gddCount = levelCountOf(bodyOf(gdd))
  if (gddCount === null) {
    problems.push('GDD 正文里取不到「关卡总数 N 关」这个数')
    return problems
  }
  const frs = fr55Counts(epics)
  if (frs.length === 0) {
    problems.push('`epics.md` 里取不到 FR55 的关卡数')
    return problems
  }
  for (const [i, n] of frs.entries()) {
    if (n !== gddCount) {
      problems.push(`\`epics.md\` 第 ${i + 1} 处 FR55 的关卡数是 ${n}，GDD 正文是 ${gddCount}`)
    }
  }
  const archCount = unitCountOf(architecture)
  if (archCount === null) {
    problems.push('`game-architecture.md` 里取不到「全年 N 单元」这个数')
  } else if (archCount !== gddCount) {
    problems.push(`\`game-architecture.md\` 的单元数是 ${archCount}，GDD 正文的关卡数是 ${gddCount}`)
  }
  return problems
}

// ── G294：决定 4 引用的延后条目必须真的在说这件事 ───────────────────────────

/** 活账本的条目行。 */
interface LedgerRow {
  id: string
  summary: string
}

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
    rows.push({ id: c[0], summary: unescapePipes(c[4] ?? '') })
  }
  return rows
}

/**
 * 解析「决定 4」那张表：每行返回「左列（主题）」与它引用的 DF-ID。
 *
 * ⚠️ **只认表格行** —— 决定 4 段里还有一串「未决」的项目符号列表，
 * 那些不是「表格行 ⇒ 一个主题 ⇒ 一个引用」的对应关系。
 */
export function decision4Cites(text: string): { topic: string; dfId: string }[] {
  const lines = text.split('\n')
  const start = lines.findIndex((l) => l.startsWith('### 决定 4'))
  if (start < 0) return []
  const out: { topic: string; dfId: string }[] = []
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]
    if (/^### /.test(line)) break
    if (!line.startsWith('|')) continue
    const c = splitCells(line)
    const dfId = line.match(/DF-\d{3}/)?.[0]
    if (!dfId) continue
    out.push({ topic: c[0] ?? '', dfId })
  }
  return out
}

/**
 * 解析一个 DF-ID 的**描述**：活账本的一句话说；已结条目则取归档层「分诊结论」表的标题列。
 *
 * ⚠️ **必须两处都查** —— 已结的条目（本次的 DF-206）已经从活账本搬进归档层，
 * 只查活账本会把「已结」误判成「查无此条」。
 */
export function resolveDfDescription(
  id: string,
  ledger: LedgerRow[],
  archiveFiles: { name: string; text: string }[],
): string | null {
  const live = ledger.find((r) => r.id === id)
  if (live) return live.summary
  for (const f of archiveFiles) {
    const rows = tableRows(f.text.split('\n'), '## 分诊结论')
    for (const r of rows ?? []) {
      const c = splitCells(r)
      if (c[3] === id) return c[2] ?? ''
    }
  }
  return null
}

/**
 * 主题 → 该主题在**账本条目描述**里必须出现的词。
 *
 * ⚠️ 这张表是**判据的语义来源**，不是抄来的正文：
 * 「关卡数」这条要能在账本描述里认出「关卡数」三个字，
 * 「卡型锚点」要能认出「锚点」，「选项数档位」要能认出「档位」。
 */
const TOPIC_RULES: { topicPart: string; token: string }[] = [
  { topicPart: '关卡数', token: '关卡数' },
  { topicPart: '锚点', token: '锚点' },
  { topicPart: '选项数档位', token: '档位' },
]

/**
 * G294 的判据本体：决定 4 的每一条主题都必须指向**语义对得上**的账本条目。
 *
 * ⚠️ **它抓的是「号存在但指错条目」** —— 例如把关卡数那行写成 DF-202（全书完成画面），
 * 存在性检查照样通过，只有本判据会红。
 */
export function checkDecision4Cites(
  decisionLog: string,
  ledger: LedgerRow[],
  archiveFiles: { name: string; text: string }[],
): string[] {
  const problems: string[] = []
  const cites = decision4Cites(decisionLog)
  if (cites.length === 0) {
    problems.push('`decision-log.md` 的「决定 4」段里解析不出带 DF-ID 的表格行')
    return problems
  }
  for (const rule of TOPIC_RULES) {
    const hit = cites.filter((c) => c.topic.includes(rule.topicPart))
    if (hit.length === 0) {
      problems.push(`「决定 4」里找不到主题含「${rule.topicPart}」的表格行`)
      continue
    }
    for (const c of hit) {
      const desc = resolveDfDescription(c.dfId, ledger, archiveFiles)
      if (desc === null) {
        problems.push(`「${c.topic}」引用了 ${c.dfId}，但活账本与归档层都查不到这一条`)
        continue
      }
      if (!desc.includes(rule.token)) {
        problems.push(
          `「${c.topic}」引用了 ${c.dfId}，但那条账本条目说的不是这件事 —— ` +
            `它的描述里没有「${rule.token}」`,
        )
      }
    }
  }
  return problems
}

// ── 被守卫的真实文件 ───────────────────────────────────────────────────────

const gddText = readFileSync(GDD_PATH, 'utf8')
const epicsText = readFileSync(EPICS_PATH, 'utf8')
const architectureText = readFileSync(ARCHITECTURE_PATH, 'utf8')
const decisionLogText = readFileSync(DECISION_LOG_PATH, 'utf8')
const ledgerText = readFileSync(LEDGER_PATH, 'utf8')
const ledgerRows = parseLedgerRows(ledgerText)
const archiveFiles = readdirSync(ARCHIVE_DIR)
  .filter((f) => f.endsWith('.md'))
  .map((f) => ({ name: f, text: readFileSync(`${ARCHIVE_DIR}${f}`, 'utf8') }))

describe('G293 关卡数在 GDD / epics / 架构三处不得漂移', () => {
  it('G293.1 四处数字全等（判据取得到每一个数）', () => {
    const problems = checkLevelCountConsistency(gddText, epicsText, architectureText)
    expect(problems, `关卡数在几份产物里对不上：\n${problems.join('\n')}`).toEqual([])
  })

  it('G293.2 GDD 正文的关卡数不是一个「区间」而是一个数（区间会让等式判据失效）', () => {
    // ⚠️ 旧口径是「约 16-20 关」—— 那是个区间，本判据取不到单一数字 ⇒ 必须红。
    const body = bodyOf(gddText)
    const staleBody = body.replace(/关卡总数\s*\*?\*?\d+\s*关/, '关卡总数约 16-20 关')
    expect(staleBody, '构造失效：没能在 GDD 正文里找到「关卡总数 N 关」那一处').not.toBe(body)
    const stale = gddText.replace(body, staleBody)
    expect(
      checkLevelCountConsistency(stale, epicsText, architectureText).length,
      '构造失效：把 GDD 改回区间口径却没被判出来 —— 等式判据对「取不到数」不敏感',
    ).toBeGreaterThan(0)
  })
})

describe('G294 决定 4 引用的延后条目必须真的在说这件事', () => {
  it('G294.1 三个主题的引用都指向语义对得上的账本条目', () => {
    const problems = checkDecision4Cites(decisionLogText, ledgerRows, archiveFiles)
    expect(problems, `决定 4 的引用对不上账本：\n${problems.join('\n')}`).toEqual([])
  })

  it('G294.2 反向自测：把关卡数那行改成 DF-202（号存在但说的不是这件事），必须红', () => {
    // ⚠️ 改的是「决定 4」那张表里的**第一处** DF-206（`String.replace` 的字符串模式只换第一处）。
    const broken = decisionLogText.replace('DF-206', 'DF-202')
    expect(broken, '构造失效：`decision-log.md` 里找不到 DF-206 这一处引用').not.toBe(decisionLogText)
    const problems = checkDecision4Cites(broken, ledgerRows, archiveFiles)
    expect(
      problems.some((p) => p.includes('DF-202') && p.includes('关卡数')),
      `构造失效：把引用换成不相干的 DF-202 竟没被判出来：\n${problems.join('\n')}`,
    ).toBe(true)
  })

  it('G294.3 反向自测：引用一个根本不存在的号，必须红（而不是静默跳过）', () => {
    const broken = decisionLogText.replace('DF-206', 'DF-999')
    expect(broken, '构造失效：`decision-log.md` 里找不到 DF-206 这一处引用').not.toBe(decisionLogText)
    const problems = checkDecision4Cites(broken, ledgerRows, archiveFiles)
    expect(
      problems.some((p) => p.includes('DF-999') && p.includes('查不到')),
      `构造失效：引用不存在的 DF-999 竟没被判出来：\n${problems.join('\n')}`,
    ).toBe(true)
  })
})
