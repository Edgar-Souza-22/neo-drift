import Enemy from './Enemy.js';

const DEPLOY_RANGE = 4.2;
const DEPLOY_COOLDOWN = 2800;
const WALL_DURATION = 2400;
const FIRST_DELAY = 700;

// Drone de Firewall — inimigo comum da Fase 12. Em vez de pulso, tiro ou
// poça, planta uma barreira temporária no tile à frente do jogador: força
// desvio de rota, não dano direto. Distinto da Sentinela (feixe), do
// Atirador (projétil) e do Inibidor (trava a pistola).
export default class FirewallDrone extends Enemy {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, { texture: 'enemy_firewall', ...opts });
    this.lastDeployAt = scene.time.now - DEPLOY_COOLDOWN + FIRST_DELAY;
    this.wall = null;
  }

  _clearWall() {
    if (this.wall) {
      this.scene.clearFirewall?.(this.wall);
      this.wall = null;
    }
  }

  _tryDeploy(player) {
    if (!player?.alive || this.wall) return;
    const now = this.scene.time.now;
    if (now - this.lastDeployAt < DEPLOY_COOLDOWN) return;
    const dist = Math.hypot(player.gx - this.gx, player.gy - this.gy);
    if (dist > DEPLOY_RANGE || dist < 0.9) return;

    const dx = player.gx - this.gx;
    const dy = player.gy - this.gy;
    const candidates = Math.abs(dx) >= Math.abs(dy)
      ? [
        { gx: Math.round(this.gx + Math.sign(dx)), gy: Math.round(this.gy) },
        { gx: Math.round(this.gx), gy: Math.round(this.gy + Math.sign(dy) || 1) }
      ]
      : [
        { gx: Math.round(this.gx), gy: Math.round(this.gy + Math.sign(dy)) },
        { gx: Math.round(this.gx + Math.sign(dx) || 1), gy: Math.round(this.gy) }
      ];

    for (const cell of candidates) {
      const wall = this.scene.placeFirewall?.(cell.gx, cell.gy, WALL_DURATION);
      if (wall) {
        this.wall = wall;
        this.lastDeployAt = now;
        return;
      }
    }
  }

  die() {
    this._clearWall();
    super.die();
  }

  update(deltaSec, player) {
    if (this.wall && this.scene.time.now >= this.wall.until) this.wall = null;
    super.update(deltaSec, player);
    if (this.alive) this._tryDeploy(player);
  }
}
