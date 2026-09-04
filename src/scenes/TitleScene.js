import Phaser from 'phaser';
import { hasSave, peekSaveSummary, loadGame, resetGame, regionHubScene } from '../state/GameState.js';
import { playMusic, playSfx, toggleMute } from '../audio/AudioManager.js';
import { createMenuButton, drawBracketPanel } from '../ui/MenuButton.js';
import {
  paintTitleBackdrop,
  createTitleLogo,
  createDustField,
  fadeToScene,
  hudText
} from '../ui/titleAtmosphere.js';

export default class TitleScene extends Phaser.Scene {
  constructor() {
    super('TitleScene');
  }

  create() {
    this._sceneLeaving = false;
    this.confirmOpen = false;
    this.dust = null;
    this.menuButtons = [];
    this.confirmButtons = [];
    this.selectedIndex = 0;
    this.confirmIndex = 0;

    const w = this.scale.width;
    const h = this.scale.height;
    const cx = w / 2;

    paintTitleBackdrop(this);
    createTitleLogo(this, cx, h * 0.20, 1.55);
    this.dust = createDustField(this, 6);

    const title = hudText(this, cx, h * 0.38, 'NEO DRIFT', 42, '#7de8ff').setOrigin(0.5).setDepth(20);
    title.setAlpha(0);
    const tag = hudText(this, cx, h * 0.38 + 36, 'A fábrica não para. Você também não.', 13, '#9fb0d0').setOrigin(0.5).setDepth(20);
    tag.setAlpha(0);

    this.saveExists = hasSave();
    const summary = this.saveExists ? peekSaveSummary() : null;
    const continueSub = this.saveExists
      ? `Nível ${summary?.level ?? 1} · ${summary?.regionLabel ?? 'Ala Central'}`
      : 'nenhum progresso salvo';

    this.newGameBtn = createMenuButton(this, cx, h * 0.58, {
      label: 'NOVO JOGO',
      width: 300,
      height: 52,
      onClick: () => this._onNewGame()
    }).setDepth(20).setAlpha(0);

    this.continueBtn = createMenuButton(this, cx, h * 0.58 + 64, {
      label: 'CONTINUAR',
      subtitle: continueSub,
      width: 300,
      height: 56,
      disabled: !this.saveExists,
      onClick: () => this._onContinue()
    }).setDepth(20).setAlpha(0);

    this.menuButtons = this.saveExists
      ? [this.newGameBtn, this.continueBtn]
      : [this.newGameBtn];
    this.selectedIndex = this.saveExists ? 1 : 0;

    this.hint = hudText(
      this,
      cx,
      h - 28,
      '↑↓ selecionar  ·  Enter / Espaço confirmar  ·  M mudo',
      11,
      '#5a6580'
    ).setOrigin(0.5).setDepth(20).setAlpha(0);

    this._buildConfirm(w, h);

    this.tweens.add({
      targets: [title, tag, this.newGameBtn, this.hint],
      alpha: 1,
      duration: 700,
      delay: this.tweens.stagger(90, { start: 180 }),
      ease: 'Quad.Out',
      onComplete: () => this._highlightMenu(this.selectedIndex)
    });
    this.tweens.add({
      targets: this.continueBtn,
      alpha: this.saveExists ? 1 : 0.55,
      duration: 700,
      delay: 360,
      ease: 'Quad.Out'
    });

    this.cameras.main.fadeIn(500, 4, 5, 10);
    this._tryMusic();
    this.sound.once('unlocked', this._tryMusic, this);

    this._bindKeys();
    this.events.once('shutdown', this.shutdown, this);
  }

  _tryMusic() {
    playMusic(this, 'music_town', 0.28);
  }

  _bindKeys() {
    this.input.keyboard.off('keydown-UP');
    this.input.keyboard.off('keydown-DOWN');
    this.input.keyboard.off('keydown-W');
    this.input.keyboard.off('keydown-S');
    this.input.keyboard.off('keydown-LEFT');
    this.input.keyboard.off('keydown-RIGHT');
    this.input.keyboard.off('keydown-ENTER');
    this.input.keyboard.off('keydown-SPACE');
    this.input.keyboard.off('keydown-ESC');
    this.input.keyboard.off('keydown-M');

    this.input.keyboard.on('keydown-UP', () => this._moveSelection(-1));
    this.input.keyboard.on('keydown-DOWN', () => this._moveSelection(1));
    this.input.keyboard.on('keydown-W', () => this._moveSelection(-1));
    this.input.keyboard.on('keydown-S', () => this._moveSelection(1));
    this.input.keyboard.on('keydown-LEFT', () => {
      if (this.confirmOpen) this._moveSelection(-1);
    });
    this.input.keyboard.on('keydown-RIGHT', () => {
      if (this.confirmOpen) this._moveSelection(1);
    });
    this.input.keyboard.on('keydown-ENTER', () => this._confirmSelection());
    this.input.keyboard.on('keydown-SPACE', () => this._confirmSelection());
    this.input.keyboard.on('keydown-ESC', () => {
      if (this.confirmOpen) this._closeConfirm();
    });
    this.input.keyboard.on('keydown-M', () => {
      const muted = toggleMute(this);
      this.hint.setText(muted ? 'SOM DESLIGADO' : '↑↓ selecionar  ·  Enter / Espaço confirmar  ·  M mudo');
      this.time.delayedCall(1200, () => {
        if (!this.sys.isActive()) return;
        this.hint.setText('↑↓ selecionar  ·  Enter / Espaço confirmar  ·  M mudo');
      });
    });
  }

