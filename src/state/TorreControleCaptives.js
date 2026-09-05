// NPCs presos na Torre de Controle Logístico (Fase 16). Libertados aqui
// passam a aparecer no hub do Estaleiro Automatizado, igual os das fases
// anteriores da região.
export const TORRE_CONTROLE_CAPTIVES = [
  {
    id: 'tecnica_sequencia',
    name: 'Técnica de Sinalização',
    dungeonLines: [
      'Duas torres, um cartão pra cada: Oeste e Leste. Cada andar limpo sobe um nível — o terceiro só sobe resolvendo a sequência lá em cima.',
      'A sequência trava o caminho até o Operador Mestre. Pisar fora de ordem reinicia tudo — vá com calma.'
    ],
    townLines: [
      'Eu sinalizava a ordem certa da sequência pros técnicos novos. Ninguém mais vai precisar aprender isso agora.',
      'Se o Operador Mestre e a Guardiã de Tráfego caíram, o Cartão do Subsolo já deve estar liberado. O Regente não tem mais pra onde se esconder.'
    ]
  },
  {
    id: 'engenheira_circuito',
    name: 'Engenheira de Circuito',
    dungeonLines: [
      'O circuito lá no alto da Torre Leste é um apaga-liga: ativar uma célula também vira as vizinhas. As cinco precisam ficar acesas.',
      'Cada nível do cartão abre a porta do andar seguinte. Sem o nível certo, nem adianta empurrar — a passagem nem existe.'
    ],
    townLines: [
      'Eu mantinha o circuito da torre estável. Da última vez que vi, as luzes nunca ficavam todas acesas ao mesmo tempo.',
      'Com os dois — Operador e Guardiã — fora, o Subsolo da Torre deve estar aberto. O Regente não tem mais pra onde se esconder.'
    ]
  }
];
