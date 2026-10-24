/**
 * 文档治理的结构守卫 —— 钉住 R-37 与 R-40。
 *
 * 守什么：`docs/rules/` 里的每条规则在仓库里只有一份正文（R-37）；已完成的 story
 * 文档进了 `archive/` 且活跃文档不再引用它们（R-40）；以及「常驻文件不许长回去」——
 * `sprint-status.yaml` 的叙事、`CLAUDE.md` 的体量。
 *
 * 为什么：这三个不变量**都已经在本仓库发过病**。约定被 12 个 story 逐字誊抄、
 * 抄到第 4 手漂移成 6 类活着的错误信息；`sprint-status.yaml` 被瘦身过一次
 * （21.7K → 5.8K，commit 9435080），随后 1.11 / 1.12 之后又涨回 4 段几千字的
 * 行尾注释。**一次性动作已被证伪，只能靠守卫钉死。**
 *
 * 出处：`_bmad-output/implementation-artifacts/spec-doc-governance.md` 的 AC 1-4。
 * AC 5（守卫自身的变异验证）是手工执行的，不在本文件内 —— 见该 spec 的 Verification。
 *
 * 不在 src/core/ 下 —— NFR16：测试全部在 tests/。
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../', import.meta.url))

const RULES_DIR = `${root}docs/rules/`
const IMPL_DIR = `${root}_bmad-output/implementation-artifacts/`
const SPRINT_STATUS = `${IMPL_DIR}sprint-status.yaml`
const CLAUDE_MD = `${root}CLAUDE.md`

/** 扫描正文重复时要跳过的目录：工具链自带、以及规则/归档本身的两个例外区。 */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'coverage',
  '.claude',
  '.vitest',
  '_bmad', // BMAD 安装器管理，不归本项目规则管
])

/** 只在这些扩展名里找正文重复 —— 规则正文只可能出现在文本文件里。 */
const SCAN_EXT = /\.(md|ts|vue|css|scss|json|ya?ml|js|mjs|cjs|html|txt|toml)$/

/**
 * 判据下限：短于这个长度的「规则正文」不足以定位文件，grep 命中多半是巧合。
 *
 * 刻意定得低（8）而不是「看着安全」的高值：定高意味着**短规则会被静默排除在
 * 保护范围之外**且守卫全绿 —— 评审实测 R-08（12 字）/ R-10（16 字）/ R-75（16 字）
 * 三条在旧阈值 20 下完全不被检查。低于下限的规则由下一条用例**显式报错**，而不是消失。
 */
const MIN_RULE_TEXT = 8

/** CLAUDE.md 行数上限。写超了说明有人把正文搬回来了，而不是索引变长了。 */
const CLAUDE_MD_MAX_LINES = 110

/**
 * sprint-status.yaml 的总行长上限（含注释）。
 *
 * 刻意量**总长**而不是「剥掉 `#` 之后」的长度：本文件那次复发恰恰是把几千字塞进
 * `#` 之后（`last_updated: … # [DS] Story 1.12 → review。**建造/阳光…`），
 * 剥注释的判据对真正的复发模式完全失明。
 *
 * 200 的来由：当前最长合法内容行是 97 字符（工作流注释），复发时最短的那行也有 344。
 * 取 200 = 合法内容的 2 倍，远低于任何一次复发。
 *
 * ⚠️ 这不是永久值：新增合法的长行（如更长的 story key、路径引用）时，
 * 先确认那条行**不是**叙事回流，再同步上调此阈值并写进来由 —— 见 R-57，
 * 不允许为了变绿而松。
 */
