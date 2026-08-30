import Phaser from 'phaser';
import { GameState, grantXp, consumeStim, consumeEmpCharge } from '../state/GameState.js';
import { MELEE_KINDS, RANGED_KINDS } from '../state/ItemCodex.js';
import { playSfx } from '../audio/AudioManager.js';

const SPEED = 3.4; // tiles por segundo
const RADIUS = 0.32;
const ATTACK_POSE_DURATION = 160;
const INVULN_TIME = 500;

const BULLET_HIT_RADIUS = 0.4;

const STIM_HEAL = 45;
const EMP_RADIUS = 3.2;
const EMP_STUN_MS = 3500;

export default class Player {
  constructor(scene, tileMap, spawn) {
    this.scene = scene;
    this.tileMap = tileMap;

    this.gx = spawn.gx;
    this.gy = spawn.gy;

    this.maxHp = GameState.maxHp;
    this.hp = GameState.hp;
    this.facing = { x: 0, y: 1 };
    this.lastAttackAt = -9999;
    this.attackingUntil = -9999;
    this.lastHitAt = -9999;
    this.lastRangedAt = -9999;
    this.bullets = [];
    this.jammedUntil = -9999;
    this.alive = true;
    this.leveledUpThisFrame = false;

    this.isMoving = false;

    const world = tileMap.gridToWorld(this.gx, this.gy);
    this.sprite = scene.add.sprite(world.x, world.y, 'player_down_0');
    this.sprite.setOrigin(0.5, 0.5);

    this.slashFx = scene.add.image(world.x, world.y, 'slash');
    this.slashFx.setVisible(false);
    this.slashFx.setBlendMode(Phaser.BlendModes.ADD);
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

  move(dirX, dirY, deltaSec) {
    if (!this.alive) return;
    this.isMoving = dirX !== 0 || dirY !== 0;
    if (this.isMoving) {
      this.facing = { x: dirX, y: dirY };
    }

    const nx = this.gx + dirX * SPEED * deltaSec;
    if (this.canOccupy(nx, this.gy)) this.gx = nx;

    const ny = this.gy + dirY * SPEED * deltaSec;
    if (this.canOccupy(this.gx, ny)) this.gy = ny;

    this.gx = Phaser.Math.Clamp(this.gx, 0, this.tileMap.cols - 1);
    this.gy = Phaser.Math.Clamp(this.gy, 0, this.tileMap.rows - 1);
  }

  tryAttack(enemies) {
    const kind = MELEE_KINDS[GameState.weaponKind] || MELEE_KINDS.sword;
    const now = this.scene.time.now;
    if (now - this.lastAttackAt < kind.cooldown) return false;
    this.lastAttackAt = now;
    this.attackingUntil = now + ATTACK_POSE_DURATION;
    playSfx(this.scene, 'sfx_attack_melee');

    const isPlasma = GameState.weaponName.includes('Plasma');
    const world = this.tileMap.gridToWorld(this.gx, this.gy);
    this.slashFx.setPosition(world.x + this.facing.x * 14, world.y + this.facing.y * 14);
    this.slashFx.setRotation(Math.atan2(this.facing.y, this.facing.x));
    this.slashFx.setTint(isPlasma ? 0xff6ad5 : 0xffffff);
    this.slashFx.setVisible(true);
    this.slashFx.setAlpha(1);
    this.slashFx.setScale(kind.cone ? 0.9 : 0.6);
    this.scene.tweens.add({
      targets: this.slashFx,
      alpha: 0,
      scale: kind.cone ? 1.7 : 1.25,
      duration: 220,
      ease: 'Cubic.Out',
      onComplete: () => this.slashFx.setVisible(false)
    });

    // facing já vem normalizado de move() — dot product direto dá o cosseno
    // do ângulo até o alvo, sem precisar recalcular a magnitude do facing.
    let hitAny = false;
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const dx = enemy.gx - this.gx;
      const dy = enemy.gy - this.gy;
      const dist = Math.hypot(dx, dy);
      if (dist > kind.range) continue;
      if (kind.cone != null && dist > 0.05) {
        const cos = (dx * this.facing.x + dy * this.facing.y) / dist;
        const angleDeg = Math.acos(Phaser.Math.Clamp(cos, -1, 1)) * (180 / Math.PI);
        if (angleDeg > kind.cone) continue;
      }
      const died = enemy.takeDamage(GameState.attackDamage, this.gx, this.gy, kind.knockbackMul);
      hitAny = true;
      if (died) this._awardKill(enemy);
    }
    if (hitAny) this.scene.cameras.main.shake(70, 0.0025);
    return hitAny;
  }

