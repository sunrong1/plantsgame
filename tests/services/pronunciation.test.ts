/**
 * services/pronunciation.ts 的单元测试（Story 1.2 / AC-2 #4 #5 #6 #7）。
 *
 * ⚠️ Node 环境里没有 speechSynthesis、没有 SpeechSynthesisUtterance、
 * 没有 AudioContext 三个浏览器 global，**三个都必须 stub**，漏一个就是 ReferenceError。
 *
 * ⚠️ 必须动态 `await import()`，不能在文件顶部静态 import：
 * 静态 import 会在 `vi.resetModules()` 之前求值，拿到的是另一份模块实例，
 * 模块级的 preheat 状态清不掉 —— 测试会因为前一个用例的 `preheated === true`
 * 而**假绿通过**。这个坑 Story 1.2 的 Dev Notes §7 专门记了。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * fake 语音合成器。
 *
 * ⚠️ 必须按真实 Web Speech API 的语义建模两条，否则测不到真路径：
 *
 * ① `cancel()` 会对**在途**的 utterance 派发 `error('canceled')`。
 *    早期版本的 fake 只把 `speaking` 置 false，于是 `cancel` 之后的因果链整个测不到
 *    —— 这正是 `[CR]` 2026-10-12 发现的 P1（cancel 反而推进朗读链）的成因。
 * ② `onend` 之后 `speaking` 要归零。不归零的话，`speakChunkAt` 里那句
 *    `if (synth.speaking)` 在每块边界上都会为真，块边界的 cancel 路径同样测不到。
 */
interface FakeSynthesis {
  voices: { name: string; lang: string }[]
  speaking: boolean
  spoken: FakeUtterance[]
  /** 当前在途（已 speak 未结束）的 utterance。 */
  inFlight: FakeUtterance | null
  cancelCalls: number
  onvoiceschanged: (() => void) | null
  getVoicesCalls: number
  speakError: Error | null
  /** 让下一次及之后的 speak() 抛错（用于模拟链条中途失败）。 */
  failSpeakFromCall: number | null
  getVoices(): { name: string; lang: string }[]
  cancel(): void
  speak(utterance: FakeUtterance): void
  /** 让在途的 utterance 正常播完：清 speaking 并触发 onend。 */
  endInFlight(): void
  /** 让在途的 utterance 以某个 error code 失败。 */
  failInFlight(error: string): void
}

const makeSynth = (): FakeSynthesis => {
  const state: FakeSynthesis = {
    voices: [],
    speaking: false,
    spoken: [],
    inFlight: null,
    cancelCalls: 0,
    // ⚠️ 实现是通过给 speechSynthesis 赋 onvoiceschanged 来订阅的，
    // 所以被 stubGlobal 的对象必须**就是**测试手里这一个 —— 否则读的是另一个副本。
    onvoiceschanged: null,
    getVoicesCalls: 0,
    speakError: null,
    failSpeakFromCall: null,
    getVoices() {
      state.getVoicesCalls += 1
      return state.voices
    },
    cancel() {
      state.cancelCalls += 1
      state.speaking = false
      const interrupted = state.inFlight
      state.inFlight = null
      // 真实语义：被取消的 utterance 会收到 error('canceled')。
      interrupted?.onerror?.({ error: 'canceled' })
    },
    speak(utterance: FakeUtterance) {
      state.spoken.push(utterance)
      const callNo = state.spoken.length
      if (state.speakError && (state.failSpeakFromCall === null || callNo >= state.failSpeakFromCall)) {
        throw state.speakError
      }
      state.inFlight = utterance
      state.speaking = true
    },
    endInFlight() {
      const current = state.inFlight
      if (!current) {
        return
      }
      state.inFlight = null
      state.speaking = false
      current.onend?.()
    },
    failInFlight(error: string) {
      const current = state.inFlight
      if (!current) {
        return
      }
      state.inFlight = null
      state.speaking = false
      current.onerror?.({ error })
    },
  }
  return state
}

let synth: FakeSynthesis

/**
 * FakeUtterance 必须照真实 API 的形状：**先构造、再逐字段赋值**。
 * 写成「构造时传 options 对象」的话，测不到真实代码路径。
 */
class FakeUtterance {
  text: string
  volume = 1
  rate = 1
  pitch = 1
  voice: unknown = null
  lang = ''
  onend: (() => void) | null = null
  onerror: ((event: { error: string }) => void) | null = null

  constructor(text: string) {
    this.text = text
  }
}

