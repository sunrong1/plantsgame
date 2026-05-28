# PVZ English Learning Feature - Design Spec

## Context

Add English vocabulary learning to the existing PVZ game for a 6-year-old child. The game already has plant English names defined in UIScene.

## Goal

Enable vocabulary learning through **audio + visual reinforcement** when clicking game elements.

## Approach

Use **Web Speech API** (free, no audio files needed) with visual word display.

## Design

### 1. SpeechService
- Singleton service using Web Speech API (`speechSynthesis`)
- Speaks English words with slow, clear pronunciation
- Rate: 0.7 (slower than adult speech)
- Voice: en-US female
- Methods:
  - `speakWord(word)` - speaks a single word
  - `speakSentence(sentence)` - speaks a full sentence
  - `isSpeaking()` - returns whether currently speaking

### 2. Visual Word Display
- Appears center-screen when speaking
- Large English text (64px, bold, white with shadow)
- Word stays visible while speaking
- Fades out after speech completes

### 3. Learning Sentences (per element)

| Element | Sentence |
|---------|----------|
| Peashooter | "Peashooter! I planted a Peashooter to shoot peas at zombies!" |
| Sunflower | "Sunflower! Sunflowers make sunlight for us!" |
| Wall-nut | "Wall-nut! This is a tough nut that blocks zombies!" |
| Cherry Bomb | "Cherry Bomb! Watch it go BOOM!" |
| Zombie | "Zombie! Don't let the zombies eat my plants!" |
| Sunlight | "Sunlight! Collect it to plant more plants!" |
| Pea | "Pea! The Peashooter shoots peas!" |

### 4. Card Animation on Click
- Card scales up 1.1x for 200ms when clicked
- Returns to normal after
- Combined with speech

### 5. Implementation Location
- Create `src/systems/SpeechService.ts` - handles all speech
- Create `src/ui/components/SpeechOverlay.vue` - displays words
- Integrate into Vue App.vue
- Bridge click events from Vue to SpeechService

## Technical Notes

- Web Speech API requires user interaction before first speech (browser policy)
- Add a "Start Learning" button on tutorial that enables speech
- Phaser input already captures clicks, forward to Vue via bridge
- Alternatively: Vue components emit event → PlayScene calls SpeechService

## Files to Create/Modify

### New Files
- `src/systems/SpeechService.ts`
- `src/ui/components/SpeechOverlay.vue`

### Modified Files
- `src/ui/App.vue` - add SpeechOverlay
- `src/ui/bridge.ts` - add SPEECH event
- `src/scenes/PlayScene.ts` - listen for speech events

## Success Criteria

1. Clicking plant cards speaks the full learning sentence
2. English word appears large on screen during speech
3. Card shows scale animation
4. Works on desktop and tablet
5. No external audio files needed