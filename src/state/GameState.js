// Estado persistente do jogador entre cenas (Ala Central <-> alas fabris),
// nos moldes do Soul Blazer: nível, HP e equipamento acompanham o jogador.
// Também é a base do save/load: cada função que muda progresso relevante
// (XP, equipamento, resgates, itens-chave) já grava no localStorage — não
// existe um botão de "salvar" separado, o progresso persiste sozinho.
const SAVE_KEY = 'neo-drift-save-v1';

function createInitialState() {
  return {
    level: 1,
    xp: 0,
    xpToNext: 50,
    maxHp: 100,
    hp: 100,
    attackDamage: 20,
    weaponName: 'Espada de Sucata',
    weaponKind: 'sword',
    armorName: null,
    armorBonus: 0,
    bootsName: null,
    speedMul: 1,
    hasPistol: false,
    pistolName: null,
    pistolDamage: 18,
    pistolAmmo: 0,
    rangedKind: 'pistol',
    stimCharges: 0,
    empCharges: 0,
    dungeon1Cleared: false,
    foundryCleared: false,
    reactorCleared: false,
    coreCleared: false,
    towerCleared: false,
    arsenalCleared: false,
    // Fica true ao vencer O Roteador (Fase 07).
    nexusCleared: false,
    // Fica true ao vencer A Emissora (Fase 08) — fecha de vez o arco do
    // Distrito Neon (Torre + Arsenal + Nexo + Central de Vigilância).
    vigilanceCleared: false,
    // Fica true ao vencer O Trem Fantasma (Fase 09) — primeira fase do
    // Submundo (Região 3).
    fantasmaCleared: false,
    // Fica true ao vencer O Barão do Mercado (Fase 10) — 2ª fase do Submundo.
    mercadoNegroCleared: false,
    // Fica true ao vencer A Matriarca (Fase 11) — 3ª fase do Submundo.
    coloniaCleared: false,
    // Fica true ao vencer O Administrador (Fase 12) — fecha o Submundo.
    servidorCleared: false,
    // Fica true ao vencer O Empilhador (Fase 13) — primeira fase do Estaleiro.
    terminalCleared: false,
    // Fica true ao vencer A Perfuratriz (Fase 14) — 2ª fase do Estaleiro.
    refinariaCleared: false,
    // Fica true ao vencer O Protótipo (Fase 15) — 3ª fase do Estaleiro.
    estaleiroNavalCleared: false,
    // Fica true ao vencer O Regente (Fase 16) — fecha a Região 4.
    torreControleCleared: false,
    // Fica true ao vencer A Diretora de Segurança (Fase 17) — primeira fase
    // da Região 5 (Torre Matriz da Neo Industries).
    atrioCleared: false,
    // Fica true ao vencer O Projetista (Fase 18) — 2ª fase da Região 5.
    pesquisaCleared: false,
    // Fica true ao pegar a Blindagem Isolante (cofre da Fase 03) — a partir
    // daí, piso eletrificado para de causar dano, pro resto do jogo.
    insulated: false,
    // Fica true ao pegar o Traje de Quarentena (Fase 11) — a partir daí,
    // piso tóxico (e poças deixadas por infectados/A Matriarca) param de
    // causar dano, pro resto do jogo.
    toxinImmune: false,
    rescuedNpcs: new Set(),
    itemsTaken: new Set(),
    // Itens-chave (cartões, etc.) mostrados no menu de status — não afetam
    // combate diretamente, só desbloqueiam coisas no mundo (portas, etc.).
    inventory: []
  };
}

export const GameState = createInitialState();

// Campos salvos como estão (JSON simples) — rescuedNpcs/itemsTaken (Set)
// e inventory (array) são tratados à parte em saveGame/loadGame.
const PLAIN_FIELDS = [
  'level', 'xp', 'xpToNext', 'maxHp', 'hp', 'attackDamage',
  'weaponName', 'weaponKind', 'armorName', 'armorBonus', 'bootsName', 'speedMul',
  'hasPistol', 'pistolName', 'pistolDamage', 'pistolAmmo', 'rangedKind',
  'stimCharges', 'empCharges',
  'dungeon1Cleared', 'foundryCleared', 'reactorCleared', 'coreCleared', 'towerCleared', 'arsenalCleared', 'nexusCleared', 'vigilanceCleared', 'fantasmaCleared', 'mercadoNegroCleared', 'coloniaCleared', 'servidorCleared', 'terminalCleared', 'refinariaCleared', 'estaleiroNavalCleared', 'torreControleCleared', 'atrioCleared', 'pesquisaCleared', 'insulated', 'toxinImmune'
];

