import Phaser from 'phaser';
import Enemy from './Enemy.js';
import { playSfx } from '../audio/AudioManager.js';

// Cone frontal protegido pelo escudo, em graus a partir da direção que o
// guarda encara. 75° pra cada lado = quase toda a frente, mas as laterais e
// as costas continuam abertas.
export const BLOCK_ARC_DEG = 75;
// Fração do dano que ainda passa por um golpe frontal — não é imunidade
// total de propósito: insistir de frente continua funcionando, só é péssimo.
export const BLOCK_DAMAGE_MUL = 0.12;
// Velocidade máxima de giro (rad/s). É isso que torna o flanqueio possível:
// o guarda SEMPRE quer encarar o jogador, mas não gira instantâneo — quem
// circula por fora chega às costas antes do escudo acompanhar.
const TURN_RATE = 2.0;

// A regra do escudo mora aqui porque A Diretora de Segurança (confronto
// final da fase) usa exatamente a mesma na primeira fase da luta — o que o
// jogador aprende contra os guardas é literalmente o que resolve o chefe.

// Gira `faceAngle` na direção de `targetAngle` respeitando o limite de giro.
export function turnToward(faceAngle, targetAngle, rateRadSec, deltaSec) {
  const diff = Phaser.Math.Angle.Wrap(targetAngle - faceAngle);
  const step = rateRadSec * deltaSec;
  return Phaser.Math.Angle.Wrap(faceAngle + Phaser.Math.Clamp(diff, -step, step));
}

// true se um golpe vindo de (fromGx, fromGy) bate no cone frontal de quem
// está em (gx, gy) encarando `faceAngle`.
export function isFrontalHit(faceAngle, gx, gy, fromGx, fromGy, arcDeg = BLOCK_ARC_DEG) {
  if (fromGx == null) return false;
  const incoming = Math.atan2(fromGy - gy, fromGx - gx);
  const delta = Math.abs(Phaser.Math.Angle.Wrap(incoming - faceAngle));
  return delta <= Phaser.Math.DegToRad(arcDeg);
}

// Guarda de Escudo — segurança corporativa do Átrio Executivo (Fase 17).
// Primeiro inimigo do jogo em que a DIREÇÃO do golpe importa: o escudo de
// choque cobre a frente, então bater de frente é quase inútil e o caminho é
// contornar. Todo o resto (perseguir, bater por contato) continua herdado de
// Enemy — a novidade está inteira em takeDamage/_updateFacing.
export default class ShieldGuard extends Enemy {
  constructor(scene, tileMap, gx, gy, opts = {}) {
    super(scene, tileMap, gx, gy, {
      texture: 'enemy_shieldguard', hpBarWidth: 30, scale: 1.1, ...opts
    });
    // Começa encarando pra baixo (mesma convenção do jogador).
    this.faceAngle = Math.PI / 2;
    this.shieldFx = null;
  }

  _updateFacing(deltaSec, player) {
    if (!player?.alive) return;
    const target = Math.atan2(player.gy - this.gy, player.gx - this.gx);
    this.faceAngle = turnToward(this.faceAngle, target, TURN_RATE, deltaSec);
  }

  // Marca visual do lado protegido: um arco curto grudado na frente do
  // guarda, atualizado por frame. Sem isso o jogador não teria como saber
  // pra onde o escudo está virado.
  _updateShieldFx() {
    const offX = Math.cos(this.faceAngle) * 13;
    const offY = Math.sin(this.faceAngle) * 13;
    if (!this.shieldFx) {
      this.shieldFx = this.scene.add.image(0, 0, 'fx_shield')
        .setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.7);
    }
    this.shieldFx.setPosition(this.sprite.x + offX, this.sprite.y + offY);
    this.shieldFx.setRotation(this.faceAngle);
    this.shieldFx.setDepth(this.sprite.depth + 1);
  }

  isBlockedFrom(fromGx, fromGy) {
    return isFrontalHit(this.faceAngle, this.gx, this.gy, fromGx, fromGy);
  }

  _spawnBlockSpark() {
    const world = this.tileMap.gridToWorld(this.gx, this.gy);
    const spark = this.scene.add.image(
      world.x + Math.cos(this.faceAngle) * 13,
      world.y + Math.sin(this.faceAngle) * 13,
      'particle'
    ).setTint(0x8fb4ff).setBlendMode(Phaser.BlendModes.ADD).setDepth(9500).setScale(1.6);
    this.scene.tweens.add({
      targets: spark, alpha: 0, scale: 0.4, duration: 220, onComplete: () => spark.destroy()
    });
  }

  takeDamage(amount, fromGx, fromGy, knockbackMul = 1) {
    if (!this.alive) return false;
    if (this.isBlockedFrom(fromGx, fromGy)) {
      playSfx(this.scene, 'sfx_hit', { volume: 0.18 });
      this._spawnBlockSpark();
      // Recuo também abafado — bater no escudo não deve afastar o guarda como
      // um acerto limpo afasta.
      return super.takeDamage(
        Math.max(1, Math.round(amount * BLOCK_DAMAGE_MUL)),
        fromGx, fromGy, knockbackMul * 0.25
      );
    }
    return super.takeDamage(amount, fromGx, fromGy, knockbackMul);
  }

  die() {
    if (this.shieldFx) { this.shieldFx.destroy(); this.shieldFx = null; }
    super.die();
  }

  update(deltaSec, player) {
    if (!this.alive) return;
    super.update(deltaSec, player);
    if (!this.alive) return;
    // Atordoado (Granada EMP) o escudo para de acompanhar — a janela em que
    // dá pra bater de frente sem penalidade.
    if (this.scene.time.now >= this.stunUntil) this._updateFacing(deltaSec, player);
    this._updateShieldFx();
  }
}
