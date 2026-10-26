/**
 * G329 —— 文档里写的**可执行命令**必须真的能跑。
 *
 * ── 守什么 ────────────────────────────────────────────────────────────────
 * 活文档（`docs/`、`_bmad-output/implementation-artifacts/`、
 * `_bmad-output/planning-artifacts/`、`CLAUDE.md`）里凡是**命令形态**的引用：
 *   ① `npm run <name>` —— `<name>` 必须是 `package.json` 的 `scripts` 里的一条；
 *   ② `<runner> scripts/<file>`（`runner` ∈ `bash` / `sh` / `python3` / `python` /
 *      `node` / `tsx` / `npx tsx`）—— `scripts/<file>` 必须在磁盘上真实存在。
 * 有一个不成立 ⇒ 报红，并点名**文件与行号**。
 *
 * ── 为什么（DF-033 的根因）────────────────────────────────────────────────
 * `d353e62` 用 `scripts/check-execution-drift.py` 换掉了 `scripts/check-doc-consistency.sh`，
 * **没有任何 story 登记过这次删除**，而至少 6 处文档仍把它列为收尾命令
 * ⇒ 照着文档跑的人必然 ENOENT。DF-033 记下的根因是
 * 「**新引入一条收尾命令时没有回头扫描既有文档**」，且「**无工具能自动发现**」。
 * ⇒ 本守卫把那一步变成**每次都跑**的机器检查。
 *
 * ── 口径（写清楚，免得下次各判各的）──────────────────────────────────────
 * · **只认命令形态，不认裸路径。** 裸路径（`scripts/gen-voice.ts` 那样）在活文档里
 *   大量存在，且绝大多数是**历史引述**（「原来写的是 X，现在改成 Y」）
 *   ⇒ 逐条改它们等于伪造历史。只有「**被包管理器 / 解释器调用**的路径」
 *   才是一条真命令 ⇒ 判据落在**后果**上（这条命令能不能跑），
 *   不是落在「文档里出现了某个字符串」这种写法级判据上。
 * · **占位符不是命令。** `npm run <name>`、`bash scripts/<file>.sh` 这类**形态说明**
 *   里的 `<` `>` `*` 不在字符类里 ⇒ 天然不匹配。
 * · **归档件不扫**（R-40）：归档是历史，历史里的命令本来就可能已经不存在。
 *   （DF-033 记的那 6 处悬空引用就在归档里 —— 那是历史，不改。）
 * · **「原始论证」区块豁免**：详情层逐字保留的原始论证里可能引述已删掉的命令
 *   ⇒ 改它就是篡改历史。豁免是**位置式**的（`### 原始论证` 到 `> 来源：` 之间），
 *   与账本守卫 G-f 用的是同一套约定。
 *
 * ── 与 DF-033 的关系 ─────────────────────────────────────────────────────
 * 本守卫**不**改那 6 处历史悬空引用（它们在归档里，按 R-40 不动）；
 * 它保证的是**下一次**删改门禁脚本时，活文档里的命令引用**当场**变红。
 *
 * ── 变异验证（R-50 触发条件 ① / ②：判据靠扫源码文本）──────────────────────
 * 本判据是**自己写的扫描器**（正则 + 逐行切分 + 位置式豁免）⇒ 真做了两个变异：
 *   **M396**：往 `docs/rules/process.md` 里加一行
 *   `bash scripts/check-doc-consistency.sh`（**正是 DF-033 记的那个已删脚本**）
 *   ⇒ `grep` 证实落盘 ⇒ G329.1 **确实变红**，且报错**点名了文件与行号**
 *   （`docs/rules/process.md：第 11 行引用了不存在的脚本文件
 *   \`scripts/check-doc-consistency.sh\` —— 照着跑必然 ENOENT`）⇒ 判据真的在咬。
 *   **M397**：在同一行再加一个 `npm run check-doc-consistency`
 *   ⇒ **2 条问题**（脚本文件那条 + npm 脚本那条）⇒ 两个分支都咬。
 *   两次都已复原（`git diff --stat` 复核 `docs/rules/process.md` 逐字相同）。
 *
 * 不在 src/core/ 下 —— NFR16：测试全部在 tests/。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../', import.meta.url))

/** 扫描的目录（相对仓库根）。 */
const SCAN_DIRS = ['docs', '_bmad-output/implementation-artifacts', '_bmad-output/planning-artifacts']

/** 扫描的单文件（相对仓库根）。 */
const SCAN_FILES = ['CLAUDE.md']

