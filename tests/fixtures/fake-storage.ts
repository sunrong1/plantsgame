/**
 * `localStorage` 的可编程 fake（Story 1.15 / AC-G3）。
 *
 * ── 为什么要自己造 ─────────────────────────────────────────────────────────
 * 全局测试环境是 `environment: 'node'`（`vitest.config.ts`，R-60 规定**不得**改成
 * jsdom），而 Node 22 **没有** `localStorage` 这个全局 —— 不 `stubGlobal` 就只有两条路：
 *   ① 把 `save.ts` 里的 `localStorage` 换成依赖注入 —— 那要让**生产代码**为测试改形，
 *      正是 R-37 说的「判据被改宽」同型；
 *   ② 每个测试文件各写一份 mini fake —— 那是 Story 1.9 的 P0（同一份东西抄多份，
 *      抄的那份先坏、真守卫后坏，全套仍绿）。
 * ⇒ 这里造**唯一一份**，1.15 与 1.17 的「重试写入」共用（R-37）。
 *
 * ── 形态照 `tests/services/audio.test.ts` 的 `FakeAudioContext` ─────────────
 * 同一个仓里同一类东西的同一个写法：`vi.stubGlobal` + `beforeEach` 里新建、
 * `afterEach` 里 `vi.unstubAllGlobals()`。
 *
 * ── 本 fake 必须能造的四种真实情况（缺一项，对应守卫就是假绿）───────────────
 * 1. **正常存取** —— 最常见的一条，不造它等于没测。
 * 2. **`setItem` 抛**（隐私模式 / 配额满 / Safari 无痕）⇒ 降级 `'write'`。
 * 3. **`getItem` 抛**（同上，但发生在读侧）⇒ 降级 `'read'`。
 *    ⚠️ 2 与 3 必须是**两个开关**：把它们合成一个「localStorage 不可用」会让
 *    「读失败被报成存失败」这类张冠李戴的假绿溜过去 ——
 *    `clearSave()` 曾把「删不掉」报成 `'read'`，正是靠**独立**的 `throwOnRemove`
 *    才暴露出来（见第 5 条）。
 * 4. **键里躺着一段非 JSON 字符串** ⇒ 降级 `'parse'`，且**原串不能被动过**。
 * 5. 📎 **`[CR]` 2026-10-21 补：`removeItem` 抛**（`throwOnRemove`）——
 *    没有它，第 4 种情况是缺的：`clearSave()` 的 catch **整段是死代码**，
 *    用例里构造不出来，于是「清不掉存档」被报成 `'read'` 这么久都没人发现。
 *    ⇒ 与上面同一条纪律：判据必须能在坏输入上被触发（R-50 第 ② 步）。
 *
 * ⚠️ **原注释写着「1.15 偏离 4 就是为它加的第 4 个键」—— 那是悬空引用**：
 *   1.15 偏离表第 4 条是「改动 1.14 的 `SAVE` 成员」，与降级键毫无关系。
 *   降级键的增补记在 `src/services/save.ts` 的 `SaveDegradationKey` 注释与
 *   `deferred-work.md`「`Deferred from: code review of story-1-15`」。
 *
 * ⚠️ **不做的事**（都是「看起来更真、实际让守卫失去鉴别力」的假增强）：
 *   · 不实现容量上限 —— 配额抛错由 `throwOnSet` 开关直接给，比模拟字节数可靠；
 *   · 不实现事件（`storage` 事件、`key`/`length` 迭代顺序）—— 本作是单页单存档，
 *     1.17 才会需要跨页同步，那时再加，且**加在真有断言用它之后**；
 *   · 不做自动 JSON 序列化 —— `save.ts` 自己 `JSON.stringify`，
 *     fake 若也序列化，测试就分不清「存的是对象」还是「存的是字符串」。
 */

import { afterEach, vi } from 'vitest'

/** 记一次调用，供「写了几次」「有没有删过键」这类断言读。 */
interface StorageCall {
  readonly op: 'get' | 'set' | 'remove' | 'clear'
  readonly key: string
}

/**
 * 一份 `Storage` 形态的 fake。
 *
 * ⚠️ **`getItem` 命中不存在时返回 `null` 而不是抛错** —— 这是真实
 * `localStorage` 的行为，`readSave()` 靠它区分「第一次玩」与「读失败」。
 * 把它实现成 `undefined` 会让 `raw === null` 判据恒假，于是「没有存档」被
 * 当成「存档坏了」—— 而那正是 AC 要求区分的两条路径。
 */
