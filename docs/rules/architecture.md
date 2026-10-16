# 架构硬约束

> 这些是 `[GA]` 定案的架构决策。**它们不是建议，是编译期或评审期的硬边界。**
> 每条规则的正文只在本文件出现一次 —— 其他文档（CLAUDE.md、story 文档、Dev Notes）
> 一律只写 R-ID 引用。发现正文被抄到别处，那是 bug，按 [R-37](process.md) 处理。

---

### R-01 `core/` 零 DOM、零 Vue

**规则** `src/core/` 下不得出现任何浏览器 API（`window` / `document` / `localStorage` / `speechSynthesis` / `AudioContext`）或 Vue 符号。

**依据** 由 `tsconfig.core.json` 的 `lib` 不含 `DOM` 强制 —— 写 `window` 会**编译报错**，不是靠自觉。配套 ESLint `no-restricted-globals` 双拦。

**守卫** `tests/scaffold/core-boundary.test.ts` —— 「core/ 禁掉 DOM 全局：window / document / localStorage / speechSynthesis 都在名单里」

**首现** Story 1-1

---

### R-02 组件内不得出现第二份战斗规则判定

**规则** 组件只读 state 或 dispatch action。「答对了没」「这格能不能建」这类判据**只有一个来源：`core/`**。组件里写第二份实现 = 架构错误，哪怕当下行为一致。

**依据** 1.10 在 `grid.ts` 留过一句「两处判据迟早分叉」的警告；1.12 的处置是把 UI 判据与 reducer 判据**收口为调用同一个 `buildBlockedReason`**，从此结构上不可能分叉。

**守卫** `tests/components/hand-build.test.ts`（G33b「真实组件源码通过 G33b，白名单只有 ZOMBIE_ROW」）、`tests/components/quiz-card.test.ts`（G21「组件里不自己判定对错」）

**首现** Story 1-1

---

### R-03 战斗数值只读 `tower.towerType`，永远不读 `wordId`

**规则** 塔的伤害 / 射速 / 射程 / 减速一律取自 `towerType` 字段。

**依据** 否则同一塔型因绑定词不同而表现不同，`balance-sim` 的全部平衡验证失效 —— 数值会被词条内容污染。

**守卫** `tests/core/combat.test.ts` —— 「同 `towerType`、不同 `wordId` 的两座塔，计算结果完全相同」

**首现** Story 1-4

---

### R-04 副作用只在 `app/effects-runner.ts`

**规则** 音效 / TTS 播放等副作用**只允许**在 `app/effects-runner.ts` 执行。组件内禁止 `watch` 后自行播音效。

**依据** `[GA]` 定案：副作用散落会导致同一事件在多个组件路径下被播多次，且无法集中降级。

**守卫** ⚠️ **部分** —— 音频那一半已落守卫，**TTS 那一半还没有**（TTS 属 Story 1.16）。

- **G60**（`tests/scaffold/effects-boundary.test.ts`）：组件与视图里不出现播放函数名。
- **G70**（同文件）：组件与视图不 import `services/audio` 的播放函数。含一条**真跑 `Linter.verify`** 的反向验证 —— 「规则没触发」与「文件没解析」长得一模一样，只看规则对象会假绿。
- **G61**：`runEffectsFromStore` 的调用行号必须**小于** `state.value = next`（AC-E2）。
- **G86**（Story 1.15 补，R-04 的**存档**那一半）：逐个**调用点**判定 —— `writeSave` 只许在 `src/app/effects-runner.ts`、`readSave` 只许在 `src/app/store.ts`、`clearSave` 今天必须**零**调用点（1.17 才用）。变异 M100（在 `store.ts` 里插一处 `clearSave()`）→ **1 红**，消息直接点名文件与函数。⚠️ 刻意**按调用点判而不是按文件判**：按文件判就得把 `services/save.ts` 硬编码进例外名单，名单一长，守卫就开始靠自觉活着。

**首现** Story 1-1

---

### R-05 动画时长写在 CSS，不写在 TS

**规则** 动效只走「状态 → class → CSS 过渡」。禁止 JS 补间、`setInterval`、`requestAnimationFrame` 逐帧改样式。

**依据** 同一条过渡散在 TS 里就失去了单一来源，CSS 变量（如 `--dur-fast`）改一处即可全局生效。

**守卫** ⚠️ **部分** —— `tests/components/hand-build.test.ts` 对 1.12 新增组件有源码级判据，但**不是全局守卫**。

**首现** Story 1-1（硬约束 5）

---

### R-06 进度与对局是两套独立持久化

**规则** `SaveFile { progress, currentGame }`。战场每局清空，进度只增不减。

**依据** 混在一起会在局末丢掉「21/60」—— 对局结束时整份存档被清，进度跟着一起没了。

**守卫** ✅ **G78** —— `tests/services/save.test.ts`（「局末写盘后 `currentGame === null` 且 `progress` 逐字不变」，按 `JSON.stringify` 比对而**不是** `toMatchObject`，让「少一个键」照样红的宽松断言无处藏）。另有 **G74**（`writeSave` 原样搬运两个键）与 `tests/app/save-integration.test.ts`（`store → runner` 那一段的**接线**，见下方「实测」）。

⚠️ **这段接线差点全绿地漏掉**（2026-10-17 实测）：把 `effects-runner.ts` 的实参换成一份空的 progress，**1460 条测试 0 红** —— G78 守的是 `writeSave` 的**契约**，够不着**调用方传了谁**。补 `save-integration.test.ts` 后同一变异 **3 红**；`applyAction` 那一处同样 0 红过 1464 条，补测试后 **2 红**。⇒ 判据只钉在纯函数上时，跨模块传错对象是本仓库最贵的一种漏网。

