/**
 * @vitest-environment jsdom
 */
/**
 * 调试面板的组件测试与源码守卫（Story 1.17 / AC-D，G110–G113）。
 *
 * ── 四条纪律（照抄 `hud.test.ts`，AC-F3）────────────────────────────────────
 *   ① 顶部的 `@vitest-environment jsdom` **docblock**；
 *   ② 断言前 `await nextTick()`；
 *   ③ 每个用例 `enableAutoUnmount(afterEach)`；
 *   ④ 源码匹配型守卫先 `stripComments()`（R-52）。
 *
 * ── 这个面板的边界（AC-D1 / AC-D2 / G110）───────────────────────────────────
 * 面板**只调 `store` 的门面**。它不 import `core/actions`（组件层不许构造 action），
 * 也不 import `core/balance`（数值常量的值归 Story 3.2 调；`heartSlots()` 是同款先例）。
 *
 * ── 为什么面板文案有守卫（G111 / AC-D3）────────────────────────────────────
 * 面板面向**家长与开发者**，不是 4–8 岁孩子 —— 但 NFR13「孩子面前永不出现技术错误」
 * 在这一层仍然成立：**家长看不懂的报错就是「白着而没有任何东西指向原因」**。
 * 同一层还有个更细的要求：三个开关的语义**必须如实写出来** ——
 * 「无限心」的真实语义是「掉心后回到 1，永不失败」，不是「心数变成 ∞」；
 * 家长按字面理解会以为可以故意耗心去试失败画面，而那正是它做不到的事。
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { enableAutoUnmount } from '@vue/test-utils'
import { nextTick } from 'vue'

import DebugPanel from '../../src/components/debug/DebugPanel.vue'
import {
  devFlags,
  devSetDirectWin,
  devSetInfiniteHearts,
  devSetInfiniteSun,
  state,
} from '../../src/app/store'
import { createInitialState } from '../../src/core'
import { afterEachUninstall, installFakeStorage } from '../fixtures/fake-storage'
import { stripComments } from '../fixtures/strip-comments'
import { makeSyntheticDeck } from '../fixtures/synthetic-deck'

const root = process.cwd()
const DECK = makeSyntheticDeck(25, 1)

/** 组件源码的**代码部分**（R-52：注释里的话不算面板文案）。 */
function panelSource(): string {
  return stripComments(readFileSync(join(root, 'src/components/debug/DebugPanel.vue'), 'utf8'))
}

