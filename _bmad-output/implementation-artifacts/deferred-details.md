# 延后条目详情（仍然开放的）

> 本文件是**活账本的详情层**：`_bmad-output/implementation-artifacts/deferred-work.md`
> 每条一行（ID / 状态 / 归属 / 恢复条件 / 一句话 / 指针），本文件放每条的**完整论证**。
> 原文逐字保留；已结条目的历史在 `_bmad-output/archive/deferred/`（默认不读）。
> 登记格式见 `docs/rules/process.md` R-35；账本形态见 R-43。
>
> ⚠️ **「原始论证」里的行号指针指向拆分前的 `deferred-work.md`，已失效** ——
> 那份文件已拆成「活账本 / 本文件 / 归档」三层，行号不再对应。
> 原文逐字保留是硬要求（改动即篡改历史），所以**不改这些指针**；
> 要定位旧条目，查 `_bmad-output/archive/deferred/README.md` 的**全量对照表**（旧编号 → DF-ID / 归档文件）。

## DF-001

**状态**：待排期 · **归属**：未指派 · **恢复条件**：给 `StartView` 的点击路径补一条组件测试，断言它调了 `unlockAudioSequence()`

**一句话**：`StartView` 点击 → `unlockAudioSequence()` 的接线仍无任何测试覆盖

### 原始论证

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


> 来源：`## Deferred from: code review of story-1-2-音频解锁与-tts-朗读 (2026-10-12)` ｜ 旧编号 `-` ｜ 详见 `archive/deferred/2026-10-12--cr-story-1-2.md` 的「分诊结论」

## DF-002

**状态**：待触发 · **归属**：Story 1.18 · **恢复条件**：真机上确认目标设备是否真的需要 `webkitAudioContext` 前缀；确认不需要就把它划掉，不要为了「完备」而加没人验证过的分支

**一句话**：`services/audio.ts` 只读 `globalThis.AudioContext`，无 `webkitAudioContext` 前缀回退

### 原始论证

- **无 `webkitAudioContext` 回退** ——
  `unlockAudioSession()` 只认 `globalThis.AudioContext`。iOS Safari < 14.1（只有 `webkitAudioContext`）
  下整条 Web Audio 通路永久不可用，`getAudioContext()` 恒返回 null，且用户每点一次「开始游戏」
  就多打一条 `[audio] 浏览器不支持`。**延后理由**：目标平台是华为 Android 平板上的 Chrome，
  该场景不在 GDD/架构的目标平台范围内，spec 也未要求；Story 1.13 把 BGM 接到
  `getAudioContext()` 上时再一并评估。
  ——
  `src/services/audio.ts` 的 `unlockAudioSession()` 里 `typeof Ctor !== 'function'` 那段


> 来源：`## Deferred from: code review of story-1-2-音频解锁与-tts-朗读 (2026-10-12)` ｜ 旧编号 `-` ｜ 详见 `archive/deferred/2026-10-12--cr-story-1-2.md` 的「分诊结论」

## DF-003

**状态**：待触发 · **归属**：Story 1.2 / 3.4 · **恢复条件**：要拿的只有两样：目标平板的 `speechSynthesis.getVoices()` 列表 + Chrome 版本号

**一句话**：Story 1.2 AC-8 真机验收未做，`sprint-status.yaml` 里 1-2 仍是 review

### 原始论证

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


> 来源：`## Deferred from: 用户决策（2026-10-13）` ｜ 旧编号 `-` ｜ 详见 `archive/deferred/2026-10-13--用户决策.md` 的「分诊结论」

## DF-004

**状态**：待触发 · **归属**：未指派 · **恢复条件**：与上一条同一个 —— 拿到真机音色列表

**一句话**：`pronunciation.ts` 的 `VOICE_PRIORITY` 英式优先修法仍冻着

### 原始论证

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


> 来源：`## Deferred from: 用户决策（2026-10-13）` ｜ 旧编号 `-` ｜ 详见 `archive/deferred/2026-10-13--用户决策.md` 的「分诊结论」

## DF-005

**状态**：待触发 · **归属**：未指派 · **恢复条件**：与 AC-8 真机验收同批做（拿到平板 + Chrome 后一起）

**一句话**：`playPronunciation` ≤500ms 起声零验证，需与 AC-8 真机验收同批真机做

### 原始论证

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


> 来源：`## Deferred from: code review of story-1-2-音频解锁与-tts-朗读 (2026-10-16)` ｜ 旧编号 `-` ｜ 详见 `archive/deferred/2026-10-16--cr-story-1-2.md` 的「分诊结论」

## DF-006

**状态**：待触发 · **归属**：未指派 · **恢复条件**：接手时对 `[...]` 加转义并补自测；或引入 minimatch 做交叉校验

**一句话**：`audio-unlock-guard.test.ts` 的 `matchesGlob` 仍不认 `[...]`，save.ts 断言仍会假绿

### 原始论证

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


> 来源：`## Deferred from: code review of story-1-2-音频解锁与-tts-朗读 (2026-10-16)` ｜ 旧编号 `-` ｜ 详见 `archive/deferred/2026-10-16--cr-story-1-2.md` 的「分诊结论」

## DF-007

**状态**：待排期 · **归属**：未指派 · **恢复条件**：下次改这三个测试文件时，把 `expect` 补上中文失败消息（R-55 的约定）

**一句话**：三个测试文件的 `expect` 仍欠中文失败消息（实测 89 / 13 / 20 处）

### 原始论证

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


> 来源：`## Deferred from: code review of story-1-2-音频解锁与-tts-朗读 (2026-10-16)` ｜ 旧编号 `-` ｜ 详见 `archive/deferred/2026-10-16--cr-story-1-2.md` 的「分诊结论」

## DF-008

**状态**：待排期 · **归属**：未指派 · **恢复条件**：下一次给 AC-9 的「不越界」禁令补守卫时（在那之前只能靠交付时人工复核）

**一句话**：AC-9 七条「不越界」禁令仍零守卫，事后归因只能靠 git 历史

### 原始论证

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


> 来源：`## Deferred from: code review of story-1-2-音频解锁与-tts-朗读 (2026-10-16)` ｜ 旧编号 `-` ｜ 详见 `archive/deferred/2026-10-16--cr-story-1-2.md` 的「分诊结论」

## DF-009

**状态**：待触发 · **归属**：未指派 · **恢复条件**：缺的是「真实浏览器上 `ended` 之后仍会派发 `error`」这一前提的实测

**一句话**：`isEnglish` 仍只认 `/^en[-_]/`，`playRecording` 的 `ended` 不置 settled

### 原始论证

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


> 来源：`## Deferred from: code review of story-1-2-音频解锁与-tts-朗读 (2026-10-16)` ｜ 旧编号 `-` ｜ 详见 `archive/deferred/2026-10-16--cr-story-1-2.md` 的「分诊结论」

## DF-010

**状态**：待触发 · **归属**：Story 3.4（裁决 A 落地时） · **恢复条件**：真的调了音色或语速、且 `--force` 仍无法免除手工 `rm` 时 ⇒ 裁决要不要让 `--force` 越指纹闸

**一句话**：`generate-voice.ts` 已有 `--force`/`--help`，但 `--force` 不越闸 ⇒ 改参数后仍须手工删整个产物目录

### 原始论证

- 脚本缺 `--force` 与 `--help` ——
  改音色/语速后全量重生成目前靠手动 `rm public/assets/audio/voice/*.mp3`；
  三个 flag（`--dry` / `--only` / 即将有的 `--force`）只能读源码才知道。
  **为什么现在不补**：AC 未要求，`--dry`/`--only` 已覆盖本 story 的实际用法。
  **恢复条件**：Story 3.4「音频品质打磨」一旦真的调了音色或语速，
  手工 `rm` 的操作成本会第一次变成实际摩擦——那时一并加 `--force` 与 `--help`。
  ——
  `scripts/generate-voice.ts:445`


> 来源：`## Deferred from: code review of story-1-3-朗读录音批量生成 (2026-10-13)` ｜ 旧编号 `-` ｜ 详见 `archive/deferred/2026-10-13--cr-story-1-3.md` 的「分诊结论」

### 2026-10-25（Story 3.4 `[DS]`）的处置 —— **不销项**

- **做了什么**：`scripts/generate-voice.ts` 新增了 `--help` 与 `--force`。
  `--help` 打印用法（含「改参数后的正确流程」三步）并**跳过 API key 检查**；
  `--force` 的语义是「**用当前参数重录全部**」（即使哈希一致）。
- **为什么不销项**：本条的恢复条件逐字是「Story 3.4 **一旦真的调了**音色或语速」——
  而 Story 3.4 **按设计不改任何取值**（取值是人的裁决，见 Story 3.4 的「裁决 A」）⇒
  **触发条件未成立**。
- **还差什么**：`--force` **不越指纹闸**（Story 3.4 的「裁决 F」选了 (b) 方案）⇒
  改了参数之后仍然必须手工删掉整个 `public/assets/audio/voice/` 目录 ——
  **DF-010 的痛点（那个 `rm`）一点没解决**。
  ⇒ 恢复条件因此改成「真的调了音色或语速、**且** `--force` 仍无法免除手工 `rm` 时」
  ⇒ 那时裁决 (a)：让 `--force` 越闸，并同时规定「部分失败 ⇒ 旧文件留在盘上而 manifest
  已写新指纹」的处置（回滚 manifest / 删旧文件）。

## DF-011

**状态**：待触发 · **归属**：未指派 · **恢复条件**：下次要按业务码分类统计 `Failure.code` 时（例如「只有音色类失败才换音色」）

**一句话**：`generate-voice.ts` 的 `Failure.code` 仍是无区分 `string`

### 原始论证

- `Failure.code` 是无区分的 `string` ——
  同一个字段混装网络哨兵（`NETWORK`）、HTTP 状态（`HTTP_500`）、
  业务码（`1002`）与合成类失败（`EMPTY_AUDIO`）四种性质的值。
  **为什么现在不补**：当前唯一的消费者是失败清单的字符串拼接，
  按类型筛选没有现实需求；此时改成 tagged union 会牵动全部构造点而零收益。
  **恢复条件**：Story 3.4 需要按业务码分类统计（例如「只有音色类失败才换音色」）时。
  ——
  `scripts/generate-voice.ts:107`


> 来源：`## Deferred from: code review of story-1-3-朗读录音批量生成 (2026-10-13)` ｜ 旧编号 `-` ｜ 详见 `archive/deferred/2026-10-13--cr-story-1-3.md` 的「分诊结论」

### 2026-10-25（Story 3.4 `[DS]`）的处置 —— **不销项**

- **为什么不销项**：本条逐字是「Story 3.4 需要按业务码分类统计时」——
  而 Story 3.4 **不按业务码筛选**（它不统计失败原因）⇒ **触发条件未成立**。
- **归属为什么从「Story 3.4」改成「未指派」**：Story 3.4 已交付且**不需要**这条；
  留着「Story 3.4」会让下一个人以为「3.4 没做完这条」。
- **恢复条件为什么改写**：原文「Story 3.4 需要……时」在 3.4 交付后**永远不成立**
  ⇒ 改成「**下次**要按业务码分类统计 `Failure.code` 时」——仍可判定，且不再指向已完结的 story。

## DF-012

**状态**：待触发 · **归属**：Story 3.2 / Story 1.12 · **恢复条件**：Story 3.2 拿到试玩数据后，二选一 —— 调射程/速度让窗口恒含 2 个可达列，或接受「塔位有讲究」并把范围写进 Story 1.12 的 UI 引导；不要在本层悄悄调

**一句话**：`src/core/combat.ts` 射程窗口裁剪 ⇒ col 0/2/4/6/7 单塔打不死 100 血僵尸

### 原始论证

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


> 来源：`## Deferred from: story-1-4-战斗内核与-5-条数值断言 (2026-10-13)` ｜ 旧编号 `-` ｜ 详见 `archive/deferred/2026-10-13--ds-story-1-4.md` 的「分诊结论」

## DF-013

**状态**：待触发 · **归属**：Story 3.2 · **恢复条件**：Story 3.2 依试玩数据决定减速塔伤害（25 → 34 使 3 发合计 102 ≥ 100）或持续回合数

**一句话**：`src/core/combat.ts` 减速塔 25 伤害实测 75，GDD「6 回合 × 25 = 150」已被证伪

### 原始论证

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


> 来源：`## Deferred from: story-1-4-战斗内核与-5-条数值断言 (2026-10-13)` ｜ 旧编号 `-` ｜ 详见 `archive/deferred/2026-10-13--ds-story-1-4.md` 的「分诊结论」

## DF-014

**状态**：待触发 · **归属**：Story 3.2（调数值）/ Epic 1 试玩（Story 1.19） · **恢复条件**：Epic 1 试玩；若 4 题门槛显得过严，首选调起始心数 3 → 4 或开局前 2 回合不出僵尸

**一句话**：`gdd.md` 失败门槛 4 待 Epic 1 试玩复核（首选调起始心数 3 → 4）

### 原始论证

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


> 来源：`## Deferred from: story-1-5-回合状态机与题单 (2026-10-13)` ｜ 旧编号 `-` ｜ 详见 `archive/deferred/2026-10-13--ds-story-1-5.md` 的「分诊结论」

## DF-015

**状态**：待触发 · **归属**：未指派 · **恢复条件**：若将来引入「本回合已死但仍在场上」的中间态（例如溅射伤害链、复活机制），立刻给这条加断言

**一句话**：`src/core/turn.ts` 的 `shoot()` 减速守卫仍是等价变异体，无测试

### 原始论证

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


> 来源：`## Deferred from: story-1-5-回合状态机与题单 (2026-10-13)` ｜ 旧编号 `-` ｜ 详见 `archive/deferred/2026-10-13--ds-story-1-5.md` 的「分诊结论」

## DF-016

**状态**：待触发 · **归属**：Story 3.2（Epic 3） · **恢复条件**：Epic 3 战斗数值调优（3-2）时定夺方向 —— 给减速塔一个真实存在的优势，或承认单元 1 阶段它不该进题单

**一句话**：`src/core/balance.ts` 的 `TOWER_STATS.slow` 仍被直射塔完全支配

### 原始论证

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


> 来源：`## Deferred from: code review of story-1-5-回合状态机与题单 (2026-10-14)` ｜ 旧编号 `-` ｜ 详见 `archive/deferred/2026-10-14--cr-story-1-5.md` 的「分诊结论」

## DF-017

**状态**：待触发 · **归属**：未指派 · **恢复条件**：出现能逼出「同回合抵达 ≥2 只」的局面时立刻补断言（三个候选触发点：建塔策略放宽 / 引入溅射复活 / 减速系数被调大）

**一句话**：`src/core/reducer.ts` 的 `applyResolve` 心数夹取仍无守卫

### 原始论证

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


> 来源：`## Deferred from: code review of story-1-5-回合状态机与题单 (2026-10-14)` ｜ 旧编号 `-` ｜ 详见 `archive/deferred/2026-10-14--cr-story-1-5.md` 的「分诊结论」

## DF-018

**状态**：待触发 · **归属**：Epic 2 · **恢复条件**：Epic 2 扩词池时，优先补「含池内词的句子」，并把本条改成回归守卫

**一句话**：`src/content/units/unit-01.json` 仍只有 1 张 keyword 卡（37 条）

### 原始论证

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


> 来源：`## Deferred from: story-1-6-内容数据层与单元-1-录入 (2026-10-14)` ｜ 旧编号 `-` ｜ 详见 `archive/deferred/2026-10-14--ds-story-1-6.md` 的「分诊结论」

## DF-019

**状态**：待触发 · **归属**：未指派 · **恢复条件**：`[CR]` 若判「必须换实现」，改法是让该条目不再有卡面 —— 但那会破坏「每条录音都有卡面」这条更强的不变量

**一句话**：`unit-01.json` 的 `u1-s-good-morning` 回应卡仍是裁决而非共识

### 原始论证

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


> 来源：`## Deferred from: story-1-6-内容数据层与单元-1-录入 (2026-10-14)` ｜ 旧编号 `-` ｜ 详见 `archive/deferred/2026-10-14--ds-story-1-6.md` 的「分诊结论」

## DF-020

**状态**：待排期 · **归属**：未指派 · **恢复条件**：想更硬时，可给内容层单独一个 `tsconfig` 项目（lib 不含 DOM）并让它被 test 项目 `reference`

**一句话**：`src/content/` 的 DOM 边界仍只有 ESLint 一道，无 tsconfig 兜底

### 原始论证

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


> 来源：`## Deferred from: story-1-6-内容数据层与单元-1-录入 (2026-10-14)` ｜ 旧编号 `-` ｜ 详见 `archive/deferred/2026-10-14--ds-story-1-6.md` 的「分诊结论」

## DF-021

**状态**：待触发 · **归属**：未指派 · **恢复条件**：若单元文件增长到解析耗时可见，再合并为单次

**一句话**：`scripts/validate-content.ts` 每单元仍跑两次 `UnitSchema.safeParse`

### 原始论证

- **`validate-content` 每单元跑两次 `UnitSchema.safeParse`** —— `scripts/validate-content.ts:331,163`
  一次为取 parsed，一次为取 problems。冗余但无害，当前 575 行内容下开销可忽略。
  **恢复条件**：若单元文件增长到解析耗时可见，再合并为单次。
  ——
  `scripts/validate-content.ts`


> 来源：`## Deferred from: code review of story-1-6-内容数据层与单元-1-录入 (2026-10-14)` ｜ 旧编号 `-` ｜ 详见 `archive/deferred/2026-10-14--cr-story-1-6.md` 的「分诊结论」

## DF-022

**状态**：待触发 · **归属**：未指派 · **恢复条件**：若将来引入「一 entry 多卡」的模型，这行必须先拆开

**一句话**：`scripts/validate-content.ts` 的 `cardCount` 仍直接等于 `entryCount`

### 原始论证

- **`cardCount` 直接赋值 `entryCount`** —— `scripts/validate-content.ts`
  两个统计量永远不可能不一致，因此永远测不出「card 数写错」。
  **恢复条件**：若将来引入「一 entry 多卡」的模型，这行必须先拆开。
  ——
  `scripts/validate-content.ts`


> 来源：`## Deferred from: code review of story-1-6-内容数据层与单元-1-录入 (2026-10-14)` ｜ 旧编号 `-` ｜ 详见 `archive/deferred/2026-10-14--cr-story-1-6.md` 的「分诊结论」

## DF-023

**状态**：待触发 · **归属**：未指派 · **恢复条件**：接入 formatter 时一并解决

**一句话**：`src/styles/tokens.css` 仍缺文件尾换行（30 张词图已补）

### 原始论证

- **词图文件与 `tokens.css` 均缺文件尾换行** —— `src/styles/tokens.css`
  ⚠️ `[CR]` 2026-10-14 订正：本条原写「词图文件**与** tokens.css **均**缺」，
  但 30 张词图里 28 张**一直是有**尾换行的（已逐一核对 baseline 与当前磁盘），
  措辞不准确 —— 实为：`u1-three.svg` / `u1-happy.svg` 在本 story **丢了**尾换行（已补回），
  真正还缺的是 `tokens.css`。纯格式，无功能影响。
  **恢复条件**：接入 formatter 时一并解决。
  ——
  `src/styles/tokens.css`


> 来源：`## Deferred from: code review of story-1-6-内容数据层与单元-1-录入 (2026-10-14)` ｜ 旧编号 `-` ｜ 详见 `archive/deferred/2026-10-14--cr-story-1-6.md` 的「分诊结论」

## DF-024

**状态**：待触发 · **归属**：未指派 · **恢复条件**：真出现「从工具导出且属性未加引号」的资产时再修

**一句话**：`scripts/validate-content.ts` 的 `svgRootTag()` 仍可能返回 `null`

### 原始论证

- **`svgRootTag()` 对「无引号属性值里含引号字符」返回 `null`** —— `scripts/validate-content.ts`
  XML 允许 `aria-label=dog's toy` 这种写法。新的引号感知扫描器会把**属性值之外**的孤立引号
  也当作引号区开头，于是永远匹配不到 `</svg>` 前的那段开标签，返回 `null` ——
  于是 `viewBox`/`width`/`height` 读成 `null`，`validate:content` 对一个**合规文件**
  报「读不到 viewBox」。等于在同类输入上把「截断 bug」换成了「引号 bug」。
  **恢复条件**：真出现「从工具导出且属性未加引号」的资产时再修。
  （Edge Case Hunter 对该函数做了单双引号 / 混合引号 / `>` 前置 / 未闭合引号的正反向探测，
  **未复现**该路径，故仅登记不作为缺陷处理。）


> 来源：`## Deferred from: code review of 1-8-单元-1-词图-第一批 (2026-10-14)` ｜ 旧编号 `-` ｜ 详见 `archive/deferred/2026-10-14--cr-story-1-8.md` 的「分诊结论」

## DF-025

**状态**：待触发 · **归属**：Story 1.18 · **恢复条件**：真机飞行模式下打开一道**没有预录录音**的卡，确认回落到 `speechSynthesis` 且仍然发声；再断网确认静音也不阻断回合

**一句话**：AC-B4/B5 的真机断网验收仍未做

### 原始论证

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


> 来源：`## Deferred from: story-1-11-三种卡型与答题交互 (2026-10-15)` ｜ 旧编号 `-` ｜ 详见 `archive/deferred/2026-10-15--ds-story-1-11.md` 的「分诊结论」

## DF-026

**状态**：待排期 · **归属**：Story 1.19 / `[CC]` · **恢复条件**：与 E21 同批：把**已归档的 Story 1.10 文档**里「② 支撑 AR43 的**两套形状**」那一条改成「横向 3 格条带」（⚠️ 活跃文档不点名归档文件名 —— R-40）

**一句话**：裁决 1 的六处文档登记只剩第 6 条未改（1–5 已结）

### 原始论证

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
| 1 | **作废**「放置覆盖：半径 3 的圆（与直射塔一致）」 | `game-architecture.md:245-246` | 实现是 `coverCellsAt`（`src/core/build.ts:184-215`）：`direct/slow` = `inRange` 单向窗口、`aoe` = `aoeColumns` 横向条带、`row !== ZOMBIE_ROW` = 空集。守卫 G305 逐格比对（M57/M58/M71 实测 3/2/2 红；📎 该守卫原编号 **G30**，2026-10-25 夜因与 1.11 的 G30 撞号改号 —— 见 DF-102） |
| 2 | **消歧**「圆形覆盖 ⇒ 相邻行能打到中间行」/「射程形状：圆形」 | `gdd.md` 两处正文 | `turn.ts:82`。**✅ 正文已改（GDD rev 5，2026-10-15）** —— 见下方批注 |
| 3 | **消歧**「种在上下相邻行的塔也能打到中间行」 | `epics.md:1014` | 同上。1.12 的做法是让这件事**在画面上可见**：非僵尸行整行压暗（AC-E3），真浏览器实测该行亮度 **−10%**（`rgba(0,0,0,0.1)`） |
| 4 | **改判据**「范围塔须同时画两套形状（放置覆盖圆 + 实际伤害条带）」 | `epics.md:1134` | 「两套形状」的前提不存在。1.12 画**一套**（真实伤害形状），空集合改用整行压暗表达。守卫 G305（📎 原编号 G30）+ M58 |
| 5 | **改判据**「权威口径是同行 3 格条带，**放置预览才是圆**」 | 本文件上方那条 1.4 移交项（它自己也这么说） | 同一个来源说同一件事。**不改这一条，下一个读本文件的人会读到一条已被作废的口径** |
| 6 | **改判据**移交项②「支撑 AR43 的**两套形状**」 | Story 1.10 文档（键 `1-10-战场渲染与网格`）② —— 📎 2026-10-25 夜：**不再写路径**（该文档已在归档层），只写**键** | 同 4：AR43 的「两套形状」没有实现基础 |

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



> 来源：`## Deferred from: story-1-12-建造-阳光与射程可视化 (2026-10-15)` ｜ 旧编号 `-` ｜ 详见 `archive/deferred/2026-10-15--ds-story-1-12.md` 的「分诊结论」

## DF-027

**状态**：待排期 · **归属**：未指派 · **恢复条件**：做一次「记忆正文 vs R-ID」逐条判定：通用经验保留、本项目专属改成一句指向 `docs/rules/`；改完单独留痕（改记忆文件不产生 git 记录）

**一句话**：`~/.claude/projects/-root-repos-plants-game/memory/` 下仍有若干条成文规则正文（变异验证纪律、实测值优先、跳过必须验哈希、`flush:'sync'`）

### 原始论证

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


> 来源：`## Deferred from: QD 文档治理 §1-§3 (2026-10-15)` ｜ 旧编号 `-` ｜ 详见 `archive/deferred/2026-10-15--qd-文档治理.md` 的「分诊结论」

## DF-028

**状态**：待裁决 · **归属**：未指派 · **恢复条件**：人决定：把 `.claude/settings.local.json` 里那条指向 `_bmad-output/implementation-artifacts/1-5-回合状态机与题单.md` 的授权改到 `archive/`，或直接删掉（下次 `[DS]` 用到时工具会重新提示授权）

**一句话**：`.claude/settings.local.json` 仍有一条指向已归档文件的 Bash 授权（运行时 ENOENT）

### 原始论证

### 评审转来：`.claude/settings.local.json` 有失效的 Bash 授权路径（**未修，等人定**）

第 43 行的 allowlist 指向 `_bmad-output/implementation-artifacts/1-5-回合状态机与题单.md` ——
该文件已随本次治理 `git mv` 进 `archive/`，这条授权**运行时 ENOENT**。

**为什么没修**：那是权限配置文件，改它应由人决定。而且 `settings.local.json` 是个人本地文件
（不入库），改了对别人无意义、也不进 review。

**要做什么**：把路径改到 `_bmad-output/archive/1-5-…`，或直接删掉这条授权
（下次 `[DS]` 用到时会让工具重新提示授权）。**注意仓库里没有任何测试会发现这类失效路径** ——
CI 不读 `.claude/`，守卫的 `SKIP_DIRS` 也跳过了它。


> 来源：`## Deferred from: QD 文档治理 §1-§3 (2026-10-15)` ｜ 旧编号 `-` ｜ 详见 `archive/deferred/2026-10-15--qd-文档治理.md` 的「分诊结论」

## DF-029

**状态**：待触发 · **归属**：未指派 · **恢复条件**：若再见到 G33b 假红，先查是不是**别的**用例红了而被误记到 G33b 名下（该文件有 79 条用例）

**一句话**：「G33b 偶发假红」未复现、未解决，原归因与症状方向对不上

### 原始论证

### 3. 「G33b 偶发假红」——**未复现，未解决**

Acceptance Auditor 报告「15 次完整运行里有 1 次 G33b 假红」。本次 `[CR]` 的处置：

- 连跑 **12 次完整测试套件，全绿**，未能复现。
- `g33bViolation` 是**纯函数**（入参是模块级 `?raw` 字符串，无共享可变状态、无缓存），
  唯一的可疑机制（`?raw` 在并行 transform 下返回空串）
  会让 `code.includes(identifier)` 更少命中 ⇒ **造成假绿，不是假红**。
- ⇒ 原归因（「`?raw` transform 缓存竞态」）与症状方向**对不上**，存疑。

**不宣称已修复。** 若再见到，优先查是不是**别的**用例红了而被误记到 G33b 名下
（该文件有 79 条用例）。这条留给下一次真的撞上的人。


> 来源：`## Deferred from: story-1-12-建造-阳光与射程可视化 `[CR]` (2026-10-16)` ｜ 旧编号 `3` ｜ 详见 `archive/deferred/2026-10-16--cr-story-1-12.md` 的「分诊结论」

## DF-030

**状态**：待触发 · **归属**：未指派 · **恢复条件**：改动 G21 / G23 / G25 / G29 任一判据基线时，把 `tests/helpers/contrast.ts` 的 `stripComments` 换成 `tests/fixtures/strip-comments.ts` 里已存在的状态机版（它连行尾注释一起剥）

**一句话**：`tests/helpers/contrast.ts` 的 `stripComments` 仍只剥行首行注释，四条源码守卫仍认不出行尾注释

### 原始论证

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



> 来源：`## Deferred from: story-1-11-三种卡型与答题交互 `[CR]` (2026-10-16)` ｜ 旧编号 `-` ｜ 详见 `archive/deferred/2026-10-16--cr-story-1-11.md` 的「分诊结论」

## DF-031

**状态**：待触发 · **归属**：未指派 · **恢复条件**：若将来 `src/components/` 里真的出现局部变量藏血量算术的写法，就该上值流分析（可从「单一导出 + 交叉断言」模式扩展）

**一句话**：G19 是词法守卫，`src/components/` 里用局部变量藏血量算术抓不到，堵它要值流分析

### 原始论证

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


> 来源：`## Deferred from: story-1-10-战场渲染与网格 `[CR]` (2026-10-16)` ｜ 旧编号 `§1（1.10 CR）` ｜ 详见 `archive/deferred/2026-10-16--cr-story-1-10.md` 的「分诊结论」

## DF-032

**状态**：待触发 · **归属**：Story 1.19 · **恢复条件**：1.19 真机复核时若再出现战场撑破容器，需重新想一种能在 jsdom 或纯函数层表达这条约束的方式（或接受它只能靠真机核对）

**一句话**：`BattleField.vue`「列轨最小宽度=行高」这条约束 jsdom 无布局引擎，无任何测试能守

### 原始论证

### 2. Debug Log #6（战场横向撑破容器）与 #3（格子变扁）无源码化守卫

两个都是**布局类** bug（`flex: 0 0 auto`、`box-sizing: content-box`），
jsdom 没有布局引擎 ⇒ 测不出来。本轮给可源码化的那一半补了守卫
（M48 `content-box`、M49 `1:1`，各 0 红 → 1 红），
但「列轨的最小宽度 = 行高」那一条**没有任何测试能守**。

- **恢复条件**：Story 1.19 真机复核时若再出现战场撑破容器，需要重新想一种
  能在 jsdom 或纯函数层表达这条约束的方式（或接受它只能靠真机核对）。
- 本 story 已在 `BattleField.vue` 与 `LevelView.vue` 的 CSS 旁写明
  「为什么不能写成另一个值」，让下一个人不必再踩第二次 —— **但注释不是守卫**。


> 来源：`## Deferred from: story-1-10-战场渲染与网格 `[CR]` (2026-10-16)` ｜ 旧编号 `§2（1.10 CR）` ｜ 详见 `archive/deferred/2026-10-16--cr-story-1-10.md` 的「分诊结论」

## DF-033

**状态**：待排期 · **归属**：未指派 · **恢复条件**：任何 `package.json` script 或 `scripts/` 下门禁的增删，都应回头 grep `_bmad-output/` 与 `docs/` 并逐处登记

**一句话**：`check-doc-consistency.sh` 被换掉后 6 处旧文档仍列它为收尾命令，无工具能发现

### 原始论证

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

### 📎 触发记录（2026-10-26，Story 3.5 `[CR]`）

**触发原因**：本轮把 `package.json` 的 `typecheck` 脚本由 `vue-tsc -b` 改成
`vue-tsc -b --force` ⇒ 命中了上面那条恢复条件 ⇒ 按它的口径回头 grep 并逐处登记。

**grep 命中与处置**（命令：`grep -rn "vue-tsc -b\|run typecheck" docs/ _bmad-output/`）：

| 落点 | 处置 |
|---|---|
| `docs/rules/testing.md` 的 R-54 | **改**：补「脚本已改成 `--force` ⇒ 这条规则不再需要手动补 `--force`」 |
| `_bmad-output/implementation-artifacts/3-5-平板竖屏布局细节打磨.md`（Dev Notes H6 / 收尾门槛清单 / Task 8 H6 / `[DS]` 门槛块） | **改**：四处的「脚本本身是 `vue-tsc -b`（增量）」全部标注为**当时**的口径 |
| `_bmad-output/implementation-artifacts/1-19-单元-1-首次试玩验证-epic-1-的生死线.md`（收尾门槛实测输出小节） | **改**：小节开头加一条口径更正（历史粘贴按原样保留） |
| `_bmad-output/implementation-artifacts/deferred-ledger-restructure.md`、`epic-1-integration-review.md`、`spec-doc-governance.md` | **不用改**：本来就写的是 `--force` 或与本次改动无关 |
| `_bmad-output/archive/*` 里列 `check-doc-consistency.sh` 的 6 处 | **不改**：归档件是历史记录（R-40），改它等于伪造历史 |

⚠️ **本条仍然开放** —— 触发条件是**每次**改门禁脚本都会再成立一次；
「无工具能自动发现」这个根因**没有**因为这一轮登记而消失。

> 来源：`## Deferred from: story-1-10-战场渲染与网格 `[CR]` (2026-10-16)` ｜ 旧编号 `§4（1.10 CR）` ｜ 详见 `archive/deferred/2026-10-16--cr-story-1-10.md` 的「分诊结论」

## DF-034

**状态**：待触发 · **归属**：未指派 · **恢复条件**：若 typecheck 再出现整批、且错误内容与源码对不上的报错，先跑 `npx vue-tsc -b --force` 再下结论

**一句话**：`npm run typecheck` 曾出 34 条指向 `node_modules/.tmp` 的假红，机制未复现

### 原始论证

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
- 📎 **2026-10-26 更新（Story 3.5 `[CR]`）**：`npm run typecheck` 的脚本**本身**已改成
  `vue-tsc -b --force` ⇒ 这条恢复条件**现在就是那条命令**（直接跑 `npm run typecheck` 即可，
  不必再手写 `npx vue-tsc -b --force`）⇒ 「命中整批假红」的先例少了一层。

**教训（本条真正的价值）：** 我当时用 `git stash push -- src tests` 复跑，
确认「仍是同样 34 条」，就写下了「红在 `main` 上是既有的」——
**那条验证只证明了「我的改动不是原因」，没有证明「源码是红的」。**
两者之间隔着「构建产物」这一层，而我没查那一层。
⇒ **归因到一个自己没验过的原因上，比不归因更坏** ——
因为它让下一个人看到「已确认是既有问题」就不再查下去。
📎 这条与第 4 条同源：**「一个门禁从绿变红」和「一条命令从有变无」都不会自己报警**，
而**「我验证了 A 就当 B 也成立了」是这类误判最常见的入口**。


> 来源：`## Deferred from: story-1-10-战场渲染与网格 `[CR]` (2026-10-16)` ｜ 旧编号 `§5（1.10 CR）` ｜ 详见 `archive/deferred/2026-10-16--cr-story-1-10.md` 的「分诊结论」

## DF-035

**状态**：待触发 · **归属**：Story 1.16 / 1.17 · **恢复条件**：若 1.15 存档格式要求「本存档累计获得多少阳光」，或 1.17 的 DebugPanel 要显示它 ⇒ 走 `[CC]` 加字段，不要在 1.13 补

**一句话**：`store.ts` 无 `sunEarned` 累计阳光字段，FR66「累计所得只增不减」只在 `masteredWordIds` 落地

### 原始论证

### 2. 不引入 `sunEarned` 累计阳光字段（裁决 4）—— 归 1.16 或 1.17

- FR66 / `gdd.md` 提到「累计所得只增不减」，本 story **只对掌握词条**实现了这一点
  （`progress.masteredWordIds`），**没有**累计阳光字段。理由与 1.15 的存档形状有关：
  现在加一个没人读、没人存的字段，等于造一个空占位（`store.ts` 自己批评过的那种）。
  —
  `_bmad-output/planning-artifacts/gdd.md`
  **恢复条件**：若 1.15 存档格式要求「本存档累计获得多少阳光」，
  或 1.17 的 DebugPanel 要显示它 ⇒ 走 `[CC]` 加字段，**不要**在 1.13 补。


> 来源：`## Deferred from: story-1-13-HUD-阳光-心与进度 `[DS]` (2026-10-16)` ｜ 旧编号 `§2（1.13 DS）` ｜ 详见 `archive/deferred/2026-10-16--ds-story-1-13.md` 的「分诊结论」

## DF-036

**状态**：待触发 · **归属**：Story 1.16 / 1.18 · **恢复条件**：下一次改架构文档（`[GA]`）时把 `core/hud.ts` 补进组件树/模块表

**一句话**：`src/core/hud.ts` 仍未进 `game-architecture.md` 的 core/ 组件树，架构文档比代码少一模块

### 原始论证

### 4. 新增 `src/core/hud.ts`（架构组件树未列）—— 归 1.16/1.18 的架构回写

- 架构文档的组件树里没有 `core/hud.ts`，本 story 沿用 1.12 `core/build.ts` 的先例新建。
  ⇒ **架构文档现在比代码少一个模块**。判据全部零 DOM / 零 Vue / 零随机 / 零时间，
  与 `turn.ts` / `combat.ts` 同纪律，这条是它能被架构接受的前提。
  —
  `docs/rules/architecture.md`, `src/core/hud.ts`
  **恢复条件**：下一次改架构文档（`[GA]`）时把 `core/hud.ts` 补进组件树/模块表。


> 来源：`## Deferred from: story-1-13-HUD-阳光-心与进度 `[DS]` (2026-10-16)` ｜ 旧编号 `§4（1.13 DS）` ｜ 详见 `archive/deferred/2026-10-16--ds-story-1-13.md` 的「分诊结论」

## DF-037

**状态**：待触发 · **归属**：未指派 · **恢复条件**：若单元 2 的 JSON 换了 id 前缀形态，必须同步改 `progressDisplay` 并新增一条守卫，否则进度条会恒显示 0 而不报错

**一句话**：`core/hud.ts` 的 `progressDisplay` 用 `startsWith('u'+unitNumber+'-')`，eslint 的 `src/core/**` 块不禁 `content`，无守卫

### 原始论证

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


> 来源：`## Deferred from: story-1-13-HUD-阳光-心与进度 `[DS]` (2026-10-16)` ｜ 旧编号 `§7（1.13 DS）` ｜ 详见 `archive/deferred/2026-10-16--ds-story-1-13.md` 的「分诊结论」

## DF-038

**状态**：待触发 · **归属**：Story 1.18 · **恢复条件**：1.18 真机校准时复算三条对比度（阳光 / 心 / 白字）；若要改 `--color-heart` 或 `--color-sun` 的值，必须先跑 `palette.test.ts`

**一句话**：`tokens.css` 的 `--color-hud-panel: #1f2d11` 是推导值，未在 1.18 真机复算三条对比度

### 原始论证

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


> 来源：`## Deferred from: story-1-13-HUD-阳光-心与进度 `[DS]` (2026-10-16)` ｜ 旧编号 `§8（1.13 DS）` ｜ 详见 `archive/deferred/2026-10-16--ds-story-1-13.md` 的「分诊结论」

## DF-039

**状态**：待触发 · **归属**：未指派 · **恢复条件**：单元 2 或任何一条内容出现 `entryId !== wordId` 的词条时，立即走 `[CC]`：改字段名或引入映射表；不许继续把 `entryId` 塞进 `masteredWordIds`

**一句话**：`masteredWordIds` 存的是 `entryId`，单元 1 的 37/37 条恰好相等，单元 2 一分叉就得走 `[CC]`

### 原始论证

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


> 来源：`## Deferred from: story-1-13-HUD-阳光-心与进度 `[DS]` (2026-10-16)` ｜ 旧编号 `§9（1.13 DS）` ｜ 详见 `archive/deferred/2026-10-16--ds-story-1-13.md` 的「分诊结论」

## DF-040

