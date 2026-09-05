import BossBase from './boss/BossBase.js';
import { VacuumAttack, ProjectileAttack } from './boss/attacks.js';

// O Arquivista — sub-confronto da Fase 18, no Arquivo Vivo. Guarda o Selo de
// Contenção: derrotá-lo é o que libera a Planta C na Bancada, e portanto o
// Núcleo de Projeto.
//
// Papel de design: ENSINAR A SUCÇÃO. É o primeiro confronto da série que puxa
// o jogador em vez de empurrar, e o Arquivista usa isso sozinho, num espaço
// limpo, sem nada de perigoso ao redor pra onde ser arrastado. Quando O
// Projetista usar a mesma sucção com protótipos orbitando em volta dele, a
// leitura já vai estar aprendida — e aí sim ser puxado custa caro. Sem fúria,
// como todo sub-confronto da série.
export default class ArquivistaBoss extends BossBase {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, {
      hp: opts.hp || 980,
      speed: opts.speed || 1.15,
      attackDamage: opts.attackDamage || 34,
      xpReward: opts.xpReward || 280,
      texture: opts.texture || 'enemy_arquivista',
      hpBarWidth: 40,
      scale: 1.1,
      isMiniBoss: true,
      hasEnrage: false,
      ammoDropChance: opts.ammoDropChance ?? 0,
      name: opts.name || 'O ARQUIVISTA',
      nameColor: '#b37aff',
      nameOffset: 36,
      barOffset: 34,
      auraTint: 0xb37aff,
      auraScale: 0.95,
      onDeath: opts.onDeath
    });

    this.addAttack(new VacuumAttack(this, {
      damage: opts.pullDamage || 16, cooldown: 3600, reach: 5.5, minRange: 1.4,
      telegraphMs: 640, pullDistance: 3.0, pullMs: 300,
      tint: 0xb37aff, flash: [179, 122, 255], firstDelay: 900
    }));
    this.addAttack(new ProjectileAttack(this, {
      damage: opts.shotDamage || 22, cooldown: 2300, maxRange: 6.5, minRange: 1.0,
      speed: 4.2, tint: 0xb37aff, windupMs: 220, firstDelay: 1400
    }));
  }
}
