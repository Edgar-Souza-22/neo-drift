# Neo Drift — Fases 01 a 05

Protótipo de action RPG top-down, pixel art, ambientação retro-futurista — inspirado em **Soul Blazer** (SNES) no loop de jogo e em **Hyper Light Drifter**/mockups de nave sci-fi na atmosfera visual (vinheta, poças de luz, piso com faixa de risco): o protagonista trabalha numa fábrica industrial, começando na **Ala Central** (hub) entre incursões pelas alas fabris com inimigos e chefe, progressão de nível/equipamento, e repovoamento da Ala Central conforme você resgata NPCs. A partir da Fase 05, a história sai da fábrica e vai pra cidade, através de um teleporte até o **Distrito Neon** — um segundo hub, menor, fora dos portões da fábrica. Construído com Phaser 3 + Vite. Todos os assets visuais (personagens, inimigos, tiles, HUD, itens, props de cenário) **e sonoros** (efeitos e trilhas) são gerados em código — pixel art desenhada pixel a pixel com contorno automático (`src/scenes/pixelGrid.js`) ou via gradientes de canvas pra luz/vinheta, e áudio sintetizado amostra a amostra via Web Audio (`src/audio/synth.js`) — sem depender de nenhum arquivo externo (imagem ou som).

## Rodar o jogo

```bash
npm install
npm run dev
```

Abre automaticamente em `http://localhost:5173`.

## Controles

- **WASD / Setas**: mover (top-down, sem inclinação isométrica; o personagem vira nas 4 direções)
- **Espaço / Clique**: atacar corpo a corpo, ou falar com um NPC próximo
- **F / Clique direito**: atirar com a Pistola de Pulso (precisa achá-la e ter munição)
- **ESC**: abrir/fechar o menu de status (nível, XP, HP, equipamento com estatística de cada peça e itens-chave) — pausa o jogo enquanto aberto
- **P**: pausar/despausar — mais leve que o status, só escurece a tela e mostra "PAUSADO", sem abrir o inventário. ESC e P nunca ficam abertos ao mesmo tempo (uma tecla fecha o que a outra abriu, em vez de empilhar)
- **M**: liga/desliga o som (efeitos e música) — a preferência fica salva entre sessões

## Loop de jogo

