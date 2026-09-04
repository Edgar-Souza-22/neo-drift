import Phaser from 'phaser';
import { TILE_SIZE } from '../../utils/constants.js';
import { playSfx } from '../../audio/AudioManager.js';
import { GameState } from '../../state/GameState.js';

// Toolkit de ataques de confronto. Cada instância pertence a um dono
// (BossBase) e responde ao mesmo contrato:
//   kind        'melee' | 'ranged'
//   locking     true enquanto o dono não deve perseguir
//   movesOwner  true enquanto o próprio ataque mexe gx/gy (investida)
//   autoPick    se o seletor genérico pode disparar sozinho
//   ready() / inRange(player) / try(player) / update(delta, player)
//   enrage(mods) / destroy()
//
// Números (dano, cooldown, paleta) ficam no chefe — este arquivo só
// implementa o comportamento.

function hypotTo(a, b) {
  return Math.hypot(b.gx - a.gx, b.gy - a.gy);
}

function destroyObj(obj) {
  if (obj && obj.scene && obj.destroy) obj.destroy();
}

export class BossAttack {
  constructor(owner, cfg = {}) {
    this.owner = owner;
    this.kind = cfg.kind || 'ranged';
    this.autoPick = cfg.autoPick !== false;
    this.enabled = cfg.enabled !== false;
    this.cooldown = cfg.cooldown ?? 2400;
    this.baseCooldown = this.cooldown;
    this.damage = cfg.damage ?? 16;
    this.baseDamage = this.damage;
    this.minRange = cfg.minRange ?? 0;
    this.maxRange = cfg.maxRange ?? 8;
    this.firstDelay = cfg.firstDelay ?? 900;
    this.lastAt = owner.scene.time.now - this.cooldown + this.firstDelay;
  }

  get locking() { return false; }
  get movesOwner() { return false; }

  ready() {
    if (!this.enabled || !this.owner.alive) return false;
    return this.owner.scene.time.now - this.lastAt >= this.cooldown;
  }

  inRange(player) {
    if (!player?.alive) return false;
    const d = hypotTo(this.owner, player);
    return d >= this.minRange && d <= this.maxRange;
  }

  try(_player) { return false; }
  update(_deltaSec, _player) {}

  enrage(mods = {}) {
    const cd = mods.cooldownMul ?? 0.65;
    const dmg = mods.damageMul ?? 1.25;
    this.cooldown = Math.round(this.baseCooldown * cd);
    this.damage = Math.round(this.baseDamage * dmg);
  }

  destroy() {}
}

// ---------------------------------------------------------------------------
// Projéteis retos (opcionalmente com correção de curso).
// ---------------------------------------------------------------------------
export class ProjectileAttack extends BossAttack {
  constructor(owner, cfg = {}) {
    super(owner, { kind: 'ranged', ...cfg });
    this.speed = cfg.speed ?? 4.6;
    this.lifetime = cfg.lifetime ?? 2200;
    this.hitRadius = cfg.hitRadius ?? 0.42;
    this.count = cfg.count ?? 1;
    this.baseCount = this.count;
    this.spreadDeg = cfg.spreadDeg ?? 0;
    this.homing = cfg.homing ?? 0;
    this.tint = cfg.tint ?? 0xffffff;
    this.texture = cfg.texture ?? 'bolt';
    this.windupMs = cfg.windupMs ?? 160;
    this.lockOnWindup = !!cfg.lockOnWindup;
    this.sfx = cfg.sfx ?? 'sfx_attack_ranged';
    this.bolts = [];
    this.winding = false;
  }

  get locking() { return this.lockOnWindup && this.winding; }

  try(player, opts = {}) {
    if (!opts.force && !this.ready()) return false;
    if (!opts.force && !this.inRange(player)) return false;
    this.lastAt = this.owner.scene.time.now;
    const skipWindup = opts.skipWindup || this.windupMs <= 0;
    if (skipWindup) {
      this._fire(player);
      return true;
    }
    this.winding = true;
    this.owner.sprite.setTintFill(0xffffff);
    playSfx(this.owner.scene, this.sfx, { volume: 0.28 });
    this.owner.scene.time.delayedCall(this.windupMs, () => {
      this.winding = false;
      if (this.owner.alive) this.owner.sprite.clearTint();
      if (this.owner.alive && player.alive) this._fire(player);
    });
    return true;
  }

  fireFrom(gx, gy, angle, damage) {
    const world = this.owner.tileMap.gridToWorld(gx, gy);
    const sprite = this.owner.scene.add.image(world.x, world.y, this.texture)
      .setDepth(9000).setBlendMode(Phaser.BlendModes.ADD).setTint(this.tint);
    this.bolts.push({
      gx, gy,
      vx: Math.cos(angle) * this.speed,
      vy: Math.sin(angle) * this.speed,
      damage: damage ?? this.damage,
      sprite,
      bornAt: this.owner.scene.time.now
    });
  }

