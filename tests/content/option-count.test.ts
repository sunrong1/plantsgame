/**
 * 选项数递进规则的守卫（Story 2.4 / AC-A2、A3、B1、B2、B3；守卫 **G262 – G266**）。
 *
 * ── 守什么 ────────────────────────────────────────────────────────────────
 * · **G262（可计算 + 覆盖，AC-A2）** —— `targetOptionCount(unitNumber, kind)` 对 1..24
 *   每个单元、每个卡型都得出合法值（整数、∈ [2,4]）；`0` / `25` / 非整数一律抛错；
 *   档位表的键集合 === `CardKindSchema` 的取值集合。
 * · **G263（三条性质，AC-B1 / B2）** —— ① 逐档**单调不降**（每个卡型）；
 *   ② 档内**同值**（同一档内所有单元同值）；③ 档内**卡型不降**（`word ≤ keyword ≤ response`）。
 * · **G265（跨层一致，AC-B2）** —— 内容层的档位边界 === `BALANCE_TIERS` 的档位边界。
 *   **在测试层比对**（内容层不得 import `src/core/`，R-10 + `content-boundary.test.ts` 兜底）。
 * · **G266（档位表结构，AC-A3）** —— 空表 / 区间倒置 / 区间重叠一律抛错；档位表逐层冻结。
 *
 * ⚠️ **G264（规则 ↔ 单元 1 真实内容一致）不在本文件** ——
 *   它在 `tests/content/unit-01.test.ts`（与那份 AC-17 的内容侧断言住在一起）：
 *   那一侧是**真实内容**，属内容层的账。
 *
 * ── 为什么这么写 ──────────────────────────────────────────────────────────
 * · **不写死期望表**（R-56）：本文件验的是**规则自身的性质**与**跨层一致**，
 *   具体那 9 个数字是产品裁决 —— 改它要同时改 `src/content/option-count.ts` 与
 *   `docs/option-count.md`，**不该由测试拦**（拦了就等于把产品决策写死在测试里）。
 *   「档 1 的三个数与真实内容相等」那条（G264）才是把数字钉住的地方。
 * · **单调不降必须配一条下界**（R-51 第 1 类失效的预防）：
 *   「逐档不降」单独写的话，一条**恒定不变**的档位表（3 档全是 2 个选项）照样全绿 ——
 *   而那意味着「越靠后的单元选项数越多」这句话是假的。
 *   ⇒ 配一条「至少有一档真的上升」。
 * · **跨层比对是双向的**（G265）：只比「内容层的档位 ⊆ core 的档位」的话，
 *   core 加一档而内容层没跟时不会红 —— 那一档的单元会拿到**上一档**的选项数，
 *   难度静默偏掉。
 * · **每条守卫都配一条反向自测**（R-51 / T6.5）：把违规形态**真写进合成夹具**，
 *   证明判据会红 —— 而不是「在脑子里想一遍它会红」。
 *
 * ── 编号留痕（R-36）─────────────────────────────────────────────────────────
 * ⚠️ story 文档写的是「守卫从 **G253** 起」，那是 2026-10-21 的**起号检查**结论。
 *   2026-10-22 的 Epic 1 集成层检视**已经占用了 G253–G261**（真守卫在
 *   `tests/core/invariants.test.ts` / `tests/components/hand-build.test.ts` /
 *   `tests/services/asset-prefetch.test.ts` / `tests/app/` 等处）⇒ 撞号。
 *   ⇒ 本 story 顺延到 **G262 起**（G262–G266），story 文档已同步更正。
 *
 * ── 期望值来源与出处 ──────────────────────────────────────────────────────
 * · 规则与三条性质：`src/content/option-count.ts` 的文件头 + `docs/option-count.md`
 * · 「档内所有单元同值」「越靠后的单元选项数越多」：Story 2.4 AC 组 A / B
 * · 档位边界 1–4 / 5–10 / 11–24 = FR63 的阳光档位划分（`src/core/balance.ts` 的 `BALANCE_TIERS`）
 */

