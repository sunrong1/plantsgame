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
>
> ---
>
> ### 📎 2026-10-16 追加（📎 Story 1.14 `[DS]` 交付后回填）
>
> 1.14 已落地，上述「等 1.13/1.14 接手时再办」的条目**逐条结清**如下：
>
> | 原条目 | 现状 |
> |---|---|
> | 「`app/effects-runner.ts` 不在守卫名单内」（本文件 :23、:25） | ✅ **已补** —— `eslint.config.js` 给 `src/components/**` + `src/views/**` 加了 `no-restricted-imports`，禁 `services/audio` 的播放函数；守卫 **G70**（含 `Linter.verify` 真跑一条用法层验证）。⚠️ 同时把 `app/effects-runner.ts` 纳入 `no-restricted-syntax` 的**禁 await** 名单。 |
> | 「五条已处理但零测试覆盖的分支」（本文件 :94） | ✅ **已补** —— `AudioContext` 不存在 / `new AudioContext()` 抛 / `resume()` 被拒 / `fetch` 抛 / `decodeAudioData` 抛，五条各有独立用例（`tests/services/audio.test.ts`，G72）。 |
> | 「BGM 接目标平台」（本文件 :113 一带） | ✅ **已接** —— `music/battle-loop.mp3` 已下载进仓，`enterLevel()` 触发 `startBgmIfReady()`（裁决 5：BGM **不走** `runEffects`，因为进关不是 action）。 |
> | 「effects-runner 的异步形态」（本文件 :113） | ✅ **已裁决** —— **禁 `await`**；但 `services/audio.ts` **允许 `.then()`**（解码必须）。`.then()` 逃逸守卫**只**加在 `app/audio-unlock.ts`（三步同步块不许挂 promise 链）。见 `1-14-音效与-bgm-接入.md` 裁决与 AC-G8。 |
> | `audio-unlock-guard.test.ts` 里「守卫有意不覆盖 views/」那条用例 | ✅ **仍然成立，未改** —— 它守的是 FR2 的 **`no-restricted-syntax`**（解锁三步禁 `await` / `.then()`），而 AC-G7 补的是另一条规则 **`no-restricted-imports`**（组件/视图禁 import `services/audio` 的播放函数）。两条规则管的不是一回事：`views/` 里确实没有解锁三步可 await，但**不允许它自己 import 播放函数**。⇒ 那条用例无需改写成断言新状态，改了反而是放宽断言（R-57）。新增的覆盖由 G70 单独断言。 |
>
> **本 story 新登记的 deferred 见文件末尾「Deferred from: story-1-14-音效与-BGM-接入」一节。**
>
> ---
>
> ### 📎 2026-10-17 追加（📎 Story 1.15 `[DS]` 交付后回填）
>
> 1.15 已落地，归 1.15 的条目**逐条结清**如下（原文一律保留不动，只在此登记现状）：
>
> | 原条目 | 现状 |
> |---|---|
> | 1.13 第 3 条「`progress` 是内存态，进度条在刷新页面后归零」 | ✅ **已结** —— `src/services/save.ts` 按 `schemaVersion` 序列化 `{ currentUnitIndex, masteredWordIds }` 两个键（键名逐字未改），`enterLevel()` 读档时**原样喂回** `progress` ref，**未做任何版本迁移**（版本不匹配走「安全降级为从头开始」，FR61）。守卫 **G74 / G78**（G78 = R-06 的正式守卫，钉「局末 `currentGame === null` 且 `progress` 逐字不变」）。 |
> | 1.13 dismissed 的「`progress` 只是模块内存态，刷新即丢，进度条肉眼可见回退」 | ✅ **同上，结清** —— `ProgressBar.vue` 文件头写的「若出现回退，那不是动画该掩盖的事」如今有判据撑着。⚠️ 代价是**新增了一条失败链**：读档失败时进度会退回初始（`store.ts` 的 `restoreFromSave` 逐字 WARN 记录了这一点，不是静默）。 |
> | 1.13 dismissed 的「`unitTotal` 的 computed 在渲染期可 throw（1.15 读档后的第一条失败链）」 | ✅ **已结** —— `LevelView.vue` 的 `unitTotal` 改成 try/catch，取不到单元就退回 `0` 并记 WARN。`0` 是**已定义好**的形状：`core/hud.ts` 的 `progressDisplay` 对 `unitTotal === 0` 早已取 `ratio = 0`。⚠️ 报错**没有**被吞掉 —— 开局路径 `store.ts` 的 `initialState()` 那里仍有 try/catch 和人话提示。守卫 **G84**（含 `Linter.verify` 真跑一条验证 + 假阳性对照）。 |
> | 1.14 第 1 条「🔥 M117 全量 0 红 —— `RESTART_LEVEL` 的 `Math.max(0, …)` 夹取无任何守卫」 | ✅ **到期条件已成立并已补** —— 该条逐字写的恢复条件是「Story 1.15 或 1.16 动 `RESTART_LEVEL` / **心数写入路径**时，同一次改动里补一条反向断言」。1.15 正是新增了第二条心数写入路径：`restoreFromSave` 把 `localStorage` 里的 `hearts` 直接写进 `state.value`（此前 `hearts` 只可能由 reducer 产生）。反向断言见 `tests/app/store-save.test.ts`「心数为**负**同样退回」，变异 **M99**（去掉 `assertCounters` 的 `state.hearts < 0` 一半）**2 红**。<br>⚠️ **为什么原先那条 0 红不是缺口**：deferred 条目点名的 `Math.max(0, …)` 夹取今天在 `reducer.ts` 的 `applyResolve` 里，不在 `RESTART_LEVEL` 分支 —— `restart()` 走 `createInitialState`，心数直接回到满值，根本没有夹取。那条 0 红是**等价变异体**（两处夹取重合），不是「无人守」。 |
> | 1.14 第 2 条「M120 实测 0 红 —— 批量级 try/catch 与单条级 try/catch 当前完全冗余」 | ✅ **已裁决并结清** —— 该条逐字要求「1.15 接 `SAVE` 前应当重新评估这一层」。裁决：**选 ② 收窄**（把 try/catch 收进 `case 'SAVE'`），不选 ① 在循环外加一层。<br>⚠️ 同时**纠正原条目的一处失实**：它写「外层为何仍值得留着」，好像那层一直存在 —— 实测 1.14 `[DS]` 交付的代码里**整条循环外没有 try/catch**（M120 那个变异是**加**一层，加了之后 7 条守卫 0 红）。<br>理由与代价逐条写在 `src/app/effects-runner.ts` 的 `case 'SAVE'` 注释里（AC-E4 裁决）：① 会把 `assertNeverEffect` 重新兜住，编译期穷尽性退化成一条 WARN；② 下 `assertNeverEffect` 仍在任何 try 之外，`Effect` 联合漏成员时**立刻炸**，可见性一步没减。 |
> | 1.13 第 2 条「不引入 `sunEarned` 累计阳光字段（裁决 4）—— 归 1.16 或 1.17」 | ⏸ **仍未触发**，但恢复条件已**实测过一次**并留下记录：该条逐字写「**若 1.15 存档格式要求**「本存档累计获得多少阳光」」⇒ 1.15 的 `SaveFile` 只有 `progress` + `currentGame` 两个字段（裁决 2 / 架构决策 5），**没有**累计阳光。⇒ 触发条件为假，本条**继续挂着**，不因为「1.15 已经做过存档了」就顺手结掉。<br>⚠️ 留这一行是因为 1.13 写它时**没人能确定 1.15 的存档形状**；现在能确定了，而答案是「不带」—— 这个否定结论本身值得留痕，否则下一个人会重新推一遍。 |

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

---

## Deferred from: code review of story-1-13-HUD-阳光-心与进度 `[CR]` (2026-10-16)

本轮 CR 只评审了 `83533c7..82cdaa4` 的 **src/ 8 文件**。以下 2 条 defer。
另有 2 条 dismissed 未登记（见下），以及 13 条 patch 挂在 story 的 `### Review Findings`。

- **`unitTotal` 的 computed 在渲染期可 throw（1.15 读档后的第一条失败链）** — `src/views/LevelView.vue:65`
  `entriesOf(state.unitNumber)` → `src/content/index.ts:85` 的 `getUnit` 取不到单元就 **throw**（不是返回 `undefined`，这是内容层的刻意设计）。
  今天 `state.unitNumber` 恒为 `FIRST_UNIT_NUMBER = 1`（`store.ts:49`），不会触发。
  但 1.15 一旦按 `SaveFile.currentGame` 原样还原 `State`，`unitNumber` 就来自存档 —— 若内容回滚或存档来自别的内容版本，
  这个 `computed` 会在**渲染期**抛错，Vue 让整个 `LevelView` 渲染失败（白屏），正撞 `game-architecture.md`「孩子面前永不出现技术错误」。
  **更稳的形状**：让 `unitTotal` 对「取不到单元」退化成 `0` —— `progressDisplay` 已经为 `unitTotal === 0` 定义了 `ratio = 0`（`core/hud.ts:170-171`）——
  把报错留给真正的开局路径 `store.ts:65` 的 `initialState()`，那里已有 try/catch 和人话提示。
  ⚠️ 与 `deferred-work.md` 里已登记的「`progress` 要喂给存档」是同一批风险。

- **`progress` 只是模块内存态，刷新即丢，进度条肉眼可见回退** — `src/app/store.ts:108`
  本项目部署为 PWA。孩子学会 12 个词后进度条显示 `12/37`，随后任何一次刷新 / PWA 重启 / 页面重载 ⇒ 模块重新求值 ⇒
  `progress` 回到 `{currentUnitIndex: 1, masteredWordIds: []}` ⇒ 进度条**倒退到 `0/37`**。
  `ProgressBar.vue` 文件头写着「若出现回退，那不是动画该掩盖的事，是判据出了问题」——
  即「只增不减」（FR58）在跨页面生命周期的尺度上今天并不成立，且没有任何持久化/重置入口来解释这次回退。
  **这不是本 story 的缺陷**：in-memory 态是裁决 3 的既定设计，1.15 才加序列化。登记在此，1.15 落地时应一并解决回退观感。

### 本轮 dismissed 的 2 条（不修，留档以免下游重复排查）

- **`heartsLostBetween` 与 `lostSlotIndexes` 的「恒等式」在 `hearts` 越界时不成立**（盲审提出，构造输入 `prev.hearts=1, next.hearts=-1` ⇒ 前者返回 2、后者长度 1）。
  **驳回**：`core/reducer.ts:306` 的 `Math.max(0, hearts - heartsLost)` 把心夹到 0，且 `reducer.ts:538` 的 `assertInvariants` 硬性要求 `hearts ∈ [0, HEARTS]` 整数 ⇒ 越界输入在合法状态空间内**不可达**。守卫 G55/G55a 成立。
- **`progressDisplay` 的 `startsWith('u' + unitNumber + '-')` 是 entryId 形态的第二份知识，id 形态一变就静默归零**。
  **驳回为重复**：实测 `unit-01.json` 全部 37 条 id 形如 `u1-*`，且 `u11-x` 不会误配 `u1-`（第 2 字符是 `1` 不是 `-`）⇒ 今天正确。
  该判据**无守卫**这件事，已由本 story `[DS]` 段的第 7 条如实登记，此处不重复计。





## Deferred from: story-1-14-音效与-BGM-接入 `[DS]` (2026-10-16)

### 1. 🔥 M117 全量 0 红 —— `RESTART_LEVEL` 的 `Math.max(0, …)` 夹取无任何守卫

- **实测**：`core/effects.ts` 的 `RESTART_LEVEL` 分支去掉 `Math.max(0, …)` 后，
  跑**整个测试套件**（37 文件 / 1400 条）**一条都没红**。
  ⇒ 不是「等价变异体」，而是**真的没有任何东西守着这个夹取**。
- **为什么它现在无害**：心数在别处已被夹在 `[0, MAX_HEARTS]`，两条路径重合 ⇒ 行为等价。
  但这正是本仓库吃过三次亏的形状：**「今天无害」不等于「永远无害」**。
  将来若某条路径绕过 `setHearts` 直接改 `hearts`，夹取一去，负心数就会出现在 HUD 上。
