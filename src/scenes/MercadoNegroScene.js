import Phaser from 'phaser';
import TileMap from '../world/TileMap.js';
import { buildMercadoNegroWing } from '../world/MercadoNegroLayout.js';
import Player from '../entities/Player.js';
import Enemy from '../entities/Enemy.js';
import MiniBoss from '../entities/MiniBoss.js';
import MarketBaronBoss from '../entities/MarketBaronBoss.js';
import NPC from '../entities/NPC.js';
import { DIRECTIONS } from '../utils/constants.js';
import { GameState, equipWeapon, equipArmor, rescueNpc, addInventoryItem, upgradePistol, addAmmo, addStim, addEmpCharge } from '../state/GameState.js';
import { MERCADO_NEGRO_CAPTIVES } from '../state/MercadoNegroCaptives.js';
import { initHud } from '../utils/hud.js';
import { playMusic, playSfx } from '../audio/AudioManager.js';

// Uma melhoria de cada tipo, como toda fase — sem bota: a bota da 3ª região
// já foi dada na Estação Fantasma (uma por região, ver nota em
// DungeonScene.js), e essa fase não introduz uma 2ª.
const ITEMS = [
  { id: 'mercado_weapon', markerKey: 'I', texture: 'item_sword', name: 'Lâmina do Mercado Negro', kind: 'weapon', value: 270, tint: 0xe8b93d },
  { id: 'mercado_pistol', markerKey: 'C', texture: 'item_pistol', name: 'Pistola do Contrabandista', kind: 'pistol', pistolDamage: 105, ammoBonus: 6, tint: 0xe8b93d },
  { id: 'mercado_armor', markerKey: 'A', texture: 'item_armor', name: 'Colete do Mercado', kind: 'armor', value: 175, tint: 0xe8b93d }
];

const HEAL_AMOUNT = 60;
const AMMO_CHANCE_NORMAL = 0.1;
const AMMO_CHANCE_TANK = 0.2;
const BOSS_TRIPLE_AMMO_CHANCE = 1 / 3;
const STIM_DROP_CHANCE = 0.03;
const EMP_DROP_CHANCE = 0.025;

const LIT_TINT = 0x9fffe8;

// Vizinhos (dentro do formato em cruz) que cada célula do circuito também
// alterna ao ser ativada — mesmo puzzle "apaga-liga" da Torre de Segurança.
const CIRCUIT_NEIGHBORS = {
  center: ['top', 'bottom', 'left', 'right'],
  top: ['center'],
  bottom: ['center'],
  left: ['center'],
  right: ['center']
};
const CIRCUIT_ROLES = ['center', 'top', 'bottom', 'left', 'right'];
const CIRCUIT_INITIAL_LIT = { center: true, top: false, bottom: false, left: true, right: true };

// Armadilhas cíclicas (mesma mecânica do Arsenal Blindado) — 2600ms de
// ciclo, 1500ms segura, 400ms de aviso, resto erguida.
const TRAP_CYCLE_MS = 2600;
const TRAP_SAFE_MS = 1500;
const TRAP_WARN_MS = 400;
const TRAP_DAMAGE = 18;
const TRAP_HIT_RADIUS = 0.5;
const TRAP_PHASE_STAGGER = TRAP_CYCLE_MS / 3;

