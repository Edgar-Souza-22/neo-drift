import BossBase from './boss/BossBase.js';
import { SelfBurstAttack, FirewallSplitAttack } from './boss/attacks.js';

// O Administrador (Fase 12) — quem realmente roteava o contrabando do
// Submundo. Continua perseguindo enquanto parte a arena com um firewall:
// uma linha de tiles vira parede temporária (e fere quem ficou em cima).
// Distinto da Granada Suja (impacto único), do charco da Matriarca (poça
// persistente) e de qualquer invocação de reforços. Na fúria, a linha
// ganha a perpendicular — um cruzamento que encolhe o chão livre.
export default class AdministradorBoss extends BossBase {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, {
      hp: opts.hp || 1520,
      speed: opts.speed || 1.1,
      attackDamage: opts.attackDamage || 32,
      xpReward: opts.xpReward || 700,
      texture: opts.texture || 'boss_administrador',
      name: opts.name || 'O ADMINISTRADOR',
      nameColor: '#2ef0c8',
      auraTint: 0x2ef0c8,
      onDeath: opts.onDeath,
      enrageSpeedMul: 1.32,
      enrageAttackMods: { cooldownMul: 0.62, damageMul: 1.2, extraCount: 1 }
    });

    this.addAttack(new SelfBurstAttack(this, {
      damage: 32, cooldown: 2600, maxRange: 1.85, radius: 1.5,
      telegraphMs: 400, tint: 0x2ef0c8, lockMove: false, firstDelay: 900
    }));
    this.split = this.addAttack(new FirewallSplitAttack(this, {
      damage: opts.splitDamage || 22, cooldown: 3400, maxRange: 8,
      telegraphMs: 720, durationMs: 1800, tint: 0xff3d8a,
      flash: [255, 80, 160], firstDelay: 700,
      arena: opts.arena || { x1: 27, y1: 37, x2: 35, y2: 44 }
    }));
  }

  // A linha de firewall é parede pro jogador; O Administrador atravessa.
  canOccupy(nx, ny) {
    const r = 0.3;
    const minX = Math.round(nx - r);
    const maxX = Math.round(nx + r);
    const minY = Math.round(ny - r);
    const maxY = Math.round(ny + r);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (this.tileMap.isWalkable(x, y)) continue;
        if (this.scene.isFirewallCell?.(x, y)) continue;
        return false;
      }
    }
    return true;
  }
}