beforeEach(() => {
  vi.resetModules()
  synth = makeSynth()
  vi.stubGlobal('speechSynthesis', synth)
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)
  // `Audio` 的 stub 也在这里装，与 speechSynthesis 同属「本文件用到的三个浏览器 global」。
  //
  // ⚠️ `[CR]` 二轮 2026-10-12：原先这个 hook 写在文件中部（录音 describe 之前），
  // 而 Vitest 的顶层 hook 对**全文件**所有用例生效 —— 也就是说，
  // 「预生成录音主通路」的 Audio stub 实际覆盖了前面所有 TTS 用例。
  // 今天无害（那些用例从不构造 Audio），但将来任何一条前置用例想测
  // 「无 Audio 环境」都会被静默破坏，而且在 700 行之下根本查不到这个 hook。
  // 移到顶部，让「本文件全局 stub 了什么」在一屏之内说得清。
  audioInstances.length = 0
  vi.stubGlobal('Audio', FakeAudioImpl)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

/** 装一批音色并让 probe 重新读取。 */
const withVoices = (voices: { name: string; lang: string }[]): void => {
  synth.voices = voices
}

describe('音色优先级链（AC-4）', () => {
  // 逐档断言：任一档存在时必须命中它，而不是「名字里含 en 就用」。
  const chain: [string, string, string][] = [
    // 期望命中的音色名 | 同批存在的干扰音色 | 其余
    ['Google UK English', 'Google US English', 'en-US'],
    ['Google US English', 'Microsoft Hazel', 'en-US'],
    ['Microsoft Hazel', 'Microsoft Susan', 'en-US'],
    ['Microsoft Susan', 'Samantha', 'en-US'],
    ['Samantha', 'Karen', 'en-US'],
    ['Karen', '', 'en-US'],
  ]

  it.each(chain)('命中 %s', async (expected, decoyA, decoyB) => {
    const voices = [
      { name: decoyA, lang: 'en-US' },
      { name: expected, lang: 'en-GB' },
      { name: decoyB, lang: 'en-US' },
    ].filter((v) => v.name)

    withVoices(voices)
    const { selectVoice } = await import('../../src/services/pronunciation')

    expect(selectVoice(synth.voices)?.name).toBe(expected)
  })

  it('六档全缺时回退到任意 en-US', async () => {
    withVoices([{ name: 'Some en-US Voice', lang: 'en-US' }])
    const { selectVoice } = await import('../../src/services/pronunciation')

    expect(selectVoice(synth.voices)?.name).toBe('Some en-US Voice')
  })

  it('只有非 en-US 的 en 音色时回退到任意 en（末尾档）', async () => {
    withVoices([{ name: 'En-AU Voice', lang: 'en-AU' }])
    const { selectVoice } = await import('../../src/services/pronunciation')

    expect(selectVoice(synth.voices)?.name).toBe('En-AU Voice')
  })

  it('一个 en 音色都没有时返回 null，不抛错', async () => {
    withVoices([{ name: 'Ting-Ting', lang: 'zh-CN' }])
    const { selectVoice } = await import('../../src/services/pronunciation')

    expect(selectVoice(synth.voices)).toBeNull()
  })

  it('下划线形态的 lang（Android 常见 en_US）同样命中末尾档', async () => {
    // 判据写成 startsWith('en-US') 的话，这里就落空了。
    withVoices([{ name: 'Android en_US Voice', lang: 'en_US' }])
    const { selectVoice } = await import('../../src/services/pronunciation')

    expect(selectVoice(synth.voices)?.name).toBe('Android en_US Voice')
  })

  it('en_US 与 en-US 归一后属于同一档，先出现者胜出', async () => {
    // 判据若写成 startsWith('en-US')，下划线形态会被错放到末尾档。
    withVoices([
      { name: 'US A', lang: 'en-US' },
      { name: 'US B', lang: 'en_US' },
    ])
    const { selectVoice } = await import('../../src/services/pronunciation')

    expect(selectVoice(synth.voices)?.name).toBe('US A')
  })
})

describe('probeTts（AC-5 / AR35）', () => {
  it('speechSynthesis 完全不存在时返回 unavailable', async () => {
    vi.stubGlobal('speechSynthesis', undefined)
    const { probeTts } = await import('../../src/services/pronunciation')

    expect(probeTts().state).toBe('unavailable')
  })

  it('有英文音色时返回 available 并给出音色数', async () => {
    withVoices([
      { name: 'Google UK English', lang: 'en-GB' },
      { name: 'Ting-Ting', lang: 'zh-CN' },
    ])
    const { probeTts } = await import('../../src/services/pronunciation')
    const status = probeTts()

    expect(status.state).toBe('available')
    expect(status.voiceCount).toBe(2)
  })

  it('存在 speechSynthesis 但无英文音色时返回 no-voice', async () => {
    withVoices([{ name: 'Ting-Ting', lang: 'zh-CN' }])
    const { probeTts } = await import('../../src/services/pronunciation')

    expect(probeTts().state).toBe('no-voice')
  })

  it('首次调用后结果被缓存，不再重复 getVoices()', async () => {
    withVoices([{ name: 'Samantha', lang: 'en-US' }])
    const { probeTts } = await import('../../src/services/pronunciation')

    probeTts()
    const afterFirst = synth.getVoicesCalls
    probeTts()
    probeTts()

    expect(synth.getVoicesCalls).toBe(afterFirst)
  })

  it('首次 getVoices() 返回空时订阅 voiceschanged，音色到达后可探到（AC-4 前置）', async () => {
    // 规范允许 getVoices() 首次返回 []；官方模式是「同步调一次 + 订阅 voiceschanged」，两者都要。
    withVoices([])
    const { probeTts } = await import('../../src/services/pronunciation')

    expect(probeTts().state).toBe('no-voice')
    expect(synth.onvoiceschanged, '没订阅 voiceschanged，语音系统懒加载时永远探不到音色').toBeTypeOf(
      'function',
    )

    synth.voices = [{ name: 'Google UK English', lang: 'en-GB' }]
    synth.onvoiceschanged?.()

    expect(probeTts().state).toBe('available')
  })
})

describe('speakSilentWarmup（AC-1 ② / AC-2）', () => {
  it('发出一条 volume = 0 的 utterance（这是 legacy 踩坑知识的继承点）', async () => {
    withVoices([{ name: 'Samantha', lang: 'en-US' }])
    const { speakSilentWarmup } = await import('../../src/services/pronunciation')

    speakSilentWarmup()

    expect(synth.spoken).toHaveLength(1)
    expect(synth.spoken[0]!.volume).toBe(0)
  })

  it('onend 触发即标记完成（AC-2）', async () => {
    withVoices([{ name: 'Samantha', lang: 'en-US' }])
    const { isPrewarmed, speakSilentWarmup } = await import('../../src/services/pronunciation')

    speakSilentWarmup()
    expect(isPrewarmed()).toBe(false)

    synth.spoken[0]!.onend?.()

    expect(isPrewarmed()).toBe(true)
  })

  it('onerror 触发同样标记完成（Android 上空 utterance 常见 onerror）', async () => {
    withVoices([{ name: 'Samantha', lang: 'en-US' }])
    const { isPrewarmed, speakSilentWarmup } = await import('../../src/services/pronunciation')

    speakSilentWarmup()
    synth.spoken[0]!.onerror?.({ error: 'interrupted' })

    expect(isPrewarmed()).toBe(true)
  })

  it('onend 与 onerror 都不触发时，超时后仍标记完成 —— 不得无限等待（AC-2 核心）', async () => {
    vi.useFakeTimers()
    withVoices([{ name: 'Samantha', lang: 'en-US' }])
    const { isPrewarmed, speakSilentWarmup } = await import('../../src/services/pronunciation')

    speakSilentWarmup()
    // 没有任何回调 → 定时器是唯一的收敛路径
    vi.advanceTimersByTime(10_000)

    expect(isPrewarmed(), '超时兜底没生效：预热永久挂着').toBe(true)
  })

  it('已发起过一次就不再发第二条 —— 连点「开始游戏」也不重复预热（AC-8 第 3 条）', async () => {
    withVoices([{ name: 'Samantha', lang: 'en-US' }])
    const { speakSilentWarmup } = await import('../../src/services/pronunciation')

    speakSilentWarmup()
    speakSilentWarmup()
    speakSilentWarmup()
    speakSilentWarmup()
    speakSilentWarmup()

    expect(synth.spoken).toHaveLength(1)
  })

  it('发起时抛错不算已预热，允许下一次点击重试', async () => {
    synth.speakError = new Error('not-allowed')
    withVoices([{ name: 'Samantha', lang: 'en-US' }])
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { speakSilentWarmup } = await import('../../src/services/pronunciation')

    speakSilentWarmup()
    synth.speakError = null
    speakSilentWarmup()

    expect(synth.spoken).toHaveLength(2)
    warn.mockRestore()
  })

  it('speechSynthesis 不存在时不发 utterance，也不抛', async () => {
    vi.stubGlobal('speechSynthesis', undefined)
    const { speakSilentWarmup } = await import('../../src/services/pronunciation')

    expect(() => speakSilentWarmup()).not.toThrow()
    expect(synth.spoken).toHaveLength(0)
  })
})

describe('playPronunciation（AC-3 / AC-5 / AC-6 / AC-7）', () => {
  it('同时设置 voice 与 lang —— legacy 只设 voice，Android 上会被整个忽略', async () => {
    withVoices([{ name: 'Google UK English', lang: 'en-GB' }])
    const { playPronunciation } = await import('../../src/services/pronunciation')

    playPronunciation('sunflower')

    const utterance = synth.spoken[0]!
    expect(utterance.voice, 'Android 上 utterance.voice 可能被忽略回落 en-US').not.toBeNull()
    expect(utterance.lang, '必须同时设 lang，否则英式优先落空').toBe('en-GB')
  })

  it('单词用 rate 0.85 / pitch 1.05（AC-6 的可配置起点值）', async () => {
    withVoices([{ name: 'Samantha', lang: 'en-US' }])
    const { playPronunciation } = await import('../../src/services/pronunciation')

    playPronunciation('sunflower')

    expect(synth.spoken[0]!.rate).toBe(0.85)
    expect(synth.spoken[0]!.pitch).toBe(1.05)
  })

  it('长句用 rate 0.9 / pitch 1.0', async () => {
    withVoices([{ name: 'Samantha', lang: 'en-US' }])
    const { playPronunciation } = await import('../../src/services/pronunciation')

    playPronunciation('I have a ball for my dog.')

    expect(synth.spoken[0]!.rate).toBe(0.9)
    expect(synth.spoken[0]!.pitch).toBe(1.0)
  })

  it('speaking === false 时绝不调用 cancel（AC-6 硬约束）', async () => {
    synth.speaking = false
    withVoices([{ name: 'Samantha', lang: 'en-US' }])
    const { playPronunciation } = await import('../../src/services/pronunciation')

    playPronunciation('ball')

    expect(synth.cancelCalls).toBe(0)
  })

  it('speaking === true 时调用 cancel 以避开 cancel→speak 竞争窗口', async () => {
    synth.speaking = true
    withVoices([{ name: 'Samantha', lang: 'en-US' }])
    const { playPronunciation } = await import('../../src/services/pronunciation')

    playPronunciation('ball')

    expect(synth.cancelCalls).toBe(1)
  })

  it('speak() 抛错时降级且绝不向调用方抛（AC-5）', async () => {
    synth.speakError = new Error('not-allowed')
    withVoices([{ name: 'Samantha', lang: 'en-US' }])
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { playPronunciation } = await import('../../src/services/pronunciation')

    expect(() => playPronunciation('ball')).not.toThrow()
    expect(warn.mock.calls.some((call) => String(call[0]).startsWith('[tts]'))).toBe(true)
    warn.mockRestore()
  })

  it('speechSynthesis 完全不可用时走同一接口降级，回合流转不中断', async () => {
    vi.stubGlobal('speechSynthesis', undefined)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { playPronunciation } = await import('../../src/services/pronunciation')

    expect(() => playPronunciation('I have a ball for my dog.')).not.toThrow()
    expect(warn.mock.calls.some((call) => String(call[0]).startsWith('[tts]'))).toBe(true)
    warn.mockRestore()
  })

  it('空文本不发声也不记日志', async () => {
    withVoices([{ name: 'Samantha', lang: 'en-US' }])
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { playPronunciation } = await import('../../src/services/pronunciation')

    playPronunciation('   ')

    expect(synth.spoken).toHaveLength(0)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})

/**
 * `[CR]` 2026-10-12 新增 —— 打断与重入。
 *
 * AC-3 说「点击卡面可无限次重听」，**重入是常态路径不是边界情况**。
 * 这一组用例守的是当年那个 fake 测不到的因果链：`cancel()` 会派发
 * `error('canceled')`，而 `onerror` 若与 `onend` 共用 `advance`，
 * 「被取消」就会被当成「念完了」而推进下一块。
 */
describe('打断与重入（[CR] P1 / P2 / P3）', () => {
  const LONG_TEXT = 'A short line about a ball for my dog. '.repeat(24)

  const load = async (): Promise<{ playPronunciation: (t: string) => void }> => {
    withVoices([{ name: 'Samantha', lang: 'en-US' }])
    return import('../../src/services/pronunciation')
  }

  it('cancel 之后旧链不再推进 —— error("canceled") 不是「念完了」', async () => {
    const { playPronunciation } = await load()
    playPronunciation(LONG_TEXT)
    // 先把链推进几块，让它真的跑起来（链式推进下同一时刻只有一条在播）
    for (let i = 0; i < 3 && synth.inFlight; i += 1) {
      synth.endInFlight()
    }
    const beforeCancel = synth.spoken.length
    expect(beforeCancel, '长句本该切成多块').toBeGreaterThan(1)

    synth.cancel()

    expect(synth.spoken.length, 'cancel 派发的 error("canceled") 把链推下去了 —— P1 未修').toBe(
      beforeCancel,
    )
  })

  it('本链没被接管却收到 canceled 时，记 WARN 且停止推进', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { playPronunciation } = await load()
    playPronunciation(LONG_TEXT)
    const before = synth.spoken.length

    // 直接让在途 utterance 失败，不经过 cancel（模拟外部打断，如来电）
    synth.failInFlight('canceled')

    expect(synth.spoken.length).toBe(before)
    expect(warn.mock.calls.some((c) => String(c[0]).startsWith('[tts]'))).toBe(true)
    warn.mockRestore()
  })

  it('新一次 playPronunciation 完整接管：孩子点的词立刻发声，不排在旧句子后面', async () => {
    const { playPronunciation } = await load()
    playPronunciation(LONG_TEXT)
    expect(synth.spoken.length).toBe(1)

    // 长句还在念第 1 块 —— 孩子点了另一张卡
    playPronunciation('Ball')

    expect(synth.cancelCalls, '接管时应当打断一次正在播的旧内容').toBe(1)
    expect(synth.spoken.length, '新调用没有立刻发声').toBe(2)
    expect(synth.spoken[1]!.text, '孩子点的词应当是最后一条发音').toBe('Ball')
  })

  it('旧链被接管后彻底停止：不会在新内容播完后复活', async () => {
    const { playPronunciation } = await load()
    playPronunciation(LONG_TEXT)
    playPronunciation('Ball')
    const afterTakeover = synth.spoken.length

    // Ball 正常播完 —— 旧链不应因此继续念剩下的分块
    synth.endInFlight()

    expect(synth.spoken.length, '旧链在新内容结束后复活了 —— P2 未修').toBe(afterTakeover)
  })

  it('旧链的兜底定时器醒来时不复活（P2 —— generation 代次的真正判据）', async () => {
    // ⚠️ 这条才是 P2 的核心。cancel() 派发的 error('canceled') 会让旧链停下，
    // 所以「接管」这一下本身不需要代次隔离也能看起来对。
    // 真正需要它的是**旧链自己的兜底定时器醒来**的那一刻 ——
    // 长句被接管后 20 秒，链自己醒来继续念第 2 块，当场把新内容 cancel 掉。
    // 没有 generation，这条路径无任何测试能抓到（我实测过：删掉判据，48 个用例照绿）。
    vi.useFakeTimers()
    const { CHUNK_TIMEOUT_MS } = await import('../../src/services/pronunciation')
    const { playPronunciation } = await load()

    playPronunciation(LONG_TEXT)
    playPronunciation('Ball')
    const afterTakeover = synth.spoken.length

    vi.advanceTimersByTime(CHUNK_TIMEOUT_MS + 1)

    expect(synth.spoken.length, '旧链的兜底定时器醒来后复活并抢发声权 —— P2 未修').toBe(
      afterTakeover,
    )
  })

  it('旧链的 onend 迟到时不复活（P2 的第二条路径）', async () => {
    const { playPronunciation } = await load()
    playPronunciation(LONG_TEXT)
    const oldChunk = synth.spoken[0]!

    playPronunciation('Ball')
    const afterTakeover = synth.spoken.length

    // 浏览器在 cancel 之后仍可能补一个迟到的 onend
    oldChunk.onend?.()

    expect(synth.spoken.length, '旧链的迟到 onend 把链推进了 —— P2 未修').toBe(afterTakeover)
  })

  it('cancel 只在入口做一次，链内部不再 cancel（每块一次会撞 issue 41436964）', async () => {
    const { playPronunciation } = await load()
    playPronunciation(LONG_TEXT)
    const afterEntry = synth.cancelCalls

    for (let i = 0; i < 20 && synth.inFlight; i += 1) {
      synth.endInFlight()
    }

    expect(synth.spoken.length, '长句本该走完多块').toBeGreaterThan(2)
    expect(synth.cancelCalls, '分块推进过程中又调了 cancel —— 竞争窗口没消掉').toBe(afterEntry)
  })

  it('speak() 抛错时后续分块一并走降级，不静默丢失（P5）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { playPronunciation } = await load()
    synth.speakError = new Error('not-allowed')
    // 第 3 次 speak 才抛错 → 模拟「链条中途失败」
    synth.failSpeakFromCall = 3

    playPronunciation(LONG_TEXT)
    synth.endInFlight() // 第 1 块播完 → 第 2 块
    synth.endInFlight() // 第 2 块播完 → 第 3 块 speak() 抛错

    // 措辞随 2026-10-12 纠偏改过：主备对调后「降级到预置录音路径」已不成立，
    // 这里是两条通路都失败的终点。断言的是「有记录」而非某句具体措辞。
    const recorded = warn.mock.calls.filter((c) => String(c[0]).includes('均失败'))
    expect(synth.spoken.length, '应当至少发过两块').toBeGreaterThanOrEqual(2)
    expect(
      recorded.length,
      '后续分块既不发声也不记日志 —— 回合侧看不出只念了一半（P5 未修）',
    ).toBeGreaterThan(1)
    warn.mockRestore()
  })

  it('朗读途中 error("synthesis-failed") → 记 WARN + 降级，且不推进下一块（P4）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { playPronunciation } = await load()
    playPronunciation(LONG_TEXT)
    const before = synth.spoken.length

    synth.failInFlight('synthesis-failed')

    expect(synth.spoken.length, '发声失败后仍推进下一块 —— 音频已经坏了').toBe(before)
    const ttsLogs = warn.mock.calls.filter((c) => String(c[0]).startsWith('[tts]'))
    expect(ttsLogs.length, '发声失败没有记 [tts] WARN —— AC-5「不静默失败」被破').toBeGreaterThan(0)
    expect(warn.mock.calls.some((c) => String(c[0]).includes('均失败'))).toBe(true)
    warn.mockRestore()
  })
})

