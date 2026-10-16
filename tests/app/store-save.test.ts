/**
 * `enterLevel()` 的读档接线守卫（Story 1.15 / AC-D1、AC-D4）。
 *
 * ── 守什么 ──────────────────────────────────────────────────────────────────
 * 「进关时把存档喂回 `progress` 与 `state`」这条接线有三种坏法，
 * 而它们在界面上**都**长成「重进后从头开始」：
 *   · 压根不读（写盘正常、读盘从没接过）
 *   · 读了但只喂 `progress`，`state` 没换 ⇒ 孩子回到第 1 回合，
 *     而进度条已经显示 12/37 —— 两块 HUD 自相矛盾，无报错
 *   · 读了、喂了 `state`，但**没喂 `progress`** ⇒ 进度条肉眼可见回退，
 *     而 `ProgressBar.vue` 的文件头逐字写着「若出现回退，那不是动画该掩盖的事」
 * ⇒ 本文件把「两样都喂」与「喂的顺序」分别钉死。
 *
 * ── 为什么 ──────────────────────────────────────────────────────────────────
 * 1. **`readSave()` 真的被调**，且**在 `view` 切到 level 之后**才调 ——
 *    顺序反了会让 `readSave()` 抛时孩子停在开始界面（NFR13）。
 * 2. **恢复失败时不抛、不弹窗**：AC-D4 逐字「安全降级」，而同一条 AC 又逐字
 *    「仅通过日志与返回值暴露，不呈现在任何画面上」。「不抛」是那条 AC 在
 *    代码侧唯一的可断言形态。
 * 3. **`localStorage` 用共享 fake**（R-37：`tests/fixtures/fake-storage.ts`
 *    是全仓唯一一份）。不装的话 `readSave()` 会静默降级成 `'read'`，
 *    **没有一条用例变红** —— 守卫自己先漏那就太难看了。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Progress, State } from '../../src/core'
import { afterEachUninstall, installFakeStorage } from '../fixtures/fake-storage'
import type { FakeStorage } from '../fixtures/fake-storage'

let storage: FakeStorage
let info: ReturnType<typeof vi.spyOn>
let warn: ReturnType<typeof vi.spyOn>

const core = await import('../../src/core')
const content = await import('../../src/content')
const saveApi = await import('../../src/services/save')
const store = await import('../../src/app/store')

/** 一份结构合法的初始对局。 */
function freshState(): State {
  return core.createInitialState({ unitNumber: 1, deck: content.entriesOf(1) })
}

/** 造一份「第 3 回合、有塔、已掉一心」的对局 —— 与初始开局明显不同。 */
function advancedState(): State {
  const base = freshState()
  const q = base.phase.kind === 'awaiting-answer' ? base.phase.question : null
  if (q === null) throw new Error('开局不是 awaiting-answer')
  const correct = q.card.options.find((o) => o.correct)
  if (correct === undefined) throw new Error('题上没有正确项')
  const answered = core.reduce(base, core.answer(correct.id))
  return core.reduce(answered, core.placeTower('u1-hello', core.cellKey(core.ZOMBIE_ROW, 1)))
}

/** 直接往 fake 里塞一份存档（绕过写盘，测的是**读**这一侧）。 */
function seedSave(progress: Progress, currentGame: State | null): void {
  storage.data.set(
    saveApi.SAVE_KEY,
    JSON.stringify({
      schemaVersion: saveApi.SAVE_SCHEMA_VERSION,
      savedAt: 1_700_000_000_000,
      progress,
      currentGame,
    }),
  )
}

const busyProgress: Progress = { currentUnitIndex: 2, masteredWordIds: ['u1-hello', 'u1-cat'] }

beforeEach(() => {
  storage = installFakeStorage()
  info = vi.spyOn(console, 'info').mockImplementation(() => {})
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  store.state.value = freshState()
  store.progress.value = { currentUnitIndex: 0, masteredWordIds: [] }
  store.view.value = 'start'
})

afterEachUninstall()

