/**
 * 单元 1 真实内容的守卫（Story 1.6 / AC-15 ~ AC-18）。
 *
 * ── 守什么 ────────────────────────────────────────────────────────────────
 * 1. **AC-15**：`entryId` 集合与已存在的 37 个 mp3 **完全一致**（一不多一不少）。
 *    这是本 story 最不可逆的一条 —— mp3 一次性全量生成、永不重生成
 *    （架构 `:425-430`）。少录一条，答题时会在该词上静默降级到设备 TTS，
 *    症状只是「音色偶尔和其他词不一样」，没有任何报错。
 * 2. **卡面文本与录音内容一致**：每条 `promptText` 必须等于该词条录音里被朗读的文本
 *    （manifest 里有溯源）。不一致 ⇒ 孩子看到的字与听到的声音对不上。
 * 3. **AC-16 / AC-17**：30 词 + 7 句全部录入，三种卡型成规模存在。
 * 4. **AC-18**：短语不单独成卡，但作为回应卡的选项出现。
 * 5. **AC-9**：内容导出的 deck 能直接喂给 `createInitialState`。
 *
 * ── 为什么这么写 ──────────────────────────────────────────────────────────
 * · **比对 mp3 文件名而不是 mp3 内容**。内容对不对由 manifest 的 sha256 管
 *   （`tests/scripts/generate-voice.test.ts` 已在管），本文件只守「词条集合
 *   与磁盘上的文件集合一致」这一条轴 —— 两条轴混在一起，改内容时定位不到是哪条红了。
 * · **两侧都 `sort()` 再比**。词表文件本身不按字典序排（u1-sister / u1-student
 *   就是反的），不排序会报出根本不存在的差异。
 * · **不断言具体条数以外的顺序**。条数本身要断言（37），顺序是录入的自由。
 */

import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { createInitialState } from '../../src/core/reducer'
import * as contentModule from '../../src/content'
import { getUnit, parseUnit, UNITS } from '../../src/content'
import { targetCardDistribution } from '../../src/content/distribution'
import { targetOptionCount } from '../../src/content/option-count'
import { UnitSchema } from '../../src/content/schema'

const root = fileURLToPath(new URL('../../', import.meta.url))
const voiceDir = join(root, 'public/assets/audio/voice')

interface Manifest {
  entries: Record<string, { text: string; sha256: string; bytes: number }>
}
const manifest = JSON.parse(readFileSync(join(voiceDir, 'manifest.json'), 'utf8')) as Manifest

const unit = getUnit(1)
const entries = unit.entries

/** 磁盘上录音文件的 id（去扩展名）。 */
const mp3Ids = (): string[] =>
  readdirSync(voiceDir)
    .filter((name) => name.endsWith('.mp3'))
    .map((name) => name.slice(0, -'.mp3'.length))
    .sort()

describe('AC-15 —— entryId 与 37 个 mp3 完全一致', () => {
  it('mp3 目录里是 37 个文件（改动这个数要同时改录音与本断言）', () => {
    // 38 → 37 是 [CR] 2026-10-14 退役 `u1-s-what-is-this` 的连带，理由见 AC-16 那条。
    expect(mp3Ids().length, '录音数量变了 —— 少一条会静默降级到设备 TTS，多一条说明词表被改过').toBe(
      37,
    )
  })

  it('entryId 集合 === mp3 文件名集合（两个方向都为空）', () => {
    expect([...entries.map((e) => e.entryId)].sort(), '内容与录音不一致，见上方说明').toEqual(
      mp3Ids(),
    )
  })

  it('每个 mp3 都非空（0 字节的录音会永久 skip，运行时静默降级）', () => {
    for (const id of mp3Ids()) {
      const size = statSync(join(voiceDir, `${id}.mp3`)).size
      expect(size, `${id}.mp3 是 0 字节 ⇒ 运行时 new Audio() 收 error 事件，静默降级到设备 TTS`).toBeGreaterThan(
        0,
      )
    }
  })

  it('每个 mp3 的内容与 manifest 记录一致（跳过判据是哈希，不是「文件存在」）', () => {
    for (const [id, recorded] of Object.entries(manifest.entries)) {
      const actual = createHash('sha256').update(readFileSync(join(voiceDir, `${id}.mp3`))).digest('hex')
      expect(actual, `${id}.mp3 的内容与 manifest 不符（半截文件 / 被手工改过 / 换了语速重生成）`).toBe(
        recorded.sha256,
      )
    }
  })
})

