/**
 * 内容校验（Story 1.6 / AC-10 ~ AC-14.1；Story 1.7 追加 AC-14.1/AC-14.2 两类资产检查）。
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
 * **Story 1.7 追加两类：**
 *   6. 塔/僵尸 SVG 缺失**或多余**（AC-14.1）—— 「多余」那一侧是 FR70 的唯一可判定形式
 *   7. SVG 几何规格：`viewBox` / 输出尺寸 / 透明底（AC-14.2）—— 塔、僵尸、**以及 30 张词图**
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
 * 词图根目录与资产根目录**均参数化**（AC-14.1）：测试用临时目录喂假文件系统，
 * 纯函数里不许硬编码 `public/assets/words/`。
 *
 * ⚠️ **`deps` 的新字段一律必填，没有默认值** —— 新字段若可选，
 *   某个测试忘传就会得到「资产检查整段没跑」的全绿，而那份绿什么都没证明。
 *   这正是 `docs/art-direction.md:12-27` 登记的那类假绿的另一种形态。
 *
 * ── 期望值来源与出处 ──────────────────────────────────────────────────────
 * · 五类错误：story AC-11 表格；FR16：`game-architecture.md:869`
 * · 日志级别与前缀：架构 `:605-617`（ERROR 级 + `[content]` 前缀）
 * · 词图路径规范：架构 `:370-377` + `docs/art-direction.md` 第 1 节
 * · SVG 几何规格：Story 1.7 AC-3 / `docs/art-direction.md` 第 1 节
 * · 塔/僵尸路径规范：架构 `:755-757` + Story 1.7 AC-1/AC-2
 * · 分层写法沿用 `scripts/generate-voice.ts`（Story 1.3 确立，67 条用例验证过）
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  CardKindSchema,
  ENTRY_ID_PATTERN,
  PROBLEM_CATEGORY,
  UnitSchema,
  type ProblemCategory,
} from '../src/content/schema'
import { targetOptionCount } from '../src/content/option-count'
// ⚠️ 份额的**唯一**出处是内容层那条规则（`src/content/distribution.ts`）——
//   脚本**不重算**、**不抄**一份（那会是 R-37 的复制链：改规则只改一处、另一处静默过期）。
//   Story 2.2 的裁决 3 明确**不加**「实际分布 vs 规则目标」的硬校验；
//   本脚本只**打印**余量（DF-118 的恢复条件要的正是「录入时就看得见余量」）。
import { targetCardDistribution } from '../src/content/distribution'
// ⚠️ 脚本 import `src/core/` 是**允许且已实测可行**的（`tsconfig.test.json` 文件头实测记录：
//   注入 `const x: number = "s"` 会立刻报 TS2322，既证明被 typecheck 覆盖也证明 import core/
//   没有把它挤出检查范围）。`scripts/balance-sim.ts:49` 就是这个形态。
//   ⚠️ 这与 `src/content/schema.ts` 里**必须**用字面量重复的情形恰好相反 ——
//   内容校验不能依赖战斗层模块加载成功，但**校验脚本**本来就与它同处一个校验世界。
//   走 barrel、带 `.js` 后缀（项目无 `@/` 别名，`verbatimModuleSyntax` 下既定形态）。
import { TOWER_TYPES } from '../src/core/index.js'

// ── 常量 ────────────────────────────────────────────────────────────────────

/** 仓库根。相对本文件解析，不依赖 cwd —— `npm run` 的 cwd 是仓库根，但那只是当前如此。 */
const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url))

/** 单元文件目录。**新增单元放这里即可，脚本无需改动**（AC-12）。 */
const UNITS_DIR = join(PROJECT_ROOT, 'src/content/units')

/** 词图根目录。校验时以 `<root>/unit-NN/<entryId>.svg` 定位（AC-22）。 */
const WORD_IMAGE_ROOT = join(PROJECT_ROOT, 'public/assets/words')

/** 词图 URL 前缀。`imageSrc` 必须与它 + `unit-NN/` + `<entryId>.svg` 逐字一致。 */
const WORD_IMAGE_URL_PREFIX = '/assets/words'

/** 塔/僵尸/词图的共同根目录（Story 1.7 / AC-14.1）。 */
const ASSET_ROOT = join(PROJECT_ROOT, 'public/assets')

/** 塔图与僵尸图的子目录名（架构 `:755-757` 的目录树字面）。 */
export const TOWER_ASSET_DIR = 'towers'
export const ZOMBIE_ASSET_DIR = 'zombies'

/**
 * 僵尸资产文件名（Story 1.7 / AC-2）。
 *
 * ⚠️ 规划文档从未定义过「僵尸 id」—— 架构只写了 `zombies/<僵尸id>.svg`。
 *   本 story 裁决取 `zombie`：它是**通用敌人**（FR71「一套通用敌人，一次只出现一个」），
 *   文件名里不该出现任何暗示它会分化的词。
 *   将来若要第二种僵尸，改为 `zombie-<type>.svg` 并同步改 `expectedZombieAssetNames()`。
 */
export const ZOMBIE_ASSET_NAME = 'zombie.svg'

/**
 * ⚠️ **塔 / 僵尸的 URL 常量已迁走（Story 1.10 / AC-4 / 裁决 3）。**
 *
 * 原文这里是 `TOWER_ASSET_URL_PREFIX` / `ZOMBIE_ASSET_URL` / `expectedTowerAssetUrl()`
 * 三个**导出**，注释写着「Story 1.10 拼 `<img src>` 时照此拼」，硬编码根路径
 * `/assets/...` 而 `vite.config.ts:12` 的 base 是 `/plantsgame/` ⇒ 照抄即部署后全 404。
 * 现已迁到 **`src/services/asset-url.ts`**（接 `import.meta.env.BASE_URL`），
 * 那里是唯一出处；`Tower.vue` / `Zombie.vue` 从它取 URL。
 *
 * **[DS] 2026-10-15 的偏离（如实登记）**：AC-4 原文要求本文件「改为 import 它」，
 * 实测**做不到** —— `tsx` 下 `import.meta.env` 是 `undefined`，读 `.BASE_URL` 直接抛
 * `TypeError: Cannot read properties of undefined`，而本文件跑在 `pretest` / `prebuild`
 * 的 `tsx` 里，import 即崩。经用户裁决改为：**删除死实现，不 import**。
 * 依据是这三个导出**全仓零调用**（`grep` 确认），删掉不损失任何行为；
 * base 的守卫由 `tests/assets/asset-url-guard.test.ts` 的 **G16** 承担
 * （vitest 侧有 `vitest.config.ts` 的 `test.env.BASE_URL`，那里 import 得到）。
 *
 * ⇒ **本文件不 import `src/services/`，是实测结论而不是遗漏**，别「顺手修复」。
 */

/** 塔图应有的文件名集合。**由 `TOWER_TYPES` 推出**，不在此处硬编码三个字符串。 */
export function expectedTowerAssetNames(): readonly string[] {
  return TOWER_TYPES.map((t) => `${t}.svg`)
}

/** 僵尸图应有的文件名集合。 */
export function expectedZombieAssetNames(): readonly string[] {
  return [ZOMBIE_ASSET_NAME]
}

/** SVG 画布边长（Story 1.7 / AC-3；`docs/art-direction.md` 第 1 节，两类资产共用）。 */
export const SVG_EDGE = 512

