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

**守卫** ⚠️ **部分** —— 音频那一半已落守卫，**TTS 那一半还没有**。

⚠️ **📎 2026-10-17 改判据留痕（R-57）**：这一栏原写「（TTS 属 Story 1.16）」，
而 Story 1.16 的 `[CS]` **裁决 6 已把归属推翻** —— `epics.md` 里 Story 1.16 的 AC
**零 TTS 字样**，按 R-32（以 AC 正文为准）1.16 无权做这件事，而 `epics.md` 里
也没有任何 story 承担它 ⇒ 归属是**无归属**，需 `/gds-correct-course` 指派。
**判据从「有守卫 / 没守卫」变成了「有守卫 / 无归属且没守卫」** ——
后半句比前半句更值得盯：一个没有归属的缺口不会有人主动去补。

- **G60**（`tests/scaffold/effects-boundary.test.ts`）：组件与视图里不出现播放函数名。
- **G70**（同文件）：组件与视图不 import `services/audio` 的播放函数。含一条**真跑 `Linter.verify`** 的反向验证 —— 「规则没触发」与「文件没解析」长得一模一样，只看规则对象会假绿。
- **G61**：`runEffectsFromStore` 的调用行号必须**小于** `state.value = next`（AC-E2）。
- **G86**（Story 1.15 补，R-04 的**存档**那一半）：逐个**调用点**判定 —— `writeSave` 只许在 `src/app/effects-runner.ts`、`readSave` 只许在 `src/app/store.ts`、`clearSave` 必须**零**调用点。变异 M100（在 `store.ts` 里插一处 `clearSave()`）→ **1 红**，消息直接点名文件与函数。⚠️ 刻意**按调用点判而不是按文件判**：按文件判就得把 `services/save.ts` 硬编码进例外名单，名单一长，守卫就开始靠自觉活着。
  📎 **1.17 留痕（R-57）**：原文写「`clearSave` 今天必须零调用点（**1.17 才用**）」。`1.17 [CS]` 裁决 8 据此计划把它改判为「调用点只许在 `src/components/debug/` 下、且 DEV 门控」—— **`[DS]` 未改判**：AC-E3 逐字要求「重试写入」调 `writeSave`、**不许**调 `clearSave`（「清档与重试是两件事」，调试面板误清玩家存档不可逆）⇒ 1.17 根本没造出 `clearSave` 调用点，改判的前提不成立。判据**一字未动**，且它比计划中的改判更强（改判会允许 debug 组件清档）。只更正了那句会误导后人的括注。

**首现** Story 1-1

---

### R-05 动画时长写在 CSS，不写在 TS

**规则** 动效只走「状态 → class → CSS 过渡」。禁止 JS 补间、`setInterval`、`requestAnimationFrame` 逐帧改样式。

**依据** 同一条过渡散在 TS 里就失去了单一来源，CSS 变量（如 `--dur-fast`）改一处即可全局生效。

**守卫** ✅ **两侧都守（2026-10-26 夜补齐）** ——
- **`.vue` 侧**：**G38**（`tests/components/hand-build.test.ts`）走共享判据 `animationViolations(allVueSources(root))` ⇒ 扫的是 `src/` 下**全部** `.vue`（**G315** 另外钉住「扫描面不许缩回 4 个文件的老名单」）。
- **`.ts` 侧**：**G333**（`tests/scaffold/animation-timer-boundary.test.ts`）用 **TypeScript AST** 扫 `src/` 下全部 `.ts` 的**定时器调用**（`setTimeout` / `setInterval` / `requestAnimationFrame` / `cancelAnimationFrame` / `requestIdleCallback`）、**Web Animations**（`el.animate(...)`）与**逐帧改样式**（`el.style.x = ...`）。判据认「**调用 / 赋值**」而不是「某个词」⇒ 注释与字符串里的字面量天然不算（R-52）。
- ⚠️ **例外清单**：`.ts` 侧唯一的两处定时器在 `src/services/pronunciation.ts`（TTS **预热超时**与**分块推进**）—— 那是**音频时序，不是动效** ⇒ 逐字锚点豁免；守卫会核「每条**恰好命中一次**」（多了 = 锚点被扩大，少了 = 已过期）与「前提常量仍在」。
- ⚠️ **剩下的口子**：`.vue` 侧的共享判据只禁**定时器**与**字面量毫秒**，**不**禁 `el.style.x =` 与 `el.animate(...)`（那两项目前只有 `.ts` 侧守）。

