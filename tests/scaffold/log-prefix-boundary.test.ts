/**
 * R-14 的第二半：`services/` / `app/` / `components/` 的**带前缀日志**守卫
 * （DF-049；守卫 **G323**）。
 *
 * ── 守什么 ────────────────────────────────────────────────────────────────
 *   R-14（`docs/rules/architecture.md` 逐字）「渲染与战斗主路径上不得有
 *   `console.*`。确需日志时**带模块前缀**，且**不在逐帧路径**」——
 *   本守卫把后半句的两条判据钉死：
 *   ① **前缀合规**：`src/services/**`、`src/app/**`、`src/components/**`
 *      里每一条 `console.*` 的**第一个实参**必须是一个**以 `[前缀]` 开头**的
 *      字符串字面量（唯一的例外走**例外清单**，见下）。
 *   ② **不在逐帧路径**：任何 `console.*` 都不得落在
 *      `requestAnimationFrame(...)` / `setInterval(...)` 的调用表达式范围内。
 *
 * ── 为什么 R-14 此前只守了一半 ────────────────────────────────────────────
 *   `tests/scaffold/save-boundary.test.ts` 守的是 R-14 最硬的一半：
 *   `src/core/**` 逐文件**零 `console.`**。但 R-14 允许
 *   `services/` / `app/` 「带模块前缀且不在逐帧路径」——
 *   那两条判据放不进「零出现」这一条形式 ⇒ **无守卫**。
 *   ⇒ 结果是：`[save]` 的前缀由 **G85** 逐字断言（**存档这一个模块**），
 *     而 `[audio]` / `[tts]` / `[sw]` / `[prefetch]` / `[pronunciation]`
 *     / `[content]` 六个前缀**全都靠人肉守**。
 *   ⇒ 而前缀一旦漂了，症状是**静默**的：日志照打，只是**再也分不清是哪个模块**
 *     —— 排查降级问题的人会在六个前缀里瞎猜（DF-049 逐字记着这条）。
 *
 * ── 为什么把 `components/` 也纳入 ──────────────────────────────────────────
 *   R-14 说的「**渲染**主路径」在 DOM + CSS 的本仓里就是 `src/components/**`
 *   （组件的 `console.warn` 落在事件回调里，例如图片 404 的降级）⇒
 *   组件层同样适用「带前缀 + 不在逐帧路径」那两条。
 *   实测：组件层现有 4 条日志，**全部**是 `[content]` 前缀 ⇒ 纳入即绿，
 *   守的是**将来**（新组件随手写一条没前缀的 `console.warn`）。
 *
 * ── 例外清单：为什么不能一刀切「第一个实参必须是字面量」────────────────────
 *   `src/app/effects-runner.ts` 的 TRACE 分支逐字是 `console.info(effect.line)` ——
 *   它的消息是**运行期**的值（`src/core/effects.ts` 的 `turnLogLine` 产出的
 *   `[core] turn …` 行），源码里**看不到**那个前缀 ⇒ 静态判据看不出来。
 *   ⚠️ **不能因此把判据放松成「实参不是字面量就算违规」** ——
 *     那会把**这一条合法日志**判红，进而逼着人改代码（真实的 R-14 违规被淹没）。
 *   ⇒ 走**例外清单**：每条例外写明**为什么合法** + **前缀由谁产出**，
 *     守卫再去核那个**生产者**是否仍带着前缀（前提没了 ⇒ 例外当场失效）。
 *   ⚠️ **例外必须被恰好命中一次**（多了说明锚点被扩大了，少了说明已过期）——
 *     否则例外清单会**悄悄过期**（本仓反复吃过的亏，见
 *     `tests/scaffold/archive-path-refs.test.ts` 的例外清单纪律）。
 *
 * ── 判据怎么做到「能咬住它要防的违规」（R-51）──────────────────────────────
 *   ⚠️ **只断言「扫到的日志都有前缀」是不够的**：一个**扫不到任何日志**的
 *     扫描器会**恒绿**（jsdom 版的假绿同款）。⇒ 本文件分两半：
 *   · **正向扫描**（判据本体）走真实文件；
 *   · **反向夹具**（自检）用**合成源码**证明每条判据**真的会红**：
 *     无前缀 ⇒ 报；前缀大写 ⇒ 报；第一个实参不是字面量 ⇒ 报；
 *     日志落在 rAF / setInterval 回调里 ⇒ 报；普通事件回调里的日志**不许**被误伤。
 *   ⇒ 判据若哪天失效（例如正则写坏），自检那几条会**先红**。
 *
 * ── 扫描面不能悄悄塌掉（R-51 第 1 类）────────────────────────────────────
 *   ① 文件清单**现读**（`readdirSync` 递归），不写死 ⇒ 新文件自动纳入；
 *   ② 剥注释用**共享实现** `tests/fixtures/strip-comments.ts`（R-37：
 *      不许各留一份 —— 两份实现漂移过一次，症状是「一个守卫绿、另一个红」），
 *      它**保留字符位置** ⇒ 报错能给出准确行号；
 *   ③ `.vue` 只扫 `<script>` 块（模板与样式里没有 `console.*`，
 *      而模板里的 `//`（如 `href="//…"`)会让朴素的剥注释吃掉整行）；
 *   ④ **正向对照**：断言真实文件里**扫得到**日志（`src/services/audio.ts` 至少一条
 *      `[audio]` 前缀）⇒ 「扫到 0 条」不会被读成「没有违规」。
 *
 * ── 出处 ──────────────────────────────────────────────────────────────────
 *   `docs/rules/architecture.md` R-14（守卫字段：此前写「services/ 与 app/
 *   的那部分无守卫」）＋ `deferred-work.md` 的 **DF-049**
 *   （恢复条件逐字：「累计到第三个带前缀日志的服务时，把「前缀合规 +
 *   不在逐帧路径」做成一条通用守卫」）—— 实测带前缀的服务早已有 **6 个**
 *   （audio / save / sw / tts / prefetch / pronunciation）⇒ **触发条件早已成立**。
 *
 * 不在 src/core/ 下 —— NFR16：测试全部在 tests/。
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { stripComments } from '../fixtures/strip-comments'

const root = fileURLToPath(new URL('../../', import.meta.url))

// ── 扫描面 ────────────────────────────────────────────────────────────────

/** 本守卫覆盖的三层：服务层、应用层、组件层（渲染路径）。 */
const SCANNED_DIRS = ['src/services', 'src/app', 'src/components'] as const

