/**
 * 单元图片的异步预取（Story 1.18 / AC-E2、AC-E3、AC-E7、裁决 4 / 5 / 6）。
 *
 * ── 为什么它必须是一个**新文件**，而不是几行塞进既有模块 ──────────────────────
 * `eslint.config.js` 逐字禁掉了四个文件里的 `await` / `.then()`：
 * `app/audio-unlock.ts`、`services/audio.ts`、`services/pronunciation.ts`、
 * `app/effects-runner.ts`。理由（架构硬约束 8 / FR2）：三步解锁必须在
 * 用户手势的**同一个同步块**里完成，一旦挂在 promise 链上，
 * Android 的音频解锁会**静默失效** —— 没有异常、没有警告，只是第一局没声音。
 * ⇒ 「解锁之后再预取」这句话的实现**一个字都不能进那四个文件**。
 * R-08 的依赖方向 `components → app → services → core` 让 `services/` 是合法的落点。
 *
 * ⚠️ **R-01（零 DOM）**：本模块摸 `fetch` / `caches`，全是浏览器 API
 *   ⇒ **绝不能进 `src/core/`**（`tsconfig.core.json` 的 `lib` 不含 DOM，编译会红）。
 *
 * ── 三条不可协商的行为（AC-E1 / E3 / E7）─────────────────────────────────
 * 1. **不阻塞**：调用方用 `void prefetchUnit(...)` 一把火就走，
 *    本模块内部全是 `void` + 微任务，**永不让调用方的同步段等它**。
 * 2. **不 dispatch**：预取下一单元时**一个 action 都不发**。
 *    预取是「让浏览器提前把字节放好」，它不是「让游戏认为那些资源已经就位」——
 *    派发 action 会把「缓存里有」写进 `State`，于是孩子翻到那道题时
 *    core 认为它可答，而图其实仍然可能没到。
 * 3. **绝不抛**（NFR12 的运行时层）：失败一律 `[prefetch] WARN` 后静默降级。
 *    孩子面前永不出现技术错误（6 岁半看到报错即为死局）。
 *
 * ── 为什么用 `fetch` 而不是 `new Image()` ──────────────────────────────────
 * · SW 的 `fetch` 事件**只拦 `fetch`**（`sw/sw-rules.ts` 的分类判据），
 *   `Image()` 在部分浏览器里不走同一条路 ⇒ 用 `Image()` 预取可能填不满 CacheStorage，
 *   而「填不满」的表现正是本 story 要治的那个（离线时正确项缺图 ⇒ 整关不可通）。
 * · `fetch` 的响应体必须被读掉（`arrayBuffer()`）才会真正落到磁盘缓存，
 *   只 `await fetch()` 不读 body 的话多数浏览器直接丢弃。
 *
 * ── 刻意不做的事 ──────────────────────────────────────────────────────────
 * · **不判「这张图在不在缓存里」**：查 `caches.match` 需要等 SW 接管，
 *   那会把预取变成串行。重复抓取交给 SW 的 `CacheFirst` 去重，成本是一次本地读取。
 * · **不记降级项**：1.17 的 `asset-degradations.ts` 逐字写明
 *   「本模块内零 console —— 那条 WARN 留在组件里」。同理，本模块**不写**登记表：
 *   谁真的挂了由 `OptionCard` 自己登记（它知道卡型 / entryId）。
 */

import { entriesOf, UNITS } from '../content'
import { ZOMBIE_ASSET_URL, expectedTowerAssetUrl, wordImageUrl } from './asset-url'

/**
 * 同时在飞的请求数上限。
 *
 * ⚠️ **这不是 R-20 意义上的「数值」**（R-20 管的是战斗平衡），
 *   而是一个并发 I/O 参数 —— 取值理由写在这里，DS 自定，未问人：
 *   单元 1 有 30 张词图。一次性 `Promise.all` 全部发出，在平板上会
 *   挤占同一个 HTTP/1.1 连接队列（每域名并发 6），**多出来的排队等的时间
 *   反而更长**；而一次只发 1 个又会让 30 张图串行 30 个 RTT。
 *   6 = 浏览器每域名并发的常见上限 ⇒ 不制造额外排队，也不浪费连接。
 *   ⚠️ 改这个值不影响任何游戏规则，但会改预取窗口长度 ——
 *   真机校准的结果记在文档的「人工待验清单」里。
 */
const MAX_CONCURRENT = 6

/** 一次预取的结果 —— 只给调用方做记账与实测用，不进 UI。 */
export interface PrefetchSummary {
  readonly unitNumber: number
  /** 本次要抓的 URL 去重后的总数。 */
  readonly total: number
  /** HTTP 非 2xx 的个数（**不含网络异常** —— 那些在 `errors` 里）。 */
  readonly notFound: number
  /** 网络层异常（DNS / 断网 / 被 SW 拒绝）的个数。 */
  readonly errors: number
  /** 从发起全部请求到最后一个settle的墙钟毫秒数。 */
  readonly elapsedMs: number
}

