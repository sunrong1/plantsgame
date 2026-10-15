/**
 * G16 —— 塔 / 僵尸图 URL 的守卫（Story 1.10 / AC-4，变异 M41 / M45）。
 *
 * ── 守什么，以及为什么这条值得单独立一个文件 ──────────────────────────────
 * Story 1.2 修过一次录音 404：硬编码 `/assets/audio/...` 而部署 base 是
 * `/plantsgame/`。当时的守卫 `deployment-base.test.ts:41-47` **只断言录音**，
 * 于是塔图与僵尸图原样保留同样的写法，直到 Story 1.10 才发现它们部署后同样全 404。
 * 「录音跟着 base 走了」不等于「所有资产跟着 base 走了」—— 那条守卫当时问的问题太窄。
 *
 * 本文件把资产 URL 的判据扩到**全部** `<img>` 资产，并加上 AC-4 要求的第 (c) 条：
 * **塔图文件名 === `towerType` 字面量**。
 *
 * ── 三条纪律（Story 1.9 的 P0 换来的）──────────────────────────────────────
 * 1. **判据只有一份** —— `g16Violations()` 既是真守卫的本体，也是 M41 / M45 变异
 *    用例所问的那一个函数。绝不「另抄一份判据自己判红」。
 * 2. **变异问的是「守卫会不会红」，不是「我抄的判据会不会红」。**
 * 3. **不许拿子串匹配当主判据** —— 「源码里出现了 BASE_URL 这几个字母」证明不了
 *    拼出来的 URL 对不对；反过来只看拼出来的 URL 也证明不了它是从 env 读的而不是
 *    把 base 值写死了。两条各管一段，见下面两个 `describe`。
 *
 * 不在 src/core/ 下 —— NFR16：测试全部在 tests/。
 */

import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { TOWER_TYPES } from '../../src/core'
import { TOWER_ASSET_URL_PREFIX, ZOMBIE_ASSET_URL, assetPathWithinPublic, expectedTowerAssetUrl } from '../../src/services/asset-url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const publicDir = join(root, 'public')

/** 本文件里出现的 base。`vitest.config.ts` 的 `test.env.BASE_URL` 就是它 —— 动那个值这里跟着变。 */
const BASE_URL = '/plantsgame/'

// ── 判据 —— **真守卫与变异共用同一份** ────────────────────────────────────────

/**
 * URL 来源。做成可注入的，是为了让 M41 / M45 能问**同一个判据**，
 * 而不是各自造一份「明显会红」的假判据。
 */
export interface UrlSource {
  /** 给定塔型返回它的图 URL。 */
  readonly towerUrl: (towerType: (typeof TOWER_TYPES)[number]) => string
  /** 返回僵尸图 URL。 */
  readonly zombieUrl: () => string
  /** 塔图 URL 前缀（判据 (a) 要逐条 URL 校验，这里只用于报错文案）。 */
  readonly towerPrefix: string
}

/** 生产实现 —— 真守卫喂的就是它。 */
const PRODUCTION: UrlSource = {
  towerUrl: expectedTowerAssetUrl,
  zombieUrl: () => ZOMBIE_ASSET_URL,
  towerPrefix: TOWER_ASSET_URL_PREFIX,
}

/**
 * G16 的全部判据。返回**违规原因列表**，空列表 = 合规。
 *
 * 三条判据（AC-4 逐字）：
 *   (a) URL 以 `BASE_URL` 开头
 *   (b) 去掉 base 后在磁盘上真实存在
 *   (c) 塔图文件名 === `towerType` 字面量
 *
 * ⚠️ 判据 (b) 里的 `publicDir` 是**参数**，不是模块常量 ——
 *   M45 要把资产拷到临时目录再删掉一个文件，问的还是这个函数。
 */
