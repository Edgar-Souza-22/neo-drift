// Construção programática da Torre de Controle Logístico (Fase 16, fecha a
// Região 4 — Estaleiro Automatizado) — topologia em "Y": duas torres
// (Oeste/Leste) sobem em paralelo a partir do Saguão, agora com 5 andares
// cada + a câmara do sub-chefe no topo; derrotar OS DOIS sub-chefes é o que
// libera o Subsolo da Torre (mais abaixo que o Saguão, não mais um braço
// lateral), onde O Regente espera.
//
//        [Op. Mestre]              [Guardiã de Tráfego]
//              │                            │
//         Andar 5 (puzzle)            Andar 5 (puzzle)
//              │                            │
//         Andar 4 (combate)           Andar 4 (combate)
//              │                            │
//         Andar 3 (combate)           Andar 3 (combate)
//              │                            │
//         Andar 2 (combate)           Andar 2 (combate)
//              │                            │
//         Andar 1 (armadilhas)        Andar 1 (esteira+braços)
//              └───────────┐    ┌──────────┘
//                        SAGUÃO (spawn)
//                           │  (selado até os 2 sub-chefes caírem)
//                       SUBSOLO — O Regente
//
// Cada andar sobe de acesso com um CARTÃO que GANHA NÍVEL (não um puzzle
// abrindo a porta direto): limpar o Andar N dá o cartão da torre no nível N
// e abre a porta pro Andar N+1; resolver o puzzle do Andar 5 sobe pro nível
// 5 e abre a porta da câmara do sub-chefe (ver TorreControleScene). Cada
// portão bloqueia a LARGURA INTEIRA do corredor (nunca uma célula só no meio
// de um corredor largo) — é o que de fato impede contornar.

function carveRect(grid, x1, y1, x2, y2) {
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) grid[y][x] = '.';
  }
}

// Corredor vertical de `cx1`-`cx2` de largura entre duas fileiras Y —
// sempre carve a largura inteira, e (se `sealed`) bloqueia a largura
// INTEIRA numa fileira só, não uma célula. `carveRect` já cobre a régua
// completa de colunas, então isso nunca reabre um desvio pela lateral.
function verticalCorridor(grid, cx1, cx2, y1, y2, sealed, gateRowOffset = 0) {
  carveRect(grid, cx1, y1, cx2, y2);
  if (!sealed) return null;
  const gy = y1 + gateRowOffset;
  for (let x = cx1; x <= cx2; x++) grid[gy][x] = '#';
  return { gx: Math.round((cx1 + cx2) / 2), gy, cx1, cx2 };
}

const WIDTH = 70;
const ROOM_W = 12;
const ROOM_H = 10;
const GATE_H = 5;

