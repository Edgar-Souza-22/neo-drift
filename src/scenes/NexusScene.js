import Phaser from 'phaser';
import TileMap from '../world/TileMap.js';
import { buildNexusWing } from '../world/NexusLayout.js';
import Player from '../entities/Player.js';
import ShooterDrone from '../entities/ShooterDrone.js';
import PhaseJumper from '../entities/PhaseJumper.js';
import PortalGuardian from '../entities/PortalGuardian.js';
import RouterBoss from '../entities/RouterBoss.js';
import MiniBoss from '../entities/MiniBoss.js';
import NPC from '../entities/NPC.js';
import { DIRECTIONS } from '../utils/constants.js';
import { GameState, equipWeapon, equipArmor, rescueNpc, addInventoryItem, upgradePistol, addAmmo, addStim, addEmpCharge } from '../state/GameState.js';
import { NEXUS_CAPTIVES } from '../state/NexusCaptives.js';
import { initHud } from '../utils/hud.js';
import { playMusic, playSfx } from '../audio/AudioManager.js';

// Uma melhoria de cada tipo, como toda fase — a novidade estrutural aqui são
// os portais, não uma arma nova, então os três itens são upgrades de
// estatística das categorias já existentes (lâmina/pistola/blindagem).
const ITEMS = [
  { id: 'nexus_weapon', markerKey: 'I', texture: 'item_sword', name: 'Lâmina Sincronizada', kind: 'weapon', value: 190, tint: 0x37f0ff },
  { id: 'nexus_pistol', markerKey: 'C', texture: 'item_pistol', name: 'Carregador de Fase', kind: 'pistol', pistolDamage: 78, ammoBonus: 6, tint: 0xff5fd0 },
  { id: 'nexus_armor', markerKey: 'A', texture: 'item_armor', name: 'Blindagem de Sincronia', kind: 'armor', value: 130, tint: 0x9f6fff }
];

const HEAL_AMOUNT = 55;
const AMMO_CHANCE_NORMAL = 0.1;
const BOSS_TRIPLE_AMMO_CHANCE = 1 / 3;
const STIM_DROP_CHANCE = 0.03;
const EMP_DROP_CHANCE = 0.025;

// Portal instável — cicla sozinho entre os 3 destinos (mesmo esqueleto de
// temporização das armadilhas do Arsenal, aqui pra LEITURA/TIMING em vez de
// dano: nenhuma ilha punida por errar o momento, só volta a andar até o pad).
const UNSTABLE_CYCLE_MS = 2400;
const PORTAL_TRIGGER_DIST = 0.4;
const PORTAL_COOLDOWN_MS = 900;

// Painel-alvo do puzzle novo da Sala do Painel — 3 ligados / 2 desligados,
// fixo (não muda entre partidas). Mecanismo diferente da Sala de Sincronia:
// cada painel alterna sozinho (sem propagar pros vizinhos, sem exigir
// ordem), o objetivo é bater com este padrão.
const PANEL_TARGET = [true, false, true, true, false];

const PROPS = [
  { gx: 2, gy: 2, texture: 'prop_crate' },
  { gx: 13, gy: 7, texture: 'prop_pipe' },
  { gx: 13, gy: 17, texture: 'prop_barrel' },
  { gx: 33, gy: 8, texture: 'prop_crate' },
  { gx: 39, gy: 7, texture: 'prop_pipe' },
  { gx: 52, gy: 7, texture: 'prop_barrel' },
  { gx: 26, gy: 28, texture: 'prop_crate' },
  { gx: 9, gy: 28, texture: 'prop_pipe' },
  { gx: 41, gy: 28, texture: 'prop_barrel' },
  { gx: 61, gy: 29, texture: 'prop_crate' },
  { gx: 26, gy: 38, texture: 'prop_pipe' },
  { gx: 9, gy: 52, texture: 'prop_barrel' },
  { gx: 57, gy: 55, texture: 'prop_crate' }
];

export default class NexusScene extends Phaser.Scene {
  constructor() {
    super('NexusScene');
  }

