/**
 * 单元 2 的局序列守卫（Story 2.5 / AC-2.1、AC-2.2；**G285**）。
 *
 * ── 为什么单独开一个文件，而不是往 `store-deck-slice.test.ts` 里加 ────────────
 * 那份守的是**单元 1** 的 AC-B4 组，而 AC-2.4 逐字要求
 * 「`tests/app/store-deck-slice.test.ts` 既有断言**一条不许改**」
 * ⇒ 在那里面**加**内容会动到它的 `beforeEach`（它把 store 摆在单元 1 上）
 * ⇒ 单元 2 的局序列必须**另起一份**。
 *
 * ── 为什么不能用合成词表 ────────────────────────────────────────────────────
 * AC-2.1 逐字是「单元 2 的题单是 **10 / 10 / 10 / 8**」——
 * 那个 8 只在**真实 38 条**下成立（`QUESTIONS_PER_LEVEL = 10`，38 = 10+10+10+**8**）。
 *
 * ── 判据走**真 store 门面**（`backToStart()` → `enterLevel()`）────────────────
 *   它落到 `restoreFromSave()` → `restoreNextUnit()` → `buildStateFor()`
 *   ⇒ `sliceDeckForLevel(entriesOf(unit), progress.masteredWordIds)`
 *   ⇒ 切出**下一批**未掌握的词（与真机上同一条路）。
 *   驱动复用 `tests/fixtures/store-level-driver.ts` 的 `driveStoreLevel`
 *   —— **全仓各一份**（R-37），不另写第二份驱动。
 *
 * ── AC-2.2 守的是什么 ───────────────────────────────────────────────────────
 * 「38 个 `entryId` **各出现恰好一次**」——
 * ⚠️ 这条**不是**「局数对」的同义反复：局数对（10/10/10/8）只说明**长度**对，
 *   而「某个词被漏掉、另一个词被考了两次」时**长度照样对**（10/10/10/8 仍然成立）
 *   ⇒ 必须逐条比对**集合**。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createInitialState, sliceDeckForLevel } from '../../src/core'
import { entriesOf } from '../../src/content'
import { backToStart, enterLevel, progress, state, view } from '../../src/app/store'
import { afterEachUninstall, installFakeStorage } from '../fixtures/fake-storage'
import { driveStoreLevel } from '../fixtures/store-level-driver'

/** 单元 2 的全量词表 id，按 JSON 原序。 */
const ALL_IDS: string[] = entriesOf(2).map((entry) => entry.entryId)

/** 走真路径换下一局（回开始 → 再进关）。 */
function nextLevel(): void {
  backToStart()
  enterLevel()
}

beforeEach(() => {
  installFakeStorage()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  progress.value = { currentUnitIndex: 1, masteredWordIds: [] }
  state.value = createInitialState({
    unitNumber: 2,
    deck: sliceDeckForLevel(entriesOf(2), []),
  })
  view.value = 'level'
})

afterEachUninstall()

describe('G285 —— 单元 2 的局序列是 10 / 10 / 10 / 8（真实词表，AC-2.1 / AC-2.2）', () => {
  it('前置：单元 2 实测 38 条，且 entryId 唯一', () => {
    expect(ALL_IDS).toHaveLength(38)
    expect(new Set(ALL_IDS).size, 'entryId 必须唯一，否则切片出来的题单会少考几个词').toBe(38)
  })

  it('四局的题单逐条对得上（最后一局 8 题，**不是** 10）', () => {
    const sizes: number[] = []
    const rounds: string[][] = []

    for (let level = 1; level <= 4; level += 1) {
      sizes.push(state.value.deck.length)
      rounds.push(state.value.deck.map((entry) => entry.entryId))
      driveStoreLevel()
      if (level < 4) nextLevel()
    }

    expect(sizes, '单元 2 = 38 条 ⇒ 每局 10 条，最后一局 8 条').toEqual([10, 10, 10, 8])
    expect(rounds[0], '第一局取词表原序前 10').toEqual(ALL_IDS.slice(0, 10))
    expect(rounds[3], '第四局是剩下的 8 条，按原序').toEqual(ALL_IDS.slice(30))
  })

  it('走完四局之后，全部 38 条各出现过恰好一次（AC-2.2）', () => {
    const rounds: string[][] = []

    for (let level = 1; level <= 4; level += 1) {
      rounds.push(state.value.deck.map((entry) => entry.entryId))
      driveStoreLevel()
      if (level < 4) nextLevel()
    }

    const all = rounds.flat()
    expect(new Set(all).size, '重复出现 = 有词被漏掉或重复考').toBe(38)
    expect(all, '合起来必须正好是整个词表').toEqual(ALL_IDS)
  })
})
