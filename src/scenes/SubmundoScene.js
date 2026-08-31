import Phaser from 'phaser';
import TileMap from '../world/TileMap.js';
import { buildSubmundoHub } from '../world/SubmundoLayout.js';
import Player from '../entities/Player.js';
import NPC from '../entities/NPC.js';
import { DIRECTIONS } from '../utils/constants.js';
import { GameState } from '../state/GameState.js';
import { FANTASMA_CAPTIVES } from '../state/FantasmaCaptives.js';
import { MERCADO_NEGRO_CAPTIVES } from '../state/MercadoNegroCaptives.js';
import { initHud } from '../utils/hud.js';
import { playMusic, playSfx } from '../audio/AudioManager.js';

// Pontos livres onde os NPCs resgatados na Estação Fantasma vão aparecer.
const ARRIVAL_SPOTS = [
  { gx: 10, gy: 4 },
  { gx: 13, gy: 4 }
];

const RUBBLE_PROPS = [
  { gx: 6, gy: 11, texture: 'prop_crate' },
  { gx: 17, gy: 11, texture: 'prop_barrel' }
];

export default class SubmundoScene extends Phaser.Scene {
  constructor() {
    super('SubmundoScene');
  }

  create() {
    const { grid, markers } = buildSubmundoHub();
    this.tileMap = new TileMap(this, grid, {
      wallTexture: 'wall_submundo',
      floorTexture: 'floor_submundo',
      floorVariants: [
        { key: 'floor_submundo', weight: 0.85 },
        { key: 'floor_submundo_vent', weight: 0.15 }
      ],
      markers
    });

    for (const prop of RUBBLE_PROPS) {
      const world = this.tileMap.gridToWorld(prop.gx, prop.gy);
      this.add.image(world.x, world.y, prop.texture).setOrigin(0.5, 0.85).setDepth(prop.gy * 10 + 2);
    }

    const spawn = this.tileMap.marker('S');
    this.player = new Player(this, this.tileMap, spawn);

    const npcSpawns = this.tileMap.allMarkers('N');
    this.npcs = [
      new NPC(this, this.tileMap, npcSpawns[0].gx, npcSpawns[0].gy, {
        id: 'ratoeiro',
        name: 'Ratoeiro',
        texture: 'npc_worker',
        tint: 0xc9a06a,
        lines: [
          'Bem-vindo ao Submundo. Aqui embaixo ninguém pergunta seu nome, e você não pergunta o dos outros.',
          'A Estação Fantasma fica logo ali. Diz a lenda que os trens ainda passam, mesmo sem trilho pra sair.'
        ]
      }),
      new NPC(this, this.tileMap, npcSpawns[1].gx, npcSpawns[1].gy, {
        id: 'andarilho',
        name: 'Andarilho',
        texture: 'npc_worker',
        tint: 0x8a9a5c,
        lines: [
          'Tem mais coisa aqui embaixo do que uma estação velha. Mercado, gente contaminada, servidor escondido — vai com calma.',
          'Se você desceu pela rachadura do Distrito, já sabe que ninguém lá em cima queria que isso existisse.'
        ]
      })
    ];

    FANTASMA_CAPTIVES.forEach((captive, i) => {
      if (!GameState.rescuedNpcs.has(captive.id)) return;
      const spot = ARRIVAL_SPOTS[i];
      if (!spot) return;
      this.npcs.push(new NPC(this, this.tileMap, spot.gx, spot.gy, {
        id: captive.id,
        name: captive.name,
        texture: 'npc_worker',
        lines: captive.townLines,
        tint: i === 1 ? 0xffd27a : 0xc9a06a
      }));
    });

    const mercadoArrivalSpots = this.tileMap.allMarkers('N2');
    MERCADO_NEGRO_CAPTIVES.forEach((captive, i) => {
      if (!GameState.rescuedNpcs.has(captive.id)) return;
      const spot = mercadoArrivalSpots[i];
      if (!spot) return;
      this.npcs.push(new NPC(this, this.tileMap, spot.gx, spot.gy, {
        id: captive.id,
        name: captive.name,
        texture: 'npc_worker',
        lines: captive.townLines,
        tint: i === 1 ? 0xe8b93d : 0x8a6a4a
      }));
    });

    // Passagem de volta pro Distrito Neon — sempre disponível, sem gancho.
    // Mesmo buraco físico usado na descida, não um portal/porta.
    this.holePos = this.tileMap.marker('P');
    const holeWorld = this.tileMap.gridToWorld(this.holePos.gx, this.holePos.gy);
    this.add.image(holeWorld.x, holeWorld.y, 'light_pool').setDepth(-999).setScale(1.1).setBlendMode(Phaser.BlendModes.MULTIPLY).setTint(0x2a2018);
    this.holeSprite = this.add.image(holeWorld.x, holeWorld.y, 'prop_hole').setDepth(9000);
    this.add.text(holeWorld.x, holeWorld.y - 26, 'DISTRITO NEON ↑', {
      fontFamily: 'Courier New', fontSize: '9px', color: '#c9a06a'
    }).setOrigin(0.5).setDepth(9001);

    // Porta de entrada pra Estação Fantasma (Fase 09) — sempre ativa.
    this.doorPos = this.tileMap.marker('E');
    const doorWorld = this.tileMap.gridToWorld(this.doorPos.gx, this.doorPos.gy);
    this.add.image(doorWorld.x, doorWorld.y, 'light_pool').setDepth(-999).setBlendMode(Phaser.BlendModes.ADD).setTint(0xc9a06a);
    this.doorSprite = this.add.image(doorWorld.x, doorWorld.y, 'door').setDepth(9000).setTint(0xc9a06a);
    this.tweens.add({ targets: this.doorSprite, alpha: 0.45, duration: 650, yoyo: true, repeat: -1 });
    this.add.text(doorWorld.x, doorWorld.y - 22, 'ESTAÇÃO FANTASMA →', {
      fontFamily: 'Courier New', fontSize: '9px', color: '#c9a06a'
    }).setOrigin(0.5).setDepth(9001);

    // Porta de entrada pro Mercado Negro dos Túneis (Fase 10) — só existe
    // depois de limpar a Estação Fantasma.
    this.mercadoDoorPos = null;
    if (GameState.fantasmaCleared) {
      this.mercadoDoorPos = this.tileMap.marker('E2');
      const mercadoWorld = this.tileMap.gridToWorld(this.mercadoDoorPos.gx, this.mercadoDoorPos.gy);
      this.add.image(mercadoWorld.x, mercadoWorld.y, 'light_pool').setDepth(-999).setBlendMode(Phaser.BlendModes.ADD).setTint(0xe8b93d);
      this.mercadoDoorSprite = this.add.image(mercadoWorld.x, mercadoWorld.y, 'door').setDepth(9000).setTint(0xe8b93d);
      this.tweens.add({ targets: this.mercadoDoorSprite, alpha: 0.45, duration: 650, yoyo: true, repeat: -1 });
      this.add.text(mercadoWorld.x, mercadoWorld.y - 22, 'MERCADO NEGRO DOS TÚNEIS →', {
        fontFamily: 'Courier New', fontSize: '9px', color: '#e8b93d'
      }).setOrigin(0.5).setDepth(9001);
    }

    this.transitioning = false;

    this._setupCamera();
    this._setupInput();
    this.cameras.main.fadeIn(350, 8, 6, 4);
    playMusic(this, 'music_submundo');

    initHud(this, () => {
      this.game.events.emit('hud-init', { label: 'SUBMUNDO', showEnemies: false, sceneKey: 'SubmundoScene' });
      this._emitStats();
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

    const holeDist = Math.hypot(this.player.gx - this.holePos.gx, this.player.gy - this.holePos.gy);
    if (holeDist < 0.5 && !this.transitioning) {
      this._enterHole();
    }

    const doorDist = Math.hypot(this.player.gx - this.doorPos.gx, this.player.gy - this.doorPos.gy);
    if (doorDist < 0.6 && !this.transitioning) {
      this._enterDoor();
    }

    if (this.mercadoDoorPos) {
      const mercadoDist = Math.hypot(this.player.gx - this.mercadoDoorPos.gx, this.player.gy - this.mercadoDoorPos.gy);
      if (mercadoDist < 0.6 && !this.transitioning) {
        this._enterMercadoDoor();
      }
    }
  }

  // Mesma passagem física (sem flash colorido) usada pra descer.
  _enterHole() {
    this.transitioning = true;
    this.player.isMoving = false;
    playSfx(this, 'sfx_door', { volume: 0.4 });

    this.cameras.main.shake(200, 0.008);
    this.cameras.main.zoomTo(1.6, 380, 'Cubic.easeIn');
    this.cameras.main.fadeOut(420, 10, 12, 24);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.stop('UIScene');
      this.scene.start('DistrictScene');
    });
  }

  _enterDoor() {
    this.transitioning = true;
    this.player.isMoving = false;
    playSfx(this, 'sfx_door');

    this.tweens.add({ targets: this.doorSprite, scale: 1.35, duration: 200, yoyo: true, ease: 'Cubic.Out' });
    this.cameras.main.flash(150, 201, 160, 106);
    this.cameras.main.fadeOut(420, 8, 6, 4);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.stop('UIScene');
      this.scene.start('FantasmaScene');
    });
  }

  _enterMercadoDoor() {
    this.transitioning = true;
    this.player.isMoving = false;
    playSfx(this, 'sfx_door');

    this.tweens.add({ targets: this.mercadoDoorSprite, scale: 1.35, duration: 200, yoyo: true, ease: 'Cubic.Out' });
    this.cameras.main.flash(150, 232, 185, 61);
    this.cameras.main.fadeOut(420, 8, 6, 4);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.stop('UIScene');
      this.scene.start('MercadoNegroScene');
    });
  }
}
