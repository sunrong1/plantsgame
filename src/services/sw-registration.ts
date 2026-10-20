/**
 * Service Worker 的**注册与状态观察**（Story 1.18 / AC-B5、AC-B6、AC-C1、AC-C2、C3）。
 *
 * ── 为什么手写注册而不用 `virtual:pwa-register` ───────────────────────────
 * 那个虚拟模块是 `vite-plugin-pwa` 提供的包装器，它在 vitest 里**无法 import**
 * （没有对应的真实文件），而本项目的守卫要求「跨模块接线必须单独有判据」
 * （AC-G7）。手写注册换来三件事：
 * ① 注册失败 / 非安全上下文 / 浏览器不支持，三条路径都能在 jsdom 里**真的跑一遍**；
 * ② 状态机（有没有新版本）是一个普通的回调订阅，组件侧可以直接测；
 * ③ **产物里零 `updateServiceWorker()`** —— AC-C2 要的「不得强制刷新」由
 *    「压根不存在那条调用路径」保证，而不是靠一条断言去盯它。
 *
 * ── 🔥 归类：运行时层（裁决 7）──────────────────────────────────────────────
 * 架构的三层错误策略逐字把「运行时（TTS / 图片 / 音频）」定为
 * 「记录并静默降级，绝不阻断回合」。SW 注册失败落在这一层：
 * **本文件零 `throw`、零 `view` 切换、零面向孩子的错误文案**。
 * NFR13 逐字：「孩子面前永不出现技术错误 —— 6 岁半看到报错即为死局」。
 *
 * ⚠️ **静默 ≠ 不可见**：每条降级路径都记一条 `console.warn('[sw] …')`。
 *   吞掉不记的话，失败会在真机上完全不可归因 —— 那比白屏更难查。
 */

/** 应用对外呈现的三种「离线准备」状态。 */
export type ServiceWorkerUiState =
  /**
   * 还没注册、已注册且当前页面已被接管、**或离线准备已完成**（SW 已 `activated`）——
   * 且没有待生效的新版本。
   *
   * ⚠️📎 `[CR]` 2026-10-20 扩了含义：原来只有「没注册 / 已被接管」，
   *   而「装好了但当前页还没被接管」这个窗口会落在 `preparing` 上**永远不消失**。
   */
  | { kind: 'idle' }
  /**
   * 离线能力**正在准备**（SW 还在安装）—— 装完（`activated`）即转 `idle`。
   *
   * ⚠️ 离线能力本身要等**下次启动**才生效（首次安装的正常形态，刻意不调
   *   `clients.claim()` —— AC-C2）。但「准备中」这个**状态**不该永远挂着。
   */
  | { kind: 'preparing' }
  /** 有新版本装好了、停在 `waiting` —— 关掉应用再开才是新版本。 */
  | { kind: 'update-ready' }
  /** 非安全上下文或浏览器不支持 —— 游戏照常玩，只是没有离线能力。 */
  | { kind: 'unsupported' }

type Listener = (state: ServiceWorkerUiState) => void

const listeners = new Set<Listener>()
let current: ServiceWorkerUiState = { kind: 'idle' }

/**
 * 向所有订阅者广播新状态。
 *
 * ⚠️📎 `[CR]` 2026-10-20：**逐个 try/catch** ——
 *   原来逐字是 `for (const listener of listeners) listener(next)`（裸调）⇒
 *   **一个坏订阅者就中断整条广播** ⇒ 其余组件**永远收不到状态更新**。
 *   ⚠️ 而**同形态**的 `pronunciation-status.ts` 逐字逐个 `try { … } catch { … }`
 *     —— 两个同款服务处理方式不一致，而**不一致的那一个**是坏的。
 *   ⇒ 现在两侧对称：坏订阅者被吞掉并记 WARN，**不被踢出 `Set`**
 *     （与 `pronunciation-status.ts` 同款判断：同一个订阅者下次还会被调用，
 *     踢掉它会让它的界面永远停在旧状态）。
 */