- **为什么不在 1.14 补**：`RESTART_LEVEL` 的心数语义属 **Story 1.15/1.16**（重打 / 通关 / 失败），
  本 story 的 AC 不含改这条链路。硬补一条守卫等于**在没有 AC 的地方加判据**。
- **恢复条件**：Story 1.15 或 1.16 动 `RESTART_LEVEL` / 心数写入路径时，
  **同一次改动里**补一条反向断言（例如「重打后 `hearts` 不得为负」）。
  —
  `src/core/effects.ts`, `tests/core/effects.test.ts`

### 2. M120 实测 0 红 —— 批量级 try/catch 与单条级 try/catch 当前完全冗余

- **实测**：在 `effects-runner.ts` 的整条循环外再包一层 `try/catch`，7 条守卫**全部照绿**。
- **为什么这是正确结果而不是缺守卫**：`runOne` 的 `SFX` 分支**已经有自己的 try/catch**，
  而其余分支都是 `return`。外层能兜住的只有 `runEffects` 抛错 —— 而它是纯函数、不抛。
  ⇒ 两个变异体在当前代码下**行为完全等价**，0 红是 AC-G4 §「等价变异体」那一档。
- **外层为何仍值得留着**（不是冗余代码，是 1.15 的前置防御）：
  `case 'SAVE'` 在 1.15 会真的做 I/O，那时它抛错将**中断后续条目**；
  AC-E4 的「继续执行后续条目」需要一条兜底。
- **⚠️ 代价要说清**：`assertNeverEffect` 被刻意放在 `runOne` 的 try **之外**，
  但外层这层 catch 会把它重新兜住 —— 运行时一旦漏了某个 `Effect` 成员，
  退化成的不是编译错误而是**一条 `console.warn`**。可见性仍在（`[audio]` 前缀，WARN 级），
  但**弱于**「立刻炸出来」。1.15 接 `SAVE` 前应当重新评估这一层。
- —
  `src/app/effects-runner.ts`

### 3. `matchesGlob` 不支持字符类 `[...]`（AC-G7 一并到期，本 story 不修）

- `deferred-work.md:170-179` 写「接手时对 `[...]` 加转义并补自测；或引入 minimatch 做交叉校验」。
  1.14 新增了 `src/app/effects-runner.ts`（第 4 个探针文件），让这条判据的覆盖面又大了一圈。
- **本 story 不修的理由**：`matchesGlob` 是 `tests/scaffold/audio-unlock-guard.test.ts` 的
  判据**自身**的函数，而它的模式串里目前**没有任何字符类** ⇒ 修了也验不到自己，
  得同时新增一条「模式串含 `[...]`」的探针，那是**为修 bug 而造 bug**。
- **真实风险**：`eslint.config.js` 里一旦有人写 `src/{app,views}/**` 这种模式，
  `matchesGlob` 会**匹配失败并静默判定「没覆盖」** ⇒ 守卫朝**假红**方向坏（安全侧），
  而不是朝假绿 —— 这是本条可以继续压着的原因，但不该一直压着。
- **恢复条件**：下一个改 `eslint.config.js` 覆盖名单的 story，或引入 minimatch 时。
  —
  `tests/scaffold/audio-unlock-guard.test.ts`, `eslint.config.js`

### 4. ✅ 已关闭 —— 人工试听已于 2026-10-16 由用户完成（结论 OK）

- **原缺口**：本 story 的自动化**只验结构**（cue 映射、执行顺序、失败降级、URL 拼装、文件非空），
  **任何一条都不判断声音好不好听**（裁决 2 明确禁止音频特征断言）
  ⇒ 素材一度**无人听过**（AI 会话无音频输出通路）。
- **✅ 关闭依据**：用户（sunrong）于 2026-10-16 在本地开发环境试听
  **7 个 sfx + `battle-loop.mp3`（BGM）全部**，结论 **OK**。
- ⚠️ **关闭的边界（别当成「音效已定型」）**：这是**一次性人工验收**，**逐项**结论
  （答错音是否刺耳 / BGM 是否压过音效 / 循环处是否听得出来）**无书面记录** ——
  拿到的是概括性的「OK」。本地开发环境**也不是真机**。
- **恢复条件（仍然成立，只是升级了）**：「这套音效的音量 / 响度配比是否适合 4–8 岁孩子」
  仍需 **真机 + 儿童用户测试**，归 Story 1.16 / 1.18。那是**另一件事**，不是本条的缺口。
  —
  `public/assets/audio/sfx/`, `public/assets/audio/music/`

### 5. 1.13 遗留：`core/hud.ts` 架构组件树未列 —— **本 story 不代劳**

- 逐条确认它**仍在 deferred 里**（本文件上一节第 4 条），归 1.16/1.18 的架构回写。
  1.14 的 AC-H8 只确认「`game-architecture.md` **本来就列了** `core/effects.ts` 与
  `app/effects-runner.ts`（`:748` / `:804`）⇒ 1.14 是「补实现」，**不需要 `[GA]` 回写**。
  两件事别混：`effects` / `effects-runner` 已列，`hud.ts` 仍缺。
  —
  `_bmad-output/planning-artifacts/game-architecture.md`

### 6. 裁决 6 的张力：换题朗读（TTS）在两个地方都有入口

- **事实**：TTS 效果目前**不在** `runEffects` 里产出（裁决 6），
  换题朗读走 `store.speakQuestion()` 门面，而 1.11 的 `QuestionCard.vue` 里
  还有一条独立的 `watch` 触发同一件事。
- **张力**：1.11 偏离 1 是为了「用户点重听不对应任何 action」的形状问题（这个理由仍然成立），
  但**换题**本身确实对应一个状态转移。将来若要把 TTS 收口进 `runEffects`，
  必须先答清楚「重听」怎么办 —— 否则会为了统一而把「重听」硬塞进某个 action。
- **本 story 刻意不动**：AC-F2 明确「`QuestionCard.vue` 的逻辑一个字都不改」，
  只在文件里加了一段说明为什么它与 `runEffects` 不冲突。
- **恢复条件**：Story 1.16（把 `Effect` 的 `TTS` 成员真正接上时）**必须**重新裁决这一点。
  ⚠️ **📎 2026-10-17 归属更正（Story 1.16 裁决 6）**：原写「Story 1.16」，
  而 Story 1.16 的 AC **零 TTS 字样** ⇒ 按 R-32 它无权做这件事 ⇒
  这一条**没有归属 story**，需 `/gds-correct-course` 指派。
  ⇒ 「没有归属」比「有归属但没做」更值得盯：一个没人负责的缺口不会被主动补上。
  —
  `src/app/effects-runner.ts`, `src/components/quiz/QuestionCard.vue`


## Deferred from: story-1-15-存档与断点续学 `[DS]` (2026-10-17)

### 1. 🔥 AC-E5 的「写盘抛错后仍执行后续条目」**构造上不可达**

- **事实**：`core/effects.ts` 的写盘判据（块 ④）是 `runEffects` 里**最后一段**，
  `SAVE` 因此**恒排在该数组的末尾**（守卫 G79 之外，`tests/app/effects-runner-save.test.ts`
  里有一条用例专门断言这件事）。
  ⇒ 「前面某条（只能是 SAVE 本身）抛错 ⇒ 后续条目仍被执行」这个构造
  **根本不存在**：`SAVE` 后面没有任何条目。
- **为什么它仍要留着那条 try/catch**：AC-E4 逐字要求「某条副作用抛错不得冒到
  `applyAction`」，而 `writeSave` 的契约是「不抛」（AC-B3 / AC-B6）。
  契约违约时的兜底与构造上的不可达**不矛盾** —— 兜底防的是「将来有人给
  `writeSave` 加一条会抛的路径」。
- ⚠️ **这不是 AC 未满足**，是 AC 的措辞在当前代码下**有一半构造上无法验证**。
  如实降级记在 story 文档的偏离表第 5 条，不粉饰成「已验证」。
- **恢复条件**：Story 1.16 若给 `Effect` 加上会抛的新成员（`TTS` 的朗读调用），
  且把它排在 `SAVE` **之前**，这一条立刻变成可构造 ⇒ 那时必须补上
  「前一条抛错、后一条仍执行」的正向用例（1.14 已有同型：G69）。
  ⚠️ **📎 2026-10-17：这条恢复条件在 Story 1.16 未触发** ——
  1.16 裁决 6 明确**不接** `TTS`（`epics.md` 里 1.16 的 AC 零 TTS 字样，按 R-32 无权做）。
  ⇒ 本条**仍然挂着**，且因为 `TTS` 已归「无归属 story」，它现在**没有会被触发的 story**。
  —
  `src/core/effects.ts`, `src/app/effects-runner.ts`, `tests/app/effects-runner-save.test.ts`

### 2. `readSave()` 成功时 `degraded.clear()` —— 会连带抹掉别的 key 的降级项

- **事实**：`readSave` 读成功与 `writeSave` 写成功都调 `degraded.clear()`，
  清的是**整张 Map**，不是「自己那条」。
- **今天的理由**：读到一份可用的存档 ⇒ 之前记的 `parse` / `schema-version` 已不成立；
  写成功 ⇒ 存储恢复，新写进去的这份必然 JSON 合法、版本正确。
- **张力的形状**：如果将来出现「读成功但写仍失败」并存的场景（例如 `setItem` 恒抛、
  而某条内存里的值恰好还在），`readSave` 的一次成功会把 `write` 的降级项**一起抹掉**，
  面板于是显示「没在降级」而孩子其实正在丢进度。
- **恢复条件**：1.17 接到调试面板、且**真的**出现「读写降级可并存」这条路径时，
  把 `clear()` 收窄成「只删本次成功所对应的那个 key」。
  —
  `src/services/save.ts`

### 3. `parseSaveFile` 只做底线形状校验 —— 对局的新字段没有对应的拒绝判据

- **事实**：`parseSaveFile` 只校验 `progress` 的两键类型 + `currentGame` 是不是对象。
  对局内部的合法性**全部**依赖 app 层的 `assertInvariants`（AC-D1）。
- **张力的形状**：`assertInvariants` 查的是**不变量**，不是**结构**。
  若 1.16 给 `State` 加了一个字段而 `assertInvariants` 没覆盖它，
  一份来自旧内容版本的存档会把这个字段缺着地灌进 `state.value`，
  而**没有任何一条判据会响**。
- **恢复条件**：1.16 / 1.17 每次给 `State` 加字段时，**同一次改动里**确认
  `core/reducer.ts` 的 `assertInvariants` 覆盖了它（并在 story 文档里留一行）。
  —
  `src/services/save.ts`, `src/core/reducer.ts`

### 4. `enterLevel()` 是今天**唯一**的读档入口 —— 别的「进关」路径不会恢复

- **事实**：读档挂在 `store.enterLevel()`（裁决 3：不做模块求值期读取）。
  任何新增的「回到战场」路径（1.16 的重打按钮、1.17 的「跳到某单元」）若不经过
  `enterLevel()`，**就读不到存档**。
- **为什么现在不做别的**：今天只有 `StartView` 一个入口，`enterLevel()` 就是全部。
  过早抽一层「确保进关前恢复过」的包装，等于为还不存在的第二条路径先造抽象。
- **恢复条件**：新增第二条进关路径的同一个 story 里，必须确认它走 `enterLevel()`
  或显式调 `restoreFromSave()`（守卫 **G86** 只管「谁调 `readSave`」，管不到
  「每条进关路径都调了」—— 那需要另一条守卫）。
  —
  `src/app/store.ts`

### 5. R-14 在 `services/` 与 `app/` 的那部分仍无守卫

- **事实**：`tests/scaffold/save-boundary.test.ts` 的 R-14 补卫只扫 `src/core/**`
  的「零 `console.`」。R-14 允许 `services/` / `app/` 「带模块前缀且不在逐帧路径」，
  而那两条判据放不进「零出现」这一条形式。
