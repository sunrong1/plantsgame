/**
 * @vitest-environment jsdom
 * @vitest-environment-options { "url": "http://192.168.1.23:4173/" }
 */
/**
 * 非安全上下文下的 SW 注册降级（Story 1.18 / AC-B6、裁决 7）。
 *
 * ── 为什么单独一个文件 ────────────────────────────────────────────────────
 * jsdom 的 `location` **不可重写**：实测在本文件里
 * `history.replaceState(null, '', 'http://192.168.1.23:4173/')` 会抛
 * `SecurityError: replaceState() cannot update history to the URL …` ——
 * 跨源 URL 在同文档里改不动。
 * ⇒ 改用 `@vitest-environment-options` 的 `url` 在**环境建起来时**就把
 * 文档 URL 设成局域网 IP 形态。而它必须是**块注释形式的 docblock**
 * （不是 `//` 行注释），否则被静默忽略、测试跑在 node 环境（R-60 / AC-G5）。
 *
 * ⚠️ 顺带一条实测坑：块注释里**不能出现字面的「星号 + 斜杠」**（即注释终止符）
 *   —— 哪怕是嵌在反引号里的示意写法，也会当场闭合外层注释，
 *   于是后面半段被当成代码解析，报的却是 `UNEXPECTED_TOKEN` 指向某一行注释，
 *   症状与「工具链坏了」一模一样。
 *
 * ── 这个形态为什么值得一条测试 ────────────────────────────────────────────
 * `vite.config.ts` 的 `server.host: true` + `allowedHosts: true` 是为
 * 「平板能访问开发服务器」开的（AC-1 逐字），而那条路径在浏览器里就是
 * `http://192.168.x.x:5173/` —— Service Worker 在那里**根本不存在**。
 * ⇒ 这不是理论边角，是本项目开发流程里每天都会走到的形态。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  // 显式置 false：判定应当**不依赖** jsdom 对 isSecureContext 的实现
  // （不同 jsdom 版本行为不同），而是靠 host 白名单之外的判定。
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('G132 —— 局域网 IP 下不注册 Service Worker（Story 1.18 / AC-B6）', () => {
  it('环境本身确实是非安全上下文 + 局域网 IP（否则下面两条都是空跑）', () => {
    // ⚠️ 这条是**夹具自检**：没有它，一个写错的 `@vitest-environment-options`
    //   （比如 JSON 语法不对而被静默忽略）会让本文件的两条断言恒绿，
    //   而症状是「守卫失明却没人发现」—— R-51 点名的形态。
    expect(window.location.hostname, '本文件的 jsdom URL 没设成局域网 IP —— 环境选项没生效').toBe('192.168.1.23')
    expect(window.isSecureContext, '本该是非安全上下文').toBe(false)
  })

  it('isSecureContextForServiceWorker() 返回 false', async () => {
    vi.resetModules()
    const mod = await import('../../src/services/sw-registration')
    expect(
      mod.isSecureContextForServiceWorker(),
      'http + 局域网 IP 被判成了安全上下文 —— 那条分支在开发里每天都会走，' +
        '注册必然抛「Service Worker 不可用」，而那条路径的降级是静默的',
    ).toBe(false)
  })

  it('不调用 register，只记一条 [sw] WARN，状态转 unsupported', async () => {
    const register = vi.fn()
    Object.defineProperty(window.navigator, 'serviceWorker', { configurable: true, value: { register } })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    vi.resetModules()
    const mod = await import('../../src/services/sw-registration')
    const kinds: string[] = []
    mod.subscribeServiceWorkerState((s) => kinds.push(s.kind))

    expect(() => {
      mod.registerServiceWorker()
    }).not.toThrow()
    await Promise.resolve()

    expect(
      register,
      '非安全上下文里仍然调用了 register —— 它必然抛错，' +
        '而那条路径的降级是静默的（孩子只看到「游戏没反应」）',
    ).not.toHaveBeenCalled()
    expect(kinds, '降级后没有把状态转成 unsupported —— 界面会一直停在「正在准备离线」').toContain('unsupported')
    expect(
      warn.mock.calls.some((call) => String(call[0]).includes('[sw]')),
      '降级没有留下 [sw] 前缀的日志 —— 真机上出问题将完全无法归因（静默 ≠ 不可见）',
    ).toBe(true)
  })
})
