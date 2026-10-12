/**
 * 音频解锁的三步同步块（AC-1）。
 *
 * ⚠️ 本文件在解锁链路上，**不允许出现任何 `await`** —— 由 eslint 的
 * `no-restricted-syntax` 守卫（见 eslint.config.js）。
 *
 * 视图（`views/StartView.vue`）只认识 app/，**不直接 import services/** ——
 * 解锁顺序本身是一条架构约束（FR2：三步、同一同步块、无 await），
 * 把它写在一个文件里这个约束肉眼可查；散在调用点它就退化成一句注释。
 */
import { prewarmBgm, unlockAudioSession } from '../services/audio'
import { speakSilentWarmup } from '../services/pronunciation'

/**
 * 「开始游戏」点击时同步完成的三步。
 *
 * ⚠️ 三行之间**不得插入任何语句**（更不得有 await / 条件判断 / try）——
 * 手势上下文一旦被让出，Android 的音频解锁会静默失败，且没有任何报错。
 *
 * 不得在此吞异常：两个服务各自已在内部记 `WARN [audio]` / `[tts]` 并降级，
 * 这里吞掉只会让失败不可见（NFR13）。
 *
 * 本函数是「用户手势触发的、一次性、不可重放的资源初始化」——
 * 架构硬约束 4「副作用只走 effects-runner」的唯一合法例外，理由见 story Dev Notes §2。
 */
export function unlockAudioSequence(): void {
  unlockAudioSession() // ① Web Audio 解锁 —— 同步，不可 await
  speakSilentWarmup() // ② TTS 预热（volume = 0 的空 utterance）
  prewarmBgm() // ③ BGM buffer 预解（Story 1.13 落地实现）
}
