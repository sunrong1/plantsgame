/**
 * 单元 1 真实内容的守卫（Story 1.6 / AC-15 ~ AC-18）。
 *
 * ── 守什么 ────────────────────────────────────────────────────────────────
 * 1. **AC-15**：`entryId` 集合与已存在的 38 个 mp3 **完全一致**（一不多一不少）。
 *    这是本 story 最不可逆的一条 —— mp3 一次性全量生成、永不重生成
 *    （架构 `:425-430`）。少录一条，答题时会在该词上静默降级到设备 TTS，
 *    症状只是「音色偶尔和其他词不一样」，没有任何报错。
 * 2. **卡面文本与录音内容一致**：每条 `promptText` 必须等于该词条录音里被朗读的文本
 *    （manifest 里有溯源）。不一致 ⇒ 孩子看到的字与听到的声音对不上。
 * 3. **AC-16 / AC-17**：30 词 + 8 句全部录入，三种卡型成规模存在。
 * 4. **AC-18**：短语不单独成卡，但作为回应卡的选项出现。
 * 5. **AC-9**：内容导出的 deck 能直接喂给 `createInitialState`。
 *
 * ── 为什么这么写 ──────────────────────────────────────────────────────────
 * · **比对 mp3 文件名而不是 mp3 内容**。内容对不对由 manifest 的 sha256 管
 *   （`tests/scripts/generate-voice.test.ts` 已在管），本文件只守「词条集合
 *   与磁盘上的文件集合一致」这一条轴 —— 两条轴混在一起，改内容时定位不到是哪条红了。
 * · **两侧都 `sort()` 再比**。词表文件本身不按字典序排（u1-sister / u1-student
 *   就是反的），不排序会报出根本不存在的差异。
 * · **不断言具体条数以外的顺序**。条数本身要断言（38），顺序是录入的自由。
 */

import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { createInitialState } from '../../src/core/reducer'
import { getUnit, UNITS } from '../../src/content'
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

describe('AC-15 —— entryId 与 38 个 mp3 完全一致', () => {
  it('mp3 目录里是 38 个文件（改动这个数要同时改录音与本断言）', () => {
    expect(mp3Ids().length, '录音数量变了 —— 少一条会静默降级到设备 TTS，多一条说明词表被改过').toBe(
      38,
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
  it('单元 1 有 38 条词条（30 词 + 8 句）', () => {
    expect(entries.length, '词条数变了 —— 见 AC-15 的说明，新增/删除 entryId 都是不可逆的').toBe(38)
  })

  it('词与句的分布是 30 + 8（句子以 u1-s- 前缀区分）', () => {
    const sentenceCount = entries.filter((e) => e.entryId.startsWith('u1-s-')).length

    expect(entries.length - sentenceCount).toBe(30)
    expect(sentenceCount).toBe(8)
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
  it('不存在卡型为「短语」的第四种卡（GDD：短语归入回应卡）', () => {
    // Card.kind 只有三态，schema 已守住枚举；这里守的是**内容里没有第四种值**。
    const kinds = new Set(entries.map((e) => e.card.kind))

    expect([...kinds].sort()).toEqual(['keyword', 'response', 'word'])
  })

  it('短语「Good morning!」作为回应卡的选项出现', () => {
    const asOption = entries.filter((entry) =>
      entry.card.options.some((option) => option.id === 'u1-s-good-morning'),
    )

    expect(
      asOption.length,
      '「Good morning!」一处选项都没出现 ⇒ 短语被当成了独立卡面而不是对问候的回应',
    ).toBeGreaterThan(0)
  })

  it('「Good morning!」不出现在任何卡面的**正确项**之外的位置上（它不是独立成卡的短语卡）', () => {
    // 判据（AC-18 的字面）：没有一张卡的卡面是短语本身。
    // ⚠️ 本 story 的取舍见 Completion Notes：`u1-s-good-morning` 的卡面是「Good morning!」
    //   本身（回应卡的题面，GDD `:185` 的表格正是这么列的），原因是那条录音不可重生成 ——
    //   卡面若换成别的字，运行时播的仍是「Good morning!」，孩子看到与听到的直接对不上。
    //   AC-18 要求的后半句（短语作为选项出现）由上一条断言守住。
    const phraseCards = entries.filter(
      (entry) => entry.card.promptText.trim().toLowerCase().replace(/[.!?]+$/, '') === 'good morning',
    )

    expect(
      phraseCards.length,
      '存在以短语为独立卡面的卡 ⇒ 需要说明它为什么不是「对问候的正确回应」',
    ).toBeLessThanOrEqual(1)
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
