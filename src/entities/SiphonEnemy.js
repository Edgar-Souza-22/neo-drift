import Enemy from './Enemy.js';
import { TILE_SIZE } from '../utils/constants.js';
import { GameState } from '../state/GameState.js';

const PULSE_RANGE = 2.8;
const PULSE_DAMAGE = 12;
const PULSE_TELEGRAPH_MS = 420;
const PULSE_COOLDOWN = 2800;

// Sonda Sifão — elite da Fase 12. Pulso curto que DRENA 1 carga da pistola
// (se houver) e ainda fere. Distinto do Drone Inibidor (trava o gatilho sem
// roubar munição) e do Portador (tosse de esporos + charco).
export default class SiphonEnemy extends Enemy {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, { texture: 'enemy_siphon', ...opts });
    this.lastPulseAt = -9999;
    this.pulseFx = null;
  }

  _tryPulse(player) {
    if (this.pulseFx || !player?.alive) return;
    const now = this.scene.time.now;
    if (now - this.lastPulseAt < PULSE_COOLDOWN) return;
    const dist = Math.hypot(player.gx - this.gx, player.gy - this.gy);
    if (dist > PULSE_RANGE) return;
    this.lastPulseAt = now;

    const world = this.tileMap.gridToWorld(this.gx, this.gy);
    const ring = this.scene.add.image(world.x, world.y, 'light_pool')
      .setTint(0xff3d8a).setBlendMode(Phaser.BlendModes.ADD).setDepth(9000)
      .setScale(0.22).setAlpha(0.9);
    this.pulseFx = ring;

    this.scene.tweens.add({
      targets: ring,
      scale: (PULSE_RANGE * TILE_SIZE * 2) / 120,
      alpha: 0,
      duration: PULSE_TELEGRAPH_MS,
      ease: 'Cubic.Out',
      onComplete: () => {
        ring.destroy();
        this.pulseFx = null;
        if (!this.alive || !player.alive) return;
        const d = Math.hypot(player.gx - this.gx, player.gy - this.gy);
        if (d > PULSE_RANGE) return;
        if (GameState.hasPistol && GameState.pistolAmmo > 0) {
          GameState.pistolAmmo -= 1;
          this.scene.game.events.emit('item-pickup', 'Uma Sonda Sifão drenou 1 carga da pistola.');
        }
        player.takeDamage(PULSE_DAMAGE);
      }
    });
  }

  die() {
    if (this.pulseFx) { this.pulseFx.destroy(); this.pulseFx = null; }
    super.die();
  }

  update(deltaSec, player) {
    super.update(deltaSec, player);
    if (this.alive) this._tryPulse(player);
  }
}
