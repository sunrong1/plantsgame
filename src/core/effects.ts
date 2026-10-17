/**
 * 副作用判据（Story 1.14 / AC-B、AC-C）。
 *
 * ── 守什么 ─────────────────────────────────────────────────────────────────
 * `epics.md:1181` 要求 `runEffects(action, prev, next)` 返回「待执行的副作用列表」。
 * 本文件是那个列表的**唯一**产生处，且是**纯函数**：零 DOM、零 Vue、零随机、零时间。
 * 与 `core/hud.ts` 同一纪律 —— 判据住在 `core/`，组件与 `app/` 只执行不计算。
 *
 * ── 为什么必须收三个参数而不是一个 `action`（裁决 4）──────────────────────
 * 七个 cue 里只有三个能从 `action.type` 直接看出：`tower-placed`（`PLACE_TOWER`）、
 * `level-complete`、`level-failed`。**答对 / 答错 / 僵尸死亡 / 掉心全部要 diff
 * `(prev, next)`** —— 只传 `action` 的实现在 `ANSWER` 上无法区分对错，
 * 而「答题反馈」是支柱 1 的核心。
 *
 * ── 为什么答题判据读 `prev.phase.question`（AC-C2）─────────────────────────
 * `ANSWER` 之后相位已推进到 `awaiting-build`，那里**根本没有 `question`**
 * （`types.ts:308-309`：只有 `awaiting-answer` 变体带 `question`）。
 * 读 `next.phase` 是 TS2339，最顺手的「解法」是加个 `as` —— 那会让判据恒假，
 * 一条音效都不播而全部测试照绿（本 story 事故卡 #1）。
 *
 * ── 为什么掉心判据复用 `lostSlotIndexes`（AC-C6）──────────────────────────
 * `core/hud.ts` 的两条恒等式（守卫 G55 / G55a）把**画面**判据钉死；
 * 音效若另算一份（如 `prev.hearts - next.hearts > 0`），画面与声音会各判一次，
 * 两份判据迟早分叉 —— 那正是 `archive/1-13-…md:73-75` 逐字警告的。
 * 复用它 ⇒ 变异 `hud.ts` 时音效判据**跟着一起坏**，守卫会红。
 *
 * ── 零依赖（AC-B2）────────────────────────────────────────────────────────
 * 允许 import 的只有 `./types.js` / `./hud.js` / `./actions.js` / `./balance.js`。
 * ⚠️ **不得 import `../content/`** —— 那是静态 import JSON，会让 37 条词条
 * 进每一个 core 测试（`core/hud.ts` 文件头已记录这条坑）。
 * ⚠️ 本层**不知道**音频文件在不在磁盘上（零 DOM）—— 它照样返回 cue，
 * 加载失败由 `app/effects-runner.ts` 静默跳过（AC-C7）。
 */

import { actionName } from './actions.js'
import { lostSlotIndexes } from './hud.js'
import type { Action, State } from './types.js'

// ── 类型（AC-B3）────────────────────────────────────────────────────────────

/**
 * 七个音效 cue —— 与 `public/assets/audio/sfx/SOURCES.json` 的 7 条**一一对应**。
 *
 * ⚠️ 每个 cue 必须**至少有一条**会产出它的路径（守卫 G64）——
 * 「写了这个分支但构造上永远不产出」正是本仓库反复抓的假绿形态（AC-B6）。
 */
export type SfxCue =
  | 'answer-correct'
  | 'answer-wrong'
  | 'tower-placed'
  | 'zombie-died'
  | 'heart-lost'
  | 'level-complete'
  | 'level-failed'

