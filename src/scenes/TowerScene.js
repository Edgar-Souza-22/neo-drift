import Phaser from 'phaser';
import TileMap from '../world/TileMap.js';
import { buildTowerWing } from '../world/TowerLayout.js';
import Player from '../entities/Player.js';
import Enemy from '../entities/Enemy.js';
import ShooterDrone from '../entities/ShooterDrone.js';
import CuratorBoss from '../entities/CuratorBoss.js';
import NPC from '../entities/NPC.js';
import { DIRECTIONS } from '../utils/constants.js';
import { GameState, equipWeapon, equipArmor, rescueNpc, addInventoryItem, upgradePistol, addAmmo, addStim, addEmpCharge } from '../state/GameState.js';
import { TOWER_CAPTIVES } from '../state/TowerCaptives.js';
import { initHud } from '../utils/hud.js';
import { playMusic, playSfx } from '../audio/AudioManager.js';

// Uma melhoria de cada tipo por fase — todas encontradas normalmente pelo
// mapa. O mecanismo de bloqueio desta fase são dois quebra-cabeças reais,
// não um cofre nem alvos de combate.
const ITEMS = [
  { id: 'tower_pilebunker', markerKey: 'I', texture: 'item_pilebunker', name: 'Britadeira', kind: 'weapon', meleeKind: 'pilebunker', value: 140, tint: 0x8fc9ff },
  { id: 'tower_pistol_upgrade', markerKey: 'C', texture: 'item_pistol', name: 'Pistola de Precisão', kind: 'pistol', pistolDamage: 72, tint: 0x8fc9ff },
  { id: 'tower_armor', markerKey: 'A', texture: 'item_armor', name: 'Blindagem do Curador', kind: 'armor', value: 100, tint: 0xffd27a }
];

const HEAL_AMOUNT = 50;
const AMMO_CHANCE_NORMAL = 0.1;
const AMMO_CHANCE_TANK = 0.2;
const BOSS_TRIPLE_AMMO_CHANCE = 1 / 3;
const STIM_DROP_CHANCE = 0.03;
const EMP_DROP_CHANCE = 0.025;

// Vizinhos (dentro do formato em cruz) que cada célula do circuito também
// alterna ao ser ativada — puzzle "apaga-liga" clássico.
const CIRCUIT_NEIGHBORS = {
  center: ['top', 'bottom', 'left', 'right'],
  top: ['center'],
  bottom: ['center'],
  left: ['center'],
  right: ['center']
};
const CIRCUIT_ROLES = ['center', 'top', 'bottom', 'left', 'right'];
// Estado inicial escolhido de forma que a solução seja "ativar top e
// bottom" (nessa ordem ou na outra, não importa) — ver comentário em
// _buildCircuitPuzzle.
const CIRCUIT_INITIAL_LIT = { center: true, top: false, bottom: false, left: true, right: true };

const LIT_TINT = 0x9fffe8;

// Decoração de cenário — só visual, cantos de sala livres de marcadores.
const PROPS = [
  { gx: 1, gy: 1, texture: 'prop_crate' }, { gx: 7, gy: 8, texture: 'prop_pipe' },
  { gx: 12, gy: 1, texture: 'prop_barrel' }, { gx: 19, gy: 8, texture: 'prop_crate' },
  { gx: 25, gy: 1, texture: 'prop_pipe' }, { gx: 32, gy: 8, texture: 'prop_barrel' },
  { gx: 39, gy: 1, texture: 'prop_crate' }, { gx: 50, gy: 3, texture: 'prop_pipe' }, { gx: 44, gy: 10, texture: 'prop_barrel' },
  { gx: 15, gy: 14, texture: 'prop_pipe' }, { gx: 21, gy: 20, texture: 'prop_crate' },
  { gx: 41, gy: 14, texture: 'prop_pipe' }, { gx: 50, gy: 20, texture: 'prop_barrel' },
  { gx: 2, gy: 32, texture: 'prop_crate' }, { gx: 13, gy: 26, texture: 'prop_pipe' },
  { gx: 22, gy: 33, texture: 'prop_barrel' }, { gx: 50, gy: 27, texture: 'prop_crate' }, { gx: 38, gy: 35, texture: 'prop_pipe' }
];

export default class TowerScene extends Phaser.Scene {
  constructor() {
    super('TowerScene');
  }

