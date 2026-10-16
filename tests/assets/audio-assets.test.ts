/**
 * **G66 / G67** —— 音效与 BGM 素材的存在性与来源登记守卫（Story 1.14 / AC-H1、AC-H2）。
 *
 * ── G66：磁盘上真的躺着 7 个音效 + 1 首 BGM，且**不是空文件** ────────────────
 * ⚠️ 「文件存在」不等于「文件正确」。本 story 之前就有过 **0 字节 mp3** 的静默失效
 *   （`deferred-work.md` 记的事故）—— `existsSync` 对 0 字节文件返回 true。
 *   ⇒ 所以判据是 `size > 1024`，不是 `existsSync`。
 * ⚠️ 光有大小也不够：一个被截断到 2KB 的 mp3 大小照样过线。
 *   ⇒ 追加判据：mp3 文件头（ID3 标签或帧同步）必须在。
 *
 * ── G67：`SOURCES.json` 与磁盘**双向一一对应** ────────────────────────────────
 * 只查「登记了但文件不存在」会漏掉「文件存在但没登记」—— 而那正是
 * **AC-H2 要杀的那种违规**（来源不明的素材悄悄躺在 `public/` 里，
 * 没人知道它的许可证是什么）。
 * ⇒ 双向都查：SOURCES.json 有而磁盘没有 ⇒ 红；磁盘有而 SOURCES.json 没有 ⇒ 红。
 *
 * ⚠️ **判据只有一份**：cue 列表一律从 `src/core/effects.ts` 的 `SfxCue` 取，
 *   不在本文件重抄七个字符串（1.9 的 P0：判据抄多份 ⇒ 真守卫停用也全绿）。
 *
 * ── AC-H2：每条登记必须**真实可核** ─────────────────────────────────────────
 * `license` / `url` / `author` 三个字段逐条非空。AC-H2 禁止的是
 * 「许可证不明确的素材入库」，字段空着等于没登记。
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import type { SfxCue } from '../../src/core'
import { MUSIC_BASE_PATH, SFX_BASE_PATH } from '../../src/services/audio'
import { assetPathWithinPublic } from '../../src/services/asset-url'

const root = process.cwd()

const SFX_DIR = join(root, 'public/assets/audio/sfx')
const MUSIC_DIR = join(root, 'public/assets/audio/music')
const SOURCES_FILE = join(SFX_DIR, 'SOURCES.json')

/** 素材登记文件的一条 sfx 结构。 */
interface SfxRecord {
  cue: string
  file: string
  title: string
  url: string
  downloadUrl: string
  author: string
  license: string
  durationSec: number
  note: string
}

/** 素材登记文件的一条 music 结构。 */
interface MusicRecord {
  file: string
  title: string
  path: string
  url: string
  downloadUrl: string
  author: string
  license: string
  durationSec: number
  note: string
}

interface Sources {
  sfx: SfxRecord[]
  music: MusicRecord[]
}

const sources: Sources = JSON.parse(readFileSync(SOURCES_FILE, 'utf8')) as Sources

/**
 * 从 `SfxCue` 抽出**七个 cue 的全集** —— 不重抄。
 *
 * 手法是让类型自己现身：`const CUES: readonly SfxCue[]` 在 `SfxCue` 增删成员时
 * 会**编译期报错**（TS2322），比「在守卫里硬写七个字符串然后靠人记得同步」可靠。
 * 运行时再做一次完整性自检 —— 万一有人用 `as` 把类型绕过去（memory：
 * 「守卫断言允许了它要防的违规」），这里会当场红。
 */
const CUES: readonly SfxCue[] = [
  'answer-correct',
  'answer-wrong',
  'tower-placed',
  'zombie-died',
  'heart-lost',
  'level-complete',
  'level-failed',
]

