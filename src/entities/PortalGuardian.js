import Phaser from 'phaser';
import Enemy from './Enemy.js';
import { playSfx } from '../audio/AudioManager.js';

const TELEPORT_COOLDOWN = 5200;
const TELEPORT_TRIGGER_RANGE = 8;
const TELEPORT_MIN_DIST = 1.8;
const TELEPORT_MAX_DIST = 3;
const FADE_MS = 220;

const SUMMON_COOLDOWN = 7000;
const MAX_ACTIVE_ADDS = 2;
const SUMMON_SPAWN_DIST = 2.2;

// Guardião do Nexo (mini-boss da Fase 07) — guarda a única entrada da
// Câmara do Roteador. Duas habilidades que nenhum semi-boss anterior tem (o
// Guardião do Cofre genérico é só um "muro de HP" sem ataque especial):
// teleporta pra flanquear o jogador (reposicionamento, não investida) e
// invoca Saltadores de Fase através de um portal. Ao morrer, derruba o
// Núcleo de Sincronia (ver NexusScene) que abre a arena do chefe final.
export default class PortalGuardian extends Enemy {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, {
      hp: opts.hp || 380,
      speed: opts.speed || 1.0,
      attackDamage: opts.attackDamage || 24,
      xpReward: opts.xpReward || 150,
      texture: opts.texture || 'enemy_portalguardian',
      hpBarWidth: 34,
      scale: 1.05,
      onDeath: opts.onDeath
    });
    this.isMiniBoss = true;

    // Callback fornecido pela cena — cria um PhaseJumper, registra em
    // scene.enemies e devolve a instância (ver NexusScene._spawnGuardianAdd).
    this.spawnAdd = opts.spawnAdd || null;

    this.lastTeleportAt = -9999;
    this.teleporting = false;
    this.lastSummonAt = -1800;
    this.activeAdds = [];

    this.nameTag = this.scene.add.text(this.sprite.x, this.sprite.y - 32, opts.name || 'GUARDIÃO DO NEXO', {
      fontFamily: 'Courier New',
      fontSize: '10px',
      color: '#ff5fd0'
    }).setOrigin(0.5).setDepth(9002);

    this.auraRing = this.scene.add.image(this.sprite.x, this.sprite.y, 'boss_aura')
      .setBlendMode(Phaser.BlendModes.ADD).setTint(0xff5fd0).setAlpha(0.5).setScale(0.85);
    this.scene.tweens.add({ targets: this.auraRing, scale: 1.0, alpha: 0.2, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
  }

  die() {
    if (this.nameTag) { this.nameTag.destroy(); this.nameTag = null; }
    if (this.auraRing) { this.auraRing.destroy(); this.auraRing = null; }
    super.die();
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
    if (this.teleporting) return;
    const now = this.scene.time.now;
    if (now - this.lastTeleportAt < TELEPORT_COOLDOWN) return;
    const dist = Math.hypot(player.gx - this.gx, player.gy - this.gy);
    if (dist > TELEPORT_TRIGGER_RANGE || dist < 0.1) return;
    const spot = this._pickTeleportSpot(player);
    if (!spot) return;

    this.lastTeleportAt = now;
    this.teleporting = true;
    if (this.auraRing) this.auraRing.setVisible(false);

    this.scene.tweens.add({
      targets: this.sprite,
      alpha: 0,
      scale: this.baseScale * 0.5,
      duration: FADE_MS,
      ease: 'Cubic.In',
      onComplete: () => {
        this.gx = spot.gx;
        this.gy = spot.gy;
        const world = this.tileMap.gridToWorld(spot.gx, spot.gy);
        this.sprite.setPosition(world.x, world.y);
        this.sprite.setAlpha(1);
        this.sprite.setScale(this.baseScale);
        if (this.auraRing) { this.auraRing.setPosition(world.x, world.y); this.auraRing.setVisible(true); }
        playSfx(this.scene, 'sfx_door', { volume: 0.3 });
        this.teleporting = false;
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
    if (!this.alive) {
      if (this.nameTag) { this.nameTag.destroy(); this.nameTag = null; }
      if (this.auraRing) { this.auraRing.destroy(); this.auraRing = null; }
      return;
    }

    if (!this.teleporting) {
      super.update(deltaSec, player);
      this._tryTeleport(player);
      this._trySummon();
    }

    if (this.nameTag) this.nameTag.setPosition(this.sprite.x, this.sprite.y - 34);
    if (this.auraRing && this.auraRing.visible) {
      this.auraRing.setPosition(this.sprite.x, this.sprite.y);
      this.auraRing.setDepth(this.sprite.depth - 1);
      this.auraRing.angle += deltaSec * 50;
    }
    this.hpBarBg.setPosition(this.sprite.x, this.sprite.y - 26);
    this.hpBarFg.setPosition(this.sprite.x - this.barWidth / 2, this.sprite.y - 26);
    this.hpBarFg.width = this.barWidth * (this.hp / this.maxHp);
  }
}
