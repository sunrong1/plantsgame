<script setup lang="ts">
/**
 * HandCard —— 手牌区里的一张塔卡（Story 1.12 / AC-C1、AC-C2、AC-C4）。
 *
 * ── 一张卡显示三样，缺一不可（AC-C2）─────────────────────────────────────
 *   1. **塔图** —— `expectedTowerAssetUrl(towerType)`，沿用 `Tower.vue` 的加载失败降级
 *   2. **单词文字** —— `card.label`（**由 `core/build.ts` 给出，组件只读不算**）
 *   3. **造价数字** —— `card.cost`（同上）
 *
 * ── 刻意不做的事 ──────────────────────────────────────────────────────────
 * · **不 import `core/balance`**（ESLint `no-restricted-imports`，
 *   `eslint.config.js:172-190`）—— 造价由 core 返回，组件既不自己算也不写死 50/75。
 *   守卫 **G33b** 另有一道源码级判据（`costOf` / `TOWER_STATS` / `rangeOf` … 都不许出现），
 *   变异 **M64** 专打它。
 * · **不在组件里算 affordability** —— 判定 = `card.affordable`，数据来自 core（AC-C4）。
 * · **不做拖拽 / 长按 / 防抖**（FR31，守卫 **G39**）—— 手牌区只吃 `click`。
 * · **不 throw、不写 assert**（架构 `:567-606`）—— 组件层没有断言这一层。
 * · **不决定「能不能建」** —— 那是 `placementBlockedReason` 在**落子那一格**上的答案。
 *
 * ── 为什么单词文字是 DOM 文本而不是画进 SVG（AC-C2）────────────────────────
 *   `art-direction.md` §4.6：塔的视觉**只由 `towerType` 决定**，`wordId` 只决定显示名。
 *   把单词画进 SVG，一张图就只能绑一个词 —— FR70「美术成本不随词汇增长」当场破掉。
 *
 * ── 为什么 `<img>` 上不写 alt ──────────────────────────────────────────────
 *   照 `tests/components/quiz-card.test.ts` 的先例（NFR13：孩子面前绝不出现任何英文提示）。
 *   这张卡的**可读名**就是同一张卡上的 `label` 文本，重复一份英文 alt 只会多一处
 *   可能漏到孩子眼前的机器串；而 `aria-hidden` 让读屏走 `label` 那条路。
 */

import { computed, ref } from 'vue'

import type { HandCard, TowerType } from '../../core'
import { expectedTowerAssetUrl } from '../../services/asset-url'

const props = defineProps<{
  readonly card: HandCard
  /** 该卡当前是否被选中（选中态是 UI 态，在 `app/store.ts` 的 `selectedEntryId`）。 */
  readonly selected: boolean
}>()

/**
 * 卡被点击 → 通知父级。父级调 `selectTowerCard` 门面（AC-D5）。
 *
 * ⚠️ **只 emit，不自己 dispatch**：选中态是 UI 态且住在 `app/store.ts`
 *   （AC-D4）。组件自己 dispatch 就等于把「哪张卡被选中」搬进了组件本地 ——
 *   战场那边的覆盖层就再也读不到它了。
 */
const emit = defineEmits<{ select: [] }>()

/**
 * 塔型字面量 → 色板 token 名。**必须显式映射，不能拼字符串**。
 *
 * ⚠️ 塔型字面量是 `direct`，而色板 token 叫 `--color-tower-shooter`（1.6 的历史命名，
 *   `asset-url.ts:53` 与 `art-direction.md:499` 都记了这条易混）。
 *   拼 `` var(--color-tower-${towerType}) `` 会得到一个**不存在**的
 *   `--color-tower-direct` ⇒ `background-color` 回落到 `transparent`
 *   ⇒ 降级色块**整只看不见**。
 */
const TOWER_COLOR_TOKEN: Record<TowerType, string> = {
  direct: 'var(--color-tower-shooter)',
  slow: 'var(--color-tower-slow)',
  aoe: 'var(--color-tower-aoe)',
}

/** 塔图 URL 走 `asset-url.ts`（已接 `import.meta.env.BASE_URL`），不手写拼接。 */
const src = computed(() => expectedTowerAssetUrl(props.card.towerType))

/** `<img>` 是否已加载失败。用于切到 CSS 占位形状 —— **绝不阻断回合**（架构硬约束 9）。 */
const failed = ref(false)

