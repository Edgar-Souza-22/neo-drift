import Phaser from 'phaser';
import TileMap from '../world/TileMap.js';
import { buildCoreWing } from '../world/CoreLayout.js';
import Player from '../entities/Player.js';
import Enemy from '../entities/Enemy.js';
import JammerDrone from '../entities/JammerDrone.js';
import CoreBoss from '../entities/CoreBoss.js';
import NPC from '../entities/NPC.js';
import { DIRECTIONS } from '../utils/constants.js';
import { GameState, equipWeapon, equipArmor, rescueNpc, addInventoryItem, upgradePistol, addAmmo, addStim, addEmpCharge } from '../state/GameState.js';
import { CORE_CAPTIVES } from '../state/CoreCaptives.js';
import { initHud } from '../utils/hud.js';
import { playMusic, playSfx } from '../audio/AudioManager.js';

// Uma melhoria de cada tipo por fase — todas encontradas normalmente pelo
// mapa. O mecanismo de bloqueio desta fase não é um cofre único: é a
// Câmara do Núcleo (onde fica o chefe) que só abre com as 3 torres de
// firewall hackeadas.
const ITEMS = [
  { id: 'core_sword', markerKey: 'I', texture: 'item_sword', name: 'Lâmina de Silício', kind: 'weapon', value: 120, tint: 0xd88bff },
  { id: 'core_pistol_upgrade', markerKey: 'C', texture: 'item_pistol', name: 'Pistola Neural', kind: 'pistol', pistolDamage: 58, tint: 0x9f5fff },
  { id: 'core_armor', markerKey: 'A', texture: 'item_armor', name: 'Blindagem Adaptativa', kind: 'armor', value: 85, tint: 0xd88bff }
];

const HEAL_AMOUNT = 50;
const TOWER_COUNT = 3;
const AMMO_CHANCE_NORMAL = 0.1;
const AMMO_CHANCE_TANK = 0.2;
const BOSS_TRIPLE_AMMO_CHANCE = 1 / 3;
const STIM_DROP_CHANCE = 0.03;
const EMP_DROP_CHANCE = 0.025;

// Decoração de cenário — só visual, cantos de sala livres de marcadores.
const PROPS = [
  { gx: 1, gy: 1, texture: 'prop_crate' }, { gx: 7, gy: 8, texture: 'prop_pipe' },
  { gx: 12, gy: 1, texture: 'prop_barrel' }, { gx: 19, gy: 8, texture: 'prop_crate' },
  { gx: 25, gy: 1, texture: 'prop_pipe' }, { gx: 32, gy: 8, texture: 'prop_barrel' },
  { gx: 39, gy: 1, texture: 'prop_crate' }, { gx: 50, gy: 3, texture: 'prop_pipe' }, { gx: 44, gy: 10, texture: 'prop_barrel' },
  { gx: 2, gy: 20, texture: 'prop_crate' }, { gx: 15, gy: 14, texture: 'prop_pipe' },
  { gx: 22, gy: 20, texture: 'prop_barrel' }, { gx: 28, gy: 14, texture: 'prop_crate' },
  { gx: 41, gy: 14, texture: 'prop_pipe' }, { gx: 50, gy: 20, texture: 'prop_barrel' },
  { gx: 2, gy: 32, texture: 'prop_crate' }, { gx: 13, gy: 26, texture: 'prop_pipe' },
  { gx: 22, gy: 33, texture: 'prop_barrel' }, { gx: 50, gy: 27, texture: 'prop_crate' }, { gx: 38, gy: 35, texture: 'prop_pipe' }
];

export default class CoreScene extends Phaser.Scene {
  constructor() {
    super('CoreScene');
  }

