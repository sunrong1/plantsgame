/**
 * 内容 schema 的守卫测试（Story 1.6 / AC-1 ~ AC-9）。
 *
 * ── 守什么 ────────────────────────────────────────────────────────────────
 * 逐条覆盖 story 的 AC 组 1：唯一正确项（FR16）、卡面文本非空、卡型与选项形态、
 * 选项不跨单元、塔型白名单、`entryId` 形态与唯一性、以及内容层与 core 类型的对齐。
 *
 * ── 为什么这么写 ──────────────────────────────────────────────────────────
 * · **每个负例都从「一条正例」改一处**。改两处的负例无法回答「是哪条断言在守」，
 *   而 AC-3/AC-5 这类约束最容易在重构中被无声地放宽。
 * · **断言读 schema 的报错信息**而不是只看 success=false：校验器存在的意义是
 *   把「哪儿错了」指给录入者看，只断言 false 的话，报错信息写错了也没人知道。
 * · **不写死词条**：本文件不 import `unit-01.json`（真实内容由 unit-01.test.ts 守），
 *   改内容不该让本文件变红 —— 那是另一条轴的失败（同 synthetic-deck 的理由）。
 */

import { describe, expect, it } from 'vitest'
import {
  CardSchema,
  ENTRY_ID_PATTERN,
  EntrySchema,
  ImageOptionSchema,
  OptionSchema,
  TextOptionSchema,
  TowerBindingSchema,
  UnitSchema,
  type Card,
  type DeckEntry,
  type ImageOption,
  type Option,
  type TextOption,
  type TowerType,
  type Unit,
} from '../../src/content/schema'
import { TOWER_TYPES } from '../../src/core/balance'
import type {
  Card as CoreCard,
  DeckEntry as CoreDeckEntry,
  ImageOption as CoreImageOption,
  Option as CoreOption,
  TextOption as CoreTextOption,
  TowerType as CoreTowerType,
} from '../../src/core/types'

// ── 构造器（测试侧的正例骨架）──────────────────────────────────────────────

/** 一张合法的单词卡：4 个图片选项，恰一个正确。 */
function wordCard(overrides: Partial<{ options: unknown[] }> = {}): unknown {
  return {
    kind: 'word',
    promptText: 'dog',
    options: overrides.options ?? [
      { id: 'u1-dog', imageSrc: '/assets/words/unit-01/u1-dog.svg', correct: true },
      { id: 'u1-cat', imageSrc: '/assets/words/unit-01/u1-cat.svg', correct: false },
      { id: 'u1-bird', imageSrc: '/assets/words/unit-01/u1-bird.svg', correct: false },
      { id: 'u1-fish', imageSrc: '/assets/words/unit-01/u1-fish.svg', correct: false },
    ],
  }
}

/** 一张合法的回应卡：4 个文字选项，恰一个正确。 */
function responseCard(overrides: Partial<{ options: unknown[]; promptText: string }> = {}): unknown {
  return {
    kind: 'response',
    promptText: overrides.promptText ?? 'How are you?',
    options: overrides.options ?? [
      { id: 'u1-s-i-am-fine', text: 'I am fine, thank you.', correct: true },
      { id: 'u1-s-good-morning', text: 'Good morning!', correct: false },
      { id: 'u1-s-good-afternoon', text: 'Good afternoon!', correct: false },
      { id: 'u1-s-thank-you', text: 'Thank you!', correct: false },
    ],
  }
}

/** 一条合法的词条。 */
function entry(overrides: Record<string, unknown> = {}): unknown {
  return { entryId: 'u1-dog', wordId: 'u1-dog', towerType: 'direct', card: wordCard(), ...overrides }
}

/** 报错信息全文。断言「说了什么」而不是「有没有报错」。 */
function messages(result: { success: boolean; error?: { issues: readonly { message: string }[] } }): string {
  return (result.error?.issues ?? []).map((issue) => issue.message).join(' | ')
}

// ── AC-3：唯一正确项（FR16）────────────────────────────────────────────────

