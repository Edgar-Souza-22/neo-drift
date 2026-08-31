// NPCs presos no Mercado Negro dos Túneis (Fase 10). Como toda fase do
// Submundo, os libertados aqui passam a aparecer no hub — o Submundo, não o
// Distrito Neon nem a Ala Central.
export const MERCADO_NEGRO_CAPTIVES = [
  {
    id: 'artesa_armaria',
    name: 'Artesã da Armaria',
    dungeonLines: [
      'O Corredor Minado só ativa depois que você entra — não tem como ver a armadilha de fora.',
      'O Barão cobra "aluguel" de todo mundo aqui embaixo. Eu só queria vender minhas peças em paz.'
    ],
    townLines: [
      'Obrigada por não deixar o Capataz me vender pro Barão.',
      'Ainda tenho pesadelo com aquele braço mecânico dele.'
    ]
  },
  {
    id: 'negociante_passagem',
    name: 'Negociante da Passagem Lateral',
    dungeonLines: [
      'O Arsenal Secreto fica trancado até alguém destravar a distribuição — o Barão não confia em ninguém com uma arma solta.',
      'Se o Capataz cair, a passagem pros fundos abre. Ele é o único com a chave de verdade.'
    ],
    townLines: [
      'O Mercado só existia porque o Barão garantia "proteção". Agora é só um túnel vazio.',
      'Espero que ele tenha levado esse braço mecânico pro inferno com ele.'
    ]
  }
];