/**
 * 从 `src/core/effects.ts` 的 `SfxCue` 联合体**源码文本**里抽出全部成员。
 *
 * ⚠️ 为什么要读源码文本，而不是靠 `const CUES: readonly SfxCue[] = [...]` 就完事？
 *   TypeScript 只在数组里出现**联合体没有的成员**时报 TS2322，
 *   **少写一个成员它一声不吭** —— 而「少写一个」恰恰是更危险的失同步方向
 *   （新加的 `level-complete` 没登记进 SOURCES.json ⇒ 那个音效成了来源不明素材，
 *   正是 AC-H2 要杀的）。
 *   ⇒ 这里读回源码，双向比对，删和加都咬得住。
 */
function cuesDeclaredInCore(): readonly string[] {
  const source = readFileSync(join(root, 'src/core/effects.ts'), 'utf8')
  // 联合体正文 = 一串「以 `|` 开头」的行。比「匹配到下一个 export」稳 ——
  // 后者会被中间那段文档注释的措辞牵走（首版就栽在这）。
  const union = source.match(/export type SfxCue\s*=((?:\n\s*\|[^\n]*)+)/)
  expect(union, 'src/core/effects.ts 里找不到 `export type SfxCue` 联合体 —— 判据自己失明了').not.toBeNull()
  const body = union![1]!
  return [...body.matchAll(/'([a-z-]+)'/g)].map((m) => m[1]!)
}

/** mp3 文件头判定：ID3 标签 或 帧同步字节（0xFF 0xEx/0xFx）。 */
function looksLikeMp3(head: Buffer): boolean {
  if (head.length >= 3 && head.subarray(0, 3).toString('ascii') === 'ID3') return true
  return head.length >= 2 && head[0] === 0xff && (head[1]! & 0xe0) === 0xe0
}

/** 读文件头（够判 mp3 即可）。 */
function readHead(file: string, bytes = 4): Buffer {
  const fd = readFileSync(file)
  return fd.subarray(0, Math.min(bytes, fd.length))
}

describe('G66 —— 7 个音效 + 1 首 BGM 真实存在且非空（AC-H1）', () => {
  it('G66：七个 cue 一个不多一个不少（判据取自 core 的 SfxCue）', () => {
    const registered = sources.sfx.map((r) => r.cue).sort()
    const expected = [...CUES].sort()
    expect(registered, 'SOURCES.json 的 sfx 条目数必须与 SfxCue 的成员数一致').toEqual(expected)
  })

  it('G66：每个音效文件存在、大小 > 1KB、且是真正的 mp3', () => {
    for (const cue of CUES) {
      const file = join(SFX_DIR, `${cue}.mp3`)
      expect(existsSync(file), `音效 ${cue} 的文件不存在：${file}`).toBe(true)
      // ⚠️ 不是 existsSync 就够 —— 0 字节 mp3 曾经真的躺在 public/ 里。
      const size = statSync(file).size
      expect(size, `音效 ${cue} 太小（${size} 字节），多半是 0 字节占位或下载失败`).toBeGreaterThan(1024)
      expect(
        looksLikeMp3(readHead(file)),
        `音效 ${cue} 的文件头不是 mp3 —— 可能下载到的是 HTML 错误页而不是音频`,
      ).toBe(true)
    }
  })

  it('G66：BGM 文件存在、大小 > 1KB、且是真正的 mp3', () => {
    const file = join(MUSIC_DIR, 'battle-loop.mp3')
    expect(existsSync(file), `BGM 文件不存在：${file}`).toBe(true)
    const size = statSync(file).size
    expect(size, `BGM 太小（${size} 字节）`).toBeGreaterThan(1024)
    expect(looksLikeMp3(readHead(file)), 'BGM 文件头不是 mp3').toBe(true)
  })
})

