/**
 * 朗读录音批量生成（Story 1.3 / 架构决策 7 硬约束 1；Story 1.6 起改从内容层取词表）。
 *
 * 把 `src/content/` 里每条词条的**卡面题面**合成为统一音色的 mp3，
 * 落到 `public/assets/audio/voice/<词条id>.mp3`，**提交进 git**。
 *
 * ── 为什么直接调 HTTP API，而不是包一层 mmx CLI ──────────────────────────
 * ① 架构决策 7 的字面要求就是「开发期批量调用 MiniMax TTS API」。
 * ② AC-7 要求把 API 的 `base_resp.status_code` 打进失败清单，CLI 的输出契约给不出。
 * ③ AC-6/AC-7 需要可控的「跳过已存在 / 有限重试 / 写临时文件再 rename」语义，
 *    这些在 CLI 外面包一层只会变成解析它的日志文本 —— 脆且不可测。
 *
 * ── 为什么走 tsx，而不是 Node 原生 type stripping ──────────────────────
 * 沿用 `scripts/balance-sim.ts` 既有注释：原生方案不支持 enum，会给整个
 * `src/core/` 施加一条与本架构无关的书写约束。
 *
 * ── 词表为什么从 `src/content/` 取（Story 1.6 改）──────────────────────
 * 原本这里有一份独立的 `scripts/data/voice-entries.json`。它与 `src/content/` 的
 * 单元文件是**同一份词表的两个事实源** —— 而两份事实源就是漂移的种子
 * （同架构决策 10：「平衡模拟是 TypeScript，避免两份数值漂移」）。
 * 那个文件自己的 `note` 字段也写着「Story 1.6 录入后须同步」，靠人记着的同步迟早会漏。
 * 现在：内容层是唯一事实源，`UnitSchema` 在 import 时就校验过，
 * 录音要朗读的文本**就是**孩子会看到的卡面 —— 两者不可能各说各话。
 *
 * ⚠️ 旧注释曾说「import `src/` 会撞 TS6307」：那是 Story 1.3 时的实况
 *   （`tsconfig.node.json` 不含 `scripts/`，本文件不在任何项目里）。
 *   现在 `scripts/` 与 `src/content/` 下的所有 `.ts` **同时**列在 `tsconfig.test.json`
 *   的 include 里（Story 1.6 / AC-30 加的），实测不再报 TS6307 ——
 *   改回「不 import」之前请先跑一次 `npm run typecheck` 看这个前提是否还成立。
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// 内容层：词表的唯一事实源（Story 1.6 起，理由见文件头）。
//
// ⚠️ [CR] 2026-10-14：这行 import 原先在**此处**，作用是「import 本模块就跑一遍
//   `UnitSchema` 校验，内容坏了在发第一个请求之前抛出来」。现在 import 移进了
//   `main()` 的 try 里（见那里的动态 import 与理由）—— 校验时机没变早也没变晚，
//   但内容坏掉时用户看到的是 `[voice] …` 一行 + 退出码 1，而不是绕过全部 try 的堆栈。
//   代价：测试 import 本模块不再顺带跑一次内容校验 —— 那条校验由
//   `npm run validate:content`（`prebuild` / `pretest`）与 `tests/content/*` 承担。

// ── 常量（架构 Configuration：本文件的参数归属）──────────────────────────
//
// ⚠️⚠️ 改 VOICE_MODEL / VOICE_ID / VOICE_SPEED / VOICE_PITCH 任意一行 = **全量重生成**。
// 音色一致性是本脚本存在的全部理由：孩子在任何设备上听到的发音必须是产品的
// 确定常量，而不是「设备上恰好装了哪个语音引擎」的偶然产物（支柱 1 / FR）。

/** 模型 ID。价格 3.5 元/万字符（国内站按量计费），限流 60 RPM。 */
const VOICE_MODEL = 'speech-2.8-hd'
/** 英式女童声（EN-British / Female / Child）。⚠️ 改了要全量重生成。 */
const VOICE_ID = 'English_LovelyGirl'
/** 0.9 略慢于常速 —— 目标是 6 岁半的孩子，不是英语考试听力。⚠️ 改了要全量重生成。 */
const VOICE_SPEED = 0.9
/** 输出容器。⚠️ 改了要全量重生成。 */
const VOICE_FORMAT = 'mp3'

/**
 * 音高（`voice_setting.pitch`）。**默认 0**，即「不改变音高」。
 *
 * ⚠️ 改了要全量重生成（与上面三个常量同一条纪律）。
 *
 * ── 为什么默认态**不把这个字段发出去**（Story 3.4 / Task 1.1 实测）─────────
 * 已提交的 75 条录音是**引入 `pitch` 之前**的脚本产物。若从今天起每个请求都带上
 * `pitch: 0`，请求体就与产出那 75 条时的请求体**不再逐字节相同** ⇒
 * 「已提交的录音仍是当前脚本能复现的产物」这句话就失去了依据。
 * 而 Task 1.1 原本打算用「两次请求的音频逐字节相同」来证明等价 ——
 * **实测证明这条判据本身不成立**（TTS 无 `seed`，**同一请求体发两次，响应音频也不相同**），
 * 于是唯一站得住的等价论证就是「**默认态的请求体与之前逐字节相同**」。
 * ⇒ `pitch` 只在 ≠ 0 时进请求体（见 `buildRequestBody`）。
 *
 * ⚠️ **取值本身不是本 story 定的**（裁决 A）：AC-2 逐字把判断标准交给
 * 「孩子听长句时能稳定提取关键词」，那是人的耳朵说了算（R-20 / R-21）。
 * 官方文档写 `pitch` 是 int、取值 −12..12、默认 0；2026-10-25 实测确认
 * 0 / −1 / 12 / 99 都被接受（业务码 0），但**取值由人裁决**。
 */
const VOICE_PITCH = 0

/** speech-2.8-hd 国内站按量价：3.5 元 / 万字符。`[CS]` 2026-10-13 按官方定价页核实。 */
const PRICE_PER_10K_CHARS = 3.5

/** 采样率 / 码率 / 声道。已由 §0 探测的实测请求体确认可用。 */
const SAMPLE_RATE = 32_000
const BITRATE = 128_000
const CHANNEL = 1

/**
 * CN region 域名。国际站是 `api.minimax.io`，两者不通用。
 * 端点与 `output_format` 的语义见官方 t2a_http 文档。
 */
const API_ENDPOINT = 'https://api.minimaxi.com/v1/t2a_v2'

