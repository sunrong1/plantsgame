/**
 * 内容 schema —— 教材内容进入游戏的唯一闸门（Story 1.6 / 架构决策 3）。
 *
 * ── 守什么 ────────────────────────────────────────────────────────────────
 * 1. **FR16「唯一正确项」** —— 每张卡恰有 1 个 `correct: true`。
 * 2. **卡型与选项形态相符** —— 单词卡只配图片选项，关键词卡 / 回应卡只配文字选项。
 *    这条是 `deferred-work.md` 从 `src/core/types.ts:216` 正式移交过来的：
 *    core 把架构模式 B 的三分支并集拍平成 `{kind, options}`，于是
 *    `{kind:'word', options:[{text:'…'}]}` 在 core 里**干净编译**，
 *    而失败要到渲染层才暴露（图片卡渲染出文字选项）。编译期不变量被换成了内容层校验，
 *    那就得由本文件真的把它守回来。
 * 3. **选项不得混入其他单元的词条** —— option id 的 `u<N>-` 前缀必须与所在单元号一致。
 * 4. **`entryId` 形态与唯一性** —— 带单元前缀的 kebab-case（AR29），单元内不重名。
 * 5. **塔型白名单** —— 指向不存在的塔型会让塔的建造分支静默失效。
 *
 * ── 为什么这么写 ──────────────────────────────────────────────────────────
 * · **选项没有 `kind` 判别键**，因此两态用 `z.union` + 形状差异表达，而不是
 *   `z.discriminatedUnion`。core 的 `ImageOption` / `TextOption` 本来就没有
 *   `kind` 字段，加一个只为 schema 服务的字段会让内容 JSON 与 core 类型对不上。
 * · **`strictObject` 而不是默认 object**：多写一个字段就是打错的字，
 *   默认的「静默忽略」会让 `imageSrc` 拼成 `imageSrcs` 的内容文件安静地丢图片。
 * · **zod 4**（本仓装的是 4.6.6，不是网上教程里的 v3）：`.errors` / `.formErrors`
 *   已移除，报错列表在 `error.issues`。
 *
 * ── 期望值来源与出处 ──────────────────────────────────────────────────────
 * · FR16 / 三种卡型 / 短语归入回应卡：`_bmad-output/planning-artifacts/gdds/…/gdd.md:180-194`
 * · 架构模式 B（卡型共用判定）与模式 C（塔词解耦）：`game-architecture.md:856-883`
 * · 架构模式 B 明文把「唯一正确项」定为 Zod 职责：`game-architecture.md:869`
 * · AR29（`entryId` 带单元前缀）：`epics.md:332-337`
 * · 塔型合法值：`src/core/balance.ts` 的 `TOWER_TYPES`（单一事实源，本文件不重定义）
 */

import { z } from 'zod'

/**
 * `entryId` / 选项 id 的合法形态：单元前缀 + kebab-case（AR29）。
 *
 * ⚠️ 单元前缀**不是**排版偏好：录音目录 `public/assets/audio/voice/` **不按单元分层**
 * （架构决策 7），单元 2 也会有 `dog`。不带前缀就撞名，而撞名的后果是
 * 「换了单元却播了另一个单元的录音」—— 界面上完全看不出来。
 */
