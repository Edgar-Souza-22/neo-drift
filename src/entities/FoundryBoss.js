import Phaser from 'phaser';
import Enemy from './Enemy.js';
import { TILE_SIZE } from '../utils/constants.js';
import { playSfx } from '../audio/AudioManager.js';

const ENRAGE_THRESHOLD = 0.35;
const BEAM_RANGE = 6.5;
const BEAM_LENGTH = 7.5;
const BEAM_HALF_WIDTH = 0.5;
const BEAM_CHARGE_MS = 500;
const BEAM_DURATION_MS = 500;
const BEAM_COOLDOWN_MS = 2800;

// Chefe da Ala de Fundição — diferente do Guardião Núcleo (Fase 01, que
// arremessa bolts homing): mira uma linha reta, telegrafa por 0.5s (dá pra
// desviar) e então dispara uma rajada vermelha sólida que dura exatamente
// 0.5s, causando dano a quem estiver na linha de tiro. Fica parado enquanto
// mira/dispara — vulnerável a ataques corpo a corpo durante a janela.
export default class FoundryBoss extends Enemy {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, {
      hp: opts.hp || 600,
      speed: opts.speed || 1.15,
      attackDamage: opts.attackDamage || 20,
      xpReward: opts.xpReward || 280,
      texture: opts.texture || 'boss_foundry',
      hpBarWidth: 46,
      scale: 1.15,
      onDeath: opts.onDeath
    });
    this.isBoss = true;
    this.baseSpeed = this.speed;
    this.baseAttackDamage = this.attackDamage;
    this.enraged = false;

    this.beamDamage = opts.beamDamage || 22;
    this.baseBeamDamage = this.beamDamage;
    this.beamCooldown = BEAM_COOLDOWN_MS;
    this.lastBeamAt = -9999;
    this.beam = null;

    this.nameTag = this.scene.add.text(this.sprite.x, this.sprite.y - 44, opts.name || 'FUNDIDOR PRIMORDIAL', {
      fontFamily: 'Courier New',
      fontSize: '11px',
      color: '#ff5a3d'
    }).setOrigin(0.5).setDepth(9002);

    this.glowFx = this.sprite.preFX.addGlow(0xffcf3d, 1.4, 0, false);

    this.auraRing = this.scene.add.image(this.sprite.x, this.sprite.y, 'boss_aura')
      .setBlendMode(Phaser.BlendModes.ADD).setTint(0xffcf3d).setAlpha(0.55).setScale(1.15);
    this.scene.tweens.add({ targets: this.auraRing, scale: 1.35, alpha: 0.25, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
  }

  _enrage() {
    this.enraged = true;
    playSfx(this.scene, 'sfx_enrage', { volume: 0.55 });
    this.speed = this.baseSpeed * 1.5;
    this.attackDamage = Math.round(this.baseAttackDamage * 1.4);
    this.beamCooldown = Math.round(BEAM_COOLDOWN_MS * 0.6);
    this.beamDamage = Math.round(this.baseBeamDamage * 1.3);
    this.sprite.setTintFill(0xffcf3d);
    this.scene.time.delayedCall(150, () => this.alive && this.sprite.clearTint());
    this.scene.cameras.main.shake(220, 0.006);
    if (this.glowFx) this.glowFx.outerStrength = 2.6;
  }

  die() {
    this.scene.cameras.main.shake(260, 0.008);
    this._clearBeam();
    if (this.auraRing) { this.auraRing.destroy(); this.auraRing = null; }
    super.die();
  }

  _clearBeam() {
    if (this.beam) {
      if (this.beam.telegraph) this.beam.telegraph.destroy();
      if (this.beam.rect) this.beam.rect.destroy();
      this.beam = null;
    }
  }

  // Mira e trava a direção, mostrando uma linha de aviso fina e pulsante
  // por BEAM_CHARGE_MS antes do disparo — dá tempo do jogador sair da linha.
  _tryStartBeam(player) {
    if (this.beam) return;
    const now = this.scene.time.now;
    if (now - this.lastBeamAt < this.beamCooldown) return;
    const dist = Math.hypot(player.gx - this.gx, player.gy - this.gy);
    if (dist > BEAM_RANGE || dist < 0.1) return;

    this.lastBeamAt = now;
    const dirX = (player.gx - this.gx) / dist;
    const dirY = (player.gy - this.gy) / dist;
    const angle = Math.atan2(dirY, dirX);
    const lengthPx = BEAM_LENGTH * TILE_SIZE;

    const world = this.tileMap.gridToWorld(this.gx, this.gy);
    const telegraph = this.scene.add.rectangle(
      world.x + Math.cos(angle) * lengthPx / 2,
      world.y + Math.sin(angle) * lengthPx / 2,
      lengthPx, 4, 0xff1f3d, 0.7
    ).setRotation(angle).setDepth(8999).setBlendMode(Phaser.BlendModes.ADD);

    this.scene.tweens.add({ targets: telegraph, alpha: 0.15, duration: 130, yoyo: true, repeat: -1 });

    this.beam = {
      phase: 'charge', dirX, dirY, angle, telegraph, rect: null,
      hitPlayer: false, originGx: this.gx, originGy: this.gy
    };

    this.scene.time.delayedCall(BEAM_CHARGE_MS, () => this._fireBeam());
  }

  // Substitui a linha fina de aviso por uma rajada sólida (0.5s de duração),
  // presa à posição/direção travadas no início da mira.
  _fireBeam() {
    if (!this.alive || !this.beam || this.beam.phase !== 'charge') return;
    this.beam.telegraph.destroy();

    const { angle } = this.beam;
    const lengthPx = BEAM_LENGTH * TILE_SIZE;
    const widthPx = BEAM_HALF_WIDTH * 2 * TILE_SIZE;
    const world = this.tileMap.gridToWorld(this.beam.originGx, this.beam.originGy);
    const rect = this.scene.add.rectangle(
      world.x + Math.cos(angle) * lengthPx / 2,
      world.y + Math.sin(angle) * lengthPx / 2,
      lengthPx, widthPx, 0xff1f3d, 0.85
    ).setRotation(angle).setDepth(9000).setBlendMode(Phaser.BlendModes.ADD);

    this.scene.cameras.main.flash(80, 255, 60, 80);
    this.beam.phase = 'active';
    this.beam.rect = rect;

    this.scene.time.delayedCall(BEAM_DURATION_MS, () => this._endBeam());
  }

  _endBeam() {
    this._clearBeam();
  }

  _checkBeamHit(player) {
    if (!this.beam || this.beam.phase !== 'active' || this.beam.hitPlayer) return;
    if (!player.alive) return;

    const px = player.gx - this.beam.originGx;
    const py = player.gy - this.beam.originGy;
    const proj = px * this.beam.dirX + py * this.beam.dirY;
    if (proj < 0 || proj > BEAM_LENGTH) return;
    const perp = Math.abs(px * this.beam.dirY - py * this.beam.dirX);
    if (perp <= BEAM_HALF_WIDTH) {
      player.takeDamage(this.beamDamage);
      this.beam.hitPlayer = true;
    }
  }

  update(deltaSec, player) {
    if (!this.alive) {
      if (this.nameTag) {
        this.nameTag.destroy();
        this.nameTag = null;
      }
      this._clearBeam();
      return;
    }

    if (!this.enraged && this.hp / this.maxHp <= ENRAGE_THRESHOLD) {
      this._enrage();
    }

    if (this.beam) {
      // Fica parado (vulnerável) enquanto mira/dispara a rajada.
      this.knockback.x *= 0.82;
      this.knockback.y *= 0.82;
      const world = this.tileMap.gridToWorld(this.gx, this.gy);
      this.sprite.setPosition(world.x + this.knockback.x, world.y + this.knockback.y);
      this._checkBeamHit(player);
    } else {
      super.update(deltaSec, player);
      this._tryStartBeam(player);
    }

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