1. Na tela inicial, **Novo Jogo** mostra a história e deixa você na **Ala Central** da fábrica; **Continuar** retoma o progresso salvo no hub da região atual (Ala Central / Distrito Neon / Submundo / Estaleiro), com HP cheio. O salão é bem maior, com pilares estruturais, piso variado (painéis, luminárias embutidas) e o **logo da Neo Industries** carimbado no chão — com NPCs que dão contexto da missão.
2. Ande até o portal "SETOR DE CONTENÇÃO" para entrar no setor de combate (Fase 01) — a entrada toca uma transição (flash + fade pra preto).
3. O setor tem 6 salas conectadas por corredores — **Vestíbulo**, **Câmara de Detenção**, **Sala de Energia**, **Corredor de Vigilância**, **Núcleo de Contenção** e o **Cofre Selado** — cada uma com nome exibido ao entrar.
4. Elimine os 8 drones (incluindo 2 unidades blindadas mais resistentes), converse com os 2 NPCs presos, pegue a **Lâmina de Plasma** (upgrade de dano) e a **Blindagem Reforçada** (upgrade de HP máximo) — 1 melhoria de cada tipo nessa fase. Drones normais têm 1/10 de chance de derrubar munição ao morrer, blindados 1/5, e o chefe sempre derruba pelo menos 1 carga (1/3 de chance de derrubar 3).
5. O **Cofre Selado** fica trancado até você derrotar o blindado da Sala de Energia, que derruba um **Cartão de Acesso** — leve-o até a porta trancada (Vestíbulo) para destrancá-la e pegar a **Pistola de Pulso** (a primeira arma de longo alcance do jogo, munição limitada), a recompensa do cofre.
6. Derrote o **Guardião Núcleo** — chefe com ataque à distância e fase de fúria abaixo de 35% de HP (fica mais rápido, bate mais forte e atira mais rápido).
7. Ao vencer, uma porta "ALA CENTRAL ←" aparece na sala do chefe — ande até ela (mesma transição de flash + fade) para voltar. Nível, HP, equipamento **e os NPCs resgatados persistem** entre as cenas, e os NPCs libertados passam a aparecer fisicamente na Ala Central, com diálogo novo.
8. De volta à Ala Central, o **Coordenador Voss** aparece avisando sobre atividade anômala na **Ala de Fundição** e libera uma nova porta (mesma transição de flash + fade, tingida em âmbar) — a entrada da Fase 02.
9. A **Ala de Fundição** é cerca de **5x maior** que o Setor de Contenção (884 tiles de piso, contra ~197 da Fase 01), com 10 salas nomeadas — **Entrada da Fundição**, **Corredor de Fornalhas**, **Depósito de Minério**, **Sala de Fundição Primária**, **Sala de Resfriamento**, **Corredor de Transporte**, **Sala de Fundição Secundária**, **Cofre da Fundição**, **Câmara de Resíduos** e **Núcleo da Fundição**. Tem 20 inimigos (incluindo blindados), 2 NPCs presos (Operária e Supervisor), 1 melhoria de cada tipo de novo — a **Lâmina Vulcânica** (upgrade de dano sobre a Lâmina de Plasma) e a **Blindagem Térmica** (upgrade de HP máximo) espalhadas pela fase, e a **Pistola Sísmica** (upgrade de dano da pistola) no **Cofre da Fundição**, com o mesmo esquema de cartão/porta trancada (agora numa sala diferente) — e **2 kits médicos** espalhados pelo mapa, cada um recupera 50 HP (sem passar do HP máximo).
10. A experiência necessária para subir de nível **nunca se repete**: cada novo nível exige pelo menos 15 XP a mais que o anterior (ou +35%, o que for maior), então o custo sobe de forma estritamente crescente por toda a progressão.
11. Derrote o **Fundidor Primordial**, o chefe da Fase 02 — silhueta e combate próprios, bem diferentes do Guardião Núcleo: corpo largo de fornalha com chaminés gêmeas e punhos-tambor (em vez da base em cruz com canhões de ombro), e em vez de bolts homing ele mira e trava a direção do jogador, telegrafa por 0.5s com uma linha vermelha fina, e dispara uma **rajada vermelha sólida que dura exatamente 0.5s** — fica parado (vulnerável a golpes corpo a corpo) enquanto mira e dispara. Ao vencer, a mesma porta de retorno com transição leva de volta à Ala Central, onde o Coordenador Voss agradece e os NPCs resgatados passam a habitar o hub.
12. De volta à Ala Central, o Coordenador Voss avisa sobre a **Ala do Reator** e libera uma terceira porta (transição tingida em ciano) — a entrada da Fase 03.
13. A **Ala do Reator** é a maior fase até agora — 1.358 tiles de piso, contra 884 da Fase 02 —, com 10 salas nomeadas (**Entrada do Reator**, **Corredor de Transmissão**, **Sala de Capacitores**, **Sala de Turbinas**, **Câmara de Alta Tensão**, **Corredor de Distribuição**, **Depósito de Bobinas**, **Cofre do Reator**, **Contenção Secundária** e **Núcleo do Reator**). Introduz a **Sentinela Elétrica** — inimigo novo que, além de perseguir/bater por contato, emite periodicamente um pulso de choque em área (um anel que se expande e machuca quem estiver perto quando termina).
14. Partes do piso ficam **eletrificadas** (padrão xadrez, visual crepitante cyan/branco) — pisar nelas causa dano contínuo enquanto o jogador não tiver a **Blindagem Isolante**. Ela fica no **Cofre do Reator**, trancado, guardado por um **semi-boss** (o "Guardião das Bobinas", um blindado de elite com nome e barra de HP próprios) que carrega o cartão de acesso — derrote-o, pegue o cartão, destranque a porta. Depois de equipar a blindagem, o piso eletrificado **para de causar dano pelo resto do jogo**, inclusive no piso eletrificado que cerca a arena do chefe.
15. Derrote o **Titã Voltaico** — chefe com referência total à eletricidade: núcleo flutuante sem pernas (em vez da base tipo tanque dos outros dois chefes), "chifres" de bobina de Tesla no topo, e um ataque próprio: em vez de ficar parado ou atirar na direção do jogador, ele **continua perseguindo e batendo corpo a corpo o tempo todo** enquanto marca a posição atual do jogador com um anel de aviso — depois de ~0.7s, um raio cai ali, causando dano em área a quem não tiver saído do lugar. Na fúria (abaixo de 35% HP), caem dois raios simultâneos. Ao vencer, mesma porta/transição de volta à Ala Central.
16. De volta à Ala Central, o Coordenador Voss avisa que o **Núcleo de Comando** parou de responder aos protocolos e libera uma quarta porta (transição tingida em violeta) — a entrada da Fase 04.
17. O **Núcleo de Comando** (1.417 tiles de piso) usa um mecanismo estrutural **diferente das três fases anteriores**: em vez de um único cofre trancado, há **3 Torres de Firewall** espalhadas por salas distintas (**Firewall Norte**, **Firewall Leste**, **Firewall Sul**) — cada uma "hackeia" sozinha ao se aproximar, sem precisar limpar a sala primeiro (embora venha guardada). A única entrada da **Núcleo Central** (sala do chefe) começa selada e só abre quando as **3 torres** tiverem sido hackeadas — o HUD mostra o progresso ("SELADA 2/3") na própria porta. As outras 7 salas são **Entrada do Núcleo**, **Sala de Servidores**, **Central de Câmeras**, **Sala de Diagnóstico**, **Corredor de Manutenção** e **Câmara de Contenção Digital**.
18. Introduz o **Drone Inibidor** — inimigo novo cujo pulso EMP não causa dano: em vez disso, **trava a pistola do jogador por alguns segundos** se acertar, forçando um respiro do combate à distância em vez de ferir (diferente do pulso de dano da Sentinela Elétrica). Pegue a **Lâmina de Silício**, a **Pistola Neural** e a **Blindagem Adaptativa** — todas encontradas normalmente pelo mapa, sem cofre.
19. Derrote o **Vigia Central** — chefe sem ataque à distância próprio: em vez disso, invoca periodicamente **Sentinelas de Defesa** (turrets fracas e estacionárias, inimigos de verdade que entram na contagem normal de inimigos restantes) enquanto continua perseguindo e batendo corpo a corpo — obriga a dividir atenção entre o chefe e os adds em vez de só desviar de um telegraph. Na fúria, invoca mais rápido e em dobro. Ao vencer, mesma porta/transição de volta à Ala Central.
20. De volta à Ala Central, a **Emissária Kess** aparece — uma NPC visivelmente diferente das outras (mais alta, capuz, brilho pulsante sob os pés) — avisando que a fábrica está limpa, mas o **Distrito Neon**, na cidade, também precisa de ajuda. A chegada dela já abre um **portal de teleporte** ao lado (anéis concêntricos girando, não uma porta retangular) — entrar nele dispara uma transição própria (zoom + flash colorido) diferente da transição "porta" das fases anteriores.
21. O **Distrito Neon** é um hub menor e diferente da Ala Central — chão de asfalto molhado com poças refletindo neon, quiosques, 2 NPCs locais e um clima "lounge" na trilha sonora. De lá, um portal sempre disponível leva de volta à Ala Central, e uma porta leva à **Torre de Segurança** (Fase 05). NPCs resgatados na Fase 05 passam a aparecer aqui, não na Ala Central — são moradores do distrito, não da fábrica.
22. A **Torre de Segurança** (1.418 tiles de piso) troca o mecanismo de bloqueio mais uma vez: em vez de combate (torres/semi-boss), a única entrada da **Câmara do Curador** (sala do chefe) só abre depois de **dois quebra-cabeças reais** serem resolvidos, em salas dedicadas e livres de inimigos:
    - **Sala de Sequência**: 4 placas numeradas — pisar fora de ordem reinicia o progresso.
    - **Sala de Circuito**: um puzzle "apaga-liga" de 5 células em cruz — ativar uma célula também alterna as vizinhas; objetivo é acender todas as 5.
