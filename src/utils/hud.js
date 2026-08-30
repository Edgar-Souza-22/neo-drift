// `scene.launch('UIScene')` inicia a cena de forma assíncrona — se a cena
// que chama emitir 'hud-init' logo em seguida, o listener do UIScene pode
// ainda não existir e o evento se perde (isso não afeta 'player-stats'/
// 'enemies-remaining' porque esses são reemitidos a cada frame em update(),
// mas 'hud-init' só dispara uma vez). Este helper garante que só emitimos
// depois que o UIScene está de fato pronto para ouvir.
export function initHud(scene, callback) {
  if (scene.scene.isActive('UIScene')) {
    callback();
  } else {
    scene.scene.launch('UIScene');
    scene.scene.get('UIScene').events.once('create', callback);
  }
}
