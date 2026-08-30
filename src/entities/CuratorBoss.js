import Phaser from 'phaser';
import Enemy from './Enemy.js';
import { playSfx } from '../audio/AudioManager.js';

const ENRAGE_THRESHOLD = 0.35;
const TELEPORT_TRIGGER_RANGE = 7;
const TELEPORT_COOLDOWN = 5000;
const TELEPORT_MIN_DIST = 1.6;
const TELEPORT_MAX_DIST = 2.6;
const BURST_TELEGRAPH_MS = 350;
const BURST_RADIUS = 1.3;
const FADE_MS = 220;

// Chefe da Fase 05 "Curador Supremo" — diferente dos quatro anteriores
// (bolts homing / rajada telegrafada / raio em área / invocação de adds):
// some periodicamente e reaparece perto do jogador, telegrafa por um
// instante e libera uma explosão corpo a corpo em área — o jogador precisa
// reagir a um chefe que muda de posição de repente, em vez de prever a
// trajetória de um ataque parado.
export default class CuratorBoss extends Enemy {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, {
      hp: opts.hp || 820,
      speed: opts.speed || 1.1,
      attackDamage: opts.attackDamage || 22,
      xpReward: opts.xpReward || 420,
      texture: opts.texture || 'boss_curator',
      hpBarWidth: 46,
      scale: 1.15,
      onDeath: opts.onDeath
    });
    this.isBoss = true;
    this.baseSpeed = this.speed;
    this.baseAttackDamage = this.attackDamage;
    this.enraged = false;

    this.burstDamage = opts.burstDamage || 28;
    this.baseBurstDamage = this.burstDamage;
    this.teleportCooldown = TELEPORT_COOLDOWN;
    this.lastTeleportAt = -9999;
    this.teleporting = false;

    this.nameTag = this.scene.add.text(this.sprite.x, this.sprite.y - 44, opts.name || 'CURADOR SUPREMO', {
      fontFamily: 'Courier New',
      fontSize: '11px',
      color: '#8fc9ff'
    }).setOrigin(0.5).setDepth(9002);

    this.glowFx = this.sprite.preFX.addGlow(0x8fc9ff, 1.4, 0, false);

    this.auraRing = this.scene.add.image(this.sprite.x, this.sprite.y, 'boss_aura')
      .setBlendMode(Phaser.BlendModes.ADD).setTint(0x8fc9ff).setAlpha(0.55).setScale(1.15);
    this.scene.tweens.add({ targets: this.auraRing, scale: 1.35, alpha: 0.25, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
  }

  _enrage() {
    this.enraged = true;
    playSfx(this.scene, 'sfx_enrage', { volume: 0.55 });
    this.speed = this.baseSpeed * 1.4;
    this.attackDamage = Math.round(this.baseAttackDamage * 1.35);
    this.teleportCooldown = Math.round(TELEPORT_COOLDOWN * 0.6);
    this.burstDamage = Math.round(this.baseBurstDamage * 1.25);
    this.sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(150, () => this.alive && this.sprite.clearTint());
    this.scene.cameras.main.shake(220, 0.006);
    if (this.glowFx) this.glowFx.outerStrength = 2.6;
  }

  die() {
    this.scene.cameras.main.shake(260, 0.008);
    if (this.warnRing) { this.warnRing.destroy(); this.warnRing = null; }
    if (this.auraRing) { this.auraRing.destroy(); this.auraRing = null; }
    super.die();
  }

  _pickLandingSpot(player) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = TELEPORT_MIN_DIST + Math.random() * (TELEPORT_MAX_DIST - TELEPORT_MIN_DIST);
      const gx = Math.round(player.gx + Math.cos(angle) * radius);
      const gy = Math.round(player.gy + Math.sin(angle) * radius);
      if (this.tileMap.isWalkable(gx, gy)) return { gx, gy };
    }
    return null;
  }

  _tryTeleport(player) {
    if (this.teleporting) return;
    const now = this.scene.time.now;
    if (now - this.lastTeleportAt < this.teleportCooldown) return;
    // Sem isso, o cooldown (medido a partir de -9999) passa trivialmente no
    // primeiríssimo frame e o chefe teleporta pra perto do jogador na hora,
    // não importa a distância — escapando da própria câmara antes mesmo do
    // jogador chegar lá. Só teleporta se o jogador já estiver relativamente
    // perto (dentro da câmara ou bem próximo dela).
    const dist = Math.hypot(player.gx - this.gx, player.gy - this.gy);
    if (dist > TELEPORT_TRIGGER_RANGE || dist < 0.1) return;
    const spot = this._pickLandingSpot(player);
    if (!spot) return;
    this.lastTeleportAt = now;
    this.teleporting = true;

    // Some no local atual (a aura some junto, sem brigar com o tween
    // contínuo de pulso dela — só visibilidade, não alpha).
    if (this.auraRing) this.auraRing.setVisible(false);
    this.scene.tweens.add({
      targets: this.sprite, alpha: 0, scale: this.baseScale * 0.6, duration: FADE_MS, ease: 'Cubic.In',
      onComplete: () => {
        this.gx = spot.gx;
        this.gy = spot.gy;
        const world = this.tileMap.gridToWorld(spot.gx, spot.gy);
        this.sprite.setPosition(world.x, world.y);

        // Reaparece com um anel de aviso — dá uma fração de segundo pra
        // sair antes da explosão.
        this.sprite.setAlpha(1);
        this.sprite.setScale(this.baseScale);
        if (this.auraRing) { this.auraRing.setPosition(world.x, world.y); this.auraRing.setVisible(true); }
        playSfx(this.scene, 'sfx_door', { volume: 0.35 });
        this.warnRing = this.scene.add.image(world.x, world.y, 'light_pool')
          .setTint(0xff8ad0).setBlendMode(Phaser.BlendModes.ADD).setDepth(8999).setScale(0.9).setAlpha(0.75);
        this.scene.tweens.add({ targets: this.warnRing, alpha: 0.25, duration: 130, yoyo: true, repeat: -1 });

        this.scene.time.delayedCall(BURST_TELEGRAPH_MS, () => this._resolveBurst(player));
      }
    });
  }

  _resolveBurst(player) {
    if (this.warnRing) { this.warnRing.destroy(); this.warnRing = null; }
    this.teleporting = false;
    if (!this.alive) return;

    const world = this.tileMap.gridToWorld(this.gx, this.gy);
    const flash = this.scene.add.image(world.x, world.y, 'light_pool')
      .setTint(0xffffff).setBlendMode(Phaser.BlendModes.ADD).setDepth(9002).setScale(1.6).setAlpha(0.9);
    this.scene.tweens.add({ targets: flash, alpha: 0, scale: 2.4, duration: 220, onComplete: () => flash.destroy() });
    this.scene.cameras.main.shake(140, 0.005);

    if (player.alive) {
      const dist = Math.hypot(player.gx - this.gx, player.gy - this.gy);
      if (dist <= BURST_RADIUS) player.takeDamage(this.burstDamage);
    }
  }

  update(deltaSec, player) {
    if (!this.alive) {
      if (this.nameTag) {
        this.nameTag.destroy();
        this.nameTag = null;
      }
      if (this.warnRing) { this.warnRing.destroy(); this.warnRing = null; }
      if (this.auraRing) { this.auraRing.destroy(); this.auraRing = null; }
      return;
    }

    if (!this.enraged && this.hp / this.maxHp <= ENRAGE_THRESHOLD) {
      this._enrage();
    }

    if (!this.teleporting) {
      super.update(deltaSec, player);
    }
    this._tryTeleport(player);

    if (this.nameTag) {
      this.nameTag.setPosition(this.sprite.x, this.sprite.y - 46);
    }
    if (this.auraRing && this.auraRing.visible) {
      this.auraRing.setPosition(this.sprite.x, this.sprite.y);
      this.auraRing.setDepth(this.sprite.depth - 1);
      this.auraRing.angle += deltaSec * 45;
    }
    this.hpBarBg.setPosition(this.sprite.x, this.sprite.y - 34);
    this.hpBarFg.setPosition(this.sprite.x - this.barWidth / 2, this.sprite.y - 34);
    this.hpBarFg.width = this.barWidth * (this.hp / this.maxHp);
  }
}
