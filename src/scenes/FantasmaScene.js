import Phaser from 'phaser';
import TileMap from '../world/TileMap.js';
import { buildFantasmaWing } from '../world/FantasmaLayout.js';
import Player from '../entities/Player.js';
import Enemy from '../entities/Enemy.js';
import MiniBoss from '../entities/MiniBoss.js';
import GhostTrainBoss from '../entities/GhostTrainBoss.js';
import NPC from '../entities/NPC.js';
import { DIRECTIONS } from '../utils/constants.js';
import { GameState, equipWeapon, equipArmor, equipBoots, rescueNpc, addInventoryItem, upgradePistol, addAmmo, addStim, addEmpCharge } from '../state/GameState.js';
import { FANTASMA_CAPTIVES } from '../state/FantasmaCaptives.js';
import { initHud } from '../utils/hud.js';
import { playMusic, playSfx } from '../audio/AudioManager.js';

// Uma melhoria de cada tipo, como toda fase. A armadura fica dentro da Sala
// de Sinalização — a recompensa pelo desvio obrigatório, não um cofre à parte.
// Botas de Impulso: primeira fase do Submundo (3ª região) — maior bônus das
// três até agora, ver nota em DungeonScene.js.
const ITEMS = [
  { id: 'fantasma_weapon', markerKey: 'I', texture: 'item_sword', name: 'Lâmina Subterrânea', kind: 'weapon', value: 250, tint: 0xc9a06a },
  { id: 'fantasma_pistol', markerKey: 'C', texture: 'item_pistol', name: 'Pistola de Emergência', kind: 'pistol', pistolDamage: 98, ammoBonus: 6, tint: 0xc9a06a },
  { id: 'fantasma_armor', markerKey: 'A', texture: 'item_armor', name: 'Blindagem de Túnel', kind: 'armor', value: 160, tint: 0xc9a06a },
  { id: 'fantasma_boots', markerKey: 'P', texture: 'item_boots', name: 'Botas de Eco Subterrâneo', kind: 'boots', speedMul: 1.35 }
];

const HEAL_AMOUNT = 60;
const AMMO_CHANCE_NORMAL = 0.1;
const AMMO_CHANCE_TANK = 0.2;
const BOSS_TRIPLE_AMMO_CHANCE = 1 / 3;
const STIM_DROP_CHANCE = 0.03;
const EMP_DROP_CHANCE = 0.025;

// Decoração de cenário — só visual, cantos de sala livres de marcadores.
const PROPS = [
  { gx: 2, gy: 10, texture: 'prop_crate' }, { gx: 7, gy: 16, texture: 'prop_pipe' },
  { gx: 16, gy: 10, texture: 'prop_barrel' }, { gx: 21, gy: 16, texture: 'prop_crate' },
  { gx: 30, gy: 10, texture: 'prop_pipe' }, { gx: 35, gy: 16, texture: 'prop_barrel' },
  { gx: 44, gy: 16, texture: 'prop_crate' },
  { gx: 58, gy: 10, texture: 'prop_pipe' },
  { gx: 72, gy: 10, texture: 'prop_crate' }, { gx: 77, gy: 16, texture: 'prop_barrel' },
  { gx: 87, gy: 5, texture: 'prop_pipe' }, { gx: 102, gy: 5, texture: 'prop_crate' },
  { gx: 87, gy: 21, texture: 'prop_barrel' }, { gx: 102, gy: 21, texture: 'prop_pipe' },
  { gx: 30, gy: 26, texture: 'prop_crate' }, { gx: 35, gy: 23, texture: 'prop_barrel' },
  { gx: 44, gy: 26, texture: 'prop_pipe' },
  { gx: 57, gy: 2, texture: 'prop_crate' }, { gx: 65, gy: 2, texture: 'prop_barrel' }
];

export default class FantasmaScene extends Phaser.Scene {
  constructor() {
    super('FantasmaScene');
  }

