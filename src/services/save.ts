/**
 * 存档服务 —— `localStorage` 的序列化与恢复（Story 1.15 / 决策 5）。
 *
 * ── 它为什么住在 `services/` 而不是 `core/` ─────────────────────────────────
 * `src/core/` 零 DOM 由 `tsconfig.core.json` 的 `lib` 不含 `DOM` **在编译期强制** ——
 * 在 `core/` 里写 `localStorage` 是 TS2339，不是靠自觉。同理 `src/content/` 由
 * `eslint.config.js` 的 `no-restricted-globals` 拦住，那两条 message 逐字写着
 * 「存档是 `services/save.ts` 的职责」。⇒ 存档只能落在这里，不是「风格偏好」。
 *
 * ── 存档即 `JSON.stringify(state)`（决策 5）─────────────────────────────────
 * 「因为 state 本身就是可序列化的普通对象，断点续学**不需要任何特殊设计**」。
 * `core/types.ts` 里 `grid` 刻意用 `Readonly<Record<string, string>>` 而非 `Map`、
 * `core/grid.ts` 里 `cellKey` 刻意不加前缀 —— 两条注释都逐字写着是为序列化做的。
 * ⇒ 本文件**不重建**任何对局信息，只整体搬运。
 *
 * ── 进度与对局是两套生命周期（FR60 / R-06）────────────────────────────────
 * `SaveFile.progress` 跨局累积只增不减，`SaveFile.currentGame` 局末清空为 `null`。
 * 合并成一份会在局末连带清掉「第 3 单元 · 21/60」——
 * 守卫 **G78** 逐字钉住这条：局末写盘后 `currentGame === null` 且 `progress` 不变。
 *
 * ── 三条失败路径一律降级，绝不阻断回合（NFR12 / NFR13）──────────────────────
 * 写失败 / 读失败 / 数据损坏 / 版本不匹配，四条各自登记一条降级项并返回安全值。
 * **本文件的所有导出函数都不抛** —— `epics.md` 的 Story 1.15 逐字要求
 * 「捕获异常，降级为**内存态**：本局继续正常玩，**不阻断任何一回合**」。
 * ⚠️ `core/` 的不变量断言**照抛不误**（NFR12 第一层：「逻辑层必须 `throw`，禁止 catch」）——
 *   是 app 层去接住它并降级，不是让 `core/` 学会不抛。
 *
 * ⚠️ **不引入任何定时器**：写盘由 action 链路上的相位驱动（`core/effects.ts` 的
 *   `runEffects` 判据），不是计时器。
 */

import type { Progress, State } from '../core'

// ── 常量（裁决 1）────────────────────────────────────────────────────────────

/**
 * localStorage 的键名。
 *
 * ⚠️ **版本号刻意不编进键名**（`plantsgame.save.v1` 那种）：`game-architecture.md`
 * 决策 5 把 `schemaVersion` 定义成**值里的一个字段**，且 FR61 逐字要求
 * 「读取时校验 `schemaVersion`，不匹配则安全降级」。版本编进键名 ⇒ 旧键变成
 * 永远读不到也清不掉的垃圾，且那条校验判据**永远走不到**（读的是新键，版本天然一致）。
 *
 * ⚠️ **为什么带项目名前缀**：本作部署在与其他应用同源的 `/plantsgame/` 路径下。
 * 裸键名 `save` 撞上同域另一个应用时，读到的会**是别人的存档**，而它恰好可能是
 * 结构合法、`currentGame` 为 `null` 的（裁决 1）⇒ **静默丢进度，且不报错**。
 */
export const SAVE_KEY = 'plantsgame.save'

/**
 * 存档结构版本。
 *
 * ⚠️ **改这个值等于宣布「既有存档全部作废」** —— 一旦发版，版本不匹配的存档会走
 * 「安全降级为从上一个单元重新开始」（FR61）。所以它只在 `SaveFile` 的结构
 * **真的不兼容**时递增；加一个可选字段不必改它，改字段名/删字段才要。
 */
export const SAVE_SCHEMA_VERSION = 1

// ── 类型（裁决 2 / AC-B2）────────────────────────────────────────────────────

