// Controle de reprodução — separado do SoundBank (que só gera os buffers).
// `scene.sound` é o SoundManager GLOBAL do Phaser (compartilhado por todas
// as cenas, não por-cena como Tweens/Time), então guardamos a música atual
// aqui fora de qualquer cena específica: ela sobrevive a trocas de cena sem
// precisar que a cena que a iniciou continue viva.
let currentMusicKey = null;
let currentMusicSound = null;

const MUTE_KEY = 'neo-drift-muted';

// Troca de trilha instantânea (sem crossfade) — evita depender do tween
// manager de uma cena específica, que pode ser destruída no meio da troca
// durante uma transição de fase.
export function playMusic(scene, key, volume = 0.32) {
  if (!scene.sound || !scene.sound.context) return;
  if (currentMusicKey === key && currentMusicSound && currentMusicSound.isPlaying) return;
  if (currentMusicSound) currentMusicSound.stop();
  currentMusicKey = key;
  currentMusicSound = scene.sound.add(key, { loop: true, volume });
  currentMusicSound.play();
}

export function stopMusic() {
  if (currentMusicSound) currentMusicSound.stop();
  currentMusicSound = null;
  currentMusicKey = null;
}

export function playSfx(scene, key, opts = {}) {
  if (!scene.sound || !scene.sound.context) return;
  scene.sound.play(key, { volume: opts.volume ?? 0.5 });
}

export function isMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch (e) {
    return false;
  }
}

// Chamado uma vez no boot — aplica a preferência salva antes de qualquer
// som tocar.
export function initMute(scene) {
  if (!scene.sound) return;
  scene.sound.mute = isMuted();
}

export function toggleMute(scene) {
  if (!scene.sound) return false;
  const next = !scene.sound.mute;
  scene.sound.mute = next;
  try {
    localStorage.setItem(MUTE_KEY, next ? '1' : '0');
  } catch (e) {
    // sem localStorage disponível — a preferência só vale pra esta sessão.
  }
  return next;
}