import { describe, expect, it } from 'vitest'

import {
  OPTION_COUNT_TIERS,
  assertOptionCountTiers,
  optionCountTierForUnit,
  targetOptionCount,
  type OptionCountTier,
} from '../../src/content/option-count'
import { FIRST_UNIT, LAST_UNIT } from '../../src/content/distribution'
import { CardKindSchema } from '../../src/content/schema'
import { BALANCE_TIERS } from '../../src/core/balance'

/** 规则覆盖的全部单元号（1..24）。 */
const ALL_UNITS: readonly number[] = Array.from(
  { length: LAST_UNIT - FIRST_UNIT + 1 },
  (_, i) => FIRST_UNIT + i,
)

/** 三个卡型（取自 schema 枚举，不另写一份字面量）。 */
const CARD_KINDS = Object.keys(
  (CardKindSchema.def as { entries?: Record<string, string> }).entries ?? {},
) as readonly (keyof OptionCountTier['counts'])[]

/** 选项数的合法区间（档 1 的 2 到末档的 4）—— 越界即内容或规则写坏了。 */
const MIN_COUNT = 2
const MAX_COUNT = 4

/** 造一档（夹具用；不冻结 —— 反向自测要的就是「能造出畸形档位表」）。 */
function tier(from: number, to: number, word: number, keyword: number, response: number): OptionCountTier {
  return { unitRange: [from, to], counts: { word, keyword, response } }
}

// ══════════════════════════════════════════════════════════════════════════════
// G262 —— 可计算 + 覆盖 1..20
// ══════════════════════════════════════════════════════════════════════════════

