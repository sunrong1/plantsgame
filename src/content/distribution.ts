/**
 * 卡型分布规则 —— 难度阶梯的**唯一计算入口**（Story 2.2 / AC-A1、A2、A3、B1、B2）。
 *
 * ── 守什么 ────────────────────────────────────────────────────────────────
 * 1. **规则可计算**：给定单元号，得出该单元三型卡（`word` / `keyword` / `response`）
 *    各占多少**份额**，三份额之和 = 1。
 * 2. **逐层上移、无断崖**：单词份额随单元号单调不增，句/对话层（关键词 + 回应）
 *    单调不减，且相邻单元的增量有上限 —— 「难度自然升上去，而不是一上来就把我压垮」。
 * 3. **规则与单元 1 的真实内容一致**（守卫在 `tests/content/unit-01.test.ts` 的 G190）：
 *    单元 1 的锚点不是拍出来的整数近似，是 `unit-01.json` 的实测配比本身。
 *
 * ── 为什么这么写 ──────────────────────────────────────────────────────────
 * · **两锚点线性插值，不是三档阶梯、不是 24 行手写表**（[CS] 裁决 1）。
 *   三档阶梯（FR63 的 1–4 / 5–10 / 11–24）会在第 4→5、第 10→11 各产生一次**值跳变**，
 *   与 AC「过渡平滑，无单元出现断崖式跳变」当场冲突；而 24 行手写表把 72 个数字
 *   全摊成产品决策面。两个锚点是**最小的**决策面，线性插值让逐单元差值恒定，
 *   结构上不可能出现断崖。
 * · **份额不是条数**。一个单元 N 条词条是整数，规则给的是实数份额；
 *   整数化（四舍五入 ±1 张）是内容批次（Story 2.5–2.8）的验收口径，不是本规则的口径
 *   （[CS] 裁决 5 的代价）。本文件**不**提供整数化函数 —— 加它就会有两个事实源。
 * · **落在 `src/content/`，不是 `src/core/`**：R-10 + 内容层的 `no-restricted-imports`
 *   拦住**静态**的 core 导入（实测报错，带不带 `.ts` 后缀都拦），
 *   所以本文件读不到 `ZOMBIE_HP` / `ZOMBIE_MOVE_PER_ROUND` / 网格行号，也读不到
 *   `isCorrect`。难度递增由**卡型分布与词汇本身**承载，不由战斗数值与阳光承载
 *   （AC-C1 / AC-C2）。
 *   ⚠️ `[CR]` 2026-10-20 更正：原文写的是「**结构上**读不到」。当日实测**不成立** ——
 *   动态 `import()` 形态既不触发 ESLint（0 problems）、也不触发
 *   `content-boundary.test.ts` 的源码兜底（那条只正则 `from '…'`）、typecheck 也过，
 *   且**运行期真的把 `ZOMBIE_HP` 读了回来**。两条守卫都只认静态 import 形态。
 *   📎 **2026-10-25 夜已补上**（DF-120）：那条源码兜底改用 **TypeScript 的 AST**
 *   （守卫 **G304**，判据在 `tests/helpers/import-specifiers.ts`）⇒ 静态 / 动态 /
 *   重导出 / `require` 四种形态一次收齐 ⇒ 现在「结构上读不到」这句话**成立**。
 *   ⚠️ 但**别把它当成结构保证**：拦下来的是**本仓库的守卫**，不是语言层面的禁止 ——
 *   ESLint 那条 `no-restricted-imports` 至今**只认静态 import 形态**。
 * · **复用 `CardKindSchema` 的取值而不是新造一份联合类型**：`CardDistribution` 的键
 *   直接是 `Record<CardKind, number>`，于是「三型齐全」由类型系统保证 ——
 *   schema 增删卡型时这条类型当场变红，而规则悄悄少算一族卡不会发生。
 *   ⚠️ `[CR]` 2026-10-20 更正：原文接着写「卡型字面量在本文件里**一个字都没重写**」，
 *   那是**假的** —— `word` / `keyword` / `response` 三个字面量在本文件里逐字写了 9 处
 *   （两个锚点各 3 处 + 返回对象 3 处）。真的只是「没有**第三份联合类型声明**」。
 *   G187 的运行期键集合判据正是为这份重复兜底。
 * · **逐层 `Object.freeze`**：与 `src/core/balance.ts` 的 `BALANCE_TIERS` 同款
 *   （`[CR]` P16 的教训）—— 类型层的 `readonly` 防不住运行期的 `as` 强转，
 *   而难度曲线被无痕改写时，全部守卫仍然绿。
 *
 * ── 期望值来源与出处 ──────────────────────────────────────────────────────
 * · 规则本体与三条性质：`docs/card-distribution.md`（本文件是它的机器可读实现，
 *   两者不一致时以本文件为准，正文需同步更新）
 * · 支柱 3「逐层上移」（方向，非数字）：`gdd.md` 的学习支柱
 * · 单元 1 锚点 = `src/content/units/unit-01.json` 实测 2 单词 / 1 关键词 / 3 回应（共 6 条）
 * · 单元 24 锚点 25 / 25 / 50 —— **无试玩数据背书的占位值**，
 *   Story 2.9 试玩验收与 Story 3.2 / 3.3 调优才是它的真值来源。
 * · 「阳光递增不承载难度」：**塔是跨回合持久资产**（FR82），多出来的阳光只买到更多塔；
 *   难度递增必须靠别的机制承载，阳光递增只影响手感与容错。
 *   ⚠️ `epics.md` Story 2.2 原先用来论证这件事的**具体数字证据已被 GDD rev 5 作废**。
 *   引用「阳光递增不承载难度」这个结论时**不许把那组数字一起抄回来** ——
 *   按 R-21，抄进来等于把已知错值再固化一次。
 *   `[CR]` 2026-10-20：本文件此前逐字引了那一整句，**正是它自己禁止的抄法**，
 *   已撤下；`epics.md` 的源句也已按 R-21「在同一 story 内同步更正源文档」改写为
 *   机制表述（结论不变）。作废理由见 R-21 / R-23，本文件不复述。
 */

