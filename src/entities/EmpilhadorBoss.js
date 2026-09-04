import BossBase from './boss/BossBase.js';
import { SelfBurstAttack, ContainerDropAttack, ShoveAttack } from './boss/attacks.js';

// O Empilhador (Fase 13) — ponte rolante que anda. Continua perseguindo
// enquanto marca a posição ATUAL do jogador e deixa cair um contêiner
// (agora cai bem mais rápido: telégrafo curto): fere quem ficou e o caixote
// vira parede por uns segundos. De perto, dá um GOLPE DE GARRA que arremessa
// o jogador pra trás (ShoveAttack -> Player.pushBack). Distinto da linha de
// firewall do Administrador e do charco da Matriarca. Na fúria, cai um
// segundo contêiner e o empurrão vem mais seguido.
export default class EmpilhadorBoss extends BossBase {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, {
      hp: opts.hp || 1680,
      speed: opts.speed || 1.08,
      attackDamage: opts.attackDamage || 34,
      xpReward: opts.xpReward || 740,
      texture: opts.texture || 'boss_empilhador',
      name: opts.name || 'O EMPILHADOR',
      nameColor: '#e8923d',
      auraTint: 0xe8923d,
      onDeath: opts.onDeath,
      enrageSpeedMul: 1.28,
      enrageAttackMods: { cooldownMul: 0.7, damageMul: 1.2, extraCount: 1 }
    });

    this.addAttack(new SelfBurstAttack(this, {
      damage: 34, cooldown: 2800, maxRange: 1.9, radius: 1.55,
      telegraphMs: 420, tint: 0xe8923d, lockMove: false, firstDelay: 900
    }));
    // Golpe de garra que empurra — janela curta, alcance curto, cadência
    // espaçada: é o "sai de perto", não um ataque de rotina.
    this.shove = this.addAttack(new ShoveAttack(this, {
      damage: opts.shoveDamage || 32, cooldown: 4800, maxRange: 2.4,
      reach: 2.2, arcDeg: 150, telegraphMs: 340,
      pushDistance: 3.1, pushMs: 260,
      tint: 0xe8923d, flash: [232, 146, 61], firstDelay: 2600
    }));
    this.drop = this.addAttack(new ContainerDropAttack(this, {
      damage: opts.dropDamage || 28, cooldown: 2600, maxRange: 8,
      telegraphMs: 430, durationMs: 2000, tint: 0xe8923d,
      flash: [232, 146, 61], firstDelay: 700
    }));
  }

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
