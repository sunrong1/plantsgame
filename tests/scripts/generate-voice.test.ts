/**
 * scripts/generate-voice.ts 的静态守卫测试（Story 1.3 / AC-12）。
 *
 * ⚠️ 全部用例**不发起真实网络请求**：顶部的 fetch stub 一旦被调用就直接抛错，
 *    任何「以为自己在测纯函数、其实偷偷发了请求」的用例都会当场变红。
 *
 * ⚠️ 本脚本是顶层 `process.exit()` 的一次性脚本。副作用一律留在 `main()` 里，
 *    且 `main()` 只在被直接执行时才跑 —— 否则 import 本模块会把测试进程一起 exit 掉。
 *    顶层副作用是 1.2 之后被明确否决的写法（legacy 的 `static getInstance()`），
 *    本文件是它的第一次兑现。
 *
 * ⚠️ 测试要同时 import `src/services/pronunciation.ts` 与 `scripts/generate-voice.ts`，
 *    而 composite 项目要求「所有文件必须被列出」，所以 `tsconfig.test.json` 的
 *    include 额外加了 `scripts/` 目录（否则报 TS6307）。
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ENTRY_ID_PATTERN as RUNTIME_ENTRY_ID_PATTERN } from '../../src/services/pronunciation'
import { UNITS } from '../../src/content'
import { ENTRY_ID_PATTERN as CONTENT_ENTRY_ID_PATTERN } from '../../src/content/schema'
import { stripComments } from '../fixtures/strip-comments'
import {
  HISTORICAL_DEFAULTS,
  REQUEST_INTERVAL_MS,
  buildRequestBody,
  currentFingerprint,
  decideSkip,
  entriesFromContent,
  estimateCost,
  fingerprintDiff,
  fingerprintMatches,
  listVoiceMp3s,
  looksLikeMp3,
  main,
  normalizeFingerprint,
  parseManifest,
  parseRetryAfter,
  readApiKey,
  runBatch,
  writeFileAtomic,
  type RunDeps,
  type VoiceEntry,
  type VoiceManifest,
} from '../../scripts/generate-voice'

const REPO_ROOT = new URL('../../', import.meta.url)

/**
 * 真实词表 = 内容层（Story 1.6 起 `voice-entries.json` 已退役）。
 * 下面的「词表」断言全部改在这里取，不再读第二份文件。
 */
const contentEntries = (): VoiceEntry[] => entriesFromContent(UNITS)

/** 一套**不碰磁盘、不碰网络**的 runBatch 依赖；每个用例只覆写自己关心的那几项。 */
const makeDeps = (over: Partial<RunDeps> = {}): RunDeps => ({
  apiKey: 'sk-test-key',
  outputDir: '/nonexistent-output-dir',
  dry: false,
  force: false,
  requestIntervalMs: 0,
  fetchImpl: (async () => {
    throw new Error('测试中不应发起网络请求')
  }) as unknown as typeof fetch,
  // 存在性判定默认全为 false（新词条）；skip 用例自行覆写。
  fileExists: () => false,
  writeFile: () => undefined,
  sleep: async () => undefined,
  log: () => undefined,
  error: () => undefined,
  timeoutSignal: () => new AbortController().signal,
  // 默认哈希恒为 'sha-default'，让 manifest 用例能用一致的值登记/核对。
  hashFile: () => 'sha-default',
  fileSize: () => 23,
  writeManifest: () => undefined,
  manifest: null,
  ...over,
})

/**
 * 一段最小的合法 mp3 字节：`ID3` 帧头 + 填充。
 * 必须够长（≥16 字节）—— 生产侧的 `looksLikeMp3` 会按真实 mp3 的样子校验，
 * 用例喂一个 3 字节的假载荷等于绕过被守卫的那道闸。
 */
const mp3Hex = (): string => '494433' + '00'.repeat(20)

/** 造一个 HTTP 层与业务层都成功的合成响应。 */
const okHexResponse = (audio: string = mp3Hex()): Response =>
  ({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => ({
      base_resp: { status_code: 0, status_msg: 'success' },
      data: { audio },
    }),
  }) as unknown as Response

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('词表 id 与运行时契约的对齐（AC-2）', () => {
  it('内容层的 id 规则是运行时规则的严格超集（不是逐字相同的同一份）', () => {
    // ⚠️ 两份正则**故意不一样**，职责也不同，别把它们「统一」成一份：
    //   · 运行时（pronunciation.ts）：只管「这个 id 会被拼进 URL」⇒ 禁 `/`、`.`、大写，
    //     对有没有单元前缀**不表态** —— 运行时不该管命名约定。
    //   · 内容层（schema.ts / AR29）：额外要求 `u<N>-` 前缀。
    // 因此真正的不变量是**包含关系**而不是相等：内容层放行的 id，运行时必须也认 ——
    // 否则症状是「录了音、文件名却过不了运行时的路径校验，被静默跳过」。
    for (const id of ['u1-dog', 'u1-good-afternoon', 'u1-s-how-are-you', 'u1-s-nice-to-meet-you']) {
      expect(CONTENT_ENTRY_ID_PATTERN.test(id), `${id} 应当是合法的内容层 id`).toBe(true)
      expect(
        RUNTIME_ENTRY_ID_PATTERN.test(id),
        `${id} 内容层放行、运行时却拒绝 ⇒ 它的录音永远不会被读取（静默降级到设备 TTS）`,
      ).toBe(true)
    }

    // 反向不成立是**正确的**：运行时不要求前缀，方向反了才是 bug。
    expect(
      RUNTIME_ENTRY_ID_PATTERN.test('dog'),
      '运行时突然要求单元前缀了 —— 那是内容层/AR29 的职责，运行时的职责只是 URL 安全',
    ).toBe(true)
    expect(
      RUNTIME_ENTRY_ID_PATTERN.test('../config'),
      '运行时不再挡目录穿越 ⇒ id 会被拼成目录外的路径',
    ).toBe(false)
    expect(
      CONTENT_ENTRY_ID_PATTERN.test('../config'),
      '内容层不再挡目录穿越 ⇒ 人工录入的一个 ../ 就能打穿 URL',
    ).toBe(false)
  })

  it('内容层每条 id 都合法（能被运行时的规则匹配上）', () => {
    const entries = contentEntries()
    expect(entries.length, '词表是空的 —— 没有任何录音可生成').toBeGreaterThan(0)
    for (const e of entries) {
      expect(
        RUNTIME_ENTRY_ID_PATTERN.test(e.id),
        `词条 id 非法：${e.id} —— 运行时会跳过它、于是这个词永远只有设备 TTS 的发音`,
      ).toBe(true)
    }
  })

  it('词表里每条 id 都带单元前缀（u<N>- 开头）', () => {
    // 录音目录 audio/voice/ 是平铺的、不按单元分层。id 不带前缀时，
    // 单元 2 的 `dog` 会覆盖单元 1 的 `u1-dog.mp3` —— 某个词发错音，且没有任何报错。
    for (const e of contentEntries()) {
      expect(
        /^u\d+-/.test(e.id),
        `词条 id 缺单元前缀：${e.id} —— 跨单元同名词会撞名覆盖录音`,
      ).toBe(true)
    }
  })

  it('词表 id 不重复', () => {
    const ids = contentEntries().map((e) => e.id)
    expect(new Set(ids).size, '词表里有重复 id —— 会互相覆盖，生成结果只保留最后一个').toBe(
      ids.length,
    )
  })

  it('词表同时覆盖三种卡型（AC-2 移交 1.6 的对齐要求）', () => {
    const texts = contentEntries().map((e) => e.text)
    const words = texts.filter((t) => !t.endsWith('?') && !t.includes(' '))
    const sentences = texts.filter((t) => t.includes(' '))
    expect(words.length, '没有单词卡题面 —— 三型链路少一型').toBeGreaterThan(0)
    expect(sentences.length, '没有长句题面 —— 关键词卡无法试听').toBeGreaterThan(0)
    // ⚠️ **2026-10-26 换源批次（Story 2.10）改判据**：教材版单元 1/2 的回应卡题面是
    //   **感叹句**（`Hello!` / `Goodbye!` / `How nice!`），整份词表里**一个问号都没有** ⇒
    //   原来那条「文本里必须含 `?`」的代理判据，红在一个**已经不存在的事实**上
    //   （它守的是「旧自建词表里有问句」，不是「三型都有录音」）。
    //   ⇒ 改成直接判**卡型覆盖**（判据本体 = 内容层的 `kind` 字段）：三型中任一型
    //     缺席都会红，而且**不再依赖题面的标点** —— 比原来的文本启发式**更严**
    //     （旧判据只要求「有一个问句」，新判据要求「三型都在」）。
    const kinds = new Set(UNITS.flatMap((u) => u.entries.map((e) => e.card.kind)))
    for (const kind of ['word', 'keyword', 'response'] as const) {
      expect(kinds.has(kind), `词表里没有 ${kind} 卡的题面 —— 这一型没有录音`).toBe(true)
    }
  })

  it('entriesFromContent 对跨单元同名的 id 抛错（deferred-work 117-125 的正面回击）', () => {
    // 这正是当年被延后的那条：单元内唯一由 Zod 守，但**跨单元**同名只有生成侧看得见，
    // 而录音目录是平铺的 —— 撞名就是某个词发错音，且没有任何报错。
    const units = [
      { unitNumber: 1, entries: [{ entryId: 'u1-dog', card: { promptText: 'dog' } }] },
      { unitNumber: 2, entries: [{ entryId: 'u1-dog', card: { promptText: 'dog' } }] },
    ]
    expect(
      () => entriesFromContent(units),
      '跨单元同名 id 被放行 ⇒ 两个 mp3 抢同一个文件名，一个孩子的词发成另一个',
    ).toThrow(/u1-dog/)
  })

  it('entriesFromContent 对空卡面抛错（会合成一段静默的 mp3）', () => {
    const units = [{ unitNumber: 1, entries: [{ entryId: 'u1-dog', card: { promptText: '  ' } }] }]
    expect(() => entriesFromContent(units)).toThrow(/u1-dog/)
  })

  it('entriesFromContent 对空内容抛错（不是「安静地生成 0 条」而是报错）', () => {
    expect(() => entriesFromContent([])).toThrow()
  })

  it('entriesFromContent 的输出与内容层的卡面逐字一致（录的就是孩子看到的那句）', () => {
    const byId = new Map(UNITS.flatMap((u) => u.entries.map((e) => [e.entryId, e.card.promptText])))
    for (const e of contentEntries()) {
      expect(
        e.text,
        `${e.id} 录的文本与卡面不一致 ⇒ 孩子看到的字与听到的声音对不上`,
      ).toBe(byId.get(e.id))
    }
  })
})

