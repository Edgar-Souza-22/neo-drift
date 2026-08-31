import Phaser from 'phaser';
import Enemy from './Enemy.js';
import { playSfx } from '../audio/AudioManager.js';

const ENRAGE_THRESHOLD = 0.35;

// Teleporte por âncora + rajada — padrão novo, nenhum chefe anterior fica
// PARADO entre ataques: o Guardião atira andando, o Fundidor telegrafa mas
// persegue, o Titã marca o chão andando, a Vigia invoca, o Curador teleporta
// pra PERTO do jogador, o Tanque investe em linha reta. O Roteador é o único
// que fica ancorado num ponto fixo da arena e só troca de posição em saltos
// (não perseguição), disparando uma rajada em leque ao reaparecer.
const TELEPORT_TELEGRAPH_MS = 500;
const FADE_MS = 260;
const VOLLEY_COUNT = 5;
const VOLLEY_SPREAD_DEG = 46;

// Satélites orbitais — cada um atira de verdade (ver boss_router em
// BootScene.js, onde eles já aparecem "presos" na textura), criando um
// padrão de fogo cruzado vindo de dois ângulos opostos ao mesmo tempo.
const SATELLITE_ORBIT_RADIUS = 1.6;
const SATELLITE_ORBIT_SPEED = 1.4; // rad/s

const BOLT_SPEED = 4.6;
const BOLT_LIFETIME = 2200;
const BOLT_HIT_RADIUS = 0.42;
const BOLT_DAMAGE = 11;
const SATELLITE_BOLT_DAMAGE = 9;

const TELEPORT_COOLDOWN = 4800;
const SATELLITE_COOLDOWN = 3200;

