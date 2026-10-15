<script setup lang="ts">
/**
 * Tower —— 一株塔（Story 1.10 / AC-8，结转 `docs/art-direction.md` §4.3 / §4.4）。
 *
 * ── 刻意不做的事 ──────────────────────────────────────────────────────────
 * · **不 inline SVG、不 base64、不 `import` 图进 bundle**（`[GA]:304`：
 *   图片不进 JS bundle）。一律 `<img src>` 引用。
 * · **不从 zombie / state 上算任何战斗数值**（架构硬约束 2）。
 * · **不在渲染路径打日志**（`[GA]:619-622`）—— 下面那条 `console.warn` 只在
 *   `<img>` **加载失败**时触发一次，不是每帧。
 * · **不做选中 / 射程预览** —— 属 Story 1.12。
 *
 * ── 为什么图加载失败要「静默降级」而不是报错（结转项 1 / art-direction §4.4）──
 *   孩子的界面不能因为一张插画没加载出来就**停在原地等他**。回合流转是本作的
 *   主干道（答错 → 僵尸前进 → 丢心），任何一张图 404 都不许阻断它。
 *   降级成一个 CSS 画的色块 —— 塔型与形状仍能看出（`--color-tower-*` 三色两两
 *   色相间隔 ≥ 60°，`palette.test.ts` 实算守着），孩子不至于以为游戏坏了。
 *
 * ── 关于「组件只认识 app/」这条纪律 ───────────────────────────────────────
 *   `StartView.vue:14-17` 要求组件不直接 import `services/`，理由是
 *   「音频解锁的三步顺序是一条架构约束，写在 `app/audio-unlock.ts` 里肉眼可查」。
 *   **那条理由在本文件不成立** —— `asset-url.ts` 是一个**无状态字符串函数**，
 *   不承载任何顺序不变量或副作用顺序，穿过 app/ 只会多一层无信息的中转。
 *   故此处直接 import，并在文件头留痕以便日后推翻。
 */

import { computed, ref } from 'vue'

import type { Tower as TowerEntity, TowerType } from '../../core'
import { expectedTowerAssetUrl } from '../../services/asset-url'

const props = defineProps<{
  readonly tower: TowerEntity
}>()

/**
 * 塔型字面量 → 色板 token 名。**必须显式映射，不能拼字符串**。
 *
 * ⚠️ 塔型字面量是 `direct`，而色板 token 叫 `--color-tower-shooter`（1.6 的历史命名，
 *   `asset-url.ts:53` 与 `art-direction.md:499` 都记了这条易混）。
 *   拼 `` var(--color-tower-${towerType}) `` 会得到一个**不存在**的
 *   `--color-tower-direct` ⇒ `background-color` 回落到 `transparent`
 *   ⇒ **直射塔的降级色块整只看不见**（只剩那一圈白色 inset 描边）。
 *
 * 🐛 **Story 1.12（AC-C2「沿用 Tower.vue 的加载失败降级形态」）顺带修掉的既有缺陷**：
 *   本文件原先就是那行拼接 —— 直射塔的降级形态一直没显示出塔色。
 *   手牌卡（`hand/HandCard.vue`）要复用同一形态，复制缺陷不叫「沿用」。
 */
const TOWER_COLOR_TOKEN: Record<TowerType, string> = {
  direct: 'var(--color-tower-shooter)',
  slow: 'var(--color-tower-slow)',
  aoe: 'var(--color-tower-aoe)',
}

/** 图 URL 走 `asset-url.ts`（已接 `import.meta.env.BASE_URL`），不手写字符串拼接。 */
const src = computed(() => expectedTowerAssetUrl(props.tower.towerType))

/** `<img>` 是否已加载失败。用于切到 CSS 占位形状。 */
const failed = ref(false)

/**
 * 图加载失败：记一条 `[content]` WARN 并静默降级，**绝不阻断回合流转**。
 *
 * ⚠️ `[content]` 前缀不是随意取的：图片缺失属于**内容资产**问题，不是渲染 bug，
 *   前缀让 `[CR]` 按内容那条线去查（`validate:content` 的资产存在性检查）。
 *
 *   这里**不 throw、不弹窗、不停在回合上** —— 见文件头。
 */
function onImageError(): void {
  if (failed.value) return
  failed.value = true
  console.warn(
    `[content] 塔图加载失败：${src.value}（塔 ${props.tower.id}，塔型 ${props.tower.towerType}）—— ` +
      '已降级为 CSS 占位形状，回合流转不受影响。若部署后普遍发生，先查 ' +
      '`import.meta.env.BASE_URL` 是否与站点前缀一致（守卫 G16）。',
  )
}
</script>

<template>
  <img
    v-if="!failed"
    class="tower"
    :src="src"
    :alt="`${tower.towerType} 塔`"
    :data-tower="tower.id"
    :data-tower-type="tower.towerType"
    @error="onImageError"
  >
  <!-- 降级占位：CSS 画的圆角色块 + 塔面文字色。
       色值走 token，**不手写 hex**（AC-5）。 -->
  <span
    v-else
    class="tower tower--fallback"
    :data-tower="tower.id"
    :data-tower-type="tower.towerType"
    :data-fallback="true"
    :style="{ backgroundColor: TOWER_COLOR_TOKEN[tower.towerType] }"
  />
</template>

<style scoped>
/*
 * 塔填满所在格子 —— 格子是 1:1 的正方形（`BattleField` 的 `aspect-ratio: 9/5`
 * + 每格 `1/1`），塔图是 `viewBox="0 0 512 512"` 的**正方形**画布，
 * 两者同比例 ⇒ 不会变形。
 *
 * ⚠️ 3/4 侧朝向：塔朝右（僵尸从右来），见 art-direction §3。
 *   该朝向由 SVG 本身保证，本文件不翻转也不裁切。
 */
.tower {
  position: absolute;
  /* 留一点边距，让相邻格子的塔不贴在一起 —— 贴在一起时两株塔糊成一团，
     孩子数不清自己有几株。 */
  inset: 6%;
  /*
   * ⚠️ **`width/height` 必须写死百分比，不能写 `auto`**（真浏览器核对时踩过，
   *   与 `Zombie.vue` 同一个坑）：`<img>` 是**替换元素**，`width: auto`
   *   解析成图的**固有宽度**（512px）而不是「撑满 inset 框」，塔会从格子里
   *   整只画出去、跑到屏幕外，界面上表现为「塔不见了」。
   *   `object-fit: contain` 保证 512×512 的 SVG 在正方格里不变形。
   */
  width: 88%;
  height: 88%;
  object-fit: contain;
  z-index: 1;
  /* 僵尸叠在上层（AC-7）：僵尸与塔**可以同格共存** ——
     塔在 `col ∈ [1,7]` 的第 2 行，僵尸轨迹 8→6→4→2→0 必然经过。
     那是**渲染顺序**决定，与战斗判定无关（塔照常在射程内开火）。 */
}

/* 降级占位形状：一个圆角色块。 */
.tower--fallback {
  border-radius: 50%;
  /* 白色内圈，让三个塔型在降级状态下仍能互相区分 ——
     纯色块只有底色，靠 `--color-on-tower` 的一圈描边保住轮廓。 */
  box-shadow: inset 0 0 0 3px var(--color-on-tower);
}
</style>