- **现状**：`[save]` 前缀由 **G85** 逐字断言（变异 M98 → 3 红），
  但那是**存档这一个模块**的判据，不覆盖 R-14 全域。
- **恢复条件**：累计到**第三个**带前缀日志的服务（`audio` / `save` / 第三个）时，
  把「前缀合规 + 不在逐帧路径」做成一条通用守卫，而不是继续逐模块手写断言。
  —
  `docs/rules/architecture.md`, `tests/scaffold/save-boundary.test.ts`


## Deferred from: story-1-16-关卡流程-通关-失败与推进 `[DS]` (2026-10-17)

### 1. ✅ 已关闭 —— 问答卡面的三个生命周期缺口（由 1.11 的 `[CR]` 移交给 1.16）

- **原文三条**：`spokenEntryId` 跨局残留（重打后首题无声）/ `lastQuestion` 兜底覆盖全部
  无 `question` 的相位（终态下卡面仍可点）/ `pickedOptionId` 终局相位下不清。
- **处置**：`shown` 已按裁决 7 收窄到**只兜 `awaiting-build`**；
  `spokenEntryId` 已按「`turn` 跃迁到 1」复位。
- ⚠️ **只关了两条，第三条本来就成立** —— 变异实测（把复位体整个删空）只红 1 条，
  就是朗读那条。`pickedOptionId` / `lastQuestion` 由 phase 的 watch 兜住了
  （`RESTART_LEVEL` 必定落在 `awaiting-answer`）。原移交单把三条都写成真问题，
  那是推断，按实测更正。

### 2. ✅ 已关闭 —— 「`enterLevel()` 是唯一读档入口」的**重打分支**

- **原文**（1.15 deferred 第 4 条）：任何新增的「回到战场」路径若不经 `enterLevel()`
  就读不到存档。
- **裁决 4(a)**：重打**刻意不读档** —— 走 `enterLevel()` 会把**刚失败的那一局**
  从盘上读回来，孩子点了「再来一次」却回到同一个死局。
  ⇒ 这条 deferred 的**恢复条件对重打这一支不适用**，改由守卫钉住：
  G93（`RESTART_LEVEL` 只有一个调用点，且是 store 门面）+
  它那条「重打绝不走 `enterLevel`」的用例。
- ⚠️ **新增的缺口**：G93 守的是「谁调」，**守不到「每条进关路径都调了」** ——
  1.17 的「跳到某单元」按钮若忘了读档，G93 一声不响。

### 3. 🆕 `onBeforeUnmount` 暂不实现（裁决 9，R-41 要求显式记）

- **事实**：`QuestionCard.vue` **没有** `onBeforeUnmount`，而
  `services/pronunciation.ts` **没有公开的 stop** ⇒ 若孩子点了重听后组件被卸载，
  朗读会一路播到结束。
- **为什么暂不实现**：已逐项查过组件里没有定时器 / 监听器 / objectURL 可漏；
  而今天**没有任何路径会卸载它**（重打不换视图，通关只改 `view`）。
  为一个不可达的场景写清理逻辑，等于凭想象引入一条会漏的生命周期。
- **恢复条件**：**出现第二条会切走 `QuestionCard` 的路径**时
  （1.17 的调试面板、1.18 的暂停覆盖层、或任何把 `view` 从 `level` 切走的分支），
  同一个 story 里必须先给 `pronunciation.ts` 补公开的 `stop`，再挂 `onBeforeUnmount`。
  — `src/components/quiz/QuestionCard.vue`, `src/services/pronunciation.ts`

### 4. 🆕 「下一单元」的 UI 路径只有纯函数，没有画面（2.5 的活）

- **事实**：`advanceUnit` / `hasNextUnit` 让「通关 ⇒ 进下一单元」这条链路在**纯函数**层
  成立，1.16 的接线也把它接上了；但**没有任何界面元素指向下一个单元** ——
  通关浮层的按钮是「回开始」，而 `StartView` 永远从 `FIRST_UNIT_NUMBER` 起手。
- **为什么本 story 不做**：Epic 1 只录了**一个**单元，做「下一单元」按钮等于
  给一个还不存在的内容做界面；而 GDD 逐字「无选关自由」（守卫 G92 钉着
  `src/` 下零 `UnitSelectView`）——「下一单元」这条**线性**路径与选关自由不冲突，
  但它的**画面归属**属 2.5（第二个单元录入时）。
- **恢复条件**：**2.5 录入单元 2 时**，同一个 story 必须补上「通关后进下一单元」的
  UI 路径；在那之前 `hasNextUnit` 恒为 `false`，`advanceUnit` 恒返回入参本身。
  — `src/core/hud.ts`, `src/components/hud/LevelOutcome.vue`

### 5. 📌 1.13 的 AC-B3 字面口径被 1.16 改写，而该 story 文档已归档 ⇒ 未同步

- **事实**：1.13 的 AC-B3 写的是「HUD 的进度只读内存里的进度」。
  1.16 把写盘点扩到了第 6 个（`RESTART_LEVEL`），并在裁决 11 里把「落盘看到的进度」
  改成了「**这一次结算之后**的进度」—— 这改的是 1.13 那条判据的**字面口径**。
- **为什么没同步**：按 R-40，`done` 的 story 文档一律 `git mv` 进归档目录，
  **本 story 不得改动任何已归档的 story 文档**，也不得在任何活跃文档里
  写出归档目录下的具体文件名 ⇒ 只能在这里按 story key 登记。
- **恢复条件**：下一次做文档治理（`/gds-correct-course` 或 QD 治理）时，
  把这条口径更正**一次性**回写进 1.13 的归档文档，并同步 `docs/rules/` 里
  与「落盘看到的进度」有关的任何表述。
  — `docs/rules/architecture.md`（R-06 段已追加同型经验，见下条）

## Deferred from: story-1-17-调试工具与会话回放 `[DS]` (2026-10-17)

### 1. ⏸ 1.15 第 2 条「把 `writeSave` 成功时的 `degraded.clear()` 收窄成只删本次那个 key」—— **仍未触发**

- **该条的恢复条件逐字**：「1.17 接到调试面板、且**真的**出现『读写降级可并存』这条路径时」。
- **实测结论：条件为假。** 1.17 的面板**只读** `saveDegradations()`（AC-E4），
  而「重试写入」（AC-E3）走的是 `retrySaveWrite()` → `writeSave()`，那是**又写一次**，
  不是「读一次失败 + 写一次失败」并存 ⇒ 全仓**零处**同时持有读降级项与写降级项。
- ⚠️ **不因为「1.17 做完了」就顺手结掉** —— 与本文件 1.15 段第 2 条、
  1.13 第 2 条同一处置。1.17 的 story 文档 AC-A3 逐字写的就是这一句。
- **恢复条件不变**：将来出现一条**同一次故障里既读失败又写失败**的路径时，
  收窄 `clear()`；在那之前整表清空是**有意的**（一次成功写入说明这一路通了）。
  — `src/services/save.ts`、`src/components/debug/DebugPanel.vue`

### 2. ⏸ 1.16 第 3 条「`onBeforeUnmount` 暂不实现」—— **仍未触发，且这次实测过一次**

- **该条的恢复条件逐字**：「**出现第二条会切走 `QuestionCard` 的路径**时
  （1.17 的调试面板、1.18 的暂停覆盖层、或任何把 `view` 从 `level` 切走的分支）」。
- **实测结论：1.17 没有新增这样的路径。** 面板挂在 `App.vue`（偏离 11），
  它**不改 `view`**；`jumpToTurn()` 只在 `view !== 'level'` 时**调** `enterLevel()`
  （那是从 `start` 切到 `level`，卸载的是 `StartView`，不是 `QuestionCard`）。
  ⇒ 今天会卸载 `QuestionCard` 的仍只有「回开始」那一条（1.16 交付时就有的）。
- ⚠️ 顺带更正该条的一处**措辞失实**：它写「1.17 的调试面板」像是 1.17 一定会加这条路，
  而 1.17 的裁决 9 逐字要求面板**不得**做成可路由到达的页面（G113 钉着）
  —— 那条恢复条件里的「1.17」已被 1.17 自己的裁决排除。**留这一行是因为
  否定结论本身值得留痕**，否则下一个人会重新推一遍「面板是不是切了 view」。
  — `src/components/quiz/QuestionCard.vue`、`src/app/store.ts`

### 3. ✅ 1.16 第 2 条留的那个「G93 守不到『每条进关路径都读了档』」缺口 —— **1.17 已补上**

- **原文**：1.16 的裁决 4(a) 让「重打」**刻意不读档**，那条 deferred 因此改由 G93 守着，
  但同时逐字记下一个缺口：「G93 守的是『谁调』，**守不到『每条进关路径都调了』** ——
  1.17 的『跳到某单元』按钮若忘了读档，G93 一声不响。」
- **1.17 的处置**：新增守卫 **G118**，正面判「`jumpToTurn()` 的函数体里有 `enterLevel(`
  且**没有** `state.value = …`」（源码判据 + 「从开始界面跳回合确实读到了存档那份对局」
  的行为判据，变异 **M141 实测 2 红**）。⇒ 那条缺口关闭。
  — `src/app/store.ts`、`tests/app/jump-turn.test.ts`

---

## Deferred from: code review of story-1-16-关卡流程-通关-失败与推进 `[CR]` (2026-10-17)

三层对抗评审（Blind Hunter / Edge Case Hunter / Acceptance Auditor），
diff 区间 `6dfd31e..976bf4f`。验收面全绿（11 条裁决 100% 落实、G87–G96 全部有效、
M101–M110 共 25 红无 0 红），**无一条守卫假绿**。以下 8 条真实但本 story 不做。

### 1. `backToStart()` 不停 BGM / 不清 `state.value`

- **来源**：edge #1 + blind #3（合并）
- **BGM 部分**：AC-D3 已**逐字裁决**「`backToStart()` 不停 BGM，BGM 停止策略属 1.14/1.18」
  ⇒ 已登记到 1.18，不是新债。
- **`state.value` 部分（盲审补充）**：该门面只写 `view.value = 'start'`，`state.value`
  仍停在终态相位。将来任何「把 `view` 切回 `level` 却不走 `enterLevel()`」的路径会让浮层错位。
- **今天不成立**：进 `level` 视图必经 `enterLevel()`，1.17 实测未新增这样的路径
  （与 deferred-work 里 story-1-17 第 2 条的核查结论同款）。
- **恢复条件**：出现第二条不经 `enterLevel()` 进关卡的路径。
  — `src/app/store.ts`

### 2. `LevelOutcome` 缺无障碍语义（`role="dialog"` / `aria-modal` / 焦点管理）

- **来源**：edge #2 + blind #15（合并；盲审的 `--space-panel-pad` 回退 `NaN` 一说已驳回）
- **缺口**：根节点无 `role="dialog"` / `aria-modal`，按钮无 `autofocus`、无 `focus` 转交
  ⇒ 屏幕阅读器读不到「新对话框出现」，键盘用户需先 Tab 整棵树才能抵达按钮。
- **不属 1.16 的口径**：NFR13 在本 story 收窄成「堵假可点」，无障碍未列入 AC。
- **恢复条件**：1.18（目标平板落地）或 3.5（平板竖屏布局细节打磨）任一开工时并入。
  — `src/components/hud/LevelOutcome.vue`

### 3. G91 的正向词正则比 AC 更严

- **来源**：blind #12
- **缺口**：`expect(w.text()).toMatch(/读完|完成|太棒|过关/)` 把允许词写死成四个；
  把文案换成同样合规的「通关啦！」即红。AC-E1 零字面约束。
- **为什么不属 patch**：负向文案已由 G91 的 `FORBIDDEN_IN_TEXT` 正向黑名单兜住，
  这条正向断言只是加保险。放宽它属于**改判据**（R-57 需留痕），不是修 bug。
- **恢复条件**：下一次改通关心案时，顺手把它改成「不匹配任何负向词表」的表述。
  — `tests/components/level-outcome.test.ts`

### 4. G94 用花括号深度计数切 `shown` 的函数体

