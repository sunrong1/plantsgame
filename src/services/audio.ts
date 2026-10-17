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

/** 已确认失败（404 / 解码失败 / 非 2xx）的资源键。**失败即标记，不再重试**（AC-D5）。 */
const failedSfx = new Set<SfxCue>()

/** BGM 的已解码 buffer；BGM 已失败标记。 */
let bgmBuffer: AudioBuffer | null = null
let bgmFailed = false

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

/** `AudioContext` 是否**整个**不可用 —— 只表示 session 级降级，**不**含单个资源失败（AC-D8）。 */
let audioContextUnavailableReason: string | null = null

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
  for (const cb of degradationListeners) cb()
}

/** 降级状态的当前版本号（纯整数；配 {@link onAudioDegradationsChanged} 用）。 */
export function audioDegradationsVersion(): number {
  return degradationsVersion
}

/**
 * 是否全静（AudioContext 整个不可用）。
 *
 * ⚠️ **只**由 `audioContextUnavailableReason` 决定，**不**等价于
 *   `audioDegradations().length > 0` —— 单个音效坏了不等于设备无音频（AC-D8，
 *   变异 **M123** 专打「把它写成后者」的写法）。
 */
export function isAudioSilent(): boolean {
  return audioContextUnavailableReason !== null
}

/** 全部正在生效的降级项及其原因 —— Story 1.17 调试面板的数据源（`epics.md:1361`）。 */
export function audioDegradations(): readonly AudioDegradation[] {
  const list: AudioDegradation[] = []
  if (audioContextUnavailableReason !== null) {
    list.push({ scope: 'session', key: 'audioContext', reason: audioContextUnavailableReason })
  }
  for (const cue of failedSfx) {
    list.push({ scope: 'asset', key: `sfx:${cue}`, reason: '音效加载或解码失败，已标记不再重试' })
  }
  if (bgmFailed) {
    list.push({ scope: 'asset', key: 'music:battle-loop', reason: 'BGM 加载或解码失败，已标记不再重试' })
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

/** 记一条 session 级降级（AudioContext 整个不可用）。 */
function markSessionUnavailable(reason: string): void {
  audioContextUnavailableReason = reason
  noteDegradationsChanged()
  console.warn(`[audio] ${reason}`)
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
    void audioCtx.resume().catch((err: unknown) => {
      markSessionUnavailable(`resume() 被拒绝，音频会话不可用：${describe(err)}`)
    })
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
  if (ctx === null) return // session 不可用，已在解锁时记过降级

  const cached = sfxBuffers.get(cue)
  if (cached !== undefined) {
    startBuffer(ctx, cached)
    return
  }

  // 未缓存 ⇒ 同步发起 fetch + 解码，并挂 .then（**不得 await** —— 见文件头）。
  const url = `${SFX_BASE_PATH}${cue}.mp3`
  void fetchAudioBuffer(url, (buffer) => {
    if (buffer === null) {
      failedSfx.add(cue)
      markAssetFailed(`音效 ${cue} 加载失败，已标记不再重试`)
      return
    }
    sfxBuffers.set(cue, buffer)
    startBuffer(ctx, buffer)
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
  if (bgmBuffer !== null || bgmFailed) return

  const ctx = getAudioContext()
  if (ctx === null) return // 未解锁 —— enterLevel() 会再试

  // ⚠️ 同步发起 fetch（不 await）。失败记 asset 降级，不阻断解锁链路。
  void fetchAudioBuffer(`${MUSIC_BASE_PATH}battle-loop.mp3`, (buffer) => {
    if (buffer === null) {
      bgmFailed = true
      markAssetFailed('BGM 加载失败，已标记不再重试')
      return
    }
    bgmBuffer = buffer
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
 */
export function startBgmIfReady(): void {
  const ctx = getPlayableContext()
  if (ctx === null || bgmBuffer === null) return // 未就绪 —— 静默跳过（prewarm 可能还没解完）

  try {
    // 重复调用不叠播：先停上一次（AC-D7）。
    if (bgmSource !== null) {
      try {
        bgmSource.stop()
      } catch {
        // 已结束的节点再 stop() 会抛 InvalidStateError —— 忽略，它本来就停了。
      }
      bgmSource = null
    }
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

// ── 内部：context / fetch / 起播 ─────────────────────────────────────────────

/**
 * 取一个**可播放**的 context：不存在 / session 级不可用时返回 null。
 *
 * ⚠️ 刻意**不**在播放器里新建 AudioContext（AC-D2）—— 唯一的 context 出口是
 *   `unlockAudioSession()` 建的模块级那一个。
 */
function getPlayableContext(): AudioContext | null {
  if (audioContextUnavailableReason !== null) return null
  return audioCtx
}

/**
 * 同步发起 `fetch` + `decodeAudioData`，结果通过回调交付。**不得 await**（AC-D6）。
 *
 * 覆盖**全部**失败形态并统一返回 `null`（AC-D5 / deferred ②）：
 *   · `fetch` 本身抛（网络栈异常 / 残缺环境）
 *   · 响应非 2xx（404 等）
 *   · `decodeAudioData` 抛（解码器内部异常 —— deferred ②）
 * 任一发生都只记日志、返回 null，绝不冒到调用方。
 */
function fetchAudioBuffer(url: string, onReady: (buffer: AudioBuffer | null) => void): void {
  const ctx = audioCtx
  if (ctx === null) {
    onReady(null)
    return
  }
  try {
    // ⚠️ **全链 promise 化，一个 `await` 都不用**（AC-D6 + eslint no-restricted-syntax）。
    // `fetch → arrayBuffer → decodeAudioData` 三段全返回 Promise，串成一条链即可；
    // 链尾的 `.catch` 一次性兜住 fetch 抛 / 非 2xx / arrayBuffer 抛 / 解码抛四种形态。
    void fetch(url)
      .then((response): Promise<AudioBuffer> | null => {
        if (!response.ok) {
          markAssetFailed(`${url} 请求失败：HTTP ${response.status}`)
          return null
        }
        return response.arrayBuffer().then((data) => ctx.decodeAudioData(data))
      })
      .then((buffer) => {
        // 上一环返回 null ⇒ 已记过失败，直接交付（不重复记）。
        onReady(buffer)
      })
      .catch((err: unknown) => {
        markAssetFailed(`${url} 加载失败：${describe(err)}`)
        onReady(null)
      })
  } catch (err) {
    // fetch 本身抛（极罕见但残缺环境会发生）—— 同步兜住，绝不外冒。
    markAssetFailed(`${url} 发起请求失败：${describe(err)}`)
    onReady(null)
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