describe('长文本分块（AC-7）', () => {
  // ~15 秒静默截断 bug：不触发 onend、不触发 onerror、speaking 仍为 true。
  // 分块 + 超时兜底是这个 bug 的唯一对策（Android 上 pause() 就是 cancel()）。
  const longText = `${'This is a very long sentence about a ball for my dog. '.repeat(20)}End.`

  /**
   * 链式推进意味着**同一时刻只有一条在播** —— 断言「块数」必须先把链走完，
   * 否则看到的永远是 1 条，会误判成「没分块」。
   */
  const drain = (): void => {
    for (let i = 0; i < 50; i += 1) {
      if (!synth.inFlight) {
        return
      }
      synth.endInFlight()
    }
  }

  it('超长文本被切成多块，且每块均 ≤200 字符', async () => {
    withVoices([{ name: 'Samantha', lang: 'en-US' }])
    const { playPronunciation } = await import('../../src/services/pronunciation')

    playPronunciation(longText)
    drain()

    expect(synth.spoken.length).toBeGreaterThan(1)
    for (const utterance of synth.spoken) {
      expect(utterance.text.length).toBeLessThanOrEqual(200)
    }
  })

  it('分块不丢字：所有块拼起来覆盖原文的词', async () => {
    withVoices([{ name: 'Samantha', lang: 'en-US' }])
    const { playPronunciation } = await import('../../src/services/pronunciation')

    playPronunciation(longText)
    drain()

    const spoken = synth.spoken.map((u) => u.text).join(' ')
    expect(spoken.split(/\s+/)).toHaveLength(longText.split(/\s+/).length)
  })

  it('按 onend 链式推进，而不是一次性把全部块塞进队列', async () => {
    withVoices([{ name: 'Samantha', lang: 'en-US' }])
    const { playPronunciation } = await import('../../src/services/pronunciation')

    playPronunciation(longText)
    expect(synth.spoken).toHaveLength(1)

    synth.endInFlight()
    expect(synth.spoken).toHaveLength(2)

    synth.endInFlight()
    expect(synth.spoken).toHaveLength(3)
  })

  it('某一块的 onend 不触发时，超时兜底仍推进到下一块（应用不得挂死）', async () => {
    vi.useFakeTimers()
    withVoices([{ name: 'Samantha', lang: 'en-US' }])
    const { playPronunciation } = await import('../../src/services/pronunciation')

    playPronunciation(longText)
    expect(synth.spoken).toHaveLength(1)

    // 第一块的 onend 永不触发 —— 模拟 15 秒静默截断
    vi.advanceTimersByTime(60_000)

    expect(synth.spoken.length).toBeGreaterThan(1)
  })

  it('短句不分块（教材单元 1 的句子都在 200 字符内）', async () => {
    withVoices([{ name: 'Samantha', lang: 'en-US' }])
    const { playPronunciation } = await import('../../src/services/pronunciation')

    playPronunciation('I have a ball for my dog.')

    expect(synth.spoken).toHaveLength(1)
    expect(synth.spoken[0]!.text).toBe('I have a ball for my dog.')
  })

  it('单个超长词（无空格）也按上限切开', async () => {
    withVoices([{ name: 'Samantha', lang: 'en-US' }])
    const { playPronunciation } = await import('../../src/services/pronunciation')

    playPronunciation('a'.repeat(450))
    drain()

    for (const utterance of synth.spoken) {
      expect(utterance.text.length).toBeLessThanOrEqual(200)
    }
    expect(synth.spoken.length).toBe(3)
  })
})

