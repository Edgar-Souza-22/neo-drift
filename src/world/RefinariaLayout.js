// Construção programática da Refinaria Offshore (Fase 14, 2ª fase do
// Estaleiro Automatizado) — topologia em GRADE 3x3: oito plataformas menores
// nas bordas de um quadrado 3x3, ligadas em ANEL (as 8 vão uma na outra,
// fechando um circuito — não um beco sem saída) mais 4 "raios" que saem das
// plataformas cardeais (N/S/L/O) direto pro Núcleo, no meio. Distinta de toda
// topologia anterior (anel do Servidor, grade do Terminal, hive da Colônia) —
// aqui o circuito É a estrutura, não um atalho por cima de um traçado linear.
//
//        NW ─── N ─── NE
//        │             │
//        W    NÚCLEO    E
//        │             │
//        SW ─── S ─── SE
//
// O grid inteiro nasce ANDÁVEL ('.'); o que separa plataforma de mar é o
// hazard 'water' (ver TileMap.isWater), não parede. Água NÃO bloqueia
// movimento (Player.canOccupy trata como piso normal) — só dispara a queda
// quando o jogador pisa nela de verdade (RefinariaScene._updateFall),
// então dá pra ANDAR pra dentro de um buraco já aberto, não só cair quando
// ele abre embaixo do pé. Cada ponte é uma faixa de células de água que a
// cena alterna pra "seca" — aleatoriamente durante a travessia — exceto os
// 4 raios do Núcleo, que O Guincheiro trava sólidos pra sempre ao cair.

const WIDTH = 46;
const HEIGHT = 46;
const P = 10; // lado de cada plataforma

