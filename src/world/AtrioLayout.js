// Construção programática do Átrio Executivo (Fase 17, primeira fase da
// Região 5 — Torre Matriz da Neo Industries) — topologia em ESPIRAL QUADRADA
// DE MÃO ÚNICA, distinta de tudo que veio antes: não é o anel FECHADO do
// Servidor/Refinaria (lá dava pra dar a volta e voltar por trás), nem os
// braços do hive da Colônia, nem as duas torres paralelas da Fase 16. Aqui o
// percurso se enrola pra dentro numa linha só: volta externa completa, volta
// interna completa, e então o núcleo.
//
// O que faz a espiral LER como um átrio de verdade são as PAREDES DE VIDRO
// (ver `glass` no retorno): o Átrio Central — onde a confrontação final
// espera — fica visível desde a volta externa, e o jogador passa ao lado dele
// três vezes, sempre atrás do vidro, antes de conseguir entrar.
//
//   (0,4)──(2,4)──(4,4)          Saguão → Espera VIP → Galeria
//     │                │          (volta externa, sentido horário)
//   Refeitório      Catracas
//     │                │
//   (0,0)──(2,0)────(4,0)        ← Auditório no topo
//     │
//     └─(1,3)──(3,3)             entra na volta interna
//              │
//   Mezanino─(3,1) Posto
//     │
//   Antessala ─→ [ ÁTRIO CENTRAL ]
//
// As salas são células de uma grade grossa 5×5; as células da espiral que
// não são sala viram corredor (faixa central de 3 tiles), e o vão entre duas
// células consecutivas é sempre carvado na mesma faixa central — é isso que
// garante que tudo se alinha sem cálculo manual de tile.

const COLS = 5;
const ROWS = 5;
const CELL_W = 11;
const CELL_H = 9;
const STEP_X = 14;
const STEP_Y = 12;
const ORIGIN_X = 2;
const ORIGIN_Y = 2;

const WIDTH = ORIGIN_X + STEP_X * (COLS - 1) + CELL_W + 2;
const HEIGHT = ORIGIN_Y + STEP_Y * (ROWS - 1) + CELL_H + 2;

// Ordem da espiral. `room` presente = célula é sala; ausente = corredor.
const PATH = [
  { c: 0, r: 4, room: 'saguao', name: 'Saguão de Recepção' },
  { c: 1, r: 4 },
  { c: 2, r: 4, room: 'espera', name: 'Sala de Espera VIP' },
  { c: 3, r: 4 },
  { c: 4, r: 4, room: 'galeria', name: 'Galeria de Prêmios' },
  { c: 4, r: 3 },
  { c: 4, r: 2, room: 'catracas', name: 'Corredor de Catracas' },
  { c: 4, r: 1 },
  { c: 4, r: 0 },
  { c: 3, r: 0 },
  { c: 2, r: 0, room: 'auditorio', name: 'Auditório Corporativo' },
  { c: 1, r: 0 },
  { c: 0, r: 0 },
  { c: 0, r: 1 },
  { c: 0, r: 2, room: 'refeitorio', name: 'Refeitório Executivo' },
  { c: 0, r: 3 },
  { c: 1, r: 3, room: 'imprensa', name: 'Sala de Imprensa' },
  { c: 2, r: 3 },
  { c: 3, r: 3, room: 'reunioes', name: 'Sala de Reuniões' },
  { c: 3, r: 2 },
  { c: 3, r: 1, room: 'posto', name: 'Posto de Segurança' },
  { c: 2, r: 1 },
  { c: 1, r: 1, room: 'mezanino', name: 'Mezanino Panorâmico' },
  { c: 1, r: 2, room: 'antessala', name: 'Antessala do Elevador' },
  { c: 2, r: 2, room: 'atrio', name: 'Átrio Central' }
];

function cellRect(c, r) {
  const x1 = ORIGIN_X + c * STEP_X;
  const y1 = ORIGIN_Y + r * STEP_Y;
  return { x1, y1, x2: x1 + CELL_W - 1, y2: y1 + CELL_H - 1 };
}

