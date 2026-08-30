// NPCs presos na Ala de Fundição (Fase 02). Mesmo padrão de Captives.js —
// libertados ao derrotar o chefe da fase, passam a aparecer na Ala Central.
export const FOUNDRY_CAPTIVES = [
  {
    id: 'operaria',
    name: 'Operária Presa',
    dungeonLines: [
      'As fornalhas enlouqueceram assim que o núcleo de fundição instabilizou.',
      'Tem um kit médico na Sala de Resfriamento, se precisar.'
    ],
    townLines: [
      'Nunca mais quero ver uma fornalha de perto.',
      'Obrigada por nos tirar de lá.'
    ]
  },
  {
    id: 'supervisor',
    name: 'Supervisor Preso',
    dungeonLines: [
      'Fui bloqueado na sala principal quando os drones da fundição se rebelaram.',
      'Tem um cofre trancado aqui — precisa do cartão que o blindado carrega.'
    ],
    townLines: [
      'Vou recomendar você pra supervisão da próxima ala, se quiser.',
      'A Neo Industries deveria estar pagando hazard pay por isso.'
    ]
  }
];
