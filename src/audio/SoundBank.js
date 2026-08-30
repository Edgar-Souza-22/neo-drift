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
}