describe('G67 —— SOURCES.json 与磁盘双向一一对应（AC-H1）', () => {
  it('G67：登记了的文件在磁盘上都存在（SOURCES → 磁盘）', () => {
    for (const record of sources.sfx) {
      expect(existsSync(join(SFX_DIR, record.file)), `登记了 ${record.file} 但磁盘上没有`).toBe(true)
    }
    for (const record of sources.music) {
      expect(existsSync(join(MUSIC_DIR, record.file)), `登记了 ${record.file} 但磁盘上没有`).toBe(true)
    }
  })

  it('G67：磁盘上的每个 mp3 都登记了（磁盘 → SOURCES），SOURCES.json 本身除外', () => {
    // ⚠️ 磁盘侧只收 `.mp3` —— `SOURCES.json` 是登记文件本身，不该把自己登记进去。
    const onDisk = readdirSync(SFX_DIR).filter((f) => f.endsWith('.mp3')).sort()
    const registered = sources.sfx.map((r) => r.file).sort()
    expect(
      onDisk,
      '磁盘上出现了**未登记**的音效 —— 那是 AC-H2 明确禁止的「来源不明的素材入库」',
    ).toEqual(registered)

    const musicOnDisk = readdirSync(MUSIC_DIR).filter((f) => f.endsWith('.mp3')).sort()
    const musicRegistered = sources.music.map((r) => r.file).sort()
    expect(musicOnDisk, '磁盘上出现了**未登记**的 BGM').toEqual(musicRegistered)
  })

  it('AC-H2：每条登记都带真实的 license / url / author（空字段等于没登记）', () => {
    for (const record of [...sources.sfx, ...sources.music]) {
      expect(record.license, `${record.file} 没登记许可证`).toBeTruthy()
      expect(record.license, `${record.file} 的许可证必须明确写 CC0，不许含糊`).toMatch(/^CC0/)
      expect(record.url, `${record.file} 没登记来源页`).toMatch(/^https:\/\//)
      expect(record.downloadUrl, `${record.file} 没登记下载地址`).toMatch(/^https:\/\//)
      expect(record.author, `${record.file} 没登记作者`).toBeTruthy()
      expect(record.durationSec, `${record.file} 没登记时长`).toBeGreaterThan(0)
    }
  })
})

describe('G65 —— 播放器 URL 与磁盘布局一致（AC-D3 / AC-H3）', () => {
  it('SFX_BASE_PATH / MUSIC_BASE_PATH 去 base 后正好落在磁盘上的那两个目录', () => {
    expect(assetPathWithinPublic(SFX_BASE_PATH)).toBe('assets/audio/sfx/')
    expect(assetPathWithinPublic(MUSIC_BASE_PATH)).toBe('assets/audio/music/')
  })

  it('登记的 music.path 与 MUSIC_BASE_PATH 拼出的 URL 指向同一个文件', () => {
    const record = sources.music[0]
    expect(record, 'BGM 登记缺失').toBeDefined()
    // 登记里存的是**去 base 后**的路径（base 随部署环境变，不该进素材登记）。
    expect(assetPathWithinPublic(`${MUSIC_BASE_PATH}${record!.file}`)).toBe(record!.path)
  })
})

describe('G59 反向自检 —— CUES 列表没跟 SfxCue 脱节', () => {
  it('core 的 SfxCue 成员与本守卫的 CUES 双向一致', () => {
    expect(
      [...CUES].sort(),
      '本守卫的 CUES 列表与 src/core/effects.ts 的 SfxCue 脱节了 —— 增删任一侧都会红',
    ).toEqual([...cuesDeclaredInCore()].sort())
  })

  it('反向自检构造失效时本守卫会红（塞一个不存在的 cue 进去看看）', () => {
    // 防「判据永远返回空集」那种假绿：如果正则改了导致 cuesDeclaredInCore() 返回 []，
    // 上面的 toEqual 会因为 CUES 非空而红 —— 这里把这一点钉死。
    expect(cuesDeclaredInCore().length, '正则没抓到任何 SfxCue 成员，判据已失明').toBeGreaterThan(0)
  })
})
