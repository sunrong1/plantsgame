# Epic 1 集成层代码检视（2026-10-22）

> ⚠️ **本文件不是 story。** 它是一次**跨 story** 的代码检视产物 —— 覆盖 `src/` 全部
> 51 个 `.ts`/`.vue`（14,113 行），评审对象是「Epic 1 累积出来的整棵代码」，
> 而不是某一个 story 的 diff。
>
> **为什么要有它**：Epic 1 的 20 个 story **全部**已经过各自的 `[CR]`（三层对抗评审），
> 所以本检视**不重复**那些工作。它专查**单 story 评审结构上看不见的东西**：
> 跨文件的口径复制链、跨 story 的移交闭环、跨层的不变量空洞、规则守卫的盲区。
>
> **方法**：三层对抗评审（Blind Hunter / Edge Case Hunter / Acceptance Auditor）×
> 三个文件组（`core/` · `app+services/` · `components+views+styles/`），
> 外加两条专项审计（跨 story 移交闭环、规则守卫盲区）。
> **每一条 finding 都由主评审回代码逐条核验过** —— 核验不成立的已驳回，
> 核验后改变了措辞或严重度的已改写（见文末「核验留痕」）。
>
> **最值钱的一条**：`OptionCard.vue` 的 `.is-locked` 在同特异度下位置最后，
> **把答题的绿底/红底整个吃掉** —— AC-D2 规定的主反馈载体在**每一次正常答题**中都没画出来过。
> 详见「二之二」的第一条。

---

## Review Findings

### 〇、处置台账（本轮结论 —— 先看这里，再看下面的逐条论证）

> ⚠️ **本表是这一轮检视的权威结论。** 下面的逐条论证是**证据**；
> 本表是**处置**。两者不一致时以本表为准。

**本轮共 54 条发现 · 3 条需人裁决 · 13 条已修 · 41 条已登记延后（另 1 条 LOW 清单）**

| 分组 | 条数 | 已修 | 已登记延后 |
|---|---|---|---|
| 一、需要人裁决 | 3 | **3** | 0 |
| 二、代码缺陷 | 20 | **6** | 14 |
| 二之二、UI 层真机缺陷 | 5 | **4** | 1 |
| 二之三、app / services | 4 | 0 | 4 |
| 三、规格与代码的口径复制链 | 12 | 0 | 12 |
| 四、状态账本 | 4 | 0 | 4 |
| 五、规则守卫盲区 | 6 | 0 | 6（+1 条 LOW 清单） |

**已修的 13 条 —— 守卫与变异逐条对得上**

| # | 事项 | 守卫 | 变异实测（R-50 / R-51） |
|---|---|---|---|
| 1 | 最后一道题的正确项词图 404 ⇒ 该局永久通不了 | **G254**（门面 `tests/app/skip-facade.test.ts` + 组件 `tests/components/quiz-card.test.ts`） | **M304** 全量 1 红 |
| 2 | `epics.md` 的 FR46 / FR47 与实现相反 | 改文档（`epics.md` 两处） | — |
| 3 | AR43「两套形状」与架构的「半径 3 的圆」 | 改文档（`epics.md` 两处 + `game-architecture.md` 一处） | — |
| 4 | 两个读档规范化函数在 `try` 之外 | **G260** | **M297** 全量 1 红 |
| 5 | `assertInvariants` 不校验 `unitNumber` | **G256** | **M293** 全量 4 红 |
| 6 | `prefetchUnit` 会同步抛 | **G259** | **M296** 全量 3 红 |
| 7 | `handCards` 会抛 ⇒ 战场整页白屏 | **G257** | **M294** 全量 1 红 / **M295** 全量 1 红 |
| 8 | 存档降级重建取的是「模块求值期」的单元号 | **G261** | **M299** 全量 3 红 |
| 9 | 僵尸列号上界的「唯一强制点」被读档路径绕过 | **G258** | **M292** 全量 2 红 |
| 10 | `.is-locked` 的层叠把答题的绿底/红底吃掉 | **G253** | **M300** 全量 2 红 |
| 11 | 触摸端的隐式指针捕获让 AC-D1 / AC-E1 整条失效 | **G255** | **M306** 全量 1 红 |
| 12 | `.battle-cell` 没有 `touch-action` | **G255** | **M305** 全量 1 红 |
| 13 | `pointerup` 落在网格之外 ⇒ 绿光永久残留 | **G255** | **M307** 全量 1 红 |

⚠️ **每条变异都做过「改坏代码 → 跑全量 → 数红 → 还原」**（R-50 / R-51），
   红灯数与守卫编号写在上面那张表里；**变异编号 M292–M307 与守卫编号 G253–G261
   都是本轮新起的号**（起号前按 R-36 扫过全仓 `tests/`，最大到 G252 / M291）。

**已登记延后的 41 条 + 1 条 LOW 清单**
⇒ 全部登记在 `_bmad-output/implementation-artifacts/deferred-work.md`
   的「`## Deferred from: code review of epic-1-集成层检视 (2026-10-22)`」一节，
   编号 **E1–E42**。**本文件不复述它们的论证**（R-37）。

#### ⚠️ 裁决一带来的**规格偏差**（必须留痕）

- **AC-E4「正确项缺图 ⇒ 整题过滤」在**一种**情况下不再成立**：题单被抽空时
  （那道题是本局最后一道），过滤做不到 ⇒ 按裁决改为「**破图的正确项保持可点**」，
  并用**词文本**顶上那张图。
  - **为什么不谎报通关**：那道题**确实没答对过**，本局照常走完（该答错就答错），
    只是**不再被那张 404 的图挡住**。
  - **影响面**：**只**在「题单被抽空」时；能跳题时**照旧整题过滤**（G254 的回归用例守着）。
  - **为什么记在这里而不是改 1.18 的 story 文档**：那份文档已 `done` 并归档，
    **R-40 禁止改归档文档**（改了就等于伪造历史记录）⇒ 偏差记在本轮检视的正文里。
  - **待补**：1.18 的 AC-E4 正文与 `epics.md` 里对应的 AC 应补一句限定语
    （**归属 deferred E27 那一族** —— `SKIP_QUESTION` 整条机制都没有 AC 授权）。

### 一、需要人裁决（3 条）—— 已全部裁决并落地

- [x] [Review][Decision] **最后一道题的正确项词图 404 ⇒ 该局永久通不了** [src/app/store.ts:853] —— **[已修 · G254 · 裁决「破图的正确项保持可点」]**
  两层双双拒绝推进，于是没有任何一条路能救这个孩子：
  ① 门面 `reportImageFailure` 的第 ④ 道守卫 —— 「跳过去之后题单就空了 ⇒ 不跳」；
  ② `core/reducer.ts:367` 的 `applySkip` —— 「题单里已经没有别的题可考了 …… 而孩子一个词都没答」。
  而 `OptionCard` 的 `:disabled="failed || locked"` 让正确项**永久置灰**，
  三个干扰项仍可点 ⇒ 答错不增长 `masteredEntryIds` ⇒ `nextQuestion` 永远返回**同一道题**
  ⇒ 心数耗尽 `level-failed` ⇒ `restartLevel()` 重放同一题单、同一张 404 图 ⇒ **这一关永远通不了**。
  违反 Story 1.18 AC-E4（「正确项缺图 ⇒ 整题被跳过」）与 NFR13。
  **修法要产品裁决**：(a) 跳完这一局并如实判失败？(b) 允许任选一项当作已答？(c) 把这道题从题单里剔掉并结束本局？
  三条路的孩子体验完全不同，不能由实现者替孩子选。

- [x] [Review][Decision] **`epics.md` 的 FR46 / FR47 与实现相反，而这份需求清单是事实源** [_bmad-output/planning-artifacts/epics.md 的 FR46 / FR47（详细块与 Epic 摘要块各一处）] —— **[已修 · 改文档 · 裁决「作废这两句正文」]**
  FR46 逐字：「战场为 5 行 × 9 列网格；僵尸固定走中间行，**塔可种在任意空格**」；
  FR47 逐字：「塔的射程形状与僵尸行无关 —— **种在上下相邻行的塔也能打到中间行的僵尸**，「种在哪」因此是真实决策」。
  实现（`src/core/grid.ts:220`）是**相反**的：非僵尸行一律不可建，合法塔位 **35 格 → 7 格**。
  连带后果：FR47 给出的**设计理由**（「种在哪是真实决策」）被整个抽掉 —— 塔位不再有任何决策。
  ⚠️ **检视当时** `deferred-work.md` 对 `FR46` / `FR47` **零命中** —— 没有任何条目认领它们
     （这就是它们变成孤儿的原因）。
     ⚠️ **本轮 D2 更正之后**，账本里已经补上了**源码注释侧**的残留（`E21` / `E22`），
     但「`epics.md` 的 FR46 / FR47 正文」**仍然是零命中** —— 因为它已被本轮直接更正掉了，
     不再需要「认领」。
  **裁决**：作废 FR46/FR47 的这句正文（改 epics.md），还是改代码恢复多行建塔（属**平衡变更**，要走 R-20..R-24）？

