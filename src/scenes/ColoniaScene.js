import Phaser from 'phaser';
import TileMap from '../world/TileMap.js';
import { buildColoniaWing } from '../world/ColoniaLayout.js';
import Player from '../entities/Player.js';
import InfectedEnemy from '../entities/InfectedEnemy.js';
import BloatedEnemy from '../entities/BloatedEnemy.js';
import EnfermeiroBoss from '../entities/EnfermeiroBoss.js';
import MatriarchBoss from '../entities/MatriarchBoss.js';
import NPC from '../entities/NPC.js';
import { DIRECTIONS } from '../utils/constants.js';
import { GameState, equipWeapon, equipArmor, rescueNpc, upgradePistol, addAmmo, addStim, addEmpCharge } from '../state/GameState.js';
import { COLONIA_CAPTIVES } from '../state/ColoniaCaptives.js';
import { initHud } from '../utils/hud.js';
import { playMusic, playSfx } from '../audio/AudioManager.js';

const ITEMS = [
  { id: 'colonia_weapon', markerKey: 'I', texture: 'item_sword', name: 'Lâmina Séptica', kind: 'weapon', value: 290, tint: 0x7dff6a },
  { id: 'colonia_pistol', markerKey: 'C', texture: 'item_pistol', name: 'Pistola de Extração', kind: 'pistol', pistolDamage: 112, ammoBonus: 6, tint: 0x7dff6a },
  { id: 'colonia_armor', markerKey: 'A', texture: 'item_armor', name: 'Traje de Quarentena', kind: 'armor', value: 190, toxinImmune: true, tint: 0x7dff6a }
];

const HEAL_AMOUNT = 60;
const TOXIC_TICK_DAMAGE = 5;
const TOXIC_LINGER_MS = 2400;
const AMMO_CHANCE_NORMAL = 0.1;
const AMMO_CHANCE_TANK = 0.2;
const BOSS_TRIPLE_AMMO_CHANCE = 1 / 3;
const STIM_DROP_CHANCE = 0.03;
const EMP_DROP_CHANCE = 0.025;

const TRAP_CYCLE_MS = 2600;
const TRAP_SAFE_MS = 1500;
const TRAP_WARN_MS = 400;
const TRAP_DAMAGE = 18;
const TRAP_HIT_RADIUS = 0.5;
const TRAP_PHASE_STAGGER = TRAP_CYCLE_MS / 3;

const FILTER_STATES = 3;
const FILTER_GOAL = 2;
const FILTER_TINTS = [0xff4a5e, 0xe8b93d, 0x7dff6a];
const FILTER_LABELS = ['FECHADO', 'MEIO', 'ABERTO'];
// Partindo de todos abertos, cliques inversos geram um estado sempre solúvel.
const FILTER_SETUP_CLICKS = [0, 2, 1, 0];

const PAIR_LABELS = ['A', 'A', 'B', 'B', 'C', 'C'];

const PROPS = [
  { gx: 4, gy: 6, texture: 'prop_capsule' }, { gx: 20, gy: 4, texture: 'prop_barrel' },
  { gx: 43, gy: 6, texture: 'prop_crate' }, { gx: 58, gy: 4, texture: 'prop_capsule' },
  { gx: 7, gy: 18, texture: 'prop_capsule' }, { gx: 31, gy: 18, texture: 'prop_crate' },
  { gx: 46, gy: 15, texture: 'prop_barrel' }, { gx: 4, gy: 30, texture: 'prop_pipe' },
  { gx: 20, gy: 30, texture: 'prop_crate' }, { gx: 57, gy: 30, texture: 'prop_capsule' },
  { gx: 16, gy: 42, texture: 'prop_barrel' }, { gx: 58, gy: 42, texture: 'prop_capsule' },
  { gx: 20, gy: 54, texture: 'prop_capsule' }, { gx: 44, gy: 54, texture: 'prop_crate' }
];

