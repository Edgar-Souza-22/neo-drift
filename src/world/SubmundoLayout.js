// Construção programática do Submundo (hub da Região 3) — mesmo espírito do
// DistrictLayout.js: um hub pequeno, não uma fase de combate. Caverna com
// passagem de volta pro Distrito Neon, saídas pras fases 09-12, e (depois
// do Servidor Oculto) o poço de carga que sobe pro Estaleiro Automatizado.

const WIDTH = 28;
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

export function buildSubmundoHub() {
  const grid = Array.from({ length: HEIGHT }, () => Array(WIDTH).fill('#'));

  // Caverna principal — irregular, com nichos pras saídas das fases.
  carveRect(grid, 2, 3, 25, 12);
  carveRect(grid, 4, 12, 8, 14);
  carveRect(grid, 15, 12, 19, 14);
  carveRect(grid, 21, 10, 26, 14);
  carveRect(grid, 20, 1, 26, 3);
  // Alcova do poço de carga pro Estaleiro Automatizado — nicho na parede sul
  // da caverna (não no canto superior, onde o HUD cobre). Só ganha o poço +
  // a Estivadora Ryn depois de limpar o Servidor Oculto (ver SubmundoScene).
  // O poço sobe, não cai: o contrário do buraco que trouxe o jogador do
  // Distrito Neon.
  carveRect(grid, 10, 12, 14, 14);

  wallRect(grid, 10, 6, 10, 6);
  wallRect(grid, 13, 8, 13, 8);

  const markers = {
    S: [{ gx: 5, gy: 5 }],
    P: [{ gx: 5, gy: 7 }],
    E: [{ gx: 18, gy: 6 }],
    E2: [{ gx: 12, gy: 4 }],
    // Porta da Colônia de Contaminados (Fase 11) — só existe depois de
    // limpar o Mercado Negro, mesmo gancho das fases anteriores da região.
    E3: [{ gx: 24, gy: 8 }],
    // Porta do Servidor Oculto (Fase 12) — só existe depois de limpar a
    // Colônia de Contaminados.
    E4: [{ gx: 23, gy: 2 }],
    // Estivadora Ryn + poço de carga pro Estaleiro — na alcova da parede sul
    // (x10-14 / y12-14), longe do canto coberto pelo HUD. Só existem depois
    // de limpar o Servidor Oculto (ver SubmundoScene).
    RY: [{ gx: 10, gy: 13 }],
    L: [{ gx: 13, gy: 13 }],
    N: [{ gx: 8, gy: 8 }, { gx: 14, gy: 8 }],
    N2: [{ gx: 5, gy: 13 }, { gx: 18, gy: 13 }],
    N3: [{ gx: 22, gy: 13 }, { gx: 25, gy: 13 }],
    N4: [{ gx: 11, gy: 10 }, { gx: 15, gy: 10 }],
    X: [{ gx: 6, gy: 13 }, { gx: 17, gy: 13 }]
  };

  const zones = [
    { name: 'Caverna de Entrada', x1: 0, y1: 0, x2: WIDTH, y2: HEIGHT }
  ];

  return { grid, markers, zones, width: WIDTH, height: HEIGHT };
}