**首现** Story 1-1（硬约束 5）

---

### R-06 进度与对局是两套独立持久化

**规则** `SaveFile { progress, currentGame }`。战场每局清空，进度只增不减。

**依据** 混在一起会在局末丢掉「21/60」—— 对局结束时整份存档被清，进度跟着一起没了。

**守卫** ✅ **G78** —— `tests/services/save.test.ts`（「局末写盘后 `currentGame === null` 且 `progress` 逐字不变」，按 `JSON.stringify` 比对而**不是** `toMatchObject`，让「少一个键」照样红的宽松断言无处藏）。另有 **G74**（`writeSave` 原样搬运两个键）与 `tests/app/save-integration.test.ts`（`store → runner` 那一段的**接线**，见下方「实测」）。

⚠️ **这段接线差点全绿地漏掉**（2026-10-17 实测）：把 `effects-runner.ts` 的实参换成一份空的 progress，**1460 条测试 0 红** —— G78 守的是 `writeSave` 的**契约**，够不着**调用方传了谁**。补 `save-integration.test.ts` 后同一变异随即变红；`applyAction` 那一处同样 0 红过 1464 条，补测试后变红。⇒ 判据只钉在纯函数上时，跨模块传错对象是本仓库最贵的一种漏网。

📎 **2026-10-21 删掉这里的红数**（Story 1.15 `[CR]`）：本条原先写「补 `save-integration.test.ts` 后同一变异 **3 红**」，而 story 1.15 的变异表把它记成 **5 红** —— **同一个变异、同一个仓库、两个数**。两条都不是当时随手编的，是各自写下的实测值，所以**没法靠重跑判定谁对**：红数随套件增长而漂移，今天重跑得到的第三个数字**不能**用来裁决 2026-10-17 的那两个。

⇒ 按 R-37（一条规则只写一次）**不再复述那个数**：事实源是 story 1.15 文档里的变异表（M85–M100 一节），本条只保留可复现的定性结论「补测试前 0 红 / 补测试后变红」与它的教训。复述一个会漂移的数字，就是造下一条复制链。

📎 **2026-10-17 第二次同型命中**（Story 1.16 变异 M110）：`applyAction` 第 3 步传
`progress.value`（**本次结算之前**的旧值）而不是结算后的那份，实测 **4 红** ——
但**前提是 G96 已改成断言「每答对一题，盘上立刻就有这个词」**。
Story 1.15 的 G96 写的是「推进确实落盘了」，那条判据在**整局结束之后**看，
而这一处滞后**只在同一次 dispatch 内可见**（下一次 dispatch 会把它补上）⇒
旧写法下 M110 实测 0 红。⇒ **同一个洞的第二次命中，两次都不是靠「加一条断言」
抓到的，是靠「把断言挪到能看见它的那一层」。**
「判据钉在纯函数上」只是表象，更准确的形态是：
**断言的观察点决定了它能看见哪一种滞后。**

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

**守卫** ⚠️ **部分** ——
① `tests/scaffold/core-boundary.test.ts` 守 **core 那一端**（core 不得 import vue 与 app/services/components）—— 它求值 **ESLint 自己的配置**，守的是「**规则还在**」。
② **G331**（`tests/scaffold/layer-direction.test.ts`）守**每一层的反向依赖** —— core / content / services / app / components / views 六层的「不许 import 哪一层」逐条钉住；判据落在**源码**（TypeScript 的 AST，静态 / 动态 / 重导出 / `require` 四种形态一次收齐），守的是「**代码真的没越界**」。与 ① **两道各管一半**（① 盯配置、② 盯代码）。
⚠️ **「跨层直连」那半仍不守**：`components → services`（`asset-url` / `asset-degradations` / `sw-registration` / `pronunciation-status`）与 `components → core`（14 处）**现状合法**（ESLint 只禁 `components → core/balance` 那一条）⇒ 要连「跨层」一起守，得先改那 20 处 import，那是**另一个决定**（DF-189 的销账进度表里记着这一格）。

**首现** Story 1.2

---

### R-09 `core/` 只走 barrel 唯一出口

**规则** 外部引用 `core/` 的成员一律经 `src/core/index.ts`，不得深路径 import 内部模块。

**依据** 深路径 import 绕过 barrel，将来重构内部结构时无法统一收口。

