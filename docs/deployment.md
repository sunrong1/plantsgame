# 部署手册（Story 1.18 / AC-F2）

> 本文是**照着做**的清单，不是概述。每一条都能直接落到配置项上。
> ⚠️ **托管侧的三项（TLS、缓存头、SPA fallback）自动化证明不了** ——
> 本文的「上线后自检」一节是那些项的**人工验收步骤**，不是「已验证」的结论。
> 判据只来自 `dist/` 的字面内容时才有自动化；托管配置在托管商那边。

## 0. 一句话口径

| 项 | 值 | 唯一出处 |
|---|---|---|
| 应用路径 | `https://sunrong.site/plantsgame/` | `vite.config.ts` 的 `DEPLOY_BASE` |
| 构建 | `npm run build`（自带 `prebuild` 内容校验 + `postbuild` 产物自检） | `package.json` |
| 部署内容 | **`dist/` 整个目录**，不是仓库根 | — |
| 托管方式 | **HTTPS 静态托管**（GitHub Pages / Cloudflare Pages / 自有 Nginx 均可） | 架构决策 8 |

⚠️ **「本 story 不做真实上线」**（裁决 3）：仓库里**零** `netlify.toml` /
`vercel.json` / `.github/` / `CNAME`。本文是清单，落地由部署时决定。
若你选了某一家托管商，把它的配置文件提交进来并在下文加一节「本仓库实际配置」。

---

## 1. 构建

```bash
npm ci
npm run build
```

`build` 串了三步，**任何一步红就不要部署**：

1. `prebuild` → `validate:content`：内容层校验（JSON schema、词图双向存在性等）。
2. `build` → `vue-tsc -b --force && vite build`：类型检查 + 打包。
3. `postbuild` → `verify:deploy`：产物自检 **64 项**（⚠️ **这个数会随单元数增长** ——
   每个单元一项词图检查，见下）。

### 实测产物形态（2026-10-28，Story 2.10 `[CR]` 第二轮重测；2026-10-25 Story 3.5 `[CR]` 重测；2026-10-23 Story 2.5 首测）

```
dist/  1.5 MB  53 个文件
dist/index.html                        3.36 kB │ gzip:   2.03 kB
dist/assets/index-Y1aA7XZj.js        223.09 kB │ gzip:  73.88 kB
dist/assets/index-BzGOuu5Z.css        15.07 kB │ gzip:   3.62 kB
dist/manifest.webmanifest               0.74 kB
dist/sw.js                              1.79 kB │ gzip:   0.89 kB
```

⚠️📎 **`[CR]` 2026-10-28（Story 2.10 第二轮）整块重测** —— 上一版的
`3.3 MB / 165 个文件` 是**换源前**的数：Story 2.10 把**录音 75 → 17 条**、
**词图 60 → 6 张** ⇒ `dist/` 少了 **112 个文件**（58 + 54），
实测现在是 **53 个文件 / 1.5 MB**（`find dist -type f | wc -l` / `du -sh dist`）。
⚠️ **本文件不在 Story 2.10 的 §9 文档更正清单里** —— 那是清单漏了它，
不是它不用改（清单漏项已补进 story 文档的 Review Findings）。
⚠️ 其余几行一并更新（JS / CSS 的内容哈希变了：
旧 `index-BeOGBe7j.js` → 新 `index-Y1aA7XZj.js`，旧 `index-CrQA-fqh.css` → 新 `index-BzGOuu5Z.css`）。
⚠️ **gzip 口径**：本表的 gzip 列是 **`node -e` 的 `zlib.gzipSync`（默认 level 6）**，
不是 `gzip -c`（后者对同样的文件会小几十字节）⇒ 两套数不可混用。
⚠️ 「165 个文件」在 2026-10-23 那次是**不含** `public/_voices-probe.html` 的数
（那个本地调试探针被 Vite **原样复制**进了 `dist/`）⇒ **2026-10-25 探针页移出 `public/` 之后，
这个数才第一次名副其实**（当时的 `dist/` 里真的就是 165 个文件；⚠️ **那个数自 2026-10-28 起已作废**）。
⚠️📎 **`[CR]` 2026-10-25（Story 3.5）查出的根因** —— 那个本地调试页**不只是**多了一个文件：
`vite-plugin-pwa` 的 `globPatterns: ['**/*.{html,js,css}']` 会把 `dist/` 里**任何 `.html`**
扫进 precache 清单 ⇒ **一个本地调试页跟着上线**（`sw.js` 因此 **+75 B**：
1912 B → 1837 B，precache 清单从 5 条回到 4 条）。
⇒ **修法**：探针页**移出 `public/`**，改放 `tools/local-probes/`（`.gitignore` 忽略，
要用时**手动拷进 `dist/`** 打开）⇒ 它**再也不进部署产物**。
⚠️ **这条是「一个本地文件混进部署产物」的实例** —— 症状只有 **75 字节**，
**不查 `dist/` 的文件清单与 precache 清单就发现不了**。
⚠️ **教训**：`sw.js` 的字节数**不是稳定值** —— 它是**手工维护**的（清单 + token），
改动会变 ⇒ 引用它时必须写「**某一天实测**」并带上日期，否则就是一条会漂的记录。