  _fire(player) {
    if (!this.owner.alive || !player.alive) return;
    const dx = player.gx - this.owner.gx;
    const dy = player.gy - this.owner.gy;
    const base = Math.atan2(dy, dx);
    const spread = Phaser.Math.DegToRad(this.spreadDeg);
    const n = this.count;
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const angle = n === 1 ? base : base - spread / 2 + spread * t;
      this.fireFrom(this.owner.gx, this.owner.gy, angle, this.damage);
    }
    playSfx(this.owner.scene, this.sfx, { volume: 0.22 });
  }

  update(deltaSec, player) {
    const now = this.owner.scene.time.now;
    const map = this.owner.tileMap;
    this.bolts = this.bolts.filter((bolt) => {
      if (this.homing > 0 && player?.alive) {
        const dx = player.gx - bolt.gx;
        const dy = player.gy - bolt.gy;
        const d = Math.hypot(dx, dy) || 1;
        const steer = Math.min(1, this.homing * deltaSec * 5);
        bolt.vx += ((dx / d) * this.speed - bolt.vx) * steer;
        bolt.vy += ((dy / d) * this.speed - bolt.vy) * steer;
        const sp = Math.hypot(bolt.vx, bolt.vy) || 1;
        bolt.vx = (bolt.vx / sp) * this.speed;
        bolt.vy = (bolt.vy / sp) * this.speed;
      }

      bolt.gx += bolt.vx * deltaSec;
      bolt.gy += bolt.vy * deltaSec;

      const expired = now - bolt.bornAt > this.lifetime;
      const hitWall = !map.isWalkable(Math.round(bolt.gx), Math.round(bolt.gy));
      const hitPlayer = player?.alive && Math.hypot(player.gx - bolt.gx, player.gy - bolt.gy) <= this.hitRadius;
      if (hitPlayer) player.takeDamage(bolt.damage);

      if (expired || hitWall || hitPlayer) {
        destroyObj(bolt.sprite);
        return false;
      }
      const world = map.gridToWorld(bolt.gx, bolt.gy);
      bolt.sprite.setPosition(world.x, world.y);
      bolt.sprite.setDepth(Math.round(bolt.gy) * 10 + 6);
      return true;
    });
  }

  enrage(mods = {}) {
    super.enrage(mods);
    if (mods.extraCount) this.count = this.baseCount + mods.extraCount;
  }

  destroy() {
    this.winding = false;
    for (const b of this.bolts) destroyObj(b.sprite);
    this.bolts = [];
  }
}

// ---------------------------------------------------------------------------
// Rajada telegrafada em linha (mira, trava, dispara).
// ---------------------------------------------------------------------------
export class TelegraphBeamAttack extends BossAttack {
  constructor(owner, cfg = {}) {
    super(owner, { kind: 'ranged', ...cfg });
    this.chargeMs = cfg.chargeMs ?? 500;
    this.durationMs = cfg.durationMs ?? 500;
    this.length = cfg.length ?? 7.5;
    this.halfWidth = cfg.halfWidth ?? 0.5;
    this.color = cfg.color ?? 0xff1f3d;
    this.flash = cfg.flash ?? [255, 60, 80];
    this.axisLocked = !!cfg.axisLocked;
    this.railTolerance = cfg.railTolerance ?? 0.55;
    this.beam = null;
  }

  get locking() { return !!this.beam; }

  inRange(player) {
    if (!super.inRange(player)) return false;
    if (!this.axisLocked) return true;
    const dx = player.gx - this.owner.gx;
    const dy = player.gy - this.owner.gy;
    return Math.abs(dx) <= this.railTolerance || Math.abs(dy) <= this.railTolerance;
  }

  try(player) {
    if (this.beam || !this.ready() || !this.inRange(player)) return false;
    const dx = player.gx - this.owner.gx;
    const dy = player.gy - this.owner.gy;
    const dist = Math.hypot(dx, dy) || 1;
    let dirX = dx / dist;
    let dirY = dy / dist;
    if (this.axisLocked) {
      if (Math.abs(dy) <= this.railTolerance) { dirX = Math.sign(dx) || 1; dirY = 0; }
      else { dirX = 0; dirY = Math.sign(dy) || 1; }
    }
    this.lastAt = this.owner.scene.time.now;
    const angle = Math.atan2(dirY, dirX);
    const lengthPx = this.length * TILE_SIZE;
    const world = this.owner.tileMap.gridToWorld(this.owner.gx, this.owner.gy);
    const telegraph = this.owner.scene.add.rectangle(
      world.x + Math.cos(angle) * lengthPx / 2,
      world.y + Math.sin(angle) * lengthPx / 2,
      lengthPx, 4, this.color, 0.7
    ).setRotation(angle).setDepth(8999).setBlendMode(Phaser.BlendModes.ADD);
    this.owner.scene.tweens.add({ targets: telegraph, alpha: 0.15, duration: 130, yoyo: true, repeat: -1 });
    playSfx(this.owner.scene, 'sfx_enrage', { volume: 0.28 });

    this.beam = {
      phase: 'charge', dirX, dirY, angle, telegraph, rect: null,
      hitPlayer: false, originGx: this.owner.gx, originGy: this.owner.gy
    };
    this.owner.scene.time.delayedCall(this.chargeMs, () => this._fire());
    return true;
  }

  _fire() {
    if (!this.owner.alive || !this.beam || this.beam.phase !== 'charge') return;
    destroyObj(this.beam.telegraph);
    this.beam.telegraph = null;
    const { angle, originGx, originGy } = this.beam;
    const lengthPx = this.length * TILE_SIZE;
    const widthPx = this.halfWidth * 2 * TILE_SIZE;
    const world = this.owner.tileMap.gridToWorld(originGx, originGy);
    const rect = this.owner.scene.add.rectangle(
      world.x + Math.cos(angle) * lengthPx / 2,
      world.y + Math.sin(angle) * lengthPx / 2,
      lengthPx, widthPx, this.color, 0.85
    ).setRotation(angle).setDepth(9000).setBlendMode(Phaser.BlendModes.ADD);
    const [fr, fg, fb] = this.flash;
    this.owner.scene.cameras.main.flash(80, fr, fg, fb);
    this.beam.phase = 'active';
    this.beam.rect = rect;
    this.owner.scene.time.delayedCall(this.durationMs, () => this._clear());
  }