// Falha silenciosamente se localStorage não estiver disponível (modo
// privado, quota excedida, etc.) — o jogo continua funcionando normalmente,
// só sem persistência entre sessões.
export function saveGame() {
  try {
    const data = {};
    for (const key of PLAIN_FIELDS) data[key] = GameState[key];
    data.rescuedNpcs = [...GameState.rescuedNpcs];
    data.itemsTaken = [...GameState.itemsTaken];
    data.inventory = GameState.inventory;
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) {
    // sem persistência disponível — ignora.
  }
}

// Retorna true se um save foi encontrado e carregado. Sempre restaura o HP
// cheio (o jogo sempre retoma na Ala Central, não no meio de uma luta).
export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    for (const key of PLAIN_FIELDS) {
      if (data[key] !== undefined) GameState[key] = data[key];
    }
    GameState.rescuedNpcs = new Set(data.rescuedNpcs || []);
    GameState.itemsTaken = new Set(data.itemsTaken || []);
    GameState.inventory = data.inventory || [];
    GameState.hp = GameState.maxHp;
    return true;
  } catch (e) {
    return false;
  }
}

// Só consulta o disco — não aplica o save. A tela inicial usa isso pra
// habilitar "Continuar" sem mutar o estado em memória antes da escolha.
export function hasSave() {
  try {
    return localStorage.getItem(SAVE_KEY) != null;
  } catch (e) {
    return false;
  }
}

// Hub da região correspondente ao progresso — cada região só é liberada ao
// vencer a última fase da anterior (Núcleo -> Distrito, Vigilância -> Submundo,
// Servidor -> Estaleiro, Torre de Controle -> Matriz). Aceita tanto o
// GameState em memória quanto o objeto cru de um save (`peekSaveSummary`),
// já que os dois carregam as flags.
export function regionHubScene(state = GameState) {
  if (state.torreControleCleared) return 'MatrizScene';
  if (state.servidorCleared) return 'EstaleiroScene';
  if (state.vigilanceCleared) return 'SubmundoScene';
  if (state.coreCleared) return 'DistrictScene';
  return 'TownScene';
}

const HUB_LABELS = {
  TownScene: 'Ala Central',
  DistrictScene: 'Distrito Neon',
  SubmundoScene: 'Submundo',
  EstaleiroScene: 'Estaleiro Automatizado',
  MatrizScene: 'Torre Matriz'
};

export function regionHubLabel(state = GameState) {
  return HUB_LABELS[regionHubScene(state)] || HUB_LABELS.TownScene;
}

// Resumo curto pra mostrar no botão Continuar (nível + região). Falha = sem save.
export function peekSaveSummary() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return { level: data.level || 1, regionLabel: regionHubLabel(data) };
  } catch (e) {
    return null;
  }
}

export function resetGame() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (e) {
    // sem persistência disponível — ignora.
  }
  Object.assign(GameState, createInitialState());
}

export function grantXp(amount) {
  GameState.xp += amount;
  let leveledUp = false;
  while (GameState.xp >= GameState.xpToNext) {
    GameState.xp -= GameState.xpToNext;
    GameState.level += 1;
    // +35% arredondado, com piso de +15 garantindo que o custo do próximo
    // nível NUNCA repete o valor anterior (mesmo em níveis baixos/arredondamento).
    GameState.xpToNext = Math.max(GameState.xpToNext + 15, Math.round(GameState.xpToNext * 1.35));
    GameState.maxHp += 20;
    GameState.attackDamage += 5;
    GameState.hp = GameState.maxHp;
    leveledUp = true;
  }
  saveGame();
  return leveledUp;
}

