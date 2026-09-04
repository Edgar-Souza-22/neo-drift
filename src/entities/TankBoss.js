import BossBase from './boss/BossBase.js';
import { DashChargeAttack, GroundMarkAttack } from './boss/attacks.js';

// Tanque de Cerco (Fase 06) — investida em linha reta (melee) + bombardeio
// de canhão (ranged). O console da Sala de Controle de Artilharia desliga
// o canhão; a investida continua.
export default class TankBoss extends BossBase {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, {
      hp: opts.hp || 1300,
      speed: opts.speed || 0.65,
      attackDamage: opts.attackDamage || 26,
      xpReward: opts.xpReward || 600,
      texture: opts.texture || 'boss_tank',
      hpBarWidth: 52,
      scale: 1.2,
      name: opts.name || 'TANQUE DE CERCO',
      nameColor: '#9fff6a',
      nameOffset: 48,
      barOffset: 36,
      auraTint: 0x9fff6a,
      auraScale: 1.25,
      onDeath: opts.onDeath,
      enrageSpeedMul: 1.35,
      enrageMeleeMul: 1.3,
      enrageAttackMods: { cooldownMul: 0.65, damageMul: 1.25 }
    });

    this.addAttack(new DashChargeAttack(this, {
      damage: opts.chargeDamage || 42, cooldown: 4000,
      minRange: 1.6, maxRange: 7, telegraphMs: 700, durationMs: 900,
      recoverMs: 900, speed: 5.5, hitRadius: 0.8,
      telegraphColor: 0x9fff6a, firstDelay: 1200,
      onRecover: () => { this.sprite.setTintFill(0x5a6a4a); }
    }));
    this.cannon = this.addAttack(new GroundMarkAttack(this, {
      damage: opts.shellDamage || 36, cooldown: 3400, maxRange: 8,
      telegraphMs: 650, radius: 1.4, tint: 0xffb347, style: 'shell',
      flash: [255, 200, 140], firstDelay: 900
    }));
  }

  disableCannon() {
    this.cannon.enabled = false;
  }
}
