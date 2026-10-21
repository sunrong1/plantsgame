/**
 * @vitest-environment jsdom
 */
/**
 * 内容资产降级 registry + 面板的三源归一化（Story 1.17 / 组 E）。
 *
 * ── 为什么这个模块是本 story 新建的 ─────────────────────────────────────────
 * AC 逐字要面板列出「词图加载失败」，而**实测**（裁决 10 的表）：
 *   · 音频：`audioDegradations()` —— ✅ 已备好
 *   · 存档：`saveDegradations()` —— ✅ 已备好
 *   · **内容资产：全仓零可查询标志** —— 四个组件各有一个 `failed` ref
 *     和一条 `console.warn`，**没有任何东西能被面板读到**。
 * ⇒ 1.17 必须自己把「词图失败」变成可查询状态。
 *
 * ── 形态照抄 `services/save.ts`，不是照抄它的灵感 ───────────────────────────
 * `Map` 而不是数组（同一个 URL 反复失败 10 次仍只是一项）、
 * 本模块内零 `console`、不抛不弹窗不阻断。
 *
 * ── ⚠️ 三条「不许抄一份」纪律 ───────────────────────────────────────────────
 * · 假存储来自 `fixtures/fake-storage.ts`（1.15 已交付，带 `throwOnSet`）。
 * · 假音频来自 `fixtures/fake-audio.ts`（1.17 从 `audio.test.ts` 提出）。
 *   **本文件测「音频降级项能列出来」必须真的跑一次 404**，
 *   而 `failedSfx` 是 `audio.ts` 的模块级 `Set` ⇒ 只能靠动态 import 拿新鲜模块，
 *   没有任何导出的 setter 能从外面塞一个失败进去。
 * · 判据自测一律**用判据自己跑一遍探针**（R-51）。
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { state } from '../../src/app/store'
import DebugPanel from '../../src/components/debug/DebugPanel.vue'
import { createInitialState } from '../../src/core'
import {
  assetDegradations,
  assetDegradationsVersion,
  clearAssetDegradationsForTest,
  isAssetDegraded,
  markAssetDegraded,
  onAssetDegradationsChanged,
} from '../../src/services/asset-degradations'
import { audioDegradations } from '../../src/services/audio'
import { clearSave, clearSaveDegradationsForTest, saveDegradations, writeSave } from '../../src/services/save'
import LevelView from '../../src/views/LevelView.vue'

import {
  flush,
  installFakeAudio,
  resetFakeAudio,
  stubFailingFetch,
} from '../fixtures/fake-audio'
import { afterEachUninstall, installFakeStorage } from '../fixtures/fake-storage'
import type { FakeStorage } from '../fixtures/fake-storage'
import { stripComments } from '../fixtures/strip-comments'
import { makeSyntheticDeck } from '../fixtures/synthetic-deck'

const root = process.cwd()
const DECK = makeSyntheticDeck(25, 1)

enableAutoUnmount(afterEach)

let storage: FakeStorage

beforeEach(() => {
  storage = installFakeStorage()
  resetFakeAudio()
  state.value = createInitialState({ unitNumber: 1, deck: DECK })
  clearAssetDegradationsForTest()
  // 📎 **`[CR]` 2026-10-21 第二轮补**：存档那个降级登记表也是**模块级** `Map`
  //   （本文件的 import 是**静态**的 ⇒ `vi.resetModules()` 对它无效）。
  //   ⇒ 上一例登记的 `write` 会漏给下一例 —— 而「没有降级项时不露按钮」那条
  //     **必须**在空表上才成立，漏清就会变成**靠执行顺序的运气**。
  //   ⚠️ 复位**不能**用 `clearSave()`：它有真实语义（清档），
  //     而且 `[CR]` 第二轮起它**刻意不清** `write` / `read`
  //     （守卫 G244：删得掉证不了写得进去）⇒ 它**不是**登记表的重置。
  clearSaveDegradationsForTest()
})

afterEachUninstall()

// ── AC-E1 —— registry 本体 ───────────────────────────────────────────────

describe('AC-E1 —— `asset-degradations` 的四条性质（Story 1.17）', () => {
  it('同一个 URL 反复失败只算一项（`Map` 语义，M140 专打）', () => {
    for (let i = 0; i < 10; i += 1) {
      markAssetDegraded('/assets/words/apple.svg', `第 ${i} 次失败`)
    }
    expect(assetDegradations()).toHaveLength(1)
  })

  it('理由按最后一次失败覆盖（登记点知道「刚才那次」最有用）', () => {
    markAssetDegraded('/a.svg', '第一次')
    markAssetDegraded('/a.svg', '第二次')
    expect(assetDegradations()[0]?.reason).toBe('第二次')
  })

  it('`isAssetDegraded()` 反映的是「有没有」，与 URL 无关', () => {
    expect(isAssetDegraded()).toBe(false)
    markAssetDegraded('/a.svg', '缺文件')
    expect(isAssetDegraded()).toBe(true)
  })

  it('⚠️ 本模块内零 `console`（那条 `[content]` WARN 逐字留在组件里）', () => {
    // ⚠️ 必须 stripComments（R-52）：本模块的文件头逐字写着「组件里那条 WARN 逐字保留」
    //   并引用了 `console` 这个词，不剥注释数的就是注释。
    const source = stripComments(readFileSync(join(root, 'src/services/asset-degradations.ts'), 'utf8'))
    expect(source, 'registry 里不得打日志 —— 打日志的是组件，不是登记点').not.toMatch(
      /\bconsole\s*\./,
    )
  })

  it('⚠️ 登记本身不抛、不出声（NFR12：运行时降级绝不阻断回合）', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => markAssetDegraded('/a.svg', '缺文件')).not.toThrow()
    expect(warn, '登记点自己不该出声 —— 出声的是组件').not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
    warn.mockRestore()
    error.mockRestore()
  })
})

// ── G114 —— 四个组件的 onImageError 都登记 ────────────────────────────────

describe('G114 —— 四处 `onImageError` 都登记了降级（Story 1.17 / AC-E2）', () => {
  const COMPONENTS = [
    'src/components/battle/Tower.vue',
    'src/components/battle/Zombie.vue',
    'src/components/hand/HandCard.vue',
    'src/components/quiz/OptionCard.vue',
  ]

  /** `onImageError` 的函数体 —— 取到**下一个顶层 `function` 声明**为止。 */
  function onImageErrorBody(source: string): string | null {
    const from = source.indexOf('function onImageError')
    if (from < 0) return null
    // ⚠️ 按「下一个顶层 function」切，而不是按固定字数切：
    //   固定字数会把「后面另一个函数里也调了它」算进来（见下面那条自测）。
    const rest = source.slice(from)
    const nextTop = rest.slice(1).search(/^function\s/m)
    return nextTop < 0 ? rest : rest.slice(0, nextTop + 1)
  }

  /** 判据本体：某个组件的 `onImageError` 函数体里有没有登记。 */
  function registers(source: string): boolean {
    return (onImageErrorBody(source) ?? '').includes('markAssetDegraded(')
  }

  it('判据自测：一份**不登记**的探针会被判为未登记', () => {
    // ⚠️ R-51：grep 类守卫极易恒绿 —— 「文件里出现 `markAssetDegraded` 这个词」
    //   与「`onImageError` 这个函数里调了它」是两件完全不同的事。
    const probe = `
function onImageError(): void {
  failed.value = true
}
function other(): void {
  markAssetDegraded(url, reason)
}
`
    expect(registers(probe), '判据自测：登记写在别的函数里也算登记了').toBe(false)
    expect(registers('function onImageError(): void { markAssetDegraded(u, r) }')).toBe(true)
  })

  it('G114：四个组件的 `onImageError` 各自都调了 `markAssetDegraded`', () => {
    for (const file of COMPONENTS) {
      const source = stripComments(readFileSync(join(root, file), 'utf8'))
      expect(registers(source), `${file} 的 onImageError 没有登记降级 —— 面板看不到它`).toBe(true)
    }
  })

  it('G114：四处都 import 了 registry（不是靠全局副作用拿到它）', () => {
    for (const file of COMPONENTS) {
      const source = stripComments(readFileSync(join(root, file), 'utf8'))
      expect(source, `${file} 没 import registry`).toMatch(/from\s+'[^']*asset-degradations'/)
    }
  })

  it('G114：登记排在既有 `[content]` warn 之后，且渲染降级态的逻辑没被动', () => {
    // ⚠️ AC-E2 逐字要求「渲染降级态的逻辑一个字不动」——
    //   `failed.value = true` 必须在、且必须在 warn 之前（那是 1.7 / 1.11 的交付物）。
    for (const file of COMPONENTS) {
      const source = stripComments(readFileSync(join(root, file), 'utf8'))
      const body = onImageErrorBody(source)
      expect(body, `${file} 找不到 onImageError`).not.toBeNull()
      const failed = (body ?? '').indexOf('failed.value = true')
      const warn = (body ?? '').indexOf('console.warn')
      const mark = (body ?? '').indexOf('markAssetDegraded(')
      expect(failed, `${file} 的 failed 降级态逻辑被动了`).toBeGreaterThan(-1)
      expect(warn, `${file} 的 [content] warn 不见了`).toBeGreaterThan(-1)
      expect(mark, `${file} 的登记没排在 warn 之后`).toBeGreaterThan(warn)
    }
  })
})