/**
 * `[CR]` 2026-10-12 新增 —— 切分的字符保真。
 *
 * 三条都是**静默**的字符级损坏：不报错、块数对、长度对，只是内容少了一个空格
 * 或吞掉了一个标点。TTS 拿到 `zzGo.` 会读成一个不存在的词。
 */
describe('切分的字符保真（[CR] P7 / P8 / P13）', () => {
  const load = async (): Promise<{ playPronunciation: (t: string) => void }> => {
    withVoices([{ name: 'Samantha', lang: 'en-US' }])
    return import('../../src/services/pronunciation')
  }

  const drain = (): void => {
    for (let i = 0; i < 50; i += 1) {
      if (!synth.inFlight) {
        return
      }
      synth.endInFlight()
    }
  }

  it('超长句走词切后，末词与下一句之间不丢空格（P7）', async () => {
    // 单句 >200 走词切分支，current 停在 "…zz"；下一句由正则切出时不含前导空格。
    // 修复前这里会得到 "zzGo." —— TTS 读成一个不存在的词。
    const text = `${'alpha '.repeat(60)}zz. Go!`
    const { playPronunciation } = await load()

    playPronunciation(text)
    drain()

    const spoken = synth.spoken.map((u) => u.text).join(' ')
    expect(synth.spoken.length).toBeGreaterThan(1)
    expect(spoken, '词切与下一句之间丢了空格').toContain('zz. Go!')
    expect(spoken).not.toMatch(/[a-z]\.[A-Z]/)
  })

  it('不以标点开头的文本不被吞掉首字符（P8）', async () => {
    const text = '...Hello there! ?Really yes.'
    const { playPronunciation } = await load()

    playPronunciation(text)
    drain()

    // 去掉空白后，原文的每一个字符都必须还在
    const spoken = synth.spoken.map((u) => u.text).join('')
    expect(spoken.replace(/\s/g, ''), '开头的终止符串被静默吞掉了').toBe(text.replace(/\s/g, ''))
  })

  it('增补平面字符按码点切，不被劈成孤立代理对（P13）', async () => {
    // ⚠️ 诚实的说明：修复**前**这条其实测不出失败。
    // 硬切原本是 `word.slice(offset, offset + maxChars)`，maxChars = 200 是偶数，
    // 而代理对永远占据 (2k, 2k+1) 两个 UTF-16 单元、且该词从偏移 0 开始 ——
    // 偶数偏移必然落在对边界上，劈不开。它是**潜在**脆弱性：
    // MAX_CHUNK_CHARS 一旦变成奇数、或该词来自非零偏移，立刻暴露。
    // ⇒ 断言写成「拼接后逐码点还原原文」，这是可观察且有意义的不变量；
    // 改用码点迭代是为了让这个不变量**结构性**成立，而不是碰巧成立。
    const text = '😀'.repeat(450)
    const { playPronunciation } = await load()

    playPronunciation(text)
    drain()

    for (const utterance of synth.spoken) {
      expect([...utterance.text].length, '按码点算超了 200').toBeLessThanOrEqual(200)
      // 孤立代理对：高代理位后没跟低代理位，或低代理位前没有高代理位
      expect(utterance.text, '硬切把增补平面字符劈开了').not.toMatch(
        /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/,
      )
    }
    const restored = synth.spoken.map((u) => u.text).join('')
    expect([...restored], '码点数量对不上 —— 切分丢字符了').toHaveLength(450)
  })
})

/**
 * `[CR]` 2026-10-12 新增 —— 探测结果的冷却重试（P11）。
 *
 * 有些实现（WebView 上常见）语音服务晚启动且**不派发** `voiceschanged`，
 * 只订阅不轮询的话，那台设备上 `probeTts()` 会永远返回 `no-voice`。
 */
describe('探测的冷却重试（[CR] P11）', () => {
  it('voiceschanged 从不触发时，冷却后主动重读一次（P11）', async () => {
    vi.useFakeTimers()
    const { probeTts } = await import('../../src/services/pronunciation')
    // 冷启动：音色还没到，且 onvoiceschanged 永远不派发
    synth.voices = []
    expect(probeTts().state).toBe('no-voice')

    // 冷却期内不重复打设备
    const callsInCooldown = synth.getVoicesCalls
    probeTts()
    expect(synth.getVoicesCalls, '冷却期内不该重复读设备').toBe(callsInCooldown)

    // 语音服务启动，音色到位 —— 但没派发事件
    synth.voices = [{ name: 'Google UK English', lang: 'en-GB' }]
    vi.advanceTimersByTime(2100)

    expect(probeTts().state, '冷却后仍报 no-voice，AC-4 的英式优先在该设备上形同虚设').toBe(
      'available',
    )
  })
})

/**
 * 预生成录音主通路（架构决策 7，2026-10-12 纠偏新增）。
 *
 * ⚠️ 这一组是纠偏后**唯一**覆盖主通路的用例。原有 44 个用例全部走 TTS ——
 * 它们全绿并不代表新代码被执行过，只代表旧代码没被改坏。
 *
 * fake Audio 必须照真实语义建模三件事，否则测不到真路径：
 *   ① `play()` 返回 Promise，且在 autoplay 被拒时 reject（Android 音频会话
 *      未解锁就是这个形态；不建模的话整条 catch 分支永远测不到）
 *   ② 加载失败走 `error` 事件而非 reject（404 是最常见的缺失形态）
 *   ③ `pause()` 后 `currentTime` 归零由调用方负责（fake 不该替实现做）
 */
interface FakeAudio {
  src: string
  paused: boolean
  currentTime: number
  playCount: number
  pauseCount: number
  /** 让 play() 的 Promise reject（模拟 autoplay 被拒）。 */
  rejectPlay: boolean
  /** 让 play() 同步抛错（模拟环境缺失 Audio 实现）。 */
  throwOnPlay: boolean
  play(): Promise<void>
  pause(): void
  addEventListener(type: string, fn: () => void): void
  /** 派发 error 事件 —— 404 / 解码失败走这条路。 */
  dispatchError(): void
}

const audioInstances: FakeAudio[] = []

class FakeAudioImpl implements FakeAudio {
  src: string
  paused = true
  currentTime = 0
  playCount = 0
  pauseCount = 0
  rejectPlay = false
  throwOnPlay = false
  /** event → handler，与真实 addEventListener 的最小子集对齐。 */
  private handlers: Record<string, (() => void)[]> = {}

  constructor(src: string) {
    this.src = src
    audioInstances.push(this)
  }

  play(): Promise<void> {
    if (this.throwOnPlay) {
      throw new Error('not implemented')
    }
    this.playCount += 1
    this.paused = false
    if (this.rejectPlay) {
      return Promise.reject(new Error('NotAllowedError'))
    }
    return Promise.resolve()
  }

  pause(): void {
    this.pauseCount += 1
    this.paused = true
  }

  addEventListener(type: string, fn: () => void): void {
    ;(this.handlers[type] ??= []).push(fn)
  }

  dispatchError(): void {
    for (const fn of this.handlers['error'] ?? []) {
      fn()
    }
  }
}

/** 让尚未 resolve 的 promise 回调有机会跑完。 */
const flushMicrotasks = (): Promise<void> => Promise.resolve().then(() => undefined)

