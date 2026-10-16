/**
 * CSS 对比度守卫的共用工具（`[CR]` 2026-10-16 从 `quiz-card.test.ts` 提取）。
 *
 * ── 为什么是实算对比度而不是「源码里写了什么颜色」─────────────────────────
 *   Story 1.11 的 P0 是个教科书式的例子：题面写 `color: #ffffff`，而
 *   `html`/`body`/`#app`/`.level-view` 全链路没有背景色 —— **每一条形式检查
 *   都会放行**（「有颜色」「颜色是白色的」「没写 transparent」都成立），
 *   而孩子看到的是白字落在白底上，对比度 **1.00:1**。
 *   ⇒ 判据必须是**把前景色与它真实的底色放在一起算 WCAG 比值**，
 *   而不是检查颜色字面量本身是否「合法」。
 *
 * ── 为什么 `cssDecl` 内置 `stripComments` 而不是让调用方先剥─────────────────
 *   R-52：**注释里描述违规形态，正则就会命中注释**。
 *   `OptionCard.vue` 的边框那段长注释逐字写着 `border: 3px solid transparent`
 *   （在解释「改之前是什么样」），不剥注释时 `indexOf(selector)` 命中的是那条
 *   注释之前的位置，再找 `{` 就跳进注释里 ⇒ 取出来的「声明体」是注释正文。
 *   第一稿就是漏了这一步，守卫当场抓到作者自己的违规。
 *
 *   同理，`.hand-card__cost` 里那段 `[CR]` 注释写着 `--color-sun` 与 `1.13:1`
 *   —— 不剥注释的话，下面「造价数字不许用 `--color-sun`」的守卫会被自己的
 *   说明文字顶成假红，或者反过来放行真正的违规。
 */

/**
 * 剥掉块注释、行注释与 HTML 注释，只留代码。
 *
 * 🚨 **注释用 `\n` 而不是空串替换**（这是 `[CR]` 2026-10-16 实测踩到的）：
 *   直接删空会把注释两侧的代码**接成一行**。`tokens.css` 里每个 token 的
 *   行尾都跟着一句块注释，于是剥完之后 `--color-bg` 与 `--color-path`
 *   挤在同一行 —— 后者不再位于行首，任何 `^` 锚定的匹配会**静默找不到它**，
 *   症状是一句「`tokens.css 里找不到 --color-path`」，与真实原因隔了十万八千里。
 *   保留换行让「去掉注释」不改变行的划分，这是它该有的语义。
 *
 * ⚠️ 本函数的注释里**不能出现字面的块注释结束符** —— 它会当场把这段文档注释
 *   提前闭合，后半段变成语法错误（Parse error: Invalid Character）。
 *   要举例说明块注释长什么样，用「行尾一句块注释」这种说法，别把它写出来。
 */
export function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '\n')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/<!--[\s\S]*?-->/g, '\n')
}

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * `tokens.css` 原文。见 {@link resolveColor} 关于「为什么不用 `?raw`」的说明。
 *
 * ⚠️ **用 `process.cwd()` 而不是 `import.meta.url`**：
 *   `tests/content/palette.test.ts` 用的是 `fileURLToPath(new URL(…, import.meta.url))`，
 *   那份跑在 **node** 环境里没问题；而本模块同时被 **jsdom** 环境的组件测试
 *   （`hand-build.test.ts` / `quiz-card.test.ts`，两者的 docblock 都写了
 *   `@vitest-environment jsdom`）import，在那里 `import.meta.url` **不是 file 协议**，
 *   `fileURLToPath` 直接抛 `The URL must be of scheme file`。
 *   ⇒ 同一个仓库里两种写法只能活一种，那就选与环境无关的那个。
 *   Vitest 的 root 与 npm 脚本的工作目录都是仓库根，`src/styles/tokens.css` 按此解析。
 */
const TOKENS_CSS = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8')

