/// <reference types="vite/client" />
/**
 * TTS 朗读服务 —— 教材文字发声的唯一出口（Story 1.2）。
 *
 * ⚠️ 本文件在音频解锁链路上，**不允许出现任何 `await`**（架构决策 4 / 硬约束 8），
 * 由 eslint 的 `no-restricted-syntax` 守卫（见 eslint.config.js）。
 *
 * ⚠️ 形态上刻意**不**用 legacy 的 `class SpeechService.getInstance()` 单例：
 * 与架构否决 Pinia / 单例是同一条理由 —— 全局可变状态最难测，而本文件全是分支断言。
 * 改用「模块级纯函数 + 模块级 let 状态」，测试用 `vi.resetModules()` 隔离。
 *
 * 继承 legacy 的**算法**（preheat 的三条踩坑知识、音色优先级链），
 * 不继承 legacy 的**形态**，也不继承它的错误注释（见 §4.1 的理由更正）。
 */

// ── 可配置常量（AR34；长句 0.9 是起点，Epic 3 / Story 3.4 现场调）────────────────

/** 单词朗读语速。慢一点让孩子听得清每个音节。 */
export const SPEECH_RATE_WORD = 0.85
/** 单词音调。略高于 1，避免低龄儿童的音色过于沉闷。 */
export const SPEECH_PITCH_WORD = 1.05
/** 长句朗读语速。比单词略快，否则整句拖沓。 */
export const SPEECH_RATE_SENTENCE = 0.9
/** 长句音调。回到默认。 */
export const SPEECH_PITCH_SENTENCE = 1.0

/**
 * 单块朗读的字符上限。
 *
 * 为什么是硬约束：Chrome 上单条 utterance 播到约 15 秒会被**静默掐断** ——
 * 不触发 onend、不触发 onerror、speaking 仍为 true，表现为应用挂死
 * （crbug 679437 / 2009 年提出，至今未修）。而 Android 上 `pause()` 就是 `cancel()`，
 * 没有保活手段，**分块是唯一对策**。
 */
export const MAX_CHUNK_CHARS = 200

/** 预热 utterance 的兜底超时。onend / onerror 都不来时靠它收敛，不得无限等待。 */
export const PREHEAT_TIMEOUT_MS = 1500

/**
 * 每块朗读的兜底超时。
 *
 * 故意大于 15 秒那个截断阈值：正常播完会由 onend 提前清掉定时器；
 * 真被静默掐断时，这只定时器是唯一能把播放链推下去的东西。
 */
export const CHUNK_TIMEOUT_MS = 20_000

/**
 * 探测结果为空时的重试冷却。
 *
 * `getVoices()` 首次返回 `[]` 是**规范允许**的（语音系统懒加载），规范推荐的手段是
 * 「首调 + 订阅 `voiceschanged`」—— 但有些实现（WebView 上常见）语音服务晚启动
 * 且**根本不派发** `voiceschanged`。只订阅不轮询，那台设备上 `probeTts()` 会永远
 * 返回 `no-voice`，英式优先（AC-4）形同虚设，调试面板还会给出错误诊断。
 * ⇒ 冷却后重读一次，兜住这条路径。
 */
export const PROBE_RETRY_MS = 2000

/** 设备上没有任何可用英文音色时 utterance.lang 的兜底值。 */
export const DEFAULT_LANG = 'en-US'

/**
 * 音色优先级链（AR32）。
 *
 * 英式优先是因为上海版教材录音多为英式。**但架构上不得假设首选音色存在**（AR33）——
 * 命中任意 en 音色是正常路径，不是异常路径。
 */
export const VOICE_PRIORITY: readonly string[] = [
  'Google UK English',
  'Google US English',
  'Microsoft Hazel',
  'Microsoft Susan',
  'Samantha',
  'Karen',
]

// ── 类型 ───────────────────────────────────────────────────────────────────

/** 选音色只需要这两个字段，用结构化最小类型，便于测试传入朴素对象。 */
export interface VoiceLike {
  readonly name: string
  readonly lang: string
}

/** 探测结果。state 判据见各字面量注释。 */
export type TtsState = 'unavailable' | 'no-voice' | 'available'

export interface TtsStatus {
  /** unavailable：speechSynthesis 不存在；no-voice：没有英文音色；available：可用。 */
  readonly state: TtsState
  /** 设备上 getVoices() 返回的音色总数（不限语言）—— AR35 要的「可用音色数」。 */
  readonly voiceCount: number
}

// ── 模块级状态 ─────────────────────────────────────────────────────────────

let voices: readonly VoiceLike[] = []
let voicesHooked = false
let probeCache: TtsStatus | null = null
/** 上次探测的时刻，用于 PROBE_RETRY_MS 的重试冷却。 */
let lastProbeAt = 0
/**
 * 发声权代号。每次 `playPronunciation` 自增，旧的朗读链拿到过期代号后不再推进 ——
 * 没有它，两条链会互相 cancel 并互相「救活」（`[CR]` 2026-10-12 发现的 P1/P2）。
 */
let playbackGeneration = 0
/** 预热 utterance 是否**已发起**（幂等判据）。 */
let warmupStarted = false
/** 预热是否**已完成**（onend / onerror / 超时三路收敛的结果）。 */
let preheated = false

