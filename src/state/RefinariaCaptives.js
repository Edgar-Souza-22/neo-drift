// NPCs presos na Refinaria Offshore (Fase 14). Libertados aqui passam a
// aparecer no hub do Estaleiro Automatizado, igual os do Terminal.
export const REFINARIA_CAPTIVES = [
  {
    id: 'bombeiro_plataforma',
    name: 'Bombeiro de Plataforma',
    dungeonLines: [
      'As pontes daqui não são de verdade — são placas soltas sobre o mar. De vez em quando uma racha e afunda sozinha, some por uns segundos.',
      'Se cair na água, não entra em pânico: você reaparece no último trecho firme em que pisou. Machuca, mas não é queda sem volta.'
    ],
    townLines: [
      'Trabalhei quinze anos nessa plataforma sem nunca molhar a bota. Nas últimas semanas, mais que o normal.',
      'Se O Guincheiro caiu, a ponte até o Núcleo já deve estar construída. Sem ele, era só um vão sobre o mar.'
    ]
  },
  {
    id: 'operadora_bombeamento',
    name: 'Operadora de Bombeamento',
    dungeonLines: [
      'Os operários de convés não perseguem rápido, mas o aríete deles empurra longe. Perto da borda, isso te joga no mar.',
      'O Console Estabilizador fica com O Guincheiro. É o único guardião da única ponte até o Núcleo — derrota ele e ela é construída.'
    ],
    townLines: [
      'Eu cuidava das bombas daqui. A Perfuratriz nunca devia ter chegado tão perto da borda da plataforma.',
      'Com ela parada, o convés inteiro volta a ser só aço e água — nada além disso.'
    ]
  }
];
