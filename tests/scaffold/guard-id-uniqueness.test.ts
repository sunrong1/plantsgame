/**
 * 守卫编号**全仓唯一** —— 一个编号只能对应**一个守卫**。
 *
 * ── 为什么需要这条 ────────────────────────────────────────────────────────
 *   守卫编号是本仓库唯一的「按号反查」索引：红的时候要能 `grep -rn 'G123'`
 *   找到**是哪条守卫**。⇒ 同一个号被两条不相干的守卫占用，那条 grep 就**指代不明**，
 *   而「指代不明」的失败方向恰恰最危险：**以为没占 → 用了别人的号** →
 *   两条守卫从此共用一个号，此后所有按号引用都不可信。
 *
 *   本仓库已经因此出过一次**真撞号**：`G30` 被 Story 1.11 的
 *   `tests/components/quiz-card.test.ts`（题面文字可见性）与 Story 1.12 的
 *   `tests/components/hand-build.test.ts`（射程覆盖层逐格比对）同时占用 ——
 *   两条毫不相干的守卫共用一个号。⇒ 2026-10-25 夜把 1.12 那条改号为 **G305**
 *   （1.11 那条不动），见 **DF-102**。
 *
 * ── 判据的口径（写清楚，免得下次各判各的）────────────────────────────────
 *   · **声明点** = `describe` 的标题里**第一个**出现的 `G<编号>`。
 *     只认 `describe` 标题 —— `it` 标题里的编号是**引用**
 *     （DF-129 记着这条：编号只写在 `describe` 上，`it` 标题不含号
 *     ⇒ 按号搜不到用例 —— 那是另一条待办）。
 *   · 标题里**第一个**之后的编号是**引用**，不是声明点。理由是本仓库大量标题
 *     形如 `M41 —— ……，G16 必须红`（**变异**块引用它要打红的守卫）与
 *     `G239 —— ……（与 G16 同一口径）`（另一个守卫在括号里说明口径一致）——
 *     这两处的 G16 都是**引用**，若把它们算成声明点就会凭空判出「撞号」。
 *   · **编号本体** = `G` + 2~3 位数字 + **可选的小写字母后缀**（`G30b` / `G64a`）。
 *     ⚠️ 字母后缀是**另一个编号**（`G64` 与 `G64a` 是两条不同的守卫），
 *     不是 `G64` 的子号 ⇒ 它们分居两文件**不算撞号**。
 *     （中文括号后缀不一样：`G112（扩展）` 的编号本体就是 `G112`。）
 *   · 同一编号的**全部声明点必须落在同一个文件里**。
 *   · ⚠️ **例外只有一个形状**：**同一个守卫**在两个文件里各写了一段断言
 *     （本仓库有三个，见下方 `ALLOWED_SPLITS`）。**这不是撞号** ——
 *     撞号是「两条不相干的守卫共用一个号」，而「同一个守卫的两半」是设计。
 *     例外清单里**写死了文件集合**：清单与现状对不上时守卫会红
 *     （防止例外清单悄悄过期，也防止有人往例外里塞新条目）。
 *
 * 出处：DF-102（编号纪律）+ DF-188（规则文档缺「编号全仓唯一」这条）。
 *
 * 不在 src/core/ 下 —— NFR16：测试全部在 tests/。
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { describeTitles } from '../helpers/describe-titles'

const root = fileURLToPath(new URL('../../', import.meta.url))

const TESTS_DIR = `${root}tests/`

/** 编号本体：`G` + 2~3 位数字 + 可选小写字母后缀。 */
const GUARD_ID = /G\d{2,3}[a-z]?/

/**
 * 例外清单：**同一个守卫在两个文件里各写了一段断言**（不是撞号）。
 *
 * ⚠️ **每一条都要写清「为什么这两个文件是同一个守卫」** —— 无理由的例外
 *   就是「守卫允许了它要防的违规」，所以清单里的每条都必须能被 reviewer 复核。
 */
