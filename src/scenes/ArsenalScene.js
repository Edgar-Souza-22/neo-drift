import Phaser from 'phaser';
import TileMap from '../world/TileMap.js';
import { buildArsenalWing } from '../world/ArsenalLayout.js';
import Player from '../entities/Player.js';
import Enemy from '../entities/Enemy.js';
import ShooterDrone from '../entities/ShooterDrone.js';
import MiniBoss from '../entities/MiniBoss.js';
import TankBoss from '../entities/TankBoss.js';
import NPC from '../entities/NPC.js';
import { DIRECTIONS } from '../utils/constants.js';
import { GameState, equipWeapon, equipArmor, rescueNpc, addInventoryItem, upgradePistol, addAmmo, addStim, addEmpCharge } from '../state/GameState.js';
import { ARSENAL_CAPTIVES } from '../state/ArsenalCaptives.js';
import { initHud } from '../utils/hud.js';
import { playMusic, playSfx } from '../audio/AudioManager.js';

// Uma melhoria de cada tipo, como toda fase — a novidade aqui é a arma à
// distância nova (railgun perfurante) no lugar de mais um upgrade de pistola.
const ITEMS = [
  { id: 'arsenal_weapon', markerKey: 'I', texture: 'item_sword', name: 'Lâmina de Titânio', kind: 'weapon', value: 160, tint: 0x9fff6a },
  { id: 'arsenal_railgun', markerKey: 'C', texture: 'item_railgun', name: 'Railgun de Sobrecarga', kind: 'pistol', rangedKind: 'railgun', pistolDamage: 60, ammoBonus: 12, tint: 0xdff7ff },
  { id: 'arsenal_armor', markerKey: 'A', texture: 'item_armor', name: 'Blindagem de Combate', kind: 'armor', value: 110, tint: 0x9fff6a }
];

const HEAL_AMOUNT = 55;
const AMMO_CHANCE_NORMAL = 0.1;
const AMMO_CHANCE_TANK = 0.2;
const BOSS_TRIPLE_AMMO_CHANCE = 1 / 3;
const STIM_DROP_CHANCE = 0.03;
const EMP_DROP_CHANCE = 0.025;

// Armadilhas de espinho do Corredor de Armadilhas — ciclam sozinhas
// (independentes da posição do jogador), com 3 grupos de fase escalonados
// pra sempre existir uma janela seguro pra atravessar. Retraída (segura) ->
// erguendo (aviso âmbar, ainda dá tempo) -> erguida (vermelha, machuca).
const TRAP_CYCLE_MS = 2600;
const TRAP_SAFE_MS = 1500;
const TRAP_WARN_MS = 400;
// TRAP_SAFE_MS + TRAP_WARN_MS + tempo erguida = TRAP_CYCLE_MS
const TRAP_DAMAGE = 18;
const TRAP_HIT_RADIUS = 0.5;
const TRAP_PHASE_STAGGER = TRAP_CYCLE_MS / 3;

// Decoração de cenário — só visual, cantos de sala livres de marcadores.
const PROPS = [
  { gx: 1, gy: 1, texture: 'prop_crate' }, { gx: 7, gy: 8, texture: 'prop_pipe' },
  { gx: 12, gy: 1, texture: 'prop_barrel' }, { gx: 19, gy: 8, texture: 'prop_crate' },
  { gx: 25, gy: 1, texture: 'prop_pipe' }, { gx: 32, gy: 8, texture: 'prop_barrel' },
  { gx: 39, gy: 1, texture: 'prop_crate' }, { gx: 50, gy: 3, texture: 'prop_pipe' }, { gx: 44, gy: 10, texture: 'prop_barrel' },
  { gx: 43, gy: 14, texture: 'prop_pipe' }, { gx: 50, gy: 20, texture: 'prop_barrel' },
  { gx: 2, gy: 32, texture: 'prop_crate' }, { gx: 13, gy: 26, texture: 'prop_pipe' },
  { gx: 22, gy: 33, texture: 'prop_barrel' }, { gx: 50, gy: 27, texture: 'prop_crate' }, { gx: 38, gy: 35, texture: 'prop_pipe' }
];

export default class ArsenalScene extends Phaser.Scene {
  constructor() {
    super('ArsenalScene');
  }

