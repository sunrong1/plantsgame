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
  ENTRY_ID_PATTERN,
  PROBLEM_CATEGORY,
  UnitSchema,
  type ProblemCategory,
} from '../src/content/schema'
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

/** 塔/僵尸的 URL 前缀。Story 1.10 拼 `<img src>` 时照此拼（迁移说明见 story §八）。 */
export const TOWER_ASSET_URL_PREFIX = '/assets/towers'
export const ZOMBIE_ASSET_URL = `/assets/${ZOMBIE_ASSET_DIR}/${ZOMBIE_ASSET_NAME}`

/** 塔型的规范 URL。文件名 = `towerType` 字面量，**不带 `u1-` 单元前缀**（FR70：按塔型制作）。 */
export function expectedTowerAssetUrl(towerType: string): string {
  return `${TOWER_ASSET_URL_PREFIX}/${towerType}.svg`
}

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
function stripNonRenderedBlocks(source: string): string {
  return source.replace(
    /<(defs|mask|clipPath|pattern|symbol)\b[^>]*>[\s\S]*?<\/\s*\1\s*>/gi,
    ' ',
  )
}

/** 取 `<svg …>` 开标签的整段文本（属性都在里面）。 */
function svgRootTag(source: string): string | null {
  return /<svg\b[^>]*>/i.exec(source)?.[0] ?? null
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
    if (/^[0-9a-f]{8}$/.test(h)) return h.slice(6) === 'ff' // #rrggbbaa
    // ⚠️ **3 位与 4 位必须分开判。** `[CR]` 2026-10-14：旧代码把
    // `#rgb`（3 位）与 `#rgba`（4 位）合在一行取 `h[3]`，而 3 位 hex
    // 根本没有第 4 个字符 —— `h[3]` 是 `undefined`，`undefined === 'f'`
    // 恒为 `false`，于是 `fill="#fff"` 被判成半透明放行。
    // `#fff` 是写 SVG 最常见的写法，这条分支漏掉的正是最可能的那一种。
    if (/^[0-9a-f]{4}$/.test(h)) return h[3] === 'f' // #rgba
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

  if (!result.ok) {
    for (const problem of result.problems) {
      console.error(formatProblem(problem))
    }
    // ⚠️ 括号里是**内容统计**，不是问题分布。资产类问题（塔/僵尸）一个单元都不属于，
    //   混在「N 处问题（单元 x 个 / 词条 y 条）」里会让人以为是那 37 条词条坏了 ——
    //   而实际上一条词条都没坏，坏的只是磁盘上缺几张图。分开报。
    const assetCount = result.problems.filter(
      (p) => p.category === PROBLEM_CATEGORY.assetMissing || p.category === PROBLEM_CATEGORY.assetUnexpected,
    ).length
    const assetNote = assetCount > 0 ? `，其中资产 ${assetCount} 处（与单元内容无关）` : ''
    console.error(
      `[content] 校验失败：${result.problems.length} 处问题（单元 ${result.stats.unitCount} 个 / ` +
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
  console.log(
    `[content] 词图目录：${deps.wordImageRoot ?? cli.wordImageRoot} —— 全部被引用的词图均存在且命名合规`,
  )
  return 0
}

/** 只在被直接执行时才跑 `main()` —— 测试要 import 本模块的纯函数。 */
if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exit(main())
}
