// Síntese de áudio "pixel art sonoro" — mesma filosofia dos tiles/sprites
// (tudo gerado em código, sem depender de arquivos externos). Em vez de
// desenhar pixel a pixel num Graphics, aqui calculamos amostra a amostra
// num AudioBuffer, usando osciladores/ruído simples com envelope, no
// espírito chiptune/8-bit que combina com a pixel art do resto do jogo.

const NOTE_FREQS = {
  C2: 65.41, D2: 73.42, Eb2: 77.78, E2: 82.41, F2: 87.31, G2: 98.00, Ab2: 103.83, A2: 110.00, Bb2: 116.54, B2: 123.47,
  B1: 61.74,
  C3: 130.81, D3: 146.83, Eb3: 155.56, E3: 164.81, F3: 174.61, Gb3: 185.00, G3: 196.00, Ab3: 207.65, A3: 220.00, Bb3: 233.08, B3: 246.94,
  C4: 261.63, D4: 293.66, Eb4: 311.13, E4: 329.63, F4: 349.23, G4: 392.00, Ab4: 415.30, A4: 440.00, Bb4: 466.16, B4: 493.88,
  C5: 523.25, D5: 587.33, Eb5: 622.25, E5: 659.25, F5: 698.46, G5: 783.99, Ab5: 830.61, A5: 880.00, Bb5: 932.33, B5: 987.77,
  C6: 1046.50, D6: 1174.66, E6: 1318.51, G6: 1567.98
};

export function noteFreq(name) {
  return NOTE_FREQS[name] || 0;
}

function waveSample(phase, wave) {
  const p = phase - Math.floor(phase);
  switch (wave) {
    case 'square': return p < 0.5 ? 1 : -1;
    case 'triangle': return p < 0.5 ? (4 * p - 1) : (3 - 4 * p);
    case 'saw': return 2 * p - 1;
    case 'sine':
    default: return Math.sin(2 * Math.PI * p);
  }
}

// Envelope curto (attack/release em ms) — evita cliques de início/fim e dá
// uma "articulação" natural às notas, tipo synth 8-bit.
function shortEnvelope(t, dur, attackSec = 0.008, releaseSec = 0.03) {
  const a = Math.min(attackSec, dur * 0.3);
  const r = Math.min(releaseSec, dur * 0.4);
  if (t < a) return t / a;
  if (t > dur - r) return Math.max(0, (dur - t) / r);
  return 1;
}

function makeBuffer(ctx, durationSec) {
  const sampleRate = ctx.sampleRate;
  const length = Math.max(1, Math.ceil(durationSec * sampleRate));
  const buffer = ctx.createBuffer(1, length, sampleRate);
  return { buffer, data: buffer.getChannelData(0), sampleRate, length };
}

function normalize(data, length, ceiling = 0.92) {
  let peak = 0;
  for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(data[i]));
  if (peak > ceiling) {
    const g = ceiling / peak;
    for (let i = 0; i < length; i++) data[i] *= g;
  }
}

// Tom simples com possibilidade de "sweep" de frequência (usado em tiros,
// swings de espada, sinos de level up) — freqEnd opcional faz a frequência
// deslizar linearmente de freq até freqEnd ao longo da duração.
export function renderTone(ctx, { freq, freqEnd = null, duration = 0.15, wave = 'square', volume = 0.5 }) {
  const { buffer, data, sampleRate, length } = makeBuffer(ctx, duration);
  let phase = 0;
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const f = freqEnd != null ? freq + (freqEnd - freq) * (t / duration) : freq;
    phase += f / sampleRate;
    const env = shortEnvelope(t, duration);
    data[i] = waveSample(phase, wave) * volume * env;
  }
  normalize(data, length);
  return buffer;
}

// Ruído branco com decaimento exponencial e filtro passa-baixa de 1 polo
// simples (média móvel com peso) — usado em hits, explosões, passos de
// eletricidade. `cutoff` de 0 (abafado) a 1 (brilhante/áspero).
export function renderNoise(ctx, { duration = 0.2, volume = 0.5, cutoff = 0.5, decayRate = 12 }) {
  const { buffer, data, sampleRate, length } = makeBuffer(ctx, duration);
  const alpha = Math.max(0.02, Math.min(1, cutoff));
  let prev = 0;
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const raw = Math.random() * 2 - 1;
    prev = prev + alpha * (raw - prev);
    const decay = Math.exp(-t * decayRate);
    data[i] = prev * volume * decay;
  }
  normalize(data, length);
  return buffer;
}