export const ALLOWED_SPLITS: Readonly<Record<string, readonly string[]>> = {
  // G65：同一个守卫的两半 —— 「SFX_BASE_PATH / MUSIC_BASE_PATH 必须以
  // `import.meta.env.BASE_URL` 起头」在 `services/audio` 侧，
  // 「播放器 URL 与磁盘布局一致」在 `assets/audio-assets` 侧。
  // 出处：`archive/1-14-音效与-bgm-接入.md` 的守卫表把 G65 列成一条。
  G65: ['tests/assets/audio-assets.test.ts', 'tests/services/audio.test.ts'],
  // G112：同一个守卫的两半 —— 「`?debug=1` 只在 DEV 下打开面板」在
  // `debug-panel` 侧，「`?ranges=1` 与 `?debug=1` 同一个 DEV 起算纪律」
  // 在 `dev-range-overlay` 侧（那份标题逐字写着「G112（扩展）」）。
  // 出处：`archive/1-17-调试工具与会话回放.md` 的守卫表把 G112 列成一条。
  G112: ['tests/components/debug-panel.test.ts', 'tests/components/dev-range-overlay.test.ts'],
  // G254：同一个守卫的两半 —— 组件侧（`quiz-card`）与门面侧（`skip-facade`）
  // 守的是同一条行为：「破图的正确项仍然可点」。
  // 出处：`implementation-artifacts/epic-1-integration-review.md` 逐字写着
  // 「**G254**（门面 `tests/app/skip-facade.test.ts` + 组件 `tests/components/quiz-card.test.ts`）」。
  G254: ['tests/app/skip-facade.test.ts', 'tests/components/quiz-card.test.ts'],
}

/** 列出 `tests/` 下所有 `.ts` 文件（相对仓库根的路径）。 */
function listTestFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listTestFiles(full))
    else if (entry.name.endsWith('.ts')) out.push(relative(root, full))
  }
  return out
}

/**
 * 取一个源文件里**所有 `describe` 的标题**。
 *
 * ⚠️ 走 **AST**（`tests/helpers/describe-titles.ts`）而不是正则 ——
 *   正则分不清「注释/字符串夹具里的 `describe('…')`」与「真的声明」，
 *   会把夹具当声明点 ⇒ 凭空判出撞号（本守卫第一版就栽在这里）。
 */

/** 编号 → 声明它的文件集合（来自 `describe` 标题里的**第一个**编号）。 */
export function guardIdDeclarations(): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const rel of listTestFiles(TESTS_DIR)) {
    const body = readFileSync(join(root, rel), 'utf8')
    for (const title of describeTitles(rel, body)) {
      const m = title.match(GUARD_ID)
      if (!m) continue
      const id = m[0]
      const bucket = map.get(id)
      if (bucket) {
        if (!bucket.includes(rel)) bucket.push(rel)
      } else {
        map.set(id, [rel])
      }
    }
  }
  return map
}

/** 判据本体：返回**逐条**问题（空数组 = 全仓唯一）。 */
export function guardIdProblems(
  declarations: Map<string, string[]>,
  allowed: Readonly<Record<string, readonly string[]>>,
): string[] {
  const problems: string[] = []
  for (const [id, files] of declarations) {
    const expected = allowed[id]
    if (expected === undefined) {
      if (files.length > 1) {
        problems.push(
          `${id}：被 ${files.length} 个文件同时声明（${files.join(' / ')}）—— ` +
            '一个编号只能对应一个守卫；若是「同一个守卫的两半」，把它登记进例外清单并写清理由',
        )
      }
      continue
    }
    // 例外条目：文件集合必须与登记时**逐字一致**。
    const actual = [...files].sort()
    const wanted = [...expected].sort()
    if (actual.length !== wanted.length || actual.some((f, i) => f !== wanted[i])) {
      problems.push(
        `${id}：例外清单登记的是 [${wanted.join(' / ')}]，实际是 [${actual.join(' / ')}] —— ` +
          '例外清单必须与现状逐字一致（清单过期或有人挪了声明点，都在这里红）',
      )
    }
  }
  // 例外清单里登记了、但实际已经没有跨文件声明的条目 ⇒ 清单该删。
  for (const id of Object.keys(allowed)) {
    const files = declarations.get(id) ?? []
    if (files.length <= 1) {
      problems.push(
        `${id}：例外清单里登记着它，但它现在只出现在 ${files.length} 个文件里 —— ` +
          '例外已失效，请把这一条从清单里删掉',
      )
    }
  }
  return problems
}