export const ENTRY_ID_PATTERN = /^u\d+-[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * 内容问题的分类标记。
 *
 * 为什么要机器可读：校验器（`scripts/validate-content.ts`）需要把每条问题**归类**
 * 输出，测试需要断言「注入第 N 类错误时，报出来的是第 N 类」。
 * 若靠匹配报错文案来分类，改一次措辞就静默换了分类 —— 而分类是 AC-11 的验收对象。
 *
 * ⚠️ 只有**自定义** issue 能带 `params`；Zod 内建校验（枚举、类型、strictObject 的
 *   多余字段）不带，校验器那边对这几类有按 path 的兜底分类。
 */
export const PROBLEM_CATEGORY = {
  /** AC-11 第 1 类：词图缺失或命名不符（脚本侧，需要 fs）。 */
  wordImage: 'word-image',
  /** AC-11 第 2 类：塔绑定指向不存在的塔型。 */
  towerType: 'tower-type',
  /** AC-11 第 3 类：选项混入其他单元的词条。 */
  foreignOption: 'foreign-option',
  /** AC-11 第 4 类：卡型与选项形态不符。 */
  kindOptionMismatch: 'kind-option-mismatch',
  /** AC-11 第 5 类：卡面 TTS 文本为空。 */
  emptyPrompt: 'empty-prompt',
  /** AC-3：不是恰有 1 个正确项。 */
  correctCount: 'correct-count',
  /** AC-8：entryId 重复。 */
  duplicateEntryId: 'duplicate-entry-id',
  /** 选项 id 形态非法。 */
  entryIdFormat: 'entry-id-format',
  /** `entryId` 的单元前缀与 `unitNumber` 不符（AR29 前缀未被 enforce 的那个洞）。 */
  entryUnitMismatch: 'entry-unit-mismatch',
  /** 选项的 `text` / `imageSrc` 是纯空白串。 */
  blankOptionField: 'blank-option-field',
  /** 同一张卡内选项 id 重复。 */
  duplicateOptionId: 'duplicate-option-id',
  /** 同一张卡内两个选项的显示文本重复 —— 界面上是两个无法区分的按钮。 */
  duplicateOptionText: 'duplicate-option-text',
  /** 选项指向本单元不存在的词条。 */
  danglingOption: 'dangling-option',
  /**
   * Story 2.4：卡面选项数与**选项数规则**给的目标值不符。
   *
   * 守的是 `src/content/option-count.ts` 的档位表（AC-B3 / AC-C3）。
   * ⚠️ 它是**内容侧**的一条 —— 规则改了而内容没跟着改时，这里会逐张卡报出
   * 「期望几个 / 实际几个」，而不是让难度曲线在没人看的地方偏出去。
   */
  optionCount: 'option-count',
  /**
   * Story 2.4：同一张卡内两个**文字**选项只差几个字。
   *
   * 判据是归一化后的字符级编辑距离（阈值见 `scripts/validate-content.ts` 的
   * `NEAR_DUPLICATE_MAX_DISTANCE`）—— 「只差一两个字」正是 6 岁半要**逐字辨认**
   * 才能分辨的量级。⚠️ 单词卡的选项是**图片**，没有文字可算距离 ⇒ 这一类只管
   * 关键词卡与回应卡；图片选项的「视角是否一致」是 `docs/art-direction.md` §5.4
   * 的**目视**台账，机器判不了。
   */
  optionNearDuplicate: 'option-near-duplicate',
  /**
   * Story 1.7 / AC-14.1：塔或僵尸的 SVG 缺失。
   *
   * 为什么要单独一类：它与「词图缺失」是两件事 —— 词图按**词条**增减（一个单元 15-30 张，
   * 随内容录入变化），塔/僵尸图按**塔型**增减且**总量恒为 4 张**（FR70）。
   * 混在一类里会让「多了 1 张塔图」这种错误看起来像内容录入的正常波动。
   */
  assetMissing: 'asset-missing',
  /**
   * Story 1.7 / AC-14.1：资产目录里有**预期之外**的 SVG。
   *
   * 🎯 这条是 FR70「美术成本不由词汇产生」的**唯一可机器判定形式**。
   * 只查「三个塔图都在」的话，哪天有人按词复制塔图，那条断言照样全绿
   * —— 而那正是旧项目「词就是塔名」的历史包袱在新架构里的复发。
   */
  assetUnexpected: 'asset-unexpected',
  /** Story 1.7 / AC-14.2：SVG 几何规格不合规（`viewBox` / 尺寸 / 透明底）。 */
  svgGeometry: 'svg-geometry',
  /**
   * DF-196：**单元文件名 ↔ JSON 里 `unitNumber` 不一致**（或文件名形态不对）。
   *
   * 为什么单独一类：其它所有判据用的都是 JSON **自述**的 `unitNumber`
   * （选项数、词图目录、词图 URL、entryId 前缀）⇒ 两者不一致时**一处都不会红**，
   * 而内容与资产会悄悄错位（`unit-05.json` 写 `unitNumber: 1`
   * ⇒ 它的词图会被期待在 `unit-01/` 下）。
   */
  unitFileName: 'unit-file-name',
  /** 其余结构性错误（类型不对、多余字段等）。 */
  schema: 'schema',
} as const

export type ProblemCategory = (typeof PROBLEM_CATEGORY)[keyof typeof PROBLEM_CATEGORY]

/** 词条 id 的单元前缀，如 `u1-`。由单元号拼出，不另写一份「1」。 */
export function unitPrefix(unitNumber: number): string {
  return `u${unitNumber}-`
}

/**
 * 非空白字符串。`min(1)` 挡不住 `"   "` —— 纯空白串的 length 也是 1。
 *
 * 与 `promptText` 同一个洞（见 CardSchema 的 AC-4 检查），但那一条在卡层判，
 * 选项层的字符串没有那层保护。空白按钮与空白题面在界面上一样是「什么都没有」，
 * 且没有任何报错指向它。
 */
const nonBlank = (field: string) =>
  z.string().refine((value) => value.trim().length >= 1, {
    message:
      `选项的 ${field} 不得为空或纯空白 —— 界面上会是一个没有内容的选项，` +
      '没有任何报错指向它',
    params: { category: PROBLEM_CATEGORY.blankOptionField },
  })

/** 图片选项（单词卡的选项，GDD「听音 → 识物」）。有 `imageSrc`，**没有** `text`。 */
export const ImageOptionSchema = z.strictObject({
  /** 恒等于所指向的**词条 id**（不是 `u1-dog-o1` 之类），见 Dev Notes 内容模型裁决第 3 条。 */
  id: z.string().min(1),
  /** 只是路径字符串 —— 图片数据不进 JS bundle（AR31 / 架构 `:304`）。 */
  imageSrc: nonBlank('imageSrc'),
  correct: z.boolean(),
})

/** 文字选项（关键词卡 / 回应卡的选项，GDD「孩子选择时同时在读」）。有 `text`，**没有** `imageSrc`。 */
export const TextOptionSchema = z.strictObject({
  id: z.string().min(1),
  text: nonBlank('text'),
  correct: z.boolean(),
})

/** 选项并集（架构模式 B：「卡型差异只在数据，不在代码」）。 */
export const OptionSchema = z.union([ImageOptionSchema, TextOptionSchema])

/** 三种卡型（GDD `:180-194` 的表格）。`kind` **不参与战斗**（FR14），只用于渲染与分布统计。 */
export const CardKindSchema = z.enum(['word', 'keyword', 'response'])

/**
 * 塔型白名单。
 *
 * ⚠️ 这里确实写了字面量，而 `TOWER_TYPES` 在 `src/core/balance.ts` 是单一事实源。
 * 这是**有测试兜底的重复，不是疏忽**：`tests/content/content-boundary.test.ts`
 * 断言本 schema 的取值集合 === `TOWER_TYPES`。
 *
 * 为什么不直接 `z.enum(TOWER_TYPES)`：那会让内容层在**运行期** import `core/`，
 * 于是单元 JSON 的校验依赖战斗层模块被加载 —— 一个校验错误（坏 JSON）会先撞上
 * 一条与它无关的 import 失败，报错现场离错误源头很远。字面量 + 等值断言则把
 * 「内容层自己可读」和「不许漂移」两件事分开。
 */
export const TowerTypeSchema = z.enum(['direct', 'slow', 'aoe'], {
  // ⚠️ 自定义 message 是 AC-11 第 2 类的要求：报错必须带**收到的非法值**。
  // Zod 默认的「expected one of …」里没有它 —— 录入者看到「非法选项」无从判断
  // 自己打的是 `Direct` 还是 `sloow`，得回去翻文件。
  error: (issue) => `未知塔型 ${JSON.stringify(issue.input)}，合法值：direct / slow / aoe`,
})

/**
 * 卡 —— 三种卡型共用一个形状（架构模式 B 的拍平版，见 `src/core/types.ts:218-234`）。
 *
 * 三条 refinement 各自对应一条内容层必须守的不变量，理由见文件头。
 */
export const CardSchema = z
  .strictObject({
    kind: CardKindSchema,
    /** 卡面 TTS 朗读的文本。**必须与该词条的录音内容一致**，见下。 */
    promptText: z.string(),
    /** 至少 2 个 —— 只有一个选项时「恰有 1 个正确项」等价于没有选择。 */
    options: z.array(OptionSchema).min(2),
  })
  .superRefine((card, ctx) => {
    // ── 卡面 TTS 文本不得为空（AC-4）──────────────────────────────────────
    // trim 是必需的：纯空白串的 length 也是 1，孩子会听到一片静默，
    // 而界面上是一张没有题面的卡。
    if (card.promptText.trim().length < 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['promptText'],
        message:
          '卡面 TTS 文本不得为空（纯空白串同样算空）—— 空题面在运行时表现为' +
          '「听不到任何声音」，没有任何报错指向它',
        params: { category: PROBLEM_CATEGORY.emptyPrompt },
      })
    }

    // ── 恰有 1 个正确项（AC-3 / FR16）─────────────────────────────────────
    // 0 个 ⇒ 孩子点什么都错；2 个及以上 ⇒ 存在两个都算对的选项，
    // `isCorrect()` 只看第一个（core/types.ts:383），另一个是永远不会答对的死选项。
    const correctCount = card.options.filter((option) => option.correct).length
    if (correctCount === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: '本题没有正确项 —— 孩子点任何一个选项都会被判错，且没有任何报错',
        params: { category: PROBLEM_CATEGORY.correctCount },
      })
    } else if (correctCount > 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message:
          `本题有多个正确项（${correctCount} 个，选项 ` +
          `${card.options.filter((o) => o.correct).map((o) => o.id).join('、')}）—— ` +
          'isCorrect() 只认第一个，其余是永远不会答对的死选项',
        params: { category: PROBLEM_CATEGORY.correctCount },
      })
    }

    // ── 卡型与选项形态相符（AC-5）─────────────────────────────────────────
    // word ⇒ 全部 ImageOption；keyword / response ⇒ 全部 TextOption。
    const wantsImage = card.kind === 'word'
    card.options.forEach((option, index) => {
      const isImage = 'imageSrc' in option
      if (isImage === wantsImage) return
      const wanted = wantsImage ? '图片选项（有 imageSrc）' : '文字选项（有 text）'
      const actual = isImage ? '图片选项' : '文字选项'
      ctx.addIssue({
        code: 'custom',
        path: ['options', index],
        message:
          `卡型 ${card.kind} 的选项必须是${wanted}，而选项 ${option.id} 是${actual}` +
          `（选项形态由字段存在性判定：${Object.keys(option).sort().join('/')}）`,
        params: { category: PROBLEM_CATEGORY.kindOptionMismatch },
      })
    })

    // ── 同一张卡内选项 id 互不相同（超出 AC 的额外闸门，理由如下）─────────
    // option id === 词条 id（内容模型裁决第 3 条）。同一条目在一张卡里出现两次时，
    // `isCorrect()` 用 `find` 只命中第一个 —— 后一个选项「怎么点都对不了/都错」，
    // 而且界面上两个按钮长得一模一样。core 侧拦不住（类型上完全合法）。
    const seen = new Set<string>()
    card.options.forEach((option, index) => {
      if (seen.has(option.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['options', index],
          message:
            `选项 id 重复：${option.id} —— 同一张卡里同一个词条出现两次，` +
            'isCorrect() 只会命中第一个，界面上会给出两个无法区分的按钮',
          params: { category: PROBLEM_CATEGORY.duplicateOptionId },
        })
      }
      seen.add(option.id)
    })

    // ── 同一张卡内选项的显示文本互不相同 ──────────────────────────────────
    // `duplicateOptionId` 只比 id，而 option id === 词条 id、显示文本是自由文本，
    // 于是 `{id:'u1-dog', text:'Yes'}` 与 `{id:'u1-cat', text:'Yes'}` 合法通过 ——
    // 孩子看到两个都写着「Yes」的按钮，一个对一个错，纯属刁难。
    // 归一化后比较：大小写与首尾空白造成的「看起来一样」同样会给出无法区分的按钮。
    const seenText = new Map<string, string>()
    card.options.forEach((option, index) => {
      const shown = 'text' in option ? option.text : option.imageSrc
      const key = shown.trim().toLowerCase()
      const firstId = seenText.get(key)
      if (firstId !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['options', index],
          message:
            `选项内容重复：选项 ${option.id} 与选项 ${firstId} 的显示文本都是 ` +
            `「${shown}」—— 界面上会给出两个无法区分的按钮，孩子无从分辨该点哪个`,
          params: { category: PROBLEM_CATEGORY.duplicateOptionText },
        })
      } else {
        seenText.set(key, option.id)
      }
    })
  })

