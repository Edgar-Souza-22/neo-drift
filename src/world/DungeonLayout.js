// Construção programática do Setor de Contenção (Fase 01): salas retangulares
// carimbadas num grid + corredores, em vez de arte ASCII contada manualmente
// (fonte de bugs no mapa anterior). Cada sala é um "sub-setor" nomeado, usado
// para o rótulo de zona exibido no HUD.

const WIDTH = 25;
const HEIGHT = 17;

function carveRect(grid, x1, y1, x2, y2) {
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      grid[y][x] = '.';
    }
  }
}

export function buildContainmentSector() {
  const grid = Array.from({ length: HEIGHT }, () => Array(WIDTH).fill('#'));

  const rooms = {
    vestibulo: { x1: 1, y1: 1, x2: 5, y2: 5, name: 'Vestíbulo' },
    detencao: { x1: 9, y1: 1, x2: 13, y2: 5, name: 'Câmara de Detenção' },
    energia: { x1: 9, y1: 9, x2: 13, y2: 13, name: 'Sala de Energia' },
    vigilancia: { x1: 17, y1: 1, x2: 21, y2: 5, name: 'Corredor de Vigilância' },
    nucleo: { x1: 16, y1: 9, x2: 23, y2: 15, name: 'Núcleo de Contenção' },
    cofre: { x1: 2, y1: 10, x2: 6, y2: 14, name: 'Cofre Selado' }
  };

  for (const room of Object.values(rooms)) {
    carveRect(grid, room.x1, room.y1, room.x2, room.y2);
  }

  // Corredores conectando as salas.
  carveRect(grid, 6, 3, 8, 3); // vestíbulo -> detenção
  carveRect(grid, 11, 6, 11, 8); // detenção -> energia
  carveRect(grid, 14, 3, 16, 3); // detenção -> vigilância
  carveRect(grid, 19, 6, 19, 8); // vigilância -> núcleo
  carveRect(grid, 3, 6, 3, 9); // vestíbulo -> cofre (selado)

  // A porta do cofre começa trancada: uma célula do corredor volta a ser
  // parede até o jogador conseguir o cartão de acesso (ver DungeonScene).
  grid[7][3] = '#';

  const markers = {
    S: [{ gx: 3, gy: 3 }],
    X: [
      { gx: 2, gy: 2 }, { gx: 4, gy: 4 }, // vestíbulo
      { gx: 10, gy: 2 }, { gx: 12, gy: 4 }, // detenção
      { gx: 10, gy: 10 }, // energia
      { gx: 18, gy: 2 } // vigilância
    ],
    T: [
      { gx: 12, gy: 12 }, // energia (blindado) — carrega o cartão de acesso do cofre
      { gx: 20, gy: 2 } // vigilância (blindado)
    ],
    N: [
      { gx: 10, gy: 4 }, // detenção — Técnico Preso
      { gx: 19, gy: 4 } // vigilância — Colona Resgatada
    ],
    I: [{ gx: 12, gy: 2 }], // detenção — Lâmina de Plasma
    A: [{ gx: 11, gy: 9 }], // energia — Blindagem Reforçada
    P: [{ gx: 17, gy: 4 }], // vigilância — sem item (marcador livre)
    B: [{ gx: 20, gy: 12 }], // núcleo — Guardião Núcleo
    L: [{ gx: 3, gy: 7 }], // porta trancada do cofre
    R: [{ gx: 4, gy: 12 }] // cofre — recompensa (Pistola de Pulso)
  };

  const zones = [
    { name: rooms.vestibulo.name, x1: 0, y1: 0, x2: 8, y2: 6 },
    { name: rooms.detencao.name, x1: 8, y1: 0, x2: 17, y2: 6 },
    { name: rooms.vigilancia.name, x1: 16, y1: 0, x2: 23, y2: 6 },
    { name: rooms.energia.name, x1: 8, y1: 6, x2: 15, y2: 15 },
    { name: rooms.nucleo.name, x1: 15, y1: 6, x2: 25, y2: 17 },
    { name: rooms.cofre.name, x1: 0, y1: 8, x2: 8, y2: 17 }
  ];

  return { grid, markers, zones };
}