// ── 内部工具 ───────────────────────────────────────────────────────────────

/** 取 speechSynthesis；不存在或不可用（speak 不是函数）时返回 null。 */
function getSynthesis(): SpeechSynthesis | null {
  const synth = globalThis.speechSynthesis
  return synth && typeof synth.speak === 'function' ? synth : null
}

/** lang 归一：Android 常返回下划线形态 en_US，BCP 47 是 en-US。 */
function normalizeLang(lang: string): string {
  return lang.replace(/_/g, '-').toLowerCase()
}

function isEnglish(lang: string): boolean {
  return /^en[-_]/i.test(lang)
}

/**
 * 两条通路都不可用时的终点（AC-5 / AR37）。
 *
 * 2026-10-12 纠偏后主备已对调（录音为主路，见架构决策 7），因此这个名字与
 * 「降级到录音」不再相符 —— 它现在记录的是「录音与 TTS 都没能发声」。
 * 改名会波及 44 个既有断言里的一批日志文案，故保留名字并在注释里说清现状；
 * 录音由 `playRecording` 负责，不再由这里触发。
 *
 * **硬约束：绝不向调用方抛。** 支柱 1 的唯一入口挂掉时，回合仍须能流转
 * （AR37）—— 孩子看到的是画面，不是错误页。
 *
 * 录音资源由 Story 1-3 生产（`public/assets/audio/voice/`）。当前该目录为空，
 * `playRecording` 的 `error` 事件会走降级到这里 —— 属预期路径。
 */
function fallbackToRecording(text: string): void {
  console.warn(`[tts] 朗读不可用（录音与设备 TTS 均失败）：${text}`)
}

// ── 预生成录音（架构决策 7 主通路）─────────────────────────────────────────

/**
 * 预生成录音的目录。决策 7：音频不按单元分层，文件名 = 词条 id。
 *
 * 接 `import.meta.env.BASE_URL` 而不是写死根路径（Story 1.3 / AC-11）：
 * 应用部署在 `https://sunrong.site/plantsgame/` 子路径下，写死 `/` 会让
 * 每个录音都 404，主通路静默降级成设备 TTS —— 表现只是「音色偶尔不对」，
 * 没有任何报错指向它。`BASE_URL` 自带尾斜杠，这里不要再拼一个。
 */
export const RECORDING_BASE_PATH = `${import.meta.env.BASE_URL}assets/audio/voice/`

/**
 * 词条 id 的合法形态：带单元前缀的 kebab-case（`u1-dog`、`u2-ice-cream`）。
 *
 * 为什么要校验：id 会被拼进 URL。内容 JSON 是人工录入的，一个 `../../config` 就能
 * 让 `new Audio()` 打出目录外的路径。这不是理论风险 —— 它是「用户可编辑的数据
 * 直接进入 URL」这个模式自带的风险，校验成本是一次正则。
 */
export const ENTRY_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** 当前正在发声的录音元素。后一次调用要能把它掐掉（重入是常态，见 playPronunciation）。 */
let activeRecording: HTMLAudioElement | null = null

/**
 * 播放预生成录音 —— **朗读主通路**（架构决策 7）。
 *
 * 主路录音而不是设备 TTS 的理由：设备 TTS 的发音取决于设备装了哪些引擎
 * （架构已记录 EMUI 可能 0 voices、Android WebView 完全不支持），跨设备不可复现；
 * 而认读质量是本作的核心。
 *
 * @returns true = 录音已接管发声权（即使随后异步失败也已计入接管）
 *          false = 环境不支持或 id 非法，调用方应立即走 TTS 通路
 *
 * ⚠️ 加载 mp3 是异步的，这里**不能等**（本文件禁止 `AwaitExpression`，且等它
 * 反而会让起声时间多一个 RTT）。用事件回调收敛：三路都算「失败」——
 * 构造/播放异常、`error` 事件、`play()` 的 rejected promise。
 */
