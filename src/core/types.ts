/**
 * 战斗层实体类型（Story 1.4）+ 回合层类型（Story 1.5）。
 *
 * 形态：纯类型 + 纯函数，零 DOM、零 Vue（tsconfig.core.json 的 lib 不含 DOM）。
 *
 * 📎 **Story 1.5 扩充说明** —— 本文件自 1.5 起在原战斗层实体之上追加
 * 题单 / 题目 / State / Phase / Action 五个家族，**原有导出一行未改**（子任务 1.5）。
 * 之所以追加而不是拆新文件：这些类型与 `Tower` / `Zombie` 同处一个可辨识联合里
 * （`State` 的字段直接是它们的数组），拆开只会让联合的定义横跨两个文件、
 * 读代码时要在两处拼上下文。
 *
 * ⚠️ **`Action` 的联合定义住在本文件，而构造器住在 `actions.ts`**（与子任务 1.2 的
 * 字面一致）。单向：`actions.ts` 依赖本文件，反向不依赖 —— 于是 reducer 可以
 * 只从本文件取类型、从 `actions.ts` 取构造器，不产生循环。
 */

// ⚠️ ZOMBIE_HP 从 balance.ts 取（战斗数值的单一事实源，架构 `:634`）。
// balance.ts 反过来 import 本文件的 TowerType —— 那是 `import type`，
// 被 verbatimModuleSyntax 在编译期擦除，所以两者之间**不存在运行期循环**。
import { SLOW_TURNS, ZOMBIE_HP, assertTowerType } from './balance.js'
import { ZOMBIE_SPAWN_COL, assertGridIndex, assertInsideGrid } from './grid.js'

/**
 * 塔的战斗类型（架构模式 C 逐字锚点）。
 *
 * 用**字符串字面量联合**而非 TS `enum`：
 *   · 架构模式 C 的写法就是字面量联合，改成 enum 等于偏离锚点；
 *   · `verbatimModuleSyntax` 下 enum 是值导出，会给 core/ 添一个运行期对象，
 *     而战斗规则不需要它；
 *   · 本项目脚本用 `tsx` 跑，不依赖原生类型擦除，也就不该顺手引入 enum 的约束。
 */
export type TowerType = 'direct' | 'slow' | 'aoe'

/**
 * 塔 —— 架构模式 C。
 *
 * 硬规则（AC-8）：战斗数值只能读 `towerType`，**永远不读 `wordId`**。
 * `wordId` 只用于显示名与词图。
 *
 * ⚠️ `row` / `col` 是**本 story 对架构模式 C 的一处扩展**：架构 `:876-881` 的
 * `Tower` 只有 `id` / `towerType` / `wordId`，没有位置字段。但射程判定必须有塔的列号
 * —— 僵尸恒在 `ZOMBIE_ROW`，塔却可以种在任意行（GDD「只有一行有僵尸，
 * 但塔可以种在任意空格」）。留档以免 `[CR]` 误判为偏离架构。
 */
export interface Tower {
  /** 稳定唯一标识。目标选择的同列 tie-break 依赖它可比较（AC-4.3）。 */
  readonly id: string
  readonly towerType: TowerType
  readonly wordId: string
  readonly row: number
  readonly col: number
}

/**
 * 僵尸。
 *
 * ⚠️ **刻意没有 `row` 字段。** 僵尸恒在 `ZOMBIE_ROW`（架构不变量清单），
 * 把这个恒真值写进类型等于开放给调用方改写 —— 只要有人构造出 `row: 3`，
 * 类型系统拦不住，僵尸就永远走不到塔的射程里。
 * 行不变量不是靠断言守住的，是靠**类型里根本没有这个字段**守住的。
 *
 * 同理没有第二个维度，位置字段叫 `col` 而不是 `x`。
 */
export interface Zombie {
  readonly id: string
  /** 0-based 列索引。僵尸单向递减（结算顺序见 combat.ts 文件头）。 */
  readonly col: number
  readonly hp: number
  /** 减速剩余回合数，≥ 0 且 ≤ SLOW_TURNS。0 = 未减速。 */
  readonly slowTurnsLeft: number
}

