import Phaser from 'phaser';
import Enemy from './Enemy.js';
import { playSfx } from '../audio/AudioManager.js';

const ENRAGE_THRESHOLD = 0.35;
const RANGED_RANGE = 6.5;
const BOLT_SPEED = 4.6;
const BOLT_LIFETIME = 2200;
const BOLT_HIT_RADIUS = 0.42;

export default class Boss extends Enemy {
  // opts: onDeath, e além disso (com defaults do Guardião Núcleo original)
  // hp, speed, attackDamage, xpReward, texture, name, rangedDamage — permite
  // reaproveitar a classe pra chefes de outras fases sem duplicar a lógica.
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, {
      hp: opts.hp || 380,
      speed: opts.speed || 1.1,
      attackDamage: opts.attackDamage || 16,
      xpReward: opts.xpReward || 160,
      texture: opts.texture || 'boss',
      hpBarWidth: 46,
      scale: 1.15,
      onDeath: opts.onDeath
    });
    this.isBoss = true;
    this.baseSpeed = this.speed;
    this.baseAttackDamage = this.attackDamage;
    this.enraged = false;

    this.rangedCooldown = 2200;
    this.rangedDamage = opts.rangedDamage || 15;
    this.baseRangedDamage = this.rangedDamage;
    this.lastRangedAt = -9999;
    this.bolts = [];

    this.nameTag = this.scene.add.text(this.sprite.x, this.sprite.y - 44, opts.name || 'GUARDIÃO NÚCLEO', {
      fontFamily: 'Courier New',
      fontSize: '11px',
      color: '#ffb347'
    }).setOrigin(0.5).setDepth(9002);

    // Brilho de borda nativo do Phaser (preFX, sem dependência extra) —
    // reforça a leitura de "chefe" a curta distância, além da auréola
    // giratória abaixo (que é o efeito decorativo separado).
    this.glowFx = this.sprite.preFX.addGlow(0xff8a3d, 1.4, 0, false);

    // Aura giratória — nenhum inimigo comum tem isso, só chefes.
    this.auraRing = this.scene.add.image(this.sprite.x, this.sprite.y, 'boss_aura')
      .setBlendMode(Phaser.BlendModes.ADD).setTint(0xff8a3d).setAlpha(0.55).setScale(1.1);
    this.scene.tweens.add({ targets: this.auraRing, scale: 1.3, alpha: 0.25, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
  }

  _enrage() {
    this.enraged = true;
    playSfx(this.scene, 'sfx_enrage', { volume: 0.55 });
    this.speed = this.baseSpeed * 1.5;
    this.attackDamage = Math.round(this.baseAttackDamage * 1.4);
    this.rangedCooldown = 1300;
    this.rangedDamage = Math.round(this.baseRangedDamage * 1.35);
    this.sprite.setTintFill(0xff8a3d);
    this.scene.time.delayedCall(150, () => this.alive && this.sprite.clearTint());
    this.scene.cameras.main.shake(220, 0.006);
    if (this.glowFx) this.glowFx.outerStrength = 2.6;
  }

  die() {
    this.scene.cameras.main.shake(260, 0.008);
    for (const bolt of this.bolts) bolt.sprite.destroy();
    this.bolts = [];
    if (this.auraRing) { this.auraRing.destroy(); this.auraRing = null; }
    super.die();
  }

  _tryFireBolt(player) {
    const now = this.scene.time.now;
    if (now - this.lastRangedAt < this.rangedCooldown) return;
    const dist = Math.hypot(player.gx - this.gx, player.gy - this.gy);
    if (dist > RANGED_RANGE || dist < 0.1) return;
    this.lastRangedAt = now;
    this.sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(90, () => this.alive && this.sprite.clearTint());

    const dirX = (player.gx - this.gx) / dist;
    const dirY = (player.gy - this.gy) / dist;
    const world = this.tileMap.gridToWorld(this.gx, this.gy);
    const sprite = this.scene.add.image(world.x, world.y, 'bolt').setDepth(9000).setBlendMode(Phaser.BlendModes.ADD);

    this.bolts.push({
      gx: this.gx,
      gy: this.gy,
      vx: dirX * BOLT_SPEED,
      vy: dirY * BOLT_SPEED,
      sprite,
      bornAt: now
    });
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

      if (hitPlayer) player.takeDamage(this.rangedDamage);

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
      if (this.nameTag) {
        this.nameTag.destroy();
        this.nameTag = null;
      }
      this._updateBolts(deltaSec, player);
      return;
    }

    if (!this.enraged && this.hp / this.maxHp <= ENRAGE_THRESHOLD) {
      this._enrage();
    }

    super.update(deltaSec, player);
    this._tryFireBolt(player);
    this._updateBolts(deltaSec, player);

    if (this.nameTag) {
      this.nameTag.setPosition(this.sprite.x, this.sprite.y - 46);
    }
    if (this.auraRing) {
      this.auraRing.setPosition(this.sprite.x, this.sprite.y);
      this.auraRing.setDepth(this.sprite.depth - 1);
      this.auraRing.angle += deltaSec * 45;
    }
    this.hpBarBg.setPosition(this.sprite.x, this.sprite.y - 34);
    this.hpBarFg.setPosition(this.sprite.x - this.barWidth / 2, this.sprite.y - 34);
    this.hpBarFg.width = this.barWidth * (this.hp / this.maxHp);
  }
}