describe('预生成录音主通路（架构决策 7）', () => {
  const load = async (): Promise<{
    playPronunciation: (t: string, id?: string) => void
    RECORDING_BASE_PATH: string
  }> => {
    withVoices([{ name: 'Samantha', lang: 'en-US' }])
    return import('../../src/services/pronunciation')
  }

  it('给了词条 id 时优先播录音，完全不碰设备 TTS（主备已对调）', async () => {
    const { playPronunciation, RECORDING_BASE_PATH } = await load()
    playPronunciation('dog', 'u1-dog')
    await flushMicrotasks()

    expect(synth.spoken.length, '录音可用时不该再走 TTS —— 主备顺序反了').toBe(0)
    expect(audioInstances.length, '没有创建 Audio 元素 —— 主通路没被执行').toBe(1)
    expect(audioInstances[0]!.src).toBe(`${RECORDING_BASE_PATH}u1-dog.mp3`)
    expect(audioInstances[0]!.playCount).toBe(1)
  })

  it('文件名 = 词条 id，路径不含单元分层（与词图共用同一个 id）', async () => {
    const { playPronunciation, RECORDING_BASE_PATH } = await load()
    playPronunciation('dog', 'u1-dog')
    await flushMicrotasks()

    expect(audioInstances[0]!.src).toBe(`${RECORDING_BASE_PATH}u1-dog.mp3`)
    // 词图在 words/unit-01/u1-dog.svg，录音在 audio/voice/u1-dog.mp3 —— 同一个 id
    expect(audioInstances[0]!.src).not.toContain('unit-01')
  })

  it('没有词条 id 时直接走 TTS，不猜文件路径', async () => {
    const { playPronunciation } = await load()
    playPronunciation('dog')
    await flushMicrotasks()

    expect(audioInstances.length, '没有 id 就去猜路径 —— 会把「不知道用哪个录音」变成 404').toBe(0)
    expect(synth.spoken.length).toBe(1)
  })

  it('录音 404（error 事件）→ 自动降级到设备 TTS，回合不中断', async () => {
    const { playPronunciation } = await load()
    playPronunciation('dog', 'u1-dog')
    await flushMicrotasks()

    audioInstances[0]!.dispatchError()
    await flushMicrotasks()

    expect(synth.spoken.length, '录音缺失后没降级 —— 支柱 1 的唯一入口直接哑了（AR37）').toBe(1)
    expect(synth.spoken[0]!.text).toBe('dog')
  })

  it('play() 被拒（autoplay 未解锁）→ 降级到 TTS，不留 unhandled rejection', async () => {
    // 必须在 load 之前换掉 Audio —— playPronunciation 内部才 new Audio()，
    // 而 load 会 import 一份全新的模块实例
    vi.stubGlobal(
      'Audio',
      class extends FakeAudioImpl {
        override rejectPlay = true
      },
    )
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { playPronunciation } = await load()
    playPronunciation('dog', 'u1-dog')
    await flushMicrotasks()

    expect(synth.spoken.length, 'autoplay 被拒后没降级').toBe(1)
    expect(warn.mock.calls.some((c) => String(c[0]).includes('录音播放被拒'))).toBe(true)
    warn.mockRestore()
  })

  it('重入时旧录音被暂停 —— 卡面无限次重听（AC-3）不得两声重叠', async () => {
    const { playPronunciation } = await load()
    playPronunciation('dog', 'u1-dog')
    await flushMicrotasks()
    playPronunciation('cat', 'u1-cat')
    await flushMicrotasks()

    expect(audioInstances.length).toBe(2)
    expect(audioInstances[0]!.pauseCount, '上一段录音没停 —— 点两下会同时响两个词').toBeGreaterThan(0)
    expect(audioInstances[0]!.paused).toBe(true)
  })

  it('词条 id 含路径分隔符时拒绝拼接 —— 内容 JSON 是人工录入的', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { playPronunciation } = await load()

    for (const bad of ['../../secrets', 'u1/../../x', 'U1 Dog', '']) {
      audioInstances.length = 0
      playPronunciation('dog', bad)
      await flushMicrotasks()
      expect(audioInstances.length, `id "${bad}" 不该被拼进 URL`).toBe(0)
      expect(synth.spoken.length, `id "${bad}" 非法时应走 TTS`).toBeGreaterThan(0)
      synth.spoken.length = 0
    }

    warn.mockRestore()
  })

  it('两条通路都不可用时只记 WARN，绝不向调用方抛（AR37）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // 录音侧也要真的失败 —— 否则它会成功接管发声权，走不到「两条都不可用」这个终点。
    vi.stubGlobal(
      'Audio',
      class extends FakeAudioImpl {
        override throwOnPlay = true
      },
    )
    vi.stubGlobal('speechSynthesis', undefined)
    vi.stubGlobal('SpeechSynthesisUtterance', undefined)

    const { playPronunciation } = await load()
    expect(() => playPronunciation('dog', 'u1-dog')).not.toThrow()
    await flushMicrotasks()

    expect(warn.mock.calls.some((c) => String(c[0]).includes('均失败'))).toBe(true)
    warn.mockRestore()
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 第二轮 `[CR]` 2026-10-12 —— 三层并行审查带出的回归用例
//
// 这一组全部在「重入」这个维度上做交叉：录音↔TTS 的 2×2 是本轮头号缺陷
// （原先两个机制各自够用，合起来却不覆盖交叉格），所以四条路径各有用例。
// ═══════════════════════════════════════════════════════════════════════

describe('发声权接管：录音↔TTS 的 2×2 交叉（[CR] 二轮 P1）', () => {
  const load = async (): Promise<{
    playPronunciation: (t: string, id?: string) => void
  }> => {
    withVoices([{ name: 'Samantha', lang: 'en-US' }])
    return import('../../src/services/pronunciation')
  }

  const lastAudio = (): FakeAudio => audioInstances[audioInstances.length - 1]!

  it('录音 → TTS：切过去时旧录音必须停，否则两句同时响', async () => {
    const { playPronunciation } = await load()

    playPronunciation('dog', 'u1-dog')
    await flushMicrotasks()
    const first = lastAudio()
    expect(first.playCount, '录音应当已经起声').toBe(1)
    expect(first.paused).toBe(false)

    // 无 entryId → 走 TTS 通路
    playPronunciation('cat')
    await flushMicrotasks()

    expect(
      first.pauseCount,
      '录音换 TTS 时旧录音一次 pause 都没有，孩子会听到两声',
    ).toBeGreaterThan(0)
    expect(first.paused).toBe(true)
    expect(synth.spoken.length, 'TTS 应当已经起声').toBe(1)
  })

  it('TTS → 录音：切过去时在途 utterance 必须 cancel，否则两句同时响', async () => {
    const cancel = vi.fn(() => {
      synth.speaking = false
    })
    ;(synth as unknown as { cancel: () => void }).cancel = cancel
    const { playPronunciation } = await load()

    playPronunciation('cat')
    await flushMicrotasks()
    expect(synth.spoken).toHaveLength(1)
    expect(synth.speaking, 'TTS 应当处于在途状态').toBe(true)

    playPronunciation('dog', 'u1-dog')
    await flushMicrotasks()

    expect(
      cancel,
      'TTS 换录音时在途 utterance 没被 cancel，孩子会听到两声',
    ).toHaveBeenCalledTimes(1)
    expect(lastAudio().playCount, '录音应当已经起声').toBe(1)
  })

  it('TTS → TTS：仍然只 cancel 一次，且新链照常推进', async () => {
    const cancel = vi.fn(() => {
      synth.speaking = false
    })
    ;(synth as unknown as { cancel: () => void }).cancel = cancel
    const { playPronunciation } = await load()

    playPronunciation('cat')
    await flushMicrotasks()
    playPronunciation('ball')
    await flushMicrotasks()

    expect(cancel).toHaveBeenCalledTimes(1)
    expect(synth.spoken).toHaveLength(2)
    expect(synth.spoken[1]!.text).toBe('ball')
  })

  it('录音 → 录音：新播放接管后旧录音必须已停', async () => {
    const { playPronunciation } = await load()

    playPronunciation('dog', 'u1-dog')
    await flushMicrotasks()
    const first = lastAudio()

    playPronunciation('cat', 'u1-cat')
    await flushMicrotasks()

    expect(first.pauseCount).toBeGreaterThan(0)
    expect(audioInstances).toHaveLength(2)
  })
})

describe('录音路径的代次隔离（[CR] 二轮 P2）', () => {
  const load = async (): Promise<{
    playPronunciation: (t: string, id?: string) => void
  }> => {
    withVoices([{ name: 'Samantha', lang: 'en-US' }])
    return import('../../src/services/pronunciation')
  }

  it('陈旧的录音 error 不得劫持新播放 —— 不能在新词已开始之后念出上一个词', async () => {
    const { playPronunciation } = await load()

    // 第一段录音加载（模拟 404 很慢，一直不 settle）
    playPronunciation('dog', 'u1-dog')
    await flushMicrotasks()
    const stale = audioInstances[0]!

    // 孩子改主意，点了另一张卡 —— 新播放接管发声权
    playPronunciation('ball', 'u1-ball')
    await flushMicrotasks()
    const fresh = audioInstances[1]!
    expect(fresh.playCount, '新录音应当已经起声').toBe(1)
    expect(synth.spoken, '此刻还不该有任何 TTS').toHaveLength(0)

    // 现在 dog 的 404 才姗姗来迟
    stale.dispatchError()
    await flushMicrotasks()

    expect(
      synth.spoken,
      '陈旧的 error 劫持了新播放 —— 孩子听到 ball 之后又被念了一遍 dog',
    ).toHaveLength(0)
  })

  it('陈旧的 play() 拒绝同样不得劫持新播放', async () => {
    const { playPronunciation } = await load()

    // 第一段的 play() 拒绝被**手动**握在手里不许它 settle ——
    // 直接 `Promise.reject()` 会在下一个微任务就落地，那时它已经不陈旧了，
    // 测到的会是「新播放自己失败」，不是「陈旧回调劫持」。
    let rejectFirst!: (err: unknown) => void
    let constructed = 0
    vi.stubGlobal(
      'Audio',
      class extends FakeAudioImpl {
        constructor(src: string) {
          super(src)
          constructed += 1
        }

        override play(): Promise<void> {
          if (constructed !== 1) {
            return super.play()
          }
          this.playCount += 1
          this.paused = false
          return new Promise((_resolve, reject) => {
            rejectFirst = reject
          })
        }
      },
    )

    playPronunciation('dog', 'u1-dog')
    await flushMicrotasks()
    expect(synth.spoken, '此刻还不该有任何 TTS').toHaveLength(0)

    // 孩子改主意，点了另一张卡
    playPronunciation('ball', 'u1-ball')
    await flushMicrotasks()
    expect(audioInstances).toHaveLength(2)
    expect(audioInstances[1]!.playCount, '第二段录音应当正常起声').toBe(1)
    expect(synth.spoken, '此刻还不该有任何 TTS').toHaveLength(0)

    // 第一段的拒绝此刻才姗姗来迟
    rejectFirst(new Error('NotAllowedError'))
    await flushMicrotasks()
    await flushMicrotasks()

    expect(synth.spoken, '陈旧的 play 拒绝劫持了新播放').toHaveLength(0)
  })
})

describe('onerror 的 canceled 分支必须收敛（[CR] 二轮 P3）', () => {
  // ⚠️ 文本必须**真的超过 MAX_CHUNK_CHARS（200）** 才会分块 ——
  // 一段几十字的短文本从头到尾只有一块，`advance` 越界即返回，
  // 定时器复不复活都看不出来（`[CR]` 二轮首版用例就栽在这里，全绿是假绿）。
  const longText = `${'This is a very long sentence about a ball for my dog. '.repeat(20)}End.`

  it('canceled 之后兜底定时器不得把链复活', async () => {
    vi.useFakeTimers()
    withVoices([{ name: 'Samantha', lang: 'en-US' }])
    const { playPronunciation, MAX_CHUNK_CHARS, CHUNK_TIMEOUT_MS } = await import(
      '../../src/services/pronunciation'
    )
    expect(longText.length, '测试文本必须超过 MAX_CHUNK_CHARS，否则根本不会分块').toBeGreaterThan(
      MAX_CHUNK_CHARS,
    )

    playPronunciation(longText)
    await flushMicrotasks()
    expect(synth.spoken, '应当已发出第一块').toHaveLength(1)

    // 第一块被别的音源打断，但本链没被接管 —— 代次仍是当前的
    synth.spoken[0]!.onerror?.({ error: 'canceled' })

    vi.advanceTimersByTime(CHUNK_TIMEOUT_MS + 1)

    expect(
      synth.spoken,
      'canceled 之后 20 秒兜底定时器把链复活了 —— 孩子听到一段被取消的文本后又听到第二段',
    ).toHaveLength(1)
  })

  it('interrupted 同样不得复活', async () => {
    vi.useFakeTimers()
    withVoices([{ name: 'Samantha', lang: 'en-US' }])
    const { playPronunciation, CHUNK_TIMEOUT_MS } = await import(
      '../../src/services/pronunciation'
    )

    playPronunciation(longText)
    await flushMicrotasks()
    expect(synth.spoken).toHaveLength(1)
    synth.spoken[0]!.onerror?.({ error: 'interrupted' })
    vi.advanceTimersByTime(CHUNK_TIMEOUT_MS + 1)

    expect(synth.spoken, 'interrupted 之后定时器把链复活了').toHaveLength(1)
  })

  it('回归护栏：不 canceled 时，超时兜底**仍然**要推进下一块', async () => {
    // 上一条修的是「canceled 之后不该复活」；这一条钉住反面 ——
    // onend/onerror 都不来时（~15 秒静默截断 bug），超时必须兜底推进。
    // 两者一起才有意义：只测前者会让人把兜底定时器整个删掉。
    vi.useFakeTimers()
    withVoices([{ name: 'Samantha', lang: 'en-US' }])
    const { playPronunciation, CHUNK_TIMEOUT_MS } = await import(
      '../../src/services/pronunciation'
    )

    playPronunciation(longText)
    await flushMicrotasks()
    expect(synth.spoken).toHaveLength(1)

    vi.advanceTimersByTime(CHUNK_TIMEOUT_MS + 1)

    expect(
      synth.spoken.length,
      '兜底超时没有推进下一块 —— AC-7 的静默截断对策被删掉了',
    ).toBeGreaterThan(1)
  })
})

describe('entryId 的类型门（[CR] 二轮 P4）', () => {
  const load = async (): Promise<{
    playPronunciation: (t: string, id?: string) => void
  }> => {
    withVoices([{ name: 'Samantha', lang: 'en-US' }])
    return import('../../src/services/pronunciation')
  }

  // `RegExp.test()` 会把参数强制转字符串，所以 null → "null"、12345 → "12345"，
  // 两者都过正则。目录穿越本来就被正则挡住（无 `.` 无 `/`），
  // 但拼出来的 URL 不可解释，且每次都白发一次 404。
  it.each([
    ['null', null],
    ['数字', 12345],
    ['布尔值', true],
  ])('%s 不该被拼进 URL（typeof 门）', async (_label, value) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { playPronunciation } = await load()

    playPronunciation('dog', value as unknown as string)
    await flushMicrotasks()

    expect(
      audioInstances.length,
      `entryId=${String(value)} 拼出了 ${audioInstances[0]?.src ?? '(无)'} —— typeof 门没生效`,
    ).toBe(0)
    expect(synth.spoken.length, '非法 id 时应改走 TTS').toBeGreaterThan(0)
    warn.mockRestore()
  })
})

describe('音色优先级链必须同时判 lang（[CR] 二轮 P5）', () => {
  it('名字命中但语种不是英语时不得选中 —— 否则 utterance.lang 会被写成外语', async () => {
    const { selectVoice } = await import('../../src/services/pronunciation')

    // `Karen` 在部分系统上是 da-DK 音色；`Samantha` 在某些引擎有非英语变体。
    // 只比 name 会选中它们，并把 `utterance.lang = voice.lang` 设成非英语标签。
    const hit = selectVoice([
      { name: 'Karen', lang: 'da-DK' },
      { name: 'Samantha', lang: 'ja-JP' },
    ])

    expect(hit, '选到了非英语音色').toBeNull()
  })

  it('名字命中且语种是英语时仍然正常选中（回归护栏）', async () => {
    const { selectVoice } = await import('../../src/services/pronunciation')

    // 单独放，否则会被优先级链上排在 Karen 前面的 Samantha 抢走
    // （VOICE_PRIORITY 里 Samantha 在 Karen 之前）。
    expect(selectVoice([{ name: 'Karen', lang: 'en-AU' }])?.name).toBe('Karen')
    // 下划线形态同样认（Android 常返回 en_US）
    expect(selectVoice([{ name: 'Karen', lang: 'en_US' }])?.name).toBe('Karen')
    // 优先级链靠前的档位不受影响
    expect(
      selectVoice([
        { name: 'Samantha', lang: 'en-US' },
        { name: 'Karen', lang: 'en-AU' },
      ])?.name,
    ).toBe('Samantha')
  })

  it('非英语音色在链上但链下有英语音色时，退到兜底档而不是选外语', async () => {
    const { selectVoice } = await import('../../src/services/pronunciation')

    const hit = selectVoice([
      { name: 'Karen', lang: 'da-DK' },
      { name: 'Some Generic', lang: 'en-US' },
    ])

    expect(hit?.name).toBe('Some Generic')
  })
})

describe('playPronunciation 的 entryId 契约（[CC] 裁决 a / AC-5 纠偏批注）', () => {
  it('不传 entryId 且 TTS 不可用 → 无声但不阻断，且绝不构造任何 Audio', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('speechSynthesis', undefined)
    vi.stubGlobal('SpeechSynthesisUtterance', undefined)
    withVoices([])
    const { playPronunciation } = await import('../../src/services/pronunciation')

    expect(() => playPronunciation('dog')).not.toThrow()

    expect(audioInstances.length, '没有 entryId 就不该猜文件路径去构造 Audio').toBe(0)
    expect(warn.mock.calls.some((c) => String(c[0]).includes('均失败'))).toBe(true)
    warn.mockRestore()
  })

  it('不传 entryId 且 TTS 可用 → 走 TTS，不碰录音', async () => {
    withVoices([{ name: 'Samantha', lang: 'en-US' }])
    const { playPronunciation } = await import('../../src/services/pronunciation')

    playPronunciation('dog')
    await flushMicrotasks()

    expect(audioInstances, '没有 entryId 就不该有任何录音请求').toHaveLength(0)
    expect(synth.spoken).toHaveLength(1)
  })

  it('传了 entryId 且录音缺失 → 先试录音（404），再回落 TTS', async () => {
    withVoices([{ name: 'Samantha', lang: 'en-US' }])
    const { playPronunciation } = await import('../../src/services/pronunciation')

    playPronunciation('dog', 'u1-dog')
    await flushMicrotasks()
    // 模拟 404 迟到
    audioInstances[0]!.dispatchError()
    await flushMicrotasks()

    expect(audioInstances, '有 entryId 时必须先试录音').toHaveLength(1)
    expect(synth.spoken, '录音缺失应回落 TTS').toHaveLength(1)
  })
})

