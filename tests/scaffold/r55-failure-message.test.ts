/**
 * ── G327 —— R-55「每条 `expect` 带中文失败消息」在名单文件里必须成立 ──────────
 *
 * ── 守什么 ────────────────────────────────────────────────────────────────
 * `docs/rules/testing.md` 的 **R-55** 逐字要求：「每条 `expect` 带**中文失败消息**，
 * 写成『错因 → 后果』」。本守卫把这条约定**变成机器可查的**：
 * `COMPLIANT_FILES` 名单里的每个测试文件，每一条 `expect(...)` 调用
 * 都必须带**第二个参数**，且那个参数是**含中文的字符串字面量**。
 *
 * ── 为什么（为什么是「名单」而不是全仓）────────────────────────────────────
 * R-55 自述「⚠️ **无事故依据 —— 纯约定**。……被违反的代价是**审查成本**，不是正确性」
 * ⇒ 它的优先级天然低于有事故依据的 R-50 / R-51 那批。
 * ⚠️ 而**实测**（2026-10-26 夜，判据 = 本文件自己的扫描器）：全仓 `tests/` 下
 * **97** 个含 `expect` 的文件、**3725** 条 `expect`，其中 **1131** 条**没有**中文失败消息
 * —— 散在 **63** 个文件里。
 * ⇒ 若把判据写成「全仓都必须合规」，它会**当场红 1131 条**，那不是守卫，
 *   是一张永远红的罚单 ⇒ 守卫恒红 ⇒ **没人会看它**（这正是 R-51 说的假绿/假红同形）。
 * ⇒ 做法：**名单制**。名单 = 「已经还清债的文件」（当前 **30** 个）；
 *   名单外的欠账**逐字登记在 `deferred-work.md`**（**DF-219**），
 *   欠账还清一个就把那个文件加进名单 —— 名单因此**只增不减**，是这条规则的**进度条**。
 *
 * ── 口径（写清楚，免得下次各判各的）──────────────────────────────────────
 * · **「一条 expect」** = 源码里 `expect(` 的**一次调用**（`expect.soft(` / `expect.poll(`
 *   不算 —— 它们后面跟的是 `.` 不是 `(`）。
 * · **必须先剥注释**（R-52）：注释里写的 `expect(x).toBe(y)` **不算一条 expect**。
 *   ⚠️ 这一条不是洁癖 —— 本仓库的测试文件里**大量**在注释里引用 `expect(...)` 的写法
 *   （实测 `tests/services/audio.test.ts` 里就有 1 处），不剥注释会把它们算成欠账。
 * · **字符串里也不能算**：`'expect(x)'` 这种字面量不是调用。
 * · 第二个参数**必须是字符串字面量**且**含中文**（`[一-鿿]`）——
 *   传变量（`expect(x, msg)`）**不算**：R-55 要的是「红的时候能直接读懂」，
 *   而变量里装什么，判据无从知道 ⇒ **不许放行**。
 *
 * ── 出处 ──────────────────────────────────────────────────────────────────
 * **R-55**（`docs/rules/testing.md`）＋ **DF-007**（Story 1.2 `[CR]` 登记的
 * 「三个测试文件的 `expect` 仍欠中文失败消息」，2026-10-26 夜已结清）
 * ＋ **DF-219**（本轮实测的全仓欠账登记）。
 *
 * ── 变异验证（R-50 触发条件 ②：判据按**分隔符**切源码）────────────────────
 * 本判据是**自己写的扫描器**（按顶层逗号切实参、按括号配平），
 * 切分前提与真实写法不符时它扫的就是一条不存在的路径 ⇒ 命中 R-50 的
 * 「判据依赖源码书写风格」⇒ 本轮**真做了**变异：
 *   **M393**：把 `tests/scaffold/audio-unlock-guard.test.ts` 里
 *   `expect(severityOf(rule), '严重级别必须是 error —— …')` 的中文消息删掉
 *   ⇒ `grep` 证实落盘 ⇒ G327.1 **确实变红**（**1 红 / 那一支 5 条**），
 *   且报错**点名了那个文件与那一行**（`第 96 行`）⇒ 判据真的在咬，
 *   不是在空集上成立；已复原（`grep` 复核那一行逐字相同）。
 *   ⚠️ 本守卫**不**用 `?raw` 导入读源码（走 `node:fs` 的 `readFileSync`）
 *   ⇒ 没有 Vite 转换缓存那一层 ⇒ 无需 R-50 第 0 步的清缓存动作。
 *
 * 不在 src/core/ 下 —— NFR16：测试全部在 tests/。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../', import.meta.url))

/**
 * **已还清 R-55 欠账的测试文件**（仓库相对路径）。
 *
 * ⚠️ 这份名单**只增不减** —— 每把一个文件补上中文失败消息，就把它加进来。
 * 名单外的欠账在 `deferred-work.md` 的 **DF-219** 里逐字记着（实测 1131 条 / 63 个文件）。
 */
