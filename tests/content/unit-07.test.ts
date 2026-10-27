/**
 * 单元 7 真实内容的守卫（Story 2.6 / Task 5.4）。
 *
 * ── 这个文件守什么 ──────────────────────────────────────────────────────────
 *   单元 7（教材 1A Unit 7 `Let's count`）是本批**最大**的单元（18 条 ⇒ 局序列 10 + 8），
 *   也是**第二个带自写句的单元**（`How many pencils?`，entryId 前缀 `w-`）。
 *   ⇒ 它的**近邻陷阱**最密：`one` ~ `two` 的编辑距离 = 2（校验器阈值也是 2）
 *   ⇒ `one` 与 `two` **不得出现在同一张卡上**（`docs/option-count.md` §4.1 记着
 *   这条单元的最小上界 = 3 的由来）。
 *
 *   判据本体住在共用 helper（`tests/helpers/unit-content.ts` 与
 *   `tests/helpers/unit-content-suite.ts`）—— **本文件不抄判据**（R-37）。
 *
 * ── 覆盖的守卫 ──────────────────────────────────────────────────────────────
 *   · **G348** 卡型配比 ／ **G349** 逐卡选项数 ／ **G350** 选项指针与正确项
 *   · **G352** 回应卡的正确选项必须语义应答 ／ **G353** 塔型轮转
 *   · **G279** id 前缀与 `entryId === wordId`
 *
 * ⚠️ **录音断言（G289）暂缺** —— Story 2.6 的 T4（外部 TTS 录音）尚未完成。
 */

import { describe } from 'vitest'

import { unitContentSuite } from '../helpers/unit-content-suite'

describe("单元 7（教材 1A Unit 7 `Let's count`）的内容守卫", () => {
  unitContentSuite(7)
})
