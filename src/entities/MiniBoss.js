import BossBase from './boss/BossBase.js';
import { SelfBurstAttack, ProjectileAttack } from './boss/attacks.js';

// Semi-chefe genérico (guardião de cofre/sala). Deixou de ser só um muro
// de HP: golpe de solo telegrafado + disparo lento. Sem fúria — o confronto
// de fase é que escala.
export default class MiniBoss extends BossBase {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, {
      hp: opts.hp || 240,
      speed: opts.speed || 1.05,
      attackDamage: opts.attackDamage || 22,
      xpReward: opts.xpReward || 90,
      texture: opts.texture || 'enemy_miniboss',
      hpBarWidth: 36,
      scale: 1.05,
      isMiniBoss: true,
      hasEnrage: false,
      ammoDropChance: opts.ammoDropChance ?? 0,
      name: opts.name || 'GUARDIÃO DO COFRE',
      nameColor: '#ffd27a',
      nameOffset: 32,
      barOffset: 26,
      auraTint: 0xffd27a,
      auraScale: 0.9,
      onDeath: opts.onDeath
    });

    this.addAttack(new SelfBurstAttack(this, {
      damage: 20, cooldown: 3400, maxRange: 1.7, radius: 1.4,
      telegraphMs: 480, tint: 0xffd27a, lockMove: true, firstDelay: 900
    }));
    this.addAttack(new ProjectileAttack(this, {
      damage: 12, cooldown: 2800, maxRange: 5.5, minRange: 1.1,
      speed: 3.8, tint: 0xffd27a, windupMs: 220, firstDelay: 1200
    }));
  }
}
