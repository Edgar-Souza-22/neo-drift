import Phaser from 'phaser';
import Enemy from './Enemy.js';
import { TILE_SIZE } from '../utils/constants.js';

const PULSE_TRIGGER_RANGE = 3;
const PULSE_RADIUS = 1.6; // tiles
const PULSE_JAM_MS = 3000;
const PULSE_TELEGRAPH_MS = 380;
const PULSE_COOLDOWN = 3400;

// Drone Inibidor — inimigo novo da Fase 04. Em vez de causar dano em área
// (como a Sentinela Elétrica da Fase 03), o pulso EMP dele trava a pistola
// do jogador por alguns segundos se acertar — um efeito de status, não
// dano, forçando um respiro do combate corpo a corpo em vez de ferir.
export default class JammerDrone extends Enemy {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, { texture: 'enemy_jammer', ...opts });
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
      .setTint(0xd88bff).setBlendMode(Phaser.BlendModes.ADD).setDepth(9000).setScale(0.25).setAlpha(0.9);
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
        if (player.alive && d <= PULSE_RADIUS) player.jamPistol(PULSE_JAM_MS);
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
