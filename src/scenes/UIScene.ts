import Phaser from 'phaser';
import { PLANT_CONFIG_MAP } from '../config';
import type { PlayScene } from './PlayScene';

// 植物英文名映射
const PLANT_ENGLISH_NAMES: Record<string, string> = {
  peashooter: 'Peashooter',
  sunflower: 'Sunflower',
  wallnut: 'Wall-nut',
  cherrybomb: 'Cherry Bomb',
};

export class UIScene extends Phaser.Scene {
  private sunlightText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  private plantCards: PlantCard[] = [];
  private selectedCardIndex: number = -1;
  private overlayShown: boolean = false;
  private audioUnlocked: boolean = false;
  private currentWave: number = 0;

  constructor() {
    super({ key: 'UIScene' });
  }

  create(): void {
    this.createTopBar();
    this.createPlantCards();
    this.createAudioUnlockButton();
    this.showTutorialOverlay();

    this.time.addEvent({
      delay: 500,
      callback: this.updateUI,
      callbackScope: this,
      loop: true,
    });
  }

  private getPlayScene(): PlayScene | null {
    return this.scene.get('PlayScene') as PlayScene | null;
  }

  private createTopBar(): void {
    const graphics = this.add.graphics();
    graphics.fillStyle(0x333333, 1);
    graphics.fillRect(0, 0, 720, 75); // Full width now

    const sunIcon = this.add.graphics();
    sunIcon.fillStyle(0xFFFF00, 1);
    sunIcon.fillCircle(30, 37, 15);

    this.sunlightText = this.add.text(50, 25, '150', {
      fontSize: '24px',
      color: '#FFFFFF',
      fontFamily: 'Arial',
    });

    // Wave indicator
    this.waveText = this.add.text(580, 25, 'Wave 0/3', {
      fontSize: '18px',
      color: '#FF6666',
      fontFamily: 'Arial',
      fontStyle: 'bold',
    });
  }

  private createPlantCards(): void {
    const cardStartX = 180;
    const cardWidth = 80;
    const cardHeight = 60;
    const cardY = 68;
    const cardGap = 10;

    const plants = ['peashooter', 'sunflower', 'wallnut', 'cherrybomb'];

    plants.forEach((plantId, index) => {
      const config = PLANT_CONFIG_MAP.get(plantId)!;
      const x = cardStartX + index * (cardWidth + cardGap);

      const card = new PlantCard(this, x, cardY, cardWidth, cardHeight, plantId, config.cost, index);
      this.plantCards.push(card);
    });
  }

  private createAudioUnlockButton(): void {
    // 一个小按钮用于解锁音频上下文
    const btn = this.add.text(640, 72, '🔊', {
      fontSize: '16px',
    });
    btn.setDepth(200);
    btn.setInteractive({ useHandCursor: true });
    btn.on('pointerdown', () => {
      this.audioUnlocked = true;
      btn.setText('🔊');
      // Speech synthesis doesn't need audio context unlocking like Web Audio API
      // This just marks the flag to enable speech
    });
  }