⚠️ **`sw.js` 每次构建的字节数几乎不变**（内容里只有清单与 token 变），
   所以**内容哈希在它身上没有诊断价值** —— 托管侧必须靠缓存头而不是文件名。

precache 清单恰好 4 条（实测逐字）：

```
index.html
assets/index-<hash>.js
assets/index-<hash>.css
manifest.webmanifest
```

⚠️ **媒体（83 个 mp3 + 64 张 svg）不在 precache 里** —— 这是有意的（AC-B7 /
架构决策 6：「全量预载 400 张必超冷启动 3s」）。它们走 `sw.ts` 的运行时
`CacheFirst`，由 `src/services/asset-prefetch.ts` 在进关时预热。

### 词图检查是**逐单元**的（`[DS]` Story 2.5 / Task 7.4）

`scripts/verify-deploy.ts` 的词图判据原先逐字是
`fs.listDir('assets/words/unit-01')` —— **只查单元 1 一个目录** ⇒
**单元 2 的词图整批缺失时，构建成功、产物自检也全绿**，
而孩子的症状是「进了单元 2，每张单词卡都是空白」。

⇒ 现在**每个单元一项**（`word-images-unit-01-present` / `word-images-unit-02-present` …），
外加一条总的 `word-images-present`。
**单元清单从产物自身推导**（录音文件名前缀 `u<N>-*.mp3` ∪ 现存的 `unit-NN` 目录名），
**不硬编码「有 N 个单元」** ⇒ 加单元不用改脚本，改了也不会静默过期。
⇒ 实测：加单元 2 之后自检从 **62 项**变成 **64 项**（一项一个单元 + 一条总的）。

---

## 2. `base` 前缀（子路径部署）

应用挂在 `/plantsgame/` 下，不是站点根。**四处路径都由 `vite.config.ts` 的
`DEPLOY_BASE` 一个常量派生**，改部署路径只改那一处：

| 出处 | 派生出来的值 |
|---|---|
| `base` | `/plantsgame/` |
| manifest `start_url` / `scope` / `id` | `/plantsgame/` |
| manifest 4 个 icon 的 `src` | `/plantsgame/icons/…` |
| JS / CSS / 录音 / 词图 URL | `/plantsgame/assets/…` |

⚠️ **改 `DEPLOY_BASE` 时必须同步 `vitest.config.ts` 的 `test.env.BASE_URL`**，
否则 `tests/scaffold/deployment-base.test.ts` 会红（它断言两处一致），
而更糟的情况是**守卫红了你去改守卫**，于是测试恒绿。

