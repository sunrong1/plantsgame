# 延后工作（活账本）

> 本文件是**活账本**：只登记**仍然开放**的条目，每条一行。
> 登记格式见 [`docs/rules/process.md`](../../docs/rules/process.md) R-35；
> 账本形态与归档分工见同文件 R-43。
>
> - 完整论证：[`deferred-details.md`](./deferred-details.md)（按 ID 锚点）
> - **已结**条目的历史：`_bmad-output/archive/deferred/`（**默认不读**；考古见该目录 README）

## 条目

| ID | 状态 | 归属 | 恢复条件 | 一句话 | 详情 |
|----|------|------|---------|--------|------|
| DF-001 | 待排期 | 未指派 | 给 `StartView` 的点击路径补一条组件测试，断言它调了 `unlockAudioSequence()` | `StartView` 点击 → `unlockAudioSequence()` 的接线仍无任何测试覆盖 | [`df-001`](./deferred-details.md#df-001) |
| DF-002 | 待触发 | Story 1.18 | 真机上确认目标设备是否真的需要 `webkitAudioContext` 前缀；确认不需要就把它划掉，不要为了「完备」而加没人验证过的分支 | `services/audio.ts` 只读 `globalThis.AudioContext`，无 `webkitAudioContext` 前缀回退 | [`df-002`](./deferred-details.md#df-002) |
| DF-003 | 待触发 | Story 1.2 / 3.4 | 要拿的只有两样：目标平板的 `speechSynthesis.getVoices()` 列表 + Chrome 版本号 | Story 1.2 AC-8 真机验收未做，`sprint-status.yaml` 里 1-2 仍是 review | [`df-003`](./deferred-details.md#df-003) |
| DF-004 | 待触发 | 未指派 | 与上一条同一个 —— 拿到真机音色列表 | `pronunciation.ts` 的 `VOICE_PRIORITY` 英式优先修法仍冻着 | [`df-004`](./deferred-details.md#df-004) |
| DF-005 | 待触发 | 未指派 | 与 AC-8 真机验收同批做（拿到平板 + Chrome 后一起） | `playPronunciation` ≤500ms 起声零验证，需与 AC-8 真机验收同批真机做 | [`df-005`](./deferred-details.md#df-005) |
| DF-006 | 待触发 | 未指派 | 接手时对 `[...]` 加转义并补自测；或引入 minimatch 做交叉校验 | `audio-unlock-guard.test.ts` 的 `matchesGlob` 仍不认 `[...]`，save.ts 断言仍会假绿 | [`df-006`](./deferred-details.md#df-006) |
| DF-007 | 待排期 | 未指派 | 下次改这三个测试文件时，把 `expect` 补上中文失败消息（R-55 的约定） | 三个测试文件的 `expect` 仍欠中文失败消息（实测 89 / 13 / 20 处） | [`df-007`](./deferred-details.md#df-007) |
| DF-008 | 待排期 | 未指派 | 下一次给 AC-9 的「不越界」禁令补守卫时（在那之前只能靠交付时人工复核） | AC-9 七条「不越界」禁令仍零守卫，事后归因只能靠 git 历史 | [`df-008`](./deferred-details.md#df-008) |
| DF-009 | 待触发 | 未指派 | 缺的是「真实浏览器上 `ended` 之后仍会派发 `error`」这一前提的实测 | `isEnglish` 仍只认 `/^en[-_]/`，`playRecording` 的 `ended` 不置 settled | [`df-009`](./deferred-details.md#df-009) |
| DF-010 | 待触发 | Story 3.4（裁决 A 落地时） | 真的调了音色或语速、且 `--force` 仍无法免除手工 `rm` 时 ⇒ 裁决要不要让 `--force` 越指纹闸 | `generate-voice.ts` 已有 `--force`/`--help`，但 `--force` 不越闸 ⇒ 改参数后仍须手工删整个产物目录 | [`df-010`](./deferred-details.md#df-010) |
| DF-011 | 待触发 | 未指派 | 下次要按业务码分类统计 `Failure.code` 时（例如「只有音色类失败才换音色」） | `generate-voice.ts` 的 `Failure.code` 仍是无区分 `string` | [`df-011`](./deferred-details.md#df-011) |
| DF-012 | 待触发 | Story 3.2 / Story 1.12 | Story 3.2 拿到试玩数据后，二选一 —— 调射程/速度让窗口恒含 2 个可达列，或接受「塔位有讲究」并把范围写进 Story 1.12 的 UI 引导；不要在本层悄悄调 | `src/core/combat.ts` 射程窗口裁剪 ⇒ col 0/2/4/6/7 单塔打不死 100 血僵尸 | [`df-012`](./deferred-details.md#df-012) |
| DF-013 | 待触发 | Story 3.2 | Story 3.2 依试玩数据决定减速塔伤害（25 → 34 使 3 发合计 102 ≥ 100）或持续回合数 | `src/core/combat.ts` 减速塔 25 伤害实测 75，GDD「6 回合 × 25 = 150」已被证伪 | [`df-013`](./deferred-details.md#df-013) |
| DF-014 | 待触发 | Story 3.2（调数值）/ Epic 1 试玩（Story 1.19） | Epic 1 试玩；若 4 题门槛显得过严，首选调起始心数 3 → 4 或开局前 2 回合不出僵尸 | `gdd.md` 失败门槛 4 待 Epic 1 试玩复核（首选调起始心数 3 → 4） | [`df-014`](./deferred-details.md#df-014) |
| DF-015 | 待触发 | 未指派 | 若将来引入「本回合已死但仍在场上」的中间态（例如溅射伤害链、复活机制），立刻给这条加断言 | `src/core/turn.ts` 的 `shoot()` 减速守卫仍是等价变异体，无测试 | [`df-015`](./deferred-details.md#df-015) |
| DF-016 | 待触发 | Story 3.2（Epic 3） | Epic 3 战斗数值调优（3-2）时定夺方向 —— 给减速塔一个真实存在的优势，或承认单元 1 阶段它不该进题单 | `src/core/balance.ts` 的 `TOWER_STATS.slow` 仍被直射塔完全支配 | [`df-016`](./deferred-details.md#df-016) |
| DF-017 | 待触发 | 未指派 | 出现能逼出「同回合抵达 ≥2 只」的局面时立刻补断言（三个候选触发点：建塔策略放宽 / 引入溅射复活 / 减速系数被调大） | `src/core/reducer.ts` 的 `applyResolve` 心数夹取仍无守卫 | [`df-017`](./deferred-details.md#df-017) |
| DF-018 | 待触发 | Epic 2 | Epic 2 扩词池时，优先补「含池内词的句子」，并把本条改成回归守卫 | `src/content/units/unit-01.json` 仍只有 1 张 keyword 卡（37 条） | [`df-018`](./deferred-details.md#df-018) |
| DF-019 | 待触发 | 未指派 | `[CR]` 若判「必须换实现」，改法是让该条目不再有卡面 —— 但那会破坏「每条录音都有卡面」这条更强的不变量 | `unit-01.json` 的 `u1-s-good-morning` 回应卡仍是裁决而非共识 | [`df-019`](./deferred-details.md#df-019) |
| DF-020 | 待排期 | 未指派 | 想更硬时，可给内容层单独一个 `tsconfig` 项目（lib 不含 DOM）并让它被 test 项目 `reference` | `src/content/` 的 DOM 边界仍只有 ESLint 一道，无 tsconfig 兜底 | [`df-020`](./deferred-details.md#df-020) |
| DF-021 | 待触发 | 未指派 | 若单元文件增长到解析耗时可见，再合并为单次 | `scripts/validate-content.ts` 每单元仍跑两次 `UnitSchema.safeParse` | [`df-021`](./deferred-details.md#df-021) |
| DF-022 | 待触发 | 未指派 | 若将来引入「一 entry 多卡」的模型，这行必须先拆开 | `scripts/validate-content.ts` 的 `cardCount` 仍直接等于 `entryCount` | [`df-022`](./deferred-details.md#df-022) |
| DF-023 | 待触发 | 未指派 | 接入 formatter 时一并解决 | `src/styles/tokens.css` 仍缺文件尾换行（30 张词图已补） | [`df-023`](./deferred-details.md#df-023) |
| DF-024 | 待触发 | 未指派 | 真出现「从工具导出且属性未加引号」的资产时再修 | `scripts/validate-content.ts` 的 `svgRootTag()` 仍可能返回 `null` | [`df-024`](./deferred-details.md#df-024) |
| DF-025 | 待触发 | Story 1.18 | 真机飞行模式下打开一道**没有预录录音**的卡，确认回落到 `speechSynthesis` 且仍然发声；再断网确认静音也不阻断回合 | AC-B4/B5 的真机断网验收仍未做 | [`df-025`](./deferred-details.md#df-025) |
| DF-026 | 待排期 | Story 1.19 / `[CC]` | 与 E21 同批：把**已归档的 Story 1.10 文档**里「② 支撑 AR43 的**两套形状**」那一条改成「横向 3 格条带」（⚠️ 活跃文档不点名归档文件名 —— R-40） | 裁决 1 的六处文档登记只剩第 6 条未改（1–5 已结） | [`df-026`](./deferred-details.md#df-026) |
| DF-027 | 待排期 | 未指派 | 做一次「记忆正文 vs R-ID」逐条判定：通用经验保留、本项目专属改成一句指向 `docs/rules/`；改完单独留痕（改记忆文件不产生 git 记录） | `~/.claude/projects/-root-repos-plants-game/memory/` 下仍有若干条成文规则正文（变异验证纪律、实测值优先、跳过必须验哈希、`flush:'sync'`） | [`df-027`](./deferred-details.md#df-027) |
| DF-028 | 待裁决 | 未指派 | 人决定：把 `.claude/settings.local.json` 里那条指向 `_bmad-output/implementation-artifacts/1-5-回合状态机与题单.md` 的授权改到 `archive/`，或直接删掉（下次 `[DS]` 用到时工具会重新提示授权） | `.claude/settings.local.json` 仍有一条指向已归档文件的 Bash 授权（运行时 ENOENT） | [`df-028`](./deferred-details.md#df-028) |
| DF-029 | 待触发 | 未指派 | 若再见到 G33b 假红，先查是不是**别的**用例红了而被误记到 G33b 名下（该文件有 79 条用例） | 「G33b 偶发假红」未复现、未解决，原归因与症状方向对不上 | [`df-029`](./deferred-details.md#df-029) |
| DF-030 | 待触发 | 未指派 | 改动 G21 / G23 / G25 / G29 任一判据基线时，把 `tests/helpers/contrast.ts` 的 `stripComments` 换成 `tests/fixtures/strip-comments.ts` 里已存在的状态机版（它连行尾注释一起剥） | `tests/helpers/contrast.ts` 的 `stripComments` 仍只剥行首行注释，四条源码守卫仍认不出行尾注释 | [`df-030`](./deferred-details.md#df-030) |
| DF-031 | 待触发 | 未指派 | 若将来 `src/components/` 里真的出现局部变量藏血量算术的写法，就该上值流分析（可从「单一导出 + 交叉断言」模式扩展） | G19 是词法守卫，`src/components/` 里用局部变量藏血量算术抓不到，堵它要值流分析 | [`df-031`](./deferred-details.md#df-031) |
| DF-032 | 待触发 | Story 1.19 | 1.19 真机复核时若再出现战场撑破容器，需重新想一种能在 jsdom 或纯函数层表达这条约束的方式（或接受它只能靠真机核对） | `BattleField.vue`「列轨最小宽度=行高」这条约束 jsdom 无布局引擎，无任何测试能守 | [`df-032`](./deferred-details.md#df-032) |
| DF-033 | 待排期 | 未指派 | 任何 `package.json` script 或 `scripts/` 下门禁的增删，都应回头 grep `_bmad-output/` 与 `docs/` 并逐处登记 | `check-doc-consistency.sh` 被换掉后 6 处旧文档仍列它为收尾命令，无工具能发现 | [`df-033`](./deferred-details.md#df-033) |
| DF-034 | 待触发 | 未指派 | 若 typecheck 再出现整批、且错误内容与源码对不上的报错，先跑 `npx vue-tsc -b --force` 再下结论 | `npm run typecheck` 曾出 34 条指向 `node_modules/.tmp` 的假红，机制未复现 | [`df-034`](./deferred-details.md#df-034) |
| DF-035 | 待触发 | Story 1.16 / 1.17 | 若 1.15 存档格式要求「本存档累计获得多少阳光」，或 1.17 的 DebugPanel 要显示它 ⇒ 走 `[CC]` 加字段，不要在 1.13 补 | `store.ts` 无 `sunEarned` 累计阳光字段，FR66「累计所得只增不减」只在 `masteredWordIds` 落地 | [`df-035`](./deferred-details.md#df-035) |
| DF-036 | 待触发 | Story 1.16 / 1.18 | 下一次改架构文档（`[GA]`）时把 `core/hud.ts` 补进组件树/模块表 | `src/core/hud.ts` 仍未进 `game-architecture.md` 的 core/ 组件树，架构文档比代码少一模块 | [`df-036`](./deferred-details.md#df-036) |
| DF-037 | 待触发 | 未指派 | 若单元 2 的 JSON 换了 id 前缀形态，必须同步改 `progressDisplay` 并新增一条守卫，否则进度条会恒显示 0 而不报错 | `core/hud.ts` 的 `progressDisplay` 用 `startsWith('u'+unitNumber+'-')`，eslint 的 `src/core/**` 块不禁 `content`，无守卫 | [`df-037`](./deferred-details.md#df-037) |
| DF-038 | 待触发 | Story 1.18 | 1.18 真机校准时复算三条对比度（阳光 / 心 / 白字）；若要改 `--color-heart` 或 `--color-sun` 的值，必须先跑 `palette.test.ts` | `tokens.css` 的 `--color-hud-panel: #1f2d11` 是推导值，未在 1.18 真机复算三条对比度 | [`df-038`](./deferred-details.md#df-038) |
| DF-039 | 待触发 | 未指派 | 单元 2 或任何一条内容出现 `entryId !== wordId` 的词条时，立即走 `[CC]`：改字段名或引入映射表；不许继续把 `entryId` 塞进 `masteredWordIds` | `masteredWordIds` 存的是 `entryId`，单元 1 的 37/37 条恰好相等，单元 2 一分叉就得走 `[CC]` | [`df-039`](./deferred-details.md#df-039) |
| DF-040 | 待触发 | Story 1.18 / 1.19 | 1.18/1.19 真机录制里若「心碎了」看不见或拖沓，先调这里；只许改这一处，改完复跑 AC-G1 第 9 项 | `HeartRow.vue` 用 `--dur-slow`(400ms) 是本组件一次性判断，未在真机复核 | [`df-040`](./deferred-details.md#df-040) |
| DF-041 | 待触发 | Story 1.18 | 1.18 部署 PWA 时加一个 favicon，这条自动闭合 | AC-G1 三件事：`.battle-grid` 3px 横向溢出、`/favicon.ico` 404 待 1.18 PWA 收口，③ HUD 不进 G20 已定 | [`df-041`](./deferred-details.md#df-041) |
| DF-042 | 待触发 | 未指派 | 1.14 接上掉心音效后，那时可以用「同一 tick 内音效与 class 同时触发」把 G53 升级成行为守卫；在此之前不许把 G53 的源码守卫当成「已用行为证明过」 | G56/G57/G53 仍停在源码层；1.14 已接音效但结论是 G53 未升级 | [`df-042`](./deferred-details.md#df-042) |
| DF-043 | 待触发 | 未指派 | 下一个改 `eslint.config.js` 覆盖名单的 story，或引入 minimatch 时 | `tests/scaffold/audio-unlock-guard.test.ts` 的 `matchesGlob` 不支持 `[...]`，eslint 写 `src/{app,views}/**` 会静默判「没覆盖」 | [`df-043`](./deferred-details.md#df-043) |
| DF-044 | 待排期 | Story 1.16 / 1.18 | 下一次改 `game-architecture.md` 的组件树/模块表时，补上 `core/hud.ts` | `core/hud.ts` 仍未列进 `game-architecture.md` 组件树/模块表；1.14 只确认 effects 两文件已列 | [`df-044`](./deferred-details.md#df-044) |
| DF-045 | 待裁决 | 未指派 | Story 1.16 把 `Effect` 的 `TTS` 成员真正接上时，必须重新裁决这一点 | TTS 不在 `runEffects` 里产出，`store.speakQuestion()` 与 `QuestionCard.vue` 独立 watch 两处入口 | [`df-045`](./deferred-details.md#df-045) |
| DF-046 | 待触发 | 未指派 | Story 1.16 若给 `Effect` 加上会抛的新成员（`TTS`），且把它排在 `SAVE` 之前，这一条立刻变成可构造 ⇒ 那时必须补上「前一条抛错、后一条仍执行」的正向用例 | `core/effects.ts` 里 SAVE 恒排末尾，`effects-runner` 写盘抛错后无后续条目可执行 | [`df-046`](./deferred-details.md#df-046) |
| DF-047 | 待触发 | Story 1.16 / 1.17 | 1.16 / 1.17 每次给 `State` 加字段时，同一次改动里确认 `core/reducer.ts` 的 `assertInvariants` 覆盖了它（并在 story 文档里留一行） | `save.ts` 的 `parseSaveFile` 只查 progress 两键 + currentGame 是对象，State 新字段无拒绝判据 | [`df-047`](./deferred-details.md#df-047) |
| DF-048 | 待触发 | 未指派 | 新增第二条进关路径的同一个 story 里，必须确认它走 `enterLevel()` 或显式调 `restoreFromSave()` | 读档只挂在 `store.enterLevel()`，新增进关路径若不经它就读不到存档 | [`df-048`](./deferred-details.md#df-048) |
| DF-049 | 待排期 | 未指派 | 累计到第三个带前缀日志的服务时，把「前缀合规 + 不在逐帧路径」做成一条通用守卫 | R-14 只在 `tests/scaffold/save-boundary.test.ts` 扫 `src/core/**`，services/app 的带前缀日志无守卫 | [`df-049`](./deferred-details.md#df-049) |
| DF-050 | 待触发 | 未指派 | 任何一个动 `assertInvariants` 或给 `State` 加存档字段的 story，同一次改动里补 `unitNumber` 校验，并把 G221 的第一条前置断言翻过来 | `reducer.ts` 的 `assertInvariants` 只查 unitNumber 形状，不查单元是否录入，`unitNumber: 99` 仍放行 | [`df-050`](./deferred-details.md#df-050) |
| DF-051 | 待触发 | 未指派 | 任何要把 R-14 扩到组件 / 视图层的 story，顺带裁决「组件里哪些 console 是允许的、形状是什么」 | `LevelView.vue` 的 `unitTotal` computed 里 `console.warn`，R-14 只扫 `src/core/` | [`df-051`](./deferred-details.md#df-051) |
| DF-052 | 待触发 | Story 1.17 | 1.17 的调试面板若要给每个键配专门文案，那时把六键逐条文案一并定稿 | `DebugPanel.vue` 仍按 `key=${item.key}` 通用渲染，六个 `SaveDegradationKey` 无逐键文案 | [`df-052`](./deferred-details.md#df-052) |
| DF-053 | 待触发 | 未指派 | 下一次改 `epics.md` 的 AC 正文时（R-32 的时机），把 AC-D1 第 2 条改成可判定的口径，或显式标注「顺序不构成约束，理由已失效」 | `epics.md` Story 1.15 无「先喂 progress 再喂 state」条款，该不可判定口径只留在归档的 1-15 文档 | [`df-053`](./deferred-details.md#df-053) |
| DF-054 | 待触发 | 未指派 | 与「`parseSaveFile` 只做底线形状校验」那条同一次处理 —— 任何动存档 schema 的 story，顺带定下「解析层拒什么、逻辑层抛什么」的清单 | `save.ts` 的 `isProgressShape` 只判 `typeof number`（NaN/-1 全放行），`isPlainObject` 是不健全谓词 | [`df-054`](./deferred-details.md#df-054) |
| DF-055 | 待触发 | Story 1.17 | 任何要动 `restoreNextUnit` 或给 `SaveDegradationKey` 加键的 story，同一次改动里补上这两条路径的降级登记，并顺带把 1.17 的面板文案定稿 | `store.ts` 的 `restoreNextUnit` 两条失败分支只 `console.warn`，不调 `markRestoreDegraded` | [`df-055`](./deferred-details.md#df-055) |
| DF-056 | 待触发 | 未指派 | 新增任何 `readSave()` 的调用点时，复核那一处是否也要「空读撤掉 `read`」；若不要，在那一处显式注释理由 | `readSave()` 的「空读撤掉 read 降级」语义只在 `store.ts` 这一个调用点成立 | [`df-056`](./deferred-details.md#df-056) |
| DF-057 | 待排期 | Story 1.17 | 任何要加「测试专用导出」或要动 `tests/scaffold/` 边界守卫的 story，同一次改动里补一条「`src/**` 不得 import 名字以 `ForTest` 结尾的导出」的守卫 | `save.ts` 的 `clearSaveDegradationsForTest` 与 `asset-degradations.ts` 的同名导出仍无「src 不得 import `*ForTest`」守卫 | [`df-057`](./deferred-details.md#df-057) |
| DF-058 | 待触发 | 未指派 | 出现第二条会切走 `QuestionCard` 的路径时（1.17 的调试面板、1.18 的暂停覆盖层、或任何把 `view` 从 `level` 切走的分支），必须先给 `pronunciation.ts` 补公开的 `stop`，再挂 `onBeforeUnmount` | `QuestionCard.vue` 无 `onBeforeUnmount`、`pronunciation.ts` 无公开 stop，卸载后朗读一路播到结束 | [`df-058`](./deferred-details.md#df-058) |
| DF-060 | 待排期 | 未指派 | 下一次做文档治理（`/gds-correct-course` 或 QD 治理）时，把这条口径更正一次性回写进 1.13 的归档文档，并同步 `docs/rules/` 里与「落盘看到的进度」有关的任何表述 | 归档的 1-13 文档仍写「HUD 的进度只读内存里的进度」，与 1.16 裁决 11 的「这一次结算之后」口径不一致 | [`df-060`](./deferred-details.md#df-060) |
| DF-061 | 待触发 | 未指派 | 出现第二条会切走 `QuestionCard` 的路径时（1.17 的调试面板、1.18 的暂停覆盖层、或任何把 `view` 从 `level` 切走的分支） | `QuestionCard.vue` 仍无 `onBeforeUnmount`，1.17 未新增会切走它的路径 | [`df-061`](./deferred-details.md#df-061) |
| DF-062 | 待触发 | Story 1.18（仅 BGM 部分） | 出现第二条不经 `enterLevel()` 进关卡的路径 | `backToStart()` 已调 `stopBgm()`，但 `state.value` 仍停在终态相位 | [`df-062`](./deferred-details.md#df-062) |
| DF-063 | 待触发 | 未指派 | 下一次改通关心案时，顺手把它改成「不匹配任何负向词表」的表述 | `tests/components/level-outcome.test.ts` 仍把正向词写死成 `/读完\|完成\|太棒\|过关/` | [`df-063`](./deferred-details.md#df-063) |
| DF-064 | 待触发 | 未指派 | `shown` 函数体首次出现嵌套 `{}` 时换成真解析（正解不是再加一个计数器） | `tests/components/quiz-card.test.ts` 的 `shownBody()` 仍用单层花括号 depth 计数切函数体 | [`df-064`](./deferred-details.md#df-064) |
| DF-065 | 待排期 | 未指派 | 判为 P3；真出现时是显眼的架构违例（GDD 禁止选关），不是静默回归 | `tests/scaffold/no-unit-select.test.ts` 的反向自测仍只把 `views/UnitSelectView.vue` 塞进 probe | [`df-065`](./deferred-details.md#df-065) |
| DF-066 | 待触发 | Epic 2 | Epic 2 录第二单元时同步调阈值，并在 helper 注释里写死「阈值怎么跟着内容长」 | `tests/app/level-flow.test.ts` 的 `driveLevel` 仍以 `guard > 200` 判定「跑了一局还没通关」 | [`df-066`](./deferred-details.md#df-066) |
| DF-067 | 待排期 | 未指派 | 下一次动 `core/reducer.ts` 的 `masteredEntryIds` 追加时，改成去重追加并补断言 | `core/reducer.ts` 仍用 `[...state.masteredEntryIds, id]` 追加，不去重 | [`df-067`](./deferred-details.md#df-067) |
| DF-068 | 待触发 | Epic 2 | Epic 2 出现第二个单元时重新评估「钳到合法范围」还是「显式清零」 | `store.ts` 的 `restoreNextUnit` 两条失败分支只回退 `state`，`progress.currentUnitIndex` 仍指向不存在的单元 | [`df-068`](./deferred-details.md#df-068) |
| DF-069 | 待触发 | Story 1.18 | 下一次改架构文档（`[GA]`）时补进组件树/模块表 | `game-architecture.md` 组件树缺 `core/hud.ts`、`asset-prefetch.ts`、`sw/` 等 7 个模块 | [`df-069`](./deferred-details.md#df-069) |
| DF-070 | 待触发 | Story 1.18 | 下一次 `[GA]` 时，①②④⑤⑦⑧ 按上表补进架构文档；③ 保持「显式不做」并写明「引入位图素材时必须重新评估」；⑥ 属运维事项，不进架构组件树 | AC-H2 的 8 项（CSS 断点 / manifest / 缓存层）只在 1.18 定案，未进架构文档 | [`df-070`](./deferred-details.md#df-070) |
| DF-071 | 待触发 | Story 1.19 | Story 1.19 真机试玩时验，结论回填本条 | AC-B8 离线、`--color-hud-panel`、`--dur-slow`、竖屏布局 4 项须真机验 | [`df-071`](./deferred-details.md#df-071) |
| DF-073 | 待触发 | Story 3.5（及各自归属 story） | E 组 5 条观察项 1.19 只观察不改，分别落 3.5 / 1.10 / `[CC]` | E 组 5 条观察项 1.19 只观察不改，分别落 3.5 / 1.10 / `[CC]` | [`df-073`](./deferred-details.md#df-073) |
| DF-074 | 待触发 | Story 1.19 | 真机飞行模式 | D1–D8 真机项全未验，未验则不应推进 Epic 2 | [`df-074`](./deferred-details.md#df-074) |
| DF-076 | 待裁决 | Story 3.5 | 人裁决横屏左栏的战场高度占比（Story 3.5 `[DS]` 实测 1280×800：战场 848×519、手牌区 848×147、两者**不相交**、题卡 67~800 ⇒ 行高 733 ⇒ 战场与手牌区之间空隙 ≤ 67px）；裁决后写进新 story 实施，不许在本条里悄悄改列宽比例 | 1280×800 下战场被宽度约束，左栏底部余量实测 ≤67px（1.19 推算的 190px 已被实测推翻） | [`df-076`](./deferred-details.md#df-076) |
| DF-077 | 待触发 | Story 1.19 | 1.19 真机试玩时把平板转成横屏对照一次（验「不能种植」是不是横屏独有） | 横屏是否就是平板「不能种植」的唯一原因仍未验，须真机旋转对照 | [`df-077`](./deferred-details.md#df-077) |
| DF-078 | 待触发 | 未指派 | 存档降级路径重做时（与 M2 一并看） | `store.ts` 的 `restoreFromSave` catch 清零 `masteredWordIds`，代价变成「下局考哪 10 个词」 | [`df-078`](./deferred-details.md#df-078) |
| DF-079 | 待触发 | 未指派 | 同 DF-078 一条（存档降级路径重做时，与 M2 一并看） | `parseSaveFile` 一个坏元素即判整份失败，同一失败信号两种结局 | [`df-079`](./deferred-details.md#df-079) |
| DF-080 | 待触发 | 未指派 | 存档损坏的降级语义统一时（AC-D4 组） | `store.ts` 的 `restoreNextUnit` 越界即 return，AC-B6 终态不可达 | [`df-080`](./deferred-details.md#df-080) |
| DF-081 | 待触发 | Story 1.19 | 真机试玩前先把这两条 AC 的前提（「每局全对」）写进 AC 正文；否则家长会把符合设计的行为读成 bug | 1.19 的 AC-B4 / AC-B8 前提「每局全对」尚未写进 AC 正文 | [`df-081`](./deferred-details.md#df-081) |
| DF-082 | 待触发 | 未指派 | 首次出现「给卡打标记」类需求时 | `sliceDeckForLevel` 返回内容层共享 `DeckEntry` 引用，`toEqual` 类断言仍全绿 | [`df-082`](./deferred-details.md#df-082) |
| DF-084 | 待触发 | 未指派 | 切片判据需要第二次落点时（那时应该改成 G161 扫 core + 追常量引用，而不是加字面量） | G160 只查字面量 `10` 且豁免 `src/core/`，G161 不扫 `src/core/`，第二份题数实现可过 | [`df-084`](./deferred-details.md#df-084) |
| DF-085 | 待触发 | 未指派 | 给守卫补一个「判据范围」自测夹具时 | `tests/guards/deck-slice-boundaries.test.ts` 用 `indexOf('\n}\n', start)` 切函数体，缩进变则静默截断 | [`df-085`](./deferred-details.md#df-085) |
| DF-086 | 待触发 | 未指派 | 支持矩阵扩到窄横屏（或出手机版）时 | `responsive.css` 的 `minmax(0,1fr) 25rem` 无宽度下界，窄横屏格子边长 < 48px | [`df-086`](./deferred-details.md#df-086) |
| DF-087 | 待裁决 | Story 3.5 | 人裁决横屏矮视口的战场尺寸策略（Story 3.5 `[DS]` 实测 1280×660 与 1280×713 的**建造相**「手牌区与战场相交」= **是** ⇒ 本条记的症状**已复现**；候选：战场改由可用高度定尺寸 / 允许滚动 / 缩窄题面栏）；裁决后写进新 story 实施 | `battle-grid` 高度由 `aspect-ratio` 推出，1280×660 下溢出手牌行、孩子点不到卡（Story 3.5 `[DS]` 真浏览器实测已复现） | [`df-087`](./deferred-details.md#df-087) |
| DF-088 | 待触发 | Story 1.19 | 词图 404 率被真机验证之前；若真出现连续 404，先降级成「跳过全部 ⇒ 通关」而不是抛错 | `reducer.ts` 的 CONTINUE 分支 `next === null` 抛错，全跳时技术错误抛给孩子 | [`df-088`](./deferred-details.md#df-088) |
| DF-089 | 待排期 | Story 1.19 | 本 story 的 patch 项落地时补齐（本条与 patch 组第 5 条是同一处，一起改） | `createUnitCompletedState` 空账使 `assertDeckRelations` 四条不变量真空成立 | [`df-089`](./deferred-details.md#df-089) |
| DF-090 | 待触发 | Story 1.17 | 存档深层校验加固时（1.17 的降级面板已登记资产 / 存档降级项，那是同一处的自然落点） | `assertDeckRelations` 查 `deck` 唯一性却不查 `unlocked` 内部重复 | [`df-090`](./deferred-details.md#df-090) |
| DF-091 | 待触发 | 未指派 | 若将来给切片加第二个调用点，或 `Progress` 的字段名与实际语义分家时 | `deck-slice.ts` 的参数名 `masteredWordIds` 与 `entry.entryId` 是两个 ID 命名空间 | [`df-091`](./deferred-details.md#df-091) |
| DF-092 | 待排期 | Story 1.20 | 用户对「植物不重复出现」这条需求给出裁决之后 | `tests/content/unit-01.test.ts` 只断言整单元三塔型；1.20 已落地「一局内零相邻同型」 | [`df-092`](./deferred-details.md#df-092) |
| DF-093 | 待触发 | 未指派 | 若把 `jumpToTurn` 暴露到生产包，或低端平板上调试时观察到卡顿时 | `store.ts` 的 `jumpToTurn`（`MAX_JUMP_STEPS = 500`）一次点击约 1500 次 `setItem` | [`df-093`](./deferred-details.md#df-093) |
| DF-094 | 待触发 | 未指派 | 存档深层校验加固时（那时可以论证把 `round-over` 那格降级成只在真异常时写） | `startRound()` 同步三连使 `round-over` 紧接 `awaiting-answer` 两次写盘 | [`df-094`](./deferred-details.md#df-094) |
| DF-095 | 待触发 | 未指派 | 想把 G163 从「文本判据」升级为「接线行为判据」时 | G163 用 200 字符窗口正则守接线层，抽成局部变量即可绕过 | [`df-095`](./deferred-details.md#df-095) |
| DF-096 | 待触发 | 未指派 | 需要在真浏览器里做一次层叠实测（jsdom 不做布局），或改用真浏览器 e2e 断言 `getComputedStyle` | `responsive.css` 的 `.level-view .battle-grid` 与 SFC scoped 同为 `(0,2,0)`，特异度平局查不出 | [`df-096`](./deferred-details.md#df-096) |
| DF-097 | 待触发 | 未指派 | 横屏布局下一次结构性改版 | `.level-outcome` 靠 `position: absolute; inset: 0` 定位，不在 `grid-template-areas` 里 | [`df-097`](./deferred-details.md#df-097) |
| DF-098 | 待触发 | 未指派 | 横屏布局改版，或引入布局类令牌时 | `responsive.css` 的 `25rem` 右栏宽无设计令牌锚点 | [`df-098`](./deferred-details.md#df-098) |
| DF-099 | 待触发 | 未指派 | 若要把 `core/` 的返回类型系统性收紧为 `readonly`（那是一次跨模块的签名改动） | `sliceDeckForLevel` 返回 `DeckEntry[]` 而非 `readonly`，纯度只写在注释里 | [`df-099`](./deferred-details.md#df-099) |
| DF-100 | 待触发 | Story 1.19 | 平板真机试玩时若家长/孩子实际表现困惑（AC-D5 的观察项），再走 `[CC]` 改文案 | `AnswerFeedback` 文案仍是「再想想」，与 `locked` 置灰不可点观感打架 | [`df-100`](./deferred-details.md#df-100) |
| DF-101 | 待排期 | Story 1.20 | 将来动 A2 或给 `G174③` 换夹具时一并处理；那时需要一条能区分「重排改了归属」与「本来就不该按原序拼」的判据 | `tests/app/store-deck-slice.test.ts` 的 G174③「四局=整个词表」前提随 1.20 重排收窄 | [`df-101`](./deferred-details.md#df-101) |
| DF-103 | 待触发 | 未指派 | 拿到**牛津上海版**教材的单元词表（= DF-201 的扫描件）⇒ 按真实词表重算每单元词条数，解开 AR44 的估算基数冲突 | `epics.md` AR44 的「200-400 张」估算基数与实测 480–600 张冲突，需 `[CC]` 改规划产物 | [`df-103`](./deferred-details.md#df-103) |
| DF-104 | 待触发 | 未指派 | 拿到**牛津上海版**教材词表（DF-201）后重算各档占比；若「数词 + 公认符号」占比远高于单元 1，这个结论要重写 | `epics.md` §7.2「程序化生成⇒工时减半」被实测打掉 4/5，待真实词表重算 | [`df-104`](./deferred-details.md#df-104) |
| DF-107 | 待触发 | 未指派 | 若要把这个脚本当长期产能仪表，需加「开工时刻」的显式记录（开工时先写一条 `kind: "start"` 的记录） | `scripts/word-image-throughput.ts` 只量写盘跨度，缺「开工时刻」记录（`u2-sun` 报 0.0 秒） | [`df-107`](./deferred-details.md#df-107) |
| DF-108 | 待排期 | 未指派 | 永不复用 | 「9.7 小时 ÷ 25 张」算法不成立，保留在 `docs/word-image-throughput.md` 作反面教材 | [`df-108`](./deferred-details.md#df-108) |
| DF-109 | 待排期 | 未指派 | 需要一个能替代目视的判据（人工抽检协议、或可接受度测试） | `docs/art-direction.md` §5.5/5.5b/5.6 永久目视，「画得像不像」仍无机器判据 | [`df-109`](./deferred-details.md#df-109) |
| DF-110 | 待触发 | 未指派 | 拿到**牛津上海版**教材的目录页（DF-201 的扫描件）后定「游戏单元 ↔ 教材 Unit」的映射；在此之前不要把「上册 = 前 8 个单元」当事实引用 | GDD 只有「全年两册」无单元表，「上册 = 前 8 单元」的推断不可当事实引用 | [`df-110`](./deferred-details.md#df-110) |
| DF-111 | 待触发 | 未指派 | 一旦作出收窄决定，走 `[CC]` 改 `epics.md` 的编号与档位表 | 若改选「收窄到上册」，`Story 2.7`/`2.8`/`2.9` 编号与阳光第三档要重算 | [`df-111`](./deferred-details.md#df-111) |
| DF-112 | 待触发 | 未指派 | 若工具将来被多写者/CI 并发使用，改为「先 stat 再 read，或 read 后复 stat 校验 mtime 未变」 | `scripts/word-image-throughput.ts` 的 `buildRecord` 先 read 后 stat，有旧内容+新 mtime 竞态 | [`df-112`](./deferred-details.md#df-112) |
| DF-113 | 待触发 | 未指派 | 一旦支持多目录，去重键需改成「目录 + entryId」复合键 | `scripts/word-image-throughput.ts` 去重键仍是裸 `entryId`，跨目录会静默合并 | [`df-113`](./deferred-details.md#df-113) |
| DF-114 | 待触发 | 未指派 | 若该测试未来变成「实现契约的独立见证」，改手写 interface 而非 `typeof import` | `tests/scripts/word-image-throughput.test.ts` 用 `as typeof import(...)` 做夹具，类型层不再独立 | [`df-114`](./deferred-details.md#df-114) |
| DF-115 | 待触发 | 未指派 | 若工具要区分「坏文件」与「空图」，改返回「元素数 + 是否有根」的元组或带哨兵值 | `scripts/word-image-throughput.ts` 的 `countElements` 对无根 SVG 报 0，与合法空图不可分 | [`df-115`](./deferred-details.md#df-115) |
| DF-116 | 待触发 | 未指派 | 若「画得像不像」的判读要变成可审计记录，需在工具里加中间版归档与判读快照 | `docs/word-image-lab/versions.jsonl` 只记 48px 结论，`egg`/`playground` 中间版未落盘 | [`df-116`](./deferred-details.md#df-116) |
| DF-121 | 待排期 | 未指派 | 加一条测试读 `docs/card-distribution.md` 的 §3 表，逐行解析后与 `targetCardDistribution` 的实算值比对（漂了就红） | `docs/card-distribution.md` §3 逐单元表仍零守卫，interpolate 改 smoothstep 时 G187–G190 全绿 | [`df-121`](./deferred-details.md#df-121) |
| DF-122 | 待排期 | 未指派 | 在 `LevelOutcome.vue` 里加一层 focus trap（捕获 Tab / Shift+Tab 在浮层内循环，Esc 关闭），并加一条守卫断言「浮层打开后连按 N 次 Tab，焦点仍在浮层内的可聚焦元素上」 | `src/components/hud/LevelOutcome.vue` 只 `focus()` 不锁 Tab，焦点能跑到浮层后的格子 | [`df-122`](./deferred-details.md#df-122) |
| DF-123 | 待触发 | Story 1.19 | 给 `LevelOutcome` 浮层自己的 `padding-left/right` 补上 `env(safe-area-inset-left/right)`，并加一条守卫断言 | `src/components/hud/LevelOutcome.vue` 浮层 `padding-left/right` 仍只有 `var(--space-panel-pad)` | [`df-123`](./deferred-details.md#df-123) |
| DF-124 | 待触发 | Story 1.2 | 把「结束朗读」收敛成单一出口（`try/finally` 或一个 `finishPronunciation()`），所有提前 `return` 路径都走它；并加一条守卫断言「任何一次朗读请求结束后 `playing` 必为 false」 | `src/services/pronunciation.ts` 的 `playPronunciation` 提前 `return` 路径不发 `idle`，浮层可能永亮 | [`df-124`](./deferred-details.md#df-124) |
| DF-125 | 待排期 | Story 1.19 / 1.20 / 2.1 / 2.2 | ① 先把 110 行按 story 归位，账本里只留一行指针；② 归位完成后再把 R-42 守卫的射程扩到 `last_updated:` 块，上限沿用 `SPRINT_STATUS_MAX_COMMENT_LINES`；③ 扩射程那一步要配一条反向自测 | `sprint-status.yaml` 的 `last_updated:` 块 110 行注释未归位，R-42 守卫上限仍是 4 | [`df-125`](./deferred-details.md#df-125) |
| DF-126 | 待裁决 | 未指派（接线规格见 Story 3.4 文档的「裁决 C」小节） | 裁决 ducking 曲线（起落时间常数 + 稳态增益）后，按 Story 3.4 文档「裁决 C」小节给出的接线规格在 `startBgmIfReady`/`playSfx` 两侧各接一个 `GainNode`，并补守卫 | `services/audio.ts` 的 `startBgmIfReady`/`playSfx` 两侧未接 `GainNode` 做 BGM ducking | [`df-126`](./deferred-details.md#df-126) |
| DF-127 | 待触发 | Story 1.18 | 真机上确认目标设备是否真的需要前缀；确认不需要就把它划掉，不要为了「完备」而加没人验证过的分支 | `services/audio.ts` 只读 `globalThis.AudioContext`，无 `webkitAudioContext` 前缀回退 | [`df-127`](./deferred-details.md#df-127) |
| DF-128 | 待裁决 | 未指派 | 先定「许可字段允许填什么」（是否允许 `AI-generated (...)` 这类描述），再据此把 G251 的「已知形态」清单补全 | `tests/assets/audio-assets.test.ts` 的许可字段允许哪些前缀仍待人裁决 | [`df-128`](./deferred-details.md#df-128) |
| DF-129 | 待排期 | 未指派 | 下次动这批文件时顺手改；或单独开一次「守卫编号可检索性」的小改，改完跑一遍全仓确认没有用例只靠标题匹配 | `tests/` 各守卫编号只写在 `describe` 上，`it` 标题不含 G 号，按号搜不到用例 | [`df-129`](./deferred-details.md#df-129) |
| DF-130 | 待触发 | 未指派 | 先定「复习模式」在 `State` 里的表示，再决定判据落在哪一层；触发条件 = 引入复习模式的那天 | `core/effects.ts` 的 `answer-correct` 在引入复习模式后会重新可达 | [`df-130`](./deferred-details.md#df-130) |
| DF-131 | 待触发 | Story 3.2 / 3.6（战斗结算侧） | 回合结算把**逐只**僵尸的结算明细写进 `State` 之后 ⇒ 收窄 `zombie-died` 的判据；别为了这条去动 `State` | `core/effects.ts` 的 `zombie-died` 判据分不清「被打死」与「到达后被带走」的僵尸 | [`df-131`](./deferred-details.md#df-131) |
| DF-132 | 待触发 | 未指派（战斗反馈侧） | 音效播放改为**可等待的串行队列**时（排队会改体感，须先定） | `services/audio.ts` 各音效各自解码，先解完先响 ⇒ `runEffects` 数组顺序 ≠ 听觉顺序 | [`df-132`](./deferred-details.md#df-132) |
| DF-133 | 待触发 | Story 1.17 | 1.17 若要收这条，就在 G109 那条守卫里扩，而不是新开一条 | `app/dev-adjust.ts` 补偿缝的音效触发顺序由 Story 1.17 的 G109 负责 | [`df-133`](./deferred-details.md#df-133) |
| DF-134 | 待触发 | 未指派 | 音效若改用程序化生成，需搬 Story 1.3 的 manifest/fingerprint/sha256（R-59 全套） | `core/effects.ts` 的音效若改用程序化生成要补 R-59 全套 | [`df-134`](./deferred-details.md#df-134) |
| DF-135 | 待排期 | Story 3.2 / 3.6 | 3.2 调数值时把「单元边界处的初始阳光净变化」列入检查项；并另加一条检查项（相邻档位 `floor((初始阳光 + 答对增量) ÷ 最低造价)` 是否相同） | `BALANCE_TIERS` 三档在单元边界净缩水 50，档位 3 门槛比档位 1-2 宽一问 | [`df-135`](./deferred-details.md#df-135) |
| DF-136 | 待排期 | Story 3.3 / 3.6 | 3.3 依试玩数据调整三档时，必须同步更正 GDD §Economy Across Levels 的表与 `epics.md` FR63，并按 R-21 在同一 story 内同步更正 | GDD §Economy and Resources 仍把「阳光递增的具体分段值」列为待定项 | [`df-136`](./deferred-details.md#df-136) |
| DF-137 | 待裁决 | Story 3.2 / 3.6 | 2.3 若要动档位边界或初始阳光 ⇒ 必看本条的实测表与守卫（`tests/scripts/balance-sim.test.ts` 的 G231 / G232），并重跑 `npm run balance-sim` | Story 2.3 复测证实门槛确实移动但更宽容，「停手问人」出口至今没以「问」的形式完成 | [`df-137`](./deferred-details.md#df-137) |
| DF-138 | 待裁决 | Story 3.2 / 3.6 | 3.2 动档位数值时先回答「档位 3 的门槛要不要与前两档对齐」，再按 R-21 在同一 story 内同步更正 GDD §Economy Across Levels、`epics.md` 的 2.3 / 3.3 AC、以及本条目 | 档位 3 `initialSun=100` 恰等于塔造价，是否与档位 1-2 对齐门槛待人裁决 | [`df-138`](./deferred-details.md#df-138) |
| DF-139 | 待触发 | 未指派 | 下一次允许改动 `balance-sim` 既有输出行时，把表头改成「跑满该场景回合上限」并把上限做成逐行的列，同时重跑并改写 story 文档里「默认输出只多一行」那句自证 | `scripts/balance-sim.ts` 门槛表头写「16 回合上限」，但该行 `maxTurns` 是 10 | [`df-139`](./deferred-details.md#df-139) |
| DF-140 | 待触发 | 未指派 | 下一次改 GDD §Economy 段战斗机制表述时一并把三处数字统一，并按 R-21 在同一 story 内同步 `decision-log.md` 与 `epics-draft.md` | `gdd.md` 把「3 座塔」造价 50/50/75 写成伤害，与 `decision-log.md` 的 135 不一致 | [`df-140`](./deferred-details.md#df-140) |
| DF-141 | 待触发 | Story 3.2 / 3.6 | Story 3.2 / 3.6 拿到该产品裁决后，回填条目 45 并关闭本条；在此之前「门槛在档位 3 上宽一问」只应被当作实测事实引用 | Story 2.3 的 AC-D3「停手问人」出口至今没以「问」的形式完成，挂在条目 45 | [`df-141`](./deferred-details.md#df-141) |
| DF-142 | 待裁决 | Story 1.19（或一次架构裁决） | 二选一 —— ① 把 `asset-degradations` 的读写搬进 `app/` 门面；② 或在架构文档里把例外范围写死成「组件只可直连无状态的 `services/` 模块」并加一条守卫 | 6 个组件直连 `services/`，其中 `asset-degradations.ts` 带模块级可变状态 | [`df-142`](./deferred-details.md#df-142) |
| DF-144 | 待触发 | Story 1.12 | 词表定稿后把 `alt` / `aria-label` 换成孩子侧的说法，并加一条守卫：不得直接包含英文枚举字面量 | `src/components/battle/Tower.vue` 的 `alt` 用英文枚举 direct/sniper/area | [`df-144`](./deferred-details.md#df-144) |
| DF-145 | 待触发 | Story 1.12 | 1.12 定下「可建 / 不可建 / 已选中 / 候选格」四态的视觉分工后，把 `is-buildable` 用上（或删掉这个类），并加一条守卫：模板里挂的每个状态类都必须有 CSS 规则 | `src/components/battle/BattleField.vue` 挂了 `is-buildable` 类但 CSS 无对应规则 | [`df-145`](./deferred-details.md#df-145) |
| DF-146 | 待排期 | 未指派 | 把机制写进架构的「网格布局与坐标映射」一节，并明确「G14 管 N 与 COLS 同源 / G133 管轨道形态是 minmax」这条分工 | `minmax(0, 1fr)` 的 18px 机制只写在 `BattleField.vue` 样式注释里 | [`df-146`](./deferred-details.md#df-146) |
| DF-147 | 待排期 | Story 1.17 | 把 key 换成 `cellKey → Set<towerId>`，就能同时回答「哪座塔盖的」与「盖了哪些格」 | `BattleField.vue` 的 `devTowerRangeKeys` 把所有塔覆盖格并成一个 Set | [`df-147`](./deferred-details.md#df-147) |
| DF-148 | 待触发 | Story 1.2 / 1.14 | 下次动 `audio.ts` 的 `resume()` 调用点时 | `audio.ts` 的 `ensureContextRunning` 未兜 `ctx.resume()` 同步抛，会中止 `enterLevel()` | [`df-148`](./deferred-details.md#df-148) |
| DF-149 | 待触发 | Story 1.14 | 下次动 `audio.ts` 的加载链时 | `audio.ts` 的 `fetchAudioBuffer` 无超时，BGM 卡在 `bgmLoading=true` 永久失声 | [`df-149`](./deferred-details.md#df-149) |
| DF-150 | 待触发 | Story 1.2 | 下次动 `pronunciation.ts` 的录音通路时 | `pronunciation.ts` 录音通路无超时，`publishPronunciationStatus('playing')` 永不复位 | [`df-150`](./deferred-details.md#df-150) |
| DF-151 | 待触发 | Story 1.2 | 与 E3 同批做（同一个文件、同一条收敛链） | `pronunciation.ts` 录音 `ended` 处理器不查代次，旧录音会熄灭新朗读浮层 | [`df-151`](./deferred-details.md#df-151) |
| DF-152 | 待触发 | Story 1.15（存档侧）/ 1.17（降级侧） | 下次给 `*ForTest` 之外的导出补守卫时（与 E19 同批） | `save.ts` 与 `asset-degradations.ts` 的监听器回调裸调，无 try/catch + WARN | [`df-152`](./deferred-details.md#df-152) |
| DF-153 | 待触发 | Story 1.15 | 与 DF-152（E5）一条同批做 | `save.ts` 的 `writeSave` 把 `resolveDegradations` 包在 try 内，误报「存不进去」 | [`df-153`](./deferred-details.md#df-153) |
| DF-154 | 待触发 | Story 1.16 | 下次动 `LevelOutcome.vue` 的配色时 | `LevelOutcome.vue` 按钮 `#4caf50`/`#fff` 对比度 2.78:1，低于 AA 4.5:1 | [`df-154`](./deferred-details.md#df-154) |
| DF-155 | 待触发 | Story 1.12 | 下次动 `HandCard.vue` 的遮罩时 | `HandCard.vue` 把 `--color-overlay-unaffordable` 叠两层，合成 alpha 0.6975 非 0.45 | [`df-155`](./deferred-details.md#df-155) |
| DF-156 | 待触发 | Story 1.12 | 下次动战场格的状态类时 | `BattleField.vue` 的 `is-buildable` 只挂模板，全仓无 CSS 规则（实测仅 1 处命中） | [`df-156`](./deferred-details.md#df-156) |
| DF-157 | 待触发 | Story 1.12 | 下次动 `Tower.vue` 的可访问性属性时 | `Tower.vue` 的 `:alt`/`aria-label` 读出英文枚举 direct/slow/aoe 塔 | [`df-157`](./deferred-details.md#df-157) |
| DF-158 | 待触发 | Story 1.5 / 1.12 | 下次动 `combat.ts` 的射程原语时 | `combat.ts` 的 `inRange` 静默 false 而 `aoeColumns` throw，越界校验面不一致 | [`df-158`](./deferred-details.md#df-158) |
| DF-159 | 待触发 | 未指派 | 下次改合法塔位规则时（必须做）—— 见 E21 / E22 那两条口径复制链 | `scripts/balance-sim.ts` 自建 `BUILDABLE_COLUMNS`，未用 `core/grid.ts` 的 `buildBlockedReason` | [`df-159`](./deferred-details.md#df-159) |
| DF-160 | 待触发 | Story 1.6 | 下次给 `rangeOf` 的调用点加守卫时 | `core/balance.ts` 的 `TOWER_STATS.aoe.range = 2`，`aoeColumns` 实际覆盖同行 3 格 | [`df-160`](./deferred-details.md#df-160) |
| DF-161 | 待触发 | Story 1.5 | 下次动 zombie id 格式或目标选择时 | `combat.ts` 的 `zombie.id < best.id` 是字符串比较，'z10'<'z2' 使第 10 回合起挑错僵尸 | [`df-161`](./deferred-details.md#df-161) |
| DF-162 | 待触发 | Story 1.18 | 平板横屏真机复验时（Story 1.19 的人工待验清单里那一项） | `src/styles/responsive.css` 横屏断点里战场高度与手牌行互相压（需真浏览器复核） | [`df-162`](./deferred-details.md#df-162) |
| DF-163 | 待触发 | Story 1.18 | 下次动 `asset-prefetch.ts` 的 URL 集合时 | `asset-prefetch.ts` 的 `imageUrlsOfUnit` 只收图片 URL，mp3 录音一个都不进缓存 | [`df-163`](./deferred-details.md#df-163) |
| DF-164 | 待触发 | Story 1.14 | 下次改 1.14 / 1.17 的 AC 措辞时 | 1.14 AC 的「组件可查询降级标志」被 ESLint 禁列挡在组件层之外 | [`df-164`](./deferred-details.md#df-164) |
| DF-165 | 待触发 | 未指派 | 下次改架构文档时 | `game-architecture.md` 日志前缀清单只列 4 个，代码实际用了 8 个 | [`df-165`](./deferred-details.md#df-165) |
| DF-166 | 待触发 | Story 1.17 | 下次给 `*ForTest` 补守卫时（与 E5 同批） | `asset-degradations.ts` 的第二个 `*ForTest` 导出未在账本登记 | [`df-166`](./deferred-details.md#df-166) |
| DF-167 | 待触发 | Story 2.4 | 下次动 `deck-slice.ts` 时 | `core/deck-slice.ts` 注释写「穷举实测 59047/2」，实算为 13563/45486 | [`df-167`](./deferred-details.md#df-167) |
| DF-168 | 待触发 | Story 1.12 | 与 E22 / E23 同批做（一次改干净同族的复制链） | `core/combat.ts` 形状对照表仍写「放置预览 = 半径 3 的圆」，与 FR38 冲突 | [`df-168`](./deferred-details.md#df-168) |
| DF-169 | 待触发 | Story 1.5 | 与 E21 / E23 同批做 | `core/turn.ts` 注释仍写「塔可以种在任意空格（GDD）」，实现只有 7 格 | [`df-169`](./deferred-details.md#df-169) |
| DF-170 | 待触发 | 未指派 | 与 E21 / E22 同批做 | `core/grid.ts` 与 `scripts/balance-sim.ts` 仍引用已删除的 `balance-scan.py` | [`df-170`](./deferred-details.md#df-170) |
| DF-171 | 待触发 | 未指派 | 下次改 `epics.md` 与 `game-architecture.md` 这两份文档时 | `epics.md` AR39 与 `game-architecture.md` 仍写「每回合记录一条」，1.17 已裁决逐 action 一条 | [`df-171`](./deferred-details.md#df-171) |
| DF-172 | 待触发 | Story 1.15 | 下次改 1.15 的 AC 措辞时 | `epics.md` Story 1.15 的写盘频次描述与 `core/effects.ts` 写盘点表相反 | [`df-172`](./deferred-details.md#df-172) |
| DF-173 | 待触发 | 未指派 | 下次改架构文档时 | `core/types.ts` 数据形状与 `game-architecture.md` 的模式 A / 模式 C 不符 | [`df-173`](./deferred-details.md#df-173) |
| DF-174 | 待触发 | 未指派 | 下次改 `epics.md` 的 AC 组时 | `SKIP_QUESTION` 整条机制在 core 里，`epics.md` 无任何一条 AC 授权 | [`df-174`](./deferred-details.md#df-174) |
| DF-175 | 待触发 | Story 1.4 / 2.3 | 下次改 1.4 的 AC 措辞时 | `epics.md` Story 1.4 的「档位 5-10 与 11-20 留空待 Epic 2」已过期（`core/balance.ts` 已填） | [`df-175`](./deferred-details.md#df-175) |
| DF-177 | 待触发 | 未指派 | 下次改架构文档时 | `game-architecture.md` 的 System Location Mapping 表漏了至少 16 个已交付模块 | [`df-177`](./deferred-details.md#df-177) |
| DF-178 | 待触发 | 未指派 | 下次动这 6 条时（不必专门跑一遍） | `deferred-work.md` 约 50 条行号指针有 6 条已漂移指不到内容 | [`df-178`](./deferred-details.md#df-178) |
| DF-182 | 待触发 | 未指派 | 与 DF-181（E34）一条同批做 | `scripts/check-execution-drift.py` 正则只扫 `1[-.]\d+`，抓不到实际漂移 | [`df-182`](./deferred-details.md#df-182) |
| DF-184 | 待触发 | 未指派 | 与 E12 同批做（都在平衡工具那条线上） | R-22「模拟器不得另起一份数值」无守卫，`balance-sim.ts` 可换本地副本仍全绿 | [`df-184`](./deferred-details.md#df-184) |
| DF-185 | 待触发 | 未指派 | 与 DF-186（E39）一条同批做 | G25 只扫 `src/components/quiz/` 三文件，组件可直 import `services/pronunciation` 不红 | [`df-185`](./deferred-details.md#df-185) |
| DF-186 | 待触发 | 未指派 | 与 DF-185（E38）一条同批做 | `effects-runner` 的 `case 'TTS'` 是空 `return`，朗读实际由组件 `watch` 触发 | [`df-186`](./deferred-details.md#df-186) |
| DF-187 | 待触发 | 未指派 | 下次动这两份文档时 | `docs/word-image-throughput.md` 与 `docs/art-direction.md` 有 4 处失效行号引用 | [`df-187`](./deferred-details.md#df-187) |
| DF-189 | 待触发 | 未指派 | 下次补规则守卫时，按这条表逐条销账 | 六条规则（R-14/R-08/R-09/R-05/R-74/R-13 等）今天合规但无机器守卫 | [`df-189`](./deferred-details.md#df-189) |
| DF-190 | 待触发 | Story 2.9 | Story 2.9 试玩验收时逐条人工过；或另建生僻词表 / 语义距离词典后补机器守卫 | 「语义近但字面远」的选项（如 `Thank you!` ~ `I am fine, thank you.`）字符级编辑距离抓不到 —— 属人工项 | [`df-190`](./deferred-details.md#df-190) |
| DF-191 | 待触发 | Story 1.19 | Story 1.19 试玩验收时人工复核视角；在出现「机器判视角」的手段前不得结清 | 单词卡**图片**选项的视角一致性机器判不了 —— `docs/art-direction.md` §5.4 台账是目视结论 | [`df-191`](./deferred-details.md#df-191) |
| DF-192 | 待触发 | 未指派 | 横屏布局单开 story 改 `src/styles/responsive.css` 的 2×2 规则时（该规则被守卫 G169 钉死） | 横屏下选项网格被强制 2 列 ⇒ 3 个选项排成 **2 + 1 两行**；本 story 不动横屏布局 | [`df-192`](./deferred-details.md#df-192) |
| DF-193 | 待裁决 | Story 2.9 | Story 2.9 试玩验收时决定 `NEAR_DUPLICATE_MAX_DISTANCE` 是否从 2 调高，或为 3–4 字母短词另立一条判据 | `scripts/validate-content.ts` 的 `NEAR_DUPLICATE_MAX_DISTANCE = 2` 会误杀「字面近、语义远」的 3–4 字母短词（如 `red` ~ `bed`） | [`df-193`](./deferred-details.md#df-193) |
| DF-195 | 待裁决 | Story 1.19 / Story 2.9 | Story 1.19 或 2.9 试玩验收时决定是否打乱选项顺序（以及是否把「正确项位置」纳入内容校验）｜📎 **2026-10-23**：Story 1.19 的试玩模板已加「作答位置分布」前置栏 ⇒ 真机试玩会带回位置分布，届时据此裁决 | `src/content/units/unit-01.json` 全部 37 张卡的正确项都在第 0 位 ⇒「永远点最左边」100% 命中 | [`df-195`](./deferred-details.md#df-195) |
| DF-199 | 待触发 | Story 2.6 | Story 2.6 开工前，先枚举该单元在 `docs/card-distribution.md` §5.1.1 下的可行 N（可行集可能为空），再定词条数 | `docs/card-distribution.md` §5.1.1 的可行性对 N 敏感：实测单元 2 的 N=37 与 N=41 可行集为空、单元 3 的 N=36/37 也为空 | [`df-199`](./deferred-details.md#df-199) |
| DF-200 | 待裁决 | Story 2.9 | Story 2.9 试玩验收时决定「跳过的词（词图加载失败）在单元推进后怎么办」：是否允许带缺口推进、要不要补一轮小测 | 推进判据改成「本单元全部已掌握」后，一张持续加载失败的词图会让该单元永远学不完（孩子卡在 N-1/N） | [`df-200`](./deferred-details.md#df-200) |
| DF-201 | 待触发 | Story 2.5 – 2.8 | 用户确认课本版本（一起版 / 旧本地版）+ 裁决「游戏一关 ↔ 教材 Unit」映射后，按 `docs/textbook-oxford-shanghai/` 的词表逐单元重录 `src/content/units/unit-XX.json` | 现有 68 个词条是 Story 1.3 / 2.5 **自建**的；教材词表已于 2026-10-23 从网络抓取入库（24 单元 / 97 词），但**版本未确认**，不能直接当事实用 | [`df-201`](./deferred-details.md#df-201) |
| DF-202 | 待裁决 | Story 2.9 | Story 2.9 试玩验收前（或「最后一个单元」被录满时）设计「全书完成」画面；**至少**要有一条**不依赖新画面**的出路（提示「你已经读完所有已解锁的单元」＋ 不再把同一张通关卡推回给孩子） | 读完**最后一个已录入单元**后没有完成画面 —— `finished` 只换按钮字、动作仍是 `backToStart()`（不动 `state.value`）⇒ `回开始 → 开始游戏` 回到**同一张通关卡**，是死循环 | [`df-202`](./deferred-details.md#df-202) |
| DF-203 | 待裁决 | Story 2.9 | Story 2.9 试玩验收时（或内容批次 3 开工前）裁决「回应卡的正确项该怎么选」这条**内容语义标准**；DF-019 归并到本条 | 回应卡的「正确项」**没有标准**，只有逐张裁决 —— 单元 1 的 `u1-s-thank-you` 题面「Thank you!」的正确项是「Goodbye」，单元 2 的 `u2-goodbye` 的正确项也是「Goodbye」 | [`df-203`](./deferred-details.md#df-203) |
| DF-204 | 待触发 | Story 2.6 | Story 2.6 开工前（或 `food` 档的成员数再涨一倍时）用**全部**真实成员重算 `food` 档的区间；`scene` 档等 Story 2.6 有真实成员再定 | `food` 档的区间 **60%–80%** 只由 **2 个**样本定出来（现在有 6 个成员，实测跨度 62.1%–79.7%），`scene` 档则**一个真实成员都没有** | [`df-204`](./deferred-details.md#df-204) |
| DF-205 | 待触发 | Story 2.6 | Story 2.6 开工时把「48px 读成了什么」补进 `docs/word-image-lab/versions-*.jsonl` 的每一条记录，并把本批 30 张按同一格式补齐 | 单元 2 的 **30 张**词图**没有逐版的 48px 判读留痕** —— `versions-u2.jsonl` 每张只有**一行最终态**，中间版本与判读依据一个字都没留 | [`df-205`](./deferred-details.md#df-205) |
| DF-207 | 待触发 | Story 2.6 | 新 `N` 确定后（教材版一关 3–25 条，均值约 14），重定 `docs/card-distribution.md` 的**首锚点与末锚点**并同步 `src/content/distribution.ts` | 卡型占比的两个锚点按 37 条/单元定（首锚点 30/1/6 = 81.08%），新实测单词卡份额只有 **28–46%** ⇒ 锚点全部失效 | [`df-207`](./deferred-details.md#df-207) |
| DF-208 | 待触发 | Story 2.6 | 关卡数扩到 24 后，给 `docs/option-count.md` 的档位表**补 21–24 关的档**，并按新 `N` 重算档 1 的选项数 | 选项数档位表只覆盖 1..20 关，**21–24 关无档可用**；档 1 = 2/3/3 又是按「一关 30 词」定的 | [`df-208`](./deferred-details.md#df-208) |
| DF-209 | 待裁决 | Story 1.19 | Story 1.19 真机试玩（Task 3）在**浏览器标签页**（非 PWA 全屏）模式下确认 768×1024 是否真裁；确认裁切 ⇒ 下一次动选项卡尺寸时裁决「选项卡高度是否受可用高度约束」 | `OptionCard.vue` 的 `.option-card__image` 是 `aspect-ratio: 1/1` ⇒ 选项卡高由宽度定 ⇒ 浏览器标签页（内视口矮 87px）下 768×1024 题卡超出视口 21px | [`df-209`](./deferred-details.md#df-209) |
| DF-210 | 待触发 | Story 2.6 | 教材版每关 `N` 确定后（DF-201 版本确认），按 24 关 / 新 `N` 重算 `docs/word-image-throughput.md` §8.1.3 与 §8.4 的参数表与决策表 | 该文档 §8 的 16–20 单元 / 480–600 张 / 66–133 h 全是旧口径；新口径下「口径 B 远超投入」这条结论**不成立** | [`df-210`](./deferred-details.md#df-210) |
| DF-212 | 待触发 | Story 1.18 | Story 1.18 真机字号校准时，把 `src/styles/tokens.css` 字体阶梯的推导数按今天的实测容器宽 **736px** 重算（4 个选项 ⇒ 单卡 175px、内容盒 151px ⇒ 硬上限 28.8px、余量 23.6%） | 字体阶梯仍按 Story 1.11 的旧基线 768 / 183 / 159 推导；`--text-option: 22px` 取值**仍成立**，过期的是**推导数**与「余量 27.7%」 | [`df-212`](./deferred-details.md#df-212) |
| DF-213 | 待裁决 | 未指派 | 有人裁决辅通路四个常量的「现场调」归属（候选：Story 1.19 试玩校准 / 某个尚未存在的 story），并把 5 个文件里的 10 处口径一次改齐 | `pronunciation.ts` 的四个 rate/pitch 常量在 5 个文件 10 处写着两个归属（Epic 1 现场调 / Epic 3 现场调） | [`df-213`](./deferred-details.md#df-213) |
| DF-214 | 待排期 | 未指派 | 下次动 `epics.md` 的 FR4 段或 `game-architecture.md` 的 Configuration 表时，先回读 Story 3.4 的 rev 3 note 与本条详情，核对那三处更正仍在 | Story 3.4 由 `[DS]` 直接更正了 `game-architecture.md` 的 `scripts/gen-voice.ts` 路径与「录音生成参数」字段列表，以及 `epics.md` FR4 的重复行 | [`df-214`](./deferred-details.md#df-214) |
| DF-215 | 待触发 | Story 1.19 | Story 1.19 真机试玩那一批（与 Story 3.4 裁决 A 同场）里，把「音效 / BGM / 预生成录音」三者的响度配比问出结论并记进试玩记录 | GDD 的「音量 / 响度配比是否适合 4–8 岁孩子」至今无归属 story、无任何结论记录 | [`df-215`](./deferred-details.md#df-215) |
| DF-216 | 待裁决 | 未指派 | 人裁决竖屏建造相位的取舍（缩战场 / 缩小题卡 / 允许滚动）后写进新 story 实施；实施后重量 16 个矩阵视口 × 两个相位，确认竖屏建造相位的「手牌卡在视口内」为是 | 竖屏 768×1024 的建造相位，`HandDeck.vue` 的手牌区整体落在折叠线以下 142px（Story 3.5 `[DS]` 实测），孩子够不到卡 | [`df-216`](./deferred-details.md#df-216) |

## 新增一条

1. 在 `deferred-details.md` 里加一个 `## DF-NNN` 小节（**ID 单调递增、永不复用**），
   写明状态 / 归属 / 恢复条件 / 一句话，并附上原始论证。
2. 在本文件的「条目」表里加一行，指向该小节的锚点。

| ID | 状态 | 归属 | 恢复条件 | 一句话 | 详情 |
|----|------|------|---------|--------|------|
| DF-NNN | 待裁决 \| 待触发 \| 待排期 | Story X.Y | 可判定的一句话 | ≤ 60 字，必须点名文件/函数 | [`df-nnn`](./deferred-details.md#df-nnn) |

## 条目被结清时

当场修掉、或前提被推翻 ⇒ **三处一起动**，缺一处守卫就会红：

1. 原文与结清依据移入 `_bmad-output/archive/deferred/` 对应段，
   并在该段的「分诊结论」小节登记结论与依据原句
   （**DF-ID 照旧写上** —— 编号不回收，守卫 G-b 靠它守住「永不复用」）；
2. 本表删掉那一行；
3. `deferred-details.md` 里删掉那个 `## DF-NNN` 小节
   （否则详情层会留下一个账本里没有的孤儿，守卫 G-h 会红）。

⚠️ 归档是**收尾动作的一部分**，不另开一次专门归档（见 `docs/rules/process.md` R-43）；
归档完成后必须跑**全量**测试 —— 归档会触发**外来守卫**。