describe('AC-3 —— 唯一正确项（FR16）', () => {
  it('恰有 1 个正确项时通过', () => {
    expect(
      CardSchema.safeParse(wordCard()).success,
      '正例被拒 ⇒ 「恰有 1 个」这条约束本身写错了，后续负例全部失去意义',
    ).toBe(true)
  })

  it('0 个正确项被拒，且报「本题没有正确项」', () => {
    const options = [
      { id: 'u1-dog', imageSrc: '/a.svg', correct: false },
      { id: 'u1-cat', imageSrc: '/b.svg', correct: false },
    ]
    const result = CardSchema.safeParse(wordCard({ options }))

    expect(result.success, '没有正确项的卡被放行 ⇒ 孩子点任何选项都会被判错').toBe(false)
    expect(messages(result)).toContain('本题没有正确项')
  })

  it('2 个正确项被拒，且报「本题有多个正确项」（M1/M2 的守卫）', () => {
    const options = [
      { id: 'u1-dog', imageSrc: '/a.svg', correct: true },
      { id: 'u1-cat', imageSrc: '/b.svg', correct: true },
    ]
    const result = CardSchema.safeParse(wordCard({ options }))

    expect(
      result.success,
      '多个正确项被放行 ⇒ isCorrect() 只认第一个，另一个成为永远答不对的死选项',
    ).toBe(false)
    expect(messages(result)).toContain('本题有多个正确项')
  })
})

// ── AC-4：卡面 TTS 文本不得为空 ────────────────────────────────────────────

describe('AC-4 —— 卡面 TTS 文本不得为空', () => {
  it('空串被拒', () => {
    const card = { ...(wordCard() as object), promptText: '' }
    const result = CardSchema.safeParse(card)

    expect(result.success, '空题面被放行 ⇒ 运行时「听不到声音」且无任何报错').toBe(false)
    expect(messages(result)).toContain('卡面 TTS 文本不得为空')
  })

  it('纯空白串同样被拒（M5 的守卫：只查 .length 的话这里会漏）', () => {
    const card = { ...(wordCard() as object), promptText: '   \t ' }
    const result = CardSchema.safeParse(card)

    expect(result.success, '纯空白题面被放行 ⇒ 空白串 length > 0，绕过只看长度的校验').toBe(false)
    expect(messages(result)).toContain('卡面 TTS 文本不得为空')
  })

  it('报错定位到 promptText 字段', () => {
    const result = CardSchema.safeParse({ ...(wordCard() as object), promptText: '' })
    const path = result.error?.issues.find((i) => i.message.includes('卡面 TTS 文本不得为空'))?.path

    expect(path, '报错没指向 promptText ⇒ 录入者不知道要改哪个字段').toEqual(['promptText'])
  })
})

// ── AC-5：卡型与选项形态相符 ───────────────────────────────────────────────

