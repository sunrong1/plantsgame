import tseslint from 'typescript-eslint'
import vue from 'eslint-plugin-vue'

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', '_bmad/**', '_bmad-output/**', 'docs/**'],
  },
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    // .vue 里的 <script lang="ts"> 由 vue-eslint-parser 解析，
    // 再把 script 块交给 TS parser —— 不接这一层，`: void` 这类返回类型标注会直接解析失败。
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },
  {
    files: ['src/core/**/*.{ts,vue}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'vue',
              message: 'core/ 是纯逻辑层，零 Vue 依赖（架构 NFR7）。UI 逻辑请放 app/ 或 components/。',
            },
          ],
          patterns: ['@/app/*', '@/services/*', '@/components/*'],
        },
      ],
      // 纵深防御：tsconfig 已经拦住了，这里再拦一道，防止有人给 tsconfig.core.json 加回 DOM。
      // 注意分工 —— 真正的红线是 tsconfig.core.json 的 lib + vue-tsc -b；
      // ESLint 管不住 globalThis.localStorage 这类写法。验收 AC-2 时看 vue-tsc -b 的报错。
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'core/ 零 DOM' },
        { name: 'document', message: 'core/ 零 DOM' },
        { name: 'localStorage', message: '存档是 services/save.ts 的职责' },
        { name: 'speechSynthesis', message: 'TTS 是 services/pronunciation.ts 的职责' },
      ],
    },
  },
)