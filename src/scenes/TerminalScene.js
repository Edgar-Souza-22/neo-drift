import Phaser from 'phaser';
import TileMap from '../world/TileMap.js';
import { buildTerminalYard } from '../world/TerminalLayout.js';
import Player from '../entities/Player.js';
import CargoDrone from '../entities/CargoDrone.js';
import StackerEnemy from '../entities/StackerEnemy.js';
import EstivadorBoss from '../entities/EstivadorBoss.js';
import EmpilhadorBoss from '../entities/EmpilhadorBoss.js';
import NPC from '../entities/NPC.js';
import { DIRECTIONS, TILE_SIZE } from '../utils/constants.js';
import { GameState, equipWeapon, equipArmor, equipBoots, rescueNpc, upgradePistol, addAmmo, addStim, addEmpCharge, saveGame } from '../state/GameState.js';
import { TERMINAL_CAPTIVES } from '../state/TerminalCaptives.js';
import { initHud } from '../utils/hud.js';
import { playMusic, playSfx } from '../audio/AudioManager.js';

// Botas de Impulso: primeira fase do Estaleiro Automatizado (4ª região) —
// maior bônus até agora (1.15 -> 1.25 -> 1.35 -> 1.45), ver nota em
// DungeonScene.js. Ficam na Câmara do Estivador, do outro lado da ponte
// levadiça: são a recompensa por baixar a Ponte.
const ITEMS = [
  { id: 'terminal_weapon', markerKey: 'I', texture: 'item_sword', name: 'Lâmina de Estiva', kind: 'weapon', value: 330, tint: 0xe8923d },
  { id: 'terminal_pistol', markerKey: 'C', texture: 'item_pistol', name: 'Pistola Hidráulica', kind: 'pistol', pistolDamage: 126, ammoBonus: 6, tint: 0xe8923d },
  { id: 'terminal_armor', markerKey: 'A', texture: 'item_armor', name: 'Colete de Estiva', kind: 'armor', value: 220, tint: 0xe8923d },
  { id: 'terminal_boots', markerKey: 'P', texture: 'item_boots', name: 'Botas Magnéticas de Estiva', kind: 'boots', speedMul: 1.45, tint: 0xe8923d }
];

const HEAL_AMOUNT = 70;
const AMMO_CHANCE_NORMAL = 0.1;
const AMMO_CHANCE_TANK = 0.2;
const BOSS_TRIPLE_AMMO_CHANCE = 1 / 3;
const STIM_DROP_CHANCE = 0.03;
const EMP_DROP_CHANCE = 0.025;

// Guindaste solto: contêineres despencam sozinhos pelo pátio até a chave ser
// puxada. Telégrafo (aro + sombra caindo) -> impacto (dano em quem ficou) ->
// contêiner vira parede por um tempo curto.
const CRANE_TELEGRAPH_MS = 900;
const CRANE_DROP_DAMAGE = 26;
const CRANE_DROP_WALL_MS = 1700;
const CRANE_DROP_RADIUS = 0.75;

const ACCENT = 0xe8923d;

const PROPS = [
  { gx: 14, gy: 38, texture: 'prop_container' },
  { gx: 40, gy: 39, texture: 'prop_container' },
  { gx: 13, gy: 11, texture: 'prop_barrel' },
  { gx: 50, gy: 11, texture: 'prop_crate' },
  { gx: 25, gy: 43, texture: 'prop_console' },
  { gx: 60, gy: 33, texture: 'prop_crate' },
  { gx: 22, gy: 3, texture: 'prop_barrel' },
  { gx: 44, gy: 6, texture: 'prop_pipe' }
];

export default class TerminalScene extends Phaser.Scene {
  constructor() {
    super('TerminalScene');
  }