/** 组件源码里全部 `import ... from '...'` 的模块说明符。 */
function panelImports(source: string): readonly string[] {
  return [...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map((m) => m[1])
}

beforeEach(() => {
  installFakeStorage()
  state.value = createInitialState({ unitNumber: 1, deck: DECK })
  devSetInfiniteHearts(false)
  devSetInfiniteSun(false)
  devSetDirectWin(false)
})

afterEachUninstall()
enableAutoUnmount(afterEach)

// ── AC-D1 / AC-D3 —— 渲染与文案 ────────────────────────────────────────────

describe('DebugPanel —— 渲染与 AC-D3 的文案（Story 1.17 / AC-D1、AC-D3）', () => {
  it('三个开关都渲染出来，勾选状态读 store 的门面', async () => {
    const panel = mount(DebugPanel)
    const boxes = panel.findAll('input[type="checkbox"]')
    expect(boxes).toHaveLength(3)
    for (const box of boxes) {
      expect((box.element as HTMLInputElement).checked, '三个开关默认必须全关').toBe(false)
    }
  })

  it('点开一个开关，`devFlags` 跟着变，且**下一次 tick 面板自己重画**', async () => {
    const panel = mount(DebugPanel)
    const hearts = panel.findAll('input[type="checkbox"]')[0]

    await hearts.setValue(true)
    await nextTick()

    expect(devFlags.infiniteHearts, '面板没有经 store 门面改到 flags').toBe(true)
    expect((panel.findAll('input[type="checkbox"]')[0].element as HTMLInputElement).checked).toBe(
      true,
    )
  })

  it('AC-D3：「无限心」写的是「回到 1、永不失败」，**没有**把它说成 ∞', () => {
    const text = mount(DebugPanel).text()

    expect(text).toContain('掉心后回到 1')
    expect(text).toContain('永远不会失败')
    // ⚠️ 反向断言的边界：`∞` 只许出现在**别的**开关语境里也不合适 ——
    //   本 story 三个开关没有一个是真的无穷，标 ∞ 的后果见 AC-D3 的 ⚠️。
    expect(text, '面板把「无限心」标成了 ∞ —— 那是假的').not.toContain('∞')
  })

  it('AC-D3：「无限阳光」与「直接通关」的语义也写在面板上', () => {
    const text = mount(DebugPanel).text()
    expect(text).toContain('9999')
    expect(text).toContain('通关')
  })
})

// ── G111 —— 面板零技术错误字样 ────────────────────────────────────────────

describe('G111 —— 面板文案零技术错误字样（Story 1.17 / AC-D3、NFR13）', () => {
  // ⚠️ AC 逐字列的五个词。用词边界而不是裸 `includes`：
  //   `undefined` 出现在别的词里（本地化文案的中文里不会有）这条判据就该放过。
  const BANNED: readonly (readonly [string, RegExp])[] = [
    ['Error', /\bError\b/],
    ['异常', /异常/],
    ['undefined', /\bundefined\b/],
    ['NaN', /\bNaN\b/],
    ['堆栈', /堆栈|stack\s+trace/i],
  ]

  /** 组件源码里命中红线的行（`行号 → 标签`）。 */
  function hits(source: string): readonly string[] {
    return source
      .split('\n')
      .flatMap((line, i) =>
        BANNED.filter(([, p]) => p.test(line)).map(([label]) => `${i + 1}: ${label}`),
      )
  }

  it('判据自检：这四种真实违规形态都会被拦下，合法文案不会误报', () => {
    expect(hits('<p>Error: boom</p>')).toHaveLength(1)
    expect(hits('<p>存档出现异常</p>')).toHaveLength(1)
    expect(hits('<p>{{ oops }}</p>')).toEqual([])
    expect(hits('<p>心数是 undefined</p>')).toHaveLength(1)
    expect(hits('<p>{{ ratio }} 已是 NaN</p>')).toHaveLength(1)
    expect(hits('<p>调试面板 · 无限心 · 掉心后回到 1，永远不会失败</p>')).toEqual([])
  })

  it('G111：`DebugPanel.vue` 的文案里零技术错误字样', () => {
    const source = panelSource()
    expect(source, '面板源码读不到 —— 路径或文件名变了，本条已失明').not.toBe('')
    expect(hits(source), '面板文案里出现了技术错误字样（NFR13）').toEqual([])
  })
})

// ── G110 —— 面板只调 store 门面 ───────────────────────────────────────────

describe('G110 —— 面板只调 `store` 的门面（Story 1.17 / AC-D2）', () => {
  it('判据自测：`panelImports` 读得出 import，且分得清相对层级', () => {
    expect(panelImports("import { a } from '../../src/core'\nimport { b } from 'vue'")).toEqual([
      '../../src/core',
      'vue',
    ])
  })

  it('G110：面板不 import `core/actions`，也不自己 import `dev-adjust`', () => {
    const imports = panelImports(panelSource())

    for (const specifier of imports) {
      expect(specifier, '组件不许直接构造 action（store.ts 对 selectedEntryId 的纪律）').not.toMatch(
        /core\/actions/,
      )
      expect(specifier, 'dev 能力必须经 store 门面 —— 直连 dev-adjust 绕过了它').not.toMatch(
        /dev-adjust/,
      )
      expect(specifier, '数值常量归 Story 3.2 调，组件不许直读（eslint 同款禁令）').not.toMatch(
        /core\/balance/,
      )
    }
  })

  it('G110：面板真的调的是 store 的 dev 门面（不许只导入了却不用）', () => {
    const source = panelSource()
    expect(panelImports(source), '面板必须 import store').toContain('../../app/store')
    for (const facade of ['devSetInfiniteHearts', 'devSetInfiniteSun', 'devSetDirectWin']) {
      expect(source, `面板调的不是 store 门面的 ${facade}`).toContain(facade)
    }
  })
})

// ── G112 —— URL 参数只在 DEV 下生效 ───────────────────────────────────────

describe('G112 —— `?debug=1` 只在 DEV 下打开面板（Story 1.17 / AC-D4、裁决 11）', () => {
  it('DEV 下带 `?debug=1` ⇒ 请求打开面板', async () => {
    expect(import.meta.env.DEV).toBe(true)
    history.replaceState(null, '', '/?debug=1')
    const { isDebugPanelRequested } = await import('../../src/app/dev-adjust')
    expect(isDebugPanelRequested()).toBe(true)
  })

  it('DEV 下不带参数 ⇒ 不打开', async () => {
    history.replaceState(null, '', '/')
    const { isDebugPanelRequested } = await import('../../src/app/dev-adjust')
    expect(isDebugPanelRequested()).toBe(false)
  })

  it('G112：读 URL 之前先判 `import.meta.env.DEV`（生产下 `?debug=1` 打不开面板）', () => {
    const source = stripComments(readFileSync(join(root, 'src/app/dev-adjust.ts'), 'utf8'))
    const body = source.slice(source.indexOf('export function isDebugPanelRequested'))
    expect(body, 'isDebugPanelRequested 找不到了 —— 判据已失明').not.toBe('')

    const guardAt = body.indexOf('import.meta.env.DEV')
    const urlAt = body.indexOf('URLSearchParams')
    expect(guardAt, 'isDebugPanelRequested 里没有 DEV 判据 —— 生产下 ?debug=1 就能打开面板').toBeGreaterThan(-1)
    expect(urlAt, '没有读 URL —— 判据已失明').toBeGreaterThan(-1)
    expect(
      guardAt < urlAt,
      'URL 参数在 DEV 判据之前被读 —— NFR22 直接被绕过',
    ).toBe(true)
  })

  it('G112 的反向自测：一份「从 URL 起算」的探针会被本条判据判为违规', () => {
    // ⚠️ R-51：断言必须真能咬住它要防的违规。判据与上面那条**同形**。
    const illegal = (body: string): boolean => {
      const guardAt = body.indexOf('import.meta.env.DEV')
      const urlAt = body.indexOf('URLSearchParams')
      if (guardAt < 0 || urlAt < 0) return false
      return guardAt < urlAt
    }
    const probe = 'const p = new URLSearchParams(location.search).get("debug")\nreturn p === "1"\n'
    expect(illegal(probe), '判据自测：从 URL 起算的探针没被判违规').toBe(false)
  })
})

// ── G113 —— 面板不得可路由到达 ────────────────────────────────────────────

describe('G113 —— 面板不是可路由到达的页面（Story 1.17 / AC-D5、裁决 9）', () => {
  it('G113：`src/views/**` 下零 `components/debug` 的 import', () => {
    const offenders: string[] = []
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name)
        if (statSync(full).isDirectory()) walk(full)
        else if (/\.vue$/.test(name) && /components\/debug/.test(readFileSync(full, 'utf8'))) {
          offenders.push(full)
        }
      }
    }
    walk(join(root, 'src/views'))
    expect(offenders, '面板被 views 直接 import 了 —— 它变成了一个可路由到达的页面').toEqual([])
  })

  it('G113：`src/components/debug/` 下只有面板本身，没有第二个「页面」', () => {
    // ⚠️ 过滤掉 `.gitkeep` 这类占位 —— 目录里本来就有一个（`src/components/debug`
    //   在本 story 之前是空目录）。判据要问的是「有没有第二个**组件**」。
    const names = readdirSync(join(root, 'src/components/debug')).filter((n) => !n.startsWith('.'))
    expect(names).toEqual(['DebugPanel.vue'])
  })

  it('G113：面板挂在一个**已存在的**视图里（不是自己造一个视图文件）', () => {
    const app = readFileSync(join(root, 'src/App.vue'), 'utf8')
    const level = readFileSync(join(root, 'src/views/LevelView.vue'), 'utf8')
    expect(
      /components\/debug/.test(app) || /components\/debug/.test(level),
      '面板谁都没挂 —— 它写完了却不可见，等于没写',
    ).toBe(true)
  })
})
