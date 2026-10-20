<script setup lang="ts">
/**
 * OptionCard —— 单个选项卡（Story 1.11 / AC-C1、AC-C2、AC-C3、AC-B2）。
 *
 * ── 职责边界 ──────────────────────────────────────────────────────────────
 * 只做两件事：**按 `kind` 选一个分支渲染**，以及**把点击原样往上抛**。
 * 判定、题单、回合推进一概不在这里（架构硬约束 2）。
 *
 * ── 刻意不做的事 ──────────────────────────────────────────────────────────
 * · **不判定对错** —— 组件里既不 import `isCorrect`、也不读 `option.correct`。
 *   「答对没答对」由父组件从 `state.masteredEntryIds` 读出，经 `right` / `wrong`
 *   两个布尔 prop 传下来（AC-D1、守卫 G21）。
 *   ⚠️ 这不是客套：`types.ts:224-227` 逐字写着「在 core 里重算一遍
 *   **等于把内容层的判定复制成第二份**，两份判定漂移时没有任何东西会报错」。
 * · **不 throw、不写 assert**（AC-E3 / `[GA]:567-575`）。组件层遇到的是
 *   **运行期资源失败**（图片 404），处置是 `console.warn` + 静默降级；
 *   `throw` 属逻辑层。见文件末的降级协议。
 * · **不 import `services/pronunciation`** —— 朗读只经 `store` 的
 *   `speakQuestion()` 门面（裁决 3、守卫 G25）。
 *
 * ── 关于「组件只认识 app/」这条纪律 ───────────────────────────────────────
 *   照抄 `Tower.vue:19-25` 的先例：直接 import 无状态的 `asset-url.ts`。
 *   `pronunciation.ts` 持有 `globalThis.AudioContext` 且有解锁时序，
 *   **不**在这个先例里 —— 那是 G25 单独守着的那一个。
 */

import { computed, ref } from 'vue'

import { WORD_IMAGE_PLACEHOLDER_SVG } from '../../core'
import type { Card, Option, OptionId } from '../../core'
import { markAssetDegraded } from '../../services/asset-degradations'
import { wordImageUrl } from '../../services/asset-url'

const props = defineProps<{
  readonly option: Option
  /** 分派依据是**卡型**，不是「这个选项自己有没有 imageSrc」—— 见下方长注释。 */
  readonly kind: Card['kind']
  readonly picked: boolean
  readonly right: boolean
  readonly wrong: boolean
  /**
   * 📎 **Story 1.19 `[CR]`（2026-10-18）：卡面只读 —— 这张卡此刻点不动。**
   *
   * ⚠️ **为什么需要它**：`:disabled` 原先只跟着 `failed`（破图降级）走，
   *   而**建造期**里这张卡既没破、也不 disabled，却点下去毫无反应 ——
   *   上层 `onPick` 的守门（`QuestionCard.vue` 的 `if (!answering.value) return`）
   *   把点击静默丢弃了。
   *   ⇒ 白卡 + 灰边框 + `cursor: pointer` 摆在孩子面前，**点下去什么都没有**，
   *     这正是 AC-D5 逐字说的「假可点」。1.16 裁决 7 / 守卫 G94 只保证
   *     「兜底范围外的四个相位不渲染卡面」，**从没有验过「渲染卡面的那个相位里
   *     选项到底能不能点」** —— 真机试玩立刻补上了这个洞。
   *   触发条件：正常游玩时它只在 ≤100ms 的反馈窗口里成立，没人来得及点；
   *   **从存档恢复到建造期时它是永久状态**，于是变成硬锁。
   *
   * ⚠️ **不叫 `disabled`**：那个名字归 `failed`（图破了、这张卡被降级），
   *   两者成因完全不同 —— 一个是「这张图坏了」，一个是「这道题已经答完了」。
   */
  readonly locked: boolean
}>()