describe('AC-5 —— 卡型与选项形态相符（deferred-work 移交项）', () => {
  it('单词卡配文字选项被拒（M3 的守卫）', () => {
    const options = [
      { id: 'u1-dog', text: 'dog', correct: true },
      { id: 'u1-cat', text: 'cat', correct: false },
    ]
    const result = CardSchema.safeParse(wordCard({ options }))

    expect(
      result.success,
      '单词卡配文字选项被放行 ⇒ 渲染层会画出图片卡里的文字按钮（core 拦不住，见 deferred-work）',
    ).toBe(false)
    expect(messages(result)).toContain('卡型 word 的选项必须是图片选项')
  })

  it('单词卡里混进一个文字选项也被拒（不是「全对全错」而是逐个选项判）', () => {
    const options = [
      { id: 'u1-dog', imageSrc: '/a.svg', correct: true },
      { id: 'u1-cat', imageSrc: '/b.svg', correct: false },
      { id: 'u1-bird', text: 'bird', correct: false },
      { id: 'u1-fish', imageSrc: '/d.svg', correct: false },
    ]
    const result = CardSchema.safeParse(wordCard({ options }))

    expect(result.success, '只有第 3 个选项形态不对就被放行 ⇒ 只判首项的实现能过').toBe(false)
    expect(messages(result)).toContain('u1-bird')
  })

  it('关键词卡配图片选项被拒', () => {
    const options = [
      { id: 'u1-ball', imageSrc: '/a.svg', correct: true },
      { id: 'u1-pen', text: 'pen', correct: false },
    ]
    const result = CardSchema.safeParse({ kind: 'keyword', promptText: 'I have a ball.', options })

    expect(result.success, '关键词卡配图片选项被放行 ⇒ 孩子选到的是一张图而不是单词').toBe(false)
    expect(messages(result)).toContain('卡型 keyword 的选项必须是文字选项')
  })

  it('回应卡配图片选项被拒', () => {
    const options = [
      { id: 'u1-s-i-am-fine', text: 'I am fine, thank you.', correct: true },
      { id: 'u1-dog', imageSrc: '/a.svg', correct: false },
    ]
    const result = CardSchema.safeParse(responseCard({ options }))

    expect(result.success, '回应卡配图片选项被放行 ⇒ 应答题里出现图片按钮').toBe(false)
    expect(messages(result)).toContain('卡型 response 的选项必须是文字选项')
  })

  it('报错能定位到具体选项下标与选项 id', () => {
    const options = [
      { id: 'u1-dog', imageSrc: '/a.svg', correct: true },
      { id: 'u1-cat', text: 'cat', correct: false },
    ]
    const result = CardSchema.safeParse(wordCard({ options }))
    const issue = result.error?.issues.find((i) => i.message.includes('文字选项'))

    expect(issue?.path, '报错没指向出错的选项下标').toEqual(['options', 1])
    expect(issue?.message).toContain('u1-cat')
  })

  it('同一张卡内选项 id 重复被拒（超出 AC 的额外闸门，见 schema 注释）', () => {
    const options = [
      { id: 'u1-dog', imageSrc: '/a.svg', correct: true },
      { id: 'u1-dog', imageSrc: '/a.svg', correct: false },
    ]
    const result = CardSchema.safeParse(wordCard({ options }))

    expect(result.success, '同 id 选项放行 ⇒ isCorrect() 只命中第一个，界面上两个按钮无法区分').toBe(
      false,
    )
    expect(messages(result)).toContain('选项 id 重复')
  })
})

// ── AC-6：选项不得混入其他单元的词条 ───────────────────────────────────────

describe('AC-6 —— 选项不得混入其他单元的词条', () => {
  it('单元 1 的卡引用 u2- 开头的选项被拒（M4 的守卫）', () => {
    const unit = {
      unitNumber: 1,
      entries: [entry({ card: responseCard({ options: [
        { id: 'u2-dog', text: 'dog', correct: true },
        { id: 'u1-s-good-morning', text: 'Good morning!', correct: false },
        { id: 'u1-s-thank-you', text: 'Thank you!', correct: false },
      ] }) })],
    }
    const result = UnitSchema.safeParse(unit)

    expect(
      result.success,
      '跨单元选项放行 ⇒ 单元 1 的题面里出现单元 2 的词条，画面与内容脱节',
    ).toBe(false)
    expect(messages(result)).toContain('u2-dog')
    expect(messages(result)).toContain('u1-')
  })

  it('报错定位到具体条目下标与选项下标', () => {
    const unit = {
      unitNumber: 1,
      entries: [entry({ card: responseCard({ options: [
        { id: 'u2-dog', text: 'dog', correct: true },
        { id: 'u1-s-good-morning', text: 'Good morning!', correct: false },
      ] }) })],
    }
    const issue = UnitSchema.safeParse(unit).error?.issues.find((i) =>
      i.message.includes('不属于单元 1'),
    )

    expect(issue?.path).toEqual(['entries', 0, 'card', 'options', 0])
  })

  it('完全不带单元前缀的选项也被拒（判据是前缀比对，不是「看起来像」）', () => {
    const unit = {
      unitNumber: 1,
      entries: [entry({ card: responseCard({ options: [
        { id: 'dog', text: 'dog', correct: true },
        { id: 'u1-s-good-morning', text: 'Good morning!', correct: false },
      ] }) })],
    }
    const result = UnitSchema.safeParse(unit)

    expect(result.success, '无前缀选项放行 ⇒ AC-8 的形态约束被绕开，录音文件名对不上').toBe(false)
  })
})

