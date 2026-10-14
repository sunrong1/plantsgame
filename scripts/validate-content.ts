/**
 * 内容校验（Story 1.6 / AC-10 ~ AC-14.1）。
 *
 * ── 守什么 ────────────────────────────────────────────────────────────────
 * 五类内容错误，逐条抓出且能定位到具体词条（AC-11）：
 *   1. 词图文件缺失或命名不符  ← 脚本侧（需要 fs）
 *   2. 塔绑定指向不存在的塔型  ← Zod
 *   3. 选项混入其他单元的词条  ← Zod
 *   4. 卡型与选项形态不符      ← Zod
 *   5. 卡面 TTS 文本为空        ← Zod
 * 外加：entryId 全局唯一、选项指向不存在的词条、同卡选项 id 重复。
 *
 * ── 为什么这么写（AC-14.1：纯逻辑与副作用分离）────────────────────────────
 * `validateContent()` 是纯函数：给它**已加载的单元数据**与注入的 `fileExists`，
 * 它返回 `{ ok, problems, stats }`。`console.*` / `process.exit` 只出现在 `main()`。
 *
 * 这不是洁癖，是可测性的前提：
 *   · 若校验逻辑埋在 CLI 里，测试只能 spawn 子进程断言退出码 ——
 *     而 Story 1.5 的 `[CR]` 抓到过「断言退出码抓不到差异」的假绿
 *     （`--only --dry` 首版用例退出码同样是 1，只是含义变成了「没匹配到任何词条」）。
 *   · 结构化结果才能断言「报的是哪一类错误、定位到哪个词条」。
 *
 * 词图根目录**参数化**（AC-14.1）：测试用临时目录喂假文件系统，
 * 纯函数里不许硬编码 `public/assets/words/`。
 *
 * ── 期望值来源与出处 ──────────────────────────────────────────────────────
 * · 五类错误：story AC-11 表格；FR16：`game-architecture.md:869`
 * · 日志级别与前缀：架构 `:605-617`（ERROR 级 + `[content]` 前缀）
 * · 词图路径规范：架构 `:370-377` + `docs/art-direction.md` 第 1 节
 * · 分层写法沿用 `scripts/generate-voice.ts`（Story 1.3 确立，67 条用例验证过）
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  ENTRY_ID_PATTERN,
  PROBLEM_CATEGORY,
  UnitSchema,
  type ProblemCategory,
} from '../src/content/schema'

// ── 常量 ────────────────────────────────────────────────────────────────────

/** 仓库根。相对本文件解析，不依赖 cwd —— `npm run` 的 cwd 是仓库根，但那只是当前如此。 */
const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url))

/** 单元文件目录。**新增单元放这里即可，脚本无需改动**（AC-12）。 */
const UNITS_DIR = join(PROJECT_ROOT, 'src/content/units')

/** 词图根目录。校验时以 `<root>/unit-NN/<entryId>.svg` 定位（AC-22）。 */
const WORD_IMAGE_ROOT = join(PROJECT_ROOT, 'public/assets/words')

/** 词图 URL 前缀。`imageSrc` 必须与它 + `unit-NN/` + `<entryId>.svg` 逐字一致。 */
const WORD_IMAGE_URL_PREFIX = '/assets/words'

/** 单元目录名：`unit-01`（两位补零）。与 `unit-01.json` 的文件名同构。 */
function unitDirName(unitNumber: number): string {
  return `unit-${String(unitNumber).padStart(2, '0')}`
}

/** 词条的规范 URL（AC-22：文件名 = 词条 id，路径含单元目录）。 */
export function expectedImageUrl(unitNumber: number, entryId: string): string {
  return `${WORD_IMAGE_URL_PREFIX}/${unitDirName(unitNumber)}/${entryId}.svg`
}

// ── 结果类型 ────────────────────────────────────────────────────────────────

/** 一条内容问题。**必须能定位** —— unitNumber / entryId / optionId 三者按需给出。 */
export interface ContentProblem {
  category: ProblemCategory
  unitNumber: number | null
  entryId: string | null
  optionId: string | null
  /** 人话描述，含「期望什么 / 实际是什么 / 会导致什么」。 */
  message: string
}

export interface ContentStats {
  unitCount: number
  entryCount: number
  cardCount: number
  /** 三型卡各多少（AC-14：统计是必须输出的一部分）。 */
  kindCounts: Record<'word' | 'keyword' | 'response', number>
}

export interface ValidationResult {
  ok: boolean
  problems: ContentProblem[]
  stats: ContentStats
}