/**
 * 📎 **Story 1.18 / AC-E5：`imageFailed` 事件。**
 *
 * ⚠️ **为什么 OptionCard 自己不发 `SKIP_QUESTION`、只把 optionId 往上抛**：
 *   跳过的前提是「破掉的**是正确项**」，而本组件**不许**知道哪个是正确项 ——
 *   文件头第 10 行逐字写着「不读 `option.correct`」，守卫 G21 也钉着那条。
 *   ⇒ 本组件只报告「这张图破了（是谁：optionId）」，
 *     由上层拿 `core` 的 `isCorrect` 核对后再决定要不要跳。
 *   ⚠️ **不抛、不切 view、不改任何 state** —— 这里只 `emit` 一个 id。
 */
const emit = defineEmits<{
  pick: [optionId: OptionId]
  /** 📎 1.18：这张图的 `<img>` 加载失败（`optionId` 是谁破了图）。 */
  imageFailed: [optionId: OptionId]
}>()

/**
 * 🚨 **分派依据是 `card.kind`，不是「这个选项有没有 `imageSrc`」**（AC-C3）。
 *
 *   正面写法在下面：`isImageKind` 只看 `props.kind`。
 *
 *   反面写法的危害是**具体的**（`deferred-work.md:340-356` 登记的「剩下的口子」）：
 *   `core/` 内部自造的卡（测试 fixture、`balance-sim` 的合成题单）**不受内容
 *   schema 约束** —— `Card` 被拍平成 `kind + options` 的扁平联合
 *   （`types.ts:256-261`），所以 `{kind:'word', options:[{text:'…'}]}`
 *   **干净编译**。按选项自身字段分派恰好让那种非法卡渲染成「看起来正常」的界面，
 *   把编译期不变量换来的内容层校验又漏回渲染层。
 *   守卫 G24 上半用一张**真正非法的 fixture 卡**钉住这条（只查真实内容打不红：
 *   真实内容下两种分派产生逐字节相同的 DOM）。
 */
const isImageKind = computed(() => props.kind === 'word')

/**
 * 字段读取用**类型守卫**（`'x' in option`）而不是 `as`。
 * `Option` 是 `ImageOption | TextOption` 的扁平联合，不收窄就读不到 `text`；
 * 而 §8 教训 3 记着：`as` 会让编译期断言在类型改坏时失灵。
 */
const imageSrc = computed(() => ('imageSrc' in props.option ? wordImageUrl(props.option.imageSrc) : ''))
const optionText = computed(() => ('text' in props.option ? props.option.text : ''))

/** `<img>` 是否已加载失败。用于切到内联占位图形并禁用该选项。 */
const failed = ref(false)

/**
 * 词图加载失败：记一条 `[content]` WARN 并静默降级，**绝不阻断回合流转**（NFR12）。
 *
 * ⚠️ 形态照抄 `Tower.vue:40,50-56`（`failed` ref + `@error` + 一眼可分的降级态），
 *   但**不复用**那个 CSS 形状类 —— 那个是 `border-radius` + `inset box-shadow`
 *   画的纯 CSS 色块，没有内联常量、也没有把 `<img>` 换成 `v-if` 分支。
 *   AC-B2 要的是后者：破了图的 `<img>` 必须**从 DOM 里换掉**。
 *
 * ⚠️ **为什么是 `warn` 不是 `error`**（NFR13 / NFR14）：孩子面前永不出现技术错误，
 *   日志只进 console 且带 `[content]` 前缀，让 `[CR]` 按内容资产那条线去查。
 *
 * ⚠️ 这里**没有 try/catch**：加载失败不是异常，是事件；包一层只会把
 *   「哪一层出的问题」抹掉。
 */