export function g16Violations(source: UrlSource, assetsRoot: string, baseUrl: string): string[] {
  const violations: string[] = []

  const checkOne = (label: string, url: string, expectedBaseName: string): void => {
    // (a) 必须带 base。少了它，部署后浏览器会去站点根目录找这张图 ⇒ 404。
    if (!url.startsWith(baseUrl)) {
      violations.push(`${label}：URL "${url}" 不以 base "${baseUrl}" 开头 —— 部署后这张图会 404`)
      return
    }
    // (c) 文件名 === 字面量。这一条同时挡两种错：
    //     把 `direct` 拼成 `shooter`（塔型叫 direct、色板 token 叫 tower-shooter，
    //     两处历史命名相反，见 asset-url.ts 的注释），以及漏掉 `.svg` 后缀。
    if (!url.endsWith(`/${expectedBaseName}.svg`)) {
      violations.push(`${label}：URL "${url}" 的文件名不是 "${expectedBaseName}.svg" —— 塔图文件名必须 === towerType 字面量`)
    }
    // (b) 去掉 base 后落到磁盘上真实存在。
    //     ⚠️ 这一条是「文件存在」而不是「文件正确」—— 后者由 asset-geometry.test.ts 的
    //     G1–G8 负责。这里守的是**路径拼得对不对**，不是图画得好不好。
    const onDisk = join(assetsRoot, assetPathWithinPublic(url))
    if (!existsSync(onDisk)) {
      violations.push(`${label}：去掉 base 后 "${assetPathWithinPublic(url)}" 在 ${assetsRoot} 下不存在 —— 拼出来的路径指向一个不存在的文件`)
    }
  }

  for (const towerType of TOWER_TYPES) {
    checkOne(`塔图 ${towerType}`, source.towerUrl(towerType), towerType)
  }
  checkOne('僵尸图', source.zombieUrl(), 'zombie')
  return violations
}

// ── 真守卫 ────────────────────────────────────────────────────────────────────

describe('G16 —— 塔 / 僵尸图 URL 跟着部署 base 走，且与磁盘一致', () => {
  it('三张塔图 + 一张僵尸图全部通过 (a)(b)(c) 三条判据', () => {
    expect(
      g16Violations(PRODUCTION, publicDir, BASE_URL),
      '塔 / 僵尸图 URL 没跟上部署 base，或与磁盘上的文件对不上 —— ' +
        '这与 Story 1.2 修过的录音 404 完全同源，而当时的守卫只断言了录音',
    ).toEqual([])
  })

  it('覆盖面是 3 张塔图 + 1 张僵尸图，一张都不漏', () => {
    // 「一个不漏」本身要成为可断言的事实 —— 否则某个恒真的构造会让上面那条永远绿。
    expect(TOWER_TYPES).toHaveLength(3)
    expect(g16Violations(PRODUCTION, publicDir, BASE_URL)).toEqual([])
    expect(existsSync(join(publicDir, 'assets/towers/direct.svg'))).toBe(true)
    expect(existsSync(join(publicDir, 'assets/towers/slow.svg'))).toBe(true)
    expect(existsSync(join(publicDir, 'assets/towers/aoe.svg'))).toBe(true)
    expect(existsSync(join(publicDir, 'assets/zombies/zombie.svg'))).toBe(true)
  })
})

