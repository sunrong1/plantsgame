/**
 * CSS 层叠求解器 —— **判据本体只有这一份**（R-37：复制链的根源）。
 *
 * ── 为什么要有这个共享件 ──────────────────────────────────────────────────
 *   G177（Story 1.19 `[CR]` 第七轮）第一次发现「判源码顺序」是错的判据：
 *   `:not(.x)` 按其参数计权 ⇒ `.a:not(.b)` 是 (0,2,0) 而不是 (0,1,0)；
 *   scoped 属性又给每条规则统一加一个属性选择器（常数偏移，可约掉）。
 *   ⇒ 唯一正确的判法是**真的解一遍层叠**：匹配 → 比特异度 →
 *     特异度相等才看源码顺序 → 取胜者的声明值。
 *   G253（Epic 1 集成层检视）要把同一把尺子用到**另一个属性**上
 *   （`background` 而不只是 `opacity`）⇒ 抄一份会让两把尺子随时间跑偏，
 *   所以抽到这里，G177 与 G253 **共用同一份实现**。
 *
 * ── 覆盖范围（必须如实知道它算不了什么）─────────────────────────────────
 *   · 只认**纯类选择器**：若干个 `.class` 与 `:not(.class)` 的任意次序。
 *   · 遇到后代选择器 / 逗号组 / 标签选择器 / 伪类 / 属性选择器 ⇒
 *     **如实抛错或如实跳过**，绝不悄悄给一个错的答案（R-51）。
 *   · 真正生效的规则里若含 media query 包裹，本求解器**不知道**
 *     （它按源码出现顺序参与竞争）⇒ 用例里要自己保证不踩这条。
 *   · ⚠️ **不是真浏览器实测**（R-01：jsdom 不做布局）。
 *     它判的是「哪条声明胜出」，不判像素。
 */

/** 一条候选规则：选择器 + 声明体 + 在源码里的序号（用来决同特异度的胜负）。 */
export interface CssRule {
  selector: string
  decls: Map<string, string>
  order: number
}

/**
 * 从一个 `.vue` 源文件里切出 `<style>` 块的正文。
 *
 * ⚠️ **为什么必须切**：整份 `.vue` 源码里还有 `<script>` 与 `<template>`，
 *   而它们各自含大量 `{ … }` ⇒ 求解器的 `([^{}]+)\{([^{}]*)\}` 会把它们
 *   也当成「规则」扫进来（选择器是 `function onPick(): void` 之类）。
 *   好在那些都不长得像纯类选择器、会被跳过 —— 但那是**碰巧**，
 *   而判据不能靠碰巧（R-51）。切出 `<style>` 之后输入是确定的。
 *
 * ⚠️ 切不出来时**抛错**而不是返回空串：空串会让「一条都没匹配上」这条
 *   判据变成恒假的合规，与判据范围消失无法区分。
 */
export function styleBlockOf(vueSource: string): string {
  const at = vueSource.indexOf('<style')
  if (at === -1) throw new Error('判据范围消失：这个 .vue 源码里找不到 <style> 块')
  const open = vueSource.indexOf('>', at)
  if (open === -1) throw new Error('判据范围消失：<style> 标签没有闭合的 `>`')
  const close = vueSource.indexOf('</style>', open)
  if (close === -1) throw new Error('判据范围消失：<style> 块没有 `</style>`')
  return vueSource.slice(open + 1, close)
}

/**
 * 算一条**简单复合选择器**的特异度 `[a, b, c]`。
 *
 * ⚠️ 只处理本仓库真正用到的东西：类型选择器 / `.class` / `#id` /
 *   `:not(<复合选择器>)`。遇到后代选择器（空格）或逗号会**如实抛错**而不是
 *   悄悄返回错值 —— 判据算错却绿比判据直接崩掉危险得多（R-51）。
 */
