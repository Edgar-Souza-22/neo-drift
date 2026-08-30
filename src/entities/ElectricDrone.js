import Phaser from 'phaser';
import Enemy from './Enemy.js';
import { TILE_SIZE } from '../utils/constants.js';

const PULSE_TRIGGER_RANGE = 3;
const PULSE_RADIUS = 1.6; // tiles
const PULSE_DAMAGE = 12;
const PULSE_TELEGRAPH_MS = 420;
const PULSE_COOLDOWN = 2400;

// Sentinela Elétrica — inimigo novo da Fase 03. Além da perseguição/ataque
// corpo a corpo padrão, emite periodicamente um pulso de choque em área (um
// anel que se expande e causa dano se o jogador estiver dentro no fim da
// expansão) — diferente de todo inimigo comum anterior, que só bate por
// contato direto.
export default class ElectricDrone extends Enemy {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, { texture: 'enemy_electric', ...opts });
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
      .setTint(0x9fffff).setBlendMode(Phaser.BlendModes.ADD).setDepth(9000).setScale(0.25).setAlpha(0.9);
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
    super.die();
  }

  update(deltaSec, player) {
    super.update(deltaSec, player);
    if (this.alive) this._tryPulse(player);
  }
}
