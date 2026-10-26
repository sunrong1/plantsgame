/**
 * ── G333 —— R-05「动效只走 CSS」的 **`.ts` 侧**全局守卫 ─────────────────────
 *
 * ── 守什么 ────────────────────────────────────────────────────────────────
 * R-05 逐字写着：「动效只走『状态 → class → CSS 过渡』。**禁止 JS 补间、
 * `setInterval`、`requestAnimationFrame` 逐帧改样式**」，而它自己的守卫字段写着
 * 「⚠️ **部分** —— `tests/components/hand-build.test.ts` 对 1.12 新增组件有源码级判据，
 * **但不是全局守卫**」。
 *
 * ⇒ 现状：**`.vue` 那一侧已经是全局的**（守卫 **G38** 用共享扫描面
 *   `allVueSources(root)` 扫 `src/` 下**全部** `.vue`，**G315** 另外钉住
 *   「扫描面不许缩回 4 个文件的老名单」）。
 *   **缺的是 `.ts` 那一侧** —— `src/app/**` / `src/services/**` / `src/core/**`
 *   里的定时器与逐帧改样式**无人看**。
 * ⇒ 本守卫补上 `.ts` 那一侧，两侧合起来才是 R-05 的**全局**守卫。
 *
 * ── 为什么 `.ts` 侧要单开一条，而不是把 G38 的扫描面扩到 `.ts` ──────────
 *   ① **豁免面不同**：`src/services/pronunciation.ts` 有两处 `setTimeout`
 *      （TTS **预热超时**与**分块推进**的节奏）—— 那**不是动效**，是音频时序。
 *      `.vue` 侧零豁免，`.ts` 侧要一条**带理由、带锚点**的例外清单。
 *   ② **判据形态不同**：`.ts` 侧要能报出**确切的那一处调用**（例外靠锚点豁免），
 *      而 G38 的共享判据只报「某文件出现了 setTimeout」这一类形态。
 *      ⇒ 两侧**判据不同、扫描面不同**（`.vue` vs `.ts`），**不重叠、不互相顶替**。
 *
 * ── 例外清单纪律（照抄 `log-prefix-boundary.test.ts` 那套）─────────────────
 *   每条例外写明：**在哪个文件**、**哪一句调用**（逐字）、**为什么合法**。
 *   守卫再去核：那条调用**恰好命中一次**（多了 = 锚点被扩大，少了 = 已过期），
 *   以及它的**前提**（那个常量还在不在）—— 前提没了，例外当场失效。
 *
 * ── 判据形态（为什么是「调用」而不是「某个词」）─────────────────────────
 *   禁的是**行为**：`setTimeout(...)` / `setInterval(...)` /
 *   `requestAnimationFrame(...)` 这类**定时器调用**、Web Animations 的
 *   `el.animate(...)`、以及 `el.style.xxx = ...` 这种**逐帧改样式**。
 *   ⚠️ 判据用 **TypeScript 的 AST**（不是正则）⇒
 *   · 注释与字符串里的字面量天然不算调用（R-52）；
 *   · `el.style.top = 3` 这种**赋值**也认得（它不是调用，纯调用判据会漏）。
 *
 * ── 变异验证（R-50 触发条件 ②：判据依赖源码书写形态）────────────────────
 * **M406**：往 `src/app/effects-runner.ts` 注入一行
 *   `setTimeout(() => { … }, 120)`
 *   ⇒ G333.1 **确实变红**（点名文件与那一处调用）⇒ 判据真的在咬。
 * **M407**：同一处改成 `el.style.opacity = '0.5'`（**逐帧改样式**，不是调用）
 *   ⇒ 仍**变红** ⇒ 「只认调用」的那种窄判据被堵住了。
 * 两次都已复原（`git diff --stat src/app/effects-runner.ts` 无输出）。
 *
 * ── 出处 ──────────────────────────────────────────────────────────────────
 * **DF-189** 销账进度表里的 **R-05** 那一行（逐字：「『动效只走 CSS』没有全局守卫，
 * 只有两条组件级判据 … `src/components/**` 里**零定时器** ⇒ 现状合规」）
 * ＋ **R-05** 本身。
 *
 * 不在 src/core/ 下 —— NFR16：测试全部在 tests/。
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../', import.meta.url))

/** 禁掉的定时器 API（调用形态）。 */
export const BANNED_TIMERS = [
  'setTimeout',
  'setInterval',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'requestIdleCallback',
] as const

/**
 * 例外清单：`.ts` 侧唯一允许的两处定时器。
 *
 * ⚠️ 每条都要写清**为什么合法** —— 没有理由的例外就是「守卫允许了它要防的违规」。
 */
export const TIMER_EXCEPTIONS: readonly {
  readonly file: string
  readonly call: string
  readonly why: string
  /** 例外的前提：那个常量**仍在**文件里（前提没了 ⇒ 例外当场失效）。 */
  readonly premise: string
}[] = [
  {
    file: 'src/services/pronunciation.ts',
    call: 'setTimeout(settle, PREHEAT_TIMEOUT_MS)',
    why: 'TTS 语音**预热超时**（等引擎就绪），不是动效 —— 动效那条在 `.vue` 侧另有 G38 守',
    premise: 'PREHEAT_TIMEOUT_MS',
  },
  {
    file: 'src/services/pronunciation.ts',
    call: 'setTimeout(advance, CHUNK_TIMEOUT_MS)',
    why: 'TTS **分块推进**的节奏（长句按块念），不是动效',
    premise: 'CHUNK_TIMEOUT_MS',
  },
]