  _checkHit(player) {
    if (!this.beam || this.beam.phase !== 'active' || this.beam.hitPlayer) return;
    if (!player?.alive) return;
    const px = player.gx - this.beam.originGx;
    const py = player.gy - this.beam.originGy;
    const proj = px * this.beam.dirX + py * this.beam.dirY;
    if (proj < 0 || proj > this.length) return;
    const perp = Math.abs(px * this.beam.dirY - py * this.beam.dirX);
    if (perp <= this.halfWidth) {
      player.takeDamage(this.damage);
      this.beam.hitPlayer = true;
    }
  }

  _clear() {
    if (!this.beam) return;
    destroyObj(this.beam.telegraph);
    destroyObj(this.beam.rect);
    this.beam = null;
  }

  update(_deltaSec, player) {
    this._checkHit(player);
  }

  destroy() { this._clear(); }
}

// ---------------------------------------------------------------------------
// Marca no chão (posição travada no lançamento) → impacto.
// style: 'burst' | 'lightning' | 'shell'
// ---------------------------------------------------------------------------
export class GroundMarkAttack extends BossAttack {
  constructor(owner, cfg = {}) {
    super(owner, { kind: 'ranged', ...cfg });
    this.telegraphMs = cfg.telegraphMs ?? 650;
    this.radius = cfg.radius ?? 1.3;
    this.count = cfg.count ?? 1;
    this.baseCount = this.count;
    this.tint = cfg.tint ?? 0xffb347;
    this.style = cfg.style ?? 'burst';
    this.flash = cfg.flash ?? [255, 200, 140];
    this.growFrom = cfg.growFrom ?? 0.15;
    this.sfx = cfg.sfx ?? 'sfx_enrage';
    this.marks = [];
  }

  try(player) {
    if (!this.ready() || !this.inRange(player)) return false;
    this.lastAt = this.owner.scene.time.now;
    playSfx(this.owner.scene, this.sfx, { volume: 0.3 });
    for (let i = 0; i < this.count; i++) {
      const ox = i === 0 ? 0 : Phaser.Math.Between(-2, 2);
      const oy = i === 0 ? 0 : Phaser.Math.Between(-2, 2);
      const gx = Phaser.Math.Clamp(Math.round(player.gx + ox), 0, this.owner.tileMap.cols - 1);
      const gy = Phaser.Math.Clamp(Math.round(player.gy + oy), 0, this.owner.tileMap.rows - 1);
      this._spawnMark(gx, gy, player);
    }
    return true;
  }

  _spawnMark(gx, gy, player) {
    const world = this.owner.tileMap.gridToWorld(gx, gy);
    const ring = this.owner.scene.add.image(world.x, world.y, 'light_pool')
      .setTint(this.tint).setDepth(8999).setBlendMode(Phaser.BlendModes.ADD)
      .setScale(this.growFrom).setAlpha(0.75);

    if (this.style === 'burst') {
      this.owner.scene.tweens.add({
        targets: ring, scale: this.radius, alpha: 0.85,
        duration: this.telegraphMs, ease: 'Cubic.In'
      });
    } else {
      ring.setScale(this.style === 'shell' ? 1.1 : 0.85);
      this.owner.scene.tweens.add({ targets: ring, alpha: 0.25, duration: 140, yoyo: true, repeat: -1 });
    }

    let reticle = null;
    if (this.style === 'shell' && this.owner.scene.textures.exists('target_reticle')) {
      reticle = this.owner.scene.add.image(world.x, world.y, 'target_reticle')
        .setTint(0xff6a3d).setDepth(9001).setBlendMode(Phaser.BlendModes.ADD).setScale(1.1).setAlpha(0.95);
      this.owner.scene.tweens.add({
        targets: reticle, angle: 90, scale: 0.55,
        duration: this.telegraphMs, ease: 'Cubic.In'
      });
    }

    const mark = { gx, gy, ring, reticle };
    this.marks.push(mark);
    this.owner.scene.time.delayedCall(this.telegraphMs, () => this._resolve(mark, player));
  }

  _resolve(mark, player) {
    this.marks = this.marks.filter((m) => m !== mark);
    destroyObj(mark.ring);
    destroyObj(mark.reticle);
    if (!this.owner.alive) return;

    const world = this.owner.tileMap.gridToWorld(mark.gx, mark.gy);
    if (this.style === 'lightning') {
      const bolt = this.owner.scene.add.rectangle(
        world.x, world.y - TILE_SIZE * 2, 6, TILE_SIZE * 4, 0xdff7ff, 0.95
      ).setDepth(9002).setBlendMode(Phaser.BlendModes.ADD);
      this.owner.scene.tweens.add({ targets: bolt, alpha: 0, duration: 220, onComplete: () => bolt.destroy() });
    } else {
      const flash = this.owner.scene.add.image(world.x, world.y, 'light_pool')
        .setTint(0xffffff).setBlendMode(Phaser.BlendModes.ADD).setDepth(9002)
        .setScale(this.style === 'shell' ? 1.8 : 1.5).setAlpha(0.9);
      this.owner.scene.tweens.add({
        targets: flash, alpha: 0, scale: this.style === 'shell' ? 2.8 : 2.4,
        duration: 240, onComplete: () => flash.destroy()
      });
    }
    const [fr, fg, fb] = this.flash;
    this.owner.scene.cameras.main.flash(70, fr, fg, fb);
    if (this.style === 'shell') this.owner.scene.cameras.main.shake(200, 0.009);
    this.owner._spawnHitParticles?.(world.x, world.y, 8, 24, this.tint);

    if (player?.alive && Math.hypot(player.gx - mark.gx, player.gy - mark.gy) <= this.radius) {
      player.takeDamage(this.damage);
      this.owner.scene.cameras.main.shake(140, 0.006);
    }
  }

