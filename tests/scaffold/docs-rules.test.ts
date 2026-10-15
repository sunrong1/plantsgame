/**
 * 文档治理的结构守卫 —— 钉住 R-37 与 R-40。
 *
 * 守什么：`docs/rules/` 里的每条规则在仓库里只有一份正文（R-37）；已完成的 story
 * 文档进了 `archive/` 且活跃文档不再引用它们（R-40）；以及「常驻文件不许长回去」——
 * `sprint-status.yaml` 的叙事、`CLAUDE.md` 的体量。
 *
 * 为什么：这三个不变量**都已经在本仓库发过病**。约定被 12 个 story 逐字誊抄、
 * 抄到第 4 手漂移成 6 类活着的错误信息；`sprint-status.yaml` 被瘦身过一次
 * （21.7K → 5.8K，commit 9435080），随后 1.11 / 1.12 之后又涨回 4 段几千字的
 * 行尾注释。**一次性动作已被证伪，只能靠守卫钉死。**
 *
 * 出处：`_bmad-output/implementation-artifacts/spec-doc-governance.md` 的 AC 1-4。
 * AC 5（守卫自身的变异验证）是手工执行的，不在本文件内 —— 见该 spec 的 Verification。
 *
 * 不在 src/core/ 下 —— NFR16：测试全部在 tests/。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../', import.meta.url))

const RULES_DIR = `${root}docs/rules/`
const IMPL_DIR = `${root}_bmad-output/implementation-artifacts/`
const SPRINT_STATUS = `${IMPL_DIR}sprint-status.yaml`
const CLAUDE_MD = `${root}CLAUDE.md`

/** 扫描正文重复时要跳过的目录：工具链自带、以及规则/归档本身的两个例外区。 */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'coverage',
  '.claude',
  '.vitest',
  '_bmad', // BMAD 安装器管理，不归本项目规则管
])

/** 只在这些扩展名里找正文重复 —— 规则正文只可能出现在文本文件里。 */
const SCAN_EXT = /\.(md|ts|vue|css|scss|json|ya?ml|js|mjs|cjs|html|txt|toml)$/

/** 判据上限：短于这个长度的「规则正文」没有鉴别力，拿它 grep 只会制造假绿。 */
const MIN_RULE_TEXT = 20

/** CLAUDE.md 行数上限。写超了说明有人把正文搬回来了，而不是索引变长了。 */
const CLAUDE_MD_MAX_LINES = 110

/**
 * sprint-status.yaml 的总行长上限（含注释）。
 *
 * 刻意量**总长**而不是「剥掉 `#` 之后」的长度：本文件那次复发恰恰是把几千字塞进
 * `#` 之后（`last_updated: … # [DS] Story 1.12 → review。**建造/阳光…`），
 * 剥注释的判据对真正的复发模式完全失明。
 *
 * 200 的来由：当前最长合法内容行是 85 字符（一条 story key），复发时最短的那行也有 344。
 * 取 200 = 合法内容的 2.3 倍，远低于任何一次复发。
 */
const SPRINT_STATUS_MAX_LINE = 200

const walk = (dir: string, acc: string[] = []): string[] => {
  // 显式补尾斜杠：递归时目录名不带分隔符会拼出 `foo/barbaz` 这种不存在的路径
  const base = dir.endsWith('/') ? dir : `${dir}/`
  for (const name of readdirSync(base)) {
    if (SKIP_DIRS.has(name)) continue
    const full = `${base}${name}`
    if (statSync(full).isDirectory()) walk(full, acc)
    else if (SCAN_EXT.test(name)) acc.push(full)
  }
  return acc
}