export class FakeStorage {
  /** 真实数据。**键是原始字符串** —— 里面可以是任意坏内容，供 `'parse'` 那条路径用。 */
  readonly data = new Map<string, string>()

  /** 全部调用记录，按发生顺序。 */
  readonly calls: StorageCall[] = []

  /** `setItem` 是否抛错（模拟隐私模式 / 配额满）。 */
  throwOnSet = false

  /** `getItem` 是否抛错。⚠️ 与 `throwOnSet` 分开，见文件头第 3 点。 */
  throwOnGet = false

  /**
   * 📎 `[CR]` 2026-10-21 补（Story 1.15 评审）：`removeItem` 是否抛错。
   *
   * ⚠️ **为什么必须独立成一个开关**：没有它，`save.ts` 的 `clearSave()` 那条
   *   catch 分支**在任何测试里都构造不出来** —— 它是**死代码 + 错标签**：
   *   分支里登记的降级键是 `'read'`，而 `'read'` 按 `SaveDegradationKey` 的
   *   注释逐字定义为「**根本读不到数据**」，与「删不掉」是两件事。
   *   错标签之所以能一直活着，正是因为**没有开关能走到那条路**。
   */
  throwOnRemove = false

  get length(): number {
    return this.data.size
  }

  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null
  }

  getItem(key: string): string | null {
    this.calls.push({ op: 'get', key })
    if (this.throwOnGet) {
      throw new Error('localStorage.getItem 被拒绝（隐私模式）')
    }
    return this.data.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.calls.push({ op: 'set', key })
    if (this.throwOnSet) {
      throw new Error('localStorage.setItem 配额已满')
    }
    this.data.set(key, value)
  }

  removeItem(key: string): void {
    this.calls.push({ op: 'remove', key })
    if (this.throwOnRemove) {
      throw new Error('localStorage.removeItem 被拒绝（隐私模式）')
    }
    this.data.delete(key)
  }

  clear(): void {
    this.calls.push({ op: 'clear', key: '' })
    this.data.clear()
  }
}

/** 本次测试文件用的那一份。由 {@link installFakeStorage} 建，测试里直接读它。 */
let installed: FakeStorage | null = null

/**
 * 装上 fake 并返回它。**在 `beforeEach` 里调用**，每次拿到的都是干净的一份。
 *
 * ```ts
 * let storage: FakeStorage
 * beforeEach(() => { storage = installFakeStorage() })
 * ```
 *
 * ⚠️ 用 `vi.stubGlobal` 而非给 `globalThis` 直接赋值 —— 前者能被
 *   `vi.unstubAllGlobals()` 一次性撤干净，后者会在测试之间漏给下一个文件。
 */
export function installFakeStorage(): FakeStorage {
  installed = new FakeStorage()
  vi.stubGlobal('localStorage', installed)
  return installed
}

/**
 * 撤掉 fake。
 *
 * ⚠️ **每个用到本 fixture 的文件都要在自己的 `afterEach` 里调它** ——
 *   `environment: 'node'` 下 `localStorage` 本来不存在，漏撤不会报错，
 *   只会让下一个测试文件拿到一份**带着上一个文件残留数据**的 fake，
 *   而且它照样全绿。
 */
export function uninstallFakeStorage(): void {
  vi.unstubAllGlobals()
  installed = null
}

/**
 * 上一次装上去的那一份（已卸载时抛错）。
 *
 * ⚠️ 供**跨文件共享的 helper** 用 —— `vi.stubGlobal` 装的是全局，
 *   模块里拿不到那个实例。这类 helper 若拿到 `null` 就静默构造不出期望，
 *   那是又一处假绿，所以这里**抛**。
 */
export function currentFakeStorage(): FakeStorage {
  if (installed === null) {
    throw new Error('还没有 installFakeStorage() —— 跨文件 helper 拿不到 fakeStorage 实例')
  }
  return installed
}

/**
 * 在 `afterEach` 里自动撤掉。**推荐**用它，胜过手写 `uninstallFakeStorage()` ——
 * 手写会漏，而漏了不报错。
 */
export function afterEachUninstall(): void {
  afterEach(() => {
    uninstallFakeStorage()
  })
}
