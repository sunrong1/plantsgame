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
  stubFailingFetch,
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

    expect(contexts, '首次解锁必须恰好创建一个 AudioContext —— 少了没有音频通道，多了会耗尽设备音频资源').toHaveLength(1)
  })

  it('重复调用复用同一个 AudioContext，不新建（AC-8 反复点 5 次）', async () => {
    const { unlockAudioSession } = await import('../../src/services/audio')

    unlockAudioSession()
    unlockAudioSession()
    unlockAudioSession()

    expect(contexts, '每次点击都新建 context 会耗尽设备音频资源').toHaveLength(1)
    // resume 可以重复调用 —— 它是幂等的
    expect(contexts[0]!.resumeCalls, '三次点击应各调一次 resume() —— 少调会让自动播放策略下的音频仍停在 suspended').toBe(3)
  })

  it('resume() 的 Promise 被拒绝时只记日志，不向调用方抛', async () => {
    // ⚠️ 设的是 `fakeAudio.resumeRejects` 而不是本地别名 —— `FakeAudioContext.resume()`
    //   读的是 fixture 上那一个（类不认识本文件的局部变量）。
    fakeAudio.resumeRejects = true
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { unlockAudioSession } = await import('../../src/services/audio')

    expect(() => unlockAudioSession(), 'resume() 被拒绝不得冒到调用方 —— 异常会让「开始游戏」整条链路中断').not.toThrow()

    // 拒绝是异步落地的，让微任务队列跑一拍
    await Promise.resolve()
    await Promise.resolve()

    expect(warn.mock.calls.some((call) => String(call[0]).startsWith('[audio]')), 'resume 失败必须记一条 [audio] 前缀的警告 —— 否则真机上「没声音」没有任何线索').toBe(true)
    warn.mockRestore()
  })

  it('未解锁时 getAudioContext() 返回 null，解锁后返回该实例', async () => {
    const { getAudioContext, unlockAudioSession } = await import('../../src/services/audio')

    expect(getAudioContext(), '未解锁时必须返回 null —— 提前返回会让音频在用户手势之前就启动').toBeNull()
    unlockAudioSession()
    expect(getAudioContext(), '解锁后必须返回同一个实例 —— 另建实例会让已解码的缓冲区全部作废').toBe(contexts[0])
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

    expect(() => audio.prewarmBgm(), 'BGM 预热不得抛错 —— 抛错会打断解锁三步所在的同步块').not.toThrow()
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
    expect(contexts, '三次「开始游戏」只应复用一个 AudioContext —— 每次新建会耗尽设备音频资源').toHaveLength(1)
  })

  it('TTS 完全不可用时，解锁链路照样跑完不抛（AC-5）', async () => {
    vi.stubGlobal('speechSynthesis', undefined)
    vi.stubGlobal('SpeechSynthesisUtterance', undefined)
    const { unlockAudioSequence } = await import('../../src/app/audio-unlock')

    expect(() => unlockAudioSequence(), 'TTS 完全不可用时解锁链路不得抛错 —— 抛错会让整局开不起来').not.toThrow()
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

    expect(() => unlockAudioSequence(), 'getVoices 缺失 / 抛错时解锁链路不得抛错 —— 否则第③步 prewarmBgm 根本执行不到').not.toThrow()
    expect(contexts, 'TTS 探针失败不该拖住第①步 Web Audio 解锁').toHaveLength(1)
  })

  // 📎 `[CR]` 2026-10-21 **补 AC-H6 ⑤** —— story 文档第 808 行逐字要求三条：
  //   「①②⑤ 三条（`AudioContext` 不存在 / `new Audio()` 抛 / `getVoices()` 返回非数组）」。
  //   ①② 有独立用例（见下方 `AC-H6 ①` 那个 describe），**⑤ 却没有** ——
  //   既有那条 P6 用例测的是「`getVoices` **缺失**」，不是「返回**非数组**」。
  //   两者是不同的坏法：缺失走 `typeof !== 'function'` 早返回，
  //   非数组要走到 `raw.filter(...)` 才抛（`null.filter` / `'abc'.filter`）。
  it.each([
    ['null', null],
    ['字符串', 'Samantha'],
    ['普通对象', { 0: { name: 'Samantha', lang: 'en-US' }, length: 1 }],
  ])('AC-H6 ⑤：getVoices() 返回 %s（非数组）时解锁链路照样跑完', async (_label, ret) => {
    vi.stubGlobal('speechSynthesis', {
      speaking: false,
      cancel: () => {},
      speak: () => {},
      onvoiceschanged: null,
      getVoices: () => ret,
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { unlockAudioSequence } = await import('../../src/app/audio-unlock')

    expect(() => unlockAudioSequence(), '非数组音色列表不得让解锁链路炸掉').not.toThrow()
    expect(contexts, '第①步照常发生').toHaveLength(1)
    warn.mockRestore()
  })

  it('返回 void 而非 Promise —— 调用方不得 await（FR2）', async () => {
    const { unlockAudioSequence } = await import('../../src/app/audio-unlock')

    // 若哪天有人把它改成 async，这里会拿到 Promise 而失败。
    expect(unlockAudioSequence(), '解锁三步必须同步返回 void —— 返回 Promise 会让调用方 await 它，手势上下文已被让出').toBeUndefined()
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

  it('fetch 抛 / decodeAudioData 抛，两种都不冒到调用方', async () => {
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

  // 🚨📎 `[CR]` 2026-10-21 **G214 —— 用例标题写着「三种」，实际只验了两种。**
  //   「响应非 2xx」这一支原先**没有任何用例**：
  //   ① fetch 抛 / ② decodeAudioData 抛 都验了，唯独最常见的 404 没有 ——
  //   而 404 正是 `G68`（失败即标记）测的那条，两边各测一半、合起来才完整。
  it('响应非 2xx（404）不冒到调用方，且记成一条 asset 降级', async () => {
    const fetchMock = vi.fn<(url: string) => Promise<unknown>>(() =>
      Promise.resolve({ ok: false, status: 404, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const audio = await import('../../src/services/audio')
    audio.unlockAudioSession()
    await flush()

    expect(() => audio.playSfx('zombie-died'), '404 不得冒到调用方').not.toThrow()
    await flush()

    expect(fetchMock.mock.calls.length, '前置：确实发起了请求').toBe(1)
    expect(
      audio.audioDegradations().map((d) => `${d.scope}:${d.key}`),
      '404 必须记成 scope=asset —— 不是 session（AC-D8）',
    ).toEqual(['asset:sfx:zombie-died'])
    // 「不重试」那半由 G68 守着，这里只确认 404 走的是**标记**这条路而不是崩了。
    warn.mockRestore()
  })
})

/**
 * ⚠️ `[CR]` 2026-10-21 二轮**订正**：本 describe 原标题写的是
 *   「「AudioContext 不存在 / **new Audio() 抛**」两条分支」——
 *   但第二条测的是 **`new AudioContext()`**（`src/services/audio.ts` 的 context），
 *   **不是** `new Audio()`（`src/services/pronunciation.ts` 的录音元素）。
 *   标题在骗人 ⇒ 读的人以为 `new Audio()` 那条已被覆盖，实际它**零覆盖**。
 *   ⇒ 现标题按实际内容写；`new Audio()` 那条由 **`G252`**
 *   （`tests/services/pronunciation.test.ts`）覆盖。
 */
describe('AC-H6 ① —— deferred 的两条分支：「AudioContext 不存在」与「new AudioContext() 抛」（[CR] 订正标题）', () => {
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

// ════════════════════════════════════════════════════════════════════════
// [CR] 2026-10-17 —— 降级变更信号（版本号 + 订阅）
// ════════════════════════════════════════════════════════════════════════

/**
 * 为什么音频这一路的信号判据住在**本文件**而不是 `debug-panel.test.ts`：
 * `audioContextUnavailableReason` 是模块级状态，而 `audio.ts` **没有** `clear…ForTest`
 * —— 一旦某例触发过 session 级降级，同一文件里后续所有用例都带着它
 * （jsdom 下 `AudioContext` 不存在，`unlockAudioSession()` 必然走 session 分支）。
 * ⇒ 在面板文件里测音频会把整份面板判据永久染脏。
 */
describe('[CR 2026-10-17] 降级变更信号：版本号 + 订阅（三条写入路径）', () => {
  it('session 级降级：版本号递增 **且** 订阅被调用', async () => {
    const audio = await import('../../src/services/audio')
    // ⚠️ 本文件的前置已经装好 `fake-audio`，但那条路**不会**降级；
    //   要造 session 降级得让 `AudioContext` 不存在 ⇒ 撤掉那个 stub。
    vi.stubGlobal('AudioContext', undefined)
    const before = audio.audioDegradationsVersion()
    let fired = 0
    const off = audio.onAudioDegradationsChanged(() => {
      fired += 1
    })

    audio.unlockAudioSession()

    expect(audio.isAudioSilent(), '前置：这条路径确实记了 session 降级').toBe(true)
    expect(
      audio.audioDegradationsVersion(),
      '版本号没涨 —— 面板「变没变」的判据失灵',
    ).toBeGreaterThan(before)
    expect(fired, '订阅没被调用 —— 面板建不起依赖，永远停在挂载那一刻').toBeGreaterThan(0)
    off()
  })

  it('资源级降级（音效 404）：版本号递增 **且** 订阅被调用', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<(url: string) => Promise<unknown>>(() =>
        Promise.resolve({ ok: false, status: 404, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) }),
      ),
    )
    const audio = await import('../../src/services/audio')
    audio.unlockAudioSession()
    const ctx = audio.getAudioContext() as unknown as FakeAudioContext
    ctx.decodeAudioData = () => Promise.resolve({ fake: 'buffer' })
    const before = audio.audioDegradationsVersion()
    let fired = 0
    const off = audio.onAudioDegradationsChanged(() => {
      fired += 1
    })

    audio.playSfx('answer-wrong')
    await flush()

    expect(
      audio.audioDegradations().filter((d) => d.scope === 'asset'),
      '前置：音效 404 确实登记了资源级降级',
    ).toHaveLength(1)
    expect(audio.audioDegradationsVersion(), '资源级降级没让版本号递增').toBeGreaterThan(before)
    expect(fired, '资源级降级没通知订阅者 —— 面板上的音频那一段是死的').toBeGreaterThan(0)
    off()
  })

  it('退订之后不再被调用（面板卸载必须退订，否则第二次挂载回调翻倍）', async () => {
    const audio = await import('../../src/services/audio')
    let fired = 0
    const off = audio.onAudioDegradationsChanged(() => {
      fired += 1
    })
    off()

    vi.stubGlobal('fetch', vi.fn<(url: string) => Promise<unknown>>(() =>
      Promise.resolve({ ok: false, status: 404, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) }),
    ))
    audio.unlockAudioSession()
    const ctx = audio.getAudioContext() as unknown as FakeAudioContext
    ctx.decodeAudioData = () => Promise.resolve({ fake: 'buffer' })
    audio.playSfx('answer-wrong')
    await flush()

    expect(fired, '退订之后还被回调 —— 模块级监听者集合漏了清理').toBe(0)
  })

  it('反向自测：版本号与通知写在同一个入口 —— 少一个就会被抓', async () => {
    // 判据自检：订阅能在**没有**版本号时单独触发，反之亦然 ——
    // 证明这两条判据不是同一个事实的两次测量。
    const audio = await import('../../src/services/audio')
    let fired = 0
    const off = audio.onAudioDegradationsChanged(() => {
      fired += 1
    })
    const v0 = audio.audioDegradationsVersion()

    vi.stubGlobal('fetch', vi.fn<(url: string) => Promise<unknown>>(() =>
      Promise.resolve({ ok: false, status: 404, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) }),
    ))
    audio.unlockAudioSession()
    const ctx = audio.getAudioContext() as unknown as FakeAudioContext
    ctx.decodeAudioData = () => Promise.resolve({ fake: 'buffer' })
    audio.playSfx('answer-wrong')
    await flush()

    // 一次降级可能经过多个记账函数（fetch 内部一次 + 回调一次）⇒ 只断言「都变了」。
    expect(fired, '一次降级至少要通知一次').toBeGreaterThan(0)
    expect(audio.audioDegradationsVersion(), '一次降级至少要涨一次版本号').toBeGreaterThan(v0)
    off()
  })
})

// ════════════════════════════════════════════════════════════════════════
// [CR] 2026-10-21 —— 「BGM 永远不响」「resume 拒绝永久静音」「并发重复 fetch」
// ════════════════════════════════════════════════════════════════════════

/**
 * 🚨 **G205 —— BGM 在真实进关路径上一次都没响过（`[CR]` 实测确认）。**
 *
 * ── 坏法（不是假想，是本 story `[DS]` 交付的真实代码）──────────────────────
 * `StartView.onStart()` 的真实形状是**一个同步块里的两句**：
 *
 *   ```ts
 *   unlockAudioSequence()   // ① ③步同步块，第③步 prewarmBgm 同步发起 fetch
 *   enterLevel()            // 内部调 startBgmIfReady()
 *   ```
 *
 * 而 `prewarmBgm` 的 `fetch + decodeAudioData` 是**异步**的 ⇒ 第二句执行的那一刻
 * `bgmBuffer` 还是 `null` ⇒ `startBgmIfReady()` **直接 return**。
 * 之后**再没有任何人调过它**（解码回调只赋值 buffer）⇒
 * **BGM 永远不响，且零日志、零降级项** —— 连「坏了」都不是，是「没接上」。
 *
 * ── 为什么既有守卫抓不到 ───────────────────────────────────────────────────
 * `AC-D7` 那条用例是「先 `prewarmBgm()` + `await flush()`（解码完成），
 * 再 `startBgmIfReady()`」—— **它测的是「就绪之后起播」，而 bug 是「未就绪时起播」**。
 * ⇒ 判据必须按**真实顺序**跑：两句之间**不 await**，flush 留给事后。
 */
describe('G205 —— BGM 在真实进关顺序上会响（[CR] 实测：修复前一次都没响过）', () => {
  it('unlockAudioSequence() 与 startBgmIfReady() 同 tick ⇒ flush 之后有一个 loop 源节点', async () => {
    const { audio } = await unlockedWithFetch()
    // ⚠️ 走**真的** `app/audio-unlock.ts` 三步同步块，不是手搓三句 ——
    //   `StartView.onStart()` 调的就是它，绕过它就等于测了一条不存在的链路。
    const { unlockAudioSequence } = await import('../../src/app/audio-unlock')
    const ctx = audio.getAudioContext() as unknown as FakeAudioContext

    // ⚠️ 这两句之间**刻意不 await** —— 那就是 StartView.onStart() 的真实形状：
    //   `unlockAudioSequence()`（内含 prewarmBgm 的同步 fetch 发起）
    //   紧接 `enterLevel()`（内部就是 startBgmIfReady）。
    unlockAudioSequence()
    audio.startBgmIfReady()

    // 起播**此刻**还没发生（buffer 还在解码）⇒ 这不是 bug，是设计的必然。
    expect(
      ctx.started.some((s) => s.loop),
      '解码完成前不该已经起播 —— 若这条红了，说明判据写反了',
    ).toBe(false)

    await flush()

    const loopSources = ctx.started.filter((s) => s.loop)
    expect(
      loopSources.length,
      '解码完成后必须起播 —— 「进关了」与「解码好了」两个事实要会合（修复前这里是 0）',
    ).toBe(1)
    expect(loopSources[0]!.startCalls, 'BGM 起播一次').toBe(1)
  })

  it('反向自测：删掉解码回调里那句会合（`if (bgmRequested) startBgmIfReady()`）本条会红', async () => {
    // ⚠️ 判据自检：不改生产代码，只把「起播」这一步从链路里摘掉，
    //   确认断言真的依赖它 —— 否则这条守卫可能只是数着别的什么东西而绿。
    const { audio } = await unlockedWithFetch()
    const ctx = audio.getAudioContext() as unknown as FakeAudioContext
    audio.prewarmBgm()
    // 刻意**不**调 startBgmIfReady：等价于「意图从未被记下」。
    await flush()
    expect(
      ctx.started.filter((s) => s.loop).length,
      '判据必须依赖「意图已记下 + 解码完成后的会合」这条路径',
    ).toBe(0)
  })
})

/**
 * 🚨 **G206 —— `stopBgm()` 是 AC-D7 的对称面（`[CR]` 新增出口）。**
 *
 * BGM 原本永远不响 ⇒ **从来没有人需要停它** ⇒ `store.backToStart()` 写着一句
 * 「不停 BGM，BGM 停止策略属 1.14 / 1.18」。修复「BGM 会响」之后这句就变成真 bug：
 * 孩子点「返回开始界面」，战斗音乐还在响。
 * ⇒ `stopBgm()` 必须**同时**做两件事：停当前源节点（听得见的那半）、
 * **并撤掉「该播了」这个意图**（否则下一次解码回调会把它重新拉起来 —— 那一半没人测过）。
 */
describe('G206 —— stopBgm() 同时停源节点与撤意图', () => {
  it('stopBgm 停掉在播的源节点', async () => {
    const { audio } = await unlockedWithFetch()
    audio.prewarmBgm()
    audio.startBgmIfReady()
    await flush()
    const ctx = audio.getAudioContext() as unknown as FakeAudioContext
    const before = ctx.started.filter((s) => s.loop)
    expect(before.length, '前置：此刻应在播').toBe(1)

    audio.stopBgm()

    expect(before[0]!.stopCalls, 'stopBgm 必须真的 stop 掉那个源节点').toBe(1)
  })

  it('stopBgm 之后不再有新的解码回调把 BGM 拉起来（意图已撤）', async () => {
    const { audio } = await unlockedWithFetch()
    const ctx = audio.getAudioContext() as unknown as FakeAudioContext

    audio.prewarmBgm()
    // ⚠️⚠️ `[CR]` 变异 M234 打到这里才发现首版是假绿。
    //   首版只写「prewarm → stopBgm → flush」，**从不调 startBgmIfReady** ⇒
    //   `bgmRequested` 始终是 false ⇒ 删掉 `stopBgm` 里那句 `bgmRequested = false`
    //   **0 红**：那条变异在这个场景里是恒等变形，守卫压根没碰到它。
    //   真正的坏法必须**先把意图记上**、再在解码完成**之前**撤掉：
    //     点「开始游戏」（意图已记）→ BGM 还在下载 → 孩子秒点「返回」（撤意图）
    //     → 下载完成 ⇒ 回调把音乐拉起来 ⇒ **开始界面上响起战斗音乐**。
    audio.startBgmIfReady()
    audio.stopBgm()
    await flush()

    expect(
      ctx.started.filter((s) => s.loop).length,
      '撤了意图之后解码完成也不该起播 —— 否则「返回开始界面」后音乐会自己回来',
    ).toBe(0)
  })

  it('stopBgm 之后重新进关，BGM 仍能再响（意图可重新记下，不是单向闩锁）', async () => {
    const { audio } = await unlockedWithFetch()
    const ctx = audio.getAudioContext() as unknown as FakeAudioContext

    audio.prewarmBgm()
    audio.startBgmIfReady()
    await flush()
    audio.stopBgm()
    audio.startBgmIfReady()

    expect(
      ctx.started.filter((s) => s.loop).length,
      '重新进关必须能再起播 —— stopBgm 不能把 BGM 永久闩死',
    ).toBe(2)
  })
})

/**
 * 🚨 **G207 —— 一次 `resume()` 拒绝曾经让整个会话永久静音（`[CR]` 实测确认）。**
 *
 * 原实现把 `resume()` 的拒绝写进**永久**的 `audioContextUnavailableReason`，
 * 而那个标志**永不清除** ⇒ 一次偶发拒绝（自动播放策略抖动、切后台）之后，
 * `getPlayableContext()` 永远返回 null ⇒ 之后所有音效与 BGM 都是哑的，
 * 且 `isAudioSilent()` 永远 true ⇒ 1.17 的面板会显示「整台设备无音频」。
 * 真实设备上「偶发一次就再也不响」是最难查的一类故障 —— 复现要靠真机抖动。
 *
 * ⇒ 拒绝只登记**可恢复**的 `audioSession`，**一次成功的 resume 把它清掉**。
 */
describe('G207 —— resume() 拒绝是可恢复的，不是永久静音（[CR] 实测：修复前永久静音）', () => {
  it('resume 拒绝 ⇒ isAudioSilent 为 true，但降级项是可恢复的那一条', async () => {
    fakeAudio.resumeRejects = true
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { audio } = await unlockedWithFetch()

    await flush()

    expect(audio.isAudioSilent(), '拒绝期间确实是不出声的').toBe(true)
    const degradations = audio.audioDegradations()
    expect(
      degradations.map((d) => `${d.scope}:${d.key}`),
      '必须登记成 scope=session / key=audioSession 那条**可恢复**的降级',
    ).toContain('session:audioSession')
    expect(
      degradations.some((d) => d.key === 'audioContext'),
      '不能登记成 audioContext —— 那是永久那条，一登记就永不清除',
    ).toBe(false)
    warn.mockRestore()
  })

  it('之后一次成功的 resume 会清掉降级，音频恢复（G207 的另一半）', async () => {
    fakeAudio.resumeRejects = true
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { audio } = await unlockedWithFetch()
    await flush()
    expect(audio.isAudioSilent(), '前置：此刻被拒绝').toBe(true)

    // ⚠️ 下一次手势：策略放开了，resume 成功。
    fakeAudio.resumeRejects = false
    audio.unlockAudioSession()
    await flush()

    expect(
      audio.isAudioSilent(),
      '一次成功的 resume 必须清掉降级 —— 否则「一次偶发拒绝」等于「本局永久哑」',
    ).toBe(false)
    expect(
      audio.audioDegradations().some((d) => d.key === 'audioSession'),
      '可恢复那条降级必须随之消失（面板要能看出它自己好了）',
    ).toBe(false)
    warn.mockRestore()
  })

  it('成功后音效真的又响了（降级标志不是摆设）', async () => {
    fakeAudio.resumeRejects = true
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { audio } = await unlockedWithFetch()
    await flush()

    fakeAudio.resumeRejects = false
    audio.unlockAudioSession()
    await flush()
    audio.playSfx('answer-correct')
    await flush(20)

    const ctx = audio.getAudioContext() as unknown as FakeAudioContext
    expect(
      ctx.started.length,
      '恢复之后 playSfx 必须真的起播 —— 只清标志不起播等于没修',
    ).toBeGreaterThan(0)
    warn.mockRestore()
  })
})

/**
 * 🚨 **G208 —— 同一 cue 的**并发**触发共用一次 fetch（AC-D4 在解码窗口内不成立）。**
 *
 * AC-D4 写的是「同一资源第二次及以后**不重新 fetch**」，而原实现只查**已解码**的缓存
 * ⇒ 解码窗口内的第二次触发会**再发一次 fetch** ⇒ 平板上连建两座塔就把同一个 mp3
 * 下载两遍、解码两遍，两份回调**各自起播一次** ⇒「建塔」音在同一瞬间叠着响两次。
 *
 * ⚠️ 既有 `AC-D4` 用例抓不到：它在两次触发**之间** `await flush()`，
 *   第一次的解码已经落地 ⇒ 走的是「已解码缓存」那条路，窗口根本不存在。
 *   ⇒ 这条判据**全程不 flush**，两次触发之间只有同步代码。
 */
describe('G208 —— in-flight 去重：同一 cue 并发触发只 fetch 一次', () => {
  it('不等解码就触发两次 ⇒ fetch 一次、播放两次', async () => {
    const { audio, fetchMock } = await unlockedWithFetch()
    const ctx = audio.getAudioContext() as unknown as FakeAudioContext

    audio.playSfx('tower-placed')
    // ⚠️ **刻意不 flush** —— 这两下落在同一个解码窗口里。
    audio.playSfx('tower-placed')

    expect(
      fetchMock.mock.calls.length,
      '解码窗口内的第二次触发不得再发一次 fetch（AC-D4）',
    ).toBe(1)

    await flush(20)
    // 并发是「同一事件响多次」不是「一次事件响一次」⇒ 两次触发两次起播，
    // 但**只解码一次**。
    //
    // ⚠️ `[CR]` 这条链现在比修复前**长两拍**：`loadSfx` 那层 `new Promise` 包装
    //   + 每个调用点各挂一次 `.then()`。实测 `flush(5)` 恰好差一拍 ⇒
    //   拍数不是这里要守的东西，多给几拍，别让判据绑在微任务计数上。
    expect(
      ctx.started.length,
      '两次触发各自起播一次（并发事件允许叠加），但不得叠着响两次是同一次下载的锅',
    ).toBe(2)
  })

  it('三次并发触发（同一窗口）仍只 fetch 一次', async () => {
    const { audio, fetchMock } = await unlockedWithFetch()
    const ctx = audio.getAudioContext() as unknown as FakeAudioContext

    audio.playSfx('answer-wrong')
    audio.playSfx('answer-wrong')
    audio.playSfx('answer-wrong')

    expect(fetchMock.mock.calls.length, '三次并发触发仍只 fetch 一次').toBe(1)
    await flush(20)
    expect(ctx.started.length, '三次触发各自起播一次').toBe(3)
  })
})

/**
 * 🚨 **G209 —— 一次资源失败只记一条 `[audio]` 日志。**
 *
 * 原实现是「`fetchAudioBuffer` 内部记一条 + 调用方回调里再记一条」，
 * 一次 404 产生**两条** warn，并把降级版本号**推高两次** ——
 * 而它自己的注释却写着「不重复记」。⇒ 本 story 只改了两行（`fetchAudioBuffer`
 * 把原因交回、不自己记；调用方合成唯一一条）。
 *
 * ⚠️ 这条判据守的是**日志条数**，不是「有没有记」—— 后者早就绿了。
 */
describe('G209 —— 一次资源失败只记一条 [audio] 日志', () => {
  it('音效 404 ⇒ 恰好一条 warn，且版本号只涨一次', async () => {
    stubFailingFetch()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const audio = await import('../../src/services/audio')
    audio.unlockAudioSession()
    await flush()
    const v0 = audio.audioDegradationsVersion()

    audio.playSfx('tower-placed')
    await flush()

    const lines = warn.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('[audio]'))
    expect(lines.length, `一次 404 只应有一条 [audio] 日志，实得 ${lines.length} 条：\n${lines.join('\n')}`).toBe(1)
    expect(
      audio.audioDegradationsVersion() - v0,
      '一次失败只推高一次版本号 —— 推高两次会让 1.17 的面板重算两遍',
    ).toBe(1)
    warn.mockRestore()
  })

  it('BGM 404 ⇒ 同样恰好一条', async () => {
    stubFailingFetch()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const audio = await import('../../src/services/audio')
    audio.unlockAudioSession()
    await flush()
    warn.mockClear()
    const v0 = audio.audioDegradationsVersion()

    audio.prewarmBgm()
    await flush()

    const lines = warn.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('[audio]'))
    expect(lines.length, `BGM 一次失败只应有一条日志，实得 ${lines.length} 条：\n${lines.join('\n')}`).toBe(1)
    expect(audio.audioDegradationsVersion() - v0, 'BGM 一次失败只推高一次版本号').toBe(1)
    warn.mockRestore()
  })
})

// ════════════════════════════════════════════════════════════════════════
// [CR] 2026-10-21 第二轮 —— 「意图没人执行」「坏监听器打断音频链」
// 「resume 同步抛错被判永久」「降级项丢真实原因」
// ════════════════════════════════════════════════════════════════════════

/**
 * 🚨 **G246 —— 「进关了」这个意图必须能自己发起加载。**
 *
 * ── 坏法（第一轮修掉的那条的**另一半**）─────────────────────────────────────
 * 第一轮把「解码完成后没人起播」修好了（`bgmRequested` 意图 × 解码完成 两个事实会合）。
 * 本轮补的是**另一半**：**意图记下了，却没人负责去「试」** ——
 * `startBgmIfReady()` 只在 `prewarmBgm()` 的成功回调里被调用过，
 * 而那次调用早于解码完成 ⇒ `bgmBuffer` 恒为 null ⇒ 直接 return。
 * ⇒ 于是「进关了」这个事实**必须**有人执行，否则 BGM 永远静默，
 *   **零日志、零降级项**（连「坏了」都不是，是「没人去试」）。
 *
 * ⚠️ 触发场景：解锁三步被打断，或调用方绕过解锁三步直接进关。
 * 原代码里那句「见下方『谁会再试』」指向的机制**根本不存在** ——
 * 全仓库搜不到「谁会再试」这四个字，注释指向的是一片空白。
 */
describe('G246 —— 意图必须能自己发起加载（[CR] 实测：修复前没人执行）', () => {
  it('没人在加载时，startBgmIfReady() 自己发起一次预解，解码完成后真的起播', async () => {
    const { audio, fetchMock } = await unlockedWithFetch()
    const ctx = audio.getAudioContext() as unknown as FakeAudioContext

    // ⚠️ 刻意**不**调 prewarmBgm() —— 这就是「意图已记、但根本没有人在加载」的场景。
    audio.startBgmIfReady()

    const musicCalls = fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.includes('battle-loop.mp3'))
    expect(
      musicCalls.length,
      '意图必须自己发起加载 —— 否则 BGM 永远静默，且零日志零降级项（连「坏了」都不是）',
    ).toBe(1)

    await flush()
    expect(
      ctx.started.filter((s) => s.loop).length,
      '解码完成后必须起播 —— 意图与「解码好了」两个事实要会合',
    ).toBe(1)
  })

  it('已经在加载中时不得再发一次请求（同一个 39 秒 mp3 不许下载两遍）', async () => {
    const { audio, fetchMock } = await unlockedWithFetch()
    audio.prewarmBgm()
    audio.startBgmIfReady()
    audio.startBgmIfReady()
    await flush()
    const musicCalls = fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.includes('battle-loop.mp3'))
    expect(musicCalls.length, '正在加载时重复调 startBgmIfReady 不得再发第二次请求').toBe(1)
  })

  it('BGM 已失败时不重试（AC-D5 失败即标记，不再重试）', async () => {
    const fetchMock = stubFailingFetch()
    const audio = await import('../../src/services/audio')
    audio.unlockAudioSession()
    await flush()

    audio.startBgmIfReady()
    await flush()
    const after = fetchMock.mock.calls.length
    expect(after, '前提：这一次确实发起了请求并失败了').toBeGreaterThan(0)

    audio.startBgmIfReady()
    await flush()
    expect(
      fetchMock.mock.calls.length,
      '失败即标记：BGM 已经失败之后不得再发请求（AC-D5）',
    ).toBe(after)
  })
})

