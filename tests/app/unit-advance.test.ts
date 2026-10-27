/**
 * 单元推进语义的守卫（Story 2.5 / Task 5.3 / 5.4 / 5.5 / 5.6；AC-5.1–AC-5.7）。
 *
 * ── 这个文件守什么 ──────────────────────────────────────────────────────────
 * 1.19 之后**一个单元要打好几局**（📎 **2026-10-26 换源批次**：单元 1 = **1 局：6 题**、
 *   单元 2 = **2 局：10 / 1**）⇒
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
import { backToStart, enterLevel, goToNextUnit, levelOutcomeKind, progress, state, view } from '../../src/app/store'
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
  // ⚠️📎 **2026-10-26 换源批次：这一组从「单元 1」换到了「单元 2」。**
  //   单元 1 从 37 条缩到 **6 条** ⇒ 它**一局就打完了整个单元**
  //   （`QUESTIONS_PER_LEVEL = 10` > 6 ⇒ 一局切完 6 条）⇒
  //   「打完单元 1 的第一局时本单元**还没学完**」这个构造**今天造不出来**了。
  //   ⇒ 改用**单元 2**（11 条 ⇒ 第一局 10 条、还剩 1 条）—— 它才是今天
  //     唯一能造出「本单元没学完」的单元。
  //   📎 **2026-10-28（Story 2.6 录完单元 3–7）**：单元 3 录了 ⇒
  //     「单元 2 的后面没有单元 3」这个前提**不再成立** ⇒
  //     单看 `currentUnitIndex` 的那条断言从**弱判据**升级成**强判据**
  //     （现在只有「本单元没学完」才会挡住推进了）。
  //   ⇒ 真正的判据仍然是 `levelOutcomeKind()`：它**只**读「本单元学完没有」，
  //     通关 ∧ 本单元**没**学完 ⇒ 必须算出 `'continue'`（留在本单元打下一局）；
  //     若实现误判成「学完了」，它会算出 `'finished'` ⇒ 这条当场红。

  it('打完单元 2 的第一局（10/11）⇒ currentUnitIndex 仍然是 1', () => {
    startUnit(2)

    driveStoreLevel()

    expect(
      progress.value.currentUnitIndex,
      '打完一局就推进 ⇒ 剩下那个词**永远学不到**（DF-072）',
    ).toBe(1)
  })

  it('🔴 按钮种类必须是「继续」而不是别的 —— 判据读的是**本单元学完没有**', () => {
    startUnit(2)

    driveStoreLevel()

    expect(
      levelOutcomeKind(),
      '🔴 通关但本单元**还没学完** ⇒ 按钮种类必须是 `continue`（留在本单元打下一局）—— ' +
        '判成 `finished`/`next-unit` 就是「打完一局就当整个单元学完了」那个 DF-072 的形态。',
    ).toBe('continue')
  })

  it('进度仍显示「第 2 单元 · 10/11」—— 判据读的是**合并后**的掌握集合', () => {
    startUnit(2)

    driveStoreLevel()

    const display = progressDisplay(progress.value, 2, entriesOf(2).length)
    expect(display.mastered, '第一局答对 10 个词').toBe(10)
    expect(display.total, '单元 2 共 11 条').toBe(11)
    expect(display.ratio).toBeCloseTo(10 / 11, 10)
  })

  it('🚨 判据自检：这份「没学完」的构造真的**没学完**（否则上面两条是恒绿）', () => {
    startUnit(2)
    driveStoreLevel()

    const remaining = sliceDeckForLevel(entriesOf(2), progress.value.masteredWordIds).length
    expect(
      remaining,
      '前置：第一局之后单元 2 必须**还剩着词**（= 还没学完）—— 否则「不得推进」是恒真',
    ).toBeGreaterThan(0)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// AC-5.3 —— 读完单元 1 ⇒ 推进到单元 2
// ══════════════════════════════════════════════════════════════════════════════

describe('AC-5.3 —— 读完单元 1（📎 换源批次：**1 局：6 题**）⇒ 推进到单元 2', () => {
  it('单元 1 确实是 1 局，且**这一局之后**才推进', () => {
    startUnit(1)

    const deckSizes: number[] = []
    const indexAfterEachLevel: number[] = []
    for (let level = 1; level <= 1; level += 1) {
      deckSizes.push(state.value.deck.length)
      driveStoreLevel()
      indexAfterEachLevel.push(progress.value.currentUnitIndex)
    }

    expect(deckSizes, '单元 1 = 6 条 ⇒ 不足一局 10 题 ⇒ 一局就切完').toEqual([6])
    expect(
      indexAfterEachLevel,
      '读完整个单元 1 之后才推进',
    ).toEqual([1])
  })

  it('推进之后进关 ⇒ 战场是**单元 2**（`progress.currentUnitIndex + 1`）', () => {
    startUnit(1)
    driveStoreLevel()

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

describe('AC-5.4 —— 玩家不能自己跳单元（FR59）', () => {
  it('单元 2 没读完时进关 ⇒ 进的仍是单元 2，而且题单是**剩下那个词**', () => {
    // ⚠️ **「跳单元」只有一条可能的路**：把 `progress.currentUnitIndex` 推到下一站。
    //   所以判据是「孩子走不到那一步」⇒ 用**只打完第一局**的进度去进关。
    // 📎 **2026-10-26 换源批次**：这组从「单元 1」换到了「单元 2」——
    //   单元 1 现在一局就打完了整个单元 ⇒「只打完第一局」的构造在它身上**造不出来**。
    startUnit(2)
    driveStoreLevel()

    nextLevel()

    expect(state.value.unitNumber, '只读完第一局 ⇒ 进关仍是单元 2，不许跳到单元 3').toBe(2)
    // ⚠️ **光看 `unitNumber` 是弱判据**：单元 3 根本没录 ⇒ 即便被跳了也进不去。
    // ⇒ 强判据是**题单**：单元 2 剩下的那个词必须还在题单里
    //   （若真被跳到单元 3，进关会停在「单元 3 未录入」那一份状态，题单是旧的 10 条）。
    expect(
      state.value.deck.map((entry) => entry.entryId),
      '下一局必须是单元 2 剩下的那个词 —— 跳单元的话这里会是上一局那 10 条',
    ).toEqual([entriesOf(2)[10].entryId])
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// AC-5.5 —— 本单元学完但**下一个单元没录** ⇒ 不推进
// ══════════════════════════════════════════════════════════════════════════════

/**
 * ⚠️📎 **2026-10-28（Story 2.6 录完单元 3–7）：这条守卫的「样本单元」往后挪了。**
 *
 *   原先它用**单元 2**当样本，理由写在标题里：「单元 3 不存在」。
 *   ⇒ 单元 3 录进来之后，**那个前提本身**就不成立了 ——
 *     单元 2 学完**应该**推进到单元 3（推进到**没录**的单元才是静默丢数据）。
 *   ⇒ 而「下一个单元没录」这个**状态**今天仍然存在，只是样本变成了
 *     **单元 7**（Story 2.6 录的最后一个单元；单元 8 还没录）。
 *   ⇒ 守卫的**意图**一个字没变，守的还是「下一个单元没录 ⇒ 不推进」，
 *     只是**样本**换了一个仍然满足前提的单元。
 */
