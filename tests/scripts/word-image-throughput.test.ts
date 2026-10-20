/**
 * 词图产能测量守卫 G180 – G184（Story 2.1 / AC D1–D5、T3）。
 *
 * ── 守什么 ────────────────────────────────────────────────────────────────
 * · **G180** —— 产能日志每条记录字段齐全、时间戳单调不减、`sha256` 与磁盘内容一致。
 * · **G181** —— `report` 的算术对着**手算夹具**算对（耗时 / 中位数 / 分位数 / 版本数分布）。
 * · **G182** —— **覆盖面**：log 覆盖实验目录内**全部** SVG（用**第二套枚举**核对）。
 * · **G183** —— 需配图词条占比 = 实算值，且与 §8 记录的数字一致（= AC A1）。
 * · **G184** —— §8 里「估算基数」与「实测基数」**同时在场**，且估算那条**被显式标为作废**。
 *
 * ── 为什么这么写 ────────────────────────────────────────────────────────────
 * · **覆盖面用两套互不相干的枚举求差集**。
 *   ⚠️ Story 1.9 的变异 M26 的教训：断言与被测代码用**同一个数据源**时，
 *   把枚举改窄（去掉 `recursive`）仍然全绿 —— 差集按构造恒空。
 * · **文档判据用 `String.includes()` 精确匹配标记串，不用正则**（R-53：
 *   词边界判据在中文标点上会失配），且判据写完先在真实文档上自测一次。
 * · **每条守卫都配一次变异**（M199 – M203），改动只在 `mkdtempSync` 的副本上做，
 *   **绝不改仓库磁盘**。
 *   为此本文件给三样东西留了**可覆盖的路径**（环境变量）：
 *   被测模块 / 被守的 §8 文档 / 被算的单元 1 JSON。
 *   ⇒ 变异验证时把环境变量指向临时副本，本文件就对着**变异后的**实现跑。
 * · **生产代码零改动**：本文件只读 `src/content/units/unit-01.json` 的原始 JSON，
 *   **不 import `src/` 的任何模块** —— 免得内容层一改就把这条守卫拖成 TS6307。
 *
 * ── 出处 ────────────────────────────────────────────────────────────────────
 * · 守卫清单与变异编号：Story 2.1 的 Dev Notes §8.3
 * · 决策记录正文：`docs/word-image-throughput.md` §8
 * · 词图规格与构图判据：`docs/art-direction.md` §1 / §5.1
 */

import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import type { ThroughputRecord } from '../../scripts/word-image-throughput'

const root = fileURLToPath(new URL('../../', import.meta.url))

/**
 * 被测模块的路径 —— 变异验证时指向 `mkdtempSync` 副本里的那一份。
 *
 * ⚠️ **必须是运行时动态 import**：静态 import 只能指向仓库里那一份，
 *   变异验证就会变成「改仓库磁盘」，而 R-50 的第 4 步（复原并复核 `git diff --stat`）
 *   恰恰说明「改仓库磁盘」是被允许但要复原的 —— 本 story 选更保守的那条：
 *   **改副本，仓库磁盘一个字节都不动。**
 */
const MODULE_PATH =
  process.env.WORD_IMAGE_THROUGHPUT_MODULE ??
  fileURLToPath(new URL('../../scripts/word-image-throughput.ts', import.meta.url))

const throughput = (await import(MODULE_PATH)) as typeof import('../../scripts/word-image-throughput')

/** 被守的 §8 决策记录 —— 变异验证时指向副本。 */
const DOC_PATH =
  process.env.WORD_IMAGE_THROUGHPUT_DOC ?? join(root, 'docs/word-image-throughput.md')

/** 被算的单元 1 内容 —— 变异验证时指向副本。 */
const UNIT_JSON_PATH =
  process.env.WORD_IMAGE_THROUGHPUT_UNIT ?? join(root, 'src/content/units/unit-01.json')

// ── 夹具 ─────────────────────────────────────────────────────────────────────

