import Phaser from 'phaser';
import TileMap from '../world/TileMap.js';
import { buildTorreControleYard } from '../world/TorreControleLayout.js';
import Player from '../entities/Player.js';
import StackerEnemy from '../entities/StackerEnemy.js';
import ShooterDrone from '../entities/ShooterDrone.js';
import ElectricDrone from '../entities/ElectricDrone.js';
import JammerDrone from '../entities/JammerDrone.js';
import SiphonEnemy from '../entities/SiphonEnemy.js';
import OperadorMestreBoss from '../entities/OperadorMestreBoss.js';
import GuardiaTrafegoBoss from '../entities/GuardiaTrafegoBoss.js';
import RegenteBoss from '../entities/RegenteBoss.js';
import NPC from '../entities/NPC.js';
import { DIRECTIONS } from '../utils/constants.js';
import { GameState, equipWeapon, equipArmor, rescueNpc, upgradePistol, addAmmo, addStim, addEmpCharge, addInventoryItem, setCardLevel, saveGame } from '../state/GameState.js';
import { TORRE_CONTROLE_CAPTIVES } from '../state/TorreControleCaptives.js';
import { initHud } from '../utils/hud.js';
import { playMusic, playSfx } from '../audio/AudioManager.js';

const ITEMS = [
  { id: 'torre_weapon', markerKey: 'I', texture: 'item_sword', name: 'Lâmina de Comando', kind: 'weapon', value: 390, tint: 0xffb347 },
  { id: 'torre_pistol', markerKey: 'C', texture: 'item_pistol', name: 'Pistola Reguladora', kind: 'pistol', pistolDamage: 147, ammoBonus: 6, tint: 0xffb347 },
  { id: 'torre_armor', markerKey: 'A', texture: 'item_armor', name: 'Colete de Comando', kind: 'armor', value: 265, tint: 0xffb347 }
];

const HEAL_AMOUNT = 80;
const AMMO_CHANCE_NORMAL = 0.11;
const BOSS_TRIPLE_AMMO_CHANCE = 1 / 3;
const STIM_DROP_CHANCE = 0.03;
const EMP_DROP_CHANCE = 0.025;

const CONVEYOR_SPEED = 2.2;

const ARM_CYCLE_MS = 2100;
const ARM_TELEGRAPH_MS = 380;
const ARM_STRIKE_MS = 220;
const ARM_STRIKE_RADIUS = 1.35;
const ARM_DAMAGE = 32;

const TRAP_CYCLE_MS = 2600;
const TRAP_SAFE_MS = 1500;
const TRAP_WARN_MS = 400;
const TRAP_DAMAGE = 20;
const TRAP_HIT_RADIUS = 0.5;
const TRAP_PHASE_STAGGER = TRAP_CYCLE_MS / 3;

const LIT_TINT = 0x9fffe8;
const CIRCUIT_NEIGHBORS = {
  center: ['top', 'bottom', 'left', 'right'],
  top: ['center'], bottom: ['center'], left: ['center'], right: ['center']
};
const CIRCUIT_ROLES = ['center', 'top', 'bottom', 'left', 'right'];
const CIRCUIT_INITIAL_LIT = { center: true, top: false, bottom: false, left: true, right: true };

const ACCENT = 0xffb347;

// Cada andar 1-4 sobe o cartão da própria torre ao ficar sem inimigos — o
// andar 5 (puzzle, topo da torre) sobe o nível 5 direto em
// _checkSequencePuzzle/_checkCircuitPuzzle, já que ali a condição é resolver
// o puzzle, não limpar inimigos.
const ROOM_LEVEL_GATES = {
  oesteAndar1: { side: 'oeste', level: 1, gateId: 'oeste_1_2' },
  oesteAndar2: { side: 'oeste', level: 2, gateId: 'oeste_2_3' },
  oesteAndar3: { side: 'oeste', level: 3, gateId: 'oeste_3_4' },
  oesteAndar4: { side: 'oeste', level: 4, gateId: 'oeste_4_5' },
  lesteAndar1: { side: 'leste', level: 1, gateId: 'leste_1_2' },
  lesteAndar2: { side: 'leste', level: 2, gateId: 'leste_2_3' },
  lesteAndar3: { side: 'leste', level: 3, gateId: 'leste_3_4' },
  lesteAndar4: { side: 'leste', level: 4, gateId: 'leste_4_5' }
};

