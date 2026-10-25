/**
 * 命中区清单**不许漂移**的守卫（Story 3.5 / G317）。
 *
 * ── 守的是什么 ────────────────────────────────────────────────────────────
 *   `scripts/verify-portrait-layout.ts` 里那份 `TOUCH_TARGET_SELECTORS`
 *   是「孩子能点到的每一个元素」的**显式清单** ⇒ 判据按它逐个量渲染尺寸。
 *   ⚠️ **清单型判据的病根是「清单不会跟着 story 一起长大」**：
 *   源码里新增一个带 `@click` 的元素而清单没跟上 ⇒
 *   **判据静默变窄**（那个元素从此不被量）⇒ 而守卫**照样绿**。
 *
 * ── 📎 **怎么发现「漏项」**（B3 的硬要求）─────────────────────────────────
 *   **不许**用「清单里有多少个」来判 ⇒ **从源码反查**：
 *   每一个带 `@click` / `@pointerdown` / `@pointerup` 的 class，
 *   要么被清单里某条选择器覆盖，要么在**带理由的**豁免清单里。
 *
 * ── ⚠️ 判据纪律 ──────────────────────────────────────────────────────────
 *   · **反向自测调用判据本体**（R-51 第 9 条）：喂一份带 `@click` 的探针
 *     ⇒ 必须报出漏项；
 *   · **先断言「真扫到了东西」**（R-51 第 1 类 / G138 的教训）：
 *     扫描面必须**真的**覆盖 `src/` 下全部 `.vue`；
 *   · **豁免必须带理由**：没理由的豁免 = 一个没写下来的漏洞。
 */

import { describe, expect, it } from 'vitest'

import {
  TOUCH_TARGET_EXEMPTIONS,
  TOUCH_TARGET_SELECTORS,
} from '../../scripts/verify-portrait-layout'
import {
  classlessClickables,
  clickableClassNames,
  templateOf,
  touchTargetScope,
} from '../helpers/clickable-classes'
import { vueSourceFiles } from '../helpers/vue-sources'

const root = process.cwd()

/** `src/` 下全部 `.vue` 里反查出来的可点 class 集合。 */
function clickableClassesInSource(): { names: string[]; fileCount: number } {
  const files = vueSourceFiles(root)
  const names = new Set<string>()
  for (const file of files) {
    for (const name of clickableClassNames(file.source)) names.add(name)
  }
  return { names: [...names].sort(), fileCount: files.length }
}