23. Introduz o **Drone Atirador** — o primeiro inimigo comum (não-chefe) do jogo com ataque à distância: dispara um projétil lento na direção do jogador, além do ataque por contato normal. Pegue a **Lâmina Prismática**, a **Pistola de Precisão** e a **Blindagem do Curador** — todas encontradas normalmente pelo mapa.
24. Derrote o **Curador Supremo** — chefe que **teleporta** periodicamente pra perto do jogador (some, reaparece, telegrafa por um instante) e libera uma explosão corpo a corpo em área — o quinto padrão de chefe do jogo, e o único que muda de posição de repente em vez de atacar de um lugar fixo. Ao vencer, mesma porta/transição de volta ao Distrito Neon (não à Ala Central).
25. Se morrer, é game over — pressione F5 pra voltar à tela inicial e usar **Continuar** a partir do último progresso salvo (ver seção de save/load abaixo).

## Save/load

O progresso é salvo automaticamente no `localStorage` do navegador — não existe um botão de "salvar": toda vez que você ganha XP, sobe de nível, equipa arma/armadura/pistola, resgata um NPC ou pega um item-chave, o jogo grava o estado. Não precisa fazer nada de especial, incluindo depois de um game over — o último progresso salvo (nível, equipamento, fases limpas) sempre fica gravado.

- **Ao abrir/recarregar a página**: a tela inicial oferece **Novo Jogo** e **Continuar**. Continuar só fica disponível se existir um save — carrega o progresso e retoma no **hub da região atual** (Ala Central, Distrito Neon, Submundo ou Estaleiro Automatizado, conforme a última região desbloqueada — ver `regionHubScene` em `GameState.js`), com **HP cheio**, nunca no meio de uma masmorra. O subtítulo do botão mostra o nível e a região. Novo Jogo apaga o save (pede confirmação se já houver progresso), mostra a introdução e começa na Ala Central.
- **O que é salvo**: nível, XP, HP máximo, arma/armadura/pistola equipadas (com as estatísticas), munição, fases limpas, NPCs resgatados e itens-chave coletados. O que **não** é salvo (não faz sentido persistir): posição exata dentro de uma fase, inimigos já derrotados numa run em andamento, estado de portas trancadas de uma visita ativa — tudo isso é reconstruído do zero sempre que você entra numa fase, a partir das flags de "fase limpa"/"item já coletado".
- **Para reiniciar o progresso do zero**: use **Novo Jogo** na tela inicial (confirma antes de apagar o save). Também dá pra abrir o console do navegador (F12) e rodar:
  ```js
  const mod = await import('/src/state/GameState.js');
  mod.resetGame();
  ```
  Isso apaga o save e zera o estado em memória na hora — não precisa nem recarregar a página.

## Som

Efeitos sonoros e trilhas são **sintetizados em código** (osciladores + ruído filtrado, sem nenhum arquivo `.mp3`/`.wav`), no mesmo espírito "tudo gerado" da pixel art — gerados uma vez no boot e tocados via o sistema de áudio do Phaser.