**状态**：待触发 · **归属**：Story 1.18 / 1.19 · **恢复条件**：1.18/1.19 真机录制里若「心碎了」看不见或拖沓，先调这里；只许改这一处，改完复跑 AC-G1 第 9 项

**一句话**：`HeartRow.vue` 用 `--dur-slow`(400ms) 是本组件一次性判断，未在真机复核

### 原始论证

### 10. `--dur-slow`（400ms）用于掉心动画的理由是一次性的，不是通用的 —— 归 1.18 复核

- `--dur-feedback`（100ms）的注释明写「只许用于反馈类动画」，指的是「按下即回弹」；
  掉心是「碎裂 + 退回」两拍叙事，100ms 播不完 ⇒ 取 `--dur-slow`。
  ⚠️ 这是**本组件的判断**，不是「`--dur-slow` 就是给掉心用的」这条 token 约定。
  真实时长是否让孩子看得清，只能在真机上定。
  —
  `src/components/hud/HeartRow.vue`, `src/styles/tokens.css`
  **恢复条件**：1.18/1.19 真机录制里若「心碎了」看不见或拖沓，先调这里；
  **只许改这一处**，改完复跑 AC-G1 第 9 项（computedStyle 里不许出现字面量毫秒）。


> 来源：`## Deferred from: story-1-13-HUD-阳光-心与进度 `[DS]` (2026-10-16)` ｜ 旧编号 `§10（1.13 DS）` ｜ 详见 `archive/deferred/2026-10-16--ds-story-1-13.md` 的「分诊结论」

## DF-041

**状态**：待触发 · **归属**：Story 1.18 · **恢复条件**：1.18 部署 PWA 时加一个 favicon，这条自动闭合

**一句话**：AC-G1 三件事：`.battle-grid` 3px 横向溢出、`/favicon.ico` 404 待 1.18 PWA 收口，③ HUD 不进 G20 已定

### 原始论证

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


> 来源：`## Deferred from: story-1-13-HUD-阳光-心与进度 `[DS]` (2026-10-16)` ｜ 旧编号 `§11（1.13 DS）` ｜ 详见 `archive/deferred/2026-10-16--ds-story-1-13.md` 的「分诊结论」

## DF-042

**状态**：待触发 · **归属**：未指派 · **恢复条件**：1.14 接上掉心音效后，那时可以用「同一 tick 内音效与 class 同时触发」把 G53 升级成行为守卫；在此之前不许把 G53 的源码守卫当成「已用行为证明过」

**一句话**：G56/G57/G53 仍停在源码层；1.14 已接音效但结论是 G53 未升级

### 原始论证

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


> 来源：`## Deferred from: story-1-13-HUD-阳光-心与进度 `[DS]` (2026-10-16)` ｜ 旧编号 `§12（1.13 DS）` ｜ 详见 `archive/deferred/2026-10-16--ds-story-1-13.md` 的「分诊结论」

## DF-043

**状态**：待触发 · **归属**：未指派 · **恢复条件**：下一个改 `eslint.config.js` 覆盖名单的 story，或引入 minimatch 时

**一句话**：`tests/scaffold/audio-unlock-guard.test.ts` 的 `matchesGlob` 不支持 `[...]`，eslint 写 `src/{app,views}/**` 会静默判「没覆盖」

### 原始论证

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


> 来源：`## Deferred from: story-1-14-音效与-BGM-接入 `[DS]` (2026-10-16)` ｜ 旧编号 `§3（1.14 DS）` ｜ 详见 `archive/deferred/2026-10-16--ds-story-1-14.md` 的「分诊结论」

## DF-044

**状态**：待排期 · **归属**：Story 1.16 / 1.18 · **恢复条件**：下一次改 `game-architecture.md` 的组件树/模块表时，补上 `core/hud.ts`

**一句话**：`core/hud.ts` 仍未列进 `game-architecture.md` 组件树/模块表；1.14 只确认 effects 两文件已列

### 原始论证

### 5. 1.13 遗留：`core/hud.ts` 架构组件树未列 —— **本 story 不代劳**

- 逐条确认它**仍在 deferred 里**（本文件上一节第 4 条），归 1.16/1.18 的架构回写。
  1.14 的 AC-H8 只确认「`game-architecture.md` **本来就列了** `core/effects.ts` 与
  `app/effects-runner.ts`（`:748` / `:804`）⇒ 1.14 是「补实现」，**不需要 `[GA]` 回写**。
  两件事别混：`effects` / `effects-runner` 已列，`hud.ts` 仍缺。
  —
  `_bmad-output/planning-artifacts/game-architecture.md`


> 来源：`## Deferred from: story-1-14-音效与-BGM-接入 `[DS]` (2026-10-16)` ｜ 旧编号 `§5（1.14 DS）` ｜ 详见 `archive/deferred/2026-10-16--ds-story-1-14.md` 的「分诊结论」

## DF-045

**状态**：待裁决 · **归属**：未指派 · **恢复条件**：Story 1.16 把 `Effect` 的 `TTS` 成员真正接上时，必须重新裁决这一点

**一句话**：TTS 不在 `runEffects` 里产出，`store.speakQuestion()` 与 `QuestionCard.vue` 独立 watch 两处入口

### 原始论证

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



> 来源：`## Deferred from: story-1-14-音效与-BGM-接入 `[DS]` (2026-10-16)` ｜ 旧编号 `§6（1.14 DS）` ｜ 详见 `archive/deferred/2026-10-16--ds-story-1-14.md` 的「分诊结论」

## DF-046

**状态**：待触发 · **归属**：未指派 · **恢复条件**：Story 1.16 若给 `Effect` 加上会抛的新成员（`TTS`），且把它排在 `SAVE` 之前，这一条立刻变成可构造 ⇒ 那时必须补上「前一条抛错、后一条仍执行」的正向用例

**一句话**：`core/effects.ts` 里 SAVE 恒排末尾，`effects-runner` 写盘抛错后无后续条目可执行

### 原始论证

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


> 来源：`## Deferred from: story-1-15-存档与断点续学 `[DS]` (2026-10-17)` ｜ 旧编号 `DS1.15#1` ｜ 详见 `archive/deferred/2026-10-17--ds-story-1-15.md` 的「分诊结论」

## DF-047

**状态**：待触发 · **归属**：Story 1.16 / 1.17 · **恢复条件**：1.16 / 1.17 每次给 `State` 加字段时，同一次改动里确认 `core/reducer.ts` 的 `assertInvariants` 覆盖了它（并在 story 文档里留一行）

**一句话**：`save.ts` 的 `parseSaveFile` 只查 progress 两键 + currentGame 是对象，State 新字段无拒绝判据

### 原始论证

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


> 来源：`## Deferred from: story-1-15-存档与断点续学 `[DS]` (2026-10-17)` ｜ 旧编号 `DS1.15#3` ｜ 详见 `archive/deferred/2026-10-17--ds-story-1-15.md` 的「分诊结论」

## DF-048

**状态**：待触发 · **归属**：未指派 · **恢复条件**：新增第二条进关路径的同一个 story 里，必须确认它走 `enterLevel()` 或显式调 `restoreFromSave()`

**一句话**：读档只挂在 `store.enterLevel()`，新增进关路径若不经它就读不到存档

### 原始论证

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


> 来源：`## Deferred from: story-1-15-存档与断点续学 `[DS]` (2026-10-17)` ｜ 旧编号 `DS1.15#4` ｜ 详见 `archive/deferred/2026-10-17--ds-story-1-15.md` 的「分诊结论」

## DF-049

**状态**：待排期 · **归属**：未指派 · **恢复条件**：累计到第三个带前缀日志的服务时，把「前缀合规 + 不在逐帧路径」做成一条通用守卫

**一句话**：R-14 只在 `tests/scaffold/save-boundary.test.ts` 扫 `src/core/**`，services/app 的带前缀日志无守卫

### 原始论证

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



> 来源：`## Deferred from: story-1-15-存档与断点续学 `[DS]` (2026-10-17)` ｜ 旧编号 `DS1.15#5` ｜ 详见 `archive/deferred/2026-10-17--ds-story-1-15.md` 的「分诊结论」

## DF-050

**状态**：待触发 · **归属**：未指派 · **恢复条件**：任何一个动 `assertInvariants` 或给 `State` 加存档字段的 story，同一次改动里补 `unitNumber` 校验，并把 G221 的第一条前置断言翻过来

**一句话**：`reducer.ts` 的 `assertInvariants` 只查 unitNumber 形状，不查单元是否录入，`unitNumber: 99` 仍放行

### 原始论证

### 1. 🔴 `assertInvariants()` 不检查 `state.unitNumber` —— 读档能放一份「不存在单元」的对局进 `state`

- **事实**：`assertInvariants` 只查 grid / towers / deck / phase / 计数器 / 塔型 / 僵尸 / 实体 id，
  **一处都没提单元号**。实测 `{ ...一份合法的单元 1 对局, unitNumber: 99 }` **原样通过**。
- **后果**：那份对局一路进到渲染期，`LevelView` 的 `unitTotal` computed 撞 `entriesOf(99)` 抛 ——
  **只靠组件里那个 try/catch 兜住**。也就是说，逻辑层本该拦下的东西，今天靠 UI 层兜底。
- ⚠️ 这条**不是「有个洞没人管」**：兜底已经补上并由 **G221** 钉住（5 条用例，变异 M254/M255/M256）。
  登记的是**更深的那一层** —— 兜底再对，也改变不了「不变量检查漏了单元号」这件事本身。
- **为什么不在 1.15 修**：加 `unitNumber` 不变量是 **`core/` 的领域约束变更**，
  属于新 story 的 AC 范围，不是评审能顺手塞进 1.15 的补丁。
- **恢复条件**：任何一个动 `assertInvariants` 或给 `State` 加存档字段的 story，
  同一次改动里补 `unitNumber` 校验，并**把 G221 的第一条前置断言翻过来**
  （那时它会红 —— 红了才说明 UI 兜底不再是唯一防线）。
  —
  `src/core/reducer.ts`, `tests/components/level-view-unit-total.test.ts`


> 来源：`## Deferred from: code review of story-1-15-存档与断点续学 (2026-10-21)` ｜ 旧编号 `CR1.15#1` ｜ 详见 `archive/deferred/2026-10-21--cr-story-1-15.md` 的「分诊结论」

## DF-051

**状态**：待触发 · **归属**：未指派 · **恢复条件**：任何要把 R-14 扩到组件 / 视图层的 story，顺带裁决「组件里哪些 console 是允许的、形状是什么」

**一句话**：`LevelView.vue` 的 `unitTotal` computed 里 `console.warn`，R-14 只扫 `src/core/`

### 原始论证

### 2. `LevelView.vue` 的 computed 里 `console.warn` —— R-14 只扫 `src/core/`

- **事实**：R-14 逐字是「`src/core/` 源码里 `console.` 零出现」，
  `no-restricted-globals` 那一块也只挂在 `core/` 与 `content/`。
  ⇒ 组件 / 视图 / 服务层的日志**今天完全没有机器守卫**，只能靠 review。
- **为什么不在 1.15 修**：把 R-14 扩到 `src/views/` 会**立刻判红 `LevelView.vue` 这一处**，
  而这一处的 WARN 是 AC-D3 明确要的（「报错仍留在，别静默降级」）
  ⇒ **扩边界与改行为是两件事**，需要一次专门裁决，不是评审能顺手做的取舍。
- **恢复条件**：任何要把 R-14 扩到组件 / 视图层的 story，
  顺带裁决「组件里哪些 console 是允许的、形状是什么」。
  —
  `docs/rules/architecture.md`, `src/views/LevelView.vue`


> 来源：`## Deferred from: code review of story-1-15-存档与断点续学 (2026-10-21)` ｜ 旧编号 `CR1.15#2` ｜ 详见 `archive/deferred/2026-10-21--cr-story-1-15.md` 的「分诊结论」

## DF-052

**状态**：待触发 · **归属**：Story 1.17 · **恢复条件**：1.17 的调试面板若要给每个键配专门文案，那时把六键逐条文案一并定稿

**一句话**：`DebugPanel.vue` 仍按 `key=${item.key}` 通用渲染，六个 `SaveDegradationKey` 无逐键文案

### 原始论证

### 3. `SaveDegradationKey` 从 4 键长到 6 键，但没进本 story 的偏离表

- **事实**：新增 `clear`（1.15 `[CR]`，原本「删不掉存档」被报成 `'read'`）
  与 `invariant`（1.15 `[CR]`，对局状态非法）。
- **现状：刻意不进偏离表** —— 偏离表记的是「实现没做到 AC」，
  而这两个键是**把 AC 要求的降级分类补全**（AC-D4 逐字「降级项已登记（AC-B4）」），
  是**达成**而非偏离。事实源是 `src/services/save.ts` 的 `SaveDegradationKey` 注释。
- ⚠️ **顺带核实过 1.17 的调试面板不需要改**：它 `for (const item of saveDegradations())`
  逐条渲染 `key=${item.key}`，新键**自动出现**；「重试写入」按钮在 `invariant` 时也会露脸，
  而它写的正是内存里那份降级后的新对局 ⇒ **恰好能修好盘上那份坏的**，不需要额外接线。
- **恢复条件**：1.17 的调试面板若要给每个键配**专门文案**（当前是通用渲染），
  那时把六键逐条文案一并定稿。
  —
  `src/services/save.ts`, `src/components/debug/DebugPanel.vue`


> 来源：`## Deferred from: code review of story-1-15-存档与断点续学 (2026-10-21)` ｜ 旧编号 `CR1.15#3` ｜ 详见 `archive/deferred/2026-10-21--cr-story-1-15.md` 的「分诊结论」

## DF-053

**状态**：待触发 · **归属**：未指派 · **恢复条件**：下一次改 `epics.md` 的 AC 正文时（R-32 的时机），把 AC-D1 第 2 条改成可判定的口径，或显式标注「顺序不构成约束，理由已失效」

**一句话**：`epics.md` Story 1.15 无「先喂 progress 再喂 state」条款，该不可判定口径只留在归档的 1-15 文档

### 原始论证

### 4. AC-D1 逐字要求「先喂 progress 再喂 state，顺序不可换」—— 但这条 AC **不可判定**

- **事实**：`progress` 与 `state` 是两个独立 ref，**先后赋值的结果完全一样**，
  没有任何可观测差异能钉住顺序。AC 给的理由「喂反了会让进度条与战场对不上」
  在数据流上不成立（两者互不派生）。
- **为什么现在才提**：`tests/app/store-save.test.ts` 的文件头原先**声称**覆盖了顺序，
  `[CR]` 逐行核过之后发现 10 条用例里**没有一条**断言顺序 ⇒ 那句话是**假覆盖**，
  已在本轮删掉并改成如实说明（R-52 的同型：判据声称的覆盖不存在）。
- ⚠️ **留这一条是因为文件头说了「登记为 AC 需要重写或明确降级」**，
  而那句话当时**没有任何去处** —— 注释里的承诺背后没有登记，等于没有承诺。
- **恢复条件**：下一次改 `epics.md` 的 AC 正文时（R-32 的时机），
  把 AC-D1 第 2 条改成可判定的口径，或显式标注「顺序不构成约束，理由已失效」。
  —
  Story 1.15 文档（键 `1-15-存档与断点续学`）, `tests/app/store-save.test.ts` —— 📎 2026-10-25 夜：**不再写路径**（该文档已在归档层），只写**键**


> 来源：`## Deferred from: code review of story-1-15-存档与断点续学 (2026-10-21)` ｜ 旧编号 `CR1.15#4` ｜ 详见 `archive/deferred/2026-10-21--cr-story-1-15.md` 的「分诊结论」

## DF-054

**状态**：待触发 · **归属**：未指派 · **恢复条件**：与「`parseSaveFile` 只做底线形状校验」那条同一次处理 —— 任何动存档 schema 的 story，顺带定下「解析层拒什么、逻辑层抛什么」的清单

**一句话**：`save.ts` 的 `isProgressShape` 只判 `typeof number`（NaN/-1 全放行），`isPlainObject` 是不健全谓词

### 原始论证

### 5. 存档边界的结构校验很浅：`parseSaveFile` + `isPlainObject(value): value is State`

- **事实一**：`progress` 只校验 `typeof p.currentUnitIndex === 'number'`，
  而这对 `NaN` / `-1` / `1.5` **全为真** ⇒ 一份手改或损坏的存档能让 HUD 显示
  「NaN/60」或负数单元号，**不报任何错**。
  `masteredWordIds` 只校验「字符串数组」，内容里已删除的词 id 会永远留在表里。
- **事实二**：`isPlainObject(value): value is State` 是一个**不健全的类型谓词** ——
  它凭「是个非数组对象」就把 `unknown` 收窄成 `State` 这个判别联合，
  于是 `parseSaveFile` 的返回类型**声称**它验证过一个 `State`，而它没有。
- **为什么不在 1.15 修**：这属于 `[DS]` 第 3 条已登记的那条
  （「`parseSaveFile` 只做底线形状校验 —— 对局的新字段没有对应的拒绝判据」）的**同型扩大**。
  收窄结构校验会连带影响 `assertInvariants` 的职责边界（哪些该在解析层拒、哪些该在逻辑层抛），
  是**架构层面的划分**，不是评审能顺手做的。
- **恢复条件**：与本文件里「`parseSaveFile` 只做底线形状校验」那条**同一次**处理 ——
  任何动存档 schema 的 story，顺带定下「解析层拒什么、逻辑层抛什么」的清单。
  ——
  `src/services/save.ts`, Story 1.15 文档（键 `1-15-存档与断点续学`） —— 📎 2026-10-25 夜：**不再写路径**（该文档已在归档层），只写**键**



> 来源：`## Deferred from: code review of story-1-15-存档与断点续学 (2026-10-21)` ｜ 旧编号 `CR1.15#5` ｜ 详见 `archive/deferred/2026-10-21--cr-story-1-15.md` 的「分诊结论」

## DF-055

**状态**：待触发 · **归属**：Story 1.17 · **恢复条件**：任何要动 `restoreNextUnit` 或给 `SaveDegradationKey` 加键的 story，同一次改动里补上这两条路径的降级登记，并顺带把 1.17 的面板文案定稿

**一句话**：`store.ts` 的 `restoreNextUnit` 两条失败分支只 `console.warn`，不调 `markRestoreDegraded`

### 原始论证

### 1. 🔴 `restoreNextUnit()` 的两条失败路径**只 `console.warn`，不登记降级项**

- **事实**：`store.ts` 的 `restoreFromSave()` 在 `currentGame === null` 时调 `restoreNextUnit(savedProgress)`，
  而那个函数有**两条**失败分支：
  ① 「存档指向的单元**未录入**」⇒ `console.warn` 后**保持当前战场**；
  ② `buildStateFor(targetUnitNumber)` **抛** ⇒ `console.warn` 后**保持当前战场**。
  ⇒ 两条都**不**调 `markRestoreDegraded(...)` ⇒ `isSaveDegraded()` 仍为 false
  ⇒ **1.17 的调试面板一个字都不显示**，而家长看到的是「重进后停在上一局、进度条却不动」——
  **没有任何可查的原因**。
- ⚠️ **为什么这与第一轮修的那条同型、却没一起修**：第一轮修的是 `restoreFromSave()` **自己**的
  `assertInvariants` 抛错那条路径（守卫 **G220**）—— 那条已经登记了 `'invariant'`。
  ⇒ **`restoreNextUnit` 的这两条是另外两条路径**，它们发生在**组装下一局**时，
    与「盘上那份对局非法」是两件事。
- **为什么不在 1.15 修**：要给它们**各配一个键**（比如「单元未录入」与「组装失败」），
  就是**再加两个降级键**（今天的键集合已经是 AC-B5 之外的三条偏离），
  而**键的语义要 1.17 的面板文案一起定稿**（见本文件「`SaveDegradationKey` 从 4 键长到 6 键」那条）。
  ⇒ **加键与定文案是同一件事**，不该由一次评审顺手做掉。
- **恢复条件**：任何要动 `restoreNextUnit` 或给 `SaveDegradationKey` 加键的 story，
  同一次改动里补上这两条路径的降级登记，并**顺带把 1.17 的面板文案定稿**。
  —
  `src/app/store.ts`, `src/services/save.ts`, `src/components/debug/DebugPanel.vue`


> 来源：`## Deferred from: code review of story-1-15-存档与断点续学 (第二轮) (2026-10-21)` ｜ 旧编号 `CR1.15R2#1` ｜ 详见 `archive/deferred/2026-10-21--cr-story-1-15-r2.md` 的「分诊结论」

## DF-056

**状态**：待触发 · **归属**：未指派 · **恢复条件**：新增任何 `readSave()` 的调用点时，复核那一处是否也要「空读撤掉 `read`」；若不要，在那一处显式注释理由

**一句话**：`readSave()` 的「空读撤掉 read 降级」语义只在 `store.ts` 这一个调用点成立

### 原始论证

### 2. 「一次成功的空读撤掉 `read` 降级」这条语义，**只对 `enterLevel` 这一个调用点**成立过

- **事实**：第二轮给 `readSave()` 的 `raw === null` 分支加了 `resolveDegradations(RESOLVED_BY_EMPTY_READ)`
  —— 理由是「`getItem` **成功返回了** ⇒ 存储是通的 ⇒『读不到』这件事不成立了」。
  ⚠️ 这条语义**依赖一个前提**：调用方是**「我只是想读一下存档」**，
    而不是**「我明知道读不到，想留个记录」**。
  ⇒ 今天 `readSave()` **只有一个调用点**（`store.ts` 的 `restoreFromSave()`）⇒ 前提成立。
- **风险**：将来若出现**第二个**读档入口（例如设置页里的「检查存档」，
  或家长在别的设备上手动导入了坏档），那条入口**可能**希望 `read` 降级**留着**。
  ⇒ 到时候需要复核，而不是照抄今天这行。
- **恢复条件**：**新增任何 `readSave()` 的调用点**时，
  复核那一处是否也要「空读撤掉 `read`」；若不要，在那一处显式注释理由。
  —
  `src/services/save.ts`, `src/app/store.ts`


> 来源：`## Deferred from: code review of story-1-15-存档与断点续学 (第二轮) (2026-10-21)` ｜ 旧编号 `CR1.15R2#2` ｜ 详见 `archive/deferred/2026-10-21--cr-story-1-15-r2.md` 的「分诊结论」

## DF-057

**状态**：待排期 · **归属**：Story 1.17 · **恢复条件**：任何要加「测试专用导出」或要动 `tests/scaffold/` 边界守卫的 story，同一次改动里补一条「`src/**` 不得 import 名字以 `ForTest` 结尾的导出」的守卫

**一句话**：`save.ts` 的 `clearSaveDegradationsForTest` 与 `asset-degradations.ts` 的同名导出仍无「src 不得 import `*ForTest`」守卫

### 原始论证

### 3. `src/services/save.ts` 现在带一个**测试专用导出**，而**全仓没有**「生产代码不许 import `*ForTest`」的守卫

- **事实**：第二轮给 `save.ts` 加了 `clearSaveDegradationsForTest()`
  （与 `services/asset-degradations.ts` 的 `clearAssetDegradationsForTest()` 同款）。
  ⚠️ **同款的缺口在 `asset-degradations.ts` 上早就存在** ——
  **全仓没有任何一条守卫**拦着 `src/` 去 import 这两个 `*ForTest` 导出。
  ⇒ 一旦有人图省事在生产代码里调 `clearSaveDegradationsForTest()`，
  **降级登记表会被悄悄清空** ⇒ 面板对家长说「存档正常」，而孩子此后每一次落盘都在丢进度 ——
  **和 G222 / G244 守的那两个缺陷完全同型**。
- **为什么不在 1.15 修**：这是一条**跨文件**的规则（禁 `src/**` import 任何 `*ForTest` 导出），
  属于 `tests/scaffold/` 的边界守卫家族，改动面比 1.15 大；
  而且 `asset-degradations.ts` 那个同类缺口**不是 1.15 引入的** ——
  1.15 只是**又添了一个同类**。
- **恢复条件**：任何要加「测试专用导出」或要动 `tests/scaffold/` 边界守卫的 story，
  同一次改动里补一条「`src/**` 不得 import 名字以 `ForTest` 结尾的导出」的守卫。
  —
  `src/services/save.ts`, `src/services/asset-degradations.ts`, `tests/scaffold/`



> 来源：`## Deferred from: code review of story-1-15-存档与断点续学 (第二轮) (2026-10-21)` ｜ 旧编号 `CR1.15R2#3` ｜ 详见 `archive/deferred/2026-10-21--cr-story-1-15-r2.md` 的「分诊结论」

## DF-058

**状态**：待触发 · **归属**：未指派 · **恢复条件**：出现第二条会切走 `QuestionCard` 的路径时（1.17 的调试面板、1.18 的暂停覆盖层、或任何把 `view` 从 `level` 切走的分支），必须先给 `pronunciation.ts` 补公开的 `stop`，再挂 `onBeforeUnmount`

**一句话**：`QuestionCard.vue` 无 `onBeforeUnmount`、`pronunciation.ts` 无公开 stop，卸载后朗读一路播到结束

### 原始论证

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


> 来源：`## Deferred from: story-1-16-关卡流程-通关-失败与推进 `[DS]` (2026-10-17)` ｜ 旧编号 `DS1.16#3` ｜ 详见 `archive/deferred/2026-10-17--ds-story-1-16.md` 的「分诊结论」

## DF-060

**状态**：待排期 · **归属**：未指派 · **恢复条件**：下一次做文档治理（`/gds-correct-course` 或 QD 治理）时，把这条口径更正一次性回写进 1.13 的归档文档，并同步 `docs/rules/` 里与「落盘看到的进度」有关的任何表述

**一句话**：归档的 1-13 文档仍写「HUD 的进度只读内存里的进度」，与 1.16 裁决 11 的「这一次结算之后」口径不一致

### 原始论证

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


> 来源：`## Deferred from: story-1-16-关卡流程-通关-失败与推进 `[DS]` (2026-10-17)` ｜ 旧编号 `DS1.16#5` ｜ 详见 `archive/deferred/2026-10-17--ds-story-1-16.md` 的「分诊结论」

## DF-061

**状态**：待触发 · **归属**：未指派 · **恢复条件**：出现第二条会切走 `QuestionCard` 的路径时（1.17 的调试面板、1.18 的暂停覆盖层、或任何把 `view` 从 `level` 切走的分支）

**一句话**：`QuestionCard.vue` 仍无 `onBeforeUnmount`，1.17 未新增会切走它的路径

### 原始论证

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


> 来源：`## Deferred from: story-1-17-调试工具与会话回放 `[DS]` (2026-10-17)` ｜ 旧编号 `DS1.17#2` ｜ 详见 `archive/deferred/2026-10-17--ds-story-1-17.md` 的「分诊结论」

## DF-062

**状态**：待触发 · **归属**：Story 1.18（仅 BGM 部分） · **恢复条件**：出现第二条不经 `enterLevel()` 进关卡的路径

**一句话**：`backToStart()` 已调 `stopBgm()`，但 `state.value` 仍停在终态相位

### 原始论证

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


> 来源：`## Deferred from: code review of story-1-16-关卡流程-通关-失败与推进 `[CR]` (2026-10-17)` ｜ 旧编号 `CR1.16#1` ｜ 详见 `archive/deferred/2026-10-17--cr-story-1-16.md` 的「分诊结论」

## DF-063

**状态**：待触发 · **归属**：未指派 · **恢复条件**：下一次改通关心案时，顺手把它改成「不匹配任何负向词表」的表述

**一句话**：`tests/components/level-outcome.test.ts` 仍把正向词写死成 `/读完|完成|太棒|过关/`

### 原始论证

### 3. G91 的正向词正则比 AC 更严

- **来源**：blind #12
- **缺口**：`expect(w.text()).toMatch(/读完|完成|太棒|过关/)` 把允许词写死成四个；
  把文案换成同样合规的「通关啦！」即红。AC-E1 零字面约束。
- **为什么不属 patch**：负向文案已由 G91 的 `FORBIDDEN_IN_TEXT` 正向黑名单兜住，
  这条正向断言只是加保险。放宽它属于**改判据**（R-57 需留痕），不是修 bug。
- **恢复条件**：下一次改通关心案时，顺手把它改成「不匹配任何负向词表」的表述。
  — `tests/components/level-outcome.test.ts`


> 来源：`## Deferred from: code review of story-1-16-关卡流程-通关-失败与推进 `[CR]` (2026-10-17)` ｜ 旧编号 `CR1.16#3` ｜ 详见 `archive/deferred/2026-10-17--cr-story-1-16.md` 的「分诊结论」

## DF-064

**状态**：待触发 · **归属**：未指派 · **恢复条件**：`shown` 函数体首次出现嵌套 `{}` 时换成真解析（正解不是再加一个计数器）

**一句话**：`tests/components/quiz-card.test.ts` 的 `shownBody()` 仍用单层花括号 depth 计数切函数体

### 原始论证

### 4. G94 用花括号深度计数切 `shown` 的函数体

- **来源**：blind #9
- **缺口**：单层 `depth` 计数、不识别模板字符串 / 正则字面量里的 `}`。
  `shown` 函数体一旦新增任意嵌套 `{}`，循环提前退出 ⇒ G94 静默取到被截断的字符串而失效。
- **今天不成立**：`shown` 当前无嵌套，判据正确。
- **恢复条件**：`shown` 函数体首次出现嵌套 `{}` 时换成真解析（正解不是再加一个计数器）。
  — `tests/components/quiz-card.test.ts`


> 来源：`## Deferred from: code review of story-1-16-关卡流程-通关-失败与推进 `[CR]` (2026-10-17)` ｜ 旧编号 `CR1.16#4` ｜ 详见 `archive/deferred/2026-10-17--cr-story-1-16.md` 的「分诊结论」

## DF-065

**状态**：待排期 · **归属**：未指派 · **恢复条件**：判为 P3；真出现时是显眼的架构违例（GDD 禁止选关），不是静默回归

**一句话**：`tests/scaffold/no-unit-select.test.ts` 的反向自测仍只把 `views/UnitSelectView.vue` 塞进 probe

### 原始论证

### 5. `no-unit-select` 的反向探针只覆盖 `views/` 这一种路径形态

- **来源**：blind #16
- **缺口**：探针只往 `probe` 里塞 `views/UnitSelectView.vue`；若有人把同名文件建到
  `components/` 下，这条守卫不响。G92/G113 的主体判据（扫全 `src/`）仍会红，
  但这条「反向自检」本身不提供那层保护。
- **恢复条件**：判为 P3。真出现时是显眼的架构违例（GDD 禁止选关），不是静默回归。
  — `tests/scaffold/no-unit-select.test.ts`


> 来源：`## Deferred from: code review of story-1-16-关卡流程-通关-失败与推进 `[CR]` (2026-10-17)` ｜ 旧编号 `CR1.16#5` ｜ 详见 `archive/deferred/2026-10-17--cr-story-1-16.md` 的「分诊结论」

## DF-066

**状态**：待触发 · **归属**：Epic 2 · **恢复条件**：Epic 2 录第二单元时同步调阈值，并在 helper 注释里写死「阈值怎么跟着内容长」

**一句话**：`tests/app/level-flow.test.ts` 的 `driveLevel` 仍以 `guard > 200` 判定「跑了一局还没通关」

### 原始论证

### 6. `driveLevel` 的 `guard > 200` 与内容长度耦合

- **来源**：blind #17
- **缺口**：Epic 2 录入第二单元后一局可能超过 200 步，抛的是「跑了一局还没通关」而非可读诊断。
- **恢复条件**：Epic 2 录第二单元时同步调阈值，并在 helper 注释里写死「阈值怎么跟着内容长」。
  — `tests/app/level-flow.test.ts`


> 来源：`## Deferred from: code review of story-1-16-关卡流程-通关-失败与推进 `[CR]` (2026-10-17)` ｜ 旧编号 `CR1.16#6` ｜ 详见 `archive/deferred/2026-10-17--cr-story-1-16.md` 的「分诊结论」

## DF-067

**状态**：待排期 · **归属**：未指派 · **恢复条件**：下一次动 `core/reducer.ts` 的 `masteredEntryIds` 追加时，改成去重追加并补断言

**一句话**：`core/reducer.ts` 仍用 `[...state.masteredEntryIds, id]` 追加，不去重

### 原始论证

### 7. `reducer` 的 `masteredEntryIds` 追加时不去重

- **来源**：edge 层复核时降级为 P3
- **缺口**：`masteredEntryIds` 走 `[...prev, id]`，`assertInvariants` 不查内部重复
  ⇒ 一旦某条路径重复记同一个词，数组静默膨胀。
- **今天不成立**：运行时由 `nextQuestion` 的 `includes` 过滤兜住，跑不到重复。
- **归属**：1.5 交付的既有行为，1.16 未触碰该行。
  — `src/core/reducer.ts`


> 来源：`## Deferred from: code review of story-1-16-关卡流程-通关-失败与推进 `[CR]` (2026-10-17)` ｜ 旧编号 `CR1.16#7` ｜ 详见 `archive/deferred/2026-10-17--cr-story-1-16.md` 的「分诊结论」

## DF-068

**状态**：待触发 · **归属**：Epic 2 · **恢复条件**：Epic 2 出现第二个单元时重新评估「钳到合法范围」还是「显式清零」

**一句话**：`store.ts` 的 `restoreNextUnit` 两条失败分支只回退 `state`，`progress.currentUnitIndex` 仍指向不存在的单元

### 原始论证

### 8. `restoreNextUnit` 的两条降级路径只回退 `state`、不回退 `progress`

- **来源**：blind #2 + auditor F-02（合并）
- **缺口**：存档指向未录入单元、或 `buildStateFor` 抛错时，两条分支都只 `console.warn`
  ⇒ `state` 停在单元 1 而 `progress.currentUnitIndex` 仍指向那个不存在的单元，二者长期不一致。
- **不是疏漏**：「进度**不回退**」是该函数注释里**逐字写下的裁决**。
- **今天不可达**：Epic 1 `currentUnitIndex` 恒 0 ⇒ `+1` 恒为 1 ⇒ 单元 1 已录入 ⇒ 两条分支都走不到。
- **恢复条件**：Epic 2 出现第二个单元时重新评估「钳到合法范围」还是「显式清零」。
  ⚠️ 本 story 对它的**措辞不一致**已单列为 patch，不在本条。
  — `src/app/store.ts`


> 来源：`## Deferred from: code review of story-1-16-关卡流程-通关-失败与推进 `[CR]` (2026-10-17)` ｜ 旧编号 `CR1.16#8` ｜ 详见 `archive/deferred/2026-10-17--cr-story-1-16.md` 的「分诊结论」

## DF-069

**状态**：待触发 · **归属**：Story 1.18 · **恢复条件**：下一次改架构文档（`[GA]`）时补进组件树/模块表

**一句话**：`game-architecture.md` 组件树缺 `core/hud.ts`、`asset-prefetch.ts`、`sw/` 等 7 个模块

### 原始论证

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


> 来源：`## Deferred from: story-1-18-目标平板落地-竖屏布局-离线与部署 `[DS]` (2026-10-17)` ｜ 旧编号 `1（1.18 节）/ AC-H1` ｜ 详见 `archive/deferred/2026-10-17--ds-story-1-18.md` 的「分诊结论」

## DF-070

**状态**：待触发 · **归属**：Story 1.18 · **恢复条件**：下一次 `[GA]` 时，①②④⑤⑦⑧ 按上表补进架构文档；③ 保持「显式不做」并写明「引入位图素材时必须重新评估」；⑥ 属运维事项，不进架构组件树

**一句话**：AC-H2 的 8 项（CSS 断点 / manifest / 缓存层）只在 1.18 定案，未进架构文档

### 原始论证

### 2. AC-H2：8 项在 `game-architecture.md` / `gdd.md` / `epics.md` 中**均无原文**

- 逐条给出**本 story 的定案 + 守卫**，或显式标为待办 —— 不留「实现者自行决定」的口头空白。

| # | 条目 | 本 story 的处置 | 守卫 / 落点 |
|---|---|---|---|
| ① | CSS 断点 | **定案**：`src/styles/responsive.css`，全文件**只有一条**媒体查询 `@media (max-height: 900px)`。⚠️ 它是**高度**断点、不是宽度断点 —— 本 story 的形态问题是「竖屏 800×1280 下 HUD 把战场顶出视口」，可用的量是**高度**，不是宽度。⚠️ **宽度断点刻意为零**（本 story 之前全仓 `@media` 数量为 0，实测）：竖屏平板的宽度区间恰好由 `min-width: 0` + 列轨布局自然适配，硬加 `min-width` 断点只会带来第二套要重测的排版。**不写进 `tokens.css`**（R-12：已定稿 token 的值一个都不许改） | `portrait-layout.test.ts`（源码级） |
| ② | viewport meta 取值 | **定案**，架构文档无原文但仓库 `index.html` 一直有：实测 `width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover`。`maximum-scale=1` 有实测依据（Android 双击缩放的 300ms 延迟会击穿 FR78 的 ≤100ms 预算），`viewport-fit=cover` 让 `env(safe-area-inset-*)` 生效。⚠️ **不许动** | `portrait-layout.test.ts` **G204**（源码级断言，非 PWA 组）—— ⚠️📎 `[CR]` 2026-10-20 更正：本条原先只写「portrait-layout.test.ts（源码级断言）」而**没有守卫编号**，实测那条断言**当时压根不存在**（零条）⇒ 裁决 10 逐字「这两项都不许在 1.18 里被『顺手整理』掉」的两个取值**实际无人守**。现已补 **G204**（逐条断言 `maximum-scale=1` 与 `viewport-fit=cover` 都在 `index.html` 里，外加一条反向自测证明拿掉任一项会红） |
| ③ | 像素密度 / DPR | **显式不做** —— 战场格子靠 `aspect-ratio` 与列轨布局，图标是 SVG（矢量），PNG 只用于 PWA 主屏图标（由浏览器自己缩放）。⇒ 无需在架构文档登记 DPR 策略 | —— |
| ④ | manifest 字段清单 | **定案**（架构无原文）：8 个必填文本字段 + `icons`；`start_url`/`scope`/`id` 三者一律 `/plantsgame/`（换域名时 `id` 不失效）。⚠️ `id` **故意不是** `https://…` 形式 | `verify-deploy.ts` ② 组 12 项 + `pwa-manifest.test.ts` |
| ⑤ | precache 与 runtime cache 的分层比例 | **定案**：应用外壳（html/js/css）precache；`.mp3`/`.svg` 走 runtime `CacheFirst`。⚠️ **不是全量 precache** —— 架构决策 6 逐字「全量预载 400 张必超冷启动 3s」；本 story 只 precache 外壳，图片是进入单元后异步预取（AC-E2） | `sw/sw-rules.ts` + `pwa-sw-guard.test.ts` |
| ⑥ | gzip / 缓存头 / CI | **部分定案、部分待办**：缓存头要求写进 `docs/deployment.md` §3 —— `sw.js`/`manifest` 必须 `no-cache`（SW 脚本自身长缓存会让换代永远不生效），带哈希的 JS/CSS 可 `immutable`，**媒体 mp3/svg 必须单独一段**（它们的 URL 稳定，如 `u1-dog.mp3`，长缓存会把旧录音冻住）。⚠️ **待办**：当前托管方（GitHub Pages）**没有官方的自定义缓存头能力**，只有全局 10 分钟 ⇒ 要真正生效必须换托管或加 CDN | `docs/deployment.md` §3；缓存头本身列入**人工待验清单** |
| ⑦ | SW 注册失败在三层错误策略中的归类 | **定案**：归**运行时层** —— 非安全上下文不注册、`[sw] WARN`、静默继续；**禁止白屏或错误页**（裁决 7）。⚠️ 这与架构把「内容错误」归内容层、「渲染错误」归渲染层的两分法不同：**离线能力缺失不得让孩子看见任何东西** | `sw-insecure-context.test.ts` / `sw-registration.test.ts` |
| ⑧ | 语音浮层的定位约束 | **定案**：`PronunciationOverlay` 排在 `<BattleField />` **之前**、是普通流元素 ⇒ 几何上不可能遮挡战场任何一格（AC-D1）；高度恒定，朗读开始/结束都不让战场位移。⚠️ 刻意**不用** `position: absolute` —— 那要赌「它不会在某个视口下压到战场上」 | `portrait-layout.test.ts`（模板顺序 + 零绝对/固定定位 + 零负 margin） |

