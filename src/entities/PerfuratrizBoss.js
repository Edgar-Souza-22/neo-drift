import BossBase from './boss/BossBase.js';
import { ShoveAttack, GroundMarkAttack } from './boss/attacks.js';

// A Perfuratriz (Fase 14) — corpo de torre de perfuração ambulante. A arena
// dela fica na borda da Plataforma do Núcleo, com água exposta logo atrás:
// o GOLPE DE EMPURRÃO (ShoveAttack -> Player.pushBack) é a ameaça real da
// luta, distinto dos chefes anteriores que só arremessavam pra abrir
// distância — aqui pode jogar o jogador direto no mar. O golpe de broca
// (GroundMarkAttack "shell") marca o chão e telegrafa antes de descer. Na
// fúria, o empurrão vem mais forte e mais seguido.
export default class PerfuratrizBoss extends BossBase {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, {
      hp: opts.hp || 1760,
      speed: opts.speed || 1.05,
      attackDamage: opts.attackDamage || 36,
      xpReward: opts.xpReward || 780,
      texture: opts.texture || 'boss_perfuratriz',
      name: opts.name || 'A PERFURATRIZ',
      nameColor: '#2f6fa8',
      auraTint: 0x2f6fa8,
      onDeath: opts.onDeath,
      enrageSpeedMul: 1.25,
      enrageAttackMods: { cooldownMul: 0.68, damageMul: 1.2 }
    });

    this.shove = this.addAttack(new ShoveAttack(this, {
      damage: opts.shoveDamage || 36, cooldown: 4000, maxRange: 2.4,
      reach: 2.2, arcDeg: 160, telegraphMs: 360,
      pushDistance: 3.6, pushMs: 260,
      tint: 0x2f6fa8, flash: [80, 160, 220], firstDelay: 1600
    }));
    this.drill = this.addAttack(new GroundMarkAttack(this, {
      damage: opts.drillDamage || 30, cooldown: 2800, maxRange: 8,
      telegraphMs: 620, radius: 1.5, style: 'shell',
      tint: 0x2f6fa8, flash: [80, 160, 220], firstDelay: 900
    }));
  }
}