export function buildTorreControleYard() {
  // Bandas verticais compartilhadas pelas duas torres (só o x muda por
  // lado) — calculadas por cursor pra nunca desalinhar ao adicionar andares.
  let cursorY = 2;
  const band = (h) => {
    const y1 = cursorY;
    const y2 = cursorY + h - 1;
    cursorY = y2 + 1;
    return { y1, y2 };
  };

  const chamberBand = band(ROOM_H);
  const gate5ChamberBand = band(GATE_H);
  const andar5Band = band(ROOM_H);
  const gate45Band = band(GATE_H);
  const andar4Band = band(ROOM_H);
  const gate34Band = band(GATE_H);
  const andar3Band = band(ROOM_H);
  const gate23Band = band(GATE_H);
  const andar2Band = band(ROOM_H);
  const gate12Band = band(GATE_H);
  const andar1Band = band(ROOM_H);
  const freeCorridorBand = band(GATE_H);
  const saguaoBand = band(ROOM_H);
  const gateSubsoloBand = band(6);
  const subsoloBand = band(14);

  const HEIGHT = cursorY;
  const grid = Array.from({ length: HEIGHT }, () => Array(WIDTH).fill('#'));

  const towers = {
    oeste: { x1: 20, cardId: 'torre_oeste_card', cardName: 'Cartão Torre Oeste' },
    leste: { x1: 54, cardId: 'torre_leste_card', cardName: 'Cartão Torre Leste' }
  };
  for (const t of Object.values(towers)) {
    t.x2 = t.x1 + (ROOM_W - 1);
    t.cx1 = t.x1 + 4;
    t.cx2 = t.x1 + 7;
  }

  const rooms = {};
  for (const [side, t] of Object.entries(towers)) {
    const sideLabel = side === 'oeste' ? 'Oeste' : 'Leste';
    rooms[`${side}Chamber`] = {
      x1: t.x1, x2: t.x2, ...chamberBand,
      name: side === 'oeste' ? 'Câmara do Operador Mestre' : 'Câmara da Guardiã de Tráfego'
    };
    rooms[`${side}Andar5`] = { x1: t.x1, x2: t.x2, ...andar5Band, name: `Torre ${sideLabel} — Andar 5` };
    rooms[`${side}Andar4`] = { x1: t.x1, x2: t.x2, ...andar4Band, name: `Torre ${sideLabel} — Andar 4` };
    rooms[`${side}Andar3`] = { x1: t.x1, x2: t.x2, ...andar3Band, name: `Torre ${sideLabel} — Andar 3` };
    rooms[`${side}Andar2`] = { x1: t.x1, x2: t.x2, ...andar2Band, name: `Torre ${sideLabel} — Andar 2` };
    rooms[`${side}Andar1`] = { x1: t.x1, x2: t.x2, ...andar1Band, name: `Torre ${sideLabel} — Andar 1` };
  }
  rooms.saguao = { x1: 18, x2: 67, ...saguaoBand, name: 'Saguão de Acesso' };
  rooms.subsolo = { x1: 28, x2: 57, ...subsoloBand, name: 'Subsolo da Torre' };

  for (const r of Object.values(rooms)) carveRect(grid, r.x1, r.y1, r.x2, r.y2);

  const gates = [];
  for (const [side, t] of Object.entries(towers)) {
    // Andar 1 -> Saguão: sempre livre (é aqui que o cartão nasce, nível 1).
    verticalCorridor(grid, t.cx1, t.cx2, freeCorridorBand.y1, freeCorridorBand.y2, false);
    gates.push({ ...verticalCorridor(grid, t.cx1, t.cx2, gate12Band.y1, gate12Band.y2, true, 2), id: `${side}_1_2`, requireCard: t.cardId, requireLevel: 1 });
    gates.push({ ...verticalCorridor(grid, t.cx1, t.cx2, gate23Band.y1, gate23Band.y2, true, 2), id: `${side}_2_3`, requireCard: t.cardId, requireLevel: 2 });
    gates.push({ ...verticalCorridor(grid, t.cx1, t.cx2, gate34Band.y1, gate34Band.y2, true, 2), id: `${side}_3_4`, requireCard: t.cardId, requireLevel: 3 });
    gates.push({ ...verticalCorridor(grid, t.cx1, t.cx2, gate45Band.y1, gate45Band.y2, true, 2), id: `${side}_4_5`, requireCard: t.cardId, requireLevel: 4 });
    gates.push({ ...verticalCorridor(grid, t.cx1, t.cx2, gate5ChamberBand.y1, gate5ChamberBand.y2, true, 2), id: `${side}_5_chamber`, requireCard: t.cardId, requireLevel: 5 });
  }

  // Saguão -> Subsolo: selado até os DOIS sub-chefes caírem (ver
  // TorreControleScene._updateSubsoloGate) — não é um cartão de nível, é
  // condição de derrota dos dois.
  const subsoloGate = verticalCorridor(grid, 41, 44, gateSubsoloBand.y1, gateSubsoloBand.y2, true, 3);

  // Esteira do Andar 1 da Torre Leste — atravessa o meio da sala, braços
  // dos dois lados (mesma combinação da Fase 15).
  const conveyors = [];
  const la1 = rooms.lesteAndar1;
  for (let gx = la1.x1 + 2; gx <= la1.x1 + 9; gx++) {
    for (let gy = la1.y1 + 4; gy <= la1.y1 + 5; gy++) conveyors.push({ gx, gy, dx: 1, dy: 0 });
  }

  const arms = [
    { gx: la1.x1 + 3, gy: la1.y1 + 2, phaseOffsetMs: 0 },
    { gx: la1.x1 + 8, gy: la1.y1 + 2, phaseOffsetMs: 700 },
    { gx: la1.x1 + 3, gy: la1.y1 + 7, phaseOffsetMs: 1100 },
    { gx: la1.x1 + 8, gy: la1.y1 + 7, phaseOffsetMs: 1800 },
    // Subsolo: 2 braços fixos, sempre ativos.
    { gx: rooms.subsolo.x1 + 3, gy: rooms.subsolo.y1 + 3, phaseOffsetMs: 0 },
    { gx: rooms.subsolo.x2 - 3, gy: rooms.subsolo.y2 - 3, phaseOffsetMs: 1200 }
  ];

  // Corredor de Armadilhas — Andar 1 da Torre Oeste.
  const oa1 = rooms.oesteAndar1;
  const traps = [
    { gx: oa1.x1 + 4, gy: oa1.y1 + 7, phase: 0 },
    { gx: oa1.x1 + 6, gy: oa1.y1 + 3, phase: 1 },
    { gx: oa1.x1 + 8, gy: oa1.y1 + 7, phase: 2 }
  ];

  const oa2 = rooms.oesteAndar2;
  const oa3 = rooms.oesteAndar3;
  const oa4 = rooms.oesteAndar4;
  const oa5 = rooms.oesteAndar5;
  const la2 = rooms.lesteAndar2;
  const la3 = rooms.lesteAndar3;
  const la4 = rooms.lesteAndar4;
  const la5 = rooms.lesteAndar5;

  const markers = {
    S: [{ gx: 42, gy: saguaoBand.y1 + 4 }],
    // Armadura — Saguão, recompensa de chegada sempre acessível.
    A: [{ gx: 20, gy: saguaoBand.y1 + 6 }],
    // Lâmina — Torre Oeste, Andar 2.
    I: [{ gx: oa2.x1 + 9, gy: oa2.y1 + 2 }],
    // Pistola — Torre Leste, Andar 2.
    C: [{ gx: la2.x1 + 9, gy: la2.y1 + 2 }],
    H: [
      { gx: rooms.oesteChamber.x1 + 9, gy: rooms.oesteChamber.y1 + 2 },
      { gx: rooms.lesteChamber.x1 + 1, gy: rooms.lesteChamber.y1 + 2 },
      { gx: oa4.x1 + 9, gy: oa4.y1 + 7 },
      { gx: la4.x1 + 1, gy: la4.y1 + 7 }
    ],
    N: [
      { gx: oa3.x1 + 2, gy: oa3.y1 + 7 },
      { gx: la3.x1 + 9, gy: la3.y1 + 7 }
    ],
    // Placas da Sequência — Torre Oeste, Andar 5 (topo, último andar antes
    // da câmara do sub-chefe).
    Q: [
      { gx: oa5.x1 + 2, gy: oa5.y1 + 4 },
      { gx: oa5.x1 + 4, gy: oa5.y1 + 4 },
      { gx: oa5.x1 + 7, gy: oa5.y1 + 4 },
      { gx: oa5.x1 + 9, gy: oa5.y1 + 4 }
    ],
    // Circuito em cruz — Torre Leste, Andar 5 (topo).
    K: (() => {
      const cx = towers.leste.x1 + 5;
      const cy = la5.y1 + 4;
      return [{ gx: cx, gy: cy }, { gx: cx, gy: cy - 2 }, { gx: cx, gy: cy + 2 }, { gx: cx - 2, gy: cy }, { gx: cx + 2, gy: cy }];
    })(),
    // Empilhadeiras — Torre Oeste Andar 1 (entre as armadilhas) + Andar 2 +
    // 1 elite no Andar 5 (guarda o puzzle final).
    STACKER: [
      { gx: oa1.x1 + 2, gy: oa1.y1 + 2, room: 'oesteAndar1' },
      { gx: oa1.x1 + 9, gy: oa1.y1 + 2, room: 'oesteAndar1' },
      { gx: oa1.x1 + 5, gy: oa1.y1 + 5, room: 'oesteAndar1' },
      { gx: oa4.x1 + 2, gy: oa4.y1 + 2, room: 'oesteAndar4' },
      { gx: oa4.x1 + 9, gy: oa4.y1 + 2, room: 'oesteAndar4', elite: true },
      { gx: oa5.x1 + 9, gy: oa5.y1 + 7, room: 'oesteAndar5', elite: true },
      { gx: la2.x1 + 8, gy: la2.y1 + 6, room: 'lesteAndar2' },
      { gx: la4.x1 + 5, gy: la4.y1 + 2, room: 'lesteAndar4' }
    ],
    JAMMER: [
      { gx: oa2.x1 + 2, gy: oa2.y1 + 2, room: 'oesteAndar2' },
      { gx: oa2.x1 + 9, gy: oa2.y1 + 7, room: 'oesteAndar2' },
      { gx: oa2.x1 + 5, gy: oa2.y1 + 5, room: 'oesteAndar2', elite: true },
      { gx: la2.x1 + 5, gy: la2.y1 + 6, room: 'lesteAndar2', elite: true },
      { gx: la3.x1 + 2, gy: la3.y1 + 7, room: 'lesteAndar3' },
      { gx: la3.x1 + 9, gy: la3.y1 + 2, room: 'lesteAndar3' },
      { gx: la5.x1 + 2, gy: la5.y1 + 7, room: 'lesteAndar5' }
    ],
    SIPHON: [
      { gx: oa2.x1 + 5, gy: oa2.y1 + 6, room: 'oesteAndar2' },
      { gx: oa3.x1 + 8, gy: oa3.y1 + 6, room: 'oesteAndar3', elite: true },
      { gx: oa4.x1 + 5, gy: oa4.y1 + 7, room: 'oesteAndar4' },
      { gx: la4.x1 + 8, gy: la4.y1 + 7, room: 'lesteAndar4', elite: true }
    ],
    ELECTRIC: [
      { gx: oa3.x1 + 3, gy: oa3.y1 + 2, room: 'oesteAndar3' },
      { gx: oa3.x1 + 8, gy: oa3.y1 + 2, room: 'oesteAndar3' },
      { gx: oa5.x1 + 2, gy: oa5.y1 + 7, room: 'oesteAndar5' },
      { gx: la2.x1 + 2, gy: la2.y1 + 2, room: 'lesteAndar2' },
      { gx: la3.x1 + 5, gy: la3.y1 + 5, room: 'lesteAndar3', elite: true }
    ],
    SHOOTER: [
      { gx: la1.x1 + 1, gy: la1.y1 + 2, room: 'lesteAndar1' },
      { gx: la1.x1 + 10, gy: la1.y1 + 7, room: 'lesteAndar1' },
      { gx: la1.x1 + 5, gy: la1.y1 + 1, room: 'lesteAndar1' },
      { gx: la5.x1 + 9, gy: la5.y1 + 4, room: 'lesteAndar5', elite: true }
    ],
    // O Operador Mestre / A Guardiã de Tráfego (sub-confrontos, um por torre).
    M1: [{ gx: rooms.oesteChamber.x1 + 5, gy: rooms.oesteChamber.y1 + 5 }],
    M2: [{ gx: rooms.lesteChamber.x1 + 5, gy: rooms.lesteChamber.y1 + 5 }],
    // O Regente — confronto final, Subsolo da Torre.
    B: [{ gx: rooms.subsolo.x1 + 14, gy: rooms.subsolo.y1 + 6 }]
  };

  // Decoração ambiental — cabos soltos, contêineres, caixotes, tambores e
  // canos, dispersos pelos andares e pelo Saguão/Subsolo pra tirar a
  // sensação de corredor vazio (nenhuma célula usada colide com marcador,
  // portão, corredor ou hazard já definidos acima).
  const props = [
    { gx: oa1.x1 + 2, gy: oa1.y1 + 8, texture: 'prop_cable' },
    { gx: oa1.x2 - 3, gy: oa1.y1 + 1, texture: 'prop_crate', tint: 0xc23b3b },
    { gx: oa2.x1 + 1, gy: oa2.y1 + 8, texture: 'prop_container', tint: 0xffb347 },
    { gx: oa2.x2 - 2, gy: oa2.y1 + 1, texture: 'prop_cable' },
    { gx: oa3.x1 + 5, gy: oa3.y1 + 8, texture: 'prop_barrel', tint: 0xd8a13a },
    { gx: oa3.x2 - 1, gy: oa3.y1 + 5, texture: 'prop_pipe', tint: 0x8fe0ff },
    { gx: oa4.x1 + 5, gy: oa4.y1 + 5, texture: 'prop_cable' },
    { gx: oa4.x2 - 2, gy: oa4.y1 + 8, texture: 'prop_container', tint: 0xffb347 },
    { gx: oa5.x1 + 1, gy: oa5.y1 + 1, texture: 'prop_barrel', tint: 0xc23b3b },
    { gx: oa5.x2 - 1, gy: oa5.y1 + 8, texture: 'prop_cable' },

    { gx: la1.x1 + 5, gy: la1.y1 + 8, texture: 'prop_pipe', tint: 0x8fe0ff },
    { gx: la1.x2 - 1, gy: la1.y1 + 1, texture: 'prop_cable' },
    { gx: la2.x1 + 1, gy: la2.y1 + 8, texture: 'prop_crate', tint: 0xc23b3b },
    { gx: la2.x2 - 2, gy: la2.y1 + 1, texture: 'prop_container', tint: 0xffb347 },
    { gx: la3.x1 + 5, gy: la3.y1 + 8, texture: 'prop_cable' },
    { gx: la3.x2 - 1, gy: la3.y1 + 1, texture: 'prop_barrel', tint: 0xd8a13a },
    { gx: la4.x1 + 1, gy: la4.y1 + 1, texture: 'prop_container', tint: 0xffb347 },
    { gx: la4.x2 - 2, gy: la4.y1 + 5, texture: 'prop_cable' },
    { gx: la5.x1 + 1, gy: la5.y1 + 1, texture: 'prop_barrel', tint: 0xc23b3b },
    { gx: la5.x2 - 1, gy: la5.y1 + 8, texture: 'prop_cable' },

    { gx: rooms.saguao.x1 + 3, gy: rooms.saguao.y1 + 2, texture: 'prop_container', tint: 0xffb347 },
    { gx: rooms.saguao.x1 + 3, gy: rooms.saguao.y2 - 2, texture: 'prop_crate', tint: 0xc23b3b },
    { gx: rooms.saguao.x2 - 3, gy: rooms.saguao.y1 + 2, texture: 'prop_barrel', tint: 0xd8a13a },
    { gx: rooms.saguao.x2 - 3, gy: rooms.saguao.y2 - 2, texture: 'prop_cable' },
    { gx: rooms.saguao.x1 + 10, gy: rooms.saguao.y1 + 4, texture: 'prop_pipe', tint: 0x8fe0ff },
    { gx: rooms.saguao.x2 - 10, gy: rooms.saguao.y2 - 4, texture: 'prop_cable' },

    { gx: rooms.subsolo.x1 + 2, gy: rooms.subsolo.y1 + 1, texture: 'prop_container', tint: 0xffb347 },
    { gx: rooms.subsolo.x2 - 2, gy: rooms.subsolo.y1 + 1, texture: 'prop_container', tint: 0xffb347 },
    { gx: rooms.subsolo.x1 + 2, gy: rooms.subsolo.y2 - 1, texture: 'prop_cable' },
    { gx: rooms.subsolo.x2 - 2, gy: rooms.subsolo.y2 - 1, texture: 'prop_cable' },
    { gx: rooms.subsolo.x1 + 9, gy: rooms.subsolo.y1 + 1, texture: 'prop_barrel', tint: 0xc23b3b }
  ];

  const zones = Object.values(rooms).map((r) => ({ name: r.name, x1: r.x1, y1: r.y1, x2: r.x2 + 1, y2: r.y2 + 1 }));

  return {
    grid, markers, zones, conveyors, arms, traps, gates, subsoloGate,
    towers, props, width: WIDTH, height: HEIGHT
  };
}
