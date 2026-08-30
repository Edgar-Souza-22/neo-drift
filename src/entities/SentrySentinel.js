import Phaser from 'phaser';
import Enemy from './Enemy.js';
import { TILE_SIZE } from '../utils/constants.js';

const ROTATE_SPEED = Math.PI / 2.4; // rad/s — uma volta completa a cada ~4,8s
const BEAM_LENGTH_TILES = 6;
const BEAM_HALF_ANGLE_DEG = 7;
const BEAM_DAMAGE = 8;
const BEAM_HIT_COOLDOWN = 550;

// Sentinela de Varredura — inimigo novo da Fase 08. Estacionária (nunca se
// move nem persegue), gira continuamente um feixe de detecção; ficar dentro
// do feixe por um instante causa dano contínuo (tique a tique, não uma vez
// só) — o primeiro inimigo comum cujo perigo vem de POSIÇÃO/tempo em vez de
// perseguição, obrigando a atravessar em vez de simplesmente fugir.
export default class SentrySentinel extends Enemy {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, {
      hp: opts.hp || 55,
      speed: 0,
      attackDamage: opts.attackDamage || 10,
      xpReward: opts.xpReward || 20,
      texture: opts.texture || 'enemy_sentry',
      hpBarWidth: 22,
      onDeath: opts.onDeath
    });
    this.gazeAngle = Math.random() * Math.PI * 2;
    this.lastBeamHitAt = -9999;

    const world = this.tileMap.gridToWorld(this.gx, this.gy);
    this.beamSprite = this.scene.add.rectangle(world.x, world.y, BEAM_LENGTH_TILES * TILE_SIZE, 3, 0x3dffa0, 0.35)
      .setOrigin(0, 0.5)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(9000);
  }

  _updateBeam(deltaSec, player) {
    this.gazeAngle += ROTATE_SPEED * deltaSec;

    const world = this.tileMap.gridToWorld(this.gx, this.gy);
    this.beamSprite.setPosition(world.x, world.y);
    this.beamSprite.setRotation(this.gazeAngle);

    if (!player.alive) return;
    const dx = player.gx - this.gx;
    const dy = player.gy - this.gy;
    const dist = Math.hypot(dx, dy);
    if (dist > BEAM_LENGTH_TILES) return;

    const angleToPlayer = Math.atan2(dy, dx);
    let diff = Phaser.Math.RadToDeg(angleToPlayer - this.gazeAngle);
    diff = ((diff + 180) % 360 + 360) % 360 - 180;
    if (Math.abs(diff) > BEAM_HALF_ANGLE_DEG) return;

    const now = this.scene.time.now;
    if (now - this.lastBeamHitAt < BEAM_HIT_COOLDOWN) return;
    this.lastBeamHitAt = now;
    player.takeDamage(BEAM_DAMAGE);
    this.beamSprite.setFillStyle(0xffffff, 0.8);
    this.scene.time.delayedCall(90, () => this.alive && this.beamSprite.setFillStyle(0x3dffa0, 0.35));
  }

  die() {
    if (this.beamSprite) { this.beamSprite.destroy(); this.beamSprite = null; }
    super.die();
  }

  update(deltaSec, player) {
    // Nunca persegue nem anda (speed=0 já garante isso via Enemy.update),
    // mas ainda recebe dano/knockback/animação de respiração normalmente.
    super.update(deltaSec, player);
    if (this.alive) this._updateBeam(deltaSec, player);
  }
}