function playRecording(entryId: string, onUnplayable: () => void): boolean {
  // ⚠️ `typeof` 那一半不可省：`RegExp.test()` 会把参数强制转成字符串，
  // 于是 `null` → `"null"`、`12345` → `"12345"`，两者都过下面这条正则
  // （内容层 JSON 是人工录入的，这个形态完全可能出现）。
  // 正则挡住了目录穿越（无 `.` 无 `/`），所以这不是安全问题，
  // 但每次都会白发一次 404 —— 且拼出来的 URL 是不可解释的。
  if (typeof entryId !== 'string' || !ENTRY_ID_PATTERN.test(entryId)) {
    console.warn(`[tts] 词条 id 不合法，跳过录音：${String(entryId)}`)
    return false
  }

  const AudioCtor = globalThis.Audio
  if (typeof AudioCtor !== 'function') {
    return false
  }

  // 接管发声权由 `takeOverPlayback()` 在 playPronunciation 入口统一完成，
  // 这里不再重复停旧录音。

  // 本次播放的代号。陈旧的 error / play 拒绝必须靠它作废，
  // 否则「点 u1-dog（404 很慢）→ 点 u1-cat → dog 的 404 迟到」会让 finish()
  // 在 cat 的录音已经开始之后又去念一遍 dog。
  playbackGeneration += 1
  const generation = playbackGeneration

  let settled = false
  const finish = (): void => {
    // 被后一次 playPronunciation 接管 —— 这条失败回调已经过期，不能再去发声。
    if (settled || generation !== playbackGeneration) {
      return
    }
    settled = true
    onUnplayable()
  }

  let el: HTMLAudioElement
  try {
    el = new AudioCtor(`${RECORDING_BASE_PATH}${entryId}.mp3`)
  } catch (err) {
    console.warn(`[tts] 录音构造失败，转 TTS：${entryId}`, err)
    return false
  }

  el.addEventListener('error', () => {
    // 404 / 解码失败 / 无权限 —— 全落在这里。这是录音缺失时的正常路径，不是异常。
    //
    // ⚠️ `[CR]` 2026-10-16：与下面的 `ended` 监听器**对称地**放开引用。
    //   本文件 `:141` 亲口写着「当前该目录为空，`playRecording` 的 error
    //   事件会走降级到这里 —— 属预期路径」，而 `ended` 那条专门解释了
    //   「白留一个 HTMLAudioElement 与其解码缓冲不释放」——
    //   录音 404 恰是本项目当前**最频繁**的路径，不清引用等于每次
    //   失败都在攒一个死元素。
    if (activeRecording === el) {
      activeRecording = null
    }
    finish()
  })

  activeRecording = el
  el.addEventListener('ended', () => {
    // 正常播完就放开引用：activeRecording 指向一个早已播完的元素，
    // 会让后面每次 stopActiveRecording() 都去 pause 一个死元素，
    // 且整个会话期间白留一个 HTMLAudioElement 与其解码缓冲不释放。
    if (activeRecording === el) {
      activeRecording = null
    }
  })

  try {
    // play() 返回 Promise；不 await（见函数注释），只挂拒绝处理。
    void el.play().then(undefined, (err: unknown) => {
      // Android 上音频会话未解锁时 autoplay 被拒 —— 开始游戏的解锁应已避免，
      // 但它确实是可预见的失败形态，静默播放 Promise 拒绝只留一个 unhandled rejection。
      console.warn(`[tts] 录音播放被拒，转 TTS：${entryId}`, err)
      finish()
    })
  } catch (err) {
    console.warn(`[tts] 录音播放抛错，转 TTS：${entryId}`, err)
    finish()
  }

  return true
}

/** 停掉当前录音。`playbackGeneration` 的失效由 playRecording 内部的递增负责。 */
function stopActiveRecording(): void {
  if (activeRecording) {
    activeRecording.pause()
    activeRecording.currentTime = 0
    activeRecording = null
  }
}

/**
 * 接管发声权 —— **唯一入口**（AC-3「点击卡面无限次重听」意味着重入是常态路径）。
 *
 * ⚠️ 这段逻辑原先散在两个互不知情的局部机制里，`[CR]` 2026-10-12 实测出两条
 * 孩子会同时听到两声的路径：
 *
 *   · `stopActiveRecording()` 只在 `playRecording` 内被调 → 录音换 TTS 时旧录音不停
 *   · `synth.cancel()` 只在 `speakWithTts` 内被调 → TTS 换录音时在途 utterance 不停
 *
 * 两个机制各自「够用」，合起来却不覆盖 2×2 的交叉格。发声权是**单一资源**，
 * 接管它的动作就也该是单一动作：进来先把两个音源都掐掉，再分派。
 *
 * `synth.cancel()` 的两条理由仍然成立，都来自 `[CR]` 2026-10-12 的实测：
 *
 * ① `cancel()` 会对被取消的 utterance 派发 `error('canceled')`。
 *    把 cancel 写进 `speakChunkAt` 的话，那个错误事件会被当成「这块念完了」而推进下一块，
 *    下一块又看到 speaking 为真再 cancel —— 一次 cancel 之后链一路念到底。
 *
 * ② 每块都重新判断一次 `speaking`，会正面撞上「cancel 吞掉紧随的 speak」
 *    （Chromium issue 41436964）。浏览器在 `onend` 回调期间仍可能把 `speaking`
 *    报成 true（队列尚未清空），而那恰恰是最容易命中的一步。
 *    在入口只判一次，链内部不再 cancel。
 *    ⚠️ **别把这条读成「竞争窗口已消除」**（`[CR]` 2026-10-16 更正）：
 *    本函数里 `cancel()` 与紧随其后的 `synth.speak()` 仍在**同一个同步块**内，
 *    相邻关系并没有被拆开。真正被消掉的是「重复判断」与「每块一次」这两点，
 *    不是 issue 41436964 的成因本身。该 issue 描述的是 Windows SAPI 路径，
 *    本项目跑在 Android Chrome 上，**是否命中未实测**。
 *
 * 判据仍然是 `speaking === true` —— 为了「防止 cancel 破坏刚解锁的音频会话」
 * 这个理由查无证据（AC-6），真正要避的是上面那条竞争。
 */