  create() {
    const { grid, markers, zones } = buildNexusWing();
    this.zones = zones;
    this.currentZone = null;
    this.tileMap = new TileMap(this, grid, {
      wallTexture: 'wall_nexus',
      floorTexture: 'floor_nexus',
      floorVariants: [
        { key: 'floor_nexus', weight: 0.85 },
        { key: 'floor_nexus_vent', weight: 0.15 }
      ],
      markers
    });

    for (const prop of PROPS) {
      const world = this.tileMap.gridToWorld(prop.gx, prop.gy);
      this.add.image(world.x, world.y, prop.texture).setOrigin(0.5, 0.85).setDepth(prop.gy * 10 + 2);
    }

    const spawn = this.tileMap.marker('S');
    this.player = new Player(this, this.tileMap, spawn);

    const onEnemyDeath = (enemy) => this._handleEnemyDrop(enemy);
    this.enemies = [
      ...this.tileMap.allMarkers('X').map((m) => new ShooterDrone(this, this.tileMap, m.gx, m.gy, {
        hp: 60, attackDamage: 12, xpReward: 32,
        ammoDropChance: AMMO_CHANCE_NORMAL, onDeath: onEnemyDeath
      })),
      // Saltador de Fase (inimigo novo) — pisca pra dentro/fora de alcance
      // em vez de perseguir normal.
      ...this.tileMap.allMarkers('J').map((m) => new PhaseJumper(this, this.tileMap, m.gx, m.gy, {
        hp: 55, attackDamage: 14, xpReward: 28,
        ammoDropChance: AMMO_CHANCE_NORMAL, onDeath: onEnemyDeath
      }))
    ];

    // Sentinela de Custódia — carrier do Cartão de Custódia (guarda a Sala
    // de Custódia, com a blindagem da fase). Semi-boss genérico, mais fraco
    // que o Guardião do Nexo — é o primeiro cartão-chave da fase, não o
    // último.
    const custodySpawn = this.tileMap.marker('CU');
    this.custodyCarrier = new MiniBoss(this, this.tileMap, custodySpawn.gx, custodySpawn.gy, {
      hp: 150, attackDamage: 18, xpReward: 60, texture: 'enemy_miniboss',
      name: 'SENTINELA DE CUSTÓDIA', onDeath: onEnemyDeath
    });
    this.enemies.push(this.custodyCarrier);

    // Guardião do Nexo — semi-boss que teleporta pra flanquear e invoca
    // Saltadores de Fase via portal. Ao morrer, derruba o Núcleo de
    // Sincronia que abre a Câmara do Roteador.
    const guardianSpawn = this.tileMap.marker('G');
    this.miniBoss = new PortalGuardian(this, this.tileMap, guardianSpawn.gx, guardianSpawn.gy, {
      hp: 400, attackDamage: 24, xpReward: 160,
      name: 'GUARDIÃO DO NEXO', onDeath: onEnemyDeath,
      spawnAdd: (gx, gy) => {
        const add = new PhaseJumper(this, this.tileMap, gx, gy, {
          hp: 40, attackDamage: 10, xpReward: 12, onDeath: onEnemyDeath
        });
        this.enemies.push(add);
        return add;
      }
    });
    this.enemies.push(this.miniBoss);

    const bossSpawn = this.tileMap.marker('B');
    const anchors = this.tileMap.allMarkers('BA');
    this.boss = new RouterBoss(this, this.tileMap, bossSpawn.gx, bossSpawn.gy, {
      hp: 1600, attackDamage: 20, xpReward: 800, anchors,
      texture: 'boss_router', name: 'O ROTEADOR', onDeath: onEnemyDeath
    });
    this.enemies.push(this.boss);

    const bossWorld = this.tileMap.gridToWorld(bossSpawn.gx, bossSpawn.gy);
    this.add.image(bossWorld.x, bossWorld.y, 'light_pool').setDepth(-999).setScale(2.1).setBlendMode(Phaser.BlendModes.ADD).setTint(0x37f0ff);

    const npcSpawns = this.tileMap.allMarkers('N');
    this.npcs = NEXUS_CAPTIVES
      .map((captive, i) => ({ captive, spot: npcSpawns[i] }))
      .filter(({ captive }) => !GameState.rescuedNpcs.has(captive.id))
      .map(({ captive, spot }, i) => new NPC(this, this.tileMap, spot.gx, spot.gy, {
        id: captive.id,
        name: captive.name,
        texture: 'npc_worker',
        lines: captive.dungeonLines,
        tint: i === 1 ? 0xd8b0ff : undefined
      }));

    this.items = ITEMS
      .filter((item) => !GameState.itemsTaken.has(item.id))
      .map((item) => {
        const spot = this.tileMap.marker(item.markerKey);
        const world = this.tileMap.gridToWorld(spot.gx, spot.gy);
        this.add.image(world.x, world.y, 'light_pool').setDepth(-999).setBlendMode(Phaser.BlendModes.ADD);
        const sprite = this.add.image(world.x, world.y, item.texture).setDepth(9000);
        if (item.tint) sprite.setTint(item.tint);
        this.tweens.add({ targets: sprite, y: sprite.y - 5, duration: 700, yoyo: true, repeat: -1 });
        return { ...item, gx: spot.gx, gy: spot.gy, sprite, taken: false };
      });

    // Kits médicos — recuperam HP instantaneamente.
    this.tileMap.allMarkers('H').forEach((spot, i) => {
      const world = this.tileMap.gridToWorld(spot.gx, spot.gy);
      this.add.image(world.x, world.y, 'light_pool').setDepth(-999).setBlendMode(Phaser.BlendModes.ADD).setTint(0xc9b3ff);
      const sprite = this.add.image(world.x, world.y, 'item_medkit').setDepth(9000);
      this.tweens.add({ targets: sprite, y: sprite.y - 5, duration: 700, yoyo: true, repeat: -1 });
      this.items.push({
        id: `nexus_medkit_${i}`, kind: 'heal', amount: HEAL_AMOUNT,
        gx: spot.gx, gy: spot.gy, sprite, taken: false
      });
    });

    this._buildUnlockPuzzle();
    this._buildPanelPuzzle();
    this._buildFixedPortals();
    this._buildUnstablePortal();
    this.puzzleGateOpen = false;

    // Porta selada rumo à Câmara de Portais — abre resolvendo os 4
    // terminais da Sala de Sincronia.
    this.kDoorPos = this.tileMap.marker('K');
    const kWorld = this.tileMap.gridToWorld(this.kDoorPos.gx, this.kDoorPos.gy);
    this.kDoorSprite = this.add.image(kWorld.x, kWorld.y, 'door').setDepth(9000).setTint(0xff4a5e);
    this.kDoorLabel = this.add.text(kWorld.x, kWorld.y - 20, 'SELADA', {
      fontFamily: 'Courier New', fontSize: '8px', color: '#ff8a9c'
    }).setOrigin(0.5).setDepth(9001);
    this.kDoorWarned = false;

    // Porta selada rumo à Sala do Guardião — abre resolvendo o puzzle de
    // painéis (mecanismo novo, ver _buildPanelPuzzle).
    this.wDoorPos = this.tileMap.marker('W');
    const wWorld = this.tileMap.gridToWorld(this.wDoorPos.gx, this.wDoorPos.gy);
    this.wDoorSprite = this.add.image(wWorld.x, wWorld.y, 'door').setDepth(9000).setTint(0xff4a5e);
    this.wDoorLabel = this.add.text(wWorld.x, wWorld.y - 20, 'SELADA', {
      fontFamily: 'Courier New', fontSize: '8px', color: '#ff8a9c'
    }).setOrigin(0.5).setDepth(9001);
    this.wDoorWarned = false;

    // Porta selada da Sala de Custódia — abre com o Cartão de Custódia
    // derrubado pela Sentinela de Custódia (guarda a blindagem da fase).
    this.custodyKeycardCarrier = this.custodyCarrier;
    this.hasCustodyCard = false;
    this.custodyCardDropped = false;
    this.custodyDoorUnlocked = false;
    this.custodyDoorWarned = false;

    this.custodyDoorPos = this.tileMap.marker('CD');
    const custodyWorld = this.tileMap.gridToWorld(this.custodyDoorPos.gx, this.custodyDoorPos.gy);
    this.custodyDoorSprite = this.add.image(custodyWorld.x, custodyWorld.y, 'door').setDepth(9000).setTint(0xff4a5e);
    this.custodyDoorLabel = this.add.text(custodyWorld.x, custodyWorld.y - 20, 'SELADA', {
      fontFamily: 'Courier New', fontSize: '8px', color: '#ff8a9c'
    }).setOrigin(0.5).setDepth(9001);

    // Porta selada da Câmara do Roteador — abre com o Núcleo de Sincronia
    // derrubado pelo Guardião do Nexo.
    this.guardianKeycardCarrier = this.miniBoss;
    this.hasSyncCore = false;
    this.syncCoreDropped = false;
    this.bossDoorUnlocked = false;
    this.bossDoorWarned = false;

    this.bossDoorPos = this.tileMap.marker('L');
    const doorWorld = this.tileMap.gridToWorld(this.bossDoorPos.gx, this.bossDoorPos.gy);
    this.bossDoorSprite = this.add.image(doorWorld.x, doorWorld.y, 'door').setDepth(9000).setTint(0xff4a5e);
    this.bossDoorLabel = this.add.text(doorWorld.x, doorWorld.y - 20, 'SELADA', {
      fontFamily: 'Courier New', fontSize: '8px', color: '#ff8a9c'
    }).setOrigin(0.5).setDepth(9001);

    this.levelEnded = false;
    this.transitioning = false;
    this.returnDoorPos = null;
    this._lastRemaining = null;

    this._setupCamera();
    this._setupInput();
    this.cameras.main.fadeIn(350, 10, 12, 24);
    playMusic(this, 'music_nexus');

    initHud(this, () => {
      this.game.events.emit('hud-init', { label: 'NEXO DE TRANSPORTE', showEnemies: true, sceneKey: 'NexusScene' });
      this._emitStats();
      this.game.events.emit('enemies-remaining', this.enemies.length);
    });
  }

