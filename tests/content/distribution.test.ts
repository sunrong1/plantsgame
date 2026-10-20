/**
 * 卡型分布规则的守卫（Story 2.2 / AC-A2、B1、B2；守卫 **G187 – G189**）。
 *
 * ── 守什么 ────────────────────────────────────────────────────────────────
 * · **G187（可计算 + 覆盖，AC-A2）** —— `targetCardDistribution(unitNumber)` 对 1..20
 *   每个单元产出三个份额，各自 ∈ [0,1] 且和 = 1；`0` / `21` / 非整数一律抛错；
 *   锚点的键集合 === `CardKindSchema` 的取值集合。
 * · **G188（单调，AC-B1）** —— 单词份额逐单元**不增**；句/对话层（关键词 + 回应）
 *   逐单元**不减**；且两端锚点的总位移等于两锚点之差。
 * · **G189（无断崖，AC-B2）** —— 相邻单元的句/对话层份额差 ≤ 0.03（3 个百分点），
 *   且每一档都**确实在上升**（下界 > 0）。
 *
 * ⚠️ **单元 1 的「规则 ↔ 内容一致」守卫（G190，AC-B3）不在本文件** ——
 * 它在 `tests/content/unit-01.test.ts`（与那份 AC-17 的内容侧断言住在一起）。
 * 本文件只守**规则自身**的性质；规则与真实内容是否对得上，属内容层的账。
 *
 * ── 为什么这么写 ──────────────────────────────────────────────────────────
 * · **两个上界断言都配了一条下界断言**（R-51 第 1 类失效的预防）。
 *   G189 若只写「相邻差 ≤ 0.03」，那么「相邻差恒等于 0」（难度**不升**）与
 *   「相邻差 0.019」（真正的阶梯）长得一模一样 —— 断言允许的 0 正是它要防的违规。
 *   同理 G188 只写「不增 / 不减」的话，一条**恒定不变**的曲线也能过。
 *   ⇒ 每条单调性断言后面都跟一条「总位移等于两锚点之差」的实值断言。
 * · **份额和的容差取 1e-12，并写明为什么**。三个份额各自独立插值，浮点误差上界
 *   远低于 1e-12。
 *   ⚠️ `[CR]` 2026-10-20 更正：原文写的是「浮点误差上界约 `3 × eps ≈ 6.7e-16`；
 *   任何真实违规偏差都 ≥ 0.05 —— 容差比违规小 10 个数量级」。**后半句被本 story
 *   自己的变异实测推翻**：M219 的偏差是 0.05，但 M223（首锚点 word 改 29/37）在单元 1
 *   只偏 `1/37 = 0.027`，M221（word 曲线改恒定）在单元 2 只偏 `0.019` ——
 *   都是「改一个系数」的最小量级，都远小于 0.05。
 *   ⇒ 如实改成：**实测到的最小违规偏差约 0.019**，仍是容差的 10⁷ 倍以上 ⇒
 *   容差没有放行任何真实违规，但差的是 **7 个数量级不是 10 个**。原文不得复活。
 * · **不写死具体份额**（R-56 的同款要求：本文件用实算，不用硬编码的期望表）。
 *   单元 1 与单元 20 的两个端点由 `CARD_DISTRIBUTION_ANCHORS` 给出，
 *   中间单元只验性质（范围 / 和 / 单调 / 步长），不验具体数值 ——
 *   具体数值是产品裁决，改它要同时改实现与 `docs/card-distribution.md`，不该由测试拦。
 * · **锚点键集合走运行期判据**：类型层 `Record<CardKind, number>` 已经保证三型齐全，
 *   但 R-51 第 2 类失效说「`as` 向下转型恰好在最需要它时失灵」—— 所以运行期再验一次。
 *
 * ── 期望值来源与出处 ──────────────────────────────────────────────────────
 * · 规则与三条性质：`src/content/distribution.ts` 的文件头 + `docs/card-distribution.md`
 * · 「过渡平滑，无单元出现断崖式跳变」：Story 2.2 AC 组 B（B2）
 * · 「难度递增只能由卡型分布与词汇承载」：同 AC 组 C（C2）
 *
 * ── 变异台账（[CR] 2026-10-20 补进测试文件） ──────────────────────────────
 * ⚠️ 原来 M2xx 只活在 story 文档里，`grep M218 tests/ src/` 一条都搜不到，
 *   「7 个变异」成了无从核对的散文。本 story 的变异号改写在这里，
 *   沿用仓库既有惯例（deferred #39 说的「grep tests/ src/ 查上界」依赖的就是这个）。
 * · **M218** 放宽越界判据 → 1 红（G187 抛错用例）
 * · **M219** 末锚点 response 0.35 → 0.40 → 1 红（G187 份额和；G189 仍绿是对的，步长仍 ≤ 0.03）
 * · **M220** word 插值终点反向 → 3 红（G187 份额和 + G188 不增 + G188 总位移）
 * · **M221** word 曲线改恒定 → 2 红（G187 份额和 + G188 总位移；**G188「不增」仍绿**，
 *   被「总位移」抓住 —— 那条反空转断言有牙的实测证据）
 * · **M222** 线性插值改两档阶梯 → 2 红（仅 G189 上下界两条）
 * · **M224** CardKindSchema 加第四型 → 2 红（G187 键集合 + 既有 `schema.test.ts`）
 * · **M225**（[CR] 新增）守恒变异：首锚点 word 30/37 → 25/37、keyword 1/37 → 6/37，
 *   三份额之和**仍 = 1** → **1 红，且只有 G190**（内容侧）红。
 *   这条是 M223 的加强版：M223 顺带改了份额和所以 G187 会红，M225 不改和，
 *   于是本文件**全部绿** —— 由此坐实「G188 总位移里的首锚点断言是恒真式」，
 *   那一行已删除（见该测试内的注释）。
 * · **M226**（[CR] 新增）让 `response` 插值终点反向 → 4 红。
 *   补的是 M218–M224 的**空白**：M220 只反转了 `word`，G188 的
 *   「句/对话层逐单元不减」那条断言在原 7 条变异里**从未被触发过**。
 *   原样例会补上，但编号随文档重排，以 story 文档的变异表为事实源（R-32）。
 */

