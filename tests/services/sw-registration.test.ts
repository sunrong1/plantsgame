/**
 * @vitest-environment jsdom
 */
/**
 * Service Worker 注册的运行时行为（Story 1.18 / AC-B5、AC-B6、AC-C1、AC-C2、裁决 7）。
 *
 * ── 为什么这些判据必须是**行为级**的 ──────────────────────────────────────
 * 「非安全上下文不注册」「注册失败静默降级」「waiting 时提示下次启动」
 * 这三条如果只写成源码正则，就会有一种恒绿写法：判据说「不抛错」，
 * 而代码其实在 `catch` 里 `throw` 了别的什么；或者判据说「不注册」，
 * 而代码其实注册了只是记了个 WARN。
 * ⇒ 这里在 jsdom 里**真的把 `navigator.serviceWorker` 换掉**、真的调一次注册函数、
 *   然后断言「`register` 有没有被调用」与「最终状态是什么」。
 *
 * ⚠️ **docblock 必须是 `/** @vitest-environment jsdom *​/` 而不是 `//`**（AC-G5 / R-60）：
 *   写成行注释会静默失效、测试跑在 node 环境 —— 那时 `navigator` 根本不存在，
 *   而报错信息会指向别处，看起来像「工具链坏了」而不是「环境写错了」。
 *
 * ── 每个用例都 `vi.resetModules()` 后**动态 import** ──────────────────────
 * `sw-registration.ts` 的状态（订阅者集合、当前状态）是**模块级**的。
 * 不重置模块的话第二个用例读到的会是第一个用例留下的状态，
 * 于是「状态有没有变对」这件事根本测不到 —— 这是本仓库记过的假绿形态之一。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface FakeRegistration {
  waiting: null | object
  installing: null | { state: string; addEventListener: (type: string, fn: () => void) => void }
  addEventListener: (type: string, fn: () => void) => void
  /** 浏览器发现了一个新 SW 并开始安装 —— 触发 `updatefound`。 */
  fireUpdateFound: () => void
  /** 把 installing 推到 installed 并广播 `statechange`。 */
  finishInstall: () => void
}

interface FakeContainer {
  controller: null | object
  register: ReturnType<typeof vi.fn>
}

let container: FakeContainer
let registration: FakeRegistration
/** `statechange` 监听器池 —— 由 `startInstalling()` 填，由 `finishInstall()` 触发。 */
let stateListeners: Array<() => void>

/** 把 `navigator.serviceWorker` 装上一个可控的假实现。 */
function installFakeContainer(): void {
  Object.defineProperty(window.navigator, 'serviceWorker', {
    configurable: true,
    value: container,
  })
}

/**
 * 造一个 registration 假实现：支持 `updatefound` 与 `statechange` 两级事件。
 *
 * ⚠️ **`fireUpdateFound` 与 `finishInstall` 必须分开两次调**：
 *   真实的浏览器流程是「浏览器派发 updatefound（此时 `registration.installing`
 *   才被填上）→ 之后 SW 状态推进 → 派发 statechange」。
 *   把两件事合成一次的话，被测代码里「updatefound 回调里读 `registration.installing`」
 *   这一步就永远读不到东西 —— 那正是上一版实测报 `['idle','idle']` 的原因。
 */
function makeRegistration(): FakeRegistration {
  const updateFoundListeners: Array<() => void> = []
  stateListeners = []
  return {
    waiting: null,
    installing: null,
    addEventListener: (type, fn) => {
      if (type === 'updatefound') updateFoundListeners.push(fn)
    },
    fireUpdateFound: () => {
      for (const fn of updateFoundListeners) fn()
    },
    finishInstall: () => {
      if (registration.installing) registration.installing.state = 'installed'
      for (const fn of stateListeners) fn()
    },
  }
}

/** 让 `registration.installing` 处于 installing 状态（updatefound 之后浏览器才填上它）。 */
function startInstalling(): void {
  stateListeners = []
  registration.installing = {
    state: 'installing',
    addEventListener: (type, fn) => {
      if (type === 'statechange') stateListeners.push(fn)
    },
  }
}