describe('选项必须指向本单元真实存在的词条（超出 AC 的额外闸门）', () => {
  it('指向本单元不存在的词条被拒', () => {
    const unit = {
      unitNumber: 1,
      entries: [entry({ card: responseCard({ options: [
        { id: 'u1-cat-dog', text: 'cat', correct: true },
        { id: 'u1-s-good-morning', text: 'Good morning!', correct: false },
      ] }) })],
    }
    const result = UnitSchema.safeParse(unit)

    expect(result.success, '悬空选项放行 ⇒ 前缀对但词条不存在，塔的显示名与词图来源落空').toBe(false)
    expect(messages(result)).toContain('没有对应的词条')
  })

  it('真实存在的词条可以作选项（正向对照，防这条规则写反）', () => {
    const unit = {
      unitNumber: 1,
      entries: [
        entry(),
        entry({ entryId: 'u1-cat', wordId: 'u1-cat', card: wordCard() }),
        entry({ entryId: 'u1-bird', wordId: 'u1-bird', card: wordCard() }),
        entry({ entryId: 'u1-fish', wordId: 'u1-fish', card: wordCard() }),
        entry({ entryId: 'u1-s-good-morning', wordId: 'u1-s-good-morning', card: responseCard() }),
        entry({ entryId: 'u1-s-i-am-fine', wordId: 'u1-s-i-am-fine', card: responseCard() }),
        entry({ entryId: 'u1-s-good-afternoon', wordId: 'u1-s-good-afternoon', card: responseCard() }),
        entry({ entryId: 'u1-s-thank-you', wordId: 'u1-s-thank-you', card: responseCard() }),
      ],
    }
    const result = UnitSchema.safeParse(unit)

    expect(result.success, '选项指向真实词条却被拒 ⇒ 这条规则写错了，内容无法录入').toBe(true)
  })
})

// ── AC-7：塔型白名单 ───────────────────────────────────────────────────────

describe('AC-7 —— 塔绑定指向不存在的塔型', () => {
  it('每一种合法塔型都通过（从 core 的 TOWER_TYPES 取，不写死）', () => {
    // ⚠️ [CR] 2026-10-14：这条断言的**标题**原先写着「由 TOWER_TYPES 断言，不写死」，
    //   循环里却是字面量 `['direct', 'slow', 'aoe']`。core 加了第四种塔型时，
    //   这条测试仍然只验三种、照样全绿 —— 标题承诺的那件事一件也没做。
    //   现在真的从 core 取。（`content-boundary.test.ts` 守的是两侧**集合相等**，
    //   那条覆盖的是同一个风险；这里要守的是「每一种都能通过校验」，
    //   即便集合比较将来被放宽，这条也仍然有效。）
    expect(TOWER_TYPES.length, 'core 侧没有塔型了 ⇒ 下面这个循环恒空').toBeGreaterThan(0)

    for (const towerType of TOWER_TYPES) {
      const result = TowerBindingSchema.safeParse({ wordId: 'u1-dog', towerType })
      expect(result.success, `合法塔型 ${towerType} 被拒 ⇒ 白名单与 core 的 TOWER_TYPES 不一致`).toBe(
        true,
      )
    }
  })

  it('非法塔型被拒，且报出收到的值（M7 的守卫）', () => {
    const result = TowerBindingSchema.safeParse({ wordId: 'u1-dog', towerType: 'laser' })

    expect(result.success, '非法塔型放行 ⇒ 战斗层查 TOWER_STATS 时静默 undefined').toBe(false)
    expect(JSON.stringify(result.error?.issues)).toContain('laser')
  })

  it('词条里的塔型同样受约束（不只 TowerBindingSchema）', () => {
    const result = EntrySchema.safeParse(entry({ towerType: 'cannon' }))

    expect(result.success, 'EntrySchema 没收窄 towerType ⇒ 从 JSON 录入的脏塔型能溜过去').toBe(false)
  })
})

// ── AC-8：entryId 形态与唯一性 ─────────────────────────────────────────────

