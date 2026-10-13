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

- ✅ **已修（Story 1.3 / AC-11，2026-10-13）** —— `vite.config.ts` 加了 `base: '/plantsgame/'`，
  `RECORDING_BASE_PATH` 改接 `import.meta.env.BASE_URL`，并新增
  `tests/scaffold/deployment-base.test.ts` 守卫（`vitest.config.ts` 同步设了
  `test.env.BASE_URL`，否则该守卫会假绿）。**销项，但部署前仍需真机确认一次** ——
  自动化只能证明路径推导正确，证明不了托管侧的配置。
  ——
  `vite.config.ts`、`src/services/pronunciation.ts:149`

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
  `vite.config.ts`、`src/services/pronunciation.ts:149`

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

## Deferred from: code review of story-1-3-朗读录音批量生成 (2026-10-13)

- `parseEntries` 不在生成侧校验词条 id 的单元前缀 ——
  只校验 kebab-case，`u2-dog` 缺前缀的词条能进生成流程。
  **为什么现在不补**：`tests/scripts/generate-voice.test.ts:97` 已在**词表文件层面**
  守住 `/^u\d+-/`，而 `voice-entries.json` 是本 story 唯一的输入。
  生成侧再拦一次是纵深防御，收益低于维护两条同义规则的成本。
  **恢复条件**：词表来源从 `scripts/data/voice-entries.json` 改成别处（Story 1.6 换源时，
  测试的覆盖面会随来源一起搬家），或将来词表改为多文件混合输入。
  ——
  `scripts/generate-voice.ts:147`

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

- **GDD 正文的「圆形射程」段落残留，须走 `[CC]` 流程修订** ——
  `gdd.md:296` / `:310` 仍写着「塔的射程是圆形覆盖」，而权威口径是
  `epics.md` FR38 + 架构决策 1（范围塔 = **同行 3 格条带**，放置预览才是圆）。
  这是未被 `[IR]` 修订的 GDD 残留。Story 1.4 **刻意不改 GDD**（GDD 修订属 `[CC]` 流程）。
  ⚠️ 不修的后果：后续按 GDD 正文实现放置预览（Story 1.12 / AR43 / FR32）的人
  会把「圆形」误当成伤害判定形状 —— 那正是 AC-4.1 要防的 60 × 5 = 300 超模。
  **恢复条件**：任意一次 `[CC]` 机会一并修订 GDD 正文这两处。
  📎 [CR] 2026-10-13 补登记：本条原写在 Story 1.4 Dev Notes §11 的移交清单里，
  但当时未落进本文件（该清单自称「须登记到 deferred-work.md」）。
  ——
  `_bmad-output/planning-artifacts/gdds/gdd-plants-game-2026-10-11/gdd.md:296,310`

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

- **`PLACE_TOWER` 没禁止建在房子格（col 0）与僵尸入场格（col 8）** ——
  AC-12 只列了三条规则（未解锁 / 格子非空 / 阳光不足），本 story 据此实现，没有多加规则。
  `tests/fixtures/level-driver.ts` 的建塔策略**主动排除**了这两列（`BUILDABLE_COLUMNS = [1..7]`），
  所以所有门槛数字都是按「不能建在这两格」测的。
  ⚠️ 若将来允许建在 col 0 / col 8，门槛数字会变 —— 已知实测：把可建列放宽到 `[0..8]`，
  门槛从 4 变成 5（col 0 / col 1 两座塔会打在同一目标上，白白浪费前两次购买）。
  **为什么现在不加这条规则**：AC-12 没要求，而多加一条会让「GDD 说能建就建得成」与
  实现不符；且 GDD 对塔位是否受限本身尚未定论（见上面「直射塔单塔击杀只在特定列成立」那条）。
  **恢复条件**：Story 1.10 建塔 UI 落地时确定塔位规则，同步加断言并重跑 `balance-sim`。
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
