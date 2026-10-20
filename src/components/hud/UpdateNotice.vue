<script setup lang="ts">
/**
 * UpdateNotice —— **离线准备 / 新版本**的非阻塞提示（Story 1.18 / AC-C1、AC-C2、C3）。
 *
 * ── 它是什么 ──────────────────────────────────────────────────────────────
 * 一条贴在页面顶部安全区内的**状态条**。它只说一件事：
 * 「离线要等下次启动才生效」或者「有新版本，下次启动生效」。
 *
 * ── 🔥 为什么它是 `pointer-events: none` 的（AC-C3）─────────────────────────
 * AC-C3 逐字要：提示「**非阻塞的**：不抢焦点、不 `alert`、不遮挡战场、
 * 不得延后或抢占『开始游戏』点击内的三步音频解锁」。
 * 与其逐条论证「我的实现恰好不抢焦点」，不如从 CSS 上**让它没有能力抢**：
 * 整条 `pointer-events: none` ⇒ 点击穿透到底下的 HUD / 战场，
 * 它上面**根本不存在可点的东西**，也就没有「被误触」「抢走一次点击」的可能。
 *
 * ⚠️ **这是本组件没有「立即刷新」按钮的原因**（AC-C2）：
 * 一旦给了按钮，就等于提供了「在孩子正在玩的那一局里强制刷新」的路径。
 * AC 要的是「有新版本，下次启动生效」—— 那是一条**告知**，不是一个动作邀请。
 *
 * ── 为什么不把它做成弹窗 / 模态 ────────────────────────────────────────────
 * 同上：模态意味着焦点陷阱与遮罩，而 NFR13 逐字「孩子面前永不出现技术错误」——
 * 一条会拦住操作的横幅出现在游戏中间，比它要通知的事情本身更糟。
 *
 * ── 挂在 `App.vue`（根组件）而不是 `LevelView.vue` ────────────────────────
 * 与 1.17 的调试面板同一条纪律：它是**跨视图的全局状态**（开始页也要看得到
 * 「离线要等下次启动」），而 `App.vue` 是唯一在两个视图之上都活着的地方。
 */
import { computed, onBeforeUnmount, ref } from 'vue'

import { subscribeServiceWorkerState } from '../../services/sw-registration'
import type { ServiceWorkerUiState } from '../../services/sw-registration'

// ⚠️ **组件只读 state，不自己注册 SW**（架构硬约束 4 的同款纪律）：
//   注册由 `src/main.ts` 在 `mount()` 之后发起。本组件在注册发生之前就挂载了，
//   `subscribeServiceWorkerState()` **订阅即刻收到当前值**，所以首次渲染就是对的。
const state = ref<ServiceWorkerUiState>({ kind: 'idle' })

const unsubscribe = subscribeServiceWorkerState((next) => {
  state.value = next
})

// 🔥 组件卸载时必须退订：这是本仓库的内存泄漏防线（Story 1.13 起的一条铁律）。
//   模块级的 `listeners` 是 `Set`，不退订的话每次挂载都多留一个闭包。
onBeforeUnmount(unsubscribe)

/** 只有这两种状态值得占一条屏幕上的横幅。`idle` / `unsupported` 一律不渲染。 */
const visible = computed(() => state.value.kind === 'update-ready' || state.value.kind === 'preparing')

/**
 * 文案 —— AC-C1 逐字要的那句是「新版本，下次启动生效」。
 *
 * ⚠️ **两种状态用两句不同的话**，因为它们是**两件不同的事**：
 *   · `preparing` 是首次安装：根本没有「新版本」，说「有新版本」是假话；
 *   · `update-ready` 才对应 AC 的原文。
 * 换句话说，AC-C1 的文案只属于 `update-ready`，`preparing` 是它旁边那条独立事实。
 */
const text = computed(() => (state.value.kind === 'update-ready' ? '有新版本，下次启动生效' : '正在准备离线，下次启动生效'))
</script>

<template>
  <!--
    ⚠️ `role="status"` + `aria-live="polite"`：屏幕阅读器会**播报**它，
       但不会抢焦点、不会打断当前朗读（AC-C3 的「不抢焦点」在无障碍树上同样成立）。
    ⚠️ `aria-live="polite"` 不是 `assertive` —— 后者会立刻打断屏幕阅读器当前的播报。
  -->
  <p
    v-if="visible"
    class="update-notice"
    role="status"
    aria-live="polite"
    data-testid="update-notice"
  >
    {{ text }}
  </p>
</template>