  // Sala de Sincronia: 4 terminais na ordem correta (marcador 'Q', a ordem
  // do array é a ordem certa) — mesmo mecanismo já usado na Torre/Arsenal,
  // reskinado como console de roteamento de portal.
  _buildUnlockPuzzle() {
    this.terminals = this.tileMap.allMarkers('Q').map((spot, i) => {
      const world = this.tileMap.gridToWorld(spot.gx, spot.gy);
      const sprite = this.add.image(world.x, world.y, 'tile_sequence_off').setDepth(spot.gy * 10 + 1);
      const label = this.add.text(world.x, world.y, String(i + 1), {
        fontFamily: 'Courier New', fontSize: '16px', color: '#9fb0d0'
      }).setOrigin(0.5).setDepth(spot.gy * 10 + 2);
      const glow = this.add.image(world.x, world.y, 'light_pool')
        .setBlendMode(Phaser.BlendModes.ADD).setTint(0x9f6fff).setScale(0.6).setDepth(9500).setVisible(false);
      return { order: i + 1, gx: spot.gx, gy: spot.gy, sprite, label, glow, wasOn: false };
    });
    this.unlockProgress = 0;
    this.puzzleSolved = false;
  }

  _paintTerminal(terminal, lit) {
    terminal.sprite.setTexture(lit ? 'tile_sequence_on' : 'tile_sequence_off');
    terminal.glow.setVisible(lit);
    terminal.label.setColor(lit ? '#0a0c18' : '#9fb0d0');
  }

