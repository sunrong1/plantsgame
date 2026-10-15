<script setup lang="ts">
/**
 * RangeOverlay —— 格子上的覆盖层（Story 1.12 / AC-E2、AC-E3、AC-E4、AC-D3）。
 *
 * 架构 `game-architecture.md:744` 点名的组件名，**不许自创**。
 *
 * ── 三种形态，一个组件 ──────────────────────────────────────────────────────
 * | 形态 | class | 何时 | 视觉 |
 * |---|---|---|---|
 * | 射程 | `.is-in-range` | 指向可建格、且该格落在 `coverCellsAt(...)` 里 | `--color-overlay-range` |
 * | 非僵尸行 | `.is-inert-row` | 选中卡时，第 1/2/4/5 行 | `--color-overlay-inert` |
 * | 拒绝闪 | `.is-refused` | 按在不可建/已占用格上（AC-D3） | `--color-overlay-blocked`，100ms 后淡出 |
 *
 * ⚠️ **它是 `.battle-cell` 的子元素，不是兄弟**（AC-E2）。`.battle-cell` 必须保持为
 *   `.battle-grid` 的直接子元素且恰好 45 个、行优先顺序不变 ——
 *   守卫 G17 / G18 依赖 `data-row`/`data-col` 与 DOM 顺序，
 *   而 `BattleField.vue` 的 `nth-child(n+19):nth-child(-n+27)` 靠手算下标定位第 3 行。
 *
 * ── 层序（AC-E2 逐字：三个绝对定位层叠在一起）──────────────────────────────
 *   `.tower` / `.zombie`（`z-index: 1`）**>** 本组件（`z-index: 0`）**>**
 *   `.is-house::before`（`auto`）。
 *   ⇒ `z-index: 0` 与 `auto` 落在同一层叠级别，**靠 DOM 顺序分先后**：
 *     伪元素 `::before` 是 cell 的第一个子盒，本组件在模板里排在塔与僵尸**之后**，
 *     所以必然压在上面 —— 这一条**依赖模板顺序**，改模板时别把本组件往前挪。
 *   （`z-index: 0` 与 `auto` 在同一层叠上下文里等价，这一点是规范里的，不靠浏览器脾气。）
 *
 * ── 刻意不做的事 ──────────────────────────────────────────────────────────
 * · **不算射程**（架构硬约束 2）—— `coverCellsAt` 在 `core/build.ts`，
 *   这里只按传进来的 `variant` 上色。
 * · **`pointer-events: none`**（AC-E2）—— 覆盖层绝不能吃掉格子的
 *   `pointerdown`/`pointerup`；层一挡，建造交互就整体失灵且毫无报错。
 * · **不做淡入淡出的 `transition`** —— 射程与压暗是「当前状态」的表达，
 *   不是过程。压暗闪是**一次性动画**（`--dur-feedback`），不留下任何残影。
 * · **不引入新色值**（AC-E3、AC-E4）—— 三个形态各自消费既有/新登记的 token。
 */

/**
 * 覆盖层的形态。
 *
 * ⚠️ 单独起一个类型名（而不是在 `defineProps` 里内联写联合类型）：
 *   下方的 `VARIANT_CLASS` 要以它为键，若只有 `props` 一个出处，
 *   就得写 `typeof props.variant` —— 而 `props` 那样只会被当类型用一次，
 *   ESLint 的 `no-unused-vars` 会当场报「赋了值却只用作类型」。
 */
type Variant = 'range' | 'inert' | 'refused'

defineProps<{
  /**
   * 形态。**调用方**（`BattleField`）判定该画哪一种 —— 覆盖层自己不读 `state`，
   * 也不自己判断「这一格能不能建」。
   */
  readonly variant: Variant
}>()

/**
 * 形态 → class 名。三个 class 名是 AC 写死的（AC-E1 的 `.is-in-range`、
 * AC-E3 的 `.is-inert-row`、AC-D3 的压暗闪），守卫 **G30** 直接引用它们。
 *
 * ⚠️ 写成**显式查表**而不是 `` `is-${variant}` ``：
 *   拼字符串会让「class 名与 AC 不一致」这件事在代码里毫无痕迹 ——
 *   而守卫是照着 AC 里的字面名写的，拼错了守卫就会去查一个不存在的 class，
 *   变成一条**永远为真**的假守卫（本仓库吃过三次这种亏）。
 */
