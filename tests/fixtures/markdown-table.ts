/**
 * Markdown 表格解析的**共用小工具**（`tests/fixtures/`）。
 *
 * ── 为什么抽到这里 ──────────────────────────────────────────────────────────
 *   「从一份 markdown 里取出某个小节 / 取出表格行 / 去掉强调标记」这件事，
 *   `tests/content/card-distribution-doc.test.ts`（守 `docs/card-distribution.md`）
 *   与 `tests/content/level-size-doc.test.ts`（守 `docs/level-size.md`）
 *   **都要做**。各抄一份就是两条复制链（R-37）：
 *   抄的那份与真判据分叉时，两条守卫会**用不同的尺子量同一张表**，
 *   而其中一条报出来的「漂移」是假的。
 *   ⇒ 抽到这里，两边共用同一把尺子。
 *
 * ⚠️ **这不是教材解析器** —— 教材（`docs/textbook-oxford-shanghai/`）的解析器
 *   在 `tests/helpers/textbook-corpus.ts`，那是**另一件事**（那边解析的是
 *   「词表 / 句型」两行自定义格式，不是 Markdown 表格）。
 */

/**
 * 取出某个小节的正文。
 *
 * ⚠️ 结束位置取「下一个 `##` / `###` 标题行」—— 不是下一个 `##`：
 *   `## 4.` 的正文下面挂着 `### 4.1`，若只认 `##` 就会把 §4.1 的表也算进 §4。
 * ⚠️ 代码块里的 `# 在仓库根目录执行` 是**单**个 `#` ⇒ 不匹配 `#{2,3}`，
 *   不会被误当成小节边界。
 */
export function sectionOf(raw: string, headingPrefix: string): string {
  const lines = raw.split('\n')
  const start = lines.findIndex((line) => line.trim().startsWith(headingPrefix))
  if (start < 0) return ''
  let end = lines.length
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^#{2,3}\s/.test(lines[i])) {
      end = i
      break
    }
  }
  return lines.slice(start + 1, end).join('\n')
}

/** 取出小节里所有表格行（已切成单元格、已去掉首尾的 `|`）。 */
export function tableRows(section: string): string[][] {
  return section
    .split('\n')
    .filter((line) => line.trim().startsWith('|'))
    .map((line) =>
      line
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((cell) => cell.trim()),
    )
    .filter((cells) => !cells.every((cell) => /^:?-+:?$/.test(cell)))
}

/** 去掉单元格里的强调标记（`**` / `*`），让解析不必照顾排版。 */
export function plain(cell: string): string {
  return cell.replace(/\*\*/g, '').replace(/\*/g, '')
}

/** 取出小节里的第一个围栏代码块（按语言标注匹配）。 */
export function codeBlockOf(section: string, language: string): string {
  const match = new RegExp('```' + language + '\\n([\\s\\S]*?)```').exec(section)
  return match?.[1] ?? ''
}
