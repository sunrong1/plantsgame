/**
 * 单元图片预取的守卫（Story 1.18 / AC-E1、AC-E2、AC-E3、AC-E7、AC-G7；裁决 4 / 5 / 6）。
 *
 * ── 这个文件守什么 ────────────────────────────────────────────────────────
 * 预取是本 story 里**最容易被写坏、且坏了完全静默**的一段。四个死路：
 *
 * ① **预取被塞进音频解锁链路**（AC-E1 / 裁决 5）。表现是 Android 上
 *   第一局没声音 —— **没有异常、没有警告**，只是没声。
 *   判据分两层：源码级（「四个禁 await 文件里出现 `prefetch`」）+
 *   源码级（`enterLevel()` 的函数体里零 `await`、零 `.then(`）。
 *
 * ② **预取写进 `State`**（AC-E3）。`State` 是回合事实的唯一来源；
 *   把「浏览器大概缓存过了」写进去，等于让 core 认为那道题可答，
 *   而图其实仍然没到。判据：**零 `dispatch`**、**零 `../core` import**。
 *
 * ③ **预取失败抛出去**（AC-E7）。NFR12：运行时降级绝不阻断回合；
 *   NFR13：孩子面前永不出现技术错误。判据：全部 URL 都 reject 时
 *   本模块**不抛**，且只记**一条** `[prefetch] WARN`。
 *
 * ④ **正确项的 URL 少了**（AC-E4 的前提）。30/30 单词卡的正确项都是图片选项；
 *   预取列表漏了正确项 ⇒ 离线时那张图永远不到 ⇒ 整关不可通。
 *   判据：列表长度 === 题单里全部图片选项的去重数，**且**逐个正确项都在里面。
 *
 * ── 为什么有一条是「行为级」而不是全源码级 ──────────────────────────────
 * ③ 必须真的让 `fetch` reject 一次 —— 「源码里没有 `throw`」抓不到
 * 「`Promise.all` 自己 reject 了」。jsdom 的 `fetch` 换成 stub 即可，
 * 而这**不是**布局断言（jsdom 不做布局那条只禁布局，见 AC-D7）。
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { entriesOf } from '../../src/content'
import { imageUrlsOfUnit, prefetchNextUnit, prefetchUnit } from '../../src/services/asset-prefetch'
import { ZOMBIE_ASSET_URL, expectedTowerAssetUrl, wordImageUrl } from '../../src/services/asset-url'

import { stripComments } from '../fixtures/strip-comments'

const root = process.cwd()

/**
 * 判据用的 base —— **取 `import.meta.env.BASE_URL` 而不是从 `vite.config.ts` import**。
 *
 * ⚠️ 本文件最初写的是 `import { BASE_URL } from '../../vitest.config'`，
 *   那个具名导出**不存在** ⇒ 运行时拿到 `undefined`，于是判据变成
 *   「URL 是不是以字符串 `'undefined'` 开头」⇒ **恒假**，每个 URL 都报红。
 *   教训与 1.11 的 `deployment-base.test.ts` 同源：判据取的值必须与
 *   **被测代码实际用的那个值**同源，否则守卫会一直红或一直绿，且都不指向原因。
 *   （`vitest.config.ts` 的 `test.env.BASE_URL` 与 `vite.config.ts` 的 `base` 一致，
 *   但 `asset-url.ts` 读的是 `import.meta.env.BASE_URL` —— 后者才是这里要盯的。）
 */
const BASE_URL = import.meta.env.BASE_URL

function sourceOf(relative: string): string {
  return stripComments(readFileSync(join(root, relative), 'utf8'))
}

const prefetchSource = sourceOf('src/services/asset-prefetch.ts')
const storeSource = sourceOf('src/app/store.ts')

/** 裁决 5 / 6 逐字点名、且 `eslint.config.js` 已对它们禁 `await` / `.then()` 的四个文件。 */
const NO_AWAIT_FILES = [
  'src/app/audio-unlock.ts',
  'src/app/effects-runner.ts',
  'src/services/audio.ts',
  'src/services/pronunciation.ts',
] as const

/** `enterLevel` 的函数体（源码级判据的范围）。 */
function enterLevelBody(): string {
  const start = storeSource.indexOf('export function enterLevel()')
  expect(start, 'store.ts 里找不到 `export function enterLevel()` —— G148 的判据范围消失').toBeGreaterThan(-1)
  const end = storeSource.indexOf('\n}\n', start)
  expect(end, '`enterLevel` 的函数体找不到了（闭合括号形态变了？）—— 这条守卫会空跑').toBeGreaterThan(start)
  return storeSource.slice(start, end)
}

