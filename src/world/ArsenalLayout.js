// Construção programática do Arsenal Blindado (Fase 06) — parte da MESMA
// topologia do TowerLayout.js (já validada por flood-fill), reskinada, com
// dois marcadores novos: 'D' (armadilhas de espinho cíclicas) e 'V' (console
// que desativa o bombardeio de canhão do chefe). A Sala de Controle de
// Artilharia é uma ala extra (grade alargada) ligada à Sala de Comando — dá
// pra visitar antes da Câmara do Tanque e tirar o ataque de canhão da luta.
const WIDTH = 66;
const HEIGHT = 38;

function carveRect(grid, x1, y1, x2, y2) {
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      grid[y][x] = '.';
    }
  }
}

export function buildArsenalWing() {
  const grid = Array.from({ length: HEIGHT }, () => Array(WIDTH).fill('#'));

  const rooms = {
    entrada: { x1: 1, y1: 1, x2: 8, y2: 9, name: 'Portão do Arsenal' },
    vigilancia: { x1: 12, y1: 1, x2: 21, y2: 9, name: 'Posto de Vigia' },
    deposito: { x1: 25, y1: 1, x2: 34, y2: 9, name: 'Depósito de Munição' },
    controle: { x1: 38, y1: 1, x2: 52, y2: 11, name: 'Sala de Comando' },
    artilharia: { x1: 56, y1: 1, x2: 65, y2: 11, name: 'Sala de Controle de Artilharia' },
    destravamento: { x1: 1, y1: 13, x2: 10, y2: 21, name: 'Sala de Destravamento' },
    corredorArmadilhas: { x1: 14, y1: 13, x2: 23, y2: 21, name: 'Corredor de Armadilhas' },
    manutencao: { x1: 27, y1: 13, x2: 36, y2: 21, name: 'Baía de Manutenção' },
    patioTestes: { x1: 40, y1: 13, x2: 52, y2: 21, name: 'Pátio de Testes' },
    corredorBlindado: { x1: 1, y1: 25, x2: 14, y2: 33, name: 'Corredor Blindado' },
    patioLancamento: { x1: 18, y1: 25, x2: 52, y2: 37, name: 'Pátio de Lançamento' }
  };

  for (const room of Object.values(rooms)) {
    carveRect(grid, room.x1, room.y1, room.x2, room.y2);
  }

  // Banda 1 (horizontal).
  carveRect(grid, 9, 5, 11, 5); // entrada -> vigilância
  carveRect(grid, 22, 5, 24, 5); // vigilância -> depósito
  carveRect(grid, 35, 5, 37, 5); // depósito -> comando
  carveRect(grid, 53, 5, 55, 5); // comando -> controle de artilharia (será selado)

  // Banda1 -> banda2 (vertical). Sala de Comando só é acessível pela banda 1.
  carveRect(grid, 5, 10, 5, 12); // entrada -> sala de destravamento
  carveRect(grid, 16, 10, 16, 12); // vigilância -> corredor de armadilhas
  carveRect(grid, 30, 10, 30, 12); // depósito -> baía de manutenção

  // Banda 2 (horizontal).
  carveRect(grid, 11, 17, 13, 17); // destravamento -> corredor de armadilhas
  carveRect(grid, 24, 17, 26, 17); // corredor de armadilhas -> manutenção
  carveRect(grid, 37, 17, 39, 17); // manutenção -> pátio de testes

  // Banda2 -> banda3 (vertical). A câmara do chefe só tem UMA entrada — o
  // corredor de armadilhas — e ela começa selada.
  carveRect(grid, 6, 22, 6, 24); // sala de destravamento -> corredor blindado
  carveRect(grid, 18, 22, 18, 24); // corredor de armadilhas -> pátio de lançamento (será selado)

  // A entrada da câmara do chefe começa selada — só reabre quando o
  // quebra-cabeça for resolvido (ver ArsenalScene._checkPuzzleGate).
  grid[23][18] = '#';

  // A entrada da Sala de Controle de Artilharia também começa selada — só
  // abre com o cartão derrubado pelo guardião da Sala de Comando (ver
  // ArsenalScene._checkArtilleryDoor).
  grid[5][54] = '#';

  const markers = {
    S: [{ gx: 3, gy: 4 }],
    // Sem inimigos no Corredor de Armadilhas de propósito — a sala é sobre
    // cronometragem/desvio dos espinhos, não combate.
    X: [
      { gx: 3, gy: 3 }, { gx: 6, gy: 7 }, // entrada
      { gx: 14, gy: 3 }, { gx: 19, gy: 7 }, // vigilância
      { gx: 27, gy: 3 }, { gx: 32, gy: 7 }, // depósito
      { gx: 41, gy: 3 }, { gx: 47, gy: 5 }, { gx: 43, gy: 9 }, // comando
      { gx: 43, gy: 15 }, { gx: 48, gy: 19 }, { gx: 45, gy: 17 }, // manutenção
      { gx: 4, gy: 27 }, { gx: 11, gy: 31 }, { gx: 7, gy: 29 }, // corredor blindado
      { gx: 23, gy: 29 }, { gx: 47, gy: 29 }, { gx: 23, gy: 33 }, { gx: 47, gy: 33 } // pátio de lançamento
    ],
    T: [
      { gx: 9, gy: 31 }, // corredor blindado
      { gx: 50, gy: 17 } // pátio de testes
    ],
    N: [
      { gx: 44, gy: 19 }, // pátio de testes — refém 1
      { gx: 46, gy: 7 } // comando — refém 2
    ],
    I: [{ gx: 17, gy: 3 }], // vigilância — arma
    C: [{ gx: 30, gy: 3 }], // depósito — arma nova à distância (railgun)
    A: [{ gx: 45, gy: 5 }], // comando — armadura
    H: [{ gx: 4, gy: 7 }, { gx: 30, gy: 19 }, { gx: 9, gy: 29 }], // kits de reparo
    // Sala de Destravamento — 4 terminais, na ordem 1→2→3→4 (ordem do
    // array é a ordem correta; reaproveita o mesmo mecanismo da Fase 05).
    Q: [{ gx: 4, gy: 15 }, { gx: 7, gy: 15 }, { gx: 4, gy: 19 }, { gx: 7, gy: 19 }],
    // Corredor de Armadilhas — espinhos cíclicos (independentes do jogador,
    // exigem cronometragem pra atravessar). Fases diferentes por posição
    // pra sempre sobrar uma rota segura no meio do ciclo.
    D: [
      { gx: 16, gy: 15, phase: 0 }, { gx: 19, gy: 15, phase: 1 },
      { gx: 18, gy: 17, phase: 2 }, { gx: 16, gy: 19, phase: 1 },
      { gx: 20, gy: 19, phase: 0 }, { gx: 21, gy: 17, phase: 2 }
    ],
    B: [{ gx: 34, gy: 31 }], // pátio de lançamento — chefe (Tanque de Cerco)
    L: [{ gx: 18, gy: 23 }], // entrada selada da câmara do chefe
    // Guardião da Sala de Comando — semi-boss (não é o chefe de fase) que
    // derruba o cartão de acesso à Sala de Controle de Artilharia.
    M: [{ gx: 49, gy: 8 }],
    // Entrada selada da Sala de Controle de Artilharia — só abre com o
    // cartão derrubado pelo guardião.
    J: [{ gx: 54, gy: 5 }],
    // Console da Sala de Controle de Artilharia — desativa o bombardeio de
    // canhão do Tanque de Cerco pro resto da fase (ver ArsenalScene).
    V: [{ gx: 60, gy: 6 }]
  };

  const zones = [
    { name: rooms.entrada.name, x1: 0, y1: 0, x2: 10, y2: 12 },
    { name: rooms.vigilancia.name, x1: 10, y1: 0, x2: 23, y2: 12 },
    { name: rooms.deposito.name, x1: 23, y1: 0, x2: 36, y2: 12 },
    { name: rooms.controle.name, x1: 36, y1: 0, x2: 53, y2: 12 },
    { name: rooms.artilharia.name, x1: 53, y1: 0, x2: 66, y2: 12 },
    { name: rooms.destravamento.name, x1: 0, y1: 12, x2: 12, y2: 24 },
    { name: rooms.corredorArmadilhas.name, x1: 12, y1: 12, x2: 25, y2: 24 },
    { name: rooms.manutencao.name, x1: 25, y1: 12, x2: 38, y2: 24 },
    { name: rooms.patioTestes.name, x1: 38, y1: 12, x2: 66, y2: 24 },
    { name: rooms.corredorBlindado.name, x1: 0, y1: 24, x2: 16, y2: 38 },
    { name: rooms.patioLancamento.name, x1: 16, y1: 24, x2: 66, y2: 38 }
  ];

  return { grid, markers, zones, width: WIDTH, height: HEIGHT };
}
