import BossBase from './boss/BossBase.js';
import { SelfBurstAttack, ShoveAttack } from './boss/attacks.js';

// O Guincheiro — sub-confronto da Fase 14. Silhueta própria (enemy_guincheiro:
// capacete vermelho, carretel de cabo nas costas, gancho grande na corrente)
// — não reaproveita o Operário de Convés genérico. Guarda o Console
// Estabilizador: derrotá-lo constrói a única ponte até a arena da Perfuratriz
// (nasce incompleta — ver RefinariaScene._completeGateBridge). Golpe de solo
// + o mesmo empurrão de ShoveAttack que os inimigos grandes da fase já usam —
// aqui ainda mais perigoso, porque a área dele fica à beira d'água.
// Sem fúria — A Perfuratriz fecha a fase.
export default class GuincheiroBoss extends BossBase {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, {
      hp: opts.hp || 700,
      speed: opts.speed || 1.1,
      attackDamage: opts.attackDamage || 34,
      xpReward: opts.xpReward || 220,
      texture: opts.texture || 'enemy_guincheiro',
      hpBarWidth: 40,
      scale: 1.15,
      isMiniBoss: true,
      hasEnrage: false,
      ammoDropChance: opts.ammoDropChance ?? 0,
      name: opts.name || 'O GUINCHEIRO',
      nameColor: '#c23b3b',
      nameOffset: 36,
      barOffset: 34,
      auraTint: 0xc23b3b,
      auraScale: 0.95,
      onDeath: opts.onDeath
    });

    this.addAttack(new SelfBurstAttack(this, {
      damage: opts.slamDamage || 30, cooldown: 3000, maxRange: 1.85,
      radius: 1.5, telegraphMs: 460, tint: 0xc23b3b, lockMove: true, firstDelay: 800
    }));
    this.shove = this.addAttack(new ShoveAttack(this, {
      damage: opts.shoveDamage || 26, cooldown: 4200, maxRange: 2.3,
      reach: 2.1, arcDeg: 150, telegraphMs: 340,
      pushDistance: 3.4, pushMs: 260,
      tint: 0xc23b3b, flash: [194, 59, 59], firstDelay: 2200
    }));
  }
}