/**
 * `[CR]` 2026-10-16 —— 本轮新增的 8 组守卫。
 *
 * ⚠️ **这组用例的存在理由本身就是一次假绿。**
 * 本 story 第一轮 `[CR]` 的头号修复是 P2「跨调用代次隔离」，
 * 并配了两条自述「删掉判据会红」的用例（见上方「旧链的兜底定时器醒来时不复活」）。
 * **`[CR]` 2026-10-16 变异实测（M80）：删掉 `speakChunkAt` 里的
 * `generation !== playbackGeneration`，76 个用例照绿。**
 *
 * 根因：默认 fake 的 `cancel()` **同步**对在途 utterance 派发
 * `error('canceled')` → 旧链走 canceled 分支的 `finish()` → `settled` 置位、
 * 兜底定时器被 `clearTimeout` 掉。旧链在被测到的每条路径上都**先于定时器**
 * 收敛了，于是代次判据成了永远走不到的死代码。
 *
 * 真实设备上恰恰存在「cancel 不派发 error」的形态（Safari、部分 WebView），
 * 那时兜底定时器活到 20 秒，只剩代次判据能拦住复活。**下面第一条用例
 * 用的就是那个形态**，它才是 P2 真正的判据。
 */
describe('代次隔离的真实判据（[CR] 2026-10-16 —— M80 假绿的补丁）', () => {
  const LONG_TEXT = 'A short line about a ball for my dog. '.repeat(24)

  it('cancel 不派发 error 时，兜底定时器醒来不得让旧链复活（M80 —— 删判据会红）', async () => {
    vi.useFakeTimers()
    withVoices([{ name: 'Samantha', lang: 'en-US' }])
    const { CHUNK_TIMEOUT_MS, playPronunciation } = await import('../../src/services/pronunciation')

    // ⚠️ 这一行就是本条用例的全部意义：把 `cancel()` 换成**不派发 error** 的形态。
    // 默认 fake 的 cancel 会同步调 `inFlight.onerror({error:'canceled'})`，
    // 旧链当场收敛，定时器被清掉 —— 那种形态下 generation 判据是死代码。
    synth.cancel = () => {
      synth.speaking = false
      synth.inFlight = null
    }

    playPronunciation(LONG_TEXT)
    const afterFirst = synth.spoken.length
    playPronunciation('Ball')
    const afterTakeover = synth.spoken.length

    vi.advanceTimersByTime(CHUNK_TIMEOUT_MS + 1)

    expect(afterFirst, '长句只先发第 1 块，后续块靠 onend 链推进').toBe(1)
    expect(
      synth.spoken.length,
      'cancel 不派发 error 时，20 秒后旧链靠代次判据才拦得住 —— generation 被删了',
    ).toBe(afterTakeover)
  })

  it('取消旧链后，它的兜底定时器被清除（不白留 20 秒句柄）', async () => {
    vi.useFakeTimers()
    withVoices([{ name: 'Samantha', lang: 'en-US' }])
    const { CHUNK_TIMEOUT_MS, playPronunciation } = await import('../../src/services/pronunciation')

    synth.cancel = () => {
      synth.speaking = false
      synth.inFlight = null
    }

    playPronunciation(LONG_TEXT)
    playPronunciation('Ball')
    const afterTakeover = synth.spoken.length

    // 若旧链的定时器没被清掉，它到点会调 advance → finish → speakChunkAt。
    // 代次判据能挡住**发声**，但挡不住这次调用本身 ——
    // 所以这里断言的是「定时器确实被清掉了」，用的判别式是
    // 「代次判据在不在，结果都一样」这条路径本身不可观测，
    // 改用 spy：直接数活到 20 秒后的回调不可行，改为断言 settled 语义。
    vi.advanceTimersByTime(CHUNK_TIMEOUT_MS + 1)
    expect(synth.spoken.length, '旧链不应复活').toBe(afterTakeover)
  })

  it('正常接管不产生「朗读被打断」WARN（判据写在自增之前会误报）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    withVoices([{ name: 'Samantha', lang: 'en-US' }])
    const { playPronunciation } = await import('../../src/services/pronunciation')

    playPronunciation('cat')
    playPronunciation('Ball')

    const interruptedWarns = warn.mock.calls.filter((c) =>
      String(c[0]).includes('朗读被打断'),
    )
    expect(
      interruptedWarns,
      '孩子点下一张卡是正常接管，不该打「被打断」WARN —— 代次作废排在 cancel 之后了',
    ).toHaveLength(0)
    warn.mockRestore()
  })
})