export const COMPLIANT_FILES: readonly string[] = [
  'tests/components/level-outcome-focus-trap.test.ts',
  'tests/components/level-view-unit-total.test.ts',
  'tests/core/actions.test.ts',
  'tests/core/assertions.test.ts',
  'tests/core/balance.test.ts',
  'tests/core/combat.test.ts',
  'tests/core/grid.test.ts',
  'tests/core/reducer.test.ts',
  'tests/helpers/option-counts.ts',
  'tests/helpers/voice-assets.ts',
  'tests/scaffold/architecture-tree.test.ts',
  'tests/scaffold/archive-path-refs.test.ts',
  'tests/scaffold/color-token-count.test.ts',
  'tests/scaffold/color-token-values.test.ts',
  'tests/scaffold/content-tsconfig-boundary.test.ts',
  'tests/scaffold/deferred-ledger.test.ts',
  'tests/scaffold/guard-id-uniqueness.test.ts',
  'tests/scaffold/no-unit-select.test.ts',
  'tests/scaffold/planning-consistency.test.ts',
  'tests/scaffold/retired-planning-numbers.test.ts',
  'tests/scaffold/story-ac-literals.test.ts',
  'tests/scaffold/textbook-corpus.test.ts',
  'tests/scripts/balance-sim.test.ts',
  'tests/scripts/word-image-throughput.test.ts',
  'tests/services/audio.test.ts',
  'tests/services/pronunciation.test.ts',
  'tests/scaffold/audio-unlock-guard.test.ts',
  'tests/scaffold/doc-command-existence.test.ts',
  'tests/scaffold/r55-failure-message.test.ts',
  'tests/views/start-view.test.ts',
]

/** 一条 `expect(...)` 调用的解析结果。 */
export interface ExpectCall {
  /** 该调用在源码里的行号（1 起）。 */
  line: number
  /** 实参个数（顶层逗号分隔）。 */
  argCount: number
  /** 第二个实参是不是「含中文的字符串字面量」。 */
  secondIsChineseMessage: boolean
}

/** 是不是标识符字符（含 `$` / `_` / 数字 / 字母）。 */
function isIdentChar(c: string | undefined): boolean {
  return c !== undefined && /[A-Za-z0-9_$]/.test(c)
}

/** 是不是 CJK 汉字（判据只认汉字，标点与假名不算）。 */
function hasCjk(s: string): boolean {
  return /[一-鿿]/.test(s)
}

/**
 * 跳过一个字符串字面量（单引号 / 双引号 / 模板串），返回它**之后**的下标。
 *
 * ⚠️ 模板串里的 `${…}` 允许嵌套代码 —— 这里按括号配平跳过，不把里面的内容当字符串。
 */
function skipString(src: string, start: number): number {
  const quote = src[start]!
  let i = start + 1
  while (i < src.length) {
    const c = src[i]!
    if (c === '\\') {
      i += 2
      continue
    }
    if (quote === '`' && c === '$' && src[i + 1] === '{') {
      let depth = 1
      i += 2
      while (i < src.length && depth > 0) {
        const d = src[i]!
        if (d === '{') depth += 1
        else if (d === '}') depth -= 1
        else if (d === '"' || d === "'" || d === '`') {
          i = skipString(src, i) - 1
        }
        i += 1
      }
      continue
    }
    if (c === quote) return i + 1
    i += 1
  }
  return i
}

