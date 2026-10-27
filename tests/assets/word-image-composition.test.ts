/**
 * 词图构图守卫 G11 / G12 / G13（Story 1.9 / AC-5、AC-6、T3）。
 *
 * ── 守什么 ────────────────────────────────────────────────────────────────
 * `art-direction.md` §5.1 / §5.2 / §5.3 —— 词图的主体占画布比例、四边最小留白、
 * 外接框重心。三条判据的算法全部来自 `scripts/word-image-metrics.ts`，
 * **本文件不另写一份几何代码**。
 *
 * ── 为什么这么写 ────────────────────────────────────────────────────────────
 * · **覆盖面用两套互不相干的枚举求差集**（磁盘 `readdirSync` ↔ 内容 JSON 的应然集），
 *   不用「数组长度 == 30」这种来自同一个数据源的断言。
 *   ⚠️ Story 1.8 的 `[CR]` 抓过两条**构造上恒真的假绿**：G8 的反向断言
 *   （数据源就是 `...ALL_ASSETS` 展开，差集按构造恒空）与 G10 的「有重复计数」
 *   （来自一次 `readdirSync`）。本文件不得重蹈。
 * · **档位读不到就报错，不静默跳过**。「少读几张就在剩下的图上恒绿」
 *   正是 G10 在 `<defs>+<use>` 上被绕过的形态（`1-8-…md:311`）。
 * · **每条守卫都配一次变异**（M31–M33），改动只在 `mkdtempSync` 的副本上做，
 *   **绝不改仓库磁盘** —— vitest 并行跑，改真实磁盘会让无关断言撞上这个临时状态。
 *   每次变异还原后校验 md5：1.8 只做了行为证据没做哈希证据，被 `[CR]` 如实降级，
 *   本 story 不重复这个欠账（AC-5 最后一条）。
 * · **§5.5 / §5.6 刻意不建守卫** —— 机器分不清「主轮廓」与「嘴 / 眉毛 / 装饰性粗笔」，
 *   硬写就是 `art-direction.md:512` 警告的「守的是错的东西」。**不许为了凑 ✅ 加一条。**
 */

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { loadUnitFiles, expectedImageUrl } from '../../scripts/validate-content'
import {
  CANVAS_SIZE,
  CENTER_TOLERANCE_PERCENT,
  COMPOSITION_TIERS,
  MIN_PADDING_PERCENT,
  TIER_EDGE_RANGES,
  measureWordImage,
  measureWordImageFile,
  readCompositionTier,
  type CompositionTier,
  type WordImageMetrics,
} from '../../scripts/word-image-metrics'

const root = fileURLToPath(new URL('../../', import.meta.url))
const wordsDir = join(root, 'public/assets/words')
const unitDir = join(wordsDir, 'unit-01')
const unit2Dir = join(wordsDir, 'unit-02')

/**
 * 词图的**黄金值夹具**目录 —— `[CR]` 钉死过实算值的 5 张旧词图搬到了这里。
 *
 * ⚠️ **为什么需要它**：Story 2.10 换源后，`public/assets/words/` 下只剩当前交付的
 *   6 张（单元 1 两张 + 单元 2 四张），旧的 60 张自建词表词图已全部删除。
 *   而变异用例需要一个**稳定的、可反复施加变异的底图**：
 *   · 真实交付的那 6 张是**内容资产**，不该被变异用例「理所当然地」当成 playground；
 *   · 但把变异全搬进夹具目录，又会**丢掉「守卫仍覆盖真实交付」这一层**。
 *   ⇒ 两个来源都保留：`sourceDir` 参数决定读哪一个，
 *     M31–M33 用夹具（黄金值稳定、形态已知），M34 / M35 用真实交付的那几张。
 */
const fixtureDir = join(root, 'tests/fixtures/word-images')

/** §5.2 / §5.3 的下限换算成 px —— 从脚本里的百分比常量算，不写死像素值。 */
const MIN_PADDING_PX = (MIN_PADDING_PERCENT / 100) * CANVAS_SIZE
const CENTER_TOLERANCE_PX = (CENTER_TOLERANCE_PERCENT / 100) * CANVAS_SIZE

// ── 覆盖面：两套互不相干的枚举 ────────────────────────────────────────────────

/** 枚举一：磁盘上真实存在的词图文件（递归）。 */
function wordImagesOnDisk(): string[] {
  return readdirSync(wordsDir, { recursive: true })
    .map(String)
    .filter((name) => name.endsWith('.svg'))
    .sort()
    .map((name) => join(wordsDir, name))
}

/**
 * 枚举二：内容 JSON 推导出的**应然集**。
 *
 * ⚠️ 它与枚举一**不共享任何数据源**：一个来自文件系统，一个来自内容数据。
 *   两者分叉 ⇒ 有一张图没人守，或有一个词条没有图。
 */
