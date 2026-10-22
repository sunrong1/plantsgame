/**
 * 选项数递进规则 —— 「一张卡给孩子几个选项」的**唯一计算入口**（Story 2.4 / AC-A1、A2、A3、B1、B2、B3）。
 *
 * ── 守什么 ────────────────────────────────────────────────────────────────
 * 1. **规则可计算**：给定单元号与卡型，得出该单元该卡型的**目标选项数**（整数）。
 * 2. **逐档单调不减**：越靠后的单元，选项数越多（每个卡型随档位不降）。
 * 3. **档内同值**：同一档内所有单元同值（这是「档位表」的定义，不是额外规则）。
 * 4. **规则与单元 1 的真实内容零容差一致**（守卫在 `tests/content/unit-01.test.ts` 的 G264）。
 *
 * ── 为什么是「三档阶梯」而不是插值或 20 行手写表（[CS] 裁决 1）──────────
 * · **选项数是整数**。2.2 的线性插值形态在这里用不了 —— 份额插值出来的选项数
 *   可能是 2.37 这种数，落到卡上只能四舍五入，于是「整数化」会变成**第二个事实源**
 *   （`src/content/distribution.ts` 的文件头逐字写着「本文件不提供整数化函数 ——
 *   加它就会有两个事实源」）。整数上「过渡平滑 / 无断崖」只能落在「逐档台阶」上。
 * · **20 行手写表**（20 单元 × 3 卡型 = 60 个数字）把整个产品决策面摊开。
 *   3 档 × 3 卡型 = **9 个数字**是最小的决策面。
 *
 * ── 🔥 与 `distribution.ts` 的口径差异（同目录下两个姊妹文件，必须各写一句）──
 * · `distribution.ts` 管的是**卡型占比**（连续份额、逐单元线性插值，AC 要求「无断崖」）。
 * · **本文件管的是选项数**（整数、逐档台阶，AC 要求「越靠后的单元选项数越多」）。
 * · 两者**互不引用数字** —— 卡型占比不决定选项数，选项数也不反推占比。
 *   本文件只需要知道「这个单元属于哪一档」，而那一档由**关卡段划分**决定。
 *   ⇒ **「无断崖」是 2.2 的 AC，不是本规则的**；本规则在第 4→5 单元、第 10→11 单元
 *   各有一次**值跳变**（例如单词卡 2 → 3），这不违反本 story 的 AC。
 *   若将来要平滑，只能**加档**（4 档 / 5 档），不能改成插值。
 *
 * ── 档位边界为什么不 import `BALANCE_TIERS`（[CS] 裁决 2）──────────────────
 * · `src/content/` **不得 import `src/core/`**（R-10 + `tests/content/content-boundary.test.ts`
 *   的源码兜底）⇒ 内容层的档位边界**只能逐字写一遍**。
 * · 解法不是「破例 import」，而是**在测试层比对两张表**：守卫 **G265** 断言
 *   「内容层的档位边界 === `BALANCE_TIERS` 的档位边界」⇒ 既守住了 R-10，
 *   又让漂移无处藏身（档数与区间**双向**钉）。
 * · ⚠️ 同一段 `distribution.ts` 的实测记录：**动态 `import()` 形态既不触发 ESLint、
 *   也不触发那条源码兜底（它只正则 `from '…'`）、typecheck 也过，且运行期真的把
 *   战斗常量读回来了** ⇒ **本文件一个字都不许出现动态 import**，
 *   也别指望那条边界替你挡任何东西。
 *
 * ── 为什么逐层 `Object.freeze` ────────────────────────────────────────────
 * 与 `src/core/balance.ts` 的 `BALANCE_TIERS` 同款（`[CR]` P16 的教训）——
 * 类型层的 `readonly` 防不住运行期的 `as` 强转，而难度曲线被无痕改写时，
 * 全部守卫仍然绿。
 *
 * ── 期望值来源与出处 ──────────────────────────────────────────────────────
 * · 规则正文：`docs/option-count.md`（本文件是它的机器可读实现，两者不一致时
 *   以本文件为准，正文需同步更新）
 * · 档 1 的三个数（2 / 3 / 3）是**实测值** —— 它们等于内容改完之后
 *   `src/content/units/unit-01.json` 的真实取值（守卫 G264 逐卡核对）。
 * · 档 2 / 档 3 的六个数（3/4/4、4/4/4）是**占位值** —— 没有内容可对，
 *   属**需要人审的产品数字**（R-20 的精神）：改它们 = 改难度曲线的一个点。
 * · 档位边界 1–4 / 5–10 / 11–20 = FR63 的阳光档位划分（全书唯一的分段口径）。
 */

