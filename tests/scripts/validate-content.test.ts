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

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it, vi } from 'vitest'

import {
  expectedImageUrl,
  formatProblem,
  loadUnitFiles,
  main,
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

/** 词图的假文件系统：只记「哪些文件存在」。 */
function fakeImages(existing: readonly string[], rootDir = '/fake/words'): ValidateDeps {
  const set = new Set(existing)
  return {
    wordImageRoot: rootDir,
    fileExists: (path) => set.has(path),
    listFiles: (dir) =>
      [...set].filter((p) => p.startsWith(`${dir}/`)).map((p) => p.slice(dir.length + 1)),
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

/** 一套「全绿」的依赖：词图齐全。 */
function greenDeps(unit = realUnit): ValidateDeps {
  return fakeImages(allReferencedImages(unit).map((name) => `/fake/words/unit-01/${name}`))
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
      fileExists: deps.fileExists,
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

  it('跑真实文件系统（不注入）也是绿的 —— 30 张占位词图确实在磁盘上', () => {
    const units = loadUnitFiles(join(root, 'src/content/units'))
    const result = validateContent(units.map((u) => u.raw), {
      wordImageRoot: join(root, 'public/assets/words'),
      fileExists: existsSync,
      listFiles: (dir) => (existsSync(dir) ? readdirSync(dir) : []),
    })

    expect(
      result.problems.map((p) => formatProblem(p)),
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
    const files = loadUnitFiles(join(root, 'src/content/units')).map((u) => u.file)

    expect(files).toEqual(['unit-01.json'])
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