/**
 * 副作用的可辨识联合 —— **四个 `kind` 一次建全**（1.14 裁决 3）。
 *
 * ⚠️ `SAVE` 变体在 **1.15** 里由 `{ readonly kind: 'SAVE' }` 扩为携带 `currentGame`
 *   （1.15 裁决 4）。扩的理由：把「局末 `currentGame` 置 `null`」这条**判据**留在纯函数里 ——
 *   不扩的话它就得落到 `app/effects-runner.ts`，而那正是 1.14 逐字划给
 *   `runEffects` 的地盘（「判据全在 `core/effects.ts` 的 `runEffects` 里」）。
 *   `State` 是本文件同层的纯数据类型，**不违 R-01**（那条禁的是浏览器 API 与 Vue 符号）。
 *
 * | 变体 | 归属 |
 * |---|---|
 * | `SFX` | **1.14** ✅ |
 * | `ANIMATION` | 1.13 裁决 2：画面走 class + CSS，不进 effects-runner |
 * | `TTS` | 🚨 **无归属 story** —— 见下 |
 * | `SAVE` | **1.15** ✅（1.16 加了第 6 个写盘点） |
 * | `TRACE` | **1.17** ✅（回合日志，见下） |
 *
 * ⚠️ **📎 1.16 `[CS]` 裁决 6 更正了 `TTS` 那一行的归属（原写「收口前提在 1.16」）：**
 *   `epics.md` 的 Story 1.16 AC **零 TTS 字样**，按 R-32（以 AC 正文为准）1.16 无权做这件事；
 *   而 `epics.md` 里**没有任何 story 承担它** —— 1.2 / 1.3 交付的是录音生成与降级，
 *   不是「把 TTS 收口进 `runEffects`」。
 *   ⇒ 归 **无归属**，需 `/gds-correct-course` 指派。
 *   ⇒ 本 story **不接** `TTS`；`app/effects-runner.ts` 的 `case 'TTS'` 仍逐字是空 `return`。
 *   ⇒ 1.15 记着的那条 defer（「写盘抛错后仍执行后续条目构造上不可达」）的恢复条件
 *     逐字是「1.16 **若**给 `Effect` 加上会抛的新成员（`TTS` 的朗读调用）」——
 *     既然不接 TTS，那条恢复条件**今天不会成立**，它继续挂着。
 *
 * ⚠️ **📎 1.17 加了第五个成员 `TRACE`**（裁决 1），它回答了「为什么这行日志的
 *   **前缀是 `[core]` 而打印者不在 `core/` 里」：
 *   前缀是**语义标签**（这行日志描述的是核心层的状态迁移），
 *   而 R-14 的守卫逐字要求 core 整层零 console —— 两条都是硬的。
 *   ⇒ 本层**只产出那行文本**（纯函数），`app/effects-runner.ts` 打印它。
 *   ⇒ 顺带的好处：`assertNeverEffect` 与 runner 的 `switch` 都会因漏分支而**当场红**。
 *
 * ⚠️ **门控条件不是「日志级别」而是「这条日志对生产环境的用户有没有价值」**（裁决 2）：
 *   `game-architecture.md` 的 Logging 表把「回合转换」归在 **INFO**（INFO 无门控要求），
 *   而 `epics.md` 的 AC 逐字要求它「经 `import.meta.env.DEV` 门控，生产构建中不输出」。
 *   ⇒ 裁决：INFO 级 + DEV 门控。理由是回合流水对家长零价值、对生产包是纯噪音
 *     （每 20 秒一行，永远挂在 console 里）。
 *   ⚠️ **下一个人若按 Logging 表把门控删掉，这段注释就是唯一的线索** ——
 *     R-41 要求边界约束要么有守卫要么明确记，守卫 **G105** 专测这条分支在不在。
 */
export type Effect =
  | { readonly kind: 'SFX'; readonly cue: SfxCue }
  | { readonly kind: 'ANIMATION'; readonly name: string }
  | { readonly kind: 'TTS'; readonly text: string; readonly entryId: string }
  | { readonly kind: 'SAVE'; readonly currentGame: State | null }
  | { readonly kind: 'TRACE'; readonly line: string }

/**
 * 联合新增成员而本文件没跟上时的编译期兜底。
 *
 * 返回 `never`（而非抛错）让调用方的返回类型仍是 `readonly Effect[]`，
 * 同时把「漏分支」变成编译期错误 —— 漏分支时 `effect` 收窄为 `never`，
 * 下面的模板字符串类型检查失败。与 `actions.ts:113-118` 的 `assertNeverAction` 同款。
 *
 * ⚠️ **为什么用 `switch` 而不是查表**：`switch` 在联合新增成员时编译期报错，
 * 查表不会。少一个分支的后果是某类副作用静默消失（`actions.ts:84-85` 逐字）。
 */
export function assertNeverEffect(effect: never): never {
  throw new Error(
    `未处理的 Effect kind：${JSON.stringify((effect as { kind?: unknown }).kind)}。` +
      '联合新增了成员而 runEffects 的 switch 没跟上 —— 那类副作用会静默不执行。',
  )
}

// ── 判据（AC-C1 映射表逐字）─────────────────────────────────────────────────

