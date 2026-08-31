import Phaser from 'phaser';
import { GameState } from '../state/GameState.js';
import { MELEE_KINDS, RANGED_KINDS, CONSUMABLE_INFO } from '../state/ItemCodex.js';
import { playSfx, toggleMute } from '../audio/AudioManager.js';

const HP_SEGMENTS = 10;
const XP_SEGMENTS = 8;
const SEGMENT_SPACING = 13;
const SEGMENT_EMPTY = 0x232742;
const MENU_ITEM_SLOTS = 6;
const MENU_PAGES = ['EQUIPAMENTO', 'CONSUMÍVEIS', 'ITENS-CHAVE'];
const WEAPON_ICONS = { sword: 'item_sword', pilebunker: 'item_pilebunker' };
const RANGED_ICONS = { pistol: 'item_pistol', smg: 'item_smg', shotgun: 'item_shotgun' };

// Uma frase própria por fase (conta um pedaço do que mudou ali) + a região
// certa pra onde a porta de retorno leva — antes o texto de vitória era
// idêntico em toda fase e sempre mandava voltar "à Ala Central", o que
// ficava errado a partir da Fase 05 (Distrito Neon) e da Fase 09 (Submundo).
const PHASE_OUTCOMES = {
  DungeonScene: { line: 'O Guardião Núcleo não vai mais atacar quem entra na Ala Central.', region: 'à Ala Central' },
  FoundryScene: { line: 'As fornalhas da Ala de Fundição finalmente esfriam.', region: 'à Ala Central' },
  ReactorScene: { line: 'O Titã Voltaico caiu — o Reator para de descarregar pelas paredes.', region: 'à Ala Central' },
  CoreScene: { line: 'As Sentinelas de Defesa do Núcleo de Comando ficam mudas sem o Vigia Central.', region: 'à Ala Central' },
  TowerScene: { line: 'A Torre de Segurança para de vigiar o Distrito Neon.', region: 'ao Distrito Neon' },
  ArsenalScene: { line: 'O Arsenal Blindado perde seu tanque de guarda — e o canhão que ele carregava.', region: 'ao Distrito Neon' },
  NexusScene: { line: 'Os portais do Nexo de Transporte param de ciclar sozinhos.', region: 'ao Distrito Neon' },
  VigilanceScene: { line: 'A rede de vigilância do Distrito Neon fica cega por um tempo — mas alguém lá em cima ainda não respondeu por isso.', region: 'ao Distrito Neon' },
  FantasmaScene: { line: 'O Trem Fantasma para de cruzar a Estação — os trilhos finalmente ficam quietos.', region: 'ao Submundo' }
};

export default class UIScene extends Phaser.Scene {
  constructor() {
    super('UIScene');
  }

  // Texto do HUD com contorno escuro embutido — sem isso, cores claras
  // (necessárias pro texto ler bem sobre o painel escuro) somem quando o
  // fundo por trás é claro (piso iluminado, flash de dano, etc.), já que o
  // painel de stats é semi-transparente. O contorno garante leitura
  // independente do que está atrás.
  _hudText(x, y, text, size, color, extra = {}) {
    return this.add.text(x, y, text, {
      fontFamily: 'Courier New',
      fontSize: `${size}px`,
      color,
      stroke: '#05060c',
      strokeThickness: size >= 16 ? 4 : size >= 12 ? 3 : 2,
      ...extra
    });
  }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;

    // Vinheta: escurece os cantos por cima do mundo, atrás do HUD — clima
    // atmosférico, não interativo.
    this.add.image(0, 0, 'vignette').setOrigin(0, 0).setDepth(50);

    this.statPanel = this.add.image(8, 8, 'hud_panel_stats').setOrigin(0, 0).setDepth(99).setAlpha(0.55);

    this.labelText = this._hudText(20, 12, '', 14, '#7de8ff').setDepth(100);