⚠️ **`index.html` 里刻意没有 `<link rel="manifest">`** —— 由 `vite-plugin-pwa`
注入。实测手写一条会得到**两条** manifest link，手写那条 Vite 不重写（404）
且排在前面，manifest 整个失效。

### 站点根必须能回落到本应用

托管商的自定义域名如果站点根 `/` 上还有别的东西，`/plantsgame/` 必须是子目录，
不能是 SPA 通配覆盖整个站点。

---

## 3. 缓存头（🔥 最关键的一节）

**规则一句话：`/plantsgame/sw.js` 与 `/plantsgame/manifest.webmanifest` 绝不长期缓存；
带内容哈希的 `/plantsgame/assets/*.js|css` 永久缓存；其余不缓存或短缓存。**

### 3.1 `sw.js` —— 必须 `no-cache`

```nginx
location = /plantsgame/sw.js {
    add_header Cache-Control "no-cache, no-store, must-revalidate" always;
    add_header Service-Worker-Allowed "/plantsgame/" always;
    types { } default_type application/javascript;
}
```

⚠️ **为什么它必须单独一条**：`sw.js` 的文件名是**固定的**（不带内容哈希），
浏览器对它的默认启发式就是缓存 24 小时。缓存住它 ⇒ 孩子可能在**几个月后**才拿到
一次修复 —— 而表现是「我明明改了，怎么还是老样子」。

⚠️ **`Service-Worker-Allowed` 这一行不是可选的**：SW 的作用域默认只能覆盖
`sw.js` 所在的**最深目录**。本应用的脚本在 `/plantsgame/sw.js`，作用域已经是
`/plantsgame/`，所以这一行目前是冗余的 —— 但**如果你把 `sw.js` 挪到站点根**，
漏掉它就是 `SecurityError`，而浏览器**只打一条 console.warn**，页面照常运行、
离线完全失效。留着它比事后归因便宜。

### 3.2 `manifest.webmanifest` —— 必须 `no-cache`

```nginx
location = /plantsgame/manifest.webmanifest {
    add_header Cache-Control "no-cache, must-revalidate" always;
    default_type application/manifest+json;
}
```

⚠️ 它同样不带哈希。缓存住它 ⇒ 改了图标 / 名称 / `theme_color` 之后，
「添加到主屏」拿到的还是旧的。

### 3.3 带哈希的构建产物 —— 永久缓存

```nginx
location ^~ /plantsgame/assets/ {
    add_header Cache-Control "public, max-age=31536000, immutable" always;
}
```

⚠️ **`immutable` 只配在这一段**：JS/CSS 的文件名里有内容哈希
（`index-CCa7u-h3.js`），变了就是新文件；而**同一段里的 mp3 / svg 不带哈希**
（`u1-dog.mp3` 按词条 id 命名，永远稳定）—— 若它们也吃上一年期缓存，
Story 2.x 每换一批录音，孩子听到的就永远是旧的。

⇒ **媒体必须单独一段**：

```nginx
location ^~ /plantsgame/assets/audio/ { add_header Cache-Control "public, max-age=0, must-revalidate" always; }
location ^~ /plantsgame/assets/words/ { add_header Cache-Control "public, max-age=0, must-revalidate" always; }
location ^~ /plantsgame/assets/towers/ { add_header Cache-Control "public, max-age=0, must-revalidate" always; }
location ^~ /plantsgame/assets/zombies/ { add_header Cache-Control "public, max-age=0, must-revalidate" always; }
```

⚠️ **`must-revalidate` 也不是多余的**：它的作用是让「重新校验」在**离线时失败**
而不是拿一份陈旧缓存糊弄过去。媒体走 SW 的 `CacheFirst`，HTTP 头只在**首次**
抓取时起作用。

### 3.4 换代的真正机制（别指望缓存头）

