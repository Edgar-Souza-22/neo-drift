import Phaser from 'phaser';
import TileMap from '../world/TileMap.js';
import { buildEstaleiroNavalYard } from '../world/EstaleiroNavalLayout.js';
import Player from '../entities/Player.js';
import StackerEnemy from '../entities/StackerEnemy.js';
import ElectricDrone from '../entities/ElectricDrone.js';
import JammerDrone from '../entities/JammerDrone.js';
import CargoDrone from '../entities/CargoDrone.js';
import SiphonEnemy from '../entities/SiphonEnemy.js';
import ShooterDrone from '../entities/ShooterDrone.js';
import SentrySentinel from '../entities/SentrySentinel.js';
import PhaseJumper from '../entities/PhaseJumper.js';
import PortalGuardian from '../entities/PortalGuardian.js';
import SupervisorBoss from '../entities/SupervisorBoss.js';
import PrototipoBoss from '../entities/PrototipoBoss.js';
import NPC from '../entities/NPC.js';
import { DIRECTIONS } from '../utils/constants.js';
import { GameState, equipWeapon, equipArmor, rescueNpc, upgradePistol, addAmmo, addStim, addEmpCharge, saveGame } from '../state/GameState.js';
import { ESTALEIRO_NAVAL_CAPTIVES } from '../state/EstaleiroNavalCaptives.js';
import { initHud } from '../utils/hud.js';
import { playMusic, playSfx } from '../audio/AudioManager.js';

const ITEMS = [
  { id: 'naval_weapon', markerKey: 'I', texture: 'item_sword', name: 'Lança-Solda', kind: 'weapon', value: 370, tint: 0x8fe0ff },
  { id: 'naval_pistol', markerKey: 'C', texture: 'item_pistol', name: 'Canhão de Cravos', kind: 'pistol', pistolDamage: 140, ammoBonus: 6, tint: 0x8fe0ff },
  { id: 'naval_armor', markerKey: 'A', texture: 'item_armor', name: 'Colete de Prototipagem', kind: 'armor', value: 250, tint: 0x8fe0ff }
];

const HEAL_AMOUNT = 75;
const AMMO_CHANCE_NORMAL = 0.11;
const BOSS_TRIPLE_AMMO_CHANCE = 1 / 3;
const STIM_DROP_CHANCE = 0.03;
const EMP_DROP_CHANCE = 0.025;

const CONVEYOR_SPEED = 2.2;

// Braço robótico: ciclo fixo e determinístico (nunca reage ao jogador) —
// estado derivado direto do relógio, sem temporizador próprio por braço.
// idle [0, CYCLE-TEL-STRIKE) -> telegraph [.., CYCLE-STRIKE) -> strike
// [.., CYCLE). phaseOffsetMs desloca o ciclo de cada braço, criando o
// "gauntlet" de braços fora de fase.
const ARM_CYCLE_MS = 2100;
const ARM_TELEGRAPH_MS = 380;
const ARM_STRIKE_MS = 220;
const ARM_STRIKE_RADIUS = 1.35;
const ARM_DAMAGE = 32;

const ACCENT = 0x8fe0ff;

export default class EstaleiroNavalScene extends Phaser.Scene {
  constructor() {
    super('EstaleiroNavalScene');
  }