/**
 * 塔绑定 —— `DeckEntry` 里 `{wordId, towerType}` 那部分，**不重复结构**，只给它一个名字。
 *
 * ⚠️ `towerType` 决定战斗数值，`wordId` 只决定显示名与词图（架构模式 C / 约束 3）。
 * 本 schema 不引入任何「按词条改数值」的字段 —— 那会让平衡验证全部失效。
 */
export const TowerBindingSchema = z.strictObject({
  /**
   * 塔的显示名来源。本 story 与 `entryId` 同值（内容模型裁决第 2 条）。
   *
   * ⚠️ 不能只留 `min(1)`：架构 `:879` 声明 `wordId: string // ← 显示名 / 词图 来源`，
   * 它会一路流到渲染层。`min(1)` 放过 `u9-zebra`（跨单元）、`../../etc/passwd`
   * （拼进图片路径）、`🙂`（塔上没有可读的名字）—— 三者都曾实测通过 UnitSchema。
   * 因此套上与 `entryId` 同一套形态约束。
   *
   * 刻意**不**强制 `wordId === entryId`：那只是本 story 的取值决策（内容模型裁决第 2 条），
   * 不是架构不变量。单元 2 的 `2-5 选项数量递进规则` 若要给同一张卡换显示名，
   * 硬绑定会让那一步变成改 schema 而不是改内容。
   */
  wordId: z.string().regex(
    ENTRY_ID_PATTERN,
    'wordId 必须是「单元前缀 + kebab-case」—— 它是塔的显示名与词图来源，' +
      '不能是任意字符串',
  ),
  towerType: TowerTypeSchema,
})