- **来源**：blind #9
- **缺口**：单层 `depth` 计数、不识别模板字符串 / 正则字面量里的 `}`。
  `shown` 函数体一旦新增任意嵌套 `{}`，循环提前退出 ⇒ G94 静默取到被截断的字符串而失效。
- **今天不成立**：`shown` 当前无嵌套，判据正确。
- **恢复条件**：`shown` 函数体首次出现嵌套 `{}` 时换成真解析（正解不是再加一个计数器）。
  — `tests/components/quiz-card.test.ts`

### 5. `no-unit-select` 的反向探针只覆盖 `views/` 这一种路径形态

- **来源**：blind #16
- **缺口**：探针只往 `probe` 里塞 `views/UnitSelectView.vue`；若有人把同名文件建到
  `components/` 下，这条守卫不响。G92/G113 的主体判据（扫全 `src/`）仍会红，
  但这条「反向自检」本身不提供那层保护。
- **恢复条件**：判为 P3。真出现时是显眼的架构违例（GDD 禁止选关），不是静默回归。
  — `tests/scaffold/no-unit-select.test.ts`

### 6. `driveLevel` 的 `guard > 200` 与内容长度耦合

- **来源**：blind #17
- **缺口**：Epic 2 录入第二单元后一局可能超过 200 步，抛的是「跑了一局还没通关」而非可读诊断。
- **恢复条件**：Epic 2 录第二单元时同步调阈值，并在 helper 注释里写死「阈值怎么跟着内容长」。
  — `tests/app/level-flow.test.ts`

### 7. `reducer` 的 `masteredEntryIds` 追加时不去重

- **来源**：edge 层复核时降级为 P3
- **缺口**：`masteredEntryIds` 走 `[...prev, id]`，`assertInvariants` 不查内部重复
  ⇒ 一旦某条路径重复记同一个词，数组静默膨胀。
- **今天不成立**：运行时由 `nextQuestion` 的 `includes` 过滤兜住，跑不到重复。
- **归属**：1.5 交付的既有行为，1.16 未触碰该行。
  — `src/core/reducer.ts`

### 8. `restoreNextUnit` 的两条降级路径只回退 `state`、不回退 `progress`

- **来源**：blind #2 + auditor F-02（合并）
- **缺口**：存档指向未录入单元、或 `buildStateFor` 抛错时，两条分支都只 `console.warn`
  ⇒ `state` 停在单元 1 而 `progress.currentUnitIndex` 仍指向那个不存在的单元，二者长期不一致。
- **不是疏漏**：「进度**不回退**」是该函数注释里**逐字写下的裁决**。
- **今天不可达**：Epic 1 `currentUnitIndex` 恒 0 ⇒ `+1` 恒为 1 ⇒ 单元 1 已录入 ⇒ 两条分支都走不到。
- **恢复条件**：Epic 2 出现第二个单元时重新评估「钳到合法范围」还是「显式清零」。
  ⚠️ 本 story 对它的**措辞不一致**已单列为 patch，不在本条。
  — `src/app/store.ts`

## Deferred from: story-1-18-目标平板落地-竖屏布局-离线与部署 `[DS]` (2026-10-17)

### 1. 🔥 AC-H1：架构组件树/模块表**没有**本 story 新增的模块

- **事实**：`game-architecture.md` 的组件树与模块表里**列不出**下列模块，本 story 也没有改那份文档：
  `src/core/hud.ts`、`src/services/asset-prefetch.ts`、`src/services/sw-registration.ts`、
  `src/services/pronunciation-status.ts`，外加 `src/components/hud/PronunciationOverlay.vue` /
  `UpdateNotice.vue` 与 `sw/sw.ts`、`sw/sw-rules.ts`。
  ⚠️ 其中 `core/hud.ts` 在那份文档里**出现过两次**，但都是「上面那两个 `progress` 键名的唯一实现方是
  `src/core/hud.ts` 的 `Progress` 接口」这类**旁注** —— 它仍然不在组件树/模块表里。
  ⇒ **不得声称「架构已定」**（R-32：架构文档的原文优先；这里**原文没有这一项**）。
  ⇒ 逐项检索结果：`grep -c 'asset-prefetch\|sw-registration\|pronunciation-status\|PronunciationOverlay\|UpdateNotice\|sw-rules' game-architecture.md` = **0**。
- **本 story 的处置**：只登记，不代劳改架构文档 —— 改它是 `[GA]` 的职责。
- **恢复条件**：**下一次改架构文档（`[GA]`）时补进组件树/模块表**。
  ⚠️ 补的时候注意两处不是「照抄进列表」就行的：
  ① `sw/` 与 `scripts/` **不在 `src/` 里**，且 R-61 明令它们不得 import `src/` ——
     它们在架构图上属于**构建期 / 运行时外壳**，不是应用组件；
  ② `asset-prefetch.ts` 必须在图上标明它**不被任何组件直接调用**（由 `app/store.ts` 的
     `enterLevel()` 之后起异步），否则下游会以为可以改成组件内触发 ——
     那正是裁决 4 要避开的硬约束 8 冲突。
  — `_bmad-output/planning-artifacts/game-architecture.md`

### 2. AC-H2：8 项在 `game-architecture.md` / `gdd.md` / `epics.md` 中**均无原文**

- 逐条给出**本 story 的定案 + 守卫**，或显式标为待办 —— 不留「实现者自行决定」的口头空白。

| # | 条目 | 本 story 的处置 | 守卫 / 落点 |
|---|---|---|---|
| ① | CSS 断点 | **定案**：`src/styles/responsive.css`，全文件**只有一条**媒体查询 `@media (max-height: 900px)`。⚠️ 它是**高度**断点、不是宽度断点 —— 本 story 的形态问题是「竖屏 800×1280 下 HUD 把战场顶出视口」，可用的量是**高度**，不是宽度。⚠️ **宽度断点刻意为零**（本 story 之前全仓 `@media` 数量为 0，实测）：竖屏平板的宽度区间恰好由 `min-width: 0` + 列轨布局自然适配，硬加 `min-width` 断点只会带来第二套要重测的排版。**不写进 `tokens.css`**（R-12：已定稿 token 的值一个都不许改） | `portrait-layout.test.ts`（源码级） |
| ② | viewport meta 取值 | **定案**，架构文档无原文但仓库 `index.html` 一直有：实测 `width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover`。`maximum-scale=1` 有实测依据（Android 双击缩放的 300ms 延迟会击穿 FR78 的 ≤100ms 预算），`viewport-fit=cover` 让 `env(safe-area-inset-*)` 生效。⚠️ **不许动** | `portrait-layout.test.ts`（源码级断言，非 PWA 组） |
| ③ | 像素密度 / DPR | **显式不做** —— 战场格子靠 `aspect-ratio` 与列轨布局，图标是 SVG（矢量），PNG 只用于 PWA 主屏图标（由浏览器自己缩放）。⇒ 无需在架构文档登记 DPR 策略 | —— |
| ④ | manifest 字段清单 | **定案**（架构无原文）：8 个必填文本字段 + `icons`；`start_url`/`scope`/`id` 三者一律 `/plantsgame/`（换域名时 `id` 不失效）。⚠️ `id` **故意不是** `https://…` 形式 | `verify-deploy.ts` ② 组 12 项 + `pwa-manifest.test.ts` |
| ⑤ | precache 与 runtime cache 的分层比例 | **定案**：应用外壳（html/js/css）precache；`.mp3`/`.svg` 走 runtime `CacheFirst`。⚠️ **不是全量 precache** —— 架构决策 6 逐字「全量预载 400 张必超冷启动 3s」；本 story 只 precache 外壳，图片是进入单元后异步预取（AC-E2） | `sw/sw-rules.ts` + `pwa-sw-guard.test.ts` |
| ⑥ | gzip / 缓存头 / CI | **部分定案、部分待办**：缓存头要求写进 `docs/deployment.md` §3 —— `sw.js`/`manifest` 必须 `no-cache`（SW 脚本自身长缓存会让换代永远不生效），带哈希的 JS/CSS 可 `immutable`，**媒体 mp3/svg 必须单独一段**（它们的 URL 稳定，如 `u1-dog.mp3`，长缓存会把旧录音冻住）。⚠️ **待办**：当前托管方（GitHub Pages）**没有官方的自定义缓存头能力**，只有全局 10 分钟 ⇒ 要真正生效必须换托管或加 CDN | `docs/deployment.md` §3；缓存头本身列入**人工待验清单** |
| ⑦ | SW 注册失败在三层错误策略中的归类 | **定案**：归**运行时层** —— 非安全上下文不注册、`[sw] WARN`、静默继续；**禁止白屏或错误页**（裁决 7）。⚠️ 这与架构把「内容错误」归内容层、「渲染错误」归渲染层的两分法不同：**离线能力缺失不得让孩子看见任何东西** | `sw-insecure-context.test.ts` / `sw-registration.test.ts` |
| ⑧ | 语音浮层的定位约束 | **定案**：`PronunciationOverlay` 排在 `<BattleField />` **之前**、是普通流元素 ⇒ 几何上不可能遮挡战场任何一格（AC-D1）；高度恒定，朗读开始/结束都不让战场位移。⚠️ 刻意**不用** `position: absolute` —— 那要赌「它不会在某个视口下压到战场上」 | `portrait-layout.test.ts`（模板顺序 + 零绝对/固定定位 + 零负 margin） |

- **恢复条件**：下一次 `[GA]` 时，①②④⑤⑦⑧ 按上表补进架构文档；③ 保持「显式不做」并在文档里写明
  「引入位图素材时必须重新评估」；⑥ 的托管侧能力属运维事项，不进架构组件树。

### 3. ✅ 已闭合：1.13 遗留的「`/favicon.ico` 404」与「战场 3px 横向溢出」

- **① 3px 溢出**（本文件 story-1-13 那一节第 11 条第 ① 项）—— ✅ **已闭合**：AC-D4 把
  `repeat(9, 1fr)` 改成 `repeat(9, minmax(0, 1fr))`（`BattleField.vue`）。
  ⚠️ **不得**为此改 `.battle-grid` 的 `flex`（1.10 实测 `1 1 auto` 横向撑破到 1351px）。
- **② `/favicon.ico` 404** —— ✅ **已闭合**：AC-B9 新增 `public/favicon.svg` 并在
  `index.html` 链上（站点根相对，**由 Vite 按 `base` 重写**，实测产物为 `/plantsgame/favicon.svg`）。
  ⚠️ 顺带新增 `public/icons/icon-192.png` 供 iOS/鸿蒙添加到主屏取用。

### 4. ⏸ 仍需**真机**，本 story 自动化证明不了（AC-B8 / AC-F5）

- **① AC-B8 离线可玩**（飞行模式下打开已缓存的单元，可打开、可答题、可通关）——
  单元 1 全量资源实测 1.8 MB，装得下。⚠️ **jsdom 与 headless 都证明不了**：
  spec §13.5 明令禁止用 headless 浏览器代替真机，`DevTools` 的离线开关结果也不许说成「离线验证已通过」。
  **恢复条件**：Story 1.19 真机试玩时验，结论回填本条。
- **② `--color-hud-panel: #1f2d11` 的真机校准**（本文件 story-1-13 那一节第 8 条）——
  实测算出的对比度是**算术**结论，不是「孩子看得清」的结论。
  **恢复条件**：真机上复算阳光 / 心 / 白字三条；要改值必须先跑 `palette.test.ts`。
- **③ `--dur-slow`(400ms) 用于掉心动画**（本文件 story-1-13 那一节第 10 条）——
  **恢复条件**：1.18/1.19 真机录制里若「心碎了」看不见或拖沓，只许改这一处。
- **④ 竖屏的布局数值**（HUD 变高时页面是否滚动、战场是否被推出视口、
  `minmax(0, 1fr)` 之后 `scrollWidth` 是否真的 ≤ `clientWidth`）——
  jsdom **不做布局**，`getComputedStyle` / `getBoundingClientRect` 在 jsdom 里是**假绿**（AC-D7）。

---