// ── G116 —— 三源归一化 ────────────────────────────────────────────────────

describe('G116 —— 面板一次性列出三源全部降级项（Story 1.17 / AC-E4）', () => {
  it('三源都空 ⇒ 面板显示「没有降级项」，且不列任何源名', () => {
    const text = mount(DebugPanel).text()
    expect(text).toContain('没有降级项')
    expect(text, '一个都没有的时候列一串源名是噪音').not.toMatch(/url=|key=|scope=/)
  })

  it('路径一：内容资产（`{ url, reason }`）', () => {
    markAssetDegraded('/assets/words/apple.svg', '图片缺失')
    const text = mount(DebugPanel).text()
    expect(text).toContain('url=/assets/words/apple.svg')
    expect(text).toContain('图片缺失')
    expect(text, '「没有降级项」在一项降级存在时还挂着，是恒绿守卫的典型形态').not.toContain(
      '没有降级项',
    )
  })

  it('路径二：音频 —— 真的跑一次 404 音效（**多一个 scope**）', async () => {
    // ⚠️ `failedSfx` 是 `audio.ts` 的模块级 `Set`，**没有任何导出的 setter** ——
    //   而「面板能把音频降级列出来」恰恰要求那个 Set 非空。
    //   ⇒ 只能 `resetModules` + 动态 import 拿一份新鲜模块，然后真的打一发 404。
    vi.resetModules()
    resetFakeAudio()
    installFakeAudio()
    stubFailingFetch()
    const audio = await import('../../src/services/audio')
    audio.unlockAudioSession()
    audio.playSfx('answer-wrong')
    await flush()

    const degradation = audio
      .audioDegradations()
      .find((item) => item.key === 'sfx:answer-wrong')
    expect(degradation, '前置：这次 404 必须真的登记成音频降级项').toBeDefined()
    expect(degradation?.scope, '单个音效坏了是 asset 级，不是 session 级').toBe('asset')

    const { default: Panel } = await import('../../src/components/debug/DebugPanel.vue')
    const text = mount(Panel).text()
    expect(text).toContain('scope=asset')
    expect(text).toContain('key=sfx:answer-wrong')
  })

  it('路径三：存档 —— 让一次真的写入失败（`fake-storage` 的 `throwOnSet`）', () => {
    storage.throwOnSet = true
    writeSave({ currentUnitIndex: 0, masteredWordIds: [] }, state.value)
    expect(saveDegradations().length, '前置：写入必须真的失败了').toBeGreaterThan(0)

    const text = mount(DebugPanel).text()
    expect(text).toMatch(/key=write/)
  })

  it('三源同时有降级项 ⇒ 面板**一次性**列出全部（不是只列第一源）', () => {
    markAssetDegraded('/assets/words/apple.svg', '图片缺失')
    storage.throwOnSet = true
    writeSave({ currentUnitIndex: 0, masteredWordIds: [] }, state.value)

    const text = mount(DebugPanel).text()
    expect(text).toContain('url=/assets/words/apple.svg')
    expect(text).toMatch(/key=write/)
    expect(text, '音频源这一例由上面那条用例覆盖；此处守的是「不只列第一源」').toContain(
      '图片缺失',
    )
  })

  it('⚠️ 不许改那两个既有 API 的返回类型（1.14 / 1.15 已交付且被守卫钉着）', () => {
    // 形状由**别的**守卫守；这条只确认「面板消费的是既有 API，不是另造的一层」。
    expect(Array.isArray(audioDegradations())).toBe(true)
    expect(Array.isArray(saveDegradations())).toBe(true)
  })
})