import { FIRST_UNIT, LAST_UNIT } from './distribution'
import type { CardKind } from './schema'

/**
 * 一档的选项数。
 *
 * ⚠️ 键集合**不是**在这里重写的字面量，而是 `Record<CardKind, number>` ——
 * schema 增删卡型时这条类型会当场变红，而不是让规则悄悄少算一族卡。
 */
export type OptionCounts = Readonly<Record<CardKind, number>>

/** 一档：覆盖的单元号区间 + 该档三个卡型的目标选项数。 */
export interface OptionCountTier {
  /** 覆盖的单元号，闭区间。 */
  readonly unitRange: readonly [number, number]
  /** 三个卡型各自的目标选项数。 */
  readonly counts: OptionCounts
}

/**
 * 档位表 —— **选项数的单一事实源**。
 *
 * | 档 | 单元 | 单词 `word` | 关键词 `keyword` | 回应 `response` |
 * |---|---|---|---|---|
 * | 1 | 1–4 | **2** | **3** | **3** |
 * | 2 | 5–10 | 3 | 4 | 4 |
 * | 3 | 11–20 | 4 | 4 | 4 |
 *
 * ⚠️ **档 1 的三个数是实测值**：GDD 逐字写「早期关卡可从 **2 个选项**起步」，
 *   而单词卡是难度阶梯的起点（FR15，也是单元 1 里 37 张中的 30 张）⇒ 那个 2
 *   必须真的出现在档 1 的单词卡上。三个卡型都落在「两三个」里（story 的用户价值句），
 *   沿 FR15 的难度阶梯递增（单词 ≤ 关键词 ≤ 回应）⇒ **档内卡型不降**。
 *   ⚠️ **档 2 / 档 3 的六个数没有试玩数据背书**，是「符合 GDD 方向、且保守」的占位。
 *   Story 2.9 的试玩验收与 Story 3.x 的调优才是它们的真值来源。
 *
 * ⚠️ **改这九个数字 = 改难度曲线的一个点，属产品裁决**：必须同时改本文件与
 *   `docs/option-count.md`，并让 G262–G270 重跑（R-20 / R-57）。
 *
 * ⚠️ 逐层 `Object.freeze`（与 `BALANCE_TIERS` 同款理由，见文件头）。
 */
export const OPTION_COUNT_TIERS: readonly OptionCountTier[] = Object.freeze([
  Object.freeze({
    unitRange: Object.freeze([1, 4] as const),
    counts: Object.freeze({ word: 2, keyword: 3, response: 3 }),
  }),
  Object.freeze({
    unitRange: Object.freeze([5, 10] as const),
    counts: Object.freeze({ word: 3, keyword: 4, response: 4 }),
  }),
  Object.freeze({
    // ⚠️ 末档的上界用 `LAST_UNIT` 拼 —— 全仓只有一处写着「20」这个上界
    //   （`distribution.ts` 里那个），本文件不写第二份字面量。
    unitRange: Object.freeze([11, LAST_UNIT] as const),
    counts: Object.freeze({ word: 4, keyword: 4, response: 4 }),
  }),
])

/**
 * 档位表的结构校验：空表、倒置区间、重叠区间**一律抛错**。
 *
 * 形态照 `src/core/balance.ts` 的 `assertTierTable`：每次查询都校验而不是模块加载时
 * 校验一次 —— 3 档的校验成本可忽略，收益是**追加畸形档位时大声失败**，而不是
 * 「线性扫描静默取第一条命中」把重叠掩盖掉。
 */
export function assertOptionCountTiers(tiers: readonly OptionCountTier[]): void {
  if (tiers.length === 0) {
    throw new Error('选项数档位表不能为空 —— 任何单元都将无处取值')
  }
  for (const [i, a] of tiers.entries()) {
    const [fromA, toA] = a.unitRange
    if (fromA > toA) {
      throw new Error(`档位 ${i} 的区间倒置：[${fromA}, ${toA}]，from 必须 <= to`)
    }
    for (const [j, b] of tiers.entries()) {
      if (j <= i) continue
      const [fromB, toB] = b.unitRange
      if (fromA <= toB && fromB <= toA) {
        throw new Error(
          `档位 ${i} [${fromA},${toA}] 与档位 ${j} [${fromB},${toB}] 重叠 —— ` +
            '线性扫描会静默取先命中的一条，重叠必须大声失败',
        )
      }
    }
  }
}