/**
 * 产物目录。**不按单元分层** —— 目录结构是 `assets/audio/{music,sfx,voice}/`，
 * 录音靠文件名里的单元前缀（`u1-dog`）区分。分层会让运行时查找路径与
 * `new Audio(`${RECORDING_BASE_PATH}${entryId}.mp3`)` 对不上，每条都 404。
 */
const OUTPUT_DIR = 'public/assets/audio/voice'

/**
 * 溯源清单。与录音同目录、一起提交进 git —— 换设备、换人接手都能看出
 * 磁盘上的录音是哪组参数生成的。skip 判定的依据就是它，而不是「文件碰巧在」。
 *
 * ⚠️ 路径**由 `outputDir` 推导**，不写死（Story 3.4 / Task 3.1）：
 *   守卫要能在临时目录里驱动「指纹不匹配 ⇒ 拒跑」这条路径，
 *   而产物目录写死的话，测试会把它**真的**写回仓库里那个已提交的 manifest。
 */
export function manifestFileIn(outputDir: string): string {
  return join(outputDir, 'manifest.json')
}

/** 文件内容的 sha256。逐条核对用，38 条不到 1 MB，成本可忽略。 */
export function hashFileSync(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/**
 * 列出产物目录里已有的录音文件名（只要文件名，不递归子目录）。
 *
 * 用途只有一个：**「没有 manifest 但盘上有 mp3」这个组合是否存在** ——
 * 那意味着盘上的录音**来源不明**（Story 3.4 / AC-7 的第二个 Given 块）。
 * 目录不存在 ⇒ 返回空数组（那是一次性首跑的正常形态）。
 */
export function listVoiceMp3s(outputDir: string): string[] {
  try {
    return readdirSync(outputDir)
      .filter((name) => name.endsWith('.mp3'))
      .sort()
  } catch {
    return []
  }
}

/**
 * 落盘 manifest。走原子写，与录音同一套理由：写一半被杀会留下一个
 * 能被 `parseManifest` 读成「合法但条目不全」的 JSON，下次跑就会漏校验。
 *
 * ⚠️ 目录与文件名都由参数 `outputDir` 推导（Story 3.4 / Task 3.1）——
 *   这里**不许**回落到模块级常量，否则一次测试运行就会覆盖仓库里
 *   已提交的 75 条溯源记录。
 */
export function writeManifestFile(manifest: VoiceManifest, outputDir: string = OUTPUT_DIR): void {
  mkdirSync(outputDir, { recursive: true })
  const manifestFile = manifestFileIn(outputDir)
  const tmp = `${manifestFile}.tmp`
  writeFileSync(tmp, `${JSON.stringify(manifest, null, 2)}\n`)
  renameSync(tmp, manifestFile)
}

// ⚠️ 旧的 `ENTRIES_FILE = data/voice-entries.json` 已在 Story 1.6 删除 ——
//   词表改从 `src/content/` 取（见文件头与 `entriesFromContent`）。

/** 单条词条的尝试次数上限（含第一次）。4xx 不重试，所以不会真的走到 3 次。 */
const MAX_ATTEMPTS = 3
/** 指数退避：第 1、2 次失败后各等这么久。只对可重试错误生效。 */
const BACKOFF_MS = [1000, 2000]

/**
 * 请求间隔（毫秒）。**不为 0** —— 这是实跑教出来的（Story 1.3 / 2026-10-13）。
 *
 * 官方 HD 系列限 60 RPM。原以为单元 1 的 ~38 条撞不上，实测间隔为 0 时
 * **第 24 条就拿到业务码 1002（rate limit exceeded RPM）**，整批夭折。
 * 1500ms ⇒ 40 请求/分钟，落在限额内且留了余量。
 *
 * ⚠️ 词量再上一个量级时**必须**重新核算：`n × 1.5s`。
 *   `tests/scripts/generate-voice.test.ts` 有一条断言守着「当前词表能在
 *   一个 60 秒窗口内跑完」，词表变大时它会立刻变红提醒重调。
 */
export const REQUEST_INTERVAL_MS = 1500

/**
 * 限流的业务码。官方对「超出 RPM」返回 1002，与「key 无效 1004」同属
 * `base_resp.status_code` 非 0，但性质完全相反：前者是瞬时故障，退避即可；
 * 后者重试一万次也一样。
 *
 * ⚠️ 这条区分是实跑逼出来的：把 1002 当成永久失败会让整批在第 24 条夭折，
 * 而它本该退避 3 秒后继续。
 */
const RATE_LIMIT_CODE = 1002

// ── 纯逻辑（可测，副作用一律留在 main）──────────────────────────────────

export interface VoiceEntry {
  id: string
  text: string
}

export interface Failure {
  id: string
  /** 取自响应的 `base_resp.status_code`；HTTP 层失败时是 HTTP 状态码。 */
  code: string
  msg: string
}

/**
 * 内容层里本脚本真正需要的两项。
 *
 * 故意写成**结构化窄类型**而不是直接收 `Unit`：测试能用两行的最小 fixture 驱动它，
 * 不必为了测「两个单元撞名」而手搓一份合法的完整单元（合法 fixture 本身要 4 条词条起步）。
 */
export interface ContentUnitLike {
  readonly unitNumber: number
  readonly entries: readonly {
    readonly entryId: string
    readonly card: { readonly promptText: string }
  }[]
}

/**
 * 把内容层摊平成「id + 被朗读文本」。
 *
 * 校验分工（Story 1.6 改）：
 * · **id 形态、单元内重复、空卡面** —— 由 `UnitSchema` 在 import `src/content/` 时守，
 *   本函数拿到的数据已经过闸，不再重复一份规则（两份规则就是两份漂移的种子）。
 * · **跨单元重复** —— `UnitSchema` 看不到（它一次只校验一个单元），而录音目录
 *   `audio/voice/` 是**平铺的、不按单元分层**，两个单元的同名 id 会互相覆盖 mp3。
 *   所以这一条留在生成侧守：它在花费 API 费用之前就会抛出来。
 */
export function entriesFromContent(units: readonly ContentUnitLike[]): VoiceEntry[] {
  const seen = new Map<string, number>()
  const entries: VoiceEntry[] = []

  for (const unit of units) {
    for (const entry of unit.entries) {
      const owner = seen.get(entry.entryId)
      if (owner !== undefined) {
        throw new Error(
          `[voice] 词条 id 跨单元重复：${entry.entryId} 同时出现在单元 ${owner} 与单元 ` +
            `${unit.unitNumber} —— 录音目录不按单元分层，两处同名会互相覆盖 mp3`,
        )
      }
      if (entry.card.promptText.trim() === '') {
        throw new Error(
          `[voice] 词条 ${entry.entryId} 的卡面文本为空 —— 会合成一段静默的 mp3` +
            '（被朗读的是卡面题面，不是选项）',
        )
      }
      seen.set(entry.entryId, unit.unitNumber)
      entries.push({ id: entry.entryId, text: entry.card.promptText })
    }
  }

  if (entries.length === 0) {
    throw new Error('[voice] 内容层里没有词条 —— 没有任何录音可生成')
  }
  return entries
}

/** 按字符数估费用，四舍五入到 6 位小数（≈ 0.001 厘元，够细且不引入浮点噪声）。 */
export function estimateCost(chars: number): number {
  return Math.round((chars / 10_000) * PRICE_PER_10K_CHARS * 1e6) / 1e6
}

// ── 溯源 manifest ──────────────────────────────────────────────────────────

/**
 * 决定录音长什么样的那几个常量。
 *
 * ⚠️ 为什么非得有它：跳过判据是「文件存在」。只靠存在性，磁盘上的 mp3 到底是用
 * 哪组参数生成的**无从判断** —— 改完 `VOICE_SPEED` 重跑，脚本会报「跳过 38 条」，
 * 于是 38 条按新语速生成的假设出货，实际全是旧语速的录音，而且没有任何报错。
 * 「孩子在任何设备上听到的发音都是产品的确定常量」这句话，靠存在性守不住。
 */
export interface VoiceFingerprint {
  model: string
  voice_id: string
  speed: number
  format: string
  /** 音高。⚠️ 2026-10-25 起进指纹（Story 3.4 / AC-6）。 */
  pitch: number
}

/** 指纹里某个键的取值类型。 */
export type FingerprintValue = string | number

/**
 * **磁盘上读到的**指纹 —— 可能**缺键**。
 *
 * ⚠️ 缺键不是「异常」，而是**历史产物**的正常形态：
 *   `pitch` 是 2026-10-25 才加进指纹的（Story 3.4），
 *   而已提交的 manifest 是那之前生成的 ⇒ 它没有 `pitch` 这个键。
 *   ⇒ 类型上必须允许缺键，否则读历史 manifest 就要靠 `as` 硬转。
 */
export type StoredFingerprint = Partial<Record<keyof VoiceFingerprint, FingerprintValue>>

/**
 * **历史默认值**：manifest 里**缺**某个键时，按这里的值解释。
 *
 * ⚠️⚠️ **方向不能搞反**（Story 3.4 / AC-6 / §3.1）：
 *   - ✅ 缺键 ⇒ 取**历史默认值**（`pitch` ⇒ 0）：现状（`VOICE_PITCH = 0`）仍然有效，
 *     75 条录音不必重生成；而一旦有人把 `VOICE_PITCH` 改成 2，就**不匹配** ⇒ 拒跑 + 报红。
 *   - ❌ 缺键 ⇒ 取**当前常量值**（`{...cur, ...manifest}`）：那等于把「改了参数却没重生成」
 *     这件事**归一成正常** ⇒ AC-6 整个失效。
 *
 * ⚠️ **这张表只能含 `pitch: 0`** —— `model` / `voice_id` / `speed` / `format`
 *   在已提交 manifest 里**一直都在**，它们「缺键」本身就是异常；
 *   把任何一个放进默认表 = 把异常归一成正常（守卫 G310 也就抓不到「manifest 少了一个键」）。
 */
export const HISTORICAL_DEFAULTS: Readonly<StoredFingerprint> = { pitch: 0 }

export interface ManifestEntry {
  text: string
  sha256: string
  bytes: number
}

export interface VoiceManifest {
  fingerprint: StoredFingerprint
  entries: Record<string, ManifestEntry>
}

export function currentFingerprint(): VoiceFingerprint {
  return {
    model: VOICE_MODEL,
    voice_id: VOICE_ID,
    speed: VOICE_SPEED,
    format: VOICE_FORMAT,
    pitch: VOICE_PITCH,
  }
}

/**
 * 把磁盘上读到的指纹**归一化**（缺键 ⇒ 历史默认值）。
 *
 * 归一化只有这一处实现 —— `fingerprintMatches` / `fingerprintDiff` / 守卫 G310
 * 全走它（R-37：判据只有一份）。
 */
export function normalizeFingerprint(stored: StoredFingerprint): StoredFingerprint {
  return { ...HISTORICAL_DEFAULTS, ...stored }
}

/**
 * 指纹是否与当前常量**完全一致**。
 *
 * ⚠️⚠️ **必须逐键比较，且键集合必须恰好相等**（Story 3.4 / AC-6 / §3.1）：
 *   - 原来的写法是 `JSON.stringify(m.fingerprint) === JSON.stringify(currentFingerprint())`
 *     —— **键序敏感**。而归一化用 `{...HISTORICAL_DEFAULTS, ...stored}` 会把 `pitch`
 *     排到**最前**，`currentFingerprint()` 里它排在**最后**
 *     ⇒ 两个序列化结果**必然不等** ⇒ 现状（`VOICE_PITCH = 0`）会被**误判为不匹配**
 *     （G310 假红 + 脚本无端拒跑）—— 那正是「75 条录音不必重生成」这条承诺的破口。
 *   - 只比「当前常量有的那几个键」也不行：manifest 里**多出来的键**会被放过。
 * ⇒ 三件事一起做：① 键数相等 ② 当前常量的每个键都在归一化结果里 ③ 值逐个 `===`。
 */
export function fingerprintMatches(m: VoiceManifest): boolean {
  const cur = currentFingerprint()
  const norm = normalizeFingerprint(m.fingerprint)
  const curKeys = Object.keys(cur) as (keyof VoiceFingerprint)[]
  if (Object.keys(norm).length !== curKeys.length) return false
  for (const k of curKeys) {
    if (!Object.prototype.hasOwnProperty.call(norm, k)) return false
    if (norm[k] !== cur[k]) return false
  }
  return true
}

/**
 * 差异的可读描述。**指名到键** —— 脚本拒跑时靠它告诉人「哪个键、从什么变成什么」。
 *
 * 三种差异都要说出来：值不同、当前常量有而 manifest 缺、manifest 有而当前常量没有。
 */
export function fingerprintDiff(m: VoiceManifest): string {
  const cur = currentFingerprint()
  const norm = normalizeFingerprint(m.fingerprint)
  const parts: string[] = []
  for (const k of Object.keys(cur) as (keyof VoiceFingerprint)[]) {
    if (!Object.prototype.hasOwnProperty.call(norm, k)) {
      parts.push(`${k}: 缺失 → ${String(cur[k])}`)
      continue
    }
    if (norm[k] !== cur[k]) {
      parts.push(`${k}: ${String(norm[k])} → ${String(cur[k])}`)
    }
  }
  for (const k of Object.keys(norm)) {
    if (!Object.prototype.hasOwnProperty.call(cur, k)) {
      parts.push(`${k}: 多余键 ${String(norm[k as keyof VoiceFingerprint])}`)
    }
  }
  return parts.join('，')
}

/** manifest 读不出来（文件不存在 / 不是合法 JSON / 结构不对）时返回 null，调用方据此走「无溯源」通路。 */
export function parseManifest(raw: string | null): VoiceManifest | null {
  if (raw === null) return null
  try {
    const parsed = JSON.parse(raw) as VoiceManifest
    if (parsed === null || typeof parsed !== 'object') return null
    if (typeof parsed.fingerprint !== 'object' || parsed.fingerprint === null) return null
    if (typeof parsed.entries !== 'object' || parsed.entries === null) return null
    return parsed
  } catch {
    return null
  }
}

export type SkipReason =
  /** 已存在且 sha256 与 manifest 记录一致 —— 真的可以信。 */
  | 'verified'
  /** 已存在但没有溯源记录（manifest 缺失，或这条是新增词条）—— 仍可跳过，但要说出来。 */
  | 'unrecorded'
  /** 磁盘上没有。 */
  | 'missing'
  /** 磁盘上有了但内容对不上 manifest —— 半截文件、被手工改过、或换了常量。 */
  | 'corrupt'
  /** 文件本身没问题，但它是**另一个文本**录出来的 —— 卡面改了，录音没跟着改。 */
  | 'text-mismatch'

export interface SkipDecision {
  reason: SkipReason
  skip: boolean
}

export function decideSkip(
  id: string,
  fileExists: boolean,
  hashFile: (path: string) => string,
  target: string,
  manifest: VoiceManifest | null,
  /**
   * 本次**将要**朗读的文本（取自卡面 `promptText`）。
   *
   * ⚠️ [CR] 2026-10-14 补上这个参数：原先 `decideSkip` 只比 sha256，
   *   完全不看 manifest 里记录的 `text`。于是这条通路是通的 ——
   *   把 `unit-01.json` 里某个词的 `promptText` 从 "dog" 改成 "Dog!"
   *   （或加个句号），磁盘上的 mp3 一个字节没动、哈希照样对得上，
   *   判定就是 `verified` → 跳过 → **录音与卡面从此永久对不上**。
   *
   *   这与「文件存在 ≠ 文件正确」是同一条教训的下一层：那条守的是字节，
   *   这条守的是**字节所对应的那个文本**。校验放在 `unit-01.test.ts`
   *   （`promptText === manifest.text`），但那是**提交时**的一次性检查；
   *   录音脚本本身必须自己守住，否则「改内容 → 补录一条」这条日常动线上
   *   没有任何东西拦住人。
   */
  text: string,
): SkipDecision {
  if (!fileExists) return { reason: 'missing', skip: false }
  if (manifest === null) return { reason: 'unrecorded', skip: true }
  const recorded = manifest.entries[id]
  if (recorded === undefined) return { reason: 'unrecorded', skip: true }
  // 文本先比、哈希后比：文本变了的话，哈希必然也对不上，
  // 但那时报出来的是「corrupt（半截文件）」，会把人引向错误的方向。
  if (recorded.text !== text) return { reason: 'text-mismatch', skip: false }
  if (hashFile(target) !== recorded.sha256) return { reason: 'corrupt', skip: false }
  return { reason: 'verified', skip: true }
}

/**
 * 合成请求体。
 *
 * `output_format` 必须是 `'hex'`：`'url'` 返回的链接 **24 小时过期**，
 * 分批生成会在几天后静默拿到损坏文件 —— 而损坏的 mp3 在运行时只表现为
 * 「设备 TTS 偶尔音色不对」，极难归因到生成阶段。
 */
export function buildRequestBody(text: string): {
  model: string
  text: string
  stream: boolean
  output_format: string
  voice_setting: { voice_id: string; speed: number; pitch?: number }
  audio_setting: { format: string; sample_rate: number; bitrate: number; channel: number }
} {
  return {
    model: VOICE_MODEL,
    text,
    stream: false,
    output_format: 'hex',
    voice_setting: {
      voice_id: VOICE_ID,
      speed: VOICE_SPEED,
      // ⚠️ `pitch` **只在 ≠ 0 时才带上**（Story 3.4 / Task 1.1 的实测结论）：
      //   2026-10-25 实测确认 —— TTS **无 `seed`**，**同一请求体发两次，响应音频也不逐字节相同**
      //   ⇒ 「发两次比字节」这条等价性判据**本身不成立**，不能用来证明
      //   「加了 `pitch: 0` 之后产出的音频与之前一样」。
      //   ⇒ 唯一站得住的论证是**请求体逐字节相同**：默认态下 `pitch` 不进请求体，
      //   于是已提交的 75 条录音**仍然是当前脚本能复现的产物**（这条承诺不依赖 TTS 的随机性）。
      //   ⇒ 一旦有人把 `VOICE_PITCH` 改成非 0，字段就会发出去，
      //      而那时**必须整批重生成**（指纹闸会先拒跑，逼人走「删整个目录重跑全量」）。
      ...(VOICE_PITCH !== 0 ? { pitch: VOICE_PITCH } : {}),
    },
    audio_setting: {
      format: VOICE_FORMAT,
      sample_rate: SAMPLE_RATE,
      bitrate: BITRATE,
      channel: CHANNEL,
    },
  }
}

/**
 * 读 API key。**只读，不落盘、不打印。**
 *
 * 错误信息里只出现**变量名**，绝不出现变量值 —— key 会进 `Authorization` 头，
 * 一旦异常对象被 `console.error(err)` 整对象打出去，key 就进了 CI 日志。
 */
export function readApiKey(env: NodeJS.ProcessEnv): string {
  const key = env['MINIMAX_API_KEY']
  if (typeof key !== 'string' || key.trim() === '') {
    throw new Error(
      '[voice] 缺少环境变量 MINIMAX_API_KEY。请在仓库根的 .env 里配置（.env 已在 .gitignore），' +
        '参考 .env.example。',
    )
  }
  return key
}

// ── 批量执行 ────────────────────────────────────────────────────────────

export interface RunDeps {
  apiKey: string
  outputDir: string
  dry: boolean
  /**
   * `--force`：**用当前参数重录全部**（即使哈希一致、即使文件已存在）。
   *
   * ⚠️ 它**不越过指纹闸**（Story 3.4 / 裁决 F 的 (b) 方案）：
   *   闸的存在意义就是「参数变了就整批重来」，而越闸 + 部分失败
   *   会造出「旧音频 + 新指纹」那份真混批（裁决 F 逐字列了这条后果）。
   *   ⇒ `--force` 的适用范围是「参数没变，但想把全部录音重录一遍」。
   */
  force: boolean
  requestIntervalMs: number
  fetchImpl: typeof fetch
  fileExists: (path: string) => boolean
  writeFile: (path: string, data: Buffer) => void
  sleep: (ms: number) => Promise<void>
  log: (msg: string) => void
  error: (msg: string) => void
  /** 单次请求的中止信号。注入而非内建，测试才能证明它真的传到了 fetch。 */
  timeoutSignal: () => AbortSignal
  /** 文件内容的 sha256。注入以免测试真的去读盘。 */
  hashFile: (path: string) => string
  /** 文件字节数。 */
  fileSize: (path: string) => number
  /** 跑完把 manifest 落盘。 */
  writeManifest: (manifest: VoiceManifest) => void
  /** 启动时读到的 manifest；null = 无溯源。 */
  manifest: VoiceManifest | null
}

export interface RunResult {
  generated: number
  skipped: number
  failures: Failure[]
}

interface AttemptOk {
  ok: true
  audio: Buffer
}
interface AttemptErr {
  ok: false
  failure: Failure
  /** 瞬时故障（网络抖动 / 5xx / 429）可重试；4xx 与业务错误重试也不会变对。 */
  retryable: boolean
  /** 服务端通过 `Retry-After` 要求的等待时长。有值时优先于固定指数退避。 */
  retryAfterMs?: number
}
type Attempt = AttemptOk | AttemptErr

interface TtsResponseBody {
  base_resp?: { status_code?: number; status_msg?: string }
  data?: { audio?: string }
}

/** 单次请求的上限。挂死的 socket 会把整批冻住，唯一出路是 Ctrl-C。 */
const REQUEST_TIMEOUT_MS = 30_000

/**
 * 解出来的字节至少得像个 mp3。
 *
 * ⚠️ **为什么必须有这道闸**：跳过判据是「文件存在」。如果一个 0 字节或截断的
 * mp3 写进了正式名，它会被永久 skip，运行时 `new Audio()` 收到 `error` 事件
 * 静默降级到设备 TTS —— 孩子听到的只是「音色不对」，没有任何报错指向这个文件。
 * 原子写只防「写一半被杀」，**不防「整份写完但内容是垃圾」**，这两件事必须各有一道闸。
 *
 * mp3 只有两种开头：`ID3` 标签帧，或 MPEG 音频帧同步字（11 个 1，帧头第 2 字节的
 * 高 3 位也是 1）。两者都不匹配 ⇒ 这不是可播放的 mp3。
 */
const MIN_AUDIO_BYTES = 16

export function looksLikeMp3(buf: Buffer): boolean {
  if (buf.byteLength < MIN_AUDIO_BYTES) return false
  if (buf.subarray(0, 3).toString('latin1') === 'ID3') return true
  // 帧同步：0xFF 后跟 0xE0 掩码（MPEG 1/2/2.5 layer III 各版本）
  return buf[0] === 0xff && (buf[1]! & 0xe0) === 0xe0
}

/** hex 是否是合法的偶数长度十六进制串。`Buffer.from` 对畸形输入是静默截断而非报错。 */
function isWellFormedHex(hex: string): boolean {
  return hex.length % 2 === 0 && /^[0-9a-fA-F]*$/.test(hex)
}

/**
 * 从 `Retry-After` 头取服务端要求的等待时长。支持秒数与 HTTP-date 两种形式。
 *
 * 官方 HD 系列限 60 RPM。固定 1s/2s 退避在服务端明确要求更长时会持续撞线，
 * 而词量大到那个区间就会撞上。取不到就返回 undefined，调用方退回固定退避。
 */
export function parseRetryAfter(header: string | null, now: number = Date.now()): number | undefined {
  if (header === null) return undefined
  const raw = header.trim()
  if (raw === '') return undefined
  if (/^\d+$/.test(raw)) return Number(raw) * 1000
  const at = Date.parse(raw)
  if (Number.isNaN(at)) return undefined
  return Math.max(0, at - now)
}

/** 打一次 API。**不重试**，重试与退避由 runBatch 负责。 */
async function attemptOnce(id: string, text: string, deps: RunDeps): Promise<Attempt> {
  let res: Response
  try {
    res = await deps.fetchImpl(API_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${deps.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildRequestBody(text)),
      signal: deps.timeoutSignal(),
    })
  } catch (err) {
    // 只取 message：异常对象上可能带着请求头。
    return {
      ok: false,
      failure: { id, code: 'NETWORK', msg: err instanceof Error ? err.message : String(err) },
      retryable: true,
    }
  }

  let body: TtsResponseBody
  try {
    body = (await res.json()) as TtsResponseBody
  } catch (err) {
    return {
      ok: false,
      failure: {
        id,
        code: `HTTP_${res.status}`,
        msg: `响应不是合法 JSON：${err instanceof Error ? err.message : String(err)}`,
      },
      // 网关返回 HTML 错误页通常是临时的；交给重试判断比直接判死稳。
      retryable: res.status >= 500,
    }
  }

  // 先判 HTTP 层，再判业务层 —— 两层的错误码都要能打印（AC-7）。
  if (!res.ok) {
    return {
      ok: false,
      failure: {
        id,
        code: String(body.base_resp?.status_code ?? res.status),
        msg: body.base_resp?.status_msg ?? `HTTP ${res.status}`,
      },
      // 429 与 5xx 同为瞬时故障。业务码 1002 已被下面的分支覆盖，
      // 但网关层直接回 429 时走的是这条 —— 同样要退避重试，否则整批夭折。
      retryable: res.status >= 500 || res.status === 429,
      retryAfterMs: parseRetryAfter(res.headers.get('Retry-After')),
    }
  }

  const businessCode = body.base_resp?.status_code
  if (businessCode !== 0) {
    return {
      ok: false,
      failure: {
        id,
        code: String(businessCode ?? 'UNKNOWN'),
        msg: body.base_resp?.status_msg ?? '未知业务错误',
      },
      // 业务错误（音色下架、key 无效）重试多少次都不会变对；
      // 限流是唯一的例外 —— 它是瞬时故障，退避后必然能过去。
      retryable: businessCode === RATE_LIMIT_CODE,
      retryAfterMs: parseRetryAfter(res.headers.get('Retry-After')),
    }
  }

  const hex = body.data?.audio
  if (typeof hex !== 'string' || hex === '') {
    return {
      ok: false,
      failure: { id, code: 'EMPTY_AUDIO', msg: '响应里没有 data.audio' },
      retryable: true,
    }
  }
  if (!isWellFormedHex(hex)) {
    return {
      ok: false,
      failure: { id, code: 'BAD_HEX', msg: 'data.audio 不是偶数长度的十六进制串' },
      retryable: true,
    }
  }
  const audio = Buffer.from(hex, 'hex')
  if (!looksLikeMp3(audio)) {
    // 写下去会变成一个「存在但播不出声」的 mp3，且被续传永久跳过 —— 比直接失败糟得多。
    return {
      ok: false,
      failure: {
        id,
        code: 'BAD_AUDIO',
        msg: `解出 ${audio.byteLength} 字节，不像 mp3（无 ID3 帧头也无 MPEG 同步字）`,
      },
      retryable: true,
    }
  }
  return { ok: true, audio }
}