function takeOverPlayback(): void {
  // ⚠️ 本文件对外声明「绝不向调用方抛」，而这里处在**每一次发音的最前面** ——
  //   `pause()` 对未加载成功的元素、某些引擎上的 `currentTime` 赋值、
  //   以及残缺 polyfill 的 `cancel()` 都不是零风险。任一抛错都会把
  //   「这一声念不出来」升级成「回合卡死」。逐个兜住。
  try {
    stopActiveRecording()
  } catch (err) {
    console.warn('[tts] 停止上一段录音失败，忽略', err)
  }
  try {
    const synth = getSynthesis()
    if (synth?.speaking) {
      synth.cancel()
    }
  } catch (err) {
    console.warn('[tts] cancel() 失败，旧朗读可能继续', err)
  }
}

// ── 探测（AR35）────────────────────────────────────────────────────────────

/**
 * 按优先级链选音色，无匹配返回 null（不抛）。
 *
 * 链条：`VOICE_PRIORITY` 逐档 → 任意 en-US → 任意 en。
 * lang 比较必须兼容下划线形态 —— Android 上判 `startsWith('en-US')` 会整个落空。
 */
export function selectVoice(candidates: readonly VoiceLike[]): VoiceLike | null {
  for (const preferred of VOICE_PRIORITY) {
    // ⚠️ `isEnglish` 这一半不是冗余：`[CR]` 2026-10-12 实测前，
    // 优先级链只比 name。不同引擎里音色名会跨语种重名
    // （`Karen` 在部分是 da-DK，`Samantha` 在某些系统有非英语变体），
    // 命中后 `utterance.lang = voice.lang` 会把非英语标签写进 utterance。
    // 兜底两档本来就判 lang，优先级链也该判 —— 否则同一函数里两套标准。
    const hit = candidates.find(
      (voice) => voice.name === preferred && isEnglish(voice.lang),
    )
    if (hit) {
      return hit
    }
  }
  const usEnglish = candidates.find((voice) => normalizeLang(voice.lang) === 'en-us')
  return usEnglish ?? candidates.find((voice) => isEnglish(voice.lang)) ?? null
}

/**
 * 读一次音色列表。任何一步失败都降级成「没有音色」，**绝不把异常抛出去** ——
 * 这里在解锁的三步同步块上，抛出去会让第三步 `prewarmBgm()` 根本执行不到。
 *
 * `typeof` 守卫与 `getSynthesis()` 对 `speak` 的守卫是同一道防线：
 * 精简 WebView、部分 polyfill、隐私模式下可能只暴露部分 API。
 */
function readVoices(synth: SpeechSynthesis): readonly VoiceLike[] {
  if (typeof synth.getVoices !== 'function') {
    return []
  }
  try {
    return soundVoices(synth.getVoices())
  } catch (err) {
    console.warn('[tts] getVoices() 失败，按无音色处理', err)
    return []
  }
}

/**
 * 剔除字段残缺的音色（`[CR]` 2026-10-16）。
 *
 * `readVoices` 防了 `getVoices()` **抛错**，却没防它**返回畸形元素**：
 * 某个精简 WebView / polyfill 返回 `{ name: 'X', lang: undefined }` 时，
 * `isEnglish` 走正则不抛，但 `normalizeLang` 里的 `lang.replace` 会抛 TypeError ——
 * 从 `probeTts` 冒到 `speakSilentWarmup` 第一行，再从 `unlockAudioSequence()`
 * 冒到 `onStart`，**第三步 `prewarmBgm()` 根本执行不到**。
 * 与本函数上方注释宣称的「精简 WebView / 隐私模式下只暴露部分 API」正是同一种环境。
 */
function soundVoices(raw: readonly VoiceLike[]): readonly VoiceLike[] {
  return raw.filter(
    (voice) =>
      voice !== null &&
      typeof voice === 'object' &&
      typeof voice.name === 'string' &&
      typeof voice.lang === 'string',
  )
}

/**
 * 拉一次音色列表并订阅 voiceschanged（订阅只装一次）。
 *
 * getVoices() 首次返回空数组是**规范允许**的（语音系统懒加载）。
 * 官方模式 = 同步调一次 + 订阅 voiceschanged，两者都要，只做一件会永远探不到音色。
 *
 * ⚠️ 在此之上再加一条冷却重试：有些实现语音服务晚启动且**不派发** `voiceschanged`，
 * 那台设备上只会拿到一次空数组。空着 + 冷却到了就重读一次（PROBE_RETRY_MS）。
 *
 * probeTts 与 playPronunciation 都从这里取音色 —— 不能让发音依赖「探测恰好先跑过」
 * 这种隐式顺序，Story 1.10 会在任意时机第一次调 playPronunciation。
 */