/** 递归列出 `src/` 下全部 `.ts` 文件（仓库相对路径）。 */
function tsFilesUnder(dir: string = join(root, 'src')): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...tsFilesUnder(path))
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      out.push(relative(root, path).replace(/\\/g, '/'))
    }
  }
  return out.sort()
}

/** 一次命中：哪个文件、哪种形态、命中的源码文本。 */
export interface TimerHit {
  readonly file: string
  readonly label: string
  readonly text: string
}

/**
 * 判据本体：列出 `.ts` 源码里的「定时器调用 / Web Animations / 逐帧改样式」。
 *
 * 抽成函数是为了让**反向自测真的调用判据本体**（R-51）。
 */
export function timerHits(file: string, source: string): TimerHit[] {
  const sf = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  )
  const hits: TimerHit[] = []

  const visit = (node: ts.Node): void => {
    // ① 定时器调用。
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      (BANNED_TIMERS as readonly string[]).includes(node.expression.text)
    ) {
      hits.push({ file, label: node.expression.text, text: node.getText(sf) })
    }
    // ② Web Animations：`el.animate(...)`。
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'animate'
    ) {
      hits.push({ file, label: 'animate()', text: node.getText(sf) })
    }
    // ③ 逐帧改样式：`el.style.xxx = ...`（**赋值**，不是调用 ⇒ 纯调用判据会漏）。
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(node.left) &&
      /\.style\./.test(node.left.getText(sf))
    ) {
      hits.push({ file, label: 'style 赋值', text: node.getText(sf) })
    }
    ts.forEachChild(node, visit)
  }

  visit(sf)
  return hits
}

describe('G333 —— R-05：`.ts` 侧零定时器 / 零逐帧改样式（例外清单除外）', () => {
  it('G333.1 `src/` 下的 `.ts` 里没有定时器调用与逐帧改样式', () => {
    const files = tsFilesUnder()
    const hits: TimerHit[] = []
    for (const file of files) {
      hits.push(...timerHits(file, readFileSync(join(root, file), 'utf8')))
    }

    const problems = hits
      .filter((hit) => !isExempt(hit))
      .map((hit) => `${hit.file} → ${hit.label}：${hit.text}`)

    expect(
      problems,
      `R-05：动效只走「状态 → class → CSS 过渡」—— .ts 侧不许有定时器或逐帧改样式：\n${problems.join('\n')}`,
    ).toEqual([])

    // 非空自检：一条都没扫到 ⇒ 判据在空集上成立（扫描面塌了）。
    expect(files.length, '一个 src/ 的 .ts 文件都没扫到 ⇒ 判据在空集上成立').toBeGreaterThan(10)
    expect(hits.length, '一条定时器 / 逐帧改样式都没扫到 ⇒ 例外清单那条也无从核对（扫描面塌了）')
      .toBeGreaterThan(0)
  })

  it('G333.2 例外清单：每条都**恰好命中一次**，且前提仍在', () => {
    const hits: TimerHit[] = []
    for (const file of tsFilesUnder()) {
      hits.push(...timerHits(file, readFileSync(join(root, file), 'utf8')))
    }

    const problems: string[] = []
    for (const exception of TIMER_EXCEPTIONS) {
      const matched = hits.filter(
        (hit) => hit.file === exception.file && hit.text === exception.call,
      )
      if (matched.length !== 1) {
        problems.push(
          `${exception.file} 的例外「${exception.call}」命中 ${matched.length} 次` +
            '（多了 = 锚点被扩大，少了 = 已过期）—— 例外清单必须与现状逐字对得上',
        )
      }
      const source = readFileSync(join(root, exception.file), 'utf8')
      if (!source.includes(exception.premise)) {
        problems.push(
          `${exception.file} 的例外失去了前提：文件里已找不到「${exception.premise}」—— ` +
            `例外「${exception.call}」的前提没了（${exception.why}）`,
        )
      }
    }
    expect(
      problems,
      `例外清单与现状对不上：\n${problems.join('\n')}`,
    ).toEqual([])
  })

  it('G333.3 反向自测：判据本体真的能抓住各种形态（判据不是恒绿）', () => {
    const source = [
      'export function probe(el: HTMLElement): void {',
      "  setTimeout(() => { /* noop */ }, 120)",
      "  const timer = setInterval(() => { /* noop */ }, 30)",
      "  requestAnimationFrame(() => { /* noop */ })",
      "  el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120 })",
      "  el.style.opacity = '0.5'",
      '}',
    ].join('\n')
    const labels = timerHits('src/probe.ts', source).map((h) => h.label)

    for (const expected of ['setTimeout', 'setInterval', 'requestAnimationFrame', 'animate()', 'style 赋值']) {
      expect(
        labels,
        `构造失效：「${expected}」这种形态没被抓出来 —— 判据漏了一种写法\n实得：${labels.join('、')}`,
      ).toContain(expected)
    }
  })

  it('G333.4 反向自测：注释与字符串里的字面量**不算**调用（R-52）', () => {
    const source = [
      '// setTimeout(() => {}, 100) —— 注释里提到定时器，不是调用',
      '/* requestAnimationFrame(() => {}) 块注释 */',
      "const doc = 'setTimeout(() => {}, 100)'",
      'export function noop(): void {}',
    ].join('\n')
    expect(
      timerHits('src/probe.ts', source),
      '构造失效：注释 / 字符串里的字面量被判成了调用 ⇒ 判据在按文本匹配（R-52）',
    ).toEqual([])
  })
})

/** 某次命中是否被例外清单豁免（逐字匹配调用文本）。 */
function isExempt(hit: TimerHit): boolean {
  return TIMER_EXCEPTIONS.some(
    (exception) => exception.file === hit.file && exception.call === hit.text,
  )
}
