import BossBase from './boss/BossBase.js';
import { SelfBurstAttack, GroundMarkAttack } from './boss/attacks.js';

// Titã Voltaico (Fase 03) — nunca para de perseguir: o pulso elétrico
// acompanha o corpo, e o raio marca a posição travada do jogador. Na fúria
// caem dois raios.
export default class ReactorBoss extends BossBase {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, {
      hp: opts.hp || 680,
      speed: opts.speed || 1.2,
      attackDamage: opts.attackDamage || 22,
      xpReward: opts.xpReward || 320,
      texture: opts.texture || 'boss_reactor',
      name: opts.name || 'TITÃ VOLTAICO',
      nameColor: '#7de8ff',
      auraTint: 0x37f0ff,
      onDeath: opts.onDeath,
      enrageSpeedMul: 1.45,
      enrageAttackMods: { cooldownMul: 0.6, damageMul: 1.25, extraCount: 1 }
    });

    this.addAttack(new SelfBurstAttack(this, {
      damage: 24, cooldown: 2800, maxRange: 1.9, radius: 1.55,
      telegraphMs: 400, tint: 0x37f0ff, lockMove: false, firstDelay: 900
    }));
    this.addAttack(new GroundMarkAttack(this, {
      damage: opts.strikeDamage || 24, cooldown: 2200, maxRange: 7.5,
      telegraphMs: 700, radius: 0.9, tint: 0xfff066, style: 'lightning',
      flash: [220, 240, 255], firstDelay: 600
    }));
  }
}