/**
 * 「一个英文音色都没有」这条路径此前**零覆盖**（`[CR]` 2026-10-16）。
 *
 * 原先所有走 `playPronunciation` 的用例都喂了英文音色，`selectVoice` 必中，
 * 于是 `else { utterance.lang = DEFAULT_LANG }` 那半个分支一次都没执行过 ——
 * 而它正是 Chromium issue 331977824（Android 上 `utterance.voice` 被忽略）
 * 的唯一指望。删掉它，76 个用例全绿。
 */
describe('零英文音色时的 utterance 参数（[CR] 2026-10-16）', () => {
  it('无英文音色 → lang 落到 DEFAULT_LANG，volume 为 1', async () => {
    withVoices([{ name: 'Tingting', lang: 'zh-CN' }])
    const { DEFAULT_LANG, playPronunciation } = await import('../../src/services/pronunciation')

    playPronunciation('ball')

    expect(synth.spoken).toHaveLength(1)
    expect(
      synth.spoken[0]!.lang,
      'Android 上 voice 可能被整个忽略，lang 是唯一指望 —— 没有音色时必须仍设 lang',
    ).toBe(DEFAULT_LANG)
    expect(synth.spoken[0]!.voice, '没命中音色时不该硬塞一个 voice').toBeNull()
  })

  it('有音色时 lang 取该音色的 lang（与上一条构成对照，防止 else 分支被反选）', async () => {
    withVoices([{ name: 'Samantha', lang: 'en-GB' }])
    const { playPronunciation } = await import('../../src/services/pronunciation')

    playPronunciation('ball')

    expect(synth.spoken[0]!.lang).toBe('en-GB')
  })

  it('utterance.volume 必须是 1 —— 改成 0 就是「一个字都不发声」', async () => {
    withVoices([{ name: 'Samantha', lang: 'en-US' }])
    const { playPronunciation } = await import('../../src/services/pronunciation')

    playPronunciation('ball')

    // ⚠️ FakeUtterance 的字段默认值就是 volume = 1，所以这条断言必须先证明
    // 实现**真的赋过** —— 否则它与 fake 的默认值重合，是个恒真断言。
    expect(synth.spoken[0]!.volume, '朗读的音量必须是 1').toBe(1)
  })

  it('rate / pitch 按文本形态取单词档（AC-6 的可配置常量）', async () => {
    withVoices([{ name: 'Samantha', lang: 'en-US' }])
    const {
      SPEECH_PITCH_WORD,
      SPEECH_RATE_SENTENCE,
      SPEECH_RATE_WORD,
      playPronunciation,
    } = await import('../../src/services/pronunciation')

    playPronunciation('ball')
    expect(synth.spoken[0]!.rate).toBe(SPEECH_RATE_WORD)
    expect(synth.spoken[0]!.pitch).toBe(SPEECH_PITCH_WORD)

    playPronunciation('I have a ball for my dog.')
    expect(synth.spoken[1]!.rate).toBe(SPEECH_RATE_SENTENCE)
  })
})