/**
 * 产出这一次 dispatch 要执行的副作用。
 *
 * ⚠️ **顺序即播放顺序**（AC-C5）：`app/effects-runner.ts` 按本数组的顺序逐条执行。
 * 三 cue 并发时的固定顺序是 `zombie-died → heart-lost → level-complete/failed`
 * —— **因果顺序**（先打死的、再抵达掉心的、最后才是胜负判定），不是字典序。
 * 守卫 **G62** 钉住这个顺序。
 *
 * ⚠️ **绝大多数 action 返回 `[]`**（`PLACE_TOWER` 不掉心时就不该有任何音效）——
 *   那是**正确的**。本函数被禁的是「分支存在但构造上恒不成立」（AC-B6），
 *   不是「不许返回空数组」。
 *
 * @param action 本次 dispatch 的 action（`reduce` **已成功执行**）
 * @param prev dispatch 前的 state 快照
 * @param next dispatch 后的 state 快照
 * @returns 全新数组（AC-B5：每次调用新数组，不返回模块级单例）
 */
export function runEffects(action: Action, prev: State, next: State): readonly Effect[] {
  const effects: Effect[] = []

  // ⓿ 📎 **Story 1.17：回合日志，排在最前面**（AC-C1..C3，裁决 1）。
  //
  // ⚠️ **排在最前面**不是随意选的：日志的用途是「复现不对劲的那一瞬」，
  //   而音效/存档那些是「结果」。先记下当时发生了什么，再记它引起了什么。
  //
  // ⚠️ **逐 action 一条，不是逐回合一条**（AC-C3 的裁决）：一整回合有 4~6 次 dispatch
  //   （`ANSWER` → `END_BUILD` → `RESOLVE_ROUND` → `CONTINUE` …），
  //   若只在收尾那一次产出，`answer` 那条就丢了 —— 而**正是它最能说明
  //   「孩子选错了哪张卡」**。`turn` 字段把它们归到同一回合号。
  //   守卫 **G104** 专测「条数 = dispatch 次数」。
  //
  // ⚠️📎 **AC-C3 逐字要求「写清楚 R-58 不适用」—— 这一段就是那份记录**
  //   （`[CR]` 2026-10-17 补；此前零处提及，AC 的这条要求一直是**没落地**的）。
  //   AC 原文：「⚠️ 「数 dispatch 次数」的断言若走 Vue `watch` 必须 `flush: 'sync'`
  //   （R-58）—— 但本 story 的日志在 `applyAction` 里，**不走 watch**，天然同步 ⇒ 不适用 R-58。」
  //   展开成「为什么天然同步」：
  //     · 本行在 `runEffects(action, prev, next)` 体内 —— 它是**一次 dispatch 的
  //       同步尾巴**，调用点在 `app/effects-runner.ts`，`applyAction` 里同步调它。
  //     · `tests/core/trace-log.test.ts` 的 G104 直接调 `runEffects` 数条数，
  //       **整条链上没有一个 `watch`**。
  //   ⇒ R-58 要防的形态（「`watch` 默认 `flush: 'pre'` 把同一 tick 里的多次赋值
  //     合并成一次，于是数出来的 dispatch 次数偏少」）在这里**构造上不可达**。
  //   ⚠️ **若哪天这一行挪进 `watch` 或任何微任务里，R-58 立刻适用** ——
  //     而 R-58 自身的「守卫」字段逐字标注为「⚠️ 无守卫」，全靠注释兜底的正是这条规则。
  effects.push(trace(turnLogLine(action, next)))

  // ① 答题反馈 —— 读 `prev.phase.question`（答题**前**的那道题），见 AC-C2。
  if (action.type === 'ANSWER') {
    effects.push(answerEffect(prev, next))
  }

  // ② 建塔 —— 恒真（AC-C3 陷阱 3）。
  //
  // ⚠️ **不要**为了「保险」加 `if (prev.phase.kind !== 'awaiting-build') return []`：
  //   reducer 在非 `awaiting-build` 阶段会 **throw**（NFR12），而 `runEffects`
  //   只在 `reduce` **成功之后**被调用 ⇒ 那条路径根本到不了这里。
  //   加了它反而会让「非法 action」这条路径**看起来**被优雅处理。
  if (action.type === 'PLACE_TOWER') {
    effects.push(sfx('tower-placed'))
  }

  // ③ 三条与 action 无关的判据 —— 顺序由「因果」定，不是由 case 顺序定。
  if (next.zombies.length < prev.zombies.length) {
    effects.push(sfx('zombie-died'))
  }
  // ⚠️ 掉心判据**必须**调 `lostSlotIndexes`（AC-C6），不许另算
  //   （如 `prev.hearts - next.hearts > 0` 这类「看起来等价」的写法）。
  if (lostSlotIndexes(prev, next).length > 0) {
    effects.push(sfx('heart-lost'))
  }
  if (next.phase.kind === 'level-complete') {
    effects.push(sfx('level-complete'))
  } else if (next.phase.kind === 'level-failed') {
    effects.push(sfx('level-failed'))
  }

  // ④ 存档 —— 1.15 接入。**排在胜负音效之后**：先判胜负再落盘（因果顺序）。
  //
  // ⚠️ **判据是 `next.phase.kind`，不是 `action.type`** —— 两条路径不等价：
  //   `CONTINUE` 会把 `round-over` 推成 `awaiting-answer`（或 `level-complete`），
  //   按 `action.type === 'RESOLVE_ROUND'` 判会漏掉「推进到下一题」那一步的落盘。
  //
  // ⚠️ **写盘点的 5 行表（1.15 裁决 6 / AC-C2）逐字如下，不要自己再推一遍**：
  //   `awaiting-answer` ❌ —— 刚 CONTINUE 出来，与上一份 round-over 存档内容相同；
  //   `awaiting-build`   ✅ —— AC 逐字要求「包括当前处于 awaiting-build 的局面」，
  //                         只守 round-over 会让那句 AC 构造上不可达（AC-B6 同型假绿）；
  //   `resolving`        ❌ —— 真实一帧，用户看不到也退不出；
  //   `round-over`       ✅ —— 「每个回合结束」的主路径；
  //   `level-failed`     ✅ —— 同样是结算出口，不写的话失败后退出重进会退回上一回合；
  //   `level-complete`   ✅ —— 存 `null`（局末清空战场）。
  if (next.phase.kind === 'level-complete') {
    // ⚠️ **存 `null` 而不是那个已被清空的 state**：重进要回到该单元起点，
    //   而不是 1.16 还没做的「通关画面」终态。
    effects.push(save(null))
  } else if (next.phase.kind === 'level-failed' || next.phase.kind === 'round-over' || next.phase.kind === 'awaiting-build') {
    effects.push(save(next))
  }

  // 🚨 **1.16 追加 —— 上表第 6 行，是这张表的「例外行」，不是它的反例。**
  //
  //   判据按 **`action.type`** 而不是相位：`RESTART_LEVEL` 之后 `next.phase.kind`
  //   是 `awaiting-answer`，而上面那张表对 `awaiting-answer` 逐字判 ❌。
  //
  //   ⚠️⚠️ **为什么那一行的理由在这里不成立**（这是本行存在的全部理由）：
  //     `awaiting-answer` 被判 ❌ 的理由逐字是「**刚 CONTINUE 出来**，
  //     与上一份 round-over 存档内容相同」。
  //     **重打不是 CONTINUE** —— 盘上那一刻存着的是刚 `level-failed` 的那份 state
  //     （含 hearts = 0 与那份战场），而 `RESTART_LEVEL` 之后 `next` 是一局全新的
  //     （心数满、`turn` 回到 1、`masteredEntryIds` 清空）。
  //     ⇒ 两份内容**完全不同**，不写盘等于让**失败态的战场跨局活到下一局**，
  //       FR51「战场状态在局末清空，不跨局保留」当场被破。
  //
  // ⚠️ **别把这行「统一」进相位表、也别把它删掉**：两种改法都会让重打重新静默失效，
  //   而症状是「孩子重打后关页面，重进又回到失败画面」—— 界面上没有任何东西指向原因。
  //   守卫 **G89** 专测这一行（走真的 `applyAction` 链路，不是纯函数返回值）。
  //
  // ⚠️ **它排在 `SAVE` 判据之后**：与上面的胜负音效一样是「先判局面、再落盘」。
  //   注意它让 SAVE 仍然**恒排在该数组的末尾**（1.15 偏离 1 记着这件事）。
  if (action.type === 'RESTART_LEVEL') {
    effects.push(save(next))
  }

  return effects
}

