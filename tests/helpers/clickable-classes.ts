/**
 * 「从源码反查可点 class」的**共享实现**（Story 3.5 / B3 + G317）。
 *
 * ── 为什么抽出来（R-37）──────────────────────────────────────────────────
 *   `clickableClassNames` 原先是 `tests/components/portrait-layout.test.ts`
 *   里的**局部函数**（G138 在用）。Story 3.5 的 **G317** 要用**同一份**逻辑
 *   从源码反查「有没有带 `@click` 的 class 落进 `TOUCH_TARGET_SELECTORS` 之外」
 *   ⇒ **不许抄两份**（抄两份 = 迟早漂移；漂移的方向恰好是「判据静默变窄」）。
 *
 * ── 抽出来的位置对不对 ───────────────────────────────────────────────────
 *   它是**判据本体的一部分**（抽取规则），所以放在 `tests/helpers/` 而不是
 *   某个测试文件里 ⇒ G138 与 G317 都能 import 它。
 *   配套的「列出 `src/` 下全部 `.vue`」在 `tests/helpers/vue-sources.ts`。
 *
 * 🔥 **`[CR]` 2026-10-25 三层对抗评审补的四个洞**（都在下面逐条标了）——
 *   原来的反查有四条**静默变窄**的路径，每一条都会让 G317 在判据已经
 *   漏掉元素时**照样绿**（正是 G317 要防的那件事）：
 *   ① 根 `<template>` **带属性**（如 `<template lang="pug">`）⇒
 *      原来硬编码 `indexOf('<template>')` ⇒ 整个文件**贡献 0 个 class**；
 *   ② HTML 注释用的是**本文件自己的一份正则** ⇒ 与
 *      `tests/fixtures/strip-comments.ts` 的 `stripHtmlComments` **重复**
 *      （R-37）且没有那份的「未闭合 ⇒ 抛错」保护；
 *   ③ class 的提取用**子串匹配** `class="…"` ⇒ **分不清静态 `class` 与
 *      动态 `:class` / `v-bind:class`** ⇒ 属性顺序一变就抓错对象；
 *   ④ 带事件绑定但**没有静态 class** 的元素被**直接跳过** ⇒
 *      它在 class 命名的清单里**无处可落** ⇒ 永远量不到却没人知道。
 */

import { stripHtmlComments } from '../fixtures/strip-comments'

/**
 * 切出**根 `<template>` 块**的内容（并把 HTML 注释抹成空白）。
 *
 * 🔥 **`[CR]` ①：根标签**带属性**时也要认** ⇒ 用正则而不是
 *   `indexOf('<template>')`（后者在 `<template lang="pug">` 上返回 −1
 *   ⇒ 该文件的模板**整份被跳过** ⇒ 反查集合**静默变小**）。
 *
 * ⚠️ **只认开标签** —— 结束标签与自闭合标签不带事件绑定。
 */
export function templateOf(source: string): string {
  const open = /<template(?:\s[^>]*)?>/.exec(source)
  const close = source.lastIndexOf('</template>')
  if (open === null || close === -1 || close < open.index + open[0].length) return ''
  // 🔥 **`[CR]` ②：HTML 注释改用共享的 `stripHtmlComments`**（R-37 单一来源）
  //   ⇒ 顺带继承它的「未闭合 ⇒ 抛错」保护（否则一份没闭合的注释会
  //   把**余下整个模板**换成空白 ⇒ 反查集合**静默归零**）。
  return stripHtmlComments(source.slice(open.index + open[0].length, close))
}

/** 事件绑定的几种写法（`@click` / `v-on:click` 与其修饰符形态）。 */
const HANDLER_PATTERN = /@click|@pointerdown|@pointerup|v-on:click|v-on:pointerdown|v-on:pointerup/

/**
 * 🔥 **`[CR]` ③：静态 `class` 的取法** —— 必须**排除** `:class` / `v-bind:class`。
 *   负向后顾 `(?<![\w:-])` 保证 `class` 前面**不是** `:` / `-` / 词字符
 *   ⇒ `:class="…"` 与 `data-class="…"` 都**不会**被当成静态 class。
 *   ⚠️ **为什么只看静态 class**：动态 `:class` 里装的是**状态 class**
 *   （`is-picked` / `is-wrong` …），它们**不是命中区目标**
 *   ⇒ 把它们塞进反查集合会淹掉真正的漏项（全是假红）。
 *   ⇒ 动态 class 归「**这个元素没有可落清单的静态 class**」那条（见下）。
 *
 * 🔥 **`[CR]` 2026-10-25 第五个洞：引号有两种。**
 *   原实现只认 `class="…"`（**双引号**）⇒ 源码里写成 `class='…'`（**单引号**）
 *   的可点元素会被判成「**没有静态 class**」⇒ 它落进 `classless` 那条
 *   ⇒ **报成一个假红**（`<button>` 这种标记）⇒ 假红多了 ⇒ 真漏项被淹掉
 *   ⇒ **判据照样绿**（R-51 第 1 类：假绿）。
 *   ⇒ 现在**两种引号都认**。
 */