**守卫** ✅ **（`src/` 与 `scripts/` 侧）** —— 守卫 **G332**（`tests/scaffold/core-barrel-exit.test.ts`）：`src/`（`src/core/` **之外**）与 `scripts/` 下**没有绕过 barrel 的深路径 import**；判据用 **TypeScript 的 AST**（静态 / 动态 / 重导出 / `require` 四种形态一次收齐）。
⚠️ **测试侧是明示例外** —— `tests/core/placeholder.test.ts` 的文件头逐字写着「深路径 import 是本仓库既有测试的写法，零守卫强制」⇒ `tests/` **不判**（G332 的判据范围里没有它）。

**首现** Story 1.5

---

### R-10 `content/` 不得 import `core/`

**规则** 内容数据层单向，不依赖战斗内核。

**依据** 内容要能在不加载战斗规则的前提下独立校验（`validate:content` 正是如此）。

**守卫** `tests/content/content-boundary.test.ts` —— ESLint 的 `no-restricted-imports`（⚠️ 它**只认静态 import 形态**，动态 `import()` 看不见）+ **G304**（同一文件里用 **TypeScript 的 AST** 扫源码，**静态 / 动态 / 重导出 / `require` 四种形态**一次收齐；注释与字符串里的字面量**不算**导入）。

**首现** Story 1.6

---

### R-11 图片资源不进 JS bundle

**规则** 词图 / 塔图一律以 `<img src>` 引用，JSON 里只存路径字符串，不得内嵌 data URI 或 base64。

**依据** 全书词图若进 bundle，首屏 JS 体积不可接受。

**守卫** `tests/content/unit-01.test.ts`（JSON 里只有路径字符串）、`tests/assets/word-image-url-guard.test.ts`（运行期 `<img src>`）

**首现** Story 1.7

---

### R-12 既有 `--color-*` 的**值**不得改

**规则** 已定稿的 CSS 变量**值**一个都不许改。需要新颜色时新增变量；新颜色必须通过 `palette.test.ts` 的 WCAG 对比度实算。

⚠️ **注意这条禁的是「值」不是「条数」。** 条数会随新 token 增长，写死条数本身就会变成新的过时约束 —— 本仓库已经因此出过事故：`1-10` 写「12 个」、`1-11`/`1-12`/`1-13` 写「14 个」，而 1.12 新增 `--color-overlay-inert` 后**实际是 15 个**。

**依据** 视觉一致性 + 已交付的词图/SVG 按当时的字面着色，改值会让整套资产与 UI 脱节。

**守卫** `tests/scaffold/color-token-values.test.ts`（**G302** —— 逐个 token 比对**值**与快照 `tests/fixtures/color-tokens.ts`；新增 token 未登记 / 既有值被改 / token 被删，三种都红）。⚠️ `tests/content/palette.test.ts` 只断言 token **存在**与对比度；`asset-geometry.test.ts` 的 G3 只断言 SVG 里的 hex **等于 tokens.css 当期字面值**（一致性，不是冻结）—— 这两条**拦不住改值**，拦值的是 G302。

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

**守卫** ✅ **两半都有** ——
① **最硬的一半**：`tests/scaffold/save-boundary.test.ts`（R-14 补卫）—— `src/core/**` 逐文件**零 `console.`** 出现（`readdirSync` 扫整层，不是只看某几个文件；匹配前先 `stripComments`，否则注释里的 `console` 字样会误报）。
② **另一半**：`tests/scaffold/log-prefix-boundary.test.ts`（守卫 **G323**）—— `src/services/**` / `src/app/**` / `src/components/**` 里每一条 `console.*` 都必须**带 `[模块前缀]`**（唯一例外走**例外清单**，且守卫会去核那个**生产者**仍带前缀 ⇒ 例外不会悄悄过期），且**不得落在** `requestAnimationFrame(...)` / `setInterval(...)` 的回调里。

📎 **2026-10-26 补上第 ② 条**（结清 **DF-049**）—— 此前这里逐字写着「⚠️ **`services/` 与 `app/` 的那部分无守卫**」：
那时 `src/services/save.ts` 的四条日志只是**人肉守**的（`tests/services/save.test.ts` 的 **G85** 逐字断言 INFO 与四条 WARN 都以 `[save]` 开头，变异 M98 改前缀 → **3 红**），那是**存档这一个模块**的判据；如今 `[audio]` / `[tts]` / `[sw]` / `[prefetch]` / `[pronunciation]` / `[content]` 六个前缀由 **G323** 统一守。
⚠️ **实测**：带前缀的服务早就有 **6 个**（DF-049 的触发条件「累计到第三个」**早已成立**），此前只是没人去建那条通用守卫。
⚠️ **变异验证**：M384 把 `src/services/audio.ts` 的前缀改成 `[Audio]` ⇒ **2 红**；M385 把那条日志塞进 `requestAnimationFrame` 回调 ⇒ **1 红**（两次都已复原，`git diff --stat` 为空）。

