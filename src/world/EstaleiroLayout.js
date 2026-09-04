// Construção programática do Estaleiro Automatizado (hub da Região 4) —
// cais longo leste-oeste com berços ao norte, não a praça em cruz do
// Distrito Neon nem a caverna irregular do Submundo. Poço de carga a oeste
// (volta ao Submundo) e quatro berços pras fases 13-16 (o Terminal de
// Contêineres já transiciona; os outros só ganham porta depois).

const WIDTH = 38;
const HEIGHT = 16;

function carveRect(grid, x1, y1, x2, y2) {
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      grid[y][x] = '.';
    }
  }
}

function wallRect(grid, x1, y1, x2, y2) {
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      grid[y][x] = '#';
    }
  }
}

export function buildEstaleiroHub() {
  const grid = Array.from({ length: HEIGHT }, () => Array(WIDTH).fill('#'));

  // Cais principal — pátio de carga alongado (leste-oeste).
  carveRect(grid, 2, 6, 35, 13);

  // Oeste — alcova do poço de carga (volta ao Submundo).
  carveRect(grid, 1, 7, 7, 12);

  // Berço norte 1 — Terminal de Contêineres (Fase 13).
  carveRect(grid, 8, 1, 14, 6);

  // Berço norte 2 — Refinaria Offshore (Fase 14, porta depois).
  carveRect(grid, 17, 1, 23, 6);

  // Berço norte 3 — Estaleiro Naval (Fase 15, porta depois).
  carveRect(grid, 26, 1, 32, 6);

  // Leste — alcova da Torre de Controle Logístico (Fase 16, porta depois).
  carveRect(grid, 32, 7, 36, 12);

  // Pilhas de contêineres no cais — bloqueiam passagem, não a rota principal.
  wallRect(grid, 10, 9, 12, 10);
  wallRect(grid, 20, 9, 22, 10);
  wallRect(grid, 29, 10, 30, 11);

  const markers = {
    S: [{ gx: 9, gy: 11 }],
    // Poço de carga de volta ao Submundo — sempre disponível, sem gancho.
    L: [{ gx: 3, gy: 9 }],
    // Porta do Terminal de Contêineres (Fase 13) — berço norte, sempre
    // transiciona pra incursão.
    E: [{ gx: 11, gy: 2 }],
    E2: [{ gx: 20, gy: 2 }],
    E3: [{ gx: 29, gy: 2 }],
    E4: [{ gx: 34, gy: 9 }],
    N: [{ gx: 7, gy: 11 }, { gx: 16, gy: 12 }],
    N2: [{ gx: 15, gy: 8 }, { gx: 24, gy: 8 }]
  };

  const zones = [
    { name: 'Cais do Estaleiro', x1: 0, y1: 0, x2: WIDTH, y2: HEIGHT }
  ];

  return { grid, markers, zones, width: WIDTH, height: HEIGHT };
}