/** 纯函数的外部依赖。注入而非内建，测试才能喂假文件系统。 */
export interface ValidateDeps {
  /** 词图根目录。测试指向临时目录。 */
  wordImageRoot: string
  fileExists: (path: string) => boolean
  /** 列出某单元目录下的文件名（用于「实际找到了什么」）。返回空数组 = 目录不存在。 */
  listFiles: (dir: string) => string[]
}

// ── 纯逻辑 ──────────────────────────────────────────────────────────────────

/** 从原始 JSON 里按下标取 entryId —— 报错定位用（Zod 的 path 是下标，不是 id）。 */
function entryIdAt(raw: unknown, index: number): string | null {
  if (raw === null || typeof raw !== 'object') return null
  const entries = (raw as { entries?: unknown }).entries
  if (!Array.isArray(entries)) return null
  const entry = entries[index]
  if (entry === null || typeof entry !== 'object') return null
  const entryId = (entry as { entryId?: unknown }).entryId
  return typeof entryId === 'string' ? entryId : null
}

/** 单元号（同样从原始 JSON 取，取不到就是 null）。 */
function unitNumberAt(raw: unknown): number | null {
  if (raw === null || typeof raw !== 'object') return null
  const unitNumber = (raw as { unitNumber?: unknown }).unitNumber
  return typeof unitNumber === 'number' ? unitNumber : null
}

/** 选项 id（path 形如 `['entries', 3, 'card', 'options', 1]`）。 */
function optionIdAt(raw: unknown, path: readonly PropertyKey[]): string | null {
  if (raw === null || typeof raw !== 'object') return null
  const optionIndex = path[4]
  const entryIndex = path[1]
  if (typeof optionIndex !== 'number' || typeof entryIndex !== 'number') return null
  const entries = (raw as { entries?: unknown }).entries
  if (!Array.isArray(entries)) return null
  const entry = entries[entryIndex]
  if (entry === null || typeof entry !== 'object') return null
  const options = (entry as { card?: { options?: unknown } }).card?.options
  if (!Array.isArray(options)) return null
  const option = options[optionIndex]
  if (option === null || typeof option !== 'object') return null
  const id = (option as { id?: unknown }).id
  return typeof id === 'string' ? id : null
}

/**
 * Zod 内建校验（枚举、类型、strictObject 多余字段）不带 `params.category`，
 * 按 path 兜底分类。⚠️ 这份映射是「按报错路径猜类别」的弱约定 ——
 * 它只影响输出的分类标签，不影响问题是否被报出来。
 */
function fallbackCategory(path: readonly PropertyKey[]): ProblemCategory {
  if (path.includes('towerType')) return PROBLEM_CATEGORY.towerType
  if (path.includes('entryId') || path.includes('id')) return PROBLEM_CATEGORY.entryIdFormat
  return PROBLEM_CATEGORY.schema
}

/**
 * 取自定义 issue 上的 `params.category`。
 *
 * ⚠️ 必须收窄而不是直接 `issue.params`：Zod 的 issue 是可辨识联合，
 *   只有自定义 issue（`code: 'custom'`）才带 `params`，而 `safeParse` 的返回类型
 *   是整个联合 —— 直接读会报 TS2339。走 `code` 判别也是为了不把
 *   「内建 issue 上偶然存在的字段」误当成自定义分类。
 */
function categoryOf(issue: { code: string; params?: unknown }): ProblemCategory | undefined {
  if (issue.code !== 'custom') return undefined
  const params = issue.params as { category?: ProblemCategory } | undefined
  return params?.category
}

/** 把一份单元原始数据变成问题列表。 */
function schemaProblems(raw: unknown): ContentProblem[] {
  const parsed = UnitSchema.safeParse(raw)
  if (parsed.success) return []

  const unitNumber = unitNumberAt(raw)
  return parsed.error.issues.map((issue) => {
    const entryIndex = issue.path[1]
    const category = categoryOf(issue) ?? fallbackCategory(issue.path)
    const path = issue.path.join('.')
    return {
      category,
      unitNumber,
      entryId: typeof entryIndex === 'number' ? entryIdAt(raw, entryIndex) : null,
      optionId: optionIdAt(raw, issue.path),
      message: `${path} → ${issue.message}`,
    }
  })
}