/** 组件层扫 `.vue`（脚本块），其余两层扫 `.ts`。 */
const SOURCE_EXTENSIONS = ['.ts', '.vue'] as const

/** 递归列出目录下的源文件（相对仓库根）。 */
function listSourceFiles(dir: string): string[] {
  const absolute = resolve(root, dir)
  const out: string[] = []
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) {
        walk(full)
        continue
      }
      if (SOURCE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
        out.push(relative(root, full))
      }
    }
  }
  walk(absolute)
  return out.sort()
}

/** `.vue` 只取 `<script>` 块；`.ts` 全文。 */
function scriptOf(relPath: string): string {
  const source = readFileSync(resolve(root, relPath), 'utf8')
  if (!relPath.endsWith('.vue')) return source
  const blocks: string[] = []
  const pattern = /<script\b[^>]*>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source)) !== null) {
    blocks.push(match[1])
  }
  return blocks.join('\n')
}

/** 读文件并剥注释（R-52）；位置保持不变 ⇒ 行号仍准。 */
function cleanedSource(relPath: string): string {
  return stripComments(scriptOf(relPath))
}

// ── 判据本体（纯函数：吃源码文本，吐违规清单）────────────────────────────

/** 一条 `console.*` 调用。 */
export interface LogCall {
  /** 在**剥过注释**的源码里的起始下标（指向 `console`）。 */
  index: number
  /** 行号（1 起）。 */
  line: number
  /** 方法名（`warn` / `error` / …）。 */
  method: string
  /** 整个调用的逐字文本（从 `console` 到收尾的 `)`）。 */
  callText: string
  /** 第一个实参的原始文本（已去首尾空白）。 */
  firstArg: string
}

