import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  // 应用挂在子路径 https://sunrong.site/plantsgame/ 下（Story 1.3 / AC-11）。
  //
  // ⚠️ 这不是可选的装饰。base 缺省 '/' 时有两处同源失效：
  //   ① `src/services/pronunciation.ts` 的 RECORDING_BASE_PATH 拼出的录音 URL
  //      指向 /assets/audio/voice/*，而真实路径在 /plantsgame/ 下
  //      ⇒ 每个录音必然 404，「预生成录音主通路」静默降级成设备 TTS，
  //        表现只是「音色偶尔不对」，极难归因；
  //   ② 构建产物的 JS/CSS 引用同样解析不到 ⇒ 部署后整页白屏。
  //
  // 自定义域名根路径部署时，把这里改成 '/'，并同步 vitest.config.ts 的 base
  // （tests/scaffold/deployment-base.test.ts 会断言两处一致 —— 不一致则守卫假绿）。
  base: '/plantsgame/',
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