/** 造一条 `SAVE` Effect。唯一入口 ⇒ 该变体的字段形态在全文件只有一处定义。 */
function save(currentGame: State | null): Effect {
  return { kind: 'SAVE', currentGame }
}

/** 造一条 `TRACE` Effect。唯一入口 ⇒ `line` 的形态在全文件只有一处定义。 */
function trace(line: string): Effect {
  return { kind: 'TRACE', line }
}

/**
 * 回合日志的那一行（Story 1.17 / AC-C1）。
 *
 * ⚠️ **字段之间是两个空格**（`epics.md` 的 AC 逐字如此）—— 守卫 **G102** 整行比对，
 *   少一个空格就红。这不是排版洁癖：家长复制这一行去搜索时，一个多余的空格会改变结果。
 *
 * ⚠️ **读 `next` 不读 `prev`**（AC-C3 的裁决）：日志的用途是「复现出不对劲的那一瞬」，
 *   而**那一瞬是 dispatch 之后的状态**。读 `prev` 会让「掉了一颗心」那一条
 *   记成掉之前的数，家长照着查会得出错误结论。变异 **M130** 专打这一条。
 *
 * ⚠️ **`actionName(action)` 而不是自己写映射表**（AC-C2）：`actionName` 对联合外
 *   的类型**抛错**而不是返回 `'unknown'` —— `actions.ts` 的注释逐字说这是刻意的
 *   （「对局日志里出现一条无法归因的记录」是最该看见的一行）。
 *   自己写映射表的话，联合新增成员时那张表会**静默漏一个分支**，而日志会照打不误。
 *
 * @param action 本次 dispatch 的 action（`reduce` 已成功执行）
 * @param next dispatch **之后**的 state
 */