describe('卡面文本与录音内容一致（录音不可重生成，这是不变量）', () => {
  it('每条 promptText 等于该词条录音里的文本', () => {
    for (const entry of entries) {
      const recorded = manifest.entries[entry.entryId]
      expect(
        recorded?.text,
        `${entry.entryId} 没有录音溯源记录（manifest 里查不到）⇒ 读取时会静默降级到设备 TTS`,
      ).toBeDefined()
      expect(
        entry.card.promptText,
        `${entry.entryId} 的卡面文字与录音内容不一致 ⇒ 孩子看到的字与听到的声音对不上`,
      ).toBe(recorded?.text)
    }
  })

  it('每条录音都有被朗读的地方（没有「只当选项、不当题面」的孤儿录音）', () => {
    const prompts = new Set(entries.map((e) => e.card.promptText))
    for (const id of mp3Ids()) {
      const recorded = manifest.entries[id]
      expect(
        prompts.has(recorded?.text ?? ''),
        `${id} 的录音「${recorded?.text}」在任何一张卡的卡面上都不出现 —— ` +
          '要么它该当题面却只当选项，要么词表与内容层已经脱节',
      ).toBe(true)
    }
  })
})

describe('AC-16 —— 单元 1 全部词汇与句子均已录入', () => {
  it('单元 1 有 37 条词条（30 词 + 7 句）', () => {
    // 38 → 37 是 [CR] 2026-10-14 的退役：`u1-s-what-is-this` 题面 "What is this?"
    // 而四个选项全是完整句子，没有任何一项回答该问句，正确项标的是
    // "I have a ball for my dog."。孩子按常识作答会被判错、扣一颗心、回炉重练。
    // 修题面要重生成 mp3（录音归 Story 1.3），单元 1 也没有 "It is a ___" 这类
    // 名词短语词汇可作选项，故退役而非改写。mp3 与 manifest 已同步删除。
    // 若将来补上名词短语词汇要把它加回来，届时的条数是 38。
    expect(entries.length, '词条数变了 —— 见 AC-15 的说明，新增/删除 entryId 都是不可逆的').toBe(37)
  })

  it('词与句的分布是 30 + 7（句子以 u1-s- 前缀区分）', () => {
    const sentenceCount = entries.filter((e) => e.entryId.startsWith('u1-s-')).length

    expect(entries.length - sentenceCount).toBe(30)
    expect(sentenceCount).toBe(7)
  })

  it('所有 entryId 都带 u1- 前缀', () => {
    for (const entry of entries) {
      expect(entry.entryId.startsWith('u1-'), `${entry.entryId} 缺单元前缀`).toBe(true)
    }
  })

  it('wordId === entryId（本 story 的取值决策，见内容模型裁决第 2 条）', () => {
    // ⚠️ 若将来决定让两者不同（塔的显示名与词条不同源），这条断言会红 ——
    // 那时请连同 schema 与 generate:voice 的取词来源一起改，不要只改数据。
    for (const entry of entries) {
      expect(entry.wordId, `${entry.entryId} 的 wordId 与 entryId 不一致`).toBe(entry.entryId)
    }
  })
})

