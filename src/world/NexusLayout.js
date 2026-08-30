// Construção programática do Nexo de Transporte (Fase 07) — fecha o arco do
// Distrito Neon (Torre de Segurança + Arsenal Blindado). MUITAS salas
// pequenas em vez de poucas salas gigantes (a primeira versão errou nisso —
// salas grandes não são o mesmo que uma fase maior). Dois cartões-chave
// distintos (Custódia + Núcleo de Sincronia) e DOIS puzzles diferentes
// (terminais em sequência + painel de alternância) gateando trechos
// separados do mapa.
//
// Portais:
// - Fixos ('PF'): pares bidirecionais, cada par SEMPRE nos dois lados do
//   MESMO trecho liberado (nunca atravessa um selo) — são atalhos locais de
//   backtracking, não um jeito de pular puzzle/combate.
// - Instável ('PU'): 1 origem cicla sozinha entre 3 destinos desconectados
//   do resto do grid (só dá pra chegar neles de portal), sem punição por
//   errar o momento.
const WIDTH = 68;
const HEIGHT = 64;

function carveRect(grid, x1, y1, x2, y2) {
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      grid[y][x] = '.';
    }
  }
}

export function buildNexusWing() {
  const grid = Array.from({ length: HEIGHT }, () => Array(WIDTH).fill('#'));

  const rooms = {
    entrada: { x1: 1, y1: 1, x2: 8, y2: 8, name: 'Portão do Nexo' },
    triagem: { x1: 12, y1: 1, x2: 21, y2: 8, name: 'Posto de Triagem' },
    custodia: { x1: 12, y1: 12, x2: 19, y2: 18, name: 'Sala de Custódia' },
    sincronia: { x1: 25, y1: 1, x2: 34, y2: 9, name: 'Sala de Sincronia' },
    deposito: { x1: 38, y1: 1, x2: 47, y2: 8, name: 'Depósito de Componentes' },
    rele: { x1: 51, y1: 1, x2: 60, y2: 8, name: 'Sala de Relé' },
    distribuicao: { x1: 25, y1: 22, x2: 34, y2: 29, name: 'Corredor de Distribuição' },
    portaisA: { x1: 8, y1: 22, x2: 19, y2: 29, name: 'Câmara de Portais A' },
    portaisB: { x1: 40, y1: 22, x2: 49, y2: 29, name: 'Câmara de Portais B' },
    instavel: { x1: 53, y1: 22, x2: 62, y2: 30, name: 'Câmara Instável' },
    manutencao: { x1: 25, y1: 33, x2: 34, y2: 39, name: 'Baía de Manutenção' },
    painel: { x1: 12, y1: 33, x2: 23, y2: 40, name: 'Sala do Painel' },
    guardiao: { x1: 8, y1: 44, x2: 23, y2: 53, name: 'Sala do Guardião do Nexo' },
    roteador: { x1: 27, y1: 44, x2: 58, y2: 56, name: 'Câmara do Roteador' }
  };

  for (const room of Object.values(rooms)) {
    carveRect(grid, room.x1, room.y1, room.x2, room.y2);
  }

  // Banda 1 (horizontal) — entrada, triagem, sincronia, depósito, relé.
  carveRect(grid, 9, 4, 11, 4); // entrada -> triagem
  carveRect(grid, 22, 4, 24, 4); // triagem -> sincronia
  carveRect(grid, 35, 4, 37, 4); // sincronia -> depósito
  carveRect(grid, 48, 4, 50, 4); // depósito -> relé

  // Triagem -> Sala de Custódia (vault selado por cartão — ver 'CD').
  carveRect(grid, 15, 9, 15, 11);

  // Banda1 -> banda2: ÚNICA conexão é pela Sala de Sincronia (selada até o
  // puzzle de terminais ser resolvido — ver 'K'). Entrada/triagem/depósito/
  // relé não têm NENHUMA outra descida, de propósito, pra o puzzle valer.
  carveRect(grid, 29, 10, 29, 21);

  // Banda 2 (horizontal) — distribuição no centro, portais A/B nas pontas,
  // câmara instável mais além (desvio sem saída própria).
  carveRect(grid, 20, 25, 24, 25); // distribuição -> portais A
  carveRect(grid, 35, 25, 39, 25); // distribuição -> portais B
  carveRect(grid, 50, 25, 52, 25); // portais B -> câmara instável

  // Banda2 -> banda3: ÚNICA conexão é pela Sala do Painel (selada até o
  // puzzle de painéis ser resolvido — ver 'W').
  carveRect(grid, 29, 30, 29, 32); // distribuição -> manutenção
  carveRect(grid, 24, 36, 24, 36); // manutenção -> sala do painel

  // Guardião -> Câmara do Roteador (arena do chefe final) — só tem UMA
  // entrada, selada até o Núcleo de Sincronia ser derrubado (ver 'L').
  carveRect(grid, 15, 41, 15, 43); // painel -> sala do guardião
  carveRect(grid, 24, 48, 26, 48); // guardião -> roteador

  // Seleção da Sala de Custódia (cartão de custódia).
  grid[10][15] = '#';
  // Seleção da Sala de Sincronia -> banda 2 (puzzle de terminais).
  grid[15][29] = '#';
  // Seleção da Sala do Painel -> banda 3 (puzzle de painéis).
  grid[42][15] = '#';
  // Seleção da Câmara do Roteador (Núcleo de Sincronia).
  grid[48][25] = '#';

  // As 3 ilhas de destino do portal instável — desconectadas do resto do
  // grid de propósito, só alcançáveis por teleporte.
  carveRect(grid, 10, 59, 12, 61);
  carveRect(grid, 33, 59, 35, 61);
  carveRect(grid, 56, 59, 58, 61);

  const markers = {
    S: [{ gx: 4, gy: 4 }],
    X: [
      { gx: 3, gy: 7 }, // entrada
      { gx: 19, gy: 3 }, // triagem
      { gx: 41, gy: 3 }, { gx: 45, gy: 6 }, // depósito
      { gx: 54, gy: 3 }, { gx: 56, gy: 7 }, // relé
      { gx: 11, gy: 27 }, { gx: 17, gy: 24 }, // portais A
      { gx: 43, gy: 27 }, // portais B
      { gx: 58, gy: 28 }, // câmara instável
      { gx: 27, gy: 36 }, // manutenção
      { gx: 38, gy: 50 }, { gx: 52, gy: 46 }, { gx: 44, gy: 53 } // roteador
    ],
    // Saltador de Fase (inimigo novo) — pisca pra dentro/fora de alcance.
    J: [
      { gx: 14, gy: 6 }, // triagem
      { gx: 57, gy: 3 }, // relé
      { gx: 47, gy: 24 }, // portais B
      { gx: 20, gy: 49 } // sala do guardião
    ],
    N: [{ gx: 18, gy: 6 }, { gx: 40, gy: 3 }],
    I: [{ gx: 41, gy: 7 }], // depósito — melhoria de lâmina
    C: [{ gx: 58, gy: 3 }], // relé — melhoria de pistola/à distância
    // Blindagem fica DENTRO do cofre — só com o Cartão de Custódia.
    A: [{ gx: 15, gy: 15 }],
    H: [{ gx: 30, gy: 27 }, { gx: 20, gy: 38 }, { gx: 12, gy: 48 }],
    // Sala de Sincronia — 4 terminais na ordem 1→2→3→4 (reaproveitado da
    // Torre/Arsenal), gateia banda1 -> banda2.
    Q: [{ gx: 27, gy: 4 }, { gx: 32, gy: 4 }, { gx: 27, gy: 8 }, { gx: 32, gy: 8 }],
    K: [{ gx: 29, gy: 15 }], // seleção do corredor de sincronia
    // Sentinela de Custódia — carrier do Cartão de Custódia (guarda a
    // Sala de Custódia, com a blindagem da fase).
    CU: [{ gx: 17, gy: 5 }],
    CD: [{ gx: 15, gy: 10 }], // seleção da Sala de Custódia
    // Sala do Painel — 5 painéis independentes (alternam on/off), devem
    // bater com um padrão-alvo fixo. Mecanismo NOVO, diferente da sequência.
    PN: [
      { gx: 14, gy: 36 }, { gx: 16, gy: 36 }, { gx: 18, gy: 36 },
      { gx: 20, gy: 36 }, { gx: 22, gy: 36 }
    ],
    W: [{ gx: 15, gy: 42 }], // seleção do corredor do painel -> banda 3
    // Portais fixos — pares bidirecionais, ambos os lados SEMPRE no mesmo
    // trecho liberado (nunca atravessam K/W/CD/L).
    PF: [
      { gx: 6, gy: 6, pair: 0 }, { gx: 58, gy: 6, pair: 0 }, // entrada <-> relé (banda 1)
      { gx: 11, gy: 25, pair: 1 }, { gx: 60, gy: 25, pair: 1 } // portais A <-> câmara instável (banda 2)
    ],
    PU: [
      { gx: 58, gy: 26, role: 'source' },
      { gx: 11, gy: 60, role: 'dest', id: 0 },
      { gx: 34, gy: 60, role: 'dest', id: 1 },
      { gx: 57, gy: 60, role: 'dest', id: 2 }
    ],
    G: [{ gx: 15, gy: 48 }], // Guardião do Nexo
    L: [{ gx: 25, gy: 48 }], // seleção da câmara do chefe final
    B: [{ gx: 42, gy: 50 }], // O Roteador
    BA: [{ gx: 32, gy: 47 }, { gx: 53, gy: 47 }, { gx: 32, gy: 53 }, { gx: 53, gy: 53 }]
  };

  const zones = [
    { name: rooms.entrada.name, x1: 0, y1: 0, x2: 10, y2: 9 },
    { name: rooms.triagem.name, x1: 10, y1: 0, x2: 23, y2: 9 },
    { name: rooms.custodia.name, x1: 10, y1: 9, x2: 23, y2: 19 },
    { name: rooms.sincronia.name, x1: 23, y1: 0, x2: 36, y2: 22 },
    { name: rooms.deposito.name, x1: 36, y1: 0, x2: 49, y2: 9 },
    { name: rooms.rele.name, x1: 49, y1: 0, x2: 68, y2: 9 },
    { name: rooms.distribuicao.name, x1: 23, y1: 22, x2: 36, y2: 33 },
    { name: rooms.portaisA.name, x1: 0, y1: 22, x2: 23, y2: 33 },
    { name: rooms.portaisB.name, x1: 36, y1: 22, x2: 51, y2: 33 },
    { name: rooms.instavel.name, x1: 51, y1: 22, x2: 68, y2: 33 },
    { name: rooms.manutencao.name, x1: 23, y1: 33, x2: 36, y2: 44 },
    { name: rooms.painel.name, x1: 0, y1: 33, x2: 23, y2: 44 },
    { name: rooms.guardiao.name, x1: 0, y1: 44, x2: 25, y2: 64 },
    { name: rooms.roteador.name, x1: 25, y1: 44, x2: 68, y2: 64 }
  ];

  return { grid, markers, zones, width: WIDTH, height: HEIGHT };
}
