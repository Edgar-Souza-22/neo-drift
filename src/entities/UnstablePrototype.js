import Phaser from 'phaser';
import Enemy from './Enemy.js';
import { playSfx } from '../audio/AudioManager.js';

// Janela em que a segunda forma nasce atordoada — dá ao jogador o tempo de
// ler o que acabou de sair do casco antes de levar porrada.
const EMERGE_STUN_MS = 700;

// Protótipo Instável — o inimigo que só existe no Departamento de P&D
// (Fase 18). Ao morrer, uma SEGUNDA FORMA emerge do casco: um arquétipo
// diferente, de alguma fase anterior. Nenhum inimigo da série faz isso, e é
// a mecânica que mais diz "isto aqui é um laboratório" — o que você derruba
// não estava pronto, estava em iteração.
export default class UnstablePrototype extends Enemy {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, {
      texture: 'enemy_prototype', hpBarWidth: 28, scale: 1.05, ...opts
    });
    // Classe da segunda forma + os stats com que ela nasce. Quem escolhe é a
    // cena (ver PesquisaScene SECOND_FORMS), pra a lista de arquétipos
    // reaproveitados ficar legível num lugar só.
    this.secondForm = opts.secondForm || null;
    this.secondFormStats = opts.secondFormStats || {};
    this.onSecondForm = opts.onSecondForm || null;
    this.hasSplit = false;
  }

  _spawnSecondForm() {
    const SecondForm = this.secondForm;
    const emerged = new SecondForm(this.scene, this.tileMap, this.gx, this.gy, {
      ...this.secondFormStats,
      onDeath: this.onDeath
    });
    emerged.isEmergedForm = true;
    emerged.stunUntil = this.scene.time.now + EMERGE_STUN_MS;

    // "Nascendo": entra pequeno e transparente e cresce até o tamanho normal.
    const targetScale = emerged.baseScale;
    emerged.sprite.setScale(targetScale * 0.3).setAlpha(0.35);
    this.scene.tweens.add({
      targets: emerged.sprite, alpha: 1, scale: targetScale, duration: EMERGE_STUN_MS, ease: 'Back.Out'
    });

    const world = this.tileMap.gridToWorld(this.gx, this.gy);
    const burst = this.scene.add.image(world.x, world.y, 'light_pool')
      .setTint(0xb37aff).setBlendMode(Phaser.BlendModes.ADD).setDepth(9002).setScale(0.4).setAlpha(0.9);
    this.scene.tweens.add({
      targets: burst, alpha: 0, scale: 1.8, duration: 320, onComplete: () => burst.destroy()
    });
    playSfx(this.scene, 'sfx_enrage', { volume: 0.3 });

    return emerged;
  }

  die() {
    // A segunda forma entra na lista de inimigos AGORA, de forma síncrona, e
    // não depois de um delay: a cena encerra a fase no frame em que
    // `remaining` chega a zero, então um intervalo entre a morte do casco e o
    // nascimento faria a fase terminar sozinha no último protótipo do mapa.
    if (!this.hasSplit && this.secondForm && Array.isArray(this.scene.enemies)) {
      this.hasSplit = true;
      const emerged = this._spawnSecondForm();
      this.scene.enemies.push(emerged);
      this.onSecondForm?.(emerged, this);
    }
    super.die();
  }
}
