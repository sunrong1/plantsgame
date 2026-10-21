/**
 * Web Audio 会话 —— AudioContext 的持有者（Story 1.2）+ 音效 / BGM 播放器与降级（Story 1.14）。
 *
 * ⚠️ 本文件在音频解锁链路上，`unlockAudioSequence()` 那条路径**不允许出现任何 `await`**
 * （架构决策 4 / 硬约束 8），由 eslint 的 `no-restricted-syntax` 守卫（见 eslint.config.js）。
 *
 * ⚠️ 但 **BGM / SFX 的解码与播放允许 promise**，且它们**大量使用 `.then()`** ——
 *   `prewarmBgm()` 必须在解锁手势的**同步块内发起** fetch，解码在解锁之后完成。
 *   正确形态是「同步发起 promise + 挂 `.then`/`.catch`」，不是 `await`。
 *   ⇒ 所以「禁 await」在本文件成立，「禁 `.then()`」**不**成立 —— 那是 AC-G8
 *   的裁决点，也是为什么 `.then()` 逃逸守卫**只**加在 `app/audio-unlock.ts`（见那里）。
 *
 * ⚠️ `resume()` 是 Promise，但**发起调用必须同步**：`await ctx.resume()` 是本项目
 * 最容易被「写正确」惯犯带偏的一行。正确形态是「同步发起 + 拒绝时记日志」。
 *
 * 判据说明（Dev Notes §3.1）：「禁 await」在 Web Audio 侧并不是因为「await 之后会失败」
 * —— 门禁是 sticky activation，await 之后仍可成功。保留这条规则的理由是
 * ① 架构已定稿、story 的职责是执行不是重论证；② Web Audio 1.1 正在把
 * suspended → running 改为**异步**转移，同步读 ctx.state 会误判；
 * ③ 同步发起避开 pending 窗口，零代价的保守写法。
 */

import type { SfxCue } from '../core'

/** 模块级持有，刻意**不**导出一个新建好的实例（那会在模块求值时就建出 AudioContext）。 */
let audioCtx: AudioContext | null = null

/** 取底层 AudioContext —— SFX 与 BGM 的解码**必须**用它拿 context（AC-D2）。 */
export function getAudioContext(): AudioContext | null {
  return audioCtx
}

// ── 资源 URL（AC-D3）────────────────────────────────────────────────────────

/**
 * 音效资源目录。接 `import.meta.env.BASE_URL` 而不是写死根路径（照抄
 * `pronunciation.ts:157` 的 `RECORDING_BASE_PATH`）。
 *
 * ⚠️ `BASE_URL` **自带尾斜杠**，不要再拼一个（`pronunciation.ts:155` 逐字警告）。
 * ⚠️ 写死 `/assets/audio/sfx/` 在部署到 `/plantsgame/` 下会让每个音效 404，
 *   而开发期完全看不出来（`deferred-work.md` 记录的 404 事故）。守卫 **G65** 钉住。
 */
export const SFX_BASE_PATH = `${import.meta.env.BASE_URL}assets/audio/sfx/`

/** BGM 资源目录。同样接 `BASE_URL`（AC-D3 要求 sfx 与 music **同时**覆盖）。 */
export const MUSIC_BASE_PATH = `${import.meta.env.BASE_URL}assets/audio/music/`

// ── 解码缓存与失败标记（AC-D4、AC-D5）─────────────────────────────────────────

/** cue → 已解码的 `AudioBuffer`。同一资源只 `fetch` + 解码**一次**（AC-D4）。 */
const sfxBuffers = new Map<SfxCue, AudioBuffer>()

/**
 * cue → **正在进行的**加载（同一资源同一时刻只有一次 fetch）。
 *
 * ⚠️📎 **[CR] 2026-10-21 补**：原实现只有「已解码」缓存，解码窗口内的并发触发
 *   会**再发一次 fetch** ⇒ 同一个 mp3 下载两遍、解码两遍、两份回调各起播一次
 *   ⇒「建塔」音叠着响两次（AC-D4 的「不重新 fetch」在窗口内不成立）。
 */
const loadingSfx = new Map<SfxCue, Promise<void>>()

/**
 * 已确认失败（404 / 解码失败 / 非 2xx）的资源键 → **真实的失败原因**。
 * **失败即标记，不再重试**（AC-D5）。
 *
 * ⚠️📎 **[CR] 2026-10-21 补：为什么从 `Set` 变成 `Map`** ——
 *   原来失败原因只进了 `console.warn`，而 `audioDegradations()` 给每条 asset
 *   降级写死一句「音效加载或解码失败，已标记不再重试」⇒ 家长在平板上打开
 *   调试面板看到的是**一句废话**：是文件没部署？是解码器炸了？还是当时离线？
 *   面板答不出来，而唯一带真实原因的地方是家长在平板上看不到的 console。
 *   ⇒ AC-D8 的 `reason` 字段逐字要求「带原因」⇒ 这里把原因**存下来**。
 */