  create() {
    const { grid, markers, zones, conveyors, arms } = buildEstaleiroNavalYard();
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

    this._buildConveyors(conveyors);
    this._buildArms(arms);

    const spawn = this.tileMap.marker('S');
    this.player = new Player(this, this.tileMap, spawn);

    const onEnemyDeath = (enemy) => this._handleEnemyDrop(enemy);
    const addStationEnemy = (enemy, marker) => {
      enemy.stationId = marker.station;
      this.enemies.push(enemy);
    };

    this.enemies = [];
    // Cada estação fabrica um robô já conhecido de outras fases — este é
    // o galpão de origem deles. `stationId` vem do marcador (não do tipo),
    // porque algumas peças reforçam mais de uma estação (ver `STACKER`).
    this.tileMap.allMarkers('STACKER').forEach((m) => addStationEnemy(
      new StackerEnemy(this, this.tileMap, m.gx, m.gy, { hp: 240, speed: 1.15, attackDamage: 32, xpReward: 70, onDeath: onEnemyDeath }),
      m
    ));
    this.tileMap.allMarkers('ELECTRIC').forEach((m) => addStationEnemy(
      new ElectricDrone(this, this.tileMap, m.gx, m.gy, { hp: 75, attackDamage: 20, xpReward: 34, onDeath: onEnemyDeath }),
      m
    ));
    this.tileMap.allMarkers('JAMMER').forEach((m) => addStationEnemy(
      new JammerDrone(this, this.tileMap, m.gx, m.gy, { hp: 70, attackDamage: 16, xpReward: 34, onDeath: onEnemyDeath }),
      m
    ));
    this.tileMap.allMarkers('CARGO').forEach((m) => addStationEnemy(
      new CargoDrone(this, this.tileMap, m.gx, m.gy, {
        hp: 65, speed: 2.1, attackDamage: 20, xpReward: 36, onDeath: onEnemyDeath,
        route: [{ gx: m.gx, gy: m.gy }, { gx: m.gx + 11, gy: m.gy }]
      }),
      m
    ));
    this.tileMap.allMarkers('PHASEJUMP').forEach((m) => addStationEnemy(
      new PhaseJumper(this, this.tileMap, m.gx, m.gy, { hp: 70, attackDamage: 22, xpReward: 40, onDeath: onEnemyDeath }),
      m
    ));
    this.tileMap.allMarkers('SIPHON').forEach((m) => addStationEnemy(
      new SiphonEnemy(this, this.tileMap, m.gx, m.gy, { hp: 65, attackDamage: 14, xpReward: 32, onDeath: onEnemyDeath }),
      m
    ));
    this.tileMap.allMarkers('SHOOTER').forEach((m) => addStationEnemy(
      new ShooterDrone(this, this.tileMap, m.gx, m.gy, { hp: 78, attackDamage: 18, xpReward: 38, onDeath: onEnemyDeath }),
      m
    ));
    this.tileMap.allMarkers('SENTRY').forEach((m) => addStationEnemy(
      new SentrySentinel(this, this.tileMap, m.gx, m.gy, { hp: 70, attackDamage: 14, xpReward: 28, onDeath: onEnemyDeath }),
      m
    ));

    // O Inspetor de Qualidade — guarda o desvio obrigatório (Sala de
    // Override). Derrotá-lo abre o portão selado até o Controle Mestre
    // (ver _handleEnemyDrop / _buildGate).
    const guardSpawn = this.tileMap.marker('GUARD');
    this.overrideGuard = new PortalGuardian(this, this.tileMap, guardSpawn.gx, guardSpawn.gy, {
      hp: 480, name: 'INSPETOR DE QUALIDADE', onDeath: onEnemyDeath
    });
    this.enemies.push(this.overrideGuard);

    this._buildGate();

    const subSpawn = this.tileMap.marker('M');
    this.subChefe = new SupervisorBoss(this, this.tileMap, subSpawn.gx, subSpawn.gy, { onDeath: onEnemyDeath });
    this.enemies.push(this.subChefe);

    const bossSpawn = this.tileMap.marker('B');
    this.boss = new PrototipoBoss(this, this.tileMap, bossSpawn.gx, bossSpawn.gy, { onDeath: onEnemyDeath });
    this.enemies.push(this.boss);

    const bossWorld = this.tileMap.gridToWorld(bossSpawn.gx, bossSpawn.gy);
    this.add.image(bossWorld.x, bossWorld.y, 'light_pool').setDepth(-999).setScale(2.2).setBlendMode(Phaser.BlendModes.ADD).setTint(ACCENT);

    const npcSpawns = this.tileMap.allMarkers('N');
    this.npcs = ESTALEIRO_NAVAL_CAPTIVES
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
        id: `naval_medkit_${i}`, kind: 'heal', amount: HEAL_AMOUNT,
        gx: spot.gx, gy: spot.gy, sprite, taken: false
      });
    });

    this._buildPanels();

    this.levelEnded = false;
    this.transitioning = false;
    this.returnDoorPos = null;
    this._lastRemaining = null;
    this.armHintShown = false;
    this.panelHintShown = false;
    this.overrideHintShown = false;

    this._setupCamera();
    this._setupInput();
    this.cameras.main.fadeIn(350, 18, 22, 28);
    playMusic(this, 'music_naval');

    initHud(this, () => {
      this.game.events.emit('hud-init', { label: 'ESTALEIRO NAVAL', showEnemies: true, sceneKey: 'EstaleiroNavalScene' });
      this._emitStats();
      this.game.events.emit('enemies-remaining', this.enemies.length);
    });
  }

  // --- Esteiras -----------------------------------------------------------
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

  // --- Braços robóticos -----------------------------------------------
  _buildArms(armDefs) {
    this.armsDisabled = new Set();
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
      if (this.armsDisabled.has(arm.stationId)) {
        if (arm.lastState !== 'off') {
          arm.sprite.setTint(0x555a60).setAlpha(0.55).setScale(1);
          arm.lastState = 'off';
        }
        continue;
      }
      const state = this._armState(arm, now);
      if (state !== arm.lastState) {
        if (state === 'strike') this._resolveArmStrike(arm);
        arm.lastState = state;
      }
      if (state === 'idle') {
        arm.sprite.clearTint();
        arm.sprite.setAlpha(1);
        arm.sprite.setScale(1);
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

  // --- Painéis de estação -----------------------------------------------
  _buildPanels() {
    this.panels = this.tileMap.allMarkers('P').map((p) => {
      const world = this.tileMap.gridToWorld(p.gx, p.gy);
      const sprite = this.add.image(world.x, world.y, 'prop_console').setDepth(p.gy * 10 + 4).setTint(0xff4a5e);
      this.add.text(world.x, world.y - 18, 'PAINEL', {
        fontFamily: 'Courier New', fontSize: '8px', color: '#ff8a9c'
      }).setOrigin(0.5).setDepth(9001);
      return { gx: p.gx, gy: p.gy, station: p.station, sprite, active: false, warned: false };
    });
  }

  _isStationCleared(station) {
    return !this.enemies.some((e) => e.stationId === station && e.alive);
  }

  _updatePanels() {
    for (const panel of this.panels) {
      if (panel.active) continue;
      const dist = Math.hypot(this.player.gx - panel.gx, this.player.gy - panel.gy);
      if (dist >= 0.9) continue;
      if (!this._isStationCleared(panel.station)) {
        if (!panel.warned) {
          panel.warned = true;
          this.game.events.emit('dialogue', 'O painel não responde com robôs ativos na sala.');
        }
        continue;
      }
      panel.active = true;
      this.armsDisabled.add(panel.station);
      panel.sprite.setTint(0x8fbf6a);
      playSfx(this, 'sfx_pickup');
      this.game.events.emit('item-pickup', 'Painel ativado — os braços desta estação desligaram de vez.');
    }
  }

  // --- Portão selado (desvio obrigatório) --------------------------------
  // Mesma técnica da Estação Fantasma: um corredor de 1 tile de altura com
  // uma célula bloqueada — só assim um único bloqueio realmente fecha a
  // passagem (corredor largo o jogador contornaria por cima/baixo).
  _buildGate() {
    const gate = this.tileMap.marker('GATE');
    this.gatePos = gate;
    this.tileMap.setWalkable(gate.gx, gate.gy, false);
    const world = this.tileMap.gridToWorld(gate.gx, gate.gy);
    this.gateSprite = this.add.image(world.x, world.y, 'door_estaleiro').setDepth(9000).setTint(0xff4a5e);
    this.gateLabel = this.add.text(world.x, world.y - 18, 'SELADO', {
      fontFamily: 'Courier New', fontSize: '8px', color: '#ff8a9c'
    }).setOrigin(0.5).setDepth(9001);
  }

  _openGate() {
    this.tileMap.setWalkable(this.gatePos.gx, this.gatePos.gy, true);
    this.gateSprite.setTint(ACCENT);
    this.gateLabel.setText('ABERTO');
    playSfx(this, 'sfx_pickup');
    this.game.events.emit('item-pickup', 'O Inspetor de Qualidade cai — o portão até o Controle Mestre abre.');
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

    if (enemy === this.overrideGuard) this._openGate();

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
      if (name === 'Estação de Chassi' && !this.armHintShown) {
        this.armHintShown = true;
        this.game.events.emit(
          'dialogue',
          'A esteira atravessa o meio da sala, e os braços ficam nas bordas dela — o ritmo é fixo, mas a esteira não deixa você parado esperando a hora certa.'
        );
      }
      if (name === 'Estação de Chassi' && !this.panelHintShown) {
        this.panelHintShown = true;
        this.game.events.emit('dialogue', 'Cada estação tem um painel. Limpa a sala, toca o painel, os braços desligam pra sempre.');
      }
      if (name === 'Estação de Armamento' && !this.overrideHintShown) {
        this.overrideHintShown = true;
        this.game.events.emit('dialogue', 'A Sala de Override fica num desvio daqui. O Inspetor de Qualidade guarda o único jeito de abrir o portão até o Controle Mestre.');
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
    this._updatePanels();
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
      GameState.estaleiroNavalCleared = true;
      for (const captive of ESTALEIRO_NAVAL_CAPTIVES) rescueNpc(captive.id);
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
      fontFamily: 'Courier New', fontSize: '8px', color: '#8fe0ff'
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
    this.cameras.main.flash(150, 143, 224, 255);
    this.cameras.main.fadeOut(420, 18, 22, 28);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.stop('UIScene');
      this.scene.start('EstaleiroScene');
    });
  }
}