describe('G262 —— 规则可计算 + 覆盖 1..24（AC-A2）', () => {
  it('每个单元、每个卡型都得出合法值（整数且 ∈ [2,4]）', () => {
    for (const unit of ALL_UNITS) {
      for (const kind of CARD_KINDS) {
        const count = targetOptionCount(unit, kind)
        expect(
          Number.isInteger(count),
          `单元 ${unit} 的 ${kind} 选项数是 ${count}，不是整数 —— 选项数落到卡上只能取整，` +
            '取整会变成第二个事实源',
        ).toBe(true)
        expect(
          count >= MIN_COUNT && count <= MAX_COUNT,
          `单元 ${unit} 的 ${kind} 选项数是 ${count}，不在 [${MIN_COUNT}, ${MAX_COUNT}] —— ` +
            '少于 2 个选项孩子无从二选一，多于 4 个选项认读负担超出 4–8 岁的承受范围',
        ).toBe(true)
      }
    }
  })

  it('档位表的键集合 === CardKindSchema 的取值集合（三型齐全，不多不少）', () => {
    const def = CardKindSchema.def as { entries?: Record<string, string> }
    if (def.entries === undefined) {
      throw new Error('CardKindSchema 不再是枚举 —— 卡型取值集合的读法变了，本断言需要重写')
    }
    const kinds = Object.keys(def.entries)
    for (const t of OPTION_COUNT_TIERS) {
      expect(
        Object.keys(t.counts).sort(),
        `档位 ${t.unitRange[0]}-${t.unitRange[1]} 的卡型键集合与 CardKindSchema 不一致` +
          `（schema：${kinds.join('/')}）—— schema 增删卡型而档位表没跟上，` +
          '该族卡的选项数会被静默漏算（`targetOptionCount` 会抛错，但录入端看到的是一句谜语）',
      ).toEqual([...kinds].sort())
    }
  })

  it('越界（0 / 25 / -1）与非整数（2.5 / NaN / Infinity）一律抛错，且消息说清覆盖范围', () => {
    // ⚠️ **越界样例从 21 改成 25**（Story 2.10）：`LAST_UNIT` 从 20 抬到 24 之后，
    //   单元 21 **已经落在规则范围内**了 ⇒ 拿它当「越界」样例会得到一条恒红的断言，
    //   而它守的东西（越界必须抛错）一个字都没变。
    for (const bad of [0, 25, -1, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        () => targetOptionCount(bad, 'word'),
        `单元号 ${bad} 没有抛错 —— 静默外推会让「单元结构扩到 24 以上」这件事在这里被吞掉，` +
          '而难度曲线在没人看的地方偏出去，且没有任何报错指向它',
      ).toThrowError(/覆盖范围外|单元号必须是整数/)
    }
  })

  it('不在表里的卡型（含原型链上的名字）一律抛错（`[CR]` 2026-10-23 修）', () => {
    // ⚠️ **原型链漏洞**：档位表的 `counts` 是普通对象字面量 ⇒
    //   `counts['toString']` / `counts['__proto__']` / `counts['constructor']`
    //   会命中 `Object.prototype` 上的继承属性 ⇒ 用 `counts[kind] === undefined`
    //   判「这个卡型不在表里」时**永远判不到** ⇒ 那条守卫是半假的，
    //   而调用方会拿到一个**函数**当「选项数」。
    //   实测（修复前）：`targetOptionCount(1, 'toString')` 返回
    //   `function toString() { [native code] }`，一次都不抛错。
    for (const kind of ['toString', '__proto__', 'constructor', 'valueOf', 'hasOwnProperty']) {
      expect(
        () => targetOptionCount(1, kind as never),
        `卡型「${kind}」没有抛错 ⇒ 原型链上的属性被当成了选项数（守卫半假）`,
      ).toThrowError(/没有卡型/)
    }
  })

  it('反向自测：把越界检查去掉（改成回退到首档）⇒ 上面那条立刻红', () => {
    // ⚠️ R-51：判据必须真能咬住它要防的那个违规 —— 这里把**去掉越界检查**的
    //   假实现**真写出来**，并让判据问它。
    const withoutRangeCheck = (unitNumber: number, kind: 'word'): number => {
      if (!Number.isInteger(unitNumber)) throw new Error('单元号必须是整数')
      return OPTION_COUNT_TIERS[0].counts[kind] // ← 越界时静默回退首档
    }
    expect(() => withoutRangeCheck(25, 'word'), '假实现竟然抛错了 ⇒ 反向自测本身失效').not.toThrow()
    expect(
      () => targetOptionCount(25, 'word'),
      '真实现对越界单元号不抛错 ⇒ 越界判据没了',
    ).toThrowError(/覆盖范围外/)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// G263 —— 三条性质
// ══════════════════════════════════════════════════════════════════════════════

/**
 * G263 ① 的**判据本体** —— 逐档单调不降（每个卡型各自不降）。
 *
 * ⚠️ **抽成函数是为了让反向自测够得着它**（`[CR]` 2026-10-23 修）：
 *   判据若只写在某条 `it` 的循环体里，反向自测只能另写一份手写比较 ——
 *   判据被改坏时反向自测照样绿（本仓已知的假绿形态之一：反向自测没调用判据本体）。
 */
function assertMonotonicPerKind(tiers: readonly OptionCountTier[]): void {
  for (const kind of CARD_KINDS) {
    for (let i = 1; i < tiers.length; i += 1) {
      const prev = tiers[i - 1].counts[kind]
      const cur = tiers[i].counts[kind]
      expect(
        cur,
        `${kind} 在第 ${i} 档倒退：${prev} → ${cur} —— ` +
          '「越靠后的单元选项数越多」是难度阶梯的一条腿，中间出现回退即难度回退',
      ).toBeGreaterThanOrEqual(prev)
    }
  }
}

/**
 * G263 ② 的**判据本体** —— 档内同值，**外加「每个单元都命中某个档位」的覆盖**。
 *
 * ⚠️⚠️ **「同值」这一半在数据形状上恒真**（`[CR]` 2026-10-23 记）：
 *   档位表里**每档只有一份 `counts`** ⇒ 同一档内的所有单元查到的必然是同一个值。
 *   ⇒ 「同值」那条断言**没有鉴别力**（它永远不会红）。如实记下来，别把它当防线。
 *   ⇒ 这条判据真正的鉴别力在**覆盖**那一半：每个单元 1..24 都必须命中某个档位，
 *     命中不到时 `optionCountTierForUnit` **抛错**（fail-fast）——
 *     而原来的写法只遍历「已声明区间里的单元」，档位表中间**留个洞**（如 1–4 / 6–24）
 *     它照样全绿。
 */
function assertSameWithinTierAndCovered(tiers: readonly OptionCountTier[]): void {
  for (const unit of ALL_UNITS) {
    // ⚠️ 命中不到 ⇒ 这里直接抛错（覆盖的鉴别力就来自这一行）
    const tier = optionCountTierForUnit(unit, tiers)
    for (const kind of CARD_KINDS) {
      expect(
        tier.counts[kind],
        `单元 ${unit}（第 ${tier.unitRange[0]}-${tier.unitRange[1]} 档）的 ${kind} 选项数与档位表的值不一致 —— ` +
          '档内必须同值，否则「档」这个概念就没了，内容作者在同档内也没有一致的依据',
      ).toBe(tier.counts[kind])
    }
  }
}

/**
 * G263 ③ 的**判据本体** —— 档内卡型不降：`word ≤ keyword ≤ response`。
 */
function assertKindNonDecreasingWithinTier(tiers: readonly OptionCountTier[]): void {
  for (const t of tiers) {
    const { word, keyword, response } = t.counts
    expect(
      word,
      `第 ${t.unitRange[0]}-${t.unitRange[1]} 档的单词卡选项数 ${word} 大于关键词卡 ${keyword} —— ` +
        '单词卡是难度阶梯的起点（FR15），它不该比需要认读整句的卡更费劲',
    ).toBeLessThanOrEqual(keyword)
    expect(
      keyword,
      `第 ${t.unitRange[0]}-${t.unitRange[1]} 档的关键词卡选项数 ${keyword} 大于回应卡 ${response} —— ` +
        '回应卡要读整句短语，它的识别负担在关键词卡之上',
    ).toBeLessThanOrEqual(response)
  }
}

describe('G263 —— 三条性质：逐档不降 / 档内同值 / 档内卡型不降（AC-B1、B2）', () => {
  it('① 逐档单调不降（每个卡型各自不降）', () => {
    assertMonotonicPerKind(OPTION_COUNT_TIERS)
  })

  it('① 的下界：至少有一档真的上升（否则「不降」是一条恒真的废话）', () => {
    // ⚠️ R-51 第 1 类失效的预防：上面那条是**上界**断言（不降）。
    //   一条「3 档全都不变」的档位表照样全绿 —— 而那意味着选项数从头到尾不变，
    //   「越靠后的单元选项数越多」这句话根本没兑现。
    let rose = false
    for (const kind of CARD_KINDS) {
      for (let i = 1; i < OPTION_COUNT_TIERS.length; i += 1) {
        if (OPTION_COUNT_TIERS[i].counts[kind] > OPTION_COUNT_TIERS[i - 1].counts[kind]) rose = true
      }
    }
    expect(
      rose,
      '三个卡型在整张档位表上一次都没有上升 —— 难度阶梯在选项数这一维上完全没动，' +
        '而「单调不降」全绿（它允许恒定）',
    ).toBe(true)
  })

  it('② 档内同值，且每个单元都命中某个档位（不留洞）', () => {
    assertSameWithinTierAndCovered(OPTION_COUNT_TIERS)
  })

  it('③ 档内卡型不降：word ≤ keyword ≤ response', () => {
    assertKindNonDecreasingWithinTier(OPTION_COUNT_TIERS)
  })

  it('反向自测：造一张「档内卡型倒挂 / 逐档倒退」的假档位表 ⇒ 上面三条都会红', () => {
    // ⚠️ R-51：三条性质判据必须真能咬住它们各自要防的违规。
    //   这张假表：第 2 档的 keyword 掉到 2（低于第 1 档的 3 ⇒ 违反 ①），
    //   同时 keyword 2 < word 3（违反 ③）。
    const broken = [tier(1, 4, 2, 3, 3), tier(5, 10, 3, 2, 4)]
    // ⚠️⚠️ **必须把违规夹具喂进判据本体**（`[CR]` 2026-10-23 修）：
    // ① 逐档不降：第 2 档 keyword 2 < 第 1 档 keyword 3 ⇒ 违规。
    expect(
      () => assertMonotonicPerKind(broken),
      '①「逐档不降」在「第 2 档 keyword 倒退」的假表上没红 ⇒ 判据本身失效',
    ).toThrow()
    // ③ 档内卡型不降：第 2 档 word 3 > keyword 2 ⇒ 违规。
    expect(
      () => assertKindNonDecreasingWithinTier(broken),
      '③「档内卡型不降」在「word > keyword」的假表上没红 ⇒ 判据本身失效',
    ).toThrow()
    // ② 覆盖：档位表中间留个洞（1–4 / 6–24）⇒ 单元 5 命中不到 ⇒ 判据抛错。
    const holed = [tier(1, 4, 2, 3, 3), tier(6, 24, 4, 4, 4)]
    expect(
      () => assertSameWithinTierAndCovered(holed),
      '②「每个单元都命中某个档位」在「1–4 / 6–24」留洞的假表上没红 ⇒ 判据本身失效',
    ).toThrow()
    // 真表必须满足这两条（否则上面两条性质断言是恒假的）。
    expect(OPTION_COUNT_TIERS[1].counts.keyword).toBeGreaterThanOrEqual(
      OPTION_COUNT_TIERS[0].counts.keyword,
    )
    expect(OPTION_COUNT_TIERS[1].counts.word).toBeLessThanOrEqual(OPTION_COUNT_TIERS[1].counts.keyword)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// G265 —— 档位边界跨层一致
// ══════════════════════════════════════════════════════════════════════════════

/**
 * G265 的**判据本体** —— 内容层的档位边界 === core 的 `BALANCE_TIERS`。
 *
 * ⚠️ 抽成函数的理由同 G263：反向自测必须能**把违规夹具喂进它**。
 */
function assertTiersMatchCore(tiers: readonly OptionCountTier[]): void {
  expect(
    tiers.length,
    `内容层的档位表有 ${tiers.length} 档，core 的 BALANCE_TIERS 有 ${BALANCE_TIERS.length} 档 —— ` +
      '两者的档位边界必须逐档对应：core 加一档（经济档位变了）而内容层没跟时，' +
      '那一档的单元会拿到上一档的选项数，难度静默偏掉',
  ).toBe(BALANCE_TIERS.length)
  for (let i = 0; i < Math.min(tiers.length, BALANCE_TIERS.length); i += 1) {
    expect(
      [...tiers[i].unitRange],
      `第 ${i} 档的单元区间与 core 的 BALANCE_TIERS 第 ${i} 档不一致 —— ` +
        '内容层与 core 是同一套「阳光档位划分」的两份记录，分开了就不是同一套',
    ).toEqual([...BALANCE_TIERS[i].unitRange])
  }
}

describe('G265 —— 内容层的档位边界 === core 的 BALANCE_TIERS（AC-B2）', () => {
  // ⚠️ **这条必须在测试层做**（R-10：`src/content/` 不得 import `src/core/`，
  //   `tests/content/content-boundary.test.ts` 的源码兜底会拦）。
  //   内容层与 core 各写一遍区间边界（不是重复实现，是**两份记录**）⇒
  //   漂移必须有人比对，那就是这条守卫存在的全部理由。

  it('档数一致（core 加一档而内容层没跟时必须红）', () => {
    assertTiersMatchCore(OPTION_COUNT_TIERS)
  })

  it('每一档的单元区间逐字相等（1–4 / 5–10 / 11–24）', () => {
    assertTiersMatchCore(OPTION_COUNT_TIERS)
  })

  it('反向自测：把内容层某一档的区间改掉 ⇒ 上面两条立刻红', () => {
    // ⚠️ R-51：跨层比对必须真能咬住「一边改了另一边没跟」。
    const drifted = OPTION_COUNT_TIERS.map((t, i) =>
      i === 1 ? { ...t, unitRange: [5, 11] as const } : t,
    )
    expect(
      () => assertTiersMatchCore(drifted),
      '判据在「内容层某一档区间漂移」的假表上没红 ⇒ 判据本身失效（它可能恒真）',
    ).toThrow()
    // 真表必须与 core 一致。
    expect([...OPTION_COUNT_TIERS[1].unitRange]).toEqual([...BALANCE_TIERS[1].unitRange])
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// G266 —— 档位表的结构与冻结
// ══════════════════════════════════════════════════════════════════════════════

describe('G266 —— 档位表结构：空表 / 倒置 / 重叠一律抛错，逐层冻结（AC-A3）', () => {
  it('空表抛错（任何单元都将无处取值）', () => {
    expect(
      () => assertOptionCountTiers([]),
      '空档位表没有抛错 ⇒ 线性扫描静默返回 undefined，调用方拿到 undefined 当选项数用',
    ).toThrowError(/不能为空/)
  })

  it('区间倒置抛错（from > to）', () => {
    expect(
      () => assertOptionCountTiers([tier(7, 3, 2, 3, 3)]),
      '区间倒置没有抛错 ⇒ 那一档永远不会被命中，而它的数值仍留在表里等着骗人',
    ).toThrowError(/倒置/)
  })

  it('区间重叠抛错（线性扫描会静默取先命中的一条）', () => {
    expect(
      () => assertOptionCountTiers([tier(1, 4, 2, 3, 3), tier(3, 10, 3, 4, 4)]),
      '区间重叠没有抛错 ⇒ 第 3、4 单元会拿到第 1 档的数值，而两档的数值都是「合法」的',
    ).toThrowError(/重叠/)
  })

  it('反向自测：重叠的那一对**真写进去**时判据会红（不是「想一遍」）', () => {
    // ⚠️ R-51/T6.5：上面三条已经写了违规形态，但它们断言的是**抛错**。
    //   这条从**另一头**证明判据不是恒抛：合法表必须**不抛** ——
    //   否则「无论什么表都抛错」也会让上面三条全绿（一个假守卫）。
    expect(
      () => assertOptionCountTiers(OPTION_COUNT_TIERS),
      '合法的档位表竟然抛错了 ⇒ 上面三条是恒抛的假守卫',
    ).not.toThrow()
    // 合法表逐档命中正确：
    expect(optionCountTierForUnit(1).unitRange).toEqual([1, 4])
    expect(optionCountTierForUnit(5).unitRange).toEqual([5, 10])
    expect(optionCountTierForUnit(24).unitRange).toEqual([11, 24])
  })

  it('档位表逐层冻结（运行期唯一防线就是它）', () => {
    // ⚠️ 为什么这条非有不可：类型层的 `readonly` 防不住运行期的 `as` 强转，
    //   而难度曲线被无痕改写时，全部守卫仍然绿（同 `BALANCE_TIERS` 的教训）。
    expect(Object.isFrozen(OPTION_COUNT_TIERS), '档位表容器必须冻结').toBe(true)
    for (const t of OPTION_COUNT_TIERS) {
      expect(Object.isFrozen(t), `档位 ${t.unitRange[0]}-${t.unitRange[1]} 必须冻结`).toBe(true)
      expect(Object.isFrozen(t.unitRange), `档位 ${t.unitRange[0]}-${t.unitRange[1]} 的 unitRange 必须冻结`).toBe(true)
      expect(Object.isFrozen(t.counts), `档位 ${t.unitRange[0]}-${t.unitRange[1]} 的 counts 必须冻结`).toBe(true)
    }
  })
})