const failedSfx = new Map<SfxCue, string>()

/** BGM 的已解码 buffer；BGM 已失败标记（带真实原因，同 `failedSfx`）。 */
let bgmBuffer: AudioBuffer | null = null
let bgmFailedReason: string | null = null

/**
 * BGM **正在加载**（防止「反复点 5 次开始游戏」把同一个 39 秒 mp3 下载 5 遍）。
 *
 * ⚠️📎 **[CR] 2026-10-21 补**。
 */
let bgmLoading = false

/**
 * 「现在应该在播 BGM」这个**意图**的旗子。
 *
 * ⚠️📎 **[CR] 2026-10-21 补 —— 这一条是 BGM 曾经「永远不响」的全部原因**：
 *   `prewarmBgm()` 的解码是**异步**的，而 `enterLevel()` 在**同一个同步块**里
 *   就调了 `startBgmIfReady()` ⇒ 那一刻 `bgmBuffer` 还是 `null`，
 *   `startBgmIfReady()` 直接 return ⇒ 「进关了」这个事实**再没人用第二次**，
 *   而解码完成时又没有回调去起播 ⇒ **BGM 一次都没响过**，
 *   且零日志、零降级项（连「坏了」都不是，就是「没接上」）。
 *   ⇒ 现在「进关了」（`bgmRequested`）与「解码好了」（`prewarmBgm` 的回调）
 *   两个事实**必须会合**，会合点就是 `prewarmBgm` 的成功回调。
 */
let bgmRequested = false

/** 当前正在播的 BGM 源节点；重复调用 `startBgmIfReady` 时先停它（AC-D7）。 */
let bgmSource: AudioBufferSourceNode | null = null

// ── 降级标志（AC-D8）─────────────────────────────────────────────────────────

/**
 * 降级项的作用域。
 *
 * ⚠️ **`'session'` 与 `'asset'` 的语义绝不能混**（AC-D8）：
 *   `isAudioSilent()` **只**表示「AudioContext 整个不可用」（`session`）；
 *   **单个资源失败不算 silent** —— 那是 `scope: 'asset'`。
 *   混了的话，1.17 的调试面板会把「坏了一个音效」显示成「全设备无音频」。
 */
export type AudioDegradationScope = 'session' | 'asset'

/** 一条正在生效的降级项。`key` 形如 `'audioContext'` / `'sfx:answer-wrong'` / `'music:battle-loop'`。 */
export interface AudioDegradation {
  readonly scope: AudioDegradationScope
  readonly key: string
  readonly reason: string
}

/**
 * `AudioContext` **整个**不可用 —— **永久性**：浏览器没有它 / 构造抛错（AC-D8）。
 *
 * ⚠️ 只表示 session 级降级，**不**含单个资源失败（AC-D8）。
 */
let audioContextUnavailableReason: string | null = null

/**
 * 🔥 **暂时性**的会话不可用：`resume()` 被拒绝。
 *
 * ⚠️📎 **[CR] 2026-10-21 补：为什么必须与上面那条分开** ——
 *   原实现把 `resume()` 拒绝也写进 `audioContextUnavailableReason`，
 *   而那个标志**永不清除** ⇒ **一次偶发的 resume 拒绝就让整个会话永久静音**：
 *   `getPlayableContext()` 从此返回 null ⇒ 之后所有音效与 BGM 都是哑的，
 *   而 `isAudioSilent()` 永远是 true（1.17 的面板会显示「整台设备无音频」）。
 *   可 `resume()` 失败**不等于 context 不可用** —— 一次拒绝的常见原因是
 *   自动播放策略抖动或切后台，下一次手势里再 resume 一次通常就成功了。
 *   ⇒ 拒绝只登记**可恢复**的这一条；**一次成功的 resume 把它清掉**。
 */
let audioSessionSuspendedReason: string | null = null

/**
 * 降级状态的版本号 —— **只在降级标志变化时递增**（`[CR]` 2026-10-17 补）。
 *
 * 📎 **为什么需要它**：调试面板上那个 `computed` 读的是本模块的三个**普通变量**
 *   （`audioContextUnavailableReason` / `failedSfx` / `bgmFailed`），
 *   Vue 对它们**建不起任何响应式依赖** ⇒ 面板只在挂载时算一次，
 *   之后的音效 / BGM 失败再也刷不出来。
 * ⚠️ **刻意用纯数字而不是 `ref`**：`src/services/**` 与 `src/core/**` 今天
 *   **零 vue 依赖**（R-08 的依赖方向里没有 Vue 这一层，守卫会红）。
 */
