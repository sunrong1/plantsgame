# 延后工作

> ⚠️ **2026-10-15 文档治理标注 —— 本文件里的「Story 1.13」是重编号前的旧编号。**
>
> Epic 1 于 2026-10-14 从 4 个归并为 3 个，story 编号随之重排。**旧编号 1.13 = 音效与 BGM 接入，
> 现编号 1.14。** 所以本文件中凡写「Story 1.13 要接上真实音效 / effects-runner / BGM /
> 决定 effects-runner 的异步形态」处，**归属 story 是 1.14，不是 1.13**（现行 1.13 是 HUD）。
>
> 涉及条目：讲 `app/effects-runner.ts` 不在守卫名单内的两条、讲五条「已处理但零测试覆盖」
> 分支的延后理由、讲 BGM 接目标平台、讲 effects-runner 异步形态的条目。
> 见 [R-32](../../docs/rules/process.md)
> 与 `1-13-hud-阳光-心与进度.md`「裁决 1」的逐处对照表。
>
> **改这些条目时按 1.14 理解，但不要顺手改写原文** —— 原文保留作历史记录。

## Deferred from: code review of story-1-2-音频解锁与-tts-朗读 (2026-10-12)

### 第二轮 `[CR]` 三层并行审查新增（2026-10-12）

- **`views/` 不得直接 import `services/` 零强制，且测试把这个缺口钉死了** ——
  `eslint.config.js` 新块只配了 `no-restricted-syntax`，没有 `no-restricted-imports`；
  `tests/scaffold/audio-unlock-guard.test.ts` 里那条用例 `守卫有意不覆盖 views/`
  **断言了「无人守」这件事存在**。`app/effects-runner.ts`（Story 1.13 落地）同样不在守卫名单内。
  按 Task 5.4 属有意为之，不算违规 —— 但「同一个改动里新增了架构约束却无人守，
  还把无人守写成了测试预期」值得留档。Story 1.13 落地 effects-runner 时一并评估。
  ——
  `eslint.config.js`、`tests/scaffold/audio-unlock-guard.test.ts`

- ✅ **已修（Story 1.3 / AC-11，2026-10-13）** —— `vite.config.ts` 加了 `base: '/plantsgame/'`，
  `RECORDING_BASE_PATH` 改接 `import.meta.env.BASE_URL`，并新增
  `tests/scaffold/deployment-base.test.ts` 守卫（`vitest.config.ts` 同步设了
  `test.env.BASE_URL`，否则该守卫会假绿）。**销项，但部署前仍需真机确认一次** ——
  自动化只能证明路径推导正确，证明不了托管侧的配置。
  ——
  `vite.config.ts`、`src/services/pronunciation.ts` 的 `RECORDING_BASE_PATH`

<details>
<summary>原始记录（保留上下文）</summary>

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
  `vite.config.ts`、`src/services/pronunciation.ts` 的 `RECORDING_BASE_PATH`

</details>

- **`StartView` 点击 → `unlockAudioSequence()` 这条接线无测试覆盖** ——
  删掉 `onStart` 里那行调用、或删掉模板的 `@click`，95 个测试全绿，
  而 Android 音频从此永不解锁。AC-1 的用户可见那一半没有任何自动化覆盖。
  **延后理由**：补组件测试要先装 DOM 测试环境 ——
  `@vue/test-utils` 已在 devDependencies，但 `jsdom` 与 `happy-dom` **都没有**，
  `vitest.config.ts` 的 `environment` 仍是 `'node'`（该文件已就此留了注记）。
  装环境是项目级决定，不宜在 Story 1.2 顺手做。
  ——
  `src/views/StartView.vue`

  > ⚠️ **2026-10-15 文档治理更正 —— 延后理由已失效，但缺口仍然开着。**
  >
  > 上面这段「`jsdom` 与 `happy-dom` 都没有」**已不成立**：`jsdom ^30.1.2` 早在
  > Story 1.9 就装进了 devDependencies，且 `vitest.config.ts` 里那条「两个都没装」
  > 的过期注释**已被 Story 1.11 更正**。全局 `environment` 保持 `'node'` 是对的，
  > 组件测试逐个文件加 docblock 即可，见 [R-60](../../docs/rules/testing.md)。
  >
  > **所以：延后理由没了，这条缺口现在没有挡路的理由。** 实测确认
  > `unlockAudioSequence()` 函数本身**有**测试（`tests/services/audio.test.ts`），
  > 缺的是**接线** —— 没有任何测试渲染 `StartView.vue` 并点击。
  > 下个 story 接手音频时可直接补，见 [R-41](../../docs/rules/process.md)。

- **五条「已处理但零测试覆盖」的分支** ——
  ⚠️ **2026-10-16 `[CR]` 更新：③ 与 ④ 已有守卫，本条只剩 ①②⑤。**
  ① `AudioContext` 不存在 ② `new Audio()` 抛错 ⑤ `getVoices()` 返回非数组。
  ⚠️ ③ `synth.cancel()` 抛错 与 ④ `new SpeechSynthesisUtterance()` 抛错已由本轮 `[CR]`
  补上用例（`takeOverPlayback 抛错也不得冒到调用方`、`utterance 构造抛错也不得外抛`），
  且**顺带把两处真的补了 try/catch** —— 原先 `new SpeechSynthesisUtterance()`
  是在 try 之外裸构造的，残缺 polyfill 上抛错会一路冒到调用方
  （`store.ts` 的 `speakQuestion()` 刻意不加 try/catch，它逐字引用着本文件
  「绝不向调用方抛」的契约）。
  剩下的 ①②⑤ 仍只有 try/catch 或 typeof 守卫兜着，逻辑是对的，只是没有用例。
  其中 ⑤ 破坏的是本文件自己声明的「绝不把异常抛出去」契约 ——
  `src/app/audio-unlock.ts` 明确**不**在同步块外层兜异常（理由是「不得在此吞异常」，
  失败要可见），所以服务层一旦破约，第③步 `prewarmBgm()` 根本执行不到。
  **延后理由**：Story 1.13 要接上真实音效与 effects-runner，那时才是补这些用例的收口时机。
  ——
  `src/services/audio.ts` 的 `unlockAudioSession()` / `prewarmBgm()`、
  `src/services/pronunciation.ts` 的 `playRecording()` / `readVoices()`

- **无 `webkitAudioContext` 回退** ——
  `unlockAudioSession()` 只认 `globalThis.AudioContext`。iOS Safari < 14.1（只有 `webkitAudioContext`）
  下整条 Web Audio 通路永久不可用，`getAudioContext()` 恒返回 null，且用户每点一次「开始游戏」
  就多打一条 `[audio] 浏览器不支持`。**延后理由**：目标平台是华为 Android 平板上的 Chrome，
  该场景不在 GDD/架构的目标平台范围内，spec 也未要求；Story 1.13 把 BGM 接到
  `getAudioContext()` 上时再一并评估。
  ——
  `src/services/audio.ts` 的 `unlockAudioSession()` 里 `typeof Ctor !== 'function'` 那段

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
  ✅ **2026-10-16 `[CR]` 已补一半**：守卫测试新增了 `Linter.verify` 真跑一条
  用法层验证（对含 `await` 的文本求值并断言 `no-restricted-syntax` 真的报出），
  并补了「三个文件不在任何 `ignores` 里」「名单里的文件真实存在」两条 ——
  原守卫只读 `rules` 块，**从不读 `ignores`**，往 `eslint.config.js` 的 ignores
  里加一行就能让整条守卫失效而 13 条断言照绿（已实测）。
  **仍未解决的是第一件**：`selector` 仍只钉死 `AwaitExpression`，`.then()` 逃逸放行。
  ——
  `eslint.config.js` 末尾那条 `no-restricted-syntax` 配置块、
  `tests/scaffold/audio-unlock-guard.test.ts`

## Deferred from: 用户决策（2026-10-13）

- **Story 1.2 的 AC-8 真机验收（Task 7.4–7.7）整体延后** ——
  平板真机测试当前不便执行，用户决定遗留到后面做。
  **要拿的只有两样**：目标平板的 `speechSynthesis.getVoices()` 列表 + Chrome 版本号。
  桌面预验已于 2026-10-12 完成（长句正常、无两声重叠、无截断），
  但按 spec §13.5 不构成 AC-8 达成。
  **不阻塞 Story 1.3 及之后** —— `playPronunciation` 的代码侧已完备。
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
  `src/services/pronunciation.ts` 的 `VOICE_PRIORITY`

## Deferred from: code review of story-1-2-音频解锁与-tts-朗读 (2026-10-16)

> 本轮（第三轮 `[CR]`）的三层审查在**代码侧**共修了 10 条、判定 3 条为噪声。
> 下列 5 条是**修不动也不该在本 story 修**的，如实登记。

- **AC-6 的「TTS 点击后 ≤ 500ms 起声」零验证 —— 在当前工具链下不可验证** ——
  仓库里没有任何测试度量这个时间上界（实测 `grep -rn "起声" tests/` 无命中）。
  原因不是遗漏：`vitest.config.ts` 全局 `environment: 'node'`（R-60），
  Node 里没有真实的 `SpeechSynthesisUtterance` 可计时；而 spec §13.5 明令禁止
  用 headless 浏览器代替真机。
  **恢复条件**：与 AC-8 真机验收同批做（拿到平板 + Chrome 后一起）。
  若超标，`SPEECH_RATE_WORD` 与分块参数是调节手段。
  ——
  story 文档 AC-6 段落已加 `[CR]` 批注；`src/services/pronunciation.ts` 的
  `playPronunciation`（已全程同步，不引入额外 RTT）

- **`matchesGlob` 不支持字符类 `[...]`，在「守卫不能覆盖 save.ts」这条断言上会假绿** ——
  `tests/scaffold/audio-unlock-guard.test.ts` 里的转义集合把 `[` `]` 变成字面量，
  于是 `src/services/[st]*.ts` 这类写法对它是**不可见**的。
  实测：`minimatch('src/services/save.ts','src/services/[st]*.ts')` 为 true
  （ESLint 真的覆盖了 save.ts），而 `matchesGlob` 返回 false（守卫说没覆盖）。
  ⇒ 有人把守卫改成字符类写法时，`守卫不扩大到 src/services/ 的其他文件`
  与 `wouldCoverSave` **两条同时假绿**，而 Story 1.14 的 `save.ts` 会被误伤。
  **为什么本轮没修**：改 `matchesGlob` 会牵动它自己的 20 余条自测，
  风险大于收益；且当前 `eslint.config.js` 里没有任何字符类写法。
  **修法**：接手时对 `[...]` 加转义并补自测；或引入 minimatch 做交叉校验。
  ——
  `tests/scaffold/audio-unlock-guard.test.ts` 的 `matchesGlob`

- **R-55「每条 `expect` 带中文失败消息」在 Story 1.2 的三个测试文件里大面积欠账** ——
  实测统计 matcher 调用与其第二参数是否为中文消息串：
  `pronunciation.test.ts` 133 处里 112 处裸写、`audio.test.ts` 17 处**全裸**、
  `audio-unlock-guard.test.ts` 25 处里 23 处裸写。
  本轮新增的用例全部带中文消息，存量没动 —— 一次性改写 150 余处断言
  属于纯格式 churn，与本 story 的验收无关，且回归风险不为零。
  R-55 自述「无事故依据 —— 纯约定，被违反的代价是审查成本不是正确性」，
  所以定 P3。
  ——
  `tests/services/*.ts`、`tests/scaffold/audio-unlock-guard.test.ts`

- **AC-9 的七条「不越界」禁令零守卫** ——
  按 R-41「引入边界约束时要么给守卫要么明确记为暂不实现」，这里两条都没做：
  交付时靠人工复核（Completion Notes 有一行复核结论）。
  **本轮刻意不补守卫**：守卫若断言 `src/components/quiz/` 为空，
  **今天就会红** —— Story 1.11 已经合法建了 3 个卡面组件、Story 1.3 已经放了 38 个 mp3。
  那样的守卫不是「边界」，是「禁止下游 story 工作」。
  ⇒ 正确处置是**明确记为「交付时人工复核，边界随下游 story 合法扩张」**，本条即为该记录。
  真正的损失是「事后无法归因」：今日的 quiz 组件与 mp3 究竟是 1.2 越界还是下游合法扩张，
  只能靠 git 历史回溯。
  ——
  story 文档 AC-9 段与 Completion Notes 的 AC-9 复核行