function onImageError(): void {
  if (failed.value) return
  failed.value = true
  // 📎 **Story 1.18 / AC-E5：文案随机制同步改**（裁决 11 的文案诚实性条款）。
  //   原文案只说「回合流转不受影响」—— 那在 1.18 之前是对的，
  //   1.18 之后**不再完整**：正确项那张图破了，这道题会被自动跳过。
  //   ⚠️ **本组件不知道哪个是正确项**（文件头第 10 行），所以文案只能说两种可能：
  //   「如果破的是干扰项，这道题照答；如果破的是正确项，这道题会被跳过，
  //   不扣心、不计分，也不会算进进度」。
  //   ⚠️ 不写成「已跳过」是因为那会是一句**可能是假**的话 ——
  //     而本项目最贵的一类 bug 正是「界面陈述了一件没发生的事」。
  console.warn(
    `[content] 词图加载失败：${imageSrc.value}（选项 ${props.option.id}）—— ` +
      '已降级为内联占位图形并禁用该选项。破的若是干扰项，这道题照答；' +
      '破的若是正确项，1.18 起这道题会被自动跳过（不扣心、不计分、不进进度）。' +
      '若部署后普遍发生，先查 `import.meta.env.BASE_URL` 是否与站点前缀一致（守卫 G22）。',
  )
  // 📎 **Story 1.17 / AC-E2：登记这一条**（理由与 `Tower.vue` 同款，逐字理由见那里）。
  markAssetDegraded(imageSrc.value, `词图（选项 ${props.option.id}）`)
  // 📎 **Story 1.18 / AC-E5：往上抛「是谁破了图」。** 只抛 id，不判定、不 dispatch ——
  //   「是不是正确项」由上层用 `core` 的 `isCorrect` 核对（理由见 `defineEmits` 上方）。
  emit('imageFailed', props.option.id)
}

function onPick(): void {
  if (failed.value) return
  emit('pick', props.option.id)
}
</script>

<template>
  <button
    type="button"
    class="option-card"
    :class="{
      'is-picked': picked,
      'is-right': right,
      'is-wrong': wrong,
      'is-degraded': failed,
      'is-locked': locked,
    }"
    :data-option="option.id"
    :disabled="failed || locked"
    @click.stop="onPick"
  >
    <!--
      🚨 **`<img>` 上不许写 `alt`**（AC-B2 / NFR13）：破了的图会露出 alt 文本与
      浏览器默认破图图标，而 NFR13 的口径是「孩子面前**绝不**出现任何英文提示」。
      ⇒ 这里既没有 `alt` 也没有 `:alt`。
    -->
    <template v-if="isImageKind">
      <img
        v-if="!failed"
        class="option-card__image"
        :src="imageSrc"
        :data-option="option.id"
        @error="onImageError"
      >
      <!-- 降级态：内联占位图形（受控常量，`v-html` 在这里是安全的）。 -->
      <span
        v-else
        class="option-card__placeholder"
        :data-option="option.id"
        v-html="WORD_IMAGE_PLACEHOLDER_SVG"
      />
    </template>
    <span
      v-else
      class="option-card__text"
    >{{ optionText }}</span>
  </button>
</template>

<style scoped>
.option-card {
  display: flex;
  align-items: center;
  justify-content: center;
  /* 命中区域下限 —— AC-1。**文字不受它约束**（见 tokens.css 字体段的说明）。 */
  min-height: var(--touch-min);
  padding: 12px;
  background: #ffffff;
  /*
   * 🚨 **边框必须给一道看得见的灰色，不是 `transparent`**（`[CR]` 2026-10-16）。
   *   改之前是 `border: 3px solid transparent`，而卡片区（改之前）连自己的底色都没有
   *   ⇒ 白卡叠在白页上、边框透明 ⇒ **四张选项卡完全没有边界**，
   *   真浏览器截图里只剩四张浮空的图。
   *   现在卡面区是白面板（`QuestionCard.vue`），白卡叠白面板仍然分不清
   *   ⇒ 这道灰边框是让 4 个可点目标对 4–8 岁孩子**看得见、点得准**的唯一线索。
   *   灰阶与卡片内的黑色文字同族，不引入新色相。
   */
  border: 3px solid #bdbdbd;
  border-radius: 12px;
  cursor: pointer;
  /* 只给 hover / press 形变过渡；反馈 class 一律不带 transition
     （`--dur-fast` 是 120ms，而 NFR5 要求反馈 ≤100ms 呈现）。 */
  transition: transform var(--dur-fast) ease-out;
}

.option-card:hover:not(:disabled) {
  transform: translateY(-2px);
}

.option-card:disabled {
  cursor: default;
}