<style scoped>
/*
 * 🔥 **`pointer-events: none` 是本组件的第一条纪律**，不是可选项。
 *   AC-C3 要求「不抢焦点、不遮挡战场」；把整条做成穿透的，
 *   就从「实现恰好不抢」升级成「它没有能力抢」。
 *
 * ⚠️ **贴在顶部而不是居中浮层**：`.battle-grid` 在 HUD 之下、页面中段。
 *   顶部安全区内的一条窄带是全页唯一「战场到不了」的位置；
 *   居中浮层必然压在战场上，而 AC-C3 与 AC-D1 都逐字禁止那件事。
 *
 * ⚠️ **safe-area 必需**：刘海 / 挖孔屏上，顶部安全区之外的系统状态栏
 *   会把这条提示盖掉一半。`.level-view` 已经为整页加了顶部安全区内边距，
 *   本组件是 `position: fixed`，脱离那个盒模型，必须自己再加一次。
 *
 * 🔥📎 **`[CR]` 2026-10-20：高度钉成 `--space-panel-pad`（16px）——
 *   这条提示条**结构上不可能压住 HUD**。**
 *   ⚠️ **改之前实测（真实构建产物 + 真实 chromium，inner 800×900 竖屏）**：
 *     提示条 `top=0 bottom=32`（32px 高），而 HUD `top=16 bottom=59`
 *     ⇒ **重叠 16px**；被盖住的叶子节点逐字是：
 *       · `sun-counter__value`（"0"，30px 高）—— 上 9px 被盖；
 *       · `progress-bar__label`（"第 1 单元 · 0/37"，19px 高）—— 上 10px 被盖（一多半）；
 *       · `heart-row__shape` ×3（各 18px）—— 上 3px 被盖。
 *     ⇒ 也就是说**阳光数字被削掉一截、进度标签被盖掉一半、三颗心的顶部被削掉**。
 *   ⇒ **根因**：这条是 `position: fixed` 的浮层，而**没有任何地方为它预留高度** ——
 *     `.level-view` / `.start-view` 的顶部内边距只有
 *     `calc(var(--space-panel-pad) + env(safe-area-inset-top))`（16px），
 *     而提示条自己高 32px。
 *   ⇒ **修法（结构式，不是位置式）**：把提示条的高度钉成 **`--space-panel-pad`**，
 *     与两个视图的顶部内边距**用同一个 token** ⇒
 *     提示条底边 = `env(safe-area-inset-top) + --space-panel-pad`
 *     = 视图内容顶边 ⇒ **恒不重叠**（差值恒为 0，不依赖任何测量）。
 *   ⚠️ **为什么不改成「把 HUD 往下推」**：竖屏 800×900 下整页内容**恰好装得下**
 *     （实测 `scrollHeight == clientHeight == 813`，零滚动）——
 *     往下推 32px 会让题卡底部掉出视口，正是本 story P0-2 刚修掉的那个形态。
 *     ⇒ 浮层**必须不占垂直预算**，而「高度 = 顶部内边距」正是唯一不占预算又不重叠的位置。
 *   ⚠️ **字不会被切（实测）**：字是 `--text-body`（16px），`line-height` 也钉成
 *     `var(--space-panel-pad)`（16px）⇒ 行盒正好等于条高。
 *     ⚠️ 浏览器报的 `scrollHeight` 是 **17**（比 `clientHeight` 多 1）——
 *       那是**字体的度量盒**（ascent+descent）比行盒高 1px，**不是墨迹被切**。
 *     ⇒ 实测（真实 chromium 截图逐行数墨迹像素）：
 *       生产版（16px / `overflow: hidden`）的墨迹占 **第 0–14 行**（15 行），
 *       与「24px / `overflow: visible`」的对照版**逐行同形**
 *       （对照版占第 40–54 行，形状 72/113/114/94/77/100/111/99/108/89/84/84/99/126/75），
 *       第 15 行两边都只有 1 个噪点 ⇒ **一个字都没被切**。
 *     （`--text-body` 是本项目的字号下限，不许再往下取档。）
 */
.update-notice {
  position: fixed;
  top: env(safe-area-inset-top, 0px);
  left: 0;
  right: 0;
  z-index: 30;

  /* 🔥 高度 = 视图的顶部内边距 ⇒ 恒不压住 HUD（理由见上方注释）。 */
  height: var(--space-panel-pad);
  line-height: var(--space-panel-pad);

  /* 穿透：不吃掉点击（AC-C3）。 */
  pointer-events: none;

  margin: 0;
  /* ⚠️ **只有左右内边距**：上下内边距会让条高超过 `--space-panel-pad`，
     而那个高度正是「不压住 HUD」的全部依据。 */
  padding: 0 var(--space-panel-pad);

  /* ⚠️ 底色用 `--color-hud-panel`（与 manifest 的 `theme_color` 同源）：
     它是 tokens.css 里为「浅色内容叠在暗底」定的那块板，白字对比度充足。 */
  background-color: var(--color-hud-panel);
  color: var(--color-on-tower);
  font-size: var(--text-body);

  /* 不许折行占掉战场的高度；超长时省略。 */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
}

/*
 * ⚠️ **动效时长写在 CSS，不写在 TS**（R-05）。
 * 这里**没有**任何过渡 —— 这条提示是纯状态告知，加淡入淡出只会让人
 * 多等半秒才知道「刚才那条是不是真的」。真要加，先复跑
 * 「computedStyle 里不许出现字面量毫秒」那条守卫。
 */
</style>
