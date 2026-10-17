/**
 * services/audio.ts 与 app/audio-unlock.ts 的单元测试（Story 1.2 / AC-1 #2 #5）。
 *
 * ⚠️ Node 里 AudioContext 不存在，**必须 stub**；漏了会在模块求值时（src/services/audio.ts）
 * 直接 ReferenceError，整个文件加载失败，报错信息还跟「你忘了 stub 什么」毫无关联。
 *
 * ⚠️ 动态 `await import()`：模块级 audioCtx 状态要用 vi.resetModules() 清零，
 * 静态 import 拿到的是另一份实例，测试会假绿。
 *
 * 📎 **Story 1.17：三个 fake 类与它们的全局安装已提到 `tests/fixtures/fake-audio.ts`。**
 *   1.17 的降级面板测试要真的跑一次「音效 404 ⇒ 进 `audioDegradations()`」，
 *   需要同一套 fake —— 两处各写一份就是 `fake-storage.ts` 文件头点名的那个 P0。
 *   ⇒ 本文件改为 import，并保留本地的 `contexts` / `spoken` / `resumeRejects` 名字
 *     （15 处断言一个字不用改）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  FakeAudioContext,
  fakeAudio,
  installFakeAudio,
  resetFakeAudio,
} from '../fixtures/fake-audio'
import type { FakeUtterance } from '../fixtures/fake-audio'

/** 每例新建一份 AudioContext 的记录（`resetFakeAudio()` 换新数组后重新别名过来）。 */
let contexts: FakeAudioContext[]
/** 真正被 speak 的 utterance（同上）。 */
let spoken: FakeUtterance[]