/** `createTower()` 的入参。位置必填 —— 建造位置永远是显式的，没有合理的默认值。 */
export interface CreateTowerInput {
  readonly id: string
  readonly towerType: TowerType
  readonly wordId: string
  readonly row: number
  readonly col: number
}

/** `createZombie()` 的入参。⚠️ 没有 `row` —— 见上面 `Zombie` 的注释。 */
export interface CreateZombieInput {
  readonly id: string
  readonly col: number
  readonly hp: number
  /** 默认 0。> SLOW_TURNS 直接抛错（见函数注释）。 */
  readonly slowTurnsLeft?: number
}

/**
 * 建塔（AR11：工厂函数返回普通对象字面量，场上 ≤ 10 个实体，无需对象池）。
 *
 * 工厂是**唯一**能强制「塔落在合法格子里」的位置：`Tower` 字段全是 `readonly`，
 * 裸对象字面量绕过校验后无法纠错 —— 越界的塔会静默地永远打不到僵尸。
 */
export function createTower(input: CreateTowerInput): Tower {
  assertNonEmptyId(input.id)
  assertNonEmptyId(input.wordId)
  // 塔型白名单（[CR] P4）：类型联合在运行期不存在，脏塔型（存档/JSON 拼写错误）
  // 不拦在这里，就会活到很久之后的 TOWER_STATS 查表才炸（或静默 undefined）——
  // 报错现场远离错误源头。工厂是唯一能在数据入口处拦截的位置。
  assertTowerType(input.towerType)
  assertInsideGrid(input.row, input.col)
  return {
    id: input.id,
    towerType: input.towerType,
    wordId: input.wordId,
    row: input.row,
    col: input.col,
  }
}

/**
 * 建僵尸（AR11）。
 *
 * ⚠️ 入参里没有 row，返回值里也没有 —— 这是「僵尸恒在 `ZOMBIE_ROW`」的强制方式。
 *
 * `slowTurnsLeft` 的上限校验放在这里，与 combat.ts 的 `applySlow` 同一口径：
 * 减速恒为 `SLOW_TURNS` 回合（AR27），一个 > SLOW_TURNS 的值只可能来自
 * 「把刷新写成了累加」的实现错误 —— 那正是本 story 要抓的变异之一。
 */
export function createZombie(input: CreateZombieInput): Zombie {
  assertNonEmptyId(input.id)
  assertZombieCol(input.col)
  // 列号上界（[CR] P7）：僵尸只从 ZOMBIE_SPAWN_COL 入场。旧注释声称「上界由
  // ZOMBIE_SPAWN_COL 管」而当时没有任何代码强制 —— col 1000 的僵尸永远在
  // 全部塔窗口的右侧之外，成为「不死行走模拟器」。现在由工厂强制（唯一强制点）。
  // 下界刻意**不**设：僵尸必须能走到房子之外（负列号合法，见 assertZombieCol）。
  if (input.col > ZOMBIE_SPAWN_COL) {
    throw new Error(
      `僵尸列号不得超过入场列 ZOMBIE_SPAWN_COL = ${ZOMBIE_SPAWN_COL}，收到 ${input.col}`,
    )
  }
  assertZombieHp(input.hp)
  const slowTurnsLeft = input.slowTurnsLeft ?? 0
  assertSlowTurns(slowTurnsLeft)
  return { id: input.id, col: input.col, hp: input.hp, slowTurnsLeft }
}

// ── 不变量校验（架构「必须断言的不变量」清单里落在本 story 的那几条）────────

/**
 * 僵尸血量必须落在 `[0, ZOMBIE_HP]`（架构不变量清单逐字）。
 *
 * 上界从 `balance.ts` 读而非在 types.ts 里另写一个 100 ——
 * 战斗数值的单一事实源在 balance.ts（架构 `:634`），两处各写一份迟早一改一漏，
 * 而「血量上界」恰好是会被 Story 3.2 调到 150 的那种值。
 */
export function assertZombieHp(hp: number): void {
  if (!Number.isInteger(hp) || hp < 0 || hp > ZOMBIE_HP) {
    throw new Error(`僵尸血量必须落在 [0, ${ZOMBIE_HP}]，收到 ${hp}`)
  }
}