describe('AC-D1 —— enterLevel 把存档喂回 progress 与 state', () => {
  it('没有存档时照常进关，进度与对局都是初始值', () => {
    store.enterLevel()

    expect(store.view.value, '读不到存档也必须照常进关（不能停在开始界面）').toBe('level')
    expect(store.progress.value, '没有存档 ⇒ 进度就是初始值').toEqual({
      currentUnitIndex: 0,
      masteredWordIds: [],
    })
    expect(store.state.value.turn, '没有存档 ⇒ 对局就是初始那一局').toBe(1)
    expect(
      warn.mock.calls.filter((c: unknown[]) => String(c[0]).startsWith('[save]')).length,
      '第一次玩不该有任何 [save] WARN —— 那会让孩子看到技术噪音',
    ).toBe(0)
    // ⚠️ 顺带钉住「读档不记 INFO」：`writeSave` 成功那条 INFO 是 INFO 级（R-14 / NFR14），
    //   但**读**这一侧一次都不该记 —— 每开一次关页就打一行日志，孩子看得见、家长也看不懂。
    expect(info.mock.calls.length, '读档路径不该记任何 INFO —— 只有写盘成功才记').toBe(0)
  })

  it('有存档时 progress 与 state 两样都恢复', () => {
    const game = advancedState()
    seedSave(busyProgress, game)

    store.enterLevel()

    expect(store.progress.value, '跨局进度必须逐字恢复').toEqual(busyProgress)
    expect(store.state.value.towers.length, '对局必须真的换掉 —— 只换 progress 会让两块 HUD 自相矛盾').toBe(
      game.towers.length,
    )
    expect(store.state.value.phase.kind, '相位必须跟着回来').toBe(game.phase.kind)
    expect(store.state.value.turn, '回合号必须跟着回来').toBe(game.turn)
    expect(store.view.value).toBe('level')
  })

  it('读档排在 view 切到 level 之后（读失败也不该把孩子留在开始界面）', () => {
    storage.throwOnGet = true

    store.enterLevel()

    expect(
      store.view.value,
      '即使读档彻底失败，视图也必须已经进关 —— NFR13 禁止任何技术错误出现在孩子面前',
    ).toBe('level')
  })

  it('currentGame 为 null（局末清空）时只恢复进度，不动对局', () => {
    seedSave(busyProgress, null)
    const before = store.state.value

    store.enterLevel()

    expect(store.progress.value, '进度必须恢复 —— 这正是 R-06 要守的那一半').toEqual(busyProgress)
    expect(
      store.state.value,
      '局末清空的对局不该被塞回战场：重进要回到该单元起点，而不是一个终态',
    ).toBe(before)
  })

  it('读档在 view 已切换之后才发生（顺序守卫：view 必须是 level）', () => {
    // ⚠️ 用 fake 的调用记录间接证明顺序：`enterLevel` 内部的 `view.value = 'level'`
    //   发生在 `readSave()` 之前，而 `readSave` 是唯一会碰 localStorage 的地方。
    //   ⚠️ 这条**只能证明「读了」**，证不了「在 view 之后」——
    //   真正的顺序由上面那条「读失败仍停在 level」间接兜住。
    seedSave(busyProgress, advancedState())

    store.enterLevel()

    expect(storage.calls.map((c) => c.op), '进关时必须真读了一次存档').toContain('get')
  })
})

