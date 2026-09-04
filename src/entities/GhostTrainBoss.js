import Phaser from 'phaser';
import BossBase from './boss/BossBase.js';
import { DashChargeAttack, TelegraphBeamAttack } from './boss/attacks.js';
import { TILE_SIZE } from '../utils/constants.js';
import { playSfx } from '../audio/AudioManager.js';

const GHOST_TINT = 0xcfd6e0;
const TRAIL_INTERVAL_MS = 45;
const RAIL_TICK_COUNT = 6;
const PHASE_COOLDOWN = 6200;
const PHASE_DURATION_MS = 1700;
const PHASE_FADE_MS = 260;
const PHASE_RANGE_MIN = 3;
const PHASE_RANGE_MAX = 8;
const CHARGE_MAX_RANGE = 9;

// O Trem Fantasma (Fase 09) — investida travada nos eixos (melee) + farol
// em rajada no trilho (ranged) + fase intangível (sabotável).
export default class GhostTrainBoss extends BossBase {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, {
      hp: opts.hp || 1100,
      speed: opts.speed || 1.0,
      attackDamage: opts.attackDamage || 24,
      xpReward: opts.xpReward || 520,
      texture: opts.texture || 'boss_ghosttrain',
      hpBarWidth: 48,
      name: opts.name || 'O TREM FANTASMA',
      nameColor: '#cfd6e0',
      nameOffset: 48,
      auraTint: 0xcfd6e0,
      auraScale: 1.2,
      onDeath: opts.onDeath,
      enrageSpeedMul: 1.3,
      enrageAttackMods: { cooldownMul: 0.65, damageMul: 1.25 }
    });

    this.chargeTicks = [];
    this.lastTrailAt = -9999;
    this.phaseCooldown = PHASE_COOLDOWN;
    this.lastPhaseAt = -2500;
    this.phasing = false;
    this.phasingDisabled = false;

    this.beamGlow = this.scene.add.image(this.sprite.x, this.sprite.y, 'light_pool')
      .setBlendMode(Phaser.BlendModes.ADD).setTint(0xe8ffff).setAlpha(0).setDepth(8997);

    this.charge = this.addAttack(new DashChargeAttack(this, {
      damage: opts.chargeDamage || 40, cooldown: 3600,
      minRange: 1.8, maxRange: CHARGE_MAX_RANGE, telegraphMs: 650,
      durationMs: 950, recoverMs: 800, speed: 6.2, hitRadius: 0.8,
      telegraphColor: GHOST_TINT, axisLocked: true, railTolerance: 0.55,
      firstDelay: 1200,
      onTelegraph: (dash, { world, angle, lengthPx }) => {
        this._updateFacing(dash.dir.x, dash.dir.y);
        this.chargeTicks = [];
        for (let i = 1; i <= RAIL_TICK_COUNT; i++) {
          const t = i / (RAIL_TICK_COUNT + 1);
          const tick = this.scene.add.rectangle(
            world.x + Math.cos(angle) * lengthPx * t,
            world.y + Math.sin(angle) * lengthPx * t,
            4, 16, GHOST_TINT, 0.45
          ).setRotation(angle + Math.PI / 2).setDepth(8998).setBlendMode(Phaser.BlendModes.ADD);
          this.scene.tweens.add({ targets: tick, alpha: 0.1, duration: 100, delay: i * 40, yoyo: true, repeat: -1 });
          this.chargeTicks.push(tick);
        }
        this._spawnHitParticles(world.x, world.y, 6, 18, GHOST_TINT);
      },
      onChargeStart: () => this._clearTicks(),
      onChargeFrame: () => this._spawnGhostTrail(),
      onRecover: () => {
        this._clearTicks();
        const world = this.tileMap.gridToWorld(this.gx, this.gy);
        this._spawnHitParticles(world.x, world.y, 8, 24, GHOST_TINT);
        this.scene.cameras.main.shake(140, 0.006);
      }
    }));
    this.addAttack(new TelegraphBeamAttack(this, {
      damage: 28, cooldown: 3200, maxRange: 8, minRange: 2.0,
      chargeMs: 480, durationMs: 420, length: 8.5, halfWidth: 0.45,
      color: 0xe8ffff, flash: [220, 240, 255], axisLocked: true,
      railTolerance: 0.55, firstDelay: 1600
    }));

    this._updateFacing(1, 0);
  }

  disablePhasing() {
    this.phasingDisabled = true;
  }

  recallToArena() {
    if (!this.alive) return;
    this.scene.tweens.killTweensOf(this.sprite);
    this.charge.reset();
    this._clearTicks();
    this.phasing = false;
    this.busy = false;
    this.sprite.setAlpha(0.15);

    this.scene.time.delayedCall(80, () => {
      if (!this.alive) return;
      this.gx = this.spawn.gx;
      this.gy = this.spawn.gy;
      const world = this.tileMap.gridToWorld(this.gx, this.gy);
      this.sprite.setPosition(world.x, world.y);
      this.scene.tweens.add({ targets: this.sprite, alpha: 1, duration: 300, ease: 'Cubic.Out' });
      if (this.auraRing) { this.auraRing.setPosition(world.x, world.y); this.auraRing.setVisible(true); }
      playSfx(this.scene, 'sfx_door', { volume: 0.4 });
    });
  }

  _updateFacing(dx, dy) {
    if (Math.abs(dx) >= Math.abs(dy)) {
      this.sprite.setRotation(0);
      this.sprite.setFlipX(dx < 0);
    } else {
      this.sprite.setFlipX(false);
      this.sprite.setRotation(dy > 0 ? Math.PI / 2 : -Math.PI / 2);
    }
  }

  onEnrage() {
    this.phaseCooldown = Math.round(PHASE_COOLDOWN * 0.7);
  }

  takeDamage(amount, fromGx, fromGy, knockbackMul) {
    if (this.phasing) return false;
    return super.takeDamage(amount, fromGx, fromGy, knockbackMul);
  }

  die() {
    this._clearTicks();
    if (this.beamGlow) { this.beamGlow.destroy(); this.beamGlow = null; }
    super.die();
  }

  _clearTicks() {
    for (const tick of this.chargeTicks) tick.destroy();
    this.chargeTicks = [];
  }

  _tryStartPhase(player) {
    if (this.phasingDisabled || this.phasing || this._anyLocking()) return;
    const now = this.scene.time.now;
    if (now - this.lastPhaseAt < this.phaseCooldown) return;
    this.lastPhaseAt = now;
    this.phasing = true;
    this.busy = true;
    this.sprite.clearTint();
    if (this.auraRing) this.auraRing.setVisible(false);

    this.scene.tweens.add({
      targets: this.sprite, alpha: 0.22, duration: PHASE_FADE_MS, ease: 'Cubic.In',
      onComplete: () => {
        const spot = this._pickRailSpot(player) || { gx: this.gx, gy: this.gy };
        this.gx = spot.gx;
        this.gy = spot.gy;
        const world = this.tileMap.gridToWorld(this.gx, this.gy);
        this.sprite.setPosition(world.x, world.y);

        this.scene.time.delayedCall(PHASE_DURATION_MS, () => {
          if (!this.alive) return;
          this.scene.tweens.add({
            targets: this.sprite, alpha: 1, duration: PHASE_FADE_MS, ease: 'Cubic.Out',
            onComplete: () => {
              this.phasing = false;
              this.busy = false;
              if (this.auraRing) this.auraRing.setVisible(true);
              playSfx(this.scene, 'sfx_door', { volume: 0.35 });
            }
          });
        });
      }
    });
  }

  _pickRailSpot(player) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const alignRow = Math.random() < 0.5;
      const offset = (PHASE_RANGE_MIN + Math.random() * (PHASE_RANGE_MAX - PHASE_RANGE_MIN)) * (Math.random() < 0.5 ? 1 : -1);
      const gx = alignRow ? Phaser.Math.Clamp(Math.round(player.gx + offset), 0, this.tileMap.cols - 1) : Math.round(player.gx);
      const gy = alignRow ? Math.round(player.gy) : Phaser.Math.Clamp(Math.round(player.gy + offset), 0, this.tileMap.rows - 1);
      if (this.tileMap.isWalkable(gx, gy)) return { gx, gy };
    }
    return null;
  }

  _spawnGhostTrail() {
    const now = this.scene.time.now;
    if (now - this.lastTrailAt < TRAIL_INTERVAL_MS) return;
    this.lastTrailAt = now;
    const ghost = this.scene.add.image(this.sprite.x, this.sprite.y, this.sprite.texture.key)
      .setRotation(this.sprite.rotation).setFlipX(this.sprite.flipX)
      .setScale(this.sprite.scaleX, this.sprite.scaleY).setAlpha(0.32)
      .setTint(GHOST_TINT).setBlendMode(Phaser.BlendModes.ADD).setDepth(this.sprite.depth - 1);
    this.scene.tweens.add({
      targets: ghost, alpha: 0, scale: ghost.scaleX * 0.9, duration: 260, ease: 'Cubic.Out',
      onComplete: () => ghost.destroy()
    });
  }

  _updateBeamGlow() {
    if (!this.beamGlow) return;
    if (this.charge.state !== 'telegraph' && this.charge.state !== 'charging') {
      this.beamGlow.setAlpha(0);
      return;
    }
    const world = this.tileMap.gridToWorld(this.gx, this.gy);
    const angle = Math.atan2(this.charge.dir.y, this.charge.dir.x);
    const lengthPx = CHARGE_MAX_RANGE * TILE_SIZE;
    this.beamGlow.setPosition(world.x + Math.cos(angle) * lengthPx / 2, world.y + Math.sin(angle) * lengthPx / 2);
    this.beamGlow.setRotation(angle);
    this.beamGlow.setScale(lengthPx / 120, 0.4);
    const pulse = this.charge.state === 'telegraph' ? 0.5 + Math.sin(this.scene.time.now / 55) * 0.18 : 0.32;
    this.beamGlow.setAlpha(pulse);
  }

  update(deltaSec, player) {
    super.update(deltaSec, player);
    if (!this.alive) return;
    if (!this.phasing && player?.alive) this._tryStartPhase(player);
    if (this.charge.locking) this._updateFacing(this.charge.dir.x, this.charge.dir.y);
    else if (player?.alive) {
      const dx = player.gx - this.gx;
      const dy = player.gy - this.gy;
      if (Math.hypot(dx, dy) > 0.2) this._updateFacing(dx, dy);
    }
    this._updateBeamGlow();
  }
}
