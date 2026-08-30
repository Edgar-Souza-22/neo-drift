// NPCs presos na Ala do Reator (Fase 03). Mesmo padrão de Captives.js —
// libertados ao derrotar o chefe da fase, passam a aparecer na Ala Central.
export const REACTOR_CAPTIVES = [
  {
    id: 'tecnica',
    name: 'Técnica Presa',
    dungeonLines: [
      'Cuidado com o piso na Câmara de Alta Tensão — ele descarrega em quem passa.',
      'Só vi isso parar de doer depois que peguei uma blindagem isolante, mas está trancada no cofre.'
    ],
    townLines: [
      'Ainda sinto o formigamento nos pés, semanas depois.',
      'Obrigada por atravessar aquele piso por mim.'
    ]
  },
  {
    id: 'operario_reator',
    name: 'Operário Preso',
    dungeonLines: [
      'Um semi-boss ocupou o Depósito de Bobinas — ele carrega o cartão do cofre.',
      'O que está no núcleo do reator... aquilo não é mais uma máquina normal.'
    ],
    townLines: [
      'Vou pedir transferência pra longe de qualquer coisa com "reator" no nome.',
      'A Neo Industries te deve mais que um obrigado por isso.'
    ]
  }
];
