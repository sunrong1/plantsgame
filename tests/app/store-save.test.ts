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
 * ⇒ 本文件把「两样都喂」钉死。
 *
 * ⚠️📎 **`[CR]` 2026-10-21 删掉「与喂的顺序」这半句** —— 它是**文件头声称的覆盖
 *   并不存在**：AC-D1 要求「先喂 progress 再喂 state，顺序不可换」，而 10 条用例里
 *   **没有一条**断言顺序。更根本的是：这条 AC 在当前架构下**不可判定** ——
 *   `progress` 与 `state` 是两个独立 ref，先后赋值的结果完全一样，
 *   **没有任何可观测差异**能钉住顺序（AC 给的理由「喂反了会让进度条与战场对不上」
 *   在数据流上不成立：两者互不派生）。⇒ 登记为「AC 需要重写或明确降级」，
 *   别让一句做不到的叮嘱挂在文件头上冒充覆盖。
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
 * 4. 🔥📎 **`[CR]` 2026-10-21：每例 `vi.resetModules()`** —— 原先本文件在顶层
 *    `await import()` 一次，于是 `services/save.ts` 的模块级 `degraded`（一个 Map）
 *    **跨用例泄漏**。实测：在「读不到」那条前面插一条「留下一个 parse 降级」的用例，
 *    它的 `toEqual(['read'])` 立刻变成 `['parse', 'read']` 而红
 *    ⇒ **那条精确匹配的断言一直只在「前面的用例恰好清了降级表」时才成立**，
 *    是靠执行顺序的运气，不是判据。逐条重 import 每例一份干净的 Map。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Progress, State } from '../../src/core'
import { afterEachUninstall, installFakeStorage } from '../fixtures/fake-storage'
import type { FakeStorage } from '../fixtures/fake-storage'

let storage: FakeStorage
let info: ReturnType<typeof vi.spyOn>
let warn: ReturnType<typeof vi.spyOn>

/**
 * 📎 `[CR]` 2026-10-21：改成 `let` + 逐例 `beforeEach` 重 import ——
 * 见文件头第 4 点（`degraded` 跨用例泄漏）。类型走**动态 import 的返回值**，
 * 与 `level-flow.test.ts` 同一姿势。
 */
let core: typeof import('../../src/core')
let content: typeof import('../../src/content')
let saveApi: typeof import('../../src/services/save')
let store: typeof import('../../src/app/store')

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