const LOG_CALL = /\bconsole\s*\.\s*(log|warn|error|info|debug|trace)\s*\(/g

/** 跳过一个字符串字面量（含模板串的 `${}` 嵌套），返回结束后的下标。 */
function skipString(source: string, start: number): number {
  const quote = source[start]
  let i = start + 1
  while (i < source.length) {
    if (source[i] === '\\') {
      i += 2
      continue
    }
    if (source[i] === quote) {
      return i + 1
    }
    // 模板串里的 `${…}`：括号配平后再继续找收尾的反引号
    if (quote === '`' && source[i] === '$' && source[i + 1] === '{') {
      let depth = 0
      i += 1
      while (i < source.length) {
        const ch = source[i]
        if (ch === '"' || ch === "'" || ch === '`') {
          i = skipString(source, i)
          continue
        }
        if (ch === '{') depth += 1
        if (ch === '}') {
          depth -= 1
          if (depth === 0) {
            i += 1
            break
          }
        }
        i += 1
      }
      continue
    }
    i += 1
  }
  return i
}

/**
 * 解析一次调用：取第一个实参的文本与整个调用的收尾位置。
 *
 * @param source 源码
 * @param open `(` 的下标
 */
function parseCall(
  source: string,
  open: number,
): { firstArg: string; callEnd: number } {
  let depth = 0
  let i = open + 1
  let argStart = i
  let firstArg: string | null = null
  while (i < source.length) {
    const ch = source[i]
    if (ch === '"' || ch === "'" || ch === '`') {
      i = skipString(source, i)
      continue
    }
    if (ch === '(' || ch === '[' || ch === '{') {
      depth += 1
      i += 1
      continue
    }
    if (ch === ')' || ch === ']' || ch === '}') {
      if (depth === 0) {
        if (firstArg === null) firstArg = source.slice(argStart, i).trim()
        return { firstArg, callEnd: i }
      }
      depth -= 1
      i += 1
      continue
    }
    if (ch === ',' && depth === 0) {
      if (firstArg === null) firstArg = source.slice(argStart, i).trim()
      argStart = i + 1
      i += 1
      continue
    }
    i += 1
  }
  return { firstArg: firstArg ?? source.slice(argStart).trim(), callEnd: source.length }
}

/** 找出源码里所有 `console.*` 调用。 */
export function findLogCalls(source: string): LogCall[] {
  const calls: LogCall[] = []
  LOG_CALL.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = LOG_CALL.exec(source)) !== null) {
    // ⚠️ `match[0]` **以 `(` 结尾** ⇒ `(` 自己的下标是 `length - 1`。
    //   差一格的话 `parseCall` 会从 `(` **之后**开始扫 ⇒ 括号配平错位
    //   （实测：rAF 回调的范围会提前收尾，回调里的日志就落在范围外 ⇒ 判据失灵）。
    const open = match.index + match[0].length - 1
    const { firstArg, callEnd } = parseCall(source, open)
    calls.push({
      index: match.index,
      line: source.slice(0, match.index).split('\n').length,
      method: match[1],
      callText: source.slice(match.index, callEnd + 1),
      firstArg,
    })
  }
  return calls
}

/**
 * 取第一个实参里**字面量**的文本；不是字面量 ⇒ `null`。
 *
 * ⚠️ 模板串只取**第一个 `${` 之前**的部分 —— 那才是「消息的固定开头」，
 *   正是前缀该在的位置。
 */