describe('AC-D4 —— 恢复失败安全降级：不抛、不弹窗、照常开局', () => {
  it('JSON 损坏 ⇒ 降级为 parse、进度回到初始、对局回到初始', () => {
    storage.data.set(saveApi.SAVE_KEY, '这不是 JSON')

    expect(() => store.enterLevel(), '恢复失败不得抛 —— app 层调用链上没有 try/catch').not.toThrow()
    expect(store.view.value, '即使恢复失败也必须照常进关').toBe('level')
    expect(store.progress.value).toEqual({ currentUnitIndex: 0, masteredWordIds: [] })
    expect(store.state.value.turn, '对局必须退回初始那一局').toBe(1)
    expect(
      warn.mock.calls.filter((c: unknown[]) => String(c[0]).startsWith('[save]')).length,
      '必须有一条 [save] WARN —— AC 逐字「仅通过日志与返回值暴露」',
    ).toBe(1)
  })

  it('schemaVersion 不匹配 ⇒ 同样安全降级', () => {
    storage.data.set(
      saveApi.SAVE_KEY,
      JSON.stringify({ schemaVersion: 999, savedAt: 1, progress: busyProgress, currentGame: null }),
    )

    expect(() => store.enterLevel()).not.toThrow()
    expect(store.progress.value, '降级就是从头开始，进度也不能留下').toEqual({
      currentUnitIndex: 0,
      masteredWordIds: [],
    })
    expect(saveApi.isSaveDegraded(), '降级项必须登记，1.17 的面板照它显示').toBe(true)
  })

  it('🚨 对局违反不变量 ⇒ 降级为从头开始，且**不抛**', () => {
    // ⚠️ 构造一个**结构合法但状态非法**的对局：`hearts` 超过上限。
    //   `assertInvariants` 在 `core/` 里照抛（NFR12 第一层），
    //   必须是 app 层接住并降级 —— 这正是本用例要钉的分界。
    const broken: State = { ...freshState(), hearts: 99 }

    expect(() => core.assertInvariants(broken), '前置：这份对局确实违反不变量').toThrow()
    seedSave(busyProgress, broken)

    expect(
      () => store.enterLevel(),
      '不变量不过时不得把错误冒给孩子 —— 架构逐字：孩子面前永不出现技术错误',
    ).not.toThrow()

    expect(store.state.value.hearts, '对局必须退回初始那一局').toBe(3)
    expect(store.state.value.turn).toBe(1)
    expect(store.progress.value, '对局非法 ⇒ 进度一并退回，避免留下半截事实').toEqual({
      currentUnitIndex: 0,
      masteredWordIds: [],
    })
    expect(
      warn.mock.calls.filter((c: unknown[]) => String(c[0]).startsWith('[save]')).length,
      '必须留一条 [save] WARN 说明为什么退回',
    ).toBe(1)
  })

  it('🚨 心数为**负**同样退回 —— `deferred-work.md` 1.14 第 1 条（M117）的反向断言', () => {
    // 📎 **M117 的到期条件在 1.15 首次成立**（`deferred-work.md`「Deferred from: story-1-14」
    //   第 1 条逐字写「Story 1.15 或 1.16 动 `RESTART_LEVEL` / **心数写入路径**时，
    //   同一次改动里补一条反向断言」）。1.15 正是新增了第二条心数写入路径：
    //   `restoreFromSave` 把 localStorage 里的 `hearts` 直接写进 `state.value` ——
    //   在此之前 `hearts` 只可能由 reducer 产生。
    // ⚠️ **为什么上半界那条不够**：`parseSaveFile` 只做「是不是对象」的底线校验
    //   （深校验是 `core/` 的职责），所以 `hearts` 能以**任意**数字走到
    //   `assertInvariants` 面前 ⇒ 两端都得有人挡。
    const negative: State = { ...freshState(), hearts: -1 }

    expect(
      () => core.assertInvariants(negative),
      '前置：`assertCounters` 的 `state.hearts < 0` 这一半真的在挡（把它去掉本用例就红）',
    ).toThrow()
    seedSave(busyProgress, negative)

    expect(() => store.enterLevel(), '负心数不得冒给孩子').not.toThrow()
    expect(store.state.value.hearts, '负心数必须退回初始值').toBe(3)
    expect(store.progress.value, '对局非法 ⇒ 进度一并退回').toEqual({
      currentUnitIndex: 0,
      masteredWordIds: [],
    })
  })

  it('localStorage 读不到（无痕模式）⇒ 降级为 read，不抛', () => {
    storage.throwOnGet = true

    expect(() => store.enterLevel()).not.toThrow()
    expect(store.view.value).toBe('level')
    expect(
      saveApi.saveDegradations().map((d) => d.key),
      '读侧失败要归 read，不能归 parse —— 归错会让 1.17 对家长说错原因',
    ).toEqual(['read'])
  })
})
