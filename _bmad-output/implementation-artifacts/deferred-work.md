# 延后工作

## Deferred from: code review of story-1-2-音频解锁与-tts-朗读 (2026-10-12)

### 第二轮 `[CR]` 三层并行审查新增（2026-10-12）

- **`views/` 不得直接 import `services/` 零强制，且测试把这个缺口钉死了** ——
  `eslint.config.js` 新块只配了 `no-restricted-syntax`，没有 `no-restricted-imports`；
  `tests/scaffold/audio-unlock-guard.test.ts` 里那条用例 `守卫有意不覆盖 views/`
  **断言了「无人守」这件事存在**。`app/effects-runner.ts`（Story 1.13 落地）同样不在守卫名单内。
  按 Task 5.4 属有意为之，不算违规 —— 但「同一个改动里新增了架构约束却无人守，
  还把无人守写成了测试预期」值得留档。Story 1.13 落地 effects-runner 时一并评估。
  ——
  `eslint.config.js`、`tests/scaffold/audio-unlock-guard.test.ts:1005-1010`

- ⚠️⚠️ **`RECORDING_BASE_PATH` 是绝对根路径 —— 而部署目标**就是** sub-path，这已是确认的 bug 而非假设风险** ——
  项目记录的 Pages 地址是 **`https://sunrong.site/plantsgame/`**（2026-10-13 复核），
  即应用挂在 `/plantsgame/` 前缀下。而 `vite.config.ts` **未设 `base`**（默认 `/`），
  `RECORDING_BASE_PATH` 又是硬编码的 `'/assets/audio/voice/'`。
  ⇒ 部署后请求的是 `/assets/audio/voice/u1-dog.mp3`，
  而真实路径是 `/plantsgame/assets/audio/voice/u1-dog.mp3` —— **每个录音必然 404**，
  整条「预生成录音主通路」静默降级成设备 TTS，而那正是架构决策 7 的立身之本。
  ⚠️ **同一条根因还波及 `vite.config.ts` 本身**：base 缺省 `/` 时，
  构建产物的 JS/CSS 在 `/plantsgame/` 下也解析不到 —— 新项目一旦部署很可能是**整页白屏**。
  （旧的 v5.x 项目能正常部署，说明当时配过 base 或用了别的部署方式；本次重做把它丢了。）
  **延后理由**：属于部署配置而非朗读逻辑，且当前还没到部署节点；
  但**必须在任何一次 Pages 部署之前修掉**，不要等到部署完才发现白屏。
  修法：`vite.config.ts` 加 `base: '/plantsgame/'`，`RECORDING_BASE_PATH` 改接
  `import.meta.env.BASE_URL`（注意该文件在 core/ 之外，可以用 `import.meta.env`）。
  ——
  `vite.config.ts`、`src/services/pronunciation.ts:149`

- **`StartView` 点击 → `unlockAudioSequence()` 这条接线无测试覆盖** ——
  删掉 `onStart` 里那行调用、或删掉模板的 `@click`，95 个测试全绿，
  而 Android 音频从此永不解锁。AC-1 的用户可见那一半没有任何自动化覆盖。
  **延后理由**：补组件测试要先装 DOM 测试环境 ——
  `@vue/test-utils` 已在 devDependencies，但 `jsdom` 与 `happy-dom` **都没有**，
  `vitest.config.ts` 的 `environment` 仍是 `'node'`（该文件已就此留了注记）。
  装环境是项目级决定，不宜在 Story 1.2 顺手做。
  ——
  `src/views/StartView.vue`

- **五条「已处理但零测试覆盖」的分支** ——
  ① `AudioContext` 不存在 ② `new Audio()` 抛错 ③ `synth.cancel()` 抛错
  ④ `new SpeechSynthesisUtterance()` 抛错 ⑤ `getVoices()` 返回非数组。
  这些路径都有 try/catch 或 typeof 守卫兜着，逻辑是对的，只是没有用例。
  ⚠️ 其中 ③ ④ ⑤ 破坏的是本文件自己声明的「绝不把异常抛出去」契约 ——
  `src/app/audio-unlock.ts` 明确**不**在同步块外层兜异常（理由是「不得在此吞异常」，
  失败要可见），所以服务层一旦破约，第③步 `prewarmBgm()` 根本执行不到。
  **延后理由**：Story 1.13 要接上真实音效与 effects-runner，那时才是补这些用例的收口时机。
  ——
  `src/services/audio.ts:112-118`、`src/services/pronunciation.ts:209-228,568-570`