import type { CardKind } from './schema'

/** 分布规则覆盖的第一个单元号。 */
export const FIRST_UNIT = 1

/** 分布规则覆盖的最后一个单元号。24 关（两册各 12 个教材 Unit）。 */
export const LAST_UNIT = 24

/** 锚点之间的距离（步数）。单元 1 → 单元 24 共 23 步。 */
const SPAN = LAST_UNIT - FIRST_UNIT

/**
 * 一个单元的目标卡型份额。键与 `CardKindSchema` 的取值一一对应。
 *
 * ⚠️ 键集合**不是**在这里重写的字面量，而是 `Record<CardKind, number>` ——
 * schema 增删卡型时这条类型会当场变红，而不是让规则悄悄少算一族卡。
 */
export type CardDistribution = Readonly<Record<CardKind, number>>

/**
 * 单元 1 锚点 —— **逐字取 `unit-01.json` 的实测配比**（2 词 / 1 关键词 / 3 回应，共 6 条）。
 *
 * 为什么取真实值而不是整数近似（33% / 17% / 50%）：守卫 G190 要求「规则(单元 1) 与真实
 * 内容**零容差**一致」，取真实值让这条断言不需要任何解释与容差 —— 规则与内容之间
 * 零偏差这件事本身就是「规则是真的落在内容上」的证据。用整数近似会凭空造出一个
 * 需要解释的偏差，而那个偏差没有任何来源。
 *
 * ⚠️ `2 / 6` 而不是 `0.3333`：写死 `0.3333` 之后再改 `unit-01.json`，
 * 守卫 G190 会以「份额差 0.0000333」这种没人看得懂的数字变红。写成除法，
 * 红的原因就是「单元 1 的内容变了，请重新裁决锚点」—— 指向同一个真实的维护动作。
 */
const FIRST_ANCHOR: CardDistribution = Object.freeze({
  word: 2 / 6,
  keyword: 1 / 6,
  response: 3 / 6,
})

