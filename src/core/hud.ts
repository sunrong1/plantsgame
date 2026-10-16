/**
 * HUD 的四组判据（Story 1.13 / AC-B1..AC-B7）。
 *
 * ── 为什么这些判据必须住在 `core/`，而不是三个 `.vue` 里 ─────────────────────
 * `epics.md` 的原话是「组件只读 `state`，**不得自行计算**造价、阳光增减或心数变化」，
 * 而 `game-architecture.md` 把这条标为**全项目漂移风险最高**、且「无工具可强制、
 * 只能靠 `[CR]`」。⇒ 本文件的全部内容就是把那句话**变成会红的判据**：
 * 组件里只允许出现本文件导出的四个函数名，别的数字一律不许出现（守卫 G50a..G50d）。
 *
 * ── 零 DOM、零 Vue、零随机、零时间依赖 ──────────────────────────────────────
 * 与 `turn.ts` / `combat.ts` 同一纪律。这也让 AC-B6 的六条性质测试可以在
 * **纯合成输入**上跑 —— AC-B6b 要求构造「一帧掉到 0」的局面，而真实战斗流程
 * 在 20000 个随机种子里一次都逼不出来（`deferred-work.md` 记载）。
 *
 * ── 依赖方向 ──────────────────────────────────────────────────────────────
 * 本文件**只** import `./balance.js`（取 `HEARTS`）与 `./types.js`（取 `State` 类型）。
 * ⚠️ **不得 import `../content/`** —— `src/content/index.ts:37` 是 `RAW_UNITS` 的
 * 静态 import JSON，拖进来会让 37 条词条进每一个 core 测试。代价是
 * 「属于本单元」只能靠 `id.startsWith('u' + unitNumber + '-')` 判（偏离 #7 / 裁决 7），
 * 且 `progressDisplay` 的分母 `total` **必须是参数**而不是查表得来的。
 */

import { HEARTS } from './balance.js'
import type { State } from './types.js'

/**
 * 跨局的进度内存态（AC-B5）。
 *
 * ⚠️ **键名逐字等于 `game-architecture.md:342-345`，一个字都不许改**：
 * 那两个键将来就是存档的字段名，1.15 序列化时按它们写。
 *
 * ⚠️ `readonly string[]` 而非架构原文的 `string[]`：架构那段是**存档形状**的示意，
 * 内存态用 `readonly` 才与 `src/core/types.ts` 里 `State` 全字段 `readonly` 的
 * 既有风格一致（守卫 G51 只断言**键名集合**，不查类型宽窄 —— 因为它查不了运行时）。
 */
export interface Progress {
  /**
   * 当前所处单元序号。**0 基**，与裁决 3 逐字一致（「本 story 初值 0」）。
   *
   * ⚠️ `[CR]` 2026-10-16 —— 这里原先自加了一句「（**1 起**）」，**与裁决 3 冲突，已删**：
   *   裁决 3 逐字写「本 story 初值 0」，且第 110 行「**不用**
   *   `progress.currentUnitIndex + 1`」这句话预设的正是 0 基。
   *   `game-architecture.md:343` 只写 `currentUnitIndex: number`，从未定义基准。
   *   ⚠️ 它会被 1.15 **逐字序列化进存档** ⇒ 基错了只能走迁移。守卫 G51 只断言**键名集合**，
   *     不查值 —— 那正是本 story 刻意留的口子，加基准守卫前先按 R-20..R-24 问人。
   */
  readonly currentUnitIndex: number
  /** 跨局累计掌握的词条 id。**只增不减**（FR58）。 */
  readonly masteredWordIds: readonly string[]
}

/**
 * 两帧之间**实际**掉了几颗心（AC-B1）。
 *
 * ⚠️ **不许用 `resolveCombatRound(...).heartsLost`。**
 * `reducer.ts` 的 `applyResolve` 用 `Math.max(0, state.hearts - heartsLost)` 把心数
 * **夹到 0**，而 `turn.ts` 的 `ResolveRoundResult.heartsLost` 文档明写它
 * 「**可能大于剩余心数**」⇒ 那是**掉心前**的计数。
 * 一次掉 2 心、只剩 1 心时，前者记 2（错，界面上只消失了 1 颗），后者记 1（对）。
 *
 * ⚠️ **本函数不持有余额**（与 `turn.ts` 的分工一致）：只报掉了几个，不报还剩几个。
 * 「还剩几个」是 `heartSlots` 的活。
 */
export function heartsLostBetween(prev: State, next: State): number {
  return Math.max(0, prev.hearts - next.hearts)
}

