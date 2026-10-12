/**
 * Web Audio 会话 —— AudioContext 的持有者（Story 1.2）。
 *
 * ⚠️ 本文件在音频解锁链路上，**不允许出现任何 `await`**（架构决策 4 / 硬约束 8），
 * 由 eslint 的 `no-restricted-syntax` 守卫（见 eslint.config.js）。
 *
 * ⚠️ `resume()` 是 Promise，但**发起调用必须同步**：`await ctx.resume()` 是本项目
 * 最容易被「写正确」惯犯带偏的一行。正确形态是「同步发起 + 拒绝时记日志」。
 *
 * 判据说明（Dev Notes §3.1）：「禁 await」在 Web Audio 侧并不是因为「await 之后会失败」
 * —— 门禁是 sticky activation，await 之后仍可成功。保留这条规则的理由是
 * ① 架构已定稿、story 的职责是执行不是重论证；② Web Audio 1.1 正在把
 * suspended → running 改为**异步**转移，同步读 ctx.state 会误判；
 * ③ 同步发起避开 pending 窗口，零代价的保守写法。
 */

/** 模块级持有，刻意**不**导出一个新建好的实例（那会在模块求值时就建出 AudioContext）。 */
let audioCtx: AudioContext | null = null

/** 取底层 AudioContext —— 供 Story 1.13 播放真实音效时使用。 */
export function getAudioContext(): AudioContext | null {
  return audioCtx
}

/**
 * 解锁 / 保持 Web Audio 会话（AC-1 第一步）。
 *
 * 首次调用时创建 AudioContext，之后每次都 resume() —— 手势内创建与手势内 resume 等价，
 * 而孩子可能连点按钮，所以两者都要覆盖。
 *
 * 幂等：重复调用复用同一个 context，重复 resume 无害（这正是 AC-8「反复点 5 次」的依据）。
 * 全程同步，任何失败只记 `WARN [audio]`，**不抛、不弹窗** —— NFR13「孩子面前永不出现技术错误」。
 */
export function unlockAudioSession(): void {
  try {
    if (!audioCtx) {
      const Ctor = globalThis.AudioContext
      if (typeof Ctor !== 'function') {
        console.warn('[audio] 浏览器不支持 AudioContext，音频通路不可用')
        return
      }
      // 在手势上下文内创建（不是在 import 时）—— 手势前创建的 context 只能是 suspended。
      audioCtx = new Ctor()
    }

    // 同步发起，不 await。拒绝时（策略未放开等）只记日志。
    void audioCtx.resume().catch((err: unknown) => {
      console.warn('[audio] resume() 被拒绝，音频会话可能仍不可用', err)
    })
  } catch (err) {
    console.warn('[audio] 解锁音频会话失败', err)
  }
}

/**
 * BGM buffer 预解（AC-1 第三步）。
 *
 * 本 story 为**空实现**：BGM 资源属 Story 1.13，`public/assets/audio/music/` 现在是空的。
 * 此刻真去 `fetch('/assets/audio/music/bgm.mp3')`，平板上每次点「开始游戏」
 * 都会在控制台留下一条 404 —— 把一个尚未存在的资源写成了既有的运行时故障。
 *
 * 调用点、位置、以及「它必须与前两步在同一同步块内」这些约束**已经成立**，
 * Story 1.13 只需替换函数体，不需要改调用点。
 */
export function prewarmBgm(): void {
  // TODO(Story 1.13): 在此 fetch + decodeAudioData 预解 BGM。
  // 注意仍然必须同步发起，不得 await —— 与前两步共用同一个手势上下文。
}