  _moveSelection(dir) {
    if (this._sceneLeaving) return;
    playSfx(this, 'sfx_menu_open', { volume: 0.2 });
    if (this.confirmOpen) {
      const count = this.confirmButtons.length;
      this.confirmIndex = (this.confirmIndex + dir + count) % count;
      this._highlightConfirm(this.confirmIndex);
      return;
    }
    const count = this.menuButtons.length;
    this.selectedIndex = (this.selectedIndex + dir + count) % count;
    this._highlightMenu(this.selectedIndex);
  }

  _confirmSelection() {
    if (this._sceneLeaving) return;
    if (this.confirmOpen) {
      this.confirmButtons[this.confirmIndex]?.activate();
      return;
    }
    this.menuButtons[this.selectedIndex]?.activate();
  }

  _highlightMenu(index) {
    this.selectedIndex = index;
    this.menuButtons.forEach((btn, i) => btn.setHighlighted(i === index));
  }

  _highlightConfirm(index) {
    this.confirmIndex = index;
    this.confirmButtons.forEach((btn, i) => btn.setHighlighted(i === index));
  }

  _onNewGame() {
    if (this._sceneLeaving) return;
    playSfx(this, 'sfx_menu_open');
    if (this.saveExists) {
      this._openConfirm();
      return;
    }
    this._startNewGame();
  }

  _onContinue() {
    if (this._sceneLeaving || !this.saveExists) return;
    playSfx(this, 'sfx_menu_open');
    const loaded = loadGame();
    fadeToScene(this, regionHubScene(), { loaded });
  }

  _startNewGame() {
    resetGame();
    fadeToScene(this, 'IntroScene');
  }

  _buildConfirm(w, h) {
    const cx = w / 2;
    const cy = h / 2;

    this.confirmDim = this.add.rectangle(0, 0, w, h, 0x000000, 0.72)
      .setOrigin(0, 0)
      .setDepth(50)
      .setVisible(false)
      .setInteractive();

    this.confirmPanel = this.add.graphics().setDepth(51).setVisible(false);
    drawBracketPanel(this.confirmPanel, 520, 210, {
      fill: 0x0a0c18,
      border: 0x2c3156,
      accent: 0xff4a5e,
      fillAlpha: 0.96,
      bracket: 14
    });
    this.confirmPanel.setPosition(cx, cy - 8);

    this.confirmTitle = hudText(this, cx, cy - 72, 'COMEÇAR DO ZERO?', 18, '#ff8a9c')
      .setOrigin(0.5)
      .setDepth(52)
      .setVisible(false);
    this.confirmBody = hudText(
      this,
      cx,
      cy - 28,
      'Isso apaga o progresso salvo neste navegador.\nA história recomeça na Ala Central.',
      13,
      '#c8d0f0',
      { align: 'center', lineSpacing: 6 }
    ).setOrigin(0.5).setDepth(52).setVisible(false);

    this.confirmCancel = createMenuButton(this, cx - 120, cy + 58, {
      label: 'CANCELAR',
      width: 180,
      height: 44,
      onClick: () => this._closeConfirm()
    }).setDepth(52).setVisible(false);

    this.confirmWipe = createMenuButton(this, cx + 120, cy + 58, {
      label: 'APAGAR E COMEÇAR',
      width: 200,
      height: 44,
      danger: true,
      onClick: () => this._startNewGame()
    }).setDepth(52).setVisible(false);

    this.confirmButtons = [this.confirmCancel, this.confirmWipe];
    this.confirmButtons.forEach((btn) => btn.setInputEnabled(false));
    this.confirmDim.disableInteractive();
    this.confirmEls = [
      this.confirmDim,
      this.confirmPanel,
      this.confirmTitle,
      this.confirmBody,
      this.confirmCancel,
      this.confirmWipe
    ];
  }

  _openConfirm() {
    this.confirmOpen = true;
    this.confirmIndex = 0;
    this.confirmEls.forEach((el) => el.setVisible(true));
    this.confirmDim.setInteractive();
    this.confirmButtons.forEach((btn) => btn.setInputEnabled(true));
    this.menuButtons.forEach((btn) => btn.setHighlighted(false));
    this._highlightConfirm(0);
  }

  _closeConfirm() {
    this.confirmOpen = false;
    playSfx(this, 'sfx_menu_close', { volume: 0.25 });
    this.confirmEls.forEach((el) => el.setVisible(false));
    this.confirmDim.disableInteractive();
    this.confirmButtons.forEach((btn) => {
      btn.setHighlighted(false);
      btn.setInputEnabled(false);
    });
    this._highlightMenu(this.selectedIndex);
  }

  update(_time, delta) {
    if (this.dust) this.dust.update(delta);
  }

  shutdown() {
    this.input.keyboard.off('keydown-UP');
    this.input.keyboard.off('keydown-DOWN');
    this.input.keyboard.off('keydown-W');
    this.input.keyboard.off('keydown-S');
    this.input.keyboard.off('keydown-LEFT');
    this.input.keyboard.off('keydown-RIGHT');
    this.input.keyboard.off('keydown-ENTER');
    this.input.keyboard.off('keydown-SPACE');
    this.input.keyboard.off('keydown-ESC');
    this.input.keyboard.off('keydown-M');
    this.sound.off('unlocked', this._tryMusic, this);
    this.events.off('shutdown', this.shutdown, this);
  }
}
