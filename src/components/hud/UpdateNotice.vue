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
 */
.update-notice {
  position: fixed;
  top: env(safe-area-inset-top, 0px);
  left: 0;
  right: 0;
  z-index: 30;

  /* 穿透：不吃掉点击（AC-C3）。 */
  pointer-events: none;

  margin: 0;
  padding: 4px var(--space-panel-pad);

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