/**
 * 单元 24 锚点 —— 单词 25% / 关键词 25% / 回应 50%。
 *
 * 🔥 **本规则唯一一处「编出来」的产品数字**，且**没有试玩数据背书**。
 * 它是「符合 GDD 支柱 3 方向、且保守」的占位，不是结论：
 * · **保守** —— 末单元仍保留 25% 单词卡，不把词汇层抽空。塔防循环里「听音识物」
 *   始终在场，句 / 对话是**增项**不是**替换**；
 * · **与 Story 2.1 同向** —— 词图只跟单词卡走，单词份额从 33% 降到 25% ⇒ 词图总数下修，
 *   不引入任何新风险（数字见 `docs/card-distribution.md`）。
 *
 * ⚠️ **`response` 的末锚点不得低于首锚点的 `3 / 6 = 0.50`** —— 守卫 G193 要求
 *   `keyword` / `response` **各自**逐单元不减（而它的注释理由是「docs §1 承诺的是
 *   两族卡**各自**逐层加厚」）。首锚点的 `response` 份额已经是 50%（教材 Unit 1 只有
 *   2 个词、4 句 ⇒ 句子卡天然占多数）⇒ 末锚点的 `response` 必须 **≥ 0.50**。
 *
 * ⚠️ **为什么取 25 / 25 / 50 而不是别的（这是 2026-10-26 换源批次实测出来的，不是偏好）**：
 *   1. **用户当日报的 30 / 25 / 45 在本仓里数学上不可能**（逐条实测，2026-10-26）：
 *      · `response = 0.45 < 首锚点 0.50` ⇒ 守卫 G193 当场红；
 *      · 而 `response` 又**不能**低于 0.50：教材 Unit 1 只有 2 个词 + 4 句
 *        ⇒ 单元 1 的 `response` 份额**恒 ≥ 2/6**；
 *        若把单元 1 改成 2 词 / 2 关键词 / 2 回应（= 句/对话层 1/3），
 *        `keyword` 首锚点就变成 1/3 ⇒ 末锚点 `keyword` 必须 ≥ 1/3 ⇒ 25% 又不成立；
 *        ⇒ **无论单元 1 怎么排，30/25/45 都无解**。
 *   2. 三族之和恒为 1 ⇒ 给定 `response ≥ 0.50`，`word` 与 `keyword` 的其余部分只有
 *      **0.50** 可分 ⇒ **`keyword = 25%` 蕴含 `word = 25%`**（二者只能取其一为 25）。
 *   3. 取 `keyword = 25%`（用户当日报的数字逐字保留）比取 `word = 30%` 更贴近用户意图：
 *      相对旧末锚点（45 / 20 / 35），本值把**单词份额下调**（45 → 25）
 *      **同时把关键词份额上调**（20 → 25）—— 用户当日报的正是这两个方向；
 *      若取 30 / 20 / 50，则 `keyword` 相对旧锚点**原地不动**，用户要的「关键词加厚」就没了。
 *   4. **`response` 取 0.50 而非 0.55**：`response` 升到 0.55 会挤掉 `keyword` 的 25%
 *      （和恒为 1 ⇒ `word` 掉到 20%），而且**单元 2 的配比会当场无解** ——
 *      守卫 G278 的逐族误差 `|c_k − s_k × N| ≤ 0.5` 在 `response` 略高于 0.50 时
 *      逼不出 11 条的 (4 词 / 2 关键词 / 5 回应)：
 *      实测 `response = 0.55` ⇒ 单元 2 的 `s_response(2) = 0.5022` ⇒ 5 张的误差 0.524 > 0.5
 *      ⇒ **N = 11 无解**（唯一能凑的 N = 12 需要 8 张句子卡，而教材 Unit 2 只有 7 句，
 *      必然有一张卡的题面与另一张重复）。
 *      `response = 0.50` 时误差恰为 **0.5**（= 「四舍五入到最近整数」的定义边界，判据用
 *      `≤ 0.5`）且 (4, 2, 5) 正是 `docs/card-distribution.md` §5.1.1 **最大余数法**给出的结果。
 *   ⇒ 本值取 25 / 25 / 50：`word` 0.333→0.25 降、`keyword` 0.167→0.25 升、
 *     `response` 0.50→0.50 持平（守卫 G193 判的是「不减」，持平成立），
 *     句/对话层合计 66.7% → 75%（**逐层加厚**这一条仍然成立），
 *     全部步长 ≤ 0.0073（阈值 0.03）。
 *
 * 改这三个数就是改难度曲线的终点，属**产品裁决**：
 * 必须同时改本文件与 `docs/card-distribution.md`，并让 G187–G190 重跑。
 */
