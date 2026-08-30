import Phaser from 'phaser';
import TileMap from '../world/TileMap.js';
import { buildNeonDistrict } from '../world/DistrictLayout.js';
import Player from '../entities/Player.js';
import NPC from '../entities/NPC.js';
import { DIRECTIONS } from '../utils/constants.js';
import { GameState } from '../state/GameState.js';
import { TOWER_CAPTIVES } from '../state/TowerCaptives.js';
import { initHud } from '../utils/hud.js';
import { playMusic, playSfx } from '../audio/AudioManager.js';

// Pontos livres onde os NPCs resgatados na Torre de Segurança vão aparecer
// — na alcova sul, perto da porta da Torre (de onde eles vieram).
const ARRIVAL_SPOTS = [
  { gx: 11, gy: 17 },
  { gx: 15, gy: 17 }
];

const KIOSK_PROPS = [
  { gx: 10, gy: 9, texture: 'prop_kiosk' },
  { gx: 16, gy: 9, texture: 'prop_kiosk' }
];

export default class DistrictScene extends Phaser.Scene {
  constructor() {
    super('DistrictScene');
  }

  create() {
    const { grid, markers } = buildNeonDistrict();
    this.tileMap = new TileMap(this, grid, {
      wallTexture: 'wall_district',
      floorTexture: 'floor_district',
      floorVariants: [
        { key: 'floor_district', weight: 0.85 },
        { key: 'floor_district_puddle', weight: 0.15 }
      ],
      markers
    });

    for (const prop of KIOSK_PROPS) {
      const world = this.tileMap.gridToWorld(prop.gx, prop.gy);
      this.add.image(world.x, world.y, prop.texture).setOrigin(0.5, 0.85).setDepth(prop.gy * 10 + 2);
    }

    const spawn = this.tileMap.marker('S');
    this.player = new Player(this, this.tileMap, spawn);

    const npcSpawns = this.tileMap.allMarkers('N');
    this.npcs = [
      new NPC(this, this.tileMap, npcSpawns[0].gx, npcSpawns[0].gy, {
        id: 'vendedora',
        name: 'Vendedora de Rua',
        texture: 'npc_worker',
        tint: 0xff9de8,
        lines: [
          'Bem-vindo ao Distrito Neon. Não é a fábrica, mas também não é seguro.',
          'A Torre de Segurança fica logo ali — ninguém que entrou voltou pra contar como é lá dentro.'
        ]
      }),
      new NPC(this, this.tileMap, npcSpawns[1].gx, npcSpawns[1].gy, {
        id: 'informante',
        name: 'Informante',
        texture: 'npc_worker',
        tint: 0x8fc9ff,
        lines: [
          'A Torre reage estranho a quem entra — nem tudo lá dentro se resolve na base da força.',
          'Já vi gente sair de lá falando sozinha sobre sequências e circuitos. Nunca entendi direito.'
        ]
      })
    ];

    TOWER_CAPTIVES.forEach((captive, i) => {
      if (!GameState.rescuedNpcs.has(captive.id)) return;
      const spot = ARRIVAL_SPOTS[i];
      if (!spot) return;
      this.npcs.push(new NPC(this, this.tileMap, spot.gx, spot.gy, {
        id: captive.id,
        name: captive.name,
        texture: 'npc_worker',
        lines: captive.townLines,
        tint: i === 1 ? 0xffd27a : 0xff9de8
      }));
    });

    // Portal de volta pra Ala Central — sempre ativo, sem gancho.
    this.portalPos = this.tileMap.marker('P');
    const portalWorld = this.tileMap.gridToWorld(this.portalPos.gx, this.portalPos.gy);
    this.add.image(portalWorld.x, portalWorld.y, 'light_pool').setDepth(-999).setScale(1.4).setBlendMode(Phaser.BlendModes.ADD).setTint(0xff5fd0);
    this.portalSprite = this.add.image(portalWorld.x, portalWorld.y, 'portal').setDepth(9000);
    this.tweens.add({ targets: this.portalSprite, angle: 360, duration: 3200, repeat: -1 });
    this.tweens.add({ targets: this.portalSprite, scale: 1.08, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.add.text(portalWorld.x, portalWorld.y - 24, '← ALA CENTRAL', {
      fontFamily: 'Courier New', fontSize: '9px', color: '#ff5fd0'
    }).setOrigin(0.5).setDepth(9001);

    // Porta de entrada pra Torre de Segurança (Fase 05) — sempre ativa.
    // Textura própria (painel liso, costura azul) em vez do 'door' genérico.
    this.doorPos = this.tileMap.marker('E');
    const doorWorld = this.tileMap.gridToWorld(this.doorPos.gx, this.doorPos.gy);
    this.add.image(doorWorld.x, doorWorld.y, 'light_pool').setDepth(-999).setBlendMode(Phaser.BlendModes.ADD).setTint(0x8fc9ff);
    this.doorSprite = this.add.image(doorWorld.x, doorWorld.y, 'door_tower').setDepth(9000);
    this.tweens.add({ targets: this.doorSprite, alpha: 0.45, duration: 650, yoyo: true, repeat: -1 });
    this.add.text(doorWorld.x, doorWorld.y - 22, 'TORRE DE SEGURANÇA →', {
      fontFamily: 'Courier New', fontSize: '9px', color: '#8fc9ff'
    }).setOrigin(0.5).setDepth(9001);

    // Porta de entrada pro Arsenal Blindado (Fase 06) — só existe depois de
    // limpar a Torre, igual ao gancho da Emissária Kess na Ala Central.
    // Textura própria (blindado, roda de trava, faixa de risco).
    this.arsenalDoorPos = null;
    if (GameState.towerCleared) {
      this.arsenalDoorPos = this.tileMap.marker('G');
      const gateWorld = this.tileMap.gridToWorld(this.arsenalDoorPos.gx, this.arsenalDoorPos.gy);
      this.add.image(gateWorld.x, gateWorld.y, 'light_pool').setDepth(-999).setBlendMode(Phaser.BlendModes.ADD).setTint(0x9fff6a);
      this.arsenalDoorSprite = this.add.image(gateWorld.x, gateWorld.y, 'door_arsenal').setDepth(9000);
      this.tweens.add({ targets: this.arsenalDoorSprite, alpha: 0.45, duration: 650, yoyo: true, repeat: -1 });
      this.add.text(gateWorld.x, gateWorld.y - 22, 'ARSENAL BLINDADO →', {
        fontFamily: 'Courier New', fontSize: '9px', color: '#9fff6a'
      }).setOrigin(0.5).setDepth(9001);
    }

    // Porta de entrada pro Nexo de Transporte (Fase 07) — só existe depois
    // de limpar o Arsenal. Textura própria (arco de portal, anéis
    // concêntricos) em vez de uma porta deslizante.
    this.nexusDoorPos = null;
    if (GameState.arsenalCleared) {
      this.nexusDoorPos = this.tileMap.marker('Z');
      const nexusWorld = this.tileMap.gridToWorld(this.nexusDoorPos.gx, this.nexusDoorPos.gy);
      this.add.image(nexusWorld.x, nexusWorld.y, 'light_pool').setDepth(-999).setBlendMode(Phaser.BlendModes.ADD).setTint(0x9f6fff);
      this.nexusDoorSprite = this.add.image(nexusWorld.x, nexusWorld.y, 'door_nexus').setDepth(9000);
      this.tweens.add({ targets: this.nexusDoorSprite, alpha: 0.45, duration: 650, yoyo: true, repeat: -1 });
      this.add.text(nexusWorld.x, nexusWorld.y - 22, 'NEXO DE TRANSPORTE →', {
        fontFamily: 'Courier New', fontSize: '9px', color: '#9f6fff'
      }).setOrigin(0.5).setDepth(9001);
    }

    // Porta de entrada pra Central de Vigilância (Fase 08) — só existe
    // depois de limpar o Nexo, fechando de vez o arco do Distrito Neon.
    // Textura própria (olho de câmera, íris verde-sinal).
    this.vigilanceDoorPos = null;
    if (GameState.nexusCleared) {
      this.vigilanceDoorPos = this.tileMap.marker('V');
      const vigWorld = this.tileMap.gridToWorld(this.vigilanceDoorPos.gx, this.vigilanceDoorPos.gy);
      this.add.image(vigWorld.x, vigWorld.y, 'light_pool').setDepth(-999).setBlendMode(Phaser.BlendModes.ADD).setTint(0x3dffa0);
      this.vigilanceDoorSprite = this.add.image(vigWorld.x, vigWorld.y, 'door_vigilancia').setDepth(9000);
      this.tweens.add({ targets: this.vigilanceDoorSprite, alpha: 0.45, duration: 650, yoyo: true, repeat: -1 });
      this.add.text(vigWorld.x, vigWorld.y - 22, 'CENTRAL DE VIGILÂNCIA →', {
        fontFamily: 'Courier New', fontSize: '9px', color: '#3dffa0'
      }).setOrigin(0.5).setDepth(9001);
    }

    // Contrabandista + buraco pro Submundo — só existem depois de limpar a
    // Central de Vigilância: o que ela expôs vai além do próprio distrito,
    // e alguém já achou a rachadura no chão antes de você. Passagem física
    // (o jogador cai), não um teleporte — visual e transição diferentes de
    // toda porta/portal do resto do jogo.
    this.holePos = null;
    if (GameState.vigilanceCleared) {
      const contrabandistaSpot = this.tileMap.marker('CB');
      this.npcs.push(new NPC(this, this.tileMap, contrabandistaSpot.gx, contrabandistaSpot.gy, {
        id: 'contrabandista',
        name: 'Contrabandista',
        texture: 'npc_herald',
        lines: [
          'A vigilância caiu, mas o que ela escondia vai fundo — literalmente. Achei essa rachadura faz semanas.',
          'Lá embaixo é o Submundo. Ninguém que manda aqui em cima admite que ele existe.'
        ]
      }));

      this.holePos = this.tileMap.marker('BU');
      const holeWorld = this.tileMap.gridToWorld(this.holePos.gx, this.holePos.gy);
      this.add.image(holeWorld.x, holeWorld.y, 'light_pool').setDepth(-999).setScale(1.1).setBlendMode(Phaser.BlendModes.MULTIPLY).setTint(0x2a2018);
      this.holeSprite = this.add.image(holeWorld.x, holeWorld.y, 'prop_hole').setDepth(9000);
      this.add.text(holeWorld.x, holeWorld.y - 26, 'SUBMUNDO ↓', {
        fontFamily: 'Courier New', fontSize: '9px', color: '#c9a06a'
      }).setOrigin(0.5).setDepth(9001);
    }

    this.transitioning = false;

    this._setupCamera();
    this._setupInput();
    this.cameras.main.fadeIn(350, 10, 12, 24);
    playMusic(this, 'music_district');

    initHud(this, () => {
      this.game.events.emit('hud-init', { label: 'DISTRITO NEON', showEnemies: false, sceneKey: 'DistrictScene' });
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

    const portalDist = Math.hypot(this.player.gx - this.portalPos.gx, this.player.gy - this.portalPos.gy);
    if (portalDist < 0.6 && !this.transitioning) {
      this._enterPortal();
    }

    const doorDist = Math.hypot(this.player.gx - this.doorPos.gx, this.player.gy - this.doorPos.gy);
    if (doorDist < 0.6 && !this.transitioning) {
      this._enterDoor();
    }

    if (this.arsenalDoorPos) {
      const gateDist = Math.hypot(this.player.gx - this.arsenalDoorPos.gx, this.player.gy - this.arsenalDoorPos.gy);
      if (gateDist < 0.6 && !this.transitioning) {
        this._enterArsenalDoor();
      }
    }

    if (this.nexusDoorPos) {
      const nexusDist = Math.hypot(this.player.gx - this.nexusDoorPos.gx, this.player.gy - this.nexusDoorPos.gy);
      if (nexusDist < 0.6 && !this.transitioning) {
        this._enterNexusDoor();
      }
    }

    if (this.vigilanceDoorPos) {
      const vigDist = Math.hypot(this.player.gx - this.vigilanceDoorPos.gx, this.player.gy - this.vigilanceDoorPos.gy);
      if (vigDist < 0.6 && !this.transitioning) {
        this._enterVigilanceDoor();
      }
    }

    if (this.holePos) {
      const holeDist = Math.hypot(this.player.gx - this.holePos.gx, this.player.gy - this.holePos.gy);
      if (holeDist < 0.5 && !this.transitioning) {
        this._enterHole();
      }
    }
  }

  // Transição de teleporte: zoom pro portal + flash colorido + fade, em vez
  // do flash+fade "plano" das portas comuns — reforça que é um teleporte,
  // não uma porta.
  _enterPortal() {
    this.transitioning = true;
    this.player.isMoving = false;
    playSfx(this, 'sfx_door', { volume: 0.5 });

    this.tweens.add({ targets: this.portalSprite, scale: 1.6, duration: 300, ease: 'Cubic.In' });
    this.cameras.main.zoomTo(1.9, 420, 'Cubic.easeIn');
    this.cameras.main.flash(180, 255, 95, 208);
    this.cameras.main.fadeOut(420, 10, 12, 24);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.stop('UIScene');
      this.scene.start('TownScene');
    });
  }

  // Mesma animação de flash + fade das outras portas.
  _enterDoor() {
    this.transitioning = true;
    this.player.isMoving = false;
    playSfx(this, 'sfx_door');

    this.tweens.add({ targets: this.doorSprite, scale: 1.35, duration: 200, yoyo: true, ease: 'Cubic.Out' });
    this.cameras.main.flash(150, 143, 201, 255);
    this.cameras.main.fadeOut(420, 10, 12, 24);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.stop('UIScene');
      this.scene.start('TowerScene');
    });
  }

