/**
 * 降级重建：**单元号从存档的 progress 取**（Epic 1 集成层检视 / G261，2026-10-22）。
 *
 * ── 这个文件为什么要单独开一个 ──────────────────────────────────────────────
 * 「降级之后重建的那一局，属于**哪个单元**」这件事，
 * 在**当前内容下是观测不到的** —— 全仓只录了单元 1，
 * 而 `progress.currentUnitIndex` 无论指向哪个单元，重建结果都是单元 1。
 * ⇒ 一条**行为守卫**写在这里会**恒绿**（R-51 第 1 类失效），
 *   而它守的那个洞（单元 2 一录进来就复发）是真的。
 *
 * ⇒ 所以本文件**把单元 2 造出来**：用 `vi.doMock` 把内容层换成
 *   「单元 1 + 一个由单元 1 克隆出来的单元 2」。
 *   ⚠️ 这不是「为了让守卫能过而造假」—— 它是**唯一能让这条判据有鉴别力的办法**：
 *     单元 2 一旦真的录进 `src/content/units/`，本文件的断言会**一字不改地**继续成立，
 *     而它守的那条（单元号取自 progress 而不是 `state.value.unitNumber`）
 *     从此在**真实内容**上也成立。
 *
 * ── 它守的洞（为什么这条重要）──────────────────────────────────────────────
 * 降级重建此前逐字是 `buildStateFor(state.value.unitNumber)` ——
 * 而抛错发生在 `state.value = assertInvariants(...)` **之前**
 * ⇒ 那一刻 `state.value` 还是模块求值期那份 `ref(initialState())`，**恒为单元 1**。
 * ⇒ 重建出来的对局永远是**单元 1 的题单**，而 `progress.value` 保留的是
 *   存档里的 `currentUnitIndex`（可能指向单元 2）
 * ⇒ **跨局进度与战场单元号分家**：进度条写着「21/37」，战场却是从头开始的单元 1。
 *
 * ⚠️ **为什么单元 2 必须「录了」才算这个洞成立**：
 *   档位表（`BALANCE_TIERS`）覆盖单元 1–4 ⇒ 单元 2 的数值是有的；
 *   缺的是**内容**（`entriesOf(2)` 会抛）⇒ 所以本文件连内容一起造。
 *
 * ── 判据纪律 ──────────────────────────────────────────────────────────────
 * 每条都问**行为**（重建出来的战场属于哪个单元），不判源码形状。
 *
 * 📎 **变异实测（R-51）**：**M299** 把 `buildStateFor(targetUnitNumber)`
 *   改回 `buildStateFor(state.value.unitNumber)` ⇒ 全量 **3 红**，全在 G261。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Progress, State } from '../../src/core'
import { afterEachUninstall, installFakeStorage } from '../fixtures/fake-storage'
import type { FakeStorage } from '../fixtures/fake-storage'

let storage: FakeStorage
let warn: ReturnType<typeof vi.spyOn>

let core: typeof import('../../src/core')
let content: typeof import('../../src/content')
let saveApi: typeof import('../../src/services/save')
let store: typeof import('../../src/app/store')

/** 单元 1 的词条 —— 克隆单元 2 的原料。 */
type ContentEntry = {
  entryId: string
  wordId: string
  towerType: string
  card: {
    kind: string
    promptText: string
    options: readonly {
      id: string
      correct: boolean
      imageSrc?: string
      text?: string
    }[]
  }
}

/** 把 `u1-` 前缀换成 `u2-`，让克隆出来的条目像单元 2 的条目。 */
function retagUnit2(entry: ContentEntry): ContentEntry {
  const retag = (id: string): string => id.replace(/^u1-/, 'u2-')
  return {
    ...entry,
    entryId: retag(entry.entryId),
    wordId: retag(entry.wordId),
    card: {
      ...entry.card,
      options: entry.card.options.map((option) => ({
        ...option,
        id: retag(option.id),
        ...(option.imageSrc === undefined
          ? {}
          : { imageSrc: option.imageSrc.replace('/unit-01/', '/unit-02/').replace(/^u1-/, 'u2-') }),
      })),
    },
  }
}

beforeEach(async () => {
  storage = installFakeStorage()
  vi.resetModules()
  // ⚠️ **mock 必须装在 import 之前** —— `vi.doMock` 不像 `vi.mock` 那样提升。
  vi.doMock('../../src/content', async () => {
    const actual = await vi.importActual<typeof import('../../src/content')>('../../src/content')
    const unit1 = actual.UNITS.find((unit) => unit.unitNumber === 1)
    if (unit1 === undefined) throw new Error('内容层里没有单元 1 —— 夹具坏了')
    const unit2 = {
      unitNumber: 2,
      entries: unit1.entries.map((entry) => retagUnit2(entry as unknown as ContentEntry)),
    }
    return {
      ...actual,
      UNITS: [...actual.UNITS, unit2],
      getUnit: (unitNumber: number) => {
        if (unitNumber === 2) return unit2 as unknown as (typeof actual.UNITS)[number]
        return actual.getUnit(unitNumber)
      },
      entriesOf: (unitNumber: number) =>
        unitNumber === 2 ? (unit2.entries as unknown as ReturnType<typeof actual.entriesOf>) : actual.entriesOf(unitNumber),
    }
  })
  core = await import('../../src/core')
  content = await import('../../src/content')
  saveApi = await import('../../src/services/save')
  store = await import('../../src/app/store')
  vi.spyOn(console, 'info').mockImplementation(() => {})
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  store.state.value = core.createInitialState({ unitNumber: 1, deck: content.entriesOf(1) })
  store.progress.value = { currentUnitIndex: 0, masteredWordIds: [] }
  store.view.value = 'start'
})