/**
 * 落盘的存档。结构逐字等于 `game-architecture.md` 决策 5 与 `epics.md` 的 AR14。
 *
 * ⚠️ **`progress` 的类型是 `core/hud.ts` 的 `Progress`，不是本文件另写一份** ——
 * 那两个键名**逐字就是**存档的字段名，`hud.ts` 逐字锁死了它们并由 G51 断言键名集合。
 * 手写第二份声明就是造第二个真相（R-37）。
 *
 * ⚠️ **`currentUnitIndex` 是 0 基**（Story 1.13 裁决 3），本文件**逐字搬运、不做转换**。
 * `game-architecture.md` 决策 5 自认这里原本是「本节的一处真空」，以 `hud.ts` + 裁决 3 为准。
 */
export interface SaveFile {
  readonly schemaVersion: number
  readonly savedAt: number
  /** 跨局持久，只增不减。 */
  readonly progress: Progress
  /** 当前这一局；局末清空为 `null`。 */
  readonly currentGame: State | null
}

/** 一条正在生效的降级项 —— Story 1.17 调试面板的数据源。 */
export interface SaveDegradation {
  readonly key: SaveDegradationKey
  readonly reason: string
}

/**
 * 降级项的分类 —— 「**哪一步坏了**」。
 *
 * ⚠️ AC-B5 逐字写的是**三个** key（`'write' | 'parse' | 'schema-version'`），
 * 而这里是**五个** —— 多出来的两条各自有理由，且**都不在 AC 的字面范围内**：
 *
 * · `read` —— `epics.md` 的 AC 点的是三条失败路径，`localStorage` **读**失败不在其中。
 *   但它**真实且常见**：无痕模式下取 `localStorage` 属性本身就抛 SecurityError。
 *   且**不能**归进 `parse`：`parse` 的含义是「这份数据读不懂」，
 *   而读失败是「根本读不到数据」，混起来会让 1.17 的面板对家长说错原因。
 *
 * · 🚨📎 **`clear` —— `[CR]` 2026-10-21 新增（Story 1.15 评审）**。
 *   `clearSave()` 的 catch 原本登记的是 **`'read'`**，而那里的数据**明明读得到**
 *   （读不到的话早就走 `readSave` 那条路了）—— 只是**删不掉**。
 *   ⇒ 面板会照着 `'read'` 的定义告诉家长「根本读不到存档」，
 *     而真相是「存得进去、也读得到，就是删不掉」—— **对家长说错了原因**。
 *   ⚠️ 这条错标签**活了整个 1.15**，因为 `fake-storage.ts` 的 `removeItem`
 *     当时**没有抛错开关** ⇒ 那条 catch 分支在任何用例里都构造不出来
 *     ⇒ 「错标签」与「死代码」是同一个原因的两个后果（R-50 第 ② 步：
 *     **判据必须能在坏输入上被触发**，否则它护不护得住都验不出来）。
 *
 * · 🚨📎 **`invariant` —— `[CR]` 2026-10-21 新增（Story 1.15 评审）**。
 *   盘上的数据 **JSON 合法、版本也对、字段齐全**，但那份**对局的状态**违反了
 *   `core/assertInvariants`（内容回滚、或存档来自另一个内容版本）。
 *   ⇒ 它既不是「读不到」（读得到），也不是「读不懂」（JSON 合法），
 *     更不是「存不进去」（那就是 `write`）—— **单开一个键**，
 *     否则面板只能显示一句都不准确的话。
 *   ⚠️ 这条只由 `app/store.ts` 经 {@link markRestoreDegraded} 登记：
 *     失败发生在 `readSave()` **已经成功返回之后**，save 侧自己登记不了。
 *
 * ⚠️ 这三条偏离**都没有进 1.15 的偏离表**（表里第 4 条是「改动 1.14 的 `SAVE` 成员」，
 * 与降级键毫无关系 —— 原注释写「`read` 是偏离 4」是一处**悬空引用**）。
 * ⇒ 登记在 `deferred-work.md`「Deferred from: code review of story-1-15」，并已更正此处指向。
 */
export type SaveDegradationKey =
  | 'write'
  | 'read'
  | 'parse'
  | 'schema-version'
  | 'clear'
  | 'invariant'