- **Efeitos**: ataque corpo a corpo/pistola, acerto/morte de inimigo (variações pra inimigo comum, semi-boss e chefe), dano no jogador, coleta de item, level up, abrir porta, abrir/fechar menu, diálogo, fúria de chefe, vitória de fase, game over.
- **Música**: uma trilha em loop por área — **Ala Central** (calma), **Setor de Contenção**, **Ala de Fundição**, **Ala do Reator**, **Núcleo de Comando** (intervalos dissonantes, sugerindo sinal corrompido), **Distrito Neon** (lento, clima "lounge" noturno, ondas suaves), **Torre de Segurança** (andamento "limpo"/regular, tema de cofre), **Colônia de Contaminados** (viscoso), **Servidor Oculto** (clock digital de rack), **Estaleiro Automatizado** (hidráulica de guindaste) e **Terminal de Contêineres** (pátio, apito de guindaste) — trocada automaticamente ao entrar em cada cena, sem interrupção perceptível.
- **Mudo (M)**: preferência salva separadamente do progresso do jogo (chave própria no `localStorage`), então persiste entre sessões independente de ter ou não uma partida salva.
- Por política dos navegadores, o áudio só é liberado após a primeira interação (tecla/clique) — isso é comportamento padrão do browser, não um bug.

## Progressão de equipamento

Cada fase entrega exatamente **1 melhoria de cada tipo**: 1 lâmina (dano de ataque corpo a corpo), 1 upgrade de pistola (dano à distância) e 1 armadura (HP máximo). Nas três primeiras fases a pistola é a recompensa do cofre/vault trancado; a Fase 04 não tem cofre único (ver mecanismo das 3 torres acima), então os três itens são encontrados normalmente pelo mapa. Além disso, a **primeira fase de cada região** entrega as **Botas de Impulso** (multiplicador de velocidade de deslocamento, nunca regride): Fase 01 `×1.15`, Fase 05 `×1.25`, Fase 09 `×1.35`, Fase 13 `×1.45`. O menu de status (ESC) mostra a estatística real de cada peça equipada, não só o nome:

| Fase | Lâmina | Pistola | Armadura |
|------|--------|---------|----------|
| 01 — Setor de Contenção | Lâmina de Plasma (dano 35) | Pistola de Pulso (dano 18) — primeira aquisição, recompensa do cofre | Blindagem Reforçada (+40 HP máx.) |
| 02 — Ala de Fundição | Lâmina Vulcânica (dano 65) | Pistola Sísmica (dano 30) — upgrade, recompensa do cofre | Blindagem Térmica (+55 HP máx.) |
| 03 — Ala do Reator | Lâmina Voltaica (dano 90) | Pistola de Indução (dano 42) | Blindagem Isolante (+70 HP máx.) — recompensa do cofre, também dá imunidade ao piso eletrificado |
| 04 — Núcleo de Comando | Lâmina de Silício (dano 120) | Pistola Neural (dano 58) | Blindagem Adaptativa (+85 HP máx.) |
| 05 — Torre de Segurança | Lâmina Prismática (dano 150) | Pistola de Precisão (dano 72) | Blindagem do Curador (+100 HP máx.) |
| 06 — Arsenal Blindado | Lâmina de Titânio (dano 160) | Railgun de Sobrecarga (dano 60) | Blindagem de Combate (+110 HP máx.) |
| 07 — Nexo de Transporte | Lâmina Sincronizada (dano 190) | Carregador de Fase (dano 78) | Blindagem de Sincronia (+130 HP máx.) |
| 08 — Central de Vigilância | Lâmina de Interferência (dano 220) | Pistola de Rastreio (dano 88) | Blindagem de Contravigilância (+145 HP máx.) |
| 09 — Estação Fantasma | Lâmina Subterrânea (dano 250) | Pistola de Emergência (dano 98) | Blindagem de Túnel (+160 HP máx.) |
| 10 — Mercado Negro dos Túneis | Lâmina do Mercado Negro (dano 270) | Pistola do Contrabandista (dano 105) | Colete do Mercado (+175 HP máx.) |
| 11 — Colônia de Contaminados | Lâmina Séptica (dano 290) | Pistola de Extração (dano 112) | Traje de Quarentena (+190 HP máx.) — também dá imunidade ao piso tóxico |
| 12 — Servidor Oculto | Lâmina de Criptografia (dano 310) | Pistola de Pacote (dano 119) | Blindagem Faraday (+205 HP máx.) |
| 13 — Terminal de Contêineres | Lâmina de Estiva (dano 330) | Pistola Hidráulica (dano 126) | Colete de Estiva (+220 HP máx.) |

## Estrutura