// Concatena vários tons curtos em sequência — usado pra arpejos (level up,
// vitória) e jingles curtos (game over).
export function renderSequence(ctx, notes) {
  const totalDuration = notes.reduce((sum, n) => sum + n.duration, 0);
  const { buffer, data, sampleRate, length } = makeBuffer(ctx, totalDuration);
  let offsetSec = 0;
  for (const note of notes) {
    const freq = typeof note.freq === 'number' ? note.freq : noteFreq(note.note);
    const freqEnd = note.freqEnd != null ? note.freqEnd : (note.noteEnd ? noteFreq(note.noteEnd) : null);
    const startSample = Math.floor(offsetSec * sampleRate);
    const noteSamples = Math.floor(note.duration * sampleRate);
    let phase = 0;
    for (let s = 0; s < noteSamples; s++) {
      const idx = startSample + s;
      if (idx >= length) break;
      const t = s / sampleRate;
      const f = freqEnd != null ? freq + (freqEnd - freq) * (t / note.duration) : freq;
      phase += f / sampleRate;
      const env = shortEnvelope(t, note.duration);
      data[idx] += waveSample(phase, note.wave || 'square') * (note.volume ?? 0.5) * env;
    }
    offsetSec += note.duration;
  }
  normalize(data, length);
  return buffer;
}

// Loop musical curto tipo chiptune: baixo + melodia (osciladores) e uma
// trilha de percussão opcional (ruído), somados por amostra (síntese
// aditiva). `bass`/`lead`/`perc` são arrays de mesmo tamanho, um passo por
// posição — string de nota (ex. 'C3'), ou null pra silêncio. Desenhado pra
// terminar exatamente no fim do último passo, com todas as notas com
// release completo antes disso, pra dar loop sem estalo perceptível.
export function renderLoop(ctx, {
  bpm = 120, stepsPerBeat = 2,
  bass = [], lead = [], perc = [],
  waveBass = 'square', waveLead = 'triangle',
  volBass = 0.22, volLead = 0.16, volPerc = 0.14
}) {
  const stepSec = 60 / bpm / stepsPerBeat;
  const totalSteps = Math.max(bass.length, lead.length, perc.length, 1);
  const totalDuration = stepSec * totalSteps;
  const { buffer, data, sampleRate, length } = makeBuffer(ctx, totalDuration);

  function addTonalTrack(pattern, wave, vol) {
    for (let i = 0; i < pattern.length; i++) {
      const note = pattern[i];
      if (!note) continue;
      const freq = noteFreq(note);
      if (!freq) continue;
      const startSample = Math.floor(i * stepSec * sampleRate);
      const noteDur = stepSec * 0.9;
      const noteSamples = Math.floor(noteDur * sampleRate);
      let phase = 0;
      for (let s = 0; s < noteSamples; s++) {
        const idx = startSample + s;
        if (idx >= length) break;
        const t = s / sampleRate;
        phase += freq / sampleRate;
        const env = shortEnvelope(t, noteDur, 0.006, 0.05);
        data[idx] += waveSample(phase, wave) * vol * env;
      }
    }
  }

  function addPercTrack(pattern, vol) {
    for (let i = 0; i < pattern.length; i++) {
      if (!pattern[i]) continue;
      const startSample = Math.floor(i * stepSec * sampleRate);
      const hitDur = Math.min(stepSec * 0.6, 0.07);
      const hitSamples = Math.floor(hitDur * sampleRate);
      let prev = 0;
      for (let s = 0; s < hitSamples; s++) {
        const idx = startSample + s;
        if (idx >= length) break;
        const raw = Math.random() * 2 - 1;
        prev = prev + 0.6 * (raw - prev);
        const decay = Math.exp(-(s / sampleRate) * 40);
        data[idx] += prev * vol * decay;
      }
    }
  }

  addTonalTrack(bass, waveBass, volBass);
  addTonalTrack(lead, waveLead, volLead);
  addPercTrack(perc, volPerc);

  normalize(data, length, 0.85);
  return buffer;
}
