/// <reference types="vite/client" />
/**
 * 部署 base 路径的守卫测试（Story 1.3 / AC-11）。
 *
 * 要守的 bug：`vite.config.ts` 未设 `base`（默认 `/`），而应用挂在
 * `https://sunrong.site/plantsgame/` 下。后果有两条同源：
 *
 * ① `RECORDING_BASE_PATH` 硬编码 `'/assets/audio/voice/'` ⇒ 部署后请求
 *    `/assets/audio/voice/u1-dog.mp3`，真实路径是 `/plantsgame/assets/...`
 *    ⇒ **每个录音必然 404**，整条「预生成录音主通路」静默降级成设备 TTS。
 * ② JS/CSS 同样解析不到 ⇒ 新项目一旦部署很可能是**整页白屏**。
 *
 * ①在测试里几乎测不到：Vitest 的 BASE_URL 默认是 `/`，硬编码的
 * `'/assets/audio/voice/'` 恰好与它相等 —— 断言会**假绿**。
 * 因此 `vitest.config.ts` 把 `base` 也设成 `/plantsgame/`，
 * 让「硬编码根路径」这个回归当场变红。构建产物那一半由 `npm run build`
 * 后人工核对 `dist/index.html`（Dev Notes 已记，属一次性验收）。
 */
import { describe, expect, it } from 'vitest'

import viteConfig from '../../vite.config'
import { RECORDING_BASE_PATH } from '../../src/services/pronunciation'

const DEPLOY_BASE = '/plantsgame/'

describe('部署 base 路径（AC-11）', () => {
  it('vite.config 显式声明 base', () => {
    expect(
      viteConfig.base,
      'base 缺省 "/" 时，构建产物的 JS/CSS 在 /plantsgame/ 下解析不到 —— 部署后很可能是整页白屏',
    ).toBe(DEPLOY_BASE)
  })

  it('测试环境的 BASE_URL 与部署 base 一致（否则下面几条断言会假绿）', () => {
    expect(
      import.meta.env.BASE_URL,
      'Vitest 的 BASE_URL 与 vite.config 的 base 不一致 —— base 回归守卫会变成一条永远通过的断言',
    ).toBe(DEPLOY_BASE)
  })

  it('录音路径接 BASE_URL，而不是硬编码根路径', () => {
    // 这是 ① 的正面断言。BASE_URL 已是 /plantsgame/，硬编码 '/assets/...' 必然对不上。
    expect(
      RECORDING_BASE_PATH,
      '录音路径没有跟随 base —— 部署到 /plantsgame/ 后每个录音都会 404，然后静默降级成设备 TTS',
    ).toBe(`${DEPLOY_BASE}assets/audio/voice/`)
  })

  it('base 自带尾斜杠，拼接后不出现双斜杠', () => {
    const url = `${RECORDING_BASE_PATH}u1-dog.mp3`
    expect(url).toBe('/plantsgame/assets/audio/voice/u1-dog.mp3')
    expect(url, '双斜杠在部分静态托管上会 404 —— BASE_URL 本身已带尾斜杠，不要再拼一个').not.toContain(
      '//',
    )
  })

  it('录音路径仍不按单元分层（与词图共用同一个 id）', () => {
    expect(RECORDING_BASE_PATH).not.toMatch(/unit-0?1\//)
  })
})
