import Phaser from 'phaser';
import Enemy from './Enemy.js';

const SHOT_RANGE = 5.5;
const SHOT_COOLDOWN = 2000;
const SHOT_SPEED = 4.2;
const SHOT_LIFETIME = 1800;
const SHOT_HIT_RADIUS = 0.4;
const SHOT_DAMAGE = 9;

// Drone Atirador — inimigo novo da Fase 05. O primeiro inimigo COMUM (não
// chefe) do jogo com ataque à distância: dispara um projétil lento e reto
// na direção do jogador quando dentro de alcance, além do ataque por
// contato normal — obriga a fechar distância em vez de só correr por cima.
export default class ShooterDrone extends Enemy {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, { texture: 'enemy_shooter', ...opts });
    this.lastShotAt = -9999;
    this.shots = [];
  }

  _tryShoot(player) {
    const now = this.scene.time.now;
    if (now - this.lastShotAt < SHOT_COOLDOWN) return;
    const dist = Math.hypot(player.gx - this.gx, player.gy - this.gy);
    if (dist > SHOT_RANGE || dist < 0.1) return;
    this.lastShotAt = now;

    const dirX = (player.gx - this.gx) / dist;
    const dirY = (player.gy - this.gy) / dist;
    const world = this.tileMap.gridToWorld(this.gx, this.gy);
    const sprite = this.scene.add.image(world.x, world.y, 'bolt').setDepth(9000).setBlendMode(Phaser.BlendModes.ADD).setTint(0x9fd0ff);

    this.shots.push({ gx: this.gx, gy: this.gy, vx: dirX * SHOT_SPEED, vy: dirY * SHOT_SPEED, sprite, bornAt: now });
  }

  _updateShots(deltaSec, player) {
    const now = this.scene.time.now;
    this.shots = this.shots.filter((shot) => {
      shot.gx += shot.vx * deltaSec;
      shot.gy += shot.vy * deltaSec;

      const expired = now - shot.bornAt > SHOT_LIFETIME;
      const hitWall = !this.tileMap.isWalkable(Math.round(shot.gx), Math.round(shot.gy));
      const distToPlayer = Math.hypot(player.gx - shot.gx, player.gy - shot.gy);
      const hitPlayer = player.alive && distToPlayer <= SHOT_HIT_RADIUS;

      if (hitPlayer) player.takeDamage(SHOT_DAMAGE);

      if (expired || hitWall || hitPlayer) {
        shot.sprite.destroy();
        return false;
      }

      const world = this.tileMap.gridToWorld(shot.gx, shot.gy);
      shot.sprite.setPosition(world.x, world.y);
      shot.sprite.setDepth(Math.round(shot.gy) * 10 + 6);
      return true;
    });
  }

  die() {
    for (const shot of this.shots) shot.sprite.destroy();
    this.shots = [];
    super.die();
  }

  update(deltaSec, player) {
    if (!this.alive) {
      this._updateShots(deltaSec, player);
      return;
    }
    super.update(deltaSec, player);
    this._tryShoot(player);
    this._updateShots(deltaSec, player);
  }
}