function ensureVoices(): readonly VoiceLike[] {
  const synth = getSynthesis()
  if (!synth) {
    return voices
  }

  if (voicesHooked) {
    // ⚠️ `[CR]` 2026-10-16：早退条件原来判的是 `voices.length > 0`，
    //   而 `PROBE_RETRY_MS` 要救的正是「设备先吐出本地语言默认音色、
    //   英文引擎稍后才起、且**不派发 voiceschanged**」那类 WebView。
    //   那种设备上 `voices.length` 一直是 1（一个中文音色），
    //   于是这个闸门把补救**自己关掉了** —— `getVoices()` 永远只调一次，
    //   `probeTts()` 永远报 `no-voice`，AC-4 的英式优先形同虚设。
    //   判据应当是「**英文音色**到货」，不是「有任何音色」。
    const hasEnglish = selectVoice(voices) !== null
    if (hasEnglish || Date.now() - lastProbeAt < PROBE_RETRY_MS) {
      return voices
    }
    voices = readVoices(synth)
    // ⚠️ 重读之后**必须**置位，否则冷却窗口不成立：
    //   `playPronunciation` → `speakChunkAt` → `ensureVoices()` 这条路径
    //   不经过 `probeTts()`，不会有人替我们更新 `lastProbeAt`，
    //   于是每一块分块都会重读一次 getVoices()。
    lastProbeAt = Date.now()
    if (selectVoice(voices) !== null) {
      // 英文音色到货后原先的判定作废，缓存清掉让下一次 probeTts 重算。
      probeCache = null
    }
    return voices
  }

  voices = readVoices(synth)
  voicesHooked = true
  synth.onvoiceschanged = () => {
    voices = readVoices(synth)
    lastProbeAt = Date.now()
    probeCache = null
  }
  return voices
}

/**
 * 探测 speechSynthesis 的可用性与音色数，结果缓存。
 *
 * 落点在 `speakSilentWarmup()` 内部首行 —— 见 Story Dev Notes §6 决策 4：
 * 「开始游戏」那次点击就是音频链路的起点，放进 `unlockAudioSequence()` 会破坏
 * 「三行同步调用、中间不得有语句」那条约束。
 */
export function probeTts(): TtsStatus {
  // `unavailable` 是终态（speechSynthesis 不在，来了也不会变）；`available` 只要
  // voiceschanged 一到就被清缓存重算。唯有 `no-voice` 需要按冷却主动重试 ——
  // 那是「语音服务还没起来」的表现，而它不一定伴随 voiceschanged（见 PROBE_RETRY_MS）。
  if (probeCache && probeCache.state !== 'no-voice') {
    return probeCache
  }
  if (probeCache && Date.now() - lastProbeAt < PROBE_RETRY_MS) {
    return probeCache
  }

  if (!getSynthesis()) {
    lastProbeAt = Date.now()
    probeCache = { state: 'unavailable', voiceCount: 0 }
    return probeCache
  }

  const available = ensureVoices()
  // ⚠️ 必须**在** ensureVoices 之后置位：ensureVoices 用 lastProbeAt 判断
  // 自己是否处在冷却里，先置位会让它永远读到「刚刚探测过」而永不重读。
  lastProbeAt = Date.now()
  probeCache = {
    state: selectVoice(available) ? 'available' : 'no-voice',
    voiceCount: available.length,
  }
  return probeCache
}

// ── 预热（AC-1 ② / AC-2）──────────────────────────────────────────────────

/** 预热是否已完成（AC-2 的可观测状态，供真机与 Story 1.16 调试面板读取）。 */
export function isPrewarmed(): boolean {
  return preheated
}

/**
 * TTS 预热：发一条 volume = 0 的空 utterance。
 *
 * 三路收敛：onend / onerror / 超时（PREHEAT_TIMEOUT_MS）。AC-2 要求不得无限等待 ——
 * 设备上 onend 与 onerror 都不来是可能的，legacy 只有前两路。
 *
 * fire-and-forget：**绝不**返回 Promise 给调用方 await（那会让解锁的同步块被让出）。
 *
 * ⚠️ 幂等判据是「**已发起**」而不是「已完成」：门禁检查发生在 `speak()` 的那一刻，
 * 预热的效果在发起时就已生效。孩子完全可能在前 1.5 秒内又点一次「开始游戏」，
 * 若等 onend 才置位，连点会发出多条预热 utterance（AC-8 明令「不出现重复预热」）。
 */
