import BossBase from './boss/BossBase.js';
import { SelfBurstAttack, LingeringPoolAttack } from './boss/attacks.js';

// A Matriarca (Fase 11) — primeira criatura biológica de confronto do jogo
// (não robô, não veículo, não humana armada). Continua perseguindo enquanto
// telegrafa um charco na posição ATUAL do jogador; o charco FICA no chão e
// cobra tique — área de recusa, distinto da Granada Suja (impacto único) e
// do raio do Titã (também impacto único). Na fúria, dois charcos.
export default class MatriarchBoss extends BossBase {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, {
      hp: opts.hp || 1380,
      speed: opts.speed || 1.08,
      attackDamage: opts.attackDamage || 28,
      xpReward: opts.xpReward || 640,
      texture: opts.texture || 'boss_matriarch',
      name: opts.name || 'A MATRIARCA',
      nameColor: '#7dff6a',
      auraTint: 0x7dff6a,
      onDeath: opts.onDeath,
      enrageSpeedMul: 1.3,
      enrageAttackMods: { cooldownMul: 0.6, damageMul: 1.2, extraCount: 1 }
    });

    this.addAttack(new SelfBurstAttack(this, {
      damage: 30, cooldown: 2700, maxRange: 1.85, radius: 1.55,
      telegraphMs: 420, tint: 0x7dff6a, lockMove: false, firstDelay: 900
    }));
    this.addAttack(new LingeringPoolAttack(this, {
      damage: opts.poolDamage || 16, cooldown: 3000, maxRange: 7,
      telegraphMs: 700, lingerMs: 4500, radius: 1.35, tint: 0x6dff4a,
      flash: [110, 255, 80], firstDelay: 650
    }));
  }
}
