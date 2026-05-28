import { describe, it, expect } from 'vitest';
import { Zombie } from '../entities/Zombie';
import type { ZombieEntity, ZombieState } from '../types';

function makeMockZombie(state: ZombieState = 'walking', x = 500): ZombieEntity {
  return {
    id: 'test',
    type: 'normal',
    position: { row: 0, col: 5 },
    hp: 100,
    maxHp: 100,
    state,
    targetPlant: null,
    lastAttackTime: 0,
    sprite: { x, getData: () => 0, setData: () => {} } as any,
    config: { id: 'normal', name: 'Normal', speed: 33.33, damage: 20, attackInterval: 1000, hp: 100 } as any,
  };
}

describe('Zombie.updatePosition', () => {
  it('walking状态向左移动', () => {
    const z = makeMockZombie('walking', 500);
    Zombie.updatePosition(z, 1000); // 1秒
    expect(z.sprite.x).toBeLessThan(500);
  });

  it('attacking状态不移动', () => {
    const z = makeMockZombie('attacking', 500);
    const x = z.sprite.x;
    Zombie.updatePosition(z, 1000);
    expect(z.sprite.x).toBe(x);
  });

  it('minX边界限制', () => {
    const z = makeMockZombie('walking', 100);
    Zombie.updatePosition(z, 1000, 80, 200); // minX=200
    expect(z.sprite.x).toBe(200);
  });

  it('dying状态不移动', () => {
    const z = makeMockZombie('dying', 500);
    const x = z.sprite.x;
    Zombie.updatePosition(z, 1000);
    expect(z.sprite.x).toBe(x);
  });
});