/**
 * 僵尸血量占满血的比例，落在 `[0, 1]`（Story 1.10 / AC-9）。
 *
 * ⚠️ **这个函数存在的唯一理由是「不让组件里出现 `z.hp / 100`」**。
 *   `[epics] AC:1020` 要求「血量变化在网格上可见」，而
 *   架构 `[GA]:1029` 把「组件内不得出现战斗规则计算」列为漂移风险**最高**的一条
 *   （AI 常顺手在组件里写 `if (hp <= 0)`），且该条**无工具可强制、只能靠 `[CR]`**。
 *   ⇒ 把这唯一的算术放进 `core/` 的纯函数，组件只调不算是唯一能同时满足
 *   架构与可测性的做法：函数本身有单测，组件里那句 `z.hp / ZOMBIE_HP` 一眼可见。
 *
 * **为什么分母从 `balance.ts` 读而不是写死 100**：同 `assertZombieHp` 的理由 ——
 *   战斗数值的单一事实源在 `balance.ts`（架构 `:634`）。Story 3.2 调 `ZOMBIE_HP` 时，
 *   组件里那个写死的 `100` 不会跟着变，于是血条在某一档下永远是半满 ——
 *   而界面上看不出任何异常。分母跟着走就没有这个可能。
 *
 * **为什么钳位到 `[0, 1]` 而不是直接相除**：`hp` 由 `createZombie` 保证落在
 *   `[0, ZOMBIE_HP]`，相除本就落在 `[0,1]`。钳位是为了让**返回值**在结构上
 *   就适合直接当 CSS 宽度百分比 —— 一个 >1 的值会让血条溢出格子，
 *   而溢出不会让任何测试变红，只会在屏幕上看起来「血条比僵尸还宽」。
 */
export function zombieHpRatio(zombie: Zombie): number {
  const ratio = zombie.hp / ZOMBIE_HP
  if (ratio < 0) return 0
  if (ratio > 1) return 1
  return ratio
}

/**
 * 僵尸列号必须是整数，且**不得越过入场列**。
 *
 * ⚠️ **刻意不设下界**：僵尸必须能走到房子**之外**（col < 0），
 * `hasPassedHouse` 判的就是负列号。
 *
 * 🔥📎 **2026-10-22（Epic 1 集成层检视）：上界搬到这里来了。**
 *   原文逐字写着「上界（`col <= ZOMBIE_SPAWN_COL`）由 `createZombie()` 工厂强制
 *   —— **工厂是数据入口的唯一强制点**，本校验器只负责「是整数」这一条」。
 *   ⚠️ **那句「唯一」当场不成立**：读档**不走工厂** —— 存档里的僵尸直接进
 *   `assertInvariants`，而本函数当时只查整数 ⇒ 一份 `col: 1000` 的僵尸存档
 *   能过全部不变量并被装进 `state.value`；僵尸列号只减不增 ⇒ 它永远走不进
 *   任何塔的窗口，却每回合继续刷出僵尸 ⇒ **这一局既不通关也不失败**。
 *   ⇒ 现在上界**在本函数里也强制**（工厂那条不变，两处口径一致）。
 *   ⚠️ 「唯一强制点」那句话已删 —— 它是本仓库反复出现的那类错误：
 *   **注释里的前提被真机推翻，而代码还按那个前提少做了一半。**
 *
 * 整数校验委托给 grid.ts 的 `assertGridIndex`（[CR] P17 收口：全层唯一实现）。
 */
export function assertZombieCol(col: number): void {
  assertGridIndex(col, '僵尸列号')
  if (col > ZOMBIE_SPAWN_COL) {
    throw new Error(
      `僵尸列号 ${col} 越过了入场列 ${ZOMBIE_SPAWN_COL} —— ` +
        '僵尸只从入场列入场，且列号只减不增；越界的僵尸永远走不进任何塔的窗口，' +
        '却每回合继续刷出僵尸，这一局既不通关也不失败。',
    )
  }
}

/** 减速剩余回合数：必须是 `[0, SLOW_TURNS]` 区间内的整数。恒等式由 applySlow 负责建立。 */
export function assertSlowTurns(turns: number): void {
  if (!Number.isInteger(turns) || turns < 0 || turns > SLOW_TURNS) {
    throw new Error(`slowTurnsLeft 必须落在 [0, ${SLOW_TURNS}]，收到 ${turns}（减速是刷新而非叠加）`)
  }
}

