import { createApp } from 'vue'

import App from './App.vue'
import { registerServiceWorker } from './services/sw-registration'
import './styles/base.css'

createApp(App).mount('#app')

// 📎 **Story 1.18 / AC-B5：挂载之后才注册 Service Worker。**
//
// ⚠️ **必须在 `mount()` 之后、且不 `await`**：
//   注册是一次网络往返 + 一次 SW 脚本下载，挂在挂载前面就是一次冷启动停顿；
//   而 AC-C3 逐字要求提示「不得延后或抢占『开始游戏』点击内的三步音频解锁」——
//   这条路径与 `src/app/audio-unlock.ts` 完全无关，本文件不碰它。
//
// ⚠️ **本函数永不抛错**（裁决 7：SW 注册失败归运行时层，记 `[sw] WARN` 后静默继续）。
registerServiceWorker()