  enrage(mods = {}) {
    super.enrage(mods);
    if (mods.extraCount) this.count = this.baseCount + mods.extraCount;
  }

  destroy() {
    for (const m of this.marks) {
      destroyObj(m.ring);
      destroyObj(m.reticle);
    }
    this.marks = [];
  }
}

// ---------------------------------------------------------------------------
// Explosão corpo a corpo ao redor do dono (golpe de solo / pulso).
// lockMove: fica parado no telégrafo. Se false, o aro acompanha o dono.
// ---------------------------------------------------------------------------
export class SelfBurstAttack extends BossAttack {
  constructor(owner, cfg = {}) {
    super(owner, { kind: 'melee', minRange: 0, ...cfg });
    this.telegraphMs = cfg.telegraphMs ?? 480;
    this.radius = cfg.radius ?? 1.5;
    this.tint = cfg.tint ?? 0xffb347;
    this.lockMove = cfg.lockMove !== false;
    this.sfx = cfg.sfx ?? 'sfx_enrage';
    this.phase = 'idle';
    this.ring = null;
  }

  get locking() { return this.lockMove && this.phase === 'telegraph'; }

  inRange(player) {
    if (!player?.alive) return false;
    return hypotTo(this.owner, player) <= (this.maxRange || 1.8);
  }

  try(player, opts = {}) {
    if (this.phase !== 'idle') return false;
    if (!opts.force && !this.ready()) return false;
    if (!opts.force && !this.inRange(player)) return false;
    this.lastAt = this.owner.scene.time.now;
    this.phase = 'telegraph';
    playSfx(this.owner.scene, this.sfx, { volume: 0.32 });

    const world = this.owner.tileMap.gridToWorld(this.owner.gx, this.owner.gy);
    this.ring = this.owner.scene.add.image(world.x, world.y, 'light_pool')
      .setTint(this.tint).setBlendMode(Phaser.BlendModes.ADD).setDepth(8999)
      .setScale(0.2).setAlpha(0.6);
    this.owner.scene.tweens.add({
      targets: this.ring, scale: this.radius, alpha: 0.85,
      duration: this.telegraphMs, ease: 'Cubic.In'
    });
    this.owner.scene.time.delayedCall(this.telegraphMs, () => this._resolve(player));
    return true;
  }

  _resolve(player) {
    destroyObj(this.ring);
    this.ring = null;
    this.phase = 'idle';
    if (!this.owner.alive) return;

    const world = this.owner.tileMap.gridToWorld(this.owner.gx, this.owner.gy);
    const flash = this.owner.scene.add.image(world.x, world.y, 'light_pool')
      .setTint(0xffffff).setBlendMode(Phaser.BlendModes.ADD).setDepth(9002)
      .setScale(1.4).setAlpha(0.9);
    this.owner.scene.tweens.add({
      targets: flash, alpha: 0, scale: 2.2, duration: 220, onComplete: () => flash.destroy()
    });
    this.owner.scene.cameras.main.shake(150, 0.006);
    this.owner._spawnHitParticles?.(world.x, world.y, 7, 22, this.tint);

    if (player?.alive && hypotTo(this.owner, player) <= this.radius) {
      player.takeDamage(this.damage);
    }
  }

  update() {
    if (this.phase === 'telegraph' && this.ring && !this.lockMove) {
      const world = this.owner.tileMap.gridToWorld(this.owner.gx, this.owner.gy);
      this.ring.setPosition(world.x, world.y);
    }
  }

  destroy() {
    destroyObj(this.ring);
    this.ring = null;
    this.phase = 'idle';
  }
}

// ---------------------------------------------------------------------------
// Investida telegrafada (livre ou travada nos eixos).
// ---------------------------------------------------------------------------
export class DashChargeAttack extends BossAttack {
  constructor(owner, cfg = {}) {
    super(owner, { kind: 'melee', ...cfg });
    this.telegraphMs = cfg.telegraphMs ?? 700;
    this.durationMs = cfg.durationMs ?? 900;
    this.recoverMs = cfg.recoverMs ?? 850;
    this.speed = cfg.speed ?? 5.5;
    this.hitRadius = cfg.hitRadius ?? 0.8;
    this.telegraphColor = cfg.telegraphColor ?? 0x9fff6a;
    this.telegraphWidth = cfg.telegraphWidth ?? 10;
    this.axisLocked = !!cfg.axisLocked;
    this.railTolerance = cfg.railTolerance ?? 0.55;
    this.onTelegraph = cfg.onTelegraph || null;
    this.onChargeStart = cfg.onChargeStart || null;
    this.onChargeFrame = cfg.onChargeFrame || null;
    this.onRecover = cfg.onRecover || null;
    this.state = 'idle';
    this.stateUntil = 0;
    this.dir = { x: 1, y: 0 };
    this.hitPlayer = false;
    this.telegraph = null;
  }

  get locking() { return this.state !== 'idle'; }
  get movesOwner() { return this.state === 'charging'; }

  inRange(player) {
    if (!super.inRange(player)) return false;
    if (!this.axisLocked) return true;
    const dx = player.gx - this.owner.gx;
    const dy = player.gy - this.owner.gy;
    return Math.abs(dx) <= this.railTolerance || Math.abs(dy) <= this.railTolerance;
  }