- [x] [Review][Decision] **AR43「两套形状」与 `game-architecture.md` 的「半径 3 的圆」至今未消解** [epics.md 的 AR43 / game-architecture.md 的「射程可视化」一节] —— **[已修 · 改文档 · 裁决「作废『两套形状』那一句」]**
  两份文档都逐字写「范围塔须能同时画两套形状：放置覆盖（**半径 3 的圆**）与实际伤害（横向 3 格条带）」。
  实现只画**一套**（真实伤害形状），且「圆」在当前规则下**构造上不存在**（塔只可能在僵尸行 ⇒ 射程必然同行）。
  `deferred-work.md` 自己写着「**冲突未消解**」并注明「**建议的下一步（需用户裁决）**：AR43 是要作废……还是保留并附条件」。
  ⚠️ **本次检视把「待裁决」收窄成了「有明确推荐」** —— 因为 `epics.md` **内部就自相矛盾**，
  而**四方证据一致站在「条带」这边**：
  | 出处 | 逐字主张 | 站哪边 |
  |---|---|---|
  | FR38（`epics.md` 的详细块与 Epic 摘要块各一处） | 「范围塔攻击范围 = ……共 **3 格**」「Epic 1 — 范围塔 = 同行 3 格，**不是半径 2 的圆**」 | 条带 |
  | AR42（`epics.md`） | 「肉眼核对射程判定，尤其范围塔的**横向 3 格条带**」 | 条带 |
  | Story 1.17 的 AC（`epics.md` 中覆盖 AR39–AR42） | 「网格与射程覆盖层可肉眼核对射程判定，尤其范围塔的横向 3 格」 | 条带 |
  | R-07（`docs/rules/architecture.md`） | 「范围塔的覆盖是**同行三个格子**」 | 条带 |
  | Story 1.12 的 AC（`epics.md` 里「范围塔的放置覆盖」那句） | 「**范围塔须能同时画两套形状**：放置覆盖（**半径 3 的圆**……）与实际伤害（横向 3 格条带）」 | **圆（异类）** |
  | AR43（`epics.md`）与架构（`game-architecture.md` 的「射程可视化」一节） | 同上「两套形状」 | **圆（异类）** |
  ⇒ **FR38 是需求正文（事实源），Story 1.12 的 AC 是异类**（且它连「半径 2」还是「半径 3」都对不上 FR38）。
  ⇒ **推荐**：作废 Story 1.12 AC 的「两套形状」那一句 + AR43 的同句 + 架构「射程可视化」那一节，
  **不是**「保留并附条件」。⚠️ `deferred-work.md` 对这条只列了 AR43 与架构**两处**，
  **漏了真正管辖实现的 `epics.md` 里 Story 1.12 的 AC 正文** ⇒ 账本要补登。

---

### 二、代码缺陷（**20 条** —— 6 条已修 · 14 条已登记延后）

#### 存档与内容层解引用（同一族：存档是外部数据，却在地层的 try 之外被解引用）

- [x] [Review][Patch] **两个读档规范化函数在 `try` 之外，损坏存档会抛穿 `enterLevel()`** [src/app/store.ts:393] —— **[已修 · G260 · M297]**
  `dropOutOfDeckSkipped`（`store.ts:357` 做 `restored.deck.map`）与 `backfillLegacyBuildPhase`（读 `state.phase.kind`）
  都在 `try`（`:399`）**之前**执行。而 `parseSaveFile` 逐字声明**不深校验** `currentGame`
  （`src/services/save.ts:474-475`：「深校验是 `core/` 的 `assertInvariants` 的活，在 app 层调它」）。
  ⇒ 一份 `currentGame: {}` 的存档能通过解析 → `restored.deck.map` 抛 TypeError
  → 逃出 `restoreFromSave` → 逃出 `enterLevel()` → 逃出 `StartView.onStart()`
  → **孩子的点击路径上出现技术错误**（NFR13），且存档**永远不会被重写** ⇒ 每次「开始游戏」重复同样失败。
  参照：`advanceLegacyRoundOver` 在 1.19 `[CR]` 第四轮已经被**移进** `try` 之内 —— 同一族问题已有先例。
  **修法**：把这两个规范化函数移进 `try`（与 `advanceLegacyRoundOver` 同处）。

- [x] [Review][Patch] **`assertInvariants` 不校验 `unitNumber`** [src/core/reducer.ts:843] —— **[已修 · G256 · M293]**
  `assertCounters` 只查 hearts / sun / turn；`assertDeckRelations` 只查 entryId 关系。
  ⇒ 一份 `unitNumber: 999` 的存档能过**全部**不变量并被装进 `state.value`，
  而孩子**答第一题**时 `sunPerCorrectFor(state.unitNumber)` → `tierForUnit` → 抛「单元 999 落在未填档位上」
  ⇒ 异常逃出 `applyAction` 逃进点击处理器 ⇒ **每一次答题都同样失败**，界面只有 console 报错、没有孩子能懂的话。
  同一份数据在 `src/views/LevelView.vue` 与 `src/app/store.ts:583` 两处**已被当作不可信处理**，
  在第三处（不变量）**没人管**。
  **修法**：在读档路径上按 `restoreNextUnit` 的现成先例（`store.ts:499` 的 `unitIsRecorded`）先问「录了没有」。

- [x] [Review][Patch] **`prefetchUnit` 会同步抛，违反自己文件头的「绝不抛」契约** [src/services/asset-prefetch.ts:127] —— **[已修 · G259 · M296]**
  函数**不是** `async`、无 `try/catch`，`imageUrlsOfUnit` → `entriesOf` → `getUnit` 对未录单元**逐字抛**
  （`src/content/index.ts:88`）。`store.ts:312` 的 `void prefetchUnit(...)` 只压制 promise，**压不住同步抛**。
  文件头逐字写「3. **绝不抛**（NFR12 的运行时层）」。
  **修法**：包 try/catch（预取是优化，失败不阻断回合）。

- [x] [Review][Patch] **`handCards` 会抛，违反「组件层不 throw」契约 ⇒ 战场整页白屏** [src/core/build.ts:241] —— **[已修 · G257 · M294 / M295]**
  `handCards` → `costOf(entry.towerType, ...)` → `assertTowerType` **抛**。
  而 `assertInvariants` 校验了 `tower.towerType`（`reducer.ts:659`）却**从不校验 `deck[].towerType`**
  ⇒ 一份脏存档能过全部不变量。`src/components/hand/HandDeck.vue:60` 的 `computed(() => handCards(state.value))` 无兜底
  ⇒ computed 在渲染中抛 ⇒ **整个 LevelView 白屏**。
  `build.ts:100-104` 逐字承诺「组件层不 throw …… 非法坐标一律返回原因而不是炸掉整个渲染」。
  **修法**：`assertDeckRelations` 补一条 `deck[].towerType` 校验（core 侧），并让 `handCards` 对脏条目降级而非抛。

#### 音频 / 朗读（同一族：异步链缺兜底，超时与代次都不齐）

- [ ] [Review][Patch] **`ensureContextRunning` 的 `ctx.resume()` 同步抛未兜，会中止 `enterLevel()`** [src/services/audio.ts:592]
  `unlockAudioSession`（`audio.ts:332-350`）**明确**把 `resume()` 包进 try，注释逐字写着
  「残缺 polyfill 上 `resume` 可能根本不是函数、closed context 会抛 `InvalidStateError`」
  且「**同一个失败原因必须得到同一个生命周期**」。
  `ensureContextRunning` —— 每次 `playSfx` / `startBgmIfReady` 都会走的那条 —— **没有**这个 try；
  且 `startBgmIfReady` 在 `audio.ts:518` 调它，**在自己的 try 之外**（try 从 `:520` 才开始）。
  ⇒ 抛出会逃出 `startBgmIfReady` ⇒ 逃出 `enterLevel()`，**在 `restoreFromSave()` 与预取之前**
  ⇒ 孩子看到战场，但**存档没恢复、图片没预取**，错误从点击处理器冒出。
  **修法**：照 `unlockAudioSession` 的形状补 try/catch + `markSessionSuspended`。

- [ ] [Review][Patch] **音频 fetch 链无超时 ⇒ 一次卡住的请求让音效/BGM 永久失声** [src/services/audio.ts:629]
  `fetchAudioBuffer` 的 promise 链**没有超时**。卡住（而非失败）时：
  ① `bgmLoading` 停在 `true`（`audio.ts:465` 设、只在回调里清）⇒ `prewarmBgm` 永远早退 ⇒ **BGM 整个会话不响，无日志、无降级项**；
  ② `loadingSfx` 攥着那条永不 settle 的 promise ⇒ 该 cue **此后永久哑掉**，别的 cue 照常。
  ⚠️ `audio.ts:188` 的注释**逐字描述了这个后果**（「那个 cue 从此**永久哑掉**，而 `loadingSfx` 里还攥着这条永不 settle 的 promise」）
  —— 但那说的是**监听器**抛错；**fetch 挂起**是同型不同因，**没堵**。
  **修法**：给 fetch 链加超时，超时按「加载失败」处理（进 `failedSfx` / `bgmFailedReason`）。

- [ ] [Review][Patch] **录音通路无超时 ⇒ 朗读浮层永久亮着** [src/services/pronunciation.ts:281]
  TTS 通路有 20s `CHUNK_TIMEOUT_MS` 兜底；**录音通路（按架构决策 7 的主路）没有**任何超时，
  只有 `error` 事件 / `play()` 拒绝 / `ended` 事件三个收敛点。
  ⇒ mp3 请求卡住 ⇒ 不报错、不结束、`play()` 永远 pending ⇒ `publishPronunciationStatus('playing')` 永不复位
  ⇒ 浮层一直亮着、**没有声音**，且 `activeRecording` 一直攥着死元素与解码缓冲。
  **修法**：加与 TTS 通路对等的超时收敛点。

- [ ] [Review][Patch] **录音的 `ended` 处理器不查代次 ⇒ 旧录音能把新录音的浮层熄灭** [src/services/pronunciation.ts:276]
  同一个文件里，`finish()` 查 `generation !== playbackGeneration`（`:239`），
  TTS 通路的 `idle` 发布**也查**（`:786-793`，注释逐字：「被接管**不发** idle …… 旧链再发一次 idle 会让浮层闪一下又灭掉」）。
  只有录音通路的 `ended` 处理器**不查**，无条件 `publishPronunciationStatus('idle')`。
  ⇒ 孩子连点卡面时，旧录音的自然结束会把新朗读的浮层熄灭 —— 正是文件头逐字禁止的形态。
  **修法**：照 TTS 通路补代次检查。

#### 降级通知链（同一族：三个兄弟服务有守卫，两个没有）

- [ ] [Review][Patch] **`save.ts` 与 `asset-degradations.ts` 的监听器回调没有 try/catch** [src/services/save.ts:259 · src/services/asset-degradations.ts:84]
  同一仓库的另外三个服务**都有**守卫并写明了理由：
  `audio.ts:191`（「一个坏监听器就能让音效**永久失声**」）、`sw-registration.ts:64`、`pronunciation-status.ts:76`。
  `save.ts:259` 与 `asset-degradations.ts:84` 是裸调。
  `markAssetDegraded` 更是**直接从 4 个组件的 `@error` 事件处理器**里调
  （`OptionCard` / `Tower` / `HandCard` / `Zombie`）⇒ 异常会从 DOM 事件回调冒成未捕获错误。
  **修法**：照另外三个服务的形状补 try/catch + WARN。

