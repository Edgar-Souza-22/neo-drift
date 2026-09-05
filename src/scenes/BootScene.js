import Phaser from 'phaser';
import { TILE_SIZE } from '../utils/constants.js';
import { createGrid, fillRect, fillCircle, clearCircle, paintOver, setPixel, renderGrid, mottle } from './pixelGrid.js';
import { createNoise2D } from 'simplex-noise';
import { generateSounds } from '../audio/SoundBank.js';
import { initMute } from '../audio/AudioManager.js';

// Lote de sprites desenhados à mão (Piskel) — cada lote novo (lote1 → lote2 →
// lote3-logo-boss → npcs → bosses → lote6) é um superset do anterior (parede/
// piso/porta de cada região, todo tipo de inimigo com loop de hover/pulso,
// ataque corpo-a-corpo de 4 frames + arremesso de 3, bullet/slash, tiles de
// puzzle, logo da Ala Central, os 5 NPCs em body/head separados, todo chefe
// único de cada fase, e agora os itens/props/FX que ainda eram procedurais:
// as 7 armas/consumíveis restantes, os 6 props de cenário, portal, bolt,
// particle e a mira do Tanque de Cerco). O pacote `art/mercado-negro/` entra
// por cima do lote6 só com as chaves da Fase 10 (piso/parede/porta, smuggler/
// enforcer, Barão/`boss_fence`, vendor, barraca/lanterna). `art/neo-sprites-colonia/`
// faz o mesmo na Fase 11 (piso/parede/porta, contaminado/portador, Enfermeiro/
// Matriarca, cápsula, tambores de filtro). Cada chave abaixo só troca a arte
// SE o arquivo existir na pasta — sem ele, cai automaticamente pro gerador
// procedural (guard `this.textures.exists()` em cada generateXxx).
// Só ficam 100% procedurais a vinheta/poça de luz (gradiente de canvas, não
// dá pra virar sprite) e o HUD (chrome de interface, fora do escopo desses lotes).
const TILE_KEYS = [
  'wall', 'door', 'floor', 'floor_vent', 'floor_hazard', 'floor_electric',
  'floor_town', 'floor_town_panel', 'floor_town_light',
  'floor_foundry', 'floor_foundry_vent', 'wall_foundry',
  'floor_reactor', 'floor_reactor_vent', 'wall_reactor',
  'floor_core', 'floor_core_vent', 'wall_core',
  'floor_tower', 'floor_tower_vent', 'wall_tower', 'door_tower',
  'floor_district', 'floor_district_puddle', 'wall_district',
  'floor_arsenal', 'floor_arsenal_vent', 'wall_arsenal', 'door_arsenal',
  'floor_nexus', 'floor_nexus_vent', 'wall_nexus', 'door_nexus',
  'floor_vigilancia', 'floor_vigilancia_vent', 'wall_vigilancia', 'door_vigilancia',
  'floor_submundo', 'floor_submundo_vent', 'wall_submundo',
  'floor_fantasma', 'floor_fantasma_vent', 'wall_fantasma',
  'floor_mercado', 'floor_mercado_stall', 'floor_mercado_vent', 'wall_mercado', 'door_mercado',
  'floor_colonia', 'floor_colonia_vent', 'floor_colonia_stain', 'floor_toxic', 'wall_colonia', 'door_colonia',
  'floor_servidor', 'floor_servidor_vent', 'floor_servidor_rack', 'wall_servidor', 'door_servidor',
  'floor_estaleiro', 'floor_estaleiro_stripe', 'wall_estaleiro', 'door_estaleiro',
  'floor_matriz', 'floor_matriz_inlay', 'wall_matriz', 'door_matriz',
  'floor_atrio', 'floor_atrio_inlay', 'floor_atrio_polido', 'wall_atrio', 'wall_glass',
  'floor_pd', 'floor_pd_grid', 'wall_pd',
  'tile_pressure_off', 'tile_pressure_on',
  'tile_sequence_off', 'tile_sequence_on', 'tile_circuit_off', 'tile_circuit_on',
  'trap_off', 'trap_warn', 'trap_on', 'tile_signal_off', 'tile_signal_on',
  'tile_filter_0', 'tile_filter_1', 'tile_filter_2',
  'tile_bus_plug_0', 'tile_bus_plug_1', 'tile_bus_plug_2', 'tile_bus_plug_3', 'tile_bus_plug_4',
  'tile_bus_socket_0', 'tile_bus_socket_1', 'tile_bus_socket_2', 'tile_bus_socket_3', 'tile_bus_socket_4'
];

const ITEM_KEYS = ['item_sword', 'item_pistol', 'item_armor', 'item_medkit', 'item_keycard'];

const FX_KEYS = [
  'bullet', 'slash', 'floor_logo', 'floor_logo_0', 'floor_logo_1', 'boss_aura',
  // lote6: portal/bolt só entram no frame estático (drop-in) por enquanto —
  // ligar o spin/pulso de verdade exigiria trocar add.image por add.sprite
  // em 8 pontos espalhados por 6 arquivos (cenas + Boss.js/RouterBoss.js/
  // ShooterDrone.js), fora do escopo desta troca de arte.
  'portal', 'bolt', 'particle', 'target_reticle', 'fx_shield'
];

const ITEM_KEYS_2 = ['item_ammo', 'item_pilebunker', 'item_smg', 'item_shotgun', 'item_railgun', 'item_stim', 'item_emp'];

const PROP_KEYS = ['prop_crate', 'prop_barrel', 'prop_pipe', 'prop_console', 'prop_kiosk', 'prop_hole', 'prop_stall', 'prop_lantern', 'prop_capsule', 'prop_rack', 'prop_firewall', 'prop_lift', 'prop_container', 'prop_cable', 'prop_pedestal', 'prop_banquet', 'prop_camera', 'prop_monorail', 'prop_partition', 'prop_tank'];

const NPC_TYPES = ['guard', 'engineer', 'worker', 'coordinator', 'herald', 'vendor'];

// Chefes únicos (um por fase, exceto o da Fase 01 que é o `boss`/`boss_alt`
// já tratado à parte acima) — todos com o mesmo loop de 4 frames de idle.
const NAMED_BOSS_TYPES = [
  'boss_foundry', 'boss_reactor', 'boss_core', 'boss_curator',
  'boss_tank', 'boss_router', 'boss_emissora', 'boss_ghosttrain', 'boss_fence', 'boss_matriarch', 'boss_administrador', 'boss_empilhador'
];

// tipo -> nº de frames do loop de hover/pulso do inimigo. O arquivo
// `<tipo>.png` é o frame estático usado quando o sprite é criado; os
// `<tipo>_0..N-1` são os frames da animação (ver Enemy.js `_setupHoverAnim`).
const ENEMY_ANIM_TYPES = {
  enemy: 4, enemy_tank: 4, enemy_foundry: 4, enemy_electric: 4, enemy_jammer: 4,
  enemy_shooter: 4, enemy_miniboss: 4, enemy_phasejumper: 4, enemy_portalguardian: 4,
  enemy_sentry: 4, enemy_dweller: 4, enemy_sentinel: 2,
  enemy_smuggler: 4, enemy_enforcer: 4,
  enemy_infected: 4, enemy_bloated: 4, enemy_enfermeiro: 4,
  enemy_firewall: 4, enemy_siphon: 4, enemy_sysadmin: 4,
  enemy_cargo: 4, enemy_stacker: 4, enemy_estivador: 4
};

const ART_KEY_OVERRIDES = {};
for (const key of [...TILE_KEYS, ...ITEM_KEYS, ...ITEM_KEYS_2, ...PROP_KEYS, ...FX_KEYS]) ART_KEY_OVERRIDES[key] = key;
for (const [type, frames] of Object.entries(ENEMY_ANIM_TYPES)) {
  ART_KEY_OVERRIDES[type] = type;
  for (let i = 0; i < frames; i++) ART_KEY_OVERRIDES[`${type}_${i}`] = `${type}_${i}`;
}
for (const dir of ['down', 'up', 'side']) {
  for (let i = 0; i < 4; i++) ART_KEY_OVERRIDES[`player_${dir}_${i}`] = `player_${dir}_${i}`;
  ART_KEY_OVERRIDES[`player_${dir}_atk`] = `player_${dir}_atk`;
  for (let i = 0; i < 4; i++) ART_KEY_OVERRIDES[`player_${dir}_atk${i}`] = `player_${dir}_atk${i}`;
  for (let i = 0; i < 3; i++) ART_KEY_OVERRIDES[`player_${dir}_throw${i}`] = `player_${dir}_throw${i}`;
}

// Chefe da Fase 01 (Guardião Núcleo): o lote 3 trouxe dois designs — `boss`
// (redesign do mesmo guardião) e `boss_alt` (mecha de segurança da fábrica).
// Pedido explícito do usuário: usar a versão `boss_alt` — por isso a chave do
// jogo `boss`/`boss_0..3` aponta pro arquivo `boss_alt`/`boss_alt_0..3`, não
// pro `boss` homônimo do lote.
ART_KEY_OVERRIDES.boss = 'boss_alt';
for (let i = 0; i < 4; i++) ART_KEY_OVERRIDES[`boss_${i}`] = `boss_alt_${i}`;

// Capataz do Mercado: o pacote não tem sprite próprio — reusa o enforcer
// (mesmo 20×20 + loop de 4 frames). generateCapatazMiniBoss só roda se o
// PNG não existir.
ART_KEY_OVERRIDES.enemy_capataz = 'enemy_enforcer';
for (let i = 0; i < 4; i++) ART_KEY_OVERRIDES[`enemy_capataz_${i}`] = `enemy_enforcer_${i}`;

for (const type of NPC_TYPES) {
  ART_KEY_OVERRIDES[`npc_${type}_body`] = `npc_${type}_body`;
  ART_KEY_OVERRIDES[`npc_${type}_head`] = `npc_${type}_head`;
}

