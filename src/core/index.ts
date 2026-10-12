/**
 * core/ 的唯一对外出口（barrel）。
 *
 * 本文件目前是空的：业务逻辑属 Story 1.3。
 * 但它必须存在 —— tsconfig.core.json 的 include 若命中 0 个文件，
 * `vue-tsc -b` 会报 TS18003: No inputs were found。
 *
 * 边界（由工具链强制，见 AC-2）：
 *   - 本层零 DOM —— tsconfig.core.json 的 lib 不含 DOM
 *   - 本层零 Vue —— ESLint no-restricted-imports 禁止 import 'vue'
 *
 * @see tests/scaffold/core-boundary.test.ts —— 这两条边界有回归测试守卫
 */

export {}