/**
 * 当前还剩几颗心 —— 逐槽的布尔数组，长度恒为 `HEARTS`（AC-B2）。
 *
 * ⚠️ **左低右高**：第 `i` 位 = `i < state.hearts`，所以**耗尽的是右端那几位**，
 * 而不是左端。这是为了让「最后一颗心掉了」这个动画出现在孩子视线扫过的末端。
 *
 * ⚠️⚠️ **耗尽的心不会从数组里「消失」—— 本函数返回定长数组，长度恒为 `HEARTS`。**
 *   `[CR]` 2026-10-16 更正：此处原文写的是「耗尽的心在右端**消失**」，
 *   `HeartRow.vue` 的模板注释据此又写「掉了一颗时 **DOM 少一位**，判据立刻有鉴别力」。
 *   **两句都与渲染结果矛盾**：耗尽的心返回 `false` 而非被移除，`v-for` 遍历的是
 *   定长数组 ⇒ 无论掉没掉心，`.heart-row__heart` 元素数量**恒定**。
 *   ⇒ **变异 M87（`v-for="i in 3"`）的真实鉴别力只来自 `is-spent` class，不来自元素数量。**
 *   照旧注释去写 M87 的守卫（如断言子元素数随掉心下降）会得到一条**永远失败或被写歪**的断言。
 *   ⇒ 「左低右高」的**排序**结论仍成立且仍重要，要保的是这一条，不是「消失」。
 *
 * ⚠️ **这个函数存在的理由是让组件里一个数字都没有**：`HeartRow.vue` 若直接 import
 * `HEARTS`，就撞上守卫 G33b 的标识符黑名单（`HEARTS` 在名单里，见
 * `tests/components/hand-build.test.ts` 的 `FORBIDDEN_VALUE_IDENTIFIERS`），
 * 而绕过它的唯一办法是模板里写死 `v-for="i in 3"` —— 那正是 G33b 要防的形态。
 * ⇒ 走 `core/hud.ts`，**G33b 一个字都不用改**。
 */
export function heartSlots(state: State): readonly boolean[] {
  const slots: boolean[] = []
  for (let i = 0; i < HEARTS; i++) slots.push(i < state.hearts)
  return slots
}

/**
 * 本帧**新耗尽**的心槽下标（AC-B7）。
 *
 * ⚠️ **为什么它不是 `heartsLostBetween` 的重复**：`heartSlots(state)` 只吃**一个**
 * `State`，返回「哪些还活着」；要判断「哪一位是**新**变 false 的」必须拿到前一帧 ——
 * 而 `State` 里**没有任何事件序列**（无 `lastHeartLostAt`、无 `heartLostPulse`）。
 * 没有这个判据，组件只能自己重建 prev
 * （`{ ...state.value, hearts: state.value.hearts + lost }`），
 * 那恰好是守卫 G50b / 变异 M88 要打的字面形态 ⇒ story 自相矛盾，dev 二选一都违规。
 *
 * 两条恒等式（守卫 G55 / G55a）是本 story 最重要的一组守卫：
 *   `lostSlotIndexes(prev, next).length === heartsLostBetween(prev, next)`
 *   且逐位等于「`heartSlots(prev)` 为 true 且 `heartSlots(next)` 为 false」的位置集合。
 * 它们让**画面判据**与**将来 1.14 的音效判据**在结构上不可能分叉。
 */
export function lostSlotIndexes(prev: State, next: State): readonly number[] {
  const before = heartSlots(prev)
  const after = heartSlots(next)
  const lost: number[] = []
  for (let i = 0; i < before.length; i++) {
    if (before[i] === true && after[i] === false) lost.push(i)
  }
  return lost
}

/**
 * 把 `next` 新掌握的词条**增量**并进跨局进度（AC-B3）。
 *
 * 三条性质，缺一不可（AC-B6c / AC-B6d / AC-B6f）：
 *   - 不改入参，返回新对象；
 *   - 幂等：同一个 `entryId` 答对两次，长度不变；
 *   - 只增不减：`RESTART_LEVEL` 把本局 `masteredEntryIds` 清空后，progress **不回退**
 *     —— 这正是 FR58「累计所得只增不减」的可执行形态。
 *
 * ⚠️ **`currentUnitIndex` 本函数不改**：单元推进属 Story 1.16（AC-H1 明令不许动）。
 * 这里只原样带过，让入参的单元序号在返回后仍然成立。
 *
 * ⚠️ **无增量时必须返回入参本身**（`Object.is(progress, result) === true`），
 * 而不是内容相同的新对象。否则 `progress.value` 的引用变更次数恒等于
 * `applyAction` 的调用次数，守卫 G54 就成了构造上恒真的断言，
 * 且与变异 M83（无脑重建）**不可区分** —— 那条守卫的全部鉴别力都来自这一行。
 */
export function advanceProgress(progress: Progress, next: State): Progress {
  const known = new Set(progress.masteredWordIds)
  const gained: string[] = []
  for (const id of next.masteredEntryIds) {
    if (known.has(id)) continue
    known.add(id)
    gained.push(id)
  }
  if (gained.length === 0) return progress
  return {
    currentUnitIndex: progress.currentUnitIndex,
    masteredWordIds: [...progress.masteredWordIds, ...gained],
  }
}