export function speakSilentWarmup(): void {
  probeTts()

  if (warmupStarted) {
    return
  }

  const synth = getSynthesis()
  if (!synth) {
    return
  }

  const Ctor = globalThis.SpeechSynthesisUtterance
  if (typeof Ctor !== 'function') {
    return
  }

  // ⚠️ 构造与赋值同样在 try 之外 —— 残缺 polyfill 上 `new Ctor` 抛错会让异常
  //   从 `unlockAudioSequence()` 的**第二步**冒出去，第三步 `prewarmBgm()`
  //   根本执行不到（`[CR]` 2026-10-16，与 speakChunkAt 里那处同因）。
  let warmup: SpeechSynthesisUtterance
  try {
    warmup = new Ctor(' ')
    warmup.volume = 0
  } catch (err) {
    console.warn('[tts] 预热 utterance 构造失败', err)
    return
  }

  // 收敛标志：onend / onerror / 超时三路竞争中谁先到算谁。
  // 不用 clearTimeout —— 定时器是一次性的，第二次触发是 no-op，
  // 而持有它的句柄反而让 settle 闭包多一层状态要维护。
  let settled = false
  const settle = (): void => {
    if (settled) {
      return
    }
    settled = true
    preheated = true
  }

  warmup.onend = settle

  // ⚠️ `[CR]` 2026-10-16：这里原来直接 `warmup.onerror = settle`，且**只**有 settle。
  //   `cancel()` 会对在途 utterance 派发 `error('canceled')`，而
  //   `takeOverPlayback()` 在预热还在途时就会 cancel 它。
  //   失败序列（已实测）：点「开始游戏」→ 1 秒内点卡面
  //   → 预热被 cancel 掉（**从未生效**）→ 而 `warmupStarted` 仍是 true，
  //   再调一次直接 return，**此后永不重试**。
  //   对 4–8 岁孩子，「开始游戏后立刻点卡面」是最常见的操作序列之一。
  //
  //   ⚠️ **刻意只修「永不重试」这半，不动 `preheated`**：
  //   AC-2 的字面是「`onend` / `onerror` 二者之一触发即标记预热完成」，
  //   `canceled` / `interrupted` 是 `onerror` 的两种 error code，
  //   不置 `preheated` 就是违反 AC-2（既有守卫也直接钉着这一条）。
  //   且 Review Findings 的 D1 裁决已认定 `isPrewarmed()` 是
  //   「预热流程已收敛」而非「TTS 已就绪」—— 超时兜底同样会置它 true，
  //   被 cancel 置 true 与那条裁决的口径一致。
  //   真正无人管、且只有这里能管的是**幂等锁焊死**。
  warmup.onerror = (event): void => {
    const reason = event?.error ?? 'unknown'
    settle()
    if (reason === 'canceled' || reason === 'interrupted') {
      // 预热被别的音源掐掉了 —— 解开幂等锁，让下一次点击能真正重试。
      warmupStarted = false
      console.warn(`[tts] 预热被取消（${reason}），下次点击将重新预热`)
    }
  }

  try {
    synth.speak(warmup)
    warmupStarted = true
  } catch (err) {
    // 发起失败不算「已预热」，允许下一次点击重试。
    console.warn('[tts] TTS 预热发起失败', err)
    return
  }

  setTimeout(settle, PREHEAT_TIMEOUT_MS)
}

// ── 发音（AC-3 / AC-5 / AC-6 / AC-7）────────────────────────────────────────

/**
 * 拼接两段文本，只在**两侧都没有空白**时补一个空格。
 *
 * 为什么需要它：词切分支里 `current` 是用「前缀空格」累出来的（`" aa bb"`），
 * 而下一句由正则切出时**不含前导空格**（前导空白归上一句的 `\s*`）。
 * 直接 `current += sentence` 会得到 `"aa bbGo."` —— 少一个空格，
 * TTS 会把两个词读成一个不存在的词。
 */
function joinText(a: string, b: string): string {
  if (!a) {
    return b
  }
  if (!b) {
    return a
  }
  return /\s$/.test(a) || /^\s/.test(b) ? a + b : `${a} ${b}`
}

/**
 * 按句切块，每块不超过 maxChars。
 *
 * 单句自身就超长时再按词切；连词都超长（贴纸式的连续长串）才硬切字符。
 * 切完的结果逐块 trim，保证没有前导空白 —— 空白也算进 200 字符预算。
 *
 * ⚠️ 句子的正则有**两个**分支：`[^.!?]+[.!?]*\s*` 匹配含正文的句子，
 * `[.!?]+\s*` 兜住开头的终止符串（`"...Hello!"`、`"?Really"`）。
 * 只留第一个分支会静默吞掉开头的标点（实测 fuzz 20 万次，10262 例字符丢失）。
 */
function chunkText(text: string, maxChars: number): string[] {
  const sentences = text.match(/[^.!?]+[.!?]*\s*|[.!?]+\s*/g) ?? [text]
  const chunks: string[] = []
  let current = ''

  const flush = (): void => {
    const trimmed = current.trim()
    if (trimmed) {
      chunks.push(trimmed)
    }
    current = ''
  }

  for (const sentence of sentences) {
    if (current && joinText(current, sentence).length > maxChars) {
      flush()
    }

    if (sentence.trim().length <= maxChars) {
      current = joinText(current, sentence)
      continue
    }

    flush()
    for (const word of sentence.trim().split(/\s+/)) {
      if (current && joinText(current, word).length > maxChars) {
        flush()
      }
      if (word.length <= maxChars) {
        current = joinText(current, word)
        continue
      }
      // 无空格的超长串：按**码点**硬切。
      // 用 Array.from 而不是 slice —— slice 按 UTF-16 码元切，
      // emoji 等增补平面字符落在边界上时会被劈成孤立代理对。
      const points = Array.from(word)
      for (let offset = 0; offset < points.length; offset += maxChars) {
        chunks.push(points.slice(offset, offset + maxChars).join(''))
      }
    }
  }

  flush()
  return chunks
}

