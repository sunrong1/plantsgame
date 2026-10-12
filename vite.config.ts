import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  server: {
    // AC-1 要求「平板浏览器能访问开发服务器」。Vite 默认只监听 localhost，
    // 平板输入 http://<开发机IP>:5173 会直接连不上。
    host: true,
    // 放开 Host header 校验是自用局域网场景的合理选择（AC-1 要求平板能访问开发服务器）。
    //
    // ⚠️ 真实的理由不是「本项目无后端、无遥测」—— 暴露面是 Vite dev server 本身：
    // 它会提供 /src/** 源码、/@fs/ 下的文件、以及 HMR websocket，而 allowedHosts: true
    // 关掉的正是 Vite 为防 DNS rebinding 加的那道校验。所以这条配置的前提是
    // 「开发机不直接暴露在公网」而不是「应用没有后端」。
    //
    // 若将来开发机需要被公网访问、或引入任何需要防跨站请求的机制，此处必须收回。
    allowedHosts: true,
  },
})