/** 跳过的目录名：归档件（R-40）与工具链自带目录。 */
const SKIP_DIRS = new Set(['archive', 'node_modules', '.git', 'dist', 'coverage', '.claude', '_bmad'])

/**
 * `npm run <name>` —— 脚本名允许 `:` 与 `-`（`validate:content` / `balance-sim`）。
 *
 * ⚠️ 字符类**不含** `<` `>` ⇒ `npm run <name>` 这种**形态说明**天然不匹配。
 */
const NPM_RUN = /npm run ([A-Za-z0-9:_-]+)/g

/**
 * `<runner> scripts/<file>` —— runner 是能直接执行该文件的解释器 / 包管理器。
 *
 * ⚠️ 顺序要紧：`python3` 必须排在 `python` 前面（否则 `python3` 只匹配到 `python`
 * 后面接 `3`，整条失配）；`bash` 必须排在 `sh` 前面（`\b` 虽能挡住 `bash` 里的 `sh`，
 * 但两个都列出来更直白）。
 */
const SCRIPT_PATH = /\b(?:bash|sh|python3|python|node|tsx|npx tsx) +(scripts\/[A-Za-z0-9._-]+)/g

/** 一条命令引用。 */
export interface CommandRef {
  /** 仓库相对路径 */
  file: string
  /** 行号（1 起） */
  line: number
  /** 判定类型 */
  kind: 'npm-run' | 'script-path'
  /** 被引用的目标：npm 脚本名 / 仓库相对路径 */
  target: string
}

/**
 * 这一行是不是落在「原始论证」区块里（位置式豁免）。
 *
 * 往回找最近的 `### 原始论证` 标题；遇到 `> 来源：` 或任何 `## ` 标题就停
 * ⇒ 豁免范围**不会**漫到相邻小节。
 */
export function isVerbatimHistoryLine(lines: string[], index: number): boolean {
  for (let i = index; i >= 0; i -= 1) {
    const line = lines[i]!
    if (line.startsWith('> 来源：')) return false
    if (line.startsWith('### 原始论证')) return true
    if (line.startsWith('## ')) return false
  }
  return false
}

/** 扫出一份文本里**全部**命令引用（逐行扫 ⇒ 行号准确）。 */
export function scanCommandRefs(file: string, text: string): CommandRef[] {
  const lines = text.split('\n')
  const refs: CommandRef[] = []
  lines.forEach((line, i) => {
    if (isVerbatimHistoryLine(lines, i)) return
    for (const m of line.matchAll(NPM_RUN)) {
      refs.push({ file, line: i + 1, kind: 'npm-run', target: m[1]! })
    }
    for (const m of line.matchAll(SCRIPT_PATH)) {
      refs.push({ file, line: i + 1, kind: 'script-path', target: m[1]! })
    }
  })
  return refs
}

/**
 * 判据本体：给定引用清单，返回**逐条**问题（空数组 = 没有悬空引用）。
 *
 * ⚠️ `fileExists` 与 `npmScripts` 是**参数** —— 反向自测要能拿假数据喂它，
 *   判据本体必须能被单独调用（R-51：反向自测不调判据本体 = 自检空转）。
 */
export function commandRefProblems(
  refs: CommandRef[],
  npmScripts: readonly string[],
  fileExists: (path: string) => boolean,
): string[] {
  const problems: string[] = []
  for (const ref of refs) {
    if (ref.kind === 'npm-run') {
      if (!npmScripts.includes(ref.target)) {
        problems.push(
          `${ref.file}：第 ${ref.line} 行引用了不存在的 npm 脚本 \`npm run ${ref.target}\` —— ` +
            '照着跑必然报「Missing script」',
        )
      }
      continue
    }
    if (!fileExists(ref.target)) {
      problems.push(
        `${ref.file}：第 ${ref.line} 行引用了不存在的脚本文件 \`${ref.target}\` —— 照着跑必然 ENOENT`,
      )
    }
  }
  return problems
}

/** 递归列出目录下的 `.md` 文件（仓库相对路径）。 */
function listMarkdown(dir: string): string[] {
  const out: string[] = []
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue
        walk(join(current, entry.name))
        continue
      }
      if (entry.name.endsWith('.md')) out.push(relative(root, join(current, entry.name)))
    }
  }
  walk(join(root, dir))
  return out
}

