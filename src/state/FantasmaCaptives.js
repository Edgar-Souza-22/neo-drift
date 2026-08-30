// NPCs presos na Estação Fantasma (Fase 09). Assim como as fases do
// Distrito Neon, os libertados aqui passam a aparecer no hub — o Submundo,
// não o Distrito Neon.
export const FANTASMA_CAPTIVES = [
  {
    id: 'bilheteira_fantasma',
    name: 'Bilheteira',
    dungeonLines: [
      'Os Moradores dos Túneis não atacam de longe — eles fecham distância rápido. Não deixe encurralar.',
      'O painel de sinalização é manual de propósito. Alguém não queria que fosse fácil de automatizar.'
    ],
    townLines: [
      'Vendi passagem pra um trem que não sai daqui há anos.',
      'O Submundo é mais organizado do que a superfície pensa.'
    ]
  },
  {
    id: 'guarda_linha',
    name: 'Guarda de Linha',
    dungeonLines: [
      'O Guardião da Sinalização não larga o cartão fácil. Depois que ele cair, a Sala de Desvio vale a visita.',
      'Ninguém nunca me disse quem construiu a Estação Fantasma. Só que ela já estava aqui quando o Submundo começou a ser usado.'
    ],
    townLines: [
      'Obrigado por atravessar aquele trem sem trilho pra sair.',
      'O Mercado Negro dos Túneis fica logo mais fundo — vá com cuidado com o que aceitar comprar.'
    ]
  }
];