let degradationsVersion = 0

/**
 * 变更监听者 —— **纯函数集合，零框架**（`[CR]` 2026-10-17 补）。
 *
 * ⚠️📎 **光有版本号推不动面板**：Vue 的 `computed` 只追踪**响应式量**的读取，
 *   把 `audioDegradationsVersion()` 读进 `computed` **建不起依赖** ——
 *   版本号变了它照样不重算。版本号回答「变没变」（可拉、可断言），
 *   监听者回答「什么时候变」（推给 Vue），**两个都要，缺一不可**。
 */
const degradationListeners = new Set<() => void>()

/** 订阅降级变化 —— 返回退订函数（照 `AbortSignal` 的形状，不留半截订阅）。 */
export function onAudioDegradationsChanged(cb: () => void): () => void {
  degradationListeners.add(cb)
  return () => degradationListeners.delete(cb)
}

/**
 * 「降级状态变了」—— **本模块唯一的变更入口**。
 *
 * ⚠️ **递增点选在这一个函数上，而不是三处标志赋值旁**：
 *   `markAssetFailed` 与 `markSessionUnavailable` 是三条写入路径
 *   （session / 某个 sfx / BGM）的**共同咽喉**。在标志旁逐处加会漏，
 *   而漏掉的那一处恰好是「面板不刷新」最难查的形态（R-37：登记只走记账）。
 * ⚠️ **版本号与通知写在同一个函数里**：两者回答同一个事实，
 *   分成两处调用点就多一次「加了一个忘了另一个」的机会，而那种不一致测不出来。
 */
function noteDegradationsChanged(): void {
  degradationsVersion += 1
  for (const cb of degradationListeners) {
    // ⚠️📎 **[CR] 2026-10-21 补：监听器抛错不许打断调用链** ——
    //   这条链上的调用方是「**绝不向调用方抛**」（AC-D9）的入口：
    //   `unlockAudioSession()`（抛出去就冒到解锁三步，第③步 `prewarmBgm()` 根本执行不到）
    //   与 `loadSfx()` 的加载回调（抛出去就 **`resolve()` 永不执行** ⇒
    //   那条 promise 永远 pending ⇒ 那个 cue 从此**永久哑掉**，
    //   而 `loadingSfx` 里还攥着这条永不 settle 的 promise ⇒ 后续每次触发都跟着它空转）。
    //   ⇒ 一个坏监听器（面板在卸载后还碰了 ref）就能让音效**永久失声**。
    try {
      cb()
    } catch (err) {
      console.warn(`[audio] 降级监听器抛错（已忽略，不打断音频链）：${describe(err)}`)
    }
  }
}

/** 降级状态的当前版本号（纯整数；配 {@link onAudioDegradationsChanged} 用）。 */
export function audioDegradationsVersion(): number {
  return degradationsVersion
}

/**
 * 是否全静（AudioContext 整个不可用）。
 *
 * ⚠️📎 **[CR] 2026-10-21 更正：这条注释原先写「**只**由 `audioContextUnavailableReason`
 *   决定」—— 那在本轮之前是对的，本轮把 `resume()` 拒绝拆到**可恢复**那条之后，
 *   注释没跟着改 ⇒ 一个信注释的人会把代码「改回」刚拆掉的那个永久静音行为
 *   （R-41：书面口径必须与代码一致）。
 *
 * **现在由两条 session 级标志决定**：
 *   · `audioContextUnavailableReason` —— **永久**：没有 `AudioContext` / 构造抛错；
 *   · `audioSessionSuspendedReason` —— **可恢复**：`resume()` 被拒绝或抛错，
 *     下一次成功的 `resume()` 会把它清掉。
 *   AC-D8 逐字写的是「`isAudioSilent()` **只**表示「`AudioContext` 整个不可用」
 *   （`AudioContext` 不存在 / 构造抛错 / **被浏览器拒绝** ⇒「全静但可玩」）」——
 *   「被浏览器拒绝」这一支正是**可恢复**那条 ⇒ 两项都在 AC-D8 的字面口径内。
 *
 * ⚠️ **仍然**不等价于 `audioDegradations().length > 0` —— 单个音效坏了
 *   不等于设备无音频（AC-D8，变异 **M123** 专打「把它写成后者」的写法）。
 *   面板靠**两条不同的 key**（`audioContext` / `audioSession`）把「永久」与
 *   「会自己好」分开显示，不必靠这个布尔量区分。
 */