describe('--dry 费用预估（AC-5）', () => {
  it('0 字符估 0 元', () => {
    expect(estimateCost(0)).toBe(0)
  })

  it('1 万字符估 3.5 元（speech-2.8-hd 国内站按量价）', () => {
    expect(estimateCost(10_000)).toBe(3.5)
  })

  it('费用按字符数线性折算', () => {
    expect(estimateCost(5_000)).toBe(1.75)
    expect(estimateCost(250)).toBeCloseTo(0.0875, 6)
  })
})

describe('合成请求体（AC-4）', () => {
  it('output_format 必须是 hex，不得是 url', () => {
    // url 返回的链接 24 小时过期。分批生成会在几天后静默拿到损坏文件 ——
    // 而损坏的 mp3 在运行时只会表现为「设备 TTS 偶尔音色不对」，极难归因。
    const body = buildRequestBody('dog')
    expect(body.output_format, '改成 url 等于给跨批次生成埋一个静默损坏的雷').toBe('hex')
  })

  it('请求体带上音色、模型与语速', () => {
    const body = buildRequestBody('dog')
    expect(body.model).toBe('speech-2.8-hd')
    expect(body.voice_setting.voice_id).toBe('English_LovelyGirl')
    expect(body.voice_setting.speed).toBe(0.9)
    expect(body.stream, '流式响应不在本脚本的处理范围内').toBe(false)
  })

  it('音高只有一个事实源：请求体里的 pitch 必须与指纹里的 pitch 同源（AC-6）', () => {
    // ⚠️ 判据里**不许**出现第二份数值（R-37）：不写 `toBe(0)`，只与 `currentFingerprint()` 对。
    //   改了 `VOICE_PITCH` 的取值时，这条会自动跟着走，不会变成「悄悄漂移的第二份事实源」。
    const body = buildRequestBody('dog')
    const cur = currentFingerprint()
    const sent = body.voice_setting.pitch

    if (cur.pitch === 0) {
      // 默认态**不把该字段发出去** —— 这样请求体与产出已提交 17 条录音时**逐字节相同**，
      // 「已提交的录音仍是当前脚本能复现的产物」这句话才不依赖 TTS 的随机性
      // （2026-10-25 实测：TTS 无 seed，同一请求体发两次的响应音频也不相同）。
      expect(
        sent,
        '默认态把 pitch 发了出去 ⇒ 请求体与产出已提交那 17 条时不再逐字节相同，那批录音的来源就说不清了',
      ).toBeUndefined()
    } else {
      expect(
        sent,
        '请求体的音高与指纹不一致 ⇒ 录出来的音频与 manifest 记的不是同一组参数（混批且无从察觉）',
      ).toBe(cur.pitch)
    }
  })
})

describe('--dry 路径零网络请求（AC-5）', () => {
  it('跑完整份词表的 dry 不调用 fetch', async () => {
    let fetchCalls = 0
    const deps = makeDeps({
      dry: true,
      fetchImpl: (async () => {
        fetchCalls += 1
        throw new Error('测试中不应发起网络请求')
      }) as unknown as typeof fetch,
    })
    const entries = contentEntries()

    const result = await runBatch(entries, deps)

    expect(fetchCalls, '--dry 发起了网络请求 —— 用户只想看账单，却真的花了钱').toBe(0)
    expect(result.generated, '--dry 不该生成任何文件').toBe(0)
    expect(result.failures, '--dry 不该有失败项').toEqual([])
  })

  it('dry 的预估总额与逐条费用之和一致', async () => {
    let totalPrinted = 0
    const deps = makeDeps({
      dry: true,
      log: (msg: string) => {
        const m = /总计.*?¥([0-9.]+)/.exec(msg)
        if (m?.[1]) totalPrinted = Number(m[1])
      },
    })
    const entries = contentEntries()

    await runBatch(entries, deps)

    const expected = entries.reduce((sum, e) => sum + e.text.length, 0)
    expect(totalPrinted, '--dry 没打出总计 —— 用户看不到这次要花多少钱').toBeCloseTo(
      estimateCost(expected),
      6,
    )
  })
})

describe('断点续传（AC-6）', () => {
  it('已存在的 mp3 被跳过，不发请求、不重写盘', async () => {
    let fetchCalls = 0
    let writes = 0
    const deps = makeDeps({
      fileExists: () => true,
      writeFile: () => {
        writes += 1
      },
      fetchImpl: (async () => {
        fetchCalls += 1
        return okHexResponse()
      }) as unknown as typeof fetch,
    })

    const result = await runBatch([{ id: 'u1-dog', text: 'dog' }], deps)

    expect(result.skipped, '已存在的文件没有走 skip —— 断点续传没生效，等于重复计费').toBe(1)
    expect(fetchCalls, '已存在的文件仍发起了请求 —— 白花钱').toBe(0)
    expect(writes, '已存在的文件被重写了').toBe(0)
    expect(result.generated).toBe(0)
  })

  it('跳过判定只认正式名，不认 .tmp（半截文件不得被当成已生成）', async () => {
    // 写盘是「先写 <id>.mp3.tmp 再 rename」。若 existsSync 把 .tmp 也当成功，
    // 一次 Ctrl-C 撞在写一半就会留下一个**永久跳过**的截断 mp3 —— 而它播不出声。
    const seen: string[] = []
    const deps = makeDeps({
      fileExists: (p: string) => {
        seen.push(p)
        return false
      },
      fetchImpl: (async () => okHexResponse()) as unknown as typeof fetch,
    })

    await runBatch([{ id: 'u1-dog', text: 'dog' }], deps)

    for (const p of seen) {
      expect(p, `存在性判定查了临时文件 ${p} —— 截断的 mp3 会被当成已生成`).not.toMatch(/\.tmp$/)
    }
  })

  it('全量跑完再删掉 3 个重跑：只有那 3 个重新生成', async () => {
    const dir = '/out'
    const p = (id: string): string => `${dir}/${id}.mp3`
    const present = new Set<string>()
    const deps = makeDeps({
      outputDir: dir,
      fileExists: (path: string) => present.has(path),
      writeFile: (path: string) => {
        present.add(path)
      },
      fetchImpl: (async () => okHexResponse()) as unknown as typeof fetch,
    })
    const entries: VoiceEntry[] = [
      { id: 'u1-dog', text: 'dog' },
      { id: 'u1-cat', text: 'cat' },
      { id: 'u1-bird', text: 'bird' },
      { id: 'u1-fish', text: 'fish' },
      { id: 'u1-one', text: 'one' },
    ]

    const first = await runBatch(entries, deps)
    expect(first.generated).toBe(5)

    // 模拟三个文件被删：present 是存在性判定的唯一依据。
    present.clear()
    present.add(p('u1-dog'))
    present.add(p('u1-cat'))
    present.add(p('u1-one'))

    const second = await runBatch(entries, deps)
    expect(second.generated, '删掉 3 个后应只补这 3 个').toBe(2)
    expect(second.skipped, '其余 2 个应走 skip').toBe(3)
  })
})

describe('写盘（AC-4）', () => {
  it('hex 字符串解码成二进制后再写盘', async () => {
    const written: { path: string; data: Buffer }[] = []
    const deps = makeDeps({
      writeFile: (p: string, data: Buffer) => {
        written.push({ path: p, data })
      },
      fetchImpl: (async () => okHexResponse()) as unknown as typeof fetch,
    })

    await runBatch([{ id: 'u1-dog', text: 'dog' }], deps)

    expect(written.length, '没有写盘 —— 录音没落盘').toBe(1)
    expect(written[0]!.path).toMatch(/u1-dog\.mp3$/)
    // '494433' 解码是 ASCII 的 'ID3'，也就是 mp3 的帧头。写成字符串就全是乱码字节。
    expect(written[0]!.data.subarray(0, 3).toString('ascii')).toBe('ID3')
  })

  it('文件名不带单元分层目录（audio/voice/ 是平铺的）', async () => {
    const written: string[] = []
    const deps = makeDeps({
      writeFile: (p: string) => {
        written.push(p)
      },
      fetchImpl: (async () => okHexResponse()) as unknown as typeof fetch,
    })

    await runBatch([{ id: 'u1-dog', text: 'dog' }], deps)

    expect(written[0], '录音路径与词图分层不一致 —— 运行时按平铺目录找，必然 404').not.toMatch(
      /unit-0?1[\\/]/,
    )
  })
})

