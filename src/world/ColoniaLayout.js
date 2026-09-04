// Construção programática da Colônia de Contaminados (Fase 11, 3ª fase do
// Submundo) — topologia em HIVE: um Átrio central com TRÊS ALAS (oeste
// contaminada, leste médica, sul o ninho). Não é a grade em 3 bandas do
// Distrito Neon, nem o traçado linear da Estação Fantasma, nem o loop +
// duas alas convergentes do Mercado Negro.
//
// Ala oeste: loop tóxico + armadilha + puzzle de Filtros, que libera a
// Câmara do Hospedeiro. Ala leste: caminho mais limpo até o Traje de
// Quarentena, depois puzzle de Isolamento que libera a pistola. Ala sul:
// o Ninho só abre quando os DOIS puzzles tiverem sido resolvidos.
const WIDTH = 63;
const HEIGHT = 58;

function carveRect(grid, x1, y1, x2, y2) {
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      grid[y][x] = '.';
    }
  }
}

function roomAt(col, row) {
  const x1 = 1 + col * 13;
  const y1 = 1 + row * 12;
  return { x1, y1, x2: x1 + 8, y2: y1 + 7 };
}

function hLink(grid, a, b) {
  const y = a.y1 + 4;
  const x1 = Math.min(a.x2, b.x2);
  const x2 = Math.max(a.x1, b.x1);
  carveRect(grid, x1, y, x2, y);
}

function vLink(grid, a, b) {
  const x = a.x1 + 4;
  const y1 = Math.min(a.y2, b.y2);
  const y2 = Math.max(a.y1, b.y1);
  carveRect(grid, x, y1, x, y2);
}

// Xadrez tóxico — dá pra desviar, igual ao piso eletrificado da Ala do Reator.
function stainChecker(list, x1, y1, x2, y2) {
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      if ((x + y) % 2 === 0) list.push({ gx: x, gy: y, kind: 'toxic' });
    }
  }
}

