import BossBase from './boss/BossBase.js';
import { ProjectileAttack, GroundMarkAttack, DashChargeAttack, ShoveAttack } from './boss/attacks.js';
import StackerEnemy from './StackerEnemy.js';
import ElectricDrone from './ElectricDrone.js';
import { playSfx } from '../audio/AudioManager.js';

// A Baía de Ativação Final mantém um raio de spawn livre onde reforços
// podem aparecer perto d'O Protótipo.
const SUMMON_COOLDOWN = 5200;
const MAX_CONCURRENT_REINFORCEMENTS = 2;
const SPAWN_RADIUS = 3;

// O Protótipo (Fase 15) — o primeiro casco COMPLETO saído da linha de
// montagem. Chefe genuinamente mais difícil que qualquer um anterior: em
// vez de um único limiar de fúria, tem 3 fases reais.
//
//   1. PRESO (100%→65% HP): ainda travado pelos cabos do guindaste
//      (`anchored`, mesma flag que o Roteador usa, aqui alternada em
//      runtime) — só ataques que não pedem movimento: canhão de braço
//      (ProjectileAttack) + marreta do outro braço (GroundMarkAttack
//      "shell").
//   2. SOLTO (65%→35%): ao cruzar 65% HP, corta os cabos (_breakFree) —
//      câmera treme, flash, e habilita a investida (DashChargeAttack) e
//      o soco de empurrão (ShoveAttack), criados desde o construtor com
//      `enabled: false` até este momento.
//   3. FURIOSO (<35%, reaproveita o limiar de fúria padrão de BossBase):
//      além do speed/damage boost de sempre, reativa robôs da própria
//      linha (Empilhadeira, Sentinela Elétrica) como reforço — a linha
//      nunca para.
//
// A arena mantém 1-2 braços robóticos fixos (nunca desligáveis, sem
// painel ali — ver EstaleiroNavalLayout `stationId: 'baia'`), somando
// risco ambiental por cima dos 4 padrões de ataque.
export default class PrototipoBoss extends BossBase {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, {
      hp: opts.hp || 2400,
      speed: opts.speed || 1.0,
      attackDamage: opts.attackDamage || 40,
      xpReward: opts.xpReward || 1100,
      texture: opts.texture || 'boss_prototipo',
      name: opts.name || 'O PROTÓTIPO',
      nameColor: '#8fe0ff',
      auraTint: 0x8fe0ff,
      onDeath: opts.onDeath,
      anchored: true,
      enrageSpeedMul: 1.3,
      enrageAttackMods: { cooldownMul: 0.62, damageMul: 1.3 }
    });

    this.brokenFree = false;
    this.onEnemyDeath = opts.onDeath;
    this.lastSummonAt = -9999;

    this.cannon = this.addAttack(new ProjectileAttack(this, {
      damage: opts.cannonDamage || 22, cooldown: 2200, maxRange: 8, minRange: 0,
      count: 2, spreadDeg: 16, speed: 4.6, tint: 0x8fe0ff, windupMs: 220, firstDelay: 700
    }));
    this.hammer = this.addAttack(new GroundMarkAttack(this, {
      damage: opts.hammerDamage || 34, cooldown: 2600, maxRange: 8,
      telegraphMs: 620, radius: 1.6, style: 'shell',
      tint: 0x8fe0ff, flash: [140, 220, 255], firstDelay: 1400
    }));
    this.charge = this.addAttack(new DashChargeAttack(this, {
      damage: opts.chargeDamage || 38, cooldown: 4600, maxRange: 7,
      telegraphMs: 500, durationMs: 750, recoverMs: 700, speed: 6.2,
      hitRadius: 0.9, telegraphColor: 0x8fe0ff, enabled: false, firstDelay: 0
    }));
    this.shove = this.addAttack(new ShoveAttack(this, {
      damage: opts.shoveDamage || 30, cooldown: 4200, maxRange: 2.4,
      reach: 2.2, arcDeg: 150, telegraphMs: 340, pushDistance: 3.2, pushMs: 260,
      tint: 0x8fe0ff, flash: [140, 220, 255], enabled: false, firstDelay: 0
    }));
  }

  // Corta os cabos do guindaste — a partir daqui, persegue e usa investida
  // + soco de perto, além do canhão/marreta que já tinha.
  _breakFree() {
    this.brokenFree = true;
    this.anchored = false;
    this.charge.enabled = true;
    this.shove.enabled = true;
    playSfx(this.scene, 'sfx_enrage', { volume: 0.5 });
    this.scene.cameras.main.shake(320, 0.01);
    this.scene.cameras.main.flash(160, 140, 220, 255);
    this.scene.game.events.emit('dialogue', 'Os cabos do guindaste se rompem — O Protótipo está livre pra se mover.');
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

  _countAliveReinforcements() {
    return this.scene.enemies.reduce((n, e) => n + (e.isLineReinforcement && e.alive ? 1 : 0), 0);
  }

  // A linha nunca para: reativa os mesmos tipos de robô das estações
  // anteriores como reforço, em vez de invocar algo genérico.
  _trySummonReinforcements() {
    const now = this.scene.time.now;
    if (now - this.lastSummonAt < SUMMON_COOLDOWN) return;
    if (this._countAliveReinforcements() >= MAX_CONCURRENT_REINFORCEMENTS) return;
    this.lastSummonAt = now;
    playSfx(this.scene, 'sfx_door', { volume: 0.35 });

    const kinds = [StackerEnemy, ElectricDrone];
    for (const Kind of kinds) {
      if (this._countAliveReinforcements() >= MAX_CONCURRENT_REINFORCEMENTS) break;
      const spot = this._pickSpawnSpot();
      if (!spot) continue;
      const reinforcement = new Kind(this.scene, this.tileMap, spot.gx, spot.gy, {
        hp: 90, xpReward: 30, onDeath: this.onEnemyDeath
      });
      reinforcement.isLineReinforcement = true;
      this.scene.enemies.push(reinforcement);
    }
  }

  onEnrage() {
    this._trySummonReinforcements();
  }

  update(deltaSec, player) {
    super.update(deltaSec, player);
    if (!this.alive) return;
    if (!this.brokenFree && this.hp / this.maxHp <= 0.65) this._breakFree();
    if (this.enraged) this._trySummonReinforcements();
  }
}
