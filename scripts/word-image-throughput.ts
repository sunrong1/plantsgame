/**
 * 词图产能测量 —— 把「画一张图要多久」变成可复跑、可哈希复核的记录。
 *
 * ── 守什么 ────────────────────────────────────────────────────────────────
 * 1. `snapshot`：**每次落盘后立刻跑一次**，把该文件当时的 mtime / 字节数 / sha256 /
 *    构图档位 / §5.1 占比 / 图元数**追加**一条记录到 JSONL。
 *    第一次 snapshot 的时刻 = **首版时刻**；最后一次 = **末版时刻**。
 * 2. `report`：由 JSONL 算出逐张首版/末版时刻、每张耗时、档位 × 版本数分布、
 *    产能区间（中位数与分位数）。
 *
 * ── 为什么这么写 ────────────────────────────────────────────────────────────
 * **mtime 只保留最后一次写入** ⇒ 「这一张的第一版是几点写的」在文件系统里
 * 原理上取不到。Story 1.8 与 1.9 各做过一次批量词图，两次都只拿到末版 mtime，
 * 于是两份文档里**没有任何一个「每张画图耗时」的数字**（见 `docs/word-image-throughput.md`
 * §2 的 `[CR]` 更正与 §7.1）。
 * ⇒ **唯一能补上的办法是「每写一版就记一次」**，这正是 `snapshot` 存在的理由。
 *
 * ⚠️ **本模块不重实现任何实算逻辑**（R-37 的直接应用）：
 * · 构图档位 / §5.1 占比 ⇒ `word-image-metrics.ts` 的 `readCompositionTier()` / `measureWordImage()`
 * · 指标常量（画布 512 / 留白 6% / 重心 ±6%）⇒ `word-image-metrics.ts` 的导出常量，**不写死字面值**
 * · 剥 XML 注释 ⇒ `validate-content.ts` 的 `stripXmlComments`
 *
 * ── 期望值来源与出处 ────────────────────────────────────────────────────────
 * · 词图规格与构图判据：`docs/art-direction.md` §1 / §5.1
 * · 口径纪律（口径 A / B 不可混用）与「9.7 小时 ÷ 25 张 = 23 分钟/张」为什么作废：
 *   `docs/word-image-throughput.md` §0 / §2 / §7.5
 * · 决策记录：`docs/word-image-throughput.md` §8
 */

import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { stripXmlComments } from './validate-content'
import {
  CANVAS_SIZE,
  CENTER_TOLERANCE_PERCENT,
  MIN_PADDING_PERCENT,
  TIER_EDGE_RANGES,
  measureWordImage,
  readCompositionTier,
} from './word-image-metrics'

// ── 由既有模块派生的常量（**不写死字面值**，R-56）─────────────────────────────

/** §5.2 的留白下限（px）—— 由 `word-image-metrics.ts` 的常量算出，不写死 30.72。 */
export const MIN_PADDING_PX = (MIN_PADDING_PERCENT / 100) * CANVAS_SIZE
/** §5.3 的重心容差（px）—— 同上。 */
export const CENTER_TOLERANCE_PX = (CENTER_TOLERANCE_PERCENT / 100) * CANVAS_SIZE

// ── 记录与报告的形状 ─────────────────────────────────────────────────────────

/** 一条 snapshot 记录 —— JSONL 的一行。字段名是守卫 G180 钉住的对象。 */
export interface ThroughputRecord {
  /** 词条 id（文件名去掉 `.svg`）。 */
  entryId: string
  /** 文件名（含 `.svg`）。 */
  file: string
  /** 文件 mtime 的 ISO 串（毫秒精度）。 */
  timestamp: string
  /** 文件 mtime 的毫秒数（原始精度，耗时由它算）。 */
  mtimeMs: number
  /** 文件字节数。 */
  bytes: number
  /** 文件内容的 sha256（十六进制）。 */
  sha256: string
  /** 构图档位；`null` 表示头部注释里读不到。 */
  tier: string | null
  /** §5.1 主体占画布比例（百分数，黄金口径）。 */
  edgePercent: number
  /** §5.2 四边最小留白（px，黄金口径）。 */
  paddingPx: number
  /** §5.3 重心相对画布中心的偏移（px，黄金口径）。 */
  centerOffsetPx: number
  /**
   * 本版对 §5.1 / §5.2 / §5.3 的违规项。
   *
   * ⚠️ **空数组 = 实算合规**。这是「这一版实算超标」这件事的机器可读形态 ——
   * Story 1.9 的 `u1-goodbye` v3 就是「栅格化看着对、实算超标（85.6% / 留白 29.4px）」
   * 那种只在 `word-image-metrics` 的输出里看得见、不在任何版本记录里的失败。
   */
  violations: string[]
  /** 图元数（复杂度粗代理）。口径见 `countElements()`。 */
  elementCount: number
}

