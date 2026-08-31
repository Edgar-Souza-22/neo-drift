// Construção programática da Torre de Segurança (Fase 05) — mesmo estilo do
// CoreLayout.js. Mecanismo estrutural desta fase: dois quebra-cabeças reais
// (Sala de Sequência e Sala de Circuito, ambas livres de combate) — a única
// entrada da Câmara do Curador (chefe) começa selada e só abre quando os
// DOIS quebra-cabeças forem resolvidos.

const WIDTH = 54;
const HEIGHT = 38;

function carveRect(grid, x1, y1, x2, y2) {
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      grid[y][x] = '.';
    }
  }
}

export function buildTowerWing() {
  const grid = Array.from({ length: HEIGHT }, () => Array(WIDTH).fill('#'));

  const rooms = {
    entrada: { x1: 1, y1: 1, x2: 8, y2: 9, name: 'Entrada da Torre' },
    vigilancia: { x1: 12, y1: 1, x2: 21, y2: 9, name: 'Sala de Vigilância' },
    deposito: { x1: 25, y1: 1, x2: 34, y2: 9, name: 'Depósito' },
    controle: { x1: 38, y1: 1, x2: 52, y2: 11, name: 'Sala de Controle' },
    sequencia: { x1: 1, y1: 13, x2: 10, y2: 21, name: 'Sala de Sequência' },
    corredorSeg: { x1: 14, y1: 13, x2: 23, y2: 21, name: 'Corredor de Segurança' },
    circuito: { x1: 27, y1: 13, x2: 36, y2: 21, name: 'Sala de Circuito' },
    antecamara: { x1: 40, y1: 13, x2: 52, y2: 21, name: 'Antecâmara do Cofre' },
    corredorBlindado: { x1: 1, y1: 25, x2: 14, y2: 33, name: 'Corredor Blindado' },
    camaraCurador: { x1: 18, y1: 25, x2: 52, y2: 37, name: 'Câmara do Curador' }
  };

  for (const room of Object.values(rooms)) {
    carveRect(grid, room.x1, room.y1, room.x2, room.y2);
  }

  // Banda 1 (horizontal).
  carveRect(grid, 9, 5, 11, 5); // entrada -> vigilância
  carveRect(grid, 22, 5, 24, 5); // vigilância -> depósito
  carveRect(grid, 35, 5, 37, 5); // depósito -> controle

  // Banda1 -> banda2 (vertical). Sala de Controle fica só acessível pela
  // banda 1 (sem conexão direta com a câmara do chefe).
  carveRect(grid, 5, 10, 5, 12); // entrada -> sala de sequência
  carveRect(grid, 16, 10, 16, 12); // vigilância -> corredor de segurança
  carveRect(grid, 30, 10, 30, 12); // depósito -> sala de circuito

  // Banda 2 (horizontal).
  carveRect(grid, 11, 17, 13, 17); // sequência -> corredor
  carveRect(grid, 24, 17, 26, 17); // corredor -> circuito
  carveRect(grid, 37, 17, 39, 17); // circuito -> antecâmara

  // Banda2 -> banda3 (vertical). A câmara do chefe só tem UMA entrada — o
  // corredor de segurança — e ela começa selada.
  carveRect(grid, 6, 22, 6, 24); // sala de sequência -> corredor blindado
  carveRect(grid, 18, 22, 18, 24); // corredor de segurança -> câmara do curador (será selado)

  // A entrada da câmara do chefe começa selada — só reabre quando os dois
  // quebra-cabeças forem resolvidos (ver TowerScene._checkPuzzleGate).
  grid[23][18] = '#';

  const markers = {
    S: [{ gx: 3, gy: 4 }],
    X: [
      { gx: 3, gy: 3 }, { gx: 6, gy: 7 }, // entrada
      { gx: 14, gy: 3 }, { gx: 19, gy: 7 }, // vigilância
      { gx: 27, gy: 3 }, { gx: 32, gy: 7 }, // depósito
      { gx: 41, gy: 3 }, { gx: 47, gy: 5 }, { gx: 43, gy: 9 }, // controle
      { gx: 16, gy: 15 }, { gx: 21, gy: 19 }, { gx: 19, gy: 17 }, // corredor de segurança
      { gx: 43, gy: 15 }, { gx: 48, gy: 19 }, { gx: 45, gy: 17 }, // antecâmara
      { gx: 4, gy: 27 }, { gx: 11, gy: 31 }, { gx: 7, gy: 29 }, // corredor blindado
      { gx: 23, gy: 29 }, { gx: 47, gy: 29 }, { gx: 23, gy: 33 }, { gx: 47, gy: 33 } // câmara do curador
    ],
    T: [
      { gx: 9, gy: 31 }, // corredor blindado
      { gx: 50, gy: 17 } // antecâmara
    ],
    N: [
      { gx: 44, gy: 19 }, // antecâmara — captivo 1
      { gx: 46, gy: 7 } // controle — captivo 2
    ],
    I: [{ gx: 17, gy: 3 }], // vigilância — arma
    C: [{ gx: 30, gy: 3 }], // depósito — upgrade de pistola
    A: [{ gx: 45, gy: 5 }], // controle — armadura
    P: [{ gx: 7, gy: 7 }], // entrada — Botas de Impulso
    H: [{ gx: 4, gy: 7 }, { gx: 30, gy: 19 }, { gx: 9, gy: 29 }], // kits de reparo
    // Sala de Sequência — 4 placas, na ordem 1→2→3→4 (a ordem do array é a
    // ordem correta; ver TowerScene).
    Q: [{ gx: 4, gy: 15 }, { gx: 7, gy: 15 }, { gx: 4, gy: 19 }, { gx: 7, gy: 19 }],
    // Sala de Circuito — 5 células em cruz: [centro, cima, baixo, esquerda, direita].
    K: [{ gx: 31, gy: 17 }, { gx: 31, gy: 15 }, { gx: 31, gy: 19 }, { gx: 29, gy: 17 }, { gx: 33, gy: 17 }],
    B: [{ gx: 34, gy: 31 }], // câmara do curador — chefe
    L: [{ gx: 18, gy: 23 }] // entrada selada da câmara do chefe
  };

  const zones = [
    { name: rooms.entrada.name, x1: 0, y1: 0, x2: 10, y2: 12 },
    { name: rooms.vigilancia.name, x1: 10, y1: 0, x2: 23, y2: 12 },
    { name: rooms.deposito.name, x1: 23, y1: 0, x2: 36, y2: 12 },
    { name: rooms.controle.name, x1: 36, y1: 0, x2: 54, y2: 12 },
    { name: rooms.sequencia.name, x1: 0, y1: 12, x2: 12, y2: 24 },
    { name: rooms.corredorSeg.name, x1: 12, y1: 12, x2: 25, y2: 24 },
    { name: rooms.circuito.name, x1: 25, y1: 12, x2: 38, y2: 24 },
    { name: rooms.antecamara.name, x1: 38, y1: 12, x2: 54, y2: 24 },
    { name: rooms.corredorBlindado.name, x1: 0, y1: 24, x2: 16, y2: 38 },
    { name: rooms.camaraCurador.name, x1: 16, y1: 24, x2: 54, y2: 38 }
  ];

  return { grid, markers, zones, width: WIDTH, height: HEIGHT };
}