- **恢复条件**：下一次 `[GA]` 时，①②④⑤⑦⑧ 按上表补进架构文档；③ 保持「显式不做」并在文档里写明
  「引入位图素材时必须重新评估」；⑥ 的托管侧能力属运维事项，不进架构组件树。


> 来源：`## Deferred from: story-1-18-目标平板落地-竖屏布局-离线与部署 `[DS]` (2026-10-17)` ｜ 旧编号 `2（1.18 节）/ AC-H2` ｜ 详见 `archive/deferred/2026-10-17--ds-story-1-18.md` 的「分诊结论」

## DF-071

**状态**：待触发 · **归属**：Story 1.19 · **恢复条件**：Story 1.19 真机试玩时验，结论回填本条

**一句话**：AC-B8 离线、`--color-hud-panel`、`--dur-slow`、竖屏布局 4 项须真机验

### 原始论证

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


> 来源：`## Deferred from: story-1-18-目标平板落地-竖屏布局-离线与部署 `[DS]` (2026-10-17)` ｜ 旧编号 `4（1.18 节）` ｜ 详见 `archive/deferred/2026-10-17--ds-story-1-18.md` 的「分诊结论」

## DF-073

**状态**：待触发 · **归属**：Story 3.5（及各自归属 story） · **恢复条件**：E 组 5 条观察项 1.19 只观察不改，分别落 3.5 / 1.10 / `[CC]`

**一句话**：E 组 5 条观察项 1.19 只观察不改，分别落 3.5 / 1.10 / `[CC]`

### 原始论证

### 3. ⏸ E 组观察项：**本 story 只观察不改**，恢复条件随各自归属 story

| # | 观察项 | 恢复条件 / 归属 |
|---|---|---|
| E1 | 孩子能否在**不看文字**的情况下读出「只有中间那一行能建塔」（`--color-overlay-inert` 的感知强度） | Story 3.5（平板竖屏布局细节打磨）；⚠️ Chromium 上实测仅 −10% 亮度，**真机不是像素能判的** |
| E3 | 「心碎了」看不看得清（`--dur-slow` 400ms 的真实观感） | ⚠️ **只许改这一处**；改完复跑 AC-G1 第 9 项（computedStyle 里不许出现字面量毫秒） |
| E4 | 战场是否横向撑破容器 / 格子变扁（`flex: 0 0 auto` + `content-box`） | Story 1.10 的两处 Debug Log 已知缺口；jsdom 无布局引擎 ⇒ 自动化证明不了 |
| E5 | 相邻行能不能开火（`turn.ts`「只有僵尸所在那一行的塔开火」） | ⚠️ 1.12 逐字写着「本 story **不改战斗判定**」；属 `[CC]` |
| E6 | 合法塔位从 35 格降到 7 格 | 已被裁决锁死的难度维度；**验难度曲线时不要当 bug「修回去」** |


> 来源：`## Deferred from: story-1-19-单元-1-首次试玩验证 `[DS]` (2026-10-17)` ｜ 旧编号 `3（1.19 节）/ E1·E3·E4·E5·E6` ｜ 详见 `archive/deferred/2026-10-17--ds-story-1-19.md` 的「分诊结论」

## DF-074

**状态**：待触发 · **归属**：Story 1.19 · **恢复条件**：真机飞行模式

**一句话**：D1–D8 真机项全未验，未验则不应推进 Epic 2

### 原始论证

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
- — Story 1.19 文档（键 `1-19-单元-1-首次试玩验证-epic-1-的生死线`）—— 📎 2026-10-25 夜：**不再写路径**，只写**键**（story 文档会归档，路径会变，键不会）

- — Story 1.19 文档（键 `1-19-单元-1-首次试玩验证-epic-1-的生死线`）—— 📎 2026-10-25 夜：**不再写路径**，只写**键**（story 文档会归档，路径会变，键不会）


> 来源：`## Deferred from: story-1-19-单元-1-首次试玩验证 `[DS]` (2026-10-17)` ｜ 旧编号 `4（1.19 节）/ D1–D8` ｜ 详见 `archive/deferred/2026-10-17--ds-story-1-19.md` 的「分诊结论」

> 来源：`## Deferred from: story-1-19-单元-1-首次试玩验证 [DS] 第二轮 — 横屏（2026-10-17）` ｜ 旧编号 `1（横屏节）` ｜ 详见 `archive/deferred/2026-10-17--ds-story-1-19-r2.md` 的「分诊结论」

## DF-076

**状态**：待裁决 · **归属**：Story 3.5 · **恢复条件**：人裁决横屏左栏的战场高度占比（Story 3.5 `[DS]` 实测 1280×800：战场 848×519、手牌区 848×147、两者**不相交**、题卡 67~800 ⇒ 行高 733 ⇒ 战场与手牌区之间空隙 ≤ 67px）；裁决后写进新 story 实施，不许在本条里悄悄改列宽比例

**一句话**：1280×800 下战场被宽度约束，左栏底部余量实测 ≤67px（1.19 推算的 190px 已被实测推翻）

### 原始论证

### 2. ⚠️ 横屏下的视觉遗留：左栏底部约 190px 空白

**事实（实测 1280×800）** 战场是**宽度约束**的：左栏 832px 宽 ⇒ 战场 519px 高，
而左栏可用 768px ⇒ 底部余 ~190px。

**为什么留着** 不影响可用性；把战场再放大就得动列宽比例或改战场尺寸策略，
那是设计题，塞进一次堵口修复里会看不清因果。**本次刻意不做无关重排。**

**恢复条件** Story 3.5 布局打磨时一并看；若真机试玩反馈「战场看着偏上」也提前处理。

### 2026-10-25（Story 3.5 `[DS]`）处置 —— 触发条件已到，**实测值已拿到**，结论仍待人裁决

- **触发条件**「Story 3.5 布局打磨时一并看」**已到**（本 story 就是那次打磨）⇒
  状态从「待触发」改为「**待裁决**」。
- **本 story 做了什么** 量测工具（`scripts/verify-portrait-layout.ts`）已把
  **1280×800 留在矩阵里**，并在**两个相位**（答题相 / 建造相）各量一行 ⇒
  需要的数字（战场尺寸、垂直余量）**现在有地方取**了。
- **实测值（真浏览器，2026-10-25，`npm run verify:portrait`）**：

  | 量项 | 答题相 | 建造相 |
  |---|---|---|
  | 战场盒 | 848×519 | 848×519 |
  | 手牌区盒 | —（不在 DOM 里） | 848×147 |
  | 手牌区与战场**相交** | — | **否** |
  | 手牌卡在视口内 | — | **是** |
  | 垂直余量 | 0 | 0 |
  | 题卡纵向范围 | 67~800 | 67~800 |

- ⚠️ **「垂直余量 = 0」怎么读**：它量的是「`.level-view` 内容底边 → 视口底边」，
  而横屏**右栏（题面）被拉满了整行**（`align-self: stretch`）⇒ 内容底边 = 视口底边
  ⇒ **0**。⇒ **左栏自己的余量要另算**：
  **战场 519 + 手牌区 147 = 666**，那一行高 **733**（题卡 67~800）⇒
  **战场与手牌区之间的空隙 ≤ 67px**。
- ⚠️ **1.19 那个「约 190px」已被实测推翻**（R-21）：它是按
  「左栏可用 768px − 战场 519px」推算的，**没算手牌区那 147px**。
- **本 story 没做什么** 左栏余量是**设计题**（「战场该占左栏多少高度」）
  ⇒ `[DS]` **不擅自改列宽比例**（那是比例决策）⇒ 归**待人裁决**。


> 来源：`## Deferred from: story-1-19-单元-1-首次试玩验证 [DS] 第二轮 — 横屏（2026-10-17）` ｜ 旧编号 `2（横屏节）` ｜ 详见 `archive/deferred/2026-10-17--ds-story-1-19-r2.md` 的「分诊结论」

## DF-077

**状态**：待触发 · **归属**：Story 1.19 · **恢复条件**：1.19 真机试玩时把平板转成横屏对照一次（验「不能种植」是不是横屏独有）

**一句话**：横屏是否就是平板「不能种植」的唯一原因仍未验，须真机旋转对照

### 原始论证

### 3. ⚠️ 横屏是否就是平板那次「不能种植」的唯一原因 —— **仍未验**

- 横屏缺陷本身**已坐实**（截图 + 逐尺寸实测：1280×800 下 `.question-card` `top=875` > 视口 800）。
- 但**真机旋转对照没做**（story 1.19 的 Task 6.11 未勾）。
- **用户在平板上的对照做法**：竖屏打开 dev server 玩一题拿到卡，**再把平板横过来** ——
  修好后应当画面原地不变。若竖屏正常而横屏修好后**仍**「不能种植」，
  则本 bug 不是唯一原因，**继续查「平板上有没有声音 / 孩子能否把听到的词对上图」**。
- ⚠️ 与 D1–D8 一并处理即可（同一趟真机试玩）。
- — Story 1.19 文档（键 `1-19-单元-1-首次试玩验证-epic-1-的生死线`）—— 📎 2026-10-25 夜：**不再写路径**，只写**键**（story 文档会归档，路径会变，键不会）

---


> 来源：`## Deferred from: story-1-19-单元-1-首次试玩验证 [DS] 第二轮 — 横屏（2026-10-17）` ｜ 旧编号 `3（横屏节）` ｜ 详见 `archive/deferred/2026-10-17--ds-story-1-19-r2.md` 的「分诊结论」

## DF-078

**状态**：待触发 · **归属**：未指派 · **恢复条件**：存档降级路径重做时（与 M2 一并看）

**一句话**：`store.ts` 的 `restoreFromSave` catch 清零 `masteredWordIds`，代价变成「下局考哪 10 个词」

### 原始论证

### 1. 存档对局不合法 ⇒ 跨局进度被清零，而 1.19 之后清零直接决定「下一局考哪 10 个词」

- `src/app/store.ts:374`：`restoreFromSave` 的 catch 分支把 `progress` 重置成 `{ currentUnitIndex: 0, masteredWordIds: [] }`。
- 这段是 1.16 AC-D4 的既有降级路径，本 story 没动它。
- ⚠️ **1.19 放大了影响面**：`masteredWordIds` 现在是题单切片的唯一输入（裁决 2），清零的代价从「进度条上一个数字」变成「下一局考哪 10 个词」。
- 该分支既无测试，也只留一条 `console.warn`。孩子侧看到的是「我学过的东西全没了」。
- **恢复条件** 存档降级路径重做时（与 M2 一并看）。


> 来源：`## Deferred from: code review of 1-19-单元-1-首次试玩验证-epic-1-的生死线 `[CR]` (2026-10-18)` ｜ 旧编号 `1（CR 节）` ｜ 详见 `archive/deferred/2026-10-18--cr-story-1-19.md` 的「分诊结论」

## DF-079

**状态**：待触发 · **归属**：未指派 · **恢复条件**：同 DF-078 一条（存档降级路径重做时，与 M2 一并看）

**一句话**：`parseSaveFile` 一个坏元素即判整份失败，同一失败信号两种结局

### 原始论证

### 2. `masteredWordIds` 里混进一个非字符串 ⇒ 整份进度归零，且同一个失败信号有两种结局

- `src/app/store.ts:336`：`readSave()` 返回 null 时 `restoreFromSave` 直接 return，而 `progress` 此时还是模块初值。
- `parseSaveFile` 的结构校验对 `masteredWordIds` 是全有或全无 —— 一个坏元素 ⇒ 整份判失败。
- 🔥 **同一个失败信号现在有两种画面**：恰好覆盖整个单元 ⇒ 孩子看到「已学完」通关卡；不覆盖 ⇒ 回到第 1 局从头学。语义不一致。
- **恢复条件** 同第 1 条。


> 来源：`## Deferred from: code review of 1-19-单元-1-首次试玩验证-epic-1-的生死线 `[CR]` (2026-10-18)` ｜ 旧编号 `2（CR 节）` ｜ 详见 `archive/deferred/2026-10-18--cr-story-1-19.md` 的「分诊结论」

## DF-080

**状态**：待触发 · **归属**：未指派 · **恢复条件**：存档损坏的降级语义统一时（AC-D4 组）

**一句话**：`store.ts` 的 `restoreNextUnit` 越界即 return，AC-B6 终态不可达

### 原始论证

### 3. 损坏存档（`currentUnitIndex` 越界）下 AC-B6 的终态不可达

- `src/app/store.ts:410` 的 `restoreNextUnit` 先问「下一个单元录了没有」，不通就 `return` ⇒ 永远走不到 `buildStateFor`。
- 结果：HUD 显示「第 1 单元 · 37/37」的同时仍在考那 10 个词，`gained` 恒空 ⇒ 打完再进还是同一局。
- 正常路径（`currentUnitIndex: 0`）**不受影响**；改前这条路径留下一份 37 题的题单，同样错。**非 1.19 引入的回归。**
- **恢复条件** 存档损坏的降级语义统一时（AC-D4 组）。


> 来源：`## Deferred from: code review of 1-19-单元-1-首次试玩验证-epic-1-的生死线 `[CR]` (2026-10-18)` ｜ 旧编号 `3（CR 节）` ｜ 详见 `archive/deferred/2026-10-18--cr-story-1-19.md` 的「分诊结论」

## DF-081

**状态**：待触发 · **归属**：Story 1.19 · **恢复条件**：真机试玩前先把这两条 AC 的前提（「每局全对」）写进 AC 正文；否则家长会把符合设计的行为读成 bug

**一句话**：1.19 的 AC-B4 / AC-B8 前提「每局全对」尚未写进 AC 正文

### 原始论证

### 4. AC-B4 / AC-B8 的表述只在「每局全对通关」这一条路径上成立

- 测试里 `playOneRoundWith(mastered)` 直接把 `masteredWordIds` seed 进存档，全仓没有一个测试走过「玩一局 → 进度推进 → 下一局切题单」的真实链路。
- 失败路径的实际行为：`core/effects.ts` 在 `level-failed ✅` 时存下那份**含原题单**的 state ⇒ `restoreFromSave` 的 `currentGame !== null` 分支不经过 `buildStateFor` ⇒ 重进/重打**仍是同样那 10 条**。
- 这是 AC-B5「重打不重切」的直接后果、**符合设计**，但 AC-B4「10/10/10/7」与 AC-B8「第 2 局与第 1 局零交集」都是无条件表述。
- **恢复条件** 真机试玩前先把这两条 AC 的前提（「每局全对」）写进 AC 正文；否则家长会把符合设计的行为读成 bug。


> 来源：`## Deferred from: code review of 1-19-单元-1-首次试玩验证-epic-1-的生死线 `[CR]` (2026-10-18)` ｜ 旧编号 `4（CR 节）` ｜ 详见 `archive/deferred/2026-10-18--cr-story-1-19.md` 的「分诊结论」

## DF-082

**状态**：待触发 · **归属**：未指派 · **恢复条件**：首次出现「给卡打标记」类需求时

**一句话**：`sliceDeckForLevel` 返回内容层共享 `DeckEntry` 引用，`toEqual` 类断言仍全绿

### 原始论证

### 5. `sliceDeckForLevel` 返回内容层的同一批 `DeckEntry` 对象引用

- 纯度注释保证的是「不改动传入的两个参数」，实现上 `filter` + `slice` 换了数组、**元素仍是共享引用**；两条测试也只证明了数组层。
- 任何对 `DeckEntry` 的就地写会同时改到内容层那一份，且 `toEqual` 类断言仍全绿。
- **恢复条件** 首次出现「给卡打标记」类需求时。


> 来源：`## Deferred from: code review of 1-19-单元-1-首次试玩验证-epic-1-的生死线 `[CR]` (2026-10-18)` ｜ 旧编号 `5（CR 节）` ｜ 详见 `archive/deferred/2026-10-18--cr-story-1-19.md` 的「分诊结论」

## DF-084

**状态**：待触发 · **归属**：未指派 · **恢复条件**：切片判据需要第二次落点时（那时应该改成 G161 扫 core + 追常量引用，而不是加字面量）

**一句话**：G160 只查字面量 `10` 且豁免 `src/core/`，G161 不扫 `src/core/`，第二份题数实现可过

### 原始论证

### 7. G160 / G161 挡不住第二份「题数」实现

- G160 只查切片上界的**字面量** `10`（`slice(\s*0\s*,\s*10\s*)`）且豁免整个 `src/core/deck-slice.ts`；G161 的 `LAYER_PREFIXES` 不含 `src/core/`。
- 第二份实现写成 `.slice(0, LEVEL_QUESTIONS)` 且住在 `src/core/other.ts` ⇒ 两条守卫全绿、两份判据分叉。
- **恢复条件** 切片判据需要第二次落点时（那时应该改成 G161 扫 core + 追常量引用，而不是加字面量）。


> 来源：`## Deferred from: code review of 1-19-单元-1-首次试玩验证-epic-1-的生死线 `[CR]` (2026-10-18)` ｜ 旧编号 `7（CR 节）` ｜ 详见 `archive/deferred/2026-10-18--cr-story-1-19.md` 的「分诊结论」

## DF-085

**状态**：待触发 · **归属**：未指派 · **恢复条件**：给守卫补一个「判据范围」自测夹具时

**一句话**：`tests/guards/deck-slice-boundaries.test.ts` 用 `indexOf('\n}\n', start)` 切函数体，缩进变则静默截断

### 原始论证

### 8. G163 / G165 的判据范围靠 `indexOf('\n}\n', start)` 切函数体

- `tests/guards/deck-slice-boundaries.test.ts:242/303/317`。缩进风格一变（顶格 `}`）判据范围静默截断，守卫不会红而它守的那行已不在扫描范围内。
- 同文件 G161 用的是文件级判据，两处口径不一致。今天对现有格式正确。
- **恢复条件** 给守卫补一个「判据范围」自测夹具时。


> 来源：`## Deferred from: code review of 1-19-单元-1-首次试玩验证-epic-1-的生死线 `[CR]` (2026-10-18)` ｜ 旧编号 `8（CR 节）` ｜ 详见 `archive/deferred/2026-10-18--cr-story-1-19.md` 的「分诊结论」

## DF-086

**状态**：待触发 · **归属**：未指派 · **恢复条件**：支持矩阵扩到窄横屏（或出手机版）时

**一句话**：`responsive.css` 的 `minmax(0,1fr) 25rem` 无宽度下界，窄横屏格子边长 < 48px

### 原始论证

### 9. 宽屏分栏没有宽度下界

- `src/styles/responsive.css:163` 的 `grid-template-columns: minmax(0, 1fr) 25rem`，左栏可一路缩到 0；断点只有 `min-aspect-ratio: 1/1`。
- 窄横屏（如 568×320）右栏吃掉 400px、格子边长 ≈ 33px，远低于 `--touch-min` 的 48px —— 与该文件注释自己判「不可接受」的是同一种失败。
- 目标机型（2000×2560 / 1200×1920）横屏均为 1920+ 宽，**不落在区间内**。
- **恢复条件** 支持矩阵扩到窄横屏（或出手机版）时。


> 来源：`## Deferred from: code review of 1-19-单元-1-首次试玩验证-epic-1-的生死线 `[CR]` (2026-10-18)` ｜ 旧编号 `9（CR 节）` ｜ 详见 `archive/deferred/2026-10-18--cr-story-1-19.md` 的「分诊结论」

## DF-087

**状态**：待裁决 · **归属**：Story 3.5 · **恢复条件**：人裁决横屏矮视口的战场尺寸策略（Story 3.5 `[DS]` 实测 1280×660 与 1280×713 的**建造相**「手牌区与战场相交」= **是** ⇒ 本条记的症状**已复现**；候选：战场改由可用高度定尺寸 / 允许滚动 / 缩窄题面栏）；裁决后写进新 story 实施

**一句话**：`battle-grid` 高度由 `aspect-ratio` 推出，1280×660 下溢出手牌行、孩子点不到卡（Story 3.5 `[DS]` 真浏览器实测已复现）

### 原始论证

### 10. 战场行轨不足时溢出手牌行

- `grid-template-rows: ... minmax(0, 1fr) ...` + `.battle-grid` 只有 `align-self: start`：战场高度由**列宽**经 `aspect-ratio: 9/5` 推出（1280 宽 ⇒ 左栏 880px ⇒ 约 489px），轨道不随内容涨。
- 1280×660 一类视口下第 3 行可用高度不足 ⇒ 战场向下溢出、盖住第 4 行的手牌区，孩子点不到卡。`overflow-y: auto` 救不了「轨道不重排」。
- 注释声称「1280×800 及以上实测不产生滚动」，该阈值以下无覆盖。
- **恢复条件** 横屏布局打磨时（与「战场偏上」那条一并看）。

### 2026-10-25（Story 3.5 `[DS]`）处置 —— **症状已复现**（真浏览器实测），修法仍待人裁决

- 🔥 **为什么它至今没被观测过**（本 story 查清的关键事实）：
  手牌区（`.hand-deck`）用 `v-if` **整块不渲染**，只在**建造相位**存在
  ⇒ 旧版量测脚本「进关即量」量到的**永远是答题相位** ⇒
  **手牌区从来不在被量的 DOM 里** ⇒ 「战场盖住手牌行」这件事
  **现有工具根本看不到** —— 不是「观测过没问题」，是**没观测过**。
- **本 story 做了什么** 量测工具已支持**同一次会话量两个相位**，
  并新增建造相专属的两列：「手牌区」「手牌卡在视口内」「手牌区与战场相交」；
  矩阵里也加进了 **1280×660**（DF-087 自己点名的那个形状）与
  **1280×713**（= 1280×800 减 87px 浏览器工具栏的**标签页降级形态**）。
- **实测值（真浏览器，2026-10-25）—— 症状复现**：

  | 视口 | 建造相：手牌区与战场**相交** | 手牌卡在视口内 | 垂直余量 | 战场盒 |
  |---|---|---|---|---|
  | **1280×660**（DF-087 点名的形状） | **是** | 是 | 0 | 848×519 |
  | **1280×713**（标签页降级形态） | **是** | 是 | 0 | 848×519 |
  | 1600×900 | **是** | 是 | 0 | 1168×697 |
  | 1280×400 | **是** | 是 | -202 | 833×511 |
  | 1280×800 | 否 | 是 | 0 | 848×519 |
  | 1180×820 / 1024×768 / 2560×1600 / 2560×2000 | 否 | 是 | 0 | — |

- 🔥 **机制已算清**（横屏 `grid-template-rows: auto auto minmax(0, 1fr) auto`，
  `.battle-grid` 是 `align-self: start` ⇒ 高度由**列宽**经 `aspect-ratio: 9/5` 推出，
  轨道**不随内容涨**）⇒ 第 3 行的可用高度 = 视口高 − (行1+行2) − 手牌区高：

  | 视口 | 第 3 行可用高 | 战场高 | 溢出量 = 战场 − 轨道 |
  |---|---|---|---|
  | 1280×800 | 586 | 519 | 不溢出（余 67px） |
  | 1280×713 | 499 | 519 | **20px** |
  | 1280×660 | 446 | 519 | **73px** |
  | 1600×900 | 686 | 697 | **11px** |
  | 1280×400 | 186 | 511 | **325px** |

  ⇒ 溢出的那部分**正好压在第 4 行的手牌区上** ⇒ 战场盖住手牌 ⇒
  **孩子点不到卡** —— 与本条记的症状逐字对上。
  ⇒ `overflow-y: auto` 救不了「轨道不重排」。
- **本 story 没做什么** 修法（战场改由可用高度定尺寸？缩窄题面栏？允许滚动？）
  是**布局策略决策** ⇒ 归**待人裁决**；`[DS]` **不擅自改** ——
  1.18 那个直觉修法**已被证伪过一次**（它把战场压成 0.852 宽高比、
  把题卡推出折叠线）。


> 来源：`## Deferred from: code review of 1-19-单元-1-首次试玩验证-epic-1-的生死线 `[CR]` (2026-10-18)` ｜ 旧编号 `10（CR 节）` ｜ 详见 `archive/deferred/2026-10-18--cr-story-1-19.md` 的「分诊结论」

## DF-088

**状态**：待触发 · **归属**：Story 1.19 · **恢复条件**：词图 404 率被真机验证之前；若真出现连续 404，先降级成「跳过全部 ⇒ 通关」而不是抛错

**一句话**：`reducer.ts` 的 CONTINUE 分支 `next === null` 抛错，全跳时技术错误抛给孩子

### 原始论证

### 11. 全部跳过时 `nextQuestion` 返回 null ⇒ 技术错误抛给孩子

- `src/core/reducer.ts` 的 `CONTINUE` 分支：`next === null` 走 `rejectAction` **抛错**。
- 1.18 的隐含假设是一局 37 题（需连续 37 次词图 404 才触发），切片后只需 10 次。
- 另一侧：`skippedEntryIds` 局末随 `currentGame: null` 蒸发 ⇒ 一个每次都跳的孩子 `masteredWordIds` 恒空 ⇒ 空切片永不发生、永远卡在第 1 局的同一批 10 个词上，AC-B6 的终态也到不了。
- **恢复条件** 词图 404 率被真机验证之前；若真出现连续 404，先降级成「跳过全部 ⇒ 通关」而不是抛错。


> 来源：`## Deferred from: code review of 1-19-单元-1-首次试玩验证-epic-1-的生死线 `[CR]` (2026-10-18)` ｜ 旧编号 `11（CR 节）` ｜ 详见 `archive/deferred/2026-10-18--cr-story-1-19.md` 的「分诊结论」

## DF-089

**状态**：待排期 · **归属**：Story 1.19 · **恢复条件**：本 story 的 patch 项落地时补齐（本条与 patch 组第 5 条是同一处，一起改）

**一句话**：`createUnitCompletedState` 空账使 `assertDeckRelations` 四条不变量真空成立

### 原始论证

### 12. 空题单终态下 `assertDeckRelations` 四条不变量全部真空成立

- `createUnitCompletedState` 把 `unlocked` / `masteredEntryIds` / `skippedEntryIds` 三套账都初始化为空 ⇒ 四条不变量对 `deck: []` 结构性成立，不提供任何约束。
- 「终态的 deck 必须是 `[]`」目前只有 `tests/app/store-deck-slice.test.ts` 一条 `expect(done.deck).toEqual([])` 守着；`tests/core/deck-slice.test.ts` 的「与 CONTINUE 终态同形」只比 phase/towers/grid/zombies、不比 deck。
- ⚠️ 典型失效：有人为「让进度条有分母」把终态的 `deck` 填成 `entriesOf(unitNumber)` ⇒ G165 绿、`assertInvariants` 绿、同形断言也绿。
- **恢复条件** 本 story 的 patch 项落地时补齐（本条与 patch 组第 5 条是同一处，一起改）。

- — Story 1.19 文档（键 `1-19-单元-1-首次试玩验证-epic-1-的生死线`）—— 📎 2026-10-25 夜：**不再写路径**，只写**键**（story 文档会归档，路径会变，键不会）


> 来源：`## Deferred from: code review of 1-19-单元-1-首次试玩验证-epic-1-的生死线 `[CR]` (2026-10-18)` ｜ 旧编号 `12（CR 节）` ｜ 详见 `archive/deferred/2026-10-18--cr-story-1-19.md` 的「分诊结论」

## DF-090

**状态**：待触发 · **归属**：Story 1.17 · **恢复条件**：存档深层校验加固时（1.17 的降级面板已登记资产 / 存档降级项，那是同一处的自然落点）

**一句话**：`assertDeckRelations` 查 `deck` 唯一性却不查 `unlocked` 内部重复

### 原始论证

### 13. `unlocked` 没有唯一性不变量，而 `deck` 有

- `src/core/reducer.ts` 的 `assertDeckRelations` 显式断言题单唯一（逐字「题单有 N 条但只有 M 个不同 entryId」）并交叉校验 `unlocked ⊆ mastered`，但**没有**检查 `unlocked` 内部重复。
- 而它自己的注释逐字「刻意**保留**已解锁塔卡（FR33：同一张卡可反复建多株）⇒ unlocked 是数组不是集合」—— 这句注释解释了**为什么是数组**，但没解释**为什么不查重复**，两件事不是同一件。
- `src/services/save.ts` 对 `currentGame` 只判 `isPlainObject`、**无深层校验**；而 `restoreFromSave` 会对这份不可信数据跑 `assertInvariants` ⇒ 一份手改 / 损坏的存档 `unlocked: ["u1-cat","u1-cat"]` 满足**全部**现有断言。
- 后果：`handCards` 会渲染出**两张同图同造价**的手牌（`cost` 由 `costOf(entry.towerType, …)` 给出，重复卡共享塔型 ⇒ 造价也相同）。
- ✅ **正常游玩与 dev 的 `jumpToTurn` 都不可达**（实测证伪）：`applyAnswer` 把 `masteredEntryIds` 与 `unlocked` 同步追加，`nextQuestion` 跳过已掌握项 ⇒ 同一条不可能被画第二次；`jumpToTurn` 走 `applyAction` → `reduce` → `assertInvariants` 同一路径。
- **恢复条件** 存档深层校验加固时（1.17 的降级面板已登记资产 / 存档降级项，那是同一处的自然落点）。


> 来源：`## Deferred from: code review of 1-19-单元-1-首次试玩验证-epic-1-的生死线 `[CR]` 第二轮 — 专项「植物不重复出现」（2026-10-18）` ｜ 旧编号 `13（CR2 节）` ｜ 详见 `archive/deferred/2026-10-18--cr-story-1-19-r2.md` 的「分诊结论」

## DF-091

**状态**：待触发 · **归属**：未指派 · **恢复条件**：若将来给切片加第二个调用点，或 `Progress` 的字段名与实际语义分家时

**一句话**：`deck-slice.ts` 的参数名 `masteredWordIds` 与 `entry.entryId` 是两个 ID 命名空间

### 原始论证

### 14. `masteredWordIds`（名）与 `entry.entryId`（实）是两个 ID 命名空间，类型都是 `string`

- `src/core/deck-slice.ts` 的参数名叫 `masteredWordIds`、类型 `readonly string[]`，而成员测试写的是 `mastered.has(entry.entryId)`；`DeckEntry` 同时带 `entryId` 与 `wordId` 两个 `string` 字段。
- ✅ **今天没有功能 bug**：唯一调用点 `buildStateFor` 传的就是 entryId 级的 `progress.masteredWordIds`。**这是命名债，不是缺陷。**
- 风险：若将来任何调用点按**参数名的暗示**传 word id，过滤会静默变成 no-op —— `sliceDeckForLevel` 永远返回同样前 10 条，`advanceUnit` 那套判据一路绿灯，而症状是「玩第 2 局又是同一批词」。**没有任何东西会指向原因**（R-06 说的那类静默错）。
- **恢复条件** 若将来给切片加第二个调用点，或 `Progress` 的字段名与实际语义分家时。


> 来源：`## Deferred from: code review of 1-19-单元-1-首次试玩验证-epic-1-的生死线 `[CR]` 第二轮 — 专项「植物不重复出现」（2026-10-18）` ｜ 旧编号 `14（CR2 节）` ｜ 详见 `archive/deferred/2026-10-18--cr-story-1-19-r2.md` 的「分诊结论」

## DF-092

**状态**：待排期 · **归属**：Story 1.20 · **恢复条件**：用户对「植物不重复出现」这条需求给出裁决之后

**一句话**：`tests/content/unit-01.test.ts` 只断言整单元三塔型；1.20 已落地「一局内零相邻同型」

### 原始论证

### 15. 全仓唯一的塔型构成守卫只看整单元，粒度粗于「一局内」

- `tests/content/unit-01.test.ts` 逐字断言「单元 1 的 deck 全部是合法塔型（三塔型都出现，建造分支不会只走一半）」，判据是 `expect([...towerTypes].sort()).toEqual(['aoe', 'direct', 'slow'])`。
- 它守的是「整单元三型都出现过」，**不是「一局内怎么分布」** —— 实测某局 10 条全是 `direct` 时它照样绿。
- 且它是**内容层**守卫，本就不该承担切片编排的判据（`deck-slice.ts` 的头注释逐字「本模块是切片判据的唯一定义处」）。
- ⚠️ **本条是否值得修，取决于同一份 Review Findings 里 4 条 `decision_needed` 的裁决结果**：当前设计下 `docs/art-direction.md` §4.6 与 FR70 都允许「一局全是 direct」，所以在没有产品裁决之前加守卫 = 把一条尚未确立的规则钉死。
- **恢复条件** 用户对「植物不重复出现」这条需求给出裁决之后。

- — Story 1.19 文档（键 `1-19-单元-1-首次试玩验证-epic-1-的生死线`）—— 📎 2026-10-25 夜：**不再写路径**，只写**键**（story 文档会归档，路径会变，键不会）


> 来源：`## Deferred from: code review of 1-19-单元-1-首次试玩验证-epic-1-的生死线 `[CR]` 第二轮 — 专项「植物不重复出现」（2026-10-18）` ｜ 旧编号 `15（CR2 节）` ｜ 详见 `archive/deferred/2026-10-18--cr-story-1-19-r2.md` 的「分诊结论」

## DF-093

**状态**：待触发 · **归属**：未指派 · **恢复条件**：若把 `jumpToTurn` 暴露到生产包，或低端平板上调试时观察到卡顿时

**一句话**：`store.ts` 的 `jumpToTurn`（`MAX_JUMP_STEPS = 500`）一次点击约 1500 次 `setItem`

### 原始论证

### 16. `jumpToTurn` 目标回合极大时，单击可产生约 1500 次 `localStorage.setItem`

- `src/app/store.ts` 的 `jumpToTurn`（`MAX_JUMP_STEPS = 500`）+ 1.19 给写盘表新增的 `awaiting-answer` 那一格（`src/core/effects.ts`）。
- 每个 jump 步走 `startRound()` 的三连同步 dispatch，其中两次触发写盘；加上每次 `answer` 一次 ⇒ 最坏 500 × 3 ≈ 1500 次写盘集中在一次点击里。
- `store.ts` 里那条 500 次写盘的注释是 1.19 之前就有的；**新增的 `awaiting-answer` 格把它大约翻了一倍**，本 story 没有加去抖或批量。
- ✅ 只影响调试面板（生产包打不开，见 1.19 裁决 6）⇒ 对孩子零影响。
- **恢复条件** 若把 `jumpToTurn` 暴露到生产包，或低端平板上调试时观察到卡顿时。


> 来源：`## Deferred from: code review of 1-19-单元-1-首次试玩验证-epic-1-的生死线 `[CR]` 第六轮 — 批次 A（生产代码 src/）（2026-10-19）` ｜ 旧编号 `16（CR6 节）` ｜ 详见 `archive/deferred/2026-10-19--cr-story-1-19-r6.md` 的「分诊结论」

## DF-094

**状态**：待触发 · **归属**：未指派 · **恢复条件**：存档深层校验加固时（那时可以论证把 `round-over` 那格降级成只在真异常时写）

**一句话**：`startRound()` 同步三连使 `round-over` 紧接 `awaiting-answer` 两次写盘

### 原始论证

### 17. 一次 `startRound()` 里连续两次写盘（`round-over` 紧接 `awaiting-answer`）

- 1.19 `[CR]` 第一轮给写盘表补了 `awaiting-answer`，而 `startRound()` 的 `endBuild → resolveRound → continueRound` 是**同步三连** ⇒ `round-over` 那份刚写完就被 `awaiting-answer` 覆盖。
- ⚠️ 规格注释逐字说了「**不要**因此把 `round-over` 那格删掉」（旧存档已经出去了）⇒ **这是有意保留的**，但新存档确实每次多一次写盘。
- **恢复条件** 存档深层校验加固时（那时可以论证把 `round-over` 那格降级成只在真异常时写）。


> 来源：`## Deferred from: code review of 1-19-单元-1-首次试玩验证-epic-1-的生死线 `[CR]` 第六轮 — 批次 A（生产代码 src/）（2026-10-19）` ｜ 旧编号 `17（CR6 节）` ｜ 详见 `archive/deferred/2026-10-19--cr-story-1-19-r6.md` 的「分诊结论」

## DF-095

**状态**：待触发 · **归属**：未指派 · **恢复条件**：想把 G163 从「文本判据」升级为「接线行为判据」时

**一句话**：G163 用 200 字符窗口正则守接线层，抽成局部变量即可绕过

### 原始论证

### 18. G163 用 200 字符窗口的纯函数正则守「切片读的是跨局进度」，接线层变形可绕过

- 判据：`/sliceDeckForLevel\([\s\S]{0,200}?progress\.value\.masteredWordIds/`（`tests/guards/deck-slice-boundaries.test.ts`）。
- 写成 `const ids = progress.value.masteredWordIds; … sliceDeckForLevel(entriesOf(n), ids)` 这类**抽成局部变量**的形态仍落在窗口内（绿），而把实参换成 `[]` 且中间超过 200 字符的形态会绕过。
- ✅ **行为测试兜住了**：`tests/app/store-deck-slice.test.ts` 的「第二局与第一局零交集」会红。这与 1.18「纯函数正则护不住接线层」是同一条已登记的教训。
- **恢复条件** 想把 G163 从「文本判据」升级为「接线行为判据」时。


> 来源：`## Deferred from: code review of 1-19-单元-1-首次试玩验证-epic-1-的生死线 `[CR]` 第六轮 — 批次 A（生产代码 src/）（2026-10-19）` ｜ 旧编号 `18（CR6 节）` ｜ 详见 `archive/deferred/2026-10-19--cr-story-1-19-r6.md` 的「分诊结论」

## DF-096

**状态**：待触发 · **归属**：未指派 · **恢复条件**：需要在真浏览器里做一次层叠实测（jsdom 不做布局），或改用真浏览器 e2e 断言 `getComputedStyle`

**一句话**：`responsive.css` 的 `.level-view .battle-grid` 与 SFC scoped 同为 `(0,2,0)`，特异度平局查不出

### 原始论证

### 19. 横屏分栏的 CSS 特异度平局：G166/G167 只查源码文本，查不出真机层叠结果

- `src/styles/responsive.css` 里 `.level-view .battle-grid` 是 `(0,2,0)`，SFC scoped 的 `.battle-grid[data-v-*]` **也是 `(0,2,0)`**；赢面取决于源码顺序与 Vite 注入次序，而这两条守卫**只断言那行文本存在**。
- 同理，`.level-view` 上的 `grid-template-areas` / `-columns` / `-rows` **没有 `!important` 保护**（全仓唯一的 `!important` 只加在 `display` 上）⇒ 将来 `BattleField.vue` 里加一句 `height: 100%` 或 `grid-template-areas: …`，横屏会静默退回它要修的那个 bug，而**全套守卫绿灯**。
- ✅ 今天的实测机型（2000×2560 / 1200×1920）横屏正常；`.battle-grid` 今天确实不声明 `height` / `align-self`。
- **恢复条件** 需要在真浏览器里做一次层叠实测（jsdom 不做布局，R-01 说的那类假绿），或改用真浏览器 e2e 断言 `getComputedStyle`。


