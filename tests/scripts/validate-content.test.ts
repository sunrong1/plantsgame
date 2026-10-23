/**
 * 校验脚本的守卫测试（Story 1.6 / AC-10 ~ AC-14.1、AC-19）。
 *
 * ── 守什么 ────────────────────────────────────────────────────────────────
 * · **五类错误逐类注入**（AC-11 / AC-19）—— 每一类都必须既被纯函数抓到（可断言分类与定位），
 *   又让 CLI 退出码变成 1（AC-10：那份恒退 0 的占位实现就是本 story 要消灭的东西）。
 * · **AC-14**：通过时输出统计并退 0。
 * · **AC-12**：新增单元文件无需改脚本。
 * · **AC-13**：错误逐条独立成行，不压成一行。
 *
 * ── 为什么这么写 ──────────────────────────────────────────────────────────
 * · **用真实 `unit-01.json` 作底，按需注入一处错误**。手搓一份假内容当底的话，
 *   「五类都抓到了」也可能是因为假内容本来就长歪了；真实内容打底，
 *   每条负例都精确地坏在一处。
 * · **词图用假文件系统**（`Set<string>`），不碰真实 `public/assets/` ——
 *   AC-14.1 明确要求词图根目录参数化，否则测试要么去删真实词图、要么只能断言退出码。
 * · **每条 `expect` 带中文失败消息**，写「为什么这条错了 → 会导致什么」。
 */

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it, vi } from 'vitest'

import {
  NEAR_DUPLICATE_MAX_DISTANCE,
  editDistance,
  expectedImageUrl,
  formatProblem,
  loadUnitFiles,
  main,
  optionNearDuplicateProblems,
  parseCli,
  printUnitDistributions,
  unitDistributionOf,
  unitFileNameProblems,
  unitNumberFromFileName,
  validateContent,
  type ValidateDeps,
} from '../../scripts/validate-content'

const root = fileURLToPath(new URL('../../', import.meta.url))

/**
 * 单元原始数据的**宽松**类型（不是 schema 类型）。
 *
 * ⚠️ 故意写得比 schema 宽（`kind: string`、`imageSrc?` 可选）：负例要能注入
 * 「非法的塔型」「单词卡配文字选项」这种**故意不合法**的值。
 * 用 schema 类型标注的话，每一处注入都得 `as any`，注入点与类型噪音混在一起。
 */
interface RawOption {
  id: string
  text?: string
  imageSrc?: string
  correct: boolean
}
interface RawCard {
  kind: string
  promptText: string
  options: RawOption[]
}
interface RawUnit {
  unitNumber: number
  entries: { entryId: string; wordId: string; towerType: string; card: RawCard }[]
}

const realUnit = JSON.parse(
  readFileSync(join(root, 'src/content/units/unit-01.json'), 'utf8'),
) as RawUnit

/** 深拷贝一份底，改动互不污染。 */
function unitCopy(): typeof realUnit {
  return JSON.parse(JSON.stringify(realUnit)) as typeof realUnit
}

/**
 * 一份**几何合规**的 SVG 正文（`viewBox 512` / `512×512` / 无铺满底）。
 *
 * Story 1.7 起校验器不只问「文件在不在」，还打开它读几何（AC-14.2）。
 * 假文件系统若只会「声称文件存在」而 `readFile` 一律返回 null，
 * 每条负例会额外冒出一条「无法读取」的噪音，且**绿色的那批也会变红** ——
 * 于是「负例抓到了」变得不可信（坏在别处）。
 */
function compliantSvg(label: string): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">',
    `  <circle cx="256" cy="256" r="120" fill="#123456" data-label="${label}" />`,
    '</svg>',
  ].join('\n')
}

/**
 * 词图的假文件系统：**存在性 + 内容**（Story 1.7 后两者都参与校验）。
 *
 * `contents` 用来注入「存在但几何不合规」的词图 —— 缺图只是缺图，
 * 读不出几何规格是另一类错误，两者必须能被分别断言。
 */
function fakeImages(
  existing: readonly string[],
  rootDir = '/fake/words',
  contents: Readonly<Record<string, string>> = {},
): ValidateDeps {
  const set = new Set(existing)
  return {
    wordImageRoot: rootDir,
    assetRoot: '/fake/assets',
    fileExists: (path) => set.has(path) || path in contents,
    readFile: (path) => contents[path] ?? (set.has(path) ? compliantSvg(path) : null),
    listFiles: (dir) => {
      const seen = new Set<string>()
      for (const p of [...set, ...Object.keys(contents)]) {
        if (p.startsWith(`${dir}/`)) seen.add(p.slice(dir.length + 1))
      }
      return [...seen]
    },
  }
}

/** 塔/僵尸资产在假文件系统里的位置（三个塔 + 一个僵尸，全齐且几何合规）。 */
const FAKE_ASSET_FILES = [
  '/fake/assets/towers/direct.svg',
  '/fake/assets/towers/slow.svg',
  '/fake/assets/towers/aoe.svg',
  '/fake/assets/zombies/zombie.svg',
]

/** `greenDeps()` 用的依赖：词图齐全 **且** 塔/僵尸资产齐全。 */
function greenAssetDeps(base: ValidateDeps): ValidateDeps {
  const contents: Record<string, string> = {}
  for (const path of FAKE_ASSET_FILES) contents[path] = compliantSvg(path)
  return {
    ...base,
    assetRoot: '/fake/assets',
    readFile: (path) => contents[path] ?? base.readFile(path),
    listFiles: (dir) =>
      dir.startsWith('/fake/assets')
        ? FAKE_ASSET_FILES.filter((p) => p.startsWith(`${dir}/`)).map((p) => p.slice(dir.length + 1))
        : base.listFiles(dir),
  }
}

/** 真实单元内容所需要的**全部**词图路径（正确项 + 干扰项，不是只有正确项）。 */
function allReferencedImages(unit = realUnit): string[] {
  const paths = new Set<string>()
  for (const entry of unit.entries) {
    for (const option of entry.card.options) {
      if (option.imageSrc !== undefined) paths.add(`${option.id}.svg`)
    }
  }
  return [...paths].sort()
}

/** 一套「全绿」的依赖：词图齐全 **且** 塔/僵尸资产齐全。 */
function greenDeps(unit = realUnit): ValidateDeps {
  return greenAssetDeps(
    fakeImages(allReferencedImages(unit).map((name) => `/fake/words/unit-01/${name}`)),
  )
}

/** 跑一次校验，返回结果与 CLI 退出码（退出码经 `main`，依赖注入假数据）。 */
function run(units: readonly unknown[], deps: ValidateDeps): {
  problems: ReturnType<typeof validateContent>['problems']
  exitCode: number
  errorLines: string[]
} {
  const problems = validateContent(units, deps).problems
  const lines: string[] = []
  const spy = vi.spyOn(console, 'error').mockImplementation((msg?: unknown) => {
    lines.push(String(msg))
  })
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  let exitCode: number
  try {
    exitCode = main([], {
      load: () => units.map((raw, i) => ({ file: `unit-0${i + 1}.json`, raw })),
      wordImageRoot: deps.wordImageRoot,
      assetRoot: deps.assetRoot,
      fileExists: deps.fileExists,
      readFile: deps.readFile,
      listFiles: deps.listFiles,
    })
  } finally {
    spy.mockRestore()
    logSpy.mockRestore()
  }
  return { problems, exitCode, errorLines: lines }
}

// ── 真实内容当前是绿的（下面所有负例的前提）───────────────────────────────