/** 逐张汇总。 */
export interface EntrySummary {
  entryId: string
  /** 首版时刻（该文件第一条记录的 mtime）。 */
  firstTimestamp: string
  /** 末版时刻（该文件最后一条记录的 mtime）。 */
  lastTimestamp: string
  /** 末版 − 首版，秒。 */
  durationSeconds: number
  /** 该文件被 snapshot 过的次数 = 版本数。 */
  versionCount: number
  /** 该文件末版的构图档位。 */
  tier: string | null
}

/** 档位 × 版本数分布。 */
export interface TierDistributionEntry {
  /** 档位名；读不到档位时是 `（缺失）`。 */
  tier: string
  /** 该档位下的图片数（文件数）。 */
  images: number
  /** 该档位下的版本数合计。 */
  versions: number
  /** 平均版本数 = versions / images。 */
  averageVersions: number
}

/** 产能区间。 */
export interface ThroughputStats {
  /** 参与统计的图片数。 */
  sampleSize: number
  minSeconds: number
  /** 25% 分位数（线性插值法，见 `quantile()`）。 */
  p25Seconds: number
  /** 中位数（线性插值法）。 */
  medianSeconds: number
  /** 75% 分位数（线性插值法）。 */
  p75Seconds: number
  maxSeconds: number
}

/** `report` 的完整输出。 */
export interface ThroughputReport {
  entries: EntrySummary[]
  tierVersionDistribution: TierDistributionEntry[]
  throughput: ThroughputStats
}

// ── 图元计数 ─────────────────────────────────────────────────────────────────

/**
 * 数一张图里的元素个数（复杂度粗代理）。
 *
 * ⚠️ **口径必须写死，否则两个数字会被混着用**：
 * **含 `<g>`、不含 `<svg>`** —— 与 `docs/word-image-throughput.md` §1.2 记的
 * 「1（`u1-two`）– 34（`u1-friend`）」是**同一个口径**（实测复核：
 * `u1-friend` = 10 path + 8 ellipse + 7 circle + 6 rect + 3 g + 1 svg = 35 标签，
 * 去掉 `<svg>` = 34 ✓）。
 * 若只数可绘制图元（不含 `<g>`），同一批图是 **1 – 31**。
 *
 * ⚠️ **先剥注释、再剥属性值，最后才数标签**：
 * · 注释里可能有 `<path>` 这样的字面量（剥掉）；
 * · 属性值里可能有 `<` （如 `aria-label="a<b"`）—— 不剥属性值会多算数。
 */
export function countElements(source: string): number {
  const withoutComments = stripXmlComments(source)
  const withoutAttributeValues = withoutComments.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''")
  const tags = withoutAttributeValues.match(/<[a-zA-Z][a-zA-Z0-9-]*/g) ?? []
  // 去掉根 `<svg>` 本身（它是画布容器，不是元素）
  return Math.max(0, tags.length - 1)
}

// ── snapshot ────────────────────────────────────────────────────────────────

/** 列出目录下的 `.svg` 文件名（排序，保证确定性）。 */
export function listSvgFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.svg'))
    .sort()
}

/**
 * 判一个版本对 §5.1 / §5.2 / §5.3 有哪些违规。
 *
 * ⚠️ **阈值一律从 `word-image-metrics.ts` 的导出常量算，不写死字面值**（R-56）：
 * 30.72px / ±30.72px 都是 6% × 512 的结果，写死字面值会在阈值变动时静默失配。
 */
export function findViolations(
  tier: string | null,
  edgePercent: number,
  paddingPx: number,
  centerOffsetPx: number,
): string[] {
  const violations: string[] = []
  if (tier === null) {
    violations.push('头部注释里读不到「构图档位：xxx」')
    return violations
  }
  const range = TIER_EDGE_RANGES[tier as keyof typeof TIER_EDGE_RANGES]
  if (range === undefined) {
    violations.push(`构图档位 "${tier}" 不在 TIER_EDGE_RANGES 的取值域里`)
    return violations
  }
  const [low, high] = range
  if (edgePercent < low || edgePercent > high) {
    violations.push(`§5.1 主体占比 ${edgePercent.toFixed(1)}% 不在 ${low}–${high}%`)
  }
  if (paddingPx < MIN_PADDING_PX) {
    violations.push(`§5.2 最小留白 ${paddingPx.toFixed(1)}px < ${MIN_PADDING_PX.toFixed(2)}px`)
  }
  if (centerOffsetPx > CENTER_TOLERANCE_PX) {
    violations.push(`§5.3 重心偏移 ${centerOffsetPx.toFixed(1)}px > ${CENTER_TOLERANCE_PX.toFixed(2)}px`)
  }
  return violations
}

