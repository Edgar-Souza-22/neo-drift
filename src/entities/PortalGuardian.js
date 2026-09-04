import BossBase from './boss/BossBase.js';
import { SelfBurstAttack, ProjectileAttack } from './boss/attacks.js';
import { playSfx } from '../audio/AudioManager.js';

const TELEPORT_COOLDOWN = 5200;
const TELEPORT_TRIGGER_RANGE = 8;
const TELEPORT_MIN_DIST = 1.8;
const TELEPORT_MAX_DIST = 3;
const FADE_MS = 220;
const SUMMON_COOLDOWN = 7000;
const MAX_ACTIVE_ADDS = 2;
const SUMMON_SPAWN_DIST = 2.2;

// Guardião do Nexo (mini-chefe da Fase 07) — teleporta pra flanquear,
// explode ao reaparecer (melee), dispara do portal (ranged) e invoca
// Saltadores de Fase.
export default class PortalGuardian extends BossBase {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, {
      hp: opts.hp || 380,
      speed: opts.speed || 1.0,
      attackDamage: opts.attackDamage || 24,
      xpReward: opts.xpReward || 150,
      texture: opts.texture || 'enemy_portalguardian',
      hpBarWidth: 34,
      scale: 1.05,
      isMiniBoss: true,
      hasEnrage: false,
      name: opts.name || 'GUARDIÃO DO NEXO',
      nameColor: '#ff5fd0',
      nameOffset: 34,
      barOffset: 26,
      auraTint: 0xff5fd0,
      auraScale: 0.85,
      onDeath: opts.onDeath
    });
    this.spawnAdd = opts.spawnAdd || null;
    this.lastTeleportAt = -9999;
    this.lastSummonAt = -1800;
    this.activeAdds = [];

    this.burst = this.addAttack(new SelfBurstAttack(this, {
      damage: 22, cooldown: 900, maxRange: 8, radius: 1.4,
      telegraphMs: 320, tint: 0xff5fd0, lockMove: true,
      autoPick: false, firstDelay: 0
    }));
    this.addAttack(new ProjectileAttack(this, {
      damage: 12, cooldown: 2600, maxRange: 6.5, minRange: 1.0,
      speed: 4.2, tint: 0xff5fd0, windupMs: 180, firstDelay: 1000
    }));
  }

  _pickTeleportSpot(player) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = TELEPORT_MIN_DIST + Math.random() * (TELEPORT_MAX_DIST - TELEPORT_MIN_DIST);
      const gx = Math.round(player.gx + Math.cos(angle) * radius);
      const gy = Math.round(player.gy + Math.sin(angle) * radius);
      if (this.canOccupy(gx, gy)) return { gx, gy };
    }
    return null;
  }

  _tryTeleport(player) {
    if (this.busy) return;
    const now = this.scene.time.now;
    if (now - this.lastTeleportAt < TELEPORT_COOLDOWN) return;
    const dist = Math.hypot(player.gx - this.gx, player.gy - this.gy);
    if (dist > TELEPORT_TRIGGER_RANGE || dist < 0.1) return;
    const spot = this._pickTeleportSpot(player);
    if (!spot) return;

    this.lastTeleportAt = now;
    this.busy = true;
    if (this.auraRing) this.auraRing.setVisible(false);

    this.scene.tweens.add({
      targets: this.sprite, alpha: 0, scale: this.baseScale * 0.5, duration: FADE_MS, ease: 'Cubic.In',
      onComplete: () => {
        if (!this.alive) { this.busy = false; return; }
        this.gx = spot.gx;
        this.gy = spot.gy;
        const world = this.tileMap.gridToWorld(spot.gx, spot.gy);
        this.sprite.setPosition(world.x, world.y);
        this.sprite.setAlpha(1);
        this.sprite.setScale(this.baseScale);
        if (this.auraRing) { this.auraRing.setPosition(world.x, world.y); this.auraRing.setVisible(true); }
        playSfx(this.scene, 'sfx_door', { volume: 0.3 });
        this.burst.try(player, { force: true });
        this.busy = false;
      }
    });
  }

  _trySummon() {
    if (!this.spawnAdd) return;
    const now = this.scene.time.now;
    if (now - this.lastSummonAt < SUMMON_COOLDOWN) return;
    this.activeAdds = this.activeAdds.filter((add) => add.alive);
    if (this.activeAdds.length >= MAX_ACTIVE_ADDS) return;
    this.lastSummonAt = now;

    const count = Math.min(2, MAX_ACTIVE_ADDS - this.activeAdds.length);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const gx = Math.round(this.gx + Math.cos(angle) * SUMMON_SPAWN_DIST);
      const gy = Math.round(this.gy + Math.sin(angle) * SUMMON_SPAWN_DIST);
      if (!this.tileMap.isWalkable(gx, gy)) continue;

      const world = this.tileMap.gridToWorld(gx, gy);
      const flash = this.scene.add.image(world.x, world.y, 'light_pool')
        .setTint(0xff5fd0).setBlendMode(Phaser.BlendModes.ADD).setDepth(9000).setScale(0.7).setAlpha(0.9);
      this.scene.tweens.add({ targets: flash, alpha: 0, scale: 1.2, duration: 280, onComplete: () => flash.destroy() });

      const add = this.spawnAdd(gx, gy);
      if (add) this.activeAdds.push(add);
    }
    playSfx(this.scene, 'sfx_enrage', { volume: 0.3 });
  }

  update(deltaSec, player) {
    super.update(deltaSec, player);
    if (!this.alive || !player?.alive) return;
    if (!this.busy) {
      this._tryTeleport(player);
      this._trySummon();
    }
  }
}
