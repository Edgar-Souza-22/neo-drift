// NPCs presos no Núcleo de Comando (Fase 04). Mesmo padrão de Captives.js —
// libertados ao derrotar o chefe da fase, passam a aparecer na Ala Central.
export const CORE_CAPTIVES = [
  {
    id: 'analista',
    name: 'Analista Presa',
    dungeonLines: [
      'O sistema de segurança virou contra a gente assim que o núcleo foi corrompido.',
      'Tem três torres de firewall espalhadas — só dá pra acessar a câmara central depois de hackear todas.'
    ],
    townLines: [
      'Ainda estou processando os logs de tudo que vi lá dentro.',
      'Obrigada por desligar aquilo antes que se espalhasse pro resto da fábrica.'
    ]
  },
  {
    id: 'tecnico_rede',
    name: 'Técnico de Rede Preso',
    dungeonLines: [
      'Os drones inibidores travam sua pistola por alguns segundos — fique de olho no pulso deles.',
      'Não sei mais dizer se a Vigia Central é um programa ou já virou outra coisa.'
    ],
    townLines: [
      'Vou recomendar uma auditoria completa nesses sistemas antes de reativar qualquer coisa.',
      'Espero nunca mais ver aquele "olho" me encarando de novo.'
    ]
  }
];
