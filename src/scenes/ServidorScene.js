import Phaser from 'phaser';
import TileMap from '../world/TileMap.js';
import { buildServidorWing } from '../world/ServidorLayout.js';
import Player from '../entities/Player.js';
import FirewallDrone from '../entities/FirewallDrone.js';
import SiphonEnemy from '../entities/SiphonEnemy.js';
import SysadminBoss from '../entities/SysadminBoss.js';
import AdministradorBoss from '../entities/AdministradorBoss.js';
import NPC from '../entities/NPC.js';
import { DIRECTIONS, TILE_SIZE } from '../utils/constants.js';
import { GameState, equipWeapon, equipArmor, rescueNpc, upgradePistol, addAmmo, addStim, addEmpCharge } from '../state/GameState.js';
import { SERVIDOR_CAPTIVES } from '../state/ServidorCaptives.js';
import { initHud } from '../utils/hud.js';
import { playMusic, playSfx } from '../audio/AudioManager.js';

const ITEMS = [
  { id: 'servidor_weapon', markerKey: 'I', texture: 'item_sword', name: 'Lâmina de Criptografia', kind: 'weapon', value: 310, tint: 0x2ef0c8 },
  { id: 'servidor_pistol', markerKey: 'C', texture: 'item_pistol', name: 'Pistola de Pacote', kind: 'pistol', pistolDamage: 119, ammoBonus: 6, tint: 0x2ef0c8 },
  { id: 'servidor_armor', markerKey: 'A', texture: 'item_armor', name: 'Blindagem Faraday', kind: 'armor', value: 205, tint: 0x2ef0c8 }
];

const HEAL_AMOUNT = 65;
const AMMO_CHANCE_NORMAL = 0.1;
const AMMO_CHANCE_TANK = 0.2;
const BOSS_TRIPLE_AMMO_CHANCE = 1 / 3;
const STIM_DROP_CHANCE = 0.03;
const EMP_DROP_CHANCE = 0.025;

const SCAN_HIT_MS = 380;
const SCAN_WARN_MS = 280;
const SCAN_DAMAGE = 16;

const CABLE_N = 1;
const CABLE_E = 2;
const CABLE_S = 4;
const CABLE_W = 8;
const CABLE_BASE = { straight: CABLE_N | CABLE_S, elbow: CABLE_N | CABLE_E, tee: CABLE_N | CABLE_E | CABLE_S };
const CABLE_ROTS = { straight: 2, elbow: 4, tee: 4 };
// Giros a partir do estado resolvido — o caminho IN→OUT sempre existe.
const CABLE_SCRAMBLE = [1, 0, 1, 2, 1, 3, 1, 1, 2];

const BUS_GOAL = [0, 1, 2, 3, 4];
const BUS_START = [3, 0, 4, 1, 2];

const ACCENT = 0x2ef0c8;
const HAZARD = 0xff3d8a;

const PROPS = [
  { gx: 4, gy: 5, texture: 'prop_rack' }, { gx: 20, gy: 4, texture: 'prop_console' },
  { gx: 43, gy: 6, texture: 'prop_crate' }, { gx: 57, gy: 4, texture: 'prop_rack' },
  { gx: 31, gy: 18, texture: 'prop_console' }, { gx: 7, gy: 28, texture: 'prop_pipe' },
  { gx: 55, gy: 30, texture: 'prop_crate' }, { gx: 16, gy: 42, texture: 'prop_console' },
  { gx: 44, gy: 42, texture: 'prop_rack' }, { gx: 58, gy: 42, texture: 'prop_pipe' }
];

function rotateMask(mask, times) {
  let m = mask;
  for (let i = 0; i < times; i++) {
    const n = m & CABLE_N;
    const e = m & CABLE_E;
    const s = m & CABLE_S;
    const w = m & CABLE_W;
    m = (n ? CABLE_E : 0) | (e ? CABLE_S : 0) | (s ? CABLE_W : 0) | (w ? CABLE_N : 0);
  }
  return m;
}

function cableMask(cell) {
  return rotateMask(CABLE_BASE[cell.type] || CABLE_BASE.elbow, cell.rot);
}