const declarations = guardIdDeclarations()

describe('G306 —— 守卫编号全仓唯一（一个编号只对应一个守卫）', () => {
  it('G306.1 全仓没有两个不相干的守卫共用同一个编号', () => {
    expect(
      declarations.size,
      '一个守卫编号都没扫到 ⇒ 判据在空集上成立（正则或目录变了？）',
    ).toBeGreaterThan(50)

    const problems = guardIdProblems(declarations, ALLOWED_SPLITS)
    expect(
      problems,
      `守卫编号撞号：\n${problems.join('\n')}\n` +
        '—— 按号反查是本仓库唯一的「红的时候找得到人」索引，撞号会让它指代不明。',
    ).toEqual([])
  })

  it('G306.2 反向自测：判据真的会把「跨文件同号」判成问题（判据本体真的被调用）', () => {
    // 构造：把某个编号声明到两个文件上 ⇒ 判据必须报出来。
    // ⚠️ 夹具编号**故意不用数字**（`G-fake`）—— R-36 的起号命令是
    //   `grep -rhoP 'G[0-9]{2,3}' tests/ src/ _bmad-output/` ⇒ 数字夹具会被那条命令扫到，
    //   下一个人照着它起号就会起在假号后面（夹具号 999 ⇒ 下次从 1000 起）。
    const fake = new Map(declarations)
    fake.set('G-fake', ['tests/a.test.ts', 'tests/b.test.ts'])
    const problems = guardIdProblems(fake, ALLOWED_SPLITS)
    expect(
      problems.some((p) => p.includes('G-fake')),
      `构造失效：判据没有报出 G-fake 的撞号：\n${problems.join('\n')}`,
    ).toBe(true)

    // 构造：例外清单里的条目被挪到别的文件 ⇒ 判据必须报「清单过期」。
    const moved: Record<string, readonly string[]> = { ...ALLOWED_SPLITS }
    moved['G65'] = ['tests/only-one.test.ts']
    const problems2 = guardIdProblems(declarations, moved)
    expect(
      problems2.some((p) => p.includes('G65')),
      `构造失效：判据没有报出 G65 的例外清单过期：\n${problems2.join('\n')}`,
    ).toBe(true)

    // 构造：把例外清单整体删掉 ⇒ 那三个「同一个守卫的两半」必须被判成撞号
    // （否则这份清单就是「允许了它要防的违规」）。
    const problems3 = guardIdProblems(declarations, {})
    for (const id of ['G65', 'G112', 'G254']) {
      expect(
        problems3.some((p) => p.includes(`${id}：`)),
        `构造失效：清空例外清单后判据仍不报 ${id} 的撞号：\n${problems3.join('\n')}`,
      ).toBe(true)
    }
  })

  it('G306.3 反向自测：声明点只认「标题里的第一个编号」（后面的编号是引用）', () => {
    // 形状照抄本仓库的两处真实出现：
    //   `M41 —— 从 asset-url.ts 去掉 BASE_URL 前缀，G16 必须红`（变异块引用它要打红的守卫）
    //   `G239 —— 僵尸图的 URL 带部署 base（与 G16 同一口径）`（括号里引另一个守卫的号）
    const titles = describeTitles(
      'probe.ts',
      "describe('M41 —— 去掉 base，G16 必须红', () => {})\n" +
        "describe('G239 —— 僵尸图（与 G16 同一口径）', () => {})\n",
    )
    expect(titles, 'describe 标题没抓全').toHaveLength(2)
    const ids = titles.map((t) => t.match(GUARD_ID)?.[0])
    // ① 变异号 M41 **不能**被当成守卫号（G\d{2,3} 要求前面是 G）⇒ 取到的是 G16。
    expect(ids[0], '把变异号 M41 误认成守卫号了').toBe('G16')
    // ② 标题里**第一个**编号才是声明点 ⇒ 括号里那个 G16 是**引用**，不许被取。
    expect(ids[1], '取了括号里的引用号，不是标题主体的编号').toBe('G239')
  })
})
