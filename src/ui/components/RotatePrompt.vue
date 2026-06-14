<template>
  <Transition name="fade">
    <div
      v-if="show"
      class="rotate-prompt"
      data-testid="rotate-prompt"
    >
      <div class="phone-icon">📱</div>
      <p class="title">请将设备旋转为竖屏</p>
      <p class="subtitle">Please rotate your device to portrait</p>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

const show = ref(false);

function update(): void {
  const isLandscape = window.innerWidth > window.innerHeight;
  // Mobile/tablet landscape: width < 1024 is the cutoff for "not a desktop".
  // 1920x1080 desktop is landscape too but should NOT trigger the prompt.
  show.value = isLandscape && window.innerWidth < 1024;
}

onMounted(() => {
  update();
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', update);
});

onUnmounted(() => {
  window.removeEventListener('resize', update);
  window.removeEventListener('orientationchange', update);
});
</script>

<style scoped>
.rotate-prompt {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  color: white;
  font-family: 'Nunito', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  text-align: center;
  padding: 20px;
}

.phone-icon {
  font-size: 80px;
  margin-bottom: 24px;
  animation: wobble 2s ease-in-out infinite;
}

.title {
  font-size: 24px;
  font-weight: 700;
  margin: 0 0 8px 0;
}

.subtitle {
  font-size: 16px;
  opacity: 0.8;
  margin: 0;
}

@keyframes wobble {
  0%, 100% { transform: rotate(0deg); }
  25% { transform: rotate(-15deg); }
  75% { transform: rotate(15deg); }
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