describe('AC-17 —— 三种卡型成规模存在（FR19）', () => {
  const kindCounts = entries.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.card.kind] = (acc[entry.card.kind] ?? 0) + 1
    return acc
  }, {})

  it('单词卡 / 关键词卡 / 回应卡三型都在，且单词卡占多数（难度阶梯的起点）', () => {
    expect(kindCounts, '卡型分布见下方两条断言').toBeDefined()
    expect(kindCounts['word'], '一张单词卡都没有 ⇒ 孩子第一题就没有「听音识物」可做').toBeGreaterThan(
      0,
    )
    expect(kindCounts['keyword'], '没有关键词卡 ⇒ 「听句取词」这一层缺失（GDD 支柱 3）').toBeGreaterThan(
      0,
    )
    expect(kindCounts['response'], '没有回应卡 ⇒ 「听问应答」这一层缺失（GDD 支柱 3）').toBeGreaterThan(
      0,
    )
  })

  it('单词卡全是图片选项，其余两型全是文字选项（AC-5 在真实数据上的复验）', () => {
    for (const entry of entries) {
      const shapes = new Set(entry.card.options.map((o) => ('imageSrc' in o ? 'image' : 'text')))
      expect(
        shapes.size === 1 && [...shapes][0] === (entry.card.kind === 'word' ? 'image' : 'text'),
        `${entry.entryId} 的卡型 ${entry.card.kind} 与选项形态 ${[...shapes].join('/')} 不符`,
      ).toBe(true)
    }
  })

  // ── G190（Story 2.2 / AC-B3）：规则(单元 1) 与真实内容一致 ──────────────
  //
  // ⚠️ 与上方 AC-17 的两条**不重叠**：那两条守「三型都 ≥ 1 / 选项形态相符」，
  //    本条守「分布规则算出来的首锚点 === 这份真实内容的实测配比」。
  //    前者内容改了会红，后者**两边**任何一边单独改了都会红 ——
  //    规则改了不碰内容，或内容改了不碰规则，都是「难度阶梯落空了」。
  //    所以它住在这里（内容侧），而规则自身的性质由 tests/content/distribution.test.ts 守。
  it('G190：targetCardDistribution(1) 与本单元真实配比零容差一致', () => {
    const total = entries.length
    const dist = targetCardDistribution(1)
    // 期望值从**真实内容**现算，不写死 30/1/6 —— 内容改了而规则没改时红的是这一条，
    // 且报错信息里带着新配比，不需要人去 diff 才能看出「该重裁锚点还是该重录内容」。
    expect(
      dist.word,
      `规则说单元 1 的单词份额是 ${dist.word}，而真实内容是 ${kindCounts['word']}/${total} —— ` +
        '首锚点不再等于真实配比，难度阶梯就从单元 1 起落空了。' +
        '请确认是重裁 src/content/distribution.ts 的 FIRST_ANCHOR，还是这份内容该改',
    ).toBe(kindCounts['word'] / total)
    expect(
      dist.keyword,
      `规则说单元 1 的关键词份额是 ${dist.keyword}，而真实内容是 ${kindCounts['keyword']}/${total} —— ` +
        '理由同上一条',
    ).toBe(kindCounts['keyword'] / total)
    expect(
      dist.response,
      `规则说单元 1 的回应份额是 ${dist.response}，而真实内容是 ${kindCounts['response']}/${total} —— ` +
        '理由同上一条',
    ).toBe(kindCounts['response'] / total)
  })

  // ── G264（Story 2.4 / AC-B4）：选项数规则(档 1) 与真实内容逐卡一致 ──────────
  //
  // ⚠️ 与 G190 同款理由，但**粒度更细**：G190 比的是**配比**（份额），
  //    本条比的是**每一张卡的选项数** —— 逐卡核对，零容差。
  //    「档内同值」这条性质（规则侧，G263 ②）说「同一档内所有单元同值」，
  //    但它**只保证规则自洽**，不保证**内容真的按它录**。
  //    ⇒ 规则改了不碰内容、或内容改了不碰规则，两边都会红 —— 难度阶梯不会落空。
  it('G264：每张卡的选项数 === 规则算出的档 1 目标值（逐卡核对，零容差）', () => {
    for (const entry of entries) {
      const want = targetOptionCount(1, entry.card.kind)
      expect(
        entry.card.options.length,
        `${entry.entryId}（${entry.card.kind} 卡）有 ${entry.card.options.length} 个选项，` +
          `而规则说单元 1 的 ${entry.card.kind} 卡应当是 ${want} 个 —— ` +
          '两者必须一致：改内容要同步改 src/content/option-count.ts 的档位表（或反之），' +
          '否则「档内同值」只是一句没有人核对过的承诺',
      ).toBe(want)
    }
  })

  it('G264 反向自测：把一张卡多塞一个选项 ⇒ 上面那条立刻红（判据真能咬住它）', () => {
    // ⚠️ R-51 / T6.5：判据必须真能咬住它要防的那个违规。
    //   这里在**夹具**上多塞一个选项（不动真实内容），证明判据不是恒真的。
    const first = entries[0]
    const padded = { ...first, card: { ...first.card, options: [...first.card.options, first.card.options[0]] } }
    expect(
      padded.card.options.length,
      '夹具没造出「多一个选项」⇒ 反向自测本身失效',
    ).not.toBe(targetOptionCount(1, first.card.kind))
  })

  it('每张卡恰有一个正确项（FR16 在真实数据上的复验）', () => {
    for (const entry of entries) {
      expect(
        entry.card.options.filter((o) => o.correct).length,
        `${entry.entryId} 的正确项数量不是 1`,
      ).toBe(1)
    }
  })

  it('每个选项都指向本单元真实存在的词条', () => {
    const ids = new Set(entries.map((e) => e.entryId))
    for (const entry of entries) {
      for (const option of entry.card.options) {
        expect(ids.has(option.id), `${entry.entryId} 的选项 ${option.id} 指向不存在的词条`).toBe(true)
      }
    }
  })
})