const LAST_ANCHOR: CardDistribution = Object.freeze({
  word: 0.25,
  keyword: 0.25,
  response: 0.5,
})

/** 锚点，导出供守卫与文档实算复用（避免「文档里的锚点」与「代码里的锚点」成两份事实）。 */
export const CARD_DISTRIBUTION_ANCHORS = Object.freeze({
  /** 覆盖的单元号，闭区间。 */
  unitRange: Object.freeze([FIRST_UNIT, LAST_UNIT] as const),
  first: FIRST_ANCHOR,
  last: LAST_ANCHOR,
})

/**
 * 线性插值。单元 1 处 `t = 0`，逐字返回起点值（`from + (to - from) * 0 === from`）。
 *
 * ⚠️ `[CR]` 2026-10-20 补注：G190 的「零容差」**依赖这一条算术恒等式**
 * （`(负数) * 0 === -0` 且 `x + (-0) === x`），它是**当前写法**的性质，不是规则本身的性质。
 * 若日后把插值改写成 `from * (1 - t) + to * t` 之类形态，单元 1 处会差 1 ulp，
 * G190 会以「份额差 0.0000000000000002」这种没人看得懂的数字变红 —— 正是同一文件
 * 在下面为了避开而特意选除法写法的那类数字。改插值形态时必须重跑 G190。
 */
function interpolate(from: number, to: number, unitNumber: number): number {
  const t = (unitNumber - FIRST_UNIT) / SPAN
  return from + (to - from) * t
}

/**
 * 某单元的目标卡型份额（AC-A2）。
 *
 * ⚠️ **越界与非整数一律抛错，不外推、不回退默认值**（同 `tierForUnit` 的 fail-fast 风格）。
 * 静默外推会让「单元 21 / 0」拿到一个看起来合理的配比，于是内容录入端的越界
 * 在这里被吞掉，而难度曲线会在没人看的地方偏出去 —— 且没有任何报错指向这里。
 *
 * @param unitNumber 单元号，整数且落在 `[FIRST_UNIT, LAST_UNIT]`
 * @throws 单元号非整数、或落在覆盖范围之外
 */
export function targetCardDistribution(unitNumber: number): CardDistribution {
  if (!Number.isInteger(unitNumber)) {
    throw new Error(`单元号必须是整数，收到 ${unitNumber}`)
  }
  if (unitNumber < FIRST_UNIT || unitNumber > LAST_UNIT) {
    throw new Error(
      `单元 ${unitNumber} 落在卡型分布规则的覆盖范围外。已覆盖单元：${FIRST_UNIT}-${LAST_UNIT}。` +
        '分布规则不外推、不回退默认值（AC-A2）—— 越界即静默漂移。' +
        `若单元结构要扩到 ${LAST_UNIT} 以上，请改 LAST_UNIT 与 LAST_ANCHOR，并重跑 G187-G190。`,
    )
  }
  return Object.freeze({
    word: interpolate(FIRST_ANCHOR.word, LAST_ANCHOR.word, unitNumber),
    keyword: interpolate(FIRST_ANCHOR.keyword, LAST_ANCHOR.keyword, unitNumber),
    response: interpolate(FIRST_ANCHOR.response, LAST_ANCHOR.response, unitNumber),
  })
}

/**
 * 某单元「句 / 对话层」的份额 —— 关键词卡 + 回应卡。
 *
 * 守卫 G188 / G189 用的就是这一条轴：**难度上升 = 这一层的份额上升**，
 * 而它「上升得多平滑」是「无断崖」的全部含义。导出成函数是为了让守卫读的是
 * 规则自己的定义，而不是在测试里把两份额手动加起来（后者会与规则演化分家）。
 */
export function sentenceLayerShare(unitNumber: number): number {
  const dist = targetCardDistribution(unitNumber)
  return dist.keyword + dist.response
}
