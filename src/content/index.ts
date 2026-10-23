/**
 * 内容层的对外出口（Story 1.6 / 架构决策 3）。
 *
 * ── 守什么 ────────────────────────────────────────────────────────────────
 * 「启动时校验，失败即拒绝进入游戏」（架构 `:568-571` 的分层错误策略）。
 * 本模块被 import 的那一刻，**每个单元文件都已经过 Zod 校验**；
 * 校验失败直接 `throw`，没有 catch、没有默认值、没有「先跑起来再说」。
 *
 * ── 为什么这么写 ──────────────────────────────────────────────────────────
 * · **只提供「按单元号取用」**。刻意**不提供**单元选择 / 单元列表推荐 / 下一单元
 *   这类 API：架构 `:765-777` 明令 `views/` 下没有 `UnitSelectView`，
 *   单元推进由存档的 `progress.currentUnitIndex` 驱动（架构决策 5）。
 *   在这一层加一个 `pickNextUnit()` 就是一个绕过那条禁令的后门。
 * · **校验发生在模块顶层**，而不是第一次调用 `getUnit()` 时 ——
 *   「按单元加载」在这个项目里就是一次静态 import（无远程、无运行时拉取），
 *   延迟到调用时校验等于让第一个进游戏的人替所有人踩雷。
 * · **不建 `loader.ts`**（内容模型裁决第 4 条）：架构目录树有它，决策 3 的存储位置块没有。
 *
 * ── 期望值来源与出处 ──────────────────────────────────────────────────────
 * · 架构决策 3「内容数据格式」：`game-architecture.md:275-304`
 * · 分层错误策略（throw vs 降级）：`game-architecture.md:566-571`
 * · 「JSON 模块直接 import（Vite 处理），启动时 Zod 校验」：`game-architecture.md:900`
 */

import { z } from 'zod'

import { UnitSchema, type Unit } from './schema'
import unit01Raw from './units/unit-01.json'
import unit02Raw from './units/unit-02.json'

/**
 * 单元原始数据清单。**新增单元在这里加一行 import** ——
 * 这是有意的：静态 import 让打包器在构建期就把内容打进产物，
 * 而 `import.meta.glob` 之类的动态方案会让「哪些单元存在」在运行期才确定，
 * 启动校验也就失去了意义（`npm run validate:content` 是另一条独立通路，
 * 它扫的是目录，**新增单元无需改脚本** —— AC-12）。
 */
const RAW_UNITS: readonly { file: string; raw: unknown }[] = [
  { file: 'unit-01.json', raw: unit01Raw },
  { file: 'unit-02.json', raw: unit02Raw },
]

/**
 * 启动时校验。
 *
 * ⚠️ 失败即 `throw`，**不做降级**。catch 掉再给一份默认内容看起来更"稳"，
 * 实际是把「教材内容是坏的」变成「孩子玩到的是一份错内容」——
 * 而报错现场离录入错误可能已经隔了几天。
 */
/**
 * 校验**一个**单元文件，失败即抛。
 *
 * ⚠️ 导出来是为了让 AC-28「失败即 throw，禁止 catch 降级」**可测**：
 * 以前这段逻辑内嵌在 `parseUnits()` 的 `map` 回调里，而 `RAW_UNITS` 是模块私有的，
 * 任何测试都喂不进坏数据 —— 也就是说这条架构红线**一条测试都守不住**。
 * （`[CR]` 2026-10-14 变异坐实：把失败分支换成 `console.warn` + 返回空单元，
 *   183 条内容层测试全绿。）
 *
 * 拆出来不改变运行时行为：`parseUnits()` 仍然在模块顶层调用它，
 * 错误仍然在 import 时就炸出来。
 *
 * @param raw 单元原始 JSON（未解析）
 * @param file 文件名，只用于报错信息定位
 */
export function parseUnit(raw: unknown, file: string): Unit {
  const parsed = UnitSchema.safeParse(raw)
  if (parsed.success) return parsed.data
  throw new Error(
    `[content] ${file} 校验失败，拒绝进入游戏 —— ` +
      '内容有问题就必须在这里炸出来，不能带病开局。\n' +
      z.prettifyError(parsed.error),
  )
}

function parseUnits(): readonly Unit[] {
  return RAW_UNITS.map(({ file, raw }) => parseUnit(raw, file))
}

/** 全部单元，已通过启动时校验。 */
export const UNITS: readonly Unit[] = parseUnits()

/**
 * 按单元号取内容。
 *
 * 取不到就抛错而不是返回 `undefined`：调用方（回合层）没有「内容缺失」的处理分支，
 * 而一个静默的 `undefined` 会在 `deck.map(...)` 之类的远处炸成
 * 「Cannot read properties of undefined」，离真正的原因（存档里的单元号不存在）隔了好几层。
 */
export function getUnit(unitNumber: number): Unit {
  const unit = UNITS.find((candidate) => candidate.unitNumber === unitNumber)
  if (unit !== undefined) return unit
  throw new Error(
    `[content] 没有单元 ${unitNumber}，现有：${UNITS.map((u) => u.unitNumber).join(' / ')}。` +
      '若这是新单元，请确认 units/ 下有对应文件且已在 index.ts 的 RAW_UNITS 里登记。',
  )
}

/** 某个单元的全部词条 —— 即 `createInitialState({ unitNumber, deck })` 要吃的 `deck`。 */
export function entriesOf(unitNumber: number): Unit['entries'] {
  return getUnit(unitNumber).entries
}

export type { Unit } from './schema'
export type { Card, DeckEntry, ImageOption, Option, TextOption, TowerType } from './schema'