// `kind` determina o COMPORTAMENTO do golpe (ver MELEE_KINDS em ItemCodex.js)
// — sempre troca pra a arma nova encontrada (é uma variação de estilo, não
// só um upgrade de número), mas o dano nunca regride.
export function equipWeapon(name, damage, kind = 'sword') {
  GameState.weaponName = name;
  GameState.weaponKind = kind;
  GameState.attackDamage = Math.max(GameState.attackDamage, damage);
  saveGame();
}

export function equipArmor(name, maxHpBonus, flags = false) {
  GameState.armorName = name;
  GameState.armorBonus = maxHpBonus;
  GameState.maxHp += maxHpBonus;
  GameState.hp += maxHpBonus;
  // 3º argumento antigo era o boolean `insulated` (Ala do Reator). Objeto
  // `{ insulated, toxinImmune }` cobre os dois tipos de piso perigoso sem
  // uma lista crescente de parâmetros posicionais.
  if (flags === true) {
    GameState.insulated = true;
  } else if (flags && typeof flags === 'object') {
    if (flags.insulated) GameState.insulated = true;
    if (flags.toxinImmune) GameState.toxinImmune = true;
  }
  saveGame();
}

// Calçado: multiplicador de velocidade de deslocamento (ver SPEED em
// Player.js). Nunca regride — pegar de novo um calçado mais fraco não piora
// o já equipado, mesma regra de equipWeapon/upgradePistol.
export function equipBoots(name, speedMul) {
  GameState.bootsName = name;
  GameState.speedMul = Math.max(GameState.speedMul, speedMul);
  saveGame();
}

// Cobre tanto a primeira aquisição da pistola (Fase 01) quanto os upgrades
// de dano em fases seguintes — retorna true se foi a primeira vez (usado
// pra variar a mensagem entre "encontrada" e "upgrade").
// `kind` determina o COMPORTAMENTO de disparo (ver RANGED_KINDS em
// ItemCodex.js) — sempre troca pra a arma nova encontrada, dano nunca regride.
export function upgradePistol(name, damage, kind = 'pistol', ammoBonus = 3) {
  const firstTime = !GameState.hasPistol;
  GameState.hasPistol = true;
  GameState.pistolName = name;
  GameState.rangedKind = kind;
  GameState.pistolDamage = Math.max(GameState.pistolDamage, damage);
  GameState.pistolAmmo += ammoBonus;
  saveGame();
  return firstTime;
}

export function addAmmo(amount) {
  GameState.pistolAmmo += amount;
}

// Consumíveis táticos: cargas guardadas e usadas por escolha do jogador
// (tecla Q/E), diferente dos kits médicos (cura instantânea ao pisar).
export function addStim(count = 1) {
  GameState.stimCharges += count;
  saveGame();
}

export function addEmpCharge(count = 1) {
  GameState.empCharges += count;
  saveGame();
}

// Retorna true se havia carga disponível (e já debita) — false se não tinha,
// pra quem chamou saber que não deve aplicar o efeito.
export function consumeStim() {
  if (GameState.stimCharges <= 0) return false;
  GameState.stimCharges -= 1;
  saveGame();
  return true;
}

export function consumeEmpCharge() {
  if (GameState.empCharges <= 0) return false;
  GameState.empCharges -= 1;
  saveGame();
  return true;
}

export function rescueNpc(id) {
  GameState.rescuedNpcs.add(id);
  saveGame();
}

export function addInventoryItem(item) {
  if (GameState.inventory.some((i) => i.id === item.id)) return;
  GameState.inventory.push(item);
  saveGame();
}

// Cartão que GANHA NÍVEL em vez de só existir/não existir (Torre de Controle
// Logístico, Fase 16) — mesmo item-chave do menu de status (`item.icon`
// 'item_keycard'), mas `level` sobe conforme o jogador avança, e o nome
// exibido é atualizado a cada nível pra mostrar o progresso de verdade.
export function setCardLevel(id, baseName, level) {
  const existing = GameState.inventory.find((i) => i.id === id);
  const name = `${baseName} — Nível ${level}`;
  if (existing) {
    existing.level = level;
    existing.name = name;
  } else {
    GameState.inventory.push({ id, name, icon: 'item_keycard', level });
  }
  saveGame();
}

export function getCardLevel(id) {
  return GameState.inventory.find((i) => i.id === id)?.level || 0;
}