/** 宽松遍历：从**原始** JSON 里取出所有带 `imageSrc` 的选项（不要求 schema 通过）。 */
function imageOptionsOf(raw: unknown): { entryId: string | null; option: Record<string, unknown> }[] {
  if (raw === null || typeof raw !== 'object') return []
  const entries = (raw as { entries?: unknown }).entries
  if (!Array.isArray(entries)) return []
  const out: { entryId: string | null; option: Record<string, unknown> }[] = []
  for (const entry of entries) {
    if (entry === null || typeof entry !== 'object') continue
    const { entryId, card } = entry as { entryId?: unknown; card?: { options?: unknown } }
    const options = card?.options
    if (!Array.isArray(options)) continue
    for (const option of options) {
      if (option === null || typeof option !== 'object') continue
      const candidate = option as { imageSrc?: unknown; id?: unknown }
      if (typeof candidate.imageSrc !== 'string') continue
      out.push({
        entryId: typeof entryId === 'string' ? entryId : null,
        option: { ...(option as Record<string, unknown>), id: String(candidate.id ?? '') },
      })
    }
  }
  return out
}

/**
 * 逐个图片选项核对：URL 规范 + 文件存在（AC-11 第 1 类）。
 *
 * ⚠️ **读原始 JSON 而不是解析后的 Unit**：词图这一类错误与 schema 无关，
 * 若因为别的错导致整个单元没解析成功就跳过检查，录入者得改三轮才能看到「还缺三张图」。
 * 「一次列全」是这个脚本存在的理由，别在任何一条通路上把它退化成 first-error。
 *
 * 「只有单词卡需要词图」这条也由它自然满足：文字选项没有 `imageSrc` 字段。
 */
function wordImageProblems(raw: unknown, deps: ValidateDeps): ContentProblem[] {
  const problems: ContentProblem[] = []
  const unitNumber = unitNumberAt(raw)
  const referenced = new Set<string>()

  if (unitNumber === null) return problems

  for (const { entryId, option } of imageOptionsOf(raw)) {
    const optionId = option.id as string
    const imageSrc = option.imageSrc as string

    // ⚠️ [CR] 2026-10-14：这里的 `optionId` 来自**原始 JSON**，未经任何形态校验
    //   （schema 那条通路会守 `ENTRY_ID_PATTERN`，而这里走的是「即使 schema 没过
    //   也要把问题全报出来」的宽松遍历）。一个 `option.id: "../../etc/passwd"` 会：
    //     ① 被 `expectedImageUrl` 拼成一条看似规范、实则逃出根目录的 URL 打进报错；
    //     ② 被下面的 `join` 拼成词图根目录**之外**的文件系统路径去探测存在性。
    //   实际影响有限（内容文件是仓库内的信任数据，这里只做存在性探测），
    //   但「把未经校验的片段拼进路径，再把结果原样打进日志」这件事本身就该挡在门外。
    //
    //   所以这里**不**为形态不合法的 id 编造「规范路径应为 ……」——
    //   那条路径是用垃圾拼出来的，报出来只会误导。直说 id 不合法，让录入者去修 id。
    if (!ENTRY_ID_PATTERN.test(optionId)) {
      problems.push({
        category: PROBLEM_CATEGORY.wordImage,
        unitNumber,
        entryId,
        optionId,
        message:
          `选项 id ${JSON.stringify(optionId)} 不是合法的词条 id（应为「单元前缀 + kebab-case」，` +
          '如 u1-dog）—— 无法据此定位词图。请先把这个 id 改对，再看词图是否齐了',
      })
      continue
    }

    const expectedUrl = expectedImageUrl(unitNumber, optionId)
    referenced.add(`${optionId}.svg`)

    if (imageSrc !== expectedUrl) {
      problems.push({
        category: PROBLEM_CATEGORY.wordImage,
        unitNumber,
        entryId,
        optionId,
        message:
          `词图命名不符：选项 ${optionId} 的 imageSrc 是 ${imageSrc}，` +
          `规范路径应为 ${expectedUrl}（AC-22：文件名 = 词条 id，路径含单元目录）`,
      })
      // URL 写错时，磁盘上「正确名字的文件」可能仍然存在 —— 继续查存在性，
      // 免得只报一条命名错而漏掉真正缺的那张图。
    }

    const expectedPath = join(deps.wordImageRoot, unitDirName(unitNumber), `${optionId}.svg`)
    if (deps.fileExists(expectedPath)) continue
    const dir = join(deps.wordImageRoot, unitDirName(unitNumber))
    const found = deps.listFiles(dir).filter((name) => name.endsWith('.svg')).sort()
    problems.push({
      category: PROBLEM_CATEGORY.wordImage,
      unitNumber,
      entryId,
      optionId,
      message:
        `词图缺失：期望 ${expectedPath}，` +
        `该目录下实际找到：${found.length === 0 ? '（没有任何 .svg）' : found.join('、')}`,
    })
  }

  // 反向：目录里有、但没有任何词条引用的词图。它们多半是改过词条 id 之后忘了清理的残留 ——
  // 留着会让「词图齐了」的错觉持续下去，而校验报告却只说「都齐」。
  const dir = join(deps.wordImageRoot, unitDirName(unitNumber))
  for (const name of deps.listFiles(dir).filter((n) => n.endsWith('.svg')).sort()) {
    if (referenced.has(name)) continue
    problems.push({
      category: PROBLEM_CATEGORY.wordImage,
      unitNumber,
      entryId: null,
      optionId: null,
      message:
        `词图命名不符：${join(dir, name)} 没有任何词条引用 —— ` +
        '多半是改过 entryId 之后忘了清理的残留（AC-11 第 1 类）',
    })
  }

  return problems
}