/** 一张**实算合规**的词图（`measureWordImage` 不抛错，且 §5.1/§5.2/§5.3 都不违规）。 */
function compliantSvg(tier: 'geometric' | 'abstract' | 'organic' | 'figure'): string {
  // geometric / abstract 的 §5.1 区间是 60–75%，organic / figure 是 70–85%
  const size = tier === 'geometric' || tier === 'abstract' ? 320 : 384
  const offset = (512 - size) / 2
  return [
    `<!-- 构图档位：${tier} -->`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">`,
    `  <rect x="${offset}" y="${offset}" width="${size}" height="${size}" fill="#e5534b"/>`,
    `</svg>`,
    '',
  ].join('\n')
}

/** 造一个临时目录，测完删掉。 */
function makeTmpDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

/** 把某个文件的 mtime 钉成确定值（否则耗时断言依赖文件系统的时间精度）。 */
function pinMtime(file: string, mtimeMs: number): void {
  const seconds = mtimeMs / 1000
  utimesSync(file, seconds, seconds)
}

/** 手算夹具用的完整记录。 */
function fixtureRecord(
  entryId: string,
  mtimeMs: number,
  tier: string | null,
  overrides: Partial<ThroughputRecord> = {},
): ThroughputRecord {
  return {
    entryId,
    file: `${entryId}.svg`,
    timestamp: new Date(mtimeMs).toISOString(),
    mtimeMs,
    bytes: 1024,
    sha256: 'f'.repeat(64),
    tier,
    edgePercent: 70,
    paddingPx: 64,
    centerOffsetPx: 0,
    violations: [],
    elementCount: 3,
    ...overrides,
  }
}

// ── G180 ─────────────────────────────────────────────────────────────────────