/**
 * 跑完整批词条。
 *
 * 副作用（fs / fetch / 计时）全部从 `deps` 注入，因此测试可以在零网络、
 * 零真实写盘的前提下跑完整条控制流。
 */
export async function runBatch(entries: VoiceEntry[], deps: RunDeps): Promise<RunResult> {
  const failures: Failure[] = []
  let generated = 0
  let skipped = 0

  // ── --dry：结构上保证一个网络请求都不发（提前 return，AC-5）────────────
  if (deps.dry) {
    let totalChars = 0
    for (const e of entries) {
      const chars = e.text.length
      totalChars += chars
      deps.log(`[voice]   ${e.id} → ${chars} 字符 → ¥${estimateCost(chars).toFixed(6)}`)
    }
    deps.log(
      `[voice] 总计：${entries.length} 条 / ${totalChars} 字符 / ¥${estimateCost(totalChars).toFixed(6)}`,
    )
    deps.log('[voice] --dry：未发起任何网络请求，也未写入任何文件')
    return { generated, skipped, failures }
  }

  let lastStarted = Number.NEGATIVE_INFINITY
  /** 本次跑完之后要落盘的 manifest —— 已有记录原样带入，新增条目补上哈希。 */
  const nextManifest: VoiceManifest = {
    fingerprint: currentFingerprint(),
    entries: { ...(deps.manifest?.entries ?? {}) },
  }

  for (const e of entries) {
    const target = join(deps.outputDir, `${e.id}.${VOICE_FORMAT}`)

    if (deps.force) {
      // `--force`：一律重录。⚠️ 刻意**不改** `decideSkip` 的签名与语义 ——
      //   它是导出的纯函数且有既有用例，绕过它比改它更不容易造出「两套跳过规则」。
      deps.log(`[voice] --force：${e.id} 不走跳过判定，重录`)
    } else {
      // 跳过判定只认正式名（不认 .tmp，见 writeFileAtomic），且要求**内容**对得上
      // manifest —— 「存在」不等于「正确」。半截文件、手工改过的文件、换了常量的
      // 旧录音都从这里被重新生成，而不是被当成已完成的产物跳过。
      const decision = decideSkip(
        e.id,
        deps.fileExists(target),
        deps.hashFile,
        target,
        deps.manifest,
        e.text,
      )
      if (decision.skip) {
        deps.log(`[voice] skip ${e.id}（${SKIP_REASON_TEXT[decision.reason]}）`)
        skipped += 1
        if (decision.reason === 'unrecorded') {
          // 首次运行（还没有 manifest）或词表新增一条，而磁盘上已经有它的录音。
          // 把现状登记进 manifest，下次它就能按「已验证」路径跳过。
          // ⚠️ 第一次跑（manifest 还不存在）时 deps.manifest 恰好是 null ——
          //    这里若再按 manifest 是否存在加一道门控，bootstrap 就永远登记不上。
          // ⚠️⚠️ 但这条登记**只在 manifest 存在时安全**：manifest 缺失 ⇒
          //    磁盘上的录音**来源不明**，把它们登记进新指纹 = 拿新参数给旧音频盖章。
          //    CLI 那侧已经用「没有 manifest 但盘上有 mp3 ⇒ 拒跑」堵住了这条路
          //    （Story 3.4 / AC-7 的第二个 Given 块）。
          nextManifest.entries[e.id] = {
            text: e.text,
            sha256: deps.hashFile(target),
            bytes: deps.fileSize(target),
          }
        }
        continue
      }
      if (decision.reason === 'corrupt') {
        deps.log(`[voice] ${e.id} 已存在但内容与 manifest 不符（半截文件或被改过）—— 重新生成`)
      }
    }

    let last: AttemptErr | null = null
    for (let n = 1; n <= MAX_ATTEMPTS; n += 1) {
      if (deps.requestIntervalMs > 0) {
        const wait = deps.requestIntervalMs - (Date.now() - lastStarted)
        if (wait > 0) await deps.sleep(wait)
      }
      lastStarted = Date.now()

      const result = await attemptOnce(e.id, e.text, deps)
      if (result.ok) {
        deps.writeFile(target, result.audio)
        deps.log(`[voice] ok ${e.id}（${result.audio.byteLength} 字节）`)
        generated += 1
        nextManifest.entries[e.id] = {
          text: e.text,
          sha256: deps.hashFile(target),
          bytes: result.audio.byteLength,
        }
        last = null
        break
      }
      last = result
      if (!result.retryable) break
      // 服务端明确说了等多久就照做；没说才退回固定指数退避。
      const backoff = result.retryAfterMs ?? BACKOFF_MS[n - 1]
      if (backoff !== undefined) {
        const via = result.retryAfterMs !== undefined ? '按 Retry-After' : ''
        deps.log(
          `[voice] 重试 ${e.id}（第 ${n} 次失败：${result.failure.code}），${backoff}ms 后重来${via}`,
        )
        await deps.sleep(backoff)
      }
    }

    if (last !== null) {
      deps.error(
        `[voice] 失败 ${last.failure.id} / code=${last.failure.code} / ${last.failure.msg}`,
      )
      failures.push(last.failure)
      if (!last.retryable) {
        // 音色或 key 一旦不可用，后面每一条都会以同样的方式失败。
        // 继续跑只是白烧配额、堆一屏同款错误 —— 立即中止，让用户改完再来（AC-3）。
        deps.error(
          '[voice] 不可重试的失败，已中止整批 —— ' +
            '请检查 MINIMAX_API_KEY、VOICE_ID 与模型是否仍可用（AC-3：不得静默换音色继续跑）。',
        )
        deps.writeManifest(nextManifest)
        return { generated, skipped, failures }
      }
    }
  }
  deps.writeManifest(nextManifest)
  return { generated, skipped, failures }
}

