// Construção programática da Ala do Reator (Fase 03) — mesmo estilo do
// FoundryLayout.js, mapa maior que a Fase 02. O Cofre do Reator só tem uma
// entrada (o corredor trancado vindo do Depósito de Bobinas), guardado por
// um semi-boss que carrega o cartão de acesso. A Câmara de Alta Tensão e o
// Núcleo do Reator têm piso eletrificado (dano ao pisar, em xadrez pra dar
// pra desviar) — só para de causar dano depois de pegar a armadura do cofre.

const WIDTH = 52;
const HEIGHT = 38;

function carveRect(grid, x1, y1, x2, y2) {
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      grid[y][x] = '.';
    }
  }
}

// Preenche um retângulo com piso eletrificado em padrão xadrez (dá pra
// desviar das células perigosas em vez de ser um bloqueio total).
function electrifyChecker(list, x1, y1, x2, y2) {
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      if ((x + y) % 2 === 0) list.push({ gx: x, gy: y });
    }
  }
}

export function buildReactorWing() {
  const grid = Array.from({ length: HEIGHT }, () => Array(WIDTH).fill('#'));

  const rooms = {
    entrada: { x1: 1, y1: 1, x2: 8, y2: 9, name: 'Entrada do Reator' },
    transmissao: { x1: 12, y1: 1, x2: 19, y2: 9, name: 'Corredor de Transmissão' },
    capacitores: { x1: 23, y1: 1, x2: 32, y2: 9, name: 'Sala de Capacitores' },
    turbinas: { x1: 36, y1: 1, x2: 50, y2: 11, name: 'Sala de Turbinas' },
    altaTensao: { x1: 1, y1: 13, x2: 10, y2: 21, name: 'Câmara de Alta Tensão' },
    distribuicao: { x1: 14, y1: 13, x2: 21, y2: 21, name: 'Corredor de Distribuição' },
    bobinas: { x1: 25, y1: 13, x2: 34, y2: 21, name: 'Depósito de Bobinas' },
    cofre: { x1: 38, y1: 13, x2: 50, y2: 21, name: 'Cofre do Reator' },
    contencao2: { x1: 1, y1: 25, x2: 14, y2: 33, name: 'Contenção Secundária' },
    nucleo: { x1: 18, y1: 25, x2: 50, y2: 37, name: 'Núcleo do Reator' }
  };

  for (const room of Object.values(rooms)) {
    carveRect(grid, room.x1, room.y1, room.x2, room.y2);
  }

  // Banda 1 (horizontal).
  carveRect(grid, 9, 5, 11, 5); // entrada -> transmissão
  carveRect(grid, 20, 5, 22, 5); // transmissão -> capacitores
  carveRect(grid, 33, 5, 35, 5); // capacitores -> turbinas

  // Banda1 -> banda2 (vertical). Turbinas fica só acessível pela banda 1
  // (sem conexão direta com o cofre) — garante que o cofre só se abre pelo
  // corredor trancado vindo das bobinas.
  carveRect(grid, 5, 10, 5, 12); // entrada -> alta tensão
  carveRect(grid, 16, 10, 16, 12); // transmissão -> distribuição
  carveRect(grid, 28, 10, 28, 12); // capacitores -> bobinas

  // Banda 2 (horizontal).
  carveRect(grid, 11, 17, 13, 17); // alta tensão -> distribuição
  carveRect(grid, 22, 17, 24, 17); // distribuição -> bobinas
  carveRect(grid, 35, 17, 37, 17); // bobinas -> cofre (será trancado)

  // Banda2 -> banda3 (vertical).
  carveRect(grid, 6, 22, 6, 24); // alta tensão -> contenção secundária
  carveRect(grid, 30, 22, 30, 24); // bobinas -> núcleo

  // Banda 3 (horizontal).
  carveRect(grid, 15, 29, 17, 29); // contenção secundária -> núcleo

  // A porta do cofre começa trancada — só reabre com o cartão derrubado
  // pelo semi-boss que guarda o Depósito de Bobinas.
  grid[17][36] = '#';

  // Piso eletrificado: câmara de alta tensão (sala lateral) e uma faixa nas
  // duas laterais do núcleo do chefe (deixa o corredor central livre pra a
  // luta em si) — em ambos os casos, xadrez, não bloqueio total.
  const electrifiedTiles = [];
  electrifyChecker(electrifiedTiles, 2, 14, 9, 20);
  electrifyChecker(electrifiedTiles, 20, 27, 26, 35);
  electrifyChecker(electrifiedTiles, 42, 27, 48, 35);

  const markers = {
    S: [{ gx: 3, gy: 4 }],
    X: [
      { gx: 3, gy: 3 }, { gx: 6, gy: 7 }, // entrada
      { gx: 14, gy: 3 }, { gx: 17, gy: 7 }, // transmissão
      { gx: 25, gy: 3 }, { gx: 30, gy: 7 }, // capacitores
      { gx: 39, gy: 3 }, { gx: 45, gy: 5 }, { gx: 41, gy: 9 }, // turbinas
      { gx: 3, gy: 15 }, { gx: 8, gy: 19 }, // alta tensão
      { gx: 16, gy: 15 }, { gx: 19, gy: 19 }, // distribuição
      { gx: 27, gy: 15 }, // bobinas
      { gx: 4, gy: 27 }, { gx: 11, gy: 31 }, // contenção secundária
      { gx: 23, gy: 29 }, { gx: 45, gy: 29 }, { gx: 23, gy: 33 }, { gx: 45, gy: 33 } // núcleo
    ],
    T: [
      { gx: 43, gy: 7 }, // turbinas
      { gx: 31, gy: 19 }, // bobinas
      { gx: 9, gy: 29 } // contenção secundária
    ],
    M: [{ gx: 33, gy: 17 }], // bobinas — semi-boss guardando o cofre, carrega o cartão
    N: [
      { gx: 3, gy: 14 }, // alta tensão — Técnica Presa
      { gx: 12, gy: 27 } // contenção secundária — Operário Preso
    ],
    I: [{ gx: 13, gy: 2 }], // transmissão — arma
    C: [{ gx: 26, gy: 2 }], // capacitores — upgrade de pistola
    R: [{ gx: 44, gy: 16 }], // cofre — recompensa (armadura isolante)
    H: [{ gx: 46, gy: 3 }, { gx: 4, gy: 31 }, { gx: 30, gy: 27 }], // kits de reparo
    B: [{ gx: 34, gy: 31 }], // núcleo — chefe
    L: [{ gx: 36, gy: 17 }] // porta trancada do cofre
  };

  const zones = [
    { name: rooms.entrada.name, x1: 0, y1: 0, x2: 10, y2: 12 },
    { name: rooms.transmissao.name, x1: 10, y1: 0, x2: 21, y2: 12 },
    { name: rooms.capacitores.name, x1: 21, y1: 0, x2: 34, y2: 12 },
    { name: rooms.turbinas.name, x1: 34, y1: 0, x2: 52, y2: 12 },
    { name: rooms.altaTensao.name, x1: 0, y1: 12, x2: 12, y2: 24 },
    { name: rooms.distribuicao.name, x1: 12, y1: 12, x2: 23, y2: 24 },
    { name: rooms.bobinas.name, x1: 23, y1: 12, x2: 36, y2: 24 },
    { name: rooms.cofre.name, x1: 36, y1: 12, x2: 52, y2: 24 },
    { name: rooms.contencao2.name, x1: 0, y1: 24, x2: 16, y2: 38 },
    { name: rooms.nucleo.name, x1: 16, y1: 24, x2: 52, y2: 38 }
  ];

  return { grid, markers, zones, electrifiedTiles, width: WIDTH, height: HEIGHT };
}
