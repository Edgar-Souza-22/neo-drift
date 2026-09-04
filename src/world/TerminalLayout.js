// Construção programática do Terminal de Contêineres (Fase 13, primeira
// incursão do Estaleiro Automatizado) — topologia em PÁTIO-GRADE: pilhas de
// contêineres regulares formam avenidas leste-oeste e ruas norte-sul, sem
// salas ligadas por corredor de 1 tile. Distinto do anel do Servidor, da
// hive da Colônia e do loop do Mercado. Drones de carga circulam as rotas.
//
// Progressão trancada:
//   - a Sala da Ponte (anexo sudoeste, sempre aberta) tem uma PONTE LEVADIÇA
//     de 3 pranchas sobre um fosso; pisar nos pedais deita as pranchas. Com
//     a ponte baixada dá pra ATRAVESSAR até a Câmara do Estivador (ilha a
//     oeste), onde estão as Botas Magnéticas de Estiva e o próprio Estivador;
//   - derrotar o Estivador -> abre o Armazém de Manifestações (L2), com a
//     armadura e a pistola;
//   - ponte baixada E Estivador fora do pátio -> abre a Doca de Carga (L3),
//     onde ficam a lâmina e O Empilhador.
//
// Anexo nordeste: enquanto o GUINDASTE está ligado, contêineres despencam
// sozinhos pelo pátio (telégrafo + queda + parede temporária, ver
// _updateCraneHazard). A Cabine de Comando (sempre aberta pelo pátio) tem o
// puzzle das TRAVAS DE SEGURANÇA; solto, abre a Sala do Guindaste (portão LG),
// onde 6 guardas defendem a CHAVE do guindaste — puxá-la desliga o guindaste
// e para as quedas.
//
// O anexo sudoeste fica no canto INFERIOR-esquerdo de propósito: o painel do
// HUD é preso no topo-esquerdo da tela, então a ponte/puzzle sempre renderiza
// abaixo dele, nunca coberta.

const WIDTH = 64;
const HEIGHT = 50;

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

