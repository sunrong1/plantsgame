/**
 * services/audio.ts 与 app/audio-unlock.ts 的单元测试（Story 1.2 / AC-1 #2 #5）。
 *
 * ⚠️ Node 里 AudioContext 不存在，**必须 stub**；漏了会在模块求值时（src/services/audio.ts）
 * 直接 ReferenceError，整个文件加载失败，报错信息还跟「你忘了 stub 什么」毫无关联。
 *
 * ⚠️ 动态 `await import()`：模块级 audioCtx 状态要用 vi.resetModules() 清零，
 * 静态 import 拿到的是另一份实例，测试会假绿。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** 每例新建一份 AudioContext 的记录。 */
let contexts: FakeAudioContext[]
/** 让下一次 resume() 的 Promise 被拒绝。 */
let resumeRejects: boolean

class FakeAudioContext {
  resumeCalls = 0
  state = 'suspended'

  constructor() {
    contexts.push(this)
  }

  resume(): Promise<void> {
    this.resumeCalls += 1
    if (resumeRejects) {
      return Promise.reject(new Error('resume 被拒绝'))
    }
    this.state = 'running'
    return Promise.resolve()
  }
}

/** fake TTS：记录真正被 speak 的 utterance，供断言预热与三步同步块。 */
let spoken: FakeUtterance[] = []

class FakeUtterance {
  volume = 1
  rate = 1
  pitch = 1
  voice: unknown = null
  lang = ''
  onend: (() => void) | null = null
  onerror: (() => void) | null = null

  constructor(public text: string) {}
}