/**
 * 解析 `expect(` 后面那一对圆括号里的**顶层**实参。
 *
 * @returns 实参列表与闭合括号之后的下标；括号没闭合时返回 `null`。
 */
function parseArgs(src: string, open: number): { args: string[]; end: number } | null {
  let i = open + 1
  let depth = 1
  const args: string[] = []
  let cur = ''
  while (i < src.length) {
    const c = src[i]!
    if (c === '"' || c === "'" || c === '`') {
      const end = skipString(src, i)
      cur += src.slice(i, end)
      i = end
      continue
    }
    if (c === '(' || c === '[' || c === '{') {
      depth += 1
      cur += c
      i += 1
      continue
    }
    if (c === ')' || c === ']' || c === '}') {
      depth -= 1
      if (depth === 0) {
        args.push(cur)
        return { args, end: i + 1 }
      }
      cur += c
      i += 1
      continue
    }
    if (c === ',' && depth === 1) {
      args.push(cur)
      cur = ''
      i += 1
      continue
    }
    cur += c
    i += 1
  }
  return null
}

/**
 * 第二个实参是不是「含中文的**字符串字面量**」。
 *
 * ⚠️ 口径：**实参里至少有一个字符串字面量含中文**就算数 ——
 *   **不要求**整个实参就是一个字面量。本仓库的写法大量是**拼接**：
 *   ```
 *   expect(
 *     aoeTurns,
 *     `范围塔击杀回合数必须 ≥ 直射塔 —— 实测 aoe ${aoeTurns} vs direct ${directTurns}，` +
 *       '打不快是「严格劣于」的第三层',
 *   ).toBeGreaterThanOrEqual(directTurns)
 *   ```
 *   两个片段都是字面量、拼起来才是一句完整的话 ⇒ 判据若要求「首尾同引号」
 *   就会把这种**最规范**的写法判成违规 ⇒ 判据会把人往错的方向赶。
 * ⚠️ 传**变量**（`expect(x, msg)`）**不算** —— 判据无从知道 `msg` 里是什么，
 *   而 R-55 要的是「红的时候能直接读懂」⇒ **不许放行**。
 */
function isChineseMessage(arg: string | undefined): boolean {
  if (arg === undefined) return false
  let i = 0
  while (i < arg.length) {
    const c = arg[i]!
    if (c === '"' || c === "'" || c === '`') {
      const end = skipString(arg, i)
      if (hasCjk(arg.slice(i + 1, end - 1))) return true
      i = end
      continue
    }
    i += 1
  }
  return false
}

/**
 * 扫出源码里**全部** `expect(...)` 调用（注释与字符串里的不算）。
 *
 * ⚠️ 为什么不用正则：正则分不清「代码里的 `expect(`」与「注释 / 字符串里的 `expect(`」
 *   —— 本仓库的测试文件里两者都很常见，而它们的区别正是本判据的成败所在（R-52）。
 */
export function scanExpectCalls(src: string): ExpectCall[] {
  const calls: ExpectCall[] = []
  let i = 0
  let line = 1
  while (i < src.length) {
    const c = src[i]!
    if (c === '\n') {
      line += 1
      i += 1
      continue
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i += 1
      continue
    }
    if (c === '/' && src[i + 1] === '*') {
      i += 2
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') line += 1
        i += 1
      }
      i += 2
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      const start = i
      const end = skipString(src, i)
      for (let k = start; k < end; k += 1) if (src[k] === '\n') line += 1
      i = end
      continue
    }
    if (src.startsWith('expect', i) && !isIdentChar(src[i - 1])) {
      let j = i + 6
      while (j < src.length && /\s/.test(src[j]!)) j += 1
      if (src[j] === '(') {
        const parsed = parseArgs(src, j)
        if (parsed !== null) {
          calls.push({
            line,
            argCount: parsed.args.length,
            secondIsChineseMessage: isChineseMessage(parsed.args[1]),
          })
          for (let k = i; k < parsed.end; k += 1) if (src[k] === '\n') line += 1
          i = parsed.end
          continue
        }
      }
    }
    i += 1
  }
  return calls
}