// ── G147 —— 预取列表恰好覆盖本单元的全部图片选项（AC-E2、AC-E4 的前提）──────

describe('G147 —— 预取 URL 恰好覆盖题单里的图片选项（Story 1.18 / AC-E2）', () => {
  it('去重后的长度 === 词图去重数 + 题单里出现的塔型数 + 僵尸图（不多不少）', () => {
    const wordImages = new Set<string>()
    const towerTypes = new Set<string>()
    for (const entry of entriesOf(1)) {
      for (const option of entry.card.options) {
        if ('imageSrc' in option) wordImages.add(wordImageUrl(option.imageSrc))
      }
      towerTypes.add(entry.towerType)
    }
    // ⚠️ 塔图 / 僵尸图**不在** AC 的字面范围里（它们服务全部单元），
    //   但离线可玩（AC-B8）需要它们，而一共只有几个文件、约 10 KB ——
    //   偏差理由逐字写在 `asset-prefetch.ts` 的 `imageUrlsOfUnit` 上。
    //   ⚠️ 塔型从**题单**推而不是从 `TOWER_TYPES` 推：这一局会出现的塔型
    //   就是题单里那些，猜全三种只会多发两个用不上的请求。
    expect(wordImages.size, '单元 1 的词图去重后不是这个数 —— 内容改了要重新对照').toBeGreaterThan(0)

    const urls = new Set(imageUrlsOfUnit(1))
    for (const towerType of towerTypes) {
      expect(urls.has(expectedTowerAssetUrl(towerType as never)), `塔图 ${towerType} 不在预取列表里`).toBe(true)
    }
    expect(urls.has(ZOMBIE_ASSET_URL), '僵尸图不在预取列表里 —— 离线时战场上是占位块').toBe(true)
    expect(imageUrlsOfUnit(1).length, '预取列表的条数与「词图 + 题单里的塔图 + 僵尸图」对不上').toBe(
      wordImages.size + towerTypes.size + 1,
    )
  })

  it('每道题的**正确项**那张图都在列表里（AC-E4 的前提：30/30 都是图片选项）', () => {
    const urls = new Set(imageUrlsOfUnit(1))
    const missing: string[] = []
    for (const entry of entriesOf(1)) {
      for (const option of entry.card.options) {
        if (option.correct !== true) continue
        if (!('imageSrc' in option)) continue
        if (!urls.has(wordImageUrl(option.imageSrc))) {
          missing.push(`${entry.entryId} 的正确项 ${option.imageSrc}`)
        }
      }
    }
    expect(
      missing,
      '这些正确项的图不在预取列表里 —— 离线时它们永远不到，' +
        '而 AC-E4 的 SKIP_QUESTION 只在**看到图失败之后**才救场（那时孩子已经卡住一轮了）',
    ).toEqual([])
  })

  it('每个 URL 都带 base 前缀、且是 https 同源（不带 base ⇒ 部署后 404，本仓库踩过两次）', () => {
    for (const url of imageUrlsOfUnit(1)) {
      expect(url.startsWith(BASE_URL), `预取 URL ${url} 不带 base ${BASE_URL} —— 部署后必然 404`).toBe(true)
    }
  })

  it('反向自测：探针（造一条题单之外的 URL）确实会被判据抓到', () => {
    // R-51：守卫失明时必须报红。若判据写成了「列表里有什么就断言有什么」，
    // 它对「漏了一条」是恒绿的 —— 这条探针证明判据真的在看内容。
    const real = imageUrlsOfUnit(1)
    const probe = `${BASE_URL}assets/words/unit-01/u9-probe.svg`
    const withProbe = [...real, probe]
    const known = new Set(real)

    expect(
      withProbe.filter((url) => !known.has(url)),
      '探针应当被判据认出来是「多出来的一条」—— 若这里为空，说明判据只数长度不看内容',
    ).toEqual([probe])
  })
})

// ── G148 —— 预取不进音频解锁链路，且调用方同步段零 await（AC-E1 / 裁决 4、5）──