/**
 * 推进到下一个单元（Story 1.16 / AC-B1–AC-B3）。
 *
 * 三条性质，与 {@link advanceProgress} 同款：
 *   - 不改入参，返回新对象；
 *   - **只动 `currentUnitIndex` 一个键** —— `masteredWordIds` 逐字带过（FR58）；
 *   - **无推进时返回入参本身**（`Object.is(progress, result) === true`），
 *     理由与 `advanceProgress` 的同款注释一字不差：返回内容相同的新对象会让
 *     `progress.value` 的引用变更次数恒等于 `applyAction` 的调用次数，
 *     守卫 G54 就成了构造上恒真的断言。
 *
 * ── 为什么不接 `State` ───────────────────────────────────────────────────
 * 单元推进的**判据**是「这一局打完了」（`next.phase.kind === 'level-complete'`），
 * 那属于 `State`；但它**改的东西**是 `Progress`。两套生命周期不可合并（R-06），
 * 所以判据留在调用方（app 层），本函数只管改 `Progress`。
 *
 * ⚠️ **`hasNextUnit` 是入参而不是本函数的判据** —— `core/` 不得 import `../content/`
 * （`effects.ts` 文件头逐字记着这条禁令及其代价：37 条词条会进每一个 core 测试）。
 * 「目标单元录了没有」由 app 层查完，用一个 boolean 传进来。
 * ⇒ 副作用是**构造上可测**：`advanceUnit(p, true)` 直接喂，不需要真的录第二个单元
 * （Story 1.16 AC-F2 要求的就是这个 —— Epic 1 的 `UNITS.length === 1` 让真机路径走不到这一半）。
 *
 * ⚠️ **基的换算（0 基 ↔ 1 基）**：`currentUnitIndex` 是 **0 基**（裁决 3），
 * `State.unitNumber` 是 **1 基**。本函数推进后 `currentUnitIndex + 1` 恰好等于
 * 「下一个单元的 1 基 `unitNumber`」⇒ 两条路径算出来是同一个数字。
 * ⚠️ 裁决 3 逐字写过「**不用** `progress.currentUnitIndex + 1`」——
 *   那句约束的是**初值取 0**，不是「不许加 1」。别把这句话读成禁令。
 */
export function advanceUnit(progress: Progress, hasNextUnit: boolean): Progress {
  if (!hasNextUnit) return progress
  return {
    currentUnitIndex: progress.currentUnitIndex + 1,
    masteredWordIds: progress.masteredWordIds,
  }
}

/** 进度条的展示口径（AC-B4）。字段全部只读 —— 它是纯派生量。 */
export interface ProgressDisplay {
  readonly unitNumber: number
  /** `progress` 里属于本单元的词条数。 */
  readonly mastered: number
  /** 本单元词条总数。**由调用方传入**（见下）。 */
  readonly total: number
  /** 进度比例，恒 ∈ `[0, 1]`。 */
  readonly ratio: number
}

/**
 * 算出进度条要显示的四项（AC-B4）。
 *
 * ⚠️ **`total` 必须是参数，不能在 `core/` 里查内容表** —— `core/` 不得 import `content/`
 * （文件头有理由）。调用方从 `entriesOf(state.unitNumber).length` 传入。
 *
 * ⚠️ **`mastered` 靠 `id.startsWith('u' + unitNumber + '-')` 判**（偏离 #7 / 裁决 7）：
 * `core/` 内持有 entryId 前缀形态的第二份知识。⚠️ **别去找一条不存在的守卫** ——
 * `eslint.config.js` 的 `src/core/**` 块只禁 `vue`/`app`/`services`，**没有禁 `content`**；
 * 若将来 `content/` 与 `core/` 的 id 形态分叉，`core/` 这侧会静默通过。
 *
 * ⚠️ **`total === 0` 时 `ratio = 0`，不许返回 `NaN`**：`NaN` 落进 CSS 的
 * `width: NaN%` 会被**整条丢弃**，进度条于是退化成浏览器默认宽度 —— 一个不报错、
 * 不留痕、只是「长得不对」的缺陷。`mastered > total`（词表缩小过的存档）同样夹到 1。
 */
export function progressDisplay(
  progress: Progress,
  unitNumber: number,
  unitTotal: number,
): ProgressDisplay {
  const prefix = `u${unitNumber}-`
  let mastered = 0
  for (const id of progress.masteredWordIds) {
    if (id.startsWith(prefix)) mastered += 1
  }
  const ratio =
    unitTotal === 0 ? 0 : Math.min(1, Math.max(0, mastered / unitTotal))
  return { unitNumber, mastered, total: unitTotal, ratio }
}