function shuffleSequence(n) {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Decoração de cenário — barracas do mercado (caixote/barril/tubulação já
// existentes + o quiosque, retintado em âmbar/couro em vez do magenta neon
// do Distrito).
const PROPS = [
  { gx: 4, gy: 6, texture: 'prop_crate' }, { gx: 19, gy: 4, texture: 'prop_kiosk', tint: 0xc9a06a },
  { gx: 31, gy: 4, texture: 'prop_barrel' }, { gx: 4, gy: 17, texture: 'prop_pipe' },
  { gx: 5, gy: 29, texture: 'prop_crate' }, { gx: 17, gy: 27, texture: 'prop_kiosk', tint: 0xc9a06a },
  { gx: 43, gy: 27, texture: 'prop_barrel' }, { gx: 57, gy: 27, texture: 'prop_kiosk', tint: 0xc9a06a },
  { gx: 69, gy: 29, texture: 'prop_crate' }, { gx: 57, gy: 39, texture: 'prop_pipe' },
  { gx: 43, gy: 43, texture: 'prop_barrel' }, { gx: 5, gy: 51, texture: 'prop_crate' }
];

export default class MercadoNegroScene extends Phaser.Scene {
  constructor() {
    super('MercadoNegroScene');
  }

  create() {
    const { grid, markers, zones } = buildMercadoNegroWing();
    this.zones = zones;
    this.currentZone = null;
    this.tileMap = new TileMap(this, grid, {
      wallTexture: 'wall_submundo',
      floorTexture: 'floor_submundo',
      floorVariants: [
        { key: 'floor_submundo', weight: 0.85 },
        { key: 'floor_submundo_vent', weight: 0.15 }
      ],
      markers
    });

    for (const prop of PROPS) {
      const world = this.tileMap.gridToWorld(prop.gx, prop.gy);
      const sprite = this.add.image(world.x, world.y, prop.texture).setOrigin(0.5, 0.85).setDepth(prop.gy * 10 + 2);
      if (prop.tint) sprite.setTint(prop.tint);
    }

    const spawn = this.tileMap.marker('S');
    this.player = new Player(this, this.tileMap, spawn);

    const onEnemyDeath = (enemy) => this._handleEnemyDrop(enemy);
    this.enemies = [
      ...this.tileMap.allMarkers('X').map((m) => new Enemy(this, this.tileMap, m.gx, m.gy, {
        hp: 48, speed: 1.1, attackDamage: 15, xpReward: 24, texture: 'enemy_militia',
        ammoDropChance: AMMO_CHANCE_NORMAL, onDeath: onEnemyDeath
      })),
      ...this.tileMap.allMarkers('T').map((m) => new Enemy(this, this.tileMap, m.gx, m.gy, {
        hp: 195, speed: 1.0, attackDamage: 28, xpReward: 62, texture: 'enemy_tank', hpBarWidth: 32,
        ammoDropChance: AMMO_CHANCE_TANK, onDeath: onEnemyDeath
      }))
    ];

    // Capataz do Mercado — sub-chefe atrás do Cofre de Acesso. Derrotá-lo é
    // o que reabre a saída da própria sala (ver _checkSubChefeExitGate),
    // igual ao Guardião da Sinalização na Fase 09.
    const capatazSpawn = this.tileMap.marker('M');
    this.subChefe = new MiniBoss(this, this.tileMap, capatazSpawn.gx, capatazSpawn.gy, {
      hp: 350, attackDamage: 27, xpReward: 130, texture: 'enemy_miniboss',
      name: 'CAPATAZ DO MERCADO', onDeath: onEnemyDeath
    });
    this.enemies.push(this.subChefe);

    const bossSpawn = this.tileMap.marker('B');
    this.boss = new MarketBaronBoss(this, this.tileMap, bossSpawn.gx, bossSpawn.gy, {
      onDeath: onEnemyDeath
    });
    this.enemies.push(this.boss);

    const bossWorld = this.tileMap.gridToWorld(bossSpawn.gx, bossSpawn.gy);
    this.add.image(bossWorld.x, bossWorld.y, 'light_pool').setDepth(-999).setScale(2.1).setBlendMode(Phaser.BlendModes.ADD).setTint(0xe8b93d);

    const npcSpawns = this.tileMap.allMarkers('N');
    this.npcs = MERCADO_NEGRO_CAPTIVES
      .map((captive, i) => ({ captive, spot: npcSpawns[i] }))
      .filter(({ captive }) => !GameState.rescuedNpcs.has(captive.id))
      .map(({ captive, spot }, i) => new NPC(this, this.tileMap, spot.gx, spot.gy, {
        id: captive.id,
        name: captive.name,
        texture: 'npc_worker',
        lines: captive.dungeonLines,
        tint: i === 1 ? 0xd8c090 : 0xc9a06a
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

    this.tileMap.allMarkers('H').forEach((spot, i) => {
      const world = this.tileMap.gridToWorld(spot.gx, spot.gy);
      this.add.image(world.x, world.y, 'light_pool').setDepth(-999).setBlendMode(Phaser.BlendModes.ADD).setTint(0x9fffb3);
      const sprite = this.add.image(world.x, world.y, 'item_medkit').setDepth(9000);
      this.tweens.add({ targets: sprite, y: sprite.y - 5, duration: 700, yoyo: true, repeat: -1 });
      this.items.push({
        id: `mercado_medkit_${i}`, kind: 'heal', amount: HEAL_AMOUNT,
        gx: spot.gx, gy: spot.gy, sprite, taken: false
      });
    });

    this._buildTraps();
    this._buildSequencePuzzle();
    this._buildCircuitPuzzle();
    this._buildSignalPuzzle();
    this._buildGates();

    this.levelEnded = false;
    this.transitioning = false;
    this.returnDoorPos = null;
    this._lastRemaining = null;

    this._setupCamera();
    this._setupInput();
    this.cameras.main.fadeIn(350, 8, 6, 4);
    playMusic(this, 'music_submundo');

    initHud(this, () => {
      this.game.events.emit('hud-init', { label: 'MERCADO NEGRO DOS TÚNEIS', showEnemies: true, sceneKey: 'MercadoNegroScene' });
      this._emitStats();
      this.game.events.emit('enemies-remaining', this.enemies.length);
    });
  }

  // -------- portas seladas --------
  // 4 portas: gate1 (Cofre de Acesso -> Câmara do Capataz, abre com a
  // Sequência), gate2 (Sala de Distribuição -> Arsenal Secreto, abre com o
  // Circuito), gate3 (Cofre do Barão -> Salão do Barão, abre com o Sinal),
  // gate4 (saída da Câmara do Capataz, abre quando o Capataz morre).
  _buildGates() {
    this.gates = ['L1', 'L2', 'L3', 'L4'].map((key) => {
      const spot = this.tileMap.marker(key);
      const world = this.tileMap.gridToWorld(spot.gx, spot.gy);
      const sprite = this.add.image(world.x, world.y, 'door').setDepth(9000).setTint(0xff4a5e);
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
    gate.sprite.setTint(0xc9a06a);
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
    const gate1 = this.gates[0];
    const gate2 = this.gates[1];
    const gate3 = this.gates[2];
    const gate4 = this.gates[3];

    if (this.sequenceSolved) this._openGate(gate1);
    if (this.circuitSolved) this._openGate(gate2);
    if (this.signalSolved) this._openGate(gate3);
    if (!this.subChefe.alive) this._openGate(gate4);

    this._checkGateWarning(gate1, 'Acesso bloqueado. Resolva o Cofre de Acesso primeiro.');
    this._checkGateWarning(gate2, 'Acesso bloqueado. A Sala de Distribuição controla essa passagem.');
    this._checkGateWarning(gate3, 'Acesso bloqueado. O Cofre do Barão ainda está trancado.');
    this._checkGateWarning(gate4, 'O Capataz do Mercado ainda controla essa saída.');
  }

  // -------- armadilhas (mesma mecânica do Arsenal Blindado) --------
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

  // -------- Cofre de Acesso: puzzle de Sequência (mesmo da Torre) --------
  _buildSequencePuzzle() {
    this.sequencePlates = this.tileMap.allMarkers('Q').map((spot, i) => {
      const world = this.tileMap.gridToWorld(spot.gx, spot.gy);
      const sprite = this.add.image(world.x, world.y, 'tile_sequence_off').setDepth(spot.gy * 10 + 1);
      const label = this.add.text(world.x, world.y, String(i + 1), {
        fontFamily: 'Courier New', fontSize: '16px', color: '#9fb0d0'
      }).setOrigin(0.5).setDepth(spot.gy * 10 + 2);
      const glow = this.add.image(world.x, world.y, 'light_pool')
        .setBlendMode(Phaser.BlendModes.ADD).setTint(LIT_TINT).setScale(0.6).setDepth(9500).setVisible(false);
      return { order: i + 1, gx: spot.gx, gy: spot.gy, sprite, label, glow, wasOn: false };
    });
    this.sequenceProgress = 0;
    this.sequenceSolved = false;
  }

  _paintSequencePlate(plate, lit) {
    plate.sprite.setTexture(lit ? 'tile_sequence_on' : 'tile_sequence_off');
    plate.glow.setVisible(lit);
    plate.label.setColor(lit ? '#0a0c18' : '#9fb0d0');
  }

  _checkSequencePuzzle() {
    if (this.sequenceSolved) return;
    for (const plate of this.sequencePlates) {
      const dist = Math.hypot(this.player.gx - plate.gx, this.player.gy - plate.gy);
      const on = dist < 0.55;
      if (on && !plate.wasOn) {
        if (plate.order === this.sequenceProgress + 1) {
          this.sequenceProgress++;
          this._paintSequencePlate(plate, true);
          playSfx(this, 'sfx_menu_open', { volume: 0.4 });
          if (this.sequenceProgress === this.sequencePlates.length) {
            this.sequenceSolved = true;
            this.game.events.emit('item-pickup', 'Cofre de Acesso destrancado!');
          } else {
            this.game.events.emit('item-pickup', `Placa ${plate.order} ativada. (${this.sequenceProgress}/${this.sequencePlates.length})`);
          }
        } else {
          const wasProgressing = this.sequenceProgress > 0;
          this.sequenceProgress = plate.order === 1 ? 1 : 0;
          for (const p of this.sequencePlates) this._paintSequencePlate(p, p.order <= this.sequenceProgress);
          if (wasProgressing) {
            playSfx(this, 'sfx_player_hurt', { volume: 0.3 });
            this.game.events.emit('item-pickup', 'Sequência errada! Reiniciando...');
          }
        }
      }
      plate.wasOn = on;
    }
  }

  // -------- Sala de Distribuição: puzzle de Circuito (mesmo da Torre) --------
  _buildCircuitPuzzle() {
    this.circuitTiles = this.tileMap.allMarkers('K').map((spot, i) => {
      const role = CIRCUIT_ROLES[i];
      const world = this.tileMap.gridToWorld(spot.gx, spot.gy);
      const sprite = this.add.image(world.x, world.y, 'tile_circuit_off').setDepth(spot.gy * 10 + 1);
      const glow = this.add.image(world.x, world.y, 'light_pool')
        .setBlendMode(Phaser.BlendModes.ADD).setTint(LIT_TINT).setScale(0.55).setDepth(9500).setVisible(false);
      return { role, gx: spot.gx, gy: spot.gy, sprite, glow, lit: CIRCUIT_INITIAL_LIT[role], wasOn: false };
    });
    this.circuitTiles.forEach((t) => this._paintCircuitTile(t));
    this.circuitSolved = false;
  }

  _paintCircuitTile(tile) {
    tile.sprite.setTexture(tile.lit ? 'tile_circuit_on' : 'tile_circuit_off');
    tile.glow.setVisible(tile.lit);
  }

  _toggleCircuit(role) {
    const affected = [role, ...CIRCUIT_NEIGHBORS[role]];
    for (const r of affected) {
      const tile = this.circuitTiles.find((t) => t.role === r);
      tile.lit = !tile.lit;
      this._paintCircuitTile(tile);
    }
  }

  _checkCircuitPuzzle() {
    if (this.circuitSolved) return;
    for (const tile of this.circuitTiles) {
      const dist = Math.hypot(this.player.gx - tile.gx, this.player.gy - tile.gy);
      const on = dist < 0.55;
      if (on && !tile.wasOn) {
        this._toggleCircuit(tile.role);
        playSfx(this, 'sfx_menu_open', { volume: 0.35 });
        if (this.circuitTiles.every((t) => t.lit)) {
          this.circuitSolved = true;
          this.game.events.emit('item-pickup', 'Distribuição estabilizada — Arsenal Secreto destrancado!');
        }
      }
      tile.wasOn = on;
    }
  }

  // -------- Cofre do Barão: puzzle de Sinal (mesmo da Central de Vigilância) --------
  _buildSignalPuzzle() {
    this.signalPads = this.tileMap.allMarkers('SG').map((spot, i) => {
      const world = this.tileMap.gridToWorld(spot.gx, spot.gy);
      const sprite = this.add.image(world.x, world.y, 'tile_signal_off').setDepth(spot.gy * 10 + 1);
      const glow = this.add.image(world.x, world.y, 'light_pool')
        .setBlendMode(Phaser.BlendModes.ADD).setTint(0x3dffa0).setScale(0.6).setDepth(9500).setVisible(false);
      return { index: i, gx: spot.gx, gy: spot.gy, sprite, glow, wasOn: false };
    });
    this.signalSequence = shuffleSequence(this.signalPads.length);
    this.signalStep = 0;
    this.signalSolved = false;
    this.signalBusy = true;
    this.time.delayedCall(900, () => this._playSignalDemo());
  }

  _paintSignal(pad, lit) {
    pad.sprite.setTexture(lit ? 'tile_signal_on' : 'tile_signal_off');
    pad.glow.setVisible(lit);
  }

  _playSignalDemo() {
    this.signalBusy = true;
    this.game.events.emit('item-pickup', 'Observe a sequência de sinais...');
    const stepMs = 620;
    this.signalSequence.forEach((padIndex, i) => {
      this.time.delayedCall(i * stepMs, () => {
        if (!this.signalPads) return;
        this._paintSignal(this.signalPads[padIndex], true);
        playSfx(this, 'sfx_menu_open', { volume: 0.3 });
      });
      this.time.delayedCall(i * stepMs + 420, () => {
        if (!this.signalPads) return;
        this._paintSignal(this.signalPads[padIndex], false);
      });
    });
    this.time.delayedCall(this.signalSequence.length * stepMs, () => {
      this.signalBusy = false;
      this.game.events.emit('item-pickup', 'Repita a sequência pisando nos painéis na mesma ordem.');
    });
  }

  _checkSignalPuzzle() {
    if (this.signalSolved || this.signalBusy) return;
    for (const pad of this.signalPads) {
      const dist = Math.hypot(this.player.gx - pad.gx, this.player.gy - pad.gy);
      const on = dist < 0.55;
      if (on && !pad.wasOn) {
        const expected = this.signalSequence[this.signalStep];
        if (pad.index === expected) {
          this.signalStep++;
          this._paintSignal(pad, true);
          playSfx(this, 'sfx_menu_open', { volume: 0.4 });
          if (this.signalStep === this.signalSequence.length) {
            this.signalSolved = true;
            this.game.events.emit('item-pickup', 'Sinal sincronizado — o Cofre do Barão abriu!');
          } else {
            this.game.events.emit('item-pickup', `Painel correto. (${this.signalStep}/${this.signalSequence.length})`);
          }
        } else {
          const wasProgressing = this.signalStep > 0;
          this.signalStep = 0;
          for (const p of this.signalPads) this._paintSignal(p, false);
          if (wasProgressing) {
            playSfx(this, 'sfx_player_hurt', { volume: 0.3 });
            this.game.events.emit('item-pickup', 'Sinal errado! Observe de novo...');
            this.signalBusy = true;
            this.time.delayedCall(700, () => this._playSignalDemo());
          }
        }
      }
      pad.wasOn = on;
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
    this._updateTraps();
    this._checkSequencePuzzle();
    this._checkCircuitPuzzle();
    this._checkSignalPuzzle();
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
      GameState.mercadoNegroCleared = true;
      for (const captive of MERCADO_NEGRO_CAPTIVES) rescueNpc(captive.id);
      this._spawnReturnDoor();
    }
  }

  _spawnReturnDoor() {
    this.returnDoorPos = { gx: this.boss.spawn.gx, gy: this.boss.spawn.gy + 1 };
    const world = this.tileMap.gridToWorld(this.returnDoorPos.gx, this.returnDoorPos.gy);
    this.returnDoorSprite = this.add.image(world.x, world.y, 'door').setDepth(9000);
    this.tweens.add({ targets: this.returnDoorSprite, alpha: 0.45, duration: 650, yoyo: true, repeat: -1 });
    this.add.text(world.x, world.y - 20, 'SUBMUNDO ←', {
      fontFamily: 'Courier New', fontSize: '8px', color: '#c9a06a'
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
    this.cameras.main.flash(150, 201, 160, 106);
    this.cameras.main.fadeOut(420, 10, 12, 24);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.stop('UIScene');
      this.scene.start('SubmundoScene');
    });
  }
}
