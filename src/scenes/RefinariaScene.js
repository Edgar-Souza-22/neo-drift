import Phaser from 'phaser';
import TileMap from '../world/TileMap.js';
import { buildRefinariaYard } from '../world/RefinariaLayout.js';
import Player from '../entities/Player.js';
import Enemy from '../entities/Enemy.js';
import PusherEnemy from '../entities/PusherEnemy.js';
import GuincheiroBoss from '../entities/GuincheiroBoss.js';
import PerfuratrizBoss from '../entities/PerfuratrizBoss.js';
import NPC from '../entities/NPC.js';
import { DIRECTIONS } from '../utils/constants.js';
import { GameState, equipWeapon, equipArmor, rescueNpc, upgradePistol, addAmmo, addStim, addEmpCharge, saveGame } from '../state/GameState.js';
import { REFINARIA_CAPTIVES } from '../state/RefinariaCaptives.js';
import { initHud } from '../utils/hud.js';
import { playMusic, playSfx } from '../audio/AudioManager.js';

// Botas de Impulso: só a primeira fase de cada região entrega — a Refinaria
// é a 2ª fase do Estaleiro, então não tem item de bota aqui (ver nota em
// TerminalScene.js / README).
const ITEMS = [
  { id: 'refinaria_weapon', markerKey: 'I', texture: 'item_sword', name: 'Lâmina de Refinaria', kind: 'weapon', value: 350, tint: 0x2f6fa8 },
  { id: 'refinaria_pistol', markerKey: 'C', texture: 'item_pistol', name: 'Pistola Pneumática', kind: 'pistol', pistolDamage: 133, ammoBonus: 6, tint: 0x2f6fa8 },
  { id: 'refinaria_armor', markerKey: 'A', texture: 'item_armor', name: 'Colete de Refinaria', kind: 'armor', value: 235, tint: 0x2f6fa8 }
];

const HEAL_AMOUNT = 70;
const AMMO_CHANCE_NORMAL = 0.1;
const AMMO_CHANCE_PUSHER = 0.18;
const BOSS_TRIPLE_AMMO_CHANCE = 1 / 3;
const STIM_DROP_CHANCE = 0.03;
const EMP_DROP_CHANCE = 0.025;

// Queda na água: dano único + o jogador reaparece no último tile firme em
// que pisou, FALL_RESPAWN_MS depois — nunca trava a passagem (distinto do
// piso tóxico/elétrico, que causa dano contínuo em vez de reposicionar).
const FALL_DAMAGE = 24;
const FALL_RESPAWN_MS = 2000;

// Ponte que desmorona: a cada intervalo aleatório, um trecho sólido perto do
// jogador racha (telégrafo), vira água por um tempo curto, e volta sozinho —
// nunca fica preso desmoronado (ver TerminalScene._updateCraneHazard, mesmo
// espírito, invertido: aqui uma célula SÓLIDA vira água, não o contrário).
const BRIDGE_TELEGRAPH_MS = 700;
const BRIDGE_GAP_MS = 2200;
const BRIDGE_CHECK_MIN = 2600;
const BRIDGE_CHECK_MAX = 3800;
const BRIDGE_PICK_RADIUS = 11;

const ACCENT = 0x2f6fa8;

