/**
 * 「本单元的词条与本单元的录音一一对应」这条判据的**唯一**出处。
 *
 * ── 为什么抽出来（Story 2.5 / [CR] Task 9.2，守卫 **G289**）──────────────────
 *   单元 1 的 AC-15 那组断言（录音条数 / id 集合相等 / 非 0 字节 / manifest 哈希 /
 *   「每条录音都有被朗读的地方」）原先是 `tests/content/unit-01.test.ts` 的
 *   **模块私有代码**。单元 2 落地后，单元 1 那组断言**一个字都没改**，
 *   而单元 2 的新测试文件**一条都没写** ⇒ 单元 2 的录音与词条脱节时**没有任何报错**。
 *   ⇒ 两个选择：① 复制一份到单元 2（**复制链**，R-37：两份会漂移，单元 2 那份恒绿）；
 *     ② 抽到这里共用（一处改，两处生效）。⇒ 选 ②。
 *
 * ── 判据本体是**纯函数**（吃数据，不碰磁盘）────────────────────────────────
 *   反向自测要能「把违规形态真写进去，断言这条守卫会红」——
 *   若判据直接读磁盘，反向自测只能靠**真的动磁盘**（写临时文件），
 *   既慢又容易在 CI 上留下垃圾。⇒ 这里把「磁盘上的事实」抽成参数，
 *   判据本体只对数据下判断，正向用例喂真数据、反向自测喂假数据。
 *   ⇒ 判据被掏空时反向自测照样红（R-51）。
 *
 * ── 按**单元前缀**分组，不扫整个 voice 目录 ────────────────────────────────
 *   Story 2.5 / Task 6.2 已经踩过一次：扫整个目录 ⇒ 单元 2 的录音会拿单元 1 的
 *   集合来比 ⇒ 一条**跨单元**的假红。⇒ 这里所有比较都限定在 `prefix` 之内。
 */

import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect } from 'vitest'

const root = fileURLToPath(new URL('../../', import.meta.url))
const voiceDir = join(root, 'public/assets/audio/voice')

export interface VoiceManifestEntry {
  text: string
  sha256: string
  bytes: number
}

export interface VoiceManifest {
  entries: Record<string, VoiceManifestEntry>
}

/** 词条侧：判据只需要 entryId 与卡面文字。 */
export interface VoiceAssetEntry {
  entryId: string
  card: { promptText: string }
}

/** 录音侧：磁盘上的事实。 */
export interface VoiceAssetFile {
  id: string
  bytes: number
  sha256: string
}

/** 读磁盘上的 voice 目录，返回该前缀下的录音事实与整份 manifest。 */
export function readVoiceAssets(prefix: string): {
  files: VoiceAssetFile[]
  manifest: VoiceManifest
} {
  const manifest = JSON.parse(readFileSync(join(voiceDir, 'manifest.json'), 'utf8')) as VoiceManifest

  const files = readdirSync(voiceDir)
    .filter((name) => name.endsWith('.mp3'))
    .map((name) => name.slice(0, -'.mp3'.length))
    .filter((id) => id.startsWith(prefix))
    .sort()
    .map((id) => ({
      id,
      bytes: statSync(join(voiceDir, `${id}.mp3`)).size,
      sha256: createHash('sha256').update(readFileSync(join(voiceDir, `${id}.mp3`))).digest('hex'),
    }))

  return { files, manifest }
}

/**
 * **G289 的判据本体** —— 八条轴，正向用例与反向自测都调它。
 *
 * ⚠️ 消息里都带**稳定片段**，反向自测用 `toThrow('片段')` 逼它必须在
 *   对应那一条上炸，而不是被别的断言先炸掉。
 */
