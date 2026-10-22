/**
 * 存档层的**不变量**守卫（Epic 1 集成层检视，2026-10-22）。
 *
 * ── 这个文件守什么 ──────────────────────────────────────────────────────────
 * · **G256** `State.unitNumber` 必须是 1 基的正整数 —— 此前**从来没有被任何不变量校验过**
 * · **G257** 题单条目的 `towerType` 必须合法；且 `handCards` 对脏塔型**不许抛**
 * · **G258** 僵尸列号的上界（`col <= ZOMBIE_SPAWN_COL`）必须在**读档路径**上也强制
 *
 * ── 为什么这三条要放在一起 ────────────────────────────────────────────────
 * 它们是同一类洞的三个面：**读档不走工厂**。
 * `createZombie()` / `createTower()` 这些工厂在**造**的时候强制形状，
 * 但存档里的实体是**直接**进 `assertInvariants` 的 ⇒
 * 「工厂是数据入口的唯一强制点」那句话当场不成立。
 * ⇒ 三条守卫合起来回答同一个问题：
 *   **「一份手改过 / 半损坏的存档，会在哪一层被抓住？」**
 *
 * ⚠️ **守的是「形状」还是「录了没有」**：这一层只能守**形状**
 *   （单元号是正整数、塔型是三个合法字面量之一、僵尸列号不越界）。
 *   「这个单元**录了没有**」是**内容层**的知识（`core/` 不 import `content/`），
 *   由 app 层在读档路径上负责 —— 两条合起来才封死这条路。
 *
 * ── 判据纪律（R-50 / R-51）────────────────────────────────────────────────
 * 每条判据都问**行为**（抛不抛、抛什么），不判源码形状；
 * 每条都带一条**反向自测**，证明这条判据不是恒绿的。
 *
 * ── 变异实测（R-51：改坏代码 → 跑全量 → 数红 → 还原）──────────────────────
 * · **M292** 去掉 `assertZombieCol` 的上界检查 ⇒ 全量 **2 红**，全在 G258
 * · **M293** 去掉 `assertInvariants` 里的 `assertUnitNumber(state.unitNumber)` ⇒ 全量 **4 红**，全在 G256
 * · **M294** 让 `assertDeckRelations` 不再校验 `deck[].towerType` ⇒ 全量 **1 红**，在 G257
 * · **M295** 让 `handCards` 遇到脏塔型改为抛错 ⇒ 全量 **1 红**，在 G257
 */

import { describe, expect, it } from 'vitest'

import {
  ZOMBIE_SPAWN_COL,
  assertInvariants,
  assertZombieCol,
  createInitialState,
  handCards,
} from '../../src/core'
import type { State } from '../../src/core'

import { makeSyntheticDeck } from '../fixtures/synthetic-deck.js'

const DECK = makeSyntheticDeck(3, 1)

function freshState(): State {
  return createInitialState({ unitNumber: 1, deck: DECK })
}

// ══════════════════════════════════════════════════════════════════════════════
// G256 —— 单元号必须是 1 基的正整数
// ══════════════════════════════════════════════════════════════════════════════