- **两个疑似缺陷缺设备侧证据，未采信、未修** ——
  ① `isEnglish` 只认 `/^en[-_]/`，引擎若返回裸 `lang: 'en'`（BCP 47 合法）
  会判成「设备没有英文音色」。未在任何真实引擎上观测到该形态。
  ② 录音元素播完（`ended`）之后若再派发一个 `error`，会触发 TTS 把刚念完的词**再念一遍**。
  `playRecording` 的 `settled` 只在 `finish()` 里置位，`ended` 监听器不碰它。
  缺的是「真实浏览器上 `ended` 之后仍会派发 `error`」这一前提的实测。
  两条都在本轮审查的报告里（分别标 PLAUSIBLE），**未验证即不改** ——
  本仓库的教训是「看起来像 bug 的东西先问证据，别先写补丁」。
  ——
  `src/services/pronunciation.ts` 的 `isEnglish()` 与 `playRecording()` 的 `ended` 监听器

## Deferred from: code review of story-1-3-朗读录音批量生成 (2026-10-13)

- ✅ **已由 Story 1.6（2026-10-14）闭合** —— `parseEntries` 不在生成侧校验词条 id 的单元前缀 ——
  原本的 `scripts/data/voice-entries.json` 已**退役**，词表改从 `src/content/` 取
  （`generate-voice.ts` 的 `entriesFromContent(UNITS)`），
  单元前缀由 `UnitSchema` 的 `ENTRY_ID_PATTERN` 在内容层守。
  覆盖面随来源一起搬了家：`tests/scripts/generate-voice.test.ts` 里
  「每条 id 都合法 / 都带前缀 / 不重复」三条断言现在直接打真实内容层；
  并补了「内容层规则 ⊇ 运行时规则」「跨单元同名 id 被 `entriesFromContent` 拒绝」两条新守卫。
  `VALID_ENTRY_ID` 那份正则副本随之删除（不再有第二份规则需要等值断言）——
  留下它才是新的漂移种子。
  ——
  `scripts/generate-voice.ts`（`entriesFromContent`）、`tests/scripts/generate-voice.test.ts`

- 脚本缺 `--force` 与 `--help` ——
  改音色/语速后全量重生成目前靠手动 `rm public/assets/audio/voice/*.mp3`；
  三个 flag（`--dry` / `--only` / 即将有的 `--force`）只能读源码才知道。
  **为什么现在不补**：AC 未要求，`--dry`/`--only` 已覆盖本 story 的实际用法。
  **恢复条件**：Story 3.4「音频品质打磨」一旦真的调了音色或语速，
  手工 `rm` 的操作成本会第一次变成实际摩擦——那时一并加 `--force` 与 `--help`。
  ——
  `scripts/generate-voice.ts:445`

- `Failure.code` 是无区分的 `string` ——
  同一个字段混装网络哨兵（`NETWORK`）、HTTP 状态（`HTTP_500`）、
  业务码（`1002`）与合成类失败（`EMPTY_AUDIO`）四种性质的值。
  **为什么现在不补**：当前唯一的消费者是失败清单的字符串拼接，
  按类型筛选没有现实需求；此时改成 tagged union 会牵动全部构造点而零收益。
  **恢复条件**：Story 3.4 需要按业务码分类统计（例如「只有音色类失败才换音色」）时。
  ——
  `scripts/generate-voice.ts:107`

## Deferred from: story-1-4-战斗内核与-5-条数值断言 (2026-10-13)

> 🔥 **前两条**是被实测证伪的 GDD 结论（数值调优，属 Story 3.2）；
> **后三条**是必须让 Story 1.5 / `[CC]` 看见的口径移交（非数值问题）。
> 前两条 Story 1.4 **只测出来、写进测试、登记，刻意不改数值** ——
> 现在改 = 拿模拟器当试玩数据用，这正是 `decision-log.md` 三次手算错误的教训本身。
>
> 📎 [CR] 2026-10-13 修正：本引言原写「本节两条都是…」，与实际条目数不符，
> 且会让按「两条」略读的接手人恰好漏掉第 3 条（决定 Story 1.5 关卡能否正常失败的那条）。

- **直射塔「单塔恰好击杀 100 血僵尸」只在奇数列塔位成立** ——
  实测（§0.2，[CS] 2026-10-13，Dev 于 Story 1.4 复现确认）：
  ```
  列索引   1    2    3    4    5    6    7
  命中次数 2    1    2    1    2    1    1
  ```
  射程窗口是塔右侧 3 格，僵尸每回合走 2 格 ⇒ 它在窗口内**只可能落在偶数**索引**列**；
  塔每右移 1 格整个窗口平移 1 格。
  ⚠️ **[CR] 2026-10-13 模型修正**：原写「命中次数在 1 与 2 之间摆动，是塔所在列**奇偶性**的函数」
  —— 被自家事实表的最后一项证伪：**col 7 是奇数列却只有 1 次命中**。
  真因是 col 7 的窗口 (7,10] 被网格右缘裁剪到只剩 {8}（僵尸只在 col 8 踩中一次）。
  ⇒ 奇偶交替只是 **col 1–6 的局部规律**；col 7 与 col 0/8 由**入场列边缘裁剪**决定。
  若 Story 3.2 拿「奇偶性」当全列模型调数值，第五次手算错误就地诞生。
  col 0/2/4/6/7 上单塔打不死，僵尸带着 50 血走进房子；col 8 是 0 命中列。
  ⚠️ GDD 全文未记录这一点，而 Story 1.10 的建塔 UI 会让孩子**系统性地**建到
  打不死僵尸的塔位（塔图通常摆在靠右，看起来更靠前），而没有任何断言会响。
  **已做**：全列事实守卫锁进 `tests/core/combat.test.ts`（「AC-6」describe）。
  **为什么现在不修**：改它意味着改 GDD 首版数值（GDD `:238` 的「恰好 2 次」
  隐含「任意塔位都行」），而数值调优的权威 story 是 **Story 3.2**，
  它依赖真实试玩数据 —— 现在没有。
  **恢复条件**：Story 3.2 拿到试玩数据后，二选一 —— 调射程/速度让窗口恒含 2 个可达列，
  或接受「塔位有讲究」并把范围写进 Story 1.10 的 UI 引导。**不要在本层悄悄调。**
  ⚠️ **`[DS]` Story 1.10（2026-10-15）改了这条的后半个恢复条件**：塔位引导归
  **Story 1.12（建塔交互与射程预览）**，不是 1.10。1.10 只负责渲染战场与
  35 个合法塔位的**静态**可建性（`canBuildAt`），**没有任何建塔交互**，也就没有
  「引导」可写。两个理由：① 建塔交互（选卡 → 点格 → 预览）整体属 1.12 的 AC 范围；
  ② 塔位讲究依赖射程/速度最终数值，而那正是 Story 3.2 才定的 —— 现在写引导等于
  把一份待推翻的数字写进 UI。
  ⇒ Story 1.10 的实际处置：只把「哪一格能建」做成可查询的纯函数
  （`src/core/grid.ts` 的 `buildBlockedReason` / `canBuildAt`），
  供 1.12 直接消费；引导文案留给 1.12 依 3.2 的结论写。
  `[DS]` Story 1.10 完成的另一半（**塔位有效性本身**）见下条。
  ——
  `src/core/combat.ts`、`tests/core/combat.test.ts`、`gdd.md:238`

- **减速塔单独打不死僵尸：实测 75 伤害，GDD 声称 150 恰好击杀** ——
  GDD 原文（`gdd.md:234`）：
  > 「减速期间僵尸在射程内停留 **6 回合**，减速塔自己即可完成击杀（**6 × 25 = 150 > 100**）」

  实测（[CS] 2026-10-13，Dev 于 Story 1.4 复现确认）：
  减速塔 col3 命中 **3** 次 = **75** < 100，僵尸带 25 残血进房子，命中列 `[6, 5, 4]`。
  GDD 的「6 回合」是手算链「射程 3 格 ÷ 1 格/回合 = 3 回合/次减速 × 3 回合持续 × 刷新 = 6」
  推出来的，该链**忽略了僵尸已经越过窗口的一半才被减速到**。
  这是 `decision-log.md` 记录的第四次手算错误。
  ⚠️ **减速塔的伤害定位目前是悬空的**：GDD 说它「拖住僵尸，为其他塔争取回合」，
  而「自己也能击杀」这一条已被证伪 —— 若 25 伤害保持不变，同塔位配直射塔才是正解。
  **已做**：锁进 `tests/core/combat.test.ts`「减速塔单独打不死僵尸」，且
  **刻意不加**「减速塔能击杀」这类断言 —— 加了就等于把一个已被证伪的值焊死。
  **为什么现在不修**：同第 1 条，调数值属 Story 3.2。
  **恢复条件**：Story 3.2 依试玩数据决定减速塔伤害（**25 → 34 使 3 发合计 102 ≥ 100，
  溢伤 2、可击杀**；若要求「恰好 100」，单发整数伤害无解 —— 3 × 34 = 102 ≠ 100，
  而 100/3 不是整数，必须同时调命中次数或持续回合数）或持续回合数。
  注意 AR27「刷新而非叠加」在实测中**成立**，无需动。
  📎 [CR] 2026-10-13：原写「25 → 34 可让 3 次命中**恰好 100**」本身就是一次手算错误
  —— 在一个专门记录手算错误的文件里再埋一次，Story 3.2 照单执行会把错误数值焊进平衡表。
  ——
  `src/core/combat.ts`、`tests/core/combat.test.ts`、`gdd.md:234`

- **房子判定的两个口径，接手 Story 1.5 必读（[CR] D3 已拆成两个名实相符的函数）** ——
  AC-2 显式要求「越过」判定为 `col < HOUSE_COL`（即 `col < 0`）。
  但僵尸轨迹 `8→6→4→2→0` 落在**第 4 回合**，那一刻它正**站在** col 0（房子格上）——
  「踏上房子格」与「越过房子」相差一步。
  ⚠️ 原函数名 `hasReachedHouse` 判的其实是「越过」（`col < 0`），名字与判据相反 ——
  `if (hasReachedHouse(z.col)) loseHeart()` 是字面上最自然的调用，而 col 0 时它为 false，
  僵尸会站在房子上不掉心、关卡永不失败。**本 story 已按用户裁决（D3）拆开**：
  - `hasReachedHouse(col)`（`col <= HOUSE_COL`）：**踏上房子格** —— `turn.ts` 丢心用这个
  - `hasPassedHouse(col)`（`col < HOUSE_COL`）：**越过房子** —— 清场 / 移除用这个
  **恢复条件**：Story 1.5 实现 turn.ts 时把这两个函数接对口径，否则关卡不会失败。
  ---
  `src/core/grid.ts`、`tests/core/grid.test.ts`

  ✅ **已接对（Story 1.5，2026-10-13）** —— `turn.ts` 的丢心判据用 `hasReachedHouse`
  （`col <= HOUSE_COL`），AC-2 的清场口径继续留在 `hasPassedHouse` 未被本层调用。
  **变异验证（M3b）**：把它改成 `hasPassedHouse(zombie.col)` 后
  `tests/core/turn.test.ts` 26 条转红、`reducer.test.ts` / `assertions.test.ts` 同步转红，
  失败回合从第 6 回合整体后移 —— 口径接错一定会被看见。
  —— `src/core/turn.ts:99`