/** SVG 规范 `viewBox`（AC-3）。⚠️ 数值来自 Story 1.6 对架构「统一数值」的定稿，不是本 story 自选。 */
export const SVG_VIEW_BOX = `0 0 ${SVG_EDGE} ${SVG_EDGE}`

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
  /**
   * **逐单元**的卡型配比与逐族余量（DF-118 的恢复条件：录入时就看得见余量）。
   *
   * ⚠️ **只是统计，不是判据** —— Story 2.2 的裁决 3 明确**不加**
   *   「实际分布 vs 规则目标」的硬校验；越界由 `tests/content/unit-0N.test.ts`
   *   的守卫（§5.1.1 的两条判据）负责。脚本这一侧只负责**让人看见**。
   */
  unitDistributions: readonly UnitDistribution[]
  /**
   * **规则未覆盖**的单元号（`targetCardDistribution` 对它们不外推）。
   *
   * ⚠️ **为什么要有这一栏**：它们**不在** `unitDistributions` 里
   *   ⇒ 光看配比输出会以为「每个单元都查过了」⇒
   *   这一栏让 `main()` **逐个点名**，输出里就不会有「悄悄少查一个单元」这回事。
   */
  unitsWithoutRule: readonly number[]
}

/** 一个单元的卡型配比统计。 */
export interface UnitDistribution {
  /** 单元号。 */
  unitNumber: number
  /** 本单元的词条数 N。 */
  entryCount: number
  /** 三型卡各多少（`c_k`）。 */
  kindCounts: Record<'word' | 'keyword' | 'response', number>
  /** 规则给的目标份额（`s_k`，来自内容层那条规则）。 */
  targetShares: Record<'word' | 'keyword' | 'response', number>
  /** 逐族误差 `|c_k − s_k × N|`（§5.1.1 的第二条判据；**四舍五入到最近整数**的残差）。 */
  familyErrors: Record<'word' | 'keyword' | 'response', number>
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
  /** 塔/僵尸/词图的共同根目录（Story 1.7 / AC-14.1）。测试指向临时目录。 */
  assetRoot: string
  fileExists: (path: string) => boolean
  /** 读文件内容。**返回 `null` = 读不到**，此时几何检查会显式报错而不是静默跳过。 */
  readFile: (path: string) => string | null
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
    if (deps.fileExists(expectedPath)) {
      // 🎯 Story 1.7 / AC-14.2：**存在不等于合规**。
      //   这一段此前整段缺失，而 `docs/art-direction.md:12-27` 已把它如实登记成
      //   「无人守着的规格」——把某张占位图的 viewBox 改成 `0 0 100 100`
      //   或贴进一块不透明底，validate:content 仍 exit 0、全部测试仍全绿。
      problems.push(...readGeometryProblems(expectedPath, deps, { unitNumber, entryId, optionId }))
      continue
    }
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

// ── 选项数与选项近邻（Story 2.4 / AC-B3、AC-B4、AC-C3）──────────────────────

/**
 * 三个卡型（从 schema 的枚举推，**不另写一份字面量**）。
 *
 * ⚠️ 与 `tests/content/content-boundary.test.ts` 同一手法：读 zod 枚举的元信息。
 * 若哪天 zod 升级改了枚举的内部形状，本行会读到空数组 ⇒ 下面每张卡都被跳过 ⇒
 * 「选项数检查整段没跑」的全绿 —— 所以这里**不静默降级**：读不到就抛错。
 */
const CARD_KINDS: readonly string[] = (() => {
  const def = CardKindSchema.def as { entries?: Record<string, string> }
  const keys = Object.keys(def.entries ?? {})
  if (keys.length === 0) {
    throw new Error('CardKindSchema 不再是枚举 —— 卡型白名单的形状变了，本脚本需要重写')
  }
  return keys
})()

/**
 * 「只差几个字」的最大编辑距离（Story 2.4 / 裁决 7）。
 *
 * ⚠️ 这是**产品裁决**：取 2 是因为「只差一两个字」正是 6 岁半**逐字辨认**才能分辨的
 * 量级（`pen` / `pet`、`cat` / `car`）。
 *
 * ⚠️ **换源后阈值不再被数据卡住 —— 数据反而更宽松**（2026-10-27 实测）：
 *   单元 1+2 的卡内最小编辑距离实测 = **5**（单元 2 的关键词卡
 *   `u2-s-give-me-a-ruler-please`：`ruler` ~ `book`；单元 1 是 **7**，
 *   `u1-s-good-morning`：`morning` ~ `afternoon`）⇒ 阈值取 3 **不会**误杀
 *   「语义上完全可分的合格干扰项」（旧内容的 `ball` ~ `book` 距离确实是 3，
 *   但那一对已随换源退役）。
 * ⇒ 取 1 则放过「差两个字」的一族（6 岁半尚能逐字辨认的量级）⇒ **阈值是 2**。
 * ⇒ 改这个数字要同步改 `docs/option-count.md`（其 §4.1 逐字记着上面两个实测值），
 *   并重跑 G268 与 T6.6 的反向自测。
 */
export const NEAR_DUPLICATE_MAX_DISTANCE = 2

/**
 * 归一化一个选项文本：Unicode 规范化 → 小写 → 去标点 → 压空白。
 *
 * ⚠️ **去标点必须做**：`Good morning!` 与 `Good morning.` 归一化后只差一个字符，
 * 而不归一化时它们是两个「不同的文本」⇒ 编辑距离算出来是 4（长度差），
 * 阈值 2 抓不到 —— 而孩子看到的是两个**看起来一样**的按钮。
 *
 * ⚠️ **Unicode 规范化（NFKC）必须做**（`[CR]` 2026-10-23 修）：
 *   · **组合重音**：NFD 写法的 `cafe` + U+0301 在去标点那一步会被整段替换成空格
 *     （U+0301 不属 `\p{L}`）⇒ 归一化成 `cafe`，与 NFC 写法的 `café` 距离 1
 *     ⇒ **同一个词的两种编码被判成「只差一个字」**（假阳性）。
 *   · **全角**：`Ｃａｔ` 与 `Cat` 距离 3 ⇒ 阈值 2 抓不到（假阴性）。
 *   ⇒ NFKC 一次解决两者（组合重音合成、全角折半角）。
 */
export function normalizeOptionText(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 码点数（不是 UTF-16 码元数）—— 与 `editDistance` 同一口径。 */
function codePointLength(text: string): number {
  return Array.from(text).length
}

/**
 * 字符级编辑距离（Levenshtein）。
 *
 * ⚠️ 它是**字符级代理量**，判不了语义：两个语义上很近但字面差很多的选项
 * （例如 `I am fine, thank you.` 与 `Thank you!`）**不会**被它抓出来 ——
 * 那属「生僻词 / 语义可辨性」的人工项（AC-B4 如实登记为人工项）。
 *
 * ⚠️ **按码点算，不按 UTF-16 码元算**（`[CR]` 2026-10-23 修）：
 *   `a.length` / `a[i - 1]` 数的是**码元** ⇒ 一个 emoji（代理对）被算成两个字符
 *   ⇒ 距离凭空翻倍（实测 `😀😀😀` ~ `😀😀` = 2，而码点数只有 1）。
 *   ⇒ 这里先把字符串拆成**码点数组**再算。
 */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0
  const ac = Array.from(a)
  const bc = Array.from(b)
  if (ac.length === 0) return bc.length
  if (bc.length === 0) return ac.length
  let prev = Array.from({ length: bc.length + 1 }, (_, i) => i)
  for (let i = 1; i <= ac.length; i += 1) {
    const cur = [i]
    for (let j = 1; j <= bc.length; j += 1) {
      const cost = ac[i - 1] === bc[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
    }
    prev = cur
  }
  return prev[bc.length]
}

/** 宽松遍历：从**原始** JSON 里取出每张卡（entryId / kind / options）。 */
function cardsOf(
  raw: unknown,
): { entryId: string | null; kind: string | null; options: unknown[] }[] {
  if (raw === null || typeof raw !== 'object') return []
  const entries = (raw as { entries?: unknown }).entries
  if (!Array.isArray(entries)) return []
  const out: { entryId: string | null; kind: string | null; options: unknown[] }[] = []
  for (const entry of entries) {
    if (entry === null || typeof entry !== 'object') continue
    const { entryId, card } = entry as { entryId?: unknown; card?: { kind?: unknown; options?: unknown } }
    out.push({
      entryId: typeof entryId === 'string' ? entryId : null,
      kind: typeof card?.kind === 'string' ? card.kind : null,
      options: Array.isArray(card?.options) ? (card.options as unknown[]) : [],
    })
  }
  return out
}

/**
 * 检查一：每张卡的选项数必须**等于**规则给该（单元号、卡型）的目标值（AC-B3 / AC-C3）。
 *
 * ⚠️ **规则抛错时转成一条能定位的问题，而不是让脚本崩掉**（AC-13 逐条独立成行）：
 *   `loadUnitFiles` 扫的是**目录** ⇒ 将来 `unit-21.json` 一出现就会走到这里，
 *   而规则只覆盖 1–20 ⇒ 那时必须报「规则不覆盖单元 21」，不能抛栈。
 *   ⇒ 规则不覆盖时**整个单元只报一条**（不是每张卡一条）—— 37 张卡报 37 遍
 *   同一条原因是噪声，而噪声会被当成噪声忽略掉。
 */
function optionCountProblems(raw: unknown): ContentProblem[] {
  const problems: ContentProblem[] = []
  const unitNumber = unitNumberAt(raw)
  if (unitNumber === null) {
    // ⚠️ **不能静默跳过这一维**（`[CR]` 2026-10-23 修）：
    //   原来这里直接 `return []` ⇒ 单元号缺失 / 不是数字时，**选项数从头到尾没被核对过**，
    //   而报告里只有 schema 的一条类型错 ⇒ 读报告的人会误以为「选项数这一维没问题」。
    //   近邻判据不依赖单元号、仍在跑 ⇒ 「两个维度里有一个被静默跳过」这个形态尤其容易误读。
    //   ⇒ 报一条能定位的问题：这个单元的选项数**没查**。
    if (raw !== null && typeof raw === 'object' && Array.isArray((raw as { entries?: unknown }).entries)) {
      problems.push({
        category: PROBLEM_CATEGORY.optionCount,
        unitNumber: null,
        entryId: null,
        optionId: null,
        message:
          '单元号缺失或不是数字 ⇒ 本单元的选项数**无法核对**（这一维没跑）—— ' +
          '请先把 unitNumber 写成 1..24 的整数，再让选项数规则核对它',
      })
    }
    return problems
  }

  const expected = new Map<string, number>()
  for (const kind of CARD_KINDS) {
    try {
      expected.set(kind, targetOptionCount(unitNumber, kind as Parameters<typeof targetOptionCount>[1]))
    } catch (err) {
      // ⚠️ **两种失败原因必须分开说**（`[CR]` 2026-10-23 修）：
      //   ① 规则**不覆盖这个单元**（单元号在 1..24 之外）⇒ 该去扩规则的覆盖范围；
      //   ② 规则覆盖了这个单元，但**档位表里没有这个卡型** ⇒ 该去补档位表的 `counts` 键。
      //   原来两种都写成「规则不覆盖单元 N」⇒ ② 会把作者引到错的地方（去改 LAST_UNIT）。
      const message = err instanceof Error ? err.message : String(err)
      const tierMissesKind = message.includes('没有卡型')
      const notAnInteger = message.includes('必须是整数')
      problems.push({
        category: PROBLEM_CATEGORY.optionCount,
        unitNumber,
        entryId: null,
        optionId: null,
        message: tierMissesKind
          ? `选项数规则的档位表缺少卡型 ${kind}：${message} —— ` +
              '本单元的选项数无法核对，请先补档位表的 counts 键（src/content/option-count.ts）'
          : notAnInteger
            ? `单元号不是整数（${unitNumber}）：${message} —— ` +
                '本单元的选项数无法核对，请先把 unitNumber 写成整数'
            : `选项数规则不覆盖单元 ${unitNumber}：${message} —— ` +
                '本单元的选项数无法核对，请先扩展规则（src/content/option-count.ts）再录入内容',
      })
      return problems
    }
  }

  for (const card of cardsOf(raw)) {
    // 卡型非法时**跳过**：那一条由 schema 的 `kindOptionMismatch` / `schema` 类别负责，
    // 这里再报一遍就是同一件事说两遍（R-02：一份判定只有一个来源）。
    if (card.kind === null || !expected.has(card.kind)) continue
    const want = expected.get(card.kind) as number
    if (card.options.length === want) continue
    problems.push({
      category: PROBLEM_CATEGORY.optionCount,
      unitNumber,
      entryId: card.entryId,
      optionId: null,
      message:
        `选项数不符：单元 ${unitNumber} 的 ${card.entryId}（${card.kind} 卡）` +
        `期望 ${want} 个选项，实际 ${card.options.length} 个 —— ` +
        '选项数由 src/content/option-count.ts 的档位表决定，改内容要同步改规则（或反之）',
    })
  }
  return problems
}

/**
 * 检查二：同一张卡的**两个文字选项**只差几个字 ⇒ 报 `option-near-duplicate`（AC-B4）。
 *
 * ⚠️ **只管文字选项**：单词卡的选项是**图片**，没有文字可算距离。
 *   图片选项的「视角是否一致」是 `docs/art-direction.md` §5.4 的**目视**台账，
 *   机器判不了 —— 这里**不假装自己能判**（AC-B4 的另一半如实登记为人工项）。
 *
 * ⚠️ 互为前缀的那一对**在数学上已被编辑距离覆盖**（前缀关系的编辑距离恰好等于
 *   长度差）⇒ 那半个条件是**冗余**的；这里仍按 AC 的原文写出来，是为了让
 *   「AC 写的那一条在代码里有一行对应」可核对，而不是靠读者自己推。
 *
 * ⚠️ **完全相同的两个选项不归本判据管**（`[CR]` 2026-10-23 修）：
 *   schema 的 `duplicateOptionText` 已经报「显示文本都是 X」（键 = `trim().toLowerCase()`）。
 *   本判据对同一对也会命中（编辑距离 0 ≤ 阈值）⇒ **一个违规报两条**，
 *   且两条类别不同 ⇒ 录入者会以为是两个错。R-02：一份判定只有一个来源。
 *   ⇒ 这里显式跳过「schema 那一对已经报过」的组合。
 *   ⚠️ **注意别跳过太多**：schema 的键**不**去标点 ⇒ `Good morning!` 与 `Good morning.`
 *   在 schema 眼里是两个不同的文本（不报），但归一化后完全相同（孩子看到两个一样的按钮）
 *   ⇒ **这一对必须由本判据报出来**。所以跳过条件要**逐字复刻 schema 的键**，
 *   不能用归一化后的文本。
 *
 * ⚠️ **归一化后为空串的选项不能跳过**（`[CR]` 2026-10-23 修）：
 *   纯标点的选项（`"!!!"` / `"???"`）归一化后是空串 ⇒ 原来那句 `continue` 把它们
 *   **主动放过** ⇒ 两个「什么都没有」的按钮零条报错，孩子眼里就是两个一样的按钮。
 *   （schema 的 `blankOptionField` 只挡**纯空白**，`"!!!"` 是合法文本。）
 *   ⇒ 空串照样参与比较：两个空串的编辑距离 = 0 ⇒ 会被报出来。
 */
export function optionNearDuplicateProblems(
  raw: unknown,
  maxDistance: number = NEAR_DUPLICATE_MAX_DISTANCE,
): ContentProblem[] {
  const problems: ContentProblem[] = []
  const unitNumber = unitNumberAt(raw)

  for (const card of cardsOf(raw)) {
    const texts: { id: string; text: string }[] = []
    for (const option of card.options) {
      if (option === null || typeof option !== 'object') continue
      const candidate = option as { id?: unknown; text?: unknown }
      if (typeof candidate.text !== 'string') continue
      texts.push({ id: typeof candidate.id === 'string' ? candidate.id : '', text: candidate.text })
    }

    for (let i = 0; i < texts.length; i += 1) {
      for (let j = i + 1; j < texts.length; j += 1) {
        // ⚠️ schema 的 `duplicateOptionText` 已经报过的那一对 ⇒ 跳过（R-02：一份判定一个来源）。
        //   键**逐字复刻 schema 的算法**（`trim().toLowerCase()`，不去标点）。
        if (texts[i].text.trim().toLowerCase() === texts[j].text.trim().toLowerCase()) continue

        const a = normalizeOptionText(texts[i].text)
        const b = normalizeOptionText(texts[j].text)
        // ⚠️ 长度差超过阈值 ⇒ 编辑距离必然超过阈值 ⇒ 不必再算（**结果完全等价**，
        //   只是省掉 O(n·m) 的动态规划；选项文本是单词与短语，实测每对都在亚毫秒级）。
        //   ⚠️ 长度必须**按码点**算（与 `editDistance` 同一口径）—— 用 UTF-16 码元长度
        //   会把 emoji 算成两个字符 ⇒ 跳过的组合比该跳的多（结果与纯 `editDistance` 不等价）。
        if (Math.abs(codePointLength(a) - codePointLength(b)) > maxDistance) continue
        const distance = editDistance(a, b)
        // ⚠️ 长度差也**按码点**算 —— 与上面那条预筛、与 `editDistance` 同一口径。
        //   （原来这里用 `a.length`（UTF-16 码元）⇒ 与同一函数里的码点口径不一致。）
        const isPrefixPair =
          (a.startsWith(b) || b.startsWith(a)) &&
          Math.abs(codePointLength(a) - codePointLength(b)) <= maxDistance
        if (distance > maxDistance && !isPrefixPair) continue
        problems.push({
          category: PROBLEM_CATEGORY.optionNearDuplicate,
          unitNumber,
          entryId: card.entryId,
          optionId: texts[j].id,
          message:
            `卡内两个选项只差几个字：「${texts[i].text}」与「${texts[j].text}」` +
            `（归一化后编辑距离 ${distance}，阈值 ${maxDistance}）—— ` +
            '孩子要逐字辨认才能分辨这两个按钮',
        })
      }
    }
  }
  return problems
}

// ── SVG 几何规格（Story 1.7 / AC-14.2、AC-15）────────────────────────────────

/**
 * 🔥 剥掉 XML 注释 —— **任何 SVG 正则匹配的前置条件，不是可选优化**。
 *
 * 现有占位图 `public/assets/words/unit-01/u1-dog.svg` 的文件头注释里**逐字写着**
 * 「规格（docs/art-direction.md 第 1 节）：SVG / viewBox 0 0 512 512 / 512×512 / 透明底」。
 * ⇒ 不剥注释就匹配 `viewBox`，**所有守卫在所有文件上恒绿**。
 *   那不是「守卫不严」，是**守卫恒等于真** —— 比没有守卫更坏，
 *   因为它会让下一个人以为这条规格有人守着。
 *
 * 换成空格而不是空串：注释紧贴属性时（`viewBox="..."<!-- x -->width="512"`）
 * 空串会把两侧粘成一个 token。
 */
export function stripXmlComments(source: string): string {
  return source.replace(/<!--[\s\S]*?-->/g, ' ')
}

/**
 * 剥掉**不渲染**的容器块。
 *
 * `<defs>` / `<mask>` / `<clipPath>` / `<pattern>` / `<symbol>` 里的 `<rect>`
 * 不会被画出来。带着它们扫「有没有不透明背景矩形」会把一张合规的图判成不合规 ——
 * 而一个会误报的守卫比没有守卫更糟：它会被当成噪声忽略掉。
 */
export function stripNonRenderedBlocks(source: string): string {
  return source
    // ⚠️ 自闭合形态 `<defs/>` / `<symbol …/>` 也要剥。
    //   `[CR]` 2026-10-14：这条正则原本只认「成对」标签，而本函数已从私有提升为 `export`，
    //   并成为 `tests/assets/asset-geometry.test.ts` 的 `allTags()` 地基 ——
    //   即它现在是**内容完整性守卫**的一部分，对它自己提出的完备性要求更高了。
    .replace(/<(defs|mask|clipPath|pattern|symbol)\b[^>]*\/>/gi, ' ')
    .replace(/<(defs|mask|clipPath|pattern|symbol)\b[^>]*>[\s\S]*?<\/\s*\1\s*>/gi, ' ')
}

/**
 * 取 `<svg …>` 开标签的整段文本（属性都在里面）。
 *
 * ⚠️ `[DS]` Story 1.8 / P2-4：**必须引号感知，不能用 `[^>]*`。**
 *   属性值里出现 `>` 就会把开标签**截断** —— 而 `aria-label` / `id` 正是高发区：
 *   `aria-label="a > b"` 会被截成 `<svg … aria-label="a >`，
 *   后面真正的 `>` 落在截断之外，于是 `viewBox` / `width` / `height` 全部读成 `null`，
 *   报出一句**指向错误文件**的「读不到 viewBox」。
 *
 *   旧正则之所以没在 Story 1.7 炸出来：四张塔/僵尸图的 `aria-label` 里都没有 `>`。
 *   词图（30 张，带 entryId 与中文 aria-label）把这个缺口补齐了。
 *
 * 扫描规则：进到引号里就一路走到配对的引号，引号外的 `>` 才是标签结束。
 */
function svgRootTag(source: string): string | null {
  const start = /<svg\b/i.exec(source)
  if (start === null) return null

  let quote: '"' | "'" | null = null
  for (let i = start.index + '<svg'.length; i < source.length; i += 1) {
    const ch = source[i]
    if (quote !== null) {
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (ch === '>') return source.slice(start.index, i + 1)
  }
  return null
}

/**
 * 取开标签上的某个属性值。
 *
 * ⚠️ **必须用 `(?:^|\s)` 而不是 `\b` 前缀。** `\bwidth` 会命中 `stroke-width` ——
 *   `-` 与 `w` 之间存在词边界，于是「线宽 16」会被当成「输出宽度 16」，
 *   `width` 断言于是读到 16 而不是 512。属性之间以空白分隔，前缀锚到空白才准确。
 */
function attrOf(tag: string, name: string): string | null {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag)
  const value = m?.[1] ?? m?.[2]
  return value === undefined ? null : value.trim()
}

/** 属性值的数值形式。`"0"` / `"512px"` / `"512"` → `0` / `512` / `512`；其它 → null。 */
function numAttr(tag: string, name: string): number | null {
  const raw = attrOf(tag, name)
  if (raw === null) return null
  const m = /^(-?\d+(?:\.\d+)?)\s*(?:px)?$/i.exec(raw)
  return m?.[1] === undefined ? null : Number(m[1])
}

/**
 * 这个 `fill` 是不是**不透明**。
 *
 * 放行：`none` / `transparent` / 半透明（`rgba(…,0.3)` / 8 位 hex 带 alpha）。
 * 判为不透明：3/6 位 hex、`rgb()`、`rgba()` 且 alpha = 1、颜色关键字、**以及 `currentColor`**。
 *
 * ⚠️ `currentColor` 判为不透明是**保守取舍**：它继承自 CSS，静态无法判定，
 *   多数情况（继承黑色）是实心的。若判为放行，一张贴了 `fill="currentColor"` 的
 *   全画布矩形会漏网；判为实心最多让作者改成 `fill="none"` —— 报错方向对，成本也低。
 */
function isOpaqueFill(fill: string | null): boolean {
  if (fill === null) return true // 未写 fill = 默认黑色 = 不透明
  const v = fill.trim().toLowerCase()
  if (v === 'none' || v === 'transparent') return false
  if (v === 'currentcolor') return true
  if (v.startsWith('#')) {
    const h = v.slice(1)
    if (/^[0-9a-f]{8}$/.test(h)) return h.slice(6) === 'ff' // `#rrggbbaa`
    // ⚠️ **3 位与 4 位必须分开判。** `[CR]` 2026-10-14：旧代码把
    // `#rgb`（3 位）与 `#rgba`（4 位）合在一行取 `h[3]`，而 3 位 hex
    // 根本没有第 4 个字符 —— `h[3]` 是 `undefined`，`undefined === 'f'`
    // 恒为 `false`，于是 `fill="#fff"` 被判成半透明放行。
    // `#fff` 是写 SVG 最常见的写法，这条分支漏掉的正是最可能的那一种。
    if (/^[0-9a-f]{4}$/.test(h)) return h[3] === 'f' // `#rgba`
    return true // #rgb / #rrggbb —— 没有 alpha 通道，就是不透明
  }
  const fn = /^rgba?\(([^)]*)\)$/.exec(v)
  if (fn?.[1] !== undefined) {
    const parts = fn[1].split(/[\s,/]+/).filter((s) => s !== '')
    const alpha = parts.length >= 4 ? Number(parts[3]) : 1
    return !(parts.length >= 4 && Number.isFinite(alpha) && alpha < 1)
  }
  return true // 其余（颜色关键字等）按不透明处理
}

/** 从一段已剥注释的 SVG 里读出几何规格。 */
export interface SvgGeometry {
  viewBox: string | null
  width: string | null
  height: string | null
  /** 是否存在覆盖整张画布的不透明图元（即「不透明背景」）。 */
  hasOpaqueCanvas: boolean
}

/**
 * 这个图元的外接盒是否**覆盖整张画布**。
 *
 * ⚠️ `[CR]` 2026-10-14：旧判据是 `x===0 && y===0 && w===512 && h===512`
 * ——只认**一种写法**。实测 `width="100%"`、出血 `x="-2" w="516"`、
 * `<polygon points="0,0 512,0 512,512 0,512">` 全部放行，而它们都是不透明底。
 * ⇒ 改成「**盖住整张画布就算**」，判据从「长得像某个样本」变成「达到目的」。
 *
 * 只做**轴对齐的矩形类**判定（rect / ellipse / circle / polygon 的轴对齐外包）。
 * 判不出来的形状（`<path>` 的弧线、任意路径）由调用方另行处理 ——
 * **宁可放过也不能误报**：一个会误报的守卫会被当成噪声忽略掉。
 */
function coversCanvas(el: { tag: string; attrs: Record<string, string> }): boolean {
  const a = el.attrs
  const num = (k: string): number | null => {
    const raw = a[k]
    if (raw === undefined) return null
    const m = /^(-?\d+(?:\.\d+)?)\s*(px|%)?$/i.exec(raw.trim())
    if (m?.[1] === undefined) return null
    const n = Number(m[1])
    if (!Number.isFinite(n)) return null
    return (m[2] ?? '').toLowerCase() === '%' ? (n / 100) * SVG_EDGE : n
  }

  let minX: number | null
  let minY: number | null
  let maxX: number | null
  let maxY: number | null

  switch (el.tag) {
    case 'rect': {
      // ⚠️ `x` / `y` 缺省是 0（SVG 规范），所以 `?? 0` 在这里是**规范**而非兜底。
      const x = num('x') ?? 0
      const y = num('y') ?? 0
      const w = num('width')
      const h = num('height')
      if (w === null || h === null) return false
      minX = x
      minY = y
      maxX = x + w
      maxY = y + h
      break
    }
    case 'ellipse':
    case 'circle': {
      const cx = num('cx')
      const cy = num('cy')
      // ⚠️ ellipse 缺 `ry` 时 SVG 规定取 `rx`；circle 的 r 两轴共用。
      const r = num('r')
      const rx = el.tag === 'circle' ? r : num('rx')
      const ry = el.tag === 'circle' ? r : (num('ry') ?? num('rx'))
      if (cx === null || cy === null || rx === null || ry === null) return false
      minX = cx - rx
      minY = cy - ry
      maxX = cx + rx
      maxY = cy + ry
      break
    }
    case 'polygon': {
      // 只认**轴对齐的四点**这一种可精确判定的满画布写法
      //（`0,0 512,0 512,512 0,512` 及其等价排列）。
      const pts = (a['points'] ?? '')
        .trim()
        .split(/[\s,]+/)
        .map(Number)
      if (pts.length < 6 || pts.some((n) => !Number.isFinite(n))) return false
      const xs = pts.filter((_, i) => i % 2 === 0)
      const ys = pts.filter((_, i) => i % 2 === 1)
      minX = Math.min(...xs)
      maxX = Math.max(...xs)
      minY = Math.min(...ys)
      maxY = Math.max(...ys)
      break
    }
    default:
      return false
  }

  return minX !== null && minY !== null && maxX !== null && maxY !== null
    && minX <= 0
    && minY <= 0
    && maxX >= SVG_EDGE
    && maxY >= SVG_EDGE
}

/** 取出一个元素上的全部绘制图元（已剥注释、已剥不渲染容器）。 */
function drawableElements(source: string): Array<{ tag: string; attrs: Record<string, string> }> {
  const out: Array<{ tag: string; attrs: Record<string, string> }> = []
  const re = /<(rect|ellipse|circle|polygon|path|image)\b([^>]*)>/gi
  for (let m = re.exec(source); m !== null; m = re.exec(source)) {
    const attrs: Record<string, string> = {}
    const attrRe = /([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
    for (let a = attrRe.exec(m[2] ?? ''); a !== null; a = attrRe.exec(m[2] ?? '')) {
      const name = (a[1] ?? '').toLowerCase()
      if (name === '') continue
      attrs[name] = (a[3] ?? a[2] ?? '').trim()
    }
    out.push({ tag: (m[1] ?? '').toLowerCase(), attrs })
  }
  return out
}

/** 剥注释 → 剥不渲染容器 → 取根标签属性 + 扫满画布不透明图元。 */
export function readSvgGeometry(rawSource: string): SvgGeometry {
  const source = stripXmlComments(rawSource)
  const tag = svgRootTag(source)
  const rendered = stripNonRenderedBlocks(source)

  let hasOpaqueCanvas = false
  for (const el of drawableElements(rendered)) {
    if (!coversCanvas(el)) continue
    if (isOpaqueFill(attrOfFrom(el.attrs, 'fill'))) {
      hasOpaqueCanvas = true
      break
    }
  }

  return {
    viewBox: tag === null ? null : attrOf(tag, 'viewBox'),
    width: tag === null ? null : attrOf(tag, 'width'),
    height: tag === null ? null : attrOf(tag, 'height'),
    hasOpaqueCanvas,
  }
}

/** 从已解析的属性表取值 —— 与 `attrOf` 同一套语义（含 `(?:^|\s)` 锚点）。 */
function attrOfFrom(attrs: Record<string, string>, name: string): string | null {
  return attrs[name] ?? null
}

/** 几何问题定位用的可选上下文（词图有单元/词条，塔与僵尸没有）。 */
interface GeometryContext {
  unitNumber?: number | null
  entryId?: string | null
  optionId?: string | null
}

/**
 * 读一个 SVG 并检查三条几何规格，返回结构化问题。
 *
 * ⚠️ **读不到文件时报错，不静默跳过。** 「跳过」与「通过」在退出码上无从区分，
 *   那正是本项目反复吃亏的形态（`docs/art-direction.md:20-23`）。
 */
function readGeometryProblems(
  path: string,
  deps: ValidateDeps,
  ctx: GeometryContext = {},
): ContentProblem[] {
  const at = {
    unitNumber: ctx.unitNumber ?? null,
    entryId: ctx.entryId ?? null,
    optionId: ctx.optionId ?? null,
  }
  const source = deps.readFile(path)
  if (source === null) {
    return [
      {
        category: PROBLEM_CATEGORY.svgGeometry,
        ...at,
        message:
          `无法读取 ${path}，几何规格无从校验 —— 「读不到」与「合规」在退出码上无法区分，` +
          '所以这里报错而不是跳过',
      },
    ]
  }

  const problems: ContentProblem[] = []
  const geo = readSvgGeometry(source)
  const base = `${path}`

  if (geo.viewBox === null) {
    problems.push({
      category: PROBLEM_CATEGORY.svgGeometry,
      ...at,
      message: `${base} 读不到 viewBox（根 <svg> 标签上）—— 规范值是 "${SVG_VIEW_BOX}"`,
    })
  } else if (geo.viewBox !== SVG_VIEW_BOX) {
    problems.push({
      category: PROBLEM_CATEGORY.svgGeometry,
      ...at,
      message:
        `${base} 的 viewBox 是 "${geo.viewBox}"，规范值是 "${SVG_VIEW_BOX}" —— ` +
        '非正方形画布在 aspect-ratio: 1/1 的格子里会被拉伸，词图与塔/僵尸共用同一规格',
    })
  }

  for (const axis of ['width', 'height'] as const) {
    const actual = geo[axis]
    if (actual === null) {
      problems.push({
        category: PROBLEM_CATEGORY.svgGeometry,
        ...at,
        message: `${base} 读不到 ${axis} 属性 —— 规范值是 ${SVG_EDGE}，且必须与 viewBox 一致`,
      })
    } else if (numAttr(` ${axis}="${actual}"`, axis) !== SVG_EDGE) {
      problems.push({
        category: PROBLEM_CATEGORY.svgGeometry,
        ...at,
        message:
          `${base} 的 ${axis} 是 ${actual}，规范值是 ${SVG_EDGE} —— ` +
          '不一致时浏览器按 CSS 拉伸，图会糊',
      })
    }
  }

  if (geo.hasOpaqueCanvas) {
    problems.push({
      category: PROBLEM_CATEGORY.svgGeometry,
      ...at,
      message:
        `${base} 有一块铺满整张画布的不透明 <rect> —— 规范是透明底：` +
        '卡片本身已有底色（答对/答错的反馈色就画在选项格上），图再自带背景会把它吃掉',
    })
  }

  return problems
}

// ── 塔 / 僵尸资产（Story 1.7 / AC-14.1）──────────────────────────────────────

/** 查一个目录：期望集合 vs 实际 `.svg` 集合，双向报差异。 */
function assetDirProblems(
  deps: ValidateDeps,
  dirName: string,
  expected: readonly string[],
  what: string,
): ContentProblem[] {
  const dir = join(deps.assetRoot, dirName)
  const actual = new Set(
    deps
      .listFiles(dir)
      .filter((name) => name.endsWith('.svg'))
      .map((name) => name),
  )

  const problems: ContentProblem[] = []
  for (const name of [...expected].sort()) {
    if (actual.has(name)) continue
    problems.push({
      category: PROBLEM_CATEGORY.assetMissing,
      unitNumber: null,
      entryId: null,
      optionId: null,
      message: `${what}缺失：期望 ${join(dir, name)} —— 文件名必须与规范逐字一致`,
    })
  }
  // 🎯 反向检查是 FR70「资产数 = 塔型数，不随词数增长」的**唯一可判定形式**。
  //   只查「三个都在」的话，哪天有人按词复制塔图，那条断言照样全绿。
  for (const name of [...actual].sort()) {
    if (expected.includes(name)) continue
    problems.push({
      category: PROBLEM_CATEGORY.assetUnexpected,
      unitNumber: null,
      entryId: null,
      optionId: null,
      message:
        `${what}目录里多出 ${join(dir, name)} —— ${what}按塔型制作，数量恒定` +
        `（当前应为 ${[...expected].sort().join('、')}）。多出来的文件孩子永远看不到，` +
        '而「词图齐了」的错觉会持续下去',
    })
  }
  return problems
}

/** 塔图与僵尸图的存在性 + 「不多不少」，外加各自的几何规格。 */
export function assetPresenceProblems(deps: ValidateDeps): ContentProblem[] {
  const problems: ContentProblem[] = []

  problems.push(...assetDirProblems(deps, TOWER_ASSET_DIR, expectedTowerAssetNames(), '塔图'))
  problems.push(...assetDirProblems(deps, ZOMBIE_ASSET_DIR, expectedZombieAssetNames(), '僵尸图'))

  for (const towerType of TOWER_TYPES) {
    const path = join(deps.assetRoot, TOWER_ASSET_DIR, `${towerType}.svg`)
    if (deps.fileExists(path)) problems.push(...readGeometryProblems(path, deps))
  }
  const zombiePath = join(deps.assetRoot, ZOMBIE_ASSET_DIR, ZOMBIE_ASSET_NAME)
  if (deps.fileExists(zombiePath)) problems.push(...readGeometryProblems(zombiePath, deps))

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
  const unitDistributions: UnitDistribution[] = []
  // 🔥📎 `[CR]` 2026-10-23（Story 2.5）：**规则未覆盖的单元要被点名**。
  //   原来这里只 `if (distribution !== null) unitDistributions.push(distribution)`
  //   —— 被跳过的单元**从输出里彻底消失** ⇒ 「脚本说 2 个单元」而输出里只有 1 行配比，
  //   **没有任何地方说「另一个单元没查」** ⇒ 那正是本仓反复吃过的
  //   「输出看起来没事，其实有一项没被检查」。
  //   ⇒ 这里把它们的单元号**记下来**，由 `main()` 逐个打印。
  const unitsWithoutRule: number[] = []
  let entryCount = 0

  for (const raw of units) {
    problems.push(...schemaProblems(raw))
    problems.push(...wordImageProblems(raw, deps))
    // ⚠️ Story 2.4：这两条与上面两条**并列**，不 early return（AC-13 一次列完）。
    problems.push(...optionCountProblems(raw))
    problems.push(...optionNearDuplicateProblems(raw))
    const parsed = UnitSchema.safeParse(raw)
    if (!parsed.success) continue
    entryCount += parsed.data.entries.length
    const unitKindCounts: ContentStats['kindCounts'] = { word: 0, keyword: 0, response: 0 }
    for (const entry of parsed.data.entries) {
      kindCounts[entry.card.kind] += 1
      unitKindCounts[entry.card.kind] += 1
    }
    // ⚠️ 规则**不外推**（`targetCardDistribution` 越界即抛）⇒ 这里**不把越界变成一条问题**
    //   （那会给内容层加一条新的失败模式，超出「只打印余量」的范围），
    //   只是**跳过该单元的统计**，并让输出里明说「规则未覆盖」。
    const distribution = unitDistributionOf(parsed.data.unitNumber, unitKindCounts)
    if (distribution !== null) unitDistributions.push(distribution)
    else unitsWithoutRule.push(parsed.data.unitNumber)
  }

  problems.push(...globalEntryIdProblems(units))
  // 塔/僵尸资产与单元内容无关，一局只校验一次（放在循环外）。
  problems.push(...assetPresenceProblems(deps))

  return {
    ok: problems.length === 0,
    problems,
    stats: {
      unitCount: units.length,
      entryCount,
      cardCount: entryCount,
      kindCounts,
      unitDistributions,
      unitsWithoutRule,
    },
  }
}

/**
 * **判据本体** —— 某个单元的卡型配比统计（`c_k` / `s_k` / 逐族误差）。
 *
 * ⚠️ **为什么是导出函数而不是循环体里的一段**：守卫要能「喂一份**假**的卡型计数进去，
 *   断言算出来的逐族误差跟着变」—— 若判据只活在循环体里，反向自测够不着它
 *   （只能另写一份手写比较，于是判据被改坏时反向自测照样绿 —— 本仓已知的假绿形态）。
 *
 * ⚠️ 规则**不外推**（`targetCardDistribution` 越界即抛）⇒ 越界时返回 `null`
 *   （不抛、不外推、不记一条假问题 —— 校验器的作用是**把问题列全**，不是自己先崩）。
 *
 * @param unitNumber 单元号
 * @param kindCounts 三型卡各多少（`c_k`）
 * @returns 统计；规则未覆盖该单元号时 `null`
 */
/**
 * **逐单元配比统计的打印**（DF-118 的恢复条件的落点；`[CR]` 2026-10-23 抽出成函数）。
 *
 * ⚠️ **为什么抽成函数**：`main()` 里直接写循环的话，守卫就**够不着**它 ——
 *   而「规则未覆盖的单元被点名」这一条**只在这条路径上可观察**
 *   （`main()` 只在 `result.ok` 时才打印统计 ⇒ 一个越界单元本身会让校验失败
 *   ⇒ **在真实内容上永远走不到「打印成功 + 有越界单元」这个组合**）。
 *   ⇒ 抽成导出函数，守卫就能**直接喂一份统计**断言它打印了什么。
 *   ⚠️ **`main()` 仍然调它**（不是复制一份）：`main()` 里那行
 *   `printUnitDistributions(result.stats, console.log)` 就是唯一的调用点。
 *
 * @param stats 统计结果
 * @param log 输出函数（`main()` 传 `console.log`；测试传一个收集器）
 */
export function printUnitDistributions(
  stats: Pick<ContentStats, 'unitDistributions' | 'unitsWithoutRule'>,
  log: (line: string) => void,
): void {
  for (const unit of stats.unitDistributions) {
    log(
      `[content] 单元 ${unit.unitNumber} 配比：单词 ${unit.kindCounts.word} / ` +
        `关键词 ${unit.kindCounts.keyword} / 回应 ${unit.kindCounts.response}（N=${unit.entryCount}）` +
        `—— 逐族误差 ${unit.familyErrors.word.toFixed(3)} / ${unit.familyErrors.keyword.toFixed(3)} / ` +
        `${unit.familyErrors.response.toFixed(3)}（§5.1.1 的阈值 0.5）`,
    )
  }
  // 🔥📎 `[CR]` 2026-10-23（Story 2.5）**把「规则未覆盖」的单元点名** ——
  //   这段注释原先挂在 `validateContent` 的循环上，承诺「让输出里明说『规则未覆盖』」，
  //   而**实现里没有任何地方打印它** ⇒ 被跳过的单元**从输出里彻底消失** ⇒
  //   「脚本说 2 个单元」而输出里只有 1 行配比，**没有任何地方说「另一个单元没查」**。
  for (const unitNumber of stats.unitsWithoutRule) {
    log(
      `[content] 单元 ${unitNumber} 配比：**规则未覆盖该单元号**（§5.1.1 的份额规则不外推）` +
        '—— 已跳过统计，本单元**没有**逐族余量可看',
    )
  }
}

export function unitDistributionOf(
  unitNumber: number,
  kindCounts: Record<'word' | 'keyword' | 'response', number>,
): UnitDistribution | null {
  let targetShares: Record<'word' | 'keyword' | 'response', number>
  try {
    targetShares = targetCardDistribution(unitNumber)
  } catch {
    return null
  }
  const n = kindCounts.word + kindCounts.keyword + kindCounts.response
  return {
    unitNumber,
    entryCount: n,
    kindCounts,
    targetShares,
    familyErrors: {
      word: Math.abs(kindCounts.word - targetShares.word * n),
      keyword: Math.abs(kindCounts.keyword - targetShares.keyword * n),
      response: Math.abs(kindCounts.response - targetShares.response * n),
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

/**
 * 从单元文件名里取单元号：`unit-01.json` ⇒ **1**。
 *
 * ⚠️ **文件名是唯一的带外信息** —— `validateContent` 拿到的只有 JSON 本身，
 *   而 JSON 里的 `unitNumber` 是**自述**的：把它写成 1，`unit-05.json` 的内容
 *   就会按单元 1 去校验（DF-196）。
 */
export function unitNumberFromFileName(file: string): number | null {
  const m = /^unit-(\d+)\.json$/.exec(file)
  return m ? Number(m[1]) : null
}

/**
 * 单元文件名的**规范形态**：`unit-<至少两位数字>.json`（`unit-01.json`）。
 *
 * ⚠️ **为什么要连补零一起钉**：解析若宽松（`unit-1.json` 也认），那它会与
 *   `unit-01.json` **同时**被当成单元 1 ⇒ 一个单元号挂两个文件 ⇒
 *   「文件名 ↔ unitNumber」这条交叉核对反而会**放行**两份都写着 1 的文件。
 */
export function canonicalUnitFileName(unitNumber: number): string {
  return `unit-${String(unitNumber).padStart(2, '0')}.json`
}

/**
 * 单元文件名 ↔ JSON 里 `unitNumber` 的**交叉核对**（DF-196）。
 *
 * ⚠️ **为什么这条不能省**：其余所有判据用的都是 JSON **自述**的 `unitNumber`
 *   （选项数、词图目录、词图 URL、entryId 前缀）⇒ 文件名与它不一致时，
 *   **一处都不会红** —— 而内容与资产会悄悄错位
 *   （`unit-05.json` 写 `unitNumber: 1` ⇒ 它的词图会被期待在 `unit-01/` 下）。
 *
 * ⚠️ **`unitNumber` 缺失时也要报**：schema 那条会说「unitNumber 类型不对」，
 *   但**这一维**（文件名 ↔ unitNumber）就整段没跑了 —— 不报的话，
 *   读报告的人会以为「交叉核对过了，结论是没问题」。
 */
export function unitFileNameProblems(
  units: readonly { file: string; raw: unknown }[],
): ContentProblem[] {
  const problems: ContentProblem[] = []
  for (const u of units) {
    const fromName = unitNumberFromFileName(u.file)
    if (fromName === null) {
      problems.push({
        category: PROBLEM_CATEGORY.unitFileName,
        unitNumber: unitNumberAt(u.raw),
        entryId: null,
        optionId: null,
        message:
          `单元文件名「${u.file}」不是 unit-NN.json 的形态 —— 文件名必须逐字写成 ` +
          'unit-<单元号>.json，否则「文件名 ↔ unitNumber」这条交叉核对无从下手',
      })
      continue
    }
    const canonical = canonicalUnitFileName(fromName)
    if (u.file !== canonical) {
      problems.push({
        category: PROBLEM_CATEGORY.unitFileName,
        unitNumber: unitNumberAt(u.raw),
        entryId: null,
        optionId: null,
        message:
          `单元文件名「${u.file}」不是规范形态 —— 同一个单元号只能有一个文件名，` +
          `规范写法是「${canonical}」（补零到两位）`,
      })
      continue
    }
    const declared = unitNumberAt(u.raw)
    if (declared === null) {
      problems.push({
        category: PROBLEM_CATEGORY.unitFileName,
        unitNumber: null,
        entryId: null,
        optionId: null,
        message:
          `单元文件「${u.file}」里没有可用的 unitNumber ⇒ 文件名 ↔ unitNumber 的交叉核对**没跑**` +
          `（文件名指向单元 ${fromName}）`,
      })
      continue
    }
    if (declared !== fromName) {
      problems.push({
        category: PROBLEM_CATEGORY.unitFileName,
        unitNumber: declared,
        entryId: null,
        optionId: null,
        message:
          `单元文件「${u.file}」的文件名指向单元 ${fromName}，而 JSON 里的 unitNumber 是 ${declared} —— ` +
          '两者必须一致，否则词图目录、词图 URL 与 entryId 前缀会按错的单元号去对',
      })
    }
  }
  return problems
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
export function parseCli(argv: readonly string[]): { wordImageRoot: string; assetRoot: string } {
  const cli = { wordImageRoot: WORD_IMAGE_ROOT, assetRoot: ASSET_ROOT }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--word-image-root' || arg === '--asset-root') {
      const value = argv[i + 1]
      if (value === undefined || value.trim() === '' || value.startsWith('--')) {
        throw new Error(`[content] ${arg} 需要一个目录参数`)
      }
      if (arg === '--word-image-root') {
        cli.wordImageRoot = value
      } else {
        cli.assetRoot = value
      }
      i += 1
      continue
    }
    throw new Error(
      `[content] 未知参数：${arg}（支持 --word-image-root <目录> 与 --asset-root <目录>）`,
    )
  }
  return cli
}

/** 报错行。**逐条独立可读**，绝不把多条问题压成一行（AC-13）。导出供测试断言格式。 */
export function formatProblem(problem: ContentProblem): string {
  // ⚠️ Story 1.7：塔/僵尸资产**不属于任何单元**（`unitNumber` 恒为 null）。
  // 沿用旧的「单元 ?」写法会在终端上打出一句没人看得懂的报错 ——
  // 「单元 ?」既不是真值也不可定位。资产问题的真正定位信息在 `message` 里的
  // 文件相对路径上，前缀只会把它挤到行尾看不见的地方。
  const where =
    problem.unitNumber === null
      ? ''
      : `单元 ${problem.unitNumber}${problem.entryId === null ? '' : ` 词条 ${problem.entryId}`}`
  const option = problem.optionId === null ? '' : ` 选项 ${problem.optionId}`
  return `[content] ERROR [${problem.category}] ${where}${option}${where === '' && option === '' ? '' : ' '}—— ${problem.message}`
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
  /** 塔/僵尸/词图的共同根目录，覆盖 CLI 参数（Story 1.7）。 */
  assetRoot?: string
  fileExists?: (path: string) => boolean
  readFile?: (path: string) => string | null
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
  let cli: { wordImageRoot: string; assetRoot: string }
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
      assetRoot: deps.assetRoot ?? cli.assetRoot,
      fileExists,
      readFile:
        deps.readFile ?? ((path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : null)),
      listFiles: deps.listFiles ?? ((dir: string) => (fileExists(dir) ? readdirSync(dir) : [])),
    },
  )

  // ⚠️📎 DF-196：**文件名 ↔ `unitNumber` 的交叉核对**。
  //   它必须在 `validateContent` **之外** —— 那里的判据用的全是 JSON **自述**的
  //   `unitNumber`，文件名根本没进过它的视野 ⇒ 这一维只能在这里补。
  const fileNameProblems = unitFileNameProblems(units)
  const allProblems = [...fileNameProblems, ...result.problems]

  if (!result.ok || fileNameProblems.length > 0) {
    for (const problem of allProblems) {
      console.error(formatProblem(problem))
    }
    // ⚠️ 括号里是**内容统计**，不是问题分布。资产类问题（塔/僵尸）一个单元都不属于，
    //   混在「N 处问题（单元 x 个 / 词条 y 条）」里会让人以为是那 37 条词条坏了 ——
    //   而实际上一条词条都没坏，坏的只是磁盘上缺几张图。分开报。
    const assetCount = allProblems.filter(
      (p) => p.category === PROBLEM_CATEGORY.assetMissing || p.category === PROBLEM_CATEGORY.assetUnexpected,
    ).length
    const assetNote = assetCount > 0 ? `，其中资产 ${assetCount} 处（与单元内容无关）` : ''
    console.error(
      `[content] 校验失败：${allProblems.length} 处问题（单元 ${result.stats.unitCount} 个 / ` +
        `词条 ${result.stats.entryCount} 条${assetNote}）。修复后重跑 —— 「跑过了 validate:content」` +
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
  // ⚠️📎 DF-118 的恢复条件：「把 §5.1.1 的两条判据搬进 `validate:content` 的统计输出，
  //   让录入时就看得见余量」。
  //   ⇒ 这里**逐单元**打印 `c_k` 与逐族误差 `|c_k − s_k × N|`。
  //   ⚠️ **这是统计，不是判据** —— 越界的判定在 `tests/content/unit-0N.test.ts`
  //   （§5.1.1 的两条判据）；脚本这一侧**不新增失败模式**（Story 2.2 裁决 3）。
  printUnitDistributions(result.stats, console.log)
  console.log(
    `[content] 词图目录：${deps.wordImageRoot ?? cli.wordImageRoot} —— 全部被引用的词图均存在且命名合规`,
  )
  return 0
}

/** 只在被直接执行时才跑 `main()` —— 测试要 import 本模块的纯函数。 */
if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exit(main())
}