export function isAudioSilent(): boolean {
  return audioContextUnavailableReason !== null || audioSessionSuspendedReason !== null
}

/** 全部正在生效的降级项及其原因 —— Story 1.17 调试面板的数据源（`epics.md:1361`）。 */
export function audioDegradations(): readonly AudioDegradation[] {
  const list: AudioDegradation[] = []
  if (audioContextUnavailableReason !== null) {
    list.push({ scope: 'session', key: 'audioContext', reason: audioContextUnavailableReason })
  }
  if (audioSessionSuspendedReason !== null) {
    // ⚠️ 与永久那条**分开登记**：面板上要能看出「这一条会自己好」——
    //   永久那条（没有 AudioContext / 构造抛错）不会自己恢复，
    //   而 `resume()` 拒绝只要下一次手势 resume 成功就会消失。
    list.push({ scope: 'session', key: 'audioSession', reason: audioSessionSuspendedReason })
  }
  for (const [cue, reason] of failedSfx) {
    list.push({ scope: 'asset', key: `sfx:${cue}`, reason })
  }
  if (bgmFailedReason !== null) {
    list.push({ scope: 'asset', key: 'music:battle-loop', reason: bgmFailedReason })
  }
  return list
}

/**
 * 记一条资源级降级（不改变 `isAudioSilent()`）。
 *
 * ⚠️ **递增点在这里，而不是在 `failedSfx.add()` / `bgmFailed = true` 旁边**：
 *   本函数是资源级降级的**唯一咽喉**，而 `fetchAudioBuffer` 内部与它的调用方
 *   （`playSfx` / `prewarmBgm` 的回调）**都会调它** —— 在标志旁逐处加会漏，
 *   而漏掉的那一处恰好是「面板不刷新」最难查的形态（R-37）。
 */
function markAssetFailed(reason: string): void {
  noteDegradationsChanged()
  console.warn(`[audio] ${reason}`)
}

/** 记一条 session 级降级（AudioContext 整个不可用 —— **永久**）。 */
function markSessionUnavailable(reason: string): void {
  audioContextUnavailableReason = reason
  noteDegradationsChanged()
  console.warn(`[audio] ${reason}`)
}

/**
 * 记一条**可恢复**的 session 级降级（`resume()` 被拒绝）。
 *
 * ⚠️ 与 {@link markSessionUnavailable} 分开的原因见 `audioSessionSuspendedReason` 的注释：
 *   拒绝**不等于** context 不可用，把它写进永久那条会让一次偶发拒绝静音整个会话。
 */
function markSessionSuspended(reason: string): void {
  audioSessionSuspendedReason = reason
  noteDegradationsChanged()
  console.warn(`[audio] ${reason}`)
}

/**
 * 清掉「可恢复」那条降级 —— **一次成功的 `resume()` 之后**调它。
 *
 * ⚠️ 只在它**确实被设过**时才动版本号：否则每次成功 resume 都会
 *   惊动 1.17 的调试面板重算（面板的 `computed` 读版本号）。
 */
function clearSessionSuspended(): void {
  if (audioSessionSuspendedReason === null) return
  audioSessionSuspendedReason = null
  noteDegradationsChanged()
}

// ── AudioContext 解锁（Story 1.2 / AC-1 第一步）──────────────────────────────

/**
 * 解锁 / 保持 Web Audio 会话（AC-1 第一步）。
 *
 * 首次调用时创建 AudioContext，之后每次都 resume() —— 手势内创建与手势内 resume 等价，
 * 而孩子可能连点按钮，所以两者都要覆盖。
 *
 * 幂等：重复调用复用同一个 context，重复 resume 无害（这正是 AC-8「反复点 5 次」的依据）。
 * 全程同步，任何失败只记 `WARN [audio]`，**不抛、不弹窗** —— NFR13「孩子面前永不出现技术错误」。
 *
 * ⚠️ **`AudioContext` 不存在 / 构造抛错 / 被浏览器拒绝** ⇒ 记 session 级降级（AC-D8）。
 *   这时 `isAudioSilent()` 为 true，而单个资源失败不会走到这里。
 */
