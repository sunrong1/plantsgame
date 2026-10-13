---
baseline_commit: ff14483f91bd639b87695625f090ed6e134d3408
---

# Story 1.2: 音频解锁与 TTS 朗读

Status: review

> 📌 **2026-10-13：置 `review`（代码侧结清，只等真机）。**
> 两轮 `[CR]` 的 10 条 patch 全部修复并经**变异验证**；被撤回的那条
> （AC-1 时序断言「有洞」）也已由变异验证证明不成立，复选框补勾为 `[x]`
> —— 它的结论是**无需改动**，不是「漏做」。
>
> **仍未过的门只有一个：AC-8 真机验收（Task 7.4–7.7）。**
> 用户 2026-10-13 决策延后（原话「平板当前维护台测试比较困难，遗留后面测试」），
> §13.5 又禁止用 headless / 非目标设备代替 ⇒ **代码侧无法代做，也不应该代做**。
>
> ⚠️ **所以本 story 不会置 `done`，直到真机结论回填。** 置 `review` 而非 `done`
> 是为了如实反映「已交付、待设备」，**不是**宣称全部 AC 已达成。
> AC-8 的产物（本机命中的音色名 + Chrome 版本号）是 **Story 3.4** 的输入。
>
> **不阻塞下游：** `playPronunciation` 的代码契约已完备，185 个用例全绿，
> 后续 16 个 story 可照常开发。

> ⚠️ **2026-10-12 二轮 `[CR]` 后由 `review` 回退为 `in-progress`。**
> 代码侧的 10 条 patch 已全部修复并经变异验证，但 **AC-8 仍然开着** ——
> Task 7.4–7.7（平板长句听得出 `ball` + 记录本机命中的音色名与 Chrome 版本号）全未勾。
> spec §13.5 禁止用 headless 代替，所以这不是实现者的过失；
> 但 AC-8 未达成就不能收口，且其产物（音色名）是 Story 3.4 的输入，
> 不能带着空值往下传。裁决见 Review Findings 的决策 2。

> Ultimate context engine analysis completed —— 完整的开发者实施指南已生成。
> 本 story 的 AC 大多是**「在某处必须是同步的」「某条分支必须走降级」**这类**靠肉眼极难判定**的验收，
> 失败方式全部是**静默的**（不报错、只是没声音）。
> 因此 Dev Notes 的重心在三处：**① 依赖方向上 `views/` 不得直接 import `services/`**；
> **② 用 ESLint 禁 `await` 把 FR2 变成可执行的静态守卫**；
> **③ 继承 legacy 的算法，绝不继承 legacy 的形态（单例 class）**。
>
> ⚠️ **本 story 做了 2026-10-12 的联网核实，结果推翻了旧代码注释里的两条说法 —— 见 §13。**
> 其中一条（`cancel()` 的理由）需要实现者**在写注释时更正**，
> 另一条（Android 上必须同时设 `lang`）意味着本 story 要比 legacy 多写代码。
> **不要照抄 legacy 的注释。**

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 孩子,
I want 点「开始游戏」之后就能听到题目被念出来、并且想听几遍就听几遍,
So that 我能先听懂再选，而不是靠猜。

**依赖：** 仅 Story 1.1。依赖链上 `1.1 → 1.2`；1.2 与 1.3 是并列的（都只依赖 1.1），二者互不依赖。

---

## Acceptance Criteria

> epics.md 中 Story 1.2 的验收标准以 Given 块给出、未编号（实测 4 个 Given 块 + 1 组尾部 `And`）。
> 编号规则：**4 个 Given 块 → AC-1 / AC-3 / AC-4 / AC-5**；
> Given ① 里独立成条的 `preheat 不得无限等待` 拆为 **AC-2**；尾部三条全局 `And` → **AC-6**；
> **AC-7 ~ AC-10 是本 story 新增**（分别对应：联网核实暴露的长文本截断、真机验收细项、范围边界、工具链守卫）。
> **AC 原文不得删改** —— 唯一例外是 AC-6 的 `cancel()` 理由，Dev Notes §4.1 有显式豁免说明。

### AC-1 「开始游戏」内同步完成三步解锁

**Given** 平板上首次打开页面
**When** 点击「开始游戏」按钮
**Then** 以下三步在**同一个同步执行块**内完成：① `audioCtx.resume()` ② TTS `speakSilentWarmup()`（`volume = 0` 的空 utterance）③ BGM buffer 预解
**And** 三者之间**不存在任何 `await`** —— 手势上下文一旦让出，Android 音频解锁会静默失败

### AC-2 preheat 不得无限等待

**Given** `speakSilentWarmup()` 发出的预热 utterance
**When** `onend` / `onerror` 二者之一触发
**Then** 标记预热完成
**And** 二者都不触发时，仍须在超时后标记完成 —— **不得无限等待**

### AC-3 朗读的触发与「无限次重听」语义

**Given** 音频已解锁
**When** 任意一题的卡面出现
**Then** 自动播放一次该题 TTS 朗读
**And** 孩子点击卡面可无限次重听，无任何代价、无次数限制、无答题次数扣减

### AC-4 音色优先级链与回退

**Given** 设备上的首选音色不存在
**When** 播放朗读
**Then** 按音色优先级链自动回退：`Google UK English → Google US English → Microsoft Hazel/Susan → Samantha/Karen → 任意 en-US → 任意 en`
**And** 不报错、不静默失败
**And** 同时设置 `utterance.lang`（不止 `utterance.voice`）—— Android 上 `voice` 可能被整个忽略（社区共识 (B)，见 §4.2 的证据等级更正）
**And** 音色 `lang` 匹配兼容下划线形态（Android 常返回 `en_US`），不得只判 `startsWith('en-US')`

### AC-5 不可用时降级且绝不阻断回合

> ⚠️ **2026-10-12 第二轮 `[CR]` 纠偏批注 —— 本段字面已被实现推翻，请勿照字面验收。**
> `[CC]` 把主备对调成「预生成录音为主路」后，`playPronunciation` 的签名是
> `playPronunciation(text, entryId?)`，**且兜底的落点变了**：
> 带 `entryId` 时先试录音，录音失败才回落 TTS；**不带 `entryId` 时直接走 TTS**，
> 而 TTS 再失败就只剩一条 `console.warn` —— `fallbackToRecording` **不播任何音频**。
>
> 所以准确表述是：**「有 `entryId` → 降级到录音；无 `entryId` 且 TTS 也失败 → 无声但不阻断。」**
> 「不阻断回合」这半句仍然成立且是硬要求；「必有兜底音频」这半句**只对传了 `entryId` 的调用方成立**。
> 这一前提已写成 `playPronunciation` 的显式契约（见该函数注释）并由测试钉住；
> Story 1.10 起**必须**为每个朗读调用传入 `entryId`。

**Given** `speechSynthesis` 完全不可用，或某次 `speak` 抛错
**When** 需要发音
**Then** 走**统一的 `playPronunciation(text, entryId?)` 接口**降级，架构层固定，不存在临时 `if`
**And** 记 `WARN` 日志（前缀 `[tts]`）
**And** **回合流转不中断** —— TTS 挂掉游戏仍须能玩

### AC-6 参数常量、起声预算与 cancel 时机

**And** TTS 点击后 ≤ 500ms 起声（NFR4）
**And** 朗读参数为可配置常量：单词 `rate 0.85 / pitch 1.05`，长句 `rate 0.9`（起点，Epic 3 现场调）
**And** `speechSynthesis.cancel()` 仅在 `speechSynthesis.speaking === true` 时被调用 —— 用于避开 `cancel()` 吞掉紧随其后的 `speak()` 的竞争窗口（Chromium issue 41436964）

### AC-7 长文本分块与超时兜底

**Given** 一次朗读的文本长度
**When** `playPronunciation(text)` 执行
**Then** 按句切块、逐块 `speak()`、用 `onend` 链式推进，**单块上限 200 字符**
**And** 每块与整个播放都**有超时兜底** —— Chrome 的 ~15 秒截断 bug 会**静默中断**（不触发 `onend`，也不触发 `onerror`，`speaking` 仍为 `true`）
**And** `rate` 不得超过 2.0（超过会让 Chrome 事件系统挂死，需 `cancel()` 恢复）

### AC-8 真机验收标准（「有声音」不算通过）

**Given** 目标平板（华为 Android，竖屏）上运行本 story
**When** 朗读教材长句 `I have a ball for my dog.`
**Then** **孩子能听出关键词 `ball`**
**And** 记录本机实际命中的音色（大概率是 fallback 而非英式首选），供 Story 3.4 校准
**And** 反复点「开始游戏」5 次，确认不出现重复预热、不出现第二次点击开始静默失败的迹象
**And** 记录**本机实际命中的音色名**（`Google UK English` / `Google US English` / 某个 `en-US` fallback…）与 Chrome 版本号 —— Story 3.4 的音色校准与语速校准都依赖这两项
**And** **不承诺「音频会话已可用」** —— Chrome 的自动恢复还需「对源节点调 `start()`」，那要到 Story 1.13 的第一个真实音效才成立（Dev Notes §13.1 A3）

> ⚠️ **本 story 的真实验收不是「有声音」。** TTS 能否发声已由旧项目在同一台华为平板上验证
> （GDD §Platform-Specific Details）。真实验收是**长句效果**：旧项目只念过 7 个植物名，
> **从未念过带冠词介词的长句** ——「能念单词」不等于「能念长句」。

### AC-9 不越界（本 story 明令不做的事）

**And** `src/components/quiz/` 下**没有**任何组件 —— 卡面「出现即朗读」与「点击重听」的 UI 属 Story 1.10
**And** **没有**创建 `src/app/effects-runner.ts` / `src/core/effects.ts` —— 副作用编排属 Story 1.13
**And** `public/assets/audio/` 下**没有**任何音频资源文件 —— BGM 与音效资源属 Story 1.13
**And** **没有**创建任何调试面板 UI —— 降级状态仅通过日志与返回值暴露，UI 属 Story 1.16
**And** `src/core/` 下**没有**新增任何文件 —— 本 story 与战斗内核零交集
**And** 没有引入任何音频库（Tone.js / Howler.js 等）—— 原生 Web Audio + Web Speech API 已足够
**And** 没有实现音量设置 / 静音开关（epics 全文无此需求）

### AC-10 边界在工具链层成立

**Given** 在音频解锁链路的任一文件（`src/services/audio.ts` / `src/services/pronunciation.ts` / `src/app/audio-unlock.ts`）里写一行 `await`
**When** 执行 `npm run lint`
**Then** 报错 —— 因为这三条文件上挂了 `no-restricted-syntax` 禁 `AwaitExpression`
**And** 该守卫由 `tests/scaffold/` 下的回归测试守护（断言规则存在、严重级别为 `error`、且覆盖这三个文件）
**And** **反向验证**：故意在解锁链路加一个 `await`，确认 `npm run lint` 真的会红 —— 光看到测试变绿不算数

**And** `tsconfig.test.json` 的 `include` 已覆盖 `src/services/**` 与 `src/app/**`，
使 `tests/` 里 import 服务层源码时 `vue-tsc -b` **不报 TS6307**（实测阻断项，见 Dev Notes §7.2）

> AC-10 是本 story 独有的。epics 的 1-2 没有这一条，但 FR2 是**唯一一个「写了 await 就彻底失效、
> 且编译与运行都不报错」的验收** —— 没有静态守卫的话，它在评审与后续维护中必然漂移。
> 类比 Story 1.1 的 AC-2（「`core/` 边界在工具链层成立」），同一条思路。

---

## Tasks / Subtasks

> ⚠️ **Task 0 必须最先做。** 它是 Task 6（测试）的硬前置 —— 不做的话 Task 6 一写测试，
> `npm run build` 立刻失败，**且失败信息与「音频」毫无关系**（报的是 tsconfig 文件归属问题）。
> 这正是 Story 1.1 交接信息里「`tests/` 与 `scripts/` 逃出 tsconfig 归属检查」那条的同类地雷（见 §14 交接信息行）。

- [x] **Task 0 —— 把 app 层源文件纳入测试项目（实测必做，非可选项）**（AC: #10）
  - [x] 0.1 改 `tsconfig.test.json` 的 `include`，追加 `"src/services/**/*.ts"` 与 `"src/app/**/*.ts"`
  - [x] 0.2 **不要**改 `references` —— 详见 Dev Notes §7.2 的两条实测对照（那条路会报 TS6310）
  - [x] 0.3 改完立刻跑 `npx vue-tsc -b --force`，确认**零输出**

- [x] **Task 1 —— `src/services/pronunciation.ts`：TTS 引擎 + 统一发音接口**（AC: #2 #3 #4 #5 #6 #7）
  - [x] 1.1 定义可配置常量：`SPEECH_RATE_WORD = 0.85` / `SPEECH_PITCH_WORD = 1.05` / `SPEECH_RATE_SENTENCE = 0.9` / `SPEECH_PITCH_SENTENCE = 1.0` / `MAX_CHUNK_CHARS = 200`（AR34；长句 `0.9` 是**起点**，Epic 3 / Story 3.4 现场调）
  - [x] 1.2 定义音色优先级链 `VOICE_PRIORITY`（AR32，六档，见 Dev Notes §4.3）
  - [x] 1.3 `probeTts(): TtsStatus` —— 探测 `speechSynthesis` 是否存在 + 可用音色数（AR35）；同时**同步调一次 `getVoices()` 并订阅 `voiceschanged`**（两者都要，§13.2 A12）。**首次调用时缓存结果**，后续调用直接返回缓存
  - [x] 1.3b ⚠️ **`probeTts()` 的调用点在 `speakSilentWarmup()` 内部首行**（AR35「启动时探测」的落点，见 §6 决策 4）。**不要**在 `unlockAudioSequence()` 里加第四个调用 —— 那会违反 §5 规则 1
  - [x] 1.4 `selectVoice(voices): SpeechSynthesisVoice | null` —— 按优先级链匹配；**一个 en 音色都没有时返回 `null`，不得抛**；lang 匹配用 `/^en[-_]/i` 兼容下划线
  - [x] 1.5 `speakSilentWarmup(): void` —— fire-and-forget，`volume = 0`，`onend`/`onerror` 二者之一即标记完成，**另加超时兜底**（AC-2）；已预热则直接返回（幂等）
  - [x] 1.6 `playPronunciation(text: string): void` —— **唯一对外发音接口**；内部：① 分块（≤200 字符）+ `onend` 链式推进 ② 每块设 **`voice` 与 `lang`** ③ 仅在 `speaking === true` 时 `cancel()` ④ `speak` 抛错 → 降级到预置录音 + `WARN` `[tts]` + **绝不向调用方抛**
  - [x] 1.7 全部实现**同步**（禁 `await`），`onend`/`onerror` 回调内不做需要等待的事

- [x] **Task 2 —— `src/services/audio.ts`：AudioContext 会话**（AC: #1 #5）
  - [x] 2.1 模块级 `let audioCtx: AudioContext | null = null`（**不导出一个新建的实例**，见 Dev Notes §4.4）
  - [x] 2.2 `unlockAudioSession(): void` —— 首次调用时 `new AudioContext()`，之后每次都 `void ctx.resume().catch(WARN)`；**全程同步，不 `await`**
  - [x] 2.3 `getAudioContext(): AudioContext | null` —— 供 Story 1.13 取用
  - [x] 2.4 `prewarmBgm(): void` —— **本 story 为空实现 + 明确的 `TODO(Story 1.13)` 注释**（理由见 Dev Notes §6「决策 1」）
  - [x] 2.5 任何失败路径只记 `WARN` `[audio]`，**不抛、不弹窗**（NFR13「孩子面前永不出现技术错误」）

