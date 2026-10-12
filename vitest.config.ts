import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // core/ 测试不需要 DOM；组件测试时再按文件用 @vitest-environment 覆盖
    environment: 'node',
    // AC-4 要求「npm run test 此刻通过（零测试）」。
    // Vitest 在找不到测试文件时默认以非 0 退出码失败（No test files found）。
    passWithNoTests: true,
  },
})