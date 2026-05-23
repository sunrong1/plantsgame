import Phaser from 'phaser';
import { PLANT_CONFIG_MAP } from '../config';
import type { PlayScene } from './PlayScene';

export class UIScene extends Phaser.Scene {
  private sunlightText!: Phaser.GameObjects.Text;
  private plantCards: Phaser.GameObjects.Container[] = [];
  private selectedCard: Phaser.GameObjects.Container | null = null;
  private overlayShown: boolean = false;

  constructor() {
    super({ key: 'UIScene' });
  }

  create(): void {
    this.createTopBar();
    this.createPlantCards();
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
    graphics.fillRect(0, 0, 530, 50);

    const sunIcon = this.add.graphics();
    sunIcon.fillStyle(0xFFFF00, 1);
    sunIcon.fillCircle(30, 25, 15);

    this.sunlightText = this.add.text(50, 15, '150', {
      fontSize: '24px',
      color: '#FFFFFF',
      fontFamily: 'Arial',
    });
  }

  private createPlantCards(): void {
    const cardStartX = 150;
    const cardWidth = 60;
    const cardY = 10;

    const plants = ['peashooter', 'sunflower', 'wallnut', 'cherrybomb'];

    plants.forEach((plantId, index) => {
      const config = PLANT_CONFIG_MAP.get(plantId)!;
      const x = cardStartX + index * cardWidth;

      const card = this.createCard(x, cardY, plantId, config.cost);
      this.plantCards.push(card);
    });
  }

  private createCard(
    x: number,
    y: number,
    plantType: string,
    cost: number
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);

    // 卡片背景
    const bg = this.add.graphics();
    bg.lineStyle(2, 0xFFFFFF, 0.8);
    bg.fillStyle(0x2a2a2a, 1);
    bg.fillRoundedRect(0, 0, 55, 40, 4);
    bg.strokeRoundedRect(0, 0, 55, 40, 4);

    // 使用游戏纹理作为图标
    const icon = this.add.image(20, 18, plantType);
    icon.setScale(0.7);

    // 阳光成本
    const sunIcon = this.add.graphics();
    sunIcon.fillStyle(0xFFFF00, 1);
    sunIcon.fillCircle(45, 32, 6);
    sunIcon.lineStyle(1, 0xDAA520, 1);
    sunIcon.strokeCircle(45, 32, 6);

    const costText = this.add.text(45, 32, '', {
      fontSize: '10px',
      color: '#000000',
      fontFamily: 'Arial',
      fontStyle: 'bold',
    });
    costText.setOrigin(0.5);

    container.add([bg, icon, sunIcon, costText]);
    container.setSize(55, 40);
    container.setInteractive();

    container.on('pointerdown', () => {
      this.selectCard(container);
    });