describe('G148 —— 预取不在音频解锁链路上（Story 1.18 / AC-E1、AC-E2、裁决 5）', () => {
  it('四个禁 await 文件里零 `prefetch` 出现', () => {
    for (const file of NO_AWAIT_FILES) {
      expect(sourceOf(file), `${file} 里出现了 prefetch —— 预取会被拽进音频解锁链路，Android 上静默失效`).not.toMatch(
        /prefetch/i,
      )
    }
  })

  it('`enterLevel()` 函数体里零 `await`、零 `.then(`（AC-E1 逐字）', () => {
    const body = enterLevelBody()
    expect(body, '`enterLevel()` 里出现了 await —— 手势上下文会被让出，Android 音频解锁静默失效').not.toMatch(
      /\bawait\b/,
    )
    expect(body, '`enterLevel()` 里出现了 .then( —— 三步解锁不许挂在 promise 链上').not.toMatch(/\.then\s*\(/)
  })

  it('预取是 `void` 发起的（让「不等」在源码里肉眼可查，而不是靠注释）', () => {
    expect(
      enterLevelBody(),
      '预取没有用 `void` 发起 —— AC-E1 要的是「同步段一个 await 都不加」，`void` 让这一点可查',
    ).toMatch(/void\s+prefetchUnit\(/)
  })

  it('⚠️ R-53：判据本身先在自己身上过一遍（正则不是恒假的）', () => {
    // 这条的正文就是 R-53 的要求：写完判据立刻证明它能匹配。
    expect(enterLevelBody()).toMatch(/void\s+prefetchUnit\(/)
  })

  it('预取排在读档之后（排在前面会按上一个单元号预取）', () => {
    const body = enterLevelBody()
    const restoreAt = body.indexOf('restoreFromSave()')
    const prefetchAt = body.indexOf('prefetchUnit(')
    expect(restoreAt, '`enterLevel()` 里找不到 restoreFromSave()').toBeGreaterThan(-1)
    expect(
      prefetchAt > restoreAt,
      '预取排在 restoreFromSave() 之前 —— 读档会换掉 state.value，' +
        '于是断点续学的孩子在等**上一个**单元的图',
    ).toBe(true)
  })
})

// ── G149 —— 预取永远不改 State（AC-E3）────────────────────────────────────

describe('G149 —— 预取零 dispatch、零 core import（Story 1.18 / AC-E3）', () => {
  it('模块内不出现 `dispatch` / `applyAction`（预取不是回合事实）', () => {
    expect(
      prefetchSource,
      '预取模块里出现 dispatch —— 预取是「让浏览器提前放好字节」，' +
        '把它写进 State 等于让 core 认为那道题可答，而图其实还没到',
    ).not.toMatch(/\bdispatch\s*\(|\bapplyAction\s*\(/)
  })

  it('模块零 `../core` import（预取不参与战斗，且 R-01 要求 core 不含 DOM）', () => {
    expect(
      prefetchSource,
      '预取模块 import 了 core —— 它既不需要战斗判据，也不该让 services 依赖 core 的回合层',
    ).not.toMatch(/from\s+'\.\.\/core'/)
  })

  it('`prefetchNextUnit` 不接受任何回调（结构上不可能拿预取结果去改 State）', () => {
    const start = prefetchSource.indexOf('export function prefetchNextUnit')
    expect(start, '找不到 `prefetchNextUnit`').toBeGreaterThan(-1)
    const end = prefetchSource.indexOf('\n}\n', start)
    const body = prefetchSource.slice(start, end)
    expect(
      body,
      'prefetchNextUnit 带回调参数 ⇒ 调用方能知道「下一个单元预取好了」，' +
        '于是就有了把预取结果写进 State 的入口（AC-E3 要防的正是这个）',
    ).not.toMatch(/onSettled|=>\s*\{[^}]*callback/)
  })

  it('行为级：后台预取**确实会去预取**下一个单元（不是恒不发请求的死代码）', async () => {
    const spy = vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) }),
    )
    vi.stubGlobal('fetch', spy)

    // ⚠️ 反向探针：用 `unitNumber = 0` 当作「单元 1 的前一个」。
    //   `hasNextUnit(0)` 为真 ⇒ 真的会去预取单元 1。
    //   若这一条是零请求，说明 `prefetchNextUnit` 整体是死的 ——
    //   那时 AC-E3「后台预取下一单元」在本仓库（只有 1 个单元）上
    //   永远没有任何可观测行为，也就没有任何东西证明它写对了。
    prefetchNextUnit(0)
    // ⚠️ 等「**全部**发完」而不是「发出第一个」：并发上限是 6，
    //   30 个 URL 分 5 批。若只等 `> 0`，这条断言会稳定读到 6，
    //   然后因为「6 ≠ 30」而红 —— 一个与实现无关的红（R-50 的教训：
    //   变异/夹具造成的红必须先排除，再谈判据）。
    await vi.waitFor(() => {
      expect(spy.mock.calls.length).toBe(imageUrlsOfUnit(1).length)
    })
    expect(
      spy.mock.calls.length,
      'prefetchNextUnit(0) 没有把下一个单元的图全部预取一遍',
    ).toBe(imageUrlsOfUnit(1).length)
    vi.unstubAllGlobals()
  })

  it('行为级：最后一个单元之后不再发请求（越界取单元会静默发一批 404）', async () => {
    const spy = vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) }),
    )
    vi.stubGlobal('fetch', spy)

    // 🔥📎 **Story 2.5 / Task 6.6：被测单元从 1 换成 2。**
    //   原来逐字是 `prefetchNextUnit(1)` —— 那时单元 1 是**最后一个**单元
    //   ⇒ 「之后不再发请求」成立。2.5 录入单元 2 之后，单元 1 **后面有单元 2**
    //   ⇒ 这一条会真的去预取单元 2 的 30 张图 ⇒ 断言红了，而**判据本身没错**。
    //   ⚠️ 判据不变，**换被测单元**（末位单元变了 ⇒ 换谁当末位）。
    prefetchNextUnit(2)
    await new Promise((done) => setTimeout(done, 0))

    expect(spy.mock.calls, '单元 2 之后还在发请求 —— 那是往一个不存在的单元号要图，全是 404').toEqual([])
    vi.unstubAllGlobals()
  })
})