/**
 * 预取该单元要用到的全部图片 URL —— **去重**后返回（纯函数，好测）。
 *
 * 📎 **范围比 AC 的「本单元全部图片」宽了一点，是有意的**（偏差记在 story 文档）：
 *   AC 的字面范围是词图，而**塔图与僵尸图也在这一局的画面上**
 *   —— 它们各服务全部单元（FR70 / FR71），所以严格说它们**不属于「本单元」**。
 *   但离线可玩（AC-B8）需要它们，而它们只有 3 个文件、约 10 KB：
 *   把「进关后 100 ms 内多花 3 个请求」与「离线时战场上全是占位块」相比，
 *   前者便宜得多。
 *   ⚠️ 守卫 G147 的判据因此是「词图去重数 **+** 塔图数 **+** 1」，
 *     不是 AC 的字面数 —— 差这一条，守卫会在「有人顺手加了塔图」时误报。
 */
export function imageUrlsOfUnit(unitNumber: number): readonly string[] {
  const urls: string[] = []
  const seen = new Set<string>()
  const add = (url: string): void => {
    if (seen.has(url)) return
    seen.add(url)
    urls.push(url)
  }
  for (const entry of entriesOf(unitNumber)) {
    for (const option of entry.card.options) {
      // ⚠️ 「有没有图」用 `'imageSrc' in option` 判，不读 `.imageSrc`：
      //   `Card` 的选项是 `Option` 联合（`ImageOption | TextOption`），
      //   在 `in` 收窄之前读它会拿到 `string | undefined`。
      //   ⚠️ 单词卡的正确项**全部**是图片选项（AC-E4 的前提），
      //   而关键词卡 / 回应卡一个都没有 —— 所以这一步正是「正确项缺图」风险面。
      if (!('imageSrc' in option)) continue
      add(wordImageUrl(option.imageSrc))
    }
    // ⚠️ 塔图**从题单推**而不是 import `TOWER_TYPES`：
    //   守卫 G149 要求本模块零 `../core` import（预取不参与战斗，
    //   且 R-01 要 core 不含 DOM —— 反过来 services→core 是允许的，
    //   但这里**不需要**它：这一局会出现的塔型就是题单里那些）。
    add(expectedTowerAssetUrl(entry.towerType))
  }
  add(ZOMBIE_ASSET_URL)
  return urls
}

/** 这个单元之后还有没有下一个 —— `UNITS` 是只读数组，越界取不到。 */
export function hasNextUnit(unitNumber: number): boolean {
  return UNITS.some((unit) => unit.unitNumber === unitNumber + 1)
}

/**
 * 异步预取一个单元的全部图片。**立刻返回**，不阻塞调用方。
 *
 * ⚠️ **`void` 是给调用方看的**：`void prefetchUnit(1)` 让「这一行不会等」
 *   在源码里肉眼可查（AC-E1 收尾核对项）。本函数自身**从不** `throw`。
 *
 * @param onSettled 全部 settle 之后的回调，**只用于记账与实测**。
 *   刻意**没有** `onProgress`：没有任何界面消费它（1.18 不加加载进度条 ——
 *   那会在竖屏战场上多占一行，直接违反 AC-D1「不遮挡战场」的方向）。
 */
export function prefetchUnit(unitNumber: number, onSettled?: (summary: PrefetchSummary) => void): void {
  // 🔥📎 **2026-10-22（Epic 1 集成层检视）：本函数此前会**同步**抛。**
  //   上一行的注释逐字承诺「本函数自身**从不** `throw`」，文件头逐字承诺
  //   「**绝不抛**（NFR12 的运行时层）」—— 而 `imageUrlsOfUnit(unitNumber)`
  //   → `entriesOf(unitNumber)` → `getUnit` 对**未录的单元**是**逐字抛**的。
  //   ⚠️ 而 `void prefetchUnit(...)` 只压制 **promise** 的 rejection，
  //   **压不住同步抛** ⇒ 异常会从 `store.ts` 的 `enterLevel()` 里冒出去
  //   ⇒ 孩子的点击路径上出现技术错误（NFR13），而**预取只是优化**，
  //   它失败绝不该阻断回合。
  //   ⇒ 现在整个函数体进 try/catch：抛了就记一条 WARN 然后安静收场。
  let urls: readonly string[]
  try {
    urls = imageUrlsOfUnit(unitNumber)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    console.warn(
      `[prefetch] 组装单元 ${unitNumber} 的预取清单失败（${reason}）—— 已静默跳过预取。` +
        '预取是优化，失败不阻断回合（NFR12 / NFR13）。',
    )
    return
  }
  if (urls.length === 0) return

  // ⚠️ 没有 `fetch` 的环境（极老的浏览器 / 某些 WebView）直接放弃预取：
  //   预取是**优化**，没有它游戏照常跑（走的是 1.11 已建的占位 / 降级协议）。
  if (typeof fetch !== 'function') {
    console.warn(`[prefetch] 本环境没有 fetch，跳过单元 ${unitNumber} 的图片预取`)
    return
  }

  // ⚠️📎 `[CR]` 2026-10-20：**补 `.catch`** ——
  //   原来逐字是 `void run(...).then((result) => { onSettled?.(result); … })`，
  //   **没有 `.catch`** ⇒ ① `onSettled` 回调抛错时整条链 reject
  //   ⇒ **一条未捕获的 promise rejection**（模块头逐字「绝不抛（NFR12 的运行时层）」
  //   与「本函数自身**从不** `throw`」两句都被它破掉）；
  //   ② `run` 本身承诺「永远 resolve、绝不 reject」，所以真正的 reject 来源只有回调。
  //   ⇒ 回调是**调用方给的**，本函数不该替它担保「它不抛」。
  //   ⇒ 吞掉并记 WARN（静默降级的既定口径），不弹窗、不切 view。
  void run(unitNumber, urls)
    .then((result) => {
      onSettled?.(result)
      if (result.errors > 0 || result.notFound > 0) {
        // ⚠️ 逐字：静默降级记 WARN，**不抛、不弹窗、不切 view**（AC-E7 / NFR12）。
        //   这条 WARN 是「图可能预取不到」的唯一线索；不记它，
        //   孩子遇到的是一张永远不出现的卡，而没有任何东西指向网络。
        console.warn(
          `[prefetch] 单元 ${unitNumber} 预取有损耗：${result.total} 张里 ` +
            `${result.notFound} 张非 2xx、${result.errors} 张网络异常（${result.elapsedMs}ms）—— ` +
            '已静默继续，正确项缺图的题会走 SKIP_QUESTION 过滤',
        )
      }
    })
    .catch((err: unknown) => {
      console.warn(
        `[prefetch] 单元 ${unitNumber} 预取的回调抛错，已忽略：` +
          `${err instanceof Error ? err.message : String(err)}`,
      )
    })
}