- [ ] [Review][Patch] **监听器抛错会被误报成「存档存不进去」——而数据其实已经写进盘了** [src/services/save.ts:368]
  `writeSave` 的 `try` 把 `resolveDegradations(RESOLVED_BY_WRITE)`（`:368`）包在里面，
  而 `resolveDegradations` → `noteDegradationsChanged` → 监听器回调**裸调**（`:259`）。
  ⇒ 监听器抛错 ⇒ 落到 `writeSave` 的 `catch`（`:374`）⇒ 记 `markDegraded('write', '存不进去……')`
  ⇒ **面板永久告诉家长「存档存不进去」，而 `localStorage.setItem` 其实成功了**。
  **修法**：同上一条（补守卫）；并把 `resolveDegradations` 移出 `writeSave` 的 try。

#### UI 层

- [ ] [Review][Patch] **终局浮层的按钮是 2.78:1，低于 WCAG AA 的 4.5:1** [src/components/hud/LevelOutcome.vue:277]
  `background-color: #4caf50` + `color: #ffffff` + `font-size: var(--text-body)`（16px）。
  实算相对亮度 L=0.3276 ⇒ 对比度 **2.78:1**（大字号下限 3:1 也够不着）。
  该颜色**不在 `tokens.css` 里** ⇒ `palette.test.ts` 对它零实算。
  仓库自己的 `--color-correct: #2e7d32` 是 **5.13:1**。
  后果：这是终局画面上**唯一**的控件，而它正是孩子必须读懂并按下的那个。
  **修法**：改用已有 token（或按 G30b 的实算口径加 token + 守卫）。

- [ ] [Review][Patch] **手牌「买不起」的遮罩叠了两次，实际 alpha 是 0.6975 而非被审计的 0.45** [src/components/hand/HandCard.vue:190]
  `background-image: var(--color-overlay-unaffordable), var(--color-overlay-unaffordable)` —— **同一个罩叠了两层**。
  合成 alpha = 1 − 0.55² = **0.6975**。
  而 `tokens.css` 的注释与 `HandCard.vue` 自己的注释都按 **α=0.45** 算（卡面落到 `#76706e`、白字 4.87:1），
  G30b 的对比度实算也是从 token 读 α。
  ⇒ **被审计的 4.87:1 不是屏幕上那个数**（实际更暗 ⇒ 白字对比度反而更高），
  但 token 一旦被人调 α，两层会一起变 ⇒ 与注释、与守卫、与实算**全部脱钩**。
  **修法**：只留一层（若确实要 0.6975，就把它写进 token 并让注释与守卫跟上）。

- [ ] [Review][Patch] **`is-buildable` 是死类：模板挂着，全仓没有一条 CSS 规则用它** [src/components/battle/BattleField.vue:374]
  `grep -rn "is-buildable" src/` **只有 1 处命中**（就是这处 class 绑定）。
  后果连着 AC-12：「第 1 列与第 9 列必须**在视觉上与可建格明确区分**」——
  孩子看到 45 格里只有 7 格可建，却**没有任何视觉语言**说清是哪 7 格。
  这与 FR46/FR47 的孤儿问题同属「塔位」主题（该条目在 `deferred-work.md` 里被登记给**已 done** 的 1.12）。
  **修法**：要么用上它、要么删掉它，并加「模板里挂的每个状态类都必须有 CSS 规则」的守卫。

- [ ] [Review][Patch] **塔的 `alt` / `aria-label` 是英文枚举** [src/components/battle/Tower.vue:93、:104]
  `:alt="`${tower.towerType} 塔`"` ⇒ 屏幕阅读器读出「**direct 塔**」「slow 塔」「aoe 塔」。
  对照 `Zombie.vue:70/86` 用的是中文「僵尸」。
  面向 4–8 岁中文母语孩子，这三个英文枚举没有任何意义。
  该条目在 `deferred-work.md` 里被登记给 Story 1.12 —— 而 **1.12 早已 `done`**。
  **修法**：换成孩子侧的说法（塔型三选一的中文名），并加一条守卫。

#### 核心层的校验面不一致 / 数值漂移

- [ ] [Review][Patch] **同一个文件里两个射程原语的校验面不一致** [src/core/combat.ts:56 与 :88]
  `inRange` 只做 `assertGridIndex`（**只查是不是整数**），越界列号**静默返回 false**；
  `aoeColumns` 额外 `if (towerCol < 0 || towerCol >= COLS) throw`。
  ⇒ `selectTarget(zombies, 9, 'direct', 3)` 静默返回 `null`，`selectTarget(zombies, 9, 'aoe', 3)` **抛**。
  这正是本仓库 `[CR] P9` 点名的「校验面不一致」形态；而且 `build.ts:200` 还有**第三份**越界检查，
  其注释**自己承认**了这份不一致。两个原语都从 barrel 导出 ⇒ 下一个消费者会继承这个分歧。
  **修法**：把越界检查收敛成一份，两个原语共用。

- [ ] [Review][Patch] **`balance-sim` 自建了一份合法塔位列集，没用 core 的唯一出处** [scripts/balance-sim.ts:81]
  `BUILDABLE_COLUMNS` 由 `ZOMBIE_SPAWN_COL - 1` 现场推导，而 `core/grid.ts:199` 的 `buildBlockedReason`
  才是**唯一出处**（`core/index.ts:38` 把它导出成唯一出口）。
  今天两边一致 ⇒ 但 `grid.ts` 一改规则，**平衡闸门**（`npm run balance-sim` = Epic 1 的生死线）
  就会静默描述一个**没人玩的游戏**。同文件 `:151` 还有第二份塔型字面量 `TOWER_TYPE_CYCLE`。
  **修法**：改成 import core 的判据；或给「模拟器与 core 的合法塔位集合必须一致」加守卫。

- [ ] [Review][Patch] **aoe 塔的公开 `range` 字段是 2，实际覆盖是 3 格** [src/core/balance.ts:252]
  `TOWER_STATS.aoe = { damage: 60, range: 2 }`，而 `aoeColumns`（`combat.ts:88`）返回**以塔为中心的 3 格条带**。
  ⚠️ **这一条已被代码自己如实登记过**（`balance.ts:207-209` 与 `:243-245` 两处 JSDoc 逐字写着
  「范围塔的伤害覆盖另由 `aoeColumns()` 给出，恒为同行 3 格，**不由本字段驱动** —— 本字段对它只保留
  GDD 塔型表里的语义值（2 格）」）⇒ **不是「没人知道」，是「知道但两个数并存且没有断言把它们连起来」**。
  今天没有调用方读 aoe 的 `range`（`turn.ts` 先走 `aoeTargets`、`build.ts` 先走 `aoeColumns`）；
  但 `rangeOf` / `rangeFor` 是**公开 barrel 导出**（`core/index.ts:61-62`）⇒
  下一个 HUD 射程提示或平衡工具读到的数会与实际伤害覆盖矛盾。**严重度 LOW**：分歧已被文档承认，
  缺的是「谁都不许读错」的机器约束。

- [ ] [Review][Patch] **僵尸 id 的 tie-break 是字典序 ⇒ 第 10 回合起同列僵尸的打杀顺序与入场顺序相反** [src/core/combat.ts:155]
  `zombie.id < best.id` 是**字符串**比较，而 id 是 `z${turn}`（`reducer.ts:579`）⇒ `'z10' < 'z2'` 为真。
  ⇒ 从第 10 回合起，同列的一对僵尸里塔会挑**后入场**的那只。
  结果仍是确定性的（回放安全），但**哪只僵尸活下来会变** ⇒ 长局的平衡模拟数字会变。
  没有任何断言把 id 顺序与入场顺序绑在一起。

- [x] [Review][Patch] **存档降级重建时取的是「模块求值期」的单元号，不是存档所属的单元** [src/app/store.ts:444] —— **[已修 · G261 · M299]**
  catch 分支写 `state.value = buildStateFor(state.value.unitNumber)` —— 而抛错发生在
  `state.value = assertInvariants(...)`（`:411`）**之前** ⇒ 此刻 `state.value` 还是
  `store.ts:251` 的 `ref(initialState())`，**恒为单元 1**。
  ⇒ 重建出来的对局永远是**单元 1 的题单**，而 `progress.value`（`:371`）保留的是存档里的
  `currentUnitIndex`（可能指向单元 2）⇒ **跨局进度与战场单元号分家**。
  1.15 `[CR]` 第六轮裁决 1 把降级口径收紧为「对局退回从头开始、跨局进度保留」——
  但「从头开始」应该是**存档所属那个单元**的头，不是单元 1 的头。
  **修法**：降级重建用**存档里的** `unitNumber`（而不是当前 `state.value` 的）。

- [x] [Review][Patch] **僵尸列号上界的「唯一强制点」被读档路径绕过** [src/core/types.ts:130] —— **[已修 · G258 · M292]**
  `createZombie` 逐字写着「现在由工厂强制（**唯一强制点**）」并抛「僵尸列号不得超过入场列」。
  但读档**不走工厂**（直接过 `assertInvariants`），而 `assertZombieCol`（`types.ts:193`）**只查是不是整数**。
  ⇒ 一份 `col: 1000` 的僵尸存档能过全部不变量并被装进 `state.value`；
  僵尸列号只减不增 ⇒ 它永远走不进任何塔的窗口，却每回合继续刷出僵尸 ⇒ **这一局既不通关也不失败**。
  **修法**：`assertZombieCol` 补上界（或在读档路径上走工厂校验）。

---

### 二之二、UI 层的真机缺陷（5 条 —— **本轮最高价值产出**；4 条已修 · 1 条延后）

> 这一组的三条都**不能被 jsdom 测出来**（jsdom 不实现隐式指针捕获、不做布局、
> 不派发真实触摸序列）⇒ 现有 1,998 条守卫对它们**完全失明**。
> 三条都直接打在**目标机型（平板）**的正常游玩路径上。