- [x] **Task 3 —— `src/app/audio-unlock.ts`：三步同步块**（AC: #1 #2）
  - [x] 3.1 导出 `unlockAudioSequence(): void`，函数体是**三行同步调用**：`unlockAudioSession()` → `speakSilentWarmup()` → `prewarmBgm()`
  - [x] 3.2 **该文件是本 story 唯一允许出现「调用顺序」语义的地方**，三行之间不得有任何语句（更不得有 `await`）
  - [x] 3.3 不在此文件做条件判断、不在此文件吞异常

- [x] **Task 4 —— `StartView.vue` 接上点击**（AC: #1 #8）
  - [x] 4.1 删除 `src/views/StartView.vue:26` 的 `TODO(Story 1.2)` 空实现，改为调用 `unlockAudioSequence()`
  - [x] 4.2 **⚠️ 不加 `starting` ref、不加 `:disabled`** —— 理由见 Dev Notes §6「决策 2」
  - [x] 4.3 保留按钮的 `min-height` / `min-width` / `:active` 缩放不动（Story 1.1 的 AC-1 已验收）
  - [x] 4.4 更新文件头部注释：把「不实现音频解锁 / TTS —— 属 Story 1.2」这条**删掉**（已实现）

- [x] **Task 5 —— ESLint 静态守卫：解锁链路禁 `await`**（AC: #10）
  - [x] 5.1 在 `eslint.config.js` 追加一个 `files: ['src/services/audio.ts', 'src/services/pronunciation.ts', 'src/app/audio-unlock.ts']` 的 config 块
  - [x] 5.2 `rules: { 'no-restricted-syntax': ['error', { selector: 'AwaitExpression', message: '...' }] }`
  - [x] 5.3 **不要**把这条规则扩大到整个 `src/services/` —— Story 1.14 的 `save.ts` 合理需要 `await`
  - [x] 5.4 **有意不覆盖 `src/views/StartView.vue`** —— 见 Dev Notes §5 的说明。写 `async onStart()` + `await unlockAudioSequence()` **不违反 FR2**（FR2 管的是「三步**之间**」无 `await`，而这里的 `await` 发生在三步**之后**），但它是个坏味道。若将来要扩到 `src/views/**`，那是 Story 1.13+ 的决定，不在本 story
  - [x] 5.5 在 `tests/scaffold/` 新增守卫测试，断言规则的**严重级别**与**覆盖文件名单**（不是「规则存在」—— 那是 Story 1.1 `[CR]` Debug Log #7 踩过的坑）

- [x] **Task 6 —— 服务层单元测试**（AC: #2 #4 #5 #6 #7）
  - [x] 6.1 `tests/services/pronunciation.test.ts`：音色链 6 档逐档断言 + 全无 en 音色返回 `null` + `speaking === false` 时**不得**调用 `cancel` + `speaking === true` 时**才**调用 + `speak()` 抛错时降级且不外抛 + `onerror` 触发即完成 + 两者都不触发时超时完成（`vi.useFakeTimers()`）+ **同时断言设了 `voice` 也设了 `lang`**（§4.2）
  - [x] 6.2 `tests/services/audio.test.ts`：重复调用 `unlockAudioSession()` 只创建一个 `AudioContext`；`resume()` 的 Promise reject 时只记日志不抛
  - [x] 6.3 `tests/services/pronunciation.test.ts` 内另加分块用例：超长文本被切成多块、按 `onend` 链式推进、单块均 ≤200 字符（AC-7）
  - [x] 6.4 **Node 环境里三个浏览器 global 都不存在，三个都必须 stub**：
    - `pronunciation.test.ts` → `vi.stubGlobal('speechSynthesis', …)` + `vi.stubGlobal('SpeechSynthesisUtterance', …)`
    - `audio.test.ts` → `vi.stubGlobal('AudioContext', …)`（**`AudioContext` 与前两个同理，Node 里不存在**；漏了会得到 `ReferenceError: AudioContext is not defined`，fake 的 `resume()` 须返回 Promise）
    - 两个文件都要在 `beforeEach` 里 `vi.resetModules()` 后**动态 `await import()`** —— 模块级状态会跨用例污染（Dev Notes §7）
  - [x] 6.5 **不要**为 `StartView.vue` 写组件测试 —— 架构 NFR17「不得为组件编写业务逻辑测试」，且 1.1 已定此先例

- [ ] **Task 7 —— 逐条验收 + 真机**（AC: #1 #8 #10）
  - [x] 7.1 `npm run lint` / `npm run test` / `npm run build` 三条全过
  - [x] 7.2 **反向验证（判据是 lint 会红）**：在 `src/app/audio-unlock.ts` 里加一个 `await`，跑 `npm run lint` 必须报 `no-restricted-syntax`；验证后删除
  - [x] 7.3 **反向验证**：把 `pronunciation.ts` 里的 `if (speechSynthesis.speaking)` 守卫删掉（改成无条件 `cancel()`），跑 `npm run test` 必须红
  - [ ] 7.4 **真机**（用户配合，`npm run dev` + 平板浏览器访问 `http://<开发机IP>:5173`）：点「开始游戏」→ 用 DevTools/日志确认 `probeTts()` 返回 `available`；连续点 5 次确认无重复预热
  - [ ] 7.5 **真机长句验收（AC-8 的本体）**：在平板上念 `I have a ball for my dog.`，确认能听出 `ball`；记录本机命中的音色名
  - [ ] 7.6 **记录设备信息（AC-8 的必填项）**：Chrome 版本号 + **本机实际命中的音色名**。设备已确认有 Chrome（§13.3），Chrome 上下文取 `about:blank` 页的 UA 或 `chrome://version`
  - [ ] 7.7 **⚠️ 绝不用无头浏览器代替真机验收**（§13.5：headless 下 TTS 完全不工作，`voiceschanged` 永不触发）

  > ⚠️ **Task 7.4–7.7 仍未完成，且已由用户决定延后。** 以下是 2026-10-12 的**桌面预验**，
  > 记在这里是因为它提前暴露了一个 AC-4 的真缺陷 —— 但它**不构成 AC-8 达成**：
  > 目标平板的音色列表与 Chrome 版本号仍未取得（§13.5 禁止用 headless / 非目标设备代替）。

  > 📌 **2026-10-13 用户决策：平板真机验收延后。** 原话「平板当前维护台测试比较困难，遗留后面测试」。
  >
  > **延后不影响下游 story 的代码交付** —— `playPronunciation` 的代码侧已完备，
  > 113 个用例全绿，16 个下游 story 按这个契约调用即可。
  > 它只卡住两件事：
  >
  > ① **本 story 置 `done`** —— AC-8 仍开着，故事保持 `in-progress`；
  > ② **Story 3.4 的音色校准输入** —— 英式/美式的取舍取决于真机实际命中的音色名。
  >
  > ⚠️ **连带后果：英式优先的修法也被一并冻住。** 桌面已证明
  > `VOICE_PRIORITY` 的精确匹配在 `Google UK English Female` / `... Male` 命名下会失效
  > （详见下方「真机验收记录」），但**修法取决于真机音色名** ——
  > 拿桌面证据猜平板，猜错就是白改一轮。**在拿到真机音色列表之前不要动 `VOICE_PRIORITY`。**
  >
  > 恢复条件：拿到目标平板的音色列表 + Chrome 版本号（Task 7.6）即可一次性收口 ——
  > 回填 AC-8、定 `VOICE_PRIORITY` 的修法、勾 7.4–7.7、置 `done`。

#### 真机验收记录

##### 2026-10-12 · 桌面预验（Linux + Chrome，**非目标设备**）

| 项 | 结果 |
|---|---|
| `probeTts()` | `{ state: 'available', voiceCount: 22 }` |
| 可见音色数 | 22 |
| **实际命中的音色** | `Google US English`（`en-US`, `localService: false`） |
| **长句** `I have a ball for my dog.` | ✅ 正常，**能听出 `ball`** |
| 切句 `The cat is on the table.` | ✅ **无两声重叠**（`[CR]` 二轮 P1 的直接验收） |
| 长句截断 | ✅ 未被截断（AC-7 分块契约在真实浏览器上成立） |

**✅ 这一轮确认了 `[CR]` 二轮 P1 的修复在真实浏览器 + 真实音频上生效** ——
录音↔TTS 的发声权接管不再有交叉格漏网。（本轮走的是 TTS 通路：
`public/assets/audio/voice/` 为空，录音全部 404 回落到 TTS。）

##### ⚠️ 本轮提前暴露的 AC-4 缺陷：**英式优先在这类设备上完全失效**

设备上**有**英式音色，但名字是：

```
'Google UK English Female'   'en-GB'
'Google UK English Male'     'en-GB'
'Google US English'          'en-US'   ← 实际命中的是这个
```

而 `VOICE_PRIORITY`（`src/services/pronunciation.ts:67-74`）走的是**精确字符串匹配**：

```js
'Google UK English',   // ← 设备上不存在这个名字，精确匹配不中
'Google US English',   // ← 第二档命中，直接返回
```

⇒ 第一档空转，美音胜出，**英式优先静默失效**。
而英式优先的立论是「上海版教材录音多为英式」（GDD），认读质量是本作核心支柱 ——
不是「能发音就行」的问题，是**发音与教材录音对不上**。

⚠️ **尚不能据此改代码**：这台是桌面 Linux，目标华为平板上 Google TTS 提供的音色名
是否相同**未知**，而这恰好是 AC-8 要记录的东西。改法取决于真机数据：

| 若真机上是… | 正确改法 |
|---|---|
| 同样叫 `... Female` / `... Male` | 加进 `VOICE_PRIORITY`，或改前缀匹配 |
| 别的名字 | 前缀匹配（`'Google UK English'` 可覆盖两种变体）治标，需按真机名单补全 |

**⇒ 这一条正是 AC-8 必须真机跑的实证理由，而不是形式主义。**

##### 顺带记录一个**不是** bug 的现象

桌面首测 `isPrewarmed()` 返回 `false`，排查后确认是**读法问题不是实现问题**：
`preheated` 只在预热 utterance **结束**时置位（`settle()`，`pronunciation.ts:458-463`），
超时兜底 `PREHEAT_TIMEOUT_MS = 1500` —— 即发起即查必然读到 `false`，等 2 秒即为 `true`。
`isPrewarmed()` 的语义是「**已完成**」而非「**已发起**」，
与它上方注释里的「AC-2 的可观测状态」一致。**不改代码**，但接入 Story 1.16
调试面板时要注意别在点击的同一帧读它。

  > ⚠️ **7.1–7.3 已完成，7.4–7.7 需要真机，代码侧无法代做**（§13.5：headless 下 TTS 完全不工作）。
  > 交付时 7.4–7.7 保持未勾选，由用户在 `[CR]` / 真机环节执行并回填 —— 与 Story 1.1 回填
  > 「平板真机实测结果」的先例一致。story 状态置 `review`，真机结论回填后即可置 `done`。

### Review Findings

> `[CR]` 2026-10-12 三层对抗审查（Blind Hunter / Edge Case Hunter / Acceptance Auditor）。
> 分诊结果：17 条可自动修复、2 条延后、3 条判为噪声（其中 2 条为用户裁决）。
> **P1–P3 是同一个设计缺陷的三个症状**（`speakChunkAt` 内既管 cancel 又管 onerror 推进、且无跨调用代次隔离），
> 一处重构可同时消解。

#### 已裁决

- [x] [Review][Decision→Dismiss] `isPrewarmed()` 是恒真信号，不是健康信号 ——
  AC-2 只要求「标记预热完成」，实现照做了。但 `speak()` 收下 utterance 后被静默丢弃时
  （队列 paused / 音频仍锁着 / 平台不播 volume=0），onend / onerror 都不来，
  1500ms 超时照样把 `preheated` 置 true —— Story 1.16 的调试面板会在 TTS 完全哑掉时报告「已预热」。
  **[2026-10-12 裁决：不处理]** —— 超时兜底本就是「宁可误报也不可挂死」的取舍，
  AC-2 的字面要求已达成。⚠️ **继承提醒：Story 1.16 的调试面板不得把 `isPrewarmed()`
  当作「TTS 已就绪」的健康判据**，它只表示「预热流程已收敛」。
  [src/services/pronunciation.ts:240-261]

- [x] [Review][Defer] ESLint 守卫只禁 `AwaitExpression`，`.then()` 的等价逃逸完全放行 ——
  有人把 `audio-unlock.ts` 的三步改写成 `ctx.resume().then(() => { speakSilentWarmup(); prewarmBgm() })`，
  第②③步就落到微任务里、不再处于手势同步块（Android 解锁静默失效，正是这条守卫要防的失败模式），
  而 lint 全绿、守卫测试也全绿（它只断言规则对象的形状，从不验证「有逃逸就报错」）。
  **[2026-10-12 裁决：延后到 Story 1.13]** —— AC-10 明确把 selector 钉死成 `AwaitExpression`，
  扩它属于超出本 story 的 spec；effects-runner 决定异步形态时才是收口的时机。
  ⚠️ 另注：守卫测试目前只断言规则对象的形状，**从不验证「有逃逸就报错」**，
  即便日后扩了 selector，也需要补一条变异式的反向验证。
  [eslint.config.js:102-112] — deferred, 见 `deferred-work.md`

#### 可自动修复

- [x] [Review][Patch] **`utterance.onerror = advance` 把「被取消」当成「这块念完了」** ——
  `cancel()` 会对被取消的 utterance 派发 `error('canceled')`，于是 `advance` 照常推进到下一块，
  而下一块又看到 `speaking` 为真 → 再 `cancel()` → …… 一次 cancel 之后链一路念到底。
  实测事件序列：`SPEAK END CANCEL ERR SPEAK ERR SPEAK ERR SPEAK ERR`（一次 cancel 后冒出 3 次 SPEAK）。
  与 `onend` 共用同一个 `advance`，朗读失败既不记 WARN 也不降级。
  [src/services/pronunciation.ts:379-380]
- [x] [Review][Patch] **跨调用无代次隔离，多条朗读链互相 cancel / 复活** ——
  长句（960 字符 / 5 块）朗读中途点新卡的单词 `Ball`：`Ball` 的 cancel 杀掉旧块 → 旧块 onerror →
  旧链 `advance` 继续念 4 块，每块又 cancel 掉 `Ball`。实测发音顺序里 `Ball` 排在最后，
  前面插了 4 块旧文本 + 5 次无谓 cancel。孩子点的词被念了但立刻被掐，且不会重念 ——
  这正是 AC-3「点击卡面可无限次重听」的核心交互。需要模块级 in-flight 标记 + generation 计数。
  [src/services/pronunciation.ts:347-402]
- [x] [Review][Patch] **`cancel()` 写在 `speakChunkAt` 内，每推进一块就重新求值一次** ——
  实测 940 字符文本切成 7 块 → `cancelCalls = 6`。注释自称「用先判断 speaking 避开 cancel→speak 竞争窗口」，
  实测并未避开：浏览器在 `onend` 回调期间仍可能把 `speaking` 报成 true（队列未清空），
  此时 cancel 紧邻 speak 正面命中 Chromium issue 41436964，链在第 2 块静默断掉（不报错、不触发 onerror、不降级）。
  正确位置是 `playPronunciation` 入口处做一次「打断上一段」，不是每块一次。
  [src/services/pronunciation.ts:386-388]
- [x] [Review][Patch] **朗读 utterance 的 `onerror` 既不记 WARN 也不走降级** ——
  `fallbackToRecording` 只在「synth 不可用」与「`speak()` 同步抛错」两处被调。
  但真实浏览器里 `speak()` 极少同步抛错，主要失败形态恰恰是异步 `onerror`
  （`not-allowed` / `interrupted` / `canceled`），正好落在无日志、无降级的那条路上。
  `game-architecture.md:551` 的参考实现明确写 `utterance.onerror = () => log.warn('tts failed', text)`。
  [src/services/pronunciation.ts:380]
