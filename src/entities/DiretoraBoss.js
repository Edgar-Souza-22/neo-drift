import Phaser from 'phaser';
import BossBase from './boss/BossBase.js';
import { ProjectileAttack, GroundMarkAttack, DashChargeAttack, ShoveAttack } from './boss/attacks.js';
import ShieldGuard, { BLOCK_DAMAGE_MUL, isFrontalHit, turnToward } from './ShieldGuard.js';
import { playSfx } from '../audio/AudioManager.js';

const SHIELD_TURN_RATE = 1.5;
const SHIELD_BREAK_THRESHOLD = 0.6;

const SUMMON_COOLDOWN = 6000;
const MAX_CONCURRENT_ESCORT = 2;
const SPAWN_RADIUS = 3.4;

// A Diretora de Segurança (Fase 17) — segunda silhueta humana de confronto
// do jogo, depois d'O Barão do Mercado. O que ela tem de próprio é fechar o
// arco da fase: a mecânica que o Átrio inteiro ensinou (contornar o escudo
// do Guarda de Escudo) é literalmente a solução da primeira fase da luta.
//
//   1. ATRÁS DO ESCUDO (100%→60%): carrega o mesmo escudo de choque dos
//      guardas, com a MESMA regra de bloqueio frontal (ver ShieldGuard) —
//      só que gira ainda mais devagar. Bater de frente quase não tira HP;
//      o caminho é flanquear enquanto ela atira e marca o chão.
//   2. ESCUDO QUEBRADO (60%→35%): o escudo estilhaça (_breakShield) —
//      acaba o bloqueio, e ela passa a usar a investida COM o escudo como
//      aríete + o empurrão de perto, que no mármore polido do Átrio manda o
//      jogador deslizando.
//   3. FURIOSA (<35%, limiar padrão de BossBase): chama a escolta — Guardas
//      de Escudo de verdade, os mesmos da fase, agora ao redor dela.
export default class DiretoraBoss extends BossBase {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, {
      hp: opts.hp || 2700,
      speed: opts.speed || 1.15,
      attackDamage: opts.attackDamage || 42,
      xpReward: opts.xpReward || 1300,
      texture: opts.texture || 'boss_diretora',
      name: opts.name || 'A DIRETORA DE SEGURANÇA',
      nameColor: '#c9a24a',
      auraTint: 0xc9a24a,
      onDeath: opts.onDeath,
      enrageSpeedMul: 1.3,
      enrageAttackMods: { cooldownMul: 0.6, damageMul: 1.3 }
    });

    this.shieldUp = true;
    this.faceAngle = Math.PI / 2;
    this.shieldFx = null;
    this.onEnemyDeath = opts.onDeath;
    this.lastSummonAt = -9999;

    this.sidearm = this.addAttack(new ProjectileAttack(this, {
      damage: opts.shotDamage || 24, cooldown: 2100, maxRange: 8.5, minRange: 0,
      count: 2, spreadDeg: 14, speed: 5.0, tint: 0xc9a24a, windupMs: 200, firstDelay: 700
    }));
    this.stunGrenade = this.addAttack(new GroundMarkAttack(this, {
      damage: opts.grenadeDamage || 34, cooldown: 2800, maxRange: 8.5,
      telegraphMs: 600, radius: 1.7, style: 'shell',
      tint: 0xc9a24a, flash: [235, 205, 140], firstDelay: 1500
    }));
    this.ram = this.addAttack(new DashChargeAttack(this, {
      damage: opts.ramDamage || 40, cooldown: 4400, maxRange: 7.5,
      telegraphMs: 480, durationMs: 720, recoverMs: 640, speed: 6.4,
      hitRadius: 0.95, telegraphColor: 0xc9a24a, enabled: false, firstDelay: 0
    }));
    this.shove = this.addAttack(new ShoveAttack(this, {
      damage: opts.shoveDamage || 32, cooldown: 4000, maxRange: 2.5,
      reach: 2.3, arcDeg: 150, telegraphMs: 320, pushDistance: 3.6, pushMs: 260,
      tint: 0xc9a24a, flash: [235, 205, 140], enabled: false, firstDelay: 0
    }));
  }

  _updateShieldFx() {
    if (!this.shieldUp) return;
    if (!this.shieldFx) {
      this.shieldFx = this.scene.add.image(0, 0, 'fx_shield')
        .setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.8).setScale(1.35);
    }
    this.shieldFx.setPosition(
      this.sprite.x + Math.cos(this.faceAngle) * 18,
      this.sprite.y + Math.sin(this.faceAngle) * 18
    );
    this.shieldFx.setRotation(this.faceAngle);
    this.shieldFx.setDepth(this.sprite.depth + 1);
  }

  _destroyShieldFx() {
    if (this.shieldFx) { this.shieldFx.destroy(); this.shieldFx = null; }
  }

  _breakShield() {
    this.shieldUp = false;
    this._destroyShieldFx();
    this.ram.enabled = true;
    this.shove.enabled = true;
    playSfx(this.scene, 'sfx_enrage', { volume: 0.5 });
    this.scene.cameras.main.shake(300, 0.009);
    this.scene.cameras.main.flash(160, 235, 205, 140);
    this.scene.game.events.emit('dialogue', 'O escudo de choque estilhaça — agora ela usa o que sobrou dele como aríete.');
  }

  takeDamage(amount, fromGx, fromGy, knockbackMul = 1) {
    if (!this.alive) return false;
    if (this.shieldUp && isFrontalHit(this.faceAngle, this.gx, this.gy, fromGx, fromGy)) {
      playSfx(this.scene, 'sfx_hit', { volume: 0.2 });
      const world = this.tileMap.gridToWorld(this.gx, this.gy);
      const spark = this.scene.add.image(
        world.x + Math.cos(this.faceAngle) * 18,
        world.y + Math.sin(this.faceAngle) * 18,
        'particle'
      ).setTint(0xffe9b8).setBlendMode(Phaser.BlendModes.ADD).setDepth(9500).setScale(2);
      this.scene.tweens.add({ targets: spark, alpha: 0, scale: 0.5, duration: 240, onComplete: () => spark.destroy() });
      return super.takeDamage(
        Math.max(1, Math.round(amount * BLOCK_DAMAGE_MUL)),
        fromGx, fromGy, knockbackMul * 0.2
      );
    }
    return super.takeDamage(amount, fromGx, fromGy, knockbackMul);
  }

  _pickSpawnSpot() {
    for (let attempt = 0; attempt < 8; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 1.6 + Math.random() * SPAWN_RADIUS;
      const gx = Math.round(this.gx + Math.cos(angle) * radius);
      const gy = Math.round(this.gy + Math.sin(angle) * radius);
      if (this.tileMap.isWalkable(gx, gy)) return { gx, gy };
    }
    return null;
  }

  _countAliveEscort() {
    return this.scene.enemies.reduce((n, e) => n + (e.isDirectorEscort && e.alive ? 1 : 0), 0);
  }

  // A escolta não é um add genérico: são os MESMOS Guardas de Escudo da
  // fase, com o mesmo bloqueio frontal — quem não aprendeu a flanquear até
  // aqui apanha de dois lados ao mesmo tempo.
  _trySummonEscort() {
    const now = this.scene.time.now;
    if (now - this.lastSummonAt < SUMMON_COOLDOWN) return;
    if (this._countAliveEscort() >= MAX_CONCURRENT_ESCORT) return;
    this.lastSummonAt = now;
    playSfx(this.scene, 'sfx_door', { volume: 0.35 });

    while (this._countAliveEscort() < MAX_CONCURRENT_ESCORT) {
      const spot = this._pickSpawnSpot();
      if (!spot) break;
      const escort = new ShieldGuard(this.scene, this.tileMap, spot.gx, spot.gy, {
        hp: 120, attackDamage: 22, xpReward: 40, onDeath: this.onEnemyDeath
      });
      escort.isDirectorEscort = true;
      this.scene.enemies.push(escort);
    }
  }

  onEnrage() {
    this._trySummonEscort();
  }

  die() {
    this._destroyShieldFx();
    super.die();
  }

  update(deltaSec, player) {
    super.update(deltaSec, player);
    if (!this.alive) {
      this._destroyShieldFx();
      return;
    }
    if (this.shieldUp) {
      if (this.hp / this.maxHp <= SHIELD_BREAK_THRESHOLD) {
        this._breakShield();
      } else if (player?.alive) {
        const target = Math.atan2(player.gy - this.gy, player.gx - this.gx);
        this.faceAngle = turnToward(this.faceAngle, target, SHIELD_TURN_RATE, deltaSec);
        this._updateShieldFx();
      }
    }
    if (this.enraged) this._trySummonEscort();
  }
}