describe('AC-18 —— 短语归入回应卡，不单独成卡', () => {
  /**
   * 本单元的**全部**短语（问候 / 道别 / 感谢这类可独立作答的短句）。
   *
   * 识别规则刻意从数据推，而不是抄一份短语清单：
   * · 必须是句子型词条（`u1-s-` 前缀）—— 「Goodbye」「Hello」在单元 1 是**词**
   *   （`u1-goodbye` / `u1-hello`，配图片选项），它们独立成卡是词卡的正常形态，
   *   不属于 AC-18 要管的那一类；
   * · 卡面 ≤ 4 个词且不是问句 —— 「How are you?」是问句，「I am fine, thank you.」
   *   与「I have a ball for my dog.」是完整句子；剩下的 Good morning! /
   *   Good afternoon! / Nice to meet you. / Thank you! 才是短语。
   *
   * ⚠️ 抄清单会得到一个永远为真的集合 —— 加了新短语而清单没动，测试不响。
   */
  const phrases = (): { entryId: string; text: string }[] =>
    entries
      .filter((entry) => entry.entryId.startsWith('u1-s-'))
      .filter((entry) => {
        const raw = entry.card.promptText.trim()
        return !raw.endsWith('?') && raw.split(/\s+/).length <= 4
      })
      .map((entry) => ({
        entryId: entry.entryId,
        text: entry.card.promptText.trim().replace(/[.!?]+$/, ''),
      }))

  it('不存在卡型为「短语」的第四种卡（GDD：短语归入回应卡）', () => {
    // Card.kind 只有三态，schema 已守住枚举；这里守的是**内容里没有第四种值**。
    const kinds = new Set(entries.map((e) => e.card.kind))

    expect([...kinds].sort()).toEqual(['keyword', 'response', 'word'])
  })

  it('每一条短语都作为回应卡的选项出现（AC-18 的正面要求）', () => {
    // ⚠️ [CR] 2026-10-14：原先只查 `u1-s-good-morning` **一条**短语，
    //   另外三条（Good afternoon! / Nice to meet you. / Thank you!）一条都没被守 ——
    //   把它们从所有回应卡里拿掉，测试照样全绿。
    //   「短语归入回应卡」是一条覆盖全部短语的规则，不该只抽查一条。
    const all = phrases()

    expect(all.length, '没识别出任何短语 ⇒ 本条断言是空的').toBeGreaterThan(0)

    for (const phrase of all) {
      const asOption = entries.filter((entry) =>
        entry.card.options.some((option) => option.id === phrase.entryId),
      )

      expect(
        asOption.length,
        `短语「${phrase.text}」一处选项都没出现 ⇒ 短语被当成了独立卡面而不是对问候的回应`,
      ).toBeGreaterThan(0)
    }
  })

  it('短语清单 === 已登记的例外清单（新增一条就要给出理由）', () => {
    // ⚠️ [CR] 2026-10-14：原先的断言是 `toBeLessThanOrEqual(1)`，而 `good morning`
    //   本来就恰好 1 条 —— **这条断言永远绿**，它允许的 1 正是它自己写出来要防的那个违规。
    //   现在改成与已登记清单做等值比对：多出一条就红，少一条也红。
    //
    // 为什么这四条可以独立成卡（取舍见 Completion Notes）：
    //   它们的卡面就是短语本身（GDD `:185` 的表格正是这么列的），原因是那条录音
    //   **不可重生成**（架构 `:425-430`）—— 卡面若换成别的字，运行时播的仍是
    //   「Good morning!」，孩子看到与听到的直接对不上。这是有意识的取舍，不是遗漏。
    //   代价是这四条比问句卡更容易靠排除法选中；这个取舍是否可接受属于首次试玩
    //   验证（Story 1-19）的观测项，不在本 story 的判定范围。
    expect(
      phrases().map((phrase) => phrase.entryId).sort(),
      '短语清单变了 —— 新增一条要说明为什么它值得单独立卡；' +
        '少一条说明有人撤了登记，请同步本清单与 Completion Notes 的取舍说明',
    ).toEqual(['u1-s-good-afternoon', 'u1-s-good-morning', 'u1-s-nice-to-meet-you', 'u1-s-thank-you'])
  })

  it('登记成例外的短语，其卡面确实就是短语本身（登记没有与数据脱节）', () => {
    for (const phrase of phrases()) {
      const owner = entries.find((entry) => entry.entryId === phrase.entryId)

      expect(owner, `${phrase.entryId} 不在单元里`).toBeDefined()
      expect(
        owner?.card.promptText.trim().replace(/[.!?]+$/, ''),
        `${phrase.entryId} 已登记为「短语独立成卡」，但它的卡面是别的字 —— ` +
          '要么撤掉登记，要么改卡面（改卡面要重生成录音，Story 1.3）',
      ).toBe(phrase.text)
    }
  })

  it('关键词卡的正确项确实是句中出现的那个词', () => {
    const keywordCards = entries.filter((e) => e.card.kind === 'keyword')
    expect(keywordCards.length, '没有关键词卡可查').toBeGreaterThan(0)

    for (const entry of keywordCards) {
      const correct = entry.card.options.find((o) => o.correct)
      const answer = correct && 'text' in correct ? correct.text : ''
      expect(
        entry.card.promptText.toLowerCase().includes(answer.toLowerCase()),
        `${entry.entryId} 的正确项「${answer}」不在卡面句子里 ⇒ 孩子在句子里找不到答案`,
      ).toBe(true)
    }
  })

  it('回应卡的正确项是另一条词条（不是自己答自己）', () => {
    const responseCards = entries.filter((e) => e.card.kind === 'response')
    expect(responseCards.length, '没有回应卡可查').toBeGreaterThan(0)

    for (const entry of responseCards) {
      const correct = entry.card.options.find((o) => o.correct)
      expect(
        correct?.id !== entry.entryId,
        `${entry.entryId} 的正确选项就是它自己的卡面 ⇒ 孩子点「重复听到的那句」即可，无需理解`,
      ).toBe(true)
    }
  })
})

