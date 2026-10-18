/**
 * @vitest-environment jsdom
 */
/**
 * dev 射程覆盖层（Story 1.17 / Task 7.2、AR42、裁决 12）。
 *
 * ── 这个文件守什么 ────────────────────────────────────────────────────────
 * AR42 逐字要「网格与射程覆盖层可肉眼核对射程判定，尤其范围塔的横向 3 格」。
 * 1.12 交付的覆盖层**只在「选中卡 + 指向一格」时出现**（那是放塔预览），
 * 于是「已建成的塔到底盖哪几格」这件事在界面上**没有任何东西能核对** ——
 * 而那正是 AR42 要肉眼核对的判据本身。
 *
 * ── 裁决 12 的两条纪律 ────────────────────────────────────────────────────
 * ① **零新形状**：新加的覆盖层调的是**同一个** `coverCellsAt`，
 *    不新增第二个形状函数、不改它的任何一格 ⇒ 守卫 **G119** 逐格比对。
 * ② AR43（「两套形状」）已被 1.12 裁决 1 作废，本 story **不许**加回来。
 *
 * ── 门控 ──────────────────────────────────────────────────────────────────
 * `?ranges=1` **只在 DEV 下生效**（与 `?debug=1` 同一个 `isDebugPanelRequested`
 * 的纪律，守卫 G112 逐个函数查）。
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { entriesOf } from '../../src/content'
import { ZOMBIE_ROW, cellKey, coverCellsAt } from '../../src/core'
import type { Phase, State, TowerType } from '../../src/core'
import { selectedEntryId, state } from '../../src/app/store'
import BattleField from '../../src/components/battle/BattleField.vue'

import { stripComments } from '../fixtures/strip-comments'

const root = process.cwd()
const REAL_DECK = entriesOf(1)

const ENTRY_OF: Record<TowerType, string> = {
  direct: 'u1-hello',
  slow: 'u1-goodbye',
  aoe: 'u1-teacher',
}

enableAutoUnmount(afterEach)

beforeEach(() => {
  history.replaceState(null, '', '/')
})

// ── 夹具 ───────────────────────────────────────────────────────────────────

interface TowerSpec {
  readonly row: number
  readonly col: number
  readonly towerType: TowerType
}

/** 造一份 `awaiting-build` 的 state，场上摆着给定的塔。 */
function makeState(towers: readonly TowerSpec[]): State {
  const unlocked = [...new Set(towers.map((t) => ENTRY_OF[t.towerType]))]
  const entities = towers.map((spec, index) => ({
    id: `t${index + 1}`,
    towerType: spec.towerType,
    wordId: ENTRY_OF[spec.towerType],
    row: spec.row,
    col: spec.col,
  }))
  const grid: Record<string, string> = {}
  for (const tower of entities) grid[cellKey(tower.row, tower.col)] = tower.id

  return {
    unitNumber: 1,
    // 📎 **1.19 CR：`awaiting-build` 现在自带题面。**取 `unlocked` 里第一条对应的
    //   题单条目（它按构造必属本题单），而不是 `REAL_DECK[0]` ——
    //   后者在「塔卡没解锁任何词」的夹具下会指向一道与本局面无关的题，
    //   而那份 state 一旦过 `assertInvariants` 就会因「题面不属于题单」而红。
    phase: {
      kind: 'awaiting-build',
      question: REAL_DECK.find((entry) => entry.entryId === unlocked[0]) ?? REAL_DECK[0],
      unlocked,
      sun: 1000,
    } satisfies Phase,
    turn: 1,
    hearts: 3,
    sun: 1000,
    grid,
    towers: entities,
    zombies: [],
    deck: REAL_DECK,
    // ⚠️ `unlocked ⊆ mastered` 是 `assertDeckRelations` 的一条不变量
    //   （解锁的唯一途径是答对），照 1.12 的夹具同样品。
    masteredEntryIds: [...unlocked],
    // 📎 Story 1.18 / AC-E4 新增的 State 字段。本夹具不测跳题，只为过编译。
    skippedEntryIds: [],
    unlocked,
  }
}

/** DOM 里 `.is-in-range` 的格子集合（`cellKey` 形式），与 `coverCellsAt` 同格式。 */
function inRangeKeys(wrapper: ReturnType<typeof mount>): readonly string[] {
  return wrapper
    .findAll('.range-overlay.is-in-range')
    .map((node) => {
      const row = node.element.parentElement?.getAttribute('data-row')
      const col = node.element.parentElement?.getAttribute('data-col')
      return cellKey(Number(row), Number(col))
    })
    .sort()
}

/** 这些塔按 `coverCellsAt` 应当覆盖到的全部格子（各塔的并集）。 */
function expectedKeys(towers: readonly TowerSpec[]): readonly string[] {
  return [
    ...new Set(towers.flatMap((t) => coverCellsAt(t.row, t.col, t.towerType))),
  ].sort()
}

// ── G119 —— dev 覆盖层逐格 === coverCellsAt ────────────────────────────────

