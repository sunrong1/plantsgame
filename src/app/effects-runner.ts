/**
 * 副作用执行器（Story 1.14 / AC-E1）。
 *
 * ── 它是干什么的 ───────────────────────────────────────────────────────────
 * `core/effects.ts` 的 `runEffects` 是**纯函数**：它只回答「这次 dispatch 该播什么声音」，
 * 自己一个副作用都不做。**执行**那份答案是本文件的活。
 *
 * ── 架构硬约束 4 的落点 ─────────────────────────────────────────────────────
 * 「副作用只在 `app/effects-runner.ts` 执行」。所以：
 *   · 本文件是 `src/` 里**唯一**调 SFX / BGM 播放函数的地方（守卫 G60 扫全仓）；
 *   · `store.applyAction` 调本文件，**不**自己 import `services/audio`；
 *   · 组件调 `store.applyAction`，**不**直接碰音频。
 *
 * ── 为什么 BGM 单独一个门面（裁决 5）────────────────────────────────────────
 * BGM 由「进入战斗」触发，而**进关不是 action**：`state` 在 `store.ts` 的模块求值期
 * 就建好了，`enterLevel()` 只改 `view`。⇒ 它没有 `action` 可 diff，硬塞进
 * `runEffects` 是形状错配。本文件重导出的 {@link startBgmIfReady} 与 `store` 已有的
 * `speakQuestion()` 门面**同构**（app 层门面，非 action 驱动）。
 *
 * ⚠️ **本文件不允许 `await`** —— 它同步跑在 `applyAction` 里，
 *   而 `applyAction` 是同步函数，调用方（组件门面）**刻意没有** try/catch。
 *   加了 await 就会让音频解码挤进状态机。解码的 promise 链在
 *   `services/audio.ts` 内部闭环，本文件只见同步的「发起」。
 */

import { assertNeverEffect, runEffects } from '../core'
import type { Action, Effect, Progress, State } from '../core'
import { playSfx, startBgmIfReady } from '../services/audio'
import { writeSave } from '../services/save'

export { startBgmIfReady }

/**
 * 执行一次 dispatch 产生的全部副作用 —— 按 `runEffects` 返回的**顺序**逐条执行
 * （AC-C5：返回顺序就是播放顺序）。
 *
 * ⚠️ **本函数绝不抛**（AC-E4）。某一条抛错只记 `WARN` 并**继续执行后续条目** ——
 *   理由是 `store.applyAction` 的调用方（组件门面）刻意没有 try/catch，
 *   冒上去就等于回合卡死，而 `epics.md` 的 Story 1.15 逐字要求「不阻断回合流转」。
 *   ⚠️📎 **1.15 的结论：catch 是「每条各自包」，不是「循环外包一层」** ——
 *   理由与代价逐条写在 `runOne` 的 `case 'SAVE'` 注释里（AC-E4 裁决），
 *   并在 `case 'SAVE'` 处留有指向。**别把它合并回循环外一层。**
 *
 * @param progress **1.15 新增的第 4 参**（裁决 4）。存档要写两样东西：
 *   `currentGame` 来自 `next`（判据在纯函数里，已编进 `SAVE` effect），
 *   而 `progress` 是 store 里的独立 ref，**不是** `(action, prev, next)` 能算出来的 ——
 *   `advanceProgress` 住在 `store.ts` 且有「无增量返回入参本身」的性质。
 *   ⚠️ 为什么不把它编进 `SAVE` effect：那会让 `runEffects` 不再是纯判据。
 */
export function runEffectsFromStore(
  action: Action,
  prev: State,
  next: State,
  progress: Progress,
): void {
  for (const effect of runEffects(action, prev, next)) {
    runOne(effect, progress)
  }
}

/**
 * 执行**单条**副作用。
 *
 * ⚠️ **`assertNeverEffect` 刻意放在 try/catch 之外**：它是**编译期穷尽性**的最后一道，
 *   被 try 吞掉就退化成静默 warn —— 那正是本仓库记过的「断言允许了它要防的违规」。
 *   `switch` 漏掉 `Effect` 的某个成员时，TypeScript 会在这里报
 *   「argument of type … is not assignable to parameter of type 'never'」，
 *   与 `core/actions.ts` 的 `actionName` 同款；查表做不到这一点。
 *
 * ⚠️ `try/catch` 只包住**真正的执行**（`playSfx`）。分支选择本身不会抛，
 *   包进去只是为了让 catch 变成一条永远走不到的代码路径。
 */
