# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [5.30.5] - 2026-06-03

### Fixed
- **Android audio playback**: Added `speechService.preheat()` that creates a silent utterance inside the user-gesture stack (Tutorial "Start" button click) to unlock Android Chrome's audio session. Without this, subsequent `speechSynthesis.speak()` calls silently failed.
- **Speech utterance errors**: Added `onerror` handlers to all `SpeechSynthesisUtterance` instances so failures surface as `console.warn` instead of being silently swallowed.
- **Avoid cancelling idle audio session**: `cancel()` is now only called when `speechSynthesis.speaking === true`, preventing accidental cancellation of the freshly-unlocked session.

## [5.30.4] - 2026-06-03

### Fixed
- **Mobile map cutoff**: Changed `Phaser.Scale.ScaleModes.RESIZE` → `FIT` in `src/main.ts`. RESIZE mode made `scene.scale.width/height` track the viewport, causing `GridManager` to compute negative `offsetX` on narrow phone screens (e.g. 390px wide) and clipping the left half of the grid. FIT mode keeps the 720×1280 internal coordinate system intact, with CSS letterbox scaling handled by Phaser.

## [5.30.3] - 2026-06-03

### Changed
- **Merged resource bar into PlantCards**: The standalone `TopBar.vue` (sunlight + wave display) is now embedded in `PlantCards.vue` for a more compact header.
- **Improved sunlight touch target**: Increased the sunlight pickable container to 60×60px and added a scale-up tween on hover/touch for clearer visual feedback on mobile.

## [5.30.0] - 2026-06-01

### Changed
- **Redesigned page layout**: Plant cards row moved above the grid; speech overlay moved below the grid. Previously the speech bubble overlapped the lawn.
- **Added grid-info event**: PlayScene now dispatches `game:grid-info` so the Vue resource bar can position itself relative to the actual grid origin.

## [5.29.1] - 2026-05-30

### Fixed
- **Mobile voice loading**: Listen to `voiceschanged` event so that mobile browsers' lazily-loaded voices are picked up.
- **Speech bubble position**: Moved the floating word overlay lower so it no longer covers the playable grid.

## [5.28.9] - 2026-05-28

### Fixed
- **Plant click silence**: Restored speech playback on plant card click (had regressed during layout refactor).
- **Affordability check**: Plant selection now requires sufficient sunlight; the placement shadow is suppressed when the player cannot afford the plant.

## [5.28.3] - 2026-05-28

### Changed
- Replaced zombie sprites with cute cartoon versions, appropriate for the 6-year-old target audience.

## [5.27.1] - 2026-05-27

### Added
- **Vue 3 + Phaser 3 hybrid architecture**: UI layer migrated to Vue, game engine remains Phaser. They communicate via `CustomEvent` on `window`.
- **Vue components**: `TopBar`, `PlantCards`, `SpeechOverlay`, `Tutorial`, `GameOverlay`.
- **English learning**: `SpeechService` with `LEARNING_DATA` mapping plant types to English words and example sentences.
- **DEVELOPMENT.md**: New architecture guide in `docs/`.

## [1.0.0] - 2026-05-22

### Added

#### Core Game Features
- **5×9 lawn grid system** - Strategic plant placement on a 5-row, 9-column grid
- **3 plant types**:
  - Peashooter (cost: 100) - Fires peas every 1.5s, 20 damage each
  - Sunflower (cost: 50) - Produces 15-35 sunlight every 5s
  - Wall-nut (cost: 50) - 400 HP, blocks zombie movement
- **2 zombie types**:
  - Normal Zombie - 100 HP, 1 tile per 1.5s movement
  - Flag Zombie - 200 HP, marks wave 3 start
- **3-wave system** with progressive difficulty:
  - Wave 1: 3 zombies at 20s, 4s interval
  - Wave 2: 5 zombies at 38s, 3s interval
  - Wave 3: 7 zombies (1 flag + 6 normal) at 53s, 2s interval

#### Game Systems
- Sunlight economy with sky drops (25 every 10s) and sunflower production
- Sunlight collection with 8-second expiration
- Plant selection and placement preview
- Zombie AI with pathfinding and plant targeting
- Victory/defeat conditions with restart capability

#### Technical Implementation
- **Phaser 3.60+** game engine with Canvas rendering
- **TypeScript 5.3** with full type definitions
- **Vite 5.0** for fast development and production builds
- **Layered architecture**:
  - `config/` - Data-driven configuration (plants, zombies, waves)
  - `entities/` - Plant, Zombie, Projectile classes
  - `systems/` - GridManager, WaveManager, EconomyManager
  - `scenes/` - BootScene, PlayScene, UIScene
- Procedural placeholder textures for rapid prototyping

#### Documentation
- Game Design Document (GDD) with complete specs
- Implementation plan with 14 tasks
- README with setup instructions and game guide

### Technical
- TypeScript compilation with strict mode
- Production build (~1.5MB, ~345KB gzipped)