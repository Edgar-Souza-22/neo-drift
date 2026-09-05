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
        lines: GameState.torreControleCleared
          ? [
            'O Regente caiu — o Estaleiro Automatizado inteiro finalmente sossega. Nenhum sistema aqui responde a mais ninguém.',
            'A região está limpa. Só resta o que vem depois disso.'
          ]
          : GameState.estaleiroNavalCleared
            ? [
              'O Protótipo caiu — a linha de montagem finalmente parou. Nenhum braço robótico bate mais sozinho.',
              'A Torre de Controle Logístico comandava tudo isso de longe. É o último berço — e o portão dela já abriu.'
            ]
            : GameState.refinariaCleared
            ? [
              'A Perfuratriz caiu — o convés da Refinaria parou de ceder. As pontes ficam firmes agora.',
              'O Estaleiro Naval é o próximo berço — uma linha de montagem inteira ligada sozinha, fabricando robôs sem parar.'
            ]
            : GameState.terminalCleared
              ? [
                'O Terminal parou de circular sozinho. Os drones de carga não passam mais nas avenidas.',
                'A Refinaria Offshore está logo ali no berço do meio — mas eu não pisaria naquelas pontes sem pensar duas vezes.'
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

    // Portão da Refinaria Offshore — berço do meio, só transiciona depois
    // d'O Empilhador cair (senão fica visível mas selado, sem interação).
    this.refinariaDoorPos = this.tileMap.marker('E2');
    const refinariaWorld = this.tileMap.gridToWorld(this.refinariaDoorPos.gx, this.refinariaDoorPos.gy);
    if (GameState.terminalCleared) {
      this.add.image(refinariaWorld.x, refinariaWorld.y, 'light_pool').setDepth(-999).setBlendMode(Phaser.BlendModes.ADD).setTint(0x2f6fa8);
      this.refinariaDoorSprite = this.add.image(refinariaWorld.x, refinariaWorld.y, 'door_estaleiro').setDepth(9000).setTint(0x2f6fa8);
      this.tweens.add({ targets: this.refinariaDoorSprite, alpha: 0.45, duration: 650, yoyo: true, repeat: -1 });
      this.add.text(refinariaWorld.x, refinariaWorld.y - 22, 'REFINARIA OFFSHORE →', {
        fontFamily: 'Courier New', fontSize: '9px', color: '#2f6fa8'
      }).setOrigin(0.5).setDepth(9001);
    } else {
      this.add.image(refinariaWorld.x, refinariaWorld.y, 'door_estaleiro').setDepth(9000).setTint(0x333c44).setAlpha(0.6);
      this.add.text(refinariaWorld.x, refinariaWorld.y - 22, 'SELADO', {
        fontFamily: 'Courier New', fontSize: '9px', color: '#5a6068'
      }).setOrigin(0.5).setDepth(9001);
    }

    // Portão do Estaleiro Naval — berço leste, só transiciona depois d'A
    // Perfuratriz cair.
    this.navalDoorPos = this.tileMap.marker('E3');
    const navalWorld = this.tileMap.gridToWorld(this.navalDoorPos.gx, this.navalDoorPos.gy);
    if (GameState.refinariaCleared) {
      this.add.image(navalWorld.x, navalWorld.y, 'light_pool').setDepth(-999).setBlendMode(Phaser.BlendModes.ADD).setTint(0x8fe0ff);
      this.navalDoorSprite = this.add.image(navalWorld.x, navalWorld.y, 'door_estaleiro').setDepth(9000).setTint(0x8fe0ff);
      this.tweens.add({ targets: this.navalDoorSprite, alpha: 0.45, duration: 650, yoyo: true, repeat: -1 });
      this.add.text(navalWorld.x, navalWorld.y - 22, 'ESTALEIRO NAVAL →', {
        fontFamily: 'Courier New', fontSize: '9px', color: '#8fe0ff'
      }).setOrigin(0.5).setDepth(9001);
    } else {
      this.add.image(navalWorld.x, navalWorld.y, 'door_estaleiro').setDepth(9000).setTint(0x333c44).setAlpha(0.6);
      this.add.text(navalWorld.x, navalWorld.y - 22, 'SELADO', {
        fontFamily: 'Courier New', fontSize: '9px', color: '#5a6068'
      }).setOrigin(0.5).setDepth(9001);
    }

    // Portão da Torre de Controle Logístico — alcova leste, só transiciona
    // depois d'O Protótipo cair. Última fase da região.
    this.torreDoorPos = this.tileMap.marker('E4');
    const torreWorld = this.tileMap.gridToWorld(this.torreDoorPos.gx, this.torreDoorPos.gy);
    if (GameState.estaleiroNavalCleared) {
      this.add.image(torreWorld.x, torreWorld.y, 'light_pool').setDepth(-999).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffb347);
      this.torreDoorSprite = this.add.image(torreWorld.x, torreWorld.y, 'door_estaleiro').setDepth(9000).setTint(0xffb347);
      this.tweens.add({ targets: this.torreDoorSprite, alpha: 0.45, duration: 650, yoyo: true, repeat: -1 });
      this.add.text(torreWorld.x, torreWorld.y - 22, 'TORRE DE CONTROLE →', {
        fontFamily: 'Courier New', fontSize: '9px', color: '#ffb347'
      }).setOrigin(0.5).setDepth(9001);
    } else {
      this.add.image(torreWorld.x, torreWorld.y, 'door_estaleiro').setDepth(9000).setTint(0x333c44).setAlpha(0.6);
      this.add.text(torreWorld.x, torreWorld.y - 22, 'SELADO', {
        fontFamily: 'Courier New', fontSize: '9px', color: '#5a6068'
      }).setOrigin(0.5).setDepth(9001);
    }

    // Auditora Sload + monotrilho corporativo pra Torre Matriz — só existem
    // depois d'O Regente cair. O monotrilho corre na HORIZONTAL, o contrário
    // do portal que gira (fábrica -> cidade), do buraco que desce (cidade ->
    // submundo) e do poço que sobe (submundo -> estaleiro): a sede não está
    // acima nem abaixo do porto, está do outro lado da cidade.
    this.monorailPos = null;
    if (GameState.torreControleCleared) {
      const auditorSpot = this.tileMap.marker('NM');
      this.npcs.push(new NPC(this, this.tileMap, auditorSpot.gx, auditorSpot.gy, {
        id: 'auditora_sload',
        name: 'Auditora Sload',
        texture: 'npc_coordinator',
        tint: 0xc9a24a,
        lines: [
          'Vim de trem quando o Regente parou de responder. Eu assino os relatórios que dizem que este porto não existe.',
          'A Torre Matriz manda em tudo isso — no Estaleiro, no Submundo, no Distrito. O monotrilho ainda aceita meu crachá. Aceita o seu também, hoje.'
        ]
      }));

      this.monorailPos = this.tileMap.marker('MT');
      const railWorld = this.tileMap.gridToWorld(this.monorailPos.gx, this.monorailPos.gy);
      this.add.image(railWorld.x, railWorld.y, 'light_pool').setDepth(-999).setScale(1.2)
        .setBlendMode(Phaser.BlendModes.ADD).setTint(0xc9a24a);
      this.monorailSprite = this.add.image(railWorld.x, railWorld.y, 'prop_monorail').setDepth(9000);
      this.tweens.add({
        targets: this.monorailSprite, x: railWorld.x + 3, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut'
      });
      this.add.text(railWorld.x, railWorld.y - 26, 'TORRE MATRIZ →', {
        fontFamily: 'Courier New', fontSize: '9px', color: '#c9a24a'
      }).setOrigin(0.5).setDepth(9001);
    }

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

    if (GameState.terminalCleared) {
      const refinariaDist = Math.hypot(this.player.gx - this.refinariaDoorPos.gx, this.player.gy - this.refinariaDoorPos.gy);
      if (refinariaDist < 0.6 && !this.transitioning) {
        this._enterRefinaria();
      }
    }

    if (GameState.refinariaCleared) {
      const navalDist = Math.hypot(this.player.gx - this.navalDoorPos.gx, this.player.gy - this.navalDoorPos.gy);
      if (navalDist < 0.6 && !this.transitioning) {
        this._enterEstaleiroNaval();
      }
    }

    if (GameState.estaleiroNavalCleared) {
      const torreDist = Math.hypot(this.player.gx - this.torreDoorPos.gx, this.player.gy - this.torreDoorPos.gy);
      if (torreDist < 0.6 && !this.transitioning) {
        this._enterTorreControle();
      }
    }

    if (this.monorailPos) {
      const railDist = Math.hypot(this.player.gx - this.monorailPos.gx, this.player.gy - this.monorailPos.gy);
      if (railDist < 0.5 && !this.transitioning) {
        this._enterMonorail();
      }
    }
  }

  // Partida do monotrilho: a câmera arranca pro lado (movimento horizontal)
  // + fade claro — o oposto do fade aço-escuro do poço de carga logo acima.
  _enterMonorail() {
    this.transitioning = true;
    this.player.isMoving = false;
    playSfx(this, 'sfx_door', { volume: 0.4 });

    this.cameras.main.stopFollow();
    this.tweens.add({
      targets: this.cameras.main,
      scrollX: this.cameras.main.scrollX + 260,
      duration: 460,
      ease: 'Cubic.In'
    });
    this.cameras.main.flash(150, 201, 162, 74);
    this.cameras.main.fadeOut(460, 30, 34, 44);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.stop('UIScene');
      this.scene.start('MatrizScene');
    });
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

  _enterRefinaria() {
    this.transitioning = true;
    this.player.isMoving = false;
    playSfx(this, 'sfx_door');

    this.tweens.add({ targets: this.refinariaDoorSprite, scale: 1.35, duration: 200, yoyo: true, ease: 'Cubic.Out' });
    this.cameras.main.flash(150, 47, 111, 168);
    this.cameras.main.fadeOut(420, 18, 22, 28);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.stop('UIScene');
      this.scene.start('RefinariaScene');
    });
  }

  _enterEstaleiroNaval() {
    this.transitioning = true;
    this.player.isMoving = false;
    playSfx(this, 'sfx_door');

    this.tweens.add({ targets: this.navalDoorSprite, scale: 1.35, duration: 200, yoyo: true, ease: 'Cubic.Out' });
    this.cameras.main.flash(150, 143, 224, 255);
    this.cameras.main.fadeOut(420, 18, 22, 28);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.stop('UIScene');
      this.scene.start('EstaleiroNavalScene');
    });
  }

  _enterTorreControle() {
    this.transitioning = true;
    this.player.isMoving = false;
    playSfx(this, 'sfx_door');

    this.tweens.add({ targets: this.torreDoorSprite, scale: 1.35, duration: 200, yoyo: true, ease: 'Cubic.Out' });
    this.cameras.main.flash(150, 255, 179, 71);
    this.cameras.main.fadeOut(420, 18, 22, 28);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.stop('UIScene');
      this.scene.start('TorreControleScene');
    });
  }
}