/**
 * entryId 跨单元全局唯一（AC-8 的「全局」那半，单元内那半由 schema 守）。
 *
 * ⚠️ 同样读原始 JSON：跨单元重复是**多个文件之间**的关系，
 * 只要其中一个单元有别的错就跳过，恰恰是最容易漏掉的情形。
 */
function globalEntryIdProblems(units: readonly unknown[]): ContentProblem[] {
  const seen = new Map<string, number>()
  const problems: ContentProblem[] = []

  for (const raw of units) {
    const unitNumber = unitNumberAt(raw)
    if (unitNumber === null) continue
    const entries = (raw as { entries?: unknown }).entries
    if (!Array.isArray(entries)) continue
    for (const entry of entries) {
      if (entry === null || typeof entry !== 'object') continue
      const entryId = (entry as { entryId?: unknown }).entryId
      if (typeof entryId !== 'string') continue
      const owner = seen.get(entryId)
      if (owner !== undefined) {
        problems.push({
          category: PROBLEM_CATEGORY.duplicateEntryId,
          unitNumber,
          entryId,
          optionId: null,
          message:
            `词条 id 全局重复：${entryId} 同时出现在单元 ${owner} 与单元 ${unitNumber} —— ` +
            '录音目录不按单元分层，两单元同名会互相覆盖 mp3',
        })
        continue
      }
      seen.set(entryId, unitNumber)
    }
  }
  return problems
}

/**
 * 校验全部单元。
 *
 * ⚠️ **不 early return**：一次把全部问题列完是本脚本存在的理由。
 * 遇到第一个错就退出的话，录入者要改一轮跑一轮，而「跑过了 validate:content」
 * 这句话又会变成一次没有信息量的仪式。
 */
export function validateContent(
  units: readonly unknown[],
  deps: ValidateDeps,
): ValidationResult {
  const problems: ContentProblem[] = []
  const kindCounts: ContentStats['kindCounts'] = { word: 0, keyword: 0, response: 0 }
  let entryCount = 0

  for (const raw of units) {
    problems.push(...schemaProblems(raw))
    problems.push(...wordImageProblems(raw, deps))
    const parsed = UnitSchema.safeParse(raw)
    if (!parsed.success) continue
    entryCount += parsed.data.entries.length
    for (const entry of parsed.data.entries) {
      kindCounts[entry.card.kind] += 1
    }
  }

  problems.push(...globalEntryIdProblems(units))

  return {
    ok: problems.length === 0,
    problems,
    stats: {
      unitCount: units.length,
      entryCount,
      cardCount: entryCount,
      kindCounts,
    },
  }
}

/** 读取全部单元文件（AC-12：新增 `unit-NN.json` 无需改脚本）。 */
export function loadUnitFiles(unitsDir: string = UNITS_DIR): readonly { file: string; raw: unknown }[] {
  return readdirSync(unitsDir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((file) => {
      let raw: unknown
      try {
        raw = JSON.parse(readFileSync(join(unitsDir, file), 'utf8'))
      } catch (err) {
        // ⚠️ 这里**不要**再写 `[content] ` 前缀：`main()` 的 catch 会统一加
        //   `[content] ERROR `，两处都加的话终端上会看到
        //   `[content] ERROR [content] /path 不是合法 JSON：…`，像是两条错误。
        throw new Error(
          `${join(unitsDir, file)} 不是合法 JSON：` +
            `${err instanceof Error ? err.message : String(err)}`,
        )
      }
      return { file, raw }
    })
}

// ── 入口（顶层副作用集中在这里）─────────────────────────────────────────────

/**
 * 解析命令行参数。
 *
 * ⚠️ 导出供测试直接断言（`[CR]` 2026-10-14）：原先它是模块私有的，
 *   唯一的调用方 `main()` 在测试里一律传 `[]` 或一个坏的 `load`，
 *   于是「词图根目录可以被 `--word-image-root` 改掉」这条能力**零覆盖** ——
 *   参数名打错一个字母、忘了 `i += 1`、把下一个参数当成目录名，全都不会红。
 *   这是词图尚未录入（Epic 2）期间唯一的词图目录入口，它坏掉时没有任何症状，
 *   直到那时才一次性爆发。
 */
export function parseCli(argv: readonly string[]): { wordImageRoot: string } {
  const cli = { wordImageRoot: WORD_IMAGE_ROOT }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--word-image-root') {
      const value = argv[i + 1]
      if (value === undefined || value.trim() === '' || value.startsWith('--')) {
        throw new Error('[content] --word-image-root 需要一个目录参数')
      }
      cli.wordImageRoot = value
      i += 1
      continue
    }
    throw new Error(`[content] 未知参数：${arg}（支持 --word-image-root <目录>）`)
  }
  return cli
}

