import Phaser from 'phaser';
import Enemy from './Enemy.js';
import { playSfx } from '../audio/AudioManager.js';

const ENRAGE_THRESHOLD = 0.35;

// Investida (carga em linha reta) — padrão novo, nenhum chefe anterior se
// desloca rápido em linha reta: o Guardião atira bolts parado-ish, o
// Fundidor mira uma rajada mas fica no lugar, o Titã marca o chão, a Vigia
// invoca, o Curador teleporta. O Tanque é o único que FECHA distância dessa
// forma — precisa ler a direção travada no telegraph e sair da frente.
const RAM_MIN_RANGE = 1.6;
const RAM_MAX_RANGE = 7;
const RAM_COOLDOWN = 4200;
const RAM_TELEGRAPH_MS = 700;
const RAM_DURATION_MS = 900;
const RAM_SPEED = 5.5;
const RAM_HIT_RADIUS = 0.8;
const RAM_RECOVER_MS = 900;

// Bombardeio de canhão — mesmo esqueleto "marca o chão, telegrafa, explode"
// já usado pelo Titã Voltaico, mas bem mais lento/pesado (uma tacada só,
// não uma rajada) pra combinar com o ritmo de "peso" do tanque.
const SHELL_COOLDOWN = 3600;
const SHELL_TELEGRAPH_MS = 650;
const SHELL_RADIUS = 1.4;