- ~~**GDD 正文的「圆形射程」段落残留，须走 `[CC]` 流程修订**~~ ✅ **已消歧（GDD rev 5，2026-10-15）** ——
  ~~`gdd.md:296` / `:310` 仍写着「塔的射程是圆形覆盖」，而权威口径是~~
  ~~`epics.md` FR38 + 架构决策 1（范围塔 = **同行 3 格条带**，放置预览才是圆）。~~
  ~~这是未被 `[IR]` 修订的 GDD 残留。Story 1.4 **刻意不改 GDD**（GDD 修订属 `[CC]` 流程）。~~
  ⚠️ 不修的后果：后续按 GDD 正文实现放置预览（Story 1.12 / AR43 / FR32）的人
  会把「圆形」误当成伤害判定形状 —— 那正是 AC-4.1 要防的 60 × 5 = 300 超模。
  ~~**恢复条件**：任意一次 `[CC]` 机会一并修订 GDD 正文这两处。~~
  📎 [CR] 2026-10-13 补登记：本条原写在 Story 1.4 Dev Notes §11 的移交清单里，
  但当时未落进本文件（该清单自称「须登记到 deferred-work.md」）。
  ——
  `_bmad-output/planning-artifacts/gdds/gdd-plants-game-2026-10-11/gdd.md`

  > 📎 **2026-10-15 结清（Story 1.12，用户授权）**：GDD 升 **revision 5**，
  > 上述两处正文按 `turn.ts:82` 消歧（同行单向窗口；非僵尸行整局不开火）。
  > 同时更正本条沿用多时的**过期行号 `gdd.md:296/:310`** —— 那是 revision 3 的行号。
  > 📎 **判据更正**：「GDD 修订一律走 `[CC]`」**过严且无成文来源**（GDD 自身无此条款，
  > 且 GDD 上一次修订 rev 4 是 `[IR]` 做的）。现行判据见 `CLAUDE.md`「GDD 正文修订」。

- **`scripts/balance-sim.ts` 的注释仍写着「真实模拟待 Story 1.4 落地」** ——
  与 `epics.md:741`（已后置到 **Story 1.5**）不一致。
  按 Story 1.4 Dev Notes §10 的明确指示，本 story **不碰**该脚本与注释。
  **恢复条件**：Story 1.5 落地真实模拟时一并更正措辞。
  ---
  `scripts/balance-sim.ts`

  ✅ **已更正（Story 1.5，2026-10-13）** —— 该脚本已从占位重写为**跑真实 `src/core/`**
  的模拟器（架构约束 10），文件头不再有「待 Story 1.4 落地」之类措辞。

## Deferred from: story-1-5-回合状态机与题单 (2026-10-13)

> 🔥 **前两条是文档更正，本 story 已按 AC-17 改掉，此处记录「改了什么、还有什么是真的没验证」** ——
> 门槛从 7 变成 4 是**结论变更**，不是措辞修正，别当成顺手改个数字。
> 后三条是代码层的事实移交。

- **失败门槛 7 → 4，且这个数字需要 Epic 1 试玩重新确认** ——
  `balance-scan.py` 的 `dict[col]` 覆盖 bug 每回合静默吞掉一只僵尸，门槛虚高。
  实测值（真实 reducer）：**开局连错 4 题 → 第 4/5/6 回合各掉 1 心 → 第 6 回合失败**；
  连错 3 题 → 掉 2 心仍通关（门槛的另一侧）。
  ⚠️ GDD 原先那句取舍「几乎只有完全听不懂才会输」是针对 7 写的，**降到 4 之后偏松了**。
  仍然接受高门槛的理由不变（塔跨回合持久、无「塔会消失」这类反直觉规则），
  但**门槛数字本身要试玩重新确认**。
  **为什么现在不调**：调数值依赖真实试玩数据，权威 story 是 Story 3.2，
  现在改 = 拿模拟器当试玩数据用 —— 这正是 `decision-log.md` 三次模拟器 bug 的教训本身。
  **恢复条件**：Epic 1 试玩。若 4 题门槛显得过严，第一顺位可调**起始心数 3 → 4** 或
  **开局前 2 回合不出僵尸**（两者都比放宽到 7 更贴近设计意图）；
  放宽门槛不是首选，因为它会同时抹掉「开局决定一切」这条性质。
  ——
  `gdd.md` 失败门槛段、`decision-log.md`「第三次模拟器 bug」、`epics.md` AR23

- **「递增阳光不改变失败门槛」现已无证据，且当前无法复测** ——
  该结论同样出自 `balance-scan.py`，而且它对照的「答对增量 100 / 造价 50」
  **从来不是 `BALANCE_TIERS` 的任何一档**（三档都满足 `sunPerCorrect === 最低塔造价`）。
  现在也跑不出来：`BALANCE_TIERS` 只填了单元 1-4 一档，单元 5+ 按 AC-3 **故意留空**
  （`tierForUnit()` 对未填档位必须抛错）。
  **恢复条件**：**Story 2.3** 往 `BALANCE_TIERS` 追加档位时，
  必须用 `npm run balance-sim`（真实 reducer）重测跨档位门槛曲线，不要再用 Python 模型。
  复测要看的具体变量是「**第一次答对能建几座塔**」——门槛是否移动全看它。
  ——
  `src/core/balance.ts`、`gdd.md` 经济段

- **[已解决 2026-10-14 · `[CR]` Story 1.5] `PLACE_TOWER` 没禁止建在房子格（col 0）与僵尸入场格（col 8）** ——
  > **已由 `[CR]` 补上两条规则**：`placeTowerIn` 现在拒绝 `col === HOUSE_COL` 与
  > `col === ZOMBIE_SPAWN_COL`，各配一条变异验证过的守卫。
  > 补的**理由比原记录更强**：col 8 的危害不是「门槛数字会变」，而是
  > `inRange` 单边 ⇒ 建在那里的直射塔/减速塔**永远打不到任何东西**，
  > 孩子花 50 阳光买到一个整局不动的塔，无报错、无红测试。
  > 下方原文保留作为当时的记录。
  >
  > 📎 **`[DS]` Story 1.10（2026-10-15）续办**：1.10 把「这一格能不能建」
  > 做成了组件可查询的纯函数 `src/core/grid.ts` 的 `buildBlockedReason()` /
  > `canBuildAt()`，并加了**逐格交叉断言**（`tests/core/buildable-cells.test.ts`：
  > 对全部 45 格比对 `canBuildAt` 与真实 `reduce()` 的接受 / 拒绝必须一致）。
  > 那里刻意**没有**改 `placeTowerIn` 去调它 —— 理由逐条记在 `grid.ts` 的
  > `buildBlockedReason` 注释里（会压扁那两条带因果的排查消息；且改 reducer
  > 越过本 story 的硬边界）。⇒ **漂移是被守住的，不是被消除的**：
  > 已变异验证过（摘掉入场格那条拦截 → 4 条测试变红）。
  > 剩下的「建塔交互与塔位引导」归 **Story 1.12**。

  AC-12 只列了三条规则（未解锁 / 格子非空 / 阳光不足），本 story 据此实现，没有多加规则。
  `tests/fixtures/level-driver.ts` 的建塔策略**主动排除**了这两列（`BUILDABLE_COLUMNS = [1..7]`），
  所以所有门槛数字都是按「不能建在这两格」测的。
  ⚠️ 若将来允许建在 col 0 / col 8，门槛数字会变 —— 已知实测：把可建列放宽到 `[0..8]`，
  门槛从 4 变成 5（col 0 / col 1 两座塔会打在同一目标上，白白浪费前两次购买）。
  **为什么现在不加这条规则**：AC-12 没要求，而多加一条会让「GDD 说能建就建得成」与
  实现不符；且 GDD 对塔位是否受限本身尚未定论（见上面「直射塔单塔击杀只在特定列成立」那条）。
  **恢复条件**：~~Story 1.10 建塔 UI 落地时确定塔位规则~~ —— **这条已被上方
  `[DS]` 2026-10-15 的 📎 接管并改写**：1.10 建的是战场渲染与塔位**可查询性**，
  建塔交互归 **Story 1.12**。重跑 `balance-sim` 这一半仍未做，
  因为 1.10 **没有改动任何平衡数值**（`costOf` / `inRange` / `ZOMBIE_HP` 一行未动），
  门槛数字不可能因 1.10 而变。
  ——
  `src/core/reducer.ts` 的 `placeTowerIn`、`tests/fixtures/level-driver.ts:31`

- **`turn.ts` 里「减速只施加给活着的僵尸」这个守卫没有任何测试** ——
  `[DS]` 2026-10-13 变异验证时改坏它（去掉 `if (wounded.hp > 0)`，让 `applySlow` 无条件跑）
  **全部 29 条 turn 测试仍然全绿**。已查实它是**等价变异体**：被减速的是已归零的僵尸，
  而 `selectTarget` 本身就跳过 `hp <= 0`，且剔除死者在 `stepZombie` 之前 ——
  没有任何可观测路径能看到差别。
  代码注释本身也没有把它说成行为约束（说的是「中间态多一次无意义的字段写入」），所以
  **没有假绿测试**，只是这条守卫不受保护。
  **为什么留着**：它是正确的防御写法，且未来若调整剔除时机（比如让塔能打「正在倒地的僵尸」）
  它会立刻生效。
  **恢复条件**：若将来引入「本回合已死但仍在场上」的中间态（例如溅射伤害链、复活机制），
  立刻给这条加断言 —— 届时它就不再是等价变异体了。
  ——
  `src/core/turn.ts` 的 `shoot()`

---

## Deferred from: code review of story-1-5-回合状态机与题单 (2026-10-14)

- ✅ **已由 Story 1.6（2026-10-14）闭合** —— **`Card` 扁平化丢掉了架构模式 B 的判别联合保证** ——
  `src/core/types.ts:216` 把 `Option` 定义为 `ImageOption | TextOption` 的扁平联合，
  `Card.options: readonly Option[]` 不按 `kind` 收窄。架构模式 B 规定的是判别联合
  （`kind: 'word' → options: ImageOption[]`），那种形状下 `{kind:'word', options:[{text:'…'}]}`
  是**编译错误**。
  **风险**：`kind: 'word'` 的卡带文本选项可以干净编译，`core/` 内没有任何运行时守卫拦住它，
  失败要到渲染层才暴露（图片卡渲染出文本选项）。JSDoc 给的理由（保留分支会诱导写
  `if (card.kind === 'word')` 分派逻辑）是真收益，但代价是把编译期不变量换成了内容层运行时校验。
  **已兑现的兜底**：`src/content/schema.ts` 的 `CardSchema.superRefine` 逐个选项判形态，
  报错定位到 `options[i]` 并带上卡型；正反两条都有测试
  （`tests/content/schema.test.ts` 的「单词卡配文字选项被拒（M3 的守卫）」
  与「真实存在的词条可以作选项（正向对照，防这条规则写反）」），
  变异 M3 已实测把该分支删掉会变红。
  ⚠️ **剩下的口子**：`core/` 内部自己造的卡（测试 fixture、`balance-sim` 的合成题单）
  仍不受这道闸约束 —— 它们不经内容层。Story 1.7 起渲染层消费真实内容后，这条才算真正封死。
  ——
  `src/content/schema.ts`、`tests/content/schema.test.ts`、`src/core/types.ts`

- **减速塔在当前数值下被完全支配** ——
  `npm run balance-sim` 的实测（Story 1.5 / `[CR]` 2026-10-14 复核）：
  ```
  直射塔 col 3   造价 50  伤害 50  命中 5 次  击杀 1 只  掉心 3 颗  z1 走过 2 格
  减速塔 col 3   造价 50  伤害 25  命中 7 次  击杀 0 只  掉心 3 颗  z1 走过 6 格
  ```
  同造价、伤害减半、击杀不更多、掉心不减，而轨迹显示**慢塔让 z1 多走了 4 格**。
  即减速塔目前是纯劣化，AR27 的取舍并不成立。
  ⚠️ 平衡模拟原本**打印着与自身数据相反的结论**（「减速换来的是 z1 少走的那几格」），
  紧邻的两条 trace 就是反证 —— 25 × 7 = 175 < 200 的算术摆在输出里没人算。
  已改为由实测数字推出结论（`dominated` 分支），不再写死叙事。
  **为什么不在这里改**：数值平衡参数（伤害/造价/减速系数）不在 `[CR]` 的改动权限内。
  **恢复条件**：Epic 3 战斗数值调优（3-2）时定夺方向 —— 要么给减速塔一个别的、
  真实存在的优势（多行？溅射？成本更低？），要么承认单元 1 阶段它不该进题单。
  ——
  `src/core/balance.ts` 的 `TOWER_STATS.slow`、`scripts/balance-sim.ts` 减速塔段

