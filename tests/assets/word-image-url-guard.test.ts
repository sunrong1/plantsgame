/**
 * **G22** —— 词图 URL 接 `BASE_URL` 的守卫（Story 1.11 / AC-B1）。
 *
 * ── 这个守卫守什么 ────────────────────────────────────────────────────────
 * 30 张单词卡 × 4 个图片选项 = **120 个 `imageSrc`**，每一个都要能：
 *   (a) 拼出以 `import.meta.env.BASE_URL` 开头的 URL
 *   (b) 去掉 base 后，在磁盘上**真实存在**
 *   (c) 文件名 === 该选项的 `option.id`
 *
 * ⚠️ **必须是 120 而不是 30。** 判据 (c)「文件名 === 选项 id」天然是**逐选项**的：
 *   只查 30 个（每卡一张）会漏掉「某张卡的另外三个选项 URL 拼错」，
 *   而那恰恰是最可能出的错（选项多、来源杂，最容易照抄错一个）。
 *
 * ⚠️ **判据 (a) 在本地永远是绿的，别以为它有鉴别力。**
 *   `vite.config.ts` 的 `base` 与 `vitest.config.ts` 的 `test.env.BASE_URL`
 *   **都是 `/plantsgame/`** ⇒ 「以 BASE_URL 开头」在本地恒成立。
 *   ⇒ **G22 的全部鉴别力落在 (b) 与 (c) 上**，这也是 M48 改 `wordImageUrl` 时
 *   本守卫会变红的原因（(a) 从 base 开头变成不以 ⇒ 120 条一起红）。
 *
 * ── 判据纪律（Story 1.9 的 P0）────────────────────────────────────────────
 *   判据**只有一份**：`imageSrc` 一律经**实现自己导出的** `wordImageUrl()` 拼，
 *   本文件不重抄前缀常量。1.9 的 P0 就是「判据被抄多份 ⇒ 真守卫整体停用也全绿」。
 *   (b) 的去 base 复用实现里的逆运算 `assetPathWithinPublic()`。
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { assetPathWithinPublic, wordImageUrl } from '../../src/services/asset-url'
import { entriesOf } from '../../src/content'
import type { ImageOption } from '../../src/core'

const root = process.cwd()

/** 单元 1 全部条目里带图的选项 —— 逐个展开，不抽样、不去重。 */
const imageOptions: readonly ImageOption[] = entriesOf(1).flatMap((entry) =>
  entry.card.options.filter((option): option is ImageOption => 'imageSrc' in option),
)

describe('G22 —— 120 个词图 URL 逐个实算', () => {
  it('单元 1 恰好有 120 个图片选项（判据 (a)(b)(c) 的作用范围本身也是判据）', () => {
    // 少一个选项，上面三条断言的覆盖面就少一个 —— 覆盖范围必须是显式的。
    expect(imageOptions).toHaveLength(120)
  })

  it.each(imageOptions.map((o) => [o.id, o] as const))(
    '%s —— (a) 带 base、(b) 去 base 后磁盘存在、(c) 文件名 === 选项 id',
    (_id, option) => {
      const url = wordImageUrl(option.imageSrc)

      // (a) 带 base。⚠️ 本地恒绿 —— 鉴别力在 (b)(c)，见文件头。
      expect(url.startsWith(import.meta.env.BASE_URL)).toBe(true)

      // (b) 去掉 base 后在磁盘上真实存在（不是比对某个常量 —— 「文件存在」≠「文件正确」）。
      const onDisk = join(root, 'public', assetPathWithinPublic(url))
      expect(existsSync(onDisk), `词图 ${option.imageSrc} 在磁盘上不存在：${onDisk}`).toBe(true)

      // (c) 文件名 === 该选项的 id。
      expect(url.slice(url.lastIndexOf('/') + 1)).toBe(`${option.id}.svg`)
    },
  )
})

describe('G22 补充 —— 判据本身有鉴别力（防「空守卫全绿」）', () => {
  it('反向：把 base 去掉（变异 M48）—— 120 个 URL 全部不再以 BASE_URL 开头', () => {
    // M48 的实算复现：不改实现，只把判据问的输入换成「没接 base 的那条路径」。
    const base = import.meta.env.BASE_URL
    const broken = imageOptions.map((o) => o.imageSrc)

    expect(broken.filter((u) => u.startsWith(base))).toHaveLength(0)
  })

  it('反向：去 base 用的 assetPathWithinPublic 真的能把 base 摘掉', () => {
    const url = wordImageUrl('/assets/words/unit-01/u1-dog.svg')

    expect(url).not.toBe('/assets/words/unit-01/u1-dog.svg')
    // ⚠️ **据实记录往返形状，不宣称「严格互逆」**：`wordImageUrl` 为避免
    //   `/plantsgame//assets/...` 的双斜杠而剥掉了 `imageSrc` 的首斜杠，
    //   而 `assetPathWithinPublic`（G16 塔图那条判据的依赖，签名与行为都不许动）
    //   只摘 base、不把首斜杠补回去 ⇒ 往返得到的是**相对** `public/` 的路径。
    //   G22 (b) 用 `join(root, 'public', …)` 落盘，两种形状命中同一文件，
    //   所以 (b) 不受这个差异影响 —— 但把它写成「互逆」会是假的。
    expect(assetPathWithinPublic(url)).toBe('assets/words/unit-01/u1-dog.svg')
    expect(join(root, 'public', assetPathWithinPublic(url))).toBe(
      join(root, 'public', 'assets/words/unit-01/u1-dog.svg'),
    )
  })

  it('内容 JSON 里的 imageSrc 一律是**无 base**的（base 是运行时拼的，不进数据）', () => {
    // 这一条守的是「不在数据层预拼 base」：JSON 若存了带 base 的路径，
    // 部署前缀一变就整体对不上，而 validate:content 只校验 JSON 内部自洽。
    const raw = readFileSync(join(root, 'src/content/units/unit-01.json'), 'utf8')

    expect(raw).toContain('"imageSrc": "/assets/words/unit-01/')
    expect(raw).not.toContain('"imageSrc": "/plantsgame/')
  })
})