## Deferred from: story-1-19-单元-1-首次试玩验证 `[DS]` (2026-10-17)

> 📎 **指针（2026-10-20，Story 1.19 `[CR]` 第七轮）**：本轮实测到「`?raw` 的 Vite 转换缓存
> 会让变异验证给出假绿」，已按 R-35 **写进 `docs/rules/testing.md` R-50 的「第 0 步」**
> （跑变异验证前先 `rm -rf node_modules/.vite`）。**规则正文不在此复述**（R-37 复制链）——
> 要查那条直接读 R-50，本文件只留指针。

### 1. 🚨🔥 定时炸弹：`hasNextUnit` 隐含「一局 = 一个单元」，Story 2.5 录入单元 2 时爆炸

**恢复条件写死为：Story 2.5（内容批次-1-单元-2-单单元试点）录入单元 2 之前。不得顺延。**

- **事实**（Story 1.19 裁决 5 实测）：`src/app/store.ts` 的 `hasNextUnit(next: State)` 逐字是
  「`next.phase.kind !== 'level-complete'` 就 false；否则查 `UNITS` 里有没有 `next.unitNumber + 1`」。
  Epic 1 只录了单元 1 ⇒ **恒 false** ⇒ `advanceUnit` 永远拿 false，`currentUnitIndex` 永远 0。
- **1.19 之前它是一个理论隐患；1.19 之后它是一个带日期的 bug。**
  切片落地前「一局 = 整个单元」，每打一局就通关一次；切片落地后「一局 = 至多 10 题」，
  单元 1 因此变成 **4 局**（10/10/10/7）⇒ **每一局通关都会命中本函数的第一条判据**。
  今天它被第二条（下一个单元录了没有）挡住。
- **爆炸形态**：Story 2.5 录入单元 2 的那一天，第二条放行 ⇒
  孩子**打完单元 1 的第一局**就被推进到单元 2，剩下 27 个词**永久学不到**。
  症状是「进度条卡在 10/37 不动」＋「单元 2 突然出现」，而界面上没有任何东西说明原因。
- ⚠️ **本 story 刻意没有改它**（R-35）：关卡推进语义是产品决策，属 `[CC]`。
  已在 `src/app/store.ts` 的 `hasNextUnit` 注释旁逐字写明「本判据隐含『一局 = 一个单元』，
  1.19 起不再成立」＋爆炸条件＋正确修法的方向。
- **正确的修法方向**（供 2.5 开工时决策）：让「**本单元全部词已掌握**」成为推进条件，
  而不是「打了一局」。⚠️ 但这会牵动 `advanceUnit` 与进度条的分母语义，属 `[CC]` 范围。
- — `src/app/store.ts`、`src/core/hud.ts`

### 2. ✅ 已问题化：手牌区「37 张 ≈ 8 屏多」不再成立（E2）

- 原条目（本文件 story-1-12 一节「手牌区横排的滚动距离（37 张 ≈ 8 屏多）」）实测的
  `clientWidth` 669px / `scrollWidth` 5348px ≈ **8 屏多**，是 1.12 的一处布局隐患。
- **1.19 切片落地后该前提消失**：`handCards()`（`src/core/build.ts`）从 `state.deck` 取卡，
  而本局题单至多 10 条 ⇒ **手牌区本局最多 10 张**。
  自动化侧已钉住（`tests/app/store-deck-slice.test.ts` 的 AC-B10 一节）。
- ⚠️ **不许把旧的 8 屏数字继续引用** —— 它描述的是一个已经不存在的局面。
  真机上的实际张数与观感由 1.19 的 E2 观察项记录。
- — `src/core/build.ts`、`src/core/deck-slice.ts`

### 3. ⏸ E 组观察项：**本 story 只观察不改**，恢复条件随各自归属 story

| # | 观察项 | 恢复条件 / 归属 |
|---|---|---|
| E1 | 孩子能否在**不看文字**的情况下读出「只有中间那一行能建塔」（`--color-overlay-inert` 的感知强度） | Story 3.5（平板竖屏布局细节打磨）；⚠️ Chromium 上实测仅 −10% 亮度，**真机不是像素能判的** |
| E3 | 「心碎了」看不看得清（`--dur-slow` 400ms 的真实观感） | ⚠️ **只许改这一处**；改完复跑 AC-G1 第 9 项（computedStyle 里不许出现字面量毫秒） |
| E4 | 战场是否横向撑破容器 / 格子变扁（`flex: 0 0 auto` + `content-box`） | Story 1.10 的两处 Debug Log 已知缺口；jsdom 无布局引擎 ⇒ 自动化证明不了 |
| E5 | 相邻行能不能开火（`turn.ts`「只有僵尸所在那一行的塔开火」） | ⚠️ 1.12 逐字写着「本 story **不改战斗判定**」；属 `[CC]` |
| E6 | 合法塔位从 35 格降到 7 格 | 已被裁决锁死的难度维度；**验难度曲线时不要当 bug「修回去」** |

### 4. ⏸ 真机项仍未验 —— 1.19 的自动化**证明不了**的那一批

⚠️ 1.19 交付的是「切片实现 + 守卫」，**真机试玩尚未执行**。以下逐条如实标「未验」，
**不许**在任何后续文档里把它们写成已验证（1.18 判例：「DevTools 的离线开关结果也不许说成
『离线验证已通过』」）：

- ⏸ **AC-B8 离线可玩**（本文件上方 1.13 一节第 4 条 ①）—— 恢复条件不变：**真机飞行模式**。
  ⚠️ 1.19 改动过构建产物（切片），⇒ **要在切片后的新部署上重新验一次**，
  旧构建上验过的结论不能顺延。
- ⏸ **D1 独立完成 / D2 主动要求再玩一次** —— D2 是整条 story 的生死线判据
  （GDD 逐字：「若孩子不愿玩，后续所有内容投入都无意义，**不应推进 Epic 2**」）。
  ⚠️ 未验 ⇒ **不应推进 Epic 2**。
- ⏸ **D3 单局时长 / 每题周期**（AC 逐字要求实测值，区间 3-5 分钟 / 20-30 秒）
- ⏸ **D4 失败门槛的真机侧**（自动化侧已由 `npm run balance-sim` 实测复现「第 6 回合 3 心耗尽」，
  真机侧待对照；⚠️ 不符 ⇒ **停下来问人**，不许调参，R-20）
- ⏸ **D5 长句朗读关键词可提取性 + 英式/美式音色可接受性**
  ⚠️ **本 story 要顺手取的**目标平板 `speechSynthesis.getVoices()` 列表
  —— 那正是 Story 1.2 卡了这么久的输入。**本 story 不改 `VOICE_PRIORITY`**（修法被冻住，
  恢复条件是「拿到真机音色列表」）。
- ⏸ **D6 音效/BGM 首次点击后是否出声** —— 生产包 DebugPanel 打不开
  （`isDebugPanelRequested()` 首行 `if (!import.meta.env.DEV) return false`）
  ⇒ **静默失败只能靠「听到了」判，不能靠「没看到降级提示」判**。
- ⏸ **D7 语音浮层在目标设备上是否遮挡战场** —— 守卫 G135 只证**源码级**性质
  （模板顺序 + 零绝对/固定定位），**证明不了真机几何**（R-01）。
- ⏸ **D8 断点续学真机侧**（自动化侧已钉：存档存完整 `State`，恢复的是原题单 10 条）
- — `_bmad-output/implementation-artifacts/1-19-单元-1-首次试玩验证-epic-1-的生死线.md`

- — `_bmad-output/implementation-artifacts/1-19-单元-1-首次试玩验证-epic-1-的生死线.md`

## Deferred from: story-1-19-单元-1-首次试玩验证 [DS] 第二轮 — 横屏（2026-10-17）

> 📎 本节记的是**试玩中断后修横屏时看到、但当场没修**的东西（R-35）。
> 修复本体（横屏分栏）已落在 `src/styles/responsive.css` 与 story 1.19 的「组 H / Task 6」。

### 1. 🚨 矮视口的同源缺陷：`@media (max-height: 900px)` 仍把整个视口分给战场

**事实（实测）** 那个块给战场的是
`height: calc(100% - var(--touch-min) - env(safe-area-inset-bottom, 0px))`，
而 `100%` 是 `.level-view` 的**全部内容盒高度** —— 它**没算 HUD、朗读浮层、
题卡、手牌这四个兄弟节点**。

**横屏侧已修**（新块显式 `height: auto` 压住它，G167 钉住）。
**矮竖屏侧没修**：视口比高更宽时不进新块，所以 600×900 这类形状仍在走老路。

**为什么当时没一并修** ① 那不在「孩子把平板转过来」这个故障面上；
② 改它要重新推导「战场与题面在一条竖列里怎么分配高度」，
与本次「宽就分栏、窄才堆叠」的判断是两条独立的题，混在堵口修复里会看不清因果。

**恢复条件** 出现下列任一情况即处理：
- 真机（或 `min-aspect-ratio` 未覆盖的视口）实测出现「战场把题面推出视口」；
- Epic 3 的布局打磨开工（`epics.md` 的 Story 3.5「平板竖屏布局细节打磨」是天然落点）。

**⚠️ 修它时必须先量的那一件事** 别学我这次先入为主：先量 `.battle-grid` 的
`computedHeight` 与 `.level-view` 的 `clientHeight`，确认那条规则**是不是真的在生效**，
再决定改什么。（我这次先猜「它被 scoped 压过、是条死规则」，实测 `736px = 784 − 48`
证明它活着 —— 差点去修一条没问题的东西。）

### 2. ⚠️ 横屏下的视觉遗留：左栏底部约 190px 空白

**事实（实测 1280×800）** 战场是**宽度约束**的：左栏 832px 宽 ⇒ 战场 519px 高，
而左栏可用 768px ⇒ 底部余 ~190px。

**为什么留着** 不影响可用性；把战场再放大就得动列宽比例或改战场尺寸策略，
那是设计题，塞进一次堵口修复里会看不清因果。**本次刻意不做无关重排。**

**恢复条件** Story 3.5 布局打磨时一并看；若真机试玩反馈「战场看着偏上」也提前处理。

### 3. ⚠️ 横屏是否就是平板那次「不能种植」的唯一原因 —— **仍未验**

- 横屏缺陷本身**已坐实**（截图 + 逐尺寸实测：1280×800 下 `.question-card` `top=875` > 视口 800）。
- 但**真机旋转对照没做**（story 1.19 的 Task 6.11 未勾）。
- **用户在平板上的对照做法**：竖屏打开 dev server 玩一题拿到卡，**再把平板横过来** ——
  修好后应当画面原地不变。若竖屏正常而横屏修好后**仍**「不能种植」，
  则本 bug 不是唯一原因，**继续查「平板上有没有声音 / 孩子能否把听到的词对上图」**。
- ⚠️ 与 D1–D8 一并处理即可（同一趟真机试玩）。
- — `_bmad-output/implementation-artifacts/1-19-单元-1-首次试玩验证-epic-1-的生死线.md`

---

## Deferred from: code review of 1-19-单元-1-首次试玩验证-epic-1-的生死线 `[CR]` (2026-10-18)

> 三层对抗评审（Blind Hunter / Edge Case Hunter / Acceptance Auditor）+ 主评审逐条回代码核验后剩 12 条。
> 范围：`cd49c67..521770c` 的代码部分。**这 12 条全部是「真实存在但不由本次改动引入」或「落在本次改动之外」的**，
> 不阻塞 1.19 转 done，但每一条都注明了它会在什么时候变成真的。

### 1. 存档对局不合法 ⇒ 跨局进度被清零，而 1.19 之后清零直接决定「下一局考哪 10 个词」

- `src/app/store.ts:374`：`restoreFromSave` 的 catch 分支把 `progress` 重置成 `{ currentUnitIndex: 0, masteredWordIds: [] }`。
- 这段是 1.16 AC-D4 的既有降级路径，本 story 没动它。
- ⚠️ **1.19 放大了影响面**：`masteredWordIds` 现在是题单切片的唯一输入（裁决 2），清零的代价从「进度条上一个数字」变成「下一局考哪 10 个词」。
- 该分支既无测试，也只留一条 `console.warn`。孩子侧看到的是「我学过的东西全没了」。
- **恢复条件** 存档降级路径重做时（与 M2 一并看）。

