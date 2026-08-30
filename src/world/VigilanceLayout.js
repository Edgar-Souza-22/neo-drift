// Construção programática da Central de Vigilância (Fase 08) — fecha de vez
// o arco do Distrito Neon. Reaproveita a MESMA topologia do ArsenalLayout.js
// (já validada por flood-fill), reskinada: sentinelas estacionárias de
// feixe giratório no lugar das armadilhas cíclicas (o próprio inimigo já É
// o hazard, não precisa de um sistema de armadilha separado), e um puzzle
// novo — Sala de Sinal (memorizar e repetir uma sequência de luzes, não uma
// ordem numerada fixa) — no lugar do quebra-cabeça de terminais.
const WIDTH = 66;
const HEIGHT = 38;

function carveRect(grid, x1, y1, x2, y2) {
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      grid[y][x] = '.';
    }
  }
}

export function buildVigilanceWing() {
  const grid = Array.from({ length: HEIGHT }, () => Array(WIDTH).fill('#'));

  const rooms = {
    entrada: { x1: 1, y1: 1, x2: 8, y2: 9, name: 'Portão da Central' },
    monitores: { x1: 12, y1: 1, x2: 21, y2: 9, name: 'Sala de Monitores' },
    arquivo: { x1: 25, y1: 1, x2: 34, y2: 9, name: 'Arquivo de Transmissão' },
    controle: { x1: 38, y1: 1, x2: 52, y2: 11, name: 'Posto de Controle' },
    override: { x1: 56, y1: 1, x2: 65, y2: 11, name: 'Sala de Override' },
    sinal: { x1: 1, y1: 13, x2: 10, y2: 21, name: 'Sala de Sinal' },
    corredorCameras: { x1: 14, y1: 13, x2: 23, y2: 21, name: 'Corredor de Câmeras' },
    antenas: { x1: 27, y1: 13, x2: 36, y2: 21, name: 'Central de Antenas' },
    observacao: { x1: 40, y1: 13, x2: 52, y2: 21, name: 'Sala de Observação' },
    corredorFinal: { x1: 1, y1: 25, x2: 14, y2: 33, name: 'Corredor de Frequência' },
    transmissao: { x1: 18, y1: 25, x2: 52, y2: 37, name: 'Câmara de Transmissão' }
  };

  for (const room of Object.values(rooms)) {
    carveRect(grid, room.x1, room.y1, room.x2, room.y2);
  }

  // Banda 1 (horizontal).
  carveRect(grid, 9, 5, 11, 5); // entrada -> monitores
  carveRect(grid, 22, 5, 24, 5); // monitores -> arquivo
  carveRect(grid, 35, 5, 37, 5); // arquivo -> controle
  carveRect(grid, 53, 5, 55, 5); // controle -> override (será selado)

  // Banda1 -> banda2 (vertical). O Posto de Controle só é acessível pela banda 1.
  carveRect(grid, 5, 10, 5, 12); // entrada -> sala de sinal
  carveRect(grid, 16, 10, 16, 12); // monitores -> corredor de câmeras
  carveRect(grid, 30, 10, 30, 12); // arquivo -> central de antenas

  // Banda 2 (horizontal).
  carveRect(grid, 11, 17, 13, 17); // sinal -> corredor de câmeras
  carveRect(grid, 24, 17, 26, 17); // corredor de câmeras -> antenas
  carveRect(grid, 37, 17, 39, 17); // antenas -> observação

  // Banda2 -> banda3 (vertical). A câmara final só tem UMA entrada — o
  // corredor de câmeras — e ela começa selada.
  carveRect(grid, 6, 22, 6, 24); // sala de sinal -> corredor de frequência
  carveRect(grid, 18, 22, 18, 24); // corredor de câmeras -> câmara de transmissão (será selado)

  // A entrada da câmara final começa selada — só reabre quando a Sala de
  // Sinal for resolvida (ver VigilanceScene._checkPuzzleGate).
  grid[23][18] = '#';

  // A entrada da Sala de Override também começa selada — só abre com o
  // cartão derrubado pelo Operador de Segurança (ver VigilanceScene._checkOverrideDoor).
  grid[5][54] = '#';

  const markers = {
    S: [{ gx: 3, gy: 4 }],
    // Sentinelas de Varredura (inimigo novo, estacionário, feixe giratório)
    // — nenhuma no Corredor de Câmeras de propósito, elas JÁ são o hazard
    // ali (ver X mais abaixo); aqui são as que patrulham as outras salas.
    X: [
      { gx: 3, gy: 3 }, { gx: 6, gy: 7 }, // entrada
      { gx: 14, gy: 3 }, { gx: 19, gy: 7 }, // monitores
      { gx: 27, gy: 3 }, { gx: 32, gy: 7 }, // arquivo
      { gx: 41, gy: 3 }, { gx: 47, gy: 5 }, // controle
      { gx: 43, gy: 15 }, { gx: 48, gy: 19 }, { gx: 45, gy: 17 }, // observação
      { gx: 4, gy: 27 }, { gx: 11, gy: 31 }, // corredor de frequência
      { gx: 23, gy: 29 }, { gx: 47, gy: 29 }, { gx: 23, gy: 33 }, { gx: 47, gy: 33 } // câmara de transmissão
    ],
    // Sentinelas no próprio Corredor de Câmeras — aqui o feixe giratório é
    // literalmente o desafio da sala, sem outro inimigo comum junto.
    W: [{ gx: 18, gy: 15 }, { gx: 16, gy: 19 }, { gx: 20, gy: 19 }],
    // Guardas de Segurança (ameaça corpo a corpo mais pesada, reaproveita a
    // silhueta "enemy_tank").
    T: [
      { gx: 7, gy: 29 }, // corredor de frequência
      { gx: 50, gy: 17 } // observação
    ],
    N: [
      { gx: 44, gy: 19 }, // observação — refém 1
      { gx: 46, gy: 7 } // controle — refém 2
    ],
    I: [{ gx: 17, gy: 3 }], // monitores — lâmina
    C: [{ gx: 30, gy: 3 }], // arquivo — pistola
    A: [{ gx: 45, gy: 5 }], // controle — armadura
    H: [{ gx: 4, gy: 7 }, { gx: 32, gy: 19 }, { gx: 9, gy: 29 }], // kits médicos
    // Sala de Sinal — 4 painéis; a ordem certa é revelada por uma sequência
    // de luzes ao entrar (memória), não por números fixos escritos na placa.
    SG: [{ gx: 4, gy: 15 }, { gx: 7, gy: 15 }, { gx: 4, gy: 19 }, { gx: 7, gy: 19 }],
    B: [{ gx: 34, gy: 31 }], // câmara de transmissão — confronto final (A Emissora)
    L: [{ gx: 18, gy: 23 }], // entrada selada da câmara final
    // Operador de Segurança — guarda o Posto de Controle, derruba o cartão
    // de acesso à Sala de Override.
    M: [{ gx: 49, gy: 8 }],
    // Entrada selada da Sala de Override — só abre com o cartão derrubado.
    J: [{ gx: 54, gy: 5 }],
    // Console de Override — desativa a invocação de sentinelas de A Emissora
    // pro resto do confronto (sabotagem opcional, mesmo espírito do Arsenal).
    V: [{ gx: 60, gy: 6 }]
  };

  const zones = [
    { name: rooms.entrada.name, x1: 0, y1: 0, x2: 10, y2: 12 },
    { name: rooms.monitores.name, x1: 10, y1: 0, x2: 23, y2: 12 },
    { name: rooms.arquivo.name, x1: 23, y1: 0, x2: 36, y2: 12 },
    { name: rooms.controle.name, x1: 36, y1: 0, x2: 53, y2: 12 },
    { name: rooms.override.name, x1: 53, y1: 0, x2: 66, y2: 12 },
    { name: rooms.sinal.name, x1: 0, y1: 12, x2: 12, y2: 24 },
    { name: rooms.corredorCameras.name, x1: 12, y1: 12, x2: 25, y2: 24 },
    { name: rooms.antenas.name, x1: 25, y1: 12, x2: 38, y2: 24 },
    { name: rooms.observacao.name, x1: 38, y1: 12, x2: 66, y2: 24 },
    { name: rooms.corredorFinal.name, x1: 0, y1: 24, x2: 16, y2: 38 },
    { name: rooms.transmissao.name, x1: 16, y1: 24, x2: 66, y2: 38 }
  ];

  return { grid, markers, zones, width: WIDTH, height: HEIGHT };
}