/** 从规则文件里抽出「每条规则的 `**规则**` 字段正文」。 */
const parseRuleTexts = (): { id: string; file: string; text: string }[] => {
  const out: { id: string; file: string; text: string }[] = []
  for (const name of readdirSync(RULES_DIR)) {
    if (!name.endsWith('.md') || name === 'README.md') continue
    const file = name
    const raw = readFileSync(`${RULES_DIR}${name}`, 'utf8')
    // 以 `### R-XX` 切块；每块里取 `**规则**` 到下一个粗体字段/分隔线/标题之间的正文
    for (const block of raw.split(/^### /m).slice(1)) {
      const id = block.match(/^(R-\d+)/)?.[1]
      if (!id) continue
      const field = block.split('**规则**')[1]?.split(/\n\*\*|\n---|\n#/)[0] ?? ''
      const text = field.trim()
      if (text.length >= MIN_RULE_TEXT) out.push({ id, file, text })
    }
  }
  return out
}

describe('R-37 判据单一来源（AC-1）', () => {
  const rules = parseRuleTexts()

  it('规则文件里解析出了足够的规则（防解析器静默失效导致判据空转）', () => {
    expect(rules.length).toBeGreaterThanOrEqual(30)
  })

  it('每条规则的「规则」正文在 rules/ 与 archive/ 之外没有第二份', () => {
    // 故意排除规则目录本身（正文就该在那）与 archive/（历史文档，按 R-40 默认不读）
    const targets = walk(root).filter(
      (f) => !f.startsWith(RULES_DIR) && !f.startsWith(`${root}_bmad-output/archive/`),
    )
    expect(targets.length).toBeGreaterThan(50)

    const offenders: string[] = []
    for (const { id, text } of rules) {
      for (const file of targets) {
        if (readFileSync(file, 'utf8').includes(text)) {
          offenders.push(`${id} 的正文出现在 ${file.slice(root.length)}`)
        }
      }
    }
    expect(
      offenders,
      `规则正文被复制到了别处 —— 按 R-37 应改成 R-ID 引用，不要同步两份：\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('README 索引列出了每一条规则（索引漏条 = 规则不可发现）', () => {
    const index = readFileSync(`${RULES_DIR}README.md`, 'utf8')
    const missing = rules.map((r) => r.id).filter((id) => !index.includes(id))
    expect(missing, `这些规则没进 docs/rules/README.md 索引：${missing.join('、')}`).toEqual([])
  })
})

describe('R-40 已完成 story 归档（AC-2 / AC-3 / AC-4）', () => {
  it('CLAUDE.md 不超过体量上限（AC-3）—— 规则正文搬进来就变长，长了说明又被搬回来了', () => {
    // 用与 `wc -l` 相同的口径数行：结尾换行不额外算一行，
    // 否则人看到 110 行而守卫报 111，阈值就成了看不懂的谜
    const raw = readFileSync(CLAUDE_MD, 'utf8')
    const lines = raw.split('\n').length - (raw.endsWith('\n') ? 1 : 0)
    expect(
      lines,
      `CLAUDE.md 有 ${lines} 行，超过 ${CLAUDE_MD_MAX_LINES} 行上限；` +
        '它只是入口，规则正文应住在 docs/rules/',
    ).toBeLessThanOrEqual(CLAUDE_MD_MAX_LINES)
  })

  it('sprint-status.yaml 没有超长行（AC-2）—— 叙事不许回流，含注释总长', () => {
    const raw = readFileSync(SPRINT_STATUS, 'utf8')
    const long = raw
      .split('\n')
      .map((line, i) => ({ n: i + 1, len: line.trimEnd().length }))
      .filter((x) => x.len > SPRINT_STATUS_MAX_LINE)
    expect(
      long.map((x) => `第 ${x.n} 行 ${x.len} 字符`),
      `sprint-status.yaml 有 ${long.length} 行超过 ${SPRINT_STATUS_MAX_LINE} 字符：` +
        '运行复盘属于 story 文档的 Completion Notes，不属于状态账本',
    ).toEqual([])
  })

  it('活跃文档不引用 archive/ 下的具体文件（AC-4）', () => {
    // 判据只咬「引用了某个具体归档文件」，不咬「提到 archive 这个目录」——
    // CLAUDE.md 的目录约定与 R-40 都必须能提到 archive/ 本身
    //
    // 范围含 `docs/`：M6 实测漏掉它时守卫对 docs/rules/process.md 里的引用完全失明，
    // 而那正是 R-40 自己所在的目录。
    const active = [CLAUDE_MD, ...walk(IMPL_DIR), ...walk(`${root}docs/`)]
    const offenders: string[] = []
    for (const file of active) {
      const hit = readFileSync(file, 'utf8').match(/archive\/1-\d[^\s)`|]*/g)
      if (hit) offenders.push(`${file.slice(root.length)} → ${hit.join('、')}`)
    }
    expect(
      offenders,
      `活跃文档引用了归档里的具体文件，应改为 R-ID 引用或说明归属：\n${offenders.join('\n')}`,
    ).toEqual([])
  })
})