export function buildTerminalYard() {
  const grid = Array.from({ length: HEIGHT }, () => Array(WIDTH).fill('#'));

  // Pátio principal — laje contida em x12..52 / y10..40, com parede sólida
  // em toda a volta (x11, x53, y9, y41). As áreas trancadas ficam do lado
  // de fora dessas paredes.
  carveRect(grid, 12, 10, 52, 40);

  // Pilhas ISO 4×3 — grade 5×4. Avenidas L-O: y10-12, 16-19, 23-26, 30-33,
  // 37-40. Ruas N-S: x12-14, 19-22, 27-30, 35-38, 43-46, 51-52.
  const stackXs = [15, 23, 31, 39, 47];
  const stackYs = [13, 20, 27, 34];
  for (const sx of stackXs) {
    for (const sy of stackYs) {
      wallRect(grid, sx, sy, sx + 3, sy + 2);
    }
  }

  // Portão de Carga (entrada sul) — único vão na parede sul do pátio.
  carveRect(grid, 30, 41, 34, 48);

  // --- Anexo sudoeste: Sala da Ponte + Câmara do Estivador -----------------

  // Sala da Ponte — sala de controle, sempre aberta. Entra pelo pátio por
  // uma boca de 4 tiles na Avenida Sul (x19-22 / y41).
  carveRect(grid, 14, 42, 27, 47);
  carveRect(grid, 19, 41, 22, 41);
  // Perna sul da sala, sob o fosso — leva aos 3 pedais da ponte.
  carveRect(grid, 9, 46, 13, 47);

  // Fosso da ponte — fileira y44 (x8..13) é o vão que as pranchas cobrem;
  // y43 e y45 são o abismo. Piso recortado só pro render: a cena marca tudo
  // como não-caminhável e cobre com o bloco escuro do fosso (ver _buildBridge).
  carveRect(grid, 8, 43, 13, 45);

  // Câmara do Estivador — ilha a oeste. O único acesso é a ponte: quando as
  // 3 pranchas deitam, a fileira y44 vira passagem contínua de (13,44) até
  // (8,44) e daí pra (7,44), dentro da Câmara.
  carveRect(grid, 1, 40, 7, 48);

  // Armazém de Manifestações (leste) — murado, fora do pátio. Só entra pelo
  // portão L2 em (53,24), na parede leste da Avenida Central.
  carveRect(grid, 54, 18, 62, 34);

  // Doca de Carga (norte) — murada, fora do pátio. Só entra pelo portão L3
  // em (32,9), na parede norte da avenida.
  carveRect(grid, 16, 1, 48, 8);

  // --- Anexo nordeste: Cabine de Comando + Sala do Guindaste --------------

  // Cabine de Comando — puzzle das travas de segurança. Sempre aberta pelo
  // pátio por uma boca de 2 tiles na parede leste da avenida norte (x53/y11-12).
  carveRect(grid, 54, 10, 62, 16);
  carveRect(grid, 53, 11, 53, 12);

  // Sala do Guindaste — a leste da Doca, murada. Só entra pelo portão LG em
  // (56,9), aberto pelas 3 travas da Cabine. Dentro: a chave do guindaste
  // (K) e 6 guardas (GD).
  carveRect(grid, 50, 1, 62, 8);

  const markers = {
    S: [{ gx: 32, gy: 46 }],
    // Drones de carga — cada um nasce num extremo de rota (ver cargoRoutes).
    X: [
      { gx: 13, gy: 17, route: 0 }, { gx: 50, gy: 17, route: 0 },
      { gx: 13, gy: 24, route: 1 }, { gx: 50, gy: 24, route: 1 },
      { gx: 13, gy: 31, route: 2 }, { gx: 50, gy: 31, route: 2 },
      { gx: 21, gy: 11, route: 3 }, { gx: 21, gy: 39, route: 3 },
      { gx: 37, gy: 11, route: 4 }, { gx: 37, gy: 39, route: 4 },
      { gx: 45, gy: 11, route: 5 }, { gx: 45, gy: 39, route: 5 }
    ],
    T: [
      { gx: 23, gy: 17 },
      { gx: 39, gy: 24 },
      { gx: 31, gy: 31 }
    ],
    N: [
      { gx: 24, gy: 45 },
      { gx: 44, gy: 38 }
    ],
    // Lâmina — dentro da Doca de Carga (L3).
    I: [{ gx: 40, gy: 4 }],
    // Armadura e pistola — dentro do Armazém (L2).
    A: [{ gx: 58, gy: 22 }],
    C: [{ gx: 59, gy: 30 }],
    // Botas de Impulso da Região 4 — recompensa por baixar a Ponte, do outro
    // lado dela, na Câmara do Estivador.
    P: [{ gx: 5, gy: 42 }],
    H: [{ gx: 32, gy: 11 }, { gx: 14, gy: 23 }, { gx: 46, gy: 32 }],
    // Pedais da ponte — um por prancha, na perna sul da sala de controle.
    Q: [
      { gx: 9, gy: 46 },
      { gx: 11, gy: 46 },
      { gx: 13, gy: 46 }
    ],
    // O Estivador (sub-confronto) — na Câmara, do outro lado da ponte.
    M: [{ gx: 4, gy: 44 }],
    // O Empilhador (confronto final) — no fundo da Doca de Carga.
    B: [{ gx: 32, gy: 4 }],
    // Pedais das travas de segurança da Cabine de Comando (nordeste).
    G: [
      { gx: 56, gy: 14 },
      { gx: 58, gy: 14 },
      { gx: 60, gy: 14 }
    ],
    // Chave do guindaste — no meio da Sala do Guindaste, atrás dos guardas
    // (puxada para o sul da sala pra não renderizar junto ao topo do HUD).
    K: [{ gx: 56, gy: 6 }],
    // 6 guardas fortes da Sala do Guindaste.
    GD: [
      { gx: 53, gy: 4 }, { gx: 59, gy: 4 }, { gx: 56, gy: 3 },
      { gx: 53, gy: 7 }, { gx: 59, gy: 7 }, { gx: 56, gy: 7 }
    ],
    L2: [{ gx: 53, gy: 24 }],
    L3: [{ gx: 32, gy: 9 }],
    // Portão da Sala do Guindaste — abre com as 3 travas de segurança soltas.
    LG: [{ gx: 56, gy: 9 }]
  };

  // Ponte levadiça: 3 pranchas de 2 tiles cada sobre a fileira y44. Cada uma
  // começa levantada (state 0 = pro norte, 2 = pro sul); o pedal cicla
  // 0 -> 1 (deitada/passável) -> 2 -> 0. Baixada = as 3 em state 1.
  const bridge = {
    laneY: 44,
    spans: [{ x0: 8 }, { x0: 10 }, { x0: 12 }],
    startStates: [0, 2, 0]
  };

  const cargoRoutes = [
    [{ gx: 13, gy: 17 }, { gx: 51, gy: 17 }],
    [{ gx: 13, gy: 24 }, { gx: 51, gy: 24 }],
    [{ gx: 13, gy: 31 }, { gx: 51, gy: 31 }],
    [{ gx: 21, gy: 11 }, { gx: 21, gy: 39 }],
    [{ gx: 37, gy: 11 }, { gx: 37, gy: 39 }],
    [{ gx: 45, gy: 11 }, { gx: 45, gy: 39 }]
  ];

  const zones = [
    { name: 'Sala do Guindaste', x1: 49, y1: 0, x2: WIDTH, y2: 9 },
    { name: 'Cabine de Comando', x1: 53, y1: 9, x2: WIDTH, y2: 17 },
    { name: 'Doca de Carga', x1: 15, y1: 0, x2: 49, y2: 9 },
    { name: 'Câmara do Estivador', x1: 0, y1: 39, x2: 8, y2: HEIGHT },
    { name: 'Sala da Ponte', x1: 8, y1: 41, x2: 28, y2: HEIGHT },
    { name: 'Armazém de Manifestações', x1: 53, y1: 17, x2: WIDTH, y2: 35 },
    { name: 'Portão de Carga', x1: 29, y1: 41, x2: 35, y2: HEIGHT },
    { name: 'Pátio Norte', x1: 12, y1: 10, x2: 52, y2: 16 },
    { name: 'Avenida Central', x1: 12, y1: 22, x2: 52, y2: 27 },
    { name: 'Avenida Sul', x1: 12, y1: 36, x2: 52, y2: 41 },
    { name: 'Rua Oeste', x1: 12, y1: 13, x2: 19, y2: 36 },
    { name: 'Pátio Central', x1: 12, y1: 10, x2: 53, y2: 41 }
  ];

  return { grid, markers, zones, bridge, cargoRoutes, width: WIDTH, height: HEIGHT };
}
