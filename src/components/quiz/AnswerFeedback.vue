<script setup lang="ts">
/**
 * AnswerFeedback —— 答对 / 答错结果条（Story 1.11 / AC-D2）。
 *
 * ── 职责边界 ──────────────────────────────────────────────────────────────
 * 只把「答对还是答错」这个**已经算好的事实**显示出来。
 * 它自己不判定 —— 判定在 `reducer` 里，判据（`masteredEntryIds` 里有没有
 * `question.entryId`）在 `QuestionCard` 里读出，经 `right` prop 传下来。
 *
 * ── 刻意不做的事 ──────────────────────────────────────────────────────────
 * · **不 import `services/pronunciation`** —— 本组件不发声（守卫 G25）。
 * · **不 throw、不写 assert**（AC-E3）。
 * · **不带 transition** —— `--dur-fast` 是 120ms，而 NFR5 要求反馈 ≤100ms 呈现。
 *   带过渡会让「反馈出现」在视觉上慢过 AC 的上限。守卫见
 *   `tests/components/quiz-card.test.ts` 的「反馈 class 不带 transition」。
 */

const props = defineProps<{
  readonly right: boolean
}>()
</script>

<template>
  <!--
    `role="status"` 让无障碍树把这条当作状态播报而不是又一块要读的内容。
    ⚠️ 文字**只用中文**：NFR13 的口径是「孩子面前绝不出现任何英文错误提示」，
    而这道卡本身就是英文学习材料 —— 在结果条上冒英文会把「反馈」与「题目」混成一类。
  -->
  <p
    class="answer-feedback"
    :class="props.right ? 'is-right' : 'is-wrong'"
    role="status"
  >
    {{ props.right ? '答对了' : '再想想' }}
  </p>
</template>

<style scoped>
.answer-feedback {
  margin: 12px 0 0;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: var(--text-feedback);
  text-align: center;
  color: #ffffff;
}

/*
 * ⚠️ 这两个色值是 1.6 定稿、被 `tests/content/palette.test.ts` 按 WCAG 实算守着的
 *   —— 本文件**引用**它们，**一个字都不许改**（改了那条测试会立刻红）。
 *   同样刻意**不加 transition**（见文件头）。
 */
.answer-feedback.is-right {
  background: var(--color-correct);
}

.answer-feedback.is-wrong {
  background: var(--color-wrong);
}
</style>