describe('AC-8 —— entryId 形态与全局唯一', () => {
  it('两种正例形态都通过', () => {
    expect(ENTRY_ID_PATTERN.test('u1-dog'), '单词形态的 id 被拒 ⇒ 正例本身不合法').toBe(true)
    expect(ENTRY_ID_PATTERN.test('u1-s-how-are-you'), '句子形态的 id 被拒').toBe(true)
  })

  it('尾部连字符被拒（M6 的守卫）', () => {
    const result = EntrySchema.safeParse(entry({ entryId: 'u1-dog-' }))

    expect(
      result.success,
      '尾部连字符放行 ⇒ 期望的词图路径 u1-dog-.svg 与实际文件名对不上（AC-11 第 1 类）',
    ).toBe(false)
  })

  it('大写字母被拒（录音文件名大小写在多数文件系统上敏感，Android 尤其）', () => {
    expect(EntrySchema.safeParse(entry({ entryId: 'u1-Dog' })).success).toBe(false)
  })

  it('连续连字符被拒', () => {
    expect(EntrySchema.safeParse(entry({ entryId: 'u1-s--dog' })).success).toBe(false)
  })

  it('缺单元前缀被拒', () => {
    expect(EntrySchema.safeParse(entry({ entryId: 'dog' })).success).toBe(false)
  })

  it('单元内 entryId 重复被拒（M10 的守卫），且报出重复的两条下标', () => {
    const unit = { unitNumber: 1, entries: [entry(), entry({ wordId: 'u1-cat' })] }
    const result = UnitSchema.safeParse(unit)

    expect(result.success, '重复 entryId 放行 ⇒ 题单里两道题共用一个录音文件名').toBe(false)
    expect(messages(result)).toContain('词条 id 重复')
    expect(result.error?.issues.some((i) => i.path.join('.') === 'entries.1')).toBe(true)
  })
})

// ── AC-9：内容层导出的类型与 core 对齐 ────────────────────────────────────

describe('AC-9 —— 内容层类型与 core 类型对齐', () => {
  // 下面这些赋值是**编译期断言**：类型对不上时 `npm run typecheck` 直接报 TS2322。
  // 它们证明 AC-9 的「不经过任何手写转换函数」——中间插一个转换函数的话，
  // 这几行的类型就会不匹配，review 一眼看得见。
  //
  // ⚠️ [CR] 2026-10-14：它们原先全都写成 `wordCard() as Card` / `{...} as Option`，
  //   而 **`as` 是向下转型，它把左侧整个关在类型系统之外**：
  //   `wordCard()` 返回 `unknown`（构造器刻意宽松，好注入非法值），
  //   `unknown as Card` 无论 `Card` 变成什么形状都编译得过；
  //   就算 `Card` 整个退化成 `any`，下一行 `const coreCard: CoreCard = contentCard`
  //   也照样通过（`any` 可赋给任何类型）。也就是说这条「编译期断言」
  //   **恰好在最需要它的场景 —— 类型被改坏时 —— 完全失灵**。
  //
  //   现在改成从 **schema 的输出**取类型（`CardSchema.parse(...)` 的返回类型就是
  //   `z.infer<typeof CardSchema>`，即 `Card`）：全程不用 `as`，
  //   任何一侧漂移都会在 typecheck 阶段炸出来。
  const contentCard: Card = CardSchema.parse(wordCard())
  const coreCard: CoreCard = contentCard
  const contentOption: Option = OptionSchema.parse({ id: 'u1-dog', text: 'dog', correct: true })
  const coreOption: CoreOption = contentOption
  const contentImage: ImageOption = ImageOptionSchema.parse({
    id: 'u1-dog',
    imageSrc: '/assets/words/unit-01/u1-dog.svg',
    correct: true,
  })
  const coreImage: CoreImageOption = contentImage
  const contentText: TextOption = TextOptionSchema.parse({
    id: 'u1-dog',
    text: 'dog',
    correct: true,
  })
  const coreText: CoreTextOption = contentText
  const contentTower: TowerType = 'direct'
  const coreTower: CoreTowerType = contentTower
  const contentDeck: DeckEntry = EntrySchema.parse(entry())
  const coreDeck: CoreDeckEntry = contentDeck

  it('六个类型名双向可赋值（Card / Option / ImageOption / TextOption / DeckEntry / TowerType）', () => {
    expect(
      [
        coreCard.kind,
        coreOption.correct,
        coreImage.imageSrc,
        coreText.text,
        coreTower,
        coreDeck.entryId,
      ],
      '内容层类型与 core 类型的对齐靠这一组编译期赋值；此处断言它们的运行期值确实取自内容层',
    ).toEqual(['word', true, '/assets/words/unit-01/u1-dog.svg', 'dog', 'direct', 'u1-dog'])
  })

  it('反向：core 造出的 DeckEntry 能过内容 schema（字段层双向兼容）', () => {
    // ⚠️ 这里**故意不用** `const fromCore: DeckEntry = coreDeck` 这句 TS 赋值：
    //   core 的 `readonly options: readonly Option[]`（core/types.ts:233）不能赋给
    //   `z.infer` 对 `z.array()` 推导出的可变数组 —— 那是**可变性**的差，不是形状的差。
    //   真正要守的是「core 的值能过内容 schema」：字段名/类型对不上时 safeParse 会立刻失败，
    //   而可变性差异根本不是内容层该管的事。
    const parsed = EntrySchema.safeParse(coreDeck)

    expect(parsed.success, 'core 造出的 DeckEntry 过不了内容 schema ⇒ 两侧形状其实不一致').toBe(true)
  })

  it('UnitSchema 的解析结果可直接当题单用（createInitialState 吃的就是这个形状）', () => {
    // 单词卡的四个选项各自都是本单元的词条 —— 选项必须指向真实存在的词条
    // （这条额外闸门让「最小可解析单元」至少要有这 4 条）。
    const parsed = UnitSchema.safeParse({
      unitNumber: 1,
      entries: [
        entry(),
        entry({ entryId: 'u1-cat', wordId: 'u1-cat', card: wordCard() }),
        entry({ entryId: 'u1-bird', wordId: 'u1-bird', card: wordCard() }),
        entry({ entryId: 'u1-fish', wordId: 'u1-fish', card: wordCard() }),
      ],
    })
    const unit: Unit | undefined = parsed.success ? parsed.data : undefined
    const deck: readonly CoreDeckEntry[] = unit?.entries ?? []

    expect(deck.length, '内容导出的 deck 无法直接喂给 core ⇒ 中间缺了一次手写转换').toBe(4)
  })
})