// ── 降级标志（AC-B4 / AC-B5）────────────────────────────────────────────────

/**
 * 当前生效的降级项，按 key 存**最近一次**的失败原因。
 *
 * ⚠️ **不是日志，是状态**：`Map` 而不是数组，因为 1.17 的面板要「一次性列出所有
 * **正在生效**的降级项」—— 同一个 key 反复失败 10 次仍只是一项。
 *
 * ⚠️ **一次成功只清「这次真的修好了」的那几项，不是全清**（`[CR]` 2026-10-21 修）：
 *   · **写成功** ⇒ `write` 不再成立（新字节合法、版本正确），
 *     `parse` / `schema-version` 也**跟着**不成立 —— 坏字节已经被新字节替换掉了。
 *     `invariant` 同理：降级后写进去的是内存里那份合法对局。
 *   · **读成功** ⇒ `read` / `parse` / `schema-version` 不再成立
 *     （这次读到的字节确实是好的）。
 *   · **两侧都不许顺带抹掉对方** —— 这一条是本 story 之前的行为错误：
 *     原来两处都写 `degraded.clear()`。真实的坏法是**配额满**：
 *     `setItem` 抛 ⇒ 记 `write`；孩子刷新页面 ⇒ `enterLevel()` 读档，
 *     盘上那份**旧的**存档读得到（坏的是写，不是读）⇒ `readSave` 成功
 *     ⇒ `degraded.clear()` ⇒ `isSaveDegraded()` 变 false，
 *     **1.17 的面板对家长说「存档正常」，而孩子此后每一次落盘都在丢进度。**
 *     反过来也一样：一次成功的**写**会抹掉「读不到存档」——
 *     而那正是本文件头逐字点名的「静默丢进度」形态。
 *   ⇒ 「读到一份好存档」不等于「存得进去」。这两件事今天被当成了一件事。
 *   守卫 **G222** 逐键钉住（变异 M259 / M260）。
 */
const degraded = new Map<SaveDegradationKey, string>()

/** 一次成功的**写**能证明恢复的那几项（见上）。 */
const RESOLVED_BY_WRITE: readonly SaveDegradationKey[] = [
  'write',
  'parse',
  'schema-version',
  'invariant',
]

/**
 * 一次成功的**读**能证明恢复的那几项（见上）。
 *
 * ⚠️ **刻意不含 `write` 与 `invariant`**：读得到说不了写得进去，
 *   而 `invariant` 是 app 层在**读成功之后**才登记的（`restoreFromSave`），
 *   一次成功读档压根没碰到那份对局。
 */
const RESOLVED_BY_READ: readonly SaveDegradationKey[] = ['read', 'parse', 'schema-version']

/**
 * 降级登记表的版本号 —— **只在 `degraded` 增删时递增**（`[CR]` 2026-10-17 补）。
 *
 * 📎 **为什么需要它**：调试面板上那个 `computed` 读的是本模块的 `Map`，
 *   而 Vue 对普通 `Map` **建不起响应式依赖** ⇒ 面板只会在挂载时算一次，
 *   之后的写盘失败再也不会显示，「重试写入」按钮因此永远不露脸。
 * ⚠️ **刻意用纯数字而不是 `ref`**：`services/` 今天零 vue 依赖（R-08）。
 */
let degradedVersion = 0

/**
 * 变更监听者 —— **纯函数集合，零框架**（`[CR]` 2026-10-17 补）。
 *
 * ⚠️📎 **光有版本号推不动面板**：Vue 的 `computed` 只追踪**响应式量**的读取，
 *   把 `saveDegradationsVersion()` 读进 `computed` **建不起依赖** ——
 *   版本号变了它照样不重算。版本号回答「变没变」（可拉、可断言），
 *   监听者回答「什么时候变」（推给 Vue），**两个都要**。
 */
const degradationListeners = new Set<() => void>()

/** 订阅降级变化 —— 返回退订函数（照 `AbortSignal` 的形状，不留半截订阅）。 */
export function onSaveDegradationsChanged(cb: () => void): () => void {
  degradationListeners.add(cb)
  return () => degradationListeners.delete(cb)
}