    this.zoneToast = this._hudText(w / 2, 70, '', 16, '#7de8ff', { align: 'center' }).setOrigin(0.5).setDepth(150).setAlpha(0);

    this._hudText(20, 34, 'HP', 11, '#c8d0f0').setDepth(100);
    this.hpSegments = Array.from({ length: HP_SEGMENTS }, (_, i) =>
      this.add.image(48 + i * SEGMENT_SPACING, 39, 'hud_segment').setOrigin(0, 0.5).setDepth(100).setTint(SEGMENT_EMPTY)
    );

    this.levelText = this._hudText(20, 50, 'NÍVEL 1', 12, '#ffe066').setDepth(100);
    this.xpSegments = Array.from({ length: XP_SEGMENTS }, (_, i) =>
      this.add.image(20 + i * SEGMENT_SPACING, 72, 'hud_segment').setOrigin(0, 0.5).setDepth(100).setScale(0.85).setTint(SEGMENT_EMPTY)
    );

    // Arma e munição em linhas separadas — juntas numa linha só, nomes de
    // arma mais compridos (ex.: "Monolâmina de Monofilamento") vazavam pra
    // fora do painel.
    this.weaponText = this._hudText(20, 88, 'Arma: —', 11, '#e8ecff', { wordWrap: { width: 232 } }).setDepth(100);
    this.ammoText = this._hudText(20, 104, '', 11, '#c8d0f0').setDepth(100);

    // Cargas de consumível sempre visíveis aqui (não só na página do menu)
    // — o jogador usa Q/E no meio do combate, precisa saber quanto tem sem parar.
    this.consumablesText = this._hudText(20, 120, '', 11, '#9fffe8').setDepth(100);

    this.enemyText = this._hudText(20, 138, '', 13, '#ff8a9c').setDepth(100);

    this.hintText = this._hudText(w - 16, 12, 'Setas/WASD: mover · Espaço: atacar/falar · F: atirar · Q: estimulante · E: granada EMP · ESC: status · P: pausar · M: mudo', 11, '#9fb0d0')
      .setOrigin(1, 0).setDepth(100);

    // Caixa de diálogo
    this.dialogueBg = this.add.image(w / 2, h - 62, 'hud_panel_dialogue').setDepth(150).setAlpha(0.85).setVisible(false);
    this.dialogueText = this._hudText(w / 2, h - 62, '', 13, '#e8ecff', { align: 'center', wordWrap: { width: w - 100 } })
      .setOrigin(0.5).setDepth(151).setVisible(false);
    this.dialogueTimer = null;

    // Toast (level up / item)
    this.toastText = this._hudText(w / 2, 110, '', 14, '#9fffe8', { align: 'center' }).setOrigin(0.5).setDepth(150).setAlpha(0);

    // Overlay de vitória/derrota
    this.overlay = this.add.rectangle(0, 0, w, h, 0x000000, 0.75).setOrigin(0, 0).setVisible(false).setDepth(200);
    this.overlayText = this._hudText(w / 2, h / 2 - 10, '', 30, '#ffffff', { align: 'center' }).setOrigin(0.5).setVisible(false).setDepth(201);
    this.overlaySubtextBaseY = h / 2 + 34;
    this.overlaySubtext = this._hudText(w / 2, this.overlaySubtextBaseY, '', 13, '#c8d0f0', {
      align: 'center', wordWrap: { width: w * 0.72 }, lineSpacing: 6
    }).setOrigin(0.5).setVisible(false).setDepth(201);

    this._buildMenu(w, h);
    this._buildPause(w, h);
    this.menuOpen = false;
    this.menuPage = 0;
    this.pauseOpen = false;
    this.activeSceneKey = null;

    // UIScene é relançada (não recriada) a cada troca de fase — o
    // KeyboardPlugin persiste entre chamadas de create(), então sem isso os
    // listeners se acumulariam a cada transição e cada tecla dispararia o
    // handler múltiplas vezes. `.off(evento)` limpa qualquer registro
    // anterior antes de registrar de novo.
    this.input.keyboard.off('keydown-ESC');
    this.input.keyboard.off('keydown-P');
    this.input.keyboard.off('keydown-M');
    this.input.keyboard.off('keydown-LEFT');
    this.input.keyboard.off('keydown-RIGHT');

