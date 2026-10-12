import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // ⚠️ 这个文件不继承 vite.config.ts（Vitest 5 与 Vite 8 的配置类型不同源）。
  // 结果是 vue plugin 不会自动生效 —— 实测在此配置下 import 任意 .vue 都会 transform 失败，
  // 报错看起来像「工具链坏了」而不是「少了一个 plugin」。组件测试（Story 1.10 起）必须显式挂上。
  plugins: [vue()],
  test: {
    include: ['tests/**/*.test.ts'],
    // core/ 测试不需要 DOM；组件测试时再按文件用 @vitest-environment 覆盖。
    // ⚠️ 覆盖成 jsdom / happy-dom 前要先装对应依赖，当前 devDependencies 里两个都没有。
    environment: 'node',
    // AC-4 要求「npm run test 此刻通过（零测试）」。
    // Vitest 在找不到任何测试文件时默认以非 0 退出码失败（No test files found）。
    passWithNoTests: true,
  },
})
