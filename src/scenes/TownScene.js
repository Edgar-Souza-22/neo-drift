import Phaser from 'phaser';
import TileMap from '../world/TileMap.js';
import { buildCentralWing } from '../world/TownLayout.js';
import Player from '../entities/Player.js';
import NPC from '../entities/NPC.js';
import { DIRECTIONS } from '../utils/constants.js';
import { GameState } from '../state/GameState.js';
import { CAPTIVES } from '../state/Captives.js';
import { FOUNDRY_CAPTIVES } from '../state/FoundryCaptives.js';
import { REACTOR_CAPTIVES } from '../state/ReactorCaptives.js';
import { CORE_CAPTIVES } from '../state/CoreCaptives.js';
import { initHud } from '../utils/hud.js';
import { playMusic, playSfx } from '../audio/AudioManager.js';

// Pontos livres onde os NPCs resgatados vão aparecer, na ordem de CAPTIVES.
const ARRIVAL_SPOTS = [
  { gx: 6, gy: 10 },
  { gx: 17, gy: 10 }
];

// Idem, na ordem de FOUNDRY_CAPTIVES.
const FOUNDRY_ARRIVAL_SPOTS = [
  { gx: 8, gy: 4 },
  { gx: 14, gy: 12 }
];

// Idem, na ordem de REACTOR_CAPTIVES.
const REACTOR_ARRIVAL_SPOTS = [
  { gx: 4, gy: 11 },
  { gx: 19, gy: 11 }
];

// Idem, na ordem de CORE_CAPTIVES.
const CORE_ARRIVAL_SPOTS = [
  { gx: 9, gy: 2 },
  { gx: 14, gy: 2 }
];

// Só aparecem depois que o Setor de Contenção é limpo pela primeira vez —
// o gancho narrativo pra próxima ala da fábrica.
const COORDINATOR_SPOT = { gx: 16, gy: 8 };
const NEXT_DOOR_POS = { gx: 18, gy: 8 };
// Só aparece depois que a Ala de Fundição é limpa — gancho pra Fase 03.
const THIRD_DOOR_POS = { gx: 4, gy: 8 };
// Só aparece depois que a Ala do Reator é limpa — gancho pra Fase 04.
const FOURTH_DOOR_POS = { gx: 20, gy: 4 };

// Só aparecem depois que o Núcleo de Comando é limpo — a Emissária Kess e o
// teleporte que ela abre pro Distrito Neon (fora da fábrica), gancho pra
// Fase 05.
const HERALD_SPOT = { gx: 15, gy: 13 };
const PORTAL_SPOT = { gx: 15, gy: 14 };

// Emblema da Neo Industries, carimbado no chão perto do ponto de partida.
const LOGO_SPOT = { gx: 11.5, gy: 7 };

// Decoração de cenário — cantos livres de marcadores/pilares.
const TOWN_PROPS = [
  { gx: 2, gy: 2, texture: 'prop_crate' },
  { gx: 2, gy: 13, texture: 'prop_barrel' },
  { gx: 21, gy: 13, texture: 'prop_crate' },
  { gx: 11, gy: 2, texture: 'prop_pipe' }
];

export default class TownScene extends Phaser.Scene {
  constructor() {
    super('TownScene');
  }

