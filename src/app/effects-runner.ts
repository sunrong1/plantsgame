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
import type { Action, Effect, State } from '../core'
import { playSfx, startBgmIfReady } from '../services/audio'

export { startBgmIfReady }

/**
 * 执行一次 dispatch 产生的全部副作用 —— 按 `runEffects` 返回的**顺序**逐条执行
 * （AC-C5：返回顺序就是播放顺序）。
 *
 * ⚠️ **本函数绝不抛**（AC-E4）。某一条抛错只记 `[audio] WARN` 并**继续执行后续条目** ——
 *   理由是 `store.applyAction` 的调用方（组件门面）刻意没有 try/catch，
 *   冒上去就等于回合卡死，而 `epics.md:1210` 逐字要求「不阻断回合流转」。
 */
export function runEffectsFromStore(action: Action, prev: State, next: State): void {
  for (const effect of runEffects(action, prev, next)) {
    runOne(effect)
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
function runOne(effect: Effect): void {
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
      // 📎 裁决 6：换题朗读走 `store.speakQuestion()` 门面，收口属 Story 1.16。
      return
    case 'SAVE':
      // 📎 属 Story 1.15。本 story **不** import 尚不存在的 `services/save.ts`（AC-A4）。
      return
    default:
      assertNeverEffect(effect)
  }
}

/** 把一个 unknown 变成一句可读的说明（不抛，NFR14）。 */
function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