function turnLogLine(action: Action, next: State): string {
  return (
    `[core] turn ${next.turn}` +
    `  action=${actionName(action)}` +
    `  sun=${next.sun}` +
    `  hearts=${next.hearts}` +
    `  zombies=${next.zombies.length}`
  )
}

/**
 * 答题的 Effect —— 答对 `answer-correct`，否则 `answer-wrong`（AC-C1）。
 *
 * ⚠️ **`prev.phase.question`** —— 答题前的那道题。读 `next.phase` 是 TS2339
 *   （`ANSWER` 之后相位已推进，那里没有 `question`），而加 `as` 会让它恒假。
 *
 * ⚠️ 判据是「**多出恰好一个元素且该元素 === prev.phase.question.entryId**」，
 *   不是「includes(entryId)」—— 后者在**重考**时（同一 entryId 已在 mastered 里）
 *   会把答错误判成答对。`masteredEntryIds` 只增不减，答错时原样不动。
 */
function answerEffect(prev: State, next: State): Effect {
  // 收窄到 `awaiting-answer` 才能取到 `question` —— 见 `reducer.ts:180-182` 同款写法。
  if (prev.phase.kind !== 'awaiting-answer') {
    // 构造上不可达：`ANSWER` 只在 `awaiting-answer` 相位被 reducer 接受。
    // 写成 sfx('answer-wrong') 而不是抛错，保持「绝不向调用方抛」。
    return sfx('answer-wrong')
  }
  const expected = prev.phase.question.entryId
  const grewByExactlyOne = next.masteredEntryIds.length === prev.masteredEntryIds.length + 1
  const gained = next.masteredEntryIds.includes(expected) && !prev.masteredEntryIds.includes(expected)
  return sfx(grewByExactlyOne && gained ? 'answer-correct' : 'answer-wrong')
}

/** 造一条 `SFX` Effect。唯一入口 ⇒ 每个 cue 的字段形态在全文件只有一处定义。 */
function sfx(cue: SfxCue): Effect {
  return { kind: 'SFX', cue }
}

/**
 * 按 `kind` 分派一条 Effect 到执行动作（app 层用）。
 *
 * ⚠️ **本 story 只实现 `SFX`**；另三个变体在此**显式落到一个不执行任何事的分支**，
 * 而不是悄悄不写 case —— 后者会让联合新增成员时编译期不报错（AC-B3）。
 * ⚠️ 用 `assertNeverEffect` 兜底而不是 `default` + 忽略：新增变体而本 switch
 *   没跟上时**编译期报错**，那正是 1.15 / 1.16 接入 `SAVE` / `TTS` 时的提醒。
 */
export function effectKindName(effect: Effect): Effect['kind'] {
  switch (effect.kind) {
    case 'SFX':
      return effect.kind
    case 'ANIMATION':
    case 'TTS':
    case 'SAVE':
    // 📎 Story 1.17 加的第五个成员（裁决 1）。漏了它编译期就红 ——
    //   那正是 `assertNeverEffect` 存在的理由，不许用 `as` 绕开（R-51 第 2 类）。
    case 'TRACE':
      return effect.kind
    default:
      return assertNeverEffect(effect)
  }
}
