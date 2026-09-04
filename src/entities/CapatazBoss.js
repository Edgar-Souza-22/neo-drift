import BossBase from './boss/BossBase.js';
import { SelfBurstAttack, ProjectileAttack } from './boss/attacks.js';

// Capataz do Mercado — sub-chefe da Fase 10. Golpe de solo telegrafado
// (melee) + sucata arremessada (ranged). Sem fúria: o Barão que fecha a fase.
export default class CapatazBoss extends BossBase {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, {
      hp: opts.hp || 480,
      speed: opts.speed || 1.15,
      attackDamage: opts.attackDamage || 32,
      xpReward: opts.xpReward || 170,
      texture: opts.texture || 'enemy_capataz',
      hpBarWidth: 40,
      scale: 1.1,
      isMiniBoss: true,
      hasEnrage: false,
      ammoDropChance: opts.ammoDropChance ?? 0,
      name: opts.name || 'CAPATAZ DO MERCADO',
      nameColor: '#c9a06a',
      nameOffset: 36,
      barOffset: 34,
      auraTint: 0xc9a06a,
      auraScale: 0.95,
      onDeath: opts.onDeath
    });

    this.addAttack(new SelfBurstAttack(this, {
      damage: opts.slamDamage || 26, cooldown: 3200, maxRange: 1.8,
      radius: 1.6, telegraphMs: 500, tint: 0xc9a06a, lockMove: true, firstDelay: 800
    }));
    this.addAttack(new ProjectileAttack(this, {
      damage: 16, cooldown: 2600, maxRange: 6.5, minRange: 1.2,
      speed: 4.0, tint: 0xc9a06a, windupMs: 200, firstDelay: 1100
    }));
  }
}