describe('重试上限与失败清单（AC-7）', () => {
  it('网络错误重试到上限后进失败清单', async () => {
    let calls = 0
    const deps = makeDeps({
      fetchImpl: (async () => {
        calls += 1
        throw new Error('ECONNRESET')
      }) as unknown as typeof fetch,
    })

    const result = await runBatch([{ id: 'u1-dog', text: 'dog' }], deps)

    expect(calls, '网络错误没有重试 —— 一次抖动就毁掉整批').toBe(3)
    expect(result.failures.length, '失败清单为空 —— 脚本会以成功退出，缺口无人知晓').toBe(1)
    expect(result.failures[0]!.id).toBe('u1-dog')
    expect(result.generated).toBe(0)
  })

  it('业务错误（4xx / base_resp 非 0）不重试', async () => {
    // 对着无效的 key 重试 3 次只是浪费 3 次配额 —— 4xx 重试永远不会变对。
    let calls = 0
    const deps = makeDeps({
      fetchImpl: (async () => {
        calls += 1
        return {
          ok: false,
          status: 401,
          headers: new Headers(),
          json: async () => ({ base_resp: { status_code: 1004, status_msg: 'invalid api key' } }),
        }
      }) as unknown as typeof fetch,
    })

    const result = await runBatch([{ id: 'u1-dog', text: 'dog' }], deps)

    expect(calls, '4xx 被当可重试错误 —— 白烧 3 次配额').toBe(1)
    expect(result.failures[0]!.code, '失败项没有带出 API 错误码 —— 无从判断是 key 坏了还是音色下架').toBe(
      '1004',
    )
  })

  it('HTTP 5xx 会重试', async () => {
    let calls = 0
    const deps = makeDeps({
      fetchImpl: (async () => {
        calls += 1
        return {
          ok: false,
          status: 503,
          headers: new Headers(),
          json: async () => ({ base_resp: { status_code: -1, status_msg: 'server busy' } }),
        }
      }) as unknown as typeof fetch,
    })

    await runBatch([{ id: 'u1-dog', text: 'dog' }], deps)

    expect(calls, '5xx 没有重试 —— 瞬时故障被当成永久失败').toBe(3)
  })

  it('音色不可用（业务错误）立即中止整批，不空跑剩下的词条', async () => {
    // AC-3：音色一致性是本 story 的全部价值所在。音色/key 一旦不可用，
    // 后面每一条都会以同样的方式失败 —— 继续跑只是白烧配额、还多出一堆噪声错误。
    let calls = 0
    const deps = makeDeps({
      fetchImpl: (async () => {
        calls += 1
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            base_resp: { status_code: 1004, status_msg: 'voice not found' },
            data: { audio: '' },
          }),
        }
      }) as unknown as typeof fetch,
    })

    const result = await runBatch(
      [
        { id: 'u1-dog', text: 'dog' },
        { id: 'u1-cat', text: 'cat' },
        { id: 'u1-bird', text: 'bird' },
      ],
      deps,
    )

    expect(calls, '音色不可用后仍继续请求 —— 把同一个错误重复了 N 遍').toBe(1)
    expect(result.failures.length).toBe(1)
    expect(result.generated).toBe(0)
  })

  it('限流（业务码 1002）按可重试处理，不中止整批', async () => {
    // 实跑教训（2026-10-13）：单元 1 的 38 条在间隔 0 时，第 24 条就撞上 60 RPM，
    // 拿到 1002。若把所有业务错误都判成不可重试，整批会在第 24 条直接夭折 ——
    // 而限流是**瞬时**故障，退避后必然能过去。
    let calls = 0
    const written: string[] = []
    const deps = makeDeps({
      writeFile: (p: string) => {
        written.push(p)
      },
      fetchImpl: (async () => {
        calls += 1
        if (calls <= 2) {
          return {
            ok: true,
            status: 200,
            headers: new Headers(),
            json: async () => ({
              base_resp: { status_code: 1002, status_msg: 'rate limit exceeded(RPM)' },
              data: { audio: '' },
            }),
          }
        }
        return okHexResponse()
      }) as unknown as typeof fetch,
    })

    const result = await runBatch(
      [
        { id: 'u1-dog', text: 'dog' },
        { id: 'u1-cat', text: 'cat' },
      ],
      deps,
    )

    // dog 撞两次限流、第 3 次成功，再加 cat 的 1 次 = 4。MAX_ATTEMPTS=3 时的确定值。
    expect(calls, '限流没有被重试 —— 整批在撞到限流的位置直接夭折').toBe(4)
    expect(result.failures, '限流被当成永久失败 —— 其实退避一下就能过').toEqual([])
    expect(written.length, '限流之后的词条没被生成').toBe(2)
  })

  it('默认请求间隔把请求速率守在 60 RPM 之内（词表变长不改变这条）', () => {
    // 官方 HD 系列限 60 RPM。间隔为 0 时单元 1 实测就在第 24 条撞墙（见上一条用例）。
    expect(
      REQUEST_INTERVAL_MS,
      '请求间隔为 0 —— 单元 1 的量级就会撞上 60 RPM（Epic 2 需调成 ~1100ms 以上）',
    ).toBeGreaterThan(0)
    // ⚠️ 2026-10-23（Story 2.5）改判：原断言写的是「**一个 60 秒窗口内能发完整个词表**」
    //   （`60_000 / REQUEST_INTERVAL_MS >= entries.length`）——
    //   它守的其实是**批时长**，而**限流守的是速率**。
    //   Story 2.5 把词表从 38 条加到 75 条后，`40 >= 75` ⇒ 这条断言红了，
    //   而**实际请求速率一次都没变**（40 次/分 < 60 次/分，一分钟窗口发不完不构成限流）。
    //   ⇒ 改成守**速率本身**：每分钟发出的请求数 ≤ 60。
    //   ⚠️ 批时长随词表线性增长（75 条 × 1.5s ≈ 113 秒）—— 那是「全量重生成要等两分钟」的实话，
    //   **不是**限流；两件事分开说，别再混成一条断言。
    expect(
      60_000 / REQUEST_INTERVAL_MS,
      '按默认间隔每分钟发出的请求数 > 60 —— 必然限流',
    ).toBeLessThanOrEqual(60)
  })

  it('某条失败不影响其余词条（已成功的文件全部保留）', async () => {
    let calls = 0
    const written: string[] = []
    const deps = makeDeps({
      writeFile: (p: string) => {
        written.push(p)
      },
      fetchImpl: (async () => {
        calls += 1
        if (calls <= 3) throw new Error('ECONNRESET')
        return okHexResponse()
      }) as unknown as typeof fetch,
    })

    const result = await runBatch(
      [
        { id: 'u1-dog', text: 'dog' },
        { id: 'u1-cat', text: 'cat' },
      ],
      deps,
    )

    expect(written.length, '一条失败拖垮了整批 —— 断点续传语义要求只补失败的').toBe(1)
    expect(result.failures.length).toBe(1)
    expect(result.generated).toBe(1)
  })
})

describe('原子写盘（AC-6 的隐藏地雷）', () => {
  // 用例落到真实临时目录 —— 「写到一半被杀会留下什么」这件事，
  // 只有真的写一次磁盘才看得见，纯 mock 测不到。
  let dir = ''

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'voice-test-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('先写 <target>.tmp，再 rename 成正式名', () => {
    // ⚠️ 这条是上一批变异验证逼出来的：只断言「写完后没有 .tmp 残留」的话，
    // 把 writeFileAtomic 退化成「直接写正式名」一样全绿 —— 因为压根没有临时文件。
    // 能咬住退化的只有一条：**写入的第一落点必须是 .tmp**，正式名只由 rename 产生。
    const writes: string[] = []
    const renames: { from: string; to: string }[] = []
    const target = join(dir, 'u1-dog.mp3')

    writeFileAtomic(target, Buffer.from('ID3'), {
      writeFileSync: (p) => {
        writes.push(p)
      },
      renameSync: (from, to) => {
        renames.push({ from, to })
      },
    })

    expect(writes, '第一落点是正式名 —— 写到一半被杀就会留下一个被永久 skip 的截断 mp3').toEqual([
      `${target}.tmp`,
    ])
    expect(renames, '没有改名 —— 正式名不是由原子 rename 产生的').toEqual([
      { from: `${target}.tmp`, to: target },
    ])
  })

  it('写到一半失败时，正式名不出现', () => {
    // 这是续传语义真正依赖的不变量：崩溃后要么有完整录音，要么什么都没有，
    // 绝不能有一个「看起来存在」的截断文件。
    const target = join(dir, 'u1-dog.mp3')
    const partial = {
      writeFileSync: (p: string) => {
        writeFileSync(p, 'ID3-truncated') // 只写了一半就「断电」
        throw new Error('ENOSPC')
      },
      renameSync: () => {
        throw new Error('不该走到 rename')
      },
    }

    expect(() => writeFileAtomic(target, Buffer.from('complete'), partial)).toThrow('ENOSPC')
    expect(
      existsSync(target),
      '半截内容落在了正式名上 —— 下次跑会被 existsSync 当成已生成，永久跳过',
    ).toBe(false)
  })

  it('写完后正式名是完整内容，临时名不残留', () => {
    const target = join(dir, 'u1-dog.mp3')
    writeFileAtomic(target, Buffer.from('ID3-audio'))

    expect(readFileSync(target).toString('utf8')).toBe('ID3-audio')
    expect(
      existsSync(`${target}.tmp`),
      '临时文件残留 —— 下次跑会被当成半截成品留在盘上',
    ).toBe(false)
  })

  it('覆盖已有录音时同样不留临时文件', () => {
    const target = join(dir, 'u1-dog.mp3')
    writeFileSync(target, '旧内容')
    writeFileAtomic(target, Buffer.from('新内容'))

    expect(readFileSync(target).toString('utf8')).toBe('新内容')
    expect(existsSync(`${target}.tmp`)).toBe(false)
  })

  it('遗留的半截 .tmp 不会被续传当成已生成', () => {
    // 这是本 story 最隐蔽的一个坑：跳过判据是 existsSync。若上一次运行在
    // writeFileSync 写到一半时被杀（Ctrl-C / 断电 / 磁盘满），盘上会留下一个
    // 截断的 mp3 —— 而它**看起来是存在的**，下次跑会被永久 skip。
    // 后果完全静默：运行时 new Audio() 收到 error 事件，降级到设备 TTS，
    // 孩子听到的只是「音色不对」，没有任何报错指向这个文件。
    const target = join(dir, 'u1-dog.mp3')
    writeFileSync(`${target}.tmp`, 'ID3-truncated')

    // 本用例只锁「正式名不存在」这一条事实 —— 正式名不存在就必须重新生成。
    expect(existsSync(target), '正式名居然存在 —— 那就不是续传要处理的场景').toBe(false)
    expect(existsSync(`${target}.tmp`)).toBe(true)

    writeFileAtomic(target, Buffer.from('ID3-complete'))
    expect(readFileSync(target).toString('utf8')).toBe('ID3-complete')
  })
})

