/**
 * 一局的题单切片（Story 1.19 / AC-B1，裁决 1、2）。
 *
 * ── 为什么有「一局 = 10 题」这回事 ──────────────────────────────────────────
 * `epics.md` 的 Story 1.19 AC 逐字要求「**单局落在 3-5 分钟，每题周期约 20-30 秒**」，
 * 并逐字注明「这不是「大致如此」，而是**实测值**」。而实现原本把**整个单元 37 条**
 * 当一局的题单 —— 按 AC 自己的 20-30 秒/题算，那是 12.3-18.5 分钟，是上限的 2.5-3.7 倍。
 * ⇒ 「一局 = 10 题」是**设计口径**，原实现偏离了它。本模块把口径补上（裁决 1）。
 *
 * ── 边界 ────────────────────────────────────────────────────────────────
 * · **纯函数**：零 DOM、零 Vue、零随机、零时间（与 `core/` 其余模块同款纪律）。
 * · **不 import `content/`**（R-10）：它只吃 `DeckEntry[]`，而 `DeckEntry` 本身
 *   就声明在 `./types.js` —— 这条边界天然成立，**不需要**先问内容层要词表。
 * · **不碰 `State`**（AC-B1）：本模块只回答「本局该考哪几条」，
 *   「把这些条目组装成 state」是 `reducer.ts` 的事。
 * · **本模块是切片判据的唯一定义处**（R-02 / AC-F5 第二条）：`app/` 与组件层
 *   调它，不允许出现第二份实现。
 *
 * ── 切片口径（裁决 2 逐字，不重新设计）──────────────────────────────────
 *     deck = 该单元词表中「尚未掌握」的条目，按单元 JSON 里的原序，取前 10 条
 * · 「尚未掌握」**只按跨局的 `masteredWordIds` 判**，不排除被跳过的题
 *   —— `skippedEntryIds` 活在 `State`（当前对局）里，而局末 `currentGame` 会被存成
 *   `null` ⇒ 跨局根本没有地方表示「这条被跳过过」（R-06：进度与对局是两套独立持久化）。
 *   被跳过的题在后续某一局重新出现，是当前数据结构下**唯一可表达**的行为。
 * · 不足 {@link QUESTIONS_PER_LEVEL} 条时就是剩余条数（37 = 10 + 10 + 10 + **7**）
 *   —— 第四局是 7 题，**这不是 bug**。
 */

import type { DeckEntry } from './types.js'

/**
 * 一局考多少题（Story 1.19 / 裁决 1）。
 *
 * ⚠️ **全仓唯一出处**（AC-F5 第一条）：`src/` 里不许出现字面量 `10` 当题单大小。
 *   守卫 G160 逐字扫 `src/`。
 *
 * ⚠️ **这个 10 是产品决策，不是实现细节** —— 它由 AC 的「单局 3-5 分钟 /
 *   每题 20-30 秒」反推得出（10 × 20-30s = 3.3-5 分钟，与 AC 逐字吻合）。
 *   改它走 `docs/rules/range-and-balance.md`（R-20：关卡阈值改动前必须问人）。
 *
 * ⚠️ **它不是关卡数值**，因此**不**放在 `balance.ts`：那个文件逐字是
 *   「战斗数值档位」，而本常量与伤害 / 阳光 / 心数无关，是**题单的编排**。
 */
export const QUESTIONS_PER_LEVEL = 10

/**
 * 切出本局的题单（AC-B1 / 裁决 2）。
 *
 * @param entries 该单元的**全量词表**，按单元 JSON 里的原序。
 * @param masteredWordIds 跨局已掌握的 `entryId`（来自 `Progress.masteredWordIds`）。
 * @returns 本局题单，最多 {@link QUESTIONS_PER_LEVEL} 条；全部掌握时返回**空数组**。
 *
 * ⚠️ **返回空数组而不是抛错**：空题单意味着「这个单元学完了」，
 *   那是**如实状态**不是故障。抛不抛、以及孩子看到什么，由 `app/store.ts`
 *   那层决定（本函数只回答「有几条」）。
 *
 * ⚠️ **不改动传入的两个参数**：词表会被存进 `State.deck` 并随存档序列化，
 *   在这里就地 `splice` 会悄悄改掉内容层那一份。
 *
 * ⚠️ **`masteredWordIds` 里含词表之外的 id 不报错**：存档可能来自别的内容版本
 *   （内容回滚），而那属于存档层与内容校验的责任，不是切片判据的责任。
 *   这里按「不属于本单元的 id 什么也不排除」处理即可 —— 它本来就不在词表里。
 */
export function sliceDeckForLevel(
  entries: readonly DeckEntry[],
  masteredWordIds: readonly string[],
): DeckEntry[] {
  const mastered = new Set(masteredWordIds)
  const pending = entries.filter((entry) => !mastered.has(entry.entryId))
  // ⚠️ `slice` 而不是循环里数到 N 就 break：后者在「待考条目不足 N 条」时
  //   需要一个额外的终止条件，而写错它的形态是「多切一条」——
  //   第四局 7 条切成 8 条，界面上没有任何东西会报错。
  return pending.slice(0, QUESTIONS_PER_LEVEL)
}