    return container;
  }

  private selectCard(card: Phaser.GameObjects.Container): void {
    const playScene = this.getPlayScene();
    if (!playScene) return;

    const sunlight = playScene.getSunlight();

    const index = this.plantCards.indexOf(card);
    const plants = ['peashooter', 'sunflower', 'wallnut', 'cherrybomb'];
    const plantType = plants[index];

    const config = PLANT_CONFIG_MAP.get(plantType)!;

    if (sunlight >= config.cost) {
      if (this.selectedCard) {
        this.unhighlightCard(this.selectedCard);
      }

      this.selectedCard = card;
      this.highlightCard(card);

      // 直接调用 PlayScene 的方法，而不是通过事件
      playScene.selectPlant(plantType);
    }
  }

  private highlightCard(card: Phaser.GameObjects.Container): void {
    const bg = card.list[0] as Phaser.GameObjects.Graphics;
    bg.clear();
    bg.lineStyle(3, 0x00FF00, 1);
    bg.fillStyle(0x555555, 1);
    bg.fillRect(0, 0, 55, 40);
    bg.strokeRect(0, 0, 55, 40);
  }

  private unhighlightCard(card: Phaser.GameObjects.Container): void {
    const bg = card.list[0] as Phaser.GameObjects.Graphics;
    bg.clear();
    bg.lineStyle(2, 0xFFFFFF, 0.8);
    bg.fillStyle(0x555555, 1);
    bg.fillRect(0, 0, 55, 40);
    bg.strokeRect(0, 0, 55, 40);
  }

  private updateUI(): void {
    const playScene = this.getPlayScene();
    if (playScene && this.sunlightText) {
      this.sunlightText.setText(playScene.getSunlight().toString());
    }
  }

  private showTutorialOverlay(): void {
    // 半透明黑色背景
    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.85);
    overlay.fillRect(0, 0, 530, 350);
    overlay.setDepth(100);

    // 主面板背景
    const panelBg = this.add.graphics();
    panelBg.fillStyle(0x1a472a, 1);
    panelBg.fillRoundedRect(65, 50, 400, 250, 16);
    panelBg.lineStyle(4, 0x4CAF50, 1);
    panelBg.strokeRoundedRect(65, 50, 400, 250, 16);
    panelBg.setDepth(101);

    // 标题
    const title = this.add.text(265, 75, '🌻 PVZ 像素版 🌻', {
      fontSize: '28px',
      fontFamily: 'Arial',
      color: '#FFD700',
      fontStyle: 'bold',
    });
    title.setOrigin(0.5);
    title.setDepth(102);

    // 操作说明
    const guideTitle = this.add.text(265, 115, '【操作指南】', {
      fontSize: '16px',
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
      const item = this.add.text(100, 140 + i * 22, text, {
        fontSize: '14px',
        fontFamily: 'Arial',
        color: '#E8F5E9',
      });
      item.setDepth(102);
      instructionTexts.push(item);
    });

    // 植物卡片说明
    const plantsTitle = this.add.text(265, 230, '【植物图鉴】', {
      fontSize: '16px',
      fontFamily: 'Arial',
      color: '#FFFFFF',
      fontStyle: 'bold',
    });
    plantsTitle.setOrigin(0.5);
    plantsTitle.setDepth(102);

    const plantInfo = [
      { icon: '🟢', name: '豌豆射手', desc: '100阳光 · 攻击僵尸' },
      { icon: '🟡', name: '向日葵', desc: '50阳光 · 产出阳光' },
      { icon: '🟤', name: '坚果墙', desc: '50阳光 · 阻挡敌人' },
    ];

    const plantInfoTexts: Phaser.GameObjects.GameObject[] = [];
    plantInfo.forEach((plant, i) => {
      const x = 90 + i * 130;
      const card = this.add.graphics();
      card.fillStyle(0x333333, 1);
      card.fillRoundedRect(x, 255, 120, 35, 6);
      card.setDepth(102);
      plantInfoTexts.push(card);

      const nameText = this.add.text(x + 60, 263, `${plant.icon} ${plant.name}`, {
        fontSize: '13px',
        fontFamily: 'Arial',
        color: '#FFFFFF',
        fontStyle: 'bold',
      });
      nameText.setOrigin(0.5, 0);
      nameText.setDepth(103);
      plantInfoTexts.push(nameText);

      const descText = this.add.text(x + 60, 278, plant.desc, {
        fontSize: '11px',
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
    btnBg.fillRoundedRect(175, 300, 180, 40, 8);
    btnBg.setDepth(102);
    btnBg.setInteractive(new Phaser.Geom.Rectangle(175, 300, 180, 40), Phaser.Geom.Rectangle.Contains);

    const btnText = this.add.text(265, 320, '开始游戏', {
      fontSize: '20px',
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
      btnBg.fillRoundedRect(175, 300, 180, 40, 8);
    });

    btnBg.on('pointerout', () => {
      btnBg.clear();
      btnBg.fillStyle(0x4CAF50, 1);
      btnBg.fillRoundedRect(175, 300, 180, 40, 8);
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
}