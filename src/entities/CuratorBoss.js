import BossBase from './boss/BossBase.js';
import { SelfBurstAttack, ProjectileAttack } from './boss/attacks.js';
import { playSfx } from '../audio/AudioManager.js';

const TELEPORT_TRIGGER_RANGE = 7;
const TELEPORT_COOLDOWN = 5000;
const TELEPORT_MIN_DIST = 1.6;
const TELEPORT_MAX_DIST = 2.6;
const FADE_MS = 220;

// Curador Supremo (Fase 05) — teleporta pra perto, explode (melee) e
// dispara bolts prismáticos entre os saltos (ranged).
export default class CuratorBoss extends BossBase {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, {
      hp: opts.hp || 820,
      speed: opts.speed || 1.1,
      attackDamage: opts.attackDamage || 22,
      xpReward: opts.xpReward || 420,
      texture: opts.texture || 'boss_curator',
      name: opts.name || 'CURADOR SUPREMO',
      nameColor: '#8fc9ff',
      auraTint: 0x8fc9ff,
      onDeath: opts.onDeath,
      enrageAttackMods: { cooldownMul: 0.6, damageMul: 1.25, extraCount: 1 }
    });
    this.teleportCooldown = TELEPORT_COOLDOWN;
    this.lastTeleportAt = -9999;

    this.burst = this.addAttack(new SelfBurstAttack(this, {
      damage: opts.burstDamage || 28, cooldown: 800, maxRange: 8,
      radius: 1.3, telegraphMs: 350, tint: 0xff8ad0, lockMove: true,
      autoPick: false, firstDelay: 0
    }));
    this.addAttack(new ProjectileAttack(this, {
      damage: 16, cooldown: 2200, maxRange: 7, minRange: 1.1,
      count: 1, speed: 4.8, tint: 0x8fc9ff, windupMs: 160, firstDelay: 800
    }));
  }

  onEnrage() {
    this.teleportCooldown = Math.round(TELEPORT_COOLDOWN * 0.6);
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
    if (this.busy) return;
    const now = this.scene.time.now;
    if (now - this.lastTeleportAt < this.teleportCooldown) return;
    const dist = Math.hypot(player.gx - this.gx, player.gy - this.gy);
    if (dist > TELEPORT_TRIGGER_RANGE || dist < 0.1) return;
    const spot = this._pickLandingSpot(player);
    if (!spot) return;
    this.lastTeleportAt = now;
    this.busy = true;
    if (this.auraRing) this.auraRing.setVisible(false);

    this.scene.tweens.add({
      targets: this.sprite, alpha: 0, scale: this.baseScale * 0.6, duration: FADE_MS, ease: 'Cubic.In',
      onComplete: () => {
        if (!this.alive) { this.busy = false; return; }
        this.gx = spot.gx;
        this.gy = spot.gy;
        const world = this.tileMap.gridToWorld(spot.gx, spot.gy);
        this.sprite.setPosition(world.x, world.y);
        this.sprite.setAlpha(1);
        this.sprite.setScale(this.baseScale);
        if (this.auraRing) { this.auraRing.setPosition(world.x, world.y); this.auraRing.setVisible(true); }
        playSfx(this.scene, 'sfx_door', { volume: 0.35 });
        this.burst.try(player, { force: true });
        this.busy = false;
      }
    });
  }

  update(deltaSec, player) {
    super.update(deltaSec, player);
    if (this.alive && player?.alive) this._tryTeleport(player);
  }
}
