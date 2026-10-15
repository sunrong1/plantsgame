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
    // [CR] P31（Story 1.4 审查）：所有文本文件必须以换行结尾。缺了它，
    // 下一个 story 向文件追加内容时，diff 会把原最后一行也标记为改动
    // —— 归属错乱、review 噪音，还会掩盖「谁改的这行」。
    files: ['**/*.{ts,vue,js}'],
    rules: {
      'eol-last': ['error', 'always'],
    },
  },
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
    // Story 1.6 / AC-30 的副作用：`src/content/` 落在 tsconfig.app.json（有 DOM）里，
    // 所以上面那条「零 DOM 红线」对它**不生效** —— 在内容层写 `window.localStorage`
    // 不会有任何工具报错。这是内容层唯一的边界守卫。
    //
    // 为什么内容层也不该碰 DOM：它是**数据录入与校验**层，启动时跑一次就结束了，
    // 不参与渲染也不参与回合流程（架构 `:568-571`）。它一旦持有 DOM 引用，
    // 单元 JSON 的校验就会与浏览器环境绑死 —— 测试环境是 `node`（无 DOM），
    // 到那时这条边界早已被破坏且没有任何报警。
    files: ['src/content/**/*.{ts,vue}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'vue',
              message:
                'content/ 是纯数据层，零 Vue 依赖（架构 NFR7 的同一条边界）。' +
                '渲染是 components/ 与 views/ 的职责。',
            },
          ],
          // ⚠️ [CR] 2026-10-14 补上：原先这条边界**只被测试宣称、不被任何工具守**。
          //   变异的做法是给 `schema.ts` 加 `import { TOWER_TYPES } from '../core/balance'`
          //   （塔型枚举改成引用 core）—— 全部 93 条内容层测试仍全绿，因为
          //   `content-boundary.test.ts` 只断言了「规则存在且含 vue」，而 core 从来不在禁列里。
          //
          //   为什么必须禁（不只是风格问题）：`parseUnits()` 在启动时跑，一旦内容层
          //   依赖战斗层模块加载成功，一个**内容错误**（坏 JSON）会先撞上一条与它无关的
          //   import 失败，报错现场离错误源头很远。塔型字面量重复 + 等值断言
          //   （见 `schema.ts` 的 TOWER_TYPESSchema 注释）是刻意的分工，不是遗漏。
          patterns: [
            {
              group: ['**/core/**', '**/core/*'],
              message:
                'content/ 不得 import core/：内容校验不能依赖战斗层模块加载成功，' +
                '否则一个坏 JSON 会先报成 import 失败。塔型用字面量重复 + 等值断言。',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'content/ 不碰 DOM：它只做内容录入与校验' },
        { name: 'document', message: 'content/ 不碰 DOM：它只做内容录入与校验' },
        { name: 'localStorage', message: '存档是 services/save.ts 的职责' },
        { name: 'speechSynthesis', message: 'TTS 是 services/pronunciation.ts 的职责' },
      ],
    },
  },
  {
    // Story 1.10 / AC-14：组件层的两条边界。
    //
    // ── 为什么第一条规定在组件层 ────────────────────────────────────────
    // 架构 `[GA]:1023-1032` 的「已知边界表」逐字写着：「组件内不得出现战斗规则计算」
    // 这条**无工具可强制、只能靠 `[CR]`**，漂移风险标为**最高** ——
    // 「AI 常顺手在组件里写 `if (hp <= 0)`」。
    //
    // 本条把那半个「工具」补上：组件**不许 import `src/core/balance`**，
    // 即战斗数值的单一事实源（架构 `:634`）。组件必须从 `State` / `Tower` /
    // `Zombie` 拿值，或调 `core/` 里已封装好的**纯函数**（如 `zombieHpRatio()`）。
    //
    // ⚠️ **它挡不住全部漂移形态**：组件照样可以写 `zombie.hp / 100`，
    //   只要它不去 import balance.ts。⇒ 所以还配了守卫 **G19**：断言组件源码里
    //   不出现裸的血量/伤害算术。两条合起来才是「工具 + 审查」的全覆盖，
    //   缺一条就只是把漂移从「一眼可见」降级成「需要搜索才看得见」。
    //
    // ⚠️ **为什么必须用相对路径形态**（同 `src/core/**` 块里的同一段理由）：
    //   项目没有 `@/` 别名，写 `'@/core/balance'` 的话任何文件都写不出这个 import，
    //   规则永不触发 —— 看着在守，实际没守。
    files: ['src/components/**/*.{ts,vue}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/../core/balance',
                '**/../../core/balance',
                '**/../../../core/balance',
              ],
              message:
                '组件不得直接读战斗数值常量（ZOMBIE_HP / TOWER_STATS / HEARTS …）—— ' +
                '它们是数值调优（Story 3.2）的对象，改动会牵动 balance-sim 的门槛数字。' +
                '组件只从 State / Tower / Zombie 拿值，或调 core/ 里已封装好的纯函数' +
                '（如 zombieHpRatio()）。这条边界的漂移风险是全项目最高的（[GA]:1029）。',
            },
          ],
        },
      ],
    },
  },
  {
    // Story 1.10：`Tower.vue` / `Zombie.vue` 允许单词组件名。
    //
    // `vue/multi-word-component-names` 的目的是避免组件名与 HTML 原生元素
    // 或同名全局产生歧义（`Button.vue` 撞 `<button>` 之类）。
    // `Tower` 与 `Zombie` **都不是 HTML 元素**，也不与本项目任何其它组件重名，
    // ⇒ 那条理由在这里不成立。
    //
    // ⚠️ 为什么不用改名绕过（`TowerUnit.vue` / `ZombieUnit.vue`）：
    //   Story 1.10 的 AC 与 Dev Notes **逐字指定**了 `Tower.vue` / `Zombie.vue`
    //   这两个路径，守卫 G17 / G18 与本文件其余注释都按那些路径引用。
    //   为满足一条风格规则去改规格里写死的路径，是拿规格迁就 lint。
    files: ['src/components/battle/Tower.vue', 'src/components/battle/Zombie.vue'],
    rules: {
      'vue/multi-word-component-names': 'off',
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
