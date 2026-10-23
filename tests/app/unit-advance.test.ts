/**
 * 单元推进语义的守卫（Story 2.5 / Task 5.3 / 5.4 / 5.5 / 5.6；AC-5.1–AC-5.7）。
 *
 * ── 这个文件守什么 ──────────────────────────────────────────────────────────
 * 1.19 之后**一个单元要打好几局**（单元 1 = 4 局：10/10/10/7）⇒
 * 「打完一局」与「读完一个单元」**不是同一件事**。
 * 2.5 之前 store 的推进判据是「本局打完了 ∧ 下一个单元录了没有」
 * ⇒ 单元 2 一录进来，**打完单元 1 的第一局**就会把孩子推进到单元 2，
 * 剩下 27 个词**永久学不到**（DF-072）。
 *
 * ⇒ 本文件把新判据钉死：
 *   · 本单元没学完 ⇒ **不推进**（AC-5.2 / Task 5.6 的守卫）；
 *   · 本单元学完了 ⇒ 推进（AC-5.3）；
 *   · 没有下一个单元 ⇒ 不推进（AC-5.5）；
 *   · 玩家不能自己跳单元（AC-5.4）。
 *
 * ── 判据全部走**真 store 门面**（`applyAction` / `enterLevel` / `backToStart`）──
 *   被测的判据住在 `src/app/store.ts` 的 `applyAction` 里 ⇒ 绕开 store 就绕开了被测对象。
 *   ⚠️ 建塔策略复用 `tests/fixtures/level-driver.ts` 的 `greedyBuildActions`，
 *     驱动复用 `tests/fixtures/store-level-driver.ts` 的 `driveStoreLevel`
 *     —— **全仓各一份**（R-37），不另写第二份驱动。
 *
 * ── 换下一局走**真路径**（`backToStart()` → `enterLevel()`）──────────────────
 *   它落到 `restoreFromSave()` → `restoreNextUnit()` → `buildStateFor()`
 *   ⇒ `sliceDeckForLevel(entriesOf(unit), progress.masteredWordIds)`
 *   ⇒ 切出**下一批**未掌握的词。这一条正是 2.5 要验的：
 *   「本单元要打 4 局」这件事在数据层是否真的成立。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createInitialState, progressDisplay, sliceDeckForLevel } from '../../src/core'
import { entriesOf } from '../../src/content'
import { backToStart, enterLevel, progress, state, view } from '../../src/app/store'
import { afterEachUninstall, installFakeStorage } from '../fixtures/fake-storage'
import { driveStoreLevel } from '../fixtures/store-level-driver'

beforeEach(() => {
  installFakeStorage()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  progress.value = { currentUnitIndex: 0, masteredWordIds: [] }
  view.value = 'start'
})

afterEachUninstall()

/**
 * 把战场摆到某个单元的**第一局**上。
 *
 * ⚠️ **题单用 `sliceDeckForLevel` 切**，而不是「全部词条」——
 *   `buildStateFor`（store 里那份）就是这么切的 ⇒ 两边同源（R-02）。
 *   若这里塞全部词条，本文件验的就不是真机上的那一局了。
 */
function startUnit(unitNumber: number, masteredWordIds: readonly string[] = []): void {
  progress.value = { currentUnitIndex: unitNumber - 1, masteredWordIds: [...masteredWordIds] }
  state.value = createInitialState({
    unitNumber,
    deck: sliceDeckForLevel(entriesOf(unitNumber), masteredWordIds),
  })
  view.value = 'level'
}

/** 走真路径换下一局（回开始 → 再进关）。 */
function nextLevel(): void {
  backToStart()
  enterLevel()
}

// ══════════════════════════════════════════════════════════════════════════════
// AC-5.2 / Task 5.6 —— 「本单元没学完时不得推进」
// ══════════════════════════════════════════════════════════════════════════════