// Chefe da Fase 06 "Tanque de Cerco" — o design mais diferente de todos:
// não é uma criatura/relíquia flutuante como os outros cinco, é um veículo
// blindado (silhueta larga e baixa, esteiras, torre giratória), com DOIS
// ataques novos (investida em linha reta / bombardeio de canhão) em vez de
// bolts, rajada, raio, invocação ou teleporte.
export default class TankBoss extends Enemy {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, {
      hp: opts.hp || 1300,
      speed: opts.speed || 0.65,
      attackDamage: opts.attackDamage || 26,
      xpReward: opts.xpReward || 600,
      texture: opts.texture || 'boss_tank',
      hpBarWidth: 52,
      scale: 1.2,
      onDeath: opts.onDeath
    });
    this.isBoss = true;
    this.baseSpeed = this.speed;
    this.baseAttackDamage = this.attackDamage;
    this.enraged = false;

    this.chargeDamage = opts.chargeDamage || 42;
    this.baseChargeDamage = this.chargeDamage;
    this.shellDamage = opts.shellDamage || 36;
    this.baseShellDamage = this.shellDamage;

    this.ramCooldown = RAM_COOLDOWN;
    this.shellCooldown = SHELL_COOLDOWN;
    this.lastRamAt = -9999;
    this.lastShellAt = -9999;
    this.ramState = 'idle'; // idle | telegraph | charging | recover
    this.ramStateUntil = 0;
    this.ramDir = { x: 0, y: 1 };
    this.ramHitPlayer = false;

    // Desativado pelo console da Sala de Controle de Artilharia (ver
    // ArsenalScene) — sabotagem opcional que tira o ataque mais punitivo da
    // luta antes mesmo dela começar.
    this.cannonDisabled = false;

    this.nameTag = this.scene.add.text(this.sprite.x, this.sprite.y - 46, opts.name || 'TANQUE DE CERCO', {
      fontFamily: 'Courier New',
      fontSize: '11px',
      color: '#9fff6a'
    }).setOrigin(0.5).setDepth(9002);

    this.auraRing = this.scene.add.image(this.sprite.x, this.sprite.y, 'boss_aura')
      .setBlendMode(Phaser.BlendModes.ADD).setTint(0x9fff6a).setAlpha(0.55).setScale(1.25);
    this.scene.tweens.add({ targets: this.auraRing, scale: 1.45, alpha: 0.25, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.InOut' });

    this.glowFx = this.sprite.preFX.addGlow(0x9fff6a, 1.4, 0, false);
  }

  _enrage() {
    this.enraged = true;
    playSfx(this.scene, 'sfx_enrage', { volume: 0.55 });
    this.speed = this.baseSpeed * 1.35;
    this.attackDamage = Math.round(this.baseAttackDamage * 1.3);
    this.chargeDamage = Math.round(this.baseChargeDamage * 1.25);
    this.shellDamage = Math.round(this.baseShellDamage * 1.25);
    this.ramCooldown = Math.round(RAM_COOLDOWN * 0.65);
    this.shellCooldown = Math.round(SHELL_COOLDOWN * 0.65);
    this.sprite.setTintFill(0x9fff6a);
    this.scene.time.delayedCall(150, () => this.alive && this.sprite.clearTint());
    this.scene.cameras.main.shake(220, 0.006);
    if (this.glowFx) this.glowFx.outerStrength = 2.6;
  }

  die() {
    this.scene.cameras.main.shake(300, 0.01);
    if (this.warnRing) { this.warnRing.destroy(); this.warnRing = null; }
    if (this.auraRing) { this.auraRing.destroy(); this.auraRing = null; }
    super.die();
  }

  // -------- investida --------

  _tryStartRam(player) {
    if (this.ramState !== 'idle') return;
    const now = this.scene.time.now;
    if (now - this.lastRamAt < this.ramCooldown) return;
    const dist = Math.hypot(player.gx - this.gx, player.gy - this.gy);
    if (dist < RAM_MIN_RANGE || dist > RAM_MAX_RANGE) return;
    this.lastRamAt = now;

    this.ramDir = { x: (player.gx - this.gx) / dist, y: (player.gy - this.gy) / dist };
    this.ramState = 'telegraph';
    this.ramStateUntil = now + RAM_TELEGRAPH_MS;
    this.ramHitPlayer = false;

    // Marca no chão a linha da investida — dá pra ler e sair da frente.
    const world = this.tileMap.gridToWorld(this.gx, this.gy);
    const angle = Math.atan2(this.ramDir.y, this.ramDir.x);
    const lengthPx = RAM_MAX_RANGE * 32;
    this.ramTelegraph = this.scene.add.rectangle(
      world.x + Math.cos(angle) * lengthPx / 2, world.y + Math.sin(angle) * lengthPx / 2,
      lengthPx, 10, 0x9fff6a, 0.35
    ).setRotation(angle).setDepth(8999).setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({ targets: this.ramTelegraph, alpha: 0.12, duration: 130, yoyo: true, repeat: -1 });
    playSfx(this.scene, 'sfx_enrage', { volume: 0.3 });
  }

  _updateRam(deltaSec, player) {
    const now = this.scene.time.now;

    if (this.ramState === 'telegraph') {
      if (now >= this.ramStateUntil) {
        this.ramState = 'charging';
        this.ramStateUntil = now + RAM_DURATION_MS;
        if (this.ramTelegraph) { this.ramTelegraph.destroy(); this.ramTelegraph = null; }
        this.scene.cameras.main.shake(120, 0.004);
      }
      return true;
    }

    if (this.ramState === 'charging') {
      const nx = this.gx + this.ramDir.x * RAM_SPEED * deltaSec;
      const ny = this.gy + this.ramDir.y * RAM_SPEED * deltaSec;
      let stopped = false;
      if (this.canOccupy(nx, this.gy)) this.gx = nx; else stopped = true;
      if (this.canOccupy(this.gx, ny)) this.gy = ny; else stopped = true;

      if (!this.ramHitPlayer && player.alive) {
        const dist = Math.hypot(player.gx - this.gx, player.gy - this.gy);
        if (dist <= RAM_HIT_RADIUS) {
          player.takeDamage(this.chargeDamage);
          this.ramHitPlayer = true;
          this.scene.cameras.main.shake(160, 0.007);
        }
      }

      if (stopped || now >= this.ramStateUntil) {
        this.ramState = 'recover';
        this.ramStateUntil = now + RAM_RECOVER_MS;
        this.sprite.setTintFill(0x5a6a4a);
      }
      return true;
    }

    if (this.ramState === 'recover') {
      if (now >= this.ramStateUntil) {
        this.ramState = 'idle';
        this.sprite.clearTint();
      }
      return true;
    }

    return false;
  }

  // -------- bombardeio de canhão --------

  // Chamado pelo console da Sala de Controle de Artilharia — sabota o
  // canhão pro resto da luta (não afeta a investida).
  disableCannon() {
    this.cannonDisabled = true;
  }

  _tryFireShell(player) {
    if (this.ramState !== 'idle' || this.cannonDisabled) return;
    const now = this.scene.time.now;
    if (now - this.lastShellAt < this.shellCooldown) return;
    this.lastShellAt = now;

    const targetGx = player.gx;
    const targetGy = player.gy;
    const world = this.tileMap.gridToWorld(targetGx, targetGy);
    const ring = this.scene.add.image(world.x, world.y, 'light_pool')
      .setTint(0xffb347).setDepth(8999).setBlendMode(Phaser.BlendModes.ADD).setScale(1.1).setAlpha(0.8);
    this.scene.tweens.add({ targets: ring, alpha: 0.3, duration: 140, yoyo: true, repeat: -1 });

    // Alvo de mira sobre o ponto exato do impacto — encolhe conforme o
    // telegraph avança, pra ficar claro (e mais justo) onde e quando o
    // canhão vai cair, já que é o golpe mais punitivo do chefe.
    const reticle = this.scene.add.image(world.x, world.y, 'target_reticle')
      .setTint(0xff6a3d).setDepth(9001).setBlendMode(Phaser.BlendModes.ADD).setScale(1.1).setAlpha(0.95);
    this.scene.tweens.add({ targets: reticle, angle: 90, scale: 0.55, duration: SHELL_TELEGRAPH_MS, ease: 'Cubic.In' });

    playSfx(this.scene, 'sfx_door', { volume: 0.35 });

    this.scene.time.delayedCall(SHELL_TELEGRAPH_MS, () => {
      ring.destroy();
      reticle.destroy();
      if (!this.alive) return;
      const flash = this.scene.add.image(world.x, world.y, 'light_pool')
        .setTint(0xffffff).setBlendMode(Phaser.BlendModes.ADD).setDepth(9002).setScale(1.8).setAlpha(0.95);
      this.scene.tweens.add({ targets: flash, alpha: 0, scale: 2.8, duration: 260, onComplete: () => flash.destroy() });
      this.scene.cameras.main.shake(200, 0.009);
      this.scene.cameras.main.flash(90, 255, 200, 140);

      if (player.alive) {
        const dist = Math.hypot(player.gx - targetGx, player.gy - targetGy);
        if (dist <= SHELL_RADIUS) player.takeDamage(this.shellDamage);
      }
    });
  }

  update(deltaSec, player) {
    if (!this.alive) {
      if (this.nameTag) { this.nameTag.destroy(); this.nameTag = null; }
      if (this.ramTelegraph) { this.ramTelegraph.destroy(); this.ramTelegraph = null; }
      return;
    }

    if (!this.enraged && this.hp / this.maxHp <= ENRAGE_THRESHOLD) {
      this._enrage();
    }

    const ramActive = this._updateRam(deltaSec, player);
    if (!ramActive) {
      super.update(deltaSec, player);
      this._tryStartRam(player);
      this._tryFireShell(player);
    } else if (this.ramState === 'charging') {
      // Posição/depth/hp-bar não são atualizados por super.update() durante
      // a investida (ela move gx/gy manualmente) — replica só o necessário.
      const world = this.tileMap.gridToWorld(this.gx, this.gy);
      this.sprite.setPosition(world.x, world.y);
      this.sprite.setDepth(Math.round(this.gy) * 10 + 4);
    }

    if (this.nameTag) {
      this.nameTag.setPosition(this.sprite.x, this.sprite.y - 48);
    }
    if (this.auraRing) {
      this.auraRing.setPosition(this.sprite.x, this.sprite.y);
      this.auraRing.setDepth(this.sprite.depth - 1);
      this.auraRing.angle += deltaSec * 40;
    }
    this.hpBarBg.setPosition(this.sprite.x, this.sprite.y - 36);
    this.hpBarFg.setPosition(this.sprite.x - this.barWidth / 2, this.sprite.y - 36);
    this.hpBarFg.width = this.barWidth * (this.hp / this.maxHp);
  }
}
