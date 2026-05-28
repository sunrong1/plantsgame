# PVZ English Learning Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable English vocabulary learning via click-to-speak with visual word display and card animations.

**Architecture:** Web Speech API singleton service + Vue overlay component for word display + event-driven integration with existing plant card clicks.

**Tech Stack:** Vue 3, TypeScript, Web Speech API, Phaser 3 (for card animations via bridge)

---

## File Structure

### New Files
- `src/systems/SpeechService.ts` - Web Speech API wrapper
- `src/ui/components/SpeechOverlay.vue` - Large word display overlay

### Modified Files
- `src/ui/bridge.ts` - Add SPEECH_LEARN event
- `src/ui/App.vue` - Add SpeechOverlay component
- `src/ui/components/PlantCards.vue` - Add click handler + animation
- `src/ui/styles/variables.css` - Add speech overlay z-index

---

## Task 1: Create SpeechService

**Files:**
- Create: `src/systems/SpeechService.ts`

- [ ] **Step 1: Write SpeechService class**

```typescript
// src/systems/SpeechService.ts

type LearningContent = {
  word: string;
  sentence: string;
};

const LEARNING_DATA: Record<string, LearningContent> = {
  peashooter: {
    word: 'Peashooter',
    sentence: 'Peashooter! I planted a Peashooter to shoot peas at zombies!',
  },
  sunflower: {
    word: 'Sunflower',
    sentence: 'Sunflower! Sunflowers make sunlight for us!',
  },
  wallnut: {
    word: 'Wall-nut',
    sentence: 'Wall-nut! This is a tough nut that blocks zombies!',
  },
  cherrybomb: {
    word: 'Cherry Bomb',
    sentence: 'Cherry Bomb! Watch it go BOOM!',
  },
  zombie: {
    word: 'Zombie',
    sentence: 'Zombie! Do not let the zombies eat my plants!',
  },
  sunlight: {
    word: 'Sunlight',
    sentence: 'Sunlight! Collect it to plant more plants!',
  },
  pea: {
    word: 'Pea',
    sentence: 'Pea! The Peashooter shoots peas!',
  },
};

class SpeechService {
  private static instance: SpeechService;
  private isEnabled: boolean = false;

  static getInstance(): SpeechService {
    if (!SpeechService.instance) {
      SpeechService.instance = new SpeechService();
    }
    return SpeechService.instance;
  }

  enable(): void {
    this.isEnabled = true;
  }

  isSpeaking(): boolean {
    return 'speechSynthesis' in window && window.speechSynthesis.speaking;
  }

  speak(content: LearningContent): void {
    if (!this.isEnabled) return;
    if (!('speechSynthesis' in window)) return;

    const synth = window.speechSynthesis;
    synth.cancel(); // Stop any current speech

    const utterance = new SpeechSynthesisUtterance(content.sentence);
    utterance.lang = 'en-US';
    utterance.rate = 0.75;
    utterance.pitch = 1.1;

    // Use a female voice if available
    const voices = synth.getVoices();
    const femaleVoice = voices.find(v => v.lang === 'en-US' && v.name.includes('Female'));
    if (femaleVoice) {
      utterance.voice = femaleVoice;
    }

    synth.speak(utterance);
  }

  speakWord(word: string): void {
    if (!this.isEnabled) return;
    const content = LEARNING_DATA[word] || { word, sentence: word };
    this.speak(content);
  }

  getContent(key: string): LearningContent | null {
    return LEARNING_DATA[key] || null;
  }
}

export const speechService = SpeechService.getInstance();
export type { LearningContent };
```

- [ ] **Step 2: Verify file exists and TypeScript compiles**

Run: `npx tsc --noEmit src/systems/SpeechService.ts`
Expected: No errors (or only type reference errors if bridge not updated yet)

- [ ] **Step 3: Commit**

```bash
git add src/systems/SpeechService.ts
git commit -m "feat: add SpeechService for English learning with Web Speech API"
```

---

## Task 2: Create SpeechOverlay Vue Component