/** 跳过原因的人话版本，进日志。 */
const SKIP_REASON_TEXT: Record<SkipReason, string> = {
  verified: '已存在且哈希一致',
  unrecorded: '已存在但无溯源记录',
  missing: '不存在',
  'text-mismatch': '卡面文本与录音溯源记录不一致（卡面改过？需重录）',
  corrupt: '内容与 manifest 不符',
}

/** `writeFileAtomic` 用到的两个 fs 原语。抽出是为了让「先临时名、后改名」这条不变量可测。 */
export interface AtomicFs {
  writeFileSync: (path: string, data: Buffer) => void
  renameSync: (from: string, to: string) => void
}

/**
 * 原子写盘：先写 `<target>.tmp`，完成后 rename 到正式名。
 *
 * 同一目录内的 rename 是原子的。跳过判据是 `existsSync`，若直接写正式名，
 * 上一次运行在写到一半时被杀（Ctrl-C / 断电 / 磁盘满）就会留下一个**截断的
 * mp3** —— 而它看起来是存在的，下次跑被永久 skip。
 *
 * 后果完全静默：运行时 `new Audio()` 收到 `error` 事件，降级到设备 TTS，
 * 孩子听到的只是「音色不对」，没有任何报错指向这个文件。
 *
 * ⚠️ 「写完之后没有 .tmp 残留」**不是**这条不变量 —— 压根不写临时文件也能满足它。
 *   能咬住退化的是「写入的第一落点必须是 `.tmp`，正式名只由 rename 产生」。
 */
