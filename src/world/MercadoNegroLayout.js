// Construção programática do Mercado Negro dos Túneis (Fase 10, 2ª fase do
// Submundo) — topologia em LOOP + DUAS ALAS que convergem, desenhada pelo
// usuário num diagrama de caixas: a partir da Praça do Mercado (entrada), a
// ala esquerda é um laço fechado (sala da lâmina + armadilha, dá a volta e
// desce pro mesmo Cofre de Acesso alcançável pelo caminho curto) que só
// libera a Câmara do Capataz depois do puzzle de Sequência; a ala direita é
// linear (armadura -> puzzle de Circuito -> armadilha -> pistola) e não tem
// combate de guarda, só puzzle+armadilha. As duas convergem no Beco de Saída,
// de onde um último puzzle (Sinal) libera o Salão do Barão.
const WIDTH = 76;
const HEIGHT = 70;

function carveRect(grid, x1, y1, x2, y2) {
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      grid[y][x] = '.';
    }
  }
}

export function buildMercadoNegroWing() {
  const grid = Array.from({ length: HEIGHT }, () => Array(WIDTH).fill('#'));

  const rooms = {
    becoFundos: { x1: 1, y1: 1, x2: 9, y2: 8, name: 'Beco dos Fundos' },
    armariaClandestina: { x1: 14, y1: 1, x2: 22, y2: 8, name: 'Armaria Clandestina' },
    depositoAlto: { x1: 27, y1: 1, x2: 35, y2: 8, name: 'Depósito Alto' },
    escadaServico: { x1: 1, y1: 13, x2: 9, y2: 20, name: 'Escada de Serviço' },
    corredorMinado: { x1: 27, y1: 13, x2: 35, y2: 20, name: 'Corredor Minado' },
    cofreAcesso: { x1: 1, y1: 25, x2: 9, y2: 32, name: 'Cofre de Acesso' },
    viela: { x1: 14, y1: 25, x2: 22, y2: 32, name: 'Viela' },
    pracaMercado: { x1: 27, y1: 25, x2: 35, y2: 32, name: 'Praça do Mercado' },
    fileiraBarracas: { x1: 40, y1: 25, x2: 48, y2: 32, name: 'Fileira de Barracas' },
    passagemLateral: { x1: 53, y1: 25, x2: 61, y2: 32, name: 'Passagem Lateral' },
    barracaBlindador: { x1: 66, y1: 25, x2: 74, y2: 32, name: 'Barraca do Blindador' },
    depositoBarraca: { x1: 66, y1: 37, x2: 74, y2: 44, name: 'Depósito da Barraca' },
    corredorFundos: { x1: 53, y1: 37, x2: 61, y2: 44, name: 'Corredor dos Fundos' },
    salaDistribuicao: { x1: 40, y1: 37, x2: 48, y2: 44, name: 'Sala de Distribuição' },
    becoCentral: { x1: 27, y1: 37, x2: 35, y2: 44, name: 'Beco Central' },
    camaraCapataz: { x1: 1, y1: 49, x2: 9, y2: 56, name: 'Câmara do Capataz' },
    depositoArmadilhado: { x1: 27, y1: 49, x2: 35, y2: 56, name: 'Depósito Armadilhado' },
    arsenalSecreto: { x1: 40, y1: 49, x2: 48, y2: 56, name: 'Arsenal Secreto' },
    becoSaida: { x1: 27, y1: 61, x2: 35, y2: 68, name: 'Beco de Saída' },
    cofreBarao: { x1: 40, y1: 61, x2: 48, y2: 68, name: 'Cofre do Barão' },
    salaoBarao: { x1: 53, y1: 58, x2: 74, y2: 68, name: 'Salão do Barão' }
  };

  for (const room of Object.values(rooms)) {
    carveRect(grid, room.x1, room.y1, room.x2, room.y2);
  }

  // Laço superior (ala esquerda): Cofre de Acesso -> Escada de Serviço ->
  // Beco dos Fundos -> Armaria Clandestina -> Depósito Alto -> Corredor
  // Minado -> Praça do Mercado — dá a volta e desce de novo perto de onde
  // começou, oferecendo um caminho alternativo (mais longo, com a lâmina e
  // uma armadilha) até o mesmo Cofre de Acesso alcançável pela Viela.
  carveRect(grid, 5, 8, 5, 13); // Escada de Serviço -> Beco dos Fundos
  carveRect(grid, 9, 4, 14, 4); // Beco dos Fundos -> Armaria Clandestina
  carveRect(grid, 22, 4, 27, 4); // Armaria Clandestina -> Depósito Alto
  carveRect(grid, 30, 8, 30, 13); // Depósito Alto -> Corredor Minado
  carveRect(grid, 30, 20, 30, 25); // Corredor Minado -> Praça do Mercado
  carveRect(grid, 5, 20, 5, 25); // Escada de Serviço -> Cofre de Acesso

  // Praça do Mercado (entrada) -> Cofre de Acesso, caminho curto direto.
  carveRect(grid, 9, 28, 14, 28); // Viela -> Praça do Mercado
  carveRect(grid, 22, 28, 27, 28); // Cofre de Acesso -> Viela

  // Praça do Mercado -> ala direita (linear): Fileira de Barracas -> Passagem
  // Lateral -> Barraca do Blindador -> Depósito da Barraca -> Corredor dos
  // Fundos -> Sala de Distribuição -> Beco Central -> Depósito Armadilhado.
  carveRect(grid, 35, 28, 40, 28); // Praça do Mercado -> Fileira de Barracas
  carveRect(grid, 48, 28, 53, 28); // Fileira de Barracas -> Passagem Lateral
  carveRect(grid, 61, 28, 66, 28); // Passagem Lateral -> Barraca do Blindador
  carveRect(grid, 70, 32, 70, 37); // Barraca do Blindador -> Depósito da Barraca
  carveRect(grid, 61, 40, 66, 40); // Depósito da Barraca -> Corredor dos Fundos
  carveRect(grid, 48, 40, 53, 40); // Corredor dos Fundos -> Sala de Distribuição
  carveRect(grid, 35, 40, 40, 40); // Sala de Distribuição -> Beco Central
  carveRect(grid, 30, 44, 30, 49); // Beco Central -> Depósito Armadilhado
  carveRect(grid, 44, 44, 44, 49); // Sala de Distribuição -> Arsenal Secreto
  carveRect(grid, 35, 52, 40, 52); // Depósito Armadilhado <- Arsenal Secreto

  // Cofre de Acesso -> (porta selada) -> Câmara do Capataz — corredor comprido
  // porque não há sala intermediária nessa coluna, igual ao desenho original.
  carveRect(grid, 5, 32, 5, 49);

  // Câmara do Capataz -> Beco de Saída (corredor comprido até a mesma coluna
  // do Depósito Armadilhado, depois desce pra convergir).
  carveRect(grid, 9, 52, 30, 52);
  carveRect(grid, 30, 52, 30, 56); // continua até o Depósito Armadilhado
  carveRect(grid, 30, 56, 30, 61); // Depósito Armadilhado -> Beco de Saída

  // Beco de Saída -> (porta selada) -> Cofre do Barão -> (porta selada) ->
  // Salão do Barão.
  carveRect(grid, 35, 64, 40, 64);
  carveRect(grid, 48, 64, 53, 64);

  // As 3 portas seladas começam fechadas — reabrem quando o respectivo
  // puzzle é resolvido (ver MercadoNegroScene._checkGate1/2/3). Cada uma é
  // uma única célula de corredor virando parede, mesma técnica do Portão dos
  // Trilhos (Fase 09) e da Câmara do Curador (Fase 05).
  grid[40][5] = '#'; // Cofre de Acesso -> Câmara do Capataz (gate 1, pós-Sequência)
  grid[46][44] = '#'; // Sala de Distribuição -> Arsenal Secreto (gate 2, pós-Circuito)
  grid[64][48] = '#'; // Cofre do Barão -> Salão do Barão (gate 3, pós-Sinal)
  // Saída da Câmara do Capataz — só reabre quando o Capataz for derrotado
  // (mesmo espírito do Guardião da Sinalização na Fase 09: o combate É a
  // trava, não só o puzzle que dá acesso à sala).
  grid[52][10] = '#';

  const markers = {
    S: [{ gx: 31, gy: 28 }],
    // Miliciano do Mercado — mercenário comum, 1-2 por sala de passagem.
    X: [
      { gx: 4, gy: 4 }, { gx: 7, gy: 6 }, // Beco dos Fundos
      { gx: 17, gy: 6 }, // Armaria Clandestina
      { gx: 31, gy: 5 }, // Depósito Alto
      { gx: 4, gy: 17 }, // Escada de Serviço
      { gx: 17, gy: 29 }, // Viela
      { gx: 43, gy: 29 }, // Fileira de Barracas
      { gx: 57, gy: 29 }, // Passagem Lateral
      { gx: 69, gy: 41 }, // Depósito da Barraca
      { gx: 57, gy: 41 }, // Corredor dos Fundos
      { gx: 43, gy: 41 } // Sala de Distribuição
    ],
    // Miliciano Blindado — reaproveita a silhueta "enemy_tank".
    T: [
      { gx: 31, gy: 3 }, // Depósito Alto
      { gx: 69, gy: 27 }, // Barraca do Blindador
      { gx: 45, gy: 39 } // Sala de Distribuição
    ],
    N: [
      { gx: 19, gy: 4 }, // Armaria Clandestina — refém 1
      { gx: 58, gy: 27 } // Passagem Lateral — refém 2
    ],
    I: [{ gx: 18, gy: 3 }], // Armaria Clandestina — arma
    A: [{ gx: 70, gy: 27 }], // Barraca do Blindador — armadura
    C: [{ gx: 44, gy: 51 }], // Arsenal Secreto — pistola
    H: [{ gx: 5, gy: 30 }, { gx: 44, gy: 27 }, { gx: 5, gy: 54 }], // kits médicos
    // Cofre de Acesso — 4 placas da Sala de Sequência.
    Q: [{ gx: 3, gy: 28 }, { gx: 7, gy: 28 }, { gx: 3, gy: 31 }, { gx: 7, gy: 31 }],
    // Sala de Distribuição — 5 células em cruz do puzzle de Circuito.
    K: [{ gx: 44, gy: 40 }, { gx: 44, gy: 38 }, { gx: 44, gy: 42 }, { gx: 42, gy: 40 }, { gx: 46, gy: 40 }],
    // Cofre do Barão — 4 painéis da Sala de Sinal.
    SG: [{ gx: 42, gy: 63 }, { gx: 46, gy: 63 }, { gx: 42, gy: 66 }, { gx: 46, gy: 66 }],
    // Armadilhas cíclicas (mesma mecânica do Arsenal Blindado) — uma no laço
    // superior, outra guardando o Depósito Armadilhado.
    D: [
      { gx: 30, gy: 15, phase: 0 }, { gx: 30, gy: 18, phase: 1 },
      { gx: 30, gy: 50, phase: 2 }, { gx: 33, gy: 53, phase: 0 }
    ],
    M: [{ gx: 5, gy: 52 }], // Câmara do Capataz — sub-chefe
    B: [{ gx: 65, gy: 63 }], // Salão do Barão — confronto final
    // Portas seladas (ver comentário acima de onde cada uma vira parede).
    L1: [{ gx: 5, gy: 40 }],
    L2: [{ gx: 44, gy: 46 }],
    L3: [{ gx: 48, gy: 64 }],
    L4: [{ gx: 10, gy: 52 }]
  };

  const zones = [
    { name: rooms.becoFundos.name, x1: 0, y1: 0, x2: 12, y2: 11 },
    { name: rooms.armariaClandestina.name, x1: 12, y1: 0, x2: 25, y2: 11 },
    { name: rooms.depositoAlto.name, x1: 25, y1: 0, x2: 38, y2: 22 },
    { name: rooms.escadaServico.name, x1: 0, y1: 11, x2: 12, y2: 23 },
    { name: rooms.corredorMinado.name, x1: 25, y1: 11, x2: 38, y2: 22 },
    { name: rooms.cofreAcesso.name, x1: 0, y1: 23, x2: 12, y2: 35 },
    { name: rooms.viela.name, x1: 12, y1: 23, x2: 25, y2: 35 },
    { name: rooms.pracaMercado.name, x1: 25, y1: 22, x2: 38, y2: 35 },
    { name: rooms.fileiraBarracas.name, x1: 38, y1: 23, x2: 51, y2: 35 },
    { name: rooms.passagemLateral.name, x1: 51, y1: 23, x2: 64, y2: 35 },
    { name: rooms.barracaBlindador.name, x1: 64, y1: 23, x2: WIDTH, y2: 35 },
    { name: rooms.depositoBarraca.name, x1: 64, y1: 35, x2: WIDTH, y2: 47 },
    { name: rooms.corredorFundos.name, x1: 51, y1: 35, x2: 64, y2: 47 },
    { name: rooms.salaDistribuicao.name, x1: 38, y1: 35, x2: 51, y2: 47 },
    { name: rooms.becoCentral.name, x1: 25, y1: 35, x2: 38, y2: 59 },
    { name: rooms.camaraCapataz.name, x1: 0, y1: 47, x2: 12, y2: HEIGHT },
    { name: rooms.depositoArmadilhado.name, x1: 25, y1: 47, x2: 38, y2: 59 },
    { name: rooms.arsenalSecreto.name, x1: 38, y1: 47, x2: 51, y2: 59 },
    { name: rooms.becoSaida.name, x1: 12, y1: 59, x2: 38, y2: HEIGHT },
    { name: rooms.cofreBarao.name, x1: 38, y1: 59, x2: 51, y2: HEIGHT },
    { name: rooms.salaoBarao.name, x1: 51, y1: 55, x2: WIDTH, y2: HEIGHT }
  ];

  return { grid, markers, zones, width: WIDTH, height: HEIGHT };
}
