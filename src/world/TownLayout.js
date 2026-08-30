// Construção programática da Ala Central (hub), no mesmo estilo do
// DungeonLayout.js — evita contar caracteres de ASCII na mão.

const WIDTH = 24;
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

export function buildCentralWing() {
  const grid = Array.from({ length: HEIGHT }, () => Array(WIDTH).fill('#'));

  carveRect(grid, 1, 1, WIDTH - 2, HEIGHT - 2);
  // Pilares estruturais simétricos — só decoração, não bloqueiam a rota principal.
  wallRect(grid, 3, 4, 4, 5);
  wallRect(grid, WIDTH - 6, 4, WIDTH - 5, 5);

  const markers = {
    S: [{ gx: 11, gy: 8 }],
    E: [{ gx: 11, gy: 12 }],
    // Guarda fica perto da porta do setor (faz sentido ele vigiar a entrada) —
    // longe do canto superior-esquerdo, onde o painel de status do HUD cobre a tela.
    N: [{ gx: 8, gy: 11 }, { gx: WIDTH - 3, gy: 2 }]
  };

  return { grid, markers, width: WIDTH, height: HEIGHT };
}