export function unlockAudioSession(): void {
  try {
    if (!audioCtx) {
      const Ctor = globalThis.AudioContext
      if (typeof Ctor !== 'function') {
        markSessionUnavailable('浏览器不支持 AudioContext，音频通路不可用（session 级）')
        return
      }
      // 在手势上下文内创建（不是在 import 时）—— 手势前创建的 context 只能是 suspended。
      try {
        audioCtx = new Ctor()
      } catch (err) {
        // `new AudioContext()` 抛错（受限策略 / 残缺 polyfill）—— deferred ① 的收口。
        markSessionUnavailable(`构造 AudioContext 失败：${describe(err)}`)
        return
      }
    }

    // 同步发起，不 await。拒绝时（策略未放开等）只记日志。
    //
    // ⚠️📎 **[CR] 2026-10-21**：拒绝**不**登记成永久 session 降级 ——
    //   它只登记「可恢复」那一条，而**一次成功的 resume 会把它清掉**。
    //   原实现把拒绝写进永久那条且永不清除 ⇒ 一次偶发拒绝静音整个会话。
    try {
      void audioCtx.resume().then(
        () => {
          clearSessionSuspended()
        },
        (err: unknown) => {
          markSessionSuspended(`resume() 被拒绝，音频会话暂不可用：${describe(err)}`)
        },
      )
    } catch (err) {
      // ⚠️📎 **[CR] 2026-10-21 补：同步抛错与「Promise 被拒绝」是同一个失败原因** ——
      //   残缺 polyfill 上 `resume` 可能根本不是函数、closed context 会抛
      //   `InvalidStateError` ⇒ 异常是**同步**抛出的。
      //   ⇒ 若让它落到下面那个外层 catch，它会被记成**永久** session 降级
      //   （`markSessionUnavailable`），而那个标志**永不清除**
      //   ⇒ **一个完全可用的 AudioContext 被永久判死**
      //   （`getPlayableContext()` 从此返回 null，所有音效与 BGM 都哑）
      //   —— 正是本轮刚拆掉的那个「一次偶发失败静音整个会话」的形态，
      //   只是换了个抛出方式。⇒ **同一个失败原因必须得到同一个生命周期。**
      markSessionSuspended(`resume() 抛错，音频会话暂不可用：${describe(err)}`)
    }
  } catch (err) {
    // deferred ①：解锁链路任何意外都必须被 service 层兜住 ——
    // `audio-unlock.ts` 刻意**不**在同步块外层兜异常（理由是「不得在此吞异常」，
    // 失败要可见），所以服务层一旦破约，第③步 prewarmBgm() 根本执行不到。
    markSessionUnavailable(`解锁音频会话失败：${describe(err)}`)
  }
}

/** 把一个 unknown 变成一句可读的说明（不抛，NFR14）。 */
function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// ── SFX 播放（AC-D4、AC-D5、AC-D9）──────────────────────────────────────────

/**
 * 播放一个音效 cue —— **绝不向调用方抛**（AC-D9）。
 *
 * 契约与 `pronunciation.ts` 的「绝不向调用方抛」同款：内部各自兜住失败，
 * 不靠调用方兜。`store.ts` 的门面刻意没有 try/catch，它逐字引用着那份契约。
 *
 * ⚠️ **首次触发才 `fetch` + 解码**，之后复用已解码的 `AudioBuffer`（AC-D4）——
 *   同一资源第二次及以后**不重新 fetch**。
 * ⚠️ **每次播放 `createBufferSource()` 新建一个**（AC-D4）——
 *   `AudioBufferSourceNode` 是一次性的，复用它第二次 `start()` **不出声**（Web Audio 经典坑）。
 * ⚠️ **失败即标记，不再重试**（AC-D5）：404 / 解码失败 / 非 2xx ⇒ 记 `failedSfx`，
 *   后续每次触发直接跳过。守卫 **G68** 用 fetch 计数断言「连续触发三次只请求一次」。
 */
export function playSfx(cue: SfxCue): void {
  // 已标记失败 ⇒ 直接跳过，不发请求（AC-D5）。
  if (failedSfx.has(cue)) return

  const ctx = getPlayableContext()
  if (ctx === null) return // session 永久不可用，已在解锁时记过降级

  // ⚠️📎 **[CR] 2026-10-21**：context 被挂起（切后台 / 自动播放策略）时**就地再 resume 一次** ——
  //   `playSfx` 是从组件点击一路同步下来的（`applyAction` → effects-runner → 这里），
  //   **手势上下文还在**，而挂起的 context 不 resume 就永远不出声。
  ensureContextRunning(ctx)

  const cached = sfxBuffers.get(cue)
  if (cached !== undefined) {
    startBuffer(ctx, cached)
    return
  }

  // 未缓存 ⇒ 发起加载。
  //
  // ⚠️📎 **[CR] 2026-10-21：同一 cue 的并发触发共用同一次 fetch**（in-flight 去重）。
  //   原实现只查**已解码**的缓存，解码窗口内的第二次触发会**再发一次 fetch**
  //   ⇒ 平板上连建两座塔就把同一个 mp3 下载两遍、解码两遍，
  //   而两份解码回调**各自起播一次** ⇒ 「建塔」音在同一瞬间叠着响两次。
  //   裁决 7 允许「不同事件的音效叠加」，**不包括**「同一个事件被自己放大」。
  let loading = loadingSfx.get(cue)
  if (loading === undefined) {
    loading = loadSfx(cue)
    loadingSfx.set(cue, loading)
  }
  // 加载完成后**各自**起播一次 —— 并发触发是「同一事件响多次」，不是「一次事件响一次」。
  void loading.then(() => {
    const buffer = sfxBuffers.get(cue)
    if (buffer !== undefined) startBuffer(ctx, buffer)
  })
}