```
src/
  main.js                 # bootstrap do Phaser
  state/
    GameState.js           # progresso do jogador (nível, XP com custo estritamente crescente, HP, arma, armadura, pistola, flags de imunidade a piso eletrificado e tóxico, resgates, itens coletados) — persiste entre cenas, e salva/carrega automaticamente do localStorage (save/load)
    Captives.js             # NPCs presos no Setor de Contenção (diálogo preso vs. resgatado)
    FoundryCaptives.js      # NPCs presos na Ala de Fundição (diálogo preso vs. resgatado)
    ReactorCaptives.js      # NPCs presos na Ala do Reator (diálogo preso vs. resgatado)
    CoreCaptives.js         # NPCs presos no Núcleo de Comando (diálogo preso vs. resgatado)
    TowerCaptives.js        # NPCs presos na Torre de Segurança — resgatados aparecem no Distrito Neon, não na Ala Central
    ServidorCaptives.js     # NPCs presos no Servidor Oculto — resgatados aparecem no Submundo
    TerminalCaptives.js     # NPCs presos no Terminal de Contêineres — resgatados aparecem no Estaleiro
  scenes/
    BootScene.js             # gera toda a pixel art via pixelGrid (tiles, personagens, itens, HUD) e abre a tela inicial
    TitleScene.js              # tela inicial: Novo Jogo / Continuar
    IntroScene.js              # introdução narrativa (Novo Jogo) — história + ponto de partida na Ala Central
    pixelGrid.js              # utilitário de desenho pixel a pixel com contorno automático de 1px
    TownScene.js               # Ala Central: NPCs fixos + resgatados (das 4 fases da fábrica), diálogo, portas pros 4 setores + portal pro Distrito Neon, logo no chão
    DungeonScene.js              # Fase 01: salas, inimigos, itens, cartão/porta trancada, chefe, vitória/derrota
    FoundryScene.js               # Fase 02: mesmo padrão da Fase 01, mapa ~5x maior, kits médicos, chefe próprio
    ReactorScene.js                # Fase 03: mapa ainda maior, piso eletrificado, semi-boss guardando o cofre, chefe próprio
    CoreScene.js                    # Fase 04: 3 torres de firewall hackeáveis em vez de cofre único, chefe que invoca adds
    DistrictScene.js                 # Distrito Neon: segundo hub (cidade), menor que a Ala Central — portal de volta + porta pra Fase 05
    TowerScene.js                     # Fase 05: 2 quebra-cabeças reais (sequência + apaga-liga) em vez de combate/cofre, chefe teleportador
    ServidorScene.js                  # Fase 12: anel concêntrico, cabeamento + barramento, varredura de pico, O Administrador
    EstaleiroScene.js                  # Estaleiro Automatizado: hub da Região 4 (cais), poço de carga de volta ao Submundo
    TerminalScene.js                   # Fase 13: pátio-grade, drones de carga nas rotas, Ponte (brechas), O Empilhador
    UIScene.js                    # HUD (barras segmentadas de HP/XP), diálogo, rótulo de zona, overlays
  data/
    introStory.js               # beats da introdução (Novo Jogo)
  ui/
    MenuButton.js               # botão de menu (moldura em mira, hover/teclado)
    titleAtmosphere.js          # fundo, logo, poeira e fade das telas iniciais
  world/
    TileMap.js                  # grid top-down, colisão (portas trancadas via setWalkable, piso perigoso via getHazard / isElectrified / isToxic)
    DungeonLayout.js             # construção programática do Setor de Contenção (salas + corredores + zonas)
    FoundryLayout.js             # construção programática da Ala de Fundição (10 salas + corredores + zonas)
    ReactorLayout.js             # construção programática da Ala do Reator (10 salas + corredores + zonas + piso eletrificado)
    CoreLayout.js                # construção programática do Núcleo de Comando (10 salas + corredores + 3 torres de firewall)
    TowerLayout.js               # construção programática da Torre de Segurança (10 salas + corredores + 2 quebra-cabeças)
    TownLayout.js                # construção programática da Ala Central (salão + pilares)
    DistrictLayout.js            # construção programática do Distrito Neon (hub menor da cidade)
    ServidorLayout.js            # construção programática do Servidor Oculto (anel + raios, cabos e racks)
    EstaleiroLayout.js           # construção programática do Estaleiro Automatizado (cais + berços)
    TerminalLayout.js            # construção programática do Terminal de Contêineres (pátio-grade + avenidas)
  entities/
    Player.js, Enemy.js, NPC.js
    Boss.js          # Guardião Núcleo (Fase 01): bolts homing à distância + fase de fúria
    FoundryBoss.js   # Fundidor Primordial (Fase 02): rajada vermelha reta telegrafada (0.5s de carga + 0.5s de disparo), fica parado ao atacar
    ReactorBoss.js   # Titã Voltaico (Fase 03): nunca para de perseguir/bater — marca a posição do jogador e faz cair um raio em área ali
    CoreBoss.js      # Vigia Central (Fase 04): sem ataque à distância próprio — invoca Sentinelas de Defesa (adds reais) periodicamente
    CuratorBoss.js   # Curador Supremo (Fase 05): teleporta pra perto do jogador e libera uma explosão corpo a corpo em área
    ElectricDrone.js # Sentinela Elétrica (inimigo novo, Fase 03): pulso de choque em área além do ataque por contato
    JammerDrone.js   # Drone Inibidor (inimigo novo, Fase 04): pulso EMP que trava a pistola do jogador por alguns segundos (status, não dano)
    ShooterDrone.js  # Drone Atirador (inimigo novo, Fase 05): primeiro inimigo comum com ataque à distância (projétil reto e lento)
    FirewallDrone.js # Drone de Firewall (Fase 12): planta uma barreira temporária no caminho
    SiphonEnemy.js   # Sonda Sifão (Fase 12): pulso que drena 1 carga da pistola
    SysadminBoss.js  # O Sysadmin (Fase 12): sub-confronto da Câmara, barreiras em cruz
    AdministradorBoss.js # O Administrador (Fase 12): parte a arena com um firewall de tiles
    CargoDrone.js    # Drone de Carga (Fase 13): circula rota fixa, não persegue
    StackerEnemy.js  # Empilhadeira (Fase 13): investe só no eixo da avenida/rua
    EstivadorBoss.js # O Estivador (Fase 13): sub-confronto, libera o Armazém
    EmpilhadorBoss.js # O Empilhador (Fase 13): marca o chão e derruba um contêiner (queda rápida) que vira parede; de perto, golpe de garra que arremessa o jogador
    MiniBoss.js      # semi-boss genérico (HP alto, nome/barra própria) — guarda o cofre da Fase 03, reutilizável em fases futuras
  utils/
    constants.js                 # tamanho de tile e vetores de direção
  audio/
    synth.js         # síntese de baixo nível (tom, ruído, sequência, loop musical) via Web Audio, amostra a amostra
    SoundBank.js      # gera todos os efeitos/trilhas com synth.js e registra no cache de áudio do Phaser (chamado uma vez no boot)
    AudioManager.js   # controle de reprodução: troca de trilha por cena, tocar efeito, mudo (persistido)
```

