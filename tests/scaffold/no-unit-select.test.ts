/**
 * G92 —— `views/` 下**零** `UnitSelectView`（Story 1.16 / AC-B3 的作用域前提）。
 *
 * ── 这条禁令是什么 ────────────────────────────────────────────────────────
 * `game-architecture.md` 逐字写着：
 *   「⚠️ **`views/` 下没有 `UnitSelectView`，且不应新增。**」
 * 理由同一段也逐字给了：
 *   「若将来确实需要选关，那是范围变更，须先改 GDD 与 epics，而不是先建目录。」
 *
 * 🚨 **为什么以前没有守卫，而这条禁令恰好是最容易被违反的一条**：
 *   架构图里曾经列着 `StartView / LevelView / UnitSelectView` 三个视图，
 *   而那一行是被 `[IR]` 评审判定为 HIGH-3 之后才改掉的。实现者照着**旧架构图**
 *   建一个 `UnitSelectView.vue` 是完全合理的行为 —— 而 GDD 的 Out-of-Scope
 *   核对表恰恰把「多单元并行 / 选关自由」列为**最易被违反**的项之一。
 *   ⇒ 一条「不许存在」的禁令，恰恰是那种「谁也不会特意去守、但一定会被人顺手建出来」的。
 *
 * ── 为什么它属于「脚手架边界」而不是某个业务 story 的守卫 ────────────────
 *   它守的是**目录形状**，与关卡流程、题单、HUD 都无关。
 *   放在 `tests/scaffold/` 里，语义是「这个仓库不许长出这个文件」——
 *   和 `core/` 的 DOM 禁令、`views/` 的清单是同一族。
 */

import { existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const SRC = fileURLToPath(new URL('../../src/', import.meta.url))

/** `src/` 下所有文件（递归），路径以 `src/` 开头。 */
function allSourceFiles(dir = SRC): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...allSourceFiles(full))
      continue
    }
    out.push(full)
  }
  return out
}

describe('G92 —— 零 `UnitSelectView`（GDD：无选关自由，架构明令不应新增）', () => {
  it('`src/` 下不存在任何名为 `UnitSelectView` 的文件', () => {
    const offenders = allSourceFiles().filter((p) => /UnitSelectView/.test(p))

    expect(
      offenders,
      'GDD 逐字：「跨单元线性推进 —— 单一进度线，无多单元并行，无选关自由」，' +
        '且 architecture 逐字「`views/` 下没有 `UnitSelectView`，且不应新增」。' +
        '真需要选关是**范围变更**：先改 GDD 与 epics，再谈文件。发现的文件：\n' +
        offenders.join('\n'),
    ).toEqual([])
  })

  it('反向自测：判据能咬住违规（M108 的前提）', () => {
    // ⚠️ **这条不许省**（R-51）：本守卫是纯粹的「文件名不存在」型断言，
    //   而这类判据最典型的假绿形态是**路径写错 / 大小写不符 / 递归没生效** ——
    //   那样它会永远绿，而且绿得毫无意义。
    //   ⇒ 先证明「判据确实能在一份真实的文件清单上命中」。
    const probe = allSourceFiles().concat([join(SRC, 'views', 'UnitSelectView.vue')])

    expect(
      probe.filter((p) => /UnitSelectView/.test(p)),
      '判据自检：塞进 `views/UnitSelectView.vue` 之后必须被判中',
    ).toHaveLength(1)
  })

  it('反向自测：`views/` 目录本身必须真的被扫到（判据没在扫空气）', () => {
    // ⚠️ 第二半自检：上一条只证明了「正则在字符串上能命中」，
    //   没证明「递归真的走进了 `views/`」。目录名写错一个字母就全盘失效。
    expect(existsSync(join(SRC, 'views')), '判据自检：`src/views/` 必须存在').toBe(true)
    expect(
      allSourceFiles().some((p) => p.endsWith(join('views', 'LevelView.vue'))),
      '判据自检：递归必须扫得到 `views/` 里的既有文件',
    ).toBe(true)
  })
})
