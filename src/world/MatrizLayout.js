// Construção programática da Praça da Matriz (hub da Região 5 — Torre
// Matriz da Neo Industries) — esplanada aberta ao pé da torre, com uma
// escadaria larga ao norte subindo pras quatro entradas da sede. Não é o
// cais longo do Estaleiro, nem a caverna do Submundo, nem a praça em cruz do
// Distrito: aqui o espaço é UM vão único e simétrico, com o monumento da
// corporação plantado no meio, e tudo que importa fica na face norte.

const WIDTH = 42;
const HEIGHT = 20;

function carveRect(grid, x1, y1, x2, y2) {
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) grid[y][x] = '.';
  }
}

function wallRect(grid, x1, y1, x2, y2) {
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) grid[y][x] = '#';
  }
}

export function buildMatrizHub() {
  const grid = Array.from({ length: HEIGHT }, () => Array(WIDTH).fill('#'));

  // Esplanada principal — vão único, largo, simétrico.
  carveRect(grid, 3, 7, 38, 17);

  // Escadaria/terraço da fachada norte, onde ficam as entradas.
  carveRect(grid, 8, 3, 33, 7);

  // Alcova oeste — plataforma do monotrilho (volta ao Estaleiro).
  carveRect(grid, 1, 9, 4, 15);

  // Monumento da corporação no meio da esplanada — obstáculo central que
  // obriga a contornar, o que dá escala ao vão em vez de deixá-lo chapado.
  wallRect(grid, 19, 11, 22, 13);

  // Canteiros laterais.
  wallRect(grid, 9, 14, 11, 15);
  wallRect(grid, 30, 14, 32, 15);

  const markers = {
    S: [{ gx: 20, gy: 16 }],
    // Monotrilho de volta ao Estaleiro Automatizado — sempre disponível.
    L: [{ gx: 2, gy: 12 }],
    // Entradas da torre, da esquerda pra direita: Fases 17-20. Só a do
    // Átrio Executivo abre por enquanto.
    E: [{ gx: 11, gy: 4 }],
    E2: [{ gx: 18, gy: 4 }],
    E3: [{ gx: 24, gy: 4 }],
    E4: [{ gx: 31, gy: 4 }],
    N: [{ gx: 7, gy: 12 }, { gx: 34, gy: 12 }],
    N2: [{ gx: 14, gy: 10 }, { gx: 27, gy: 10 }]
  };

  const zones = [
    { name: 'Praça da Matriz', x1: 0, y1: 0, x2: WIDTH, y2: HEIGHT }
  ];

  return { grid, markers, zones, width: WIDTH, height: HEIGHT };
}