export function buildColoniaWing() {
  const grid = Array.from({ length: HEIGHT }, () => Array(WIDTH).fill('#'));

  const rooms = {
    incubacao: { ...roomAt(0, 0), name: 'Câmara de Incubação' },
    leitos: { ...roomAt(1, 0), name: 'Ala de Leitos' },
    portao: { ...roomAt(2, 0), name: 'Portão de Quarentena' },
    recepcao: { ...roomAt(3, 0), name: 'Corredor de Recepção' },
    triagem: { ...roomAt(4, 0), name: 'Sala de Triagem' },
    viveiro: { ...roomAt(0, 1), name: 'Viveiro Contaminado' },
    filtros: { ...roomAt(1, 1), name: 'Sala de Filtros' },
    atrio: { ...roomAt(2, 1), name: 'Átrio da Colônia' },
    enfermaria: { ...roomAt(3, 1), name: 'Enfermaria Abandonada' },
    lab: { ...roomAt(4, 1), name: 'Laboratório de Amostras' },
    drenagem: { ...roomAt(0, 2), name: 'Corredor de Drenagem' },
    arsenal: { ...roomAt(1, 2), name: 'Arsenal de Contenção' },
    corredor: { ...roomAt(2, 2), name: 'Corredor Central' },
    descont: { ...roomAt(3, 2), name: 'Sala de Isolamento' },
    antidotos: { ...roomAt(4, 2), name: 'Depósito de Antídotos' },
    hospedeiro: { ...roomAt(1, 3), name: 'Câmara do Hospedeiro' },
    vestibulo: { ...roomAt(2, 3), name: 'Vestíbulo do Ninho' },
    extracao: { ...roomAt(3, 3), name: 'Estação de Extração' },
    observatorio: { ...roomAt(4, 3), name: 'Observatório Biológico' },
    galeria: { ...roomAt(1, 4), name: 'Galeria das Cápsulas' },
    ninho: { ...roomAt(2, 4), name: 'Ninho Primordial' },
    arquivo: { ...roomAt(3, 4), name: 'Arquivo Médico' },
    patio: { ...roomAt(4, 4), name: 'Pátio de Descarte' }
  };

  for (const room of Object.values(rooms)) {
    carveRect(grid, room.x1, room.y1, room.x2, room.y2);
  }

  // Entrada: Portão abre pro Átrio e pra ala leste (recepção/triagem).
  vLink(grid, rooms.portao, rooms.atrio);
  hLink(grid, rooms.portao, rooms.recepcao);
  hLink(grid, rooms.recepcao, rooms.triagem);
  vLink(grid, rooms.recepcao, rooms.enfermaria);
  vLink(grid, rooms.triagem, rooms.lab);

  // Ala oeste — loop contaminado em torno dos Filtros, fechando no Arsenal.
  hLink(grid, rooms.atrio, rooms.filtros);
  vLink(grid, rooms.leitos, rooms.filtros);
  hLink(grid, rooms.incubacao, rooms.leitos);
  vLink(grid, rooms.incubacao, rooms.viveiro);
  vLink(grid, rooms.viveiro, rooms.drenagem);
  hLink(grid, rooms.drenagem, rooms.arsenal);
  vLink(grid, rooms.filtros, rooms.arsenal);
  vLink(grid, rooms.arsenal, rooms.hospedeiro);
  vLink(grid, rooms.hospedeiro, rooms.galeria);

  // Ala leste — caminho médico até o traje, depois Isolamento/extração.
  hLink(grid, rooms.atrio, rooms.enfermaria);
  hLink(grid, rooms.enfermaria, rooms.lab);
  vLink(grid, rooms.lab, rooms.antidotos);
  vLink(grid, rooms.antidotos, rooms.observatorio);
  vLink(grid, rooms.observatorio, rooms.patio);
  vLink(grid, rooms.enfermaria, rooms.descont);
  vLink(grid, rooms.descont, rooms.extracao);
  vLink(grid, rooms.extracao, rooms.arquivo);
  hLink(grid, rooms.observatorio, rooms.extracao);

  // Ala sul — Corredor Central desce do Átrio ao Vestíbulo; o Ninho fica
  // atrás da última porta. A Câmara do Hospedeiro também desemboca no
  // Vestíbulo (abre quando O Enfermeiro cai).
  vLink(grid, rooms.atrio, rooms.corredor);
  vLink(grid, rooms.corredor, rooms.vestibulo);
  vLink(grid, rooms.vestibulo, rooms.ninho);
  hLink(grid, rooms.hospedeiro, rooms.vestibulo);
  hLink(grid, rooms.galeria, rooms.ninho);
  hLink(grid, rooms.ninho, rooms.arquivo);
  hLink(grid, rooms.arquivo, rooms.patio);

  // Portas seladas: célula única do corredor virando parede, mesma técnica
  // do Mercado Negro / Estação Fantasma.
  grid[34][18] = '#'; // Arsenal → Câmara do Hospedeiro (gate 1, pós-Filtros)
  grid[34][44] = '#'; // Isolamento → Estação de Extração (gate 2, pós-pares)
  grid[46][31] = '#'; // Vestíbulo → Ninho (gate 3, os dois puzzles)
  grid[41][23] = '#'; // Hospedeiro → Vestíbulo (gate 4, O Enfermeiro cai)

  const hazardTiles = [];
  stainChecker(hazardTiles, rooms.incubacao.x1, rooms.incubacao.y1, rooms.incubacao.x2, rooms.incubacao.y2);
  stainChecker(hazardTiles, rooms.viveiro.x1, rooms.viveiro.y1, rooms.viveiro.x2, rooms.viveiro.y2);
  stainChecker(hazardTiles, rooms.patio.x1, rooms.patio.y1, rooms.patio.x2, rooms.patio.y2);
  // Ninho: xadrez só na borda — o miolo da arena fica limpo pra o confronto.
  stainChecker(hazardTiles, rooms.ninho.x1, rooms.ninho.y1, rooms.ninho.x2, rooms.ninho.y1 + 1);
  stainChecker(hazardTiles, rooms.ninho.x1, rooms.ninho.y2 - 1, rooms.ninho.x2, rooms.ninho.y2);
  stainChecker(hazardTiles, rooms.ninho.x1, rooms.ninho.y1, rooms.ninho.x1 + 1, rooms.ninho.y2);
  stainChecker(hazardTiles, rooms.ninho.x2 - 1, rooms.ninho.y1, rooms.ninho.x2, rooms.ninho.y2);

  const markers = {
    S: [{ gx: 31, gy: 4 }],
    X: [
      { gx: 16, gy: 3 }, { gx: 20, gy: 6 }, // Ala de Leitos
      { gx: 4, gy: 3 }, { gx: 7, gy: 6 }, // Incubação
      { gx: 43, gy: 3 }, { gx: 46, gy: 6 }, // Recepção
      { gx: 55, gy: 5 }, // Triagem
      { gx: 4, gy: 15 }, { gx: 7, gy: 18 }, // Viveiro
      { gx: 43, gy: 15 }, { gx: 46, gy: 18 }, // Enfermaria
      { gx: 55, gy: 15 }, { gx: 58, gy: 18 }, // Laboratório
      { gx: 3, gy: 27 }, { gx: 7, gy: 30 }, // Drenagem
      { gx: 16, gy: 27 }, // Arsenal
      { gx: 31, gy: 27 }, { gx: 33, gy: 30 }, // Corredor Central
      { gx: 55, gy: 27 }, // Antídotos
      { gx: 16, gy: 39 }, // Câmara do Hospedeiro (antes do confronto)
      { gx: 31, gy: 39 }, { gx: 33, gy: 42 }, // Vestíbulo
      { gx: 55, gy: 39 }, { gx: 58, gy: 42 }, // Observatório
      { gx: 16, gy: 51 }, // Galeria
      { gx: 44, gy: 51 }, // Arquivo
      { gx: 55, gy: 51 }, { gx: 58, gy: 54 } // Pátio
    ],
    T: [
      { gx: 6, gy: 16 }, // Viveiro
      { gx: 57, gy: 16 }, // Laboratório
      { gx: 31, gy: 30 }, // Corredor Central
      { gx: 57, gy: 52 } // Pátio
    ],
    N: [
      { gx: 20, gy: 52 }, // Galeria das Cápsulas
      { gx: 42, gy: 52 } // Arquivo Médico
    ],
    I: [{ gx: 20, gy: 27 }], // Arsenal — lâmina
    A: [{ gx: 57, gy: 27 }], // Antídotos — traje (imunidade tóxica)
    C: [{ gx: 44, gy: 40 }], // Extração — pistola
    H: [{ gx: 31, gy: 18 }, { gx: 57, gy: 6 }, { gx: 20, gy: 39 }],
    // Sala de Filtros — 4 tambores em linha (puzzle de rotação mod-3).
    Q: [{ gx: 15, gy: 16 }, { gx: 17, gy: 16 }, { gx: 19, gy: 16 }, { gx: 21, gy: 16 }],
    // Sala de Isolamento — 6 placas em 2×3 (pares de quarentena).
    K: [
      { gx: 42, gy: 27 }, { gx: 44, gy: 27 }, { gx: 46, gy: 27 },
      { gx: 42, gy: 30 }, { gx: 44, gy: 30 }, { gx: 46, gy: 30 }
    ],
    D: [
      { gx: 5, gy: 26, phase: 0 },
      { gx: 5, gy: 29, phase: 1 },
      { gx: 5, gy: 31, phase: 2 }
    ],
    M: [{ gx: 18, gy: 40 }],
    B: [{ gx: 31, gy: 52 }],
    L1: [{ gx: 18, gy: 34 }],
    L2: [{ gx: 44, gy: 34 }],
    L3: [{ gx: 31, gy: 46 }],
    L4: [{ gx: 23, gy: 41 }]
  };

  const zones = [
    { name: rooms.incubacao.name, x1: 0, y1: 0, x2: 12, y2: 11 },
    { name: rooms.leitos.name, x1: 12, y1: 0, x2: 25, y2: 11 },
    { name: rooms.portao.name, x1: 25, y1: 0, x2: 38, y2: 11 },
    { name: rooms.recepcao.name, x1: 38, y1: 0, x2: 51, y2: 11 },
    { name: rooms.triagem.name, x1: 51, y1: 0, x2: WIDTH, y2: 11 },
    { name: rooms.viveiro.name, x1: 0, y1: 11, x2: 12, y2: 23 },
    { name: rooms.filtros.name, x1: 12, y1: 11, x2: 25, y2: 23 },
    { name: rooms.atrio.name, x1: 25, y1: 11, x2: 38, y2: 23 },
    { name: rooms.enfermaria.name, x1: 38, y1: 11, x2: 51, y2: 23 },
    { name: rooms.lab.name, x1: 51, y1: 11, x2: WIDTH, y2: 23 },
    { name: rooms.drenagem.name, x1: 0, y1: 23, x2: 12, y2: 35 },
    { name: rooms.arsenal.name, x1: 12, y1: 23, x2: 25, y2: 35 },
    { name: rooms.corredor.name, x1: 25, y1: 23, x2: 38, y2: 35 },
    { name: rooms.descont.name, x1: 38, y1: 23, x2: 51, y2: 35 },
    { name: rooms.antidotos.name, x1: 51, y1: 23, x2: WIDTH, y2: 35 },
    { name: rooms.hospedeiro.name, x1: 0, y1: 35, x2: 25, y2: 47 },
    { name: rooms.vestibulo.name, x1: 25, y1: 35, x2: 38, y2: 47 },
    { name: rooms.extracao.name, x1: 38, y1: 35, x2: 51, y2: 47 },
    { name: rooms.observatorio.name, x1: 51, y1: 35, x2: WIDTH, y2: 47 },
    { name: rooms.galeria.name, x1: 0, y1: 47, x2: 25, y2: HEIGHT },
    { name: rooms.ninho.name, x1: 25, y1: 47, x2: 38, y2: HEIGHT },
    { name: rooms.arquivo.name, x1: 38, y1: 47, x2: 51, y2: HEIGHT },
    { name: rooms.patio.name, x1: 51, y1: 47, x2: WIDTH, y2: HEIGHT }
  ];

  return { grid, markers, zones, hazardTiles, width: WIDTH, height: HEIGHT };
}