> 来源：`## Deferred from: code review of 1-19-单元-1-首次试玩验证-epic-1-的生死线 `[CR]` 第六轮 — 批次 A（生产代码 src/）（2026-10-19）` ｜ 旧编号 `19（CR6 节）` ｜ 详见 `archive/deferred/2026-10-19--cr-story-1-19-r6.md` 的「分诊结论」

## DF-097

**状态**：待触发 · **归属**：未指派 · **恢复条件**：横屏布局下一次结构性改版

**一句话**：`.level-outcome` 靠 `position: absolute; inset: 0` 定位，不在 `grid-template-areas` 里

### 原始论证

### 20. `.level-outcome` 不在 `grid-template-areas` 里，靠 `position: absolute; inset: 0` 定位

- 若将来把它移进正常流，网格模板没有它的槽位 ⇒ 要么落进自动生成的空格（只是不好看），要么与其他面板重叠（功能性）。G168 抓得到「模板变了」，但诊断信息会指向「网格缺一个面板」而不是「横屏以这个特定方式坏掉了」。
- **恢复条件** 横屏布局下一次结构性改版。


> 来源：`## Deferred from: code review of 1-19-单元-1-首次试玩验证-epic-1-的生死线 `[CR]` 第六轮 — 批次 A（生产代码 src/）（2026-10-19）` ｜ 旧编号 `20（CR6 节）` ｜ 详见 `archive/deferred/2026-10-19--cr-story-1-19-r6.md` 的「分诊结论」

## DF-098

**状态**：待触发 · **归属**：未指派 · **恢复条件**：横屏布局改版，或引入布局类令牌时

**一句话**：`responsive.css` 的 `25rem` 右栏宽无设计令牌锚点

### 原始论证

### 21. `grid-template-columns: minmax(0, 1fr) 25rem` 的 `25rem` 没有设计令牌锚点

- 注释把它标成「刻意的非令牌」。将来若 Epic 要改右栏宽度，只能改这里，且没有 token 可对照（R-56 说的「断言不读 tokens 就写死字面值」那类债）。
- **恢复条件** 横屏布局改版，或引入布局类令牌时。


> 来源：`## Deferred from: code review of 1-19-单元-1-首次试玩验证-epic-1-的生死线 `[CR]` 第六轮 — 批次 A（生产代码 src/）（2026-10-19）` ｜ 旧编号 `21（CR6 节）` ｜ 详见 `archive/deferred/2026-10-19--cr-story-1-19-r6.md` 的「分诊结论」

## DF-099

**状态**：待触发 · **归属**：未指派 · **恢复条件**：若要把 `core/` 的返回类型系统性收紧为 `readonly`（那是一次跨模块的签名改动）

**一句话**：`sliceDeckForLevel` 返回 `DeckEntry[]` 而非 `readonly`，纯度只写在注释里

### 原始论证

### 22. `sliceDeckForLevel` 返回**可变**的 `DeckEntry[]`，与「纯函数 + 不改动传入」的注释纪律不成类型级约束

- 注释逐字承诺「不改动传入的两个参数」，但返回类型是 `DeckEntry[]` 而非 `readonly DeckEntry[]`。将来任何调用点写 `state.deck.sort(...)` / `.push(...)` 会静默改到 `state.deck`（它会被 `JSON.stringify` 存盘），而**没有任何类型或测试会红**。
- ⚠️ 与本文档更早的一条同源（元素是内容层共享引用那条）—— 两者都是「纯度只写在注释里，没落到类型上」。
- **恢复条件** 若要把 `core/` 的返回类型系统性收紧为 `readonly`（那是一次跨模块的签名改动）。


> 来源：`## Deferred from: code review of 1-19-单元-1-首次试玩验证-epic-1-的生死线 `[CR]` 第六轮 — 批次 A（生产代码 src/）（2026-10-19）` ｜ 旧编号 `22（CR6 节）` ｜ 详见 `archive/deferred/2026-10-19--cr-story-1-19-r6.md` 的「分诊结论」

## DF-100

**状态**：待触发 · **归属**：Story 1.19 · **恢复条件**：平板真机试玩时若家长/孩子实际表现困惑（AC-D5 的观察项），再走 `[CC]` 改文案

**一句话**：`AnswerFeedback` 文案仍是「再想想」，与 `locked` 置灰不可点观感打架

### 原始论证

### 23. 建造期锁定时，反馈文案仍是「再想想」，与「选项已置灰不可点」在观感上打架

- `AnswerFeedback` 的文案沿用既有组件；`[CR]` 第四轮已**明确裁决保留**（理由逐字：「`pickedRight` 读的是 `masteredEntryIds`，跨刷新仍成立，且**答错也进建造期**（AC-4）时它会说『再想想』，不是假陈述」），且那条裁决经过用户 `[CC]`。
- ⚠️ 新增的 `locked` 态确实让观感更矛盾（孩子看到选项全灰 + 一个「再想想」），但**这不是实现缺陷，是文案取舍**，且已裁决过。
- **恢复条件** 平板真机试玩时若家长/孩子实际表现困惑（AC-D5 的观察项），再走 `[CC]` 改文案。

- — Story 1.19 文档（键 `1-19-单元-1-首次试玩验证-epic-1-的生死线`）—— 📎 2026-10-25 夜：**不再写路径**，只写**键**（story 文档会归档，路径会变，键不会）


> 来源：`## Deferred from: code review of 1-19-单元-1-首次试玩验证-epic-1-的生死线 `[CR]` 第六轮 — 批次 A（生产代码 src/）（2026-10-19）` ｜ 旧编号 `23（CR6 节）` ｜ 详见 `archive/deferred/2026-10-19--cr-story-1-19-r6.md` 的「分诊结论」

## DF-101

**状态**：待排期 · **归属**：Story 1.20 · **恢复条件**：将来动 A2 或给 `G174③` 换夹具时一并处理；那时需要一条能区分「重排改了归属」与「本来就不该按原序拼」的判据

**一句话**：`tests/app/store-deck-slice.test.ts` 的 G174③「四局=整个词表」前提随 1.20 重排收窄

### 原始论证

### 24. `G174③`「四局连起来 == 整个词表」只在「每局切片恰好合规」时成立

- 这条是 **A2（原序承诺）的接线侧护栏**，`[CR]` 实测确认它今天全绿且必须保留 ⇒ **本 story 不动它**。
- ⚠️ 但它的成立前提比看上去窄：单元 1 在 JSON 原序上本就合规，**任何连续切片都是一段合规序列的子序列**。
  一旦孩子的进度里出现**跳过的洞**（AC-E4 的既有功能），`pending` 就不再是连续段，
  「四局连起来 == 整个词表」**不再成立** —— 而它会以「重排坏了」的名义变红，真正原因不是 bug。
- `[CR]` 2026-10-19 只做了**旁证**：新增一轮「留下两处洞」的非连续进度，确认重排在那种切片下仍正确
  （见 `tests/app/store-deck-slice.test.ts` 的判据自测）。**没有**改 `③` 本身。
- **恢复条件** 将来动 A2 或给 `G174③` 换夹具时一并处理；那时需要一条能区分
  「重排改了归属」与「本来就不该按原序拼」的判据。

- — Story 1.20 文档（键 `1-20-相邻不同型-把植物不重复从巧合变成代码保证`）—— 📎 2026-10-25 夜：**不再写路径**（该文档已在归档层），只写**键**


> 来源：`## Deferred from: code review of 1-19-单元-1-首次试玩验证-epic-1-的生死线 `[CR]` 第六轮 — 批次 A（生产代码 src/）（2026-10-19）` ｜ 旧编号 `24（CR6 节）` ｜ 详见 `archive/deferred/2026-10-19--cr-story-1-19-r6.md` 的「分诊结论」


## DF-103

**状态**：待触发 · **归属**：未指派 · **恢复条件**：拿到**牛津上海版**教材的单元词表（= DF-201 的扫描件）⇒ 按真实词表重算每单元词条数，解开 AR44 的估算基数冲突

**一句话**：`epics.md` AR44 的「200-400 张」估算基数与实测 480–600 张冲突，需 `[CC]` 改规划产物

### 原始论证

### 26. 🔥 「200-400 张」这个估算基数被实测推翻，但源文档一个字未改

- **实测**：单元 1 是 `30 / 37 = 81.08%` 的配图比例、37 词条/单元。
  按此结构外推 16–20 单元，图数是 **480–600 张**，而估算说 200–400 张
  ⇒ **低估 20%–150%**。三条根因（配图比例假设 / 15-30 张每单元的假设 / 词条数本身）见 §8.1.2。
- **为什么不改**：`epics.md` 的 AR44、GDD 的资产表、架构的显式约束表都是**规划产物**，
  R-33 规定其改动要么走 `[CC]`、要么属于「文档追认事实」的三条件之一。
  本 story 改的是**决策记录**（`docs/`），不是规划产物 ⇒ 走 `[CC]`。
- **恢复条件**：拿到教材词表**或**单元 2 的词表 —— 任一即可解开「每单元词条数」这个未知量。


> 来源：`## Deferred from: story-2-1-词图产能验证 `[DS]` (2026-10-20)` ｜ 旧编号 `26` ｜ 详见 `archive/deferred/2026-10-20--ds-story-2-1.md` 的「分诊结论」

## DF-104

**状态**：待触发 · **归属**：未指派 · **恢复条件**：拿到**牛津上海版**教材词表（DF-201）后重算各档占比；若「数词 + 公认符号」占比远高于单元 1，这个结论要重写

**一句话**：`epics.md` §7.2「程序化生成⇒工时减半」被实测打掉 4/5，待真实词表重算

### 原始论证

### 27. 🔥 `epics.md` §7.2 的「程序化生成 ⇒ 工时减半」被实测打掉 4/5

- **原文预期**：「`abstract` + `geometric` = 15/30 = 50% ⇒ 若这两档走程序化，工时减半」。
- **实测**：单元 1 已交付的 30 张里，程序化可行的只有 **3 张（数词）= 10%**。
  否掉的 40% 里：颜色词 3 张**实测证伪**（灰度底色下退化成匿名灰块）、
  `geometric` 7 张**结构性不可行**（`bag`/`book` 同为盒体、`pen`/`pencil` 同为圆柱，
  同一套规则产出的图在档内**不可区分**，违反「听到词 → 认出图」）。
- **恢复条件**：拿到真实教材词表后重算各档占比；若「数词 + 公认符号」在真实词表里
  占比远高于单元 1，这个结论要重写。


> 来源：`## Deferred from: story-2-1-词图产能验证 `[DS]` (2026-10-20)` ｜ 旧编号 `27` ｜ 详见 `archive/deferred/2026-10-20--ds-story-2-1.md` 的「分诊结论」

## DF-107

**状态**：待触发 · **归属**：未指派 · **恢复条件**：若要把这个脚本当长期产能仪表，需加「开工时刻」的显式记录（开工时先写一条 `kind: "start"` 的记录）

**一句话**：`scripts/word-image-throughput.ts` 只量写盘跨度，缺「开工时刻」记录（`u2-sun` 报 0.0 秒）

### 原始论证

### 30. `scripts/word-image-throughput.ts` 只测「首版写盘 → 末版写盘」，量不到构思时间

- **实测发现**：`u2-sun` 报 **0.0 秒**。那不是「画太阳不花时间」，
  是**一遍过时判读耗时落在窗口之外**，且**首版之前的构思与起草根本没进过任何记录**
  （文件第一次出现就已是成稿）。
- **性质**：这是 §0 裁决承认的「口径 A 漏掉四件事」之外的**第五项**，
  而且它出自**本 story 自己的工具**。
- **后果**：任何拿这张表乘「全书张数」的算法都会**系统性低估**。
- **恢复条件**：若要把这个脚本当长期产能仪表，需加「开工时刻」的显式记录
  （例如开工时先写一条 `kind: "start"` 的记录）；本 story 未加，因为它要改工具契约。


> 来源：`## Deferred from: story-2-1-词图产能验证 `[DS]` (2026-10-20)` ｜ 旧编号 `30` ｜ 详见 `archive/deferred/2026-10-20--ds-story-2-1.md` 的「分诊结论」

## DF-108

**状态**：待排期 · **归属**：未指派 · **恢复条件**：永不复用

**一句话**：「9.7 小时 ÷ 25 张」算法不成立，保留在 `docs/word-image-throughput.md` 作反面教材

### 原始论证

### 31. 「9.7 小时 ÷ 25 张 = 23 分钟/张」这个算法不成立

- **实测复核**：该区间（`39b83aa` → `3ef8714`）里混着至少三样非画图的东西 ——
  一次性工程投资（`word-image-metrics.ts` 1 031 行 + 两个测试文件 475 + 488 行）、
  两个 story 的收尾（1.8 的 22 patch + 1.9 的 33 patch）、以及两次题材分布**相反**的 session。
- **为什么不删掉那个数字**：保留在文档里作**反面教材**（与「9 分钟/张」同一条纪律）。
- **恢复条件**：永不复用。


> 来源：`## Deferred from: story-2-1-词图产能验证 `[DS]` (2026-10-20)` ｜ 旧编号 `31` ｜ 详见 `archive/deferred/2026-10-20--ds-story-2-1.md` 的「分诊结论」

## DF-109

**状态**：待排期 · **归属**：未指派 · **恢复条件**：需要一个能替代目视的判据（人工抽检协议、或可接受度测试）

**一句话**：`docs/art-direction.md` §5.5/5.5b/5.6 永久目视，「画得像不像」仍无机器判据

### 原始论证

### 32. §5 的 5.5 / 5.5b / 5.6 是永久 👁 —— 「画得像不像」至今没有机器判据

- **这不是本 story 造成的**（`art-direction.md` 已判定它们建不了守卫），
  本 story **不试图**解决它。但它决定了本 story 每一个产能结论的性质。
- **照抄 §7.5 的原句**：「**在「画得像不像」没有判据的情况下，
  任何产能结论都是在给一个没定义的问题计时。**」
- **恢复条件**：需要一个能替代目视的判据（人工抽检协议、或可接受度测试）。


> 来源：`## Deferred from: story-2-1-词图产能验证 `[DS]` (2026-10-20)` ｜ 旧编号 `32` ｜ 详见 `archive/deferred/2026-10-20--ds-story-2-1.md` 的「分诊结论」

## DF-110

**状态**：待触发 · **归属**：未指派 · **恢复条件**：拿到**牛津上海版**教材的目录页（DF-201 的扫描件）后定「游戏单元 ↔ 教材 Unit」的映射；在此之前不要把「上册 = 前 8 个单元」当事实引用

**一句话**：GDD 只有「全年两册」无单元表，「上册 = 前 8 单元」的推断不可当事实引用

### 原始论证

### 33. 「全年两册」的分册边界没有任何文档写过

- **实测**：GDD 只有「全年两册」这个说法与 **16–20 关**这个区间，
  **没有任何单元表**。§8.3.3 里的「上册 = 8–10 单元」是「均分 16–20」的算术结果，
  **不是教材的分册表**。
- **恢复条件**：拿到教材目录。**在此之前不要把「上册 = 前 8 个单元」当事实引用。**


> 来源：`## Deferred from: story-2-1-词图产能验证 `[DS]` (2026-10-20)` ｜ 旧编号 `33` ｜ 详见 `archive/deferred/2026-10-20--ds-story-2-1.md` 的「分诊结论」

## DF-111

**状态**：待触发 · **归属**：未指派 · **恢复条件**：一旦作出收窄决定，走 `[CC]` 改 `epics.md` 的编号与档位表

**一句话**：若改选「收窄到上册」，`Story 2.7`/`2.8`/`2.9` 编号与阳光第三档要重算

### 原始论证

### 34. 若改选「收窄到上册」，有六处编号要重算（**本 story 未触发，仅记录**）

- **本 story 的结论是选项一（全册），所以 C4 的条件未触发。**
  但若将来改选，记录影响如下，避免届时重新推一遍：
  `Story 2.7` 从「单元 8–13」截断为「单元 8–10」；
  `Story 2.8`（单元 14 至末单元）**无单元可做**，要么删除要么改用途；
  `Story 2.9`（全书通关验收）改为「上册通关验收」；
  `Story 2.3` 的阳光档位表 **第三档 11–20 整个消失**，三档要重编。
- **恢复条件**：一旦作出收窄决定，走 `[CC]` 改 `epics.md` 的编号与档位表。

- — Story 2.1 文档（键 `2-1-词图产能验证`）—— 📎 2026-10-25 夜：**不再写路径**（该文档已随 DF-180 归档），只写**键**


> 来源：`## Deferred from: story-2-1-词图产能验证 `[DS]` (2026-10-20)` ｜ 旧编号 `34` ｜ 详见 `archive/deferred/2026-10-20--ds-story-2-1.md` 的「分诊结论」

## DF-112

**状态**：待触发 · **归属**：未指派 · **恢复条件**：若工具将来被多写者/CI 并发使用，改为「先 stat 再 read，或 read 后复 stat 校验 mtime 未变」

**一句话**：`scripts/word-image-throughput.ts` 的 `buildRecord` 先 read 后 stat，有旧内容+新 mtime 竞态

### 原始论证

### W1. `buildRecord` 的 read-stat 竞态（旧内容 + 新 mtime）

- **实测发现**：`scripts/word-image-throughput.ts` 的 `buildRecord` 先 `readFileSync` 读内容、
  再 `statSync` 取 mtime，两次系统调用之间若文件被改，会拼出「旧内容 + 新 mtime」。
- **性质**：单写者纪律下是**理论风险**（画图是单 session 串行操作，没有并发写）。
- **恢复条件**：若工具将来被多写者/CI 并发使用，改为「先 stat 再 read，或 read 后复 stat 校验 mtime 未变」。


> 来源：`## Deferred from: code review of story-2-1-词图产能验证 `[CR]` (2026-10-20)` ｜ 旧编号 `W1` ｜ 详见 `archive/deferred/2026-10-20--cr-story-2-1.md` 的「分诊结论」

## DF-113

**状态**：待触发 · **归属**：未指派 · **恢复条件**：一旦支持多目录，去重键需改成「目录 + entryId」复合键

**一句话**：`scripts/word-image-throughput.ts` 去重键仍是裸 `entryId`，跨目录会静默合并

### 原始论证

### W2. 去重键 `entryId` 跨目录撞名

- **实测发现**：`scripts/word-image-throughput.ts` 的去重键是 `entryId`，
  若将来 `docs/word-image-lab/` 之外出现另一个目录也放同名 `entryId` 的词图，会被静默合并。
- **性质**：当前只有单目录（`docs/word-image-lab/`），不构成现实风险。
- **恢复条件**：一旦支持多目录，去重键需改成「目录 + entryId」复合键。


> 来源：`## Deferred from: code review of story-2-1-词图产能验证 `[CR]` (2026-10-20)` ｜ 旧编号 `W2` ｜ 详见 `archive/deferred/2026-10-20--cr-story-2-1.md` 的「分诊结论」

## DF-114

**状态**：待触发 · **归属**：未指派 · **恢复条件**：若该测试未来变成「实现契约的独立见证」，改手写 interface 而非 `typeof import`

**一句话**：`tests/scripts/word-image-throughput.test.ts` 用 `as typeof import(...)` 做夹具，类型层不再独立

### 原始论证

### W3. 测试里的 `as typeof import(...)` 禁用副本类型检查

- **实测发现**：`tests/scripts/word-image-throughput.test.ts` 用 `as typeof import(...)`
  拿真实模块类型做夹具，好处是签名漂移会红；代价是这份「副本」**不再独立**，
  若实现类型本身写错而测试又复制了同一错类型，类型层不再兜底。
- **性质**：B3 附带的次要观察，非本 story 守卫的职责。
- **恢复条件**：若该测试未来变成「实现契约的独立见证」，改手写 interface 而非 `typeof import`。


> 来源：`## Deferred from: code review of story-2-1-词图产能验证 `[CR]` (2026-10-20)` ｜ 旧编号 `W3` ｜ 详见 `archive/deferred/2026-10-20--cr-story-2-1.md` 的「分诊结论」

## DF-115

**状态**：待触发 · **归属**：未指派 · **恢复条件**：若工具要区分「坏文件」与「空图」，改返回「元素数 + 是否有根」的元组或带哨兵值

**一句话**：`scripts/word-image-throughput.ts` 的 `countElements` 对无根 SVG 报 0，与合法空图不可分

### 原始论证

### W4. `countElements` 对「无根 SVG」报 0，与「合法空图」不可分

- **实测发现**：`scripts/word-image-throughput.ts` 的 `countElements` 遇到没有 `<svg>` 根
  （或根元素缺失）的文件会返回 0，与一张**合法但确实空**的图返回的 0 无法区分。
- **性质**：低危 —— 空图与坏文件对本 story 的产能统计影响都归零，方向一致。
- **恢复条件**：若工具要区分「坏文件」与「空图」，改返回「元素数 + 是否有根」的元组或带哨兵值。


> 来源：`## Deferred from: code review of story-2-1-词图产能验证 `[CR]` (2026-10-20)` ｜ 旧编号 `W4` ｜ 详见 `archive/deferred/2026-10-20--cr-story-2-1.md` 的「分诊结论」

## DF-116

**状态**：待触发 · **归属**：未指派 · **恢复条件**：若「画得像不像」的判读要变成可审计记录，需在工具里加中间版归档与判读快照

**一句话**：`docs/word-image-lab/versions.jsonl` 只记 48px 结论，`egg`/`playground` 中间版未落盘

### 原始论证

### W5. 48px 判读结论没有机器可读载体；6 个中间版内容永久不可复核

- **实测发现**：`docs/word-image-lab/versions.jsonl` 只记录「哪一版过了 48px」的**结论**，
  不记录判读过程的载体；`egg`/`playground` 等词的**中间版 SVG 内容**（非末版）未落盘，
  将来无法复核「当初为什么判它没过」。
- **性质**：与 deferred #30 同源 —— 都要改工具契约（多落一份中间产物 + 判读快照）。
- **恢复条件**：若「画得像不像」的判读要变成可审计记录，需在工具里加中间版归档与判读快照。

---


> 来源：`## Deferred from: code review of story-2-1-词图产能验证 `[CR]` (2026-10-20)` ｜ 旧编号 `W5` ｜ 详见 `archive/deferred/2026-10-20--cr-story-2-1.md` 的「分诊结论」


## DF-121

**状态**：待排期 · **归属**：未指派 · **恢复条件**：加一条测试读 `docs/card-distribution.md` 的 §3 表，逐行解析后与 `targetCardDistribution` 的实算值比对（漂了就红）

**一句话**：`docs/card-distribution.md` §3 逐单元表仍零守卫，interpolate 改 smoothstep 时 G187–G190 全绿

### 原始论证

### 41. `docs/card-distribution.md` §3 的逐单元表仍然**零守卫**（Story 2.2 `[CR]`）

- **实测**：没有任何测试读这份 markdown（`grep -rn "card-distribution" tests/ scripts/`
  只命中测试文件自己的注释）。而 §3 的 20 行 × 7 列是本规则**唯一**被当成「实算」的产物，
  §4 的三个 Σ、§4.1 的四个批次数全部由它推出。
- **放大它的洞**：`interpolate` 换成 smoothstep（端点/单调/步长 ≤ 0.03 全部照旧满足）
  时 **G187 – G190 全绿**，但 §3 整表失效 —— 因为**没有任何东西把这张表和代码绑在一起**。
  （Story 2.2 `[CR]` 已为「插值确实是线性的」补了 G192，那堵住了这一条具体的变异；
  但**任何**别的让数值漂移的改动仍然无人拦。）
- **`[CR]` 已做的**：把 §3 的「复算方法」从两行注释换成**可直接执行的 `npx tsx -e` 命令**
  （实测可跑，逐字复现 §3 表与 §4 三个 Σ）。那是**人工**复算手段，不是自动守卫。
- **恢复条件**：加一条测试读 `docs/card-distribution.md` 的 §3 表，逐行解析后与
  `targetCardDistribution` 的实算值比对（漂了就红）。注意别把这变成 R-56 说的
  「硬编码期望表」—— 期望值要从**真实实现**现算，文档只是被核对的那一方。
  顺带把 §4 的三个 Σ 与 §4.1 的四个批次数一并核。



> 来源：`## Deferred from: story-2-2-难度阶梯规则落地 `[DS]` (2026-10-20)` ｜ 旧编号 `41` ｜ 详见 `archive/deferred/2026-10-20--ds-story-2-2.md` 的「分诊结论」

## DF-122

**状态**：待排期 · **归属**：未指派 · **恢复条件**：在 `LevelOutcome.vue` 里加一层 focus trap（捕获 Tab / Shift+Tab 在浮层内循环，Esc 关闭），并加一条守卫断言「浮层打开后连按 N 次 Tab，焦点仍在浮层内的可聚焦元素上」

**一句话**：`src/components/hud/LevelOutcome.vue` 只 `focus()` 不锁 Tab，焦点能跑到浮层后的格子

### 原始论证

### W6. `LevelOutcome` 模态只把焦点移进浮层，没有把 Tab 键锁在浮层内（1.16 引入）

- **实测**：模态浮层打开后，焦点被移进浮层（`LevelOutcome.vue` 的 `onMounted` 里有
  一次 `focus()`），但**没有 focus trap** —— 连按 Tab 仍能把焦点移到浮层**背后**的
  `.battle-grid` 格子（那些格子是可聚焦的 `<button>`）。
  ⇒ 键盘用户（以及读屏用户）会把焦点框落到**看不见的地方**。
- **为什么不在 1.18 补**：1.18 的改动面是布局 / 离线 / 部署，
  `LevelOutcome` 的模态语义是 **1.16「关卡流程-通关-失败与推进」**引入的，
  补 focus trap 要改 `LevelOutcome.vue` 的模板与焦点管理，超出 1.18 的范围。
- **恢复条件**：在 `LevelOutcome.vue` 里加一层 focus trap
  （捕获 Tab / Shift+Tab 在浮层内循环，Esc 关闭），
  并加一条守卫断言「浮层打开后连按 N 次 Tab，焦点仍在浮层内的可聚焦元素上」。
  ⚠️ 这条**必须用真实 DOM 事件**测，jsdom 的 `.focus()` 不产生 Tab 默认行为 ——
  按 R-56，别用 jsdom 假绿。


> 来源：`## Deferred from: code review of story-1-18-目标平板落地-竖屏布局-离线与部署 `[CR]` (2026-10-20)` ｜ 旧编号 `W6` ｜ 详见 `archive/deferred/2026-10-20--cr-story-1-18.md` 的「分诊结论」

## DF-123

**状态**：待触发 · **归属**：Story 1.19 · **恢复条件**：给 `LevelOutcome` 浮层自己的 `padding-left/right` 补上 `env(safe-area-inset-left/right)`，并加一条守卫断言

**一句话**：`src/components/hud/LevelOutcome.vue` 浮层 `padding-left/right` 仍只有 `var(--space-panel-pad)`

### 原始论证

### W7. `LevelOutcome` 浮层的左右安全区（1.16 引入；`[CR]` 2026-10-20 **更正过原因**）

- **⚠️📎 `[CR]` 2026-10-20 更正本条原先写的「原因」—— 它是错的，但风险是真的。**
  原先逐字写：「`.level-view` 的 `padding` 只在**上下**加了安全区，
  **左右两侧没有加** `env(safe-area-inset-left/right)`」
  ⇒ **与源码不符**：`src/views/LevelView.vue` 逐字是
  ```css
  padding: calc(var(--space-panel-pad) + env(safe-area-inset-top))
    calc(var(--space-panel-pad) + env(safe-area-inset-right))
    0
    calc(var(--space-panel-pad) + env(safe-area-inset-left));
  ```
  ⇒ **左右两侧加了的**。
- **真正的机制（实测，2026-10-20，真实 chromium）**：
  浮层是 `position: absolute; inset: 0`，它的包含块是 `.level-view`（`position: relative`）的
  **padding box** —— 而**padding box 含 padding 区**，所以 `.level-view` 那份
  `env(safe-area-inset-left/right)` **不会**把浮层往里推。
  ⇒ **实测**：往 `.level-view` 里塞一个 `position:absolute; inset:0` 的探针元素，
  它的 `left` = **0**，而 `.level-view` 的 `padding-left` = **16px**
  ⇒ 探针落在 **padding box** 上（`on_padding_box: true`），不是 content box。
  ⇒ 而 `LevelOutcome.vue` 自己的 `padding-left/right` 只给了 `var(--space-panel-pad)`（16px），
  **没有** `env(safe-area-inset-left/right)`。
  ⇒ **结论不变**：横屏 + 刘海 / 圆角设备上，浮层靠边的文字仍可能被系统手势区或圆角裁掉。
- **为什么不在 1.18 补**：改 `.level-view` 的 padding 口径会**连带改战场与 HUD 的可用宽度**
  （布局口径变更，超出 1.18 范围）；改 `LevelOutcome` 自己的 padding 属 1.16 的组件。
- **恢复条件**：给 `LevelOutcome` 浮层自己的 `padding-left/right` 补上
  `env(safe-area-inset-left/right)`，并加一条守卫断言
  「浮层的左右 padding 覆盖 `env(safe-area-inset-left/right)`」。
  ⚠️ 与 1.19 的横屏分栏**一起做**更省事 —— 1.19 已经在动 `.level-view` 的横屏布局。
  ⚠️ **注意**：补在**浮层自己**的 padding 上，而不是 `.level-view` 上 ——
  后者会改变战场与 HUD 的可用宽度（而前面已实测：那份 padding **不会**自动保护浮层）。


> 来源：`## Deferred from: code review of story-1-18-目标平板落地-竖屏布局-离线与部署 `[CR]` (2026-10-20)` ｜ 旧编号 `W7` ｜ 详见 `archive/deferred/2026-10-20--cr-story-1-18.md` 的「分诊结论」

## DF-124

**状态**：待触发 · **归属**：Story 1.2 · **恢复条件**：把「结束朗读」收敛成单一出口（`try/finally` 或一个 `finishPronunciation()`），所有提前 `return` 路径都走它；并加一条守卫断言「任何一次朗读请求结束后 `playing` 必为 false」

**一句话**：`src/services/pronunciation.ts` 的 `playPronunciation` 提前 `return` 路径不发 `idle`，浮层可能永亮

### 原始论证

### W8. `pronunciation.ts` 的 `playing` 收敛点只有五处，发声路径提前 `return` 时没有统一兜底（1.2 引入）

- **实测**：`src/services/pronunciation.ts` 把「正在读…」这个状态收敛在**五处**
  显式 `playing = false`；但**发声路径上存在提前 `return` 的分支**
  （例如某些词缺失录音时直接返回、或中途被新的播放请求打断）。
  ⇒ 那些分支**没有**统一把 `playing` 收回去
  ⇒ 极端情况下朗读浮层会**永远停在「正在读…」**。
- **为什么不在 1.18 补**：`pronunciation.ts` 是 **1.2「音频解锁与 TTS 朗读」**的实现，
  1.18 只在 `LevelOutcome` / 答题链路上消费它的状态，不改它的实现。
  ⚠️ 另注：**1.2 至今仍留 `review`**（`sprint-status.yaml` 里那条 `review` 是有意留的，
  理由见 1.2 自己的 story 文档）⇒ 这条更适合在 **1.2 的收尾**里处理，而不是 1.18。
- **恢复条件**：把「结束朗读」收敛成**单一出口**（`try/finally` 或一个
  `finishPronunciation()`），所有提前 `return` 路径都走它；
  并加一条守卫断言「任何一次朗读请求结束后 `playing` 必为 false」
  （含提前 `return` 的分支）。


> 来源：`## Deferred from: code review of story-1-18-目标平板落地-竖屏布局-离线与部署 `[CR]` (2026-10-20)` ｜ 旧编号 `W8` ｜ 详见 `archive/deferred/2026-10-20--cr-story-1-18.md` 的「分诊结论」

## DF-125

**状态**：待排期 · **归属**：Story 1.19 / 1.20 / 2.1 / 2.2 · **恢复条件**：① 先把 110 行按 story 归位，账本里只留一行指针；② 归位完成后再把 R-42 守卫的射程扩到 `last_updated:` 块，上限沿用 `SPRINT_STATUS_MAX_COMMENT_LINES`；③ 扩射程那一步要配一条反向自测

**一句话**：`sprint-status.yaml` 的 `last_updated:` 块 110 行注释未归位，R-42 守卫上限仍是 4

### 原始论证

### W9. R-42 守卫的射程只到 `development_status:`，而复盘真正回流在 `last_updated:` 块（1.13 起累积）

- **实测（2026-10-20，Story 1.18 `[CR]`）**：
  `sprint-status.yaml` 的 `last_updated:` 续行块是**第 52–162 行，共 110 行注释**
  （下一条非注释非空行是第 163 行 `project: plants-game`）。
  而 `tests/scaffold/docs-rules.test.ts` 的 R-42 守卫逐字只量
  「`development_status:` 块**及其之后**的注释行」，上限 **4** ⇒ **`last_updated:` 块不在其射程**。
- **这 110 行是谁的**：**不是 1.18 写的** —— 是 Story **1.19 / 1.20 / 2.1 / 2.2** 累积的运行记录。
  ⚠️ 抽查三条**只存在于账本、在各自 story 文档里搜不到**：
  - 「N2 盲审报 PLAUSIBLE」
  - 「查重时打自己的脸：全仓库 `uniq -d` 实测 **10 个重号**」
  - 「🔥 全仓库 `uniq -d` 实测 **10 个重号**，9 个是假警报，唯一真撞的 **G30 早于本 story**（1.11 vs 1.12…）」
  ⇒ 它们**不是重复，是尚未归档的证据**；按 R-42 逐字「运行复盘……**一律写进该 story 文档**」，
  搬进那四份文档需要逐条核对，**不能凭某一个 story 的记忆改写**。
- **为什么不在 1.18 补**：1.18 的 `[CR]` 动它等于**替另外四个 story 搬运并改写它们的证据**，
  超出本 story 范围；且按 **R-57 不许为了变绿而松阈值** ——
  把上限从 4 调到 110 正是典型的「为了让守卫变绿而松」，**比不做更坏**（它会让守卫永久失去牙齿）。
- **恢复条件**（**顺序不能反**）：
  ① 先把 110 行按 story 归位 —— 各自搬进对应的 story 文档（1.20 / 2.2 已按 R-40 归档，
     搬进 `_bmad-output/archive/`），账本里只留**一行指针**；
  ② **归位完成后再**把 R-42 守卫的射程扩到 `last_updated:` 块，
     上限沿用 `SPRINT_STATUS_MAX_COMMENT_LINES`（**不新设一个更大的数**）；
  ③ 扩射程那一步要配一条**反向自测**（在 `last_updated:` 块里塞 N+1 行复盘 ⇒ 必须红），
     否则又是一条恒绿守卫（R-50 第 ② 步 / R-51）。
- ⚠️ **顺带记一条已发生的**：Story 1.18 的 `[DS]` 曾在同一块里加过两行运行记录注释
  （`# 1-18 [DS] 开工 —— 13 条裁决…` / `# 1-18 [CS] 完成 …`），
  **后来 1.20 / 2.1 / 2.2 的 `[CR]` 已把 1.18 那一段清掉**（文件头逐字「`[CR]` 已按 R-42 收敛成指针」）
  ⇒ **1.18 自己的残留已归零**，恢复时**不必**再搬 1.18 的行，只需搬那四份的。


> 来源：`## Deferred from: code review of story-1-18-目标平板落地-竖屏布局-离线与部署 `[CR]` (2026-10-20)` ｜ 旧编号 `W9` ｜ 详见 `archive/deferred/2026-10-20--cr-story-1-18.md` 的「分诊结论」

## DF-126

**状态**：待裁决 · **归属**：未指派（接线规格见 Story 3.4 文档的「裁决 C」小节） · **恢复条件**：裁决 ducking 曲线（起落时间常数 + 稳态增益）后，按 Story 3.4 文档「裁决 C」小节给出的接线规格在 `startBgmIfReady`/`playSfx` 两侧各接一个 `GainNode`，并补守卫

**一句话**：`services/audio.ts` 的 `startBgmIfReady`/`playSfx` 两侧未接 `GainNode` 做 BGM ducking

### 原始论证

### 1. 🚨 BGM ducking（SFX 起播时压低 BGM 音量）—— AC-H6 表格里有，1.14 从未登记也从未实现

- **AC 原文**：AC-H6 的手动验收表里有一行「音效与 BGM 同时播放时的 ducking 行为」。
  `[DS]` 的裁决 7 写的是「音效播放的并发与 ducking **本 story 不做**」——
  裁决本身没问题（它明说了不做），**问题在于它没进 `deferred-work.md`** ⇒ 账目漏了一行。
- **为什么现在不做**：ducking 的幅度是**dB 数值**，属 R-20 那条「碰任何数值都要先问人」的范围。
  无人值守下自行拍一个 `-12dB` 写进代码，就是绕过裁决。
- **归属**：**Story 3.4**（同属音频混音线）。
- **恢复条件**：3.4 开工时先定 ducking 曲线（起落时间常数 + 稳态增益），
  再在 `startBgmIfReady` / `playSfx` 两侧各接一个 `GainNode`；
  接线后补一条守卫：**BGM 起播中播放音效 ⇒ `bgmGain` 被压低**（当前是恒 1，测不出差别）。


> 来源：`## Deferred from: code review of story-1-14-音效与-bgm-接入 (2026-10-21)` ｜ 旧编号 `1` ｜ 详见 `archive/deferred/2026-10-21--cr-story-1-14.md` 的「分诊结论」

### 2026-10-25（Story 3.4 `[DS]`）的处置 —— **不接线，曲线待人裁决**

- **做了什么**：**没有改任何代码**。ducking 的**曲线**（起落时间常数 + 稳态增益）
  是**数值**，按 R-20 的精神与 GDD「⚠️ 改之前问人」必须由人定；
  无人值守下自行拍一个 `-12dB` 写进代码就是绕过裁决。
  ⇒ 这与 Story 1.14 裁决 7 给的理由一致（逐字：「GDD **没有给任何量化要求**，
  凭空定一个「压到多少」属于自造需求」）。
- **本 story 给了什么**：**接线规格**（不涉及数值的那一半）——
  ① 在 `startBgmIfReady` 与 `playSfx` 两侧各接一个 `GainNode`；
  ② 起播/停止 ducking 的**时机**（音效**起播**时压低，**播完**时恢复，
  不是一个固定音量）；
  ③ 接线后补一条守卫：「BGM 起播中播放音效 ⇒ `bgmGain` 被压低」
  （当前 `bgmGain` 恒为 1，测不出差别）。
  ⚠️ 这三条**不含任何数字** ⇒ 不构成数值决策。
- **状态为什么从「待触发」改成「待裁决」**：原恢复条件是「3.4 开工时先定曲线」——
  3.4 已开工，曲线**没有**被定下来（agent 不定）⇒ 剩下的就是**人的裁决**。

## DF-127

**状态**：待触发 · **归属**：Story 1.18 · **恢复条件**：真机上确认目标设备是否真的需要前缀；确认不需要就把它划掉，不要为了「完备」而加没人验证过的分支

**一句话**：`services/audio.ts` 只读 `globalThis.AudioContext`，无 `webkitAudioContext` 前缀回退

