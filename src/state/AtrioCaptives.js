// NPCs presos no Átrio Executivo (Fase 17). Libertados aqui passam a
// aparecer na Praça da Matriz, o hub da Região 5 — mesmo padrão de todas as
// regiões anteriores.
export const ATRIO_CAPTIVES = [
  {
    id: 'reporter_atrio',
    name: 'Repórter Investigativa',
    dungeonLines: [
      'Me trouxeram pra "uma entrevista" e nunca me deixaram sair. A recepção é bonita, mas ninguém atravessa as catracas sem crachá.',
      'Os seguranças daqui não são drones remendados como lá fora. Aquele escudo aguenta qualquer coisa de frente — de frente.'
    ],
    townLines: [
      'Passei meses tentando publicar o que a Neo Industries faz com o Distrito Neon. A resposta deles foi me convidar pro átrio.',
      'Tudo que você viu lá dentro foi decidido em algum andar acima. E ainda tem muito andar acima.'
    ]
  },
  {
    id: 'auditor_atrio',
    name: 'Auditor Interno',
    dungeonLines: [
      'Eu auditava os contratos do porto. Quando os números do Estaleiro pararam de fechar, virei "visitante" permanente.',
      'O elevador executivo só destrava quando o Concierge sai da frente. E ele não sai por educação.'
    ],
    townLines: [
      'Assinei os repasses do Estaleiro Automatizado sem saber o que estava financiando. Descobri tarde demais.',
      'A Diretora de Segurança respondia a alguém. Nunca vi o nome escrito — só o andar.'
    ]
  }
];