/**
 * 剥掉块注释与行注释，只留代码。
 *
 * ⚠️ **这是本文件所有源码匹配的强制前置**，与 `asset-geometry.test.ts:16-31`
 *   「剥注释是所有匹配的前置」同源。本文件第一版就漏了它：判据问
 *   「`asset-url.ts` 里有没有写死 `/plantsgame/`」，而那个字面量**确实出现在文件里**
 *   —— 在解释「为什么不能写死」的那段注释中 ⇒ 守卫立刻变红，而代码完全正确。
 *   那是一条**误报**，而会误报的守卫会被当成噪声忽略（AC-13 最后一行）。
 *
 * 不剥注释的后果不是「偶尔误报」，而是**任何人都必须在源码里删掉解释性注释**
 * 才能让测试变绿 —— 那会把文档纪律和代码纪律拧反。
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

// 判据 (a) 只看「拼出来的 URL 对不对」，看不出它是从 env 读的。
// 下面这条守的是另一半：把 base 的**值**写死（而不是读 `import.meta.env.BASE_URL`）
// 会让「换一个部署前缀就全 404」这件事在本地完全测不出来 ——
// 本地 dev 的 base 也是 /plantsgame/，两边一致 ⇒ 永远是绿的。
describe('G16 补充 —— base 必须从 import.meta.env 读，不是把值写死', () => {
  const code = stripComments(readFileSync(join(root, 'src/services/asset-url.ts'), 'utf8'))

  it('asset-url.ts 引用了 import.meta.env.BASE_URL', () => {
    expect(
      code,
      'asset-url.ts 里没有 import.meta.env.BASE_URL —— 若把 "/plantsgame/" 的值直接写死，' +
        '本地 dev 与本仓库的部署恰好同前缀所以测不出来，换个部署路径就全 404',
    ).toContain('import.meta.env.BASE_URL')
  })

  it('反向：代码里没有写死的 "/plantsgame/" 字面量（注释里可以写，那是在解释这件事）', () => {
    expect(
      code,
      'asset-url.ts 的**代码**里出现了写死的 "/plantsgame/" —— 见上面那条的理由。' +
        '（注释里出现是正常的，本文件开头就在解释为什么不能写死。）',
    ).not.toContain('/plantsgame/')
  })

  it('反向：剥注释这件事本身有效 —— 不剥的话同一条判据会误报', () => {
    // 变异：把上面的判据退回「不剥注释」，它立刻变红。
    // 没有这条，剥注释就只是一个「看起来更严谨」的装饰 ——
    // 而「装饰性的严谨」正是本仓库反复抓到的假绿形态。
    const raw = readFileSync(join(root, 'src/services/asset-url.ts'), 'utf8')

    expect(raw, '剥注释失效 ⇒ 本文件的源码匹配全部退回误报状态').toContain('/plantsgame/')
    expect(stripComments(raw)).not.toContain('/plantsgame/')
  })
})

// ── 变异 M41 ──────────────────────────────────────────────────────────────────

describe('M41 —— 从 asset-url.ts 去掉 BASE_URL 前缀，G16 必须红', () => {
  it('三条判据同时报出违规', () => {
    // 模拟「asset-url.ts 写成 `assets/towers` 而不是 `${import.meta.env.BASE_URL}assets/towers`」。
    // 问的是**同一个** g16Violations —— 不是另抄一份判据。
    const withoutBase: UrlSource = {
      towerUrl: (towerType) => `assets/towers/${towerType}.svg`,
      zombieUrl: () => 'assets/zombies/zombie.svg',
      towerPrefix: 'assets/towers',
    }

    const violations = g16Violations(withoutBase, publicDir, BASE_URL)

    expect(
      violations.length,
      '去掉 base 之后 G16 一条违规都没报 —— 判据 (a) 失效，' +
        '这正是「部署后四张图全 404 而本地一切正常」那类 bug 能溜过去的原因',
    ).toBe(TOWER_TYPES.length + 1)
    // 四条违规都该指向判据 (a)。
    expect(violations.every((v) => v.includes('不以 base'))).toBe(true)
  })

  it('反向：只去掉 base 但**其余全对**时，仍然必须红 —— 证明不是「别的原因让它红」', () => {
    // 路径除 base 外完全正确。若这个用例是绿的，说明上面的 M41 之所以红是因为别的理由
    // （例如路径也拼错了），那 M41 就证明不了判据 (a)。
    const violations = g16Violations(
      { towerUrl: (t) => `assets/towers/${t}.svg`, zombieUrl: () => 'assets/zombies/zombie.svg', towerPrefix: '' },
      publicDir,
      BASE_URL,
    )

    expect(violations).not.toEqual([])
    // 且必须**只**因 (a) 而红：(b) 此刻无法判定 —— 判据 (a) 不通过时函数就 return 了。
    expect(violations.every((v) => v.includes('不以 base'))).toBe(true)
  })
})

// ── 变异 M45 ──────────────────────────────────────────────────────────────────

describe('M45 —— 删掉一张塔图 / 僵尸图，G16 必须红（G1 守集合，这里守路径）', () => {
  /**
   * 在**临时副本**上删文件再问同一个判据。
   *
   * ⚠️ 仓库磁盘绝不被写：vitest 并行跑同一批测试文件，真实磁盘上的临时状态会被
   *   别的断言读到，失败会指向一个与本用例毫无关系的文件。这是 `asset-geometry.test.ts`
   *   与 `word-image-composition.test.ts` 共有的纪律。
   */
  function withAssetsCopy<T>(drop: readonly string[], run: (dir: string) => T): T {
    const scratch = mkdtempSync(join(tmpdir(), 'asset-url-mutation-'))
    try {
      cpSync(join(publicDir, 'assets'), join(scratch, 'assets'), { recursive: true })
      for (const rel of drop) unlinkSync(join(scratch, 'assets', rel))
      return run(scratch)
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  }

  it('删掉 direct.svg ⇒ 塔图 direct 那一条报「磁盘上不存在」', () => {
    withAssetsCopy(['towers/direct.svg'], (dir) => {
      const violations = g16Violations(PRODUCTION, dir, BASE_URL)

      expect(violations).toHaveLength(1)
      expect(violations[0]).toContain('塔图 direct')
      expect(violations[0]).toContain('不存在')
    })
  })

  it('删掉 zombie.svg ⇒ 僵尸图那一条报「磁盘上不存在」', () => {
    withAssetsCopy(['zombies/zombie.svg'], (dir) => {
      const violations = g16Violations(PRODUCTION, dir, BASE_URL)

      expect(violations).toHaveLength(1)
      expect(violations[0]).toContain('僵尸图')
    })
  })

  it('反向：副本一个文件都不删 ⇒ 零违规（证明上一条不是因为「临时目录」本身而红）', () => {
    withAssetsCopy([], (dir) => {
      expect(g16Violations(PRODUCTION, dir, BASE_URL)).toEqual([])
    })
  })

  it('M45 的另一半：文件**改名**也会红（文件名 !== towerType 字面量）', () => {
    // 判据 (c)。塔型字面量是 `direct` 而色板 token 叫 `--color-tower-shooter`
    // —— 两套命名相反，最可能的笔误就是顺着 token 名把文件改成 shooter.svg。
    //
    // ⚠️ 这里断言的是**两条**违规而不是一条：改名之后 (c) 与 (b) 同时不通过
    //   —— 文件名不再是 towerType 字面量，且磁盘上确实没有 shooter.svg。
    //   只断言「至少有一条」会放过「(c) 根本没生效、只是 (b) 在报」这种退化。
    const violations = g16Violations(
      { ...PRODUCTION, towerUrl: (t) => `${BASE_URL}assets/towers/${t === 'direct' ? 'shooter' : t}.svg` },
      publicDir,
      BASE_URL,
    )

    expect(violations).toHaveLength(2)
    expect(violations.some((v) => v.includes('文件名不是 "direct.svg"'))).toBe(true)
    expect(violations.some((v) => v.includes('不存在'))).toBe(true)
  })
})

