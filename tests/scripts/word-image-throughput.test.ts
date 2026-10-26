/**
 * 词图产能测量守卫 G180 – G184（Story 2.1 / AC D1–D5、T3）。
 *
 * ── 守什么 ────────────────────────────────────────────────────────────────
 * · **G180** —— 产能日志每条记录字段齐全、**单图记录 mtime 单调不减**（[CR] P13：原标题
 *   「时间戳单调不减」大于实守范围）、`sha256` 与磁盘内容一致；`violations` / `tier` /
 *   `elementCount` 口径有真断言（[CR] P7/P8/P28：此前这三条路径改坏全绿）；
 *   坏日志行报行号、坏图不瘫痪整批（[CR] P5）。
 * · **G181** —— `report` 的算术对着**手算夹具**算对（耗时 / 中位数 / 分位数 / 版本数分布），
 *   含 `quantile` 的 n≤1 边界分支（[CR] P6：此前测试不可达）与 `formatReport` 冒烟。
 * · **G182** —— **覆盖面**：log 覆盖实验目录内**全部** SVG（用**第二套枚举**核对）、
 *   log 无幽灵记录（反向检查，[CR] P11）；真实日志重算 report = **§8.2.3 黄金值**
 *   （[CR] D3/X1 定稿：此前删真实返工记录 / 加幽灵 / mtime 回拨三种篡改全部 12/12 绿）。
 * · **G183** —— 需配图词条占比 = 实算值，且与 §8 记录的数字一致（= AC A1）。
 *   [CR] P1：两条断言都在 **§8 切片**内查（此前查全文，§7 表格里的 `21:37:18` 就能喂饱
 *   `includes('37')`，第二条断言恒真）。
 * · **G184** —— §8 里「估算基数」与「实测基数」**同时在场**，且估算那条**被显式标为作废**。
 *   [CR] P9/P10：判据改「加粗前缀计数相等」（堵变体拼写绕过）与「作废条目**自身切片**内
 *   点名 200-400 张」（此前是两个互相独立的全文 includes，GDD 引文就能顶替）。
 * · **§8 切片锚定行首标题、切到下一个行首一级标题为止，不假设 §8 是最后一节**
 *   （[CR] P2/B13：原 `raw.indexOf('# §8')` + `slice(at)` 在未来出现 §9 后可被 §9 文字满足）。
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

/**
 * 一张**实算三项全违规**的词图（[CR] P7：此前没有任何用例喂过违规 SVG，
 * `findViolations` 改成恒 `return []` 都 12/12 全绿）。
 * geometric 档区间 60–75%：本图占比 440/512 = 85.9%（§5.1 违规）、
 * 贴左上角 ⇒ 留白 0px < 30.72px（§5.2 违规）、bbox 中心 (220,220) 偏移 36px > 30.72px（§5.3 违规）。
 */
function violatingSvg(): string {
  return [
    '<!-- 构图档位：geometric -->',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">`,
    `  <rect x="0" y="0" width="440" height="440" fill="#e5534b"/>`,
    `</svg>`,
    '',
  ].join('\n')
}

/**
 * 一张含 `<g>` 的合规图（[CR] P28：钉住 `countElements` 的黄金口径
 * 「**含 `<g>`、不含 `<svg>`**」= §1.2 的口径。此前把口径改成「不含 `<g>`」12/12 全绿）。
 * 期望 `elementCount = 2`（g + rect），`violations = []`（320/512 = 62.5% ∈ [60,75]，留白 96px，偏移 0）。
 */
