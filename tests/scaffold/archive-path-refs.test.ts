/**
 * G309 —— 归档之后，不许留下**悬空路径引用**。
 *
 * 守什么：仓库里凡是以 `_bmad-output/implementation-artifacts/<文件名>.md` 形式写的
 * 路径引用，其目标文件必须**此刻**就住在 `implementation-artifacts/` 里。
 * 目标已经被 `git mv` 进 `archive/` 的引用 = 悬空 ⇒ 读者照着找必然 ENOENT。
 *
 * 为什么：2026-10-25 夜归档 Story 1.11 / 1.12 / 2.1 时实测发现 —— 归档会**连带作废**
 * 别处写着这个文档的路径。全仓扫描（只读脚本，排除 `node_modules` / `.git` / `dist` /
 * `coverage` / `.claude`）的实测结果是 **38 处**命中，其中 **32 处**是真悬空
 * （另有 1 处是省略号写法 `1-13-…md`，合计 **33 处**已在本批改掉）。
 * ⚠️ 原文说的是「路径引用为零」—— 那是 2026-10-15 文档治理时的**未兑现断言**，
 * 至今仍活着一批反例。
 *
 * 与 R-40 的 AC-4 那条守卫是**互补的两个方向**：
 *   · AC-4（`docs-rules.test.ts`）查「活跃文档不许引用**归档里**的具体文件」；
 *   · 本条查「任何文档不许引用一个**已经不在原处**的文件」。
 * 只查前者的话，把 `archive/1-15-…md` 改成 `implementation-artifacts/1-15-…md`
 * 就能骗过它 —— 而那恰恰是最容易犯的错（归档时手滑写回旧目录）。
 *
 * 例外清单：允许存在的悬空引用**逐条写明理由**，且**写死出现次数** ——
 * 次数对不上也报红（例外不能悄悄过期，也不能一处合规替另一处背书）。
 *
 * 不在 src/core/ 下 —— NFR16：测试全部在 tests/。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../', import.meta.url))
const IMPL_DIR = `${root}_bmad-output/implementation-artifacts/`
const ARCHIVE_DIR = `${root}_bmad-output/archive/`

/** 扫描时跳过的目录：工具链自带 + BMAD 安装器管理区 + 两个本机报告目录。 */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'coverage',
  '.claude',
  '.vitest',
  '_bmad',
])

/** 只在文本文件里找路径引用。 */
const SCAN_EXT = /\.(md|ts|vue|css|scss|json|ya?ml|js|mjs|cjs|html|txt|toml)$/

/**
 * 引用形态：目录段 `implementation-artifacts/` + 一个以 `.md` 结尾的文件名。
 *
 * 名字里可以有 CJK、空格以外的一切字符，所以字符类**排除**的是「断词符」而不是
 * 「允许的字符」—— 白名单式会让 CJK 文件名整条漏检。
 * `\s` 也在排除项里（它含换行）—— 否则惰性匹配会跨行去找下一个 `.md`，
 * 把两行之外的无关文件名拖进来。
 */
