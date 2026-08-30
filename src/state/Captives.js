// NPCs presos no Setor de Contenção. Ao derrotar o Guardião Núcleo, todos os
// capturados daquele setor são libertados e passam a aparecer na Ala Central
// (ver GameState.rescuedNpcs + TownScene).
export const CAPTIVES = [
  {
    id: 'tecnico',
    name: 'Técnico Preso',
    dungeonLines: [
      'Obrigado por vir... o núcleo de contenção enlouqueceu os drones.',
      'Há uma lâmina de plasma na sala ao lado. Pode ser útil.'
    ],
    townLines: [
      'Finalmente posso ver o sol de novo. Obrigado.',
      'O núcleo estabilizou desde que o guardião caiu.'
    ]
  },
  {
    id: 'colona',
    name: 'Colona Resgatada',
    dungeonLines: [
      'Fiquei presa aqui quando os drones enlouqueceram na Vigilância.',
      'Se conseguir chegar ao Núcleo, tome cuidado com o guardião — ele atira à distância.'
    ],
    townLines: [
      'Voltar pra casa foi a melhor sensação em semanas.',
      'Diga se precisar de ajuda por aqui — devo essa a você.'
    ]
  }
];