export function assertVoiceAssetsMatchEntries(
  prefix: string,
  entries: readonly VoiceAssetEntry[],
  files: readonly VoiceAssetFile[],
  manifest: VoiceManifest,
): void {
  // ① 录音条数 === 词条数（少一条 ⇒ 运行时静默降级到设备 TTS）
  expect(
    files.length,
    `录音条数与词条数不一致：磁盘上 ${prefix} 前缀的录音有 ${files.length} 条，` +
      `而本单元词条有 ${entries.length} 条 —— 少一条会静默降级到设备 TTS，多一条说明词表被改过`,
  ).toBe(entries.length)

  // ② entryId 集合 === 录音 id 集合（两个方向都为空）
  expect(
    [...entries.map((entry) => entry.entryId)].sort(),
    `内容与录音不一致：本单元词条 id 集合与 ${prefix} 前缀的录音文件名集合不相等`,
  ).toEqual(files.map((file) => file.id))

  // ③ 每条录音非 0 字节（0 字节 ⇒ `new Audio()` 收 error 事件，静默降级）
  for (const file of files) {
    expect(
      file.bytes,
      `${file.id}.mp3 是 0 字节 ⇒ 运行时 new Audio() 收 error 事件，静默降级到设备 TTS`,
    ).toBeGreaterThan(0)
  }

  // ④ 每条录音的内容与 manifest 记录一致（跳过判据是**哈希**，不是「文件存在」）
  for (const file of files) {
    const recorded = manifest.entries[file.id]
    expect(
      recorded,
      `${file.id}.mp3 没有 manifest 溯源记录 ⇒ 运行时无法校验这条录音是不是本词条的`,
    ).toBeDefined()
    expect(
      file.sha256,
      `${file.id}.mp3 的内容与 manifest 不符（半截文件 / 被手工改过 / 换了语速重生成）`,
    ).toBe(recorded?.sha256)
  }

  // ⑤ 每条录音都有被朗读的地方（没有「只当选项、不当题面」的孤儿录音）
  const prompts = new Set(entries.map((entry) => entry.card.promptText))
  for (const file of files) {
    const recorded = manifest.entries[file.id]
    expect(
      prompts.has(recorded?.text ?? ''),
      `${file.id} 的录音「${recorded?.text}」在任何一张卡的卡面上都不出现 —— ` +
        '要么它该当题面却只当选项，要么词表与内容层已经脱节',
    ).toBe(true)
  }

  // ⑥ 每条词条的卡面文字 === 该词条录音里被朗读的文本（方向与 ⑤ 相反）
  for (const entry of entries) {
    const recorded = manifest.entries[entry.entryId]
    expect(
      recorded,
      `${entry.entryId} 没有录音溯源记录（manifest 里查不到）⇒ 读取时会静默降级到设备 TTS`,
    ).toBeDefined()
    expect(
      entry.card.promptText,
      `${entry.entryId} 的卡面文字与录音内容不一致 ⇒ 孩子看到的字与听到的声音对不上`,
    ).toBe(recorded?.text)
  }

  // ⑦ manifest 里**没有孤儿条目**（清单有、磁盘上没有 ⇒ 清单与产物脱节）
  //
  // ⚠️ **为什么这条是新的**（2026-10-28 `[CR]` 第二轮补）：第 ① ② 两条比较的是
  //   「**磁盘上的文件** ↔ **内容层的词条**」，**从未**比较
  //   「**manifest 的 key** ↔ **磁盘上的文件**」
  //   ⇒ 一条 manifest 条目如果**既没有对应的 mp3、也不在内容层**（典型的形态：
  //   录音被删了、manifest 忘了同步），**前六条轴一条都抓不到**
  //   （条目数不变、id 集合不变、哈希那条因为没有文件可循环而根本不执行）。
  const manifestIds = Object.keys(manifest.entries)
    .filter((id) => id.startsWith(prefix))
    .sort()
  expect(
    manifestIds,
    `manifest 里 ${prefix} 前缀的条目集合与磁盘上的录音文件集合不相等 —— ` +
      '清单里有、磁盘上没有 = 孤儿溯源记录（录音被删了但清单没跟着删）；' +
      '磁盘上有、清单里没有 = 第 ④ 轴会报出来',
  ).toEqual(files.map((file) => file.id))

  // ⑧ manifest 记录的字节数 === 磁盘上的实际字节数
  //
  // ⚠️ **为什么这条不是第 ④ 轴的重复**：`bytes` 是 manifest 里**记了但从来没被比过**
  //   的字段（换源后 17 条 mp3 的 `bytes` 全部无人核对）⇒ 清单可以被手工改成
  //   一个与文件不符的数而**不报任何错**。它也是「文件是否被换过」的一道
  //   **廉价**旁证（比整份哈希便宜）。
  for (const file of files) {
    const recorded = manifest.entries[file.id]
    expect(
      recorded?.bytes,
      `${file.id}.mp3 的 manifest 字节数（${recorded?.bytes}）与磁盘上的实际字节数（${file.bytes}）不符`,
    ).toBe(file.bytes)
  }
}