- [x] [Review][Patch] **链条中途 `speak()` 抛错 → 后续所有块被静默丢弃** ——
  catch 里只对当前块调 `fallbackToRecording` 然后 `return`，`advance` 再也不会被调用。
  实测 5 块文本第 2 块抛错 → 第 3/4/5 块零动作、零日志，回合侧完全看不出丢了 60% 的文本。
  [src/services/pronunciation.ts:390-396]
- [x] [Review][Patch] **`ensureVoices()` 无 `typeof getVoices` 守卫，异常外抛且 `voicesHooked` 被永久焊死** ——
  `voicesHooked = true` 写在 `getVoices()` **之前**；`getSynthesis()` 只校验 `speak` 不校验 `getVoices`。
  实测（有 speak 无 getVoices 的环境）：`playPronunciation('ball')` 抛 `TypeError`；
  同一路径经 `probeTts()` → `ensureVoices()` 触发时，异常从 `unlockAudioSequence()` 第二步冒出，
  **第三步 `prewarmBgm()` 根本没执行**；且 `voicesHooked` 仍是 true，此后每次静默返回 `voices=[]`、
  `onvoiceschanged` 从未安装 → 永久无法恢复。
  [src/services/pronunciation.ts:163-164]
- [x] [Review][Patch] **`chunkText` 词切后尾部与下一句首词粘连，丢掉空格** ——
  单句 trimmed > 200 走词切分支后，`current` 停在 `" zz"`（词间空格是前缀加的）；
  下一句 `Go.` 的长度检查通过 → `current += 'Go.'` → flush 产出 `"zz.Go."`。
  实测：`"aa aa …aa zz." + " Go!"` → 最后一块 `"aa …aa zz.Go!"`，TTS 会读成一个不存在的词。
  现有夹具 `longText` 全是 51 字符短句，永远走不到这条分支。
  [src/services/pronunciation.ts:301]
- [x] [Review][Patch] **`chunkText` 丢弃开头的 / 独立的 `.!?` 串** ——
  正则 `/[^.!?]+[.!?]*\s*/g` 要求每块至少含 1 个非 `.!?` 字符，位于开头或两个 `.!?` 之间的终止符串匹配不上，被整体吞掉。
  实测 20 万次 fuzz：`"!T Yye83?d!g…"` → `"T Yye83?d!g…"`（开头的 `!` 丢失），`maxChunkLen` 恒为 200、`emptyChunks` 为 0，
  说明是纯字符级静默损坏而非空块或超长。对英文教材影响有限（首字符不会是 `.!?`），但路径存在。
  [src/services/pronunciation.ts:273]
- [x] [Review][Patch] **假绿：把 `utterance.onerror = advance` 改成 `onerror = null`，66 个测试全绿** ——
  朗读 utterance 的 chunk 级 `onerror` 行为零覆盖（`onerror 触发同样标记完成` 那条测的是 warmup 不是链）；
  且 `FakeSynthesis.speak()` 只置 `speaking = true`，`onend` 触发后没有任何代码把 `speaking` 归零，
  `drain()` 又同步连调 `onend` → 测试永远看不到「块边界上 cancel 被触发」这条路径。
  [tests/services/pronunciation.test.ts:394-398]
- [x] [Review][Patch] **假绿：删掉 `prewarmBgm()` 那一行，66 个测试全绿** ——
  用例名叫「三步全部发生」，但断言只有 `contexts` 长度与 `spokenCount`，第③步一个断言都没有。
  Story 1.13 落地第③步时没有任何回归网能保证调用点没被挪走。
  同一用例里 `speak: () => { spokenCount += 1 }` 也不记录 utterance，
  所以「TTS 预热发生了」被缩成了「`speak()` 被调了一次」—— AC-1② 的实质（`volume = 0`）在 audio.test.ts 里一次都没验。
  [tests/services/audio.test.ts:131-139]
- [x] [Review][Patch] **`probeCache` 只由 `voiceschanged` 清空；事件不来就是永久 stale 的 `no-voice`** ——
  实测：冷启动 `getVoices()` 返回 `[]` → 缓存 `{no-voice, 0}` → 音色其实已到位但该实现不派发 `voiceschanged`
  （WebView 上常见形态）→ `probeTts()` 永远返回 `no-voice`，`playPronunciation` 永远走 `DEFAULT_LANG` 兜底，
  AC-4 的英式优先形同虚设，调试面板还会给出错误诊断。规范推荐的保险手段是「首调 + 短时轮询」，本实现只做了一半。
  [src/services/pronunciation.ts:167-169]
- [x] [Review][Patch] **`CHUNK_TIMEOUT_MS` 定时器从不 `clearTimeout`** ——
  正常播完后 N 块的定时器仍各自挂 20 秒（`advanced` 标志使它们成为 no-op，纯句柄/内存泄漏，功能无害）。
  实测：连续点词 20 次 → 注册了 20 个 20s 定时器，每个闭包持有整条 chunk 文本。
  注释里「定时器是一次性的」不足以论证「无需清理」。
  [src/services/pronunciation.ts:399]
- [x] [Review][Patch] **硬切按 UTF-16 码元，会劈开代理对** ——
  超长无空白串恰好把 emoji 落在边界上时，`slice` 产出含孤立代理字符的块。改用码点迭代即可。
  [src/services/pronunciation.ts:305-307]
- [x] [Review][Patch] **Dev Agent Record 用例数失实** ——
  实测 `pronunciation.test.ts` 37 个（记录写 35）、`audio-unlock-guard.test.ts` 6 个（记录写 7）、
  `audio.test.ts` 9 个（一致）；总数 66 属实，但 Change Log 写「3 个测试文件，66 个用例全绿」，
  这 3 个文件实际只贡献 52 个（37+9+6），66 含 Story 1.1 的 14 个。
  [_bmad-output/implementation-artifacts/1-2-音频解锁与-tts-朗读.md:926-941]
- [x] [Review][Patch] **6 个新增文件缺行尾换行** ——
  逐文件末字节实测：`src/app/audio-unlock.ts`=`7d`、`src/services/audio.ts`=`7d`、`src/services/pronunciation.ts`=`7d`、
  三个测试文件=`29`；而 Story 1.1 遗留的每个源文件末字节都是 `0a`。仓库无 prettier 配置、
  `eslint.config.js` 未开 `eol-last`，所以 `npm run lint` 不会报 —— 正是本 story 反复防的那类静默差异。
  [src/app/audio-unlock.ts / src/services/*.ts / tests/**/*.ts]
- [x] [Review][Patch] **守卫测试的 glob 断言只覆盖两种写法** ——
  第三条用例只排除 `'src/services/save.ts'` / `'src/services/**'` / `'src/services/*'` 三种字面量。
  若有人把规则重构成等价且更合理的 `'src/services/**/*.ts'`、`'src/services/*.{ts,vue}'` 或 `'src/services/**/*'`，
  该用例照样全绿而 `save.ts` 会被误伤。`rulesFor()` 的 `.includes(fileGlob)` 精确相等同样脆弱：
  改成 glob 后守卫其实完全有效，三条用例会误报红。
  [tests/scaffold/audio-unlock-guard.test.ts:23-29, 55-67]
- [x] [Review][Patch] **AC-3 在 Dev Agent Record 里既无达成证据也无移交声明** ——
  AC-3 要求「任意一题的卡面出现即自动朗读」+「点击卡面无限次重听」，
  但 `src/components/quiz/` 仍只有 `.gitkeep`、`StartView.vue` 的 `onStart` 无任何 `playPronunciation` 调用
  （不越界是对的，Dev Notes §2 已声明 UI 属 Story 1.10）。
  然而 Completion Notes 与 Change Log 的「未完成」清单只列了 7.4–7.7 真机项，
  **AC-3 没有任何一行说明** —— 评审无法判断是「做了」还是「漏了」。
  [_bmad-output/implementation-artifacts/1-2-音频解锁与-tts-朗读.md:898-917]

#### 延后

- [x] [Review][Defer] 无 `webkitAudioContext` 回退，iOS Safari < 14.1 下 Web Audio 通路永久不可用且每次点击重复告警
  [src/services/audio.ts:37-43] — deferred, pre-existing

#### 第二轮 `[CR]` 2026-10-12（三层并行审查：Blind Hunter / Edge Case Hunter / Acceptance Auditor）

**第一轮的 17 条 patch 已全部落地并被复核确认。** 本轮是纠偏（主备对调）之后重新过一遍，
三层独立报告后交叉验证 —— 下列结论均有**代码实读**或**实测复现**支撑，误报已剔除（见末）。

##### 需要决策

- [x] [Review][Decision] **AC-5 与实现之间有一道没被写下来的契约裂缝** ——
  `[CC]` 把主备对调成「录音为主路」之后，`playPronunciation(text)`（不带 `entryId`）
  在两条通路都失败时落到 `fallbackToRecording`，而它**一个音频都不播**，只 `console.warn`。
  **裁决：选 (a) 承认现状。** AC-5 段落已加 `[CC]` 纠偏批注（见上方 AC-5 正文）；
  「无 `entryId` 即无兜底音频」改写为 `playPronunciation` 的显式契约并由测试钉住。
  AC-5 标题与接口签名同步更正为 `playPronunciation(text, entryId?)`。
  — resolved 2026-10-12, decision (a)

- [x] [Review][Decision] **AC-8 完全未完成，故事能否置 `done`？** ——
  Task 7.4–7.7 全未勾：平板长句要听得出 `ball`，并记录本机命中的音色名与 Chrome 版本号。
  spec §13.5 明确禁止用 headless 代替，所以这不是实现者的过失；
  但 AC-8 **仍然开着**，且其产物（音色名）是 Story 3.4 的输入。
  **裁决：选 (b) 保持 `in-progress`。** AC-8 未达成，故事不可置 `done`，
  待平板真机数据回填后再收口；音色名是 Story 3.4 的输入，不可带着空值往下传。
  — resolved 2026-10-12, decision (b)

##### 修补

- [x] [Review][Patch] **「后一次调用完整接管发声权」的对称性破了 —— 录音与 TTS 两个方向都不打断上一个音源，孩子会听到两声** ——
  `playPronunciation` 的文档注释白纸黑字承诺「后一次调用会完整接管发声权」，
  实际上两个机制互不知情：`playbackGeneration` 只管 TTS 链，`activeRecording` 只管录音。
  ① 录音→录音：`stopActiveRecording()` 在 `playRecording` 里 —— 这条**有**。
  ② TTS→录音：`playRecording` 只递增 generation，对**正在发声的那条 utterance** 毫无作用，
     而 `synth.cancel()` 只存在于 `speakWithTts`，录音路径根本走不到。
  ③ 录音→TTS：`stopActiveRecording()` 只在 `playRecording` 内被调，`entryId === undefined`
     时直接走 `speakWithTts`，旧录音一次 `pause()` 都没有。
  ④ TTS→TTS：`synth.speaking` 判据 —— 这条**有**。
  根因是「发声权接管」没有单一入口。修法：在 `playPronunciation` 入口统一停掉上一个音源
  （两个都停），再分派；`stopActiveRecording` 幂等且判空，移出 `playRecording` 是安全的。
  须补两条交叉用例（现有「重入时旧录音被暂停」只覆盖 recording→recording）。
  [src/services/pronunciation.ts:190,214,525-529]
  —— 三层里两层独立报出，第 ③ 条被三方一致确认。

- [x] [Review][Patch] **录音路径没有代次隔离 —— 陈旧的 `error` 会劫持新播放，念出上一个词** ——
  `playRecording` 递增了 `playbackGeneration`，但**全文件没有任何一处读它** ——
  TTS 链有代次隔离，录音链没有。`finish` 只看 `settled`。
  复现：点 `u1-dog`（404 慢）→ 点 `u1-cat` → `dog` 的陈旧 404 触发 `finish()` →
  `speakWithTts('dog')`，**在 `cat` 的录音已经开始之后**念出 `dog`。
  正是 AC-3 重入场景，也是这个计数器当初被引入要防的那一类，且现有测试零覆盖。
  [src/services/pronunciation.ts:209-228]

- [x] [Review][Patch] **`onerror` 的 `canceled`/`interrupted` 分支直接 `return`，不 `finish` → 兜底定时器把链条复活** ——
  [src/services/pronunciation.ts:636-644]。实测：`failInFlight('canceled')` 且代次未变时，
  spoken 立刻不变，**20 秒后变 +1** —— 链在自己已被取消之后又开始念下一块。
  那个分支的意图是「不推进」，但 `CHUNK_TIMEOUT_MS` 的定时器还挂着，`advance` 照样到点触发。

- [x] [Review][Patch] **`entryId` 的类型门可被绕过 —— `null` / 数字会拼成 `/assets/audio/voice/null.mp3`** ——
  `playPronunciation` 判的是 `entryId !== undefined`，`ENTRY_ID_PATTERN.test()` 又会把参数
  强制转成字符串，于是 `null` → `"null"`、`12345` → `"12345"`，两者都过正则（内容层 JSON 是人工录入的）。
  目录穿越被正则挡住了（无 `.` 无 `/`），**安全上无害**，但每次都会白发一次 404。
  门应写成 `typeof entryId !== 'string' || !ENTRY_ID_PATTERN.test(entryId)`。
  [src/services/pronunciation.ts:178]

- [x] [Review][Patch] **`selectVoice` 的优先级链只比 name 不比 lang —— 可能给孩子一个非英语音色** ——
  [src/services/pronunciation.ts:251-256]。函数自己的注释写着「lang 比较必须兼容下划线形态」，
  但那份谨慎只用在兜底两档，优先级链六档全靠 `voice.name === preferred`。
  命中后 `utterance.lang = voice.lang` 会被设成非英语标签。
  CI 抓不到：所有相关用例喂的音色都是 `en-*`。
  [src/services/pronunciation.ts:251-256]

- [x] [Review][Patch] **AC-1 的时序断言测不出第③步被延后 —— 它只能测出第②步** ——
  **❌ 撤回：变异验证证明这条不成立。** 报出它的审查方建议补一个「`unlockAudioSequence()`
  是否已返回」的标记；实测该标记**抓不到任何旧断言抓不到的东西**：
  `expect(prewarmSpy).toHaveBeenCalledTimes(1)` 在第一个 `await` 之前同步执行，
  而本用例从 `unlockAudioSequence()` 到断言之间**没有任何 `await`**，
  所以把第③步改写成 `queueMicrotask(prewarmBgm)` / `setTimeout(prewarmBgm, 0)` / `.then()`
  **三种形态逐一实测都会当场变红**。
  已加的 `afterReturn` 标记随之撤回，测试维持原样，只在用例注释里留下这段变异记录，
  免得下一轮 `[CR]` 重复提同一个建议。**教训：反向验证没做就采信「这条断言有洞」，
  代价是往套件里塞一条永远不会失败的断言。**

- [x] [Review][Patch] **第二个顶层 `beforeEach` 在文件中部注册，作用于全文件所有用例** ——
  [tests/services/pronunciation.test.ts:2124-2127]（在它上面已注册了 6 个 `describe`）。
  Vitest 的 hook 按注册顺序对全文件生效，所以「录音主通路」的 `Audio` stub 实际覆盖了前面所有 TTS 用例。
  今天无害，但将来任何一条前置用例想测「无 Audio 环境」都会被静默破坏 —— 且在 700 行之下查不到。
  移进对应的 `describe` 即可。