.option-card.is-picked {
  /*
   * 🚨 **刻意不复用 `--color-overlay-range`**（`[CR]` 2026-10-16）。
   *   那个 token 的定义是「射程高亮：中性浅色罩盖在**战场路径**上」
   *   （`tokens.css:46-48`）—— 它属于棋盘那一层，跨域拿来当「孩子点了这张卡」
   *   的选中态有两处不对：
   *     ① **语义**：射程罩说的是「这里被打到」，选中态说的是「你选了这个」
   *     ② **可见性**：`rgba(255,255,255,.3)` 落在白面板上是 **1.16:1**
   *        ⇒ 孩子点了卡片却看不到任何变化，AC-D2 的「立刻可见」直接落空
   *
   *   选中态用一道**深中性**描边：白底上对比度够高、形状上与
   *   「对/错」的整块底色区分得开（底色变，描边不变），且不引入新色相。
   */
  border-color: #424242;
}

/*
 * 反馈色只用 `--color-correct` / `--color-wrong`（1.6 定稿，`palette.test.ts`
 * 按 WCAG 实算守着）—— 本文件**一个字都不许改**这两个 token。
 *
 * ⚠️ **这三个 class 是叠加而不是互斥的**：选中且答对、选中且答错、未判定的点过，
 *   三个状态可以同时成立（见 AC-D2 的三条公式）。
 * ⇒ **刻意不加 transition** —— 见上面的注释。
 */
.option-card.is-right {
  background: var(--color-correct);
}

.option-card.is-wrong {
  background: var(--color-wrong);
}

/*
 * 🚨 **`.is-degraded` 刻意不与 `.is-right` / `.is-wrong` 同时生效**（`[CR]` 2026-10-16）。
 *   三条状态类的选择器特异度**完全相同**（都是 `.option-card` + 一个类 = `(0,2,0)`），
 *   所以胜负只由**源码顺序**决定。而降级态原先写在最后 ⇒ 它赢。
 *
 *   ⚠️📎 **`[CR]` 2026-10-20 第七轮按 R-57 留痕：上一段的理由今天只对
 *     `.is-right` / `.is-wrong` 成立，对 `.is-locked` 已不成立** ——
 *     `.is-degraded` 那条后来加了 `:not(.is-picked):not(.is-locked)`，
 *     变成 `(0,3,0)` → scoped `(0,4,0)`，比 `.is-locked` 高一级。
 *     特异度不等时源码顺序根本不参与裁决。详见下面第七轮那段更正。
 *
 *   实测可复现的丢失：孩子点中正确项 ⇒ `applyAction` 同步打上 `is-right`（绿底）；
 *   150ms 后那张图才 `error` ⇒ `failed` 翻真 ⇒ 该卡同时挂上 `is-degraded`
 *   ⇒ **绿底被换成灰底 + 55% 透明，而反馈条仍然写着「答对了 ✓」**。
 *   AC-D2 的主反馈载体就这么没了（答错时同理，红底消失，孩子只看到一个暧昧的灰卡）。
 *
 *   ⇒ 降级置灰只在**尚未判定对错**时生效：一旦点了（`is-picked`），
 *   让 `is-right` / `is-wrong` 的颜色说了算。
 *
 * 🚨📎 **`[CR]` 第七轮更正特异度：下面那条 `:not()` 让本规则是 `(0,3,0)`，
 *   加 scoped 属性后是 `(0,4,0)` —— 比同文件 `.option-card.is-locked`
 *   （`(0,2,0)` → scoped `(0,3,0)`）**高一级**。**
 *   ⇒ 上一段「三条状态类特异度完全相同、胜负只由源码顺序决定」**对 `.is-locked`
 *     不成立**：特异度不等时源码顺序根本不参与裁决。
 *   ⇒ `locked + failed + !picked` 时赢的一直是本规则的 `opacity: 0.55`，
 *     **与两条规则的先后无关** —— 第六轮「把 `.is-locked` 挪到后面就修好了」是假修复。
 *   ⇒ 修法不是抬 `.is-locked`（抬到打平仍要靠顺序），而是**让本规则在 locked 时不参与
 *     竞争**：加 `:not(.is-locked)`。这样 locked 的 `opacity: 1` 无条件生效，
 *     且 `.is-locked` 自身的声明永远不会被 `:not(.is-picked)` 之类的条件剥掉。
 */
.option-card.is-degraded:not(.is-picked):not(.is-locked) {
  /* 置灰：与真图「一眼可分」。禁用态额外压一层不可建的同族罩（中性 alpha，不带色相）。 */
  background: #eceff1;
  border-color: var(--color-overlay-blocked);
  opacity: 0.55;
}