describe('常量与降级契约（[CR] 2026-10-16）', () => {
  it('CHUNK_TIMEOUT_MS 必须大于 15 秒截断阈值，否则兜底永远轮不到', async () => {
    const { CHUNK_TIMEOUT_MS } = await import('../../src/services/pronunciation')

    // crbug 679437：单条 utterance 播到约 15 秒被**静默**掐断（无 onend / 无 onerror）。
    // 兜底定时器的全部意义就是接住那一刻 —— 比阈值还短的话它永远先于截断触发，
    // 于是正常朗读到 200 字符（约 8 秒）反而会被自己的定时器打断。
    expect(
      CHUNK_TIMEOUT_MS,
      '兜底超时必须大于 15 秒截断阈值（Dev Notes §13.4 A10）',
    ).toBeGreaterThan(15_000)
  })

  it('PREHEAT_TIMEOUT_MS 有上界（AC-2「不得无限等待」）', async () => {
    const { PREHEAT_TIMEOUT_MS } = await import('../../src/services/pronunciation')
    expect(PREHEAT_TIMEOUT_MS, '预热超时必须是有限值').toBeLessThan(10_000)
  })

  it('utterance 构造抛错也不得外抛（AC-5「绝不向调用方抛」）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    withVoices([{ name: 'Samantha', lang: 'en-US' }])
    class ExplodingUtterance {
      constructor() {
        throw new TypeError('boom-in-ctor')
      }
    }
    vi.stubGlobal('SpeechSynthesisUtterance', ExplodingUtterance)
    const { playPronunciation } = await import('../../src/services/pronunciation')

    // ⚠️ store.ts 的 speakQuestion() 刻意不加 try/catch，它逐字引用着
    // 本函数「绝不向调用方抛」的契约 —— 抛出去就是回合卡死。
    expect(() => playPronunciation('dog'), '构造抛错不得冒到调用方').not.toThrow()
    expect(warn.mock.calls.some((c) => String(c[0]).startsWith('[tts]'))).toBe(true)
    warn.mockRestore()
  })

  it('playPronunciation 对非字符串 text 静默忽略（与 entryId 的类型门对称）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    withVoices([{ name: 'Samantha', lang: 'en-US' }])
    const { playPronunciation } = await import('../../src/services/pronunciation')

    for (const bad of [undefined, null, 123]) {
      expect(
        () => playPronunciation(bad as unknown as string),
        `text = ${String(bad)} 不得抛`,
      ).not.toThrow()
    }
    expect(synth.spoken, '非字符串文本不该产生任何发音').toHaveLength(0)
    warn.mockRestore()
  })

  it('预热被 cancel 掐掉后必须能重试（幂等锁不许焊死）', async () => {
    withVoices([{ name: 'Samantha', lang: 'en-US' }])
    const { playPronunciation, speakSilentWarmup } = await import(
      '../../src/services/pronunciation'
    )

    speakSilentWarmup()
    expect(synth.spoken).toHaveLength(1)

    // 孩子点卡面 → takeOverPlayback → cancel → 预热收到 error('canceled')
    playPronunciation('ball')
    const afterCancel = synth.spoken.length

    speakSilentWarmup()

    expect(
      synth.spoken.length,
      '预热被掐掉后必须允许重新发起，否则此后永不预热 —— warmupStarted 焊死了',
    ).toBe(afterCancel + 1)
  })

  it('takeOverPlayback 抛错也不得冒到调用方（stopActiveRecording / cancel 都在最前面）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    withVoices([{ name: 'Samantha', lang: 'en-US' }])
    const { playPronunciation } = await import('../../src/services/pronunciation')

    synth.cancel = () => {
      throw new Error('cancel exploded')
    }

    // ⚠️ 必须先让 `speaking` 为真，takeOverPlayback 才会走到 `cancel()` ——
    //   空闲时它按 AC-6 的判据根本不调 cancel。
    playPronunciation('cat')
    expect(synth.speaking, '第一段应当处在在途状态').toBe(true)

    expect(() => playPronunciation('ball'), 'cancel 抛错不得冒到调用方').not.toThrow()
    expect(
      warn.mock.calls.some((c) => String(c[0]).includes('cancel() 失败')),
      'cancel 抛错必须记 WARN —— 否则真机上是一条无声的失败',
    ).toBe(true)
    // cancel 抛错后，新内容仍必须发声（不能连这一声都丢了）
    expect(synth.spoken[synth.spoken.length - 1]!.text).toBe('ball')
    warn.mockRestore()
  })
})

describe('ensureVoices 的冷却重试判据（[CR] 2026-10-16）', () => {
  it('音色列表非空但**没有英文**时，冷却到期仍要重读 getVoices', async () => {
    vi.useFakeTimers()
    // 模拟 WebView 的真实形态：先吐本地语言默认音色，英文引擎稍后才起，
    // 且**不派发 voiceschanged**。早退条件若判 `voices.length > 0`，
    // 补救就被自己关掉了 —— getVoices 只调一次，AC-4 的英式优先永久失效。
    synth.voices = [{ name: 'Tingting', lang: 'zh-CN' }]
    const { PROBE_RETRY_MS, playPronunciation, probeTts } = await import(
      '../../src/services/pronunciation'
    )

    expect(probeTts().state, '只有中文音色时应报 no-voice').toBe('no-voice')
    const callsBefore = synth.getVoicesCalls

    // 引擎起来了（但不派发 voiceschanged）
    synth.voices = [{ name: 'Tingting', lang: 'zh-CN' }, { name: 'Samantha', lang: 'en-US' }]
    vi.advanceTimersByTime(PROBE_RETRY_MS + 1)

    // ⚠️ 冷却重试是**惰性**的：没有谁在后台轮询，下一次调用才触发重读。
    //   所以必须先让时间过去、再调一次 probeTts，然后才断言调用次数变了。
    const stateAfterRetry = probeTts()

    expect(
      synth.getVoicesCalls,
      '冷却到期后的下一次探测必须重读 getVoices —— 早退条件把非空音色当成了「已到货」',
    ).toBeGreaterThan(callsBefore)
    expect(stateAfterRetry.state, '重读之后应认出英文音色').toBe('available')

    playPronunciation('ball')
    expect(synth.spoken[0]!.lang, '应命中补进来的 Samantha').toBe('en-US')
  })

  it('重读之后 lastProbeAt 必须置位，否则每块分块都重读一次 getVoices', async () => {
    // ⚠️ 前提必须是「**没有**英文音色」—— 有英文音色时早退分支直接命中，
    //   根本走不到重读路径，那条 `lastProbeAt = Date.now()` 是死代码，
    //   这条用例就会恒绿（`[CR]` 2026-10-16 首版就是这么写错的，
    //   变异实测没红才暴露出来）。
    withVoices([{ name: 'Tingting', lang: 'zh-CN' }])
    const { playPronunciation } = await import('../../src/services/pronunciation')

    playPronunciation('I have a ball for my dog. '.repeat(20))

    // 长句会切成多块，每块都走一次 ensureVoices()。
    for (let i = 0; i < 6 && synth.inFlight; i += 1) {
      synth.endInFlight()
    }
    expect(synth.spoken.length, '长句应切成多块').toBeGreaterThan(2)
    expect(
      synth.getVoicesCalls,
      '重读路径若不更新 lastProbeAt，冷却窗口不成立，每块都会重读一次 getVoices',
    ).toBeLessThanOrEqual(2)
  })

  it('字段残缺的音色被剔除，不让 normalizeLang 抛到解锁三步之外', async () => {
    // 精简 WebView / polyfill 返回 { name:'X', lang: undefined } 的形态。
    // 不剔除的话 TypeError 会从 probeTts → speakSilentWarmup 第一行
    // → unlockAudioSequence 第二步冒出去，**第三步 prewarmBgm 根本执行不到**。
    //
    // ⚠️ 样本里**不能**留一个能命中优先级链的英文音色：
    //   `selectVoice` 先走六档 name 匹配（`isEnglish(undefined)` 对正则
    //   返回 false，不抛），命中即 return，根本走不到后面的 `normalizeLang`。
    //   `[CR]` 首版就是配了 `Samantha` 才导致这条变异没红 —— 又一个假绿。
    synth.voices = [
      { name: 'Broken', lang: undefined } as unknown as { name: string; lang: string },
      { name: 'Tingting', lang: 'zh-CN' },
    ]
    const { probeTts } = await import('../../src/services/pronunciation')

    expect(() => probeTts(), '畸形音色不得让探测抛错').not.toThrow()
    expect(probeTts().state, '剔除畸形项后按剩下的中文音色判 no-voice').toBe('no-voice')

    // 真正的伤害在 unlockAudioSequence 的三步里：异常从第二步冒出去，
    // 第三步 prewarmBgm() 根本执行不到。这里直接验证那一层。
    const { unlockAudioSequence } = await import('../../src/app/audio-unlock')
    expect(() => unlockAudioSequence(), '解锁三步不得被畸形音色打断').not.toThrow()
  })
})
