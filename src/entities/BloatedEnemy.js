import Enemy from './Enemy.js';
import { TILE_SIZE } from '../utils/constants.js';

const PULSE_TRIGGER_RANGE = 3.2;
const PULSE_RADIUS = 1.7;
const PULSE_DAMAGE = 14;
const PULSE_TELEGRAPH_MS = 500;
const PULSE_COOLDOWN = 2600;
const PUDDLE_DURATION_MS = 2400;

// Portador — elite da Colônia. Corpo inchado que tosse um anel de esporos
// (pulso em área, distinto do choque da Sentinela Elétrica pela cor/timing)
// e também deixa charco ao morrer.
export default class BloatedEnemy extends Enemy {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, { texture: 'enemy_bloated', ...opts });
    this.lastPulseAt = -9999;
    this.pulseFx = null;
  }

  _tryPulse(player) {
    if (this.pulseFx) return;
    const now = this.scene.time.now;
    if (now - this.lastPulseAt < PULSE_COOLDOWN) return;
    const dist = Math.hypot(player.gx - this.gx, player.gy - this.gy);
    if (dist > PULSE_TRIGGER_RANGE) return;
    this.lastPulseAt = now;

    const world = this.tileMap.gridToWorld(this.gx, this.gy);
    const ring = this.scene.add.image(world.x, world.y, 'light_pool')
      .setTint(0x6dff4a).setBlendMode(Phaser.BlendModes.ADD).setDepth(9000).setScale(0.25).setAlpha(0.9);
    this.pulseFx = ring;

    this.scene.tweens.add({
      targets: ring,
      scale: (PULSE_RADIUS * TILE_SIZE * 2) / 120,
      alpha: 0,
      duration: PULSE_TELEGRAPH_MS,
      ease: 'Cubic.Out',
      onComplete: () => {
        ring.destroy();
        this.pulseFx = null;
        if (!this.alive) return;
        const d = Math.hypot(player.gx - this.gx, player.gy - this.gy);
        if (player.alive && d <= PULSE_RADIUS) player.takeDamage(PULSE_DAMAGE);
      }
    });
  }

  die() {
    if (this.pulseFx) { this.pulseFx.destroy(); this.pulseFx = null; }
    this.scene.spawnToxicPuddle?.(this.gx, this.gy, {
      duration: PUDDLE_DURATION_MS,
      radius: 1.05,
      tint: 0x6dff4a
    });
    super.die();
  }

  update(deltaSec, player) {
    super.update(deltaSec, player);
    if (this.alive) this._tryPulse(player);
  }
}
