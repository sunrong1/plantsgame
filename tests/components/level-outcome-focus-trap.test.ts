/**
 * @vitest-environment jsdom
 */

/**
 * 终态浮层的**焦点陷阱**守卫（DF-122；守卫 **G322**）。
 *
 * ── 这个文件守什么 ────────────────────────────────────────────────────────
 *   ① 浮层开着的时候，连按 N 次 Tab / Shift+Tab，**焦点仍在浮层内**；
 *   ② 每一次 Tab 都被 `preventDefault()` —— 浏览器的**原生** Tab 不参与；
 *   ③ 焦点已经跑到浮层外（例如点了浮层的空白底板）时，下一次 Tab 把它**拉回**浮层；
 *   ④ 浮层关掉之后**不再劫持** Tab（否则整个应用的键盘导航都被这个浮层劫走）。
 *
 * ── 为什么 DF-122 那条警告在 jsdom 里**也**能成立 ──────────────────────────
 *   DF-122 逐字：「这条**必须用真实 DOM 事件**测，jsdom 的 `.focus()` 不产生
 *   Tab 默认行为 —— 按 R-56，别用 jsdom 假绿。」
 *
 *   ⚠️ 那条警告成立的前提是「陷阱靠浏览器原生 Tab 顺序工作」——
 *     **本实现不是这样**：落点由组件**自己算**（`focusablesInDialog()`），
 *     并且**自己**调 `preventDefault()` 把原生 Tab 整个屏蔽掉。
 *   ⇒ 原生 Tab 顺序**从来不参与** ⇒ jsdom 没有原生 Tab 这件事**不影响**本判据。
 *
 *   ⚠️⚠️ **但正因为如此，判据必须同时断言 `defaultPrevented`**：
 *   若只断言「焦点还在浮层里」，那么**一个完全没有陷阱的组件也会绿** ——
 *   因为 jsdom 的 Tab **根本不会移动焦点**，焦点会一直留在按钮上。
 *   ⇒ 「焦点仍在浮层内」是**语义半**，「原生 Tab 被阻止」是**机制半**，
 *     两条缺一不可；缺了机制半，本文件整组用例就是装饰。
 *   ⇒ 这也是本文件与 DF-122 逐字要求（「必须用真实 DOM 事件」）的对应关系：
 *     这里派发的是**真的 `KeyboardEvent`**（`key: 'Tab'`、`bubbles`、`cancelable`），
 *     走的是**真的事件传播**（目标元素 → 冒泡到 `document` 上的监听器），
 *     而不是直接调组件里的函数。
 *
 * ── 为什么监听挂在 `document` 上（组件侧的理由见 `LevelOutcome.vue` 的注释）──
 *   浮层自己收不到「焦点已经跑出去之后」的 Tab —— 那种事件不从浮层里冒泡。
 *   ⇒ 陷阱必须挂在 `document` 上，且**无论焦点当前在哪**都把落点算在浮层内。
 *
 * ── 期望值来源与出处 ──────────────────────────────────────────────────────
 * · 「浮层开着时焦点必须被关在里面」：`deferred-work.md` 的 **DF-122** 恢复条件
 *   逐字「加一条守卫断言『浮层打开后连按 N 次 Tab，焦点仍在浮层内的可聚焦元素上』」。
 * · 「终态下浮层是唯一可交互面 ⇒ Esc 不能关它」：`level-outcome.test.ts` 的 AC-D5
 *   那组逐字断言「终态下全部可点元素加起来只有浮层那一个按钮」。
 */

