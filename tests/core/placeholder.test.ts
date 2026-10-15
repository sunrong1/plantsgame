/**
 * 占位图形常量的守卫（Story 1.11 / AC-B3）。
 *
 * ── 这个守卫守什么 ────────────────────────────────────────────────────────
 * 词图加载失败时组件渲染的内联 SVG **常量**必须满足三件事：
 *   ① 它是**字符串常量**，不造 DOM（`core/` 零 DOM 硬约束，AC-B3）
 *   ② 它**自包含** —— 不引用任何外部资源（否则「内联」二字是假的，
 *      而且「加载失败时的降级」会变成「再发一次注定失败的请求」）
 *   ③ 它**只经 `core/` 的 barrel 对外**（AR5：barrel 唯一出口）
 *
 * ⚠️ 为什么 ② 要单独立一条：AC-B2 明确禁掉了 `new Image()` / `fetch(`
 *   两条路，剩下的唯一合法形态就是「一段已经算好内容的字符串」。
 *   一段引用了外部文件的字符串仍然会发请求 —— 那不是降级，那是把失败推迟一次。
 *
 * ⚠️ 深路径 import 是**本仓库既有测试的写法**，不是本 story 另立的规矩
 *   （`unit-01.test.ts:31` / `schema.test.ts:35,43` / `content-boundary.test.ts:24`
 *   都是深路径，且零守卫强制）。`src/` 侧才必须走 barrel。
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import * as coreBarrel from '../../src/core'
import { WORD_IMAGE_PLACEHOLDER_SVG } from '../../src/core/placeholder'

const root = process.cwd()

/**
 * 剥掉块注释与行注释，只留代码。
 *
 * ⚠️ **这不是装饰，是本条判据能用的前提**（与 `battle-field.test.ts:61-64` /
 *   `asset-url-guard.test.ts:138-140` 同源，且是本 story **实测撞出来的**）：
 *   `placeholder.ts` 的文件头必须解释「为什么不用 `new Image()`」，
 *   而那句话里就含 `Image(` ⇒ 不剥注释时这条守卫在**代码完全正确**的情况下变红。
 *   误报的守卫会被当成噪声忽略，而那比没有守卫更糟。
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

describe('AC-B3 —— 占位图形常量是自包含的 SVG 字符串', () => {
  it('它是一个非空的字符串常量，且是完整的内联 SVG 文档', () => {
    expect(typeof WORD_IMAGE_PLACEHOLDER_SVG).toBe('string')
    const svg = WORD_IMAGE_PLACEHOLDER_SVG.trim()

    expect(svg.length).toBeGreaterThan(0)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.endsWith('</svg>')).toBe(true)
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
  })

  it('viewBox 是 512×512 —— 与词图的画布同形，降级时不会改变画面的几何比例', () => {
    // 词图全部是 `viewBox="0 0 512 512"`。占位图形若用别的尺寸，
    // 降级的一瞬间整张卡会重排，而「图没了」本来就该是**形状不变、只换内容**。
    expect(WORD_IMAGE_PLACEHOLDER_SVG).toContain('viewBox="0 0 512 512"')
  })

  it('自包含：不含任何外部引用 —— 没有 <image>、没有 href、没有脚本', () => {
    const svg = WORD_IMAGE_PLACEHOLDER_SVG

    // `<image href>` 与 `href` 都会在渲染时发一次网络请求，
    // 而本 story 的前提恰恰是「这张图已经加载失败了」⇒ 再发一次只会再失败一次。
    expect(svg).not.toContain('<image')
    expect(svg).not.toContain('href')
    expect(svg).not.toContain('xlink')
    expect(svg).not.toContain('<script')
    expect(svg).not.toContain('url(')
  })

  it('不叠任何文字 —— 词图已按 G10 剥掉全部 <text>，降级图形更不许补回来', () => {
    // AC-C1：「图片上不得叠加任何文字」—— 那是「把答案印在图上」。
    // 占位图形是同一个选项卡上的另一种渲染形态，在它上面写字是同一种错。
    expect(WORD_IMAGE_PLACEHOLDER_SVG).not.toContain('<text')
    expect(WORD_IMAGE_PLACEHOLDER_SVG).not.toContain('<tspan')
    expect(WORD_IMAGE_PLACEHOLDER_SVG).not.toContain('<foreignObject')
  })
})

describe('AC-B3 —— 零 DOM：常量本身不碰 DOM API', () => {
  it('placeholder.ts 的源码里没有任何 DOM API 调用', () => {
    // `core/` 零 DOM 是**编译期**强制的（`tsconfig.core.json` 的 `lib` 不含 `DOM`），
    // 而本条守的是另一件事：**别用字符串拼装等方式绕过去**，
    // 也别把一个「其实在造 DOM」的辅助函数混进来。
    const code = stripComments(readFileSync(join(root, 'src/core/placeholder.ts'), 'utf8'))

    for (const api of ['document.', 'window.', 'createElement', 'createElementNS', 'navigator.', 'Image(']) {
      expect(code, `placeholder.ts 出现了 DOM API：${api}`).not.toContain(api)
    }
  })

  it('反向：真有 DOM 调用时上面那条会红（证明它不是「扫一个空文件」的假绿）', () => {
    const withDom = [
      'export const WORD_IMAGE_PLACEHOLDER_SVG = (() => {',
      "  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg')",
      "  el.setAttribute('viewBox', '0 0 512 512')",
      '  return el.outerHTML',
      '})()',
    ].join('\n')

    expect(stripComments(withDom)).toContain('document.')
  })

  it('反向：剥注释这件事本身有效 —— 不剥的话同一条判据会误报（实测撞过）', () => {
    // 变异 M56 的同型：剥注释若失效，`placeholder.ts` 的文件头里那句
    // 「为什么不用 `new Image()`」就会让本文件变红，而代码完全正确。
    const raw = readFileSync(join(root, 'src/core/placeholder.ts'), 'utf8')

    expect(raw, '剥注释失效 ⇒ 本文件的源码匹配退回误报状态').toContain('Image(')
    expect(stripComments(raw)).not.toContain('Image(')
  })
})

describe('AC-B3 —— 只经 barrel 对外（AR5）', () => {
  it('core/ 的 barrel 导出了这个常量', () => {
    expect(coreBarrel.WORD_IMAGE_PLACEHOLDER_SVG).toBe(WORD_IMAGE_PLACEHOLDER_SVG)
  })

  it('barrel 里它只被导出一份（重复的 export 会被 bundler 静默合并，掩盖改名）', () => {
    const barrel = readFileSync(join(root, 'src/core/index.ts'), 'utf8')
    const hits = barrel.match(/WORD_IMAGE_PLACEHOLDER_SVG/g) ?? []

    expect(hits).toHaveLength(1)
  })
})