/**
 * 某单元所属的档位。
 *
 * ⚠️ **命中未填档位时抛错，不返回 undefined、不回退默认值**（同 `tierForUnit` 的
 * fail-fast 风格）。静默回退就是「难度静默漂移」：一个没校准过的单元悄悄用了首档数值，
 * 而没有任何报错指向它。
 *
 * @param tiers 仅供测试用合成 fixture 驱动 `assertOptionCountTiers`；
 *              生产调用一律走默认的 `OPTION_COUNT_TIERS`。
 */
export function optionCountTierForUnit(
  unitNumber: number,
  tiers: readonly OptionCountTier[] = OPTION_COUNT_TIERS,
): OptionCountTier {
  if (!Number.isInteger(unitNumber)) {
    throw new Error(`单元号必须是整数，收到 ${unitNumber}`)
  }
  assertOptionCountTiers(tiers)
  for (const tier of tiers) {
    const [from, to] = tier.unitRange
    if (unitNumber >= from && unitNumber <= to) return tier
  }
  // 报错信息里带上「已填哪些档位」—— 接手的人不必翻代码就知道要补哪条。
  // ⚠️ **不写死任何区间，也不指向某个 story**：区间由实际档位表推导 ⇒ 表变了文案
  //   自动跟着变，永远不会过期。
  const filled = tiers.map((t) => `${t.unitRange[0]}-${t.unitRange[1]}`).join('、')
  throw new Error(
    `单元 ${unitNumber} 落在未填档位上。已填档位：${filled}。` +
      '未填档位不回退默认值（AC-A2）—— 回退即静默漂移。',
  )
}

/**
 * 某单元某卡型的**目标选项数**（AC-A2）。
 *
 * ⚠️ **越界与非整数一律抛错，不外推、不回退默认值**（同 `targetCardDistribution` 的
 * fail-fast 风格）。静默外推会让「单元 21 / 0」拿到一个看起来合理的数字，于是内容
 * 录入端的越界在这里被吞掉，而难度曲线会在没人看的地方偏出去。
 *
 * @param unitNumber 单元号，整数且落在 `[FIRST_UNIT, LAST_UNIT]`
 * @param kind 卡型（`word` / `keyword` / `response`）
 * @param tiers 仅供测试用合成 fixture 驱动 `assertOptionCountTiers`
 * @throws 单元号非整数、或落在覆盖范围之外
 */
export function targetOptionCount(
  unitNumber: number,
  kind: CardKind,
  tiers: readonly OptionCountTier[] = OPTION_COUNT_TIERS,
): number {
  // ⚠️ **先判整数、再判范围** —— 否则 `0.5` 会先撞上「越界」那条报错，
  //   而它真正的问题是「不是整数」。两条都是抛错，但报错文案要指向真正的原因。
  if (!Number.isInteger(unitNumber)) {
    throw new Error(`单元号必须是整数，收到 ${unitNumber}`)
  }
  if (unitNumber < FIRST_UNIT || unitNumber > LAST_UNIT) {
    throw new Error(
      `单元 ${unitNumber} 落在选项数规则的覆盖范围外。已覆盖单元：${FIRST_UNIT}-${LAST_UNIT}。` +
        '选项数规则不外推、不回退默认值（AC-A2）—— 越界即静默漂移。' +
        `若单元结构要扩到 ${LAST_UNIT} 以上，请改 LAST_UNIT 与末档，并重跑 G262-G270。`,
    )
  }
  const tier = optionCountTierForUnit(unitNumber, tiers)
  // ⚠️ **必须用 `hasOwn` 判存在性，不能用 `counts[kind] === undefined`** ——
  //   `counts` 是普通对象字面量 ⇒ `counts['toString']` / `counts['__proto__']` /
  //   `counts['constructor']` 会命中 `Object.prototype` 上的继承属性 ⇒
  //   `=== undefined` 为假 ⇒ **不抛错**，而是把一个函数（或 `Object.prototype`）
  //   当成「选项数」返回给调用方。
  //   （`Object.freeze` 挡不住原型链查找 —— 冻结的是自有属性，不是原型。）
  //   实测：`targetOptionCount(1, 'toString')` 曾返回 `function toString() { … }`。
  //   ⇒ 任何没过 `CardKind` 校验的调用方（脚本里的 `kind as …` 强转就是这种）
  //     会拿到一个「看起来合理」的非数字值，而这条守卫一次都不会响。
  if (!Object.hasOwn(tier.counts, kind)) {
    throw new Error(
      `档位 ${tier.unitRange[0]}-${tier.unitRange[1]} 没有卡型 ${kind} 的选项数 —— ` +
        '档位表的键集合必须与 CardKindSchema 的取值集合一致。',
    )
  }
  return tier.counts[kind]
}
