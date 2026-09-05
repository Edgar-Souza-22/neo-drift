import Phaser from 'phaser';
import Enemy from './Enemy.js';
import { playSfx } from '../audio/AudioManager.js';

const SHOVE_RANGE = 1.7;
const SHOVE_COOLDOWN = 3200;
const TELEGRAPH_MS = 380;
const PUSH_DISTANCE = 2.7;
const PUSH_MS = 250;
const FIRST_DELAY = 700;

// Operário de Convés — inimigo grande da Refinaria (Fase 14). Lento e
// resistente; de perto do jogador, prepara um empurrão de aríete
// hidráulico (telégrafo curto) que arremessa o jogador pra trás com
// Player.pushBack — perto d'água/pontes, isso pode jogar o jogador na
// água (ver TileMap.isWater + Player.canOccupy allowWater). Contato normal
// (perseguir/bater) continua herdado de Enemy.update().
export default class PusherEnemy extends Enemy {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, {
      texture: 'enemy_pusher', hpBarWidth: 36, scale: 1.25, ...opts
    });
    this.lastShoveAt = scene.time.now - SHOVE_COOLDOWN + FIRST_DELAY;
    this.shove = null;
    this.warnRing = null;
  }

  _clearWarn() {
    if (this.warnRing) {
      this.warnRing.destroy();
      this.warnRing = null;
    }
  }

  _tryShove(player) {
    if (!player?.alive || this.shove) return;
    const now = this.scene.time.now;
    if (now - this.lastShoveAt < SHOVE_COOLDOWN) return;
    const dist = Math.hypot(player.gx - this.gx, player.gy - this.gy);
    if (dist > SHOVE_RANGE) return;

    this.lastShoveAt = now;
    playSfx(this.scene, 'sfx_enrage', { volume: 0.24 });
    const world = this.tileMap.gridToWorld(this.gx, this.gy);
    this.warnRing = this.scene.add.image(world.x, world.y, 'light_pool')
      .setTint(0xc23b3b).setDepth(8999).setBlendMode(Phaser.BlendModes.ADD)
      .setScale(0.3).setAlpha(0.7);
    this.scene.tweens.add({
      targets: this.warnRing, scale: 0.95, alpha: 0.9, duration: TELEGRAPH_MS, ease: 'Cubic.In'
    });
    const dx = player.gx - this.gx;
    const dy = player.gy - this.gy;
    const d = Math.hypot(dx, dy) || 1;
    this.shove = { dirX: dx / d, dirY: dy / d, until: now + TELEGRAPH_MS };
  }

  _resolveShove(player) {
    this._clearWarn();
    const { dirX, dirY } = this.shove;
    this.shove = null;
    if (!this.alive) return;

    const world = this.tileMap.gridToWorld(this.gx, this.gy);
    const flash = this.scene.add.image(world.x + dirX * 14, world.y + dirY * 14, 'light_pool')
      .setTint(0xffffff).setBlendMode(Phaser.BlendModes.ADD).setDepth(9002).setScale(0.6).setAlpha(0.9);
    this.scene.tweens.add({ targets: flash, alpha: 0, scale: 1.4, duration: 200, onComplete: () => flash.destroy() });
    this.scene.cameras.main.shake(120, 0.005);

    if (!player?.alive) return;
    const dist = Math.hypot(player.gx - this.gx, player.gy - this.gy);
    if (dist > SHOVE_RANGE + 0.4) return;
    player.takeDamage(this.attackDamage);
    player.pushBack?.(dirX, dirY, PUSH_DISTANCE, PUSH_MS);
  }

  die() {
    this._clearWarn();
    this.shove = null;
    super.die();
  }

  update(deltaSec, player) {
    if (!this.alive) return;

    if (this.shove) {
      if (this.scene.time.now < this.stunUntil) {
        this._clearWarn();
        this.shove = null;
        super.update(deltaSec, player);
        return;
      }
      if (this.scene.time.now >= this.shove.until) {
        this._resolveShove(player);
      }
      return;
    }

    super.update(deltaSec, player);
    if (this.alive) this._tryShove(player);
  }
}
