---
module: app-main
path: src/main.ts
deps:
  - "[[app-root]]"
  - "[[services-sw-registration]]"
status: draft
last_sync: "2026-10-23T18:40:00+08:00"
hash: "94991c5d"
source: header-comment
---

# 应用入口

**职责**：createApp(App).mount('#app')，挂载后注册 SW。

**核心 API**：
```
main
```

**设计约束**：
SW 注册必须在 mount() 之后且不 await —— 注册是一次网络往返 + 一次脚本下载，挂在挂载前就是一次冷启动停顿。

**已知坑点**：
本函数永不抛错（裁决 7）：SW 注册失败归运行时层，记 [sw] WARN 后静默继续。与 AC-C3 的三步音频解锁路径无关，本文件不碰它。