import { describe, expect, it } from 'vitest'

import {
  CARD_DISTRIBUTION_ANCHORS,
  FIRST_UNIT,
  LAST_UNIT,
  sentenceLayerShare,
  targetCardDistribution,
} from '../../src/content/distribution'
import { CardKindSchema } from '../../src/content/schema'

/** 规则覆盖的全部单元号（1..20）。 */
const ALL_UNITS: readonly number[] = Array.from(
  { length: LAST_UNIT - FIRST_UNIT + 1 },
  (_, i) => FIRST_UNIT + i,
)

/** 三个份额之和与 1 的容差，见文件头「为什么这么写」第 2 条。 */
const SUM_TOLERANCE = 1e-12

/**
 * AC-B2 的阈值：相邻单元的句/对话层份额差上限（3 个百分点）。
 *
 * 两锚点线性下的实际值 ≈ 0.019，阈值 0.03 是 AC 建议值 ——
 * 留出的余量给未来把两锚点换成三锚点曲线时**仍然守住「无断崖」**。
 */
const MAX_STEP = 0.03

describe('G187 —— 可计算 + 覆盖 1..20（AC-A2）', () => {
  it('每个单元产出三个份额：各自 ∈ [0,1]，且三者之和 = 1', () => {
    for (const unit of ALL_UNITS) {
      const dist = targetCardDistribution(unit)
      for (const [kind, share] of Object.entries(dist)) {
        expect(
          Number.isFinite(share) && share >= 0 && share <= 1,
          `单元 ${unit} 的 ${kind} 份额 ${share} 不在 [0,1] —— 份额越界意味着插值的锚点写坏了`,
        ).toBe(true)
      }
      const shares = Object.values(dist)
      const sum = shares.reduce((a, b) => a + b, 0)
      expect(
        Math.abs(sum - 1),
        `单元 ${unit} 的三份额之和是 ${sum}（应为 1，容差 ${SUM_TOLERANCE}）—— ` +
          '和不为 1 意味着该单元的一部分卡型要么没被计入、要么被重复计入，' +
          '内容作者按它四舍五入出的条数会系统性偏掉',
      ).toBeLessThanOrEqual(SUM_TOLERANCE)
    }
  })

  it('越界（0 / 21）与非整数（2.5 / NaN）一律抛错，且错误信息说清覆盖范围', () => {
    for (const bad of [0, 21, -1, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        () => targetCardDistribution(bad),
        `单元号 ${bad} 没有抛错 —— 静默外推会让「单元结构扩到 20 以上」这件事在这里被吞掉，` +
          '而难度曲线在没人看的地方偏出去，且没有任何报错指向它',
      ).toThrowError(/分布规则的覆盖范围外|单元号必须是整数/)
    }
  })

  it('锚点的键集合 === CardKindSchema 的取值集合（三型齐全，不多不少）', () => {
    // Zod 4 的枚举把合法值放在 `.def.entries` 里，形如 `{ word: 'word', ... }`，
    // 与 `tests/content/content-boundary.test.ts` 的塔型白名单读法同款。
    const def = CardKindSchema.def as { entries?: Record<string, string> }
    if (def.entries === undefined) {
      throw new Error('CardKindSchema 不再是枚举 —— 卡型取值集合的读法变了，本断言需要重写')
    }
    const kinds = Object.keys(def.entries)
    expect(
      Object.keys(CARD_DISTRIBUTION_ANCHORS.first).sort(),
      `锚点的键集合与 CardKindSchema 的取值集合不一致（schema：${kinds.join('/')}）—— ` +
        'schema 增删卡型而锚点没跟上，该族卡的份额会被静默漏算',
    ).toEqual([...kinds].sort())
    expect(
      Object.keys(CARD_DISTRIBUTION_ANCHORS.last).sort(),
      `末锚点的键集合与 CardKindSchema 的取值集合不一致（schema：${kinds.join('/')}）—— ` +
        '同一族卡在首末两个锚点上被计入的程度不一致 ⇒ 曲线在中途出现台阶',
    ).toEqual([...kinds].sort())
    // ⚠️ `[CR]` 2026-10-20 补：原来只比**锚点**，没比**函数真正返回的那个对象**。
    //   锚点对了而 `targetCardDistribution` 少拼一族键（插值那三行是字面量写的），
    //   上面两条照样绿，而调用方拿到的是残缺分布。类型层 `Record<CardKind, number>`
    //   会在编译期挡住，但这道运行期兜底得对着实际返回值也走一遍。
    for (const unit of [FIRST_UNIT, 10, LAST_UNIT]) {
      expect(
        Object.keys(targetCardDistribution(unit)).sort(),
        `单元 ${unit} 的返回分布键集合与 CardKindSchema 不一致 —— ` +
          '插值那几行是逐字写的键，schema 增删卡型时它可能与锚点脱节',
      ).toEqual([...kinds].sort())
    }
  })
})

