import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // ⚠️ 这个文件不继承 vite.config.ts（Vitest 5 与 Vite 8 的配置类型不同源）。
  // 结果是 vue plugin 不会自动生效 —— 实测在此配置下 import 任意 .vue 都会 transform 失败，
  // 报错看起来像「工具链坏了」而不是「少了一个 plugin」。组件测试（Story 1.10 起）必须显式挂上。
  plugins: [vue()],
  // 与 vite.config.ts 的 base 保持一致（Story 1.3 / AC-11）。
  //
  // ⚠️ 别在这里用顶层 `base` 或 `define` —— 实测 Vitest 5 两者都**不**改变
  //   `import.meta.env.BASE_URL`（设了之后它仍是 '/'）。唯一管用的是 test.env。
  test: {
    include: ['tests/**/*.test.ts'],
    // 不设的后果：BASE_URL 是 '/'，而硬编码的 '/assets/audio/voice/' 恰好与它
    // 相等 —— 「录音路径有没有跟随 base」这条断言会**永远通过**，守卫形同虚设。
    env: {
      BASE_URL: '/plantsgame/',
    },
    // core/ 测试不需要 DOM；组件测试时再按文件用 @vitest-environment 覆盖。
    // ⚠️ 全局保持 node，**不要**改成 jsdom —— 组件测试一个个文件加
    //   `/** @vitest-environment jsdom */` docblock 就行（quiz-card.test.ts 是先例）。
    //   ⚠️ 过期注释更正（2026-10-15，Story 1.11 T10.3）：原文写
    //   「覆盖成 jsdom / happy-dom 前要先装对应依赖，当前 devDependencies 里两个都没有」——
    //   **`jsdom ^30.1.2` 已在 `package.json:32`**（1.9 加的，本 story 的
    //   `tests/components/quiz-card.test.ts` 正靠它跑）。**happy-dom 确实没装**，
    //   本仓库统一用 jsdom，别照原文去装 happy-dom。
    environment: 'node',
    // AC-4 要求「npm run test 此刻通过（零测试）」。
    // Vitest 在找不到任何测试文件时默认以非 0 退出码失败（No test files found）。
    passWithNoTests: true,
  },
})