export function specificity(selector: string): [number, number, number] {
  const sel = selector.trim()
  if (sel.includes(',')) {
    throw new Error(`判据不会算逗号选择器组：${selector}`)
  }
  if (/\s/.test(sel.replace(/:not\([^)]*\)/g, ''))) {
    throw new Error(`判据不会算带后代组合符的选择器：${selector}`)
  }
  const withoutNot = sel.replace(/:not\([^)]*\)/g, '')
  // `:not(...)` 按**其参数**计权（Selectors L3/L4）⇒ 参数与自身等价。
  const notArgs = [...sel.matchAll(/:not\(([^)]*)\)/g)].map((m) => m[1])
  const ids = (withoutNot.match(/#[\w-]+/g) ?? []).length
  const classes =
    (withoutNot.match(/\.[\w-]+/g) ?? []).length +
    (withoutNot.match(/\[[^\]]+\]/g) ?? []).length +
    notArgs.filter((a) => a.trim().startsWith('.') || a.trim().startsWith('#')).length
  const types = (withoutNot.match(/(^|[\s>+~])[a-z][\w-]*/gi) ?? []).length
  return [ids, classes, types]
}

/** 特异度字典序比较：a 先比，再 b，再 c。 */
export function cmpSpecificity(x: [number, number, number], y: [number, number, number]): number {
  for (let i = 0; i < 3; i += 1) {
    if (x[i] !== y[i]) return x[i] - y[i]
  }
  return 0
}

/**
 * 收集所有**匹配给定类组合**的纯类选择器规则（按源码顺序编号）。
 *
 * 🔥 `:not(.x)` 是**否定**要求：元素**没有** `.x` 时才算满足。
 *   ⚠️ 首版把它当成普通要求 ⇒ 测试元素（没有 `is-picked`）会把整条
 *   `.is-degraded:not(.is-picked)` 规则跳过 ⇒ **假形态被判成合规**。
 *   这个洞方向最恶劣，由 G177 的自测当场抓住。
 */
export function matchingRules(src: string, elementClasses: string[]): CssRule[] {
  const has = (cls: string): boolean => elementClasses.includes(cls)
  const rules: CssRule[] = []
  let order = 0
  for (const m of src.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim()
    // 只认「若干个 `.class` 与 `:not(.class)` 任意次序」的纯类选择器。
    if (!/^(?:\.[\w-]+|:not\(\.[\w-]+\))+$/.test(selector)) continue
    const negated = [...selector.matchAll(/:not\(\.([\w-]+)\)/g)].map((c) => c[1])
    // 正类必须从**剥掉 `:not(...)` 之后**的剩余部分取，否则 `is-picked`
    // 会被当成必需项（`:not(` 后面那个点，lookbehind 也拦不住）。
    const positive = [
      ...selector.replace(/:not\(\.[\w-]+\)/g, '').matchAll(/\.([\w-]+)/g),
    ].map((c) => c[1])
    if (!positive.every(has)) continue
    if (negated.some((c) => has(c))) continue
    const decls = new Map<string, string>()
    for (const d of m[2].split(';')) {
      const idx = d.indexOf(':')
      if (idx === -1) continue
      decls.set(d.slice(0, idx).trim(), d.slice(idx + 1).trim())
    }
    rules.push({ selector, decls, order: order++ })
  }
  return rules
}

/**
 * 判据本体：**对挂着 `elementClasses` 的元素解一遍层叠，返回胜者给的
 * `prop` 声明值。**
 *
 * @param src 剥掉注释后的 CSS 源码
 * @param elementClasses 元素身上真实有的类
 * @param prop 要问的属性名（`'opacity'` / `'background'` / …）
 * @returns 胜者的声明值；一条都没匹配上或胜者没写这个属性则返回 `null`
 */
export function winningDeclaration(
  src: string,
  elementClasses: string[],
  prop: string,
): string | null {
  const rules = matchingRules(src, elementClasses)
  if (rules.length === 0) return null
  // 特异度高者胜；**相等才看源码顺序**（后写的赢）—— 这正是第六轮搞错的地方。
  rules.sort((a, b) => {
    const s = cmpSpecificity(specificity(a.selector), specificity(b.selector))
    return s !== 0 ? s : a.order - b.order
  })
  const winner = rules[rules.length - 1]
  return winner.decls.get(prop) ?? null
}

/** `winningDeclaration(src, classes, 'opacity')` 的便捷包装（G177 用）。 */
export function winningOpacity(src: string, elementClasses: string[]): string | null {
  return winningDeclaration(src, elementClasses, 'opacity')
}