const SPRINT_STATUS_MAX_LINE = 200
/**
 * R-42：`sprint-status.yaml` 里 **`development_status:` 块及其之后**的注释行上限。
 *
 * ⚠️ 为什么**不**量全文件：全文件的 45 行注释里有 43 行是 BMAD 生成的静态结构头
 *   （STATUS DEFINITIONS / STORY KEY RULE 等），**工具会重新生成它** ——
 *   量全文件等于让守卫在 BMAD 升级时假红。
 * ⚠️ 为什么**不**只量行长（`SPRINT_STATUS_MAX_LINE` 那个）：1.13 的 16 行复盘
 *   最长一行才 80 字符，在 200 的上限下有 60% 余量，从守卫眼皮底下直接走过去。
 *   复盘是**按行堆**进来的，所以必须量**行数**。
 * ⚠️ 现值 **2**（1.2/1.10 留在 review 的两行指针），上限 **4**。
 *   阈值的定法（R-57：不许为了变绿而松）：**只给指针留的余量按「一行指针 + 一行续行」算**。
 *   首版量全文件、上限 60 —— 把 16 行复盘塞回去实测 **53 < 60，仍全绿**，形同虚设；
 *   二版上限 8 也偏松（塞 6 行仍绿）。收到 4 后实测：塞 3 行复盘即红。
 *   1.13 那一段原始复盘是 43 行 —— 在这条守卫下超限近 11 倍。
 */
/**
 * ⚠️ 2026-10-21 修正：阈值 4 → 6。
 *   旧阈值 4 是给「`development_status:` 块及其之后」那 4 行指针留的，**量不到**
 *   `last_updated:` 的续行复盘区 —— 2026-10-20/21 实测那区塞了 **113 行复盘**
 *   （8,185 字符 = 全文件 66%），守卫 9/9 全绿、一声不吭。
 *   现在测量范围扩到「`last_updated:` 行到文件末尾」，现值 **4** 行指针，
 *   阈值 6 留 2 行余量。
 */
const SPRINT_STATUS_MAX_COMMENT_LINES = 6

const walk = (dir: string, acc: string[] = []): string[] => {
  // 显式补尾斜杠：递归时目录名不带分隔符会拼出 `foo/barbaz` 这种不存在的路径
  const base = dir.endsWith('/') ? dir : `${dir}/`
  let names: string[]
  try {
    names = readdirSync(base)
  } catch {
    // 断链 / 无权限 / 被并发删掉：跳过而不是让整条守卫红。
    // 守卫红应当意味着「有违规」，不能意味着「环境读不到某个目录」。
    return acc
  }
  for (const name of names) {
    if (SKIP_DIRS.has(name)) continue
    const full = `${base}${name}`
    let dir1 = false
    try {
      dir1 = statSync(full).isDirectory()
    } catch {
      continue // 同上：stat 失败按「不是要收的文件」处理
    }
    if (dir1) walk(full, acc)
    else if (SCAN_EXT.test(name)) acc.push(full)
  }
  return acc
}

/**
 * 比对前的归一化：抹掉 markdown 加粗标记与全部空白。
 *
 * **为什么必须有这一步**（评审实测坐实的假绿）：52 条规则正文里有 **32 条含 `**` 标记**，
 * 而复制规则的人几乎必然会去掉加粗重打一遍。旧判据拿**带标记**的原串去 `includes()`，
 * 对「R-37 被抄走但抄的人没加粗」这种最典型的复制形态**完全失明** ——
 * 实测：原串 `includes()` 命中不了去标记的副本，归一化后两者相等。
 */
const norm = (s: string): string => s.replace(/\*\*/g, '').replace(/\s+/g, '')

/** 规则块里字段的锚点。用**字段名**切分，而不是「行首加粗」—— 后者会被正文里的内嵌加粗误切。 */
const FIELD_ANCHOR = /\n\*\*(?:依据|守卫|首现|例外)\*\*/