  // Mesma animação de flash + fade, cor combinando com o Arsenal.
  _enterArsenalDoor() {
    this.transitioning = true;
    this.player.isMoving = false;
    playSfx(this, 'sfx_door');

    this.tweens.add({ targets: this.arsenalDoorSprite, scale: 1.35, duration: 200, yoyo: true, ease: 'Cubic.Out' });
    this.cameras.main.flash(150, 159, 255, 106);
    this.cameras.main.fadeOut(420, 10, 12, 24);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.stop('UIScene');
      this.scene.start('ArsenalScene');
    });
  }

  // Mesma animação de flash + fade, cor combinando com o Nexo.
  _enterNexusDoor() {
    this.transitioning = true;
    this.player.isMoving = false;
    playSfx(this, 'sfx_door');

    this.tweens.add({ targets: this.nexusDoorSprite, scale: 1.35, duration: 200, yoyo: true, ease: 'Cubic.Out' });
    this.cameras.main.flash(150, 159, 111, 255);
    this.cameras.main.fadeOut(420, 10, 12, 24);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.stop('UIScene');
      this.scene.start('NexusScene');
    });
  }

  // Mesma animação de flash + fade, cor combinando com a Central de Vigilância.
  _enterVigilanceDoor() {
    this.transitioning = true;
    this.player.isMoving = false;
    playSfx(this, 'sfx_door');

    this.tweens.add({ targets: this.vigilanceDoorSprite, scale: 1.35, duration: 200, yoyo: true, ease: 'Cubic.Out' });
    this.cameras.main.flash(150, 61, 255, 160);
    this.cameras.main.fadeOut(420, 10, 12, 24);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.stop('UIScene');
      this.scene.start('VigilanceScene');
    });
  }

  // Passagem física, não teleporte: sem flash colorido — a câmera treme e
  // "cai" (zoom leve pra dentro) antes do fade, reforçando que o jogador
  // está despencando por um buraco, não atravessando uma porta/portal.
  _enterHole() {
    this.transitioning = true;
    this.player.isMoving = false;
    playSfx(this, 'sfx_door', { volume: 0.4 });

    this.cameras.main.shake(260, 0.01);
    this.cameras.main.zoomTo(1.6, 380, 'Cubic.easeIn');
    this.cameras.main.fadeOut(420, 8, 6, 4);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.stop('UIScene');
      this.scene.start('SubmundoScene');
    });
  }
}
