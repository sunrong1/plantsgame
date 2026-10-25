/**
 * ── G326 —— 架构文档的目录树必须与仓库现状一致 ──────────────────────────────
 *
 * 守什么：`_bmad-output/planning-artifacts/game-architecture.md` 的
 * `### Directory Structure` 目录树，与 `### System Location Mapping` 模块表里的
 * 路径声明。
 *
 * 为什么：那份树是 2026-10-12 的**设计快照**，到 2026-10-26 已经烂掉 ——
 * `src/core/` 实际 **14** 个文件而树上只列 **9** 个（缺 `build.ts` /
 * `deck-slice.ts` / `hud.ts` / `placeholder.ts` / `session-replay.ts`），
 * `src/services/` 实际 **8** 个而树上只列 **4** 个（缺 `asset-degradations.ts` /
 * `asset-prefetch.ts` / `asset-url.ts` / `pronunciation-status.ts` /
 * `sw-registration.ts`），`src/app/` 缺 **3** 个，`src/content/` 缺 **2** 个，
 * `src/components/` 缺 `hand/` 与 3 个 HUD 组件；
 * 而树上还写着**两个从来不存在的文件** —— `services/asset-loader.ts`
 * （早已拆成 `asset-url.ts` + `asset-prefetch.ts`）与
 * `components/debug/ReplayExporter`（职能由 `app/session-recorder.ts` +
 * `core/session-replay.ts` 承担）。
 * ⇒ **指空的那一份最危险**（R-37）：读者以为那个路径仍然有效。
 *
 * 三条判据（三个方向，缺一不可）：
 * ① **树里写的每个文件路径都必须真实存在**（防「指空」）；
 * ② **`src/` 下每个源文件都必须在树里被提到**（在自己的目录条目里）——
 *    这一条防的是「树慢慢烂掉」那个方向，也是 DF-036 / DF-044 的那条要求；
 * ③ **System Location Mapping 表里的每个路径都必须真实存在**。
 *
 * ⚠️ **判据 ② 的口径**（为什么允许「目录描述里点名文件」）：
 *   那份树用的是紧凑写法 —— `battle/` 那一行写的是
 *   「BattleField / Zombie / Tower / RangeOverlay」，四个 `.vue` 并不是四个独立条目。
 *   所以 ② 判的是「**这个文件的名字在它所属目录的条目里被提到过**」
 *   （目录描述里点名，或它自己就是个子条目），
 *   **不要求它必须是独立的一行** —— 否则这条判据会把文档逼成另一种写法，
 *   而那属于改文档风格，不是守文档。
 *
 * 出处：DF-036 / DF-044（`core/hud.ts` 没进架构文档的组件树与模块表）
 * ＋ 本轮实测的整棵树漂移。
 *
 * 变异记录：
 * · **M389** —— 树里加一个不存在的 `ghost.ts` ⇒ **1 红 / 那一支 7 条**；
 * · **M390** —— 树里删掉 `hud.ts` 那一行 ⇒ **2 红 / 那一支 7 条**
 *   （多出来的那一条是 G326.4 自己的夹具也构造失效 —— 如实记，不藏）；
 * · **M391**（2026-10-26 夜，守卫自己修完之后补的）—— 把 `sectionIndex()`
 *   从「行首匹配标题」退回 `indexOf` ⇒ **5 红 / 那一支 8 条**
 *   （G326.1/.2/.3/.4 + 负向夹具 G326.8）。**这条是真的踩过**：架构文档的
 *   frontmatter `revisionNote` 里正文明写了这两个标题名，`indexOf` 会命中
 *   **那句散文** ⇒ 判据转而去扫 frontmatter 之后的第一个围栏块
 *   （`tsconfig.core.json` 片段）⇒ **判据作用错对象 = 假绿**。
 *
 * 不在 src/core/ 下 —— NFR16：测试全部在 tests/。
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../', import.meta.url))
const ARCH_PATH = `${root}_bmad-output/planning-artifacts/game-architecture.md`

/** 目录树里的一条目。 */
export interface TreeNode {
  /** 缩进深度（根下一层 = 0）。 */
  depth: number
  /** 条目名（目录不带结尾的 `/`）。 */
  name: string
  /** 条目右侧的说明文字（没有则空串）。 */
  description: string
  /** 是不是目录。 */
  isDir: boolean
  /** 解析出的仓库相对路径（目录条目也有，用它定位子条目）。 */
  path: string
}