describe('AC-14 / AC-19 —— 真实内容当前通过校验', () => {
  it('单元 1 原样跑一遍没有 problems', () => {
    const result = validateContent([realUnit], greenDeps())

    expect(
      result.problems.map((p) => p.message),
      '真实内容本身有问题 ⇒ 下面所有负例都不可信（它们坏在别处，不坏在注入的那一处）',
    ).toEqual([])
    expect(result.ok).toBe(true)
  })

  it('退出码 0，统计按真实内容算（AC-14：单元数 / 卡数 / 三型分布）', () => {
    const { exitCode } = run([realUnit], greenDeps())

    expect(exitCode, '真实内容却退出非 0 ⇒ 校验器有假阳性，或内容真的坏了').toBe(0)
  })

  it('统计里的三型分布与内容实际一致（不写死数字，从内容算）', () => {
    const { stats } = validateContent([realUnit], greenDeps())
    const expected = realUnit.entries.reduce<Record<string, number>>((acc, entry) => {
      const kind = entry.card.kind as string
      acc[kind] = (acc[kind] ?? 0) + 1
      return acc
    }, {})

    expect(stats.unitCount).toBe(1)
    expect(stats.entryCount).toBe(realUnit.entries.length)
    expect(stats.cardCount).toBe(realUnit.entries.length)
    expect(stats.kindCounts).toEqual({
      word: expected['word'],
      keyword: expected['keyword'],
      response: expected['response'],
    })
  })

  it('跑真实文件系统（不注入）词图也是绿的 —— 30 张占位词图确实在磁盘上且几何合规', () => {
    const units = loadUnitFiles(join(root, 'src/content/units'))
    const result = validateContent(units.map((u) => u.raw), {
      wordImageRoot: join(root, 'public/assets/words'),
      assetRoot: join(root, 'public/assets'),
      fileExists: existsSync,
      readFile: (path) => (existsSync(path) ? readFileSync(path, 'utf8') : null),
      listFiles: (dir) => (existsSync(dir) ? readdirSync(dir) : []),
    })
    // ⚠️ 这里**只断言词图侧**（`word-image` / `svg-geometry` 且带词条定位）。
    // 塔/僵尸资产在真实磁盘上的断言由 `tests/assets/asset-geometry.test.ts` 的
    // G1/G2 承担 —— 放在这里断言「真实磁盘全绿」的话，在图还没画的窗口里
    // 它会因为**资产缺失**变红，而那条红与「词图有没有问题」无关，
    // 反而会让人去改词图。把两类断言混在一处，报错就指不到真正坏的地方。
    const wordImageProblems = result.problems.filter(
      (p) => p.category === 'word-image' || (p.category === 'svg-geometry' && p.entryId !== null),
    )

    expect(
      wordImageProblems.map((p) => formatProblem(p)),
      '真实磁盘上的内容/词图有问题',
    ).toEqual([])
  })
})

// ── 第 1 类：词图文件缺失或命名不符 ─────────────────────────────────────────

describe('AC-11 第 1 类 —— 词图缺失或命名不符（脚本侧）', () => {
  it('缺一张词图被抓出，报错含词条 id、期望路径、实际找到的文件', () => {
    const unit = unitCopy()
    const images = allReferencedImages(unit).filter((name) => name !== 'u1-cat.svg')
    const { problems, exitCode } = run([unit], fakeImages(images.map((n) => `/fake/words/unit-01/${n}`)))

    const problem = problems.find((p) => p.category === 'word-image')

    expect(problem, '缺词图没有被报出来 ⇒ 「词图缺失」这一类形同虚设').toBeDefined()
    expect(problem?.optionId, '报错没定位到具体词条（选项 id 就是词条 id）').toBe('u1-cat')
    expect(problem?.message).toContain('/fake/words/unit-01/u1-cat.svg')
    expect(problem?.message, '报错没列出该目录下实际找到了什么 ⇒ 录入者无从判断是漏画还是改名')
      .toContain('u1-dog.svg')
    expect(exitCode, '缺词图却退 0 ⇒ 「跑过了 validate:content」又变成一句空话').toBe(1)
  })

  it('词图目录整个不存在时，报错明说「没有任何 .svg」', () => {
    const { problems } = run([unitCopy()], fakeImages([]))

    expect(problems.filter((p) => p.category === 'word-image').length).toBeGreaterThan(0)
    expect(problems.map((p) => p.message).join('\n')).toContain('没有任何 .svg')
  })

  it('imageSrc 命名不符被抓出（文件名必须 = 词条 id，路径含单元目录）', () => {
    const unit = unitCopy()
    unit.entries[0].card.options[0] = {
      id: 'u1-hello',
      imageSrc: '/assets/word/u1-hello.svg',
      correct: true,
    }
    const { problems, exitCode } = run([unit], greenDeps(unit))

    const problem = problems.find((p) => p.message.includes('词图命名不符'))

    expect(problem, 'imageSrc 写成单数 word/ 却被放过 ⇒ 运行时那张图 404，无任何报错').toBeDefined()
    expect(problem?.message).toContain(expectedImageUrl(1, 'u1-hello'))
    expect(exitCode).toBe(1)
  })

  it('目录里多一张没人引用的词图被抓出（残留文件会让「齐了」的错觉持续）', () => {
    const images = [...allReferencedImages(), 'u1-ghost.svg']
    const { problems, exitCode } = run([unitCopy()], fakeImages(images.map((n) => `/fake/words/unit-01/${n}`)))

    expect(
      problems.some((p) => p.message.includes('u1-ghost.svg')),
      '没人引用的残留词图没被报出来',
    ).toBe(true)
    expect(exitCode).toBe(1)
  })

  it('关键词卡与回应卡的文字选项不需要词图（只有单词卡查图）', () => {
    // 若把「所有选项都查一遍图」，这两型会立刻报出一堆不存在的图 —— 那是假阳性。
    const { problems } = run([unitCopy()], greenDeps())

    expect(problems.filter((p) => p.category === 'word-image')).toEqual([])
  })
})

// ── 第 2 类：塔绑定指向不存在的塔型 ─────────────────────────────────────────

describe('AC-11 第 2 类 —— 塔绑定指向不存在的塔型', () => {
  it('非法塔型被抓出，报错含收到的值', () => {
    const unit = unitCopy()
    unit.entries[3].towerType = 'laser'
    const { problems, exitCode } = run([unit], greenDeps())

    const problem = problems.find((p) => p.category === 'tower-type')

    expect(problem, '非法塔型没被抓出 ⇒ 战斗层查 TOWER_STATS 时静默 undefined').toBeDefined()
    expect(problem?.entryId, '报错没定位到词条').toBe(unit.entries[3].entryId)
    expect(problem?.message, '报错没带上收到的非法值 ⇒ 录入者不知道自己打成了什么').toContain('laser')
    expect(exitCode).toBe(1)
  })
})

// ── 第 3 类：选项混入其他单元的词条 ─────────────────────────────────────────

describe('AC-11 第 3 类 —— 选项中混入其他单元的词条', () => {
  it('u2- 开头的选项被拒，报错含选项 id 与所属单元号', () => {
    const unit = unitCopy()
    const sentence = unit.entries.find((e) => e.card.kind === 'response')
    sentence!.card.options[1] = { id: 'u2-dog', text: 'dog', correct: false }
    const { problems, exitCode } = run([unit], greenDeps())

    const problem = problems.find((p) => p.category === 'foreign-option')

    expect(problem, '跨单元选项没被抓出 ⇒ 单元 1 的题面里混进单元 2 的词条').toBeDefined()
    expect(problem?.optionId).toBe('u2-dog')
    expect(problem?.message).toContain('u1-')
    expect(exitCode).toBe(1)
  })
})

// ── 第 4 类：卡型与选项形态不符 ─────────────────────────────────────────────

describe('AC-11 第 4 类 —— 卡型与选项形态不符', () => {
  it('单词卡配文字选项被拒，报错含卡型与选项 id', () => {
    const unit = unitCopy()
    unit.entries[10].card.options[2] = { id: 'u1-rabbit', text: 'rabbit', correct: false }
    const { problems, exitCode } = run([unit], greenDeps())

    const problem = problems.find((p) => p.category === 'kind-option-mismatch')

    expect(problem, '单词卡配文字选项没被抓出 ⇒ 渲染层会画出图片卡里的文字按钮').toBeDefined()
    expect(problem?.message).toContain('word')
    expect(problem?.optionId).toBe('u1-rabbit')
    expect(exitCode).toBe(1)
  })

  it('回应卡配图片选项被拒', () => {
    const unit = unitCopy()
    const response = unit.entries.find((e) => e.card.kind === 'response')
    response!.card.options[0] = {
      id: 'u1-dog',
      imageSrc: '/assets/words/unit-01/u1-dog.svg',
      correct: true,
    }
    const { problems, exitCode } = run([unit], greenDeps())

    expect(problems.some((p) => p.category === 'kind-option-mismatch')).toBe(true)
    expect(exitCode).toBe(1)
  })
})

