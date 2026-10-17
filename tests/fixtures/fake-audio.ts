/**
 * Web Audio / TTS 的可编程 fake（`tests/services/audio.test.ts` 与 1.17 的降级面板测试共用）。
 *
 * ── 为什么提到 fixture ─────────────────────────────────────────────────────
 * Node 与 jsdom 里**都没有** `AudioContext`，而 `src/services/audio.ts` 在**模块求值期**
 * 就会去拿它 —— 漏 stub 会得到一个与「你忘了 stub 什么」毫无关联的 `ReferenceError`。
 * 1.17 要测「音频降级项能被面板列出来」就必须**真的跑一次 404**，
 * 那需要同一套 fake。⇒ 两处各写一份就是 `tests/fixtures/fake-storage.ts` 文件头
 * 点名的那个 P0：「同一份东西抄多份，抄的那份先坏、真守卫后坏，全套仍绿」。
 *
 * ── ⚠️ 状态由本模块持有，测试通过 {@link fakeAudio} 读 ──────────────────────
 * 类**不自注册**，一切记录都落在 `fakeAudio` 这一个对象上 ⇒ 测试文件之间不共享、
 * 但同一文件内**每次 `resetFakeAudio()` 都拿到干净的一份**。
 *
 * ── 刻意不做的（与 `fake-storage.ts` 同款理由）─────────────────────────────
 * · 不模拟真实音频 —— `decodeAudioData` 直接给一个假 buffer；
 * · 不模拟设备限制（iOS 的 `numberOfInputs`、静音开关）——
 *   `audio.ts` 里那些分支由它自己的测试用 `getAudioContext()` 返 `null` 覆盖；
 * · 不实现 `speechSynthesis` 的事件时序 —— `pronunciation` 只需要「调过 speak」。
 */

import { vi } from 'vitest'

/** 一次性的 buffer 源节点（复现「第二次 `start()` 不出声」那条 Web Audio 规则）。 */
export class FakeBufferSource {
  buffer: unknown = null
  loop = false
  connectedTo: unknown = null
  startCalls = 0
  stopCalls = 0
  onended: (() => void) | null = null

  connect(target: unknown): void {
    this.connectedTo = target
  }

  start(): void {
    this.startCalls += 1
  }

  stop(): void {
    this.stopCalls += 1
  }
}

/** 可解锁、可解码、可起播的 `AudioContext` 替身。 */
export class FakeAudioContext {
  resumeCalls = 0
  state = 'suspended'
  destination = {}
  /** 起播记录：每一次 `source.start()` 记一笔，供「重复触发只请求一次」等断言读。 */
  readonly started: FakeBufferSource[] = []

  resume(): Promise<void> {
    this.resumeCalls += 1
    if (fakeAudio.resumeRejects) {
      return Promise.reject(new Error('resume 被拒绝'))
    }
    this.state = 'running'
    return Promise.resolve()
  }

  createBufferSource(): FakeBufferSource {
    const source = new FakeBufferSource()
    this.started.push(source)
    return source
  }

  decodeAudioData(): Promise<unknown> {
    return Promise.resolve({ fake: 'decoded' })
  }
}

/** fake TTS：记录真正被 speak 的 utterance，供断言预热与三步同步块。 */
export class FakeUtterance {
  volume = 1
  rate = 1
  pitch = 1
  voice: unknown = null
  lang = ''
  onend: (() => void) | null = null
  onerror: (() => void) | null = null

  constructor(public text: string) {}
}

/** 全部记录与开关，测试直接读这一个对象。 */
export const fakeAudio = {
  /** 每例新建一份 `AudioContext` 的记录。 */
  contexts: [] as FakeAudioContext[],
  /** 真正被 `speak` 的 utterance。 */
  spoken: [] as FakeUtterance[],
  /** 让下一次 `resume()` 的 Promise 被拒绝。 */
  resumeRejects: false,
}

/** 清空记录与开关。**每个用例前调它** —— 否则计数会跨用例累积。 */
export function resetFakeAudio(): void {
  fakeAudio.contexts = []
  fakeAudio.spoken = []
  fakeAudio.resumeRejects = false
}

/**
 * 装上三个全局替身（`AudioContext` / `speechSynthesis` / `SpeechSynthesisUtterance`）。
 *
 * ⚠️ **`new FakeAudioContext()` 由本函数包一层**，好让每个新建的 context
 *   都进 `fakeAudio.contexts` —— 类自己不认识那个数组。
 */
export function installFakeAudio(): void {
  const Recording = class extends FakeAudioContext {
    constructor() {
      super()
      fakeAudio.contexts.push(this)
    }
  }
  vi.stubGlobal('AudioContext', Recording)
  vi.stubGlobal('speechSynthesis', {
    voices: [{ name: 'Samantha', lang: 'en-US' }],
    speaking: false,
    cancel: () => {},
    getVoices: () => [{ name: 'Samantha', lang: 'en-US' }],
    onvoiceschanged: null,
    speak: (utterance: FakeUtterance) => {
      fakeAudio.spoken.push(utterance)
    },
  })
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)
}

/**
 * 让 `fetch` 一律 404，并返回一个 mock 供「请求了几次 / URL 是什么」读。
 *
 * ⚠️ **只造失败**。成功那条由 `audio.test.ts` 自己的 helper 造 ——
 *   两份 helper 的差别是「一个恒成功、一个恒失败」，合成一个带开关的会让人
 *   在 40 处断言里各自记住那个开关当前是什么。
 */
export function stubFailingFetch(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn<(url: string) => Promise<unknown>>(() =>
    Promise.resolve({ ok: false, status: 404, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/** 让 promise 队列跑够拍数，等 fetch / decode 的 `.then` 落地。 */
export async function flush(times = 5): Promise<void> {
  for (let i = 0; i < times; i += 1) await Promise.resolve()
}