describe('CLI 入口的退出码（AC-1 / AC-8）', () => {
  it('--dry 在没有 key 时仍返回 0（干净 clone 上要先看账单）', async () => {
    const code = await main(['--dry'], {})
    expect(code, '--dry 不发请求，key 不是它的前提 —— 要求 key 会让 AC-1 的「退出码 0」落空').toBe(0)
  })

  it('--dry 不在产物目录里写任何东西', async () => {
    // ⚠️ 判据是「文件集合不变」，不是「目录不存在」—— 目录会被真实生成创建，
    //    拿存在性当判据的用例会随开发进度随机变红，且测不到 dry 真正想守的东西。
    const dir = new URL('public/assets/audio/voice/', REPO_ROOT)
    const snapshot = (): string =>
      existsSync(dir) ? readdirSync(dir).sort().join(',') : ''

    const before = snapshot()
    const code = await main(['--dry'], {})
    const after = snapshot()

    expect(code).toBe(0)
    expect(after, '--dry 动了产物目录 —— 预估模式写了文件').toBe(before)
  })

  it('真跑时缺 key 返回非 0', async () => {
    const code = await main([], {})
    expect(code, '缺 key 静默继续 —— 用户只会看到「成功」但一个文件都没有').toBe(1)
  })

  it('未知参数返回非 0 并说明用法', async () => {
    const code = await main(['--dry-run'], {})
    expect(code).toBe(1)
  })
})

describe('API key 的处理（AC-8）', () => {
  it('key 缺失时抛错', () => {
    expect(() => readApiKey({}), 'key 缺失时静默跳过 —— 用户只会看到「生成成功但一个文件都没有」').toThrow(
      /MINIMAX_API_KEY/,
    )
  })

  it('key 缺失时的错误信息里不含任何环境变量的值', () => {
    // key 会被写进 Authorization 头；异常对象里可能带着请求头，
    // 一旦被 console.error(err) 整对象打出去，key 就进了 CI 日志。
    let msg = ''
    try {
      readApiKey({ MINIMAX_API_KEY: '' })
    } catch (err) {
      msg = err instanceof Error ? err.message : String(err)
    }
    expect(msg, '空字符串的 key 被当成了有效 key —— 会带着空 Bearer 去打 API').not.toBe('')
    expect(msg).toMatch(/MINIMAX_API_KEY/)
  })

  it('读得到 key', () => {
    expect(readApiKey({ MINIMAX_API_KEY: 'sk-abc' })).toBe('sk-abc')
  })

  it('纯空白 key 视为缺失', () => {
    expect(() => readApiKey({ MINIMAX_API_KEY: '   ' })).toThrow(/MINIMAX_API_KEY/)
  })
})
// ═══════════════════════════════════════════════════════════════════════════
// [CR] 2026-10-13 补丁的守卫用例
//
// 这些用例守的都是「文件存在 ≠ 文件正确」这一条。原实现把 existsSync 当成
// 已完成的证据，于是：一个 0 字节 / 损坏的 mp3 会被永久 skip；改了音色或语速
// 之后重跑会报「跳过 N 条」而一个都不重生成；换组参数生成的旧录音被当成
// 现有产物继续用。三种失效都不报错，且都发生在孩子耳朵里。
// ═══════════════════════════════════════════════════════════════════════════

describe('音频载荷的有效性校验（[CR] P1）', () => {
  it('纯空白 hex 不被当成有效音频', () => {
    // `Buffer.from('   ', 'hex')` 静默返回空 Buffer —— 不校验就会写出 0 字节 mp3。
    expect(looksLikeMp3(Buffer.from('   ', 'hex'))).toBe(false)
    expect(looksLikeMp3(Buffer.alloc(0))).toBe(false)
  })

  it('短于最小长度的载荷不算 mp3', () => {
    expect(looksLikeMp3(Buffer.from('494433', 'hex')), '3 字节的 ID3 不是可播放的 mp3').toBe(false)
  })

  it('ID3 帧头与 MPEG 同步字都认', () => {
    expect(looksLikeMp3(Buffer.from(mp3Hex(), 'hex')), '合法的 ID3 帧头被误判成垃圾').toBe(true)
    // 0xFF 0xFB = MPEG1 Layer III 帧头
    expect(looksLikeMp3(Buffer.from('fffb' + '00'.repeat(20), 'hex'))).toBe(true)
  })

  it('随机二进制不被当成 mp3', () => {
    const junk = Buffer.alloc(40)
    for (let i = 0; i < junk.length; i += 1) junk[i] = (i * 37 + 11) % 256
    expect(looksLikeMp3(junk)).toBe(false)
  })

  it('解码后不像 mp3 的响应不写盘，并进失败清单', async () => {
    const written: string[] = []
    const deps = makeDeps({
      // '   ' 是合法 hex 解码器不拒绝、却产出 0 字节的输入。
      fetchImpl: (async () => okHexResponse('   ')) as unknown as typeof fetch,
      writeFile: (path) => written.push(path),
    })

    const result = await runBatch([{ id: 'u1-dog', text: 'dog' }], deps)

    expect(written, '0 字节的 mp3 被写进了正式名 —— 它会被续传永久 skip').toEqual([])
    expect(result.generated).toBe(0)
    expect(result.failures[0]?.code, '失败原因应指到载荷而不是网络').toMatch(/BAD_HEX|BAD_AUDIO/)
  })

  it('奇数长度的 hex 被判为畸形', async () => {
    const deps = makeDeps({
      fetchImpl: (async () => okHexResponse('abc')) as unknown as typeof fetch,
      writeFile: () => {
        throw new Error('畸形 hex 不该走到写盘')
      },
    })

    const result = await runBatch([{ id: 'u1-dog', text: 'dog' }], deps)
    expect(result.failures[0]?.code).toBe('BAD_HEX')
  })
})

describe('请求超时（[CR] P2）', () => {
  it('每次请求都带上中止信号', async () => {
    let seen: AbortSignal | undefined
    const deps = makeDeps({
      fetchImpl: (async (_url: unknown, init: { signal?: AbortSignal }) => {
        seen = init.signal
        return okHexResponse()
      }) as unknown as typeof fetch,
    })

    await runBatch([{ id: 'u1-dog', text: 'dog' }], deps)

    expect(seen, 'fetch 没收到 signal —— 挂死的 socket 会把整批冻住，只能 Ctrl-C').toBeDefined()
    expect(seen?.aborted).toBe(false)
  })
})

describe('限流处理（[CR] P3）', () => {
  it('HTTP 429 按可重试处理', async () => {
    let calls = 0
    const deps = makeDeps({
      fetchImpl: (async () => {
        calls += 1
        if (calls === 1) {
          return {
            ok: false,
            status: 429,
            headers: new Headers(),
            json: async () => ({ base_resp: { status_code: 1002, status_msg: 'rate limited' } }),
          } as unknown as Response
        }
        return okHexResponse()
      }) as unknown as typeof fetch,
    })

    const result = await runBatch([{ id: 'u1-dog', text: 'dog' }], deps)

    expect(calls, 'HTTP 429 没有重试 —— 网关层限流会让整批直接夭折').toBe(2)
    expect(result.generated).toBe(1)
  })

  it('Retry-After 秒数被解析成毫秒', () => {
    expect(parseRetryAfter('7'), 'Retry-After: 7 表示等 7 秒').toBe(7000)
  })

  it('Retry-After 的 HTTP-date 形式也能解析', () => {
    const now = Date.parse('2026-10-13T00:00:00Z')
    expect(parseRetryAfter('Tue, 13 Oct 2026 00:00:30 GMT', now)).toBe(30_000)
  })

  it('缺失或畸形时不臆造等待时长', () => {
    expect(parseRetryAfter(null)).toBeUndefined()
    expect(parseRetryAfter('')).toBeUndefined()
    expect(parseRetryAfter('soon')).toBeUndefined()
  })

  it('退避采用服务端给的时长，而不是固定 1s/2s', async () => {
    const slept: number[] = []
    const deps = makeDeps({
      sleep: async (ms) => {
        slept.push(ms)
      },
      fetchImpl: (async () => {
        return {
          ok: false,
          status: 429,
          headers: new Headers({ 'Retry-After': '9' }),
          json: async () => ({ base_resp: { status_code: 1002, status_msg: 'rate limited' } }),
        } as unknown as Response
      }) as unknown as typeof fetch,
    })

    await runBatch([{ id: 'u1-dog', text: 'dog' }], deps)

    expect(slept[0], '服务端要等 9 秒，脚本却按固定 1 秒重试 —— 会持续撞限流线').toBe(9000)
  })
})

