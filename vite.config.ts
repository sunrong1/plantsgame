import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  server: {
    // AC-1 要求「平板浏览器能访问开发服务器」。Vite 默认只监听 localhost，
    // 平板输入 http://<开发机IP>:5173 会直接连不上。
    host: true,
    // 自用局域网场景放开 host header 校验，避免出现 blocked request 页面。
    // 本项目无后端、无遥测（NFR14 / OUT-OF-SCOPE-9），无跨站请求面。
    // 若将来引入任何需要防跨站请求的机制，此处必须收回。
    allowedHosts: true,
  },
})