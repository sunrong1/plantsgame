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
import {
  REQUEST_INTERVAL_MS,
  buildRequestBody,
  currentFingerprint,
  decideSkip,
  entriesFromContent,
  estimateCost,
  fingerprintDiff,
  fingerprintMatches,
  looksLikeMp3,
  main,
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
    expect(
      texts.some((t) => t.includes('?')),
      '没有问句 —— 回应卡的题面无法试听',
    ).toBe(true)
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

  it('默认请求间隔保证单元 1 的量级落在 60 RPM 之内', () => {
    // 官方 HD 系列限 60 RPM。间隔为 0 时单元 1 实测就在第 24 条撞墙（见上一条用例）。
    // Epic 2 词量翻十倍时**必须**再调大 —— 这条断言会在那时立刻变红提醒。
    const entries = contentEntries()
    expect(
      REQUEST_INTERVAL_MS,
      '请求间隔为 0 —— 单元 1 的量级就会撞上 60 RPM（Epic 2 需调成 ~1100ms 以上）',
    ).toBeGreaterThan(0)
    expect(
      60_000 / REQUEST_INTERVAL_MS,
      '按默认间隔跑完当前词表所需的分钟数 > 1 —— 一个 60 秒窗口内发不完，必然限流',
    ).toBeGreaterThanOrEqual(entries.length)
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
    expect(decideSkip('u1-dog', true, () => 'sha-default', '/x', manifest).reason).toBe('verified')
  })

  it('哈希对不上就重新生成，不跳过', () => {
    // 这是原实现最大的洞：半截 mp3、被手工改过的文件，只看「在不在」。
    const manifest = {
      fingerprint: currentFingerprint(),
      entries: { 'u1-dog': { text: 'dog', sha256: 'sha-expected', bytes: 23 } },
    }
    const d = decideSkip('u1-dog', true, () => 'sha-actual', '/x', manifest)
    expect(d.reason).toBe('corrupt')
    expect(d.skip, '内容不符却跳过 —— 一个播不出声的 mp3 被永久认定完成').toBe(false)
  })

  it('磁盘上没有就重新生成', () => {
    expect(decideSkip('u1-dog', false, () => '', '/x', null).skip).toBe(false)
  })

  it('无 manifest 时仍跳过已有文件（首次运行不烧配额）', () => {
    expect(decideSkip('u1-dog', true, () => '', '/x', null).reason).toBe('unrecorded')
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
    expect(await main(['--only', 'u1-d', '--dry'], {})).toBe(0)
  })
})