// ── schema 形状的其余约束 ──────────────────────────────────────────────────

describe('AC-1 / AC-2 —— 四个概念各有导出且形态正确', () => {
  it('OptionSchema 是两态判别（图片有 imageSrc 无 text，文字反之）', () => {
    expect(OptionSchema.safeParse({ id: 'u1-dog', imageSrc: '/a.svg', correct: true }).success).toBe(
      true,
    )
    expect(OptionSchema.safeParse({ id: 'u1-dog', text: 'dog', correct: true }).success).toBe(true)
  })

  it('同时带 imageSrc 与 text 的选项被拒（两态不是「至少有一个」）', () => {
    const result = OptionSchema.safeParse({ id: 'u1-dog', imageSrc: '/a.svg', text: 'dog', correct: true })

    expect(result.success, '两态并存被放行 ⇒ 「卡型与形态相符」那条断言可被绕过').toBe(false)
  })

  it('多余字段被拒（strictObject）', () => {
    const result = EntrySchema.safeParse({ ...(entry() as object), note: '随手加的' })

    expect(
      result.success,
      '多余字段被放行 ⇒ imageSrc 拼成 imageSrcs 之类的打错会静默丢图片',
    ).toBe(false)
  })

  it('Card.kind 只有 word / keyword / response 三个值（AC-2）', () => {
    const imageOptions = [
      { id: 'u1-dog', imageSrc: '/a.svg', correct: true },
      { id: 'u1-cat', imageSrc: '/b.svg', correct: false },
    ]
    const textOptions = [
      { id: 'u1-dog', text: 'dog', correct: true },
      { id: 'u1-cat', text: 'cat', correct: false },
    ]

    expect(CardSchema.safeParse({ kind: 'word', promptText: 'dog', options: imageOptions }).success).toBe(
      true,
    )
    for (const kind of ['keyword', 'response'] as const) {
      expect(
        CardSchema.safeParse({ kind, promptText: 'How are you?', options: textOptions }).success,
        `合法卡型 ${kind} 被拒 ⇒ 卡型枚举写错了`,
      ).toBe(true)
    }
    expect(
      CardSchema.safeParse({ kind: 'phrase', promptText: 'x', options: textOptions }).success,
      '第四种卡型被放行 ⇒ 渲染层没有分支处理它，孩子看到空白卡',
    ).toBe(false)
  })

  it('只有一个选项的卡被拒（那不是选择题，且让「唯一正确项」失去意义）', () => {
    const result = CardSchema.safeParse({
      kind: 'response',
      promptText: 'How are you?',
      options: [{ id: 'u1-s-i-am-fine', text: 'I am fine, thank you.', correct: true }],
    })

    expect(result.success, '单选项卡放行 ⇒ 孩子无需作答，且内容录入的错误没有闸门').toBe(false)
  })
})

