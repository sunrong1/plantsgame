/**
 * 会话回放（Story 1.17 / AC-B2）。
 *
 * ── 守什么 ─────────────────────────────────────────────────────────────────
 * AR39 的「把那个瞬间变成可复现的现场」在代码里的全部含义：
 * **给一份 `initialState` 与一串 action，就能算出与原局逐字相同的终态。**
 *
 * ⚠️ **为什么这件事今天构造上成立、而本文件仍必须存在**：
 *   `core/` 零随机、零时间、零 DOM（`reducer.test.ts` 的守卫钉着全层零 `Math.random`
 *   与零 `Date.now`）⇒ `reduce` 是纯函数 ⇒ 同一串输入必然给出同一串输出。
 *   **这个性质不需要本文件，但它需要一个「随 `npm run test` 一起跑的入口」** ——
 *   否则「复现」只活在设计文档里，某一次 `reduce` 偷偷引入随机或时间就会静默通过。
 *
 * ── 为什么放 `core/` 而不是 `app/` ─────────────────────────────────────────
 * 「复现 = 把该 JSON 喂进 reducer」这句话的性质是**纯计算**：零 DOM、零 Vue、
 * 零 `localStorage`、零音频。放 `app/` 会让本文件被迫 import 那些东西才能跑测试。
 *
 * ── 🔥 为什么这里**不**跑副作用 ─────────────────────────────────────────────
 * 回放的判据只有一条：**终态逐字相等**。
 * 播音效、写字盘、朗读全都不该发生 —— 那既是 `app/effects-runner.ts` 的活（R-04），
 * 也是「回放不改动任何东西」这条纯函数纪律的兑现。
 *
 * ── ⚠️ 两份类型定义刻意不共享（R-37 的例外形态）────────────────────────────
 * {@link ReplayInput} 与 `app/session-recorder.ts` 的 `SessionExport` **结构相同但各自声明**。
 * 那不是复制规则正文：一个是「要导出的文件格式」（app 层，跨进程），
 * 另一个是「回放的入参形状」（core 层，进程内）。
 * ⚠️ **共享它们只能靠 `core/` import `app/`** —— 那正是 R-08 禁的反向依赖。
 * ⇒ 两份定义各自存在，形状改了一边时另一边的测试会红，那正是我们要的信号。
 */

import { reduce } from './reducer.js'
import type { Action, State } from './types.js'

/**
 * 回放的入参 —— 与 `app/session-recorder.ts` 的 `SessionExport` **结构相同**。
 *
 * ⚠️ **刻意不与 `SessionExport` 共享类型**：`core/` 不得 import `app/`（R-08 + ESLint 硬禁）。
 *   改了一边时另一边的守卫会红 —— 那正是「两份定义」要买到的保险。
 *
 * ⚠️ 字段是 `readonly` 而 `actions` 是 `readonly Action[]`：
 *   `exportSession()` 交出的正是这个宽窄，回放不应要求调用方先拷贝一份。
 */
export interface ReplayInput {
  readonly initialState: State
  readonly actions: readonly Action[]
}

/**
 * 按顺序重放一串 action，返回终态。**纯函数**：零副作用、零随机、零时间。
 *
 * ⚠️ **空 `actions` 返回 `initialState` 本身**（同一个引用，不拷贝）。
 *   理由与 `advanceProgress` / `advanceUnit` 的「无增量返回入参本身」同款：
 *   拷贝会让「这一局还没动过」也产生引用变更，破坏引用相等的鉴别力。
 *
 * ⚠️ **非法 action 会照 `reduce` 的抛错抛出去**，本函数**不**接住。
 *   会话是玩家真实点出来的序列，正常不会非法；
 *   而接住会让「导出文件损坏」变成一次静默的空回放 —— 那比抛错难查得多。
 *   （AC-B3 的方向与 `app/store.ts` 的 `restoreFromSave` 相反：
 *   那里读的是**外部不可信**的存档所以要降级，这里读的是**自己录的**会话所以要炸。）
 *
 * @param session 起始 state 与 action 序列（通常来自 `JSON.parse` 后的导出会话）
 * @returns 走完全部 action 之后的 state
 */
export function replaySession(session: ReplayInput): State {
  let cursor = session.initialState
  for (const action of session.actions) {
    cursor = reduce(cursor, action)
  }
  return cursor
}
