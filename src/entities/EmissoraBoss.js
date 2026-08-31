import Phaser from 'phaser';
import Enemy from './Enemy.js';
import SentrySentinel from './SentrySentinel.js';
import { TILE_SIZE } from '../utils/constants.js';
import { playSfx } from '../audio/AudioManager.js';

const ENRAGE_THRESHOLD = 0.35;

const STRIKE_RANGE = 7.5;
const STRIKE_CHARGE_MS = 700;
const STRIKE_RADIUS = 0.9; // tiles
const STRIKE_COOLDOWN = 2600;

const SUMMON_RANGE = 8;
const SUMMON_COOLDOWN = 5200;
const MAX_CONCURRENT_SENTINELS = 2;
const SPAWN_RADIUS = 2.6; // tiles ao redor de onde as sentinelas aparecem

// Confronto final da Fase 08 "A Emissora" — fecha de vez o arco do Distrito
// Neon: a rede de vigilância que cobria a cidade nunca respondeu só ao
// Coordenador Voss. Combina os dois padrões já vistos separadamente (marca +
// ataque telegrafado do Titã Voltaico, invocação de reforços da Vigia
// Central) — reflavorados como uma varredura que aponta o jogador e um
// pedido de reforço às próprias Sentinelas de Varredura da fase — em vez de
// introduzir um terceiro padrão do zero, que combinar dois já testados é o
// que faz esse confronto ler como o acúmulo de tudo que o Distrito Neon
// ensinou até aqui.
export default class EmissoraBoss extends Enemy {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, {
      hp: opts.hp || 1600,
      isBoss: true,
      speed: opts.speed || 1.15,
      attackDamage: opts.attackDamage || 24,
      xpReward: opts.xpReward || 800,
      texture: opts.texture || 'boss_emissora',
      hpBarWidth: 50,
      scale: 1.15,
      onDeath: opts.onDeath
    });
    this.isBoss = true;
    this.baseSpeed = this.speed;
    this.baseAttackDamage = this.attackDamage;
    this.enraged = false;

    this.strikeDamage = opts.strikeDamage || 22;
    this.baseStrikeDamage = this.strikeDamage;
    this.strikeCooldown = STRIKE_COOLDOWN;
    this.strikeCount = 1;
    this.lastStrikeAt = -2000;
    this.strikes = [];

    this.summonCooldown = SUMMON_COOLDOWN;
    this.summonCount = 1;
    this.lastSummonAt = -1000;
    this.summonDisabled = false;
    this.onEnemyDeath = opts.onDeath;

    this.nameTag = this.scene.add.text(this.sprite.x, this.sprite.y - 46, opts.name || 'A EMISSORA', {
      fontFamily: 'Courier New',
      fontSize: '11px',
      color: '#3dffa0'
    }).setOrigin(0.5).setDepth(9002);

    this.glowFx = this.sprite.preFX.addGlow(0x3dffa0, 1.4, 0, false);

    this.auraRing = this.scene.add.image(this.sprite.x, this.sprite.y, 'boss_aura')
      .setBlendMode(Phaser.BlendModes.ADD).setTint(0x3dffa0).setAlpha(0.55).setScale(1.15);
    this.scene.tweens.add({ targets: this.auraRing, scale: 1.35, alpha: 0.25, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
  }

  // Chamado pelo Console de Override da Sala de Override — sabota a
  // invocação de reforços pro resto do confronto (não afeta a marca+feixe).
  disableSummon() {
    this.summonDisabled = true;
  }

  _enrage() {
    this.enraged = true;
    playSfx(this.scene, 'sfx_enrage', { volume: 0.55 });
    this.speed = this.baseSpeed * 1.4;
    this.attackDamage = Math.round(this.baseAttackDamage * 1.3);
    this.strikeCooldown = Math.round(STRIKE_COOLDOWN * 0.6);
    this.strikeDamage = Math.round(this.baseStrikeDamage * 1.25);
    this.strikeCount = 2;
    this.summonCooldown = Math.round(SUMMON_COOLDOWN * 0.65);
    this.sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(150, () => this.alive && this.sprite.clearTint());
    this.scene.cameras.main.shake(220, 0.006);
    if (this.glowFx) this.glowFx.outerStrength = 2.6;
  }

  die() {
    this.scene.cameras.main.shake(300, 0.01);
    for (const s of this.strikes) if (s.telegraph) s.telegraph.destroy();
    this.strikes = [];
    if (this.auraRing) { this.auraRing.destroy(); this.auraRing = null; }
    super.die();
  }

  // -------- marca de transmissão (marca + feixe telegrafado) --------

  _tryStrike(player) {
    const now = this.scene.time.now;
    if (now - this.lastStrikeAt < this.strikeCooldown) return;
    const dist = Math.hypot(player.gx - this.gx, player.gy - this.gy);
    if (dist > STRIKE_RANGE) return;
    this.lastStrikeAt = now;

    for (let i = 0; i < this.strikeCount; i++) {
      const offsetX = i === 0 ? 0 : Phaser.Math.Between(-2, 2);
      const offsetY = i === 0 ? 0 : Phaser.Math.Between(-2, 2);
      const gx = Phaser.Math.Clamp(Math.round(player.gx + offsetX), 0, this.tileMap.cols - 1);
      const gy = Phaser.Math.Clamp(Math.round(player.gy + offsetY), 0, this.tileMap.rows - 1);
      this._spawnStrikeWarning(gx, gy);
    }
  }

  _spawnStrikeWarning(gx, gy) {
    const world = this.tileMap.gridToWorld(gx, gy);
    const ring = this.scene.add.image(world.x, world.y, 'light_pool')
      .setTint(0x3dffa0).setDepth(8999).setBlendMode(Phaser.BlendModes.ADD).setScale(0.85).setAlpha(0.75);
    this.scene.tweens.add({ targets: ring, alpha: 0.25, duration: 150, yoyo: true, repeat: -1 });

    const strike = { gx, gy, telegraph: ring };
    this.strikes.push(strike);
    this.scene.time.delayedCall(STRIKE_CHARGE_MS, () => this._resolveStrike(strike));
  }

  _resolveStrike(strike) {
    this.strikes = this.strikes.filter((s) => s !== strike);
    strike.telegraph.destroy();
    if (!this.alive) return;

    const world = this.tileMap.gridToWorld(strike.gx, strike.gy);
    const beam = this.scene.add.rectangle(world.x, world.y - TILE_SIZE * 2, 6, TILE_SIZE * 4, 0xe0ffe8, 0.95)
      .setDepth(9002).setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({ targets: beam, alpha: 0, duration: 220, onComplete: () => beam.destroy() });
    this.scene.cameras.main.flash(70, 220, 255, 235);

    const player = this.scene.player;
    if (player && player.alive) {
      const dist = Math.hypot(player.gx - strike.gx, player.gy - strike.gy);
      if (dist <= STRIKE_RADIUS) player.takeDamage(this.strikeDamage);
    }
  }

  // -------- interferência (invoca sentinelas de varredura) --------

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
    if (!this.alive) {
      if (this.nameTag) { this.nameTag.destroy(); this.nameTag = null; }
      if (this.auraRing) { this.auraRing.destroy(); this.auraRing = null; }
      for (const s of this.strikes) if (s.telegraph) s.telegraph.destroy();
      this.strikes = [];
      return;
    }

    if (!this.enraged && this.hp / this.maxHp <= ENRAGE_THRESHOLD) {
      this._enrage();
    }

    super.update(deltaSec, player);
    this._tryStrike(player);
    this._trySummon(player);

    if (this.nameTag) this.nameTag.setPosition(this.sprite.x, this.sprite.y - 48);
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