function groupedSvg(): string {
  return [
    '<!-- 构图档位：geometric -->',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">`,
    `  <g fill="#e5534b">`,
    `    <rect x="96" y="96" width="320" height="320"/>`,
    `  </g>`,
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

// ── §8 切片与条目切片（[CR] P2 / P10；G183 与 G184 共用） ─────────────────────

/** §8 的一级标题前缀。R-53：判据用字符串法，不用正则。 */
const SECTION8_HEADING_PREFIX = '# §8'

/**
 * 切出 §8 正文：锚定**行首一级标题**（`# §8` 或 `# §8 …`；`## §8`、`# §80` 都不算），
 * 切到下一个行首一级标题或文末 —— **不假设 §8 是最后一节**。
 *
 * [CR] P2（B13）：原实现 `raw.indexOf('# §8')` 是子串搜索且 `slice(at)` 切到文末，
 * 未来加 §9 后，G184 的标记串可被 §9 的文字满足（反向也成立：更正挪进 §9 会让过时的 §8 恒绿）。
 */
function section8(raw: string): string {
  const lines = raw.split('\n')
  const start = lines.findIndex(
    (line) =>
      line.startsWith(SECTION8_HEADING_PREFIX) &&
      (line.length === SECTION8_HEADING_PREFIX.length ||
        line.startsWith(' ', SECTION8_HEADING_PREFIX.length)),
  )
  expect(
    start,
    '决策文档里找不到行首的「# §8」标题 —— 决策记录没落进项目知识库（AC C5 不成立），或 §8 被改名/降级',
  ).toBeGreaterThanOrEqual(0)
  let end = lines.length
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i].startsWith('# ')) {
      end = i
      break
    }
  }
  return lines.slice(start, end).join('\n')
}

/**
 * 切出包含 `marker` 的**列表条目自身**：从含 marker 的行起，到下一个行首 `- ` 或行首 `#` 前为止。
 * 用于「条目自身必须点名某内容」的检查，不被全文别处的出现顶替（[CR] P10/E12）。
 */
function bulletOf(section: string, marker: string): string {
  const lines = section.split('\n')
  const start = lines.findIndex((line) => line.includes(marker))
  expect(
    start,
    `§8 里找不到包含「${marker}」的条目 —— 守卫的标记串失效了，先同步修文档与本用例`,
  ).toBeGreaterThanOrEqual(0)
  let end = lines.length
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i].startsWith('- ') || lines[i].startsWith('#')) {
      end = i
      break
    }
  }
  return lines.slice(start, end).join('\n')
}

// ── G180 ─────────────────────────────────────────────────────────────────────

