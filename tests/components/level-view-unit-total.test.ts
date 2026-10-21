/**
 * @vitest-environment jsdom
 */

/**
 * `LevelView.vue` 里 `unitTotal` 的**降级行为**守卫（G221 / Story 1.15 AC-D3）。
 *
 * ── 这个文件补的是一个「已修但没人守」的洞 ──────────────────────────────────
 * 1.13 dismissed 掉的那条（`deferred-work.md`「1.15 读档后的第一条失败链」）
 * 在 1.15 里**确实修好了**：`LevelView.vue` 的 `unitTotal` computed 加了 try/catch，
 * 取不到单元就退回 `0` 并记一条 WARN。
 *
 * 🔥 **但那条回填记录写着「守卫 G84」—— G84 是 `save.ts` 的 import 扫描
 *   （`只 import ../core`，零 Vue / 零 app/），与 `LevelView.vue` 的渲染期兜底毫无关系。
 *   真正的 ESLint + `Linter.verify` 那条是 **G83**（禁 await 名单不含 `save.ts`）。
 *   ⇒ 两处守卫编号都是错的，而且**没有任何一条覆盖这个行为**。
 *   这就是 `guard-zero-coverage-is-the-real-crate`：修完不配守卫，
 *   下一轮就会有人照着注释里的「别把 try/catch 删掉」把兜底删了，
 *   而**没有一条测试会变红**。
 *
 * ── 为什么这条 try/catch 是**承重**的，不是「构造上不可达」 ────────────────
 * `LevelView.vue` 的注释自己写着「今天 `state.unitNumber` 恒为 1，所以抛不出来」——
 * 那句对**新建**的对局成立，对**读档**不成立：
 * · 1.15 让 `restoreFromSave()` 把盘上的 `State` 整份喂回 `state.value`，
 *   `unitNumber` 因此**来自磁盘**（孩子换设备 / 内容回滚 / 别人手改 localStorage 都会遇到）。
 * · `assertInvariants()` **不检查 `unitNumber`** —— 实测：它只查 grid/towers/deck/
 *   phase/计数器/塔型/僵尸/实体 id，一处都没提单元号。
 *   ⇒ 一份 `unitNumber: 99` 但题单合法的存档**能通过不变量检查**，
 *   随后在**渲染期**撞上 `entriesOf(99)`。
 * · 而 computed 在渲染期抛 ⇒ Vue 整个 `LevelView` 渲染失败 ⇒ **整页白屏**，
 *   正撞架构 `:563`「孩子面前永不出现技术错误」。
 *
 * ⇒ 本文件把这些逐条钉住，且**每条都带前置自检**，免得哪天前提变了判据跟着空转
 *   （R-51：判据的鉴别力必须实测，不能靠「配对了」自证）。
 *
 * ── 判据为什么选「读 prop」而不是「读渲染出来的文本」 ───────────────────────
 * `unitTotal === 0` 时 `progressDisplay` 取 `ratio = 0`，文本是「第 N 单元 · 0/0」。
 * 断言文本也能过，但**读 prop 更贴近故障点**（分母本身就是那个值），
 * 且不受文案改动影响 —— 文案不是这条 AC 的判据。
 */

import { mount, enableAutoUnmount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { entriesOf } from '../../src/content'
import { assertInvariants, createInitialState } from '../../src/core'
import type { State } from '../../src/core'
import { state } from '../../src/app/store'
import ProgressBar from '../../src/components/hud/ProgressBar.vue'
import LevelView from '../../src/views/LevelView.vue'

enableAutoUnmount(afterEach)

/** 一个**内容里不存在**的单元号 —— 存档被手改 / 内容回滚时的真实形状。 */
const MISSING_UNIT = 99

function freshState(): State {
  return createInitialState({ unitNumber: 1, deck: entriesOf(1) })
}

let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  warn.mockRestore()
  state.value = freshState()
})

