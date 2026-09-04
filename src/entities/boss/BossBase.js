import Phaser from 'phaser';
import Enemy from '../Enemy.js';
import { playSfx } from '../../audio/AudioManager.js';

const ENRAGE_THRESHOLD = 0.35;

// Chrome compartilhado de confronto (nome, aura, fúria, seletor de ataques)
// + orquestração melee/ranged. Cada chefe só declara identidade visual e
// o kit de ataques; mecânicas únicas (teleporte, invocação, sabotagem)
// continuam na subclasse via `busy`, `anchored` e hooks.
export default class BossBase extends Enemy {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    const mini = !!opts.isMiniBoss;
    super(scene, tileMap, gx, gy, {
      hp: opts.hp,
      isBoss: !mini,
      speed: opts.speed,
      attackDamage: opts.attackDamage,
      xpReward: opts.xpReward,
      texture: opts.texture,
      hpBarWidth: opts.hpBarWidth ?? (mini ? 36 : 46),
      scale: opts.scale ?? (mini ? 1.05 : 1.15),
      ammoDropChance: opts.ammoDropChance,
      onDeath: opts.onDeath
    });
    this.isMiniBoss = mini;
    this.isBoss = !mini;
    this.baseSpeed = this.speed;
    this.baseAttackDamage = this.attackDamage;
    this.enraged = false;
    this.hasEnrage = opts.hasEnrage ?? !mini;
    this.enrageThreshold = opts.enrageThreshold ?? ENRAGE_THRESHOLD;
    this.enrageSpeedMul = opts.enrageSpeedMul ?? 1.4;
    this.enrageMeleeMul = opts.enrageMeleeMul ?? 1.35;
    this.enrageAttackMods = opts.enrageAttackMods ?? { cooldownMul: 0.65, damageMul: 1.25 };

    this.attacks = [];
    this.attackCursor = 0;
    this.busy = false;
    this.anchored = !!opts.anchored;
    this.nameOffset = opts.nameOffset ?? (mini ? 32 : 46);
    this.barOffset = opts.barOffset ?? (mini ? 26 : 34);
    this.auraTint = opts.auraTint || null;
    this.deathShake = opts.deathShake ?? !mini;

    const labelColor = opts.nameColor || '#ffb347';
    this.nameTag = this.scene.add.text(this.sprite.x, this.sprite.y - this.nameOffset, opts.name || '', {
      fontFamily: 'Courier New',
      fontSize: mini ? '10px' : '11px',
      color: labelColor
    }).setOrigin(0.5).setDepth(9002);

    if (this.auraTint) {
      const auraScale = opts.auraScale ?? (mini ? 0.85 : 1.15);
      this.glowFx = this.sprite.preFX?.addGlow(this.auraTint, 1.4, 0, false) || null;
      this.auraRing = this.scene.add.image(this.sprite.x, this.sprite.y, 'boss_aura')
        .setBlendMode(Phaser.BlendModes.ADD).setTint(this.auraTint).setAlpha(0.55)
        .setScale(auraScale);
      this.scene.tweens.add({
        targets: this.auraRing,
        scale: auraScale + 0.2,
        alpha: 0.25,
        duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.InOut'
      });
    } else {
      this.glowFx = null;
      this.auraRing = null;
    }
  }

  addAttack(attack) {
    this.attacks.push(attack);
    return attack;
  }

  _anyLocking() {
    return this.busy || this.attacks.some((a) => a.locking);
  }

  _movesOwner() {
    return this.attacks.some((a) => a.movesOwner);
  }

  _enrage() {
    this.enraged = true;
    playSfx(this.scene, 'sfx_enrage', { volume: 0.55 });
    this.speed = this.baseSpeed * this.enrageSpeedMul;
    this.attackDamage = Math.round(this.baseAttackDamage * this.enrageMeleeMul);
    for (const a of this.attacks) a.enrage?.(this.enrageAttackMods);
    this.sprite.setTintFill(this.auraTint || 0xffffff);
    this.scene.time.delayedCall(150, () => this.alive && this.sprite.clearTint());
    this.scene.cameras.main.shake(220, 0.006);
    if (this.glowFx) this.glowFx.outerStrength = 2.6;
    this.onEnrage();
  }

  // Hook das subclasses (invocação dupla, 2 raios, etc.).
  onEnrage() {}

  _pickAttack(player) {
    if (!player?.alive || this._anyLocking()) return;
    const ready = this.attacks.filter((a) => a.autoPick !== false && a.ready() && a.inRange(player));
    if (!ready.length) return;

    const dist = Math.hypot(player.gx - this.gx, player.gy - this.gy);
    const melee = ready.filter((a) => a.kind === 'melee');
    const ranged = ready.filter((a) => a.kind === 'ranged');
    const preferMelee = dist <= 2.2 && melee.length;
    const pool = preferMelee ? melee : (ranged.length ? ranged : melee);
    if (!pool.length) return;

    const attack = pool[this.attackCursor % pool.length];
    this.attackCursor++;
    attack.try(player);

    // Se o primeiro não travar o corpo, o segundo tipo dispara no mesmo
    // ciclo — melee + ranged ao mesmo tempo, como o Tanque original fazia.
    if (!this._anyLocking()) {
      const secondPool = attack.kind === 'melee' ? ranged : melee;
      const second = secondPool.find((a) => a !== attack);
      if (second) second.try(player);
    }
  }

  _idleLock() {
    this.knockback.x *= 0.82;
    this.knockback.y *= 0.82;
    const world = this.tileMap.gridToWorld(this.gx, this.gy);
    this.sprite.setPosition(world.x + this.knockback.x, world.y + this.knockback.y);
  }

  _updateAttacks(deltaSec, player) {
    for (const a of this.attacks) a.update(deltaSec, player);
  }

  _teardownChrome() {
    if (this.nameTag) { this.nameTag.destroy(); this.nameTag = null; }
    if (this.auraRing) { this.auraRing.destroy(); this.auraRing = null; }
  }

  _updateChrome(deltaSec) {
    if (this.nameTag) this.nameTag.setPosition(this.sprite.x, this.sprite.y - this.nameOffset);
    if (this.auraRing && this.auraRing.visible) {
      this.auraRing.setPosition(this.sprite.x, this.sprite.y);
      this.auraRing.setDepth(this.sprite.depth - 1);
      this.auraRing.angle += deltaSec * 45;
    }
    this.hpBarBg.setPosition(this.sprite.x, this.sprite.y - this.barOffset);
    this.hpBarFg.setPosition(this.sprite.x - this.barWidth / 2, this.sprite.y - this.barOffset);
    this.hpBarFg.width = this.barWidth * (this.hp / this.maxHp);
  }

  die() {
    if (this.deathShake) this.scene.cameras.main.shake(260, 0.008);
    for (const a of this.attacks) a.destroy();
    this._teardownChrome();
    super.die();
  }

  update(deltaSec, player) {
    if (!this.alive) {
      this._teardownChrome();
      this._updateAttacks(deltaSec, player);
      return;
    }

    if (this.hasEnrage && !this.enraged && this.hp / this.maxHp <= this.enrageThreshold) {
      this._enrage();
    }

    const locking = this._anyLocking();
    if (!locking) {
      if (this.anchored) super.update(0, player);
      else super.update(deltaSec, player);
      this._pickAttack(player);
    } else if (!this._movesOwner()) {
      this._idleLock();
    }

    this._updateAttacks(deltaSec, player);
    this._updateChrome(deltaSec);
  }
}
