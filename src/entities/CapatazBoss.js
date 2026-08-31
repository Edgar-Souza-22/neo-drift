import Phaser from 'phaser';
import Enemy from './Enemy.js';
import { playSfx } from '../audio/AudioManager.js';

const SLAM_TRIGGER_RANGE = 1.8;
const SLAM_COOLDOWN_MS = 3400;
const SLAM_TELEGRAPH_MS = 500;
const SLAM_RADIUS = 1.6;
const SLAM_TINT = 0xc9a06a;

// Capataz do Mercado — sub-chefe da Fase 10 "Mercado Negro dos Túneis".
// Diferente do genérico "Guardião do Cofre" (MiniBoss.js, documentado como
// "sem ataque especial próprio"): tem um "Golpe de Solo" de verdade — fica
// parado brevemente quando o jogador chega perto (mesmo padrão de telégrafo
// congelado do Fundidor Primordial), depois bate no chão causando dano em
// área ao redor de SI MESMO (não precisa mirar/travar posição do jogador,
// mais simples e mais "bruto" que o golpe do Barão). Aviso usa o mesmo
// `light_pool` + tween de escala do Curador Supremo/Barão do Mercado.
export default class CapatazBoss extends Enemy {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, {
      hp: opts.hp || 480,
      speed: opts.speed || 1.15,
      attackDamage: opts.attackDamage || 32,
      xpReward: opts.xpReward || 170,
      texture: opts.texture || 'enemy_capataz',
      hpBarWidth: 40,
      scale: 1.1,
      ammoDropChance: opts.ammoDropChance ?? 0,
      onDeath: opts.onDeath
    });
    this.isMiniBoss = true;
    this.baseSpeed = this.speed;
    this.baseAttackDamage = this.attackDamage;

    this.slamDamage = opts.slamDamage || 26;
    this.slamCooldown = SLAM_COOLDOWN_MS;
    this.lastSlamAt = -1000;
    this.slamming = false;
    this.warnRing = null;

    this.nameTag = this.scene.add.text(this.sprite.x, this.sprite.y - 34, opts.name || 'CAPATAZ DO MERCADO', {
      fontFamily: 'Courier New',
      fontSize: '10px',
      color: '#c9a06a'
    }).setOrigin(0.5).setDepth(9002);
  }

  die() {
    if (this.nameTag) { this.nameTag.destroy(); this.nameTag = null; }
    if (this.warnRing) { this.warnRing.destroy(); this.warnRing = null; }
    super.die();
  }

  // Fica parado (vulnerável) enquanto avisa — bate quando o tempo acaba,
  // não quando o jogador se afasta, então recuar durante o telégrafo ainda
  // é a forma certa de escapar do golpe.
  _tryStartSlam(player) {
    if (this.slamming) return;
    const now = this.scene.time.now;
    if (now - this.lastSlamAt < this.slamCooldown) return;
    const dist = Math.hypot(player.gx - this.gx, player.gy - this.gy);
    if (dist > SLAM_TRIGGER_RANGE) return;

    this.lastSlamAt = now;
    this.slamming = true;
    playSfx(this.scene, 'sfx_enrage', { volume: 0.35 });

    const world = this.tileMap.gridToWorld(this.gx, this.gy);
    this.warnRing = this.scene.add.image(world.x, world.y, 'light_pool')
      .setTint(SLAM_TINT).setBlendMode(Phaser.BlendModes.ADD).setDepth(8999).setScale(0.2).setAlpha(0.6);
    this.scene.tweens.add({
      targets: this.warnRing, scale: SLAM_RADIUS, alpha: 0.85,
      duration: SLAM_TELEGRAPH_MS, ease: 'Cubic.In'
    });

    this.scene.time.delayedCall(SLAM_TELEGRAPH_MS, () => this._resolveSlam(player));
  }

  _resolveSlam(player) {
    if (this.warnRing) { this.warnRing.destroy(); this.warnRing = null; }
    this.slamming = false;
    if (!this.alive) return;

    const world = this.tileMap.gridToWorld(this.gx, this.gy);
    this.scene.cameras.main.shake(150, 0.006);
    this._spawnHitParticles(world.x, world.y, 7, 22, SLAM_TINT);

    if (player.alive) {
      const dist = Math.hypot(player.gx - this.gx, player.gy - this.gy);
      if (dist <= SLAM_RADIUS) player.takeDamage(this.slamDamage);
    }
  }

  update(deltaSec, player) {
    if (!this.alive) {
      if (this.nameTag) { this.nameTag.destroy(); this.nameTag = null; }
      if (this.warnRing) { this.warnRing.destroy(); this.warnRing = null; }
      return;
    }

    if (this.slamming) {
      // Congelado durante o telégrafo — só o recuo/animação de respirar
      // seguem, igual ao Fundidor Primordial mirando a rajada.
      this.knockback.x *= 0.82;
      this.knockback.y *= 0.82;
      const world = this.tileMap.gridToWorld(this.gx, this.gy);
      this.sprite.setPosition(world.x + this.knockback.x, world.y + this.knockback.y);
    } else {
      super.update(deltaSec, player);
      this._tryStartSlam(player);
    }

    if (this.nameTag) this.nameTag.setPosition(this.sprite.x, this.sprite.y - 36);
    this.hpBarBg.setPosition(this.sprite.x, this.sprite.y - 34);
    this.hpBarFg.setPosition(this.sprite.x - this.barWidth / 2, this.sprite.y - 34);
    this.hpBarFg.width = this.barWidth * (this.hp / this.maxHp);
  }
}
