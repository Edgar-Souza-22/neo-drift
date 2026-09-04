import BossBase from './boss/BossBase.js';
import { SelfBurstAttack, ProjectileAttack } from './boss/attacks.js';
import { playSfx } from '../audio/AudioManager.js';

const TELEPORT_TELEGRAPH_MS = 500;
const FADE_MS = 260;
const SATELLITE_ORBIT_RADIUS = 1.6;
const SATELLITE_ORBIT_SPEED = 1.4;
const SATELLITE_COOLDOWN = 2800;
const TELEPORT_COOLDOWN = 4800;

// O Roteador (Fase 07) — ancorado, teleporta entre pontos fixos. Pulso
// corpo a corpo quando o jogador fecha, rajada em leque ao reaparecer e
// satélites atirando de verdade.
export default class RouterBoss extends BossBase {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, {
      hp: opts.hp || 1500,
      speed: opts.speed || 0.5,
      attackDamage: opts.attackDamage || 20,
      xpReward: opts.xpReward || 750,
      texture: opts.texture || 'boss_router',
      hpBarWidth: 52,
      scale: 1.1,
      name: opts.name || 'O ROTEADOR',
      nameColor: '#37f0ff',
      nameOffset: 52,
      barOffset: 40,
      auraTint: 0x37f0ff,
      auraScale: 1.3,
      anchored: true,
      onDeath: opts.onDeath,
      enrageMeleeMul: 1.3,
      enrageAttackMods: { cooldownMul: 0.65, damageMul: 1.2, extraCount: 2 }
    });

    this.anchors = (opts.anchors || []).filter((a) => this.tileMap.isWalkable(a.gx, a.gy));
    this.teleportCooldown = TELEPORT_COOLDOWN;
    this.lastTeleportAt = this.scene.time.now - TELEPORT_COOLDOWN + 1800;
    this.orbitAngle = 0;
    this.lastSatelliteAt = this.scene.time.now - SATELLITE_COOLDOWN + 1400;
    this.satelliteCooldown = SATELLITE_COOLDOWN;

    this.addAttack(new SelfBurstAttack(this, {
      damage: 24, cooldown: 2800, maxRange: 1.9, radius: 1.6,
      telegraphMs: 400, tint: 0x37f0ff, lockMove: true, firstDelay: 1100
    }));
    this.volley = this.addAttack(new ProjectileAttack(this, {
      damage: 11, cooldown: 2000, maxRange: 12, minRange: 0,
      count: 5, spreadDeg: 46, speed: 4.6, tint: 0x37f0ff,
      windupMs: 0, autoPick: false, firstDelay: 0
    }));
    this.satellite = this.addAttack(new ProjectileAttack(this, {
      damage: 9, cooldown: SATELLITE_COOLDOWN, maxRange: 10, minRange: 0.4,
      speed: 4.6, tint: 0xff5fd0, windupMs: 0, autoPick: false, firstDelay: 1400
    }));
  }

  onEnrage() {
    this.teleportCooldown = Math.round(TELEPORT_COOLDOWN * 0.65);
    this.satelliteCooldown = Math.round(SATELLITE_COOLDOWN * 0.6);
  }

  _pickAnchor() {
    if (!this.anchors.length) return null;
    const others = this.anchors.filter((a) => a.gx !== this.gx || a.gy !== this.gy);
    const pool = others.length ? others : this.anchors;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  _tryTeleport(player) {
    if (this.busy) return;
    const now = this.scene.time.now;
    if (now - this.lastTeleportAt < this.teleportCooldown) return;
    const anchor = this._pickAnchor();
    if (!anchor) return;
    this.lastTeleportAt = now;
    this.busy = true;
    if (this.auraRing) this.auraRing.setVisible(false);

    const fromWorld = this.tileMap.gridToWorld(this.gx, this.gy);
    const portalOut = this.scene.add.image(fromWorld.x, fromWorld.y, 'portal')
      .setDepth(9001).setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({
      targets: portalOut, angle: 180, scale: 0, duration: FADE_MS, ease: 'Cubic.In',
      onComplete: () => portalOut.destroy()
    });

    this.scene.tweens.add({
      targets: this.sprite, alpha: 0, scale: this.baseScale * 0.6, duration: FADE_MS, ease: 'Cubic.In',
      onComplete: () => {
        if (!this.alive) { this.busy = false; return; }
        this.gx = anchor.gx;
        this.gy = anchor.gy;
        const world = this.tileMap.gridToWorld(anchor.gx, anchor.gy);
        this.sprite.setPosition(world.x, world.y);
        this.sprite.setAlpha(1);
        this.sprite.setScale(this.baseScale);
        if (this.auraRing) { this.auraRing.setPosition(world.x, world.y); this.auraRing.setVisible(true); }
        playSfx(this.scene, 'sfx_door', { volume: 0.4 });

        const portalIn = this.scene.add.image(world.x, world.y, 'portal')
          .setDepth(9001).setBlendMode(Phaser.BlendModes.ADD).setScale(0);
        this.scene.tweens.add({
          targets: portalIn, scale: 1, alpha: 0, duration: TELEPORT_TELEGRAPH_MS,
          onComplete: () => portalIn.destroy()
        });

        this.scene.time.delayedCall(TELEPORT_TELEGRAPH_MS, () => {
          this.busy = false;
          if (this.alive && player.alive) this.volley.try(player, { force: true, skipWindup: true });
        });
      }
    });
  }

  _trySatelliteBarrage(player) {
    if (this.busy || !player?.alive) return;
    const now = this.scene.time.now;
    if (now - this.lastSatelliteAt < this.satelliteCooldown) return;
    this.lastSatelliteAt = now;

    for (const sign of [1, -1]) {
      const angle = this.orbitAngle + (sign > 0 ? 0 : Math.PI);
      const sx = this.gx + Math.cos(angle) * SATELLITE_ORBIT_RADIUS;
      const sy = this.gy + Math.sin(angle) * SATELLITE_ORBIT_RADIUS;
      const dx = player.gx - sx;
      const dy = player.gy - sy;
      this.satellite.fireFrom(sx, sy, Math.atan2(dy, dx), this.satellite.damage);
    }
    playSfx(this.scene, 'sfx_hit', { volume: 0.2 });
  }

  update(deltaSec, player) {
    this.orbitAngle += deltaSec * SATELLITE_ORBIT_SPEED;
    super.update(deltaSec, player);
    if (!this.alive || !player?.alive) return;
    if (!this.busy) {
      this._tryTeleport(player);
      this._trySatelliteBarrage(player);
    }
    if (this.auraRing && this.auraRing.visible) this.auraRing.angle -= deltaSec * 80;
  }
}
