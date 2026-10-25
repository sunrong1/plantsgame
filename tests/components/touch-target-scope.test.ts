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
import { clickableClassNames, touchTargetScope } from '../helpers/clickable-classes'
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
})