  create() {
    const { grid, markers, zones } = buildArsenalWing();
    this.zones = zones;
    this.currentZone = null;
    this.tileMap = new TileMap(this, grid, {
      wallTexture: 'wall_arsenal',
      floorTexture: 'floor_arsenal',
      floorVariants: [
        { key: 'floor_arsenal', weight: 0.85 },
        { key: 'floor_arsenal_vent', weight: 0.15 }
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
      ...this.tileMap.allMarkers('T').map((m) => new Enemy(this, this.tileMap, m.gx, m.gy, {
        hp: 175, speed: 1.0, attackDamage: 28, xpReward: 60, texture: 'enemy_tank', hpBarWidth: 32,
        ammoDropChance: AMMO_CHANCE_TANK, onDeath: onEnemyDeath
      }))
    ];

    // Guardião da Sala de Comando — semi-boss (não é o chefe de fase, é um
    // "muro de HP" antes da recompensa), derruba o cartão que abre a Sala
    // de Controle de Artilharia.
    const miniBossSpawn = this.tileMap.marker('M');
    this.miniBoss = new MiniBoss(this, this.tileMap, miniBossSpawn.gx, miniBossSpawn.gy, {
      hp: 320, attackDamage: 26, xpReward: 120, texture: 'enemy_miniboss',
      name: 'GUARDIÃO DA ARTILHARIA', onDeath: onEnemyDeath
    });
    this.enemies.push(this.miniBoss);

    const bossSpawn = this.tileMap.marker('B');
    this.boss = new TankBoss(this, this.tileMap, bossSpawn.gx, bossSpawn.gy, {
      hp: 1300, speed: 0.65, attackDamage: 26, xpReward: 600, chargeDamage: 42, shellDamage: 36,
      texture: 'boss_tank', name: 'TANQUE DE CERCO', onDeath: onEnemyDeath
    });
    this.enemies.push(this.boss);

    // Poça de luz sob o chefe — clima de "spotlight" dramático.
    const bossWorld = this.tileMap.gridToWorld(bossSpawn.gx, bossSpawn.gy);
    this.add.image(bossWorld.x, bossWorld.y, 'light_pool').setDepth(-999).setScale(2.1).setBlendMode(Phaser.BlendModes.ADD).setTint(0x9fff6a);

    const npcSpawns = this.tileMap.allMarkers('N');
    this.npcs = ARSENAL_CAPTIVES
      .map((captive, i) => ({ captive, spot: npcSpawns[i] }))
      .filter(({ captive }) => !GameState.rescuedNpcs.has(captive.id))
      .map(({ captive, spot }, i) => new NPC(this, this.tileMap, spot.gx, spot.gy, {
        id: captive.id,
        name: captive.name,
        texture: 'npc_worker',
        lines: captive.dungeonLines,
        tint: i === 1 ? 0xbfffb0 : undefined
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
      this.add.image(world.x, world.y, 'light_pool').setDepth(-999).setBlendMode(Phaser.BlendModes.ADD).setTint(0x9fffb3);
      const sprite = this.add.image(world.x, world.y, 'item_medkit').setDepth(9000);
      this.tweens.add({ targets: sprite, y: sprite.y - 5, duration: 700, yoyo: true, repeat: -1 });
      this.items.push({
        id: `arsenal_medkit_${i}`, kind: 'heal', amount: HEAL_AMOUNT,
        gx: spot.gx, gy: spot.gy, sprite, taken: false
      });
    });

    this._buildUnlockPuzzle();
    this._buildTraps();
    this._buildArtilleryConsole();
    this.puzzleGateOpen = false;

    this.bossDoorPos = this.tileMap.marker('L');
    const doorWorld = this.tileMap.gridToWorld(this.bossDoorPos.gx, this.bossDoorPos.gy);
    this.bossDoorSprite = this.add.image(doorWorld.x, doorWorld.y, 'door').setDepth(9000).setTint(0xff4a5e);
    this.bossDoorLabel = this.add.text(doorWorld.x, doorWorld.y - 20, 'SELADA', {
      fontFamily: 'Courier New', fontSize: '8px', color: '#ff8a9c'
    }).setOrigin(0.5).setDepth(9001);
    this.bossDoorWarned = false;

    // Porta trancada da Sala de Controle de Artilharia — só abre com o
    // cartão derrubado pelo Guardião da Artilharia.
    this.artilleryKeycardCarrier = this.miniBoss;
    this.hasArtilleryKeycard = false;
    this.artilleryKeycardDropped = false;
    this.artilleryDoorUnlocked = false;
    this.artilleryDoorWarned = false;

    this.artilleryDoorPos = this.tileMap.marker('J');
    const artilleryDoorWorld = this.tileMap.gridToWorld(this.artilleryDoorPos.gx, this.artilleryDoorPos.gy);
    this.artilleryDoorSprite = this.add.image(artilleryDoorWorld.x, artilleryDoorWorld.y, 'door').setDepth(9000).setTint(0xff4a5e);
    this.artilleryDoorLabel = this.add.text(artilleryDoorWorld.x, artilleryDoorWorld.y - 20, 'SELADA', {
      fontFamily: 'Courier New', fontSize: '8px', color: '#ff8a9c'
    }).setOrigin(0.5).setDepth(9001);

    this.levelEnded = false;
    this.transitioning = false;
    this.returnDoorPos = null;
    this._lastRemaining = null;

    this._setupCamera();
    this._setupInput();
    this.cameras.main.fadeIn(350, 10, 12, 24);
    playMusic(this, 'music_arsenal');

    initHud(this, () => {
      this.game.events.emit('hud-init', { label: 'ARSENAL BLINDADO', showEnemies: true, sceneKey: 'ArsenalScene' });
      this._emitStats();
      this.game.events.emit('enemies-remaining', this.enemies.length);
    });
  }

  // Sala de Destravamento: 4 terminais na ordem correta (marcador 'Q', a
  // ordem do array é a ordem certa). Errar a ordem reinicia o progresso —
  // mesmo mecanismo já usado na Torre de Segurança, só reskinado.
  _buildUnlockPuzzle() {
    this.terminals = this.tileMap.allMarkers('Q').map((spot, i) => {
      const world = this.tileMap.gridToWorld(spot.gx, spot.gy);
      const sprite = this.add.image(world.x, world.y, 'tile_sequence_off').setDepth(spot.gy * 10 + 1);
      const label = this.add.text(world.x, world.y, String(i + 1), {
        fontFamily: 'Courier New', fontSize: '16px', color: '#9fb0d0'
      }).setOrigin(0.5).setDepth(spot.gy * 10 + 2);
      const glow = this.add.image(world.x, world.y, 'light_pool')
        .setBlendMode(Phaser.BlendModes.ADD).setTint(0x9fff6a).setScale(0.6).setDepth(9500).setVisible(false);
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
            this.game.events.emit('item-pickup', 'Terminais sincronizados!');
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

  // Corredor de Armadilhas: espinhos que ciclam sozinhos, sem depender de
  // onde o jogador está — exige cronometragem pra atravessar, não só desvio.
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

  // Console da Sala de Controle de Artilharia — sabotagem opcional que
  // desativa o bombardeio de canhão do Tanque de Cerco (o ataque mais
  // punitivo dele) pro resto da luta. Ativa sozinho por proximidade, igual
  // às torres de firewall do Núcleo de Comando.
  _buildArtilleryConsole() {
    const spot = this.tileMap.marker('V');
    const world = this.tileMap.gridToWorld(spot.gx, spot.gy);
    this.add.image(world.x, world.y, 'light_pool').setDepth(-999).setBlendMode(Phaser.BlendModes.ADD).setTint(0x9fff6a);
    const sprite = this.add.image(world.x, world.y, 'prop_console').setDepth(9000).setTint(0x9fff6a);
    const label = this.add.text(world.x, world.y - 20, 'ARTILHARIA: ATIVA', {
      fontFamily: 'Courier New', fontSize: '8px', color: '#9fff6a'
    }).setOrigin(0.5).setDepth(9001);
    this.artilleryConsole = { gx: spot.gx, gy: spot.gy, sprite, label, disabled: false };
  }

  _checkArtilleryConsole() {
    const console_ = this.artilleryConsole;
    if (console_.disabled) return;
    const dist = Math.hypot(this.player.gx - console_.gx, this.player.gy - console_.gy);
    if (dist < 0.9) {
      console_.disabled = true;
      console_.sprite.setTint(0x5c6690);
      console_.label.setText('ARTILHARIA: DESATIVADA').setColor('#9fb0d0');
      this.boss.disableCannon();
      playSfx(this, 'sfx_pickup');
      this.game.events.emit('item-pickup', 'Bombardeio de canhão do Tanque de Cerco desativado!');
    }
  }

  _checkPuzzleGate() {
    if (this.puzzleGateOpen) return;
    if (!this.puzzleSolved) return;
    this.puzzleGateOpen = true;
    this.tileMap.setWalkable(this.bossDoorPos.gx, this.bossDoorPos.gy, true);
    this.bossDoorSprite.setTint(0x9fff6a);
    this.bossDoorLabel.setText('ABERTA');
    playSfx(this, 'sfx_pickup');
    this.game.events.emit('item-pickup', 'Os terminais liberaram o acesso ao pátio de lançamento!');
  }

  _checkBossDoor() {
    if (this.puzzleGateOpen || this.bossDoorWarned) return;
    const dist = Math.hypot(this.player.gx - this.bossDoorPos.gx, this.player.gy - this.bossDoorPos.gy);
    if (dist < 1.2) {
      this.bossDoorWarned = true;
      this.game.events.emit('dialogue', 'Acesso bloqueado. O arsenal ainda não reconhece você.');
    }
  }

  _checkArtilleryKeycardDrop() {
    if (!this.artilleryKeycardCarrier || this.artilleryKeycardDropped || this.artilleryKeycardCarrier.alive) return;
    this.artilleryKeycardDropped = true;
    const world = this.tileMap.gridToWorld(this.artilleryKeycardCarrier.gx, this.artilleryKeycardCarrier.gy);
    const sprite = this.add.image(world.x, world.y, 'item_keycard').setDepth(9000).setTint(0x9fff6a);
    this.tweens.add({ targets: sprite, y: sprite.y - 5, duration: 700, yoyo: true, repeat: -1 });
    this.items.push({
      id: 'arsenal_artillery_keycard',
      kind: 'artillery_keycard',
      gx: this.artilleryKeycardCarrier.gx,
      gy: this.artilleryKeycardCarrier.gy,
      sprite,
      taken: false
    });
    playSfx(this, 'sfx_pickup');
    this.game.events.emit('item-pickup', 'O Guardião da Artilharia derrubou um Cartão de Desativação!');
  }

  _checkArtilleryDoor() {
    if (this.artilleryDoorUnlocked) return;
    const dist = Math.hypot(this.player.gx - this.artilleryDoorPos.gx, this.player.gy - this.artilleryDoorPos.gy);
    if (dist > 1.2) return;

    if (this.hasArtilleryKeycard) {
      this.artilleryDoorUnlocked = true;
      this.tileMap.setWalkable(this.artilleryDoorPos.gx, this.artilleryDoorPos.gy, true);
      this.artilleryDoorSprite.setTint(0x9fff6a);
      this.artilleryDoorLabel.setText('ABERTA');
      playSfx(this, 'sfx_pickup');
      this.game.events.emit('item-pickup', 'Sala de Controle de Artilharia destrancada!');
    } else if (!this.artilleryDoorWarned) {
      this.artilleryDoorWarned = true;
      this.game.events.emit('dialogue', 'Acesso trancado: requer um Cartão de Desativação.');
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

        if (item.kind === 'artillery_keycard') {
          this.hasArtilleryKeycard = true;
          addInventoryItem({ id: 'artillery_keycard', name: 'Cartão de Desativação', icon: 'item_keycard' });
          this.game.events.emit('item-pickup', 'Cartão de Desativação coletado! A Sala de Controle de Artilharia pode ser destrancada.');
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
          const firstTime = upgradePistol(item.name, item.pistolDamage, item.rangedKind || 'pistol', item.ammoBonus || 3);
          this.game.events.emit('item-pickup', firstTime
            ? `${item.name} equipada! Pressione F ou clique direito para atirar.`
            : `${item.name} equipada! Arma à distância trocada.`);
          this._emitStats();
          continue;
        }

        GameState.itemsTaken.add(item.id);
        if (item.kind === 'weapon') {
          equipWeapon(item.name, item.value, item.meleeKind || 'sword');
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
    this._updateTraps();
    this._checkArtilleryConsole();
    this._checkArtilleryKeycardDrop();
    this._checkArtilleryDoor();
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
      GameState.arsenalCleared = true;
      for (const captive of ARSENAL_CAPTIVES) rescueNpc(captive.id);
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
    this.cameras.main.flash(150, 159, 255, 106);
    this.cameras.main.fadeOut(420, 10, 12, 24);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.stop('UIScene');
      this.scene.start('DistrictScene');
    });
  }
}