  create() {
    const { grid, markers, zones } = buildFantasmaWing();
    this.zones = zones;
    this.currentZone = null;
    this.tileMap = new TileMap(this, grid, {
      wallTexture: 'wall_fantasma',
      floorTexture: 'floor_fantasma',
      floorVariants: [
        { key: 'floor_fantasma', weight: 0.85 },
        { key: 'floor_fantasma_vent', weight: 0.15 }
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
      ...this.tileMap.allMarkers('X').map((m) => new Enemy(this, this.tileMap, m.gx, m.gy, {
        hp: 45, speed: 1.35, attackDamage: 14, xpReward: 22, texture: 'enemy_dweller', hpBarWidth: 20,
        ammoDropChance: AMMO_CHANCE_NORMAL, onDeath: onEnemyDeath
      })),
      ...this.tileMap.allMarkers('T').map((m) => new Enemy(this, this.tileMap, m.gx, m.gy, {
        hp: 190, speed: 1.0, attackDamage: 28, xpReward: 60, texture: 'enemy_tank', hpBarWidth: 32,
        ammoDropChance: AMMO_CHANCE_TANK, onDeath: onEnemyDeath
      }))
    ];

    // Guardião da Sinalização — na Sala de Sinalização, o desvio OBRIGATÓRIO
    // da linha. Derrotá-lo é o que abre o Portão dos Trilhos — sem puzzle,
    // sem cartão: resolver a sala É a chave.
    const guardSpawn = this.tileMap.marker('M');
    this.miniBoss = new MiniBoss(this, this.tileMap, guardSpawn.gx, guardSpawn.gy, {
      hp: 340, attackDamage: 26, xpReward: 120, texture: 'enemy_miniboss',
      name: 'GUARDIÃO DA SINALIZAÇÃO', onDeath: onEnemyDeath
    });
    this.enemies.push(this.miniBoss);

    const bossSpawn = this.tileMap.marker('B');
    this.boss = new GhostTrainBoss(this, this.tileMap, bossSpawn.gx, bossSpawn.gy, {
      onDeath: onEnemyDeath
    });
    this.enemies.push(this.boss);

    // Poça de luz sob o confronto final — clima de "spotlight" dramático.
    const bossWorld = this.tileMap.gridToWorld(bossSpawn.gx, bossSpawn.gy);
    this.add.image(bossWorld.x, bossWorld.y, 'light_pool').setDepth(-999).setScale(2.1).setBlendMode(Phaser.BlendModes.ADD).setTint(0xcfd6e0);

    const npcSpawns = this.tileMap.allMarkers('N');
    this.npcs = FANTASMA_CAPTIVES
      .map((captive, i) => ({ captive, spot: npcSpawns[i] }))
      .filter(({ captive }) => !GameState.rescuedNpcs.has(captive.id))
      .map(({ captive, spot }, i) => new NPC(this, this.tileMap, spot.gx, spot.gy, {
        id: captive.id,
        name: captive.name,
        texture: 'npc_worker',
        lines: captive.dungeonLines,
        tint: i === 1 ? 0xd8c090 : undefined
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
        id: `fantasma_medkit_${i}`, kind: 'heal', amount: HEAL_AMOUNT,
        gx: spot.gx, gy: spot.gy, sprite, taken: false
      });
    });

    this._buildDetourConsole();
    this.guardianGateOpen = false;

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
    playMusic(this, 'music_fantasma');

    initHud(this, () => {
      this.game.events.emit('hud-init', { label: 'ESTAÇÃO FANTASMA', showEnemies: true, sceneKey: 'FantasmaScene' });
      this._emitStats();
      this.game.events.emit('enemies-remaining', this.enemies.length);
    });
  }

  // Console de Desvio da Sala de Controle — desvio livre (sem cadeado, sem
  // cartão): quem chegar já pode usar. Sabotagem opcional que desativa a
  // fase fantasma de O Trem Fantasma pro resto do confronto.
  _buildDetourConsole() {
    const spot = this.tileMap.marker('V');
    const world = this.tileMap.gridToWorld(spot.gx, spot.gy);
    this.add.image(world.x, world.y, 'light_pool').setDepth(-999).setBlendMode(Phaser.BlendModes.ADD).setTint(0xc9a06a);
    const sprite = this.add.image(world.x, world.y, 'prop_console').setDepth(9000).setTint(0xc9a06a);
    const label = this.add.text(world.x, world.y - 20, 'DESVIO: ATIVO', {
      fontFamily: 'Courier New', fontSize: '8px', color: '#c9a06a'
    }).setOrigin(0.5).setDepth(9001);
    this.detourConsole = { gx: spot.gx, gy: spot.gy, sprite, label, disabled: false };
  }

  _checkDetourConsole() {
    const console_ = this.detourConsole;
    if (console_.disabled) return;
    const dist = Math.hypot(this.player.gx - console_.gx, this.player.gy - console_.gy);
    if (dist < 0.9) {
      console_.disabled = true;
      console_.sprite.setTint(0x5c6690);
      console_.label.setText('DESVIO: DESATIVADO').setColor('#9fb0d0');
      this.boss.disablePhasing();
      this.boss.recallToArena();
      playSfx(this, 'sfx_pickup');
      this.game.events.emit('item-pickup', 'A fase fantasma de O Trem Fantasma foi desativada — ele foi recolhido de volta à Câmara dos Trilhos!');
    }
  }

  // Derrotar o Guardião da Sinalização é o que abre o Portão dos Trilhos —
  // resolver a Sala de Sinalização É a condição, sem puzzle nem cartão.
  _checkGuardianGate() {
    if (this.guardianGateOpen) return;
    if (this.miniBoss.alive) return;
    this.guardianGateOpen = true;
    this.tileMap.setWalkable(this.bossDoorPos.gx, this.bossDoorPos.gy, true);
    this.bossDoorSprite.setTint(0xc9a06a);
    this.bossDoorLabel.setText('ABERTA');
    playSfx(this, 'sfx_pickup');
    this.game.events.emit('item-pickup', 'O Guardião da Sinalização caiu — o Portão dos Trilhos está livre!');
  }

  _checkBossDoor() {
    if (this.guardianGateOpen || this.bossDoorWarned) return;
    const dist = Math.hypot(this.player.gx - this.bossDoorPos.gx, this.player.gy - this.bossDoorPos.gy);
    if (dist < 1.2) {
      this.bossDoorWarned = true;
      this.game.events.emit('dialogue', 'Acesso bloqueado. O Guardião da Sinalização ainda controla essa passagem.');
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
    this._checkDetourConsole();
    this._checkGuardianGate();
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
      GameState.fantasmaCleared = true;
      for (const captive of FANTASMA_CAPTIVES) rescueNpc(captive.id);
      this._spawnReturnDoor();
    }
  }

  // Porta que aparece na câmara final após a vitória, levando de volta ao
  // Submundo.
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
