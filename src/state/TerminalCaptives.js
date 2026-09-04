// NPCs presos no Terminal de Contêineres (Fase 13). Libertados aqui passam
// a aparecer no hub do Estaleiro Automatizado, não no Submundo.
export const TERMINAL_CAPTIVES = [
  {
    id: 'conferente_carga',
    name: 'Conferente de Carga',
    dungeonLines: [
      'A Ponte é levadiça: três pranchas levantadas sobre o fosso. Cada pedal gira a prancha em frente dele.',
      'Deite as três ao mesmo tempo e a fileira fecha — aí é só atravessar até a Câmara. Não é ordem, é alinhamento.'
    ],
    townLines: [
      'Obrigado. Eu conferia manifesto há tanto tempo que já não via o cais de fora das pilhas.',
      'Se o Empilhador caiu, as rotas param de circular sozinhas. A Contramestra vai querer saber.'
    ]
  },
  {
    id: 'operadora_patio',
    name: 'Operadora de Pátio',
    dungeonLines: [
      'O guindaste está solto — larga contêiner no pátio sozinho. Some com isso puxando a chave na Cabine de Comando, a leste.',
      'Os drones de carga não te perseguem. Eles só repetem a avenida. Cruza fora do tempo e eles passam por cima.',
      'A Sala do Guindaste tem seis estivadores grandes de guarda. A Cabine na frente trava com as travas de segurança — cada uma puxa a seguinte.',
      'O Empilhador marca o chão onde você ESTÁ, não pra onde vai. Sai do quadrado antes do contêiner cair — ele fica um tempo no caminho.'
    ],
    townLines: [
      'Eu operava a ponte daqui. Sem o Empilhador, o pátio fica mudo — e o próximo berço ainda fuma no meio do cais.',
      'A Refinaria não abre por causa disso. Alguém mais acima ainda segura o portão.'
    ]
  }
];
