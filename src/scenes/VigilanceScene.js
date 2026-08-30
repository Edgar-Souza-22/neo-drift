import Phaser from 'phaser';
import TileMap from '../world/TileMap.js';
import { buildVigilanceWing } from '../world/VigilanceLayout.js';
import Player from '../entities/Player.js';
import Enemy from '../entities/Enemy.js';
import SentrySentinel from '../entities/SentrySentinel.js';
import MiniBoss from '../entities/MiniBoss.js';
import EmissoraBoss from '../entities/EmissoraBoss.js';
import NPC from '../entities/NPC.js';
import { DIRECTIONS } from '../utils/constants.js';
import { GameState, equipWeapon, equipArmor, rescueNpc, addInventoryItem, upgradePistol, addAmmo, addStim, addEmpCharge } from '../state/GameState.js';
import { VIGILANCE_CAPTIVES } from '../state/VigilanceCaptives.js';
import { initHud } from '../utils/hud.js';
import { playMusic, playSfx } from '../audio/AudioManager.js';

// Uma melhoria de cada tipo, como toda fase — sem arma nova (a novidade
// aqui é o puzzle e o confronto final), só estatística mais alta.
const ITEMS = [
  { id: 'vigilancia_weapon', markerKey: 'I', texture: 'item_sword', name: 'Lâmina de Interferência', kind: 'weapon', value: 220, tint: 0x3dffa0 },
  { id: 'vigilancia_pistol', markerKey: 'C', texture: 'item_pistol', name: 'Pistola de Rastreio', kind: 'pistol', pistolDamage: 88, ammoBonus: 6, tint: 0x3dffa0 },
  { id: 'vigilancia_armor', markerKey: 'A', texture: 'item_armor', name: 'Blindagem de Contravigilância', kind: 'armor', value: 145, tint: 0x3dffa0 }
];

const HEAL_AMOUNT = 60;
const AMMO_CHANCE_NORMAL = 0.1;
const AMMO_CHANCE_GUARD = 0.2;
const BOSS_TRIPLE_AMMO_CHANCE = 1 / 3;
const STIM_DROP_CHANCE = 0.03;
const EMP_DROP_CHANCE = 0.025;

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

