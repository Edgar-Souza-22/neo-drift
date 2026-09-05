// Construção programática do Departamento de P&D (Fase 18, segunda fase da
// Região 5 — Torre Matriz da Neo Industries).
//
// A novidade estrutural: a PLANTA SE RECONFIGURA. Nenhuma fase anterior mudou
// de forma durante o jogo — aqui um conjunto de PAREDES SOBRE TRILHOS desliza
// pelo mapa inteiro quando o jogador opera a Bancada de Reconfiguração, e
// corredores que existiam somem enquanto outros nascem. Não se destranca uma
// porta: remonta-se o prédio.
//
//        [Síntese]─[Testes]─[Almox.]─[Revisão]        ← ala norte
//            │        │        │
//   [Recepção]══[BANCADA]══════╧═══[Contenção]─┐      ← espinha (FIXA)
//            │        │    │                   │
//        [Tanques] [Necrot.] [Arquivo]     [Núcleo]   ← ala sul + arena
//
// Três invariantes de projeto, e é delas que vem a segurança da mecânica:
//
//   1. A ESPINHA NUNCA SE MOVE. Recepção, Bancada e o corredor entre elas são
//      paredes fixas, então o console é alcançável de qualquer lugar.
//   2. SÓ SE RECONFIGURA NA BANCADA (ver PesquisaScene._tryReconfigure): o
//      jogador está sempre na espinha quando as paredes deslizam, nunca
//      dentro de uma ala. Por construção, é impossível fechar uma parede em
//      cima dele ou trancá-lo num canto.
//   3. TROCA LIVRE entre as configurações já liberadas. Como dá pra voltar
//      pra A ou B a qualquer momento, nenhuma ordem de ações deixa um
//      inimigo restante inalcançável — o que importa porque a fase só
//      termina com o mapa limpo.
//
// Cada configuração também muda o DESENHO DA CIRCULAÇÃO, não só o que está
// aberto: em A a ala norte é uma CORRENTE (entra na Síntese e atravessa as
// quatro salas de lado a lado); em B ela vira atalho (Almoxarifado e Revisão
// passam a pendurar direto na espinha, e Síntese/Testes fecham). A mesma sala
// é servida por rotas opostas dependendo da planta ativa.

const WIDTH = 64;
const HEIGHT = 50;

function carveRect(grid, x1, y1, x2, y2) {
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) grid[y][x] = '.';
  }
}

