export type LearningContent = {
  word: string;
  sentence: string;
};

export const LEARNING_DATA: Record<string, LearningContent> = {
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

export class SpeechService {
  private static instance: SpeechService | null = null;
  private _enabled: boolean = false;
  private _voices: SpeechSynthesisVoice[] = [];
  private _voicesLoaded: boolean = false;
  private _preheated: boolean = false;

  static getInstance(): SpeechService {
    if (!SpeechService.instance) {
      SpeechService.instance = new SpeechService();
    }
    return SpeechService.instance;
  }

  enable(): void {
    this._enabled = true;
    this.loadVoices();
  }

  preheat(): void {
    if (this._preheated || !this._enabled) return;
    if (typeof speechSynthesis === 'undefined') return;

    // Android Chrome requires a user-gesture utterance to unlock
    // the audio session. Subsequent speaks would silently fail otherwise.
    const warmup = new SpeechSynthesisUtterance(' ');
    warmup.volume = 0;
    warmup.onend = () => { this._preheated = true; };
    warmup.onerror = () => { this._preheated = true; };
    try {
      speechSynthesis.speak(warmup);
    } catch {
      this._preheated = true;
    }
  }

  private loadVoices(): void {
    // Get available voices
    const voices = speechSynthesis.getVoices();
    if (voices.length > 0) {
      this._voices = voices;
      this._voicesLoaded = true;
    }

    // Mobile Safari requires listening for voiceschanged event
    speechSynthesis.onvoiceschanged = () => {
      this._voices = speechSynthesis.getVoices();
      this._voicesLoaded = true;
    };
  }

  isSpeaking(): boolean {
    return speechSynthesis.speaking;
  }

  private selectBestVoice(): SpeechSynthesisVoice | null {
    // Use cached voices if loaded, otherwise try to get them now
    const voices = this._voicesLoaded ? this._voices : speechSynthesis.getVoices();
    if (voices.length === 0) return null;

    // Priority order for natural children's voice:
    // 1. Google UK English (natural, clear)
    // 2. Google US English (natural)
    // 3. Microsoft UK English (natural)
    // 4. Standard en-US voices
    const priorityPrefixes = [
      'Google UK English',
      'Google US English',
      'Microsoft Hazel',
      'Microsoft Susan',
      'Samantha',
      'Karen',
    ];

    for (const prefix of priorityPrefixes) {
      const voice = voices.find(
        (v) => v.lang.startsWith('en') && v.name.includes(prefix),
      );
      if (voice) return voice;
    }

    // Fallback to any en-US voice, then any English voice
    return voices.find((v) => v.lang === 'en-US') || voices.find((v) => v.lang.startsWith('en')) || null;
  }

  speak(content: LearningContent): void {
    if (!this._enabled) return;

    // Only cancel if something is already playing; canceling when idle
    // can break Android's freshly-unlocked audio session.
    if (speechSynthesis.speaking) {
      speechSynthesis.cancel();
    }

    // First speak the word with emphasis
    const wordUtterance = new SpeechSynthesisUtterance(content.word);
    wordUtterance.rate = 0.85;
    wordUtterance.pitch = 1.05;
    wordUtterance.volume = 1.0;
    wordUtterance.voice = this.selectBestVoice();
    wordUtterance.onerror = (e) => {
      if (e.error !== 'canceled') {
        console.warn('Speech word error:', e.error);
      }
    };

    // Then speak the sentence after a short pause
    const sentenceUtterance = new SpeechSynthesisUtterance(content.sentence);
    sentenceUtterance.rate = 0.9;
    sentenceUtterance.pitch = 1.0;
    sentenceUtterance.volume = 1.0;
    sentenceUtterance.voice = this.selectBestVoice();
    sentenceUtterance.onerror = (e) => {
      if (e.error !== 'canceled') {
        console.warn('Speech sentence error:', e.error);
      }
    };

    // Chain: word -> pause -> sentence
    wordUtterance.onend = () => {
      setTimeout(() => {
        speechSynthesis.speak(sentenceUtterance);
      }, 300);
    };

    speechSynthesis.speak(wordUtterance);
  }

  speakWord(word: string): void {
    if (!this._enabled) return;
    if (speechSynthesis.speaking) {
      speechSynthesis.cancel();
    }
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.rate = 0.85;
    utterance.pitch = 1.05;
    utterance.volume = 1.0;
    utterance.voice = this.selectBestVoice();
    utterance.onerror = (e) => {
      if (e.error !== 'canceled') {
        console.warn('Speech word error:', e.error);
      }
    };
    speechSynthesis.speak(utterance);
  }

  getContent(key: string): LearningContent | null {
    return LEARNING_DATA[key] ?? null;
  }
}

export const speechService = SpeechService.getInstance();