// Reaproveita a arte de barril/cano/caixote/console/rack/lanterna/contêiner
// já existente (tintado por peça, sem gerar textura nova) — uma leitura
// industrial bem mais densa e variada que a do Terminal, com pelo menos um
// trio de props por plataforma (as 8 do anel + o Núcleo).
const PROPS = [
  // Cais de Chegada
  { gx: 4, gy: 9, texture: 'prop_pipe', tint: 0x2f6fa8 },
  { gx: 10, gy: 4, texture: 'prop_lantern', tint: 0xe8b93d },
  { gx: 3, gy: 5, texture: 'prop_rack', tint: 0x2f6fa8 },
  // Plataforma de Bombeamento
  { gx: 19, gy: 9, texture: 'prop_barrel', tint: 0xd8a13a },
  { gx: 26, gy: 8, texture: 'prop_barrel', tint: 0x6a4ab0 },
  { gx: 24, gy: 2, texture: 'prop_pipe', tint: 0x2f6fa8 },
  { gx: 20, gy: 2, texture: 'prop_console', tint: 0x2f6fa8 },
  // Torre de Resfriamento
  { gx: 38, gy: 8, texture: 'prop_barrel', tint: 0xc23b3b },
  { gx: 40, gy: 3, texture: 'prop_container', tint: 0x5a9a4a },
  { gx: 36, gy: 9, texture: 'prop_rack', tint: 0x2f6fa8 },
  // Convés de Armazenamento
  { gx: 35, gy: 20, texture: 'prop_crate', tint: 0xc23b3b },
  { gx: 42, gy: 19, texture: 'prop_barrel', tint: 0x5a9a4a },
  { gx: 41, gy: 22, texture: 'prop_container', tint: 0xd8a13a },
  { gx: 36, gy: 26, texture: 'prop_container', tint: 0x6a4ab0 },
  // Casa de Máquinas
  { gx: 41, gy: 42, texture: 'prop_pipe', tint: 0x2f6fa8 },
  { gx: 35, gy: 41, texture: 'prop_barrel', tint: 0xd8a13a },
  { gx: 37, gy: 36, texture: 'prop_rack', tint: 0x2f6fa8 },
  { gx: 42, gy: 37, texture: 'prop_console', tint: 0x2f6fa8 },
  // Console Estabilizador
  { gx: 19, gy: 42, texture: 'prop_crate', tint: 0xc23b3b },
  { gx: 25, gy: 42, texture: 'prop_console', tint: 0x2f6fa8 },
  { gx: 20, gy: 37, texture: 'prop_lantern', tint: 0xe8b93d },
  // Pátio de Tanques
  { gx: 4, gy: 36, texture: 'prop_barrel', tint: 0x6a4ab0 },
  { gx: 9, gy: 36, texture: 'prop_barrel', tint: 0xd8a13a },
  { gx: 6, gy: 42, texture: 'prop_barrel', tint: 0x5a9a4a },
  { gx: 3, gy: 39, texture: 'prop_barrel', tint: 0xc23b3b },
  { gx: 10, gy: 40, texture: 'prop_container', tint: 0x5a9a4a },
  // Doca de Reparo
  { gx: 3, gy: 20, texture: 'prop_crate', tint: 0xc23b3b },
  { gx: 10, gy: 26, texture: 'prop_pipe', tint: 0x2f6fa8 },
  { gx: 3, gy: 27, texture: 'prop_rack', tint: 0x2f6fa8 },
  { gx: 8, gy: 19, texture: 'prop_console', tint: 0x2f6fa8 },
  // Plataforma do Núcleo (cantos livres — as torres de resfriamento já
  // ocupam (19,19) e (26,26), ver SMOKESTACKS)
  { gx: 26, gy: 19, texture: 'prop_lantern', tint: 0x2f6fa8 },
  { gx: 19, gy: 26, texture: 'prop_lantern', tint: 0x2f6fa8 },
  { gx: 24, gy: 25, texture: 'prop_pipe', tint: 0x2f6fa8 }
];

// Manchas de óleo — decal de piso, sem colisão, uma ou duas por plataforma.
const OIL_STAINS = [
  { gx: 9, gy: 3 }, { gx: 22, gy: 9 }, { gx: 38, gy: 8 },
  { gx: 37, gy: 39 }, { gx: 40, gy: 38 }, { gx: 26, gy: 36 }, { gx: 8, gy: 39 },
  { gx: 5, gy: 25 }, { gx: 22, gy: 26 }, { gx: 20, gy: 24 }
];

// Torres de resfriamento pequenas — soltam fumaça em loop (ver
// _spawnSmokePuff). Uma leitura industrial "viva", distinta da fábrica
// parada das fases anteriores.
const SMOKESTACKS = [
  { gx: 35, gy: 3 }, { gx: 42, gy: 9 },
  { gx: 36, gy: 35 }, { gx: 8, gy: 38 },
  { gx: 19, gy: 19 }, { gx: 26, gy: 26 }
];

export default class RefinariaScene extends Phaser.Scene {
  constructor() {
    super('RefinariaScene');
  }