/** 实体 id 不能为空 —— 目标选择的同列 tie-break 依赖 id 可比较（AC-4.3）。 */
export function assertNonEmptyId(id: string): void {
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error(`实体 id 不能为空，收到 ${JSON.stringify(id)}`)
  }
}

// 📎 `assertGridIndex` 住在 grid.ts（[CR] P17：全 core/ 层唯一的整数校验器），
// 由 barrel 对外导出。本文件不再重复定义 —— 三份校验器各自演化的教训见 assertGridIndex 注释。

// ════════════════════════════════════════════════════════════════════════
// 回合层（Story 1.5）：题单 / 题目 / State / Phase / Action
// ════════════════════════════════════════════════════════════════════════

/** 选项 id。类型别名而非 `string`：与 `TowerType` 的做法一致，让「选项 id」在签名里自解释。 */
export type OptionId = string

/**
 * 图片选项（单词卡，架构模式 B）。
 *
 * `correct` 是**数据**，不是推导结果 —— 「唯一正确项」是 schema 级约束（FR16），
 * 由 Story 1.6 的 Zod 校验在内容入口处强制。core/ 运行时**只读不算**：
 * 在 core 里重算一遍「哪个选项正确」等于把内容层的判定复制成第二份，
 * 两份判定漂移时没有任何东西会报错。
 */
export interface ImageOption {
  readonly id: OptionId
  readonly imageSrc: string
  readonly correct: boolean
}

/** 文字选项（关键词卡 / 回应卡）。与 {@link ImageOption} 共用同一份判定逻辑（架构模式 B）。 */
export interface TextOption {
  readonly id: OptionId
  readonly text: string
  readonly correct: boolean
}

/** 选项并集 —— 三种卡型共用（架构模式 B：「卡型差异只在数据，不在代码」）。 */
export type Option = ImageOption | TextOption

/**
 * 卡 —— 三种卡型共用一个形状（架构模式 B）。
 *
 * ⚠️ **本 story 的选择：把架构的 `kind` 三分支并集拍平成一个 `kind: CardKind`
 * + `options: readonly Option[]`**（登记于 Dev Notes §「State 的最终设计」）。
 * 拍平的理由：架构对卡型差异给出的判据是「差异**只在数据**」—— 拍平形状让三种卡型
 * 在类型上**完全同构**，`isCorrect()` 也就没有「按卡型分派」的可写空间；
 * 而保留分支的话，三份近乎相同的 options 类型会诱导后来者写
 * `if (card.kind === 'word') ... else ...` 的分派逻辑，正是要避免的代码形态。
 * 「单词卡只配图片选项」由 Story 1.6 的 schema 校验（FR16）守，不靠 core 的类型。
 */
export interface Card {
  /** 仅用于渲染（图片卡 vs 文字卡）与卡型分布统计，**不参与战斗**（FR14）。 */
  readonly kind: 'word' | 'keyword' | 'response'
  readonly promptText: string
  readonly options: readonly Option[]
}

/**
 * 题单条目 —— 一个词 + 它的卡 + 它绑定哪种塔。
 *
 * ⚠️ `entryId` 带单元前缀（如 `u1-dog`，AR29）：录音目录**不分单元**，
 * 单元 1 与单元 2 各自都有 `dog` 时，不带前缀会撞名 —— 而撞名的后果是
 * 「换了单元却播了另一个单元的录音」，界面上完全看不出来。
 *
 * ⚠️ `towerType` 与 `wordId` 一起构成塔的来源（FR23）：`reduce` 建造时回查本条目，
 * 用 `towerType` 定战斗数值、用 `wordId` 定显示名。战斗数值**永远不读 `wordId`**（AC-8）。
 */
export interface DeckEntry {
  readonly entryId: string
  /** 塔的显示名来源。 */
  readonly wordId: string
  /** 该词绑定哪种塔。战斗数值只由它决定。 */
  readonly towerType: TowerType
  readonly card: Card
}

/**
 * `Phase` 在等答案时携带的那道题 —— 就是题单条目本身。
 *
 * 为什么是别名而不是新接口：`awaiting-answer` 阶段必须能拿到
 * 「塔型 / wordId / 卡」三样都要（答题判 `card`、结算解锁塔卡要 `towerType` 与 `wordId`）。
 * 若只携带 `Card`，reducer 还得回查 `deck` 找条目，两处都可能取到不同的东西。
 * 引用题单条目让「正在问的就是它」成为类型层面的事实。
 */