  _checkUnlockPuzzle() {
    if (this.puzzleSolved) return;
    for (const terminal of this.terminals) {
      const dist = Math.hypot(this.player.gx - terminal.gx, this.player.gy - terminal.gy);
      const on = dist < 0.55;
      if (on && !terminal.wasOn) {
        if (terminal.order === this.unlockProgress + 1) {
          this.unlockProgress++;
          this._paintTerminal(terminal, true);
          playSfx(this, 'sfx_menu_open', { volume: 0.4 });
          if (this.unlockProgress === this.terminals.length) {
            this.puzzleSolved = true;
            this.game.events.emit('item-pickup', 'Roteamento sincronizado!');
            this._checkPuzzleGate();
          } else {
            this.game.events.emit('item-pickup', `Terminal ${terminal.order} ativado. (${this.unlockProgress}/${this.terminals.length})`);
          }
        } else {
          const wasProgressing = this.unlockProgress > 0;
          this.unlockProgress = terminal.order === 1 ? 1 : 0;
          for (const t of this.terminals) this._paintTerminal(t, t.order <= this.unlockProgress);
          if (wasProgressing) {
            playSfx(this, 'sfx_player_hurt', { volume: 0.3 });
            this.game.events.emit('item-pickup', 'Ordem errada! Reiniciando...');
          }
        }
      }
      terminal.wasOn = on;
    }
  }

  _checkPuzzleGate() {
    if (this.puzzleGateOpen) return;
    if (!this.puzzleSolved) return;
    this.puzzleGateOpen = true;
    this.tileMap.setWalkable(this.kDoorPos.gx, this.kDoorPos.gy, true);
    this.kDoorSprite.setTint(0x9f6fff);
    this.kDoorLabel.setText('ABERTA');
    playSfx(this, 'sfx_pickup');
    this.game.events.emit('item-pickup', 'Roteamento liberou o acesso à Sala do Guardião!');
  }

  _checkKDoor() {
    if (this.puzzleGateOpen || this.kDoorWarned) return;
    const dist = Math.hypot(this.player.gx - this.kDoorPos.gx, this.player.gy - this.kDoorPos.gy);
    if (dist < 1.2) {
      this.kDoorWarned = true;
      this.game.events.emit('dialogue', 'Acesso bloqueado. O roteamento ainda não reconhece você.');
    }
  }

  // Sala do Painel — mecanismo NOVO, diferente da Sala de Sincronia: 5
  // painéis independentes (nenhuma ordem, nenhuma propagação pros vizinhos),
  // cada um alterna on/off sozinho ao ser pisado. Objetivo é bater com o
  // padrão-alvo fixo mostrado no rótulo — gateia banda2 -> banda3.
  _buildPanelPuzzle() {
    const spots = this.tileMap.allMarkers('PN');
    this.panels = spots.map((spot, i) => {
      const world = this.tileMap.gridToWorld(spot.gx, spot.gy);
      const sprite = this.add.image(world.x, world.y, 'tile_circuit_off').setDepth(spot.gy * 10 + 1);
      const glow = this.add.image(world.x, world.y, 'light_pool')
        .setBlendMode(Phaser.BlendModes.ADD).setTint(0x37f0ff).setScale(0.6).setDepth(9500).setVisible(false);
      return { gx: spot.gx, gy: spot.gy, sprite, glow, on: false, wasOn: false, target: PANEL_TARGET[i] };
    });

    const first = this.tileMap.gridToWorld(spots[0].gx, spots[0].gy);
    const targetStr = PANEL_TARGET.map((t) => (t ? '●' : '○')).join(' ');
    this.add.text(first.x - 6, first.y - 26, `ALVO: ${targetStr}`, {
      fontFamily: 'Courier New', fontSize: '9px', color: '#9fb0d0'
    }).setDepth(9001);

    this.panelSolved = false;
    this.panelGateOpen = false;
  }

  _checkPanelPuzzle() {
    if (this.panelSolved) return;
    for (const panel of this.panels) {
      const dist = Math.hypot(this.player.gx - panel.gx, this.player.gy - panel.gy);
      const near = dist < 0.55;
      if (near && !panel.wasOn) {
        panel.on = !panel.on;
        panel.sprite.setTexture(panel.on ? 'tile_circuit_on' : 'tile_circuit_off');
        panel.glow.setVisible(panel.on);
        playSfx(this, 'sfx_menu_open', { volume: 0.35 });

        if (this.panels.every((p) => p.on === p.target)) {
          this.panelSolved = true;
          this.game.events.emit('item-pickup', 'Painel sincronizado!');
          this._checkPanelGate();
        }
      }
      panel.wasOn = near;
    }
  }

  _checkPanelGate() {
    if (this.panelGateOpen) return;
    if (!this.panelSolved) return;
    this.panelGateOpen = true;
    this.tileMap.setWalkable(this.wDoorPos.gx, this.wDoorPos.gy, true);
    this.wDoorSprite.setTint(0x37f0ff);
    this.wDoorLabel.setText('ABERTA');
    playSfx(this, 'sfx_pickup');
    this.game.events.emit('item-pickup', 'Painel liberou o acesso à Sala do Guardião!');
  }

