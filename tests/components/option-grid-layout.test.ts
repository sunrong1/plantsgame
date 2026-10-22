/**
 * 选项行网格布局的**源码级**守卫（Story 2.4 / AC-D3；守卫 **G270**）。
 *
 * ── 守什么 ────────────────────────────────────────────────────────────────
 * `.question-card__options` 的列定义**不得再写死列数**，必须由子项数量自适应。
 *
 * ── 为什么是源码级而不是像素级 ────────────────────────────────────────────
 * jsdom **不做布局**（`getComputedStyle` 在 jsdom 里返回的是「声明值或空串」，
 * 不是算出来的盒模型 —— `tests/components/portrait-layout.test.ts` 的文件头逐字记着
 * 这一点）。所以「2 / 3 / 4 个选项各占多宽、会不会横向溢出」在 jsdom 里**测不出来**。
 * ⇒ 像素那一半由**真浏览器实测**承担（story 2.4 的 T4.3 / AC-F1 实测表），
 *   本文件只守**声明**这一半：列数不得写死、轨道不得被 min-content 撑开、
 *   按行流不得被改掉。
 *
 * ── 判据纪律 ──────────────────────────────────────────────────────────────
 * · **先剥注释再匹配**（R-52）：`.vue` 里的样式注释里大量出现「四列」「repeat(4, …)」
 *   这类字样（Story 1.11 的 AC-F1 逐字写着「四个选项在竖屏平板宽度下并排且不挤」）
 *   —— 不剥注释的话，判据会读到注释里的字面量，而不是真正的声明。
 * · **不写死「必须是 auto-fit」**：`auto-fill` 同样是「由子项数量决定列数」的写法，
 *   两者在本布局下等价。判据守的是**性质**（列数不由字面量决定），不是**写法**。
 * · **每条都有反向自测**（R-51 / T6.5）：把违规形态（写死 4 列）**真写进探针字符串**，
 *   证明判据会红。
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { stripComments } from '../fixtures/strip-comments'

const root = process.cwd()

/** 读并剥掉注释的源码（R-52）。 */
function sourceOf(relative: string): string {
  return stripComments(readFileSync(join(root, relative), 'utf8'))
}

const questionCardSource = sourceOf('src/components/quiz/QuestionCard.vue')

/**
 * 切出 `<style>` 块（判据只该看样式，不该把模板当 CSS）。
 *
 * ⚠️ 模板里也有大括号（`v-for` / `:prop="…"` 附近）⇒ 不切块就会把模板片段
 *   当成「选择器 + 规则体」。
 */
function styleBlockOf(source: string): string {
  const open = source.indexOf('<style')
  if (open === -1) return ''
  const close = source.indexOf('</style>', open)
  if (close === -1) return ''
  const start = source.indexOf('>', open)
  if (start === -1) return ''
  return source.slice(start + 1, close)
}

/** 取一条规则的选择器与声明体（`{…}` 配平）。 */
function ruleOf(source: string, selector: string): { selector: string; body: string } | null {
  const re = new RegExp(`(^|[}\\s])${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`, 'g')
  const m = re.exec(source)
  if (m === null) return null
  return { selector: m[1] + selector, body: m[2] ?? '' }
}

/** `.question-card__options` 这条规则（找不到就是夹具坏了 ⇒ 抛错，不静默放过）。 */
function optionsRule(): { selector: string; body: string } {
  const rule = ruleOf(styleBlockOf(questionCardSource), '.question-card__options')
  if (rule === null) {
    throw new Error('QuestionCard.vue 的 <style> 里找不到 `.question-card__options` —— 判据失效')
  }
  return rule
}

/** 规则里某个属性的声明值（没有则返回 `''`）。 */
function declarationOf(body: string, property: string): string {
  const m = new RegExp(`${property}\\s*:\\s*([^;]+);`).exec(body)
  return (m?.[1] ?? '').trim()
}

describe('G270 —— 选项行的列数由子项数量决定，不得写死（Story 2.4 / AC-D3）', () => {
  it('列定义不含写死的列数（`repeat(4, …)` 这类字面量一律不许出现）', () => {
    const declaration = declarationOf(optionsRule().body, 'grid-template-columns')

    expect(
      declaration,
      '`.question-card__options` 没有声明 `grid-template-columns` —— ' +
        '选项行会退回单列流，2 个选项时上下排成两行，1.11 的「并排」基线失效',
    ).not.toBe('')

    // 判据本体：任何 `repeat(<数字>, …)` 都是写死的列数。
    const fixedCount = /repeat\(\s*\d+\s*,/.exec(declaration)
    expect(
      fixedCount,
      `列定义写死了列数（${fixedCount?.[0] ?? ''}）—— 选项数由 ` +
        '`src/content/option-count.ts` 的档位表决定（单元 1 = 2 / 3 个，后面的单元最多 4 个），' +
        '列数若写死，2 个选项时右侧两列全空，孩子看到的是两个窄按钮贴在左半边 —— ' +
        '那是一个看得出没做完的卡面',
    ).toBeNull()

    // 反向自测：判据在**真违规形态**上会红（R-51 / R-53：先在真文本上自测一次）。
    const probe = 'repeat(4, 1fr)'
    expect(
      /repeat\(\s*\d+\s*,/.exec(probe),
      '判据在写死 4 列的真违规形态上没匹配上 ⇒ 判据本身失效（它可能恒不匹配）',
    ).not.toBeNull()
  })

  it('列定义是自适应的（`auto-fit` / `auto-fill` 之一）', () => {
    const declaration = declarationOf(optionsRule().body, 'grid-template-columns')

    expect(
      /auto-(fit|fill)/.test(declaration),
      `列定义是「${declaration}」，既不是 auto-fit 也不是 auto-fill —— ` +
        '自适应有两种写法（auto-fit 与 auto-fill 在本布局下等价），但**不是**它们就意味着' +
        '列数又被写死了',
    ).toBe(true)
  })

  it('轨道宽度是 `minmax(0, …)`（否则 min-content 会把整行推出屏幕）', () => {
    const declaration = declarationOf(optionsRule().body, 'grid-template-columns')

    expect(
      /minmax\(\s*0\s*,/.test(declaration),
      `列定义是「${declaration}」，没有用 minmax(0, …) —— ` +
        '写成 `1fr` 时轨道的最小宽度是 auto（min-content）：一个长单词就会把轨道撑大、' +
        '把整行推出屏幕（横向溢出），而溢出在竖屏平板上是看不见的（内容被裁掉）',
    ).toBe(true)
  })

  it('没有把按行流改成按列流（横屏 2×2 布局被 G169 逐字钉死）', () => {
    const body = optionsRule().body
    const flow = declarationOf(body, 'grid-auto-flow')

    expect(
      flow,
      '`.question-card__options` 声明了 `grid-auto-flow` —— ' +
        '横屏那套 2×2（`src/styles/responsive.css` 的 `@media (min-aspect-ratio: 1/1)`，' +
        '被守卫 G169 逐字钉死）依赖**默认的按行流**：一旦改成按列流，' +
        '横屏的 2×2 会变成列优先的排布 —— 那是一条已锁死的横屏布局规则，不在本 story 范围',
    ).toBe('')
  })
})
