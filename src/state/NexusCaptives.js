// NPCs presos no Nexo de Transporte (Fase 07). Assim como os das fases
// anteriores, os libertados aqui passam a aparecer no Distrito Neon.
export const NEXUS_CAPTIVES = [
  {
    id: 'tecnica_reles',
    name: 'Técnica de Relés',
    dungeonLines: [
      'Os portais fixos só funcionam nos dois sentidos — se achar um pad sozinho, tem um par dele em algum lugar do mapa.',
      'O pad instável da Câmara Instável cicla sozinho entre três destinos. Espere a cor certa antes de pisar.'
    ],
    townLines: [
      'Passei anos calibrando pares de portal pra gente que nunca ia poder usá-los.',
      'O Distrito parece pequeno depois do Nexo. De um jeito bom, pra variar.'
    ]
  },
  {
    id: 'sincronizador_rogue',
    name: 'Sincronizador Rogue',
    dungeonLines: [
      'O Guardião do Nexo pisca pra flanquear e chama reforços por portal — não deixa ele escolher a distância sozinho.',
      'O Roteador não persegue. Ele ancora, atira em leque e some de novo. Aproveite a janela logo depois do teleporte dele.'
    ],
    townLines: [
      'Não vou sentir falta do zumbido dos pads instáveis.',
      'Obrigado por sincronizar o portal certo, pra variar.'
    ]
  }
];