  _checkWDoor() {
    if (this.panelGateOpen || this.wDoorWarned) return;
    const dist = Math.hypot(this.player.gx - this.wDoorPos.gx, this.player.gy - this.wDoorPos.gy);
    if (dist < 1.2) {
      this.wDoorWarned = true;
      this.game.events.emit('dialogue', 'Acesso bloqueado. O painel ainda não está sincronizado.');
    }
  }

  _checkCustodyKeycardDrop() {
    if (!this.custodyKeycardCarrier || this.custodyCardDropped || this.custodyKeycardCarrier.alive) return;
    this.custodyCardDropped = true;
    const world = this.tileMap.gridToWorld(this.custodyKeycardCarrier.gx, this.custodyKeycardCarrier.gy);
    const sprite = this.add.image(world.x, world.y, 'item_keycard').setDepth(9000).setTint(0xffcf3d);
    this.tweens.add({ targets: sprite, y: sprite.y - 5, duration: 700, yoyo: true, repeat: -1 });
    this.items.push({
      id: 'nexus_custody_card',
      kind: 'custody_card',
      gx: this.custodyKeycardCarrier.gx,
      gy: this.custodyKeycardCarrier.gy,
      sprite,
      taken: false
    });
    playSfx(this, 'sfx_pickup');
    this.game.events.emit('item-pickup', 'A Sentinela de Custódia derrubou um Cartão de Custódia!');
  }

  _checkCustodyDoor() {
    if (this.custodyDoorUnlocked) return;
    const dist = Math.hypot(this.player.gx - this.custodyDoorPos.gx, this.player.gy - this.custodyDoorPos.gy);
    if (dist > 1.2) return;

    if (this.hasCustodyCard) {
      this.custodyDoorUnlocked = true;
      this.tileMap.setWalkable(this.custodyDoorPos.gx, this.custodyDoorPos.gy, true);
      this.custodyDoorSprite.setTint(0xffcf3d);
      this.custodyDoorLabel.setText('ABERTA');
      playSfx(this, 'sfx_pickup');
      this.game.events.emit('item-pickup', 'Sala de Custódia destrancada!');
    } else if (!this.custodyDoorWarned) {
      this.custodyDoorWarned = true;
      this.game.events.emit('dialogue', 'Acesso trancado: requer um Cartão de Custódia.');
    }
  }

  // Portais fixos — pares bidirecionais que ligam setores não-adjacentes do
  // mapa (ver NexusLayout.js). Cada pad teleporta pro par correspondente,
  // com um cooldown curto em AMBOS os lados pra não ficar indo e voltando
  // no mesmo instante.
  _buildFixedPortals() {
    const pads = this.tileMap.allMarkers('PF');
    const byPair = new Map();
    for (const pad of pads) {
      if (!byPair.has(pad.pair)) byPair.set(pad.pair, []);
      byPair.get(pad.pair).push(pad);
    }

    this.fixedPortals = [];
    for (const [, pair] of byPair) {
      const [a, b] = pair;
      for (const [from, to] of [[a, b], [b, a]]) {
        const world = this.tileMap.gridToWorld(from.gx, from.gy);
        this.add.image(world.x, world.y, 'light_pool').setDepth(-999).setScale(1.3).setBlendMode(Phaser.BlendModes.ADD).setTint(0x9f6fff);
        const sprite = this.add.image(world.x, world.y, 'portal').setDepth(9000).setScale(0.7).setTint(0x9f6fff);
        this.tweens.add({ targets: sprite, angle: 360, duration: 3400, repeat: -1 });
        this.fixedPortals.push({ gx: from.gx, gy: from.gy, targetGx: to.gx, targetGy: to.gy, sprite, cooldownUntil: 0 });
      }
    }
  }

  _updateFixedPortals() {
    const now = this.time.now;
    for (const portal of this.fixedPortals) {
      if (now < portal.cooldownUntil) continue;
      const dist = Math.hypot(this.player.gx - portal.gx, this.player.gy - portal.gy);
      if (dist < PORTAL_TRIGGER_DIST) {
        this.player.gx = portal.targetGx;
        this.player.gy = portal.targetGy;
        playSfx(this, 'sfx_door', { volume: 0.4 });
        this.cameras.main.flash(120, 159, 111, 255);
        portal.cooldownUntil = now + PORTAL_COOLDOWN_MS;
        const twin = this.fixedPortals.find((p) => p.gx === portal.targetGx && p.gy === portal.targetGy);
        if (twin) twin.cooldownUntil = now + PORTAL_COOLDOWN_MS;
      }
    }
  }

