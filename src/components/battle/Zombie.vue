<script setup lang="ts">
/**
 * Zombie —— 一只僵尸 + 它的血条（Story 1.10 / AC-7、AC-8、AC-9）。
 *
 * ── 行号从哪来（AC-7，本 story 最容易漂的一条）──────────────────────────
 *   **一律读 `ZOMBIE_ROW`，绝不从 zombie 对象上读。**
 *   `Zombie` 类型**刻意没有 `row` 字段**（`types.ts:56-63` 逐字）：
 *   「行不变量不是靠断言守住的，是靠**类型里根本没有这个字段**守住的」。
 *   本组件因此**也不定义** `const ZOMBIE_ROW = 2` —— 那会开一个后门，
 *   让「改网格行数时忘了改这里」变成一件可能发生的事，而类型本来能挡掉它。
 *   摆放由父组件 `BattleField` 负责（它遍历格子时按 `cell.row === ZOMBIE_ROW` 问）。
 *
 * ── 血量条为什么是 DOM 覆盖层而不是画进 SVG（AC-9）───────────────────────
 *   art-direction §4.6：动态元素绝不进 SVG。而且 `<img>` 加载的 SVG 是
 *   **独立文档**，拿不到 CSS 变量、也无法被外部 DOM 覆写 ——
 *   血条画进去的话它会跟着图一起被缓存、一起缩放，且完全不受战场布局控制。
 *
 * ── 刻意不做的事 ──────────────────────────────────────────────────────────
 * · **不出现任何 hp 算术** —— 连 `zombie.hp / 100` 都不许写。
 *   算术的唯一出处是 `core/` 的 `zombieHpRatio()`（AC-9 / T6.3）。
 *   守卫 G19 断言本文件不含 `/ ZOMBIE_HP` 这类算术（见测试文件）。
 * · **不做「死亡」动画** —— 僵尸离场由 `reducer` 决定，渲染层不预演。
 * · **不在渲染路径打日志**（`[GA]:619-622`）。下面的 WARN 只在加载失败时一次。
 */

import { computed, ref } from 'vue'

import type { Zombie as ZombieEntity } from '../../core'
import { zombieHpRatio } from '../../core'
import { markAssetDegraded } from '../../services/asset-degradations'
import { ZOMBIE_ASSET_URL } from '../../services/asset-url'

const props = defineProps<{
  readonly zombie: ZombieEntity
}>()

/**
 * 血量比例 ∈ [0, 1]。
 *
 * ⚠️ 本行是本组件**唯一**与血量沾边的地方，而它仍然只是「调一个纯函数」。
 *   `core/types.ts` 的 `zombieHpRatio` 注释解释了为什么这行不能被展开成
 *   `zombie.hp / ZOMBIE_HP` —— 分母是战斗数值（Story 3.2 可调），
 *   组件里写死的那份不会跟着变，而血条会永远显示半满且界面上看不出异常。
 */
const hpRatio = computed(() => zombieHpRatio(props.zombie))

/** `<img>` 是否已加载失败。降级为 CSS 画的色块（art-direction §4.4）。 */
const failed = ref(false)

/** 僵尸图加载失败 ⇒ 记 WARN + 静默降级，**绝不阻断回合流转**。 */
function onImageError(): void {
  if (failed.value) return
  failed.value = true
  console.warn(
    `[content] 僵尸图加载失败：${ZOMBIE_ASSET_URL}（僵尸 ${props.zombie.id}）—— ` +
      '已降级为 CSS 占位形状，回合流转不受影响。若部署后普遍发生，先查 ' +
      '`import.meta.env.BASE_URL` 是否与站点前缀一致（守卫 G16）。',
  )
  // 📎 **Story 1.17 / AC-E2：登记这一条**（理由与 `Tower.vue` 同款，逐字理由见那里）。
  markAssetDegraded(ZOMBIE_ASSET_URL, `僵尸图（僵尸 ${props.zombie.id}）`)
}
</script>

