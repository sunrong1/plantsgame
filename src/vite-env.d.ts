/// <reference types="vite/client" />

// Vue 3.5 + vue-tsc 会自己处理 .vue 的类型，
// 因此下面这个通配声明不是必需的 —— 留着无害，且在只跑 tsc 而不跑 vue-tsc 时能兜底。
declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>
  export default component
}