/** 被扫描的全部活文档（仓库相对路径）。 */
export function scannedFiles(): string[] {
  const fromDirs = SCAN_DIRS.flatMap((dir) => listMarkdown(dir))
  const fromFiles = SCAN_FILES.filter((file) => existsSync(join(root, file)))
  return [...fromDirs, ...fromFiles].sort()
}

interface PackageJson {
  scripts?: Record<string, string>
}

/** `package.json` 里定义的 npm 脚本名。 */
const npmScriptNames: string[] = Object.keys(
  (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as PackageJson).scripts ?? {},
)

/** 被扫描文件里**全部**命令引用。 */
const allRefs: CommandRef[] = scannedFiles().flatMap((file) =>
  scanCommandRefs(file, readFileSync(join(root, file), 'utf8')),
)

describe('G329 —— 文档里写的可执行命令必须真的能跑（DF-033）', () => {
  it('G329.1 活文档里没有悬空的命令引用', () => {
    const problems = commandRefProblems(
      allRefs,
      npmScriptNames,
      (path) => existsSync(join(root, path)),
    )

    expect(
      problems,
      `活文档里有悬空的命令引用（照着文档跑必然失败）：\n${problems.join('\n')}\n` +
        '—— 改门禁脚本时忘了回头改文档？删掉引用，或把命令改成真实存在的那一条。',
    ).toEqual([])

    // 非空自检：扫不到东西的判据恒绿（R-51 第 1 类）。
    expect(scannedFiles().length, '一个活文档都没扫到 —— 判据在空集上成立').toBeGreaterThan(10)
    expect(allRefs.length, '一条命令引用都没扫到 —— 判据在空集上成立').toBeGreaterThan(20)
  })

  it('G329.2 反向自测：判据真的会把悬空引用判成问题（判据本体真的被调用）', () => {
    const text = [
      '照着跑：`npm run build` 与 `npm run validate:content`。',
      '再跑 `bash scripts/check-doc-consistency.sh`。',
    ].join('\n')
    const refs = scanCommandRefs('probe.md', text)
    // 「存在的」那两条：`npm run build` 与 `scripts/validate-content.ts`。
    const problems = commandRefProblems(
      refs,
      ['build'],
      (path) => path === 'scripts/validate-content.ts',
    )

    expect(
      problems.length,
      `构造失效：悬空引用没被判出来（实得 ${problems.length} 条）：\n${problems.join('\n')}`,
    ).toBe(2)
    expect(problems[0]!, '第一条应当是那个不存在的 npm 脚本').toContain('npm run validate:content')
    expect(problems[1]!, '第二条应当是那个不存在的脚本文件').toContain('scripts/check-doc-consistency.sh')
  })

  it('G329.3 反向自测：占位符与历史引述不被当成命令（豁免是口径的一部分）', () => {
    // 形态说明里的占位符不是命令。
    const placeholders = [
      '判据形如 `npm run <name>` 与 `bash scripts/<file>.sh`。',
      '也形如 `npm run {a,b}` 与 `bash scripts/*.sh`。',
    ].join('\n')
    expect(
      scanCommandRefs('probe.md', placeholders),
      '构造失效：占位符形态被判成了真命令 —— 判据会把「规则文档写例子」误报成悬空引用',
    ).toEqual([])

    // 裸路径不是命令（历史引述里大量存在）。
    expect(
      scanCommandRefs('probe.md', '原来写的是 `scripts/gen-voice.ts`，现已改成 `scripts/generate-voice.ts`。'),
      '构造失效：裸路径被判成了命令 —— 逐条改它们等于伪造历史',
    ).toEqual([])

    // 「原始论证」区块里的引述豁免（位置式），区块之外不豁免。
    const inVerbatim = [
      '## DF-999',
      '',
      '### 原始论证',
      '',
      '- 逐字引述：`bash scripts/check-doc-consistency.sh` 曾经存在。',
      '',
      '> 来源：`## Deferred from: probe`',
    ].join('\n')
    expect(
      scanCommandRefs('probe.md', inVerbatim),
      '构造失效：「原始论证」区块里的引述没有被豁免 —— 改它就是篡改历史',
    ).toEqual([])

    const outsideVerbatim = [
      '## DF-999',
      '',
      '- 不是原始论证：`bash scripts/check-doc-consistency.sh` 仍然悬空。',
    ].join('\n')
    expect(
      scanCommandRefs('probe.md', outsideVerbatim).length,
      '构造失效：原始论证区块**之外**的悬空引用也被豁免了 —— 豁免范围漫到了别处',
    ).toBe(1)
  })
})
