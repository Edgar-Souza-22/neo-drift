import SentrySentinel from './SentrySentinel.js';
import BossBase from './boss/BossBase.js';
import { SelfBurstAttack, GroundMarkAttack } from './boss/attacks.js';
import { playSfx } from '../audio/AudioManager.js';

const SUMMON_RANGE = 8;
const SUMMON_COOLDOWN = 5200;
const MAX_CONCURRENT_SENTINELS = 2;
const SPAWN_RADIUS = 2.6;

// A Emissora (Fase 08) — pulso corpo a corpo que acompanha o corpo +
// marca de transmissão no chão + invocação de Sentinelas de Varredura
// (sabotável pelo Console de Override).
export default class EmissoraBoss extends BossBase {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, {
      hp: opts.hp || 1600,
      speed: opts.speed || 1.15,
      attackDamage: opts.attackDamage || 24,
      xpReward: opts.xpReward || 800,
      texture: opts.texture || 'boss_emissora',
      hpBarWidth: 50,
      name: opts.name || 'A EMISSORA',
      nameColor: '#3dffa0',
      nameOffset: 48,
      auraTint: 0x3dffa0,
      onDeath: opts.onDeath,
      enrageAttackMods: { cooldownMul: 0.6, damageMul: 1.25, extraCount: 1 }
    });
    this.summonCooldown = SUMMON_COOLDOWN;
    this.summonCount = 1;
    this.lastSummonAt = -1000;
    this.summonDisabled = false;
    this.onEnemyDeath = opts.onDeath;

    this.addAttack(new SelfBurstAttack(this, {
      damage: 24, cooldown: 2800, maxRange: 1.9, radius: 1.5,
      telegraphMs: 400, tint: 0x3dffa0, lockMove: false, firstDelay: 900
    }));
    this.addAttack(new GroundMarkAttack(this, {
      damage: opts.strikeDamage || 22, cooldown: 2400, maxRange: 7.5,
      telegraphMs: 700, radius: 0.9, tint: 0x3dffa0, style: 'lightning',
      flash: [220, 255, 235], firstDelay: 700
    }));
  }

  disableSummon() {
    this.summonDisabled = true;
  }

  onEnrage() {
    this.summonCooldown = Math.round(SUMMON_COOLDOWN * 0.65);
  }

  _countAliveSentinels() {
    return this.scene.enemies.reduce((n, e) => n + (e.isSentinel && e.alive ? 1 : 0), 0);
  }

  _pickSpawnSpot() {
    for (let attempt = 0; attempt < 8; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 1.4 + Math.random() * SPAWN_RADIUS;
      const gx = Math.round(this.gx + Math.cos(angle) * radius);
      const gy = Math.round(this.gy + Math.sin(angle) * radius);
      if (this.tileMap.isWalkable(gx, gy)) return { gx, gy };
    }
    return null;
  }

  _trySummon(player) {
    if (this.summonDisabled) return;
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
      const sentinel = new SentrySentinel(this.scene, this.tileMap, spot.gx, spot.gy, {
        hp: 32, xpReward: 14, onDeath: this.onEnemyDeath
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
