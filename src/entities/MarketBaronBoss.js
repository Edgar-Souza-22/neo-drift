import Phaser from 'phaser';
import Enemy from './Enemy.js';
import { playSfx } from '../audio/AudioManager.js';

const ENRAGE_THRESHOLD = 0.35;
const GRENADE_RANGE = 7;
const GRENADE_COOLDOWN_MS = 3000;
const GRENADE_TELEGRAPH_MS = 600;
const GRENADE_RADIUS = 1.4;
const GRENADE_TINT = 0xe8b93d;

// Chefe final da Fase 10 "Mercado Negro dos Túneis" — diferente de todo
// chefe anterior: não mira uma linha nem marca o jogador pra um golpe
// atrasado, ele simplesmente joga uma "Granada Suja" bem aos pés do jogador
// NA HORA (posição fixa desde o lançamento, não rastreia), com um aro
// crescente avisando onde vai explodir — e continua perseguindo/batendo
// corpo a corpo o tempo todo, mesmo durante o telégrafo (nunca fica parado
// como o Fundidor Primordial). Isso faz o combate ler como "sempre em
// movimento", coerente com um contrabandista fugindo/negociando, não uma
// torre de tiro parada.
export default class MarketBaronBoss extends Enemy {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, {
      hp: opts.hp || 1250,
      isBoss: true,
      speed: opts.speed || 1.1,
      attackDamage: opts.attackDamage || 26,
      xpReward: opts.xpReward || 600,
      texture: opts.texture || 'boss_marketbaron',
      hpBarWidth: 46,
      scale: 1.15,
      onDeath: opts.onDeath
    });
    this.isBoss = true;
    this.baseSpeed = this.speed;
    this.baseAttackDamage = this.attackDamage;
    this.enraged = false;

    this.grenadeDamage = opts.grenadeDamage || 34;
    this.baseGrenadeDamage = this.grenadeDamage;
    this.grenadeCooldown = GRENADE_COOLDOWN_MS;
    this.lastGrenadeAt = -1200;
    this.grenade = null;

    this.nameTag = this.scene.add.text(this.sprite.x, this.sprite.y - 44, opts.name || 'O BARÃO DO MERCADO', {
      fontFamily: 'Courier New',
      fontSize: '11px',
      color: '#e8b93d'
    }).setOrigin(0.5).setDepth(9002);

    this.glowFx = this.sprite.preFX.addGlow(0xe8b93d, 1.3, 0, false);

    this.auraRing = this.scene.add.image(this.sprite.x, this.sprite.y, 'boss_aura')
      .setBlendMode(Phaser.BlendModes.ADD).setTint(0xe8b93d).setAlpha(0.5).setScale(1.15);
    this.scene.tweens.add({ targets: this.auraRing, scale: 1.35, alpha: 0.22, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
  }

  _enrage() {
    this.enraged = true;
    playSfx(this.scene, 'sfx_enrage', { volume: 0.55 });
    this.speed = this.baseSpeed * 1.35;
    this.attackDamage = Math.round(this.baseAttackDamage * 1.3);
    this.grenadeCooldown = Math.round(GRENADE_COOLDOWN_MS * 0.6);
    this.grenadeDamage = Math.round(this.baseGrenadeDamage * 1.25);
    this.sprite.setTintFill(0xffe6a0);
    this.scene.time.delayedCall(150, () => this.alive && this.sprite.clearTint());
    this.scene.cameras.main.shake(220, 0.006);
    if (this.glowFx) this.glowFx.outerStrength = 2.4;
  }

  die() {
    this.scene.cameras.main.shake(260, 0.008);
    this._clearGrenade();
    if (this.auraRing) { this.auraRing.destroy(); this.auraRing = null; }
    super.die();
  }

  _clearGrenade() {
    if (this.grenade) {
      if (this.grenade.ring) this.grenade.ring.destroy();
      this.grenade = null;
    }
  }

  // Marca a posição ATUAL do jogador (não segue mais depois disso) e cresce
  // por GRENADE_TELEGRAPH_MS antes de explodir — dá tempo real de sair de
  // cima da marca, mas o Barão continua se movendo/batendo normalmente.
  // Aviso reaproveita o mesmo `light_pool` + tween de escala usado pelo
  // Curador Supremo (não um Arc/`add.circle` com tween de raio — API que
  // travava o jogo nessa luta).
  _tryThrowGrenade(player) {
    if (this.grenade) return;
    const now = this.scene.time.now;
    if (now - this.lastGrenadeAt < this.grenadeCooldown) return;
    const dist = Math.hypot(player.gx - this.gx, player.gy - this.gy);
    if (dist > GRENADE_RANGE || dist < 0.1) return;

    this.lastGrenadeAt = now;
    const targetGx = player.gx;
    const targetGy = player.gy;
    const world = this.tileMap.gridToWorld(targetGx, targetGy);

    const ring = this.scene.add.image(world.x, world.y, 'light_pool')
      .setTint(GRENADE_TINT).setBlendMode(Phaser.BlendModes.ADD).setDepth(8999).setScale(0.15).setAlpha(0.55);
    this.scene.tweens.add({
      targets: ring, scale: GRENADE_RADIUS, alpha: 0.85,
      duration: GRENADE_TELEGRAPH_MS, ease: 'Cubic.In'
    });

    this.grenade = { gx: targetGx, gy: targetGy, ring };
    playSfx(this.scene, 'sfx_enrage', { volume: 0.3 });

    this.scene.time.delayedCall(GRENADE_TELEGRAPH_MS, () => this._detonateGrenade(player));
  }

  // Resolve o dano NUM SÓ INSTANTE (na detonação, não frame a frame durante
  // o telégrafo) — mesmo padrão do Curador Supremo (_resolveBurst).
  _detonateGrenade(player) {
    if (!this.grenade) return;
    const { gx, gy } = this.grenade;
    const world = this.tileMap.gridToWorld(gx, gy);
    this.scene.cameras.main.flash(90, 232, 185, 61);
    this._spawnHitParticles(world.x, world.y, 8, 26, GRENADE_TINT);
    this._clearGrenade();
    if (!this.alive) return;

    if (player.alive) {
      const dist = Math.hypot(player.gx - gx, player.gy - gy);
      if (dist <= GRENADE_RADIUS) {
        player.takeDamage(this.grenadeDamage);
        this.scene.cameras.main.shake(160, 0.007);
      }
    }
  }

  update(deltaSec, player) {
    if (!this.alive) {
      if (this.nameTag) { this.nameTag.destroy(); this.nameTag = null; }
      this._clearGrenade();
      return;
    }

    if (!this.enraged && this.hp / this.maxHp <= ENRAGE_THRESHOLD) {
      this._enrage();
    }

    super.update(deltaSec, player);
    this._tryThrowGrenade(player);

    if (this.nameTag) this.nameTag.setPosition(this.sprite.x, this.sprite.y - 46);
    if (this.auraRing) {
      this.auraRing.setPosition(this.sprite.x, this.sprite.y);
      this.auraRing.setDepth(this.sprite.depth - 1);
      this.auraRing.angle += deltaSec * 40;
    }
    this.hpBarBg.setPosition(this.sprite.x, this.sprite.y - 34);
    this.hpBarFg.setPosition(this.sprite.x - this.barWidth / 2, this.sprite.y - 34);
    this.hpBarFg.width = this.barWidth * (this.hp / this.maxHp);
  }
}