- [x] [Review][Patch] **「点号按字面处理」这条自测根本没走到转义分支** ——
  [tests/scaffold/audio-unlock-guard.test.ts:174]。`matchesGlob` 在 pattern 不含 `*?{` 时
  短路成字符串相等，`'src/a.b/c.ts'` 无通配符，两条断言都走的是短路。
  已改为用**带通配符**的 `'src/*/c.ts'`，判别式放在**文件名里那个点**上
  （`src/a.b/cXts` 不该命中 —— `.` 若被当成正则任意字符就会命中）。
  ⚠️ 判别式**不能**放在目录名里：`src/*/c.ts` 本来就该匹配 `src/aXb/c.ts`，
  `*` 是通配符，用它当判别式是选错靶子（首版就栽在这里，绿的）。
  **变异已验证**：把 `.` 从转义字符类里去掉 → 该用例变红。

- [x] [Review][Patch] **AC-3 段落未随 `[CC]` 纠偏标注移交 Story 1.10** ——
  AC-6 的理由更正至少在 spec 里有「Dev Notes §4.1 有显式豁免说明」这句指引，
  AC-3 段落（spec 第 55–60 行）**没有任何同类批注**，移交声明只写在 Completion Notes 里。
  下一轮 `[IR]`/`[CR]` 只能靠翻 Completion Notes 才知道这是有意不交付。
  [spec 第 55–60 行]

- [x] [Review][Patch] **Change Log 的用例数再次失实** —— 写的是「87 用例」，
  审查时实测 **95**（58 + 10 + 13 + Story 1.1 的 14）；File List 的 58/10/13 是对的。
  本轮补完用例后是 **113**，已一并更正。这与第一轮已修的「Dev Agent Record 用例数失实」
  是同一类复发 —— **连续两轮都是同一处**，说明这条记录的生成方式（手写）本身不可靠。

##### 延后

- [x] [Review][Defer] `views/` 不得直接 import `services/` 这条新约束零强制，且测试**断言了这个缺口存在** —
  [eslint.config.js]、[tests/scaffold/audio-unlock-guard.test.ts:1005-1010] ——
  用例 `守卫有意不覆盖 views/` 把「无人守」固化成了预期行为；`app/effects-runner.ts`（Story 1.13）也不在守卫名单里。
  按 Task 5.4 属有意为之，不算违规；但同一个改动里「新增约束 + 无人守 + 测试把无人守钉死」值得留档。
  — deferred, pre-existing

- [x] [Review][Defer] `RECORDING_BASE_PATH` 是绝对根路径，未接 `import.meta.env.BASE_URL` —
  [src/services/pronunciation.ts:148] ——
  当前 `vite.config.ts` 未设 `base`（默认 `/`），根路径部署下没问题；
  但若部署到 GitHub Pages 项目站或任何带前缀的 CDN，**每个录音都会 404**，
  整条主通路静默降级成设备 TTS。属部署拓扑尚未决定的连带风险，不在本 story 的修正范围。

- [x] [Review][Defer] `StartView` 点击 → `unlockAudioSequence()` 这条接线无测试覆盖 —
  [src/views/StartView.vue] ——
  删掉 `onStart` 里那行调用、或删掉模板的 `@click`，现有 95 个测试全绿，
  而 Android 音频从此永不解锁。补测需要先装 DOM 测试环境
  （`@vue/test-utils` 已在 devDependencies，但 `jsdom` / `happy-dom` 都没有，
  `vitest.config.ts:12-13` 已就此留了注记）—— 属项目级决定，不宜在本 story 顺手做。

- [x] [Review][Defer] 五条「已处理但无测试」的分支：① `AudioContext` 不存在 ② `new Audio()` 抛错
  ③ `synth.cancel()` 抛错 ④ `new SpeechSynthesisUtterance()` 抛错 ⑤ `getVoices()` 返回非数组 —
  [src/services/audio.ts:112-118]、[src/services/pronunciation.ts:209-228,568-570] ——
  这些路径都有 try/catch 或 typeof 守卫兜着，逻辑是对的，只是零覆盖。
  其中 ③④⑤ 违反的是本文件自己声明的「绝不把异常抛出去」契约
  （`audio-unlock.ts` 明确**不**在外层兜异常），一旦破约，第③步 `prewarmBgm()` 根本执行不到。
  留待 Story 1.13 接上真实音效时一并补。

##### 本轮剔除的误报（留档，避免下一轮重复讨论）

- ❌ 「`eslint.config.js` 的新块**覆盖**了既有的 `no-restricted-syntax`」——
  读过全文件：此前**没有任何块**设过 `no-restricted-syntax`（`core/` 那块设的是
  `no-restricted-imports` 与 `no-restricted-globals`，不同规则）。无冲突。
- ❌ 「`tsconfig.test.json` 缺 DOM lib」—— `lib: ["ES2023","DOM","DOM.Iterable"]` 本来就在。
- ❌ 「`vi.spyOn` 打在 ES module 命名空间上不生效」—— 实测 95 全绿，且用例断言了 spy 被调用 1 次，
  spy 确实生效。
- ❌ 「仓库里残留 `tests/scaffold/__tmp-probe.test.ts`」—— 该文件是审查子代理自建的探针，已删除。

---

## Dev Notes

### 0. 这个 story 在依赖链上的位置，以及它为什么这么小却这么关键

```
1.1 → 1.2 → (1.3 ∥ 1.5) → 1.4 → 1.6 → … → 1.18
      ↑
   本 story
```

1.2 只依赖 1.1，**与 1.3 并列、互不依赖**。但它是**下游 16 个 story 的地基**：

- Story 1.10 的「卡面出现自动朗读 / 点击重听」调的是本 story 的 `playPronunciation(text)`
- Story 1.13 的 `runEffects` 返回的 TTS 副作用执行的是本 story 的服务
- Story 3.4 的音色/语速校准改的是本 story 定义的常量
- Story 1.18（Epic 1 生死线）里「音效与 BGM 正常播放，不出现静默失败」的门禁，判据就落在本 story 建立的三步解锁上

**⇒ 本 story 交付的不是一个「能念字」的功能，而是一套被 16 个 story 复用的服务契约。**
接口签名一旦定错，下游全要返工。这也是为什么 Dev Notes 花大力气钉死接口形状。

### 1. 🚨 本 story 最容易犯的架构错误：`views/` 直接 import `services/`

架构的依赖方向是**只能向下**：

```
components/  views/  →  app/  →  services/  →  core/
                                        content/  ↗
```

`src/views/StartView.vue` 里写 `import { speakSilentWarmup } from '../services/pronunciation'`
**是跳过了 `app/` 的违规导入。**

⚠️ 现有的 ESLint 守卫**抓不到它** —— `eslint.config.js` 里的
`no-restricted-imports` 只配在 `files: ['src/core/**/*.{ts,vue}']` 上，**方向是「core 不得向上 import」**，
没有「views 不得向下跳过 app」这一条。

**正确解法（本 story 的做法）：** 视图只认识 `app/`。

```ts
// src/app/audio-unlock.ts —— 唯一持有「三步顺序」语义的文件
import { prewarmBgm, unlockAudioSession } from '../services/audio'
import { speakSilentWarmup } from '../services/pronunciation'

export function unlockAudioSequence(): void {
  unlockAudioSession()   // ① Web Audio 解锁 —— 同步，不可 await
  speakSilentWarmup()    // ② TTS 预热（volume = 0 的空 utterance）
  prewarmBgm()           // ③ BGM buffer 预解（Story 1.13 落地实现）
}
```

```ts
// src/views/StartView.vue —— 只认识 app/
import { unlockAudioSequence } from '../app/audio-unlock'

function onStart(): void {
  unlockAudioSequence()
}
```

**为什么这不算「多此一举的间接层」：** 解锁顺序本身就是一条架构约束（FR2：三步、同一同步块、无 `await`）。
把它写在一个文件里，这个约束**肉眼可查**；散在调用点，它就退化成一句注释。
`app/` 的职责定义就是「Vue 绑定层」，音频解锁的编排天然属于这一层。

> ⚠️ **`src/app/audio-unlock.ts` 是对架构目录的一处扩展**（原目录只列了 `store.ts` / `effects-runner.ts` / `router.ts`）。
> 这是有意为之，不是跑偏，理由如上。`[CR]` 若认为应改放他处，请保持「`views/` 不得直接 import `services/`」这条不变。

### 2. 🚨 这条约束与「组件内不得播音效」不是矛盾 —— 必须讲清楚，否则会卡住

架构硬约束 4 写的是：**副作用只在 `app/effects-runner.ts` 执行；组件内禁止 `watch` 后自行播音效。**

看起来解锁动作正好撞在这条上。**但不冲突，判据是「这个动作由什么驱动」**：

| | 音频解锁（本 story） | 音效播放（Story 1.13） |
|---|---|---|
| 触发源 | **用户的原生手势事件本身** | `Action` / 状态变化 |
| 可重放吗 | ❌ 不可 —— 手势上下文天然不存在于任何 action 流里 | ✅ 可 —— 一串 Action 必然重放出完全相同的一局 |
| 需要 `runEffects` 吗 | ❌ 不需要（它在第一局之前发生，那时还没有 `GameState`） | ✅ 需要 |
| 能不能被测试覆盖 | 部分（顺序、幂等、无 `await`） | ✅ 纯函数，全部可测 |

**⇒ 音频解锁是「用户手势触发的、一次性的、不可重放的资源初始化」，
它是「副作用只走 effects-runner」这条规则的唯一合法例外。**
加进 `runEffects` 反而会制造伪影：它在 `reduce()` 之前不可能被调用。

**同时注意边界：** 本 story 之后，`StartView.vue` 里**不得**出现任何 `playPronunciation()` 调用。
朗读的触发在 Story 1.10（卡面出现时由 `runEffects` 驱动）—— 别提前写进启动按钮。

### 3. 🚨 `AudioContext.resume()` 返回 Promise，但这里**不能 await**

这是本 story 最容易被「写正确」惯犯带偏的一行：

```ts
// ✅ 正确
void ctx.resume().catch((err) => { console.warn('[audio] resume 失败', err) })

// 🔴 错误 —— 写了它，Android 上解锁静默失败且没有任何报错
await ctx.resume()
```

`resume()` 是 Promise，但**发起调用本身必须是同步的**；await 只是在它外面加了个洞。
所以正确形态是「同步发起 + 拒绝时记日志」，不是「等它完成」。

同理 `speakSilentWarmup()` **绝不返回 Promise 给调用方 await** —— 它 fire-and-forget，
内部自己用 `onend` / `onerror` / 超时三路收敛。

#### 3.1 ⚠️ 「不能 await」的**规则**保留，但**理由**与常见说法都不同 —— ⚠️ 本节在 2026-10-12 被独立复审推翻过一次

**先说被推翻的那版。** 本 story 初稿曾写：

| | `AudioContext.resume()` | `speechSynthesis.speak()` |
|---|---|---|
| Chrome 的门禁判据 | **瞬时**激活 | **粘性**激活（`has ever had user activation`） |
| `await` 之后 | ❌ 必失败 | ✅ 可以 |

**🔴 这张表是错的。** 独立复审指出：W3C 自动播放规范对 Web Audio 用的**也是 sticky activation**
（可用 `navigator.getAutoplayPolicy('audiocontext')` 验证），Chromium 的 `autoplay_policy.cc`
在 `IsDocumentAllowedToPlay` 里同样是向上遍历 frame 树找 `HasStickyUserActivation()` ——
**与归给 `speak()` 独有的机制完全相同**。于是「`await` 之后 `resume()` 必失败」不成立，
而本 story 恰恰从那一格推出了「规则对 TTS 侧只是保守写法」的结论。整条推理链塌在第一格。

**⇒ 更正后的表述：**

| | `AudioContext` | `speechSynthesis` |
|---|---|---|
| 门禁 | sticky activation（规范 + Chromium 实现一致） | sticky activation（Chrome 71 起的 Intent to Remove 明确写死） |
| `await` 之后能否成功 | **能**（sticky 激活不过期） | **能** |
| 激活是否沿 frame 树传递 | 是 | 是 |

**⇒ 那为什么规则还要保留？三条理由，都不是「await 会失败」：**

1. **这是架构决策，不是本 story 的自由。** `CLAUDE.md` 硬约束 8 与 epics FR2 都明写「不允许 await」。
   story 的职责是**执行**它，不是重新论证它。若要推翻，那是改 GDD / 架构的流程，不是改 story。
2. **同步发起还避开了一个真实时序问题。** Web Audio 1.1 的异步状态转移（§3.2 / A8）意味着
   `resume()` 存在 pending 窗口；把「发起 + 记日志」收在同步块里，比散到微任务里更好推理。
3. **legacy 与旧文档的理由虽查无实据，但踩坑本身是真的。** Android 上的音频会话问题确实存在过，
   且失败方式是**静默**的。保守写法没有代价。

**⇒ 代码注释写这三条，不要写「await 会导致解锁失败」。** 后者是一个查无实据的行为断言，
而 §13 的立项动机正是抓这类漂移 —— 不能自己在核心结论上漂一次。

#### 3.2 ⚠️ Web Audio API 1.1 的异步状态转移正在落地 —— 不要同步读 `ctx.state`

Blink bug 40140417 / Gerrit 7266845（Igalia）把 `AudioContext` 的 `suspended → running`
改为**异步**转移，同步读 `ctx.state` 会误判（flag `AudioContextAsyncStateTransitions` 保护中，stable 上已在加 UseCounter 观测）。

⇒ 解锁成功的判定**以 `resume()` 返回的 Promise 为准**，不读 `ctx.state`。
另外，即使同步读，也应写 `ctx.state !== 'running'` 而不是 `=== 'suspended'` ——
`state` 还有 `interrupted` 这个第三态（来电 / 闹钟 / Siri 等平台级中断）。

### 4. legacy 的算法该继承，legacy 的形态不该继承

CLAUDE.md 明令：`SpeechService.preheat()` 是「Android 音频解锁踩坑的产物」，
**值得直接继承，不应重新发明**。但继承的是**算法**，不是**写法**。

#### 4.1 该继承的三条踩坑知识（legacy 源码注释里的，代码本身看不出来）

```ts
// ① 只有在有东西正在播的时候才 cancel
//    ⚠️ 理由已被 2026-10 联网核实更正，见下方「注释更正」
if (speechSynthesis.speaking) { speechSynthesis.cancel() }

// ② preheat 发一个 volume = 0 的空 utterance，等 onend 或 onerror
//    二者之一即可标记完成 —— 不得无限等待
const warmup = new SpeechSynthesisUtterance(' ')
warmup.volume = 0
warmup.onend = () => { preheated = true }
warmup.onerror = () => { preheated = true }

// ③ getVoices() 首次调用常返回空数组，必须监听 voiceschanged
speechSynthesis.onvoiceschanged = () => { voices = speechSynthesis.getVoices() }
```