for (const type of NAMED_BOSS_TYPES) {
  ART_KEY_OVERRIDES[type] = type;
  for (let i = 0; i < 4; i++) ART_KEY_OVERRIDES[`${type}_${i}`] = `${type}_${i}`;
}

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  // Carrega o lote de sprites de teste (se a pasta existir) ANTES do
  // pixelGrid rodar — as texturas carregadas aqui "vencem" as equivalentes
  // geradas em create() (cada generateXxx() abaixo checa this.textures.exists
  // antes de desenhar por cima). Sem essa pasta, o glob só fica vazio e o
  // jogo roda 100% procedural como sempre.
  preload() {
    // O caminho precisa ser um literal aqui — o plugin de glob do Vite lê a
    // string estaticamente, não aceita vir de uma const/variável.
    const lote6 = import.meta.glob('../../art/neo-sprites-lote6/png/*.png', { eager: true, query: '?url', import: 'default' });
    const mercado = import.meta.glob('../../art/mercado-negro/png/*.png', { eager: true, query: '?url', import: 'default' });
    const colonia = import.meta.glob('../../art/neo-sprites-colonia/png/*.png', { eager: true, query: '?url', import: 'default' });
    const urlByFileKey = {};
    for (const modules of [lote6, mercado, colonia]) {
      for (const [path, url] of Object.entries(modules)) {
        const fileKey = path.split('/').pop().replace(/\.png$/, '');
        urlByFileKey[fileKey] = url;
      }
    }
    for (const [gameKey, fileKey] of Object.entries(ART_KEY_OVERRIDES)) {
      const url = urlByFileKey[fileKey];
      if (url) this.load.image(gameKey, url);
    }
  }

  create() {
    // O save só entra em memória se o jogador escolher Continuar na tela
    // inicial — o boot não aplica progresso sozinho.
    initMute(this);
    generateSounds(this);

    if (!this.textures.exists('floor')) this.generateFloor('floor', 0x232742, 0x2c3156);
    if (!this.textures.exists('floor_vent')) this.generateFloorVent('floor_vent', 0x232742, 0x2c3156);
    this.generateFloor('floor_town', 0x1e2338, 0x272c4a);
    this.generateFloorTownPanel('floor_town_panel', 0x1e2338, 0x272c4a);
    this.generateFloorTownLight('floor_town_light', 0x1e2338, 0x272c4a);
    if (!this.textures.exists('floor_hazard')) this.generateHazardFloor('floor_hazard', 0x18161a);
    this.generateFloor('floor_foundry', 0x2a1a1a, 0x4a2c22);
    this.generateFloorVent('floor_foundry_vent', 0x2a1a1a, 0x4a2c22);
    this.generateFloor('floor_reactor', 0x1a2438, 0x243252);
    this.generateFloorVent('floor_reactor_vent', 0x1a2438, 0x243252);
    this.generateElectricFloor('floor_electric');
    this.generateFloor('floor_core', 0x1c1830, 0x2a2450);
    this.generateFloorVent('floor_core_vent', 0x1c1830, 0x2a2450);
    this.generateFloor('floor_tower', 0x1a2028, 0x24303c);
    this.generateFloorVent('floor_tower_vent', 0x1a2028, 0x24303c);
    this.generateDistrictFloor('floor_district', 0x14161e, 0x1e222c);
    this.generateDistrictPuddle('floor_district_puddle', 0x14161e, 0x1e222c);
    this.generateFloor('floor_arsenal', 0x1c2418, 0x2c3a20);
    this.generateFloorVent('floor_arsenal_vent', 0x1c2418, 0x2c3a20);
    this.generateFloor('floor_nexus', 0x1c1430, 0x2e1f52);
    this.generateFloorVent('floor_nexus_vent', 0x1c1430, 0x2e1f52);
    this.generateFloor('floor_vigilancia', 0x141c1a, 0x1e2c28);
    this.generateFloorVent('floor_vigilancia_vent', 0x141c1a, 0x1e2c28);
    this.generateFloor('floor_submundo', 0x161412, 0x201c18);
    this.generateFloorVent('floor_submundo_vent', 0x161412, 0x201c18);
    this.generateFloor('floor_fantasma', 0x1a1a1c, 0x26262a);
    this.generateFloorVent('floor_fantasma_vent', 0x1a1a1c, 0x26262a);
    this.generateFloor('floor_mercado', 0x1a1410, 0x2a2218);
    this.generateFloorVent('floor_mercado_vent', 0x1a1410, 0x2a2218);
    this.generateFloor('floor_mercado_stall', 0x221810, 0x3a2a18);
    this.generateFloor('floor_colonia', 0x141810, 0x1e2618);
    this.generateFloorVent('floor_colonia_vent', 0x141810, 0x1e2618);
    this.generateFloor('floor_colonia_stain', 0x1a2214, 0x2a3a1c);
    this.generateFloor('floor_servidor', 0x0c1418, 0x162028);
    this.generateFloorVent('floor_servidor_vent', 0x0c1418, 0x162028);
    this.generateFloorServidorRack('floor_servidor_rack');
    this.generateFloor('floor_estaleiro', 0x1a2228, 0x243038);
    this.generateFloorEstaleiroStripe('floor_estaleiro_stripe');
    // Refinaria Offshore (Fase 14) — placa de convés em aço azulado (mais
    // frio que o cais do Estaleiro), grade de ventilação reaproveitada como
    // variante "trilho" de piso, prancha de ponte e água aberta à parte.
    this.generateFloor('floor_refinaria', 0x1c2830, 0x28343e);
    this.generateFloorVent('floor_refinaria_stripe', 0x1c2830, 0x28343e);
    this.generateFloorBridge('floor_bridge');
    this.generateWaterFloor('floor_water');
    this.generateOilStainProp();
    this.generateSmokestackProp();
    // Estaleiro Naval (Fase 15) — aço mais claro/"limpo" que a Refinaria,
    // luz de solda azul-branca em vez de âmbar/vermelho.
    this.generateFloor('floor_naval', 0x1e262c, 0x2a3440);
    this.generateFloorVent('floor_naval_stripe', 0x1e262c, 0x2a3440);
    this.generateConveyorTiles();
    this.generateRobotArmProp();
    // Torre Matriz (Região 5) — pedra escura polida com fio de latão. Nada
    // de chapa industrial: é a única região do jogo onde o chão foi feito
    // pra impressionar visita, não pra aguentar carga.
    this.generateFloor('floor_matriz', 0x1a1e26, 0x262c38);
    this.generateFloorGoldInlay('floor_matriz_inlay', 0x1a1e26);
    this.generateFloor('floor_atrio', 0x1c2028, 0x2a3038);
    this.generateFloorGoldInlay('floor_atrio_inlay', 0x1c2028);
    this.generatePolishedFloor('floor_atrio_polido');
    // Departamento de P&D (Fase 18) — sala limpa: piso mais frio e claro que
    // o do Átrio, com uma variante de grade de escoamento em vez do embutido
    // de latão. Laboratório, não saguão.
    this.generateFloor('floor_pd', 0x1c2230, 0x28303f);
    this.generateFloorVent('floor_pd_grid', 0x1c2230, 0x28303f);
    this.generateToxicFloor('floor_toxic');
    this.generateCompanyLogo();
    this.generateVignette();
    this.generateLightPool();
    this.generateBossAura();
    this.generateTargetReticle();
    this.generateCrate();
    this.generateBarrel();
    this.generatePipe();
    // Ala Central: mesma linguagem estrutural (moldura + placas de canto +
    // faixa central) em todas as 4 fases — a "família" que o usuário pediu
    // pra manter — mas cada uma com seu próprio acento de cor, ecoando a
    // identidade que o piso da fase já tem, em vez de tudo idêntico.
    if (!this.textures.exists('wall')) this.generateWall('wall');
    this.generateWall('wall_foundry', { body: 0x3a2420, frame: 0x1c1210, accent: 0xff6a3d, plate: 0x5a3226, outline: 0x120a08 });
    this.generateWall('wall_reactor', { body: 0x223048, frame: 0x101a2a, accent: 0x37f0ff, plate: 0x2f5f78, outline: 0x08121e });
    this.generateWall('wall_core', { body: 0x2a2450, frame: 0x140f2a, accent: 0xb37aff, plate: 0x4a3a7a, outline: 0x0c081c });
    // Distrito Neon: cada fase é um local diferente, então a estrutura da
    // parede muda de verdade (não só a cor) — inspirado em tilesets de
    // fachada urbana cyberpunk, sci-fi limpo e metal industrial desgastado.
    this.generateWallDistrict('wall_district');
    this.generateWallTower('wall_tower');
    this.generateWallArsenal('wall_arsenal');
    this.generateWallNexus('wall_nexus');
    this.generateWallVigilance('wall_vigilancia');
    // Submundo (Região 3): rocha úmida no hub, azulejo velho de metrô na
    // Estação Fantasma — dois locais bem diferentes dentro da mesma região,
    // no mesmo espírito de diferenciação já aplicado ao Distrito Neon.
    this.generateWallSubmundo('wall_submundo');
    this.generateWallFantasma('wall_fantasma');
    this.generateWall('wall_mercado', { body: 0x2a2018, frame: 0x14100c, accent: 0xe8b93d, plate: 0x4a3020, outline: 0x0a0704 });
    this.generateWall('wall_colonia', { body: 0x1e2618, frame: 0x0e140c, accent: 0x6dff4a, plate: 0x3a4a28, outline: 0x060a04 });
    this.generateWallServidor('wall_servidor');
    // Estaleiro Automatizado (Região 4): chapa corrugada de contêiner com
    // faixa de risco — porto robotizado, nem rocha nem painel de rack.
    this.generateWallEstaleiro('wall_estaleiro');
    this.generateWall('wall_naval', { body: 0x3a4048, frame: 0x1c2028, accent: 0x8fe0ff, plate: 0x4a5a68, outline: 0x0c1418 });
    this.generateWall('wall_matriz', { body: 0x49505f, frame: 0x14171e, accent: 0xc9a24a, plate: 0x5c6478, outline: 0x0a0c10 });
    this.generateWallAtrio('wall_atrio');
    this.generateGlassWall('wall_glass');
    this.generateWall('wall_pd', { body: 0x525c72, frame: 0x161b26, accent: 0x8fe0ff, plate: 0x646f88, outline: 0x0a0d14 });
    if (!this.textures.exists('door')) this.generateDoor('door');
    // Portas de entrada do Distrito Neon — uma pra cada destino, em vez do
    // mesmo 'door' genérico só retintado (o que o pedia pra ser diferenciado).
    this.generateDoorTower('door_tower');
    this.generateDoorArsenal('door_arsenal');
    this.generateDoorNexus('door_nexus');
    this.generateDoorVigilance('door_vigilancia');
    if (!this.textures.exists('door_mercado')) this.generateDoor('door_mercado');
    if (!this.textures.exists('door_colonia')) this.generateDoor('door_colonia');
    this.generateDoorServidor('door_servidor');
    this.generateDoorEstaleiro('door_estaleiro');
    this.generateDoorMatriz('door_matriz');
    this.generatePlayerFrames();
    if (!this.textures.exists('enemy')) this.generateEnemy();
    this.generateTankEnemy();
    this.generateBoss();
    this.generateFoundryEnemy();
    this.generateFoundryBoss();
    this.generateElectricEnemy();
    this.generateMiniBossEnemy();
    this.generateReactorBoss();
    this.generateJammerDrone();
    this.generateSentinelTurret();
    this.generateCoreBoss();
    this.generateFirewallConsole();
    this.generateShooterDrone();
    this.generateCuratorBoss();
    this.generateSequenceTile();
    this.generateCircuitTile();
    this.generateTrapTile();
    this.generateTankBoss();
    this.generatePhaseJumperEnemy();
    this.generatePortalGuardianEnemy();
    this.generateRouterBoss();
    this.generateSentrySentinelEnemy();
    this.generateSignalTile();
    this.generateEmissoraBoss();
    this.generateDwellerEnemy();
    this.generateGhostTrainBoss();
    this.generateMarketMilitia();
    this.generateMarketEnforcer();
    this.generateCapatazMiniBoss();
    this.generateMarketBaronBoss();
    this.generateInfectedEnemy();
    this.generateBloatedEnemy();
    this.generateEnfermeiroMiniBoss();
    this.generateMatriarchBoss();
    this.generateFilterTile();
    this.generateCapsuleProp();
    this.generateFirewallEnemy();
    this.generateSiphonEnemy();
    this.generateSysadminMiniBoss();
    this.generateAdministradorBoss();
    this.generateCableTiles();
    this.generateRackProp();
    this.generateBusTiles();
    this.generateFirewallProp();
    this.generateLiftProp();
    this.generateContainerProp();
    this.generateCableProp();
    this.generateCargoDrone();
    this.generateStackerEnemy();
    this.generateEstivadorMiniBoss();
    this.generateEmpilhadorBoss();
    this.generateEnemyRefinaria();
    this.generatePusherEnemy();
    this.generateGuincheiroMiniBoss();
    this.generatePerfuratrizBoss();
    this.generateSupervisorMiniBoss();
    this.generatePrototipoBoss();
    this.generateOperadorMestreMiniBoss();
    this.generateGuardiaTrafegoMiniBoss();
    this.generateRegenteBoss();
    this.generateShieldGuard();
    this.generateConciergeMiniBoss();
    this.generateDiretoraBoss();
    this.generateShieldFx();
    this.generateUnstablePrototype();
    this.generateArquivistaMiniBoss();
    this.generateProjetistaBoss();
    this.generatePartitionProp();
    this.generateTankProp();
    this.generatePressureTiles();
    this.generatePedestalProp();
    this.generateBanquetProp();
    this.generateCameraProp();
    this.generateMonorailProp();
    this.generatePortal();
    this.generateKiosk();
    this.generateStall();
    this.generateLantern();
    this.generateHoleProp();
    this.generateGuardNPC();
    this.generateEngineerNPC();
    this.generateWorkerNPC();
    this.generateCoordinatorNPC();
    this.generateHeraldNPC();
    this.generateVendorNPC();
    if (!this.textures.exists('item_sword')) this.generateItem();
    if (!this.textures.exists('item_armor')) this.generateArmorItem();
    if (!this.textures.exists('item_keycard')) this.generateKeycardItem();
    if (!this.textures.exists('item_medkit')) this.generateMedkitItem();
    if (!this.textures.exists('item_pistol')) this.generatePistolItem();
    this.generateBootsItem();
    this.generateAmmoItem();
    this.generatePilebunkerItem();
    this.generateSmgItem();
    this.generateShotgunItem();
    this.generateRailgunItem();
    this.generateStimItem();
    this.generateEmpItem();
    this.generateBullet();
    this.generateBolt();
    this.generateSlash();
    this.generateParticle();
    this.generateHudSegment();
    this.generateHudPanel('hud_panel_stats', 260, 160, 7);
    this.generateHudPanel('hud_panel_dialogue', 900, 70, 10);
    this.generateHudPanel('hud_panel_menu', 600, 580, 10);

    this.scene.start('TitleScene');
  }

  // Painel de HUD com moldura fina e cantos "de mira" (bracket), no mesmo
  // estilo pixel art dos tiles/sprites — substitui os retângulos lisos do Phaser.
  generateHudPanel(key, w, h, bracketLen) {
    const grid = createGrid(w, h);
    fillRect(grid, 0, 0, w, h, 0x0a0c18);
    paintOver(grid, 0, 0, w, 1, 0x2c3156);
    paintOver(grid, 0, h - 1, w, 1, 0x2c3156);
    paintOver(grid, 0, 0, 1, h, 0x2c3156);
    paintOver(grid, w - 1, 0, 1, h, 0x2c3156);

    const corners = [[0, 0, 1, 1], [w - 1, 0, -1, 1], [0, h - 1, 1, -1], [w - 1, h - 1, -1, -1]];
    for (const [cx, cy, dx, dy] of corners) {
      for (let i = 0; i < bracketLen; i++) {
        setPixel(grid, cx + dx * i, cy, 0x37f0ff);
        setPixel(grid, cx, cy + dy * i, 0x37f0ff);
      }
    }
    const g = this.add.graphics();
    renderGrid(g, grid);
    g.generateTexture(key, w, h);
    g.destroy();
  }

  // Célula branca simples reaproveitada pelas barras segmentadas do HUD
  // (HP/XP) via setTint — evita gerar uma textura por cor/estado.
  generateHudSegment() {
    const w = 12;
    const h = 10;
    const grid = createGrid(w, h);
    fillRect(grid, 0, 0, w, h, 0xffffff);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x05060c);
    g.generateTexture('hud_segment', w, h);
    g.destroy();
  }

  // Desloca os canais RGB de `color` por (dr,dg,db), com clamp em [0,255] —
  // usado pra derivar tons mais claros/escuros de uma cor base sem repetir
  // essa conta em cada gerador de tile.
  _shade(color, dr, dg, db) {
    const r = Phaser.Math.Clamp(((color >> 16) & 255) + dr, 0, 255);
    const g = Phaser.Math.Clamp(((color >> 8) & 255) + dg, 0, 255);
    const b = Phaser.Math.Clamp((color & 255) + db, 0, 255);
    return Phaser.Display.Color.GetColor(r, g, b);
  }

  // Piso em placas: base + rebaixo de 1px separando 4 placas, rebites nos
  // cantos e um leve bisel claro no canto superior-esquerdo (luz vindo de cima).
  generateFloor(key, base, edge) {
    if (this.textures.exists(key)) return;
    const s = TILE_SIZE;
    const bevel = Phaser.Display.Color.GetColor(
      Math.min(255, ((base >> 16) & 255) + 18),
      Math.min(255, ((base >> 8) & 255) + 18),
      Math.min(255, (base & 255) + 22)
    );
    const bolt = edge;

    const grid = createGrid(s, s);
    fillRect(grid, 0, 0, s, s, base);

    // Manchas orgânicas por ruído simplex — quebra o chapado de cor sólida
    // da placa em algo com desgaste/sujeira real, no mesmo espírito do
    // acabamento aplicado nos chefes.
    const floorNoise = createNoise2D();
    mottle(grid, floorNoise, { color: this._shade(base, -10, -10, -8), threshold: 0.4, scale: 0.4 });
    mottle(grid, floorNoise, { color: this._shade(base, 8, 8, 10), threshold: 0.55, scale: 0.4, offsetX: 30, offsetY: 30 });

    paintOver(grid, 0, 0, s, 1, bevel);
    paintOver(grid, 0, 0, 1, s, bevel);
    paintOver(grid, s / 2 - 1, 0, 1, s, edge);
    paintOver(grid, 0, s / 2 - 1, s, 1, edge);
    for (const [x, y] of [[3, 3], [s - 4, 3], [3, s - 4], [s - 4, s - 4]]) {
      setPixel(grid, x, y, bolt);
    }
    const g = this.add.graphics();
    renderGrid(g, grid);
    g.generateTexture(key, s, s);
    g.destroy();
  }

  // Variante de piso com grade de ventilação — usada em pequena proporção
  // pelo TileMap para quebrar a repetição visual das salas maiores.
  generateFloorVent(key, base, edge) {
    if (this.textures.exists(key)) return;
    const s = TILE_SIZE;
    const grid = createGrid(s, s);
    fillRect(grid, 0, 0, s, s, base);
    const ventNoise = createNoise2D();
    mottle(grid, ventNoise, { color: this._shade(base, -10, -10, -8), threshold: 0.4, scale: 0.4 });
    mottle(grid, ventNoise, { color: this._shade(base, 8, 8, 10), threshold: 0.55, scale: 0.4, offsetX: 30, offsetY: 30 });
    for (let y = 4; y < s - 2; y += 4) {
      paintOver(grid, 3, y, s - 6, 1, edge);
    }
    paintOver(grid, 2, 2, s - 4, 1, edge);
    paintOver(grid, 2, s - 3, s - 4, 1, edge);
    const g = this.add.graphics();
    renderGrid(g, grid);
    g.generateTexture(key, s, s);
    g.destroy();
  }

  // Variante de piso do Estaleiro: placa de cais com faixa de risco amarela
  // numa borda (não o xadrez diagonal do `floor_hazard` das masmorras).
  generateFloorEstaleiroStripe(key) {
    if (this.textures.exists(key)) return;
    const s = TILE_SIZE;
    const base = 0x1a2228;
    const edge = 0x243038;
    const grid = createGrid(s, s);
    fillRect(grid, 0, 0, s, s, base);
    const stripeNoise = createNoise2D();
    mottle(grid, stripeNoise, { color: this._shade(base, -8, -8, -6), threshold: 0.4, scale: 0.4 });
    mottle(grid, stripeNoise, { color: this._shade(base, 8, 8, 10), threshold: 0.55, scale: 0.4, offsetX: 30, offsetY: 30 });
    paintOver(grid, 0, 0, s, 1, this._shade(base, 18, 18, 22));
    paintOver(grid, 0, 0, 1, s, this._shade(base, 18, 18, 22));
    paintOver(grid, s / 2 - 1, 0, 1, s, edge);
    paintOver(grid, 0, s / 2 - 1, s, 1, edge);
    for (let x = 0; x < s; x++) {
      const on = Math.floor(x / 4) % 2 === 0;
      setPixel(grid, x, s - 4, on ? 0xe8a030 : 0x0c1014);
      setPixel(grid, x, s - 3, on ? 0xe8a030 : 0x0c1014);
    }
    const g = this.add.graphics();
    renderGrid(g, grid);
    g.generateTexture(key, s, s);
    g.destroy();
  }

  // Variante de piso da Ala Central com emendas verticais (tubulação/painel),
  // contraste com a grade horizontal usada no Setor de Contenção.
  generateFloorTownPanel(key, base, edge) {
    if (this.textures.exists(key)) return;
    const s = TILE_SIZE;
    const grid = createGrid(s, s);
    fillRect(grid, 0, 0, s, s, base);
    const panelNoise = createNoise2D();
    mottle(grid, panelNoise, { color: this._shade(base, -10, -10, -8), threshold: 0.4, scale: 0.4 });
    mottle(grid, panelNoise, { color: this._shade(base, 8, 8, 10), threshold: 0.55, scale: 0.4, offsetX: 30, offsetY: 30 });
    for (let x = 5; x < s - 2; x += 6) {
      paintOver(grid, x, 3, 1, s - 6, edge);
    }
    paintOver(grid, 2, 2, s - 4, 1, edge);
    paintOver(grid, 2, s - 3, s - 4, 1, edge);
    const g = this.add.graphics();
    renderGrid(g, grid);
    g.generateTexture(key, s, s);
    g.destroy();
  }

  // Variante de piso com luminária embutida — usada em pequena proporção
  // pra dar pontos de luz espalhados pelo chão da Ala Central.
  generateFloorTownLight(key, base, edge) {
    if (this.textures.exists(key)) return;
    const s = TILE_SIZE;
    const grid = createGrid(s, s);
    fillRect(grid, 0, 0, s, s, base);
    paintOver(grid, 0, 0, s, 1, edge);
    paintOver(grid, 0, 0, 1, s, edge);
    fillRect(grid, s / 2 - 5, s / 2 - 5, 10, 10, 0x123338);
    fillRect(grid, s / 2 - 3, s / 2 - 3, 6, 6, 0x37f0ff);
    setPixel(grid, s / 2 - 1, s / 2 - 1, 0xdfffff);
    const g = this.add.graphics();
    renderGrid(g, grid);
    g.generateTexture(key, s, s);
    g.destroy();
  }

  // Logo da Neo Industries: emblema circular com monograma "N" — desenhado
  // como um decalque de várias células (não passa pelo TileMap por tile).
  // Anéis com bisel (aro escuro-base-aro claro, como um tubo iluminado) e
  // ruído de desgaste, no mesmo acabamento já usado em chefes/pisos/props —
  // antes era um anel de cor sólida chapada, destoando do resto do jogo.
  generateCompanyLogo() {
    if (this.textures.exists('floor_logo')) return;
    const s = 96;
    const cx = s / 2;
    const cy = s / 2;
    const grid = createGrid(s, s);
    const ring = 0x37f0ff;
    const ringDark = this._shade(ring, -30, -60, -50);
    const ringLight = 0xcfffff;
    const glyph = 0x9fffe8;
    const glyphLight = this._shade(glyph, 40, 10, 10);
    const tick = this._shade(ring, -10, -50, -30);

    // Anel externo com bisel: aro escuro fora, corpo na cor base, aro claro
    // por dentro — lê como um tubo de neon visto de cima, não um disco plano.
    fillCircle(grid, cx, cy, 46, ringDark);
    fillCircle(grid, cx, cy, 44, ring);
    fillCircle(grid, cx, cy, 41, ringLight);
    clearCircle(grid, cx, cy, 40);

    const ringNoise = createNoise2D();
    mottle(grid, ringNoise, { color: this._shade(ring, -14, -14, -10), threshold: 0.4, scale: 0.22 });

    // Marcas de dial no vão entre os dois anéis — detalhe de "painel técnico",
    // não um disco vazio.
    for (let deg = 0; deg < 360; deg += 15) {
      const rad = Phaser.Math.DegToRad(deg);
      for (let r = 35; r <= 39; r++) {
        setPixel(grid, Math.round(cx + Math.cos(rad) * r), Math.round(cy + Math.sin(rad) * r), tick);
      }
    }

    fillCircle(grid, cx, cy, 34, ringDark);
    fillCircle(grid, cx, cy, 33, ring);
    clearCircle(grid, cx, cy, 31);

    // Monograma "N": duas barras verticais + diagonal, com bisel claro na
    // borda esquerda/superior (mesma luz-vindo-de-cima do resto do jogo).
    fillRect(grid, 30, 26, 8, 44, glyph);
    fillRect(grid, 58, 26, 8, 44, glyph);
    const steps = 60;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = Math.round(34 + t * (62 - 34));
      const y = Math.round(28 + t * (68 - 28));
      fillRect(grid, x - 4, y - 4, 8, 8, glyph);
    }
    paintOver(grid, 30, 26, 2, 44, glyphLight);
    paintOver(grid, 58, 26, 2, 44, glyphLight);

    const glyphNoise = createNoise2D();
    mottle(grid, glyphNoise, { color: this._shade(glyph, -30, -20, -14), threshold: 0.48, scale: 0.35, region: { x0: 28, y0: 24, w: 42, h: 48 } });

    // Parafusos decorativos ao redor do anel externo, com glint de destaque.
    for (const deg of [0, 60, 120, 180, 240, 300]) {
      const rad = Phaser.Math.DegToRad(deg);
      const bx = Math.round(cx + Math.cos(rad) * 46);
      const by = Math.round(cy + Math.sin(rad) * 46);
      fillCircle(grid, bx, by, 3, 0x1c2038);
      setPixel(grid, bx - 1, by - 1, 0x4a5580);
    }

    const g = this.add.graphics();
    renderGrid(g, grid);
    g.generateTexture('floor_logo', s, s);
    g.destroy();
  }

  // Piso com faixa de risco (fita diagonal amarelo/preto) — mesma linguagem
  // industrial do mockup de referência, usado como variante rara no setor.
  generateHazardFloor(key, base) {
    const s = TILE_SIZE;
    const grid = createGrid(s, s);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const band = (x + y) % 16;
        setPixel(grid, x, y, band < 8 ? 0xe8b93d : base);
      }
    }
    paintOver(grid, 0, 0, s, 2, 0x0a0a0c);
    paintOver(grid, 0, s - 2, s, 2, 0x0a0a0c);
    const g = this.add.graphics();
    renderGrid(g, grid);
    g.generateTexture(key, s, s);
    g.destroy();
  }

  // Vinheta de tela (gradiente radial de verdade via canvas — não passa pelo
  // pixelGrid, é atmosfera suave por cima da pixel art nítida) escurecendo
  // as bordas pra dar profundidade/clima, no espírito das referências.
  generateVignette() {
    const w = 960;
    const h = 600;
    const tex = this.textures.createCanvas('vignette', w, h);
    const ctx = tex.getContext();
    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.hypot(cx, cy);
    const grad = ctx.createRadialGradient(cx, cy, maxR * 0.4, cx, cy, maxR);
    grad.addColorStop(0, 'rgba(4,5,10,0)');
    grad.addColorStop(1, 'rgba(4,5,10,0.82)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    tex.refresh();
  }

  // Poça de luz suave (gradiente radial via canvas) — sobreposta em pontos
  // específicos do mundo (portas, logo, chefe) pra dar aquele clima de luz
  // pontual sobre piso nítido, como no Hyper Light Drifter de referência.
  generateLightPool() {
    const s = 120;
    const tex = this.textures.createCanvas('light_pool', s, s);
    const ctx = tex.getContext();
    const grad = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(159,255,232,0.5)');
    grad.addColorStop(0.55, 'rgba(55,240,255,0.2)');
    grad.addColorStop(1, 'rgba(55,240,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, s, s);
    tex.refresh();
  }

  // Aura de chefe — anel fino com pequenas marcas assimétricas (pra a
  // rotação em runtime ficar visível), reaproveitado por todos os chefes
  // com uma cor própria via tint. Nenhum inimigo comum usa isso — é o que
  // faz um chefe se destacar à primeira vista, além do tamanho/silhueta.
  generateBossAura() {
    if (this.textures.exists('boss_aura')) return;
    const s = 72;
    const grid = createGrid(s, s);
    fillCircle(grid, s / 2, s / 2, 34, 0xffffff);
    clearCircle(grid, s / 2, s / 2, 29);
    for (const deg of [15, 95, 160, 210, 260, 320]) {
      const rad = Phaser.Math.DegToRad(deg);
      const bx = Math.round(s / 2 + Math.cos(rad) * 31.5);
      const by = Math.round(s / 2 + Math.sin(rad) * 31.5);
      fillCircle(grid, bx, by, 2, 0xffffff);
    }
    const g = this.add.graphics();
    renderGrid(g, grid);
    g.generateTexture('boss_aura', s, s);
    g.destroy();
  }

  // Alvo de mira — anel + cruz + marcas de canto, usado pelo bombardeio de
  // canhão do Tanque de Cerco (ver TankBoss.js) pra deixar claro o ponto
  // exato de impacto em vez de só uma poça de luz pulsando.
  generateTargetReticle() {
    if (this.textures.exists('target_reticle')) return;
    const s = 48;
    const c = s / 2;
    const grid = createGrid(s, s);
    fillCircle(grid, c, c, 20, 0xffffff);
    clearCircle(grid, c, c, 17);
    fillRect(grid, c - 1, 4, 2, 11, 0xffffff);
    fillRect(grid, c - 1, s - 15, 2, 11, 0xffffff);
    fillRect(grid, 4, c - 1, 11, 2, 0xffffff);
    fillRect(grid, s - 15, c - 1, 11, 2, 0xffffff);
    fillCircle(grid, c, c, 2, 0xffffff);
    const g2 = this.add.graphics();
    renderGrid(g2, grid);
    g2.generateTexture('target_reticle', s, s);
    g2.destroy();
  }

  // Caixote — decoração de cenário (crate de carga/suprimentos).
  generateCrate() {
    if (this.textures.exists('prop_crate')) return;
    const grid = createGrid(18, 18);
    fillRect(grid, 1, 1, 16, 16, 0x4a3a2a);

    const crateNoise = createNoise2D();
    mottle(grid, crateNoise, { color: this._shade(0x4a3a2a, -14, -12, -8), threshold: 0.35, scale: 0.55 });
    mottle(grid, crateNoise, { color: this._shade(0x4a3a2a, 12, 10, 8), threshold: 0.5, scale: 0.55, offsetX: 20, offsetY: 20 });

    paintOver(grid, 1, 1, 16, 3, 0x6b5540);
    fillRect(grid, 1, 1, 3, 16, 0x2f2419);
    fillRect(grid, 14, 1, 3, 16, 0x2f2419);
    fillRect(grid, 1, 8, 16, 2, 0x2f2419);
    setPixel(grid, 4, 4, 0xffb347);
    setPixel(grid, 13, 13, 0xffb347);
    const g = this.add.graphics();
    renderGrid(g, grid);
    g.generateTexture('prop_crate', 18, 18);
    g.destroy();
  }

  // Barril — decoração de cenário (contêiner cilíndrico).
  generateBarrel() {
    if (this.textures.exists('prop_barrel')) return;
    const grid = createGrid(14, 18);
    fillRect(grid, 2, 1, 10, 16, 0x3a4a4a);
    paintOver(grid, 3, 1, 8, 16, 0x4f6363);

    const barrelNoise = createNoise2D();
    mottle(grid, barrelNoise, { color: this._shade(0x4f6363, -12, -10, -10), threshold: 0.35, scale: 0.55 });
    mottle(grid, barrelNoise, { color: this._shade(0x4f6363, 10, 8, 8), threshold: 0.5, scale: 0.55, offsetX: 20, offsetY: 20 });

    paintOver(grid, 2, 3, 10, 2, 0x1c2424);
    paintOver(grid, 2, 12, 10, 2, 0x1c2424);
    setPixel(grid, 6, 8, 0xff8a3d);
    setPixel(grid, 7, 8, 0xff8a3d);
    const g = this.add.graphics();
    renderGrid(g, grid);
    g.generateTexture('prop_barrel', 14, 18);
    g.destroy();
  }

  // Tubulação com válvula — decoração de cenário (encostada em paredes).
  generatePipe() {
    if (this.textures.exists('prop_pipe')) return;
    const grid = createGrid(14, 30);
    fillRect(grid, 4, 0, 6, 30, 0x2a2f45);
    paintOver(grid, 4, 0, 2, 30, 0x3a4166);

    const pipeNoise = createNoise2D();
    mottle(grid, pipeNoise, { color: this._shade(0x2a2f45, -10, -10, -8), threshold: 0.35, scale: 0.6 });
    mottle(grid, pipeNoise, { color: this._shade(0x2a2f45, 10, 10, 12), threshold: 0.5, scale: 0.6, offsetX: 20, offsetY: 20 });

    fillCircle(grid, 7, 15, 6, 0x3a4178);
    fillCircle(grid, 7, 15, 3, 0x1c2038);
    setPixel(grid, 7, 15, 0xff8a3d);
    const g = this.add.graphics();
    renderGrid(g, grid);
    g.generateTexture('prop_pipe', 14, 30);
    g.destroy();
  }

  // Parede "de família" da Ala Central — moldura + placas de canto + faixa
  // central, reaproveitada por Fase 01-04 (e a Ala Central em si). A
  // estrutura é sempre a mesma (isso é a "similaridade" entre elas); só o
  // acento de cor muda, ecoando a identidade que o piso de cada fase já tem.
  generateWall(key, opts = {}) {
    if (this.textures.exists(key)) return;
    const { body = 0x272c4e, frame = 0x14172a, accent = 0xffb347, plate = 0x3a4178, outline = 0x0a0b16 } = opts;
    const s = TILE_SIZE;
    const grid = createGrid(s, s);
    fillRect(grid, 0, 0, s, s, frame);
    fillRect(grid, 2, 2, s - 4, s - 4, body);
    const wallNoise = createNoise2D();
    mottle(grid, wallNoise, { color: this._shade(body, -10, -10, -8), threshold: 0.4, scale: 0.4 });
    mottle(grid, wallNoise, { color: this._shade(body, 8, 8, 10), threshold: 0.55, scale: 0.4, offsetX: 30, offsetY: 30 });
    paintOver(grid, 2, 2, s - 4, 2, accent);
    paintOver(grid, s / 2 - 1, 4, 1, s - 8, this._shade(frame, 8, 8, 10));
    fillRect(grid, 6, 8, 5, 5, plate);
    fillRect(grid, s - 11, 8, 5, 5, plate);
    fillRect(grid, 6, s - 13, 5, 5, plate);
    fillRect(grid, s - 11, s - 13, 5, 5, plate);
    for (const [x, y] of [[8, 10], [s - 9, 10], [8, s - 11], [s - 9, s - 11]]) {
      setPixel(grid, x, y, this._shade(frame, 8, 8, 8));
    }
    const g = this.add.graphics();
    renderGrid(g, grid, outline);
    g.generateTexture(key, s, s);
    g.destroy();
  }

  // Parede do Distrito Neon (hub) — fachada urbana suja, não uma porta de
  // painel industrial: concreto desgastado com trincas e um letreiro de neon
  // embutido, assimétrico (referência: fachadas cyberpunk exteriores).
  generateWallDistrict(key) {
    if (this.textures.exists(key)) return;
    const s = TILE_SIZE;
    const base = 0x22252e;
    const grid = createGrid(s, s);
    fillRect(grid, 0, 0, s, s, 0x121319);
    fillRect(grid, 1, 1, s - 2, s - 2, base);
    const grime = createNoise2D();
    mottle(grid, grime, { color: this._shade(base, -14, -14, -12), threshold: 0.28, scale: 0.55 });
    mottle(grid, grime, { color: this._shade(base, -22, -20, -18), threshold: 0.5, scale: 0.8, offsetX: 50, offsetY: 12 });
    mottle(grid, grime, { color: this._shade(base, 10, 10, 12), threshold: 0.62, scale: 0.4, offsetX: 12, offsetY: 60 });
    // Trincas finas (linhas irregulares de 1px), não um padrão geométrico.
    for (const [x, y] of [[4, 3], [5, 4], [5, 5], [6, 6], [6, 7], [7, 8]]) setPixel(grid, x, y, 0x0d0e12);
    for (const [x, y] of [[26, 20], [25, 21], [25, 22], [24, 23], [23, 24]]) setPixel(grid, x, y, 0x0d0e12);
    // Letreiro de neon embutido — tira vertical fina, fora do centro,
    // deliberadamente assimétrica (não é um painel técnico simétrico).
    fillRect(grid, 22, 5, 3, 22, 0x0a1016);
    fillRect(grid, 23, 6, 1, 20, 0xff5fd0);
    setPixel(grid, 23, 6, 0xffe0f8);
    setPixel(grid, 23, 25, 0xffe0f8);
    fillRect(grid, 4, s - 9, 6, 2, 0x1a1d24);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x08090c);
    g.generateTexture(key, s, s);
    g.destroy();
  }

  // Parede da Torre de Segurança — painel sci-fi liso (referência RASAK
  // "Blue Star"): quase sem ruído/sujeira, poucas costuras finas e brilhantes
  // em vez de rebites — lê como tecnologia limpa, não fábrica desgastada.
  generateWallTower(key) {
    if (this.textures.exists(key)) return;
    const s = TILE_SIZE;
    const base = 0x1c2436;
    const grid = createGrid(s, s);
    fillRect(grid, 0, 0, s, s, 0x0e1420);
    fillRect(grid, 1, 1, s - 2, s - 2, base);
    const faintNoise = createNoise2D();
    mottle(grid, faintNoise, { color: this._shade(base, 6, 8, 10), threshold: 0.7, scale: 0.3 });
    // Costuras horizontais finas e regulares — acabamento "placa lisa".
    for (const y of [9, 16, 23]) paintOver(grid, 3, y, s - 6, 1, 0x3f6fa8);
    paintOver(grid, 3, 16, s - 6, 1, 0x6fd0ff);
    // Par de luzes-piloto no alto, discretas.
    fillRect(grid, 5, 4, 2, 2, 0x6fd0ff);
    fillRect(grid, s - 7, 4, 2, 2, 0x6fd0ff);
    setPixel(grid, 5, 4, 0xdfffff);
    setPixel(grid, s - 7, 4, 0xdfffff);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x060a12);
    g.generateTexture(key, s, s);
    g.destroy();
  }

  // Parede do Arsenal Blindado — metal industrial arranhado (referência
  // Industrial Cyberpunk): parafusos grandes nos 4 cantos, corrosão e uma
  // faixa de risco diagonal amarelo/preto, bem mais "pesada" que a família.
  generateWallArsenal(key) {
    if (this.textures.exists(key)) return;
    const s = TILE_SIZE;
    const base = 0x2c3a20;
    const grid = createGrid(s, s);
    fillRect(grid, 0, 0, s, s, 0x14190e);
    fillRect(grid, 2, 2, s - 4, s - 4, base);
    const rustNoise = createNoise2D();
    mottle(grid, rustNoise, { color: this._shade(base, -14, -16, -12), threshold: 0.36, scale: 0.5 });
    mottle(grid, rustNoise, { color: 0x6a4020, threshold: 0.68, scale: 0.6, offsetX: 40, offsetY: 18 });
    // Faixa de risco diagonal no canto superior direito.
    for (let i = 0; i < 10; i++) {
      const x = s - 2 - i;
      const y = 2 + i;
      if (x >= 0 && y < s) {
        setPixel(grid, x, y, i % 2 === 0 ? 0xe8b93d : 0x14190e);
        setPixel(grid, x - 1, y, i % 2 === 0 ? 0xe8b93d : 0x14190e);
      }
    }
    // Parafusos grandes nos 4 cantos — mais robustos que a placa da família.
    for (const [cx, cy] of [[5, 5], [s - 6, 5], [5, s - 6], [s - 6, s - 6]]) {
      fillCircle(grid, cx, cy, 3, 0x1a1f12);
      fillCircle(grid, cx, cy, 2, 0x5a6a3a);
      setPixel(grid, cx - 1, cy - 1, 0x9aae5f);
    }
    const g = this.add.graphics();
    renderGrid(g, grid, 0x0a0d07);
    g.generateTexture(key, s, s);
    g.destroy();
  }

  // Parede do Nexo de Transporte — metal escuro com condutores de energia
  // luminosos ramificando pelo painel (referência RASAK, variante "Pipeline"
  // com o roxo/magenta do portal), lê como tecnologia viva, não estática.
  generateWallNexus(key) {
    if (this.textures.exists(key)) return;
    const s = TILE_SIZE;
    const base = 0x241a3c;
    const grid = createGrid(s, s);
    fillRect(grid, 0, 0, s, s, 0x120c20);
    fillRect(grid, 2, 2, s - 4, s - 4, base);
    const nexusNoise = createNoise2D();
    mottle(grid, nexusNoise, { color: this._shade(base, -10, -8, -12), threshold: 0.42, scale: 0.45 });
    mottle(grid, nexusNoise, { color: this._shade(base, 8, 6, 10), threshold: 0.58, scale: 0.45, offsetX: 30, offsetY: 30 });
    // Condutor central vertical com ramificações — não é uma costura reta.
    paintOver(grid, s / 2 - 1, 3, 1, s - 6, 0x8a3dff);
    paintOver(grid, s / 2, 9, 6, 1, 0x8a3dff);
    paintOver(grid, s / 2 - 6, 20, 6, 1, 0x8a3dff);
    setPixel(grid, s / 2 - 1, 9, 0xe0c8ff);
    setPixel(grid, s / 2, 20, 0xe0c8ff);
    setPixel(grid, s / 2 + 5, 9, 0xe0c8ff);
    setPixel(grid, s / 2 - 6, 20, 0xe0c8ff);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x08050f);
    g.generateTexture(key, s, s);
    g.destroy();
  }

  // Parede da Central de Vigilância — banco de monitores embutido na placa:
  // tela verde-sinal com scanlines e uma luz de gravação vermelha, lê como
  // "sala de controle" em vez de porta/painel industrial das outras fases.
  generateWallVigilance(key) {
    if (this.textures.exists(key)) return;
    const s = TILE_SIZE;
    const base = 0x18201e;
    const grid = createGrid(s, s);
    fillRect(grid, 0, 0, s, s, 0x0a0f0e);
    fillRect(grid, 2, 2, s - 4, s - 4, base);
    const vigNoise = createNoise2D();
    mottle(grid, vigNoise, { color: this._shade(base, -8, -8, -6), threshold: 0.42, scale: 0.45 });
    mottle(grid, vigNoise, { color: this._shade(base, 6, 8, 6), threshold: 0.6, scale: 0.45, offsetX: 30, offsetY: 30 });
    // Tela do monitor com scanlines horizontais.
    fillRect(grid, 8, 9, 16, 14, 0x081210);
    for (let y = 11; y < 22; y += 3) paintOver(grid, 9, y, 14, 1, 0x123a2c);
    paintOver(grid, 9, 10, 14, 1, 0x3dffa0);
    paintOver(grid, 9, 20, 14, 1, 0x2a8a5c);
    // Luz de gravação — pequeno ponto vermelho no canto da moldura.
    fillCircle(grid, s - 7, 7, 2, 0xff4a5e);
    setPixel(grid, s - 8, 6, 0xffc2c8);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x040807);
    g.generateTexture(key, s, s);
    g.destroy();
  }

  // Parede do hub do Submundo — rocha úmida crua (não uma placa técnica):
  // manchas de infiltração escorrendo de cima, musgo esparso, sem nenhuma
  // linguagem "tech" (sem moldura/rebite/tela) pra contrastar com todo o
  // resto do jogo até aqui.
  generateWallSubmundo(key) {
    if (this.textures.exists(key)) return;
    const s = TILE_SIZE;
    const base = 0x1c1815;
    const grid = createGrid(s, s);
    fillRect(grid, 0, 0, s, s, 0x0e0b09);
    fillRect(grid, 1, 1, s - 2, s - 2, base);
    const rockNoise = createNoise2D();
    mottle(grid, rockNoise, { color: this._shade(base, -10, -8, -6), threshold: 0.38, scale: 0.55 });
    mottle(grid, rockNoise, { color: this._shade(base, 8, 6, 4), threshold: 0.62, scale: 0.5, offsetX: 40, offsetY: 12 });
    // Escorrimento de infiltração — tiras verticais escuras partindo do topo.
    for (const [x, len] of [[6, 18], [14, 24], [23, 14], [27, 20]]) {
      paintOver(grid, x, 1, 1, len, 0x0f120d);
    }
    // Musgo esparso.
    for (const [x, y] of [[9, 20], [19, 8], [22, 25], [5, 27]]) {
      fillCircle(grid, x, y, 1, 0x3a4a2c);
    }
    // Trincas finas na rocha.
    for (const [x, y] of [[17, 5], [18, 6], [18, 7], [19, 8]]) setPixel(grid, x, y, 0x080a07);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x050403);
    g.generateTexture(key, s, s);
    g.destroy();
  }

  // Parede da Estação Fantasma — azulejo velho de metrô: grade de ladrilhos
  // pequenos com rejunte, alguns quebrados/faltando (vãos escuros), grime
  // por cima. Bem diferente da rocha crua do hub do Submundo.
  generateWallFantasma(key) {
    if (this.textures.exists(key)) return;
    const s = TILE_SIZE;
    const grout = 0x1e2024;
    const tile = 0x2a2d33;
    const grid = createGrid(s, s);
    fillRect(grid, 0, 0, s, s, 0x0c0d10);
    fillRect(grid, 1, 1, s - 2, s - 2, grout);
    for (let y = 2; y < s - 2; y += 6) {
      for (let x = 2; x < s - 2; x += 8) {
        fillRect(grid, x, y, 6, 4, tile);
      }
    }
    const grimeNoise = createNoise2D();
    mottle(grid, grimeNoise, { color: this._shade(tile, -14, -12, -10), threshold: 0.55, scale: 0.4 });
    // Ladrilhos quebrados/faltando — vãos escuros substituindo o azulejo.
    fillRect(grid, 10, 14, 6, 4, 0x0a0b0d);
    fillRect(grid, 18, 20, 6, 4, 0x0a0b0d);
    setPixel(grid, 12, 15, 0x14161a);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x05060a);
    g.generateTexture(key, s, s);
    g.destroy();
  }

  // Porta dupla deslizante com fresta central luminosa e rebites nas folhas.
  generateDoor(key) {
    if (this.textures.exists(key)) return;
    const s = TILE_SIZE;
    const grid = createGrid(s, s);
    fillRect(grid, 0, 0, s, s, 0x0a1c22);
    fillRect(grid, 2, 2, 12, s - 4, 0x123338);
    fillRect(grid, s - 14, 2, 12, s - 4, 0x123338);
    fillRect(grid, s / 2 - 2, 2, 4, s - 4, 0x18e8ff);
    paintOver(grid, s / 2 - 1, 2, 2, s - 4, 0x9fffe8);
    for (const y of [6, s - 10]) {
      setPixel(grid, 5, y, 0x2fb8c8);
      setPixel(grid, s - 6, y, 0x2fb8c8);
    }
    const g = this.add.graphics();
    renderGrid(g, grid, 0x03080a);
    g.generateTexture(key, s, s);
    g.destroy();
  }

  // Porta da Torre de Segurança — painel liso com uma única costura azul
  // brilhante, ecoando o acabamento "sci-fi limpo" da parede da Torre, em
  // vez da porta dupla industrial genérica.
  generateDoorTower(key) {
    if (this.textures.exists(key)) return;
    const s = TILE_SIZE;
    const grid = createGrid(s, s);
    fillRect(grid, 0, 0, s, s, 0x0a1420);
    fillRect(grid, 3, 2, s - 6, s - 4, 0x16283a);
    paintOver(grid, 3, 2, s - 6, 1, 0x4a7aa8);
    paintOver(grid, 3, s - 3, s - 6, 1, 0x4a7aa8);
    for (const y of [7, 14, 21]) paintOver(grid, 5, y, s - 10, 1, 0x2f6f9a);
    fillRect(grid, s / 2 - 1, 3, 2, s - 6, 0x37c8ff);
    paintOver(grid, s / 2 - 1, 3, 1, s - 6, 0xcfffff);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x040810);
    g.generateTexture(key, s, s);
    g.destroy();
  }

  // Porta do Arsenal Blindado — escotilha blindada: faixa de risco no topo/
  // base, roda de trava central e rebites grandes, bem mais "pesada" que uma
  // porta comum, ecoando o metal industrial arranhado da parede do Arsenal.
  generateDoorArsenal(key) {
    if (this.textures.exists(key)) return;
    const s = TILE_SIZE;
    const grid = createGrid(s, s);
    fillRect(grid, 0, 0, s, s, 0x10160c);
    fillRect(grid, 1, 1, s - 2, s - 2, 0x2c3a20);
    for (let x = 1; x < s - 1; x++) {
      if (Math.floor((x + 2) / 3) % 2 === 0) {
        setPixel(grid, x, 2, 0xe8b93d);
        setPixel(grid, x, 3, 0xe8b93d);
        setPixel(grid, x, s - 4, 0xe8b93d);
        setPixel(grid, x, s - 3, 0xe8b93d);
      }
    }
    fillCircle(grid, s / 2, s / 2, 7, 0x1a2412);
    fillCircle(grid, s / 2, s / 2, 5, 0x4a5f32);
    fillCircle(grid, s / 2, s / 2, 2, 0x1a2412);
    for (const deg of [0, 90, 180, 270]) {
      const rad = Phaser.Math.DegToRad(deg);
      setPixel(grid, Math.round(s / 2 + Math.cos(rad) * 7), Math.round(s / 2 + Math.sin(rad) * 7), 0x8fae5f);
    }
    for (const [cx, cy] of [[4, 5], [s - 5, 5], [4, s - 6], [s - 5, s - 6]]) {
      fillCircle(grid, cx, cy, 2, 0x1a2412);
      setPixel(grid, cx - 1, cy - 1, 0x9aae5f);
    }
    const g = this.add.graphics();
    renderGrid(g, grid, 0x080a05);
    g.generateTexture(key, s, s);
    g.destroy();
  }

  // Porta do Nexo de Transporte — arco de portal (anéis concêntricos +
  // núcleo brilhante) em vez de uma porta deslizante, coerente com o tema de
  // teleporte da fase.
  generateDoorNexus(key) {
    if (this.textures.exists(key)) return;
    const s = TILE_SIZE;
    const cx = s / 2;
    const cy = s / 2;
    const grid = createGrid(s, s);
    fillRect(grid, 0, 0, s, s, 0x0c081a);
    fillCircle(grid, cx, cy, 14, 0x2a1a4a);
    fillCircle(grid, cx, cy, 11, 0x8a3dff);
    fillCircle(grid, cx, cy, 8, 0x100a20);
    fillCircle(grid, cx, cy, 4, 0xc9a0ff);
    setPixel(grid, cx, cy, 0xffffff);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x05030c);
    g.generateTexture(key, s, s);
    g.destroy();
  }

  // Porta da Central de Vigilância — um "olho" de câmera grande em vez de
  // fresta/roda/anel, ecoando o tema de vigilância: íris verde-sinal com
  // pupila escura, moldura tipo lente.
  generateDoorVigilance(key) {
    if (this.textures.exists(key)) return;
    const s = TILE_SIZE;
    const cx = s / 2;
    const cy = s / 2;
    const grid = createGrid(s, s);
    fillRect(grid, 0, 0, s, s, 0x0a0f0e);
    fillCircle(grid, cx, cy, 14, 0x18201e);
    fillCircle(grid, cx, cy, 11, 0x081210);
    fillCircle(grid, cx, cy, 8, 0x3dffa0);
    fillCircle(grid, cx, cy, 4, 0x081210);
    setPixel(grid, cx - 2, cy - 2, 0xe0ffe8);
    for (const deg of [30, 150, 270]) {
      const rad = Phaser.Math.DegToRad(deg);
      setPixel(grid, Math.round(cx + Math.cos(rad) * 13), Math.round(cy + Math.sin(rad) * 13), 0x2a8a5c);
    }
    const g = this.add.graphics();
    renderGrid(g, grid, 0x040807);
    g.generateTexture(key, s, s);
    g.destroy();
  }

  // Corpo/pernas comuns às 3 direções do jogador (visto de cima: baixo, cima, lado).
  // `walkFrame` 0 = pose neutra, 1 = perna esquerda avança / direita recua.
  // Tamanho/proporções voltaram ao original (igual aos NPCs) depois que uma
  // versão maior, com manto e brilho permanente, não agradou — o ganho de
  // acabamento fica só na textura (mesmo mottle já usado em chefes/tiles),
  // sem mudar silhueta nem tamanho.
  _buildPlayerBase(walkFrame) {
    const grid = createGrid(16, 22);
    const helmetDark = 0x232a52;
    const helmetLight = 0x3b4270;
    const bodyDark = 0x1c2038;
    const bodyLight = 0x2f3560;
    const shoulder = 0x2f8fe0;
    const leg = 0x101225;
    const bootGlow = 0x18e8ff;

    fillCircle(grid, 8, 6, 5, helmetDark);
    paintOver(grid, 3, 3, 10, 3, helmetLight);

    fillRect(grid, 3, 9, 10, 9, bodyDark);
    paintOver(grid, 5, 10, 6, 3, bodyLight);
    const armorNoise = createNoise2D();
    mottle(grid, armorNoise, { color: this._shade(bodyDark, -8, -8, -6), threshold: 0.42, scale: 0.5 });
    mottle(grid, armorNoise, { color: this._shade(bodyDark, 8, 8, 10), threshold: 0.58, scale: 0.5, offsetX: 20, offsetY: 20 });
    fillRect(grid, 1, 9, 3, 5, shoulder);
    fillRect(grid, 12, 9, 3, 5, shoulder);

    const leftY = walkFrame === 1 ? 17 : 18;
    const rightY = walkFrame === 1 ? 19 : 18;
    fillRect(grid, 5, leftY, 3, 4, leg);
    fillRect(grid, 8, rightY, 3, 4, leg);
    paintOver(grid, 5, leftY + 3, 3, 1, bootGlow);
    paintOver(grid, 8, rightY + 3, 3, 1, bootGlow);

    return grid;
  }

  generatePlayerFrames() {
    const visor = 0x37f0ff;
    const antenna = 0x18e8ff;
    const helmetSeam = 0x171a33;

    // Lote de sprites de teste: se player_down_0 já existe (carregado no
    // preload), o par de frames inteiro (down/up/side × 0/1) veio de lá —
    // pula a geração procedural desses 6 pra não desenhar por cima.
    if (!this.textures.exists('player_down_0')) {
      for (let frame = 0; frame < 2; frame++) {
        const down = this._buildPlayerBase(frame);
        paintOver(down, 3, 6, 10, 2, visor);
        const gDown = this.add.graphics();
        renderGrid(gDown, down);
        gDown.generateTexture(`player_down_${frame}`, 16, 22);
        gDown.destroy();

        const up = this._buildPlayerBase(frame);
        setPixel(up, 7, 0, antenna);
        setPixel(up, 8, 0, antenna);
        paintOver(up, 7, 2, 2, 7, helmetSeam);
        const gUp = this.add.graphics();
        renderGrid(gUp, up);
        gUp.generateTexture(`player_up_${frame}`, 16, 22);
        gUp.destroy();

        const side = this._buildPlayerBase(frame);
        paintOver(side, 10, 6, 2, 2, visor);
        fillRect(side, 13, 11, 2, 1, 0xbfe9ff);
        const gSide = this.add.graphics();
        renderGrid(gSide, side);
        gSide.generateTexture(`player_side_${frame}`, 16, 22);
        gSide.destroy();
      }
    }

    const blade = 0xf2ffff;
    const downAtkPoints = [[13, 10], [14, 9], [14, 8], [15, 7], [15, 6], [15, 5], [15, 4]];
    const sideAtkPoints = [[14, 11], [15, 10], [15, 9], [15, 8], [15, 7], [15, 6]];

    if (!this.textures.exists('player_down_atk')) {
      const downAtk = this._buildPlayerBase(0);
      paintOver(downAtk, 3, 6, 10, 2, visor);
      for (const [x, y] of downAtkPoints) setPixel(downAtk, x, y, blade);
      const gDownAtk = this.add.graphics();
      renderGrid(gDownAtk, downAtk);
      gDownAtk.generateTexture('player_down_atk', 16, 22);
      gDownAtk.destroy();
    }

    if (!this.textures.exists('player_up_atk')) {
      const upAtk = this._buildPlayerBase(0);
      setPixel(upAtk, 7, 0, antenna);
      setPixel(upAtk, 8, 0, antenna);
      paintOver(upAtk, 7, 2, 2, 7, helmetSeam);
      for (const [x, y] of downAtkPoints) setPixel(upAtk, x, y, blade);
      const gUpAtk = this.add.graphics();
      renderGrid(gUpAtk, upAtk);
      gUpAtk.generateTexture('player_up_atk', 16, 22);
      gUpAtk.destroy();
    }

    if (!this.textures.exists('player_side_atk')) {
    const sideAtk = this._buildPlayerBase(0);
      paintOver(sideAtk, 10, 6, 2, 2, visor);
      for (const [x, y] of sideAtkPoints) setPixel(sideAtk, x, y, blade);
      const gSideAtk = this.add.graphics();
      renderGrid(gSideAtk, sideAtk);
      gSideAtk.generateTexture('player_side_atk', 16, 22);
      gSideAtk.destroy();
    }

    // 4 frames de andar quando o lote de sprites trouxe player_<dir>_2/_3
    // (drop-in do MANIFEST); sem eles, cai pros 2 frames de sempre.
    for (const dir of ['down', 'up', 'side']) {
      const frames = [{ key: `player_${dir}_0` }, { key: `player_${dir}_1` }];
      if (this.textures.exists(`player_${dir}_2`)) frames.push({ key: `player_${dir}_2` });
      if (this.textures.exists(`player_${dir}_3`)) frames.push({ key: `player_${dir}_3` });
      this.anims.create({ key: `walk_${dir}`, frames, frameRate: 6, repeat: -1 });
    }
  }

  // Drone hover: casco oval, "olho" central, nadadeiras laterais e brilho de
  // propulsor embaixo — silhueta mais legível que um simples círculo concêntrico.
  generateEnemy() {
    const grid = createGrid(18, 16);
    fillCircle(grid, 9, 7, 6, 0x33101a);
    fillCircle(grid, 9, 7, 4, 0x5c1c2a);
    fillCircle(grid, 9, 7, 2, 0xff3b52);
    setPixel(grid, 7, 5, 0xffb3c0);
    fillRect(grid, 0, 6, 3, 4, 0x7a1f2c);
    fillRect(grid, 15, 6, 3, 4, 0x7a1f2c);
    fillRect(grid, 7, 13, 4, 2, 0xff8a3d);
    const g = this.add.graphics();
    renderGrid(g, grid);
    g.generateTexture('enemy', 18, 16);
    g.destroy();
  }

  // Unidade blindada: base tipo esteira, corte de visor deslocado (fica visível
  // quando o sprite é espelhado) e sensor no topo.
  generateTankEnemy() {
    if (this.textures.exists('enemy_tank')) return;
    const grid = createGrid(22, 20);
    fillRect(grid, 2, 17, 5, 3, 0x1c1d24);
    fillRect(grid, 15, 17, 5, 3, 0x1c1d24);
    fillRect(grid, 2, 3, 18, 14, 0x2a2a33);
    fillRect(grid, 5, 6, 12, 8, 0x44454f);
    fillRect(grid, 13, 9, 4, 2, 0xff3b52);
    setPixel(grid, 13, 9, 0xffb3c0);
    fillRect(grid, 10, 0, 2, 3, 0x8f92a8);
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      fillRect(grid, 11 + dx * 6 - 1, 10 + dy * 4 - 1, 2, 2, 0x1c1d24);
    }
    const g = this.add.graphics();
    renderGrid(g, grid, 0x0c0c11);
    g.generateTexture('enemy_tank', 22, 20);
    g.destroy();
  }

  // Chefe "Guardião Núcleo": base tipo pernas hidráulicas, canhões de ombro
  // (referência ao ataque à distância) e núcleo pulsante central.
  // Chefe "Guardião Núcleo" (Fase 01) — silhueta orgânica em camadas de
  // círculos (não um bloco reto): postura larga e assimétrica, ombro
  // direito com um canhão bem maior que o esquerdo, núcleo exposto por uma
  // brecha na armadura, placas deslocadas em vez de um padrão simétrico.
  generateBoss() {
    if (this.textures.exists('boss')) return;
    const grid = createGrid(44, 42);

    fillCircle(grid, 14, 36, 9, 0x1c0509);
    fillCircle(grid, 30, 36, 9, 0x1c0509);
    paintOver(grid, 6, 33, 32, 3, 0x3a0a0a);

    fillCircle(grid, 22, 22, 17, 0x2a0a12);
    fillCircle(grid, 22, 20, 14, 0x4a1522);
    fillCircle(grid, 22, 18, 10, 0x5a1a28);

    // manchas orgânicas por ruído simplex — quebra o degradê liso das
    // camadas de círculo acima em algo com "sujeira"/corrosão de verdade,
    // no lugar da textura chapada de cor sólida.
    const bossNoise = createNoise2D();
    mottle(grid, bossNoise, { color: 0x350c16, threshold: 0.4, scale: 0.3 });
    mottle(grid, bossNoise, { color: 0x7a2438, threshold: 0.4, scale: 0.3, offsetX: 50, offsetY: 50 });

    // ombro direito — canhão dominante, bem maior que o esquerdo.
    fillCircle(grid, 36, 16, 9, 0x7a1f2c);
    fillCircle(grid, 38, 14, 5, 0x9f2f3f);
    fillCircle(grid, 38, 14, 2, 0xff8a3d);

    // ombro esquerdo — menor, assimétrico.
    fillCircle(grid, 7, 18, 6, 0x5a1520);

    // núcleo pulsante exposto por uma brecha na armadura.
    fillCircle(grid, 20, 20, 7, 0x140308);
    fillCircle(grid, 20, 20, 5, 0xff5a1f);
    fillCircle(grid, 20, 20, 2, 0xffd08a);

    // placas de armadura deslocadas — quebram a silhueta simétrica.
    fillRect(grid, 12, 7, 7, 5, 0x7a1f2c);
    fillRect(grid, 26, 5, 6, 6, 0x5a1520);
    fillRect(grid, 31, 25, 6, 5, 0x7a1f2c);
    fillRect(grid, 7, 27, 5, 6, 0x5a1520);

    const g = this.add.graphics();
    renderGrid(g, grid, 0x140308);
    g.generateTexture('boss', 44, 42);
    g.destroy();
  }

  // Drone da fundição: núcleo incandescente (amarelo-branco) em vez do
  // vermelho dos drones do Setor de Contenção — leitura clara de "outra fase".
  generateFoundryEnemy() {
    if (this.textures.exists('enemy_foundry')) return;
    const grid = createGrid(18, 16);
    fillCircle(grid, 9, 7, 6, 0x1a1010);
    fillCircle(grid, 9, 7, 4, 0x3a1a0a);
    fillCircle(grid, 9, 7, 2, 0xffcf3d);
    setPixel(grid, 7, 5, 0xfff2c2);
    fillRect(grid, 0, 6, 3, 4, 0x2a1006);
    fillRect(grid, 15, 6, 3, 4, 0x2a1006);
    fillRect(grid, 7, 13, 4, 2, 0xff5a1f);
    const g = this.add.graphics();
    renderGrid(g, grid);
    g.generateTexture('enemy_foundry', 18, 16);
    g.destroy();
  }

  // Chefe da Fase 02 "Fundidor Primordial" — silhueta própria, bem diferente
  // do Guardião Núcleo: corpo largo/esguio (não em cruz), chaminés gêmeas
  // soltando brasa no topo, punhos-tambor nas laterais (melee) e uma boca de
  // fornalha central única — a fonte visual da rajada vermelha (em vez dos
  // 4 canhões de ombro simétricos do outro chefe).
  // Chefe "Fundidor Primordial" (Fase 02) — massa orgânica e arredondada
  // (círculos em camada, não um bloco de metal reto), chaminés e punhos
  // assimétricos (tamanhos diferentes), rachaduras incandescentes
  // espalhadas em vez de uma costura reta.
  generateFoundryBoss() {
    if (this.textures.exists('boss_foundry')) return;
    const grid = createGrid(46, 40);

    fillCircle(grid, 14, 34, 9, 0x100304);
    fillCircle(grid, 32, 34, 9, 0x100304);

    fillCircle(grid, 23, 20, 19, 0x1a0508);
    fillCircle(grid, 23, 18, 15, 0x330a10);

    const foundryNoise = createNoise2D();
    mottle(grid, foundryNoise, { color: 0x210609, threshold: 0.4, scale: 0.3 });
    mottle(grid, foundryNoise, { color: 0x4a1218, threshold: 0.4, scale: 0.3, offsetX: 50, offsetY: 50 });

    // rachaduras incandescentes espalhadas pelo corpo.
    for (const [x, y] of [[10, 14], [14, 20], [18, 10], [28, 12], [33, 18], [30, 24], [16, 26], [22, 28]]) {
      fillCircle(grid, x, y, 1, 0xff7a2f);
    }

    // chaminés assimétricas — uma mais alta e mais larga que a outra.
    fillCircle(grid, 11, 6, 5, 0x2a0a0c);
    fillCircle(grid, 11, 2, 3, 0xff9d3d);
    fillCircle(grid, 34, 9, 4, 0x2a0a0c);
    fillCircle(grid, 34, 6, 3, 0xff9d3d);

    // boca de fornalha — grande, arredondada, central.
    fillCircle(grid, 23, 20, 8, 0x0d0304);
    fillCircle(grid, 23, 20, 6, 0xffcf3d);
    fillCircle(grid, 23, 20, 3, 0xffffff);

    // punhos-tambor assimétricos (o direito é visivelmente maior).
    fillCircle(grid, 2, 22, 7, 0x5a1015);
    fillCircle(grid, 44, 24, 8, 0x5a1015);
    fillCircle(grid, 2, 22, 3, 0xff5a1f);
    fillCircle(grid, 44, 24, 3, 0xff5a1f);

    const g = this.add.graphics();
    renderGrid(g, grid, 0x0d0304);
    g.generateTexture('boss_foundry', 46, 40);
    g.destroy();
  }

  // Piso eletrificado (Fase 03) — base escura com trilhas de energia em
  // zigue-zague (cyan/branco), bem diferente da faixa de risco amarela do
  // piso perigoso das fases anteriores, pra ficar claro que é "elétrico".
  generateElectricFloor(key) {
    if (this.textures.exists(key)) return;
    const s = TILE_SIZE;
    const grid = createGrid(s, s);
    fillRect(grid, 0, 0, s, s, 0x0a1420);
    paintOver(grid, 0, 0, s, 2, 0x37f0ff);
    paintOver(grid, 0, s - 2, s, 2, 0x37f0ff);
    const zigzag = [[3, 4], [7, 10], [4, 16], [9, 22], [14, 26], [20, 20], [26, 24], [29, 18], [24, 12], [28, 6]];
    for (const [x, y] of zigzag) {
      setPixel(grid, x, y, 0x9fffff);
      setPixel(grid, x + 1, y, 0xffffff);
    }
    const g = this.add.graphics();
    renderGrid(g, grid, 0x030608);
    g.generateTexture(key, s, s);
    g.destroy();
  }

  // Piso do Distrito Neon (hub da cidade) — asfalto molhado, junta central
  // mais clara sugerindo reflexo de poça, bem diferente do piso "placa
  // industrial" da fábrica.
  generateDistrictFloor(key, base, edge) {
    if (this.textures.exists(key)) return;
    const s = TILE_SIZE;
    const grid = createGrid(s, s);
    fillRect(grid, 0, 0, s, s, base);
    paintOver(grid, 3, 3, s - 6, s - 6, edge);
    paintOver(grid, 6, 6, s - 12, s - 12, base);

    // Grão do asfalto por cima de toda a estrutura da placa (borda + miolo),
    // pra não perder o rebaixo/moldura já desenhados acima.
    const districtNoise = createNoise2D();
    mottle(grid, districtNoise, { color: this._shade(base, -8, -8, -6), threshold: 0.42, scale: 0.42 });
    mottle(grid, districtNoise, { color: this._shade(base, 6, 6, 8), threshold: 0.58, scale: 0.42, offsetX: 30, offsetY: 30 });

    for (const [x, y] of [[5, 5], [s - 6, 5], [5, s - 6], [s - 6, s - 6]]) {
      setPixel(grid, x, y, 0x2a2f3c);
    }
    const g = this.add.graphics();
    renderGrid(g, grid);
    g.generateTexture(key, s, s);
    g.destroy();
  }

  // Variante com poça refletindo neon — usada em pequena proporção pelo
  // TileMap pra quebrar a repetição do asfalto liso.
  generateDistrictPuddle(key, base, edge) {
    if (this.textures.exists(key)) return;
    const s = TILE_SIZE;
    const grid = createGrid(s, s);
    fillRect(grid, 0, 0, s, s, base);
    const puddleNoise = createNoise2D();
    mottle(grid, puddleNoise, { color: this._shade(base, -8, -8, -6), threshold: 0.42, scale: 0.42 });
    mottle(grid, puddleNoise, { color: this._shade(base, 6, 6, 8), threshold: 0.58, scale: 0.42, offsetX: 30, offsetY: 30 });
    fillCircle(grid, s / 2, s / 2 + 2, 10, 0x1c2838);
    fillCircle(grid, s / 2 - 3, s / 2, 3, 0xff5fd0);
    fillCircle(grid, s / 2 + 4, s / 2 + 3, 2, 0x37f0ff);
    const g = this.add.graphics();
    renderGrid(g, grid, edge);
    g.generateTexture(key, s, s);
    g.destroy();
  }

  // Sentinela Elétrica — inimigo novo da Fase 03. Corpo esférico compacto
  // (bem menor/mais arredondado que os drones anteriores), com eletrodos
  // laterais salientes — a silhueta que dispara o pulso de choque em área.
  generateElectricEnemy() {
    if (this.textures.exists('enemy_electric')) return;
    const grid = createGrid(18, 16);
    fillCircle(grid, 9, 8, 6, 0x0a1420);
    fillCircle(grid, 9, 8, 4, 0x163a4a);
    fillCircle(grid, 9, 8, 2, 0x9fffff);
    setPixel(grid, 7, 6, 0xffffff);
    fillRect(grid, 0, 7, 2, 2, 0x37f0ff);
    fillRect(grid, 16, 7, 2, 2, 0x37f0ff);
    fillRect(grid, 8, 14, 3, 2, 0x9fffff);
    const g = this.add.graphics();
    renderGrid(g, grid);
    g.generateTexture('enemy_electric', 18, 16);
    g.destroy();
  }

  // Guardião do Cofre (semi-boss) — chassi de blindado mais largo/alto, com
  // núcleo âmbar no peito (elite, não elétrico) e um "capacete" sensor no
  // topo — maior e mais robusto que o blindado comum das fases anteriores.
  generateMiniBossEnemy() {
    if (this.textures.exists('enemy_miniboss')) return;
    const grid = createGrid(26, 24);
    fillRect(grid, 2, 20, 6, 4, 0x1c1d24);
    fillRect(grid, 18, 20, 6, 4, 0x1c1d24);
    fillRect(grid, 2, 3, 22, 18, 0x2a2a33);
    fillRect(grid, 5, 6, 16, 11, 0x44454f);
    fillRect(grid, 10, 9, 6, 4, 0xffcf3d);
    setPixel(grid, 10, 9, 0xfff2c2);
    fillRect(grid, 11, 0, 4, 4, 0x8f92a8);
    paintOver(grid, 5, 6, 16, 2, 0x5f6270);
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      fillRect(grid, 13 + dx * 8 - 1, 12 + dy * 6 - 1, 2, 2, 0x1c1d24);
    }
    const g = this.add.graphics();
    renderGrid(g, grid, 0x0c0c11);
    g.generateTexture('enemy_miniboss', 26, 24);
    g.destroy();
  }

  // Chefe da Fase 03 "Titã Voltaico" — silhueta bem diferente dos outros
  // dois chefes: sem "pernas" (núcleo flutuante sobre um anel de contenção),
  // alto e estreito em vez de largo, com dois "chifres" tipo bobina de Tesla
  // no topo e arcos elétricos crepitando nas laterais.
  // Chefe "Titã Voltaico" (Fase 03) — núcleo flutuante em camadas
  // circulares, "chifres" tesla assimétricos (tamanhos diferentes) e
  // pequenas esferas-satélite soltas ao redor, soltando a sensação de
  // campo de energia mesmo parado (reforçado pela aura giratória em runtime).
  generateReactorBoss() {
    if (this.textures.exists('boss_reactor')) return;
    const grid = createGrid(42, 44);

    fillCircle(grid, 21, 36, 13, 0x0a1420);
    clearCircle(grid, 21, 36, 10);
    paintOver(grid, 8, 34, 26, 4, 0x18e8ff);

    fillCircle(grid, 21, 22, 15, 0x0a1420);
    fillCircle(grid, 21, 22, 12, 0x162c44);

    const reactorNoise = createNoise2D();
    mottle(grid, reactorNoise, { color: 0x0d1c30, threshold: 0.4, scale: 0.3 });
    mottle(grid, reactorNoise, { color: 0x1e3a58, threshold: 0.4, scale: 0.3, offsetX: 50, offsetY: 50 });

    fillCircle(grid, 21, 22, 7, 0x37f0ff);
    fillCircle(grid, 21, 22, 3, 0xffffff);

    // chifres tesla assimétricos.
    fillCircle(grid, 10, 5, 4, 0x9fffff);
    fillCircle(grid, 32, 8, 3, 0x9fffff);

    // esferas-satélite soltas, em posições/tamanhos irregulares.
    fillCircle(grid, 4, 20, 3, 0x9fffff);
    fillCircle(grid, 38, 26, 3, 0x9fffff);
    fillCircle(grid, 8, 36, 2, 0x9fffff);
    fillCircle(grid, 35, 12, 2, 0x9fffff);

    const g = this.add.graphics();
    renderGrid(g, grid, 0x050a12);
    g.generateTexture('boss_reactor', 42, 44);
    g.destroy();
  }

  // Drone Inibidor — inimigo novo da Fase 04. Corpo facetado (cantos
  // cortados, não um círculo liso) em violeta/magenta, com uma antena
  // saliente no topo — a "arma" que dispara o pulso EMP.
  generateJammerDrone() {
    if (this.textures.exists('enemy_jammer')) return;
    const grid = createGrid(18, 16);
    fillRect(grid, 4, 2, 10, 12, 0x140a1e);
    setPixel(grid, 4, 2, null);
    setPixel(grid, 13, 2, null);
    setPixel(grid, 4, 13, null);
    setPixel(grid, 13, 13, null);
    fillRect(grid, 6, 4, 6, 8, 0x2a1440);
    fillCircle(grid, 9, 8, 3, 0xd88bff);
    setPixel(grid, 8, 6, 0xffe6ff);
    fillRect(grid, 8, 0, 2, 3, 0x2a1440);
    setPixel(grid, 8, 0, 0xff3df0);
    setPixel(grid, 9, 0, 0xff3df0);
    fillRect(grid, 0, 6, 3, 4, 0x3a1f5a);
    fillRect(grid, 15, 6, 3, 4, 0x3a1f5a);
    const g = this.add.graphics();
    renderGrid(g, grid);
    g.generateTexture('enemy_jammer', 18, 16);
    g.destroy();
  }

  // Sentinela de Defesa — turret fraca e estacionária invocada pelo chefe
  // da Fase 04. Silhueta de câmera/torreta compacta, não um drone flutuante.
  generateSentinelTurret() {
    if (this.textures.exists('enemy_sentinel')) return;
    const grid = createGrid(16, 14);
    fillRect(grid, 3, 8, 10, 5, 0x1c1830);
    fillRect(grid, 5, 3, 6, 6, 0x2a2450);
    fillCircle(grid, 8, 6, 3, 0xd88bff);
    setPixel(grid, 7, 5, 0xffe6ff);
    fillRect(grid, 2, 10, 3, 3, 0x120e20);
    fillRect(grid, 11, 10, 3, 3, 0x120e20);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x08050f);
    g.generateTexture('enemy_sentinel', 16, 14);
    g.destroy();
  }

  // Chefe da Fase 04 "Vigia Central" — silhueta de painel/monitor largo com
  // um "olho" de câmera central grande e duas telas menores nas laterais,
  // bem diferente dos três chefes anteriores (nenhuma pernas de tanque,
  // núcleo flutuante, ou fornalha — aqui é um bloco de vigilância).
  // Chefe "Vigia Central" (Fase 04) — redesenhado como um aglomerado de
  // lentes flutuante (olho central grande + 4 lentes-satélite assimétricas
  // em tamanhos/ângulos diferentes), sem nenhum painel/bloco retangular —
  // a versão anterior era um monitor quadrado, esta é só orbes e círculos.
  generateCoreBoss() {
    if (this.textures.exists('boss_core')) return;
    const grid = createGrid(46, 46);

    fillCircle(grid, 23, 25, 17, 0x120e20);
    fillCircle(grid, 23, 25, 13, 0x241a40);

    const coreNoise = createNoise2D();
    mottle(grid, coreNoise, { color: 0x160f28, threshold: 0.4, scale: 0.3 });
    mottle(grid, coreNoise, { color: 0x2e2350, threshold: 0.4, scale: 0.3, offsetX: 50, offsetY: 50 });

    fillCircle(grid, 23, 25, 9, 0x0a0614);
    fillCircle(grid, 23, 25, 6, 0xd88bff);
    fillCircle(grid, 23, 25, 3, 0xffffff);
    setPixel(grid, 20, 22, 0xffe6ff);

    // lentes-satélite assimétricas — tamanhos e posições irregulares.
    fillCircle(grid, 7, 15, 5, 0x1a1330);
    fillCircle(grid, 7, 15, 3, 0x9f5fff);
    fillCircle(grid, 39, 13, 4, 0x1a1330);
    fillCircle(grid, 39, 13, 2, 0x9f5fff);
    fillCircle(grid, 5, 36, 4, 0x1a1330);
    fillCircle(grid, 5, 36, 2, 0x9f5fff);
    fillCircle(grid, 41, 37, 5, 0x1a1330);
    fillCircle(grid, 41, 37, 3, 0x9f5fff);

    // antenas/discos no topo, assimétricos.
    fillCircle(grid, 15, 4, 4, 0xd88bff);
    fillCircle(grid, 32, 2, 3, 0xd88bff);

    const g = this.add.graphics();
    renderGrid(g, grid, 0x08050f);
    g.generateTexture('boss_core', 46, 46);
    g.destroy();
  }

  // Torre de firewall — console/servidor hackeável, uma das 3 espalhadas
  // pela Fase 04. O tint muda em runtime quando hackeada.
  generateFirewallConsole() {
    if (this.textures.exists('prop_console')) return;
    const grid = createGrid(16, 26);
    fillRect(grid, 1, 1, 14, 24, 0x140f24);
    fillRect(grid, 3, 3, 10, 18, 0x241a40);
    for (let y = 5; y < 19; y += 4) {
      paintOver(grid, 4, y, 8, 1, 0x3a2a5a);
      setPixel(grid, 12, y, 0xd88bff);
    }
    fillRect(grid, 4, 21, 8, 2, 0x0d0a18);
    setPixel(grid, 8, 22, 0xff3df0);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x08050f);
    g.generateTexture('prop_console', 16, 26);
    g.destroy();
  }

  // Drone Atirador — inimigo novo da Fase 05. Corpo mais anguloso/compacto
  // que os drones anteriores, com um "cano" saliente na frente e paleta
  // azul-branco de segurança (bem diferente dos vermelhos/âmbares/violetas
  // das fases anteriores).
  generateShooterDrone() {
    if (this.textures.exists('enemy_shooter')) return;
    const grid = createGrid(18, 16);
    fillCircle(grid, 9, 8, 6, 0x0c1420);
    fillCircle(grid, 9, 8, 4, 0x1c3a5a);
    fillCircle(grid, 9, 8, 2, 0x9fd0ff);
    setPixel(grid, 7, 6, 0xffffff);
    fillRect(grid, 14, 7, 5, 2, 0x2a4a6a);
    setPixel(grid, 18, 7, 0x9fd0ff);
    fillRect(grid, 0, 6, 3, 4, 0x2a3a4a);
    fillRect(grid, 7, 13, 4, 2, 0x4a90d9);
    const g = this.add.graphics();
    renderGrid(g, grid);
    g.generateTexture('enemy_shooter', 18, 16);
    g.destroy();
  }

  // Chefe da Fase 05 "Curador Supremo" — relíquia flutuante com anéis
  // giroscópicos ao redor de um núcleo central, paleta azul/branco/dourado
  // (autoridade/segurança do cofre) — silhueta bem diferente dos outros
  // quatro chefes (sem torso/corpo humanoide algum, só anéis e núcleo).
  // Chefe "Curador Supremo" (Fase 05) — dois anéis giroscópicos (maiores
  // que antes, com espessuras levemente diferentes pra não ficar
  // perfeitamente simétrico) ao redor de um núcleo, mais motas soltas
  // orbitando — sensação de relíquia flutuante, sem nenhum bloco reto.
  generateCuratorBoss() {
    if (this.textures.exists('boss_curator')) return;
    const grid = createGrid(44, 44);

    // anel externo (grosso, horizontal).
    fillRect(grid, 1, 18, 42, 7, 0x0a1420);
    paintOver(grid, 1, 18, 42, 1, 0x8fc9ff);
    paintOver(grid, 1, 24, 42, 1, 0x8fc9ff);
    clearCircle(grid, 22, 22, 17);
    fillRect(grid, 1, 19, 42, 5, 0x162c44);
    clearCircle(grid, 22, 22, 16);

    const curatorNoise = createNoise2D();
    mottle(grid, curatorNoise, { color: 0x0d1c30, threshold: 0.42, scale: 0.35 });
    mottle(grid, curatorNoise, { color: 0x2a4a6a, threshold: 0.42, scale: 0.35, offsetX: 50, offsetY: 50 });

    // anel interno (vertical, mais fino).
    fillRect(grid, 18, 1, 8, 42, 0x0a1420);
    paintOver(grid, 18, 1, 1, 42, 0xffd27a);
    paintOver(grid, 25, 1, 1, 42, 0xffd27a);
    clearCircle(grid, 22, 22, 17);
    fillRect(grid, 19, 1, 6, 42, 0x241a40);
    clearCircle(grid, 22, 22, 16);

    mottle(grid, curatorNoise, { color: 0x160f28, threshold: 0.42, scale: 0.35, offsetX: 100 });
    mottle(grid, curatorNoise, { color: 0x3a2a5a, threshold: 0.42, scale: 0.35, offsetX: 150, offsetY: 50 });

    // núcleo central.
    fillCircle(grid, 22, 22, 8, 0x0a0614);
    fillCircle(grid, 22, 22, 5, 0x8fc9ff);
    fillCircle(grid, 22, 22, 2, 0xffffff);

    // motas soltas orbitando, assimétricas.
    fillCircle(grid, 4, 8, 2, 0xffd27a);
    fillCircle(grid, 40, 36, 2, 0x8fc9ff);
    fillCircle(grid, 6, 38, 2, 0x8fc9ff);

    const g = this.add.graphics();
    renderGrid(g, grid, 0x05080f);
    g.generateTexture('boss_curator', 44, 44);
    g.destroy();
  }

  // Chefe da Fase 06 "Tanque de Cerco" — o design mais diferente de todos:
  // silhueta larga e BAIXA (veículo, não criatura/relíquia), esteiras,
  // torre giratória com canhão comprido, detalhes assimétricos (antena de
  // um lado, chaminé do outro, faróis de tamanhos diferentes) e uma faixa
  // de risco no casco puxando a mesma linguagem visual do piso de perigo.
  generateTankBoss() {
    if (this.textures.exists('boss_tank')) return;
    const w = 56;
    const h = 44;
    const grid = createGrid(w, h);
    const trackDark = 0x1c2418;
    const trackMid = 0x2c3a20;
    const hullBase = 0x3a4a2a;
    const hullLight = 0x4a5a38;
    const turretBase = 0x445536;
    const turretLight = 0x566a44;
    const barrelDark = 0x232b18;

    // esteiras.
    fillRect(grid, 1, 6, 8, 32, trackDark);
    fillRect(grid, 47, 6, 8, 32, trackDark);
    for (let y = 8; y < 36; y += 5) {
      paintOver(grid, 2, y, 6, 1, trackMid);
      paintOver(grid, 48, y, 6, 1, trackMid);
    }

    // casco, com desgaste por ruído (mesmo acabamento dos outros chefes).
    fillRect(grid, 9, 8, 38, 28, hullBase);
    paintOver(grid, 9, 8, 38, 4, hullLight);
    const hullNoise = createNoise2D();
    const hullRegion = { x0: 9, y0: 8, w: 38, h: 28 };
    mottle(grid, hullNoise, { color: this._shade(hullBase, -14, -14, -10), threshold: 0.42, scale: 0.24, region: hullRegion });
    mottle(grid, hullNoise, { color: this._shade(hullBase, 14, 14, 10), threshold: 0.58, scale: 0.24, offsetX: 30, offsetY: 30, region: hullRegion });

    // faixa de risco num canto do casco — mesma linguagem do piso de perigo.
    for (let i = 0; i < 3; i++) {
      fillRect(grid, 11 + i * 4, 30, 3, 4, i % 2 === 0 ? 0xe8b93d : 0x18161a);
    }

    // torre giratória centralizada, com "olho" sensor no meio.
    fillCircle(grid, 28, 20, 12, turretBase);
    paintOver(grid, 20, 12, 16, 5, turretLight);
    fillCircle(grid, 28, 20, 4, 0x232b18);
    fillCircle(grid, 28, 20, 2, 0x9fff6a);

    // cano comprido saindo da torre.
    fillRect(grid, 25, 0, 6, 14, barrelDark);
    setPixel(grid, 25, 0, 0x4a5a38);
    setPixel(grid, 30, 0, 0x4a5a38);

    // detalhes assimétricos — antena de um lado, chaminé de exaustão do outro.
    fillRect(grid, 40, 5, 2, 10, 0x1c2418);
    setPixel(grid, 40, 4, 0x9fff6a);
    fillCircle(grid, 16, 9, 3, 0x2a2015);
    setPixel(grid, 16, 7, 0xff8a3d);

    // faróis assimétricos (tamanhos diferentes) na base do casco.
    fillCircle(grid, 20, 35, 2, 0xfff2c2);
    setPixel(grid, 35, 35, 0xfff2c2);

    const g2 = this.add.graphics();
    renderGrid(g2, grid, 0x0a0d08);
    g2.generateTexture('boss_tank', w, h);
    g2.destroy();
  }

  // Saltador de Fase — inimigo novo da Fase 07. Silhueta fragmentada de
  // propósito (blocos soltos ao redor de um núcleo, não um corpo sólido
  // contínuo como todos os inimigos anteriores) — vende a ideia de "não
  // está totalmente presente neste plano" antes mesmo dele piscar.
  generatePhaseJumperEnemy() {
    if (this.textures.exists('enemy_phasejumper')) return;
    const grid = createGrid(18, 18);
    fillRect(grid, 6, 6, 6, 6, 0x1a0e2a);
    fillCircle(grid, 9, 9, 3, 0xff5fd0);
    fillCircle(grid, 9, 9, 1, 0xffffff);
    fillRect(grid, 1, 2, 3, 3, 0x2a1740);
    fillRect(grid, 14, 1, 3, 4, 0x2a1740);
    fillRect(grid, 2, 13, 4, 3, 0x2a1740);
    fillRect(grid, 13, 14, 3, 3, 0x2a1740);
    setPixel(grid, 2, 3, 0x37f0ff);
    setPixel(grid, 15, 2, 0x37f0ff);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x0a0614);
    g.generateTexture('enemy_phasejumper', 18, 18);
    g.destroy();
  }

  // Guardião do Nexo (mini-boss da Fase 07) — um anel de portal vivo em vez
  // de um chassi blindado (diferente do Guardião do Cofre genérico): halo
  // aberto no meio, núcleo brilhante, marcas assimétricas no anel e dois
  // "braços" angulares quebrando a silhueta de disco perfeito.
  generatePortalGuardianEnemy() {
    if (this.textures.exists('enemy_portalguardian')) return;
    const s = 30;
    const c = s / 2;
    const grid = createGrid(s, s);
    fillCircle(grid, c, c, 14, 0x1a0e2a);
    clearCircle(grid, c, c, 12);
    fillCircle(grid, c, c, 10, 0x2a1a40);
    fillCircle(grid, c, c, 6, 0xff5fd0);
    fillCircle(grid, c, c, 3, 0xffffff);
    for (const deg of [30, 130, 210, 300]) {
      const rad = Phaser.Math.DegToRad(deg);
      const bx = Math.round(c + Math.cos(rad) * 13);
      const by = Math.round(c + Math.sin(rad) * 13);
      fillCircle(grid, bx, by, 2, 0x37f0ff);
    }
    fillRect(grid, 0, 13, 6, 4, 0x2a1a40);
    fillRect(grid, 24, 15, 6, 3, 0x2a1a40);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x08050f);
    g.generateTexture('enemy_portalguardian', s, s);
    g.destroy();
  }

  // Chefe final da Fase 07 "O Roteador" — o design mais diferente de todos:
  // nenhuma perna, chassi ou núcleo circular como os seis chefes anteriores.
  // Um losango facetado (objeto geométrico abstrato, sem "rosto") com 3
  // satélites quadrados orbitando em raios/ângulos assimétricos — e, ao
  // contrário dos orbes decorativos do Vigia/Titã, cada satélite atira de
  // verdade na luta (ver RouterBoss.js).
  generateRouterBoss() {
    if (this.textures.exists('boss_router')) return;
    const w = 56;
    const h = 56;
    const cx = w / 2;
    const cy = h / 2;
    const coreDark = 0x0a1420;
    const coreBase = 0x14283a;
    const coreLight = 0x2a4a68;
    const accent = 0x37f0ff;
    const accent2 = 0xff5fd0;
    const grid = createGrid(w, h);

    const R = 17;
    for (let dy = -R; dy <= R; dy++) {
      const width = R - Math.abs(dy);
      fillRect(grid, cx - width, cy + dy, width * 2, 1, coreDark);
    }
    const R2 = 13;
    for (let dy = -R2; dy <= R2; dy++) {
      const width = R2 - Math.abs(dy);
      fillRect(grid, cx - width, cy + dy, width * 2, 1, coreBase);
    }

    const routerNoise = createNoise2D();
    mottle(grid, routerNoise, { color: coreLight, threshold: 0.55, scale: 0.28, region: { x0: cx - R2, y0: cy - R2, w: R2 * 2, h: R2 * 2 } });

    fillCircle(grid, cx, cy, 6, accent);
    fillCircle(grid, cx, cy, 3, 0xffffff);

    for (const deg of [20, 100, 190, 300]) {
      const rad = Phaser.Math.DegToRad(deg);
      const bx = Math.round(cx + Math.cos(rad) * (R - 2));
      const by = Math.round(cy + Math.sin(rad) * (R - 2));
      setPixel(grid, bx, by, accent);
    }

    const sats = [{ deg: 40, r: 24 }, { deg: 190, r: 22 }, { deg: 290, r: 26 }];
    for (const { deg, r } of sats) {
      const rad = Phaser.Math.DegToRad(deg);
      const sx = Math.round(cx + Math.cos(rad) * r);
      const sy = Math.round(cy + Math.sin(rad) * r);
      fillRect(grid, sx - 3, sy - 3, 6, 6, coreBase);
      fillRect(grid, sx - 1, sy - 1, 2, 2, accent2);
    }

    const g = this.add.graphics();
    renderGrid(g, grid, 0x05060c);
    g.generateTexture('boss_router', w, h);
    g.destroy();
  }

  // Placa da Sala de Sequência — painel numerado (o número é desenhado em
  // runtime via Text por cima). Apagada/acesa agora são DUAS texturas com
  // cores realmente diferentes (vermelho-morto vs ciano-aceso), trocadas via
  // setTexture — antes era a mesma cor escura só com/sem tint, e ficava
  // ilegível contra o piso escuro (mais ainda com o jogador em cima).
  generateSequenceTile() {
    if (this.textures.exists('tile_sequence_off')) return;
    const s = TILE_SIZE;
    const frame = 0x3a4050;
    const panelBg = 0x0d0f16;

    const off = createGrid(s, s);
    fillRect(off, 1, 1, s - 2, s - 2, frame);
    fillRect(off, 3, 3, s - 6, s - 6, panelBg);
    fillCircle(off, s / 2, s / 2, 8, 0x4a2020);
    const gOff = this.add.graphics();
    renderGrid(gOff, off, 0x05060a);
    gOff.generateTexture('tile_sequence_off', s, s);
    gOff.destroy();

    const on = createGrid(s, s);
    fillRect(on, 1, 1, s - 2, s - 2, frame);
    fillRect(on, 3, 3, s - 6, s - 6, panelBg);
    fillCircle(on, s / 2, s / 2, 9, 0x9fffe8);
    fillCircle(on, s / 2, s / 2, 5, 0xffffff);
    const gOn = this.add.graphics();
    renderGrid(gOn, on, 0x05060a);
    gOn.generateTexture('tile_sequence_on', s, s);
    gOn.destroy();
  }

  // Célula da Sala de Circuito (puzzle "apaga-liga") — mesma lógica de duas
  // texturas com cor realmente diferente por estado (trilha vermelho-morta
  // vs ciano-acesa com núcleo branco), em vez de tint sobre a mesma base
  // escura. A TownScene/TowerScene ainda soma um brilho ADD por cima (ver
  // `tile.glow`), pra dar pra ler o estado mesmo com o jogador em cima da célula.
  generateCircuitTile() {
    if (this.textures.exists('tile_circuit_off')) return;
    const s = TILE_SIZE;
    const frame = 0x3a4050;
    const panelBg = 0x0d0f16;

    const off = createGrid(s, s);
    fillRect(off, 1, 1, s - 2, s - 2, frame);
    fillRect(off, 3, 3, s - 6, s - 6, panelBg);
    paintOver(off, 3, s / 2 - 1, s - 6, 2, 0x5a2020);
    paintOver(off, s / 2 - 1, 3, 2, s - 6, 0x5a2020);
    fillCircle(off, s / 2, s / 2, 4, 0x6a2828);
    const gOff = this.add.graphics();
    renderGrid(gOff, off, 0x05060a);
    gOff.generateTexture('tile_circuit_off', s, s);
    gOff.destroy();

    const on = createGrid(s, s);
    fillRect(on, 1, 1, s - 2, s - 2, frame);
    fillRect(on, 3, 3, s - 6, s - 6, panelBg);
    paintOver(on, 3, s / 2 - 1, s - 6, 2, 0x9fffe8);
    paintOver(on, s / 2 - 1, 3, 2, s - 6, 0x9fffe8);
    fillCircle(on, s / 2, s / 2, 5, 0xffffff);
    fillCircle(on, s / 2, s / 2, 3, 0x9fffe8);
    const gOn = this.add.graphics();
    renderGrid(gOn, on, 0x05060a);
    gOn.generateTexture('tile_circuit_on', s, s);
    gOn.destroy();
  }

  // Armadilha de espinhos do Corredor de Armadilhas (Fase 06) — cicla
  // sozinha (independente do jogador, ver ArsenalScene), por isso são TRÊS
  // estados bem diferentes (não só dois): retraída (sem aviso nenhum),
  // erguendo (aviso âmbar, ainda dá tempo de sair) e erguida (vermelho vivo,
  // machuca).
  generateTrapTile() {
    if (this.textures.exists('trap_off')) return;
    const s = TILE_SIZE;
    const frame = 0x2c3a20;
    const plateBg = 0x0d0f16;
    const spots = [[8, 8], [16, 8], [24, 8], [8, 16], [16, 16], [24, 16], [8, 24], [16, 24], [24, 24]];

    const off = createGrid(s, s);
    fillRect(off, 1, 1, s - 2, s - 2, frame);
    fillRect(off, 3, 3, s - 6, s - 6, plateBg);
    for (const [x, y] of spots) fillRect(off, x - 1, y - 1, 3, 3, 0x1c1f28);
    const gOff = this.add.graphics();
    renderGrid(gOff, off, 0x05060a);
    gOff.generateTexture('trap_off', s, s);
    gOff.destroy();

    const warn = createGrid(s, s);
    fillRect(warn, 1, 1, s - 2, s - 2, frame);
    fillRect(warn, 3, 3, s - 6, s - 6, plateBg);
    for (const [x, y] of spots) {
      fillRect(warn, x - 1, y - 1, 3, 3, 0x5a4a10);
      setPixel(warn, x, y, 0xffcf3d);
    }
    const gWarn = this.add.graphics();
    renderGrid(gWarn, warn, 0x05060a);
    gWarn.generateTexture('trap_warn', s, s);
    gWarn.destroy();

    const on = createGrid(s, s);
    fillRect(on, 1, 1, s - 2, s - 2, frame);
    fillRect(on, 3, 3, s - 6, s - 6, plateBg);
    for (const [x, y] of spots) {
      fillCircle(on, x, y, 2, 0xff3b52);
      setPixel(on, x, y - 1, 0xffe9ec);
    }
    const gOn = this.add.graphics();
    renderGrid(gOn, on, 0x05060a);
    gOn.generateTexture('trap_on', s, s);
    gOn.destroy();
  }

  // Sentinela de Varredura (inimigo novo, Fase 08) — câmera-torre
  // estacionária: cúpula sobre uma base fixa, lente central verde-sinal (a
  // mesma cor do feixe giratório desenhado em runtime) e uma luz de
  // gravação vermelha no topo, reaproveitando o mesmo vocabulário visual da
  // parede/porta da fase.
  generateSentrySentinelEnemy() {
    if (this.textures.exists('enemy_sentry')) return;
    const w = 18;
    const h = 18;
    const grid = createGrid(w, h);
    const mount = 0x1c2230;
    const dome = 0x232c38;

    fillRect(grid, 2, 13, 14, 4, mount);
    fillRect(grid, 0, 8, 3, 4, mount);
    fillRect(grid, 15, 8, 3, 4, mount);
    fillCircle(grid, 9, 8, 7, dome);
    fillCircle(grid, 9, 8, 5, 0x0a120f);
    fillCircle(grid, 9, 8, 3, 0x3dffa0);
    setPixel(grid, 7, 6, 0xe0ffe8);
    fillCircle(grid, 14, 3, 1, 0xff4a5e);

    const g = this.add.graphics();
    renderGrid(g, grid, 0x05080a);
    g.generateTexture('enemy_sentry', w, h);
    g.destroy();
  }

  // Painel da Sala de Sinal (Fase 08) — visual de "tela de monitor" (não um
  // botão numerado nem um cristal, pra não se confundir com os puzzles já
  // reaproveitados nas outras fases), com a mesma luz de gravação vermelha
  // usada na parede/porta/inimigo da fase.
  generateSignalTile() {
    if (this.textures.exists('tile_signal_off')) return;
    const s = TILE_SIZE;
    const frame = 0x3a4050;
    const panelBg = 0x0d0f16;

    const off = createGrid(s, s);
    fillRect(off, 1, 1, s - 2, s - 2, frame);
    fillRect(off, 3, 3, s - 6, s - 6, panelBg);
    fillRect(off, 8, 10, 16, 12, 0x081210);
    paintOver(off, 9, 14, 14, 1, 0x0f1a16);
    fillCircle(off, 22, 20, 1, 0x2a2f3c);
    const gOff = this.add.graphics();
    renderGrid(gOff, off, 0x05060a);
    gOff.generateTexture('tile_signal_off', s, s);
    gOff.destroy();

    const on = createGrid(s, s);
    fillRect(on, 1, 1, s - 2, s - 2, frame);
    fillRect(on, 3, 3, s - 6, s - 6, panelBg);
    fillRect(on, 8, 10, 16, 12, 0x0d3a28);
    fillRect(on, 9, 11, 14, 10, 0x3dffa0);
    setPixel(on, 10, 12, 0xffffff);
    fillCircle(on, 22, 20, 1, 0xff4a5e);
    const gOn = this.add.graphics();
    renderGrid(gOn, on, 0x05060a);
    gOn.generateTexture('tile_signal_on', s, s);
    gOn.destroy();
  }

  // Confronto final da Fase 08 "A Emissora" — construto abstrato (não
  // criatura/veículo, como O Roteador antes dela), corpo em losango com uma
  // íris central verde-sinal e duas antenas no topo (em vez dos satélites do
  // Roteador — aqui a "invocação" é a mecânica, não um disparo orbital).
  generateEmissoraBoss() {
    if (this.textures.exists('boss_emissora')) return;
    const w = 56;
    const h = 56;
    const cx = w / 2;
    const cy = h / 2;
    const coreDark = 0x0a1810;
    const coreBase = 0x14241c;
    const coreLight = 0x1e3a2c;
    const accent = 0x3dffa0;
    const grid = createGrid(w, h);

    const R = 17;
    for (let dy = -R; dy <= R; dy++) {
      const width = R - Math.abs(dy);
      fillRect(grid, cx - width, cy + dy, width * 2, 1, coreDark);
    }
    const R2 = 13;
    for (let dy = -R2; dy <= R2; dy++) {
      const width = R2 - Math.abs(dy);
      fillRect(grid, cx - width, cy + dy, width * 2, 1, coreBase);
    }

    const emissoraNoise = createNoise2D();
    mottle(grid, emissoraNoise, { color: coreLight, threshold: 0.55, scale: 0.28, region: { x0: cx - R2, y0: cy - R2, w: R2 * 2, h: R2 * 2 } });

    fillCircle(grid, cx, cy, 6, accent);
    fillCircle(grid, cx, cy, 3, 0xffffff);

    for (const deg of [20, 100, 190, 300]) {
      const rad = Phaser.Math.DegToRad(deg);
      const bx = Math.round(cx + Math.cos(rad) * (R - 2));
      const by = Math.round(cy + Math.sin(rad) * (R - 2));
      setPixel(grid, bx, by, accent);
    }

    // Antenas no topo — leem como "transmissão/invocação", não disparo.
    for (const dx of [-6, 6]) {
      fillRect(grid, cx + dx - 1, cy - R - 9, 2, 9, coreBase);
      fillRect(grid, cx + dx - 1, cy - R - 11, 2, 2, accent);
    }

    // Luz de gravação — mesmo acento vermelho da parede/porta/inimigo da fase.
    fillCircle(grid, cx + R - 5, cy - R + 5, 2, 0xff4a5e);
    setPixel(grid, cx + R - 6, cy - R + 4, 0xffc2c8);

    const g = this.add.graphics();
    renderGrid(g, grid, 0x05060c);
    g.generateTexture('boss_emissora', w, h);
    g.destroy();
  }

  // Morador dos Túneis (inimigo novo, Fase 09) — figura encapuzada e
  // esfarrapada, silhueta humanoide magra e irregular (bainha do manto em
  // degraus, não uma borda reta), bem diferente dos drones geométricos das
  // fases anteriores. Olhos acesos são a única cor viva na silhueta escura.
  generateDwellerEnemy() {
    if (this.textures.exists('enemy_dweller')) return;
    const w = 16;
    const h = 20;
    const grid = createGrid(w, h);
    const cloth = 0x1c1a16;
    const clothLight = 0x2c281f;
    const eyes = 0xdfffb0;

    fillCircle(grid, 8, 6, 5, cloth);
    paintOver(grid, 4, 3, 8, 3, clothLight);
    setPixel(grid, 6, 7, eyes);
    setPixel(grid, 10, 7, eyes);

    fillRect(grid, 3, 10, 10, 7, cloth);
    paintOver(grid, 4, 11, 4, 3, clothLight);
    fillRect(grid, 0, 11, 3, 6, cloth);
    fillRect(grid, 13, 11, 3, 6, cloth);

    // Bainha esfarrapada — degraus em vez de uma borda reta.
    fillRect(grid, 3, 17, 3, 2, cloth);
    fillRect(grid, 7, 17, 2, 3, cloth);
    fillRect(grid, 11, 17, 2, 2, cloth);

    const g = this.add.graphics();
    renderGrid(g, grid, 0x05060a);
    g.generateTexture('enemy_dweller', w, h);
    g.destroy();
  }

  // Contrabandista do Mercado — inimigo comum da Fase 10. Primeiro inimigo
  // comum do jogo com silhueta claramente HUMANA (não drone/robô): mercenário
  // encapuzado, jaqueta de couro remendada, óculos âmbar brilhando por baixo
  // do capuz e uma lâmina curta na mão — a estética "contrabandista armado"
  // do Mercado Negro, bem diferente de qualquer casco/hull anterior.
  generateMarketMilitia() {
    if (this.textures.exists('enemy_smuggler')) return;
    const w = 16;
    const h = 20;
    const grid = createGrid(w, h);
    const hood = 0x2a2018;
    const hoodLight = 0x3a2c1e;
    const jacket = 0x3a2418;
    const jacketLight = 0x4a3020;
    const eyes = 0xe8b93d;
    const blade = 0xd8d8dc;

    fillCircle(grid, 8, 5, 4, hood);
    paintOver(grid, 4, 2, 8, 3, hoodLight);
    setPixel(grid, 6, 6, eyes);
    setPixel(grid, 10, 6, eyes);

    fillRect(grid, 3, 9, 10, 8, jacket);
    paintOver(grid, 4, 10, 6, 3, jacketLight);
    fillRect(grid, 1, 9, 3, 5, jacket);
    fillRect(grid, 12, 9, 3, 5, jacket);

    // Lâmina curta na mão direita — silhueta reconhecível mesmo pequena.
    fillRect(grid, 13, 8, 1, 6, blade);
    setPixel(grid, 13, 7, blade);

    fillRect(grid, 4, 17, 3, 3, hood);
    fillRect(grid, 9, 17, 3, 3, hood);

    const g2 = this.add.graphics();
    renderGrid(g2, grid, 0x0a0704);
    g2.generateTexture('enemy_smuggler', w, h);
    g2.destroy();
  }

  // Enforcer do Mercado — miliciano mais largo (20×20) que o contrabandista,
  // viseira em barra e caixa no braço. Fallback se o pacote não trouxer
  // `enemy_enforcer`. Substitui o reaproveitamento de `enemy_tank` na Fase 10.
  generateMarketEnforcer() {
    if (this.textures.exists('enemy_enforcer')) return;
    const w = 20;
    const h = 20;
    const grid = createGrid(w, h);
    const hood = 0x2a2018;
    const jacket = 0x3a2418;
    const jacketLight = 0x4a3020;
    const visor = 0xff5fd0;
    const crate = 0xc9a06a;
    const staff = 0x8a8a90;

    fillCircle(grid, 10, 5, 5, hood);
    fillRect(grid, 6, 5, 8, 2, visor);
    setPixel(grid, 7, 5, 0xffb3ea);

    fillRect(grid, 4, 10, 12, 7, jacket);
    paintOver(grid, 5, 11, 6, 3, jacketLight);

    fillRect(grid, 0, 11, 4, 5, crate);
    setPixel(grid, 2, 13, 0x8a6a4a);
    fillRect(grid, 16, 4, 3, 12, staff);
    setPixel(grid, 17, 4, 0xe8b93d);

    fillRect(grid, 5, 17, 4, 3, hood);
    fillRect(grid, 11, 17, 4, 3, hood);

    const g = this.add.graphics();
    renderGrid(g, grid, 0x0a0704);
    g.generateTexture('enemy_enforcer', w, h);
    g.destroy();
  }

  // Capataz do Mercado — sub-chefe da Fase 10. Silhueta HUMANA própria (não
  // o "enemy_miniboss" mecânico genérico reaproveitado por 4 outras fases):
  // um leão-de-chácara maior/mais largo que o Miliciano comum, braços à
  // mostra (sem casaco, ao contrário do Barão), máscara de solda com uma
  // fresta âmbar horizontal (diferente da viseira retangular do Barão e dos
  // olhos redondos do Miliciano) e uma corrente enrolada no punho — reforça
  // a hierarquia visual "capanga do Barão", com menos dourado que o chefe.
  generateCapatazMiniBoss() {
    if (this.textures.exists('enemy_capataz')) return;
    const w = 24;
    const h = 28;
    const grid = createGrid(w, h);
    const vest = 0x2c2018;
    const vestLight = 0x3c2c1e;
    const skin = 0x7a5a42;
    const skinLight = 0x8f6c50;
    const mask = 0x14100c;
    const visor = 0xe8b93d;
    const chain = 0x8a8a90;
    const stud = 0xc9a06a;

    // Máscara de solda com fresta única.
    fillCircle(grid, 12, 6, 6, mask);
    fillRect(grid, 6, 5, 12, 2, visor);
    setPixel(grid, 7, 5, 0xffe6a0);

    // Torso largo, sem casaco — colete de couro com tachas.
    fillRect(grid, 5, 12, 14, 12, vest);
    paintOver(grid, 6, 13, 8, 3, vestLight);
    for (const [x, y] of [[7, 15], [16, 15], [7, 20], [16, 20]]) setPixel(grid, x, y, stud);

    // Braços à mostra, musculosos.
    fillRect(grid, 0, 12, 5, 9, skin);
    paintOver(grid, 0, 12, 2, 9, skinLight);
    fillRect(grid, 19, 12, 5, 9, skin);
    paintOver(grid, 19, 12, 2, 9, skinLight);

    // Corrente enrolada no punho direito.
    for (const [x, y] of [[20, 21], [21, 22], [20, 23], [21, 24]]) setPixel(grid, x, y, chain);

    // Pernas/botas pesadas.
    fillRect(grid, 6, 24, 5, 4, mask);
    fillRect(grid, 13, 24, 5, 4, mask);

    const g3 = this.add.graphics();
    renderGrid(g3, grid, 0x0a0704);
    g3.generateTexture('enemy_capataz', w, h);
    g3.destroy();
  }

  // Confronto final da Fase 09 "O Trem Fantasma" — núcleo esférico
  // espectral (não um losango/octógono como os construtos anteriores),
  // pálido/translúcido na paleta, com dois faróis e marcas de janela
  // sugerindo "trem" sem precisar de uma silhueta lateral que exigisse
  // rotação por direção (a investida dele é só horizontal/vertical).
  // Confronto final da Fase 09 "O Trem Fantasma" — agora É uma locomotiva de
  // verdade (nariz arredondado, cabine com janelas, para-choque, chaminé com
  // fumaça esgarçada, rodas), não mais um orbe abstrato. Desenhada virada
  // pra DIREITA por padrão — GhostTrainBoss.js espelha/rotaciona o sprite em
  // runtime conforme o eixo da investida, então só precisa existir numa
  // orientação. A borda esquerda (traseira) é desenhada em pontilhado
  // (não uma linha reta) pra ela ler como "esgarçando no nada", reforçando
  // que é um fantasma, não um trem sólido comum.
  generateGhostTrainBoss() {
    if (this.textures.exists('boss_ghosttrain')) return;
    const w = 72;
    const h = 40;
    const coreBase = 0x38424e;
    const coreLight = 0x5a6672;
    const hull = 0x2a323c;
    const trim = 0x0e1216;
    const accent = 0xcfd6e0;
    const accent2 = 0x9fb0d0;
    const grid = createGrid(w, h);

    // Cabine/corpo principal.
    fillRect(grid, 6, 10, 47, 20, coreBase);
    // Nariz arredondado — funde com a borda direita do corpo.
    fillCircle(grid, 51, 20, 10, coreBase);

    const trainNoise = createNoise2D();
    mottle(grid, trainNoise, { color: coreLight, threshold: 0.52, scale: 0.3, region: { x0: 6, y0: 10, w: 55, h: 20 } });
    paintOver(grid, 6, 10, 47, 2, coreLight);

    // Traseira esgarçada — pontilhado em vez de uma borda reta, lê como
    // "dissolvendo no nada" (só essa fase tem esse acabamento).
    for (let y = 10; y < 30; y++) {
      for (let x = 0; x < 7; x++) {
        if ((x * 3 + y * 2) % 5 === 0) setPixel(grid, x, y, coreBase);
      }
    }

    // Janelas da cabine.
    for (const x of [12, 21, 30, 39]) {
      fillRect(grid, x, 15, 6, 6, trim);
      fillRect(grid, x + 1, 16, 4, 4, accent2);
    }

    // Farol frontal — o "olho" do trem, de onde sai o feixe do ataque.
    fillCircle(grid, 58, 20, 4, accent);
    fillCircle(grid, 58, 20, 2, 0xffffff);

    // Para-choque/plataforma frontal.
    fillRect(grid, 46, 29, 16, 4, trim);
    fillRect(grid, 49, 32, 4, 3, trim);
    fillRect(grid, 56, 32, 4, 3, trim);

    // Chaminé + fumaça esgarçada (pontos esparsos, não uma nuvem sólida).
    fillRect(grid, 15, 3, 7, 8, hull);
    paintOver(grid, 15, 3, 7, 2, coreLight);
    for (const [x, y] of [[13, 1], [17, -1], [20, 0], [11, 2]]) setPixel(grid, x, Math.max(0, y), accent);

    // Rodado — 3 truques de roda ao longo da base.
    for (const x of [10, 24, 38]) {
      fillRect(grid, x, 30, 9, 6, trim);
      fillCircle(grid, x + 2, 36, 2, coreLight);
      fillCircle(grid, x + 7, 36, 2, coreLight);
    }

    const g = this.add.graphics();
    renderGrid(g, grid, 0x05060c);
    g.generateTexture('boss_ghosttrain', w, h);
    g.destroy();
  }

  // Chefe final da Fase 10 "Mercado Negro dos Túneis" — O Barão do Mercado:
  // silhueta HUMANA pesada (casaco largo, não um casco/hull como os chefes
  // mecânicos anteriores), capuz com viseira âmbar brilhando, um braço
  // mecânico superdimensionado (lançador da Granada Suja) e detalhes
  // dourados (correntes, fivelas) reforçando o tema "ganância/contrabando" —
  // o único chefe com aparência de PESSOA, não máquina/criatura/veículo.
  generateMarketBaronBoss() {
    if (this.textures.exists('boss_fence')) return;
    const w = 46;
    const h = 44;
    const grid = createGrid(w, h);
    const coatDark = 0x1c1410;
    const coat = 0x2c2018;
    const coatLight = 0x3c2c20;
    const gold = 0xe8b93d;
    const goldLight = 0xffe066;
    const visor = 0xe8b93d;
    const armDark = 0x14100c;
    const arm = 0x2a201a;

    // Casaco largo — mais triângulo/trapézio que os cascos redondos dos
    // outros chefes, ombros marcadamente mais largos que a cintura.
    for (let dy = 0; dy <= 26; dy++) {
      const width = 10 + Math.round(dy * 0.35);
      fillRect(grid, 23 - width, 14 + dy, width * 2, 1, coat);
    }
    paintOver(grid, 8, 14, 30, 4, coatLight);

    const coatNoise = createNoise2D();
    mottle(grid, coatNoise, { color: this._shade(coat, -14, -12, -10), threshold: 0.4, scale: 0.28, region: { x0: 6, y0: 14, w: 34, h: 26 } });
    mottle(grid, coatNoise, { color: this._shade(coat, 10, 8, 6), threshold: 0.58, scale: 0.28, offsetX: 40, offsetY: 20, region: { x0: 6, y0: 14, w: 34, h: 26 } });

    // Capuz + viseira âmbar.
    fillCircle(grid, 23, 9, 8, coatDark);
    fillCircle(grid, 23, 9, 6, coat);
    fillRect(grid, 17, 8, 12, 3, visor);
    setPixel(grid, 18, 8, goldLight);

    // Correntes/fivelas douradas no peito — motivo "ganância".
    for (const y of [20, 24, 28]) {
      setPixel(grid, 20, y, gold);
      setPixel(grid, 26, y, gold);
    }
    fillRect(grid, 20, 32, 6, 3, gold);

    // Braço mecânico superdimensionado (lançador da Granada Suja) — bem
    // maior que o braço esquerdo, assimétrico de propósito.
    fillCircle(grid, 38, 24, 7, armDark);
    fillCircle(grid, 38, 24, 5, arm);
    fillCircle(grid, 38, 24, 2, gold);
    fillRect(grid, 34, 30, 8, 6, armDark);

    // Braço esquerdo, comum.
    fillCircle(grid, 8, 22, 4, coatDark);

    // Botas pesadas.
    fillRect(grid, 12, 38, 8, 5, coatDark);
    fillRect(grid, 26, 38, 8, 5, coatDark);

    const g2 = this.add.graphics();
    renderGrid(g2, grid, 0x0a0704);
    g2.generateTexture('boss_fence', w, h);
    g2.destroy();
  }

  // Portal de teleporte — anéis concêntricos com pequenas marcas
  // assimétricas (pra a rotação em runtime ficar visível de verdade, não
  // um anel perfeitamente simétrico que "giraria" sem parecer girar).
  generatePortal() {
    if (this.textures.exists('portal')) return;
    const s = 44;
    const grid = createGrid(s, s);
    const ring1 = 0xff5fd0;
    const ring2 = 0x37f0ff;
    const core = 0xffffff;

    fillCircle(grid, s / 2, s / 2, 21, ring1);
    clearCircle(grid, s / 2, s / 2, 17);
    fillCircle(grid, s / 2, s / 2, 15, ring2);
    clearCircle(grid, s / 2, s / 2, 11);
    fillCircle(grid, s / 2, s / 2, 6, core);

    for (const deg of [20, 110, 200, 290]) {
      const rad = Phaser.Math.DegToRad(deg);
      const bx = Math.round(s / 2 + Math.cos(rad) * 19);
      const by = Math.round(s / 2 + Math.sin(rad) * 19);
      fillCircle(grid, bx, by, 2, 0xffffff);
    }

    const g = this.add.graphics();
    renderGrid(g, grid);
    g.generateTexture('portal', s, s);
    g.destroy();
  }

  // Quiosque/banca — decoração de cenário do Distrito Neon.
  generateKiosk() {
    if (this.textures.exists('prop_kiosk')) return;
    const grid = createGrid(20, 22);
    fillRect(grid, 1, 8, 18, 13, 0x1e222c);
    paintOver(grid, 1, 8, 18, 2, 0x2a2f3c);
    fillRect(grid, 0, 4, 20, 5, 0xff5fd0);
    paintOver(grid, 0, 4, 20, 1, 0xffb3ea);
    fillRect(grid, 3, 11, 5, 6, 0x14161e);
    setPixel(grid, 5, 13, 0x37f0ff);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x0a0b10);
    g.generateTexture('prop_kiosk', 20, 22);
    g.destroy();
  }

  // Barraca do Mercado Negro — toldo + balcão. Fallback 28×24 se o pacote
  // não trouxer `prop_stall`.
  generateStall() {
    if (this.textures.exists('prop_stall')) return;
    const grid = createGrid(28, 24);
    fillRect(grid, 0, 0, 28, 4, 0xff5fd0);
    paintOver(grid, 0, 0, 28, 1, 0xffb3ea);
    fillRect(grid, 1, 4, 26, 2, 0x3a4a2c);
    fillRect(grid, 2, 14, 24, 10, 0x3a2418);
    fillRect(grid, 2, 14, 24, 2, 0xc9a06a);
    fillRect(grid, 12, 6, 4, 4, 0xe8b93d);
    fillRect(grid, 20, 8, 4, 6, 0xff5fd0);
    fillRect(grid, 4, 10, 5, 4, 0x2a2018);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x0a0704);
    g.generateTexture('prop_stall', 28, 24);
    g.destroy();
  }

  // Lanterna de teto/poste do Mercado Negro. Fallback 12×16 se o pacote
  // não trouxer `prop_lantern`.
  generateLantern() {
    if (this.textures.exists('prop_lantern')) return;
    const grid = createGrid(12, 16);
    fillRect(grid, 5, 0, 2, 8, 0x2a2018);
    fillCircle(grid, 6, 11, 4, 0xe8b93d);
    fillCircle(grid, 6, 11, 2, 0xffe066);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x0a0704);
    g.generateTexture('prop_lantern', 12, 16);
    g.destroy();
  }

  // Buraco no chão — passagem física (não teleporte) entre o Distrito Neon
  // e o Submundo: borda de entulho irregular (não um círculo perfeito) ao
  // redor de um vazio escuro, bem diferente da linguagem "tech" de portais/
  // portas do resto do jogo.
  generateHoleProp() {
    if (this.textures.exists('prop_hole')) return;
    const s = 40;
    const cx = s / 2;
    const cy = s / 2;
    const rockDark = 0x1a1512;
    const rockMid = 0x2a221c;
    const voidColor = 0x050403;
    const grid = createGrid(s, s);

    fillCircle(grid, cx, cy, 17, rockDark);
    fillCircle(grid, cx, cy, 14, rockMid);
    fillCircle(grid, cx, cy, 11, voidColor);

    // Mordidas irregulares na borda — quebra a silhueta de círculo perfeito.
    for (const deg of [15, 80, 140, 210, 300]) {
      const rad = Phaser.Math.DegToRad(deg);
      fillCircle(grid, cx + Math.cos(rad) * 15.5, cy + Math.sin(rad) * 15.5, 3, voidColor);
    }
    for (const deg of [50, 170, 260]) {
      const rad = Phaser.Math.DegToRad(deg);
      fillCircle(grid, cx + Math.cos(rad) * 17, cy + Math.sin(rad) * 17, 2, rockDark);
    }
    // Destroços soltos na borda do entulho.
    for (const [dx, dy] of [[-9, -6], [8, -8], [-7, 9], [9, 7]]) {
      setPixel(grid, cx + dx, cy + dy, 0x14100d);
    }

    const g = this.add.graphics();
    renderGrid(g, grid, 0x080605);
    g.generateTexture('prop_hole', s, s);
    g.destroy();
  }

  // Guarda Sentinela: armadura tática, capacete fechado com viseira — sem
  // rosto à mostra, silhueta mais quadrada/robusta que os civis.
  // Corpo e cabeça em texturas separadas (mesmo canvas 14x20, cada uma só
  // com sua metade preenchida) — NPC.js sobrepõe os dois sprites e balança
  // só o da cabeça verticalmente, corpo parado de verdade no chão.
  generateGuardNPC() {
    if (this.textures.exists('npc_guard_body')) return;
    const s = [14, 20];
    const body = createGrid(...s);
    fillRect(body, 2, 9, 10, 9, 0x1c2233);
    paintOver(body, 4, 10, 6, 3, 0x2f3b52);
    fillRect(body, 0, 9, 3, 5, 0x3a4560);
    fillRect(body, 11, 9, 3, 5, 0x3a4560);
    fillRect(body, 2, 16, 4, 4, 0x101318);
    fillRect(body, 8, 16, 4, 4, 0x101318);
    const gBody = this.add.graphics();
    renderGrid(gBody, body);
    gBody.generateTexture('npc_guard_body', ...s);
    gBody.destroy();

    const head = createGrid(...s);
    fillCircle(head, 7, 5, 4, 0x232a3a);
    fillRect(head, 4, 5, 6, 2, 0xff3b52);
    setPixel(head, 5, 5, 0xffb3c0);
    const gHead = this.add.graphics();
    renderGrid(gHead, head);
    gHead.generateTexture('npc_guard_head', ...s);
    gHead.destroy();
  }

  // Engenheira Vex: macacão utilitário, óculos de proteção erguidos na testa,
  // cinto de ferramentas — leitura clara de "técnica" a distância.
  generateEngineerNPC() {
    if (this.textures.exists('npc_engineer_body')) return;
    const s = [14, 20];
    const body = createGrid(...s);
    fillRect(body, 2, 9, 10, 9, 0xb87333);
    paintOver(body, 2, 13, 10, 2, 0xffb347);
    fillRect(body, 2, 16, 4, 4, 0x5a3a1c);
    fillRect(body, 8, 16, 4, 4, 0x5a3a1c);
    const gBody = this.add.graphics();
    renderGrid(gBody, body);
    gBody.generateTexture('npc_engineer_body', ...s);
    gBody.destroy();

    const head = createGrid(...s);
    fillCircle(head, 7, 5, 4, 0xd8c9a0);
    fillRect(head, 3, 3, 8, 2, 0x2a2a2a);
    setPixel(head, 5, 4, 0x9fffe8);
    setPixel(head, 9, 4, 0x9fffe8);
    const gHead = this.add.graphics();
    renderGrid(gHead, head);
    gHead.generateTexture('npc_engineer_head', ...s);
    gHead.destroy();
  }

  // Trabalhador de fábrica (usado pelos NPCs presos/resgatados): macacão
  // simples + capacete de segurança, tonalidade variada via tint em runtime.
  generateWorkerNPC() {
    if (this.textures.exists('npc_worker_body')) return;
    const s = [14, 20];
    const body = createGrid(...s);
    fillRect(body, 2, 9, 10, 9, 0x2f4a3c);
    fillRect(body, 2, 16, 4, 4, 0x3c6b52);
    fillRect(body, 8, 16, 4, 4, 0x3c6b52);
    const gBody = this.add.graphics();
    renderGrid(gBody, body);
    gBody.generateTexture('npc_worker_body', ...s);
    gBody.destroy();

    const head = createGrid(...s);
    fillCircle(head, 7, 6, 4, 0xd8c9a0);
    paintOver(head, 3, 3, 8, 3, 0xffe066);
    fillRect(head, 2, 6, 10, 1, 0xd1a900);
    const gHead = this.add.graphics();
    renderGrid(gHead, head);
    gHead.generateTexture('npc_worker_head', ...s);
    gHead.destroy();
  }

  // Coordenador Voss: sobretudo longo (silhueta mais larga/alta) e um
  // distintivo brilhante no peito — leitura de "autoridade" a distância.
  generateCoordinatorNPC() {
    if (this.textures.exists('npc_coordinator_body')) return;
    const s = [14, 20];
    const body = createGrid(...s);
    fillRect(body, 1, 9, 12, 8, 0x3a1f4a);
    paintOver(body, 1, 9, 12, 2, 0x5c3070);
    setPixel(body, 7, 12, 0xffd27a);
    setPixel(body, 7, 13, 0xffe9c2);
    fillRect(body, 2, 17, 4, 3, 0x1a0f22);
    fillRect(body, 8, 17, 4, 3, 0x1a0f22);
    const gBody = this.add.graphics();
    renderGrid(gBody, body);
    gBody.generateTexture('npc_coordinator_body', ...s);
    gBody.destroy();

    const head = createGrid(...s);
    fillCircle(head, 7, 5, 4, 0xd8c9a0);
    paintOver(head, 3, 3, 8, 2, 0x1a1a1a);
    const gHead = this.add.graphics();
    renderGrid(gHead, head);
    gHead.generateTexture('npc_coordinator_head', ...s);
    gHead.destroy();
  }

  // Emissária Kess — a mensageira do Distrito Neon. Silhueta deliberadamente
  // maior/mais alta que os outros NPCs (16x24 em vez de 14x20) e com um
  // capuz/manto cobrindo o rosto, pra "se destacar" à primeira vista —
  // reforçado em runtime por um brilho pulsante sob os pés (ver TownScene).
  generateHeraldNPC() {
    if (this.textures.exists('npc_herald_body')) return;
    const s = [16, 24];
    const body = createGrid(...s);
    fillRect(body, 1, 10, 14, 12, 0x241040);
    paintOver(body, 1, 10, 14, 3, 0x3a1f5a);
    fillRect(body, 6, 13, 4, 5, 0x0d0616);
    setPixel(body, 8, 15, 0xff5fd0);
    fillRect(body, 1, 20, 5, 4, 0x160a28);
    fillRect(body, 10, 20, 5, 4, 0x160a28);
    const gBody = this.add.graphics();
    renderGrid(gBody, body, 0x05020a);
    gBody.generateTexture('npc_herald_body', ...s);
    gBody.destroy();

    const head = createGrid(...s);
    fillCircle(head, 8, 6, 5, 0x160a28);
    paintOver(head, 3, 3, 10, 4, 0x0d0616);
    setPixel(head, 6, 7, 0x9fffff);
    setPixel(head, 10, 7, 0x9fffff);
    const gHead = this.add.graphics();
    renderGrid(gHead, head, 0x05020a);
    gHead.generateTexture('npc_herald_head', ...s);
    gHead.destroy();
  }

  // Vendedor do Mercado Negro — capa marrom + viseira magenta (body/head
  // separados, mesmo canvas 14×20). Fallback se o pacote não trouxer
  // `npc_vendor_body` / `npc_vendor_head`.
  generateVendorNPC() {
    if (this.textures.exists('npc_vendor_body')) return;
    const s = [14, 20];
    const body = createGrid(...s);
    fillRect(body, 2, 9, 10, 9, 0x2c2018);
    paintOver(body, 4, 11, 6, 2, 0x3a4a2c);
    setPixel(body, 6, 12, 0xe8b93d);
    setPixel(body, 7, 12, 0xe8b93d);
    fillRect(body, 2, 16, 4, 4, 0x1c1410);
    fillRect(body, 8, 16, 4, 4, 0x1c1410);
    const gBody = this.add.graphics();
    renderGrid(gBody, body, 0x0a0704);
    gBody.generateTexture('npc_vendor_body', ...s);
    gBody.destroy();

    const head = createGrid(...s);
    fillCircle(head, 7, 6, 4, 0xd8c9a0);
    fillRect(head, 3, 4, 8, 3, 0xff5fd0);
    setPixel(head, 4, 4, 0xffb3ea);
    const gHead = this.add.graphics();
    renderGrid(gHead, head, 0x0a0704);
    gHead.generateTexture('npc_vendor_head', ...s);
    gHead.destroy();
  }

  generateItem() {
    const s = 20;
    const grid = createGrid(s, s);
    const blade = 0xdff7ff;
    fillRect(grid, 9, 2, 2, 9, blade);
    setPixel(grid, 8, 3, blade);
    setPixel(grid, 11, 3, blade);
    setPixel(grid, 8, 4, blade);
    setPixel(grid, 11, 4, blade);
    fillRect(grid, 5, 12, 10, 2, 0xffe066);
    fillRect(grid, 9, 14, 2, 4, 0x8a5a2b);
    setPixel(grid, 9, 18, 0xffe066);
    setPixel(grid, 10, 18, 0xffe066);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x0a1520);
    g.generateTexture('item_sword', s, s);
    g.destroy();
  }

  generateArmorItem() {
    const s = 20;
    const grid = createGrid(s, s);
    const rows = [
      [5, 14, 2], [4, 15, 3], [3, 16, 4], [3, 16, 5], [3, 16, 6],
      [4, 15, 7], [4, 15, 8], [5, 14, 9], [5, 14, 10],
      [6, 13, 11], [7, 12, 12], [8, 11, 13], [9, 10, 14]
    ];
    for (const [x0, x1, y] of rows) fillRect(grid, x0, y, x1 - x0 + 1, 1, 0xffe9c2);
    fillRect(grid, 9, 6, 2, 6, 0xff9d3d);
    setPixel(grid, 9, 6, 0xffd27a);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x2a1600);
    g.generateTexture('item_armor', s, s);
    g.destroy();
  }

  // Cartão de acesso — drop de inimigo, usado para destrancar a porta do cofre.
  generateKeycardItem() {
    const s = 20;
    const grid = createGrid(s, s);
    fillRect(grid, 2, 4, 16, 12, 0x1c2038);
    fillRect(grid, 3, 5, 14, 10, 0x37f0ff);
    fillRect(grid, 5, 7, 6, 2, 0x1c2038);
    setPixel(grid, 13, 8, 0xffe066);
    setPixel(grid, 14, 8, 0xffe066);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x05060c);
    g.generateTexture('item_keycard', s, s);
    g.destroy();
  }

  // Kit médico — recupera HP instantaneamente ao ser coletado.
  generateMedkitItem() {
    const s = 20;
    const grid = createGrid(s, s);
    fillRect(grid, 2, 4, 16, 12, 0xe8ecf0);
    paintOver(grid, 2, 4, 16, 2, 0xc7ced6);
    fillRect(grid, 8, 6, 4, 8, 0xff3b52);
    fillRect(grid, 5, 9, 10, 4, 0xff3b52);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x1c2038);
    g.generateTexture('item_medkit', s, s);
    g.destroy();
  }

  // Pistola de Pulso — arma secundária de longo alcance, munição limitada.
  generatePistolItem() {
    const s = 20;
    const grid = createGrid(s, s);
    fillRect(grid, 3, 6, 11, 4, 0x3a4178);
    paintOver(grid, 3, 6, 11, 1, 0x5f6bb0);
    fillRect(grid, 13, 7, 5, 2, 0x1c2038);
    setPixel(grid, 17, 7, 0x37f0ff);
    setPixel(grid, 17, 8, 0x18e8ff);
    fillRect(grid, 4, 10, 4, 7, 0x1c2038);
    fillRect(grid, 4, 16, 5, 2, 0x0a0c18);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x05060c);
    g.generateTexture('item_pistol', s, s);
    g.destroy();
  }

  // Botas de Impulso — item de deslocamento (aumenta a velocidade do
  // jogador, ver GameState.speedMul). Cano + sola com o mesmo ciano de
  // "propulsor" já usado nas botas do próprio personagem (_buildPlayerBase),
  // com riscos de velocidade atrás do calcanhar pra deixar a função óbvia
  // no ícone mesmo em 20x20.
  generateBootsItem() {
    const s = 20;
    const grid = createGrid(s, s);
    const bootDark = 0x2a2f45;
    const bootLight = 0x3a4166;
    const sole = 0x1c2038;
    const glow = 0x18e8ff;
    fillRect(grid, 6, 2, 6, 8, bootDark);
    paintOver(grid, 6, 2, 6, 2, bootLight);
    fillRect(grid, 5, 9, 11, 5, bootDark);
    paintOver(grid, 5, 9, 11, 1, bootLight);
    fillRect(grid, 4, 14, 13, 3, sole);
    paintOver(grid, 4, 15, 13, 1, glow);
    setPixel(grid, 2, 12, glow);
    setPixel(grid, 1, 13, glow);
    setPixel(grid, 3, 9, glow);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x05060c);
    g.generateTexture('item_boots', s, s);
    g.destroy();
  }

  generateAmmoItem() {
    if (this.textures.exists('item_ammo')) return;
    const s = 20;
    const grid = createGrid(s, s);
    for (const ox of [5, 11]) {
      fillRect(grid, ox, 3, 4, 2, 0xff9d3d);
      fillRect(grid, ox, 5, 4, 10, 0xffcf6b);
      setPixel(grid, ox + 1, 6, 0xfff2cf);
    }
    const g = this.add.graphics();
    renderGrid(g, grid, 0x2a1600);
    g.generateTexture('item_ammo', s, s);
    g.destroy();
  }

  // Britadeira/Pile-bunker — pistão pesado com cabeça de martelo, silhueta
  // bem mais "grossa"/quadrada que a espada, comunicando peso/lentidão.
  generatePilebunkerItem() {
    if (this.textures.exists('item_pilebunker')) return;
    const s = 20;
    const grid = createGrid(s, s);
    const metal = 0x5a1015;
    const metalLight = 0x7a1f2c;
    fillRect(grid, 8, 12, 4, 6, 0x2a2f45);
    paintOver(grid, 8, 12, 4, 1, 0x3a4166);
    fillRect(grid, 6, 8, 8, 5, metal);
    paintOver(grid, 6, 8, 8, 1, metalLight);
    fillRect(grid, 7, 3, 6, 6, metalLight);
    fillRect(grid, 8, 2, 4, 1, 0xff8a3d);
    setPixel(grid, 9, 2, 0xffe9c2);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x0d0304);
    g.generateTexture('item_pilebunker', s, s);
    g.destroy();
  }

  // SMG Neural — corpo compacto com pente/carregador comprido pra baixo,
  // silhueta diferente da item_pistol (sem carregador saliente).
  generateSmgItem() {
    if (this.textures.exists('item_smg')) return;
    const s = 20;
    const grid = createGrid(s, s);
    fillRect(grid, 2, 7, 12, 3, 0x2a3a4a);
    paintOver(grid, 2, 7, 12, 1, 0x4a90d9);
    fillRect(grid, 13, 8, 5, 2, 0x1c2038);
    setPixel(grid, 17, 8, 0x9fd0ff);
    fillRect(grid, 4, 10, 4, 8, 0x0c1420);
    paintOver(grid, 4, 10, 4, 1, 0x1c3a5a);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x05060c);
    g.generateTexture('item_smg', s, s);
    g.destroy();
  }

  // Shotgun de Choque — corpo largo com cano duplo bem visível, silhueta
  // mais "grande" que qualquer outra arma à distância do jogo.
  generateShotgunItem() {
    if (this.textures.exists('item_shotgun')) return;
    const s = 20;
    const grid = createGrid(s, s);
    fillRect(grid, 1, 8, 13, 4, 0x4a3a2a);
    paintOver(grid, 1, 8, 13, 1, 0x6b5540);
    fillRect(grid, 13, 8, 6, 2, 0x1c1410);
    fillRect(grid, 13, 10, 6, 2, 0x1c1410);
    setPixel(grid, 18, 8, 0x3a3028);
    setPixel(grid, 18, 10, 0x3a3028);
    fillRect(grid, 3, 12, 3, 6, 0x1c2038);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x0d0304);
    g.generateTexture('item_shotgun', s, s);
    g.destroy();
  }

  // Railgun de Sobrecarga — cano bem mais longo/reto que qualquer outra
  // arma à distância do jogo (lê como "atravessa tudo"), com um núcleo de
  // energia branco-azulado visível ao longo do cano.
  generateRailgunItem() {
    if (this.textures.exists('item_railgun')) return;
    const s = 20;
    const grid = createGrid(s, s);
    fillRect(grid, 0, 8, 18, 4, 0x2a3a4a);
    paintOver(grid, 0, 8, 18, 1, 0x4a90d9);
    paintOver(grid, 2, 9, 14, 2, 0xdff7ff);
    fillRect(grid, 3, 12, 4, 6, 0x1c2038);
    fillRect(grid, 3, 17, 5, 2, 0x0a0c18);
    setPixel(grid, 17, 9, 0xffffff);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x05060c);
    g.generateTexture('item_railgun', s, s);
    g.destroy();
  }

  // Estimulante — seringa com líquido visível, ícone único de consumível
  // (nenhum outro item do jogo tem essa silhueta).
  generateStimItem() {
    if (this.textures.exists('item_stim')) return;
    const s = 20;
    const grid = createGrid(s, s);
    fillRect(grid, 8, 3, 4, 10, 0xdfe8f0);
    fillRect(grid, 9, 4, 2, 8, 0x2dffb0);
    fillRect(grid, 7, 1, 6, 2, 0x8a94a8);
    fillRect(grid, 8, 13, 4, 2, 0x8a94a8);
    fillRect(grid, 9, 15, 2, 4, 0xc7ced6);
    setPixel(grid, 9, 18, 0xffffff);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x0a1520);
    g.generateTexture('item_stim', s, s);
    g.destroy();
  }

  // Granada EMP — orbe com anéis de pulso ao redor, cor violeta reservada
  // (mesma família do CoreBoss) pra sinalizar "efeito anti-robô".
  generateEmpItem() {
    if (this.textures.exists('item_emp')) return;
    const s = 20;
    const grid = createGrid(s, s);
    fillCircle(grid, 10, 11, 6, 0x1a1330);
    fillCircle(grid, 10, 11, 4, 0x9f5fff);
    fillCircle(grid, 10, 11, 2, 0xffffff);
    fillRect(grid, 9, 3, 2, 4, 0x2a2450);
    setPixel(grid, 9, 3, 0xd88bff);
    for (const deg of [20, 110, 200, 290]) {
      const rad = Phaser.Math.DegToRad(deg);
      const bx = Math.round(10 + Math.cos(rad) * 8);
      const by = Math.round(11 + Math.sin(rad) * 8);
      setPixel(grid, bx, by, 0xd88bff);
    }
    const g = this.add.graphics();
    renderGrid(g, grid, 0x08050f);
    g.generateTexture('item_emp', s, s);
    g.destroy();
  }

  generateBullet() {
    if (this.textures.exists('bullet')) return;
    const w = 10;
    const h = 5;
    const grid = createGrid(w, h);
    fillRect(grid, 0, 1, 8, 3, 0x9fffe8);
    fillRect(grid, 7, 2, 3, 1, 0xffffff);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x0a1520);
    g.generateTexture('bullet', w, h);
    g.destroy();
  }

  generateBolt() {
    if (this.textures.exists('bolt')) return;
    const s = 12;
    const g = this.add.graphics();
    g.fillStyle(0xff5a1f, 1);
    g.fillCircle(s / 2, s / 2, s / 2 - 1);
    g.fillStyle(0xffd08a, 1);
    g.fillCircle(s / 2, s / 2, 3);
    g.generateTexture('bolt', s, s);
    g.destroy();
  }

  generateSlash() {
    if (this.textures.exists('slash')) return;
    const s = 40;
    const g = this.add.graphics();
    g.lineStyle(4, 0x9fffe8, 1);
    g.beginPath();
    g.arc(s / 2, s / 2, s / 2 - 4, Phaser.Math.DegToRad(200), Phaser.Math.DegToRad(340));
    g.strokePath();
    g.generateTexture('slash', s, s);
    g.destroy();
  }

  generateParticle() {
    if (this.textures.exists('particle')) return;
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillCircle(3, 3, 3);
    g.generateTexture('particle', 6, 6);
    g.destroy();
  }

  // Piso tóxico da Colônia — lodo verde com bolhas, pulso lento no TileMap.
  generateToxicFloor(key) {
    if (this.textures.exists(key)) return;
    const s = TILE_SIZE;
    const grid = createGrid(s, s);
    fillRect(grid, 0, 0, s, s, 0x0c1608);
    paintOver(grid, 0, 0, s, 2, 0x3a6a20);
    paintOver(grid, 0, s - 2, s, 2, 0x3a6a20);
    fillCircle(grid, 10, 12, 5, 0x1a3a10);
    fillCircle(grid, 22, 20, 6, 0x244818);
    fillCircle(grid, 14, 24, 4, 0x1a3a10);
    setPixel(grid, 9, 10, 0x6dff4a);
    setPixel(grid, 11, 14, 0x9fff6a);
    setPixel(grid, 21, 18, 0x6dff4a);
    setPixel(grid, 24, 22, 0xc8ff90);
    setPixel(grid, 15, 23, 0x6dff4a);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x040804);
    g.generateTexture(key, s, s);
    g.destroy();
  }

  // Tambor de filtro (puzzle mod-3) — 3 estados: fechado / meio / aberto.
  generateFilterTile() {
    if (this.textures.exists('tile_filter_0')) return;
    const s = TILE_SIZE;
    const frame = 0x2a3224;
    const panelBg = 0x0c1008;
    const colors = [0x8a2020, 0xc9a03a, 0x5ad040];
    const cores = [0xff6a6a, 0xffe066, 0xc8ff90];
    for (let state = 0; state < 3; state++) {
      const grid = createGrid(s, s);
      fillRect(grid, 1, 1, s - 2, s - 2, frame);
      fillRect(grid, 3, 3, s - 6, s - 6, panelBg);
      fillCircle(grid, s / 2, s / 2, 10, colors[state]);
      fillCircle(grid, s / 2, s / 2, 5, cores[state]);
      fillRect(grid, s / 2 - 1, 6, 2, 8, 0x0c1008);
      const g = this.add.graphics();
      renderGrid(g, grid, 0x05080a);
      g.generateTexture(`tile_filter_${state}`, s, s);
      g.destroy();
    }
  }

  // Cápsula de quarentena — vidro com fluido verde, prop da Colônia.
  generateCapsuleProp() {
    if (this.textures.exists('prop_capsule')) return;
    const grid = createGrid(14, 22);
    fillRect(grid, 3, 1, 8, 18, 0x1a2a18);
    paintOver(grid, 4, 2, 6, 16, 0x2a4a22);
    fillRect(grid, 5, 4, 4, 12, 0x3a6a28);
    setPixel(grid, 6, 6, 0x6dff4a);
    setPixel(grid, 7, 8, 0x9fff6a);
    setPixel(grid, 6, 11, 0x6dff4a);
    fillRect(grid, 2, 1, 10, 2, 0x3a4038);
    fillRect(grid, 2, 18, 10, 3, 0x3a4038);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x060a04);
    g.generateTexture('prop_capsule', 14, 22);
    g.destroy();
  }

  // Contaminado — humanoide encurvado, pele verde, trapos. Distinto do
  // contrabandista (capuz âmbar) e do Morador dos Túneis (feral cinza).
  generateInfectedEnemy() {
    if (this.textures.exists('enemy_infected')) return;
    const w = 16;
    const h = 20;
    const grid = createGrid(w, h);
    const skin = 0x5a7a3a;
    const skinDark = 0x3a5228;
    const rag = 0x3a3428;
    const glow = 0x6dff4a;

    fillCircle(grid, 7, 5, 4, skinDark);
    paintOver(grid, 5, 3, 5, 3, skin);
    setPixel(grid, 6, 5, glow);
    setPixel(grid, 9, 5, glow);

    fillRect(grid, 4, 9, 8, 7, rag);
    paintOver(grid, 5, 10, 5, 3, 0x4a4434);
    fillRect(grid, 2, 10, 3, 4, skinDark);
    fillRect(grid, 11, 11, 3, 4, skin);

    fillRect(grid, 4, 16, 3, 4, skinDark);
    fillRect(grid, 8, 16, 3, 4, rag);

    const g = this.add.graphics();
    renderGrid(g, grid, 0x060a04);
    g.generateTexture('enemy_infected', w, h);
    g.destroy();
  }

  // Portador — torso inchado, pústulas verdes, mais largo que o Contaminado.
  generateBloatedEnemy() {
    if (this.textures.exists('enemy_bloated')) return;
    const w = 22;
    const h = 22;
    const grid = createGrid(w, h);
    const skin = 0x4a6a32;
    const skinDark = 0x2e441e;
    const pus = 0x6dff4a;
    const rag = 0x2a2418;

    fillCircle(grid, 11, 5, 5, skinDark);
    setPixel(grid, 9, 5, pus);
    setPixel(grid, 13, 5, pus);

    fillCircle(grid, 11, 13, 8, skin);
    paintOver(grid, 6, 10, 10, 6, 0x5a7a3a);
    setPixel(grid, 7, 12, pus);
    setPixel(grid, 14, 14, pus);
    setPixel(grid, 10, 16, 0x9fff6a);

    fillRect(grid, 4, 18, 5, 4, rag);
    fillRect(grid, 13, 18, 5, 4, rag);

    const g = this.add.graphics();
    renderGrid(g, grid, 0x060a04);
    g.generateTexture('enemy_bloated', w, h);
    g.destroy();
  }

  // O Enfermeiro — máscara de gás, avental rasgado, seringa-bastão.
  generateEnfermeiroMiniBoss() {
    if (this.textures.exists('enemy_enfermeiro')) return;
    const w = 24;
    const h = 28;
    const grid = createGrid(w, h);
    const coat = 0x3a4034;
    const coatLight = 0x5a6050;
    const mask = 0x1a2018;
    const visor = 0x6dff4a;
    const skin = 0x6a5a48;
    const needle = 0xc8d0d8;

    fillCircle(grid, 12, 6, 5, mask);
    fillRect(grid, 8, 6, 8, 2, visor);
    setPixel(grid, 9, 6, 0xc8ff90);
    fillRect(grid, 11, 8, 2, 3, mask);

    fillRect(grid, 6, 12, 12, 10, coat);
    paintOver(grid, 7, 13, 8, 4, coatLight);
    fillRect(grid, 10, 12, 4, 8, 0xd8dcc8);

    fillRect(grid, 3, 13, 4, 5, skin);
    fillRect(grid, 18, 4, 3, 14, needle);
    setPixel(grid, 19, 4, visor);
    fillRect(grid, 18, 17, 3, 2, 0x3a4034);

    fillRect(grid, 7, 22, 4, 6, 0x2a2418);
    fillRect(grid, 13, 22, 4, 6, 0x2a2418);

    const g = this.add.graphics();
    renderGrid(g, grid, 0x060a04);
    g.generateTexture('enemy_enfermeiro', w, h);
    g.destroy();
  }

  // A Matriarca — massa orgânica com sacos de ovo e núcleo verde pulsátil.
  // Criatura, não humana/máquina/veículo.
  generateMatriarchBoss() {
    if (this.textures.exists('boss_matriarch')) return;
    const w = 48;
    const h = 46;
    const grid = createGrid(w, h);
    const flesh = 0x3a4a28;
    const fleshLight = 0x5a6a38;
    const dark = 0x1a2410;
    const core = 0x6dff4a;
    const coreHot = 0xc8ff90;

    fillCircle(grid, 16, 38, 9, dark);
    fillCircle(grid, 32, 38, 9, dark);
    fillCircle(grid, 24, 22, 18, flesh);
    fillCircle(grid, 24, 20, 14, fleshLight);

    const noise = createNoise2D();
    mottle(grid, noise, { color: 0x2a3a1c, threshold: 0.38, scale: 0.28 });
    mottle(grid, noise, { color: 0x6a7a40, threshold: 0.48, scale: 0.28, offsetX: 40, offsetY: 40 });

    fillCircle(grid, 8, 16, 7, flesh);
    fillCircle(grid, 40, 18, 8, flesh);
    fillCircle(grid, 6, 18, 3, core);
    fillCircle(grid, 42, 16, 3, core);

    fillCircle(grid, 22, 20, 7, dark);
    fillCircle(grid, 22, 20, 5, core);
    fillCircle(grid, 22, 20, 2, coreHot);

    setPixel(grid, 18, 12, core);
    setPixel(grid, 28, 10, coreHot);
    setPixel(grid, 14, 24, core);
    setPixel(grid, 34, 26, coreHot);

    fillRect(grid, 10, 34, 6, 8, dark);
    fillRect(grid, 32, 34, 6, 8, dark);

    const g = this.add.graphics();
    renderGrid(g, grid, 0x040804);
    g.generateTexture('boss_matriarch', w, h);
    g.destroy();
  }

  // Piso do Servidor: raised floor com dois traços de cabo (não o xadrez
  // tóxico nem o ciano elétrico do Reator).
  generateFloorServidorRack(key) {
    if (this.textures.exists(key)) return;
    const s = TILE_SIZE;
    const grid = createGrid(s, s);
    fillRect(grid, 0, 0, s, s, 0x0c1418);
    paintOver(grid, 0, 0, s, 2, 0x162028);
    paintOver(grid, 0, s - 2, s, 2, 0x162028);
    paintOver(grid, 8, 4, 1, s - 8, 0x1a3a38);
    paintOver(grid, 22, 4, 1, s - 8, 0x1a3a38);
    setPixel(grid, 8, 10, 0x2ef0c8);
    setPixel(grid, 22, 18, 0x2ef0c8);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x04080c);
    g.generateTexture(key, s, s);
    g.destroy();
  }

  // Parede de rack: metal quase preto com tiras LED verticais (teal 1px,
  // não um flood ciano como a Ala do Reator).
  generateWallServidor(key) {
    if (this.textures.exists(key)) return;
    const s = TILE_SIZE;
    const base = 0x141c22;
    const grid = createGrid(s, s);
    fillRect(grid, 0, 0, s, s, 0x080c10);
    fillRect(grid, 1, 1, s - 2, s - 2, base);
    const noise = createNoise2D();
    mottle(grid, noise, { color: this._shade(base, -8, -6, -4), threshold: 0.55, scale: 0.4 });
    for (const x of [6, 16, 26]) {
      paintOver(grid, x, 3, 1, s - 6, 0x0a1214);
      for (const y of [6, 12, 18, 24]) setPixel(grid, x, y, 0x2ef0c8);
    }
    setPixel(grid, 6, 6, 0xb8fff0);
    setPixel(grid, 26, 18, 0xb8fff0);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x04080c);
    g.generateTexture(key, s, s);
    g.destroy();
  }

  // Porta do data-center: painel escuro, leitor de cartão e LED teal.
  generateDoorServidor(key) {
    if (this.textures.exists(key)) return;
    const s = TILE_SIZE;
    const grid = createGrid(s, s);
    fillRect(grid, 0, 0, s, s, 0x080c10);
    fillRect(grid, 2, 2, s - 4, s - 4, 0x161e24);
    paintOver(grid, 2, 2, s - 4, 2, 0x2ef0c8);
    paintOver(grid, 2, s - 4, s - 4, 2, 0x1a3a38);
    fillRect(grid, s / 2 - 1, 5, 2, s - 12, 0x2ef0c8);
    paintOver(grid, s / 2 - 1, 5, 1, s - 12, 0xb8fff0);
    fillRect(grid, s - 9, 12, 5, 8, 0x0a1214);
    setPixel(grid, s - 7, 14, 0x2ef0c8);
    setPixel(grid, s - 7, 16, 0xff3d8a);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x04080c);
    g.generateTexture(key, s, s);
    g.destroy();
  }

  // Parede do hub do Estaleiro — chapa corrugada de contêiner (nervuras
  // verticais), faixa de risco horizontal e rebites. Nem a rocha do
  // Submundo, nem o metal arranhado em diagonal do Arsenal.
  generateWallEstaleiro(key) {
    if (this.textures.exists(key)) return;
    const s = TILE_SIZE;
    const base = 0x2a3238;
    const grid = createGrid(s, s);
    fillRect(grid, 0, 0, s, s, 0x12181c);
    fillRect(grid, 1, 1, s - 2, s - 2, base);
    const rustNoise = createNoise2D();
    mottle(grid, rustNoise, { color: this._shade(base, -12, -10, -8), threshold: 0.4, scale: 0.45 });
    mottle(grid, rustNoise, { color: 0x6a3a22, threshold: 0.68, scale: 0.55, offsetX: 28, offsetY: 16 });
    for (let x = 3; x < s - 2; x += 4) {
      paintOver(grid, x, 2, 1, s - 4, 0x1a2228);
      paintOver(grid, x + 1, 2, 1, s - 4, 0x3a4850);
    }
    for (let x = 2; x < s - 2; x++) {
      const on = Math.floor((x + 1) / 3) % 2 === 0;
      setPixel(grid, x, 14, on ? 0xe8a030 : 0x0c1014);
      setPixel(grid, x, 15, on ? 0xe8a030 : 0x0c1014);
    }
    for (const [cx, cy] of [[4, 5], [s - 5, 5], [4, s - 6], [s - 5, s - 6]]) {
      fillCircle(grid, cx, cy, 1, 0x1a2228);
      setPixel(grid, cx, cy, 0x8a9aa4);
    }
    const g = this.add.graphics();
    renderGrid(g, grid, 0x080c10);
    g.generateTexture(key, s, s);
    g.destroy();
  }

  // Portão de baia de carga — lâminas horizontais de enrolar, faixa de
  // risco embaixo, fresta âmbar no meio. Lê como doca, não porta deslizante.
  generateDoorEstaleiro(key) {
    if (this.textures.exists(key)) return;
    const s = TILE_SIZE;
    const grid = createGrid(s, s);
    fillRect(grid, 0, 0, s, s, 0x101418);
    fillRect(grid, 2, 2, s - 4, s - 4, 0x2a3238);
    for (let y = 4; y < s - 4; y += 3) {
      paintOver(grid, 3, y, s - 6, 1, 0x1a2228);
    }
    fillRect(grid, s / 2 - 1, 3, 2, s - 10, 0xe8923d);
    paintOver(grid, s / 2 - 1, 3, 1, s - 10, 0xffc878);
    for (let x = 3; x < s - 3; x++) {
      const on = Math.floor(x / 3) % 2 === 0;
      setPixel(grid, x, s - 5, on ? 0xe8a030 : 0x0c1014);
      setPixel(grid, x, s - 4, on ? 0xe8a030 : 0x0c1014);
    }
    const g = this.add.graphics();
    renderGrid(g, grid, 0x080c10);
    g.generateTexture(key, s, s);
    g.destroy();
  }

  // Plataforma de poço de carga — gaiola quadrada com borda de risco e
  // seta pra cima. Passagem física (sobe/desce), não portal nem buraco.
  generateLiftProp() {
    if (this.textures.exists('prop_lift')) return;
    const s = 36;
    const grid = createGrid(s, s);
    fillRect(grid, 4, 4, 28, 28, 0x1a2228);
    fillRect(grid, 6, 6, 24, 24, 0x2a3238);
    fillRect(grid, 10, 10, 16, 16, 0x12181c);
    for (let i = 0; i < 28; i++) {
      const on = Math.floor(i / 3) % 2 === 0;
      const c = on ? 0xe8a030 : 0x0c1014;
      setPixel(grid, 4 + i, 4, c);
      setPixel(grid, 4 + i, 5, c);
      setPixel(grid, 4 + i, 30, c);
      setPixel(grid, 4 + i, 31, c);
      setPixel(grid, 4, 4 + i, c);
      setPixel(grid, 5, 4 + i, c);
      setPixel(grid, 30, 4 + i, c);
      setPixel(grid, 31, 4 + i, c);
    }
    fillRect(grid, 16, 14, 4, 10, 0xe8923d);
    fillRect(grid, 13, 16, 10, 3, 0xe8923d);
    fillRect(grid, 14, 13, 8, 3, 0xffc878);
    setPixel(grid, 17, 12, 0xffc878);
    setPixel(grid, 18, 12, 0xffc878);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x080c10);
    g.generateTexture('prop_lift', s, s);
    g.destroy();
  }

  // Contêiner ISO pequeno — decoração do cais (silhueta retangular com
  // nervuras, distinto do caixote de madeira).
  generateContainerProp() {
    if (this.textures.exists('prop_container')) return;
    const grid = createGrid(22, 14);
    fillRect(grid, 1, 1, 20, 12, 0x3a4a38);
    paintOver(grid, 1, 1, 20, 2, 0x5a6a50);
    fillRect(grid, 1, 1, 2, 12, 0x2a3228);
    fillRect(grid, 19, 1, 2, 12, 0x2a3228);
    for (let x = 4; x < 19; x += 3) paintOver(grid, x, 3, 1, 8, 0x2a3228);
    setPixel(grid, 3, 3, 0xe8a030);
    setPixel(grid, 18, 10, 0xe8a030);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x0c1010);
    g.generateTexture('prop_container', 22, 14);
    g.destroy();
  }

  // Cabo solto — decal de piso (feixe de fios caído, sem colisão), usado
  // como detalhe ambiental disperso pela Torre de Controle Logístico.
  // Curva senoidal simples (não reto) pra não parecer o tile de Cabeamento
  // (`generateCableTiles`, que é um puzzle de encanamento, coisa distinta).
  generateCableProp() {
    if (this.textures.exists('prop_cable')) return;
    const w = 22;
    const h = 10;
    const grid = createGrid(w, h);
    const rubber = 0x1c1f22;
    const highlight = 0x33383e;
    const copper = 0xc2793b;
    let lastY = Math.round(h / 2);
    for (let x = 1; x < w - 1; x++) {
      const y = Math.round(h / 2 + Math.sin(x / 3.4) * 2.6);
      fillRect(grid, x, y, 1, 2, rubber);
      setPixel(grid, x, y, highlight);
      lastY = y;
    }
    fillCircle(grid, 1, Math.round(h / 2 + Math.sin(1 / 3.4) * 2.6), 2, copper);
    fillCircle(grid, w - 2, lastY, 2, copper);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x000000);
    g.generateTexture('prop_cable', w, h);
    g.destroy();
  }

  generateCableTiles() {
    if (this.textures.exists('tile_cable_straight_0')) return;
    const s = TILE_SIZE;
    const types = {
      straight: { base: 1 | 4, rots: 2 },
      elbow: { base: 1 | 2, rots: 4 },
      tee: { base: 1 | 2 | 4, rots: 4 }
    };
    const rotate = (mask, times) => {
      let m = mask;
      for (let i = 0; i < times; i++) {
        m = ((m & 1) ? 2 : 0) | ((m & 2) ? 4 : 0) | ((m & 4) ? 8 : 0) | ((m & 8) ? 1 : 0);
      }
      return m;
    };
    for (const [type, cfg] of Object.entries(types)) {
      for (let rot = 0; rot < cfg.rots; rot++) {
        const mask = rotate(cfg.base, rot);
        const grid = createGrid(s, s);
        fillRect(grid, 1, 1, s - 2, s - 2, 0x10181c);
        fillRect(grid, 3, 3, s - 6, s - 6, 0x0a1014);
        const c = s / 2;
        fillRect(grid, c - 3, c - 3, 6, 6, 0x1a3a38);
        if (mask & 1) fillRect(grid, c - 2, 2, 4, c - 2, 0x2ef0c8);
        if (mask & 2) fillRect(grid, c, c - 2, s - 2 - c, 4, 0x2ef0c8);
        if (mask & 4) fillRect(grid, c - 2, c, 4, s - 2 - c, 0x2ef0c8);
        if (mask & 8) fillRect(grid, 2, c - 2, c - 2, 4, 0x2ef0c8);
        paintOver(grid, c - 2, c - 2, 4, 4, 0xb8fff0);
        const g = this.add.graphics();
        renderGrid(g, grid, 0x04080c);
        g.generateTexture(`tile_cable_${type}_${rot}`, s, s);
        g.destroy();
      }
    }
  }

  generateRackProp() {
    if (this.textures.exists('prop_rack')) return;
    const grid = createGrid(14, 22);
    fillRect(grid, 2, 1, 10, 20, 0x141c22);
    paintOver(grid, 3, 2, 8, 18, 0x1a242c);
    for (const y of [4, 8, 12, 16]) {
      fillRect(grid, 4, y, 6, 2, 0x0a1014);
      setPixel(grid, 5, y, 0x2ef0c8);
      setPixel(grid, 8, y + 1, y === 12 ? 0xff3d8a : 0x2ef0c8);
    }
    const g = this.add.graphics();
    renderGrid(g, grid, 0x04080c);
    g.generateTexture('prop_rack', 14, 22);
    g.destroy();
  }

  // Plugues/soquetes do barramento: 5 cores × 2 silhuetas (soquete oco em
  // cima, plugue cheio embaixo). Forma distinta por cor pra ler no escuro.
  generateBusTiles() {
    if (this.textures.exists('tile_bus_plug_4')) return;
    const s = TILE_SIZE;
    const palettes = [
      { fill: 0x2ef0c8, hi: 0xb8fff0, dim: 0x145a52 },
      { fill: 0xf0c02e, hi: 0xfff0a8, dim: 0x6a5a10 },
      { fill: 0xff3d8a, hi: 0xffb0d0, dim: 0x6a1838 },
      { fill: 0x7ec8ff, hi: 0xd0eeff, dim: 0x1a4a6a },
      { fill: 0xb07cff, hi: 0xe0c8ff, dim: 0x4a2870 }
    ];
    const paintFrame = (grid) => {
      fillRect(grid, 0, 0, s, s, 0x080c10);
      fillRect(grid, 1, 1, s - 2, s - 2, 0x1a242c);
      fillRect(grid, 3, 3, s - 6, s - 6, 0x0e161c);
    };
    const paintDiamond = (grid, cx, cy, r, color) => {
      for (let y = cy - r; y <= cy + r; y++) {
        for (let x = cx - r; x <= cx + r; x++) {
          if (Math.abs(x - cx) + Math.abs(y - cy) <= r) setPixel(grid, x, y, color);
        }
      }
    };
    const paintPlus = (grid, cx, cy, r, t, color) => {
      fillRect(grid, cx - t, cy - r, t * 2 + 1, r * 2 + 1, color);
      fillRect(grid, cx - r, cy - t, r * 2 + 1, t * 2 + 1, color);
    };
    const paintTriangle = (grid, cx, cy, r, color) => {
      for (let y = 0; y <= r * 2; y++) {
        const w = Math.floor((y / (r * 2)) * r);
        for (let x = -w; x <= w; x++) setPixel(grid, cx + x, cy - r + y, color);
      }
    };
    const paintShape = (grid, kind, color, r, hollow) => {
      const c = s / 2;
      if (kind === 0) {
        fillCircle(grid, c, c, r, color);
        if (hollow) fillCircle(grid, c, c, r - 4, 0x0e161c);
      } else if (kind === 1) {
        paintDiamond(grid, c, c, r, color);
        if (hollow) paintDiamond(grid, c, c, r - 4, 0x0e161c);
      } else if (kind === 2) {
        fillRect(grid, c - r, c - r, r * 2, r * 2, color);
        if (hollow) fillRect(grid, c - r + 4, c - r + 4, r * 2 - 8, r * 2 - 8, 0x0e161c);
      } else if (kind === 3) {
        paintPlus(grid, c, c, r, hollow ? 3 : 4, color);
        if (hollow) paintPlus(grid, c, c, r - 4, 1, 0x0e161c);
      } else {
        paintTriangle(grid, c, c, r, color);
        if (hollow) paintTriangle(grid, c, c + 2, r - 5, 0x0e161c);
      }
    };

    for (let n = 0; n < palettes.length; n++) {
      const pal = palettes[n];
      const socket = createGrid(s, s);
      paintFrame(socket);
      paintShape(socket, n, pal.dim, 11, false);
      paintShape(socket, n, pal.fill, 11, true);
      paintOver(socket, s / 2 - 1, s - 8, 2, 5, pal.fill);
      const gSock = this.add.graphics();
      renderGrid(gSock, socket, 0x04080c);
      gSock.generateTexture(`tile_bus_socket_${n}`, s, s);
      gSock.destroy();

      const plug = createGrid(s, s);
      paintFrame(plug);
      paintShape(plug, n, pal.fill, 11, false);
      paintShape(plug, n, pal.hi, 5, false);
      paintOver(plug, s / 2 - 1, 3, 2, 5, pal.fill);
      const gPlug = this.add.graphics();
      renderGrid(gPlug, plug, 0x04080c);
      gPlug.generateTexture(`tile_bus_plug_${n}`, s, s);
      gPlug.destroy();
    }
  }

  generateFirewallProp() {
    if (this.textures.exists('prop_firewall')) return;
    const grid = createGrid(16, 24);
    fillRect(grid, 6, 1, 4, 22, 0x0a2424);
    paintOver(grid, 7, 2, 2, 20, 0x2ef0c8);
    for (const y of [4, 10, 16]) setPixel(grid, 7, y, 0xb8fff0);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x04080c);
    g.generateTexture('prop_firewall', 16, 24);
    g.destroy();
  }

  // Drone de Firewall — caixa baixa com antena e um painel LED vertical.
  generateFirewallEnemy() {
    if (this.textures.exists('enemy_firewall')) return;
    const w = 16;
    const h = 20;
    const grid = createGrid(w, h);
    fillRect(grid, 3, 8, 10, 8, 0x1a242c);
    paintOver(grid, 4, 9, 8, 4, 0x243038);
    fillRect(grid, 7, 2, 2, 7, 0x2ef0c8);
    setPixel(grid, 7, 2, 0xb8fff0);
    fillRect(grid, 5, 11, 6, 2, 0x0a1014);
    setPixel(grid, 6, 11, 0x2ef0c8);
    setPixel(grid, 9, 12, 0xff3d8a);
    fillRect(grid, 4, 16, 3, 4, 0x141c22);
    fillRect(grid, 9, 16, 3, 4, 0x141c22);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x04080c);
    g.generateTexture('enemy_firewall', w, h);
    g.destroy();
  }

  // Sonda Sifão — disco flutuante com funil magenta (drena carga).
  generateSiphonEnemy() {
    if (this.textures.exists('enemy_siphon')) return;
    const w = 22;
    const h = 22;
    const grid = createGrid(w, h);
    fillCircle(grid, 11, 10, 8, 0x1a1824);
    fillCircle(grid, 11, 10, 5, 0x2a2238);
    fillCircle(grid, 11, 10, 2, 0xff3d8a);
    fillRect(grid, 10, 16, 2, 5, 0x2ef0c8);
    setPixel(grid, 10, 16, 0xff3d8a);
    setPixel(grid, 7, 8, 0x2ef0c8);
    setPixel(grid, 15, 8, 0x2ef0c8);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x04080c);
    g.generateTexture('enemy_siphon', w, h);
    g.destroy();
  }

  // O Sysadmin — humanoide de jaleco escuro, visor teal, tablet na mão.
  generateSysadminMiniBoss() {
    if (this.textures.exists('enemy_sysadmin')) return;
    const w = 24;
    const h = 28;
    const grid = createGrid(w, h);
    fillCircle(grid, 12, 6, 5, 0x3a342c);
    fillRect(grid, 8, 5, 8, 2, 0x1a242c);
    fillRect(grid, 8, 6, 8, 2, 0x2ef0c8);
    setPixel(grid, 9, 6, 0xb8fff0);
    fillRect(grid, 6, 12, 12, 10, 0x1a242c);
    paintOver(grid, 7, 13, 10, 4, 0x243038);
    fillRect(grid, 10, 12, 4, 8, 0x2a3a40);
    fillRect(grid, 2, 14, 5, 4, 0x3a342c);
    fillRect(grid, 18, 13, 4, 6, 0x0a1014);
    setPixel(grid, 19, 15, 0x2ef0c8);
    fillRect(grid, 7, 22, 4, 6, 0x141018);
    fillRect(grid, 13, 22, 4, 6, 0x141018);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x04080c);
    g.generateTexture('enemy_sysadmin', w, h);
    g.destroy();
  }

  // O Administrador — humano com arnês de rack nas costas e visor de dois
  // monitores. Fecha o Submundo: quem roteava o contrabando, não quem cobrava.
  generateAdministradorBoss() {
    if (this.textures.exists('boss_administrador')) return;
    const w = 44;
    const h = 46;
    const grid = createGrid(w, h);
    const suit = 0x1a242c;
    const suitLight = 0x2a3840;
    const visor = 0x2ef0c8;
    const mag = 0xff3d8a;

    fillCircle(grid, 22, 10, 8, 0x2a241c);
    fillRect(grid, 14, 8, 16, 5, 0x0a1014);
    fillRect(grid, 15, 9, 6, 3, visor);
    fillRect(grid, 23, 9, 6, 3, mag);
    setPixel(grid, 16, 9, 0xb8fff0);
    setPixel(grid, 24, 9, 0xff9ad0);

    fillRect(grid, 12, 18, 20, 16, suit);
    paintOver(grid, 14, 20, 16, 6, suitLight);
    fillRect(grid, 20, 18, 4, 14, 0x0a1014);
    for (const y of [20, 24, 28]) setPixel(grid, 21, y, visor);

    fillRect(grid, 6, 16, 7, 12, 0x141c22);
    fillRect(grid, 31, 16, 7, 12, 0x141c22);
    for (const x of [8, 33]) {
      setPixel(grid, x, 18, visor);
      setPixel(grid, x, 22, mag);
      setPixel(grid, x, 26, visor);
    }

    fillRect(grid, 4, 20, 4, 8, 0x3a342c);
    fillRect(grid, 36, 20, 4, 8, 0x3a342c);

    fillRect(grid, 14, 34, 6, 12, 0x0e1218);
    fillRect(grid, 24, 34, 6, 12, 0x0e1218);

    const noise = createNoise2D();
    mottle(grid, noise, { color: 0x243038, threshold: 0.5, scale: 0.3, region: { x0: 12, y0: 18, w: 20, h: 16 } });

    const g = this.add.graphics();
    renderGrid(g, grid, 0x04080c);
    g.generateTexture('boss_administrador', w, h);
    g.destroy();
  }

  // Drone de Carga — AGV baixo com contêiner no dorso e faróis âmbar.
  // Silhueta retangular (não disco, não humanoide) pra ler como veículo de pátio.
  generateCargoDrone() {
    if (this.textures.exists('enemy_cargo')) return;
    const w = 20;
    const h = 16;
    const grid = createGrid(w, h);
    fillRect(grid, 2, 8, 16, 6, 0x2a3238);
    paintOver(grid, 3, 9, 14, 3, 0x3a4850);
    fillRect(grid, 4, 3, 12, 7, 0x3a4a38);
    paintOver(grid, 4, 3, 12, 2, 0x5a6a50);
    for (let x = 6; x < 16; x += 3) paintOver(grid, x, 5, 1, 4, 0x2a3228);
    setPixel(grid, 5, 4, 0xe8a030);
    setPixel(grid, 14, 8, 0xe8a030);
    fillRect(grid, 1, 12, 4, 3, 0x141c22);
    fillRect(grid, 15, 12, 4, 3, 0x141c22);
    setPixel(grid, 2, 10, 0xffc878);
    setPixel(grid, 17, 10, 0xffc878);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x080c10);
    g.generateTexture('enemy_cargo', w, h);
    g.destroy();
  }

  // Empilhadeira — mastro alto + garfo, corpo de cabine. Mais alto que o
  // drone de carga, lê como veículo de corredor, não AGV de avenida.
  generateStackerEnemy() {
    if (this.textures.exists('enemy_stacker')) return;
    const w = 18;
    const h = 24;
    const grid = createGrid(w, h);
    fillRect(grid, 8, 1, 3, 14, 0x2a3238);
    paintOver(grid, 9, 2, 1, 12, 0xe8a030);
    fillRect(grid, 3, 14, 12, 8, 0x3a3228);
    paintOver(grid, 4, 15, 10, 4, 0x4a4238);
    fillRect(grid, 5, 16, 6, 4, 0x1a2228);
    setPixel(grid, 7, 17, 0xe8923d);
    setPixel(grid, 8, 17, 0xffc878);
    fillRect(grid, 1, 12, 7, 2, 0x8a9aa4);
    fillRect(grid, 1, 10, 2, 4, 0x6a7a84);
    fillRect(grid, 3, 22, 4, 2, 0x141c22);
    fillRect(grid, 11, 22, 4, 2, 0x141c22);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x080c10);
    g.generateTexture('enemy_stacker', w, h);
    g.destroy();
  }

  // O Estivador — humanoide de colete âmbar, capacete e gancho na mão.
  generateEstivadorMiniBoss() {
    if (this.textures.exists('enemy_estivador')) return;
    const w = 24;
    const h = 28;
    const grid = createGrid(w, h);
    fillCircle(grid, 12, 6, 5, 0x3a342c);
    fillRect(grid, 8, 3, 8, 3, 0xe8a030);
    paintOver(grid, 9, 4, 6, 1, 0xffc878);
    fillRect(grid, 6, 12, 12, 10, 0x2a3238);
    paintOver(grid, 7, 13, 10, 4, 0xe8923d);
    fillRect(grid, 10, 12, 4, 8, 0x1a2228);
    fillRect(grid, 2, 14, 5, 4, 0x3a342c);
    fillRect(grid, 17, 12, 5, 8, 0x8a9aa4);
    setPixel(grid, 19, 11, 0xe8a030);
    fillRect(grid, 7, 22, 4, 6, 0x141018);
    fillRect(grid, 13, 22, 4, 6, 0x141018);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x080c10);
    g.generateTexture('enemy_estivador', w, h);
    g.destroy();
  }

  // O Empilhador — ponte rolante andante: pernas de pórtico, contêiner
  // preso no gancho, cabine no meio. Maior que o Estivador, lê como máquina
  // de pátio, não humano.
  generateEmpilhadorBoss() {
    if (this.textures.exists('boss_empilhador')) return;
    const w = 48;
    const h = 46;
    const grid = createGrid(w, h);
    const steel = 0x2a3238;
    const steelLight = 0x3a4850;
    const amber = 0xe8923d;
    const crate = 0x3a4a38;

    fillRect(grid, 4, 2, 40, 4, steel);
    paintOver(grid, 6, 3, 36, 2, amber);
    fillRect(grid, 6, 6, 4, 16, steel);
    fillRect(grid, 38, 6, 4, 16, steel);
    paintOver(grid, 7, 6, 2, 16, steelLight);
    paintOver(grid, 39, 6, 2, 16, steelLight);

    fillRect(grid, 14, 8, 20, 10, crate);
    paintOver(grid, 14, 8, 20, 2, 0x5a6a50);
    for (let x = 17; x < 32; x += 4) paintOver(grid, x, 10, 1, 6, 0x2a3228);
    setPixel(grid, 16, 10, amber);
    setPixel(grid, 31, 16, amber);

    fillRect(grid, 18, 20, 12, 12, steel);
    paintOver(grid, 20, 22, 8, 6, steelLight);
    fillRect(grid, 22, 24, 4, 3, 0x1a2228);
    setPixel(grid, 23, 25, amber);
    setPixel(grid, 24, 25, 0xffc878);

    fillRect(grid, 8, 32, 8, 12, 0x1a2228);
    fillRect(grid, 32, 32, 8, 12, 0x1a2228);
    paintOver(grid, 10, 34, 4, 8, steel);
    paintOver(grid, 34, 34, 4, 8, steel);
    fillRect(grid, 6, 42, 12, 3, 0x141c22);
    fillRect(grid, 30, 42, 12, 3, 0x141c22);

    const noise = createNoise2D();
    mottle(grid, noise, { color: 0x6a3a22, threshold: 0.62, scale: 0.4, region: { x0: 14, y0: 8, w: 20, h: 10 } });

    const g = this.add.graphics();
    renderGrid(g, grid, 0x080c10);
    g.generateTexture('boss_empilhador', w, h);
    g.destroy();
  }

  // --- Fase 14 (Refinaria Offshore) ---------------------------------------

  // Prancha de ponte — grade metálica com faixa de risco nas bordas curtas
  // (perpendicular ao sentido da travessia). Some/reaparece por cima da
  // água quando um trecho desmorona (ver RefinariaScene._buildBridges).
  generateFloorBridge(key) {
    if (this.textures.exists(key)) return;
    const s = TILE_SIZE;
    const steel = 0x3a4048;
    const steelLight = 0x4a5460;
    const grid = createGrid(s, s);
    fillRect(grid, 0, 0, s, s, steel);
    for (let i = -s; i < s * 2; i += 5) {
      for (let x = 0; x < s; x++) {
        const y = x + i;
        if (y >= 0 && y < s) setPixel(grid, x, y, steelLight);
      }
    }
    paintOver(grid, 0, 0, s, 2, 0xe8b93d);
    paintOver(grid, 0, s - 2, s, 2, 0xe8b93d);
    for (let x = 2; x < s; x += 6) {
      setPixel(grid, x, 1, 0x1a1408);
      setPixel(grid, x + 3, s - 2, 0x1a1408);
    }
    const g = this.add.graphics();
    renderGrid(g, grid, 0x14181c);
    g.generateTexture(key, s, s);
    g.destroy();
  }

  // Água aberta — base azul-petróleo escura com faixas de onda claras
  // deslocadas por fileira (não mottle orgânico, que lê como sujeira/lodo,
  // não líquido). Pulsa via HAZARD_PULSE.water (TileMap).
  generateWaterFloor(key) {
    if (this.textures.exists(key)) return;
    const s = TILE_SIZE;
    const grid = createGrid(s, s);
    fillRect(grid, 0, 0, s, s, 0x0c2430);
    const waveNoise = createNoise2D();
    mottle(grid, waveNoise, { color: 0x0a1c26, threshold: 0.45, scale: 0.5 });
    for (let y = 3; y < s; y += 7) {
      const offset = (y * 3) % 10;
      for (let x = 0; x < s - 4; x++) {
        if ((x + offset) % 10 < 3) setPixel(grid, x, y, 0x1c4a5c);
      }
    }
    setPixel(grid, 6, 9, 0x6fd0e8);
    setPixel(grid, 22, 17, 0x6fd0e8);
    setPixel(grid, 14, 25, 0x6fd0e8);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x040a0e);
    g.generateTexture(key, s, s);
    g.destroy();
  }

  // Inimigo comum da Refinaria — drone de manutenção flutuante, corpo
  // compacto em aço/azul com luz de aviso giratória (distinto do drone de
  // carga do Terminal, que é mais alongado/veicular).
  generateEnemyRefinaria() {
    if (this.textures.exists('enemy_refinaria')) return;
    const w = 18;
    const h = 18;
    const grid = createGrid(w, h);
    const steel = 0x2a3844;
    const steelLight = 0x3f5462;
    fillCircle(grid, 9, 9, 7, steel);
    fillCircle(grid, 9, 8, 5, steelLight);
    fillRect(grid, 7, 5, 4, 3, 0x14181c);
    setPixel(grid, 8, 6, 0x6fd0e8);
    setPixel(grid, 9, 6, 0x9fe8f8);
    fillRect(grid, 2, 9, 3, 2, 0x1a2228);
    fillRect(grid, 13, 9, 3, 2, 0x1a2228);
    setPixel(grid, 9, 2, 0xc23b3b);
    setPixel(grid, 9, 1, 0xff7a6a);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x080c10);
    g.generateTexture('enemy_refinaria', w, h);
    g.destroy();
  }

  // Operário de Convés — inimigo grande que empurra (PusherEnemy). Corpo
  // largo e baixo, aríete hidráulico estendido à frente (a parte que golpeia
  // o jogador) — silhueta bem mais robusta que os grunts, lê como "vai te
  // empurrar", não "vai te perseguir rápido".
  generatePusherEnemy() {
    if (this.textures.exists('enemy_pusher')) return;
    const w = 26;
    const h = 26;
    const grid = createGrid(w, h);
    const steel = 0x3a3038;
    const steelLight = 0x4a3c44;
    const accent = 0xc23b3b;
    fillCircle(grid, 13, 7, 5, 0x3a342c);
    fillRect(grid, 9, 4, 8, 3, accent);
    fillRect(grid, 5, 12, 16, 11, steel);
    paintOver(grid, 6, 13, 14, 4, steelLight);
    fillRect(grid, 9, 13, 8, 3, 0x1a2228);
    setPixel(grid, 11, 14, accent);
    setPixel(grid, 14, 14, 0xff7a6a);
    // Aríete — placa larga estendida à frente (sul, direção de golpe padrão).
    fillRect(grid, 6, 22, 14, 3, 0x8a9aa4);
    paintOver(grid, 6, 22, 14, 1, 0xc4d0d8);
    fillRect(grid, 3, 12, 3, 8, steel);
    fillRect(grid, 20, 12, 3, 8, steel);
    fillRect(grid, 6, 23, 3, 3, 0x14181c);
    fillRect(grid, 17, 23, 3, 3, 0x14181c);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x080c10);
    g.generateTexture('enemy_pusher', w, h);
    g.destroy();
  }

  // A Perfuratriz (Fase 14) — torre de perfuração ambulante: broca cônica
  // no topo (gira/desce no ataque de solo), corpo de rig sobre um tripé
  // largo. Maior que O Empilhador, silhueta vertical (torre), não
  // horizontal (ponte rolante) — leitura oposta de propósito.
  generatePerfuratrizBoss() {
    if (this.textures.exists('boss_perfuratriz')) return;
    const w = 46;
    const h = 52;
    const grid = createGrid(w, h);
    const steel = 0x2a3844;
    const steelLight = 0x3f5462;
    const accent = 0x2f6fa8;
    const bit = 0x8a9aa4;

    // Broca — cone no topo (fillRect, não paintOver: nada foi preenchido
    // ainda nesse grid pra "repintar" em cima).
    for (let i = 0; i < 10; i++) {
      const width = 12 - i;
      fillRect(grid, 23 - Math.floor(width / 2), 1 + i, width, 1, i % 2 === 0 ? bit : steelLight);
    }
    setPixel(grid, 23, 1, 0xdfe8ec);

    // Torre — corpo alongado com trilhos.
    fillRect(grid, 17, 11, 12, 20, steel);
    paintOver(grid, 19, 11, 2, 20, steelLight);
    paintOver(grid, 27, 11, 2, 20, steelLight);
    for (let y = 13; y < 30; y += 4) paintOver(grid, 18, y, 10, 1, accent);

    // Cabine central.
    fillRect(grid, 14, 31, 18, 9, steel);
    paintOver(grid, 16, 32, 14, 5, steelLight);
    fillRect(grid, 18, 33, 10, 4, 0x14181c);
    setPixel(grid, 20, 34, accent);
    setPixel(grid, 25, 34, 0x6fd0e8);

    // Tripé — três pernas largas plantadas no convés.
    fillRect(grid, 4, 40, 8, 11, 0x1a2228);
    fillRect(grid, 19, 40, 8, 11, 0x1a2228);
    fillRect(grid, 34, 40, 8, 11, 0x1a2228);
    paintOver(grid, 6, 42, 4, 8, steel);
    paintOver(grid, 21, 42, 4, 8, steel);
    paintOver(grid, 36, 42, 4, 8, steel);
    fillRect(grid, 2, 49, 10, 3, 0x101418);
    fillRect(grid, 17, 49, 10, 3, 0x101418);
    fillRect(grid, 32, 49, 10, 3, 0x101418);

    const noise = createNoise2D();
    mottle(grid, noise, { color: 0x1c2a34, threshold: 0.6, scale: 0.35, region: { x0: 14, y0: 31, w: 18, h: 9 } });

    const g = this.add.graphics();
    renderGrid(g, grid, 0x080c10);
    g.generateTexture('boss_perfuratriz', w, h);
    g.destroy();
  }

  // Mancha de óleo — decal achatado de piso (sem contorno grosso, quase
  // sem relevo), usado espalhado pelas plataformas da Refinaria. Formato
  // irregular (3 círculos sobrepostos), não um círculo perfeito.
  generateOilStainProp() {
    if (this.textures.exists('prop_oilstain')) return;
    const w = 20;
    const h = 14;
    const grid = createGrid(w, h);
    fillCircle(grid, 9, 7, 6, 0x0a0a0c);
    fillCircle(grid, 5, 6, 4, 0x0a0a0c);
    fillCircle(grid, 14, 8, 4, 0x0a0a0c);
    fillCircle(grid, 9, 6, 4, 0x141216);
    setPixel(grid, 7, 4, 0x2a2430);
    setPixel(grid, 12, 6, 0x241f28);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x000000);
    g.generateTexture('prop_oilstain', w, h);
    g.destroy();
  }

  // O Guincheiro (Fase 14) — humanoide de guindaste: capacete vermelho,
  // bobina de cabo (carretel) nas costas em vez de mochila comum, e um
  // gancho grande pendurado numa corrente na mão — silhueta própria,
  // distinta do Operário de Convés genérico (enemy_pusher, sem gancho/
  // carretel) e do gancho pequeno do Estivador (Terminal).
  generateGuincheiroMiniBoss() {
    if (this.textures.exists('enemy_guincheiro')) return;
    const w = 28;
    const h = 32;
    const grid = createGrid(w, h);
    const steel = 0x2a3238;
    const steelLight = 0x3a4850;
    const red = 0xc23b3b;
    const redLight = 0xff7a6a;

    // Cabeça + capacete.
    fillCircle(grid, 13, 7, 6, 0x3a342c);
    fillRect(grid, 8, 3, 10, 4, red);
    paintOver(grid, 9, 4, 8, 1, redLight);
    setPixel(grid, 11, 8, 0x141018);
    setPixel(grid, 15, 8, 0x141018);

    // Tronco (colete de estiva vermelho sobre steel).
    fillRect(grid, 6, 14, 15, 11, steel);
    paintOver(grid, 7, 15, 13, 4, red);
    fillRect(grid, 10, 15, 5, 8, 0x1a2228);
    setPixel(grid, 12, 17, redLight);

    // Braço esquerdo.
    fillRect(grid, 1, 15, 5, 9, steel);
    paintOver(grid, 1, 15, 2, 9, steelLight);

    // Carretel de cabo nas costas — dois anéis concêntricos + eixo escuro,
    // é o que diferencia o Guincheiro de qualquer outro inimigo da fase.
    fillCircle(grid, 22, 12, 6, 0x4a4a4a);
    fillCircle(grid, 22, 12, 4, 0x2a2a2a);
    fillCircle(grid, 22, 12, 1, 0x141414);
    for (let a = 0; a < 8; a++) {
      const ang = (Math.PI * 2 * a) / 8;
      setPixel(grid, Math.round(22 + Math.cos(ang) * 5), Math.round(12 + Math.sin(ang) * 5), 0x6a6a6a);
    }

    // Braço direito + corrente e gancho grande pendurado.
    fillRect(grid, 20, 15, 5, 8, steel);
    paintOver(grid, 22, 15, 2, 8, steelLight);
    fillRect(grid, 22, 23, 2, 5, 0x6a7a84);
    fillRect(grid, 20, 27, 3, 2, 0x8a9aa4);
    fillRect(grid, 20, 29, 2, 2, 0x6a7a84);

    // Pernas/botas.
    fillRect(grid, 8, 25, 5, 7, 0x141018);
    fillRect(grid, 15, 25, 5, 7, 0x141018);

    const g = this.add.graphics();
    renderGrid(g, grid, 0x080c10);
    g.generateTexture('enemy_guincheiro', w, h);
    g.destroy();
  }

  // Torre de resfriamento pequena — chaminé industrial estreita, base larga
  // + corpo afunilado + boca escura no topo (de onde a cena solta partículas
  // de fumaça, ver RefinariaScene._spawnSmokePuff).
  generateSmokestackProp() {
    if (this.textures.exists('prop_smokestack')) return;
    const w = 12;
    const h = 26;
    const grid = createGrid(w, h);
    const steel = 0x3a4048;
    const steelLight = 0x4a5460;
    fillRect(grid, 1, 18, 10, 8, steel);
    paintOver(grid, 2, 19, 8, 2, steelLight);
    fillRect(grid, 3, 4, 6, 14, steel);
    paintOver(grid, 3, 4, 2, 14, steelLight);
    for (let y = 6; y < 18; y += 4) paintOver(grid, 3, y, 6, 1, 0x2a3238);
    fillCircle(grid, 6, 4, 3, 0x14181c);
    paintOver(grid, 0, 17, 12, 1, 0xe8b93d);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x080c10);
    g.generateTexture('prop_smokestack', w, h);
    g.destroy();
  }

  // --- Fase 15 (Estaleiro Naval) -------------------------------------

  // Esteiras transportadoras — 4 variantes direcionais (seta + friso de
  // esteira). A cor muda com o tint/scale em tempo real só nos braços
  // robóticos (ver prop_robotarm); aqui a direção já é a própria arte.
  generateConveyorTiles() {
    if (this.textures.exists('conveyor_right')) return;
    const s = TILE_SIZE;
    const base = 0x232a30;
    const accent = 0x8fe0ff;

    const drawArrow = (grid, dir, color) => {
      const half0 = 9;
      for (let i = 4; i <= 26; i++) {
        const t = (i - 4) / 22;
        const half = Math.round(half0 * (1 - t));
        if (half <= 0) continue;
        if (dir === 'right') fillRect(grid, i, s / 2 - half, 1, half * 2, color);
        else if (dir === 'left') fillRect(grid, s - i, s / 2 - half, 1, half * 2, color);
        else if (dir === 'down') fillRect(grid, s / 2 - half, i, half * 2, 1, color);
        else fillRect(grid, s / 2 - half, s - i, half * 2, 1, color);
      }
    };

    for (const dir of ['right', 'left', 'down', 'up']) {
      const grid = createGrid(s, s);
      fillRect(grid, 0, 0, s, s, base);
      paintOver(grid, 0, 0, s, 2, 0x1a2024);
      paintOver(grid, 0, s - 2, s, 2, 0x1a2024);
      drawArrow(grid, dir, accent);
      const g = this.add.graphics();
      renderGrid(g, grid, 0x0c1418);
      g.generateTexture(`conveyor_${dir}`, s, s);
      g.destroy();
    }
  }

  // Braço robótico — poste + braço vertical articulado + cabeça de
  // estampagem no topo. Estado (idle/telegraph/strike) é só tint/scale
  // aplicado em tempo real pela cena (EstaleiroNavalScene._updateArms),
  // não frames separados.
  generateRobotArmProp() {
    if (this.textures.exists('prop_robotarm')) return;
    const w = 20;
    const h = 28;
    const grid = createGrid(w, h);
    const steel = 0x3a4048;
    const steelLight = 0x4a5460;
    const joint = 0x1a2228;
    fillRect(grid, 7, 18, 6, 10, steel);
    paintOver(grid, 8, 19, 4, 8, steelLight);
    fillRect(grid, 8, 4, 4, 16, steel);
    paintOver(grid, 8, 4, 2, 16, steelLight);
    fillCircle(grid, 10, 18, 3, joint);
    fillRect(grid, 5, 1, 10, 5, 0x2a3238);
    paintOver(grid, 6, 2, 8, 2, steelLight);
    setPixel(grid, 10, 3, 0xffe066);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x080c10);
    g.generateTexture('prop_robotarm', w, h);
    g.destroy();
  }

  // O Supervisor — capataz robótico: capacete escuro com visor âmbar,
  // scanner/prancheta na mão em vez de gancho ou carretel — silhueta
  // própria, distinta d'O Guincheiro (Refinaria) e d'O Estivador (Terminal).
  generateSupervisorMiniBoss() {
    if (this.textures.exists('enemy_supervisor')) return;
    const w = 24;
    const h = 28;
    const grid = createGrid(w, h);
    const steel = 0x2a3238;
    const amber = 0xe8c23d;
    fillCircle(grid, 12, 6, 6, 0x1a2228);
    fillRect(grid, 9, 5, 6, 2, amber);
    setPixel(grid, 12, 6, 0xfff2b0);
    fillRect(grid, 6, 12, 12, 10, steel);
    paintOver(grid, 7, 13, 10, 4, amber);
    fillRect(grid, 10, 12, 4, 8, 0x14181c);
    fillRect(grid, 2, 14, 5, 8, steel);
    fillRect(grid, 17, 14, 5, 8, steel);
    fillRect(grid, 16, 20, 6, 4, 0x14181c);
    setPixel(grid, 18, 21, amber);
    fillRect(grid, 7, 22, 4, 6, 0x141018);
    fillRect(grid, 13, 22, 4, 6, 0x141018);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x080c10);
    g.generateTexture('enemy_supervisor', w, h);
    g.destroy();
  }

  // A Protótipo (Fase 15) — o primeiro casco completo saído da linha:
  // mech humanoide largo com braço-canhão de um lado e braço-marreta do
  // outro. Maior que qualquer chefe anterior — silhueta de "boss final de
  // região", não mais um veículo/torre (Empilhador/Perfuratriz).
  generatePrototipoBoss() {
    if (this.textures.exists('boss_prototipo')) return;
    const w = 50;
    const h = 54;
    const grid = createGrid(w, h);
    const steel = 0x2a3844;
    const steelLight = 0x3f5462;
    const accent = 0x8fe0ff;
    const dark = 0x14181c;

    fillRect(grid, 20, 2, 10, 6, steel);
    paintOver(grid, 21, 3, 8, 2, steelLight);
    fillCircle(grid, 25, 6, 2, accent);

    fillRect(grid, 14, 9, 22, 16, steel);
    paintOver(grid, 16, 10, 18, 6, steelLight);
    fillRect(grid, 20, 12, 10, 6, dark);
    setPixel(grid, 23, 14, accent);
    setPixel(grid, 27, 16, accent);

    // Braço-canhão.
    fillRect(grid, 2, 14, 10, 8, steel);
    paintOver(grid, 3, 15, 8, 3, steelLight);
    fillRect(grid, 0, 16, 4, 4, dark);
    setPixel(grid, 1, 17, accent);

    // Braço-marreta.
    fillRect(grid, 38, 14, 10, 8, steel);
    paintOver(grid, 39, 15, 8, 3, steelLight);
    fillRect(grid, 44, 10, 6, 8, dark);
    paintOver(grid, 45, 11, 4, 3, steelLight);

    fillRect(grid, 16, 25, 8, 16, dark);
    fillRect(grid, 26, 25, 8, 16, dark);
    paintOver(grid, 17, 27, 3, 12, steel);
    paintOver(grid, 27, 27, 3, 12, steel);
    fillRect(grid, 14, 41, 12, 4, 0x101418);
    fillRect(grid, 24, 41, 12, 4, 0x101418);

    const noise = createNoise2D();
    mottle(grid, noise, { color: 0x1c2a34, threshold: 0.62, scale: 0.35, region: { x0: 14, y0: 9, w: 22, h: 16 } });

    const g = this.add.graphics();
    renderGrid(g, grid, 0x080c10);
    g.generateTexture('boss_prototipo', w, h);
    g.destroy();
  }

  // --- Fase 16 (Torre de Controle Logístico) --------------------------

  // O Operador Mestre — capacete de guindasteiro + alavanca de controle na
  // mão (em vez do gancho do Estivador ou do carretel do Guincheiro) —
  // silhueta própria, âmbar como o resto do Estaleiro.
  generateOperadorMestreMiniBoss() {
    if (this.textures.exists('enemy_operador_mestre')) return;
    const w = 24;
    const h = 28;
    const grid = createGrid(w, h);
    const steel = 0x2a3238;
    const amber = 0xe8923d;
    fillCircle(grid, 12, 6, 6, 0x3a342c);
    fillRect(grid, 8, 3, 8, 4, amber);
    paintOver(grid, 9, 4, 6, 1, 0xffc878);
    setPixel(grid, 10, 7, 0x141018);
    setPixel(grid, 14, 7, 0x141018);
    fillRect(grid, 6, 12, 12, 10, steel);
    paintOver(grid, 7, 13, 10, 4, amber);
    fillRect(grid, 10, 12, 4, 8, 0x14181c);
    fillRect(grid, 2, 14, 5, 8, steel);
    // Alavanca de controle na mão direita.
    fillRect(grid, 17, 10, 2, 10, 0x6a7a84);
    fillCircle(grid, 18, 9, 2, 0xff4a5e);
    fillRect(grid, 15, 18, 8, 4, 0x1a2228);
    fillRect(grid, 7, 22, 4, 6, 0x141018);
    fillRect(grid, 13, 22, 4, 6, 0x141018);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x080c10);
    g.generateTexture('enemy_operador_mestre', w, h);
    g.destroy();
  }

  // A Guardiã de Tráfego — visor azul, capacete com antena curta, e uma
  // pá/bastão de sinalização erguido em vez de arma — controla o tráfego
  // da esteira, não ataca de longe.
  generateGuardiaTrafegoMiniBoss() {
    if (this.textures.exists('enemy_guardia_trafego')) return;
    const w = 24;
    const h = 28;
    const grid = createGrid(w, h);
    const steel = 0x2a3844;
    const accent = 0x8fe0ff;
    fillCircle(grid, 12, 6, 6, 0x1a2228);
    fillRect(grid, 9, 5, 6, 2, accent);
    setPixel(grid, 12, 6, 0xdfffff);
    fillRect(grid, 11, 1, 2, 4, 0x6a7a84);
    setPixel(grid, 12, 1, 0xff4a5e);
    fillRect(grid, 6, 12, 12, 10, steel);
    paintOver(grid, 7, 13, 10, 4, accent);
    fillRect(grid, 10, 12, 4, 8, 0x14181c);
    fillRect(grid, 17, 14, 5, 8, steel);
    // Pá de sinalização erguida na mão esquerda.
    fillRect(grid, 3, 4, 2, 12, 0x6a7a84);
    fillCircle(grid, 4, 4, 4, accent);
    setPixel(grid, 4, 4, 0xdfffff);
    fillRect(grid, 7, 22, 4, 6, 0x141018);
    fillRect(grid, 13, 22, 4, 6, 0x141018);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x080c10);
    g.generateTexture('enemy_guardia_trafego', w, h);
    g.destroy();
  }

  // O Regente (Fase 16) — console-trono fundido a um corpo mecânico: base
  // larga de comando com telas, torso erguendo-se do meio, braços curtos
  // de canhão + marreta. Maior que qualquer chefe anterior — a Torre
  // literalmente vira o comando dela num corpo de combate.
  generateRegenteBoss() {
    if (this.textures.exists('boss_regente')) return;
    const w = 52;
    const h = 56;
    const grid = createGrid(w, h);
    const steel = 0x2a2438;
    const steelLight = 0x3f3a54;
    const accent = 0xffb347;
    const dark = 0x14181c;

    // Cabeça/sensor central.
    fillRect(grid, 21, 2, 10, 6, steel);
    paintOver(grid, 22, 3, 8, 2, steelLight);
    fillCircle(grid, 26, 6, 2, accent);

    // Tronco largo.
    fillRect(grid, 13, 9, 26, 16, steel);
    paintOver(grid, 15, 10, 22, 6, steelLight);
    fillRect(grid, 20, 12, 12, 6, dark);
    setPixel(grid, 23, 14, accent); setPixel(grid, 26, 14, accent); setPixel(grid, 29, 14, accent);
    setPixel(grid, 24, 16, 0xffe066); setPixel(grid, 28, 16, 0xffe066);

    // Braço-canhão.
    fillRect(grid, 1, 14, 11, 8, steel);
    paintOver(grid, 2, 15, 9, 3, steelLight);
    fillRect(grid, 0, 16, 4, 4, dark);
    setPixel(grid, 1, 17, accent);

    // Braço-marreta.
    fillRect(grid, 40, 14, 11, 8, steel);
    paintOver(grid, 41, 15, 9, 3, steelLight);
    fillRect(grid, 47, 10, 6, 8, dark);
    paintOver(grid, 48, 11, 4, 3, steelLight);

    // Base-console larga (trono).
    fillRect(grid, 10, 25, 32, 14, dark);
    paintOver(grid, 12, 27, 28, 8, steel);
    for (let x = 15; x < 38; x += 6) paintOver(grid, x, 29, 3, 3, accent);
    fillRect(grid, 8, 39, 10, 8, 0x101418);
    fillRect(grid, 34, 39, 10, 8, 0x101418);
    fillRect(grid, 18, 39, 16, 10, 0x101418);
    paintOver(grid, 20, 41, 12, 6, steel);

    const noise = createNoise2D();
    mottle(grid, noise, { color: 0x241f38, threshold: 0.62, scale: 0.35, region: { x0: 13, y0: 9, w: 26, h: 16 } });

    const g = this.add.graphics();
    renderGrid(g, grid, 0x080c10);
    g.generateTexture('boss_regente', w, h);
    g.destroy();
  }

  // --- Região 5 / Fase 17 (Torre Matriz, Átrio Executivo) ----------------
  // Linguagem visual oposta à das quatro regiões anteriores: nada de chapa
  // corrugada, rebite ou faixa de risco. Pedra escura polida, fio de latão e
  // vidro — o único lugar do jogo construído pra impressionar visita.

  // Variante de piso com embutido de latão em moldura quadrada — o "tapete"
  // de pedra da sede, não a faixa de risco amarela do cais.
  generateFloorGoldInlay(key, base) {
    if (this.textures.exists(key)) return;
    const s = TILE_SIZE;
    // Latão escurecido: em área grande, o dourado cheio vira bolinha
    // repetida no chão em vez de ornamento.
    const brass = 0x6f5628;
    const grid = createGrid(s, s);
    fillRect(grid, 0, 0, s, s, base);
    const noise = createNoise2D();
    mottle(grid, noise, { color: this._shade(base, -8, -8, -6), threshold: 0.42, scale: 0.4 });
    mottle(grid, noise, { color: this._shade(base, 8, 8, 10), threshold: 0.58, scale: 0.4, offsetX: 30, offsetY: 30 });
    for (let i = 5; i < s - 5; i++) {
      setPixel(grid, i, 5, brass);
      setPixel(grid, i, s - 6, brass);
      setPixel(grid, 5, i, brass);
      setPixel(grid, s - 6, i, brass);
    }
    for (const [x, y] of [[5, 5], [s - 6, 5], [5, s - 6], [s - 6, s - 6]]) {
      setPixel(grid, x, y, 0xa5813c);
    }
    const g = this.add.graphics();
    renderGrid(g, grid);
    g.generateTexture(key, s, s);
    g.destroy();
  }

  // Mármore encerado — o piso onde o jogador desliza. Precisa ser lido como
  // ESCORREGADIO à primeira vista: bem mais claro que o resto do átrio, com
  // veios finos e uma faixa especular diagonal (o reflexo da luz do teto).
  generatePolishedFloor(key) {
    if (this.textures.exists(key)) return;
    const s = TILE_SIZE;
    const base = 0x525c70;
    const grid = createGrid(s, s);
    fillRect(grid, 0, 0, s, s, base);
    const veins = createNoise2D();
    mottle(grid, veins, { color: 0x5f6a80, threshold: 0.3, scale: 0.5 });
    mottle(grid, veins, { color: 0x434c5e, threshold: 0.62, scale: 0.9, offsetX: 40, offsetY: 8 });
    // Reflexo diagonal discreto — uma linha só, de baixo contraste: em área
    // grande, um brilho forte por tile vira padrão de listra repetida.
    for (let i = 0; i < s; i++) setPixel(grid, i, s - 1 - i, 0x606a80);
    const g = this.add.graphics();
    renderGrid(g, grid);
    g.generateTexture(key, s, s);
    g.destroy();
  }

  // Parede do Átrio: lambri claro de pedra com friso de latão em pé —
  // vertical de propósito, pra puxar o olho pra cima como um saguão de sede
  // faz. Sem rebite nem placa de canto (isso é linguagem de fábrica), mas
  // BEM mais clara que o piso: num mapa desta escala, parede e chão do mesmo
  // valor de cinza deixam a planta ilegível.
  generateWallAtrio(key) {
    if (this.textures.exists(key)) return;
    const s = TILE_SIZE;
    const base = 0x4a5265;
    const grid = createGrid(s, s);
    fillRect(grid, 0, 0, s, s, 0x14171e);
    fillRect(grid, 2, 2, s - 4, s - 4, base);
    const noise = createNoise2D();
    mottle(grid, noise, { color: this._shade(base, -12, -12, -10), threshold: 0.45, scale: 0.35 });
    mottle(grid, noise, { color: this._shade(base, 10, 10, 12), threshold: 0.6, scale: 0.35, offsetX: 22, offsetY: 44 });
    // Faixa de latão só no alto — a "cimalha" do lambri.
    paintOver(grid, 2, 2, s - 4, 2, 0xc9a24a);
    paintOver(grid, 2, 2, s - 4, 1, 0xffe9b8);
    // Friso vertical central, discreto: dá a verticalidade sem virar listra.
    paintOver(grid, s / 2 - 1, 5, 1, s - 9, this._shade(base, -22, -22, -18));
    paintOver(grid, 5, 5, 1, s - 9, this._shade(base, 12, 12, 14));
    paintOver(grid, s - 6, 5, 1, s - 9, this._shade(base, 12, 12, 14));
    // Rodapé escuro.
    paintOver(grid, 2, s - 5, s - 4, 3, 0x2a3040);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x080a0e);
    g.generateTexture(key, s, s);
    g.destroy();
  }

  // Parede de VIDRO — bloqueia igual a qualquer outra (ver TileMap), mas
  // deixa ver através. Caixilho de latão fino + pane clara com um risco de
  // reflexo; o TileMap ainda baixa o alpha pra 0.6 por cima disso.
  generateGlassWall(key) {
    if (this.textures.exists(key)) return;
    const s = TILE_SIZE;
    const grid = createGrid(s, s);
    fillRect(grid, 0, 0, s, s, 0x6e93a8);
    fillRect(grid, 2, 2, s - 4, s - 4, 0x8fbcd4);
    // Reflexo diagonal — o que faz o vidro parecer vidro e não névoa.
    for (let i = 4; i < s - 8; i++) {
      setPixel(grid, i, i + 4, 0xdff4ff);
      setPixel(grid, i + 1, i + 4, 0xc4e6f5);
    }
    // Caixilho de latão.
    paintOver(grid, 0, 0, s, 2, 0xc9a24a);
    paintOver(grid, 0, s - 2, s, 2, 0xc9a24a);
    paintOver(grid, 0, 0, 2, s, 0xc9a24a);
    paintOver(grid, s - 2, 0, 2, s, 0xc9a24a);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x2a3a44);
    g.generateTexture(key, s, s);
    g.destroy();
  }

  generateDoorMatriz(key) {
    if (this.textures.exists(key)) return;
    const s = TILE_SIZE;
    const grid = createGrid(s, s);
    fillRect(grid, 0, 0, s, s, 0x14171e);
    fillRect(grid, 2, 2, s - 4, s - 4, 0x2f3542);
    fillRect(grid, 4, 4, s - 8, s - 8, 0x3d4453);
    // Batente duplo com puxadores verticais de latão.
    fillRect(grid, s / 2 - 1, 2, 2, s - 4, 0x14171e);
    fillRect(grid, s / 2 - 5, 10, 2, 12, 0xc9a24a);
    fillRect(grid, s / 2 + 3, 10, 2, 12, 0xc9a24a);
    paintOver(grid, 4, 4, s - 8, 1, 0xc9a24a);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x080a0e);
    g.generateTexture(key, s, s);
    g.destroy();
  }

  // Placas de pressão do quebra-cabeça do mobiliário — quadradas e sóbrias,
  // deliberadamente diferentes das placas numeradas da Sequência e das
  // células redondas do Circuito.
  generatePressureTiles() {
    const s = TILE_SIZE;
    const build = (key, pressed) => {
      if (this.textures.exists(key)) return;
      const grid = createGrid(s, s);
      const plate = pressed ? 0x6a5a2e : 0x2a2f3a;
      const trim = pressed ? 0xffe9b8 : 0x4a5162;
      fillRect(grid, 3, 3, s - 6, s - 6, plate);
      fillRect(grid, 6, 6, s - 12, s - 12, pressed ? 0xc9a24a : 0x353c49);
      for (const [x, y] of [[3, 3], [s - 4, 3], [3, s - 4], [s - 4, s - 4]]) {
        setPixel(grid, x, y, trim);
      }
      paintOver(grid, 3, 3, s - 6, 1, trim);
      paintOver(grid, 3, s - 4, s - 6, 1, trim);
      const g = this.add.graphics();
      renderGrid(g, grid, 0x0a0c10);
      g.generateTexture(key, s, s);
      g.destroy();
    };
    build('tile_pressure_off', false);
    build('tile_pressure_on', true);
  }

  // Pedestal de exposição — decoração da Galeria de Prêmios e da Praça.
  generatePedestalProp() {
    if (this.textures.exists('prop_pedestal')) return;
    const w = 18;
    const h = 26;
    const grid = createGrid(w, h);
    fillRect(grid, 3, 10, 12, 14, 0x2f3542);
    paintOver(grid, 4, 11, 10, 3, 0x3d4453);
    fillRect(grid, 2, 22, 14, 4, 0x1a1e26);
    fillRect(grid, 5, 6, 8, 4, 0x14171e);
    // Troféu/objeto exposto.
    fillCircle(grid, 9, 4, 3, 0xc9a24a);
    setPixel(grid, 8, 3, 0xffe9b8);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x080a0e);
    g.generateTexture('prop_pedestal', w, h);
    g.destroy();
  }

  // Mesa de banquete — o objeto EMPURRÁVEL do quebra-cabeça do Refeitório.
  // Larga e baixa de propósito: precisa parecer algo que desliza pelo chão,
  // não algo fixo como o pedestal.
  generateBanquetProp() {
    if (this.textures.exists('prop_banquet')) return;
    const w = 28;
    const h = 22;
    const grid = createGrid(w, h);
    fillRect(grid, 1, 6, 26, 9, 0x3d4453);
    paintOver(grid, 2, 7, 24, 3, 0x4d5566);
    // Toalha de mesa caindo dos dois lados.
    fillRect(grid, 1, 12, 26, 5, 0xd8d2c0);
    paintOver(grid, 2, 13, 24, 2, 0xf0ece0);
    for (let x = 2; x < 26; x += 4) setPixel(grid, x, 16, 0xc9a24a);
    fillRect(grid, 3, 17, 3, 4, 0x1a1e26);
    fillRect(grid, 22, 17, 3, 4, 0x1a1e26);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x080a0e);
    g.generateTexture('prop_banquet', w, h);
    g.destroy();
  }

  // Câmera de segurança — desenhada apontando pra DIREITA (+x); a cena gira
  // o sprite pelo ângulo do cone de visão (ver AtrioScene._buildSecurityCameras).
  generateCameraProp() {
    if (this.textures.exists('prop_camera')) return;
    const w = 22;
    const h = 14;
    const grid = createGrid(w, h);
    fillRect(grid, 0, 5, 6, 4, 0x2f3542);
    fillRect(grid, 5, 3, 11, 8, 0x3d4453);
    paintOver(grid, 6, 4, 9, 3, 0x4d5566);
    fillRect(grid, 15, 5, 5, 4, 0x14171e);
    fillCircle(grid, 18, 7, 2, 0xff4a5e);
    setPixel(grid, 18, 6, 0xffd0d6);
    setPixel(grid, 8, 10, 0xc9a24a);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x080a0e);
    g.generateTexture('prop_camera', w, h);
    g.destroy();
  }

  // Monotrilho corporativo — a passagem entre a Região 4 e a 5. Carro
  // alongado e horizontal: a ligação entre as duas regiões corre PRO LADO,
  // não pra cima (poço de carga) nem pra baixo (buraco do Distrito).
  generateMonorailProp() {
    if (this.textures.exists('prop_monorail')) return;
    const w = 40;
    const h = 22;
    const grid = createGrid(w, h);
    fillRect(grid, 2, 4, 36, 12, 0xd8dae0);
    paintOver(grid, 3, 5, 34, 4, 0xf0f2f6);
    // Faixa de janelas.
    fillRect(grid, 5, 8, 30, 4, 0x1a2430);
    for (let x = 6; x < 34; x += 6) paintOver(grid, x, 9, 3, 2, 0x8fbcd4);
    // Nariz aerodinâmico + friso de latão.
    fillRect(grid, 36, 6, 3, 8, 0xb8bcc6);
    fillRect(grid, 2, 15, 36, 2, 0xc9a24a);
    // Trilho por baixo.
    fillRect(grid, 0, 18, 40, 3, 0x2f3542);
    paintOver(grid, 0, 18, 40, 1, 0x4d5566);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x080a0e);
    g.generateTexture('prop_monorail', w, h);
    g.destroy();
  }

  // Escudo de choque — marca do lado protegido do Guarda de Escudo e da
  // Diretora. Desenhado como uma placa VERTICAL curva, e a cena rotaciona
  // pelo ângulo que a unidade encara (0 = encarando +x), então o escudo fica
  // sempre perpendicular à direção defendida.
  generateShieldFx() {
    if (this.textures.exists('fx_shield')) return;
    const w = 10;
    const h = 20;
    const grid = createGrid(w, h);
    fillRect(grid, 3, 1, 4, 18, 0x8fb4ff);
    fillRect(grid, 2, 3, 6, 14, 0x8fb4ff);
    paintOver(grid, 4, 2, 2, 16, 0xdfeaff);
    setPixel(grid, 4, 9, 0xffffff);
    setPixel(grid, 5, 10, 0xffffff);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x2a3a68);
    g.generateTexture('fx_shield', w, h);
    g.destroy();
  }

  // Guarda de Escudo — segurança corporativa em traje de choque. O escudo
  // de verdade é o `fx_shield` desenhado à parte pela cena (ele gira com a
  // direção defendida), então o sprite mostra só a unidade: capacete com
  // viseira, colete pesado e cassetete curto.
  generateShieldGuard() {
    if (this.textures.exists('enemy_shieldguard')) return;
    const w = 22;
    const h = 26;
    const grid = createGrid(w, h);
    const armor = 0x2f3542;
    const armorLight = 0x434c5e;
    const brass = 0xc9a24a;
    fillCircle(grid, 11, 6, 5, 0x1a1e26);
    fillRect(grid, 7, 5, 8, 3, 0x8fb4ff);
    setPixel(grid, 9, 6, 0xdfeaff);
    fillRect(grid, 5, 11, 12, 10, armor);
    paintOver(grid, 6, 12, 10, 4, armorLight);
    fillRect(grid, 9, 11, 4, 8, 0x14171e);
    setPixel(grid, 10, 14, brass);
    // Braços: cassetete curto de um lado, punho fechado do outro.
    fillRect(grid, 2, 13, 4, 7, armor);
    fillRect(grid, 16, 13, 4, 7, armor);
    fillRect(grid, 18, 9, 2, 6, 0x1a1e26);
    fillRect(grid, 6, 21, 4, 5, 0x14171e);
    fillRect(grid, 12, 21, 4, 5, 0x14171e);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x080a0e);
    g.generateTexture('enemy_shieldguard', w, h);
    g.destroy();
  }

  // O Concierge — sub-confronto da Antessala. Silhueta formal e alongada
  // (casaca comprida, ombros estreitos), o oposto do volume blindado do
  // Guarda de Escudo: aqui a ameaça é postura, não armadura.
  generateConciergeMiniBoss() {
    if (this.textures.exists('enemy_concierge')) return;
    const w = 24;
    const h = 30;
    const grid = createGrid(w, h);
    const coat = 0x232833;
    const coatLight = 0x343b4a;
    const brass = 0xc9a24a;
    fillCircle(grid, 12, 5, 4, 0x3a3128);
    paintOver(grid, 9, 2, 6, 2, 0x14171e);
    setPixel(grid, 10, 6, 0x14171e);
    setPixel(grid, 14, 6, 0x14171e);
    // Casaca comprida até quase os pés.
    fillRect(grid, 7, 10, 10, 16, coat);
    paintOver(grid, 8, 11, 8, 5, coatLight);
    fillRect(grid, 11, 10, 2, 14, 0xd8d2c0);
    setPixel(grid, 12, 12, brass);
    setPixel(grid, 12, 16, brass);
    // Ombreiras de galão + luvas brancas.
    fillRect(grid, 5, 10, 3, 3, brass);
    fillRect(grid, 16, 10, 3, 3, brass);
    fillRect(grid, 4, 13, 4, 9, coat);
    fillRect(grid, 16, 13, 4, 9, coat);
    fillRect(grid, 4, 21, 4, 3, 0xf0ece0);
    fillRect(grid, 16, 21, 4, 3, 0xf0ece0);
    fillRect(grid, 8, 26, 3, 4, 0x14171e);
    fillRect(grid, 13, 26, 3, 4, 0x14171e);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x080a0e);
    g.generateTexture('enemy_concierge', w, h);
    g.destroy();
  }

  // A Diretora de Segurança — segunda silhueta HUMANA de confronto do jogo
  // (depois d'O Barão do Mercado), e a primeira que não é nem robô nem
  // corpulenta: alta, terno sob o colete tático, escudo de choque grande no
  // braço esquerdo e pistola no direito. O escudo desenhado aqui é o mesmo
  // que ela perde na segunda fase da luta (ver DiretoraBoss._breakShield) —
  // ele fica do lado ESQUERDO do sprite, e a marca giratória de bloqueio
  // continua sendo o `fx_shield` da cena.
  generateDiretoraBoss() {
    if (this.textures.exists('boss_diretora')) return;
    const w = 40;
    const h = 50;
    const grid = createGrid(w, h);
    const suit = 0x1e222c;
    const vest = 0x2f3542;
    const vestLight = 0x434c5e;
    const brass = 0xc9a24a;

    // Cabeça — cabelo preso, fone de comando.
    fillCircle(grid, 21, 8, 5, 0x2a2018);
    paintOver(grid, 17, 6, 9, 3, 0xd8b48a);
    setPixel(grid, 19, 8, 0x14171e);
    setPixel(grid, 23, 8, 0x14171e);
    fillRect(grid, 25, 6, 2, 4, brass);

    // Torso: colete tático por cima do terno.
    fillRect(grid, 15, 14, 13, 16, suit);
    fillRect(grid, 16, 15, 11, 11, vest);
    paintOver(grid, 17, 16, 9, 4, vestLight);
    fillRect(grid, 20, 15, 3, 10, 0x14171e);
    setPixel(grid, 21, 18, brass);
    setPixel(grid, 21, 22, brass);

    // Braço direito com a pistola apontada pra fora.
    fillRect(grid, 28, 17, 5, 9, suit);
    fillRect(grid, 32, 20, 6, 3, 0x14171e);
    setPixel(grid, 37, 21, brass);

    // Escudo de choque no braço esquerdo — placa alta, com o brasão.
    fillRect(grid, 10, 14, 5, 9, suit);
    fillRect(grid, 3, 10, 8, 26, 0x8fb4ff);
    paintOver(grid, 4, 12, 6, 22, 0xb8d0ff);
    paintOver(grid, 5, 18, 4, 8, 0xdfeaff);
    fillRect(grid, 5, 21, 4, 2, brass);
    fillRect(grid, 6, 19, 2, 6, brass);

    // Pernas / saia do terno.
    fillRect(grid, 16, 30, 11, 8, suit);
    fillRect(grid, 17, 38, 4, 10, 0x14171e);
    fillRect(grid, 23, 38, 4, 10, 0x14171e);
    fillRect(grid, 16, 47, 6, 3, 0x0e1116);
    fillRect(grid, 22, 47, 6, 3, 0x0e1116);

    const noise = createNoise2D();
    mottle(grid, noise, { color: 0x272d3a, threshold: 0.62, scale: 0.4, region: { x0: 15, y0: 14, w: 13, h: 16 } });

    const g = this.add.graphics();
    renderGrid(g, grid, 0x080a0e);
    g.generateTexture('boss_diretora', w, h);
    g.destroy();
  }

  // --- Fase 18 (Departamento de P&D) -------------------------------------

  // Parede sobre trilhos — a divisória que corre quando a planta muda. Lê
  // como painel montado num trilho (guia em cima e embaixo, junta central),
  // não como porta: porta abre, isto DESLIZA pra dentro do vão.
  generatePartitionProp() {
    if (this.textures.exists('prop_partition')) return;
    const s = TILE_SIZE;
    const grid = createGrid(s, s);
    fillRect(grid, 0, 0, s, s, 0x161b26);
    fillRect(grid, 1, 4, s - 2, s - 8, 0x525c72);
    paintOver(grid, 2, 5, s - 4, 3, 0x646f88);
    // Guias do trilho, em cima e embaixo.
    fillRect(grid, 0, 1, s, 3, 0x2a3242);
    fillRect(grid, 0, s - 4, s, 3, 0x2a3242);
    for (let x = 2; x < s - 2; x += 5) {
      setPixel(grid, x, 2, 0x8fe0ff);
      setPixel(grid, x, s - 3, 0x8fe0ff);
    }
    // Junta central: onde as duas metades se encontram quando fecha.
    fillRect(grid, s / 2 - 1, 4, 2, s - 8, 0x161b26);
    paintOver(grid, s / 2 - 1, 8, 1, s - 16, 0x8fe0ff);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x080a0e);
    g.generateTexture('prop_partition', s, s);
    g.destroy();
  }

  // Tanque de espécime — cilindro de vidro com líquido e uma silhueta
  // parada dentro. É o prop que carrega a fantasia da fase inteira.
  generateTankProp() {
    if (this.textures.exists('prop_tank')) return;
    const w = 20;
    const h = 30;
    const grid = createGrid(w, h);
    fillRect(grid, 3, 26, 14, 4, 0x2a3242);
    fillRect(grid, 4, 2, 12, 3, 0x2a3242);
    // Cilindro de vidro.
    fillRect(grid, 4, 5, 12, 21, 0x4a7a8c);
    paintOver(grid, 5, 6, 10, 19, 0x5f97ac);
    // Silhueta suspensa lá dentro.
    fillCircle(grid, 10, 12, 3, 0x1c2430);
    fillRect(grid, 8, 15, 5, 7, 0x1c2430);
    // Reflexo na curva do vidro + bolhas.
    fillRect(grid, 5, 7, 1, 17, 0xbfe6f2);
    setPixel(grid, 13, 9, 0xbfe6f2);
    setPixel(grid, 12, 17, 0xbfe6f2);
    setPixel(grid, 14, 21, 0xbfe6f2);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x080a0e);
    g.generateTexture('prop_tank', w, h);
    g.destroy();
  }

  // Protótipo Instável — casco INACABADO de propósito: metade chapeada,
  // metade com o chassi exposto e cabos soltos. É a leitura que avisa que
  // derrubar isso não termina o serviço.
  generateUnstablePrototype() {
    if (this.textures.exists('enemy_prototype')) return;
    const w = 22;
    const h = 26;
    const grid = createGrid(w, h);
    const shell = 0x646f88;
    const guts = 0x2a3242;
    const accent = 0xb37aff;
    fillCircle(grid, 11, 6, 5, guts);
    // Só metade da cabeça tem chapa.
    fillRect(grid, 6, 2, 5, 8, shell);
    setPixel(grid, 13, 6, accent);
    setPixel(grid, 14, 7, accent);
    fillRect(grid, 5, 11, 12, 10, guts);
    // Chapeamento parcial: lado esquerdo fechado, direito aberto.
    fillRect(grid, 5, 11, 6, 10, shell);
    paintOver(grid, 6, 12, 4, 4, 0x7c88a4);
    // Chassi exposto do lado direito.
    for (let y = 12; y < 20; y += 2) paintOver(grid, 12, y, 4, 1, accent);
    // Cabos soltos pendurados.
    setPixel(grid, 17, 14, accent);
    setPixel(grid, 18, 15, accent);
    setPixel(grid, 18, 16, accent);
    fillRect(grid, 2, 13, 3, 7, shell);
    fillRect(grid, 16, 13, 3, 5, guts);
    fillRect(grid, 6, 21, 4, 5, 0x161b26);
    fillRect(grid, 12, 21, 4, 5, 0x161b26);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x080a0e);
    g.generateTexture('enemy_prototype', w, h);
    g.destroy();
  }

  // O Arquivista — silhueta de armário/estante ambulante: alto, estreito,
  // com gavetas. Nada de humano nem de robô de combate: é o móvel que guarda
  // os projetos, e ele não bate, ele puxa.
  generateArquivistaMiniBoss() {
    if (this.textures.exists('enemy_arquivista')) return;
    const w = 24;
    const h = 30;
    const grid = createGrid(w, h);
    const body = 0x3a3350;
    const bodyLight = 0x4e4568;
    const accent = 0xb37aff;
    fillRect(grid, 4, 2, 16, 24, body);
    paintOver(grid, 5, 3, 14, 5, bodyLight);
    // Fileiras de gaveta com puxador.
    for (let y = 6; y < 24; y += 5) {
      fillRect(grid, 6, y, 12, 4, 0x241f34);
      paintOver(grid, 10, y + 1, 4, 1, accent);
    }
    // Sensor/olho no topo.
    fillCircle(grid, 12, 4, 2, accent);
    setPixel(grid, 12, 4, 0xe4d4ff);
    // Braços de manipulação — é com eles que ele puxa.
    fillRect(grid, 1, 10, 3, 9, body);
    fillRect(grid, 20, 10, 3, 9, body);
    setPixel(grid, 2, 19, accent);
    setPixel(grid, 21, 19, accent);
    fillRect(grid, 6, 26, 4, 4, 0x161b26);
    fillRect(grid, 14, 26, 4, 4, 0x161b26);
    const g = this.add.graphics();
    renderGrid(g, grid, 0x080a0e);
    g.generateTexture('enemy_arquivista', w, h);
    g.destroy();
  }

  // O PROJETISTA — inteligência de projeto num tanque, com braços
  // manipuladores. Deliberadamente NÃO humano: os dois chefes anteriores da
  // região (O Barão, A Diretora) foram silhuetas humanas. Aqui o corpo é o
  // próprio equipamento de laboratório — cuba central com o núcleo dentro,
  // anel de suporte em volta (que a órbita dos protótipos ecoa) e quatro
  // braços de bancada saindo da base.
  generateProjetistaBoss() {
    if (this.textures.exists('boss_projetista')) return;
    const w = 48;
    const h = 54;
    const grid = createGrid(w, h);
    const rig = 0x3a3350;
    const rigLight = 0x50466c;
    // Cuba deliberadamente ESCURA: BossBase põe um glow por cima de todo
    // chefe (`auraTint`) e a cena ainda acende uma poça de luz embaixo — com
    // um vidro claro, um corpo deste tamanho vira uma mancha branca e a
    // silhueta some.
    const glass = 0x2c4756;
    const glassLight = 0x3d6377;
    const accent = 0xb37aff;
    const dark = 0x161b26;

    // Anel de suporte — o aro que a órbita dos protótipos repete em jogo.
    fillCircle(grid, 24, 24, 19, rig);
    clearCircle(grid, 24, 24, 16);
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 * i) / 8;
      setPixel(grid, Math.round(24 + Math.cos(a) * 17), Math.round(24 + Math.sin(a) * 17), accent);
    }

    // Cuba de vidro central.
    fillCircle(grid, 24, 22, 11, glass);
    paintOver(grid, 16, 13, 5, 3, glassLight);
    paintOver(grid, 17, 13, 2, 1, 0x8fc0d4);

    // Núcleo lá dentro: massa irregular com pontos de luz.
    fillCircle(grid, 24, 22, 6, 0x2a2440);
    setPixel(grid, 21, 20, accent); setPixel(grid, 26, 21, accent);
    setPixel(grid, 23, 25, 0xe4d4ff); setPixel(grid, 27, 24, accent);
    setPixel(grid, 22, 23, 0xe4d4ff);

    // Coroa/tampa da cuba.
    fillRect(grid, 18, 8, 12, 4, rig);
    paintOver(grid, 19, 9, 10, 2, rigLight);
    fillRect(grid, 22, 4, 4, 5, rig);
    fillCircle(grid, 24, 4, 2, accent);

    // Quatro braços de bancada saindo da base.
    fillRect(grid, 2, 30, 10, 4, rig);
    fillRect(grid, 36, 30, 10, 4, rig);
    fillRect(grid, 0, 32, 4, 3, dark);
    fillRect(grid, 44, 32, 4, 3, dark);
    fillRect(grid, 8, 36, 4, 8, rig);
    fillRect(grid, 36, 36, 4, 8, rig);
    setPixel(grid, 9, 43, accent);
    setPixel(grid, 37, 43, accent);

    // Base pesada.
    fillRect(grid, 14, 42, 20, 8, dark);
    paintOver(grid, 16, 44, 16, 4, rig);
    for (let x = 18; x < 32; x += 5) paintOver(grid, x, 45, 2, 2, accent);
    fillRect(grid, 12, 50, 10, 4, dark);
    fillRect(grid, 26, 50, 10, 4, dark);

    const noise = createNoise2D();
    mottle(grid, noise, { color: 0x342e4a, threshold: 0.64, scale: 0.35, region: { x0: 5, y0: 5, w: 38, h: 38 } });

    const g = this.add.graphics();
    renderGrid(g, grid, 0x080a0e);
    g.generateTexture('boss_projetista', w, h);
    g.destroy();
  }
}
