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
 */

/**
 * 切出 `<template>` 块的内容（并把 HTML 注释抹成空白）。
 *
 * ⚠️ **只认开标签** —— 结束标签与自闭合标签不带事件绑定。
 */
export function templateOf(source: string): string {
  const open = source.indexOf('<template>')
  const close = source.lastIndexOf('</template>')
  if (open === -1 || close === -1) return ''
  return source
    .slice(open + '<template>'.length, close)
    .replace(/<!--[\s\S]*?-->/g, (match) => match.replace(/[^\n]/g, ' '))
}

/**
 * 抽出模板里**带 `@click` / `@pointerdown` / `@pointerup`** 的元素上的 class 名。
 *
 * ⚠️ **只认 `<tag …>` 开标签** —— 结束标签与自闭合标签不带绑定。
 * ⚠️ **class 是精确匹配**（`.foo` 不匹配 `.foo__label`）：
 *   否则一个可点元素的**子元素**规则会被一起卷进来 ⇒ 大量假红。
 */
export function clickableClassNames(source: string): readonly string[] {
  const template = templateOf(source)
  const out = new Set<string>()
  const tagPattern = /<([A-Za-z][\w.-]*)\b((?:[^<>"]|"[^"]*")*?)>/g
  let match: RegExpExecArray | null
  while ((match = tagPattern.exec(template)) !== null) {
    const attrs = match[2]!
    if (!/@click|@pointerdown|@pointerup/.test(attrs)) continue
    const cls = /class="([^"]*)"/.exec(attrs)?.[1]
    if (cls === undefined) continue
    for (const name of cls.split(/\s+/)) {
      if (name.length > 0) out.add(name)
    }
  }
  return [...out]
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
 *   每一个带 `@click` / `@pointerdown` / `@pointerup` 的 class，
 *   要么被某条选择器覆盖，要么在**带理由的**豁免清单里。
 *
 * @param clickableClasses 源码里反查出来的可点 class 集合
 * @param selectors        命中区清单（`TOUCH_TARGET_SELECTORS`）
 * @param exemptions       豁免清单（`TOUCH_TARGET_EXEMPTIONS`）
 */
export function touchTargetScope(
  clickableClasses: readonly string[],
  selectors: readonly string[],
  exemptions: readonly TouchTargetExemption[],
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

  const staleExemptions = [...exempted.keys()].filter((name) => !clickableClasses.includes(name))
  const reasonsMissing = [...exempted.entries()]
    .filter(([, reason]) => reason.trim().length === 0)
    .map(([name]) => name)

  return { missing, staleExemptions, reasonsMissing }
}