export function buildPesquisaLabs() {
  const grid = Array.from({ length: HEIGHT }, () => Array(WIDTH).fill('#'));

  const rooms = {
    // Espinha fixa (nunca é particionada).
    recepcao: { x1: 2, y1: 20, x2: 13, y2: 29, name: 'Recepção do Departamento' },
    bancada: { x1: 25, y1: 19, x2: 38, y2: 30, name: 'Bancada de Reconfiguração' },
    contencao: { x1: 44, y1: 22, x2: 57, y2: 27, name: 'Corredor de Contenção' },
    nucleo: { x1: 48, y1: 32, x2: 62, y2: 47, name: 'Núcleo de Projeto' },
    // Ala norte.
    sintese: { x1: 6, y1: 5, x2: 17, y2: 14, name: 'Sala de Síntese' },
    testes: { x1: 20, y1: 5, x2: 31, y2: 14, name: 'Testes de Campo' },
    almox: { x1: 34, y1: 5, x2: 45, y2: 14, name: 'Almoxarifado de Peças' },
    revisao: { x1: 48, y1: 5, x2: 59, y2: 14, name: 'Sala de Revisão de Projeto' },
    // Ala sul.
    tanques: { x1: 6, y1: 36, x2: 17, y2: 45, name: 'Galeria de Tanques' },
    necroterio: { x1: 20, y1: 36, x2: 31, y2: 45, name: 'Necrotério de Protótipos' },
    arquivo: { x1: 34, y1: 36, x2: 45, y2: 45, name: 'Arquivo Vivo' }
  };
  for (const r of Object.values(rooms)) carveRect(grid, r.x1, r.y1, r.x2, r.y2);

  // Espinha: corredor fixo ligando Recepção → Bancada → Contenção.
  carveRect(grid, 14, 23, 24, 26);
  carveRect(grid, 39, 23, 43, 26);

  // Ligações verticais norte (sala → espinha) e laterais (sala ↔ sala).
  carveRect(grid, 10, 15, 12, 19);   // Síntese → Recepção
  carveRect(grid, 25, 15, 27, 18);   // Testes → Bancada
  carveRect(grid, 38, 15, 40, 22);   // Almoxarifado → espinha
  carveRect(grid, 52, 15, 54, 21);   // Revisão → Contenção
  carveRect(grid, 18, 9, 19, 11);    // Síntese ↔ Testes
  carveRect(grid, 32, 9, 33, 11);    // Testes ↔ Almoxarifado
  carveRect(grid, 46, 9, 47, 11);    // Almoxarifado ↔ Revisão

  // Ligações verticais sul (espinha → sala).
  carveRect(grid, 10, 30, 12, 35);   // Recepção → Tanques
  carveRect(grid, 25, 31, 27, 35);   // Bancada → Necrotério
  carveRect(grid, 36, 31, 38, 35);   // Bancada → Arquivo Vivo

  // Leste: espinha → Contenção → Núcleo.
  carveRect(grid, 52, 28, 54, 31);   // Contenção → Núcleo

  // --- Paredes sobre trilhos ---------------------------------------------
  // Cada uma bloqueia a LARGURA INTEIRA da sua ligação (mesma regra das
  // fases 16 e 17): nunca uma célula solta no meio de um corredor largo, o
  // que por construção elimina a possibilidade de contornar.
  const partitions = [
    { id: 'n1_spine', orientation: 'horizontal', gy: 17, cx1: 10, cx2: 12 },
    { id: 'n2_spine', orientation: 'horizontal', gy: 17, cx1: 25, cx2: 27 },
    { id: 'n3_spine', orientation: 'horizontal', gy: 19, cx1: 38, cx2: 40 },
    { id: 'n1_n2', orientation: 'vertical', gx: 18, cy1: 9, cy2: 11 },
    { id: 'n2_n3', orientation: 'vertical', gx: 32, cy1: 9, cy2: 11 },
    { id: 'n3_n4', orientation: 'vertical', gx: 46, cy1: 9, cy2: 11 },
    { id: 's1_spine', orientation: 'horizontal', gy: 32, cx1: 10, cx2: 12 },
    { id: 's2_spine', orientation: 'horizontal', gy: 33, cx1: 25, cx2: 27 },
    { id: 's3_spine', orientation: 'horizontal', gy: 33, cx1: 36, cx2: 38 },
    // Sem esta, a Sala de Revisão vira porta dos fundos pro Corredor de
    // Contenção (a ligação vertical dela desce direto lá) e a Planta C deixa
    // de ser a única forma de chegar ao corredor.
    { id: 'n4_contencao', orientation: 'horizontal', gy: 18, cx1: 52, cx2: 54 },
    { id: 'contencao', orientation: 'vertical', gx: 43, cy1: 23, cy2: 26 },
    { id: 'nucleo', orientation: 'horizontal', gy: 30, cx1: 52, cx2: 54 }
  ];
  for (const p of partitions) {
    p.cells = [];
    if (p.orientation === 'horizontal') {
      for (let x = p.cx1; x <= p.cx2; x++) p.cells.push({ gx: x, gy: p.gy });
    } else {
      for (let y = p.cy1; y <= p.cy2; y++) p.cells.push({ gx: p.gx, gy: y });
    }
  }

  // --- As três plantas ----------------------------------------------------
  // `open` lista o que fica ABERTO; tudo que não está na lista fecha. Trocar
  // de planta é sempre um movimento completo, nunca um acréscimo — é isso
  // que faz o prédio parecer remontado e não destrancado.
  const configs = [
    {
      id: 'A',
      name: 'BANCADAS',
      label: 'Planta A — Bancadas',
      open: ['n1_spine', 'n2_spine', 'n1_n2', 'n2_n3', 'n3_n4'],
      blurb: 'Ala norte em corrente: as quatro salas de bancada se ligam de lado a lado.'
    },
    {
      id: 'B',
      name: 'CONTENÇÃO',
      label: 'Planta B — Contenção',
      open: ['s1_spine', 's2_spine', 's3_spine', 'n3_spine', 'n3_n4'],
      blurb: 'Ala sul aberta na espinha, e o Almoxarifado passa a pendurar direto nela.'
    },
    {
      id: 'C',
      name: 'NÚCLEO',
      label: 'Planta C — Núcleo',
      open: ['contencao', 'nucleo', 'n4_contencao'],
      blurb: 'As alas se fecham e o corredor de contenção libera o Núcleo de Projeto.'
    }
  ];

  const R = rooms;

  const markers = {
    S: [{ gx: R.recepcao.x1 + 3, gy: R.recepcao.y1 + 5 }],
    // Console da Bancada — o único ponto do mapa onde a planta muda.
    CONSOLE: [{ gx: R.bancada.x1 + 6, gy: R.bancada.y1 + 5 }],
    A: [{ gx: R.sintese.x1 + 9, gy: R.sintese.y1 + 2 }],
    I: [{ gx: R.testes.x1 + 9, gy: R.testes.y1 + 7 }],
    C: [{ gx: R.tanques.x1 + 2, gy: R.tanques.y1 + 2 }],
    // Chave de Autorização — fim da corrente norte, libera a Planta B.
    KEY: [{ gx: R.revisao.x1 + 9, gy: R.revisao.y1 + 4 }],
    H: [
      { gx: R.testes.x1 + 1, gy: R.testes.y1 + 2 },
      { gx: R.almox.x1 + 9, gy: R.almox.y1 + 7 },
      { gx: R.necroterio.x1 + 1, gy: R.necroterio.y1 + 7 },
      { gx: R.contencao.x1 + 2, gy: R.contencao.y1 + 3 }
    ],
    N: [
      { gx: R.necroterio.x1 + 8, gy: R.necroterio.y1 + 2 },
      { gx: R.necroterio.x1 + 5, gy: R.necroterio.y1 + 7 }
    ],
    M1: [{ gx: R.arquivo.x1 + 5, gy: R.arquivo.y1 + 5 }],
    B: [{ gx: R.nucleo.x1 + 7, gy: R.nucleo.y1 + 7 }]
  };

  // Protótipo Instável — o inimigo que só existe aqui. Concentrado nas salas
  // de bancada e no necrotério, que é onde faz sentido haver protótipo
  // inacabado solto.
  markers.PROTO = [
    { gx: R.sintese.x1 + 2, gy: R.sintese.y1 + 5, room: 'sintese' },
    { gx: R.sintese.x1 + 6, gy: R.sintese.y1 + 7, room: 'sintese' },
    { gx: R.testes.x1 + 3, gy: R.testes.y1 + 5, room: 'testes' },
    { gx: R.testes.x1 + 7, gy: R.testes.y1 + 2, room: 'testes' },
    { gx: R.almox.x1 + 2, gy: R.almox.y1 + 2, room: 'almox' },
    { gx: R.necroterio.x1 + 2, gy: R.necroterio.y1 + 4, room: 'necroterio' },
    { gx: R.arquivo.x1 + 2, gy: R.arquivo.y1 + 2, room: 'arquivo' },
    { gx: R.revisao.x1 + 2, gy: R.revisao.y1 + 7, room: 'revisao', elite: true }
  ];

  // Guardas de Escudo: a segurança corporativa da Fase 17 também protege os
  // laboratórios — o jogador já sabe que a resposta é flanquear.
  markers.GUARD = [
    { gx: R.sintese.x1 + 9, gy: R.sintese.y1 + 5, room: 'sintese' },
    { gx: R.testes.x1 + 5, gy: R.testes.y1 + 7, room: 'testes' },
    { gx: R.revisao.x1 + 5, gy: R.revisao.y1 + 2, room: 'revisao' },
    { gx: R.revisao.x1 + 8, gy: R.revisao.y1 + 7, room: 'revisao', elite: true },
    { gx: R.tanques.x1 + 8, gy: R.tanques.y1 + 6, room: 'tanques' },
    { gx: R.arquivo.x1 + 9, gy: R.arquivo.y1 + 7, room: 'arquivo', elite: true },
    { gx: R.contencao.x1 + 6, gy: R.contencao.y1 + 2, room: 'contencao' },
    { gx: R.contencao.x1 + 11, gy: R.contencao.y1 + 3, room: 'contencao', elite: true }
  ];

  markers.SHOOTER = [
    { gx: R.almox.x1 + 9, gy: R.almox.y1 + 2, room: 'almox' },
    { gx: R.revisao.x1 + 2, gy: R.revisao.y1 + 2, room: 'revisao' },
    { gx: R.tanques.x1 + 5, gy: R.tanques.y1 + 2, room: 'tanques' },
    { gx: R.arquivo.x1 + 8, gy: R.arquivo.y1 + 2, room: 'arquivo' }
  ];

  markers.ELECTRIC = [
    { gx: R.sintese.x1 + 5, gy: R.sintese.y1 + 2, room: 'sintese' },
    { gx: R.almox.x1 + 2, gy: R.almox.y1 + 7, room: 'almox', elite: true },
    { gx: R.tanques.x1 + 5, gy: R.tanques.y1 + 7, room: 'tanques' },
    { gx: R.tanques.x1 + 9, gy: R.tanques.y1 + 2, room: 'tanques' }
  ];

  markers.JAMMER = [
    { gx: R.testes.x1 + 9, gy: R.testes.y1 + 4, room: 'testes' },
    { gx: R.necroterio.x1 + 4, gy: R.necroterio.y1 + 2, room: 'necroterio' },
    { gx: R.arquivo.x1 + 5, gy: R.arquivo.y1 + 8, room: 'arquivo' },
    { gx: R.contencao.x1 + 9, gy: R.contencao.y1 + 4, room: 'contencao' }
  ];

  // Saltador de Fase: protótipo de teleporte — nasceu aqui, literalmente.
  markers.JUMPER = [
    { gx: R.testes.x1 + 2, gy: R.testes.y1 + 2, room: 'testes' },
    { gx: R.almox.x1 + 6, gy: R.almox.y1 + 8, room: 'almox' },
    { gx: R.necroterio.x1 + 8, gy: R.necroterio.y1 + 8, room: 'necroterio' },
    { gx: R.contencao.x1 + 3, gy: R.contencao.y1 + 1, room: 'contencao' }
  ];

  // Fichas de projeto: as placas ao lado dos tanques nomeiam inimigos das
  // fases 01-17. É o que transforma a fase na resposta de "quem projetou
  // tudo isso" — custa duas linhas de código e é o beat de história que a
  // região precisava antes da Sala do Conselho.
  const dossiers = [
    { gx: R.tanques.x1 + 2, gy: R.tanques.y1 + 5, text: 'PROJ-014 · DRONE INIBIDOR — pulso EMP · aprovado' },
    { gx: R.tanques.x1 + 6, gy: R.tanques.y1 + 5, text: 'PROJ-031 · SALTADOR DE FASE — teleporte curto · aprovado' },
    { gx: R.tanques.x1 + 10, gy: R.tanques.y1 + 5, text: 'PROJ-052 · GUARDA DE ESCUDO — anteparo frontal · em série' },
    { gx: R.necroterio.x1 + 3, gy: R.necroterio.y1 + 6, text: 'PROJ-008 · SENTINELA ELÉTRICA — descontinuado' },
    { gx: R.necroterio.x1 + 7, gy: R.necroterio.y1 + 6, text: 'PROJ-047 · O PROTÓTIPO — casco completo · perdido em campo' },
    { gx: R.almox.x1 + 4, gy: R.almox.y1 + 3, text: 'PROJ-063 · SONDA SIFÃO — dreno de carga · revisão pendente' }
  ];

  const props = [
    { gx: R.recepcao.x1 + 9, gy: R.recepcao.y1 + 2, texture: 'prop_console', tint: 0x8fe0ff },
    { gx: R.recepcao.x1 + 2, gy: R.recepcao.y1 + 8, texture: 'prop_rack', tint: 0x4a5268 },
    { gx: R.sintese.x1 + 1, gy: R.sintese.y1 + 1, texture: 'prop_tank', tint: 0x8fe0ff },
    { gx: R.sintese.x1 + 10, gy: R.sintese.y1 + 8, texture: 'prop_rack', tint: 0x4a5268 },
    { gx: R.testes.x1 + 1, gy: R.testes.y1 + 8, texture: 'prop_console', tint: 0x8fe0ff },
    { gx: R.almox.x1 + 1, gy: R.almox.y1 + 4, texture: 'prop_rack', tint: 0x4a5268 },
    { gx: R.almox.x1 + 10, gy: R.almox.y1 + 4, texture: 'prop_rack', tint: 0x4a5268 },
    { gx: R.revisao.x1 + 5, gy: R.revisao.y1 + 5, texture: 'prop_console', tint: 0x8fe0ff },
    { gx: R.tanques.x1 + 2, gy: R.tanques.y1 + 4, texture: 'prop_tank', tint: 0x8fe0ff },
    { gx: R.tanques.x1 + 6, gy: R.tanques.y1 + 4, texture: 'prop_tank', tint: 0x9fffc8 },
    { gx: R.tanques.x1 + 10, gy: R.tanques.y1 + 4, texture: 'prop_tank', tint: 0xb37aff },
    { gx: R.necroterio.x1 + 3, gy: R.necroterio.y1 + 5, texture: 'prop_tank', tint: 0x6a7280 },
    { gx: R.necroterio.x1 + 7, gy: R.necroterio.y1 + 5, texture: 'prop_tank', tint: 0x6a7280 },
    { gx: R.arquivo.x1 + 1, gy: R.arquivo.y1 + 5, texture: 'prop_rack', tint: 0x4a5268 },
    { gx: R.arquivo.x1 + 10, gy: R.arquivo.y1 + 5, texture: 'prop_rack', tint: 0x4a5268 },
    { gx: R.bancada.x1 + 1, gy: R.bancada.y1 + 1, texture: 'prop_rack', tint: 0x4a5268 },
    { gx: R.bancada.x1 + 12, gy: R.bancada.y1 + 1, texture: 'prop_rack', tint: 0x4a5268 },
    { gx: R.bancada.x1 + 1, gy: R.bancada.y1 + 10, texture: 'prop_console', tint: 0x8fe0ff },
    { gx: R.bancada.x1 + 12, gy: R.bancada.y1 + 10, texture: 'prop_console', tint: 0x8fe0ff },
    { gx: R.contencao.x1 + 1, gy: R.contencao.y1 + 1, texture: 'prop_tank', tint: 0xb37aff },
    { gx: R.nucleo.x1 + 1, gy: R.nucleo.y1 + 1, texture: 'prop_tank', tint: 0xb37aff },
    { gx: R.nucleo.x1 + 13, gy: R.nucleo.y1 + 1, texture: 'prop_tank', tint: 0xb37aff },
    { gx: R.nucleo.x1 + 1, gy: R.nucleo.y1 + 14, texture: 'prop_rack', tint: 0x4a5268 },
    { gx: R.nucleo.x1 + 13, gy: R.nucleo.y1 + 14, texture: 'prop_rack', tint: 0x4a5268 }
  ];

  const zones = Object.values(rooms).map((r) => ({
    name: r.name, x1: r.x1, y1: r.y1, x2: r.x2 + 1, y2: r.y2 + 1
  }));

  return {
    grid, markers, zones, rooms, partitions, configs, dossiers, props,
    width: WIDTH, height: HEIGHT
  };
}
