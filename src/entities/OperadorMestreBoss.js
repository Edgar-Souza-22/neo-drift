import BossBase from './boss/BossBase.js';
import { SelfBurstAttack, ContainerDropAttack } from './boss/attacks.js';

// O Operador Mestre — sub-confronto da Ala Oeste (Fase 16). Guarda a
// Câmara no fim do Corredor de Armadilhas/Sala de Sequência: derrotá-lo é
// metade da chave do portão selado até o Terraço de Comando (a outra
// metade é A Guardiã de Tráfego — os dois são obrigatórios, não um atalho
// opcional). Usa o mesmo ContainerDropAttack d'O Empilhador (Fase 13) —
// aqui ele de fato opera o guindaste da sala contra o jogador.
export default class OperadorMestreBoss extends BossBase {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, {
      hp: opts.hp || 780,
      speed: opts.speed || 1.1,
      attackDamage: opts.attackDamage || 34,
      xpReward: opts.xpReward || 240,
      texture: opts.texture || 'enemy_operador_mestre',
      hpBarWidth: 40,
      scale: 1.15,
      isMiniBoss: true,
      hasEnrage: false,
      ammoDropChance: opts.ammoDropChance ?? 0,
      name: opts.name || 'O OPERADOR MESTRE',
      nameColor: '#e8923d',
      nameOffset: 36,
      barOffset: 34,
      auraTint: 0xe8923d,
      auraScale: 0.95,
      onDeath: opts.onDeath
    });

    this.addAttack(new SelfBurstAttack(this, {
      damage: opts.slamDamage || 28, cooldown: 3000, maxRange: 1.85,
      radius: 1.5, telegraphMs: 460, tint: 0xe8923d, lockMove: true, firstDelay: 800
    }));
    this.addAttack(new ContainerDropAttack(this, {
      damage: opts.dropDamage || 32, cooldown: 2600, maxRange: 8,
      telegraphMs: 700, durationMs: 1900, tint: 0xe8923d,
      flash: [232, 146, 61], firstDelay: 1200
    }));
  }

  // Não fica travado pelos próprios contêineres que derruba.
  canOccupy(nx, ny) {
    const r = 0.3;
    const minX = Math.round(nx - r);
    const maxX = Math.round(nx + r);
    const minY = Math.round(ny - r);
    const maxY = Math.round(ny + r);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (this.tileMap.isWalkable(x, y)) continue;
        if (this.scene.isCargoDropCell?.(x, y)) continue;
        return false;
      }
    }
    return true;
  }
}
