import BossBase from './boss/BossBase.js';
import { SelfBurstAttack, GroundMarkAttack } from './boss/attacks.js';

// O Barão do Mercado (Fase 10) — braço mecânico (golpe de solo que não
// congela a perseguição) + Granada Suja no ponto travado do jogador.
export default class MarketBaronBoss extends BossBase {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, {
      hp: opts.hp || 1250,
      speed: opts.speed || 1.1,
      attackDamage: opts.attackDamage || 26,
      xpReward: opts.xpReward || 600,
      texture: opts.texture || 'boss_fence',
      name: opts.name || 'O BARÃO DO MERCADO',
      nameColor: '#e8b93d',
      auraTint: 0xe8b93d,
      onDeath: opts.onDeath,
      enrageSpeedMul: 1.35,
      enrageAttackMods: { cooldownMul: 0.6, damageMul: 1.25, extraCount: 1 }
    });

    this.addAttack(new SelfBurstAttack(this, {
      damage: 28, cooldown: 2800, maxRange: 1.8, radius: 1.5,
      telegraphMs: 400, tint: 0xe8b93d, lockMove: false, firstDelay: 900
    }));
    this.addAttack(new GroundMarkAttack(this, {
      damage: opts.grenadeDamage || 34, cooldown: 2800, maxRange: 7,
      telegraphMs: 600, radius: 1.4, tint: 0xe8b93d, style: 'burst',
      flash: [232, 185, 61], firstDelay: 700
    }));
  }
}