  private speak(text: string): void {
    if (!this.audioUnlocked) return;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.85;
      window.speechSynthesis.speak(utterance);
    }
  }

  public selectCard(index: number): void {
    const playScene = this.getPlayScene();
    if (!playScene) return;

    const plants = ['peashooter', 'sunflower', 'wallnut', 'cherrybomb'];
    const plantType = plants[index];
    const config = PLANT_CONFIG_MAP.get(plantType);
    if (!config) return;

    const sunlight = playScene.getSunlight();

    if (sunlight >= config.cost) {
      // Only speak if affordable
      this.speak(PLANT_ENGLISH_NAMES[plantType]);

      // 取消之前选中
      if (this.selectedCardIndex >= 0) {
        this.plantCards[this.selectedCardIndex].setSelected(false);
      }

      this.selectedCardIndex = index;
      this.plantCards[index].setSelected(true);
      playScene.selectPlant(plantType);
    }
  }

  private updateUI(): void {
    const playScene = this.getPlayScene();
    if (playScene && this.sunlightText) {
      const sunlight = playScene.getSunlight();
      this.sunlightText.setText(sunlight.toString());

      // 更新每个卡片的状态
      this.plantCards.forEach((card) => {
        const config = card.getConfig();
        if (config) {
          const canAfford = sunlight >= config.cost;
          card.setAffordable(canAfford);
        }
      });
    }
  }

  private showTutorialOverlay(): void {
    // 半透明黑色背景
    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.85);
    overlay.fillRect(0, 0, 720, 580);
    overlay.setDepth(100);

    // 主面板背景
    const panelBg = this.add.graphics();
    panelBg.fillStyle(0x1a472a, 1);
    panelBg.fillRoundedRect(110, 100, 500, 350, 16);
    panelBg.lineStyle(4, 0x4CAF50, 1);
    panelBg.strokeRoundedRect(110, 100, 500, 350, 16);
    panelBg.setDepth(101);

    // 标题
    const title = this.add.text(360, 130, '🌻 PVZ 像素版 🌻', {
      fontSize: '32px',
      fontFamily: 'Arial',
      color: '#FFD700',
      fontStyle: 'bold',
    });
    title.setOrigin(0.5);
    title.setDepth(102);

    // 操作说明
    const guideTitle = this.add.text(360, 175, '【操作指南】', {
      fontSize: '18px',
      fontFamily: 'Arial',
      color: '#FFFFFF',
      fontStyle: 'bold',
    });
    guideTitle.setOrigin(0.5);
    guideTitle.setDepth(102);

    const instructionTexts: Phaser.GameObjects.Text[] = [];
    const instructions = [
      '① 点击顶部植物卡片选中',
      '② 点击草坪格子进行种植',
      '③ 点击掉落的阳光收集资源',
      '④ 右键点击或按 ESC 取消选择',
    ];

    instructions.forEach((text, i) => {
      const item = this.add.text(150, 205 + i * 28, text, {
        fontSize: '16px',
        fontFamily: 'Arial',
        color: '#E8F5E9',
      });
      item.setDepth(102);
      instructionTexts.push(item);
    });

    // 植物卡片说明
    const plantsTitle = this.add.text(360, 330, '【植物图鉴】', {
      fontSize: '18px',
      fontFamily: 'Arial',
      color: '#FFFFFF',
      fontStyle: 'bold',
    });
    plantsTitle.setOrigin(0.5);
    plantsTitle.setDepth(102);

    const plantInfo = [
      { icon: '🟢', name: '豌豆射手 Peashooter', desc: '100阳光 · 攻击僵尸' },
      { icon: '🟡', name: '向日葵 Sunflower', desc: '50阳光 · 产出阳光' },
      { icon: '🟤', name: '坚果墙 Wall-nut', desc: '50阳光 · 阻挡敌人' },
    ];

    const plantInfoTexts: Phaser.GameObjects.GameObject[] = [];
    plantInfo.forEach((plant, i) => {
      const x = 160 + i * 160;
      const card = this.add.graphics();
      card.fillStyle(0x333333, 1);
      card.fillRoundedRect(x, 355, 140, 40, 6);
      card.setDepth(102);
      plantInfoTexts.push(card);

      const nameText = this.add.text(x + 70, 363, `${plant.icon} ${plant.name}`, {
        fontSize: '13px',
        fontFamily: 'Arial',
        color: '#FFFFFF',
        fontStyle: 'bold',
      });
      nameText.setOrigin(0.5, 0);
      nameText.setDepth(103);
      plantInfoTexts.push(nameText);

      const descText = this.add.text(x + 70, 378, plant.desc, {
        fontSize: '12px',
        fontFamily: 'Arial',
        color: '#AAAAAA',
      });
      descText.setOrigin(0.5, 0);
      descText.setDepth(103);
      plantInfoTexts.push(descText);
    });

    // 开始游戏按钮
    const btnBg = this.add.graphics();
    btnBg.fillStyle(0x4CAF50, 1);
    btnBg.fillRoundedRect(260, 410, 200, 50, 8);
    btnBg.setDepth(102);
    btnBg.setInteractive(new Phaser.Geom.Rectangle(260, 410, 200, 50), Phaser.Geom.Rectangle.Contains);

    const btnText = this.add.text(360, 435, '开始游戏', {
      fontSize: '24px',
      fontFamily: 'Arial',
      color: '#FFFFFF',
      fontStyle: 'bold',
    });
    btnText.setOrigin(0.5);
    btnText.setDepth(103);

    // 收集所有 overlay 元素
    const allElements: Phaser.GameObjects.GameObject[] = [
      overlay, panelBg, title, guideTitle, plantsTitle, btnBg, btnText,
      ...instructionTexts,
      ...plantInfoTexts
    ];

    // 按钮交互
    btnBg.on('pointerover', () => {
      btnBg.clear();
      btnBg.fillStyle(0x66BB6A, 1);
      btnBg.fillRoundedRect(260, 410, 200, 50, 8);
    });

    btnBg.on('pointerout', () => {
      btnBg.clear();
      btnBg.fillStyle(0x4CAF50, 1);
      btnBg.fillRoundedRect(260, 410, 200, 50, 8);
    });

    btnBg.on('pointerdown', () => {
      this.closeOverlay(allElements);
    });
  }

  private closeOverlay(elements: Phaser.GameObjects.GameObject[]): void {
    elements.forEach(el => el.destroy());
    this.overlayShown = true;
  }

  public isOverlayShown(): boolean {
    return this.overlayShown;
  }

  public updateWave(wave: number, total: number = 3): void {
    this.currentWave = wave;
    if (this.waveText) {
      this.waveText.setText(`Wave ${wave}/${total}`);
    }
  }
}

