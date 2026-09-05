// Construção programática do Estaleiro Naval (Fase 15, 3ª fase do
// Estaleiro Automatizado) — topologia em LINHA DE MONTAGEM: oito salas em
// sequência (Entrada → Chassi → Circuitos → Propulsão → Blindagem →
// Armamento → Controle Mestre → Baía de Ativação Final), ligadas por
// corredores-esteira, MAIS 3 desvios laterais que saem da linha principal
// — dois livres (Depósito de Peças, Sala de Testes) e um OBRIGATÓRIO (Sala
// de Override) — no mesmo espírito da Estação Fantasma (Fase 09): cada
// desvio só liga a UMA estação da linha (nunca atalho entre duas), e o
// obrigatório é o que de fato abre a passagem adiante (aqui, um portão
// selado entre Armamento e o Controle Mestre — só reabre quando O
// Inspetor de Qualidade, guardião do desvio, cai).
//
// Cada estação de verdade agora combina as DUAS mecânicas por dentro, não
// só nos corredores: uma faixa de esteira atravessa o meio da sala, com
// braços robóticos flanqueando os dois lados — atravessar empurrado pela
// esteira significa cruzar o alcance dos braços, não só desviar deles
// parado. O combate acontece nos cantos abertos, fora da faixa.

const WIDTH = 158;
const HEIGHT = 26;
const ROOM_Y1 = 2;
const ROOM_Y2 = 11;
const ROOM_W = 14;
const BAND_Y1 = ROOM_Y1 + 4; // faixa de esteira dentro da sala (2 linhas)
const BAND_Y2 = ROOM_Y1 + 5;
const CORR_Y1 = 6;
const CORR_Y2 = 9;
const ANNEX_Y1 = 16;
const ANNEX_Y2 = 23;

function carveRect(grid, x1, y1, x2, y2) {
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) grid[y][x] = '.';
  }
}