/** 动态 import 一份干净的模块（每个用例独立的状态与订阅者集合）。 */
async function freshModule(): Promise<typeof import('../../src/services/sw-registration')> {
  vi.resetModules()
  return import('../../src/services/sw-registration')
}

beforeEach(() => {
  registration = makeRegistration()
  container = {
    controller: null,
    register: vi.fn().mockResolvedValue(registration),
  }
  // ⚠️ **默认按安全上下文摆布**，需要不安全的那几条用例自己改。
  //   jsdom 的 `isSecureContext` 在 http 下是 false（实测），而 `localhost`
  //   由 `isSecureContextForServiceWorker()` 的 host 白名单单独放行。
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ── G130 —— 安全上下文判定与静默降级（AC-B6、裁决 7）──────────────────────

describe('G130 —— SW 注册的安全上下文与静默降级（Story 1.18 / AC-B6、裁决 7）', () => {
  it('https 下正常注册，URL 与 scope 都带 BASE_URL', async () => {
    installFakeContainer()
    const mod = await freshModule()

    mod.registerServiceWorker()
    await Promise.resolve()

    expect(
      container.register,
      '安全上下文里没有调用 navigator.serviceWorker.register —— SW 写了却没人注册，' +
        '离线能力整个不生效而构建与测试全绿',
    ).toHaveBeenCalledTimes(1)
    expect(
      container.register.mock.calls[0]?.[0],
      '注册 URL 没有接 BASE_URL —— 部署到 /plantsgame/ 下时 SW 文件根本不在那个路径',
    ).toBe(`${import.meta.env.BASE_URL}sw.js`)
    expect(
      container.register.mock.calls[0]?.[1],
      "没有显式写 updateViaCache: 'none' —— 默认 'imports' 会让浏览器用 HTTP 缓存里的 sw.js " +
        '做比对，部署了新版本却永远察觉不到更新',
    ).toMatchObject({ scope: import.meta.env.BASE_URL, updateViaCache: 'none' })
  })

  it('localhost 即使 isSecureContext 为 false 也放行', async () => {
    // ⚠️ 本文件的 jsdom 默认 URL 就是 `http://localhost:3000/`。
    //   局域网 IP 那条在 `sw-insecure-context.test.ts` 里（那里用
    //   `@vitest-environment-options` 换 URL —— 实测在同一文件里
    //   `history.replaceState` 到跨源 URL 会抛 `SecurityError`）。
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false })
    const mod = await freshModule()

    expect(
      mod.isSecureContextForServiceWorker(),
      'localhost 被判成了非安全上下文 —— 规范把 localhost 定义为 potentially trustworthy，' +
        '只信 isSecureContext 会把本地开发整个判掉',
    ).toBe(true)
  })

  it('注册 promise 失败时静默降级：不抛、状态转 unsupported', async () => {
    installFakeContainer()
    container.register = vi.fn().mockRejectedValue(new Error('boom'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mod = await freshModule()

    const states: string[] = []
    mod.subscribeServiceWorkerState((s) => states.push(s.kind))

    expect(() => {
      mod.registerServiceWorker()
    }).not.toThrow()
    await Promise.resolve()
    await Promise.resolve()

    expect(
      states,
      '注册失败后没有把状态转成 unsupported —— 界面会一直停在「正在准备离线」，' +
        '而离线能力永远不会有',
    ).toContain('unsupported')
    expect(
      warn.mock.calls.some((call) => String(call[0]).includes('[sw]')),
      '注册失败没有留下日志 —— 这一条在真机上没有任何别的信号',
    ).toBe(true)
  })

  it('浏览器没有 serviceWorker 时也不抛，只降级', async () => {
    Object.defineProperty(window.navigator, 'serviceWorker', { configurable: true, value: undefined })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mod = await freshModule()

    expect(() => {
      mod.registerServiceWorker()
    }).not.toThrow()
    expect(
      warn.mock.calls.some((call) => String(call[0]).includes('[sw]')),
      '「浏览器不支持」这条路径没有留痕',
    ).toBe(true)
  })
})

// ── G131 —— 更新提示的状态机（AC-C1、AC-C2）───────────────────────────────

describe('G131 —— 「下次启动生效」的状态机（Story 1.18 / AC-C1、AC-C2）', () => {
  it('首次安装（没有 controller）说的是「正在准备离线」，不是「有新版本」', async () => {
    installFakeContainer()
    container.controller = null
    const mod = await freshModule()
    const kinds: string[] = []
    mod.subscribeServiceWorkerState((s) => kinds.push(s.kind))

    mod.registerServiceWorker()
    await Promise.resolve()

    expect(
      kinds,
      '首次安装时没有进 preparing —— 那一版是「第一版」，不是「新版本」，' +
        '对它说「有新版本」是假话（AC-C1 的文案只属于 update-ready）',
    ).toContain('preparing')
    expect(kinds, '首次安装却提示了「有新版本」').not.toContain('update-ready')
  })

  it('已有 controller 且新 SW 装完时转 update-ready', async () => {
    container.controller = { id: 'old' }
    installFakeContainer()
    const mod = await freshModule()
    const kinds: string[] = []
    mod.subscribeServiceWorkerState((s) => kinds.push(s.kind))

    mod.registerServiceWorker()
    await Promise.resolve()

    // ⚠️ 三步顺序必须与真实浏览器一致，否则被测代码里
    //   「updatefound 回调里读 registration.installing」那一步读不到东西。
    startInstalling()
    registration.fireUpdateFound()
    registration.finishInstall()

    expect(
      kinds,
      '已有 controller + 新 SW 装完，没有转 update-ready —— 孩子永远不知道' +
        '「有新版本，下次启动生效」这句话该在什么时候出现',
    ).toContain('update-ready')
  })

  it('首次安装走到 installed 时**不**提示 update-ready（那是 preparing）', async () => {
    container.controller = null
    installFakeContainer()
    const mod = await freshModule()
    const kinds: string[] = []
    mod.subscribeServiceWorkerState((s) => kinds.push(s.kind))

    mod.registerServiceWorker()
    await Promise.resolve()

    startInstalling()
    registration.fireUpdateFound()
    registration.finishInstall()

    expect(
      kinds,
      '首次安装走到 installed 却提示了「有新版本」—— 那一刻根本没有旧版本，' +
        '这句话对着孩子是假的',
    ).not.toContain('update-ready')
  })

  it('已有 waiting 时立刻报 update-ready（打开应用时新版本已就位）', async () => {
    registration.waiting = { id: 'waiting' }
    container.controller = { id: 'old' }
    installFakeContainer()
    const mod = await freshModule()
    const kinds: string[] = []
    mod.subscribeServiceWorkerState((s) => kinds.push(s.kind))

    mod.registerServiceWorker()
    await Promise.resolve()

    expect(
      kinds,
      '注册时已经有一个 waiting 的 SW，却没有立刻提示 —— `updatefound` 只在**本次**' +
        '更新时触发，漏掉这条「开应用时新版本已经在等」的路径，提示就永远不出现',
    ).toContain('update-ready')
  })

  it('退订后不再收到广播（组件卸载必须退订，否则监听器泄漏）', async () => {
    installFakeContainer()
    const mod = await freshModule()
    let calls = 0
    const unsubscribe = mod.subscribeServiceWorkerState(() => {
      calls += 1
    })
    expect(calls, '订阅时没有立刻收到当前值 —— 组件首次渲染会闪一下空白').toBe(1)

    unsubscribe()
    container.register = vi.fn().mockRejectedValue(new Error('x'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    mod.registerServiceWorker()
    await Promise.resolve()
    await Promise.resolve()

    expect(calls, '退订之后还收到了广播 —— 模块级的监听器集合留了闭包，' +
      '每次挂载多留一份（Story 1.13 起的内存泄漏防线）').toBe(1)
  })
})