function shuffleSequence(n) {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default class VigilanceScene extends Phaser.Scene {
  constructor() {
    super('VigilanceScene');
  }

  create() {
    const { grid, markers, zones } = buildVigilanceWing();
    this.zones = zones;
    this.currentZone = null;
    this.tileMap = new TileMap(this, grid, {
      wallTexture: 'wall_vigilancia',
      floorTexture: 'floor_vigilancia',
      floorVariants: [
        { key: 'floor_vigilancia', weight: 0.85 },
        { key: 'floor_vigilancia_vent', weight: 0.15 }
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
      ...this.tileMap.allMarkers('X').map((m) => new SentrySentinel(this, this.tileMap, m.gx, m.gy, {
        hp: 55, attackDamage: 10, xpReward: 22, onDeath: onEnemyDeath
      })),
      ...this.tileMap.allMarkers('W').map((m) => new SentrySentinel(this, this.tileMap, m.gx, m.gy, {
        hp: 55, attackDamage: 10, xpReward: 22, onDeath: onEnemyDeath
      })),
      ...this.tileMap.allMarkers('T').map((m) => new Enemy(this, this.tileMap, m.gx, m.gy, {
        hp: 180, speed: 1.0, attackDamage: 28, xpReward: 60, texture: 'enemy_tank', hpBarWidth: 32,
        ammoDropChance: AMMO_CHANCE_GUARD, onDeath: onEnemyDeath
      }))
    ];
    for (const enemy of this.enemies) {
      if (!(enemy instanceof SentrySentinel)) enemy.ammoDropChance = AMMO_CHANCE_NORMAL;
    }

    // Operador de Segurança — guarda o Posto de Controle, derruba o cartão
    // que abre a Sala de Override (não é o confronto final, é um obstáculo
    // resistente antes da recompensa, igual aos guardiões de fases anteriores).
    const guardSpawn = this.tileMap.marker('M');
    this.miniBoss = new MiniBoss(this, this.tileMap, guardSpawn.gx, guardSpawn.gy, {
      hp: 330, attackDamage: 26, xpReward: 120, texture: 'enemy_miniboss',
      name: 'OPERADOR DE SEGURANÇA', onDeath: onEnemyDeath
    });
    this.enemies.push(this.miniBoss);

    const bossSpawn = this.tileMap.marker('B');
    this.boss = new EmissoraBoss(this, this.tileMap, bossSpawn.gx, bossSpawn.gy, {
      onDeath: onEnemyDeath
    });
    this.enemies.push(this.boss);

    // Poça de luz sob o confronto final — clima de "spotlight" dramático.
    const bossWorld = this.tileMap.gridToWorld(bossSpawn.gx, bossSpawn.gy);
    this.add.image(bossWorld.x, bossWorld.y, 'light_pool').setDepth(-999).setScale(2.1).setBlendMode(Phaser.BlendModes.ADD).setTint(0x3dffa0);

    const npcSpawns = this.tileMap.allMarkers('N');
    this.npcs = VIGILANCE_CAPTIVES
      .map((captive, i) => ({ captive, spot: npcSpawns[i] }))
      .filter(({ captive }) => !GameState.rescuedNpcs.has(captive.id))
      .map(({ captive, spot }, i) => new NPC(this, this.tileMap, spot.gx, spot.gy, {
        id: captive.id,
        name: captive.name,
        texture: 'npc_worker',
        lines: captive.dungeonLines,
        tint: i === 1 ? 0xbfffd8 : undefined
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
        id: `vigilancia_medkit_${i}`, kind: 'heal', amount: HEAL_AMOUNT,
        gx: spot.gx, gy: spot.gy, sprite, taken: false
      });
    });

    this._buildSignalPuzzle();
    this._buildOverrideConsole();
    this.puzzleGateOpen = false;

    this.bossDoorPos = this.tileMap.marker('L');
    const doorWorld = this.tileMap.gridToWorld(this.bossDoorPos.gx, this.bossDoorPos.gy);
    this.bossDoorSprite = this.add.image(doorWorld.x, doorWorld.y, 'door').setDepth(9000).setTint(0xff4a5e);
    this.bossDoorLabel = this.add.text(doorWorld.x, doorWorld.y - 20, 'SELADA', {
      fontFamily: 'Courier New', fontSize: '8px', color: '#ff8a9c'
    }).setOrigin(0.5).setDepth(9001);
    this.bossDoorWarned = false;

    // Porta trancada da Sala de Override — só abre com o cartão derrubado
    // pelo Operador de Segurança.
    this.overrideKeycardCarrier = this.miniBoss;
    this.hasOverrideKeycard = false;
    this.overrideKeycardDropped = false;
    this.overrideDoorUnlocked = false;
    this.overrideDoorWarned = false;

    this.overrideDoorPos = this.tileMap.marker('J');
    const overrideDoorWorld = this.tileMap.gridToWorld(this.overrideDoorPos.gx, this.overrideDoorPos.gy);
    this.overrideDoorSprite = this.add.image(overrideDoorWorld.x, overrideDoorWorld.y, 'door').setDepth(9000).setTint(0xff4a5e);
    this.overrideDoorLabel = this.add.text(overrideDoorWorld.x, overrideDoorWorld.y - 20, 'SELADA', {
      fontFamily: 'Courier New', fontSize: '8px', color: '#ff8a9c'
    }).setOrigin(0.5).setDepth(9001);

    this.levelEnded = false;
    this.transitioning = false;
    this.returnDoorPos = null;
    this._lastRemaining = null;

    this._setupCamera();
    this._setupInput();
    this.cameras.main.fadeIn(350, 10, 12, 24);
    playMusic(this, 'music_vigilancia');

    initHud(this, () => {
      this.game.events.emit('hud-init', { label: 'CENTRAL DE VIGILÂNCIA', showEnemies: true, sceneKey: 'VigilanceScene' });
      this._emitStats();
      this.game.events.emit('enemies-remaining', this.enemies.length);
    });
  }

  // Sala de Sinal: 4 painéis, ordem revelada por uma demonstração de luzes
  // (memória) em vez de números fixos escritos na placa — a cada visita a
  // ordem é sorteada de novo. Errar reinicia o progresso e repete a
  // demonstração automaticamente, pra nunca deixar o jogador travado sem
  // como conferir a sequência de novo.
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
            this.game.events.emit('item-pickup', 'Sinal sincronizado!');
            this._checkPuzzleGate();
          } else {
            this.game.events.emit('item-pickup', `Painel correto. (${this.signalStep}/${this.signalSequence.length})`);
          }
        } else {
          const wasProgressing = this.signalStep > 0;
          this.signalStep = 0;
          for (const p of this.signalPads) this._paintSignal(p, false);
          if (wasProgressing) {
            playSfx(this, 'sfx_player_hurt', { volume: 0.3 });
            this.game.events.emit('item-pickup', 'Sequência errada! Observando de novo...');
          }
          this.time.delayedCall(700, () => this._playSignalDemo());
        }
      }
      pad.wasOn = on;
    }
  }

  // Console de Override da Sala de Override — sabotagem opcional que
  // desativa a invocação de reforços de A Emissora pro resto do confronto.
  _buildOverrideConsole() {
    const spot = this.tileMap.marker('V');
    const world = this.tileMap.gridToWorld(spot.gx, spot.gy);
    this.add.image(world.x, world.y, 'light_pool').setDepth(-999).setBlendMode(Phaser.BlendModes.ADD).setTint(0x3dffa0);
    const sprite = this.add.image(world.x, world.y, 'prop_console').setDepth(9000).setTint(0x3dffa0);
    const label = this.add.text(world.x, world.y - 20, 'RETRANSMISSÃO: ATIVA', {
      fontFamily: 'Courier New', fontSize: '8px', color: '#3dffa0'
    }).setOrigin(0.5).setDepth(9001);
    this.overrideConsole = { gx: spot.gx, gy: spot.gy, sprite, label, disabled: false };
  }

  _checkOverrideConsole() {
    const console_ = this.overrideConsole;
    if (console_.disabled) return;
    const dist = Math.hypot(this.player.gx - console_.gx, this.player.gy - console_.gy);
    if (dist < 0.9) {
      console_.disabled = true;
      console_.sprite.setTint(0x5c6690);
      console_.label.setText('RETRANSMISSÃO: DESATIVADA').setColor('#9fb0d0');
      this.boss.disableSummon();
      playSfx(this, 'sfx_pickup');
      this.game.events.emit('item-pickup', 'Retransmissão de reforços de A Emissora desativada!');
    }
  }

  _checkPuzzleGate() {
    if (this.puzzleGateOpen) return;
    if (!this.signalSolved) return;
    this.puzzleGateOpen = true;
    this.tileMap.setWalkable(this.bossDoorPos.gx, this.bossDoorPos.gy, true);
    this.bossDoorSprite.setTint(0x3dffa0);
    this.bossDoorLabel.setText('ABERTA');
    playSfx(this, 'sfx_pickup');
    this.game.events.emit('item-pickup', 'O sinal liberou o acesso à câmara de transmissão!');
  }

  _checkBossDoor() {
    if (this.puzzleGateOpen || this.bossDoorWarned) return;
    const dist = Math.hypot(this.player.gx - this.bossDoorPos.gx, this.player.gy - this.bossDoorPos.gy);
    if (dist < 1.2) {
      this.bossDoorWarned = true;
      this.game.events.emit('dialogue', 'Acesso bloqueado. A central ainda não reconhece você.');
    }
  }

  _checkOverrideKeycardDrop() {
    if (!this.overrideKeycardCarrier || this.overrideKeycardDropped || this.overrideKeycardCarrier.alive) return;
    this.overrideKeycardDropped = true;
    const world = this.tileMap.gridToWorld(this.overrideKeycardCarrier.gx, this.overrideKeycardCarrier.gy);
    const sprite = this.add.image(world.x, world.y, 'item_keycard').setDepth(9000).setTint(0x3dffa0);
    this.tweens.add({ targets: sprite, y: sprite.y - 5, duration: 700, yoyo: true, repeat: -1 });
    this.items.push({
      id: 'vigilancia_override_keycard',
      kind: 'override_keycard',
      gx: this.overrideKeycardCarrier.gx,
      gy: this.overrideKeycardCarrier.gy,
      sprite,
      taken: false
    });
    playSfx(this, 'sfx_pickup');
    this.game.events.emit('item-pickup', 'O Operador de Segurança derrubou um Cartão de Override!');
  }

  _checkOverrideDoor() {
    if (this.overrideDoorUnlocked) return;
    const dist = Math.hypot(this.player.gx - this.overrideDoorPos.gx, this.player.gy - this.overrideDoorPos.gy);
    if (dist > 1.2) return;

    if (this.hasOverrideKeycard) {
      this.overrideDoorUnlocked = true;
      this.tileMap.setWalkable(this.overrideDoorPos.gx, this.overrideDoorPos.gy, true);
      this.overrideDoorSprite.setTint(0x3dffa0);
      this.overrideDoorLabel.setText('ABERTA');
      playSfx(this, 'sfx_pickup');
      this.game.events.emit('item-pickup', 'Sala de Override destrancada!');
    } else if (!this.overrideDoorWarned) {
      this.overrideDoorWarned = true;
      this.game.events.emit('dialogue', 'Acesso trancado: requer um Cartão de Override.');
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

        if (item.kind === 'override_keycard') {
          this.hasOverrideKeycard = true;
          addInventoryItem({ id: 'override_keycard', name: 'Cartão de Override', icon: 'item_keycard' });
          this.game.events.emit('item-pickup', 'Cartão de Override coletado! A Sala de Override pode ser destrancada.');
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
    this._checkSignalPuzzle();
    this._checkOverrideConsole();
    this._checkOverrideKeycardDrop();
    this._checkOverrideDoor();
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
      GameState.vigilanceCleared = true;
      for (const captive of VIGILANCE_CAPTIVES) rescueNpc(captive.id);
      this._spawnReturnDoor();
    }
  }

  // Porta que aparece na câmara final após a vitória, levando de volta ao
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
    this.cameras.main.flash(150, 61, 255, 160);
    this.cameras.main.fadeOut(420, 10, 12, 24);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.stop('UIScene');
      this.scene.start('DistrictScene');
    });
  }
}
