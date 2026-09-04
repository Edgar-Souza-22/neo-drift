import Enemy from './Enemy.js';
import BossBase from './boss/BossBase.js';
import { SelfBurstAttack, ProjectileAttack } from './boss/attacks.js';
import { playSfx } from '../audio/AudioManager.js';

const SUMMON_RANGE = 8;
const SUMMON_COOLDOWN = 4200;
const MAX_CONCURRENT_SENTINELS = 2;
const SPAWN_RADIUS = 2.4;

// Vigia Central (Fase 04) — golpe de solo + rajada de bolts (o ataque à
// distância que faltava) + invocação de Sentinelas de Defesa.
export default class CoreBoss extends BossBase {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, {
      hp: opts.hp || 760,
      speed: opts.speed || 1.15,
      attackDamage: opts.attackDamage || 22,
      xpReward: opts.xpReward || 380,
      texture: opts.texture || 'boss_core',
      name: opts.name || 'VIGIA CENTRAL',
      nameColor: '#d88bff',
      auraTint: 0xd88bff,
      onDeath: opts.onDeath,
      enrageSpeedMul: 1.45,
      enrageAttackMods: { cooldownMul: 0.65, damageMul: 1.25, extraCount: 1 }
    });
    this.summonCooldown = SUMMON_COOLDOWN;
    this.summonCount = 1;
    this.lastSummonAt = -9999;
    this.onEnemyDeath = opts.onDeath;

    this.addAttack(new SelfBurstAttack(this, {
      damage: 24, cooldown: 3000, maxRange: 1.8, radius: 1.5,
      telegraphMs: 450, tint: 0xd88bff, lockMove: true, firstDelay: 1000
    }));
    this.addAttack(new ProjectileAttack(this, {
      damage: 14, cooldown: 2400, maxRange: 7, minRange: 1.0,
      count: 3, spreadDeg: 28, speed: 4.4, tint: 0xd88bff,
      windupMs: 200, firstDelay: 700
    }));
  }

  onEnrage() {
    this.summonCooldown = Math.round(SUMMON_COOLDOWN * 0.6);
    this.summonCount = 2;
  }

  _countAliveSentinels() {
    return this.scene.enemies.reduce((n, e) => n + (e.isSentinel && e.alive ? 1 : 0), 0);
  }

  _pickSpawnSpot() {
    for (let attempt = 0; attempt < 8; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 1.2 + Math.random() * SPAWN_RADIUS;
      const gx = Math.round(this.gx + Math.cos(angle) * radius);
      const gy = Math.round(this.gy + Math.sin(angle) * radius);
      if (this.tileMap.isWalkable(gx, gy)) return { gx, gy };
    }
    return null;
  }

  _trySummon(player) {
    const now = this.scene.time.now;
    if (now - this.lastSummonAt < this.summonCooldown) return;
    const dist = Math.hypot(player.gx - this.gx, player.gy - this.gy);
    if (dist > SUMMON_RANGE) return;
    if (this._countAliveSentinels() >= MAX_CONCURRENT_SENTINELS) return;
    this.lastSummonAt = now;
    playSfx(this.scene, 'sfx_door', { volume: 0.3 });

    let spawned = 0;
    for (let i = 0; i < this.summonCount; i++) {
      if (this._countAliveSentinels() + spawned >= MAX_CONCURRENT_SENTINELS) break;
      const spot = this._pickSpawnSpot();
      if (!spot) continue;
      const sentinel = new Enemy(this.scene, this.tileMap, spot.gx, spot.gy, {
        hp: 40, speed: 0.5, attackDamage: 10, xpReward: 12,
        texture: 'enemy_sentinel', hpBarWidth: 20, scale: 0.9,
        onDeath: this.onEnemyDeath
      });
      sentinel.isSentinel = true;
      this.scene.enemies.push(sentinel);
      spawned++;
    }
  }

  update(deltaSec, player) {
    super.update(deltaSec, player);
    if (this.alive && player?.alive) this._trySummon(player);
  }
}
