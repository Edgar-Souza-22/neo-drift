// NPCs presos no Estaleiro Naval (Fase 15). Libertados aqui passam a
// aparecer no hub do Estaleiro Automatizado, igual os do Terminal e da
// Refinaria.
export const ESTALEIRO_NAVAL_CAPTIVES = [
  {
    id: 'tecnica_linha',
    name: 'Técnica de Linha',
    dungeonLines: [
      'Os braços não pensam — batem no mesmo ritmo desde que a fábrica ligou sozinha. Observa o ciclo antes de atravessar.',
      'Cada estação tem um painel. Limpa a sala, toca o painel, os braços daquela sala desligam pra sempre.'
    ],
    townLines: [
      'Eu calibrava os braços da Estação de Circuitos. Nunca vi um só parar por conta própria — até você chegar.',
      'Se O Supervisor caiu, a Sala de Controle deve estar em silêncio agora. Alívio estranho, depois de tanto barulho.'
    ]
  },
  {
    id: 'inspetor_armamento',
    name: 'Inspetor de Armamento',
    dungeonLines: [
      'Reconheço esses drones — Sentinela Elétrica, Inibidor, Atirador. Todos saíram desta linha, em algum lote.',
      'O Protótipo é o primeiro casco completo. Ainda preso nos cabos do guindaste, mas os braços dele já funcionam.'
    ],
    townLines: [
      'Eu testava a mira dos Drones Atiradores antes de saírem daqui. Nunca imaginei testar a de um casco inteiro.',
      'Com O Protótipo parado, a linha inteira perde o sentido. Só resta desmontar o que sobrou.'
    ]
  }
];