  create() {
    const { grid, markers, zones, bridge, cargoRoutes } = buildTerminalYard();
    this.zones = zones;
    this.currentZone = null;
    this.bridgeDef = bridge;
    this.cargoRoutes = cargoRoutes;
    this.tileMap = new TileMap(this, grid, {
      wallTexture: 'wall_estaleiro',
      floorTexture: 'floor_estaleiro',
      floorVariants: [
        { key: 'floor_estaleiro', weight: 0.72 },
        { key: 'floor_estaleiro_stripe', weight: 0.28 }
      ],
      markers
    });

    for (const prop of PROPS) {
      const world = this.tileMap.gridToWorld(prop.gx, prop.gy);
      const tex = this.textures.exists(prop.texture) ? prop.texture : 'prop_crate';
      this.add.image(world.x, world.y, tex).setOrigin(0.5, 0.85).setDepth(prop.gy * 10 + 2);
    }

    const spawn = this.tileMap.marker('S');
    this.player = new Player(this, this.tileMap, spawn);

    const onEnemyDeath = (enemy) => this._handleEnemyDrop(enemy);
    this.enemies = [
      ...this.tileMap.allMarkers('X').map((m) => new CargoDrone(this, this.tileMap, m.gx, m.gy, {
        hp: 62, speed: 2.05, attackDamage: 18, xpReward: 32,
        ammoDropChance: AMMO_CHANCE_NORMAL, onDeath: onEnemyDeath,
        route: this.cargoRoutes[m.route] || this.cargoRoutes[0]
      })),
      ...this.tileMap.allMarkers('T').map((m) => new StackerEnemy(this, this.tileMap, m.gx, m.gy, {
        hp: 240, speed: 1.12, attackDamage: 34, xpReward: 75, hpBarWidth: 32,
        ammoDropChance: AMMO_CHANCE_TANK, onDeath: onEnemyDeath
      })),
      // 6 guardas fortes da Sala do Guindaste — só engajam quando o puzzle
      // das travas abre o portão. Contam na limpeza da fase como qualquer
      // inimigo, então derrubar o guindaste é parada obrigatória.
      ...this.tileMap.allMarkers('GD').map((m) => new StackerEnemy(this, this.tileMap, m.gx, m.gy, {
        hp: 320, speed: 1.16, attackDamage: 40, xpReward: 100, hpBarWidth: 36,
        ammoDropChance: AMMO_CHANCE_TANK, onDeath: onEnemyDeath
      }))
    ];

    const subSpawn = this.tileMap.marker('M');
    this.subChefe = new EstivadorBoss(this, this.tileMap, subSpawn.gx, subSpawn.gy, {
      onDeath: onEnemyDeath
    });
    this.enemies.push(this.subChefe);

    const bossSpawn = this.tileMap.marker('B');
    this.boss = new EmpilhadorBoss(this, this.tileMap, bossSpawn.gx, bossSpawn.gy, {
      onDeath: onEnemyDeath
    });
    this.enemies.push(this.boss);

    const bossWorld = this.tileMap.gridToWorld(bossSpawn.gx, bossSpawn.gy);
    this.add.image(bossWorld.x, bossWorld.y, 'light_pool').setDepth(-999).setScale(2.1).setBlendMode(Phaser.BlendModes.ADD).setTint(ACCENT);

    const npcSpawns = this.tileMap.allMarkers('N');
    this.npcs = TERMINAL_CAPTIVES
      .map((captive, i) => ({ captive, spot: npcSpawns[i] }))
      .filter(({ captive }) => !GameState.rescuedNpcs.has(captive.id))
      .map(({ captive, spot }) => new NPC(this, this.tileMap, spot.gx, spot.gy, {
        id: captive.id,
        name: captive.name,
        texture: 'npc_worker',
        tint: ACCENT,
        lines: captive.dungeonLines
      }));

    this.items = ITEMS
      .filter((item) => !GameState.itemsTaken.has(item.id))
      .map((item) => {
        const spot = this.tileMap.marker(item.markerKey);
        const world = this.tileMap.gridToWorld(spot.gx, spot.gy);
        this.add.image(world.x, world.y, 'light_pool').setDepth(-999).setBlendMode(Phaser.BlendModes.ADD).setTint(ACCENT);
        const sprite = this.add.image(world.x, world.y, item.texture).setDepth(9000);
        if (item.tint) sprite.setTint(item.tint);
        this.tweens.add({ targets: sprite, y: sprite.y - 5, duration: 700, yoyo: true, repeat: -1 });
        return { ...item, gx: spot.gx, gy: spot.gy, sprite, taken: false };
      });

    this.tileMap.allMarkers('H').forEach((spot, i) => {
      const world = this.tileMap.gridToWorld(spot.gx, spot.gy);
      this.add.image(world.x, world.y, 'light_pool').setDepth(-999).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffc878);
      const sprite = this.add.image(world.x, world.y, 'item_medkit').setDepth(9000);
      this.tweens.add({ targets: sprite, y: sprite.y - 5, duration: 700, yoyo: true, repeat: -1 });
      this.items.push({
        id: `terminal_medkit_${i}`, kind: 'heal', amount: HEAL_AMOUNT,
        gx: spot.gx, gy: spot.gy, sprite, taken: false
      });
    });