- **掉心数的夹取会让击杀恒等式误记，且当前无法构造出能触发的守卫** ——
  `reducer.ts` 的 `applyResolve` 用 `Math.max(0, state.hearts - heartsLost)` 归一化心数，
  而 `resolveCombatRound` 的文档明确写着 `heartsLost`「**可能大于剩余心数**」。
  消费者若用差值反推掉心数，少掉的那几颗就会被
  `kills += 前 − 后 − 掉心` **记成一次击杀** —— 一只抵达房子的僵尸凭空变成一次击杀，
  与 `decision-log.md`「模拟器不静默丢弃实体」那条教训同形，只是高了一层。
  **已修**：`tests/fixtures/level-driver.ts` 与 `scripts/balance-sim.ts` 两处
  都改为直接取 `resolveCombatRound(...).heartsLost`，不再反推。
  **但守卫写不出来**：`[CR]` 2026-10-14 先用随机种子复现过（6898 回合 4 次命中），
  那批种子用的是 0..8 列；补上「禁止建在房子格 / 僵尸入场格」之后重扫
  **20000 个种子、cols 1..7，一次都没触发**（连同回合抵达两只都没有）。
  ⇒ 这是一条**潜在**缺陷：防御性修复保留，但目前**没有测试能守住它**。
  写一个永远为绿的守卫比不写更坏，所以当时选择不写并如实登记在此。
  **恢复条件**：出现能逼出「同回合抵达 ≥2 只」的局面时立刻补断言 ——
  候选触发点有三处，任一发生即可：① 建塔策略放宽或改用别的塔型组合；
  ② 引入溅射 / 复活等让僵尸重叠的机制；③ `SLOW_FACTOR` / `SLOW_TURNS` 被调大到
  僵尸能被明显拖住、被拖住的那只正好让后一只追上。
  ——
  `src/core/reducer.ts` 的 `applyResolve`、`tests/fixtures/level-driver.ts`、`scripts/balance-sim.ts`

---

## Deferred from: story-1-6-内容数据层与单元-1-录入 (2026-10-14)

- **37 条词表撑不起「三型成规模」，关键词卡只有 1 张** ——
  AC-17 要求三种卡型都「成规模存在」，实测**只能**做到：单词 30、回应 **6**、**关键词 1**。
  ⚠️ **计数更正（`[DS]` Story 1.11 / T10.4，2026-10-15）**：原文写「38 条 / 回应 7」，
  与 `unit-01.json` 实数不符 —— **`node -e` 逐条数：entries 总数 37
  （`word` 30 / `response` 6 / `keyword` 1）**。差的那一条**不是被删了**，
  是当初数的时候把一条算重了；结论方向不变（关键词仍只有 1 张），
  但**凡引用「38」「回应 7」的地方都要跟着改**。
  原因是词池本身：37 条里只有「I have a ball for my dog.」这一句里含有池内词汇，
  其余句子（问候语、致谢）不含任何池内单词 —— 「听句取词」无词可取。
  做到 1 张已是当前录音池的上限（录音不可重生成，见下条）。
  **为什么不在这里解决**：要么补录录音（违不可逆约束 1），要么等 Story 2.x 扩词池。
  **恢复条件**：Epic 2 扩词池时，优先补「含池内词的句子」，并把本条改成回归守卫。
  ——
  `src/content/units/unit-01.json`、`docs/art-direction.md`

- **`AC-18` 与「每条录音都必须有卡面」在 `u1-s-good-morning` 上正面冲突** ——
  AC-18 要求短语「Good morning」不单独成卡；但架构约束要求每条 `entryId` 都有卡面，
  且卡面文本必须等于录音内容（录音**永不重生成**）。
  本 story 的处置：给它一张**回应卡**，题面就是「Good morning!」（GDD `:185` 的表格本就这么列），
  同时确保它在其余 6 张回应卡里以**选项**出现（全部是干扰项，正确答案另有其卡）——
  AC-18 的后半句（作为回应出现）由此满足。
  **为什么登记**：这是裁决，不是无争议的实现；`[CR]` 可能有别的读法。
  **恢复条件**：`[CR]` 若判「必须换实现」，改法是让该条目不再有卡面 —— 但那会破坏
  「每条录音都有卡面」这条更强的不变量，届时要连带重估。
  ——
  `src/content/units/unit-01.json`、`tests/content/unit-01.test.ts`（AC-18 那条断言带完整解释）

- **内容层的 DOM/Vue 边界只靠 ESLint，没有类型层兜底** ——
  `src/content/` 落在 `tsconfig.app.json`（有 DOM lib），而 `tsconfig.core.json` 的
  「零 DOM」硬约束**管不到它**。也就是说往内容层写一个 `window` / `localStorage`，
  `tsc` 不会报错，只有 ESLint 的 `no-restricted-globals` 会拦。
  若哪天有人改了 eslint 配置或漏掉某个文件，这条边界就是**静默**消失的
  （`tests/content/content-boundary.test.ts` 求值 eslint 配置来守，但守的是「规则存在」，
  不是「规则被改动过」）。
  **恢复条件**：想更硬时，可给内容层单独一个 `tsconfig` 项目（lib 不含 DOM）并让它被
  test 项目 `reference`（注意 TS6310：被引用的项目不能 `noEmit`）。
  ——
  `tsconfig.app.json`、`eslint.config.js`、`tests/content/content-boundary.test.ts`

## Deferred from: code review of story-1-6-内容数据层与单元-1-录入 (2026-10-14)

- ✅ **已闭合**（Story 1.8 / 2026-10-14）—— **占位词图把答案写成可见文字**
  原症状：每张占位图把自己的 `entryId` 当 `<text>` 画出来（30 张 × 3 = **90 个 `<text>`**）。
  `word` 卡的学习动作是「听音→识物」，四个选项只差这一个 ID 串，卡片退化成文本匹配题 ——
  正是它本该绕开的技能。原计划 defer 到 Story 1.8/1.9 逐张替换。
  **闭合方式**：不等替换，**先把字从图上剥掉**。判据从「替换了才算」改成
  「任何时候都不许有」—— 因为 Story 1.19 首次试玩是 Epic 1 的生死线，
  占位图只要还在文件里带着字，试玩结论就会被「答案直接印在选项上」污染，
  **而那是可以靠等替换来赌的**，赌输的代价是一次作废的生死线验证。
  1. `docs/art-direction.md` §1 新增「词图不得含 `<text>` / `<image>` / `<foreignObject>`」（裁决 2）。
  2. `tests/assets/asset-geometry.test.ts` 新增 **G10**，判据用 P2-2 新增的 `allTags()` 全量扫描器
     —— 旧的 `drawElements()` 压根不认识 `<text>`，用它写这条会得到一个**恒绿**的守卫。
  3. **守卫先于图**：G10 写完那一刻在 30 张占位图上恰好红 30 条，红完才改图。
  4. 25 张占位图剥掉 `<text>`，说明文字挪进 XML 注释（对角线灰纹 + 虚线框仍一眼可辨是占位图）。
     **`<text>` 从 90 降到 0**（改完 5 张正式插画后）。
  **证据**：变异 M19（三个标签各塞一个逐个拦 + 注释里的 `<text>` 不算违例）；
  `grep -o "<text" public/assets/words/unit-01/*.svg | wc -l` 真实输出。
  ——
  `public/assets/words/unit-01/*.svg`、`docs/art-direction.md`、`tests/assets/asset-geometry.test.ts`

- **`validate-content` 每单元跑两次 `UnitSchema.safeParse`** —— `scripts/validate-content.ts:331,163`
  一次为取 parsed，一次为取 problems。冗余但无害，当前 575 行内容下开销可忽略。
  **恢复条件**：若单元文件增长到解析耗时可见，再合并为单次。
  ——
  `scripts/validate-content.ts`

- **`cardCount` 直接赋值 `entryCount`** —— `scripts/validate-content.ts`
  两个统计量永远不可能不一致，因此永远测不出「card 数写错」。
  **恢复条件**：若将来引入「一 entry 多卡」的模型，这行必须先拆开。
  ——
  `scripts/validate-content.ts`

- **词图文件与 `tokens.css` 均缺文件尾换行** —— `src/styles/tokens.css`
  ⚠️ `[CR]` 2026-10-14 订正：本条原写「词图文件**与** tokens.css **均**缺」，
  但 30 张词图里 28 张**一直是有**尾换行的（已逐一核对 baseline 与当前磁盘），
  措辞不准确 —— 实为：`u1-three.svg` / `u1-happy.svg` 在本 story **丢了**尾换行（已补回），
  真正还缺的是 `tokens.css`。纯格式，无功能影响。
  **恢复条件**：接入 formatter 时一并解决。
  ——
  `src/styles/tokens.css`

## Deferred from: code review of 1-8-单元-1-词图-第一批 (2026-10-14)

- **`svgRootTag()` 对「无引号属性值里含引号字符」返回 `null`** —— `scripts/validate-content.ts`
  XML 允许 `aria-label=dog's toy` 这种写法。新的引号感知扫描器会把**属性值之外**的孤立引号
  也当作引号区开头，于是永远匹配不到 `</svg>` 前的那段开标签，返回 `null` ——
  于是 `viewBox`/`width`/`height` 读成 `null`，`validate:content` 对一个**合规文件**
  报「读不到 viewBox」。等于在同类输入上把「截断 bug」换成了「引号 bug」。
  **恢复条件**：真出现「从工具导出且属性未加引号」的资产时再修。
  （Edge Case Hunter 对该函数做了单双引号 / 混合引号 / `>` 前置 / 未闭合引号的正反向探测，
  **未复现**该路径，故仅登记不作为缺陷处理。）

- **`u1-dog` 的「远侧耳朵」在 48px 下约只剩 1.9px** —— `public/assets/words/unit-01/u1-dog.svg`
  耳朵 `cx=344 rx=46`（x ≈ 298–390）画在头 `cx=300 rx=70`（x = 230–370）**之前**，
  露出来的只有 x ∈ (370, 390] 这一小截，折算到 48px 约 1.9px。
  而本批每条美术决策都以「48px 下还认不认得出」论证，它也是返工后**明确保留下来的三样之一**，
  会被当成范本带进 Story 1.9 的 25 张。
  **恢复条件**：~~与 §5 构图模板一并复核（Story 1.9 开工前）~~
  —— ✅ **已复核（`[DS]` Story 1.9, 2026-10-15，用户裁决）：保留。**

  **结论与理由**：保留，但**明确定位为「≥180px 档的质感」，不承担任何识别功能**。
  1. **它不参与剪影判据** —— 耳朵在头**之后**，只露右侧一截，48px 下不影响
     「这是只狗」这个判断（真正的剪影负担在近侧耳朵、口鼻长度、胸口奶白块，见
     `1-8-…md` 的 6 个失败版）。
  2. **它不改变任何实算值** —— G11 / G12 / G13 跑 `u1-dog` 得 82.3% / 38px，
     与 `[CR]` 独立实算的黄金值**一字不差**（AC-4 容差 0.5pt / 2px），
     说明这截耳朵落在包围盒内部，删或留都不动判据。
  3. **删它是对已 CR 通过资产的无谓返工** —— 1.8 已经为它做过四版返工，
     它是返工后明确保留的三样之一。

  ⚠️ **代价是明写下来的**：若日后有人拿这一截当「细节越多越好」的范本，
  200–400 张词图里每张都会多出看不见的图层。**判据见
  `docs/art-direction.md` §5「48px 可读性地板」—— 低于该地板的细节只能当质感，
  不许承担识别功能。** 这条不是缺陷，是一条已定的美术判据。

---

## Deferred from: story-1-11-三种卡型与答题交互 (2026-10-15)

### 裁决 2 的移交：「正确项加载失败 ⇒ 整题过滤」不在 1.11 实现

- **要什么** —— 词图**正确项**加载失败时，整道题不该让孩子去点一个已经
  「灰掉、点不动、看不出是什么」的选项；应当把整题从题单里滤掉，换一题。
- **为什么不在 1.11 做（三条，按硬度排序）** ——
  ① **机制上做不了**：判定「加载失败」要**异步预取**（先 `new Image()` 试载），
  而 `enterLevel()`（`src/app/store.ts`）被**架构硬约束 8** 锁死为**同步** ——
  三步音频解锁之间一个 `await` 都不许有（Android 踩坑的产物）。
  ⇒ 「进关时预检 30 张图」这件事**与解锁时序直接冲突**，不是排期问题。
  ② **开发环境触发不了**：1.11 交付时 30 张图**全部在磁盘上**，
  `npm run validate:content` 与守卫 G22（逐张验 base 前缀 + 磁盘存在）都过。
  要触发它，得先**人为弄坏一张图** —— 那是测试夹具的事，不是产品路径。
  ③ **不做比做一个没人调用的纯函数强**：⚠️ **本 story 刻意没有写
  `isCardUsable()` 这样的空函数占位。** 理由与 `src/app/store.ts:107-115`
  拒绝写 `runEffects` 空函数完全同一条：「空函数会让调用点看起来『已经接上
  副作用链路』，而实际上没有任何东西会调用它」。一个没人调的函数，
  在 code review 里比没有更危险 —— 它看起来是已完成的。
