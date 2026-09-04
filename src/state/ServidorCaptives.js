// NPCs presos no Servidor Oculto (Fase 12). Como toda fase do Submundo, os
// libertados aqui passam a aparecer no hub — o Submundo.
export const SERVIDOR_CAPTIVES = [
  {
    id: 'tecnica_rede',
    name: 'Técnica de Rede',
    dungeonLines: [
      'A Sala de Cabeamento não liga por ordem — liga por caminho. Gira o segmento até o sinal sair do IN e chegar no OUT.',
      'O Corredor Frio varre uma linha de pico de vez em quando. Não é o piso que queima: é a varredura que passa.'
    ],
    townLines: [
      'Obrigada. Eu estava trancada no arquivo morto há tanto tempo que já não sabia se o Submundo ainda existia.',
      'Se o Administrador caiu, os logs do contrabando ficam sem dono. Alguém nas docas vai sentir falta.'
    ]
  },
  {
    id: 'analista_trafego',
    name: 'Analista de Tráfego',
    dungeonLines: [
      'Na sala leste o alvo fica em cima. Pise num plugue de baixo pra trocar com o vizinho até cada cor encostar na de cima.',
      'O Administrador não é do mercado. Ele roteia cada carga daqui — e quem pede o relatório não mora embaixo.'
    ],
    townLines: [
      'Eu vi os manifestos. O Barão cobrava aluguel; quem comprava a rota era a Neo, do outro lado das docas.',
      'Se você descer mais, não é mais túnel. É porto. E o porto não pede licença pra existir.'
    ]
  }
];