/**
 * 找**章节标题所在行**的下标（找不到返回 -1）。
 *
 * ⚠️ **必须按行首匹配，不能用 `indexOf`**：文档的 frontmatter `revisionNote`
 * 里会**正文明写**这两个标题（如「`## Project Structure → ### Directory
 * Structure` 的目录树与」）。用 `indexOf` 会命中**那一句散文**而不是真正的标题
 * —— 于是判据作用到**别的围栏块**（实测：命中 frontmatter 后取到的第一个围栏
 * 是 `tsconfig.core.json` 片段 ⇒ 树里一个条目都解析不出来 ⇒ 判据在空集上成立）。
 * ⇒ **判据作用错对象**与**判据空转**长得一模一样（假绿的两种形态）。
 */
export function sectionIndex(doc: string, title: string): number {
  const re = new RegExp(`^#{1,6}[ \\t]+${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[ \\t]*$`, 'm')
  const m = re.exec(doc)
  return m === null ? -1 : m.index
}

/**
 * 取出 `### Directory Structure` 之后**第一个**围栏代码块。
 *
 * ⚠️ 为什么不用「全文第一个 ```」：本文档里前面还有 `jsonc` / `css` 等围栏块
 * （`tsconfig.core.json` 片段、网格 CSS 样本），取错了整个判据就作用在别的块上
 * —— 而**判据作用错对象**与**判据空转**长得一模一样（假绿的两种形态）。
 */
export function extractTree(doc: string): string {
  const section = sectionIndex(doc, 'Directory Structure')
  if (section < 0) return ''
  const fence = doc.indexOf('```', section)
  if (fence < 0) return ''
  const end = doc.indexOf('```', fence + 3)
  if (end < 0) return ''
  return doc.slice(fence + 3, end)
}

/**
 * 解析目录树 —— 按 `├── ` / `└── ` 的缩进槽位还原出每个条目的**完整路径**。
 *
 * ⚠️ **缩进槽位宽 4**：`│   ` 与 `    ` 各占 4 列，所以条目的深度 = 标记下标 / 4。
 * 用「数前导空格」会数错 —— `│` 与 `├` 各占 1 列但不是槽位。
 */
export function parseTree(tree: string): TreeNode[] {
  const nodes: TreeNode[] = []
  const stack: { depth: number; name: string }[] = []
  for (const raw of tree.split('\n')) {
    const marker = raw.search(/[├└]── /)
    if (marker < 0) continue // 根行（`plants-game/`）与空行
    const depth = Math.floor(marker / 4)
    const rest = raw.slice(marker + 4).trim()
    // 条目名 = **第一个空白前的整段**；其余是说明文字。
    // ⚠️ 刻意**不**按「两个以上空格」切：树里条目名有长有短，
    //   对齐用的空格数本来就不统一 —— 按空格数切会把说明文字并进文件名
    //   （实测踩过：`asset-degradations.ts 内容资产降级登记` 被当成一个文件名，
    //   判据于是报「路径不存在」—— 红的理由是解析器坏了，不是文档错了）。
    const nameEnd = rest.search(/\s/)
    const rawName = nameEnd < 0 ? rest : rest.slice(0, nameEnd)
    const description = nameEnd < 0 ? '' : rest.slice(nameEnd).trim()
    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) stack.pop()
    const parentPath = stack.map((s) => s.name).join('/')
    const isDir = rawName.endsWith('/')
    const name = isDir ? rawName.slice(0, -1) : rawName
    const path = parentPath ? `${parentPath}/${name}` : name
    if (isDir) stack.push({ depth, name })
    nodes.push({ depth, name, description, isDir, path })
  }
  return nodes
}