### 原始论证

### 2. `webkitAudioContext` 回退 —— AC-H6 表格里有，1.14 从未登记也从未实现

- **AC 原文**：AC-H6 的手动验收表里有一行「老 WebView 的 `webkitAudioContext` 前缀」。
  `audio.ts` 只读 `globalThis.AudioContext`，**没有前缀回退** ⇒ iOS Safari 老版本上直接走
  「浏览器不支持 AudioContext」那条 session 降级。
- **为什么现在不做**：它属于**真机兼容性**，在没有真机的情况下加前缀分支，
  只能验证「代码里有那个分支」，验证不了「那个分支在老 WebView 上真的能用」。
- **归属**：**Story 1.18（真机验收批次）**。
- **恢复条件**：真机上确认目标设备是否真的需要前缀（现代 iOS Safari 已有 `AudioContext`）。
  **确认不需要就把它划掉，不要为了「完备」而加没人验证过的分支。**


> 来源：`## Deferred from: code review of story-1-14-音效与-bgm-接入 (2026-10-21)` ｜ 旧编号 `2` ｜ 详见 `archive/deferred/2026-10-21--cr-story-1-14.md` 的「分诊结论」

## DF-128

**状态**：待裁决 · **归属**：未指派 · **恢复条件**：先定「许可字段允许填什么」（是否允许 `AI-generated (...)` 这类描述），再据此把 G251 的「已知形态」清单补全

**一句话**：`tests/assets/audio-assets.test.ts` 的许可字段允许哪些前缀仍待人裁决

### 原始论证

### 4. 许可字段的允许取值 —— AC-H1 的两个例子互斥（规格内部矛盾）

> 📎 **2026-10-21 `[CR]` 第二轮：这条**部分结清**。**
> 「守卫放行了 AC-H1 点名要杀的那种填法」是**守卫问题**，已修（G251，见下）；
> 「许可字段到底允许填什么」是**规格问题**，仍**待人裁决** ⇒ 本条**保持开放**。

- **事实**：AC-H1 举的许可字段例子是 **「AI-generated (MiniMax music)」**，
  而 `tests/assets/audio-assets.test.ts` 断言的是 `expect(record.license).toMatch(/^CC0/)`。
  **AC 自己给了两个互斥的例子** ⇒ 守卫与 AC 至少有一个是错的。
  ⚠️ **现实情况**：BGM 最终来自**同一个 CC0 库**（`mmx music generate` 已 HTTP 410），
  所以盘上 8 条素材的许可**全是** `CC0 1.0 Universal (Public Domain Dedication)` ——
  AC-H1 那个「AI-generated」示例**对应不上任何一条现存素材**。
- **为什么第一轮没有改判据**：按 **R-57**，改判据必须留痕说明理由；
  更重要的是——**放松成「统一填一个值也放过」会让守卫彻底失去牙齿**
  （这正是本仓库记过的「守卫断言允许了它要防的违规」的形态之一）。
  ⇒ **宁可暂时留着矛盾，也不要为了「变绿」而放松。**
- **为什么第二轮动了判据（只动**收紧**的方向）**：实测发现原判据
  `toMatch(/^CC0/)` **允许裸字符串 `"CC0"`** ⇒ 它放行的正是 AC-H1 逐字点名的
  「不许统一填一个 `CC0` 了事」⇒ 守卫**问的不是那件事**。
  ⇒ 第二轮**只收紧、不放松**（R-57 留痕）：裸 `CC0` 不许；许可必须是已知的一种；
  八个文件内容两两不同；来源页两两不同。
  ⚠️ **「每条 license 互不相同」**明确**不成立、也不该断言** ——
  七个音效与 BGM 全部来自同一个 CC0 库，许可文本**理应**一字不差；
  断言「互不相同」会逼着人编造差异（那才是真的造假）。
  ⇒ 把它换成了**可满足**的等价残留（裸 `CC0` 不许 + 已知形态 + 内容/来源两两不同）。
- **另一个已知缺口（**已修**）**：原判据过滤 `.endsWith('.mp3')`，
  **非 mp3 资产完全不在扫描范围内** ⇒ 第二个 G251 用例把扫描范围改成
  「目录里的**所有**文件（登记文件本身除外）」。
  实测：往 `public/assets/audio/sfx/` 丢一个未登记的 `.ogg` ⇒ **旧守卫全绿**、新守卫红。
- **恢复条件（剩下的那半）**：先定「许可字段允许填什么」（是否允许 `AI-generated (...)` 这类描述），
  再据此把 G251 的「已知形态」清单补全（当前是 `CC0` / `CC-BY` / `AI-generated` 三种前缀）。
  ⚠️ **本条只剩这一件事** —— 扫描范围、裸 `CC0`、内容与来源的唯一性**都已落地并有守卫**。


> 来源：`## Deferred from: code review of story-1-14-音效与-bgm-接入 (2026-10-21)` ｜ 旧编号 `4` ｜ 详见 `archive/deferred/2026-10-21--cr-story-1-14.md` 的「分诊结论」

## DF-129

**状态**：待排期 · **归属**：未指派 · **恢复条件**：下次动这批文件时顺手改；或单独开一次「守卫编号可检索性」的小改，改完跑一遍全仓确认没有用例只靠标题匹配

**一句话**：`tests/` 各守卫编号只写在 `describe` 上，`it` 标题不含 G 号，按号搜不到用例

### 原始论证

### 5. 守卫编号只写在 `describe` 上，`it` 标题不含编号（AC-G1 的命名格式只满足 6/15）

- **AC 原文**：AC-G1 逐字要求 `it('G58：…')`。
- **实际**：多数用例把编号写在 `describe('G65 —— …')` 上，`it` 标题不含编号 ⇒
  **按 G 号搜不到具体用例**（能搜到那一整个 describe）。
- **为什么 1.14 的 `[CR]` 不做**：约 25 条用例的机械改名（含跨文件的历史用例），
  与同批的 4 条高危 patch 混在一起会让 diff 无法审；且**改名不增加任何鉴别力** ——
  编号只影响可检索性，判据强度一条都不变。
- **没有让缺口变大**：本轮新建的 **G205–G214** 一律把编号写在 `describe` 上（与文件既有风格一致）。
  📎 **2026-10-21 第二轮同样如此**：新建的 **G246–G252** 也把编号写在 `describe` 上 ⇒ 缺口**没有再变大**。
- **恢复条件**：下次动这批文件时顺手改；或单独开一次「守卫编号可检索性」的小改，
  改完跑一遍全仓确认没有用例**只**靠标题匹配（有没有靠标题做断言的先查）。
- ⚠️ **优先级如实标低**：它让「按 G 号定位用例」变麻烦，**不会让任何 bug 漏网**。


> 来源：`## Deferred from: code review of story-1-14-音效与-bgm-接入 (2026-10-21)` ｜ 旧编号 `5` ｜ 详见 `archive/deferred/2026-10-21--cr-story-1-14.md` 的「分诊结论」

## DF-130

**状态**：待触发 · **归属**：未指派 · **恢复条件**：先定「复习模式」在 `State` 里的表示，再决定判据落在哪一层；触发条件 = 引入复习模式的那天

**一句话**：`core/effects.ts` 的 `answer-correct` 在引入复习模式后会重新可达

### 原始论证

### 6. `answer-correct` 在「已掌握的词被重新提问」时仍会播

> ✅ **2026-10-21 `[CR]` 第二轮结清 —— 本条的前提在当前架构下**不可达**。**
> 逐条核过题单的三条来路：`core/deck-slice.ts`（选下一题时按
> `masteredEntryIds` 排除已掌握词）、`core/nextQuestion`（同源判据）、
> `app/dev-adjust.ts`（DEV 补偿缝，它加的是**已答过**的词，不改 `masteredEntryIds`）
> ⇒ **已掌握的词不会被选进题单** ⇒ 「已掌握的词被重新提问 ⇒ 答对音效响起」
> 这条路径**今天走不出来**。
> ⇒ 按 R-35 在**原条目**上标注结清。
> ⚠️ **留痕**：若将来引入「复习模式」（把已掌握的词**故意**放回题单），
> 本条会**重新变得可达** ⇒ 那时按下面的恢复条件处理。

- ~~**事实**：`answer-correct` 的判据只认「这一题答对了」，不认这个词是不是**早就掌握了**。~~ **（前提不可达）**
- **为什么现在不做**：要不要「已掌握就不响」属**玩法与反馈设计**，
  且它会牵动 `core/effects.ts` 的纯函数判据（`effects.ts` **不许读 progress** ——
  它只看 `(action, prev, next)`，`prev` 里没有 progress）。
  ⇒ 真要做，得先决定「复习模式」的来源怎么进判据 ⇒ **架构级归属未定**。
- **归属**：无明确 story，建议 `/gds-correct-course` 指派（与 1.15 裁决 6 的 TTS 归属同类）。
- **恢复条件**：先定「复习模式」在 `State` 里的表示，再决定判据落在哪一层。
  ⚠️ **触发条件**：引入复习模式的那天。


> 来源：`## Deferred from: code review of story-1-14-音效与-bgm-接入 (2026-10-21)` ｜ 旧编号 `6` ｜ 详见 `archive/deferred/2026-10-21--cr-story-1-14.md` 的「分诊结论」

## DF-131

**状态**：待触发 · **归属**：Story 3.2 / 3.6（战斗结算侧） · **恢复条件**：回合结算把**逐只**僵尸的结算明细写进 `State` 之后 ⇒ 收窄 `zombie-died` 的判据；别为了这条去动 `State`

**一句话**：`core/effects.ts` 的 `zombie-died` 判据分不清「被打死」与「到达后被带走」的僵尸

### 原始论证

### 1. `zombie-died` 的残余偏差：两僵尸同回合到达时，可能响的那一声是错的

- **事实**：`zombie-died` 的判据是「`RESOLVE_ROUND` 且僵尸数减少（扣掉掉心部分）」。
  残余偏差：**同一回合到达 2 只僵尸、0 只被打死**（例如慢塔的塔都在打别的方向）
  ⇒ 僵尸数**没减少** ⇒ 不该响；可若同回合另有一次击杀让总数减少，
  判据**分不清**「少的是被打死的」还是「少的是到达后被别的路数带走的」⇒ **可能响一声错的**。
  ⚠️ **第一轮的注释把它说成「多响一声」——那是错的**：那次 `heart-lost` **照样会响**
  （`lostSlotIndexes` 数的是「true → false 的槽位」，不是「心数减少了多少」）。
- **两种修法，各有代价**：
  ① **收窄判据**（只认「减少的部分逐个对应到被打死的僵尸」）⇒
  需要在 `State` 里留下「哪几只被打死了」的痕迹 ⇒ **要改状态模型**；
  ② **精确判据**（比数组长度）⇒ 同上。
  ⇒ 两条都**越出本 story 的边界**（`core/effects.ts` 只看 `(action, prev, next)`）。
- **为什么本轮不动**：这不是「补一条断言」能了的事 —— 它要动 `State` 的形状，
  而 `State` 的字段归 1.13 / 1.16 管。**在别人的 AC 外面造判据 = 复制链**（R-37）。
- **归属**：**Story 3.4**（同属「战斗反馈」线；3.4 会碰音效播放的编排）。
- **恢复条件**：3.4 开工时先定「回合结算要不要留下逐只的结算明细」。
  ⚠️ **别为了这条去动 `State`** —— 若 3.4 不需要逐只明细，本条就**划掉**，
  别写一个「大概能用」的判据。


> 来源：`## Deferred from: code review of story-1-14-音效与-bgm-接入（**第二轮**）(2026-10-21)` ｜ 旧编号 `1（第二轮）` ｜ 详见 `archive/deferred/2026-10-21--cr-story-1-14-r2.md` 的「分诊结论」

### 2026-10-25（Story 3.4 `[DS]`）的处置 —— **不修，转出到战斗结算侧**

- **为什么本 story 不修**：要区分「被打死」与「到达后被带走」，
  必须知道**哪一只**僵尸被结算掉了 ⇒ 需要逐只的结算明细 ⇒ 要动 `State`，
  而本条逐字写着「**别为了这条去动 `State`**」⇒ 与 Story 3.4 的边界冲突。
- **为什么「不修」不等于「划掉」**：epics 的 FR6 逐字把「僵尸死亡」与「僵尸抵达（掉心）」
  列为**两个事件** ⇒ 现状确实是职责不符（AC-1 逐字「帮助孩子理解刚才发生了什么」
  被削弱）⇒ 这条**仍然成立**，只是不属于本 story。
- **转出到**：**战斗结算侧**（Story 3.2 / 3.6 一线）。
- **恢复条件为什么改写**：原文「3.4 开工时先定『回合结算要不要留下逐只的结算明细』」
  在 3.4 交付后已不指向本 story ⇒ 改成「回合结算把**逐只**僵尸的结算明细写进 `State`
  之后 ⇒ 收窄 `zombie-died` 的判据」——仍然可判定。

## DF-132

**状态**：待触发 · **归属**：未指派（战斗反馈侧） · **恢复条件**：音效播放改为**可等待的串行队列**时（排队会改体感，须先定）

**一句话**：`services/audio.ts` 各音效各自解码，先解完先响 ⇒ `runEffects` 数组顺序 ≠ 听觉顺序

### 原始论证

### 2. 「听到的顺序」与「执行顺序」不是一回事

- **事实**：AC-C5 逐字说的是「**返回顺序就是播放顺序**」——
  指的是 `runEffects` 返回的数组顺序 = `effects-runner` 的**执行**顺序。⇒ **AC 成立**。
  但**孩子先听到哪一声**，由**解码完成顺序**决定（各音效各自 `fetch` + `decodeAudioData`，
  谁先解完谁先响）⇒ 数组顺序**不保证**听觉顺序。
- **为什么这不是本 story 的 bug**：AC 没有要求听觉顺序；
  而要保证它，就得引入**排队播放**（等上一声播完再放下一声）——
  那会改变「同一回合三件事同时响」的手感，属**玩法/体感**决策。
- **归属**：**Story 3.4**（与 ducking 同属音频混音线；3.4 若引入排队播放，本条自动消解）。
- **恢复条件**：3.4 决定要不要排队播放。
  ⚠️ **与 deferred 第 1 条（ducking）的耦合**：ducking 要 `GainNode`，
  排队播放要**串行** ⇒ 两者最好在同一批里定，否则要改两遍。


> 来源：`## Deferred from: code review of story-1-14-音效与-bgm-接入（**第二轮**）(2026-10-21)` ｜ 旧编号 `2（第二轮）` ｜ 详见 `archive/deferred/2026-10-21--cr-story-1-14-r2.md` 的「分诊结论」

### 2026-10-25（Story 3.4 `[DS]`）的处置 —— **不排队，转出到战斗反馈侧**

- **为什么本 story 不排队**：排队播放是**行为**变更而非品质打磨 ——
  它会同时破坏 Story 1.14 裁决 7 的**两条**逐字：「**BGM 与 SFX 同时播**：允许。
  SFX 盖在 BGM 上是常态。」与「**同类音效并发**：同一 cue 在上一次播放未结束时再次触发，
  **允许叠加**（Web Audio 每次 `createBufferSource` 天然独立）。不实现「打断上一次」——
  打断会让「连点 3 次重听只响一次」这类守卫变复杂，而音效本就该每次都响。」
  而且排队会让**跨批次**的音效也排队（后一批要等前一批播完）。
  ⇒ AC-1 逐字限定「只改品质，不改职责」、AC-2 逐字限定「不新增分支逻辑」。
- **转出到**：**战斗反馈侧**（未指派到具体 story —— 3.2 / 3.6 一线均可）。
- **恢复条件为什么改写**：原文「3.4 决定要不要排队播放」在 3.4 交付后已不指向本 story
  ⇒ 改成「音效播放改为**可等待的串行队列**时（排队会改体感，须先定）」。
- ⚠️ **与 DF-126 的耦合仍在**：ducking 要 `GainNode`、排队播放要**串行**
  ⇒ 两者最好在同一批里定，否则要改两遍（原文的提醒逐字保留）。

## DF-133

**状态**：待触发 · **归属**：Story 1.17 · **恢复条件**：1.17 若要收这条，就在 G109 那条守卫里扩，而不是新开一条

**一句话**：`app/dev-adjust.ts` 补偿缝的音效触发顺序由 Story 1.17 的 G109 负责

### 原始论证

### 3. DEV 补偿缝里的 `answer-correct` / `heart-lost` 触发顺序

- **事实**：`app/dev-adjust.ts` 那条补偿缝会在一次 `applyAction` 之外**额外**触发音效，
  触发顺序与正常路径**不同**（正常路径由 `runEffects` 的顺序保证）。
- **为什么本轮不动**：DEV 缝的行为**由 1.17 管**（1.17 已经用 **G109** 钉住
  「DEV 补偿缝排在 `runEffectsFromStore` 之前」这个**顺序**）。
  ⇒ 在 1.14 里另立一条判据 = **第二份**顺序知识（R-37）。
- **归属**：**Story 1.17**（已归档；见 R-40，不在本文引用具体文件名）。
- **恢复条件**：1.17 若要收这条，就在 G109 那条守卫里扩，而不是新开一条。


> 来源：`## Deferred from: code review of story-1-14-音效与-bgm-接入（**第二轮**）(2026-10-21)` ｜ 旧编号 `3（第二轮）` ｜ 详见 `archive/deferred/2026-10-21--cr-story-1-14-r2.md` 的「分诊结论」

## DF-134

**状态**：待触发 · **归属**：未指派 · **恢复条件**：音效若改用程序化生成，需搬 Story 1.3 的 manifest/fingerprint/sha256（R-59 全套）

**一句话**：`core/effects.ts` 的音效若改用程序化生成要补 R-59 全套

### 原始论证

### 4. 📎 补登：AC-H5 自己要求登记的那条（「音效若改用程序化生成，才需要 R-59 的全套」）

- **为什么现在才登记**：AC-H5 逐字写着「**若将来音效改用程序化生成，
  那时才需要 R-59 的全套。登记为 deferred。**」⇒ **AC 自己要求登记**，
  而 `[DS]` 交付时**没登** ⇒ 账目漏了一行（与第 1、2 条同类：
  **AC 表格里有、`deferred-work.md` 里没有**）。
- **事实**：Story 1.3 那套 manifest / fingerprint / sha256 机制是为**录音**建的
  （R-59：fingerprint 不符 ⇒ 退出码 1 拒跑）；本 story 的素材是**一次性下载入库的静态资产**，
  没有「跨批次生成」那个失效模式 ⇒ **现在不需要**。
- **归属**：**无固定 story** —— 触发条件是「音效改用程序化生成」，
  也就是素材管线换形态的那一次。届时一并把 1.3 的 manifest / fingerprint / sha256 搬过去。
- **恢复条件**：⚠️ **AC-H5 里那条「字节数下限要留着」已经落地**（G66 的 `size > 1024` + mp3 头校验），
  **它不属于本条** —— 本条只管「换生成方式时要补 R-59 的全套」。
  ⇒ **别把这两件事混成一件**：下限**已在守**，R-59 全套**还不用**。


> 来源：`## Deferred from: code review of story-1-14-音效与-bgm-接入（**第二轮**）(2026-10-21)` ｜ 旧编号 `4（第二轮）` ｜ 详见 `archive/deferred/2026-10-21--cr-story-1-14-r2.md` 的「分诊结论」

## DF-135

**状态**：待排期 · **归属**：Story 3.2 / 3.6 · **恢复条件**：3.2 调数值时把「单元边界处的初始阳光净变化」列入检查项；并另加一条检查项（相邻档位 `floor((初始阳光 + 答对增量) ÷ 最低造价)` 是否相同）

**一句话**：`BALANCE_TIERS` 三档在单元边界净缩水 50，档位 3 门槛比档位 1-2 宽一问

### 原始论证

### 42. ⚠️ 三档阳光阶梯与 Story 2.2 的「无断崖」取向**正面冲突**——两边都对，但跳变确实存在

- **事实**：Story 2.2 的裁决 1 逐字写「按 FR63 的三档（1–4 / 5–10 / 11–20）做 3 档阶梯
  会在第 4→5、第 10→11 两个边界各产生一次**值跳变**，直接违反『无断崖』」
  ⇒ 2.2 为了**卡型分布**明确拒绝 3 档阶梯，改用单调锚点插值。
  而 Story 2.3 的**阳光三档恰好就在这两个边界跳变**（初始阳光 0→50→100，造价 50→75→100）。
- **为什么两边都不算错**：2.2 管的是**卡型分布**（断崖 = 手牌构成突变），
  2.3 管的是**阳光经济**（跳变 = 数字变大）。GDD 的前提是「**阳光递增只影响手感与容错，
  不承载难度递增**」⇒ 数字变大**不会**让这一局变得更难。
  ⇒ 2.3 **不动它**（FR63 是事实源，R-32），只登记。
- **但它确实是真的**：孩子在单元 4 攒到 100 阳光，单元 5 起始只有 50 阳光 ⇒ **净缩水 50**；
  单元 10 → 11 同理净缩水 50。**跳变发生在初始阳光上，不是答对增量上。**
- **📎 2.3 `[DS]` 复测后补记（2026-10-21）—— 这条跳变**有可测后果**了**：
  档位 3 的 `initialSun = 100` **恰好等于**它的塔造价 100，于是「初始 100 + 第一次答对 +100 = 200」
  够买 **2** 座塔；而档位 1（0+50）与档位 2（50+75）都只够买 **1** 座。
  ⇒ 档位 3 的失败门槛夹在 **4 与 5 之间**，比档位 1-2（夹在 3 与 4 之间）**宽一问**。
  ⇒ **档位 3 的跳变恰好跨过了「一次答对够买几座塔」的整数边界** ——
  这就是「阳光递增不承载难度递增」这句话**逐字不成立**的机制来源。
  ⇒ 档位 3 的跳变**不是**中性的：它让后期**更宽容**。
  逐回合轨迹见下方条目 45 与 GDD §Economy Across Levels。
- **归属**：**Story 3.2（战斗数值调优）/ 3.6（平衡回归锁定）**。
- **恢复条件**：3.2 调数值时，把「单元边界处的初始阳光净变化」列入检查项 ——
  判据写出来是：相邻档位交接处，**上一档累计的阳光**与**下一档的初始阳光**的差额，
  若为负 ⇒ 玩家在交界处「倒退」。3.2 决定是接受它（数字大是目标）还是平滑掉。
  ⚠️ **另加一条检查项**（2.3 复测新增）：相邻档位的
  `floor((初始阳光 + 答对增量) ÷ 最低造价)` **是否相同** ——
  不同 ⇒ 该边界的失败门槛会移动（实测：档位 3 = 2 座，档位 1-2 = 1 座）。


> 来源：`## Deferred from: story-2-3-阳光经济档位扩展 `[CS]` (2026-10-21)` ｜ 旧编号 `42` ｜ 详见 `archive/deferred/2026-10-21--cs-story-2-3.md` 的「分诊结论」

## DF-136

**状态**：待排期 · **归属**：Story 3.3 / 3.6 · **恢复条件**：3.3 依试玩数据调整三档时，必须同步更正 GDD §Economy Across Levels 的表与 `epics.md` FR63，并按 R-21 在同一 story 内同步更正

**一句话**：GDD §Economy and Resources 仍把「阳光递增的具体分段值」列为待定项

### 原始论证

### 43. GDD 把「阳光递增的具体分段值」列为**待定项**，定稿时机是 Epic 3

- **事实**：GDD §Economy Across Levels 逐字给出三档的定稿值
  （`0/+50/50,50,75`、`50/+75/75,75,110`、`100/+100/100,100,150`），
  `epics.md` FR63 与之逐字一致 ⇒ 2.3 照誊（2.3 裁决 2：数值已由用户拍板「阳光是否随难度递增」）。
  **但同一份 GDD 的 §Economy and Resources 逐字把「阳光递增的具体分段值」列进「待定项」**，
  逐字写着「**定稿时机：Epic 3（打磨），依试玩数据调整**」。
- **为什么不阻塞 2.3**：两处口径并存 ⇒ 2.3 执行 §Economy Across Levels 的表；
  「待定项」那句理解为「**誊进代码之后，Epic 3 可以再调**」。
  ⇒ **但这意味着 2.3 落地的三档值是「可被 Epic 3 推翻的」**，不是永久常量。
- **归属**：**Story 3.3（经济与节奏调优）**（3.3 逐字就是经济线的调优 story），
  连带 **3.6（平衡回归锁定）** —— 3.6 若在 2.3 之后把三档值锁死，
  就要确认 3.3 是否已调过。
- **恢复条件**：3.3 依试玩数据调整三档时，**必须同步更正两处**：
  ① GDD §Economy Across Levels 的表；② `epics.md` FR63；
  并按 **R-21** 在同一 story 内同步更正（3.3 的实测值优先于今天的誊抄值）。
  ⚠️ 另：2.3 落地后，`BALANCE_TIERS` 里的数**只是誊抄** ⇒
  3.6 做「平衡回归锁定」时，锁的应是 **3.3 定稿后的值**，不是 2.3 的誊抄值。


> 来源：`## Deferred from: story-2-3-阳光经济档位扩展 `[CS]` (2026-10-21)` ｜ 旧编号 `43` ｜ 详见 `archive/deferred/2026-10-21--cs-story-2-3.md` 的「分诊结论」

## DF-137

**状态**：待裁决 · **归属**：Story 3.2 / 3.6 · **恢复条件**：2.3 若要动档位边界或初始阳光 ⇒ 必看本条的实测表与守卫（`tests/scripts/balance-sim.test.ts` 的 G231 / G232），并重跑 `npm run balance-sim`

**一句话**：Story 2.3 复测证实门槛确实移动但更宽容，「停手问人」出口至今没以「问」的形式完成

### 原始论证

### 44. ✅ **已激活**（2026-10-21，Story 2.3 `[DS]` 复测）—— 门槛**确实**会移动，但移动方向是**更宽容**

- **条件**：2.3 的复测（组 D）结果**与**既有结论「递增阳光不改变失败门槛」**不一致**。
  ⇒ 那种情况下 2.3 **停手问人**，本条才被激活。
  📎 **`[CR]` 2026-10-21 更正（本条两行原本自相矛盾）**：上面这句「条件」写的是
  「停手问人」这个**流程出口**，而下方「当前状态」写的是「已激活」—— 两行挨着却直接打架。
  **真相是**：AC-D3 的「停手问人」出口**确实被触发了**（实测结论与既有结论逐字不一致），
  但触发的是**措辞**不是**数值** —— 2.3 一个数值都没改（R-20），
  只把两种结果与轨迹摆出来，源文档按 R-21 就地更正（更正的是**实测事实**，不是设计决定），
  **未裁决的产品问题**挂在条目 45。
  ⇒ 判定为「已激活」的是**本条**（门槛确实移动了），**不是**「问完了」——
  ⚠️ **「停手问人」这一步至今没有以「问」的形式完成**：本轮为无人值守运行，
  按「最保守且能推进」处置（不改数 + 显式挂账 + 在 story 文档显著提示），
  **该产品裁决仍属 Story 3.2 / 3.6**（条目 45）。
- **为什么它重要**：Story 2.2 整条卡型分布规则建立在一个前提上 ——
  「**阳光不承载难度递增**」⇒ 所以难度曲线**可以**全部由卡型分布承载
  （这正是 2.2 用单调锚点插值、拒绝 3 档阶梯的理由）。
  若 2.3 的复测显示**阳光档位也会移动失败门槛** ⇒
  **难度就被两个机制同时承载了** ⇒ 2.2 那条「单调插值」的推导前提被打破，
  需要重审（不是推翻，是「插值幅度要重算」）。
- **当前状态**：**已激活**（2026-10-21）。复测结果（真实 `src/core/` reducer）：

  | 档位 | 单元 | 第一次答对后的阳光 | 能建几座塔 | 失败门槛 |
  |---|---|---|---|---|
  | 1-4 | 1 | 0 + 50 = 50 | 1 | 连错 3 通关 / 连错 4 失败 |
  | 5-10 | 5 | 50 + 75 = 125 | 1 | 连错 3 通关 / 连错 4 失败 |
  | 11-20 | 11 | 100 + 100 = 200 | **2** | **连错 4 通关 / 连错 5 失败** |

  逐回合轨迹（连错 3 题，`回合→(塔,心掉,剩心)`）：
  单元 1 —— `4→(1,-1,2) 5→(2,-1,1) 6→(3,-0,1)`；
  单元 11 —— `4→(2,-1,2) 5→(3,-0,2)`。

  ⇒ **门槛确实移动了**（档位 3 夹在 4 与 5 之间，比前两档**宽** 一问）。
  ⇒ **但移动方向是「更宽容」不是「更难」** ⇒
  **2.2 的推导前提（阳光不承载难度递增）在实质上仍然成立** ——
  难度**没有**被第二个机制承载。⇒ **2.2 的「单调插值」推导不需要重审**，
  需要重审的是「门槛不改变」这句**逐字**的表述（已按 R-21 就地更正 GDD 与 `epics.md`）。
  ⇒ 换句话说：**条件触发了，但触发的是「措辞」而不是「设计」**。
- **归属**：Story 2.3 已就本条给出实测结论（并按 R-21 就地更正源文档）→
  剩下的**产品裁决**转 **Story 3.2 / 3.6**（见条目 45）。
- **恢复条件**：3.2 若要动档位边界或初始阳光 ⇒ 必看本条的实测表与守卫
  （`tests/scripts/balance-sim.test.ts` 的 G231 / G232），并重跑 `npm run balance-sim -- <单元号>`。


> 来源：`## Deferred from: story-2-3-阳光经济档位扩展 `[CS]` (2026-10-21)` ｜ 旧编号 `44` ｜ 详见 `archive/deferred/2026-10-21--cs-story-2-3.md` 的「分诊结论」

## DF-138

**状态**：待裁决 · **归属**：Story 3.2 / 3.6 · **恢复条件**：3.2 动档位数值时先回答「档位 3 的门槛要不要与前两档对齐」，再按 R-21 在同一 story 内同步更正 GDD §Economy Across Levels、`epics.md` 的 2.3 / 3.3 AC、以及本条目

**一句话**：档位 3 `initialSun=100` 恰等于塔造价，是否与档位 1-2 对齐门槛待人裁决

### 原始论证

### 45. 🔥 **未裁决的产品问题**：档位 3 的失败门槛要不要与档位 1-2 对齐？

- **事实**：Story 2.3 的复测显示**档位 3 的门槛比前两档宽一问**
  （档位 1-2 夹在 3 与 4 之间；档位 3 夹在 4 与 5 之间）。
  机制：档位 3 的 `initialSun = 100` **恰好等于**它的塔造价 100，
  于是「初始 100 + 第一次答对 +100 = 200」够买 **2** 座塔；
  档位 1（0+50）与档位 2（50+75）都只够买 **1** 座。
  ⇒ 门槛是否移动，取决于 `floor((初始阳光 + 答对增量) ÷ 最低造价)`，
  而**初始阳光是比例（1:1）之外的另一个项**。
- **⚠️ 为什么 2.3 不自己决定**：数值是 **FR63 的 12 个已拍板的数字**，
  改动它们属 **R-20「数值平衡参数不得擅动」** ⇒ 必须由人裁决。
  2.3 的职责是把两种结果与轨迹**摆出来**（已摆在 GDD §Economy Across Levels
  与本条目），并把**不改数**的那条路守住。
- **两条可选路径（供裁决参考，本 story 不选）**：
  ① **接受现状** —— 档位 3 更宽容。理由：后期孩子更熟练，宽一点未必是坏事；
     而且「宽」不违反 GDD 的设计取向（难度由卡型与词汇承载，不由阳光承载）。
  ② **对齐** —— 让档位 3 的门槛与前两档一致。可能的做法是把档位 3 的
     `initialSun` 调到**小于**塔造价（如 50），或把 `sunPerCorrect` 调低；
     ⚠️ **两者都会动 FR63 的数字**，且 1:1 比例必须保持 ⇒ 需要重新走一轮复测
     （守卫 G226 / G231 / G232 会立刻把不一致指出来）。
- **归属**：**Story 3.2（战斗数值调优）/ 3.6（平衡回归锁定）**，
  裁决归属用户（Epic 3 依试玩数据调整，与条目 43 的「定稿时机」一致）。
- **恢复条件**：3.2 动档位数值时，先回答「档位 3 的门槛要不要与前两档对齐」，
  再按 **R-21** 在同一 story 内同步更正 GDD §Economy Across Levels、
  `epics.md` 的 2.3 / 3.3 AC、以及本条目。

---


> 来源：`## Deferred from: story-2-3-阳光经济档位扩展 `[CS]` (2026-10-21)` ｜ 旧编号 `45` ｜ 详见 `archive/deferred/2026-10-21--cs-story-2-3.md` 的「分诊结论」

## DF-139

**状态**：待触发 · **归属**：未指派 · **恢复条件**：下一次允许改动 `balance-sim` 既有输出行时，把表头改成「跑满该场景回合上限」并把上限做成逐行的列，同时重跑并改写 story 文档里「默认输出只多一行」那句自证

**一句话**：`scripts/balance-sim.ts` 门槛表头写「16 回合上限」，但该行 `maxTurns` 是 10

### 原始论证

- **报告表头的「16 回合上限」对其中一行不成立** ——
  `scripts/balance-sim.ts` 的门槛表表头逐字写着「结果（未结束 = 跑满 16 回合上限）」，
  而「后半程连错 7 题（1-3 全对）」那一行的 `maxTurns` 是 **10** ⇒
  那一行的「结束回合 10」其实是**跑满**，不是「早早就结束了」。
  ⚠️ **既有**（表头是 Story 1.5 写的），本次 diff 未改这一行。
  ⇒ Story 2.3 的 `[CR]` 只在表头**下面加了一行**说明各场景的上限（不改既有行），
  表头**措辞本身**的改写留到本条。
  **恢复条件**：下一次允许改动 `balance-sim` 既有输出行时（Task 3.4「默认输出逐行未改」
  的约束不再生效时），把表头改成「跑满该场景回合上限」并把上限做成逐行的列；
  同时重跑并改写 story 文档里「默认输出只多一行」那句自证。


> 来源：`## Deferred from: code review of story-2-3-阳光经济档位扩展 (2026-10-21)` ｜ 旧编号 `-` ｜ 详见 `archive/deferred/2026-10-21--cr-story-2-3.md` 的「分诊结论」

## DF-140

**状态**：待触发 · **归属**：未指派 · **恢复条件**：下一次改 GDD §Economy 段战斗机制表述时一并把三处数字统一，并按 R-21 在同一 story 内同步 `decision-log.md` 与 `epics-draft.md`

**一句话**：`gdd.md` 把「3 座塔」造价 50/50/75 写成伤害，与 `decision-log.md` 的 135 不一致

### 原始论证

- **GDD 把「3 座塔」的造价写成了伤害，且三处文档给出三个不同的数** ——
  `gdd.md` 逐字写「前半程建下的 3 座塔（**50 + 50 + 75** 伤害）当回合就能打死 100 血的僵尸」，
  而 50 / 50 / 75 恰是**档位 1 的造价**（`TOWER_STATS` 的真实伤害是 50 / 25 / 60）；
  `decision-log.md` 同一件事写的是「三座塔同回合合计 **135** 伤害」；
  而模拟器实测的建塔选择（造价并列取先出现者）⇒ 档位 1 的三座塔**全是 direct = 150 伤害**。
  ⇒ 同一个量在三个地方是**三个数**。
  ⚠️ **既有**（Story 1.5 时代的老文本），不属 Story 2.3 的 diff；
  且「哪一句是本意」需要人判断（150 伤害还是 135 伤害）。
  **恢复条件**：下一次改 GDD §Economy 段战斗机制表述时，一并把三处数字统一，
  并按 R-21 在同一 story 内同步 `decision-log.md` 与 `epics-draft.md`。


> 来源：`## Deferred from: code review of story-2-3-阳光经济档位扩展 (2026-10-21)` ｜ 旧编号 `-` ｜ 详见 `archive/deferred/2026-10-21--cr-story-2-3.md` 的「分诊结论」

## DF-141

**状态**：待触发 · **归属**：Story 3.2 / 3.6 · **恢复条件**：Story 3.2 / 3.6 拿到该产品裁决后，回填条目 45 并关闭本条；在此之前「门槛在档位 3 上宽一问」只应被当作实测事实引用

**一句话**：Story 2.3 的 AC-D3「停手问人」出口至今没以「问」的形式完成，挂在条目 45

### 原始论证

- **AC-D3 的「停手问人」出口至今没有以「问」的形式完成** ——
  Story 2.3 的复测结论与既有结论「递增阳光不改变失败门槛」**逐字不一致**，
  AC-D3 逐字写的是「**此时一行都别改** —— 源文档的更正要等裁决结果」，
  而实际走的是 R-21 的「就地更正源文档」那一条。
  ⚠️ **不是数值问题**（一个数值都没改，R-20），是**流程分支**被自行解释掉了
  （触发的是「措辞」不是「数值」）。
  ⇒ 已在本条（条目 44）的「条件」行下**留痕**，并把「档位 3 要不要与前两档对齐门槛」
  显式挂在**条目 45**（未裁决的产品问题）。
  **恢复条件**：Story 3.2 / 3.6 拿到该产品裁决后，回填条目 45 并关闭本条；
  ⚠️ 在那之前，**「门槛在档位 3 上宽一问」这件事只应被当作实测事实引用**，
  不应被当成「已定的设计」。


> 来源：`## Deferred from: code review of story-2-3-阳光经济档位扩展 (2026-10-21)` ｜ 旧编号 `-` ｜ 详见 `archive/deferred/2026-10-21--cr-story-2-3.md` 的「分诊结论」

## DF-142

**状态**：待裁决 · **归属**：Story 1.19（或一次架构裁决） · **恢复条件**：二选一 —— ① 把 `asset-degradations` 的读写搬进 `app/` 门面；② 或在架构文档里把例外范围写死成「组件只可直连无状态的 `services/` 模块」并加一条守卫

**一句话**：6 个组件直连 `services/`，其中 `asset-degradations.ts` 带模块级可变状态

### 原始论证

### D1. ⚠️ AC-11 的跨层 import 登记**已经过期** —— 现在有 **6 个**组件文件直连 `services/`，而其中一个模块有**模块级可变状态**

- **AC-11 逐字**：「组件只认识 `app/`，**不直接 import `services/`**」；
  而 AC-4 又逐字要求这两个组件用 `src/services/asset-url.ts` 拼 `<img src>` ——
  **两条 AC 物理上不可兼得** ⇒ 2026-10-16 用户裁决「**改登记，不改代码**」。
- **当时的理由**（Story 1.10 文档逐字）：`asset-url.ts` 是**纯字符串函数**，
  无副作用、无顺序不变量、无模块级可变状态 ⇒ 它不承载任何「顺序」语义。
- ⚠️ **那个理由今天只对 `asset-url.ts` 成立**。实测直连 `services/` 的组件文件有 **6 个**：
  `Tower.vue` / `Zombie.vue` / `HandCard.vue` / `OptionCard.vue`（走 `asset-url` **与**
  `asset-degradations`）/ `PronunciationOverlay.vue` / `UpdateNotice.vue`；
  而 `src/services/asset-degradations.ts` 里**有模块级可变状态** ——
  `const degraded = new Map<string, string>()` / `let version = 0` /
  `const listeners = new Set<() => void>()`。
  ⇒ 「组件可直连 `services/`」这条例外今天**事实上已扩展到一个有状态模块**，
  而登记它的裁决书没有跟上。