/**
 * WCAG 相对亮度。
 *
 * 🚨 **通道必须先除以 255**（这是 `[CR]` 2026-10-16 从 1.11 继承下来的一处真 bug）：
 *   WCAG 的分段传输函数里那个阈值 **0.03928** 是对**归一化到 0~1** 的通道说的。
 *   1.11 的 `relLuminance` 把 `(v >> 16) & 0xff` 这种 **0~255 的原始值**直接喂了进去，
 *   于是**每一个通道都落在线性段那一侧之外的错误位置**，算出来的比值整体偏大
 *   （`#fdd835` 落在 `#d7ccc8` 上报 1.15，正确的值是 **1.12**）。
 *   为什么没被发现：1.11 那几条断言的真实比值离 4.5 的门槛极远
 *   （白字白底 1.00 → 改后 12.6），偏一点照样全绿；
 *   而它**只在红灯文案里出现过**（`${ratio}:1`），没人会去核对那个数字本身。
 *
 *   1.12 的 M75 是第一次把比值**钉成断言**（要求复现改动前的实测 1.12），
 *   于是把这段偏差顶了出来。**守卫自己算错时，越严的断言反而是它在报警。**
 */
export function relLuminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (m === null) throw new Error(`不是 6 位十六进制色：${hex}`)
  const v = parseInt(m[1], 16)
  const chan = (c: number): number => {
    const x = c / 255
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  }
  return (
    0.2126 * chan((v >> 16) & 0xff) +
    0.7152 * chan((v >> 8) & 0xff) +
    0.0722 * chan(v & 0xff)
  )
}

/** WCAG 对比度，保留两位小数（与浏览器 / axe-core 的取值口径一致）。 */
export function contrastRatio(a: string, b: string): number {
  const l1 = relLuminance(a)
  const l2 = relLuminance(b)
  return Math.floor(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100
}

/**
 * 从源码里取出 `selector { … }` 的声明体。
 *
 * 🚨 **内部先 `stripComments`**，调用方一律传原始源码（R-52，见文件头）。
 */
export function cssDecl(source: string, selector: string): string {
  const code = stripComments(source)
  const idx = code.indexOf(selector)
  if (idx === -1) throw new Error(`源码里找不到选择器 ${selector}`)
  const open = code.indexOf('{', idx)
  const close = code.indexOf('}', open)
  return code.slice(open + 1, close)
}

/**
 * 从 `tokens.css` 原文取出 `--name` 的声明值。
 *
 * ⚠️ **不能复用 `cssDecl`**：token 的声明形如 `--color-path: #d7ccc8;`，
 *   后面**没有 `{`** —— `cssDecl` 会一路找到下一条规则的 `{`，把中间那几条
 *   token 一起切进来。这个 bug 之所以活到今天：1.11 的 G30 里被解的
 *   `color` 全是**字面 hex**，题面那一条从没走进 `var()` 分支。
 *   1.12 的手牌底色是 `var(--color-path)`，第一次真的走了进去。
 */
export function tokenValue(name: string, source: string = TOKENS_CSS): string {
  const code = stripComments(source)
  // ⚠️ **不要用 `^` 锚定**：token 之间只靠缩进区分，而缩进不是规范的一部分。
  //   改用「前面不能是 `-` 或词字符」来保证不误匹配更长的 token 名
  //   （找 `--color-bg` 不会撞上 `--color-bg-foo`，因为后者 `--color-bg` 之后是 `-`）。
  const m = new RegExp(`(?<![-\\w])${name}\\s*:\\s*([^;]+);`).exec(code)
  if (m === null) throw new Error(`tokens.css 里找不到 ${name}`)
  return m[1].trim()
}

/**
 * 解析 `var(--x)`（去 `tokens.css` 取值）或 `#abc`（直接返回）。
 *
 * 🚨 **`tokens.css` 必须用 `readFileSync` 读，不能用 `?raw` 导入** ——
 *   实测在 Vitest 5 下 `import src from '…/tokens.css?raw'` 返回的是**空字符串**
 *   （`environment: 'node'` + vitest 的 CSS 处理，见 `vitest.config.ts`）。
 *   症状极具误导性：`resolveColor('#424242')` 一切正常，只有走到 `var(--x)`
 *   分支才炸，而报错是「找不到 token」，与「你 import 到了空串」毫无字面关联。
 *   这正是它活下来的原因 —— 1.11 的 G30 里被解的 `color` 全是字面 hex，
 *   `var()` 分支**从未被执行过一次**，于是一段坏代码看起来完全正常。
 *   本仓库读 `tokens.css` 的既有先例是 `tests/content/palette.test.ts`，同款做法。
 */
export function resolveColor(value: string, source: string = TOKENS_CSS): string {
  const v = value.trim()
  const m = /^var\(\s*(--[a-z0-9-]+)\s*\)$/i.exec(v)
  if (m === null) return v
  const raw = tokenValue(m[1], source)
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw)
  if (hex === null) throw new Error(`token ${m[1]} 的值不是十六进制色：${raw}`)
  const h = hex[1]
  return h.length === 3 ? `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}` : `#${h}`
}