export function buildRefinariaYard() {
  const grid = Array.from({ length: HEIGHT }, () => Array(WIDTH).fill('.'));

  const rooms = {
    nw: { x1: 2, y1: 2, name: 'Cais de Chegada' },
    n: { x1: 18, y1: 2, name: 'Plataforma de Bombeamento' },
    ne: { x1: 34, y1: 2, name: 'Torre de Resfriamento' },
    w: { x1: 2, y1: 18, name: 'Doca de Reparo' },
    center: { x1: 18, y1: 18, name: 'Plataforma do Núcleo' },
    e: { x1: 34, y1: 18, name: 'Convés de Armazenamento' },
    sw: { x1: 2, y1: 34, name: 'Pátio de Tanques' },
    s: { x1: 18, y1: 34, name: 'Console Estabilizador' },
    se: { x1: 34, y1: 34, name: 'Casa de Máquinas' }
  };
  for (const key of Object.keys(rooms)) {
    rooms[key].x2 = rooms[key].x1 + (P - 1);
    rooms[key].y2 = rooms[key].y1 + (P - 1);
  }

  // Anel (8 pontes, sempre arriscadas — desmoronam e voltam sozinhas) + UM
  // único raio pro Núcleo, a partir do Console Estabilizador. Esse raio é o
  // ÚNICO acesso ao chefe (ver RefinariaScene._buildBridges) e nasce
  // INCOMPLETO — sem prancha nenhuma, intransponível — até O Guincheiro
  // cair; aí sim a cena constrói a ponte (RefinariaScene._completeGateBridge),
  // travada sólida pro resto da fase.
  const bridgeSpans = [
    { id: 'ring_nw_n', x1: 12, x2: 17, y1: 6, y2: 7, final: false },
    { id: 'ring_n_ne', x1: 28, x2: 33, y1: 6, y2: 7, final: false },
    { id: 'ring_ne_e', x1: 38, x2: 39, y1: 12, y2: 17, final: false },
    { id: 'ring_e_se', x1: 38, x2: 39, y1: 28, y2: 33, final: false },
    { id: 'ring_se_s', x1: 28, x2: 33, y1: 38, y2: 39, final: false },
    { id: 'ring_s_sw', x1: 12, x2: 17, y1: 38, y2: 39, final: false },
    { id: 'ring_sw_w', x1: 6, x2: 7, y1: 28, y2: 33, final: false },
    { id: 'ring_w_nw', x1: 6, x2: 7, y1: 12, y2: 17, final: false },
    { id: 'gate_s', x1: 22, x2: 23, y1: 28, y2: 33, final: true }
  ];

  const bridges = bridgeSpans.map((b) => {
    const cells = [];
    for (let gx = b.x1; gx <= b.x2; gx++) {
      for (let gy = b.y1; gy <= b.y2; gy++) cells.push({ gx, gy });
    }
    return { id: b.id, final: b.final, cells };
  });

  // Só o INTERIOR das plataformas nasce sem hazard — toda ponte conta como
  // água na construção (piso 'floor_water' já desenhado por baixo, sempre
  // presente pra quando a prancha some); mar aberto fica hazard pra sempre.
  const safe = new Set();
  for (const room of Object.values(rooms)) {
    for (let gy = room.y1; gy <= room.y2; gy++) {
      for (let gx = room.x1; gx <= room.x2; gx++) safe.add(`${gx},${gy}`);
    }
  }

  const hazardTiles = [];
  for (let gy = 0; gy < HEIGHT; gy++) {
    for (let gx = 0; gx < WIDTH; gx++) {
      if (!safe.has(`${gx},${gy}`)) hazardTiles.push({ gx, gy, kind: 'water' });
    }
  }

  const markers = {
    S: [{ gx: rooms.nw.x1 + 4, gy: rooms.nw.y1 + 4 }],
    // Lâmina — Plataforma de Bombeamento.
    I: [{ gx: rooms.n.x1 + 4, gy: rooms.n.y1 + 3 }],
    // Armadura — Convés de Armazenamento.
    A: [{ gx: rooms.e.x1 + 5, gy: rooms.e.y1 + 4 }],
    // Pistola — junto d'O Guincheiro, no Console Estabilizador.
    C: [{ gx: rooms.s.x1 + 4, gy: rooms.s.y1 + 7 }],
    H: [
      { gx: rooms.w.x1 + 4, gy: rooms.w.y1 + 4 },
      { gx: rooms.se.x1 + 5, gy: rooms.se.y1 + 5 }
    ],
    N: [
      { gx: rooms.ne.x1 + 4, gy: rooms.ne.y1 + 3 },
      { gx: rooms.sw.x1 + 4, gy: rooms.sw.y1 + 4 }
    ],
    // Inimigos comuns (Enemy base, reskin da fase).
    X: [
      { gx: rooms.n.x1 + 2, gy: rooms.n.y1 + 7 }, { gx: rooms.n.x1 + 7, gy: rooms.n.y1 + 3 },
      { gx: rooms.ne.x1 + 2, gy: rooms.ne.y1 + 6 }, { gx: rooms.ne.x1 + 7, gy: rooms.ne.y1 + 6 },
      { gx: rooms.e.x1 + 2, gy: rooms.e.y1 + 3 }, { gx: rooms.e.x1 + 7, gy: rooms.e.y1 + 7 },
      { gx: rooms.se.x1 + 2, gy: rooms.se.y1 + 2 }, { gx: rooms.se.x1 + 7, gy: rooms.se.y1 + 2 }, { gx: rooms.se.x1 + 4, gy: rooms.se.y1 + 7 },
      { gx: rooms.s.x1 + 2, gy: rooms.s.y1 + 2 }, { gx: rooms.s.x1 + 7, gy: rooms.s.y1 + 2 },
      { gx: rooms.sw.x1 + 2, gy: rooms.sw.y1 + 7 }, { gx: rooms.sw.x1 + 7, gy: rooms.sw.y1 + 7 },
      { gx: rooms.w.x1 + 2, gy: rooms.w.y1 + 7 }, { gx: rooms.w.x1 + 7, gy: rooms.w.y1 + 2 }
    ],
    // Operários de Convés — inimigos grandes que empurram (PusherEnemy).
    PU: [
      { gx: rooms.n.x1 + 5, gy: rooms.n.y1 + 6 },
      { gx: rooms.ne.x1 + 5, gy: rooms.ne.y1 + 3 },
      { gx: rooms.e.x1 + 4, gy: rooms.e.y1 + 7 },
      { gx: rooms.se.x1 + 2, gy: rooms.se.y1 + 7 }, { gx: rooms.se.x1 + 7, gy: rooms.se.y1 + 4 },
      { gx: rooms.s.x1 + 5, gy: rooms.s.y1 + 6 },
      { gx: rooms.sw.x1 + 4, gy: rooms.sw.y1 + 2 },
      { gx: rooms.w.x1 + 5, gy: rooms.w.y1 + 6 }
    ],
    // O Guincheiro (sub-confronto) — guarda o Console Estabilizador.
    M: [{ gx: rooms.s.x1 + 4, gy: rooms.s.y1 + 4 }],
    // A Perfuratriz (confronto final) — Plataforma do Núcleo.
    B: [{ gx: rooms.center.x1 + 4, gy: rooms.center.y1 + 4 }]
  };

  const zones = Object.values(rooms).map((r) => ({
    name: r.name, x1: r.x1, y1: r.y1, x2: r.x2 + 1, y2: r.y2 + 1
  }));

  return { grid, markers, zones, bridges, hazardTiles, rooms, width: WIDTH, height: HEIGHT };
}
