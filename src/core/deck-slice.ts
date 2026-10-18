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
 *   再叠加**相邻不同型**的后置条件（Story 1.20 / 裁决 1，取前那条的原序不变）：
 *     且相邻两题的 `towerType` 不相同。**已合规的原序保持不动**；
 *     数学上无解时（`maxCount > ceil(n/2)`，如全部同型）降级，**不抛错**。
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
 * 把题单重排成「相邻两题的塔型不同」（Story 1.20 / 裁决 1）。
 *
 * ── 为什么是「相邻不同型」而不是「一局不重复」────────────────────────────
 * 用户的原话是「答对单词后出现新的植物，之前出现过的就不用重复」。
 * 按字面理解，**物理无解**：`TowerType` 只有 3 个取值（`direct` / `slow` / `aoe`），
 * 而 {@link QUESTIONS_PER_LEVEL} = 10 ⇒ 鸽笼原理，10 题里**至少 7 次**是「塔型已经出现过」，
 * **任何塔型配比都救不了**。⇒ 窄化口径是「**相邻**两题的塔型不同」——
 * 这是一条**排序**约束而非**配额**约束。
 * ⚠️ **代价逐字记住**：一局 10 题、3 种塔型 ⇒ 首次出现 3 次、其余 **7 次都是重复**。
 *   （**3 是塔型的种数，不是重复的次数** —— 这两个数只差一个字，含义差一倍。）
 *   本函数兑现的是「看起来在换植物」，**不是**「每题都是新植物」，
 *   注释与对外说明一律不得写成后者。
 * ⚠️ 上面那 3 个取值来自 `TowerType` 这个**类型域**，不是 `towers/` 下的文件数 ——
 *   增删资产不改变取值集合，反过来靠数文件论证也会在加第 4 型时当场失效。
 *
 * ── 算法（先短路，再分桶轮流取最大桶）──────────────────────────────────
 * 1. **已合规 ⇒ 直接返回副本**（短路，不进入下面的重建）。这是 A2 的**构造性**保证。
 * 2. 否则按塔型**分桶**，桶内保持原序；然后反复「取剩余最多、且与刚放的那题不同型的桶」，
 *    桶的遍历顺序 = 该塔型在输入里**首次出现**的次序（输入决定 ⇒ 确定性）。
 * 3. 剩下的桶全与刚放的那题同型时 ⇒ 数学上无解，降级为「取剩余最多的那一桶」，**不抛错**。
 *
 * ⚠️ **排序约束不是恒可解的**（`[CR]` 2026-10-19 按实测更正了这里的旧措辞）：
 *   长度 n 的序列可解 **当且仅当** `maxCount ≤ ceil(n / 2)`。
 *   反例：`n = 4` 时 3 条同型即无解；`QUESTIONS_PER_LEVEL = 10` 时 6 条同型即无解。
 *   第 3 步就是为这些输入准备的。
 *
 * ── 三条承重性质（各有守卫，见 `tests/core/deck-slice.test.ts` G173）──────
 * 1. **已合规输入 ⇒ 恒等变换**：第 1 步的短路保证**一次交换都不会发生**。
 *    ⚠️ 这不是「恰好」，是**构造上**的。单元 1 今天已合规，
 *    而 `store-deck-slice.test.ts` 那条「四局连起来 == JSON 原序」全靠它。
 * 2. **有解 ⇒ 输出零相邻同型；无解 ⇒ 降级且绝不抛错**。
 *    ⚠️ 穷举实测（长度 10 的全部 59049 条三型序列）：可解的 59047 条**全部**零相邻同型，
 *    无解的 2 条走降级。判据是 `sameTypeAdjacencies()`，不是源码扫描。
 * 3. **纯函数**：确定性（同样输入永远同样输出）、零随机、零时间、零 DOM。
 *    ⚠️ 不许用洗牌 —— 洗牌会让同一次存档恢复在不同机器上得到不同题单。
 *
 * ⚠️ **不改动传入的数组**：先复制一次，让「不改传入参数」这条 R-01 性质
 *   不依赖调用方传进来的是不是副本（守卫 G173 ⑦⑧ 钉的就是这一条）。
 *
 * @param entries 本局题单（已切片，长度 ≤ {@link QUESTIONS_PER_LEVEL}）。
 * @returns 新的数组；元素与传入的**逐条相同**（只换位置，不增不减不改内容）。
 */