- [x] [Review][Patch] 🔥 **`.is-locked` 的层叠把答题的绿底/红底吃掉 ⇒ AC-D2 的主反馈载体在正常路径上从未出现过** [src/components/quiz/OptionCard.vue:319] —— **[已修 · G253 · M300]**
  **这是本轮最值钱的一条。**
  **机制（三步，全部可核）**：
  ① `QuestionCard.vue:349` 把 `:locked="locked"` 绑到每个 `OptionCard`；`locked = !answering`（`:112`），
     而 `answering = phase.kind === 'awaiting-answer'`（`:91`）。
  ② `onPick`（`QuestionCard.vue:259-262`）里 `applyAction(answer(optionId))` **同步**把相位翻成
     `awaiting-build` ⇒ `answering` 当场变 false ⇒ `locked` 当场变 true。
     而 `pickedOptionId` 的 watch（`QuestionCard.vue:196-200`）逐字写着
     `if (phase.kind !== 'awaiting-answer') return` ⇒ **答题后它不被清**。
  ⇒ 被点的那张卡**同时**挂上 `is-picked` + `is-right`/`is-wrong` + `is-locked`。
  ③ **层叠**：`OptionCard.vue` 里这四条规则的特异度**完全相同**（`.option-card` + 一个类 = `(0,2,0)`，
     加 scoped 属性后同为 `(0,3,0)`）⇒ **源码顺序决定胜负** ⇒
     `.is-picked`(225) → `.is-right`(249) → `.is-wrong`(253) → **`.is-locked`(319)** ⇒
     **`.is-locked` 赢下 `background` 与 `border-color`** ⇒
     绿底 `var(--color-correct)` / 红底 `var(--color-wrong)` 被灰底 `#eceff1` 覆盖，
     深色选中描边 `#424242` 也被 `var(--color-overlay-blocked)` 覆盖。
  **后果**：**每一次答题**（正常路径，不是恢复路径）孩子看到的都是四张一模一样的灰卡，
  绿/红**一次都没画出来过**。答对答错的唯一线索只剩卡面下方那条 `AnswerFeedback` 文字。
  **证据链（三处互相印证）**：
  - **AC-D2 原文**（1.11 文档 `:344-360`）逐字要求「用 `--color-correct` / `--color-wrong`」呈现反馈，
    且明令 class **叠加**而非互斥 ⇒ 被吃掉的正是 AC-D2 指定的主反馈载体。
  - **文件自己的注释**（`OptionCard.vue:312-314`）逐字写着「孩子刚答完那 ≤100ms 里，
    `.is-right` / `.is-wrong` 的绿底/红底才是 AC-D2 的主反馈载体，**置灰不该把它洗掉**」
    —— 注释说的和代码做的**相反**。
  - **1.19 的 CR 裁决记录**（`1-19` 文档 `:1474`）逐字写着「`.is-locked` 的源码位置排在 `.is-picked`
    **之前**，免得洗掉 AC-D2 的主反馈」—— 而**文件现状是排在之后**（319 > 225）。
    第六轮为了修 `.is-degraded` 那一侧把 `.is-locked` 整条挪到了文件末尾，**顺带挪过了 `.is-right` / `.is-wrong`**。
  **守卫盲区**：G177（`tests/components/quiz-card.test.ts:2099`）**只**解 `opacity`，
  且**只**针对 `is-degraded` + `is-locked` 这一对 ⇒ **`background` 这一列、`right`/`wrong` 这一对完全无守卫**。
  **修法**：把 `.is-locked` 挪回 `.is-picked` 之前，或给它加 `:not(.is-right):not(.is-wrong)`
  —— 但**必须同时**补一条「`is-right`/`is-wrong` 与 `is-locked` 同挂时 `background` 归谁」的层叠守卫
  （照 G177 现有的 `winningOpacity` 写法扩一个 `winningBackground`）。

- [x] [Review][Patch] **触摸端的隐式指针捕获让 AC-D1 / AC-E1 整条失效** [src/components/battle/BattleField.vue:278] —— **[已修 · G255 · M306]**
  `onCellPointerUp(cell)` 靠「`pointerup` 落在哪一格」与 `candidate` 里记着的按下格比对，
  只有同一格才种（AC-D1）；落在别处只移预览不种（AC-E1）。
  ⚠️ **Pointer Events 规范对触摸指针规定「隐式指针捕获」**（`pointerdown` 的目标自动成为捕获目标），
  Chromium / Safari / WebKit 都实现 ⇒ 触摸时 `pointerup` **永远回到按下的那一格**
  ⇒ `sameCell` **恒为 true** ⇒ **「落在别处 ⇒ 只移预览、不种」在目标机型上整条不可达**。
  连带：`OptionCard` 无 `pointermove`（守卫 G39 明令「无拖拽 / 无 `pointermove`」，
  `hand-build.test.ts:1428` 钉着）⇒ 手指滑到别的格时**预览也不跟随**，停在按下的那一格。
  ⇒ 孩子从 A 滑到 B 松手 ⇒ **塔种在 A**，且**没有任何拒绝反馈**。
  而 `onCellPointerUp` 的注释（`:270-279`）与 `onCellPointerCancel` 的注释（`:298-305`）
  都在逐字描述「手指从一个格滑到另一个格再松开」这个**被设计出来的场景**及其既定行为
  ⇒ 代码与设计意图在目标机型上分家。
  **为什么测试抓不到**：jsdom 不实现隐式捕获，它把合成事件派发到测试点名的那个元素上。
  **修法**：在 `pointerdown` 时显式 `releasePointerCapture(pointerId)`（规范允许解除隐式捕获）
  或改用 `pointermove` 跟踪（需先与 G39 的裁决对账）。

- [x] [Review][Patch] **`.battle-cell` 没有 `touch-action` ⇒ 轻滑即 `pointercancel`，点按静默无反应** [src/components/battle/BattleField.vue:515] —— **[已修 · G255 · M305]**
  全仓的触摸基线只给了 `button, .touch-target`（`src/styles/base.css:42-47` 的 `touch-action: manipulation`），
  而 45 个战场格是**裸 `<div>`** ⇒ **整个游戏里唯一的主触摸目标没有 `touch-action`**。
  页面可滚（竖屏 `.level-view` 有 `overflow-y: auto`；横屏矮视口也溢出）⇒
  浏览器把手势判成滚动起点 ⇒ 派发 **`pointercancel` 而不是 `pointerup`**
  ⇒ `onCellPointerCancel`（`:312`）清掉 `candidate` 与 `refusedKey`
  ⇒ **点按什么都没发生**：预览的绿光消失、没种塔、没有拒绝提示。
  对 4–8 岁孩子（手指精度有限）这读起来就是「游戏坏了」—— 与 1.19 CR 那条「假可点」同类。
  ⚠️ 讽刺的是 `onCellPointerCancel` 的注释**逐字把「浏览器判定为滚动」列为 pointercancel 的成因之一**，
  说明**成因已知，但没在触发源上设防**。
  **守卫盲区**：`tests/` 与 `scripts/` 都没有任何一条检查 `touch-action` 的守卫。
  **修法**：`.battle-cell { touch-action: none; }`（或 `manipulation` + 阻止滚动），
  并补一条「战场格必须声明 `touch-action`」的源码守卫。

- [x] [Review][Patch] **`pointerup` 落在网格之外 ⇒ 候选格与射程绿光永久残留** [src/components/battle/BattleField.vue:363] —— **[已修 · G255 · M307]**
  `.battle-grid` 上只有 `@click.self="onGridBlank"`（`:363`），**没有** `pointerup` / `pointercancel` /
  `pointerleave` 监听器；而 `candidate` 只被 `onCellPointerCancel`（`:312`）与
  `selectedEntryId` 的 watch（`:356`）清。
  ⇒ 孩子按住格子、把手指抬到 HUD / 题面卡 / 手牌区再松手 ⇒ 事件一个都不到达格子处理器
  ⇒ `candidate` 留在原地 ⇒ **射程覆盖层一直亮着**（一片「这里能放」的绿光），
  而什么也没种、卡也还选着 ⇒ 孩子面对一块「看起来已经武装好了」的盘 + 一个不响应的点击。
  **为什么没被发现**：触摸路径被隐式捕获掩盖了（`pointerup` 照样回到格子），
  **鼠标路径才暴露** ⇒ 两条输入路径对同一个手势行为不同。
  **修法**：在 `.battle-grid` 上补 `pointerup` / `pointerleave` 收束 `candidate`。

- [ ] [Review][Patch] **横屏矮视口下战场会压到手牌行（**需真浏览器复核**，不作为已确认缺陷）** [src/styles/responsive.css:132]
  宽屏分支给 `.level-view` `grid-template-rows: auto auto minmax(0,1fr) auto`（`:132`），
  战场在 `field` 行且 `align-self: start; height: auto`（`:191-193`）⇒ 战场高度纯由宽度经
  `aspect-ratio: 9/5` 推出。按 1280×600 估算：左栏宽 ≈ 848 ⇒ 战场盒 ≈ 519px，
  而 `field` 行只剩 ≈ 425px ⇒ **约 94px 的战场溢出到手牌行上**。
  ⚠️ **本条的算术我只能推到「可疑」**（没有真浏览器）⇒ 标为**待真机复核**，不是已确认缺陷。
  仓库自己承认这个盲区：`scripts/verify-portrait-layout.ts:225` 逐字写着
  「**只量 800×1280 这一个视口**；**证明不了小屏与横屏**」，且 `:263` 写「证明不了浮层内容在横屏刘海下会不会被裁（**那要真机**）」。

---

### 二之三、app / services 层的四条（1 条 MEDIUM + 3 条 LOW —— **全部已登记延后**）