describe('溯源 manifest（[CR] P6）', () => {
  it('指纹与当前常量一致', () => {
    expect(
      fingerprintMatches({ fingerprint: currentFingerprint(), entries: {} }),
      '指纹比对失效 —— 常量变了也认不出来，等于没有这道闸',
    ).toBe(true)
  })

  it('语速变了就判为不匹配，并说清变了什么', () => {
    const stale = { fingerprint: { ...currentFingerprint(), speed: 1.2 }, entries: {} }
    expect(fingerprintMatches(stale), '改了语速却仍认成同一批录音 —— 改参数会静默失效').toBe(false)
    expect(fingerprintDiff(stale)).toMatch(/speed/)
  })

  it('manifest 读不出来时返回 null，而不是让脚本崩掉', () => {
    expect(parseManifest(null), '首次运行时没有 manifest，不该因此崩掉').toBeNull()
    expect(parseManifest('not json')).toBeNull()
    expect(parseManifest('{"foo":1}')).toBeNull()
  })

  it('哈希一致才跳过', () => {
    const manifest = {
      fingerprint: currentFingerprint(),
      entries: { 'u1-dog': { text: 'dog', sha256: 'sha-default', bytes: 23 } },
    }
    expect(decideSkip('u1-dog', true, () => 'sha-default', '/x', manifest, 'dog').reason).toBe(
      'verified',
    )
  })

  it('哈希对不上就重新生成，不跳过', () => {
    // 这是原实现最大的洞：半截 mp3、被手工改过的文件，只看「在不在」。
    const manifest = {
      fingerprint: currentFingerprint(),
      entries: { 'u1-dog': { text: 'dog', sha256: 'sha-expected', bytes: 23 } },
    }
    const d = decideSkip('u1-dog', true, () => 'sha-actual', '/x', manifest, 'dog')
    expect(d.reason).toBe('corrupt')
    expect(d.skip, '内容不符却跳过 —— 一个播不出声的 mp3 被永久认定完成').toBe(false)
  })

  it('磁盘上没有就重新生成', () => {
    expect(decideSkip('u1-dog', false, () => '', '/x', null, 'dog').skip).toBe(false)
  })

  it('无 manifest 时仍跳过已有文件（首次运行不烧配额）', () => {
    expect(decideSkip('u1-dog', true, () => '', '/x', null, 'dog').reason).toBe('unrecorded')
  })

  it('卡面文本与录音溯源记录不一致 ⇒ 重新录音，不跳过', () => {
    // ⚠️ [CR] 2026-10-14 补的洞：原先 `decideSkip` 根本不接收文本，
    //   只比 sha256。于是把 `promptText` 从 "dog" 改成 "Dog!" 之后，
    //   mp3 一个字节没动、哈希照样对得上 ⇒ `verified` ⇒ 跳过，
    //   录音从此与卡面永久对不上，且**没有任何测试会红**。
    //   （「文件存在 ≠ 文件正确」的下一层：字节对得上，也要看字节对应的是哪个文本。）
    const manifest = {
      fingerprint: currentFingerprint(),
      entries: { 'u1-dog': { text: 'dog', sha256: 'sha-default', bytes: 23 } },
    }
    const d = decideSkip('u1-dog', true, () => 'sha-default', '/x', manifest, 'Dog!')

    expect(d.reason, '卡面改了就该报 text-mismatch，而不是 verified').toBe('text-mismatch')
    expect(d.skip, '卡面与录音对不上却跳过 ⇒ 孩子看到的字与听到的声音永远不一致').toBe(false)
  })

  it('文本不一致时报 text-mismatch 而不是 corrupt（别把人引去查半截文件）', () => {
    // 文本变了哈希必然也变，但报「corrupt」会让人以为 mp3 损坏了去重传，
    // 而真正要做的是改回卡面或重录。
    const manifest = {
      fingerprint: currentFingerprint(),
      entries: { 'u1-dog': { text: 'dog', sha256: 'sha-expected', bytes: 23 } },
    }
    expect(decideSkip('u1-dog', true, () => 'sha-expected', '/x', manifest, 'dog.').reason).toBe(
      'text-mismatch',
    )
  })

  it('真实磁盘上的 17 条录音（单元 1 + 2）：卡面文本与 manifest 记录逐条一致（否则新判定会要求全量重录）', () => {
    // 新判定会让「manifest 文本 ≠ 卡面文本」的条目要求重录。确认今天没有这种条目 ——
    // 否则一上线就把 17 条已生成的录音全部标记为待重录，白烧配额。
    // ⚠️📎 **2026-10-27（Story 2.10 换源批次）**：盘上的录音从 75 条变成 **17 条**
    //   （单元 1 的 6 条 + 单元 2 的 11 条）⇒ 本用例**同时查两个单元**，
    //   只查单元 1 的话，单元 2 的 11 条录音就没人管了。
    const recorded = JSON.parse(
      readFileSync(new URL('public/assets/audio/voice/manifest.json', REPO_ROOT), 'utf8'),
    ) as VoiceManifest
    const unitFiles = ['unit-01.json', 'unit-02.json'] as const
    const units = unitFiles.map(
      (file) =>
        JSON.parse(readFileSync(new URL(`src/content/units/${file}`, REPO_ROOT), 'utf8')) as {
          entries: { entryId: string; card: { promptText: string } }[]
        },
    )

    const drifted = units
      .flatMap((unit) => unit.entries)
      .filter((e) => recorded.entries[e.entryId]?.text !== e.card.promptText)
      .map((e) => e.entryId)

    expect(
      drifted,
      `这些词条的卡面与录音溯源不一致，新判定会要求重录：${drifted.join('、')}`,
    ).toEqual([])
  })

  it('跑完把 manifest 落盘，含新生成条目的哈希', async () => {
    let written: VoiceManifest | null = null
    const deps = makeDeps({
      hashFile: () => 'sha-of-u1-dog',
      fetchImpl: (async () => okHexResponse()) as unknown as typeof fetch,
      writeManifest: (m) => {
        written = m
      },
    })

    await runBatch([{ id: 'u1-dog', text: 'dog' }], deps)

    expect(written, 'manifest 没落盘 —— 下一轮仍然无从判断这些录音是哪组参数生成的').not.toBeNull()
    expect(written!.fingerprint).toEqual(currentFingerprint())
    expect(written!.entries['u1-dog']?.sha256).toBe('sha-of-u1-dog')
  })

  it('--dry 不写 manifest', async () => {
    let wrote = false
    const deps = makeDeps({ dry: true, writeManifest: () => (wrote = true) })
    await runBatch([{ id: 'u1-dog', text: 'dog' }], deps)
    expect(wrote, '--dry 一个文件都不该写').toBe(false)
  })

  it('首次运行（还没有 manifest）就把已有录音登记进去', async () => {
    // ⚠️ bootstrap 场景下 deps.manifest 恰好是 null。
    //    实现曾在「是否登记」上多判了一次 manifest 存在性，结果首跑写出的
    //    manifest 是空的 —— 溯源机制在最需要它的第一次运行上完全没生效，
    //    而所有断言都是绿的。这条用例守的就是这个门控。
    let written: VoiceManifest | null = null
    const deps = makeDeps({
      manifest: null,
      fileExists: () => true,
      hashFile: () => 'sha-existing',
      fileSize: () => 4096,
      writeManifest: (m) => {
        written = m
      },
    })

    const result = await runBatch([{ id: 'u1-dog', text: 'dog' }], deps)

    expect(result.generated, '已有录音不该重生成').toBe(0)
    expect(result.skipped).toBe(1)
    expect(
      written!.entries['u1-dog']?.sha256,
      '首次运行没登记已有录音 —— manifest 写出来是空的，溯源形同虚设',
    ).toBe('sha-existing')
    expect(written!.entries['u1-dog']?.bytes).toBe(4096)
  })
})

