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
    graphics.fillRect(0, 0, 530, 55); // 稍微高一点

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

      this.createCard(x, cardY, plantId, config.cost, index);
    });
  }

  private createCard(
    x: number,
    y: number,
    plantType: string,
    cost: number,
    index: number = 0
  ): Phaser.GameObjects.Container {
    // 创建一个独立的透明背景用于交互检测
    const hitArea = this.add.rectangle(x + 30, y + 22, 60, 45);
    hitArea.setFillStyle(0x000000, 0.001); // 几乎透明但可点击
    hitArea.setDepth(100 + index);
    hitArea.setInteractive({ useHandCursor: true });

    // 卡片背景 - 画在正确的位置
    const bg = this.add.graphics();
    bg.lineStyle(2, 0xFFFFFF, 0.8);
    bg.fillStyle(0x2a2a2a, 1);
    bg.fillRoundedRect(x, y, 60, 45, 4);
    bg.strokeRoundedRect(x, y, 60, 45, 4);
    bg.setDepth(101 + index);

    // 使用游戏纹理作为图标
    const icon = this.add.image(x + 30, y + 20, plantType);
    icon.setScale(38 / 512);
    icon.setDepth(102 + index);

    // 阳光成本图标
    const sunIcon = this.add.graphics();
    sunIcon.fillStyle(0xFFFF00, 1);
    sunIcon.fillCircle(x + 50, y + 36, 7);
    sunIcon.lineStyle(1, 0xDAA520, 1);
    sunIcon.strokeCircle(x + 50, y + 36, 7);
    sunIcon.setDepth(102 + index);

    const costText = this.add.text(x + 50, y + 36, '', {
      fontSize: '11px',
      color: '#000000',
      fontFamily: 'Arial',
      fontStyle: 'bold',
    });
    costText.setOrigin(0.5);
    costText.setDepth(103 + index);

    // 触摸反馈 - 使用 hitArea 作为引用
    hitArea.on('pointerover', () => {
      bg.clear();
      bg.lineStyle(3, 0x00FF00, 1);
      bg.fillStyle(0x3a3a3a, 1);
      bg.fillRoundedRect(x, y, 60, 45, 4);
      bg.strokeRoundedRect(x, y, 60, 45, 4);
    });

    hitArea.on('pointerout', () => {
      bg.clear();
      bg.lineStyle(2, 0xFFFFFF, 0.8);
      bg.fillStyle(0x2a2a2a, 1);
      bg.fillRoundedRect(x, y, 60, 45, 4);
      bg.strokeRoundedRect(x, y, 60, 45, 4);
    });

    hitArea.on('pointerdown', () => {
      this.selectCard(index);
    });

    return hitArea as unknown as Phaser.GameObjects.Container;
  }

  private selectCard(index: number): void {
    const playScene = this.getPlayScene();
    if (!playScene) return;

    const plants = ['peashooter', 'sunflower', 'wallnut', 'cherrybomb'];
    const plantType = plants[index];
    const config = PLANT_CONFIG_MAP.get(plantType)!;
    const sunlight = playScene.getSunlight();

    if (sunlight >= config.cost) {
      playScene.selectPlant(plantType);
    }
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