import { renderTone, renderNoise, renderSequence, renderLoop } from './synth.js';

// Gera todos os efeitos sonoros e trilhas do jogo e registra no cache de
// áudio do Phaser — mesmo padrão do BootScene pra pixel art (gerar uma vez
// na inicialização, sem depender de arquivos externos). Chamado uma única
// vez a partir do BootScene.
export function generateSounds(scene) {
  const ctx = scene.sound && scene.sound.context;
  // Ambiente sem Web Audio (raro) — o jogo continua funcionando, só sem som.
  if (!ctx) return;

  const add = (key, buffer) => scene.cache.audio.add(key, buffer);

  // --- Efeitos sonoros --------------------------------------------------
  add('sfx_attack_melee', renderTone(ctx, { freq: 640, freqEnd: 220, duration: 0.11, wave: 'triangle', volume: 0.5 }));
  add('sfx_attack_ranged', renderTone(ctx, { freq: 1200, freqEnd: 480, duration: 0.09, wave: 'square', volume: 0.4 }));
  add('sfx_hit', renderNoise(ctx, { duration: 0.08, volume: 0.45, cutoff: 0.7, decayRate: 30 }));
  add('sfx_enemy_die', renderNoise(ctx, { duration: 0.28, volume: 0.5, cutoff: 0.45, decayRate: 9 }));
  add('sfx_miniboss_die', renderSequence(ctx, [
    { freq: 180, freqEnd: 90, duration: 0.22, wave: 'square', volume: 0.5 },
    { freq: 140, freqEnd: 60, duration: 0.3, wave: 'square', volume: 0.5 }
  ]));
  add('sfx_boss_die', renderSequence(ctx, [
    { freq: 220, freqEnd: 80, duration: 0.3, wave: 'saw', volume: 0.55 },
    { freq: 160, freqEnd: 50, duration: 0.35, wave: 'saw', volume: 0.55 },
    { freq: 100, freqEnd: 30, duration: 0.45, wave: 'saw', volume: 0.5 }
  ]));
  add('sfx_player_hurt', renderTone(ctx, { freq: 260, freqEnd: 110, duration: 0.18, wave: 'saw', volume: 0.45 }));
  add('sfx_pickup', renderSequence(ctx, [
    { note: 'C5', duration: 0.07, wave: 'square', volume: 0.35 },
    { note: 'E5', duration: 0.1, wave: 'square', volume: 0.35 }
  ]));
  add('sfx_level_up', renderSequence(ctx, [
    { note: 'C4', duration: 0.09, wave: 'square', volume: 0.4 },
    { note: 'E4', duration: 0.09, wave: 'square', volume: 0.4 },
    { note: 'G4', duration: 0.09, wave: 'square', volume: 0.4 },
    { note: 'C5', duration: 0.22, wave: 'square', volume: 0.45 }
  ]));
  add('sfx_door', renderTone(ctx, { freq: 320, freqEnd: 900, duration: 0.32, wave: 'sine', volume: 0.35 }));
  add('sfx_menu_open', renderTone(ctx, { freq: 500, freqEnd: 760, duration: 0.08, wave: 'triangle', volume: 0.35 }));
  add('sfx_menu_close', renderTone(ctx, { freq: 760, freqEnd: 460, duration: 0.08, wave: 'triangle', volume: 0.35 }));
  add('sfx_dialogue', renderTone(ctx, { freq: 900, duration: 0.04, wave: 'square', volume: 0.25 }));
  add('sfx_enrage', renderSequence(ctx, [
    { freq: 140, freqEnd: 260, duration: 0.15, wave: 'saw', volume: 0.5 },
    { freq: 100, freqEnd: 340, duration: 0.22, wave: 'saw', volume: 0.55 }
  ]));
  add('sfx_victory', renderSequence(ctx, [
    { note: 'C4', duration: 0.1, wave: 'triangle', volume: 0.4 },
    { note: 'E4', duration: 0.1, wave: 'triangle', volume: 0.4 },
    { note: 'G4', duration: 0.1, wave: 'triangle', volume: 0.4 },
    { note: 'C5', duration: 0.1, wave: 'triangle', volume: 0.42 },
    { note: 'G4', duration: 0.1, wave: 'triangle', volume: 0.4 },
    { note: 'C5', duration: 0.3, wave: 'triangle', volume: 0.48 }
  ]));
  add('sfx_game_over', renderSequence(ctx, [
    { note: 'G3', duration: 0.22, wave: 'saw', volume: 0.4 },
    { note: 'Eb3', duration: 0.22, wave: 'saw', volume: 0.4 },
    { note: 'C3', duration: 0.5, wave: 'saw', volume: 0.42 }
  ]));

  // --- Trilhas em loop ----------------------------------------------------
  // Ala Central — calma, andamento lento, poucas notas (é o hub de descanso).
  add('music_town', renderLoop(ctx, {
    bpm: 92, stepsPerBeat: 2,
    bass: ['C3', null, 'G2', null, 'Ab2', null, 'G2', null, 'C3', null, 'Eb3', null, 'G2', null, null, null],
    lead: [null, null, 'C4', null, null, 'Eb4', null, 'G4', null, null, 'F4', null, 'Eb4', null, 'C4', null],
    waveBass: 'triangle', waveLead: 'sine', volBass: 0.2, volLead: 0.14
  }));

  // Setor de Contenção (Fase 01) — ostinato tenso, percussão simples.
  add('music_dungeon', renderLoop(ctx, {
    bpm: 138, stepsPerBeat: 2,
    bass: ['C3', 'C3', null, 'C3', 'Eb3', 'C3', null, 'C3', 'Bb2', 'Bb2', null, 'Bb2', 'C3', 'C3', null, null],
    lead: [null, 'G4', null, 'Eb4', null, null, 'F4', null, null, 'G4', null, 'Ab4', null, 'G4', null, null],
    perc: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1],
    waveBass: 'square', waveLead: 'square', volBass: 0.22, volLead: 0.15, volPerc: 0.13
  }));

  // Ala de Fundição (Fase 02) — mais grave/sincopado, timbre saw (mais áspero).
  add('music_foundry', renderLoop(ctx, {
    bpm: 132, stepsPerBeat: 2,
    bass: ['C3', null, 'C3', 'Eb3', null, 'C3', null, 'F3', 'D3', null, 'D3', 'F3', null, 'D3', null, null],
    lead: ['G4', null, null, 'Bb4', null, 'G4', null, null, 'A4', null, null, 'C5', null, 'A4', null, null],
    perc: [1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 1],
    waveBass: 'saw', waveLead: 'saw', volBass: 0.2, volLead: 0.14, volPerc: 0.15
  }));

  // Ala do Reator (Fase 03) — o mais rápido/staccato, arpejo "elétrico".
  add('music_reactor', renderLoop(ctx, {
    bpm: 156, stepsPerBeat: 2,
    bass: ['C3', 'G2', 'C3', 'G2', 'Eb3', 'G2', 'C3', 'G2', 'Bb2', 'F2', 'Bb2', 'F2', 'D3', 'F2', 'Bb2', 'F2'],
    lead: ['C5', null, 'Eb5', null, 'G5', null, 'Eb5', null, 'Bb4', null, 'D5', null, 'F5', null, 'D5', null],
    perc: [1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1],
    waveBass: 'square', waveLead: 'square', volBass: 0.2, volLead: 0.13, volPerc: 0.16
  }));

  // Núcleo de Comando (Fase 04) — o mais "digital/errático" dos quatro:
  // intervalos dissonantes, saw no baixo e no lead, percussão irregular
  // sugerindo sinal corrompido.
  add('music_core', renderLoop(ctx, {
    bpm: 144, stepsPerBeat: 2,
    bass: ['C3', null, 'Db3', null, 'C3', 'G2', null, 'Db3', 'Bb2', null, 'B2', null, 'Bb2', 'F2', null, 'B2'],
    lead: [null, 'Eb4', null, null, 'G4', null, 'Ab4', null, null, 'D4', null, 'Eb4', null, null, 'G4', null],
    perc: [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1],
    waveBass: 'saw', waveLead: 'square', volBass: 0.19, volLead: 0.13, volPerc: 0.14
  }));

  // Distrito Neon (hub da cidade) — andamento lento, clima "lounge"/noturno,
  // ondas suaves (sine/triangle), bem diferente do industrial da fábrica.
  add('music_district', renderLoop(ctx, {
    bpm: 98, stepsPerBeat: 2,
    bass: ['Eb3', null, null, 'Bb2', null, null, 'Ab2', null, null, 'Bb2', null, null, 'Eb3', null, null, null],
    lead: [null, null, 'G4', null, null, 'Bb4', null, null, 'Ab4', null, null, 'F4', null, null, 'Eb4', null],
    waveBass: 'sine', waveLead: 'triangle', volBass: 0.2, volLead: 0.15
  }));

  // Torre de Segurança (Fase 05) — andamento moderado, "limpo"/preciso
  // (tema de segurança/cofre), quadrada e regular em vez de errática.
  add('music_tower', renderLoop(ctx, {
    bpm: 126, stepsPerBeat: 2,
    bass: ['D3', null, 'D3', null, 'A2', null, 'A2', null, 'Bb2', null, 'Bb2', null, 'F2', null, 'F2', null],
    lead: [null, 'F4', null, 'A4', null, 'D5', null, 'A4', null, 'C5', null, 'F5', null, 'C5', null, 'A4'],
    perc: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
    waveBass: 'triangle', waveLead: 'square', volBass: 0.2, volLead: 0.14, volPerc: 0.12
  }));

  // Arsenal Blindado (Fase 06) — pesado e marcial (base militar/tanque):
  // andamento mais lento que as outras fases, grave em "saw" (mais áspero)
  // e percussão em marcha, bem diferente do "limpo" da Torre.
  add('music_arsenal', renderLoop(ctx, {
    bpm: 108, stepsPerBeat: 2,
    bass: ['G2', null, 'G2', null, 'Eb2', null, 'Eb2', null, 'F2', null, 'F2', null, 'D2', null, 'D2', null, null],
    lead: [null, null, 'Bb3', null, null, null, 'G3', null, null, null, 'C4', null, null, null, 'A3', null],
    perc: [1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1],
    waveBass: 'saw', waveLead: 'square', volBass: 0.24, volLead: 0.12, volPerc: 0.17
  }));

  // Nexo de Transporte (Fase 07) — o fechamento do arco do Distrito Neon:
  // andamento rápido e intervalos instáveis/dissonantes (tema de portal
  // "desalinhando"), lead em pulse curto piscando entre notas distantes em
  // vez de uma melodia contínua, bem diferente do "marcial" do Arsenal.
  add('music_nexus', renderLoop(ctx, {
    bpm: 132, stepsPerBeat: 2,
    bass: ['Eb2', null, null, 'Eb2', 'A2', null, null, 'A2', 'D2', null, null, 'D2', 'Ab2', null, null, null],
    lead: [null, 'Bb4', null, 'E4', null, null, 'F4', null, null, 'C5', null, null, 'Gb4', null, null, 'Db5'],
    perc: [1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 0, 0, 1, 1, 0],
    waveBass: 'saw', waveLead: 'square', volBass: 0.2, volLead: 0.14, volPerc: 0.15
  }));

  // Central de Vigilância (Fase 08) — fecha de vez o arco do Distrito Neon:
  // baixo pulsante e regular (tema de "escaneamento"/radar), lead esparso em
  // notas isoladas tipo blip, bem diferente do pulse contínuo do Nexo.
  add('music_vigilancia', renderLoop(ctx, {
    bpm: 116, stepsPerBeat: 2,
    bass: ['F2', null, 'F2', null, 'F2', null, 'Db2', null, 'F2', null, 'F2', null, 'Ab2', null, null, null],
    lead: [null, null, null, 'C5', null, null, null, null, null, null, null, 'Db5', null, null, null, null],
    perc: [1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0],
    waveBass: 'square', waveLead: 'triangle', volBass: 0.2, volLead: 0.12, volPerc: 0.13
  }));

  // Submundo (hub da Região 3) — lento e cavernoso, grave em "sine" quase
  // sem lead (só um pingo isolado ecoando de vez em quando), bem mais vazio
  // que qualquer trilha de hub anterior — reforça o silêncio de estar
  // embaixo da terra.
  add('music_submundo', renderLoop(ctx, {
    bpm: 84, stepsPerBeat: 2,
    bass: ['D2', null, null, null, null, null, 'Ab1', null, null, null, null, null, 'F2', null, null, null],
    lead: [null, null, null, null, null, null, null, 'Eb4', null, null, null, null, null, null, null, null],
    waveBass: 'sine', waveLead: 'sine', volBass: 0.22, volLead: 0.1
  }));

  // Estação Fantasma (Fase 09) — andamento arrastado, intervalos abertos
  // (quintas, não dissonâncias) sugerindo espaço vazio/eco de trilho, com
  // uma percussão irregular tipo "trilho batendo" ao fundo.
  add('music_fantasma', renderLoop(ctx, {
    bpm: 100, stepsPerBeat: 2,
    bass: ['E2', null, null, 'B1', null, null, 'C2', null, null, 'G1', null, null, 'A1', null, null, 'E1'],
    lead: [null, null, 'B3', null, null, null, null, 'C4', null, null, null, null, 'A3', null, null, null],
    perc: [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0],
    waveBass: 'triangle', waveLead: 'sine', volBass: 0.2, volLead: 0.12, volPerc: 0.14
  }));

  // Colônia de Contaminados (Fase 11) — andamento viscoso, intervalos menores
  // (segunda menor) sugerindo infecção, lead esparso tipo "gota" em vez do
  // eco de trilho da Estação Fantasma.
  add('music_colonia', renderLoop(ctx, {
    bpm: 88, stepsPerBeat: 2,
    bass: ['Eb2', null, null, 'E2', null, null, 'Eb2', null, 'B1', null, null, 'C2', null, null, 'Eb2', null],
    lead: [null, null, 'Gb3', null, null, null, null, 'G3', null, null, null, null, 'Eb3', null, null, null],
    perc: [1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 1, 0],
    waveBass: 'sine', waveLead: 'triangle', volBass: 0.22, volLead: 0.1, volPerc: 0.12
  }));

  // Servidor Oculto (Fase 12) — andamento digital regular (não o viscoso da
  // Colônia nem o eco de trilho da Estação), baixo em square tipo clock de
  // rack, lead em blips isolados. Fecha o Submundo.
  add('music_servidor', renderLoop(ctx, {
    bpm: 128, stepsPerBeat: 2,
    bass: ['C2', null, 'C2', null, 'G1', null, 'C2', null, 'Eb2', null, 'C2', null, 'Bb1', null, 'G1', null],
    lead: [null, null, 'G4', null, null, null, null, 'Bb4', null, null, null, 'C5', null, null, null, null],
    perc: [1, 0, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 0, 1, 0],
    waveBass: 'square', waveLead: 'triangle', volBass: 0.2, volLead: 0.12, volPerc: 0.13
  }));

  // Estaleiro Automatizado (hub da Região 4) — andamento de máquina, baixo
  // em triangle tipo hidráulica de guindaste, percussão em "claque" espaçado
  // (não o vazio cavernoso do Submundo nem o lounge do Distrito).
  add('music_estaleiro', renderLoop(ctx, {
    bpm: 104, stepsPerBeat: 2,
    bass: ['G2', null, null, 'G2', 'Bb2', null, 'F2', null, 'G2', null, null, 'D2', 'Eb2', null, 'F2', null],
    lead: [null, null, 'D4', null, null, null, 'F4', null, null, null, 'Bb3', null, null, null, 'C4', null],
    perc: [1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    waveBass: 'triangle', waveLead: 'square', volBass: 0.22, volLead: 0.11, volPerc: 0.14
  }));

  // Terminal de Contêineres (Fase 13) — mais rápido que o hub do cais, perc
  // em "batida de pátio" regular (drones na rota), lead curto tipo apito de
  // guindaste. Distinto da hidráulica espaçada do Estaleiro e do clock do Servidor.
  add('music_terminal', renderLoop(ctx, {
    bpm: 118, stepsPerBeat: 2,
    bass: ['G2', 'G2', null, 'Bb2', null, null, 'F2', null, 'G2', null, 'D2', null, 'Eb2', 'Eb2', 'F2', null],
    lead: [null, 'D4', null, null, 'F4', null, null, null, 'Bb3', null, null, 'C4', null, null, 'D4', null],
    perc: [1, 0, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 1, 0, 0],
    waveBass: 'triangle', waveLead: 'square', volBass: 0.22, volLead: 0.12, volPerc: 0.15
  }));

  // Refinaria Offshore (Fase 14) — mais lento e "balançado" que o Terminal,
  // baixo em sine grave sugerindo o mar embaixo das plataformas, lead
  // esparso tipo alarme de convés distante. Distinto da batida regular do
  // pátio do Terminal e da hidráulica do hub.
  add('music_refinaria', renderLoop(ctx, {
    bpm: 96, stepsPerBeat: 2,
    bass: ['D2', null, null, 'D2', null, 'F2', null, null, 'C2', null, null, 'C2', null, 'Bb1', null, null],
    lead: [null, null, null, 'A3', null, null, null, null, null, null, 'F3', null, null, null, null, null],
    perc: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1],
    waveBass: 'sine', waveLead: 'triangle', volBass: 0.24, volLead: 0.1, volPerc: 0.12
  }));

  // Estaleiro Naval (Fase 15) — andamento mecânico e regular, feito pra
  // "marchar" (batida constante de estamparia), lead curto e metálico tipo
  // solda. Mais rápido e martelado que a Refinaria, mais "fabril" que o
  // pátio do Terminal.
  add('music_naval', renderLoop(ctx, {
    bpm: 122, stepsPerBeat: 2,
    bass: ['C2', 'C2', null, 'C2', 'Eb2', null, 'C2', null, 'Bb1', 'Bb1', null, 'Bb1', 'F2', null, 'C2', null],
    lead: [null, null, 'G3', null, null, null, 'Bb3', null, null, null, 'F3', null, null, null, 'G3', null],
    perc: [1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0],
    waveBass: 'square', waveLead: 'triangle', volBass: 0.22, volLead: 0.11, volPerc: 0.16
  }));

  // Torre de Controle Logístico (Fase 16, fecha a Região 4) — a mais tensa
  // da região: bpm mais alto que o Naval, baixo em saw grave (mais "sujo"
  // que o square da linha de montagem), lead curto e dissonante sugerindo
  // alarme constante. Reflete ser a fase mais dura do jogo até aqui.
  add('music_torre', renderLoop(ctx, {
    bpm: 132, stepsPerBeat: 2,
    bass: ['D2', 'D2', null, 'F2', 'D2', null, 'Ab1', null, 'D2', 'D2', null, 'C2', 'Ab1', null, 'D2', null],
    lead: [null, 'Ab3', null, null, 'D4', null, null, 'Ab3', null, null, 'F3', null, null, 'D4', null, null],
    perc: [1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 0, 1, 1],
    waveBass: 'saw', waveLead: 'square', volBass: 0.22, volLead: 0.1, volPerc: 0.17
  }));

  // Praça da Matriz (hub da Região 5) — o hub mais "limpo" do jogo: lento,
  // baixo em sine e lead em triangle numa harmonia maior, quase música de
  // saguão corporativo. O contraste com o Estaleiro é de propósito — a sede
  // não soa como um lugar perigoso, e é justamente esse o incômodo.
  add('music_matriz', renderLoop(ctx, {
    bpm: 88, stepsPerBeat: 2,
    bass: ['F2', null, null, null, 'C2', null, null, null, 'A2', null, null, null, 'Bb2', null, null, null],
    lead: [null, null, 'C4', null, null, null, 'E4', null, null, null, 'A3', null, null, null, 'F4', null],
    perc: [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0],
    waveBass: 'sine', waveLead: 'triangle', volBass: 0.2, volLead: 0.1, volPerc: 0.08
  }));

  // Átrio Executivo (Fase 17) — pega a harmonia maior da Praça e a corrói:
  // mesma tônica, mas com a sexta menor no baixo e um lead que insiste numa
  // nota fora. Percussão em passo firme e regular (segurança patrulhando),
  // não a batida fabril do Estaleiro.
  add('music_atrio', renderLoop(ctx, {
    bpm: 110, stepsPerBeat: 2,
    bass: ['F2', null, 'F2', null, 'Ab2', null, 'C2', null, 'F2', null, 'F2', null, 'Eb2', null, 'C2', null],
    lead: [null, 'C4', null, null, null, 'Ab3', null, null, null, 'Eb4', null, null, null, 'C4', null, 'Bb3'],
    perc: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1],
    waveBass: 'triangle', waveLead: 'square', volBass: 0.22, volLead: 0.11, volPerc: 0.14
  }));

  // Departamento de P&D (Fase 18) — clínico e um pouco errado: baixo em sine
  // num pulso regular de equipamento de laboratório, e um lead em square que
  // insiste numa nota fora da harmonia. Menos marcial que o Átrio, mais
  // desconfortável — o desconforto aqui é de sala limpa, não de patrulha.
  add('music_pd', renderLoop(ctx, {
    bpm: 100, stepsPerBeat: 2,
    bass: ['A2', null, 'A2', null, 'A2', null, 'F2', null, 'G2', null, 'G2', null, 'Eb2', null, 'F2', null],
    lead: [null, null, 'E4', null, null, 'Eb4', null, null, null, null, 'C4', null, null, 'Bb3', null, 'E4'],
    perc: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    waveBass: 'sine', waveLead: 'square', volBass: 0.21, volLead: 0.1, volPerc: 0.11
  }));
}