  // Cria e empurra um projétil na lista `bullets` — usado tanto pra um tiro
  // único (pistola) quanto pra cada bala de uma rajada (SMG) ou leque
  // (shotgun). `pierce` (railgun) faz o projétil atravessar em vez de sumir
  // no primeiro inimigo — `hitSet` evita bater duas vezes no mesmo alvo.
  _spawnBullet(angle, damage, speed, lifetime, now, { pierce = false, scale = 1, tint = null } = {}) {
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const world = this.tileMap.gridToWorld(this.gx, this.gy);
    const sprite = this.scene.add.image(world.x, world.y, 'bullet').setDepth(9000).setBlendMode(Phaser.BlendModes.ADD);
    sprite.setRotation(angle);
    if (scale !== 1) sprite.setScale(scale);
    if (tint != null) sprite.setTint(tint);
    this.bullets.push({
      gx: this.gx, gy: this.gy, vx: dirX * speed, vy: dirY * speed, sprite, bornAt: now, damage, lifetime,
      pierce, hitSet: pierce ? new Set() : null
    });
  }

  // Arma à distância: comportamento (tiro único / rajada / leque) definido
  // por RANGED_KINDS[GameState.rangedKind] — ver ItemCodex.js. Munição
  // limitada (GameState.pistolAmmo), gasta por gatilho, não por projétil.
  tryRangedAttack() {
    if (!GameState.hasPistol) return false;
    const now = this.scene.time.now;
    if (now < this.jammedUntil) {
      this.scene.game.events.emit('item-pickup', 'Arma inibida!');
      return false;
    }
    const kind = RANGED_KINDS[GameState.rangedKind] || RANGED_KINDS.pistol;
    if (now - this.lastRangedAt < kind.cooldown) return false;
    if (GameState.pistolAmmo < kind.ammoCost) {
      this.scene.game.events.emit('item-pickup', 'Sem munição!');
      return false;
    }
    this.lastRangedAt = now;
    this.attackingUntil = now + ATTACK_POSE_DURATION;
    GameState.pistolAmmo -= kind.ammoCost;
    playSfx(this.scene, 'sfx_attack_ranged');

    let dirX = this.facing.x;
    let dirY = this.facing.y;
    if (dirX === 0 && dirY === 0) dirY = 1;
    const baseAngle = Math.atan2(dirY, dirX);
    const dmg = Math.max(1, Math.round(GameState.pistolDamage * kind.dmgMul));

    const world = this.tileMap.gridToWorld(this.gx, this.gy);
    const flash = this.scene.add.image(world.x + dirX * 12, world.y + dirY * 12, 'particle')
      .setTint(0x9fffe8).setDepth(9001).setScale(1.4);
    this.scene.tweens.add({ targets: flash, alpha: 0, scale: 0.2, duration: 120, onComplete: () => flash.destroy() });

    const bulletOpts = { pierce: !!kind.pierce, scale: kind.bulletScale || 1, tint: kind.bulletTint ?? null };

    if (kind.burstDelay) {
      // SMG: rajada sequencial na mesma direção, com leve variação de mira a cada bala.
      for (let i = 0; i < kind.pellets; i++) {
        this.scene.time.delayedCall(i * kind.burstDelay, () => {
          if (!this.alive) return;
          const jitter = Phaser.Math.DegToRad((Math.random() - 0.5) * kind.spreadDeg);
          this._spawnBullet(baseAngle + jitter, dmg, kind.speed, kind.lifetime, this.scene.time.now, bulletOpts);
        });
      }
    } else if (kind.pellets > 1) {
      // Shotgun: leque de projéteis disparado de uma vez só.
      const spreadRad = Phaser.Math.DegToRad(kind.spreadDeg);
      for (let i = 0; i < kind.pellets; i++) {
        const t = i / (kind.pellets - 1) - 0.5;
        this._spawnBullet(baseAngle + t * spreadRad, dmg, kind.speed, kind.lifetime, now, bulletOpts);
      }
    } else {
      this._spawnBullet(baseAngle, dmg, kind.speed, kind.lifetime, now, bulletOpts);
    }
    return true;
  }

  updateBullets(deltaSec, enemies) {
    const now = this.scene.time.now;
    this.bullets = this.bullets.filter((bullet) => {
      bullet.gx += bullet.vx * deltaSec;
      bullet.gy += bullet.vy * deltaSec;

      const expired = now - bullet.bornAt > bullet.lifetime;
      const hitWall = !this.tileMap.isWalkable(Math.round(bullet.gx), Math.round(bullet.gy));
      let hitEnemy = null;
      if (!hitWall) {
        for (const enemy of enemies) {
          if (!enemy.alive) continue;
          if (bullet.hitSet && bullet.hitSet.has(enemy)) continue;
          if (Math.hypot(enemy.gx - bullet.gx, enemy.gy - bullet.gy) <= BULLET_HIT_RADIUS) {
            hitEnemy = enemy;
            break;
          }
        }
      }

      if (hitEnemy) {
        const died = hitEnemy.takeDamage(bullet.damage, this.gx, this.gy);
        if (died) this._awardKill(hitEnemy);
        if (bullet.pierce) bullet.hitSet.add(hitEnemy);
      }

      // Projétil perfurante (railgun) atravessa em vez de sumir no primeiro alvo.
      if (expired || hitWall || (hitEnemy && !bullet.pierce)) {
        bullet.sprite.destroy();
        return false;
      }

      const world = this.tileMap.gridToWorld(bullet.gx, bullet.gy);
      bullet.sprite.setPosition(world.x, world.y);
      bullet.sprite.setDepth(Math.round(bullet.gy) * 10 + 6);
      return true;
    });
  }