/**
 * 「降级状态变了」—— **本模块唯一的变更入口**。
 *
 * ⚠️ **版本号与通知写在同一个函数里是刻意的**：两者回答同一个事实。
 *   分成两处调用点就多一次「加了一个忘了另一个」的机会，而那种不一致
 *   **测不出来**（版本涨了面板不刷，两边单看都绿）。
 */
function noteDegradationsChanged(): void {
  degradedVersion += 1
  for (const cb of degradationListeners) cb()
}

/**
 * 只删掉 {@link keys} 里**当前确实在册**的那几项。
 *
 * ⚠️ **刻意不是 `degraded.clear()`**：全清会把「读成功」当成「写得进去」的证据，
 *   而配额满时这两件事恰好是分开的（见 `degraded` 的注释）。
 * ⚠️ **真的删到了东西才 `noteDegradationsChanged()`** —— 空转时递增版本号
 *   会白白唤醒所有订阅者（1.17 面板的 `computed` 白重算），
 *   而「什么都没变」本来就不该被广播成一次变化。
 */
function resolveDegradations(keys: readonly SaveDegradationKey[]): void {
  let changed = false
  for (const key of keys) {
    if (degraded.delete(key)) changed = true
  }
  if (changed) noteDegradationsChanged()
}

/** 降级登记表的当前版本号（纯整数；配 {@link onSaveDegradationsChanged} 用）。 */
export function saveDegradationsVersion(): number {
  return degradedVersion
}

/** 存档是否正在降级运行（写不进去 / 读不出来 / 存档本身坏了）。 */
export function isSaveDegraded(): boolean {
  return degraded.size > 0
}

/**
 * 全部正在生效的降级项及其原因。
 *
 * ⚠️ 抄 `services/audio.ts` 的 `audioDegradations()` 形状（裁决 7）：
 * 1.17 逐字要「一次性列出所有正在生效的降级项**及其原因**」，
 * 所以只有 `isSaveDegraded()` 一个 boolean **不够用**。
 */
export function saveDegradations(): readonly SaveDegradation[] {
  return [...degraded.entries()].map(([key, reason]) => ({ key, reason }))
}

/** 记一条降级项 —— WARN 级，前缀 `[save]`（AC 逐字）。 */
function markDegraded(key: SaveDegradationKey, reason: string): void {
  degraded.set(key, reason)
  noteDegradationsChanged()
  console.warn(`[save] ${reason}`)
}

/**
 * 📎 **`[CR]` 2026-10-21 新增（Story 1.15 评审）：给 app 层一条登记降级的通道。**
 *
 * 🚨 **为什么需要它**：AC-D4 逐字要求「降级项**已登记**（AC-B4）」，
 * 而 `store.ts` 的 `restoreFromSave()` 在 `assertInvariants` 抛错那条路径上
 * **只 `console.warn`** ⇒ `isSaveDegraded()` 仍是 `false`、`saveDegradations()` 仍是 `[]`
 * ⇒ **1.17 的调试面板一个字都不显示**。
 * 而 `restoreFromSave` 的 catch 发生在 `readSave()` **已经成功返回之后**
 * （数据读到了、JSON 合法、版本也对），所以**它自己那条路径登记不了任何键**
 * —— 这个信息只能由 app 层递进来。
 *
 * ⚠️ **本函数刻意不 `console.warn`** —— 调用方（`restoreFromSave`）**已经**就
 *   同一件事记了一条更完整的 WARN（「已退回从头开始（**跨局进度保留**）」）。
 *   走 `markDegraded` 会让同一件事在 console 里出现**两条**，
 *   而 `store-save.test.ts` 里那条「必须留一条 `[save]` WARN」的断言数的是条数 ——
 *   **同一个事实记两遍，是噪音也是判据的敌人**（R-37 登记只走记账）。
 *
 * ⚠️ **这不是「让 app 层随便写降级表」**：键与原因都收窄成
 *   「`invariant` + 一句人话」，且**只暴露这一个键** ——
 *   `write` / `read` / `clear` 三条仍然是 `services/save.ts` 自己的失败，
 *   外部登记它们会让「哪一步坏了」这个分类失去意义。
 */
