// Construção programática do Núcleo de Comando (Fase 04) — mesmo estilo do
// ReactorLayout.js. Mecanismo estrutural diferente das fases anteriores:
// em vez de um único cofre trancado por cartão, há 3 Torres de Firewall
// espalhadas pelo mapa (uma por sala), cada uma "hackeada" ao se aproximar.
// A única entrada da Câmara do Núcleo (chefe) começa selada e só abre
// quando as 3 torres tiverem sido hackeadas.

const WIDTH = 54;
const HEIGHT = 38;

function carveRect(grid, x1, y1, x2, y2) {
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      grid[y][x] = '.';
    }
  }
}

export function buildCoreWing() {
  const grid = Array.from({ length: HEIGHT }, () => Array(WIDTH).fill('#'));

  const rooms = {
    entrada: { x1: 1, y1: 1, x2: 8, y2: 9, name: 'Entrada do Núcleo' },
    servidores: { x1: 12, y1: 1, x2: 21, y2: 9, name: 'Sala de Servidores' },
    cameras: { x1: 25, y1: 1, x2: 34, y2: 9, name: 'Central de Câmeras' },
    diagnostico: { x1: 38, y1: 1, x2: 52, y2: 11, name: 'Sala de Diagnóstico' },
    firewallNorte: { x1: 1, y1: 13, x2: 10, y2: 21, name: 'Firewall Norte' },
    corredorManut: { x1: 14, y1: 13, x2: 23, y2: 21, name: 'Corredor de Manutenção' },
    firewallLeste: { x1: 27, y1: 13, x2: 36, y2: 21, name: 'Firewall Leste' },
    contencao: { x1: 40, y1: 13, x2: 52, y2: 21, name: 'Câmara de Contenção Digital' },
    firewallSul: { x1: 1, y1: 25, x2: 14, y2: 33, name: 'Firewall Sul' },
    nucleo: { x1: 18, y1: 25, x2: 52, y2: 37, name: 'Núcleo Central' }
  };

  for (const room of Object.values(rooms)) {
    carveRect(grid, room.x1, room.y1, room.x2, room.y2);
  }

  // Banda 1 (horizontal).
  carveRect(grid, 9, 5, 11, 5); // entrada -> servidores
  carveRect(grid, 22, 5, 24, 5); // servidores -> câmeras
  carveRect(grid, 35, 5, 37, 5); // câmeras -> diagnóstico

  // Banda1 -> banda2 (vertical). Diagnóstico fica só acessível pela banda 1
  // (sem conexão direta com o núcleo).
  carveRect(grid, 5, 10, 5, 12); // entrada -> firewall norte
  carveRect(grid, 16, 10, 16, 12); // servidores -> corredor de manutenção
  carveRect(grid, 30, 10, 30, 12); // câmeras -> firewall leste

  // Banda 2 (horizontal).
  carveRect(grid, 11, 17, 13, 17); // firewall norte -> corredor
  carveRect(grid, 24, 17, 26, 17); // corredor -> firewall leste
  carveRect(grid, 37, 17, 39, 17); // firewall leste -> contenção

  // Banda2 -> banda3 (vertical). O núcleo (chefe) só tem UMA entrada — o
  // corredor de manutenção — e ela começa selada.
  carveRect(grid, 6, 22, 6, 24); // firewall norte -> firewall sul
  carveRect(grid, 18, 22, 18, 24); // corredor de manutenção -> núcleo (será selado)

  // A entrada do núcleo começa selada — só reabre quando as 3 torres de
  // firewall forem hackeadas (ver CoreScene._checkTowers).
  grid[23][18] = '#';

  const markers = {
    S: [{ gx: 3, gy: 4 }],
    X: [
      { gx: 3, gy: 3 }, { gx: 6, gy: 7 }, // entrada
      { gx: 14, gy: 3 }, { gx: 19, gy: 7 }, // servidores
      { gx: 27, gy: 3 }, { gx: 32, gy: 7 }, // câmeras
      { gx: 41, gy: 3 }, { gx: 47, gy: 5 }, { gx: 43, gy: 9 }, // diagnóstico
      { gx: 3, gy: 15 }, { gx: 8, gy: 19 }, // firewall norte
      { gx: 16, gy: 15 }, { gx: 21, gy: 19 }, // corredor de manutenção
      { gx: 29, gy: 15 }, { gx: 34, gy: 19 }, // firewall leste
      { gx: 43, gy: 15 }, { gx: 48, gy: 19 }, // contenção
      { gx: 4, gy: 27 }, { gx: 11, gy: 31 }, // firewall sul
      { gx: 23, gy: 29 }, { gx: 47, gy: 29 }, { gx: 23, gy: 33 }, { gx: 47, gy: 33 } // núcleo
    ],
    T: [
      { gx: 6, gy: 17 }, // firewall norte (guarda a torre)
      { gx: 19, gy: 17 }, // corredor de manutenção
      { gx: 32, gy: 17 }, // firewall leste (guarda a torre)
      { gx: 7, gy: 29 } // firewall sul (guarda a torre)
    ],
    N: [
      { gx: 44, gy: 19 }, // contenção — Analista Presa
      { gx: 46, gy: 7 } // diagnóstico — Técnico de Rede Preso
    ],
    I: [{ gx: 17, gy: 3 }], // servidores — arma
    C: [{ gx: 30, gy: 3 }], // câmeras — upgrade de pistola
    A: [{ gx: 45, gy: 5 }], // diagnóstico — armadura
    H: [{ gx: 4, gy: 7 }, { gx: 30, gy: 19 }, { gx: 9, gy: 29 }], // kits de reparo
    F: [{ gx: 5, gy: 15 }, { gx: 31, gy: 15 }, { gx: 5, gy: 27 }], // torres de firewall
    B: [{ gx: 34, gy: 31 }], // núcleo — chefe
    L: [{ gx: 18, gy: 23 }] // entrada selada da câmara do núcleo
  };

  const zones = [
    { name: rooms.entrada.name, x1: 0, y1: 0, x2: 10, y2: 12 },
    { name: rooms.servidores.name, x1: 10, y1: 0, x2: 23, y2: 12 },
    { name: rooms.cameras.name, x1: 23, y1: 0, x2: 36, y2: 12 },
    { name: rooms.diagnostico.name, x1: 36, y1: 0, x2: 54, y2: 12 },
    { name: rooms.firewallNorte.name, x1: 0, y1: 12, x2: 12, y2: 24 },
    { name: rooms.corredorManut.name, x1: 12, y1: 12, x2: 25, y2: 24 },
    { name: rooms.firewallLeste.name, x1: 25, y1: 12, x2: 38, y2: 24 },
    { name: rooms.contencao.name, x1: 38, y1: 12, x2: 54, y2: 24 },
    { name: rooms.firewallSul.name, x1: 0, y1: 24, x2: 16, y2: 38 },
    { name: rooms.nucleo.name, x1: 16, y1: 24, x2: 54, y2: 38 }
  ];

  return { grid, markers, zones, width: WIDTH, height: HEIGHT };
}
