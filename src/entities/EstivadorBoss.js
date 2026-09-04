import BossBase from './boss/BossBase.js';
import { SelfBurstAttack, ProjectileAttack } from './boss/attacks.js';

// O Estivador — sub-confronto da Fase 13. Jaleco de cais e gancho: golpea
// o chão e arremessa um caixote lento. Sem fúria — O Empilhador fecha a
// fase. Controla o portão do Armazém, não a Doca.
export default class EstivadorBoss extends BossBase {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, {
      hp: opts.hp || 660,
      speed: opts.speed || 1.12,
      attackDamage: opts.attackDamage || 36,
      xpReward: opts.xpReward || 210,
      texture: opts.texture || 'enemy_estivador',
      hpBarWidth: 40,
      scale: 1.1,
      isMiniBoss: true,
      hasEnrage: false,
      ammoDropChance: opts.ammoDropChance ?? 0,
      name: opts.name || 'O ESTIVADOR',
      nameColor: '#e8923d',
      nameOffset: 36,
      barOffset: 34,
      auraTint: 0xe8923d,
      auraScale: 0.95,
      onDeath: opts.onDeath
    });

    this.addAttack(new SelfBurstAttack(this, {
      damage: opts.slamDamage || 32, cooldown: 3000, maxRange: 1.85,
      radius: 1.5, telegraphMs: 480, tint: 0xe8923d, lockMove: true, firstDelay: 800
    }));
    this.addAttack(new ProjectileAttack(this, {
      damage: 22, cooldown: 2400, maxRange: 6.4, minRange: 1.3,
      speed: 3.4, tint: 0xe8923d, texture: 'prop_crate', windupMs: 220, firstDelay: 1100
    }));
  }
}