/**
 * 🚨 **G247 —— 降级监听器抛错不许打断音频链。**
 *
 * ── 坏法 ───────────────────────────────────────────────────────────────────
 * `noteDegradationsChanged()` 原先是 `for (const cb of listeners) cb()` ——
 * **一个监听器抛错，后面的监听器全部收不到通知**，而抛错本身还会往上冒：
 *   · 同步路径（`unlockAudioSession` 遇到没有 `AudioContext`）⇒ 异常冒到调用方，
 *     而解锁三步的第③步 `prewarmBgm()` **根本执行不到**；
 *   · 异步路径（`loadSfx` 的加载回调）⇒ 异常变成 **unhandled rejection**，
 *     且 `resolve()` 永不执行 ⇒ 那条 promise 永远 pending ⇒
 *     那个 cue 从此**永久失声**（`loadingSfx` 里还攥着这条永不 settle 的 promise）。
 *
 * ⚠️ 1.17 的调试面板就是这些监听器之一 ⇒ 面板一坏，整个通知链就断。
 */
describe('G247 —— 降级监听器抛错不许打断音频链（AC-D9 绝不向调用方抛）', () => {
  it('坏监听器抛错时，unlockAudioSession 仍不向调用方抛', async () => {
    // 没有 AudioContext ⇒ 走 session 级降级（**同步**路径，异常会当场冒出去）。
    vi.stubGlobal('AudioContext', undefined)
    const audio = await import('../../src/services/audio')
    let called = 0
    audio.onAudioDegradationsChanged(() => {
      called += 1
      throw new Error('坏监听器')
    })

    expect(
      () => audio.unlockAudioSession(),
      '坏监听器不许把异常抛给调用方 —— 那会冒到解锁三步，第③步 prewarmBgm 根本执行不到',
    ).not.toThrow()
    expect(called, '判据自检：坏监听器确实被调用过（否则本条恒绿）').toBeGreaterThan(0)
  })

  it('坏监听器不许挡住后面的监听器（1.17 的面板必须照样收到通知）', async () => {
    vi.stubGlobal('AudioContext', undefined)
    const audio = await import('../../src/services/audio')
    audio.onAudioDegradationsChanged(() => {
      throw new Error('坏监听器')
    })
    let reached = 0
    audio.onAudioDegradationsChanged(() => {
      reached += 1
    })

    audio.unlockAudioSession()
    expect(reached, '排在坏监听器后面的那个必须照样被通知 —— 否则面板再也不刷新').toBeGreaterThan(0)
  })
})

