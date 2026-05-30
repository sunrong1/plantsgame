<template>
  <Transition name="fade">
    <div v-if="visible" class="speech-overlay">
      <div class="speech-bubble">
        <span class="word" :class="{ animate: visible }">{{ word }}</span>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { watch, onUnmounted } from 'vue'

const props = defineProps<{
  visible: boolean
  word: string
}>()

const emit = defineEmits<{
  done: []
}>()

let timeoutId: ReturnType<typeof setTimeout> | null = null

watch(() => props.visible, (isVisible, oldIsVisible) => {
  if (isVisible && !oldIsVisible) {
    // Only start timeout on transition from false to true
    if (timeoutId) clearTimeout(timeoutId)
    timeoutId = setTimeout(() => {
      emit('done')
    }, 2500)
  } else if (!isVisible) {
    // Clean up timeout when hidden
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
  }
})

onUnmounted(() => {
  if (timeoutId) clearTimeout(timeoutId)
})
</script>

<style scoped>
.speech-overlay {
  display: flex;
  justify-content: center;
  width: 100%;
}

.speech-bubble {
  background: linear-gradient(135deg, #2D5A27 0%, #4A8B3C 100%);
  border: 4px solid #FFD700;
  border-radius: 20px;
  padding: 20px 40px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.word {
  font-family: 'Fredoka One', 'Nunito', sans-serif;
  font-size: 56px;
  color: #FFFFFF;
  text-shadow: 0 4px 8px rgba(0, 0, 0, 0.5);
  display: block;
  text-align: center;
}

.word.animate {
  animation: pulse 0.3s ease-in-out infinite alternate;
}

@keyframes pulse {
  from { transform: scale(1); }
  to { transform: scale(1.05); }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>