## Convenções de escrita

Todo texto voltado ao jogador — diálogo, nome de fase, descrição de roadmap — evita termos de meta-game que quebrem a imersão (ex.: "chefe", "boss", "mini-boss", "spawn"). O confronto é descrito pelo nome do antagonista ou pelo que acontece na cena ("enfrenta O Roteador", não "chefe: O Roteador"). Vale pra qualquer texto novo escrito neste projeto, este README incluído.

## Convenções técnicas

1. **Ordem de `_checkItemPickups()` no `update()` de uma fase.** Sempre roda ANTES do corte `if (this.levelEnded) { ...; return; }`, nunca depois. Motivo: o próprio golpe que termina a fase (o confronto final) já derruba loot (munição/estimulante/EMP) nesse exato frame — se a coleta só é checada depois do corte, esse item fica pra sempre impossível de pegar, porque o `update()` já retorna cedo demais em todo frame seguinte (bug real, presente nas 9 fases até a Fase 09 até ser corrigido de uma vez). Qualquer fase nova precisa manter essa ordem.
2. **Tela de "fase completa" (`PHASE_OUTCOMES` em `src/scenes/UIScene.js`).** Cada fase nova precisa de uma entrada própria — uma frase única contando um pedaço do que mudou ali (nunca reaproveitar o texto de outra fase) e a região certa de retorno (`à Ala Central`, `ao Distrito Neon`, `ao Submundo`, `ao Estaleiro Automatizado`, ou a região correspondente quando novas regiões forem construídas). Nunca hardcodar "Ala Central" — a partir da Fase 05 isso já fica errado.

## Próximos passos sugeridos

1. ~~Construir a Fase 06, possivelmente ainda no Distrito Neon ou um terceiro local novo.~~ ✅ Feito — Fase 06 "Arsenal Blindado": quebra-cabeça de terminais, corredor de armadilhas cíclicas, nova arma à distância (railgun), tanque com investida/canhão + guardião da sala de artilharia.
2. ~~Expandir equipamento: mais slots (acessórios), itens consumíveis, magias.~~ ✅ Feito — variedade de armas corpo a corpo (espada/pile-bunker) e à distância (pistola/SMG/shotgun/railgun) com comportamentos próprios, consumíveis (estimulante, granada EMP), e menu paginado (Equipamento/Consumíveis/Itens-chave) explicando cada item. (O chicote/Monolâmina foi removido depois — o cone de acerto baseado na última direção de movimento ficava imprevisível, sem dar pra saber se o golpe ia conectar.)
3. ~~Portais/atalhos entre setores não-adjacentes dentro de um mesmo local (hoje a conexão é só por corredores lineares).~~ ✅ Feito — Fase 07 "Nexo de Transporte": portais fixos (pares bidirecionais ligando setores distantes do mapa) e um portal instável (cicla sozinho entre 3 destinos, puzzle de timing sem punição por errar), Saltador de Fase (inimigo novo que pisca pra dentro/fora de alcance), o Guardião do Nexo (teleporte + invocação de reforços, derruba a chave da arena final) e O Roteador (ancora e teleporta entre pontos fixos da arena, satélites atiram de verdade).
4. ~~Distrito Neon está com 3 fases (05-07) — uma a menos que o padrão de 4 por região que as próximas regiões vão seguir. Adicionar a 4ª antes de avançar.~~ ✅ Feito — Fase 08 "Central de Vigilância", o verdadeiro fechamento do arco do distrito: Sentinela de Varredura (inimigo novo, estacionária, feixe giratório de detecção — o perigo é de posição/tempo, não perseguição), Sala de Sinal (puzzle novo: a ordem certa é revelada por uma demonstração de luzes no início, não por números fixos, e o sorteio muda a cada visita), Operador de Segurança (derruba o cartão que abre a Sala de Override, sabotagem opcional que desativa a invocação de reforços) e A Emissora (combina marca+feixe telegrafado com invocação de Sentinelas — revela que a vigilância do distrito respondia a algo além do Coordenador Voss). Vencer abre caminho pro Submundo.
5. ~~Mais 3 regiões depois do Distrito Neon, 4 fases cada, fechando com uma base espacial.~~ 🔶 Em andamento — Região 3 "Submundo" ✅ (gancho + hub + Fases 09-12). Região 4 "Estaleiro Automatizado": hub ✅ + Fase 13 "Terminal de Contêineres" ✅. Próxima: Fase 14 "Refinaria Offshore".
6. Persistir o estado de portas trancadas / cartões entre visitas ao mesmo setor (hoje reseta a cada entrada).
7. Superboss opcional / New Game+ pra jogadores que exploram tudo.
8. Minimapa — os mapas já passam de 1000 tiles de piso, vale a pena antes de mais fases aumentarem ainda mais o tamanho.
9. Passos (footstep) e trilhas dedicadas pros confrontos finais de fase — deixados de fora por ora pra não arriscar repetição cansativa; hoje o feedback sonoro é todo por ação discreta (ataque, acerto, item, etc.), sem som contínuo de movimento.