describe('AC-5.2 / Task 5.6 —— 本单元没学完时**不得**推进到下一个单元', () => {
  it('打完单元 1 的第一局（10/37）⇒ currentUnitIndex 仍然是 0', () => {
    startUnit(1)

    driveStoreLevel()

    expect(
      progress.value.currentUnitIndex,
      '打完一局就推进 ⇒ 剩下 27 个词**永久学不到**（DF-072）',
    ).toBe(0)
  })

  it('进度仍显示「第 1 单元 · 10/37」—— 判据读的是**合并后**的掌握集合', () => {
    startUnit(1)

    driveStoreLevel()

    const display = progressDisplay(progress.value, 1, entriesOf(1).length)
    expect(display.mastered, '第一局答对 10 个词').toBe(10)
    expect(display.total, '单元 1 共 37 条').toBe(37)
    expect(display.ratio).toBeCloseTo(10 / 37, 10)
  })

  it('🚨 判据自检：这份「没学完」的构造真的**没学完**（否则上面两条是恒绿）', () => {
    startUnit(1)
    driveStoreLevel()

    const remaining = sliceDeckForLevel(entriesOf(1), progress.value.masteredWordIds).length
    expect(
      remaining,
      '前置：第一局之后单元 1 必须**还剩着词**（= 还没学完）—— 否则「不得推进」是恒真',
    ).toBeGreaterThan(0)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// AC-5.3 —— 读完单元 1 ⇒ 推进到单元 2
// ══════════════════════════════════════════════════════════════════════════════

describe('AC-5.3 —— 读完单元 1（4 局：10/10/10/7）⇒ 推进到单元 2', () => {
  it('单元 1 确实是 4 局，且**第四局之后**才推进', () => {
    startUnit(1)

    const deckSizes: number[] = []
    const indexAfterEachLevel: number[] = []
    for (let level = 1; level <= 4; level += 1) {
      deckSizes.push(state.value.deck.length)
      driveStoreLevel()
      indexAfterEachLevel.push(progress.value.currentUnitIndex)
      if (level < 4) nextLevel()
    }

    expect(deckSizes, '单元 1 = 37 条 ⇒ 每局 10 条，最后一局 7 条').toEqual([10, 10, 10, 7])
    expect(
      indexAfterEachLevel,
      '前三局不许推进，第四局（读完整个单元）才推进',
    ).toEqual([0, 0, 0, 1])
  })

  it('推进之后进关 ⇒ 战场是**单元 2**（`progress.currentUnitIndex + 1`）', () => {
    startUnit(1)
    for (let level = 1; level <= 4; level += 1) {
      driveStoreLevel()
      if (level < 4) nextLevel()
    }

    nextLevel()

    expect(state.value.unitNumber, '读完单元 1 ⇒ 进的是单元 2').toBe(2)
    expect(state.value.deck.length, '单元 2 的第一局也是 10 条').toBe(10)
    expect(state.value.deck.every((entry) => entry.entryId.startsWith('u2-')), '题单必须来自单元 2').toBe(
      true,
    )
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// AC-5.4 —— 不引入选关自由
// ══════════════════════════════════════════════════════════════════════════════

describe('AC-5.4 —— 玩家不能自己跳到单元 2（FR59）', () => {
  it('单元 1 没读完时进关 ⇒ 进的仍是单元 1', () => {
    // ⚠️ **「跳单元」只有一条可能的路**：把 `progress.currentUnitIndex` 推到 1。
    //   所以判据是「孩子走不到那一步」⇒ 用**只打完第一局**的进度去进关。
    startUnit(1)
    driveStoreLevel()

    nextLevel()

    expect(state.value.unitNumber, '只读完第一局 ⇒ 进关仍是单元 1，不许跳到单元 2').toBe(1)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// AC-5.5 —— 单元 2 通关后不推进到单元 3
// ══════════════════════════════════════════════════════════════════════════════

describe('AC-5.5 —— 单元 2 通关后**不**推进（单元 3 不存在）', () => {
  it('单元 2 的 38 条学完后，currentUnitIndex 仍是 1，进关仍是单元 2', () => {
    const unit1WordIds = entriesOf(1).map((entry) => entry.entryId)
    startUnit(2, unit1WordIds)

    const deckSizes: number[] = []
    for (let level = 1; level <= 4; level += 1) {
      deckSizes.push(state.value.deck.length)
      driveStoreLevel()
      if (level < 4) nextLevel()
    }

    expect(deckSizes, '单元 2 = 38 条 ⇒ 10/10/10/8').toEqual([10, 10, 10, 8])
    expect(
      progress.value.currentUnitIndex,
      '单元 3 不存在 ⇒ **不推进**（推进到一个没录的单元 = 静默丢数据）',
    ).toBe(1)

    const display = progressDisplay(progress.value, 2, entriesOf(2).length)
    expect(display.mastered, '单元 2 的 38 条都学完了').toBe(38)
    expect(display.total).toBe(38)
  })
})