### 2. `masteredWordIds` 里混进一个非字符串 ⇒ 整份进度归零，且同一个失败信号有两种结局

- `src/app/store.ts:336`：`readSave()` 返回 null 时 `restoreFromSave` 直接 return，而 `progress` 此时还是模块初值。
- `parseSaveFile` 的结构校验对 `masteredWordIds` 是全有或全无 —— 一个坏元素 ⇒ 整份判失败。
- 🔥 **同一个失败信号现在有两种画面**：恰好覆盖整个单元 ⇒ 孩子看到「已学完」通关卡；不覆盖 ⇒ 回到第 1 局从头学。语义不一致。
- **恢复条件** 同第 1 条。

### 3. 损坏存档（`currentUnitIndex` 越界）下 AC-B6 的终态不可达

- `src/app/store.ts:410` 的 `restoreNextUnit` 先问「下一个单元录了没有」，不通就 `return` ⇒ 永远走不到 `buildStateFor`。
- 结果：HUD 显示「第 1 单元 · 37/37」的同时仍在考那 10 个词，`gained` 恒空 ⇒ 打完再进还是同一局。
- 正常路径（`currentUnitIndex: 0`）**不受影响**；改前这条路径留下一份 37 题的题单，同样错。**非 1.19 引入的回归。**
- **恢复条件** 存档损坏的降级语义统一时（AC-D4 组）。

### 4. AC-B4 / AC-B8 的表述只在「每局全对通关」这一条路径上成立

- 测试里 `playOneRoundWith(mastered)` 直接把 `masteredWordIds` seed 进存档，全仓没有一个测试走过「玩一局 → 进度推进 → 下一局切题单」的真实链路。
- 失败路径的实际行为：`core/effects.ts` 在 `level-failed ✅` 时存下那份**含原题单**的 state ⇒ `restoreFromSave` 的 `currentGame !== null` 分支不经过 `buildStateFor` ⇒ 重进/重打**仍是同样那 10 条**。
- 这是 AC-B5「重打不重切」的直接后果、**符合设计**，但 AC-B4「10/10/10/7」与 AC-B8「第 2 局与第 1 局零交集」都是无条件表述。
- **恢复条件** 真机试玩前先把这两条 AC 的前提（「每局全对」）写进 AC 正文；否则家长会把符合设计的行为读成 bug。

### 5. `sliceDeckForLevel` 返回内容层的同一批 `DeckEntry` 对象引用

- 纯度注释保证的是「不改动传入的两个参数」，实现上 `filter` + `slice` 换了数组、**元素仍是共享引用**；两条测试也只证明了数组层。
- 任何对 `DeckEntry` 的就地写会同时改到内容层那一份，且 `toEqual` 类断言仍全绿。
- **恢复条件** 首次出现「给卡打标记」类需求时。

### 6. `masteredWordIds` 是全局的，切片却是按单元做的

- `sliceDeckForLevel(entriesOf(unitNumber), progress.value.masteredWordIds)` 只处理了「含**词表之外**的 id」这一种存档残留，没处理「**词表之内、但属于别的单元**的 id」。
- Story 2.5 录入单元 2 且它复用了单元 1 的复习词（同一 `entryId`）时，进单元 2 直接得「已学完」终态、一次都玩不了，且没有任何东西提示原因。
- **恢复条件** **Story 2.5 录入单元 2 之前**（与裁决 5 那条同批处理）。

### 7. G160 / G161 挡不住第二份「题数」实现

- G160 只查切片上界的**字面量** `10`（`slice(\s*0\s*,\s*10\s*)`）且豁免整个 `src/core/deck-slice.ts`；G161 的 `LAYER_PREFIXES` 不含 `src/core/`。
- 第二份实现写成 `.slice(0, LEVEL_QUESTIONS)` 且住在 `src/core/other.ts` ⇒ 两条守卫全绿、两份判据分叉。
- **恢复条件** 切片判据需要第二次落点时（那时应该改成 G161 扫 core + 追常量引用，而不是加字面量）。

### 8. G163 / G165 的判据范围靠 `indexOf('\n}\n', start)` 切函数体

- `tests/guards/deck-slice-boundaries.test.ts:242/303/317`。缩进风格一变（顶格 `}`）判据范围静默截断，守卫不会红而它守的那行已不在扫描范围内。
- 同文件 G161 用的是文件级判据，两处口径不一致。今天对现有格式正确。
- **恢复条件** 给守卫补一个「判据范围」自测夹具时。

### 9. 宽屏分栏没有宽度下界

- `src/styles/responsive.css:163` 的 `grid-template-columns: minmax(0, 1fr) 25rem`，左栏可一路缩到 0；断点只有 `min-aspect-ratio: 1/1`。
- 窄横屏（如 568×320）右栏吃掉 400px、格子边长 ≈ 33px，远低于 `--touch-min` 的 48px —— 与该文件注释自己判「不可接受」的是同一种失败。
- 目标机型（2000×2560 / 1200×1920）横屏均为 1920+ 宽，**不落在区间内**。
- **恢复条件** 支持矩阵扩到窄横屏（或出手机版）时。

### 10. 战场行轨不足时溢出手牌行

- `grid-template-rows: ... minmax(0, 1fr) ...` + `.battle-grid` 只有 `align-self: start`：战场高度由**列宽**经 `aspect-ratio: 9/5` 推出（1280 宽 ⇒ 左栏 880px ⇒ 约 489px），轨道不随内容涨。
- 1280×660 一类视口下第 3 行可用高度不足 ⇒ 战场向下溢出、盖住第 4 行的手牌区，孩子点不到卡。`overflow-y: auto` 救不了「轨道不重排」。
- 注释声称「1280×800 及以上实测不产生滚动」，该阈值以下无覆盖。
- **恢复条件** 横屏布局打磨时（与「战场偏上」那条一并看）。

### 11. 全部跳过时 `nextQuestion` 返回 null ⇒ 技术错误抛给孩子

- `src/core/reducer.ts` 的 `CONTINUE` 分支：`next === null` 走 `rejectAction` **抛错**。
- 1.18 的隐含假设是一局 37 题（需连续 37 次词图 404 才触发），切片后只需 10 次。
- 另一侧：`skippedEntryIds` 局末随 `currentGame: null` 蒸发 ⇒ 一个每次都跳的孩子 `masteredWordIds` 恒空 ⇒ 空切片永不发生、永远卡在第 1 局的同一批 10 个词上，AC-B6 的终态也到不了。
- **恢复条件** 词图 404 率被真机验证之前；若真出现连续 404，先降级成「跳过全部 ⇒ 通关」而不是抛错。

### 12. 空题单终态下 `assertDeckRelations` 四条不变量全部真空成立

- `createUnitCompletedState` 把 `unlocked` / `masteredEntryIds` / `skippedEntryIds` 三套账都初始化为空 ⇒ 四条不变量对 `deck: []` 结构性成立，不提供任何约束。
- 「终态的 deck 必须是 `[]`」目前只有 `tests/app/store-deck-slice.test.ts` 一条 `expect(done.deck).toEqual([])` 守着；`tests/core/deck-slice.test.ts` 的「与 CONTINUE 终态同形」只比 phase/towers/grid/zombies、不比 deck。
- ⚠️ 典型失效：有人为「让进度条有分母」把终态的 `deck` 填成 `entriesOf(unitNumber)` ⇒ G165 绿、`assertInvariants` 绿、同形断言也绿。
- **恢复条件** 本 story 的 patch 项落地时补齐（本条与 patch 组第 5 条是同一处，一起改）。

- — `_bmad-output/implementation-artifacts/1-19-单元-1-首次试玩验证-epic-1-的生死线.md`

## Deferred from: code review of 1-19-单元-1-首次试玩验证-epic-1-的生死线 `[CR]` 第二轮 — 专项「植物不重复出现」（2026-10-18）

> 📌 本节三条**全部来自 `[CR]` 第二轮的专项三层对抗评审**（Blind Hunter / Edge Case Hunter /
> Acceptance Auditor），与上面第 1 节的 12 条**不重叠** —— 那一节评的是 1.19 实现的代码部分，
> 本节评的是一条**不在 1.19 任何 AC 中**的独立机制。
> ⚠️ **本轮 0 条 patch**：这条机制不是实现缺陷，是**规格空白 + 决策缺口**，
> 4 条 `decision_needed` 已写进 story 文档的 Review Findings，待用户裁决。

### 13. `unlocked` 没有唯一性不变量，而 `deck` 有

- `src/core/reducer.ts` 的 `assertDeckRelations` 显式断言题单唯一（逐字「题单有 N 条但只有 M 个不同 entryId」）并交叉校验 `unlocked ⊆ mastered`，但**没有**检查 `unlocked` 内部重复。
- 而它自己的注释逐字「刻意**保留**已解锁塔卡（FR33：同一张卡可反复建多株）⇒ unlocked 是数组不是集合」—— 这句注释解释了**为什么是数组**，但没解释**为什么不查重复**，两件事不是同一件。
- `src/services/save.ts` 对 `currentGame` 只判 `isPlainObject`、**无深层校验**；而 `restoreFromSave` 会对这份不可信数据跑 `assertInvariants` ⇒ 一份手改 / 损坏的存档 `unlocked: ["u1-cat","u1-cat"]` 满足**全部**现有断言。
- 后果：`handCards` 会渲染出**两张同图同造价**的手牌（`cost` 由 `costOf(entry.towerType, …)` 给出，重复卡共享塔型 ⇒ 造价也相同）。
- ✅ **正常游玩与 dev 的 `jumpToTurn` 都不可达**（实测证伪）：`applyAnswer` 把 `masteredEntryIds` 与 `unlocked` 同步追加，`nextQuestion` 跳过已掌握项 ⇒ 同一条不可能被画第二次；`jumpToTurn` 走 `applyAction` → `reduce` → `assertInvariants` 同一路径。
- **恢复条件** 存档深层校验加固时（1.17 的降级面板已登记资产 / 存档降级项，那是同一处的自然落点）。

### 14. `masteredWordIds`（名）与 `entry.entryId`（实）是两个 ID 命名空间，类型都是 `string`

- `src/core/deck-slice.ts` 的参数名叫 `masteredWordIds`、类型 `readonly string[]`，而成员测试写的是 `mastered.has(entry.entryId)`；`DeckEntry` 同时带 `entryId` 与 `wordId` 两个 `string` 字段。
- ✅ **今天没有功能 bug**：唯一调用点 `buildStateFor` 传的就是 entryId 级的 `progress.masteredWordIds`。**这是命名债，不是缺陷。**
- 风险：若将来任何调用点按**参数名的暗示**传 word id，过滤会静默变成 no-op —— `sliceDeckForLevel` 永远返回同样前 10 条，`advanceUnit` 那套判据一路绿灯，而症状是「玩第 2 局又是同一批词」。**没有任何东西会指向原因**（R-06 说的那类静默错）。
- **恢复条件** 若将来给切片加第二个调用点，或 `Progress` 的字段名与实际语义分家时。

### 15. 全仓唯一的塔型构成守卫只看整单元，粒度粗于「一局内」

- `tests/content/unit-01.test.ts` 逐字断言「单元 1 的 deck 全部是合法塔型（三塔型都出现，建造分支不会只走一半）」，判据是 `expect([...towerTypes].sort()).toEqual(['aoe', 'direct', 'slow'])`。
- 它守的是「整单元三型都出现过」，**不是「一局内怎么分布」** —— 实测某局 10 条全是 `direct` 时它照样绿。
- 且它是**内容层**守卫，本就不该承担切片编排的判据（`deck-slice.ts` 的头注释逐字「本模块是切片判据的唯一定义处」）。
- ⚠️ **本条是否值得修，取决于同一份 Review Findings 里 4 条 `decision_needed` 的裁决结果**：当前设计下 `docs/art-direction.md` §4.6 与 FR70 都允许「一局全是 direct」，所以在没有产品裁决之前加守卫 = 把一条尚未确立的规则钉死。
- **恢复条件** 用户对「植物不重复出现」这条需求给出裁决之后。