function shuffle(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export default class ColoniaScene extends Phaser.Scene {
  constructor() {
    super('ColoniaScene');
  }

  create() {
    const { grid, markers, zones, hazardTiles } = buildColoniaWing();
    this.zones = zones;
    this.currentZone = null;
    this.tileMap = new TileMap(this, grid, {
      wallTexture: 'wall_colonia',
      floorTexture: 'floor_colonia',
      floorVariants: [
        { key: 'floor_colonia', weight: 0.72 },
        { key: 'floor_colonia_vent', weight: 0.18 },
        { key: 'floor_colonia_stain', weight: 0.1 }
      ],
      markers,
      hazardTiles,
      hazardTextures: { toxic: 'floor_toxic' }
    });

    for (const prop of PROPS) {
      const world = this.tileMap.gridToWorld(prop.gx, prop.gy);
      this.add.image(world.x, world.y, prop.texture).setOrigin(0.5, 0.85).setDepth(prop.gy * 10 + 2);
    }

    const spawn = this.tileMap.marker('S');
    this.player = new Player(this, this.tileMap, spawn);

    const onEnemyDeath = (enemy) => this._handleEnemyDrop(enemy);
    this.enemies = [
      ...this.tileMap.allMarkers('X').map((m) => new InfectedEnemy(this, this.tileMap, m.gx, m.gy, {
        hp: 52, speed: 1.15, attackDamage: 16, xpReward: 26,
        ammoDropChance: AMMO_CHANCE_NORMAL, onDeath: onEnemyDeath
      })),
      ...this.tileMap.allMarkers('T').map((m) => new BloatedEnemy(this, this.tileMap, m.gx, m.gy, {
        hp: 205, speed: 0.92, attackDamage: 30, xpReward: 66, hpBarWidth: 32,
        ammoDropChance: AMMO_CHANCE_TANK, onDeath: onEnemyDeath
      }))
    ];

    const subSpawn = this.tileMap.marker('M');
    this.subChefe = new EnfermeiroBoss(this, this.tileMap, subSpawn.gx, subSpawn.gy, {
      onDeath: onEnemyDeath
    });
    this.enemies.push(this.subChefe);

    const bossSpawn = this.tileMap.marker('B');
    this.boss = new MatriarchBoss(this, this.tileMap, bossSpawn.gx, bossSpawn.gy, {
      onDeath: onEnemyDeath
    });
    this.enemies.push(this.boss);

    const bossWorld = this.tileMap.gridToWorld(bossSpawn.gx, bossSpawn.gy);
    this.add.image(bossWorld.x, bossWorld.y, 'light_pool').setDepth(-999).setScale(2.1).setBlendMode(Phaser.BlendModes.ADD).setTint(0x6dff4a);

    const npcSpawns = this.tileMap.allMarkers('N');
    this.npcs = COLONIA_CAPTIVES
      .map((captive, i) => ({ captive, spot: npcSpawns[i] }))
      .filter(({ captive }) => !GameState.rescuedNpcs.has(captive.id))
      .map(({ captive, spot }) => new NPC(this, this.tileMap, spot.gx, spot.gy, {
        id: captive.id,
        name: captive.name,
        texture: 'npc_worker',
        tint: 0x8fbf6a,
        lines: captive.dungeonLines
      }));

    this.items = ITEMS
      .filter((item) => !GameState.itemsTaken.has(item.id))
      .map((item) => {
        const spot = this.tileMap.marker(item.markerKey);
        const world = this.tileMap.gridToWorld(spot.gx, spot.gy);
        this.add.image(world.x, world.y, 'light_pool').setDepth(-999).setBlendMode(Phaser.BlendModes.ADD).setTint(0x7dff6a);
        const sprite = this.add.image(world.x, world.y, item.texture).setDepth(9000);
        if (item.tint) sprite.setTint(item.tint);
        this.tweens.add({ targets: sprite, y: sprite.y - 5, duration: 700, yoyo: true, repeat: -1 });
        return { ...item, gx: spot.gx, gy: spot.gy, sprite, taken: false };
      });

    this.tileMap.allMarkers('H').forEach((spot, i) => {
      const world = this.tileMap.gridToWorld(spot.gx, spot.gy);
      this.add.image(world.x, world.y, 'light_pool').setDepth(-999).setBlendMode(Phaser.BlendModes.ADD).setTint(0x9fffb3);
      const sprite = this.add.image(world.x, world.y, 'item_medkit').setDepth(9000);
      this.tweens.add({ targets: sprite, y: sprite.y - 5, duration: 700, yoyo: true, repeat: -1 });
      this.items.push({
        id: `colonia_medkit_${i}`, kind: 'heal', amount: HEAL_AMOUNT,
        gx: spot.gx, gy: spot.gy, sprite, taken: false
      });
    });

    this.toxicPuddles = [];
    this.contaminatedUntil = 0;

    this._buildTraps();
    this._buildFilterPuzzle();
    this._buildPairPuzzle();
    this._buildGates();

    this.levelEnded = false;
    this.transitioning = false;
    this.returnDoorPos = null;
    this._lastRemaining = null;

    this._setupCamera();
    this._setupInput();
    this.cameras.main.fadeIn(350, 12, 24, 10);
    playMusic(this, 'music_colonia');

    initHud(this, () => {
      this.game.events.emit('hud-init', { label: 'COLÔNIA DE CONTAMINADOS', showEnemies: true, sceneKey: 'ColoniaScene' });
      this._emitStats();
      this.game.events.emit('enemies-remaining', this.enemies.length);
    });
  }

  spawnToxicPuddle(gx, gy, opts = {}) {
    const duration = opts.duration || 2800;
    const radius = opts.radius || 0.85;
    const tint = opts.tint || 0x6dff4a;
    const world = this.tileMap.gridToWorld(gx, gy);
    const sprite = this.add.image(world.x, world.y, 'light_pool')
      .setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setDepth(-990)
      .setScale(radius * 0.9).setAlpha(0.75);
    this.tweens.add({
      targets: sprite, alpha: 0.3, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.InOut'
    });
    this.toxicPuddles.push({ gx, gy, radius, sprite, until: this.time.now + duration });
  }

  _prunePuddles() {
    const now = this.time.now;
    this.toxicPuddles = this.toxicPuddles.filter((p) => {
      if (now >= p.until) {
        if (p.sprite) p.sprite.destroy();
        return false;
      }
      return true;
    });
  }

  _onToxicTile() {
    if (this.tileMap.isToxic(this.player.gx, this.player.gy)) return true;
    return this.toxicPuddles.some((p) => {
      const dist = Math.hypot(this.player.gx - p.gx, this.player.gy - p.gy);
      return dist <= p.radius;
    });
  }

  // Dano gradual: tique enquanto está no lodo E por um breve momento depois
  // de sair (contaminação na pele). O Traje zera os dois na hora.
  _checkToxicFloor() {
    if (GameState.toxinImmune || !this.player.alive) {
      this.contaminatedUntil = 0;
      return;
    }
    if (this._onToxicTile()) {
      this.contaminatedUntil = this.time.now + TOXIC_LINGER_MS;
      this.player.takeDamage(TOXIC_TICK_DAMAGE);
      return;
    }
    if (this.time.now < this.contaminatedUntil) {
      this.player.takeDamage(TOXIC_TICK_DAMAGE);
    }
  }

  _buildGates() {
    this.gates = ['L1', 'L2', 'L3', 'L4'].map((key) => {
      const spot = this.tileMap.marker(key);
      const world = this.tileMap.gridToWorld(spot.gx, spot.gy);
      const sprite = this.add.image(world.x, world.y, 'door_colonia').setDepth(9000).setTint(0xff4a5e);
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
    gate.sprite.setTint(0x7dff6a);
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
    if (this.filterSolved) this._openGate(gate1);
    if (this.pairSolved) this._openGate(gate2);
    if (this.filterSolved && this.pairSolved) this._openGate(gate3);
    if (!this.subChefe.alive) this._openGate(gate4);

    this._checkGateWarning(gate1, 'Acesso bloqueado. Os filtros de ar ainda não estão alinhados.');
    this._checkGateWarning(gate2, 'Acesso bloqueado. A Sala de Isolamento ainda não reconheceu os pares.');
    this._checkGateWarning(gate3, 'O Ninho só abre quando os filtros E o isolamento estiverem resolvidos.');
    this._checkGateWarning(gate4, 'O Enfermeiro ainda controla essa saída.');
  }

  _buildTraps() {
    this.traps = this.tileMap.allMarkers('D').map((spot) => {
      const world = this.tileMap.gridToWorld(spot.gx, spot.gy);
      const sprite = this.add.image(world.x, world.y, 'trap_off').setDepth(spot.gy * 10 + 1);
      const phaseOffsetMs = (spot.phase || 0) * TRAP_PHASE_STAGGER;
      return { gx: spot.gx, gy: spot.gy, sprite, phaseOffsetMs, state: 'off', hasHit: false };
    });
  }

  _trapStateAt(now, phaseOffsetMs) {
    const t = (now + phaseOffsetMs) % TRAP_CYCLE_MS;
    if (t < TRAP_SAFE_MS) return 'off';
    if (t < TRAP_SAFE_MS + TRAP_WARN_MS) return 'warn';
    return 'on';
  }

  _updateTraps() {
    const now = this.time.now;
    for (const trap of this.traps) {
      const state = this._trapStateAt(now, trap.phaseOffsetMs);
      if (state !== trap.state) {
        trap.state = state;
        trap.sprite.setTexture(state === 'off' ? 'trap_off' : state === 'warn' ? 'trap_warn' : 'trap_on');
        if (state === 'on') trap.hasHit = false;
      }
      if (state === 'on' && !trap.hasHit && this.player.alive) {
        const dist = Math.hypot(this.player.gx - trap.gx, this.player.gy - trap.gy);
        if (dist <= TRAP_HIT_RADIUS) {
          this.player.takeDamage(TRAP_DAMAGE);
          trap.hasHit = true;
        }
      }
    }
  }

  // -------- Sala de Filtros: 4 tambores, 3 estados, vizinhos giram juntos --------
  _rotateFilter(index, delta) {
    const n = this.filterDrums.length;
    for (const j of [index - 1, index, index + 1]) {
      if (j < 0 || j >= n) continue;
      this.filterDrums[j].state = (this.filterDrums[j].state + delta + FILTER_STATES) % FILTER_STATES;
    }
  }

  _buildFilterPuzzle() {
    this.filterDrums = this.tileMap.allMarkers('Q').map((spot, i) => {
      const world = this.tileMap.gridToWorld(spot.gx, spot.gy);
      const sprite = this.add.image(world.x, world.y, 'tile_filter_2').setDepth(spot.gy * 10 + 1);
      const glow = this.add.image(world.x, world.y, 'light_pool')
        .setBlendMode(Phaser.BlendModes.ADD).setTint(0x7dff6a).setScale(0.55).setDepth(9500);
      const label = this.add.text(world.x, world.y, '', {
        fontFamily: 'Courier New', fontSize: '8px', color: '#d8f0c8'
      }).setOrigin(0.5).setDepth(spot.gy * 10 + 2);
      return { index: i, gx: spot.gx, gy: spot.gy, sprite, glow, label, state: FILTER_GOAL, wasOn: false };
    });
    for (const click of FILTER_SETUP_CLICKS) this._rotateFilter(click, 2);
    this.filterDrums.forEach((d) => this._paintFilter(d));
    this.filterSolved = false;
  }

  _paintFilter(drum) {
    const key = `tile_filter_${drum.state}`;
    if (this.textures.exists(key)) {
      drum.sprite.setTexture(key);
      drum.sprite.clearTint();
    } else {
      drum.sprite.setTexture(drum.state === FILTER_GOAL ? 'tile_circuit_on' : 'tile_circuit_off');
      drum.sprite.setTint(FILTER_TINTS[drum.state]);
    }
    drum.glow.setVisible(drum.state === FILTER_GOAL);
    drum.label.setText(FILTER_LABELS[drum.state]);
    drum.label.setColor(drum.state === FILTER_GOAL ? '#0a0c18' : '#d8f0c8');
  }

  _checkFilterPuzzle() {
    if (this.filterSolved) return;
    for (const drum of this.filterDrums) {
      const dist = Math.hypot(this.player.gx - drum.gx, this.player.gy - drum.gy);
      const on = dist < 0.55;
      if (on && !drum.wasOn) {
        this._rotateFilter(drum.index, 1);
        this.filterDrums.forEach((d) => this._paintFilter(d));
        playSfx(this, 'sfx_menu_open', { volume: 0.35 });
        if (this.filterDrums.every((d) => d.state === FILTER_GOAL)) {
          this.filterSolved = true;
          this.game.events.emit('item-pickup', 'Filtros alinhados — a Câmara do Hospedeiro destrancou!');
        }
      }
      drum.wasOn = on;
    }
  }

  // -------- Sala de Isolamento: memória de pares (não sequência, não circuito) --------
  _buildPairPuzzle() {
    const labels = shuffle(PAIR_LABELS);
    this.pairPlates = this.tileMap.allMarkers('K').map((spot, i) => {
      const world = this.tileMap.gridToWorld(spot.gx, spot.gy);
      const sprite = this.add.image(world.x, world.y, 'tile_sequence_off').setDepth(spot.gy * 10 + 1);
      const label = this.add.text(world.x, world.y, labels[i], {
        fontFamily: 'Courier New', fontSize: '16px', color: '#9fb0d0'
      }).setOrigin(0.5).setDepth(spot.gy * 10 + 2);
      const glow = this.add.image(world.x, world.y, 'light_pool')
        .setBlendMode(Phaser.BlendModes.ADD).setTint(0x7dff6a).setScale(0.55).setDepth(9500).setVisible(false);
      return { pairId: labels[i], gx: spot.gx, gy: spot.gy, sprite, label, glow, locked: false, selected: false, wasOn: false };
    });
    this.pairSelected = null;
    this.pairSolved = false;
  }

  _paintPair(plate) {
    const lit = plate.locked || plate.selected;
    plate.sprite.setTexture(lit ? 'tile_sequence_on' : 'tile_sequence_off');
    plate.glow.setVisible(lit);
    plate.label.setColor(lit ? '#0a0c18' : '#9fb0d0');
  }

  _checkPairPuzzle() {
    if (this.pairSolved) return;
    for (const plate of this.pairPlates) {
      const dist = Math.hypot(this.player.gx - plate.gx, this.player.gy - plate.gy);
      const on = dist < 0.55;
      if (on && !plate.wasOn && !plate.locked) {
        if (!this.pairSelected) {
          plate.selected = true;
          this.pairSelected = plate;
          this._paintPair(plate);
          playSfx(this, 'sfx_menu_open', { volume: 0.3 });
        } else if (this.pairSelected === plate) {
          // mesmo prato — ignora
        } else if (this.pairSelected.pairId === plate.pairId) {
          this.pairSelected.locked = true;
          this.pairSelected.selected = false;
          plate.locked = true;
          this._paintPair(this.pairSelected);
          this._paintPair(plate);
          this.pairSelected = null;
          playSfx(this, 'sfx_menu_open', { volume: 0.4 });
          if (this.pairPlates.every((p) => p.locked)) {
            this.pairSolved = true;
            this.game.events.emit('item-pickup', 'Isolamento reconhecido — a Estação de Extração destrancou!');
          } else {
            this.game.events.emit('item-pickup', `Par ${plate.pairId} confirmado.`);
          }
        } else {
          const first = this.pairSelected;
          first.selected = false;
          this._paintPair(first);
          this.pairSelected = null;
          playSfx(this, 'sfx_player_hurt', { volume: 0.3 });
          this.game.events.emit('item-pickup', 'Par errado. As placas apagaram.');
        }
      }
      plate.wasOn = on;
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
          equipArmor(item.name, item.value, { toxinImmune: !!item.toxinImmune });
          this.player.maxHp = GameState.maxHp;
          this.player.hp = GameState.hp;
          this.contaminatedUntil = 0;
          this.game.events.emit('item-pickup', item.toxinImmune
            ? `${item.name} equipado! O piso tóxico para de cobrar.`
            : `${item.name} equipada! HP máximo aumentado.`);
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
    this._checkItemPickups();

    if (this.levelEnded) {
      if (this.returnDoorPos) this._checkReturnDoor();
      return;
    }

    this._prunePuddles();
    this._checkToxicFloor();
    this._updateTraps();
    this._checkFilterPuzzle();
    this._checkPairPuzzle();
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
      GameState.coloniaCleared = true;
      for (const captive of COLONIA_CAPTIVES) rescueNpc(captive.id);
      this._spawnReturnDoor();
    }
  }

  _spawnReturnDoor() {
    this.returnDoorPos = { gx: this.boss.spawn.gx, gy: this.boss.spawn.gy + 1 };
    const world = this.tileMap.gridToWorld(this.returnDoorPos.gx, this.returnDoorPos.gy);
    this.returnDoorSprite = this.add.image(world.x, world.y, 'door').setDepth(9000);
    this.tweens.add({ targets: this.returnDoorSprite, alpha: 0.45, duration: 650, yoyo: true, repeat: -1 });
    this.add.text(world.x, world.y - 20, 'SUBMUNDO ←', {
      fontFamily: 'Courier New', fontSize: '8px', color: '#7dff6a'
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
    this.cameras.main.flash(150, 110, 255, 80);
    this.cameras.main.fadeOut(420, 10, 18, 8);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.stop('UIScene');
      this.scene.start('SubmundoScene');
    });
  }
}