  create(data) {
    this._justLoaded = !!(data && data.loaded);
    const { grid, markers } = buildCentralWing();
    this.tileMap = new TileMap(this, grid, {
      wallTexture: 'wall',
      floorTexture: 'floor_town',
      floorVariants: [
        { key: 'floor_town', weight: 0.78 },
        { key: 'floor_town_panel', weight: 0.17 },
        { key: 'floor_town_light', weight: 0.05 }
      ],
      markers
    });

    const logoWorld = this.tileMap.gridToWorld(LOGO_SPOT.gx, LOGO_SPOT.gy);
    this.add.image(logoWorld.x, logoWorld.y, 'light_pool').setDepth(-1001).setScale(2).setBlendMode(Phaser.BlendModes.ADD);
    this.logoSprite = this.add.image(logoWorld.x, logoWorld.y, 'floor_logo').setDepth(-1000);
    this.tweens.add({ targets: this.logoSprite, alpha: 0.75, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    // Brilho de borda nativo (mesmo preFX usado nos chefes) — dá presença de
    // "emblema aceso" ao logo sem precisar de outra imagem de luz por cima.
    const logoGlow = this.logoSprite.preFX.addGlow(0x37f0ff, 1.2, 0, false);
    this.tweens.add({ targets: logoGlow, outerStrength: 2, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.InOut' });

    for (const prop of TOWN_PROPS) {
      const world = this.tileMap.gridToWorld(prop.gx, prop.gy);
      this.add.image(world.x, world.y, prop.texture).setOrigin(0.5, 0.85).setDepth(prop.gy * 10 + 2);
    }

    const spawn = this.tileMap.marker('S');
    this.player = new Player(this, this.tileMap, spawn);

    const npcSpawns = this.tileMap.allMarkers('N');
    this.npcs = [
      new NPC(this, this.tileMap, npcSpawns[0].gx, npcSpawns[0].gy, {
        id: 'guarda',
        name: 'Guarda Sentinela',
        texture: 'npc_guard',
        lines: GameState.dungeon1Cleared
          ? ['O Setor de Contenção está mais silencioso agora. Bom trabalho.']
          : ['Sinais hostis foram detectados no Setor de Contenção, a leste.', 'Leve sua espada — os drones não vão parar sozinhos.']
      }),
      new NPC(this, this.tileMap, npcSpawns[1].gx, npcSpawns[1].gy, {
        id: 'engenheira',
        name: 'Engenheira Vex',
        texture: 'npc_engineer',
        lines: ['Encontrei destroços de uma lâmina de plasma na última incursão.', 'Se achar equipamento melhor lá dentro, não hesite em trocar.']
      })
    ];

    CAPTIVES.forEach((captive, i) => {
      if (!GameState.rescuedNpcs.has(captive.id)) return;
      const spot = ARRIVAL_SPOTS[i];
      if (!spot) return;
      this.npcs.push(new NPC(this, this.tileMap, spot.gx, spot.gy, {
        id: captive.id,
        name: captive.name,
        texture: 'npc_worker',
        lines: captive.townLines,
        tint: i === 1 ? 0xbfe0ff : undefined
      }));
    });

    FOUNDRY_CAPTIVES.forEach((captive, i) => {
      if (!GameState.rescuedNpcs.has(captive.id)) return;
      const spot = FOUNDRY_ARRIVAL_SPOTS[i];
      if (!spot) return;
      this.npcs.push(new NPC(this, this.tileMap, spot.gx, spot.gy, {
        id: captive.id,
        name: captive.name,
        texture: 'npc_worker',
        lines: captive.townLines,
        tint: i === 1 ? 0xffb347 : 0x9fffc2
      }));
    });

    REACTOR_CAPTIVES.forEach((captive, i) => {
      if (!GameState.rescuedNpcs.has(captive.id)) return;
      const spot = REACTOR_ARRIVAL_SPOTS[i];
      if (!spot) return;
      this.npcs.push(new NPC(this, this.tileMap, spot.gx, spot.gy, {
        id: captive.id,
        name: captive.name,
        texture: 'npc_worker',
        lines: captive.townLines,
        tint: i === 1 ? 0xd8b3ff : 0x9fffff
      }));
    });

    CORE_CAPTIVES.forEach((captive, i) => {
      if (!GameState.rescuedNpcs.has(captive.id)) return;
      const spot = CORE_ARRIVAL_SPOTS[i];
      if (!spot) return;
      this.npcs.push(new NPC(this, this.tileMap, spot.gx, spot.gy, {
        id: captive.id,
        name: captive.name,
        texture: 'npc_worker',
        lines: captive.townLines,
        tint: i === 1 ? 0xff9de8 : 0xd88bff
      }));
    });

    this.doorPos = this.tileMap.marker('E');
    const doorWorld = this.tileMap.gridToWorld(this.doorPos.gx, this.doorPos.gy);
    this.add.image(doorWorld.x, doorWorld.y, 'light_pool').setDepth(-999).setBlendMode(Phaser.BlendModes.ADD);
    this.doorSprite = this.add.image(doorWorld.x, doorWorld.y, 'door').setDepth(9000);
    this.tweens.add({ targets: this.doorSprite, alpha: 0.45, duration: 650, yoyo: true, repeat: -1 });
    this.add.text(doorWorld.x, doorWorld.y - 22, 'SETOR DE CONTENÇÃO →', {
      fontFamily: 'Courier New', fontSize: '9px', color: '#18e8ff'
    }).setOrigin(0.5).setDepth(9001);

    this.nextDoorPos = null;
    this.thirdDoorPos = null;
    this.fourthDoorPos = null;
    this.portalPos = null;
    if (GameState.dungeon1Cleared) this._spawnNextAreaHook();
    if (GameState.coreCleared) this._spawnHerald();

    this.transitioning = false;

    this._setupCamera();
    this._setupInput();
    this.cameras.main.fadeIn(350, 10, 12, 24);
    playMusic(this, 'music_town');

    initHud(this, () => {
      this.game.events.emit('hud-init', { label: 'ALA CENTRAL — FÁBRICA', showEnemies: false, sceneKey: 'TownScene' });
      this._emitStats();
      if (this._justLoaded) {
        this.game.events.emit('item-pickup', `Progresso carregado — Nível ${GameState.level}.`);
      }
    });
  }

  // Gancho pra próxima ala: um coordenador aparece na Ala Central avisando
  // sobre a próxima área, e uma nova porta surge ao lado dele. O diálogo
  // evolui conforme mais alas vão sendo liberadas/limpas.
  _spawnNextAreaHook() {
    let lines;
    if (!GameState.foundryCleared) {
      lines = [
        'Bom trabalho estabilizando o Setor de Contenção.',
        'Detectamos atividade anômala na Ala de Fundição, ao norte. Liberei uma nova rota de acesso.'
      ];
    } else if (!GameState.reactorCleared) {
      lines = [
        'A Ala de Fundição está estável. Excelente trabalho.',
        'Agora precisamos conter a Ala do Reator — o piso lá está eletrificado, tome cuidado.'
      ];
    } else if (!GameState.coreCleared) {
      lines = [
        'O Reator foi estabilizado. Excelente trabalho.',
        'O Núcleo de Comando parou de responder aos nossos protocolos — parece ter sido comprometido. Liberei acesso.'
      ];
    } else {
      lines = ['O Núcleo de Comando voltou ao normal. Você salvou a fábrica inteira.'];
    }

    this.npcs.push(new NPC(this, this.tileMap, COORDINATOR_SPOT.gx, COORDINATOR_SPOT.gy, {
      id: 'coordenador',
      name: 'Coordenador Voss',
      texture: 'npc_coordinator',
      lines
    }));

    this.nextDoorPos = NEXT_DOOR_POS;
    const world = this.tileMap.gridToWorld(NEXT_DOOR_POS.gx, NEXT_DOOR_POS.gy);
    this.add.image(world.x, world.y, 'light_pool').setDepth(-999).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffd27a);
    this.nextDoorSprite = this.add.image(world.x, world.y, 'door').setDepth(9000).setTint(0xffd27a);
    this.tweens.add({ targets: this.nextDoorSprite, alpha: 0.45, duration: 650, yoyo: true, repeat: -1 });
    this.add.text(world.x, world.y - 22, 'ALA DE FUNDIÇÃO →', {
      fontFamily: 'Courier New', fontSize: '9px', color: '#ffd27a'
    }).setOrigin(0.5).setDepth(9001);

    if (GameState.foundryCleared) this._spawnThirdDoor();
  }

  // Idem, liberado depois que a Ala de Fundição é limpa — leva à Fase 03.
  _spawnThirdDoor() {
    this.thirdDoorPos = THIRD_DOOR_POS;
    const world = this.tileMap.gridToWorld(THIRD_DOOR_POS.gx, THIRD_DOOR_POS.gy);
    this.add.image(world.x, world.y, 'light_pool').setDepth(-999).setBlendMode(Phaser.BlendModes.ADD).setTint(0x9fffff);
    this.thirdDoorSprite = this.add.image(world.x, world.y, 'door').setDepth(9000).setTint(0x9fffff);
    this.tweens.add({ targets: this.thirdDoorSprite, alpha: 0.45, duration: 650, yoyo: true, repeat: -1 });
    this.add.text(world.x, world.y - 22, 'ALA DO REATOR →', {
      fontFamily: 'Courier New', fontSize: '9px', color: '#9fffff'
    }).setOrigin(0.5).setDepth(9001);

    if (GameState.reactorCleared) this._spawnFourthDoor();
  }

  // Idem, liberado depois que a Ala do Reator é limpa — leva à Fase 04.
  _spawnFourthDoor() {
    this.fourthDoorPos = FOURTH_DOOR_POS;
    const world = this.tileMap.gridToWorld(FOURTH_DOOR_POS.gx, FOURTH_DOOR_POS.gy);
    this.add.image(world.x, world.y, 'light_pool').setDepth(-999).setBlendMode(Phaser.BlendModes.ADD).setTint(0xd88bff);
    this.fourthDoorSprite = this.add.image(world.x, world.y, 'door').setDepth(9000).setTint(0xd88bff);
    this.tweens.add({ targets: this.fourthDoorSprite, alpha: 0.45, duration: 650, yoyo: true, repeat: -1 });
    this.add.text(world.x, world.y - 22, 'NÚCLEO DE COMANDO →', {
      fontFamily: 'Courier New', fontSize: '9px', color: '#d88bff'
    }).setOrigin(0.5).setDepth(9001);
  }

  // Emissária Kess — aparece depois que as 4 fases da fábrica estão limpas,
  // se destacando visualmente (maior, brilho pulsante sob os pés) dos
  // outros NPCs da Ala Central. Conversar com ela não é obrigatório pra
  // abrir o teleporte — a chegada dela já libera o portal, como as outras
  // fases liberam suas portas.
  _spawnHerald() {
    const lines = GameState.towerCleared
      ? ['O Distrito Neon te deve uma. A Torre de Segurança nunca mais vai incomodar ninguém.']
      : [
        'Você limpou a fábrica inteira. Impressionante.',
        'Mas a fábrica não é tudo — o Distrito Neon, na cidade, também precisa de ajuda. Abri um teleporte até lá.'
      ];

    const world = this.tileMap.gridToWorld(HERALD_SPOT.gx, HERALD_SPOT.gy);
    const glow = this.add.image(world.x, world.y, 'light_pool').setDepth(-999).setScale(1.3).setBlendMode(Phaser.BlendModes.ADD).setTint(0xff5fd0);
    this.tweens.add({ targets: glow, scale: 1.55, alpha: 0.7, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });

    const herald = new NPC(this, this.tileMap, HERALD_SPOT.gx, HERALD_SPOT.gy, {
      id: 'emissaria',
      name: 'Emissária Kess',
      texture: 'npc_herald',
      lines
    });
    this.tweens.add({ targets: [herald.bodySprite, herald.headSprite], scaleX: 1.06, scaleY: 1.06, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.npcs.push(herald);

    this.portalPos = PORTAL_SPOT;
    const portalWorld = this.tileMap.gridToWorld(PORTAL_SPOT.gx, PORTAL_SPOT.gy);
    this.add.image(portalWorld.x, portalWorld.y, 'light_pool').setDepth(-999).setScale(1.4).setBlendMode(Phaser.BlendModes.ADD).setTint(0xff5fd0);
    this.portalSprite = this.add.image(portalWorld.x, portalWorld.y, 'portal').setDepth(9000);
    this.tweens.add({ targets: this.portalSprite, angle: 360, duration: 3200, repeat: -1 });
    this.tweens.add({ targets: this.portalSprite, scale: 1.08, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.add.text(portalWorld.x, portalWorld.y - 22, 'DISTRITO NEON →', {
      fontFamily: 'Courier New', fontSize: '9px', color: '#ff5fd0'
    }).setOrigin(0.5).setDepth(9001);
  }

  _setupCamera() {
    const { width, height } = this.tileMap.worldBounds();
    this.cameras.main.setBounds(0, 0, width, height);
    this.cameras.main.startFollow(this.player.sprite, true, 0.15, 0.15);
    this.cameras.main.setZoom(1.35);
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

    const doorDist = Math.hypot(this.player.gx - this.doorPos.gx, this.player.gy - this.doorPos.gy);
    if (doorDist < 0.6 && !this.transitioning) {
      this._enterDoor();
    }

    if (this.nextDoorPos && !this.transitioning) {
      const nextDist = Math.hypot(this.player.gx - this.nextDoorPos.gx, this.player.gy - this.nextDoorPos.gy);
      if (nextDist < 0.6) {
        this._enterNextDoor();
      }
    }

    if (this.thirdDoorPos && !this.transitioning) {
      const thirdDist = Math.hypot(this.player.gx - this.thirdDoorPos.gx, this.player.gy - this.thirdDoorPos.gy);
      if (thirdDist < 0.6) {
        this._enterThirdDoor();
      }
    }

    if (this.fourthDoorPos && !this.transitioning) {
      const fourthDist = Math.hypot(this.player.gx - this.fourthDoorPos.gx, this.player.gy - this.fourthDoorPos.gy);
      if (fourthDist < 0.6) {
        this._enterFourthDoor();
      }
    }

    if (this.portalPos && !this.transitioning) {
      const portalDist = Math.hypot(this.player.gx - this.portalPos.gx, this.player.gy - this.portalPos.gy);
      if (portalDist < 0.6) {
        this._enterPortal();
      }
    }
  }

  // Pequena animação de entrada: a porta pisca mais forte, a câmera dá um
  // flash ciano e depois funde pra preto antes de trocar de cena.
  _enterDoor() {
    this.transitioning = true;
    this.player.isMoving = false;
    playSfx(this, 'sfx_door');

    this.tweens.add({ targets: this.doorSprite, scale: 1.35, duration: 200, yoyo: true, ease: 'Cubic.Out' });
    this.cameras.main.flash(150, 24, 232, 255);
    this.cameras.main.fadeOut(420, 10, 12, 24);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.stop('UIScene');
      this.scene.start('DungeonScene');
    });
  }

  // Mesma animação, levando à Ala de Fundição (Fase 02).
  _enterNextDoor() {
    this.transitioning = true;
    this.player.isMoving = false;
    playSfx(this, 'sfx_door');

    this.tweens.add({ targets: this.nextDoorSprite, scale: 1.35, duration: 200, yoyo: true, ease: 'Cubic.Out' });
    this.cameras.main.flash(150, 255, 210, 120);
    this.cameras.main.fadeOut(420, 10, 12, 24);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.stop('UIScene');
      this.scene.start('FoundryScene');
    });
  }

  // Mesma animação, levando à Ala do Reator (Fase 03).
  _enterThirdDoor() {
    this.transitioning = true;
    this.player.isMoving = false;
    playSfx(this, 'sfx_door');

    this.tweens.add({ targets: this.thirdDoorSprite, scale: 1.35, duration: 200, yoyo: true, ease: 'Cubic.Out' });
    this.cameras.main.flash(150, 159, 255, 255);
    this.cameras.main.fadeOut(420, 10, 12, 24);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.stop('UIScene');
      this.scene.start('ReactorScene');
    });
  }

  // Mesma animação, levando ao Núcleo de Comando (Fase 04).
  _enterFourthDoor() {
    this.transitioning = true;
    this.player.isMoving = false;
    playSfx(this, 'sfx_door');

    this.tweens.add({ targets: this.fourthDoorSprite, scale: 1.35, duration: 200, yoyo: true, ease: 'Cubic.Out' });
    this.cameras.main.flash(150, 216, 139, 255);
    this.cameras.main.fadeOut(420, 10, 12, 24);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.stop('UIScene');
      this.scene.start('CoreScene');
    });
  }

  // Transição de teleporte: zoom pro portal + flash colorido, em vez do
  // flash+fade "plano" das portas comuns — reforça que é um teleporte pra
  // outro local da cidade, não uma porta pra outra ala da fábrica.
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
      this.scene.start('DistrictScene');
    });
  }
}
