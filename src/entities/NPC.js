const INTERACT_RANGE = 1.1;

export default class NPC {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    this.scene = scene;
    this.tileMap = tileMap;
    this.gx = gx;
    this.gy = gy;
    this.id = opts.id || `npc-${gx}-${gy}`;
    this.name = opts.name || 'Cidadão';
    this.lines = opts.lines || ['...'];
    this.lineIndex = 0;

    this.bobPhase = Math.random() * 1000;
    this.baseWorld = tileMap.gridToWorld(gx, gy);

    // Corpo e cabeça são dois sprites separados (texturas geradas em
    // BootScene com o mesmo canvas, cada uma só com sua metade preenchida)
    // — só a cabeça balança verticalmente em update(), o corpo fica parado
    // de verdade no chão em vez de "flutuar" junto.
    const world = this.baseWorld;
    const baseTexture = opts.texture || 'npc_worker';
    const depth = Math.round(gy) * 10 + 4;

    this.bodySprite = scene.add.image(world.x, world.y, `${baseTexture}_body`);
    this.bodySprite.setOrigin(0.5, 0.5);
    this.bodySprite.setDepth(depth);

    this.headSprite = scene.add.image(world.x, world.y, `${baseTexture}_head`);
    this.headSprite.setOrigin(0.5, 0.5);
    this.headSprite.setDepth(depth + 1);

    if (opts.tint) {
      this.bodySprite.setTint(opts.tint);
      this.headSprite.setTint(opts.tint);
    }

    this.indicator = scene.add.text(world.x, world.y - 26, '!', {
      fontFamily: 'Courier New',
      fontSize: '14px',
      color: '#ffe066'
    }).setOrigin(0.5).setDepth(9002).setVisible(false);
  }

  isNear(player) {
    const dist = Math.hypot(player.gx - this.gx, player.gy - this.gy);
    return dist <= INTERACT_RANGE;
  }

  setHighlighted(on) {
    this.indicator.setVisible(on);
  }

  update() {
    // Só a cabeça balança (vertical) — o corpo fica parado no chão, sem o
    // "flutuando" que dava quando o sprite inteiro subia e descia.
    const bob = Math.sin((this.scene.time.now + this.bobPhase) / 260) * 1.2;
    this.headSprite.setPosition(this.baseWorld.x, this.baseWorld.y + bob);
    this.indicator.setPosition(this.baseWorld.x, this.baseWorld.y + bob - 26);
  }

  currentLine() {
    const line = this.lines[Math.min(this.lineIndex, this.lines.length - 1)];
    if (this.lineIndex < this.lines.length - 1) this.lineIndex++;
    return `${this.name}: ${line}`;
  }
}
