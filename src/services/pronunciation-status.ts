/**
 * 朗读状态的可观察层（Story 1.18 / AC-D1）。
 *
 * ── 为什么单独一个文件，而不在 `pronunciation.ts` 里直接暴露 ref ──────────
 * 两个理由，缺一不可：
 *
 * ① **R-08 依赖方向**：组件层要读它，朗读服务在服务层。组件直接 import
 *    `pronunciation.ts` 就等于把「发声实现」也拖进组件的依赖图 ——
 *    而组件真正需要的只是「此刻有没有在念」这一个比特。
 * ② **`pronunciation.ts` 里禁止出现任何 `await`**（架构硬约束 8 / 裁决 5，
 *    由 eslint 的 `no-restricted-syntax` 守着）。它内部全是同步的回调收敛，
 *    要让界面看见状态，只能靠「发布-订阅」而不是 `await` 一个 Promise。
 *
 * ── 形态与 `sw-registration.ts` 同款（模块级状态 + Set 订阅者）─────────────
 * 这不是巧合：两个都是「服务层内部有状态、界面层要读」的同一形态。
 * 刻意**不用**单例 class（Story 1.2 已否决过 legacy 的 `SpeechService.getInstance()`），
 * 也不用 Pinia（架构否决）。测试用 `vi.resetModules()` 隔离。
 *
 * ── 三层错误策略（裁决 7）─────────────────────────────────────────────────
 * 这一层**不抛**、不弹窗、不改 `view`。订阅者回调抛错时吞掉并记 WARN ——
 * 一个坏掉的浮层不该把朗读链路带崩，而朗读是回合的主通路。
 */

import { readonly, ref } from 'vue'

/**
 * 朗读状态。
 *
 * ⚠️ **刻意只有两态**，没有 `loading` / `error`：
 *   4–8 岁孩子面前不出现「加载中…」（NFR13），而朗读失败的表现是**没有声音**，
 *   把失败画成「朗读失败」等于给一件不该被看见的技术故障加了个 UI。
 *   失败照旧由 `pronunciation.ts` 记 `[tts] WARN`（那里是日志的正确归属）。
 */
export type PronunciationStatus = 'idle' | 'playing'

/**
 * 模块级状态用 `ref` 而不是裸 `let`。
 *
 * ⚠️ `ref` 让组件能直接把它挂进模板的响应式图里，
 *   而裸 `let` 在 Vue 里**不会**触发更新 —— 那正是「状态变了但界面没变」
 *   这一类静默失败的成因。
 */
const status = ref<PronunciationStatus>('idle')

/** 订阅者集合。Set 保证同一个函数不会被广播两次。 */
const listeners = new Set<(next: PronunciationStatus) => void>()

/** 当前状态 —— 供非组件的调用方同步读。 */
export function currentPronunciationStatus(): PronunciationStatus {
  return status.value
}

/**
 * 发布新状态。
 *
 * ⚠️ **同值不广播**：孩子连点同一张卡十次只会产生一次 `idle → playing → idle`，
 *   而每次都广播会让浮层重渲染十次。
 */
export function publishPronunciationStatus(next: PronunciationStatus): void {
  if (status.value === next) return
  status.value = next
  for (const listener of listeners) {
    try {
      listener(next)
    } catch (err) {
      // ⚠️ **吞掉订阅者的异常**：一个画错了的浮层绝不该把朗读链路带崩，
      //   而朗读是回合主通路（架构硬约束 2 的精神：渲染层故障不得外溢到规则层）。
      //   同一个订阅者会在下次广播时再次被调用，所以这里不踢人。
      console.warn(`[pronunciation] 朗读状态订阅者抛错，已忽略：${err instanceof Error ? err.message : String(err)}`)
    }
  }
}

/**
 * 订阅状态变化 —— **订阅瞬间立刻收到当前值**。
 *
 * ⚠️ 「立刻回放当前值」是刻意的：否则浮层在 `update-ready` 之类
 *   「状态早于组件诞生」的路径上会**错过这一次广播**，而那一帧的空白
 *   看起来就像「功能没生效」（与 `sw-registration.ts` 的同一处判断同因）。
 *
 * @returns 退订函数。组件必须在 `onBeforeUnmount` 里调用它 ——
 *          模块级 Set 会一直持有闭包，不退订就是每次挂载多留一份。
 */
export function subscribePronunciationStatus(listener: (next: PronunciationStatus) => void): () => void {
  listeners.add(listener)
  // ⚠️📎 `[CR]` 2026-10-20：这次「立刻回放」也要有 try/catch ——
  //   原来逐字是 `listener(status.value)`（裸调）⇒ 订阅者在**挂载路径**上抛错时
  //   ① **组件挂不上**（异常从 `subscribe` 里冒出去）；
  //   ② 而那个订阅者**已经进了 `Set`** ⇒ 此后每次广播都再抛一次。
  //   ⇒ 与 `publishPronunciationStatus` 侧的保护**对称**（同型两处，原来一处有一处没有）。
  try {
    listener(status.value)
  } catch (err) {
    console.warn(`[pronunciation] 朗读状态订阅者抛错，已忽略：${err instanceof Error ? err.message : String(err)}`)
  }
  return () => {
    listeners.delete(listener)
  }
}

/**
 * 只读响应式引用 —— 组件用 `readonly()` 拿它，避免组件去 `write`。
 *
 * ⚠️ **组件层不该直接写这个状态**：状态的唯一生产者是 `pronunciation.ts`，
 *   组件写了就会出现「浮层说在念，但根本没在念」——
 *   那种界面比没有反馈更糟。
 *
 * 🔥📎 **`[CR]` 2026-10-20：原来逐字是 `status as Readonly<Ref<…>>` ——
 *   那是 R-51 第 2 类失效（`as` 只骗过了编译器，运行时完全可写）**。
 *   ⇒ 现在用 Vue 的 `readonly()`：它返回的是一个**真的写不进去**的代理
 *     （写入会在开发模式下告警、在生产模式下静默无效）。
 */
export function pronunciationStatusRef(): Readonly<import('vue').Ref<PronunciationStatus>> {
  return readonly(status)
}