即便媒体全部 `must-revalidate`，浏览器 HTTP 缓存也不保证在离线时重新校验。
**换代由 SW 自己负责**（AC-C5）：`vite.config.ts` 的 `assetToken()` 对
`public/assets/**` 全量算 sha256 前 12 位 ⇒ `sw/sw-rules.ts` 拼出
`plantsgame-precache-<token>` / `plantsgame-runtime-<token>` ⇒
`activate` 时 `staleCacheNames()` 把**所有**带 `plantsgame-` 前缀的旧缓存删掉。

⚠️ 这条机制的前提是**托管侧不缓存 `sw.js`**（§3.1）。两者是配套的：
缓存头负责「新 SW 什么时候被拉到」，SW 自己负责「拉到之后清掉什么」。

### 3.5 Cloudflare Pages / Netlify 对照

| 托管商 | 写法 |
|---|---|
| Cloudflare Pages | `_headers` 文件（放 `public/_headers`，构建会原样拷进 `dist/`） |
| Netlify | `_headers` 或 `netlify.toml` 的 `[[headers]]` |
| GitHub Pages | **没有自定义缓存头的官方能力**，只有全局 10 分钟 ⇒ ⚠️ 见下 |

⚠️ **GitHub Pages 不支持自定义缓存头**。它能用，但：
`sw.js` 最多 10 分钟才更新一次（可接受），而媒体与带哈希的 JS/CSS **拿不到
`immutable`**（可接受，只是多几次 304）。**如果选 GitHub Pages，请在部署后
确认 SW 版本换代是「最多 10 分钟内生效」而不是「立刻」**，并把它记进下文的自检清单。

---

## 4. SPA fallback

本应用是单入口 SPA，路由由前端状态驱动，**不需要** history fallback 之外的任何改写规则。

⚠️ **但要确认托管商配置了 fallback**，否则「刷新页面」在某些托管商上 404：

```nginx
location /plantsgame/ {
    try_files $uri $uri/ /plantsgame/index.html;
}
```

⚠️ **fallback 只对「目录型」导航有效**。从主屏图标启动（`start_url = /plantsgame/`）
命中的是真实目录，通常没问题；但如果你给 `/plantsgame/` 配了自定义 404 页面，
**那个页面会盖掉 fallback** ⇒ 从主屏启动点进一个空白页。

⚠️ **fallback 不要吞掉真实资源**：`try_files` 放在 `/plantsgame/` 这一层，
而 §3.1 的 `location =` 精确匹配优先级高于它，所以 `sw.js` 不会落到
`index.html` 上（那会让 SW 注册拿回一份 HTML，`install` 时报 MIME 错）。

---

## 5. 图标路径

`public/icons/` 下 6 个文件，构建时原样拷到 `dist/icons/`：

| 文件 | 用途 | manifest `purpose` |
|---|---|---|
| `icon-192.png` | 浏览器标签页 / Android 主屏 | `any` |
| `icon-512.png` | 同上（高分屏） | `any` |
| `maskable-192.png` | Android 自适应图标（会被裁成圆形） | `maskable` |
| `maskable-512.png` | 同上 | `maskable` |
| `icon.svg` | 矢量（非 manifest 引用，`favicon.svg` 另有一份） | — |
| `maskable.svg` | 矢量备用 | — |

⚠️ **`favicon.svg` 在 `public/` 根**（不在 `icons/`），`index.html` 用
**不带前缀**的 `/favicon.svg` 引用 —— Vite 按 `base` 重写它（实测已验证）。
手写 `/plantsgame/favicon.svg` 等于把 `base` 复制一份，改前缀时会漏。

⚠️ **iOS 不读 manifest 的 `icons`**，它读 `apple-touch-icon` —— 已写在
`index.html` 里，指向 `/icons/icon-192.png`（同样由 Vite 重写）。