/**
 * 是不是**占位符**条目（`<词条id>.svg`、`{music,sfx,voice}/` 这类）。
 *
 * ⚠️ 这些条目**不是路径声明** —— 它们是「按这个形状放文件」的说法。
 * 当成路径去查 ⇒ 必然查不到 ⇒ 守卫恒红；当成真实文件放过 ⇒ 判据名存实亡。
 */
export function isPlaceholder(name: string): boolean {
  return /[<>{}*]/.test(name) || name.includes('...')
}

/** 树里声明的文件路径（目录条目与占位符条目都不算）。 */
export function treeFilePaths(nodes: TreeNode[]): string[] {
  return nodes.filter((n) => !n.isDir && !isPlaceholder(n.name)).map((n) => n.path)
}

/**
 * 判据 ①：**树里写的每个文件路径都必须真实存在**。
 *
 * ⚠️ 抗假绿：路径一个都没取到时必须红 —— 那说明解析器坏了，
 * 而不是「树里没有违规」。
 */
export function checkTreePaths(nodes: TreeNode[], exists: (rel: string) => boolean): string[] {
  const paths = treeFilePaths(nodes)
  if (paths.length === 0) {
    return ['架构文档的目录树里一个文件路径都取不到 —— 解析器可能坏了，而不是「没有问题」']
  }
  const problems: string[] = []
  for (const p of paths) {
    if (!exists(p)) problems.push(`目录树指向了不存在的路径：${p}`)
  }
  return problems
}

/**
 * `src/` 下**必须**被树提到的源文件（仓库相对路径）。
 *
 * 口径：`.ts`（排除 `.d.ts`）/ `.vue` / `.css`。
 * ⚠️ **不包含 `.json`** —— `src/content/units/` 下是教材数据（按目录列一行即可），
 * 把数据文件也列进去会让这条判据变成「教材一改就要改架构文档」。
 */
export function requiredSrcFiles(srcDir: string): string[] {
  const out: string[] = []
  const walk = (rel: string): void => {
    for (const name of readdirSync(join(srcDir, rel))) {
      const childRel = rel ? `${rel}/${name}` : name
      const st = statSync(join(srcDir, childRel))
      if (st.isDirectory()) {
        walk(childRel)
        continue
      }
      if (name.endsWith('.d.ts')) continue
      if (!/\.(ts|vue|css)$/.test(name)) continue
      out.push(`src/${childRel}`)
    }
  }
  walk('')
  return out.sort()
}

/**
 * 一个目录条目**提到过**的名字集合 —— 目录自身的说明里点名的，
 * 加上它的子条目名。
 *
 * ⚠️ 说明文字里点名的写法是这份树既有的紧凑风格
 * （`battle/` 那行写「BattleField / Zombie / Tower / RangeOverlay」），
 * 所以要按 `/` 切开再逐个比对。
 */
export function mentionedNames(nodes: TreeNode[], dirPath: string): Set<string> {
  const names = new Set<string>()
  const dir = nodes.find((n) => n.isDir && n.path === dirPath)
  if (dir !== undefined) {
    const desc = dir.description.replace(/^←\s*/, '')
    for (const token of desc.split('/')) {
      const t = token.trim()
      if (t !== '') names.add(t)
    }
  }
  for (const n of nodes) {
    if (n.isDir) continue
    if (n.path.slice(0, n.path.length - n.name.length - 1) !== dirPath) continue
    names.add(n.name)
  }
  return names
}

/**
 * 判据 ②：**`src/` 下每个源文件都必须在树里被提到**（在它所属目录的条目里）。
 *
 * ⚠️ 抗假绿：要求清单为空时必须红 —— 那说明 `src/` 扫空了，
 * 这条判据会在空集上恒绿。
 */