describe('--only 的取值校验（[CR] P4）', () => {
  it('空前缀被拒', async () => {
    const code = await main(['--only', '', '--dry'], {})
    expect(code, "空前缀会匹配全部词条 —— 用户以为限定了范围，实际整批都要跑").toBe(1)
  })

  it('空白前缀被拒', async () => {
    expect(await main(['--only', '   ', '--dry'], {})).toBe(1)
  })

  it('把下一个参数当成前缀被拒', async () => {
    // ⚠️ 断的是**报错文案**，不是退出码：`--only --dry` 若被放行，'--dry' 成为前缀，
    //    flag 被吃掉，但后面「前缀没匹配到任何词条」同样返回 1 —— 只断言退出码的话，
    //    这条用例在退化后依然全绿。真正变的是「用户被告知的到底是什么问题」。
    const seen: string[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((msg: unknown) => {
      seen.push(String(msg))
    })
    try {
      const code = await main(['--only', '--dry'], {})
      expect(code).toBe(1)
    } finally {
      spy.mockRestore()
    }
    expect(
      seen.join('\n'),
      "参数被当成前缀吃掉，用户只看到「没有匹配到任何词条」，看不出是自己漏写了前缀值",
    ).toMatch(/不能是参数/)
  })

  it('缺参数被拒', async () => {
    expect(await main(['--only'], {})).toBe(1)
  })

  it('合法前缀仍然可用', async () => {
    // ⚠️ 2026-10-26 换源批次：单元 1 的词条换成了教材版
    //   （`u1-morning` / `u1-afternoon` / `u1-s-good-morning` / `u1-s-hello` …），
    //   旧前缀 `u1-d` 已经**匹配不到任何词条**（`--only` 匹配不到就退 1）⇒
    //   改用仍然存在的 `u1-m`（命中 `u1-morning`）。
    expect(await main(['--only', 'u1-m', '--dry'], {})).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Story 3.4（音频品质打磨）：AC-6 / AC-7 的两条新守卫
//
// ① G310 —— 已提交的 manifest 指纹 == 脚本当前常量（落在 tests/assets/audio-assets.test.ts）
// ② G311 —— 指纹不匹配 ⇒ 脚本拒绝运行（本文件）
//
// ⚠️ 这两条守的都不是「代码写得对不对」，而是**提交物自相矛盾时有没有东西会红**：
//   改了 `VOICE_SPEED` 却没重生成 —— 磁盘上是旧录音、manifest 与常量却对得上 ——
//   今天**没有任何东西会红**，而孩子听到的是旧语速。
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 取某个函数的**函数体**（大括号之间的文本）。源码匹配型守卫的通用零件。
 *
 * ⚠️ 只对「函数体里没有含大括号的字符串字面量」的函数可靠 ——
 *   本文件用它扫的两处（`normalizeFingerprint` / `fingerprintMatches`）都满足这个前提。
 */
function extractFunctionBody(code: string, marker: string): string {
  const start = code.indexOf(marker)
  expect(start, `源码里找不到「${marker}」—— 守卫扫的函数被改名或挪走了`).toBeGreaterThan(-1)
  const open = code.indexOf('{', start)
  let depth = 0
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === '{') depth += 1
    else if (code[i] === '}') {
      depth -= 1
      if (depth === 0) return code.slice(open + 1, i)
    }
  }
  return code.slice(open + 1)
}

/** 脚本源码（先剥注释 —— R-52：注释里写着「JSON.stringify」不算违规）。 */
const scriptCode = (): string =>
  stripComments(readFileSync(new URL('scripts/generate-voice.ts', REPO_ROOT), 'utf8'))

describe('G312 —— 指纹归一化与比较方式（AC-6 / §3.1）', () => {
  it('归一化只查历史默认值表，不许查当前常量', () => {
    // ⚠️ 这条是**结构性**守卫，不是行为性守卫 —— 因为方向写反的后果
    //   （「改了音高却没重生成」被放过）只有在 `VOICE_PITCH ≠ 0` 时才**看得见**，
    //   而今天 `VOICE_PITCH = 0` ⇒ 写反了与写对了**结果一样** ⇒ 行为性断言抓不到。
    //   ⇒ 方向必须靠结构钉住：归一化函数里**不许**出现当前常量。
    const body = extractFunctionBody(scriptCode(), 'export function normalizeFingerprint')

    expect(
      body,
      '归一化函数里没有引用历史默认值表 —— 缺键会被归一成什么就无从判断了',
    ).toMatch(/HISTORICAL_DEFAULTS/)
    expect(
      body,
      '归一化查了当前常量 ⇒ 缺键会被归一成**当前**取值 ⇒ 「改了参数却没重生成」被放过（AC-6 整个失效）',
    ).not.toMatch(/currentFingerprint|VOICE_PITCH/)
  })

  it('指纹比较不许用 JSON.stringify 比整份对象（键序敏感）', () => {
    // ⚠️ 归一化用 `{...HISTORICAL_DEFAULTS, ...stored}` 会把 `pitch` 排到**最前**，
    //   而 `currentFingerprint()` 里它排在**最后** ⇒ 两个 `JSON.stringify` **必然不等**
    //   ⇒ 现状（`VOICE_PITCH = 0`）会被**误判为不匹配**：
    //   G310 假红 + 脚本无端拒跑 ⇒ 「17 条录音不必重生成」这条承诺的破口。
    const body = extractFunctionBody(scriptCode(), 'export function fingerprintMatches')

    expect(
      body,
      '指纹比较用 JSON.stringify 比整份对象 ⇒ 键序敏感 ⇒ 现状被误判为不匹配（假红 + 无端拒跑）',
    ).not.toMatch(/JSON\.stringify/)
  })

  it('manifest 缺 pitch 键 ⇒ 归一为历史默认值 0', () => {
    const legacy = {
      model: 'speech-2.8-hd',
      voice_id: 'English_LovelyGirl',
      speed: 0.9,
      format: 'mp3',
    }
    const norm = normalizeFingerprint(legacy)

    expect(
      norm.pitch,
      '缺键没有归一为历史默认值 ⇒ 已提交的那批录音（生成时还没有音高这个键）会被判成异常',
    ).toBe(0)
    expect(
      HISTORICAL_DEFAULTS.pitch,
      '历史默认值必须逐字是 0 —— 它是「引入音高之前」的取值，改了它等于伪造历史',
    ).toBe(0)
  })

  it('归一化的展开顺序：磁盘上的值优先于历史默认值（顺序反了 ⇒ manifest 里的 pitch 会被压成 0）', () => {
    // ⚠️⚠️ 2026-10-25 夜 `[CR]` 实测：把脚本里的 `{ ...HISTORICAL_DEFAULTS, ...stored }`
    //   反过来写成 `{ ...stored, ...HISTORICAL_DEFAULTS }` ⇒ **104 条用例全绿**
    //   （上面那条结构守卫只查「不许引用当前常量」，**不看顺序**）。
    //   ⇒ 后果：manifest 里 `pitch: 2` 会被历史默认 0 **覆盖** ⇒ 与常量 0 判成
    //   「一致」⇒ 「改了音高却没重生成」被放过 —— 正是 AC-6 要杀的那种状态。
    //   ⇒ 这里用**行为**钉住顺序（结构守卫钉不住「哪边在前」）。
    expect(
      normalizeFingerprint({ model: 'x', pitch: 5 }).pitch,
      '归一化把磁盘上的值压成了历史默认值 ⇒ 展开顺序反了（{ ...stored, ...HISTORICAL_DEFAULTS }）',
    ).toBe(5)
    expect(
      normalizeFingerprint({ model: 'x' }).pitch,
      '缺键时没有用历史默认值 ⇒ 「引入音高之前」那批录音会被判成异常',
    ).toBe(0)
  })

  it('历史默认值表里只许有 pitch 一个键（多一个键 ⇒ 「manifest 缺 model」这种异常被归一成正常）', () => {
    expect(
      Object.keys(HISTORICAL_DEFAULTS),
      '历史默认值表里多了键 ⇒ 那个键的「缺失」会被归一成正常（G310 也就抓不到「manifest 少了一个键」）',
    ).toEqual(['pitch'])
  })

  it('历史 manifest（缺 pitch 键）仍与当前常量一致 —— 17 条录音不必重生成', () => {
    const legacy = {
      model: 'speech-2.8-hd',
      voice_id: 'English_LovelyGirl',
      speed: 0.9,
      format: 'mp3',
    }
    expect(
      fingerprintMatches({ fingerprint: legacy, entries: {} }),
      '历史 manifest 被判成不匹配 ⇒ 脚本会无端拒跑、已提交的 17 条录音被白白重生成。' +
        '⚠️ 注意：若你刚改了 `VOICE_SPEED` / `VOICE_PITCH`，**这条红是对的** —— ' +
        '改了生成参数就必须整批重生成（别去改 `HISTORICAL_DEFAULTS`）',
    ).toBe(true)
  })

  it('manifest 里多出来的键也要报（只比当前常量有的那几个键会放过它）', () => {
    const extra = { ...currentFingerprint(), extra_key: 1 }
    const m = { fingerprint: extra, entries: {} }

    expect(
      fingerprintMatches(m),
      'manifest 里的多余键被放过 ⇒ 提交物里可能夹着别的东西，而没有任何东西会红',
    ).toBe(false)
    expect(fingerprintDiff(m), '差异文案没指出多余键').toMatch(/extra_key/)
  })

  it('当前常量有的键在 manifest 里缺失 ⇒ 报（异常不能被归一成正常）', () => {
    const missing: Record<string, unknown> = { ...currentFingerprint() }
    delete missing['format']

    expect(
      fingerprintMatches({ fingerprint: missing, entries: {} }),
      '缺了 key 的指纹被当成一致 —— 那不是「历史产物」，那是异常',
    ).toBe(false)
    expect(fingerprintDiff({ fingerprint: missing, entries: {} })).toMatch(/format/)
  })

  it('语速变了 ⇒ 不匹配，并指名差异（改动要能被人一眼看懂）', () => {
    const stale = { ...currentFingerprint(), speed: 1.2 }
    expect(fingerprintMatches({ fingerprint: stale, entries: {} })).toBe(false)
    expect(fingerprintDiff({ fingerprint: stale, entries: {} })).toMatch(/speed/)
  })
})

describe('G311 —— 指纹闸：参数变了 ⇒ 脚本拒绝运行（AC-7）', () => {
  let dir = ''
  let fetchCalls = 0
  let errors: string[] = []
  let logs: string[] = []
  let errorSpy: ReturnType<typeof vi.spyOn>
  let logSpy: ReturnType<typeof vi.spyOn>

  /** 仓库里已提交的那份 manifest —— 守卫跑完必须**逐字未变**（Task 3.5）。 */
  const repoManifestPath = new URL('public/assets/audio/voice/manifest.json', REPO_ROOT)

  const writeManifest = (fingerprint: Record<string, unknown>): void => {
    writeFileSync(
      join(dir, 'manifest.json'),
      `${JSON.stringify({ fingerprint, entries: {} }, null, 2)}\n`,
    )
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'voice-gate-'))
    fetchCalls = 0
    errors = []
    logs = []
    // ⚠️ fetch 用**全局 stub**：`main()` 直接调全局 `fetch`，不注入。
    //   这里返回一个**合法**响应（而不是抛错）—— 那样「闸被绕过」的后果是
    //   「脚本成功、fetchCalls = 1」，断言 `fetchCalls === 0` 就能抓住它；
    //   若 stub 抛错，失败原因会变成异常而不是「多发了请求」，指向错误的方向。
    vi.stubGlobal('fetch', async () => {
      fetchCalls += 1
      return okHexResponse()
    })
    errorSpy = vi.spyOn(console, 'error').mockImplementation((msg: unknown) => {
      errors.push(String(msg))
    })
    logSpy = vi.spyOn(console, 'log').mockImplementation((msg: unknown) => {
      logs.push(String(msg))
    })
  })

  afterEach(() => {
    errorSpy.mockRestore()
    logSpy.mockRestore()
    vi.unstubAllGlobals()
    rmSync(dir, { recursive: true, force: true })
  })

  it('指纹不匹配 ⇒ 退出码 1、诊断指名差异的键、且一个网络请求都不发', async () => {
    writeManifest({ ...currentFingerprint(), speed: 1.2 })
    const before = readFileSync(repoManifestPath, 'utf8')

    const code = await main(['--only', 'u1-morning'], { MINIMAX_API_KEY: 'sk-test' }, { outputDir: dir })

    expect(
      code,
      '指纹不匹配却放行了 —— 旧参数录音会被盖上新参数的戳（静默混批，正是 AC-7 要杀的那种失败）',
    ).toBe(1)
    expect(
      errors.join('\n'),
      '诊断文案没指名差异的键 —— 用户只知道「不匹配」，不知道该改哪个常量',
    ).toMatch(/speed/)
    expect(
      fetchCalls,
      '拒绝之前已经发过网络请求 —— 白花钱，而且旧录音可能已经被改写',
    ).toBe(0)
    expect(
      readFileSync(repoManifestPath, 'utf8'),
      '守卫跑完之后仓库里已提交的 manifest 变了 —— 测试把产物写到了真的那个文件上',
    ).toBe(before)
  })

  it('历史 manifest（缺 pitch 键）不该被误判为不匹配 ⇒ 不拒跑', async () => {
    // ⚠️ 这条是「归一化方向」的行为性证据：方向写反（缺键取当前常量）时，
    //   在 `VOICE_PITCH = 0` 这一天它与写对**结果一样** ⇒ 抓不到；
    //   但只要归一化把缺键归一成**非 0**（例如误取当前常量后又有人把常量改了），
    //   这条就会红。结构性那条（上面的「归一化只查历史默认值表」）才是常驻的牙齿。
    writeManifest({
      model: 'speech-2.8-hd',
      voice_id: 'English_LovelyGirl',
      speed: 0.9,
      format: 'mp3',
    })

    const code = await main(['--only', 'u1-morning'], { MINIMAX_API_KEY: 'sk-test' }, { outputDir: dir })

    expect(
      code,
      '历史 manifest 被判成不匹配 ⇒ 脚本无端拒跑、已提交的 17 条录音被白白重生成。' +
        '⚠️ 注意：若你刚改了 `VOICE_SPEED` / `VOICE_PITCH`，**这条红是对的** —— ' +
        '改了生成参数就必须整批重生成（别去改 `HISTORICAL_DEFAULTS`）',
    ).toBe(0)
    expect(fetchCalls, '闸放行了却一个请求都没发 —— 脚本根本没往下走').toBe(1)
  })

  it('manifest 里多一个键 ⇒ 退出码 1、诊断指名那个键（G311 的端到端一条）', async () => {
    // ⚠️ 「多出来的键也要报」这条判据原先只在**模块级**的纯函数用例里成立
    //   （`fingerprintMatches` 直接构造对象）。
    //   这条是端到端：走 `main()` ⇒ 确认 `parseManifest` 不会把带未知键的
    //   fingerprint 判成「结构不对」而提前吞掉、也不会让闸失效。
    writeManifest({ ...currentFingerprint(), extra_key: 1 })

    const code = await main(['--only', 'u1-morning'], { MINIMAX_API_KEY: 'sk-test' }, { outputDir: dir })

    expect(
      code,
      'manifest 里多一个键却放行了 ⇒ 提交物里可能夹着别的东西，而没有任何东西会红',
    ).toBe(1)
    expect(errors.join('\n'), '诊断文案没指名那个多余的键').toMatch(/extra_key/)
    expect(fetchCalls, '拒绝之前已经发了请求').toBe(0)
  })

  it('`--force` 也不越闸：指纹不匹配时仍然退出码 1（裁决 F 的 (b) 方案）', async () => {
    writeManifest({ ...currentFingerprint(), speed: 1.2 })

    const code = await main(
      ['--force', '--only', 'u1-morning'],
      { MINIMAX_API_KEY: 'sk-test' },
      { outputDir: dir },
    )

    expect(
      code,
      '`--force` 越过了指纹闸 —— 越闸 + 部分失败会造出「旧音频 + 新指纹」的真混批',
    ).toBe(1)
    expect(fetchCalls, '越闸之后已经发了请求').toBe(0)
  })

  it('没有 manifest 但盘上已有 mp3 ⇒ 拒绝运行（AC-7 的第二个 Given 块）', async () => {
    // 这条是「只删 manifest、不删 mp3」那条绕过整道闸的路径：
    // 闸**只在 manifest 存在时**才生效 ⇒ manifest 一没，旧参数录音就会被
    // `decideSkip` 的 `unrecorded` 分支登记进**新指纹**的 manifest ⇒ 混批被盖章。
    // ⚠️ 2026-10-26 换源批次（Story 2.10）：盘上那个「来源不明的孤儿 mp3」要叫
    //   一个**真实存在**的词条 id —— 旧夹具用的 `u1-dog` 已作废（单元 1 换成了教材版），
    //   而 `--only u1-dog` 在 `--only` 匹配阶段就会退 1（`--only` 匹配不到任何词条），
    //   **根本走不到**那道「没有 manifest 却盘上有 mp3 ⇒ 拒跑」的闸 ⇒ 守卫会变成恒绿。
    //   ⇒ 词条 id 与 `--only` 前缀都改成仍然存在的 `u1-morning`。
    writeFileSync(join(dir, 'u1-morning.mp3'), 'ID3-fake-audio')

    const code = await main(['--only', 'u1-morning'], { MINIMAX_API_KEY: 'sk-test' }, { outputDir: dir })

    expect(
      code,
      '没有 manifest 却照跑 —— 盘上的旧录音会被登记进新指纹的 manifest（混批且无从察觉）',
    ).toBe(1)
    expect(fetchCalls, '拒绝之前已经发了请求').toBe(0)
    expect(errors.join('\n'), '诊断文案没说清「删整个目录」这条正确流程').toMatch(/manifest/)
  })

  it('产物目录空且没有 manifest ⇒ 照常跑（一次性首跑不受那条拒绝影响）', async () => {
    const code = await main(['--only', 'u1-morning'], { MINIMAX_API_KEY: 'sk-test' }, { outputDir: dir })

    expect(code, '一次性首跑被拒 —— 脚本在空目录上跑不起来').toBe(0)
    expect(fetchCalls, '首跑没有生成任何录音').toBe(1)
  })

  it('listVoiceMp3s 只把「目录不存在」当成「盘上没有 mp3」（其余读目录错误必须抛出去）', () => {
    // ⚠️⚠️ 2026-10-25 夜 `[CR]` 修复的洞：原来的 `catch { return [] }` 把
    //   **所有**读目录失败都当成「目录不存在」⇒ 权限错 / EIO / 路径是个文件时，
    //   「没有 manifest 但盘上有 mp3 ⇒ 拒跑」那道闸**静默失效**（脚本以为盘上干净）。
    // ⇒ 行为面：目录不存在 ⇒ 空数组（一次性首跑的正常形态）。
    expect(
      listVoiceMp3s(join(tmpdir(), `voice-not-exist-${process.pid}`)),
      '目录不存在时不是空数组 —— 一次性首跑会被当成「盘上有孤儿录音」而拒跑',
    ).toEqual([])
    // ⇒ 结构面：catch 里必须**按错误码分流**，且**非 ENOENT 的错误必须抛出去**。
    //   （非 ENOENT 的错误在测试环境里**造不出来** —— 容器里是 root，
    //     权限位对 root 无效 ⇒ EACCES 触发不了 ⇒ 这一条只能靠源码形状钉住。）
    // ⚠️⚠️ 2026-10-25 `[CR]` 变异实测抓到的**假绿**：这一段原先写的是
    //   `not.toMatch(/catch\s*\{\s*return \[\]\s*\}/)` —— 它只认「`catch { return [] }`
    //   这一种**字面形态**。把 catch 改成 `catch (err) { … return [] }`（同一份坏行为，
    //   换一种写法）⇒ **旧判据全绿**（变异 M375 实测 97 条全绿）。
    //   ⇒ 判据改成**看行为后果**：catch 体里必须有 `throw`（把错误原样抛出去）。
    const body = extractFunctionBody(scriptCode(), 'export function listVoiceMp3s')
    expect(
      body,
      'listVoiceMp3s 没有按错误码分流 ⇒ 读目录失败会被当成「盘上干净」⇒ 拒跑闸静默失效',
    ).toMatch(/ENOENT/)
    expect(
      body,
      'listVoiceMp3s 的 catch 没有把非 ENOENT 的错误抛出去 ⇒ 闸会静默失效（旧参数录音被盖上新参数的戳）',
    ).toMatch(/\bthrow\b/)
  })

  it('writeManifestFile 必须要求显式传 outputDir（不许有默认值 —— 会覆盖已提交的 17 条溯源记录）', () => {
    // ⚠️ 2026-10-25 夜 `[CR]`：注释逐字写「这里**不许**回落到模块级常量」，
    //   而签名逐字是 `outputDir: string = OUTPUT_DIR` ⇒ 注释与代码互相否定。
    // ⚠️ 断言要看的是**签名**，不是函数体 ⇒ 这里单独切出「函数头到 `{` 为止」那一段
    //   （`extractFunctionBody` 只切函数体，会漏掉签名里的默认值）。
    const source = scriptCode()
    const start = source.indexOf('export function writeManifestFile')
    expect(start, '源码里找不到 `writeManifestFile` —— 守卫扫的函数被改名或挪走了').toBeGreaterThan(-1)
    const signature = source.slice(start, source.indexOf('{', start))
    expect(
      signature,
      'writeManifestFile 的 outputDir 又有了默认值 ⇒ 一次 `writeManifestFile(m)` 就会覆盖仓库里已提交的 17 条溯源记录',
    ).not.toMatch(/outputDir:\s*string\s*=/)
  })
})

