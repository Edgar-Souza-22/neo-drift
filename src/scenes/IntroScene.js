import Phaser from 'phaser';
import { INTRO_BEATS } from '../data/introStory.js';
import { playMusic, playSfx } from '../audio/AudioManager.js';
import {
  paintTitleBackdrop,
  createTitleLogo,
  createDustField,
  fadeToScene,
  hudText
} from '../ui/titleAtmosphere.js';

const MS_PER_CHAR = 28;
const BODY_WRAP = 640;
const BODY_STYLE = {
  fontFamily: 'Courier New',
  fontSize: '16px',
  color: '#e8ecff',
  stroke: '#05060c',
  strokeThickness: 3,
  align: 'center',
  lineSpacing: 8,
  wordWrap: { width: BODY_WRAP }
};

export default class IntroScene extends Phaser.Scene {
  constructor() {
    super('IntroScene');
  }

  create() {
    this._sceneLeaving = false;
    this.beatIndex = 0;
    this.phase = 'idle';
    this.typed = '';
    this.fullText = '';
    this.charIndex = 0;
    this.accum = 0;
    this.sfxCounter = 0;

    const w = this.scale.width;
    const h = this.scale.height;
    const cx = w / 2;

    paintTitleBackdrop(this);
    const logo = createTitleLogo(this, cx, h * 0.18, 1.15);
    logo.setAlpha(0.55);
    this.dust = createDustField(this, 6);

    this.kicker = hudText(this, cx, h * 0.38, '', 18, '#7de8ff').setOrigin(0.5).setDepth(20).setAlpha(0);
    this.body = this.add.text(cx, h * 0.46, '', BODY_STYLE).setOrigin(0.5, 0).setDepth(20).setAlpha(1);

    this.advanceHint = hudText(this, cx, h - 36, '', 12, '#7de8ff').setOrigin(0.5).setDepth(20).setAlpha(0);
    this.skipHint = hudText(this, cx, h - 18, 'Esc para pular', 11, '#5a6580').setOrigin(0.5).setDepth(20).setAlpha(0);

    this.tweens.add({
      targets: this.skipHint,
      alpha: 0.7,
      duration: 600,
      delay: 900
    });

    this.cameras.main.fadeIn(700, 4, 5, 10);
    playMusic(this, 'music_town', 0.24);

    this.input.keyboard.off('keydown-SPACE');
    this.input.keyboard.off('keydown-ENTER');
    this.input.keyboard.off('keydown-ESC');
    this.input.keyboard.on('keydown-SPACE', () => this._onAdvance());
    this.input.keyboard.on('keydown-ENTER', () => this._onAdvance());
    this.input.keyboard.on('keydown-ESC', () => this._skipAll());
    this.input.on('pointerdown', this._onAdvance, this);

    this.events.once('shutdown', this.shutdown, this);

    this.time.delayedCall(420, () => this._showBeat(0));
  }

  _wrapBody(text) {
    const probe = this.add.text(-9999, -9999, text, BODY_STYLE).setVisible(false);
    let wrapped = text;
    if (typeof probe.getWrappedText === 'function') {
      const raw = probe.getWrappedText();
      wrapped = Array.isArray(raw) ? raw.join('\n') : raw;
    }
    probe.destroy();
    return wrapped;
  }

  _showBeat(index) {
    if (this._sceneLeaving) return;
    this.beatIndex = index;
    const beat = INTRO_BEATS[index];
    this.fullText = this._wrapBody(beat.body);
    this.charIndex = 0;
    this.accum = 0;
    this.sfxCounter = 0;
    this.body.setText('');
    this.advanceHint.setAlpha(0);
    this.advanceHint.setText('');

    const kicker = beat.kicker || '';
    this.kicker.setText(kicker);
    this.kicker.setAlpha(0);
    this.kicker.y = this.scale.height * 0.38 + 10;
    this.body.y = this.scale.height * 0.46 + 10;
    this.body.setAlpha(0);

    this.tweens.add({
      targets: this.kicker,
      alpha: kicker ? 1 : 0,
      y: this.scale.height * 0.38,
      duration: 480,
      ease: 'Quad.Out'
    });
    this.tweens.add({
      targets: this.body,
      alpha: 1,
      y: this.scale.height * 0.46,
      duration: 480,
      ease: 'Quad.Out',
      onComplete: () => {
        this.phase = 'typing';
      }
    });
    this.phase = 'entering';
  }

  _finishTyping() {
    this.charIndex = this.fullText.length;
    this.body.setText(this.fullText);
    this.phase = 'waiting';
    this.advanceHint.setText(this.beatIndex < INTRO_BEATS.length - 1 ? '▼  continuar' : '▼  entrar na Ala Central');
    this.tweens.killTweensOf(this.advanceHint);
    this.advanceHint.setAlpha(0);
    this.tweens.add({
      targets: this.advanceHint,
      alpha: 1,
      duration: 420,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut'
    });
  }

  _onAdvance() {
    if (this._sceneLeaving) return;
    if (this.phase === 'entering') return;
    if (this.phase === 'typing') {
      this._finishTyping();
      playSfx(this, 'sfx_dialogue', { volume: 0.2 });
      return;
    }
    if (this.phase !== 'waiting') return;
    playSfx(this, 'sfx_menu_open', { volume: 0.22 });
    const next = this.beatIndex + 1;
    if (next >= INTRO_BEATS.length) {
      this._enterTown();
      return;
    }
    this.phase = 'leaving';
    this.tweens.killTweensOf(this.advanceHint);
    this.tweens.add({
      targets: [this.kicker, this.body, this.advanceHint],
      alpha: 0,
      duration: 320,
      ease: 'Quad.In',
      onComplete: () => this._showBeat(next)
    });
  }

  _skipAll() {
    playSfx(this, 'sfx_menu_close', { volume: 0.25 });
    this._enterTown();
  }

  _enterTown() {
    fadeToScene(this, 'TownScene', { loaded: false }, 900);
  }

  update(_time, delta) {
    if (this.dust) this.dust.update(delta);
    if (this.phase !== 'typing') return;

    this.accum += delta;
    while (this.accum >= MS_PER_CHAR && this.charIndex < this.fullText.length) {
      this.accum -= MS_PER_CHAR;
      this.charIndex += 1;
      this.sfxCounter += 1;
      if (this.sfxCounter % 4 === 0) {
        const ch = this.fullText[this.charIndex - 1];
        if (ch && ch.trim()) playSfx(this, 'sfx_dialogue', { volume: 0.12 });
      }
    }
    this.body.setText(this.fullText.slice(0, this.charIndex));
    if (this.charIndex >= this.fullText.length) this._finishTyping();
  }

  shutdown() {
    this.input.keyboard.off('keydown-SPACE');
    this.input.keyboard.off('keydown-ENTER');
    this.input.keyboard.off('keydown-ESC');
    this.input.off('pointerdown', this._onAdvance, this);
    this.events.off('shutdown', this.shutdown, this);
  }
}
