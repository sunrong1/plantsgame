/**
 * `tests/fixtures/strip-comments.ts` 自身的守卫（Story 3.5 `[CR]` / **G319**）。
 *
 * ── 为什么这个夹具需要自己的守卫 ────────────────────────────────────────────
 *   `stripComments` / `stripHtmlComments` 是**所有源码匹配型判据的前置**
 *   （R-52：源码匹配型守卫必须先剥注释再匹配）⇒ 它的失效**不会**表现为
 *   「某条守卫红了」，而会表现为
 *   **「判据扫到的面变小了 / 变成零」⇒ 那条守卫照绿**（R-51 第 1 类：假绿）。
 *
 *   🔥 **2026-10-25 实测踩到过**（Story 3.5 的三层对抗评审）：
 *     `stripHtmlComments` 的旧实现遇到 `<script>` 块里的 `'<!--'` 字符串字面量，
 *     会一路 blank 到下一个 `-->` ⇒ **整段真代码被吃掉** ⇒
 *     依赖「扫到的源码」的判据（G38）**静默漏扫**却照样绿。
 *     探针输出逐字：`setTimeout 还在吗： false`。
 *
 * ── 这条守卫守什么 ──────────────────────────────────────────────────────────
 *   ① **未闭合的 HTML 注释必须抛错**（不许 blank 到文件末尾 ⇒ 扫描面整个归零
 *      ⇒ 「没扫到违规」被读成「没有违规」）。
 *   ② **`<script>` / `<style>` 块原样跳过**（块里的 `<!--` 不许吃掉真代码）。
 *   ③ **字符位置保持**（注释换成等长空白 ⇒ 判据里「按行号报告」的输出不错位）。
 *   ④ **顺序不能反**（先剥 HTML 注释，再剥 JS 注释）。
 *
 * ── 判据纪律 ────────────────────────────────────────────────────────────
 *   全部是**表驱动的负向夹具**（R-50 的默认手段）：违规输入 ⇒ 抛错 / 保留；
 *   合规输入 ⇒ 正常剥。
 */

import { describe, expect, it } from 'vitest'

import { stripComments, stripHtmlComments } from '../fixtures/strip-comments'