- **1.18 在哪里接手** —— Story 1.18（真机与离线校验）。**前提是硬约束 8 要先有出路**：
  要么音频解锁完成之后再做一次异步预检（把预检**挪到解锁之后**，
  前提是那之后不需要同步），要么把降级判定改成**不依赖预取**
  （如 `OptionCard` 在正确项 `failed` 时 `dispatch` 一个 `SKIP_QUESTION`）——
  后者不碰解锁时序，是**更可能的方向**，但它需要 core 有一个新 action，
  属 1.18 的裁决，不在本 story 预判。
- **本 story 已交付的降级（不是这个，是那个）** ——
  `OptionCard.vue` 对**任意**选项的图片失败都做了 `console.warn('[content] …')`
  + 内联占位图形 + `disabled`（守卫 G28 逐条钉住）。**那一半是做完了的。**
  缺的只有「正确项失败 ⇒ 换题」这一半。

### 断网情形的移交（AC-B4 + AC-B5）
- **AC-B4（词图在断网下仍可用）** —— 本 story **用真实机制兑现了**，不是降级：
  120 张词图是**仓库里的静态文件**，随站点一起部署，走的是同源相对 URL。
  断网时**只要站点本身已缓存**（PWA service worker）词图照常加载；
  若站点未缓存，**全部 120 张一起失败**，每张都降级为内联占位图形
  —— 回合流转不受影响（NFR12），但**没有一张能认出是什么词**。
  ⚠️ **据实说明：AC-B4 在 1.11 的验收形态是「机制成立 + 失败路径有守卫」，
  不是「实测断网仍可辨认」。** 真机断网验证归 1.18。
- **AC-B5（TTS 失败时降级到预录录音）** —— 本 story **实测到了录音路径**：
  真浏览器里计数 `HTMLMediaElement.prototype.play`，
  「换卡自动播」1 次、「连点重听」3 次、**每次都是 `u1-dog.mp3`（预录）**，
  `speechSynthesis.speak` 调用数为 **0**。
  ⇒ 单元 1 的题面**本来就走预录**，TTS 链路一次都没被触发 ——
  **这既证明了降级通路是主通路，也意味着 AC-B5 在单元 1 上没有被真正压测过**
  （要压它，得拿一张没有录音的卡）。
  交接给 1.18 的动作：**在真机飞行模式下打开一道没有预录录音的卡，
  确认回落到 `speechSynthesis` 且仍然发声**；再断网确认静音也不阻断回合。

---

## Deferred from: story-1-12-建造-阳光与射程可视化 (2026-10-15)

### 裁决 1 的文档登记（六处，AC-H2）

**这一节的共同前提**：`turn.ts:82` 的 `towers.filter((tower) => tower.row === ZOMBIE_ROW)`
是**实际代码**，它意味着**只有僵尸所在那一行的塔开火**；
而下面五处文档都写着「射程是圆形覆盖，所以上下相邻行也能打到中间行」。
**那个机制从未存在。** 1.12 的裁决（story §0 裁决 1）是：
**以实现为准，预览画「若种在那儿，实际能打到哪些格子」，落空的行用整行压暗表达。**
⚠️ 本 story **不改战斗判定**（「相邻行能不能开火」是 `[CC]` + Story 1.19 重验的事），
只登记文档口径。

| # | 处置 | 位置 | 本 story 的依据 |
|---|---|---|---|
| 1 | **作废**「放置覆盖：半径 3 的圆（与直射塔一致）」 | `game-architecture.md:245-246` | 实现是 `coverCellsAt`（`src/core/build.ts:184-215`）：`direct/slow` = `inRange` 单向窗口、`aoe` = `aoeColumns` 横向条带、`row !== ZOMBIE_ROW` = 空集。守卫 G30 逐格比对，M57/M58/M71 实测 3/2/2 红 |
| 2 | **消歧**「圆形覆盖 ⇒ 相邻行能打到中间行」/「射程形状：圆形」 | `gdd.md` 两处正文 | `turn.ts:82`。**✅ 正文已改（GDD rev 5，2026-10-15）** —— 见下方批注 |
| 3 | **消歧**「种在上下相邻行的塔也能打到中间行」 | `epics.md:1014` | 同上。1.12 的做法是让这件事**在画面上可见**：非僵尸行整行压暗（AC-E3），真浏览器实测该行亮度 **−10%**（`rgba(0,0,0,0.1)`） |
| 4 | **改判据**「范围塔须同时画两套形状（放置覆盖圆 + 实际伤害条带）」 | `epics.md:1134` | 「两套形状」的前提不存在。1.12 画**一套**（真实伤害形状），空集合改用整行压暗表达。守卫 G30 + M58 |
| 5 | **改判据**「权威口径是同行 3 格条带，**放置预览才是圆**」 | 本文件上方那条 1.4 移交项（它自己也这么说） | 同一个来源说同一件事。**不改这一条，下一个读本文件的人会读到一条已被作废的口径** |
| 6 | **改判据**移交项②「支撑 AR43 的**两套形状**」 | `_bmad-output/implementation-artifacts/1-10-战场渲染与网格.md:623②` | 同 4：AR43 的「两套形状」没有实现基础 |

**GDD 正文残留 —— ✅ 已于 2026-10-15 由 GDD rev 5 结清** ——
原状态：`gdd.md`（「射程是圆形覆盖，因此种在上下相邻行的塔也能打到中间行」）
与（「射程形状：圆形，以塔为中心覆盖半径 3 格（含斜向）」）
的**正文**仍这么写，而 `turn.ts:82` 的权威口径是 `towers.filter((t) => t.row === ZOMBIE_ROW)`。
本 story 执行时**原本刻意不改 GDD 正文**（认定 GDD 是 `[CC]` 的地盘）；
**事后按 `CLAUDE.md`「GDD 正文修订」判据改为直接消歧，并经用户授权**：
正文三处已改（第二处的射程形状、第三处「选中卡片时，所有空格子…」的预览范围），
**未改任何设计决定** —— 逐字保留原意，只把「圆形」纠正为同行条带，
并明确「种在非僵尸行的塔整局不开火」。

**仍然挂账的只有第 1 条**：`game-architecture.md`「放置覆盖：半径 3 的圆（与直射塔一致）」
—— 本 story 没有改它，仍按原口径走 `[CC]`。

> 🚨 **过期引用的来历（保留作史料）**：
> 本文件那条 1.4 移交项把位置记成 **`gdd.md:296` / `:310`** ——
> 那是 **GDD revision 3 的行号**，其后每次改稿都会整体位移。
> ⇒ **引用文档一律用原文句子，不用行号**（`CLAUDE.md` 已把这条钉成硬规则）。
> （口径描述「范围塔 = 同行 3 格条带」本身仍成立；
> 其中「放置预览才是圆」这一半已按裁决 1 作废 —— 预览画的是真实伤害形状。）


### AC-C3 的出口：单词卡两行装不下（1.12 已改判据，登记在此备查）

- **实测**（Chromium 1223 / 800×1280 / 全量 37 张卡）：手牌卡文字可用宽
  **108px**（132 卡宽 − 2×10 padding − 2×2 border），`--text-tower-label: 18px`，
  最长整词 `afternoon!` = 94.33px = 5.240em ⇒ **硬上限 fs ≤ 20.6px**，余量 14.5%。
  折行分布 **31 张一行 / 5 张两行 / 1 张三行**；那张三行卡是
  `I have a ball for my dog.`（25 字符）。
- **两行钳下它被截断，且 Blink 的 `-webkit-line-clamp` 会自动补 `…`** ——
  孩子读到的是「I have a ball for m…」。1.12 把行钳改成 **3 行**（偏离登记第 5 条），
  37 张全完整、0 截断。
- **留给真机的**：`tokens.css:233-254` 那段「1.12 的条件句」的实测依据写在
  `HandCard.vue` 的「实测」块里；**真机字号校准仍属 Story 1.18**
  （GDD `:557`「型号确定后本表数值随之校准」）——
  换机型后要重量「最长整词宽」，硬上限仍是 **108px / 该词的 em 宽**。

### `--color-overlay-inert: rgba(0,0,0,0.1)` 的感知强度未在真机判定

- 实测（Chromium 1223，屏幕像素采样）：非僵尸行 **−10% 亮度**，
  不可建格竖带 `--color-overlay-blocked` **−18%**，
  射程覆盖 `rgba(255,255,255,0.3)` 把车道提亮 **+5.6%**（215,204,200 → 227,219,216）。
  ⇒ AC-E3 要求的「形状不同（横带 vs 竖带）+ 深浅不同」两条**都成立**。
- ⚠️ 但「−10% 在一块真平板上够不够明显」**不是像素能判的** ——
  同一块 α 在高密度屏、低亮度环境、以及色觉差异下观感不同。
  **1.19 真机试玩**要盯的就是这一条：孩子能否在**不看文字**的情况下
  读出「只有中间那一行能建塔」。若不够，下一档往 `--color-overlay-blocked` 靠
  （0.1 → 0.14 之内，仍满足「明显更轻」）。

### 手牌区横排的滚动距离（37 张 ≈ 8 屏多）

- 实测：卡区 `clientWidth` = **669px**，37 张时 `scrollWidth` = **5348px**
  ⇒ 一次只能看 **4 张整卡 + 第 5 张露头 76.56px**，全程要横滑 **8 屏以上**。
- 这是**裁决 2 的已知代价**（单元 1 就有 37 词条，全年 200-400），
  1.12 不改（分组 / 筛选 / 竖排都属产品决定，不是 UI bug）。
  **1.19 真机试玩**要问孩子的是「第三关之后还找得到我那张卡吗」。

## Deferred from: QD 文档治理 §1-§3 (2026-10-15)

处置：`_bmad-output/implementation-artifacts/spec-doc-governance.md`（status: in-progress）。
本次只做 §1-§3，以下两项**明确划到范围外**，未开工。

### 记忆侧仍有一份重复的规则正文（在仓库外，story 改不到）

`docs/rules/README.md` 立了 R-37「判据只写一份」，但
`~/.claude/projects/-root-repos-plants-game/memory/` 下的记忆文件里
仍有若干条**成文规则正文**（变异验证纪律、实测值优先、跳过必须验哈希、`flush:'sync'` …）。

- **为什么这次没动**：那些文件在 `~/.claude/`，**不在本仓库 git 管辖内**，
  BMAD story 的产物约定与提交约定都覆盖不到；且它们是跨仓库复用的经验，
  与本项目的 R-ID 未必一一对应。
- **要做什么**：逐条判定「是通用经验（保留）还是本项目专属（改成 R-ID 引用）」，
  后者从记忆正文删掉、只留一句指向 `docs/rules/`。
- **注意**：改记忆文件不产生 git 记录，**改完没有 review 能看见** ⇒ 需单独留痕。

### BMAD 模板侧的流程改造（§4）—— 2026-10-16 已评估：**不做**

**结论**：`gds-quick-dev` 2026-10-16 走完整套取证后判定**不实施**。本条销项，
但下面的取证结论与落点地图保留 —— 那是这次唯一的实际产出。

**更正本条此前的两处失实**（文档治理留下的活错信息，性质同 R-37 漂移表）：

- 原文写「`.claude/skills/` 与 `_bmad/` 下 GDS 技能的 step 文件」——
  **`_bmad/` 下一个 step 文件都没有**（实测 `find _bmad -name 'step-*.md'` 返回 0）。
  工作流正文只存在于 `.claude/skills/`。
- 原文写「`_bmad/` 是安装器管理的，改动可能被升级覆盖 ⇒ 需要先确认覆盖策略」。
  覆盖策略已确认，且结论是**双向的**：`_bmad/` 侧只有配置进 git，
  **`.claude/skills/` 整个目录被 `.gitignore` 忽略**（注释写「BMAD 安装器复制的技能（可重装再生）」）⇒ 直接改 step 文件不留任何 git 记录，评审看不见，升级即抹掉。
  顺带查出：现有 R-37 守卫的 `SKIP_DIRS` 含 `_bmad`（注释「BMAD 安装器管理，不归本项目规则管」），
  即 R-37 对 `_bmad/custom/` **完全失明** —— 我们自己写的覆盖文件不在它的检查面内。