const IMPL_REF = /implementation-artifacts\/([^`\s"'（）【】、，。；：:！!？?…*#]+?\.md)/g

export interface StaleRef {
  /** 仓库相对路径 */
  file: string
  /** 1 起的行号 */
  line: number
  /** 目标文件名（不含目录） */
  target: string
}

/**
 * 例外清单：允许存在的悬空引用。
 *
 * 键 = `<仓库相对路径>|<目标文件名>`，值 = **允许出现的次数**。
 * 次数是硬约束：多一处少一处都报红（否则一处合规就把新违规一起背书了）。
 */
export const ALLOWED_STALE_REFS: Readonly<Record<string, number>> = {
  // DF-028：`.claude/settings.local.json` 里那条**真的失效**的 Bash 授权，
  // 指向的是 1.5 那份已归档的文档。这三处写的是**那个失效路径本身** ——
  // 改成新路径反而会掩盖问题。DF-028 正在等人裁决，故保留原样。
  // ⚠️ 这里**不许**写出完整的旧路径字面量 —— 本文件自己也在扫描范围内。
  '_bmad-output/archive/deferred/2026-10-15--qd-文档治理.md|1-5-回合状态机与题单.md': 2,
  '_bmad-output/implementation-artifacts/deferred-details.md|1-5-回合状态机与题单.md': 2,
  '_bmad-output/implementation-artifacts/deferred-work.md|1-5-回合状态机与题单.md': 1,
  // `git show 5049e69:<旧路径>` —— 那是**历史 commit 上的路径**，
  // 在那个 commit 上真实存在（考古用法），不是失效引用。
  '_bmad-output/archive/README.md|1-4-战斗内核与-5-条数值断言.md': 1,
}

/** 递归收集仓库里要扫描的文本文件（仓库相对路径 + 正文）。 */
export function collectTextFiles(
  dir: string,
  acc: { path: string; text: string }[] = [],
): { path: string; text: string }[] {
  const base = dir.endsWith('/') ? dir : `${dir}/`
  let names: string[]
  try {
    names = readdirSync(base)
  } catch {
    return acc // 断链 / 无权限：跳过（守卫红应当意味着「有违规」，不是「读不到」）
  }
  for (const name of names) {
    if (SKIP_DIRS.has(name)) continue
    const full = `${base}${name}`
    let isDir = false
    try {
      isDir = statSync(full).isDirectory()
    } catch {
      continue
    }
    if (isDir) {
      collectTextFiles(full, acc)
      continue
    }
    if (!SCAN_EXT.test(name)) continue
    acc.push({ path: full.slice(root.length), text: readFileSync(full, 'utf8') })
  }
  return acc
}

/** 某目录下的 `.md` 文件名集合（不递归）。 */
export function mdNamesIn(dir: string): Set<string> {
  return new Set(
    readdirSync(dir).filter((n) => n.endsWith('.md') && statSync(`${dir}${n}`).isFile()),
  )
}

/**
 * 判据本体：把「指向已归档文件的路径引用」全部找出来。
 *
 * `activeNames` = 此刻真的住在 `implementation-artifacts/` 里的 `.md`；
 * `archivedNames` = 住在 `archive/` 里的 `.md`。
 * 目标**既已归档、又不在活跃目录** ⇒ 悬空。
 */
export function staleStoryDocRefs(
  files: readonly { path: string; text: string }[],
  activeNames: ReadonlySet<string>,
  archivedNames: ReadonlySet<string>,
): StaleRef[] {
  const out: StaleRef[] = []
  for (const file of files) {
    const lines = file.text.split('\n')
    lines.forEach((line, i) => {
      IMPL_REF.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = IMPL_REF.exec(line)) !== null) {
        const target = m[1]
        if (!archivedNames.has(target)) continue
        if (activeNames.has(target)) continue
        out.push({ file: file.path, line: i + 1, target })
      }
    })
  }
  return out
}

/**
 * 例外清单的核对：报出「没登记」「条数对不上」「清单已失效」三类问题。
 */
export function allowlistProblems(
  refs: readonly StaleRef[],
  allowed: Readonly<Record<string, number>>,
): string[] {
  const problems: string[] = []
  const actual = new Map<string, number>()
  for (const r of refs) {
    const key = `${r.file}|${r.target}`
    actual.set(key, (actual.get(key) ?? 0) + 1)
  }
  for (const [key, count] of actual) {
    const expected = allowed[key]
    if (expected === undefined) {
      problems.push(`${key} —— 悬空路径引用不在例外清单里（出现 ${count} 次）`)
    } else if (expected !== count) {
      problems.push(`${key} —— 例外清单写的是 ${expected} 次，实际 ${count} 次（例外不能悄悄过期）`)
    }
  }
  for (const [key, expected] of Object.entries(allowed)) {
    if (!actual.has(key)) {
      problems.push(`${key} —— 例外清单条目已失效（写了 ${expected} 次，实际 0 次）`)
    }
  }
  return problems
}

describe('G309 —— 归档后不许留下悬空路径引用', () => {
  const files = collectTextFiles(root)
  const activeNames = mdNamesIn(IMPL_DIR)
  const archivedNames = mdNamesIn(ARCHIVE_DIR)
  const refs = staleStoryDocRefs(files, activeNames, archivedNames)
  const problems = allowlistProblems(refs, ALLOWED_STALE_REFS)

  it('G309.1 没有指向已归档 story 文档的路径引用（除非在例外清单里且条数对得上）', () => {
    // ── 非空断言：扫描范围与目标集合都不得被悄悄掏空 ──
    expect(files.length, '扫描到的文件数异常少 —— 扫描范围被掏空了，这条守卫就成了空转').toBeGreaterThan(50)
    expect(
      files.filter((f) => f.path.startsWith('_bmad-output/archive/')).length,
      '扫描范围没覆盖归档层 —— 归档层里的悬空引用就永远抓不到（实测这一层有 23 份 story 文档）',
    ).toBeGreaterThan(5)
    expect(archivedNames.size, '归档层的 story 文档数异常少 —— 目标集合被掏空了').toBeGreaterThan(10)
    expect(
      refs.length,
      '一条悬空引用都没报出来 —— 判据本体可能已经失效（例外清单里有 ' +
        `${Object.keys(ALLOWED_STALE_REFS).length} 条登记，实际报出 0 条）`,
    ).toBeGreaterThan(0)

    expect(
      problems,
      '有路径引用指向已经归档的 story 文档 —— 读者照着找必然 ENOENT。' +
        '要么把它改成归档后的路径（归档层内）或改写成**键**（活跃层内，R-40 的 AC-4 守卫' +
        '禁止活跃文档写 `archive/1-*.md`），要么在例外清单里登记并写明理由：\n' +
        problems.join('\n'),
    ).toEqual([])
  })

  it('G309.2 反向自测：判据真能报出「指向已归档文档的路径引用」（判据本体真的被调用）', () => {
    // ⚠️ 夹具里的路径**必须运行时拼出来** —— 本文件自己也在扫描范围内，
    // 写字面量会让本守卫把自己的源码当成违规项报出来。
    const archivedTarget = '1-10-战场渲染与网格.md'
    const activeTarget = '1-2-音频解锁与-tts-朗读.md'
    const synth = [
      { path: 'synthetic/stale.md', text: `见 _bmad-output/implementation-artifacts/${archivedTarget}` },
      { path: 'synthetic/ok.md', text: `见 _bmad-output/implementation-artifacts/${activeTarget}` },
      { path: 'synthetic/none.md', text: '这里没有任何路径引用' },
    ]
    const synthRefs = staleStoryDocRefs(
      synth,
      new Set([activeTarget]),
      new Set([archivedTarget, activeTarget]),
    )

    expect(
      synthRefs,
      '判据对「指向已归档文档的路径引用」毫无反应 —— 它已经失效了（这条自检就是它唯一的防线）',
    ).toEqual([{ file: 'synthetic/stale.md', line: 1, target: archivedTarget }])

    // 活跃文档的引用**不许**报 —— 判据不能靠「见到路径就报」蒙对
    expect(
      synthRefs.some((r) => r.target === activeTarget),
      '判据把指向活跃文档的引用也报了出来 —— 它分不清「已归档」与「还在原地」',
    ).toBe(false)

    // 例外清单的两个方向都得会报：条数对不上 / 清单条目已失效
    expect(
      allowlistProblems(synthRefs, { 'synthetic/stale.md|1-10-战场渲染与网格.md': 3 }),
      '例外清单条数与实际不符时没有报出来 —— 清单可以悄悄过期',
    ).toHaveLength(1)
    expect(
      allowlistProblems([], { 'synthetic/gone.md|1-10-战场渲染与网格.md': 1 }),
      '例外清单里已经没有对应引用时没有报出来 —— 失效的例外可以永久挂在那里',
    ).toHaveLength(1)
  })
})