import { enableAutoUnmount, mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'

import { HEARTS } from '../../src/core'
import { state } from '../../src/app/store'
import LevelOutcome from '../../src/components/hud/LevelOutcome.vue'

enableAutoUnmount(afterEach)

/**
 * ⚠️⚠️ **必须 `attachTo` 到文档里 —— 不挂上去的话，本文件整组用例都是恒绿的。**
 *
 * `@vue/test-utils` v2 的 `mount()` **默认不把组件挂进文档**
 * （实测：源码 `vue-test-utils.cjs.js` 里只有 `options.attachTo` 存在时才
 * `to.appendChild(el)`）⇒ 挂出来的元素是**游离**的。
 * 而 jsdom 的 `HTMLElement.focus()` 只对**已在文档里**的元素生效
 * （实测：游离按钮 `.focus()` 之后 `document.activeElement` 纹丝不动）。
 *
 * ⇒ 这正是 **1.18 那条「焦点管理」此前零行为覆盖**的原因：
 *   守卫 G136 只在**源码层**断言「有 `.focus()`、有 `nextTick`」，
 *   而源码里写了不等于焦点真的进去了 —— 一条源码断言永远证明不了这件事。
 *   本文件把 `attachTo` 补上 ⇒ 「焦点真的进了浮层」第一次被**行为**验到。
 */
const containers: HTMLElement[] = []

afterEach(() => {
  for (const container of containers) container.remove()
  containers.length = 0
})

/**
 * 模块求值期的那份 state（与 `level-outcome.test.ts` 同款取法）——
 * 它天然是 `awaiting-answer`，正适合当「还没进终态」的起点。
 */
const PRISTINE = state.value

/** 把 store 推到某个终态。 */
function pushInto(kind: 'level-complete' | 'level-failed'): void {
  state.value = {
    ...PRISTINE,
    hearts: kind === 'level-failed' ? 0 : HEARTS,
    turn: 12,
    phase: { kind },
  }
}

/**
 * 挂上浮层并让它**进入**终态。
 *
 * ⚠️ **顺序不能换**：先在**非终态**挂载，再推进相位 ——
 *   `LevelOutcome.vue` 的焦点管理挂在 `watch(terminal, …)` 上（`flush: 'post'`），
 *   而 `watch` **默认不监听初始值** ⇒ 一上来就在终态挂载，那次 watch 根本不会跑，
 *   焦点也就不会被移进浮层。真实运行时的顺序正是这样（进关时挂载，终态后来才到）。
 */
async function openTerminalOverlay(kind: 'level-complete' | 'level-failed' = 'level-complete') {
  state.value = PRISTINE
  const container = document.createElement('div')
  document.body.appendChild(container)
  containers.push(container)
  const wrapper = mount(LevelOutcome, { attachTo: container })
  await nextTick()

  pushInto(kind)
  // 第一次：DOM 更新 + post 阶段的 watcher 跑完（它在里面排了第二个 nextTick）。
  await nextTick()
  // 第二次：watcher 里那个 `nextTick(() => button.focus())` 跑完。
  await nextTick()
  return wrapper
}

/** 浮层元素（守卫的对象集合）。 */
function overlayOf(wrapper: VueWrapper): HTMLElement {
  const overlay = wrapper.find('[data-testid="level-outcome"]').element
  if (!(overlay instanceof HTMLElement)) throw new Error('终态浮层没渲染出来 —— 夹具失效')
  return overlay
}

/** 人可读的「焦点现在在哪」。 */
function describeFocus(): string {
  const active = document.activeElement
  if (active === null) return 'null'
  if (active === document.body) return 'body'
  const id = active.id ? `#${active.id}` : ''
  const cls = active.className ? `.${String(active.className).split(/\s+/).join('.')}` : ''
  return `${active.tagName.toLowerCase()}${id}${cls}`
}

/**
 * 焦点陷阱的**判据本体**（纯函数：吃一个挂好的浮层，吐违规清单）。
 *
 * ⚠️ 每次按 Tab 都派发**真的 `KeyboardEvent`**，目标是**当前焦点所在的那个元素**
 *   （真浏览器里 keydown 的目标就是焦点元素）⇒ 事件从那里**冒泡**到
 *   `document` 上组件装的监听器 —— 走的是真的事件传播路径。
 */
function focusTrapViolations(
  wrapper: VueWrapper,
  options: { times?: number; shift?: boolean; target?: EventTarget } = {},
): string[] {
  const times = options.times ?? 5
  const shift = options.shift ?? false
  const overlay = overlayOf(wrapper)
  const problems: string[] = []

  for (let i = 0; i < times; i += 1) {
    const target = options.target ?? document.activeElement ?? document.body
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: shift,
      bubbles: true,
      cancelable: true,
    })
    target.dispatchEvent(event)

    // ── 机制半：原生 Tab 必须被屏蔽 ────────────────────────────────────────
    if (!event.defaultPrevented) {
      problems.push(
        `第 ${i + 1} 次 Tab 没有被 preventDefault() —— 浏览器的原生 Tab 会把焦点移出浮层` +
          '（在 jsdom 里原生 Tab 不动焦点，所以**只**看「焦点还在不在浮层内」会漏掉这一条）',
      )
    }
    // ── 语义半：焦点必须仍在浮层内 ──────────────────────────────────────────
    if (!overlay.contains(document.activeElement)) {
      problems.push(`第 ${i + 1} 次 Tab 之后焦点跑到了浮层外（${describeFocus()}）`)
    }
  }
  return problems
}