const STATIC_CLASS_PATTERN = /(?<![\w:-])class=(["'])([^"']*)\1/

/** 一个**可点元素**（带事件绑定的开标签）。 */
export type ClickableElement = {
  /** 元素名（小写 = 原生标签，大写 = 子组件）。 */
  tag: string
  /** 该元素上的**静态** class 列表（`class="a b"` ⇒ `['a','b']`）。 */
  classes: string[]
}

/**
 * 抽出模板里**带事件绑定**的元素（`@click` / `@pointerdown` / `@pointerup`
 * 及其 `v-on:` 长写法）。
 *
 * ⚠️ **只认 `<tag …>` 开标签** —— 结束标签与自闭合标签不带绑定。
 *
 * 🔥 **`[CR]` 2026-10-25：属性值允许**单引号**（`class='…'`）——
 *   原正则的属性段 `[^<>"]|"[^"]*"` 把 `'` 当普通字符吞进属性段，
 *   于是 `class='…'` 里的引号**配不成对**⇒ 属性段被截断在第一个 `>` 前
 *   ⇒ 那个元素**整条被漏掉**。
 */
export function clickableElements(source: string): ClickableElement[] {
  const template = templateOf(source)
  const out: ClickableElement[] = []
  const tagPattern = /<([A-Za-z][\w.-]*)\b((?:[^<>"']|"[^"]*"|'[^']*')*?)>/g
  let match: RegExpExecArray | null
  while ((match = tagPattern.exec(template)) !== null) {
    const attrs = match[2]!
    if (!HANDLER_PATTERN.test(attrs)) continue
    const classes: string[] = []
    const cls = STATIC_CLASS_PATTERN.exec(attrs)?.[2]
    if (cls !== undefined) {
      for (const name of cls.split(/\s+/)) {
        if (name.length > 0) classes.push(name)
      }
    }
    out.push({ tag: match[1]!, classes })
  }
  return out
}

/**
 * 抽出模板里**带事件绑定**的元素上的**静态** class 名。
 *
 * ⚠️ **class 是精确匹配**（`.foo` 不匹配 `.foo__label`）：
 *   否则一个可点元素的**子元素**规则会被一起卷进来 ⇒ 大量假红。
 */
export function clickableClassNames(source: string): readonly string[] {
  const out = new Set<string>()
  for (const element of clickableElements(source)) {
    for (const name of element.classes) out.add(name)
  }
  return [...out]
}

/**
 * 🔥 **`[CR]` ④：带事件绑定、却**没有静态 class** 的元素** ——
 *   它们在 class 命名的命中区清单里**无处可落** ⇒ 永远量不到
 *   ⇒ 必须**报出来**，不许静默跳过（G317 的反查不许静默变窄）。
 *
 * @returns 形如 `['<button>']` 的标记（**不是** class 名 ⇒ 不会与清单撞名）
 */
export function classlessClickables(source: string): readonly string[] {
  return clickableElements(source)
    .filter((element) => element.classes.length === 0)
    .map((element) => `<${element.tag}>`)
}

/**
 * 从一条 **CSS 选择器**里抽出它覆盖的 class 名。
 *
 * ⚠️ 只取**类选择器**部分（`.foo` ⇒ `foo`）⇒ 命中区清单里写的是
 *   `.battle-cell` 这种形态 ⇒ 「清单覆盖了哪些 class」可以直接算出来。
 */
export function selectorClassNames(selector: string): readonly string[] {
  return [...selector.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1]!)
}

/** 豁免条目：class 名 + **必须写出来的理由**。 */
export type TouchTargetExemption = { readonly className: string; readonly reason: string }

/** G317 的判定结果（三类问题分开报，别混成一句「不通过」）。 */
export type TouchTargetScopeResult = {
  /** 不在命中区清单里、也不在豁免清单里的 class ⇒ **必须红**。 */
  missing: string[]
  /** 豁免清单里**已经不存在于源码**的 class ⇒ 该删掉（清单漂移）。 */
  staleExemptions: string[]
  /** 豁免清单里**没有理由**的条目 ⇒ 理由是豁免的凭据。 */
  reasonsMissing: string[]
}

/**
 * **G317 的判据本体**（纯函数，**可单测** ⇒ 反向自测能直接调它）。
 *
 * 📎 **不许**用「清单里有多少个」来判漏项 ⇒ **从源码反查**：
 *   每一个带事件绑定的 class，
 *   要么被某条选择器覆盖，要么在**带理由的**豁免清单里。
 *
 * 🔥 **`[CR]` ④：`classless` 里那些「没有静态 class」的可点元素**也进 `missing`
 *   ⇒ 它们在 class 命名的清单里无处可落 ⇒ **必须红**（不许静默跳过）。
 *
 * @param clickableClasses 源码里反查出来的可点 class 集合
 * @param selectors        命中区清单（`TOUCH_TARGET_SELECTORS`）
 * @param exemptions       豁免清单（`TOUCH_TARGET_EXEMPTIONS`）
 * @param classless        「有事件绑定却没有静态 class」的元素标记
 */
export function touchTargetScope(
  clickableClasses: readonly string[],
  selectors: readonly string[],
  exemptions: readonly TouchTargetExemption[],
  classless: readonly string[] = [],
): TouchTargetScopeResult {
  const covered = new Set<string>()
  for (const selector of selectors) {
    for (const name of selectorClassNames(selector)) covered.add(name)
  }
  const exempted = new Map<string, string>()
  for (const item of exemptions) {
    exempted.set(item.className, item.reason)
  }

  const missing: string[] = []
  for (const name of clickableClasses) {
    if (covered.has(name)) continue
    if (exempted.has(name)) continue
    missing.push(name)
  }
  for (const marker of classless) {
    // ⚠️ 「没有静态 class」的元素**不在豁免清单的管辖范围内**
    //   （豁免是按 class 名登记的，而它**没有 class 名**）⇒ 一律报漏项。
    missing.push(marker)
  }

  const staleExemptions = [...exempted.keys()].filter((name) => !clickableClasses.includes(name))
  const reasonsMissing = [...exempted.entries()]
    .filter(([, reason]) => reason.trim().length === 0)
    .map(([name]) => name)

  return { missing, staleExemptions, reasonsMissing }
}