export function markRestoreDegraded(reason: string): void {
  degraded.set('invariant', reason)
  noteDegradationsChanged()
}

/** 把一个 unknown 变成一句可读的说明（不抛，NFR14）。 */
function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// ── 写入（AC-B3 / AC-B6）────────────────────────────────────────────────────

/**
 * 写一次存档。
 *
 * ⚠️ **返回值逐字含义是「这次真存上了吗」** —— `epics.md` 的 Story 1.15 逐字要求
 * 「**不做任何静默丢弃** —— 明确区分『写成功了』与『这次没存上』两种状态」。
 * 一个没有返回值的 `writeSave` 无法区分这两者，失败就变成了静默丢弃。
 *
 * ⚠️ **本函数绝不抛**：`localStorage.setItem` 在配额满 / 无痕模式 / 系统清理存储时
 * 抛，而调用方是 `app/effects-runner.ts` 的副作用循环 —— 冒上去会**中断后续条目**。
 *
 * ⚠️ **为什么这条 `console.info` 不违 R-14**：R-14 禁的是「**逐帧**路径」上的日志。
 * 写盘每回合两次（约 20-30 秒一次），量级是分钟级，不是逐帧。
 * NFR14 逐字把「存档写入」列进 `INFO` 级的用途，且只把 `DEBUG` 级门控在
 * `import.meta.env.DEV` —— 所以这条日志**不加门控**。
 *
 * @returns 写成功 `true`；写失败（已降级）`false`。
 */
export function writeSave(progress: Progress, currentGame: State | null): boolean {
  try {
    const payload: SaveFile = {
      schemaVersion: SAVE_SCHEMA_VERSION,
      savedAt: Date.now(),
      progress,
      currentGame,
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload))
    // ⚠️ 先清降级项再记日志：写成功说明存储恢复了（见 `degraded` 的注释）。
    resolveDegradations(RESOLVED_BY_WRITE)
    console.info(
      `[save] 已存档（单元序号 ${progress.currentUnitIndex} · 已掌握 ${progress.masteredWordIds.length} 词` +
        `${currentGame === null ? ' · 本局已结束' : ` · 第 ${currentGame.turn} 回合`}）`,
    )
    return true
  } catch (err) {
    // 配额满 / 无痕模式禁用存储 / 存储被系统清理 —— 都是平板上的常见场景而非边缘场景。
    markDegraded('write', `存不进去（${describe(err)}）—— 本次进度只在内存里，关掉页面就没了`)
    return false
  }
}

// ── 读取（AC-B7）────────────────────────────────────────────────────────────

/**
 * 读存档。**永不抛**，任何异常都变成「返回 `null` + 一条降级项」。
 *
 * ⚠️ **返回 `null` 有两种截然不同的含义，调用方不该猜**：
 *   · **从来没有存档**（第一次玩）⇒ 正常路径，不记降级；
 *   · **有但用不了**（损坏 / 版本不符 / 读不到）⇒ 已登记降级项。
 * 「读不到」与「没有」在结果上都是开局，但**只有后者是孩子的正常体验**。
 */
export function readSave(): SaveFile | null {
  let raw: string | null
  try {
    raw = localStorage.getItem(SAVE_KEY)
  } catch (err) {
    // 无痕模式下 `localStorage` 属性本身就可能抛 —— 取出这一步就会失败。
    markDegraded('read', `读不到存档（${describe(err)}）—— 浏览器可能禁用了本地存储`)
    return null
  }

  if (raw === null) {
    // 第一次玩。没有存档**不是失败**，不记降级（AC-B7 的表第一行）。
    return null
  }

  const parsed = parseSaveFile(raw)
  if (!parsed.ok) {
    // ⚠️ **不删、不覆写那个 key**（裁决 8）：留着它，「存档坏了」这件事在 1.17 的
    // 面板里仍然查得到（降级项在）；删掉就只剩「什么都没发生过」。
    markDegraded(parsed.key, parsed.reason)
    return null
  }

  // 读到一份可用的存档 ⇒ **读侧**与「字节坏了」那两类不再成立。
  // ⚠️ **刻意不碰 `write`**：读得到说不了写得进去（配额满时这两件事是分开的）。
  resolveDegradations(RESOLVED_BY_READ)
  return parsed.file
}