> **📌 注释更正（必读）—— legacy 与架构文档里关于 ① 的说法，检索不到任何证据支持。**
>
> legacy 注释写的是「空闲时 cancel 会破坏 Android 刚解锁的音频会话」，
> `game-architecture.md:324` 把它提升为硬约束并标注「代码里看不到、只能靠读旧实现知道的踩坑知识」。
>
> **2026-10 对 Chromium bug tracker 的穷尽检索，未找到任何 bug 报告称「空闲时调用 `cancel()` 会破坏或解锁音频」。**
> 反而找到一条**支持保留该规则的真实原因**：
> [issue 41436964](https://issues.chromium.org/issues/41436964)（crbug 924503）——
> **`cancel()` 之后紧接着的 `speak()` 会被吞掉**（Windows SAPI 路径，2019 年修复）。
>
> ⇒ **规则保留**（偏保守、无代价、且恰好避开 41436964），
> **但代码注释必须写正确的理由**。照抄 legacy 的错误理由，会把一个查无实据的传说固化进代码库。
>
> 正面写法：
> ```ts
> // 只在确实有东西在播时才 cancel。
> // 理由：cancel() 与紧邻其后的 speak() 存在竞争（Chromium issue 41436964，
> // cancel 会吞掉紧随的 speak）。本项目用「先判断 speaking」来避开这个竞争窗口，
> // 而不是为了「防止 cancel 破坏刚解锁的会话」—— 后者查无证据。
> ```

#### 4.2 ⚠️ legacy 漏掉的一步：Android 上 `utterance.voice` 可能被整个忽略

[Chromium issue 331977824](https://issues.chromium.org/issues/331977824)（标题：ignores **language/voice** setting）：
Android 上 `getVoices()` 返回正确的列表，但**给 `utterance.voice` 赋值无效，运行时回落到默认 `en-US`**。
状态 Won't Fix / Obsolete —— **不会有修复，只能绕开**。

**legacy 代码只设了 `voice`，没设 `lang`。**

> ⚠️ **证据等级更正（2026-10-12 独立复审提出，采纳）：**
> 这条 issue 的标题**同时包含 language 与 voice**（前身 crbug 899362 连 `lang` 一起被忽略），
> 而报告人验证过的解法是**改 Android 系统设置**（语言检测：保守 → 积极），**不是 JS 里设 `lang`**。
> ⇒ 「设了 `lang` 就一定不回落 `en-US`」应标 **(B) 社区共识**，不是 (A)。
> **做法保留**（无害，且可能有效），但**不能当成「问题已解决」**。

**⇒ 真正的防线是 AC-8 的「记录本机实际命中的音色名」** —— 设备最终选 en-GB 还是 en-US
可能根本不在项目控制内。这条记录不是可选项，是必须项。

另外 Android 返回的 `voice.lang` 常用下划线形态（`en_US`）而非 BCP 47 的 `en-US`，
**音色匹配要兼容两种分隔符**（`/^en[-_]/i` 而不是 `startsWith('en-US')`）。这一条是确定的，源自平台数据本身。

#### 4.3 该继承的一条结构

音色优先级链（AR32，legacy 的 `selectBestVoice()` 与架构决策 7 一致，**逐字照抄这个顺序**）：

```
Google UK English → Google US English → Microsoft Hazel/Susan
→ Samantha / Karen → 任意 en-US → 任意 en
```

> 英式优先是因为上海版教材录音多为英式。但**架构上不得假设首选音色存在**（AR33）——
> 旧项目在华为设备上大概率已经走了 fallback。**fallback 到任意 en 是正常路径，不是异常路径。**

#### 4.4 不该继承的：单例 class

legacy 是 `class SpeechService { static getInstance() ... }` 加一个模块级单例导出。
**本 story 不要这样做。** 理由与架构否决 Pinia / 单例时用的是同一条：全局可变状态最难测，
而本 story 是**必须写单元测试的**（6.1 的六个用例全是分支断言）。

改用「**模块级纯函数 + 模块级 `let` 状态**」：
函数可单独 import 测试，状态用 `vi.resetModules()` 隔离（见 §7）。
副作用范围仅限「本次 preheat 是否完成」与「探测结果」两处，不构成架构意义上的全局可变状态。

### 5. 「同步块」的可执行定义

AC-1 说的「同一个同步执行块」，落到代码上是三条，全部由 `src/app/audio-unlock.ts` 承担：

1. 三个调用**紧邻排列**，中间没有任何控制流、没有任何其他语句
2. 三个调用**各自内部也不含 `await`**（`ctx.resume()` 是 Promise，见 §3）
3. 该链路上的三个文件都被 ESLint 的 `no-restricted-syntax` 禁掉 `AwaitExpression`（Task 5 / AC-10）

第 3 条是唯一**可机器判定**的一条。前两条只能靠评审 —— 所以第 3 条不可省。

**⚠️ 守卫有意不覆盖 `src/views/StartView.vue`（2026-10-12 独立复审实测确认这个缺口存在）。**
写 `async function onStart() { await unlockAudioSequence() }` 不会触发 lint。
**这不违反 FR2** —— FR2 管的是「三步**之间**」无 `await`，而这里的 `await` 发生在三步**之后**。

但要在意一件事：本 story 刚刚新增了一条「`views/` 不得直接 import `services/`」的架构约束（§1），
而现有 ESLint 同样抓不到它（`no-restricted-imports` 只配在 `src/core/**` 上，只防 core 向上 import）。
**⇒ 等于同一个改动里，「新增的约束没人守」和「已有的守卫漏了现场」两件事同时发生。**
这是本 story 最容易被下一个开发者「顺手扩到 `src/views/**`」或「干脆删掉守卫」的地方，
所以在此显式写明：**覆盖名单是有意为之，不是遗漏。**

### 6. 本 story 内定的四个决策（实现者请勿自行推翻）

#### 决策 1：`prewarmBgm()` 本 story 是空实现

AC-1 要求三步齐全，但 **BGM 资源属 Story 1.13**，`public/assets/audio/music/` 现在是空的（只有 `.gitkeep`）。

**若本 story 真去 `fetch('/assets/audio/music/bgm.mp3')`，平板每次点「开始游戏」都会在控制台留下一条 404。**
对一个「孩子面前永不出现技术错误」的项目，这是把一个尚未存在的资源写成了既有的运行时故障。

⇒ `prewarmBgm()` 本 story 为**空实现 + 明确的 `TODO(Story 1.13)` 注释**，
**调用点、位置、以及「它必须与前两步在同一同步块内」这些约束成立**。
Story 1.13 只需替换函数体，不需要改调用点。

#### 决策 2：不引入 `starting` 状态、不禁用按钮

Story 1.1 的 `[CR]` 曾删掉一个「永远为 false 的占位 ref」，理由是「读起来像已实现」——
这是对的。现在 1.2 落地时，面对的是同一个诱惑：`const starting = ref(false)`，点了设 `true`，`:disabled="starting"`。

**不要这么做。** 理由是**可用性**，不是洁癖：Story 1.15 之前 `onStart` 不会切换视图，
按钮禁用之后**没有任何东西会把它解开** —— 孩子点了「开始游戏」，按钮变灰，游戏一动不动。
Story 1.1 的状态下「点了没反应」至少还是可预期的；禁用之后是**看起来坏了**。

⇒ 保持按钮可重复点击，靠**幂等**而非禁用来防重复：

- `unlockAudioSession()` 重复调用只会复用同一个 `AudioContext`，重复 `resume()` 无害
- `speakSilentWarmup()` 在已 preheat 时**直接返回**，不发第二个 utterance

重复点击的幂等性写进测试（Task 6.1 / 6.2），AC-8 的第 3 条也是这条的验收。

#### 决策 3：`playPronunciation` 的分块与 `lang` —— 比 legacy 多做两件事

epics 的 AC 没提这两条，但 2026-10 联网核实表明：**不做的后果是静默失败**（§4.2、§13.2、§13.4）。

| legacy 的做法 | 本 story 的做法 | 不做的后果 |
|---|---|---|
| 只设 `utterance.voice` | **同时设 `utterance.lang`** | Android 上 `voice` 可能被整个忽略（Won't Fix），回落到 `en-US` —— 与「英式优先」正好相反 |
| 单条 `speak(text)` | **按句切块 ≤200 字符 + `onend` 链式推进** | 超过 ~15 秒被**静默掐断**：无 `onend`、无 `onerror`、`speaking` 仍为 `true`，表现为应用挂死。该 bug 自 2009 年提出至今未修 |
| `v.lang.startsWith('en')` | **`/^en[-_]/i`** | Android 返回 `en_US`（下划线），`startsWith('en')` 虽能命中但 `en-US` 精确匹配会落空 |

前两条把 AC-4（音色回退）与 AC-7（分块）从「epics 的字面要求」升级为「设备上的实际要求」。
**代价只有几行代码，收益是不重蹈一个静默失败的覆辙。**

> ⚠️ **证据等级更正（独立复审提出，采纳）：** 「设了 `lang` 就一定不会回落 `en-US`」是**社区共识 (B)，不是 (A)**。
> Chromium issue 331977824 的标题是「ignores **language/voice** setting」，
> 且报告人验证过的解法是改 Android 系统设置（语言检测：保守 → 积极），**不是 JS 里设 `lang`**。
> ⇒ 本决策的**做法保留**（无害，且可能有效），但**不要把它当成「问题已解决」**。
> **AC-8「记录实际命中音色」是这条的唯一有效防线**，不是可选项。

#### 决策 4：AR35「启动时探测」的落点定在 `speakSilentWarmup()` 内部

epics 的 AR35 要求「**启动时**探测 `window.speechSynthesis` 可用性与可用音色数」。
但它与 §5 规则 1 正面冲突：`unlockAudioSequence()` 的函数体被规定为**恰好三行、中间不得有任何其他语句**。
若把 `probeTts()` 作为第四个调用放进去，就同时违反了两条；不放，则它是一个没人调用的导出。

**⇒ 落点：`probeTts()` 在 `speakSilentWarmup()` 内部首行被调用。**

- 「启动时」成立：对音频而言，「开始游戏」这次点击就是音频链路的起点（`runEffects` 那时还不存在）
- §5 规则 1 不受影响：那三条约束的是**三个顶层调用之间**不得有语句，`probeTts()` 在第二个调用**内部**
- 顺带合理：预热之前必须先知道音色列表 —— `getVoices()` 首次为空是规范允许的（§13.2 A12），探测与预热放一起才有意义

### 7. 测试环境：Node 里三个浏览器 global 都不存在

`vitest.config.ts` 的 `environment: 'node'`（Story 1.1 定）。Node 里**没有** `speechSynthesis`、
**没有** `SpeechSynthesisUtterance`、**也没有** `AudioContext` —— 三个都必须 stub，漏一个就是 `ReferenceError`。

> ⚠️ **实测提醒（2026-10-12 独立复审复现）：** 漏 stub `AudioContext` 的报错发生在**模块求值时**
> （`src/services/audio.ts:3`），不是调用时 —— 表现是整个测试文件加载失败，
> 且报错信息与「你忘了 stub 什么」毫无关联，容易误判成代码 bug。

正确形态：

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()                       // 模块级 preheat 状态必须清零
  vi.stubGlobal('speechSynthesis', makeFakeSynthesis())
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)
})

it('空闲时不得调用 cancel', async () => {
  const { playPronunciation } = await import('../../src/services/pronunciation')
  // …断言 fake 的 cancel 未被调用
})
```

⚠️ **两个容易踩的点：**

1. **必须动态 `import()`，不能在文件顶部静态 import** —— 静态 import 会在
   `vi.resetModules()` 之前就求值，拿到的是**另一份**模块实例，状态清零无效，
   测试会因前一个用例的 `preheated === true` 而**假绿通过**。
2. **`FakeUtterance` 必须接受 `onend` / `onerror` / `volume` / `rate` / `pitch` / `voice` / `lang` 的赋值** ——
   真实 API 是「先构造再逐字段赋值」，fake 类必须照此形状，否则测不到真实代码路径。

#### 7.2 🚨 最危险的一条：测试 import 服务层 → `TS6307` → `npm run build` 直接失败

**2026-10-12 已实测复现。** 这条不是推测，是本 story 第一个会被撞上的硬阻断：

```
tests/services/__probe.test.ts(2,22): error TS6307:
  File '.../src/services/audio.ts' is not listed within the file list of
  project '.../tsconfig.test.json'. Projects must list all files or use an 'include' pattern.
```

**根因：** `tsconfig.test.json` 的 `include` 只有 `["tests/**/*.ts", "vitest.config.ts", "eslint.config.js"]`。
composite 项目要求「所有文件必须被列出」——测试文件 import 了 `src/services/`，那个文件不属于本项目。
`tsconfig.test.json` 里的 `references` 只指向 `tsconfig.core.json`（那是 Story 1.1 为 `src/core/` 准备的，
而**现有测试其实一个 `src/core/` 的文件都没 import**，只是读配置文件文本 —— 所以这条 reference 至今没被用过**）。

**两条候选修法，都实测过：**

| 修法 | 实测结果 |
|---|---|
| **A.** 给 `tsconfig.test.json` 加 `"references": [{ "path": "./tsconfig.app.json" }]` | 🔴 **`error TS6310: Referenced project 'tsconfig.app.json' may not disable emit.`** —— app 项目是 `noEmit: true`，被引用的项目不允许关闭 emit |
| **B.** 给 `tsconfig.test.json` 的 `include` 追加 `"src/services/**/*.ts"`、`"src/app/**/*.ts"` | 🟢 **`vue-tsc -b --force` 零输出，`vitest run` 15 个用例全过** |

⇒ **采纳修法 B。**

> ⚠️ 这**正是** Story 1.1 §14 交接信息里留下的那颗雷，原文写的是「`scripts/` 没有被任何 tsconfig 覆盖，
> 这个坑留给 Story 1.4 踩，不要现在提前加」。**本 story 是第一个让测试 import app 层源码的 story，
> 所以这颗雷由本 story 拆**，而不是 1.4。两处的解法形状不同：1.4 只需给 `tsconfig.node.json` 补一条
> `references` 指向 core（core 有 emit，没有 TS6310 问题）。

**⚠️ 由此产生的一个连带影响：** 修法 B 之后，`src/services/**` 与 `src/app/**`
会**同时**属于 `tsconfig.app.json` 和 `tsconfig.test.json` 两个 composite 项目（重叠是允许的，两者都 noEmit）。
这不是问题，但**要写进 `tsconfig.test.json` 的注释**，否则下一个看到「源文件出现在两个项目里」的人
会去「修复」它，然后撞回 TS6307。

### 8. 组件测试边界（不要越界写）

架构 NFR17：「不得为组件编写业务逻辑测试」。本 story 的 AC 全部落在服务层，
`StartView.vue` 的改动只有两行（换 import、换函数体），**不值得也不应该**为它写组件测试。
若要为「点按钮是否调用了 `unlockAudioSequence`」写测试，那测的是 Vue，不是本 story 的验收。

### 9. Project Structure Notes

**本 story 的新增/修改完全落在架构已定义的目录内，唯一的扩展是 `src/app/audio-unlock.ts`**（理由见 §1）。

```
src/
├── services/                        ← ✅ 本 story 的主战场
│   ├── audio.ts                       【新增】AudioContext 会话 + BGM 预解骨架
│   └── pronunciation.ts               【新增】TTS + 统一 playPronunciation 接口
│                                     （架构目录明文规定此二文件名，不可改名）
├── app/
│   └── audio-unlock.ts                【新增】三步同步块（§1 的扩展项）
├── views/
│   └── StartView.vue                  【修改】onStart 接上解锁（两行改动）
└── core/                            ← ⛔ 不动
tests/
├── services/
│   ├── pronunciation.test.ts          【新增】
│   └── audio.test.ts                  【新增】
└── scaffold/
    └── audio-unlock-guard.test.ts     【新增】禁 await 守卫的回归测试
tsconfig.test.json                     【修改】include 纳入 src/services|app（Task 0，实测阻断）
eslint.config.js                      【修改】no-restricted-syntax
```

**命名规范（AR4，本 story 起继续遵守）：** `.ts` 用 kebab-case ✓、函数 camelCase ✓、
常量 `UPPER_SNAKE_CASE` ✓、日志前缀方括号小写 ✓（`[tts]` / `[audio]`）。

### 10. Project Context Rules

项目根目录**没有** `project-context.md`。本 story 适用的项目级规则来自 `CLAUDE.md` 与既有脚手架：

| 规则 | 来源 | 对本 story 的约束 |
|---|---|---|
| 核心层禁止 DOM 依赖 | `CLAUDE.md` 硬约束 1 / NFR7 | 音频服务必须落在 `services/`，**绝不能放 `core/`** |
| 依赖方向只能向下 | `CLAUDE.md` / 架构依赖方向图 | `views/` 不得直接 import `services/`（§1） |
| 副作用只在 effects-runner | `CLAUDE.md` 硬约束 4 | 音频解锁是其唯一合法例外（§2） |
| 动画时长写在 CSS | `CLAUDE.md` 硬约束 5 | 本 story 无动画；若加「解锁中」提示，时长写 CSS |
| 不引游戏引擎 / 状态库 / 补间库 | `CLAUDE.md` 技术栈 | Web Audio + Web Speech API 原生实现（AC-9） |
| 提交用 Conventional Commits | `CLAUDE.md` | `feat: [1-2] 音频解锁与 TTS 朗读` |
| `npm run validate:content` 提交前必跑 | NFR15 | 本 story 不改内容，但提交前照跑 |
| BMAD 对话与文档用中文 | `CLAUDE.md` 语言章节 | 本文件与代码注释均中文 |

**工具链现状（Story 1.1 实测结论，本 story 直接继承，不要重新验证）：**

- `npm run build` = `vue-tsc -b --force && vite build`，**裸 `vite build` 不做类型检查**
- `tsconfig.test.json` 覆盖 `tests/` + `vitest.config.ts` + `eslint.config.js`，但**它的 `include` 不含 `src/services/`** ——
  ⚠️ **本 story 必须按 Task 0 补上**，否则测试一 import 服务层，`npm run build` 报 TS6307（实测，见 §7.2）
- `vitest.config.ts` 不继承 `vite.config.ts`，但已显式挂了 `vue()` plugin
- `tsconfig.core.json` 的 `include` 只有 `src/core/**/*.ts` —— **`src/services/` 走 `tsconfig.app.json`，`lib` 含 DOM，浏览器 API 可用**

### 11. Testing Requirements

```
tests/services/pronunciation.test.ts
  ✓ 音色链六档逐档命中（每档单独一个用例）
  ✓ 无任何 en 音色时返回 null，不抛错
  ✓ 🔥 每条 utterance 同时设了 voice 与 lang              ← AC-4，legacy 漏的那一步
  ✓ 下划线 lang（en_US）也能命中                           ← AC-4
  ✓ speechSynthesis 完全不存在时 probeTts() → 'unavailable'
  ✓ 🔥 speaking === false 时 cancel() 绝不被调用            ← AC-6 硬约束，守卫测试
  ✓ speaking === true 时 cancel() 被调用
  ✓ speak() 抛错 → 走降级路径 + 不向调用方抛                 ← AC-5 硬约束
  ✓ preheat：onerror 触发即标记完成                         ← AC-2
  ✓ preheat：onend  触发即标记完成                         ← AC-2
  ✓ preheat：二者都不触发 → 超时后仍标记完成（fake timers）    ← AC-2 的核心，legacy 无此兜底
  ✓ 超长文本被切成多块、单块均 ≤200 字符、按 onend 链推进      ← AC-7（~15s 截断 bug）

