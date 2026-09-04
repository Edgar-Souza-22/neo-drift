import Enemy from './Enemy.js';
import { playSfx } from '../audio/AudioManager.js';

const ALIGN_RANGE = 6.2;
const ALIGN_TOL = 0.45;
const CHARGE_COOLDOWN = 2600;
const CHARGE_SPEED = 7.2;
const TELEGRAPH_MS = 420;
const FIRST_DELAY = 800;

// Empilhadeira — elite da Fase 13. Só investe na avenida/rua em que já
// está (eixo cardinal), nunca na diagonal rumo ao jogador. Distinto da
// investida do tanque (que mira) e do drone de carga (que não sai da rota).
export default class StackerEnemy extends Enemy {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, { texture: 'enemy_stacker', hpBarWidth: 32, ...opts });
    this.lastChargeAt = scene.time.now - CHARGE_COOLDOWN + FIRST_DELAY;
    this.charge = null;
    this.warnLine = null;
  }

  _clearWarn() {
    if (this.warnLine) {
      this.warnLine.destroy();
      this.warnLine = null;
    }
  }

  _axisToward(player) {
    const dx = player.gx - this.gx;
    const dy = player.gy - this.gy;
    if (Math.abs(dy) <= ALIGN_TOL && Math.abs(dx) <= ALIGN_RANGE && Math.abs(dx) > 1.1) {
      return { ax: Math.sign(dx), ay: 0 };
    }
    if (Math.abs(dx) <= ALIGN_TOL && Math.abs(dy) <= ALIGN_RANGE && Math.abs(dy) > 1.1) {
      return { ax: 0, ay: Math.sign(dy) };
    }
    return null;
  }

  _tryCharge(player) {
    if (!player?.alive || this.charge) return;
    const now = this.scene.time.now;
    if (now - this.lastChargeAt < CHARGE_COOLDOWN) return;
    const axis = this._axisToward(player);
    if (!axis) return;

    this.lastChargeAt = now;
    playSfx(this.scene, 'sfx_enrage', { volume: 0.22 });
    const world = this.tileMap.gridToWorld(this.gx, this.gy);
    this.warnLine = this.scene.add.rectangle(
      world.x + axis.ax * 48, world.y + axis.ay * 48,
      axis.ax !== 0 ? 96 : 10, axis.ay !== 0 ? 96 : 10,
      0xe8923d, 0.45
    ).setDepth(8998).setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({
      targets: this.warnLine, alpha: 0.15, duration: 110, yoyo: true, repeat: -1
    });
    this.charge = { ax: axis.ax, ay: axis.ay, state: 'warn', until: now + TELEGRAPH_MS, hit: false };
  }

  die() {
    this._clearWarn();
    super.die();
  }

  update(deltaSec, player) {
    if (!this.alive) return;

    if (this.charge) {
      if (this.scene.time.now < this.stunUntil) {
        this.charge = null;
        this._clearWarn();
        super.update(deltaSec, player);
        return;
      }

      if (this.charge.state === 'warn') {
        super.update(deltaSec, player);
        if (this.scene.time.now >= this.charge.until) {
          this.charge.state = 'dash';
          this._clearWarn();
        }
        return;
      }

      if (!player?.alive) {
        this.charge = null;
        return;
      }

      const nx = this.gx + this.charge.ax * CHARGE_SPEED * deltaSec;
      const ny = this.gy + this.charge.ay * CHARGE_SPEED * deltaSec;
      if (!this.canOccupy(nx, ny)) {
        this.charge = null;
        return;
      }
      this.gx = nx;
      this.gy = ny;

      if (!this.charge.hit) {
        const dist = Math.hypot(player.gx - this.gx, player.gy - this.gy);
        if (dist < 0.85) {
          player.takeDamage(this.attackDamage);
          this.charge.hit = true;
          this.scene.cameras.main.shake(80, 0.004);
        }
      }

      const world = this.tileMap.gridToWorld(this.gx, this.gy);
      this.sprite.setPosition(world.x, world.y);
      this.sprite.setDepth(Math.round(this.gy) * 10 + 4);
      this.sprite.setFlipX(this.charge.ax < 0);
      this.hpBarBg.setPosition(world.x, world.y - 24);
      this.hpBarFg.setPosition(world.x - this.barWidth / 2, world.y - 24);
      this.hpBarFg.width = this.barWidth * (this.hp / this.maxHp);
      this.hpBarBg.setDepth(9000);
      this.hpBarFg.setDepth(9001);

      const pastX = this.charge.ax !== 0 && Math.sign(player.gx - this.gx) !== this.charge.ax;
      const pastY = this.charge.ay !== 0 && Math.sign(player.gy - this.gy) !== this.charge.ay;
      if ((this.charge.ax !== 0 && pastX) || (this.charge.ay !== 0 && pastY) || this.charge.hit) {
        this.charge = null;
      }
      return;
    }

    super.update(deltaSec, player);
    if (this.alive) this._tryCharge(player);
  }
}