- — `_bmad-output/implementation-artifacts/1-19-单元-1-首次试玩验证-epic-1-的生死线.md`

## Deferred from: code review of 1-19-单元-1-首次试玩验证-epic-1-的生死线 `[CR]` 第六轮 — 批次 A（生产代码 src/）（2026-10-19）

> 评审范围 `cd49c679..168054c` 的 **src/ 批次**（1266 行 / 10 文件）。三层对抗评审，14 条原始发现 → 11 条保留 → 2 条驳回。

### 16. `jumpToTurn` 目标回合极大时，单击可产生约 1500 次 `localStorage.setItem`

- `src/app/store.ts` 的 `jumpToTurn`（`MAX_JUMP_STEPS = 500`）+ 1.19 给写盘表新增的 `awaiting-answer` 那一格（`src/core/effects.ts`）。
- 每个 jump 步走 `startRound()` 的三连同步 dispatch，其中两次触发写盘；加上每次 `answer` 一次 ⇒ 最坏 500 × 3 ≈ 1500 次写盘集中在一次点击里。
- `store.ts` 里那条 500 次写盘的注释是 1.19 之前就有的；**新增的 `awaiting-answer` 格把它大约翻了一倍**，本 story 没有加去抖或批量。
- ✅ 只影响调试面板（生产包打不开，见 1.19 裁决 6）⇒ 对孩子零影响。
- **恢复条件** 若把 `jumpToTurn` 暴露到生产包，或低端平板上调试时观察到卡顿时。

### 17. 一次 `startRound()` 里连续两次写盘（`round-over` 紧接 `awaiting-answer`）

- 1.19 `[CR]` 第一轮给写盘表补了 `awaiting-answer`，而 `startRound()` 的 `endBuild → resolveRound → continueRound` 是**同步三连** ⇒ `round-over` 那份刚写完就被 `awaiting-answer` 覆盖。
- ⚠️ 规格注释逐字说了「**不要**因此把 `round-over` 那格删掉」（旧存档已经出去了）⇒ **这是有意保留的**，但新存档确实每次多一次写盘。
- **恢复条件** 存档深层校验加固时（那时可以论证把 `round-over` 那格降级成只在真异常时写）。

### 18. G163 用 200 字符窗口的纯函数正则守「切片读的是跨局进度」，接线层变形可绕过

- 判据：`/sliceDeckForLevel\([\s\S]{0,200}?progress\.value\.masteredWordIds/`（`tests/guards/deck-slice-boundaries.test.ts`）。
- 写成 `const ids = progress.value.masteredWordIds; … sliceDeckForLevel(entriesOf(n), ids)` 这类**抽成局部变量**的形态仍落在窗口内（绿），而把实参换成 `[]` 且中间超过 200 字符的形态会绕过。
- ✅ **行为测试兜住了**：`tests/app/store-deck-slice.test.ts` 的「第二局与第一局零交集」会红。这与 1.18「纯函数正则护不住接线层」是同一条已登记的教训。
- **恢复条件** 想把 G163 从「文本判据」升级为「接线行为判据」时。

### 19. 横屏分栏的 CSS 特异度平局：G166/G167 只查源码文本，查不出真机层叠结果

- `src/styles/responsive.css` 里 `.level-view .battle-grid` 是 `(0,2,0)`，SFC scoped 的 `.battle-grid[data-v-*]` **也是 `(0,2,0)`**；赢面取决于源码顺序与 Vite 注入次序，而这两条守卫**只断言那行文本存在**。
- 同理，`.level-view` 上的 `grid-template-areas` / `-columns` / `-rows` **没有 `!important` 保护**（全仓唯一的 `!important` 只加在 `display` 上）⇒ 将来 `BattleField.vue` 里加一句 `height: 100%` 或 `grid-template-areas: …`，横屏会静默退回它要修的那个 bug，而**全套守卫绿灯**。
- ✅ 今天的实测机型（2000×2560 / 1200×1920）横屏正常；`.battle-grid` 今天确实不声明 `height` / `align-self`。
- **恢复条件** 需要在真浏览器里做一次层叠实测（jsdom 不做布局，R-01 说的那类假绿），或改用真浏览器 e2e 断言 `getComputedStyle`。

### 20. `.level-outcome` 不在 `grid-template-areas` 里，靠 `position: absolute; inset: 0` 定位

- 若将来把它移进正常流，网格模板没有它的槽位 ⇒ 要么落进自动生成的空格（只是不好看），要么与其他面板重叠（功能性）。G168 抓得到「模板变了」，但诊断信息会指向「网格缺一个面板」而不是「横屏以这个特定方式坏掉了」。
- **恢复条件** 横屏布局下一次结构性改版。

### 21. `grid-template-columns: minmax(0, 1fr) 25rem` 的 `25rem` 没有设计令牌锚点

- 注释把它标成「刻意的非令牌」。将来若 Epic 要改右栏宽度，只能改这里，且没有 token 可对照（R-56 说的「断言不读 tokens 就写死字面值」那类债）。
- **恢复条件** 横屏布局改版，或引入布局类令牌时。

### 22. `sliceDeckForLevel` 返回**可变**的 `DeckEntry[]`，与「纯函数 + 不改动传入」的注释纪律不成类型级约束

- 注释逐字承诺「不改动传入的两个参数」，但返回类型是 `DeckEntry[]` 而非 `readonly DeckEntry[]`。将来任何调用点写 `state.deck.sort(...)` / `.push(...)` 会静默改到 `state.deck`（它会被 `JSON.stringify` 存盘），而**没有任何类型或测试会红**。
- ⚠️ 与本文档更早的一条同源（元素是内容层共享引用那条）—— 两者都是「纯度只写在注释里，没落到类型上」。
- **恢复条件** 若要把 `core/` 的返回类型系统性收紧为 `readonly`（那是一次跨模块的签名改动）。

### 23. 建造期锁定时，反馈文案仍是「再想想」，与「选项已置灰不可点」在观感上打架

- `AnswerFeedback` 的文案沿用既有组件；`[CR]` 第四轮已**明确裁决保留**（理由逐字：「`pickedRight` 读的是 `masteredEntryIds`，跨刷新仍成立，且**答错也进建造期**（AC-4）时它会说『再想想』，不是假陈述」），且那条裁决经过用户 `[CC]`。
- ⚠️ 新增的 `locked` 态确实让观感更矛盾（孩子看到选项全灰 + 一个「再想想」），但**这不是实现缺陷，是文案取舍**，且已裁决过。
- **恢复条件** 平板真机试玩时若家长/孩子实际表现困惑（AC-D5 的观察项），再走 `[CC]` 改文案。

- — `_bmad-output/implementation-artifacts/1-19-单元-1-首次试玩验证-epic-1-的生死线.md`

### 24. `G174③`「四局连起来 == 整个词表」只在「每局切片恰好合规」时成立

- 这条是 **A2（原序承诺）的接线侧护栏**，`[CR]` 实测确认它今天全绿且必须保留 ⇒ **本 story 不动它**。
- ⚠️ 但它的成立前提比看上去窄：单元 1 在 JSON 原序上本就合规，**任何连续切片都是一段合规序列的子序列**。
  一旦孩子的进度里出现**跳过的洞**（AC-E4 的既有功能），`pending` 就不再是连续段，
  「四局连起来 == 整个词表」**不再成立** —— 而它会以「重排坏了」的名义变红，真正原因不是 bug。
- `[CR]` 2026-10-19 只做了**旁证**：新增一轮「留下两处洞」的非连续进度，确认重排在那种切片下仍正确
  （见 `tests/app/store-deck-slice.test.ts` 的判据自测）。**没有**改 `③` 本身。
- **恢复条件** 将来动 A2 或给 `G174③` 换夹具时一并处理；那时需要一条能区分
  「重排改了归属」与「本来就不该按原序拼」的判据。

- — `_bmad-output/implementation-artifacts/1-20-相邻不同型-把植物不重复从巧合变成代码保证.md`

### 25. 守卫编号没有起号纪律：`G30` 已被两个不相干的 story 共用（且缺一条跨 story 的查重守卫）

- **实测现象**：把 `tests/` 下所有 `^describe('G` 的编号抽出来跑 `uniq -d`，返回 10 个重号：
  G2 / G16 / G17 / G22 / G24 / G30 / G50 / G59 / G65 / G112。
  逐个看过，**9 个是假警报**（同一个守卫拆成多段 describe：`G16` + `G16 补充`、`G17` + `G17b`、
  `G24 上半` + `G24 下半`、`G50a/c/d`、`G112（扩展）`、`G2` + `G2 的解析器本身`、
  `G59` + `G59 反向自检`、`G65` 拆在 `services/audio` 与 `assets/audio-assets`）。
- 🔥 **只有 `G30` 是真撞**，且**早于** 1.19 / 1.20：
  - `tests/components/quiz-card.test.ts` —— Story **1.11**「题面文字在真浏览器里看得见」
  - `tests/components/hand-build.test.ts` —— Story **1.12**「射程覆盖层逐格 === `coverCellsAt`」
  - 两个主题毫无关系。`hand-build.test.ts:513` 逐字写着「与 **1.11 的 G30** 同一个洞」
    ⇒ **是早就写在代码里的旧账**，两边都知道，只是没人裁决过。
- **根因（比单条撞号更值钱）**：`docs/rules/testing.md` 的 **R-50..R-61 里没有任何一条承诺
  守卫编号跨 story 唯一**，也没有任何一条写「起号前要 grep 全仓库」⇒
  每个 story 都只按「本 story 内不撞」起号，于是跨 story 必然撞。
  1.19 `[CR]` 第二轮把「G160–G169 连续无重号无跳号」写成验收项，
  1.20 起号时也写了「grep 实测：G173 / M192」—— **两次都只 grep 了本 story 的测试文件**。
- **为什么不在 1.20 里顺手修**：重编号要动 1.11 / 1.12 两个**已封存** story 的文档与历史记录，
  属于跨 story 裁决，且与 1.20 的 AC 无关 ⇒ 不塞进本 story（与第 24 条同一条纪律：
  与本 story 无关的问题只登记、不顺手改）。
- **恢复条件**：下次要起新号、或要动 `quiz-card.test.ts` / `hand-build.test.ts` 时，
  一并 (a) 给 `G30` 重编号（建议把 1.12 那条改成新号），(b) 在 `docs/rules/testing.md`
  补一条「守卫编号全仓库唯一；起号前 grep `^describe\('G\d+` 而不是只 grep 本 story」。


---

## Deferred from: story-2-1-词图产能验证 `[DS]` (2026-10-20)

> 本 story 的全部结论在 `docs/word-image-throughput.md` §8。
> 下面 9 条都是**当场修不动**的（R-35 的「修或登记」纪律），逐条给出恢复条件。
> ⚠️ **第 26–34 条全部是源文档的更正，按裁决 4 一律走 `[CC]`，本 story 不改。**

### 26. 🔥 「200-400 张」这个估算基数被实测推翻，但源文档一个字未改

- **实测**：单元 1 是 `30 / 37 = 81.08%` 的配图比例、37 词条/单元。
  按此结构外推 16–20 单元，图数是 **480–600 张**，而估算说 200–400 张
  ⇒ **低估 20%–150%**。三条根因（配图比例假设 / 15-30 张每单元的假设 / 词条数本身）见 §8.1.2。
- **为什么不改**：`epics.md` 的 AR44、GDD 的资产表、架构的显式约束表都是**规划产物**，
  R-33 规定其改动要么走 `[CC]`、要么属于「文档追认事实」的三条件之一。
  本 story 改的是**决策记录**（`docs/`），不是规划产物 ⇒ 走 `[CC]`。
- **恢复条件**：拿到教材词表**或**单元 2 的词表 —— 任一即可解开「每单元词条数」这个未知量。

