/**
 * Vite 的 `?raw` 导入的类型声明。
 *
 * ⚠️ **为什么需要它**：组件测试在 **jsdom** 环境里跑，而 jsdom 下
 *   `import.meta.url` 是一个 `http://` URL —— `fileURLToPath()` 会抛
 *   `TypeError: The URL must be of scheme file`。守卫 G14 / G19 需要读组件
 *   **源码**（`BattleField.vue` 的 CSS、`Zombie.vue` 的 script），
 *   而 `tests/` 的其它文件（`asset-geometry.test.ts` 等）都跑在 `node` 环境，
 *   可以直接 `readFileSync(new URL('../../', import.meta.url))`。
 *
 *   两个选择：
 *     ① 用 `process.cwd()` 拼路径 —— 简单，但把测试绑在「启动目录」上。
 *        `validate-content.ts:63` 逐字写着「相对本文件解析，**不依赖 cwd**」，
 *        本仓库对这个有明确立场。
 *     ② 用 Vite 的 `?raw` —— 由**模块自身的位置**决定，与 cwd、与环境都无关。
 *
 *   ⇒ 选 ②。它也让「读哪个文件」这件事在 import 语句上就一目了然，
 *     而不是一个运行时才拼出来的字符串路径。
 *
 * 正式的类型来自 `vite/client`（`/// <reference types="vite/client" />`），
 * 但本项目 `tsconfig.test.json` 的 `types` 只有 `["node"]`，且
 * `tsconfig.app.json` 是 `types: []` —— 都不含 vite/client。
 * ⇒ 在这里声明一个最小的那一份，只覆盖 `?raw`。
 */
declare module '*?raw' {
  const content: string
  export default content
}
