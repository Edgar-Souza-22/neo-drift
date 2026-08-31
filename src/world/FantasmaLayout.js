// Construção programática da Estação Fantasma (Fase 09) — traçado LINEAR
// (uma linha de metrô, sala após sala), bem diferente da grade em 3 bandas
// já reaproveitada por Arsenal/Vigilância/Nexo. Só 3 desvios laterais saem
// da linha principal: um livre (Bagageiro), um livre com o Console de
// Desvio, e um OBRIGATÓRIO (Sala de Sinalização) — derrotar o Guardião lá
// dentro é o que abre o Portão dos Trilhos, sem puzzle nem cartão desta vez.
const WIDTH = 106;
const HEIGHT = 28;

function carveRect(grid, x1, y1, x2, y2) {
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      grid[y][x] = '.';
    }
  }
}

export function buildFantasmaWing() {
  const grid = Array.from({ length: HEIGHT }, () => Array(WIDTH).fill('#'));

  const rooms = {
    entrada: { x1: 1, y1: 9, x2: 8, y2: 17, name: 'Entrada da Estação' },
    bilheteria: { x1: 15, y1: 9, x2: 22, y2: 17, name: 'Bilheteria Abandonada' },
    plataformaNorte: { x1: 29, y1: 9, x2: 36, y2: 17, name: 'Plataforma Norte' },
    manutencao: { x1: 43, y1: 9, x2: 50, y2: 17, name: 'Corredor de Manutenção' },
    plataformaSul: { x1: 57, y1: 9, x2: 64, y2: 17, name: 'Plataforma Sul' },
    portaoTrilhos: { x1: 71, y1: 9, x2: 78, y2: 17, name: 'Portão dos Trilhos' },
    camaraTrilhos: { x1: 85, y1: 3, x2: 104, y2: 23, name: 'Câmara dos Trilhos' },
    bagageiro: { x1: 28, y1: 21, x2: 37, y2: 27, name: 'Bagageiro' },
    salaControle: { x1: 42, y1: 21, x2: 51, y2: 27, name: 'Sala de Controle' },
    salaSinalizacao: { x1: 55, y1: 1, x2: 66, y2: 6, name: 'Sala de Sinalização' }
  };

  for (const room of Object.values(rooms)) {
    carveRect(grid, room.x1, room.y1, room.x2, room.y2);
  }

  // Linha principal — corredores retos entre uma estação e a próxima, sem
  // ramificação nenhuma na banda central (é isso que faz ler como uma
  // LINHA, não uma grade de salas interligadas em várias direções).
  carveRect(grid, 9, 12, 14, 14); // entrada -> bilheteria
  carveRect(grid, 23, 12, 28, 14); // bilheteria -> plataforma norte
  carveRect(grid, 37, 12, 42, 14); // plataforma norte -> manutenção
  carveRect(grid, 51, 12, 56, 14); // manutenção -> plataforma sul
  // Este trecho é 1 célula de largura de propósito (os outros são 3) — é o
  // único jeito de um ÚNICO tile selado realmente fechar a passagem, em vez
  // de só bloquear uma célula no meio de um corredor largo (o jogador
  // andaria por qualquer lado). Lê também como um portão/gargalo de verdade.
  carveRect(grid, 65, 13, 70, 13); // plataforma sul -> portão dos trilhos (será selado)
  carveRect(grid, 79, 12, 84, 14); // portão dos trilhos -> câmara dos trilhos

  // Desvios laterais — cada um só liga a UMA estação da linha, nunca a duas
  // (não formam atalho entre estações, só um bolso de ida-e-volta).
  carveRect(grid, 32, 18, 34, 20); // plataforma norte -> bagageiro (desvio livre)
  carveRect(grid, 46, 18, 48, 20); // manutenção -> sala de controle (desvio livre)
  carveRect(grid, 59, 6, 61, 8); // sala de sinalização -> plataforma sul (desvio obrigatório)

  // O Portão dos Trilhos começa selado — só reabre quando o Guardião da
  // Sinalização for derrotado (ver FantasmaScene._checkGuardianGate). Nada
  // de puzzle nem cartão nesta fase — resolver a sala É a chave.
  grid[13][67] = '#';

  const markers = {
    S: [{ gx: 4, gy: 13 }],
    // Moradores dos Túneis — 2 por estação da linha principal.
    X: [
      { gx: 3, gy: 10 }, { gx: 6, gy: 16 }, // entrada
      { gx: 17, gy: 10 }, { gx: 20, gy: 16 }, // bilheteria
      { gx: 31, gy: 10 }, { gx: 34, gy: 16 }, // plataforma norte
      { gx: 45, gy: 16 }, // manutenção
      { gx: 59, gy: 10 }, { gx: 62, gy: 16 }, // plataforma sul
      { gx: 73, gy: 11 }, { gx: 76, gy: 15 }, // portão dos trilhos
      { gx: 88, gy: 6 }, { gx: 100, gy: 6 }, { gx: 88, gy: 20 }, { gx: 100, gy: 20 } // câmara dos trilhos
    ],
    // Moradores mais fortes — reaproveita a silhueta "enemy_tank".
    T: [
      { gx: 44, gy: 10 }, // manutenção
      { gx: 63, gy: 16 } // plataforma sul
    ],
    N: [
      { gx: 18, gy: 13 }, // bilheteria — refém 1
      { gx: 49, gy: 13 } // manutenção — refém 2
    ],
    I: [{ gx: 32, gy: 24 }], // bagageiro — lâmina
    C: [{ gx: 17, gy: 14 }], // bilheteria — pistola
    A: [{ gx: 63, gy: 4 }], // sala de sinalização — armadura (recompensa do desvio obrigatório)
    P: [{ gx: 7, gy: 10 }], // entrada — Botas de Impulso
    H: [{ gx: 5, gy: 15 }, { gx: 44, gy: 15 }, { gx: 90, gy: 10 }], // kits médicos
    B: [{ gx: 95, gy: 13 }], // câmara dos trilhos — confronto final (O Trem Fantasma)
    // Entrada selada do Portão dos Trilhos — mesma célula de grid[13][67].
    L: [{ gx: 67, gy: 13 }],
    // Guardião da Sinalização — derrotá-lo é o que abre o Portão dos
    // Trilhos (sem cartão, sem puzzle).
    M: [{ gx: 58, gy: 4 }],
    // Console de Desvio — sem cadeado: quem chegar no desvio já pode usar.
    // Desativa a fase fantasma de O Trem Fantasma pro resto do confronto.
    V: [{ gx: 46, gy: 24 }]
  };

  const zones = [
    { name: rooms.entrada.name, x1: 0, y1: 0, x2: 15, y2: HEIGHT },
    { name: rooms.bilheteria.name, x1: 15, y1: 0, x2: 29, y2: HEIGHT },
    { name: rooms.plataformaNorte.name, x1: 29, y1: 0, x2: 38, y2: 18 },
    { name: rooms.bagageiro.name, x1: 27, y1: 18, x2: 39, y2: HEIGHT },
    { name: rooms.manutencao.name, x1: 38, y1: 0, x2: 52, y2: 18 },
    { name: rooms.salaControle.name, x1: 41, y1: 18, x2: 53, y2: HEIGHT },
    { name: rooms.plataformaSul.name, x1: 52, y1: 9, x2: 66, y2: HEIGHT },
    { name: rooms.salaSinalizacao.name, x1: 52, y1: 0, x2: 68, y2: 9 },
    { name: rooms.portaoTrilhos.name, x1: 66, y1: 0, x2: 80, y2: HEIGHT },
    { name: rooms.camaraTrilhos.name, x1: 80, y1: 0, x2: WIDTH, y2: HEIGHT }
  ];

  return { grid, markers, zones, width: WIDTH, height: HEIGHT };
}