### 27. 🔥 `epics.md` §7.2 的「程序化生成 ⇒ 工时减半」被实测打掉 4/5

- **原文预期**：「`abstract` + `geometric` = 15/30 = 50% ⇒ 若这两档走程序化，工时减半」。
- **实测**：单元 1 已交付的 30 张里，程序化可行的只有 **3 张（数词）= 10%**。
  否掉的 40% 里：颜色词 3 张**实测证伪**（灰度底色下退化成匿名灰块）、
  `geometric` 7 张**结构性不可行**（`bag`/`book` 同为盒体、`pen`/`pencil` 同为圆柱，
  同一套规则产出的图在档内**不可区分**，违反「听到词 → 认出图」）。
- **恢复条件**：拿到真实教材词表后重算各档占比；若「数词 + 公认符号」在真实词表里
  占比远高于单元 1，这个结论要重写。

### 28. `docs/art-direction.md` §5.1 缺「食物」档与「场景」档

- **实测发现**：四档成员全是日常器物 / 具象动物 / 人物 / 公认符号。
  `ice-cream`（食物）与 `playground`（场景）落哪一档都不贴切，
  只能借用 `figure` 并**声明这是拉伸** —— 此时 §5.1 的区间自检只剩**弱校验**。
- **恢复条件**：**下一批词图开工前**必须先加档，否则每一张场景/食物词图都要
  写一遍「这是拉伸」的声明。

### 29. `docs/art-direction.md` §5.5 对「无描边」词图没有规定

- **实测发现**：`playground` v3 走通了「删细部 → 加粗描边 → **换实心色块**」三条路，
  只有第三条让 48px 下的色块边界稳住。它一条描边都没有，
  落在 §5.5「主体轮廓描边 12–16px」**预设了词图会有描边**的规范空白处。
- **可迁移结论**（已写进 §8.2.7）：512 → 48px 是 0.09375 倍，
  **描边在小尺寸下必然失效（16px → 1.5px 墨），实心色块才留得住（46 单位 → 4.3px）**。
- **恢复条件**：若要支持场景类词图，§5.5 需写清「场景类允许且应当使用实心块画法」；
  同样要在 §5.5 补一条「无描边词图的合法性」。

### 30. `scripts/word-image-throughput.ts` 只测「首版写盘 → 末版写盘」，量不到构思时间

- **实测发现**：`u2-sun` 报 **0.0 秒**。那不是「画太阳不花时间」，
  是**一遍过时判读耗时落在窗口之外**，且**首版之前的构思与起草根本没进过任何记录**
  （文件第一次出现就已是成稿）。
- **性质**：这是 §0 裁决承认的「口径 A 漏掉四件事」之外的**第五项**，
  而且它出自**本 story 自己的工具**。
- **后果**：任何拿这张表乘「全书张数」的算法都会**系统性低估**。
- **恢复条件**：若要把这个脚本当长期产能仪表，需加「开工时刻」的显式记录
  （例如开工时先写一条 `kind: "start"` 的记录）；本 story 未加，因为它要改工具契约。

### 31. 「9.7 小时 ÷ 25 张 = 23 分钟/张」这个算法不成立

- **实测复核**：该区间（`39b83aa` → `3ef8714`）里混着至少三样非画图的东西 ——
  一次性工程投资（`word-image-metrics.ts` 1 031 行 + 两个测试文件 475 + 488 行）、
  两个 story 的收尾（1.8 的 22 patch + 1.9 的 33 patch）、以及两次题材分布**相反**的 session。
- **为什么不删掉那个数字**：保留在文档里作**反面教材**（与「9 分钟/张」同一条纪律）。
- **恢复条件**：永不复用。

### 32. §5 的 5.5 / 5.5b / 5.6 是永久 👁 —— 「画得像不像」至今没有机器判据

- **这不是本 story 造成的**（`art-direction.md` 已判定它们建不了守卫），
  本 story **不试图**解决它。但它决定了本 story 每一个产能结论的性质。
- **照抄 §7.5 的原句**：「**在「画得像不像」没有判据的情况下，
  任何产能结论都是在给一个没定义的问题计时。**」
- **恢复条件**：需要一个能替代目视的判据（人工抽检协议、或可接受度测试）。

### 33. 「全年两册」的分册边界没有任何文档写过

- **实测**：GDD 只有「全年两册」这个说法与 **16–20 关**这个区间，
  **没有任何单元表**。§8.3.3 里的「上册 = 8–10 单元」是「均分 16–20」的算术结果，
  **不是教材的分册表**。
- **恢复条件**：拿到教材目录。**在此之前不要把「上册 = 前 8 个单元」当事实引用。**

### 34. 若改选「收窄到上册」，有六处编号要重算（**本 story 未触发，仅记录**）

- **本 story 的结论是选项一（全册），所以 C4 的条件未触发。**
  但若将来改选，记录影响如下，避免届时重新推一遍：
  `Story 2.7` 从「单元 8–13」截断为「单元 8–10」；
  `Story 2.8`（单元 14 至末单元）**无单元可做**，要么删除要么改用途；
  `Story 2.9`（全书通关验收）改为「上册通关验收」；
  `Story 2.3` 的阳光档位表 **第三档 11–20 整个消失**，三档要重编。
- **恢复条件**：一旦作出收窄决定，走 `[CC]` 改 `epics.md` 的编号与档位表。

- — `_bmad-output/implementation-artifacts/2-1-词图产能验证.md`

## Deferred from: code review of story-2-1-词图产能验证 `[CR]` (2026-10-20)

> 三层评审的去重后产物里 5 条 `[Review][Defer]`（W1–W5），本 `[CR]` 当场不改，
> 逐条给出恢复条件。与 `[DS]` 的 26–34 条（源文档更正）不同，这 5 条全是**工具/测试自身的已知边界**。

### W1. `buildRecord` 的 read-stat 竞态（旧内容 + 新 mtime）

- **实测发现**：`scripts/word-image-throughput.ts` 的 `buildRecord` 先 `readFileSync` 读内容、
  再 `statSync` 取 mtime，两次系统调用之间若文件被改，会拼出「旧内容 + 新 mtime」。
- **性质**：单写者纪律下是**理论风险**（画图是单 session 串行操作，没有并发写）。
- **恢复条件**：若工具将来被多写者/CI 并发使用，改为「先 stat 再 read，或 read 后复 stat 校验 mtime 未变」。

### W2. 去重键 `entryId` 跨目录撞名

- **实测发现**：`scripts/word-image-throughput.ts` 的去重键是 `entryId`，
  若将来 `docs/word-image-lab/` 之外出现另一个目录也放同名 `entryId` 的词图，会被静默合并。
- **性质**：当前只有单目录（`docs/word-image-lab/`），不构成现实风险。
- **恢复条件**：一旦支持多目录，去重键需改成「目录 + entryId」复合键。

### W3. 测试里的 `as typeof import(...)` 禁用副本类型检查

- **实测发现**：`tests/scripts/word-image-throughput.test.ts` 用 `as typeof import(...)`
  拿真实模块类型做夹具，好处是签名漂移会红；代价是这份「副本」**不再独立**，
  若实现类型本身写错而测试又复制了同一错类型，类型层不再兜底。
- **性质**：B3 附带的次要观察，非本 story 守卫的职责。
- **恢复条件**：若该测试未来变成「实现契约的独立见证」，改手写 interface 而非 `typeof import`。

### W4. `countElements` 对「无根 SVG」报 0，与「合法空图」不可分

- **实测发现**：`scripts/word-image-throughput.ts` 的 `countElements` 遇到没有 `<svg>` 根
  （或根元素缺失）的文件会返回 0，与一张**合法但确实空**的图返回的 0 无法区分。
- **性质**：低危 —— 空图与坏文件对本 story 的产能统计影响都归零，方向一致。
- **恢复条件**：若工具要区分「坏文件」与「空图」，改返回「元素数 + 是否有根」的元组或带哨兵值。

### W5. 48px 判读结论没有机器可读载体；6 个中间版内容永久不可复核

- **实测发现**：`docs/word-image-lab/versions.jsonl` 只记录「哪一版过了 48px」的**结论**，
  不记录判读过程的载体；`egg`/`playground` 等词的**中间版 SVG 内容**（非末版）未落盘，
  将来无法复核「当初为什么判它没过」。
- **性质**：与 deferred #30 同源 —— 都要改工具契约（多落一份中间产物 + 判读快照）。
- **恢复条件**：若「画得像不像」的判读要变成可审计记录，需在工具里加中间版归档与判读快照。

---

## Deferred from: story-2-2-难度阶梯规则落地 `[DS]` (2026-10-20)

> 本 story 的规则正文在 `docs/card-distribution.md`，机器实现是 `src/content/distribution.ts`。
> 下面 4 条都是**当场不该动**的（R-35 的「修或登记」纪律），逐条给出恢复条件。

### 35. 🔥 `epics.md` Story 2.2 的 AC 仍写着已被作废的「100/50」证据

- **实测**：`epics.md` Story 2.2 的 AC 原文含「已实测：答对增量 50 / 造价 50 与答对增量 100 /
  造价 50 的失败门槛曲线完全相同」。该证据**已被 GDD rev 5 作废**，作废理由（模拟器有
  实体覆盖 bug、且那组「增量翻倍而造价不变」的档位在游戏中根本不存在）见 R-21 / R-23。
- **为什么不改**：`epics.md` 是**规划产物**，R-33 规定其正文改动走 `[CC]`（或「文档追认事实」
  的三条件，本 story 三条都不满足）。本 story 只在 `docs/card-distribution.md` §5.2
  引用了**仍然成立**的机制结论（FR82 塔是持久资产），未把作废证据抄进任何产出。
- **恢复条件**：下次 `[CC]` 时把该句改成机制结论措辞。

### 36. `Card.kind`（core 侧）与 `CardKindSchema`（content 侧）之间没有等值守卫

- **实测**：塔型有 `tests/content/content-boundary.test.ts` 的 `TOWER_TYPES` 等值断言，
  **卡型没有**。本 story 的变异 **M224**（给 `CardKindSchema` 加第四型 `'phrase'`）实测：
  只有本 story 新加的 G187 键集合判据与 `tests/content/schema.test.ts` 的既有断言变红，
  **`src/core/` 侧零反应** —— core 那边仍认三种，内容层已经能录四种。
- **为什么不在本 story 补**：补它要动 `tests/core/`（core↔content 的跨层断言），
  超出「只落数据层规则」的边界，且属另一个 story 的范围。
- **恢复条件**：任何人增删 `CardKindSchema` 的取值时，顺手在
  `content-boundary.test.ts` 加一条与 `TOWER_TYPES` 同款的等值断言。

### 37. `docs/word-image-throughput.md` §8.1.4 的 480–600 张出处表未加指针

- **实测**：Story 2.2 按指令**只在 §8.4 加了一行指针**；而 480 / 600 这两个数字的**出处**
  在 §8.1.4 的表格里（以及 §8.1.5、§8.4.6 的引用）。读 §8.1.4 的人看不到下修。
- **为什么不当场加**：用户指令逐字限定「给 §8.4 加指针」，§8.1.4 属指令之外。
- **恢复条件**：下一次动 `word-image-throughput.md` 时，把同一行指针补进 §8.1.4。
  指向 `[card-distribution.md](card-distribution.md)`，**正文不在两处各写一份**（R-37）。

### 38. 卡型分布规则**不**校验「整数化后与份额的误差」

- **实测**：规则给的是**份额**（实数），真实单元内容是**整数**条数。作者把份额 × N
  四舍五入会有 ±1 张的余量；本 story 的守卫不拦这个余量。
- **为什么不在本 story 补**：单元 2–20 还不存在（Story 2.5–2.8 的交付物），
  且「余量多大算合规」本身是产品决定。
- **恢复条件**：Story 2.5 – 2.8 录入首批真实单元时，由**内容批次的验收**口径接管；
  同一次 `[CC]` 可再议是否给 `scripts/validate-content.ts` 加一条「单元实际分布 vs
  规则目标」的硬校验（Story 2.2 的裁决 3 明确**不**加它）。