**首现** Story 1.4

---

### R-15 战场列轨的轨道形态必须是 `minmax(0, 1fr)`

**规则** 战场网格（`src/components/battle/BattleField.vue` 的 `.battle-grid`）的列定义必须写成 `repeat(<N>, minmax(0, 1fr))`：裸 `1fr` 会把 `gap` 的一半算进每条列轨的最小宽度，`<N>` 条列轨合计多出 `<N> × (gap / 2)` px ⇒ 容器横向溢出。**分工**：**G14 管「重复次数 N 与 `src/core/grid.ts` 的 `COLS` 同源」，G133 管「轨道形态是 `minmax(0, 1fr)`」** —— 两条各管一半，别指望一条覆盖两半。

**依据** 机制：`1fr` 等价于 `minmax(auto, 1fr)`，而 `auto` 下限取内容的**最小贡献尺寸**，对 grid item 来说就是 `gap` 的那一半 ⇒ 每条列轨都比「容器宽 − (N−1) 条 gap」能分到的宽度多要一点，N 条加起来就把容器撑破。Story 1.18 / AC-D4 已把裸 `1fr` 改成 `minmax(0, 1fr)`（下限钉成 0 ⇒ `gap` 不再进入列宽计算，容器宽减去 N−1 条 gap 恰好被 N 条列轨分完）。

⚠️ **两个数字不是一回事，别互相替**：`<N> × (gap / 2)` 是**机制推导**出来的「多出来的宽度之和」（`--space-grid-gap` 现值 4px ⇒ 9 条合计 18px，**随 token 变**）；**3px** 是 Story 1.10 在**当时更窄的容器**上**观测到**的溢出量（容器 453px 而轨道合计 456px）—— `aspect-ratio` 与 `content-box` 的交互让它取到别的值。**结论与数字不管，机制是同一条。**

⚠️ **不能靠 `overflow: hidden` 盖掉溢出**：那会把最后一条列轨（第 9 列，入场格所在列）切掉一部分，而它正是僵尸入场的那一列。

**守卫** ✅ **两半都有** ——
① **G133**（`tests/components/portrait-layout.test.ts`）逐字断言 `grid-template-columns` 的值 === `repeat(${COLS}, minmax(0, 1fr))`；
② **G14**（`tests/components/battle-field.test.ts`）断言 `repeat()` 的 N === `COLS`、`aspect-ratio` 的分母 === `ROWS`（变异 M42）。

**首现** Story 1.18（AC-D4）

---

### R-16 `content/` 零 DOM

**规则** `src/content/` 下不得出现任何浏览器 API（`window` / `document` / `localStorage` / `speechSynthesis` / `navigator`）—— 内容层是「录入 + 校验」的数据层，不是浏览器层。

**依据** 由 `tsconfig.content.json` 的 `lib` 不含 `DOM` 强制 —— 写 `window` 会**编译报错**（TS2304 `Cannot find name 'window'`），不是靠自觉。配套 ESLint `no-restricted-globals` 双拦。
⚠️ **2026-10-26 之前这一层只有 ESLint 一道**（DF-020）：内容层落在 `tsconfig.app.json`（有 DOM lib）里，R-01 那条「零 DOM」红线**管不到它** ⇒ 改了 eslint 配置或漏掉某个文件，边界就**静默**消失。现在两层都在。

**守卫** `tests/scaffold/content-tsconfig-boundary.test.ts` —— 守卫 **G330**。⚠️ 它的主判据是**行为式**的：用 **TypeScript 自己的类型检查器**问「`window` 在内容层源码的位置上**看得见吗**」，看不见才算守住（纯字符串判据对「把 `lib` 整行删掉 ⇒ TS 退回含 DOM 的默认 lib」这一种退化**完全失明**）；另有一条**反向自测**证明该判据对装了 DOM 的项目会答「看得见」。

**首现** 2026-10-26 夜（DF-020 结清时补入）