describe('AC-9 —— 内容导出的 deck 能直接喂给回合层', () => {
  it('createInitialState 直接吃内容层的 entries（无手写转换）', () => {
    const state = createInitialState({ unitNumber: 1, deck: entries })

    expect(state.deck.length).toBe(entries.length)
    expect(state.unitNumber).toBe(1)
    expect(
      state.phase.kind === 'awaiting-answer' ? state.phase.question.entryId : null,
      '开局第一题不是从内容层题单里取的',
    ).toBe(entries[0].entryId)
  })

  it('UNITS 里目前只有单元 1（新增单元要在 index.ts 的 RAW_UNITS 登记）', () => {
    expect(UNITS.map((u) => u.unitNumber)).toEqual([1])
  })

  it('unit-01.json 本身能通过 UnitSchema（数据与 schema 没有脱节）', () => {
    const parsed = UnitSchema.safeParse(
      JSON.parse(readFileSync(join(root, 'src/content/units/unit-01.json'), 'utf8')),
    )

    expect(parsed.success, 'unit-01.json 过不了 schema ⇒ index.ts 的启动校验会在运行时炸').toBe(true)
  })

  it('单元 1 的 deck 全部是合法塔型（三塔型都出现，建造分支不会只走一半）', () => {
    const towerTypes = new Set(entries.map((e) => e.towerType))

    expect([...towerTypes].sort()).toEqual(['aoe', 'direct', 'slow'])
  })

  it('图片不进 JS bundle：JSON 里只有路径字符串，没有 data URI（AR31 / 架构 :304）', () => {
    const raw = readFileSync(join(root, 'src/content/units/unit-01.json'), 'utf8')

    expect(raw, 'JSON 里出现了 data: URI ⇒ 图片内容被内联进 bundle').not.toContain('data:')
    expect(raw, 'JSON 里出现了 <svg ⇒ 图片内容被内联进 bundle').not.toContain('<svg')
  })
})