// 植物卡片类 - 封装卡片渲染逻辑
class PlantCard {
  private scene: Phaser.Scene;
  private x: number;
  private y: number;
  private width: number;
  private height: number;
  private plantType: string;
  private cost: number;
  private index: number;

  private container!: Phaser.GameObjects.Container;
  private bgShadow!: Phaser.GameObjects.Graphics;
  private bg!: Phaser.GameObjects.Graphics;
  private iconPlaceholder!: Phaser.GameObjects.Image;
  private nameText!: Phaser.GameObjects.Text;
  private costBg!: Phaser.GameObjects.Graphics;
  private costText!: Phaser.GameObjects.Text;
  private cooldownOverlay!: Phaser.GameObjects.Graphics;
  private cooldownText!: Phaser.GameObjects.Text;
  private disabledX!: Phaser.GameObjects.Graphics;

  private isSelected: boolean = false;
  private isAffordable: boolean = true;
  private baseY: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    height: number,
    plantType: string,
    cost: number,
    index: number
  ) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.plantType = plantType;
    this.cost = cost;
    this.index = index;
    this.baseY = y;

    this.create();
    this.createInteraction();
  }

  private create(): void {
    this.container = this.scene.add.container(this.x, this.y);
    this.container.setDepth(100 + this.index);

    // 1. 阴影层 (向下偏移4px，模拟立体阴影)
    this.bgShadow = this.scene.add.graphics();
    this.bgShadow.fillStyle(0x000000, 0.2);
    this.bgShadow.fillRoundedRect(4, 4, this.width, this.height, 8);
    this.container.add(this.bgShadow);

    // 2. 卡片背景 - #FFF8E7 (Card White)
    this.bg = this.scene.add.graphics();
    this.bg.fillStyle(0xFFF8E7, 1);
    this.bg.lineStyle(2, 0x4A3B2C, 0.3); // 淡边框
    this.bg.fillRoundedRect(0, 0, this.width, this.height, 8);
    this.bg.strokeRoundedRect(0, 0, this.width, this.height, 8);
    this.container.add(this.bg);

    // 3. 植物图片 (使用游戏纹理)
    const iconSize = 36;
    this.iconPlaceholder = this.scene.add.image(this.width / 2, 4 + iconSize / 2, this.plantType);
    this.iconPlaceholder.setScale(iconSize / 512);
    this.container.add(this.iconPlaceholder);

    // 4. 英文名称 - Fredoka One, #4A3B2C, 10px
    this.nameText = this.scene.add.text(this.width / 2, this.height - 6, PLANT_ENGLISH_NAMES[this.plantType], {
      fontSize: '10px',
      fontFamily: "'Fredoka One', sans-serif",
      color: '#4A3B2C',
    });
    this.nameText.setOrigin(0.5, 0);
    this.container.add(this.nameText);

    // 5. 阳光成本图标 (右上角)
    const costRadius = 7;
    const costX = this.width - costRadius - 3;
    const costY = costRadius + 3;

    this.costBg = this.scene.add.graphics();
    this.costBg.fillStyle(0xFFD700, 1); // Sun Gold
    this.costBg.fillCircle(costX, costY, costRadius);
    this.costBg.lineStyle(1, 0xDAA520, 1);
    this.costBg.strokeCircle(costX, costY, costRadius);
    this.container.add(this.costBg);

    this.costText = this.scene.add.text(costX, costY, this.cost.toString(), {
      fontSize: '8px',
      fontFamily: 'Arial',
      color: '#4A3B2C',
      fontStyle: 'bold',
    });
    this.costText.setOrigin(0.5, 0.5);
    this.container.add(this.costText);

    // 6. 冷却遮罩 (默认隐藏)
    this.cooldownOverlay = this.scene.add.graphics();
    this.cooldownOverlay.fillStyle(0x888888, 0.6);
    this.cooldownOverlay.fillRoundedRect(0, 0, this.width, this.height, 8);
    this.cooldownOverlay.setAlpha(0);
    this.container.add(this.cooldownOverlay);

    this.cooldownText = this.scene.add.text(this.width / 2, this.height / 2, '', {
      fontSize: '16px',
      fontFamily: "'Fredoka One', sans-serif",
      color: '#FFFFFF',
    });
    this.cooldownText.setOrigin(0.5, 0.5);
    this.cooldownText.setAlpha(0);
    this.container.add(this.cooldownText);

    // 7. 禁用叉号 (默认隐藏)
    this.disabledX = this.scene.add.graphics();
    this.disabledX.lineStyle(2, 0xFF0000, 0.8);
    this.disabledX.lineBetween(6, 6, this.width - 6, this.height - 6);
    this.disabledX.lineBetween(this.width - 6, 6, 6, this.height - 6);
    this.disabledX.setAlpha(0);
    this.container.add(this.disabledX);
  }

  private createInteraction(): void {
    const hitArea = this.scene.add.rectangle(
      this.x + this.width / 2,
      this.y + this.height / 2,
      Math.max(48, this.width),
      Math.max(48, this.height)
    );
    hitArea.setFillStyle(0x000000, 0.001);
    hitArea.setInteractive({ useHandCursor: true });

    hitArea.on('pointerover', () => this.onHover());
    hitArea.on('pointerout', () => this.onOut());
    hitArea.on('pointerdown', () => this.onClick());
  }

  private onHover(): void {
    if (!this.isAffordable) return;
    this.scene.tweens.add({
      targets: this.container,
      y: this.baseY - 2,
      duration: 100,
      ease: 'ease-out',
    });
  }

  private onOut(): void {
    if (this.isSelected) return;
    this.scene.tweens.add({
      targets: this.container,
      y: this.baseY,
      duration: 100,
      ease: 'ease-out',
    });
  }

  private onClick(): void {
    const uiScene = this.scene.scene.get('UIScene') as UIScene;
    if (uiScene) {
      uiScene.selectCard(this.index);
    }
  }

  public setSelected(selected: boolean): void {
    this.isSelected = selected;

    if (selected) {
      // 选中状态：上移4px，边框变亮绿
      this.scene.tweens.add({
        targets: this.container,
        y: this.baseY - 4,
        duration: 150,
        ease: 'ease-out',
      });

      // 边框变亮绿 #32CD32
      this.bg.clear();
      this.bg.fillStyle(0xFFF8E7, 1);
      this.bg.lineStyle(3, 0x32CD32, 1); // Plant Green
      this.bg.fillRoundedRect(0, 0, this.width, this.height, 8);
      this.bg.strokeRoundedRect(0, 0, this.width, this.height, 8);

      // 阴影加深
      this.bgShadow.clear();
      this.bgShadow.fillStyle(0x000000, 0.35);
      this.bgShadow.fillRoundedRect(4, 6, this.width, this.height, 8);
    } else {
      // 取消选中
      this.scene.tweens.add({
        targets: this.container,
        y: this.baseY,
        duration: 150,
        ease: 'ease-out',
      });

      this.resetAppearance();
    }
  }

  public setAffordable(affordable: boolean): void {
    this.isAffordable = affordable;

    if (affordable) {
      this.container.setAlpha(1);
      this.disabledX.setAlpha(0);
    } else {
      this.container.setAlpha(0.5);
      this.disabledX.setAlpha(0.8);
    }
  }

  public setCooldown(remaining: number): void {
    if (remaining <= 0) {
      this.cooldownOverlay.setAlpha(0);
      this.cooldownText.setAlpha(0);
    } else {
      this.cooldownOverlay.setAlpha(1);
      this.cooldownText.setAlpha(1);
      this.cooldownText.setText(Math.ceil(remaining / 1000).toString());
    }
  }

  public getConfig() {
    return PLANT_CONFIG_MAP.get(this.plantType);
  }

  private resetAppearance(): void {
    this.bg.clear();
    this.bg.fillStyle(0xFFF8E7, 1);
    this.bg.lineStyle(2, 0x4A3B2C, 0.3);
    this.bg.fillRoundedRect(0, 0, this.width, this.height, 8);
    this.bg.strokeRoundedRect(0, 0, this.width, this.height, 8);

    this.bgShadow.clear();
    this.bgShadow.fillStyle(0x000000, 0.2);
    this.bgShadow.fillRoundedRect(4, 4, this.width, this.height, 8);
  }
}