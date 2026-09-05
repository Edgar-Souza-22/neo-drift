import Phaser from 'phaser';
import TileMap from '../world/TileMap.js';
import { buildAtrioSpiral } from '../world/AtrioLayout.js';
import Player from '../entities/Player.js';
import ShieldGuard from '../entities/ShieldGuard.js';
import ShooterDrone from '../entities/ShooterDrone.js';
import ElectricDrone from '../entities/ElectricDrone.js';
import JammerDrone from '../entities/JammerDrone.js';
import ConciergeBoss from '../entities/ConciergeBoss.js';
import DiretoraBoss from '../entities/DiretoraBoss.js';
import NPC from '../entities/NPC.js';
import { DIRECTIONS } from '../utils/constants.js';
import {
  GameState, equipWeapon, equipArmor, equipBoots, rescueNpc, upgradePistol,
  addAmmo, addStim, addEmpCharge, addInventoryItem, saveGame
} from '../state/GameState.js';
import { ATRIO_CAPTIVES } from '../state/AtrioCaptives.js';
import { initHud } from '../utils/hud.js';
import { playMusic, playSfx } from '../audio/AudioManager.js';

const ACCENT = 0xc9a24a;

const ITEMS = [
  { id: 'atrio_weapon', markerKey: 'I', texture: 'item_sword', name: 'Lâmina Executiva', kind: 'weapon', value: 410, tint: ACCENT },
  { id: 'atrio_pistol', markerKey: 'C', texture: 'item_pistol', name: 'Pistola de Segurança Corporativa', kind: 'pistol', pistolDamage: 154, ammoBonus: 6, tint: ACCENT },
  { id: 'atrio_armor', markerKey: 'A', texture: 'item_armor', name: 'Colete Executivo', kind: 'armor', value: 280, tint: ACCENT },
  // Botas de Impulso da Região 5 — primeira fase da região, como em todas as
  // outras (Fase 01 ×1.15, 05 ×1.25, 09 ×1.35, 13 ×1.45).
  { id: 'atrio_boots', markerKey: 'P', texture: 'item_boots', name: 'Botas Pressurizadas', kind: 'boots', speedMul: 1.55, tint: ACCENT }
];

const HEAL_AMOUNT = 85;
const AMMO_CHANCE_NORMAL = 0.11;
const BOSS_TRIPLE_AMMO_CHANCE = 1 / 3;
const STIM_DROP_CHANCE = 0.03;
const EMP_DROP_CHANCE = 0.025;

// Piso polido (mármore encerado). Deriva puramente cinemática: o jogador
// continua andando normalmente, mas carrega uma velocidade residual que só
// morre devagar enquanto os pés estão no mármore.
const SLIDE_MAX = 2.5;
const SLIDE_GAIN = 3.0;
const SLIDE_DECAY_POLISHED = 1.3;
const SLIDE_DECAY_DRY = 9.0;

// Câmeras de segurança: cone fixo, sem raycast — todas ficam dentro de salas
// convexas, então estar no cone já significa estar à vista.
const CAM_RANGE = 5.4;
const CAM_HALF_ANGLE_DEG = 34;
const ALARM_FILL_PER_SEC = 0.42;
const ALARM_DECAY_PER_SEC = 0.55;
const ALARM_REINFORCEMENTS = 2;

const PUSH_COOLDOWN_MS = 240;

// Elite: mesma classe, stats maiores + tint dourado persistente (ver
// Enemy.js `tintColor`). Aqui vira norma e não exceção — a segurança da sede
// é melhor equipada que qualquer coisa das quatro regiões anteriores.
const ELITE_TINT = 0xffd24a;
const ELITE_SCALE = 1.2;
const ELITE_HP_MUL = 1.6;
const ELITE_DMG_MUL = 1.4;
const ELITE_XP_MUL = 1.6;

// Salas que precisam estar limpas pro Crachá de Visitante sair — todas na
// volta externa, antes da catraca que ele abre.
const BADGE_ROOMS = ['espera', 'galeria', 'catracas'];