- [ ] [Review][Patch] **进关时只预取图片，**mp3 录音一个都不进缓存** ⇒ 飞行模式下第一次听到某个词必然走设备 TTS** [src/services/asset-prefetch.ts:83]
  `imageUrlsOfUnit()` 只产出三类 URL：`wordImageUrl(option.imageSrc)`、`expectedTowerAssetUrl(entry.towerType)`、
  `ZOMBIE_ASSET_URL` ⇒ **全仓没有任何一处预取 mp3**（`services/audio.ts` 与 `services/pronunciation.ts` 都是「用到才 fetch/播放」）。
  ⇒ 单元 1 的 30 条词条录音在进关时**一个都不进 CacheStorage**；飞行模式下孩子第一次听到某个词时
  录音必然未缓存 ⇒ 只能回落设备 TTS —— 而目标平板的 TTS 可用性正是 1.11 移交里明写「要压它，得拿一张没有录音的卡」的那条未压测路径。
  ⚠️ **这不是代码违约，是文档单方面加宽**：1.18 的 AC-E2 逐字只要求「预取**本单元全部图片**」，
  代码**一字不差地照做**；加宽的是同一 story 的 AC 正文「（**当前单元资源已在缓存中**）」
  与 `docs/deployment.md`（「媒体（45 个 mp3 + 34 张 svg）…… 由 `asset-prefetch.ts` 在进关时预热」）。
  ⇒ **修法在文档侧**：把 AC 与 deployment 的口径改成「本单元**图片**已在缓存中」，
  或把 mp3 纳入预取（后者是行为变更，要走 R-20 与真机缓存预算）。
  **另**：`asset-prefetch.ts:154` 的 WARN 逐字承诺「正确项缺图的题会走 SKIP_QUESTION 过滤」
  —— 而该承诺在**最后一题**上不成立（见第一节 D1）⇒ 这条 WARN 要么改成条件式，要么 D1 落地。

- [ ] [Review][Patch] **1.14 AC 点名的「可查询降级标志」在组件层不可达** [src/services/audio.ts:225]
  该标志即 `isAudioSilent()`，但它**只被测试引用**（`src/` 侧只有定义处，全是 `tests/services/audio.test.ts`）。
  组件层拿不到它：`eslint.config.js:206-208` 把 `**/../services/audio` 整条列为 `src/components/**` +
  `src/views/**` 的禁列；而 `src/app/store.ts:104-117` 的转出清单里只有 `audioDegradations` /
  `audioDegradationsVersion` / `onAudioDegradationsChanged`，**没有 `isAudioSilent`**
  ⇒ `src/components/debug/DebugPanel.vue` 只能渲染 `audioDegradations()` 列表。
  **功能上等价**（AC-D8 说 `isAudioSilent()` 只表示「整台设备无音频」，面板的列表形态已覆盖），
  但 1.14 与 1.17 两份 AC 在这一点上各说各话、代码单方面选了列表形态 ⇒ 属** AC 措辞** 问题（LOW）。

- [ ] [Review][Patch] **架构的日志前缀清单只有 4 个，代码实际用了 8 个** [_bmad-output/planning-artifacts/game-architecture.md]
  架构 Logging 段逐字写「每条日志带模块前缀：`[core]` `[tts]` `[save]` `[content]`」；
  实测 `src/` 里的前缀分布是 `[tts]` 19 · `[save]` 14 · `[content]` 13 · `[audio]` 11 · `[sw]` 8 ·
  `[core]` 4 · `[prefetch]` 4 · `[pronunciation]` 2 ⇒ **多出 `[audio]` / `[sw]` / `[prefetch]` / `[pronunciation]` 四个**。
  ⚠️ `[audio]` 一项是 1.14 的 AC 逐字要的（「记 `WARN` 日志（前缀 `[tts]`/`[audio]`）」）⇒
  **冲突在两份 spec 之间**（架构清单不完整），代码单方面采用了 story AC 的口径；
  另三个前缀则**两边都没写**。⇒ 修架构文档的清单（它是单事实源）。

- [ ] [Review][Patch] **「测试专用导出」模式在第二个模块复制，而账本只登记了第一个** [src/services/asset-degradations.ts:126]
  `deferred-work.md`「code review of story-1-15（第二轮）」第 3 条只登记了 `src/services/save.ts`
  带一个测试专用导出、而全仓无「生产代码不许 import `*ForTest`」守卫；
  而同一模式在 `asset-degradations.ts:126` 又出现一份 `clearAssetDegradationsForTest()`
  （其注释同样写着「生产代码不许调它」）⇒ 那条 defer 的**恢复条件（补守卫）同样适用于它**，
  但登记时只点了 save.ts。实测全仓仍无此守卫。

---

### 三、规格与代码的口径复制链（12 条 —— 改文档，不改代码；**全部已登记延后**）

> 这一组的共同形态：**代码是对的，文档是旧的**。按 R-37（判据单一来源），
> 正确修法是**在源头更正**并把副本链一起断掉，而不是在下游加批注。

- [ ] [Review][Patch] **`src/core/deck-slice.ts:81` 的「穷举实测」数字在数学上是错的** [src/core/deck-slice.ts:81-82]
  注释逐字写「长度 10 的全部 59049 条三型序列：可解的 **59047** 条全部零相邻同型，无解的 **2** 条走降级」。
  实算：可解 ⇔ `maxCount ≤ ceil(10/2) = 5` ⇒ 某型出现 ≥ 6 次即无解
  ⇒ 无解 = 3 × Σ_{k≥6} C(10,k)·2^(10−k) = 3 × 4521 = **13563**，可解 = **45486**。
  ⇒ 这条注释**同时被同一次修复的两个来源证伪**：
  ① 同 story 的测试 `tests/core/deck-slice.test.ts:549-553` 断言的是**正确**数字（88572 / 70191 / 18381 / n10:13563）；
  ② Story 1.20 的文档逐字声称「已一并更正（附穷举实测：n=10 的 59049 条里 **13563 条无解**）」。
  而 `git show 7e9ad48`（1.20 的 `[CR]` 修复 commit 本身）显示这行**正是那次 commit 新加的**（`+`）——
  典型的**半落地更正**：判据段改了，数字段没改。

- [ ] [Review][Patch] **`src/core/combat.ts:79` 的形状对照表仍写「放置预览 = 半径 3 的圆」** [src/core/combat.ts:79]
  同一张表下一行就是「本函数绝不返回圆形覆盖」，而 `build.ts`（裁决 1）判定的是
  「预览 = **实际伤害形状**」，`BattleField.vue:29` 照此实现。
  ⇒ **同层两个文件对同一功能写着相反的形状**，且这张表**没有任何作废标注**。
  下一个碰射程渲染的人读 combat.ts 会拿到错的口径。

- [ ] [Review][Patch] **`src/core/turn.ts:81` 的注释仍写「塔可以种在任意空格（GDD）」** [src/core/turn.ts:81]
  而 `grid.ts:220` 自 `[CR]` 2026-10-16 裁决 6 起禁止非僵尸行建造。
  ⇒ `turn.ts:82` 的行过滤对**任何 reducer 产出的状态都是恒真的**（塔只可能在僵尸行），
  注释却说相反。`combat.ts:21` 同样。

- [ ] [Review][Patch] **`src/core/grid.ts:138` 与 `scripts/balance-sim.ts` 引用了已删除的 `balance-scan.py` 作为现行判据的依据** [src/core/grid.ts:138 · scripts/balance-sim.ts:63、:77、:330]
  `scripts/` 下**已无** `balance-scan.py`（已被 `balance-sim.ts` 取代，而 `game-architecture.md` 逐字说它「已删除」）。
  ⇒ 房子列号判据（0 基）的**现行依据**指向一个不存在的文件。
  （`BattleField.vue:51/123`、`turn.ts:153` 引用它是**历史典故**——「Story 1.7 踩过它吞僵尸的 bug」——那类引用合理，不在本次范围。）

- [ ] [Review][Patch] **`epics.md` AR39 与 `game-architecture.md` 的「每回合记录一条」已被 1.17 裁决改成「逐 action 一条」，两份文档都没跟上** [epics.md / game-architecture.md]
  实现的逐 action 产出**是对的** —— Story 1.17 的 AC-C3 逐字裁决「`runEffects` 为**该回合的每一个 action** 产出一条 `TRACE`」，
  且 Q-13 明确把「把『每回合一条』实现成每回合只有一条」判为驳回。
  但 `deferred-work.md` 对「每回合记录一条 / TRACE」**零命中** ⇒ 这条改判**只活在已归档的 1.17 文档里**，没有任何登记条目。

- [ ] [Review][Patch] **`epics.md` Story 1.15 的「每个回合结束写一次……又不至于每次点击都写」与写盘点表相反** [epics.md · src/core/effects.ts:308-324]
  写盘点表把 `awaiting-build` 判 ✅（1.15 裁决 6 的依据逐字是「AC 逐字要求『包括当前处于 awaiting-build 的局面』」）
  ⇒ **每放一座塔就写一次盘**（`PLACE_TOWER` 后相位仍是 `awaiting-build`）。
  实现是按裁决做的，但**那份 AC 的散文仍在 epics.md 里**，两者互相矛盾且无对账条目。

- [ ] [Review][Patch] **`core/types.ts` 的数据形状与 `game-architecture.md` 的模式 A / 模式 C 不符** [src/core/types.ts:336-348、:45-52 · src/core/reducer.ts:386-388]
  `Phase.awaiting-build` 多一个 `question` 字段（架构形状里没有）；`Tower` 多 `row` / `col` 两个字段；
  `END_BUILD` 只切到空相位 `resolving`，而架构把 `resolving` 注释为「攻击 + 推进，一次性算完」。
  三处偏离**只在代码注释里登记**，`game-architecture.md` 的模式 A / C 仍是旧形状。

- [ ] [Review][Patch] **`SKIP_QUESTION` 是 core 的一整条新机制，`epics.md` 里没有任何一条 AC 授权它** [src/core/types.ts:459-464、:387 · src/core/reducer.ts:311-376]
  它由 1.18 的裁决 11 引入，只登记在 1.18 的 story 文档里。
  按 R-32（「以 `epics.md` 的 AC 正文为准」），需求清单里**没有这一条**。

- [ ] [Review][Patch] **`epics.md` Story 1.4 的「档位 5-10 与 11-20 留空待 Epic 2」已过期** [epics.md · src/core/balance.ts:71-90]
  `BALANCE_TIERS` 三档已全填（Story 2.3 落地），且**数值与 FR63 逐字一致** —— 只是 AC 文本没跟上。