export function buildEstaleiroNavalYard() {
  const grid = Array.from({ length: HEIGHT }, () => Array(WIDTH).fill('#'));

  const rooms = {
    entrada: { x1: 2, name: 'Entrada da Linha' },
    chassi: { x1: 22, name: 'Estação de Chassi', station: 'chassi' },
    circuitos: { x1: 42, name: 'Estação de Circuitos', station: 'circuitos' },
    propulsao: { x1: 62, name: 'Estação de Propulsão', station: 'propulsao' },
    blindagem: { x1: 82, name: 'Estação de Blindagem', station: 'blindagem' },
    armamento: { x1: 102, name: 'Estação de Armamento', station: 'armamento' },
    controle: { x1: 122, name: 'Sala de Controle Mestre' },
    baia: { x1: 142, name: 'Baía de Ativação Final' }
  };
  for (const key of Object.keys(rooms)) {
    rooms[key].y1 = ROOM_Y1;
    rooms[key].y2 = ROOM_Y2;
    rooms[key].x2 = rooms[key].x1 + (ROOM_W - 1);
    carveRect(grid, rooms[key].x1, rooms[key].y1, rooms[key].x2, rooms[key].y2);
  }

  const order = ['entrada', 'chassi', 'circuitos', 'propulsao', 'blindagem', 'armamento', 'controle', 'baia'];
  const conveyors = [];
  const addBand = (x1, x2, y1, y2, dx, dy) => {
    carveRect(grid, x1, y1, x2, y2);
    for (let gx = x1; gx <= x2; gx++) {
      for (let gy = y1; gy <= y2; gy++) conveyors.push({ gx, gy, dx, dy });
    }
  };

  // Corredores da linha principal — todos esteira, exceto o portão
  // Armamento -> Controle, que nasce SELADO (ver GATE abaixo).
  for (let i = 0; i < order.length - 1; i++) {
    const a = rooms[order[i]];
    const b = rooms[order[i + 1]];
    if (order[i] === 'armamento' && order[i + 1] === 'controle') {
      // Portão estreito de 1 tile de altura — só assim um único bloqueio
      // fecha a passagem de verdade (corredor largo o jogador contornaria).
      carveRect(grid, a.x2 + 1, 6, b.x1 - 1, 6);
      continue;
    }
    addBand(a.x2 + 1, b.x1 - 1, CORR_Y1, CORR_Y2, 1, 0);
  }

  // Faixa de esteira dentro de cada estação — atravessa o meio da sala,
  // com braços robóticos flanqueando os dois lados (ver `arms` abaixo).
  // Combate acontece nos cantos abertos, fora da faixa.
  for (const key of ['chassi', 'circuitos', 'propulsao', 'blindagem', 'armamento']) {
    const r = rooms[key];
    for (let gx = r.x1 + 2; gx <= r.x1 + 11; gx++) {
      for (let gy = BAND_Y1; gy <= BAND_Y2; gy++) conveyors.push({ gx, gy, dx: 1, dy: 0 });
    }
  }

  // --- Desvios laterais (anexos) ------------------------------------
  const annexes = {
    deposito: { x1: 42, name: 'Depósito de Peças', parent: 'circuitos' },
    testes: { x1: 82, name: 'Sala de Testes', parent: 'blindagem' },
    override: { x1: 102, name: 'Sala de Override', parent: 'armamento' }
  };
  for (const key of Object.keys(annexes)) {
    annexes[key].y1 = ANNEX_Y1;
    annexes[key].y2 = ANNEX_Y2;
    annexes[key].x2 = annexes[key].x1 + (ROOM_W - 1);
    carveRect(grid, annexes[key].x1, annexes[key].y1, annexes[key].x2, annexes[key].y2);
    const px = annexes[key].x1 + 4;
    carveRect(grid, px, ROOM_Y2 + 1, px + 3, ANNEX_Y1 - 1);
  }

  // Portão selado entre Armamento e o Controle Mestre — só abre quando O
  // Inspetor de Qualidade (Sala de Override) cai (ver
  // EstaleiroNavalScene._handleEnemyDrop). Mesma técnica da Estação
  // Fantasma: um corredor de 1 tile de altura com UMA célula bloqueada.
  const gateGx = Math.round((rooms.armamento.x2 + rooms.controle.x1) / 2);
  grid[6][gateGx] = '#';

  const markers = {
    S: [{ gx: rooms.entrada.x1 + 2, gy: rooms.entrada.y1 + 3 }],
    GATE: [{ gx: gateGx, gy: 6 }],
    // Itens — agora recompensa dos desvios, não das estações de combate
    // puro (mesmo espírito da Estação Fantasma: o desvio É a recompensa).
    I: [{ gx: annexes.deposito.x1 + 6, gy: annexes.deposito.y1 + 3 }],
    C: [{ gx: annexes.testes.x1 + 6, gy: annexes.testes.y1 + 3 }],
    A: [{ gx: annexes.override.x1 + 6, gy: annexes.override.y1 + 3 }],
    H: [
      { gx: annexes.deposito.x1 + 10, gy: annexes.deposito.y1 + 5 },
      { gx: annexes.override.x1 + 10, gy: annexes.override.y1 + 5 }
    ],
    N: [
      { gx: rooms.circuitos.x1 + 6, gy: rooms.circuitos.y1 + 8 },
      { gx: rooms.armamento.x1 + 6, gy: rooms.armamento.y1 + 8 }
    ],
    P: [
      { gx: rooms.chassi.x1 + 12, gy: rooms.chassi.y1 + 5, station: 'chassi' },
      { gx: rooms.circuitos.x1 + 12, gy: rooms.circuitos.y1 + 5, station: 'circuitos' },
      { gx: rooms.propulsao.x1 + 12, gy: rooms.propulsao.y1 + 5, station: 'propulsao' },
      { gx: rooms.blindagem.x1 + 12, gy: rooms.blindagem.y1 + 5, station: 'blindagem' },
      { gx: rooms.armamento.x1 + 12, gy: rooms.armamento.y1 + 5, station: 'armamento' }
    ],
    // Empilhadeiras (Chassi, e uma reforça a Blindagem — station marcado
    // por célula, não por tipo, pra contar certo no painel de cada sala).
    STACKER: [
      { gx: rooms.chassi.x1 + 1, gy: rooms.chassi.y1 + 1, station: 'chassi' },
      { gx: rooms.chassi.x1 + 12, gy: rooms.chassi.y1 + 1, station: 'chassi' },
      { gx: rooms.chassi.x1 + 1, gy: rooms.chassi.y1 + 8, station: 'chassi' },
      { gx: rooms.blindagem.x1 + 1, gy: rooms.blindagem.y1 + 8, station: 'blindagem' }
    ],
    // Sentinela Elétrica + Drone Inibidor (Circuitos, e uma guarda o Depósito).
    ELECTRIC: [
      { gx: rooms.circuitos.x1 + 1, gy: rooms.circuitos.y1 + 1, station: 'circuitos' },
      { gx: rooms.circuitos.x1 + 12, gy: rooms.circuitos.y1 + 1, station: 'circuitos' },
      { gx: annexes.deposito.x1 + 3, gy: annexes.deposito.y1 + 5, station: 'circuitos' }
    ],
    JAMMER: [
      { gx: rooms.circuitos.x1 + 1, gy: rooms.circuitos.y1 + 8, station: 'circuitos' },
      { gx: rooms.circuitos.x1 + 12, gy: rooms.circuitos.y1 + 8, station: 'circuitos' }
    ],
    // Drone de Carga (patrulha a própria faixa da esteira) + Saltador de
    // Fase (Propulsão).
    // Rota de +11 tiles a partir daqui (ver EstaleiroNavalScene) — nasce
    // em x1+2 pra terminar em x1+13, a borda direita da sala, sem sair
    // dos limites da Estação de Propulsão.
    CARGO: [
      { gx: rooms.propulsao.x1 + 2, gy: BAND_Y1, station: 'propulsao' },
      { gx: rooms.propulsao.x1 + 2, gy: BAND_Y2, station: 'propulsao' }
    ],
    PHASEJUMP: [
      { gx: rooms.propulsao.x1 + 1, gy: rooms.propulsao.y1 + 1, station: 'propulsao' },
      { gx: rooms.propulsao.x1 + 12, gy: rooms.propulsao.y1 + 8, station: 'propulsao' }
    ],
    // Sonda Sifão (Blindagem, e uma guarda a Sala de Testes).
    SIPHON: [
      { gx: rooms.blindagem.x1 + 1, gy: rooms.blindagem.y1 + 1, station: 'blindagem' },
      { gx: rooms.blindagem.x1 + 12, gy: rooms.blindagem.y1 + 1, station: 'blindagem' },
      { gx: annexes.testes.x1 + 3, gy: annexes.testes.y1 + 5, station: 'blindagem' }
    ],
    // Drone Atirador + Sentinela de Varredura (Armamento).
    SHOOTER: [
      { gx: rooms.armamento.x1 + 1, gy: rooms.armamento.y1 + 1, station: 'armamento' },
      { gx: rooms.armamento.x1 + 12, gy: rooms.armamento.y1 + 1, station: 'armamento' }
    ],
    SENTRY: [
      { gx: rooms.armamento.x1 + 1, gy: rooms.armamento.y1 + 8, station: 'armamento' },
      { gx: rooms.armamento.x1 + 12, gy: rooms.armamento.y1 + 8, station: 'armamento' }
    ],
    // O Inspetor de Qualidade — guardião do desvio obrigatório (Sala de
    // Override): derrotá-lo abre o portão selado até o Controle Mestre.
    GUARD: [{ gx: annexes.override.x1 + 7, gy: annexes.override.y1 + 6 }],
    // O Supervisor (sub-confronto) — Sala de Controle Mestre.
    M: [{ gx: rooms.controle.x1 + 6, gy: rooms.controle.y1 + 6 }],
    // O Protótipo (confronto final) — Baía de Ativação Final.
    B: [{ gx: rooms.baia.x1 + 6, gy: rooms.baia.y1 + 6 }]
  };

  // Braços robóticos — flanqueiam a faixa de esteira de cada estação (dois
  // pares por sala, um "antes" e um "depois" do meio da faixa), fora de
  // fase entre si. Mais 2 fixos na Baía Final (sem painel — nunca desligam).
  const arms = [];
  for (const key of ['chassi', 'circuitos', 'propulsao', 'blindagem', 'armamento']) {
    const r = rooms[key];
    [[r.x1 + 4, 0], [r.x1 + 9, 700]].forEach(([gx, phase]) => {
      arms.push({ gx, gy: ROOM_Y1 + 2, stationId: r.station, phaseOffsetMs: phase });
      arms.push({ gx, gy: ROOM_Y1 + 7, stationId: r.station, phaseOffsetMs: phase + 1100 });
    });
  }
  arms.push({ gx: rooms.baia.x1 + 3, gy: rooms.baia.y1 + 3, stationId: 'baia', phaseOffsetMs: 0 });
  arms.push({ gx: rooms.baia.x1 + 10, gy: rooms.baia.y1 + 8, stationId: 'baia', phaseOffsetMs: 1200 });

  const zones = [
    ...Object.values(rooms).map((r) => ({ name: r.name, x1: r.x1, y1: r.y1, x2: r.x2 + 1, y2: r.y2 + 1 })),
    ...Object.values(annexes).map((r) => ({ name: r.name, x1: r.x1, y1: r.y1, x2: r.x2 + 1, y2: r.y2 + 1 }))
  ];

  return { grid, markers, zones, conveyors, arms, width: WIDTH, height: HEIGHT };
}
