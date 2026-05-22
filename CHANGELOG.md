# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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