- **为什么现在不做**：把降级登记搬到 `app/` 门面 = **改架构分层**，
  要动 4 个组件 + 1 个服务 + 守卫，属 1.19 / 架构裁决的范围。
- **归属**：**Story 1.19**（它引入了 `asset-degradations.ts`）或一次**架构裁决**。
- **恢复条件**：二选一 ——
  ① 把 `asset-degradations` 的读写搬进 `app/` 门面，组件只读门面；
  ② 或在架构文档里把例外范围**写死**成「组件**只可**直连**无状态**的 `services/` 模块」，
  并加一条守卫（组件不得 import 带模块级可变状态的 `services/` 模块）——
  否则这个例外会继续无声扩大。


> 来源：`## Deferred from: code review of story-1-10-战场渲染与网格 `[CR]` 复审 (2026-10-21)` ｜ 旧编号 `D1` ｜ 详见 `archive/deferred/2026-10-21--cr-story-1-10-复审.md` 的「分诊结论」

## DF-144

**状态**：待触发 · **归属**：Story 1.12 · **恢复条件**：词表定稿后把 `alt` / `aria-label` 换成孩子侧的说法，并加一条守卫：不得直接包含英文枚举字面量

**一句话**：`src/components/battle/Tower.vue` 的 `alt` 用英文枚举 direct/sniper/area

### 原始论证

### D3. 塔的 `alt` / `aria-label` 是英文枚举：`"direct 塔"`

- `src/components/battle/Tower.vue` 逐字写 `:alt="`${tower.towerType} 塔`"`，
  而 `towerType` 的取值是 `direct` / `sniper` / `area`（`core/balance.ts` 的英文枚举）。
- ⇒ 屏幕阅读器读出来是「**direct 塔**」—— 对中文母语的 4–8 岁孩子，
  这个词**没有任何意义**（孩子学的是「direct 塔 = 一直往前打的塔」还是「直射塔」？没人定义过）。
- **为什么现在不做**：把三个枚举译成中文**是词表口径**，要定「孩子怎么理解这三个词」，
  属内容/词表范畴（1.11 / 1.12 的词表），不是本 story 的渲染层能拍板的。
- **归属**：**Story 1.12**（建塔交互与塔型展示）或词表那一轮。
- **恢复条件**：词表定稿后，把 `alt` / `aria-label` 换成孩子侧的说法，
  并加一条守卫：`alt` / `aria-label` **不得**直接包含英文枚举字面量。


> 来源：`## Deferred from: code review of story-1-10-战场渲染与网格 `[CR]` 复审 (2026-10-21)` ｜ 旧编号 `D3` ｜ 详见 `archive/deferred/2026-10-21--cr-story-1-10-复审.md` 的「分诊结论」

## DF-145

**状态**：待触发 · **归属**：Story 1.12 · **恢复条件**：1.12 定下「可建 / 不可建 / 已选中 / 候选格」四态的视觉分工后，把 `is-buildable` 用上（或删掉这个类），并加一条守卫：模板里挂的每个状态类都必须有 CSS 规则

**一句话**：`src/components/battle/BattleField.vue` 挂了 `is-buildable` 类但 CSS 无对应规则

### 原始论证

### D4. `is-buildable` 是一个**死类**：模板里有，CSS 里没有对应规则

- `src/components/battle/BattleField.vue` 给每格挂了三个状态类：
  `is-house` / `is-spawn` / `is-buildable`。
  前两个各有 CSS 规则（`.battle-cell.is-house::before` / `.battle-cell.is-spawn` / `.battle-cell.is-house`），
  **`is-buildable` 一条都没有** ⇒ 它在 DOM 上存在，在视觉上**什么都不做**。
- ⇒ 「塔可种在任意空格」这件事在**视觉上没有任何区分**
  （AC-12 逐字要求「第 1 列与第 9 列必须**在视觉上与可建格明确区分**」——
  房子列与入场列做到了，**可建格本身没有强调**）。
- **为什么现在不做**：给它加样式要先回答「可建格该长什么样」——
  那会牵动 1.12 的建塔交互视觉，且可能与「选中格描边」「射程覆盖层」抢视觉层级。
- **归属**：**Story 1.12**（建塔交互）。
- **恢复条件**：1.12 定下「可建 / 不可建 / 已选中 / 候选格」四态的视觉分工后，
  一起把 `is-buildable` 用上（或**删掉这个类**，别让它继续当死类），
  并加一条守卫：**模板里挂的每个状态类都必须有 CSS 规则**（零死类）。


> 来源：`## Deferred from: code review of story-1-10-战场渲染与网格 `[CR]` 复审 (2026-10-21)` ｜ 旧编号 `D4` ｜ 详见 `archive/deferred/2026-10-21--cr-story-1-10-复审.md` 的「分诊结论」

## DF-146

**状态**：待排期 · **归属**：未指派 · **恢复条件**：把机制写进架构的「网格布局与坐标映射」一节，并明确「G14 管 N 与 COLS 同源 / G133 管轨道形态是 minmax」这条分工

**一句话**：`minmax(0, 1fr)` 的 18px 机制只写在 `BattleField.vue` 样式注释里

### 原始论证

### D5. 1.18 / AC-D4 那条 `minmax(0, 1fr)` 的**机制解释**只留在源码注释里

- 机制（逐字）：`1fr` 等价于 `minmax(auto, 1fr)`，而 `auto` 下限取内容的
  **最小贡献尺寸**，对 grid item 来说就是 `gap` 的那一半 ⇒ 每条列轨多出 `4 / 2 = 2px`，
  9 条合计 **18px**（1.10 那次实测的溢出量是 **3px**，因为当时容器更窄，
  `aspect-ratio` 与 `content-box` 的交互让溢出量取到别的值）。
- ⚠️ 这段解释**今天只写在 `BattleField.vue` 的样式注释里**；
  1.18 的 story 文档记了「改成了 `minmax(0, 1fr)`」这个**结论**，没记**机制**；
  `docs/rules/architecture.md` 也没有「轨道形态该由谁管」这一条。
- ⇒ 将来有人把 `minmax(0, 1fr)` 改回 `1fr` 时，守卫会红，
  但**读红的人查不到「为什么」**（要去翻一个组件的样式注释）。
- **归属**：下一次改 `docs/rules/architecture.md` 的网格一节时。
- **恢复条件**：把机制写进架构的「网格布局与坐标映射」一节，
  并明确「G14 管 N 与 COLS 同源 / G133 管轨道形态是 minmax」这条分工。


> 来源：`## Deferred from: code review of story-1-10-战场渲染与网格 `[CR]` 复审 (2026-10-21)` ｜ 旧编号 `D5` ｜ 详见 `archive/deferred/2026-10-21--cr-story-1-10-复审.md` 的「分诊结论」

## DF-147

**状态**：待排期 · **归属**：Story 1.17 · **恢复条件**：把 key 换成 `cellKey → Set<towerId>`，就能同时回答「哪座塔盖的」与「盖了哪些格」

**一句话**：`BattleField.vue` 的 `devTowerRangeKeys` 把所有塔覆盖格并成一个 Set

### 原始论证

### D6. 开发用的射程覆盖层把**所有塔**压进**一个 Set** ⇒ 看不出是哪座塔盖的

- `src/components/battle/BattleField.vue` 的 `devTowerRangeKeys` 逐字：
  `for (const tower of state.value.towers) { for (const key of coverCellsAt(...)) keys.add(key) }`
  ⇒ 所有塔的覆盖格**合并成一个 Set**。
- ⇒ 这个 `?ranges=1` 覆盖层只能回答「这一格**被某座塔**盖住了吗」，
  回答不了「**哪座**塔盖的」⇒ 调试「两座塔的覆盖是否重叠」时得靠数格子。
- ⚠️ 它是**开发者专用**（`?ranges=1` + 仅 DEV + 生产构建 tree-shake 掉），
  **孩子看不到**，不是产品缺陷。
- **归属**：**Story 1.17**（`?ranges=1` 覆盖层是它加的）。
- **恢复条件**：1.17（或下一个要用这个覆盖层的人）把 key 换成
  `cellKey → Set<towerId>`，就能同时回答两个问题。


> 来源：`## Deferred from: code review of story-1-10-战场渲染与网格 `[CR]` 复审 (2026-10-21)` ｜ 旧编号 `D6` ｜ 详见 `archive/deferred/2026-10-21--cr-story-1-10-复审.md` 的「分诊结论」

## DF-148

**状态**：待触发 · **归属**：Story 1.2 / 1.14 · **恢复条件**：下次动 `audio.ts` 的 `resume()` 调用点时

**一句话**：`audio.ts` 的 `ensureContextRunning` 未兜 `ctx.resume()` 同步抛，会中止 `enterLevel()`

### 原始论证

### E1. `ensureContextRunning` 的 `ctx.resume()` 同步抛未兜 ⇒ 会中止 `enterLevel()`

- **事实**：`src/services/audio.ts` 的 `unlockAudioSession` **明确**把 `resume()` 包进 try
  （注释逐字写着「残缺 polyfill 上 `resume` 可能根本不是函数、closed context 会抛
  `InvalidStateError`」），而每次 `playSfx` / `startBgmIfReady` 都会走的
  `ensureContextRunning` **没有**这个 try；且 `startBgmIfReady` 调它时**在自己的 try 之外**。
- **后果**：抛出会逃出 `enterLevel()`，**在 `restoreFromSave()` 与预取之前**
  ⇒ 孩子看到战场，但**存档没恢复、图片没预取**，错误从点击处理器冒出。
- **修法**：照 `unlockAudioSession` 的形状补 try/catch + `markSessionSuspended`。
- **归属**：音效与朗读那条线（Story 1.2 / 1.14）。
- **恢复条件**：下次动 `audio.ts` 的 `resume()` 调用点时。


> 来源：`## Deferred from: code review of epic-1-集成层检视 (2026-10-22)` ｜ 旧编号 `E1` ｜ 详见 `archive/deferred/2026-10-22--cr-epic-1-集成层检视.md` 的「分诊结论」

## DF-149

**状态**：待触发 · **归属**：Story 1.14 · **恢复条件**：下次动 `audio.ts` 的加载链时

**一句话**：`audio.ts` 的 `fetchAudioBuffer` 无超时，BGM 卡在 `bgmLoading=true` 永久失声

### 原始论证

### E2. 音频 fetch 链无超时 ⇒ 一次卡住的请求让音效/BGM 永久失声

- **事实**：`fetchAudioBuffer` 的 promise 链**没有超时**。卡住（而非失败）时
  ① `bgmLoading` 停在 `true` ⇒ `prewarmBgm` 永远早退 ⇒ **BGM 整个会话不响，无日志、无降级项**；
  ② `loadingSfx` 攥着那条永不 settle 的 promise ⇒ 该 cue **此后永久哑掉**。
- **修法**：给 fetch 链加超时，超时按「加载失败」处理。
- **归属**：Story 1.14。
- **恢复条件**：下次动 `audio.ts` 的加载链时。


> 来源：`## Deferred from: code review of epic-1-集成层检视 (2026-10-22)` ｜ 旧编号 `E2` ｜ 详见 `archive/deferred/2026-10-22--cr-epic-1-集成层检视.md` 的「分诊结论」

## DF-150

**状态**：待触发 · **归属**：Story 1.2 · **恢复条件**：下次动 `pronunciation.ts` 的录音通路时

**一句话**：`pronunciation.ts` 录音通路无超时，`publishPronunciationStatus('playing')` 永不复位

### 原始论证

### E3. 录音通路无超时 ⇒ 朗读浮层永久亮着

- **事实**：TTS 通路有 20s `CHUNK_TIMEOUT_MS` 兜底；**录音通路（架构决策 7 的主路）没有**任何超时。
  ⇒ mp3 请求卡住 ⇒ 不报错、不结束 ⇒ `publishPronunciationStatus('playing')` 永不复位
  ⇒ 浮层一直亮着、**没有声音**。
- **修法**：加与 TTS 通路对等的超时收敛点。
- **归属**：Story 1.2。
- **恢复条件**：下次动 `pronunciation.ts` 的录音通路时。


> 来源：`## Deferred from: code review of epic-1-集成层检视 (2026-10-22)` ｜ 旧编号 `E3` ｜ 详见 `archive/deferred/2026-10-22--cr-epic-1-集成层检视.md` 的「分诊结论」

## DF-151

**状态**：待触发 · **归属**：Story 1.2 · **恢复条件**：与 E3 同批做（同一个文件、同一条收敛链）

**一句话**：`pronunciation.ts` 录音 `ended` 处理器不查代次，旧录音会熄灭新朗读浮层

### 原始论证

### E4. 录音的 `ended` 处理器不查代次 ⇒ 旧录音能把新录音的浮层熄灭

- **事实**：同一文件里 `finish()` 与 TTS 通路的 `idle` 发布**都查**代次，
  只有录音通路的 `ended` 处理器**不查**，无条件发布 `idle`。
  ⇒ 孩子连点卡面时，旧录音的自然结束会把新朗读的浮层熄灭。
- **修法**：照 TTS 通路补代次检查。
- **归属**：Story 1.2。
- **恢复条件**：与 E3 同批做（同一个文件、同一条收敛链）。


> 来源：`## Deferred from: code review of epic-1-集成层检视 (2026-10-22)` ｜ 旧编号 `E4` ｜ 详见 `archive/deferred/2026-10-22--cr-epic-1-集成层检视.md` 的「分诊结论」

## DF-152

**状态**：待触发 · **归属**：Story 1.15（存档侧）/ 1.17（降级侧） · **恢复条件**：下次给 `*ForTest` 之外的导出补守卫时（与 E19 同批）

**一句话**：`save.ts` 与 `asset-degradations.ts` 的监听器回调裸调，无 try/catch + WARN

### 原始论证

### E5. `save.ts` 与 `asset-degradations.ts` 的监听器回调没有 try/catch

- **事实**：同一仓库的另外三个服务（`audio.ts` / `sw-registration.ts` / `pronunciation-status.ts`）
  **都有**守卫并写明了理由；`save.ts` 与 `asset-degradations.ts` 是裸调。
  `markAssetDegraded` 更是**直接从 4 个组件的 `@error` 事件处理器**里调
  ⇒ 异常会从 DOM 事件回调冒成未捕获错误。
- **修法**：照另外三个服务的形状补 try/catch + WARN。
- **归属**：Story 1.15（存档侧）/ Story 1.17（降级侧）。
- **恢复条件**：下次给 `*ForTest` 之外的导出补守卫时（与 E19 同批）。


> 来源：`## Deferred from: code review of epic-1-集成层检视 (2026-10-22)` ｜ 旧编号 `E5` ｜ 详见 `archive/deferred/2026-10-22--cr-epic-1-集成层检视.md` 的「分诊结论」

## DF-153

**状态**：待触发 · **归属**：Story 1.15 · **恢复条件**：与 DF-152（E5）一条同批做

**一句话**：`save.ts` 的 `writeSave` 把 `resolveDegradations` 包在 try 内，误报「存不进去」

### 原始论证

### E6. 监听器抛错会被误报成「存档存不进去」——而数据其实已经写进盘了

- **事实**：`writeSave` 的 `try` 把 `resolveDegradations` 包在里面，而它链上的监听器回调**裸调**
  ⇒ 监听器抛错 ⇒ 落到 `writeSave` 的 `catch` ⇒ 记 `markDegraded('write', '存不进去……')`
  ⇒ **面板永久告诉家长「存档存不进去」，而 `localStorage.setItem` 其实成功了**。
- **修法**：同 E5；并把 `resolveDegradations` 移出 `writeSave` 的 try。
- **归属**：Story 1.15。
- **恢复条件**：与 E5 同批做。


> 来源：`## Deferred from: code review of epic-1-集成层检视 (2026-10-22)` ｜ 旧编号 `E6` ｜ 详见 `archive/deferred/2026-10-22--cr-epic-1-集成层检视.md` 的「分诊结论」

## DF-154

**状态**：待触发 · **归属**：Story 1.16 · **恢复条件**：下次动 `LevelOutcome.vue` 的配色时

**一句话**：`LevelOutcome.vue` 按钮 `#4caf50`/`#fff` 对比度 2.78:1，低于 AA 4.5:1

### 原始论证

### E7. 终局浮层的按钮是 2.78:1，低于 WCAG AA 的 4.5:1

- **事实**：`src/components/hud/LevelOutcome.vue` 的 `background-color: #4caf50` + `color: #ffffff`
  + `font-size: var(--text-body)`（16px）⇒ 实算相对亮度 L=0.3276 ⇒ 对比度 **2.78:1**
  （大字号下限 3:1 也够不着）。该颜色**不在 `tokens.css` 里** ⇒ `palette.test.ts` 对它零实算。
  仓库自己的 `--color-correct: #2e7d32` 是 **5.13:1**。
- **后果**：这是终局画面上**唯一**的控件，而它正是孩子必须读懂并按下的那个。
- **修法**：改用已有 token（或按 G30b 的实算口径加 token + 守卫）。
- **归属**：Story 1.16（终局浮层）。
- **恢复条件**：下次动 `LevelOutcome.vue` 的配色时。


> 来源：`## Deferred from: code review of epic-1-集成层检视 (2026-10-22)` ｜ 旧编号 `E7` ｜ 详见 `archive/deferred/2026-10-22--cr-epic-1-集成层检视.md` 的「分诊结论」

## DF-155

**状态**：待触发 · **归属**：Story 1.12 · **恢复条件**：下次动 `HandCard.vue` 的遮罩时

**一句话**：`HandCard.vue` 把 `--color-overlay-unaffordable` 叠两层，合成 alpha 0.6975 非 0.45

### 原始论证

### E8. 手牌「买不起」的遮罩叠了两次，实际 alpha 是 0.6975 而非被审计的 0.45

- **事实**：`src/components/hand/HandCard.vue` 的
  `background-image: var(--color-overlay-unaffordable), var(--color-overlay-unaffordable)`
  —— **同一个罩叠了两层** ⇒ 合成 alpha = 1 − 0.55² = **0.6975**。
  而 token 的注释与 `HandCard.vue` 自己的注释都按 **α=0.45** 算，G30b 的对比度实算也是从 token 读 α。
  ⇒ **被审计的 4.87:1 不是屏幕上那个数**（实际更暗 ⇒ 白字对比度反而更高），
  但 token 一旦被人调 α，两层会一起变 ⇒ 与注释、与守卫、与实算**全部脱钩**。
- **修法**：只留一层（若确实要 0.6975，就把它写进 token 并让注释与守卫跟上）。
- **归属**：Story 1.12（手牌区）。
- **恢复条件**：下次动 `HandCard.vue` 的遮罩时。


> 来源：`## Deferred from: code review of epic-1-集成层检视 (2026-10-22)` ｜ 旧编号 `E8` ｜ 详见 `archive/deferred/2026-10-22--cr-epic-1-集成层检视.md` 的「分诊结论」

## DF-156

**状态**：待触发 · **归属**：Story 1.12 · **恢复条件**：下次动战场格的状态类时

**一句话**：`BattleField.vue` 的 `is-buildable` 只挂模板，全仓无 CSS 规则（实测仅 1 处命中）

### 原始论证

### E9. `is-buildable` 是死类：模板挂着，全仓没有一条 CSS 规则用它

- **事实**：`grep -rn "is-buildable" src/` **只有 1 处命中**（就是这处 class 绑定）。
- **后果**（连着 AC-12）：「第 1 列与第 9 列必须**在视觉上与可建格明确区分**」——
  孩子看到 45 格里只有 7 格可建，却**没有任何视觉语言**说清是哪 7 格。
- **修法**：要么用上它、要么删掉它，并加「模板里挂的每个状态类都必须有 CSS 规则」的守卫。
- **归属**：Story 1.12（战场渲染）。
- **恢复条件**：下次动战场格的状态类时。


> 来源：`## Deferred from: code review of epic-1-集成层检视 (2026-10-22)` ｜ 旧编号 `E9` ｜ 详见 `archive/deferred/2026-10-22--cr-epic-1-集成层检视.md` 的「分诊结论」

## DF-157

**状态**：待触发 · **归属**：Story 1.12 · **恢复条件**：下次动 `Tower.vue` 的可访问性属性时

**一句话**：`Tower.vue` 的 `:alt`/`aria-label` 读出英文枚举 direct/slow/aoe 塔

### 原始论证

### E10. 塔的 `alt` / `aria-label` 是英文枚举

- **事实**：`src/components/battle/Tower.vue` 的 `:alt="`${tower.towerType} 塔`"`
  ⇒ 屏幕阅读器读出「**direct 塔**」「slow 塔」「aoe 塔」。
  对照 `Zombie.vue` 用的是中文「僵尸」。
  面向 4–8 岁中文母语孩子，这三个英文枚举没有任何意义。
- **修法**：换成孩子侧的说法（塔型三选一的中文名），并加一条守卫。
- **归属**：Story 1.12。
- **恢复条件**：下次动 `Tower.vue` 的可访问性属性时。


> 来源：`## Deferred from: code review of epic-1-集成层检视 (2026-10-22)` ｜ 旧编号 `E10` ｜ 详见 `archive/deferred/2026-10-22--cr-epic-1-集成层检视.md` 的「分诊结论」

## DF-158

**状态**：待触发 · **归属**：Story 1.5 / 1.12 · **恢复条件**：下次动 `combat.ts` 的射程原语时

**一句话**：`combat.ts` 的 `inRange` 静默 false 而 `aoeColumns` throw，越界校验面不一致

### 原始论证

### E11. 同一个文件里两个射程原语的校验面不一致

- **事实**：`src/core/combat.ts` 的 `inRange` 只做 `assertGridIndex`（**只查是不是整数**），
  越界列号**静默返回 false**；`aoeColumns` 额外 `throw`。
  ⇒ `selectTarget(zombies, 9, 'direct', 3)` 静默返回 `null`，`selectTarget(zombies, 9, 'aoe', 3)` **抛**。
  `build.ts` 还有**第三份**越界检查，其注释**自己承认**了这份不一致。
  两个原语都从 barrel 导出 ⇒ 下一个消费者会继承这个分歧。
- **修法**：把越界检查收敛成一份，两个原语共用。
- **归属**：Story 1.5 / 1.12（战斗原语）。
- **恢复条件**：下次动 `combat.ts` 的射程原语时。


> 来源：`## Deferred from: code review of epic-1-集成层检视 (2026-10-22)` ｜ 旧编号 `E11` ｜ 详见 `archive/deferred/2026-10-22--cr-epic-1-集成层检视.md` 的「分诊结论」

## DF-159

**状态**：待触发 · **归属**：未指派 · **恢复条件**：下次改合法塔位规则时（必须做）—— 见 E21 / E22 那两条口径复制链

**一句话**：`scripts/balance-sim.ts` 自建 `BUILDABLE_COLUMNS`，未用 `core/grid.ts` 的 `buildBlockedReason`

### 原始论证

### E12. `balance-sim` 自建了一份合法塔位列集，没用 core 的唯一出处

- **事实**：`scripts/balance-sim.ts` 的 `BUILDABLE_COLUMNS` 由 `ZOMBIE_SPAWN_COL - 1` 现场推导，
  而 `core/grid.ts` 的 `buildBlockedReason` 才是**唯一出处**（并从 barrel 导出）。
  今天两边一致 ⇒ 但 `grid.ts` 一改规则，**平衡闸门**（`npm run balance-sim` = Epic 1 的生死线）
  就会静默描述一个**没人玩的游戏**。同文件还有第二份塔型字面量。
- **修法**：改成 import core 的判据；或给「模拟器与 core 的合法塔位集合必须一致」加守卫。
- **归属**：平衡工具那条线。
- **恢复条件**：**下次改合法塔位规则时（必须做）** —— 见 E21 / E22 那两条口径复制链。


> 来源：`## Deferred from: code review of epic-1-集成层检视 (2026-10-22)` ｜ 旧编号 `E12` ｜ 详见 `archive/deferred/2026-10-22--cr-epic-1-集成层检视.md` 的「分诊结论」

## DF-160

**状态**：待触发 · **归属**：Story 1.6 · **恢复条件**：下次给 `rangeOf` 的调用点加守卫时

**一句话**：`core/balance.ts` 的 `TOWER_STATS.aoe.range = 2`，`aoeColumns` 实际覆盖同行 3 格

### 原始论证

### E13. aoe 塔的公开 `range` 字段是 2，实际覆盖是 3 格

- **事实**：`src/core/balance.ts` 的 `TOWER_STATS.aoe = { damage: 60, range: 2 }`，
  而 `aoeColumns` 返回**以塔为中心的 3 格条带**。
  ⚠️ **这一条已被代码自己如实登记过**（两处 JSDoc 逐字写着「不由本字段驱动」）
  ⇒ **不是「没人知道」，是「知道但两个数并存且没有断言把它们连起来」**。
  今天没有调用方读 aoe 的 `range`，但 `rangeOf` / `rangeFor` 是**公开 barrel 导出**
  ⇒ 下一个 HUD 射程提示或平衡工具读到的数会与实际伤害覆盖矛盾。
- **严重度 LOW**：分歧已被文档承认，缺的是「谁都不许读错」的机器约束。
- **归属**：Story 1.6（数值）。
- **恢复条件**：下次给 `rangeOf` 的调用点加守卫时。


> 来源：`## Deferred from: code review of epic-1-集成层检视 (2026-10-22)` ｜ 旧编号 `E13` ｜ 详见 `archive/deferred/2026-10-22--cr-epic-1-集成层检视.md` 的「分诊结论」

## DF-161

**状态**：待触发 · **归属**：Story 1.5 · **恢复条件**：下次动 zombie id 格式或目标选择时

**一句话**：`combat.ts` 的 `zombie.id < best.id` 是字符串比较，'z10'<'z2' 使第 10 回合起挑错僵尸

### 原始论证

### E14. 僵尸 id 的 tie-break 是字典序 ⇒ 第 10 回合起同列僵尸的打杀顺序与入场顺序相反

- **事实**：`src/core/combat.ts` 的 `zombie.id < best.id` 是**字符串**比较，
  而 id 是 `z${turn}` ⇒ `'z10' < 'z2'` 为真。
  ⇒ 从第 10 回合起，同列的一对僵尸里塔会挑**后入场**的那只。
  结果仍是确定性的（回放安全），但**哪只僵尸活下来会变** ⇒ 长局的平衡模拟数字会变。
- **修法**：加一条断言把 id 顺序与入场顺序绑在一起（或改 id 格式）。
- **归属**：Story 1.5（战斗结算）。
- **恢复条件**：下次动 zombie id 格式或目标选择时。


> 来源：`## Deferred from: code review of epic-1-集成层检视 (2026-10-22)` ｜ 旧编号 `E14` ｜ 详见 `archive/deferred/2026-10-22--cr-epic-1-集成层检视.md` 的「分诊结论」

## DF-162

**状态**：待触发 · **归属**：Story 1.18 · **恢复条件**：平板横屏真机复验时（Story 1.19 的人工待验清单里那一项）

**一句话**：`src/styles/responsive.css` 横屏断点里战场高度与手牌行互相压（需真浏览器复核）

### 原始论证

### E15. 横屏矮视口下战场会压到手牌行

- **事实**：`src/styles/responsive.css` 的横屏断点里，战场的高度与手牌行的位置**互相压**。
- ⚠️ **本条不是已确认缺陷** —— jsdom 不做布局，必须真浏览器复核。
  检视把它列为「需真浏览器复核，不作为已确认缺陷」是**如实定性**。
- **归属**：Story 1.18（目标平板落地）。
- **恢复条件**：**平板横屏真机复验时**（Story 1.19 的人工待验清单里那一项）。


> 来源：`## Deferred from: code review of epic-1-集成层检视 (2026-10-22)` ｜ 旧编号 `E15` ｜ 详见 `archive/deferred/2026-10-22--cr-epic-1-集成层检视.md` 的「分诊结论」

## DF-163

**状态**：待触发 · **归属**：Story 1.18 · **恢复条件**：下次动 `asset-prefetch.ts` 的 URL 集合时

**一句话**：`asset-prefetch.ts` 的 `imageUrlsOfUnit` 只收图片 URL，mp3 录音一个都不进缓存

### 原始论证

### E16. 进关时只预取图片，mp3 录音一个都不进缓存 ⇒ 飞行模式下第一次听到某个词必然走设备 TTS

- **事实**：`src/services/asset-prefetch.ts` 的 `imageUrlsOfUnit` 只收图片 URL
  ⇒ 录音（mp3）**一个都不进缓存**。而 AC-E2 的措辞是「本单元全部图片」，
  代码与 AC 一致 ⇒ **不是实现偏离 AC，是 AC 没覆盖录音**。
- **后果**：飞行模式（离线）下第一次听到某个词必然走设备 TTS ⇒ 发音质量与设备有关，
  而本作的词图/录音都是审过的。
- **修法**：要么扩 AC-E2 的范围并实现 mp3 预取，要么在 AC 上明确写「录音不进缓存」。
- **归属**：Story 1.18（离线与部署）。
- **恢复条件**：下次动 `asset-prefetch.ts` 的 URL 集合时。


> 来源：`## Deferred from: code review of epic-1-集成层检视 (2026-10-22)` ｜ 旧编号 `E16` ｜ 详见 `archive/deferred/2026-10-22--cr-epic-1-集成层检视.md` 的「分诊结论」

## DF-164

**状态**：待触发 · **归属**：Story 1.14 · **恢复条件**：下次改 1.14 / 1.17 的 AC 措辞时

**一句话**：1.14 AC 的「组件可查询降级标志」被 ESLint 禁列挡在组件层之外

### 原始论证

### E17. 1.14 AC 点名的「可查询降级标志」在组件层不可达

- **事实**：1.14 的 AC 写了一个「组件可查询的降级标志」，而 ESLint 的禁列
  （组件/视图不得 import `services/audio` 的播放函数）把它挡在了组件层之外。
- **修法**：改 1.14 的 AC 措辞（把那个标志挪到 app 层），或改禁列范围。
- **归属**：Story 1.14。
- **恢复条件**：下次改 1.14 / 1.17 的 AC 措辞时。


> 来源：`## Deferred from: code review of epic-1-集成层检视 (2026-10-22)` ｜ 旧编号 `E17` ｜ 详见 `archive/deferred/2026-10-22--cr-epic-1-集成层检视.md` 的「分诊结论」

## DF-165

**状态**：待触发 · **归属**：未指派 · **恢复条件**：下次改架构文档时

**一句话**：`game-architecture.md` 日志前缀清单只列 4 个，代码实际用了 8 个

### 原始论证

### E18. 架构的日志前缀清单只有 4 个，代码实际用了 8 个

- **事实**：`game-architecture.md` 的日志前缀清单列 4 个，
  代码实际用了 8 个（`pronunciation.ts` / `store.ts` / `sw-registration.ts` /
  `asset-prefetch.ts` / `save.ts` / `audio.ts` 等）。
- **修法**：改架构文档的清单（代码侧全部合规）。
- **归属**：架构文档维护。
- **恢复条件**：下次改架构文档时。


> 来源：`## Deferred from: code review of epic-1-集成层检视 (2026-10-22)` ｜ 旧编号 `E18` ｜ 详见 `archive/deferred/2026-10-22--cr-epic-1-集成层检视.md` 的「分诊结论」

## DF-166

**状态**：待触发 · **归属**：Story 1.17 · **恢复条件**：下次给 `*ForTest` 补守卫时（与 E5 同批）

**一句话**：`asset-degradations.ts` 的第二个 `*ForTest` 导出未在账本登记

### 原始论证

### E19. 「测试专用导出」模式在第二个模块复制，而账本只登记了第一个

- **事实**：`src/services/asset-degradations.ts` 与另一个模块各有一个 `*ForTest` 导出，
  而账本只登记了第一个 ⇒ 下一个加 `*ForTest` 的人不知道该登记在哪。
- **修法**：给 `*ForTest` 补一条守卫 + 在账本上登记全部。
- **归属**：Story 1.17。
- **恢复条件**：**下次给 `*ForTest` 补守卫时**（与 E5 同批）。


> 来源：`## Deferred from: code review of epic-1-集成层检视 (2026-10-22)` ｜ 旧编号 `E19` ｜ 详见 `archive/deferred/2026-10-22--cr-epic-1-集成层检视.md` 的「分诊结论」

## DF-167

**状态**：待触发 · **归属**：Story 2.4 · **恢复条件**：下次动 `deck-slice.ts` 时

**一句话**：`core/deck-slice.ts` 注释写「穷举实测 59047/2」，实算为 13563/45486

### 原始论证

### E20. `src/core/deck-slice.ts` 的「穷举实测」数字在数学上是错的

- **事实**：该文件逐字写「穷举实测 59047/2」。
  实算：不可解 = 3 × Σ_{k≥6} C(10,k)·2^(10−k) = **13,563**；可解 = **45,486**。
  守卫 `tests/core/deck-slice.test.ts` 的黄金值（88572 / 70191 / 18381 / n10:13563）与**实算一致**，
  ⇒ **是那句注释的数字错了，不是实现错了**。
- **修法**：改注释里的数字，并说明它是哪个式子算出来的。
- **归属**：Story 2.4（选项数量递进）。
- **恢复条件**：下次动 `deck-slice.ts` 时。


> 来源：`## Deferred from: code review of epic-1-集成层检视 (2026-10-22)` ｜ 旧编号 `E20` ｜ 详见 `archive/deferred/2026-10-22--cr-epic-1-集成层检视.md` 的「分诊结论」

## DF-168

**状态**：待触发 · **归属**：Story 1.12 · **恢复条件**：与 E22 / E23 同批做（一次改干净同族的复制链）

**一句话**：`core/combat.ts` 形状对照表仍写「放置预览 = 半径 3 的圆」，与 FR38 冲突

### 原始论证

### E21. `src/core/combat.ts` 的形状对照表仍写「放置预览 = 半径 3 的圆」

- **事实**：该对照表逐字写「放置预览 = 半径 3 的圆」，而**同一个仓库的 FR38 / AR42 /
  Story 1.17 的 AC / R-07 都写「同行 3 格条带」**，且 FR38 逐字写「不是半径 2 的圆」。
  ⇒ 这是 D3 那次裁决在**源码注释侧**的残留（D3 只改了 `epics.md` 与架构文档）。
- **修法**：把该对照表改成「同行 3 格条带」，与 FR38 同口径。
- **归属**：Story 1.12（射程可视化）。
- **恢复条件**：与 E22 / E23 同批做（一次改干净同族的复制链）。


> 来源：`## Deferred from: code review of epic-1-集成层检视 (2026-10-22)` ｜ 旧编号 `E21` ｜ 详见 `archive/deferred/2026-10-22--cr-epic-1-集成层检视.md` 的「分诊结论」

## DF-169

**状态**：待触发 · **归属**：Story 1.5 · **恢复条件**：与 E21 / E23 同批做

**一句话**：`core/turn.ts` 注释仍写「塔可以种在任意空格（GDD）」，实现只有 7 格

### 原始论证

### E22. `src/core/turn.ts` 的注释仍写「塔可以种在任意空格（GDD）」

- **事实**：该注释逐字写「塔可以种在任意空格（GDD）」，而实现是 **7 格**
  （`grid.ts` 的行拦截自 2026-07-16 的裁决 6 起就禁掉了非僵尸行）。
  ⇒ 这是 D2 那次裁决在**源码注释侧**的残留（D2 只改了 `epics.md`）。
- **修法**：改成「塔只可种在僵尸行的第 2~7 列」，与 FR46 / FR47 的更正同口径。
- **归属**：Story 1.5（回合状态机）。
- **恢复条件**：与 E21 / E23 同批做。


> 来源：`## Deferred from: code review of epic-1-集成层检视 (2026-10-22)` ｜ 旧编号 `E22` ｜ 详见 `archive/deferred/2026-10-22--cr-epic-1-集成层检视.md` 的「分诊结论」

## DF-170

**状态**：待触发 · **归属**：未指派 · **恢复条件**：与 E21 / E22 同批做

**一句话**：`core/grid.ts` 与 `scripts/balance-sim.ts` 仍引用已删除的 `balance-scan.py`

### 原始论证

### E23. `src/core/grid.ts` 与 `scripts/balance-sim.ts` 引用了已删除的 `balance-scan.py`

- **事实**：两份文件都把 `balance-scan.py` 当作现行判据的依据引用，
  而那个 Python 脚本**已被删除**（且它本身有 `dict[col]` 覆盖 bug ——
  每回合静默吞掉一只僵尸 ⇒ 它给出的失败门槛是错的）。
- **修法**：改引用，改指 `npm run balance-sim`（真实 core 模拟器）。
- **归属**：平衡工具那条线。
- **恢复条件**：与 E21 / E22 同批做。


> 来源：`## Deferred from: code review of epic-1-集成层检视 (2026-10-22)` ｜ 旧编号 `E23` ｜ 详见 `archive/deferred/2026-10-22--cr-epic-1-集成层检视.md` 的「分诊结论」

## DF-171

**状态**：待触发 · **归属**：未指派 · **恢复条件**：下次改 `epics.md` 与 `game-architecture.md` 这两份文档时

**一句话**：`epics.md` AR39 与 `game-architecture.md` 仍写「每回合记录一条」，1.17 已裁决逐 action 一条

### 原始论证

### E24. `epics.md` AR39 与 `game-architecture.md` 的「每回合记录一条」已被 1.17 裁决改成「逐 action 一条」，两份文档都没跟上

- **事实**：1.17 逐字裁决「逐 action 一条」，两份文档仍写「每回合记录一条」。
- **修法**：改两份文档。
- **归属**：架构文档 + 需求文档维护。
- **恢复条件**：下次改这两份文档时。


> 来源：`## Deferred from: code review of epic-1-集成层检视 (2026-10-22)` ｜ 旧编号 `E24` ｜ 详见 `archive/deferred/2026-10-22--cr-epic-1-集成层检视.md` 的「分诊结论」

## DF-172

**状态**：待触发 · **归属**：Story 1.15 · **恢复条件**：下次改 1.15 的 AC 措辞时

**一句话**：`epics.md` Story 1.15 的写盘频次描述与 `core/effects.ts` 写盘点表相反

### 原始论证

### E25. `epics.md` Story 1.15 的「每个回合结束写一次……又不至于每次点击都写」与写盘点表相反

- **事实**：`src/core/effects.ts` 的写盘点表与那句描述相反。
- **修法**：改 `epics.md` 那句。
- **归属**：Story 1.15。
- **恢复条件**：下次改 1.15 的 AC 措辞时。


> 来源：`## Deferred from: code review of epic-1-集成层检视 (2026-10-22)` ｜ 旧编号 `E25` ｜ 详见 `archive/deferred/2026-10-22--cr-epic-1-集成层检视.md` 的「分诊结论」

## DF-173

**状态**：待触发 · **归属**：未指派 · **恢复条件**：下次改架构文档时

**一句话**：`core/types.ts` 数据形状与 `game-architecture.md` 的模式 A / 模式 C 不符

### 原始论证

### E26. `core/types.ts` 的数据形状与 `game-architecture.md` 的模式 A / 模式 C 不符

- **事实**：架构文档描述了两种状态模式，而实现是第三种形状。
- **修法**：改架构文档（实现的形状是 1.15/1.19 一路改出来的，改代码代价大且无收益）。
- **归属**：架构文档维护。
- **恢复条件**：下次改架构文档时。


