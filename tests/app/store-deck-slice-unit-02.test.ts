/**
 * 单元 2 的局序列守卫（Story 2.5 / AC-2.1、AC-2.2；**G285**）。
 *
 * ── 为什么单独开一个文件，而不是往 `store-deck-slice.test.ts` 里加 ────────────
 * 那份守的是**单元 1** 的 AC-B4 组，而 AC-2.4 逐字要求
 * 「`tests/app/store-deck-slice.test.ts` 既有断言**一条不许改**」
 * ⇒ 在那里面**加**内容会动到它的 `beforeEach`（它把 store 摆在单元 1 上）
 * ⇒ 单元 2 的局序列必须**另起一份**。
 *
 * 📎 **2026-10-26 换源批次**：AC-2.4 那条「一条不许改」的前提是
 *   「**内容规模不变**」—— 内容一换源，那份文件里**钉在 37 条上的断言**
 *   （10/10/10/7、37 条各一次）就**不可能**继续成立 ⇒ 那一批断言按**新规模**
 *   改写（守的东西不变），而**行为契约类**的断言（跨局零交集、在途存档不重新切片…）
 *   **一条都没删**。
 *
 * ── 为什么不能用合成词表 ────────────────────────────────────────────────────
 * AC-2.1 逐字是「单元 2 的题单是 **10 / 10 / 10 / 8**」——
 * 那个 8 只在**真实 38 条**下成立（`QUESTIONS_PER_LEVEL = 10`，38 = 10+10+10+**8**）。
 *
 * 📎 **2026-10-26 换源批次**：单元 2 从 38 条缩到 **11 条** ⇒
 *   局序列从「10 / 10 / 10 / 8」变成「**10 / 1**」（11 = 10 + **1**）。
 *   ⇒ 本文件下面那些「10/10/10/8」「38 条」的判据**按新规模重写**，
 *     但**守的东西没变**：局序列的**长度**与**逐条归属**（AC-2.1 / AC-2.2）。
 *
 * ── 判据走**真 store 门面**（`backToStart()` → `enterLevel()`）────────────────
 *   它落到 `restoreFromSave()` → `restoreNextUnit()` → `buildStateFor()`
 *   ⇒ `sliceDeckForLevel(entriesOf(unit), progress.masteredWordIds)`
 *   ⇒ 切出**下一批**未掌握的词（与真机上同一条路）。
 *   驱动复用 `tests/fixtures/store-level-driver.ts` 的 `driveStoreLevel`
 *   —— **全仓各一份**（R-37），不另写第二份驱动。
 *
 * ── AC-2.2 守的是什么 ───────────────────────────────────────────────────────
 * 「11 个 `entryId` **各出现恰好一次**」——
 * ⚠️ 这条**不是**「局数对」的同义反复：局数对（10/1）只说明**长度**对，
 *   而「某个词被漏掉、另一个词被考了两次」时**长度照样对**（10/1 仍然成立）
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

describe('G285 —— 单元 2 的局序列是 10 / 1（真实词表，AC-2.1 / AC-2.2）', () => {
  it('前置：单元 2 实测 11 条，且 entryId 唯一', () => {
    expect(ALL_IDS).toHaveLength(11)
    expect(new Set(ALL_IDS).size, 'entryId 必须唯一，否则切片出来的题单会少考几个词').toBe(11)
  })

  it('两局的题单逐条对得上（第二局 1 题，**不是** 10）', () => {
    const sizes: number[] = []
    const rounds: string[][] = []

    for (let level = 1; level <= 2; level += 1) {
      sizes.push(state.value.deck.length)
      rounds.push(state.value.deck.map((entry) => entry.entryId))
      driveStoreLevel()
      if (level < 2) nextLevel()
    }

    expect(sizes, '单元 2 = 11 条 ⇒ 每局 10 条，最后一局 1 条').toEqual([10, 1])
    expect(rounds[0], '第一局取词表原序前 10').toEqual(ALL_IDS.slice(0, 10))
    expect(rounds[1], '第二局是剩下的 1 条，按原序').toEqual(ALL_IDS.slice(10))
  })

  it('走完两局之后，全部 11 条各出现过恰好一次（AC-2.2）', () => {
    const rounds: string[][] = []

    for (let level = 1; level <= 2; level += 1) {
      rounds.push(state.value.deck.map((entry) => entry.entryId))
      driveStoreLevel()
      if (level < 2) nextLevel()
    }

    const all = rounds.flat()
    expect(new Set(all).size, '重复出现 = 有词被漏掉或重复考').toBe(11)
    expect(all, '合起来必须正好是整个词表').toEqual(ALL_IDS)
  })
})