function runOne(effect: Effect, progress: Progress): void {
  if (effect.kind === 'SFX') {
    try {
      playSfx(effect.cue)
    } catch (err) {
      // `playSfx` 内部已经兜过一轮（AC-D9），这层防的是**将来**新增的抛出路径。
      // 冒到 `applyAction` 就是回合卡死 —— 组件门面没有 try/catch。
      console.warn(`[audio] 音效 ${effect.cue} 播放失败（已跳过，不阻断回合）：${describe(err)}`)
    }
    return
  }

  // ⚠️ 上面已经把 `SFX` 用早返回处理掉了 —— 这里**不能再写 `case 'SFX'`**：
  //   TypeScript 已把 `effect` 收窄到剩下三个成员，再比一次会报 TS2678
  //   （`'SFX'` is not comparable to `'ANIMATION' | 'TTS' | 'SAVE'`）。
  //   而恰恰是这个收窄让下面的 `default` 拿到 `never` —— 穷尽性的机制就是它。
  switch (effect.kind) {
    case 'ANIMATION':
      // 📎 1.13 裁决 2：动效**不进** effects-runner —— 画面是 state 的表现，走 class + CSS。
      //   联合里留着这个成员是为了 1.15 接线时返回类型不变。
      return
    case 'TTS':
      // 🚨 **📎 1.16 `[CS]` 裁决 6 更正了归属（原写「收口属 Story 1.16」）：**
      //   `epics.md` 的 Story 1.16 AC 零 TTS 字样 ⇒ 按 R-32，1.16 无权做这件事；
      //   而 `epics.md` 里没有任何 story 承担它 ⇒ 归 **无归属**，需 `/gds-correct-course` 指派。
      //   本分支**仍然是空 `return`**，行为一个字没改 —— 改的只是「谁来接」的归属声明。
      //   现状（1.14 裁决 6）：换题朗读走 `store.speakQuestion()` 门面，
      //   而 `QuestionCard.vue` 里还有一条独立的 `watch` 触发同一件事 ——
      //   那条张力记在 `deferred-work.md` 的 1.14 第 6 条，未被本 story 触发。
      return
    case 'SAVE':
      // 📎 **Story 1.15 接上的**（AC-C3）。写盘判据在 `core/effects.ts` 里，
      //   这里只负责执行 —— 与 SFX 那条路径同构。
      //
      // ⚠️🚨 **AC-E4 的裁决（本 story 的结论，不是 1.14 的「已评估」）** ——
      //   1.14 段 defer 第 2 条逐字要求「1.15 接 `SAVE` 前应当重新评估这一层」。
      //   **先纠正它的一处失实**：它写「外层为何仍值得留着」，好像那层 try/catch
      //   一直存在 —— 实测 1.14 `[DS]` 交付的代码里**整条循环外没有 try/catch**
      //   （M120 那个变异是**加**一层，加了之后 7 条守卫 0 红 ⇒ 它当时就是冗余的）。
      //   ⇒ 「重新评估这层」的结论是：**它不存在，而 AC-E5 又要求写盘抛错不中断后续**。
      //   两个选项：**① 在循环外加一层**（会把 `assertNeverEffect` 的抛重新兜住，
      //   编译期穷尽性退化成一条 WARN —— 那正是 defer 逐字记下的代价）；
      //   **② 把 catch 收窄到这一条**。**本 story 选 ②**：
      //     · AC-E5 成立 —— 写盘抛错不影响回合，也不影响循环里的其他条目；
      //     · AC-E4 的代价**不存在** —— `assertNeverEffect` 仍在任何 try 之外，
      //       `Effect` 联合漏成员时**立刻炸**，可见性一步没减。
      //   ⚠️ **别把它「简化」成循环外一层**：那会一次买回 defer 记的两条代价，
      //     而 ① 换来的额外覆盖在当前代码里是 0 条（save.ts 自己 catch 全部异常）。
      //   ⚠️ `writeSave` 正常路径**不抛**（它 catch 一切并返回 boolean，AC-B3/AC-B6），
      //     所以这层 try 是**契约违约的兜底**，不是主兜底 —— 两者的职责别混淆。
      try {
        writeSave(progress, effect.currentGame)
      } catch (err) {
        console.warn(`[save] 写盘抛错（已跳过，不阻断回合）：${describe(err)}`)
      }
      return
    default:
      assertNeverEffect(effect)
  }
}

/** 把一个 unknown 变成一句可读的说明（不抛，NFR14）。 */
function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