export type Question = DeckEntry

/**
 * 回合阶段 —— `State` 的可辨识联合，判别式是 **`kind`**（架构 `:842-849`）。
 *
 * ⚠️ **`Action` 用 `type`，`Phase` 用 `kind`** —— 架构字面如此，不是笔误。
 * 两者都从 `State` 派生的字段名不冲突（Action 不是 State 的成员）。
 *
 * 「回合内的两处无限等待属于 State」：等选卡与等建造都是**不会自己结束**的状态，
 * 若它们只活在组件里，断点续学（决策 5）恢复后无从判断该等什么，
 * reducer 也无从拒绝非法 action（AC-2）。
 *
 * ⚠️ `awaiting-build` 上的 `unlocked` / `sun` 是 **`State` 侧同名字段的只读镜像**
 * （架构 `:846-847` 的字面形状不可改）。唯一可写事实源是 `State`；
 * `assertInvariants()` 断言两者恒等，组件**只读 `State`** ——
 * 详见本 story Dev Notes §自主设计清单第 2 条。
 *
 * 🔥📎 **`awaiting-build` 上的 `question` 不是镜像，是唯一一份**（1.19 CR，2026-10-18）。
 *   它加在这里的原因逐字是一条实测出来的硬锁：卡面在建造期必须继续显示
 *   「刚刚答完的那道题」（AC-C5 的 ≤100ms 反馈），而**存档恢复时组件是全新挂载的** ——
 *   组件本地那份 `lastQuestion` ref 恒为 `null`，于是重进后卡面整个消失。
 *   ⚠️ 1.15 当年把这件事判成「这是正确的：重启本来就不该停在『刚刚答完』的反馈上」，
 *     **实测证明那个判定只覆盖了「没有存档的当场离开」，没覆盖「存档恢复」** ——
 *     而后者才是孩子真的会遇到的形态（关掉页面明天再来）。
 *   ⇒ 题面改由 `State` 携带，`QuestionCard` 直接读 `phase.question`，
 *     `lastQuestion` 随之整个删除（它当初存在就是因为 `State` 不带这道题）。
 *
 * ⚠️ **代价：存档里这道题会和 `deck` 里的那一条重复一份。**
 *   `Question` 就是 `DeckEntry`（见上方别名），`JSON.stringify` 不认引用 ⇒ 落盘时
 *   两份各写一次。一条词条含 4 个选项与词图路径，实测增量在**几百字节到 2 KB** 量级，
 *   而存档里 `deck` 本身就有 10 条。**这是刻意接受的**：换成 `questionEntryId: string`
 *   能省下这份重复，但组件就得多一次查表 + 一条「查不到怎么办」的失败路径，
 *   而查表失败在孩子面前就是**卡面空白且不报错**（1.18 的词图 404 已经演过一次）。
 *   ⇒ 一致性（与 `awaiting-answer` 同样携带条目）比省几百字节重要。
 *
 * ⚠️ **它不参与 `assertPhaseMirror` 的镜像比对** —— `unlocked` / `sun` 在 `State`
 *   侧各有一份同名字段可比，而 `question` **没有** State 侧对应物，
 *   比对它是拿自己比自己。
 *   📎📎 **`[CR]` 第六轮更正归属**：本行原文写的是「`assertInvariants()` 改为断言它
 *   **属于本题单**」—— **落在 `assertPhaseMirror()` 里**，不是 `assertInvariants()`。
 *   （`assertInvariants()` 只是**调用**它。）写成 `assertInvariants()` 会让照注释
 *   改代码的人去找错函数，误以为这条检查被丢了或被搬走了（R-37 那条复制链）。
 *   ⚠️ 同一轮还把这条判据**上提**成对 `awaiting-answer` 与 `awaiting-build`
 *   **两个带题面的相位都成立** —— 原文只覆盖后者，而 `awaiting-answer` 是
 *   联合里另一个携带 `Question` 的变体。
 */