  create() {
    const { grid, markers, zones } = buildCoreWing();
    this.zones = zones;
    this.currentZone = null;
    this.tileMap = new TileMap(this, grid, {
      wallTexture: 'wall_core',
      floorTexture: 'floor_core',
      floorVariants: [
        { key: 'floor_core', weight: 0.78 },
        { key: 'floor_core_vent', weight: 0.15 },
        { key: 'floor_hazard', weight: 0.07 }
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
      ...this.tileMap.allMarkers('X').map((m) => new JammerDrone(this, this.tileMap, m.gx, m.gy, {
        hp: 60, attackDamage: 12, xpReward: 28,
        ammoDropChance: AMMO_CHANCE_NORMAL, onDeath: onEnemyDeath
      })),
      ...this.tileMap.allMarkers('T').map((m) => new Enemy(this, this.tileMap, m.gx, m.gy, {
        hp: 150, speed: 1.0, attackDamage: 24, xpReward: 50, texture: 'enemy_tank', hpBarWidth: 32,
        ammoDropChance: AMMO_CHANCE_TANK, onDeath: onEnemyDeath
      }))
    ];

    const bossSpawn = this.tileMap.marker('B');
    this.boss = new CoreBoss(this, this.tileMap, bossSpawn.gx, bossSpawn.gy, {
      hp: 850, speed: 1.15, attackDamage: 24, xpReward: 400,
      texture: 'boss_core', name: 'VIGIA CENTRAL', onDeath: onEnemyDeath
    });
    this.enemies.push(this.boss);

    // Poça de luz sob o chefe — clima de "spotlight" dramático.
    const bossWorld = this.tileMap.gridToWorld(bossSpawn.gx, bossSpawn.gy);
    this.add.image(bossWorld.x, bossWorld.y, 'light_pool').setDepth(-999).setScale(1.8).setBlendMode(Phaser.BlendModes.ADD).setTint(0xd88bff);

    const npcSpawns = this.tileMap.allMarkers('N');
    this.npcs = CORE_CAPTIVES
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
        id: `core_medkit_${i}`, kind: 'heal', amount: HEAL_AMOUNT,
        gx: spot.gx, gy: spot.gy, sprite, taken: false
      });
    });

    // As 3 Torres de Firewall — mecanismo estrutural desta fase, no lugar
    // do cofre único das fases anteriores. Cada uma hackeia sozinha ao se
    // aproximar (não precisa limpar a sala primeiro, mas ela vem guardada).
    // A Câmara do Núcleo só abre quando as 3 estiverem hackeadas.
    this.towers = this.tileMap.allMarkers('F').map((spot, i) => {
      const world = this.tileMap.gridToWorld(spot.gx, spot.gy);
      const sprite = this.add.image(world.x, world.y, 'prop_console').setOrigin(0.5, 0.85).setDepth(spot.gy * 10 + 2);
      return { id: `tower_${i}`, gx: spot.gx, gy: spot.gy, sprite, hacked: false };
    });
    this.towersHacked = 0;

    this.coreDoorPos = this.tileMap.marker('L');
    const doorWorld = this.tileMap.gridToWorld(this.coreDoorPos.gx, this.coreDoorPos.gy);
    this.coreDoorSprite = this.add.image(doorWorld.x, doorWorld.y, 'door').setDepth(9000).setTint(0xff4a5e);
    this.coreDoorLabel = this.add.text(doorWorld.x, doorWorld.y - 20, `SELADA 0/${TOWER_COUNT}`, {
      fontFamily: 'Courier New', fontSize: '8px', color: '#ff8a9c'
    }).setOrigin(0.5).setDepth(9001);
    this.coreDoorUnlocked = false;
    this.coreDoorWarned = false;

    this.levelEnded = false;
    this.transitioning = false;
    this.returnDoorPos = null;
    this._lastRemaining = null;

    this._setupCamera();
    this._setupInput();
    this.cameras.main.fadeIn(350, 10, 12, 24);
    playMusic(this, 'music_core');

    initHud(this, () => {
      this.game.events.emit('hud-init', { label: 'NÚCLEO DE COMANDO', showEnemies: true, sceneKey: 'CoreScene' });
      this._emitStats();
      this.game.events.emit('enemies-remaining', this.enemies.length);
    });
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

  // Hackeia uma torre por proximidade (sem precisar limpar a sala primeiro)
  // — quando as 3 estiverem hackeadas, a Câmara do Núcleo destranca.
  _checkTowers() {
    if (this.coreDoorUnlocked) return;
    for (const tower of this.towers) {
      if (tower.hacked) continue;
      const dist = Math.hypot(this.player.gx - tower.gx, this.player.gy - tower.gy);
      if (dist < 0.9) {
        tower.hacked = true;
        tower.sprite.setTint(0x9fffe8);
        this.towersHacked++;
        playSfx(this, 'sfx_pickup');
        this.game.events.emit('item-pickup', `Torre de firewall neutralizada! (${this.towersHacked}/${TOWER_COUNT})`);

        if (this.towersHacked >= TOWER_COUNT) {
          this.coreDoorUnlocked = true;
          this.tileMap.setWalkable(this.coreDoorPos.gx, this.coreDoorPos.gy, true);
          this.coreDoorSprite.setTint(0x9fffe8);
          this.coreDoorLabel.setText('ABERTA');
          this.game.events.emit('item-pickup', 'As 3 torres foram neutralizadas — a Câmara do Núcleo abriu!');
        } else {
          this.coreDoorLabel.setText(`SELADA ${this.towersHacked}/${TOWER_COUNT}`);
        }
      }
    }
  }

  _checkCoreDoor() {
    if (this.coreDoorUnlocked || this.coreDoorWarned) return;
    const dist = Math.hypot(this.player.gx - this.coreDoorPos.gx, this.player.gy - this.coreDoorPos.gy);
    if (dist < 1.2) {
      this.coreDoorWarned = true;
      this.game.events.emit('dialogue', `Câmara selada: neutralize as ${TOWER_COUNT} torres de firewall.`);
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
    this._checkTowers();
    this._checkCoreDoor();
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
      GameState.coreCleared = true;
      for (const captive of CORE_CAPTIVES) rescueNpc(captive.id);
      this._spawnReturnDoor();
    }
  }

  // Porta que aparece na sala do chefe após a vitória, levando de volta à
  // Ala Central — mesma animação de transição usada na porta de entrada.
  _spawnReturnDoor() {
    this.returnDoorPos = { gx: this.boss.spawn.gx, gy: this.boss.spawn.gy + 1 };
    const world = this.tileMap.gridToWorld(this.returnDoorPos.gx, this.returnDoorPos.gy);
    this.returnDoorSprite = this.add.image(world.x, world.y, 'door').setDepth(9000);
    this.tweens.add({ targets: this.returnDoorSprite, alpha: 0.45, duration: 650, yoyo: true, repeat: -1 });
    this.add.text(world.x, world.y - 20, 'ALA CENTRAL ←', {
      fontFamily: 'Courier New', fontSize: '8px', color: '#18e8ff'
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
    this.cameras.main.flash(150, 24, 232, 255);
    this.cameras.main.fadeOut(420, 10, 12, 24);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.stop('UIScene');
      this.scene.start('TownScene');
    });
  }
}