describe('--force 与 --help（Task 4 / DF-010）', () => {
  it('--force 时一律重录，不走跳过判定', async () => {
    let writes = 0
    const deps = makeDeps({
      force: true,
      fileExists: () => true,
      writeFile: () => {
        writes += 1
      },
      fetchImpl: (async () => okHexResponse()) as unknown as typeof fetch,
    })

    const result = await runBatch([{ id: 'u1-dog', text: 'dog' }], deps)

    expect(result.skipped, '--force 仍然跳过了已存在的文件 —— 它什么也没干').toBe(0)
    expect(result.generated).toBe(1)
    expect(writes).toBe(1)
  })

  it('--force 只重录筛中的那些 ⇒ manifest 里**未被涉及**的条目必须原样保留', async () => {
    // ⚠️ 2026-10-25 夜 `[CR]` 补：`nextManifest` 是从 `deps.manifest` 拷出来的，
    //   这条不变量当时**没有断言** —— 一旦改成新建空对象，一次
    //   `--force --only u1-dog` 就会把其余 74 条的溯源记录抹掉，
    //   而 G310 仍然绿（它只看**指纹**，不看 entries）。
    let written: VoiceManifest | null = null
    const deps = makeDeps({
      force: true,
      manifest: {
        fingerprint: currentFingerprint(),
        entries: {
          'u1-cat': { text: 'cat', sha256: 'sha-cat', bytes: 100 },
        },
      },
      fileExists: () => true,
      writeFile: () => undefined,
      writeManifest: (m) => {
        written = m
      },
    })

    await runBatch([{ id: 'u1-dog', text: 'dog' }], deps)

    expect(
      written!.entries['u1-cat']?.sha256,
      '一次 --force 把未被涉及的条目的溯源记录从 manifest 里抹掉了 ⇒ manifest 名不副实',
    ).toBe('sha-cat')
  })

  it('manifest 存在却没有这一条 ⇒ 盘上的录音来源不明 ⇒ 重录，不登记进新指纹', async () => {
    // ⚠️⚠️ 2026-10-25 夜 `[CR]` 修复的正是这个洞：
    //   CLI 那侧的「没有 manifest 但盘上有 mp3 ⇒ 拒跑」只堵住了**整体**缺失；
    //   **缺一条**（manifest 被裁过 / 手工塞进来的文件 / 上一轮跑到一半留下的）
    //   原先会被 `unrecorded` 分支**登记进新指纹** ⇒ 旧参数录音被盖上新参数的戳。
    let content = 'stale'
    let written: VoiceManifest | null = null
    const deps = makeDeps({
      manifest: { fingerprint: currentFingerprint(), entries: {} },
      fileExists: () => true,
      hashFile: () => `sha-${content}`,
      fileSize: () => 4096,
      writeFile: () => {
        content = 'fresh'
      },
      fetchImpl: (async () => okHexResponse()) as unknown as typeof fetch,
      writeManifest: (m) => {
        written = m
      },
    })

    const result = await runBatch([{ id: 'u1-dog', text: 'dog' }], deps)

    expect(
      result.skipped,
      '来源不明的录音被跳过了 ⇒ 它会原样留下（旧参数音频 + 新指纹的戳，混批被盖章）',
    ).toBe(0)
    expect(result.generated, '来源不明的录音没有被重录').toBe(1)
    expect(
      written!.entries['u1-dog']?.sha256,
      '重录之后 manifest 里记的还是那个旧文件的哈希 ⇒ 旧录音仍被盖上了新参数的戳',
    ).toBe('sha-fresh')
  })

  it('--help 不需要 API key，退出码 0，并打印全部用法', async () => {
    const logs: string[] = []
    const spy = vi.spyOn(console, 'log').mockImplementation((msg: unknown) => {
      logs.push(String(msg))
    })
    let code = 1
    try {
      code = await main(['--help'], {})
    } finally {
      spy.mockRestore()
    }

    expect(code, '--help 返回非 0 —— 在没配 key 的机器上（恰恰是最需要看用法的人）拿不到用法').toBe(0)
    const out = logs.join('\n')
    expect(out).toMatch(/--dry/)
    expect(out).toMatch(/--only/)
    expect(out).toMatch(/--force/)
    expect(out).toMatch(/--help/)
    expect(out, '用法里没写「改参数后要整批重来」这条正确流程').toMatch(/manifest/)
  })

  it('--help 不碰产物目录', async () => {
    const dir = new URL('public/assets/audio/voice/', REPO_ROOT)
    const snapshot = (): string =>
      existsSync(dir) ? readdirSync(dir).sort().join(',') : ''

    const before = snapshot()
    const code = await main(['--help'], {})
    const after = snapshot()

    expect(code).toBe(0)
    expect(after, '--help 动了产物目录 —— 打印用法不该有任何副作用').toBe(before)
  })
})