- **无 `webkitAudioContext` 回退** ——
  `unlockAudioSession()` 只认 `globalThis.AudioContext`。iOS Safari < 14.1（只有 `webkitAudioContext`）
  下整条 Web Audio 通路永久不可用，`getAudioContext()` 恒返回 null，且用户每点一次「开始游戏」
  就多打一条 `[audio] 浏览器不支持`。**延后理由**：目标平台是华为 Android 平板上的 Chrome，
  该场景不在 GDD/架构的目标平台范围内，spec 也未要求；Story 1.13 把 BGM 接到
  `getAudioContext()` 上时再一并评估。
  ——
  `src/services/audio.ts:37-43`

- **ESLint「禁 await」守卫只拦 `AwaitExpression`，`.then()` 的等价逃逸放行** ——
  `audio-unlock.ts` 的三步可以被改写成 `ctx.resume().then(() => { speakSilentWarmup(); prewarmBgm() })`，
  第②③步就落到微任务里、不再处于手势同步块 —— Android 解锁静默失效，而这正是这条守卫要防的失败模式。
  lint 全绿，`tests/scaffold/audio-unlock-guard.test.ts` 也全绿。
  **延后理由**：AC-10 明确把 selector 钉死成 `AwaitExpression`，扩它属于超出 Story 1.2 的 spec 范围；
  Story 1.13 要决定 effects-runner 的异步形态（它才真正需要在解锁链路之外写 `await`），
  那是收口的时机。
  ⚠️ 接手时要一并处理的**第二件事**：守卫测试目前只断言规则对象的形状
  （严重级别 + selector + 覆盖文件名单），**从不验证「有逃逸就报错」**。
  即便日后扩了 selector，也必须补一条变异式的反向验证 ——
  否则新规则可能配对了却根本没生效（Story 1.1 `[CR]` #7 踩过同一类坑）。
  ——
  `eslint.config.js:102-112`、`tests/scaffold/audio-unlock-guard.test.ts`

## Deferred from: 用户决策（2026-10-13）

- **Story 1.2 的 AC-8 真机验收（Task 7.4–7.7）整体延后** ——
  平板真机测试当前不便执行，用户决定遗留到后面做。
  **要拿的只有两样**：目标平板的 `speechSynthesis.getVoices()` 列表 + Chrome 版本号。
  桌面预验已于 2026-10-12 完成（长句正常、无两声重叠、无截断），
  但按 spec §13.5 不构成 AC-8 达成。
  **不阻塞 Story 1.3 及之后** —— `playPronunciation` 的代码侧已完备（113 用例全绿）。
  只卡两件事：① 1.2 置 `done` ② Story 3.4 的音色校准输入。
  详细记录见 story 文件的「真机验收记录」段。
  ——
  `_bmad-output/implementation-artifacts/1-2-音频解锁与-tts-朗读.md`

- **⚠️ `VOICE_PRIORITY` 的英式优先修法一并冻住 —— 不要在拿到真机音色名之前动它** ——
  桌面预验已证明现有精确匹配会失效：设备上叫 `Google UK English Female` / `... Male`（en-GB），
  而链上是精确匹配 `'Google UK English'` —— 该名字不存在，于是落到第二档
  `'Google US English'`，**有英式音色却拿到美音**。
  这与 GDD「上海版教材录音多为英式」冲突，属认读质量问题而非「能不能发音」。
  **为什么不现在改**：正确修法取决于目标平板上 Google TTS 实际提供的音色名
  （加名字 / 改前缀匹配 / 按真机名单补全，三种走法不同），
  而桌面 Linux 的证据不能代表华为平板。拿错了就是白改一轮。
  **恢复条件**：与上一条同一个 —— 拿到真机音色列表。
  ——
  `src/services/pronunciation.ts:67-74`（`VOICE_PRIORITY`）