export function literalHead(argText: string): string | null {
  const text = argText.trim()
  if (text.length === 0) return null
  const quote = text[0]
  if (quote !== '"' && quote !== "'" && quote !== '`') return null
  if (quote === '`') {
    const end = text.indexOf('${')
    return end < 0 ? text.slice(1, -1) : text.slice(1, end)
  }
  // 单双引号：找到配对的收尾引号（转义已跳过）
  let i = 1
  while (i < text.length) {
    if (text[i] === '\\') {
      i += 2
      continue
    }
    if (text[i] === quote) return text.slice(1, i)
    i += 1
  }
  return text.slice(1)
}

/** 模块前缀的形状：`[audio]` / `[sw]` / `[asset-prefetch]`。 */
const PREFIX = /^\[([a-z][a-z0-9-]*)\]/

/**
 * 取一条日志的模块前缀；不合规 ⇒ `null`。
 *
 * ⚠️ 「第一个实参不是字符串字面量」也算**不合规** ——
 *   `console.warn(err)` 里没有任何可辨认的模块名 ⇒ 排查时同样分不清来源。
 */
export function prefixOf(call: LogCall): string | null {
  const literal = literalHead(call.firstArg)
  if (literal === null) return null
  const match = PREFIX.exec(literal)
  return match === null ? null : match[1]
}

/** 逐帧上下文：`requestAnimationFrame(...)` / `setInterval(...)` 的调用范围。 */
export interface FrameRange {
  start: number
  end: number
  label: string
}

/** 找出源码里所有逐帧回调的调用范围。 */
export function findFrameRanges(source: string): FrameRange[] {
  const ranges: FrameRange[] = []
  const pattern = /\b(requestAnimationFrame|setInterval)\s*\(/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source)) !== null) {
    const open = match.index + match[0].length - 1
    const { callEnd } = parseCall(source, open)
    ranges.push({ start: match.index, end: callEnd, label: match[1] })
  }
  return ranges
}

/**
 * 一条**例外**：第一个实参不是字面量、但确实带模块前缀的日志。
 *
 * ⚠️ 每条都要写清**为什么合法**与**前缀由谁产出** ——
 *   没有理由的例外就是「守卫允许了它要防的违规」。
 */
export interface PrefixException {
  /** 相对仓库根的文件路径。 */
  file: string
  /** 该日志调用在文件里的**逐字**调用文本（锚点；不写行号 —— R-31）。 */
  call: string
  /** 为什么它是合法的。 */
  reason: string
  /** 前缀由谁产出：那个文件里必须仍含这一段文字，否则例外的前提没了。 */
  producedBy: { file: string; mustContain: string }
}

/** 例外清单（全仓只有这一条）。 */
const PREFIX_EXCEPTIONS: readonly PrefixException[] = [
  {
    file: 'src/app/effects-runner.ts',
    call: 'console.info(effect.line)',
    reason:
      'TRACE Effect 的 `line` 是**运行期**的值：由 `src/core/effects.ts` 的 ' +
      '`turnLogLine` 产出，它逐字以 `[core] turn ` 开头 —— 前缀在值里，不在源码字面量里',
    producedBy: { file: 'src/core/effects.ts', mustContain: '[core] turn' },
  },
]

/** 判据 ① 的结果：违规清单 + 例外的命中次数。 */
export interface PrefixScan {
  problems: string[]
  /** 例外下标 → 命中的次数（每条例外必须**恰好**一次）。 */
  usedExceptions: Map<number, number>
}

/**
 * 判据 ①：每条日志都要有模块前缀（例外清单除外）。
 *
 * @param source 剥过注释的源码
 * @param label  报告里用的文件标识
 * @param exceptions 例外清单
 */
export function checkPrefixes(
  source: string,
  label: string,
  exceptions: readonly PrefixException[] = [],
): PrefixScan {
  const problems: string[] = []
  const usedExceptions = new Map<number, number>()
  for (const call of findLogCalls(source)) {
    if (prefixOf(call) !== null) continue
    const exceptionIndex = exceptions.findIndex(
      (e) => e.file === label && e.call === call.callText,
    )
    if (exceptionIndex >= 0) {
      usedExceptions.set(exceptionIndex, (usedExceptions.get(exceptionIndex) ?? 0) + 1)
      continue
    }
    problems.push(
      `${label}:${call.line} —— console.${call.method}() 的第一个实参没有 [模块前缀]：` +
        `实测「${call.firstArg.slice(0, 40)}」` +
        '（R-14：日志要能一眼看出是哪个模块打的）',
    )
  }
  return { problems, usedExceptions }
}

