import Phaser from 'phaser';
import Enemy from './Enemy.js';
import { TILE_SIZE } from '../utils/constants.js';
import { playSfx } from '../audio/AudioManager.js';

const ENRAGE_THRESHOLD = 0.35;
const STRIKE_RANGE = 7.5;
const STRIKE_CHARGE_MS = 700;
const STRIKE_RADIUS = 0.9; // tiles
const STRIKE_COOLDOWN = 2400;

// Chefe da Fase 03 "Titã Voltaico" — diferente dos dois anteriores (bolts
// homing do Guardião Núcleo / rajada reta telegrafada do Fundidor
// Primordial): continua perseguindo e batendo corpo a corpo o tempo todo
// (nunca fica parado), e periodicamente marca a posição ATUAL do jogador
// com um anel de aviso — depois de um tempo de carga, um raio cai ali,
// causando dano em área a quem ainda estiver dentro. Na fúria, cai mais de
// um raio ao mesmo tempo, forçando o jogador a se mover pra escapar.
export default class ReactorBoss extends Enemy {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, {
      hp: opts.hp || 680,
      speed: opts.speed || 1.2,
      attackDamage: opts.attackDamage || 22,
      xpReward: opts.xpReward || 320,
      texture: opts.texture || 'boss_reactor',
      hpBarWidth: 46,
      scale: 1.15,
      onDeath: opts.onDeath
    });
    this.isBoss = true;
    this.baseSpeed = this.speed;
    this.baseAttackDamage = this.attackDamage;
    this.enraged = false;

    this.strikeDamage = opts.strikeDamage || 24;
    this.baseStrikeDamage = this.strikeDamage;
    this.strikeCooldown = STRIKE_COOLDOWN;
    this.strikeCount = 1;
    this.lastStrikeAt = -9999;
    this.strikes = [];

    this.nameTag = this.scene.add.text(this.sprite.x, this.sprite.y - 44, opts.name || 'TITÃ VOLTAICO', {
      fontFamily: 'Courier New',
      fontSize: '11px',
      color: '#7de8ff'
    }).setOrigin(0.5).setDepth(9002);

    this.glowFx = this.sprite.preFX.addGlow(0x37f0ff, 1.4, 0, false);

    this.auraRing = this.scene.add.image(this.sprite.x, this.sprite.y, 'boss_aura')
      .setBlendMode(Phaser.BlendModes.ADD).setTint(0x37f0ff).setAlpha(0.55).setScale(1.1);
    this.scene.tweens.add({ targets: this.auraRing, scale: 1.3, alpha: 0.25, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
  }

  _enrage() {
    this.enraged = true;
    playSfx(this.scene, 'sfx_enrage', { volume: 0.55 });
    this.speed = this.baseSpeed * 1.45;
    this.attackDamage = Math.round(this.baseAttackDamage * 1.35);
    this.strikeCooldown = Math.round(STRIKE_COOLDOWN * 0.6);
    this.strikeDamage = Math.round(this.baseStrikeDamage * 1.25);
    this.strikeCount = 2;
    this.sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(150, () => this.alive && this.sprite.clearTint());
    this.scene.cameras.main.shake(220, 0.006);
    if (this.glowFx) this.glowFx.outerStrength = 2.6;
  }

  die() {
    this.scene.cameras.main.shake(260, 0.008);
    for (const s of this.strikes) if (s.telegraph) s.telegraph.destroy();
    this.strikes = [];
    if (this.auraRing) { this.auraRing.destroy(); this.auraRing = null; }
    super.die();
  }

  _tryStrike(player) {
    const now = this.scene.time.now;
    if (now - this.lastStrikeAt < this.strikeCooldown) return;
    const dist = Math.hypot(player.gx - this.gx, player.gy - this.gy);
    if (dist > STRIKE_RANGE) return;
    this.lastStrikeAt = now;

    for (let i = 0; i < this.strikeCount; i++) {
      const offsetX = i === 0 ? 0 : Phaser.Math.Between(-2, 2);
      const offsetY = i === 0 ? 0 : Phaser.Math.Between(-2, 2);
      const gx = Phaser.Math.Clamp(Math.round(player.gx + offsetX), 0, this.tileMap.cols - 1);
      const gy = Phaser.Math.Clamp(Math.round(player.gy + offsetY), 0, this.tileMap.rows - 1);
      this._spawnStrikeWarning(gx, gy);
    }
  }

  _spawnStrikeWarning(gx, gy) {
    const world = this.tileMap.gridToWorld(gx, gy);
    const ring = this.scene.add.image(world.x, world.y, 'light_pool')
      .setTint(0xfff066).setDepth(8999).setBlendMode(Phaser.BlendModes.ADD).setScale(0.85).setAlpha(0.75);
    this.scene.tweens.add({ targets: ring, alpha: 0.25, duration: 150, yoyo: true, repeat: -1 });

    const strike = { gx, gy, telegraph: ring };
    this.strikes.push(strike);
    this.scene.time.delayedCall(STRIKE_CHARGE_MS, () => this._resolveStrike(strike));
  }

  _resolveStrike(strike) {
    this.strikes = this.strikes.filter((s) => s !== strike);
    strike.telegraph.destroy();
    if (!this.alive) return;

    const world = this.tileMap.gridToWorld(strike.gx, strike.gy);
    const bolt = this.scene.add.rectangle(world.x, world.y - TILE_SIZE * 2, 6, TILE_SIZE * 4, 0xdff7ff, 0.95)
      .setDepth(9002).setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({ targets: bolt, alpha: 0, duration: 220, onComplete: () => bolt.destroy() });
    this.scene.cameras.main.flash(70, 220, 240, 255);

    const player = this.scene.player;
    if (player && player.alive) {
      const dist = Math.hypot(player.gx - strike.gx, player.gy - strike.gy);
      if (dist <= STRIKE_RADIUS) player.takeDamage(this.strikeDamage);
    }
  }

  update(deltaSec, player) {
    if (!this.alive) {
      if (this.nameTag) {
        this.nameTag.destroy();
        this.nameTag = null;
      }
      for (const s of this.strikes) if (s.telegraph) s.telegraph.destroy();
      this.strikes = [];
      return;
    }

    if (!this.enraged && this.hp / this.maxHp <= ENRAGE_THRESHOLD) {
      this._enrage();
    }

    super.update(deltaSec, player);
    this._tryStrike(player);

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
