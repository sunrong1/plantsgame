/**
 * 内容校验 —— 占位实现。
 *
 * 真正的 schema 校验（zod + content/units/*.json）属 **Story 1.6**（教材内容录入），
 * 本 story 只需保证 `npm run validate:content` 存在且退出码为 0（AC-3 / AC-4）。
 *
 * 📎 [DS] 2026-10-13 更正：本文件原写「属 Story 1.5」「待 Story 1.5 落地」——
 * 指向了错误的 story。按 `epics.md` 的 AC，`src/content/schema.ts` 的 Zod schema 与
 * 五类内容错误的逐条抓取都在 **Story 1.6**（epics.md:876-902），
 * Story 1.5 交付的是回合状态机，不碰内容层。
 * 与 `scripts/balance-sim.ts` 那处过时措辞是同一类问题（deferred-work 移交 #5），
 * 一次修掉，别让接手人跑进没有 AC 的 story。
 *
 * ⚠️ 在 Story 1.6 落地前，本脚本**校验不了任何东西**：它恒定退出 0。
 * 「跑过了 validate:content」这句话在此之前不构成任何证据。
 */

// 日志前缀用方括号小写（架构 Naming Conventions）
console.log('[content] validate-content：占位实现，Schema 校验待 Story 1.6 落地')

process.exit(0)