describe('G322 —— 终态浮层的焦点陷阱：Tab 跑不出浮层（DF-122）', () => {
  it('前置：浮层打开后，焦点确实被移进了浮层的按钮里', async () => {
    const wrapper = await openTerminalOverlay()
    const overlay = overlayOf(wrapper)

    expect(
      overlay.contains(document.activeElement),
      `浮层打开后焦点没有落进浮层（现在在 ${describeFocus()}）—— ` +
        '焦点陷阱的前提是「焦点本来就在里面」，这条不成立时下面几条全是恒绿',
    ).toBe(true)
  })

  it('连按 5 次 Tab，焦点仍在浮层内（且每一次都阻止了原生 Tab）', async () => {
    const wrapper = await openTerminalOverlay()

    expect(
      focusTrapViolations(wrapper, { times: 5 }),
      'Tab 把焦点带出了终态浮层 —— 键盘用户会聚焦到浮层**背后**的战场格子上，' +
        '而那些格子孩子看不见自己「按」到了哪里（读屏则继续读背后的战场与手牌）',
    ).toEqual([])
  })

  it('连按 5 次 Shift+Tab，焦点仍在浮层内（反向也出不去）', async () => {
    const wrapper = await openTerminalOverlay()

    expect(
      focusTrapViolations(wrapper, { times: 5, shift: true }),
      'Shift+Tab 把焦点带出了终态浮层 —— 反向同样必须被关住',
    ).toEqual([])
  })

  it('焦点已经在浮层外时，下一次 Tab 把它拉回浮层（点空白底板之后的那一步）', async () => {
    const wrapper = await openTerminalOverlay()
    const overlay = overlayOf(wrapper)

    // ⚠️ 造一个「浮层背后」的可聚焦元素并把焦点放上去 ——
    //   真实浏览器里点浮层的空白底板（非可聚焦元素）就是这个效果：
    //   焦点被打散，`activeElement` 变成 body 或背后的按钮。
    const behind = document.createElement('button')
    behind.className = 'behind-the-overlay'
    document.body.appendChild(behind)
    behind.focus()
    expect(
      overlay.contains(document.activeElement),
      '夹具失效：焦点没能被放到浮层外面去',
    ).toBe(false)

    try {
      const problems = focusTrapViolations(wrapper, { times: 1 })
      expect(
        problems,
        '焦点在浮层外时按 Tab，焦点没有被拉回浮层 —— ' +
          '那种情况下浏览器原生 Tab 会把焦点送到文档里第一个可聚焦元素上（多半在浮层背后）',
      ).toEqual([])
    } finally {
      behind.remove()
    }
  })

  it('浮层关掉之后不再劫持 Tab（否则整个应用的键盘导航都被它吃掉）', async () => {
    // ⚠️ 这里不需要 wrapper —— 组件只要还挂载着，监听器的摘除就由相位驱动。
    await openTerminalOverlay()

    // 关掉浮层：相位回到非终态 ⇒ 组件移除监听器。
    state.value = PRISTINE
    await nextTick()
    await nextTick()

    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    ;(document.activeElement ?? document.body).dispatchEvent(event)

    expect(
      event.defaultPrevented,
      '浮层已经关掉，Tab 却仍被 preventDefault —— 监听器没被摘掉，' +
        '关掉浮层之后整个应用的 Tab 导航都会被这个看不见的笼子劫走',
    ).toBe(false)
  })

  it('判据自检：**没有陷阱**时判据必须报出漂移（证明它不是恒绿）', async () => {
    // ⚠️ **自检要证明判据真的在看「陷阱在不在」**：
    //   这里把 keydown 派发到一个**不在文档里**的元素上 ⇒ 事件到不了
    //   `document` 上组件装的监听器 ⇒ 相当于「这个浮层没有陷阱」。
    //   判据此时必须报出漂移（机制半：原生 Tab 没被阻止；
    //   语义半：焦点不在浮层内）。
    //   若它报不出来，说明判据对「陷阱在不在」毫无反应 ⇒ 整组用例是装饰。
    const wrapper = await openTerminalOverlay()
    const overlay = overlayOf(wrapper)

    const detached = document.createElement('button')
    // ⚠️ 刻意**不** append 到文档：离线的元素收不到 `document` 上的监听器。
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    detached.dispatchEvent(event)

    expect(
      event.defaultPrevented,
      '判据自检：派发到游离元素上的 Tab 不该被 preventDefault（它到不了 document 上的监听器）',
    ).toBe(false)
    expect(
      overlay.contains(document.activeElement),
      '判据自检：此刻焦点仍在浮层内的按钮上（浮层自己的陷阱还在生效）',
    ).toBe(true)

    // 判据本体在「同样的事件、但没有陷阱接得住」时必须报出漂移。
    const problems = focusTrapViolations(wrapper, { times: 1, target: detached })
    expect(
      problems.length,
      '判据自检：事件没被陷阱接住时判据一条都没报 —— 它要么恒绿，要么只看其中一半',
    ).toBeGreaterThan(0)
  })
})