afterEachUninstall()

/** 往 fake 里塞一份存档（绕过写盘，测的是**读**这一侧）。 */
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

/** 一份**结构合法但状态非法**的对局（心数越界）—— 用来触发降级重建。 */
function brokenGame(): State {
  return { ...core.createInitialState({ unitNumber: 1, deck: content.entriesOf(1) }), hearts: 99 }
}

describe('G261 —— 降级重建的单元号取自**存档的 progress**，不是取自 `state.value.unitNumber`', () => {
  it('🔴 progress 指向单元 2 时，降级重建出来的战场必须属于**单元 2**', () => {
    // ⚠️ `currentUnitIndex` 是 **0 基**，`State.unitNumber` 是 **1 基** ⇒ 1 ⇒ 单元 2。
    const progress: Progress = { currentUnitIndex: 1, masteredWordIds: [] }
    seedSave(progress, brokenGame())

    store.enterLevel()

    expect(
      store.state.value.unitNumber,
      '🔴 降级重建出来的战场属于**单元 1**，而存档的 progress 指向**单元 2** —— ' +
        '**跨局进度与战场单元号分家**：进度条写着单元 2 的进度，战场却从头开始。\n' +
        '⚠️ 成因：重建此前逐字是 `buildStateFor(state.value.unitNumber)`，' +
        '而那一刻 `state.value` 还是模块求值期那份（**恒为单元 1**）。',
    ).toBe(2)
  })

  it('🔴 重建出来的题单必须来自单元 2（不许是单元 1 的题单换个壳）', () => {
    seedSave({ currentUnitIndex: 1, masteredWordIds: [] }, brokenGame())

    store.enterLevel()

    const deckIds = store.state.value.deck.map((entry) => entry.entryId)
    expect(deckIds.length, '重建出来的题单是空的 —— 夹具没生效').toBeGreaterThan(0)
    expect(
      deckIds.filter((id) => !id.startsWith('u2-')),
      '🔴 重建出来的题单里混着**单元 1** 的词条 —— 那说明重建用的是单元 1 的切片',
    ).toEqual([])
  })

  it('降级只记**一条** `[save]` WARN（回落单元这件事并进那一条，不是第二件事件）', () => {
    // ⚠️ 这条守的是「回落单元」这件事**不额外记一条日志** ——
    //   「降级」是**一次**事件，单元号的选择是它的**一部分**。
    //   多记一条会让 1.17 的降级面板把同一件事说两遍。
    seedSave({ currentUnitIndex: 1, masteredWordIds: [] }, brokenGame())

    store.enterLevel()

    const saveWarns = warn.mock.calls.filter((call: unknown[]) => String(call[0]).startsWith('[save]'))
    expect(saveWarns.length, '降级必须**恰好**一条 `[save]` WARN —— 多了是同一件事被说两遍').toBe(1)
  })

  it('回归：progress 指向单元 1 时，重建出来的战场仍是单元 1', () => {
    seedSave({ currentUnitIndex: 0, masteredWordIds: [] }, brokenGame())

    store.enterLevel()

    expect(store.state.value.unitNumber, 'progress 指向单元 1 时却重建出别的单元').toBe(1)
  })

  it('反向自测：判据分得清「progress 指向单元 2」与「指向单元 1」（R-51）', () => {
    seedSave({ currentUnitIndex: 1, masteredWordIds: [] }, brokenGame())
    store.enterLevel()
    const unitWhenProgressSays2 = store.state.value.unitNumber

    store.view.value = 'start'
    store.state.value = core.createInitialState({ unitNumber: 1, deck: content.entriesOf(1) })
    store.progress.value = { currentUnitIndex: 0, masteredWordIds: [] }
    seedSave({ currentUnitIndex: 0, masteredWordIds: [] }, brokenGame())
    store.enterLevel()
    const unitWhenProgressSays1 = store.state.value.unitNumber

    expect(unitWhenProgressSays2).toBe(2)
    expect(unitWhenProgressSays1).toBe(1)
    expect(unitWhenProgressSays2, '两条路径给出同一个单元号 ⇒ 这条判据分辨不出单元号').not.toBe(
      unitWhenProgressSays1,
    )
  })
})
