import BossBase from './boss/BossBase.js';
import { SelfBurstAttack, ProjectileAttack } from './boss/attacks.js';

// O Supervisor — sub-confronto da Fase 15. Guarda o interruptor mestre da
// Sala de Controle: derrotá-lo é o que abre o caminho até a Baía de
// Ativação Final. Mesmo padrão de qualquer sub-chefe da série (golpe de
// solo + disparo lento) — a dificuldade nova da fase fica pro chefe final,
// não pro guardião. Sem fúria.
export default class SupervisorBoss extends BossBase {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, {
      hp: opts.hp || 720,
      speed: opts.speed || 1.1,
      attackDamage: opts.attackDamage || 32,
      xpReward: opts.xpReward || 230,
      texture: opts.texture || 'enemy_supervisor',
      hpBarWidth: 40,
      scale: 1.1,
      isMiniBoss: true,
      hasEnrage: false,
      ammoDropChance: opts.ammoDropChance ?? 0,
      name: opts.name || 'O SUPERVISOR',
      nameColor: '#e8c23d',
      nameOffset: 36,
      barOffset: 34,
      auraTint: 0xe8c23d,
      auraScale: 0.95,
      onDeath: opts.onDeath
    });

    this.addAttack(new SelfBurstAttack(this, {
      damage: opts.slamDamage || 28, cooldown: 3000, maxRange: 1.85,
      radius: 1.5, telegraphMs: 460, tint: 0xe8c23d, lockMove: true, firstDelay: 800
    }));
    this.addAttack(new ProjectileAttack(this, {
      damage: 18, cooldown: 2500, maxRange: 6.2, minRange: 1.1,
      speed: 3.8, tint: 0xe8c23d, windupMs: 220, firstDelay: 1100
    }));
  }
}