describe('G119 —— dev 射程覆盖层逐格 === `coverCellsAt`（Story 1.17 / 裁决 12）', () => {
  it('默认（不带 `?ranges=1`）⇒ 场上明明有塔，也一格都不画', () => {
    state.value = makeState([{ row: ZOMBIE_ROW, col: 3, towerType: 'aoe' }])
    selectedEntryId.value = null
    const field = mount(BattleField)
    expect(
      inRangeKeys(field),
      '没开 dev 开关就画了覆盖 —— 生产构建里也会多出一层没人要的罩',
    ).toEqual([])
  })

  it('`?ranges=1` 下三种塔型的覆盖集合逐格 === `coverCellsAt`', () => {
    history.replaceState(null, '', '/?ranges=1')
    const towers: readonly TowerSpec[] = [
      { row: ZOMBIE_ROW, col: 2, towerType: 'direct' },
      { row: ZOMBIE_ROW, col: 4, towerType: 'slow' },
      { row: ZOMBIE_ROW, col: 6, towerType: 'aoe' },
    ]
    state.value = makeState(towers)
    selectedEntryId.value = null

    const field = mount(BattleField)
    expect(inRangeKeys(field)).toEqual(expectedKeys(towers))
  })

  it('范围塔的横向 3 格确实画出来了（AR42 逐字要核对的形状）', () => {
    history.replaceState(null, '', '/?ranges=1')
    const towers: readonly TowerSpec[] = [{ row: ZOMBIE_ROW, col: 3, towerType: 'aoe' }]
    state.value = makeState(towers)
    const field = mount(BattleField)
    expect(inRangeKeys(field)).toEqual(['2,2', '2,3', '2,4'])
  })

  it('G119：`coverCellsAt` 的形状本身未被本 story 改动（非僵尸行仍返空）', () => {
    // ⚠️ 这条守的是**被复用的那个函数**，不是新画的罩：dev 覆盖层若哪天自己算形状，
    //   「逐格相同」会比对出一个两边都错的绿。形状的权威口径在 1.12 的裁决 1。
    expect(coverCellsAt(ZOMBIE_ROW, 3, 'aoe')).toEqual(['2,2', '2,3', '2,4'])
    expect(coverCellsAt(0, 3, 'aoe')).toEqual([])
    expect(coverCellsAt(1, 3, 'direct')).toEqual([])

    const code = stripComments(readFileSync(join(root, 'src/core/build.ts'), 'utf8'))
    const body = code.slice(code.indexOf('export function coverCellsAt'))
    expect(
      body,
      'coverCellsAt 找不到了 —— 这条判据已失明（M142 就是删掉那个短路）',
    ).not.toBe('')
    expect(
      body,
      '非僵尸行的短路被删了 —— dev 覆盖层会照着一个错的形状画',
    ).toMatch(/row\s*!==\s*ZOMBIE_ROW/)
  })

  it('反向自测：多画一格 / 少画一格都会被上面那条逐格判据抓到', () => {
    const towers: readonly TowerSpec[] = [{ row: ZOMBIE_ROW, col: 3, towerType: 'aoe' }]
    const truth = expectedKeys(towers)
    expect([...truth, '2,5']).not.toEqual(truth)
    expect(truth.slice(1)).not.toEqual(truth)
  })
})

// ── G112 的扩展 —— `?ranges=1` 同样只在 DEV 下生效 ────────────────────────

describe('G112（扩展）—— `?ranges=1` 与 `?debug=1` 同一个 DEV 起算纪律', () => {
  it('G112：`isTowerRangeOverlayRequested` 先判 DEV 再读 URL', () => {
    const source = stripComments(readFileSync(join(root, 'src/app/dev-adjust.ts'), 'utf8'))
    const body = source.slice(source.indexOf('export function isTowerRangeOverlayRequested'))
    expect(body, 'isTowerRangeOverlayRequested 找不到了 —— 判据已失明').not.toBe('')

    // ⚠️ **先要求两处都存在，再判顺序**（偏离 12）：只判顺序时，一个
    //   「根本不读 URL」的版本会返回「合规」——恒真与恒假在判据上长得一模一样。
    const guardAt = body.indexOf('import.meta.env.DEV')
    const urlAt = body.indexOf('URLSearchParams')
    expect(guardAt, '没有 DEV 判据 —— 生产构建里 ?ranges=1 就能开覆盖层').toBeGreaterThan(-1)
    expect(urlAt, '没有读 URL —— 判据已失明').toBeGreaterThan(-1)
    expect(guardAt < urlAt, 'URL 在 DEV 判据之前被读 —— NFR22 直接被绕过').toBe(true)
  })

  it('反向自测：一份「从 URL 起算」的探针会被判为违规', () => {
    const illegal = (body: string): boolean => {
      const guardAt = body.indexOf('import.meta.env.DEV')
      const urlAt = body.indexOf('URLSearchParams')
      if (guardAt < 0 || urlAt < 0) return false
      return guardAt < urlAt
    }
    const probe = 'const p = new URLSearchParams(location.search).get("ranges")\nreturn p === "1"\n'
    expect(illegal(probe), '判据自测：从 URL 起算的探针没被判违规').toBe(false)
  })
})