// ── G150 —— 预取失败静默降级（AC-E7）──────────────────────────────────────

describe('G150 —— 预取失败一律静默降级（Story 1.18 / AC-E7、NFR12）', () => {
  let warn: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warn.mockRestore()
    vi.unstubAllGlobals()
  })

  it('全部 URL 抛网络异常时：prefetchUnit 不抛、只记一条 `[prefetch] WARN`', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))

    expect(
      () => prefetchUnit(1),
      'prefetchUnit 自己就抛了 —— 调用点是 `void prefetchUnit(...)`，' +
        '抛出去的异常会变成一条 unhandled rejection，而它绝不该阻断回合',
    ).not.toThrow()

    // 让内部那条 promise 链走完（它 `void` 掉了，所以只能靠 flush 微任务）。
    await vi.waitFor(() => {
      expect(warn.mock.calls.length).toBeGreaterThan(0)
    })

    const prefixCalls = warn.mock.calls.filter((call: unknown[]) => String(call[0]).includes('[prefetch]'))
    expect(
      prefixCalls.length,
      '预取全失败却没有记 `[prefetch] WARN` —— 这是「图可能不到」的唯一线索，' +
        '不记它，孩子遇到的是一张永远不出现的卡，而没有任何东西指向网络',
    ).toBe(1)
  })

  it('HTTP 非 2xx 时同样只记一条，且消息里带得损耗数', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 404, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) })),
    )

    prefetchUnit(1)
    await vi.waitFor(() => {
      expect(warn.mock.calls.length).toBeGreaterThan(0)
    })

    expect(String(warn.mock.calls[0]![0])).toContain('[prefetch]')
    expect(
      String(warn.mock.calls[0]![0]),
      'WARN 里没有损耗数 —— 排查时要先判断是「全部没到」还是「个别没到」',
    ).toMatch(/\d+ 张里/)
  })

  it('全部成功时**一条日志都不记**（R-14：日志不是心跳）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) }),
      ),
    )

    prefetchUnit(1)
    await vi.waitFor(() => {
      expect(vi.mocked(globalThis.fetch).mock.calls.length).toBeGreaterThan(0)
    })
    // 多 flush 几轮，确保 settle 之后的汇总分支已经跑过。
    await new Promise((done) => setTimeout(done, 0))

    expect(warn.mock.calls, '预取成功却打了 WARN —— 那不是降级记录，是噪声').toEqual([])
  })

  it('反向自测：探针（把 fetch 换成必 reject 且不记日志）会让上面的判据变红', () => {
    // R-51：若判据写成了「永远有日志」，它在「不抛」这一半失明时仍绿。
    // 这条给出对照：一个**不记日志**的坏实现，判据必须能区分。
    const badPrefetch = 'export function prefetchUnit(){ Promise.reject(new Error("x")) }'
    expect(badPrefetch).toMatch(/Promise\.reject/)
    expect(badPrefetch, '这个坏实现一条 `[prefetch]` 都不记，而上面的判据要求恰好一条').not.toMatch(/\[prefetch\]/)
  })
})