// ── [CR] 2026-10-14 三层审查新增：四条约束漏洞 ──────────────────────────────
//
// 下面每条都是先变异坐实「没有守卫」，再补的 schema 约束。
// 违反后果都写在 `expect` 的第二参数里 —— 断言失败时那句话就是给人看的。

describe('[CR] entryId / wordId 的单元前缀归属（AR29）', () => {
  const unitOf = (over: Record<string, unknown>, unitNumber = 1) => ({
    unitNumber,
    entries: [
      {
        entryId: 'u1-dog',
        wordId: 'u1-dog',
        towerType: 'direct',
        card: responseCard(),
        ...over,
      },
    ],
  })

  it('entryId 的前缀与所在单元不符时必须报错', () => {
    const result = UnitSchema.safeParse(unitOf({ entryId: 'u2-cat', wordId: 'u2-cat' }))

    expect(result.success, '前缀错误放行 ⇒ generate-voice 会往扁平 voice/ 目录写出别的单元的录音文件名，Epic 2 加该单元时被静默覆盖').toBe(false)
    expect(messages(result)).toContain('u2-')
  })

  it('entryId 与 wordId 的前缀归属各判一次', () => {
    const mismatchWordId = UnitSchema.safeParse(unitOf({ wordId: 'u2-dog' }))
    expect(mismatchWordId.success, 'wordId 跨单元放行 ⇒ 塔的显示名与词图来源指向别的单元的词').toBe(false)

    const mismatchBoth = UnitSchema.safeParse(unitOf({ entryId: 'u2-cat', wordId: 'u1-cat' }))
    expect(mismatchBoth.success, '只有 entryId 被查、wordId 被放过 ⇒ 换了字段名就绕开').toBe(false)
  })

  it('单元 2 的文件里 u2- 前缀是合法的（别把这条写成「一律不许跨单元」）', () => {
    const result = UnitSchema.safeParse({
      unitNumber: 2,
      entries: [
        {
          entryId: 'u2-dog',
          wordId: 'u2-dog',
          towerType: 'direct',
          card: {
            kind: 'response',
            promptText: 'How are you?',
            options: [
              { id: 'u2-s-i-am-fine', text: 'I am fine, thank you.', correct: true },
              { id: 'u2-s-good-morning', text: 'Good morning!', correct: false },
            ],
          },
        },
        {
          entryId: 'u2-s-i-am-fine',
          wordId: 'u2-s-i-am-fine',
          towerType: 'slow',
          card: {
            kind: 'response',
            promptText: 'How are you?',
            options: [
              { id: 'u2-s-good-morning', text: 'Good morning!', correct: true },
              { id: 'u2-cat', text: 'A cat.', correct: false },
            ],
          },
        },
        {
          entryId: 'u2-s-good-morning',
          wordId: 'u2-s-good-morning',
          towerType: 'aoe',
          card: {
            kind: 'response',
            promptText: 'See you tomorrow.',
            options: [
              { id: 'u2-s-i-am-fine', text: 'I am fine, thank you.', correct: true },
              { id: 'u2-cat', text: 'A cat.', correct: false },
            ],
          },
        },
        {
          entryId: 'u2-cat',
          wordId: 'u2-cat',
          towerType: 'direct',
          card: {
            kind: 'word',
            promptText: 'cat',
            options: [
              { id: 'u2-cat', imageSrc: '/assets/words/unit-02/u2-cat.svg', correct: true },
              { id: 'u2-s-i-am-fine', imageSrc: '/assets/words/unit-02/u2-s-i-am-fine.svg', correct: false },
            ],
          },
        },
      ],
    })
    expect(result.success, `合法前缀被拒：${messages(result)}`).toBe(true)
  })
})