    // Debounce curto: o KeyboardPlugin do Phaser pode disparar o mesmo
    // keydown duas vezes em sequência rápida (observado depois de segurar
    // uma tecla de movimento e soltar logo antes de ESC/P) — sem isso, a
    // segunda chamada via a mesma tecla lê o estado já alterado pela
    // primeira e abre o painel errado. 150ms é imperceptível pra um toggle
    // de menu, mas maior que qualquer disparo duplicado do engine.
    let lastEscAt = -9999;
    let lastPAt = -9999;
    let lastMAt = -9999;
    let lastLeftAt = -9999;
    let lastRightAt = -9999;

    // ESC e P nunca ficam abertos ao mesmo tempo: se um já está aberto, a
    // outra tecla fecha ele em vez de abrir os dois por cima (evitaria
    // pause/resume desencontrado na cena de jogo).
    this.input.keyboard.on('keydown-ESC', () => {
      const now = this.time.now;
      if (now - lastEscAt < 150) return;
      lastEscAt = now;
      if (this.pauseOpen) this._closePause();
      else this._toggleMenu();
    });
    this.input.keyboard.on('keydown-P', () => {
      const now = this.time.now;
      if (now - lastPAt < 150) return;
      lastPAt = now;
      if (this.menuOpen) this._closeMenu();
      else this._togglePause();
    });
    this.input.keyboard.on('keydown-M', () => {
      const now = this.time.now;
      if (now - lastMAt < 150) return;
      lastMAt = now;
      const muted = toggleMute(this);
      showToast(muted ? 'SOM DESLIGADO' : 'SOM LIGADO', '#9fb0d0');
    });
    // Navegação de página só faz sentido com o menu de status aberto — a
    // cena de jogo fica pausada nesse estado, então não conflita com nenhum
    // uso de seta/movimento.
    this.input.keyboard.on('keydown-LEFT', () => {
      if (!this.menuOpen) return;
      const now = this.time.now;
      if (now - lastLeftAt < 150) return;
      lastLeftAt = now;
      this._setMenuPage(this.menuPage - 1);
      playSfx(this, 'sfx_menu_open', { volume: 0.25 });
    });
    this.input.keyboard.on('keydown-RIGHT', () => {
      if (!this.menuOpen) return;
      const now = this.time.now;
      if (now - lastRightAt < 150) return;
      lastRightAt = now;
      this._setMenuPage(this.menuPage + 1);
      playSfx(this, 'sfx_menu_open', { volume: 0.25 });
    });

    const onHudInit = ({ label, showEnemies, sceneKey }) => {
      if (this.menuOpen) this._closeMenu();
      if (this.pauseOpen) this._closePause();
      this.activeSceneKey = sceneKey || this.activeSceneKey;
      this.labelText.setText(label);
      this.enemyText.setVisible(!!showEnemies);
      this.tweens.killTweensOf([this.overlay, this.overlayText, this.overlaySubtext]);
      this.overlay.setVisible(false);
      this.overlayText.setVisible(false);
      this.overlaySubtext.setVisible(false);
      this.tweens.killTweensOf(this.zoneToast);
      this.zoneToast.setAlpha(0);
    };