export default class AtrioScene extends Phaser.Scene {
  constructor() {
    super('AtrioScene');
  }

  create() {
    const build = buildAtrioSpiral();
    const { grid, markers, zones, rooms, gates, glass, polished, cameras, alarmSpawns, plates, pushables, pushArea, props } = build;
    this.rooms = rooms;
    this.zones = zones;
    this.alarmSpawns = alarmSpawns;
    this.currentZone = null;

    this.tileMap = new TileMap(this, grid, {
      wallTexture: 'wall_atrio',
      floorTexture: 'floor_atrio',
      floorVariants: [
        { key: 'floor_atrio', weight: 0.9 },
        { key: 'floor_atrio_inlay', weight: 0.1 }
      ],
      glassTexture: 'wall_glass',
      glassTiles: glass,
      markers
    });

    // O crachá é reconstruído do zero a cada tentativa — os inimigos também
    // respawnam, então um crachá sobrevivente deixaria a catraca aberta com
    // a sala dela cheia de novo.
    GameState.inventory = GameState.inventory.filter((i) => i.id !== 'atrio_badge');
    saveGame();

    this._buildPolishedFloor(polished);
    this._buildProps(props);
    this._buildGates(gates);
    this._buildFurniturePuzzle(plates, pushables, pushArea);
    this._buildSecurityCameras(cameras);

    const spawn = this.tileMap.marker('S');
    this.player = new Player(this, this.tileMap, spawn);
    this.slide = { x: 0, y: 0 };

    const onEnemyDeath = (enemy) => this._handleEnemyDrop(enemy);
    this.enemies = [];
    this.roomEnemyGroups = {};
    this.badgeGranted = false;

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
        this.enemies.push(enemy);
        if (m.room) {
          if (!this.roomEnemyGroups[m.room]) this.roomEnemyGroups[m.room] = [];
          this.roomEnemyGroups[m.room].push(enemy);
        }
      });
    };

    spawnRoomEnemies('GUARD', ShieldGuard, { hp: 150, speed: 1.25, attackDamage: 30, xpReward: 66 });
    spawnRoomEnemies('SHOOTER', ShooterDrone, { hp: 90, attackDamage: 21, xpReward: 42 });
    spawnRoomEnemies('ELECTRIC', ElectricDrone, { hp: 88, attackDamage: 22, xpReward: 40 });
    spawnRoomEnemies('JAMMER', JammerDrone, { hp: 82, attackDamage: 18, xpReward: 38 });

    const conciergeSpawn = this.tileMap.marker('M1');
    this.concierge = new ConciergeBoss(this, this.tileMap, conciergeSpawn.gx, conciergeSpawn.gy, { onDeath: onEnemyDeath });
    this.enemies.push(this.concierge);

    const bossSpawn = this.tileMap.marker('B');
    this.boss = new DiretoraBoss(this, this.tileMap, bossSpawn.gx, bossSpawn.gy, { onDeath: onEnemyDeath });
    this.enemies.push(this.boss);

    const bossWorld = this.tileMap.gridToWorld(bossSpawn.gx, bossSpawn.gy);
    this.add.image(bossWorld.x, bossWorld.y, 'light_pool').setDepth(-999).setScale(2.6)
      .setBlendMode(Phaser.BlendModes.ADD).setTint(ACCENT);

    const npcSpawns = this.tileMap.allMarkers('N');
    this.npcs = ATRIO_CAPTIVES
      .map((captive, i) => ({ captive, spot: npcSpawns[i] }))
      .filter(({ captive, spot }) => spot && !GameState.rescuedNpcs.has(captive.id))
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
      this.items.push({ id: `atrio_medkit_${i}`, kind: 'heal', amount: HEAL_AMOUNT, gx: spot.gx, gy: spot.gy, sprite, taken: false });
    });

    this.levelEnded = false;
    this.transitioning = false;
    this.returnDoorPos = null;
    this._lastRemaining = null;
    this.hintsShown = {};

    this._setupCamera();
    this._setupInput();
    this.cameras.main.fadeIn(350, 18, 20, 26);
    playMusic(this, 'music_atrio');

    initHud(this, () => {
      this.game.events.emit('hud-init', { label: 'ÁTRIO EXECUTIVO', showEnemies: true, sceneKey: 'AtrioScene' });
      this._emitStats();
      this.game.events.emit('enemies-remaining', this.enemies.length);
    });
  }

  // --- Decoração ---------------------------------------------------------
  _buildProps(propDefs) {
    for (const prop of propDefs) {
      const world = this.tileMap.gridToWorld(prop.gx, prop.gy);
      const tex = this.textures.exists(prop.texture) ? prop.texture : 'prop_crate';
      const sprite = this.add.image(world.x, world.y, tex).setOrigin(0.5, 0.85).setDepth(prop.gy * 10 + 2);
      if (prop.tint) sprite.setTint(prop.tint);
    }
  }

  // --- Piso polido -------------------------------------------------------
  // Desenhado por cima do piso normal (como a esteira da Fase 15/16 faz),
  // então não precisa virar um tipo de hazard no TileMap: não causa dano,
  // não muda colisão — só muda o CONTROLE.
  _buildPolishedFloor(cells) {
    this.polishedCells = new Set();
    const tex = this.textures.exists('floor_atrio_polido') ? 'floor_atrio_polido' : 'floor_atrio_inlay';
    for (const cell of cells) {
      const world = this.tileMap.gridToWorld(cell.gx, cell.gy);
      this.add.image(world.x, world.y, tex).setDepth(-4500);
      this.polishedCells.add(`${cell.gx},${cell.gy}`);
    }
  }

  _isOnPolished() {
    return this.polishedCells.has(`${Math.round(this.player.gx)},${Math.round(this.player.gy)}`);
  }

  _updatePolishedFloor(deltaSec, dx, dy) {
    if (!this.player.alive) return;
    const onPolished = this._isOnPolished();

    if (onPolished && (dx !== 0 || dy !== 0)) {
      const gain = Math.min(1, SLIDE_GAIN * deltaSec);
      this.slide.x += (dx * SLIDE_MAX - this.slide.x) * gain;
      this.slide.y += (dy * SLIDE_MAX - this.slide.y) * gain;
    }

    const decay = onPolished ? SLIDE_DECAY_POLISHED : SLIDE_DECAY_DRY;
    const keep = Math.max(0, 1 - decay * deltaSec);
    this.slide.x *= keep;
    this.slide.y *= keep;

    if (Math.abs(this.slide.x) < 0.01 && Math.abs(this.slide.y) < 0.01) return;
    const nx = this.player.gx + this.slide.x * deltaSec;
    if (this.player.canOccupy(nx, this.player.gy)) this.player.gx = nx;
    else this.slide.x = 0;
    const ny = this.player.gy + this.slide.y * deltaSec;
    if (this.player.canOccupy(this.player.gx, ny)) this.player.gy = ny;
    else this.slide.y = 0;
  }

  // --- Portões -----------------------------------------------------------
  // Cada um sela a largura INTEIRA do vão (ver AtrioLayout) — não existe
  // célula solta pra contornar.
  _buildGates(gateDefs) {
    this.gates = gateDefs.map((g) => {
      const cells = [];
      if (g.orientation === 'horizontal') {
        for (let x = g.cx1; x <= g.cx2; x++) cells.push({ gx: x, gy: g.gy });
      } else {
        for (let y = g.cy1; y <= g.cy2; y++) cells.push({ gx: g.gx, gy: y });
      }
      const sprites = cells.map((c) => {
        const world = this.tileMap.gridToWorld(c.gx, c.gy);
        return this.add.image(world.x, world.y, 'door_matriz').setDepth(9000).setTint(0xff4a5e);
      });
      const mid = cells[Math.floor(cells.length / 2)];
      const midWorld = this.tileMap.gridToWorld(mid.gx, mid.gy);
      const label = this.add.text(midWorld.x, midWorld.y - 18, g.label, {
        fontFamily: 'Courier New', fontSize: '8px', color: '#ff8a9c'
      }).setOrigin(0.5).setDepth(9001);
      return { ...g, cells, sprites, label, open: false };
    });
  }

  _openGate(id, message) {
    const gate = this.gates.find((g) => g.id === id);
    if (!gate || gate.open) return;
    gate.open = true;
    for (const c of gate.cells) this.tileMap.setWalkable(c.gx, c.gy, true);
    for (const sprite of gate.sprites) sprite.setTint(ACCENT);
    gate.label.setText('ABERTO');
    playSfx(this, 'sfx_pickup');
    if (message) this.game.events.emit('item-pickup', message);
  }

  // Crachá de Visitante: sai quando a volta externa inteira está limpa. É a
  // única coisa que abre a catraca — não existe caminho alternativo.
  _checkBadge() {
    if (this.badgeGranted) return;
    const done = BADGE_ROOMS.every((room) => {
      const list = this.roomEnemyGroups[room] || [];
      return list.length > 0 && list.every((e) => !e.alive);
    });
    if (!done) return;
    this.badgeGranted = true;
    addInventoryItem({ id: 'atrio_badge', name: 'Crachá de Visitante', icon: 'item_keycard' });
    this._openGate('catracas', 'Crachá de Visitante liberado — as catracas destravam.');
  }

  _updateElevadorGate() {
    if (this.concierge.alive) return;
    this._openGate('elevador', 'O Concierge sai da frente — o Elevador Executivo destrava.');
  }

  // --- Quebra-cabeça do mobiliário (Refeitório Executivo) ----------------
  // Três mesas de banquete empurráveis, três placas de pressão. Nenhum
  // puzzle anterior do jogo pediu pra MOVER um objeto pelo mapa — sequência,
  // circuito, pares, rotação, plugues e travas eram todos "pisar/alternar no
  // lugar". A mesa é parede enquanto está parada (setWalkable false), então
  // ela também bloqueia inimigo e projétil, não só o jogador.
  _buildFurniturePuzzle(plateDefs, pushableDefs, pushArea) {
    this.pushArea = pushArea;
    this.plates = plateDefs.map((p) => {
      const world = this.tileMap.gridToWorld(p.gx, p.gy);
      const sprite = this.add.image(world.x, world.y, 'tile_pressure_off').setDepth(p.gy * 10 + 1);
      const glow = this.add.image(world.x, world.y, 'light_pool')
        .setBlendMode(Phaser.BlendModes.ADD).setTint(ACCENT).setScale(0.6).setDepth(9500).setVisible(false);
      return { gx: p.gx, gy: p.gy, sprite, glow, pressed: false };
    });

    this.pushables = pushableDefs.map((p) => {
      this.tileMap.setWalkable(p.gx, p.gy, false);
      const world = this.tileMap.gridToWorld(p.gx, p.gy);
      const tex = this.textures.exists('prop_banquet') ? 'prop_banquet' : 'prop_crate';
      const sprite = this.add.image(world.x, world.y, tex).setOrigin(0.5, 0.85).setDepth(p.gy * 10 + 3).setTint(ACCENT);
      return { gx: p.gx, gy: p.gy, sprite, moving: false };
    });

    this.furnitureSolved = false;
    this.lastPushAt = -9999;
  }

  _tryPushFurniture(dx, dy) {
    if (!this.player.alive || (dx === 0 && dy === 0)) return;
    const now = this.time.now;
    if (now - this.lastPushAt < PUSH_COOLDOWN_MS) return;

    // Só empurra no eixo dominante — empurrão na diagonal não existe.
    const ax = Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) : 0;
    const ay = ax === 0 ? Math.sign(dy) : 0;
    if (ax === 0 && ay === 0) return;

    const px = Math.round(this.player.gx);
    const py = Math.round(this.player.gy);
    const tx = px + ax;
    const ty = py + ay;
    const target = this.pushables.find((p) => p.gx === tx && p.gy === ty && !p.moving);
    if (!target) return;

    // Precisa estar de fato encostado (a mesa é parede, então o jogador
    // nunca chega mais perto que ~0.8 tile).
    const along = ax !== 0 ? Math.abs(this.player.gx - tx) : Math.abs(this.player.gy - ty);
    if (along > 1.1) return;

    const nx = tx + ax;
    const ny = ty + ay;
    // Nunca até a parede (ver `pushArea` em AtrioLayout): é o que impede
    // encaixar uma mesa num canto e travar a fase.
    const area = this.pushArea;
    if (nx < area.x1 || nx > area.x2 || ny < area.y1 || ny > area.y2) return;
    if (!this.tileMap.isWalkable(nx, ny)) return;
    if (this.pushables.some((p) => p.gx === nx && p.gy === ny)) return;
    if (this.enemies.some((e) => e.alive && Math.round(e.gx) === nx && Math.round(e.gy) === ny)) return;

    this.tileMap.setWalkable(target.gx, target.gy, true);
    target.gx = nx;
    target.gy = ny;
    this.tileMap.setWalkable(nx, ny, false);
    target.moving = true;
    this.lastPushAt = now;

    const world = this.tileMap.gridToWorld(nx, ny);
    target.sprite.setDepth(ny * 10 + 3);
    this.tweens.add({
      targets: target.sprite, x: world.x, y: world.y, duration: 200, ease: 'Cubic.Out',
      onComplete: () => { target.moving = false; }
    });
    playSfx(this, 'sfx_door', { volume: 0.25 });
    this._checkFurniturePuzzle();
  }

  _checkFurniturePuzzle() {
    let allPressed = true;
    for (const plate of this.plates) {
      const pressed = this.pushables.some((p) => p.gx === plate.gx && p.gy === plate.gy);
      if (pressed !== plate.pressed) {
        plate.pressed = pressed;
        plate.sprite.setTexture(pressed ? 'tile_pressure_on' : 'tile_pressure_off');
        plate.glow.setVisible(pressed);
        playSfx(this, 'sfx_menu_open', { volume: 0.35 });
      }
      if (!pressed) allPressed = false;
    }
    if (allPressed && !this.furnitureSolved) {
      this.furnitureSolved = true;
      this._openGate('servico', 'As três placas cedem sob as mesas — a porta de serviço abre.');
    }
  }

  // --- Câmeras de segurança ----------------------------------------------
  // `this.cameras` é o gerenciador de câmeras do Phaser — as de segurança
  // moram em `secCameras` de propósito, nunca sobrescrevendo aquilo.
  _buildSecurityCameras(camDefs) {
    const cos = Math.cos(Phaser.Math.DegToRad(CAM_HALF_ANGLE_DEG));
    this.secCameras = camDefs.map((c) => {
      const len = Math.hypot(c.dirX, c.dirY) || 1;
      const world = this.tileMap.gridToWorld(c.gx, c.gy);
      const sprite = this.add.image(world.x, world.y, 'prop_camera').setOrigin(0.5, 0.75).setDepth(c.gy * 10 + 3);
      sprite.setRotation(Math.atan2(c.dirY / len, c.dirX / len));
      const cone = this.add.image(world.x, world.y, 'light_pool')
        .setBlendMode(Phaser.BlendModes.ADD).setTint(0x8fb4ff).setAlpha(0.16)
        .setScale(CAM_RANGE / 2.2).setDepth(-998);
      return { gx: c.gx, gy: c.gy, dirX: c.dirX / len, dirY: c.dirY / len, sprite, cone, seeing: false };
    });
    this.cosHalfAngle = cos;
    this.alarm = 0;
    this.camerasDisabled = false;
    this.consolePos = this.tileMap.marker('CONSOLE');
    const consoleWorld = this.tileMap.gridToWorld(this.consolePos.gx, this.consolePos.gy);
    this.consoleSprite = this.add.image(consoleWorld.x, consoleWorld.y, 'prop_console')
      .setOrigin(0.5, 0.85).setDepth(this.consolePos.gy * 10 + 3).setTint(0x8fb4ff);
    this.add.text(consoleWorld.x, consoleWorld.y - 24, 'CENTRAL DAS CÂMERAS', {
      fontFamily: 'Courier New', fontSize: '8px', color: '#8fb4ff'
    }).setOrigin(0.5).setDepth(9001);
  }

  _disableCameras() {
    if (this.camerasDisabled) return;
    this.camerasDisabled = true;
    this.alarm = 0;
    for (const cam of this.secCameras) {
      cam.sprite.setTint(0x4a5268);
      cam.cone.setVisible(false);
    }
    this.consoleSprite.setTint(0x4a5268);
    playSfx(this, 'sfx_pickup');
    this.game.events.emit('item-pickup', 'Central das câmeras desligada — o átrio inteiro fica cego.');
  }

  _triggerAlarm() {
    this.alarm = 0;
    playSfx(this, 'sfx_enrage', { volume: 0.4 });
    this.cameras.main.flash(200, 255, 74, 94);
    this.game.events.emit('item-pickup', 'ALARME! A segurança corporativa foi acionada.');

    // Reforço no ponto de chamada mais próximo do jogador — perto o
    // bastante pra ser uma ameaça, longe o bastante pra dar tempo de virar.
    let best = null;
    let bestDist = Infinity;
    for (const spot of this.alarmSpawns) {
      const dist = Math.hypot(this.player.gx - spot.gx, this.player.gy - spot.gy);
      if (dist < bestDist) { bestDist = dist; best = spot; }
    }
    if (!best) return;
    for (let i = 0; i < ALARM_REINFORCEMENTS; i++) {
      const gx = best.gx + (i === 0 ? -1 : 1);
      if (!this.tileMap.isWalkable(gx, best.gy)) continue;
      const guard = new ShieldGuard(this, this.tileMap, gx, best.gy, {
        hp: 130, attackDamage: 26, xpReward: 48, onDeath: (e) => this._handleEnemyDrop(e)
      });
      this.enemies.push(guard);
    }
  }

  _updateSecurityCameras(deltaSec) {
    if (this.camerasDisabled) return;

    if (!this.consoleUsed) {
      const dist = Math.hypot(this.player.gx - this.consolePos.gx, this.player.gy - this.consolePos.gy);
      if (dist < 0.8) {
        this.consoleUsed = true;
        this._disableCameras();
        return;
      }
    }

    let seen = false;
    for (const cam of this.secCameras) {
      const dx = this.player.gx - cam.gx;
      const dy = this.player.gy - cam.gy;
      const dist = Math.hypot(dx, dy);
      const inCone = this.player.alive && dist > 0.1 && dist <= CAM_RANGE
        && (dx * cam.dirX + dy * cam.dirY) / dist >= this.cosHalfAngle;
      if (inCone !== cam.seeing) {
        cam.seeing = inCone;
        cam.sprite.setTint(inCone ? 0xff4a5e : 0xffffff);
        cam.cone.setTint(inCone ? 0xff4a5e : 0x8fb4ff);
        cam.cone.setAlpha(inCone ? 0.3 : 0.16);
      }
      if (inCone) seen = true;
    }

    this.alarm = Phaser.Math.Clamp(
      this.alarm + (seen ? ALARM_FILL_PER_SEC : -ALARM_DECAY_PER_SEC) * deltaSec, 0, 1
    );
    if (this.alarm >= 1) this._triggerAlarm();
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
          this.game.events.emit('item-pickup', `${item.name} equipado! HP máximo aumentado.`);
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

  _hint(key, line) {
    if (this.hintsShown[key]) return;
    this.hintsShown[key] = true;
    this.game.events.emit('dialogue', line);
  }

  _updateZone() {
    const zone = this.zones.find(
      (z) => this.player.gx >= z.x1 && this.player.gx < z.x2 && this.player.gy >= z.y1 && this.player.gy < z.y2
    );
    const name = zone ? zone.name : this.currentZone;
    if (!name || name === this.currentZone) return;
    this.currentZone = name;
    this.game.events.emit('zone-changed', name);

    if (name === 'Saguão de Recepção') {
      this._hint('saguao', 'O mármore encerado não segura o passo — você desliza um pouco além de onde para. Aqui é inofensivo; lá dentro, nem sempre.');
    } else if (name === 'Sala de Espera VIP') {
      this._hint('escudo', 'O escudo de choque desses guardas cobre a frente inteira. Golpe de frente quase não passa — contorne enquanto eles giram.');
    } else if (name === 'Galeria de Prêmios') {
      this._hint('galeria', 'Mesmo mármore da recepção, agora com quem trabalha aqui em cima dele. E quanto mais rápido você anda, mais longe o passo continua.');
    } else if (name === 'Corredor de Catracas') {
      this._hint('catracas', 'A catraca lá em cima só destrava com crachá. Limpe a volta externa inteira — a recepção emite um quando ninguém mais responde por ela.');
    } else if (name === 'Refeitório Executivo') {
      this._hint('mobiliario', 'As três placas do salão precisam ficar pressionadas ao mesmo tempo. As mesas de banquete deslizam — empurre cada uma até a sua placa.');
    } else if (name === 'Posto de Segurança') {
      this._hint('posto', 'A central das câmeras fica aqui. Encostar nela apaga o sistema do átrio inteiro — nada de alarme daqui pra frente.');
    } else if (name === 'Mezanino Panorâmico') {
      this._hint('mezanino', 'Piso espelhado de ponta a ponta, e a elite da segurança em cima dele. Cada passo aqui continua depois que você solta a direção.');
    } else if (name === 'Antessala do Elevador') {
      this._hint('antessala', 'O Concierge não deixa ninguém chegar ao elevador. E o empurrão dele, neste piso, manda você longe.');
    } else if (name === 'Átrio Central') {
      this._hint('atrio', 'Você olhou pra este vão através do vidro desde a recepção. Ela também estava olhando de volta.');
    }
  }

  update(time, delta) {
    if (this.transitioning) return;
    const deltaSec = Math.min(delta, 50) / 1000;

    let move = { dx: 0, dy: 0 };
    if (this.player.alive) {
      move = this._readMoveVector();
      this.player.move(move.dx, move.dy, deltaSec);
      this._updatePolishedFloor(deltaSec, move.dx, move.dy);
    }
    this.player.update();
    // Sempre antes do early-return de levelEnded: o golpe que encerra a fase
    // já dropa loot NESTE frame, e coletar depois do return é impossível.
    this._checkItemPickups();

    if (this.levelEnded) {
      if (this.returnDoorPos) this._checkReturnDoor();
      return;
    }

    this._tryPushFurniture(move.dx, move.dy);
    this._updateSecurityCameras(deltaSec);
    this._checkBadge();
    this._updateElevadorGate();
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
      GameState.atrioCleared = true;
      for (const captive of ATRIO_CAPTIVES) rescueNpc(captive.id);
      saveGame();
      this._spawnReturnDoor();
    }
  }

  _spawnReturnDoor() {
    this.returnDoorPos = { gx: this.boss.spawn.gx, gy: this.boss.spawn.gy + 2 };
    const world = this.tileMap.gridToWorld(this.returnDoorPos.gx, this.returnDoorPos.gy);
    this.returnDoorSprite = this.add.image(world.x, world.y, 'door_matriz').setDepth(9000);
    this.tweens.add({ targets: this.returnDoorSprite, alpha: 0.45, duration: 650, yoyo: true, repeat: -1 });
    this.add.text(world.x, world.y - 20, 'PRAÇA DA MATRIZ ↓', {
      fontFamily: 'Courier New', fontSize: '8px', color: '#c9a24a'
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
    this.cameras.main.flash(150, 201, 162, 74);
    this.cameras.main.fadeOut(420, 18, 20, 26);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.stop('UIScene');
      this.scene.start('MatrizScene');
    });
  }
}