/**
 * 图加载失败：记一条 `[content]` WARN 并静默降级。
 *
 * ⚠️ 与 `Tower.vue` 同型（逐字）：孩子的界面不能因为一张插画没加载出来
 *   就**停在原地等他**。回合流转是本作的主干道，任何一张图 404 都不许阻断它。
 *   `[content]` 前缀让 `[CR]` 按内容资产那条线去查。
 */
function onImageError(): void {
  if (failed.value) return
  failed.value = true
  console.warn(
    `[content] 手牌塔图加载失败：${src.value}（${props.card.towerType} 塔）—— ` +
      '已降级为 CSS 占位形状，建造与回合流转不受影响。若部署后普遍发生，先查 ' +
      '`import.meta.env.BASE_URL` 是否与站点前缀一致（守卫 G16）。',
  )
}

/**
 * 点卡 ⇒ 通知父级（AC-D1 的第一步）。
 *
 * ⚠️ **处理器里再判一次 `affordable`**（AC-C4 的两条都要有）：
 *   主判据是 `disabled` 属性 —— 真浏览器不会把 click 派发给 disabled 的表单控件。
 *   但这道处理器内的判断不能省：`dispatchEvent` **绕过** disabled 检查
 *   （实测：jsdom 里手动 dispatch 的 click 照样打到 `@click`），
 *   而且更重要的是 —— 一张「变灰的卡」若哪天因为任何原因还能收到 click，
 *   孩子就会选中一张他买不起的塔，然后每一次落子都变成压暗闪。
 *   那不是「没反应」，那是**反复的失败信号**。
 */
function onSelect(): void {
  if (!props.card.affordable) return
  emit('select')
}
</script>

<template>
  <button
    type="button"
    class="hand-card"
    :class="{
      'is-selected': selected,
      'is-unaffordable': !card.affordable,
      'is-degraded': failed,
    }"
    :data-entry="card.entryId"
    :data-tower-type="card.towerType"
    :aria-pressed="selected"
    :disabled="!card.affordable"
    @click="onSelect"
  >
    <!-- ① 塔图。⚠️ `<img>` 的 width/height 必须写死百分比（`Tower.vue:99-105`
         记的坑）：`auto` 会解析成固有宽度 512px 而非撑满格子。 -->
    <img
      v-if="!failed"
      class="hand-card__image"
      :src="src"
      aria-hidden="true"
      @error="onImageError"
    >
    <!-- 降级占位：纯 CSS 画的圆角色块。色值走 token，不手写 hex。 -->
    <span
      v-else
      class="hand-card__image hand-card__image--fallback"
      :style="{ backgroundColor: TOWER_COLOR_TOKEN[card.towerType] }"
    />

    <!-- ② 单词文字。`label` 由 core 给（裁决 5：`promptText` 全文，不是 slug）。
         短句卡允许折成两行，卡面高度随行数走 —— 手牌区因此**不钉死**高度。 -->
    <span class="hand-card__label">{{ card.label }}</span>

    <!-- ③ 造价。数字由 core 给，组件**绝不**自己算或写死。 -->
    <span class="hand-card__cost">{{ card.cost }}</span>
  </button>
</template>

<style scoped>
/*
 * 卡宽 **132px**、档间距由父级 `HandDeck` 给 **12px**（AC-C3，裁决 2）。
 *
 * ⚠️ **高度不钉死**：单词卡一行、短句卡两行，卡面高度随行数走 ——
 *   `1-11:904` 立过同一条纪律（写死高度必然在下游 story 变成要返工的死代码）。
 *   下界是 `--touch-min`（48px），那是**命中区域**规则（见 tokens.css 的说明）。
 */
.hand-card {
  flex: 0 0 132px;
  width: 132px;
  min-height: var(--touch-min);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px;
  border: 2px solid transparent;
  border-radius: 8px;
  background-color: var(--color-path);
  /* ⚠️ 动效只经 CSS，且时长只用 token 档（架构硬约束 5）。
     反馈（`.is-selected`）**不加 transition**：--dur-fast 是 120ms > NFR5 的 100ms，
     把过渡算进「看见反馈」的时间会让任何用过渡的实现都不达标（见 AC-H1-5 的口径）。 */
  cursor: pointer;
}

.hand-card:disabled {
  cursor: default;
}

/*
 * 不可买 ⇔ 变灰且不可点（AC-C4）。
 *
 * ⚠️ 变灰走「不可用」的既有视觉语言（与 `--color-overlay-blocked` 同族的压暗），
 *   **不引入新色相**。`disabled` 属性是主判据；「点了没反应」那条在没有
 *   `disabled` 时是恒真的（1.11 的 M54 实测），所以两条都要有。
 */