    const onStats = ({ hp, maxHp, level, xp, xpToNext, weapon, hasPistol, pistolAmmo }) => {
      const hpRatio = Phaser.Math.Clamp(hp / maxHp, 0, 1);
      const hpColor = hpRatio > 0.35 ? 0x37f0ff : 0xff4a5e;
      const hpFilled = Math.round(hpRatio * HP_SEGMENTS);
      this.hpSegments.forEach((seg, i) => seg.setTint(i < hpFilled ? hpColor : SEGMENT_EMPTY));

      this.levelText.setText(`NÍVEL ${level}`);
      const xpRatio = Phaser.Math.Clamp(xp / xpToNext, 0, 1);
      const xpFilled = Math.round(xpRatio * XP_SEGMENTS);
      this.xpSegments.forEach((seg, i) => seg.setTint(i < xpFilled ? 0xffe066 : SEGMENT_EMPTY));

      this.weaponText.setText(`Arma: ${weapon}`);
      this.ammoText.setText(hasPistol ? `Munição: ${pistolAmmo}` : '');

      // Lido direto do GameState (não vem no payload do evento) — cargas
      // mudam com uso de Q/E em jogo, o jogador precisa ver sem abrir o menu.
      this.consumablesText.setText(`Estimulante: ${GameState.stimCharges} · EMP: ${GameState.empCharges}`);
    };

    const onEnemies = (count) => {
      this.enemyText.setText(`INIMIGOS: ${count}`);
    };

    const onDialogue = (text) => {
      playSfx(this, 'sfx_dialogue');
      this.dialogueBg.setVisible(true);
      this.dialogueText.setVisible(true).setText(text);
      if (this.dialogueTimer) this.dialogueTimer.remove();
      this.dialogueTimer = this.time.delayedCall(3200, () => {
        this.dialogueBg.setVisible(false);
        this.dialogueText.setVisible(false);
      });
    };

    const showToast = (text, color) => {
      this.toastText.setText(text).setColor(color).setAlpha(1);
      this.tweens.killTweensOf(this.toastText);
      this.tweens.add({ targets: this.toastText, alpha: 0, duration: 2200, delay: 900 });
    };
    const onLevelUp = (level) => {
      playSfx(this, 'sfx_level_up', { volume: 0.6 });
      showToast(`NÍVEL ${level} ALCANÇADO!`, '#ffe066');
    };
    const onItemPickup = (text) => showToast(text, '#9fffe8');

    const onZoneChanged = (name) => {
      this.zoneToast.setText(name.toUpperCase()).setAlpha(1);
      this.tweens.killTweensOf(this.zoneToast);
      this.tweens.add({ targets: this.zoneToast, alpha: 0, duration: 1600, delay: 1100 });
    };

    const onComplete = () => {
      playSfx(this, 'sfx_victory', { volume: 0.55 });
      const outcome = PHASE_OUTCOMES[this.activeSceneKey] || { line: 'A área está segura.', region: 'à Ala Central' };
      this._showOverlay('FASE COMPLETA', `${outcome.line}\nEncontre a porta para retornar ${outcome.region}.`, '#18e8ff');
      // O retorno agora é pelo jogador (porta na sala do confronto final) —
      // a tela cheia escurecida só fica um instante, pra não atrapalhar achar
      // a porta.
      this.time.delayedCall(2400, () => this._hideOverlay());
    };
    const onGameOver = () => {
      playSfx(this, 'sfx_game_over', { volume: 0.55 });
      this._showOverlay('UNIDADE DESTRUÍDA', 'Pressione F5 para continuar do último progresso salvo.', '#ff4a5e');
    };

    this.game.events.on('hud-init', onHudInit);
    this.game.events.on('player-stats', onStats);
    this.game.events.on('enemies-remaining', onEnemies);
    this.game.events.on('dialogue', onDialogue);
    this.game.events.on('level-up', onLevelUp);
    this.game.events.on('item-pickup', onItemPickup);
    this.game.events.on('zone-changed', onZoneChanged);
    this.game.events.on('level-complete', onComplete);
    this.game.events.on('game-over', onGameOver);