/**
 * G313 —— **中断后可续跑**：每生成一条就落一次 manifest。
 *
 * ── 它守的是什么 ──────────────────────────────────────────────────────────
 *   落盘时机若只在**跑完**时，那么「跑到一半被 Ctrl-C / 崩了 / 断网了」之后，
 *   盘上只剩「一堆 mp3 + 没有 manifest」⇒ 下一次跑被
 *   「没有 manifest 但盘上有 mp3 ⇒ 拒跑」那道闸挡住，而它要求
 *   **删掉整个目录重跑全量** ⇒ 已经录好的那几十条全部作废（钱与配额白花），
 *   且与脚本自己承诺的「已成功的文件全部保留，重跑只补这些」**直接矛盾**。
 *
 *   ⇒ 判据：落盘的 manifest 必须**逐条增长**（第 k 条生成完，manifest 里就有 k 条）。
 *   只有这样，「被杀在第 k 条」这一瞬间，盘上留着的那份 manifest 才是**可续的**。
 */
describe('G313 —— 中断后可续跑（每生成一条就落一次 manifest）', () => {
  /**
   * 判据本体：落盘点数序列里必须**逐条**出现 1..N。
   *
   * ⚠️ 判据粒度比「跑完落过一次」粗（它管全部 N 条），这是**故意的** ——
   * 旧行为（只在末尾落一次）的落盘点数序列是 `[N]`，在本判据下**必红**。
   */
  const incrementalWriteProblems = (writeCounts: number[], generated: number): string[] => {
    const problems: string[] = []
    for (let i = 1; i <= generated; i += 1) {
      if (!writeCounts.includes(i)) {
        problems.push(
          `第 ${i} 条生成完没有落过 manifest（落盘时的条目数集合：${[...new Set(writeCounts)].join('、')}）` +
            ' —— 中途被杀时盘上就没有可续的溯源记录，下次跑只能删掉整个目录重录全量',
        )
      }
    }
    return problems
  }

  it('每生成一条就落一次 manifest ⇒ 落盘点数逐条增长', async () => {
    const writeCounts: number[] = []
    const deps = makeDeps({
      fetchImpl: (async () => okHexResponse()) as unknown as typeof fetch,
      writeManifest: (m) => {
        writeCounts.push(Object.keys(m.entries).length)
      },
    })

    const result = await runBatch(
      [
        { id: 'u1-dog', text: 'dog' },
        { id: 'u1-cat', text: 'cat' },
        { id: 'u1-bus', text: 'bus' },
      ],
      deps,
    )

    expect(result.generated, '三条都该生成 —— 夹具是每条都成功').toBe(3)
    expect(
      incrementalWriteProblems(writeCounts, 3),
      'manifest 不是逐条落盘 ⇒ 中断后无法续跑，已录好的录音会被逼着重录全量',
    ).toEqual([])
  })

  it('中断后重跑：已录的那几条按「已验证」跳过，只补剩下的（脚本承诺的「重跑只补这些」）', async () => {
    const entries: VoiceEntry[] = [
      { id: 'u1-dog', text: 'dog' },
      { id: 'u1-cat', text: 'cat' },
      { id: 'u1-bus', text: 'bus' },
    ]
    let captured: VoiceManifest | null = null
    const deps1 = makeDeps({
      fetchImpl: (async () => okHexResponse()) as unknown as typeof fetch,
      writeManifest: (m) => {
        captured = m
      },
    })

    // 第一次跑到一半就「断了」：只喂前两条
    await runBatch(entries.slice(0, 2), deps1)
    expect(captured!.entries['u1-dog'], '前两条的溯源记录没落盘 —— 中断后无从续跑').toBeDefined()
    expect(captured!.entries['u1-cat']).toBeDefined()
    expect(captured!.entries['u1-bus'], '没录的那条不该出现在 manifest 里').toBeUndefined()

    // 第二次跑：盘上前两条都在，manifest 是上面那份
    const onDisk = new Set(['u1-dog.mp3', 'u1-cat.mp3'])
    const deps2 = makeDeps({
      manifest: captured,
      fileExists: (p: string) => onDisk.has(p.slice(p.lastIndexOf('/') + 1)),
      fetchImpl: (async () => okHexResponse()) as unknown as typeof fetch,
    })

    const result = await runBatch(entries, deps2)
    expect(result.skipped, '已录的两条必须按「已验证」跳过 —— 否则每次重跑都在烧配额').toBe(2)
    expect(result.generated, '只该补录剩下那一条').toBe(1)
  })

  it('反向自测：判据本体对「只在跑完时落一次」必须能报（旧行为 = 落盘点数序列 [3]）', () => {
    expect(
      incrementalWriteProblems([3], 3).length,
      '判据本体对旧行为（末尾才落盘）必须报错 —— 否则它是个永远绿的摆设',
    ).toBeGreaterThan(0)
    expect(incrementalWriteProblems([1, 2, 3], 3), '合规形态不许被误报').toEqual([])
  })
})