function publish(next: ServiceWorkerUiState): void {
  current = next
  for (const listener of listeners) {
    try {
      listener(next)
    } catch (err) {
      console.warn(
        `[sw] 状态订阅者抛错，已忽略：${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }
}

/**
 * **只**在当前状态是 `preparing` 时才改写它。
 *
 * ⚠️ **为什么要有这个门**：新版本提示（`update-ready`）是**要一直留着的** ——
 *   孩子/家长必须看到「有新版本，下次启动生效」并真的去重启。
 *   而「装完即完成」「被接管」这两条出路是在 `preparing` 之后发生的；
 *   若它们无条件广播 `idle`，就会把刚报出来的 `update-ready` **抹掉** ——
 *   症状是「提示闪一下就没了，家长以为没更新」。
 *   ⇒ 门在这里，不在各个调用点。
 */
function publishIfPreparing(next: ServiceWorkerUiState): void {
  if (current.kind !== 'preparing') return
  publish(next)
}

/** 当前状态（供不便订阅的场景读一次）。 */
export function currentServiceWorkerState(): ServiceWorkerUiState {
  return current
}

/**
 * 订阅状态变化。
 *
 * ⚠️ **订阅即刻收到当前值**（而不是等下一次变化）——
 *   组件在 mount 时拿到的必须是**当下的真实状态**，否则首次渲染会闪一下
 *   「什么都不显示」再突然冒出提示。
 *
 * @returns 退订函数（组件 `onBeforeUnmount` 里调）
 */
export function subscribeServiceWorkerState(listener: Listener): () => void {
  listeners.add(listener)
  // ⚠️📎 `[CR]` 2026-10-20：这次「立刻回放」也要有 try/catch（与 `publish` 侧对称）——
  //   否则一个在挂载路径上抛错的订阅者会让**组件挂不上**，
  //   而它**已经进了 `Set`** ⇒ 此后每次广播都再抛一次。
  try {
    listener(current)
  } catch (err) {
    console.warn(
      `[sw] 状态订阅者抛错，已忽略：${err instanceof Error ? err.message : String(err)}`,
    )
  }
  return () => {
    listeners.delete(listener)
  }
}

/** 浏览器有没有 Service Worker 这套 API。 */
function isSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator
}

/**
 * 当前是不是可以注册 SW 的**安全上下文**（AC-B6）。
 *
 * ⚠️ 非安全上下文（局域网里的 `http://192.168.x.x:4173`）**不注册**：
 *   `navigator.serviceWorker` 在那里根本不存在，注册只会抛错；
 *   而开发时用 IP 直连平板恰恰是这个形态 ⇒ 这条分支在开发里就会走到，
 *   不是理论上的边角。
 *
 * ⚠️ **`localhost` 单独放行**：规范把 `localhost` / `127.0.0.1` / `[::1]`
 *   定义为 potentially trustworthy，但部分实现（含 jsdom）的
 *   `window.isSecureContext` 在 http 下是 `false` ⇒ 只信它会把本地开发也判掉。
 */
export function isSecureContextForServiceWorker(): boolean {
  if (typeof window === 'undefined') return false
  if (window.isSecureContext === true) return true
  const host = window.location?.hostname ?? ''
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
}

/**
 * 观察一个注册：有新版本在 `waiting` 时广播 `update-ready`。
 *
 * ⚠️ **这里没有 `updateServiceWorker()`、没有 `location.reload()`**（AC-C2）。
 *   waiting 的语义就是「新版本已就位，等所有页面关掉后自动接管」。
 *
 * 🔥📎 **`[CR]` 2026-10-20：补上「准备完成」与「接管」两条出路** ——
 *   原来只广播 `preparing` / `update-ready` / `idle` 三种，
 *   而 **`preparing` 永不消失**：
 *   首次安装后**当前页面不会被接管**（刻意不调 `clients.claim()`，AC-C2）⇒
 *   `navigator.serviceWorker.controller` 恒为 `null` ⇒
 *   逐字 `publish(container.controller ? idle : preparing)` 每次都落在 `preparing`。
 *   ⇒ 孩子第一次打开游戏就**永久**顶着「正在准备离线，下次启动生效」那条条
 *     （实测它压住 HUD 顶部 16px —— 阳光数字、进度标签、心形都被削掉一截）。
 *   ⇒ 现在有三条出路：
 *     ① **装完即完成**：installing 的 `state` 推进到 `activated` ⇒ 准备完成 ⇒ `idle`；
 *     ② **被接管**：容器派发 `controllerchange`（下一次导航后本页被接管）⇒ `idle`；
 *     ③ **装失败**：`state` 变成 `redundant`（安装被放弃）⇒ `unsupported`（离线确实不可用）。
 *   ⚠️ **`update-ready` 不被这三条覆盖**：只有当前状态是 `preparing` 时才允许改写它 ——
 *     否则「装完即完成」会把刚报出来的「有新版本」抹掉。
 */
function watchRegistration(registration: ServiceWorkerRegistration): void {
  const container = navigator.serviceWorker

  // 没有 controller 就说明**当前这页还没被接管**：首次安装、或者上一代还没退出。
  // 这两种情况都归成「下次启动生效」，文案上由组件区分。
  publish(container.controller ? { kind: 'idle' } : { kind: 'preparing' })

  if (registration.waiting) publish({ kind: 'update-ready' })

  // ⚠️ **已经在跑的 SW**（本次注册之前就装好了）⇒ 准备早已完成 ⇒ `idle`。
  //   这条修的是「第二次打开应用时 `preparing` 又冒出来」的形态：
  //   此时 `controller` 通常非空（第一次启动后本页已被接管）⇒ 上一行已经给了 `idle`；
  //   但「装好了却还没被接管」的窗口里（例如刚装完就刷新），`controller` 仍为 `null`
  //   ⇒ 上一行会给 `preparing` ⇒ 而实际上它**已经装好了**。
  if (registration.active && !registration.waiting) publish({ kind: 'idle' })

  registration.addEventListener('updatefound', () => {
    const installing = registration.installing
    if (!installing) return
    installing.addEventListener('statechange', () => {
      // ⚠️ `controller` 非空 ⇒ 这是**更新**而不是首次安装。
      //   首次安装时 controller 必然为空，而那条路径归 `preparing`，
      //   不该对着刚装好的第一版提示「有新版本」（那是假话）。
      if (installing.state === 'installed' && container.controller) {
        publish({ kind: 'update-ready' })
        return
      }
      // 🔥 装完（`activated`）⇒ 离线能力已就位（下次启动生效）⇒ 准备完成。
      if (installing.state === 'activated') {
        publishIfPreparing({ kind: 'idle' })
        return
      }
      // ⚠️ `redundant` = 安装被放弃（装失败或被更新的安装顶掉）⇒ 离线确实不可用。
      if (installing.state === 'redundant') {
        publishIfPreparing({ kind: 'unsupported' })
      }
    })
  })

  // ⚠️ **被接管**（`controllerchange`）：本页的控制权换人了 ⇒ 当前状态不再是「准备中」。
  //   ⚠️ 浏览器 API 的类型上 `addEventListener` 一定在，但**测试用的假容器**未必有 ——
  //   ⇒ 用 `typeof` 判一次，缺了也不该炸（静默降级，裁决 7）。
  if (typeof container.addEventListener === 'function') {
    container.addEventListener('controllerchange', () => {
      publishIfPreparing({ kind: 'idle' })
    })
  }
}

/**
 * 注册 Service Worker —— **永不抛错、永不阻断启动**（AC-B5、AC-B6、裁决 7）。
 *
 * ⚠️ 由 `src/main.ts` 在 `mount()` 之后调用，**不 await**：
 *   注册是一次网络往返，挂在启动关键路径上就是一次冷启动停顿。
 */
export function registerServiceWorker(): void {
  if (!isSupported()) {
    console.warn('[sw] 这个浏览器没有 Service Worker，离线能力不可用 —— 游戏照常继续')
    publish({ kind: 'unsupported' })
    return
  }

  if (!isSecureContextForServiceWorker()) {
    console.warn(
      '[sw] 非安全上下文（既不是 https 也不是 localhost），不注册 Service Worker —— ' +
        '离线能力不可用，游戏照常继续',
    )
    publish({ kind: 'unsupported' })
    return
  }

  try {
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL,
        // ⚠️ **必须显式写 `'none'`**：默认是 `'imports'`，浏览器会用 HTTP 缓存里的
        //   `sw.js` 做字节比对 ⇒ 部署了新版本却因为 HTTP 缓存**永远察觉不到更新**，
        //   而症状是「孩子说游戏没变」—— 没有任何报错。
        updateViaCache: 'none',
      })
      .then(watchRegistration)
      .catch((error: unknown) => {
        console.warn('[sw] 注册失败，静默继续：', error)
        publish({ kind: 'unsupported' })
      })
  } catch (error) {
    // 同步抛出的形态（极老浏览器在 getter 上就炸）同样走静默降级。
    console.warn('[sw] 注册时同步抛错，静默继续：', error)
    publish({ kind: 'unsupported' })
  }
}
