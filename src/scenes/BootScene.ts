import Phaser from 'phaser';
import { UIScene } from './UIScene';
import { PlayScene } from './PlayScene';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    this.createTextures();
  }

  create(): void {
    this.scene.add('PlayScene', PlayScene, true);
    this.scene.add('UIScene', UIScene, true);

    this.scene.start('PlayScene');
  }

  private createTextures(): void {
    const textures = this.textures;

    // 草地格子
    this.createGrassTile(textures);

    // 豌豆射手 - 简化像素风
    this.createPeashooter(textures);

    // 向日葵 - 简化像素风
    this.createSunflower(textures);

    // 坚果墙 - 简化像素风
    this.createWallnut(textures);

    // 普通僵尸 - 简化像素风
    this.createZombieNormal(textures);

    // 旗帜僵尸 - 简化像素风
    this.createZombieFlag(textures);

    // 豌豆
    this.createPea(textures);

    // 阳光
    this.createSunlight(textures);
  }

  private createGrassTile(textures: Phaser.Textures.TextureManager): void {
    const canvas = textures.createCanvas('grass_tile', 50, 50);
    if (!canvas) return;
    const ctx = canvas.context;

    ctx.fillStyle = '#228B22';
    ctx.fillRect(0, 0, 50, 50);

    // 草地质感
    ctx.fillStyle = '#32CD32';
    for (let i = 0; i < 20; i++) {
      const x = Math.random() * 50;
      const y = Math.random() * 50;
      ctx.fillRect(x, y, 2, 3);
    }

    canvas.refresh();
  }

  private createPeashooter(textures: Phaser.Textures.TextureManager): void {
    const canvas = textures.createCanvas('peashooter', 48, 48);
    if (!canvas) return;
    const ctx = canvas.context;

    // 身体 - 绿色圆形
    ctx.fillStyle = '#228B22';
    ctx.beginPath();
    ctx.arc(24, 28, 16, 0, Math.PI * 2);
    ctx.fill();

    // 头部 - 浅绿
    ctx.fillStyle = '#32CD32';
    ctx.beginPath();
    ctx.arc(24, 14, 12, 0, Math.PI * 2);
    ctx.fill();

    // 炮管
    ctx.fillStyle = '#228B22';
    ctx.fillRect(30, 10, 14, 8);

    // 炮管口
    ctx.fillStyle = '#006400';
    ctx.fillRect(40, 12, 6, 4);

    // 眼睛
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(20, 12, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(28, 12, 3, 0, Math.PI * 2);
    ctx.fill();

    canvas.refresh();
  }

  private createSunflower(textures: Phaser.Textures.TextureManager): void {
    const canvas = textures.createCanvas('sunflower', 48, 48);
    if (!canvas) return;
    const ctx = canvas.context;

    // 花瓣
    ctx.fillStyle = '#FFD700';
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI * 2) / 8 - Math.PI / 2;
      const px = 24 + Math.cos(angle) * 12;
      const py = 24 + Math.sin(angle) * 12;
      ctx.beginPath();
      ctx.ellipse(px, py, 6, 4, angle + Math.PI / 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // 花盘
    ctx.fillStyle = '#8B4513';
    ctx.beginPath();
    ctx.arc(24, 24, 10, 0, Math.PI * 2);
    ctx.fill();

    // 花盘点
    ctx.fillStyle = '#654321';
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI * 2) / 8;
      const px = 24 + Math.cos(angle) * 6;
      const py = 24 + Math.sin(angle) * 6;
      ctx.beginPath();
      ctx.arc(px, py, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // 茎
    ctx.fillStyle = '#228B22';
    ctx.fillRect(22, 36, 4, 12);

    canvas.refresh();
  }

  private createWallnut(textures: Phaser.Textures.TextureManager): void {
    const canvas = textures.createCanvas('wallnut', 48, 48);
    if (!canvas) return;
    const ctx = canvas.context;

    // 主体
    ctx.fillStyle = '#D2691E';
    ctx.beginPath();
    ctx.ellipse(24, 26, 18, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    // 高光
    ctx.fillStyle = '#DEB887';
    ctx.beginPath();
    ctx.ellipse(18, 20, 8, 5, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // 眼睛
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(18, 24, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(30, 24, 3, 0, Math.PI * 2);
    ctx.fill();

    // 眼睛高光
    ctx.fillStyle = '#FFF';
    ctx.beginPath();
    ctx.arc(17, 23, 1, 0, Math.PI * 2);
    ctx.fill();

    // 眉毛
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(14, 18);
    ctx.lineTo(22, 20);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(34, 18);
    ctx.lineTo(26, 20);
    ctx.stroke();

    canvas.refresh();
  }

  private createZombieNormal(textures: Phaser.Textures.TextureManager): void {
    const canvas = textures.createCanvas('zombie_normal', 48, 56);
    if (!canvas) return;
    const ctx = canvas.context;

    // 身体
    ctx.fillStyle = '#696969';
    ctx.fillRect(16, 26, 16, 18);

    // 头
    ctx.fillStyle = '#7CB342';
    ctx.beginPath();
    ctx.arc(24, 14, 12, 0, Math.PI * 2);
    ctx.fill();

    // 头发
    ctx.fillStyle = '#4A4A4A';
    ctx.fillRect(14, 4, 20, 4);

    // 眼睛
    ctx.fillStyle = '#FFF';
    ctx.beginPath();
    ctx.arc(20, 12, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(28, 12, 4, 0, Math.PI * 2);
    ctx.fill();

    // 瞳孔
    ctx.fillStyle = '#F00';
    ctx.beginPath();
    ctx.arc(20, 13, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(28, 13, 2, 0, Math.PI * 2);
    ctx.fill();

    // 手臂
    ctx.fillStyle = '#7CB342';
    ctx.fillRect(32, 28, 12, 4);
    ctx.fillRect(32, 32, 10, 4);

    canvas.refresh();
  }

  private createZombieFlag(textures: Phaser.Textures.TextureManager): void {
    const canvas = textures.createCanvas('zombie_flag', 48, 56);
    if (!canvas) return;
    const ctx = canvas.context;

    // 身体
    ctx.fillStyle = '#8B0000';
    ctx.fillRect(16, 26, 16, 18);

    // 头
    ctx.fillStyle = '#A52A2A';
    ctx.beginPath();
    ctx.arc(24, 14, 12, 0, Math.PI * 2);
    ctx.fill();

    // 头发
    ctx.fillStyle = '#2F2F2F';
    ctx.fillRect(14, 4, 20, 4);

    // 眼睛
    ctx.fillStyle = '#FF4444';
    ctx.beginPath();
    ctx.arc(20, 12, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(28, 12, 4, 0, Math.PI * 2);
    ctx.fill();

    // 瞳孔
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(20, 13, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(28, 13, 2, 0, Math.PI * 2);
    ctx.fill();

    // 手臂
    ctx.fillStyle = '#A52A2A';
    ctx.fillRect(32, 28, 12, 4);
    ctx.fillRect(32, 32, 10, 4);

    // 旗杆
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(4, 0, 3, 32);

    // 旗帜
    ctx.fillStyle = '#FF0000';
    ctx.beginPath();
    ctx.moveTo(7, 2);
    ctx.lineTo(22, 8);
    ctx.lineTo(7, 16);
    ctx.closePath();
    ctx.fill();

    canvas.refresh();
  }

  private createPea(textures: Phaser.Textures.TextureManager): void {
    const canvas = textures.createCanvas('pea', 20, 20);
    if (!canvas) return;
    const ctx = canvas.context;

    // 主体
    ctx.fillStyle = '#32CD32';
    ctx.beginPath();
    ctx.arc(10, 10, 9, 0, Math.PI * 2);
    ctx.fill();

    // 高光
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.arc(7, 7, 3, 0, Math.PI * 2);
    ctx.fill();

    canvas.refresh();
  }

  private createSunlight(textures: Phaser.Textures.TextureManager): void {
    const canvas = textures.createCanvas('sunlight', 40, 40);
    if (!canvas) return;
    const ctx = canvas.context;

    // 光芒
    ctx.fillStyle = '#FFD700';
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI * 2) / 8;
      const px = 20 + Math.cos(angle) * 16;
      const py = 20 + Math.sin(angle) * 16;
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // 主体
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(20, 20, 12, 0, Math.PI * 2);
    ctx.fill();

    // 笑脸
    ctx.fillStyle = '#FFA500';
    ctx.beginPath();
    ctx.arc(16, 18, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(24, 18, 2, 0, Math.PI * 2);
    ctx.fill();

    // 嘴
    ctx.strokeStyle = '#FFA500';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(20, 22, 5, 0.2, Math.PI - 0.2);
    ctx.stroke();

    canvas.refresh();
  }
}
