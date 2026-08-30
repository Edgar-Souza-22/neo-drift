// Construção programática do Submundo (hub da Região 3) — mesmo espírito do
// DistrictLayout.js: um hub pequeno, não uma fase de combate. Uma caverna
// só por enquanto (a passagem de volta pro Distrito Neon + a porta pra
// Fase 09 "Estação Fantasma"); preparado pra crescer com mais saídas quando
// as Fases 10-12 forem construídas, do mesmo jeito que o Distrito Neon
// cresceu a cada fase nova.

const WIDTH = 24;
const HEIGHT = 14;

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

  // Caverna principal — irregular (não um retângulo perfeito), com dois
  // nichos menores nas bordas pra não ler como uma sala de fábrica.
  carveRect(grid, 2, 3, 21, 10);
  carveRect(grid, 4, 10, 8, 12);
  carveRect(grid, 15, 10, 19, 12);

  // Entulho — só bloqueia passagem, não a rota principal.
  wallRect(grid, 10, 6, 10, 6);
  wallRect(grid, 13, 8, 13, 8);

  const markers = {
    // Ponto onde o jogador cai vindo do buraco do Distrito Neon.
    S: [{ gx: 5, gy: 5 }],
    // Passagem de volta pro Distrito Neon — sempre disponível, sem gancho.
    P: [{ gx: 5, gy: 7 }],
    // Porta de entrada pra Estação Fantasma (Fase 09) — sempre aberta.
    E: [{ gx: 18, gy: 6 }],
    N: [{ gx: 8, gy: 8 }, { gx: 14, gy: 8 }],
    X: [{ gx: 6, gy: 11 }, { gx: 17, gy: 11 }]
  };

  const zones = [
    { name: 'Caverna de Entrada', x1: 0, y1: 0, x2: WIDTH, y2: HEIGHT }
  ];

  return { grid, markers, zones, width: WIDTH, height: HEIGHT };
}
