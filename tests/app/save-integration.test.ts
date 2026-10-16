/**
 * 存档的**端到端**接线守卫（Story 1.15 / AC-E2 的接线那一半、G78 的接线那一半）。
 *
 * ── 守什么 ──────────────────────────────────────────────────────────────────
 * G78（R-06 的守卫）验的是 `writeSave` 这个**函数**的契约：
 * 「局末写盘后 `currentGame === null` 且 `progress` 逐字不变」。
 * 而真正会出事的地方在**接线**：`effects-runner` 传给 `writeSave` 的第一个实参
 * 到底是不是 store 里那份 `progress`。
 *
 * 🔥 **实测证据（M90 变异）**：把 `effects-runner.ts` 的
 *   `writeSave(progress, effect.currentGame)` 改成
 *   `writeSave({ currentUnitIndex: 0, masteredWordIds: [] }, effect.currentGame)`，
 *   **整个测试套件 41 文件 / 1460 条一条都没红**。
 *   ⇒ 「局末把进度一起清掉」这个 R-06 点名的错误，当时**没有任何东西守着**。
 *   ⇒ 本文件就是那道缺口。写它不是重写 G78，而是**补上 G78 够不着的那一段**。
 *
 * ── 为什么单独一个文件 ──────────────────────────────────────────────────────
 * 本文件必须**同时**用到真实的 `effects-runner` 与真实的 `services/save`。
 * 而 `tests/app/effects-runner-save.test.ts` 为了制造「写盘抛错」把 `save` 整个 mock 掉了，
 * `tests/services/save.test.ts` 又完全不经过 runner —— 两边之间的那一段没人走。
 *
 * ⚠️ `services/audio` 必须 mock（它会去真解码 mp3）；`localStorage` 必须装 fake
 *   （全仓唯一一份，`R-37`）。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Progress, State } from '../../src/core'
import { afterEachUninstall, installFakeStorage } from '../fixtures/fake-storage'
import type { FakeStorage } from '../fixtures/fake-storage'

vi.mock('../../src/services/audio', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/audio')>()
  return { ...actual, playSfx: vi.fn(), startBgmIfReady: vi.fn() }
})

let storage: FakeStorage

const core = await import('../../src/core')
const content = await import('../../src/content')
const saveApi = await import('../../src/services/save')
const { runEffectsFromStore } = await import('../../src/app/effects-runner')
const store = await import('../../src/app/store')

/** 一份非空进度 —— 空进度会让「传错对象」这类变异看不出来。 */
const busyProgress: Progress = { currentUnitIndex: 2, masteredWordIds: ['u1-hello', 'u1-cat'] }

function freshState(): State {
  return core.createInitialState({ unitNumber: 1, deck: content.entriesOf(1) })
}

