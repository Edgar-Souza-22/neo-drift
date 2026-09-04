import BossBase from './boss/BossBase.js';
import { SelfBurstAttack, ProjectileAttack } from './boss/attacks.js';

const WALL_COOLDOWN = 3200;
const WALL_DURATION = 2200;
const WALL_FIRST_DELAY = 900;

// O Sysadmin — sub-confronto da Fase 12. Além do kit corpo-a-corpo + dardo,
// planta um par de barreiras em cruz (o mesmo tijolo do Drone de Firewall,
// em dobro). Sem fúria — O Administrador fecha a fase.
export default class SysadminBoss extends BossBase {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, {
      hp: opts.hp || 600,
      speed: opts.speed || 1.1,
      attackDamage: opts.attackDamage || 36,
      xpReward: opts.xpReward || 200,
      texture: opts.texture || 'enemy_sysadmin',
      hpBarWidth: 40,
      scale: 1.1,
      isMiniBoss: true,
      hasEnrage: false,
      ammoDropChance: opts.ammoDropChance ?? 0,
      name: opts.name || 'O SYSADMIN',
      nameColor: '#2ef0c8',
      nameOffset: 36,
      barOffset: 34,
      auraTint: 0x2ef0c8,
      auraScale: 0.95,
      onDeath: opts.onDeath
    });

    this.addAttack(new SelfBurstAttack(this, {
      damage: opts.slamDamage || 30, cooldown: 3000, maxRange: 1.85,
      radius: 1.5, telegraphMs: 500, tint: 0x2ef0c8, lockMove: true, firstDelay: 800
    }));
    this.addAttack(new ProjectileAttack(this, {
      damage: 20, cooldown: 2400, maxRange: 6.5, minRange: 1.2,
      speed: 4.3, tint: 0x2ef0c8, windupMs: 180, firstDelay: 1100
    }));

    this.lastWallAt = scene.time.now - WALL_COOLDOWN + WALL_FIRST_DELAY;
    this.walls = [];
  }

  _clearWalls() {
    for (const wall of this.walls) this.scene.clearFirewall?.(wall);
    this.walls = [];
  }

  _tryWalls(player) {
    if (!player?.alive) return;
    const now = this.scene.time.now;
    if (now - this.lastWallAt < WALL_COOLDOWN) return;
    this.walls = this.walls.filter((w) => now < w.until);
    if (this.walls.length) return;

    const ox = Math.round(this.gx);
    const oy = Math.round(this.gy);
    const spots = [
      { gx: ox + 1, gy: oy },
      { gx: ox - 1, gy: oy },
      { gx: ox, gy: oy + 1 },
      { gx: ox, gy: oy - 1 }
    ];
    const placed = [];
    for (const spot of spots) {
      if (placed.length >= 2) break;
      const wall = this.scene.placeFirewall?.(spot.gx, spot.gy, WALL_DURATION);
      if (wall) placed.push(wall);
    }
    if (placed.length) {
      this.walls = placed;
      this.lastWallAt = now;
    }
  }

  die() {
    this._clearWalls();
    super.die();
  }

  update(deltaSec, player) {
    super.update(deltaSec, player);
    if (this.alive) this._tryWalls(player);
  }
}