describe('G221 —— unitTotal 取不到单元时退回 0（AC-D3 / deferred 1.13 dismissed 第 1 条）', () => {
  it('前置：entriesOf(99) 真的抛，且 assertInvariants 放它过关', () => {
    // ⚠️ **这两条前置不是装饰**。整个守卫建立在「不变量检查不认单元号」这个前提上；
    //   哪天 `assertInvariants` 学会了查单元号、或者 `entriesOf` 对未知单元改成
    //   返回空数组，本文件就整条失效 —— 而失效时它是**全绿**的。
    //   ⇒ 把前提本身也断言出来，前提塌了当场红，而不是留一条恒绿的假覆盖。
    expect(() => entriesOf(MISSING_UNIT), '内容层必须对未知单元抛 —— 兜底才有东西可接').toThrow()

    const bogus: State = { ...freshState(), unitNumber: MISSING_UNIT }
    expect(
      () => assertInvariants(bogus),
      '🔴 `assertInvariants` 开始查 unitNumber 了 —— 那么读档就拦得住，' +
        '本文件守的「渲染期兜底」不再承重。前置塌了就该重新评估这条 try/catch 的去留。',
    ).not.toThrow()
  })

  it('state.unitNumber 指向不存在的单元时，LevelView 照常挂载且分母退回 0', async () => {
    state.value = { ...freshState(), unitNumber: MISSING_UNIT }

    const wrapper = mount(LevelView)
    await wrapper.vm.$nextTick()

    // 🔥 这才是本守卫的主断言：**渲染期不得抛**。
    //   没有它，上面「前置」那条只能证明 `entriesOf` 会抛，
    //   证明不了「有人在抛之前接住了」。
    expect(
      wrapper.findComponent(ProgressBar).exists(),
      'ProgressBar 必须真的挂上 —— 没挂上说明 LevelView 渲染失败了，那正是本守卫要挡的事',
    ).toBe(true)
    expect(
      wrapper.findComponent(ProgressBar).props('unitTotal'),
      '🔴 取不到单元却没有退回 0 —— 这一处抛出去会让整个 LevelView 白屏（架构 :563）',
    ).toBe(0)
  })

  it('退回 0 时只记一条 [hud] WARN，且不得出现 alert / confirm', () => {
    state.value = { ...freshState(), unitNumber: MISSING_UNIT }

    mount(LevelView)

    const hudWarns = warn.mock.calls.filter((c: unknown[]) => String(c[0]).startsWith('[hud]'))
    expect(
      hudWarns.length,
      '必须**恰好**一条 [hud] WARN —— 少了是静默降级（家长看不到原因），多了是渲染期在反复重试',
    ).toBe(1)
    expect(
      String(hudWarns[0][0]),
      'WARN 里必须点名是哪个单元取不到，否则家长看到「进度条空了」却不知道内容回滚了',
    ).toContain(String(MISSING_UNIT))
  })

  it('反向自测：把 try/catch 拿掉，本文件的主断言必红', () => {
    // ⚠️ **不能靠改生产代码做变异**（并发 session 会打架，且 R-34 禁 shell 改文件），
    //   也不能在测试里 import 一份「没有 try/catch 的副本」—— 那验证的是副本，不是产物。
    //   ⇒ 判据的可迁移性用**判据本体**证明：把同样的两条断言套在一个
    //   **刻意会抛**的计算上，看它是不是真的红（R-53 判据自测）。
    const throwingComputed = (): number => entriesOf(MISSING_UNIT).length
    expect(
      () => throwingComputed(),
      '判据自检：一个没有 try/catch 的同型 computed 在这份存档下**确实**会抛',
    ).toThrow()
    // 而有兜底的那个（生产代码）不抛 —— 这正是两条断言之间的全部差别。
    state.value = { ...freshState(), unitNumber: MISSING_UNIT }
    expect(() => mount(LevelView), '兜底后的同型计算不得抛 —— 这条绿、上面那条红，才说明兜底在起作用').not.toThrow()
  })

  it('正常单元号不受这条兜底影响（防止 try/catch 变成「一律返回 0」）', async () => {
    state.value = freshState()

    const wrapper = mount(LevelView)
    await wrapper.vm.$nextTick()

    expect(
      wrapper.findComponent(ProgressBar).props('unitTotal'),
      '🔴 兜底把正常单元的进度条也清成 0 了 —— 孩子会看到「这个单元一个词都没有」',
    ).toBe(entriesOf(1).length)
    expect(
      warn.mock.calls.filter((c: unknown[]) => String(c[0]).startsWith('[hud]')).length,
      '正常路径一条 [hud] WARN 都不该有',
    ).toBe(0)
  })
})