beforeEach(() => {
  storage = installFakeStorage()
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEachUninstall()

/** 从 fake 里读回落盘的那份（绕开 `readSave()`，我们要验的是**盘上的字节**）。 */
function readRawSave(): { progress: Progress; currentGame: State | null } {
  const raw = storage.data.get(saveApi.SAVE_KEY)
  // ⚠️ `Map.get` 的缺席值是 `undefined` 而不是 `null` —— 只判 `=== null` 会把
  //   「没落盘」当成「落了个 undefined 进去」，JSON.parse 立刻报一个看不懂的错。
  if (raw === undefined) throw new Error('盘上根本没有存档 —— 接线没落盘')
  return JSON.parse(raw) as { progress: Progress; currentGame: State | null }
}

/** 合成一个 `resolving → level-complete` 的 `(prev, next)`。 */
function levelCompletePair(): { prev: State; next: State } {
  const base = freshState()
  return {
    prev: { ...base, hearts: 3, phase: { kind: 'resolving' } },
    next: { ...base, hearts: 3, phase: { kind: 'level-complete' } },
  }
}

describe('🔥 R-06 接线 —— 局末落盘：currentGame 清空而 progress 逐字保留', () => {
  it('走真实 runner + 真实 writeSave：盘上的 progress 逐字等于传进去的那份', () => {
    const { prev, next } = levelCompletePair()

    runEffectsFromStore({ type: 'CONTINUE' }, prev, next, busyProgress)

    const saved = readRawSave()
    // ⚠️ **逐字**（`JSON.stringify` 比对）而不是 `toEqual` 的一半：
    //   `toMatchObject` 式的宽松断言会让「少一个键」照样通过，
    //   而 R-06 点的正是「进度被清掉」这一类**整体消失**。
    expect(
      JSON.stringify(saved.progress),
      '盘上的 progress 必须与传进 runner 的那份逐字相同 —— 换一份空对象进来就是 R-06 那个错误（M90）',
    ).toBe(JSON.stringify(busyProgress))
  })

  it('同一份落盘里 currentGame 必须是 null（局末清空战场）', () => {
    const { prev, next } = levelCompletePair()

    runEffectsFromStore({ type: 'CONTINUE' }, prev, next, busyProgress)

    expect(
      readRawSave().currentGame,
      '局末的 currentGame 必须是 null —— 存 next 进去就是 R-06 点名的另一种错法（M89）',
    ).toBeNull()
  })

  it('round-over 落盘：currentGame 是完整对局，而 progress 同样逐字保留', () => {
    const base = freshState()
    const prev: State = { ...base, hearts: 2, phase: { kind: 'resolving' } }
    const next: State = { ...base, hearts: 2, phase: { kind: 'round-over' } }

    runEffectsFromStore({ type: 'CONTINUE' }, prev, next, busyProgress)

    const saved = readRawSave()
    expect(
      saved.currentGame?.phase.kind,
      'round-over 必须把对局本身落盘 —— 否则断点续学恢复不出战场',
    ).toBe('round-over')
    expect(JSON.stringify(saved.progress), 'progress 在非局末相位同样必须逐字保留').toBe(
      JSON.stringify(busyProgress),
    )
  })

  it('落盘结果能被 readSave 原样读回（端到端闭合）', () => {
    const { prev, next } = levelCompletePair()

    runEffectsFromStore({ type: 'CONTINUE' }, prev, next, busyProgress)
    const back = saveApi.readSave()

    expect(back, '落盘的结果必须能被自己的读接口认回来').not.toBeNull()
    expect(back?.currentGame).toBeNull()
    expect(back?.progress).toEqual(busyProgress)
  })
})

describe('🔥 store → runner 那一步的实参（偏离 3 守护）', () => {
  beforeEach(() => {
    store.state.value = freshState()
    const phase = store.state.value.phase
    const currentEntryId = phase.kind === 'awaiting-answer' ? phase.question.entryId : null
    store.progress.value = {
      ...busyProgress,
      // ⚠️ 刻意**排除**本题的 entryId：`advanceProgress` 只在「这次真的新增了一个词」时
      //   才增长（`masteredWordIds` 只增不减），预设里已经会这道题 ⇒ 答对了长度也不动，
      //   下面那条「落盘比内存少一条」的判据就永远不成立。
      //   （首版就是踩了这个：预设含 `u1-hello` 而首题恰是它 ⇒ 断言 2 vs 1 红。）
      masteredWordIds: busyProgress.masteredWordIds.filter((id) => id !== currentEntryId),
    }
  })

  it('applyAction 落盘的 progress 必须是 store 里那一份，不是某个硬编码对象', () => {
    // 🔥 **实测证据（M97 变异）**：把 `applyAction` 里
    //   `runEffectsFromStore(action, prev, next, progress.value)`
    //   改成传一个字面量空进度，**整个套件 1464 条 0 红**。
    //   ⇒ `applyAction` 到底传了哪个对象，此前没有任何东西守着 ——
    //   而那正是本 story 唯一一处「跨模块传错对象还全绿」的缝。
    //
    // ⚠️ 这里断言的是「**逐字等于 store 落笔前那份**」，而不是「等于某个具体数字」：
    //   偏离 3 决定了落盘比内存态少一条本次新掌握的词（`advanceProgress` 排在
    //   `runEffects` 之后，1.13 AC-B3 逐字要求），所以拿 `store.progress.value`
    //   —— 那是**已经前进过**的那份 —— 去比必然失败。判据要比的是**传进去的那份**。
    const progressAtDispatch = { ...store.progress.value }

    store.applyAction(core.answer(correctIdOfCurrentQuestion()))

    const saved = readRawSave()
    expect(
      JSON.stringify(saved.progress),
      '落盘的 progress 必须逐字等于 dispatch 那一刻 store 里的那一份（M97：传字面量空对象）',
    ).toBe(JSON.stringify(progressAtDispatch))
  })

  it('⚠️ 落盘比内存态少一条本次新掌握的词 —— 偏离 3 的实测钉子', () => {
    const before = store.progress.value.masteredWordIds.length

    store.applyAction(core.answer(correctIdOfCurrentQuestion()))

    // 夹具自检先跑：若预设里已经会这道题，下面那条判据就是「恒真」而非「钉子」。
    expect(
      store.progress.value.masteredWordIds.length,
      '夹具自检：本题确实新增了一条（预设里不能已经会这道题）',
    ).toBe(before + 1)
    expect(
      readRawSave().progress.masteredWordIds.length,
      '落盘的词数 = 内存里的词数 − 1（advanceProgress 排在 runEffects 之后，1.13 AC-B3）',
    ).toBe(store.progress.value.masteredWordIds.length - 1)
  })
})

/** store 里当前题的正确选项 id。 */
function correctIdOfCurrentQuestion(): string {
  const phase = store.state.value.phase
  if (phase.kind !== 'awaiting-answer') throw new Error(`相位是 ${phase.kind}，不是 awaiting-answer`)
  const hit = phase.question.card.options.find((o) => o.correct)
  if (hit === undefined) throw new Error(`题 ${phase.question.entryId} 没有正确项`)
  return hit.id
}