/** 单个英文单词用单词参数，整句用长句参数。 */
function pickParams(text: string): { rate: number; pitch: number } {
  const isWord = /^[A-Za-z][A-Za-z'-]*$/.test(text.trim())
  return isWord
    ? { rate: SPEECH_RATE_WORD, pitch: SPEECH_PITCH_WORD }
    : { rate: SPEECH_RATE_SENTENCE, pitch: SPEECH_PITCH_SENTENCE }
}

/**
 * 朗读文本 —— **唯一对外的发音接口**（AC-5）。
 *
 * 契约（下游 16 个 story 都按这个调）：
 *   - 同步返回 void，不返回 Promise，回合流转永不被它阻断
 *   - 绝不向调用方抛：任何内部失败都收敛为「记 WARN 后静默返回」
 *   - **后一次调用会完整接管发声权**：旧的朗读链立即作废（AC-3「点击卡面无限次重听」
 *     意味着重入是常态路径，不是边界情况）
 *
 * 主备顺序（架构决策 7，2026-10-12 纠偏后）：**预生成录音 → 设备 TTS → 仅记 WARN**。
 *
 * ⚠️ **`entryId` 必须传**（`[CC]` 2026-10-12 裁决 + AC-5 纠偏批注）——
 * 不传 `entryId` 时直接走 TTS，而 TTS 再失败就只剩一条 `console.warn`：
 * `fallbackToRecording` **不播任何音频**。也就是说
 * 「TTS 挂了也有录音兜底」这句话**只对传了 `entryId` 的调用方成立**。
 * 「不阻断回合」（AR37）是无条件成立的；「必有兜底音频」不是。
 * 代价是每次少一次音频兜底尝试，收益是绝不猜一个可能不存在的文件路径。
 * Story 1.10 起所有朗读调用都必须传入词条 id。
 */
export function playPronunciation(text: string, entryId?: string): void {
  // ⚠️ 守卫与 `entryId` 的 `typeof` 门对称（`[CR]` 2026-10-16）：
  // `playPronunciation` 是被 store 无保护直接调用的入口，而 `store.ts` 的注释
  // 逐字引用着本函数「绝不向调用方抛」的契约。契约是契约，两边都守。
  if (typeof text !== 'string') {
    console.warn(`[tts] 朗读文本不是字符串，已忽略：${String(text)}`)
    return
  }
  const trimmed = text.trim()
  if (!trimmed) {
    return
  }

  // ⚠️ **代次作废必须排在 takeOverPlayback() 之前**（`[CR]` 2026-10-16 修）。
  //   原先这个 `+= 1` 藏在 `speakWithTts` / `playRecording` 内部，而接管发生在
  //   它们之前，于是 cancel 派发的 `error('canceled')` 到达 `onerror` 时
  //   `generation` 仍等于 `playbackGeneration` —— 旧链把它当成「本链没被接管
  //   却挨了取消」，于是**每一次正常的重入都打一条 `[tts] 朗读被打断` WARN**，
  //   与该分支注释写的「正常路径，不记日志」正好相反。
  //   更要紧的是它让代次隔离**依赖事件派发时机**：真实浏览器里 `cancel()` 的
  //   error 是异步派发的（此时代号已自增，判据恰好成立），而测试 fake 与
  //   Safari / 部分 WebView 那种「cancel 不派发 error」的形态会走另一条路。
  //   在入口统一作废，两种时机下判据都成立。
  playbackGeneration += 1

  // 接管发声权：**在任何分派之前**，把上一段（录音或 TTS）掐掉。
  takeOverPlayback()

  // 主通路：有词条 id 就先试预生成录音。录音缺失/加载失败时回调 speakWithTts。
  // 没有 id（调用方拿不到词条，或内容层尚未就绪）时直接走 TTS —— 不猜文件路径。
  if (entryId !== undefined && playRecording(entryId, () => speakWithTts(trimmed))) {
    return
  }

  speakWithTts(trimmed)
}

/**
 * 设备 TTS 通路（架构决策 7 辅路）。
 *
 * 内部按句切块 + onend 链式推进 + 每块超时兜底（AC-7），
 * 失败时经 `fallbackToRecording` 记 WARN —— 那已是两条通路都不可用后的终点。
 */
function speakWithTts(text: string): void {
  const synth = getSynthesis()
  const Ctor = globalThis.SpeechSynthesisUtterance
  if (!synth || typeof Ctor !== 'function') {
    fallbackToRecording(text)
    return
  }

  const chunks = chunkText(text, MAX_CHUNK_CHARS)
  const params = pickParams(text)

  // 接管发声权：旧链的代号过期，`advance` 从此对它无效。
  //
  // ⚠️ 只递增代号，**不**在这里 cancel —— 打断已上移到 `takeOverPlayback()`，
  // 由 `playPronunciation` 入口统一做（连同「停掉旧录音」）。
  // 曾经把这两件事拆在两个函数里，代价是录音↔TTS 的两个交叉方向都不打断，
  // 孩子会同时听到两声。理由与证据见 `takeOverPlayback` 的注释。
  playbackGeneration += 1
  const generation = playbackGeneration

  const speakChunkAt = (index: number): void => {
    // 被后一次 playPronunciation 接管 —— 旧链就此终止，不再抢发声权。
    if (generation !== playbackGeneration || index >= chunks.length) {
      return
    }

    const chunk = chunks[index]!

    // ⚠️ `[CR]` 2026-10-16：构造与逐字段赋值**原来在 try 之外**，只有
    //   `synth.speak(utterance)` 被包着。残缺 polyfill / 精简 WebView 上
    //   `new SpeechSynthesisUtterance()` 抛错时，异常会一路冒到
    //   `playPronunciation` 的调用方 —— 而 `store.ts` 的 `speakQuestion()`
    //   刻意不加 try/count（它逐字引用着本文件「绝不向调用方抛」的契约），
    //   于是孩子点卡面时回合直接卡死。
    //   对照 `playRecording`：它把 `new AudioCtor(...)` 包进了 try。
    //   这个不对称说明是遗漏，不是设计。
    let utterance: SpeechSynthesisUtterance
    try {
      utterance = new Ctor(chunk)
      utterance.rate = params.rate
      utterance.pitch = params.pitch
      utterance.volume = 1

      const voice = selectVoice(ensureVoices())
      if (voice) {
        utterance.voice = voice as SpeechSynthesisVoice
        utterance.lang = voice.lang
      } else {
        // Android 上 utterance.voice 可能被整个忽略并回落默认 en-US
        // （Chromium issue 331977824，Won't Fix），所以 lang 必须**也**设一次。
        // 注意：设了 lang 就不一定不回落 —— 那是社区共识 (B) 级，不是已解决的问题。
        utterance.lang = DEFAULT_LANG
      }
    } catch (err) {
      console.warn('[tts] utterance 构造失败，降级到预置录音路径', err)
      fallbackToRecording(chunk)
      return
    }

    /**
     * 本块的三路收敛状态。
     *
     * ⚠️ 刻意装进一个 `const` 对象，而不是 `let settled` + `let timer` 两个变量 ——
     * 后者会被 `prefer-const` 判死（`timer` 只赋值一次），
     * 而改成 `const timer = setTimeout(...)` 又会引入 TDZ：
     * 三个回调全部定义在这一行**之前**，谁先执行不由我们决定。
     * Story 1.2 Debug Log #5 记过同一件事（原话：「没有改成 const，那会引入 TDZ」）。
     */
    const state: {
      settled: boolean
      timer: ReturnType<typeof setTimeout> | undefined
    } = { settled: false, timer: undefined }

    // 三路收敛（onend / onerror / 超时）共用一个 settled，
    // 并在收敛时清掉兜底定时器 —— 正常播完不该留下一堆各挂 20 秒的句柄。
    const finish = (next: () => void): void => {
      if (state.settled) {
        return
      }
      state.settled = true
      if (state.timer !== undefined) {
        clearTimeout(state.timer)
      }
      next()
    }

    const advance = (): void => {
      finish(() => {
        speakChunkAt(index + 1)
      })
    }

    utterance.onend = advance

    // ⚠️ `onerror` **不**与 onend 共用 advance：`canceled` / `interrupted` 是
    // 「被打断」，不是「念完了」，据此推进会让链在被取消后反而继续念（P1）。
    utterance.onerror = (event): void => {
      const reason = event?.error ?? 'unknown'

      if (generation !== playbackGeneration) {
        // 被新的 playPronunciation 接管 —— 正常路径（孩子点了另一张卡），不记日志。
        //
        // ⚠️ `[CR]` 2026-10-16：这里原来也是**裸 return**，与本函数下一段
        //   「『不推进』不等于『不收敛』」的自我告诫自相矛盾 —— 20 秒的兜底
        //   定时器留在原地，到点照样触发 `advance`（虽然 `speakChunkAt` 会被
        //   代次挡住不发声，但句柄要挂满 20 秒）。
        //   AC-3 说「点击卡面可无限次重听」，孩子连点是常态，
        //   于是每次接管都为旧链白留一个 20 秒句柄。
        finish(() => {})
        return
      }

      if (reason === 'canceled' || reason === 'interrupted') {
        // 本链没被接管却挨了取消：页面被别的音源打断之类，记一条便于真机排查。
        //
        // ⚠️ 必须走 `finish()` 而不是裸 return —— `[CR]` 2026-10-12 实测：
        // 裸 return 会把 `CHUNK_TIMEOUT_MS` 的兜底定时器留在原地，
        // 20 秒后 `advance` 照样触发，链在自己已被取消之后又开始念下一块。
        // 「不推进」不等于「不收敛」。
        finish(() => {
          console.warn(`[tts] 朗读被打断（${reason}），停止后续分块：${chunk}`)
        })
        return
      }

      // 真正的发声失败（not-allowed / synthesis-failed / audio-hardware / network …）。
      // AC-5 要求「记 WARN + 降级」，而真实浏览器里 speak() 极少同步抛错，
      // 主要失败形态恰恰落在这条路上 —— 之前它既不记日志也不降级，是静默失败。
      finish(() => {
        console.warn(`[tts] 朗读失败（${reason}），降级到预置录音路径`, event)
        fallbackToRecording(chunk)
      })
    }

    try {
      synth.speak(utterance)
    } catch (err) {
      console.warn('[tts] speak 失败，降级到预置录音路径', err)
      fallbackToRecording(chunk)
      // 剩余分块一并走降级通路 —— AC-5 要求「不静默失败」，
      // 只处理当前块会让后面几块无声消失，回合侧看不出念了一半。
      for (const rest of chunks.slice(index + 1)) {
        fallbackToRecording(rest)
      }
      return
    }

    // onend/onerror 都不来时（~15 秒静默截断 bug）的兜底，必须大于那个截断阈值。
    state.timer = setTimeout(advance, CHUNK_TIMEOUT_MS)
  }

  speakChunkAt(0)
}