describe('G180 —— 产能日志：字段齐全 / 单图记录 mtime 单调不减 / sha256 与磁盘一致', () => {
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
          // [CR] P4（B16）：原消息说「体积也是『跳过』判据的一部分」—— 实现只比 sha256
          // （sha 相同 ⇒ 内容相同 ⇒ bytes 必同）。消息指错字段，查假跳过的人会被带偏。
          `记录 ${record.entryId} 的字节数与磁盘对不上 —— bytes 与内容错位，说明记录过程有 bug` +
            '（注意：「同内容跳过」判据本身只比 sha256，bytes 是记账与交叉核对字段）',
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

  // ⚠️ [CR] P7+P8+P28（B1/B10/B17，全部变异实测坐实过假绿）：
  //   此前 (a) `findViolations` 改恒 `return []`、(b) tier 改从**剥注释后**的原文读、
  //   (c) `countElements` 口径改「不含 `<g>`」—— 三种改坏都 12/12 全绿。
  it('违规图记下三项违规、合规图记下空违规、档位从原文注释读出、元素数口径含 <g> 不含 <svg>', () => {
    const dir = makeTmpDir('w180c-')
    try {
      writeFileSync(join(dir, 'u2-bad.svg'), violatingSvg(), 'utf8')
      writeFileSync(join(dir, 'u2-grouped.svg'), groupedSvg(), 'utf8')
      pinMtime(join(dir, 'u2-bad.svg'), 1_700_000_000_000)
      pinMtime(join(dir, 'u2-grouped.svg'), 1_700_000_000_000)

      const logPath = join(dir, 'versions.jsonl')
      throughput.appendSnapshot(dir, logPath)
      const records = throughput.readLog(logPath)
      const bad = records.find((r) => r.entryId === 'u2-bad')
      const grouped = records.find((r) => r.entryId === 'u2-grouped')
      if (bad === undefined || grouped === undefined) {
        throw new Error('夹具没进日志 —— appendSnapshot 丢了文件')
      }

      // [CR] P7：violations 必须有真断言 —— 「实算超标是机器可读的」这个卖点
      //   （u1-goodbye v3 的教训）此前没人守。
      expect(
        bad.violations.length,
        '违规图三项全超标（85.9% / 0px / 36px）而 violations 为空 —— findViolations 空转，' +
          '「实算超标机器可读」失效',
      ).toBe(3)
      expect(
        bad.violations.some((v) => v.includes('§5.1')),
        `violations 缺 §5.1 占比项：${JSON.stringify(bad.violations)}`,
      ).toBe(true)
      expect(
        bad.violations.some((v) => v.includes('§5.2') && v.includes('30.72px')),
        'violations 缺 §5.2 留白项，或没带由常量派生的下限 30.72px（= 6% × 512，R-56：不写死字面值）',
      ).toBe(true)
      expect(
        bad.violations.some((v) => v.includes('§5.3')),
        `violations 缺 §5.3 重心项：${JSON.stringify(bad.violations)}`,
      ).toBe(true)
      expect(
        grouped.violations,
        '合规夹具的 violations 非空 —— 要么夹具漂了、要么 TIER_EDGE_RANGES 收紧了（B17：' +
          '「实算合规」这个不变量此前从未被检查，夹具与守卫会反向漂移）',
      ).toEqual([])

      // [CR] P8：档位必须从**未剥注释**的原文读（档位声明就住在注释里）。
      expect(
        grouped.tier,
        'tier 读出 null —— 最可能是实现改成了剥注释后再读（代码注释明令禁止的错法）',
      ).toBe('geometric')
      expect(bad.tier, '同上，违规图的 tier 也应从原文注释读出').toBe('geometric')

      // [CR] P28：countElements 黄金口径 =「含 <g>、不含 <svg>」（§1.2）。
      //   `grouped = svg > g > rect` ⇒ 2（`g` + `rect`）。
      expect(
        grouped.elementCount,
        '元素数不是 2（g + rect，不含 svg）—— §1.2 的黄金口径漂了（改成不含 <g> 会得 1，含 <svg> 会得 3）',
      ).toBe(2)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  // [CR] P5（B12/E3/E13）：坏日志行此前是**无行号的裸 SyntaxError**，且 appendSnapshot
  //   也读同一份日志 ⇒ 一处坏、整个工具永久瘫痪；缺 entryId/mtimeMs 的记录此前能一路
  //   混进 report（padEnd 裸 TypeError / 比较器 NaN 排序未定义）。
  it('坏日志行报「哪个文件第几行」，缺字段的记录进不了 report', () => {
    const dir = makeTmpDir('w180d-')
    try {
      const logPath = join(dir, 'versions.jsonl')
      writeFileSync(
        logPath,
        `${JSON.stringify(fixtureRecord('u2-apple', 1_000_000, 'geometric'))}\n{坏掉的 json\n`,
        'utf8',
      )
      let message = ''
      try {
        throughput.readLog(logPath)
      } catch (error) {
        message = error instanceof Error ? error.message : String(error)
      }
      expect(
        message.includes('第 2 行'),
        `坏行没报行号 —— 修日志的人得自己数行。实际报错：${message || '（没抛）'}`,
      ).toBe(true)
      expect(message.includes(logPath), '报错没说坏的是哪个日志文件').toBe(true)

      const logPath2 = join(dir, 'bad-field.jsonl')
      writeFileSync(logPath2, '{"file":"x.svg"}\n', 'utf8')
      let message2 = ''
      try {
        throughput.readLog(logPath2)
      } catch (error) {
        message2 = error instanceof Error ? error.message : String(error)
      }
      expect(
        message2.includes('entryId'),
        `缺 entryId 的记录没被拦下 —— 它会在 formatReport 里炸成裸 TypeError。实际报错：${
          message2 || '（没抛）'
        }`,
      ).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  // [CR] P5（E3/M6）：末行无换行时直接 appendFileSync 会拼出 `}{` 垃圾行 —— 好记录跟着一起丢。
  it('日志末行缺换行符时，追加不拼出垃圾行', () => {
    const dir = makeTmpDir('w180e-')
    try {
      writeFileSync(join(dir, 'u2-apple.svg'), compliantSvg('geometric'), 'utf8')
      pinMtime(join(dir, 'u2-apple.svg'), 1_700_000_000_000)
      const logPath = join(dir, 'versions.jsonl')
      // 手工造一份**末行无换行**的日志（模拟被截断的写入或外部编辑）
      writeFileSync(
        logPath,
        JSON.stringify({ ...fixtureRecord('u2-old', 999_000_000, 'geometric'), file: 'u2-old.svg' }),
        'utf8',
      )

      throughput.appendSnapshot(dir, logPath)
      const records = throughput.readLog(logPath)
      expect(
        records.length,
        '追加拼在了无换行的末行上形成 `}{` 垃圾行 —— 一条坏行会让整份日志读不出来',
      ).toBe(2)
      expect(records.map((r) => r.entryId).sort(), '两条记录的 entryId 不对').toEqual([
        'u2-apple',
        'u2-old',
      ])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  // [CR] P5（B8/E10b）：此前一张坏 SVG 让 buildRecord 抛错 ⇒ 整批好图的记录**一条都不落盘**，
  //   且每次重跑都同样崩。不得静默丢实体：好图照常入册，坏图必须登记并大声报。
  it('一张坏 SVG 不瘫痪整批：好图照常入册，坏图登记进 failed', () => {
    const dir = makeTmpDir('w180f-')
    try {
      writeFileSync(join(dir, 'u2-good.svg'), compliantSvg('geometric'), 'utf8')
      writeFileSync(join(dir, 'u2-broken.svg'), '', 'utf8') // 空文件：measureWordImage 抛错
      pinMtime(join(dir, 'u2-good.svg'), 1_700_000_000_000)

      const logPath = join(dir, 'versions.jsonl')
      const result = throughput.appendSnapshot(dir, logPath)
      expect(
        result.appended,
        '坏图瘫痪了整批 —— 好图的记录也没落盘（旧行为：每次重跑都同样崩）',
      ).toBe(1)
      expect(
        result.failed.length,
        '坏图没有登记进 failed —— 静默丢实体是本仓库明令禁止的形态',
      ).toBe(1)
      expect(result.failed[0]?.file, 'failed 里登记的不是那张坏图').toBe('u2-broken.svg')
      expect(
        throughput.readLog(logPath).map((r) => r.entryId),
        '好图没进日志',
      ).toEqual(['u2-good'])
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

  // [CR] P6（B10c）：这两个分支此前在测试里**不可达**（所有夹具 n≥2），
  //   把 `n=1` 分支改成返回 NaN 都 12/12 全绿。
  it('quantile 边界：空数组返回 NaN，n=1 返回唯一值', () => {
    expect(
      Number.isNaN(throughput.quantile([], 0.5)),
      '空数组不返回 NaN —— 空报告的分位数应当是诚实的 NaN，不是 0 也不是抛错',
    ).toBe(true)
    expect(throughput.quantile([42], 0.25), 'n=1 时 P25 应返回唯一值').toBe(42)
    expect(throughput.quantile([42], 0.5), 'n=1 时中位数应返回唯一值').toBe(42)
    expect(throughput.quantile([42], 0.75), 'n=1 时 P75 应返回唯一值').toBe(42)
  })

  // [CR] P28（B10 附带）：formatReport 此前零执行 —— CLI 的文本路径没人守。
  it('formatReport 渲染出样本数与中位数（冒烟）', () => {
    const dir = makeTmpDir('w181d-')
    try {
      const records: ThroughputRecord[] = [
        fixtureRecord('u2-apple', 1_000_000, 'geometric'),
        fixtureRecord('u2-apple', 1_010_000, 'geometric'),
        fixtureRecord('u2-ball', 2_000_000, 'abstract'),
        fixtureRecord('u2-ball', 2_020_000, 'abstract'),
      ]
      const logPath = join(dir, 'versions.jsonl')
      writeFileSync(logPath, `${records.map((r) => JSON.stringify(r)).join('\n')}\n`, 'utf8')
      const text = throughput.formatReport(throughput.buildReport(throughput.readLog(logPath)))
      expect(text.includes('样本 2 张'), 'formatReport 没渲染样本数').toBe(true)
      // 手算：耗时 10 / 20 ⇒ 中位数 = 10 + 0.5 × (20 − 10) = 15
      expect(text.includes('中位数 15.0 s'), 'formatReport 没渲染中位数（手算 15.0）').toBe(true)
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

  // ⚠️ 上面的用例只对着 `mkdtempSync` 的合成夹具跑。本 story 的实验目录
  //   `docs/word-image-lab/` 里躺着 4 张**真画出来的**图 —— 它们才是这条守卫要守的对象。
  //   合成夹具里全是 `compliantSvg()` 生成的规整文件，而真实图有三个夹具造不出来的情况：
  //   重复的 entryId（一个图有多条记录）、文件名排序差异，
  //   以及**末版记录可能与磁盘现内容对不上**（改了图忘了再 snapshot）。
  it('真实实验目录：每张图入册、无幽灵记录、末版哈希=磁盘、tier=头注释声明、重算 report = §8.2.3 黄金值', () => {
    const dir = join(root, 'docs/word-image-lab')

    // 先证这条用例非空转：真实目录必须存在且确有图。
    // 少了这一句，哪天 `docs/word-image-lab/` 被清空，本用例会静悄悄全绿。
    // [CR] P12（B14）：注释说「躺着 4 张真画出来的图」，判据却是 >=3 ——
    //   删掉一张真实样本守卫静默变窄仍绿。改成与注释一致的 >=4。
    const onDisk = readdirSync(dir)
      .filter((name) => name.endsWith('.svg'))
      .map((name) => name.replace(/\.svg$/, ''))
      .sort()
    expect(
      onDisk.length,
      'docs/word-image-lab/ 里的 SVG 少于 4 张 —— 本 story 的实画样本被删了，这条守卫正在变窄',
    ).toBeGreaterThanOrEqual(4)

    // ⚠️ **只读，不追加**：这里不调 `appendSnapshot()`。
    //   守卫不该有副作用 —— 它一旦往仓库里写 log，跑一次测试就多一个版本，
    //   逐张耗时会被守卫自己污染。
    // ⚠️ 绿色的前提是有人跑过会写仓库的 CLI —— 「守卫无副作用」与「守卫依赖
    //   带副作用的工具被跑过」是两件事（[CR] B14 附注）。
    const logged = throughput.readLog(join(dir, 'versions.jsonl'))
    const lastById = new Map<string, ThroughputRecord>()
    for (const record of logged) lastById.set(record.entryId, record)

    const missing = onDisk.filter((id) => !lastById.has(id))
    expect(
      missing,
      `实验目录里这些图没有入册：${missing.join('、')} —— 没入册的图在产能模型里等于不存在`,
    ).toEqual([])

    // [CR] P11（E6）：**反向**检查 —— log 里的每个 entryId 必须在磁盘上有图。
    //   此前只查「磁盘有、log 无」，幽灵记录能把「样本 4 张」静默变成 5 张。
    const ghosts = [...new Set(logged.map((r) => r.entryId))].filter((id) => !onDisk.includes(id))
    expect(
      ghosts,
      `log 里这些 entryId 在磁盘上没有对应的图（幽灵记录）：${ghosts.join('、')} —— ` +
        '样本数被灌水，§8.2.3 的黄金值全部失守',
    ).toEqual([])

    // R-59：验哈希，不是验存在。「文件在」不等于「文件对」——
    // 0 字节的图、改了图忘了再 snapshot，都在这里被抓出来。
    const stale = onDisk.filter((id) => {
      const record = lastById.get(id)
      if (record === undefined) return true
      const actual = createHash('sha256')
        .update(readFileSync(join(dir, `${id}.svg`), 'utf8'), 'utf8')
        .digest('hex')
      return record.sha256 !== actual
    })
    expect(
      stale,
      `这些图的末版记录与磁盘现内容对不上（改了图没重新 snapshot）：${stale.join('、')}`,
    ).toEqual([])

    // [CR] P8：log 里的 tier 必须非 null 且与磁盘文件头注释的声明一致
    //   （防篡改 log 的 tier 字段；也防实现回归成「剥注释后读档位」→ 全 null）。
    for (const id of onDisk) {
      const record = lastById.get(id)
      expect(
        record?.tier,
        `${id} 的末版记录 tier 为 null —— 档位声明住在头注释里，null 说明声明丢了或读法错了`,
      ).not.toBeNull()
      const rawSvg = readFileSync(join(dir, `${id}.svg`), 'utf8')
      expect(
        rawSvg.includes(`构图档位：${record?.tier}`),
        `${id} 的 log tier（${record?.tier}）与磁盘头注释声明对不上 —— log 被改过，或图被换过`,
      ).toBe(true)
    }

    // [CR] D3（X1 定稿）：log 内同一 entry 的记录按记录序 mtime 单调不减 ——
    //   末条回拨（L3 类篡改）会让首版晚于末版、耗时凭空膨胀。
    const byEntry = new Map<string, ThroughputRecord[]>()
    for (const record of logged) {
      const list = byEntry.get(record.entryId) ?? []
      list.push(record)
      byEntry.set(record.entryId, list)
    }
    for (const [id, list] of byEntry) {
      for (let i = 1; i < list.length; i += 1) {
        expect(
          list[i].mtimeMs,
          `${id} 在 log 里第 ${i + 1} 条记录的 mtime 早于上一条 —— 首版/末版会认错，耗时算出来是错的`,
        ).toBeGreaterThanOrEqual(list[i - 1].mtimeMs)
      }
    }

    // [CR] D3（X1 定稿，2026-10-20）：用真实 log 重算 report，与 §8.2.3 的黄金值逐个比对。
    //   此前删真实返工记录（L1）/ 加幽灵记录（L2）/ 末条 mtime 回拨（L3）三种篡改
    //   **全部 12/12 绿** —— 决策链的根数字（中位 146.8 s）零钉住。
    //   黄金值出处：§8.2.3 贴的 report 真实输出（`npm run word-image-throughput -- report …`）。
    //   日志或算法任何一边变 ⇒ 这里必须红 ⇒ 强迫 log / 本测试 / §8.2.3 三方同步改。
    const report = throughput.buildReport(logged)
    const summary = new Map(report.entries.map((e) => [e.entryId, e]))
    expect(
      report.throughput.sampleSize,
      '样本数不是 4 —— §8.2.3「样本 4 张」失守（图被增删，或 log 混进幽灵记录）',
    ).toBe(4)
    const GOLDEN: Record<string, { duration: string; versions: number }> = {
      'u2-egg': { duration: '204.4', versions: 2 },
      'u2-sun': { duration: '0.0', versions: 1 },
      'u2-ice-cream': { duration: '89.1', versions: 3 },
      'u2-playground': { duration: '261.9', versions: 4 },
    }
    for (const [id, golden] of Object.entries(GOLDEN)) {
      const entry = summary.get(id)
      if (entry === undefined) {
        throw new Error(`§8.2.3 黄金值对不上：report 里没有 ${id} —— 它的记录被删了`)
      }
      expect(
        entry.durationSeconds.toFixed(1),
        `${id} 的耗时 ≠ §8.2.3 黄金值 ${golden.duration} s —— log 被篡改，或 buildReport 算法漂了`,
      ).toBe(golden.duration)
      expect(
        entry.versionCount,
        `${id} 的版本数 ≠ §8.2.3 黄金值 ${golden.versions} —— 真实返工记录被删，或重复记录被加`,
      ).toBe(golden.versions)
    }
    expect(
      report.throughput.medianSeconds.toFixed(1),
      '中位数 ≠ §8.2.3 黄金值 146.8 s —— 这是整条决策链的根数字（§8.4 实测口径列由它算出）',
    ).toBe('146.8')
    expect(report.throughput.p25Seconds.toFixed(1), 'P25 ≠ §8.2.3 黄金值 66.9 s').toBe('66.9')
    expect(report.throughput.p75Seconds.toFixed(1), 'P75 ≠ §8.2.3 黄金值 218.8 s').toBe('218.8')
    expect(report.throughput.minSeconds.toFixed(1), '最小值 ≠ §8.2.3 黄金值 0.0 s').toBe('0.0')
    expect(report.throughput.maxSeconds.toFixed(1), '最大值 ≠ §8.2.3 黄金值 261.9 s').toBe('261.9')
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
    // [CR] P1（B5/E11）：此前在**整份** raw 里查，失败消息却写「§8 里找不到」——
    //   §7 表格里的 `21:37:18` 之类就能喂饱宽断言。统一改在 §8 切片内查。
    const section = section8(raw)

    // ⚠️ R-53：判据写完先自测一次 —— 标记串在真实文档上必须命中。
    expect(
      section.includes(expected),
      `§8 切片里找不到实算比例 "${expected}" —— 决策文档记的比例与内容层实算对不上，` +
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
    const section = section8(raw)

    // 单词卡 100% 配图、另两种卡型 0% 配图（schema 级强制）⇒ 需配图词条 = 单词卡数
    expect(
      wordCards,
      '单元 1 里没有单词卡 —— 「需配图词条 = 单词卡数」这条前提不成立了，本守卫的算法要重定',
    ).toBeGreaterThan(0)
    expect(
      wordCards < total,
      '单元 1 的全部词条都是单词卡 —— 配图比例恒为 100%，这条守卫就退化成恒绿',
    ).toBe(true)
    // [CR] P1：原断言 `raw.includes('37')` 恒真 —— 它被第一条断言蕴含
    //   （比例串本身含 37），且全文任何数字/时间戳都能满足，逻辑上不可能独立失败。
    //   改成有判别力的语义断言：§8 必须以「N 词条」（分母 = 全部词条数）与
    //   「M 图」（分子 = 需配图词条数）记录比例的**两个操作数**，
    //   两条断言互相不蕴含（比例串对但单元结构记错 → 只有这里红）。
    expect(
      section.includes(`${total} 词条`),
      `§8 切片里没有「${total} 词条」—— 分母没按「全部词条数」的语义记录，比例无从核对`,
    ).toBe(true)
    expect(
      section.includes(`${wordCards} 图`),
      `§8 切片里没有「${wordCards} 图」—— 分子没按「需配图词条数」的语义记录，比例无从核对`,
    ).toBe(true)
  })
})

// ── G184 ─────────────────────────────────────────────────────────────────────

describe('G184 —— §8 里估算基数与实测基数同时在场，估算那条被显式标为作废', () => {
  // [CR] P2：§8 切片函数已上移为 G183/G184 共用的 `section8()`（锚定行首标题、
  //   不假设 §8 是最后一节）。原局部实现 `raw.indexOf('# §8')` + `slice(at)` 两个假设都不成立。

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

    // ⚠️ **判据只咬「加粗的结论条目」形态**，不咬正文里的散见。
    //   §8 里逐字引用 GDD 的那句话（「用实测比例替换本估算基数」是 GDD 原文）
    //   必须原样保留 —— 改引文比漏标更糟。
    //   而「**未加粗的**散见」恰恰是**在讲这个估算已经作废**（例如
    //   「不许再把 200-400 张当估算基数引用」）。
    // [CR] P9（B6）：原判据只咬 `**估算基数**` 一种精确拼写 —— 写成 `**估算基数：**`、
    //   `**估算基数（补充）**` 都能绕过，而绕过形态恰是它声称要防的「把估算当结论摆出来」。
    //   改成**前缀计数**：任何加粗的「**估算基数…」出现次数必须等于标了作废的次数。
    //   R-53：字符串 split 计数，不用正则。
    const boldedTotal = section.split('**估算基数').length - 1
    const markedBullets = section.split('**估算基数（已作废）**').length - 1
    expect(
      boldedTotal,
      `§8 里有 ${boldedTotal - markedBullets} 处加粗的「**估算基数…」条目没被标作废` +
        `（加粗共 ${boldedTotal} 处，标「（已作废）」的 ${markedBullets} 处）—— ` +
        '加粗意味着它是当结论摆出来的，任何拼写变体都算',
    ).toBe(markedBullets)

    expect(
      markedBullets,
      '§8 里没有加粗的「**估算基数（已作废）**」结论条目 —— 作废这件事没有被摆到结论层，' +
        '读者（和下一个 story）可能只读到散见的提及',
    ).toBeGreaterThan(0)
  })

  it('作废条目**自身**点名「200-400 张」，实测基数条目**自身**给出实测替代值', () => {
    const raw = readFileSync(DOC_PATH, 'utf8')
    const section = section8(raw)
    // [CR] P10（E12）：原用例是两个**互相独立**的全文 includes —— §8.1.2 的 GDD 引文
    //   本来就含「200-400 张」，把作废条目改写成「200 至 400 张」仍 12/12 全绿。
    //   现在改成在**条目自身的切片**里查：别处的出现不能顶替。
    const deprecated = bulletOf(section, '**估算基数（已作废）**')
    expect(
      deprecated.includes('200-400 张'),
      '作废条目自身没有点名「200-400 张」—— 作废的是哪一个估算说不清楚' +
        '（GDD 引文里的出现不算，它不是作废条目）',
    ).toBe(true)
    const measured = bulletOf(section, '**实测基数**')
    expect(
      measured.includes('81.08%'),
      '实测基数条目自身没有给出实测比例 81.08% —— 作废了估算却没有给替代值，读者无从接手',
    ).toBe(true)
  })
})