/** 解析的结果：要么拿到一份可用的存档，要么拿到「哪一步坏了」。 */
type ParseResult =
  | { readonly ok: true; readonly file: SaveFile }
  | { readonly ok: false; readonly key: SaveDegradationKey; readonly reason: string }

function failed(key: SaveDegradationKey, reason: string): ParseResult {
  return { ok: false, key, reason }
}

/**
 * 把一段原始字符串解析成 `SaveFile`，**不登记降级**（登记是 `readSave` 的活）。
 *
 * ⚠️ **解析成功后仍要校验最小结构**：一个「JSON 合法、但内容不认得」的存档
 * （裁决 1 说的同源撞车、或某个旧版本写下的形状）若直接返回，
 * `undefined` 会被喂回 `progress` ref，然后在**渲染期**炸掉整个 `LevelView`。
 * ⇒ 这里只做**结构底线**校验；对局内部的不变量由 app 层过 `assertInvariants`
 *   （那是 `core/` 的职责，不在这里重造第二份 —— R-02）。
 */
function parseSaveFile(raw: string): ParseResult {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch (err) {
    return failed('parse', `存档文件坏了，读不出来（${describe(err)}）—— 从头开始`)
  }

  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return failed('parse', '存档内容不是一个对象 —— 从头开始')
  }

  const file = data as Partial<Record<keyof SaveFile, unknown>>

  if (file.schemaVersion !== SAVE_SCHEMA_VERSION) {
    return failed(
      'schema-version',
      `存档版本是 ${String(file.schemaVersion)}，当前游戏只认 ${SAVE_SCHEMA_VERSION} —— 从头开始`,
    )
  }

  if (typeof file.savedAt !== 'number') {
    return failed('parse', '存档缺少写入时间 —— 从头开始')
  }

  if (!isProgressShape(file.progress)) {
    return failed('parse', '存档里的进度字段不完整 —— 从头开始')
  }

  // ⚠️ `currentGame` 只校验「是对象或 null」：**不**在这里深校验对局 ——
  //   深校验是 `core/` 的 `assertInvariants` 的活，在 app 层调它（AC-D1）。
  if (file.currentGame !== null && !isPlainObject(file.currentGame)) {
    return failed('parse', '存档里的对局数据形状不对 —— 从头开始')
  }

  return {
    ok: true,
    file: {
      schemaVersion: file.schemaVersion,
      savedAt: file.savedAt,
      progress: file.progress,
      currentGame: file.currentGame,
    },
  }
}

/** `progress` 的结构底线 —— 键名逐字等于 `core/hud.ts` 的 `Progress`（裁决 2）。 */
function isProgressShape(value: unknown): value is Progress {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const p = value as Record<string, unknown>
  return (
    typeof p.currentUnitIndex === 'number' &&
    Array.isArray(p.masteredWordIds) &&
    p.masteredWordIds.every((id) => typeof id === 'string')
  )
}

/** 普通对象（**排除**数组与 `null`）—— 对局数据用它做底线形状判定。 */
function isPlainObject(value: unknown): value is State {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 清掉存档。
 *
 * ⚠️ **本 story 内部不调用它**（裁决 8）—— 损坏 / 版本不匹配的处置是「保留现场 +
 * 登记降级」，不是「删掉证据」。它存在是因为 1.17 的调试面板需要「重置进度」的落点。
 *
 * ⚠️ 调它**不会**登记降级项：删干净了就是没有存档，那是正常状态。
 */
export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY)
    // 📎 **这里是唯一一处合法的全清**（`[CR]` 2026-10-21）：盘上**什么都不剩了**，
    //   而降级项的语义是「描述盘上这份数据的毛病」—— 没有数据，就没有毛病可描述。
    //   `writeSave` / `readSave` 那两处不行，它们只能证明**自己那一侧**恢复了。
    degraded.clear()
    noteDegradationsChanged()
  } catch (err) {
    markDegraded('clear', `清不掉存档（${describe(err)}）—— 浏览器可能禁用了本地存储`)
  }
}
