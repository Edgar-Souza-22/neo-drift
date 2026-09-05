import Phaser from 'phaser';
import TileMap from '../world/TileMap.js';
import { buildMatrizHub } from '../world/MatrizLayout.js';
import Player from '../entities/Player.js';
import NPC from '../entities/NPC.js';
import { DIRECTIONS } from '../utils/constants.js';
import { GameState } from '../state/GameState.js';
import { ATRIO_CAPTIVES } from '../state/AtrioCaptives.js';
import { initHud } from '../utils/hud.js';
import { playMusic, playSfx } from '../audio/AudioManager.js';

const ACCENT = 0xc9a24a;

const PLAZA_PROPS = [
  { gx: 20, gy: 10, texture: 'prop_pedestal', tint: ACCENT },
  { gx: 10, gy: 13, texture: 'prop_lantern', tint: 0xffe9b8 },
  { gx: 31, gy: 13, texture: 'prop_lantern', tint: 0xffe9b8 },
  { gx: 6, gy: 16, texture: 'prop_kiosk', tint: ACCENT },
  { gx: 35, gy: 16, texture: 'prop_kiosk', tint: ACCENT }
];

// Entradas ainda seladas da torre (Fases 19-20) — visíveis desde o começo,
// pra a Praça já mostrar o tamanho do que falta, mas sem interação.
const SEALED_DOORS = [
  { markerKey: 'E3', label: 'COFRE DE DADOS' },
  { markerKey: 'E4', label: 'SALA DO CONSELHO' }
];

export default class MatrizScene extends Phaser.Scene {
  constructor() {
    super('MatrizScene');
  }