/** 报错行。**逐条独立可读**，绝不把多条问题压成一行（AC-13）。导出供测试断言格式。 */
export function formatProblem(problem: ContentProblem): string {
  const where =
    problem.entryId === null
      ? `单元 ${problem.unitNumber ?? '?'}`
      : `单元 ${problem.unitNumber ?? '?'} 词条 ${problem.entryId}`
  return `[content] ERROR [${problem.category}] ${where}${problem.optionId === null ? '' : ` 选项 ${problem.optionId}`} —— ${problem.message}`
}

/**
 * `main` 的外部依赖。默认全部走真实 fs；测试注入假单元数据与假词图目录，
 * 于是「五类错误逐类注入」可以断言**退出码**而不必 spawn 子进程。
 *
 * 与 `scripts/generate-voice.ts` 的 `main(argv, env)` 同一手法（Story 1.3 确立）：
 * 入口返回退出码、副作用可注入，于是 CLI 逻辑也是可测的。
 */
export interface MainDeps {
  /** 单元数据源。默认读 `UNITS_DIR` 下的全部 JSON。 */
  load?: (unitsDir: string) => readonly { file: string; raw: unknown }[]
  /** 词图根目录，覆盖 CLI 参数。 */
  wordImageRoot?: string
  fileExists?: (path: string) => boolean
  listFiles?: (dir: string) => string[]
}

/**
 * CLI 入口。**返回退出码而不自己 `process.exit`** ——
 * 收口在文件末尾，这样 `main` 可被测试直接调用。
 */
export function main(
  argv: readonly string[] = process.argv.slice(2),
  deps: MainDeps = {},
): number {
  let cli: { wordImageRoot: string }
  try {
    cli = parseCli(argv)
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    return 1
  }

  let units: readonly { file: string; raw: unknown }[]
  try {
    units = (deps.load ?? loadUnitFiles)(UNITS_DIR)
  } catch (err) {
    console.error(`[content] ERROR ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }

  if (units.length === 0) {
    console.error(`[content] ERROR ${UNITS_DIR} 下没有任何单元 JSON —— 内容不存在，等于没有内容`)
    return 1
  }

  const fileExists = deps.fileExists ?? existsSync
  const result = validateContent(
    units.map((u) => u.raw),
    {
      wordImageRoot: deps.wordImageRoot ?? cli.wordImageRoot,
      fileExists,
      listFiles: deps.listFiles ?? ((dir: string) => (fileExists(dir) ? readdirSync(dir) : [])),
    },
  )

  if (!result.ok) {
    for (const problem of result.problems) {
      console.error(formatProblem(problem))
    }
    console.error(
      `[content] 校验失败：${result.problems.length} 处问题（单元 ${result.stats.unitCount} 个 / ` +
        `词条 ${result.stats.entryCount} 条）。修复后重跑 —— 「跑过了 validate:content」` +
        '只有退出码 0 才算证据。',
    )
    return 1
  }

  const { kindCounts } = result.stats
  console.log(
    `[content] 校验通过：${result.stats.unitCount} 个单元 / ${result.stats.entryCount} 条词条 / ` +
      `${result.stats.cardCount} 张卡（单词 ${kindCounts.word}、关键词 ${kindCounts.keyword}、` +
      `回应 ${kindCounts.response}）`,
  )
  console.log(
    `[content] 词图目录：${deps.wordImageRoot ?? cli.wordImageRoot} —— 全部被引用的词图均存在且命名合规`,
  )
  return 0
}

/** 只在被直接执行时才跑 `main()` —— 测试要 import 本模块的纯函数。 */
if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exit(main())
}