export function writeFileAtomic(target: string, data: Buffer, fsImpl: AtomicFs = NODE_FS): void {
  const tmp = `${target}.tmp`
  mkdirSync(dirname(target), { recursive: true })
  fsImpl.writeFileSync(tmp, data)
  fsImpl.renameSync(tmp, target)
}

// ── 入口（顶层副作用集中在这里）────────────────────────────────────────────

/** 真实 fs 的两个原语；默认注入点。 */
const NODE_FS: AtomicFs = { writeFileSync, renameSync }

interface Cli {
  dry: boolean
  force: boolean
  help: boolean
  only?: string
}

const USAGE = [
  '[voice] 用法：npm run generate:voice -- [选项]',
  '',
  '  --dry            只估算费用，不发请求、不读写产物目录（不需要 API key）',
  '  --only <前缀>    只处理 id 以 <前缀> 开头的词条',
  '  --force          用当前参数**重录全部**（即使哈希一致）；不越过指纹闸',
  '  --help           打印本用法并退出（不需要 API key）',
  '',
  '改录音生成参数（模型 / 音色 / 语速 / 音高）后的**正确流程**（整批，不许零散补录）：',
  '  1. 改 scripts/generate-voice.ts 的常量区；',
  '  2. 重跑本脚本 —— 指纹闸会**拒跑**并指名差异；',
  '  3. 删掉**整个**产物目录（mp3 与 manifest 一起删），再重跑全量。',
  '  ⚠️ 只删 manifest、不删 mp3 是不允许的：那样旧参数录音会被盖上新参数的戳。',
].join('\n')