// ── 第 5 类：卡面 TTS 文本为空 ──────────────────────────────────────────────

describe('AC-11 第 5 类 —— 卡面 TTS 文本为空', () => {
  it('空卡面被拒，报错含 promptText 的所在路径', () => {
    const unit = unitCopy()
    unit.entries[5].card.promptText = '   '
    const { problems, exitCode } = run([unit], greenDeps())

    const problem = problems.find((p) => p.category === 'empty-prompt')

    expect(problem, '空卡面没被抓出 ⇒ 孩子听到一片静默，界面上是一张没有题面的卡').toBeDefined()
    expect(problem?.message, '报错没指出是哪个字段 ⇒ 录入者不知道要改 promptText').toContain(
      'promptText',
    )
    expect(problem?.entryId).toBe(unit.entries[5].entryId)
    expect(exitCode).toBe(1)
  })
})

// ── 五类同时注入 ────────────────────────────────────────────────────────────

describe('AC-11 —— 五类错误一次全报出来（不 early return）', () => {
  it('五类各注入一处，五类全部出现在同一次输出里', () => {
    const unit = unitCopy()
    // 1 词图缺失 —— 靠 deps 少给一张图
    const images = allReferencedImages(unit).filter((n) => n !== 'u1-cat.svg')
    // 2 塔型
    unit.entries[0].towerType = 'laser'
    // 4 卡型与形态
    unit.entries[10].card.options[2] = { id: 'u1-rabbit', text: 'rabbit', correct: false }
    // 5 空卡面
    unit.entries[20].card.promptText = ''
    // 3 跨单元选项 —— 放在**另一个**单元里。
    //    ⚠️ 为什么不能也塞进单元 1：Zod 的 `superRefine` 在**同一层 shape 解析失败时不会执行**，
    //    而单元 1 已经有 2/4/5 三处 shape 错误 ⇒ 单元级 refinement（跨单元选项那条）
    //    压根不会跑。这是 Zod 的既定语义，不是本实现的取舍 ——
    //    想同时看到全部五类，就得让它们分布在「都能跑到底」的层级上。
    const unit2 = {
      unitNumber: 2,
      entries: [
        {
          entryId: 'u2-s-how-are-you',
          wordId: 'u2-s-how-are-you',
          towerType: 'direct',
          card: {
            kind: 'response',
            promptText: 'How are you?',
            options: [
              { id: 'u1-cat', text: 'cat', correct: true },
              { id: 'u2-s-good-morning', text: 'Good morning!', correct: false },
            ],
          },
        },
        {
          entryId: 'u2-s-good-morning',
          wordId: 'u2-s-good-morning',
          towerType: 'slow',
          card: {
            kind: 'response',
            promptText: 'Good morning!',
            options: [
              { id: 'u2-s-good-morning', text: 'Good morning!', correct: true },
              { id: 'u2-s-how-are-you', text: 'How are you?', correct: false },
            ],
          },
        },
      ],
    }

    const { problems, exitCode } = run([unit, unit2], fakeImages(images.map((n) => `/fake/words/unit-01/${n}`)))
    const categories = new Set(problems.map((p) => p.category))

    for (const category of [
      'word-image',
      'tower-type',
      'foreign-option',
      'kind-option-mismatch',
      'empty-prompt',
    ] as const) {
      expect(
        categories.has(category),
        `同时注入五类错误，输出里却没有 ${category} ⇒ 校验器遇到第一个错就退出了`,
      ).toBe(true)
    }
    expect(exitCode).toBe(1)
  })

  it('schema 层失败时单元级 refinement 不执行 —— 记录 Zod 的既定语义，别误判成漏报', () => {
    // 单元 1 只有一处 shape 错误（非法塔型），跨单元选项也在同一个单元里：
    // Zod 不会跑单元级 superRefine，所以跨单元那条**不会**出现。
    // 这不是校验器的 bug，测试把它钉住，避免下一个人以为「五类必须同时报」并写出假绿。
    const unit = unitCopy()
    unit.entries[0].towerType = 'laser'
    const response = unit.entries.find((e) => e.card.kind === 'response')!
    response.card.options[1] = { id: 'u2-dog', text: 'dog', correct: false }

    const { problems } = run([unit], greenDeps())

    expect(problems.some((p) => p.category === 'tower-type')).toBe(true)
    expect(
      problems.some((p) => p.category === 'foreign-option'),
      '单元级 refinement 竟然跑了 —— 若哪天 zod 改了语义，这条断言会提醒更新上面的说明',
    ).toBe(false)
  })

  it('错误逐条独立成行（AC-13：不得把 30 个错误压成一行）', () => {
    const unit = unitCopy()
    for (const entry of unit.entries) entry.towerType = 'laser'
    const { errorLines, problems } = run([unit], greenDeps())

    const problemLines = errorLines.filter((line) => line.includes('[content] ERROR [tower-type]'))
    expect(problems.length).toBeGreaterThan(1)
    expect(
      problemLines.length,
      `注入 ${problems.length} 个错误只打了 ${problemLines.length} 行 ⇒ 多条被压成了一行`,
    ).toBe(problems.filter((p) => p.category === 'tower-type').length)
    expect(problemLines[0]).toContain('[content] ERROR')
  })

  it('日志前缀是 [content]（架构 :605-617）', () => {
    const unit = unitCopy()
    unit.entries[0].towerType = 'laser'
    const { errorLines } = run([unit], greenDeps())

    expect(errorLines.every((line) => line.startsWith('[content]')), '有错误行没有 [content] 前缀').toBe(
      true,
    )
  })
})

// ── entryId 全局唯一（AC-8 的「全局」那半）──────────────────────────────────

describe('AC-8 —— entryId 全局唯一', () => {
  it('两个单元出现同一个 entryId 会被报出来（单元内唯一由 schema 守，跨单元只能靠脚本）', () => {
    const unit1 = unitCopy()
    const unit2 = unitCopy()
    unit2.unitNumber = 2
    for (const entry of unit2.entries) entry.entryId = entry.entryId.replace(/^u1-/, 'u2-')

    // 让两条共用同一个 id：把单元 2 的第一条改成单元 1 已有的 id
    unit2.entries[0].entryId = unit1.entries[0].entryId
    unit2.entries[0].card = unit1.entries[0].card

    const { problems, exitCode } = run([unit1, unit2], greenDeps())
    const problem = problems.find((p) => p.category === 'duplicate-entry-id')

    expect(
      problem,
      '跨单元重复 entryId 没被抓出 ⇒ 两个单元的同名词共用一个录音文件名，互相覆盖',
    ).toBeDefined()
    expect(problem?.message).toContain(unit1.entries[0].entryId)
    expect(exitCode).toBe(1)
  })
})

// ── AC-12：覆盖全部单元文件 ─────────────────────────────────────────────────

