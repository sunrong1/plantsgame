<script setup lang="ts">
/**
 * 应用根组件 —— 直接渲染 <StartView />，不引路由。
 * view 切换属 Story 1.15（届时才建 src/app/router.ts）。
 *
 * StartView 必须显式 import：script setup 不做全局组件解析，
 * 漏掉这行会渲染成一个没有内容的 <startview> 自定义元素 ——
 * 而且 vue-tsc 不报错，页面只是白着。
 */
import StartView from './views/StartView.vue'
</script>

<template>
  <StartView />
</template>
