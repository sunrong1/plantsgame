/**
 * 合成题单 fixture —— 回合层测试的题单来源（Story 1.5 / AC-16）。
 *
 * ── 守什么 ────────────────────────────────────────────────────────────────
 * 断言 3 / 3b / 4 / 8 全都跑在一个题单上：答错几题会掉几心，取决于**有几只僵尸
 * 入场**以及**它们何时抵达房子**。所以 fixture 的字段（塔型、卡型、选项数）
 * 一旦被改动，失败门槛就会漂移，而断言的期望值不会跟着变 —— 那正是本文件
 * 存在的理由：把题单的形状钉死在一个地方，让漂移发生在 fixture 里（一眼看得见），
 * 而不是散落在每个测试的字面量里。
 *
 * ── 为什么这么写 ──────────────────────────────────────────────────────────
 * 1. **为什么不用 `src/content/` 的真实内容？** 那是 Story 1.6 的交付物，
 *    且断言 3/4 的期望数字由**题单长度**（10 题）与**塔型造价**决定，
 *    与具体是哪些词无关。用真实内容会让回合层测试随内容录入而变红 —— 那是
 *    另一条轴的失败。
 * 2. **为什么 entryId 带 `u1-` 前缀？** AR29：录音目录**不分单元**，
 *    不带前缀会撞名（`word-01` 在单元 1 与单元 2 各有一张图）。
 * 3. **为什么塔型按 index % 3 轮转？** 让 10 题的题单里三种塔型都出现，
 *    `costOf` 的三档造价（50/50/75）都被真实走到 —— 只用一种塔型的 fixture
 *    会让造价分支永远走一半。
 * 4. **为什么正确项恒在 index 0？** `wrongOptionId()` 只需要「第一个非正确项」
 *    就够，恒定位置让「答错」与「答对」的构造对称，测试意图一眼可见。
 *
 * ⚠️ **不要在 balance-sim 里 import 本文件** —— 那是 `src/` 之外的开发期脚本，
 * 不该耦合测试 fixture（架构 `:649` 与 AC-15）。脚本自建一份合成题单。
 */

import type { Card, DeckEntry, OptionId, TowerType } from '../../src/core'

/** 三塔型轮转表（与 `TOWER_TYPES` 同序，内容无关，只是轮转顺序）。 */
const TOWER_TYPE_CYCLE: readonly TowerType[] = ['direct', 'slow', 'aoe']

/** 三卡型轮转表（架构模式 B）。 */
const CARD_KIND_CYCLE: readonly (Card['kind'])[] = ['word', 'keyword', 'response']

/** 每题选项数。三选一与四选一都是 GDD 允许的形状，此处固定四选一便于读断言。 */
const OPTIONS_PER_ENTRY = 4

/**
 * 产出 n 道结构合法的题目。
 *
 * 「结构合法」的确切含义：每张卡**恰有 1 个 `correct: true`**（FR16 的
 * 「唯一正确项」约束）、`entryId` 全局唯一、`towerType` 是合法塔型字面量。
 * 这三条正是 Story 1.6 的 Zod schema 会强制的那些 —— fixture 先守一遍，
 * 测试失败时就能排除「是 fixture 脏了」这个可能。
 */
export function makeSyntheticDeck(n: number, unitNumber = 1): readonly DeckEntry[] {
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`合成题单题数必须是 >= 1 的整数，收到 ${n}`)
  }
  const entries: DeckEntry[] = []
  for (let i = 0; i < n; i += 1) {
    const ordinal = String(i + 1).padStart(2, '0')
    const entryId = `u${unitNumber}-word-${ordinal}`
    entries.push({
      entryId,
      // 塔的显示名来源（FR23）。与 entryId 相同只是 fixture 的省事选择 ——
      // 二者在真实内容里可以不同，本文件不依赖它们相等。
      wordId: `u${unitNumber}-w${ordinal}`,
      towerType: TOWER_TYPE_CYCLE[i % TOWER_TYPE_CYCLE.length],
      card: makeCard(entryId, CARD_KIND_CYCLE[i % CARD_KIND_CYCLE.length]),
    })
  }
  return entries
}

/**
 * 造一张结构合法的卡。
 *
 * 单词卡用图片选项、关键词卡与回应卡用文字选项 —— 照 GDD 的卡型语义
 * （架构模式 B：「卡型差异只在数据」）。`isCorrect()` 对两者一视同仁，
 * 这正是「卡型差异只在数据」可被测试证明的落点。
 */
function makeCard(entryId: string, kind: Card['kind']): Card {
  const options = []
  for (let i = 0; i < OPTIONS_PER_ENTRY; i += 1) {
    const id = `${entryId}-o${i + 1}`
    const correct = i === 0
    options.push(
      kind === 'word'
        ? { id, imageSrc: `/assets/word/${entryId}.svg`, correct }
        : { id, text: `选项 ${i + 1}`, correct },
    )
  }
  return { kind, promptText: entryId, options }
}

/** 该题的**正确**选项 id。找不到正确项即抛错 —— fixture 自己坏了必须响，不能返回 undefined 让测试红在远处。 */
export function correctOptionId(entry: DeckEntry): OptionId {
  const hit = entry.card.options.find((o) => o.correct)
  if (hit === undefined) {
    throw new Error(`题 ${entry.entryId} 没有正确项 —— fixture 违反「唯一正确项」约束`)
  }
  return hit.id
}

/** 该题的**错误**选项 id（第一个非正确项）。全对的题单里也会被用到吗？不会 —— 有意抛错，见上。 */
export function wrongOptionId(entry: DeckEntry): OptionId {
  const hit = entry.card.options.find((o) => !o.correct)
  if (hit === undefined) {
    throw new Error(`题 ${entry.entryId} 没有错误选项 —— fixture 至少需要两个选项`)
  }
  return hit.id
}

/** 按 `entryId` 查题，查不到即抛错（测试里写错 entryId 要立刻指出，而不是静默 undefined）。 */
export function entryById(deck: readonly DeckEntry[], entryId: string): DeckEntry {
  const hit = deck.find((e) => e.entryId === entryId)
  if (hit === undefined) {
    throw new Error(`题单里没有 ${entryId}，现有：${deck.map((e) => e.entryId).join('、')}`)
  }
  return hit
}
