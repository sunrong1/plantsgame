/**
 * 单元 4 真实内容的守卫（Story 2.6 / Task 5.4）。
 *
 * ── 这个文件守什么 ──────────────────────────────────────────────────────────
 *   单元 4（教材 1A Unit 4 `I can sing`）是**本批第一个带自写句的单元**
 *   （`Can you dance?`，entryId 前缀 `w-`）⇒
 *   「自写句只当卡面题面、它的答案必须是教材句」这条规则第一次有实例。
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

describe('单元 4（教材 1A Unit 4 `I can sing`）的内容守卫', () => {
  unitContentSuite(4)
})
