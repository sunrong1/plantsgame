/**
 * 平衡模拟 —— 占位实现。
 *
 * 真正跑模拟并 import 真实 core/ reducer 属 Story 1.4（AR17）。
 * 本 story 只建立脚本位置：本模拟必须是 TypeScript 并 import 真实 core/，
 * 以免 Python 侧与 core/ 各存一份数值导致漂移（架构硬约束 10）。
 *
 * 用 tsx 而非 Node 原生 type stripping：原生方案不支持 enum，
 * 会给整个 src/core/ 施加一条与架构无关的书写约束（见 Dev Notes §6）。
 */

// 日志前缀用方括号小写（架构 Naming Conventions）
console.log('[balance] balance-sim：占位实现，真实模拟待 Story 1.4 落地')

process.exit(0)