  try(player) {
    if (this.state !== 'idle' || !this.ready() || !this.inRange(player)) return false;
    const dx = player.gx - this.owner.gx;
    const dy = player.gy - this.owner.gy;
    const dist = Math.hypot(dx, dy) || 1;
    if (this.axisLocked) {
      if (Math.abs(dy) <= this.railTolerance) this.dir = { x: Math.sign(dx) || 1, y: 0 };
      else this.dir = { x: 0, y: Math.sign(dy) || 1 };
    } else {
      this.dir = { x: dx / dist, y: dy / dist };
    }
    this.lastAt = this.owner.scene.time.now;
    this.state = 'telegraph';
    this.stateUntil = this.lastAt + this.telegraphMs;
    this.hitPlayer = false;

    const world = this.owner.tileMap.gridToWorld(this.owner.gx, this.owner.gy);
    const angle = Math.atan2(this.dir.y, this.dir.x);
    const lengthPx = this.maxRange * TILE_SIZE;
    this.telegraph = this.owner.scene.add.rectangle(
      world.x + Math.cos(angle) * lengthPx / 2,
      world.y + Math.sin(angle) * lengthPx / 2,
      lengthPx, this.telegraphWidth, this.telegraphColor, 0.35
    ).setRotation(angle).setDepth(8999).setBlendMode(Phaser.BlendModes.ADD);
    this.owner.scene.tweens.add({ targets: this.telegraph, alpha: 0.12, duration: 130, yoyo: true, repeat: -1 });
    playSfx(this.owner.scene, 'sfx_enrage', { volume: 0.3 });
    this.onTelegraph?.(this, { world, angle, lengthPx });
    return true;
  }

  reset() {
    this.state = 'idle';
    this.hitPlayer = false;
    destroyObj(this.telegraph);
    this.telegraph = null;
  }

  update(deltaSec, player) {
    const now = this.owner.scene.time.now;
    const owner = this.owner;

    if (this.state === 'telegraph') {
      if (now >= this.stateUntil) {
        this.state = 'charging';
        this.stateUntil = now + this.durationMs;
        destroyObj(this.telegraph);
        this.telegraph = null;
        owner.scene.cameras.main.shake(120, 0.004);
        this.onChargeStart?.(this);
      }
      return;
    }

    if (this.state === 'charging') {
      const nx = owner.gx + this.dir.x * this.speed * deltaSec;
      const ny = owner.gy + this.dir.y * this.speed * deltaSec;
      let stopped = false;
      if (owner.canOccupy(nx, owner.gy)) owner.gx = nx; else stopped = true;
      if (owner.canOccupy(owner.gx, ny)) owner.gy = ny; else stopped = true;

      if (!this.hitPlayer && player?.alive && hypotTo(owner, player) <= this.hitRadius) {
        player.takeDamage(this.damage);
        this.hitPlayer = true;
        owner.scene.cameras.main.shake(160, 0.007);
      }

      const world = owner.tileMap.gridToWorld(owner.gx, owner.gy);
      owner.sprite.setPosition(world.x, world.y);
      owner.sprite.setDepth(Math.round(owner.gy) * 10 + 4);
      this.onChargeFrame?.(this, deltaSec, player);

      if (stopped || now >= this.stateUntil) {
        this.state = 'recover';
        this.stateUntil = now + this.recoverMs;
        this.onRecover?.(this);
      }
      return;
    }

    if (this.state === 'recover' && now >= this.stateUntil) {
      this.state = 'idle';
      if (owner.alive) owner.sprite.clearTint();
    }
  }

  destroy() { this.reset(); }
}

// ---------------------------------------------------------------------------
// Poça persistente: telegrafa a posição ATUAL do jogador, explode, e deixa
// um charco que continua causando dano por tique enquanto o jogador ficar
// (ou voltar) ali. Área de recusa, não impacto instantâneo como GroundMark.
// `immuneFlag` (default toxinImmune) cancela o tique da poça — o Traje de
// Quarentena anula tanto o piso tóxico do mapa quanto essas poças.
// ---------------------------------------------------------------------------
export class LingeringPoolAttack extends BossAttack {
  constructor(owner, cfg = {}) {
    super(owner, { kind: 'ranged', ...cfg });
    this.telegraphMs = cfg.telegraphMs ?? 720;
    this.lingerMs = cfg.lingerMs ?? 4200;
    this.radius = cfg.radius ?? 1.3;
    this.count = cfg.count ?? 1;
    this.baseCount = this.count;
    this.tint = cfg.tint ?? 0x6dff4a;
    this.flash = cfg.flash ?? [110, 255, 80];
    this.immuneFlag = cfg.immuneFlag ?? 'toxinImmune';
    this.marks = [];
    this.pools = [];
  }

  try(player) {
    if (!this.ready() || !this.inRange(player)) return false;
    this.lastAt = this.owner.scene.time.now;
    playSfx(this.owner.scene, 'sfx_enrage', { volume: 0.28 });
    for (let i = 0; i < this.count; i++) {
      const ox = i === 0 ? 0 : Phaser.Math.Between(-2, 2);
      const oy = i === 0 ? 0 : Phaser.Math.Between(-2, 2);
      const gx = Phaser.Math.Clamp(Math.round(player.gx + ox), 0, this.owner.tileMap.cols - 1);
      const gy = Phaser.Math.Clamp(Math.round(player.gy + oy), 0, this.owner.tileMap.rows - 1);
      this._spawnMark(gx, gy, player);
    }
    return true;
  }