// ── [CR] 2026-10-14 AC-28：失败即 throw，禁止 catch 降级 ───────────────────
//
// 这条是架构 `:568-571` 的分层错误策略。原先它**一条测试都守不住**：
// `parseUnits()` 的 `map` 回调里内嵌了 safeParse + throw，而 `RAW_UNITS`
// 是模块私有的，测试喂不进坏数据。变异坐实：把失败分支换成
// `console.warn` + 返回 `{unitNumber: 0, entries: []}`，183 条全绿。
// 现已抽出 `parseUnit(raw, file)` 供测试直接喂坏数据。

describe('AC-28 —— 内容坏了必须拒绝进入游戏，不许降级', () => {
  const broken = { unitNumber: 1, entries: [{ entryId: 'bad' }] }

  it('parseUnit 遇到不合法的单元数据必须 throw', () => {
    expect(() => parseUnit(broken, 'unit-99.json')).toThrowError()
  })

  it('错误信息带文件名与「拒绝进入游戏」（报错现场要能定位到是哪个文件）', () => {
    let message = ''
    try {
      parseUnit(broken, 'unit-99.json')
    } catch (error) {
      message = (error as Error).message
    }

    expect(message, '报错里没有文件名 ⇒ 录入者不知道该开哪个文件').toContain('unit-99.json')
    expect(message, '报错里没有「拒绝进入游戏」的语义 ⇒ 日志里看不出这是致命错误').toContain(
      '拒绝进入游戏',
    )
  })

  it('合法的单元数据正常返回，不抛（这条守住的是「别把好数据也判死」）', () => {
    const raw = JSON.parse(readFileSync(join(root, 'src/content/units/unit-01.json'), 'utf8'))
    const parsed = parseUnit(raw, 'unit-01.json')

    expect(parsed.unitNumber).toBe(1)
    expect(parsed.entries.length).toBe(entries.length)
  })
})

describe('AC-29 —— 不提供单元选择 / 推进 API（架构 :765-777）', () => {
  it('src/content/index.ts 的运行时导出里没有任何「选单元 / 下一单元」的后门', () => {
    // 加一个 `pickNextUnit()` 就是绕过「views/ 下没有 UnitSelectView」那条禁令的后门。
    // 单元推进归存档的 progress.currentUnitIndex，不归内容层。
    const runtimeExports = Object.keys(contentModule).filter((name) => name !== 'default')
    const expected = ['UNITS', 'entriesOf', 'getUnit', 'parseUnit']

    expect(
      [...runtimeExports].sort(),
      '内容层多出了导出 —— 若新增的是单元选择/推进类 API 即架构违规；' +
        '若只是新增了别的工具函数，请连同理由更新这条期望值',
    ).toEqual(expected)
  })

  it('getUnit 取不到时抛错而不是返回 undefined（调用方没有「内容缺失」分支）', () => {
    expect(() => getUnit(99)).toThrowError(/没有单元 99/)
  })
})