beforeEach(async () => {
  // ⚠️ **先装 fake 再 import**：虽然 `save.ts` 是惰性读 `localStorage`，
  //   但顺序固定下来比「碰巧没关系」可靠 —— 将来某个模块在求值期就读它时，
  //   得到的是一份坏掉的 storage，而不是一条看不懂的报错。
  storage = installFakeStorage()
  // 🔥 每例一份干净的模块图：`degraded` 是 `services/save.ts` 的**模块级 Map**，
  //   不重置就会跨用例泄漏，让精确匹配的断言变成「靠执行顺序的运气」。
  vi.resetModules()
  core = await import('../../src/core')
  content = await import('../../src/content')
  saveApi = await import('../../src/services/save')
  store = await import('../../src/app/store')
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
    // 🚨📎 **`[CR]` 2026-10-21 新增（G220）**：AC-D4 逐字要求「降级项**已登记**
    //   （AC-B4）」，而这条路径原先**只 `console.warn`** ⇒
    //   `isSaveDegraded()` 仍为 false ⇒ **1.17 的面板一个字都不显示**。
    //   ⚠️ 上面已有的 WARN 计数断言**照不到它** —— 它数的是 console，不是降级表。
    expect(
      saveApi.isSaveDegraded(),
      '对局非法必须登记降级项 —— 不登记的话调试面板什么都不显示，家长看不到原因',
    ).toBe(true)
    expect(
      saveApi.saveDegradations().map((d) => d.key),
      "对局状态非法单开 'invariant' 键：既不是读不到(read)、也不是读不懂(parse)、也不是存不进去(write)",
    ).toContain('invariant')
    // 🔥📎 **`[CR]` 第六轮裁决 1（用户 2026-10-19）改判据，按 R-57 留痕。**
    //   原文逐字是「**对局非法 ⇒ 进度一并退回，避免留下半截事实**」，
    //   断言 `toEqual({ currentUnitIndex: 0, masteredWordIds: [] })`。
    //   ⇒ 判据**方向整个翻过来了**：降级只丢**对局**，**跨局进度保留**。
    //   理由：FR58 逐字「累计所得只增不减」；`progress` 是独立的、已通过结构校验的数据
    //   （R-06）；而「对局」与「进度」是两套持久化，AC-D4 逐字要丢的是前者。
    //   ⚠️ 旧判据里那句括注「避免留下半截事实」今天**不成立** ——
    //     丢的是「这一局」，而跨局已学的那 N 个词是**独立事实**，不因这一局作废而变假。
    //   ⇒ 行为守卫另见 `tests/app/resume-actionable.test.ts` 的 G175。
    expect(
      store.progress.value,
      '🔴 对局不合法就把跨局进度一并清空了 —— 裁决 1：降级只丢**对局**，不动进度（FR58）',
    ).toEqual(busyProgress)
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
    // 📎 同上，`[CR]` 第六轮裁决 1：降级只丢**对局**，不动跨局进度（留痕见上面那条）。
    expect(
      store.progress.value,
      '🔴 负心数就把跨局进度一并清空了 —— 裁决 1：降级只丢**对局**（FR58）',
    ).toEqual(busyProgress)
  })

  // 🚨📎 **`[CR]` 2026-10-21 新增：这条用例本身就是「模块隔离」的守卫。**
  //
  //   它**故意**在盘上留一份坏 JSON，让 `readSave()` 登记一条 `parse` 降级。
  //   下面那条 `toEqual(['read'])` 因此只有在「每例一份干净的 `degraded`」时
  //   才成立 —— 原先本文件顶层 import 一次、`degraded` 跨用例泄漏时，
  //   插入本条就会把下面那条打成 `['parse', 'read']`（**实测过**）。
  //   ⇒ 它锁住的是「逐例 `vi.resetModules()` 这条纪律」，不是读档的什么行为。
  it('G219：本用例故意留下一条 parse 降级（下一条靠它证明模块已隔离）', () => {
    storage.data.set(saveApi.SAVE_KEY, '{ 坏 JSON')

    store.enterLevel()

    expect(
      saveApi.saveDegradations().map((d) => d.key),
      '前置：本例确实在盘上留下了一条降级项 —— 留不下来说明夹具没生效',
    ).toEqual(['parse'])
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

// ══════════════════════════════════════════════════════════════════════════════
// 🔥📎 G260 —— 读档路径不许把异常抛给孩子（Epic 1 集成层检视，2026-10-22）
//
// ── 守的是什么 ──────────────────────────────────────────────────────────────
// **读档不走工厂**：存档里的 `currentGame` 是**外部数据**，
// 而 `parseSaveFile` 逐字声明「只校验『是对象或 null』，**不深校验**对局」
// ⇒ 一份 `currentGame: {}` 能通过它 ⇒ 随后的 `restored.deck.map` 抛 TypeError。
//
// ⚠️ **此前那两步规范化算在 `try` 之外** ⇒ 那个 TypeError
//   **逃出 `restoreFromSave` → 逃出 `enterLevel()` → 逃出 `StartView.onStart()`**
//   ⇒ **孩子的点击路径上出现技术错误**（NFR13），
//   而且存档**永远不会被重写** ⇒ 每次「开始游戏」重复同样的失败。
//
// ⚠️ 第二条：**「这个单元录了没有」**。
//   `assertInvariants` 现在校验 `unitNumber` 是 1 基正整数，
//   但**守不了「999 这个单元录了没有」** —— 那是**内容层**的知识
//   （`core/` 不 import `content/`）⇒ 由 app 层在读档路径上问一次。
//   ⇒ 否则孩子**答第一题**时 `sunPerCorrectFor(999)` 抛
//   「单元 999 落在未填档位上」⇒ 那时异常会逃出点击处理器，
//   **每一次答题都同样失败**，界面上只有 console 报错、没有孩子能懂的话。
//
// 📎 **变异实测（R-51）**：
//   · **M297** 把那两步规范化搬回 `try` 之外 ⇒ 全量 **1 红**，在 G260
//   · **M298** 去掉「这个单元录了没有」那一问 ⇒ 全量 **1 红**，在 G260
// ══════════════════════════════════════════════════════════════════════════════

describe('G260 —— 读档路径上的异常一律降级，不许冒到孩子的点击路径上', () => {
  it('🔴 `currentGame: {}`（结构合法但内容是空对象）⇒ 不抛，且降级为从头开始', () => {
    // ⚠️ `{}` 能通过 `parseSaveFile`（它只校验「是对象或 null」）——
    //   这正是它能一路走到 `restored.deck.map` 的原因。
    storage.data.set(
      saveApi.SAVE_KEY,
      JSON.stringify({
        schemaVersion: saveApi.SAVE_SCHEMA_VERSION,
        savedAt: 1_700_000_000_000,
        progress: busyProgress,
        currentGame: {},
      }),
    )

    expect(
      () => store.enterLevel(),
      '🔴 `currentGame: {}` 的存档把异常抛到了「开始游戏」的点击路径上 —— ' +
        '架构逐字：孩子面前永不出现技术错误（NFR13）；' +
        '而且存档**永远不会被重写** ⇒ 每次「开始游戏」重复同样的失败',
    ).not.toThrow()
    expect(store.view.value, '降级也必须照常进关（不能停在开始界面）').toBe('level')
    expect(store.state.value.hearts, '降级后的对局必须是初始那一局').toBe(3)
    expect(store.state.value.turn).toBe(1)
  })

  it('🔴 `currentGame` 属于**未录入的单元** ⇒ 不抛，且在读档那一刻就降级', () => {
    const bogus: State = { ...freshState(), unitNumber: 99 }
    seedSave(busyProgress, bogus)

    expect(
      () => store.enterLevel(),
      '🔴 未录入单元的存档把异常抛给了孩子 —— ' +
        '而且这条异常**不会**在读档时抛（`assertInvariants` 只守形状，不守「录了没有」）⇒ ' +
        '它会等到孩子**答第一题**时才从 `sunPerCorrectFor(999)` 抛出来 ⇒ ' +
        '**每一次答题都同样失败**，界面上只有 console 报错、没有孩子能懂的话',
    ).not.toThrow()
    expect(store.state.value.unitNumber, '降级后的战场必须是已录入的单元').toBe(1)
  })

  it('回归：合法的在途对局**照旧恢复**（不许被这两道新守卫顺手降级掉）', () => {
    const game = advancedState()
    seedSave(busyProgress, game)

    expect(() => store.enterLevel()).not.toThrow()
    expect(store.state.value.turn, '合法对局被降级了 —— 孩子的进度白丢了').toBe(game.turn)
    expect(store.state.value.hearts).toBe(game.hearts)
  })
})

/**
 * 🚨📎 **`[CR]` 2026-10-21 第二轮新增：G245 —— AC-C5 的**第二半句**此前**没有任何守卫**。**
 *
 * ── 它守的是什么 ───────────────────────────────────────────────────────────
 * AC-C5 逐字：「而**从内存恢复后立刻再存一次**，`progress` 与恢复进来的那份逐字相等。」
 *
 * ⚠️ **story 文档此前声称它有守卫 —— 那个声称是错的**：
 *   它指的是 `tests/app/save-integration.test.ts` 的「落盘结果能被 `readSave` 原样读回
 *   （端到端闭合）」—— 而那是**同一个常量写进去再读出来**（写→读往返），
 *   **中间根本没有「恢复」这一步** ⇒ 它证明的是「`writeSave` 忠实搬运它拿到的东西」，
 *   **不是**「从存档恢复之后，再存一次，落盘的仍与恢复进来的那份逐字相等」。
 *   ⇒ AC 的第二半句**零守卫覆盖**（守卫编号 G175 那条守着的是别的）。
 *
 * ── 为什么这条 AC 值得守 ───────────────────────────────────────────────────
 * 「恢复 → 再存一次」是**断点续学的常态路径**（孩子刷新页面 ⇒ 恢复 ⇒ 玩 ⇒ 落盘）。
 * 若恢复过程**动过**进度（少一条已掌握的词、把单元号重置成 0），
 * 那么**第一次落盘就会把这份损坏的进度写进盘上** ⇒ 一次刷新就把孩子的跨局成果抹掉，
 * 而界面上看不出任何异常（进度条只是少了几格）。
 * ⚠️ 旧实现里**真的有过**这个 bug：`restoreFromSave` 的 catch 分支曾写
 *   `progress.value = { currentUnitIndex: 0, masteredWordIds: [] }` ——
 *   一次内容回滚就把孩子全部跨局已学清空（已由 1.19 的裁决 1 修掉，
 *   但**成功路径**至今没有守卫）。
 */
describe('G245 —— 从存档恢复后立刻再存一次：落盘的与恢复进来的那份逐字相等', () => {
  it('恢复 → 再存一次 ⇒ 盘上的 progress 与**盘上原来那份**逐字相等', () => {
    const game = advancedState()
    seedSave(busyProgress, game)

    store.enterLevel()

    expect(
      store.progress.value,
      '前置：恢复确实把存档里那份进度喂了回来 —— 不成立的话下面在空转',
    ).toEqual(busyProgress)

    // 「立刻再存一次」：app 层把**恢复后的内存态**原样落盘。
    // ⚠️ 刻意**不**走 `applyAction`：那会推进一回合，进度自然就变了，
    //   而 AC 这一句问的是「恢复 ⇒ 再存」这条**原样**的往返。
    saveApi.writeSave(store.progress.value, store.state.value)

    const back = saveApi.readSave()
    expect(back, '前置：再存一次之后读得回来').not.toBeNull()
    expect(
      back?.progress,
      '🔴 恢复后再存一次，落盘的 progress 与恢复进来的那份**不**逐字相等 —— ' +
        '这意味着恢复过程动过进度，而第一次落盘就会把这份损坏写进盘上，' +
        '一次刷新就把孩子的跨局成果抹掉，且界面上看不出任何异常。',
    ).toEqual(busyProgress)
  })

  it('恢复 → 再存一次 ⇒ **那一局**还在（不是被换成了初始局面）', () => {
    const game = advancedState()
    seedSave(busyProgress, game)

    store.enterLevel()
    saveApi.writeSave(store.progress.value, store.state.value)

    const back = saveApi.readSave()
    expect(back, '前置：再存一次之后读得回来').not.toBeNull()
    // ⚠️ 断言**局面的形状**而不是整个对象逐字相等：恢复路径上有一道**规范化**
    //   （`dropOutOfDeckSkipped` / `backfillLegacyBuildPhase`，1.18/1.19 加的），
    //   它可能给旧存档补字段 ⇒ 逐字相等会把「合法的规范化」也判成违规。
    expect(
      back?.currentGame?.turn,
      '🔴 恢复后再存一次，在途的那一局不见了 —— 孩子刷新一次就回到这一局的起点，' +
        '而进度条还停在他刚才的位置。',
    ).toBe(game.turn)
    expect(
      back?.currentGame?.towers.length,
      '🔴 恢复后再存一次，已种下的塔不见了 —— 断点续学续的是「半局」，不是「重开」。',
    ).toBe(game.towers.length)
  })
})