describe('AC-12 —— 校验覆盖全部单元文件', () => {
  it('loadUnitFiles 读目录下的全部 unit-*.json（新增单元无需改脚本）', () => {
    // ⚠️ [CR] 2026-10-14：原先断言写的是 `toEqual(['unit-01.json'])` —— 方向反了。
    //   AC-12 要守的是「新增单元**不需要改任何脚本**」，而那条断言恰恰要求
    //   目录里永远只有 unit-01.json：有人正确地录入了 unit-02.json，它就红。
    //   现在改成「loader 读到的 === 磁盘上的」，两边同源，加文件必红、漏读也红。
    const dir = join(root, 'src/content/units')
    const onDisk = readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .sort()
    const loaded = loadUnitFiles(dir).map((u) => u.file).sort()

    expect(loaded, 'loader 漏读了磁盘上存在的单元文件 ⇒ 新增的单元不会被校验').toEqual(onDisk)
    // 防「目录恰好为空 ⇒ 两条空数组恒等」这种永远为真的形态。
    expect(onDisk.length, 'units/ 下一个 JSON 都没有 ⇒ 上面那条断言恒真').toBeGreaterThan(0)
  })

  it('真正的坏 JSON 会让 loadUnitFiles 抛出，且报错带文件名', () => {
    // ⚠️ [CR] 2026-10-14：原先这条路径**从未被执行过**。上一条测试用
    //   `{ load: () => [{ file, raw: undefined }] }` 把 loadUnitFiles 整个替掉了，
    //   测的是「main 拿到 undefined 时会不会退 1」，而 `JSON.parse` 那段
    //   catch（scripts/validate-content.ts:362）从没有一条测试走进过。
    //   真把 unit-02.json 写坏一个逗号，下面的测试正是那个场景。
    const dir = mkdtempSync(join(tmpdir(), 'validate-content-'))
    try {
      const badFile = join(dir, 'unit-02.json')
      writeFileSync(badFile, '{ "unitNumber": 2, "entries": [ }', 'utf8')

      let message = ''
      try {
        loadUnitFiles(dir)
      } catch (error) {
        message = error instanceof Error ? error.message : String(error)
      }

      expect(message, '坏 JSON 没抛错 ⇒ 校验会拿 undefined 当内容继续跑').toContain('unit-02.json')
      expect(message, '报错里没有解析器的具体原因 ⇒ 录入者无从下手').toContain('JSON')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('单元文件不是合法 JSON 时报出文件名与原因，且退 1', () => {
    const lines: string[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((msg?: unknown) => {
      lines.push(String(msg))
    })
    let exitCode: number
    try {
      exitCode = main([], { load: () => [{ file: 'unit-99.json', raw: undefined }] })
    } finally {
      spy.mockRestore()
    }

    expect(exitCode, 'JSON 结构不对却退 0').toBe(1)
    expect(lines.join('\n')).toContain('[content]')
  })

  it('单元目录为空时报错（内容不存在 ≠ 校验通过）', () => {
    const lines: string[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((msg?: unknown) => {
      lines.push(String(msg))
    })
    let exitCode: number
    try {
      exitCode = main([], { load: () => [] })
    } finally {
      spy.mockRestore()
    }

    expect(exitCode, '一个单元都没有却退 0 —— 那正是本 story 要消灭的假绿').toBe(1)
    expect(lines.join('\n')).toContain('没有任何单元 JSON')
  })
})

// ── CLI 参数 ────────────────────────────────────────────────────────────────
//
// ⚠️ [CR] 2026-10-14：这一整块原先**不存在**。`parseCli` 是模块私有的，
//   而测试里每次调 `main` 都传 `[]`，于是 `--word-image-root` 这条通路零覆盖 ——
//   参数名拼错、忘了 `i += 1`、少了缺参检查，全都不会有任何测试变红。
//   这是词图尚未录入（Epic 2）期间唯一的词图目录入口：它坏掉时无任何症状，
//   要等 Epic 2 真正往那个目录里放图时才会一次性爆发。

describe('CLI —— --word-image-root', () => {
  it('不给参数时用默认词图目录（public/assets/words）', () => {
    expect(parseCli([]).wordImageRoot.replace(/\\/g, '/')).toMatch(/public\/assets\/words$/)
  })

  it('--word-image-root <目录> 覆盖默认值', () => {
    expect(parseCli(['--word-image-root', '/tmp/my-words']).wordImageRoot).toBe('/tmp/my-words')
  })

  it('参数值被吃掉，不会再被当成下一个参数解析（守 `i += 1`）', () => {
    // 若漏了 `i += 1`，下一轮会把 '--word-image-root' 当成 arg 走到「未知参数」分支。
    expect(parseCli(['--word-image-root', '/tmp/a', '--word-image-root', '/tmp/b']).wordImageRoot).toBe(
      '/tmp/b',
    )
  })

  it.each([
    { argv: ['--word-image-root'], why: '完全没给值' },
    { argv: ['--word-image-root', '   '], why: '给了空白串 —— 会被当成真实路径，词图检查全落空' },
    { argv: ['--word-image-root', '--别的参数'], why: '下一个是别的 flag' },
  ])('$why 时报错（"$argv"）', ({ argv }) => {
    expect(() => parseCli(argv), '缺参竟然没报错 ⇒ 词图目录会静默变成 undefined/下一个参数').toThrow(
      /--word-image-root 需要一个目录参数/,
    )
  })

  it('未知参数报错，且把参数名与支持项一起打出来', () => {
    let message = ''
    try {
      parseCli(['--word-images-root', '/tmp/x'])
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }

    expect(message, '参数名打错（少个 s）没报错 ⇒ 词图目录静默回落到默认目录').toContain('--word-images-root')
    expect(message, '报错里没列出支持哪些参数 ⇒ 录入者只能猜').toContain('--word-image-root')
  })

  it('经 main 端到端生效：把词图目录指到一个空目录 ⇒ 报出词图缺失', () => {
    // 这条守的是「parseCli 的返回值真的接到了 validateContent」，
    // 而不只是 parseCli 自己的返回值对 —— 中间隔着 main 里那一行 ?? 三元。
    const lines: string[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((msg?: unknown) => {
      lines.push(String(msg))
    })
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    let exitCode: number
    try {
      exitCode = main(['--word-image-root', '/tmp/definitely-empty-words'], {
        load: () => [{ file: 'unit-01.json', raw: unitCopy() }],
        fileExists: () => false,
        listFiles: () => [],
      })
    } finally {
      spy.mockRestore()
      logSpy.mockRestore()
    }

    expect(exitCode, '词图全缺却退 0').toBe(1)
    expect(lines.join('\n')).toContain('word-image')
  })
})

// ── 宽松遍历路径拼接的安全边界 ──────────────────────────────────────────────

describe('词图检查不会用未校验的 option.id 拼路径', () => {
  it('option.id 含路径分隔符时，报错里不出现词图根目录之外的文件系统路径', () => {
    // ⚠️ [CR] 2026-10-14：`imageOptionsOf` 刻意从**原始** JSON 宽松遍历
    //   （schema 没过也要把问题全报出来），所以这里的 option.id 未经任何形态校验。
    //   一个 "../../../../etc/passwd" 会被 join 拼成词图根目录之外的绝对路径，
    //   再原样打进错误信息 —— 报错本身成了路径穿越的输出通道。
    //   （实际影响有限：内容文件是仓库内的信任数据，且这里只做存在性探测。）
    //
    // ⚠️ 这条断言查的是**解析后**落在词图根目录之外的路径（`join` 会把
    //   `../../../../` 归一化掉，所以 `/fake/words` 反而不会出现在结果里 ——
    //   第一次写这条断言时正是在这里漏掉了变异：过滤条件用的是 `/fake/words`）。
    //   查「报错里出现了这个 id」是错的：id 出现在报错里**应该**，
    //   它正是「哪个选项写错了」的定位信息，屏蔽它会让报错失去价值。
    const unit = unitCopy()
    unit.entries[0].card.options[0] = {
      id: '../../../../etc/passwd',
      imageSrc: '/assets/words/unit-01/u1-hello.svg',
      correct: true,
    }
    const { problems } = run([unit], greenDeps())

    const leakedFsPaths = problems
      .map((p) => p.message)
      .filter((m) => m.includes('/etc/passwd.svg'))

    expect(
      leakedFsPaths,
      `报错里打出了词图根目录之外的文件系统路径：\n${leakedFsPaths.join('\n')}`,
    ).toEqual([])
  })

  it('malformed id 不再走存在性检查（不拿它去磁盘上 stat）', () => {
    // 与上一条是同一件事的两面：既不打出来，也不去碰。
    // 「词图缺失」这条消息里必然含 wordImageRoot —— 它一出现就说明代码拿非法 id 拼了路径。
    const unit = unitCopy()
    unit.entries[0].card.options[0] = {
      id: '../../../../etc/passwd',
      imageSrc: '/assets/words/unit-01/u1-hello.svg',
      correct: true,
    }
    const { problems } = run([unit], greenDeps())

    expect(
      problems.filter((p) => p.message.includes('词图缺失')),
      '拿非法 option.id 去磁盘上找文件了 —— 存在性探测本身就是一个可达性原语',
    ).toEqual([])
  })

  it('形态不合法的 option.id 报「id 本身不合法」，而不是拿它编一个「规范路径」出来', () => {
    // 上一步的守卫不能只是「跳过」—— 那样这条非法 id 就彻底静默了。
    // 也不能像第一版那样报「规范路径应为 /assets/words/unit-01/../../../etc/passwd.svg」：
    // 那个「应为」是用垃圾拼出来的，会把录入者引向一个根本不对的方向。
    const unit = unitCopy()
    unit.entries[0].card.options[0] = {
      id: '../../../../etc/passwd',
      imageSrc: '/assets/word/u1-hello.svg',
      correct: true,
    }
    const { problems, exitCode } = run([unit], greenDeps())

    expect(
      problems.some((p) => p.message.includes('不是合法的词条 id')),
      '非法 id 没有任何报错 ⇒ 它变成了一条完全静默的通过',
    ).toBe(true)
    expect(
      problems.some((p) => p.message.includes('规范路径应为')),
      '为非法 id 编造了「规范路径」⇒ 录入者会去改一个本来就不该存在的 URL',
    ).toBe(false)
    expect(exitCode).toBe(1)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Story 2.4 —— 两类新校验（守卫 G267 – G269）
// ══════════════════════════════════════════════════════════════════════════════

describe('G267 —— 选项数不符被抓出（Story 2.4 / AC-B3、AC-C3）', () => {
  it('给一张单词卡多塞一个选项 ⇒ 报 option-count，且说清期望值与实际值', () => {
    // ⚠️ 注入的是**一张真实单词卡**（多一个合法 id 的合法图片选项），
    //   所以这一条红的原因只有「选项数」—— 词图、id 形态、卡型都还是合法的。
    const unit = unitCopy()
    const target = unit.entries.find((e) => e.card.kind === 'word')
    if (target === undefined) throw new Error('单元 1 里没有单词卡 —— 夹具失效')
    const wordIds = new Set(unit.entries.filter((e) => e.card.kind === 'word').map((e) => e.entryId))
    const spare = [...wordIds].find((id) => !target.card.options.some((o) => o.id === id))
    if (spare === undefined) throw new Error('没有可用的备用单词 id —— 夹具失效')
    target.card.options.push({
      id: spare,
      imageSrc: `/assets/words/unit-01/${spare}.svg`,
      correct: false,
    })

    const { problems, exitCode } = run([unit], greenDeps(unit))

    const problem = problems.find((p) => p.category === 'option-count')
    expect(
      problem,
      '选项数不符没有被报出来 ⇒ 单元 1 的选项数与规则脱钩，难度阶梯在内容这一侧失守',
    ).toBeDefined()
    expect(problem?.entryId, '报错没定位到是哪张卡 ⇒ 录入者要自己逐张数').toBe(target.entryId)
    expect(problem?.message, '报错没说出期望值 ⇒ 录入者不知道该改成几个').toContain('期望')
    expect(problem?.message, '报错没说出实际值 ⇒ 录入者不知道自己写多了几个').toContain('实际')
    expect(exitCode, '选项数不符却退 0 ⇒ 「跑过了 validate:content」又变成一句空话').toBe(1)
  })

  it('反向自测：把那个多出来的选项去掉 ⇒ option-count 问题消失', () => {
    // ⚠️ R-51：判据必须真能咬住它要防的违规 —— 这一条从另一头证明：
    //   合法内容下不得报（否则上面那条可能是「无论什么都报」）。
    const { problems } = run([unitCopy()], greenDeps())

    expect(
      problems.filter((p) => p.category === 'option-count'),
      '未改动的真实内容报了选项数问题 ⇒ 判据或规则有一边是错的',
    ).toEqual([])
  })
})

describe('G268 —— 卡内选项近邻被抓出（Story 2.4 / AC-B4）', () => {
  it('两个文字选项只差一个字母 ⇒ 报 option-near-duplicate', () => {
    const unit = unitCopy()
    // ⚠️ **注入的是「加一个几乎一样的选项」**，不是「把某个选项改成另一个的副本」——
    //   后者会把「要比较的那一对」里的一个换掉，判据就无从比较了
    //   （第一稿就栽在这里：把「Goodbye」改成「Goodby」之后，卡里已经**没有**「Goodbye」了）。
    //   近邻判据比的是**同一张卡里两个都在**的选项之间的距离 ⇒ 必须让那一对同时存在。
    // 「Helo」与「Hello」归一化后编辑距离 = 1 ⇒ 落在阈值 2 内。
    // ⚠️ 这一对**故意不是前缀关系**（`helo` 不是 `hello` 的前缀）：
    //   判据里那条「互为前缀」的分支是**冗余**的（前缀对的编辑距离恰好等于长度差），
    //   若注入的恰好是前缀对，那条分支会替它兜住 ⇒ 判据里那半条坏掉时用例仍然绿。
    const card = unit.entries.find((e) => e.entryId === 'u1-s-good-morning')
    if (card === undefined) throw new Error('单元 1 里没有 u1-s-good-morning 这张卡 —— 夹具失效')
    if (!card.card.options.some((o) => o.text === 'Hello')) throw new Error('夹具失效：该卡上找不到「Hello」选项')
    // ⚠️ 这个选项的 id 指向本单元真实存在的词条（校验器的「选项必须指向本单元存在的词条」
    //   那条要绿），而**文本**是「Hello」的手误形态 —— 本条要验的是文本距离。
    card.card.options.push({ id: 'u1-dog', text: 'Helo', correct: false })

    const { problems, exitCode } = run([unit], greenDeps(unit))

    const problem = problems.find((p) => p.category === 'option-near-duplicate')
    expect(
      problem,
      '只差一个字母的两个选项没有被报出来 ⇒ 孩子要逐字辨认才能分辨两个按钮，' +
        '而校验器本该在录入那一刻就拦下来',
    ).toBeDefined()
    expect(problem?.message, '报错没指出是哪两个选项 ⇒ 录入者无从下手').toContain('Helo')
    expect(problem?.message, '报错没指出另一个选项 ⇒ 录入者无从下手').toContain('Hello')
    expect(exitCode, '近邻选项却退 0 ⇒ 这一类错误静默通过').toBe(1)
  })

  it('反向自测：改回正确拼写 ⇒ 这个问题消失', () => {
    const { problems } = run([unitCopy()], greenDeps())

    expect(
      problems.filter((p) => p.category === 'option-near-duplicate'),
      '未改动的真实内容报了近邻选项 ⇒ 阈值或归一化把合格的干扰项判坏了',
    ).toEqual([])
  })
})

describe('G269 —— 规则范围外的单元号不崩，只报一条能定位的问题（Story 2.4 / AC-C3）', () => {
  it('unitNumber 21 ⇒ 退出码非 0，报出一条能定位的问题，不是堆栈', () => {
    const unit = unitCopy()
    unit.unitNumber = 21

    const { problems, exitCode } = run([unit], greenDeps(unit))

    const optionCountProblems = problems.filter((p) => p.category === 'option-count')
    expect(
      optionCountProblems.length,
      `规则不覆盖的单元没有报 option-count 问题（实际报了 ${optionCountProblems.length} 条）—— ` +
        '要么静默放过（内容在规则范围外却没人管），要么报了一堆（37 张卡报 37 遍同一条原因是噪声）',
    ).toBe(1)
    expect(
      optionCountProblems[0].message,
      '报错里没有单元号 ⇒ 录入者不知道是哪个单元越界了',
    ).toContain('21')
    expect(
      optionCountProblems[0].message,
      '报错没说是「规则不覆盖」⇒ 录入者会以为是自己选项数写错了',
    ).toContain('不覆盖')
    expect(exitCode, '越界单元却退 0 ⇒ 规则范围外的单元被静默放行').toBe(1)
  })

  it('反向自测：单元号 20（仍在覆盖内）⇒ 不报这条', () => {
    const unit = unitCopy()
    unit.unitNumber = 20

    const { problems } = run([unit], greenDeps(unit))

    expect(
      problems.filter((p) => p.category === 'option-count' && p.message.includes('不覆盖')),
      '单元 20 在规则覆盖内却被报成「不覆盖」⇒ 规则的覆盖范围与它自己声明的不一致',
    ).toEqual([])
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// `[CR]` 2026-10-23 —— 三条在 `[CR]` 里被指出的判据缺陷，各配一条守卫
// （G271 / G272 / G273；变异 M321 / M320 / M322）
// ══════════════════════════════════════════════════════════════════════════════

describe('G271 —— 纯标点选项（两个「什么都没有」的按钮）必须被报出来', () => {
  it('两个「什么都没有」的按钮（纯标点选项）必须被报出来', () => {
    // ⚠️ **归一化后为空串的选项不能被跳过**：`"!!!"` 与 `"???"` 归一化后都是空串，
    //   而 schema 的 `blankOptionField` 只挡**纯空白**（`"!!!"` 是合法文本）⇒
    //   修复前这两个按钮**零条报错**，可它们在孩子眼里就是两个一样的按钮。
    const unit = unitCopy()
    const card = unit.entries.find((e) => e.entryId === 'u1-s-good-morning')
    if (card === undefined) throw new Error('单元 1 里没有 u1-s-good-morning 这张卡 —— 夹具失效')
    card.card.options[0].text = '!!!'
    card.card.options[1].text = '???'

    const { problems } = run([unit], greenDeps(unit))

    const hit = problems.find((p) => p.category === 'option-near-duplicate')
    expect(
      hit,
      '两个纯标点的选项没有被报出来 ⇒ 归一化后为空串的组合被主动放过了',
    ).toBeDefined()
    expect(hit?.message, '报错里没有那两个选项 ⇒ 定位不到是哪一对').toContain('!!!')
    expect(hit?.message, '报错里没有那两个选项 ⇒ 定位不到是哪一对').toContain('???')
  })
})

describe('G272 —— 完全相同的两个选项由 schema 报，近邻判据不重复报同一件事', () => {
  it('**完全相同**的两个选项由 schema 报（近邻判据不重复报同一件事）', () => {
    // ⚠️ R-02：一份判定只有一个来源。schema 的 `duplicateOptionText`
    //   （键 = `trim().toLowerCase()`）已经报「显示文本都是 X」⇒
    //   近邻判据对同一对**不得**再报一条 ⇒ 否则一个违规出两行、两个类别。
    const unit = unitCopy()
    const card = unit.entries.find((e) => e.entryId === 'u1-s-good-morning')
    if (card === undefined) throw new Error('单元 1 里没有 u1-s-good-morning 这张卡 —— 夹具失效')
    card.card.options[1].text = card.card.options[0].text

    const { problems } = run([unit], greenDeps(unit))

    expect(
      problems.filter((p) => p.category === 'duplicate-option-text'),
      '完全相同的两个选项没有被 schema 报出来 ⇒ 夹具没造出该违规',
    ).not.toEqual([])
    expect(
      problems.filter((p) => p.category === 'option-near-duplicate'),
      '完全相同的两个选项被近邻判据**又**报了一遍 ⇒ 一个违规两行（R-02）',
    ).toEqual([])
  })
})

describe('G273 —— 单元号非法 ⇒ 报「选项数这一维没跑」，而不是静默跳过', () => {
  it('单元号不是数字 ⇒ 报「选项数这一维没跑」，而不是静默跳过', () => {
    // ⚠️ 修复前：`unitNumberAt(raw)` 返回 null ⇒ 这一维**从头到尾没被核对过**，
    //   报告里只有 schema 的一条类型错 ⇒ 读报告的人会误以为「选项数没问题」。
    const unit = unitCopy()
    ;(unit as unknown as { unitNumber: unknown }).unitNumber = '1'

    const { problems } = run([unit], greenDeps(unit))

    const hit = problems.find((p) => p.category === 'option-count')
    expect(
      hit,
      '单元号非法时一条 option-count 问题都没有 ⇒ 这一维被静默跳过了',
    ).toBeDefined()
    expect(hit?.message, '报错没说明「这一维没跑」⇒ 读报告的人会以为选项数没问题').toContain('无法核对')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// `[CR]` 2026-10-23 —— 本轮改的另外三处判据，各配一条守卫
// （G274 / G275 / G276；变异 M323 / M324 / M325）
// ⚠️ **每条新守卫都必须能被变异打红** —— 「全绿」在这类补丁上等于「没人守着」。
// ══════════════════════════════════════════════════════════════════════════════

describe('G274 —— 归一化必须做 Unicode 规范化（NFKC），全角与半角是同一个词', () => {
  it('全角写法的同一个词（Ｃａｔ）与半角（Cat）必须被报出来', () => {
    // ⚠️ **不做 NFKC 会漏掉这一对**：`Ｃａｔ` 的全角字母属于 `\p{L}` ⇒ 去标点那步留得住
    //   ⇒ 归一化后仍是 `ｃａｔ` ⇒ 与 `cat` 的编辑距离 = **3** ⇒ **阈值 2 抓不到**。
    //   而孩子眼里这两个按钮**一模一样**。
    //   NFKC 一次解决两件事：全角折半角（这条）、组合重音合成（NFD 的 `café`）。
    const unit = unitCopy()
    const card = unit.entries.find((e) => e.entryId === 'u1-s-good-morning')
    if (card === undefined) throw new Error('单元 1 里没有 u1-s-good-morning 这张卡 —— 夹具失效')
    card.card.options[0].text = 'Ｃａｔ'
    card.card.options[1].text = 'Cat'

    const { problems } = run([unit], greenDeps(unit))

    const hit = problems.find((p) => p.category === 'option-near-duplicate')
    expect(
      hit,
      '全角 `Ｃａｔ` 与半角 `Cat` 没有被报出来 ⇒ 归一化漏了 Unicode 规范化（NFKC）',
    ).toBeDefined()
    expect(hit?.message, '报错里没有那两个选项 ⇒ 定位不到是哪一对').toContain('Ｃａｔ')
  })
})

describe('G275 —— 编辑距离按**码点**算，不按 UTF-16 码元算', () => {
  it('emoji 代理对算**一个**字符，不是两个', () => {
    // ⚠️ `a.length` 数的是 UTF-16 **码元** ⇒ 一个 emoji 是 2 个码元
    //   ⇒ 距离凭空翻倍 ⇒ **该报的漏报**（阈值 2 抓不住）。
    //   码点口径下：`😀😀` 与 `😀😀😀😀` 相差 **2** 个字符 ⇒ 落在阈值 2 内。
    expect(
      editDistance('😀😀', '😀😀😀😀'),
      '编辑距离把一个 emoji 当成两个字符 ⇒ 距离翻倍（UTF-16 码元口径）',
    ).toBe(2)
    expect(
      editDistance('😀', '😀😀'),
      '一个 emoji 与两个 emoji 的距离应为 1（码点口径）',
    ).toBe(1)
  })
})

describe('G276 —— 单元号不是整数 ⇒ 报「不是整数」，不是「规则不覆盖这个单元」', () => {
  it('单元号 1.5 ⇒ 报错必须指向「不是整数」', () => {
    // ⚠️ 修复前，三种失败原因都写成「规则不覆盖单元 N」⇒ 「不是整数」这条会把作者
    //   引到错的地方（去改 `LAST_UNIT`）。⇒ 报错文案必须指向真正的原因。
    const unit = unitCopy()
    ;(unit as unknown as { unitNumber: unknown }).unitNumber = 1.5

    const { problems } = run([unit], greenDeps(unit))

    const hit = problems.find((p) => p.category === 'option-count')
    expect(hit, '单元号不是整数时一条 option-count 问题都没有 ⇒ 这一维被静默跳过了').toBeDefined()
    expect(
      hit?.message,
      '报错说的是「规则不覆盖这个单元」⇒ 把作者引到了错的地方（该改的是 unitNumber）',
    ).not.toContain('不覆盖')
    expect(hit?.message, '报错没有指向「不是整数」这个真正的原因').toContain('不是整数')
  })
})

describe('T6.6 —— 近邻阈值的那条反向自测（阈值真的在起作用，且上界被数据卡住）', () => {
  it('把阈值临时改成 3 ⇒ 关键词卡那张（ball ~ book）必须被报出来', () => {
    // ⚠️ **光有「现有内容不报错」那条断言是不够的** ——
    //   那条在阈值被放宽到 99 时照样绿 ⇒ 它证明不了阈值在起作用。
    //   这条从另一头证明：阈值一旦真的动到 3，**确定会**报出一对。
    //   报出来的那一对是关键词卡的 `ball` ~ `book`（归一化后编辑距离 = 3）。
    const problems = optionNearDuplicateProblems(realUnit, 3)

    const hit = problems.find((p) => p.entryId === 'u1-s-i-have-a-ball-for-my-dog')
    expect(
      hit,
      '阈值改成 3 之后关键词卡没有被报出来 ⇒ 阈值根本没在起作用（' +
        `实际报出 ${problems.length} 条：${problems.map((p) => p.entryId).join('/')}）`,
    ).toBeDefined()
    expect(hit?.message, '报错里没有那两个选项 ⇒ 定位不到是哪一对').toContain('ball')
    expect(hit?.message, '报错里没有那两个选项 ⇒ 定位不到是哪一对').toContain('book')
  })

  it('阈值 = 2（当期值）⇒ 那对合格干扰项**不**被报（阈值 ≤ 2 的上界是被数据卡住的）', () => {
    // ⚠️ 这是「上界被数据卡住」那一半：`ball` ~ `book` 语义上完全可分
    //   （球 vs 书），阈值取 3 就会把一个**合格**的干扰项判坏 ⇒ 阈值必须 ≤ 2。
    const problems = optionNearDuplicateProblems(realUnit, NEAR_DUPLICATE_MAX_DISTANCE)

    expect(
      problems.filter((p) => p.entryId === 'u1-s-i-have-a-ball-for-my-dog'),
      '阈值 2 下把 `ball` ~ `book` 判坏了 —— 球与书对孩子完全可分，' +
        '把它们判成近邻会让内容作者删掉一个正确的干扰项',
    ).toEqual([])
  })

  it('反向自测：阈值真的接进了计算（阈值 99 报出的条数多于阈值 2）', () => {
    // ⚠️ 这条从**第三头**证明：判据确实读阈值。
    //   阈值 99 = 「99 个字以内都算近邻」⇒ 几乎每一对都该被报出来；
    //   阈值 2 = 只有差一两个字的才算。
    //   ⇒ 两条的条数必须不同；相同就说明阈值根本没接进计算（恒定阈值）。
    const loose = optionNearDuplicateProblems(realUnit, 99).length
    const tight = optionNearDuplicateProblems(realUnit, NEAR_DUPLICATE_MAX_DISTANCE).length

    expect(
      loose,
      '阈值 99 与阈值 2 报出的条数相同 ⇒ 阈值没有接进计算（判据里那个参数是摆设）',
    ).toBeGreaterThan(tight)
  })
})

// ── G284 —— 逐单元配比统计的输出（DF-118 的恢复条件）────────────────────────

describe('G284 —— `validate:content` 逐单元打印卡型配比与逐族余量（DF-118）', () => {
  /**
   * **判据本体**是 `unitDistributionOf()`（脚本里导出的纯函数）——
   * 正向用例与反向自测**都调它**。
   *
   * ⚠️ **为什么必须是函数而不是循环体**：反向自测要能「喂一份**假**的卡型计数进去，
   *   断言算出来的逐族误差跟着变」—— 若判据只活在循环体里，反向自测够不着它
   *   （只能另写一份手写比较，于是判据被改坏时反向自测照样绿）。
   */
  it('真实内容跑出来的逐单元统计与内容一致（从内容现算，不写死数字）', () => {
    const units = loadUnitFiles(join(root, 'src/content/units')).map((u) => u.raw)
    const { stats } = validateContent(units, greenDeps())

    expect(stats.unitDistributions.length, '逐单元统计一条都没有 ⇒ 统计没跑').toBe(units.length)
    for (const unit of stats.unitDistributions) {
      const raw = units.find(
        (candidate) => (candidate as { unitNumber: number }).unitNumber === unit.unitNumber,
      ) as { entries: { card: { kind: string } }[] }
      const counted = raw.entries.reduce<Record<string, number>>((acc, entry) => {
        acc[entry.card.kind] = (acc[entry.card.kind] ?? 0) + 1
        return acc
      }, {})

      expect(unit.entryCount, `单元 ${unit.unitNumber} 的 N 与内容里的词条数不符`).toBe(
        raw.entries.length,
      )
      expect(unit.kindCounts.word, `单元 ${unit.unitNumber} 的单词卡数与内容不符`).toBe(
        counted['word'] ?? 0,
      )
      expect(unit.kindCounts.keyword).toBe(counted['keyword'] ?? 0)
      expect(unit.kindCounts.response).toBe(counted['response'] ?? 0)
    }
  })

  it('⚠️ 反向自测：判据本体对**假**的卡型计数必须算出对应误差（不是写死的）', () => {
    // ⚠️ R-51：判据必须真能算出「随输入变」的结果。
    //   若它把误差写死成当前内容的数值，这条自测就会红 ⇒ 假绿被当场抓住。
    const synthetic = unitDistributionOf(3, { word: 10, keyword: 1, response: 1 })
    expect(synthetic, '规则覆盖的单元 3 却返回 null ⇒ 判据没跑').not.toBeNull()

    const n = 12
    expect(synthetic!.entryCount).toBe(n)
    expect(synthetic!.familyErrors.word).toBeCloseTo(
      Math.abs(10 - synthetic!.targetShares.word * n),
      10,
    )
    expect(synthetic!.familyErrors.keyword).toBeCloseTo(
      Math.abs(1 - synthetic!.targetShares.keyword * n),
      10,
    )
    expect(synthetic!.familyErrors.response).toBeCloseTo(
      Math.abs(1 - synthetic!.targetShares.response * n),
      10,
    )
  })

  it('⚠️ 反向自测：换一个卡型配比 ⇒ 误差必须跟着变（证明它读的是输入）', () => {
    const a = unitDistributionOf(2, { word: 30, keyword: 1, response: 7 })
    const b = unitDistributionOf(2, { word: 28, keyword: 1, response: 7 })

    expect(a!.familyErrors.word).not.toBe(b!.familyErrors.word)
    expect(b!.familyErrors.word, '少了两张单词卡而误差没变 ⇒ 判据没读输入').toBeGreaterThan(
      a!.familyErrors.word,
    )
  })

  it('规则未覆盖的单元号 ⇒ 返回 `null`（不外推、不记一条假问题）', () => {
    expect(
      unitDistributionOf(21, { word: 1, keyword: 1, response: 1 }),
      '单元 21 落在规则覆盖范围外却算出了份额 ⇒ 规则在静默外推',
    ).toBeNull()
  })

  it('CLI 输出里**看得见**逐族误差（DF-118 要的是「录入时就看得见余量」）', () => {
    // ⚠️ 依赖必须是**全绿**那份 —— 校验失败时 `main()` 走的是「列出问题并退 1」那条路，
    //   成功后的统计行**根本不会打印**（那正是这条测试要盯的那几行）。
    const deps = greenDeps()
    const lines: string[] = []
    const logSpy = vi.spyOn(console, 'log').mockImplementation((msg?: unknown) => {
      lines.push(String(msg))
    })
    try {
      main([], {
        load: () => [{ file: 'unit-01.json', raw: realUnit }],
        wordImageRoot: deps.wordImageRoot,
        assetRoot: deps.assetRoot,
        fileExists: deps.fileExists,
        readFile: deps.readFile,
        listFiles: deps.listFiles,
      })
    } finally {
      logSpy.mockRestore()
    }

    expect(
      lines.some((line) => line.includes('逐族误差')),
      'CLI 输出里没有「逐族误差」这一行 ⇒ DF-118 的恢复条件没达成（录入时看不见余量）',
    ).toBe(true)
  })
})

// ── G288 —— 「规则未覆盖」的单元必须被**点名**（不许悄悄消失）───────────────

/**
 * **G288 守的是什么** —— `validate:content` 的逐单元配比统计**跳过**了
 * 规则未覆盖的单元号（`targetCardDistribution` 不外推）⇒
 * 那些单元**不在**输出里 ⇒ 光看输出会以为「每个单元都查过了」。
 *
 * ⚠️ **为什么这条不是吹毛求疵**：`[CR]` 2026-10-23 实测发现，
 *   脚本里那句注释逐字写着「**并让输出里明说「规则未覆盖」**」，
 *   而**实现里没有任何地方打印它** ⇒ 注释承诺的与代码做的**分家**了。
 *   这正是本仓反复吃过的「输出看起来没事，其实有一项没被检查」。
 */
describe('G288 —— 规则未覆盖的单元在输出里被逐个点名', () => {
  /**
   * 一份**落在规则覆盖范围外**的单元（单元 21）——
   * ⚠️ **必须整体改写 id**（`entryId` / `wordId` / 选项 `id` / `imageSrc`），
   *   否则 schema 的 superRefine 会因「选项指向别的单元的词条」而失败
   *   ⇒ `safeParse` 不通过 ⇒ 那个单元**在统计之前就被 continue 掉了**，
   *   根本走不到 `unitDistributionOf` ⇒ 本守卫会变成恒绿。
   */
  function unitOutsideRule(): RawUnit {
    const unit = unitCopy() as RawUnit
    unit.unitNumber = 21
    const rename = (id: string): string => `u21-${id.slice(id.indexOf('-') + 1)}`
    for (const entry of unit.entries) {
      entry.entryId = rename(entry.entryId)
      entry.wordId = entry.entryId
      for (const option of entry.card.options) {
        option.id = rename(option.id)
        if (option.imageSrc !== undefined) {
          option.imageSrc = expectedImageUrl(21, option.id)
        }
      }
    }
    return unit
  }

  it('统计里被跳过的单元号被记下来（不是一个被吞掉的空缺）', () => {
    const outside = unitOutsideRule()
    // ⚠️ **词图要放在单元 21 自己的目录里** —— `greenDeps` 把图放在 `unit-01`，
    //   而单元 21 的图按规范路径查的是 `unit-21` ⇒ 不改的话这份夹具会**顺带**
    //   报一堆「词图缺失」，让「单元 21 只因规则越界而被跳过」这件事被噪音盖住。
    const deps = greenAssetDeps(
      fakeImages(allReferencedImages(outside).map((name) => `/fake/words/unit-21/${name}`)),
    )
    const { stats } = validateContent([realUnit, outside], deps)

    expect(
      stats.unitsWithoutRule,
      '规则未覆盖的单元 21 没有被记进 unitsWithoutRule ⇒ 它从统计里彻底消失了',
    ).toContain(21)
    expect(
      stats.unitDistributions.map((unit) => unit.unitNumber),
      '单元 21 不该出现在逐单元统计里（规则不外推）',
    ).not.toContain(21)
  })

  it('打印函数把「规则未覆盖」的单元**逐个点名**', () => {
    // ⚠️ **为什么直接测打印函数而不是 CLI**：`main()` 只在 `result.ok` 时才打印统计，
    //   而一个越界单元**自己就让校验不通过**（选项数规则也不覆盖它）
    //   ⇒ 「打印成功 + 有越界单元」这个组合在真实内容上**永远走不到**
    //   ⇒ 只能直接喂一份统计给打印函数。
    const lines: string[] = []
    printUnitDistributions(
      {
        unitDistributions: [
          {
            unitNumber: 2,
            entryCount: 38,
            kindCounts: { word: 30, keyword: 1, response: 7 },
            targetShares: { word: 0.79, keyword: 0.03, response: 0.18 },
            familyErrors: { word: 0.089, keyword: 0.373, response: 0.462 },
          },
        ],
        unitsWithoutRule: [21],
      },
      (line) => lines.push(line),
    )

    expect(
      lines.some((line) => line.includes('规则未覆盖')),
      '打印函数没有输出「规则未覆盖」这一行 ⇒ 被跳过的单元从输出里消失了（没人知道它没被查）',
    ).toBe(true)
    expect(
      lines.some((line) => line.includes('单元 21')),
      '「规则未覆盖」那一行没有点名是哪个单元 ⇒ 读的人不知道该去查什么',
    ).toBe(true)
    expect(
      lines.some((line) => line.includes('逐族误差')),
      '打印函数没有输出逐族误差那一行 ⇒ DF-118 的恢复条件没达成',
    ).toBe(true)
  })
})

// ── G300：单元文件名 ↔ JSON 里 `unitNumber` 的交叉核对（DF-196）────────────

describe('G300 —— 单元文件名 ↔ `unitNumber` 必须一致（DF-196）', () => {
  it('G300.1 真实单元文件逐个自洽（文件名指向的单元号 == JSON 里的 unitNumber）', () => {
    const files = loadUnitFiles()
    expect(files.length, '一个单元文件都没读到 ⇒ 这条判据会真空成立').toBeGreaterThan(0)

    const problems = unitFileNameProblems(files)
    expect(
      problems.map((p) => p.message),
      `真实单元文件与自身的 unitNumber 不一致：\n${problems.map((p) => p.message).join('\n')}`,
    ).toEqual([])
  })

  it('G300.2 文件名与 unitNumber 不一致 ⇒ 报出来，且 CLI 退出码非 0', () => {
    // ⚠️ 夹具刻意**只**坏这一处：内容本身是单元 1 的合法内容（`unitNumber: 1`），
    //   只是文件名写着 `unit-05.json` ⇒ 除这条交叉核对外**没有任何别的判据会红**
    //   —— 这正是 DF-196 说的那个洞（「一处都不会红」）。
    const raw = { ...realUnit, unitNumber: 1 }
    const problems = unitFileNameProblems([{ file: 'unit-05.json', raw }])

    expect(
      problems.length,
      '文件名 `unit-05.json` 与 JSON 里的 unitNumber 1 不一致，却一条都没报 —— 判据没生效',
    ).toBe(1)
    expect(
      problems[0]?.message,
      '报错消息没有同时点名文件名与两个单元号 ⇒ 读的人不知道该改哪一处',
    ).toContain('unit-05.json')
    expect(problems[0]?.message).toContain('5')
    expect(problems[0]?.message).toContain('1')

    // CLI 那一层也要真的非 0 —— 判据跑了但没接进退出码，等于没跑。
    const lines: string[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((msg?: unknown) => {
      lines.push(String(msg))
    })
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    let exitCode: number
    try {
      exitCode = main([], {
        load: () => [{ file: 'unit-05.json', raw }],
        wordImageRoot: '/fake/words',
        assetRoot: '/fake/assets',
        fileExists: () => true,
        readFile: () => null,
        listFiles: () => [],
      })
    } finally {
      spy.mockRestore()
      logSpy.mockRestore()
    }
    expect(exitCode, '文件名与 unitNumber 不一致却退出 0 ⇒ 这条判据没接进 CLI').toBe(1)
    expect(
      lines.some((line) => line.includes('unit-05.json')),
      '报错输出里没有文件名 ⇒ 读的人定位不到是哪个文件',
    ).toBe(true)
  })

  it('G300.3 反向自测：一致时零命中，不一致时必须命中（判据本体真的被调用）', () => {
    const raw = { ...realUnit, unitNumber: 1 }
    const clean = unitFileNameProblems([{ file: 'unit-01.json', raw }])
    expect(
      clean,
      '构造失效：文件名与 unitNumber 一致却被判成有问题 ⇒ 判据要么恒红要么恒绿',
    ).toEqual([])

    const broken = unitFileNameProblems([{ file: 'unit-02.json', raw }])
    expect(
      broken.length,
      '构造失效：把文件名改成 unit-02.json 却没被判出来 —— 判据没在比对文件名',
    ).toBe(1)

    // 顺带把「文件名形态不对」这一支也钉住 —— `unit-1.json`（没有补零）同样该报。
    expect(
      unitNumberFromFileName('unit-01.json'),
      '构造失效：`unit-01.json` 竟取不到单元号',
    ).toBe(1)
    expect(unitNumberFromFileName('unit-1.json'), '补零与否不该影响解析').toBe(1)
    expect(
      unitFileNameProblems([{ file: 'unit-1.json', raw }]).length,
      '构造失效：文件名形态不对（没有补零）却没报出来',
    ).toBe(1)
  })
})