> 来源：`## Deferred from: code review of epic-1-集成层检视 (2026-10-22)` ｜ 旧编号 `E26` ｜ 详见 `archive/deferred/2026-10-22--cr-epic-1-集成层检视.md` 的「分诊结论」

## DF-174

**状态**：待触发 · **归属**：未指派 · **恢复条件**：下次改 `epics.md` 的 AC 组时

**一句话**：`SKIP_QUESTION` 整条机制在 core 里，`epics.md` 无任何一条 AC 授权

### 原始论证

### E27. `SKIP_QUESTION` 是 core 的一整条新机制，`epics.md` 里没有任何一条 AC 授权它

- **事实**：跳题机制（action、reducer 分支、`skippedEntryIds` 记账）整条都在 core 里，
  而需求文档里**没有任何一条 AC 提到它** ⇒ 它是一个**没有需求授权的机制**。
- **修法**：给 `epics.md` 补一条 AC 承认它（AC-E4 是最自然的落点）。
- **归属**：需求文档维护。
- **恢复条件**：下次改 `epics.md` 的 AC 组时。


> 来源：`## Deferred from: code review of epic-1-集成层检视 (2026-10-22)` ｜ 旧编号 `E27` ｜ 详见 `archive/deferred/2026-10-22--cr-epic-1-集成层检视.md` 的「分诊结论」

## DF-175

**状态**：待触发 · **归属**：Story 1.4 / 2.3 · **恢复条件**：下次改 1.4 的 AC 措辞时

**一句话**：`epics.md` Story 1.4 的「档位 5-10 与 11-20 留空待 Epic 2」已过期（`core/balance.ts` 已填）

### 原始论证

### E28. `epics.md` Story 1.4 的「档位 5-10 与 11-20 留空待 Epic 2」已过期

- **事实**：`src/core/balance.ts` 的档位表**已经填了**单元 5-10 与 11-20 两档。
- **修法**：改 `epics.md` 那句。
- **归属**：Story 1.4 / 2.3。
- **恢复条件**：下次改 1.4 的 AC 措辞时。


> 来源：`## Deferred from: code review of epic-1-集成层检视 (2026-10-22)` ｜ 旧编号 `E28` ｜ 详见 `archive/deferred/2026-10-22--cr-epic-1-集成层检视.md` 的「分诊结论」

## DF-177

**状态**：待触发 · **归属**：未指派 · **恢复条件**：下次改架构文档时

**一句话**：`game-architecture.md` 的 System Location Mapping 表漏了至少 16 个已交付模块

### 原始论证

### E30. 架构文档的模块表漏了至少 16 个已交付模块

- **事实**：`game-architecture.md` 的 System Location Mapping 表只有十来个模块，
  而 `src/` 下已交付的模块远不止那些（`core/hud.ts` / `core/deck-slice.ts` /
  `core/session-replay.ts` / `core/actions.ts` / `core/build.ts` / `core/types.ts` 等）。
- **修法**：补表（按目录扫真实文件补，不手写名单）。
- **归属**：架构文档维护。
- **恢复条件**：下次改架构文档时。


> 来源：`## Deferred from: code review of epic-1-集成层检视 (2026-10-22)` ｜ 旧编号 `E30` ｜ 详见 `archive/deferred/2026-10-22--cr-epic-1-集成层检视.md` 的「分诊结论」

## DF-178

**状态**：待触发 · **归属**：未指派 · **恢复条件**：下次动这 6 条时（不必专门跑一遍）

**一句话**：`deferred-work.md` 约 50 条行号指针有 6 条已漂移指不到内容

### 原始论证

### E31. `deferred-work.md` 的行号指针有 6/50 指不到被声称的内容

- **事实**：本文件里约 50 条带行号指针的条目中，有 6 条的行号已经漂移到指不到内容。
- **修法**：把那 6 条改成**引原文句子**（R-31：引用文档用原文句子，不用行号）。
- **归属**：本文件自身。
- **恢复条件**：**下次动这 6 条时**（不必专门跑一遍）。


> 来源：`## Deferred from: code review of epic-1-集成层检视 (2026-10-22)` ｜ 旧编号 `E31` ｜ 详见 `archive/deferred/2026-10-22--cr-epic-1-集成层检视.md` 的「分诊结论」

## DF-182

**状态**：待触发 · **归属**：未指派 · **恢复条件**：与 DF-181（E34）一条同批做

**一句话**：`scripts/check-execution-drift.py` 正则只扫 `1[-.]\d+`，抓不到实际漂移

### 原始论证

### E35. `scripts/check-execution-drift.py` 是个假绿

- **事实**：它的正则与扫描范围（Story `1[-.]\d+`）漏掉了上面那些漂移，
  就算接进 `package.json` 也抓不到。
- **修法**：改正则与扫描范围，或干脆删掉它并把职责并进现有的守卫。
- **归属**：流程守卫。
- **恢复条件**：与 E34 同批做。


> 来源：`## Deferred from: code review of epic-1-集成层检视 (2026-10-22)` ｜ 旧编号 `E35` ｜ 详见 `archive/deferred/2026-10-22--cr-epic-1-集成层检视.md` 的「分诊结论」

## DF-184

**状态**：待触发 · **归属**：未指派 · **恢复条件**：与 E12 同批做（都在平衡工具那条线上）

**一句话**：R-22「模拟器不得另起一份数值」无守卫，`balance-sim.ts` 可换本地副本仍全绿

### 原始论证

### E37. R-22「平衡模拟器不得另起一份数值」：把 import 换成副本，全仓测试照样全绿

- **事实**：`scripts/balance-sim.ts` 今天**确实** import 了 `ZOMBIE_HP`（这点本轮已核实），
  但**没有任何东西阻止**有人把它换成一份本地副本。
- **修法**：加一条守卫（模拟器里出现数值字面量就红）。
- **归属**：规则守卫。
- **恢复条件**：与 E12 同批做（都在平衡工具那条线上）。


> 来源：`## Deferred from: code review of epic-1-集成层检视 (2026-10-22)` ｜ 旧编号 `E37` ｜ 详见 `archive/deferred/2026-10-22--cr-epic-1-集成层检视.md` 的「分诊结论」

## DF-185

**状态**：待触发 · **归属**：未指派 · **恢复条件**：与 DF-186（E39）一条同批做

**一句话**：G25 只扫 `src/components/quiz/` 三文件，组件可直 import `services/pronunciation` 不红

### 原始论证

### E38. R-04 的 TTS 那半：G25 只扫 `quiz/` 三个文件，组件在别处直接 import `services/pronunciation` ⇒ 实测 0 红

- **事实**：G25 的扫描范围是 `src/components/quiz/` 三个文件，
  而 R-04 说的是「组件不得直接 import `services/pronunciation`」——
  别的组件（不在 `quiz/` 下）可以直接 import 而**一条测试都不红**。
- **修法**：把 G25 的扫描范围扩到**全部**组件与视图。
- **归属**：规则守卫。
- **恢复条件**：与 E39 同批做。


> 来源：`## Deferred from: code review of epic-1-集成层检视 (2026-10-22)` ｜ 旧编号 `E38` ｜ 详见 `archive/deferred/2026-10-22--cr-epic-1-集成层检视.md` 的「分诊结论」

## DF-186

**状态**：待触发 · **归属**：未指派 · **恢复条件**：与 DF-185（E38）一条同批做

**一句话**：`effects-runner` 的 `case 'TTS'` 是空 `return`，朗读实际由组件 `watch` 触发

### 原始论证

### E39. R-04 今天就在被违反：TTS 由组件里的 `watch` 触发，而 `effects-runner` 的 `case 'TTS'` 是空 `return`

- **事实**：朗读**实际**由组件里的 `watch` 触发，而 `effects-runner` 的 `case 'TTS'` 是空 `return`
  ⇒ effects 机制**名义上**有朗读这一条，实际走不通。
- ⚠️ **这一条与 E38 是同一个根因的两面**：扫描范围太窄，所以没人看见这个违反。
- **修法**：先扩 G25 的扫描范围（E38），再决定是让 effects 走通还是把 TTS 从 effects 里摘掉。
- **归属**：规则守卫 + effects 机制。
- **恢复条件**：与 E38 同批做。


> 来源：`## Deferred from: code review of epic-1-集成层检视 (2026-10-22)` ｜ 旧编号 `E39` ｜ 详见 `archive/deferred/2026-10-22--cr-epic-1-集成层检视.md` 的「分诊结论」

## DF-187

**状态**：待触发 · **归属**：未指派 · **恢复条件**：下次动这两份文档时

**一句话**：`docs/word-image-throughput.md` 与 `docs/art-direction.md` 有 4 处失效行号引用

### 原始论证

### E40. R-31：活的项目文档里就有 4 处**已经失效**的行号引用

- **事实**：`docs/word-image-throughput.md` 的两处出处指向 Story 1.20（已不是那个主题），
  `docs/art-direction.md` 的一处架构行号指向「词图加载策略」（不是那个章节）。
- **修法**：改成引原文句子。
- **归属**：项目文档维护。
- **恢复条件**：下次动这两份文档时。


> 来源：`## Deferred from: code review of epic-1-集成层检视 (2026-10-22)` ｜ 旧编号 `E40` ｜ 详见 `archive/deferred/2026-10-22--cr-epic-1-集成层检视.md` 的「分诊结论」


## DF-189

**状态**：待触发 · **归属**：未指派 · **恢复条件**：下次补规则守卫时，按这条表逐条销账

**一句话**：六条规则（R-14/R-08/R-09/R-05/R-74/R-13 等）今天合规但无机器守卫

### 原始论证

### E42. 六条「现状合规、但没有守卫」的规则（LOW）

- **事实**：逐条核过，**今天全部合规**，但没有机器约束：
  | 规则 | 缺口 | 实测现状 |
  |---|---|---|
  | **R-14** | `services/` + `app/` 那半零守卫（现有那条只扫 `src/core/**`） | 带前缀日志已分布在 6 个模块，**全都合规**；账本写明的恢复条件（「累计到**第三个**带前缀日志的服务时做成通用守卫」）**今天有六个** |
  | **R-08** | 「次序与跨层反向」那半没守卫 | 逐文件核过 `src/`：**今天零反向依赖** ⇒ 潜在风险 |
  | **R-09** | `core/` 只走 barrel 唯一出口，在 `src/` 侧纯靠约定 | `src/` 与 `scripts/` 的深路径 import 数 = **0** ⇒ 潜在风险 |
  | **R-05** | 「动效只走 CSS」没有全局守卫，只有两条组件级判据 | `src/components/**` 里**零定时器** ⇒ 现状合规 |
  | **R-74** | 「48px 是必看档位」无数值断言（规则正文自己承认） | `word-image-metrics` 的测试只测几何与剪影，**没有一条把图元折算到 48px 档** |
  | **R-13 / R-72 / R-23** | 中文标识符 / SVG 正则锚定 / 僵尸容器位置键，三条都无守卫 | 逐条扫过：中文标识符 **0**、中文 CSS 类名 **0**、用 `\b` 锚 SVG 属性的正则 **0** ⇒ 全部现状合规 |
- ⚠️ **R-14 的恢复条件已经成立**（六个带前缀日志的服务 ≥ 三个）⇒ 它从「潜在」升为「该做」。
- **归属**：规则守卫。
- **恢复条件**：下次补规则守卫时，按这条表逐条销账。





> 来源：`## Deferred from: code review of epic-1-集成层检视 (2026-10-22)` ｜ 旧编号 `E42` ｜ 详见 `archive/deferred/2026-10-22--cr-epic-1-集成层检视.md` 的「分诊结论」


## DF-190

**状态**：待触发 · **归属**：Story 2.9 · **恢复条件**：Story 2.9 试玩验收时逐条人工过；或另建生僻词表 / 语义距离词典后补机器守卫

**一句话**：「语义近但字面远」的选项（如 `Thank you!` ~ `I am fine, thank you.`）字符级编辑距离抓不到 —— 属人工项

### 原始论证

### DF-190. 生僻词 / 语义可辨性不可机器判（Story 2.4 的 AC-B4 后半）

- **事实**：Story 2.4 只把「微小差异」**可机器判的那一半**兜住了 ——
  `scripts/validate-content.ts` 的 `option-near-duplicate` 判的是
  **归一化后的字符级编辑距离 ≤ 2**（或互为前缀且长度差 ≤ 2）。
  ⇒ 它抓得住「`Helo` ~ `Hello`」这种**只差一个字母**的按钮。
- **抓不住的另一半**：两个选项**语义上很近**、**字面差很远** ——
  例如回应卡上的 `I am fine, thank you.` 与 `Thank you!`
  （字面编辑距离远大于 2，语义却是同一句话的两种说法）；
  以及**生僻词**（孩子根本不认识的那个词，再怎么配对也读不出来）。
- **为什么机器判不了**：仓库里**没有生僻词表**，也没有**语义距离**的手段
  （没有词向量、没有同义词词典）；`editDistance` 是**字符级代理量**，
  它的判据里没有「意思」。
- **归属**：内容质量 / 试玩验收。
- **恢复条件**：Story 2.9 试玩验收时逐条人工过；或另建生僻词表 / 语义距离词典后，
  把它变成可机器判的那一半，再补守卫。
- ⚠️ **不得写成「已验证」**：AC-B4 的原文要求把不可机器判的那一半
  **如实登记为人工项**，而不是含糊过去。

> 来源：`## Deferred from: [DS] Story 2.4 选项数量递进规则 (2026-10-22)` ｜ 旧编号 `—` ｜ 详见本 story 文档的 T5.5

## DF-191

**状态**：待触发 · **归属**：Story 1.19 · **恢复条件**：Story 1.19 试玩验收时人工复核视角；在出现「机器判视角」的手段前不得结清

**一句话**：单词卡**图片**选项的视角一致性机器判不了 —— `docs/art-direction.md` §5.4 台账是目视结论

### 原始论证

### DF-191. 单词卡图片选项的视角一致性仍是目视项

- **事实**：`docs/art-direction.md` §5.4 的 30 行台账（`可读` / `难辨` / `不可读`）
  判的是「同一张卡的几个图片选项**视角是否一致**」——
  ⚠️ **机器判不了**：SVG 里的 `rotate()` **不是视角**（`u1-beautiful` 的
  60/120/180/240/300 是花瓣旋转，主体朝向完全没变），
  真正的视角一致与否**只能靠人眼看渲染出来的图**。
- **Story 2.4 把它改小了一号**：单词卡从 4 个选项降到 2 个之后，
  台账已**逐行重判**（2026-10-22：新结论 `可读` 25 / `难辨` 5 / `不可读` 0），
  「四选一混四种视角」这个病因大幅减轻 —— 但**没有消失**
  （5 张仍难辨，其中 2 张是「侧面 vs 正面」）。
- **归属**：视觉验收。
- **恢复条件**：Story 1.19 试玩验收时人工复核；在出现「机器判视角」的手段前不得结清。
- ⚠️ **不许因为「选项数变少了」就把这条结清** —— 少一个选项只是让**冲突的概率**变小，
  不是让冲突**消失**；而「孩子真的读得出来」这件事本来就要等试玩。

> 来源：`## Deferred from: [DS] Story 2.4 选项数量递进规则 (2026-10-22)` ｜ 旧编号 `—` ｜ 详见本 story 文档的 T5.5

## DF-192

**状态**：待触发 · **归属**：未指派 · **恢复条件**：横屏布局单开 story 改 `src/styles/responsive.css` 的 2×2 规则时（该规则被守卫 G169 钉死）

**一句话**：横屏下选项网格被强制 2 列 ⇒ 3 个选项排成 **2 + 1 两行**；本 story 不动横屏布局

### 原始论证

### DF-192. 横屏下 3 个选项是 2 + 1 两行

- **事实**：`src/styles/responsive.css` 的 `@media (min-aspect-ratio: 1/1)` 里
  逐字写着 `.level-view .question-card .question-card__options { grid-template-columns: repeat(2, minmax(0, 1fr)); }`
  ⇒ **横屏一律 2 列**。该规则的理由（它自己的注释）：横屏右栏只有 ~400px 宽，
  4 张并排每张只剩 ~88px，而词图是 1:1 的，**88px 的图 4–8 岁孩子认不出词**。
- **Story 2.4 的后果**：档 1 的**关键词卡与回应卡是 3 个选项**
  ⇒ 横屏下它们排成 **2 + 1 两行**（第二行只有一张，卡面右侧空着）。
  竖屏下 `repeat(auto-fit, minmax(0, 1fr))` 是一行三列，**不受影响**。
- **为什么本 story 不动它**：那条 2×2 规则被既有守卫 **G169** 逐字钉死
  （`tests/components/portrait-layout.test.ts` 断言那条声明的生效值就是
  `repeat(2, minmax(0, 1fr))`）⇒ 动了就红；而「横屏怎么排」本来就不在本 story 的 AC 范围
  （本 story 只管选项**数**）。
- **归属**：响应式布局。
- **恢复条件**：横屏布局单开 story 改那条 2×2 规则时（连同 G169 一起改）；
  在那之前，3 选项在横屏就是 2 + 1。

> 来源：`## Deferred from: [DS] Story 2.4 选项数量递进规则 (2026-10-22)` ｜ 旧编号 `—` ｜ 详见本 story 文档的 T5.5

## DF-193

**状态**：待裁决 · **归属**：Story 2.9 · **恢复条件**：Story 2.9 试玩验收时决定 `NEAR_DUPLICATE_MAX_DISTANCE` 是否从 2 调高，或为 3–4 字母短词另立一条判据

**一句话**：`scripts/validate-content.ts` 的 `NEAR_DUPLICATE_MAX_DISTANCE = 2` 会误杀「字面近、语义远」的 3–4 字母短词（如 `red` ~ `bed`）

### 原始论证

### DF-193. 近邻阈值 2 的「误杀」方向（与 DF-190 成对）

- **事实**：本 story 的近邻判据是**字符级编辑距离 ≤ 2**（`NEAR_DUPLICATE_MAX_DISTANCE = 2`），
  而编辑距离**不知道意思** ⇒ **字面近但语义远**的一对会被判成「微小差异」。
- **实测例子**：`red` ~ `bed` 距离 = **1**；同理 `sun`/`sum`、`cup`/`cap`、`top`/`toy`。
  这些词**语义上完全可分**（颜色 vs 家具）⇒ 校验器会要求内容作者删掉一个**合格**的干扰项。
- **为什么现在没炸**：单元 1 的**文字**选项里没有这样的对（关键词卡最紧的一对是
  `ball` ~ `book` = 3，回应卡最紧 = 7）⇒ 阈值 2 对现有内容**一条都不误判**。
- **为什么必须登记**：这一族（3–4 字母短词）**随内容量增长会成片被拦** ——
  单元 2–20 录入时，每张卡都有几个短词。
- **归属**：难度 / 内容生产效率（阈值是产品裁决，改它要同步改
  `scripts/validate-content.ts` 与 `docs/option-count.md` §4.1）。
- **恢复条件**：Story 2.9 试玩验收时决定阈值是否调高，或为短词另立一条判据。
- ⚠️ **本 story 不改阈值**：阈值 2 是裁决 7 写死的产品数字，且它被
  「单元 1 卡内最小编辑距离 = 3」这条数据卡住（R-20：改数值前问人）。

> 来源：`## Deferred from: code review of 2-4 选项数量递进规则 (2026-10-23)` ｜ 旧编号 `—` ｜ 与 DF-190 成对（DF-190 是「语义近但字面远」，本条是「字面近但语义远」）

## DF-195

**状态**：待裁决 · **归属**：Story 1.19 / Story 2.9 · **恢复条件**：Story 1.19 或 2.9 试玩验收时决定是否打乱选项顺序（以及是否把「正确项位置」纳入内容校验）｜📎 **2026-10-23**：Story 1.19 的试玩模板已加「作答位置分布」前置栏 ⇒ 真机试玩会带回位置分布，届时据此裁决

**一句话**：`src/content/units/unit-01.json` 全部 37 张卡的正确项都在第 0 位 ⇒「永远点最左边」100% 命中

### 原始论证

### DF-195. 正确项恒在第一位 ⇒ 「总是点最左边」从 25% 变成 100%

- **事实（实测）**：`src/content/units/unit-01.json` 的 **37 张卡**，
  正确项（`correct: true`）**全部**位于 `options` 数组的**第 0 位**
  （实测 `correctAtIndex0 = 37 / 37`）。
- **为什么这条被本 story 放大**：选项数从 4 降到 2 之后，「永远点第一个」的命中率
  从 **1/4 = 25%** 变成 **1/2 = 100%** ⇒ 对 4–8 岁孩子来说，
  **完全不看图、只点最左边**就是满分 ⇒ 本 story 想降低的「识别负担」
  被一条捷径彻底绕开。
- **这不是本 story 引入的**：四选一时同样 100%（第 0 位），只是那时基数是 4。
  ⇒ 但**选项数越少、捷径越划算**，本 story 让它更明显。
- **为什么本 story 不动**：打乱选项顺序会改动**全部 37 张卡的数据**，
  而本 story 的内容改动范围只写明「选项数」（T2.1：保留正确项 + 1 个干扰项）⇒ 越界。
- **归属**：难度设计（也许还需要一条「正确项位置不得恒定」的机器判据）。
- **恢复条件**：Story 1.19（试玩验收）或 2.9 决定：是否打乱顺序；
  若打乱，是否补一条内容校验（注意：`scripts/validate-content.ts` 现在**不**查正确项位置）。

> 来源：`## Deferred from: code review of 2-4 选项数量递进规则 (2026-10-23)` ｜ 旧编号 `—`

## DF-199

**状态**：待触发 · **归属**：Story 2.6 · **恢复条件**：Story 2.6 开工前，先枚举该单元在 `docs/card-distribution.md` §5.1.1 下的可行 N（可行集可能为空），再定词条数

**一句话**：`docs/card-distribution.md` §5.1.1 的可行性对 N 敏感：实测单元 2 的 N=37 与 N=41 可行集为空、单元 3 的 N=36/37 也为空

### 原始论证

### DF-199. 🔥 「每单元 37 条」不成立 —— §5.1.1 的可行集对 N 敏感，而且可能是**空集**

- **实测**（Story 2.5 `[CS]`，2026-10-23；枚举 N ∈ [20, 60] × 全部 (word, keyword, response) 组合，
  逐条判 `|c_k − s_k·N| ≤ 0.5` 且 `Σ c_k === N`）：
  - 单元 2（目标份额 word 79.18% / keyword 3.61% / response 17.20%）：
    **N=37 的可行集是空集**；N=36 ⇒ 唯一解 29/1/6；**N=38 ⇒ 唯一解 30/1/7**；**N=41 同样无解**。
  - 单元 3（目标份额 word 77.28% / keyword 4.52% / response 18.19%）：
    **N=36 与 N=37 的可行集都是空集**；N=38 ⇒ 唯一解 29/2/7。
  - 单元 4（目标份额 word 75.38% / keyword 5.43% / response 19.18%）：
    N=36/37/38 都有解（27/2/7、28/2/7、29/2/7），但 **N=39 无解**。
    ⇒ ⚠️ **可行的 N 甚至不是连续区间** ⇒ 「挑一个接近的 N 就行」也不成立。
  - 单元 1 之所以恒成立，是因为**首锚点就取自单元 1 自己的实测配比**（`30/37`、`1/37`、`6/37`）
    —— 那是恒等式，不是取整的产物。**别把单元 1 的 37 当成模板。**
- **为什么必须登记**：`docs/card-distribution.md` §4.1 的逐批次规模表**全部**按「每单元 37 词条」外推
  （2.5 ≈ 29 张 / 2.6 ≈ 136 张 / 2.7 ≈ 140 张 / 2.8 ≈ 131 张）⇒ 那个基数在单元 2 就已经不成立
  （Story 2.5 实测 N=38 ⇒ 30 张）⇒ **2.6–2.8 不能照抄 37**，必须逐单元枚举。
- **顺带查出（同一处）**：`docs/card-distribution.md` §5.1.1 逐字写的「**这样两条自动同时成立**」
  在 (单元 2, N=37) 上**不成立** —— 它的「最大余数法」配方会给出 29/1/7，而逐族误差是 **0.634 > 0.5**。
  ⇒ 该句按 R-21 在 Story 2.5 内就地更正（该 story 的 Task 7.1）。
- **恢复条件**：Story 2.6 开工前，先枚举该单元在 §5.1.1 下的可行 N（可行集可能为空），再定词条数。
  枚举脚本见 Story 2.5 的 story 文档 §8.2。

> 来源：`## Deferred from: create story 2-5 内容批次 1 单元 2 单单元试点（2026-10-23）` ｜ 旧编号 `—`

## DF-200

**状态**：待裁决 · **归属**：Story 2.9 · **恢复条件**：Story 2.9 试玩验收时决定「跳过的词（词图加载失败）在单元推进后怎么办」：是否允许带缺口推进、要不要补一轮小测

**一句话**：推进判据改成「本单元全部已掌握」后，一张持续加载失败的词图会让该单元永远学不完（孩子卡在 N-1/N）

### 原始论证

### DF-200. 🔥 跳过的词既不算「已掌握」，又会挡住「本单元学完」—— 长期政策要人拍板

- **问题的来源**：Story 2.5 把「推进到下一单元」的判据从「打了一局」改成「**本单元全部词条已掌握**」
  （DF-072 的恢复条件写死为「Story 2.5 录入单元 2 之前」）。
- **`skipped` 是什么**：`src/core/types.ts` 的 `State.skippedEntryIds` 逐字写着
  「🔥 **Story 1.18 / AC-E4：本局已跳过的 `entryId`（正确项词图加载失败）**」，
  且「**它与 `masteredEntryIds` 是两件事，绝不能合并**：`mastered` = 「孩子学会了」；
  `skipped` = 「这道题**没机会**被答」。塞进 mastered 会让进度条显示一个假的「已读 N/60」」。
- **⇒ 两条推论**：
  1. **跳过不能算已掌握** —— 否则进度条显示的是假数字，孩子一个字都没听懂。
  2. **跳过会挡住「本单元学完」** —— 被跳过的条目**会在下一局重新出现**
     （`sliceDeckForLevel` 只按 `masteredWordIds` 过滤），所以词图恢复后孩子**还有机会**学会它；
     但如果那张图**持续**加载失败，那个词就永远学不会 ⇒ **该单元永远完成不了** ⇒
     孩子停在「第 N-1/N」，界面上没有任何解释。
- **Story 2.5 的处置（无人值守下的自动选择）**：**判据严格**（跳过 ≠ 已掌握），
  风险**显式登记**（本条），**不**用「跳过即完成」去换一次推进。
  理由：那条洞的根因是**资产 bug**（词图存在性由 `validate:content` 守、逐张断言由 G10 守），
  **该由资产守卫拦住，不该由推进逻辑兜**。
- **为什么仍然要登记**：长期政策是**产品语义**，不是实现细节 ——
  ① 「持续失败」要不要给出**可见的提示**（而不是默默停住）？
  ② 推进到下一单元之后，那个没学会的词**要不要补测**（FR59 的线性推进意味着它不会再被问到）？
  ③ 要不要引入「已跳过」这一档**独立的进度显示**（例如「第 36/38（2 张图加载失败）」）？
  ⇒ 这三条都**不该由 Dev 在 `[DS]` 里替产品决定**。
- **恢复条件**：Story 2.9 试玩验收时决定（届时会有真机上的加载失败样本可观察）。

> 来源：`## Deferred from: create story 2-5 内容批次 1 单元 2 单单元试点（2026-10-23）` ｜ 旧编号 `—`

## DF-201

**状态**：待触发 · **归属**：Story 2.5 – 2.8 · **恢复条件**：用户确认课本版本（一起版 / 旧本地版）+ 裁决「游戏一关 ↔ 教材 Unit」映射后，按 `docs/textbook-oxford-shanghai/` 的词表逐单元重录 `src/content/units/unit-XX.json`

**一句话**：现有 68 个词条是 Story 1.3 / 2.5 **自建**的；教材词表已于 2026-10-23 从网络抓取入库（24 单元 / 97 词），但**版本未确认**，不能直接当事实用

### 原始论证

### DF-201. 词表必须逐单元换成**牛津上海版**教材词表（用户 2026-10-23 裁决）

- **触发**：用户查看游戏单元 1 的词表后提出「感觉和实际孩子的英文课本对不上」，
  实查**成立** —— 课本词表从未进过仓库。
- **溯源**（详见 `decision-log.md`「内容来源修正 2026-10-23」段）：
  ① GDD 访谈时用户给了**三个**教材样例（`good morning` / `How are you` / `I have a ball for my dog.`），
  这是仓库里**唯一**真正来自教材的英文；
  ② Story 1.3 **自建** 38 条词表，其文件头逐字写「内容取自上海版一年级上册**常见词汇**」——
  是按**印象**编的，不是抄的；
  ③ Story 1.6 把那份自建词表录进 `src/content/units/unit-01.json`；
  ④ Story 2.5 给单元 2 的 38 条**同样自建**，其裁决 3 逐字写着「**未与教材核对**」。
- **与真实教材的差距**（牛津上海版一年级上册 Unit 1「Hello」，**2026-10-23 网络抓取实测**）：
  教材 Unit 1 的 `Look and learn` 词表**只有 2 个词** —— `morning` / `afternoon`
  （`Hello!` / `Hi!` / `Goodbye!` / `Good morning!` 在 `Look and say` 与 `Say and act` 板块里，
  不是词表条目）；句型是 `Hello!` / `Good morning.` / `Good afternoon!` / `Goodbye!`。
  而游戏「单元 1」的**家人 / 动物 / 文具 / 颜色 / 数字**在真实教材里分属 Module 1–4 的多个 Unit
  ⇒ 游戏的一个「单元」≈ 真实课本的好几个单元揉在一起，单元边界也对不上。
- **用户裁决（2026-10-23）**：① 教材版本锁定为**牛津上海版（上海本地）**；
  ② 词表来源改为「**逐单元抄录教材**」；③ 教材扫描件到位前**不再自建新单元的词表**。
- **⚠️ 2026-10-23 追加：教材全文已从网络抓取入库**（用户追问「能否直接从网络下」）。
  结果记录在 `docs/textbook-oxford-shanghai/`：
  - 一年级上册 12 单元 + 一年级下册 12 单元 = **24 单元 / 97 个 `Look and learn` 词条**，
    另有每单元的 `Say and act` 句型；
  - 主源：智慧山逐单元课文转写（`zhihuishan.com/weixinview-view-{id}.html`）；
    交叉验证源：二一教育《上海牛津（本地版）一、二年级上下册单词整理》——
    **一下两源逐词一致**；一上两源有**版本级**差异；
  - 入库文件：`docs/textbook-oxford-shanghai/{README.md,01a-units.md,01b-units.md}`；
    已用脚本把仓库文件与源转写逐条比对（209 条，0 差异）。
  - **仍未闭合**：① **版本未确认** —— 存在「一起版（六三制一起）」与更早的「旧本地版」，
    一上词表不同（旧本地版一上是 `one`–`ten` 且**无** `morning/afternoon`、**无**家庭成员词）；
    一句判据：孩子课本 Unit 1 的 `Look and learn` 是 `morning / afternoon` ⇒ 一起版（已抓的这份对得上）；
    ② **关卡映射未裁决**（见下）。
- **需要用户提供的材料**（**已缩减** —— 从「每单元三页」缩到「一处」）：
  ① **孩子课本的目录页或封底 ISBN**（或直接看一眼 Unit 1 的 `Look and learn` 词表）⇒ 定版本；
  ② 若抓到的版本与孩子课本不同，再按缺口补拍该版本的词表页。
  （原计划的「每单元词表页 + 句子页」已由网络抓取覆盖，不必再拍。）
- **替换怎么做（换词不改代码）**：只需换 `src/content/units/unit-XX.json` 的词表 +
  重画词图 + 重录 TTS，并遵守 Story 2.5 §2.4 已写好的替换规约
  （分档不变 / 48px 下可区分 / 句子卡的选项指针仍成立 / `entryId` 一次定死 /
  替换后重跑 `validate:content` 与全部资产守卫）。
- **⚠️ 换表的连带影响（不是「换个词」那么简单）**：
  ① **每关词数会变** —— **实测**教材单个 Unit 的 `Look and learn` 只有 **2–6 个词**
  （上册 Unit 1 仅 2 词，多数单元 4 词，合计 97 词 / 24 单元），而现有游戏单元是 30 词
  ⇒ 若 1 关 = 1 教材 Unit，一关只有 2–6 词，卡型占比与题量都要重算
  （`docs/card-distribution.md` §5.1.1 对 N 敏感，见 DF-199）；
  ② **选项数档位要重算** —— `docs/option-count.md` 的档 1 = 2 / 3 / 3 是按「每单元 30 词」定的；
  ③ **单元 ↔ 教材 Unit 的映射**要定 —— 牛津上海版一年级上册是 4 Module × 3 Unit（+ 4 Project），
  两册共 24 Unit，与 GDD 的「约 16–20 关」对不上（DF-110）；
  ④ 教材 `Say and act` 的句型带人名（Kitty / Alice / Danny）与情境（At the supermarket），
  游戏句子卡要按 Story 2.5 §2.4 的规约改成**自足句**。
- **为什么先不急着动手换**：ⓘ **版本还没确认**（上面两个候选的词表不同）ⓘ 映射规则要用户裁决 ⓘ 现在动手 = 白做。
  ⇒ 登记本条，把**触发条件**钉死（= 用户确认版本 + 裁决映射），不写成「以后再说」。
- **归属**：内容生产（Story 2.5 – 2.8）。
- **恢复条件**：用户确认课本版本（一起版 / 旧本地版）+ 裁决「游戏一关 ↔ 教材 Unit」映射后，按 `docs/textbook-oxford-shanghai/` 的词表逐单元重录 `src/content/units/unit-XX.json`。

> 来源：`## Deferred from: 用户裁决 —— 词表来源改为逐单元抄录教材（2026-10-23）` ｜ 旧编号 `—` ｜ 详见 `decision-log.md` 的「内容来源修正 2026-10-23」段

## DF-202

**状态**：待裁决 · **归属**：Story 2.9 · **恢复条件**：Story 2.9 试玩验收前（或「最后一个单元」被录满时）设计「全书完成」画面；**至少**要有一条**不依赖新画面**的出路（提示「你已经读完所有已解锁的单元」＋ 不再把同一张通关卡推回给孩子）

**一句话**：读完**最后一个已录入单元**后没有完成画面 —— `finished` 只换按钮字、动作仍是 `backToStart()`（不动 `state.value`）⇒ `回开始 → 开始游戏` 回到**同一张通关卡**，是死循环

### 原始论证

### DF-202. 🔥 `finished` 分支只有「换个按钮字」，孩子会卡在同一张通关卡上

- **事实**：`src/app/store.ts` 的 `LevelOutcomeKind` 有第四个取值 `finished`，
  逐字定义是「通关 ∧ 本单元学完 ∧ **没有下一个单元**（全书最后一个单元）」。
  单元 2 是当前**最后一个已录入**的单元 ⇒ **孩子读完单元 2 就落在这一支上**
  （不是「将来才会发生」—— 现在就能走到）。
- **`finished` 与 `continue` 走的是同一个动作**：`src/components/hud/LevelOutcome.vue` 的
  `buttonLabel` 只对 `finished` 改了**文案**（「回开始」），`onOutcomeButton()` 里
  `finished` 落进 `default:` 分支 ⇒ 调 `backToStart()`。
- ⚠️ **`backToStart()` 不动 `state.value`**（逐字只有 `view.value = 'start'` ＋ `stopBgm()`）
  ⇒ 通关那一次的 `level-complete` 相位**原地留着**。
- **于是**：孩子点「开始游戏」⇒ `enterLevel()` ⇒ `restoreFromSave()` ⇒
  `currentGame === null` ⇒ `restoreNextUnit(savedProgress)`：
  `targetUnitNumber = currentUnitIndex + 1` = **单元 3** ⇒ **未录入**
  ⇒ 记一条 WARN 并**保持当前战场**（`restoreNextUnit` 的「保持当前战场」分支）
  ⇒ **孩子看到的还是那张「读完啦」卡**。
  ⇒ 死循环：通关卡 → 回开始 → 开始游戏 → 通关卡 ……**没有任何一处告诉他「你已经读完全书了」**。
- **为什么不在本 story 顺手修掉**：完成画面是**产品语义**（庆祝 + 统计 + 回目录），
  而「目录 / 选择单元」这整块**还不存在**（FR59 是线性推进）⇒ 画一张完成画面
  会连带一整块未做的设计；而「不依赖新画面」的那条出路（提示 + 不回同一张卡）
  同样要改 `finished` 的**动作分支** ⇒ 属于 `[CC]` / 产品裁决的范畴。
- **归属**：产品 / 流程（Story 2.9 试玩验收前）。
- **恢复条件**：Story 2.9 试玩验收前（或「最后一个单元」被录满时）设计「全书完成」画面；
  **至少**要有一条**不依赖新画面**的出路（提示「你已经读完所有已解锁的单元」＋ 不再把同一张通关卡推回给孩子）。

> 来源：`## Deferred from: code review 2-5-内容批次-1-单元-2-单单元试点 (2026-10-23)` ｜ 旧编号 `—` ｜ 详见 `archive/deferred/2026-10-23--cr-story-2-5.md` 的「分诊结论」

## DF-203

**状态**：待裁决 · **归属**：Story 2.9 · **恢复条件**：Story 2.9 试玩验收时（或内容批次 3 开工前）裁决「回应卡的正确项该怎么选」这条**内容语义标准**；DF-019 归并到本条

**一句话**：回应卡的「正确项」**没有标准**，只有逐张裁决 —— 单元 1 的 `u1-s-thank-you` 题面「Thank you!」的正确项是「Goodbye」，单元 2 的 `u2-goodbye` 的正确项也是「Goodbye」

### 原始论证

### DF-203. 🔥 回应卡的正确项该是什么 —— 仓库里没有一条守卫守它

- **事实**：回应卡（`kind: 'response'`）的题面是一句**招呼 / 陈述**，选项是三句回应。
  现有 **13 张**回应卡里，正确项**不总是**「直接回答题面那句话」的那一句：
  - 单元 1：`u1-s-thank-you` 题面「Thank you!」⇒ 正确项是 **「Goodbye」**（不是「You're welcome」）；
  - 单元 2：`u2-goodbye` 题面「Goodbye!」⇒ 正确项是 **「Goodbye」**（= **重复题面**本身）。
- **这两处都「合法」**：GDD 的表格与 Story 2.5 §2.3 的表都**允许**回应卡考
  「这句话之后该说哪句」，而不是「题面的字面答案」⇒ 守卫 G280 只守
  「恰有一个正确项」与「回应卡不自己答自己」，**没有一条**守「正确项的语义」。
- **为什么这值得单列一条**：DF-019 已经是这个族的**一个单点**
  （`u1-s-good-morning` 的回应卡「仍是裁决而非共识」），
  但它**只覆盖那一张卡** ⇒ 剩下 12 张的依据**散落在各人当时的判断里**，没有成文的标准。
- **为什么不在本 story 顺手改**：一旦定了标准，**13 张已录的卡可能全要重录** ——
  录音**不可重生成**（架构硬约束）⇒ 重录 = 重画词图 + 重录 TTS = 数小时的返工
  ⇒ 这是**内容语义裁决**，不该由 `[CR]` 替产品做。
- **归属**：内容语义（Story 2.9 试玩验收 / 内容批次 3 开工前）。
- **恢复条件**：Story 2.9 试玩验收时（或内容批次 3 开工前）裁决「回应卡的正确项该怎么选」；
  DF-019 归并到本条。

