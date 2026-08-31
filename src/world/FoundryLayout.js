// Construção programática da Ala de Fundição (Fase 02) — mesmo estilo do
// DungeonLayout.js. Sobre ~5x o número de tiles andáveis da Fase 01.

const WIDTH = 46;
const HEIGHT = 33;

function carveRect(grid, x1, y1, x2, y2) {
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      grid[y][x] = '.';
    }
  }
}

export function buildFoundryWing() {
  const grid = Array.from({ length: HEIGHT }, () => Array(WIDTH).fill('#'));

  const rooms = {
    entrada: { x1: 1, y1: 1, x2: 7, y2: 8, name: 'Entrada da Fundição' },
    fornalhas: { x1: 11, y1: 1, x2: 17, y2: 8, name: 'Corredor de Fornalhas' },
    minerio: { x1: 21, y1: 1, x2: 29, y2: 8, name: 'Depósito de Minério' },
    primaria: { x1: 33, y1: 1, x2: 44, y2: 10, name: 'Sala de Fundição Primária' },
    resfriamento: { x1: 1, y1: 12, x2: 7, y2: 19, name: 'Sala de Resfriamento' },
    transporte: { x1: 11, y1: 12, x2: 17, y2: 19, name: 'Corredor de Transporte' },
    secundaria: { x1: 21, y1: 12, x2: 31, y2: 19, name: 'Sala de Fundição Secundária' },
    cofre: { x1: 35, y1: 12, x2: 44, y2: 19, name: 'Cofre da Fundição' },
    residuos: { x1: 11, y1: 23, x2: 21, y2: 30, name: 'Câmara de Resíduos' },
    nucleo: { x1: 25, y1: 23, x2: 42, y2: 32, name: 'Núcleo da Fundição' }
  };

  for (const room of Object.values(rooms)) {
    carveRect(grid, room.x1, room.y1, room.x2, room.y2);
  }

  // Corredores — banda 1 (horizontal).
  carveRect(grid, 8, 4, 10, 4); // entrada -> fornalhas
  carveRect(grid, 18, 4, 20, 4); // fornalhas -> minério
  carveRect(grid, 30, 4, 32, 4); // minério -> primária

  // Banda1 -> banda2 (vertical).
  carveRect(grid, 4, 9, 4, 11); // entrada -> resfriamento
  carveRect(grid, 14, 9, 14, 11); // fornalhas -> transporte
  carveRect(grid, 25, 9, 25, 11); // minério -> secundária

  // Banda 2 (horizontal).
  carveRect(grid, 8, 15, 10, 15); // resfriamento -> transporte
  carveRect(grid, 18, 15, 20, 15); // transporte -> secundária
  carveRect(grid, 32, 15, 34, 15); // secundária -> cofre (será trancado)

  // Banda2 -> banda3 (vertical).
  carveRect(grid, 14, 20, 14, 22); // transporte -> resíduos

  // Banda 3 (horizontal).
  carveRect(grid, 22, 26, 24, 26); // resíduos -> núcleo

  // A porta do cofre começa trancada — uma célula do corredor volta a ser
  // parede até o cartão de acesso da fundição ser encontrado.
  grid[15][33] = '#';

  const markers = {
    S: [{ gx: 3, gy: 4 }],
    X: [
      { gx: 2, gy: 2 }, { gx: 6, gy: 6 }, // entrada
      { gx: 12, gy: 2 }, { gx: 16, gy: 6 }, // fornalhas
      { gx: 22, gy: 2 }, { gx: 27, gy: 6 }, // minério
      { gx: 34, gy: 2 }, { gx: 40, gy: 3 }, { gx: 37, gy: 8 }, // primária
      { gx: 12, gy: 17 }, { gx: 16, gy: 13 }, // transporte
      { gx: 22, gy: 13 }, { gx: 26, gy: 17 }, { gx: 29, gy: 14 }, // secundária
      { gx: 13, gy: 24 }, { gx: 19, gy: 29 } // resíduos
    ],
    T: [
      { gx: 37, gy: 5 }, // primária (blindado) — carrega o cartão de acesso
      { gx: 24, gy: 16 }, // secundária (blindado)
      { gx: 16, gy: 27 } // resíduos (blindado)
    ],
    N: [
      { gx: 5, gy: 16 }, // resfriamento — Operária Presa
      { gx: 40, gy: 8 } // primária — Supervisor Preso
    ],
    I: [{ gx: 22, gy: 6 }], // minério — arma
    A: [{ gx: 5, gy: 14 }], // resfriamento — armadura
    H: [{ gx: 13, gy: 26 }, { gx: 30, gy: 15 }], // kits de reparo (recuperam HP)
    P: [{ gx: 42, gy: 3 }], // primária — Botas de Impulso
    B: [{ gx: 33, gy: 27 }], // núcleo — chefe
    L: [{ gx: 33, gy: 15 }], // porta trancada do cofre
    R: [{ gx: 40, gy: 15 }] // cofre — recompensa (Pistola Sísmica)
  };

  const zones = [
    { name: rooms.entrada.name, x1: 0, y1: 0, x2: 9, y2: 11 },
    { name: rooms.fornalhas.name, x1: 9, y1: 0, x2: 19, y2: 11 },
    { name: rooms.minerio.name, x1: 19, y1: 0, x2: 31, y2: 11 },
    { name: rooms.primaria.name, x1: 31, y1: 0, x2: 46, y2: 11 },
    { name: rooms.resfriamento.name, x1: 0, y1: 11, x2: 9, y2: 22 },
    { name: rooms.transporte.name, x1: 9, y1: 11, x2: 19, y2: 22 },
    { name: rooms.secundaria.name, x1: 19, y1: 11, x2: 33, y2: 22 },
    { name: rooms.cofre.name, x1: 33, y1: 11, x2: 46, y2: 22 },
    { name: rooms.residuos.name, x1: 9, y1: 22, x2: 23, y2: 33 },
    { name: rooms.nucleo.name, x1: 23, y1: 22, x2: 46, y2: 33 }
  ];

  return { grid, markers, zones, width: WIDTH, height: HEIGHT };
}