⚠️ **替换图标时改 `public/icons/` 里的文件，不要改 manifest 里的路径** ——
路径由 `vite.config.ts` 的 `icon()` 从 `DEPLOY_BASE` 派生，
`tests/scaffold/pwa-manifest.test.ts`（G121）钉住四组路径同源。

---

## 6. 上线后自检（人工，⚠️ 不是「已验证」）

以下每一条**自动化都证明不了**（托管配置在托管商那边）。逐条做、逐条记结果。

### 6.1 传输与路径

- [ ] `curl -I https://sunrong.site/plantsgame/` ⇒ `200`，`content-type: text/html`
- [ ] `curl -I https://sunrong.site/plantsgame/sw.js` ⇒ `200`，`content-type: application/javascript`
      （⚠️ 拿到 `text/html` 就是 fallback 把它吞了 ⇒ SW 注册会报 MIME 错）
- [ ] `curl -I https://sunrong.site/plantsgame/manifest.webmanifest` ⇒ `200`，
      `content-type: application/manifest+json`
- [ ] `curl -s https://sunrong.site/plantsgame/ | grep -c '"/plantsgame/assets/'` ⇒ **≥ 2**
      （0 ⇒ JS/CSS 引用丢了前缀，页面会白屏）
- [ ] `curl -s https://sunrong.site/plantsgame/ | grep -c 'rel="manifest"'` ⇒ **恰好 1**
      （2 ⇒ 撞上 §2 那个「手写 manifest link」的坑）

### 6.2 缓存头

- [ ] `curl -I .../sw.js | grep -i cache-control` ⇒ 含 `no-cache` 或 `no-store`
- [ ] `curl -I .../manifest.webmanifest | grep -i cache-control` ⇒ 含 `no-cache`
- [ ] `curl -I .../assets/index-<hash>.js | grep -i cache-control` ⇒ 含 `immutable`
      （选 GitHub Pages 时：这一条记为「不适用」，并在文档里说明）
- [ ] `curl -I .../assets/audio/voice/<任一>.mp3 | grep -i cache-control`
      ⇒ **不得**含 `immutable` 或长 `max-age`

### 6.3 浏览器侧（真机平板）

- [ ] DevTools → Application → Service Workers：`sw.js` **activated**，无 error
- [ ] DevTools → Application → Cache Storage ⇒ 出现
      `plantsgame-precache-<token>`（12 位十六进制）
- [ ] 断网后刷新：`https://sunrong.site/plantsgame/` 仍能打开并进关
      ⚠️ **这是「离线可用」的唯一真实验收**。1.11 逐字禁令：
      **DevTools 的 Offline 开关的结果不得被说成「离线验证已通过」** ——
      它模拟的是网络层，不模拟 CacheStorage 已装好的前提。要验就**拔 Wi-Fi / 开飞行模式**。
- [ ] 飞行模式下进单元 1，逐题翻：每道题的正确项图**都在**（AC-E4 的验收）
- [ ] 关闭飞行模式 → 点「有新版本」提示（若已部署过至少两个版本）⇒
      页面**不刷新**；杀掉应用重开才是新版本（AC-C2 的验收）

### 6.4 缓存换代（AC-C5）

- [ ] 记下当前 `plantsgame-runtime-<token>` 的 token
- [ ] 替换 `public/assets/` 里**任意一个** mp3 或 svg（哪怕改 1 字节），
      重新 `npm run build` 并部署
- [ ] 真机重开应用（必要时先让旧 SW 装过一次）⇒ Cache Storage 里
      **旧 token 的缓存消失**，只剩新 token
- [ ] ⚠️ 记录换代生效的延迟（GitHub Pages 是「最多 10 分钟」）

---

## 7. 排障对照表