**首现** Story 1-1

---

### R-07 范围塔 = 同行 3 格（左 1 / 自身 / 右 1）

**规则** 范围塔的覆盖是**同行三个格子**，不是半径 2 的圆（那是 5 格，严重超模）。

**依据** GDD 与 `epics.md` 曾长期写「圆形覆盖」，而 `turn.ts` 写死 `row === ZOMBIE_ROW` 使相邻行塔整局不开火 —— 三方文档与实现正面冲突。**权威口径：同行单向窗口，非僵尸行整局不开火**（GDD rev 5 已按此消歧）。

**守卫** `tests/core/combat.test.ts`（「绝不是半径 2 的圆 —— 那在同行横跨 5 格」）、`tests/core/turn.test.ts`（「范围塔不溅射到 3 格条带之外」）

**首现** Story 1-1

---

### R-08 依赖方向只能向下：`components → app → services → core`

**规则** 不得反向依赖或跨层直连。

**依据** `[GA]` 的模块分层。`core/` 不知道上层存在，所以它才可能被复用和被单独测试。

**守卫** ⚠️ **部分** —— `tests/scaffold/core-boundary.test.ts` 只守了 core 那一端（core 不得 import vue 与 app/services/components）。**components→app→services→core 的次序与跨层反向无守卫**，`eslint.config.js` 里也没有对应块。

**首现** Story 1.2

---

### R-09 `core/` 只走 barrel 唯一出口

**规则** 外部引用 `core/` 的成员一律经 `src/core/index.ts`，不得深路径 import 内部模块。

**依据** 深路径 import 绕过 barrel，将来重构内部结构时无法统一收口。

**守卫** ⚠️ **无守卫** —— 且 `tests/core/placeholder.test.ts` 的文件头明确写着「深路径 import 是本仓库既有测试的写法，零守卫强制」。**测试侧是明示例外**；`src/` 侧的约束目前只靠约定。

**首现** Story 1.5

---

### R-10 `content/` 不得 import `core/`

**规则** 内容数据层单向，不依赖战斗内核。

**依据** 内容要能在不加载战斗规则的前提下独立校验（`validate:content` 正是如此）。

**守卫** `tests/content/content-boundary.test.ts`

**首现** Story 1.6

---

### R-11 图片资源不进 JS bundle

**规则** 词图 / 塔图一律以 `<img src>` 引用，JSON 里只存路径字符串，不得内嵌 data URI 或 base64。

**依据** 200–400 张插画若进 bundle，首屏 JS 体积不可接受。

**守卫** `tests/content/unit-01.test.ts`（JSON 里只有路径字符串）、`tests/assets/word-image-url-guard.test.ts`（运行期 `<img src>`）

**首现** Story 1.7

---

### R-12 既有 `--color-*` 的**值**不得改

**规则** 已定稿的 CSS 变量**值**一个都不许改。需要新颜色时新增变量；新颜色必须通过 `palette.test.ts` 的 WCAG 对比度实算。

⚠️ **注意这条禁的是「值」不是「条数」。** 条数会随新 token 增长，写死条数本身就会变成新的过时约束 —— 本仓库已经因此出过事故：`1-10` 写「12 个」、`1-11`/`1-12`/`1-13` 写「14 个」，而 1.12 新增 `--color-overlay-inert` 后**实际是 15 个**。

**依据** 视觉一致性 + 已交付的词图/SVG 按当时的字面着色，改值会让整套资产与 UI 脱节。

**守卫** ⚠️ **无守卫** —— `tests/content/palette.test.ts` 只断言 token **存在**与对比度；`asset-geometry.test.ts` 的 G3 只断言 SVG 里的 hex **等于 tokens.css 当期字面值**（一致性，不是冻结）。**即：改了 tokens.css 的值，G3 会跟着一起绿，拦不住。**

**首现** Story 1.8

---

### R-13 标识符全英文、注释全中文

**规则** 变量 / 函数 / 类型 / 文件名一律英文；注释一律中文（SVG 内的注释也是，见 [content.md](content.md)）。

**依据** 面向中文母语者的团队协作约定，降低读代码的认知负担。

**守卫** ⚠️ **无守卫**

**首现** Story 1.2

---

### R-14 渲染路径禁止打日志

**规则** 渲染与战斗主路径上不得有 `console.*`。确需日志时带模块前缀，且不在逐帧路径。

**依据** 逐帧日志会拖垮低端平板的性能，而这类问题在开发机上看不出来。

**守卫** ⚠️ **部分** —— `tests/scaffold/save-boundary.test.ts`（R-14 补卫）守住最硬的一半：`src/core/**` 逐文件**零 `console.`** 出现（`readdirSync` 扫整层，不是只看某几个文件；匹配前先 `stripComments`，否则注释里的 `console` 字样会误报）。

⚠️ **`services/` 与 `app/` 的那部分无守卫** —— R-14 允许那里「带模块前缀且不在逐帧路径」，判据（「前缀合规」+「不在逐帧」）放不进「零出现」这一条。`src/services/save.ts` 的四条日志目前是**人肉守**的：`tests/services/save.test.ts` 的 **G85** 逐字断言 INFO 与四条 WARN 都以 `[save]` 开头（变异 M98 改前缀 → **3 红**），但那是**存档这一个模块**的判据，不覆盖 R-14 全域。

**首现** Story 1.4