- [ ] [Review][Patch] **`docs/rules/process.md` 的 R-37 漂移表把 `--color-*` 个数写成 15，真实是 18** [docs/rules/process.md 的 R-37 漂移表]
  `grep -c "^\s*--color-" src/styles/tokens.css` ⇒ **18**。两处都写 15。
  该条目在 `deferred-work.md` 里被登记过，**恢复条件（「下次触碰 `docs/rules/process.md`」）已于 2026-10-21 触发**（该文件当天为加 R-42 被改过）。

- [ ] [Review][Patch] **架构文档的模块表漏了至少 16 个已交付模块** [_bmad-output/planning-artifacts/game-architecture.md 的模块表]
  逐模块实测命中数：`core/deck-slice.ts` **0** · `core/session-replay.ts` **0** · `core/actions.ts` **0** ·
  `core/build.ts` **0** · `core/types.ts` **0** · `app/session-recorder.ts` **0** · `app/dev-adjust.ts` **0** ·
  `app/audio-unlock.ts` **0** · `services/asset-url.ts` **0** ·
  以及 1.18 的 7 个模块（`asset-prefetch` / `sw-registration` / `pronunciation-status` / `PronunciationOverlay` / `UpdateNotice` / `sw-rules`）**全 0**。
  `core/hud.ts` 有 2 处命中，但**都是旁注**，**不在模块表里**。
  账本只登记了 `core/hud.ts` 与 1.18 的 7 个 ⇒ **另外这 8 个从未被登记**。
  后果按 R-32（架构文档原文优先）：现在是**代码多了一堆模块、架构文档少了同一堆模块**。

- [ ] [Review][Patch] **`deferred-work.md` 的行号指针有 6/50 指不到被声称的内容** [_bmad-output/implementation-artifacts/deferred-work.md]
  R-31 明令「引用文档用原文句子，**不用行号**」；这条账本偏偏全用行号。逐个对账：
  | 指针（账本原文） | 账本声称是 | 实际落在 |
  |---|---|---|
  | `epics.md:1014` | 「种在上下相邻行的塔也能打到中间行」 | **空行**；那句话是 **FR47 的正文**，本轮 D2 已把它改写成「射程沿僵尸行展开 —— 直射 / 减速塔是**单向窗口**，范围塔是**横向 3 格条带**」 |
  | `epics.md:741` | 「已后置到 Story 1.5」 | 落在「**Then** 打印失败的词条 id 与错误码，退出码非 0」上；而且「已后置到 Story 1.5」这句话**在 `epics.md` 里已经不存在了**（grep 零命中） |
  | `epics.md:1134` | 「范围塔须同时画两套形状」 | **空行**；真身是 **FR33** 的正文「同一张已解锁的塔卡可反复建多株」与 **AR43**（本轮 D3 已改写） |
  | `gdd.md:238` / `gdd.md:296` | GDD 旧口径 | **空行**；而且**路径本身就不对** —— GDD 实际在 `planning-artifacts/gdds/gdd-plants-game-2026-10-11/gdd.md`，账本里写的 `gdd.md` 不是可解析的路径 |
  | `store.ts:107` | 变更信号门面 | **空行**；真身是 `src/app/store.ts` 里那行「三个 registry 的**变更信号门面** —— 同一理由的同一处出口」 |
  ⇒ **这直接解释了 FR46/FR47 为什么成为孤儿**：账本里唯一「负责」它的那条
     （「**消歧**『种在上下相邻行的塔也能打到中间行』」那一行）指着一个空行，
     读的人以为已经消解了。
  **修法**：把这批行号引用改成**原文句子**（R-31 早就这么要求）。

  ⚠️ **这张表本身就是 R-31 的现场证据**：本轮 D2 / D3 改了 `epics.md` 之后，
  上表里 `:741` / `:1134` 的落点**又漂了一次**（检视当时记的是「空行」，
  现在 `:741` 落在了「打印失败的词条 id 与错误码，退出码非 0」上）。
  ⇒ **连「行号 + 空行」这种写法，都会在同一次编辑内失效** ⇒ 只有**原文句子**才稳。


---

### 四、状态账本（R-30 / R-40，4 条 —— **全部已登记延后**）

- [ ] [Review][Patch] **5 处 story 文档头与 `sprint-status.yaml` 不一致**（全是「文档头 `review`、sprint `done`」）
  | Story | 文档头 `Status:` | `sprint-status.yaml` | 文档所在 |
  |---|---|---|---|
  | 1-5 | `review` | `done` | 已归档 |
  | 1-9 | `review` | `done` | 已归档 |
  | 1-11 | `review` | `done` | **仍在活跃目录** |
  | 1-12 | `review` | `done` | **仍在活跃目录** |
  | 1-20 | `review` | `done` | 已归档 |
  （1-2 / 1-18 / 1-19 三处**一致**，不算漂移。）
  ⚠️ R-30 的规则正文把 `Status:` 头当成被裁决的一方，但**没有任何守卫比对两者** ——
  `scripts/check-execution-drift.py` 全文**不含 `Status` 一词**，全仓也没有任何断言读 story 文档的 `Status:`。

- [ ] [Review][Patch] **3 份 `done` 的 story 文档还躺在 `implementation-artifacts/`** —— 违反 R-40
  R-40 原文：「story 状态为 `done` 时，它的文档移入 `_bmad-output/archive/`」。
  实测：归档目录里已有 18 份 story 文档；仍留在活跃目录的 `done` 文档是
  **1-11《三种卡型与答题交互》、1-12《建造、阳光与射程可视化》、2-1《词图产能验证》**。
  ⚠️ 2-1 的 `Status:` 头**就是 `done`**（不是 `review`）⇒ 它是**纯 R-40 违规**，与上一条的状态漂移无关。
  **后果**：① 活跃目录里的 `done` 文档会被下一个 session 默认读到当成「现行事实」——
  1-11 / 1-12 里的口径（38 + 29 处行号引用、旧编号归属）正是 R-31 漂移的来源地；
  ② 「`done` 就没有未勾选 Task」这类检查会因文档位置不同而覆盖不到。

- [ ] [Review][Patch] **R-40 的现有守卫只查「引用方向」，不查「归档方向」** [tests/scaffold/docs-rules.test.ts]
  索引把 R-40 标 ✅，但那条守卫（R-40 段的 AC-4 用例）断言的是
  「**活跃文档不引用**归档目录下的具体文件」—— 它守的是**引用**方向；
  规则真正要守的**归档**方向（「`done` ⇒ 文档进归档目录」）**零守卫**，
  而它**此刻已经违反**（上一条）。

- [ ] [Review][Patch] **`scripts/check-execution-drift.py` 是个假绿：接进 `package.json` 也抓不到上面那些** [scripts/check-execution-drift.py]
  实跑输出 **「✅ 无漂移」**。三条独立原因：
  ① **不接进 `package.json`**（`scripts` 段里没有任何指向它的条目）⇒ 只在我手动跑时才跑；
  ② **正则写死 Epic 1**：`aliases = re.findall(r"Story\s*1[-.]\d+", log)` ⇒
     `Story 2.x` 的 commit 一条都进不了检查 A（而仓库当前正处在 Epic 2，`2-4` 是 `ready-for-dev`）；
  ③ **只 glob `implementation-artifacts/*.md`**（`story_files` 的定义）⇒ **归档目录根本不扫**；
  另外它**从不读 story 文档的 `Status:` 头** ⇒ 上面 5 处漂移它**一条都抓不到**。
  R-30 的「守卫」字段至今标 ❌「检查脚本未接入」，但**接上也不够** —— 覆盖面比它声称守的规则窄得多。

---

### 五、规则守卫盲区（**6 条待办 + 6 行「现状合规但无守卫」清单** —— 全部已登记延后）

> 这一组的价值在于**实测证据形态**：不是「读源码觉得没守卫」，而是
> **真的把代码改坏 → 跑全量测试 → 数出红数**。R-50 的纪律是「确认用例变红」，
> 而**确认「它不变红」是证明守卫缺失的唯一硬证据**。

#### 5.1 HIGH —— 五条有变异实测支撑的盲区

- [ ] [Review][Patch] **R-12「既有 `--color-*` 的**值**不得改」：改掉一个既有 token 的值，全仓 2205 条测试照样全绿** [src/styles/tokens.css:43]
  **变异实测**：把 `--color-tower-aoe: #7a3200` 改成 `#7a3300`，**并且**把塔图 SVG 注释里的字面副本与
  `<g fill="#7a3200">` **同步**改成 `#7a3300` ⇒ 清过 vite 缓存后全量 **2205/2205 全绿，0 红**。
  **为什么必然如此**：`tests/assets/asset-geometry.test.ts` 的 G3 断言的是「SVG 里的 hex **等于** `tokens.css` 当期字面值」
  ⇒ 那条守卫恰恰要求你**把两边一起改**，改完就回到全绿；`tests/content/palette.test.ts` 只断言 token **存在** + WCAG 实算，
  而 `#7a3200 → #7a3300` 的对比度与色相间隔都在阈值内。
  ⚠️ 「只改 `tokens.css` 不改 SVG 会让 G3 红」这件事**会给人「有守卫」的错觉** —— 那条守卫守的是**一致性**，不是**冻结**。
  **后果**：塔图/词图是按当时的字面着色交付的（SVG 注释里逐字写着「色板：#7a3200 = tokens.css 的 color-tower-aoe（字面副本）」）
  ⇒ 改值而不自知 ⇒ **一整套已交付资产与 UI 脱节，而没有任何测试会响**。R-12 是这条链上唯一的一道闸。

- [ ] [Review][Patch] **R-22「平衡模拟器不得另起一份数值」：把 import 换成副本，2205 条全绿** [scripts/balance-sim.ts:36]
  **变异实测**：把 `balance-sim.ts` 的 import 块里 `ZOMBIE_HP` 删掉、在文件里加 `const ZOMBIE_HP = 100`
  ⇒ 全量 **2205/2205 全绿，0 红**（清过 vite 缓存）。
  守卫侧的形状确认：`tests/core/balance.test.ts` 的 G229 只判「档位**字段**（`initialSun` / `sunPerCorrect` / `towerCost`）的副本」；
  `tests/scripts/balance-sim.test.ts` 的 G236 只判「把数字字面量当**单元号**」
  ⇒ **普通的数值常量（`ZOMBIE_HP` / `HEARTS` / `SLOW_FACTOR`…）两份都抓不住**。
  ⚠️ **我核过并更正了一条子代理的说法**：它称「core 的 `ZOMBIE_HP` 改成 120 时报告仍印 100」——
  **不成立**：`balance-sim.ts:36` **确实 import 了** `ZOMBIE_HP`，`:334` 打印的就是那个 import，
  改 core 会跟着变。它的变异 B 是**没复原变异 A 的残留**（A 已经把 import 换成了本地副本）。
  ⇒ **本条成立的只是「没有守卫阻止副本出现」**，不是「今天已经有陈旧副本」。
  **修法**：补一条「`scripts/` 不得重新声明 `core/` 已导出的数值常量」的守卫。