describe('G317 —— 命中区清单不许漂移', () => {
  it('G317.1 源码里每一个可点 class 都落进了清单或**带理由的**豁免清单', () => {
    const { names, fileCount } = clickableClassesInSource()
    // ⚠️ 先证明「真的扫到了东西」—— 扫描面塌成一个文件的话，下面那条恒绿。
    expect(fileCount).toBeGreaterThan(1)
    expect(names.length).toBeGreaterThan(5)
    const result = touchTargetScope(names, TOUCH_TARGET_SELECTORS, TOUCH_TARGET_EXEMPTIONS)
    expect(result.missing).toEqual([])
  })

  it('G317.2 豁免清单里没有「已经没有对应 class」的陈旧条目', () => {
    const { names } = clickableClassesInSource()
    const result = touchTargetScope(names, TOUCH_TARGET_SELECTORS, TOUCH_TARGET_EXEMPTIONS)
    expect(result.staleExemptions).toEqual([])
  })

  it('G317.3 每一条豁免都**写了理由**（理由是豁免的凭据）', () => {
    const result = touchTargetScope([], TOUCH_TARGET_SELECTORS, TOUCH_TARGET_EXEMPTIONS)
    expect(result.reasonsMissing).toEqual([])
    for (const item of TOUCH_TARGET_EXEMPTIONS) {
      expect(item.reason.trim().length).toBeGreaterThan(0)
    }
  })

  it('G317.4 清单**至少**覆盖 B3 点名的七类元素', () => {
    const required = [
      '.battle-cell',
      '.option-card',
      '.hand-card',
      '.hand-deck__start',
      '.question-card__tappable',
      '.level-outcome__button',
      '.start-button',
    ]
    for (const selector of required) {
      expect(TOUCH_TARGET_SELECTORS).toContain(selector)
    }
  })

  it('G317.5 反向自测：源码里多一个带 `@click` 的 class 必须被报出来（**调用判据本体**）', () => {
    // 📎 探针：一份带 `@click`、而清单里没有的 class 的模板。
    const probe = ['<template>', '  <button class="brand-new-tap" @click="go">点</button>', '</template>'].join(
      '\n',
    )
    const probeClasses = clickableClassNames(probe)
    expect(probeClasses).toContain('brand-new-tap')
    const result = touchTargetScope(
      probeClasses,
      TOUCH_TARGET_SELECTORS,
      TOUCH_TARGET_EXEMPTIONS,
    )
    expect(result.missing).toContain('brand-new-tap')
  })

  it('G317.6 反向自测：把某个 class 加进豁免清单（**带理由**）后，它就不再是漏项', () => {
    const probe = ['<template>', '  <button class="brand-new-tap" @click="go">点</button>', '</template>'].join(
      '\n',
    )
    const probeClasses = clickableClassNames(probe)
    const withExemption = [
      ...TOUCH_TARGET_EXEMPTIONS,
      { className: 'brand-new-tap', reason: '探针：用来验证豁免机制本身有效' },
    ]
    const result = touchTargetScope(probeClasses, TOUCH_TARGET_SELECTORS, withExemption)
    expect(result.missing).not.toContain('brand-new-tap')
  })

  /* ── `[CR]` 2026-10-25 补的四条负向夹具 ──────────────────────────────────
   * 📎 原来这四条路径**一条负向夹具都没有** ⇒ 它们「从没被走到过」
   *   ⇒ 一旦判据坏掉，它们**照样全绿**（R-51 第 1 类）。
   *   ⇒ 现在每条都有一份**探针源码** ⇒ 直接调**判据本体**。
   */

  it('G317.7 「有事件绑定、却没有静态 class」的元素必须被**报成漏项**（不许静默跳过）', () => {
    // 📎 判据本体 `classlessClickables` + `touchTargetScope`。
    const probe = ['<template>', '  <button @click="go">点</button>', '</template>'].join('\n')
    const classless = classlessClickables(probe)
    expect(classless).toEqual(['<button>'])
    const result = touchTargetScope(
      clickableClassNames(probe),
      TOUCH_TARGET_SELECTORS,
      TOUCH_TARGET_EXEMPTIONS,
      classless,
    )
    // 🔥 它**必须**进 `missing` ⇒ 否则「没有 class 名」的元素**永远量不到**却没人知道。
    expect(result.missing).toContain('<button>')
  })

  it('G317.8 动态 `:class` **不许**被当成静态 class（否则状态 class 会淹掉真正的漏项）', () => {
    const probe = [
      '<template>',
      '  <div :class="isPicked ? \'is-picked\' : \'\'" @click="pick">点</div>',
      '</template>',
    ].join('\n')
    // 动态 class 里的名字**不许**出现在静态 class 集合里。
    expect(clickableClassNames(probe)).not.toContain('is-picked')
    // 而且这个元素**没有静态 class** ⇒ 必须走 classless 那条路被报出来。
    expect(classlessClickables(probe)).toEqual(['<div>'])
  })

  it('G317.9 根 `<template>` **带属性**时也必须认出来（否则整个文件的贡献归零）', () => {
    // 📎 原来的 `indexOf('<template>')` 在 `<template lang="pug">` 上返回 −1
    //   ⇒ 该文件的模板**整份被跳过** ⇒ 反查集合**静默变小**。
    //
    // ⚠️ 探针用 **pug 语法**（本仓 `.vue` 都是 HTML 语法，但判据要认的是
    //   「**根标签带属性**」这件事本身）⇒ pug 的 `button.brand-new-tap` 不是
    //   HTML 标签 ⇒ **class 提取器认不出它** ⇒ 这里断言的是
    //   **模板块被找到了**（`templateOf` 非空且含那一行）。
    const probe = [
      '<template lang="pug">',
      '  button.brand-new-tap(@click="go") 点',
      '</template>',
    ].join('\n')
    const template = templateOf(probe)
    expect(template.trim(), '带属性的根 <template> 没被认出来 ⇒ 整个文件的贡献归零').not.toBe('')
    expect(template).toContain('brand-new-tap')

    // 📎 顺带：**HTML 语法**的根标签带属性时，class 提取也要正常。
    const htmlProbe = [
      '<template lang="html">',
      '  <button class="brand-new-tap" @click="go">点</button>',
      '</template>',
    ].join('\n')
    expect(clickableClassNames(htmlProbe)).toContain('brand-new-tap')
  })

  it('G317.10 模板里的 **HTML 注释**不许被当成可点元素（否则注释里的 class 会进反查集合）', () => {
    const probe = [
      '<template>',
      '  <!-- <button class="commented-out" @click="go">注释里的</button> -->',
      '  <button class="real-tap" @click="go">真的</button>',
      '</template>',
    ].join('\n')
    const names = clickableClassNames(probe)
    expect(names).toContain('real-tap')
    expect(names).not.toContain('commented-out')
  })

  it('G317.11 **单引号**的 `class` 也必须被认出来（不然它会被误判成「没有 class」⇒ 假红淹掉真漏项）', () => {
    // 📎 探针：`class='…'`（**单引号**）—— Vue 模板里完全合法。
    //   原来的实现只认双引号 ⇒ 这个元素被判成 classless ⇒ 报出 `<button>`
    //   ⇒ **假红**（真漏项被淹掉 ⇒ 守卫照样绿，R-51 第 1 类）。
    const probe = [
      '<template>',
      "  <button class='single-quoted-tap' @click='go'>点</button>",
      '</template>',
    ].join('\n')
    const names = clickableClassNames(probe)
    // 🔥 判据本体：单引号里的 class 名**必须**被提取出来。
    expect(names).toContain('single-quoted-tap')
    // 📎 而且它**不算**「没有静态 class」⇒ 不许报假红。
    expect(classlessClickables(probe)).toEqual([])

    // 📎 对照：**双引号**那一份（确认改动没把原来能认的弄坏）。
    const dqProbe = [
      '<template>',
      '  <button class="double-quoted-tap" @click="go">点</button>',
      '</template>',
    ].join('\n')
    expect(clickableClassNames(dqProbe)).toContain('double-quoted-tap')
    expect(classlessClickables(dqProbe)).toEqual([])
  })
})