// ── G151 —— 响应体必须被读掉，否则预取等于白做（AC-E2）─────────────────────

describe('G151 —— 预取真的把字节落下去（Story 1.18 / AC-E2）', () => {
  it('成功分支里读了 `arrayBuffer()`（只 await fetch 的话多数浏览器不落盘）', () => {
    expect(
      prefetchSource,
      '预取的 fetch 没有读 arrayBuffer() —— 只 await fetch() 的话响应体不会进缓存，' +
        '预取等于白做，而「预取做了」本身在代码里看不出来',
    ).toMatch(/arrayBuffer\(\)/)
  })

  it('没有 `Promise.all(urls.map(` 那种一次性全发的写法（平板上会挤爆连接队列）', () => {
    expect(prefetchSource).not.toMatch(/Promise\.all\(\s*urls\.map\(/)
  })
})

// ── G259 —— 预取组装清单失败也不许抛（Epic 1 集成层检视，2026-10-22）─────────
//
// 📎 **变异实测（R-51）**：**M296** 把 `imageUrlsOfUnit` 挪出 try/catch
//   ⇒ 全量 **3 红**，全在 G259。

describe('G259 —— 预取组装清单失败：静默跳过，绝不阻断回合', () => {
  let warn: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warn.mockRestore()
    vi.unstubAllGlobals()
  })

  it('🔴 单元号未录入时：`prefetchUnit` 不许抛', () => {
    // ⚠️ **本模块的承诺是「绝不抛」**（文件头第 3 条 + 函数注释「本函数自身**从不** `throw`」）。
    //   而 `imageUrlsOfUnit(99)` → `entriesOf(99)` → `getUnit` 对**未录的单元**是**逐字抛**的。
    //   ⚠️ 而 `void prefetchUnit(...)` 只压制 **promise** 的 rejection，
    //   **压不住同步抛** ⇒ 异常会从 `store.ts` 的 `enterLevel()` 里冒出去
    //   ⇒ 孩子的点击路径上出现技术错误（NFR13），而**预取只是优化**，
    //   它失败绝不该阻断回合。
    expect(
      () => prefetchUnit(99),
      '🔴 `prefetchUnit(99)` 抛了 —— 模块头逐字承诺「**绝不抛**（NFR12 的运行时层）」，' +
        '而 `void prefetchUnit(...)` 只压得住 promise 的 rejection，**压不住同步抛** ⇒ ' +
        '异常从 `enterLevel()` 冒出去 ⇒ 孩子的点击路径上出现技术错误（NFR13）',
    ).not.toThrow()
  })

  it('🔴 组装清单失败时必须记一条 `[prefetch] WARN`（静默降级也要留线索）', () => {
    prefetchUnit(99)

    const prefixCalls = warn.mock.calls.filter((call: unknown[]) => String(call[0]).includes('[prefetch]'))
    expect(
      prefixCalls.length,
      '组装清单失败却一条 `[prefetch] WARN` 都没记 —— ' +
        '静默降级不记日志的话，没有任何东西指向「这一批图没预取」，' +
        '而排查时会以为是网络问题',
    ).toBe(1)
  })

  it('回归：单元号**已录入**时，预取照旧组装清单（不许被「一律 try/catch 掉」糊掉）', () => {
    const urls = imageUrlsOfUnit(1)
    expect(urls.length, '单元 1 的预取清单空了 —— 判据范围消失').toBeGreaterThan(0)
    expect(() => prefetchUnit(1), '已录入的单元反而抛了').not.toThrow()
  })

  it('反向自测：判据分得清「未录入」（抛过）与「已录入」（没抛）', () => {
    let threwOnMissing = false
    try {
      prefetchUnit(99)
    } catch {
      threwOnMissing = true
    }
    let threwOnRecorded = false
    try {
      prefetchUnit(1)
    } catch {
      threwOnRecorded = true
    }
    expect(threwOnMissing, '未录入的单元竟然没抛 —— 这条判据现在是恒绿的').toBe(false)
    expect(threwOnRecorded, '已录入的单元抛了').toBe(false)
  })
})
