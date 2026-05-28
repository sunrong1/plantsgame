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

  speak(content: LearningContent): void {
    if (!this._enabled) return;
    const utterance = new SpeechSynthesisUtterance(content.sentence);
    utterance.rate = 0.75;
    utterance.pitch = 1.1;

    const voices = speechSynthesis.getVoices();
    const enUsFemale = voices.find(
      (v) => v.lang === 'en-US' && v.name.toLowerCase().includes('female'),
    );
    if (enUsFemale) {
      utterance.voice = enUsFemale;
    } else {
      const enUs = voices.find((v) => v.lang === 'en-US');
      if (enUs) {
        utterance.voice = enUs;
      }
    }

    speechSynthesis.speak(utterance);
  }

  speakWord(word: string): void {
    if (!this._enabled) return;
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.rate = 0.75;
    utterance.pitch = 1.1;

    const voices = speechSynthesis.getVoices();
    const enUsFemale = voices.find(
      (v) => v.lang === 'en-US' && v.name.toLowerCase().includes('female'),
    );
    if (enUsFemale) {
      utterance.voice = enUsFemale;
    } else {
      const enUs = voices.find((v) => v.lang === 'en-US');
      if (enUs) {
        utterance.voice = enUs;
      }
    }

    speechSynthesis.speak(utterance);
  }

  getContent(key: string): LearningContent | null {
    return LEARNING_DATA[key] ?? null;
  }
}

export const speechService = SpeechService.getInstance();