export type Phase =
  | { readonly kind: 'awaiting-answer'; readonly question: Question }
  | {
      readonly kind: 'awaiting-build'
      readonly question: Question
      readonly unlocked: readonly string[]
      readonly sun: number
    }
  /** 真实的一帧状态，不是瞬时值：`END_BUILD` 只切 phase，`RESOLVE_ROUND` 才结算（自主设计 #3）。 */
  | { readonly kind: 'resolving' }
  | { readonly kind: 'round-over' }
  | { readonly kind: 'level-complete' }
  | { readonly kind: 'level-failed' }

/**
 * 一局游戏的全部状态（决策 2 的唯一状态、决策 5 的序列化对象）。
 *
 * ⚠️ **全部字段 `readonly` 且全部 JSON 可序列化** —— 没有 `Map` / `Set` / `Date` /
 * 类实例 / `undefined` 成员。`grid` 用字符串键（`cellKey(row,col)`）即为此故：
 * `Map` 能 JSON 化成 `{}`，一局打下来断点续学时战场全空，而没有任何报错指向它。
 */
export interface State {
  readonly unitNumber: number
  readonly phase: Phase
  /** 当前回合号，1 起。 */
  readonly turn: number
  /** 剩余心数，落在 `[0, HEARTS]`。 */
  readonly hearts: number
  /** 阳光**余额**，唯一可写事实源（塔打死僵尸不产出阳光，AC-9）。 */
  readonly sun: number
  /** `cellKey(row,col)` → 塔 id。与 `towers` 双向一致（AC-13）。 */
  readonly grid: Readonly<Record<string, string>>
  /** 按建造顺序排列 —— **攻击顺序即此顺序**（自主设计 #7：`reduce` 无随机，结果必须可重放）。 */
  readonly towers: readonly Tower[]
  readonly zombies: readonly Zombie[]
  /** 本局题单的**固定全集**，一局内数组本身永不变动（AC-5）。 */
  readonly deck: readonly DeckEntry[]
  /** 本局已答对的 `entryId`。`nextQuestion()` 跳过它们 —— 「已答对不再出现」全靠它表达。 */
  readonly masteredEntryIds: readonly string[]
  /**
   * 🔥 **Story 1.18 / AC-E4：本局已跳过的 `entryId`（正确项词图加载失败）。**
   *
   * ⚠️ **它与 `masteredEntryIds` 是两件事，绝不能合并**：
   *   `mastered` = 「孩子学会了」；`skipped` = 「这道题**没机会**被答」。
   *   塞进 mastered 会让进度条显示一个假的「已读 N/60」——
   *   而那个词孩子一个字都没听懂，下次进关也再也不会被问到。
   *
   * ⚠️ **为什么必须有它**：`nextQuestion()` 取的是「第一个未答对者」。
   *   不记跳过的话，跳过之后它仍然吐同一道题 ⇒ 死局照旧，
   *   而这次的死局比 1.11 那次更难归因（界面上连「置灰」都没有，只有原地打转）。
   */
  readonly skippedEntryIds: readonly string[]
  /** 已解锁塔卡的 `entryId` 列表（自主设计 #10：存 entryId，不存对象）。是数组不是集合 —— FR33 允许反复建同一张卡。 */
  readonly unlocked: readonly string[]
}

/**
 * 回合层 action 联合（架构 `:578` 给定的名字只有 `PLACE_TOWER`；
 * 其余五个是本 story 的选择，登记于 Dev Notes §自主设计清单第 1 条）。
 *
 * 判别式是 `type`（不是 `Phase` 的 `kind`）。
 *
 * ⚠️ 六个分支各有具名别名，且 `actions.ts` 的构造器返回**精确的分支类型**而非 `Action`：
 * 返回联合会让 `answer('x').optionId` 在编译期报错（该属性不保证存在于任一分支），
 * 于是每个调用方都要先写一遍 `if (a.type === 'ANSWER')` 收窄 —— 而那只在调试时才有意义。
 * 具名 + 精确返回类型让「构造器的产物是什么」在类型上自明。
 */

/** 答题。 */
export interface AnswerAction {
  readonly type: 'ANSWER'
  readonly optionId: OptionId
}

/** 放塔。`cell` 是 `cellKey(row,col)` 字符串，`entryId` 指向题单条目（FR23）。 */
export interface PlaceTowerAction {
  readonly type: 'PLACE_TOWER'
  readonly entryId: string
  readonly cell: string
}

