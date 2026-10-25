/**
 * @vitest-environment jsdom
 */
/**
 * `StartView` 点击 → 音频解锁的**接线**测试（DF-001；Story 1.2 的 AC-1 / FR2）。
 *
 * ── 这个文件守什么 ────────────────────────────────────────────────────────
 *   ① 点「开始游戏」⇒ `unlockAudioSequence()` **被调用**（守的是**接线**，不是函数本身）
 *   ② `unlockAudioSequence()` **先于** `enterLevel()`（FR2）
 *
 *   ② 为什么值得单独守：`src/views/StartView.vue` 逐字写着「`unlockAudioSequence()`
 *   必须在 `enterLevel()` 之前」，而**同一个文件**逐字写着「本文件没有 ESLint 兜底 …
 *   FR2 在本文件是**靠注释与审查**守着的，不是靠工具」⇒ 这一条此前**零自动化覆盖**。
 *   顺序错了的后果是静默的：手势上下文一旦被让出，Android 的音频解锁会失败，
 *   而失败的表现是「第一局没声音」，界面上完全看不出原因。
 *
 * ── 为什么这个缺口拖到今天才补（DF-001 的原委）────────────────────────────
 *   DF-001 逐字：「`StartView` 点击 → `unlockAudioSequence()` 的接线仍无任何测试覆盖」，
 *   原延后理由是「补组件测试要先装 DOM 测试环境」—— 而那条理由 **2026-10-15 就已失效**
 *   （`jsdom ^30.1.2` 早在 Story 1.9 装好，`vitest.config.ts` 也早就挂上了 `vue` plugin）。
 *   ⇒ 本文件把它结清。
 *
 * ── 为什么不用真音频 / 真 store ────────────────────────────────────────────
 *   这里要守的是**接线**，不是解锁本身（三步解锁各有各的测试，见 `tests/services/`）
 *   ⇒ `src/app/audio-unlock` 与 `src/app/store` 都用 `vi.mock` 拦掉：
 *   `unlockAudioSequence` / `enterLevel` 是**具名 ESM 导出**，对真实 ESM 命名空间做
 *   `vi.spyOn` 会抛 `Cannot redefine property`（`tests/components/quiz-card.test.ts`
 *   记着同一条教训）。
 *   ⇒ 顺序用一个**共享的调用日志数组**记录，而不是数调用次数 ——
 *   「各调了一次」证明不了**顺序**，而顺序就是 FR2 的全部内容。
 *
 * ── 判据纪律 ──────────────────────────────────────────────────────────────
 *   ① 断言只问接线，不重复测解锁的三步（重复测只会产生虚假的信心）
 *   ② 每条 `expect` 带中文失败消息（R-55）
 *   ③ 每个用例结束卸载组件（`enableAutoUnmount`）—— `state` 是模块级单例
 */

import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 调用日志 —— 必须用 `vi.hoisted` 提出来：
 * `vi.mock` 的工厂函数会被**提升**到 import 之前执行，那时普通 `const` 还没初始化
 * ⇒ 工厂里访问它会拿到 `undefined`（而不是数组）。
 */
const { callLog } = vi.hoisted(() => ({ callLog: [] as string[] }))

vi.mock('../../src/app/audio-unlock', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/app/audio-unlock')>()
  return {
    ...actual,
    unlockAudioSequence: vi.fn(() => {
      callLog.push('unlock')
    }),
  }
})

vi.mock('../../src/app/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/app/store')>()
  return {
    ...actual,
    enterLevel: vi.fn(() => {
      callLog.push('enter')
    }),
  }
})

import { unlockAudioSequence } from '../../src/app/audio-unlock'
import { enterLevel } from '../../src/app/store'
import StartView from '../../src/views/StartView.vue'

describe('AC-1 —— StartView 点击 → 音频解锁的接线（DF-001）', () => {
  enableAutoUnmount(afterEach)

  beforeEach(() => {
    callLog.length = 0
  })

  it('点「开始游戏」必须调 unlockAudioSequence() —— 否则 Android 音频永不解锁', async () => {
    const wrapper = mount(StartView)
    const button = wrapper.find('button.start-button')
    expect(button.exists(), 'StartView 里没有 button.start-button —— 点不到就等于没接线').toBe(true)

    await button.trigger('click')

    expect(
      vi.mocked(unlockAudioSequence),
      '点了「开始游戏」但 unlockAudioSequence() 没被调用 ⇒ 音频解锁链断了（AC-1）',
    ).toHaveBeenCalledTimes(1)
    expect(
      vi.mocked(enterLevel),
      '点了「开始游戏」但 enterLevel() 没被调用 ⇒ 进不了关（这与解锁是两条独立的接线）',
    ).toHaveBeenCalledTimes(1)
  })

  it('解锁必须发生在 enterLevel() 之前（FR2：手势上下文一旦让出，Android 解锁静默失败）', async () => {
    const wrapper = mount(StartView)
    await wrapper.get('button.start-button').trigger('click')

    expect(
      callLog,
      '调用顺序不是「先解锁、再进关」⇒ FR2 被破坏：手势上下文在解锁完成前就被让出，' +
        'Android 上音频解锁会静默失败（表现为第一局没声音）',
    ).toEqual(['unlock', 'enter'])
  })

  it('没点按钮就一次都不许调（接线挂在点击上，不是挂在挂载上）', async () => {
    mount(StartView)

    expect(
      callLog,
      '组件刚挂载就调了解锁/进关 ⇒ 接线挂错地方了：解锁必须是用户手势触发的',
    ).toEqual([])
  })
})