describe('AC-5.5 —— 本单元学完但**下一个单元没录** ⇒ **不**推进', () => {
  it('单元 7 的 18 条学完后，currentUnitIndex 仍是 6，进关仍是单元 7', () => {
    const unit6WordIds = entriesOf(6).map((entry) => entry.entryId)
    startUnit(7, unit6WordIds)

    const deckSizes: number[] = []
    for (let level = 1; level <= 2; level += 1) {
      deckSizes.push(state.value.deck.length)
      driveStoreLevel()
      if (level < 2) nextLevel()
    }

    expect(deckSizes, '单元 7 = 18 条 ⇒ 10/8').toEqual([10, 8])
    expect(
      progress.value.currentUnitIndex,
      '单元 8 不存在 ⇒ **不推进**（推进到一个没录的单元 = 静默丢数据）',
    ).toBe(6)

    const display = progressDisplay(progress.value, 7, entriesOf(7).length)
    expect(display.mastered, '单元 7 的 18 条都学完了').toBe(18)
    expect(display.total).toBe(18)
    // ⚠️📎 **补一条按钮种类的判据**（`levelOutcomeKind` 的第四个取值 `'finished'`）：
    //   「本单元学完 ∧ 下一个单元没录」⇒ 按钮必须承诺「没有下一局」，
    //   而不是又许一个「下一单元」让孩子点进一个不存在的单元（AC-5.5 / 裁决 5）。
    //   📎 这条在换源之前**没有** ⇒ 现在补上（判据比原来严，不放松）。
    expect(
      levelOutcomeKind(),
      '本单元学完但没有下一个单元 ⇒ 按钮种类必须是 `finished`（不是 `next-unit`）',
    ).toBe('finished')
  })

  it('📎 反向：单元 2 学完后**要**推进到单元 3（单元 3 已录 ⇒ 推进才是对的）', () => {
    // ⚠️ **这一条是「样本挪走」的对偶** —— 只把样本换成单元 7 的话，
    //   「推进」这条行为就**没人守**了（单元 2 学完到底推不推进？）。
    //   ⇒ 同一个文件里必须**两个方向都有**。
    const unit1WordIds = entriesOf(1).map((entry) => entry.entryId)
    startUnit(2, unit1WordIds)

    for (let level = 1; level <= 2; level += 1) {
      driveStoreLevel()
      if (level < 2) nextLevel()
    }

    expect(
      progress.value.currentUnitIndex,
      '单元 3 已经录了 ⇒ 单元 2 学完**应该**推进（不推进 = 孩子永远打不到单元 3）',
    ).toBe(2)
    expect(levelOutcomeKind(), '单元 2 学完 ∧ 单元 3 录了 ⇒ 按钮种类是 `next-unit`').toBe('next-unit')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// G287 —— `[CR]` 2026-10-23（Story 2.5）：`goToNextUnit` 的相位守卫
// ══════════════════════════════════════════════════════════════════════════════

/**
 * **G287 守的是什么** —— `goToNextUnit()` 换战场**只该发生在终态**。
 *
 * ⚠️ **为什么这条要建**：`[CR]` 实测，`goToNextUnit()` 原先**无条件**换战场 ⇒
 *   任何误调用（从「答题中」直接调）都会**把孩子这一局静默换掉** ——
 *   进度还在、掌握记录还在，但屏幕上的战场被替换了 ⇒ 孩子的体感是「游戏把我的答案吃了」。
 *   而**判据的分家让它更危险**：`levelOutcomeKind()` 的文档写着
 *   「非终态时返回 `continue`」，而实现**没有这条** ⇒
 *   一个「非终态 + 本单元已学完 + 下一个单元录了」的战场会算出 **`next-unit`**
 *   ⇒ 用它当相位守卫就**形同虚设**。
 *
 * ⚠️ **判据全部走真 store 门面**（`goToNextUnit` / `levelOutcomeKind`）——
 *   被测的判据住在 `src/app/store.ts` 里 ⇒ 绕开 store 就绕开了被测对象。
 */
describe('G287 —— goToNextUnit 只在终态换战场（误调用必须原地不动）', () => {
  it('正向：读完单元 1（终态 ∧ 本单元学完 ∧ 单元 2 录了）⇒ 按钮种类是 next-unit，换战场成功', () => {
    // 📎 **2026-10-26 换源批次**：单元 1 现在**一局**就打完 ⇒ 循环从 4 局改成 1 局。
    startUnit(1)
    driveStoreLevel()

    expect(state.value.phase.kind, '前置：此刻是终态').toBe('level-complete')
    expect(levelOutcomeKind(), '读完单元 1 ⇒ 按钮的种类是「下一单元」').toBe('next-unit')

    goToNextUnit()

    expect(state.value.unitNumber, 'goToNextUnit 应当把战场换到单元 2').toBe(2)
    expect(state.value.deck.every((entry) => entry.entryId.startsWith('u2-')), '题单必须来自单元 2').toBe(
      true,
    )
  })

  it('🚨 反向自测：非终态调用 goToNextUnit ⇒ 战场必须**原地不动**', () => {
    // ⚠️ **夹具必须是「非终态」**：`startUnit` 摆出来的是 `awaiting-answer`。
    //   误调用的后果是**静默换掉孩子这一局** ⇒ 判据要能接住它。
    //
    // 🔥📎 `[CR]` 2026-10-23：**这一条原来抓不到变异**（整轮 0 红）。
    //   原因：原来的夹具 `startUnit(1)` 让 `progress.currentUnitIndex = 0`
    //   ⇒ `goToNextUnit()` 的目标单元 = `0 + 1` = **单元 1** = 战场本身
    //   ⇒ 「换战场」在观测上**与「原地不动」完全一样** ⇒ 把相位守卫整条删掉也照样全绿。
    //   ⇒ 现在把进度**指到「单元 1 已学完、下一站是单元 2」**（`currentUnitIndex = 1`），
    //     这正是误调用会发生的那种形态 ⇒ 删掉守卫 ⇒ 战场真的会被换成单元 2 ⇒ 断言立刻红。
    startUnit(1)
    progress.value = { currentUnitIndex: 1, masteredWordIds: [...progress.value.masteredWordIds] }
    const unitBefore = state.value.unitNumber
    const deckBefore = state.value.deck.map((entry) => entry.entryId)

    goToNextUnit()

    expect(state.value.unitNumber, '非终态调用 goToNextUnit 把战场换掉了 —— 守卫失效').toBe(unitBefore)
    expect(
      state.value.deck.map((entry) => entry.entryId),
      '非终态调用 goToNextUnit 把题单换掉了 —— 孩子这一局被静默吃掉',
    ).toEqual(deckBefore)
  })

  it('🚨 反向自测：非终态 + 本单元已学完 + 下一个单元录了 ⇒ 按钮种类仍必须是 continue', () => {
    // ⚠️ **这一条是「判据与文档分家」那半边**：`levelOutcomeKind()` 的注释逐字写着
    //   「非终态时返回 `continue`」，而实现原先**没有这条** ⇒
    //   一个「非终态 + 本单元已学完 + 下一个单元录了」的战场会算出 `next-unit`。
    //   ⇒ 用它当相位守卫就**形同虚设**（守卫查的是一个恒真的东西）。
    //
    // ⚠️ **夹具怎么摆**：题单**不按已掌握切**（否则切片是空的，
    //   `createInitialState` 会抛「题单不能为空」）⇒ 战场是**真的一局**，
    //   而 `progress.masteredWordIds` 里**已经包含了整个单元** ——
    //   这正是「读档回来的存档里，题单与掌握记录对不上」那种形态。
    const unit1WordIds = entriesOf(1).map((entry) => entry.entryId)
    progress.value = { currentUnitIndex: 0, masteredWordIds: [...unit1WordIds] }
    state.value = createInitialState({
      unitNumber: 1,
      deck: sliceDeckForLevel(entriesOf(1), []),
    })

    expect(state.value.phase.kind, '前置：此刻不是终态').toBe('awaiting-answer')
    expect(
      levelOutcomeKind(),
      '非终态时按钮种类必须是 continue —— 浮层此时根本不渲染（AC-5.7）',
    ).toBe('continue')
  })
})