describe('G188 —— 逐单元单调：单词不增、句/对话不减（AC-B1）', () => {
  it('单词份额逐单元不增', () => {
    for (const unit of ALL_UNITS.slice(1)) {
      const prev = targetCardDistribution(unit - 1).word
      const cur = targetCardDistribution(unit).word
      expect(
        cur,
        `单元 ${unit} 的单词份额 ${cur} 大于单元 ${unit - 1} 的 ${prev} —— ` +
          '难度阶梯要求词汇层逐层退让；单词份额中途回升即出现回退',
      ).toBeLessThanOrEqual(prev)
    }
  })

  it('句/对话层（关键词 + 回应）份额逐单元不减', () => {
    for (const unit of ALL_UNITS.slice(1)) {
      const prev = sentenceLayerShare(unit - 1)
      const cur = sentenceLayerShare(unit)
      expect(
        cur,
        `单元 ${unit} 的句/对话层份额 ${cur} 小于单元 ${unit - 1} 的 ${prev} —— ` +
          '难度阶梯要求句/对话层逐层加厚；中途变薄即出现难度回退',
      ).toBeGreaterThanOrEqual(prev)
    }
  })

  it('总位移等于两锚点之差（单调断言不是空转：恒定不变的曲线过不了这一条）', () => {
    // ⚠️ R-51 第 1 类失效的预防：上面两条只写「不增 / 不减」的话，
    // 一条**完全恒定**的曲线（每一格都一样）也会绿 —— 那意味着难度不升反降。
    const firstWord = targetCardDistribution(FIRST_UNIT).word
    const lastWord = targetCardDistribution(LAST_UNIT).word
    expect(
      lastWord,
      `末单元的单词份额是 ${lastWord}，应逐字等于末锚点的 ` +
        `${CARD_DISTRIBUTION_ANCHORS.last.word} —— 整条曲线必须真的从首锚点走到末锚点，` +
        '否则「单调」只是在描述一条不动的线',
    ).toBeCloseTo(CARD_DISTRIBUTION_ANCHORS.last.word, 12)
    expect(
      sentenceLayerShare(LAST_UNIT),
      `末单元的句/对话层份额是 ${sentenceLayerShare(LAST_UNIT)}，应等于末锚点的 ` +
        `${CARD_DISTRIBUTION_ANCHORS.last.keyword + CARD_DISTRIBUTION_ANCHORS.last.response}`,
    ).toBeCloseTo(
      CARD_DISTRIBUTION_ANCHORS.last.keyword + CARD_DISTRIBUTION_ANCHORS.last.response,
      12,
    )
    // ⚠️ `[CR]` 2026-10-20 **删掉**了原来第三条断言
    //   `expect(targetCardDistribution(FIRST_UNIT).word).toBeCloseTo(anchors.first.word, 12)`。
    //   它是**恒真式**：`targetCardDistribution(1).word` 按插值定义就是
    //   `FIRST_ANCHOR.word + (LAST-FIRST)*0 === FIRST_ANCHOR.word`，而
    //   `CARD_DISTRIBUTION_ANCHORS.first === FIRST_ANCHOR` —— 拿 x 跟 x 比，永远绿。
    //   实测坐实（守恒变异 M225）：把首锚点改成 word 25/37 + keyword 6/37
    //   （三份额之和仍 = 1），G187 的和、G188 的不增、本条的位移全部**不红**，
    //   只有 G190 红 —— 本条对那种变异零贡献。
    //   「首锚点必须逐字取自真实内容」这条**真正的**断言在
    //   `tests/content/unit-01.test.ts` 的 G190：它拿规则和 `unit-01.json` 两份
    //   独立来源对撞，不是自己跟自己比。
  })
})