describe('G180 —— 产能日志：字段齐全 / 时间单调 / sha256 与磁盘一致', () => {
  it('每条记录字段齐全，且 sha256 与磁盘上的内容一致', () => {
    const dir = makeTmpDir('w180-')
    try {
      writeFileSync(join(dir, 'u2-apple.svg'), compliantSvg('geometric'), 'utf8')
      writeFileSync(join(dir, 'u2-ball.svg'), compliantSvg('abstract'), 'utf8')
      pinMtime(join(dir, 'u2-apple.svg'), 1_700_000_000_000)
      pinMtime(join(dir, 'u2-ball.svg'), 1_700_000_000_000)

      const logPath = join(dir, 'versions.jsonl')
      throughput.appendSnapshot(dir, logPath)
      const records = throughput.readLog(logPath)

      expect(records.length, '快照没有产出记录 —— snapshot 根本没写日志，后面全是空转').toBe(2)

      const REQUIRED_FIELDS = [
        'entryId',
        'file',
        'timestamp',
        'mtimeMs',
        'bytes',
        'sha256',
        'tier',
        'edgePercent',
        'paddingPx',
        'centerOffsetPx',
        'violations',
        'elementCount',
      ] as const

      for (const record of records) {
        for (const field of REQUIRED_FIELDS) {
          expect(
            Object.prototype.hasOwnProperty.call(record, field),
            `记录 ${record.entryId} 缺字段 "${field}" —— 少一个字段，下游读它的代码只能靠猜`,
          ).toBe(true)
        }
        expect(
          typeof record.mtimeMs,
          `记录 ${record.entryId} 的 mtimeMs 不是数字 —— 耗时算不出来`,
        ).toBe('number')
        expect(
          Number.isFinite(record.mtimeMs),
          `记录 ${record.entryId} 的 mtimeMs 不是有限数 —— NaN 会让所有耗时比较静默为 false`,
        ).toBe(true)
        expect(
          Array.isArray(record.violations),
          `记录 ${record.entryId} 的 violations 不是数组 —— 实算超标就记不下来了`,
        ).toBe(true)
        expect(
          record.sha256,
          `记录 ${record.entryId} 的 sha256 不是 64 位十六进制 —— 哈希对不上内容，「跳过」判据就废了`,
        ).toMatch(/^[0-9a-f]{64}$/)
      }

      // ⚠️ 核心断言：**sha256 必须等于当下磁盘内容的哈希**。
      // 「记录里存了个哈希」不等于「那个哈希是这个文件的」。
      for (const record of records) {
        const onDisk = readFileSync(join(dir, record.file), 'utf8')
        const expected = createHash('sha256').update(onDisk, 'utf8').digest('hex')
        expect(
          record.sha256,
          `记录 ${record.entryId} 的 sha256 与磁盘内容对不上 —— 内容改了而日志说没改，` +
            '「同内容才跳过」就会把改过的版本当成没改',
        ).toBe(expected)
        expect(
          record.bytes,
          `记录 ${record.entryId} 的字节数与磁盘对不上 —— 体积也是「跳过」判据的一部分`,
        ).toBe(Buffer.byteLength(onDisk, 'utf8'))
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('同一张图的记录按 mtime 单调不减，且内容未变时不追加', () => {
    const dir = makeTmpDir('w180b-')
    try {
      const file = join(dir, 'u2-apple.svg')
      writeFileSync(file, compliantSvg('geometric'), 'utf8')
      pinMtime(file, 1_700_000_000_000)

      const logPath = join(dir, 'versions.jsonl')
      throughput.appendSnapshot(dir, logPath)

      // 改一版，mtime 前进 5 秒
      writeFileSync(file, compliantSvg('geometric').replace('#e5534b', '#3b7ae5'), 'utf8')
      pinMtime(file, 1_700_000_005_000)
      throughput.appendSnapshot(dir, logPath)

      const records = throughput.readLog(logPath)
      const forApple = records.filter((r) => r.entryId === 'u2-apple')
      expect(forApple.length, '两版内容不同却只记了一条 —— 「同内容不追加」被写成了「永远不追加」').toBe(2)
      for (let i = 1; i < forApple.length; i += 1) {
        expect(
          forApple[i].mtimeMs,
          `u2-apple 的第 ${i + 1} 条记录时间戳比上一条早 —— 版本顺序颠倒，首版/末版就认错了`,
        ).toBeGreaterThanOrEqual(forApple[i - 1].mtimeMs)
      }

      // 同内容再跑一次：必须不追加
      const before = records.length
      throughput.appendSnapshot(dir, logPath)
      const after = throughput.readLog(logPath)
      expect(
        after.length,
        '内容没变却又追加了一条 —— 误跑两次命令会把一个版本算成两个版本，产能区间直接被拉长',
      ).toBe(before)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

// ── G181 ─────────────────────────────────────────────────────────────────────

describe('G181 —— report 的算术对着手算夹具算对', () => {
  it('耗时 / 中位数 / 分位数 / 版本数分布全部等于手算值', () => {
    const dir = makeTmpDir('w181-')
    try {
      // 手算夹具：4 张图，耗时 10 / 20 / 30 / 40 秒
      //   playground 故意 3 个版本（其余 2 个）⇒ 版本数分布不是「每张都一样」
      const records: ThroughputRecord[] = [
        fixtureRecord('u2-apple', 1_000_000, 'geometric'),
        fixtureRecord('u2-apple', 1_010_000, 'geometric'),
        fixtureRecord('u2-ball', 2_000_000, 'abstract'),
        fixtureRecord('u2-ball', 2_020_000, 'abstract'),
        fixtureRecord('u2-playground', 3_000_000, 'organic'),
        fixtureRecord('u2-playground', 3_015_000, 'organic'),
        fixtureRecord('u2-playground', 3_030_000, 'organic'),
        fixtureRecord('u2-kite', 4_000_000, 'figure'),
        fixtureRecord('u2-kite', 4_040_000, 'figure'),
      ]
      const logPath = join(dir, 'versions.jsonl')
      writeFileSync(logPath, `${records.map((r) => JSON.stringify(r)).join('\n')}\n`, 'utf8')

      const report = throughput.buildReport(throughput.readLog(logPath))

      // 逐张：首版 / 末版 / 耗时 / 版本数
      expect(
        report.entries.map((e) => e.entryId),
        '逐张清单的顺序不是按 entryId 升序 —— 同一份 log 跑两次的输出就没法逐字比对',
      ).toEqual(['u2-apple', 'u2-ball', 'u2-kite', 'u2-playground'])
      expect(
        report.entries.map((e) => e.durationSeconds),
        '逐张耗时算错 —— 耗时是本 story 唯一能拿出手的「每张画图耗时」',
      ).toEqual([10, 20, 40, 30])
      expect(
        report.entries.map((e) => e.versionCount),
        '版本数算错 —— 版本数就是返工版数，返工率是产能模型的关键输入',
      ).toEqual([2, 2, 2, 3])
      expect(
        report.entries.map((e) => e.firstTimestamp),
        '首版时刻取错 —— 首版时刻是 Story 1.8 / 1.9 都没记到的那一个',
      ).toEqual([
        new Date(1_000_000).toISOString(),
        new Date(2_000_000).toISOString(),
        new Date(4_000_000).toISOString(),
        new Date(3_000_000).toISOString(),
      ])

      // 产能区间（线性插值法，n = 4 ⇒ 排序后 [10, 20, 30, 40]）
      //   中位数 h = 3 × 0.50 = 1.5  ⇒ 20 + 0.5 × (30 − 20) = 25
      //   P25    h = 3 × 0.25 = 0.75 ⇒ 10 + 0.75 × (20 − 10) = 17.5
      //   P75    h = 3 × 0.75 = 2.25 ⇒ 30 + 0.25 × (40 − 30) = 32.5
      expect(report.throughput.sampleSize, '样本数算错 —— 样本数是「这个区间有多可信」的依据').toBe(4)
      expect(report.throughput.minSeconds, '最小值算错').toBe(10)
      expect(report.throughput.maxSeconds, '最大值算错').toBe(40)
      expect(report.throughput.medianSeconds, '中位数算错 —— 决策表的主口径数字取自中位数').toBe(25)
      expect(report.throughput.p25Seconds, 'P25 算错').toBe(17.5)
      expect(report.throughput.p75Seconds, 'P75 算错').toBe(32.5)

      // 档位 × 版本数分布
      expect(
        report.tierVersionDistribution,
        '档位 × 版本数分布算错 —— 产能模型按档位加权，加权用错就是加权了错的东西',
      ).toEqual([
        { tier: 'abstract', images: 1, versions: 2, averageVersions: 2 },
        { tier: 'figure', images: 1, versions: 2, averageVersions: 2 },
        { tier: 'geometric', images: 1, versions: 2, averageVersions: 2 },
        { tier: 'organic', images: 1, versions: 3, averageVersions: 3 },
      ])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('同一份 log 跑两次 report，结果逐字相同（确定性）', () => {
    const dir = makeTmpDir('w181b-')
    try {
      const records: ThroughputRecord[] = [
        fixtureRecord('u2-apple', 1_000_000, 'geometric'),
        fixtureRecord('u2-apple', 1_010_000, 'geometric'),
        fixtureRecord('u2-ball', 2_000_000, 'abstract'),
        fixtureRecord('u2-ball', 2_020_000, 'abstract'),
      ]
      const logPath = join(dir, 'versions.jsonl')
      writeFileSync(logPath, `${records.map((r) => JSON.stringify(r)).join('\n')}\n`, 'utf8')

      const first = JSON.stringify(throughput.buildReport(throughput.readLog(logPath)))
      const second = JSON.stringify(throughput.buildReport(throughput.readLog(logPath)))
      expect(second, '同一份 log 两次 report 结果不同 —— 产能数字没法当守卫的黄金值钉住').toBe(first)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('档位读不到时归入「（缺失）」桶，不静默丢掉这张图', () => {
    const dir = makeTmpDir('w181c-')
    try {
      const records: ThroughputRecord[] = [
        fixtureRecord('u2-apple', 1_000_000, 'geometric'),
        fixtureRecord('u2-untiered', 2_000_000, null),
      ]
      const logPath = join(dir, 'versions.jsonl')
      writeFileSync(logPath, `${records.map((r) => JSON.stringify(r)).join('\n')}\n`, 'utf8')

      const report = throughput.buildReport(throughput.readLog(logPath))
      expect(
        report.entries.length,
        '档位读不到的图被丢出了逐张清单 —— 「少读几张就在剩下的图上恒绿」正是 1.9 抓过的形态',
      ).toBe(2)
      expect(
        report.tierVersionDistribution.map((b) => b.tier),
        '档位读不到的图没有被归进「（缺失）」桶 —— 分布少了一个档位，加权就少算一张图',
      ).toEqual(['geometric', '（缺失）'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

// ── G182 ─────────────────────────────────────────────────────────────────────

describe('G182 —— 覆盖面：log 覆盖实验目录内的全部 SVG', () => {
  it('目录里的每一张 SVG 在 log 里都有记录（用第二套枚举核对）', () => {
    const dir = makeTmpDir('w182-')
    try {
      const files = ['u2-apple.svg', 'u2-ball.svg', 'u2-kite.svg']
      for (const [index, file] of files.entries()) {
        const full = join(dir, file)
        writeFileSync(full, compliantSvg(index === 0 ? 'geometric' : 'abstract'), 'utf8')
        pinMtime(full, 1_700_000_000_000 + index * 1000)
      }

      const logPath = join(dir, 'versions.jsonl')
      throughput.appendSnapshot(dir, logPath)
      const logged = new Set(throughput.readLog(logPath).map((r) => r.entryId))

      // ⚠️ **第二套枚举**：本文件自己数目录，不复用被测代码的 `listSvgFiles()`。
      //    复用的话，枚举被改窄时差集按构造恒空 —— Story 1.9 的变异 M26 就是这么假绿的。
      const onDisk = readdirSync(dir, { recursive: true })
        .map(String)
        .filter((name) => name.endsWith('.svg'))
        .map((name) => name.replace(/\.svg$/, ''))
        .sort()

      expect(
        onDisk,
        '第二套枚举没数到目录里的 SVG —— 夹具本身坏了，这条守卫会空转',
      ).toEqual(['u2-apple', 'u2-ball', 'u2-kite'])

      const missing = onDisk.filter((id) => !logged.has(id))
      expect(
        missing,
        `log 没有覆盖目录里的这些图：${missing.join('、')} —— ` +
          '漏记的图在产能模型里等于「不存在」，产出会被算成偏低',
      ).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

// ── G183 ─────────────────────────────────────────────────────────────────────

describe('G183 —— 需配图词条占比 = 实算值 = §8 记录的值（AC A1）', () => {
  it('实算比例与 §8 里记的那一串逐字一致', () => {
    const unit = JSON.parse(readFileSync(UNIT_JSON_PATH, 'utf8')) as {
      entries?: { card?: { kind?: string } }[]
    }
    expect(
      Array.isArray(unit.entries),
      '单元 1 的 JSON 里读不到 entries —— 内容层的形状变了，这条守卫会算出 NaN 而不是报错',
    ).toBe(true)
    const entries = unit.entries ?? []
    const wordCards = entries.filter((entry) => entry.card?.kind === 'word').length
    const total = entries.length
    expect(
      total,
      '单元 1 读出 0 条词条 —— 路径指错了，这条守卫会拿 0/0 当比例',
    ).toBeGreaterThan(0)

    const percent = ((wordCards / total) * 100).toFixed(2)
    const expected = `${wordCards} / ${total} = ${percent}%`

    const raw = readFileSync(DOC_PATH, 'utf8')

    // ⚠️ R-53：判据写完先自测一次 —— 标记串在真实文档上必须命中。
    expect(
      raw.includes(expected),
      `§8 里找不到实算比例 "${expected}" —— 决策文档记的比例与内容层实算对不上，` +
        '决策基数已经悄悄漂移（要么改 §8，要么改内容，两边必须同步）',
    ).toBe(true)
  })

  it('§8 里记的比例确实是「需配图词条 ÷ 全部词条」，不是别的算法', () => {
    const unit = JSON.parse(readFileSync(UNIT_JSON_PATH, 'utf8')) as {
      entries?: { card?: { kind?: string } }[]
    }
    const entries = unit.entries ?? []
    const wordCards = entries.filter((entry) => entry.card?.kind === 'word').length
    const total = entries.length
    const raw = readFileSync(DOC_PATH, 'utf8')

    // 单词卡 100% 配图、另两种卡型 0% 配图（schema 级强制）⇒ 需配图词条 = 单词卡数
    expect(
      wordCards,
      '单元 1 里没有单词卡 —— 「需配图词条 = 单词卡数」这条前提不成立了，本守卫的算法要重定',
    ).toBeGreaterThan(0)
    expect(
      wordCards < total,
      '单元 1 的全部词条都是单词卡 —— 配图比例恒为 100%，这条守卫就退化成恒绿',
    ).toBe(true)
    expect(
      raw.includes(`${total}`),
      `§8 里找不到词条总数 ${total} —— 决策文档连分母都没记，比例无从复核`,
    ).toBe(true)
  })
})

// ── G184 ─────────────────────────────────────────────────────────────────────

describe('G184 —— §8 里估算基数与实测基数同时在场，估算那条被显式标为作废', () => {
  /** §8 的正文（从 §8 的标题开始到文末）。 */
  function section8(raw: string): string {
    const at = raw.indexOf('# §8')
    expect(
      at,
      '决策文档里找不到 §8 —— 决策记录没落进项目知识库，AC C5 不成立',
    ).toBeGreaterThanOrEqual(0)
    return raw.slice(at)
  }

  it('「估算基数（已作废）」与「实测基数」两个标记串都在 §8 里', () => {
    const raw = readFileSync(DOC_PATH, 'utf8')
    const section = section8(raw)

    // ⚠️ R-53：判据用 `String.includes()` 精确匹配，**不用正则**
    //    （词边界判据在中文标点上会失配）。
    expect(
      section.includes('估算基数（已作废）'),
      '§8 里没有「估算基数（已作废）」这个标记串 —— 作废这件事没有被显式写出来，' +
        '读者（和下一个 story）仍可能把 200-400 张当成有效估算引用',
    ).toBe(true)
    expect(
      section.includes('实测基数'),
      '§8 里没有「实测基数」这个标记串 —— 实测值与估算值没有并排在场，' +
        '读者看不出哪个是结论、哪个是历史包袱',
    ).toBe(true)
  })

  it('没有任何一条「估算基数」是**加粗的结论条目**（加粗 = 把它当成有效结论摆出来）', () => {
    const raw = readFileSync(DOC_PATH, 'utf8')
    const section = section8(raw)

    // ⚠️ **判据只咬「加粗的结论条目」形态**（`**估算基数**`），不咬正文里的散见。
    //   §8 里逐字引用 GDD 的那句话（「用实测比例替换本估算基数」是 GDD 原文）
    //   必须原样保留 —— 改引文比漏标更糟。
    //   而「**未加粗的**散见」恰恰是**在讲这个估算已经作废**（例如
    //   「不许再把 200-400 张当估算基数引用」）。
    const unmarkedBullets = section.split('**估算基数**').length - 1
    expect(
      unmarkedBullets,
      `§8 里有 ${unmarkedBullets} 处加粗的「**估算基数**」结论条目没被标作废 —— ` +
        '加粗意味着它是当结论摆出来的，没标作废就会被当成有效数字继续引用',
    ).toBe(0)

    const markedBullets = section.split('**估算基数（已作废）**').length - 1
    expect(
      markedBullets,
      '§8 里没有加粗的「**估算基数（已作废）**」结论条目 —— 作废这件事没有被摆到结论层，' +
        '读者（和下一个 story）可能只读到散见的提及',
    ).toBeGreaterThan(0)
  })

  it('作废的估算指向的是 GDD 那个「200-400 张」，且 §8 里给出了实测替代', () => {
    const raw = readFileSync(DOC_PATH, 'utf8')
    const section = section8(raw)
    expect(
      section.includes('200-400 张'),
      '§8 的作废条目里没有点名「200-400 张」—— 作废的是哪一个估算说不清楚',
    ).toBe(true)
    expect(
      section.includes('81.08%'),
      '§8 里没有实测配图比例 81.08% —— 作废了估算却没有给替代值，读者无从接手',
    ).toBe(true)
  })
})