  // Portal instável — 1 pad de origem cicla sozinho entre os 3 destinos
  // (troca de cor pra indicar o alvo ativo); pisar na origem enquanto um
  // destino está ativo manda pra lá, pisar em qualquer destino manda de
  // volta pra origem. Nenhuma penalidade por errar o momento.
  _buildUnstablePortal() {
    const all = this.tileMap.allMarkers('PU');
    const sourceSpot = all.find((m) => m.role === 'source');
    const destSpots = all.filter((m) => m.role === 'dest');
    const destColors = [0x37f0ff, 0xffcf3d, 0xff5fd0];
    const dropKinds = [
      { kind: 'stim', texture: 'item_stim', amount: 1 },
      { kind: 'emp', texture: 'item_emp', amount: 1 },
      { kind: 'ammo', texture: 'item_ammo', amount: 2 }
    ];

    const sourceWorld = this.tileMap.gridToWorld(sourceSpot.gx, sourceSpot.gy);
    this.add.image(sourceWorld.x, sourceWorld.y, 'light_pool').setDepth(-999).setScale(1.3).setBlendMode(Phaser.BlendModes.ADD);
    const sourceSprite = this.add.image(sourceWorld.x, sourceWorld.y, 'portal').setDepth(9000).setScale(0.75);
    this.tweens.add({ targets: sourceSprite, angle: 360, duration: 2000, repeat: -1 });

    const dests = destSpots.map((spot, i) => {
      const world = this.tileMap.gridToWorld(spot.gx, spot.gy);
      const sprite = this.add.image(world.x, world.y, 'portal').setDepth(9000).setScale(0.55).setTint(destColors[i]).setAlpha(0.35);
      this.tweens.add({ targets: sprite, angle: 360, duration: 2600, repeat: -1 });

      const drop = dropKinds[i];
      const dropWorld = this.tileMap.gridToWorld(spot.gx, spot.gy + 1.4);
      const dropSprite = this.add.image(dropWorld.x, dropWorld.y, drop.texture).setDepth(9000);
      this.tweens.add({ targets: dropSprite, y: dropSprite.y - 5, duration: 700, yoyo: true, repeat: -1 });
      this.items.push({
        id: `nexus_unstable_drop_${i}`, kind: drop.kind, amount: drop.amount,
        gx: spot.gx, gy: spot.gy + 1.4, sprite: dropSprite, taken: false
      });

      return { gx: spot.gx, gy: spot.gy, sprite, color: destColors[i] };
    });

    this.unstablePortal = {
      source: { gx: sourceSpot.gx, gy: sourceSpot.gy, sprite: sourceSprite },
      dests,
      activeIndex: 0,
      lastSwitchAt: 0,
      cooldownUntil: 0
    };
  }

  _updateUnstablePortal() {
    const now = this.time.now;
    const u = this.unstablePortal;

    if (now - u.lastSwitchAt > UNSTABLE_CYCLE_MS) {
      u.lastSwitchAt = now;
      u.activeIndex = (u.activeIndex + 1) % u.dests.length;
      for (let i = 0; i < u.dests.length; i++) {
        u.dests[i].sprite.setAlpha(i === u.activeIndex ? 1 : 0.35);
      }
      u.source.sprite.setTint(u.dests[u.activeIndex].color);
    }

    if (now < u.cooldownUntil) return;

    const distSource = Math.hypot(this.player.gx - u.source.gx, this.player.gy - u.source.gy);
    if (distSource < PORTAL_TRIGGER_DIST) {
      const target = u.dests[u.activeIndex];
      this.player.gx = target.gx;
      this.player.gy = target.gy;
      playSfx(this, 'sfx_door', { volume: 0.4 });
      this.cameras.main.flash(120, 255, 255, 255);
      u.cooldownUntil = now + PORTAL_COOLDOWN_MS;
      return;
    }

    for (const dest of u.dests) {
      const dist = Math.hypot(this.player.gx - dest.gx, this.player.gy - dest.gy);
      if (dist < PORTAL_TRIGGER_DIST) {
        this.player.gx = u.source.gx;
        this.player.gy = u.source.gy;
        playSfx(this, 'sfx_door', { volume: 0.4 });
        u.cooldownUntil = now + PORTAL_COOLDOWN_MS;
        return;
      }
    }
  }

  _checkGuardianKeycardDrop() {
    if (!this.guardianKeycardCarrier || this.syncCoreDropped || this.guardianKeycardCarrier.alive) return;
    this.syncCoreDropped = true;
    const world = this.tileMap.gridToWorld(this.guardianKeycardCarrier.gx, this.guardianKeycardCarrier.gy);
    const sprite = this.add.image(world.x, world.y, 'item_keycard').setDepth(9000).setTint(0xff5fd0);
    this.tweens.add({ targets: sprite, y: sprite.y - 5, duration: 700, yoyo: true, repeat: -1 });
    this.items.push({
      id: 'nexus_sync_core',
      kind: 'sync_core',
      gx: this.guardianKeycardCarrier.gx,
      gy: this.guardianKeycardCarrier.gy,
      sprite,
      taken: false
    });
    playSfx(this, 'sfx_pickup');
    this.game.events.emit('item-pickup', 'O Guardião do Nexo derrubou um Núcleo de Sincronia!');
  }

  _checkBossDoor() {
    if (this.bossDoorUnlocked) return;
    const dist = Math.hypot(this.player.gx - this.bossDoorPos.gx, this.player.gy - this.bossDoorPos.gy);
    if (dist > 1.2) return;

    if (this.hasSyncCore) {
      this.bossDoorUnlocked = true;
      this.tileMap.setWalkable(this.bossDoorPos.gx, this.bossDoorPos.gy, true);
      this.bossDoorSprite.setTint(0x37f0ff);
      this.bossDoorLabel.setText('ABERTA');
      playSfx(this, 'sfx_pickup');
      this.game.events.emit('item-pickup', 'Câmara do Roteador destrancada!');
    } else if (!this.bossDoorWarned) {
      this.bossDoorWarned = true;
      this.game.events.emit('dialogue', 'Acesso trancado: requer um Núcleo de Sincronia.');
    }
  }