/** 结束建造 —— 只切 phase，不结算（自主设计 #3）。 */
export interface EndBuildAction {
  readonly type: 'END_BUILD'
}

/** 执行本回合结算。 */
export interface ResolveRoundAction {
  readonly type: 'RESOLVE_ROUND'
}

/** 推进到下一回合。 */
export interface ContinueAction {
  readonly type: 'CONTINUE'
}

/** 重打本关。**刻意无载荷** —— 重置值一律由 reduce 从 deck 重算（AC-5）。 */
export interface RestartLevelAction {
  readonly type: 'RESTART_LEVEL'
}

/**
 * 🔥 **Story 1.18 / AC-E4（裁决 11）：跳过一道题 —— 正确项那张图加载失败时。**
 *
 * ⚠️ **载荷带 `entryId` 不是冗余**：reducer 要拿它与「当前题」比对。
 *   不带载荷的话，界面可以把「跳 A」发成「跳 B」而 core 无从发现 ——
 *   而那种错会让一道**好着的**题凭空消失，界面与日志里都看不出少了什么。
 *
 * 🔥 **`optionId` 是这道 action 存在的理由本身**（1.18 `[DS]` 补，裁决 11 的原文
 *   写的是「`OptionCard` 在正确项 `failed` 时 dispatch 一个 `SKIP_QUESTION`」，
 *   但**组件不许读 `option.correct`** —— `tests/components/quiz-card.test.ts`
 *   的守卫逐字禁止 `.correct` 出现在组件里）。
 *   ⇒ 载荷必须带上「破的是哪个选项」，由 `reducer` 拿 `isCorrect` 去核对。
 *   ⚠️ **为什么不只在组件里判完再发一个不带 `optionId` 的跳过**：
 *   那会让「这道题仍然答得了」这个事实只存在于组件的一行判断里，
 *   而 core 无从复核 —— 于是「任意一张图 404 就跳整题」这个误用
 *   会在**每一张图失败时**都发生，且没有任何守卫会红。
 *   守卫 G144 的第 3 条钉住「`optionId` 不是正确项时必须被拒绝」。
 *
 * ⚠️ **它不是 `ANSWER` 的兄弟而是它的替代**：跳过与答题在界面上互斥
 *   （正确项被禁用 ⇒ 孩子点不到它），而在 `core` 里必须严格二选一 ——
 *   允许「先跳过再对同一题答题」会让 `turn` 与战场从此对不上。
 */
export interface SkipQuestionAction {
  readonly type: 'SKIP_QUESTION'
  readonly entryId: string
  /** 加载失败的那个选项。reducer 会核对它**确实**是正确项。 */
  readonly optionId: OptionId
}

export type Action =
  | AnswerAction
  | PlaceTowerAction
  | EndBuildAction
  | ResolveRoundAction
  | ContinueAction
  | RestartLevelAction
  | SkipQuestionAction

/**
 * 答题判定 —— **全项目唯一的一份实现**（架构模式 B `:861-864`，FR14）。
 *
 * 三种卡型共用：卡型差异只在数据，所以判定逻辑不该分派卡型。
 *
 * ⚠️ **不校验「恰有一个正确项」** —— 那是 schema 级约束（FR16），由内容校验脚本守。
 * core 里再算一遍就是第二份判定实现，两份漂移时不会报错。
 *
 * ⚠️ `chosenId` 匹配不到任何选项时**抛错**（AC-7：逻辑层只 throw，不静默返回 false）。
 * 静默 false 会把「组件传错了 id」伪装成「孩子答错了」——
 * 界面上表现为「怎么点都错」，而真正的错误（渲染时用了临时 id）在日志里一个字都没有。
 */
export function isCorrect(card: Card, chosenId: OptionId): boolean {
  const chosen = card.options.find((option) => option.id === chosenId)
  if (chosen === undefined) {
    const known = card.options.map((o) => o.id).join('、')
    throw new Error(
      `所选选项 ${JSON.stringify(chosenId)} 不在这张卡 ${card.kind} 的选项里（现有：${known}）。` +
        '静默当作答错会把「组件传错了 id」伪装成「孩子答错」，界面上表现为「怎么点都错」。',
    )
  }
  return chosen.correct
}
