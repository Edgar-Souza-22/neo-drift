import Phaser from 'phaser';
import TileMap from '../world/TileMap.js';
import { buildPesquisaLabs } from '../world/PesquisaLayout.js';
import Player from '../entities/Player.js';
import UnstablePrototype from '../entities/UnstablePrototype.js';
import ShieldGuard from '../entities/ShieldGuard.js';
import ShooterDrone from '../entities/ShooterDrone.js';
import ElectricDrone from '../entities/ElectricDrone.js';
import JammerDrone from '../entities/JammerDrone.js';
import PhaseJumper from '../entities/PhaseJumper.js';
import ArquivistaBoss from '../entities/ArquivistaBoss.js';
import ProjetistaBoss from '../entities/ProjetistaBoss.js';
import NPC from '../entities/NPC.js';
import { DIRECTIONS } from '../utils/constants.js';
import {
  GameState, equipWeapon, equipArmor, rescueNpc, upgradePistol,
  addAmmo, addStim, addEmpCharge, addInventoryItem, saveGame
} from '../state/GameState.js';
import { PESQUISA_CAPTIVES } from '../state/PesquisaCaptives.js';
import { initHud } from '../utils/hud.js';
import { playMusic, playSfx } from '../audio/AudioManager.js';

const ACCENT = 0xb37aff;

const ITEMS = [
  { id: 'pesquisa_weapon', markerKey: 'I', texture: 'item_sword', name: 'Lâmina de Bancada', kind: 'weapon', value: 430, tint: ACCENT },
  { id: 'pesquisa_pistol', markerKey: 'C', texture: 'item_pistol', name: 'Pistola de Ensaio', kind: 'pistol', pistolDamage: 161, ammoBonus: 6, tint: ACCENT },
  { id: 'pesquisa_armor', markerKey: 'A', texture: 'item_armor', name: 'Colete de Laboratório', kind: 'armor', value: 295, tint: ACCENT }
];

const HEAL_AMOUNT = 90;
const AMMO_CHANCE_NORMAL = 0.11;
const BOSS_TRIPLE_AMMO_CHANCE = 1 / 3;
const STIM_DROP_CHANCE = 0.03;
const EMP_DROP_CHANCE = 0.025;

const ELITE_TINT = 0xffd24a;
const ELITE_SCALE = 1.2;
const ELITE_HP_MUL = 1.6;
const ELITE_DMG_MUL = 1.4;
const ELITE_XP_MUL = 1.6;

// Zoom de jogo. Fica numa constante porque a reconfiguração abre a câmera e
// precisa saber pra onde voltar — dois literais separados sairiam de
// sincronia no dia em que o zoom da fase mudar.
const GAMEPLAY_ZOOM = 1.15;
const RECONFIG_ZOOM = 0.6;

const CONSOLE_RANGE = 1.2;
const CONSOLE_COOLDOWN_MS = 450;
const DOSSIER_RANGE = 1.0;

// O que sai de dentro de cada Protótipo Instável quando o casco cai. São
// arquétipos de fases anteriores de propósito: a piada da sala é que este é
// o lugar onde eles foram desenhados, então encontrá-los "meio prontos" aqui
// é o fecho da brincadeira.
const SECOND_FORMS = [
  { cls: ShooterDrone, stats: { hp: 70, attackDamage: 20, xpReward: 30 } },
  { cls: ElectricDrone, stats: { hp: 68, attackDamage: 21, xpReward: 30 } },
  { cls: PhaseJumper, stats: { hp: 72, attackDamage: 22, xpReward: 34 } },
  { cls: JammerDrone, stats: { hp: 64, attackDamage: 17, xpReward: 28 } }
];

export default class PesquisaScene extends Phaser.Scene {
  constructor() {
    super('PesquisaScene');
  }