function cablePathOpen(cells) {
  const idx = (c, r) => r * 3 + c;
  const has = (i, bit) => (cableMask(cells[i]) & bit) !== 0;
  const start = idx(0, 1);
  if (!has(start, CABLE_W)) return false;
  const seen = new Set([start]);
  const q = [start];
  const dirs = [
    { bit: CABLE_N, opp: CABLE_S, dc: 0, dr: -1 },
    { bit: CABLE_E, opp: CABLE_W, dc: 1, dr: 0 },
    { bit: CABLE_S, opp: CABLE_N, dc: 0, dr: 1 },
    { bit: CABLE_W, opp: CABLE_E, dc: -1, dr: 0 }
  ];
  while (q.length) {
    const i = q.shift();
    const c = i % 3;
    const r = Math.floor(i / 3);
    if (c === 2 && r === 1 && has(i, CABLE_E)) return true;
    for (const d of dirs) {
      if (!has(i, d.bit)) continue;
      const nc = c + d.dc;
      const nr = r + d.dr;
      if (nc < 0 || nc > 2 || nr < 0 || nr > 2) continue;
      const j = idx(nc, nr);
      if (!has(j, d.opp) || seen.has(j)) continue;
      seen.add(j);
      q.push(j);
    }
  }
  return false;
}

export default class ServidorScene extends Phaser.Scene {
  constructor() {
    super('ServidorScene');
  }

