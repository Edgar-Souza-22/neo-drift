import { playSfx } from '../audio/AudioManager.js';

// fps do loop de hover/pulso por tipo (lote de sprites 2) — só usado quando as
// texturas `<tipo>_0.._N` foram carregadas; sem elas o inimigo fica estático
// como sempre (ver _setupHoverAnim).
const HOVER_FRAME_RATES = {
  enemy: 8, enemy_tank: 8, enemy_foundry: 8, enemy_electric: 8, enemy_jammer: 8,
  enemy_shooter: 8, enemy_sentinel: 4, enemy_miniboss: 8, enemy_phasejumper: 8,
  enemy_portalguardian: 8, enemy_sentry: 6, enemy_dweller: 6
};

const SPEED = 1.5;
const RADIUS = 0.3;
const AGGRO_RANGE = 3.4;
const ATTACK_RANGE = 0.85;
const ATTACK_COOLDOWN = 700;
const ATTACK_DAMAGE = 10;
const MAX_HP = 50;
const XP_REWARD = 15;

export default class Enemy {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    this.scene = scene;
    this.tileMap = tileMap;

    this.gx = gx;
    this.gy = gy;
    this.spawn = { gx, gy };
    this.hp = opts.hp || MAX_HP;
    this.maxHp = this.hp;
    this.speed = opts.speed || SPEED;
    this.attackDamage = opts.attackDamage || ATTACK_DAMAGE;
    this.xpReward = opts.xpReward || XP_REWARD;
    this.alive = true;
    this.lastAttackAt = -9999;
    this.stunUntil = -9999;

    this.state = 'patrol';
    this.patrolTarget = this._pickPatrolPoint();
    this.patrolWaitUntil = 0;

    this.barWidth = opts.hpBarWidth || 24;
    this.bobPhase = Math.random() * 1000;
    this.knockback = { x: 0, y: 0 };
    this.baseScale = opts.scale || 1;
    this.ammoDropChance = opts.ammoDropChance ?? 0;
    this.onDeath = opts.onDeath || null;

    const world = tileMap.gridToWorld(gx, gy);
    this.sprite = scene.add.sprite(world.x, world.y, opts.texture || 'enemy');
    this.sprite.setOrigin(0.5, 0.5);
    this.sprite.setScale(this.baseScale);
    this._setupHoverAnim(opts.texture || 'enemy');

    this.hpBarBg = scene.add.rectangle(world.x, world.y - 24, this.barWidth, 4, 0x1a0a10).setOrigin(0.5);
    this.hpBarFg = scene.add.rectangle(world.x - this.barWidth / 2, world.y - 24, this.barWidth, 4, 0xff4a5e).setOrigin(0, 0.5);