describe('G189 —— 过渡平滑、无断崖（AC-B2）', () => {
  it('相邻单元的句/对话层份额差 ≤ 0.03', () => {
    for (const unit of ALL_UNITS.slice(1)) {
      const delta = Math.abs(sentenceLayerShare(unit) - sentenceLayerShare(unit - 1))
      expect(
        delta,
        `单元 ${unit - 1} → ${unit} 的句/对话层份额跳了 ${delta}（上限 ${MAX_STEP}）—— ` +
          '超过阈值即孩子在一个单元里被突然加压，这正是 AC-B2 要防的断崖',
      ).toBeLessThanOrEqual(MAX_STEP)
    }
  })

  it('且每一档都确实在上升（差值下界 > 0，堵住「全绿但难度不升」）', () => {
    // ⚠️ 上一条是**上界**断言：相邻差恒等于 0（难度根本不升）照样全绿。
    //   断言允许的 0 正是它要防的违规 ⇒ 必须配一条下界。
    const steps = ALL_UNITS.slice(1).map((unit) => sentenceLayerShare(unit) - sentenceLayerShare(unit - 1))
    // ⚠️ `[CR]` 2026-10-20 补：`Math.min()` 吃空数组返回 `Infinity`，
    //   而 `Infinity > 0` 为真 ⇒ 单元区间一旦被收成一个点，这条断言会**静默恒绿**。
    //   步数本身就是这条断言的前提，先把它钉住。
    expect(
      steps.length,
      `相邻步长数组是空的（只覆盖了 ${ALL_UNITS.length} 个单元）—— ` +
        '下面用 `Math.min()` 求下界，空数组会返回 `Infinity` 并让本条断言恒绿',
    ).toBeGreaterThan(0)
    const min = Math.min(...steps)
    expect(
      min,
      `${steps.length} 个相邻步长里最小的是 ${min} —— 至少有一格没有上升，阶梯在那里停住了，` +
        '此时「无断崖」全绿却毫无意义（难度不再逐层升上去）',
    ).toBeGreaterThan(0)
  })
})