| 症状 | 最可能的原因 | 怎么确认 |
|---|---|---|
| 打开就是白屏 | `base` 与托管路径不符，JS/CSS 404 | DevTools Network 看 `index-*.js` 是否 404；`curl` §6.1 第 4 条 |
| 控制台 `SecurityError` 注册 SW | SW 脚本在站点根而作用域被限定 | 加 `Service-Worker-Allowed` 头（§3.1） |
| 控制台 MIME 错（SW） | `sw.js` 被 fallback 吞成 HTML | `curl -I` 看 content-type（§6.1 第 2 条） |
| 每个录音 404 | 录音 URL 没带 base 前缀 | `src/services/pronunciation.ts` 的 `RECORDING_BASE_PATH` |
| 离线打不开 | SW 没装上 / precache 没装完 | Cache Storage 里有没有 `plantsgame-precache-*` |
| 改了录音但孩子听的是旧的 | 媒体被长缓存 **或** SW 没换代 | §6.4 全流程；`curl -I` 看媒体缓存头 |
| 改了代码但孩子跑的是旧的 | `sw.js` 被长缓存 | `curl -I .../sw.js` 看 `Cache-Control` |
| 装到主屏后打开是空白页 | 自定义 404 页面盖掉了 SPA fallback | 去掉该 404 规则（§4） |
| 玩着玩着页面被刷新 | SW 里出现了 `skipWaiting()` / `clients.claim()` | `grep -E 'skipWaiting|clients\.claim' dist/sw.js` 应为空 |

---

## 8. 相关文件

| 文件 | 职责 |
|---|---|
| `vite.config.ts` | `DEPLOY_BASE`、`assetToken()`、`pwaManifest`、`pwaOptions` 四个导出 |
| `sw/sw.ts` | SW 入口：install / activate / fetch 三段 |
| `sw/sw-rules.ts` | 纯规则：缓存名、旧缓存识别、媒体判定 |
| `src/services/sw-registration.ts` | 注册 SW、检查安全上下文、`prompt` 语义 |
| `src/services/asset-prefetch.ts` | 进关时预热本单元图片 |
| `scripts/verify-deploy.ts` | 上线前产物自检（**64 项**，⚠️ 随单元数增长），`postbuild` 自动跑 |
| `scripts/verify-portrait-layout.ts` | 竖屏布局的**真浏览器**量测（`npm run verify:portrait`，**不**在 `test` / `postbuild` 里）；📎 判据仍**只判 800×1280**，另按 `scripts/measure-viewports.txt`（竖屏 7 + 横屏 7）**逐视口量一遍并打成一张表**（矩阵里的视口**只量不判**）；📎 **2026-10-24**：脚本现在**补偿浏览器外壳**（`--window-size` 含工具栏 ⇒ 量到的内视口比请求值矮 87px）⇒ 表里「请求视口」与「内视口」**逐行相等**才算量到了设备真实尺寸；守卫见 `tests/scripts/verify-portrait-layout.test.ts`（G290–G292；📎 Story 3.5 `[CR]` 新增 **G318** —— 三条新判据的纯函数） |
| `tests/scaffold/pwa-manifest.test.ts` | G120/G121/G122：manifest 与 token 同源 |
| `tests/scaffold/pwa-sw-guard.test.ts` | G123（零强制刷新）、G124、G125/G126（SW 源码级边界）、**G127（注册调用点）**、G128/G129、**G159（`activate` 真的调 `staleCacheNames`）**、📎 Story 3.5 `[CR]` 新增 **G320**（`public/` 下不许有 `.html` —— 本地调试页不许跟着上线并被 PWA 扫进 precache） |
| `tests/scaffold/pwa-offline-shell.test.ts` | G195/G196/G197：app shell 真的进了 precache |
| `tests/scaffold/verify-deploy.test.ts` | G155/G156/G157、**G199**、**G283**（逐单元词图检查）：产物级判据的变异夹具与反向自测 |
| `tests/services/sw-registration.test.ts` | G130/G131、**G202**：`preparing` 状态机的三条退路 |
| `tests/scaffold/deployment-base.test.ts` | `base` 与 `vitest.config.ts` 一致 |