    // "Respiração" idle — tween próprio dono da escala, não conflita com o
    // recuo/posição (que são atualizados por frame em update()).
    this.scene.tweens.add({
      targets: this.sprite,
      scale: this.baseScale * 1.08,
      duration: 650 + Math.random() * 200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut'
    });
  }

  // Só liga o loop de hover/pulso se as texturas `<baseKey>_0`, `_1`... vieram
  // do lote de sprites (ver BootScene ART_KEY_OVERRIDES) — sem elas, o
  // inimigo fica com a imagem estática de sempre.
  _setupHoverAnim(baseKey) {
    if (!this.scene.textures.exists(`${baseKey}_0`)) return;
    const animKey = `hover_${baseKey}`;
    if (!this.scene.anims.exists(animKey)) {
      const frames = [];
      for (let i = 0; i < 8; i++) {
        const key = `${baseKey}_${i}`;
        if (!this.scene.textures.exists(key)) break;
        frames.push({ key });
      }
      this.scene.anims.create({ key: animKey, frames, frameRate: HOVER_FRAME_RATES[baseKey] || 8, repeat: -1 });
    }
    this.sprite.play(animKey);
  }

  _pickPatrolPoint() {
    const angle = Math.random() * Math.PI * 2;
    const radius = 1.2 + Math.random() * 1.2;
    return {
      gx: this.spawn.gx + Math.cos(angle) * radius,
      gy: this.spawn.gy + Math.sin(angle) * radius
    };
  }

  canOccupy(nx, ny) {
    const r = RADIUS;
    const minX = Math.round(nx - r);
    const maxX = Math.round(nx + r);
    const minY = Math.round(ny - r);
    const maxY = Math.round(ny + r);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (!this.tileMap.isWalkable(x, y)) return false;
      }
    }
    return true;
  }

  // Retorna true se este golpe matou o inimigo. `fromGx/fromGy` (opcionais)
  // definem a origem do golpe, usada para o recuo visual e as faíscas de
  // impacto. `knockbackMul` (padrão 1) escala esse recuo — a Britadeira usa
  // um valor bem maior aqui pra empurrar o alvo de verdade.
  takeDamage(amount, fromGx, fromGy, knockbackMul = 1) {
    if (!this.alive) return false;
    this.hp = Math.max(0, this.hp - amount);
    playSfx(this.scene, 'sfx_hit', { volume: 0.35 });
    this.sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(90, () => this.alive && this.sprite.clearTint());

    const world = this.tileMap.gridToWorld(this.gx, this.gy);
    if (fromGx != null) {
      const dx = this.gx - fromGx;
      const dy = this.gy - fromGy;
      const dist = Math.hypot(dx, dy) || 1;
      this.knockback.x += (dx / dist) * 9 * knockbackMul;
      this.knockback.y += (dy / dist) * 9 * knockbackMul;
    }
    this._spawnHitParticles(world.x, world.y);

    if (this.hp <= 0) {
      this.die();
      return true;
    }
    return false;
  }

  _spawnHitParticles(x, y, count = 4, baseSpeed = 14, tint = 0xffe9c2) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const speed = baseSpeed + Math.random() * 10;
      const p = this.scene.add.image(x, y, 'particle').setDepth(9500).setTint(tint);
      this.scene.tweens.add({
        targets: p,
        x: x + Math.cos(angle) * speed,
        y: y + Math.sin(angle) * speed,
        alpha: 0,
        scale: 0.3,
        duration: 300,
        ease: 'Cubic.Out',
        onComplete: () => p.destroy()
      });
    }
  }

  die() {
    this.alive = false;
    this.scene.tweens.killTweensOf(this.sprite);
    const world = this.tileMap.gridToWorld(this.gx, this.gy);
    this._spawnHitParticles(world.x, world.y, 7, 16);
    if (this.onDeath) this.onDeath(this);
    this.scene.tweens.add({
      targets: [this.sprite],
      alpha: 0,
      scale: this.baseScale * 1.4,
      duration: 250,
      ease: 'Cubic.Out',
      onComplete: () => {
        this.sprite.destroy();
        this.hpBarBg.destroy();
        this.hpBarFg.destroy();
      }
    });
  }

  update(deltaSec, player) {
    if (!this.alive) return;

    // Atordoado por uma Granada EMP — sem perseguição/ataque, mas continua
    // existindo/renderizando (o recuo/animação de "respirar" seguem rodando).
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

    const dxToPlayer = player.gx - this.gx;
    const dyToPlayer = player.gy - this.gy;
    const distToPlayer = Math.hypot(dxToPlayer, dyToPlayer);

    if (player.alive && distToPlayer <= AGGRO_RANGE) {
      this.state = 'chase';
    } else if (this.state === 'chase' && distToPlayer > AGGRO_RANGE * 1.4) {
      this.state = 'patrol';
      this.patrolTarget = this._pickPatrolPoint();
    }

    let dirX = 0;
    let dirY = 0;

    if (this.state === 'chase') {
      if (distToPlayer > 0.05) {
        dirX = dxToPlayer / distToPlayer;
        dirY = dyToPlayer / distToPlayer;
      }
      if (distToPlayer <= ATTACK_RANGE) {
        dirX = 0;
        dirY = 0;
        const now = this.scene.time.now;
        if (now - this.lastAttackAt > ATTACK_COOLDOWN) {
          this.lastAttackAt = now;
          player.takeDamage(this.attackDamage);
          this.sprite.setTintFill(0xffb347);
          this.scene.time.delayedCall(110, () => this.alive && this.sprite.clearTint());
        }
      }
    } else {
      const dx = this.patrolTarget.gx - this.gx;
      const dy = this.patrolTarget.gy - this.gy;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.15) {
        if (this.scene.time.now > this.patrolWaitUntil) {
          this.patrolTarget = this._pickPatrolPoint();
          this.patrolWaitUntil = this.scene.time.now + 800;
        }
      } else {
        dirX = dx / dist;
        dirY = dy / dist;
      }
    }

    const nx = this.gx + dirX * this.speed * deltaSec;
    if (this.canOccupy(nx, this.gy)) this.gx = nx;
    const ny = this.gy + dirY * this.speed * deltaSec;
    if (this.canOccupy(this.gx, ny)) this.gy = ny;

    this.knockback.x *= 0.82;
    this.knockback.y *= 0.82;

    const world = this.tileMap.gridToWorld(this.gx, this.gy);
    const bob = Math.sin((this.scene.time.now + this.bobPhase) / 220) * 1.4;
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