// Faixa central da célula — a mesma em TODAS elas, por isso corredores e
// vãos sempre encaixam sem ajuste manual.
function bandOf(rect) {
  return { bx1: rect.x1 + 4, bx2: rect.x1 + 6, by1: rect.y1 + 3, by2: rect.y1 + 5 };
}

function carveRect(grid, x1, y1, x2, y2) {
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) grid[y][x] = '.';
  }
}

export function buildAtrioSpiral() {
  const grid = Array.from({ length: HEIGHT }, () => Array(WIDTH).fill('#'));

  // 1) Células da espiral -------------------------------------------------
  const rooms = {};
  PATH.forEach((step, i) => {
    const rect = cellRect(step.c, step.r);
    const { bx1, bx2, by1, by2 } = bandOf(rect);

    if (step.room) {
      carveRect(grid, rect.x1, rect.y1, rect.x2, rect.y2);
      rooms[step.room] = { ...rect, name: step.name };
      return;
    }

    // Corredor: só a faixa central, estendida na direção de quem vem antes
    // e de quem vem depois (o que resolve sozinho reta e curva).
    carveRect(grid, bx1, by1, bx2, by2);
    for (const neighbor of [PATH[i - 1], PATH[i + 1]]) {
      if (!neighbor) continue;
      if (neighbor.c < step.c) carveRect(grid, rect.x1, by1, bx2, by2);
      else if (neighbor.c > step.c) carveRect(grid, bx1, by1, rect.x2, by2);
      else if (neighbor.r < step.r) carveRect(grid, bx1, rect.y1, bx2, by2);
      else if (neighbor.r > step.r) carveRect(grid, bx1, by1, bx2, rect.y2);
    }
  });

  // 2) Vãos entre células consecutivas ------------------------------------
  for (let i = 0; i < PATH.length - 1; i++) {
    const a = cellRect(PATH[i].c, PATH[i].r);
    const b = cellRect(PATH[i + 1].c, PATH[i + 1].r);
    const band = bandOf(a);
    if (b.x1 > a.x2) carveRect(grid, a.x2 + 1, band.by1, b.x1 - 1, band.by2);
    else if (b.x2 < a.x1) carveRect(grid, b.x2 + 1, band.by1, a.x1 - 1, band.by2);
    else if (b.y1 > a.y2) carveRect(grid, band.bx1, a.y2 + 1, band.bx2, b.y1 - 1);
    else carveRect(grid, band.bx1, b.y2 + 1, band.bx2, a.y1 - 1);
  }

  // 3) Portões — cada um sela a LARGURA INTEIRA do vão (3 tiles), nunca uma
  // célula solta no meio: por construção não dá pra contornar.
  const catracasRect = cellRect(4, 2);
  const catracasBand = bandOf(catracasRect);
  const imprensaRect = cellRect(1, 3);
  const imprensaBand = bandOf(imprensaRect);
  const atrioRect = cellRect(2, 2);
  const atrioBand = bandOf(atrioRect);

  const gates = [
    {
      id: 'catracas',
      orientation: 'horizontal',
      gy: catracasRect.y1 - 2,
      cx1: catracasBand.bx1,
      cx2: catracasBand.bx2,
      label: 'CATRACAS — CRACHÁ DE VISITANTE'
    },
    {
      id: 'servico',
      orientation: 'vertical',
      gx: imprensaRect.x1 - 2,
      cy1: imprensaBand.by1,
      cy2: imprensaBand.by2,
      label: 'PORTA DE SERVIÇO — TRAVADA'
    },
    {
      id: 'elevador',
      orientation: 'vertical',
      gx: atrioRect.x1 - 2,
      cy1: atrioBand.by1,
      cy2: atrioBand.by2,
      label: 'ELEVADOR EXECUTIVO — SELADO'
    }
  ];
  for (const gate of gates) {
    if (gate.orientation === 'horizontal') {
      for (let x = gate.cx1; x <= gate.cx2; x++) grid[gate.gy][x] = '#';
    } else {
      for (let y = gate.cy1; y <= gate.cy2; y++) grid[y][gate.gx] = '#';
    }
  }

  const R = rooms;

  // 4) Piso polido — mármore encerado. NÃO causa dano (é o primeiro piso
  // especial do jogo que mexe no CONTROLE, não no HP): o jogador desliza por
  // inércia. Aparece cinco vezes ao longo da espiral, numa curva que sobe:
  //
  //   Saguão      — ilha central, sem inimigo nenhum: só pra sentir o deslize.
  //   Galeria     — ilha central de novo, mas agora com guardas em cima dela.
  //   Mezanino    — sala inteira, e é onde fica a elite da segurança.
  //   Antessala   — sala inteira: o empurrão do Concierge manda longe aqui.
  //   Átrio       — sala inteira: a arena final.
  //
  // As duas primeiras são ilha (inset 2) de propósito: sobra chão firme na
  // borda pra recuar. Da terceira em diante é de parede a parede.
  const polished = [];
  const polishRect = (r, inset = 1) => {
    for (let y = r.y1 + inset; y <= r.y2 - inset; y++) {
      for (let x = r.x1 + inset; x <= r.x2 - inset; x++) polished.push({ gx: x, gy: y });
    }
  };
  polishRect(R.saguao, 2);
  polishRect(R.galeria, 2);
  polishRect(R.mezanino, 1);
  polishRect(R.antessala, 1);
  polishRect(R.atrio, 1);

  // 5) Paredes de vidro — só marcação visual (a colisão não muda). É o que
  // deixa o Átrio Central à vista desde as voltas de fora, e o que dá ao
  // mapa a leitura de "um átrio só", em vez de 12 caixas independentes.
  const glass = [];
  const glassRing = (r) => {
    for (let x = r.x1 - 1; x <= r.x2 + 1; x++) {
      for (const y of [r.y1 - 1, r.y2 + 1]) {
        if (grid[y]?.[x] === '#') glass.push({ gx: x, gy: y });
      }
    }
    for (let y = r.y1 - 1; y <= r.y2 + 1; y++) {
      for (const x of [r.x1 - 1, r.x2 + 1]) {
        if (grid[y]?.[x] === '#') glass.push({ gx: x, gy: y });
      }
    }
  };
  glassRing(R.atrio);
  glassRing(R.mezanino);
  glassRing(R.antessala);
  glassRing(R.posto);
  glassRing(R.espera);
  glassRing(R.auditorio);

  const markers = {
    S: [{ gx: R.saguao.x1 + 2, gy: R.saguao.y1 + 6 }],
    // Armadura — Sala de Espera VIP (volta externa, sempre alcançável).
    A: [{ gx: R.espera.x1 + 8, gy: R.espera.y1 + 2 }],
    // Botas de Impulso da Região 5 — Galeria de Prêmios (num pedestal de
    // troféu, o que mais combina com a sala).
    P: [{ gx: R.galeria.x1 + 5, gy: R.galeria.y1 + 4 }],
    // Lâmina — Sala de Imprensa (primeira sala da volta interna).
    I: [{ gx: R.imprensa.x1 + 8, gy: R.imprensa.y1 + 6 }],
    // Pistola — Sala de Reuniões.
    C: [{ gx: R.reunioes.x1 + 2, gy: R.reunioes.y1 + 2 }],
    H: [
      { gx: R.auditorio.x1 + 1, gy: R.auditorio.y1 + 7 },
      { gx: R.refeitorio.x1 + 9, gy: R.refeitorio.y1 + 1 },
      { gx: R.posto.x1 + 1, gy: R.posto.y1 + 1 },
      { gx: R.mezanino.x1 + 9, gy: R.mezanino.y1 + 7 }
    ],
    // Cativos — Sala de Imprensa (os dois jornalistas presos ali).
    N: [
      { gx: R.imprensa.x1 + 2, gy: R.imprensa.y1 + 2 },
      { gx: R.imprensa.x1 + 4, gy: R.imprensa.y1 + 7 }
    ],
    // Console das câmeras — Posto de Segurança.
    CONSOLE: [{ gx: R.posto.x1 + 5, gy: R.posto.y1 + 4 }],
    // O Concierge (sub-confronto) / A Diretora de Segurança (final).
    M1: [{ gx: R.antessala.x1 + 5, gy: R.antessala.y1 + 4 }],
    B: [{ gx: R.atrio.x1 + 5, gy: R.atrio.y1 + 4 }]
  };

  // Guarda de Escudo — o inimigo que define a fase. Espalhado desde a
  // segunda sala pra o jogador aprender a flanquear cedo, com variantes
  // elite guardando o miolo da espiral.
  markers.GUARD = [
    { gx: R.espera.x1 + 3, gy: R.espera.y1 + 5, room: 'espera' },
    { gx: R.galeria.x1 + 2, gy: R.galeria.y1 + 2, room: 'galeria' },
    { gx: R.galeria.x1 + 8, gy: R.galeria.y1 + 6, room: 'galeria' },
    { gx: R.catracas.x1 + 3, gy: R.catracas.y1 + 2, room: 'catracas' },
    { gx: R.catracas.x1 + 7, gy: R.catracas.y1 + 6, room: 'catracas' },
    { gx: R.auditorio.x1 + 2, gy: R.auditorio.y1 + 2, room: 'auditorio' },
    { gx: R.auditorio.x1 + 8, gy: R.auditorio.y1 + 5, room: 'auditorio', elite: true },
    { gx: R.refeitorio.x1 + 2, gy: R.refeitorio.y1 + 6, room: 'refeitorio' },
    { gx: R.reunioes.x1 + 8, gy: R.reunioes.y1 + 6, room: 'reunioes' },
    { gx: R.reunioes.x1 + 5, gy: R.reunioes.y1 + 2, room: 'reunioes', elite: true },
    { gx: R.posto.x1 + 8, gy: R.posto.y1 + 6, room: 'posto', elite: true },
    { gx: R.mezanino.x1 + 2, gy: R.mezanino.y1 + 2, room: 'mezanino', elite: true },
    { gx: R.mezanino.x1 + 8, gy: R.mezanino.y1 + 2, room: 'mezanino', elite: true }
  ];

  markers.SHOOTER = [
    { gx: R.espera.x1 + 6, gy: R.espera.y1 + 6, room: 'espera' },
    { gx: R.espera.x1 + 9, gy: R.espera.y1 + 5, room: 'espera' },
    { gx: R.galeria.x1 + 5, gy: R.galeria.y1 + 7, room: 'galeria' },
    { gx: R.auditorio.x1 + 5, gy: R.auditorio.y1 + 7, room: 'auditorio' },
    { gx: R.auditorio.x1 + 9, gy: R.auditorio.y1 + 2, room: 'auditorio' },
    { gx: R.imprensa.x1 + 8, gy: R.imprensa.y1 + 2, room: 'imprensa' },
    { gx: R.imprensa.x1 + 6, gy: R.imprensa.y1 + 5, room: 'imprensa' },
    { gx: R.reunioes.x1 + 2, gy: R.reunioes.y1 + 6, room: 'reunioes' },
    { gx: R.posto.x1 + 2, gy: R.posto.y1 + 6, room: 'posto' },
    { gx: R.mezanino.x1 + 5, gy: R.mezanino.y1 + 6, room: 'mezanino' },
    { gx: R.mezanino.x1 + 8, gy: R.mezanino.y1 + 5, room: 'mezanino' }
  ];

  markers.JAMMER = [
    { gx: R.catracas.x1 + 5, gy: R.catracas.y1 + 4, room: 'catracas' },
    { gx: R.imprensa.x1 + 2, gy: R.imprensa.y1 + 5, room: 'imprensa' },
    { gx: R.posto.x1 + 5, gy: R.posto.y1 + 7, room: 'posto' },
    { gx: R.posto.x1 + 8, gy: R.posto.y1 + 2, room: 'posto' }
  ];

  markers.ELECTRIC = [
    { gx: R.auditorio.x1 + 2, gy: R.auditorio.y1 + 5, room: 'auditorio' },
    { gx: R.refeitorio.x1 + 8, gy: R.refeitorio.y1 + 4, room: 'refeitorio' },
    { gx: R.refeitorio.x1 + 5, gy: R.refeitorio.y1 + 7, room: 'refeitorio' },
    { gx: R.reunioes.x1 + 5, gy: R.reunioes.y1 + 5, room: 'reunioes' },
    { gx: R.mezanino.x1 + 5, gy: R.mezanino.y1 + 2, room: 'mezanino' }
  ];

  // Câmeras de segurança — cone de visão fixo. Todas ficam em salas ANTES do
  // Posto de Segurança na ordem da espiral, pra desligar o sistema lá ser um
  // alívio de verdade e não uma recompensa vazia.
  const cameras = [
    { gx: R.catracas.x1 + 1, gy: R.catracas.y1 + 1, dirX: 1, dirY: 1 },
    { gx: R.catracas.x1 + 9, gy: R.catracas.y1 + 7, dirX: -1, dirY: -1 },
    { gx: R.auditorio.x1 + 1, gy: R.auditorio.y1 + 1, dirX: 1, dirY: 1 },
    { gx: R.auditorio.x1 + 9, gy: R.auditorio.y1 + 1, dirX: -1, dirY: 1 },
    { gx: R.refeitorio.x1 + 1, gy: R.refeitorio.y1 + 7, dirX: 1, dirY: -1 },
    { gx: R.reunioes.x1 + 9, gy: R.reunioes.y1 + 1, dirX: -1, dirY: 1 }
  ];

  // Reforço chamado pelo alarme — sempre nas bordas do Auditório/Catracas,
  // longe o bastante pra dar tempo de reagir.
  const alarmSpawns = [
    { gx: R.catracas.x1 + 5, gy: R.catracas.y1 + 1 },
    { gx: R.auditorio.x1 + 5, gy: R.auditorio.y1 + 1 },
    { gx: R.reunioes.x1 + 5, gy: R.reunioes.y1 + 7 },
    { gx: R.refeitorio.x1 + 5, gy: R.refeitorio.y1 + 1 }
  ];

  // Quebra-cabeça do mobiliário (Refeitório Executivo) — três mesas de
  // banquete empurráveis e três placas de pressão. Nenhum puzzle anterior
  // pediu pra MOVER um objeto pelo mapa: sequência, circuito, pares,
  // rotação, plugues e travas eram todos "pisar/alternar no lugar".
  const rf = R.refeitorio;
  const plates = [
    { gx: rf.x1 + 2, gy: rf.y1 + 2 },
    { gx: rf.x1 + 5, gy: rf.y1 + 1 },
    { gx: rf.x1 + 8, gy: rf.y1 + 2 }
  ];
  const pushables = [
    { gx: rf.x1 + 2, gy: rf.y1 + 5 },
    { gx: rf.x1 + 5, gy: rf.y1 + 4 },
    { gx: rf.x1 + 8, gy: rf.y1 + 5 }
  ];
  // Mesa nenhuma pode encostar na parede do salão: num canto, o jogador não
  // teria como ficar atrás dela pra empurrar de volta, e o puzzle — que é o
  // que abre a porta de serviço — travaria a fase pra sempre. Com o limite
  // recuado 1 tile de cada parede, toda posição possível tem célula livre
  // atrás nas quatro direções, então nada é irreversível.
  const pushArea = { x1: rf.x1 + 1, y1: rf.y1 + 1, x2: rf.x2 - 1, y2: rf.y2 - 1 };

  const props = [
    { gx: R.saguao.x1 + 8, gy: R.saguao.y1 + 2, texture: 'prop_kiosk', tint: 0xc9a24a },
    { gx: R.saguao.x1 + 1, gy: R.saguao.y1 + 1, texture: 'prop_lantern', tint: 0xffe9b8 },
    { gx: R.saguao.x1 + 9, gy: R.saguao.y1 + 7, texture: 'prop_lantern', tint: 0xffe9b8 },
    { gx: R.espera.x1 + 1, gy: R.espera.y1 + 1, texture: 'prop_pedestal', tint: 0xc9a24a },
    { gx: R.espera.x1 + 9, gy: R.espera.y1 + 7, texture: 'prop_lantern', tint: 0xffe9b8 },
    { gx: R.galeria.x1 + 1, gy: R.galeria.y1 + 7, texture: 'prop_pedestal', tint: 0xc9a24a },
    { gx: R.galeria.x1 + 9, gy: R.galeria.y1 + 1, texture: 'prop_pedestal', tint: 0xc9a24a },
    { gx: R.catracas.x1 + 1, gy: R.catracas.y1 + 4, texture: 'prop_console', tint: 0x8fb4ff },
    { gx: R.catracas.x1 + 9, gy: R.catracas.y1 + 4, texture: 'prop_console', tint: 0x8fb4ff },
    { gx: R.auditorio.x1 + 1, gy: R.auditorio.y1 + 4, texture: 'prop_rack', tint: 0x4a5268 },
    { gx: R.auditorio.x1 + 9, gy: R.auditorio.y1 + 7, texture: 'prop_lantern', tint: 0xffe9b8 },
    { gx: R.refeitorio.x1 + 1, gy: R.refeitorio.y1 + 4, texture: 'prop_lantern', tint: 0xffe9b8 },
    { gx: R.imprensa.x1 + 9, gy: R.imprensa.y1 + 4, texture: 'prop_rack', tint: 0x4a5268 },
    { gx: R.imprensa.x1 + 1, gy: R.imprensa.y1 + 4, texture: 'prop_console', tint: 0x8fb4ff },
    { gx: R.reunioes.x1 + 1, gy: R.reunioes.y1 + 1, texture: 'prop_pedestal', tint: 0xc9a24a },
    { gx: R.posto.x1 + 1, gy: R.posto.y1 + 4, texture: 'prop_rack', tint: 0x4a5268 },
    { gx: R.posto.x1 + 9, gy: R.posto.y1 + 4, texture: 'prop_rack', tint: 0x4a5268 },
    { gx: R.mezanino.x1 + 1, gy: R.mezanino.y1 + 4, texture: 'prop_lantern', tint: 0xffe9b8 },
    { gx: R.mezanino.x1 + 9, gy: R.mezanino.y1 + 4, texture: 'prop_lantern', tint: 0xffe9b8 },
    { gx: R.antessala.x1 + 1, gy: R.antessala.y1 + 1, texture: 'prop_pedestal', tint: 0xc9a24a },
    { gx: R.antessala.x1 + 9, gy: R.antessala.y1 + 7, texture: 'prop_pedestal', tint: 0xc9a24a },
    { gx: R.atrio.x1 + 1, gy: R.atrio.y1 + 1, texture: 'prop_lantern', tint: 0xffe9b8 },
    { gx: R.atrio.x1 + 9, gy: R.atrio.y1 + 1, texture: 'prop_lantern', tint: 0xffe9b8 }
  ];

  const zones = Object.values(rooms).map((r) => ({
    name: r.name, x1: r.x1, y1: r.y1, x2: r.x2 + 1, y2: r.y2 + 1
  }));

  return {
    grid, markers, zones, rooms, gates, glass, polished,
    cameras, alarmSpawns, plates, pushables, pushArea, props,
    width: WIDTH, height: HEIGHT
  };
}