tests/services/audio.test.ts
  ✓ 重复调用 unlockAudioSession() 只创建一个 AudioContext
  ✓ resume() 的 Promise reject 时只记日志、不外抛
  ✓ 幂等：重复解锁不产生第二次 TTS 预热                      ← 支撑 AC-8 第 3 条

tests/scaffold/audio-unlock-guard.test.ts
  ✓ eslint.config.js 在三个解锁文件上有 no-restricted-syntax
  ✓ 严重级别为 'error'（不是 'warn'）
  ✓ AwaitExpression 在禁列里
```

⚠️ **守卫测试的写法要求（Story 1.1 `[CR]` Debug Log #7 的教训）：**
断言必须是 **`import eslintConfig from '../../eslint.config.js'` 求值后检查规则对象**，
**不得**用 `expect(cfg).toMatch(/files:\s*\[\s*'src\/services\/audio/)` 这类子串匹配 ——
三个互相独立的字符串检查可以被三个不同的 config 块分别满足，把规则挪走 / 降级 / 追加 `'off'` 它都照过。

**不要做的事：**

- 不要把 `no-restricted-syntax` 扩大到整个 `src/services/`（会挡住 Story 1.14 的 `save.ts`）
- 不要为 `StartView.vue` 写组件测试（§8）
- 不要在 `src/core/` 放任何 `.test.ts`（NFR16）
- **不要用无头浏览器或 Puppeteer 代替真机做 TTS 验收**（§13.5）
- **不要把 AC-8 当成「点一次没报错就算过」** —— AC-8 必须真机念长句，并记录音色名与 Chrome 版本号

### 12. 🚫 本 story 明令不做的事（防范围偏移）

| 不做 | 理由 |
|---|---|
| **不建任何 quiz / 卡面组件** | 卡面「出现即朗读」「点击重听」的 UI 属 Story 1.10。本 story 只交付**服务能力** |
| **不创建 `effects-runner.ts` / `core/effects.ts`** | 副作用编排属 Story 1.13。`[IR]` 明确「不得引入前向依赖」 |
| **不建任何音频资源文件** | BGM 与 7 个音效属 Story 1.13（AR38） |
| **不做 TTS 语速 / 音色品质校准** | Epic 3 / Story 3.4（AR34、AR38）。本 story 只定起点值 |
| **不批量生产预置录音** | 200-400 词的录音生产属 Story 3.4。本 story 只交付**降级接口**，录音文件未来塞进 `public/assets/audio/voice/` |
| **不建调试面板 UI** | 降级状态仅通过日志与返回值暴露，UI 属 Story 1.16（`[IR]` A8 修订） |
| **不做语音浮层 / 音量 UI / 静音开关** | 语音浮层遮挡属 FR79 / Story 1.17 与 3.5；音量与静音 epics 全文无此需求 |
| **不碰 `src/core/`** | 本 story 与战斗内核零交集 |
| **不引音频库**（Tone.js / Howler.js / Phaser） | 原生 API 足够，且引库会让「解锁必须同步」更难守 |

> ⚠️ **关于「预置录音」这个降级目标的一个诚实说明：**
> AC-5 要求「降级到预置录音路径」，但**本 story 交付时 `public/assets/audio/voice/` 是空的**。
> 因此降级路径在 Epic 1 期间的实际行为是：**记录 `WARN` `[tts]` → 尝试加载（必然失败）→ 静默返回 → 回合继续**。
> 这**完全符合 AC-5 的后两条**（「记 WARN」「回合流转不中断」），
> 也符合 Story 1.13 原文的兜底表述：「预置录音也不可用时则只剩画面线索，但不阻断任何一回合」。
> 录音资源本身由 Story 3.4 生产，届时**降级路径不需要任何改动即可生效** —— 这正是「降级须在架构层有固定位置」的价值。

### 13. 🔬 2026-10-12 联网核实：哪些结论有据、哪些是传说

本节的目的是**在实现前把「哪些能信」标清楚**，避免把查无实据的说法当约束写进代码。

**证据等级约定：**
**(A)** 有官方文档 / Chromium bug / 规范条目支撑 ·
**(B)** 民间经验，无官方认可 ·
**(C)** 未能证实或未能确认

> ⚠️ **取证方式声明：** 本次核实的 WebFetch 与直连网络在执行环境中被拦截，
> 证据来自检索结果的摘要层，**未逐字阅读原始文档**。URL 均为检索中出现的真实地址。
> 凡标 (B)/(C) 者，实现时**不得当作硬约束**。

#### 13.1 (A) Web Audio / AudioContext

| # | 结论 | 出处 |
|---|---|---|
| A1 | Chrome 的 Web Audio 自动播放策略自 **Chrome 71（2018）** 落地，此后无大改 | [chromestatus 4510315433689088](https://chromestatus.com/feature/4510315433689088) |
| A2 | 手势前创建 → `suspended`；手势内创建 → `running`。**手势内 `resume()` 等价** | [developer.chrome.com/blog/autoplay](https://developer.chrome.com/blog/autoplay/) |
| A3 | ⚠️ **Chrome 自动恢复需两个条件同时成立：① 已交互 ② 对已连接的源节点调了 `start()`** | [web-audio-autoplay](https://developer.chrome.com/blog/web-audio-autoplay/) |
| A4 | ⚠️ **门禁是 sticky activation** —— W3C 自动播放规范对 Web Audio 用 sticky activation，Chromium `autoplay_policy.cc` 向上遍历 frame 树找 `HasStickyUserActivation()`，可用 `navigator.getAutoplayPolicy('audiocontext')` 验证。**⇒ `await` 之后 `resume()` 仍可成功** | W3C 自动播放规范 + Chromium `autoplay_policy.cc`（见 §3.1） |
| A5 | MEI **同样计入 Web Audio**（非仅媒体元素）。⚠️ 两个来源版本号不一致（Chrome 70 / 71），**按 71 理解即可**，本项目不受影响 | [2018-11 Web Audio autoplay](https://developers.google.com/web/updates/2018/11/web-audio-autoplay) |
| A8 | ⚠️ **Web Audio 1.1 异步状态转移**（Blink bug 40140417 / Gerrit 7266845，flag 默认仍关）→ 不要同步读 `.state`。**更强的理由**：规范规定 `suspended` 状态下**不派发 `statechange`**（隐私），所以平板来电这类场景必须信 Promise | 同左 |

> **A3 对本 story 的诚实含义：** 本 story **无法**证明 `AudioContext` 已真正解锁 ——
> 第二个条件（`start()`）要等 Story 1.13 的第一个真实音效才成立。
> ⇒ **AC-8 的真机验收只验 TTS 通路（可听）与 `resume()` 未 reject（可记日志），
> 不要在 AC-8 里承诺「已验证音频会话可用」** —— 那要到 1.13 才能验。
> A5 的 MEI 对本场景**无关**：儿童平板首次访问 MEI 必为 0，不能作为设计假设。

#### 13.2 (A) SpeechSynthesis on Android Chrome —— 本 story 必读的七条

| # | 结论 | 对实现的影响 |
|---|---|---|
| **A9** | ⭐ `speak()` 的门禁是**粘性**的 `has ever had user activation`，且沿 frame 树传递；无 Permissions API；Chrome 71 起 | §3.1 —— TTS 侧「禁 await」是保守写法而非硬性必需 |
| **A10** | ⚠️ **~15 秒截断 bug 自 2009 年提出至今未修**：单条 utterance 播到 ~15s（≈200–250 字符）**戛然而止，不触发 `onend` 也不触发 `onerror`** | **见 §13.4 分块契约** |
| **A11** | ⚠️ **Android 上 `pause()` 就是 `cancel()`** —— 桌面端「每 14s 暂停保活」那套在 Android 上不可用，**唯一解是分块**。（MDN BCD 在 `pause()` 条目下明写 Android 为「实质等同 `cancel()`」；Chromium `tts_android.cc` 的 `Resume()` 是空实现） | 同上 |
| A12 | `getVoices()` 首次返回 `[]` 是**规范允许**的行为（语音系统懒加载）；官方模式 = **同步调一次 + 订阅 `voiceschanged`（两者都要）** | §4.1 ③ |
| **A13** | ⚠️ Android 上 `utterance.voice` **可能被忽略并回落 `en-US`**（Won't Fix）。**降级为 (B)** —— issue 标题含 language/voice，报告人验证过的解法是改系统设置而非 JS 设 `lang` | **§4.2 —— 仍要同时设 `lang`，但不当作已解决** |
| **A14** | ⭐ **查无证据**：`cancel()` 空闲调用不会「解锁」音频。真正的理由是 issue 41436964 的 cancel→speak 竞争（M74 已修） | **§4.1 注释更正** |
| **A15** | ⚠️ **headless Chrome 下拿不到网络音色** —— issue 标题是 `doesn't return **remote** voices`，根因是 Puppeteer 默认的 `--disable-component-extensions-with-background-pages` 干掉了承载 Google 网络音色的组件扩展；`voiceschanged` 在该条件下不触发 | 见 §13.5（**操作结论不变：AC-8 必须真机**） |

#### 13.3 ✅ 目标设备 —— 风险已排除（本节从「最大风险」降级为「背景」）

| # | 结论 | 出处 |
|---|---|---|
| — | ✅ **2026-10-12 用户确认：目标平板上有 Chrome。** | 用户 |
| A16 | ⚠️ 原本担心的是：HarmonyOS NEXT 完全去掉 AOSP，**根本没有 Chrome**，所有浏览器都是华为自维护的 **ArkWeb**（Chromium 派生：HarmonyOS 4.0→M99、5.x→M114、6.x→M132、7.0→M144） | [华为开发者文档](https://developer.huawei.com/consumer/en/doc/harmonyos-guides-V13/web-component-overview-V13) |
| A17 | ⚠️ ArkWeb 的「坚盾守护模式」（设置 → 隐私和安全）会直接禁用 Web Speech API | [华为文档](https://developer.huawei.com/consumer/ru/doc/harmonyos-guides/web-secure-shield-mode) |
| A18 | 无 GMS 的旧版 EMUI 上没有 Google TTS 引擎，AOSP 默认是 `com.svox.pico`（英文通常可用） | (B) 中文博客，未获华为官方确认 |
| A19 | Android WebView 完全不支持原生 TTS —— **若将来有人提议打包成 APK，这条会直接否掉该提案** | chromium issue 710238 |

**⇒ 结论：本 story 的 §13.1 / §13.2 全部 Chrome 结论适用。**
设备不是 ArkWeb，所以「坚盾守护模式禁用 Web Speech API」这条不适用；
Google UK/US English 这两个首选音色**有**机会存在（但仍不得假设存在 —— AR33）。

**⇒ 仍然要记的一件事：** AC-8 要求记录的音色名，现在更关键了 ——
若命中的是 `Google UK English` 则英式优先成立；若命中 fallback 则是 `en-US`，
Story 3.4 需要按教材录音另行校准（epics Story 3.4 原文正是这个要求）。

**⇒ AC-5 的降级分支仍然必须真写、不能空着** —— 但它的定位回到 GDD 原本的「稳妥设计」，
不再是「唯一可行路径」。降级逻辑仍要在 Story 1.13 之前就有，因为它会被 16 个下游 story 调用。

#### 13.4 ⚠️ 分块契约：~200 字符上限（来自 A10 + A11，自 2009 年起跨十余年未修）

单条 utterance 播到约 15 秒会被**静默掐断**（无 `onend`、无 `onerror`，`speaking` 仍为 `true`，表现为应用挂死），
而 Android 上 `pause()` 退化为 `cancel()`，**没有保活手段**。

**⇒ `playPronunciation(text)` 必须按句切块，逐块 `speak()`，用 `onend` 链式推进，单块上限 200 字符。**

**本 story 的教材长句（`I have a ball for my dog.` = 31 字符）远在安全区内**，
但这个契约**现在就要写进接口**，理由：

1. 单元 1 的回应卡可能出现更长的句子，下一个开发者不该重新踩这个坑；
2. 「触发 bug 时无 `onend` 无 `onerror`」意味着**必须有超时兜底** ——
   这与 AC-2 的 preheat 超时是同一条兜底思路，一个模式用两处。

**⚠️ 注意 `rate` 的另一个坑（(B) 级，社区口径）：** 社区普遍反馈 `rate > 2.0` 会让 Chrome 的
事件系统挂死（需 `cancel()` 恢复），且据称主要发生在**非本地 Google 音色**上。
**规范只规定 `rate` 取值 0.1–10，没有 2.0 这个上限** —— 2.0 是社区约定而非规范约束，
所以这条只当护栏、不当契约。本项目的 `rate` 是 0.85 / 0.9，距任何口径都极远，
**Epic 3 现场调语速时也无需守住 2.0**，只需守住「不发散到失去可懂度」这一条产品判断。

#### 13.5 ⚠️ 验收方式的两条禁令

| 禁令 | 原因 |
|---|---|
| **绝不用无头（headless）浏览器验收 TTS 通路** | A15：headless 下 TTS 完全不工作，`voiceschanged` 永不触发，任何等语音的逻辑永久挂起。E2E 若要用浏览器，**必须在页面里 stub `speechSynthesis`**，只断言「请求了什么文本」；或用 Xvfb 起 headful Chrome |
| **不要用 Puppeteer 默认参数** | 默认含 `--disable-component-extensions-with-background-pages` —— 它干掉了承载 Google 网络音色的组件扩展（A15 的根因）。**注意：不是 `--mute-audio`** —— `--mute-audio` 只在 `headless === true` 分支由 `defaultArgs()` 追加，若你用 `headless: 'new'` 或 headful，它根本不出现。把锅扣在 `--mute-audio` 上会导致「已加 `--mute-audio=false` 却仍无声音」的误判 |

**⇒ Task 7.4 / 7.5 明确要求真机（用户配合），不允许用自动化替代。**

#### 13.6 (C) 未能确认的部分

- 2026-04 chromium main 的 autoplay 改动（`{#1610890}`）进入了哪个稳定版本 —— 未确认
- 2025–2026 是否有 Web Speech API 的规范变更 / 废弃 —— **检索后未发现任何官方记录**（社区流传的「API 正在被重写」说法无据）
- 华为官方是否确认 EMUI 预置的 TTS 引擎型号，以及 EMUI + Chrome 上 `speechSynthesis` 报 0 voices 的具体案例 —— 未找到权威来源
- ArkWeb 对 Web Speech API 的正面支持程度（除「守护模式会关闭」这一条外，未找到资料）

---

### 14. References

| 结论 | 来源 |
|---|---|
| Story 1.2 的全部 AC、📎 覆盖（FR1–FR5、AR2、AR3、AR32–AR37、NFR4） | `_bmad-output/planning-artifacts/epics.md:642-682` |
| FR1–FR8 发音与音频组原文 | `epics.md:30-44` |
| AR32–AR38 TTS 与音频组原文 | `epics.md:335-346` |
| NFR4 / NFR12 / NFR13 / NFR14 / NFR16 / NFR17 | `epics.md:220-253` |
| Story 1.13 对 TTS 降级归属的反向确认 | `epics.md:1165-1171` |
| Story 3.4（音色/语速校准、录音生产） | `epics.md:1909-1926` |
| Epic 1 依赖链与 18 条 story 清单 | `epics.md:511-596` |
| 决策 4「音频解锁」正文与三条硬约束 | `game-architecture.md:306-325` |
| 决策 7「TTS 音色与降级」正文 | `game-architecture.md:379-401` |
| 错误分层（`core/` throw / 运行时静默降级）与日志规范 | `game-architecture.md:533-599` |
| `services/` 的职责与两个文件名（audio.ts / pronunciation.ts） | `game-architecture.md:697-701, 758` |
| 依赖方向图与 Architectural Boundaries | `game-architecture.md:779-791` |
| 测试策略与「core/ 内不出现 .test.ts」 | `game-architecture.md:885-921` |
| TTS 参数配置位置（`src/services/pronunciation.ts`） | `game-architecture.md:606` |
| GDD 音频解锁约束与「开始游戏」职责 | `gdd-plants-game-2026-10-11/gdd.md:482-484, 522-528` |
| GDD TTS 已在同型号华为设备验证通过；长句与音色待确认 | `gdd.md:509-521` |
| GDD 性能预算（TTS 起声 ≤500ms） | `gdd.md:500` |
| GDD 降级方案（预置录音）与触发标准 | `gdd.md:537-543` |
| 旧版 `preheat()` / 音色链 / cancel 时机的原始实现 | `git show legacy-v5.x-final:src/systems/SpeechService.ts` |
| Story 1.1 的交接信息与 `[CR]` 三处「假绿」教训 | `1-1-工程脚手架与启动界面.md:832-928` |
| `[IR]` NFR12 降级通路归属（TTS → Story 1.2） | `implementation-readiness-report-2026-10-12.md:723-738` |
| Chrome 自动播放策略与 Web Audio（§13.1 A1–A4） | [developer.chrome.com/blog/autoplay](https://developer.chrome.com/blog/autoplay/)、[web-audio-autoplay](https://developer.chrome.com/blog/web-audio-autoplay/)、[chromestatus 4510315433689088](https://chromestatus.com/feature/4510315433689088) |
| Web Audio 也计入 MEI（§13.1 A5） | [developers.google.com/web/updates/2018/11/web-audio-autoplay](https://developers.google.com/web/updates/2018/11/web-audio-autoplay) |
| Web Audio 1.1 异步状态转移（§3.2） | Blink bug 40140417、[Gerrit 7266845](https://chromium-review.googlesource.com/q/Ic14070cd16d981ea356b59a28142d168b7be66ea) |
| `speak()` 门禁是粘性用户激活（§3.1 A9） | [Intent to Remove 邮件](https://groups.google.com/a/chromium.org/g/blink-dev/c/WsnBm53B4Pc)、[SO 77883855](https://stackoverflow.com/a/77883855) |
| ~15 秒截断 bug，2009 年提出至今未修（§13.2 A10） | [issues.chromium.org/issues/41294170](https://issues.chromium.org/issues/41294170)（原始报告 crbug 679437，2009） |
| Android 上 `pause()` ≡ `cancel()`（§13.2 A11） | [MDN SpeechSynthesis.pause() 的 BCD 表](https://developer.mozilla.org/docs/Web/API/SpeechSynthesis/pause)（Android 标注为「实质等同 `cancel()`」）、[dev.to/jankapunkt](https://dev.to/jankapunkt/cross-browser-speech-synthesis-the-hard-way-and-the-easy-way-353) |
| `getVoices()` 首次为空是规范允许（§13.2 A12） | [MDN SpeechSynthesis.getVoices()](https://developer.mozilla.org/docs/Web/API/SpeechSynthesis/getVoices)（明写「返回的数组可能为空」、需配合 `voiceschanged`）、[Web Speech API 规范 voices 段](https://w3c.github.io/speech-api/speechapi.html) |
| Android 上 `utterance.voice` 被忽略（§4.2 A13） | [issues.chromium.org/issues/331977824](https://issues.chromium.org/issues/331977824) |
| `cancel()` → `speak()` 竞争吞单（§4.1 A14） | [issues.chromium.org/issues/41436964](https://issues.chromium.org/issues/41436964) |
| headless Chrome 下拿不到网络音色（§13.5 A15） | [issues.chromium.org/issues/40885239](https://issues.chromium.org/issues/40885239) |
| ~~HarmonyOS NEXT 无 Chrome，只有 ArkWeb~~（§13.3 A16）—— **已排除**：用户 2026-10-12 确认平板上有 Chrome | [华为开发者文档 · Web 内核概览](https://developer.huawei.com/consumer/en/doc/harmonyos-guides-V13/web-component-overview-V13) |
| ArkWeb 坚盾守护模式禁用 Web Speech API（§13.3 A17）—— 同上，设备非 ArkWeb 则不适用 | [华为文档 · 坚盾守护模式](https://developer.huawei.com/consumer/ru/doc/harmonyos-guides/web-secure-shield-mode) |
| Android WebView 无原生 TTS（§13.3 A19） | [MDN SpeechSynthesis 浏览器兼容表](https://developer.mozilla.org/docs/Web/API/SpeechSynthesis#browser_compatibility)（WebView on Android：No support）、chromium issue 710238 |

---

## Dev Agent Record

### Agent Model Used

MiniMax-M3.1-Flash-Preview（`[DS]` 执行，2026-10-12）

### Debug Log References

**#1 —— `tsconfig.test.json` 的 TS6307 已实测复现并修复（Task 0）**
先建 `tests/services/__probe.test.ts` import `src/services/pronunciation.ts`，
`npx vue-tsc -b --force` 报：

```
error TS6307: File '.../src/services/pronunciation.ts' is not listed within the file list of
project '.../tsconfig.test.json'.
```

采纳修法 B（扩 `include`，不动 `references`）后同一命令**零输出**，`vitest run` 全绿。
连带影响已写进 `tsconfig.test.json` 的注释：这两个目录此后同时属于 app 与 test 两个
composite 项目，**不要去「修复」它**，一改就撞回 TS6307。

**#2 —— 一个真实设计缺陷被测试逼出来：`playPronunciation` 隐式依赖探测先跑过**
最初 `playPronunciation` 从模块级 `voices` 取音色，而 `voices` 只在 `probeTts()` 里填充。
测试「同时设置 voice 与 lang」直接失败（voice 为 null）。
根因不是测试写错，而是**发声的可用性依赖了一条隐式的调用顺序** ——
Story 1.10 会在任意时机第一次调 `playPronunciation`，那里若没先探测过就会无音色可用。
修法：抽出 `ensureVoices()`，`probeTts()` 与 `playPronunciation()` 都从它取，
音色只拉一次（`voicesHooked` 守卫），`voiceschanged` 到达时清缓存重判。

**#3 —— 预热幂等判据从「已完成」改为「已发起」（对 Task 1.5 措辞的收紧）**
按字面实现「已预热则直接返回」，连点三次「开始游戏」会发出 **3 条**预热 utterance
（真实设备上第一条还没 onend，用户已又点了两次），AC-8 明令「不出现重复预热」。
改法：`warmupStarted`（发起即置位，幂等判据）与 `preheated`（完成态）分离，
并新增 `isPrewarmed()` 把完成态暴露出来供 AC-2 的三条断言观察。
发起失败（`speak` 抛错）时**不**置 `warmupStarted`，允许下次点击重试。
⚠️ 这比任务 1.5 的字面描述更严，理由是 AC-8 的「反复点 5 次」比 1.5 的措辞更接近现实。

**#4 —— 两条反向验证都真的红了（Task 7.2 / 7.3）**

| 反向验证 | 改动 | 结果 |
|---|---|---|
| 7.2 | 在 `unlockAudioSequence` 里加 `await Promise.resolve()` | `npm run lint` 退出码 **1**，报 `no-restricted-syntax`（自定义 message 命中），验证后已删除 |
| 7.3 | 把 `if (synth.speaking) { cancel() }` 改成无条件 `cancel()` | `vitest run` 1 failed / 36 passed，红的正是「speaking === false 时绝不调用 cancel」，验证后已恢复 |

**#5 —— lint 逼出两处 `prefer-const` 与三处测试代码风格问题**
`let timer` 声明后只赋值一次被 `prefer-const` 命中。**没有**改成 `const`（那会引入 TDZ），
而是把「收敛」语义改成显式标志位（`settled` / `advanced`）：定时器是一次性的，
第二次触发本就是 no-op，`clearTimeout` 在这里没有价值。
测试侧修了 class/interface 声明合并与 `this` 别名。

**#6 —— `[CR]` 2026-10-12：三条反向验证，全部确认会红**

审查发现两处「假绿」—— 把实现改坏后测试全绿。除了补断言，本次同样做了变异验证：

| 变异 | 结果 |
|---|---|
| `utterance.onerror = advance`（退回 P1 的写法） | `Tests 3 failed / 45 passed` —— 红的正是 cancel 推进链、无接管 WARN、真实失败不降级 |
| 删掉 `speakChunkAt` 里的 `generation !== playbackGeneration` 判据 | `Tests 2 failed / 48 passed` —— 红的正是「旧链兜底定时器醒来后复活」与「迟到 onend 复活」 |
| 删掉 `unlockAudioSequence()` 里的 `prewarmBgm()` | `Tests 1 failed / 9 passed` —— 红的正是「三步全部发生」 |

⚠️ **一条重要的自省**：P2（generation）的第一版用例**没有**抓住回归 ——
删掉代次判据后 48 个用例照绿。原因是 `cancel()` 派发的 `error('canceled')`
本来就会让旧链停下，所以「接管」那一下看起来不需要代次隔离。
**真正需要它的是旧链自己的兜底定时器醒来、以及浏览器补发的迟到 onend**。
补上那两条用例后才真正变红。

### Completion Notes List

- **交付的不是一个「能念字」的功能，而是一套被下游 16 个 story 复用的服务契约。**
  对外只有两个稳定入口：`playPronunciation(text): void`（唯一发音接口）与
  `getAudioContext() / unlockAudioSession()`；下游不需要知道预热、分块、降级这些细节。
- AC-1 三步同步块成立，`src/app/audio-unlock.ts` 函数体恰好三行、无 `await`、无条件判断、无 try。
- AC-2 三路收敛（onend / onerror / 超时 1500ms）落地，`isPrewarmed()` 可观测。
  ⚠️ **它只表示「预热流程已收敛」，不是「TTS 已就绪」的健康信号**（超时兜底也会把它置 true）。
  Story 1.16 的调试面板**不得**拿它当就绪判据 —— 见 Review Findings 的 D1 裁决。
- AC-4 音色链六档逐档 + en-US + en 两级回退；**同时设 `voice` 与 `lang`**（legacy 漏的一步）；
  lang 归一兼容 `en_US`；`voiceschanged` 已订阅，音色到货后缓存作废重判；
  **另加 `PROBE_RETRY_MS` 冷却重试** —— 有些实现（WebView 常见）根本不派发 `voiceschanged`，
  只订阅不轮询的话那台设备上英式优先会形同虚设。
- AC-5 降级路径**位置固定**在 `fallbackToRecording`，调用方永不需要写 `if (ttsFailed)`。
  诚实说明：录音资源属 Story 3.4，本 story 交付时 `public/assets/audio/voice/` 是空的，
  实际行为是「记 `WARN [tts]` → 返回 → 回合继续」，符合 AC-5 后两条；
  与 `prewarmBgm` 同理**刻意不**去请求尚未存在的资源（避免把不存在的资源写成 404 故障）。
  **`[CR]` 补的三条**：① 朗读 utterance 的 `onerror` 也走降级（真实浏览器里
  `speak()` 极少同步抛错，主要失败形态正是异步 `onerror`）；
  ② 链条中途 `speak()` 抛错时**剩余分块一并走降级**，不再无声丢失；
  ③ `getVoices` 缺失/抛错不再外抛（否则异常会从解锁三步里冒出去，让 `prewarmBgm()` 根本执行不到）。
- AC-6 `cancel()` 只在 `speaking === true` 时调用，**注释写的是正确理由**
  （Chromium issue 41436964 的 cancel→speak 竞争），**没有**照抄 legacy 那条查无实据的说法。
  **`[CR]` 补的一条**：cancel 现在只在 `playPronunciation` 入口做**一次**，
  不再每块重判 —— 原写法每块都判一次，浏览器在 `onend` 期间仍可能报 `speaking = true`，
  那是最容易命中竞争窗口的一步。
- AC-7 按句切块 + `onend` 链式推进 + 每块 20s 超时兜底（>15s 截断阈值，否则兜底永远轮不到）。
  **`[CR]` 补的三条字符保真修复**：词切后不丢空格、句子开头/独立的 `.!?` 不被吞、
  硬切按码点迭代（不劈开代理对）。另：兜底定时器在收敛时被 `clearTimeout`，
  不再每块各挂 20 秒。
- **AC-3 的归属（原本没写在这里，`[CR]` 补）**：AC-3「卡面出现即朗读 + 点击无限次重听」
  **属于 Story 1.10，本 story 只交付它依赖的服务能力**。`src/components/quiz/` 仍只有 `.gitkeep`，
  `StartView.vue` 的 `onStart` 里没有任何 `playPronunciation` 调用 —— 这是**不越界**，
  不是漏做。朗读链的**重入安全性**（后一次调用完整接管发声权）在本 story 内已实现并测试，
  因为它是 `playPronunciation` 接口契约的一部分。
- AC-9 边界复核：`src/components/quiz/` 仍只有 `.gitkeep`、`public/assets/audio/` 无资源文件、
  `src/core/` 未新增任何文件、未引入任何音频库、无音量/静音 UI、无调试面板。
- **未完成**：7.4–7.7 真机验收（需用户在平板上执行，见任务段说明）。AC-8 的两项记录
  —— 本机实际命中的音色名与 Chrome 版本号 —— 是 Story 3.4 校准的输入，尚未取得。

### 2026-10-13 收尾核对（状态推进到 `review`）

**全量回归**：`npm run test` → **185 passed / 6 files**，退出码 0，无回归。
（1-2 自身的 113 个用例是其子集；另 72 个来自 Story 1.1 / 1.3。）

**本次收尾只做了三件事，没碰任何产品代码：**

1. **补勾那条被撤回的 `[Review][Patch]`**（AC-1 时序断言「有洞」）。
   它此前一直是 `[ ]`，容易被后续 `[CR]` 当成漏做的活再报一次。
   勾上是因为**结论已定**（变异验证证明三种延后写法都会让旧断言当场变红，
   建议补丁抓不到任何旧断言抓不到的东西），**结论是不需要改动**。
   用例维持原样，变异记录留在用例注释里。
2. **状态由 `in-progress` 推进到 `review`** —— 代码侧结清，唯一未过的门是硬件。
3. **更新头部说明与 Change Log**，把「AC-8 未达成」这件事写在最显眼处，
   免得下一个接手的人从 `review` 误读成「全绿可上生产」。

**⚠️ 明确没有做的事（以及为什么）：**

- **没有**勾 Task 7.4–7.7 —— 它们要求在目标平板上真机操作，代码侧无法代做。
- **没有**置 `done` —— AC-8 是硬性验收（「有声音」不算通过），
  拿不到真机音色名就置 `done` 属于把未验证的东西记成已验证。
  本仓库的先例是 Story 1.1：真机回填后才勾 AC-1 闭环、才置 `done`（`673d91a`）。
- **没有**动 `VOICE_PRIORITY` —— 桌面预验已证明英式优先在这类设备上失效，
  但**正确修法取决于真机音色名**（见任务段的改法对照表）。
  拿桌面名单去猜平板，猜错就是白改一轮，还有把美音/英式取舍改反的风险。

**恢复条件**（拿到即一次性收口）：目标平板的音色列表 + Chrome 版本号
→ 回填 AC-8 → 按真机名单定 `VOICE_PRIORITY` 修法 → 勾 7.4–7.7 → 置 `done`。

### File List

**新增**

- `src/services/pronunciation.ts` —— TTS 引擎 + `playPronunciation` 统一发音接口
- `src/services/audio.ts` —— AudioContext 会话 + BGM 预解骨架
- `src/app/audio-unlock.ts` —— 三步同步块（对架构目录的有意扩展，理由见 §1）
- `tests/services/pronunciation.test.ts` —— 58 个用例（50 TTS + 8 录音主通路，后者为 `[CC]` 纠偏新增）
- `tests/services/audio.test.ts` —— 10 个用例
- `tests/scaffold/audio-unlock-guard.test.ts` —— 禁 await 守卫的回归测试 + `matchesGlob` 自测（13 个用例）

**修改**

- `src/services/pronunciation.ts` —— **`[CC]` 纠偏后新增录音主通路**：`playPronunciation(text, entryId?)` 先试预生成录音，失败降级设备 TTS；新增 `playRecording` / `stopActiveRecording` / `ENTRY_ID_PATTERN` / `RECORDING_BASE_PATH`；原 TTS 主体抽为 `speakWithTts`
- `tests/services/pronunciation.test.ts` —— 新增 8 个录音主通路用例（50 → 58）；另修 2 处断言（降级日志措辞随纠偏变更）
- `tsconfig.test.json` —— `include` 纳入 `src/services/**` 与 `src/app/**`（TS6307 实测阻断项）
- `eslint.config.js` —— 新增解锁链路的 `no-restricted-syntax`（禁 `AwaitExpression`）
- `src/views/StartView.vue` —— `onStart` 接上 `unlockAudioSequence()`，头注释同步更新
- `_bmad-output/implementation-artifacts/sprint-status.yaml` —— 1-2 状态流转

### Change Log

| 日期 | 变更 |
|---|---|
| 2026-10-13 | **收尾核对：状态 `in-progress` → `review`（未置 `done`）**。全量回归 185 用例全绿、零回归。<br>本次**未改动任何产品代码**，只动 story 文件：① 补勾那条被撤回的 `[Review][Patch]`（结论是「无需改动」，此前留 `[ ]` 会被下一轮 `[CR]` 当漏做的活重报）；② 状态推进到 `review`；③ 头部说明与本条 Change Log 显式标注 **AC-8 仍未达成**。<br>⚠️ **为什么是 `review` 而不是 `done`**：AC-8「有声音不算通过」是硬性验收，Task 7.4–7.7 需目标平板真机执行，§13.5 禁止用 headless 代替 —— 代码侧无法代做。用户在 2026-10-13 已决策延后平板真机验收。拿不到真机音色名就置 `done`，等于把未验证的东西记成已验证；仓库先例是 Story 1.1，真机回填后才闭环（`673d91a`）。<br>⚠️ **`VOICE_PRIORITY` 刻意没动**：桌面预验已证实英式优先在该类设备上静默失效（设备有 `Google UK English Female`，而优先链精确匹配 `'Google UK English'` 不中，直接落到第二档美音），但**改法取决于真机音色名**（改优先级链 vs 改前缀匹配 vs 别的），拿桌面名单猜平板会白改一轮，还可能把英/美取向改反。<br>**不阻塞下游**：`playPronunciation` 契约完备，后续 story 照常开发；AC-8 的产物（音色名 + Chrome 版本号）是 Story 3.4 的输入。 |
| 2026-10-12 | **`[CC]` 纠偏：朗读主备对调**（架构决策 7）。引入 MiniMax 预生成录音（`speech-2.8-hd` + `English_LovelyGirl` 英式女童声，一次性 ≈ ¥5），把「设备 TTS 主路 / 录音降级」反转为「**录音主路 / 设备 TTS 辅路**」。<br>**理由**：设备 TTS 的发音取决于设备装了哪些引擎（架构已记录 EMUI 可能 0 voices、Android WebView 完全不支持原生 TTS），跨设备不可复现；而认读质量是本作核心。录音让发音成为产品常量而非设备偶然产物。<br>**代码改动刻意极小**：接口从 `playPronunciation(text)` 扩为 `playPronunciation(text, entryId?)`；原 TTS 主体**整体抽为 `speakWithTts` 不改逻辑**；新增 `playRecording` 走 `new Audio()` + `error` 事件 + `play()` rejected 三路收敛。全局**无 await**（禁 await 规则未被绕过）。<br>**原 44 个 TTS 用例全部保持通过** —— 因为 TTS 仍是辅路。另补 **8 个录音主通路用例**（录音优先、路径命名、无 id 不猜路径、404 降级、autoplay 被拒降级、重入打断、id 路径注入拒绝、两条通路皆失效不抛）。<br>**三条反向验证均确认会红**：① 关闭录音分支 → 5 红；② 移除 `ENTRY_ID_PATTERN` → 1 红；③ 移除重入打断 → 1 红。<br>⚠️ 一条顺带修正：`fallbackToRecording` 的名字已与实际语义不符（它现在是「两条通路都失败」的终点，不是「降级到录音」）。改名会波及既有断言，故保留名字并在注释里说明现状 —— 记为后续可清理项。 |
| 2026-10-12 | **`[CR]` 二轮三层审查（纠偏后复审）**：又一轮 Blind Hunter / Edge Case Hunter / Acceptance Auditor，共 48 条原始发现 → 去重 36 条 → 判为噪声 4 条、延后 4 条、需决策 2 条、修补 10 条。<br>**两条决策已裁决**：AC-5 的契约裂缝选 (a) 承认现状（AC-5 段落加 `[CC]` 纠偏批注，「必须传 entryId」写成 `playPronunciation` 的显式契约 + 3 条用例钉住）；AC-8 未完成选 (b) **故事保持 `in-progress`**，等平板真机数据回填再收口。<br>**头号缺陷：发声权接管不对称** —— `stopActiveRecording()` 只在 `playRecording` 内、`synth.cancel()` 只在 `speakWithTts` 内，两个机制各自够用却漏掉 2×2 的交叉格，TTS→录音与录音→TTS 两个方向都**两声重叠**。抽出 `takeOverPlayback()` 作为唯一入口，在 `playPronunciation` 分派之前把两个音源都掐掉。另有：录音链接上 `playbackGeneration`（此前全文件只写不读，陈旧 404 会劫持新播放念出上一个词）、`onerror` 的 `canceled`/`interrupted` 改走 `finish()`（此前裸 return 把 20 秒兜底定时器留在原地，链被复活）、`entryId` 补 `typeof` 门（`RegExp.test` 会把 `null` 强制转成 `"null"` 绕过校验）、`selectVoice` 优先级链补判 `isEnglish`、录音播完放开 `activeRecording` 引用、顶层 `beforeEach` 从文件中部移到顶部。<br>测试 **95 → 113**，新增 5 组共 18 条用例。<br>⚠️ **本轮最重要的一条不是修的 bug，是撤回的一条 patch**：有审查方报「AC-1 时序断言测不出第③步被延后」，实测三种延后写法（`queueMicrotask` / `setTimeout` / `.then()`）**都会让旧断言当场变红** —— 建议的补丁抓不到任何旧断言抓不到的东西，已撤回，只在用例注释里留下变异记录。**教训：反向验证没做就采信「这条断言有洞」，代价是往套件里塞一条永远不会失败的断言。**<br>⚠️ 本轮全部 6 处修复均做了**变异验证**（改坏 → 确认用例变红 → 复原），其中 P3 的首版用例是**假绿**（测试文本 34 字符 < `MAX_CHUNK_CHARS` 200，根本没分块），改用超长文本后才真正抓住。 |
| 2026-10-12 | **`[CR]` 三层对抗审查（Blind Hunter / Edge Case Hunter / Acceptance Auditor）**：分诊出 17 条 patch、2 条延后、3 条判为噪声。**17 条 patch 已全部修复**，`lint` / `vitest`（87 用例）/ `vue-tsc -b` / `build` / `validate:content` 五条全过。<br>其中最重的一组是**同一设计缺陷的三个症状**：`utterance.onerror = advance` 把 `cancel()` 派发的 `error('canceled')` 当成「这块念完了」而推进链；跨调用无代次隔离导致多条链互相残杀（孩子点的词被念了但立刻被掐）；`cancel()` 写在 `speakChunkAt` 内每块重判一次，正面撞上 AC-6 要避开的 issue 41436964 竞争窗口。<br>**一处重构同时消解**：模块级 `playbackGeneration` 代次 + cancel 移到 `playPronunciation` 入口做一次 + `onerror` 走独立的失败分支（`canceled`/`interrupted` = 被打断，不推进；其余 = 真失败，记 WARN + 降级）。<br>另修：链条中途 `speak()` 抛错时剩余分块一并降级、`getVoices` 缺失/抛错不再外抛、`probeCache` 的 `PROBE_RETRY_MS` 冷却重试、`chunkText` 三处字符损坏（丢空格 / 吞开头标点 / 劈代理对）、兜底定时器收敛时清理。<br>测试侧补了 3 组共 21 个用例，其中两条是**替换掉原有假绿断言**而非叠加。<br>⚠️ 一条自省：P2（generation）的第一版用例没抓住回归 —— 删掉代次判据后 48 个用例照绿；真正需要它的是「旧链兜底定时器醒来」与「浏览器补发的迟到 onend」，补上后才变红。 |
| 2026-10-12 | `[DS]` 实现完成：3 个源文件（pronunciation / audio / audio-unlock）+ 3 个测试文件，66 个用例全绿；`lint` / `build` / `validate:content` 三条全过。Task 0 的 TS6307 实测复现并修复，两条反向验证（禁 await / cancel 守卫）均确认会红。真机验收 7.4–7.7 待用户执行 |
| 2026-10-12 | Story 1.2 创建完成：AC 10 条（epics 4 组 Given 块编号 + 新增 2 条 AC-7/AC-8 的设备核实项 + 1 条不越界 + 1 条静态守卫 AC-10），8 个任务（Task 0 为测试的类型检查前置） |
| 2026-10-12 | 并入 2026-10-12 联网核实结论（Dev Notes §13）。三处实质修正：① `cancel()` 空闲调用会破坏音频会话 —— **查无证据**，真实理由是 issue 41436964 的 cancel→speak 竞争（规则保留、理由更正）；② Android 上 `utterance.voice` 可能被整个忽略 → 本 story 比 legacy 多做「同时设 `lang`」；③ Chrome ~15 秒静默截断 bug 跨十年未修 → 分块契约进接口 |
| 2026-10-12 | 实测发现并解决一个**硬阻断**：测试文件 import `src/services/` 时 `vue-tsc -b` 报 **TS6307**（`tsconfig.test.json` 的 include 未覆盖 app 层源文件）。两条修法实测对照：加 `references` → **TS6310**（app 项目 noEmit）；扩 `include` → 通过。新增 **Task 0** 作为 Task 6 的硬前置，AC-10 增列该条 |
| 2026-10-12 | **用户确认目标平板上有 Chrome** —— §13.3 的 ArkWeb / 坚盾守护模式风险随之排除，Chrome 侧全部结论适用。AC-8 与 Task 7.6 的记录项从「三项设备信息」收敛为「音色名 + Chrome 版本号」 |
| 2026-10-12 | **独立对抗复审（第二遍，全文重审）** 落 9 处修订。**其一是一处自我撤回**：§3.1 原称「Web Audio 用 transient 激活、`speechSynthesis` 用 sticky」，据此推出的推论作废 —— 实际二者同用 **sticky**（W3C autoplay 规范 + Chromium `autoplay_policy.cc` 的 `HasStickyUserActivation()`）。§3.1 已重写，「禁 await」规则**保留**，但理由换成三条站得住的（架构已定稿、Web Audio 1.1 异步状态转移下的 pending-resume 时序、零成本保守）。其余 8 处为可信度修正：② `rate > 2.0` 由 (A) 降级为 (B) 并撤销其「硬上限」表述（规范范围是 0.1–10）；③ §13.5 的 Puppeteer 禁令**因果更正** —— 真正的杀手是 `--disable-component-extensions-with-background-pages`，`--mute-audio` 只在 `headless === true` 分支出现，原文归错会导致误判；④ ~15 秒截断 bug 的时间线由「自 2015 年」更正为 **crbug 679437 / 2009 年**；⑤ A11 证据升级（MDN BCD 明载 Android `pause()` ≡ `cancel()` + Chromium `tts_android.cc` 的 `Resume()` 空实现）；⑥ A12 换源 —— StackOverflow 不满足本 story 自定的 (A) 定义，改用 MDN `getVoices()` + Web Speech 规范；⑦ §14 删掉 deepwiki 内容农场链接，A19 由第三方厂商兼容表换成 MDN BCD；⑧ Task 0 的「Debug Log #8」归属错误（#8 讲 `tests/`，本例是 `scripts/`），改指 §14 交接信息行；⑨ Change Log 「7 组 Given」更正为 **4 组**（`grep -c '^\*\*Given'` 实测） |