/*
 * 📎 **Story 1.19 `[CR]`：`.is-locked`（建造期只读）。**
 *
 * ⚠️🔥 **`[CR]` 第六轮更正位置：这条规则原本写在 `.is-picked` 之前、
 *   也就是 `.is-degraded:not(.is-picked)` 的上面** —— 而它自己的注释逐字写着
 *   「排在 `.is-degraded` **之后** ⇒ 两者同时成立时（建造期 + 图破了）以置灰为准」。
 *   ⇒ **注释与源码顺序相反**。后果是真的：`locked + failed + !picked` 时那张词图
 *   被压到 55% —— **恰好是下一段注释声明要避免的那件事发生了。**
 *
 * ⚠️🚨 **`[CR]` 第七轮推翻第六轮的修法：把本规则挪到后面 + 补 `opacity: 1`
 *   并没有修好那个 bug。** 本规则是 `(0,2,0)`、`.is-degraded:not(.is-picked)`
 *   是 `(0,3,0)`（`:not()` 按其参数计权）⇒ 加上 scoped 属性后是 `(0,3,0)` 对
 *   `(0,4,0)`。**特异度不等，源码顺序不参与裁决** ⇒ 第六轮把本规则移到后面之后，
 *   `opacity: 0.55` 照样赢。真正的修法在 `.is-degraded` 那一侧：给它加
 *   `:not(.is-locked)`，让降级态在建造期根本不参与竞争。
 *   ⇒ 因此下面这个 `opacity: 1` **不是**「靠顺序赢回来的」，而是**让判据读得懂意图**
 *     的显式声明 —— 它在修复后确实生效，但生效的原因是 `.is-degraded` 让开了。
 *
 * ⚠️ **仍排在 `.is-picked` 之后**：孩子刚答完那 ≤100ms 里，`is-right` / `is-wrong`
 *   的绿底/红底才是 AC-D2 的主反馈载体，置灰不该把它洗掉
 *   （这与 `.is-degraded:not(.is-picked)` 用 `:not(.is-picked)` 是同一个理由）。
 *
 * ⚠️ **`opacity: 1` 现在是无条件生效的**：`.is-degraded` 带了 `:not(.is-locked)`
 *   ⇒ `locked` 时它根本不匹配 ⇒ 这里没有任何竞争者。
 */
.option-card.is-locked {
  background: #eceff1;
  border-color: var(--color-overlay-blocked);
  cursor: default;
  opacity: 1;
}

/*
 * ⚠️ **`width` 必须写死百分比，不能写 `auto`**（1.10 真浏览器核对时踩过，
 *   与 `Tower.vue:97-101` 同一个坑）：`<img>` 是替换元素，`width: auto`
 *   解析成图的**固有宽度**（词图是 512×512）而不是「撑满卡片」，
 *   表现是图从卡片里整只画出去、把相邻两张盖掉。
 *
 *   `height: auto` 在这里是**安全**的：它与 `aspect-ratio: 1 / 1` 配对时，
 *   按**已定的 width** 推出高度，而 width 是 `100%`（确定值）——
 *   也就是说 `width` 一旦写死，高度就不再回落到固有尺寸。
 *   1.10 那个坑的根因是 `width` 也是 auto，两个 auto 才让固有尺寸胜出。
 */
.option-card__image {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 1 / 1;
  object-fit: contain;
}

.option-card__placeholder,
.option-card__placeholder svg {
  display: block;
  width: 100%;
  height: 100%;
  aspect-ratio: 1 / 1;
}

/*
 * 文字选项：--text-option（Story 1.11 定稿，算式见 tokens.css 字体段）。
 *
 * ⚠️ **`overflow-wrap` 刻意不设** —— AC-F1 ③ 禁的是「断词」：
 *   浏览器默认只在空格处换行（`I am fine,` / `thank you.`），
 *   而 `break-word` 会把 `afternoon` 劈成两半，那是把单词读错的方式。
 */
.option-card__text {
  font-size: var(--text-option);
  line-height: 1.25;
  text-align: center;
  color: #212121;
  word-break: normal;
  overflow-wrap: normal;
  hyphens: none;
}
</style>