/** 为一个文件构造一条记录。 */
export function buildRecord(dir: string, fileName: string): ThroughputRecord {
  const full = path.join(dir, fileName)
  const raw = readFileSync(full, 'utf8')
  const stat = statSync(full)
  const entryId = fileName.replace(/\.svg$/, '')
  const metrics = measureWordImage(entryId, raw)
  // ⚠️ 档位必须从**未剥注释**的原文读 —— 档位声明本身就住在注释里
  const tier = readCompositionTier(raw)
  return {
    entryId,
    file: fileName,
    timestamp: stat.mtime.toISOString(),
    mtimeMs: stat.mtimeMs,
    bytes: stat.size,
    sha256: createHash('sha256').update(raw, 'utf8').digest('hex'),
    tier,
    edgePercent: metrics.edgePercent,
    paddingPx: metrics.minPaddingPx,
    centerOffsetPx: metrics.centerOffsetPx,
    violations: findViolations(tier, metrics.edgePercent, metrics.minPaddingPx, metrics.centerOffsetPx),
    elementCount: countElements(raw),
  }
}

/** 读一份 JSONL 日志。文件不存在时返回空数组。 */
export function readLog(logPath: string): ThroughputRecord[] {
  if (!existsSync(logPath)) return []
  const raw = readFileSync(logPath, 'utf8')
  const records: ThroughputRecord[] = []
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    records.push(JSON.parse(trimmed) as ThroughputRecord)
  }
  return records
}

/**
 * 扫描目录并把新记录**追加**到 JSONL。
 *
 * ⚠️ **内容哈希与上一条相同则不追加** —— 同一版内容被 snapshot 两次
 * （例如误跑了两次命令）不应当被算成两个版本。
 */
export function appendSnapshot(dir: string, logPath: string): { appended: number; skipped: number } {
  const files = listSvgFiles(dir)
  if (files.length === 0) {
    throw new Error(`word-image-throughput：目录 ${dir} 下没有 .svg 文件`)
  }
  const existing = readLog(logPath)
  const lastByEntry = new Map<string, ThroughputRecord>()
  for (const record of existing) lastByEntry.set(record.entryId, record)

  const lines: string[] = []
  let skipped = 0
  for (const fileName of files) {
    const record = buildRecord(dir, fileName)
    const previous = lastByEntry.get(record.entryId)
    if (previous !== undefined && previous.sha256 === record.sha256) {
      skipped += 1
      continue
    }
    lines.push(JSON.stringify(record))
  }
  if (lines.length > 0) {
    appendFileSync(logPath, `${lines.join('\n')}\n`, 'utf8')
  }
  return { appended: lines.length, skipped }
}

// ── report ──────────────────────────────────────────────────────────────────

/**
 * 分位数（**线性插值法**，即 R-7 / numpy 默认）。
 *
 * ⚠️ **方法必须写死**：换一种分位数定义，同一份 log 会给出不同的数，
 * 而 `report` 的输出是要被守卫当黄金值钉住的。
 * 公式：`h = (n − 1) × p`；`lo = floor(h)`；`frac = h − lo`；
 * `q = a[lo] + frac × (a[lo+1] − a[lo])`（`n = 1` 时直接返回 `a[0]`）。
 */
export function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0) return Number.NaN
  if (sorted.length === 1) return sorted[0]
  const h = (sorted.length - 1) * p
  const lo = Math.floor(h)
  const frac = h - lo
  const upper = sorted[Math.min(lo + 1, sorted.length - 1)]
  return sorted[lo] + frac * (upper - sorted[lo])
}

/**
 * 由记录算报告。
 *
 * ⚠️ **纯函数**：同一份 log 跑两次必须给出**逐字节相同**的结果。
 * 排序键固定（entryId 升序；档位分布按档位名升序），不做任何依赖当前时间的计算。
 */