// ── G115 —— 「重试写入」按钮 ──────────────────────────────────────────────

describe('G115 —— 「重试写入」真的重写一次并让降级项消失（Story 1.17 / AC-E3）', () => {
  /** 造一次「写不进去」：真调 `writeSave`，让 `save.ts` 自己登记降级项。 */
  function failOneWrite(): void {
    storage.throwOnSet = true
    writeSave({ currentUnitIndex: 0, masteredWordIds: [] }, state.value)
    expect(saveDegradations().length, '前置：这次写入必须真的失败').toBeGreaterThan(0)
  }

  it('写入失败 ⇒ 面板列得出来，并露出「重试写入」按钮', () => {
    failOneWrite()
    const panel = mount(DebugPanel)
    expect(panel.text()).toMatch(/key=write/)
    expect(panel.find('button[data-action="retry-save-write"]').exists()).toBe(true)
  })

  it('点一次「重试写入」⇒ 存档降级项消失，且真的重写了一盘', async () => {
    failOneWrite()
    storage.throwOnSet = false

    const panel = mount(DebugPanel)
    await panel.find('button[data-action="retry-save-write"]').trigger('click')
    await panel.vm.$nextTick()

    // ⚠️📎 **`[CR]` 2026-10-21 第二轮改判据方向**（从「表空了」改成「该留的还在」）。
    //   原来逐字是 `expect(saveDegradations(), …).toEqual([])` ——
    //   那是**「表空了」**方向：它会顺带要求「**别的**降级项也都不许在」，
    //   而本文件的前一条用例（`路径三`）刚好在盘上留了一条 `write` ——
    //   ⇒ 这条断言能不能过，取决于**前面那条用例跑没跑**、跑成什么样。
    //   正确的问法是「**写侧那条降级项**有没有被清掉」。
    expect(
      saveDegradations().map((d) => d.key),
      '🔴 写成功了，`write` 降级项却还在 —— 面板会一直挂着「存不进去」，' +
        '而存储其实已经好了（家长会反复去查一个已经修好的问题）。',
    ).not.toContain('write')
    expect(storage.data.size, '「重试写入」必须真的写下去一盘 —— 否则它只是个清标志的按钮').toBe(1)
    const panel2 = mount(DebugPanel)
    expect(panel2.text(), '面板要刷新到「没有降级项」').toContain('没有降级项')
  })

  it('⚠️ 按钮的调用链里零 `clearSave`（清档与重试是两件事，M139 专打）', async () => {
    failOneWrite()
    storage.throwOnSet = false

    const panel = mount(DebugPanel)
    await panel.find('button[data-action="retry-save-write"]').trigger('click')

    // ⚠️ **判据读可观测的副作用，不读源码**：改判据抓的是「源码里写了 clearSave」，
    //   而「面板点了清档」真正留下的痕迹是 `removeItem` / `clear` 这两个调用 ——
    //   源码判据抓不到「经由间接包装调用」的那种写法。
    const destructive = storage.calls.filter((call) => call.op === 'remove' || call.op === 'clear')
    expect(destructive, '调试面板点了按钮就把玩家的存档删了').toEqual([])
  })

  it('⚠️ 判据自测：`clearSave` 真被调过时这条会红', () => {
    failOneWrite()
    clearSave()
    const destructive = storage.calls.filter((call) => call.op === 'remove' || call.op === 'clear')
    expect(
      destructive.length,
      '判据自测：清了档竟然没留下 remove 调用，这条守卫是死的',
    ).toBeGreaterThan(0)
  })

  it('没有降级项时不露按钮（不是常驻的死控件）', () => {
    expect(mount(DebugPanel).find('button[data-action="retry-save-write"]').exists()).toBe(false)
  })
})