function expectedWordImages(): string[] {
  const unitsDir = join(root, 'src/content/units')
  const out: string[] = []
  for (const { raw } of loadUnitFiles(unitsDir)) {
    const unit = raw as Partial<{
      unitNumber: number
      entries: { entryId: string; card: { options: { imageSrc?: string }[] } }[]
    }>
    // ⚠️ `[CR]` 2026-10-15：这里原来是一句裸 `raw as {...}` —— 一旦内容 JSON 的形状变了，
    //   typecheck 不会拦，下面的 `entry.card.options` 只会在运行时抛
    //   `Cannot read properties of undefined`，报错指向一个与本守卫无关的地方。
    //   改成先收窄再断言：形状不对就当场抛一句说人话的错。
    if (typeof unit.unitNumber !== 'number' || !Array.isArray(unit.entries)) {
      throw new Error(
        `expectedWordImages：内容 JSON 的形状与本守卫预期不符 —— ${JSON.stringify(unit).slice(0, 200)}`,
      )
    }
    for (const entry of unit.entries) {
      if (!Array.isArray(entry?.card?.options)) {
        throw new Error(`expectedWordImages：词条 ${String(entry?.entryId)} 缺 card.options`)
      }
      const needsImage = entry.card.options.some((option) => option.imageSrc !== undefined)
      if (!needsImage) continue
      const url = expectedImageUrl(unit.unitNumber, entry.entryId)
      const rel = url.replace(/^\/assets\/words\//, '')
      out.push(join(wordsDir, rel))
    }
  }
  return out.sort()
}

/** 把一张图的源文本喂给实算脚本。 */
function metricsOf(path: string): WordImageMetrics {
  // ⚠️ `[CR]` 2026-10-15：原来用 `path.split('/').pop()`。路径来自 `join()`，
  //   在 Windows 上分隔符是 `\` ⇒ pop() 返回**整条路径** ⇒ entryId 与文件名对不上，
  //   报错信息全部指向一个不存在的文件。用 `basename` 两边都对。
  return measureWordImage(basename(path, '.svg'), readFileSync(path, 'utf8'))
}

/**
 * 在临时目录里做一次变异：改副本 → 跑断言 → **校验 md5 没动过仓库磁盘** → 还原。
 *
 * ⚠️ 仓库磁盘绝不被写。这不是洁癖：vitest 并行跑同一批测试文件，
 *   真实磁盘上的临时状态会被别的断言读到，失败会指向一个和变异毫无关系的文件。
 *
 * ⚠️ **`sourceDir` 决定底图取自哪里**（Story 2.10 换源后）：
 *   · 真实交付目录 `public/assets/words/unit-01`（单元 1）与 `unit-02`（单元 2）；
 *   · 黄金值夹具目录 `tests/fixtures/word-images`（旧的 60 张词图删除后，
 *     `[CR]` 钉死过实算值的 5 张搬到了那里）。
 *   两个来源都必须能用 —— 守卫既要覆盖真实交付的那几张，
 *   也要有**形态已知、golden 值稳定**的底图来施加变异。
 *
 * ⚠️ **新增的「变异不许是空操作」断言**：变异用例的失败模式有两种
 *   ——「判据该红却没红」（守卫太松）与「变异根本没生效」（用例自己空转）。
 *   后者更隐蔽：锚点一旦因为换源改了而失配，`mutate()` 会**原样返回**，
 *   于是测的还是那张合规图，断言「它违规了」就会红 —— 报错指不到真正的问题。
 *   ⇒ 这里显式断言变异后的文本与原文不同。
 */
function withMutatedWordImage<T>(
  entryId: string,
  mutate: (source: string) => string,
  run: (path: string) => T,
  sourceDir: string = unitDir,
): T {
  const originalPath = join(sourceDir, `${entryId}.svg`)
  const original = readFileSync(originalPath, 'utf8')
  const md5 = (text: string): string => createHash('md5').update(text).digest('hex')
  const before = md5(original)

  const scratch = mkdtempSync(join(tmpdir(), 'word-image-mutation-'))
  try {
    // ⚠️ **暂存目录名从来源目录派生**（2026-10-27 `[CR]` 修）：此前这里写死 `unit-01`，
    //   而 `sourceDir` 可以是 `unit-02` 或黄金值夹具目录 ⇒ 变异文件被放进一个
    //   **与它的来源无关**的目录名里。实测不报错（判据只读文件名），
    //   但一旦有人按目录名推断「这是单元 1 的图」就会读错；
    //   而「暂存路径必须与来源一致」这件事本身是**可以断言的** ⇒ 现在它就是。
    const scratchSubdir = basename(sourceDir)
    mkdirSync(join(scratch, scratchSubdir), { recursive: true })
    cpSync(originalPath, join(scratch, scratchSubdir, `${entryId}.svg`))
    const mutatedPath = join(scratch, scratchSubdir, `${entryId}.svg`)
    const mutated = mutate(original)
    expect(
      mutated,
      `${entryId} 的变异是**空操作** —— 锚点没匹配上，文件内容一个字都没变。` +
        '此时测的还是那张合规图，「它应该违规」的红报的是锚点失配，不是判据失效。',
    ).not.toBe(original)
    writeFileSync(mutatedPath, mutated, 'utf8')
    const result = run(mutatedPath)
    // 仓库磁盘逐字未动。
    // ⚠️ `[CR]` 2026-10-15：这条断言**在当前实现下不可能红** —— 所有写入都只发生在
    //   `scratch` 里，`originalPath` 只被 `readFileSync` 读过。它证明不了「1.8 欠的
    //   哈希证据」已经补上。**它唯一的作用是一道面向未来的回归守卫**：
    //   若有人日后把这个 helper 改成直接写 `originalPath`，这里会立刻红。
    //   所以它是「守住改法」，不是「证明还原」—— 两件事不要混为一谈。
    const after = md5(readFileSync(originalPath, 'utf8'))
    expect(
      after,
      `${entryId} 的仓库副本被变异改动了 —— 变异必须在临时目录做，` +
        '否则 vitest 并行跑时别的断言会读到临时状态，失败会指向与本用例无关的文件。',
    ).toBe(before)
    return result
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

// ── 三条守卫的判据 —— **真守卫与变异用例共用同一份** ───────────────────────────
/**
 * ⚠️ `[CR]` 2026-10-15：**这份判据原来有两个互不相干的拷贝。**
 *   一个在下面三个 `it` 的循环体里（那才是 `npm run test` 真正执行的东西），
 *   另一个在 `violationsIn()` 里，而 M31–M36 六条变异用例断言的**全是后者**。
 *   实测：把真守卫的判据改成 `if (false && …)`，**全仓 765 条测试仍然全绿** ——
 *   本 story 交付的机械强制可以被静默摘掉而无人察觉。
 *   ⇒ 现在每条守卫只有**一份**判据函数；真守卫与变异都问它同一个问题。
 *   变异用例不再是「另抄一份判据自己判红」，而是「问守卫这张图合不合规」。
 */

/** §5.1 主体占画布比例按档位。档位读不到也是违规 —— 不许静默跳过。 */
function g11Violation(m: WordImageMetrics): string | null {
  if (m.tier === null) return `${m.entryId}：读不到构图档位，§5.1 无从取区间`
  const [low, high] = TIER_EDGE_RANGES[m.tier]
  if (m.edgePercent < low || m.edgePercent > high) {
    return (
      `${m.entryId}（${m.tier}）：${m.edgePercent.toFixed(1)}% 不在 ${low}–${high}%` +
      `（箱体 x ${m.box.minX.toFixed(0)}–${m.box.maxX.toFixed(0)} / y ${m.box.minY.toFixed(0)}–${m.box.maxY.toFixed(0)}）`
    )
  }
  return null
}

/** §5.2 四边最小留白。 */
function g12Violation(m: WordImageMetrics): string | null {
  if (m.minPaddingPx < MIN_PADDING_PX) {
    return (
      `${m.entryId}：最小留白 ${m.minPaddingPx.toFixed(1)}px < ${MIN_PADDING_PX.toFixed(1)}px` +
      `（箱体 x ${m.box.minX.toFixed(0)}–${m.box.maxX.toFixed(0)} / y ${m.box.minY.toFixed(0)}–${m.box.maxY.toFixed(0)}）`
    )
  }
  return null
}

/** §5.3 外接框重心。 */
function g13Violation(m: WordImageMetrics): string | null {
  if (m.centerOffsetPx > CENTER_TOLERANCE_PX) {
    return `${m.entryId}：重心偏移 ${m.centerOffsetPx.toFixed(1)}px > ${CENTER_TOLERANCE_PX.toFixed(1)}px（重心 ${m.centerX.toFixed(0)},${m.centerY.toFixed(0)}）`
  }
  return null
}

const GUARDS = { '§5.1': g11Violation, '§5.2': g12Violation, '§5.3': g13Violation } as const
type GuardId = keyof typeof GUARDS

/** 问一条守卫「这张图合规吗」。守卫的本体就是下面那三个函数。 */
function check(guard: GuardId, path: string): string | null {
  return GUARDS[guard](metricsOf(path))
}

/** 真守卫跑全量。`checked` 让「一个不漏」本身也成为可断言的事实。 */
function violationsOnDisk(guard: GuardId): { checked: number; violations: string[] } {
  const paths = wordImagesOnDisk()
  const violations: string[] = []
  for (const path of paths) {
    const hit = check(guard, path)
    if (hit !== null) violations.push(hit)
  }
  return { checked: paths.length, violations }
}

// ── G11 / G12 / G13 ───────────────────────────────────────────────────────────

describe('G11 —— §5.1 主体占画布比例按档位（60–75% / 70–85%）', () => {
  it('每一张词图的主体最长边都落在自己档位的区间内', () => {
    const { checked, violations } = violationsOnDisk('§5.1')
    expect(
      checked,
      'G11 一张都没看 —— 覆盖面靠 wordImagesOnDisk()，空集合会让下面这条断言恒绿。',
    ).toBe(wordImagesOnDisk().length)
    expect(
      violations,
      '主体占比偏离所属档位 —— 孩子在四张选项卡之间比较时先比「哪个东西画得大」，' +
        '画得过大或过小都会让这一比较失去意义。几何/抽象档刻意比曲线/人物档小一号，' +
        '因为站姿人物的高度天然吃掉竖向留白（art-direction.md §5.1）。',
    ).toEqual([])
  })

  it('M31：把 u1-dog 放大到顶格（主体撑满画布），G11 必须红', () => {
    // ⚠️ 底图换成了**黄金值夹具** `tests/fixtures/word-images/u1-dog.svg`
    //   （Story 2.10 换源后，旧的 60 张自建词图已从 `public/assets/words/` 全部删除）。
    //   这张夹具的实算值（82.3% / 38px）是 `[CR]` 钉死的，内容一个字没动，
    //   而它的身体椭圆正是下面这个锚点 —— 形态与原用例完全一致。
    withMutatedWordImage(
      'u1-dog',
      (source) =>
        source.replace(
          '<ellipse cx="208" cy="336" rx="136" ry="110" fill="#d9a05b" />',
          '<ellipse cx="256" cy="256" rx="256" ry="256" fill="#d9a05b" />',
        ),
      (path) => {
        const hit = check('§5.1', path)
        expect(
          hit !== null,
          `变异后 G11 仍然判这张图合规 —— 把主体撑到 512×512 必然超 85% 上限。实测：${String(hit)}`,
        ).toBe(true)
      },
      fixtureDir,
    )
  })

  it('M36：把 u1-dog 整组转 45°，G11 必须红（这条专治「<g> 上的 rotate 被丢掉」）', () => {
    // ⚠️ M33 只验了 `<g>` 上的 **translate**。2026-10-15 实测发现同一条路上
    //   **rotate 被静默丢弃**（改角度，实测值一字不变），而方向是**偏大 = 假红**：
    //   pen 一度被算出 80.7%，真实值 67.1%。
    // ⇒ M36 只有在「容器旋转真的被计入」时才会红。
    //
    // ⚠️ **Story 2.10 换源后选底图的两条硬要求**（2026-10-26 实测）：
    //   ① **底图自身不能已经带着 rotate**，否则「rotate 被丢掉」时实测值会跳到
    //      另一个值上，可能**仍然越界** ⇒ 变异测不出那个 bug（假绿）。
    //      实测：`u2-pencil.svg` 自带 `rotate(-45)`，去掉所有 rotate 后实测 79.7%
    //      （已越出 geometric 的 60%–75%）⇒ 用它当底图，M36 在「rotate 被丢掉」
    //      时照样是绿的 ⇒ **不能用**。
    //   ② **45° 之后必须真的越出档位区间**。实测：`u2-rubber.svg`（斜置 18° 的长方体）
    //      转 45° 后实测 70.8%，**仍在 60%–75% 里** ⇒ 变异不出红 ⇒ **不能用**。
    //   ⇒ 最终选 `tests/fixtures/word-images/u1-dog.svg`：它**没有任何 transform**
    //      （唯一的 rotate 是耳朵椭圆上的元素级 `rotate(-26)`，落在外接盒内部，
    //      丢掉它实测值几乎不变），且形状**非旋转对称**（有机曲线形体）。
    //      实测：82.3% → 转 45° 后 90.6%，越出 organic 档的 70%–85% ⇒ 变异能红。
    //      而「rotate 被丢掉」时实测仍是 82.3%（在带内）⇒ 变异仍能**区分**那个 bug。
    withMutatedWordImage(
      'u1-dog',
      (source) => {
        const at = source.indexOf('  <g ')
        const end = source.lastIndexOf('</svg>')
        if (at < 0 || end < 0) throw new Error('u1-dog 的结构与预期不符，变异锚点找不到')
        return (
          source.slice(0, at) +
          '  <g transform="rotate(45 256 256)">\n' +
          source.slice(at, end) +
          '  </g>\n' +
          source.slice(end)
        )
      },
      (path) => {
        const hit = check('§5.1', path)
        expect(
          hit !== null,
          `变异后 G11 仍然判这张图合规 —— 转 45° 后外接盒必然超出 organic 档的 70%–85%。实测：${String(hit)}`,
        ).toBe(true)
      },
      fixtureDir,
    )
  })
})

describe('G12 —— §5.2 四边最小留白 ≥ 6%（31px）', () => {
  it('每一张词图的四边留白都不低于下限', () => {
    const { checked, violations } = violationsOnDisk('§5.2')
    expect(checked, 'G12 一张都没看 —— 空集合会让下面这条断言恒绿。').toBe(wordImagesOnDisk().length)
    expect(
      violations,
      '主体贴到画布边缘 —— 48px 卡面上这会让描边被裁掉半圈，图看起来「撞框」。' +
        '⚠️ 下限 30.72px 来自 MIN_PADDING_PERCENT/100 × 画布边长，' +
        '比文档字面写的「31px」松 0.28px（见 art-direction.md §5.2 的脚注）。',
    ).toEqual([])
  })

  it('M32：把 u1-ball 的描边加粗到撑破画布（外接盒被描边半宽顶出边界），G12 必须红', () => {
    // ⚠️ 底图换成**黄金值夹具** `tests/fixtures/word-images/u1-ball.svg`
    //   （换源后真实目录里已无此图）。锚点 `stroke-width="14"` 在该夹具里
    //   **逐字存在**（球身那个 `<circle>`），且黄金留白 79px 与原用例一致。
    withMutatedWordImage(
      'u1-ball',
      (source) => source.replace('stroke-width="14"', 'stroke-width="200"'),
      (path) => {
        const hit = check('§5.2', path)
        expect(
          hit !== null,
          `变异后 G12 仍然判这张图合规 —— 描边半宽 100px 会把 79px 的留白吃到负数。实测：${String(hit)}`,
        ).toBe(true)
      },
      fixtureDir,
    )
  })
})

describe('G13 —— §5.3 外接框重心落在画布中心 ±6%', () => {
  it('每一张词图的重心偏移都不超过容差', () => {
    const { checked, violations } = violationsOnDisk('§5.3')
    expect(checked, 'G13 一张都没看 —— 空集合会让下面这条断言恒绿。').toBe(wordImagesOnDisk().length)
    expect(
      violations,
      '主体重心偏离画布中心 —— 四选一卡面上主体挤在角上会让这一格在视觉上「更重」，' +
        '孩子会先注意到位置而不是图。',
    ).toEqual([])
  })

  it('M33：把 u1-three 整组上移 120px，重心必然出界，G13 必须红', () => {
    // ⚠️ 底图换成**黄金值夹具** `tests/fixtures/word-images/u1-three.svg`
    //   （换源后真实目录里已无此图；夹具内容与原用例逐字相同）。
    withMutatedWordImage(
      'u1-three',
      (source) => {
        // ⚠️ u1-three 的坐标全写在 `d` 里（九个 `<path>`），没有 `y="…"` 属性可改 ——
        //   换成「整体包一层 translate 的 `<g>`」，顺带验证 G13 会跟着 transform 走。
        const at = source.indexOf('  <g ')
        const end = source.lastIndexOf('</svg>')
        if (at < 0 || end < 0) throw new Error('u1-three 的结构与预期不符，变异锚点找不到')
        return (
          source.slice(0, at) +
          '  <g transform="translate(0,-120)">\n' +
          source.slice(at, end) +
          '  </g>\n' +
          source.slice(end)
        )
      },
      (path) => {
        const hit = check('§5.3', path)
        expect(
          hit !== null,
          `变异后 G13 仍然判这张图合规 —— 上移 120px 必然超出 ±30.7px。实测：${String(hit)}`,
        ).toBe(true)
      },
      fixtureDir,
    )
  })
})

// ── AC-6 构图档位声明 ─────────────────────────────────────────────────────────

describe('AC-6 —— 构图档位声明：读不到就报错，不许静默跳过', () => {
  it('每一张词图都声明了构图档位（漏一张即红）', () => {
    const files = wordImagesOnDisk()
    const missing: string[] = []
    for (const path of files) {
      const source = readFileSync(path, 'utf8')
      if (readCompositionTier(source) === null) missing.push(path.split('/').pop()!)
    }
    expect(
      missing,
      '这些词图的头部注释里没有「构图档位：xxx」—— G11 按档位取区间，' +
        '读不到就只能在剩下的图上恒绿（Story 1.8 的 G10 就是在这一类洞上被绕过的）。',
    ).toEqual([])
  })

  it('覆盖率本身就是两套独立枚举的差集，不是「数组长度 == 30」', () => {
    const onDisk = wordImagesOnDisk()
    const expected = expectedWordImages()
    expect(
      onDisk.filter((path) => !expected.includes(path)),
      '磁盘上多出了内容数据里没有的词图 —— 它不会被任何选项引用，' +
        '却在守卫的覆盖面里凑数；或者反过来，某张图其实没人用。',
    ).toEqual([])
    expect(
      expected.filter((path) => !onDisk.includes(path)),
      '内容数据要求存在的词图在磁盘上找不到 —— 孩子会看到一张「没有图」的选项卡，' +
        '这正是 Story 1.9 要消灭的空洞。',
    ).toEqual([])
  })

  it('档位取值域是六档，且每档的区间就是 art-direction §5.1 分档表上的那三组数字', () => {
    expect(
      [...COMPOSITION_TIERS].sort(),
      '构图档位的取值域必须正好是 §5.1 分档表上的六档 —— 增删一档都会让 G11 取错区间。',
    ).toEqual(['abstract', 'figure', 'food', 'geometric', 'organic', 'scene'])
    expect(TIER_EDGE_RANGES.geometric, '几何档区间被改动 —— 与 art-direction §5.1 不一致').toEqual([60, 75])
    expect(TIER_EDGE_RANGES.abstract, '抽象档区间被改动 —— 与 art-direction §5.1 不一致').toEqual([60, 75])
    expect(TIER_EDGE_RANGES.organic, '有机曲线档区间被改动 —— 与 art-direction §5.1 不一致').toEqual([70, 85])
    expect(TIER_EDGE_RANGES.figure, '人物档区间被改动 —— 与 art-direction §5.1 不一致').toEqual([70, 85])
    // ⚠️ `food` / `scene` 是 `[DS]` Story 2.5 补的两档（DF-105）。
    //   `food` 的带是 **20 个百分点**（几何/抽象只有 15）⇒ 判别力弱于其他档，
    //   **这不是笔误，是「一个类别塞进两种形状（圆润 / 方正）」的必然代价**（见 §5.1 代价列）。
    expect(TIER_EDGE_RANGES.food, '食物档区间被改动 —— 与 art-direction §5.1 不一致').toEqual([60, 80])
    expect(TIER_EDGE_RANGES.scene, '场景档区间被改动 —— 与 art-direction §5.1 不一致').toEqual([70, 85])
    // 两条区间是**有重叠的**（70–75 两条都占）—— 这是 §5.1 分档后的原样，
    // 不是笔误。若有人把它们改成互斥区间，就是单方面收紧了守卫。
    expect(
      TIER_EDGE_RANGES.organic[0],
      '有机/人物档下限必须低于几何/抽象档上限（两条区间本就重叠，改成互斥就是单方面收紧守卫）',
    ).toBeLessThan(TIER_EDGE_RANGES.geometric[1])
  })

  it('未知的档位写法读作 null（由守卫报「缺档位」，而不是悄悄落到某一档）', () => {
    expect(readCompositionTier('<!-- 构图档位：squiggle --><svg/>'), '未知档位取值没有被读成 null').toBeNull()
    expect(
      readCompositionTier('<!-- 档位：organic --><svg/>'),
      '「档位：」少了「构图」二字竟然被接受了 —— 档位声明必须逐字匹配',
    ).toBeNull()
  })

  it('M34：把 u2-rubber 的档位行改成未知取值，必须红（而不是静默跳过它）', () => {
    // ⚠️ 底图换成**真实交付**的 `u2-rubber.svg`（Story 2.10 换源后旧的 `u1-cat` 已删除）。
    //   锚点 `构图档位：geometric` 在该文件里逐字存在；
    //   ⚠️ 改成 `geometricish` 之后 `readCompositionTier()` 必须读成 `null` ——
    //   它的正则末尾有 `\b`，`geometric` 后面接字母**不构成词边界** ⇒ 不会误判成
    //   `geometric`（这一条由下面「变异真的改了」的断言与「档位读成 null」共同保证）。
    withMutatedWordImage(
      'u2-rubber',
      (source) => source.replace('构图档位：geometric', '构图档位：geometricish'),
      (path) => {
        expect(
          readCompositionTier(readFileSync(path, 'utf8')),
          '档位写成未知取值后竟然还能被读出来 —— 变异没有真正生效，' +
            '这条用例等于空转（下面那条「必须红」也就证明不了任何事）。',
        ).toBeNull()
        expect(
          check('§5.1', path) !== null,
          '档位写成未知取值后没有红 —— 说明档位读取失败时被静默跳过了，' +
            '这张图从此不在任何构图守卫的覆盖面内，而守卫仍然全绿。',
        ).toBe(true)
      },
      unit2Dir,
    )
  })

  it('M35：删掉 u1-morning 的档位行，必须红', () => {
    // ⚠️ 底图换成**真实交付**的 `u1-morning.svg`（旧的 `u1-bird` 已删除）。
    //   这张图是单元 1 当前交付的两张之一，档位行在文件头注释里逐字存在。
    withMutatedWordImage(
      'u1-morning',
      (source) => source.replace(/^\s*构图档位：[^\n]*\n/m, ''),
      (path) => {
        expect(
          readCompositionTier(readFileSync(path, 'utf8')),
          '删掉档位行后竟然还能读出档位 —— 变异没有真正生效，这条用例等于空转。',
        ).toBeNull()
        expect(
          check('§5.1', path) !== null,
          '删掉档位行后没有红 —— 守卫会在剩下的图上恒绿。',
        ).toBe(true)
      },
      unitDir,
    )
  })
})

// ── G277 —— §5.1 的分档表与代码里的档位表必须逐字一致 ──────────────────────────

/**
 * §5.1 的分档表是**判据的出处**，代码里的 `TIER_EDGE_RANGES` 只是它的复制品。
 *
 * ⚠️ 为什么这条要单独建守卫：G11 按 `TIER_EDGE_RANGES` 取区间判图，
 *   而**没人守着那张区间表与 §5.1 是否还一致** —— 两份一旦分家，
 *   G11 就会拿「代码里的区间」去判「文档里承诺的图」，**守卫仍然全绿**，
 *   但它守的已经不是文档写的东西了（这正是 Story 1.8 / 1.9 反复吃过的亏）。
 *
 * ⚠️ 判据**不许另抄一份**：`docs/art-direction.md` §5.1 的表格是唯一的源，
 *   这里只**解析**它，不在测试里重写一遍区间数字。
 */
function g277Problems(): string[] {
  const doc = readFileSync(join(root, 'docs/art-direction.md'), 'utf8')
  const lines = doc.split('\n')
  // §5.1 的小节标题必须逐字含「构图档位」—— 只认 §5.1 分档表那一节，
  // 别把 §5.1/5.2/5.3 那节讨论文字或 §5 的分档汇总表误当成出处。
  const headingAt = lines.findIndex((line) => /^###\s+5\.1\b.*构图档位/.test(line))
  if (headingAt === -1) {
    return ['docs/art-direction.md 里找不到 §5.1 的构图档位小节 —— G277 无从取区间']
  }
  let headerAt = -1
  for (let i = headingAt + 1; i < lines.length; i += 1) {
    if (lines[i].startsWith('|')) {
      headerAt = i
      break
    }
  }
  if (headerAt === -1) return ['§5.1 的构图档位小节里没有找到分档表']
  if (!/^\|[\s|:-]+\|/.test(lines[headerAt + 1] ?? '')) {
    return ['§5.1 的分档表没有表头分隔行 —— 表格结构变了，G277 无从解析']
  }
  const docTiers = new Map<string, [number, number]>()
  for (let i = headerAt + 2; i < lines.length; i += 1) {
    if (!lines[i].startsWith('|')) break
    const cells = lines[i].split('|').map((cell) => cell.trim())
    const name = /`([a-z]+)`/.exec(cells[1] ?? '')?.[1]
    const range = /(\d+(?:\.\d+)?)%\s*[–—-]\s*(\d+(?:\.\d+)?)%/.exec(cells[2] ?? '')
    if (name === undefined || range === null) continue
    docTiers.set(name, [Number(range[1]), Number(range[2])])
  }
  if (docTiers.size === 0) {
    return ['§5.1 的分档表里一档都没解析出来 —— 表格结构变了，G277 会在空集上恒绿']
  }
  const problems: string[] = []
  for (const tier of COMPOSITION_TIERS) {
    const fromDoc = docTiers.get(tier)
    if (fromDoc === undefined) {
      problems.push(`§5.1 的分档表里没有 ${tier} 档`)
      continue
    }
    const fromCode = TIER_EDGE_RANGES[tier]
    if (fromDoc[0] !== fromCode[0] || fromDoc[1] !== fromCode[1]) {
      problems.push(
        `${tier} 档：§5.1 写 ${fromDoc[0]}%–${fromDoc[1]}%，代码里是 ${fromCode[0]}–${fromCode[1]}`,
      )
    }
  }
  for (const tier of docTiers.keys()) {
    if (!(COMPOSITION_TIERS as readonly string[]).includes(tier)) {
      problems.push(`§5.1 的分档表里有 ${tier} 档，代码的取值域里没有`)
    }
  }
  return problems
}

describe('G277 —— §5.1 的分档表与代码里的档位表逐字一致', () => {
  it('档位取值域、区间表与 docs/art-direction.md §5.1 的分档表三者一致', () => {
    expect(g277Problems()).toEqual([])
  })

  it('M326：把 food 档的区间改掉，G277 必须红', () => {
    const before = TIER_EDGE_RANGES.food
    try {
      TIER_EDGE_RANGES.food = [60, 75]
      expect(
        g277Problems().length,
        '把 food 档的区间改成 60–75% 之后 G277 仍然判一致 —— 它没在读 §5.1 的那张表，' +
          '于是文档与代码可以分家而守卫全绿。',
      ).toBeGreaterThan(0)
    } finally {
      TIER_EDGE_RANGES.food = before
    }
  })
})

// ── scene 档的夹具 —— 新档位必须有真实守卫，不能「声明了但没人用」 ──────────────

/**
 * `scene` 档在 `[DS]` Story 2.5 建好，但**本 story 不引入场景词**
 * （`playground` 实测 4 版 / 261.9 s 且到 session 结束仍未通过 48px 可读性）。
 * ⇒ 这一档在磁盘上没有真实成员 ⇒ 用**夹具**证明 G11 真的会取 `scene` 的区间。
 *
 * ⚠️ 夹具落在 `mkdtempSync` 的临时目录里，**不进仓库的 `public/assets/words/`** ——
 *   放进去了就会被「两套独立枚举求差集」那条覆盖面断言当成一张没人用的词图。
 */
function sceneFixtureSvg(): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!--',
    '  词图夹具：scene 档（docs/art-direction.md §5.1）。',
    '  ⚠️ 本图不是内容 —— 它只存在于测试的临时目录里。',
    '  `scene` 档在 Story 2.5 建好但还没有真实成员（Story 2.6 才第一次有），',
    '  所以用这张夹具证明 G11 真的会取 scene 的区间，而不是「声明了但没人用」。',
    '  构图档位：scene    ← 场景档（§5.1：70%–85%）；G11 按这一行取区间读，不写死',
    '-->',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"',
    '     role="img" aria-label="场景夹具">',
    '  <!-- 天空块：外接盒由它定，主体占画布 410/512 = 80.1%。 -->',
    '  <rect x="51" y="51" width="410" height="410" fill="#8ecae6" />',
    '  <!-- 地面与两件道具：都在外接盒内，不改变占比。 -->',
    '  <rect x="51" y="330" width="410" height="131" fill="#90be6d" />',
    '  <rect x="120" y="240" width="70" height="90" fill="#f4a261" />',
    '  <circle cx="360" cy="170" r="46" fill="#ffd166" />',
    '</svg>',
    '',
  ].join('\n')
}

describe('scene 档的夹具 —— G11 取的是 scene 的区间，不是别的档的', () => {
  it('一张 scene 档的图：占比落在 scene 的 70%–85% 内，且落在几何档的 60%–75% 之外', () => {
    const source = sceneFixtureSvg()
    const scratch = mkdtempSync(join(tmpdir(), 'word-image-scene-'))
    try {
      const path = join(scratch, 'u2-fixture-scene.svg')
      writeFileSync(path, source, 'utf8')
      expect(readCompositionTier(source), '夹具的档位行没被读成 scene').toBe('scene')
      const m = measureWordImage('u2-fixture-scene', source)
      expect(m.tier, '实算脚本读到的档位与 readCompositionTier 不一致').toBe('scene')
      expect(g12Violation(m), '夹具没守住 §5.2 的四边留白').toBeNull()
      expect(g13Violation(m), '夹具没守住 §5.3 的重心').toBeNull()
      // ⚠️ 这一条是本用例的**判别力来源**：占比必须落在几何档上限之外，
      //   否则「G11 判它合规」可能只是因为它碰巧也落在几何档的带里 ——
      //   那就证明不了 G11 读的是 scene 的区间。
      expect(
        m.edgePercent,
        '夹具的主体占比必须落在 scene 档的 70%–85% 内，且要落在几何档的 60%–75% 之外 —— ' +
          '否则这条用例证明不了 G11 真的取了 scene 的区间。',
      ).toBeGreaterThan(TIER_EDGE_RANGES.geometric[1])
      expect(g11Violation(m), 'scene 档的夹具被判违规 —— G11 没取 scene 的区间').toBeNull()
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })
})

// ── 实算脚本与守卫用的是同一套代码 ────────────────────────────────────────────

describe('脚本与守卫同源 —— 守卫不得自带第二份几何算法', () => {
  it('measureWordImageFile 与 measureWordImage 对同一张真实图给出一致的数', () => {
    // ⚠️ 覆盖面改成**磁盘上真实交付的每一张**（Story 2.10 换源后是单元 1 两张 +
    //   单元 2 四张），不再写死旧批次的 5 个名字 ——
    //   写死的名字在换源后要么指向不存在的文件（ENOENT），要么悄悄少覆盖几张。
    const paths = wordImagesOnDisk()
    expect(paths.length, '一张词图都没枚举到 —— 下面两条断言会在空集合上恒绿').toBeGreaterThan(0)
    for (const path of paths) {
      const entryId = basename(path, '.svg')
      const byFile = measureWordImageFile(dirname(path), entryId)
      const byText = measureWordImage(entryId, readFileSync(path, 'utf8'))
      expect(byText.edgePercent, `${entryId} 两条入口给出了不同的占比`).toBeCloseTo(byFile.edgePercent, 9)
    }
  })

  it('守卫读的档位与脚本读的档位是同一个来源', () => {
    const paths = wordImagesOnDisk()
    expect(paths.length, '一张词图都没枚举到 —— 下面这条断言会在空集合上恒绿').toBeGreaterThan(0)
    for (const path of paths) {
      const entryId = basename(path, '.svg')
      const source = readFileSync(path, 'utf8')
      expect(measureWordImage(entryId, source).tier).toBe(readCompositionTier(source))
    }
  })
})

// ── G286 —— 词图文件头里的「外沿实算」必须等于工具实算 ───────────────────────

/**
 * **G286 的判据本体** —— 抽成函数，正向用例与反向自测**都调它**（R-51）。
 *
 * ⚠️ **守的是什么**：每张词图的文件头里都写着「主体占比 / 最小留白 / 重心偏移 /
 *   重心」这组**实算值** —— 那是这张图**合规的唯一人类可读证据**
 *   （§5.1 / §5.2 / §5.3 的判据数就是这三个数）。
 *   ⚠️ **它此前一条守卫都没有** —— 于是它**可以随便写**：
 *   `[CR]` 2026-10-23（Story 2.5）实测抓到 `u2-doctor` 的文件头写着
 *   **75.6% / 62.0px / 13.5px**，而工具实算是 **78.1% / 49.0px / 7.0px**
 *   （留白差了 13px、偏移差了 6.5px）⇒ **文件头在说谎，而全仓守卫全绿**。
 *
 * ⚠️ **为什么这不是「文档洁癖」**：这组数是**判据本身**，
 *   不是对判据的描述 —— 有人照着文件头判断「这张图离 §5.2 的下限还有多远」
 *   （§5.2 的下限是 30.72px，49.0 与 62.0 差着一倍）⇒ 照着假数做判断会做错。
 *   R-21「实测值优先于文档值」的前提是**实测值真的在那儿**；这条守的就是它。
 *
 * ⚠️ **判据不许重抄一份几何算法** —— 实算一律走 {@link measureWordImage}。
 */
interface HeaderMeasurement {
  edgePercent: number
  minPaddingPx: number
  centerOffsetPx: number
  centerX: number
  centerY: number
}

/**
 * 从文件头里解析那组实算值 —— **只认规范写法**。
 *
 * ⚠️ **为什么只认一种写法**：判据要能被机器逐字核对 ⇒ 写法必须唯一。
 *   `[CR]` 实测：`u2-egg` / `u2-kite` / `u2-sun` 当时用的是**手算推导**的散文体，
 *   `u2-ice-cream` 用的是**另一种措辞**（「外沿实测值」）⇒ 四张图**核对不到**
 *   ⇒ 规范化写法已在本 story 内把它们改成同一句式。
 */
function parseHeaderMeasurement(source: string): HeaderMeasurement | null {
  const match =
    /主体占比\s*\*\*([\d.]+)%\*\*[，,]\s*最小留白\s*\*\*([\d.]+)px\*\*[，,]\s*重心偏移\s*\*\*([\d.]+)px\*\*[，,]\s*重心\s*\((-?[\d.]+),\s*(-?[\d.]+)\)/.exec(
      source,
    )
  if (match === null) return null
  return {
    edgePercent: Number(match[1]),
    minPaddingPx: Number(match[2]),
    centerOffsetPx: Number(match[3]),
    centerX: Number(match[4]),
    centerY: Number(match[5]),
  }
}

/**
 * 三个实算量的容差 —— **0.06**。
 *
 * ⚠️ **为什么是 0.06 而不是 0**：文件头里的数是**一位小数**（工具的 `toFixed(1)`），
 *   而真值是浮点 ⇒ 四舍五入的最大误差是 **0.05** ⇒ 0.06 是「刚好装得下四舍五入、
 *   又装不下任何一次真正的改动」的最小值。⚠️ **不许放宽**：放宽到 0.1 时
 *   `75.6` 与 `78.1` 那种改动仍会被放过吗？—— 不会，但 `0.1` 也能放过
 *   「四舍五入写错一位」以外的漂移 ⇒ 0.06 是**故意贴着 0.05 选的**。
 */
const HEADER_EPSILON = 0.06

/**
 * 重心坐标的容差 —— **0.6**。
 *
 * ⚠️ **为什么比另外三个宽**：重心坐标在文件头里是**整数**（工具的 `toFixed(0)`），
 *   而真值是浮点（如 `u2-cow` 的 249.547 ⇒ 写 250）⇒ 四舍五入误差最大 **0.5**。
 *   而重心的**意义**由「重心偏移」那个数承担（它才是 §5.3 的判据）⇒
 *   这一对坐标只作**辅助核对**，宽一点是合理的。
 */
const HEADER_CENTER_EPSILON = 0.6

/**
 * **G286 的判据本体** —— 核对一张图的文件头与它的实算值。
 *
 * @param entryId 图的 id（用于报错信息）
 * @param source  SVG 原文
 * @param measured 工具实算的结果
 * @returns 问题清单；空数组 = 一致
 */
function g286ProblemsIn(
  entryId: string,
  source: string,
  measured: WordImageMetrics,
): string[] {
  const header = parseHeaderMeasurement(source)
  if (header === null) {
    return [
      `${entryId}：文件头里没有「外沿实算」的规范记录（主体占比 / 最小留白 / 重心偏移 / 重心）` +
        '—— 这一组数是 §5.1 / §5.2 / §5.3 的判据本身，缺了它就没人能核对这张图',
    ]
  }
  const problems: string[] = []
  const check = (label: string, claimed: number, actual: number, epsilon: number): void => {
    if (Math.abs(claimed - actual) < epsilon) return
    problems.push(
      `${entryId}：文件头写的${label}是 ${claimed}，工具实算是 ${actual} ` +
        `（差 ${Math.abs(claimed - actual).toFixed(3)}）—— 文件头在说谎，判据以实算为准（R-21）`,
    )
  }
  check('主体占比', header.edgePercent, measured.edgePercent, HEADER_EPSILON)
  check('最小留白', header.minPaddingPx, measured.minPaddingPx, HEADER_EPSILON)
  check('重心偏移', header.centerOffsetPx, measured.centerOffsetPx, HEADER_EPSILON)
  check('重心 x', header.centerX, measured.centerX, HEADER_CENTER_EPSILON)
  check('重心 y', header.centerY, measured.centerY, HEADER_CENTER_EPSILON)
  return problems
}

/** 本批（单元 2）的每一张词图 —— 文件头必须有那组实算记录。 */
const UNIT2_DIR = join(wordsDir, 'unit-02')

/** 单元 2 的全部词图文件路径（按名排序）。 */
function unit2WordImages(): string[] {
  return readdirSync(UNIT2_DIR)
    .filter((name) => name.endsWith('.svg'))
    .sort()
    .map((name) => join(UNIT2_DIR, name))
}

describe('G286 —— 词图文件头里的「外沿实算」逐张等于工具实算', () => {
  it('单元 2 的每一张词图：文件头的三个实算量都与工具实算一致', () => {
    const problems: string[] = []
    for (const path of unit2WordImages()) {
      const entryId = basename(path, '.svg')
      const source = readFileSync(path, 'utf8')
      problems.push(...g286ProblemsIn(entryId, source, measureWordImage(entryId, source)))
    }
    expect(problems, '词图文件头里的实算值与工具实算不一致（详见每一条）').toEqual([])
  })

  it('单元 2 的每一张词图都有那组实算记录（一张都不许漏 —— 「没有」也是一种不一致）', () => {
    // ⚠️ 这一条守的是**上一条的前提**：上一条会跳过「解析不出记录」的图吗？—— 不会，
    //   `g286ProblemsIn` 在解析不出时**返回一条问题** ⇒ 上一条已经覆盖「缺记录」。
    //   这一条单独再钉一遍，是为了让**失败信息**直接指向「缺记录」而不是「值对不上」。
    const missing = unit2WordImages().filter((path) => {
      const source = readFileSync(path, 'utf8')
      return parseHeaderMeasurement(source) === null
    })
    expect(
      missing.map((path) => basename(path)),
      '这些词图的文件头里没有「外沿实算」的规范记录 ⇒ 它们的合规性没有人类可读的证据',
    ).toEqual([])
  })

  it('🚨 反向自测：把文件头的实算值改错 ⇒ 判据本体必须报出问题', () => {
    // ⚠️ R-51：反向自测**真的调用判据本体** ⇒ 判据被掏空时它照样红。
    //   夹具用 `u2-ruler` 的**真实**文件与**真实**实算值，只把文件头里的
    //   三个数换成一组「看起来很合理但不是实算」的数 —— 那正是
    //   `[CR]` 实测在旧批次（`u2-doctor`）上抓到的原样。
    //   ⚠️ 底图随交付批次变（Story 2.10 换源后 `u2-doctor` 已不存在），
    //     但**判据与夹具的形态不变**：真文件 + 真实算值 + 只改文件头。
    const entryId = 'u2-ruler'
    const source = readFileSync(join(UNIT2_DIR, `${entryId}.svg`), 'utf8')
    const measured = measureWordImage(entryId, source)
    const violated = source.replace(
      /主体占比\s*\*\*[\d.]+%\*\*[，,]\s*最小留白\s*\*\*[\d.]+px\*\*[，,]\s*重心偏移\s*\*\*[\d.]+px\*\*/,
      '主体占比 **75.6%**，最小留白 **62.0px**，重心偏移 **13.5px**',
    )
    expect(violated, '夹具没改成 —— 说明正则没匹配上，这条例外自测等于空转').not.toBe(source)

    const problems = g286ProblemsIn(entryId, violated, measured)
    expect(
      problems.length,
      '判据在「文件头写着假实算值」的夹具上没报出问题 ⇒ 判据本身失效（它可能恒真）',
    ).toBeGreaterThan(0)
  })

  it('🚨 反向自测：文件头里没有实算记录 ⇒ 判据本体必须报出问题', () => {
    const entryId = 'u2-ruler'
    const source = readFileSync(join(UNIT2_DIR, `${entryId}.svg`), 'utf8')
    const measured = measureWordImage(entryId, source)
    const stripped = source.replace(
      /主体占比\s*\*\*[\d.]+%\*\*[，,]\s*最小留白\s*\*\*[\d.]+px\*\*[，,]\s*重心偏移\s*\*\*[\d.]+px\*\*[，,]\s*重心\s*\(-?[\d.]+,\s*-?[\d.]+\)/,
      '（这段实算记录不见了）',
    )
    expect(stripped, '夹具没改成 —— 说明正则没匹配上，这条例外自测等于空转').not.toBe(source)

    const problems = g286ProblemsIn(entryId, stripped, measured)
    expect(
      problems.length,
      '判据在「文件头没有实算记录」的夹具上没报出问题 ⇒ 判据本身失效（它可能恒真）',
    ).toBeGreaterThan(0)
  })
})

// ── 词图目录本身 ──────────────────────────────────────────────────────────────

describe('词图目录与命名', () => {
  it('单元 1 的词图目录存在（张数不写死 —— 覆盖面由上面那条「两套枚举求差集」负责）', () => {
    // ⚠️ `[CR]` 2026-10-15：`toBe(30)` 写死了张数，而同一文件里覆盖面断言是数据驱动的
    //   （两套互不相干的枚举求差集）。加第二个单元时这里要人工改，
    //   而 1.8 的 `[CR]` 恰好拒掉过一条「数组长度 == N」的断言 ——
    //   当 N 来自同一个数据源时它恒真。这里的 N 是字面量，不会假绿，
    //   但它也不提供覆盖面保证：少一张时上面三条守卫是**少看一张**，不是恒绿。
    //   ⇒ 覆盖面只由 `覆盖率本身就是两套独立枚举的差集` 那条断言负责。
    expect(existsSync(unitDir), `${unitDir} 不存在`).toBe(true)
  })

  it('每张图的档位都能落进六档取值域，且一张都读了（空输入不得恒绿）', () => {
    // ⚠️ 元素类型是 `CompositionTier | null`（真·空值），不是 `'null'`（字符串）。
    //    写成字符串时 vitest 照样跑（esbuild 不做类型检查），但 `npm run typecheck`
    //    会红 —— 2026-10-15 AC-18 实测抓到。
    //    这里必须允许 `null` 进来：读不到档位的那张会进 Set，
    //    然后被下面的 toContain 判红 —— 这正是 AC-6「读不到即报错，不许静默跳过」。
    const paths = wordImagesOnDisk()
    const tiers = new Set<CompositionTier | null>()
    for (const path of paths) tiers.add(metricsOf(path).tier)
    expect(tiers.size, '一张图都没量到 —— 下面的 toContain 会在空集合上恒绿').toBeGreaterThan(0)
    for (const tier of tiers) {
      expect(COMPOSITION_TIERS, `${String(tier)} 不在 §5.1 的六档取值域里`).toContain(tier)
    }
  })
})