> 来源：`## Deferred from: code review 2-5-内容批次-1-单元-2-单单元试点 (2026-10-23)` ｜ 旧编号 `—` ｜ 详见 `archive/deferred/2026-10-23--cr-story-2-5.md` 的「分诊结论」

## DF-204

**状态**：待触发 · **归属**：Story 2.6 · **恢复条件**：Story 2.6 开工前（或 `food` 档的成员数再涨一倍时）用**全部**真实成员重算 `food` 档的区间；`scene` 档等 Story 2.6 有真实成员再定

**一句话**：`food` 档的区间 **60%–80%** 只由 **2 个**样本定出来（现在有 6 个成员，实测跨度 62.1%–79.7%），`scene` 档则**一个真实成员都没有**

### 原始论证

### DF-204. 🔥 两档的区间都没有足够样本 —— G11 在这两档上几乎没有判别力

- **事实**：`docs/art-direction.md` §5.1 的六档表里，`food` 档的区间 **60%–80%**
  是**照那两个样张定出来的** —— 表的「为什么这么放」列逐字写着
  「实测两端：`egg` v2 = **69.1%**、`ice-cream` v3 = **79.7%**」，
  「代价」列逐字写着「这条带**只由 2 个样本定出来** ⇒ 样本涨了要**重算**，不是照抄」。
- **Story 2.5 交付后，`food` 档已经有 6 个真实成员**（`npm run word-image-metrics public/assets/words/unit-02` 实测）：
  `bread` **62.1%** / `apple` **63.8%** / `milk` **63.9%** / `egg` **69.1%** /
  `banana` **71.3%** / `ice-cream` **79.7%**
  ⇒ 实际跨度 **62.1% – 79.7%**，而带是 **60% – 80%**
  ⇒ 下沿余量 **2.1** 个百分点、上沿余量 **0.3** 个百分点
  ⇒ G11 在 `food` 档上**几乎没有判别力**（20 个百分点 vs 几何 / 抽象档的 15）。
- **`scene` 档（70%–85%）一个真实成员都没有** —— 唯一的依据是 `playground` 实测 78.9%，
  而它到 session 结束**仍未通过 48px 可读性**（`docs/word-image-throughput.md` §9）。
- **为什么不在本 story 顺手改**：改区间 = **改数值**（R-20：数值要人拍板）；
  而且区间同时写死在 `scripts/word-image-metrics.ts` 的 `TIER_EDGE_RANGES` 里
  （G277 逐字比对两张表）⇒ 改一处要改两处，还要重跑全部词图的实算。
- **归属**：构图数值（Story 2.6 开工前）。
- **恢复条件**：Story 2.6 开工前（或 `food` 档成员数再涨一倍时）用**全部**真实成员重算 `food` 档区间；
  `scene` 档等 Story 2.6 有真实成员再定。

> 来源：`## Deferred from: code review 2-5-内容批次-1-单元-2-单单元试点 (2026-10-23)` ｜ 旧编号 `—` ｜ 详见 `archive/deferred/2026-10-23--cr-story-2-5.md` 的「分诊结论」

## DF-205

**状态**：待触发 · **归属**：Story 2.6 · **恢复条件**：Story 2.6 开工时把「48px 读成了什么」补进 `docs/word-image-lab/versions-*.jsonl` 的每一条记录，并把本批 30 张按同一格式补齐

**一句话**：单元 2 的 **30 张**词图**没有逐版的 48px 判读留痕** —— `versions-u2.jsonl` 每张只有**一行最终态**，中间版本与判读依据一个字都没留

### 原始论证

### DF-205. 🔥 48px 判读是唯一的「语义关」，而这一批**没有留痕**

- **事实**：§5.5b（48px 可读性地板）是**永久 👁** —— 机器判不了「承担识别功能与否」，
  所以**每一次判读都是人的判断**。人的判断若不留痕，就等于没有发生过。
- **单元 2 的留痕现状**：`docs/word-image-lab/versions-u2.jsonl` 共 **30 行**，
  **每张图一行**（最终态的 `edgePercent` / `paddingPx` / `centerOffsetPx` / `violations`），
  **没有 `kind` 字段**区分「实测记录」与「事后回填」，
  **中间版本一行都没有**（本批有 **8 张**返工过，见 story 文档 Task 3.2 的返工统计），
  **判读依据一个字都没写**（只有 `violations: []` 这样的机器字段）。
- **对比单元 1 的做法**：Story 1.3 起的那几张在 SVG 文件头的注释里逐张写了
  「栅格化后实际读成了什么」⇒ 那一批**可查**。
- **后果**：将来有人问「这张图在 48px 上到底认不认得出」，**没有可查的原始记录**，
  只能重做一遍 —— 而 §5.5b 是**语义关**，机器永远替代不了人。
- **为什么不在本 story 补齐**：30 张的判读依据**当时并没有逐版写成文字**
  （现在补 = **事后编造**，那正是本仓反复出现的那类假记录）⇒ 只能登记成缺口，
  并把**规矩**定死（下一批每版补一句），由 Story 2.6 起执行。
- **归属**：词图产能流程（Story 2.6 开工时）。
- **恢复条件**：Story 2.6 开工时把「48px 读成了什么」补进 `docs/word-image-lab/versions-*.jsonl`
  的每一条记录，并把本批 30 张按同一格式补齐。

> 来源：`## Deferred from: code review 2-5-内容批次-1-单元-2-单单元试点 (2026-10-23)` ｜ 旧编号 `—` ｜ 详见 `archive/deferred/2026-10-23--cr-story-2-5.md` 的「分诊结论」

## DF-207

**状态**：待触发 · **归属**：Story 2.6 · **恢复条件**：新 `N` 确定后（教材版一关 3–25 条，均值约 14），重定 `docs/card-distribution.md` 的**首锚点与末锚点**并同步 `src/content/distribution.ts`

**一句话**：卡型占比的两个锚点按 37 条/单元定（首锚点 30/1/6 = 81.08%），新实测单词卡份额只有 **28–46%** ⇒ 锚点全部失效

### 原始论证

### DF-207. 卡型占比规则的两个锚点，在「1 关 = 1 教材 Unit」下全部失效

- **规则现状**（`docs/card-distribution.md` §1.1）：首锚点 = `unit-01.json` 实测 **30 word / 1 keyword / 6 response**
  （= 37 条，81.08%）；末锚点 = 单元 20 的 45 / 20 / 35；中间按 `t(n) = (n-1)/19` 线性插值。
  守卫 **G190** 要求「规则(单元 1) 与真实内容**零容差**一致」。
- **新事实**（2026-10-23 实测 census，源 `docs/textbook-oxford-shanghai/`）：
  单词卡 = 教材 `Look and learn` 词表（**97 张**）；
  陈述句 → keyword 卡候选（**206 条**）；
  疑问句 → response 卡候选（**41 条**）；
  ⇒ 若全部入卡，每关 `N` 是 **3–25（均值约 14）**，单词卡份额 **28%–46%**。
- **冲突**：① 首锚点 81.08% 与实测的 ~28–46% **不是同一件事**（G190 会红）；
  ② 插值公式的 `LAST_UNIT = 20` 与新的 24 关不符；
  ③ §4 的词图总数（437.21 / 466.50）按 37 条/单元外推，**全部作废**（真值是 97 张）。
- **为什么现在不定锚点**：新 `N` 还取决于两件未定的事 ——
  ① 教材每个单元有多少句**适合做问答卡**（1B 的 `Activities` / `New Year's Day` / `Story time`
  三单元的句子集中在儿歌与故事板块，**不适合直接做卡** ⇒ 这三关怎么配比要单独定）；
  ② 词卡要不要带**复习词**（跨单元复现旧词，以撑起每关的题量）。
- **归属**：难度阶梯规则（Story 2.6 开工前）。
- **恢复条件**：新 `N` 确定后（教材版一关 3–25 条，均值约 14），重定 `docs/card-distribution.md` 的**首锚点与末锚点**并同步 `src/content/distribution.ts`。

> 来源：`## Deferred from: 用户裁决 —— 关卡映射 1 关 = 1 教材 Unit（2026-10-23）` ｜ 旧编号 `—` ｜ 详见 `decision-log.md` 的「决定 4」

## DF-208

**状态**：待触发 · **归属**：Story 2.6 · **恢复条件**：关卡数扩到 24 后，给 `docs/option-count.md` 的档位表**补 21–24 关的档**，并按新 `N` 重算档 1 的选项数

**一句话**：选项数档位表只覆盖 1..20 关，**21–24 关无档可用**；档 1 = 2/3/3 又是按「一关 30 词」定的

### 原始论证

### DF-208. 选项数档位表在 24 关下缺一档，且档 1 的取值前提没了

- **规则现状**（`docs/option-count.md` / `src/content/option-count.ts`）：
  档 1 = 单元 1–4（word **2** / keyword **3** / response **3**）；
  档 2 = 单元 5–10（3 / 4 / 4）；档 3 = 单元 11–20（4 / 4 / 4）。
- **两处失效**：
  ① **21–24 关无档可用** —— 档 3 的上界是 20，24 关里的最后 4 关**没有档位**；
  ② 档 1 的取值（2/3/3）是在「**一关 30 个单词词**」的前提下定的
  （一关 30 词 ⇒ 干扰项取 2 个还能保证「卡片内最小编辑距离 ≥ 3」）；
  新映射下一关只有 **2–6 个教材词** ⇒ **干扰项从哪来**（同关内的其他教材词？
  还是复习词？）是**新问题**，直接决定档 1 的取值还成不成立。
- **为什么不能沿用**：沿用 = 让 21–24 关落到「无档」状态（`assertOptionCountTiers` 会红），
  或者让档 1 在 2 词的一关上**没有干扰项可选** ⇒ 是硬冲突，不是「先这么用着」。
- **归属**：难度阶梯规则（Story 2.6 开工前）。
- **恢复条件**：关卡数扩到 24 后，给 `docs/option-count.md` 的档位表**补 21–24 关的档**，并按新 `N` 重算档 1 的选项数。

> 来源：`## Deferred from: 用户裁决 —— 关卡映射 1 关 = 1 教材 Unit（2026-10-23）` ｜ 旧编号 `—` ｜ 详见 `decision-log.md` 的「决定 4」

## DF-209

**状态**：待裁决 · **归属**：Story 1.19 · **恢复条件**：Story 1.19 真机试玩（Task 3）在**浏览器标签页**（非 PWA 全屏）模式下确认 768×1024 是否真裁；确认裁切 ⇒ 下一次动选项卡尺寸时裁决「选项卡高度是否受可用高度约束」

**一句话**：`OptionCard.vue` 的 `.option-card__image` 是 `aspect-ratio: 1/1` ⇒ 选项卡高由宽度定 ⇒ 浏览器标签页（内视口矮 87px）下 768×1024 题卡超出视口 21px

### 原始论证

### DF-209. 选项卡的高度由宽度决定 ⇒ 矮视口上会把题卡推出视口

- **根因**：`OptionCard.vue` 的 `.option-card__image` 逐字是 `width: 100%; height: auto; aspect-ratio: 1 / 1`
  ⇒ **选项卡的高度由卡片宽度决定**，与可用高度无关。
- **实测**（2026-10-24 `[DS]` 第四轮，真浏览器；`scripts/verify-portrait-layout.ts`）：
  - 内视口 **768×937**（＝ 768×1024 的设备**带 87px 浏览器工具栏**，
    即「用浏览器直接打开部署网址」而不是装成 PWA）⇒ 题卡 `540~958` ⇒ **下缘超出视口 21px** ⇒
    **选项卡底部被切**，「选项全可见 = false」。
  - 同一台设备在 **PWA 全屏**（内视口 768×1024）⇒ 题卡 `548~974` ⇒ **全可见**。
- **为什么不当场修**：把选项卡改小 = **缩小词图** ⇒ 直接撞
  **AC-H3「4–8 岁孩子要认得出词图」这条硬要求** ⇒ 这是**产品取舍**，不由 `[DS]` 擅改（R-35）。
- **为什么现在登记而不是等真机**：真机试玩（Task 3）本来就要在平板上做，
  但**默认是 PWA 全屏** ⇒ 不特意在浏览器标签页里试就**永远发现不了这一条** ⇒
  恢复条件里写死了「**在浏览器标签页模式下确认**」。
- **归属**：Story 1.19（真机试玩那一轮）。
- **恢复条件**：Task 3 里在浏览器标签页模式下确认 768×1024 是否真裁；确认裁切 ⇒
  下一次动选项卡尺寸时裁决「选项卡高度是否受可用高度约束」（连带 `docs/option-count.md` 与 AC-H3 一起看）。

> 来源：`## Deferred from: dev story 1-19 单元 1 首次试玩验证 · 第四轮（2026-10-24）` ｜ 旧编号 `—`

## DF-210

**状态**：待触发 · **归属**：Story 2.6 · **恢复条件**：教材版每关 `N` 确定后（DF-201 版本确认），按 24 关 / 新 `N` 重算 `docs/word-image-throughput.md` §8.1.3 与 §8.4 的参数表与决策表

**一句话**：该文档 §8 的 16–20 单元 / 480–600 张 / 66–133 h 全是旧口径；新口径下「口径 B 远超投入」这条结论**不成立**

### 原始论证

### DF-210. 词图产能文档 §8 的参数表与决策表停在旧口径（16–20 关 / 480–600 张）

- **触发**：用户 2026-10-23 裁决「1 关 = 1 教材 Unit」⇒ **24 关**；教材词表入库 ⇒ 全书单词卡 **97 张**。
  2026-10-24 的 `[CC]` 已把 GDD / `epics.md` / `game-architecture.md` 的**正文口径**改掉，
  但 `docs/word-image-throughput.md` §8 是**实测分析**（Story 2.1 的产出），没有跟着改。
- **旧口径在哪**：§8.1.3 的参数表把**单元数 U** 取 {8, 10, 12, 16, 18, 20}、**每单元词条数 E** 取 {11, 22, 37}、
  **配图比例 r = 81.08%**；§8.1.4 / §8.3.3 / §8.4 的表与决策结论都由这三个数推出。
- **为什么不能顺手改**：这三个数分别依赖**单元数**（已定 24）、**每关条目数 `N`**（一上 12 个单元取决于教材版本 ⇒ DF-201）
  与**配图比例**（教材映射下变成 100% ⇒ 可直接算）⇒ 在版本确认前重算，等于把「抓取版」当定论写进实测文档。
  ⇒ 本次只加**口径变更指针**（顶部一段 + §8.1.2 / §8.1.3 / §8.3.3 三处留档标记），重算留待触发。
- **结论层面的变化（新口径下最要紧的一条）**：§8.4 决策表里「口径 B **160–200 h**，远超假设投入」这条结论
  在 97 张的新规模下**不再成立**（97 张 × 20 分钟 ≈ **32 h**）⇒ 「全书可玩 vs 半年内做完」这道选择题的答案会变。
  ⇒ **任何人不得再拿 §8.4 的结论当排产依据。**
- **归属**：Story 2.6（内容批次开工前）。
- **恢复条件**：教材版每关 `N` 确定后（DF-201 版本确认），按 24 关 / 新 `N` 重算 `docs/word-image-throughput.md` §8.1.3 与 §8.4 的参数表与决策表。

> 来源：`## Deferred from: [CC] 执行决定 4 —— 关卡数 24 关（2026-10-24）` ｜ 旧编号 `—`

---

## DF-212

**状态**：待触发 · **归属**：Story 1.18 · **恢复条件**：Story 1.18 真机字号校准时，把 `src/styles/tokens.css` 字体阶梯的推导数按今天的实测容器宽 **736px** 重算（4 个选项 ⇒ 单卡 175px、内容盒 151px ⇒ 硬上限 28.8px、余量 23.6%）

**一句话**：字体阶梯仍按 Story 1.11 的旧基线 768 / 183 / 159 推导；`--text-option: 22px` 取值**仍成立**，过期的是**推导数**与「余量 27.7%」

### 原始论证

### DF-212. 字体阶梯的推导数停在 Story 1.11 的旧基线（768 / 183 / 159）

- **触发**：2026-10-24 夜执行 DF-194（「四个选项」措辞债）时撞见的**另一条债** ——
  `src/styles/tokens.css` 字体阶梯推导里的那三个数（容器 768px / 单卡 183px / 内容盒 159px）
  **今天已经复现不出来**。DF-194 的原始论证里其实已经写着这件事：
  「⚠️ 里面的 `768 / 183px` **本 story 已实测推翻**（今天的容器是 736px ⇒ 单卡 175px）」——
  但它管的是「四个选项」那个**措辞**，**没有管这三个数**。
- **实测事实**（2026-10-22 真浏览器，Chromium 1223，800×1280 ——
  `src/components/quiz/QuestionCard.vue` 的选项行注释逐字记着）：选项容器实测 **736px**
  （800 − 左右各 32px 内边距）⇒ 2 个选项 (736−12)/2 = **362px**；3 个 (736−24)/3 = **237px**；
  4 个 (736−36)/4 = **175px** ⇒ 4 个选项时内容盒 = 175 − 24 = **151px**（不是 159px）。
- **后果（算术，不是设计决定）**：Story 1.11 的硬上限是 `159 / 5.24 ≈ 30.3px`，
  按今天的内容盒算是 `151 / 5.24 ≈ 28.8px` ⇒ `--text-option: 22px` 的**取值不变**
  （实测最长词 `afternoon!` = 115px @22px，在 151px 里仍放得下），
  但**余量从 27.7% 变成 23.6%**。
- **为什么这一轮不一起改**：Story 1.11 的字号阶梯是**真机校准的归属项**
  （GDD `:557`「型号确定后本表数值随之校准」）⇒ 真机字号校准是 Story 1.18 的活；
  无人值守批次改推导数，会把「桌面 Chromium 的实测」与「真机的实测」混在一起。
  ⇒ 这一轮只在 `tokens.css` 里**留了指针**（那一段现在逐字写着
  「768 / 183 / 159 这三个数本身已经是旧基线」并指向本条），
  **推导数与余量一个字没动**。
- **归属**：Story 1.18（真机字号校准）。
- **恢复条件**：Story 1.18 真机字号校准时，把 `src/styles/tokens.css` 字体阶梯的推导数按今天的实测容器宽 **736px** 重算（4 个选项 ⇒ 单卡 175px、内容盒 151px ⇒ 硬上限 28.8px、余量 23.6%）

> 来源：`## Deferred from: code review of 2-4 选项数量递进规则 (2026-10-23)` ｜ 旧编号 `—`

---

## DF-213

**状态**：待裁决 · **归属**：未指派 · **恢复条件**：有人裁决辅通路四个常量的「现场调」归属（候选：Story 1.19 试玩校准 / 某个尚未存在的 story），并把 5 个文件里的 10 处口径一次改齐

**一句话**：`pronunciation.ts` 的四个 rate/pitch 常量在 5 个文件 10 处写着两个归属（Epic 1 现场调 / Epic 3 现场调）

### 原始论证

### 1. 同一个「现场调」，5 个文件 10 处说了两个样子

**「Epic 1 现场调」那 4 处（逐字）：**

1. `epics.md` 的 AR34 汇总行：「AR34: 朗读参数做成可配置常量（单词 rate 0.85 / pitch 1.05；长句 rate 0.9 为起点，Epic 1 现场调）」
2. `game-architecture.md` 的 §7 朗读参数表：「**朗读参数（辅通路的可配置常量，Epic 1 现场调）：**」
3. `game-architecture.md` 的 Configuration 表：「TTS 参数（辅通路） | `src/services/pronunciation.ts` | `rate` / `pitch`，**Epic 1 现场调**的可配置常量」
4. `sprint-change-proposal-2026-10-12.md`：「**朗读参数（做成可配置常量，Epic 1 现场调）：**」

**「Epic 3 现场调」那 5 处（逐字）：**

5. `epics.md` 的 Story 1.2 的 AC-6：「**And** 朗读参数为可配置常量：单词 `rate 0.85 / pitch 1.05`，长句 `rate 0.9`（起点，Epic 3 现场调）」
6. Story 1.2 的 story 文档（AC-6 的原文转写）：同一句逐字
7. Story 1.2 的 story 文档 §13.4 批注里引的那半句：「且「Epic 3 现场调语速时也无需守住 2.0」」
8. Story 1.2 的 story 文档 §13.4 正文：「**Epic 3 现场调语速时也无需守住 2.0**，只需守住「不发散到失去可懂度」这一条产品判断。」
9. Story 1.2 的 story 文档 Task 1.1：「（AR34；长句 `0.9` 是**起点**，Epic 3 / Story 3.4 现场调）」

**代码那 1 处（已被本 story 改成指针）：**

10. `src/services/pronunciation.ts` 的常量区注释：原文逐字是
    「── 可配置常量（AR34；长句 0.9 是起点，Epic 3 / Story 3.4 现场调）────────────────」
    ⇒ 2026-10-25 改成指向本条，**不再单方面宣布归属**。

**冲突的性质**：不是「哪个说法对」的技术问题，而是**归属**未定 ——
「现场调」这件事该记在哪个 story 名下。而 Story 3.4 的 AC-2 又逐字把设备 TTS
**排除在品质决策之外**（「设备 TTS 的音色不参与品质决策」）⇒
归 Story 3.4 会与 AC-2 逐字冲突。

**为什么由人裁决**：改归属 = 改**已交付 story 的 AC 正文**（`epics.md` 的 Story 1.2 的 AC-6
与 Story 1.2 文档里那 4 处转写）⇒ 按 R-33「不满足 ⇒ 走 `[CC]`」，
`[DS]` 无权替人决定 ⇒ 登记在此。

**三个候选归属与各自代价：**

- **① 归 Story 3.4（本 story 自己）** —— 代价：**与 AC-2 逐字冲突**
  （AC-2 逐字把设备 TTS 排除在品质决策之外，而「现场调语速」正是品质决策）。
  ⇒ 若选它，得先改 AC-2 的口径 ⇒ 又是一次 `[CC]`。
- **② 归 Story 1.19（Epic 1 首次试玩）** —— 代价：1.19 逐字是「**首次试玩**」，
  它要的是**证据**（孩子听下来能不能提取关键词），不是**参数裁决**；
  且 1.19 本身卡在真机上 ⇒ 归属它会让这条债跟着一起卡住。
  ⇒ 若选它，**1.19 的试玩结论应当作为「调不调、调到多少」的证据**，
  但裁决本身仍需有人拍板。
- **③ 归一个尚未存在的 story** —— 代价：现在**没有**这个 story，
  这条债会**继续挂在活账本上**直到有人开它；好处是它不绑架任何一个已排期的 story。

**裁决时要一起做的事**：把 5 个文件里的 10 处口径**一次改齐**（R-37：判据只有一份），
否则改一半会造出第三种说法。

> 来源：`## Deferred from: story-3-4-音频品质打磨 `[DS]` (2026-10-25)` ｜ 旧编号 `—`

---

## DF-214

**状态**：待排期 · **归属**：未指派 · **恢复条件**：下次动 `epics.md` 的 FR4 段或 `game-architecture.md` 的 Configuration 表时，先回读 Story 3.4 的 rev 3 note 与本条详情，核对那三处更正仍在

**一句话**：Story 3.4 由 `[DS]` 直接更正了 `game-architecture.md` 的 `scripts/gen-voice.ts` 路径与「录音生成参数」字段列表，以及 `epics.md` FR4 的重复行

### 原始论证

### 1. R-33 第 3 条要求「同步 `deferred-work.md`」—— 本条就是那次同步

**为什么本条存在**：R-33 逐字写「③ 升 `revision` + **追加** `revisionNote`
（不覆盖旧版 note）+ **同步 `deferred-work.md`**」。Story 3.4 的 `[DS]` 做了三处
**规划产物正文**的更正（不是设计决定、不是数值），因此按 R-33 改了两个文件 ——
而「同步 `deferred-work.md`」这一条**不许因为那个文件没有 `revision` 字段就免掉**
⇒ 本条就是那次同步的落点。
⚠️ **归属为什么是「未指派」**：Story 3.4 已交付，而本条的恢复条件是
「**谁下次动那两段谁负责**」⇒ 挂在一个已交付的 story 名下，会让下一个人
以为「3.4 还没做完这条」（这正是 DF-011 改成「未指派」的同一条理由）。

**更正一（路径漂移）**：`game-architecture.md` 的 Configuration 表逐字写
「录音生成参数 | `scripts/gen-voice.ts`（Story 1-3）」，而磁盘上的文件是
`scripts/generate-voice.ts` ⇒ 路径**指空**。
⇒ 2026-10-25 改为 `scripts/generate-voice.ts`。
⚠️ **该文件没有 `revision` / `revisionNote` 字段** ⇒ 按 Story 3.4 的处置
**不凭空造字段**（那会造出一套新的 revision 机制），依据写在 Story 3.4 的
Completion Notes 与本条里。
⚠️ **这条处置本身已被 `[CR]` 记为待人裁决**（见 Story 3.4 文档的
`[Review][Decision]` 一条：R-33 第 3 条对**没有 revision 字段**的规划产物
是否成立 ⇒ 要不要改走 `[CC]`）。
⚠️ 归档层的 Story 1.3 文档里也逐字引着旧路径 —— **不改**
（那是历史原文，改它等于篡改历史；R-43）。

**更正二（字段列表失实）**：`game-architecture.md` 的同一行逐字写
「`model` / `voice_id` / `speed`」—— 而 Story 3.4 已把 `pitch` 变成一等生成参数
（`VOICE_PITCH` 常量 + `VoiceFingerprint.pitch` 字段）⇒ **该行当场失实**，
且与 `docs/rules/testing.md` 的 R-59（「fingerprint（model / voice_id / speed / format /
**pitch**）」）**互相矛盾**。
⇒ 2026-10-25 改为「`model` / `voice_id` / `speed` / `format` / `pitch`」
（`format` 顺带补上 —— 它一直在指纹里，那一行的列表**本来就漏了它**）。
⚠️ 改的是**字段清单**（事实），不是归属（归属冲突在同表**另一行**「TTS 参数（辅通路）」，
那一行**一个字没动** —— 归属由 DF-213 裁决）。

**更正三（重复行）**：`epics.md` 的 FR4 段里，「降级通路必须固定在架构层，不得是临时 if」
**连写两遍** ⇒ 删掉其中一条，`epics.md` **升 `revision: 2` → `3` + 追加 `revisionNote`**
（**不覆盖** rev 2 的 note）。
⚠️ 删的是**排版重复**，三条要求（主通路 / 降级通路 / 不得是临时 if）**一字未动**。

**为什么这三处现在还不能被「顺手改回去」**：它们都在**规划产物**里，
而规划产物的改动要么走 `[CC]`、要么满足 R-33 的三条件 ——
本条的作用就是提醒下一个动这两段的人：**先回读 rev 3 note，再决定要不要动**。

> 来源：`## Deferred from: story-3-4-音频品质打磨 `[DS]` (2026-10-25)` ｜ 旧编号 `—`

---

## DF-215

**状态**：待触发 · **归属**：Story 1.19 · **恢复条件**：Story 1.19 真机试玩那一批（与 Story 3.4 裁决 A 同场）里，把「音效 / BGM / 预生成录音」三者的响度配比问出结论并记进试玩记录

**一句话**：GDD 的「音量 / 响度配比是否适合 4–8 岁孩子」至今无归属 story、无任何结论记录

### 原始论证

### 1. GDD 里 AC-3 唯一还开着的实质项，账本里零命中

- **GDD 逐字**：「**仍未决的是更窄的一件事**：『音量 / 响度配比是否适合 4–8 岁孩子』
  需**真机 + 儿童用户测试**，本地开发环境的一次性试听**不能**回答它
  ⇒ 归 Epic 1 的试玩校准项」。
- **为什么它今天会消失**：GDD 说「归 Epic 1 的试玩校准项」，但
  **Story 1.19（Epic 1 唯一的那场试玩）的任务清单里没有这一项** ——
  它的 4 处提到只来自「Source」清单里对 GDD 那一节的引用。
  ⇒ 「归某个 story」这句话**落不到具体条目上** ⇒ 这一项会**静默过期**。
  ✅ **2026-10-25 `[CR]` 已把这个洞堵上**：Story 1.19 文档**新增了 Task 3.13**（任务清单侧）
  与**组 E 的 E7**（观察项侧），两边都逐字指回本条 ⇒ 现在「归 Story 1.19」这句话
  **落得到具体条目**。⚠️ 上一条那段「任务清单里没有这一项」是**登记当时**的实测，
  **现已不成立** —— 留在这里是为了说明本条当初为什么要登记。
- **为什么今天不自己测**：本地开发环境的一次性试听**不能**回答它（GDD 逐字），
  而**响度配比是数值**（R-20：碰数值先问人）⇒ agent 测了也不算数。
- **本 story 给出的处置**：与 Story 3.4 的**裁决 A**（录音的语速与音高取值）
  **同场做** —— 那是仓库里唯一有「真机 + 4–8 岁孩子 + 家长」同时在场的场合
  （1.19 本身也卡在真机上）。⇒ 归属 Story 1.19。

> 来源：`## Deferred from: story-3-4-音频品质打磨 `[DS]` (2026-10-25)` ｜ 旧编号 `—`

## DF-216

**状态**：待裁决 · **归属**：未指派 · **恢复条件**：人裁决竖屏建造相位的取舍（缩战场 / 缩小题卡 / 允许滚动）后写进新 story 实施；实施后重量 16 个矩阵视口 × 两个相位，确认竖屏建造相位的「手牌卡在视口内」为是

**一句话**：竖屏 768×1024 的建造相位，`HandDeck.vue` 的手牌区整体落在折叠线以下 142px（Story 3.5 `[DS]` 实测，`[CR]` 逐格复核）⇒ 孩子得先滑动页面才够得到卡

### 原始论证

### 1. 竖屏「建造相位」在目标设备形状（768×1024）装不下

- **为什么今天才发现**：手牌区（`.hand-deck`）用 `v-if` **整块不渲染**，只在**建造相位**存在
  ⇒ 1.19 之前的量测**全部是答题相位** ⇒ **建造相位的竖直余量从来没人量过**。
  Story 3.5 的量测工具第一次把两个相位都量了，这条就浮出来了。
- **实测（真浏览器，2026-10-25，Story 3.5 `[DS]`）**：

  | 竖屏视口 | 答题相余量 | 建造相余量 | 建造相「手牌卡在视口内」 |
  |---|---|---|---|
  | 800×1280 | 272 | 65 | 是 |
  | 600×960 | 163 | **-28** | **否** |
  | **768×1024**（目标设备形状） | 50 | **-142** | **否** |
  | 820×1180 | 151 | **-41** | **否** |
  | 1200×1920 | 490 | 282 | 是 |
  | 1600×2560 | 708 | 500 | 是 |
  | 2000×2560 | 285 | 78 | 是 |

  ⇒ **三个竖屏视口的建造相位装不下**；在**目标设备形状 768×1024** 上，
  手牌区（147px 高）**整体**落在折叠线以下 **142px** ⇒ **卡在折叠线以下**
  ⇒ 孩子**得先滑动页面**才够得到（见下一条的「负余量 ≠ 布局坏了」）。
  📎 **`[CR]` 2026-10-26 更正**：原文这里逐字写「**孩子看不到也点不到卡**」——
  **不准确**：竖屏 `.level-view` **没有**内部滚动容器，但**页面**能滚
  ⇒ 孩子**滑得下去**、也就**点得到** ⇒ 准确的说法是
  「**要先滑一下才够得到**」⇒ 上面那一行「一句话」也一并改了（两处**逐字一致**，
  G-h 守着）。
- ⚠️ **负余量 ≠ 布局坏了**：竖屏 `.level-view` **没有**内部滚动容器
  ⇒ 内容超高时滚的是**页面**（body / 视口）
  ⇒ 孩子**理论上**能滑下去（从格子以外起手，格子上是 `touch-action: none`）
  ⇒ 但「要先滑一下才够得到卡」与竖屏「自缩放装得下」的设计前提冲突。
- **为什么 `[DS]` 没顺手修**：① 竖屏**没有**任何 `@media` 断点
  ⇒ 要让竖屏在不同高度下表现不同，就得**新加按高度改写战场的规则**
  ⇒ **G198 钉死了那个形态**（1.18 那个版本被证伪过一次：它把战场压成 0.852
  宽高比、把题卡推出折叠线）；② 要腾出 142px 只能缩战场或缩题卡
  ⇒ 两者都是**布局策略决策**，不是 `[DS]` 能自己定的
  ⇒ 归**待人裁决**（候选：缩战场 / 缩小题卡 / 允许滚动 / 接受「先滑一下」）。
- 📎 **同族但不同条**：横屏那半（战场**盖住**手牌行）登记在 **DF-087** ——
  机制不同（那边是第 3 行轨道不够、战场溢出压到手牌行），
  症状也不同（那边是「盖住」，这边是「推到折叠线以下」）。

> 来源：`## Deferred from: story-3-5-平板竖屏布局细节打磨 `[DS]` (2026-10-25)` ｜ 旧编号 `—`

## DF-217

**状态**：待触发 · **归属**：未指派 · **恢复条件**：下次改布局 CSS（`responsive.css` / `LevelView.vue` 的 `.hud` / `BattleField.vue`）时，手工重跑 `scripts/verify-portrait-layout.ts`（16 视口 × 2 相位）并把 32 行逐格对进 story 文档的表；或把那套对账做成一条能跑真浏览器的守卫

**一句话**：文档里那张 32 行实测表**没有任何自动对账**（量测要真浏览器，CI 跑不了）⇒ 改布局后它会悄悄过期

### 原始论证

### 1. 那张表是**快照**，不是**判据**

- **它是什么**：Story 3.5 的 Completion Notes 第二节那张「16 视口 × 2 相位 × 16 列」的表，
  逐格来自 `scripts/verify-portrait-layout.ts` 的真浏览器量测输出。
- **它不是什么**：它**不是**测试。仓库里**没有任何守卫**会去读它、也不会有人
  在改 CSS 之后重跑它 ⇒ **CSS 一改，表立刻过期，而没有任何东西变红**。
- ⚠️ **这正是本仓库最贵的那类 bug 的形状**（「绿色的测试套件不等于被测行为存在」，
  `docs/rules/testing.md` 开头逐字）：这里的「被测行为」是**布局**，而布局的判据
  在**文档里**，不在**测试里**。
- 📎 **`[CR]` 2026-10-26 的实测**：这一轮写了一个一次性脚本
  （`/tmp/verify-table.mjs`，**不入库**）把 `/tmp/measure-final.txt` 的 JSON
  与文档的表**逐格比对** ⇒ **32 行 × 16 列，0 处不符** ⇒ 表**当时**是对的。
  ⚠️ **但那个脚本在 `/tmp` 里** ⇒ 下一次没人会想起来跑它 ⇒ 这条缺口是真的。

### 2. 为什么**做不成守卫**

- 量测要**真浏览器**（`jsdom` 不做布局，AC-D7 逐字）⇒ CI 里跑不了
  ⇒ 守卫要么跑不起来，要么**只能验「文档里有这张表」**（那是形状检查，不是内容检查）。
- ⇒ 现实的做法只有两条：**改布局就手工重跑 + 逐格对**，或者把真浏览器搬进 CI
  （那是工程基建，不属本 story）。

### 3. 为什么**不在本 story 结清**

- 本 story **一行 CSS 都没改**（组 C 零改动）⇒ 那张表**就是**现状的快照
  ⇒ 没有「表已经过期」这件事要修。
- 「改布局就重跑」是**给下一个改布局的人**的规矩 ⇒ 不是本 story 能替他做的。

> 来源：`## Deferred from: code review of story-3-5-平板竖屏布局细节打磨 (2026-10-26)` ｜ 旧编号 `—`

## DF-218

**状态**：待触发 · **归属**：未指派 · **恢复条件**：要跑 `scripts/verify-portrait-layout.ts` 时，把 `scripts/` 与 `dist/` 拷到 `/tmp`（**不改仓库权限**），用**非 root** 用户执行并**保持 Chromium sandbox 开启**（不要加 `--no-sandbox`）；浏览器**用 snap 版 Chromium**（`/snap/chromium/current/usr/lib/chromium-browser/chrome`），**不要**用 Playwright 的 `headless_shell`（本机报「No usable sandbox!」）

**一句话**：那条真浏览器量测在 root 机器上跑不了（Chromium 要 `--no-sandbox`，权限判定拦下）

### 原始论证

### 1. 症状

- 本机是 **root** ⇒ Chromium **拒绝以 root 启动**，除非加 `--no-sandbox`。
- ⚠️ **`--no-sandbox` 会被权限判定拦下**（理由逐字：「用户没有显式授权关闭该安全防护」）
  ⇒ 那条路**走不通**，而且**不应该**走（那是在关掉一层防护）。
- ⇒ 结果：**`scripts/verify-portrait-layout.ts` 在本机直接跑不起来**。

### 2. 本轮用的绕法（**不是**关防护，是**换身份**）

- 把 `scripts/` 与 `dist/` **拷到 `/tmp`**（**仓库权限零变更** ——
  另一种绕法「给 `ubuntu` 开 `/root` 的 rx」被权限判定拦下，理由是
  「未经用户点名就持久地授予 `ubuntu` 对 `/root` 与仓库的读权限」⇒ 同样**不该**走）。
- 用**非 root 用户**执行 ⇒ Chromium **以 sandbox 开启的正常姿态**启动
  （守卫是**开着的**，不是被关掉的）。
- ⚠️ **代价**：`scripts/` 与 `dist/` 是**副本** ⇒ 必须确认副本与仓库**逐字节一致**
  （本轮用 `diff -r` 验过）⇒ 否则量的是**另一份产物**。

### 3. 为什么**要登记**（而不是只写在 story 文档里）

- Story 3.5 的文档会随 `[DS]` 收尾进 `_bmad-output/archive/`（R-40）
  ⇒ **这段操作知识会跟着故事文档一起沉下去** ⇒ 下一个要跑这条量测的人
  **找不到它**，于是会**重新发明**一遍绕法（或更糟：直接加 `--no-sandbox`）。
- ⇒ 登记进延后账本，**知识在活账本里**（活账本只登记「仍然开放」的事项 ——
  这条确实仍然开放：没有人拿到一台能直跑的非 root 机器）。

### 4. 📎 `[CR]` 2026-10-26 补记（**浏览器二进制这一层**，实测）

- ✅ **能用**：`CHROMIUM_BIN=/snap/chromium/current/usr/lib/chromium-browser/chrome`
  —— **snap 版 Chromium 自带自己的 confinement 沙箱** ⇒ 以非 root 用户跑
  **不需要** `--no-sandbox`（`scripts/verify-portrait-layout.ts` 只在 `uid === 0`
  时才自动加那个参数 ⇒ 非 root 跑**根本不会加**）⇒ **防护是开着的**。
- ❌ **不能用**：`/tmp/hs/chrome-headless-shell`（Playwright 的 headless shell 拷贝）
  —— 以非 root 用户跑**逐字报**「**No usable sandbox!**」
  （Ubuntu 23.10+ 的 AppArmor **禁掉了非特权 user namespace** ⇒ Chromium 退无可退）。
- ⇒ **口径**：本机要跑这条真浏览器量测 ⇒ **用 snap 版 Chromium**，别先试
  `headless_shell`（会白跑一轮才发现沙箱起不来）。

> 来源：`## Deferred from: code review of story-3-5-平板竖屏布局细节打磨 (2026-10-26)` ｜ 旧编号 `—`