/**
 * 🚨 **G248 —— `resume()` 同步抛错与「Promise 被拒绝」必须是同一个生命周期。**
 *
 * ── 坏法 ───────────────────────────────────────────────────────────────────
 * 第一轮把「`resume()` 被拒绝」拆成**可恢复**的那条（一次成功 resume 就清掉），
 * 理由是「一次偶发拒绝静音整个会话是最难查的故障」。
 * 但**同步抛错**（残缺 polyfill 上 `resume` 不是函数、closed context 抛
 * `InvalidStateError`）落到了外层 catch ⇒ 被记成**永久**的 session 降级
 * ⇒ 那个标志**永不清除** ⇒ **一个完全可用的 AudioContext 被永久判死**
 * （`getPlayableContext()` 从此返回 null，所有音效与 BGM 都哑）。
 * ⇒ 同一个失败原因，因抛出形态不同而得到两种**相反**的生命周期。
 */
describe('G248 —— resume() 同步抛错是可恢复的，不是永久静音（[CR] 实测）', () => {
  it('resume 同步抛错 ⇒ 记「可恢复」那条，不记「永久」那条', async () => {
    class ThrowingResumeContext extends FakeAudioContext {
      override resume(): Promise<void> {
        throw new Error('resume 抛错（残缺 polyfill）')
      }
    }
    vi.stubGlobal('AudioContext', ThrowingResumeContext)
    const audio = await import('../../src/services/audio')

    expect(
      () => audio.unlockAudioSession(),
      'resume 抛错也不许冒到调用方（AC-D9）',
    ).not.toThrow()

    const degradations = audio.audioDegradations()
    expect(
      degradations.some((d) => d.key === 'audioSession'),
      'resume 失败必须记成「可恢复」那一条 —— 它下一次成功就会自己好',
    ).toBe(true)
    expect(
      degradations.some((d) => d.key === 'audioContext'),
      '❌ 绝不能记成「永久无 AudioContext」—— context 是好的，只是这一次 resume 没成；' +
        '永久那条永不清除 ⇒ 一个可用的 AudioContext 被永久判死，整个会话静音',
    ).toBe(false)
  })

  it('之后一次成功的 resume 会清掉这条降级（可恢复的另一半）', async () => {
    class ThrowingResumeContext extends FakeAudioContext {
      override resume(): Promise<void> {
        throw new Error('resume 抛错（残缺 polyfill）')
      }
    }
    vi.stubGlobal('AudioContext', ThrowingResumeContext)
    const audio = await import('../../src/services/audio')
    audio.unlockAudioSession()
    expect(
      audio.audioDegradations().some((d) => d.key === 'audioSession'),
      '前提：此刻确实挂着可恢复那条',
    ).toBe(true)

    // 让 resume 恢复正常，再走一次解锁。
    const ctx = audio.getAudioContext() as unknown as { resume: () => Promise<void> }
    ctx.resume = () => Promise.resolve()
    audio.unlockAudioSession()
    await flush()

    expect(
      audio.audioDegradations().some((d) => d.key === 'audioSession'),
      '一次成功的 resume 必须清掉可恢复那条 —— 否则一次偶发失败就静音到会话结束',
    ).toBe(false)
  })
})