beforeEach(() => {
  vi.resetModules()
  resetFakeAudio()
  installFakeAudio()
  // ⚠️ **`resetFakeAudio()` 会换上全新的数组**，所以别名必须在它**之后**取 ——
  //   取早了拿到的是上一轮那个已经没人往里 push 的旧数组，计数永远停在 0。
  contexts = fakeAudio.contexts
  spoken = fakeAudio.spoken
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
    // ⚠️ 设的是 `fakeAudio.resumeRejects` 而不是本地别名 —— `FakeAudioContext.resume()`
    //   读的是 fixture 上那一个（类不认识本文件的局部变量）。
    fakeAudio.resumeRejects = true
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

describe('prewarmBgm（AC-1 ③ / 决策 1 / AC-D6）', () => {
  it('同步发起 fetch（不 await），BGM 就绪后缓存；重复调用不重复请求', async () => {
    // ⚠️ mock 必须**带 URL 形参的类型**（`vi.fn<(url: string) => …>`），否则
    // mock.calls 的元组类型是 `[]`，读 `calls[0][0]` 会 TS2493；
    // 而拿 `as` 强转绕过正是「假断言」的温床（R-57）。
    // 也不能写成 `(_url: string) =>` 实参 —— eslint no-unused-vars 会红（本仓未开 argsIgnorePattern）。
    const fetchMock = vi.fn<(url: string) => Promise<unknown>>(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const audio = await import('../../src/services/audio')

    audio.unlockAudioSession()
    // FakeAudioContext 没有 decodeAudioData —— 补一个，否则解码失败会走降级。
    const ctx = audio.getAudioContext() as unknown as {
      decodeAudioData: (b: ArrayBuffer) => Promise<unknown>
    }
    ctx.decodeAudioData = () => Promise.resolve({ fake: 'buffer' })

    expect(() => audio.prewarmBgm()).not.toThrow()
    // ⚠️ fetch 必须**同步发起**（AC-D6）—— 在同一个手势同步块内，不是 await 之后。
    expect(fetchMock.mock.calls, 'prewarmBgm 必须同步发起 BGM 的 fetch').toHaveLength(1)
    expect(String(fetchMock.mock.calls[0]![0]), 'BGM URL 必须接 BASE_URL（AC-D3 / G65）').toContain(
      'assets/audio/music/battle-loop.mp3',
    )

    // 让 promise 队列跑够拍数，解码完成（fetch → arrayBuffer → decodeAudioData 是三段链）。
    await flush()

    // 第二次 prewarm 已缓存 ⇒ 不再发请求（AC-D4）。
    audio.prewarmBgm()
    expect(fetchMock.mock.calls, 'BGM 解码一次即可，重复调用不重复请求').toHaveLength(1)
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

// ════════════════════════════════════════════════════════════════════════
// Story 1.14 —— 音效播放器 / 降级标志 / 绝不向调用方抛
// ════════════════════════════════════════════════════════════════════════

/** 造一个可解锁且能解码的 AudioContext，并返回 fetch mock。 */
async function unlockedWithFetch(): Promise<{ audio: typeof import('../../src/services/audio'); fetchMock: ReturnType<typeof vi.fn> }> {
  const fetchMock = vi.fn<(url: string) => Promise<unknown>>(() =>
    Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }),
  )
  vi.stubGlobal('fetch', fetchMock)
  const audio = await import('../../src/services/audio')
  audio.unlockAudioSession()
  const ctx = audio.getAudioContext() as unknown as { decodeAudioData: (b: ArrayBuffer) => Promise<unknown> }
  ctx.decodeAudioData = () => Promise.resolve({ fake: 'buffer' })
  return { audio, fetchMock }
}

/** 让 promise 队列跑几拍，等 fetch/decode 的 .then 落地。 */
async function flush(times = 5): Promise<void> {
  for (let i = 0; i < times; i += 1) await Promise.resolve()
}

describe('G65 —— 资源 URL 必须接 import.meta.env.BASE_URL（AC-D3）', () => {
  it('SFX_BASE_PATH 与 MUSIC_BASE_PATH 都以 BASE_URL 起头', async () => {
    const audio = await import('../../src/services/audio')
    expect(audio.SFX_BASE_PATH, 'sfx URL 必须接 BASE_URL，否则部署到 /plantsgame/ 下全 404').toBe(
      `${import.meta.env.BASE_URL}assets/audio/sfx/`,
    )
    expect(audio.MUSIC_BASE_PATH, 'music URL 必须接 BASE_URL').toBe(
      `${import.meta.env.BASE_URL}assets/audio/music/`,
    )
    // ⚠️ BASE_URL 自带尾斜杠，BASE_PATH 不得再拼一个（pronunciation.ts:155）。
    expect(audio.SFX_BASE_PATH.endsWith('sfx//'), 'BASE_URL 自带尾斜杠，不要重复拼').toBe(false)
  })

  it('G65：播放音效请求的 URL 以 SFX_BASE_PATH 起头（真跑一次播放）', async () => {
    const { audio, fetchMock } = await unlockedWithFetch()
    audio.playSfx('answer-correct')
    await flush()
    expect(String(fetchMock.mock.calls[0]![0]), '音效 URL 必须来自 SFX_BASE_PATH').toContain(
      'assets/audio/sfx/answer-correct.mp3',
    )
  })
})

describe('G68 —— 失败即标记，绝不重试（AC-D5）', () => {
  it('资源失败后连续触发三次，fetch 只被调用一次', async () => {
    const fetchMock = vi.fn<(url: string) => Promise<unknown>>(() => Promise.resolve({ ok: false, status: 404, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) }))
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const audio = await import('../../src/services/audio')
    audio.unlockAudioSession()
    const ctx = audio.getAudioContext() as unknown as { decodeAudioData: (b: ArrayBuffer) => Promise<unknown> }
    ctx.decodeAudioData = () => Promise.resolve({ fake: 'buffer' })

    audio.playSfx('zombie-died')
    await flush()
    audio.playSfx('zombie-died')
    audio.playSfx('zombie-died')
    await flush()

    expect(fetchMock.mock.calls, '失败即标记：连续触发三次只请求一次（epics.md:1211）').toHaveLength(1)
  })

  it('失败资源记入 audioDegradations 且 scope 是 asset', async () => {
    vi.stubGlobal('fetch', vi.fn<(url: string) => Promise<unknown>>(() => Promise.resolve({ ok: false, status: 404, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) })))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const audio = await import('../../src/services/audio')
    audio.unlockAudioSession()
    const ctx = audio.getAudioContext() as unknown as { decodeAudioData: (b: ArrayBuffer) => Promise<unknown> }
    ctx.decodeAudioData = () => Promise.resolve({ fake: 'buffer' })

    audio.playSfx('heart-lost')
    await flush()

    const degradations = audio.audioDegradations()
    const hit = degradations.find((d) => d.key === 'sfx:heart-lost')
    expect(hit, '失败资源必须出现在降级清单里，1.17 面板要能看到原因').toBeDefined()
    expect(hit!.scope, '单个资源失败是 asset 级，不是 session 级').toBe('asset')
  })
})

describe('G71 —— isAudioSilent 与 audioDegradations 的 scope 语义分离（AC-D8）', () => {
  it('单个音效坏掉 ≠ 全静', async () => {
    vi.stubGlobal('fetch', vi.fn<(url: string) => Promise<unknown>>(() => Promise.resolve({ ok: false, status: 500, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) })))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const audio = await import('../../src/services/audio')
    audio.unlockAudioSession()
    const ctx = audio.getAudioContext() as unknown as { decodeAudioData: (b: ArrayBuffer) => Promise<unknown> }
    ctx.decodeAudioData = () => Promise.resolve({ fake: 'buffer' })

    audio.playSfx('tower-placed')
    await flush()

    expect(audio.audioDegradations().length, '确实有一条降级').toBeGreaterThan(0)
    expect(audio.isAudioSilent(), '一个音效坏了不等于设备无音频（AC-D8 / M123）').toBe(false)
  })

  it('AudioContext 不存在 ⇒ isAudioSilent 为 true，scope 是 session', async () => {
    vi.stubGlobal('AudioContext', undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const audio = await import('../../src/services/audio')

    audio.unlockAudioSession()

    expect(audio.isAudioSilent(), 'AudioContext 不存在就是全静').toBe(true)
    const hit = audio.audioDegradations().find((d) => d.scope === 'session')
    expect(hit, 'session 级降级项必须在清单里，且带原因').toBeDefined()
    expect(hit!.reason, '降级项必须带原因（epics.md:1217）').toBeTruthy()
  })
})

describe('G72 —— 新入口不向调用方抛（AC-D9 / NFR13）', () => {
  it('AudioContext 不存在时，playSfx / prewarmBgm / startBgmIfReady 都不抛', async () => {
    vi.stubGlobal('AudioContext', undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const audio = await import('../../src/services/audio')
    audio.unlockAudioSession()

    expect(() => audio.playSfx('answer-correct'), '全静时播音效不得抛').not.toThrow()
    expect(() => audio.prewarmBgm(), '全静时预解 BGM 不得抛').not.toThrow()
    expect(() => audio.startBgmIfReady(), '全静时起播 BGM 不得抛').not.toThrow()
  })

  it('fetch 抛 / 响应非 2xx / decodeAudioData 抛，三种都不冒到调用方', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const audio = await import('../../src/services/audio')

    // ① fetch 直接抛
    vi.stubGlobal('fetch', vi.fn<(url: string) => Promise<unknown>>(() => { throw new Error('网络栈炸了') }))
    audio.unlockAudioSession()
    const ctx = audio.getAudioContext() as unknown as { decodeAudioData: (b: ArrayBuffer) => Promise<unknown> }
    ctx.decodeAudioData = () => Promise.resolve({ fake: 'buffer' })
    expect(() => audio.playSfx('answer-wrong'), 'fetch 抛不得冒到调用方').not.toThrow()
    await flush()

    // ② decodeAudioData 抛
    vi.resetModules()
    vi.stubGlobal('fetch', vi.fn<(url: string) => Promise<unknown>>(() => Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) })))
    const audio2 = await import('../../src/services/audio')
    audio2.unlockAudioSession()
    const ctx2 = audio2.getAudioContext() as unknown as { decodeAudioData: (b: ArrayBuffer) => Promise<unknown> }
    ctx2.decodeAudioData = () => Promise.reject(new Error('解码器内部异常'))
    expect(() => audio2.playSfx('level-complete'), '解码抛不得冒到调用方').not.toThrow()
    await flush()

    warn.mockRestore()
  })
})

