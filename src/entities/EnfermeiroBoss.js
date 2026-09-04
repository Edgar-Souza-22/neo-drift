import BossBase from './boss/BossBase.js';
import { SelfBurstAttack, ProjectileAttack } from './boss/attacks.js';

// O Enfermeiro — sub-chefe da Fase 11. Ainda se vê como cuidador: golpe de
// área (nuvem de desinfetante) + dardo tóxico. Sem fúria — A Matriarca
// fecha a fase.
export default class EnfermeiroBoss extends BossBase {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, {
      hp: opts.hp || 540,
      speed: opts.speed || 1.12,
      attackDamage: opts.attackDamage || 34,
      xpReward: opts.xpReward || 185,
      texture: opts.texture || 'enemy_enfermeiro',
      hpBarWidth: 40,
      scale: 1.1,
      isMiniBoss: true,
      hasEnrage: false,
      ammoDropChance: opts.ammoDropChance ?? 0,
      name: opts.name || 'O ENFERMEIRO',
      nameColor: '#7dff6a',
      nameOffset: 36,
      barOffset: 34,
      auraTint: 0x7dff6a,
      auraScale: 0.95,
      onDeath: opts.onDeath
    });

    this.addAttack(new SelfBurstAttack(this, {
      damage: opts.slamDamage || 28, cooldown: 3100, maxRange: 1.85,
      radius: 1.55, telegraphMs: 520, tint: 0x7dff6a, lockMove: true, firstDelay: 800
    }));
    this.addAttack(new ProjectileAttack(this, {
      damage: 18, cooldown: 2500, maxRange: 6.5, minRange: 1.2,
      speed: 4.1, tint: 0x7dff6a, windupMs: 200, firstDelay: 1100
    }));
  }
}
