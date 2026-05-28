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

  static getInstance(): SpeechService {
    if (!SpeechService.instance) {
      SpeechService.instance = new SpeechService();
    }
    return SpeechService.instance;
  }

  enable(): void {
    this._enabled = true;
  }

  isSpeaking(): boolean {
    return speechSynthesis.speaking;
  }

  private selectBestVoice(): SpeechSynthesisVoice | null {
    const voices = speechSynthesis.getVoices();
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

    // Fallback to any en-US voice
    return voices.find((v) => v.lang === 'en-US') || null;
  }

  speak(content: LearningContent): void {
    if (!this._enabled) return;

    // First speak the word with emphasis
    const wordUtterance = new SpeechSynthesisUtterance(content.word);
    wordUtterance.rate = 0.85;
    wordUtterance.pitch = 1.05;
    wordUtterance.volume = 1.0;
    wordUtterance.voice = this.selectBestVoice();

    // Then speak the sentence after a short pause
    const sentenceUtterance = new SpeechSynthesisUtterance(content.sentence);
    sentenceUtterance.rate = 0.9;
    sentenceUtterance.pitch = 1.0;
    sentenceUtterance.volume = 1.0;
    sentenceUtterance.voice = this.selectBestVoice();

    // Chain: word -> pause -> sentence
    wordUtterance.onend = () => {
      setTimeout(() => {
        speechSynthesis.speak(sentenceUtterance);
      }, 300);
    };

    speechSynthesis.cancel();
    speechSynthesis.speak(wordUtterance);
  }

  speakWord(word: string): void {
    if (!this._enabled) return;
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.rate = 0.85;
    utterance.pitch = 1.05;
    utterance.volume = 1.0;
    utterance.voice = this.selectBestVoice();

    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  }

  getContent(key: string): LearningContent | null {
    return LEARNING_DATA[key] ?? null;
  }
}

export const speechService = SpeechService.getInstance();
