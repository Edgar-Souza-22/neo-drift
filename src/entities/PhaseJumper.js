import Phaser from 'phaser';
import Enemy from './Enemy.js';
import { playSfx } from '../audio/AudioManager.js';

const BLINK_COOLDOWN = 1800;
const BLINK_RANGE = 4.5; // só pisca se o jogador estiver dentro desse raio
const CLOSE_MIN = 0.9;
const CLOSE_MAX = 1.3; // pisca pra perto o bastante pra golpear no frame seguinte
const RETREAT_MIN = 2.4;
const RETREAT_MAX = 3.2; // pisca pra longe o bastante pra sair do alcance de ataque
const TOO_CLOSE = 1.4; // abaixo disso, o próximo blink é de fuga, não de aproximação
const FADE_MS = 140;

// Saltador de Fase — inimigo novo da Fase 07. Diferente de todos os
// anteriores (perseguição normal, disparo reto do Drone Atirador, pulso em
// área da Sentinela): pisca (blink) pra dentro/fora de alcance de melee.
// Aproxima-se num salto curto pra golpear, depois pisca pra longe de novo —
// nunca fica parado ao seu lado por muito tempo, obrigando a usar arma à
// distância ou prever o próximo salto em vez de só segurar o ataque.
export default class PhaseJumper extends Enemy {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, { texture: 'enemy_phasejumper', ...opts });
    this.lastBlinkAt = -9999;
    this.blinking = false;
  }

  _pickBlinkSpot(player, minR, maxR) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = minR + Math.random() * (maxR - minR);
      const gx = Math.round(player.gx + Math.cos(angle) * radius);
      const gy = Math.round(player.gy + Math.sin(angle) * radius);
      if (this.canOccupy(gx, gy)) return { gx, gy };
    }
    return null;
  }

  _tryBlink(player) {
    if (this.blinking) return;
    const now = this.scene.time.now;
    if (now - this.lastBlinkAt < BLINK_COOLDOWN) return;
    const dist = Math.hypot(player.gx - this.gx, player.gy - this.gy);
    if (dist > BLINK_RANGE) return;

    const tooClose = dist < TOO_CLOSE;
    const spot = tooClose
      ? this._pickBlinkSpot(player, RETREAT_MIN, RETREAT_MAX)
      : this._pickBlinkSpot(player, CLOSE_MIN, CLOSE_MAX);
    if (!spot) return;

    this.lastBlinkAt = now;
    this.blinking = true;
    this.scene.tweens.add({
      targets: this.sprite,
      alpha: 0,
      scale: this.baseScale * 0.5,
      duration: FADE_MS,
      ease: 'Cubic.In',
      onComplete: () => {
        this.gx = spot.gx;
        this.gy = spot.gy;
        const world = this.tileMap.gridToWorld(spot.gx, spot.gy);
        this.sprite.setPosition(world.x, world.y);
        this.sprite.setAlpha(1);
        this.sprite.setScale(this.baseScale);
        playSfx(this.scene, 'sfx_door', { volume: 0.2 });

        const flash = this.scene.add.image(world.x, world.y, 'light_pool')
          .setTint(0xd88bff).setBlendMode(Phaser.BlendModes.ADD).setDepth(9000).setScale(0.55).setAlpha(0.85);
        this.scene.tweens.add({ targets: flash, alpha: 0, scale: 1, duration: 220, onComplete: () => flash.destroy() });

        this.blinking = false;
      }
    });
  }

  update(deltaSec, player) {
    if (!this.alive) return;
    // Durante o fade não anda nem ataca — só existe visualmente sumindo.
    if (this.blinking) return;

    super.update(deltaSec, player);
    if (player.alive) this._tryBlink(player);
  }
}
