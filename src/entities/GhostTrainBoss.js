import Phaser from 'phaser';
import Enemy from './Enemy.js';
import { TILE_SIZE } from '../utils/constants.js';
import { playSfx } from '../audio/AudioManager.js';

const ENRAGE_THRESHOLD = 0.35;

const RAIL_TOLERANCE = 0.55; // tiles — o quanto pode desalinhar e ainda contar como "na mesma linha/coluna"
const CHARGE_MIN_RANGE = 1.8;
const CHARGE_MAX_RANGE = 9;
const CHARGE_COOLDOWN = 3800;
const CHARGE_TELEGRAPH_MS = 650;
const CHARGE_DURATION_MS = 950;
const CHARGE_SPEED = 6.2;
const CHARGE_HIT_RADIUS = 0.8;
const CHARGE_RECOVER_MS = 800;
const TRAIL_INTERVAL_MS = 45;
const RAIL_TICK_COUNT = 6;
const GHOST_TINT = 0xcfd6e0;

const PHASE_COOLDOWN = 6200;
const PHASE_DURATION_MS = 1700;
const PHASE_FADE_MS = 260;
const PHASE_RANGE_MIN = 3;
const PHASE_RANGE_MAX = 8;

// Confronto final da Fase 09 "O Trem Fantasma" — combina dois padrões: uma
// investida travada nos EIXOS (horizontal/vertical, como um trem preso a um
// trilho — nunca na diagonal, diferente da investida livre do Tanque de
// Cerco) com uma fase "fantasma" periódica — fica intangível (golpes não
// acertam, ele também não bate) e desaparece pra reaparecer alinhado num
// novo trilho perto do jogador. O sprite (boss_ghosttrain, desenhado virado
// pra direita) é espelhado/rotacionado em runtime conforme a direção atual,
// e a investida ganha farol, marcas de trilho no telégrafo e um rastro de
// pós-imagens fantasmagóricas — pra realmente ler como um trem cruzando a
// sala, não só uma forma abstrata se deslocando rápido.
export default class GhostTrainBoss extends Enemy {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, {
      hp: opts.hp || 1100,
      speed: opts.speed || 1.0,
      attackDamage: opts.attackDamage || 24,
      xpReward: opts.xpReward || 520,
      texture: opts.texture || 'boss_ghosttrain',
      hpBarWidth: 48,
      scale: 1.15,
      onDeath: opts.onDeath
    });
    this.isBoss = true;
    this.baseSpeed = this.speed;
    this.baseAttackDamage = this.attackDamage;
    this.enraged = false;

    this.chargeDamage = opts.chargeDamage || 40;
    this.baseChargeDamage = this.chargeDamage;
    this.chargeCooldown = CHARGE_COOLDOWN;
    this.lastChargeAt = -1500;
    this.chargeState = 'idle'; // idle | telegraph | charging | recover
    this.chargeStateUntil = 0;
    this.chargeDir = { x: 1, y: 0 };
    this.chargeHitPlayer = false;
    this.chargeTicks = [];
    this.lastTrailAt = -9999;

    this.phaseCooldown = PHASE_COOLDOWN;
    this.lastPhaseAt = -2500;
    this.phasing = false;
    // Desativado pelo Console de Desvio da Sala de Sinalização (ver
    // FantasmaScene) — o trem fica sempre tangível pro resto do confronto,
    // não afeta a investida.
    this.phasingDisabled = false;

    this.nameTag = this.scene.add.text(this.sprite.x, this.sprite.y - 46, opts.name || 'O TREM FANTASMA', {
      fontFamily: 'Courier New',
      fontSize: '11px',
      color: '#cfd6e0'
    }).setOrigin(0.5).setDepth(9002);

    this.glowFx = this.sprite.preFX.addGlow(0xcfd6e0, 1.3, 0, false);

    this.auraRing = this.scene.add.image(this.sprite.x, this.sprite.y, 'boss_aura')
      .setBlendMode(Phaser.BlendModes.ADD).setTint(0xcfd6e0).setAlpha(0.5).setScale(1.2);
    this.scene.tweens.add({ targets: this.auraRing, scale: 1.4, alpha: 0.2, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.InOut' });

    // Farol da investida — um light_pool bem esticado ao longo da direção do
    // ataque, ligado só durante telégrafo/investida (ver _updateBeam).
    this.beamGlow = this.scene.add.image(this.sprite.x, this.sprite.y, 'light_pool')
      .setBlendMode(Phaser.BlendModes.ADD).setTint(0xe8ffff).setAlpha(0).setDepth(8997);

    this._updateFacing(this.chargeDir.x, this.chargeDir.y);
  }

  // Chamado pelo Console de Desvio — sabota a fase fantasma pro resto do
  // confronto: o trem fica sempre visível/atingível.
  disablePhasing() {
    this.phasingDisabled = true;
  }

  // Chamado junto com disablePhasing() — recolhe o trem de volta pro spawn
  // dele na Câmara dos Trilhos. Sem isso, a própria fase fantasma pode ter
  // arrastado ele (ela alinha com a posição ATUAL do jogador, em qualquer
  // ponto da linha) pra longe da arena antes mesmo do Portão dos Trilhos
  // abrir — sabotar o console também "chama ele de volta" pro confronto.
  recallToArena() {
    if (!this.alive) return;
    this.scene.tweens.killTweensOf(this.sprite);
    if (this.chargeTelegraph) { this.chargeTelegraph.destroy(); this.chargeTelegraph = null; }
    for (const tick of this.chargeTicks) tick.destroy();
    this.chargeTicks = [];
    this.chargeState = 'idle';
    this.phasing = false;
    this.sprite.setAlpha(0.15);

    this.scene.time.delayedCall(80, () => {
      if (!this.alive) return;
      this.gx = this.spawn.gx;
      this.gy = this.spawn.gy;
      const world = this.tileMap.gridToWorld(this.gx, this.gy);
      this.sprite.setPosition(world.x, world.y);
      this.scene.tweens.add({ targets: this.sprite, alpha: 1, duration: 300, ease: 'Cubic.Out' });
      if (this.auraRing) { this.auraRing.setPosition(world.x, world.y); this.auraRing.setVisible(true); }
      playSfx(this.scene, 'sfx_door', { volume: 0.4 });
    });
  }

  // Espelha (eixo horizontal) ou rotaciona ±90° (eixo vertical) o sprite —
  // desenhado virado pra direita por padrão — pra sempre apontar o nariz na
  // direção real de movimento/investida, nunca na diagonal.
  _updateFacing(dx, dy) {
    if (Math.abs(dx) >= Math.abs(dy)) {
      this.sprite.setRotation(0);
      this.sprite.setFlipX(dx < 0);
    } else {
      this.sprite.setFlipX(false);
      this.sprite.setRotation(dy > 0 ? Math.PI / 2 : -Math.PI / 2);
    }
  }

  _enrage() {
    this.enraged = true;
    playSfx(this.scene, 'sfx_enrage', { volume: 0.55 });
    this.speed = this.baseSpeed * 1.3;
    this.attackDamage = Math.round(this.baseAttackDamage * 1.3);
    this.chargeDamage = Math.round(this.baseChargeDamage * 1.25);
    this.chargeCooldown = Math.round(CHARGE_COOLDOWN * 0.65);
    this.phaseCooldown = Math.round(PHASE_COOLDOWN * 0.7);
    this.sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(150, () => this.alive && !this.phasing && this.sprite.clearTint());
    this.scene.cameras.main.shake(220, 0.006);
    if (this.glowFx) this.glowFx.outerStrength = 2.4;
  }

  die() {
    this.scene.cameras.main.shake(300, 0.01);
    if (this.chargeTelegraph) { this.chargeTelegraph.destroy(); this.chargeTelegraph = null; }
    for (const tick of this.chargeTicks) tick.destroy();
    this.chargeTicks = [];
    if (this.auraRing) { this.auraRing.destroy(); this.auraRing = null; }
    if (this.beamGlow) { this.beamGlow.destroy(); this.beamGlow = null; }
    super.die();
  }

  // Golpes não acertam durante a fase fantasma — intocável de verdade, não
  // só "difícil de mirar".
  takeDamage(amount, fromGx, fromGy, knockbackMul) {
    if (this.phasing) return false;
    return super.takeDamage(amount, fromGx, fromGy, knockbackMul);
  }

  // -------- fase fantasma --------

  _tryStartPhase(player) {
    if (this.phasingDisabled) return;
    if (this.chargeState !== 'idle' || this.phasing) return;
    const now = this.scene.time.now;
    if (now - this.lastPhaseAt < this.phaseCooldown) return;
    this.lastPhaseAt = now;
    this.phasing = true;
    this.sprite.clearTint();
    if (this.auraRing) this.auraRing.setVisible(false);

    this.scene.tweens.add({
      targets: this.sprite,
      alpha: 0.22,
      duration: PHASE_FADE_MS,
      ease: 'Cubic.In',
      onComplete: () => {
        const spot = this._pickRailSpot(player) || { gx: this.gx, gy: this.gy };
        this.gx = spot.gx;
        this.gy = spot.gy;
        const world = this.tileMap.gridToWorld(this.gx, this.gy);
        this.sprite.setPosition(world.x, world.y);

        this.scene.time.delayedCall(PHASE_DURATION_MS, () => {
          if (!this.alive) return;
          this.scene.tweens.add({
            targets: this.sprite,
            alpha: 1,
            duration: PHASE_FADE_MS,
            ease: 'Cubic.Out',
            onComplete: () => {
              this.phasing = false;
              if (this.auraRing) this.auraRing.setVisible(true);
              playSfx(this.scene, 'sfx_door', { volume: 0.35 });
            }
          });
        });
      }
    });
  }

  // Escolhe um ponto alinhado (mesma linha OU coluna) com o jogador, a uma
  // distância que sobra espaço pra uma investida depois.
  _pickRailSpot(player) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const alignRow = Math.random() < 0.5;
      const offset = (PHASE_RANGE_MIN + Math.random() * (PHASE_RANGE_MAX - PHASE_RANGE_MIN)) * (Math.random() < 0.5 ? 1 : -1);
      const gx = alignRow ? Phaser.Math.Clamp(Math.round(player.gx + offset), 0, this.tileMap.cols - 1) : Math.round(player.gx);
      const gy = alignRow ? Math.round(player.gy) : Phaser.Math.Clamp(Math.round(player.gy + offset), 0, this.tileMap.rows - 1);
      if (this.tileMap.isWalkable(gx, gy)) return { gx, gy };
    }
    return null;
  }

  // -------- investida no trilho --------

  _tryStartCharge(player) {
    if (this.chargeState !== 'idle' || this.phasing) return;
    const now = this.scene.time.now;
    if (now - this.lastChargeAt < this.chargeCooldown) return;

    const dx = player.gx - this.gx;
    const dy = player.gy - this.gy;
    const dist = Math.hypot(dx, dy);
    if (dist < CHARGE_MIN_RANGE || dist > CHARGE_MAX_RANGE) return;

    let dir = null;
    if (Math.abs(dy) <= RAIL_TOLERANCE) dir = { x: Math.sign(dx) || 1, y: 0 };
    else if (Math.abs(dx) <= RAIL_TOLERANCE) dir = { x: 0, y: Math.sign(dy) || 1 };
    if (!dir) return;

    this.lastChargeAt = now;
    this.chargeDir = dir;
    this.chargeState = 'telegraph';
    this.chargeStateUntil = now + CHARGE_TELEGRAPH_MS;
    this.chargeHitPlayer = false;
    this._updateFacing(dir.x, dir.y);

    const world = this.tileMap.gridToWorld(this.gx, this.gy);
    const angle = Math.atan2(dir.y, dir.x);
    const lengthPx = CHARGE_MAX_RANGE * TILE_SIZE;
    this.chargeTelegraph = this.scene.add.rectangle(
      world.x + Math.cos(angle) * lengthPx / 2, world.y + Math.sin(angle) * lengthPx / 2,
      lengthPx, 10, GHOST_TINT, 0.32
    ).setRotation(angle).setDepth(8999).setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({ targets: this.chargeTelegraph, alpha: 0.1, duration: 120, yoyo: true, repeat: -1 });

    // Marcas de dormente ao longo do telégrafo — lê como um trilho se
    // acendendo à frente, não só uma linha genérica de aviso.
    this.chargeTicks = [];
    for (let i = 1; i <= RAIL_TICK_COUNT; i++) {
      const t = i / (RAIL_TICK_COUNT + 1);
      const tx = world.x + Math.cos(angle) * lengthPx * t;
      const ty = world.y + Math.sin(angle) * lengthPx * t;
      const tick = this.scene.add.rectangle(tx, ty, 4, 16, GHOST_TINT, 0.45)
        .setRotation(angle + Math.PI / 2).setDepth(8998).setBlendMode(Phaser.BlendModes.ADD);
      this.scene.tweens.add({ targets: tick, alpha: 0.1, duration: 100, delay: i * 40, yoyo: true, repeat: -1 });
      this.chargeTicks.push(tick);
    }

    this._spawnHitParticles(world.x, world.y, 6, 18, GHOST_TINT);
    playSfx(this.scene, 'sfx_enrage', { volume: 0.3 });
  }

  _updateCharge(deltaSec, player) {
    const now = this.scene.time.now;

    if (this.chargeState === 'telegraph') {
      if (now >= this.chargeStateUntil) {
        this.chargeState = 'charging';
        this.chargeStateUntil = now + CHARGE_DURATION_MS;
        if (this.chargeTelegraph) { this.chargeTelegraph.destroy(); this.chargeTelegraph = null; }
        for (const tick of this.chargeTicks) tick.destroy();
        this.chargeTicks = [];
        this.scene.cameras.main.shake(110, 0.004);
      }
      return true;
    }

    if (this.chargeState === 'charging') {
      const nx = this.gx + this.chargeDir.x * CHARGE_SPEED * deltaSec;
      const ny = this.gy + this.chargeDir.y * CHARGE_SPEED * deltaSec;
      let stopped = false;
      if (this.canOccupy(nx, this.gy)) this.gx = nx; else stopped = true;
      if (this.canOccupy(this.gx, ny)) this.gy = ny; else stopped = true;

      if (!this.chargeHitPlayer && player.alive) {
        const dist = Math.hypot(player.gx - this.gx, player.gy - this.gy);
        if (dist <= CHARGE_HIT_RADIUS) {
          player.takeDamage(this.chargeDamage);
          this.chargeHitPlayer = true;
          this.scene.cameras.main.shake(160, 0.007);
        }
      }

      const world = this.tileMap.gridToWorld(this.gx, this.gy);
      this.sprite.setPosition(world.x, world.y);
      this.sprite.setDepth(Math.round(this.gy) * 10 + 4);
      this._spawnGhostTrail();

      if (stopped || now >= this.chargeStateUntil) {
        this.chargeState = 'recover';
        this.chargeStateUntil = now + CHARGE_RECOVER_MS;
        this._spawnHitParticles(world.x, world.y, 8, 24, GHOST_TINT);
        this.scene.cameras.main.shake(140, 0.006);
      }
      return true;
    }

    if (this.chargeState === 'recover') {
      if (now >= this.chargeStateUntil) this.chargeState = 'idle';
      return true;
    }

    return false;
  }

  // Pós-imagens fantasmagóricas atrás do sprite durante a investida — motion
  // blur "de mentira", reforça velocidade E o tema fantasma ao mesmo tempo.
  _spawnGhostTrail() {
    const now = this.scene.time.now;
    if (now - this.lastTrailAt < TRAIL_INTERVAL_MS) return;
    this.lastTrailAt = now;

    const ghost = this.scene.add.image(this.sprite.x, this.sprite.y, this.sprite.texture.key)
      .setRotation(this.sprite.rotation)
      .setFlipX(this.sprite.flipX)
      .setScale(this.sprite.scaleX, this.sprite.scaleY)
      .setAlpha(0.32)
      .setTint(GHOST_TINT)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(this.sprite.depth - 1);
    this.scene.tweens.add({
      targets: ghost,
      alpha: 0,
      scale: ghost.scaleX * 0.9,
      duration: 260,
      ease: 'Cubic.Out',
      onComplete: () => ghost.destroy()
    });
  }

  // Farol esticado ao longo do eixo do ataque — só aceso durante telégrafo/
  // investida, apagado o resto do tempo.
  _updateBeamGlow() {
    if (this.chargeState !== 'telegraph' && this.chargeState !== 'charging') {
      this.beamGlow.setAlpha(0);
      return;
    }
    const world = this.tileMap.gridToWorld(this.gx, this.gy);
    const angle = Math.atan2(this.chargeDir.y, this.chargeDir.x);
    const lengthPx = CHARGE_MAX_RANGE * TILE_SIZE;
    this.beamGlow.setPosition(world.x + Math.cos(angle) * lengthPx / 2, world.y + Math.sin(angle) * lengthPx / 2);
    this.beamGlow.setRotation(angle);
    this.beamGlow.setScale(lengthPx / 120, 0.4);
    const pulse = this.chargeState === 'telegraph' ? 0.5 + Math.sin(this.scene.time.now / 55) * 0.18 : 0.32;
    this.beamGlow.setAlpha(pulse);
  }

  update(deltaSec, player) {
    if (!this.alive) {
      if (this.nameTag) { this.nameTag.destroy(); this.nameTag = null; }
      if (this.auraRing) { this.auraRing.destroy(); this.auraRing = null; }
      return;
    }

    if (!this.enraged && this.hp / this.maxHp <= ENRAGE_THRESHOLD) {
      this._enrage();
    }

    if (this.phasing) {
      // Sem colisão/ataque durante a fase — só a posição já foi trocada
      // pelo próprio _tryStartPhase() no meio do fade.
    } else {
      const chargeActive = this._updateCharge(deltaSec, player);
      if (!chargeActive) {
        super.update(deltaSec, player);
        const dx = player.gx - this.gx;
        const dy = player.gy - this.gy;
        if (Math.hypot(dx, dy) > 0.2) this._updateFacing(dx, dy);
        this._tryStartCharge(player);
        this._tryStartPhase(player);
      }
    }

    this._updateBeamGlow();

    if (this.nameTag) this.nameTag.setPosition(this.sprite.x, this.sprite.y - 48);
    if (this.auraRing && this.auraRing.visible) {
      this.auraRing.setPosition(this.sprite.x, this.sprite.y);
      this.auraRing.setDepth(this.sprite.depth - 1);
      this.auraRing.angle += deltaSec * 40;
    }
    this.hpBarBg.setPosition(this.sprite.x, this.sprite.y - 34);
    this.hpBarFg.setPosition(this.sprite.x - this.barWidth / 2, this.sprite.y - 34);
    this.hpBarFg.width = this.barWidth * (this.hp / this.maxHp);
  }
}
