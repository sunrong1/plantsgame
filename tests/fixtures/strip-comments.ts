/**
 * 源码守卫的前置：**剥掉注释**再扫代码（R-52）。
 *
 * ── 为什么必须是「字符串字面量感知」的版本 ──────────────────────────────────
 * 首版用的是朴素的两次 replace：先 replace 掉块注释（点号星号 → 星号点号），
 * 再 replace 掉行注释（两个斜杠）。它有两个独立的失效：
 *
 * 1. **注释里写「注释」会吃掉真代码。** 本仓库的注释大量使用星号加粗
 *    与带星号的 glob。前者末尾的块注释结束符与后者开头的块注释起始符
 *    会**跨行配成一对「块注释」**，把两者之间的**真代码整段删掉**。
 *    ⇒ Story 1.17 写 `effects-runner.ts` 的 `TRACE` 分支时就因此让
 *      **G105 与 G106 双双假红**（那次的 `if` 连同整个分支被吃掉了）。
 *    ⇒ 本文件这段注释的第一版把那条朴素正则**原样抄进来**，
 *      结果其中 `[^换行]` 后面紧跟的星号加斜杠当场**关掉了本文档自己的块注释**，
 *      `tests/fixtures/strip-comments.ts:7` 报 parse error。同一课，第二次遇到。
 *
 * 2. **字符串里的注释起始符会被误当注释。** 例如 `'https://…'`。
 *    朴素版会把它们之后的一行吃掉。
 *
 * ⇒ 本实现逐字符走一遍**状态机**，只认四种状态：普通代码、单双引号字符串、
 * 模板串、行注释、块注释。注释一律**换成等长空白**而不是空串 ——
 * 这样 `indexOf` / 行号 / 切片位置在剥之前后**保持一致**，判据里那些
 * 「按行号报告」的输出不会因为剥注释而整体错位。
 *
 * 📎 **共享来源**（R-37）：`core-boundary` 与 `effects-boundary` 都用它，
 * 不许各留一份 —— 两份实现漂移过一次，症状是「一个守卫绿、另一个红」。
 *
 * ⚠️ **故意不处理的**：正则字面量与 JSX。仓库里 `src/` 下
 *   没有这两种需要扫的形态；若将来有，得先把判据补上而不是让本函数假装支持。
 */

/**
 * 剥掉注释，保留字符位置（注释换成等长空格）。
 *
 * @param source 源码原文
 * @returns 注释已换成空白、其余逐字不变的字符串
 */
export function stripComments(source: string): string {
  const out = source.split('')
  const blank = (from: number, to: number): void => {
    for (let i = from; i < to; i += 1) {
      // 只把**非换行**的字符换成空格 —— 换行留着，行号与逐行报告才对得上。
      if (out[i] !== '\n') out[i] = ' '
    }
  }

  let i = 0
  while (i < source.length) {
    const ch = source[i]
    const next = source[i + 1]

    // ── 行注释 ──
    if (ch === '/' && next === '/') {
      let end = source.indexOf('\n', i)
      if (end < 0) end = source.length
      blank(i, end)
      i = end
      continue
    }

    // ── 块注释 ──
    if (ch === '/' && next === '*') {
      const close = source.indexOf('*/', i + 2)
      const end = close < 0 ? source.length : close + 2
      blank(i, end)
      i = end
      continue
    }

    // ── 字符串 / 模板串：整段原样保留，只处理转义 ──
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch
      i += 1
      while (i < source.length) {
        if (source[i] === '\\') {
          i += 2
          continue
        }
        if (source[i] === quote) {
          i += 1
          break
        }
        i += 1
      }
      continue
    }

    i += 1
  }

  return out.join('')
}

/**
 * 剥掉 **HTML 注释**（`<!-- … -->`），保留字符位置（注释换成等长空白）。
 *
 * ── 为什么需要它（Story 3.5 / D1）────────────────────────────────────────
 *   `stripComments` 只认四种状态：普通代码、单双引号字符串、模板串、
 *   行注释、块注释 ⇒ **`.vue` 模板里的 `<!-- … -->` 会被当成代码扫**。
 *   ⇒ 扩面扫描（19 个 `.vue`）之后，模板注释里的字面量会**假红**。
 *   ⇒ 本函数与 `stripComments` **配对使用**：
 *     `stripComments(stripHtmlComments(source))`
 *     （**先**剥 HTML 注释 —— 否则 HTML 注释里的 `//` 或 `/*` 会先把真代码吃掉）。
 *
 * ⚠️ **顺序不能反**：`stripComments` 会把 HTML 注释里的 `//` 当成行注释起点、
 *   把 `/*` 当成块注释起点 ⇒ 那样会把注释**后面**的真代码一起吃掉。
 *
 * 📎 同样保留换行 ⇒ 行号与逐行报告在剥之前后**保持一致**。
 */
export function stripHtmlComments(source: string): string {
  const out = source.split('')
  const blank = (from: number, to: number): void => {
    for (let i = from; i < to; i += 1) {
      if (out[i] !== '\n') out[i] = ' '
    }
  }

  let i = 0
  while (i < source.length) {
    // ⚠️ `<!-->` 是合法的**空注释** ⇒ 它的结束符不是 `-->`。
    if (source.startsWith('<!-->', i)) {
      blank(i, i + 5)
      i += 5
      continue
    }
    if (source.startsWith('<!--', i)) {
      const close = source.indexOf('-->', i + 4)
      const end = close < 0 ? source.length : close + 3
      blank(i, end)
      i = end
      continue
    }
    i += 1
  }

  return out.join('')
}