**可行的唯一载体是 `persistent_facts`，但它没有牙齿**：

- BMAD 有 3 层 customize，第 2 层 `_bmad/custom/<skill>.toml` 被 git 跟踪
  （`_bmad/custom/.gitignore` 只忽略 `*.user.toml`），机制**已实测跑通**
  —— `gds-dev-story.toml` 现有的测试纪律 fact 能被 `resolve_customization.py` 合并出来。
- 但它就是**一段交给 agent 读的散文**。BMAD 自己对超出暴露面的意图，
  `bmad-customize` Step 3 的原话是「offer `persistent_facts` as approximations」—— 它承认这是近似手段。
- 「让 `[DS]` 的产出模板带 R-ID 字段」**根本做不到**：模板交换（`*_template`）只对 11 个技能开放，
  `list_customizable_skills.py` 实测 `gds-create-story` / `gds-dev-story` 都不在其中。

**不做的四条理由**（按分量排序）：

1. **改坏会长期生效**。override 文件跨每一次 BMAD 运行活着。fact 写歪了不是当次 story 的问题，
   是之后每个 story 都被喂一句歪指令。而这四段散文**没有守卫** ——
   守卫只能查「有没有抄规则正文」，查不了「说得对不对」。
2. **治的是症状不是那条链**。真正的源头是默认指令
   `Store extracted project rules as {{project_rules}} for embedding in the story file`
   → `Populate the Project Context Rules section with ALL extracted`。
   加一条相反的散文，默认指令并没有消失；两者打架时 agent 听谁的没有保证。
3. **守卫价值有限**。「override 里不该有规则正文」是真检查，但只可能在自己抄错时红；
   「4 个覆盖文件得有 fact」是守刚写的文件，防的是将来有人删。都不是「改造有效」的证据。
4. **铺开四个工作流时「四段措辞必须互不相同」只有人工能验** ——
   照抄四遍就是用模板治理的外壳复活这条规则要消灭的复制链。

**不做也不闷声**：复制链今后若重新长出誊抄段，R-37 守卫会红、评审会发现。
可见但不主动 —— 这是可接受的现状。

**誊抄落点地图（取证所得，留给下一个要写 story 的人手写规避）**：

| 技能 | 落点小节 | 触发它的默认指令（可 grep） |
|---|---|---|
| `gds-create-story` | 模板的 `### Project Context Rules` | `Populate the Project Context Rules section with ALL extracted` |
| `gds-create-story` | `## Dev Notes` | `Testing standards summary` |
| `gds-dev-story` | `Dev Agent Record → Implementation Plan` | `Document technical approach and decisions in Dev Agent Record` |
| `gds-quick-dev` | spec 的 `**Always:** INVARIANT_RULES` | 模板三段约束占位，无对应反誊抄条款 |
| `gds-code-review` | finding 的 `detail` 自由散文 | 风险最低 —— finding 格式天然是 `[file:line]` 引用式 |

两处**已存在的反誊抄条款**（唯一的两处）：

- `gds-quick-dev/compile-epic-context.md` 有 `No full copies.` 与
  `Describe by purpose, not by source.` —— 但作用域**只覆盖 `epic-<N>-context.md`**，
  同技能的 spec 本体（`**Always:**` 那段）无对应约束。这是一个不对称。
- `gds-quick-dev/spec-template.md` 的 frontmatter `context: []` 注释写
  「only what isn't already distilled into the spec body」——
  这是现成的引用钩子，写 R-ID 清单放这里最自然。

**恢复条件**：① BMAD 上游给 GDS 工作流开模板交换（届时 `[DS]` 模板字段可真正加 R-ID 列）；
或 ② 誊抄段在真实 story 文档里重新出现两次以上（说明散文式覆盖顶不住）。
两者都不满足就不要重开 —— 重开一次仍会以同样的四条理由退回。

### 评审转来：Story 1.13 文档的 AC / 守卫设计问题（5 条，非本次治理对象）

来源：QD 文档治理的三个评审 subagent。其中 `1-13-hud-阳光-心与进度.md` 是 `[CS]` 的产物，
本 QD 只是把它随 commit 带进仓库（见该 spec 的 Spec Change Log 第 6 条），**不对它的内容负责**。
但这几条有实质分量 —— 前三条会让 `[DS]` 的变异验证**首跑就 0 红**，与 1.11 / 1.12 的假绿同型。

| # | 问题 | 为什么严重 |
|---|---|---|
| M98 | G52 判「一次掉 2 心 ⇒ **恰好 2 个** 动画 class」，把 `flush:'sync'` 变异回 `pre` | `pre` 把同步连发合并成一次回调，但 `lostSlotIndexes(prev=3, now=1)` 照样返回 `[1,2]` ⇒ **两种 flush 下 class 数都是 2**。只有**时刻**可区分，判据测的是计数 ⇒ 首跑 0 红。1.12 已实测过这个 flush 陷阱 |
| G43c | 用「`hearts === HEARTS` 与 `hearts < HEARTS` 两种 fixture 下 DOM 不同」区分 `v-for="i in 3"` 与 `heartSlots(state)` | **两种实现在两种 fixture 下 DOM 都不同** ⇒ 渲染完全一致，断言恒绿。真正能区分的只有源码层（模板里是否出现字面量 `3`） |
| M99 | 变异是「`applyAction` 里 `progress` 更新两次」 | T4.2 只让赋值**一次** ⇒ dev 必须**额外违反 T4.2** 才能构造出这条变异。变异设计与任务说明不一致 |
| R-12 | AC-D3 / AC-H1 反复援引「既有 `--color-*` 值一个都不许改」当会红的判据，并给 M95/M97 配了变异 | **R-12 目前零守卫** —— `palette.test.ts` 只断言 token 存在与对比度，`asset-geometry.test.ts` 的 G3 只守「等于当期值」。改了 `tokens.css` 全绿 ⇒ M95/M97 会 0 红。要么补冻结值守卫，要么 AC 里如实写明「依赖 code review」 |
| R-31 | 1-13 有约 60 处 `file:line` 引用 | 与 R-31「引用用原文句子不用行号」冲突。1.4 留的行号已实测失效过一次，1.12 又实测一次 —— 现行 revision 里已不是那个行号 |

**处置** `[DS]` Story 1.13 时逐条裁决，裁决前**不要**把 M98 / M43c / M99 写成「已实测为红」。
更省事的替代：M98 改测「两次 class 写入的时刻差」；G43c 改成源码型断言（模板不出现字面量 `3`）。

### 评审转来：`.claude/settings.local.json` 有失效的 Bash 授权路径（**未修，等人定**）

第 43 行的 allowlist 指向 `_bmad-output/implementation-artifacts/1-5-回合状态机与题单.md` ——
该文件已随本次治理 `git mv` 进 `archive/`，这条授权**运行时 ENOENT**。

**为什么没修**：那是权限配置文件，改它应由人决定。而且 `settings.local.json` 是个人本地文件
（不入库），改了对别人无意义、也不进 review。

**要做什么**：把路径改到 `_bmad-output/archive/1-5-…`，或直接删掉这条授权
（下次 `[DS]` 用到时会让工具重新提示授权）。**注意仓库里没有任何测试会发现这类失效路径** ——
CI 不读 `.claude/`，守卫的 `SKIP_DIRS` 也跳过了它。

## Deferred from: story-1-12-建造-阳光与射程可视化 `[CR]` (2026-10-16)

### 1. 🚨 `epics.md` AR43 与 `game-architecture.md` 仍写着「半径 3 的圆」——**冲突未消解**

GDD rev 5 已经在 `[DS]` 阶段把自己的三处射程描述改掉了，**但另外两份没有**：

- `epics.md` 的 **AR43**：「范围塔须能同时画两套形状：放置覆盖（**半径 3 的圆**，
  与直射塔一致）与实际伤害（横向 3 格条带）」
- `game-architecture.md`：「**放置覆盖**：半径 3 的圆（与直射塔一致）」

而 `CLAUDE.md` 写明「**epics 的 AC 正文才是事实源**」⇒ 这是一处**仍然开着**的冲突，
不是「文档追认事实」能覆盖掉的（AR43 是 AC，不是正文描述）。

**[CR]` 裁决 6 之后这件事更尖锐了**：非僵尸行整行不可建，
「斜向覆盖到中间行」连讨论价值都没有 —— 塔只可能在僵尸行上，
而僵尸行的射程必然是**同行**的。AR43 要求画的第二个形状，
在当前的放置规则下**不存在**。

**为什么 `[CR]` 不顺手改**：改 AR43 是改 AC，本仓库对 AC 的改动要走 `[CC]`，
而 `[CR]` 的边界是评审交付物里的缺陷。**改 AC 混进一次 CR，
下一次就分不清「这条 AC 是设计定的还是评审顺手删的」。**

**建议的下一步**（需用户裁决）：AR43 是要**作废**（射程只有一套形状，
因为「放置覆盖」与「实际伤害」在同行规则下本就重合），
还是**保留**并附条件（「若将来让相邻行开火，则需两套形状」）？
后者与「相邻行能不能开火」这个更大的问题绑在一起，属 1.19 重验范围。

### 2. 裁决 6 的平衡后果需要 1.19 复核

合法塔位从 **35 格降到 7 格**。`assertions.test.ts` 的 5 条数值断言与
`balance-sim` 此刻仍全绿（因为战斗判定一个字没改，太阳经济也没动），
但**可建格的稀缺本身就是一个新的难度维度**：
7 格意味着每回合几乎只能放一座塔，而僵尸是持续推进的。

⚠️ 本条**不阻塞** 1.19，但 1.19 验难度曲线时必须知道
「35 → 7」这条已经被裁决锁死了，不要在验曲线时把它当成 bug 顺手「修回去」。

### 3. 「G33b 偶发假红」——**未复现，未解决**

Acceptance Auditor 报告「15 次完整运行里有 1 次 G33b 假红」。本次 `[CR]` 的处置：

- 连跑 **12 次完整测试套件，全绿**，未能复现。
- `g33bViolation` 是**纯函数**（入参是模块级 `?raw` 字符串，无共享可变状态、无缓存），
  唯一的可疑机制（`?raw` 在并行 transform 下返回空串）
  会让 `code.includes(identifier)` 更少命中 ⇒ **造成假绿，不是假红**。
- ⇒ 原归因（「`?raw` transform 缓存竞态」）与症状方向**对不上**，存疑。

**不宣称已修复。** 若再见到，优先查是不是**别的**用例红了而被误记到 G33b 名下
（该文件有 79 条用例）。这条留给下一次真的撞上的人。

### 4. `tokens.css?raw` 在 Vitest 下返回空串 —— 已修，但值得记住

`tests/components/palette.test.ts` 读 `tokens.css` 用的是 `readFileSync`，
而**别的文件用 `?raw` import** 会拿到**空字符串**（Vitest 5，node 环境实测）。
症状极具误导性：字面 hex 一路正常，只有 `var(--x)` 分支炸，
报错是「找不到 token」，与「你 import 到了空串」毫无字面关联。

📎 1.11 的 G30 之所以从没暴露，是因为它解的 `color` **全是字面 hex**，
`var()` 分支**一次都没被执行过**。
⇒ 「一个从没被执行过的分支」和「一段坏代码」在测试全绿时长得一模一样。

## Deferred from: story-1-11-三种卡型与答题交互 `[CR]` (2026-10-16)

三层审查（Blind Hunter / Edge Case Hunter / Acceptance Auditor）提出 21 条。
8 条已改并加守卫，**以下 8 条如实登记、不在本 story 修**。

### 移交 Story 1.16：问答卡面的三个生命周期缺口

`QuestionCard.vue` 的三个组件本地 ref —— `lastQuestion` / `pickedOptionId` / `spokenEntryId` ——
**没有一条在关卡结束时复位**，而 1.16 的 `RESTART_LEVEL` 不卸载 `QuestionCard`（视图仍是 `level`）。

| ref | 缺口 | 后果 |
|---|---|---|
| `spokenEntryId` | `restart()` 重新发出 entry 0，**首题的 `entryId` 与上次相同** ⇒ 守门 `if (entryId === spokenEntryId) return` 吞掉朗读 | **首题无声**。对 4–8 岁尚不能独立读题的孩子 = 一块无声的死屏，且无任何报错 |
| `lastQuestion` | `shown` 的兜底覆盖**全部五个**无 `question` 的相位（`awaiting-build` / `resolving` / `round-over` / `level-complete` / `level-failed`） | `level-complete` / `level-failed` 下卡面 + 四个选项 + 反馈条**仍在**，且 `.question-card__tappable` 仍是 `cursor: pointer` ⇒ **看着可点、点了没反应**（`[CR]` 补的 `answering` 守门把崩溃换成了静默吞掉，方向对但体验仍是死路） |
| `pickedOptionId` | 终局相位下不清 | `level-failed` 时仍挂着上一题的**绿色「答对了 ✓」** |

**要做什么**：1.16 做游戏结束画面时，`RESTART_LEVEL` 走一条**显式复位**路径把三个 ref 清干净；
并决定 `shown` 的兜底要不要收窄到只兜底 `awaiting-build`（收窄更对，但会让「关卡结束那一瞬」
的过渡观感变化，属 1.16 的画面设计裁决）。

**顺带一条 1.16 前置**：组件**没有 `onBeforeUnmount`**。已逐项查过没有定时器 / 监听器 /
objectURL 可漏，但 `pronunciation.ts` **没有公开的 stop** ⇒ 若孩子点了重听后组件被卸载，
朗读会播到结束。目前不可达（还没有会卸载它的路径）。

### 移交 Story 1.18：部署期 `BASE_URL` 配错会让整关不可通

`unit-01.json` 全量扫描实测：**30/30 单词卡的正确项全部是图片选项**。
⇒ 若正确项那张图加载失败，该选项被 `disabled`（`OptionCard.vue` 的降级协议）
⇒ 孩子**无法答对那道题** ⇒ `masteredEntryIds` 不增长 ⇒ `nextQuestion` 永远吐同一道
⇒ 心数耗尽 `level-failed`，**这一关通不了**。

- ⚠️ 与本 story `[CR]` 已修的那条（跨卡型 `failed` 泄漏，`[CR]`-B）是**两条不同的链**：
  那条是**某个 option id 的失败状态串到别的卡**上，本条是**这张卡自己的正确项失败**。
- **本 story 刻意不引入「降级卡片仍可选」的兜底** —— 那是产品决策
  （降级卡该不该可点？点了算不算答对？答不出正确项时孩子的挫败感怎么办？），
  不该由 `[CR]` 替产品定。
- **现实触发路径就是部署**：`import.meta.env.BASE_URL` 与站点前缀不一致
  （`OptionCard.vue` 的 warn 文案里已经指向这一点，G22 也逐张守着）。
  **这正是 1.18 的部署 AC 该覆盖的场景。**
- 📎 **文案诚实性**：`OptionCard.vue` 的 warn 写「回合流转不受影响」——
  **这句是对的**（回合确实流转），但**关卡进度**会卡住。已在 `[CR]` 中限定含义，
  后续若加兜底请同步更新这句。

### 移交（本 story 不修）：`stripComments` 剥不掉行尾注释

`tests/components/quiz-card.test.ts` 的 `stripComments` 用 `^\s*//.*$`，
**只剥行首的行注释**，剥不掉 `const x = 1 // 不 throw` 这类行尾形态。
G21 / G23 / G25 / G29 四条源码守卫都靠它。