**Files:**
- Create: `src/ui/components/SpeechOverlay.vue`

- [ ] **Step 1: Write SpeechOverlay component**

```vue
<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';

const props = defineProps<{
  visible: boolean;
  word: string;
}>();

const emit = defineEmits<{
  (e: 'done'): void;
}>();

const displayWord = ref('');
const isAnimating = ref(false);

watch(() => props.visible, (newVal) => {
  if (newVal) {
    displayWord.value = props.word;
    isAnimating.value = true;
    
    // Allow time for CSS animation then signal done
    setTimeout(() => {
      isAnimating.value = false;
      emit('done');
    }, 2500);
  }
});
</script>

<template>
  <Transition name="fade">
    <div v-if="visible" class="speech-overlay">
      <div class="speech-bubble">
        <span class="word" :class="{ animate: isAnimating }">
          {{ displayWord }}
        </span>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.speech-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  background: rgba(0, 0, 0, 0.3);
  z-index: var(--z-speech, 200);
  pointer-events: none;
}

.speech-bubble {
  background: linear-gradient(135deg, #2D5A27 0%, #4A8B3C 100%);
  border: 4px solid #FFD700;
  border-radius: 20px;
  padding: 30px 50px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.word {
  font-family: 'Fredoka One', 'Nunito', sans-serif;
  font-size: 72px;
  color: #FFFFFF;
  text-shadow: 0 4px 8px rgba(0, 0, 0, 0.5);
  display: block;
  text-align: center;
}

.word.animate {
  animation: pulse 0.3s ease-in-out infinite alternate;
}

@keyframes pulse {
  from { transform: scale(1); }
  to { transform: scale(1.05); }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
```

- [ ] **Step 2: Verify Vue compiles**

Run: `npx vue-tsc --noEmit src/ui/components/SpeechOverlay.vue 2>&1 || echo "Vue type check complete"`
Expected: No critical errors

- [ ] **Step 3: Commit**

```bash
git add src/ui/components/SpeechOverlay.vue
git commit -m "feat: add SpeechOverlay component for word display"
```

---

## Task 3: Update Bridge with Speech Event

**Files:**
- Modify: `src/ui/bridge.ts`

- [ ] **Step 1: Add speech events to bridge**

```typescript
// Add to GameEvents
export const GameEvents = {
  // ... existing events ...
  
  // Speech learning
  SPEECH_LEARN: 'game:speech-learn',
} as const;

// Helper to dispatch speech learn event
export function dispatchSpeechLearnEvent(key: string) {
  window.dispatchEvent(new CustomEvent(GameEvents.SPEECH_LEARN, { detail: key }));
}
```

- [ ] **Step 2: Verify bridge compiles**

Run: `npx tsc --noEmit src/ui/bridge.ts`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/ui/bridge.ts
git commit -m "feat: add SPEECH_LEARN event to bridge"
```

---

## Task 4: Update App.vue with SpeechOverlay

**Files:**
- Modify: `src/ui/App.vue`

- [ ] **Step 1: Import SpeechOverlay and add state**

```typescript
// Add to imports
import SpeechOverlay from './components/SpeechOverlay.vue';
import { speechService } from '../systems/SpeechService';
import { GameEvents, dispatchSpeechLearnEvent } from './bridge';

// Add state for speech overlay
const speechVisible = ref(false);
const speechWord = ref('');

// Add speech handler
function handleSpeechLearn(detail: string) {
  const content = speechService.getContent(detail);
  if (content) {
    speechWord.value = content.word;
    speechVisible.value = true;
    speechService.speak(content);
  }
}

// Update onMounted to add speech event listener
onMounted(() => {
  // ... existing listeners ...
  window.addEventListener(GameEvents.SPEECH_LEARN, ((e: CustomEvent) => {
    handleSpeechLearn(e.detail);
  }) as EventListener);
});