  // Estimulante: cura instantânea, consome 1 carga. Retorna false (sem
  // efeito) se não houver carga disponível.
  tryUseStim() {
    if (!this.alive) return false;
    if (!consumeStim()) {
      this.scene.game.events.emit('item-pickup', 'Sem cargas de Estimulante!');
      return false;
    }
    this.hp = Math.min(this.maxHp, this.hp + STIM_HEAL);
    GameState.hp = this.hp;
    playSfx(this.scene, 'sfx_pickup');
    this.scene.game.events.emit('item-pickup', `Estimulante usado! +${STIM_HEAL} HP.`);
    return true;
  }

  // Granada EMP: atordoa (stunUntil) todo inimigo não-chefe num raio ao
  // redor do jogador por EMP_STUN_MS. Chefes são blindados contra isso.
  tryUseEmp(enemies) {
    if (!this.alive) return false;
    if (!consumeEmpCharge()) {
      this.scene.game.events.emit('item-pickup', 'Sem cargas de Granada EMP!');
      return false;
    }
    const now = this.scene.time.now;
    const world = this.tileMap.gridToWorld(this.gx, this.gy);
    const burst = this.scene.add.image(world.x, world.y, 'light_pool')
      .setTint(0xd88bff).setBlendMode(Phaser.BlendModes.ADD).setDepth(9002).setScale(EMP_RADIUS / 1.5).setAlpha(0.8);
    this.scene.tweens.add({ targets: burst, alpha: 0, scale: EMP_RADIUS / 0.9, duration: 320, onComplete: () => burst.destroy() });
    this.scene.cameras.main.flash(120, 216, 139, 255);
    playSfx(this.scene, 'sfx_enrage', { volume: 0.4 });

    let hitAny = false;
    for (const enemy of enemies) {
      if (!enemy.alive || enemy.isBoss) continue;
      if (Math.hypot(enemy.gx - this.gx, enemy.gy - this.gy) <= EMP_RADIUS) {
        enemy.stunUntil = now + EMP_STUN_MS;
        hitAny = true;
      }
    }
    this.scene.game.events.emit('item-pickup', hitAny ? 'Granada EMP: drones desligados!' : 'Granada EMP usada.');
    return true;
  }

  _awardKill(enemy) {
    const leveledUp = grantXp(enemy.xpReward || 15);
    this.maxHp = GameState.maxHp;
    this.hp = GameState.hp;
    if (leveledUp) this.leveledUpThisFrame = true;
  }

  // Chamado pelo pulso EMP do Drone Inibidor — trava a pistola por
  // `durationMs` (não afeta o ataque corpo a corpo). Não empilha: um novo
  // pulso durante o jam só estende até o novo prazo, nunca soma.
  jamPistol(durationMs) {
    const now = this.scene.time.now;
    const until = now + durationMs;
    const wasJammed = now < this.jammedUntil;
    this.jammedUntil = Math.max(this.jammedUntil, until);
    if (!wasJammed) {
      playSfx(this.scene, 'sfx_player_hurt', { volume: 0.3 });
      this.scene.game.events.emit('item-pickup', 'Pistola inibida por um Drone!');
    }
  }

  takeDamage(amount) {
    const now = this.scene.time.now;
    if (now - this.lastHitAt < INVULN_TIME) return;
    this.lastHitAt = now;
    this.hp = Math.max(0, this.hp - amount);
    GameState.hp = this.hp;
    playSfx(this.scene, 'sfx_player_hurt');
    this.sprite.setTintFill(0xff5566);
    this.scene.time.delayedCall(120, () => this.sprite.clearTint());
    if (this.hp <= 0) this.alive = false;
  }

  update() {
    const world = this.tileMap.gridToWorld(this.gx, this.gy);
    this.sprite.setPosition(world.x, world.y);
    this.sprite.setDepth(Math.round(this.gy) * 10 + 5);

    const dirKey = Math.abs(this.facing.y) >= Math.abs(this.facing.x)
      ? (this.facing.y >= 0 ? 'down' : 'up')
      : 'side';
    this.sprite.setFlipX(dirKey === 'side' && this.facing.x < 0);

    const attacking = this.scene.time.now < this.attackingUntil;

    if (attacking) {
      this.sprite.anims.stop();
      this.sprite.setTexture(`player_${dirKey}_atk`);
    } else if (this.isMoving && this.alive) {
      const animKey = `walk_${dirKey}`;
      if (this.sprite.anims.currentAnim?.key !== animKey) {
        this.sprite.play(animKey, true);
      }
    } else {
      this.sprite.anims.stop();
      this.sprite.setTexture(`player_${dirKey}_0`);
    }
  }
}