describe('G256 —— unitNumber 是不变量的一部分（此前从来没有被校验过）', () => {
  it('🔴 unitNumber = 0 时 `assertInvariants` 必须抛', () => {
    const bogus: State = { ...freshState(), unitNumber: 0 }
    expect(
      () => assertInvariants(bogus),
      '🔴 `unitNumber: 0` 过了不变量 —— ' +
        '单元号决定档位（初始阳光 / 答对增量 / 三塔型造价），' +
        '它不合法时**每一次答题**都会抛，而异常会逃出 `applyAction` 逃进点击处理器 ⇒ ' +
        '界面上只有 console 报错、没有孩子能懂的话。',
    ).toThrow(/单元号/)
  })

  it('🔴 unitNumber = -1 时必须抛（负号不是「没填」而是「填错了」）', () => {
    const bogus: State = { ...freshState(), unitNumber: -1 }
    expect(() => assertInvariants(bogus), '负单元号过了不变量').toThrow(/单元号/)
  })

  it('🔴 unitNumber = 1.5 时必须抛（档位查表按整数档，浮点查不到）', () => {
    const bogus: State = { ...freshState(), unitNumber: 1.5 }
    expect(() => assertInvariants(bogus), '非整数单元号过了不变量').toThrow(/单元号/)
  })

  it('边界：unitNumber = 99 **不抛**（形状合法；「录了没有」是内容层的事）', () => {
    // ⚠️ 这一条守的是**边界**：不变量守形状、不守内容。
    //   `99` 是一个形状合法的单元号 —— 它「没录」这件事 `core/` 无从知道
    //   （`core/` 不 import `content/`），由 app 层在读档路径上负责
    //   （`tests/app/store-save.test.ts` 的读档用例守着那条）。
    //   ⚠️ 若哪天本条开始抛 ⇒ 说明不变量越界去管内容层了 ⇒ 那一层的职责被抢走。
    const bogus: State = { ...freshState(), unitNumber: 99 }
    expect(
      () => assertInvariants(bogus),
      '不变量开始管「这个单元录了没有」了 —— 那是 app / 内容层的职责，' +
        'core 不 import content/，这条越界会让读档路径上的降级逻辑失去用武之地',
    ).not.toThrow()
  })

  it('反向自测：判据问的是**抛不抛**，不是「源码里有没有那个函数」（R-51）', () => {
    // 一个形状非法的单元号 → 抛；一个形状合法的 → 不抛。
    //   两条合起来证明判据**分得清**合法与非法，而不是恒绿。
    const bad: State = { ...freshState(), unitNumber: 0 }
    const good: State = { ...freshState(), unitNumber: 1 }
    let threwOnBad = false
    try {
      assertInvariants(bad)
    } catch {
      threwOnBad = true
    }
    let threwOnGood = false
    try {
      assertInvariants(good)
    } catch {
      threwOnGood = true
    }
    expect(threwOnBad, '形状非法的单元号没抛').toBe(true)
    expect(threwOnGood, '形状合法的单元号竟然抛了').toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// G257 —— 题单条目的 towerType 必须合法；且 handCards 对脏塔型不许抛
// ══════════════════════════════════════════════════════════════════════════════

describe('G257 —— 题单条目的塔型：不变量守形状，handCards 守「不许抛」', () => {
  /** 把题单里第一条的塔型改脏。 */
  function withDirtyDeck(): State {
    const base = freshState()
    const first = base.deck[0]!
    const dirty = { ...first, towerType: 'driect' as never }
    return { ...base, deck: [dirty, ...base.deck.slice(1)] }
  }

  it('🔴 题单里有脏塔型时 `assertInvariants` 必须抛', () => {
    expect(
      () => assertInvariants(withDirtyDeck()),
      '🔴 `deck[].towerType` 是脏值（`driect`）却过了不变量 —— ' +
        '⇒ 存档坏在**读档那一刻**没被抓住 ⇒ ' +
        '而 `core/build.ts` 的 `handCards` 会走 `costOf(entry.towerType, …)` → `assertTowerType` **抛错** ⇒ ' +
        '抛在 `HandDeck.vue` 的 `computed` 里 ⇒ **整个战场白屏**（组件层 computed 抛错 ⇒ 整棵子树渲染不出来）。',
    ).toThrow(/塔型|towerType/i)
  })

  it('🔴 `handCards` 面对脏塔型必须**跳过这一张**而不是抛错', () => {
    const dirty = withDirtyDeck()
    const entryId = dirty.deck[0]!.entryId
    const state: State = { ...dirty, unlocked: [entryId] }

    let cards: ReturnType<typeof handCards> | null = null
    expect(() => {
      cards = handCards(state)
    }, '🔴 `handCards` 面对脏塔型抛了 —— 抛在 `HandDeck.vue` 的 `computed` 里 ⇒ **整个战场白屏**').not.toThrow()
    expect(cards, '断言写错了：上面的 expect 没跑成').not.toBeNull()
    expect(
      (cards as unknown as readonly unknown[]).length,
      '🔴 脏塔型那张卡没有被跳过 —— 手牌区要么少一张、要么整个渲染不出来',
    ).toBe(0)
  })

  it('回归：塔型合法时 `handCards` 照旧给出那张卡（不许被「一律跳过」糊掉）', () => {
    const base = freshState()
    const entryId = base.deck[0]!.entryId
    const cards = handCards({ ...base, unlocked: [entryId] })
    expect(cards.length, '合法塔型的手牌被跳过了 ⇒ 孩子连卡都看不到').toBe(1)
    expect(cards[0]!.entryId).toBe(entryId)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// G258 —— 僵尸列号的上界必须在读档路径上也强制
// ══════════════════════════════════════════════════════════════════════════════

describe('G258 —— 僵尸列号的上界（工厂不再是「唯一强制点」）', () => {
  it('🔴 越过分入场列的僵尸列号必须抛', () => {
    expect(
      () => assertZombieCol(ZOMBIE_SPAWN_COL + 1),
      '🔴 越界的僵尸列号过了校验 —— ' +
        '僵尸只从入场列入场，且列号**只减不增** ⇒ ' +
        '越界的僵尸**永远走不进任何塔的窗口**，却每回合继续刷出僵尸 ⇒ ' +
        '**这一局既不通关也不失败**（孩子看着一局永远打不完的游戏）。',
    ).toThrow(/僵尸列号/)
  })

  it('边界：恰好等于入场列**不抛**（那正是僵尸的起点）', () => {
    expect(() => assertZombieCol(ZOMBIE_SPAWN_COL), '入场列本身被判成越界').not.toThrow()
  })

  it('边界：负列号**不抛**（僵尸必须能走到房子之外，`hasPassedHouse` 判的就是负列号）', () => {
    // ⚠️ 下界刻意**不**设 —— 这条守着那个刻意。
    expect(() => assertZombieCol(-1), '负列号被判成非法 —— 僵尸就永远走不到房子外，`hasPassedHouse` 永不成立').not.toThrow()
  })

  it('🔴 非整数列号必须抛（整数校验不能被上界校验挤掉）', () => {
    expect(() => assertZombieCol(3.5), '非整数的僵尸列号过了校验').toThrow(/僵尸列号/)
  })

  it('🔴 一份僵尸列号越界的存档必须在不变量这一层被挡住', () => {
    const base = freshState()
    const zombie = base.zombies[0]!
    const bogus: State = {
      ...base,
      zombies: [{ ...zombie, col: ZOMBIE_SPAWN_COL + 100 }],
    }
    expect(
      () => assertInvariants(bogus),
      '🔴 僵尸列号越界的存档过了全部不变量 ⇒ ' +
        '它会被装进 `state.value` ⇒ 而这一局既不通关也不失败',
    ).toThrow(/僵尸列号/)
  })
})
