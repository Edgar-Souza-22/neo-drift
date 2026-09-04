import BossBase from './boss/BossBase.js';
import { ProjectileAttack, SelfBurstAttack } from './boss/attacks.js';

// Guardião Núcleo (Fase 01) — golpe de solo telegrafado + bolts com
// correção de curso. Na fúria os dois ataques podem sobrepor.
export default class Boss extends BossBase {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, {
      hp: opts.hp || 380,
      speed: opts.speed || 1.1,
      attackDamage: opts.attackDamage || 16,
      xpReward: opts.xpReward || 160,
      texture: opts.texture || 'boss',
      name: opts.name || 'GUARDIÃO NÚCLEO',
      nameColor: '#ffb347',
      auraTint: 0xff8a3d,
      onDeath: opts.onDeath,
      enrageAttackMods: { cooldownMul: 0.6, damageMul: 1.3, extraCount: 1 }
    });

    this.addAttack(new SelfBurstAttack(this, {
      damage: 18, cooldown: 3200, maxRange: 1.7, radius: 1.4,
      telegraphMs: 420, tint: 0xff8a3d, lockMove: true, firstDelay: 1100
    }));
    this.addAttack(new ProjectileAttack(this, {
      damage: opts.rangedDamage || 15, cooldown: 2000, maxRange: 6.5,
      minRange: 0.9, speed: 4.4, homing: 0.45, tint: 0xffb347,
      windupMs: 180, firstDelay: 700
    }));
  }
}
