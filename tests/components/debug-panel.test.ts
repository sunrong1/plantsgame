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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount } from '@vue/test-utils'
import { nextTick } from 'vue'

import DebugPanel from '../../src/components/debug/DebugPanel.vue'
import {
  applyAction,
  devFlags,
  devSetDirectWin,
  devSetInfiniteHearts,
  devSetInfiniteSun,
  progress,
  resetSession,
  state,
  view,
} from '../../src/app/store'
import { answer, createInitialState } from '../../src/core'
import {
  clearAssetDegradationsForTest,
  markAssetDegraded,
} from '../../src/services/asset-degradations'
import { readSave, writeSave, SAVE_KEY, SAVE_SCHEMA_VERSION } from '../../src/services/save'
import { afterEachUninstall, installFakeStorage } from '../fixtures/fake-storage'
import { exportedFunctionBody } from '../fixtures/exported-function-body'
import type { FakeStorage } from '../fixtures/fake-storage'
import { stripComments } from '../fixtures/strip-comments'
import { correctOptionId, makeSyntheticDeck } from '../fixtures/synthetic-deck'

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

/**
 * 本次用例用的那份 fake storage。
 *
 * ⚠️ 单独提出来是因为新加的「后降级」用例要**先正常挂载、再打开 `throwOnSet`** ——
 *   那个开关必须由用例中途翻转，模块级变量才拿得到。
 */
let storage: FakeStorage

/**
 * NFR13 的红线词表 —— **全文件共用这一份**（`[CR]` 2026-10-17 提为模块级）。
 *
 * ⚠️ 提到模块级是因为新增的「剪贴板被拒」用例也要用它，而那处文案
 *   **恰恰是最容易顺手写出 `err.message` 的地方**（失败分支）。
 *   两处各抄一份的话，两份会各自漂移，而漂移的那份永远是没人看的那份。
 *
 * ⚠️ 用词边界而不是裸 `includes`：`undefined` 出现在别的词里
 *   （本地化文案的中文里不会有）这条判据就该放过。
 */
const BANNED_TERMS: readonly (readonly [string, RegExp])[] = [
  ['Error', /\bError\b/],
  ['异常', /异常/],
  ['undefined', /\bundefined\b/],
  ['NaN', /\bNaN\b/],
  ['堆栈', /堆栈|stack\s+trace/i],
]