/**
 * 加载并解码一个 cue；resolve 时 buffer 已进 `sfxBuffers` 或已进 `failedSfx`。
 *
 * ⚠️ **只记一次失败**：失败原因由 `fetchAudioBuffer` 交回来，
 *   在这里合成**一条** `[audio]` 日志 —— 原实现是「`fetchAudioBuffer` 记一条 +
 *   调用方再记一条」，一次 404 产生两条 warn，还把降级版本号推高两次。
 */
function loadSfx(cue: SfxCue): Promise<void> {
  return new Promise<void>((resolve) => {
    const url = `${SFX_BASE_PATH}${cue}.mp3`
    void fetchAudioBuffer(url, (buffer, reason) => {
      if (buffer === null) {
        const why = reason ?? '加载失败，已标记不再重试'
        failedSfx.set(cue, why)
        markAssetFailed(`音效 ${cue} ${why}`)
      } else {
        sfxBuffers.set(cue, buffer)
      }
      resolve()
    })
  })
}

// ── BGM 播放（AC-D6、AC-D7）──────────────────────────────────────────────────

/**
 * BGM buffer 预解（AC-1 第三步）。**同步发起，不 await**（AC-D6）。
 *
 * ⚠️ 本函数与前两步共用**同一个手势同步块** ⇒ `fetch` 必须**同步发起**
 *   （「发起 promise + 挂 `.then`」），绝不能 `await`。解码在解锁之后完成。
 * ⚠️ 这是 AC-G8 裁决的落点：本文件**允许** `.then()`（解码需要），
 *   但 `.then()` 逃逸守卫**只**加在 `app/audio-unlock.ts`（三步同步块不允许 promise 链）。
 */
export function prewarmBgm(): void {
  // 已缓存或已失败 ⇒ 无事可做（AC-D5 失败即标记，AC-D4 解码一次）。
  if (bgmBuffer !== null || bgmFailedReason !== null) return
  // ⚠️📎 **[CR] 2026-10-21**：**正在加载**时也不重复发起 ——
  //   「反复点 5 次开始游戏」（AC-8）会让同一个 39 秒的 mp3 被下载 5 遍。
  if (bgmLoading) return

  const ctx = getAudioContext()
  // 未解锁 ⇒ **无从解码**（`decodeAudioData` 是 context 的方法）。
  // ⚠️ **本函数不负责解锁** —— 解锁是 `unlockAudioSession()` 的活，
  //   它排在解锁三步的第①步（`app/audio-unlock.ts`）。
  //   ⇒ 这里**不重试**：没有 context 时再试一百次也是同一个结果。
  if (ctx === null) return

  // ⚠️ 同步发起 fetch（不 await）。失败记 asset 降级，不阻断解锁链路。
  bgmLoading = true
  void fetchAudioBuffer(`${MUSIC_BASE_PATH}battle-loop.mp3`, (buffer, reason) => {
    bgmLoading = false
    if (buffer === null) {
      const why = reason ?? '加载失败，已标记不再重试'
      bgmFailedReason = why
      markAssetFailed(`BGM ${why}`)
      return
    }
    bgmBuffer = buffer
    // 🔥📎 **[CR] 2026-10-21 补：解码完成的那一刻把「该播了」这件事接上。**
    //   原实现只在这里赋值 `bgmBuffer`，而 `startBgmIfReady()` 早在解码完成**之前**
    //   就被 `enterLevel()` 调过一次（同一个同步块里）⇒ 它当时 `bgmBuffer === null`
    //   直接返回 ⇒ **BGM 永远不播**，且没有任何日志、没有任何降级项。
    //   ⇒ 现在「进关了」（`bgmRequested`）与「解码好了」两个事实**必须在这里会合**。
    if (bgmRequested) startBgmIfReady()
  })
}

