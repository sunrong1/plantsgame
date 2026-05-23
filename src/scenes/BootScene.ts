import Phaser from 'phaser';
import { UIScene } from './UIScene';
import { PlayScene } from './PlayScene';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    this.createPlaceholderTextures();
  }

  create(): void {
    this.scene.add('PlayScene', PlayScene, true);
    this.scene.add('UIScene', UIScene, true);

    this.scene.start('PlayScene');
  }

  private createPlaceholderTextures(): void {
    const textures = this.textures;

    // === 草地格子 ===
    this.createGrassTile(textures);

    // === 豌豆射手 ===
    this.createPeashooter(textures);

    // === 向日葵 ===
    this.createSunflower(textures);

    // === 坚果墙 ===
    this.createWallnut(textures);

    // === 普通僵尸 ===
    this.createZombieNormal(textures);

    // === 旗帜僵尸 ===
    this.createZombieFlag(textures);

    // === 豌豆 ===
    this.createPea(textures);

    // === 阳光 ===
    this.createSunlight(textures);
  }

  private createGrassTile(textures: Phaser.Textures.TextureManager): void {
    const canvas = textures.createCanvas('grass_tile', 50, 50);
    if (!canvas) return;
    const ctx = canvas.context;

    // 草地背景
    ctx.fillStyle = '#2E8B2E';
    ctx.fillRect(0, 0, 50, 50);

    // 添加草地纹理
    ctx.fillStyle = '#32CD32';
    for (let i = 0; i < 15; i++) {
      const x = Math.random() * 50;
      const y = Math.random() * 50;
      ctx.fillRect(x, y, 2, 4);
    }

    canvas.refresh();
  }

  private createPeashooter(textures: Phaser.Textures.TextureManager): void {
    const canvas = textures.createCanvas('peashooter', 48, 48);
    if (!canvas) return;
    const ctx = canvas.context;

    // 身体 - 深绿色圆形
    ctx.fillStyle = '#228B22';
    ctx.beginPath();
    ctx.arc(24, 28, 16, 0, Math.PI * 2);
    ctx.fill();

    // 头部 - 浅绿色圆形
    ctx.fillStyle = '#90EE90';
    ctx.beginPath();
    ctx.arc(24, 16, 12, 0, Math.PI * 2);
    ctx.fill();

    // 嘴巴/炮管 - 绿色矩形
    ctx.fillStyle = '#228B22';
    ctx.fillRect(32, 12, 12, 8);

    // 嘴巴内部
    ctx.fillStyle = '#006400';
    ctx.fillRect(38, 14, 6, 4);

    // 眼睛
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(20, 14, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(28, 14, 3, 0, Math.PI * 2);
    ctx.fill();

    // 眼睛高光
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(21, 13, 1, 0, Math.PI * 2);
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
      const angle = (i * Math.PI * 2) / 8;
      const x = 24 + Math.cos(angle) * 10;
      const y = 24 + Math.sin(angle) * 10;
      ctx.beginPath();
      ctx.ellipse(x, y, 6, 4, angle, 0, Math.PI * 2);
      ctx.fill();
    }

    // 花盘 - 棕色圆形
    ctx.fillStyle = '#8B4513';
    ctx.beginPath();
    ctx.arc(24, 24, 10, 0, Math.PI * 2);
    ctx.fill();

    // 花盘纹理
    ctx.fillStyle = '#654321';
    for (let i = 0; i < 6; i++) {
      const x = 20 + (i % 3) * 4;
      const y = 20 + Math.floor(i / 3) * 8;
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // 茎
    ctx.fillStyle = '#228B22';
    ctx.fillRect(22, 36, 4, 12);

    // 叶子
    ctx.fillStyle = '#32CD32';
    ctx.beginPath();
    ctx.ellipse(16, 40, 6, 3, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(32, 40, 6, 3, 0.5, 0, Math.PI * 2);
    ctx.fill();

    canvas.refresh();
  }

  private createWallnut(textures: Phaser.Textures.TextureManager): void {
    const canvas = textures.createCanvas('wallnut', 48, 48);
    if (!canvas) return;
    const ctx = canvas.context;

    // 坚果主体 - 椭圆形
    ctx.fillStyle = '#D2691E';
    ctx.beginPath();
    ctx.ellipse(24, 26, 18, 16, 0, 0, Math.PI * 2);
    ctx.fill();

    // 高光
    ctx.fillStyle = '#DEB887';
    ctx.beginPath();
    ctx.ellipse(20, 22, 8, 6, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // 纹理线
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(24, 10);
    ctx.lineTo(24, 42);
    ctx.stroke();

    // 眼睛
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(18, 24, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(30, 24, 3, 0, Math.PI * 2);
    ctx.fill();

    // 眼睛高光
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(17, 23, 1, 0, Math.PI * 2);
    ctx.fill();

    // 眉毛 - 表示坚定
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(14, 19);
    ctx.lineTo(22, 21);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(34, 19);
    ctx.lineTo(26, 21);
    ctx.stroke();

    canvas.refresh();
  }

  private createZombieNormal(textures: Phaser.Textures.TextureManager): void {
    const canvas = textures.createCanvas('zombie_normal', 48, 56);
    if (!canvas) return;
    const ctx = canvas.context;

    // 身体 - 灰色衬衫
    ctx.fillStyle = '#696969';
    ctx.fillRect(16, 24, 16, 20);

    // 头 - 灰绿色
    ctx.fillStyle = '#7CB342';
    ctx.beginPath();
    ctx.arc(24, 14, 12, 0, Math.PI * 2);
    ctx.fill();

    // 头发
    ctx.fillStyle = '#4A4A4A';
    ctx.beginPath();
    ctx.ellipse(24, 6, 10, 4, 0, 0, Math.PI);
    ctx.fill();

    // 眼睛
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(20, 12, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(28, 12, 4, 0, Math.PI * 2);
    ctx.fill();

    // 瞳孔
    ctx.fillStyle = '#FF0000';
    ctx.beginPath();
    ctx.arc(20, 13, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(28, 13, 2, 0, Math.PI * 2);
    ctx.fill();

    // 嘴巴
    ctx.fillStyle = '#4A4A4A';
    ctx.beginPath();
    ctx.arc(24, 22, 4, 0, Math.PI);
    ctx.fill();

    // 手臂 - 伸向前方
    ctx.fillStyle = '#7CB342';
    ctx.fillRect(32, 28, 12, 4);
    ctx.fillRect(32, 32, 10, 4);

    canvas.refresh();
  }

  private createZombieFlag(textures: Phaser.Textures.TextureManager): void {
    const canvas = textures.createCanvas('zombie_flag', 48, 56);
    if (!canvas) return;
    const ctx = canvas.context;

    // 身体 - 红色衬衫
    ctx.fillStyle = '#8B0000';
    ctx.fillRect(16, 24, 16, 20);

    // 头 - 红色调僵尸
    ctx.fillStyle = '#8B0000';
    ctx.beginPath();
    ctx.arc(24, 14, 12, 0, Math.PI * 2);
    ctx.fill();

    // 头发
    ctx.fillStyle = '#2F2F2F';
    ctx.beginPath();
    ctx.ellipse(24, 6, 10, 4, 0, 0, Math.PI);
    ctx.fill();

    // 眼睛 - 发光红色
    ctx.fillStyle = '#FF4444';
    ctx.beginPath();
    ctx.arc(20, 12, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(28, 12, 4, 0, Math.PI * 2);
    ctx.fill();

    // 瞳孔
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(20, 13, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(28, 13, 2, 0, Math.PI * 2);
    ctx.fill();

    // 嘴巴
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(24, 22, 4, 0, Math.PI);
    ctx.fill();

    // 手臂
    ctx.fillStyle = '#8B0000';
    ctx.fillRect(32, 28, 12, 4);
    ctx.fillRect(32, 32, 10, 4);

    // 旗帜杆
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(6, 0, 4, 30);

    // 旗帜
    ctx.fillStyle = '#FF0000';
    ctx.beginPath();
    ctx.moveTo(10, 2);
    ctx.lineTo(26, 8);
    ctx.lineTo(10, 16);
    ctx.closePath();
    ctx.fill();

    canvas.refresh();
  }

  private createPea(textures: Phaser.Textures.TextureManager): void {
    const canvas = textures.createCanvas('pea', 20, 20);
    if (!canvas) return;
    const ctx = canvas.context;

    // 豌豆主体
    const gradient = ctx.createRadialGradient(8, 8, 0, 10, 10, 10);
    gradient.addColorStop(0, '#90EE90');
    gradient.addColorStop(0.5, '#32CD32');
    gradient.addColorStop(1, '#228B22');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(10, 10, 9, 0, Math.PI * 2);
    ctx.fill();

    // 高光
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
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
      const x = 20 + Math.cos(angle) * 16;
      const y = 20 + Math.sin(angle) * 16;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // 太阳主体
    const gradient = ctx.createRadialGradient(20, 20, 0, 20, 20, 14);
    gradient.addColorStop(0, '#FFFF00');
    gradient.addColorStop(0.7, '#FFD700');
    gradient.addColorStop(1, '#FFA500');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(20, 20, 12, 0, Math.PI * 2);
    ctx.fill();

    // 笑脸
    ctx.fillStyle = '#DAA520';
    ctx.beginPath();
    ctx.arc(16, 18, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(24, 18, 2, 0, Math.PI * 2);
    ctx.fill();

    // 嘴巴
    ctx.strokeStyle = '#DAA520';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(20, 22, 5, 0.2, Math.PI - 0.2);
    ctx.stroke();

    canvas.refresh();
  }
}