// ── 变异纪律的自检：判据只有一份 ──────────────────────────────────────────────

describe('判据纪律自检', () => {
  it('g16Violations 是本文件里唯一的判据实现（没有第二份拷贝）', () => {
    // Story 1.9 的 P0：守卫真身与变异各抄一份判据，把真守卫整体停用后全套测试仍全绿。
    // 这里问的不是「测试有没有红」，而是「判据在结构上就只有一处」——
    // 增删判据实现时这条会先红，逼人回来确认是不是抄了第二份。
    //
    // ⚠️ **必须先剥注释**：本文件开头与各处注释里多次逐字提到
    //   `g16Violations()` 这个函数名（那是给人看的说明），不剥就会把它们算成实现。
    //   同理也不能用「本行含 `function g16Violations`」这种自指判据 ——
    //   判据自己的那一行就含这个子串，于是永远命中 2 次。
    const code = stripComments(readFileSync(new URL(import.meta.url).pathname, 'utf8'))
    const definitions = code.split('\n').filter((line) => /^\s*(export\s+)?function g16Violations\b/.test(line))

    expect(definitions, 'g16Violations 出现多于一处实现 —— 守卫与变异必须问同一个函数').toHaveLength(1)
  })

  it('反向：剥注释后本文件确实仍有一处定义（证明上一条不是「剥过头了才凑够 1」）', () => {
    const code = stripComments(readFileSync(new URL(import.meta.url).pathname, 'utf8'))
    // 剥注释若剥过头（把真实定义也吃掉），上一条会因 0 !== 1 而红 —— 这条防的是
    // 「有人为了让它变绿而放松 stripComments」。
    expect(code).toMatch(/^\s*(export\s+)?function g16Violations\b/m)
  })
})