.hand-card.is-unaffordable {
  /* alpha 压暗：叠在卡面底色之上，与两枚 overlay 罩同族。 */
  background-image: linear-gradient(rgba(0, 0, 0, 0.38), rgba(0, 0, 0, 0.38));
  color: var(--color-on-tower);
}

/* 选中态高亮（AC-D1）：靠**看得见**区分，不靠任何输入延迟或防抖 ——
   `epics.md:1114`：「防误触靠选中态高亮，不靠输入延迟」。 */
.hand-card.is-selected {
  border-color: var(--color-sun);
}

.hand-card__image {
  display: block;
  width: 44px;
  height: 44px;
  /* ⚠️ 不能写 `auto`：`<img>` 是替换元素，`auto` 解析成固有宽度（512px），
     塔会从卡面上整只画出去 —— 症状是「卡上什么都没有」（Tower.vue 同一个坑）。 */
  object-fit: contain;
}

.hand-card__image--fallback {
  border-radius: 50%;
  box-shadow: inset 0 0 0 3px var(--color-on-tower);
}

/*
 * 单词文字 —— 消费 1.11 预留的 `--text-tower-label` 档（AC-C3 / AC-C2）。
 *
 * ⚠️ **不许溢出、不许省略号截断单词、不许压到 `--text-body: 16px` 以下**
 *   （16px 是字号阶梯的下限）。`white-space: normal` + 行钳：
 *   整句允许在**空格处**换行（换行不是断词），但绝不允许把一个词劈成两半。
 *
 * ── 实测（2026-10-15 T10，Chromium 1223，800×1280 竖屏，`npm run dev`）───────
 *   量的是**全部 37 张卡**，不是抽样：
 *     · 卡宽 132px、`box-sizing: border-box`、padding 10px、border 2px
 *       ⇒ **文字可用宽 108px**（不是 AC-C3 估的 112px —— 漏算了两侧 2px 边框）
 *     · `--text-tower-label: 18px` ⇒ 最长的整词 `afternoon!` = **94.33px = 5.240em**
 *       ⇒ **硬上限 fs ≤ 108 / 5.240 = 20.6px**，18px 余量 **14.5%**
 *       （对照：选项卡那一档 159px 宽时余量 27.7%。手牌卡更窄，余量更薄，
 *        但 18px 仍在硬上限之内 ⇒ **取值不变**，变的只是余量与依据。）
 *     · 折行分布：**31 张一行 / 5 张两行 / 1 张三行 / 0 张超过三行**
 *     · 那唯一的三行卡是 `I have a ball for my dog.`（25 字符），折成
 *       `I have a` / `ball for my` / `dog.`（逐词 Range 量测，行宽 96.84 / 86.19 / 39.59px）
 *
 * ⚠️ **行钳 2 → 3 就是这一条量出来的偏离**：两行钳下**恰好这一张**被截断，
 *   且 Blink 的 `-webkit-line-clamp` 会自动补一个 `…` —— 孩子在卡面上看到的是
 *   「I have a ball for m…」，**他答对的那句话少了一半**。
 *   三行钳下 37 张**全部完整、0 截断**；代价是那一张卡高 137 → 160px
 *   （其余 36 张高度不变，手牌区在竖屏下仍留有整屏空白）。
 */
.hand-card__label {
  font-size: var(--text-tower-label);
  line-height: 1.25;
  text-align: center;
  white-space: normal;
  overflow-wrap: normal;
  word-break: normal;
  hyphens: none;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  /* ⚠️ **三行**（不是 AC-C3 原文的两行）—— 2026-10-15 真浏览器实测的裁决，
     详见下方「实测」块与 story 的偏离登记第 5 条。 */
  -webkit-line-clamp: 3;
  line-clamp: 3;
  /* ⚠️ 溢出时 Blink **会自动补一个省略号**，这一行写了 `clip` 也不管用
     （`-webkit-line-clamp` 自带 ellipsis 语义）。所以本 story 的做法不是
     「让裁掉的部分看不见」，而是**让最坏情况根本裁不到** —— 见下方实测。 */
  overflow: hidden;
  color: var(--color-tower-aoe);
}

.hand-card__cost {
  font-size: var(--text-body);
  line-height: 1;
  color: var(--color-sun);
}

/* 不可买时造价数字跟着压暗，避免它在灰卡上仍是全卡最亮的东西。 */
.hand-card.is-unaffordable .hand-card__cost {
  color: var(--color-on-tower);
}
</style>