- [ ] [Review][Patch] **R-04 的 TTS 那半：G25 只扫 `quiz/` 三个文件，组件在别处直接 import `services/pronunciation` ⇒ 实测 0 红** [tests/components/quiz-card.test.ts:119]
  **变异实测**：在 `src/components/hud/HeartRow.vue` 加
  `import { playPronunciation } from '../../services/pronunciation'` + 一个调用函数
  ⇒ 全量 **2205 条里新增 0 红**（唯一那 1 红是本文件触发的 R-40 引用检查，与本变异无关，已逐条排除）。
  `npx eslint src/components/hud/HeartRow.vue` ⇒ **不报 import**：`eslint.config.js` 对
  `src/components/**` + `src/views/**` 的 `no-restricted-imports` **只禁 `services/audio`**，`services/pronunciation` 不在禁列。
  **根因**：G25 的判据本体是对的，但它的**扫描范围是一份写死的 3 文件名单** ——
  `hud/` `hand/` `battle/` `debug/` 下的 12 个组件、`src/views/` 下的 2 个视图、`src/app/` 全部**不在范围内**。
  这正是 R-56 记载的「名单型判据的病根是『名单不会跟着 story 一起长大』」。
  ⚠️ 索引以为 TTS 那半「只是没归属 story」——**实际上它连现有的那条窄守卫都只覆盖 3 个文件**。

- [ ] [Review][Patch] **R-04 今天就在被违反：TTS 由组件里的 `watch` 触发，而 `effects-runner` 的 `case 'TTS'` 是空 `return`** [src/app/effects-runner.ts:144]
  `core/effects.ts` 定义了 `TTS` effect 成员、`app/effects-runner.ts` 也为它留了分支，
  但那个分支**逐字是空 `return`**（注释自己写着「本分支仍然是空 `return`」）⇒ TTS 永远不经 effects-runner 执行。
  真实执行路径是「组件 `watch` → `store.speakQuestion()` → `services/pronunciation.playPronunciation()`」：
  `QuestionCard.vue:230-237` 的 `watch(() => state.value.phase, …)` 里调 `speakQuestion()`，
  而 `store.ts:1082` 直接调 `playPronunciation(...)`（`:60` 是那行 import）。
  **守卫侧**：`tests/scaffold/effects-boundary.test.ts` 的 `PLAYBACK_NAMES = ['playSfx', 'startBgmIfReady', 'prewarmBgm']`
  ⇒ **不含 TTS**。
  **后果**：「副作用只有一个出口」这条架构决策在 TTS 侧**从未成立**，
  而规则正文与索引都把它写成「部分覆盖 / 无归属」—— 它不是「暂时没人做」，是**做成了另一个形状**。
  ⇒ 任何按 R-04 推理后续设计的人（例如「TTS 收进 `runEffects`」）都会基于一个不成立的前提。

- [ ] [Review][Patch] **R-31：活的项目文档里就有 4 处**已经失效**的行号引用** [docs/word-image-throughput.md 的「口径 B」那两行]
  - `docs/word-image-throughput.md` 逐字写「口径 B 的『20 分钟』出处是 `epics.md:1508-1512`」与「`epics.md:1500-1547`」
    ⇒ **实测那两行现在是「### Story 1.20: 相邻不同型 —— 把『植物不重复』从巧合变成代码保证」**；
    「20 分钟/张」的实际句子是 **`epics.md` 的 AR44**：「全年 200-400 词需 200-400 张各不相同的插画。若平均 20 分钟/张 = 66-133 小时纯绘图，不含返工。」
    以及 Epic 摘要里的那一句「全年 200-400 词需 200-400 张各不相同的插画，按 20 分钟/张即 66-133 小时纯绘图。」。
  - `docs/art-direction.md` 逐字写「架构 `game-architecture.md:370-377` 锁了前三项」⇒
    **实测那一段今天是「### 6. 词图加载策略」**；它要指的**词图规格**表，标题逐字是
    「**词图规格（架构层锁定，避免阻塞 Epic 2 的内容流水线）：**」，位置在「### 6. 词图加载策略」**下面**。
  **规模**：按 `(gdd|epics|architecture|game-architecture|art-direction)\.(md|ts|vue):[0-9]+` 扫描
  `docs/` + 活跃的实现产物 ⇒ **104 处**行号引用，其中活的项目知识库（`docs/`）4 处。
  **后果**：`docs/word-image-throughput.md` 是「人画 vs agent 画」产能口径的权威文档，
  而它的口径 B 出处指向 Story 1.20 ⇒ 按行号核对会得到「这里没有 20 分钟」的结论，从而**丢掉这条口径**。
  R-31 的依据说 1.4 留下的那处引用「已经白白流传了 8 个 story」——**现在同一形态又长出来了**。

#### 5.2 LOW —— 六条「现状合规、但没有守卫」的规则

> 这六条的共同点：**今天不违反，靠人守**。它们不是 bug，是「下一次改动不会被拦」的清单。

| 规则 | 缺口 | 实测现状 |
|---|---|---|
| **R-14** | `services/` + `app/` 那半零守卫（现有那条只扫 `src/core/**`） | 带前缀日志已分布在 6 个模块（`pronunciation.ts` 17 · `store.ts` 9 · `sw-registration.ts` 7 · `asset-prefetch.ts` 4 · `save.ts` 4 · `audio.ts` 9），**全都合规**；账本写明的恢复条件（「累计到**第三个**带前缀日志的服务时做成通用守卫」）**今天有六个** |
| **R-08** | 「次序与跨层反向」那半没守卫（`app` 不得 import `components/views`、`services` 不得 import `app`） | 逐文件核过 `src/`：**今天零反向依赖** ⇒ 潜在风险 |
| **R-09** | `core/` 只走 barrel 唯一出口，在 `src/` 侧纯靠约定 | `src/` 与 `scripts/` 的深路径 import 数 = **0** ⇒ 潜在风险 |
| **R-05** | 「动效只走 CSS」没有全局守卫，只有两条组件级判据（`HeartRow.vue` / `RangeOverlay.vue`） | `src/components/**` 里**零定时器**；唯一的 `setTimeout` 在 `pronunciation.ts`（TTS 分块，不是动画）⇒ 现状合规 |
| **R-74** | 「48px 是必看档位」无数值断言（规则正文自己承认） | `word-image-metrics` 的测试只测几何与剪影，**没有一条把图元折算到 48px 档** ⇒ 达标与否无法从测试判断 |
| **R-13 / R-72 / R-23** | 中文标识符 / SVG 正则锚定 / 僵尸容器位置键，三条都无守卫 | 逐条扫过：中文标识符 **0**、中文 CSS 类名 **0**、用 `\b` 锚 SVG 属性的正则 **0**、模拟器的僵尸是 **list + 稳定 id**（不是位置键）⇒ 全部现状合规 |

#### 5.3 编号纪律（根因）

- [ ] [Review][Patch] **`docs/rules/testing.md` 里没有「守卫编号全仓库唯一」这条纪律** [docs/rules/testing.md]
  `grep -c "编号" docs/rules/testing.md` ⇒ **0**（这个文件里连「编号」两个字都没有）。
  后果已经发生：① `G30` 被 1.11 的 `quiz-card.test.ts` 与 1.12 的 `hand-build.test.ts` 同时占用
  （后者逐字写着「与 1.11 的 G30 同一个洞」——**旧账双方都知道**）；
  ② `G175` 被 1.19 与 1.20 同日撞号，闹到用户裁决一轮（已改 `G179`）。
  根因是每批守卫**只 grep 本 story**。该条目在 `deferred-work.md` 已登记，恢复条件是「下次要起新号」——
  **此后已发出数十个新号**，条件触发而规则未补。
  ⚠️ **另有一条同族的扫描面不一致**：G236 的扫描用非递归的 `readdirSync(join(root, 'scripts'))`，
  而**同一条规则下的 G229 用的是递归实现** ⇒ 将来 `scripts/` 下建个子目录，那份脚本就整体脱离 G236 的视野。

---

## 核验留痕（本次检视的方法纪律）

**驳回 4 条**（子代理报了、主评审回代码核验后不成立）：