describe('[CR] wordId 不能是任意字符串', () => {
  for (const bad of ['../../etc/passwd', '🙂', 'u9-zebra', 'Dog']) {
    it(`拒绝 ${JSON.stringify(bad)}`, () => {
      const result = UnitSchema.safeParse({
        unitNumber: 1,
        entries: [
          { entryId: 'u1-dog', wordId: bad, towerType: 'direct', card: wordCard() },
        ],
      })
      expect(result.success, `wordId=${bad} 被放行 ⇒ 它一路流到渲染层，成为塔的显示名与词图来源`).toBe(false)
    })
  }
})

describe('[CR] 选项文本不得为纯空白', () => {
  it('纯空白的 text 被拒（min(1) 挡不住它，长度也是 1）', () => {
    const result = CardSchema.safeParse(
      responseCard({
        options: [
          { id: 'u1-s-i-am-fine', text: '   ', correct: true },
          { id: 'u1-s-good-morning', text: 'Good morning!', correct: false },
        ],
      }),
    )
    expect(result.success, '纯空白 text 放行 ⇒ 界面上是一个空按钮，且 validate:content 也不查文字选项').toBe(false)
    expect(messages(result)).toContain('纯空白')
  })

  it('纯空白的 imageSrc 同样被拒', () => {
    const result = CardSchema.safeParse(
      wordCard({
        options: [
          { id: 'u1-dog', imageSrc: '  ', correct: true },
          { id: 'u1-cat', imageSrc: '/assets/words/unit-01/u1-cat.svg', correct: false },
        ],
      }),
    )
    expect(result.success, '纯空白 imageSrc 放行 ⇒ 单词卡渲染出一个没有内容的选项').toBe(false)
  })

  it('前后带空白的正常文本仍合法（只挡全空白，不做 trim 变换）', () => {
    const result = CardSchema.safeParse(
      responseCard({
        options: [
          { id: 'u1-s-i-am-fine', text: ' Good morning! ', correct: true },
          { id: 'u1-s-good-morning', text: 'Good afternoon!', correct: false },
        ],
      }),
    )
    expect(result.success, '非全空白的带空白文本被拒 ⇒ 录入者正常打的空格被当成错误').toBe(true)
  })
})

describe('[CR] 同一张卡里两个选项显示文本相同', () => {
  it('两个都是 "Yes" 的按钮被拒', () => {
    const result = CardSchema.safeParse(
      responseCard({
        options: [
          { id: 'u1-dog', text: 'Yes', correct: true },
          { id: 'u1-cat', text: 'Yes', correct: false },
        ],
      }),
    )
    expect(result.success, '两个无法区分的按钮放行 ⇒ duplicateOptionId 只比 id，挡不住显示文本重复').toBe(false)
    expect(messages(result)).toContain('选项内容重复')
  })

  it('大小写与首尾空白造成的「看起来一样」同样算重复', () => {
    const result = CardSchema.safeParse(
      responseCard({
        options: [
          { id: 'u1-dog', text: 'Yes', correct: true },
          { id: 'u1-cat', text: ' yes ', correct: false },
        ],
      }),
    )
    expect(result.success, '大小写/空白差异没被归一化 ⇒ 界面上仍是两个肉眼相同的按钮').toBe(false)
  })

  it('图片选项按 imageSrc 判重', () => {
    const result = CardSchema.safeParse(
      wordCard({
        options: [
          { id: 'u1-dog', imageSrc: '/assets/words/unit-01/u1-dog.svg', correct: true },
          { id: 'u1-cat', imageSrc: '/assets/words/unit-01/u1-dog.svg', correct: false },
        ],
      }),
    )
    expect(result.success, '两个选项指向同一张图 ⇒ 界面上是两个一模一样的图片按钮').toBe(false)
  })

  it('四个不同文本的正常回应卡仍合法（别把这条写成「不许有重复词」）', () => {
    expect(CardSchema.safeParse(responseCard()).success).toBe(true)
  })
})