  _setupCamera() {
    const { width, height } = this.tileMap.worldBounds();
    this.cameras.main.setBounds(0, 0, width, height);
    this.cameras.main.startFollow(this.player.sprite, true, 0.12, 0.12);
    this.cameras.main.setZoom(1.15);
  }

  _setupInput() {
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D,SPACE,F,Q,E');
    this.input.keyboard.on('keydown-SPACE', () => this._onSpace());
    this.input.keyboard.on('keydown-F', () => this._onFire());
    this.input.keyboard.on('keydown-Q', () => this._onStim());
    this.input.keyboard.on('keydown-E', () => this._onEmp());
    this.input.mouse.disableContextMenu();
    this.input.on('pointerdown', (pointer) => {
      if (pointer.rightButtonDown()) this._onFire();
      else this._onSpace();
    });
  }

  _onStim() {
    if (this.levelEnded || !this.player.alive) return;
    if (this.player.tryUseStim()) this._emitStats();
  }

  _onEmp() {
    if (this.levelEnded || !this.player.alive) return;
    if (this.player.tryUseEmp(this.enemies)) this._emitStats();
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

  _onSpace() {
    if (this.levelEnded || !this.player.alive) return;
    const npc = this._nearestNpc();
    if (npc) {
      this.game.events.emit('dialogue', npc.currentLine());
      return;
    }
    this.player.tryAttack(this.enemies);
    this._emitStats();
  }

  _onFire() {
    if (this.levelEnded || !this.player.alive) return;
    this.player.tryRangedAttack();
    this._emitStats();
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

  _checkItemPickups() {
    for (const item of this.items) {
      if (item.taken) continue;
      const dist = Math.hypot(this.player.gx - item.gx, this.player.gy - item.gy);
      if (dist < 0.6) {
        item.taken = true;
        item.sprite.destroy();
        playSfx(this, 'sfx_pickup');

        if (item.kind === 'ammo') {
          addAmmo(item.amount);
          this.game.events.emit('item-pickup', `+${item.amount} munição da pistola.`);
          this._emitStats();
          continue;
        }

        if (item.kind === 'sync_core') {
          this.hasSyncCore = true;
          addInventoryItem({ id: 'sync_core', name: 'Núcleo de Sincronia', icon: 'item_keycard' });
          this.game.events.emit('item-pickup', 'Núcleo de Sincronia coletado! A Câmara do Roteador pode ser destrancada.');
          continue;
        }

        if (item.kind === 'custody_card') {
          this.hasCustodyCard = true;
          addInventoryItem({ id: 'custody_card', name: 'Cartão de Custódia', icon: 'item_keycard' });
          this.game.events.emit('item-pickup', 'Cartão de Custódia coletado! A Sala de Custódia pode ser destrancada.');
          continue;
        }

        if (item.kind === 'stim') {
          addStim(item.amount);
          this.game.events.emit('item-pickup', `+${item.amount} carga de Estimulante (tecla Q).`);
          continue;
        }

        if (item.kind === 'emp') {
          addEmpCharge(item.amount);
          this.game.events.emit('item-pickup', `+${item.amount} carga de Granada EMP (tecla E).`);
          continue;
        }

        if (item.kind === 'heal') {
          const before = this.player.hp;
          this.player.hp = Math.min(this.player.maxHp, this.player.hp + item.amount);
          GameState.hp = this.player.hp;
          const healed = this.player.hp - before;
          this.game.events.emit('item-pickup', healed > 0 ? `+${healed} HP recuperado!` : 'HP já estava no máximo.');
          this._emitStats();
          continue;
        }

        if (item.kind === 'pistol') {
          GameState.itemsTaken.add(item.id);
          // Preserva o rangedKind ATUAL do jogador se o item não especificar
          // um novo (este upgrade é só de dano/munição, não de comportamento
          // de disparo) — nunca reverte SMG/shotgun/railgun de volta pra
          // pistola simples.
          const firstTime = upgradePistol(item.name, item.pistolDamage, item.rangedKind || GameState.rangedKind, item.ammoBonus || 3);
          this.game.events.emit('item-pickup', firstTime
            ? `${item.name} equipada! Pressione F ou clique direito para atirar.`
            : `${item.name} equipada! Munição/dano aumentados.`);
          this._emitStats();
          continue;
        }

        GameState.itemsTaken.add(item.id);
        if (item.kind === 'weapon') {
          equipWeapon(item.name, item.value, item.meleeKind || GameState.weaponKind);
          this.game.events.emit('item-pickup', `${item.name} equipada! Dano de ataque aumentado.`);
        } else {
          equipArmor(item.name, item.value);
          this.player.maxHp = GameState.maxHp;
          this.player.hp = GameState.hp;
          this.game.events.emit('item-pickup', `${item.name} equipada! HP máximo aumentado.`);
        }
        this._emitStats();
      }
    }
  }

  _spawnDrop(kind, texture, amount, gx, gy) {
    const world = this.tileMap.gridToWorld(gx, gy);
    const sprite = this.add.image(world.x, world.y, texture).setDepth(9000);
    this.tweens.add({ targets: sprite, y: sprite.y - 5, duration: 700, yoyo: true, repeat: -1 });
    this.items.push({
      id: `${kind}-${Math.random().toString(36).slice(2)}`,
      kind, amount, gx, gy, sprite, taken: false
    });
  }

  _handleEnemyDrop(enemy) {
    playSfx(this, enemy.isBoss ? 'sfx_boss_die' : 'sfx_enemy_die');

    if (enemy.isBoss) {
      const amount = Math.random() < BOSS_TRIPLE_AMMO_CHANCE ? 3 : 1;
      this._spawnDrop('ammo', 'item_ammo', amount, enemy.gx, enemy.gy);
      this._spawnDrop('stim', 'item_stim', 1, enemy.gx - 0.4, enemy.gy);
      this._spawnDrop('emp', 'item_emp', 1, enemy.gx + 0.4, enemy.gy);
      return;
    }

    if (Math.random() < (enemy.ammoDropChance || 0)) {
      this._spawnDrop('ammo', 'item_ammo', 1, enemy.gx, enemy.gy);
      return;
    }
    if (Math.random() < STIM_DROP_CHANCE) {
      this._spawnDrop('stim', 'item_stim', 1, enemy.gx, enemy.gy);
      return;
    }
    if (Math.random() < EMP_DROP_CHANCE) {
      this._spawnDrop('emp', 'item_emp', 1, enemy.gx, enemy.gy);
    }
  }

  _updateZone() {
    const zone = this.zones.find(
      (z) => this.player.gx >= z.x1 && this.player.gx < z.x2 && this.player.gy >= z.y1 && this.player.gy < z.y2
    );
    const name = zone ? zone.name : this.currentZone;
    if (name && name !== this.currentZone) {
      this.currentZone = name;
      this.game.events.emit('zone-changed', name);
    }
  }

  update(time, delta) {
    if (this.transitioning) return;
    const deltaSec = Math.min(delta, 50) / 1000;

    if (this.player.alive) {
      const { dx, dy } = this._readMoveVector();
      this.player.move(dx, dy, deltaSec);
    }
    this.player.update();
    // Roda ANTES do corte de "fase encerrada" — sem isso, o loot que o
    // próprio golpe final derruba nunca podia ser coletado.
    this._checkItemPickups();

    if (this.levelEnded) {
      if (this.returnDoorPos) this._checkReturnDoor();
      return;
    }
    this._checkUnlockPuzzle();
    this._checkPanelPuzzle();
    this._updateFixedPortals();
    this._updateUnstablePortal();
    this._checkKDoor();
    this._checkWDoor();
    this._checkCustodyKeycardDrop();
    this._checkCustodyDoor();
    this._checkGuardianKeycardDrop();
    this._checkBossDoor();
    this._updateZone();
    for (const npc of this.npcs) {
      npc.update();
      npc.setHighlighted(npc.isNear(this.player));
    }

    let remaining = 0;
    for (const enemy of this.enemies) {
      enemy.update(deltaSec, this.player);
      if (enemy.alive) remaining++;
    }
    this.player.updateBullets(deltaSec, this.enemies);

    if (remaining !== this._lastRemaining) {
      this._lastRemaining = remaining;
      this.game.events.emit('enemies-remaining', remaining);
    }

    if (this.player.leveledUpThisFrame) {
      this.player.leveledUpThisFrame = false;
      this.game.events.emit('level-up', GameState.level);
    }

    this._emitStats();

    if (!this.player.alive) {
      this._endLevel(false);
      return;
    }

    if (remaining === 0) {
      this._endLevel(true);
    }
  }

  _endLevel(victory) {
    this.levelEnded = true;
    this.game.events.emit(victory ? 'level-complete' : 'game-over');
    if (victory) {
      GameState.nexusCleared = true;
      for (const captive of NEXUS_CAPTIVES) rescueNpc(captive.id);
      this._spawnReturnDoor();
    }
  }

  // Porta que aparece na sala do chefe após a vitória, levando de volta ao
  // Distrito Neon.
  _spawnReturnDoor() {
    this.returnDoorPos = { gx: this.boss.spawn.gx, gy: this.boss.spawn.gy + 1 };
    const world = this.tileMap.gridToWorld(this.returnDoorPos.gx, this.returnDoorPos.gy);
    this.returnDoorSprite = this.add.image(world.x, world.y, 'door').setDepth(9000);
    this.tweens.add({ targets: this.returnDoorSprite, alpha: 0.45, duration: 650, yoyo: true, repeat: -1 });
    this.add.text(world.x, world.y - 20, 'DISTRITO NEON ←', {
      fontFamily: 'Courier New', fontSize: '8px', color: '#ff5fd0'
    }).setOrigin(0.5).setDepth(9001);
  }

  _checkReturnDoor() {
    const dist = Math.hypot(this.player.gx - this.returnDoorPos.gx, this.player.gy - this.returnDoorPos.gy);
    if (dist < 0.6) this._enterReturnDoor();
  }

  _enterReturnDoor() {
    this.transitioning = true;
    this.player.isMoving = false;
    playSfx(this, 'sfx_door');

    this.tweens.add({ targets: this.returnDoorSprite, scale: 1.35, duration: 200, yoyo: true, ease: 'Cubic.Out' });
    this.cameras.main.flash(150, 55, 240, 255);
    this.cameras.main.fadeOut(420, 10, 12, 24);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.stop('UIScene');
      this.scene.start('DistrictScene');
    });
  }
}