  create() {
    const build = buildPesquisaLabs();
    const { grid, markers, zones, rooms, partitions, configs, dossiers, props } = build;
    this.rooms = rooms;
    this.zones = zones;
    this.configs = configs;
    this.currentZone = null;

    this.tileMap = new TileMap(this, grid, {
      wallTexture: 'wall_pd',
      floorTexture: 'floor_pd',
      floorVariants: [
        { key: 'floor_pd', weight: 0.88 },
        { key: 'floor_pd_grid', weight: 0.12 }
      ],
      markers
    });

    // Itens-chave da fase são reconstruídos do zero a cada tentativa (os
    // inimigos e o sub-confronto também respawnam) — senão a Planta C ficaria
    // liberada com O Arquivista vivo de novo.
    GameState.inventory = GameState.inventory.filter(
      (i) => i.id !== 'pesquisa_auth' && i.id !== 'pesquisa_seal'
    );
    saveGame();

    // Planta inicial: A. B e C entram com a Chave de Autorização e o Selo de
    // Contenção. Definido ANTES do console porque o rótulo dele já mostra
    // quais plantas estão autorizadas.
    this.unlocked = new Set(['A']);
    this.configIndex = 0;

    this._buildProps(props);
    this._buildPartitions(partitions);
    this._buildConsole();
    this._buildDossiers(dossiers);

    const spawn = this.tileMap.marker('S');
    this.player = new Player(this, this.tileMap, spawn);

    const onEnemyDeath = (enemy) => this._handleEnemyDrop(enemy);
    this.enemies = [];

    let protoIndex = 0;
    const spawnRoomEnemies = (markerKey, EnemyClass, base, extra = null) => {
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
        const opts = { ...stats, onDeath: onEnemyDeath, ...(extra ? extra() : {}) };
        this.enemies.push(new EnemyClass(this, this.tileMap, m.gx, m.gy, opts));
      });
    };

    spawnRoomEnemies('PROTO', UnstablePrototype, { hp: 130, speed: 1.2, attackDamage: 26, xpReward: 58 }, () => {
      const form = SECOND_FORMS[protoIndex++ % SECOND_FORMS.length];
      return { secondForm: form.cls, secondFormStats: form.stats };
    });
    spawnRoomEnemies('GUARD', ShieldGuard, { hp: 160, speed: 1.25, attackDamage: 32, xpReward: 70 });
    spawnRoomEnemies('SHOOTER', ShooterDrone, { hp: 95, attackDamage: 22, xpReward: 44 });
    spawnRoomEnemies('ELECTRIC', ElectricDrone, { hp: 92, attackDamage: 23, xpReward: 42 });
    spawnRoomEnemies('JAMMER', JammerDrone, { hp: 86, attackDamage: 19, xpReward: 40 });
    spawnRoomEnemies('JUMPER', PhaseJumper, { hp: 90, attackDamage: 24, xpReward: 46 });

    const arquivistaSpawn = this.tileMap.marker('M1');
    this.arquivista = new ArquivistaBoss(this, this.tileMap, arquivistaSpawn.gx, arquivistaSpawn.gy, { onDeath: onEnemyDeath });
    this.enemies.push(this.arquivista);

    const bossSpawn = this.tileMap.marker('B');
    this.boss = new ProjetistaBoss(this, this.tileMap, bossSpawn.gx, bossSpawn.gy, { onDeath: onEnemyDeath });
    this.enemies.push(this.boss);

    const bossWorld = this.tileMap.gridToWorld(bossSpawn.gx, bossSpawn.gy);
    this.add.image(bossWorld.x, bossWorld.y, 'light_pool').setDepth(-999).setScale(2.2)
      .setBlendMode(Phaser.BlendModes.ADD).setTint(ACCENT).setAlpha(0.75);

    const npcSpawns = this.tileMap.allMarkers('N');
    this.npcs = PESQUISA_CAPTIVES
      .map((captive, i) => ({ captive, spot: npcSpawns[i] }))
      .filter(({ captive, spot }) => spot && !GameState.rescuedNpcs.has(captive.id))
      .map(({ captive, spot }) => new NPC(this, this.tileMap, spot.gx, spot.gy, {
        id: captive.id, name: captive.name, texture: 'npc_engineer', tint: ACCENT, lines: captive.dungeonLines
      }));

    this._buildItems();

    this.levelEnded = false;
    this.transitioning = false;
    this.returnDoorPos = null;
    this._lastRemaining = null;
    this.hintsShown = {};
    this.sealGranted = false;

    this._applyConfig(0, { silent: true });

    this._setupCamera();
    this._setupInput();
    this.cameras.main.fadeIn(350, 16, 18, 26);
    playMusic(this, 'music_pd');

    initHud(this, () => {
      this.game.events.emit('hud-init', { label: 'DEPARTAMENTO DE P&D', showEnemies: true, sceneKey: 'PesquisaScene' });
      this._emitStats();
      this.game.events.emit('enemies-remaining', this.enemies.length);
    });
  }

  _buildProps(propDefs) {
    for (const prop of propDefs) {
      const world = this.tileMap.gridToWorld(prop.gx, prop.gy);
      const tex = this.textures.exists(prop.texture) ? prop.texture : 'prop_crate';
      const sprite = this.add.image(world.x, world.y, tex).setOrigin(0.5, 0.85).setDepth(prop.gy * 10 + 2);
      if (prop.tint) sprite.setTint(prop.tint);
    }
  }

  _buildItems() {
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

    // Chave de Autorização — item-chave, não equipamento: é o que libera a
    // Planta B no console. Sempre presente (não persiste entre tentativas).
    const keySpot = this.tileMap.marker('KEY');
    const keyWorld = this.tileMap.gridToWorld(keySpot.gx, keySpot.gy);
    this.add.image(keyWorld.x, keyWorld.y, 'light_pool').setDepth(-999).setBlendMode(Phaser.BlendModes.ADD).setTint(0x9fffc8);
    const keySprite = this.add.image(keyWorld.x, keyWorld.y, 'item_keycard').setDepth(9000).setTint(0x9fffc8);
    this.tweens.add({ targets: keySprite, y: keySprite.y - 5, duration: 700, yoyo: true, repeat: -1 });
    this.items.push({
      id: 'pesquisa_auth', kind: 'auth', name: 'Chave de Autorização',
      gx: keySpot.gx, gy: keySpot.gy, sprite: keySprite, taken: false
    });

    this.tileMap.allMarkers('H').forEach((spot, i) => {
      const world = this.tileMap.gridToWorld(spot.gx, spot.gy);
      this.add.image(world.x, world.y, 'light_pool').setDepth(-999).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffc878);
      const sprite = this.add.image(world.x, world.y, 'item_medkit').setDepth(9000);
      this.tweens.add({ targets: sprite, y: sprite.y - 5, duration: 700, yoyo: true, repeat: -1 });
      this.items.push({ id: `pesquisa_medkit_${i}`, kind: 'heal', amount: HEAL_AMOUNT, gx: spot.gx, gy: spot.gy, sprite, taken: false });
    });
  }

  // --- Paredes sobre trilhos ---------------------------------------------
  // Cada parede fechada diz QUAL PLANTA a abre. Sem isso ela é o único
  // portão do jogo sem etiqueta — todos os outros (cartões da Fase 16,
  // catracas da Fase 17) sempre anunciaram sua condição, e uma parede muda
  // no meio do corredor lê como bug, não como mecânica.
  _buildPartitions(partitionDefs) {
    this.partitions = partitionDefs.map((p) => {
      const sprites = p.cells.map((c) => {
        const world = this.tileMap.gridToWorld(c.gx, c.gy);
        const tex = this.textures.exists('prop_partition') ? 'prop_partition' : 'door_matriz';
        return this.add.image(world.x, world.y, tex).setDepth(9000).setTint(ACCENT);
      });

      const openedBy = this.configs.filter((c) => c.open.includes(p.id)).map((c) => c.id);
      const mid = p.cells[Math.floor(p.cells.length / 2)];
      const midWorld = this.tileMap.gridToWorld(mid.gx, mid.gy);
      const label = this.add.text(midWorld.x, midWorld.y - 20, `PLANTA ${openedBy.join('/')}`, {
        fontFamily: 'Courier New', fontSize: '8px', color: '#c9a8ff'
      }).setOrigin(0.5).setDepth(9001);

      return { ...p, sprites, label, openedBy, open: false };
    });
  }

  // Empurra pra fora qualquer inimigo que esteja em cima de uma célula que
  // acabou de virar parede. Sem isso o inimigo fica preso DENTRO do trilho:
  // `canOccupy` passa a recusar todas as direções, ele nunca mais se move, e
  // como a fase só acaba com o mapa limpo, um inimigo emparedado numa ala
  // fechada trava a fase inteira.
  _evictFromCell(gx, gy) {
    const ring = [
      [0, 1], [0, -1], [1, 0], [-1, 0],
      [1, 1], [1, -1], [-1, 1], [-1, -1],
      [0, 2], [0, -2], [2, 0], [-2, 0]
    ];
    const occupants = this.enemies.filter(
      (e) => e.alive && Math.round(e.gx) === gx && Math.round(e.gy) === gy
    );
    for (const enemy of occupants) {
      for (const [dx, dy] of ring) {
        if (enemy.canOccupy(gx + dx, gy + dy)) {
          enemy.gx = gx + dx;
          enemy.gy = gy + dy;
          break;
        }
      }
    }
  }

  // Salas alcançáveis a partir do console na planta ATUAL — usado pra dizer
  // ao jogador, em nome de sala, o que a troca acabou de abrir. Calculado em
  // vez de escrito à mão pra nunca sair de sincronia com o layout.
  _reachableRoomNames() {
    const start = this.consolePos;
    const seen = new Set([`${start.gx},${start.gy}`]);
    const stack = [[start.gx, start.gy]];
    const names = new Set();
    while (stack.length) {
      const [x, y] = stack.pop();
      const zone = this.zones.find((z) => x >= z.x1 && x < z.x2 && y >= z.y1 && y < z.y2);
      if (zone) names.add(zone.name);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        const key = `${nx},${ny}`;
        if (seen.has(key) || !this.tileMap.isWalkable(nx, ny)) continue;
        seen.add(key);
        stack.push([nx, ny]);
      }
    }
    return names;
  }

  _applyConfig(index, { silent = false } = {}) {
    const before = silent ? null : this._reachableRoomNames();
    this.configIndex = index;
    const config = this.configs[index];
    const openIds = new Set(config.open);

    for (const part of this.partitions) {
      const open = openIds.has(part.id);
      const changed = part.open !== open;
      part.open = open;
      if (!open) {
        for (const c of part.cells) this._evictFromCell(c.gx, c.gy);
      }
      for (const c of part.cells) this.tileMap.setWalkable(c.gx, c.gy, open);
      part.label.setVisible(!open);
      part.sprites.forEach((sprite) => {
        this.tweens.killTweensOf(sprite);
        this.tweens.add({
          targets: sprite,
          alpha: open ? 0.12 : 1,
          scaleY: open ? 0.2 : 1,
          duration: silent ? 0 : 260,
          ease: 'Cubic.Out'
        });
        // Verde no que abriu, vermelho no que fechou: com a câmera aberta
        // (abaixo), é isso que deixa a remontagem visível de relance em vez
        // de ser uma mudança silenciosa em algum corredor fora da tela.
        if (changed && !silent) {
          sprite.setTint(open ? 0x6dff9f : 0xff4a5e);
          this.time.delayedCall(700, () => sprite.setTint(ACCENT));
        }
      });
    }

    if (silent) return;

    playSfx(this, 'sfx_door');
    this.cameras.main.shake(240, 0.005);

    // A Bancada fica no meio do mapa e as paredes correm por ele inteiro —
    // no zoom de jogo, quase tudo que se mexe está fora da tela. A câmera
    // abre por um instante pra o jogador VER o prédio se remontar, em vez de
    // só ouvir e ler que algo mudou em outro lugar.
    // `zoomTo` é efeito de câmera, não tween: o nome de easing aqui é
    // 'Cubic.easeOut', e não o 'Cubic.Out' que os tweens aceitam — com o
    // nome errado o efeito lança a cada frame do zoom.
    if (this.zoomBackTimer) this.zoomBackTimer.remove();
    this.cameras.main.zoomTo(RECONFIG_ZOOM, 320, 'Cubic.easeOut');
    this.zoomBackTimer = this.time.delayedCall(1100, () => {
      this.cameras.main.zoomTo(GAMEPLAY_ZOOM, 320, 'Cubic.easeOut');
      this.zoomBackTimer = null;
    });

    const after = this._reachableRoomNames();
    const opened = [...after].filter((n) => !before.has(n));
    const closed = [...before].filter((n) => !after.has(n));
    this.game.events.emit('item-pickup', `${config.label} aplicada.`);
    const parts = [];
    if (opened.length) parts.push(`abre ${opened.join(', ')}`);
    if (closed.length) parts.push(`fecha ${closed.join(', ')}`);
    this.game.events.emit(
      'dialogue',
      parts.length ? `${config.label}: ${parts.join('; ')}.` : `${config.label}: ${config.blurb}`
    );
  }

  _buildConsole() {
    this.consolePos = this.tileMap.marker('CONSOLE');
    const world = this.tileMap.gridToWorld(this.consolePos.gx, this.consolePos.gy);
    this.add.image(world.x, world.y, 'light_pool').setDepth(-999).setScale(1.4)
      .setBlendMode(Phaser.BlendModes.ADD).setTint(ACCENT);
    this.consoleSprite = this.add.image(world.x, world.y, 'prop_console')
      .setOrigin(0.5, 0.85).setDepth(this.consolePos.gy * 10 + 3).setTint(ACCENT);
    this.consoleLabel = this.add.text(world.x, world.y - 54, '', {
      fontFamily: 'Courier New', fontSize: '9px', color: '#c9a8ff', align: 'center',
      stroke: '#0a0c14', strokeThickness: 3
    }).setOrigin(0.5).setDepth(9001);
    this.lastConsoleAt = -9999;
    this._refreshConsoleLabel();
  }

  // Leitura do console em nome de planta, não em símbolo: "[A · ·]" não diz
  // nada a quem chegou agora.
  _refreshConsoleLabel() {
    const active = this.configs[this.configIndex];
    const list = this.configs
      .map((c) => {
        if (!this.unlocked.has(c.id)) return `${c.id}: travada`;
        return `${c.id === active.id ? '▶' : ' '}${c.id}: ${c.name}`;
      })
      .join('\n');
    this.consoleLabel.setText(`BANCADA DE RECONFIGURAÇÃO\n${list}\nESPAÇO: trocar de planta`);
  }

  _nearConsole() {
    return Math.hypot(this.player.gx - this.consolePos.gx, this.player.gy - this.consolePos.gy) <= CONSOLE_RANGE;
  }

  // A planta SÓ muda aqui. É essa restrição que torna a mecânica segura: o
  // jogador está sempre na espinha (que nunca se move) quando as paredes
  // deslizam, então nenhuma parede fecha em cima dele nem o tranca numa ala.
  _tryReconfigure() {
    const now = this.time.now;
    if (now - this.lastConsoleAt < CONSOLE_COOLDOWN_MS) return;
    this.lastConsoleAt = now;

    if (this.unlocked.size < 2) {
      this.game.events.emit('dialogue', 'A Bancada só tem a Planta A autorizada. Alguma credencial mais alta destrava o resto.');
      return;
    }
    let next = this.configIndex;
    for (let i = 1; i <= this.configs.length; i++) {
      const candidate = (this.configIndex + i) % this.configs.length;
      if (this.unlocked.has(this.configs[candidate].id)) { next = candidate; break; }
    }
    if (next === this.configIndex) return;
    this._applyConfig(next);
    this._refreshConsoleLabel();
  }

  _unlockConfig(id, message) {
    if (this.unlocked.has(id)) return;
    this.unlocked.add(id);
    this._refreshConsoleLabel();
    playSfx(this, 'sfx_pickup');
    this.game.events.emit('item-pickup', message);
  }

  _updateSeal() {
    if (this.sealGranted || this.arquivista.alive) return;
    this.sealGranted = true;
    addInventoryItem({ id: 'pesquisa_seal', name: 'Selo de Contenção', icon: 'item_keycard' });
    this._unlockConfig('C', 'Selo de Contenção obtido — a Bancada aceita a Planta C.');
  }

  // --- Fichas de projeto --------------------------------------------------
  // Placas ao lado dos tanques nomeando inimigos das fases 01-17. Disparam
  // por proximidade, uma vez cada — como diálogo, não como texto fixo no
  // chão, que a esta escala de mapa viraria poluição visual.
  _buildDossiers(dossierDefs) {
    this.dossiers = dossierDefs.map((d) => {
      const world = this.tileMap.gridToWorld(d.gx, d.gy);
      const sprite = this.add.image(world.x, world.y, 'item_keycard')
        .setDepth(d.gy * 10 + 2).setScale(0.7).setTint(0x9fffc8).setAlpha(0.9);
      this.tweens.add({ targets: sprite, alpha: 0.5, duration: 900, yoyo: true, repeat: -1 });
      return { ...d, sprite, read: false };
    });
  }

  _checkDossiers() {
    for (const dossier of this.dossiers) {
      if (dossier.read) continue;
      if (Math.hypot(this.player.gx - dossier.gx, this.player.gy - dossier.gy) > DOSSIER_RANGE) continue;
      dossier.read = true;
      dossier.sprite.setAlpha(0.3).setTint(0x6a7280);
      this.tweens.killTweensOf(dossier.sprite);
      playSfx(this, 'sfx_menu_open', { volume: 0.3 });
      this.game.events.emit('dialogue', `Ficha de projeto — ${dossier.text}`);
    }
  }

  _setupCamera() {
    const { width, height } = this.tileMap.worldBounds();
    this.cameras.main.setBounds(0, 0, width, height);
    this.cameras.main.startFollow(this.player.sprite, true, 0.12, 0.12);
    this.cameras.main.setZoom(GAMEPLAY_ZOOM);
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
    // A Bancada tem prioridade sobre atacar: estar em cima dela e querer dar
    // um golpe no vazio não é um caso que exista.
    if (this._nearConsole()) {
      this._tryReconfigure();
      return;
    }
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

        if (item.kind === 'auth') {
          addInventoryItem({ id: 'pesquisa_auth', name: 'Chave de Autorização', icon: 'item_keycard' });
          this._unlockConfig('B', 'Chave de Autorização — a Bancada aceita a Planta B.');
          continue;
        }
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

    if (name === 'Bancada de Reconfiguração') {
      this._hint('bancada', 'As paredes deste andar correm em trilho, e é esta bancada que decide para onde. Cada parede fechada tem escrita a planta que a abre — se um corredor sumiu, procure a etiqueta e volte aqui para trocar.');
    } else if (name === 'Sala de Síntese') {
      this._hint('sintese', 'Nada aqui está pronto. Derrubar o casco de um protótipo não termina o serviço: o que estava sendo testado dentro dele sai andando.');
    } else if (name === 'Sala de Revisão de Projeto') {
      this._hint('revisao', 'Fim da corrente norte. A Chave de Autorização está aqui — com ela, a Bancada aceita uma segunda planta.');
    } else if (name === 'Galeria de Tanques') {
      this._hint('tanques', 'Cada tanque tem uma ficha. É aqui que estão os nomes de tudo que tentou te matar desde a fábrica.');
    } else if (name === 'Arquivo Vivo') {
      this._hint('arquivo', 'O Arquivista guarda o Selo de Contenção. Ele não bate: ele puxa — e o que vem depois dele usa a mesma tração com muito mais coisa em volta.');
    } else if (name === 'Corredor de Contenção') {
      this._hint('contencao', 'Do outro lado deste corredor está a coisa que desenhou todas as outras.');
    } else if (name === 'Núcleo de Projeto') {
      this._hint('nucleo', 'Ele não foi projetado por ninguém. Foi ele que projetou o resto.');
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
    // Sempre antes do early-return de levelEnded: o golpe que encerra a fase
    // já dropa loot NESTE frame.
    this._checkItemPickups();

    if (this.levelEnded) {
      if (this.returnDoorPos) this._checkReturnDoor();
      return;
    }

    this._checkDossiers();
    this._updateSeal();
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
      GameState.pesquisaCleared = true;
      for (const captive of PESQUISA_CAPTIVES) rescueNpc(captive.id);
      saveGame();
      this._spawnReturnDoor();
    }
  }

  _spawnReturnDoor() {
    this.returnDoorPos = { gx: this.boss.spawn.gx, gy: this.boss.spawn.gy + 3 };
    const world = this.tileMap.gridToWorld(this.returnDoorPos.gx, this.returnDoorPos.gy);
    this.returnDoorSprite = this.add.image(world.x, world.y, 'door_matriz').setDepth(9000).setTint(ACCENT);
    this.tweens.add({ targets: this.returnDoorSprite, alpha: 0.45, duration: 650, yoyo: true, repeat: -1 });
    this.add.text(world.x, world.y - 20, 'PRAÇA DA MATRIZ ↓', {
      fontFamily: 'Courier New', fontSize: '8px', color: '#c9a8ff'
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
    this.cameras.main.flash(150, 179, 122, 255);
    this.cameras.main.fadeOut(420, 16, 18, 26);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.stop('UIScene');
      this.scene.start('MatrizScene');
    });
  }
}