describe('AC-H6 ① —— deferred 的「AudioContext 不存在 / new Audio() 抛」两条分支', () => {
  it('① AudioContext 不存在：unlockAudioSession 记 session 降级且不抛', async () => {
    vi.stubGlobal('AudioContext', undefined)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const audio = await import('../../src/services/audio')

    expect(() => audio.unlockAudioSession(), 'AudioContext 缺失不得抛').not.toThrow()
    expect(audio.isAudioSilent(), '缺 AudioContext = session 降级').toBe(true)
    warn.mockRestore()
  })

  it('① new AudioContext() 构造抛错：记 session 降级且不抛', async () => {
    vi.stubGlobal('AudioContext', class {
      constructor() {
        throw new Error('构造被拒')
      }
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const audio = await import('../../src/services/audio')

    expect(() => audio.unlockAudioSession(), 'new AudioContext 抛错不得冒到调用方').not.toThrow()
    expect(audio.isAudioSilent(), '构造抛错 = session 降级').toBe(true)
    expect(audio.getAudioContext(), '构造失败时 context 必须仍是 null').toBeNull()
    warn.mockRestore()
  })
})

describe('AC-D7 —— BGM 单曲循环 + 重复调用不叠播', () => {
  it('startBgmIfReady 起播一个 loop 源节点，重复调用先停上一个', async () => {
    const { audio } = await unlockedWithFetch()
    // 预热并等 BGM 解码完成。
    audio.prewarmBgm()
    await flush()

    audio.startBgmIfReady()
    const ctx = audio.getAudioContext() as unknown as FakeAudioContext
    const first = ctx.started[ctx.started.length - 1]
    expect(first?.loop, 'BGM 必须单曲循环').toBe(true)
    expect(first?.startCalls, 'BGM 必须起播一次').toBe(1)

    audio.startBgmIfReady()
    const last = ctx.started[ctx.started.length - 1]
    expect(first?.stopCalls, '重复调用必须先停掉上一个源节点，否则叠播').toBe(1)
    expect(last?.loop, '第二个源节点同样单曲循环').toBe(true)
  })
})

describe('AC-D4 —— 解码一次，缓存，重放不重新 fetch', () => {
  it('同一 cue 连续触发三次只 fetch 一次，每次播放都新建源节点', async () => {
    const { audio, fetchMock } = await unlockedWithFetch()

    audio.playSfx('tower-placed')
    await flush()
    audio.playSfx('tower-placed')
    audio.playSfx('tower-placed')
    await flush()

    expect(fetchMock.mock.calls, '同一资源第二次及以后不重新 fetch（AC-D4）').toHaveLength(1)
    const ctx = audio.getAudioContext() as unknown as FakeAudioContext
    const sfxSources = ctx.started.filter((s) => s.connectedTo === ctx.destination)
    // 首次（解码回调里）+ 两次重放 = 3 次起播，每次一个新源节点。
    expect(sfxSources.length, '每次播放都新建 createBufferSource —— AudioBufferSourceNode 是一次性的').toBe(3)
  })
})
