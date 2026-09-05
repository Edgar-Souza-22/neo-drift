import BossBase from './boss/BossBase.js';
import {
  OrbitAttack, VacuumAttack, SpreadWaveAttack, MirrorCloneAttack, ProjectileAttack
} from './boss/attacks.js';
import { playSfx } from '../audio/AudioManager.js';

const TANK_BREAK_THRESHOLD = 0.65;
const ORBIT_RETRIGGER_MS = 800;

// O PROJETISTA (Fase 18) — a inteligência de projeto que desenhou todo
// inimigo que o jogador enfrentou desde a Fase 01. Deliberadamente NÃO
// humano: os dois chefes anteriores (O Barão do Mercado, A Diretora de
// Segurança) foram silhuetas humanas, e a série precisava quebrar isso.
//
// Estreia os quatro padrões novos da fase, em 3 fases reais:
//
//   1. NO TANQUE (100%→65%): `anchored`, não persegue. Já abre com o
//      repertório à distância montado — PROTÓTIPOS EM ÓRBITA (OrbitAttack)
//      negando o corpo a corpo, ONDA DE DIAGNÓSTICO (SpreadWaveAttack)
//      obrigando a achar a brecha, e SUCÇÃO (VacuumAttack) puxando o jogador
//      pra dentro do anel de órbita. Preso e sem perseguir, ele compensa
//      controlando a arena inteira desde o primeiro segundo.
//   2. TANQUE ROMPIDO (65%→35%): o casco racha (_breakTank), ele passa a se
//      mover, e planta CÓPIAS-FANTASMA (MirrorCloneAttack) LONGE de si. Com
//      a órbita negando o miolo e as cópias semeando a periferia, o espaço
//      seguro fecha pelos dois lados ao mesmo tempo.
//   3. REVISÃO (<35%, limiar padrão de BossBase): tudo acelera — órbita mais
//      rápida e mais cheia, uma cópia a mais por revisão (`extraCount`), e
//      cooldowns menores.
export default class ProjetistaBoss extends BossBase {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, {
      hp: opts.hp || 3000,
      speed: opts.speed || 1.1,
      attackDamage: opts.attackDamage || 44,
      xpReward: opts.xpReward || 1500,
      texture: opts.texture || 'boss_projetista',
      name: opts.name || 'O PROJETISTA',
      nameColor: '#b37aff',
      auraTint: 0xb37aff,
      onDeath: opts.onDeath,
      anchored: true,
      enrageSpeedMul: 1.25,
      enrageAttackMods: { cooldownMul: 0.6, damageMul: 1.3, orbitSpeedMul: 1.4, extraCount: 1 }
    });

    this.tankBroken = false;

    // Órbita fora do seletor automático (`autoPick: false`): ela não é um
    // golpe alternativo, é uma camada que roda POR CIMA dos outros. Quem
    // decide quando religar é o update() daqui embaixo.
    this.orbit = this.addAttack(new OrbitAttack(this, {
      damage: opts.orbitDamage || 26, cooldown: 7000, autoPick: false,
      count: 3, radius: 2.3, radiusSwing: 0.9, swingMs: 2200,
      angularSpeed: 1.9, durationMs: 6200, hitRadius: 0.6,
      tint: 0xb37aff, firstDelay: 600
    }));
    this.vacuum = this.addAttack(new VacuumAttack(this, {
      damage: opts.pullDamage || 18, cooldown: 4200, reach: 7.5, minRange: 1.6,
      telegraphMs: 620, pullDistance: 4.0, pullMs: 300,
      tint: 0xb37aff, flash: [179, 122, 255], firstDelay: 1600
    }));
    this.sidearm = this.addAttack(new ProjectileAttack(this, {
      damage: opts.shotDamage || 24, cooldown: 2400, maxRange: 9, minRange: 0,
      count: 2, spreadDeg: 15, speed: 4.8, tint: 0xb37aff, windupMs: 220, firstDelay: 1000
    }));
    // Ativa desde o começo: é o padrão que define a fase ancorada.
    this.wave = this.addAttack(new SpreadWaveAttack(this, {
      damage: opts.waveDamage || 34, cooldown: 5200, maxRange: 12, minRange: 0,
      telegraphMs: 540, travelMs: 1500, maxRadius: 9, gapDeg: 72,
      tint: 0xb37aff, firstDelay: 1800
    }));
    // Entra quando o tanque rompe. `minDistance` mantém as cópias afastadas
    // dele — o ataque existe pra negar a periferia, não pra somar dano em
    // volta do corpo (a órbita já faz isso).
    this.clones = this.addAttack(new MirrorCloneAttack(this, {
      damage: opts.cloneDamage || 32, cooldown: 6000, maxRange: 12, minRange: 0,
      count: 2, delayMs: 950, radius: 1.9, trailMs: 2800,
      minDistance: 5, maxDistance: 8.5, spread: 3,
      tint: 0xb37aff, flash: [179, 122, 255], enabled: false, firstDelay: 0
    }));
  }

  // O casco do tanque cede: a partir daqui ele persegue, e passa a plantar
  // revisões de si mesmo pela arena.
  _breakTank() {
    this.tankBroken = true;
    this.anchored = false;
    this.clones.enabled = true;
    playSfx(this.scene, 'sfx_enrage', { volume: 0.5 });
    this.scene.cameras.main.shake(320, 0.01);
    this.scene.cameras.main.flash(170, 179, 122, 255);
    this.scene.game.events.emit('dialogue', 'O tanque de projeto se rompe — O Projetista sai de dentro dele e começa a deixar revisões de si mesmo pelos cantos da sala.');
  }

  onEnrage() {
    this.scene.game.events.emit('dialogue', 'A revisão acelera: mais protótipos na órbita, mais cópias por vez.');
  }

  update(deltaSec, player) {
    super.update(deltaSec, player);
    if (!this.alive) return;

    if (!this.tankBroken && this.hp / this.maxHp <= TANK_BREAK_THRESHOLD) this._breakTank();

    // A órbita se renova sozinha assim que a anterior acaba e o cooldown
    // permite — ela é estado permanente do confronto, não um golpe ocasional.
    if (!this.orbit.active && this.scene.time.now - this.orbit.lastAt >= this.orbit.cooldown + ORBIT_RETRIGGER_MS) {
      this.orbit.try(player);
    }
  }
}