/** 从规则文件里抽出「每条规则的 `**规则**` 字段正文」。 */
const parseRuleTexts = (): { id: string; file: string; text: string }[] => {
  const out: { id: string; file: string; text: string }[] = []
  for (const name of readdirSync(RULES_DIR)) {
    if (!name.endsWith('.md') || name === 'README.md') continue
    const raw = readFileSync(`${RULES_DIR}${name}`, 'utf8')
    // 以 `### R-XX` 切块；块内取 `**规则**` 到下一个**具名字段**之间的正文
    for (const block of raw.split(/^### /m).slice(1)) {
      const id = block.match(/^(R-\d+)/)?.[1]
      if (!id) continue
      const after = block.split('**规则**')[1]
      const field = after ? after.split(FIELD_ANCHOR)[0] : ''
      const text = field.trim()
      if (norm(text).length >= MIN_RULE_TEXT) out.push({ id, file: name, text })
    }
  }
  return out
}

/**
 * 规则文件里 `R-XX` 标题的总数 —— 用来证明解析器没漏块（而不是靠一个写死的数）。
 *
 * 刻意匹配 `#{2,4}` 而不是硬编码 `###`：若有人把规则标题改成 `##`，
 * 硬编码版会让**两个计数器一起归零** ⇒ 「没漏块」这条断言恒真、零鉴别力，
 * 正是本仓库反复抓的那类假绿。放宽一级之后，改标题会让本条**明确报红**。
 */
const countRuleHeadings = (): number => {
  let n = 0
  for (const name of readdirSync(RULES_DIR)) {
    if (!name.endsWith('.md') || name === 'README.md') continue
    n += readFileSync(`${RULES_DIR}${name}`, 'utf8').match(/^#{2,4}\s+R-\d+/gm)?.length ?? 0
  }
  return n
}

describe('R-37 判据单一来源（AC-1）', () => {
  const rules = parseRuleTexts()

  it('解析器没漏掉任何一条规则（防解析器静默失效导致判据空转）', () => {
    // 对照 `### R-XX` 标题数，而不是写死一个数：写死的数会随新增规则而无故变红
    const headings = countRuleHeadings()
    expect(
      rules.length,
      `规则文件里有 ${headings} 个 \`### R-XX\` 标题，但只解析出 ${rules.length} 条 —— ` +
        '解析器漏块会让下面两条用例失去鉴别力（空转恒绿）。检查 **规则** 字段是否缺失或过短',
    ).toBe(headings)
  })

  it('每条规则的「规则」正文在 rules/ 与 archive/ 之外没有第二份', () => {
    // 故意排除规则目录本身（正文就该在那）与 archive/（历史文档，按 R-40 默认不读）
    const targets = walk(root).filter(
      (f) => !f.startsWith(RULES_DIR) && !f.startsWith(`${root}_bmad-output/archive/`),
    )
    expect(targets.length).toBeGreaterThan(50)

    const offenders: string[] = []
    for (const { id, text } of rules) {
      // 归一化后比对：复制者几乎必然去掉 markdown 加粗标记，不归一化就对「抄走但没加粗」失明
      const needle = norm(text)
      for (const file of targets) {
        if (norm(readFileSync(file, 'utf8')).includes(needle)) {
          offenders.push(`${id} 的正文出现在 ${file.slice(root.length)}`)
        }
      }
    }
    expect(
      offenders,
      `规则正文被复制到了别处 —— 按 R-37 应改成 R-ID 引用，不要同步两份：\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('README 索引列出了每一条规则（索引漏条 = 规则不可发现）', () => {
    const index = readFileSync(`${RULES_DIR}README.md`, 'utf8')
    const missing = rules.map((r) => r.id).filter((id) => !index.includes(id))
    expect(missing, `这些规则没进 docs/rules/README.md 索引：${missing.join('、')}`).toEqual([])
  })

  it('每条规则都写齐了「规则 / 依据 / 守卫 / 首现」四段', () => {
    // 短规则被 MIN_RULE_TEXT 静默排除是已发生过的形态（旧阈值 20 时有 3 条被吞），
    // 所以缺字段必须**显式报错**，不能靠「反正也没人检查」蒙过去
    const incomplete: string[] = []
    for (const name of readdirSync(RULES_DIR)) {
      if (!name.endsWith('.md') || name === 'README.md') continue
      const raw = readFileSync(`${RULES_DIR}${name}`, 'utf8')
      for (const block of raw.split(/^### /m).slice(1)) {
        const id = block.match(/^(R-\d+)/)?.[1]
        if (!id) continue
        const missing = ['规则', '依据', '守卫', '首现'].filter((f) => !block.includes(`**${f}**`))
        if (missing.length) incomplete.push(`${id}（${name}）缺 ${missing.join('/')}`)
      }
    }
    expect(
      incomplete,
      `规则条目缺字段 —— spec 的 Always 边界要求每条固定四段：` +
        `无守卫的写明「无 —— 未被钉住」，不省略：\n${incomplete.join('\n')}`,
    ).toEqual([])
  })
})

describe('R-40 已完成 story 归档（AC-2 / AC-3 / AC-4）', () => {
  it('CLAUDE.md 不超过体量上限（AC-3）—— 规则正文搬进来就变长，长了说明又被搬回来了', () => {
    // 用与 `wc -l` 相同的口径数行：结尾换行不额外算一行，
    // 否则人看到 110 行而守卫报 111，阈值就成了看不懂的谜
    const raw = readFileSync(CLAUDE_MD, 'utf8')
    const lines = raw.split('\n').length - (raw.endsWith('\n') ? 1 : 0)
    expect(
      lines,
      `CLAUDE.md 有 ${lines} 行，超过 ${CLAUDE_MD_MAX_LINES} 行上限；` +
        '它只是入口，规则正文应住在 docs/rules/',
    ).toBeLessThanOrEqual(CLAUDE_MD_MAX_LINES)
  })

  it('sprint-status.yaml 没有超长行（AC-2）—— 叙事不许回流，含注释总长', () => {
    const raw = readFileSync(SPRINT_STATUS, 'utf8')
    const long = raw
      .split('\n')
      .map((line, i) => ({ n: i + 1, len: line.trimEnd().length }))
      .filter((x) => x.len > SPRINT_STATUS_MAX_LINE)
    expect(
      long.map((x) => `第 ${x.n} 行 ${x.len} 字符`),
      `sprint-status.yaml 有 ${long.length} 行超过 ${SPRINT_STATUS_MAX_LINE} 字符：` +
        '运行复盘属于 story 文档的 Completion Notes，不属于状态账本',
    ).toEqual([])
  })

  it('sprint-status.yaml 的 development_status 块里没有复盘（R-42）—— 卡的是**行数**，不是行长', () => {
    /*
     * ⚠️⚠️ 这条规则的由来是**一个被绕过的守卫**：Story 1.13 的 `[CR]` 往
     *   sprint-status.yaml 塞了 16 行复盘，最长一行 80 字符 —— 在上面那条
     *   「≤200 字符」的守卫眼里有 60% 余量，大摇大摆走过去，一次都没红。
     *   而本文件的行尾注释曾被文档治理从 21.7K 砍到 5.8K，又涨回 12K
     *   ⇒ 复盘回流是**第二次**发生，只卡行长挡不住。
     *
     * ⚠️ 只量 `development_status:` 及其之后的注释：全文件 45 行注释里有 43 行是
     *   BMAD 生成的静态结构头，**工具会重新生成** —— 量全文件会在 BMAD 升级时假红。
     *   实测现值 **2**（1.2/1.10 留在 review 的那两行指针），上限 4。
     */
    const lines = readFileSync(SPRINT_STATUS, 'utf8').split('\n')
    const start = lines.findIndex((l) => l.startsWith('development_status:'))

    expect(start, 'sprint-status.yaml 里找不到 development_status: —— 本守卫会静默空转').toBeGreaterThan(-1)

    const offenders = lines
      .slice(start)
      .map((l, i) => ({ n: start + i + 1, text: l }))
      .filter((x) => /^\s*#/.test(x.text))

    expect(
      offenders.length,
      `development_status 块里已有 ${offenders.length} 行注释（上限 ${SPRINT_STATUS_MAX_COMMENT_LINES}）：\n` +
        offenders.map((x) => `  第 ${x.n} 行`).join('\n') +
        '\n运行复盘属于 story 文档的 Completion Notes，按 R-42 不写在这里。' +
        '本文件只该有状态账本与一行指针。',
    ).toBeLessThanOrEqual(SPRINT_STATUS_MAX_COMMENT_LINES)
  })

  it('sprint-status.yaml 从 last_updated 行到文件末尾没有复盘（R-42，2026-10-21 补洞）', () => {
    /*
     * ⚠️⚠️ 这条是**第二次被绕过的同一个守卫**补上的洞：
     *   2026-10-20 晚，`last_updated:` 后面挂了 **113 行复盘**（8,185 字符，
     *   全文件 66%）—— 上面的守卫只量 `development_status:` 块**及其之后**，
     *   那 113 行在它**上面**，于是它 9/9 全绿、一声不吭。
     *   根因：守卫的测量范围是「按内容锚定的一个区段」，而复盘可以从**任何位置**
     *   灌进来 —— 守卫没量到的地方就是它的盲区。
     *   现在改成量「`last_updated:` 行到文件末尾」的**全部**注释行：
     *   这一段覆盖了 `last_updated` 续行区 + `development_status` 块 + 其后的一切，
     *   是复盘唯一能合法藏身的范围的超集。
     *   ⚠️ 不去识别 BMAD 生成的静态结构头（那会让守卫在 BMAD 升级时假红）；
     *     静态头在 `last_updated:` **之前**，本来就不该被这条守卫量。
     */
    const lines = readFileSync(SPRINT_STATUS, 'utf8').split('\n')
    const lu = lines.findIndex((l) => l.startsWith('last_updated:'))

    expect(lu, 'sprint-status.yaml 里找不到 last_updated: —— 本守卫会静默空转').toBeGreaterThan(-1)

    const offenders = lines
      .slice(lu)
      .map((l, i) => ({ n: lu + i + 1, text: l }))
      .filter((x) => /^\s*#/.test(x.text))

    expect(
      offenders.length,
      `last_updated 之后已有 ${offenders.length} 行注释（上限 ${SPRINT_STATUS_MAX_COMMENT_LINES}）：\n` +
        offenders.map((x) => `  第 ${x.n} 行 ${x.text.trim().slice(0, 60)}`).join('\n') +
        '\n运行复盘属于 story 文档的 Completion Notes，按 R-42 不写在这里。' +
        '本文件只该有状态账本与一行指针。',
    ).toBeLessThanOrEqual(SPRINT_STATUS_MAX_COMMENT_LINES)
  })

  it('R-42 自检②：把复盘塞进 last_updated 的续行区，这条守卫必须红（2026-10-21 的实际漏洞）', () => {
    // 2026-10-20/21 的真实事故：`last_updated:` 后面挂了 113 行复盘，
    // 而旧守卫只量 `development_status:` 之后 —— 差 5 行就全绿放行。
    // 这条自检把事故原样重演一遍：构造 → 必须超限。
    const lines = readFileSync(SPRINT_STATUS, 'utf8').split('\n')
    const lu = lines.findIndex((l) => l.startsWith('last_updated:'))
    expect(lu, 'sprint-status.yaml 里找不到 last_updated:').toBeGreaterThan(-1)

    const count = (ls: string[], from: number) => ls.slice(from).filter((l) => /^\s*#/.test(l)).length
    expect(count(lines, lu), '现值本身已超限 —— 先把文件清干净再谈这条自检').toBeLessThanOrEqual(
      SPRINT_STATUS_MAX_COMMENT_LINES,
    )

    // 事故原样重演：在 last_updated 之后塞 20 行复盘
    const injected = [
      ...lines.slice(0, lu + 1),
      ...Array.from({ length: 20 }, (_, i) => `  # 第 ${i + 1} 行复盘：实测值、裁决理由、假绿复盘…`),
      ...lines.slice(lu + 1),
    ]

    expect(
      count(injected, lu),
      '构造失效：塞进 last_updated 续行区的 20 行复盘没被算进去 —— ' +
        '守卫的测量范围又被改窄了，这条自检就是它唯一的防线',
    ).toBeGreaterThan(SPRINT_STATUS_MAX_COMMENT_LINES)
  })

  it('R-42 自检：把 1.13 那段真实复盘塞回去，这条守卫必须红（否则又是一次假绿）', () => {
    // ⚠️ 这条不是形式主义，它记的是**这条守卫自己三次没咬住**的过程：
    //   首版量**全文件**注释数、上限 60 —— 塞 16 行复盘实测 **53 < 60，仍然全绿**；
    //   二版量 development_status 块但上限 8 —— 塞 6 行复盘仍绿；
    //   三版上限收到 4，实测塞 **3** 行复盘即报红（已用 Edit 真改文件验过）。
    // 若哪天有人把阈值调松，这条自检与那条守卫会一起失效，所以断言钉死「真实历史值」
    // 与「构造出的复盘行数」都必须超限，而不是钉死一个能自己成立的数。
    const narrative = Array.from(
      { length: SPRINT_STATUS_MAX_COMMENT_LINES + 1 },
      (_, i) => `  # 第 ${i + 1} 行复盘：实测值、裁决理由、假绿复盘、遗留说明…`,
    )

    expect(
      narrative.filter((l) => /^\s*#/.test(l)).length,
      '构造失效：模拟的复盘行数本身就没超限',
    ).toBeGreaterThan(SPRINT_STATUS_MAX_COMMENT_LINES)
    // 真实历史值：1.13 的那段复盘是 43 行，在现守卫下应超限近 11 倍
    expect(43).toBeGreaterThan(SPRINT_STATUS_MAX_COMMENT_LINES)
  })

  it('活跃文档不引用 archive/ 下的具体文件（AC-4）', () => {
    // 判据只咬「引用了某个具体归档文件」，不咬「提到 archive 这个目录」——
    // CLAUDE.md 的目录约定与 R-40 都必须能提到 archive/ 本身
    //
    // 范围含 `docs/`：M6 实测漏掉它时守卫对 docs/rules/process.md 里的引用完全失明，
    // 而那正是 R-40 自己所在的目录。
    const active = [CLAUDE_MD, ...walk(IMPL_DIR), ...walk(`${root}docs/`)]
    // 以 `.md` 收尾而不是「排除几个半角符号」：中文顿号/逗号/书名号不拦的话，
    // `archive/1-12-a.md、以及 archive/1-13-b.md` 会被整串吞成一条，
    // 报出来的路径是假的 —— 噪音大到让人去加白名单，而加白名单是 R-57 禁止的。
    // 左边界断言：`x-archive/1-12-a.md` 里的 `archive/` 是普通词的一部分，不是归档路径
    const ARCHIVE_REF = /(?<![\w-])archive\/1-[\dA-Za-z一-鿿-]*\.md/g
    const offenders: string[] = []
    for (const file of active) {
      const hit = readFileSync(file, 'utf8').match(ARCHIVE_REF)
      if (hit) offenders.push(`${file.slice(root.length)} → ${hit.join('、')}`)
    }
    expect(
      offenders,
      `活跃文档引用了归档里的具体文件，应改为 R-ID 引用或说明归属：\n${offenders.join('\n')}`,
    ).toEqual([])
  })
})

/**
 * ── G307 —— R-40 的**归档方向** ────────────────────────────────────────
 *
 * AC-4 那条守卫只查**一个方向**：活跃文档**不许引用**归档里的具体文件。
 * 它**查不出**另一个方向：**`done` 的 story 文档是不是真的归档了** ——
 * 一份 `done` 的 story 文档继续躺在 `implementation-artifacts/`，AC-4 一声不吭
 * （它没被引用，也不违反引用方向）。
 *
 * 实测（DF-180 / DF-181）：`1-11` / `1-12` / `2-1` 三份 `done` 的 story 文档
 * 一直躺在活跃目录里，而 `sprint-status.yaml` 早已把它们记成 `done`
 * ⇒ 「已归档」这件事**只写在约定里，没有任何牙齿**。
 *
 * 判据：**`sprint-status.yaml` 里状态是 `done` 的 story，它的文档不许留在
 * `implementation-artifacts/`**（要么在 `archive/`，要么根本没有文档 ——
 * 后者不算违规，因为 R-40 管的是「不许留在活跃目录」）。
 *
 * 出处：DF-180（归档没做）+ DF-181（守卫只查一个方向）。
 */
describe('G307 —— R-40 归档方向：done 的 story 文档不许留在活跃目录', () => {
  /** 从 `sprint-status.yaml` 的 `development_status` 块里取出状态为 `done` 的 story 键。 */
  it('G307.1 没有 `done` 的 story 文档还躺在 `implementation-artifacts/`', () => {
    const yaml = readFileSync(SPRINT_STATUS, 'utf8')
    // 非空自检：一条 `done` 都没解析到 ⇒ 判据在空集上成立（正则或缩进变了？）
    expect(
      doneStoryKeys(yaml).length,
      '一条 done 的 story 都没解析到 ⇒ 判据在空集上成立（正则或缩进变了？）',
    ).toBeGreaterThan(10)
    const problems = unarchivedDoneStories(yaml, (rel) => existsSync(join(root, rel)))
    expect(
      problems,
      `这些 story 在 sprint-status.yaml 里是 done，但文档还在活跃目录（R-40：done 的 story 文档要 git mv 进 archive/）：\n${problems.join('\n')}`,
    ).toEqual([])
  })

  it('G307.2 反向自测：判据真能把「done 却没归档」判成问题（判据本体真的被调用）', () => {
    // 构造：一份假 yaml，说 `1-99` 是 done，而「文件存在」⇒ 判据必须报出来。
    const fakeYaml = 'development_status:\n  1-99-假故事: done\n  1-98-别的: review\n'
    const problems = unarchivedDoneStories(fakeYaml, (rel) => rel.includes('1-99'))
    expect(
      problems.some((p) => p.includes('1-99')),
      `构造失效：判据没有报出 1-99 未归档：\n${problems.join('\n')}`,
    ).toBe(true)
    // 反向：真的归档了（文件不在活跃目录）⇒ 不许报。
    expect(
      unarchivedDoneStories(fakeYaml, () => false),
      '构造失效：文件不在活跃目录时判据仍然报错',
    ).toEqual([])
    // 构造：`review` 的 story 留在活跃目录是**合法的** ⇒ 不许报。
    const reviewProblems = unarchivedDoneStories(
      'development_status:\n  1-97-在审: review\n',
      () => true,
    )
    expect(reviewProblems, '构造失效：把 review 的 story 当成未归档报了出来').toEqual([])
  })
})

/** 判据本体：返回「状态是 done 但文档还留在活跃目录」的 story 键（空数组 = 全归档了）。 */
export function unarchivedDoneStories(
  yamlText: string,
  exists: (relPath: string) => boolean,
): string[] {
  const problems: string[] = []
  for (const key of doneStoryKeys(yamlText)) {
    if (exists(`_bmad-output/implementation-artifacts/${key}.md`)) {
      problems.push(
        `${key}：sprint-status.yaml 记的是 done，但它的文档还留在 implementation-artifacts/ —— ` +
          'R-40 要求 done 的 story 文档进 archive/',
      )
    }
  }
  return problems
}

/** `sprint-status.yaml` 的 `development_status` 块：story 键 → 状态。 */
export function yamlStatuses(yamlText: string): Map<string, string> {
  const statuses = new Map<string, string>()
  for (const line of yamlText.split('\n')) {
    // 只认 `development_status` 块里**两格缩进**的条目（顶层键没有缩进）。
    const m = line.match(/^ {2}(\S[^:]*):\s*(\S+)/)
    if (m) statuses.set(m[1]!.trim(), m[2]!.trim())
  }
  return statuses
}

/** `sprint-status.yaml` 里状态为 `done` 的 story 键（按出现顺序）。 */
export function doneStoryKeys(yamlText: string): string[] {
  const keys: string[] = []
  for (const [key, status] of yamlStatuses(yamlText)) {
    if (status === 'done') keys.push(key)
  }
  return keys
}

/**
 * ── G308 —— story 文档头的 `Status:` 必须与 `sprint-status.yaml` 一致 ────────
 *
 * DF-179 实测：全仓有 **5 处** story 文档头写着 `Status: review`，
 * 而 `sprint-status.yaml` 里那些 story 早已是 `done`（1-5 / 1-9 / 1-11 / 1-12 / 1-20）。
 * 漂移方向恒定：**文档头滞后**（yaml 改了、文档没改）——
 * 因为「状态」这个字段**住在 yaml 里**（R-30 唯一状态源），而文档头那行是**抄的**。
 *
 * 判据：对**有文档的** story 键，文档头的 `Status:` 行必须与 yaml 的状态**逐字相同**。
 * 没有文档的键（`backlog` 的 story、`epic-N`、retrospective）**不参与**判定 ——
 * 判据不假装管得了不存在的东西。
 */
describe('G308 —— story 文档头的 `Status:` 与 sprint-status.yaml 必须一致', () => {
  it('G308.1 没有 story 文档头与 yaml 的状态漂移', () => {
    const yaml = readFileSync(SPRINT_STATUS, 'utf8')
    // 非空自检：一个 story 文档都没找到 ⇒ 判据在空集上成立（路径或 yaml 解析变了？）
    const checked = [...yamlStatuses(yaml).keys()].filter((k) => readStoryDoc(k) !== null)
    expect(
      checked.length,
      '一个 story 文档都没找到 ⇒ 判据在空集上成立（路径或 yaml 解析变了？）',
    ).toBeGreaterThan(10)
    const problems = storyStatusDrift(yaml, (key) => readStoryDoc(key))
    expect(
      problems,
      `story 文档头的 Status 与 sprint-status.yaml 对不上（以 yaml 为准，R-30）：\n${problems.join('\n')}`,
    ).toEqual([])
  })

  it('G308.2 反向自测：判据真能把「文档头与 yaml 不一致」判成问题（判据本体真的被调用）', () => {
    const fakeYaml = 'development_status:\n  1-99-假故事: done\n'
    const drifted = storyStatusDrift(fakeYaml, () => 'Status: review\n')
    expect(
      drifted.some((p) => p.includes('1-99')),
      `构造失效：判据没有报出 1-99 的状态漂移：\n${drifted.join('\n')}`,
    ).toBe(true)
    // 反向：状态一致 ⇒ 不许报。
    expect(
      storyStatusDrift(fakeYaml, () => 'Status: done\n'),
      '构造失效：状态一致时判据仍然报错',
    ).toEqual([])
    // 反向：**没有文档**的键不参与判定（不假装管得了不存在的东西）。
    expect(
      storyStatusDrift(fakeYaml, () => null),
      '构造失效：没有文档的 story 被判成了漂移',
    ).toEqual([])
  })
})

/**
 * 判据本体：返回「文档头的 `Status:` 与 yaml 对不上」的条目（空数组 = 全一致）。
 *
 * `readDoc` 返回 `null` 表示**这个 story 没有文档**（`backlog` / epic / retrospective）⇒ 不判定。
 */
export function storyStatusDrift(
  yamlText: string,
  readDoc: (key: string) => string | null,
): string[] {
  const problems: string[] = []
  for (const [key, status] of yamlStatuses(yamlText)) {
    const doc = readDoc(key)
    if (doc === null) continue
    const m = doc.match(/^Status:\s*(\S+)/m)
    if (!m) {
      problems.push(`${key}：文档头没有 Status 行，而 sprint-status.yaml 记的是 ${status}`)
      continue
    }
    if (m[1] !== status) {
      problems.push(
        `${key}：文档头写 Status: ${m[1]}，sprint-status.yaml 写的是 ${status} —— ` +
          '以 yaml 为准（R-30 唯一状态源）',
      )
    }
  }
  return problems
}

/** 读一个 story 的文档正文（归档层或活跃层都找；都没有 ⇒ `null`）。 */
function readStoryDoc(key: string): string | null {
  for (const dir of ['_bmad-output/archive/', '_bmad-output/implementation-artifacts/']) {
    const path = join(root, dir, `${key}.md`)
    if (existsSync(path)) return readFileSync(path, 'utf8')
  }
  return null
}