function parseCli(argv: string[]): Cli {
  const cli: Cli = { dry: false, force: false, help: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--dry') {
      cli.dry = true
    } else if (arg === '--force') {
      cli.force = true
    } else if (arg === '--help') {
      cli.help = true
    } else if (arg === '--only') {
      const value = argv[i + 1]
      if (value === undefined) {
        throw new Error('[voice] --only 需要一个词条 id 前缀参数')
      }
      // 空串会让 startsWith('') 匹配全部，flag 静默退化成空操作；
      // 而 `--only --dry` 会把下一个 flag 当成前缀吃掉，dry 模式随之静默失效。
      // 两种都是「用户以为限定了范围、实际没有」，必须当场报错。
      if (value.trim() === '') {
        throw new Error('[voice] --only 的前缀不能为空')
      }
      if (value.startsWith('--')) {
        throw new Error(`[voice] --only 的前缀不能是参数（收到 ${value}）—— 是否漏写了前缀值？`)
      }
      cli.only = value
      i += 1
    } else {
      throw new Error(
        `[voice] 未知参数：${arg}（支持 --dry / --only <前缀> / --force / --help）`,
      )
    }
  }
  return cli
}

/**
 * CLI 入口。返回退出码而不自己 `process.exit` —— 收口在文件末尾，
 * 这样本函数可被测试直接调用。
 *
 * `env` 可注入：测试要在**没有** key 的情况下断言 dry 路径仍返回 0。
 *
 * `opts.outputDir` 可注入（Story 3.4 / Task 3.1）：守卫要在临时目录里驱动
 * 「指纹不匹配 ⇒ 拒跑」这条路径；而产物目录写死的话，测试会把新的 manifest
 * 写到**仓库里真的**那个已提交文件上，覆盖 75 条溯源记录。
 * ⚠️ 默认值不变 ⇒ `npm run generate:voice` 的行为逐字不变。
 */