  create() {
    const { grid, markers, zones, bridges, hazardTiles } = buildRefinariaYard();
    this.zones = zones;
    this.currentZone = null;
    // wallTexture nunca é desenhado de verdade — a Refinaria não tem célula
    // '#': água conta como piso normal pra colisão (dá pra andar/cair nela
    // de propósito, ver Player.canOccupy), então nenhuma plataforma precisa
    // de grade física — é o hazard, não parede, que separa deque de mar.
    this.tileMap = new TileMap(this, grid, {
      wallTexture: 'wall_estaleiro',
      floorTexture: 'floor_refinaria',
      floorVariants: [
        { key: 'floor_refinaria', weight: 0.78 },
        { key: 'floor_refinaria_stripe', weight: 0.22 }
      ],
      markers,
      hazardTiles
    });

    for (const prop of PROPS) {
      const world = this.tileMap.gridToWorld(prop.gx, prop.gy);
      const tex = this.textures.exists(prop.texture) ? prop.texture : 'prop_crate';
      this.add.image(world.x, world.y, tex).setOrigin(0.5, 0.85).setDepth(prop.gy * 10 + 2).setTint(prop.tint);
    }

    for (const stain of OIL_STAINS) {
      const world = this.tileMap.gridToWorld(stain.gx, stain.gy);
      this.add.image(world.x, world.y, 'prop_oilstain').setDepth(-4000).setAlpha(0.85);
    }

    this.smokestacks = SMOKESTACKS.map((s) => {
      const world = this.tileMap.gridToWorld(s.gx, s.gy);
      this.add.image(world.x, world.y, 'prop_smokestack').setOrigin(0.5, 0.9).setDepth(s.gy * 10 + 2);
      return { x: world.x, y: world.y - 24 };
    });
    this.nextSmokeAt = this.time.now + 400;

    const spawn = this.tileMap.marker('S');
    this.player = new Player(this, this.tileMap, spawn);
    this.lastSafeGx = spawn.gx;
    this.lastSafeGy = spawn.gy;
    this.playerFalling = false;

    const onEnemyDeath = (enemy) => this._handleEnemyDrop(enemy);

    this.enemies = [
      ...this.tileMap.allMarkers('X').map((m) => new Enemy(this, this.tileMap, m.gx, m.gy, {
        texture: 'enemy_refinaria', hp: 78, speed: 1.65, attackDamage: 20, xpReward: 36,
        ammoDropChance: AMMO_CHANCE_NORMAL, onDeath: onEnemyDeath
      })),
      // Operários de Convés — inimigos grandes que empurram (ver PusherEnemy).
      ...this.tileMap.allMarkers('PU').map((m) => new PusherEnemy(this, this.tileMap, m.gx, m.gy, {
        hp: 270, attackDamage: 26, xpReward: 95,
        ammoDropChance: AMMO_CHANCE_PUSHER, onDeath: onEnemyDeath
      }))
    ];

    const subSpawn = this.tileMap.marker('M');
    this.subChefe = new GuincheiroBoss(this, this.tileMap, subSpawn.gx, subSpawn.gy, { onDeath: onEnemyDeath });
    this.enemies.push(this.subChefe);

    const bossSpawn = this.tileMap.marker('B');
    this.boss = new PerfuratrizBoss(this, this.tileMap, bossSpawn.gx, bossSpawn.gy, { onDeath: onEnemyDeath });
    this.enemies.push(this.boss);

    const bossWorld = this.tileMap.gridToWorld(bossSpawn.gx, bossSpawn.gy);
    this.add.image(bossWorld.x, bossWorld.y, 'light_pool').setDepth(-999).setScale(2.1).setBlendMode(Phaser.BlendModes.ADD).setTint(ACCENT);

    const npcSpawns = this.tileMap.allMarkers('N');
    this.npcs = REFINARIA_CAPTIVES
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
        id: `refinaria_medkit_${i}`, kind: 'heal', amount: HEAL_AMOUNT,
        gx: spot.gx, gy: spot.gy, sprite, taken: false
      });
    });

    this._buildBridges(bridges);

    this.levelEnded = false;
    this.transitioning = false;
    this.returnDoorPos = null;
    this._lastRemaining = null;
    this.nextBridgeCheckAt = this.time.now + 1600;
    this.bridgeHintShown = false;
    this.pusherHintShown = false;
    this.guincheiroHintShown = false;

    this._setupCamera();
    this._setupInput();
    this.cameras.main.fadeIn(350, 18, 22, 28);
    playMusic(this, 'music_refinaria');

    initHud(this, () => {
      this.game.events.emit('hud-init', { label: 'REFINARIA OFFSHORE', showEnemies: true, sceneKey: 'RefinariaScene' });
      this._emitStats();
      this.game.events.emit('enemies-remaining', this.enemies.length);
    });
  }

  // --- Pontes -----------------------------------------------------------
  // Pontes do anel (bridge.final === false) nascem SÓLIDAS — prancha normal
  // por cima de água já desenhada, hazard desligado (setHazard null) — e
  // desmoronam sozinhas de vez em quando (ver _updateBridgeHazard).
  //
  // A ponte do Núcleo (bridge.final === true, única — ver RefinariaLayout)
  // nasce o OPOSTO: INCOMPLETA. Sem prancha de verdade, só um contorno
  // fantasma de andaime (baixa opacidade, cinza, pulsando) por cima da
  // água — intransponível, hazard 'water' ligado o tempo todo — até O
  // Guincheiro cair e a cena "construir" a ponte de vez
  // (_completeGateBridge). Nunca entra no sorteio de desmoronamento: é
  // binária (não existe / existe pra sempre), não frágil.
  _buildBridges(bridgeDefs) {
    this.bridgeCellSet = new Set();
    this.bridges = bridgeDefs.map((b) => ({
      id: b.id,
      final: b.final,
      stabilized: false,
      cells: b.cells.map((c) => {
        const world = this.tileMap.gridToWorld(c.gx, c.gy);
        const sprite = this.add.image(world.x, world.y, 'floor_bridge').setDepth(c.gy * 10 + 1);
        this.bridgeCellSet.add(`${c.gx},${c.gy}`);
        if (b.final) {
          sprite.setAlpha(0.22).setTint(0x555a60);
          this.tweens.add({
            targets: sprite, alpha: 0.4, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut'
          });
          return { gx: c.gx, gy: c.gy, sprite, solid: false, collapseUntil: 0 };
        }
        this.tileMap.setHazard(c.gx, c.gy, null);
        return { gx: c.gx, gy: c.gy, sprite, solid: true, collapseUntil: 0 };
      })
    }));
  }

  _allBridgeCells() {
    const list = [];
    for (const bridge of this.bridges) {
      for (const cell of bridge.cells) list.push({ bridge, cell });
    }
    return list;
  }

  // Só o anel entra no sorteio — a ponte do Núcleo é binária (ver acima),
  // nunca desmorona nem é escolhida aqui.
  _pickCollapseCandidate() {
    const px = this.player.gx;
    const py = this.player.gy;
    const candidates = this._allBridgeCells().filter(({ bridge, cell }) =>
      !bridge.final
      && cell.solid
      && Math.hypot(cell.gx - px, cell.gy - py) <= BRIDGE_PICK_RADIUS
    );
    if (!candidates.length) return null;
    return candidates[Phaser.Math.Between(0, candidates.length - 1)].cell;
  }

  _updateBridgeHazard() {
    if (this.time.now < this.nextBridgeCheckAt) return;
    this.nextBridgeCheckAt = this.time.now + Phaser.Math.Between(BRIDGE_CHECK_MIN, BRIDGE_CHECK_MAX);
    const cell = this._pickCollapseCandidate();
    if (cell) this._collapseBridgeCell(cell);
  }

  _collapseBridgeCell(cell) {
    cell.solid = false;
    playSfx(this, 'sfx_enrage', { volume: 0.2 });
    this.tweens.add({
      targets: cell.sprite, alpha: 0.25, angle: Phaser.Math.Between(-6, 6),
      duration: BRIDGE_TELEGRAPH_MS, ease: 'Cubic.In'
    });
    this.time.delayedCall(BRIDGE_TELEGRAPH_MS, () => {
      if (!cell.sprite || cell.solid) return;
      cell.sprite.setVisible(false);
      this.tileMap.setHazard(cell.gx, cell.gy, 'water');
      cell.collapseUntil = this.time.now + BRIDGE_GAP_MS;
    });
  }

  _restoreBridgeCell(cell) {
    cell.solid = true;
    cell.collapseUntil = 0;
    this.tileMap.setHazard(cell.gx, cell.gy, null);
    if (cell.sprite) {
      cell.sprite.setVisible(true);
      cell.sprite.setAlpha(0);
      cell.sprite.setAngle(0);
      this.tweens.add({ targets: cell.sprite, alpha: 1, duration: 220 });
    }
  }

  _updateBridgeRestores() {
    const now = this.time.now;
    for (const { cell } of this._allBridgeCells()) {
      if (!cell.solid && cell.collapseUntil && now >= cell.collapseUntil) {
        this._restoreBridgeCell(cell);
      }
    }
  }

  // Chamado quando O Guincheiro cai — a ÚNICA ponte até o Núcleo, incompleta
  // até agora, é construída de vez: cada célula troca o contorno-fantasma
  // por uma prancha sólida de verdade, num efeito escalonado (célula mais
  // próxima do Console Estabilizador constrói primeiro), e fica travada
  // sólida pro resto da fase — nunca entra no sorteio de desmoronamento
  // (ver _pickCollapseCandidate). O anel externo continua arriscado.
  _completeGateBridge() {
    const bridge = this.bridges.find((b) => b.final);
    if (!bridge) return;
    bridge.stabilized = true;

    const origin = bridge.cells[0];
    const ordered = [...bridge.cells].sort((a, b) =>
      Math.hypot(a.gx - origin.gx, a.gy - origin.gy) - Math.hypot(b.gx - origin.gx, b.gy - origin.gy)
    );
    ordered.forEach((cell, i) => {
      this.time.delayedCall(i * 60, () => {
        cell.solid = true;
        this.tileMap.setHazard(cell.gx, cell.gy, null);
        this.tweens.killTweensOf(cell.sprite);
        cell.sprite.clearTint();
        this.tweens.add({ targets: cell.sprite, alpha: 1, duration: 180, ease: 'Cubic.Out' });
        const world = this.tileMap.gridToWorld(cell.gx, cell.gy);
        const flash = this.add.image(world.x, world.y, 'light_pool')
          .setTint(0xffffff).setBlendMode(Phaser.BlendModes.ADD).setDepth(9002).setScale(0.8).setAlpha(0.8);
        this.tweens.add({ targets: flash, alpha: 0, scale: 1.4, duration: 260, onComplete: () => flash.destroy() });
      });
    });
    this.cameras.main.shake(200, 0.005);
    playSfx(this, 'sfx_pickup', { volume: 0.5 });
    this.game.events.emit('item-pickup', 'A ponte do Núcleo foi construída — o caminho até A Perfuratriz está aberto.');
  }

  _stabilizeAllBridges() {
    for (const { cell } of this._allBridgeCells()) {
      if (!cell.solid) this._restoreBridgeCell(cell);
    }
  }

  // --- Queda na água --------------------------------------------------
  // Só conta como "seguro" o piso de verdade de uma plataforma — nunca uma
  // célula de ponte (mesmo sólida). Assim, cair em qualquer ponto de uma
  // travessia sempre devolve o jogador pro primeiro tile antes da ponte
  // (onde ele pisou por último antes de entrar nela), não pro meio do
  // caminho nem pro exato lugar onde caiu.
  _updateLastSafeTile() {
    if (this.playerFalling) return;
    const gx = Math.round(this.player.gx);
    const gy = Math.round(this.player.gy);
    if (!this.tileMap.isWater(gx, gy) && !this.bridgeCellSet.has(`${gx},${gy}`)) {
      this.lastSafeGx = gx;
      this.lastSafeGy = gy;
    }
  }

  _updateFall() {
    if (this.playerFalling || !this.player.alive) return;
    const gx = Math.round(this.player.gx);
    const gy = Math.round(this.player.gy);
    if (this.tileMap.isWater(gx, gy)) this._startFall();
  }

  _startFall() {
    this.playerFalling = true;
    this.player.isMoving = false;
    this.player.takeDamage(FALL_DAMAGE);
    playSfx(this, 'sfx_player_hurt', { volume: 0.5 });
    this.cameras.main.shake(180, 0.006);
    this.tweens.add({
      targets: this.player.sprite, scale: 0.35, alpha: 0.2, angle: 70,
      duration: 480, ease: 'Cubic.In'
    });
    this.time.delayedCall(FALL_RESPAWN_MS, () => this._resolveFall());
  }

  _resolveFall() {
    this.player.gx = this.lastSafeGx;
    this.player.gy = this.lastSafeGy;
    const sprite = this.player.sprite;
    sprite.setScale(1);
    sprite.setAlpha(1);
    sprite.setAngle(0);
    this.playerFalling = false;
  }

  // --- Torres de resfriamento: fumaça em loop ------------------------
  _spawnSmokePuff(x, y) {
    const puff = this.add.image(x + Phaser.Math.Between(-2, 2), y, 'particle')
      .setTint(0x8a8a90).setAlpha(0.55).setScale(0.6).setDepth(9500);
    this.tweens.add({
      targets: puff, y: y - 34, x: puff.x + Phaser.Math.Between(-6, 6),
      alpha: 0, scale: 1.6, duration: 1600, ease: 'Sine.Out',
      onComplete: () => puff.destroy()
    });
  }

  _updateSmoke() {
    if (this.time.now < this.nextSmokeAt) return;
    this.nextSmokeAt = this.time.now + Phaser.Math.Between(500, 900);
    for (const stack of this.smokestacks) this._spawnSmokePuff(stack.x, stack.y);
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
    if (this.levelEnded || !this.player.alive || this.playerFalling) return;
    if (this.player.tryUseStim()) this._emitStats();
  }

  _onEmp() {
    if (this.levelEnded || !this.player.alive || this.playerFalling) return;
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
    if (this.levelEnded || !this.player.alive || this.playerFalling) return;
    const npc = this._nearestNpc();
    if (npc) {
      this.game.events.emit('dialogue', npc.currentLine());
      return;
    }
    this.player.tryAttack(this.enemies);
    this._emitStats();
  }

  _onFire() {
    if (this.levelEnded || !this.player.alive || this.playerFalling) return;
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

    if (enemy === this.subChefe) this._completeGateBridge();

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
      if (name === 'Plataforma de Bombeamento' && !this.bridgeHintShown) {
        this.bridgeHintShown = true;
        this.game.events.emit(
          'dialogue',
          'As pontes daqui racham sozinhas de vez em quando. Se cair na água, você reaparece no último trecho firme em 2 segundos — machuca, mas não é sem volta.'
        );
      }
      if (name === 'Casa de Máquinas' && !this.pusherHintShown) {
        this.pusherHintShown = true;
        this.game.events.emit(
          'dialogue',
          'Os Operários de Convés empurram forte de perto. Longe da borda é só dano — perto d\'água, cuidado.'
        );
      }
      if (name === 'Console Estabilizador' && !this.guincheiroHintShown && this.subChefe.alive) {
        this.guincheiroHintShown = true;
        this.game.events.emit('dialogue', 'A ponte até o Núcleo está incompleta — é o único acesso. Derrote O Guincheiro pra ela ser construída.');
      }
    }
  }

  update(time, delta) {
    if (this.transitioning) return;
    const deltaSec = Math.min(delta, 50) / 1000;

    if (this.player.alive && !this.playerFalling) {
      const { dx, dy } = this._readMoveVector();
      this.player.move(dx, dy, deltaSec);
    }
    this.player.update();
    this._checkItemPickups();
    this._updateLastSafeTile();
    this._updateFall();
    this._updateSmoke();

    if (this.levelEnded) {
      if (this.returnDoorPos) this._checkReturnDoor();
      return;
    }

    this._updateBridgeHazard();
    this._updateBridgeRestores();
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
    this._stabilizeAllBridges();
    this.game.events.emit(victory ? 'level-complete' : 'game-over');
    if (victory) {
      GameState.refinariaCleared = true;
      for (const captive of REFINARIA_CAPTIVES) rescueNpc(captive.id);
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
      fontFamily: 'Courier New', fontSize: '8px', color: '#2f6fa8'
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
    this.cameras.main.flash(150, 47, 111, 168);
    this.cameras.main.fadeOut(420, 18, 22, 28);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.stop('UIScene');
      this.scene.start('EstaleiroScene');
    });
  }
}
