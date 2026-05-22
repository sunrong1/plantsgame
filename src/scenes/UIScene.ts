import Phaser from 'phaser';
import { PLANT_CONFIG_MAP } from '../config';
import type { PlayScene } from './PlayScene';

export class UIScene extends Phaser.Scene {
  private sunlightText!: Phaser.GameObjects.Text;
  private plantCards: Phaser.GameObjects.Container[] = [];
  private selectedCard: Phaser.GameObjects.Container | null = null;

  constructor() {
    super({ key: 'UIScene' });
  }

  create(): void {
    this.createTopBar();
    this.createPlantCards();

    this.time.addEvent({
      delay: 100,
      callback: this.updateUI,
      callbackScope: this,
      loop: true,
    });
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

    const plants = ['peashooter', 'sunflower', 'wallnut'];

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

    const bg = this.add.graphics();
    bg.lineStyle(2, 0xFFFFFF, 0.8);
    bg.fillStyle(0x555555, 1);
    bg.fillRect(0, 0, 55, 40);
    bg.strokeRect(0, 0, 55, 40);

    const icon = this.add.graphics();
    const color = plantType === 'peashooter' ? 0x90EE90 :
                  plantType === 'sunflower' ? 0xFFD700 : 0xDEB887;
    icon.fillStyle(color, 1);
    icon.fillRect(5, 5, 30, 30);
    icon.lineStyle(1, 0x000000, 1);
    icon.strokeRect(5, 5, 30, 30);

    const costText = this.add.text(20, 30, cost.toString(), {
      fontSize: '12px',
      color: '#FFFF00',
      fontFamily: 'Arial',
    });
    costText.setOrigin(0.5, 0.5);

    container.add([bg, icon, costText]);
    container.setSize(55, 40);
    container.setInteractive();

    container.on('pointerdown', () => {
      this.selectCard(container);
    });

    return container;
  }

  private selectCard(card: Phaser.GameObjects.Container): void {
    const scene = this.scene.get('PlayScene') as PlayScene;
    const sunlight = scene.getSunlight();

    const index = this.plantCards.indexOf(card);
    const plants = ['peashooter', 'sunflower', 'wallnut'];
    const plantType = plants[index];

    const config = PLANT_CONFIG_MAP.get(plantType)!;

    if (sunlight >= config.cost) {
      if (this.selectedCard) {
        this.unhighlightCard(this.selectedCard);
      }

      this.selectedCard = card;
      this.highlightCard(card);

      this.events.emit('plantSelected', plantType);
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
    const scene = this.scene.get('PlayScene') as PlayScene;
    if (scene && this.sunlightText) {
      this.sunlightText.setText(scene.getSunlight().toString());
    }
  }
}