/** 判据 ②：日志不得落在逐帧回调里。 */
export function checkNotPerFrame(source: string, label: string): string[] {
  const problems: string[] = []
  const frames = findFrameRanges(source)
  for (const call of findLogCalls(source)) {
    for (const frame of frames) {
      if (call.index >= frame.start && call.index <= frame.end) {
        problems.push(
          `${label}:${call.line} —— console.${call.method}() 落在 ${frame.label}(…) 的回调里` +
            '（R-14：逐帧路径上打日志会拖垮低端平板；而且开发机上看不出来）',
        )
      }
    }
  }
  return problems
}

/** 被扫描的全部文件。 */
const SCANNED_FILES: readonly string[] = SCANNED_DIRS.flatMap((dir) => listSourceFiles(dir))

describe('G323 —— R-14 的第二半：services / app / components 的带前缀日志（DF-049）', () => {
  it('扫描面自检：真实文件里**扫得到**日志（扫不到 ⇒ 全绿是假的）', () => {
    const calls = findLogCalls(cleanedSource('src/services/audio.ts'))
    expect(
      calls.length,
      '扫描面自检：`src/services/audio.ts` 里一条 `console.*` 都扫不到 —— ' +
        '说明扫描器坏了（或该文件真的没有日志），此时下面所有「没有违规」都不可信',
    ).toBeGreaterThan(0)
    expect(
      calls.map((c) => prefixOf(c)),
      '扫描面自检：`src/services/audio.ts` 的日志应全部带 `[audio]` 前缀',
    ).toEqual(calls.map(() => 'audio'))
  })

  it('判据 ①：每条 `console.*` 都带模块前缀（例外清单除外）', () => {
    const problems: string[] = []
    const usedExceptions = new Map<number, number>()
    for (const file of SCANNED_FILES) {
      const scan = checkPrefixes(cleanedSource(file), file, PREFIX_EXCEPTIONS)
      problems.push(...scan.problems)
      for (const [index, count] of scan.usedExceptions) {
        usedExceptions.set(index, (usedExceptions.get(index) ?? 0) + count)
      }
    }

    expect(
      problems,
      `R-14「确需日志时带模块前缀」被违反了：\n${problems.join('\n')}`,
    ).toEqual([])
  })

  it('例外清单：每条都**恰好**命中一次（多了 = 锚点被扩大，少了 = 已过期）', () => {
    const usedExceptions = new Map<number, number>()
    for (const file of SCANNED_FILES) {
      const scan = checkPrefixes(cleanedSource(file), file, PREFIX_EXCEPTIONS)
      for (const [index, count] of scan.usedExceptions) {
        usedExceptions.set(index, (usedExceptions.get(index) ?? 0) + count)
      }
    }

    const problems: string[] = []
    PREFIX_EXCEPTIONS.forEach((exception, index) => {
      const count = usedExceptions.get(index) ?? 0
      if (count !== 1) {
        problems.push(
          `例外 #${index}（${exception.file} 的 \`${exception.call}\`）命中 ${count} 次` +
            '（必须恰好 1 次：0 次 = 已过期/被改写；多于 1 次 = 锚点扩大到了别的调用）',
        )
      }
    })

    expect(problems, `例外清单与现状对不上：\n${problems.join('\n')}`).toEqual([])
  })

  it('例外的前提没被抽掉：前缀的**生产者**仍带 `[core] turn `', () => {
    const problems: string[] = []
    for (const exception of PREFIX_EXCEPTIONS) {
      const source = cleanedSource(exception.producedBy.file)
      if (!source.includes(exception.producedBy.mustContain)) {
        problems.push(
          `${exception.file} 的例外失去了前提：${exception.producedBy.file} 里已找不到` +
            `「${exception.producedBy.mustContain}」—— 那条日志现在**真的没有前缀**了`,
        )
      }
    }

    expect(problems, `例外的前提没了：\n${problems.join('\n')}`).toEqual([])
  })

  it('判据 ②：没有日志落在逐帧回调（requestAnimationFrame / setInterval）里', () => {
    const problems: string[] = []
    for (const file of SCANNED_FILES) {
      problems.push(...checkNotPerFrame(cleanedSource(file), file))
    }

    expect(
      problems,
      `R-14「不在逐帧路径」被违反了：\n${problems.join('\n')}`,
    ).toEqual([])
  })

  it('反向夹具 ①：无前缀的日志必须被报出来', () => {
    const source = ["console.warn('图片加载失败')"].join('\n')
    const problems = checkPrefixes(source, 'fixture.ts').problems

    expect(
      problems.length,
      '反向夹具失效：`console.warn(\'图片加载失败\')` 没有被判成违规 —— ' +
        '判据若对「前缀在不在」毫无反应，下面几条就是装饰',
    ).toBeGreaterThan(0)
    expect(problems.join('\n')).toContain('[模块前缀]')
  })

  it('反向夹具 ②：前缀不合规（大写 / 带空格 / 没有方括号）必须被报出来', () => {
    for (const literal of ["'[Audio] 加载失败'", "'[ audio ] 加载失败'", "'audio 加载失败'"]) {
      const problems = checkPrefixes(`console.warn(${literal})`, 'fixture.ts').problems
      expect(
        problems.length,
        `反向夹具失效：前缀 ${literal} 没有被判成违规`,
      ).toBeGreaterThan(0)
    }
  })

  it('反向夹具 ③：第一个实参不是字面量（分不清来源）必须被报出来', () => {
    const problems = checkPrefixes('console.warn(err)', 'fixture.ts').problems
    expect(
      problems.length,
      '反向夹具失效：`console.warn(err)` 没有被判成违规 —— ' +
        '它的消息里根本没有模块名，排查时同样分不清来源',
    ).toBeGreaterThan(0)
  })

  it('反向夹具 ④：例外只认**逐字**的那一处（别的调用不因同文件而豁免）', () => {
    const problems = checkPrefixes(
      "console.info(effect.line)\nconsole.info(other.line)",
      'src/app/effects-runner.ts',
      PREFIX_EXCEPTIONS,
    ).problems
    expect(
      problems.length,
      '反向夹具失效：例外锚定失效 —— `console.info(other.line)` 没被报出来，' +
        '说明例外清单变成了「整个文件都豁免」',
    ).toBeGreaterThan(0)
  })

  it('反向夹具 ⑤：日志落在 requestAnimationFrame / setInterval 回调里必须被报出来', () => {
    const rAF = [
      'requestAnimationFrame(() => {',
      "  console.warn('[audio] 每帧一次')",
      '})',
    ].join('\n')
    const interval = [
      'setInterval(() => {',
      "  console.warn('[audio] 每秒一次')",
      '}, 1000)',
    ].join('\n')

    for (const [name, source] of [
      ['requestAnimationFrame', rAF],
      ['setInterval', interval],
    ] as const) {
      const problems = checkNotPerFrame(source, 'fixture.ts')
      expect(
        problems.length,
        `反向夹具失效：落在 ${name} 回调里的日志没有被报出来`,
      ).toBeGreaterThan(0)
    }
  })

  it('反向夹具 ⑥：逐帧判据不许误伤普通日志（事件回调里的日志是允许的）', () => {
    const source = [
      'function onImageError(): void {',
      "  console.warn('[content] 词图加载失败')",
      '}',
    ].join('\n')

    expect(
      checkNotPerFrame(source, 'fixture.ts'),
      '逐帧判据误伤了普通事件回调里的日志 —— R-14 允许「确需日志」，判据不许把日志一刀切掉',
    ).toEqual([])
  })
})