  _spawnMark(gx, gy, player) {
    const world = this.owner.tileMap.gridToWorld(gx, gy);
    const ring = this.owner.scene.add.image(world.x, world.y, 'light_pool')
      .setTint(this.tint).setDepth(8999).setBlendMode(Phaser.BlendModes.ADD)
      .setScale(0.18).setAlpha(0.8);
    this.owner.scene.tweens.add({
      targets: ring, scale: this.radius, alpha: 0.9,
      duration: this.telegraphMs, ease: 'Cubic.In'
    });
    const mark = { gx, gy, ring };
    this.marks.push(mark);
    this.owner.scene.time.delayedCall(this.telegraphMs, () => this._resolve(mark, player));
  }

  _resolve(mark, player) {
    this.marks = this.marks.filter((m) => m !== mark);
    destroyObj(mark.ring);
    if (!this.owner.alive) return;

    const world = this.owner.tileMap.gridToWorld(mark.gx, mark.gy);
    const flash = this.owner.scene.add.image(world.x, world.y, 'light_pool')
      .setTint(0xffffff).setBlendMode(Phaser.BlendModes.ADD).setDepth(9002)
      .setScale(1.3).setAlpha(0.85);
    this.owner.scene.tweens.add({
      targets: flash, alpha: 0, scale: 2.2, duration: 240, onComplete: () => flash.destroy()
    });
    const [fr, fg, fb] = this.flash;
    this.owner.scene.cameras.main.flash(60, fr, fg, fb);

    const pool = this.owner.scene.add.image(world.x, world.y, 'light_pool')
      .setTint(this.tint).setBlendMode(Phaser.BlendModes.ADD).setDepth(-990)
      .setScale(this.radius * 0.85).setAlpha(0.7);
    this.owner.scene.tweens.add({
      targets: pool, alpha: 0.35, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.InOut'
    });
    this.pools.push({ gx: mark.gx, gy: mark.gy, sprite: pool, until: this.owner.scene.time.now + this.lingerMs });

    if (player?.alive && !GameState[this.immuneFlag] && hypotTo(player, mark) <= this.radius) {
      player.takeDamage(this.damage);
    }
  }

  update(_deltaSec, player) {
    const now = this.owner.scene.time.now;
    this.pools = this.pools.filter((pool) => {
      if (now >= pool.until) {
        destroyObj(pool.sprite);
        return false;
      }
      if (player?.alive && !GameState[this.immuneFlag] && hypotTo(player, pool) <= this.radius) {
        player.takeDamage(this.damage);
      }
      return true;
    });
  }

  enrage(mods = {}) {
    super.enrage(mods);
    if (mods.extraCount) this.count = this.baseCount + mods.extraCount;
  }

  destroy() {
    for (const m of this.marks) destroyObj(m.ring);
    for (const p of this.pools) destroyObj(p.sprite);
    this.marks = [];
    this.pools = [];
  }
}

// ---------------------------------------------------------------------------
// Parte a arena: telegrafa uma linha (horizontal ou vertical) na fileira
// atual do jogador, depois aqueles tiles viram parede temporária e ferem
// quem ficou em cima. extraCount na fúria adiciona a perpendicular.
// Não trava o dono — ele continua perseguindo no chão que sobrou.
// ---------------------------------------------------------------------------
export class FirewallSplitAttack extends BossAttack {
  constructor(owner, cfg = {}) {
    super(owner, { kind: 'ranged', ...cfg });
    this.telegraphMs = cfg.telegraphMs ?? 720;
    this.durationMs = cfg.durationMs ?? 1800;
    this.tint = cfg.tint ?? 0xff3d8a;
    this.flash = cfg.flash ?? [255, 80, 160];
    this.count = cfg.count ?? 1;
    this.baseCount = this.count;
    this.arena = cfg.arena || { x1: 0, y1: 0, x2: 8, y2: 8 };
    this.axis = 'h';
    this.phase = 'idle';
    this.telegraphs = [];
    this.walls = [];
  }

  try(player) {
    if (this.phase !== 'idle' || !this.ready() || !this.inRange(player)) return false;
    this.lastAt = this.owner.scene.time.now;
    this.axis = this.axis === 'h' ? 'v' : 'h';
    playSfx(this.owner.scene, this.sfx || 'sfx_enrage', { volume: 0.32 });

    const lines = this._lineCells(player, this.axis);
    if (this.count > 1) {
      const other = this.axis === 'h' ? 'v' : 'h';
      for (const cell of this._lineCells(player, other)) {
        if (!lines.some((c) => c.gx === cell.gx && c.gy === cell.gy)) lines.push(cell);
      }
    }
    this.phase = 'telegraph';
    this.telegraphs = lines.map((cell) => {
      const world = this.owner.tileMap.gridToWorld(cell.gx, cell.gy);
      const ring = this.owner.scene.add.image(world.x, world.y, 'light_pool')
        .setTint(this.tint).setBlendMode(Phaser.BlendModes.ADD).setDepth(8999)
        .setScale(0.55).setAlpha(0.85);
      this.owner.scene.tweens.add({
        targets: ring, alpha: 0.3, duration: 120, yoyo: true, repeat: -1
      });
      return { ...cell, ring };
    });
    this.owner.scene.time.delayedCall(this.telegraphMs, () => this._raise(player));
    return true;
  }

  _lineCells(player, axis) {
    const { x1, y1, x2, y2 } = this.arena;
    const cells = [];
    if (axis === 'h') {
      const gy = Phaser.Math.Clamp(Math.round(player.gy), y1, y2);
      for (let gx = x1; gx <= x2; gx++) {
        if (this.owner.tileMap.isWalkable(gx, gy)) cells.push({ gx, gy });
      }
    } else {
      const gx = Phaser.Math.Clamp(Math.round(player.gx), x1, x2);
      for (let gy = y1; gy <= y2; gy++) {
        if (this.owner.tileMap.isWalkable(gx, gy)) cells.push({ gx, gy });
      }
    }
    return cells;
  }

