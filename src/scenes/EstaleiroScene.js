import Phaser from 'phaser';
import TileMap from '../world/TileMap.js';
import { buildEstaleiroHub } from '../world/EstaleiroLayout.js';
import Player from '../entities/Player.js';
import NPC from '../entities/NPC.js';
import { DIRECTIONS } from '../utils/constants.js';
import { GameState } from '../state/GameState.js';
import { TERMINAL_CAPTIVES } from '../state/TerminalCaptives.js';
import { initHud } from '../utils/hud.js';
import { playMusic, playSfx } from '../audio/AudioManager.js';

const CARGO_PROPS = [
  { gx: 12, gy: 12, texture: 'prop_container' },
  { gx: 22, gy: 12, texture: 'prop_container' },
  { gx: 31, gy: 8, texture: 'prop_crate' },
  { gx: 5, gy: 12, texture: 'prop_barrel' }
];

export default class EstaleiroScene extends Phaser.Scene {
  constructor() {
    super('EstaleiroScene');
  }

  create(data) {
    this._justLoaded = !!(data && data.loaded);
    const { grid, markers } = buildEstaleiroHub();
    this.tileMap = new TileMap(this, grid, {
      wallTexture: 'wall_estaleiro',
      floorTexture: 'floor_estaleiro',
      floorVariants: [
        { key: 'floor_estaleiro', weight: 0.82 },
        { key: 'floor_estaleiro_stripe', weight: 0.18 }
      ],
      markers
    });

    for (const prop of CARGO_PROPS) {
      const world = this.tileMap.gridToWorld(prop.gx, prop.gy);
      this.add.image(world.x, world.y, prop.texture).setOrigin(0.5, 0.85).setDepth(prop.gy * 10 + 2);
    }

    const spawn = this.tileMap.marker('S');
    this.player = new Player(this, this.tileMap, spawn);

    const npcSpawns = this.tileMap.allMarkers('N');
    this.npcs = [
      new NPC(this, this.tileMap, npcSpawns[0].gx, npcSpawns[0].gy, {
        id: 'contramestra',
        name: 'Contramestra Vale',
        texture: 'npc_engineer',
        tint: 0xe8923d,
        lines: GameState.terminalCleared
          ? [
            'O Terminal parou de circular sozinho. Os drones de carga não passam mais nas avenidas.',
            'A Refinaria Offshore ainda fuma no berço do meio — mas o portão dela continua selado.'
          ]
          : [
            'Este é o Estaleiro Automatizado. Os guindastes não param — mesmo sem gente no cais.',
            'O Terminal de Contêineres fica naquele berço ao norte. Os drones de carga ainda circulam as rotas sozinhos.'
          ]
      }),
      new NPC(this, this.tileMap, npcSpawns[1].gx, npcSpawns[1].gy, {
        id: 'operador_guindaste',
        name: 'Operador de Guindaste',
        texture: 'npc_worker',
        tint: 0x6a8a9a,
        lines: [
          'Desci pelo poço de carga quando os logs do Administrador abriram a trava. Ninguém na cidade admite que o porto existe.',
          'A Refinaria e a linha de montagem ficam mais adiante. Por agora, o único berço livre é o Terminal.'
        ]
      })
    ];

    const arrivalSpots = this.tileMap.allMarkers('N2');
    TERMINAL_CAPTIVES.forEach((captive, i) => {
      if (!GameState.rescuedNpcs.has(captive.id)) return;
      const spot = arrivalSpots[i];
      if (!spot) return;
      this.npcs.push(new NPC(this, this.tileMap, spot.gx, spot.gy, {
        id: captive.id,
        name: captive.name,
        texture: 'npc_worker',
        tint: i === 1 ? 0xffc878 : 0xe8923d,
        lines: captive.townLines
      }));
    });

    // Poço de carga de volta ao Submundo — sempre disponível. Plataforma de
    // elevador, não portal (fábrica→cidade) nem buraco (cidade→submundo).
    this.liftPos = this.tileMap.marker('L');
    const liftWorld = this.tileMap.gridToWorld(this.liftPos.gx, this.liftPos.gy);
    this.add.image(liftWorld.x, liftWorld.y, 'light_pool').setDepth(-999).setScale(1.1).setBlendMode(Phaser.BlendModes.ADD).setTint(0xe8923d);
    this.liftSprite = this.add.image(liftWorld.x, liftWorld.y, 'prop_lift').setDepth(9000);
    this.tweens.add({ targets: this.liftSprite, y: liftWorld.y - 3, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.add.text(liftWorld.x, liftWorld.y - 26, 'SUBMUNDO ↓', {
      fontFamily: 'Courier New', fontSize: '9px', color: '#e8923d'
    }).setOrigin(0.5).setDepth(9001);

    // Portão do Terminal de Contêineres — berço norte, porta pulsante.
    this.terminalDoorPos = this.tileMap.marker('E');
    const gateWorld = this.tileMap.gridToWorld(this.terminalDoorPos.gx, this.terminalDoorPos.gy);
    this.add.image(gateWorld.x, gateWorld.y, 'light_pool').setDepth(-999).setBlendMode(Phaser.BlendModes.ADD).setTint(0xe8923d);
    this.terminalDoorSprite = this.add.image(gateWorld.x, gateWorld.y, 'door_estaleiro').setDepth(9000);
    this.tweens.add({ targets: this.terminalDoorSprite, alpha: 0.45, duration: 650, yoyo: true, repeat: -1 });
    this.add.text(gateWorld.x, gateWorld.y - 22, 'TERMINAL DE CONTÊINERES →', {
      fontFamily: 'Courier New', fontSize: '9px', color: '#e8923d'
    }).setOrigin(0.5).setDepth(9001);

    this.transitioning = false;

    this._setupCamera();
    this._setupInput();
    this.cameras.main.fadeIn(350, 18, 22, 28);
    playMusic(this, 'music_estaleiro');

    initHud(this, () => {
      this.game.events.emit('hud-init', { label: 'ESTALEIRO AUTOMATIZADO', showEnemies: false, sceneKey: 'EstaleiroScene' });
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

    const liftDist = Math.hypot(this.player.gx - this.liftPos.gx, this.player.gy - this.liftPos.gy);
    if (liftDist < 0.5 && !this.transitioning) {
      this._enterLift();
    }

    const doorDist = Math.hypot(this.player.gx - this.terminalDoorPos.gx, this.player.gy - this.terminalDoorPos.gy);
    if (doorDist < 0.6 && !this.transitioning) {
      this._enterTerminal();
    }
  }

  // Descida pelo poço: treme (hidráulica) + zoom pra dentro + fade aço-escuro.
  // O inverso da subida no Submundo (zoom pra fora, fade mais claro).
  _enterLift() {
    this.transitioning = true;
    this.player.isMoving = false;
    playSfx(this, 'sfx_door', { volume: 0.4 });

    this.cameras.main.shake(200, 0.008);
    this.cameras.main.zoomTo(1.65, 420, 'Cubic.easeIn');
    this.cameras.main.fadeOut(460, 10, 12, 16);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.stop('UIScene');
      this.scene.start('SubmundoScene');
    });
  }

  _enterTerminal() {
    this.transitioning = true;
    this.player.isMoving = false;
    playSfx(this, 'sfx_door');

    this.tweens.add({ targets: this.terminalDoorSprite, scale: 1.35, duration: 200, yoyo: true, ease: 'Cubic.Out' });
    this.cameras.main.flash(150, 232, 146, 61);
    this.cameras.main.fadeOut(420, 18, 22, 28);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.stop('UIScene');
      this.scene.start('TerminalScene');
    });
  }
}