/**
 * 若 BGM 已就绪则起播并单曲循环（AC-D7）—— 由 `enterLevel()` 在进入战斗后调用（裁决 5）。
 *
 * BGM **不走** `runEffects`：它由「进入战斗」触发，而**进关不是 action**
 * （`state` 在模块求值期就建好，`enterLevel()` 只改 `view`）⇒ 硬塞进 `runEffects`
 * 是形状错配。本函数与 `store.ts` 的 `speakQuestion()` 门面同构（app 层门面，非 action 驱动），
 * 所以「副作用只在 effects-runner」这条仍然成立。
 *
 * ⚠️ **单曲循环**：`source.loop = true`。⚠️ **重复调用不叠播**：先停已在播的 source。
 * ⚠️ **绝不向调用方抛**（AC-D9）。
 *
 * ⚠️📎 **[CR] 2026-10-21**：本函数**记下「进关了」这个意图**（`bgmRequested = true`），
 *   即使此刻 buffer 还没解出来 —— 解码完成时 `prewarmBgm` 的回调会回来起播。
 *   原来「未就绪就静默跳过」是**单向**的：跳过后再没人试 ⇒ BGM 永远不响。
 */
export function startBgmIfReady(): void {
  // 意图先记下来：解码完成的那一刻要靠它决定「现在该播了吗」。
  bgmRequested = true

  // ⚠️📎 **[CR] 2026-10-21 补：意图记下了，却没人负责去「试」** ——
  //   第一轮修的是「解码完成后没人起播」；本轮补的是**另一半**：
  //   「进关了」这个事实发生时，**如果根本没有人在加载**（解锁三步被打断、
  //   或调用方绕过解锁三步直接进了关），那么光有 `bgmRequested` 这个
  //   **意图**没有人执行 ⇒ BGM 永远静默，且零日志、零降级项（连「坏了」都不是）。
  //   ⇒ 意图必须**自己**发起一次加载 —— 这就是原注释里那句
  //   「见下方『谁会再试』」指向的机制：**它当时根本不存在**。
  //
  // ⚠️ **三个条件缺一不可**：已解好（不必再解）/ 已失败（AC-D5 失败即标记，
  //   不许重试）/ 正在加载（别把同一个 39 秒 mp3 下载两遍）。
  if (bgmBuffer === null && bgmFailedReason === null && !bgmLoading) prewarmBgm()

  const ctx = getPlayableContext()
  if (ctx === null || bgmBuffer === null) return // 未就绪 —— 等 `prewarmBgm` 的回调

  ensureContextRunning(ctx)

  try {
    // 重复调用不叠播：先停上一次（AC-D7）。
    stopBgmSource()
    const source = ctx.createBufferSource()
    source.buffer = bgmBuffer
    source.loop = true
    source.connect(ctx.destination)
    source.start()
    bgmSource = source
  } catch (err) {
    // 播放失败不抛（AC-D9 / NFR13），只记日志。
    console.warn(`[audio] BGM 起播失败：${describe(err)}`)
  }
}

/**
 * 停掉正在播的 BGM，并**撤掉「该播了」这个意图**（AC-D7 的对称面）。
 *
 * ⚠️📎 **[CR] 2026-10-21 新增**：BGM 原本「永远不响」，所以**从来没有人需要停它**；
 *   一旦 BGM 真的会响，退出战斗就必须真的停 ——
 *   否则孩子点「返回开始界面」之后，战斗音乐还在响。
 *   ⇒ `store.backToStart()`（`view` 唯一的出口）现在会调它。
 *
 * ⚠️ **绝不向调用方抛**（AC-D9）。
 */
export function stopBgm(): void {
  bgmRequested = false
  stopBgmSource()
}

/** 停掉当前那个源节点（已结束的节点再 stop() 会抛 InvalidStateError —— 忽略）。 */
function stopBgmSource(): void {
  if (bgmSource === null) return
  try {
    bgmSource.stop()
  } catch {
    // 已结束的节点再 stop() 会抛 InvalidStateError —— 忽略，它本来就停了。
  }
  bgmSource = null
}

// ── 内部：context / fetch / 起播 ─────────────────────────────────────────────