- **反向是误报**（正确代码里的行尾注释含 `throw` ⇒ 守卫变红 ⇒ 会被当噪声忽略）
- **正向是漏报**（`const x = 1 // throw new Error()` 检不出来）

现有代码全部用行首注释，所以**从未触发**。**本次 `[CR]` 不改** ——
改了会让四条守卫同时换判据基线，属另一个 story 的范围。
📎 但本次 `[CR]` 已经吃过一次同型的亏：G30 的 `cssDecl` 第一稿忘了 `stripComments`，
立刻被自己的断言抓到 —— 因为 `OptionCard.vue` 的注释里**逐字写着**
`border: 3px solid transparent`（解释「改之前是什么样」），
`indexOf` 命中注释后再找 `{` 就跳进注释正文 ⇒ 断言对着自己写的说明文字报错。
**注释里描述违规形态，正则会命中注释。**


## Deferred from: story-1-10-战场渲染与网格 `[CR]` (2026-10-16)

### 1. G19 是词法守卫，抓不到「绕一道变量的算术」——要堵它需要值流分析

G19 断言组件源码里不出现裸血量/伤害算术。本轮已把它从「四个手写文件名」改成
递归扫 `src/`（M50：往 `StartView.vue` 注入裸算术，修前 0 红 → 修后 1 红），
但它的**射程有上限**，且这个上限是刻意写进守卫契约注释的，不是遗漏：

| 形态 | G19 抓得到？ |
|---|---|
| `zombie.hp / 100` | ✅ |
| `100 - zombie.hp` | ✅ |
| `zombieHpRatio(zombie)` | ✅（已封装成 core 纯函数） |
| `const ratio = hp / ZOMBIE_HP`（把算术藏进局部变量） | ❌ |
| `towers.filter(t => t.hp * 2 > 10)` | ❌ |

实测试过两版（`zombieHpRatio(...)`、`(x?.hp ?? 0) / 100`）都**正确地保持全绿**。
**处置**：把上限写进守卫自己的注释，而不是继续扩正则把假红造出来。
要真正堵住需要值流分析（把 `hp` 追溯到 `zombie.hp`），**那不是本 story 该买的东西**。
📎 恢复条件：若将来 `src/components/` 里真的出现第 5 行那种写法，
或某次 AI 漂移是靠局部变量藏起来的，就该上值流分析（可从 `zombieHpRatio`
与 `TOWER_COLOR_TOKEN` 的「单一导出 + 交叉断言」模式扩展）。

### 2. Debug Log #6（战场横向撑破容器）与 #3（格子变扁）无源码化守卫

两个都是**布局类** bug（`flex: 0 0 auto`、`box-sizing: content-box`），
jsdom 没有布局引擎 ⇒ 测不出来。本轮给可源码化的那一半补了守卫
（M48 `content-box`、M49 `1:1`，各 0 红 → 1 红），
但「列轨的最小宽度 = 行高」那一条**没有任何测试能守**。

- **恢复条件**：Story 1.19 真机复核时若再出现战场撑破容器，需要重新想一种
  能在 jsdom 或纯函数层表达这条约束的方式（或接受它只能靠真机核对）。
- 本 story 已在 `BattleField.vue` 与 `LevelView.vue` 的 CSS 旁写明
  「为什么不能写成另一个值」，让下一个人不必再踩第二次 —— **但注释不是守卫**。

### 3. 新增棋子类不受 G20 管辖

G20（塔 / 僵尸必须显式声明 `width` 与 `height`）只覆盖 `.tower` / `.zombie` 两个类。
Story 1.12 之后的 `SunCounter` / `HeartRow` / `ProgressBar` 一类**尺寸类 HUD 组件**
不受它管 —— 那类应该进 `palette.test.ts` 的实算集，或新建一条同形状的守卫，
**而不是扩 G20 的选择器**（G20 的契约注释里已写明这条边界）。
📎 恢复条件：Story 1.13 落 `hud/` 时同步决定。
✅ **已由 Story 1.13 `[DS]` 决定（2026-10-16）**：HUD 三块**不进 G20** ——
它们是内容撑开的（只有 `padding` / 字号 / 图标尺寸），钉死尺寸会与「不写死 HUD 高度」冲突；
代替 G20 的护栏是 AC-G1 的真浏览器实测。详见下方 1.13 段第 11 条 ③。

### 4. `check-doc-consistency.sh` 被删时无人登记 —— 已在本 story 标注，根因未治

`d353e62` 用 `scripts/check-execution-drift.py` 替换了
`scripts/check-doc-consistency.sh`，但**没有任何 story 登记过这次删除**，
而至少 6 处文档（含 Story 1.10 的 AC-1 / AC-16 与两份已归档的 1.8 / 1.9）
仍把它列为收尾命令。本 story 已按「AC 正文不改、只标注」处理，
但**根因是「新引入一条收尾命令时没有回头扫描既有文档」**。

- 📎 恢复条件：任何 `package.json` script 或 `scripts/` 下门禁的增删，
  都应回头 grep `_bmad-output/` 与 `docs/` 并逐处登记。
- **注意**：`scripts/check-execution-drift.py` 自己是 pre-push 钩子，
  **它只查 BMAD 产物与内容数据，不查「文档里写的命令还在不在」** ——
  也就是说这个缺口**当前没有任何工具能自动发现**。

### 5. `npm run typecheck` 出现过一次**未能复现的 34 条假红** —— 判定与教训

> ⚠️ **2026-10-16 更正**：本条原先写「`typecheck` 在 `main` 上是红的（34 条）」。
> **那个判定已被 Story 1.13 `[DS]` 开工时的实测推翻。** 保留本条是因为
> **「为什么会误判」比「误判了什么」更值得留下**。

**实测推翻的链条（全部可复跑）：**

| # | 动作 | 结果 |
|---|---|---|
| 1 | Story 1.10 `[CR]` 收尾跑 `npm run typecheck` | **34 errors**，exit 1 |
| 2 | 跑过一次 `npm run build`（= `vue-tsc -b --force && vite build`） | — |
| 3 | 再跑 `npm run typecheck` | **0 errors**，exit 0 |
| 4 | 删全部 `node_modules/.tmp/*.tsbuildinfo` 后增量跑 | **0**，exit 0 |
| 5 | `npx vue-tsc -b --force` | **0**，exit 0 |
| 6 | `git stash` 回 `beae1e6`（1.10 动手前的树）+ 删 tsbuildinfo + 增量跑 | **0**，exit 0 |

第 1 条那 34 条里有
「`WORD_IMAGE_PLACEHOLDER_SVG` 在 `node_modules/.tmp/core-types/src/core/index` 上不存在」，
而**该导出在 `src/core/index.ts` 里真实存在**（逐字可查），
报错路径指向的是 `node_modules/.tmp/` 下的**生成声明**而不是源码。

- **判定**：`main` 的源码是**绿的**。那次红来自陈旧构建产物。
- **⚠️ 但机制未能复现，如实记**：手工把 `.tmp` 里的 `.d.ts` 改旧后跑增量，
  TypeScript **直接忽略**该文件并 exit 0，**不会**把它误报成 34 条。
  即「陈旧 `.d.ts` → 误报」这条因果链**我验证不了**，只能说「发生过，`--force` 之后不再发生」。
- 📎 **恢复条件**：若 typecheck 再出现**整批**、且**错误内容与源码对不上**的报错
  （典型信号：报错指向 `node_modules/.tmp/...`），**先跑 `npx vue-tsc -b --force` 再下结论**。
  ⚠️ 别把「`--force` 之后绿了」写成「源码没问题」—— 它只说明**增量产物**不是原因。

**教训（本条真正的价值）：** 我当时用 `git stash push -- src tests` 复跑，
确认「仍是同样 34 条」，就写下了「红在 `main` 上是既有的」——
**那条验证只证明了「我的改动不是原因」，没有证明「源码是红的」。**
两者之间隔着「构建产物」这一层，而我没查那一层。
⇒ **归因到一个自己没验过的原因上，比不归因更坏** ——
因为它让下一个人看到「已确认是既有问题」就不再查下去。
📎 这条与第 4 条同源：**「一个门禁从绿变红」和「一条命令从有变无」都不会自己报警**，
而**「我验证了 A 就当 B 也成立了」是这类误判最常见的入口**。

## Deferred from: story-1-13-HUD-阳光-心与进度 `[DS]` (2026-10-16)

### 1. `core/effects.ts` 与 `app/effects-runner.ts` 未建（裁决 1）—— 归 1.14

- **本 story 刻意没建这两个文件，尽管仓库里 9 处文档写它属 1.13** ——
  那是 story 重编号的残留（1.13 已被 HUD 占用，音效改号成 1.14）。
  `app/store.ts` 的 `applyAction` 里留的是**显式空位注释**而不是空函数占位，
  理由是「空函数会让『副作用已接上』看起来成立，而实际上一条音效都没播过」。
  代价：掉心动画目前靠组件里的 `watch` + CSS class，与 action 链路无关。
  —
  `src/app/store.ts`, `docs/rules/process.md`, `epics.md`
  **恢复条件**：Story 1.14 开工时，`runEffects(action, prev, next)` 必须排在
  `state.value = next` **之前**，且掉心音效**必须调 `lostSlotIndexes`**（不许另算一遍）。

