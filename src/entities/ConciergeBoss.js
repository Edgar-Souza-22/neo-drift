import BossBase from './boss/BossBase.js';
import { ShoveAttack, ProjectileAttack } from './boss/attacks.js';

// O Concierge — sub-confronto da Fase 17. Guarda a Antessala do Elevador:
// derrotá-lo é o que libera o Átrio Central. Não tem escudo (isso é da
// Diretora); o papel dele é ENSINAR o piso polido a doer — o empurrão manda
// o jogador deslizando pelo mármore da antessala, atravessando a linha de
// tiro, em vez de só afastar. Sem fúria, como todo sub-confronto da série.
export default class ConciergeBoss extends BossBase {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, {
      hp: opts.hp || 880,
      speed: opts.speed || 1.2,
      attackDamage: opts.attackDamage || 34,
      xpReward: opts.xpReward || 260,
      texture: opts.texture || 'enemy_concierge',
      hpBarWidth: 40,
      scale: 1.1,
      isMiniBoss: true,
      hasEnrage: false,
      ammoDropChance: opts.ammoDropChance ?? 0,
      name: opts.name || 'O CONCIERGE',
      nameColor: '#c9a24a',
      nameOffset: 36,
      barOffset: 34,
      auraTint: 0xc9a24a,
      auraScale: 0.95,
      onDeath: opts.onDeath
    });

    this.addAttack(new ShoveAttack(this, {
      damage: opts.shoveDamage || 30, cooldown: 3800, maxRange: 2.4,
      reach: 2.2, arcDeg: 150, telegraphMs: 360, pushDistance: 3.4, pushMs: 260,
      tint: 0xc9a24a, flash: [201, 162, 74], firstDelay: 800
    }));
    this.addAttack(new ProjectileAttack(this, {
      damage: opts.shotDamage || 20, cooldown: 2400, maxRange: 6.8, minRange: 1.2,
      speed: 4.2, tint: 0xc9a24a, windupMs: 220, firstDelay: 1200
    }));
  }
}