// Elite: mesma classe, stats maiores + tint dourado persistente (sobrevive
// ao flash branco de takeDamage, ver Enemy.js `tintColor`).
const ELITE_TINT = 0xffd24a;
const ELITE_SCALE = 1.2;
const ELITE_HP_MUL = 1.6;
const ELITE_DMG_MUL = 1.35;
const ELITE_XP_MUL = 1.6;

const PORTAL_TRIGGER_DIST = 0.5;

export default class TorreControleScene extends Phaser.Scene {
  constructor() {
    super('TorreControleScene');
  }

  create() {
    const { grid, markers, zones, conveyors, arms, traps, gates, subsoloGate, towers, props } = buildTorreControleYard();
    this.towers = towers;
    this.zones = zones;
    this.currentZone = null;
    this.tileMap = new TileMap(this, grid, {
      wallTexture: 'wall_naval',
      floorTexture: 'floor_naval',
      floorVariants: [
        { key: 'floor_naval', weight: 0.78 },
        { key: 'floor_naval_stripe', weight: 0.22 }
      ],
      markers
    });

    // Reinicia o progresso dos cartões a cada nova tentativa — os inimigos
    // também respawnam do zero, então um cartão "Nível 2" sobrevivendo de uma
    // tentativa anterior (derrota, saída pro hub) ficaria fora de sincronia
    // com portões que voltaram a estar selados.
    GameState.inventory = GameState.inventory.filter(
      (i) => i.id !== towers.oeste.cardId && i.id !== towers.leste.cardId && i.id !== 'torre_subsolo_card'
    );
    saveGame();

    this._buildConveyors(conveyors);
    this._buildArms(arms);
    this._buildTraps(traps);
    this._buildLevelGates(gates);
    this._buildSubsoloGate(subsoloGate);
    this._buildProps(props);

    const spawn = this.tileMap.marker('S');
    this.player = new Player(this, this.tileMap, spawn);

    const onEnemyDeath = (enemy) => this._handleEnemyDrop(enemy);
    this.enemies = [];
    this.roomEnemyGroups = {};
    this.roomClearTriggered = {};
    this.subBossPortals = [];
    const addEnemy = (enemy, room) => {
      this.enemies.push(enemy);
      if (room) {
        if (!this.roomEnemyGroups[room]) this.roomEnemyGroups[room] = [];
        this.roomEnemyGroups[room].push(enemy);
      }
    };

    // Fábrica genérica: mesma classe/textura reaproveitada nos regulares e
    // nos "elite" (marker.elite === true), só com stats maiores + tint
    // dourado persistente — ver ELITE_TINT/Enemy.js `tintColor`.
    const spawnRoomEnemies = (markerKey, EnemyClass, base) => {
      this.tileMap.allMarkers(markerKey).forEach((m) => {
        const stats = m.elite
          ? {
            hp: Math.round(base.hp * ELITE_HP_MUL),
            speed: base.speed,
            attackDamage: Math.round(base.attackDamage * ELITE_DMG_MUL),
            xpReward: Math.round(base.xpReward * ELITE_XP_MUL),
            tint: ELITE_TINT,
            scale: ELITE_SCALE
          }
          : base;
        const enemy = new EnemyClass(this, this.tileMap, m.gx, m.gy, { ...stats, onDeath: onEnemyDeath });
        addEnemy(enemy, m.room);
      });
    };

    spawnRoomEnemies('STACKER', StackerEnemy, { hp: 250, speed: 1.15, attackDamage: 32, xpReward: 72 });
    spawnRoomEnemies('SHOOTER', ShooterDrone, { hp: 82, attackDamage: 19, xpReward: 40 });
    spawnRoomEnemies('ELECTRIC', ElectricDrone, { hp: 80, attackDamage: 20, xpReward: 36 });
    spawnRoomEnemies('JAMMER', JammerDrone, { hp: 75, attackDamage: 16, xpReward: 36 });
    spawnRoomEnemies('SIPHON', SiphonEnemy, { hp: 70, attackDamage: 14, xpReward: 34 });

    const m1Spawn = this.tileMap.marker('M1');
    this.operadorMestre = new OperadorMestreBoss(this, this.tileMap, m1Spawn.gx, m1Spawn.gy, { onDeath: onEnemyDeath });
    this.enemies.push(this.operadorMestre);

    const m2Spawn = this.tileMap.marker('M2');
    this.guardiaTrafego = new GuardiaTrafegoBoss(this, this.tileMap, m2Spawn.gx, m2Spawn.gy, { onDeath: onEnemyDeath });
    this.enemies.push(this.guardiaTrafego);

    const bossSpawn = this.tileMap.marker('B');
    this.boss = new RegenteBoss(this, this.tileMap, bossSpawn.gx, bossSpawn.gy, { onDeath: onEnemyDeath });
    this.enemies.push(this.boss);

    const bossWorld = this.tileMap.gridToWorld(bossSpawn.gx, bossSpawn.gy);
    this.add.image(bossWorld.x, bossWorld.y, 'light_pool').setDepth(-999).setScale(2.4).setBlendMode(Phaser.BlendModes.ADD).setTint(ACCENT);

    const npcSpawns = this.tileMap.allMarkers('N');
    this.npcs = TORRE_CONTROLE_CAPTIVES
      .map((captive, i) => ({ captive, spot: npcSpawns[i] }))
      .filter(({ captive }) => !GameState.rescuedNpcs.has(captive.id))
      .map(({ captive, spot }) => new NPC(this, this.tileMap, spot.gx, spot.gy, {
        id: captive.id, name: captive.name, texture: 'npc_worker', tint: ACCENT, lines: captive.dungeonLines
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
      this.items.push({ id: `torre_medkit_${i}`, kind: 'heal', amount: HEAL_AMOUNT, gx: spot.gx, gy: spot.gy, sprite, taken: false });
    });

    this._buildSequencePuzzle();
    this._buildCircuitPuzzle();
    this.cargoDrops = new Map();

    this.levelEnded = false;
    this.transitioning = false;
    this.returnDoorPos = null;
    this._lastRemaining = null;
    this.armHintShown = false;
    this.trapHintShown = false;
    this.westHintShown = false;
    this.eastHintShown = false;
    this.saguaoHintShown = false;
    this.chamberPortalHintShown = false;

    this._setupCamera();
    this._setupInput();
    this.cameras.main.fadeIn(350, 18, 22, 28);
    playMusic(this, 'music_torre');

    initHud(this, () => {
      this.game.events.emit('hud-init', { label: 'TORRE DE CONTROLE LOGÍSTICO', showEnemies: true, sceneKey: 'TorreControleScene' });
      this._emitStats();
      this.game.events.emit('enemies-remaining', this.enemies.length);
    });
  }

  // --- Decoração ambiental (cabos soltos, contêineres, caixotes, tambores,
  // canos) — puramente visual, sem colisão nem interação.
  _buildProps(propDefs) {
    for (const prop of propDefs) {
      const world = this.tileMap.gridToWorld(prop.gx, prop.gy);
      const tex = this.textures.exists(prop.texture) ? prop.texture : 'prop_crate';
      const sprite = this.add.image(world.x, world.y, tex).setOrigin(0.5, 0.85).setDepth(prop.gy * 10 + 2);
      if (prop.tint) sprite.setTint(prop.tint);
    }
  }

  // --- Esteira (Torre Leste, Andar 1) ------------------------------------
  _buildConveyors(conveyorDefs) {
    this.conveyorMap = new Map();
    for (const c of conveyorDefs) {
      const world = this.tileMap.gridToWorld(c.gx, c.gy);
      const key = c.dx > 0 ? 'conveyor_right' : c.dx < 0 ? 'conveyor_left' : c.dy > 0 ? 'conveyor_down' : 'conveyor_up';
      const tex = this.textures.exists(key) ? key : 'floor_naval_stripe';
      this.add.image(world.x, world.y, tex).setDepth(-4500);
      this.conveyorMap.set(`${c.gx},${c.gy}`, { dx: c.dx, dy: c.dy });
    }
  }

  _updateConveyor(deltaSec) {
    if (!this.player.alive) return;
    const belt = this.conveyorMap.get(`${Math.round(this.player.gx)},${Math.round(this.player.gy)}`);
    if (!belt) return;
    const nx = this.player.gx + belt.dx * CONVEYOR_SPEED * deltaSec;
    if (this.player.canOccupy(nx, this.player.gy)) this.player.gx = nx;
    const ny = this.player.gy + belt.dy * CONVEYOR_SPEED * deltaSec;
    if (this.player.canOccupy(this.player.gx, ny)) this.player.gy = ny;
  }

  // --- Braços robóticos (Torre Leste Andar 1 + Subsolo) ------------------
  _buildArms(armDefs) {
    this.arms = armDefs.map((a) => {
      const world = this.tileMap.gridToWorld(a.gx, a.gy);
      const sprite = this.add.image(world.x, world.y, 'prop_robotarm').setDepth(a.gy * 10 + 3);
      return { ...a, sprite, lastState: 'idle' };
    });
  }

  _armState(arm, now) {
    const t = (now + arm.phaseOffsetMs) % ARM_CYCLE_MS;
    const safeEnd = ARM_CYCLE_MS - ARM_TELEGRAPH_MS - ARM_STRIKE_MS;
    if (t < safeEnd) return 'idle';
    if (t < ARM_CYCLE_MS - ARM_STRIKE_MS) return 'telegraph';
    return 'strike';
  }

  _resolveArmStrike(arm) {
    playSfx(this, 'sfx_enrage', { volume: 0.22 });
    this.cameras.main.shake(90, 0.004);
    const world = this.tileMap.gridToWorld(arm.gx, arm.gy);
    const flash = this.add.image(world.x, world.y, 'light_pool')
      .setTint(0xffffff).setBlendMode(Phaser.BlendModes.ADD).setDepth(9002).setScale(1.2).setAlpha(0.85);
    this.tweens.add({ targets: flash, alpha: 0, scale: 2, duration: 220, onComplete: () => flash.destroy() });
    if (this.player.alive) {
      const dist = Math.hypot(this.player.gx - arm.gx, this.player.gy - arm.gy);
      if (dist <= ARM_STRIKE_RADIUS) this.player.takeDamage(ARM_DAMAGE);
    }
  }

  _updateArms() {
    const now = this.time.now;
    for (const arm of this.arms) {
      const state = this._armState(arm, now);
      if (state !== arm.lastState) {
        if (state === 'strike') this._resolveArmStrike(arm);
        arm.lastState = state;
      }
      if (state === 'idle') {
        arm.sprite.clearTint(); arm.sprite.setAlpha(1); arm.sprite.setScale(1);
      } else if (state === 'telegraph') {
        const span = ARM_CYCLE_MS - ARM_TELEGRAPH_MS - ARM_STRIKE_MS;
        const t = ((now + arm.phaseOffsetMs) % ARM_CYCLE_MS - span) / ARM_TELEGRAPH_MS;
        arm.sprite.setTint(0xff4a5e);
        arm.sprite.setScale(1 + 0.15 * Math.sin(t * Math.PI * 6));
      } else {
        arm.sprite.setTint(0xffffff);
        arm.sprite.setScale(1.3);
      }
    }
  }

  // --- Armadilhas (Torre Oeste, Andar 1) ---------------------------------
  // Espinhos que ciclam sozinhos, sem depender de onde o jogador está —
  // exige cronometragem pra atravessar, não só desvio (mesmo sistema já
  // usado em Arsenal/Mercado Negro/Colônia).
  _buildTraps(trapDefs) {
    this.traps = trapDefs.map((spot) => {
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

  // --- Portões dos cartões (um por andar, sobe de nível pra abrir) -------
  _buildLevelGates(gateDefs) {
    this.levelGates = gateDefs.map((g) => {
      const side = g.id.split('_')[0];
      const sideLabel = side === 'oeste' ? 'OESTE' : 'LESTE';
      const sprites = [];
      for (let x = g.cx1; x <= g.cx2; x++) {
        const world = this.tileMap.gridToWorld(x, g.gy);
        sprites.push(this.add.image(world.x, world.y, 'door_estaleiro').setDepth(9000).setTint(0xff4a5e));
      }
      const midWorld = this.tileMap.gridToWorld((g.cx1 + g.cx2) / 2, g.gy);
      const label = this.add.text(midWorld.x, midWorld.y - 18, `TORRE ${sideLabel} — CARTÃO NÍVEL ${g.requireLevel}`, {
        fontFamily: 'Courier New', fontSize: '8px', color: '#ff8a9c'
      }).setOrigin(0.5).setDepth(9001);
      return { ...g, sprites, label, open: false };
    });
  }

  _openLevelGate(id) {
    const gate = this.levelGates.find((g) => g.id === id);
    if (!gate || gate.open) return;
    gate.open = true;
    for (let x = gate.cx1; x <= gate.cx2; x++) this.tileMap.setWalkable(x, gate.gy, true);
    for (const sprite of gate.sprites) sprite.setTint(ACCENT);
    gate.label.setText('ABERTO');
    playSfx(this, 'sfx_pickup');
  }

  // --- Cartão do Subsolo (exige OS DOIS sub-comandantes derrotados) ------
  _buildSubsoloGate(gate) {
    this.subsoloGatePos = gate;
    const sprites = [];
    for (let x = gate.cx1; x <= gate.cx2; x++) {
      const world = this.tileMap.gridToWorld(x, gate.gy);
      sprites.push(this.add.image(world.x, world.y, 'door_estaleiro').setDepth(9000).setTint(0xff4a5e));
    }
    const midWorld = this.tileMap.gridToWorld((gate.cx1 + gate.cx2) / 2, gate.gy);
    this.subsoloGateLabel = this.add.text(midWorld.x, midWorld.y - 18, 'SUBSOLO SELADO 0/2', {
      fontFamily: 'Courier New', fontSize: '8px', color: '#ff8a9c'
    }).setOrigin(0.5).setDepth(9001);
    this.subsoloGateSprites = sprites;
    this.subsoloGateOpen = false;
  }

  _updateSubsoloGate() {
    if (this.subsoloGateOpen) return;
    const cleared = (this.operadorMestre.alive ? 0 : 1) + (this.guardiaTrafego.alive ? 0 : 1);
    this.subsoloGateLabel.setText(`SUBSOLO SELADO ${cleared}/2`);
    if (cleared === 2) {
      this.subsoloGateOpen = true;
      for (let x = this.subsoloGatePos.cx1; x <= this.subsoloGatePos.cx2; x++) this.tileMap.setWalkable(x, this.subsoloGatePos.gy, true);
      for (const sprite of this.subsoloGateSprites) sprite.setTint(ACCENT);
      this.subsoloGateLabel.setText('ABERTO');
      playSfx(this, 'sfx_pickup');
      addInventoryItem({ id: 'torre_subsolo_card', name: 'Cartão do Subsolo da Torre', icon: 'item_keycard' });
      this.game.events.emit('item-pickup', 'O Operador Mestre e a Guardiã de Tráfego caem — o Cartão do Subsolo da Torre é liberado!');
    }
  }

  // --- Teleporte de retorno (nasce onde o sub-comandante caiu) -----------
  // Cada torre tem 5 andares — sem isso, voltar pro Saguão depois de
  // derrotar o Operador Mestre/a Guardiã de Tráfego significaria descer os
  // 5 andares de novo a pé. Um só uso por sub-confronto, sempre pro Saguão.
  _spawnSubBossPortal(gx, gy) {
    const world = this.tileMap.gridToWorld(gx, gy);
    const saguao = this.tileMap.marker('S');
    this.add.image(world.x, world.y, 'light_pool').setDepth(-999).setScale(1.3).setBlendMode(Phaser.BlendModes.ADD).setTint(0x9f6fff);
    const sprite = this.add.image(world.x, world.y, 'portal').setDepth(9000).setScale(0.7).setTint(0x9f6fff);
    this.tweens.add({ targets: sprite, angle: 360, duration: 3400, repeat: -1 });
    this.add.text(world.x, world.y - 20, 'SAGUÃO ↓', {
      fontFamily: 'Courier New', fontSize: '8px', color: '#c9a8ff'
    }).setOrigin(0.5).setDepth(9001);
    this.subBossPortals.push({ gx, gy, targetGx: saguao.gx, targetGy: saguao.gy, cooldownUntil: 0 });
  }

  _updateSubBossPortals() {
    if (!this.subBossPortals.length || !this.player.alive) return;
    const now = this.time.now;
    for (const portal of this.subBossPortals) {
      if (now < portal.cooldownUntil) continue;
      const dist = Math.hypot(this.player.gx - portal.gx, this.player.gy - portal.gy);
      if (dist < PORTAL_TRIGGER_DIST) {
        this.player.gx = portal.targetGx;
        this.player.gy = portal.targetGy;
        playSfx(this, 'sfx_door', { volume: 0.4 });
        this.cameras.main.flash(120, 159, 111, 255);
        portal.cooldownUntil = now + 900;
      }
    }
  }

  // --- Progresso dos cartões (nível sobe ao limpar cada andar) -----------
  _grantCardLevel(side, level, gateId) {
    const tower = this.towers[side];
    setCardLevel(tower.cardId, tower.cardName, level);
    this._openLevelGate(gateId);
    this._emitStats();
    this.game.events.emit('item-pickup', `${tower.cardName} — Nível ${level}! Passagem liberada.`);
  }

  _checkRoomClears() {
    for (const [room, info] of Object.entries(ROOM_LEVEL_GATES)) {
      if (this.roomClearTriggered[room]) continue;
      const list = this.roomEnemyGroups[room] || [];
      if (list.length > 0 && list.every((e) => !e.alive)) {
        this.roomClearTriggered[room] = true;
        this._grantCardLevel(info.side, info.level, info.gateId);
      }
    }
  }

  // --- Sequência (Torre Oeste, Andar 5) — sobe o cartão pro nível 5 ------
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
            this._grantCardLevel('oeste', 5, 'oeste_5_chamber');
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

  // --- Circuito (Torre Leste, Andar 5) — sobe o cartão pro nível 5 -------
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
          this._grantCardLevel('leste', 5, 'leste_5_chamber');
        }
      }
      tile.wasOn = on;
    }
  }