  create(data) {
    this._justLoaded = !!(data && data.loaded);
    const { grid, markers } = buildMatrizHub();
    this.tileMap = new TileMap(this, grid, {
      wallTexture: 'wall_matriz',
      floorTexture: 'floor_matriz',
      floorVariants: [
        { key: 'floor_matriz', weight: 0.88 },
        { key: 'floor_matriz_inlay', weight: 0.12 }
      ],
      markers
    });

    for (const prop of PLAZA_PROPS) {
      const world = this.tileMap.gridToWorld(prop.gx, prop.gy);
      const tex = this.textures.exists(prop.texture) ? prop.texture : 'prop_crate';
      const sprite = this.add.image(world.x, world.y, tex).setOrigin(0.5, 0.85).setDepth(prop.gy * 10 + 2);
      if (prop.tint) sprite.setTint(prop.tint);
    }

    const spawn = this.tileMap.marker('S');
    this.player = new Player(this, this.tileMap, spawn);

    const npcSpawns = this.tileMap.allMarkers('N');
    this.npcs = [
      new NPC(this, this.tileMap, npcSpawns[0].gx, npcSpawns[0].gy, {
        id: 'recepcionista_matriz',
        name: 'Recepcionista Dispensada',
        texture: 'npc_vendor',
        tint: ACCENT,
        lines: GameState.atrioCleared
          ? [
            'A Diretora de Segurança caiu. Os guardas do átrio pararam de responder ao rádio no meio da frase.',
            'Ninguém mais me impede de ficar aqui na praça. Mas os andares de cima continuam ligados.'
          ]
          : [
            'Trabalhei quatorze anos naquela recepção. Fui "reestruturada" no dia em que perguntei o que sobe pelo elevador executivo.',
            'O átrio é todo de vidro. Você vai enxergar o fim do caminho desde a primeira sala — e vai levar muito tempo pra chegar lá.'
          ]
      }),
      new NPC(this, this.tileMap, npcSpawns[1].gx, npcSpawns[1].gy, {
        id: 'segurança_desertor',
        name: 'Segurança Desertor',
        texture: 'npc_guard',
        tint: 0x8fb4ff,
        lines: [
          'Eu carregava um daqueles escudos. Aguenta tiro, aguenta lâmina, aguenta o que você jogar — na frente.',
          'Nunca nos ensinaram a girar rápido. Era o único defeito, e a gente rezava pra ninguém perceber.'
        ]
      })
    ];

    const arrivalSpots = this.tileMap.allMarkers('N2');
    ATRIO_CAPTIVES.forEach((captive, i) => {
      if (!GameState.rescuedNpcs.has(captive.id)) return;
      const spot = arrivalSpots[i];
      if (!spot) return;
      this.npcs.push(new NPC(this, this.tileMap, spot.gx, spot.gy, {
        id: captive.id,
        name: captive.name,
        texture: 'npc_worker',
        tint: i === 1 ? 0xffe9b8 : ACCENT,
        lines: captive.townLines
      }));
    });

    // Monotrilho de volta ao Estaleiro — plataforma, não portal nem poço:
    // a Região 5 se liga à 4 na horizontal, não pra cima nem pra baixo.
    this.railPos = this.tileMap.marker('L');
    const railWorld = this.tileMap.gridToWorld(this.railPos.gx, this.railPos.gy);
    this.add.image(railWorld.x, railWorld.y, 'light_pool').setDepth(-999).setScale(1.1)
      .setBlendMode(Phaser.BlendModes.ADD).setTint(0x8fb4ff);
    this.railSprite = this.add.image(railWorld.x, railWorld.y, 'prop_monorail').setDepth(9000);
    this.tweens.add({ targets: this.railSprite, x: railWorld.x + 3, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.add.text(railWorld.x, railWorld.y - 26, 'ESTALEIRO ←', {
      fontFamily: 'Courier New', fontSize: '9px', color: '#8fb4ff'
    }).setOrigin(0.5).setDepth(9001);

    // Entrada do Átrio Executivo — sempre aberta (é a primeira fase daqui).
    this.atrioDoorPos = this.tileMap.marker('E');
    const atrioWorld = this.tileMap.gridToWorld(this.atrioDoorPos.gx, this.atrioDoorPos.gy);
    this.add.image(atrioWorld.x, atrioWorld.y, 'light_pool').setDepth(-999)
      .setBlendMode(Phaser.BlendModes.ADD).setTint(ACCENT);
    this.atrioDoorSprite = this.add.image(atrioWorld.x, atrioWorld.y, 'door_matriz').setDepth(9000);
    this.tweens.add({ targets: this.atrioDoorSprite, alpha: 0.45, duration: 650, yoyo: true, repeat: -1 });
    this.add.text(atrioWorld.x, atrioWorld.y - 22, 'ÁTRIO EXECUTIVO ↑', {
      fontFamily: 'Courier New', fontSize: '9px', color: '#c9a24a'
    }).setOrigin(0.5).setDepth(9001);

    // Entrada do Departamento de P&D — só transiciona depois d'A Diretora
    // de Segurança cair (senão fica visível mas selada, sem interação).
    this.pesquisaDoorPos = this.tileMap.marker('E2');
    const pesquisaWorld = this.tileMap.gridToWorld(this.pesquisaDoorPos.gx, this.pesquisaDoorPos.gy);
    if (GameState.atrioCleared) {
      this.add.image(pesquisaWorld.x, pesquisaWorld.y, 'light_pool').setDepth(-999)
        .setBlendMode(Phaser.BlendModes.ADD).setTint(0xb37aff);
      this.pesquisaDoorSprite = this.add.image(pesquisaWorld.x, pesquisaWorld.y, 'door_matriz').setDepth(9000).setTint(0xb37aff);
      this.tweens.add({ targets: this.pesquisaDoorSprite, alpha: 0.45, duration: 650, yoyo: true, repeat: -1 });
      this.add.text(pesquisaWorld.x, pesquisaWorld.y - 22, 'DEPARTAMENTO DE P&D ↑', {
        fontFamily: 'Courier New', fontSize: '9px', color: '#c9a8ff'
      }).setOrigin(0.5).setDepth(9001);
    } else {
      this.add.image(pesquisaWorld.x, pesquisaWorld.y, 'door_matriz').setDepth(9000).setTint(0x333c44).setAlpha(0.6);
      this.add.text(pesquisaWorld.x, pesquisaWorld.y - 22, 'SELADO', {
        fontFamily: 'Courier New', fontSize: '9px', color: '#5a6068'
      }).setOrigin(0.5).setDepth(9001);
    }

    for (const door of SEALED_DOORS) {
      const spot = this.tileMap.marker(door.markerKey);
      const world = this.tileMap.gridToWorld(spot.gx, spot.gy);
      this.add.image(world.x, world.y, 'door_matriz').setDepth(9000).setTint(0x333c44).setAlpha(0.6);
      this.add.text(world.x, world.y - 22, 'SELADO', {
        fontFamily: 'Courier New', fontSize: '9px', color: '#5a6068'
      }).setOrigin(0.5).setDepth(9001);
    }

    this.transitioning = false;

    this._setupCamera();
    this._setupInput();
    this.cameras.main.fadeIn(350, 18, 20, 26);
    playMusic(this, 'music_matriz');

    initHud(this, () => {
      this.game.events.emit('hud-init', { label: 'PRAÇA DA MATRIZ', showEnemies: false, sceneKey: 'MatrizScene' });
      this._emitStats();
      if (this._justLoaded) {
        this.game.events.emit('item-pickup', `Progresso carregado — Nível ${GameState.level}.`);
      }
    });
  }

  _setupCamera() {
    const { width, height } = this.tileMap.worldBounds();
    this.cameras.main.setBounds(0, 0, width, height);
    this.cameras.main.startFollow(this.player.sprite, true, 0.15, 0.15);
    this.cameras.main.setZoom(1.4);
  }

  _setupInput() {
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D,SPACE');
    this.input.keyboard.on('keydown-SPACE', () => this._interact());
  }

  _readMoveVector() {
    const up = this.cursors.up.isDown || this.keys.W.isDown;
    const down = this.cursors.down.isDown || this.keys.S.isDown;
    const left = this.cursors.left.isDown || this.keys.A.isDown;
    const right = this.cursors.right.isDown || this.keys.D.isDown;

    let dx = 0;
    let dy = 0;
    if (up) dy += DIRECTIONS.up.y;
    if (down) dy += DIRECTIONS.down.y;
    if (left) dx += DIRECTIONS.left.x;
    if (right) dx += DIRECTIONS.right.x;

    const len = Math.hypot(dx, dy);
    if (len > 0) { dx /= len; dy /= len; }
    return { dx, dy };
  }

  _nearestNpc() {
    let nearest = null;
    let bestDist = Infinity;
    for (const npc of this.npcs) {
      const dist = Math.hypot(this.player.gx - npc.gx, this.player.gy - npc.gy);
      if (dist < bestDist) { bestDist = dist; nearest = npc; }
    }
    return nearest && nearest.isNear(this.player) ? nearest : null;
  }

  _interact() {
    const npc = this._nearestNpc();
    if (npc) {
      this.game.events.emit('dialogue', npc.currentLine());
    } else {
      this.player.tryAttack([]);
    }
  }

  _emitStats() {
    this.game.events.emit('player-stats', {
      hp: this.player.hp,
      maxHp: this.player.maxHp,
      level: GameState.level,
      xp: GameState.xp,
      xpToNext: GameState.xpToNext,
      weapon: GameState.weaponName,
      hasPistol: GameState.hasPistol,
      pistolAmmo: GameState.pistolAmmo
    });
  }

  update(time, delta) {
    if (this.transitioning) return;
    const deltaSec = Math.min(delta, 50) / 1000;
    const { dx, dy } = this._readMoveVector();
    this.player.move(dx, dy, deltaSec);
    this.player.update();
    this._emitStats();

    const near = this._nearestNpc();
    for (const npc of this.npcs) {
      npc.update();
      npc.setHighlighted(npc === near);
    }

    const railDist = Math.hypot(this.player.gx - this.railPos.gx, this.player.gy - this.railPos.gy);
    if (railDist < 0.5) {
      this._enterMonorail();
      return;
    }

    const doorDist = Math.hypot(this.player.gx - this.atrioDoorPos.gx, this.player.gy - this.atrioDoorPos.gy);
    if (doorDist < 0.6) {
      this._enterAtrio();
      return;
    }

    if (GameState.atrioCleared) {
      const pesquisaDist = Math.hypot(this.player.gx - this.pesquisaDoorPos.gx, this.player.gy - this.pesquisaDoorPos.gy);
      if (pesquisaDist < 0.6) this._enterPesquisa();
    }
  }

  // Partida do monotrilho: arranco lateral (a câmera corre pro lado) + fade
  // claro. Movimento HORIZONTAL — distinto do portal que gira (fábrica →
  // cidade), do buraco que desce (cidade → submundo) e do poço que sobe
  // (submundo → estaleiro).
  _enterMonorail() {
    this.transitioning = true;
    this.player.isMoving = false;
    playSfx(this, 'sfx_door', { volume: 0.4 });

    this.cameras.main.stopFollow();
    this.tweens.add({
      targets: this.cameras.main,
      scrollX: this.cameras.main.scrollX - 260,
      duration: 460,
      ease: 'Cubic.In'
    });
    this.cameras.main.fadeOut(460, 30, 34, 44);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.stop('UIScene');
      this.scene.start('EstaleiroScene');
    });
  }

  _enterPesquisa() {
    this.transitioning = true;
    this.player.isMoving = false;
    playSfx(this, 'sfx_door');

    this.tweens.add({ targets: this.pesquisaDoorSprite, scale: 1.35, duration: 200, yoyo: true, ease: 'Cubic.Out' });
    this.cameras.main.flash(150, 179, 122, 255);
    this.cameras.main.fadeOut(420, 16, 18, 26);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.stop('UIScene');
      this.scene.start('PesquisaScene');
    });
  }

  _enterAtrio() {
    this.transitioning = true;
    this.player.isMoving = false;
    playSfx(this, 'sfx_door');

    this.tweens.add({ targets: this.atrioDoorSprite, scale: 1.35, duration: 200, yoyo: true, ease: 'Cubic.Out' });
    this.cameras.main.flash(150, 201, 162, 74);
    this.cameras.main.fadeOut(420, 18, 20, 26);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.stop('UIScene');
      this.scene.start('AtrioScene');
    });
  }
}