describe('G319 —— 剥注释的夹具本身不许把扫描面吃掉', () => {
  it('G319.1 未闭合的 HTML 注释必须**抛错**（不许 blank 到文件末尾）', () => {
    const source = 'const a = 1\n<!-- 忘了闭合\nconst b = 2\n'
    expect(() => stripHtmlComments(source)).toThrow(/未闭合/)
  })

  it('G319.2 反向自测：闭合的注释**不许**抛错（判据的「异常」不是「什么都抛」）', () => {
    const source = 'const a = 1\n<!-- 正常闭合 -->\nconst b = 2\n'
    expect(() => stripHtmlComments(source)).not.toThrow()
  })

  it('G319.3 `<script>` / `<style>` 块里的 `<!--` **不许**吃掉后面的真代码', () => {
    const source = [
      "<script>const marker = '<!--'</script>",
      'const stillHere = 1',
    ].join('\n')
    const out = stripHtmlComments(source)
    // 🔥 判据本体：真代码必须还在。
    expect(out).toContain('stillHere')
    // 📎 脚本块**原样保留**（交给 `stripComments` 剥 JS 注释）。
    expect(out).toContain("const marker = '<!--'")
  })

  it('G319.4 `<style>` 块原样保留（CSS 里的 `<!--` 是老式 hack，不是 HTML 注释）', () => {
    const source = ['<style>', '.a { color: red; /* <!-- */ }', '</style>', 'const after = 1'].join(
      '\n',
    )
    const out = stripHtmlComments(source)
    expect(out).toContain('const after = 1')
    expect(out).toContain('/* <!-- */')
  })

  it('G319.5 注释换成**等长空白**（字符位置保持 ⇒ 按行号报告不错位）', () => {
    const source = 'const a = 1\n// 注释\nconst b = 2\n'
    const out = stripComments(source)
    expect(out.length).toBe(source.length)
    expect(out.split('\n').length).toBe(source.split('\n').length)
    // 换行必须留着（注释内容换成**等长空格**，不是删掉 ⇒ 位置不变）。
    expect(out.split('\n')[1]!.trim()).toBe('')
    expect(out.split('\n')[1]!.length).toBe(source.split('\n')[1]!.length)
    // 真代码逐字不变。
    expect(out).toContain('const a = 1')
    expect(out).toContain('const b = 2')
  })

  it('G319.6 HTML 注释也保持等长（与 `stripComments` 同一条口径）', () => {
    const source = 'const a = 1\n<!-- 注释 -->\nconst b = 2\n'
    const out = stripHtmlComments(source)
    expect(out.length).toBe(source.length)
    expect(out).toContain('const a = 1')
    expect(out).toContain('const b = 2')
  })

  it('G319.7 顺序不能反：**先**剥 HTML 注释，**再**剥 JS 注释（反了会把真代码吃掉）', () => {
    // 📎 夹具：HTML 注释里有 `//` ⇒ 先剥 JS 注释会把 `//` 当行注释起点，
    //   把**后面整行**吃掉（连 `-->` 一起）⇒ 顺序反了就丢代码。
    const source = ['<!-- 这里有 // 两个斜杠 -->', 'const after = 1'].join('\n')
    const right = stripComments(stripHtmlComments(source))
    expect(right).toContain('const after = 1')

    // 🔥 反向自测：**反过来**剥 ⇒ 要么**响亮抛错**（`<!--` 没了闭合符）、
    //   要么**真代码被吃掉** —— **两种都不许**「安静地给出与正确顺序一样的结果」。
    let wrong: string | null = null
    let wrongThrew = false
    try {
      wrong = stripHtmlComments(stripComments(source))
    } catch {
      wrongThrew = true
    }
    if (!wrongThrew) {
      expect(wrong).not.toContain('const after = 1')
    }
    // 📎 正确顺序**不许**抛错（反面对照：判据不是「什么都抛」）。
    expect(() => stripComments(stripHtmlComments(source))).not.toThrow()
  })

  it('G319.8 `stripComments` 是**字符串感知**的：字符串里的 `//` 不许被当行注释', () => {
    // 📎 这正是朴素实现失效 #2（字符串里的注释起始符会被误当注释）。
    const source = ["const url = 'https://example.com/a'", 'const after = 1'].join('\n')
    const out = stripComments(source)
    expect(out).toContain('const url =')
    expect(out).toContain('https://example.com/a')
    expect(out).toContain('const after = 1')
  })

  it('G319.9 `<script>` 块里的字符串含 `<!--` 时**不许**影响块外的代码', () => {
    // 📎 现实场景：`.vue` 的 `<script>` 里出现 `'<!--'`（例如比较字符串）。
    //   ⇒ 块**原样保留**（由 G319.3 覆盖）⇒ 这里补一条「块外代码不受影响」。
    const source = [
      '<script setup>',
      "const s = '<!--'",
      '</script>',
      '<template>',
      '  <div>正文</div>',
      '</template>',
    ].join('\n')
    const out = stripHtmlComments(source)
    expect(out).toContain('const s =')
    expect(out).toContain('<div>正文</div>')
  })

  it('G319.9 `<!-->` 与 `<!--->` 是**空注释**（不许把它们当未闭合而抛错）', () => {
    expect(() => stripHtmlComments('<!-->\nconst a = 1\n')).not.toThrow()
    expect(() => stripHtmlComments('<!--->\nconst a = 1\n')).not.toThrow()
  })

  it('G319.10 剥完的源码**仍能被扫到**（端到端：判据的输入没被吃掉）', () => {
    // 📎 判据：`setTimeout(` 是被禁的形态。
    const source = [
      "<script setup>",
      "// 这行注释里也有 setTimeout(，不许被当成代码",
      'const t = setTimeout(() => {}, 100)',
      '</script>',
    ].join('\n')
    const scanned = stripComments(stripHtmlComments(source))
    // 🔥 真代码里的那个必须还在 ⇒ 扫描面没塌。
    expect(scanned).toContain('const t = setTimeout(() => {}, 100)')
    // 📎 注释里的那个必须被剥掉。
    expect(scanned).not.toContain('这行注释里也有 setTimeout(')
  })
})