  create() {
    const { grid, markers, zones } = buildTowerWing();
    this.zones = zones;
    this.currentZone = null;
    this.tileMap = new TileMap(this, grid, {
      wallTexture: 'wall_tower',
      floorTexture: 'floor_tower',
      floorVariants: [
        { key: 'floor_tower', weight: 0.85 },
        { key: 'floor_tower_vent', weight: 0.15 }
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
        hp: 55, attackDamage: 11, xpReward: 30,
        ammoDropChance: AMMO_CHANCE_NORMAL, onDeath: onEnemyDeath
      })),
      ...this.tileMap.allMarkers('T').map((m) => new Enemy(this, this.tileMap, m.gx, m.gy, {
        hp: 160, speed: 1.0, attackDamage: 26, xpReward: 55, texture: 'enemy_tank', hpBarWidth: 32,
        ammoDropChance: AMMO_CHANCE_TANK, onDeath: onEnemyDeath
      }))
    ];

    const bossSpawn = this.tileMap.marker('B');
    this.boss = new CuratorBoss(this, this.tileMap, bossSpawn.gx, bossSpawn.gy, {
      hp: 900, speed: 1.1, attackDamage: 24, xpReward: 450, burstDamage: 30,
      texture: 'boss_curator', name: 'CURADOR SUPREMO', onDeath: onEnemyDeath
    });
    this.enemies.push(this.boss);

    // Poça de luz sob o chefe — clima de "spotlight" dramático.
    const bossWorld = this.tileMap.gridToWorld(bossSpawn.gx, bossSpawn.gy);
    this.add.image(bossWorld.x, bossWorld.y, 'light_pool').setDepth(-999).setScale(1.8).setBlendMode(Phaser.BlendModes.ADD).setTint(0x8fc9ff);

