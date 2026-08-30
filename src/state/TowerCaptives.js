// NPCs presos na Torre de Segurança (Fase 05). Diferente das fases da
// fábrica, os libertados aqui passam a aparecer no Distrito Neon (o hub da
// cidade), não na Ala Central — fazem parte da vida do distrito, não da
// fábrica.
export const TOWER_CAPTIVES = [
  {
    id: 'curadora_assistente',
    name: 'Curadora Assistente',
    dungeonLines: [
      'A câmara principal não abre à força. A torre testa quem entra antes de deixar passar.',
      'O Curador Supremo teleporta pra perto de quem estiver na sala. Não fique parado depois que ele reaparecer.'
    ],
    townLines: [
      'Passei anos catalogando peças que nunca vi de novo depois que fui trancada aqui.',
      'O distrito deve estar diferente. Obrigada por me tirar de lá.'
    ]
  },
  {
    id: 'guarda_torre',
    name: 'Guarda da Torre',
    dungeonLines: [
      'Os drones atiradores têm alcance — não corra em linha reta na frente deles.',
      'Essa torre guarda mais segredos do que o distrito imagina.'
    ],
    townLines: [
      'Vou pedir uma cerveja quente no primeiro bar que achar aberto.',
      'Obrigado por não desistir lá dentro.'
    ]
  }
];