/** 从声明体里取出第一条 `<property>: <value>;`，返回 value（取不到则 `null`）。 */
export function declValue(body: string, property: string): string | null {
  const m = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+);`, 'i').exec(body)
  return m === null ? null : m[1].trim()
}

/**
 * 从 **`border` 简写**里取出颜色部分 —— `3px solid #424242` ⇒ `#424242`。
 *
 * 简写里宽度和样式混在前面，直接喂给 {@link contrastRatio} 会得到
 * `不是 6 位十六进制色：3px solid #424242`。
 * ⚠️ 也支持 `border-color` 那种只含颜色的长写（抽取结果相同），
 *   所以调用方不必先判断自己拿到的是哪一种。
 */
export function extractColor(value: string): string {
  const m = /(#[0-9a-f]{3,8}|rgba?\([^)]*\)|var\(\s*--[\w-]+\s*\))/i.exec(value)
  if (m === null) throw new Error(`声明里找不到颜色部分：${value}`)
  return m[1]
}

/**
 * 把半透明黑罩**合成**到不透明底色上，得到罩下的实际底色。
 *
 * 为什么需要它：`.is-unaffordable` 是用一层 `rgba(0,0,0,a)` 的
 * `background-image` 压暗的，**卡面底色并没有变** —— 变暗的是「罩与底的合成结果」。
 * 只拿 `--color-path` 当底色去算对比度，会算出一个**比实际好得多**的数字
 * （5.85:1，而实际是 2.31:1），守卫于是对着一版看不见的代码放行。
 *
 * ⚠️ 这里只处理「黑 + 不透明底」这一种情形 —— 那正是本仓库仅有的用法
 *   （三枚 `--color-overlay-*` 全是中性黑）。遇到别的组合请显式扩展，
 *   不要让这个函数「猜」。
 */
export function overBlack(bg: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(bg.trim())
  if (m === null) throw new Error(`overBlack 暂不支持非 6 位十六进制底色：${bg}`)
  const v = parseInt(m[1], 16)
  const chan = (c: number): number => Math.round(c * (1 - alpha))
  const h = (c: number): string => chan(c).toString(16).padStart(2, '0')
  return `#${h((v >> 16) & 0xff)}${h((v >> 8) & 0xff)}${h(v & 0xff)}`
}

/** 从 `rgba(r, g, b, a)` 取出 alpha。 */
export function rgbaAlpha(value: string): number {
  const m = /^rgba?\([^)]*?,\s*([\d.]+)\s*\)$/i.exec(value.trim())
  if (m === null) throw new Error(`不是 rgba()：${value}`)
  return Number(m[1])
}

/**
 * 🚨 **守卫共用的失败文案**。
 *
 * 存在的理由：对比度守卫的价值全在「红的时候能看懂哪里错了」。只写
 * `expected 1.13 to be greater than 4.5` 的话，看到的人得自己去翻是哪一对颜色。
 */
export function contrastMsg(what: string, fg: string, bg: string, ratio: number, need: number): string {
  return `${what}：${fg} 落在 ${bg} 上只有 ${ratio}:1，低于 ${need}:1（这一版改动之前的实测值就是它）`
}