  _raise(player) {
    for (const t of this.telegraphs) destroyObj(t.ring);
    const cells = this.telegraphs.map(({ gx, gy }) => ({ gx, gy }));
    this.telegraphs = [];
    if (!this.owner.alive) {
      this.phase = 'idle';
      return;
    }
    const [fr, fg, fb] = this.flash;
    this.owner.scene.cameras.main.flash(70, fr, fg, fb);
    this.owner.scene.cameras.main.shake(140, 0.005);

    this.phase = 'active';
    this.walls = [];
    for (const cell of cells) {
      const wall = this.owner.scene.placeFirewall?.(cell.gx, cell.gy, this.durationMs, {
        allowOnPlayer: true,
        damage: this.damage,
        tint: this.tint
      });
      if (wall) this.walls.push(wall);
    }
    if (player?.alive) {
      const onLine = cells.some((c) => Math.hypot(player.gx - c.gx, player.gy - c.gy) < 0.55);
      if (onLine) player.takeDamage(this.damage);
    }
    this.owner.scene.time.delayedCall(this.durationMs, () => this._drop());
  }

  _drop() {
    for (const wall of this.walls) this.owner.scene.clearFirewall?.(wall);
    this.walls = [];
    this.phase = 'idle';
  }

  enrage(mods = {}) {
    super.enrage(mods);
    if (mods.extraCount) this.count = this.baseCount + mods.extraCount;
  }

  destroy() {
    for (const t of this.telegraphs) destroyObj(t.ring);
    this.telegraphs = [];
    this._drop();
  }
}

// ---------------------------------------------------------------------------
// Golpe de empurrão: telegrafa um leque curto à frente do dono (na direção do
// jogador), fecha, e quem estiver no cone leva dano E é ARREMESSADO pra trás
// (Player.pushBack). Alcance curto; trava o corpo só durante o telégrafo.
// Serve pra descolar o jogador que fica grudado no chefe.
// ---------------------------------------------------------------------------
export class ShoveAttack extends BossAttack {
  constructor(owner, cfg = {}) {
    super(owner, { kind: 'melee', minRange: 0, ...cfg });
    this.telegraphMs = cfg.telegraphMs ?? 360;
    this.reach = cfg.reach ?? 2.2;
    this.arcDeg = cfg.arcDeg ?? 150;
    this.pushDistance = cfg.pushDistance ?? 2.8;
    this.pushMs = cfg.pushMs ?? 260;
    this.tint = cfg.tint ?? 0xe8923d;
    this.flash = cfg.flash ?? [232, 146, 61];
    this.sfx = cfg.sfx ?? 'sfx_enrage';
    this.phase = 'idle';
    this.fan = null;
    this.aimX = 1;
    this.aimY = 0;
  }

  get locking() { return this.phase === 'telegraph'; }

  inRange(player) {
    if (!player?.alive) return false;
    return hypotTo(this.owner, player) <= (this.maxRange || this.reach + 0.4);
  }

  try(player, opts = {}) {
    if (this.phase !== 'idle') return false;
    if (!opts.force && (!this.ready() || !this.inRange(player))) return false;
    this.lastAt = this.owner.scene.time.now;
    this.phase = 'telegraph';

    const dx = player.gx - this.owner.gx;
    const dy = player.gy - this.owner.gy;
    const d = Math.hypot(dx, dy) || 1;
    this.aimX = dx / d;
    this.aimY = dy / d;
    playSfx(this.owner.scene, this.sfx, { volume: 0.3 });

    const world = this.owner.tileMap.gridToWorld(this.owner.gx, this.owner.gy);
    const angle = Math.atan2(this.aimY, this.aimX);
    this.fan = this.owner.scene.add.image(world.x, world.y, 'light_pool')
      .setTint(this.tint).setBlendMode(Phaser.BlendModes.ADD).setDepth(8999)
      .setScale(0.25).setAlpha(0.5).setRotation(angle).setOrigin(0.5);
    this.owner.scene.tweens.add({
      targets: this.fan, scaleX: this.reach * 0.85, scaleY: this.reach * 0.55, alpha: 0.8,
      duration: this.telegraphMs, ease: 'Cubic.In'
    });
    this.owner.scene.time.delayedCall(this.telegraphMs, () => this._resolve(player));
    return true;
  }

  _resolve(player) {
    destroyObj(this.fan);
    this.fan = null;
    this.phase = 'idle';
    if (!this.owner.alive) return;

    const angle = Math.atan2(this.aimY, this.aimX);
    const world = this.owner.tileMap.gridToWorld(this.owner.gx, this.owner.gy);
    const wave = this.owner.scene.add.image(world.x, world.y, 'light_pool')
      .setTint(0xffffff).setBlendMode(Phaser.BlendModes.ADD).setDepth(9002)
      .setScale(0.6).setAlpha(0.9).setRotation(angle).setOrigin(0.5);
    this.owner.scene.tweens.add({
      targets: wave, scaleX: this.reach * 1.15, scaleY: this.reach * 0.7, alpha: 0,
      duration: 220, onComplete: () => wave.destroy()
    });
    const [fr, fg, fb] = this.flash;
    this.owner.scene.cameras.main.flash(60, fr, fg, fb);
    this.owner.scene.cameras.main.shake(130, 0.005);
    this.owner._spawnHitParticles?.(world.x + this.aimX * 20, world.y + this.aimY * 20, 7, 22, this.tint);

    if (!player?.alive) return;
    const px = player.gx - this.owner.gx;
    const py = player.gy - this.owner.gy;
    const dist = Math.hypot(px, py);
    if (dist > this.reach + 0.4) return;
    const dot = dist > 0.05 ? (px * this.aimX + py * this.aimY) / dist : 1;
    if (dot < Math.cos(Phaser.Math.DegToRad(this.arcDeg / 2))) return;

    player.takeDamage(this.damage);
    const dirX = dist > 0.05 ? px / dist : this.aimX;
    const dirY = dist > 0.05 ? py / dist : this.aimY;
    player.pushBack?.(dirX, dirY, this.pushDistance, this.pushMs);
  }