    const npcSpawns = this.tileMap.allMarkers('N');
    this.npcs = TOWER_CAPTIVES
      .map((captive, i) => ({ captive, spot: npcSpawns[i] }))
      .filter(({ captive }) => !GameState.rescuedNpcs.has(captive.id))
      .map(({ captive, spot }, i) => new NPC(this, this.tileMap, spot.gx, spot.gy, {
        id: captive.id,
        name: captive.name,
        texture: 'npc_worker',
        lines: captive.dungeonLines,
        tint: i === 1 ? 0xbfe0ff : undefined
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
        id: `tower_medkit_${i}`, kind: 'heal', amount: HEAL_AMOUNT,
        gx: spot.gx, gy: spot.gy, sprite, taken: false
      });
    });

    this._buildSequencePuzzle();
    this._buildCircuitPuzzle();
    this.puzzleGateOpen = false;

    this.bossDoorPos = this.tileMap.marker('L');
    const doorWorld = this.tileMap.gridToWorld(this.bossDoorPos.gx, this.bossDoorPos.gy);
    this.bossDoorSprite = this.add.image(doorWorld.x, doorWorld.y, 'door').setDepth(9000).setTint(0xff4a5e);
    this.bossDoorLabel = this.add.text(doorWorld.x, doorWorld.y - 20, 'SELADA', {
      fontFamily: 'Courier New', fontSize: '8px', color: '#ff8a9c'
    }).setOrigin(0.5).setDepth(9001);
    this.bossDoorWarned = false;

    this.levelEnded = false;
    this.transitioning = false;
    this.returnDoorPos = null;
    this._lastRemaining = null;

    this._setupCamera();
    this._setupInput();
    this.cameras.main.fadeIn(350, 10, 12, 24);
    playMusic(this, 'music_tower');

    initHud(this, () => {
      this.game.events.emit('hud-init', { label: 'TORRE DE SEGURANÇA', showEnemies: true, sceneKey: 'TowerScene' });
      this._emitStats();
      this.game.events.emit('enemies-remaining', this.enemies.length);
    });
  }

  // Sala de Sequência: 4 placas numeradas 1-4 (marcador 'Q', na ordem
  // correta). Pisar fora de ordem reinicia o progresso.
  _buildSequencePuzzle() {
    this.sequencePlates = this.tileMap.allMarkers('Q').map((spot, i) => {
      const world = this.tileMap.gridToWorld(spot.gx, spot.gy);
      const sprite = this.add.image(world.x, world.y, 'tile_sequence_off').setDepth(spot.gy * 10 + 1);
      const label = this.add.text(world.x, world.y, String(i + 1), {
        fontFamily: 'Courier New', fontSize: '16px', color: '#9fb0d0'
      }).setOrigin(0.5).setDepth(spot.gy * 10 + 2);
      // Brilho ADD numa profundidade bem acima do jogador — sem isso, pisar
      // em cima da placa (o normal, pra ativá-la) esconde justamente a cor
      // que diz se ela está acesa ou não.
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
            this.game.events.emit('item-pickup', 'Sequência correta!');
            this._checkPuzzleGate();
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

  // Sala de Circuito: puzzle "apaga-liga" — 5 células em cruz (marcador
  // 'K': centro, cima, baixo, esquerda, direita). Ativar uma célula também
  // alterna suas vizinhas dentro da cruz. Objetivo: todas acesas.
  // Estado inicial (centro/esquerda/direita ACESOS, cima/baixo APAGADOS) é
  // escolhido de propósito: a solução é ativar cima e depois baixo (ou na
  // ordem inversa — em "apaga-liga" a ordem não importa pro resultado final).
  _buildCircuitPuzzle() {
    this.circuitTiles = this.tileMap.allMarkers('K').map((spot, i) => {
      const role = CIRCUIT_ROLES[i];
      const world = this.tileMap.gridToWorld(spot.gx, spot.gy);
      const sprite = this.add.image(world.x, world.y, 'tile_circuit_off').setDepth(spot.gy * 10 + 1);
      // Brilho ADD numa profundidade bem acima do jogador — mesmo motivo da
      // Sala de Sequência: pisar na célula (pra ativá-la) não pode esconder
      // se ela está acesa ou apagada.
      const glow = this.add.image(world.x, world.y, 'light_pool')
        .setBlendMode(Phaser.BlendModes.ADD).setTint(LIT_TINT).setScale(0.55).setDepth(9500).setVisible(false);
      const tile = { role, gx: spot.gx, gy: spot.gy, sprite, glow, lit: CIRCUIT_INITIAL_LIT[role], wasOn: false };
      return tile;
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
          this.game.events.emit('item-pickup', 'Circuito estabilizado!');
          this._checkPuzzleGate();
        }
      }
      tile.wasOn = on;
    }
  }

  _checkPuzzleGate() {
    if (this.puzzleGateOpen) return;
    if (this.sequenceSolved && this.circuitSolved) {
      this.puzzleGateOpen = true;
      this.tileMap.setWalkable(this.bossDoorPos.gx, this.bossDoorPos.gy, true);
      this.bossDoorSprite.setTint(0x9fffe8);
      this.bossDoorLabel.setText('ABERTA');
      playSfx(this, 'sfx_pickup');
      this.game.events.emit('item-pickup', 'Os sistemas da torre se estabilizaram — a Câmara do Curador abriu!');
    }
  }

  _checkBossDoor() {
    if (this.puzzleGateOpen || this.bossDoorWarned) return;
    const dist = Math.hypot(this.player.gx - this.bossDoorPos.gx, this.player.gy - this.bossDoorPos.gy);
    if (dist < 1.2) {
      this.bossDoorWarned = true;
      this.game.events.emit('dialogue', 'Câmara selada. A torre ainda não reconhece você.');
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
    this._checkSequencePuzzle();
    this._checkCircuitPuzzle();
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
      GameState.towerCleared = true;
      for (const captive of TOWER_CAPTIVES) rescueNpc(captive.id);
      this._spawnReturnDoor();
    }
  }

  // Porta que aparece na sala do chefe após a vitória, levando de volta ao
  // Distrito Neon — mesma animação de transição usada na porta de entrada.
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

  // Mesma animação de transição da porta de entrada (flash + fade pro preto).
  _enterReturnDoor() {
    this.transitioning = true;
    this.player.isMoving = false;
    playSfx(this, 'sfx_door');

    this.tweens.add({ targets: this.returnDoorSprite, scale: 1.35, duration: 200, yoyo: true, ease: 'Cubic.Out' });
    this.cameras.main.flash(150, 255, 95, 208);
    this.cameras.main.fadeOut(420, 10, 12, 24);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.stop('UIScene');
      this.scene.start('DistrictScene');
    });
  }
}