/**
 * 🚨 **G249 —— 资产级降级项必须带**真实**失败原因。**
 *
 * ── 坏法 ───────────────────────────────────────────────────────────────────
 * 失败原因只进了 `console.warn`，而 `audioDegradations()` 给每条 asset 降级
 * 写死一句「音效加载或解码失败，已标记不再重试」⇒
 * 家长在平板上打开调试面板看到的是**一句废话**：
 * 是文件没部署？是解码器炸了？还是当时离线？**面板答不出来**，
 * 而唯一带真实原因的地方是家长在平板上看不到的 console。
 * ⇒ AC-D8 的 `reason` 字段逐字要求「带原因」。
 */
describe('G249 —— 资产级降级项带真实失败原因（AC-D8 的 reason 字段）', () => {
  it('音效 404 ⇒ reason 写明「非 2xx」，不是那句对所有失败都一样的废话', async () => {
    stubFailingFetch()
    const audio = await import('../../src/services/audio')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    audio.unlockAudioSession()
    audio.playSfx('heart-lost')
    await flush()

    const hit = audio.audioDegradations().find((d) => d.key === 'sfx:heart-lost')
    expect(hit, '失败资源必须出现在降级清单里（1.17 面板要能看到）').toBeDefined()
    expect(
      hit!.reason,
      'reason 必须写明真实原因（这里是「响应非 2xx」），面板上家长才分得清「没部署」与「当时离线」',
    ).toContain('2xx')
    expect(
      hit!.reason,
      '不能是那句对所有失败都一样的通用废话 —— 那等于没带原因',
    ).not.toBe('音效加载或解码失败，已标记不再重试')
  })

  it('解码失败 ⇒ reason 里带着解码器抛出来的原话', async () => {
    const fetchMock = vi.fn<(url: string) => Promise<unknown>>(() =>
      Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const audio = await import('../../src/services/audio')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    audio.unlockAudioSession()
    const ctx = audio.getAudioContext() as unknown as {
      decodeAudioData: (b: ArrayBuffer) => Promise<unknown>
    }
    ctx.decodeAudioData = () => Promise.reject(new Error('解码器炸了'))
    audio.playSfx('zombie-died')
    await flush()

    const hit = audio.audioDegradations().find((d) => d.key === 'sfx:zombie-died')
    expect(hit, '解码失败也必须进降级清单').toBeDefined()
    expect(hit!.reason, '解码失败的原因要带原话 —— 面板上要能看出是解码器的问题').toContain('解码器炸了')
  })

  it('BGM 失败 ⇒ 同样带真实原因', async () => {
    stubFailingFetch()
    const audio = await import('../../src/services/audio')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    audio.unlockAudioSession()
    await flush()
    audio.prewarmBgm()
    await flush()

    const hit = audio.audioDegradations().find((d) => d.key === 'music:battle-loop')
    expect(hit, 'BGM 失败必须进降级清单').toBeDefined()
    expect(hit!.reason, 'BGM 的失败原因同样要写真话').toContain('2xx')
  })
})
