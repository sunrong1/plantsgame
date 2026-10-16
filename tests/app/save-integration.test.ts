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
    // 📎 **1.16 裁决 11 把比对的对象换了**（R-57 留痕）：要旨一个字没变
    //   （落盘的那份必须来自 store 的 `progress`，不是硬编码字面量），
    //   换的是「与谁比」—— 从 dispatch **之前**那一份改成 dispatch **之后**那一份。
    //   理由：1.16 把 `advanceProgress` 提到了 `runEffectsFromStore` **之前**，
    //   而同一个 `nextProgress` 既递进 runner 又赋给 `progress.value`
    //   ⇒ 落盘的那份与 `store.progress.value` 是**同一个对象**，口径比原来更强
    //   （顺带钉住 AC-C2 第 1 条「写盘看到的是结算后的那份」）。
    const progressAtDispatch = { ...store.progress.value }

    store.applyAction(core.answer(correctIdOfCurrentQuestion()))

    const saved = readRawSave()
    expect(
      JSON.stringify(saved.progress),
      '落盘的 progress 必须逐字等于 store 落笔后的那一份（M97：传字面量空对象）',
    ).toBe(JSON.stringify(store.progress.value))
    expect(
      JSON.stringify(saved.progress),
      '1.16 裁决 11：落盘的那份与 dispatch 前的「旧」那一份只差在这次结算的增量上 —— ' +
        '若两者逐字相同，说明这次 dispatch 本该有增量而没有（夹具失效）',
    ).not.toBe(JSON.stringify(progressAtDispatch))
  })

  it('🔥 落盘 = 内存态，且**包含**本次新掌握的词 —— 1.16 裁决 11 消解了偏离 3', () => {
    // 📎 **1.16 `[CS]` 裁决 11 改写了这条判据**（原写「落盘比内存少一条」，R-57 留痕）。
    //   原判据记录的是 1.15 的**偏离 3**：写盘排在 `advanceProgress` 之前，
    //   实测症状是「答完一题立刻关页面，盘上少一个词」。
    //   ⇒ 现在反过来钉：**答题这一次 dispatch 之后，盘上就已经有这个词**。
    //
    // ⚠️ 这条判据的**全部鉴别力**在于「答题之后立刻查盘」——
    //   再多跑一次 `startRound()`，`awaiting-build` 那个写盘点就会把它补上，
    //   判据随即恒绿（1.16 `[DS]` 实测过这个形态，见 `tests/app/level-flow.test.ts` 的 G96）。
    const before = store.progress.value.masteredWordIds.length

    store.applyAction(core.answer(correctIdOfCurrentQuestion()))

    // 夹具自检先跑：若预设里已经会这道题，下面那条判据就是「恒真」而非「钉子」。
    expect(
      store.progress.value.masteredWordIds.length,
      '夹具自检：本题确实新增了一条（预设里不能已经会这道题）',
    ).toBe(before + 1)
    expect(
      readRawSave().progress.masteredWordIds.length,
      '落盘的词数必须已经等于内存里的词数 —— 不许「等下一次 dispatch 再补」',
    ).toBe(store.progress.value.masteredWordIds.length)
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