export function buildReport(records: ThroughputRecord[]): ThroughputReport {
  const byEntry = new Map<string, ThroughputRecord[]>()
  for (const record of records) {
    const list = byEntry.get(record.entryId) ?? []
    list.push(record)
    byEntry.set(record.entryId, list)
  }

  const entries: EntrySummary[] = []
  for (const [entryId, list] of byEntry) {
    const sorted = [...list].sort((a, b) => a.mtimeMs - b.mtimeMs)
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    entries.push({
      entryId,
      firstTimestamp: first.timestamp,
      lastTimestamp: last.timestamp,
      durationSeconds: (last.mtimeMs - first.mtimeMs) / 1000,
      versionCount: sorted.length,
      tier: last.tier,
    })
  }
  entries.sort((a, b) => (a.entryId < b.entryId ? -1 : a.entryId > b.entryId ? 1 : 0))

  // 档位 × 版本数分布
  const byTier = new Map<string, { images: number; versions: number }>()
  for (const entry of entries) {
    const key = entry.tier ?? '（缺失）'
    const bucket = byTier.get(key) ?? { images: 0, versions: 0 }
    bucket.images += 1
    bucket.versions += entry.versionCount
    byTier.set(key, bucket)
  }
  const tierVersionDistribution: TierDistributionEntry[] = [...byTier.entries()]
    .map(([tier, bucket]) => ({
      tier,
      images: bucket.images,
      versions: bucket.versions,
      averageVersions: bucket.versions / bucket.images,
    }))
    .sort((a, b) => (a.tier < b.tier ? -1 : a.tier > b.tier ? 1 : 0))

  // 产能区间
  const durations = entries.map((entry) => entry.durationSeconds).sort((a, b) => a - b)
  const throughput: ThroughputStats = {
    sampleSize: durations.length,
    minSeconds: durations.length === 0 ? Number.NaN : durations[0],
    p25Seconds: quantile(durations, 0.25),
    medianSeconds: quantile(durations, 0.5),
    p75Seconds: quantile(durations, 0.75),
    maxSeconds: durations.length === 0 ? Number.NaN : durations[durations.length - 1],
  }

  return { entries, tierVersionDistribution, throughput }
}

/** 把报告渲染成可读文本（CLI 用；测试不依赖文本，只依赖 `buildReport()` 的结构）。 */
export function formatReport(report: ThroughputReport): string {
  const lines: string[] = []
  lines.push(`[word-image-throughput] 样本 ${report.throughput.sampleSize} 张`)
  lines.push('')
  lines.push('词条'.padEnd(18) + '首版时刻'.padEnd(26) + '末版时刻'.padEnd(26) + '耗时(s)'.padStart(9) + '版本'.padStart(6))
  for (const entry of report.entries) {
    lines.push(
      entry.entryId.padEnd(18) +
        entry.firstTimestamp.padEnd(26) +
        entry.lastTimestamp.padEnd(26) +
        entry.durationSeconds.toFixed(1).padStart(8) +
        String(entry.versionCount).padStart(6),
    )
  }
  lines.push('')
  lines.push('档位 × 版本数：')
  for (const bucket of report.tierVersionDistribution) {
    lines.push(
      `  ${bucket.tier.padEnd(12)} 图片 ${String(bucket.images).padStart(3)}  版本合计 ${String(bucket.versions).padStart(4)}  平均 ${bucket.averageVersions.toFixed(2)} 版/张`,
    )
  }
  lines.push('')
  lines.push(
    `产能区间（中位数 ${report.throughput.medianSeconds.toFixed(1)} s，` +
      `P25 ${report.throughput.p25Seconds.toFixed(1)} s，P75 ${report.throughput.p75Seconds.toFixed(1)} s，` +
      `最小 ${report.throughput.minSeconds.toFixed(1)} s，最大 ${report.throughput.maxSeconds.toFixed(1)} s）`,
  )
  return lines.join('\n')
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function main(): number {
  const [command, ...args] = process.argv.slice(2)

  if (command === 'snapshot') {
    const [dir, logPath] = args
    if (dir === undefined || logPath === undefined) {
      console.error('用法：word-image-throughput snapshot <dir> <logPath>')
      return 1
    }
    const { appended, skipped } = appendSnapshot(path.resolve(dir), path.resolve(logPath))
    console.log(`[word-image-throughput] snapshot ${dir} → 追加 ${appended} 条，跳过 ${skipped} 条（内容哈希未变）`)
    return 0
  }

  if (command === 'report') {
    const [logPath] = args
    if (logPath === undefined) {
      console.error('用法：word-image-throughput report <logPath>')
      return 1
    }
    const records = readLog(path.resolve(logPath))
    if (records.length === 0) {
      console.error(`[word-image-throughput] 日志 ${logPath} 为空或不存在`)
      return 1
    }
    console.log(formatReport(buildReport(records)))
    return 0
  }

  console.error('用法：word-image-throughput <snapshot|report> …')
  return 1
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exit(main())
}