  create() {
    const { grid, markers, zones, scanlines } = buildServidorWing();
    this.zones = zones;
    this.currentZone = null;
    this.scanlineDefs = scanlines;
    this.tileMap = new TileMap(this, grid, {
      wallTexture: 'wall_servidor',
      floorTexture: 'floor_servidor',
      floorVariants: [
        { key: 'floor_servidor', weight: 0.7 },
        { key: 'floor_servidor_vent', weight: 0.18 },
        { key: 'floor_servidor_rack', weight: 0.12 }
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
      ...this.tileMap.allMarkers('X').map((m) => new FirewallDrone(this, this.tileMap, m.gx, m.gy, {
        hp: 56, speed: 1.18, attackDamage: 17, xpReward: 28,
        ammoDropChance: AMMO_CHANCE_NORMAL, onDeath: onEnemyDeath
      })),
      ...this.tileMap.allMarkers('T').map((m) => new SiphonEnemy(this, this.tileMap, m.gx, m.gy, {
        hp: 220, speed: 0.95, attackDamage: 32, xpReward: 70, hpBarWidth: 32,
        ammoDropChance: AMMO_CHANCE_TANK, onDeath: onEnemyDeath
      }))
    ];

    const subSpawn = this.tileMap.marker('M');
    this.subChefe = new SysadminBoss(this, this.tileMap, subSpawn.gx, subSpawn.gy, {
      onDeath: onEnemyDeath
    });
    this.enemies.push(this.subChefe);

    const bossSpawn = this.tileMap.marker('B');
    this.boss = new AdministradorBoss(this, this.tileMap, bossSpawn.gx, bossSpawn.gy, {
      onDeath: onEnemyDeath
    });
    this.enemies.push(this.boss);

    const bossWorld = this.tileMap.gridToWorld(bossSpawn.gx, bossSpawn.gy);
    this.add.image(bossWorld.x, bossWorld.y, 'light_pool').setDepth(-999).setScale(2.1).setBlendMode(Phaser.BlendModes.ADD).setTint(ACCENT);

    const npcSpawns = this.tileMap.allMarkers('N');
    this.npcs = SERVIDOR_CAPTIVES
      .map((captive, i) => ({ captive, spot: npcSpawns[i] }))
      .filter(({ captive }) => !GameState.rescuedNpcs.has(captive.id))
      .map(({ captive, spot }) => new NPC(this, this.tileMap, spot.gx, spot.gy, {
        id: captive.id,
        name: captive.name,
        texture: 'npc_engineer',
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
      this.add.image(world.x, world.y, 'light_pool').setDepth(-999).setBlendMode(Phaser.BlendModes.ADD).setTint(0x9fffe8);
      const sprite = this.add.image(world.x, world.y, 'item_medkit').setDepth(9000);
      this.tweens.add({ targets: sprite, y: sprite.y - 5, duration: 700, yoyo: true, repeat: -1 });
      this.items.push({
        id: `servidor_medkit_${i}`, kind: 'heal', amount: HEAL_AMOUNT,
        gx: spot.gx, gy: spot.gy, sprite, taken: false
      });
    });

    this.firewallBlocks = new Map();
    this._buildScanlines();
    this._buildCablePuzzle();
    this._buildBusPuzzle();
    this._buildGates();

    this.levelEnded = false;
    this.transitioning = false;
    this.returnDoorPos = null;
    this._lastRemaining = null;

    this._setupCamera();
    this._setupInput();
    this.cameras.main.fadeIn(350, 8, 28, 24);
    playMusic(this, 'music_servidor');

    initHud(this, () => {
      this.game.events.emit('hud-init', { label: 'SERVIDOR OCULTO', showEnemies: true, sceneKey: 'ServidorScene' });
      this._emitStats();
      this.game.events.emit('enemies-remaining', this.enemies.length);
    });
  }

  isFirewallCell(gx, gy) {
    return this.firewallBlocks.has(`${gx},${gy}`);
  }

  placeFirewall(gx, gy, durationMs, opts = {}) {
    gx = Math.round(gx);
    gy = Math.round(gy);
    const key = `${gx},${gy}`;
    if (this.firewallBlocks.has(key)) return null;
    if (!this.tileMap.isWalkable(gx, gy)) return null;
    if (this.gates?.some((g) => !g.open && g.gx === gx && g.gy === gy)) return null;
    if (!opts.allowOnPlayer && this.player?.alive
      && Math.round(this.player.gx) === gx && Math.round(this.player.gy) === gy) {
      return null;
    }
    this.tileMap.setWalkable(gx, gy, false);
    const world = this.tileMap.gridToWorld(gx, gy);
    const tex = this.textures.exists('prop_firewall') ? 'prop_firewall' : 'light_pool';
    const sprite = this.add.image(world.x, world.y, tex)
      .setTint(opts.tint || ACCENT)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(gy * 10 + 3)
      .setAlpha(0.92);
    const block = {
      gx, gy, sprite,
      until: this.time.now + durationMs,
      damage: opts.damage || 0
    };
    this.firewallBlocks.set(key, block);
    return block;
  }

  clearFirewall(block) {
    if (!block) return;
    const key = `${block.gx},${block.gy}`;
    if (this.firewallBlocks.get(key) !== block) return;
    this.firewallBlocks.delete(key);
    this.tileMap.setWalkable(block.gx, block.gy, true);
    if (block.sprite) block.sprite.destroy();
  }

  _updateFirewalls() {
    const now = this.time.now;
    for (const block of [...this.firewallBlocks.values()]) {
      if (now >= block.until) {
        this.clearFirewall(block);
        continue;
      }
      if (block.damage && this.player.alive) {
        const dist = Math.hypot(this.player.gx - block.gx, this.player.gy - block.gy);
        if (dist < 0.55) this.player.takeDamage(block.damage);
      }
    }
  }

  _buildScanlines() {
    this.scanlines = this.scanlineDefs.map((def) => {
      const sprites = [];
      for (let gx = def.x1; gx <= def.x2; gx++) {
        const world = this.tileMap.gridToWorld(gx, def.y1);
        const sprite = this.add.image(world.x, world.y, 'light_pool')
          .setTint(HAZARD).setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(9000).setScale(0.7).setAlpha(0);
        sprites.push(sprite);
      }
      return { ...def, sprites, gy: def.y1, state: 'off', hasHit: false };
    });
  }

  _updateScanlines() {
    const now = this.time.now;
    for (const sl of this.scanlines) {
      const span = sl.y2 - sl.y1 + 1;
      const t = (now + sl.phaseMs) % sl.periodMs;
      const slot = sl.periodMs / span;
      const gy = sl.y1 + Math.min(span - 1, Math.floor(t / slot));
      const local = t % slot;
      const state = local < SCAN_WARN_MS ? 'warn' : local < SCAN_WARN_MS + SCAN_HIT_MS ? 'on' : 'off';
      if (gy !== sl.gy || state !== sl.state) {
        sl.gy = gy;
        sl.state = state;
        sl.hasHit = false;
        for (const sprite of sl.sprites) {
          const world = this.tileMap.gridToWorld(Math.round(sprite.x / TILE_SIZE), gy);
          sprite.setPosition(sprite.x, world.y);
          sprite.setAlpha(state === 'off' ? 0 : state === 'warn' ? 0.4 : 0.9);
          sprite.setTint(state === 'on' ? 0xff9ad0 : HAZARD);
        }
      }
      if (state === 'on' && !sl.hasHit && this.player.alive) {
        const onRow = Math.abs(this.player.gy - gy) < 0.55;
        const onCol = this.player.gx >= sl.x1 - 0.4 && this.player.gx <= sl.x2 + 0.4;
        if (onRow && onCol) {
          this.player.takeDamage(SCAN_DAMAGE);
          sl.hasHit = true;
        }
      }
    }
  }

  _buildGates() {
    this.gates = ['L1', 'L2', 'L3', 'L4'].map((key) => {
      const spot = this.tileMap.marker(key);
      const world = this.tileMap.gridToWorld(spot.gx, spot.gy);
      const sprite = this.add.image(world.x, world.y, 'door_servidor').setDepth(9000).setTint(0xff4a5e);
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
    const [gate1, gate2, gate3, gate4] = this.gates;
    if (this.cableSolved) this._openGate(gate1);
    if (this.busSolved) this._openGate(gate2);
    if (this.cableSolved && this.busSolved) this._openGate(gate3);
    if (!this.subChefe.alive) this._openGate(gate4);

    this._checkGateWarning(gate1, 'Acesso bloqueado. O cabeamento ainda não fecha o caminho até o OUT.');
    this._checkGateWarning(gate2, 'Acesso bloqueado. O barramento ainda não bate com o alvo de cima.');
    this._checkGateWarning(gate3, 'O Núcleo só abre quando o cabeamento E o barramento estiverem resolvidos.');
    this._checkGateWarning(gate4, 'O Sysadmin ainda controla essa passagem.');
  }

  _paintCable(cell) {
    const key = `tile_cable_${cell.type}_${cell.rot}`;
    const fallback = this.textures.exists('tile_circuit_on') ? 'tile_circuit_on' : 'floor_servidor';
    cell.sprite.setTexture(this.textures.exists(key) ? key : fallback);
    cell.sprite.setTint(ACCENT);
  }

  _buildCablePuzzle() {
    this.cableCells = this.tileMap.allMarkers('Q').map((spot, i) => {
      const type = spot.type || 'elbow';
      const rotMax = CABLE_ROTS[type] || 4;
      const rot = ((spot.solved || 0) + (CABLE_SCRAMBLE[i] || 0)) % rotMax;
      const world = this.tileMap.gridToWorld(spot.gx, spot.gy);
      const sprite = this.add.image(world.x, world.y, 'tile_circuit_off').setDepth(spot.gy * 10 + 1);
      return { index: i, type, rot, rotMax, gx: spot.gx, gy: spot.gy, sprite, wasOn: false };
    });
    this.cableCells.forEach((c) => this._paintCable(c));

    const inSpot = this.cableCells[3];
    const outSpot = this.cableCells[5];
    if (inSpot) {
      this.add.text(inSpot.sprite.x - 28, inSpot.sprite.y, 'IN', {
        fontFamily: 'Courier New', fontSize: '8px', color: '#2ef0c8'
      }).setOrigin(0.5).setDepth(9001);
    }
    if (outSpot) {
      this.add.text(outSpot.sprite.x + 28, outSpot.sprite.y, 'OUT', {
        fontFamily: 'Courier New', fontSize: '8px', color: '#2ef0c8'
      }).setOrigin(0.5).setDepth(9001);
    }
    this.cableSolved = false;
  }

  _checkCablePuzzle() {
    if (this.cableSolved) return;
    for (const cell of this.cableCells) {
      const dist = Math.hypot(this.player.gx - cell.gx, this.player.gy - cell.gy);
      const on = dist < 0.55;
      if (on && !cell.wasOn) {
        cell.rot = (cell.rot + 1) % cell.rotMax;
        this._paintCable(cell);
        playSfx(this, 'sfx_menu_open', { volume: 0.35 });
        if (cablePathOpen(this.cableCells)) {
          this.cableSolved = true;
          this.game.events.emit('item-pickup', 'Sinal fechado até o OUT — o Anel Oeste destrancou!');
        }
      }
      cell.wasOn = on;
    }
  }

  _busTexture(role, color) {
    const key = role === 'target' ? `tile_bus_socket_${color}` : `tile_bus_plug_${color}`;
    if (this.textures.exists(key)) return key;
    return this.textures.exists('tile_circuit_on') ? 'tile_circuit_on' : 'floor_servidor';
  }

  _paintBus(slot) {
    const world = this.tileMap.gridToWorld(slot.gx, slot.gy);
    slot.sprite.setPosition(world.x, world.y);
    slot.label.setPosition(world.x, world.y + (slot.role === 'plug' ? 12 : -12));
    slot.glow.setPosition(world.x, world.y);
    slot.sprite.setTexture(this._busTexture(slot.role, slot.color));
    slot.sprite.clearTint();
    if (slot.role === 'plug') {
      slot.label.setText(this.busSolved ? '' : (slot.index < this.busPlugs.length - 1 ? '→' : '←'));
      slot.label.setColor('#8ad8c8');
    } else {
      slot.label.setText('');
    }
  }

  _syncBusFeedback() {
    for (let i = 0; i < this.busPlugs.length; i++) {
      const match = this.busSolved || this.busPlugs[i].color === this.busTargets[i].color;
      this.busPlugs[i].glow.setVisible(match);
      this.busTargets[i].glow.setVisible(match);
      this.busPlugs[i].glow.setTint(ACCENT);
      this.busTargets[i].glow.setTint(ACCENT);
    }
  }

  _buildBusPuzzle() {
    this.busBusy = false;
    this.busHintShown = false;
    this.busSolved = false;
    const spots = this.tileMap.allMarkers('K');
    const makeSlot = (spot, color, role, index) => {
      const world = this.tileMap.gridToWorld(spot.gx, spot.gy);
      const sprite = this.add.image(world.x, world.y, this._busTexture(role, color)).setDepth(spot.gy * 10 + 2);
      const label = this.add.text(world.x, world.y, '', {
        fontFamily: 'Courier New', fontSize: '8px', color: '#2ef0c8',
        stroke: '#04080c', strokeThickness: 3
      }).setOrigin(0.5).setDepth(spot.gy * 10 + 3);
      const glow = this.add.image(world.x, world.y, 'light_pool')
        .setBlendMode(Phaser.BlendModes.ADD).setTint(ACCENT).setScale(0.5).setDepth(9500).setVisible(false);
      return { index, gx: spot.gx, gy: spot.gy, color, role, sprite, label, glow, wasOn: false };
    };
    const targetSpots = spots.filter((s) => s.role === 'target');
    const plugSpots = spots.filter((s) => s.role === 'plug');
    const n = BUS_GOAL.length;
    this.busTargets = (targetSpots.length ? targetSpots : spots.slice(0, n))
      .map((spot, i) => makeSlot(spot, BUS_GOAL[i], 'target', i));
    this.busPlugs = (plugSpots.length ? plugSpots : spots.slice(n, n * 2))
      .map((spot, i) => makeSlot(spot, BUS_START[i], 'plug', i));
    [...this.busTargets, ...this.busPlugs].forEach((s) => this._paintBus(s));
    this._syncBusFeedback();

    if (this.busTargets.length >= 2) {
      const last = this.busTargets[this.busTargets.length - 1];
      const midX = (this.busTargets[0].sprite.x + last.sprite.x) / 2;
      const topY = this.busTargets[0].sprite.y - TILE_SIZE * 0.72;
      this.busTitle = this.add.text(midX, topY, 'ENCAIXE AS CORES', {
        fontFamily: 'Courier New', fontSize: '10px', color: '#2ef0c8',
        stroke: '#04080c', strokeThickness: 4, align: 'center'
      }).setOrigin(0.5).setDepth(9600);
      this.busSubtitle = this.add.text(midX, topY + 12, 'pise para trocar com o vizinho', {
        fontFamily: 'Courier New', fontSize: '8px', color: '#8ad8c8',
        stroke: '#04080c', strokeThickness: 3, align: 'center'
      }).setOrigin(0.5).setDepth(9600);
    }
  }

  _busNeighbor(plug) {
    if (plug.index < this.busPlugs.length - 1) return this.busPlugs[plug.index + 1];
    return this.busPlugs[plug.index - 1] || null;
  }

  _finishBusSwap() {
    this.busBusy = false;
    if (this.busPlugs.every((p, i) => p.color === BUS_GOAL[i])) {
      this.busSolved = true;
      if (this.busTitle) this.busTitle.setText('BARRAMENTO ALINHADO');
      if (this.busSubtitle) this.busSubtitle.setText('');
      this.game.events.emit('item-pickup', 'Barramento alinhado — o Anel Leste destrancou!');
    }
    [...this.busTargets, ...this.busPlugs].forEach((s) => this._paintBus(s));
    this._syncBusFeedback();
  }

  _checkBusPuzzle() {
    if (this.busSolved || this.busBusy) return;
    for (const plug of this.busPlugs) {
      const dist = Math.hypot(this.player.gx - plug.gx, this.player.gy - plug.gy);
      const on = dist < 0.55;
      if (on && !plug.wasOn) {
        const other = this._busNeighbor(plug);
        if (other) {
          const aX = plug.sprite.x;
          const aY = plug.sprite.y;
          const bX = other.sprite.x;
          const bY = other.sprite.y;
          this.busBusy = true;
          playSfx(this, 'sfx_menu_open', { volume: 0.35 });
          this.tweens.add({
            targets: plug.sprite,
            x: bX,
            y: bY,
            duration: 140,
            ease: 'Quad.easeOut'
          });
          this.tweens.add({
            targets: other.sprite,
            x: aX,
            y: aY,
            duration: 140,
            ease: 'Quad.easeOut',
            onComplete: () => {
              const tmp = plug.color;
              plug.color = other.color;
              other.color = tmp;
              this._finishBusSwap();
            }
          });
        }
      }
      plug.wasOn = on;
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
      if (name === 'Sala de Barramento' && !this.busHintShown && !this.busSolved) {
        this.busHintShown = true;
        this.game.events.emit(
          'dialogue',
          'O alvo fica em cima. Pise num plugue de baixo para trocar com o vizinho até cada cor encostar na de cima.'
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

    this._updateFirewalls();
    this._updateScanlines();
    this._checkCablePuzzle();
    this._checkBusPuzzle();
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
    this.game.events.emit(victory ? 'level-complete' : 'game-over');
    if (victory) {
      GameState.servidorCleared = true;
      for (const captive of SERVIDOR_CAPTIVES) rescueNpc(captive.id);
      this._spawnReturnDoor();
    }
  }

  _spawnReturnDoor() {
    this.returnDoorPos = { gx: this.boss.spawn.gx, gy: this.boss.spawn.gy + 1 };
    const world = this.tileMap.gridToWorld(this.returnDoorPos.gx, this.returnDoorPos.gy);
    this.returnDoorSprite = this.add.image(world.x, world.y, 'door_servidor').setDepth(9000);
    this.tweens.add({ targets: this.returnDoorSprite, alpha: 0.45, duration: 650, yoyo: true, repeat: -1 });
    this.add.text(world.x, world.y - 20, 'SUBMUNDO ←', {
      fontFamily: 'Courier New', fontSize: '8px', color: '#2ef0c8'
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
    this.cameras.main.flash(150, 46, 240, 200);
    this.cameras.main.fadeOut(420, 6, 16, 18);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.stop('UIScene');
      this.scene.start('SubmundoScene');
    });
  }
}