export function checkTreeCoverage(nodes: TreeNode[], required: string[]): string[] {
  if (required.length === 0) {
    return ['`src/` 下一个源文件都没扫到 —— 判据在空集上成立（扫目录的代码坏了？）']
  }
  const problems: string[] = []
  for (const file of required) {
    const slash = file.lastIndexOf('/')
    const dirPath = file.slice(0, slash)
    const base = file.slice(slash + 1)
    const stem = base.replace(/\.(ts|vue|css)$/, '')
    const mentioned = mentionedNames(nodes, dirPath)
    if (!mentioned.has(base) && !mentioned.has(stem)) {
      problems.push(`${file} 不在架构文档的目录树里（${dirPath}/ 那一条没提到它）`)
    }
  }
  return problems
}

/** `### System Location Mapping` 表里的路径声明（已解析成仓库相对路径）。 */
export function mappingPathClaims(doc: string): string[] {
  const start = sectionIndex(doc, 'System Location Mapping')
  if (start < 0) return []
  // 从**标题之后**开始扫 —— 否则第一行就是标题自己，会被下面的 `### ` 判据立刻 break 掉
  // （实测踩过：判据于是取到 0 个声明，报「判据失效」而不是真问题）。
  const afterHeading = doc.indexOf('\n', start) + 1
  const lines = doc.slice(afterHeading).split('\n')
  const claims: string[] = []
  for (const line of lines) {
    if (line.startsWith('### ')) break
    if (!line.startsWith('|')) continue
    const cells = line.split('|').slice(1, -1).map((c) => c.trim())
    const location = cells[1] ?? ''
    for (const m of location.matchAll(/`([^`]+)`/g)) {
      const token = m[1].trim()
      if (token === '') continue
      // 表里的路径**不带 `src/` 前缀**（`core/turn.ts`），要补上。
      if (/^(core|content|services|app|components|views|styles)\//.test(token)) {
        claims.push(`src/${token}`)
      } else if (token.startsWith('src/')) {
        claims.push(token)
      }
    }
  }
  return claims
}

/**
 * 判据 ③：**模块表里的每个路径都必须真实存在**。
 *
 * ⚠️ 抗假绿：一个声明都取不到时必须红。
 */
export function checkMappingPaths(doc: string, exists: (rel: string) => boolean): string[] {
  const claims = mappingPathClaims(doc)
  if (claims.length === 0) {
    return ['模块表里一个路径声明都取不到 —— 判据可能已经失效，而不是「没有问题」']
  }
  const problems: string[] = []
  for (const c of claims) {
    if (!exists(c)) problems.push(`模块表指向了不存在的路径：${c}`)
  }
  return problems
}

const doc = readFileSync(ARCH_PATH, 'utf8')
const tree = extractTree(doc)
const nodes = parseTree(tree)
const required = requiredSrcFiles(`${root}src`)

describe('G326 —— 架构文档的目录树必须与仓库现状一致（game-architecture.md）', () => {
  it('G326.1 目录树里写的每个文件路径都真实存在', () => {
    // 非空自检：树里一个文件条目都没有 ⇒ 判据在空集上成立
    expect(
      treeFilePaths(nodes).length,
      '目录树里一个文件条目都没解析出来 —— 解析器坏了，下面的断言会恒绿',
    ).toBeGreaterThan(30)
    const problems = checkTreePaths(nodes, (rel) => existsSync(join(root, rel)))
    expect(
      problems,
      `架构文档的目录树指向了不存在的路径（指空的那一份最危险 —— R-37）：\n${problems.join('\n')}`,
    ).toEqual([])
  })

  it('G326.2 `src/` 下每个源文件都在目录树里被提到', () => {
    expect(
      required.length,
      '`src/` 下一个源文件都没扫到 —— 判据在空集上成立，下面的断言会恒绿',
    ).toBeGreaterThan(30)
    const problems = checkTreeCoverage(nodes, required)
    expect(
      problems,
      `这些源文件不在架构文档的目录树里 —— 新增 \`src/\` 文件时请同一次改动里补一行：\n${problems.join('\n')}`,
    ).toEqual([])
  })

  it('G326.3 System Location Mapping 表里的每个路径都真实存在', () => {
    expect(
      mappingPathClaims(doc).length,
      '模块表里一个路径声明都取不到 —— 判据可能已经失效，而不是「没有问题」',
    ).toBeGreaterThan(10)
    const problems = checkMappingPaths(doc, (rel) => existsSync(join(root, rel)))
    expect(
      problems,
      `架构文档的模块表指向了不存在的路径：\n${problems.join('\n')}`,
    ).toEqual([])
  })

  it('G326.4 反向自测：三条判据都真能报出违规（判据本体真的被调用）', () => {
    // ① 树里指空一个文件 ⇒ 必须报出来
    const brokenPath = parseTree(tree.replace('grid.ts', 'grid-gone.ts'))
    const pathProblems = checkTreePaths(brokenPath, (rel) => existsSync(join(root, rel)))
    expect(
      pathProblems.some((p) => p.includes('src/core/grid-gone.ts')),
      `构造失效：把目录树里的路径指空竟没被判出来：\n${pathProblems.join('\n')}`,
    ).toBe(true)

    // ② 从树里删掉一个源文件条目 ⇒ 覆盖率必须报出那个文件
    // ⚠️ 匹配式要吃掉整行的**树标记前缀**（`│   │   ├── `）——
    //   那段前缀里含 `│`（不是空白），只写 `\s*` 匹配不到。
    const dropped = tree.replace(/^.*── hud\.ts.*$/m, '')
    expect(dropped, '构造失效：树里没找到 `hud.ts` 那一行').not.toBe(tree)
    const coverageProblems = checkTreeCoverage(parseTree(dropped), required)
    expect(
      coverageProblems.some((p) => p.includes('src/core/hud.ts')),
      `构造失效：删掉树里的一行竟没被覆盖率判据报出来：\n${coverageProblems.join('\n')}`,
    ).toBe(true)

    // ③ 模块表里指空一个路径 ⇒ 必须报出来
    // ⚠️ 替换必须**限定在模块表那一节里** —— 全文替换会命中**更早**出现的
    //   同一串字面量（本文档里 `core/hud.ts` 在别处也出现过），
    //   而模块表那一份没被动过 ⇒ 判据当然报不出东西（实测踩过）。
    const sectionStart = sectionIndex(doc, 'System Location Mapping')
    expect(sectionStart, '构造失效：文档里找不到 `### System Location Mapping` 那一节').toBeGreaterThan(-1)
    const section = doc.slice(sectionStart)
    const brokenSection = section.replace('`core/hud.ts`', '`core/hud-gone.ts`')
    expect(brokenSection, '构造失效：模块表里找不到 `core/hud.ts` 这一处声明').not.toBe(section)
    const brokenMapping = doc.slice(0, sectionStart) + brokenSection
    const mappingProblems = checkMappingPaths(brokenMapping, (rel) => existsSync(join(root, rel)))
    expect(
      mappingProblems.some((p) => p.includes('src/core/hud-gone.ts')),
      `构造失效：把模块表里的路径指空竟没被判出来：\n${mappingProblems.join('\n')}`,
    ).toBe(true)
  })
})