beforeEach(() => {
  storage = installFakeStorage()
  state.value = createInitialState({ unitNumber: 1, deck: DECK })
  devSetInfiniteHearts(false)
  devSetInfiniteSun(false)
  devSetDirectWin(false)
  // ⚠️ **三个 registry 都是模块级状态，不会自动复位** —— 与 fake storage 同理
  //   （见它的文件头第 4 点）。漏清就是上一个用例的降级项漏进下一个，
  //   而断言只查「有没有出现那一行」，**照样全绿**。
  // ⚠️ 存档那个**没有 `clear…ForTest`**（与 `asset-degradations.ts` 不同）——
  //   `clearSave()` 是有真实语义的「玩家要求清档」，拿它清降级登记是误用。
  //   诚实的复位方式是**成功写一次**：`save.ts` 逐字约定「一次成功写入会清空全部降级项」。
  writeSave({ currentUnitIndex: 0, masteredWordIds: [] }, null)
  clearAssetDegradationsForTest()
  // ⚠️ **会话录制也是模块级状态**（`app/store` 是单例），本文件原先漏了复位。
  //   漏掉的表现很隐蔽：某个用例 dispatch 过一次之后，后面每个用例的
  //   `exportSession()` 都**带着前面那几条 action** ⇒ 断言「导出恰好 1 条」
  //   会从「第一条对」变成「第二条起全错」，而排查方向会整个跑偏到面板上。
  //   （`tests/app/session-recorder.test.ts` 的 `beforeEach` 逐字写着同一句提醒。）
  resetSession()
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
  /** 组件源码里命中红线的行（`行号 → 标签`）。 */
  function hits(source: string): readonly string[] {
    return source
      .split('\n')
      .flatMap((line, i) =>
        BANNED_TERMS.filter(([, p]) => p.test(line)).map(([label]) => `${i + 1}: ${label}`),
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
    // ⚠️📎 **`[CR]` 2026-10-17 换切法**：原来写的是
    //   `source.slice(source.indexOf('export function isDebugPanelRequested'))` ——
    //   **切到文件末尾**。按 `dev-adjust.ts` 注释预告的那个重构（把 URL 解析抽成
    //   `devParam(name)`）做完之后，判据要找的两样东西会双双落到**后面另一个函数**
    //   `isTowerRangeOverlayRequested` 里，而本条**照样绿**（实测 `green? true`）。
    //   ⇒ 改用共享的 `exportedFunctionBody`，它切到**下一个顶层 export** 为止。
    //   同一 story 的 G118 第一版就写对了这个切法，现在两份共用一份实现（R-37）。
    const body = exportedFunctionBody(source, 'export function isDebugPanelRequested')

    const guardAt = body.indexOf('import.meta.env.DEV')
    const urlAt = body.indexOf('URLSearchParams')
    expect(guardAt, 'isDebugPanelRequested 里没有 DEV 判据 —— 生产下 ?debug=1 就能打开面板').toBeGreaterThan(-1)
    expect(urlAt, '没有读 URL —— 判据已失明').toBeGreaterThan(-1)
    expect(
      guardAt < urlAt,
      'URL 参数在 DEV 判据之前被读 —— NFR22 直接被绕过',
    ).toBe(true)
  })

  it('G112 的反向自测：判据与上面那条**同形**（R-53），且真能咬住违规', () => {
    // ⚠️📎 **原版的反向自测是坏的**：它拿一份独立字符串喂一个独立写的
    //   `illegal()` 函数，与真判据的 `slice` 行为**不同形** ——
    //   所以真判据切到末尾会放过违规这件事，自测**一点都测不出来**。
    //   ⇒ 现在两边共用同一个 `exportedFunctionBody`，「同形」是结构保证的。
    //
    // ⚠️ 名字按**真实返回值**起：它返回的是「DEV 判据在读 URL 之前」，
    //   那是**合规**而不是违规 —— 原版把它叫 `illegal`，读的人会判反。
    const guardBeforeUrl = (body: string): boolean => {
      const guardAt = body.indexOf('import.meta.env.DEV')
      const urlAt = body.indexOf('URLSearchParams')
      if (guardAt < 0 || urlAt < 0) return false
      return guardAt < urlAt
    }

    // ① 合规：DEV 判据在前
    const legal = [
      'export function isDebugPanelRequested(): boolean {',
      '  if (!import.meta.env.DEV) return false',
      '  return new URLSearchParams(location.search).get("debug") === "1"',
      '}',
      'export function isTowerRangeOverlayRequested(): boolean {',
      '  return import.meta.env.DEV',
      '}',
    ].join('\n')
    expect(
      guardBeforeUrl(exportedFunctionBody(legal, 'export function isDebugPanelRequested')),
      '判据自测：合规写法被判成了违规',
    ).toBe(true)

    // ② 违规：URL 在 DEV 判据之前 —— 真判据必须抓到
    const swapped = [
      'export function isDebugPanelRequested(): boolean {',
      '  const p = new URLSearchParams(location.search).get("debug")',
      '  return import.meta.env.DEV && p === "1"',
      '}',
      'export function isTowerRangeOverlayRequested(): boolean {',
      '  return import.meta.env.DEV',
      '}',
    ].join('\n')
    expect(
      guardBeforeUrl(exportedFunctionBody(swapped, 'export function isDebugPanelRequested')),
      '判据自测：URL 先读后判 DEV 的违规没被抓到',
    ).toBe(false)

    // ③ **那条把真判据变成恒绿的形状**：目标函数里两样都拿掉了，
    //    而后面那个函数两样都有 ⇒ 切到末尾就会拿后者的判据冒充前者的。
    //    这是本条修复的直接靶子，没有它就看不出切法有没有生效。
    const movedOn = [
      'export function isDebugPanelRequested(): boolean {',
      '  return devParam("debug") === "1"',
      '}',
      'export function isTowerRangeOverlayRequested(): boolean {',
      '  if (!import.meta.env.DEV) return false',
      '  return new URLSearchParams(location.search).get("range") === "1"',
      '}',
    ].join('\n')
    expect(
      guardBeforeUrl(exportedFunctionBody(movedOn, 'export function isDebugPanelRequested')),
      '后一个函数的判据冒充成了前一个的 —— 切法退回了「切到文件末尾」，' +
        '这正是 `[CR]` 记录的那次静默放过',
    ).toBe(false)
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

// ── 组 F：跳回合的控件（Story 1.17 / Task 7.1、AR40）────────────────────────
//
// ⚠️ **这一段是 AR40 的最后一环**：门面 `jumpToTurn` 有了（`tests/app/jump-turn.test.ts`），
//   但界面上没有控件的话开发者在面板上按不到它 —— AR40 逐字要的是
//   「**使用**「跳到任意回合」**无需重打 10 回合**」，不是「代码里有这个函数」。

describe('组 F —— 面板上的「跳到任意回合」（Story 1.17 / Task 7.1、AR40）', () => {
  it('面板上有一个数字输入框 + 「跳回合」按钮（AR40 说的那个「使用」）', () => {
    const panel = mount(DebugPanel)
    expect(
      panel.find('input[type="number"]').exists(),
      '面板上没有目标回合输入框 —— AR40 的功能按不到',
    ).toBe(true)
    expect(panel.find('button[data-action="jump-turn"]').exists()).toBe(true)
  })

  it('⚠️ 跳回合控件**不是第四个开关**（AC-D3 逐字列的是三个）', () => {
    const panel = mount(DebugPanel)
    expect(panel.findAll('input[type="checkbox"]'), '多加一个开关就是超出 AC-D3').toHaveLength(3)
  })

  it('输入 6 点按钮 ⇒ 盘上真的到了第 6 回合，面板如实报出来', async () => {
    // ⚠️ 先落到战场上：还在开始界面时 `jumpToTurn` 会先 `enterLevel()` 读档
    //   （裁决 7 的原意），那样量到的是「读档把局面换了」，不是「跳回合」。
    view.value = 'level'
    devSetInfiniteHearts(true)
    const panel = mount(DebugPanel)

    await panel.find('input[type="number"]').setValue(6)
    await panel.find('button[data-action="jump-turn"]').trigger('click')
    await nextTick()

    expect(state.value.turn, '面板点了按钮但局面没动').toBe(6)
    expect(panel.text()).toContain('已到第 6 回合')
  })

  it('跳不远时**不说到达**（未勾无限心 ⇒ 如实报「停在第几回合」）', async () => {
    view.value = 'level'
    devSetInfiniteHearts(false)
    const panel = mount(DebugPanel)

    await panel.find('input[type="number"]').setValue(12)
    await panel.find('button[data-action="jump-turn"]').trigger('click')
    await nextTick()

    const text = panel.text()
    expect(text, '心耗尽了却报「已到第 12 回合」—— 那是撒谎').not.toContain('已到第 12 回合')
    expect(text, '跳不远时没有把停在哪写出来 —— 家长看到的是「按了没反应」').toContain('停在第')
    // ⚠️📎 **`[CR]` 2026-10-17 换判据（R-51）**：原来是
    //   `expect(stoppedAt).toBeGreaterThan(0)` —— 而 `jumpToTurn` 把目标夹到 ≥ 1、
    //   `reachedTurn` 于是恒 ≥ 1 ⇒ **对任何实现恒绿**，一条装饰守卫。
    //   ⇒ 改成**逐字相等**，值取自实测（25 题题单 + 不建塔 ⇒ 第 6 回合心耗尽）。
    //   一旦夹取口径、失败回合或文案格式漂了，这一条会红；而 `toBeGreaterThan(0)` 不会。
    const stoppedAt = Number(/停在第 (\d+) 回合/.exec(text)?.[1])
    expect(stoppedAt, '面板没写出「停在第 N 回合」—— 正则没匹配上，Number(undefined) 是 NaN').toBe(6)
    expect(stoppedAt).toBeLessThan(12)
    expect(stoppedAt, '面板报的不是盘上真实停住的那一回合').toBe(state.value.turn)
    // 🔥 **鉴别力自证**：把期望值抬高/压低都应当红 ——
    //   否则「等于某个数」也只是把恒绿换了个形状。
    expect(stoppedAt).not.toBe(12)
    expect(stoppedAt).not.toBe(1)
  })

  it('输入框空着或填负数 ⇒ 夹到第 1 回合，不崩也不乱跳', async () => {
    view.value = 'level'
    devSetInfiniteHearts(true)
    for (const raw of ['', '-5']) {
      resetSession()
      const panel = mount(DebugPanel)
      await panel.find('input[type="number"]').setValue(raw)
      await panel.find('button[data-action="jump-turn"]').trigger('click')
      await nextTick()
      expect(state.value.turn, `输入 ${JSON.stringify(raw)} 把局面弄坏了`).toBe(1)
      expect(panel.text()).toContain('已到第 1 回合')
      panel.unmount()
    }
  })

  it('G110：跳回合经的是 `store` 的门面（面板不许直连 store 以外的东西）', () => {
    const source = panelSource()
    expect(source, '面板调的不是 store 的 jumpToTurn 门面').toContain('jumpToTurn')
    expect(panelImports(source)).toContain('../../app/store')
    expect(panelImports(source), '跳回合不许自己 import core/actions 去造 action').not.toContain(
      '../../core/actions',
    )
  })

  it('反向自测：「撒谎式」的结果文案会被上面两条判据抓到', () => {
    // 判据自检：文案层分得清「到达」与「停在」，两者不可互换。
    expect('已到第 6 回合'.includes('停在第')).toBe(false)
    expect('停在第 3 回合'.includes('已到第')).toBe(false)
  })
})

// ── [CR] 2026-10-17 —— 「导出会话」控件（裁决 3 / AR39）───────────────────
//
// ⚠️📎 这一组的判据方向是**「从界面拿到 JSON」**，而不是「某个函数返回什么」：
//   评审发现 `exportSession` 与 `isRecording` 全仓**零 UI 消费者** ——
//   唯一引用在 `tests/`。三处注释（`session-recorder.ts` 文件头、
//   `isRecording()` 的注释、`session-recorder.test.ts`）逐字指向一个
//   **不存在的按钮**，而本 story 的 persona 是家长 ⇒ 那份 JSON 在界面上无从产出。
describe('[CR 2026-10-17] 面板上的「导出会话」（裁决 3 / AR39）', () => {
  /**
   * 真按一下当前那道题 —— 走 store 门面，让 `recordStep` 真的录到一条。
   *
   * ⚠️ 走 `applyAction` 而不是直接调 `recordStep`：判据钉在纯函数上时，
   *   「谁调了它」会整个漏掉（`docs/rules/architecture.md` R-06 段逐字记过两次实测）。
   */
  function answerCurrentQuestion(): void {
    if (state.value.phase.kind !== 'awaiting-answer') {
      throw new Error(`当前阶段是 ${state.value.phase.kind}，没有正在问的题 —— 测试步骤写错了`)
    }
    applyAction(answer(correctOptionId(state.value.phase.question)))
  }

  /**
   * 装一份可写的剪贴板 —— jsdom 默认**没有** `navigator.clipboard`。
   *
   * ⚠️ `vi.stubGlobal` 而不是直接赋值：本文件有 `vi.unstubAllGlobals` 兜底
   *   （`afterEachUninstall` 同款思路），直接赋值会漏给下一个用例。
   */
  function installClipboard(): { written: string[] } {
    const written: string[] = []
    vi.stubGlobal('navigator', {
      ...globalThis.navigator,
      clipboard: {
        writeText: (text: string) => {
          written.push(text)
          return Promise.resolve()
        },
      },
    })
    return { written }
  }

  /** 导出按钮的 `disabled` 状态。 */
  function exportDisabled(wrapper: ReturnType<typeof mount>): boolean {
    return (wrapper.find('[data-action="export-session"]').element as HTMLButtonElement).disabled
  }

  it('面板上真的有这个按钮 —— 不是只有门面', () => {
    expect(
      mount(DebugPanel).find('[data-action="export-session"]').exists(),
      '面板上没有「导出会话」控件 ⇒ 本 story 的 persona（家长）在界面上无从产出那份 JSON，' +
        '而三处注释都指着它',
    ).toBe(true)
  })

  it('没录过时按钮是**置灰**的（`:disabled`）', () => {
    expect(
      exportDisabled(mount(DebugPanel)),
      '没录过却可点 —— 点了就是让 `exportSession()` 在家长面前抛一次',
    ).toBe(true)
  })

  it('录过之后按钮解灰 —— 置灰状态跟着 dispatch 走', async () => {
    const panel = mount(DebugPanel)
    expect(exportDisabled(panel), '前置：此刻应当是灰的').toBe(true)

    answerCurrentQuestion()
    await nextTick()

    expect(
      exportDisabled(panel),
      '已经录到 action 了却还是灰的 —— `canExport` 没挂上响应式依赖，' +
        '光调 `isRecording()` 建不起任何依赖，它会永远停在挂载那一刻算出的假',
    ).toBe(false)
  })

  it('点一下 ⇒ 剪贴板里是**可 `JSON.parse` 的 `{ initialState, actions[] }`**', async () => {
    const { written } = installClipboard()
    const panel = mount(DebugPanel)
    answerCurrentQuestion()
    await nextTick()

    await panel.find('[data-action="export-session"]').trigger('click')
    await nextTick()

    expect(written, '点了按钮但剪贴板里什么都没有 —— 家长拿不到那份 JSON').toHaveLength(1)
    const parsed = JSON.parse(written[0]!) as {
      initialState?: { turn?: unknown }
      actions?: readonly { type: string }[]
    }
    expect(
      Object.keys(parsed).sort(),
      '导出形状不是 `{ initialState, actions[] }` —— 喂不回 `replaySession()`（AC 逐字）',
    ).toEqual(['actions', 'initialState'])
    expect(parsed.actions, '导出的 action 序列是空的').toHaveLength(1)
    expect(parsed.actions?.[0]?.type).toBe('ANSWER')
    expect(typeof parsed.initialState?.turn, '起点必须是整局的第一回合').toBe('number')
    expect(panel.text(), '复制成功后应当有一句人话反馈').toContain('已复制到剪贴板')
  })

  // ⚠️ 这一条守的是 `[CR]` 里那个「活引用」修复：**序列化必须发生在复制之前**。
  //   若实现改成「把 SessionExport 先存起来、之后再 stringify」，
  //   `resetSession()` 就会在中间把剪贴板那份清空。
  it('复制之后再 `resetSession()` ⇒ 剪贴板里那份**不受影响**', async () => {
    const { written } = installClipboard()
    const panel = mount(DebugPanel)
    answerCurrentQuestion()
    await nextTick()
    await panel.find('[data-action="export-session"]').trigger('click')
    await nextTick()
    const atCopy = written[0]!

    resetSession()
    await nextTick()

    expect(
      (JSON.parse(atCopy) as { actions: readonly unknown[] }).actions,
      '剪贴板里那份被后续 reset 清空了 —— 家长已经交出去的「可复现现场」是空的，' +
        '而把它喂回 replaySession 不抛错，直接返回 initialState（一个从没玩到过的局面）',
    ).toHaveLength(1)
  })

  it('剪贴板被拒 ⇒ 说人话，**不冒技术字样**（NFR13 / 守卫 G111）', async () => {
    // ⚠️ 造**真实的**拒绝形态：非安全上下文 / 用户拒授权时 `writeText` 就是 reject。
    vi.stubGlobal('navigator', {
      ...globalThis.navigator,
      clipboard: { writeText: () => Promise.reject(new Error('NotAllowedError')) },
    })
    const panel = mount(DebugPanel)
    answerCurrentQuestion()
    await nextTick()

    await panel.find('[data-action="export-session"]').trigger('click')
    await nextTick()

    const text = panel.text()
    expect(text, '复制失败时应当给家长一句能懂的话').toContain('没复制成')
    // ⚠️ 与 G111 用**同一份红线表**：这里重新抄一份的话，两处会各自漂移，
    //   而「失败文案」恰恰是最容易顺手写出一个 `err.message` 的地方。
    for (const [label, re] of BANNED_TERMS) {
      expect(text, `失败文案里出现了红线词「${label}」`).not.toMatch(re)
    }
  })
})

// ── [CR] 2026-10-17 —— 降级面板的刷新信号 ─────────────────────────────────
//
// ⚠️📎 **这一组的判据方向与本文件其余用例相反，是刻意的**：
//   其余用例都「**先降级，后挂载**」—— 那一路上 `computed` 在挂载时算一次就对了，
//   面板于是**看起来**是响应式的。而真实的故障形态恰恰是**反过来的**：
//   面板早就开着（家长就是为查这个才打开它的），降级**之后**才发生。
//   那一路上 Vue 对模块级 `Map` / 普通变量**建不起任何依赖** ⇒ 面板永远停在
//   「没有降级项」，而磁盘上早就写不进去了。
//   ⇒ 「后降级」这一路在接线做对之前是**恒红**的，不是恒绿。
describe('[CR 2026-10-17] 面板先开着、之后才降级 ⇒ 它必须自己刷出来', () => {
  it('存档写盘失败发生在**挂载之后** ⇒ 面板刷出那一行并露出「重试写入」', async () => {
    const panel = mount(DebugPanel)
    await nextTick()
    expect(panel.text(), '前置：挂载那一刻盘上是好的').toContain('没有降级项')
    expect(panel.find('[data-action="retry-save-write"]').exists(), '前置：此时不该有重试按钮').toBe(
      false,
    )

    // ⚠️ **降级发生在面板已经挂载之后** —— 这才是本条的全部意义。
    storage.throwOnSet = true
    writeSave(progress.value, state.value)
    await nextTick()

    expect(
      panel.text(),
      '挂载之后才发生的写盘失败没有显示 —— 家长开着面板等的就是这条，' +
        '而它一直显示「没有降级项」，截图交出去等于什么都没说',
    ).toContain('key=write')
    expect(
      panel.find('[data-action="retry-save-write"]').exists(),
      '写盘已经在降级了，「重试写入」按钮却不露脸 —— 家长连补救的入口都没有',
    ).toBe(true)
  })

  it('内容资产（词图）降级发生在**挂载之后** ⇒ 面板同样刷出来', async () => {
    const panel = mount(DebugPanel)
    await nextTick()
    expect(panel.text(), '前置：挂载那一刻没有资产降级').toContain('没有降级项')

    markAssetDegraded('/words/apple.svg', '词图加载失败')
    await nextTick()

    expect(
      panel.text(),
      '挂载之后才挂掉的词图没显示 —— 面板对存档敏感、对资产不敏感，' +
        '而后者的失败现场恰恰只有面板能查',
    ).toContain('/words/apple.svg')
  })

  it('降级被清掉也要刷 —— 家长点完「重试写入」看到的必须是「好了」', async () => {
    const panel = mount(DebugPanel)
    storage.throwOnSet = true
    writeSave(progress.value, state.value)
    await nextTick()
    expect(panel.text(), '前置：这一行应当在').toContain('key=write')

    // 恢复正常后点「重试写入」—— 写成功会清掉降级项（`save.ts` 的契约）。
    storage.throwOnSet = false
    await panel.find('[data-action="retry-save-write"]').trigger('click')
    await nextTick()

    expect(
      panel.text(),
      '存储恢复了却还显示着降级项 —— 家长修好了问题，面板还在说没好，' +
        '下一次他就不会相信这块面板了',
    ).toContain('没有降级项')
  })

  // ⚠️📎 下面这条与上一条**不是同一件事**，上一条抓不到它（评审变异时实测）：
  //   上一条走的是面板自己的 `bump`（点按钮必然 `bump.value += 1`），
  //   所以把 `writeSave` 里的 `noteDegradationsChanged()` 删掉，它**照样绿**。
  //   而「清空」这条路上**没有人 bump** —— 它完全依赖底层的通知。
  it('降级被**底层**清掉（一次成功的 `readSave`）也要刷 —— 没人 bump 就靠通知', async () => {
    const panel = mount(DebugPanel)
    // 🔥📎 **`[CR]` 2026-10-21 改夹具，按 R-57 留痕（Story 1.15 评审带出来的连带项）。**
    //
    // ⚠️ **原来这条用例的夹具恰恰钉住了 1.15 的一个行为错误**：它先 `throwOnSet`
    //   造一条 **`write`** 降级，再靠一次成功的 `readSave()` 把它清掉 ——
    //   **「读得到」被当成了「写得进去」的证据**。真实的坏法就是**配额满**：
    //   `setItem` 抛 ⇒ 记 `write`；孩子刷新页面 ⇒ 读档，盘上那份**旧的**存档读得到
    //   ⇒ 降级被抹 ⇒ **面板对家长说「存档正常」，而孩子此后每一次落盘都在丢进度。**
    //   ⇒ 1.15 已把它改成「一次成功**只清自己那侧**」（守卫 G222，变异 M259/M260）。
    //   ⇒ **本用例的意图不是「write 会被读抹掉」**（那已被判为缺陷），
    //     意图是「**底层**清掉降级项时面板要自己刷出来，没人 bump」。
    //   ⇒ 夹具换成 `parse`：字节坏了 → 一次 `readSave()` 登记 `parse`；
    //     再把**好字节**放回盘上 → 一次成功的读把它清掉。
    //     **清理路径仍然全程在底层**（没点任何按钮、没 bump），本意一个字未改。
    storage.data.set(SAVE_KEY, '不是 JSON')
    readSave()
    await nextTick()
    expect(panel.text(), '前置：这一行应当在').toContain('key=parse')

    storage.data.set(
      SAVE_KEY,
      JSON.stringify({
        schemaVersion: SAVE_SCHEMA_VERSION,
        savedAt: 1,
        progress: progress.value,
        currentGame: null,
      }),
    )
    readSave()
    await nextTick()

    expect(
      panel.text(),
      '底层已经清掉的降级项还挂在面板上 —— 这一次没有任何人 bump 过，' +
        '全靠 `noteDegradationsChanged()` 通知。面板说好了而实际也可能好了，' +
        '但反过来「说没好」会让家长反复去查一个已经修好的问题',
    ).toContain('没有降级项')
  })

  it('反向自测：没有订阅时这条判据会红（证明它不是恒绿）', async () => {
    // 判据自检：**「先挂载后降级」这一路在没接信号时必然红**。
    // 不做这个自测的话，判据有可能因为「模板压根没渲染这一段」而假绿。
    const panel = mount(DebugPanel)
    markAssetDegraded('/words/pear.svg', '词图加载失败')
    await nextTick()
    // 有订阅 ⇒ 刷出来了。
    expect(panel.text()).toContain('/words/pear.svg')
    // 退订之后再降级一次 ⇒ **不刷**，这正是没有信号时的形态。
    panel.unmount()
    markAssetDegraded('/words/plum.svg', '词图加载失败')
    expect(panel.exists()).toBe(false)
  })
})

// ── `[CR]` 2026-10-17 —— 面板必须**定位**在视口内，否则落不到屏幕里 ──────

describe('面板定位（`App.vue` 把它挂在模板末尾 ⇒ 不定位就会被推到屏幕外）', () => {
  // ⚠️ 判据**读源码里的 CSS**而不是量 jsdom 的 `getComputedStyle`：
  //   jsdom 不做布局也不做层叠，那条路只会给出一个看起来绿、其实什么都没验的结果。
  const css = panelSource()

  /** `.debug-panel { … }` 这一块的声明体（只看根，子元素上的 position 一律无关）。 */
  function rootBlock(): string {
    const block = /\.debug-panel\s*\{([^}]*)\}/.exec(css)?.[1]
    expect(block, '`.debug-panel` 这一块找不到了 —— 判据已失明').toBeDefined()
    return block ?? ''
  }

  it('面板是 `position: fixed` 且带 `z-index`（脱离文档流，且压得住游戏画面）', () => {
    const block = rootBlock()
    expect(block, '面板不在流内 ⇒ 它是应用根的最后一个块级元素，竖屏下被推到游戏视图下方').toMatch(
      /position:\s*fixed/,
    )
    // ⚠️ `z-index` 对**非定位元素无效** ⇒ 只写 `position` 不写 `z-index` 等于白写。
    expect(block, '没有 z-index —— 面板与战场谁压谁退回由 DOM 顺序决定').toMatch(/z-index:\s*\d+/)
  })

  it('贴的是右上角（不贴左上：左上会盖住标题与生命条）', () => {
    const block = rootBlock()
    expect(block).toMatch(/inset-block-start:\s*0/)
    expect(block).toMatch(/inset-inline-end:\s*0/)
    expect(
      block,
      '贴了左边缘 —— 会压住孩子真正要看的画面（NFR13 在这一层仍然成立）',
    ).not.toMatch(/inset-inline-start:\s*0/)
  })

  // ⚠️ 这条守的是**补救入口的可见性**：面板有五段（读数 / 开关 / 降级 / 跳回合 / 导出），
  //   小屏竖屏下内容比视口高。没有滚动条的话，最需要按到的「重试写入」与
  //   「导出会话」正好落在屏幕外 —— 而那正是家长来这个面板的唯一目的。
  it('有 `max-height` + `overflow-y: auto`（内容比视口高时能滚到那两个补救入口）', () => {
    const block = rootBlock()
    expect(block, '没有 max-height —— 五段内容在小屏竖屏下直接溢出屏幕外').toMatch(/max-height:\s*100/)
    expect(block, '没有滚动 —— 溢出的部分够不着').toMatch(/overflow-y:\s*auto/)
  })

  it('反向自测：一份「流内定位」的探针会被判为不合规', () => {
    // 判据自检：四份探针，只有第一份合规 ——
    // 后三份逐条对应评审记录的那个真实形态（没有 position / 缺 z-index / 贴左边）。
    const judged = (block: string): boolean =>
      /position:\s*fixed/.test(block) &&
      /z-index:\s*\d+/.test(block) &&
      /inset-inline-end:\s*0/.test(block) &&
      !/inset-inline-start:\s*0/.test(block)

    expect(judged('position: fixed; z-index: 10; inset-block-start: 0; inset-inline-end: 0;')).toBe(true)
    expect(judged('background: red; padding: 16px;'), '判据自检：流内定位没被判违规').toBe(false)
    expect(judged('position: fixed; inset-inline-end: 0;'), '判据自检：缺 z-index 没被判违规').toBe(
      false,
    )
    expect(
      judged('position: fixed; z-index: 10; inset-inline-start: 0;'),
      '判据自检：贴左边的探针没被判违规',
    ).toBe(false)
  })
})