// ── G117 —— 对局画面上零降级提示 ──────────────────────────────────────────

describe('G117 —— 真渲染出来的对局画面上零降级提示（Story 1.17 / AC-E5、AC-E6）', () => {
  // ⚠️ AC-E6 逐字要求这条挂在**真挂载的 DOM** 上，不是扫源码了事 ——
  //   面板自己不存在时，「对局画面没有降级提示」当然成立，那种测法恒绿。
  const BANNED = /图片加载失败|图片缺失|音频不可用|音效不可用|存档写入失败|存档不可用|降级/

  it('三源都有降级项时，`<LevelView />` 上仍找不到任何一句提示', () => {
    markAssetDegraded('/assets/words/apple.svg', '图片缺失')
    storage.throwOnSet = true
    writeSave({ currentUnitIndex: 0, masteredWordIds: [] }, state.value)

    const view = mount(LevelView)
    expect(view.find('img').exists(), '前置：这一版必须真的渲染出了图片，否则测的是空气').toBe(true)
    expect(view.text(), '对局画面上出现了一句降级提示（NFR13 / 裁决 13）').not.toMatch(BANNED)
  })

  it('⚠️ 卡面占位形状不是降级提示（裁决 13）：图挂了就换占位，但一句说明都不许出现', async () => {
    const view = mount(LevelView)
    const img = view.findAll('img')[0]
    expect(img.exists(), '前置：这一版必须真的渲染出了图片').toBe(true)

    await img.trigger('error')
    await view.vm.$nextTick()

    // 降级**确实发生了** —— 这是本例的前置断言：只判「提示为 0」的话，
    // 「图根本没挂」和「图挂了但提示为 0」会一起通过。
    expect(assetDegradations().length, '前置：那次 error 必须真的登记成降级项').toBeGreaterThan(0)
    expect(view.text(), '图片失败后对局画面上出现了说明性文案').not.toMatch(BANNED)
  })

  it('反向自测：`BANNED` 真的能抓到那几句话（否则这条守卫恒绿）', () => {
    expect('塔图图片加载失败，请检查网络'.match(BANNED)).not.toBeNull()
    expect('存档写入失败'.match(BANNED)).not.toBeNull()
    expect('音效不可用'.match(BANNED)).not.toBeNull()
    expect('已降级为内联占位图形'.match(BANNED)).not.toBeNull()
    // ⚠️ **正向那一档**：既有卡面文案一个字都不许误伤。
    expect('apple'.match(BANNED)).toBeNull()
    expect('选一个吧'.match(BANNED)).toBeNull()
  })
})