    this.cargoDrops = new Map();
    this._buildBridge();
    this._buildGates();
    this._buildCraneLock();
    this._buildCraneKey();

    this.levelEnded = false;
    this.transitioning = false;
    this.returnDoorPos = null;
    this._lastRemaining = null;
    this.bridgeHintShown = false;
    this.craneHintShown = false;
    this.craneLockHintShown = false;

    this._setupCamera();
    this._setupInput();
    this.cameras.main.fadeIn(350, 18, 22, 28);
    playMusic(this, 'music_terminal');

    initHud(this, () => {
      this.game.events.emit('hud-init', { label: 'TERMINAL DE CONTÊINERES', showEnemies: true, sceneKey: 'TerminalScene' });
      this._emitStats();
      this.game.events.emit('enemies-remaining', this.enemies.length);
    });
  }

  isCargoDropCell(gx, gy) {
    return this.cargoDrops.has(`${gx},${gy}`);
  }

  placeCargoDrop(gx, gy, durationMs, opts = {}) {
    gx = Math.round(gx);
    gy = Math.round(gy);
    const key = `${gx},${gy}`;
    if (this.cargoDrops.has(key)) return null;
    if (!this.tileMap.isWalkable(gx, gy)) return null;
    if (this.gates?.some((g) => !g.open && g.gx === gx && g.gy === gy)) return null;
    if (this.player?.alive && Math.round(this.player.gx) === gx && Math.round(this.player.gy) === gy) {
      return null;
    }
    this.tileMap.setWalkable(gx, gy, false);
    const world = this.tileMap.gridToWorld(gx, gy);
    const tex = this.textures.exists('prop_container') ? 'prop_container' : 'prop_crate';
    const sprite = this.add.image(world.x, world.y, tex)
      .setTint(opts.tint || ACCENT)
      .setDepth(gy * 10 + 3)
      .setOrigin(0.5, 0.85)
      .setAlpha(0.96);
    const block = { gx, gy, sprite, until: this.time.now + durationMs };
    this.cargoDrops.set(key, block);
    return block;
  }

  clearCargoDrop(block) {
    if (!block) return;
    const key = `${block.gx},${block.gy}`;
    if (this.cargoDrops.get(key) !== block) return;
    this.cargoDrops.delete(key);
    this.tileMap.setWalkable(block.gx, block.gy, true);
    if (block.sprite) {
      this.tweens.add({
        targets: block.sprite, y: block.sprite.y - 28, alpha: 0, duration: 180,
        onComplete: () => block.sprite.destroy()
      });
    }
  }

  _updateCargoDrops() {
    const now = this.time.now;
    for (const block of [...this.cargoDrops.values()]) {
      if (now >= block.until) this.clearCargoDrop(block);
    }
  }

  _buildGates() {
    this.gates = ['L2', 'L3', 'LG'].map((key) => {
      const spot = this.tileMap.marker(key);
      const world = this.tileMap.gridToWorld(spot.gx, spot.gy);
      const sprite = this.add.image(world.x, world.y, 'door_estaleiro').setDepth(9000).setTint(0xff4a5e);
      const label = this.add.text(world.x, world.y - 20, 'SELADA', {
        fontFamily: 'Courier New', fontSize: '8px', color: '#ff8a9c'
      }).setOrigin(0.5).setDepth(9001);
      return { key, gx: spot.gx, gy: spot.gy, sprite, label, open: false, warned: false };
    });
  }

  _openGate(gate) {
    if (gate.open) return;
    gate.open = true;
    this.tileMap.setWalkable(gate.gx, gate.gy, true);
    gate.sprite.setTint(ACCENT);
    gate.label.setText('ABERTA');
    playSfx(this, 'sfx_pickup');
  }

  _checkGateWarning(gate, message) {
    if (gate.open || gate.warned) return;
    const dist = Math.hypot(this.player.gx - gate.gx, this.player.gy - gate.gy);
    if (dist < 1.2) {
      gate.warned = true;
      this.game.events.emit('dialogue', message);
    }
  }

  _updateGates() {
    const [armazemGate, docaGate, guindasteGate] = this.gates;
    if (!this.subChefe.alive) this._openGate(armazemGate);
    if (this.bridgeLowered && !this.subChefe.alive) this._openGate(docaGate);
    if (this.craneLockSolved) this._openGate(guindasteGate);

    this._checkGateWarning(armazemGate, 'O Estivador ainda tranca essa passagem. Ele está na Câmara, do outro lado da ponte.');
    this._checkGateWarning(docaGate, 'A Doca só abre com a ponte baixada E o Estivador fora do pátio.');
    this._checkGateWarning(guindasteGate, 'Trancada. As três travas de segurança da Cabine de Comando precisam estar soltas.');
  }

  // Ponte levadiça de 3 pranchas sobre o fosso da Sala da Ponte. Cada pedal
  // cicla a prancha em frente (0 = levantada pro norte, 1 = deitada/passável,
  // 2 = levantada pro sul). As 3 deitadas => fileira y44 vira passagem
  // contínua da sala de controle até a Câmara do Estivador.
  _buildBridge() {
    this.bridgeLowered = false;
    const { laneY, spans, startStates } = this.bridgeDef;
    this.bridgeLaneY = laneY;

    const gx0 = spans[0].x0;
    const gx1 = spans[spans.length - 1].x0 + 1;

    // Abismo — trava as 3 fileiras do fosso (o piso só foi recortado pro
    // render) e cobre com um bloco escuro; cada prancha reabre a sua fileira
    // do meio ao deitar.
    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gy = laneY - 1; gy <= laneY + 1; gy++) {
        this.tileMap.setWalkable(gx, gy, false);
      }
    }
    const pit = this.tileMap.gridToWorld((gx0 + gx1) / 2, laneY);
    const pitW = (gx1 - gx0 + 1) * TILE_SIZE;
    this.add.rectangle(pit.x, pit.y, pitW + 10, TILE_SIZE * 3 + 10, 0x05070c, 0.94)
      .setDepth(laneY * 10 - 20);
    for (let i = -1; i <= 1; i++) {
      this.add.rectangle(pit.x, pit.y + i * 11, pitW - 4, 2, 0x1c2634, 0.55).setDepth(laneY * 10 - 19);
    }

    this.bridgePads = this.tileMap.allMarkers('Q').map((spot, i) => {
      const world = this.tileMap.gridToWorld(spot.gx, spot.gy);
      const tex = this.textures.exists('tile_circuit_off') ? 'tile_circuit_off' : 'floor_estaleiro_stripe';
      const sprite = this.add.image(world.x, world.y, tex).setDepth(spot.gy * 10 + 1).setTint(ACCENT);
      this.add.text(world.x, world.y + 12, String(i + 1), {
        fontFamily: 'Courier New', fontSize: '8px', color: '#ffc878',
        stroke: '#080c10', strokeThickness: 3
      }).setOrigin(0.5).setDepth(spot.gy * 10 + 4);
      return { gx: spot.gx, gy: spot.gy, sprite };
    });

    this.bridgeSpans = spans.map((s, i) => {
      const pad = this.bridgePads[i] || { gx: s.x0, gy: laneY + 2 };
      const cx = s.x0 * TILE_SIZE + TILE_SIZE; // centro dos 2 tiles (x0, x0+1)
      const flatY = laneY * TILE_SIZE + TILE_SIZE / 2;
      const sprite = this.add.image(cx, flatY, 'prop_container')
        .setOrigin(0.5, 0.5).setTint(0xc9a06a);
      return { x0: s.x0, cx, flatY, sprite, state: startStates[i], padGx: pad.gx, padGy: pad.gy, wasOn: false };
    });

    const mid = this.bridgeSpans[1] || this.bridgeSpans[0];
    this.bridgeTitle = this.add.text(mid.cx, mid.flatY - TILE_SIZE * 2.2, 'BAIXE A PONTE', {
      fontFamily: 'Courier New', fontSize: '10px', color: '#e8923d',
      stroke: '#080c10', strokeThickness: 4, align: 'center'
    }).setOrigin(0.5).setDepth(9600);
    this.bridgeSubtitle = this.add.text(mid.cx, mid.flatY - TILE_SIZE * 2.2 + 12, 'pise nos pedais até as 3 pranchas deitarem', {
      fontFamily: 'Courier New', fontSize: '8px', color: '#c9a06a',
      stroke: '#080c10', strokeThickness: 3, align: 'center'
    }).setOrigin(0.5).setDepth(9600);

    this.bridgeSpans.forEach((span) => this._applyBridgeSpan(span, true));
  }

  _applyBridgeSpan(span, instant = false) {
    const flat = span.state === 1;
    for (let gx = span.x0; gx <= span.x0 + 1; gx++) {
      this.tileMap.setWalkable(gx, this.bridgeLaneY, flat);
      if (!flat && this.player?.alive
        && Math.round(this.player.gx) === gx && Math.round(this.player.gy) === this.bridgeLaneY) {
        this.player.gx = span.padGx;
        this.player.gy = span.padGy;
      }
    }
    const pose = flat
      ? { y: span.flatY, angle: 0, alpha: 1, depth: this.bridgeLaneY * 10 + 2 }
      : span.state === 0
        ? { y: span.flatY - 34, angle: -70, alpha: 0.92, depth: this.bridgeLaneY * 10 + 30 }
        : { y: span.flatY + 30, angle: 66, alpha: 0.92, depth: this.bridgeLaneY * 10 + 30 };
    span.sprite.setDepth(pose.depth);
    if (instant) {
      span.sprite.setPosition(span.cx, pose.y).setAngle(pose.angle).setAlpha(pose.alpha);
    } else {
      this.tweens.add({
        targets: span.sprite, y: pose.y, angle: pose.angle, alpha: pose.alpha,
        duration: 240, ease: 'Cubic.Out'
      });
    }
  }

  _updateBridge() {
    if (this.bridgeLowered) return;
    for (const span of this.bridgeSpans) {
      const dist = Math.hypot(this.player.gx - span.padGx, this.player.gy - span.padGy);
      const on = dist < 0.55;
      if (on && !span.wasOn) {
        span.state = (span.state + 1) % 3;
        this._applyBridgeSpan(span);
        playSfx(this, 'sfx_menu_open', { volume: 0.35 });
        if (this.bridgeSpans.every((s) => s.state === 1)) {
          this.bridgeLowered = true;
          this.bridgeTitle.setText('PONTE BAIXADA');
          this.bridgeSubtitle.setText('atravesse até a Câmara do Estivador');
          this.game.events.emit('item-pickup', 'Ponte baixada — atravesse. As Botas de Estiva estão na Câmara, do outro lado.');
        }
      }
      span.wasOn = on;
    }
  }

  // --- Cabine de Comando: puzzle das travas de segurança -------------------
  // 3 travas. Pisar no pedal i vira a trava i E puxa junto a trava i+1 (a
  // última só ela). As 3 levantadas => a Sala do Guindaste destranca (LG).
  _buildCraneLock() {
    this.craneLockSolved = false;
    const pads = this.tileMap.allMarkers('G');
    this.craneLevers = pads.map((spot, i) => {
      const world = this.tileMap.gridToWorld(spot.gx, spot.gy);
      const padTex = this.textures.exists('tile_circuit_off') ? 'tile_circuit_off' : 'floor_estaleiro_stripe';
      this.add.image(world.x, world.y, padTex).setDepth(spot.gy * 10 + 1).setTint(ACCENT);
      const lever = this.add.rectangle(world.x, world.y - 6, 5, 20, 0xff4a5e)
        .setOrigin(0.5, 1).setDepth(spot.gy * 10 + 5);
      this.add.text(world.x, world.y + 12, String(i + 1), {
        fontFamily: 'Courier New', fontSize: '8px', color: '#ffc878',
        stroke: '#080c10', strokeThickness: 3
      }).setOrigin(0.5).setDepth(spot.gy * 10 + 6);
      return { gx: spot.gx, gy: spot.gy, up: false, lever, wasOn: false };
    });

    // Corrente entre travas adjacentes — deixa claro que uma puxa a outra.
    for (let i = 0; i < this.craneLevers.length - 1; i++) {
      const a = this.tileMap.gridToWorld(this.craneLevers[i].gx, this.craneLevers[i].gy);
      const b = this.tileMap.gridToWorld(this.craneLevers[i + 1].gx, this.craneLevers[i + 1].gy);
      this.add.rectangle((a.x + b.x) / 2, a.y - 18, Math.abs(b.x - a.x), 2, 0x8a6a3a)
        .setDepth(9500).setAlpha(0.8);
    }

    const anchor = this.craneLevers[1] || this.craneLevers[0];
    if (anchor) {
      const w = this.tileMap.gridToWorld(anchor.gx, anchor.gy);
      this.craneLockTitle = this.add.text(w.x, w.y - TILE_SIZE * 1.9, 'TRAVAS DE SEGURANÇA', {
        fontFamily: 'Courier New', fontSize: '10px', color: '#e8923d',
        stroke: '#080c10', strokeThickness: 4, align: 'center'
      }).setOrigin(0.5).setDepth(9600);
      this.craneLockStatus = this.add.text(w.x, w.y - TILE_SIZE * 1.9 + 12, '', {
        fontFamily: 'Courier New', fontSize: '8px', color: '#c9a06a',
        stroke: '#080c10', strokeThickness: 3, align: 'center'
      }).setOrigin(0.5).setDepth(9600);
    }
    this._applyCraneLevers();
  }

  _applyCraneLevers() {
    for (const lv of this.craneLevers) {
      lv.lever.setAngle(lv.up ? -32 : 40);
      lv.lever.setFillStyle(lv.up ? 0x6dff6a : 0xff4a5e);
    }
    if (this.craneLockStatus) {
      const up = this.craneLevers.filter((l) => l.up).length;
      this.craneLockStatus.setText(this.craneLockSolved
        ? 'DESTRAVADO'
        : `${up}/3 · cada trava puxa a seguinte junto`);
    }
  }

  _updateCraneLock() {
    if (this.craneLockSolved) return;
    for (let i = 0; i < this.craneLevers.length; i++) {
      const lv = this.craneLevers[i];
      const dist = Math.hypot(this.player.gx - lv.gx, this.player.gy - lv.gy);
      const on = dist < 0.55;
      if (on && !lv.wasOn) {
        lv.up = !lv.up;
        const next = this.craneLevers[i + 1];
        if (next) next.up = !next.up;
        playSfx(this, 'sfx_menu_open', { volume: 0.35 });
        if (this.craneLevers.every((l) => l.up)) {
          this.craneLockSolved = true;
          if (this.craneLockTitle) this.craneLockTitle.setText('CABINE DESTRAVADA');
          this.game.events.emit('item-pickup', 'Travas de segurança soltas — a Sala do Guindaste abriu.');
        }
        this._applyCraneLevers();
      }
      lv.wasOn = on;
    }
  }

  // --- Chave do guindaste + quedas de contêiner no pátio ------------------
  _buildCraneKey() {
    this.craneOnline = true;
    this.craneKeyPulled = false;
    this.craneTelegraphs = [];
    this.nextCraneDropAt = this.time.now + 2600;

    const spot = this.tileMap.marker('K');
    this.craneKeyPos = { gx: spot.gx, gy: spot.gy };
    const world = this.tileMap.gridToWorld(spot.gx, spot.gy);
    this.add.image(world.x, world.y, 'light_pool').setDepth(-999)
      .setBlendMode(Phaser.BlendModes.ADD).setTint(0xff4a5e);
    const tex = this.textures.exists('prop_console') ? 'prop_console' : 'prop_crate';
    this.craneKeySprite = this.add.image(world.x, world.y, tex)
      .setOrigin(0.5, 0.85).setDepth(spot.gy * 10 + 4).setTint(0xff6a6a);
    this.craneKeyPulse = this.add.image(world.x, world.y, 'light_pool')
      .setDepth(spot.gy * 10 + 3).setBlendMode(Phaser.BlendModes.ADD).setTint(0xff4a5e)
      .setScale(0.55).setAlpha(0.5);
    this.tweens.add({ targets: this.craneKeyPulse, alpha: 0.12, scale: 1.0, duration: 600, yoyo: true, repeat: -1 });
    this.craneKeyLabel = this.add.text(world.x, world.y - 24, 'CHAVE DO GUINDASTE', {
      fontFamily: 'Courier New', fontSize: '8px', color: '#ff8a9c',
      stroke: '#080c10', strokeThickness: 3
    }).setOrigin(0.5).setDepth(9600);
  }

  _clearCraneTelegraphs() {
    for (const t of this.craneTelegraphs || []) {
      t.ring?.destroy();
      t.shadow?.destroy();
    }
    this.craneTelegraphs = [];
  }

  _pullCraneKey() {
    if (this.craneKeyPulled) return;
    this.craneKeyPulled = true;
    this.craneOnline = false;
    this._clearCraneTelegraphs();
    playSfx(this, 'sfx_pickup');
    this.craneKeySprite.setTint(0x8fbf6a);
    if (this.craneKeyPulse) { this.craneKeyPulse.destroy(); this.craneKeyPulse = null; }
    if (this.craneKeyLabel) this.craneKeyLabel.setText('GUINDASTE DESLIGADO').setColor('#8fbf6a');
    this.cameras.main.flash(120, 120, 200, 120);
    this.game.events.emit('item-pickup', 'Chave puxada — o guindaste travou. Nada mais cai no pátio.');
  }

  _updateCraneKey() {
    if (this.craneKeyPulled || !this.craneKeyPos) return;
    const d = Math.hypot(this.player.gx - this.craneKeyPos.gx, this.player.gy - this.craneKeyPos.gy);
    if (d < 0.7) this._pullCraneKey();
  }

  _pickCraneDropCell() {
    const px = Math.round(this.player.gx);
    const py = Math.round(this.player.gy);
    for (let attempt = 0; attempt < 14; attempt++) {
      let gx;
      let gy;
      if (attempt < 8 && Math.random() < 0.55) {
        const ang = Math.random() * Math.PI * 2;
        const dist = Phaser.Math.Between(3, 8);
        gx = px + Math.round(Math.cos(ang) * dist);
        gy = py + Math.round(Math.sin(ang) * dist);
      } else {
        gx = Phaser.Math.Between(14, 50);
        gy = Phaser.Math.Between(11, 39);
      }
      if (gx < 13 || gx > 51 || gy < 10 || gy > 40) continue;
      if (gx === px && gy === py) continue;
      if (!this.tileMap.isWalkable(gx, gy)) continue;
      if (this.isCargoDropCell(gx, gy)) continue;
      if (this.craneTelegraphs.some((t) => t.gx === gx && t.gy === gy)) continue;
      return { gx, gy };
    }
    return null;
  }

  _spawnCraneTelegraph() {
    const cell = this._pickCraneDropCell();
    if (!cell) return;
    const world = this.tileMap.gridToWorld(cell.gx, cell.gy);
    const ring = this.add.image(world.x, world.y, 'light_pool')
      .setTint(ACCENT).setDepth(8999).setBlendMode(Phaser.BlendModes.ADD).setScale(0.2).setAlpha(0.8);
    this.tweens.add({ targets: ring, scale: 1.05, alpha: 0.95, duration: CRANE_TELEGRAPH_MS, ease: 'Cubic.In' });
    const shadow = this.add.image(world.x, world.y - 46, 'prop_container')
      .setOrigin(0.5, 0.85).setDepth(9002).setAlpha(0.32).setScale(0.55).setTint(ACCENT);
    this.tweens.add({ targets: shadow, y: world.y, scale: 1, alpha: 0.9, duration: CRANE_TELEGRAPH_MS, ease: 'Cubic.In' });
    this.craneTelegraphs.push({ gx: cell.gx, gy: cell.gy, ring, shadow, dropAt: this.time.now + CRANE_TELEGRAPH_MS });
    playSfx(this, 'sfx_enrage', { volume: 0.16 });
  }

  _resolveCraneDrop(t) {
    t.ring?.destroy();
    t.shadow?.destroy();
    const world = this.tileMap.gridToWorld(t.gx, t.gy);
    const flash = this.add.image(world.x, world.y, 'light_pool')
      .setTint(0xffe0a0).setBlendMode(Phaser.BlendModes.ADD).setDepth(9003).setScale(1.3).setAlpha(0.9);
    this.tweens.add({ targets: flash, alpha: 0, scale: 2.1, duration: 220, onComplete: () => flash.destroy() });
    this.cameras.main.shake(110, 0.005);
    if (this.player?.alive && Math.hypot(this.player.gx - t.gx, this.player.gy - t.gy) <= CRANE_DROP_RADIUS) {
      this.player.takeDamage(CRANE_DROP_DAMAGE);
    }
    this.placeCargoDrop(t.gx, t.gy, CRANE_DROP_WALL_MS, { tint: ACCENT });
  }

  _updateCraneHazard() {
    if (!this.craneOnline) return;
    const now = this.time.now;

    this.craneTelegraphs = this.craneTelegraphs.filter((t) => {
      if (now < t.dropAt) return true;
      this._resolveCraneDrop(t);
      return false;
    });

    if (now >= this.nextCraneDropAt) {
      const inYard = this.player.gx >= 12 && this.player.gx <= 52
        && this.player.gy >= 9 && this.player.gy <= 41;
      if (inYard) this._spawnCraneTelegraph();
      this.nextCraneDropAt = now + Phaser.Math.Between(2800, 3800);
    }
  }

  _setupCamera() {
    const { width, height } = this.tileMap.worldBounds();
    this.cameras.main.setBounds(0, 0, width, height);
    this.cameras.main.startFollow(this.player.sprite, true, 0.12, 0.12);
    this.cameras.main.setZoom(1.2);
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
          const firstTime = upgradePistol(item.name, item.pistolDamage, item.rangedKind || GameState.rangedKind, item.ammoBonus || 3);
          this.game.events.emit('item-pickup', firstTime
            ? `${item.name} equipada! Pressione F ou clique direito para atirar.`
            : `${item.name} equipada! Arma à distância trocada.`);
          this._emitStats();
          continue;
        }

        if (item.kind === 'boots') {
          GameState.itemsTaken.add(item.id);
          equipBoots(item.name, item.speedMul);
          this.game.events.emit('item-pickup', `${item.name} equipadas! Velocidade de deslocamento aumentada.`);
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
      if (name === 'Sala da Ponte' && !this.bridgeHintShown && !this.bridgeLowered) {
        this.bridgeHintShown = true;
        this.game.events.emit(
          'dialogue',
          'A ponte tem três pranchas levantadas sobre o fosso. Cada pedal gira a prancha em frente — deite as três e atravesse até a Câmara.'
        );
      }
      if (!this.craneHintShown && this.craneOnline
        && (name.startsWith('Pátio') || name.startsWith('Avenida') || name === 'Rua Oeste')) {
        this.craneHintShown = true;
        this.game.events.emit(
          'dialogue',
          'O guindaste está solto — contêineres caindo no pátio sem alvo. A Cabine de Comando fica a leste; a chave lá dentro desliga o guindaste.'
        );
      }
      if (name === 'Cabine de Comando' && !this.craneLockHintShown && !this.craneLockSolved) {
        this.craneLockHintShown = true;
        this.game.events.emit(
          'dialogue',
          'Três travas de segurança. Cada pedal levanta a trava dele e puxa a seguinte junto — deixe as três levantadas pra abrir a Sala do Guindaste.'
        );
      }
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
    this._checkItemPickups();

    if (this.levelEnded) {
      if (this.returnDoorPos) this._checkReturnDoor();
      return;
    }

    this._updateCargoDrops();
    this._updateCraneHazard();
    this._updateBridge();
    this._updateCraneLock();
    this._updateCraneKey();
    this._updateGates();
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
    this.craneOnline = false;
    this._clearCraneTelegraphs();
    this._clearAllCargoDrops();
    this.game.events.emit(victory ? 'level-complete' : 'game-over');
    if (victory) {
      GameState.terminalCleared = true;
      for (const captive of TERMINAL_CAPTIVES) rescueNpc(captive.id);
      saveGame();
      this._spawnReturnDoor();
    }
  }

  // Guindaste desliga com o chefe: nenhum contêiner deve seguir bloqueando o
  // pátio depois disso — inclusive o que às vezes cai bem onde a porta de
  // retorno nasce (spawn do chefe), o que travava a saída da fase.
  _clearAllCargoDrops() {
    for (const block of [...this.cargoDrops.values()]) {
      this.clearCargoDrop(block);
    }
  }

  _spawnReturnDoor() {
    this.returnDoorPos = { gx: this.boss.spawn.gx, gy: this.boss.spawn.gy + 1 };
    const world = this.tileMap.gridToWorld(this.returnDoorPos.gx, this.returnDoorPos.gy);
    this.returnDoorSprite = this.add.image(world.x, world.y, 'door_estaleiro').setDepth(9000);
    this.tweens.add({ targets: this.returnDoorSprite, alpha: 0.45, duration: 650, yoyo: true, repeat: -1 });
    this.add.text(world.x, world.y - 20, 'ESTALEIRO ←', {
      fontFamily: 'Courier New', fontSize: '8px', color: '#e8923d'
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
    this.cameras.main.flash(150, 232, 146, 61);
    this.cameras.main.fadeOut(420, 18, 22, 28);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.stop('UIScene');
      this.scene.start('EstaleiroScene');
    });
  }
}