## Roadmap de regiões futuras

Depois do Distrito Neon (Fases 05-08, ver item 4 acima), o jogo segue por mais 3 regiões — 4 fases cada, no mesmo padrão — fechando com uma base espacial.

### Região 3 — Submundo (Fases 09-12)

Sob o asfalto do Distrito Neon: metrô abandonado, mercado paralelo, contaminação biológica.

- ~~**09 — Estação Fantasma**: metrô desativado, sinalização quebrada, primeiro contato com o Submundo.~~ ✅ Feito (ver item 5 acima).
- ~~**10 — Mercado Negro dos Túneis**: contrabandistas controlam a rota.~~ ✅ Feito. Topologia em loop + duas alas convergentes (não a grade em 3 bandas nem o traçado linear já usados): a ala esquerda dá a volta por uma sala de armas e uma armadilha antes de convergir no mesmo Cofre de Acesso alcançável pelo caminho curto — resolver a Sala de Sequência ali é o que libera a Câmara do Capataz (sub-chefe, reaproveita `MiniBoss`); a ala direita é linear (armadura → Sala de Distribuição/puzzle de Circuito → armadilha → pistola) sem combate de guarda. As duas convergem no Beco de Saída, onde a Sala de Sinal (Simon-Says) libera o Salão do Barão. Primeiro chefe do jogo com silhueta HUMANA (não robô/veículo/criatura): O Barão do Mercado, com um braço mecânico superdimensionado que arremessa uma "Granada Suja" — aro de aviso que marca a posição ATUAL do jogador (não rastreia) e continua perseguindo/batendo durante o telégrafo, nunca parado como os chefes de rajada. Novo inimigo comum Miliciano do Mercado (primeira silhueta humana entre os inimigos comuns). Arquivos: `MercadoNegroLayout.js`, `MercadoNegroScene.js`, `MarketBaronBoss.js`, `MercadoNegroCaptives.js`; `GameState.mercadoNegroCleared` gates o que vier depois.
- ~~**11 — Colônia de Contaminados**: piso tóxico (dano gradual, não instantâneo) e população mutada pela exposição.~~ ✅ Feito. Topologia em hive (átrio + três alas), distinta das fases 09 e 10: ala oeste com piso tóxico + Corredor de Drenagem (armadilha) + Sala de Filtros (puzzle novo: 4 tambores com 3 estados, vizinhos giram juntos) que libera a Câmara do Hospedeiro; ala leste mais limpa até o Traje de Quarentena (imunidade ao lodo) + Sala de Isolamento (puzzle de pares, não sequência nem circuito); ala sul com o Ninho da Matriarca só abrindo depois dos dois puzzles. O Enfermeiro (sub-chefe) controla a saída da própria câmara. A Matriarca é a primeira criatura biológica de confronto do jogo: persegue enquanto marca a posição atual do jogador e deixa um charco que continua cobrando tique. Novo inimigo comum Contaminado (deixa charco ao morrer) e elite Portador (tosse de esporos). Arquivos: `ColoniaLayout.js`, `ColoniaScene.js`, `MatriarchBoss.js`, `EnfermeiroBoss.js`, `ColoniaCaptives.js`; `GameState.coloniaCleared` e `GameState.toxinImmune` (o Traje cancela o piso tóxico pelo resto do jogo, inclusive poças).
- ~~**12 — Servidor Oculto**: um data-center clandestino esconde a rota até as docas — a confrontação final revela quem realmente controla o contrabando.~~ ✅ Feito. Topologia em anel concêntrico + raios (não hive, não loop, não linear): o Cabeamento (puzzle de rotacionar segmentos até o sinal ir do IN ao OUT) abre o Anel Oeste; o Barramento (plugues coloridos — pise para trocar vizinhos até bater com o alvo de cima) abre o Anel Leste; o Núcleo só abre com os dois. Corredores Frio/Quente varrem uma linha de pico (não é piso estático). Drone de Firewall planta barreiras temporárias; Sonda Sifão drena carga da pistola. O Sysadmin guarda um atalho; O Administrador parte a arena com um firewall de tiles (na fúria, a perpendicular também). Arquivos: `ServidorLayout.js`, `ServidorScene.js`, `AdministradorBoss.js`, `SysadminBoss.js`, `FirewallDrone.js`, `SiphonEnemy.js`, `ServidorCaptives.js`; `GameState.servidorCleared` libera o poço de carga pro Estaleiro Automatizado.

### Região 4 — Estaleiro Automatizado (Fases 13-16)