/**
 * ── G326 —— 负向夹具 ────────────────────────────────────────────────────────
 *
 * 这些夹具守的是**判据的边界**：占位符不是路径、目录不是文件、
 * 深度解析不能把 `src/` 吃掉。少了它们，判据可能在「看起来对」的输入上
 * 悄悄放过或误报 —— 而那正是本仓库反复抓的假绿形态。
 */
describe('G326 —— 负向夹具（判据的边界）', () => {
  it('G326.5 占位符条目不是路径声明（`<词条id>.svg` / `{music,sfx,voice}/`）', () => {
    expect(
      isPlaceholder('<词条id>.svg'),
      '占位符条目没被认出来 —— 判据会把它当成真实路径去查，恒红',
    ).toBe(true)
    expect(isPlaceholder('audio/{music,sfx,voice}'), '带花括号的条目没被认成占位符').toBe(true)
    expect(
      treeFilePaths(nodes).some((p) => p.includes('<')),
      '目录树里有含 `<` 的路径被当成了真实路径声明',
    ).toBe(false)
  })

  it('G326.6 目录条目不参与「文件是否存在」的判定', () => {
    // `src/core/` 是目录，存在；但目录**不该**出现在文件路径清单里
    expect(
      treeFilePaths(nodes).includes('src/core'),
      '目录条目被当成了文件路径 —— 判据会拿目录去查文件',
    ).toBe(false)
    // 夹具：树里有一个目录 + 一个文件，而 exists 只认那个文件
    // ⇒ 目录**不许**被拿去查存在性（否则会报「路径不存在」）
    const fixture = parseTree(
      ['├── src/', '│   ├── core/            一个目录（不是文件）', '│   │   └── grid.ts      网格规格'].join(
        '\n',
      ),
    )
    const problems = checkTreePaths(fixture, (rel) => rel === 'src/core/grid.ts')
    expect(
      problems,
      '目录条目被拿去查文件存在性 ⇒ 判据会把「目录不存在」报成「文件指空」',
    ).toEqual([])
  })

  it('G326.7 深度解析不能把路径前缀吃掉（`src/core/grid.ts` 不是 `core/grid.ts`）', () => {
    const sample = parseTree(
      ['plants-game/', '├── src/', '│   ├── core/', '│   │   ├── grid.ts    网格规格', '│   │   └── index.ts  barrel'].join(
        '\n',
      ),
    )
    expect(
      sample.map((n) => n.path),
      '目录树的路径解析不对 —— 深度槽位是 4 列（`│   ` / `    `），不是数空格',
    ).toEqual(['src', 'src/core', 'src/core/grid.ts', 'src/core/index.ts'])
  })

  it('G326.8 章节标题按行首匹配 —— 正文里提到标题名不算（散文不得劫持判据）', () => {
    // ⚠️ 这条夹具守的是**今天真踩过的坑**：架构文档的 frontmatter `revisionNote`
    //   里正文明写了「`## Project Structure → ### Directory Structure` 的目录树与
    //   `### System Location Mapping` 模块表」，用 `indexOf` 找标题会命中**那句散文**
    //   ⇒ 判据转而去扫 frontmatter 之后的**第一个围栏块**（实测是
    //   `tsconfig.core.json` 片段）⇒ 树里一个条目都解析不出来
    //   ⇒ 判据在空集上恒绿。**判据作用错对象 = 假绿。**
    const fixtureDoc = [
      '---',
      'revisionNote: |',
      '  rev 2 —— 改了 `## Project Structure → ### Directory Structure` 的目录树与',
      '  `### System Location Mapping` 模块表。',
      '---',
      '',
      '## 别的章节',
      '',
      '```jsonc',
      '{ "compilerOptions": { "strict": true } }',
      '```',
      '',
      '## Project Structure',
      '',
      '### Directory Structure',
      '',
      '```',
      '├── src/',
      '│   └── main.ts   应用入口',
      '```',
      '',
      '### System Location Mapping',
      '',
      '| 系统 | 位置 |',
      '|---|---|',
      '| 入口 | `src/main.ts` |',
    ].join('\n')
    expect(
      extractTree(fixtureDoc),
      '散文里的标题名劫持了判据 —— 取到的不是目录树那个围栏块',
    ).toContain('main.ts')
    expect(
      mappingPathClaims(fixtureDoc),
      '散文里的标题名劫持了判据 —— 模块表扫到的是别处的表',
    ).toEqual(['src/main.ts'])
  })
})
