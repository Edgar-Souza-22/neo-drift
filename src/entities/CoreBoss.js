import Phaser from 'phaser';
import Enemy from './Enemy.js';
import { playSfx } from '../audio/AudioManager.js';

const ENRAGE_THRESHOLD = 0.35;
const SUMMON_RANGE = 8;
const SUMMON_COOLDOWN = 4200;
const MAX_CONCURRENT_SENTINELS = 2;
const SPAWN_RADIUS = 2.4; // tiles ao redor do chefe onde as sentinelas aparecem

// Chefe da Fase 04 "Vigia Central" — diferente dos três anteriores (bolts
// homing / rajada telegrafada / raio em área): não tem ataque à distância
// próprio. Em vez disso, invoca periodicamente Sentinelas de Defesa
// (turrets estacionárias e fracas, inimigos de verdade que entram na
// contagem normal de "restam N inimigos") enquanto continua perseguindo e
// batendo corpo a corpo — obriga o jogador a dividir atenção entre o chefe
// e os adds em vez de só desviar de um telegraph.
export default class CoreBoss extends Enemy {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, {
      hp: opts.hp || 760,
      speed: opts.speed || 1.15,
      attackDamage: opts.attackDamage || 22,
      xpReward: opts.xpReward || 380,
      texture: opts.texture || 'boss_core',
      hpBarWidth: 46,
      scale: 1.15,
      onDeath: opts.onDeath
    });
    this.isBoss = true;
    this.baseSpeed = this.speed;
    this.baseAttackDamage = this.attackDamage;
    this.enraged = false;

    this.summonCooldown = SUMMON_COOLDOWN;
    this.summonCount = 1;
    this.lastSummonAt = -9999;
    this.onEnemyDeath = opts.onDeath;

    this.nameTag = this.scene.add.text(this.sprite.x, this.sprite.y - 44, opts.name || 'VIGIA CENTRAL', {
      fontFamily: 'Courier New',
      fontSize: '11px',
      color: '#d88bff'
    }).setOrigin(0.5).setDepth(9002);

    this.glowFx = this.sprite.preFX.addGlow(0xd88bff, 1.4, 0, false);

    this.auraRing = this.scene.add.image(this.sprite.x, this.sprite.y, 'boss_aura')
      .setBlendMode(Phaser.BlendModes.ADD).setTint(0xd88bff).setAlpha(0.55).setScale(1.15);
    this.scene.tweens.add({ targets: this.auraRing, scale: 1.35, alpha: 0.25, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
  }

  _enrage() {
    this.enraged = true;
    playSfx(this.scene, 'sfx_enrage', { volume: 0.55 });
    this.speed = this.baseSpeed * 1.45;
    this.attackDamage = Math.round(this.baseAttackDamage * 1.35);
    this.summonCooldown = Math.round(SUMMON_COOLDOWN * 0.6);
    this.summonCount = 2;
    this.sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(150, () => this.alive && this.sprite.clearTint());
    this.scene.cameras.main.shake(220, 0.006);
    if (this.glowFx) this.glowFx.outerStrength = 2.6;
  }

  die() {
    this.scene.cameras.main.shake(260, 0.008);
    if (this.auraRing) { this.auraRing.destroy(); this.auraRing = null; }
    super.die();
  }

  _countAliveSentinels() {
    return this.scene.enemies.reduce((n, e) => n + (e.isSentinel && e.alive ? 1 : 0), 0);
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

  update(deltaSec, player) {
    if (!this.alive) {
      if (this.nameTag) {
        this.nameTag.destroy();
        this.nameTag = null;
      }
      return;
    }

    if (!this.enraged && this.hp / this.maxHp <= ENRAGE_THRESHOLD) {
      this._enrage();
    }

    super.update(deltaSec, player);
    this._trySummon(player);

    if (this.nameTag) {
      this.nameTag.setPosition(this.sprite.x, this.sprite.y - 46);
    }
    if (this.auraRing) {
      this.auraRing.setPosition(this.sprite.x, this.sprite.y);
      this.auraRing.setDepth(this.sprite.depth - 1);
      this.auraRing.angle += deltaSec * 45;
    }
    this.hpBarBg.setPosition(this.sprite.x, this.sprite.y - 34);
    this.hpBarFg.setPosition(this.sprite.x - this.barWidth / 2, this.sprite.y - 34);
    this.hpBarFg.width = this.barWidth * (this.hp / this.maxHp);
  }
}