Portos robotizados nos limites da cidade — guindastes, contêineres, montagem naval.

- ~~**Hub — Cais do Estaleiro**: cais longo leste-oeste com berços ao norte (não a praça em cruz do Distrito nem a caverna do Submundo). Gancho de entrada distinto: depois de O Administrador, a **Estivadora Ryn** aparece no Submundo ao lado de um **poço de carga** que sobe (hidráulica + zoom pra fora), o contrário do buraco que desce do Distrito e do portal que gira da fábrica. Dois NPCs locais (Contramestra Vale, Operador de Guindaste); o berço do Terminal abre a incursão. Arquivos: `EstaleiroLayout.js`, `EstaleiroScene.js`; `GameState.servidorCleared` libera o poço.~~ ✅ Feito.
- ~~**13 — Terminal de Contêineres**: pátio automatizado, drones de carga circulando as rotas. Topologia em grade de pilhas (avenidas + ruas), distinta do anel do Servidor: pátio central murado, com as áreas trancadas FORA dele. A Sala da Ponte (anexo sudoeste, sempre aberta) tem uma PONTE LEVADIÇA de 3 pranchas sobre um fosso — pisar nos pedais deita cada prancha; com a ponte baixada o jogador ATRAVESSA até a Câmara do Estivador (ilha a oeste), que guarda as Botas Magnéticas de Estiva (Botas de Impulso da Região 4). O Estivador derrotado libera o Armazém (L2: armadura + pistola); ponte baixada + Estivador fora do pátio abrem a Doca de Carga (L3: lâmina + O Empilhador). O anexo fica no canto inferior-esquerdo de propósito — o HUD é preso no topo da tela, então a ponte nunca renderiza coberta. **Guindaste solto:** enquanto a chave do guindaste não é puxada, contêineres despencam sozinhos pelo pátio (telégrafo + queda + parede temporária, `_updateCraneHazard`). A **Cabine de Comando** (anexo nordeste, sempre aberta) tem o puzzle das **travas de segurança** (3 travas; cada pedal levanta a sua e puxa a seguinte junto) — soltas, abrem a **Sala do Guindaste** (portão LG), onde **6 guardas fortes** (StackerEnemy reforçado) defendem a **chave**; puxá-la desliga o guindaste e para as quedas. Os 6 guardas contam na limpeza, então derrubar o guindaste é obrigatório. Drone de Carga não persegue — só circula a rota. Empilhadeira investe só no eixo da avenida. O Empilhador marca a posição atual do jogador e derruba um contêiner — telégrafo curto, queda rápida — que fere quem ficou e vira parede por uns segundos; de perto, um golpe de garra em leque arremessa o jogador pra trás (empurrão + atordoamento curto, ver `Player.pushBack`). Na fúria, cai um segundo contêiner e o empurrão vem mais seguido. Arquivos: `TerminalLayout.js`, `TerminalScene.js`, `EmpilhadorBoss.js`, `EstivadorBoss.js`, `CargoDrone.js`, `StackerEnemy.js`, `TerminalCaptives.js`; `GameState.terminalCleared` gates o que vier depois.~~ ✅ Feito.
- **14 — Refinaria Offshore**: plataforma sobre a água, risco de queda além do combate.
- **15 — Estaleiro Naval**: linha de montagem de mechs em construção, braços robóticos como armadilha ambiental.
- **16 — Torre de Controle Logístico**: quem comanda o estaleiro vira os próprios guindastes contra o jogador na confrontação final.

### Região 5 — Torre Matriz da Neo Industries (Fases 17-20)

A sede da corporação — onde as respostas sobre a fábrica e o Distrito Neon finalmente aparecem.

- **17 — Átrio Executivo**: recepção de luxo, segurança corporativa mais bem equipada que qualquer coisa vista até aqui.
- **18 — Departamento de P&D**: os laboratórios onde os inimigos das fases anteriores foram desenvolvidos.
- **19 — Cofre de Dados**: sala sem combate, puzzles de criptografia — no mesmo espírito da Torre de Segurança.
- **20 — Sala do Conselho**: confrontação final com quem está acima do Coordenador Voss.

### Região 6 — Deserto de Sucata Irradiado (Fases 21-24)

Fora dos limites da cidade — terra de ninguém pós-industrial, ponte pra fase espacial.

- **21 — Cemitério de Máquinas**: sucata a perder de vista, mapa mais aberto que os anteriores.
- **22 — Acampamento Nômade**: uma facção independente da Neo Industries, hostil por conta própria.
- **23 — Cratera Irradiada**: variante nova de piso perigoso — radiação com dano gradual, diferente do piso eletrificado.
- **24 — Silo Abandonado**: guardado por quem se instalou lá dentro — vencer libera o silo, que é literalmente o caminho até a órbita.

### Região 7 — Estação Orbital Prometheus (Fases 25-28, fecha o jogo)

A tecnologia mais avançada de todo o jogo, e onde a história se resolve.

- **25 — Doca de Atracação**: chegada à estação, gravidade instável como mecânica nova.
- **26 — Suporte de Vida**: hidroponia e oxigênio — um novo tipo de risco ambiental.
- **27 — Anel de Pesquisa**: os adversários mais avançados do jogo até aqui.
- **28 — Núcleo de Comando Orbital**: confrontação final do jogo.