/**
 * 词条 —— 一个词 + 它的卡 + 它绑定哪种塔，形状 === core 的 `DeckEntry`
 * （内容模型裁决第 1 条：`createInitialState({unitNumber, deck})` 直接吃它，
 * 中间不得有手写转换函数）。
 */
export const EntrySchema = z.strictObject({
  entryId: z.string().regex(
    ENTRY_ID_PATTERN,
    '词条 id 必须是「单元前缀 + kebab-case」（如 u1-dog / u1-s-how-are-you）—— ' +
      '尾部的连字符、大写字母、空段都会被这条挡下',
  ),
  wordId: TowerBindingSchema.shape.wordId,
  towerType: TowerTypeSchema,
  card: CardSchema,
})

/**
 * 单元 —— 一个单元的全部内容。
 *
 * 单元级 refinement 只放**需要跨条目比对**的两条（AC-6 选项不跨单元、AC-8 单元内 id 唯一）；
 * 其余全部在条目 / 卡 / 选项各自的那一层判 —— 报错现场离数据越近越好。
 */
export const UnitSchema = z
  .strictObject({
    unitNumber: z.number().int().min(1),
    entries: z.array(EntrySchema).min(1),
  })
  .superRefine((unit, ctx) => {
    const prefix = unitPrefix(unit.unitNumber)

    // ── entryId 单元内唯一（AC-8）─────────────────────────────────────────
    const seen = new Map<string, number>()
    unit.entries.forEach((entry, index) => {
      const firstAt = seen.get(entry.entryId)
      if (firstAt !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['entries', index],
          message:
            `词条 id 重复：${entry.entryId}（第 ${firstAt} 条与第 ${index} 条）—— ` +
            '重复 id 会让题单里出现两道题共用一个录音文件名',
          params: { category: PROBLEM_CATEGORY.duplicateEntryId },
        })
        return
      }
      seen.set(entry.entryId, index)
    })

    // ── 选项必须指向本单元真实存在的词条（超出 AC 的额外闸门）──────────────
    // AC-6 只管「不许跨单元」，管不住「指向本单元里根本没有的词条」——
    // 那种选项能通过全部 AC，却让塔的显示名与词图来源落在一个不存在的词条上。
    unit.entries.forEach((entry, entryIndex) => {
      entry.card.options.forEach((option, optionIndex) => {
        if (seen.has(option.id)) return
        ctx.addIssue({
          code: 'custom',
          path: ['entries', entryIndex, 'card', 'options', optionIndex],
          message:
            `选项 ${option.id} 在单元 ${unit.unitNumber} 里没有对应的词条 —— ` +
            '选项 id 必须等于所指向的词条 id（内容模型裁决第 3 条）',
          params: { category: PROBLEM_CATEGORY.danglingOption },
        })
      })
    })

    // ── 选项不得混入其他单元的词条（AC-6）──────────────────────────────────
    // 判据唯一：option id 的单元前缀 vs 本单元号。跨单元的选项会引用一个
    // 本单元没有的词条 —— 它的词图与词义都不在这个单元里，孩子看到的画面与
    // 单元内容脱节，且塔的显示名会指向别单元的词。
    unit.entries.forEach((entry, entryIndex) => {
      entry.card.options.forEach((option, optionIndex) => {
        if (option.id.startsWith(prefix)) return
        ctx.addIssue({
          code: 'custom',
          path: ['entries', entryIndex, 'card', 'options', optionIndex],
          message:
            `选项 ${option.id} 不属于单元 ${unit.unitNumber}（选项 id 必须以 ${prefix} 开头）—— ` +
            `混入其他单元的词条会让孩子的画面与本单元内容脱节`,
          params: { category: PROBLEM_CATEGORY.foreignOption },
        })
      })
    })

    // ── entryId 自身的单元前缀必须与 unitNumber 一致（AR29）────────────────
    // ⚠️ 上面那条只查 option id；`entryId` 自己此前只过 `ENTRY_ID_PATTERN`，
    // 而那个正则接受**任意** `u<N>-`。于是单元 1 的文件里可以写 `entryId: "u2-cat"`：
    // schema 通过、启动校验通过、validate-content 也通过（单元 2 还不存在，
    // `globalEntryIdProblems` 无从发现），然后 `generate-voice` 往**扁平**的
    // `voice/` 目录写出 `u2-cat.mp3` —— 占用了单元 2 的录音命名空间。
    // 等 Epic 2 真加单元 2 且里面有同名词时，那份 mp3 会被后来者静默覆盖，
    // 而界面上只会表现为「换了单元却播了另一个单元的录音」。
    // 这正是 AR29 要求前缀的原因，AR29 的执行点此前漏了 entryId 本身。
    unit.entries.forEach((entry, entryIndex) => {
      if (entry.entryId.startsWith(prefix)) return
      ctx.addIssue({
        code: 'custom',
        path: ['entries', entryIndex, 'entryId'],
        message:
          `词条 id ${entry.entryId} 的单元前缀是 ${entry.entryId.slice(0, 3)}，` +
          `但它位于单元 ${unit.unitNumber}（应该 ${prefix} 开头）—— ` +
          '录音目录不按单元分层，前缀错了会占掉别的单元的录音文件名',
        params: { category: PROBLEM_CATEGORY.entryUnitMismatch },
      })
      // `wordId` 与 `entryId` 各自独立过了形态校验，但形态相同不代表前缀归属相同：
      // `entryId: "u1-dog"` 配 `wordId: "u2-dog"` 同样是跨单元，一并报。
      if (!entry.wordId.startsWith(prefix)) {
        ctx.addIssue({
          code: 'custom',
          path: ['entries', entryIndex, 'wordId'],
          message:
            `wordId ${entry.wordId} 不属于单元 ${unit.unitNumber}（应以 ${prefix} 开头）—— ` +
            '它是塔的显示名与词图来源，跨单元会让塔指向别的单元的词',
          params: { category: PROBLEM_CATEGORY.entryUnitMismatch },
        })
      }
    })
  })

// ── 导出的 TS 类型 ──────────────────────────────────────────────────────────
//
// ⚠️ 这六个名字与 `src/core/types.ts` 的同名类型**形状一致但来源不同**：
// 这里导出的是从 schema 推导出来的类型，core 那边是手写的接口。
// 一致性由 `tests/content/schema.test.ts` 的双向赋值断言守住 ——
// 少一侧就会在 `npm run typecheck` 报 TS2322，而不是等运行时。
// 为什么不直接 re-export core 的类型：那样 schema 推导出的类型就成了没人用的东西，
// 「内容与 core 对齐」会变成一句没有约束力的话。

export type ImageOption = z.infer<typeof ImageOptionSchema>
export type TextOption = z.infer<typeof TextOptionSchema>
export type Option = z.infer<typeof OptionSchema>
export type Card = z.infer<typeof CardSchema>
export type CardKind = z.infer<typeof CardKindSchema>
export type TowerType = z.infer<typeof TowerTypeSchema>
export type TowerBinding = z.infer<typeof TowerBindingSchema>
/** 与 core 的 `DeckEntry` 形状一致（AC-9）。 */
export type DeckEntry = z.infer<typeof EntrySchema>
export type Unit = z.infer<typeof UnitSchema>
