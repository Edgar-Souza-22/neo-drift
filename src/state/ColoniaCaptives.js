// NPCs presos na Colônia de Contaminados (Fase 11). Como toda fase do
// Submundo, os libertados aqui passam a aparecer no hub — o Submundo.
export const COLONIA_CAPTIVES = [
  {
    id: 'medica_colonia',
    name: 'Médica da Colônia',
    dungeonLines: [
      'O piso verde não queima na hora — ele fica na pele. Sem o traje do Depósito de Antídotos, cada passo cobra depois.',
      'O Enfermeiro trancou a saída da Câmara do Hospedeiro. Ele ainda acha que está "tratando" a gente.'
    ],
    townLines: [
      'Obrigada. Eu não aguentava mais o cheiro daquele ninho.',
      'Se o traje selou, o piso para de cobrar. Guarda ele — tem mais mancha por aí embaixo.'
    ]
  },
  {
    id: 'paciente_isolado',
    name: 'Paciente Isolado',
    dungeonLines: [
      'A Sala de Isolamento é um jogo de pares. Errou o par, as placas apagam. Não tem número escrito — é memória.',
      'A Matriarca cospe um charco que fica no chão. Não é um golpe que passa: é um lugar que você não pode mais pisar.'
    ],
    townLines: [
      'Eu ainda sinto o gosto metálico. Mas pelo menos o ar da caverna não lateja.',
      'Dizem que o próximo túnel esconde um servidor. Eu não vou. Já cheguei longe demais.'
    ]
  }
];