<template>
  <!-- 僵尸本体。z-index 高于塔（AC-7：与塔同格时僵尸叠在上层）。 -->
  <img
    v-if="!failed"
    class="zombie"
    :src="ZOMBIE_ASSET_URL"
    alt="僵尸"
    :data-zombie="zombie.id"
    :data-zombie-col="zombie.col"
    @error="onImageError"
  >
  <!--
    ⚠️ `[CR]` 2026-10-16：与 `Tower.vue` 同一处缺陷的同一个修法 ——
      占位块原来无 role、无 aria-label，`v-if` 换掉 `<img>` 的那一刻
      这只僵尸从**无障碍树里整个消失**。补 `role="img"` + 同一句 `alt`。
      守卫：`battle-field.test.ts` 的 `AC-8 —— 降级不改变语义` 那一条
      （塔与僵尸同一条，不占 G 编号 —— G21–G54a 已被 1.12 / 1.13 预留）。
  -->
  <span
    v-else
    class="zombie zombie--fallback"
    role="img"
    aria-label="僵尸"
    :data-zombie="zombie.id"
    :data-zombie-col="zombie.col"
    :data-fallback="true"
  />

  <!--
    血条（AC-9：`[epics] AC:1020`「血量变化在网格上可见」）。

    ⚠️ 这条 AC 的**决策来源是 epics 不是 GDD** —— GDD 全文没有任何关于血量显示的段落
       （[CS] 2026-10-15 穷尽检索确认）。实现方不要以为漏读了 GDD。

    DOM 覆盖层，**不是 SVG 内画的**（见文件头）。
    宽度绑 `zombieHpRatio()`，**过渡时长写在 CSS**（架构硬约束 5）——
    本文件不出现任何毫秒常量。
  -->
  <span
    class="hp-bar"
    :data-hp-ratio="hpRatio"
    aria-hidden="true"
  >
    <span
      class="hp-bar__fill"
      :style="{ width: `${hpRatio * 100}%` }"
    />
  </span>
</template>

<style scoped>
/*
 * 僵尸 3/4 侧朝**左**（塔朝右），见 art-direction §3。该朝向由 SVG 保证，
 * 本文件不翻转。
 *
 * z-index: 2 —— 高于塔的 1。僵尸轨迹 8→6→4→2→0 必然经过塔所在的第 3 行，
 * 同格共存是常态（AC-7）。
 */
.zombie {
  position: absolute;
  /*
   * ⚠️ **`width/height` 必须写死百分比，不能写 `auto`**（真浏览器核对时踩过）：
   *   `<img>` 是**替换元素**，`width: auto` 解析成的是**图自身固有宽度**（512px），
   *   不是「撑满 inset 框」。写 `auto` 的后果是每只僵尸都以 512px 从
   *   `.battle-cell` 的定位原点画出去 —— 战场右边平白多出一只巨大僵尸，
   *   而 `inset: 6%` 明明写着「缩进 6%」。
   *   ⇒ 显式给 `width/height: 88%`（= 100% − 左 6% − 右 6%），
   *     再用 `object-fit: contain` 保证 512×512 的 SVG 不变形
   *     （格子恒为正方形 1:1，所以 contain 实际上就是精确铺满）。
   */
  inset: 6%;
  width: 88%;
  height: 88%;
  object-fit: contain;
  z-index: 2;
}

/* 降级占位：一个深墨绿圆角色块，色值走 token 不手写 hex（AC-5）。 */
.zombie--fallback {
  border-radius: 50%;
  background-color: var(--color-zombie);
  box-shadow: inset 0 0 0 3px var(--color-asset-stroke);
}

/*
 * 血条 —— 盖在僵尸**下方**的一条细槽（DOM 覆盖层，不是 SVG 内画的）。
 *
 * 位置：底部。理由是血条压在僵尸身上会挡住「它长什么样」，
 * 而 6 岁半判断僵尸靠的是轮廓不是数字。
 */
.hp-bar {
  position: absolute;
  left: 10%;
  right: 10%;
  bottom: 2%;
  height: 6%;
  z-index: 3;
  border-radius: 999px;
  /* 底槽用白边，与深墨绿的僵尸拉开明度差；不用新 token（AC-5 的新 token 要走
     palette.test.ts 的 WCAG 实算，而这里它是一个半透明槽不是底色）。 */
  background-color: var(--color-on-tower);
  overflow: hidden;
}

.hp-bar__fill {
  display: block;
  height: 100%;
  background-color: var(--color-wrong);
  /*
   * ⚠️ **时长只出现在 CSS**（架构硬约束 5）。TS 侧不许有毫秒常量 ——
   *   写在 CSS 里它才会跟着 `--dur-*` 一起被调整，而写在 TS 里会变成一个
   *   没人记得的魔数。
   *
   * 过渡的是 width：僵尸挨打 → `zombieHpRatio()` 变 → 血条宽度变 → CSS 过渡。
   * **不引 JS 补间、不用 setInterval / requestAnimationFrame** ——
   * 回合驱动、无连续运动，逐帧 JS 在本架构下是违规模式而非优化点（Dev Notes §6）。
   */
  transition: width var(--dur-fast) ease-out;
}
</style>