/**
 * 后台预取**下一个**单元 —— 不 dispatch、不阻塞当前单元（AC-E3）。
 *
 * ⚠️ **刻意没有任何回调参数**：调用方拿不到「预取好了」的通知，
 *   因此它在结构上**不可能**拿预取结果去改 `State`。这是 AC-E3 的实现方式，
 *   不是遗漏 —— 「让 `State` 知道预取好了」正是要避免的那件事（见文件头第 2 条）。
 */
export function prefetchNextUnit(unitNumber: number): void {
  if (!hasNextUnit(unitNumber)) return
  // ⚠️📎 `[CR]` 2026-10-20 更正一句**假话**：原文逐字「下一个单元的预取**连日志都不打**」——
  //   而它调用的 `prefetchUnit` 在 `errors > 0 || notFound > 0` 时**照打**汇总 WARN。
  //   ⇒ 今天无害（Epic 1 只有一个单元，本分支恒不触发），但那句话在 Epic 2
  //     就会变成一句**与代码相反**的注释 —— 而注释是下一个人唯一的线索。
  //   ⇒ 现在按事实写：它**会**打损耗汇总（那条 WARN 是「图可能预取不到」的唯一线索），
  //     只是**不**为「正常完成」打任何日志。
  prefetchUnit(unitNumber + 1)
}

/** 以 `MAX_CONCURRENT` 为上限并发地抓全部 URL，永远 resolve，永不 reject。 */
async function run(unitNumber: number, urls: readonly string[]): Promise<PrefetchSummary> {
  const startedAt = nowMs()
  let notFound = 0
  let errors = 0

  // ⚠️ 手动游标而不是 `Promise.all(urls.map(...))`：一次 30 个请求
  //   会在平板上抢占连接队列（见 `MAX_CONCURRENT` 的注释）。
  let cursor = 0
  const worker = async (): Promise<void> => {
    for (;;) {
      const index = cursor
      cursor += 1
      if (index >= urls.length) return
      const outcome = await fetchOne(urls[index]!)
      if (outcome === 'ok') continue
      if (outcome === 'not-found') notFound += 1
      else errors += 1
    }
  }
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT, urls.length) }, worker))

  return {
    unitNumber,
    total: urls.length,
    notFound,
    errors,
    elapsedMs: Math.round(nowMs() - startedAt),
  }
}

/** 单个 URL 的抓取。**只**返回三种结局，不抛。 */
async function fetchOne(url: string): Promise<'ok' | 'not-found' | 'error'> {
  try {
    const response = await fetch(url, { credentials: 'same-origin' })
    if (!response.ok) return 'not-found'
    // ⚠️ **必须读掉 body**：只 `await fetch()` 的话多数浏览器不会把它落进
    //   HTTP 缓存，预取等于白做（这一条是本模块存在的意义，见文件头第 3 条）。
    await response.arrayBuffer()
    return 'ok'
  } catch {
    // ⚠️ 这里**只**记账，不打印：一次断网会刷 30 行 console，
    //   而 30 行同一条信息没有任何诊断价值。汇总的那一条 WARN 在 `prefetchUnit` 里。
    return 'error'
  }
}

/**
 * 取当前时刻的毫秒数。
 *
 * ⚠️ 走 `performance.now()` 而不是 `Date.now()`：前者在标签页被挂起时仍单调，
 *   而 `Date.now()` 会因系统时钟调整**倒着走** ⇒ `elapsedMs` 变成负数，
 *   实测记录里出现一个负的「预取窗口」，比没有这个数还糟。
 */
function nowMs(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now()
}
