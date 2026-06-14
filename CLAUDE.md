# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

PVZ Pixel — a Plants vs. Zombies-style tower defense game for a 6-year-old English learner. Vue 3 handles UI, Phaser 3 handles game canvas. Internal canvas is fixed at 720×1280 (`Phaser.Scale.FIT` in `src/main.ts`); CSS letterboxes for desktop and mobile.

## Commands

```bash
npm run dev          # Vite dev server, default http://localhost:5173
npm run dev -- --host 0.0.0.0  # Bind all interfaces — required for Android phone testing on the same WiFi
npm run build        # tsc + vite build (type-checks first, fails on TS errors)
npm test             # vitest run (one-shot)
npm run test:watch   # vitest watch mode
npm run test:e2e     # playwright
```

Node ≥ 18. No linter is configured.

## Architecture

```
Vue 3 (DOM)  ──CustomEvent──▶  Phaser 3 (Canvas)
   App.vue / components/         scenes/, systems/, entities/
        │                                │
        └── bridge.ts (event names) ────┘
```

Vue renders the resource bar, plant cards, speech overlay, tutorial, and game-over screen as DOM elements. Phaser renders the lawn, plants, zombies, and projectiles on a 720×1280 canvas. They communicate via `window.dispatchEvent` / `addEventListener` — see `src/ui/bridge.ts` for the full `GameEvents` enum.

State flow example (plant placement):
```
PlantCards.vue  ─PLANT_SELECTED──▶  PlayScene.selectPlant()
                                          ↓
                                    GridManager.occupyCell()
EconomyManager.spendSunlight()  ─SUNLIGHT_CHANGED──▶  App.vue.sunlight ref
```

## Key Files

- `src/main.ts` — Phaser config. The `scale.mode` line is load-bearing for mobile: changing `FIT` to anything else will break the grid math.
- `src/systems/SpeechService.ts` — Web Speech API. `preheat()` must be called inside a user-gesture event stack to unlock Android Chrome's audio session. `App.vue`'s `onStartGame()` calls it. `speak()` and `speakWord()` only call `cancel()` when `speechSynthesis.speaking === true` to avoid closing the freshly-unlocked session.
- `src/systems/GridManager.ts` — 5×9 grid math, anchored to 720×1280.
- `src/scenes/PlayScene.ts` — Main game loop. Dispatches `game:resize` and `game:grid-info` so Vue can position itself.
- `src/ui/App.vue` — Root Vue component, tracks canvas position, version label.
- `src/ui/bridge.ts` — `GameEvents` constants and dispatch helpers.

## Mobile Testing

Visual scaling can be verified in Chrome DevTools device mode, but **audio must be tested on a real Android device**. Workflow:
1. `npm run dev -- --host 0.0.0.0`
2. Note the printed `Network: http://10.0.0.X:5173/`
3. Open that URL in Android Chrome on the same WiFi
4. Tap "开始" (this triggers `speechService.preheat()`)
5. Tap any plant card — should hear the English word

## Conventions

- Version is bumped in `src/ui/App.vue` (`<div class="version-label">`) on every commit. Format: `vMAJOR.MINOR.PATCH` starting at `v5.x` (the project has been on `5.x` for a while; the package.json `version` is `1.0.0` and is unrelated).
- Test files live next to source: `src/config/plants.test.ts`, `src/entities/Zombie.test.ts`, etc. Tests use Vitest, run in ~700ms.
- Config is data-driven — game balance lives in `src/config/` (plants, zombies, waves), not hardcoded in entities.
- Commit message prefix follows Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`).

## Things To Not Break

- `Phaser.Scale.ScaleModes.FIT` — switching to `RESIZE` makes `scene.scale.width` track viewport and breaks `GridManager.offsetX` on narrow phones.
- The preheat → speak sequence in `App.vue` — removing the `preheat()` call makes Android audio silently fail.
- The `if (speechSynthesis.speaking) { cancel(); }` guard — unconditional `cancel()` cancels the freshly-preheated session.
