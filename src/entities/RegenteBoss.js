import BossBase from './boss/BossBase.js';
import { ProjectileAttack, ContainerDropAttack, GroundMarkAttack, DashChargeAttack, ShoveAttack } from './boss/attacks.js';
import StackerEnemy from './StackerEnemy.js';
import ShooterDrone from './ShooterDrone.js';
import { playSfx } from '../audio/AudioManager.js';

const SUMMON_COOLDOWN = 5200;
const MAX_CONCURRENT_REINFORCEMENTS = 2;
const SPAWN_RADIUS = 3;

// O Regente (Fase 16) — comanda toda a Torre de Controle Logístico, e por
// tabela toda a automação da Região 4: vira guindaste, esteira e braço
// robótico contra o jogador ao mesmo tempo. O chefe mais difícil da série
// até aqui — 5 padrões de ataque distintos (nenhum chefe anterior passa de
// 4) em 3 fases reais, no mesmo molde d'A Perfuratriz/O Protótipo:
//
//   1. PRESO (100%→65% HP): `anchored`, só ataques parados — canhão
//      (ProjectileAttack), guindaste (ContainerDropAttack) e marreta
//      (GroundMarkAttack "shell").
//   2. SOLTO (65%→35%): corta o próprio suporte, `anchored=false`, ganha
//      investida (DashChargeAttack) e soco de empurrão (ShoveAttack).
//   3. FURIOSO (<35%, limiar de fúria padrão de BossBase): reativa
//      Empilhadeiras e Drones Atiradores da própria Torre como reforço.
//
// A arena (Terraço de Comando) já mantém 2 braços robóticos fixos sempre
// ativos (ver TorreControleLayout `arms`, stationId 'terraco') — risco
// ambiental por cima dos 5 padrões de ataque.
export default class RegenteBoss extends BossBase {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, {
      hp: opts.hp || 2800,
      speed: opts.speed || 1.0,
      attackDamage: opts.attackDamage || 42,
      xpReward: opts.xpReward || 1400,
      texture: opts.texture || 'boss_regente',
      name: opts.name || 'O REGENTE',
      nameColor: '#ffb347',
      auraTint: 0xffb347,
      onDeath: opts.onDeath,
      anchored: true,
      enrageSpeedMul: 1.3,
      enrageAttackMods: { cooldownMul: 0.6, damageMul: 1.3 }
    });

    this.brokenFree = false;
    this.onEnemyDeath = opts.onDeath;
    this.lastSummonAt = -9999;

    this.cannon = this.addAttack(new ProjectileAttack(this, {
      damage: opts.cannonDamage || 22, cooldown: 2200, maxRange: 8, minRange: 0,
      count: 3, spreadDeg: 24, speed: 4.6, tint: 0xffb347, windupMs: 220, firstDelay: 700
    }));
    this.drop = this.addAttack(new ContainerDropAttack(this, {
      damage: opts.dropDamage || 30, cooldown: 3000, maxRange: 8,
      telegraphMs: 720, durationMs: 2000, tint: 0xffb347,
      flash: [255, 179, 71], firstDelay: 1400
    }));
    this.hammer = this.addAttack(new GroundMarkAttack(this, {
      damage: opts.hammerDamage || 32, cooldown: 2800, maxRange: 8,
      telegraphMs: 620, radius: 1.6, style: 'shell',
      tint: 0xffb347, flash: [255, 179, 71], firstDelay: 2000
    }));
    this.charge = this.addAttack(new DashChargeAttack(this, {
      damage: opts.chargeDamage || 40, cooldown: 4600, maxRange: 7,
      telegraphMs: 500, durationMs: 750, recoverMs: 700, speed: 6.4,
      hitRadius: 0.9, telegraphColor: 0xffb347, enabled: false, firstDelay: 0
    }));
    this.shove = this.addAttack(new ShoveAttack(this, {
      damage: opts.shoveDamage || 32, cooldown: 4200, maxRange: 2.4,
      reach: 2.2, arcDeg: 150, telegraphMs: 340, pushDistance: 3.2, pushMs: 260,
      tint: 0xffb347, flash: [255, 179, 71], enabled: false, firstDelay: 0
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

  _breakFree() {
    this.brokenFree = true;
    this.anchored = false;
    this.charge.enabled = true;
    this.shove.enabled = true;
    playSfx(this.scene, 'sfx_enrage', { volume: 0.5 });
    this.scene.cameras.main.shake(320, 0.01);
    this.scene.cameras.main.flash(160, 255, 200, 120);
    this.scene.game.events.emit('dialogue', 'O Regente se solta do console — a Torre inteira treme.');
  }

  _pickSpawnSpot() {
    for (let attempt = 0; attempt < 8; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 1.4 + Math.random() * SPAWN_RADIUS;
      const gx = Math.round(this.gx + Math.cos(angle) * radius);
      const gy = Math.round(this.gy + Math.sin(angle) * radius);
      if (this.tileMap.isWalkable(gx, gy)) return { gx, gy };
    }
    return null;
  }

  _countAliveReinforcements() {
    return this.scene.enemies.reduce((n, e) => n + (e.isTowerReinforcement && e.alive ? 1 : 0), 0);
  }

  _trySummonReinforcements() {
    const now = this.scene.time.now;
    if (now - this.lastSummonAt < SUMMON_COOLDOWN) return;
    if (this._countAliveReinforcements() >= MAX_CONCURRENT_REINFORCEMENTS) return;
    this.lastSummonAt = now;
    playSfx(this.scene, 'sfx_door', { volume: 0.35 });

    const kinds = [StackerEnemy, ShooterDrone];
    for (const Kind of kinds) {
      if (this._countAliveReinforcements() >= MAX_CONCURRENT_REINFORCEMENTS) break;
      const spot = this._pickSpawnSpot();
      if (!spot) continue;
      const reinforcement = new Kind(this.scene, this.tileMap, spot.gx, spot.gy, {
        hp: 100, xpReward: 32, onDeath: this.onEnemyDeath
      });
      reinforcement.isTowerReinforcement = true;
      this.scene.enemies.push(reinforcement);
    }
  }

  onEnrage() {
    this._trySummonReinforcements();
  }

  update(deltaSec, player) {
    super.update(deltaSec, player);
    if (!this.alive) return;
    if (!this.brokenFree && this.hp / this.maxHp <= 0.65) this._breakFree();
    if (this.enraged) this._trySummonReinforcements();
  }
}
