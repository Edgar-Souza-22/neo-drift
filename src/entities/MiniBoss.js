import Enemy from './Enemy.js';

// Semi-boss (guardião do cofre) — mais forte que um blindado comum, com
// nome exibido acima da cabeça como os chefes de verdade, mas sem ataque
// especial próprio (é um "muro de HP" antes da recompensa do cofre, não um
// chefe de fase). Reutilizável em qualquer fase que precise de um guardião.
export default class MiniBoss extends Enemy {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, {
      hp: opts.hp || 240,
      speed: opts.speed || 1.05,
      attackDamage: opts.attackDamage || 22,
      xpReward: opts.xpReward || 90,
      texture: opts.texture || 'enemy_miniboss',
      hpBarWidth: 36,
      scale: 1.05,
      ammoDropChance: opts.ammoDropChance ?? 0,
      onDeath: opts.onDeath
    });
    this.isMiniBoss = true;
    this.nameTag = this.scene.add.text(this.sprite.x, this.sprite.y - 30, opts.name || 'GUARDIÃO DO COFRE', {
      fontFamily: 'Courier New',
      fontSize: '10px',
      color: '#ffd27a'
    }).setOrigin(0.5).setDepth(9002);
  }

  die() {
    if (this.nameTag) {
      this.nameTag.destroy();
      this.nameTag = null;
    }
    super.die();
  }

  update(deltaSec, player) {
    super.update(deltaSec, player);
    if (this.nameTag) this.nameTag.setPosition(this.sprite.x, this.sprite.y - 32);
  }
}
