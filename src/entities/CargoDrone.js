import Enemy from './Enemy.js';

const CONTACT_RANGE = 0.8;
const CONTACT_COOLDOWN = 650;

// Drone de Carga — inimigo comum da Fase 13. Não persegue: só circula uma
// rota fixa de pátio (ida e volta). O perigo é de posição/tempo, como a
// Sentinela de Varredura, mas o corpo inteiro se move em vez de um feixe.
export default class CargoDrone extends Enemy {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, { texture: 'enemy_cargo', speed: opts.speed || 2.05, ...opts });
    this.route = (opts.route && opts.route.length >= 2)
      ? opts.route.map((p) => ({ gx: p.gx, gy: p.gy }))
      : [{ gx, gy }, { gx: gx + 3, gy }];
    this.waypoint = this._nearestWaypoint();
    this.dir = 1;
    this.state = 'route';
  }

  _nearestWaypoint() {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < this.route.length; i++) {
      const d = Math.hypot(this.gx - this.route[i].gx, this.gy - this.route[i].gy);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  }

  _advanceWaypoint() {
    const next = this.waypoint + this.dir;
    if (next < 0 || next >= this.route.length) {
      this.dir *= -1;
      this.waypoint += this.dir;
    } else {
      this.waypoint = next;
    }
  }

  update(deltaSec, player) {
    if (!this.alive) return;

    if (this.scene.time.now < this.stunUntil) {
      this.knockback.x *= 0.82;
      this.knockback.y *= 0.82;
      const world = this.tileMap.gridToWorld(this.gx, this.gy);
      const bob = Math.sin((this.scene.time.now + this.bobPhase) / 220) * 1.4;
      this.sprite.setPosition(world.x + this.knockback.x, world.y + bob + this.knockback.y);
      this.hpBarBg.setPosition(world.x, world.y - 24);
      this.hpBarFg.setPosition(world.x - this.barWidth / 2, world.y - 24);
      return;
    }

    const target = this.route[this.waypoint];
    const dx = target.gx - this.gx;
    const dy = target.gy - this.gy;
    const dist = Math.hypot(dx, dy);
    let dirX = 0;
    let dirY = 0;
    if (dist < 0.12) {
      this._advanceWaypoint();
    } else {
      dirX = dx / dist;
      dirY = dy / dist;
    }

    const nx = this.gx + dirX * this.speed * deltaSec;
    if (this.canOccupy(nx, this.gy)) this.gx = nx;
    const ny = this.gy + dirY * this.speed * deltaSec;
    if (this.canOccupy(this.gx, ny)) this.gy = ny;

    if (player?.alive) {
      const toPlayer = Math.hypot(player.gx - this.gx, player.gy - this.gy);
      if (toPlayer <= CONTACT_RANGE) {
        const now = this.scene.time.now;
        if (now - this.lastAttackAt > CONTACT_COOLDOWN) {
          this.lastAttackAt = now;
          player.takeDamage(this.attackDamage);
          this.sprite.setTintFill(0xe8923d);
          this.scene.time.delayedCall(110, () => this.alive && this.sprite.clearTint());
        }
      }
    }

    this.knockback.x *= 0.82;
    this.knockback.y *= 0.82;

    const world = this.tileMap.gridToWorld(this.gx, this.gy);
    const bob = Math.sin((this.scene.time.now + this.bobPhase) / 180) * 1.1;
    this.sprite.setPosition(world.x + this.knockback.x, world.y + bob + this.knockback.y);
    this.sprite.setDepth(Math.round(this.gy) * 10 + 4);
    this.sprite.setFlipX(dirX < 0);

    this.hpBarBg.setPosition(world.x, world.y - 24);
    this.hpBarFg.setPosition(world.x - this.barWidth / 2, world.y - 24);
    this.hpBarFg.width = this.barWidth * (this.hp / this.maxHp);
    this.hpBarBg.setDepth(9000);
    this.hpBarFg.setDepth(9001);
  }
}