| 被驳回的发现 | 驳回理由 |
|---|---|
| 「跳过的题会显示『再想想』」 | `applySkip` 实际返回 `phase: { kind: 'awaiting-answer', question: next }` ⇒ 相位是 `awaiting-answer` ⇒ `locked` 为 false、`pickedOptionId` 为 null ⇒ **反馈条根本不渲染**。子代理读的是 `locked` 的语义，没读 `applySkip` 的返回 |
| 「`level-driver.ts` 不存在」 | **存在**：`tests/fixtures/level-driver.ts`（9,785 字节）。子代理用 `git log --diff-filter=D` 断言「从未是文件」，但它是被**新建到 tests/fixtures/** 的 |
| 「塔型取值是 direct / sniper / area」 | 真实是 `'direct' \| 'slow' \| 'aoe'`（`core/types.ts:32`）。不影响该条发现成立，但取值写错 |
| 「core 的 `ZOMBIE_HP` 改成 120 时，`balance-sim` 的报告仍印『僵尸 100 血』」 | **不成立**：`scripts/balance-sim.ts:36` **确实 import 了** `ZOMBIE_HP`，`:334` 打印的就是那个 import ⇒ 改 core 会跟着变。该代理的变异 B 是**没复原变异 A 的残留**（A 已把 import 换成了本地副本）。⇒ 守卫缺口（无守卫阻止副本出现）成立，**「今天已有陈旧副本」不成立** |

**改写 3 条**（子代理的定性过强或过弱）：

| 原定性 | 改后 | 理由 |
|---|---|---|
| 「FR46/FR47 无人认领」 | 「**已登记但指错了行**」 | `deferred-work.md` 确实有 6 条登记（其中第 1 条就是「作废架构文档 `:245-246`」），只是**指针漂移**导致读起来像已消解 |
| 「`core/hud.ts` 不在架构文档」 | 「**架构文档漏了至少 16 个模块**」 | 只测 `core/hud.ts` 会漏掉 `core/deck-slice.ts` / `core/session-replay.ts` / `core/actions.ts` / `core/build.ts` / `core/types.ts` 等一串 |
| 「AR43 的冲突需用户裁决」 | 「**有明确推荐：作废「两套形状」那一句**」 | 补齐了 FR38 / AR42 / 1.17 AC / R-07 四方一致站在「条带」这一侧的证据 ⇒ 只有 1.12 的 AC 与 AR43 是异类 ⇒ 裁决的余地比原判断窄得多 |

**补漏 1 条**（子代理漏了、主评审独立补上）：
**R-40 的第三条违规** —— `2-1《词图产能验证》` 的 `Status:` 头**就是 `done`**，
它与 1-11 / 1-12 一起仍躺在活跃目录（子代理只报了后两份）。

**本产物自身触发过一次守卫并已修复**：
初稿在状态账本那一节列了归档目录里两个 story 的**具体文件名** ⇒
`tests/scaffold/docs-rules.test.ts` 的 R-40「活跃文档不引用归档目录下的具体文件」用例**变红**。
⇒ 已按 R-40（以及 R-31「引用用原文句子不用行号」）改成**只写 story 编号 + 文档头原句**。
**这条本身就是「归档动作会触发别人的守卫」的又一次实例。**

**已登记、不重复报的项**（本次检视只确认它们仍开着，不重复开新条目）：
「一局 = 一个单元」与 FR52 的冲突（`deferred-work.md` 写死了恢复条件「Story 2.5 录入单元 2 之前」）；
`zombie-died` 音效误报（`effects.ts:259`，已登记归 Story 3.4）；
`TTS` / `ANIMATION` 成员无归属 story（R-04 已如实登记，代码里也逐字写明「归**无归属**，需 `/gds-correct-course` 指派」）；
`core/hud.ts` 与 1.18 七个模块的架构回写（账本已登记，恢复条件「下次改架构文档」已于 2026-10-16 / 2026-10-21 触发）；
1.18 的 7 条人工待验里第 ④⑥⑦ 条未进 1.19 的真机清单；
1.11 移交的 AC-B5「无预录录音 ⇒ 回落到 `speechSynthesis`」真机验证未被任一方认领；
`webkitAudioContext` 前缀回退归 1.18 未处置；
1.16 改写 1.13 的 AC-B3 字面口径未回写（账本禁止改归档文档）。

**评审层完成情况**（配额 429 曾打断 7 个子代理；全部重跑完毕）：

| 层 | 覆盖 | 结果 |
|---|---|---|
| Blind Hunter | 三组 × `core/` `app+services/` `components+views+styles/` | 3 层全部完成 |
| Edge Case Hunter | 同上三组 | 3 层全部完成（`core/` 那层 14 条已逐条核验） |
| Acceptance Auditor | 同上三组 | 3 层全部完成 |
| 专项：规则守卫盲区 | 全仓 + 规则索引逐条对账 | **完成，含 5 条变异实测**（改坏代码 → 全量 2205 条实测红数） |

**总账**：**decision_needed 3 条 · patch 51 条 · defer 8 条（登记进 `deferred-work.md`）· 驳回 4 条 · 改写 3 条 · 补漏 1 条**。
分布：代码缺陷 20 · UI 真机缺陷 5 · app/services 4 · 文档口径链 12 · 状态账本 4 · 规则守卫 6。

> 📌 **这一行是「写这份检视时」的原始清点**（R-35，保留原文不改）。
> **最终处置以「〇、处置台账」那张表为准**：54 条发现 = 3 条裁决 + 20 代码 + 5 UI + 4 app/services
> + 12 口径链 + 4 状态账本 + 6 规则盲区；其中 **13 条已修**（用户裁定的范围：
> 「只修『孩子会撞上』的」），**41 条已登记延后**（`deferred-work.md` 的 E1–E42），
> 另有 1 条 LOW 现状清单（E42 内含）。
> ⇒ 「patch 51」是**子代理报上来的候选 patch 数**，不是**最终修了的数**；
>    「defer 8」是**初稿那一版的延后清单**，已被 E1–E42 **取代**（见文末那张对照表）。

---

## 待办：这些 `defer` 项要登记进 `deferred-work.md`

✅ **已登记。** 本轮 41 条延后项 + 1 条 LOW 清单已逐条写进
`_bmad-output/implementation-artifacts/deferred-work.md` 的
「`## Deferred from: code review of epic-1-集成层检视 (2026-10-22)`」一节，
编号 **E1–E42**。

⚠️ **下面那张 8 条的表是本轮**写这份检视时的初稿**，现在它已被上面的 E1–E42 **取代** ——
   逐条对照如下（**保留原文不改**：它是这份检视的历史记录，R-35）：

| # | 事项 | 恢复条件 | 现在在哪 |
|---|---|---|---|
| 1 | Story 1.12 的 AC 正文与 FR38 / AR42 / 1.17 AC / R-07 在「射程形状」上自相矛盾 | 下次改 `epics.md` 时一并裁决 | ✅ **本轮已裁决并落地**（作废「两套形状」那一句） |
| 2 | 1.14 AC 点名的 `isAudioSilent` 在组件层不可达（被 eslint 禁列挡住） | 下次改 1.14 / 1.17 的 AC 措辞时 | **E17** |
| 3 | `docs/word-image-throughput.md` 两处出处指向 Story 1.20 | 下次改该文档时 | **E40** |
| 4 | `docs/art-direction.md` 一处架构行号指向「词图加载策略」 | 下次改该文档时 | **E40** |
| 5 | 架构文档的日志前缀清单只列 4 个，代码用 8 个 | 下次改架构文档时 | **E18** |
| 6 | `asset-degradations.ts` 的第二个 `*ForTest` 导出未登记 | 下次给 `*ForTest` 补守卫时 | **E19** |
| 7 | 1.18 AC 的「当前单元资源已在缓存中」对 mp3 不成立（代码按 AC-E2 只预取图片） | 下次改 1.18 AC 或加 mp3 预取时 | **E16** |
| 8 | 模拟器 `scripts/balance-sim.ts` 自建 `BUILDABLE_COLUMNS`，未用 core 的 `buildBlockedReason` | 下次改合法塔位规则时 | **E12**（并与 E37 同批：R-22 的副本守卫） |

⚠️ **为什么本表会「少两条」**：初稿写的时候只列了「改文档」那一族；
   本轮扩到**全部 41 条**之后，上面三、四、五节里那些**代码缺陷**与**规则盲区**
   也都进了账本 —— 它们原先没有编号，是这次检视的主要产出。

---

## 收尾门槛（R-39：逐项贴真实输出，不写「应该会绿」）

本轮修完后的最终状态，四项门槛全部实跑，输出原样贴在下：

```
=== npm run validate:content ===
> validate:content
> tsx scripts/validate-content.ts
[content] 校验通过：1 个单元 / 37 条词条 / 37 张卡（单词 30、关键词 1、回应 6）
[content] 词图目录：/root/repos/plants-game/public/assets/words —— 全部被引用的词图均存在且命名合规

=== npx vue-tsc -b --force ===
exit=0

=== npm run lint ===
> lint
> eslint .
/root/repos/plants-game/src/components/quiz/OptionCard.vue
  216:9  warning  'v-html' directive can lead to XSS attack  vue/no-v-html
✖ 1 problem (0 errors, 1 warning)

=== npm run test ===
 Test Files  73 passed (73)
      Tests  2249 passed (2249)
   Duration  25.60s (tests 49%, import 28%, environment 16%, transform 6%, worker 1%)
```

**逐项说明（不许跳过）**：

| 门槛 | 结果 | 说明 |
|---|---|---|
| `npm run validate:content` | ✅ 通过 | 1 个单元 / 37 条词条 / 37 张卡；引用的词图全部存在且命名合规。**内容层没被本轮改动碰到** —— 本轮 13 条修复里没有一条改的是内容数据 |
| `npx vue-tsc -b --force` | ✅ exit 0 | 用 `--force` 是因为 `vue-tsc -b` 会命中 `tsbuildinfo` 就跳过文件（增量漏报，见 R-54 的实践记录） |
| `npm run lint` | ✅ 0 error / 1 warning | 那条 warning 是**本轮之前就有**的（`git show HEAD:src/components/quiz/OptionCard.vue` 已核对同一行），不是本轮引入；本轮**没有**新增或压制任何 lint 告警 |
| `npm run test` | ✅ 73 文件 / 2249 条全绿 | 基线（HEAD `16b7a1b`）实测 **71 文件 / 2205 条** ⇒ 本轮 **+2 个测试文件、+44 条断言、零回归** |

⚠️ **基线是怎么量的（不靠记忆）**：把 HEAD 拉进一个临时 worktree
（`git worktree add --detach /tmp/pg-baseline HEAD`，`node_modules` 用符号链接过去），
在那份**干净副本**上跑 `npx vitest run` ⇒ `Test Files 71 passed (71)` / `Tests 2205 passed (2205)`。
量完即 `git worktree remove --force` 拆掉，主工作区全程未被触碰。
⇒ 「+44」这个数也逐文件对过账：`skip-facade +4`、`store-save +3`、`hand-build +5`、
`quiz-card +10`、`asset-prefetch +4`、新文件 `store-save-rebuild +5`、`invariants +13` = **44**。

⚠️ **「条数只增不减」不等于「既有覆盖没被动过」**：本轮**只追加** `describe` 块，
**没有删改任何既有断言**（R-57：改判据时断言不动、改理由）。
新增的 G253–G261 共 9 个 `describe` 块，16 条变异实测（M292–M307）逐条确认
「改坏代码 ⇒ 对应文件变红 ⇒ 复原后全绿」；变异实测的红数记录在上面的「已修的 13 条」表里。