  update() {
    if (this.phase === 'telegraph' && this.fan) {
      const world = this.owner.tileMap.gridToWorld(this.owner.gx, this.owner.gy);
      this.fan.setPosition(world.x, world.y);
    }
  }

  destroy() {
    destroyObj(this.fan);
    this.fan = null;
    this.phase = 'idle';
  }
}

// ---------------------------------------------------------------------------
// Queda de contêiner: marca a posição ATUAL do jogador (não rastreia),
// depois um contêiner cai ali — fere quem ficou e, se o tile estiver
// livre, vira obstáculo temporário. Distinto da linha de firewall (eixo
// inteiro) e do charco (piso caminhável). extraCount na fúria adiciona
// uma segunda queda deslocada.
// ---------------------------------------------------------------------------
export class ContainerDropAttack extends BossAttack {
  constructor(owner, cfg = {}) {
    super(owner, { kind: 'ranged', ...cfg });
    this.telegraphMs = cfg.telegraphMs ?? 780;
    this.durationMs = cfg.durationMs ?? 2200;
    this.radius = cfg.radius ?? 0.7;
    this.count = cfg.count ?? 1;
    this.baseCount = this.count;
    this.tint = cfg.tint ?? 0xe8923d;
    this.flash = cfg.flash ?? [232, 146, 61];
    this.sfx = cfg.sfx ?? 'sfx_enrage';
    this.marks = [];
  }

  try(player) {
    if (!this.ready() || !this.inRange(player)) return false;
    this.lastAt = this.owner.scene.time.now;
    playSfx(this.owner.scene, this.sfx, { volume: 0.32 });
    for (let i = 0; i < this.count; i++) {
      const ox = i === 0 ? 0 : Phaser.Math.Between(-2, 2);
      const oy = i === 0 ? 0 : Phaser.Math.Between(-2, 2);
      const gx = Phaser.Math.Clamp(Math.round(player.gx + ox), 0, this.owner.tileMap.cols - 1);
      const gy = Phaser.Math.Clamp(Math.round(player.gy + oy), 0, this.owner.tileMap.rows - 1);
      this._spawnMark(gx, gy, player);
    }
    return true;
  }

  _spawnMark(gx, gy, player) {
    const world = this.owner.tileMap.gridToWorld(gx, gy);
    const ring = this.owner.scene.add.image(world.x, world.y, 'light_pool')
      .setTint(this.tint).setDepth(8999).setBlendMode(Phaser.BlendModes.ADD)
      .setScale(0.2).setAlpha(0.8);
    this.owner.scene.tweens.add({
      targets: ring, scale: 1.05, alpha: 0.9,
      duration: this.telegraphMs, ease: 'Cubic.In'
    });
    const shadow = this.owner.scene.add.image(world.x, world.y - 40, 'prop_container')
      .setDepth(9002).setAlpha(0.35).setScale(0.55);
    this.owner.scene.tweens.add({
      targets: shadow, y: world.y, scale: 1, alpha: 0.85,
      duration: this.telegraphMs, ease: 'Cubic.In'
    });
    const mark = { gx, gy, ring, shadow };
    this.marks.push(mark);
    this.owner.scene.time.delayedCall(this.telegraphMs, () => this._resolve(mark, player));
  }

  _resolve(mark, player) {
    this.marks = this.marks.filter((m) => m !== mark);
    destroyObj(mark.ring);
    destroyObj(mark.shadow);
    if (!this.owner.alive) return;

    const world = this.owner.tileMap.gridToWorld(mark.gx, mark.gy);
    const flash = this.owner.scene.add.image(world.x, world.y, 'light_pool')
      .setTint(0xffe0a0).setBlendMode(Phaser.BlendModes.ADD).setDepth(9003)
      .setScale(1.4).setAlpha(0.95);
    this.owner.scene.tweens.add({
      targets: flash, alpha: 0, scale: 2.2, duration: 240, onComplete: () => flash.destroy()
    });
    const [fr, fg, fb] = this.flash;
    this.owner.scene.cameras.main.flash(70, fr, fg, fb);
    this.owner.scene.cameras.main.shake(160, 0.007);
    this.owner._spawnHitParticles?.(world.x, world.y, 8, 22, this.tint);

    if (player?.alive && Math.hypot(player.gx - mark.gx, player.gy - mark.gy) <= this.radius) {
      player.takeDamage(this.damage);
    }
    this.owner.scene.placeCargoDrop?.(mark.gx, mark.gy, this.durationMs, { tint: this.tint });
  }

  enrage(mods = {}) {
    super.enrage(mods);
    if (mods.extraCount) this.count = this.baseCount + mods.extraCount;
  }

  destroy() {
    for (const m of this.marks) {
      destroyObj(m.ring);
      destroyObj(m.shadow);
    }
    this.marks = [];
  }
}