// Add to onUnmounted
onUnmounted(() => {
  // ... existing removals ...
  window.removeEventListener(GameEvents.SPEECH_LEARN, ((e: CustomEvent) => {
    handleSpeechLearn(e.detail);
  }) as EventListener);
});
```

- [ ] **Step 2: Add SpeechOverlay to template**

```vue
<!-- Add after GameOverlay -->
<SpeechOverlay
  v-if="speechVisible"
  :visible="speechVisible"
  :word="speechWord"
  @done="speechVisible = false"
/>
```

- [ ] **Step 3: Enable speech on start game**

```typescript
function onStartGame() {
  showTutorial.value = false;
  speechService.enable(); // Enable speech after user interaction
}
```

- [ ] **Step 4: Verify App.vue compiles**

Run: `npx vue-tsc --noEmit src/ui/App.vue 2>&1 || echo "Vue type check complete"`
Expected: No critical errors

- [ ] **Step 5: Commit**

```bash
git add src/ui/App.vue
git commit -m "feat: integrate SpeechOverlay with App.vue"
```

---

## Task 5: Update PlantCards with Speech Dispatch and Animation

**Files:**
- Modify: `src/ui/components/PlantCards.vue`

- [ ] **Step 1: Add speech dispatch on card click**

```typescript
// Add to imports
import { dispatchSpeechLearnEvent } from '../bridge';

// In the card click handler (around line where plant is selected)
function onCardClick(plant: PlantType) {
  selectedPlant.value = selectedPlant.value === plant ? null : plant;
  dispatchSpeechLearnEvent(plant); // NEW: trigger English learning
  emit('select', plant);
}
```

- [ ] **Step 2: Add click animation CSS**

```css
/* Add to existing card styles */
.card-icon {
  transition: transform 0.15s ease;
}

.plant-card:active .card-icon {
  transform: scale(1.15);
}
```

- [ ] **Step 3: Verify PlantCards compiles**

Run: `npx vue-tsc --noEmit src/ui/components/PlantCards.vue 2>&1 || echo "Vue type check complete"`
Expected: No critical errors

- [ ] **Step 4: Commit**

```bash
git add src/ui/components/PlantCards.vue
git commit -m "feat: add speech dispatch and click animation to PlantCards"
```

---

## Task 6: Add CSS Variable for Speech Overlay z-index

**Files:**
- Modify: `src/ui/styles/variables.css`

- [ ] **Step 1: Add speech z-index variable**

```css
/* Add after existing variables */
:root {
  /* ... existing variables ... */
  --z-speech: 200;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/styles/variables.css
git commit -m "feat: add z-speech CSS variable for speech overlay"
```

---

## Task 7: Build and Test

**Files:**
- No new files

- [ ] **Step 1: Run full build**

Run: `npm run build 2>&1 | tail -15`
Expected: Build succeeds with no TypeScript errors

- [ ] **Step 2: Test in browser with Playwright**

Run dev server: `npm run dev -- --port 5184 &`
Wait for startup, then:
```javascript
// In Playwright test
await page.goto('http://localhost:5184');
await page.waitForTimeout(2000);
// Click start button
await page.click('.tutorial-overlay .start-btn');
await page.waitForTimeout(500);
// Click first plant card (peashooter)
const card = await page.$('.plant-card');
await card.click();
await page.waitForTimeout(1000);
// Check if overlay appeared
const overlay = await page.$('.speech-overlay');
console.log('Speech overlay visible:', !!overlay);
```

- [ ] **Step 3: Commit final changes**

```bash
git add -A
git commit -m "feat: complete English learning feature with speech and visual overlay"
```

---

## Self-Review Checklist

1. **Spec coverage:** All requirements from spec are implemented
   - [x] SpeechService with learning sentences
   - [x] SpeechOverlay with word display
   - [x] Click triggers speech + overlay
   - [x] Card animation on click

2. **Placeholder scan:** No TODOs or TBDs in plan

3. **Type consistency:** SpeechService exports `LearningContent`, used correctly in App.vue

4. **Integration points:** Bridge event `SPEECH_LEARN` flows: PlantCards → bridge → App.vue → SpeechOverlay + SpeechService

---

## Plan Complete

**Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**