    this.events.once('shutdown', () => {
      this.game.events.off('hud-init', onHudInit);
      this.game.events.off('player-stats', onStats);
      this.game.events.off('enemies-remaining', onEnemies);
      this.game.events.off('dialogue', onDialogue);
      this.game.events.off('level-up', onLevelUp);
      this.game.events.off('item-pickup', onItemPickup);
      this.game.events.off('zone-changed', onZoneChanged);
      this.game.events.off('level-complete', onComplete);
      this.game.events.off('game-over', onGameOver);
    });
  }

  // Entrada animada (fade do fundo, título "pop" com bounce, subtítulo
  // deslizando de baixo com atraso) em vez de tudo aparecer instantâneo —
  // usada tanto pra vitória quanto pra derrota.
  _showOverlay(title, subtitle, colorCss) {
    this.tweens.killTweensOf([this.overlay, this.overlayText, this.overlaySubtext]);

    this.overlay.setAlpha(0).setVisible(true);
    this.tweens.add({ targets: this.overlay, alpha: 0.75, duration: 320, ease: 'Cubic.Out' });

    this.overlayText.setText(title).setColor(colorCss).setVisible(true).setAlpha(0).setScale(0.55);
    this.tweens.add({ targets: this.overlayText, alpha: 1, scale: 1, duration: 480, ease: 'Back.Out' });

    this.overlaySubtext.setText(subtitle).setVisible(true).setAlpha(0).setY(this.overlaySubtextBaseY + 14);
    this.tweens.add({
      targets: this.overlaySubtext, alpha: 1, y: this.overlaySubtextBaseY,
      duration: 380, delay: 200, ease: 'Cubic.Out'
    });
  }

  // Saída animada (fade dos 3 elementos juntos) em vez de sumir seco.
  _hideOverlay() {
    this.tweens.killTweensOf([this.overlay, this.overlayText, this.overlaySubtext]);
    this.tweens.add({
      targets: [this.overlay, this.overlayText, this.overlaySubtext],
      alpha: 0,
      duration: 260,
      ease: 'Cubic.In',
      onComplete: () => {
        this.overlay.setVisible(false);
        this.overlayText.setVisible(false);
        this.overlaySubtext.setVisible(false);
      }
    });
  }

  // Tela de status/inventário — ESC pausa a cena de jogo ativa e mostra o
  // menu em páginas (◄/► pra trocar): Equipamento, Consumíveis, Itens-chave.
  // Cada peça de equipamento/consumível mostra não só o nome/número, mas
  // uma descrição curta do que ela FAZ — antes só dava pra saber pelo dano.
  _buildMenu(w, h) {
    const cx = w / 2;
    const cy = h / 2;
    // Painel mais largo (600px) — na versão de 440px a descrição sempre
    // quebrava em 2-3 linhas e o rodapé literalmente não cabia (texto mais
    // longo que o próprio painel). Mais largura = menos quebra de linha =
    // menos altura por linha = espaçamento vertical lê melhor também.
    const top = cy - 270;
    const left = cx - 260;

    this.menuDim = this.add.rectangle(0, 0, w, h, 0x000000, 0.6).setOrigin(0, 0).setDepth(300).setVisible(false);
    this.menuPanel = this.add.image(cx, cy, 'hud_panel_menu').setDepth(301).setVisible(false);

    this.menuTitle = this._hudText(cx, top + 24, 'STATUS DO OPERADOR', 18, '#7de8ff').setOrigin(0.5).setDepth(302).setVisible(false);

    this.menuLevelText = this._hudText(left, top + 58, '', 15, '#ffe066').setDepth(302).setVisible(false);
    this.menuXpText = this._hudText(left, top + 82, '', 15, '#e8ecff').setDepth(302).setVisible(false);
    this.menuHpText = this._hudText(left, top + 106, '', 15, '#37f0ff').setDepth(302).setVisible(false);

    this.menuPageLabel = this._hudText(cx, top + 136, '', 16, '#9fffe8').setOrigin(0.5).setDepth(302).setVisible(false);

    this.menuFooter = this._hudText(cx, cy + 268, '◄ ► trocar página · ESC fechar · progresso salvo automaticamente', 12, '#9fb0d0').setOrigin(0.5).setDepth(302).setVisible(false);

    this.menuCommonElements = [
      this.menuDim, this.menuPanel, this.menuTitle,
      this.menuLevelText, this.menuXpText, this.menuHpText,
      this.menuPageLabel, this.menuFooter
    ];

    // ---------- página 0: equipamento (arma corpo-a-corpo, à distância, armadura) ----------
    const ROW_H = 92;
    const pageTop = top + 190;
    const weaponY = pageTop;
    const rangedY = weaponY + ROW_H;
    const armorY = rangedY + ROW_H;
    const bootsY = armorY + ROW_H;
    const DESC_WRAP = 480;

    const buildEquipRow = (y, iconKey) => ({
      icon: this.add.image(left + 8, y, iconKey).setOrigin(0.5).setDepth(302).setScale(1.4).setVisible(false),
      name: this._hudText(left + 30, y - 24, '', 15, '#e8ecff').setOrigin(0, 0.5).setDepth(302).setVisible(false),
      stat: this._hudText(left + 30, y - 4, '', 13, '#c8d0f0').setOrigin(0, 0.5).setDepth(302).setVisible(false),
      desc: this._hudText(left + 30, y + 10, '', 12, '#9fb0d0', { wordWrap: { width: DESC_WRAP }, lineSpacing: 4 }).setOrigin(0, 0).setDepth(302).setVisible(false)
    });

    this.menuWeaponRow = buildEquipRow(weaponY, 'item_sword');
    this.menuRangedRow = buildEquipRow(rangedY, 'item_pistol');
    this.menuArmorRow = buildEquipRow(armorY, 'item_armor');
    this.menuBootsRow = buildEquipRow(bootsY, 'item_boots');

    this.menuPage0Elements = [this.menuWeaponRow, this.menuRangedRow, this.menuArmorRow, this.menuBootsRow]
      .flatMap((r) => [r.icon, r.name, r.stat, r.desc]);

    // ---------- página 1: consumíveis (uso tático — tecla Q/E em jogo) ----------
    const consTop = top + 190;
    const consRowH = 140;

    const buildConsumableRow = (y, iconKey) => ({
      icon: this.add.image(left + 8, y, iconKey).setOrigin(0.5).setDepth(302).setScale(1.6).setVisible(false),
      name: this._hudText(left + 34, y - 26, '', 16, '#e8ecff').setOrigin(0, 0.5).setDepth(302).setVisible(false),
      stat: this._hudText(left + 34, y - 2, '', 14, '#9fffe8').setOrigin(0, 0.5).setDepth(302).setVisible(false),
      desc: this._hudText(left + 34, y + 14, '', 13, '#9fb0d0', { wordWrap: { width: DESC_WRAP - 10 }, lineSpacing: 4 }).setOrigin(0, 0).setDepth(302).setVisible(false)
    });

    this.menuStimRow = buildConsumableRow(consTop, 'item_stim');
    this.menuEmpRow = buildConsumableRow(consTop + consRowH, 'item_emp');

    this.menuPage1Elements = [this.menuStimRow, this.menuEmpRow].flatMap((r) => [r.icon, r.name, r.stat, r.desc]);

    // ---------- página 2: itens-chave (cartões etc.) ----------
    const itemsStartY = top + 190;
    const itemsRowH = 34;
    this.menuItemSlots = Array.from({ length: MENU_ITEM_SLOTS }, (_, i) => ({
      icon: this.add.image(left + 8, itemsStartY + i * itemsRowH, 'item_keycard').setOrigin(0.5).setDepth(302).setScale(1.3).setVisible(false),
      text: this._hudText(left + 30, itemsStartY + i * itemsRowH, '', 15, '#e8ecff').setOrigin(0, 0.5).setDepth(302).setVisible(false)
    }));
    this.menuEmptyText = this._hudText(left, itemsStartY, 'Nenhum item coletado.', 13, '#9fb0d0').setDepth(302).setVisible(false);

    this.menuPage2Elements = [this.menuEmptyText, ...this.menuItemSlots.flatMap((s) => [s.icon, s.text])];

    this.menuPagesElements = [this.menuPage0Elements, this.menuPage1Elements, this.menuPage2Elements];
    this.menuElements = [...this.menuCommonElements, ...this.menuPage0Elements, ...this.menuPage1Elements, ...this.menuPage2Elements];
  }

  _toggleMenu() {
    if (this.menuOpen) this._closeMenu();
    else this._openMenu();
  }

  _openMenu() {
    this.menuOpen = true;
    playSfx(this, 'sfx_menu_open');
    this.menuCommonElements.forEach((el) => el.setVisible(true));
    this._setMenuPage(0);
    if (this.activeSceneKey && this.scene.isActive(this.activeSceneKey)) {
      this.scene.pause(this.activeSceneKey);
    }
  }

  _closeMenu() {
    this.menuOpen = false;
    playSfx(this, 'sfx_menu_close');
    this.menuElements.forEach((el) => el.setVisible(false));
    if (this.activeSceneKey && this.scene.isPaused(this.activeSceneKey)) {
      this.scene.resume(this.activeSceneKey);
    }
  }

  // Troca a página ativa (com wrap-around) e reaplica visibilidade — a base
  // "visível" vem daqui, _refreshMenuContent() ajusta por cima os elementos
  // condicionais (ícone de armadura sem armadura, slots de item vazios).
  _setMenuPage(page) {
    const count = this.menuPagesElements.length;
    this.menuPage = ((page % count) + count) % count;
    this.menuPagesElements.forEach((els, i) => els.forEach((el) => el.setVisible(i === this.menuPage)));
    this.menuPageLabel.setText(`◄ ${MENU_PAGES[this.menuPage]} ►`);
    this._refreshMenuContent();
  }

  // Pause dedicado (tecla P) — mais leve que o menu de status: só escurece
  // a tela e mostra "PAUSADO", sem abrir o inventário. Mesma mecânica de
  // pause/resume da cena de jogo ativa que o menu de status usa.
  _buildPause(w, h) {
    const cx = w / 2;
    const cy = h / 2;

    this.pauseDim = this.add.rectangle(0, 0, w, h, 0x000000, 0.65).setOrigin(0, 0).setDepth(300).setVisible(false);
    this.pauseTitle = this._hudText(cx, cy - 20, 'PAUSADO', 28, '#7de8ff').setOrigin(0.5).setDepth(301).setVisible(false);
    this.pauseHint = this._hudText(cx, cy + 24, 'Pressione P para continuar · ESC para ver status', 12, '#c8d0f0').setOrigin(0.5).setDepth(301).setVisible(false);

    this.pauseElements = [this.pauseDim, this.pauseTitle, this.pauseHint];
  }

  _togglePause() {
    if (this.pauseOpen) this._closePause();
    else this._openPause();
  }

  _openPause() {
    this.pauseOpen = true;
    playSfx(this, 'sfx_menu_open');
    this.pauseElements.forEach((el) => el.setVisible(true));
    if (this.activeSceneKey && this.scene.isActive(this.activeSceneKey)) {
      this.scene.pause(this.activeSceneKey);
    }
  }

  _closePause() {
    this.pauseOpen = false;
    playSfx(this, 'sfx_menu_close');
    this.pauseElements.forEach((el) => el.setVisible(false));
    if (this.activeSceneKey && this.scene.isPaused(this.activeSceneKey)) {
      this.scene.resume(this.activeSceneKey);
    }
  }

  _refreshMenuContent() {
    this.menuLevelText.setText(`Nível: ${GameState.level}`);
    this.menuXpText.setText(`XP: ${GameState.xp} / ${GameState.xpToNext}`);
    this.menuHpText.setText(`HP: ${GameState.hp} / ${GameState.maxHp}`);

    const onPage0 = this.menuPage === 0;
    const onPage2 = this.menuPage === 2;

    // ---------- página 0: equipamento ----------
    const meleeKind = MELEE_KINDS[GameState.weaponKind] || MELEE_KINDS.sword;
    this.menuWeaponRow.icon.setTexture(WEAPON_ICONS[GameState.weaponKind] || 'item_sword');
    this.menuWeaponRow.name.setText(`Arma: ${GameState.weaponName}`);
    this.menuWeaponRow.stat.setText(`${meleeKind.label} · Dano: ${GameState.attackDamage}`);
    this.menuWeaponRow.desc.setText(meleeKind.desc);

    if (GameState.hasPistol) {
      const rangedKind = RANGED_KINDS[GameState.rangedKind] || RANGED_KINDS.pistol;
      this.menuRangedRow.icon.setTexture(RANGED_ICONS[GameState.rangedKind] || 'item_pistol').setVisible(onPage0);
      this.menuRangedRow.name.setText(`À distância: ${GameState.pistolName}`);
      this.menuRangedRow.stat.setText(`${rangedKind.label} · Dano: ${GameState.pistolDamage} · Munição: ${GameState.pistolAmmo}`);
      this.menuRangedRow.desc.setText(rangedKind.desc);
    } else {
      this.menuRangedRow.icon.setVisible(false);
      this.menuRangedRow.name.setText('À distância: não encontrada');
      this.menuRangedRow.stat.setText('Encontre uma na fase');
      this.menuRangedRow.desc.setText('');
    }

    const hasArmor = !!GameState.armorName;
    this.menuArmorRow.name.setText(hasArmor ? `Armadura: ${GameState.armorName}` : 'Armadura: nenhuma');
    this.menuArmorRow.stat.setText(hasArmor
      ? `+${GameState.armorBonus} HP máx. (total ${GameState.maxHp})${GameState.insulated ? ' · imune a choque' : ''}`
      : 'Sem bônus de HP');
    this.menuArmorRow.desc.setText(hasArmor ? 'Bônus passivo — não precisa ser trocado ou usado.' : '');
    this.menuArmorRow.icon.setVisible(hasArmor && onPage0);

    const hasBoots = !!GameState.bootsName;
    const bootsPct = Math.round((GameState.speedMul - 1) * 100);
    this.menuBootsRow.name.setText(hasBoots ? `Calçado: ${GameState.bootsName}` : 'Calçado: nenhum');
    this.menuBootsRow.stat.setText(hasBoots ? `+${bootsPct}% velocidade de deslocamento` : 'Sem bônus de velocidade');
    this.menuBootsRow.desc.setText(hasBoots ? 'Bônus passivo — não precisa ser trocado ou usado.' : '');
    this.menuBootsRow.icon.setVisible(hasBoots && onPage0);

    // ---------- página 1: consumíveis ----------
    this.menuStimRow.name.setText(`Estimulante (tecla ${CONSUMABLE_INFO.stim.key})`);
    this.menuStimRow.stat.setText(`Cargas: ${GameState.stimCharges}`);
    this.menuStimRow.desc.setText(CONSUMABLE_INFO.stim.desc);

    this.menuEmpRow.name.setText(`Granada EMP (tecla ${CONSUMABLE_INFO.emp.key})`);
    this.menuEmpRow.stat.setText(`Cargas: ${GameState.empCharges}`);
    this.menuEmpRow.desc.setText(CONSUMABLE_INFO.emp.desc);

    // ---------- página 2: itens-chave ----------
    const items = GameState.inventory;
    this.menuEmptyText.setVisible(items.length === 0 && onPage2);
    this.menuItemSlots.forEach((slot, i) => {
      const item = items[i];
      const show = !!item && onPage2;
      slot.icon.setVisible(show);
      slot.text.setVisible(show);
      if (item) {
        slot.icon.setTexture(item.icon);
        slot.text.setText(item.name);
      }
    });
  }
}
