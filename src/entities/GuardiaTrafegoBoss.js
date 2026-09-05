import BossBase from './boss/BossBase.js';
import { SelfBurstAttack, ShoveAttack } from './boss/attacks.js';

// A Guardiã de Tráfego — sub-confronto da Ala Leste (Fase 16). Guarda a
// Câmara no fim do Corredor de Esteiras/Sala de Circuito: a outra metade
// obrigatória da chave do portão do Terraço de Comando (ver
// OperadorMestreBoss). Controla o tráfego da própria esteira — o mesmo
// ShoveAttack de empurrão que O Guincheiro e os Operários de Convés da
// Refinaria já usam.
export default class GuardiaTrafegoBoss extends BossBase {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, {
      hp: opts.hp || 780,
      speed: opts.speed || 1.15,
      attackDamage: opts.attackDamage || 34,
      xpReward: opts.xpReward || 240,
      texture: opts.texture || 'enemy_guardia_trafego',
      hpBarWidth: 40,
      scale: 1.12,
      isMiniBoss: true,
      hasEnrage: false,
      ammoDropChance: opts.ammoDropChance ?? 0,
      name: opts.name || 'A GUARDIÃ DE TRÁFEGO',
      nameColor: '#8fe0ff',
      nameOffset: 36,
      barOffset: 34,
      auraTint: 0x8fe0ff,
      auraScale: 0.95,
      onDeath: opts.onDeath
    });

    this.addAttack(new SelfBurstAttack(this, {
      damage: opts.slamDamage || 26, cooldown: 2900, maxRange: 1.85,
      radius: 1.5, telegraphMs: 440, tint: 0x8fe0ff, lockMove: true, firstDelay: 800
    }));
    this.shove = this.addAttack(new ShoveAttack(this, {
      damage: opts.shoveDamage || 30, cooldown: 4000, maxRange: 2.3,
      reach: 2.1, arcDeg: 150, telegraphMs: 320, pushDistance: 3.4, pushMs: 260,
      tint: 0x8fe0ff, flash: [143, 224, 255], firstDelay: 2000
    }));
  }
}