const VARIANT_CLASS: Record<Variant, string> = {
  range: 'is-in-range',
  inert: 'is-inert-row',
  refused: 'is-refused',
}
</script>

<template>
  <div
    class="range-overlay"
    :class="VARIANT_CLASS[variant]"
    aria-hidden="true"
  />
</template>

<style scoped>
/*
 * ⚠️ 三条声明是 AC-E2 的**逐字**要求，位置 `absolute` + `inset: 0` + 不吃指针。
 *   `inset: 0` 是「铺满整格」，写 `width/height: 100%` 在有 `box-sizing: border-box`
 *   的全局基线下等价，但 `inset` 在这里语义更准：覆盖层与格子**共边**。
 */
.range-overlay {
  position: absolute;
  inset: 0;
  /* ⚠️ 必需：覆盖层压在格子上面，若还吃指针事件，
     `pointerdown`/`pointerup` 会被它吞掉 ⇒ 建造交互静默失灵。 */
  pointer-events: none;
  /* 层序见文件头：压得住 `::before`，压不住塔与僵尸。 */
  z-index: 0;
}

/*
 * 射程罩 —— AC-E4：这个 token **就是为本 story 准备的**，不许另造。
 *
 * ⚠️ 它**不在** `palette.test.ts` 的 WCAG 实算集里，是有意的
 *   （`tokens.css` 的说明）：只断言它是半透明 rgba。
 *   ⇒ 改它不会让任何对比度测试变红，**别拿它当保险**。
 */
.is-in-range {
  background-color: var(--color-overlay-range);
}

/*
 * 非僵尸行压暗 —— AC-E3：新登记的 `--color-overlay-inert`。
 *
 * ⚠️ 与「不可建格」的 `--color-overlay-blocked` 是**两条不同的罩**，
 *   区分靠**形状**（竖带两列 vs 横带四行）**加**深浅（0.18 vs 0.10）双重线索。
 *   新值必须**明显更轻** —— 与射程罩同族（盖在草地上的中性 alpha）。
 */
.is-inert-row {
  background-color: var(--color-overlay-inert);
}

/*
 * 拒绝闪（AC-D3）：按在不可建 / 已占用格上，**不响应**但要有反馈。
 *
 * ⚠️ 「不响应」不是「点了完全没反应」—— NFR5 要求 100ms 内看得见反馈。
 *   一段**一次性**动画：播完由 `BattleField` 的 `@animationend` 收掉 class，
 *   不留残影（架构硬约束 5：时长写 CSS 不写 TS；也没有任何 `setTimeout`）。
 * ⚠️ 用 `--dur-feedback`（100ms）而不是 `--dur-fast`（120ms）—— 见 tokens.css 的说明。
 */
.is-refused {
  animation: range-overlay-refuse var(--dur-feedback) ease-out;
}

@keyframes range-overlay-refuse {
  from {
    opacity: 1;
  }

  to {
    opacity: 0;
  }
}

.is-refused {
  background-color: var(--color-overlay-blocked);
}

/*
 * ⚠️ **刻意不加 `prefers-reduced-motion` 分支**（深思后的决定，不是遗漏）：
 *   本动画是**单格、单次、不位移、不缩放**的 100ms 透明度淡出 ——
 *   引发前庭不适的是大幅位移/缩放/视差类动效，这一类不在其中。
 *   而把它关掉的代价很具体：class 是由 `BattleField` 的 `@animationend` 收掉的，
 *   `animation: none` ⇒ `animationend` **永远不触发** ⇒ class 挂在格子上收不掉
 *   ⇒ 那一格会**一直**带着压暗罩，直到下一次交互才消失 ——
 *   「刚才不能放」被永久画成静态的「这里不能放」，那是**错的**信息，
 *   比动效本身有害得多。
 *   ⇒ 保留动画。真要照顾减弱动效的用户，正确做法是把「收 class」这件事
 *   从 `animationend` 挪到一条与动画无关的通路（例如下一次 `pointerdown` 顺带清），
 *   那是独立的一条 story，不在本 story 的 AC 范围内。
 */
</style>