/**
 * 取一个**可播放**的 context：不存在 / **永久** session 级不可用时返回 null。
 *
 * ⚠️ 刻意**不**在播放器里新建 AudioContext（AC-D2）—— 唯一的 context 出口是
 *   `unlockAudioSession()` 建的模块级那一个。
 *
 * ⚠️📎 **[CR] 2026-10-21**：**只挡永久的那条**（没有 AudioContext / 构造抛错）。
 *   「`resume()` 被拒绝」是**可恢复**的 —— 挡它等于让一次偶发拒绝静音整个会话，
 *   而挂起的 context 本身也不出声，所以挡不挡的**听感**一样，恢复能力差很多。
 */
function getPlayableContext(): AudioContext | null {
  if (audioContextUnavailableReason !== null) return null
  return audioCtx
}

/**
 * context 被挂起时**就地再 resume 一次**（同步发起，不 await）。
 *
 * ⚠️ **为什么在这里 resume 而不是只在解锁时 resume 一次**：
 *   `playSfx` / `startBgmIfReady` 是从组件点击一路同步下来的
 *   （`applyAction` → effects-runner → 这里），**用户手势上下文还在** ——
 *   而被挂起的 context（切后台 / 自动播放策略）在 resume 之前永远不出声。
 *   ⇒ 这条路径是「本会话里唯一还有手势的机会」。
 *
 * ⚠️ **`resume()` 失败只记「可恢复」那条降级**（见 `audioSessionSuspendedReason`）——
 *   它不把整个会话判死；下一次成功就会清掉。
 */
function ensureContextRunning(ctx: AudioContext): void {
  if (ctx.state !== 'suspended') return
  void ctx.resume().then(
    () => {
      clearSessionSuspended()
    },
    (err: unknown) => {
      markSessionSuspended(`resume() 被拒绝，音频会话暂不可用：${describe(err)}`)
    },
  )
}

/**
 * 同步发起 `fetch` + `decodeAudioData`，结果通过回调交付。**不得 await**（AC-D6）。
 *
 * 覆盖**全部**失败形态并统一交付 `null`（AC-D5 / deferred ②）：
 *   · `fetch` 本身抛（网络栈异常 / 残缺环境）
 *   · 响应非 2xx（404 等）
 *   · `decodeAudioData` 抛（解码器内部异常 —— deferred ②）
 * 任一发生都**把失败原因交回调用方**、返回 null，绝不冒到调用方。
 *
 * ⚠️📎 **[CR] 2026-10-21**：本函数**不再自己记日志** —— 原来它记一条、
 *   调用方再记一条，一次 404 产生**两条** `[audio]` warn、降级版本号推高两次，
 *   而它自己的注释却写着「不重复记」。⇒ 现在失败**原因**由这里交回，
 *   由调用方合成**唯一一条**日志。
 */
function fetchAudioBuffer(
  url: string,
  onReady: (buffer: AudioBuffer | null, reason: string | null) => void,
): void {
  const ctx = audioCtx
  if (ctx === null) {
    onReady(null, '尚未解锁，音频通道不可用')
    return
  }
  try {
    // ⚠️ **全链 promise 化，一个 `await` 都不用**（AC-D6 + eslint no-restricted-syntax）。
    // `fetch → arrayBuffer → decodeAudioData` 三段全返回 Promise，串成一条链即可；
    // 链尾的 `.catch` 一次性兜住 fetch 抛 / 非 2xx / arrayBuffer 抛 / 解码抛四种形态。
    void fetch(url)
      .then((response): Promise<AudioBuffer> | null => {
        if (!response.ok) {
          return null
        }
        return response.arrayBuffer().then((data) => ctx.decodeAudioData(data))
      })
      .then(
        (buffer) => {
          // 上一环返回 null ⇒ HTTP 非 2xx，失败原因在下面那条链上补齐。
          if (buffer === null) {
            onReady(null, '请求失败（响应非 2xx），已标记不再重试')
            return
          }
          onReady(buffer, null)
        },
        (err: unknown) => {
          onReady(null, `加载失败：${describe(err)}，已标记不再重试`)
        },
      )
  } catch (err) {
    // fetch 本身抛（极罕见但残缺环境会发生）—— 同步兜住，绝不外冒。
    onReady(null, `发起请求失败：${describe(err)}，已标记不再重试`)
  }
}

/**
 * 用一个**新建**的 `AudioBufferSourceNode` 起播一次（AC-D4）。
 *
 * ⚠️ 每次新建 —— `AudioBufferSourceNode` 是一次性的，复用第二次 `start()` 不出声。
 */
function startBuffer(ctx: AudioContext, buffer: AudioBuffer): void {
  try {
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    source.start()
  } catch (err) {
    // 起播失败不抛（AC-D9 / NFR13），只记日志 —— 绝不阻断回合。
    console.warn(`[audio] 音效起播失败：${describe(err)}`)
  }
}
