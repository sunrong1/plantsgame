/**
 * 塔 / 僵尸图的 URL 出处（Story 1.10 / AC-4 / 裁决 3）。
 *
 * ── 为什么这个文件存在 ────────────────────────────────────────────────────
 * 迁移前这三个常量住在 `scripts/validate-content.ts:92-98`，注释逐字写着
 * 「Story 1.10 拼 `<img src>` 时照此拼」。照抄的后果是**部署后四张图全 404**：
 * 那三行硬编码根路径 `/assets/...`，而 `vite.config.ts:12` 的 `base` 是
 * `/plantsgame/` —— 浏览器会去 `https://<host>/assets/towers/direct.svg` 找，
 * 而文件实际在 `/plantsgame/assets/towers/direct.svg`。
 *
 * 这与 Story 1.2 修过的录音 404 **完全同源**，而当时的守卫
 * `tests/scaffold/deployment-base.test.ts:41-47` **只断言录音，零守卫** ——
 * 「录音跟着 base 走了」不等于「塔图也跟着 base 走了」。本 story 的 G16 补上后者。
 *
 * ── 为什么必须接 `import.meta.env.BASE_URL` ───────────────────────────────
 * `[GA]:304`：图片不进入 JS bundle，必须 URL 引用而非 `import`。
 * `import.meta.env.BASE_URL` 自带尾斜杠（`/plantsgame/`），**不要再拼一个** ——
 * 拼出 `/plantsgame//assets/...` 在多数服务器上仍能命中，但在开了严格
 * 路径规范化的地方会 404，而本地 `vite dev` 完全正常 ⇒ 只在部署后暴露。
 *
 * ── 边界 ──────────────────────────────────────────────────────────────────
 * · 本模块是**唯一**出处。`scripts/validate-content.ts` 改为 import 它，
 *   不再保留第二份实现（两份实现漂移起来，两边都绿）。
 * · ⚠️ **`WORD_IMAGE_URL_PREFIX` / `expectedImageUrl()` 不在这里，也一个字都不许动**
 *   —— 那是**内容 JSON 里存的值的判据**（`unit-01.json` 里 30 张词图的
 *   `imageSrc` 全部是无 base 的 `/assets/words/unit-01/u1-dog.svg`）。
 *   JSON 存什么就校验什么；词图在运行时怎么接 base 属 Story 1.11 / 1.18。
 *
 * ── 刻意不做的事 ──────────────────────────────────────────────────────────
 * · **不 import `TOWER_TYPES` 枚举**：那是「应有哪几个文件」的集合推导，
 *   属校验层（`validate-content.ts` 的 `expectedTowerAssetNames()`）。
 *   本模块只负责「已知的某个塔型 → 它的 URL」。
 * · **不做磁盘存在性检查**：本模块在浏览器里跑，不得触碰 `node:fs`。
 *   存在性由守卫 G16 在 Node 侧做。
 */

import type { TowerType } from '../core'

/** 塔图 URL 前缀。**带 base** —— 直接给 `<img src>` 用。 */
export const TOWER_ASSET_URL_PREFIX = `${import.meta.env.BASE_URL}assets/towers`

/** 僵尸图 URL。**带 base**。恒定，不带任何单元或类型前缀（FR71：通用敌人）。 */
export const ZOMBIE_ASSET_URL = `${import.meta.env.BASE_URL}assets/zombies/zombie.svg`

/**
 * 塔型的规范 URL。文件名 = `towerType` 字面量，**不带 `u1-` 单元前缀**。
 *
 * ⚠️ FR70：美术成本不随词汇增长 —— 一张 `direct.svg` 服务全部单元的直射塔。
 *   词图才带单元前缀（`u1-dog.svg`）。**两套命名规则相反，别混。**
 *
 *   另一处易混：塔型字面量是 `direct`，而色板 token 叫 `--color-tower-shooter`
 *   （1.6 的历史命名）。**别顺着其中一个改另一个**。
 */
export function expectedTowerAssetUrl(towerType: TowerType): string {
  return `${TOWER_ASSET_URL_PREFIX}/${towerType}.svg`
}

/**
 * 去掉 base 前缀，得到相对 `public/` 的路径（`/assets/towers/direct.svg`）。
 *
 * 守卫 G16 用它把 URL 落到磁盘上比对（`public/` + 本函数的返回值）。
 *
 * ⚠️ **本函数刻意不校验「URL 是否真的带 base」。** 那是守卫的判据 (a)，
 *   由 G16 单独断言。若这里顺手抛错，变异 M41（去掉 base 前缀）就会在
 *   **调用点**炸掉而不是在**判据**里变红 —— 那就变成「运行时崩了」，
 *   而不是「守卫抓到了回归」。两者是不同的证据，不能互相顶替。
 *
 * 未带 base 时原样返回（而不是抛错或返回空串），理由同上。
 */
export function assetPathWithinPublic(url: string): string {
  const base = import.meta.env.BASE_URL
  return url.startsWith(base) ? url.slice(base.length) : url
}