function reorderAdjacentTowerTypes(entries: readonly DeckEntry[]): DeckEntry[] {
  const out = [...entries]

  // ── 第 1 步：已合规就短路（A2 的构造性保证）─────────────────────────
  let compliant = true
  for (let i = 1; i < out.length; i += 1) {
    if (out[i].towerType === out[i - 1].towerType) {
      compliant = false
      break
    }
  }
  if (compliant) return out

  // ── 第 2 步：按塔型分桶，桶内保持原序 ───────────────────────────────
  // 桶的顺序 = 该塔型**首次出现**的次序。「取哪个」只由输入决定 ⇒ 确定性。
  const buckets: DeckEntry[][] = []
  const bucketIndex = new Map<DeckEntry['towerType'], number>()
  for (const entry of out) {
    const at = bucketIndex.get(entry.towerType)
    if (at === undefined) {
      bucketIndex.set(entry.towerType, buckets.length)
      buckets.push([entry])
    } else {
      buckets[at].push(entry)
    }
  }

  // ── 第 3 步：轮流取「剩余最多且与刚放的异型」的桶 ────────────────────
  // 「剩余最多」是可达性的保证（`maxCount ≤ ceil(n/2)` 时它总能排出零相邻同型）；
  // 「桶按首次出现次序遍历、数量相同取靠前者」是**确定性**的保证。
  const result: DeckEntry[] = []
  let previous: DeckEntry['towerType'] | null = null
  while (result.length < out.length) {
    let pick = -1
    for (let k = 0; k < buckets.length; k += 1) {
      if (buckets[k].length === 0) continue
      if (previous !== null && buckets[k][0].towerType === previous) continue
      if (pick === -1 || buckets[k].length > buckets[pick].length) pick = k
    }
    if (pick === -1) {
      // ⚠️ 降级路径：剩下的桶全与刚放的那题同型 ⇒ `maxCount > ceil(n/2)`，
      //   「相邻不同型」在数学上无解。取剩余最多的那一桶继续，**绝不抛错**。
      for (let k = 0; k < buckets.length; k += 1) {
        if (buckets[k].length === 0) continue
        if (pick === -1 || buckets[k].length > buckets[pick].length) pick = k
      }
      // ⚠️ 走到这里 `pick` 必不为 -1：`result.length < out.length` 保证还有条目。
    }
    const entry = buckets[pick][0]
    buckets[pick] = buckets[pick].slice(1)
    result.push(entry)
    previous = entry.towerType
  }
  return result
}

/**
 * 切出本局的题单（AC-B1 / 裁决 2）。
 *
 * @param entries 该单元的**全量词表**，按单元 JSON 里的原序。
 * @param masteredWordIds 跨局已掌握的 `entryId`（来自 `Progress.masteredWordIds`）。
 * @returns 本局题单，最多 {@link QUESTIONS_PER_LEVEL} 条；全部掌握时返回**空数组**。
 *
 * ⚠️ **已合规输入返回原序**（Story 1.20 / A2）：这是**硬 AC**，
 *   `tests/app/store-deck-slice.test.ts` 那条「四局连起来 == 整个词表」全靠它。
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
  // ⚠️ **先 slice、再重排，两步分开写**（Story 1.20 / B1）：守卫 G160 的判据是
  //   `/pending\.slice\(\s*0,\s*QUESTIONS_PER_LEVEL\s*\)/` 这一行的逐字形态，
  //   揉成一棵树会把它改掉。
  return reorderAdjacentTowerTypes(pending.slice(0, QUESTIONS_PER_LEVEL))
}
