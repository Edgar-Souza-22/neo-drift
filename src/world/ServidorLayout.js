// Construção programática do Servidor Oculto (Fase 12, fecha o Submundo) —
// topologia em ANEL CONCÊNTRICO + 4 RAIOS: o Átrio é o miolo caminhável, o
// Núcleo fica selado no sul, e as duas alas externas (fria a oeste, quente
// a leste) circulam o perímetro. Distinto da hive da Colônia, do loop do
// Mercado e do traçado linear da Estação Fantasma.
//
// Raio oeste: Sala de Cabeamento (puzzle de cabos) abre o Anel Oeste
// (lâmina + Câmara do Sysadmin). Raio leste: Sala de Barramento (plugues
// coloridos — troca vizinhos até bater com o alvo) abre o Anel Leste
// (blindagem + pistola). O Núcleo só abre
// quando os DOIS puzzles tiverem sido resolvidos. O Sysadmin controla um
// atalho pro Vestíbulo, não a entrada do Núcleo.

const WIDTH = 66;
const HEIGHT = 50;

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

export function buildServidorWing() {
  const grid = Array.from({ length: HEIGHT }, () => Array(WIDTH).fill('#'));

  const rooms = {
    fria: { ...roomAt(0, 0), name: 'Corredor Frio' },
    arquivo: { ...roomAt(1, 0), name: 'Arquivo Morto' },
    portao: { ...roomAt(2, 0), name: 'Portão de Acesso' },
    recepcao: { ...roomAt(3, 0), name: 'Recepção Clandestina' },
    quente: { ...roomAt(4, 0), name: 'Corredor Quente' },
    cabos: { ...roomAt(0, 1), name: 'Sala de Cabeamento' },
    corredorW: { ...roomAt(1, 1), name: 'Anel Oeste' },
    atrio: { ...roomAt(2, 1), name: 'Átrio do Servidor' },
    corredorE: { ...roomAt(3, 1), name: 'Anel Leste' },
    racks: { ...roomAt(4, 1), name: 'Sala de Barramento' },
    ups: { ...roomAt(0, 2), name: 'Sala de UPS' },
    sysadmin: { ...roomAt(1, 2), name: 'Câmara do Sysadmin' },
    vestibulo: { ...roomAt(2, 2), name: 'Vestíbulo do Núcleo' },
    backup: { ...roomAt(3, 2), name: 'Sala de Backup' },
    doca: { ...roomAt(4, 2), name: 'Doca de Dados' },
    galeria: { ...roomAt(0, 3), name: 'Galeria de Logs' },
    observatorio: { ...roomAt(1, 3), name: 'Observatório de Tráfego' },
    nucleo: { ...roomAt(2, 3), name: 'Núcleo do Servidor' },
    raid: { ...roomAt(3, 3), name: 'Array RAID' },
    patio: { ...roomAt(4, 3), name: 'Pátio de LEDs' }
  };

  for (const room of Object.values(rooms)) {
    carveRect(grid, room.x1, room.y1, room.x2, room.y2);
  }

  // Anel norte — Portão no topo, alas fria/quente nas pontas.
  hLink(grid, rooms.fria, rooms.arquivo);
  hLink(grid, rooms.arquivo, rooms.portao);
  hLink(grid, rooms.portao, rooms.recepcao);
  hLink(grid, rooms.recepcao, rooms.quente);

  // Perímetro oeste (corredor frio desce até a galeria).
  vLink(grid, rooms.fria, rooms.cabos);
  vLink(grid, rooms.cabos, rooms.ups);
  vLink(grid, rooms.ups, rooms.galeria);
  hLink(grid, rooms.galeria, rooms.observatorio);

  // Perímetro leste (corredor quente desce até o pátio).
  vLink(grid, rooms.quente, rooms.racks);
  vLink(grid, rooms.racks, rooms.doca);
  vLink(grid, rooms.doca, rooms.patio);

  // Cruz interna — Átrio no centro, raios pras alas e pro Vestíbulo.
  vLink(grid, rooms.portao, rooms.atrio);
  hLink(grid, rooms.cabos, rooms.corredorW);
  hLink(grid, rooms.corredorW, rooms.atrio);
  hLink(grid, rooms.atrio, rooms.corredorE);
  hLink(grid, rooms.corredorE, rooms.racks);
  vLink(grid, rooms.atrio, rooms.vestibulo);
  vLink(grid, rooms.vestibulo, rooms.nucleo);
  vLink(grid, rooms.corredorW, rooms.sysadmin);
  hLink(grid, rooms.sysadmin, rooms.vestibulo);
  vLink(grid, rooms.corredorE, rooms.backup);
  vLink(grid, rooms.backup, rooms.raid);

  // Portas seladas: célula única do corredor virando parede.
  grid[17][11] = '#'; // Cabeamento → Anel Oeste (gate 1, pós-cabos)
  grid[17][51] = '#'; // Barramento → Anel Leste (gate 2, pós-barramento)
  grid[34][31] = '#'; // Vestíbulo → Núcleo (gate 3, os dois puzzles)
  grid[29][24] = '#'; // Sysadmin → Vestíbulo (gate 4, O Sysadmin cai)

  const markers = {
    S: [{ gx: 31, gy: 4 }],
    X: [
      { gx: 3, gy: 3 }, { gx: 7, gy: 6 }, // Corredor Frio
      { gx: 16, gy: 3 }, { gx: 20, gy: 6 }, // Arquivo Morto
      { gx: 42, gy: 3 }, { gx: 46, gy: 6 }, // Recepção
      { gx: 55, gy: 3 }, { gx: 58, gy: 6 }, // Corredor Quente
      { gx: 3, gy: 27 }, { gx: 7, gy: 30 }, // UPS
      { gx: 16, gy: 15 }, // Anel Oeste
      { gx: 42, gy: 15 }, { gx: 46, gy: 18 }, // Anel Leste
      { gx: 29, gy: 27 }, { gx: 33, gy: 30 }, // Vestíbulo
      { gx: 42, gy: 27 }, // Backup
      { gx: 55, gy: 27 }, // Doca
      { gx: 3, gy: 39 }, { gx: 7, gy: 42 }, // Galeria
      { gx: 16, gy: 39 }, // Observatório
      { gx: 42, gy: 39 }, { gx: 46, gy: 42 }, // RAID
      { gx: 55, gy: 39 }, { gx: 58, gy: 42 } // Pátio
    ],
    T: [
      { gx: 5, gy: 28 }, // UPS
      { gx: 57, gy: 28 }, // Doca
      { gx: 31, gy: 30 }, // Vestíbulo
      { gx: 57, gy: 40 } // Pátio
    ],
    N: [
      { gx: 20, gy: 5 }, // Arquivo Morto
      { gx: 18, gy: 40 } // Observatório de Tráfego
    ],
    I: [{ gx: 18, gy: 16 }], // Anel Oeste — lâmina
    A: [{ gx: 44, gy: 16 }], // Anel Leste — blindagem
    C: [{ gx: 44, gy: 28 }], // Backup — pistola
    H: [{ gx: 31, gy: 16 }, { gx: 20, gy: 30 }, { gx: 44, gy: 40 }],
    Q: [
      { gx: 4, gy: 14, type: 'elbow', solved: 1 },
      { gx: 5, gy: 14, type: 'straight', solved: 1 },
      { gx: 6, gy: 14, type: 'elbow', solved: 2 },
      { gx: 4, gy: 16, type: 'elbow', solved: 3 },
      { gx: 5, gy: 16, type: 'straight', solved: 0 },
      { gx: 6, gy: 16, type: 'elbow', solved: 0 },
      { gx: 4, gy: 18, type: 'elbow', solved: 0 },
      { gx: 5, gy: 18, type: 'straight', solved: 0 },
      { gx: 6, gy: 18, type: 'elbow', solved: 0 }
    ],
    K: [
      { gx: 54, gy: 14, role: 'target' }, { gx: 55, gy: 14, role: 'target' }, { gx: 56, gy: 14, role: 'target' },
      { gx: 57, gy: 14, role: 'target' }, { gx: 58, gy: 14, role: 'target' },
      { gx: 54, gy: 15, role: 'plug' }, { gx: 55, gy: 15, role: 'plug' }, { gx: 56, gy: 15, role: 'plug' },
      { gx: 57, gy: 15, role: 'plug' }, { gx: 58, gy: 15, role: 'plug' }
    ],
    M: [{ gx: 16, gy: 28 }],
    B: [{ gx: 31, gy: 40 }],
    L1: [{ gx: 11, gy: 17 }],
    L2: [{ gx: 51, gy: 17 }],
    L3: [{ gx: 31, gy: 34 }],
    L4: [{ gx: 24, gy: 29 }]
  };

  const scanlines = [
    { x1: 2, x2: 8, y1: 2, y2: 7, periodMs: 2800, phaseMs: 0 },
    { x1: 54, x2: 60, y1: 2, y2: 7, periodMs: 2800, phaseMs: 1400 }
  ];

  const zones = [
    { name: rooms.fria.name, x1: 0, y1: 0, x2: 12, y2: 11 },
    { name: rooms.arquivo.name, x1: 12, y1: 0, x2: 25, y2: 11 },
    { name: rooms.portao.name, x1: 25, y1: 0, x2: 38, y2: 11 },
    { name: rooms.recepcao.name, x1: 38, y1: 0, x2: 51, y2: 11 },
    { name: rooms.quente.name, x1: 51, y1: 0, x2: WIDTH, y2: 11 },
    { name: rooms.cabos.name, x1: 0, y1: 11, x2: 12, y2: 23 },
    { name: rooms.corredorW.name, x1: 12, y1: 11, x2: 25, y2: 23 },
    { name: rooms.atrio.name, x1: 25, y1: 11, x2: 38, y2: 23 },
    { name: rooms.corredorE.name, x1: 38, y1: 11, x2: 51, y2: 23 },
    { name: rooms.racks.name, x1: 51, y1: 11, x2: WIDTH, y2: 23 },
    { name: rooms.ups.name, x1: 0, y1: 23, x2: 12, y2: 35 },
    { name: rooms.sysadmin.name, x1: 12, y1: 23, x2: 25, y2: 35 },
    { name: rooms.vestibulo.name, x1: 25, y1: 23, x2: 38, y2: 35 },
    { name: rooms.backup.name, x1: 38, y1: 23, x2: 51, y2: 35 },
    { name: rooms.doca.name, x1: 51, y1: 23, x2: WIDTH, y2: 35 },
    { name: rooms.galeria.name, x1: 0, y1: 35, x2: 12, y2: HEIGHT },
    { name: rooms.observatorio.name, x1: 12, y1: 35, x2: 25, y2: HEIGHT },
    { name: rooms.nucleo.name, x1: 25, y1: 35, x2: 38, y2: HEIGHT },
    { name: rooms.raid.name, x1: 38, y1: 35, x2: 51, y2: HEIGHT },
    { name: rooms.patio.name, x1: 51, y1: 35, x2: WIDTH, y2: HEIGHT }
  ];

  return { grid, markers, zones, scanlines, width: WIDTH, height: HEIGHT };
}
