/**
 * 「逐卡选项数 === 规则算出的目标值」这条判据的**唯一**出处。
 *
 * ── 为什么抽出来（Story 2.5 / Task 6.1）────────────────────────────────────
 *   它原先是 `tests/content/unit-01.test.ts` 里的**模块私有函数** ——
 *   2.5 要给单元 2 写同款守卫，于是就出现两个选择：
 *     ① 复制一份到单元 2 的测试文件里 ⇒ **复制链**（R-37）——
 *        两份判据会漂移，改了规则只改一份 ⇒ 单元 2 那份恒绿。
 *     ② 抽到这里共用 ⇒ 一处改，两处生效。
 *   ⇒ 选 ②。
 *
 * ── 判据本体必须是**函数**，而不是某条 `it` 的循环体 ──────────────────────
 *   反向自测要能「把违规形态真写进去，断言这条守卫会红」——
 *   若判据只存在于循环体里，反向自测**够不着它**（只能另写一份手写比较，
 *   于是判据被改坏时反向自测照样绿 —— 本仓已知的假绿形态之一）。
 *   ⇒ 判据本体是一个函数，正向用例与反向自测**都调它**。
 */

import { expect } from 'vitest'

import { targetOptionCount } from '../../src/content/option-count'
import type { CardKind } from '../../src/content/schema'

/**
 * 逐卡核对「选项数 === 规则算出的目标值」，零容差。
 *
 * ⚠️ `unitNumber` **必须传对** —— `targetOptionCount` 是按单元取档位的。
 */
export function assertOptionCountsMatchRule(
  cards: readonly { entryId: string; card: { kind: CardKind; options: readonly unknown[] } }[],
  unitNumber = 1,
): void {
  for (const entry of cards) {
    const want = targetOptionCount(unitNumber, entry.card.kind)
    expect(
      entry.card.options.length,
      `${entry.entryId}（${entry.card.kind} 卡）有 ${entry.card.options.length} 个选项，` +
        `而规则说单元 ${unitNumber} 的 ${entry.card.kind} 卡应当是 ${want} 个 —— ` +
        '两者必须一致：改内容要同步改 src/content/option-count.ts 的档位表（或反之），' +
        '否则「档内同值」只是一句没有人核对过的承诺',
    ).toBe(want)
  }
}