export async function main(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
  opts: { outputDir?: string } = {},
): Promise<number> {
  const outputDir = opts.outputDir ?? OUTPUT_DIR
  let cli: Cli
  try {
    cli = parseCli(argv)
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    return 1
  }

  // ⚠️ `--help` 必须在**读 key 之前**返回（与 `--dry` 同款纪律）：
  //   「打印用法」这件事不该要求 API key —— 否则在一台没配 key 的机器上
  //   `--help` 直接返回 1，而用户恰恰是这台机器上最需要看用法的人。
  if (cli.help) {
    console.log(USAGE)
    return 0
  }

  // `.env` 已在 .gitignore，放 API key 在这里是安全的。
  // 文件不存在是正常情况（CI、公共 clone），因此 catch 里不做任何事。
  try {
    process.loadEnvFile()
  } catch {
    /* 没有 .env：继续走 env，缺失时报错见下 */
  }

  // ⚠️ key 只在**真的要发请求**时才要：--dry 一个网络请求都不发（AC-5），
  //   拿它当启动前提会让「干净 clone 上先看个账单」变成一道多余的手续（AC-1 要求退出码 0）。
  let apiKey = ''
  if (!cli.dry) {
    try {
      apiKey = readApiKey(env)
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err))
      return 1
    }
  }

  let entries: VoiceEntry[]
  try {
    // ⚠️ [CR] 2026-10-14：这里刻意用**动态 import** 而不是顶部的静态 `import { UNITS }`。
    //   静态 import 在模块加载时求值，而 `src/content/index.ts` 按 AC-28「失败即 throw」
    //   会在 import 的那一刻就抛 —— 那次抛出发生在 `main()` 之前，
    //   于是它绕过了本文件所有的 try/catch：跑 `npm run generate:voice` 时
    //   看到的是一整页 node 堆栈，而不是一行 `[voice] …` 加退出码 1。
    //
    //   静态 import 抛出的异常**无法被同步 catch** 接住，所以唯一的修法就是别静态 import。
    //   代价是这里每次调用多一个微任务；`main` 本来就是 async，无所谓。
    //
    //   顺带说明为什么这条路径值得修：`npm run validate:content` 已在
    //   `prebuild` / `pretest` 里（同一份内容、同样会抛），所以内容坏了通常先在那里被拦下；
    //   但直接跑录音脚本时它仍是第一条通路，报错质量直接决定录入者能不能自己定位问题。
    const { UNITS } = await import('../src/content/index')
    entries = entriesFromContent(UNITS)
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    return 1
  }

  if (cli.only !== undefined) {
    entries = entries.filter((e) => e.id.startsWith(cli.only as string))
    if (entries.length === 0) {
      console.error(`[voice] --only ${cli.only} 没有匹配到任何词条`)
      return 1
    }
  }

  // ── 溯源校验（--dry 不碰：它一个文件都不该读、更不该写）────────────────
  let manifest: VoiceManifest | null = null
  if (!cli.dry) {
    const manifestFile = manifestFileIn(outputDir)
    let raw: string | null = null
    try {
      raw = readFileSync(manifestFile, 'utf8')
    } catch {
      raw = null
    }
    manifest = parseManifest(raw)
    if (manifest !== null && !fingerprintMatches(manifest)) {
      // 这是本脚本最要紧的一道闸：常量改了而磁盘上是旧录音，
      // 若照常「跳过」，全量重生成会变成「零生成」，改参数的意图被静默吞掉。
      console.error(
        `[voice] 现有录音是用另一组参数生成的：${fingerprintDiff(manifest)}`,
      )
      console.error(
        `[voice] 拒绝把它们当成已完成。请删除 ${outputDir}/ 下的录音与 manifest 后重跑全量 —— ` +
          '混用两组参数的录音无法保证音色一致。',
      )
      return 1
    }
    if (manifest === null) {
      // ⚠️⚠️ 「没有 manifest 但盘上已有 mp3」= **来源不明**。
      //   此时若照常跑，`decideSkip` 的 `unrecorded` 分支会把那些**旧参数**的录音
      //   登记进**新指纹**的 manifest ⇒ 混批被盖上「同源」的戳，而 G310 抓不到
      //   （manifest 与常量一致得很）。
      //   ⇒ 选定的堵法（Story 3.4 / AC-7 的第二个 Given 块）：**拒绝运行**，
      //     要求「删整个目录重跑全量」。这是**响亮失败**，不是静默损坏。
      //   ⚠️ 真正的一次性首跑（目录里连 mp3 都没有）不受影响 —— 那条路照常走下去。
      const orphanMp3s = listVoiceMp3s(outputDir)
      if (orphanMp3s.length > 0) {
        console.error(
          `[voice] ${outputDir}/ 下有 ${orphanMp3s.length} 个 mp3，但**没有 manifest** —— ` +
            '这些录音是用哪组参数生成的已经无从判断，不能拿当前参数给它们盖章。',
        )
        console.error(
          `[voice] 拒绝运行。请删除整个 ${outputDir}/ 目录（mp3 与 manifest 一起删）后重跑全量。`,
        )
        return 1
      }
      console.log(
        '[voice] 未找到 manifest —— 现有录音将按「无溯源」跳过，本次跑完会为它们建立 manifest。',
      )
    }
  }

  console.log(
    `[voice] 词表 ${entries.length} 条 → ${VOICE_ID} / ${VOICE_MODEL} / speed=${VOICE_SPEED}` +
      ` / pitch=${VOICE_PITCH}` +
      (cli.dry ? '（--dry 预估模式）' : '') +
      (cli.force ? '（--force 重录全部）' : ''),
  )

  const result = await runBatch(entries, {
    apiKey,
    outputDir,
    dry: cli.dry,
    force: cli.force,
    requestIntervalMs: REQUEST_INTERVAL_MS,
    fetchImpl: fetch,
    fileExists: existsSync,
    writeFile: writeFileAtomic,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log: (msg) => console.log(msg),
    error: (msg) => console.error(msg),
    timeoutSignal: () => AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    hashFile: (path) => hashFileSync(path),
    fileSize: (path) => statSync(path).size,
    writeManifest: (m) => writeManifestFile(m, outputDir),
    manifest,
  })

  if (result.failures.length > 0) {
    console.error(
      `[voice] 共 ${result.failures.length} 条失败（已成功的文件全部保留，重跑只补这些）：` +
        result.failures.map((f) => `${f.id}(${f.code})`).join('、'),
    )
    return 1
  }

  if (!cli.dry) {
    console.log(`[voice] 完成：生成 ${result.generated} 条，跳过 ${result.skipped} 条`)
  }
  return 0
}

/**
 * 只在被直接执行时才跑 `main()`。
 *
 * 测试要 import 本模块的纯函数，而顶层 `process.exit()` 会把测试进程一起收走 ——
 * 这就是「顶层副作用必须留到 main() 里」的具体理由。
 */
if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  void main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err: unknown) => {
      // 只打 message，不打整个对象 —— 异常上可能带着带 key 的请求头。
      console.error(`[voice] 未预期的失败：${err instanceof Error ? err.message : String(err)}`)
      process.exit(1)
    },
  )
}

/** 供测试与未来的脚本复用：本文件在磁盘上的绝对路径。 */
export const SCRIPT_PATH = fileURLToPath(import.meta.url)
