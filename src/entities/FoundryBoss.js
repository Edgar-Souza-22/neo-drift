import BossBase from './boss/BossBase.js';
import { SelfBurstAttack, TelegraphBeamAttack } from './boss/attacks.js';

// Fundidor Primordial (Fase 02) — golpe de solo quando o jogador fecha,
// rajada vermelha telegrafada à distância. Fica parado nos dois ataques
// (janela de punição).
export default class FoundryBoss extends BossBase {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, {
      hp: opts.hp || 600,
      speed: opts.speed || 1.15,
      attackDamage: opts.attackDamage || 20,
      xpReward: opts.xpReward || 280,
      texture: opts.texture || 'boss_foundry',
      name: opts.name || 'FUNDIDOR PRIMORDIAL',
      nameColor: '#ff5a3d',
      auraTint: 0xffcf3d,
      onDeath: opts.onDeath,
      enrageAttackMods: { cooldownMul: 0.6, damageMul: 1.3 }
    });

    this.addAttack(new SelfBurstAttack(this, {
      damage: 22, cooldown: 3000, maxRange: 1.8, radius: 1.5,
      telegraphMs: 440, tint: 0xffcf3d, lockMove: true, firstDelay: 1000
    }));
    this.addAttack(new TelegraphBeamAttack(this, {
      damage: opts.beamDamage || 22, cooldown: 2600, maxRange: 6.5,
      minRange: 1.2, chargeMs: 500, durationMs: 500, length: 7.5,
      halfWidth: 0.5, color: 0xff1f3d, flash: [255, 60, 80], firstDelay: 800
    }));
  }
}