beforeEach(() => {
  vi.resetModules()
  resumeRejects = false
  contexts = []
  spoken = []

  vi.stubGlobal('AudioContext', FakeAudioContext)
  vi.stubGlobal('speechSynthesis', {
    voices: [{ name: 'Samantha', lang: 'en-US' }],
    speaking: false,
    cancel: () => {},
    getVoices: () => [{ name: 'Samantha', lang: 'en-US' }],
    onvoiceschanged: null,
    speak: (utterance: FakeUtterance) => {
      spoken.push(utterance)
    },
  })
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('unlockAudioSession（AC-1 ①）', () => {
  it('首次调用创建一个 AudioContext', async () => {
    const { unlockAudioSession } = await import('../../src/services/audio')

    unlockAudioSession()

    expect(contexts).toHaveLength(1)
  })

  it('重复调用复用同一个 AudioContext，不新建（AC-8 反复点 5 次）', async () => {
    const { unlockAudioSession } = await import('../../src/services/audio')

    unlockAudioSession()
    unlockAudioSession()
    unlockAudioSession()

    expect(contexts, '每次点击都新建 context 会耗尽设备音频资源').toHaveLength(1)
    // resume 可以重复调用 —— 它是幂等的
    expect(contexts[0]!.resumeCalls).toBe(3)
  })

  it('resume() 的 Promise 被拒绝时只记日志，不向调用方抛', async () => {
    resumeRejects = true
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { unlockAudioSession } = await import('../../src/services/audio')

    expect(() => unlockAudioSession()).not.toThrow()

    // 拒绝是异步落地的，让微任务队列跑一拍
    await Promise.resolve()
    await Promise.resolve()

    expect(warn.mock.calls.some((call) => String(call[0]).startsWith('[audio]'))).toBe(true)
    warn.mockRestore()
  })

  it('未解锁时 getAudioContext() 返回 null，解锁后返回该实例', async () => {
    const { getAudioContext, unlockAudioSession } = await import('../../src/services/audio')

    expect(getAudioContext()).toBeNull()
    unlockAudioSession()
    expect(getAudioContext()).toBe(contexts[0])
  })
})

describe('prewarmBgm（AC-1 ③ / 决策 1）', () => {
  it('本 story 是同步空实现：调它不发请求、不抛', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { prewarmBgm } = await import('../../src/services/audio')

    expect(() => prewarmBgm()).not.toThrow()
    // BGM 资源属 Story 1.13，现在去请求只会在平板控制台留下一条 404。
    expect(fetchMock.mock.calls, 'BGM 资源还不存在，不该发请求').toHaveLength(0)
  })
})

describe('unlockAudioSequence（AC-1 三步同步块）', () => {
  it('三步全部发生，且第③步与第②步在同一个同步块里', async () => {
    // ⚠️ 这条断言的是**三步的时序**，不只是「调用过」。
    // 在 prewarmBgm 被调用的那一刻记录已发出的预热条数 —— 必须是 1，
    // 否则说明第②步落到了微任务里（有人写了 await / .then），手势上下文已被让出。
    // `[CR]` 2026-10-12：原用例只断言 contexts.length 与 speak 调用次数，
    // 删掉 prewarmBgm() 那一行 66 个测试照样全绿。
    //
    // ⚠️ `[CR]` 二轮 2026-10-12 做过一次**变异验证**，结论记在这里免得下轮重复讨论：
    // 有人提出这条断言只测得出第②步被延后、测不出第③步（建议加 `afterReturn` 标记）。
    // 实测不成立 —— `expect(prewarmSpy).toHaveBeenCalledTimes(1)` 在第一个 `await` 之前
    // 同步执行，而本用例从 `unlockAudioSequence()` 到断言之间**没有任何 await**，
    // 所以把第③步改成 `queueMicrotask(prewarmBgm)`、`setTimeout(prewarmBgm, 0)` 或
    // `.then()` 都会让它当场变红（已逐一实测）。故未采纳那条建议。
    const warmupsAtBgm: number[] = []
    const audio = await import('../../src/services/audio')
    const prewarmSpy = vi.spyOn(audio, 'prewarmBgm').mockImplementation(() => {
      warmupsAtBgm.push(spoken.length)
    })
    const { unlockAudioSequence } = await import('../../src/app/audio-unlock')

    unlockAudioSequence()

    expect(contexts, '第①步 Web Audio 解锁没发生').toHaveLength(1)
    expect(spoken, '第②步 TTS 预热没发生').toHaveLength(1)
    expect(spoken[0]!.volume, 'AC-1② 的实质是 volume = 0 的空 utterance，不是「speak 被调过」').toBe(0)
    expect(prewarmSpy, '第③步 prewarmBgm 没被调用 —— 三步不齐，FR2 不成立').toHaveBeenCalledTimes(1)
    expect(warmupsAtBgm, '第③步执行时预热还没发出，说明三步不在同一个同步块内').toEqual([1])

    prewarmSpy.mockRestore()
  })

  it('幂等：连续调用两次不产生第二次 TTS 预热（AC-8 第 3 条）', async () => {
    const { unlockAudioSequence } = await import('../../src/app/audio-unlock')

    unlockAudioSequence()
    unlockAudioSequence()
    unlockAudioSequence()

    expect(spoken, '重复点「开始游戏」会发出多条预热 utterance').toHaveLength(1)
    expect(contexts).toHaveLength(1)
  })

  it('TTS 完全不可用时，解锁链路照样跑完不抛（AC-5）', async () => {
    vi.stubGlobal('speechSynthesis', undefined)
    vi.stubGlobal('SpeechSynthesisUtterance', undefined)
    const { unlockAudioSequence } = await import('../../src/app/audio-unlock')

    expect(() => unlockAudioSequence()).not.toThrow()
    expect(contexts, 'TTS 挂了不该拖住第①步').toHaveLength(1)
  })

  it('getVoices 缺失/抛错时，解锁链路照样跑完且不外抛（P6）', async () => {
    // 只有 speak、没有 getVoices 的残缺实现 —— 异常若从 probeTts 逃出去，
    // 第③步 prewarmBgm 就根本执行不到。
    vi.stubGlobal('speechSynthesis', {
      speaking: false,
      cancel: () => {},
      speak: () => {},
      onvoiceschanged: null,
    })
    const { unlockAudioSequence } = await import('../../src/app/audio-unlock')

    expect(() => unlockAudioSequence()).not.toThrow()
    expect(contexts).toHaveLength(1)
  })

  it('返回 void 而非 Promise —— 调用方不得 await（FR2）', async () => {
    const { unlockAudioSequence } = await import('../../src/app/audio-unlock')

    // 若哪天有人把它改成 async，这里会拿到 Promise 而失败。
    expect(unlockAudioSequence()).toBeUndefined()
  })
})