### 2. 不引入 `sunEarned` 累计阳光字段（裁决 4）—— 归 1.16 或 1.17

- FR66 / `gdd.md` 提到「累计所得只增不减」，本 story **只对掌握词条**实现了这一点
  （`progress.masteredWordIds`），**没有**累计阳光字段。理由与 1.15 的存档形状有关：
  现在加一个没人读、没人存的字段，等于造一个空占位（`store.ts` 自己批评过的那种）。
  —
  `_bmad-output/planning-artifacts/gdd.md`
  **恢复条件**：若 1.15 存档格式要求「本存档累计获得多少阳光」，
  或 1.17 的 DebugPanel 要显示它 ⇒ 走 `[CC]` 加字段，**不要**在 1.13 补。

### 3. `progress` 是内存态，进度条在刷新页面后归零（裁决 3）—— 归 1.15

- 形状逐字锁死为 `game-architecture.md` 决策 5 的 `SaveFile['progress']`：
  `{ currentUnitIndex, masteredWordIds }` 两个键，**键名一个都不许改**。
  现状是模块级 `ref`，不写 `localStorage` ⇒ **F5 之后进度回到 0/37**，
  而 `state` 本身也是重开一局，所以「这一局」看不出差别；一旦 1.15 把 `state` 也存起来，
  「进度保留、对局清空」这个组合才会显形。
  —
  `src/app/store.ts`, `src/core/hud.ts`
  **恢复条件**：Story 1.15 加 `services/save.ts` 时，按 `schemaVersion` 序列化这两个键，
  读取时**原样喂回** `progress` ref（不要在这里做版本迁移）。

### 4. 新增 `src/core/hud.ts`（架构组件树未列）—— 归 1.16/1.18 的架构回写

- 架构文档的组件树里没有 `core/hud.ts`，本 story 沿用 1.12 `core/build.ts` 的先例新建。
  ⇒ **架构文档现在比代码少一个模块**。判据全部零 DOM / 零 Vue / 零随机 / 零时间，
  与 `turn.ts` / `combat.ts` 同纪律，这条是它能被架构接受的前提。
  —
  `docs/rules/architecture.md`, `src/core/hud.ts`
  **恢复条件**：下一次改架构文档（`[GA]`）时把 `core/hud.ts` 补进组件树/模块表。

### 5. 本 story 不产出降级标志 —— 作废 `epics.md` 那两处「1.13」

- `epics.md` 里说 1.13 要产出降级标志，实际 HUD 三个组件**没有任何外部依赖**
  （心是 CSS 画的、阳光图标是 CSS 画的、进度条是纯 div）⇒ 没有可降级的东西。
  那两处「1.13」同样是重编号残留。
  —
  `_bmad-output/planning-artifacts/epics.md`
  **恢复条件**：无（作废声明）。若将来 HUD 引入词图或音频，降级方案随那个 story 一起出。

### 6. 掉心动画不进 effects-runner（裁决 2）—— 归 1.14 的音效判据复用

- 判据在 `core/hud.ts` 的 `lostSlotIndexes(prev, next)`，画面由 `HeartRow` 的
  `watch(state, …, { flush: 'sync' })` 转成 class，CSS 负责动画。
  ⇒ 1.14 的掉心音效**必须调同一个函数**（守卫 G55 / G55a 已经把两条恒等式钉住：
  `lostSlotIndexes(...).length === heartsLostBetween(...)`，且逐位等于两帧 slots 的差集）。
  —
  `src/core/hud.ts`, `src/components/hud/HeartRow.vue`
  **恢复条件**：1.14 写掉心音效时，先跑一遍 M103（把 `heartsLostBetween` 夹到 1）确认会红。

### 7. `core/hud.ts` 持有 entryId 前缀形态的第二份知识（裁决 7 / 偏离 7）—— **无守卫**

- `progressDisplay` 用 `id.startsWith('u' + unitNumber + '-')` 判「属于本单元」，
  因为 `core/` 不得 import `content/`（`src/content/index.ts` 是静态 import JSON）。
  ⚠️ **`eslint.config.js` 的 `src/core/**` 块只禁 `vue` / `app` / `services`，没有禁 `content`** ——
  也就是说这条约定**当前没有任何工具强制**，将来 `content/` 与 `core/` 的 id 形态分叉时，
  `core/` 这侧会**静默通过**。别去找一条不存在的守卫：它不存在。
  —
  `src/core/hud.ts`, `src/content/index.ts`, `eslint.config.js`
  **恢复条件**：若单元 2 的 JSON 换了 id 前缀形态（例如去掉 `u{n}-`），
  必须同步改 `progressDisplay` 并**新增**一条守卫（形如「真实 `entriesOf(n)` 的每个 id 都满足该前缀」），
  否则进度条会恒显示 0 而不报错。

### 8. `[DS]` 新增不透明 `--color-hud-panel: #1f2d11`（偏离 8）—— 归 1.18 真机校准

- AC-D3 点名 `--color-sun` / `--color-heart`，却**没说 HUD 的底色是什么**，
  而 `tokens.css` 把亮黄收窄成「只许落在深色底面」（草地绿上实测 1.79:1、卡面米色上 1.12:1）。
  实测推导：阳光黄自身 L=0.7025，要够 3:1 需底 L ≤ 0.2008；心红 L=0.1984，要够 3:1 需底 L ≤ 0.0328
  ⇒ 一个底色要同时满足两者只能压到近黑。取 α=0.75 罩在草地上 = `#1f2d11`（实测
  阳光 10.43:1、心 3.44:1、白字 14.56:1、路径米 9.26:1）。
  ⚠️ **不用 rgba 半透明**：0.75 罩在白卡上会变成 `#404040`，心只剩 2.45:1 ——
  半透明面板的对比度取决于背后是什么，而 HUD 背后的东西会变。
  同样因此，**`--color-correct`(2.84:1) 与 `--color-wrong`(2.21:1) 在这个底上都不到 3:1**，
  所以进度条**不许**用它们（已写进 `ProgressBar.vue` 的注释）。
  —
  `src/styles/tokens.css`, `tests/content/palette.test.ts`
  **恢复条件**：1.18 真机校准时复算三条（阳光 / 心 / 白字）；若要改 `--color-heart` 或
  `--color-sun` 的值，**必须先跑 `palette.test.ts`**（那条 describe 就是为此建的）。

### 9. `progress.masteredWordIds` 现在靠 `entryId === wordId` 成立 —— 分叉条件 = 走 `[CC]`

- `[CS]` 实测 `unit-01.json` **37/37 条 `entryId === wordId`**（含 `u1-s-*` 的 6+1 条
  response / keyword 卡），所以本 story 直接把 `entryId` 存进 `masteredWordIds`。
  ⚠️ 但 `src/core/types.ts` 明确 `entryId` 与 `wordId` 是**不同概念**
  （一个 response 卡的 entryId 与它朗读的词不是一回事），
  而字段名被 `game-architecture.md` 锁死成 `masteredWordIds`。
  ⇒ **这是今天成立、明天可能不成立的一条**。
  —
  `src/core/hud.ts`, `src/content/units/unit-01.json`, `src/core/types.ts`
  **恢复条件**：单元 2 或任何一条内容出现 `entryId !== wordId` 的词条时，
  **立即走 `[CC]`**：要么把字段改名成 `masteredEntryIds`（同时改架构文档），
  要么引入 `entryId → wordId` 的映射表。**不许**继续把 `entryId` 塞进 `masteredWordIds`。

### 10. `--dur-slow`（400ms）用于掉心动画的理由是一次性的，不是通用的 —— 归 1.18 复核

- `--dur-feedback`（100ms）的注释明写「只许用于反馈类动画」，指的是「按下即回弹」；
  掉心是「碎裂 + 退回」两拍叙事，100ms 播不完 ⇒ 取 `--dur-slow`。
  ⚠️ 这是**本组件的判断**，不是「`--dur-slow` 就是给掉心用的」这条 token 约定。
  真实时长是否让孩子看得清，只能在真机上定。
  —
  `src/components/hud/HeartRow.vue`, `src/styles/tokens.css`
  **恢复条件**：1.18/1.19 真机录制里若「心碎了」看不见或拖沓，先调这里；
  **只许改这一处**，改完复跑 AC-G1 第 9 项（computedStyle 里不许出现字面量毫秒）。

### 11. AC-G1 实测留下的三件事：3px 横向溢出、favicon 404、G20 对 HUD 的适用范围

- **① `.battle-grid` 的 `scrollWidth 771 > clientWidth 768`（3px）** ——
  实测归属**不是** 1.13：同一个页面里把 `.hud` 设成 `display:none` 再量，仍是 771。
  成因是 `repeat(9, 1fr)` 的列宽 82.14 × 9 = 739.27 加 8 个 4px 间距 = 771.27，
  `1fr` 没把间距算进去。AC-G1 第 4 项的判据（战场宽 ≤ 768）实测 768 ⇒ 通过，
  但这 3px 意味着**每一列的最右侧都可能被裁掉不足 1px**。
  —
  `src/components/battle/BattleField.vue`
  **恢复条件**：1.18 真机落地时若发现右列贴边或有 1px 抖动，改列宽算法
  （`minmax(0, 1fr)` 或把间距算进 `1fr`）——**不得**为此改 `.battle-grid` 的 `flex`
  （1.10 实测过 `1 1 auto` 横向撑破到 1351px）。
- **② `/favicon.ico` 404** —— AC-G1 的判据是「零 404」，实测**有 1 条**：
  浏览器自动请求，仓库里没有这个资产，与本 story 无关。除此之外零 404、零 `pageerror`。
  **恢复条件**：1.18 部署 PWA 时加一个 favicon（PWA 本来就要有图标），这条自动闭合。
- **③ 1.10 段第 3 条「新增棋子类不受 G20 管辖」的恢复条件到期：答案是「HUD 不进 G20」** ——
  `G20` 要求显式声明 `width` / `height`，而 HUD 三块是**内容撑开**的
  （只有 `padding`、字号、图标尺寸），钉死尺寸反而会与「不写死 HUD 高度」冲突。
  代替 G20 的护栏是 **AC-G1 的真浏览器实测**（第 1、3 项量高度与正方形、第 9 项量时长）。
  ⇒ 这不是「没人管」，是**换了一种管法**；但它只在有人重跑实测时才存在。
  —
  `src/components/hud/SunCounter.vue`, `src/components/hud/HeartRow.vue`, `src/components/hud/ProgressBar.vue`
  **恢复条件**：若将来 HUD 某一块引入了图片/词图（那时尺寸就由资源决定了），
  回到本文件 1.10 段第 3 条，重新决定它归 G20 还是归 AC-G1 实测。

### 12. 本 story 补的两条守卫只停在源码层 / store 集成层 —— 归 1.14/1.15 时可放宽

- 变异实测逼出来的：**G56**（`heartSlots` 的循环上界必须引用 `HEARTS`）与
  **G57**（`RESTART_LEVEL` 不得清空 `progress`）。两条都是**结构上没有更好的选择**：
  M79（写死 3）在 `HEARTS === 3` 时与正确实现**完全等价**，任何行为断言都区分不了；
  M84 改的是 `app/store.ts`，而 `reducer` 根本不碰 `progress`。
  ⇒ 它们是「源码/集成层守卫」，不是「行为层守卫」，**不要**把它们当成行为已被证明。
  另：**G53（`flush: 'sync'`）也只停在源码层** —— 实测 `'pre'` 与 `'sync'` 在本组件上
  DOM 输出完全相同（`lostSlotIndexes` 按净差算），story 原文那句「连掉 2 心只动一颗」
  对 `HeartRow` **不成立**。
  —
  `tests/components/hud.test.ts`, `src/core/hud.ts`, `src/components/hud/HeartRow.vue`
  **恢复条件**：1.14 接上掉心音效后，音效的**起播时刻**与画面对齐才成为可观测事实 ——
  那时可以用「同一 tick 内音效与 class 同时触发」把 G53 升级成行为守卫；
  在那之前，**不许**把 G53 的源码守卫当成「已用行为证明过」。




