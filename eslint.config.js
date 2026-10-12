import tseslint from 'typescript-eslint'
import vue from 'eslint-plugin-vue'

export default tseslint.config(
  {
    // .claude/ 在 .gitignore 里，但 ESLint 不读 .gitignore。
    // BMAD skill 目录一旦带上 .js，npm run lint 会因一批无关文件报错，
    // 并把 AC-2 的边界验证报错淹没在里面 —— 那是最容易造成假绿的形态。
    ignores: [
      'dist/**',
      'node_modules/**',
      '_bmad/**',
      '_bmad-output/**',
      'docs/**',
      '.claude/**',
    ],
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
    // Debug Log #4：<script setup> 漏 import 组件时，vue-tsc / build / test / lint 全绿，
    // 但页面渲染成纯白（未解析的组件按原生自定义元素渲染）。
    // vue/no-undef-components 只管这一类错误，对现有模板零误报，代价最小。
    // （模板类型检查由 tsconfig 的 vueCompilerOptions.strictTemplates 负责，本 story 未启用。）
    files: ['**/*.vue'],
    rules: {
      'vue/no-undef-components': 'error',
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
          // 架构的依赖方向只能向下：components/ views/ → app/ → services/ → core/。
          // core/ 向上 import 即违规。
          //
          // 这里必须用相对路径形态：项目没有 @/ 路径别名（tsconfig 无 paths、
          // vite 无 resolve.alias），写 '@/app/*' 的话任何文件都写不出这个 import，
          // 规则永不触发 —— 看着在守，实际没守。
          // 真正写得出的是 '../services/x' 这类相对导入，所以按上跳层级匹配。
          patterns: [
            {
              group: ['**/../app/*', '**/../../app/*', '**/../../../app/*'],
              message: 'core/ 是最底层，不得 import app/（架构依赖方向只能向下）。',
            },
            {
              group: ['**/../services/*', '**/../../services/*', '**/../../../services/*'],
              message: 'core/ 是最底层，不得 import services/（架构依赖方向只能向下）。',
            },
            {
              group: [
                '**/../components/*',
                '**/../../components/*',
                '**/../../../components/*',
              ],
              message: 'core/ 是最底层，不得 import components/（架构依赖方向只能向下）。',
            },
          ],
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
  {
    // Story 1.2 / AC-10：音频解锁链路禁 await。
    //
    // 为什么不扩大到整个 src/services/：Story 1.14 的 save.ts 合理需要 await。
    // 为什么不覆盖 src/views/StartView.vue：**有意为之**。
    // 写 `async function onStart() { await unlockAudioSequence() }` 不违反 FR2 ——
    // FR2 管的是「三步之间」无 await，那里的 await 发生在三步之后。
    // 但写它是个坏味道。将来若要扩到 views/，那是 Story 1.13+ 的决定。
    //
    // 这条规则是 FR2 唯一的**可机器判定**的部分：编译不报错、运行也不报错，
    // 只有一个写了 await 的人才会知道它坏了。少了守卫，FR2 必然在维护中漂移。
    files: ['src/services/audio.ts', 'src/services/pronunciation.ts', 'src/app/audio-unlock.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'AwaitExpression',
          message:
            '音频解锁链路不允许 await：三步必须在用户手势的同一个同步块内完成（架构硬约束 8 / FR2）。' +
            'resume() 是 Promise —— 用 `void ctx.resume().catch(...)` 同步发起，不要等它完成。',
        },
      ],
    },
  },
)