  // --- Contêiner do guindaste (O Operador Mestre / O Regente) ------------
  isCargoDropCell(gx, gy) {
    return this.cargoDrops.has(`${Math.round(gx)},${Math.round(gy)}`);
  }

  placeCargoDrop(gx, gy, durationMs, opts = {}) {
    gx = Math.round(gx); gy = Math.round(gy);
    const key = `${gx},${gy}`;
    if (this.cargoDrops.has(key)) return null;
    if (!this.tileMap.isWalkable(gx, gy)) return null;
    if (this.player?.alive && Math.round(this.player.gx) === gx && Math.round(this.player.gy) === gy) return null;
    this.tileMap.setWalkable(gx, gy, false);
    const world = this.tileMap.gridToWorld(gx, gy);
    const tex = this.textures.exists('prop_container') ? 'prop_container' : 'prop_crate';
    const sprite = this.add.image(world.x, world.y, tex)
      .setTint(opts.tint || ACCENT).setDepth(gy * 10 + 3).setOrigin(0.5, 0.85).setAlpha(0.96);
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
      this.tweens.add({ targets: block.sprite, y: block.sprite.y - 28, alpha: 0, duration: 180, onComplete: () => block.sprite.destroy() });
    }
  }

  _updateCargoDrops() {
    const now = this.time.now;
    for (const block of [...this.cargoDrops.values()]) {
      if (now >= block.until) this.clearCargoDrop(block);
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
    this.items.push({ id: `${kind}-${Math.random().toString(36).slice(2)}`, kind, amount, gx, gy, sprite, taken: false });
  }

  _handleEnemyDrop(enemy) {
    playSfx(this, enemy.isBoss ? 'sfx_boss_die' : 'sfx_enemy_die');

    if (enemy === this.operadorMestre || enemy === this.guardiaTrafego) {
      this._spawnSubBossPortal(enemy.gx, enemy.gy);
    }

    if (enemy.isBoss) {
      const amount = Math.random() < BOSS_TRIPLE_AMMO_CHANCE ? 3 : 1;
      this._spawnDrop('ammo', 'item_ammo', amount, enemy.gx, enemy.gy);
      this._spawnDrop('stim', 'item_stim', 1, enemy.gx - 0.4, enemy.gy);
      this._spawnDrop('emp', 'item_emp', 1, enemy.gx + 0.4, enemy.gy);
      return;
    }

    if (Math.random() < (enemy.ammoDropChance || AMMO_CHANCE_NORMAL)) {
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
      if (name === 'Saguão de Acesso' && !this.saguaoHintShown) {
        this.saguaoHintShown = true;
        this.game.events.emit('dialogue', 'Duas torres saem daqui — Oeste e Leste, 5 andares cada. Cada andar limpo sobe o nível do cartão da torre; o nível 5, no topo, exige resolver o desafio final antes da câmara de comando.');
      }
      if (name === 'Torre Oeste — Andar 1' && !this.trapHintShown) {
        this.trapHintShown = true;
        this.game.events.emit('dialogue', 'Os espinhos batem num ciclo fixo, em 3 grupos escalonados — observe o padrão antes de atravessar.');
      }
      if (name === 'Torre Leste — Andar 1' && !this.armHintShown) {
        this.armHintShown = true;
        this.game.events.emit('dialogue', 'A esteira atravessa o corredor inteiro, com braços dos dois lados — a mesma combinação do Estaleiro Naval.');
      }
      if (name === 'Torre Oeste — Andar 5' && !this.westHintShown) {
        this.westHintShown = true;
        this.game.events.emit('dialogue', 'Resolver essa sequência sobe o Cartão Torre Oeste pro nível 5 e abre a câmara do Operador Mestre.');
      }
      if (name === 'Torre Leste — Andar 5' && !this.eastHintShown) {
        this.eastHintShown = true;
        this.game.events.emit('dialogue', 'Estabilizar esse circuito sobe o Cartão Torre Leste pro nível 5 e abre a câmara da Guardiã de Tráfego.');
      }
      if ((name === 'Câmara do Operador Mestre' || name === 'Câmara da Guardiã de Tráfego') && !this.chamberPortalHintShown) {
        this.chamberPortalHintShown = true;
        this.game.events.emit('dialogue', 'Derrubar quem comanda essa torre abre um teleporte de volta pro Saguão — não precisa descer os 5 andares de novo.');
      }
    }
  }

  update(time, delta) {
    if (this.transitioning) return;
    const deltaSec = Math.min(delta, 50) / 1000;

    if (this.player.alive) {
      const { dx, dy } = this._readMoveVector();
      this.player.move(dx, dy, deltaSec);
      this._updateConveyor(deltaSec);
    }
    this.player.update();
    this._checkItemPickups();

    if (this.levelEnded) {
      if (this.returnDoorPos) this._checkReturnDoor();
      return;
    }

    this._updateArms();
    this._updateTraps();
    this._updateCargoDrops();
    this._checkSequencePuzzle();
    this._checkCircuitPuzzle();
    this._checkRoomClears();
    this._updateSubsoloGate();
    this._updateSubBossPortals();
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
    for (const block of [...this.cargoDrops.values()]) this.clearCargoDrop(block);
    this.game.events.emit(victory ? 'level-complete' : 'game-over');
    if (victory) {
      GameState.torreControleCleared = true;
      for (const captive of TORRE_CONTROLE_CAPTIVES) rescueNpc(captive.id);
      saveGame();
      this._spawnReturnDoor();
    }
  }

  _spawnReturnDoor() {
    this.returnDoorPos = { gx: this.boss.spawn.gx, gy: this.boss.spawn.gy + 1 };
    const world = this.tileMap.gridToWorld(this.returnDoorPos.gx, this.returnDoorPos.gy);
    this.returnDoorSprite = this.add.image(world.x, world.y, 'door_estaleiro').setDepth(9000);
    this.tweens.add({ targets: this.returnDoorSprite, alpha: 0.45, duration: 650, yoyo: true, repeat: -1 });
    this.add.text(world.x, world.y - 20, 'ESTALEIRO ←', {
      fontFamily: 'Courier New', fontSize: '8px', color: '#ffb347'
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
    this.cameras.main.flash(150, 255, 179, 71);
    this.cameras.main.fadeOut(420, 18, 22, 28);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.stop('UIScene');
      this.scene.start('EstaleiroScene');
    });
  }
}