// Chefe final da Fase 07 "O Roteador" — encerra o arco do Distrito Neon.
// Design mais diferente de todos: nem criatura/relíquia flutuante, nem
// veículo — um núcleo geométrico abstrato ancorado, que troca de posição
// por teleporte em vez de perseguir o jogador.
export default class RouterBoss extends Enemy {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, {
      hp: opts.hp || 1500,
      isBoss: true,
      speed: opts.speed || 0.5,
      attackDamage: opts.attackDamage || 20,
      xpReward: opts.xpReward || 750,
      texture: opts.texture || 'boss_router',
      hpBarWidth: 52,
      scale: 1.1,
      onDeath: opts.onDeath
    });
    this.isBoss = true;
    this.baseAttackDamage = this.attackDamage;
    this.enraged = false;

    this.anchors = (opts.anchors || []).filter((a) => this.tileMap.isWalkable(a.gx, a.gy));
    this.teleportCooldown = TELEPORT_COOLDOWN;
    this.satelliteCooldown = SATELLITE_COOLDOWN;
    // Dá um respiro antes do primeiro teleporte/rajada, pra não abrir a luta
    // com um ataque instantâneo assim que a câmara termina de carregar.
    this.lastTeleportAt = -2000;
    this.lastSatelliteAt = -1000;
    this.teleporting = false;
    this.orbitAngle = 0;
    this.bolts = [];

    this.nameTag = this.scene.add.text(this.sprite.x, this.sprite.y - 50, opts.name || 'O ROTEADOR', {
      fontFamily: 'Courier New',
      fontSize: '11px',
      color: '#37f0ff'
    }).setOrigin(0.5).setDepth(9002);

    this.auraRing = this.scene.add.image(this.sprite.x, this.sprite.y, 'boss_aura')
      .setBlendMode(Phaser.BlendModes.ADD).setTint(0x37f0ff).setAlpha(0.55).setScale(1.3);
    this.scene.tweens.add({ targets: this.auraRing, scale: 1.5, alpha: 0.25, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.InOut' });

    this.glowFx = this.sprite.preFX.addGlow(0x37f0ff, 1.4, 0, false);
  }

  _enrage() {
    this.enraged = true;
    playSfx(this.scene, 'sfx_enrage', { volume: 0.55 });
    this.teleportCooldown = Math.round(TELEPORT_COOLDOWN * 0.65);
    this.satelliteCooldown = Math.round(SATELLITE_COOLDOWN * 0.6);
    this.attackDamage = Math.round(this.baseAttackDamage * 1.3);
    this.sprite.setTintFill(0x37f0ff);
    this.scene.time.delayedCall(150, () => this.alive && this.sprite.clearTint());
    this.scene.cameras.main.shake(220, 0.006);
    if (this.glowFx) this.glowFx.outerStrength = 2.6;
  }

  die() {
    this.scene.cameras.main.shake(320, 0.011);
    for (const bolt of this.bolts) bolt.sprite.destroy();
    this.bolts = [];
    if (this.auraRing) { this.auraRing.destroy(); this.auraRing = null; }
    super.die();
  }

  _pickAnchor() {
    if (!this.anchors.length) return null;
    const others = this.anchors.filter((a) => a.gx !== this.gx || a.gy !== this.gy);
    const pool = others.length ? others : this.anchors;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  _fireVolley(player) {
    const dx = player.gx - this.gx;
    const dy = player.gy - this.gy;
    const baseAngle = Math.atan2(dy, dx);
    const count = this.enraged ? VOLLEY_COUNT + 2 : VOLLEY_COUNT;
    const spreadRad = Phaser.Math.DegToRad(VOLLEY_SPREAD_DEG);
    const world = this.tileMap.gridToWorld(this.gx, this.gy);

    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      const angle = baseAngle - spreadRad / 2 + spreadRad * t;
      const sprite = this.scene.add.image(world.x, world.y, 'bolt').setDepth(9000).setBlendMode(Phaser.BlendModes.ADD).setTint(0x37f0ff);
      this.bolts.push({
        gx: this.gx, gy: this.gy,
        vx: Math.cos(angle) * BOLT_SPEED, vy: Math.sin(angle) * BOLT_SPEED,
        damage: BOLT_DAMAGE, sprite, bornAt: this.scene.time.now
      });
    }
    playSfx(this.scene, 'sfx_door', { volume: 0.3 });
  }

  _tryTeleport(player) {
    if (this.teleporting) return;
    const now = this.scene.time.now;
    if (now - this.lastTeleportAt < this.teleportCooldown) return;
    const anchor = this._pickAnchor();
    if (!anchor) return;
    this.lastTeleportAt = now;
    this.teleporting = true;
    if (this.auraRing) this.auraRing.setVisible(false);

    const fromWorld = this.tileMap.gridToWorld(this.gx, this.gy);
    const portalOut = this.scene.add.image(fromWorld.x, fromWorld.y, 'portal').setDepth(9001).setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({ targets: portalOut, angle: 180, scale: 0, duration: FADE_MS, ease: 'Cubic.In', onComplete: () => portalOut.destroy() });

    this.scene.tweens.add({
      targets: this.sprite,
      alpha: 0,
      scale: this.baseScale * 0.6,
      duration: FADE_MS,
      ease: 'Cubic.In',
      onComplete: () => {
        this.gx = anchor.gx;
        this.gy = anchor.gy;
        const world = this.tileMap.gridToWorld(anchor.gx, anchor.gy);
        this.sprite.setPosition(world.x, world.y);
        this.sprite.setAlpha(1);
        this.sprite.setScale(this.baseScale);
        if (this.auraRing) { this.auraRing.setPosition(world.x, world.y); this.auraRing.setVisible(true); }
        playSfx(this.scene, 'sfx_door', { volume: 0.4 });

        const portalIn = this.scene.add.image(world.x, world.y, 'portal').setDepth(9001).setBlendMode(Phaser.BlendModes.ADD).setScale(0);
        this.scene.tweens.add({ targets: portalIn, scale: 1, alpha: 0, duration: TELEPORT_TELEGRAPH_MS, onComplete: () => portalIn.destroy() });

        this.scene.time.delayedCall(TELEPORT_TELEGRAPH_MS, () => {
          this.teleporting = false;
          if (this.alive && player.alive) this._fireVolley(player);
        });
      }
    });
  }

  _trySatelliteBarrage(player) {
    if (this.teleporting) return;
    const now = this.scene.time.now;
    if (now - this.lastSatelliteAt < this.satelliteCooldown) return;
    if (!player.alive) return;
    this.lastSatelliteAt = now;

    for (const sign of [1, -1]) {
      const angle = this.orbitAngle + (sign > 0 ? 0 : Math.PI);
      const sx = this.gx + Math.cos(angle) * SATELLITE_ORBIT_RADIUS;
      const sy = this.gy + Math.sin(angle) * SATELLITE_ORBIT_RADIUS;
      const world = this.tileMap.gridToWorld(sx, sy);
      const dx = player.gx - sx;
      const dy = player.gy - sy;
      const dist = Math.hypot(dx, dy) || 1;
      const sprite = this.scene.add.image(world.x, world.y, 'bolt').setDepth(9000).setBlendMode(Phaser.BlendModes.ADD).setTint(0xff5fd0);
      this.bolts.push({
        gx: sx, gy: sy,
        vx: (dx / dist) * BOLT_SPEED, vy: (dy / dist) * BOLT_SPEED,
        damage: SATELLITE_BOLT_DAMAGE, sprite, bornAt: now
      });
    }
    playSfx(this.scene, 'sfx_hit', { volume: 0.2 });
  }

  _updateBolts(deltaSec, player) {
    const now = this.scene.time.now;
    this.bolts = this.bolts.filter((bolt) => {
      bolt.gx += bolt.vx * deltaSec;
      bolt.gy += bolt.vy * deltaSec;

      const expired = now - bolt.bornAt > BOLT_LIFETIME;
      const hitWall = !this.tileMap.isWalkable(Math.round(bolt.gx), Math.round(bolt.gy));
      const distToPlayer = Math.hypot(player.gx - bolt.gx, player.gy - bolt.gy);
      const hitPlayer = player.alive && distToPlayer <= BOLT_HIT_RADIUS;

      if (hitPlayer) player.takeDamage(bolt.damage);

      if (expired || hitWall || hitPlayer) {
        bolt.sprite.destroy();
        return false;
      }

      const world = this.tileMap.gridToWorld(bolt.gx, bolt.gy);
      bolt.sprite.setPosition(world.x, world.y);
      bolt.sprite.setDepth(Math.round(bolt.gy) * 10 + 6);
      return true;
    });
  }

  update(deltaSec, player) {
    if (!this.alive) {
      if (this.nameTag) { this.nameTag.destroy(); this.nameTag = null; }
      if (this.auraRing) { this.auraRing.destroy(); this.auraRing = null; }
      this._updateBolts(deltaSec, player);
      return;
    }

    if (!this.enraged && this.hp / this.maxHp <= ENRAGE_THRESHOLD) {
      this._enrage();
    }

    this.orbitAngle += deltaSec * SATELLITE_ORBIT_SPEED;

    if (!this.teleporting) {
      // deltaSec=0 propositalmente: mantém hp bar/bob/ataque de contato
      // funcionando via super.update(), mas sem perseguir — o Roteador só
      // muda de posição por teleporte entre âncoras, nunca andando.
      super.update(0, player);
      this._tryTeleport(player);
      this._trySatelliteBarrage(player);
    }
    this._updateBolts(deltaSec, player);

    if (this.nameTag) this.nameTag.setPosition(this.sprite.x, this.sprite.y - 52);
    if (this.auraRing && this.auraRing.visible) {
      this.auraRing.setPosition(this.sprite.x, this.sprite.y);
      this.auraRing.setDepth(this.sprite.depth - 1);
      this.auraRing.angle -= deltaSec * 35;
    }
    this.hpBarBg.setPosition(this.sprite.x, this.sprite.y - 40);
    this.hpBarFg.setPosition(this.sprite.x - this.barWidth / 2, this.sprite.y - 40);
    this.hpBarFg.width = this.barWidth * (this.hp / this.maxHp);
  }
}