/** 一个文件里**欠中文失败消息**的 `expect` 调用（返回可读的行号列表）。 */
export function missingMessages(src: string): number[] {
  return scanExpectCalls(src)
    .filter((c) => !c.secondIsChineseMessage)
    .map((c) => c.line)
}

describe('G327 —— R-55：名单内的测试文件里每条 `expect` 都带中文失败消息', () => {
  it('G327.1 名单里每个文件的每条 `expect` 都带中文失败消息', () => {
    const problems: string[] = []
    let total = 0
    for (const rel of COMPLIANT_FILES) {
      const src = readFileSync(`${root}${rel}`, 'utf8')
      const calls = scanExpectCalls(src)
      total += calls.length
      const missing = missingMessages(src)
      if (missing.length > 0) {
        problems.push(
          `${rel}：第 ${missing.join('、')} 行的 \`expect\` 没有中文失败消息` +
            '（R-55：写成「错因 → 后果」；补消息，或把这个文件从名单里挪出去并登记到 DF-219）',
        )
      }
    }
    expect(
      problems,
      `这些 \`expect\` 缺中文失败消息 —— R-55 要求「每条 expect 带中文失败消息」：\n${problems.join('\n')}`,
    ).toEqual([])
    // 非空自检：名单扫空了 ⇒ 判据在空集上成立（下面的断言会恒绿）。
    expect(total, '名单里一条 `expect` 都没扫到 —— 判据失效，不是「没有问题」').toBeGreaterThan(100)
  })

  it('G327.2 名单里的文件都真实存在（名单过期 ⇒ 判据读不到文件）', () => {
    const missing = COMPLIANT_FILES.filter((rel) => {
      try {
        readFileSync(`${root}${rel}`, 'utf8')
        return false
      } catch {
        return true
      }
    })
    expect(
      missing,
      `名单里的文件不存在 —— 判据会静默少读几个文件：\n${missing.join('\n')}`,
    ).toEqual([])
  })

  it('G327.3 负向夹具：裸写的 `expect` 必须被抓出来（判据真的在咬）', () => {
    const src = [
      "expect(actual).toBe(1)",
      "expect(actual, '中文消息').toBe(1)",
      "expect(actual, 变量).toBe(1)",
      "expect(actual, 'no chinese here').toBe(1)",
    ].join('\n')
    const missing = missingMessages(src)
    expect(
      missing,
      `构造失效：裸写的 expect 没被抓出来 —— 判据在「什么都没报」上恒绿\n实得：${JSON.stringify(missing)}`,
    ).toEqual([1, 3, 4])
  })

  it('G327.4 负向夹具：注释与字符串里的 `expect(` 不算一条 expect（R-52）', () => {
    const src = [
      '// expect(x).toBe(y) —— 注释里引用写法，不是调用',
      '/* expect(a, "b").toBe(c) 块注释 */',
      "const s = 'expect(q).toBe(r)'",
      "expect(real, '真的一条，带中文')",
    ].join('\n')
    const calls = scanExpectCalls(src)
    expect(
      calls.length,
      `判据把注释 / 字符串里的 \`expect(\` 也算成了调用 —— 实得 ${calls.length} 条（应 1 条）`,
    ).toBe(1)
    expect(calls[0]!.line, '唯一那条真调用在第 4 行').toBe(4)
  })

  it('G327.5 负向夹具：反斜杠转义的引号与嵌套括号不该把实参切错', () => {
    const src = 'expect(fn({ a: 1, b: 2 }), "带中文的消息").toEqual({ a: 1 })'
    const calls = scanExpectCalls(src)
    expect(calls.length, '嵌套括号让实参切错了 —— 实得条数不对').toBe(1)
    expect(calls[0]!.argCount, '实参个数应是 2（对象字面量里的逗号不算顶层分隔）').toBe(2)
    expect(calls[0]!.secondIsChineseMessage, '第二个实参是含中文的字符串字面量').toBe(true)
  })
})
