import Enemy from './Enemy.js';

const PUDDLE_DURATION_MS = 2800;
const PUDDLE_RADIUS = 0.85;
const PUDDLE_TINT = 0x6dff4a;

// Contaminado — inimigo comum da Fase 11. Mutado pela exposição, silhueta
// humana encurvada (não drone). Ao morrer deixa um charco tóxico temporário
// no chão: área de recusa, não só "morreu e sumiu".
export default class InfectedEnemy extends Enemy {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, { texture: 'enemy_infected', ...opts });
  }

  die() {
    this.scene.spawnToxicPuddle?.(this.gx, this.gy, {
      duration: PUDDLE_DURATION_MS,
      radius: PUDDLE_RADIUS,
      tint: PUDDLE_TINT
    });
    super.die();
  }
}