// ── 夹具自测 ──────────────────────────────────────────────────────────────

describe('夹具自测 —— `stripComments` 与本文件的形态对得上', () => {
  it('注释里的降级词不该被算成源码命中', () => {
    const stripped = stripComments('// 这里会 markAssetDegraded(url)\nconst a = 1\n')
    expect(stripped).toMatch(/const a = 1/)
    expect(stripped).not.toMatch(/markAssetDegraded/)
  })
})

// ── [CR] 2026-10-17 —— 变更信号（版本号 + 订阅）──────────────────────────
describe('[CR 2026-10-17] 登记与清除**两条路**都要发信号', () => {
  it('登记一条：版本号递增 **且** 订阅被调用', () => {
    const before = assetDegradationsVersion()
    let fired = 0
    const off = onAssetDegradationsChanged(() => {
      fired += 1
    })

    markAssetDegraded('/words/apple.svg', '词图加载失败')

    expect(assetDegradationsVersion(), '版本号没涨').toBeGreaterThan(before)
    expect(fired, '订阅没被调用').toBe(1)
    off()
  })

  // ⚠️📎 **清除也必须发信号** —— 面板上「降级项消失了」同样是一条要刷新的消息。
  //   只判「登记」的那条在 `clearAssetDegradationsForTest` 漏掉通知时**照样绿**
  //   （评审变异时实测过），所以这两条必须成对。
  it('清除：版本号递增 **且** 订阅被调用（「好了」也得刷）', () => {
    markAssetDegraded('/words/apple.svg', '词图加载失败')
    const before = assetDegradationsVersion()
    let fired = 0
    const off = onAssetDegradationsChanged(() => {
      fired += 1
    })

    clearAssetDegradationsForTest()

    expect(assetDegradations(), '前置：真的清空了').toHaveLength(0)
    expect(assetDegradationsVersion(), '清空没涨版本号').toBeGreaterThan(before)
    expect(fired, '清空没通知 —— 面板会一直挂着一条已经不生效的降级项').toBe(1)
    off()
  })

  it('同一条降级项重复登记也要发信号（理由变了也是一条消息）', () => {
    markAssetDegraded('/words/apple.svg', '第一次的理由')
    let fired = 0
    const off = onAssetDegradationsChanged(() => {
      fired += 1
    })

    markAssetDegraded('/words/apple.svg', '第二次的理由')

    expect(fired, '重复登记被当成「没变化」—— 面板上的理由会停在第一次').toBe(1)
    expect(assetDegradations()[0]?.reason).toBe('第二次的理由')
    off()
  })

  it('退订之后不再被调用', () => {
    let fired = 0
    const off = onAssetDegradationsChanged(() => {
      fired += 1
    })
    off()

    markAssetDegraded('/words/apple.svg', '词图加载失败')

    expect(fired, '退订之后还被回调 —— 模块级监听者集合漏了清理').toBe(0)
  })
})
