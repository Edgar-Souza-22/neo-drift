// Construção programática do Distrito Neon (hub da cidade) — mesmo estilo
// do TownLayout.js. Praça central com 4 saídas em direções diferentes: norte
// (retorno pra Ala Central), sul (Torre de Segurança), oeste (Arsenal
// Blindado) e leste (Nexo de Transporte) — antes as 3 portas de fase ficavam
// todas amontoadas perto do topo; agora cada uma tem seu próprio corredor e
// alcova, então lêem como locais distintos, não a mesma esquina. A Central
// de Vigilância (Fase 08) fica mais além do Nexo, no fim do mesmo corredor
// leste — ela só existe depois de fechar o Nexo mesmo, então faz sentido
// espacial ficar "mais fundo" na mesma direção, não numa 5ª ponta nova.

const WIDTH = 34;
const HEIGHT = 21;

function carveRect(grid, x1, y1, x2, y2) {
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      grid[y][x] = '.';
    }
  }
}

function wallRect(grid, x1, y1, x2, y2) {
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      grid[y][x] = '#';
    }
  }
}

export function buildNeonDistrict() {
  const grid = Array.from({ length: HEIGHT }, () => Array(WIDTH).fill('#'));

  // Praça central — ponto de chegada, de onde partem os 4 caminhos.
  carveRect(grid, 9, 9, 17, 13);

  // Norte — corredor + alcova do portal de retorno pra Ala Central.
  carveRect(grid, 12, 1, 14, 9);
  carveRect(grid, 10, 1, 16, 4);

  // Sul — corredor + alcova da Torre de Segurança (Fase 05, sempre aberta).
  carveRect(grid, 12, 13, 14, 19);
  carveRect(grid, 10, 16, 16, 19);

  // Oeste — corredor + alcova do Arsenal Blindado (Fase 06, após towerCleared).
  carveRect(grid, 1, 10, 9, 12);
  carveRect(grid, 1, 8, 6, 14);

  // Leste — corredor + alcova do Nexo de Transporte (Fase 07, após
  // arsenalCleared).
  carveRect(grid, 17, 10, 25, 12);
  carveRect(grid, 20, 8, 25, 14);

  // Mais além do Nexo — corredor + alcova da Central de Vigilância (Fase 08,
  // após nexusCleared) — fecha de vez o arco do Distrito Neon.
  carveRect(grid, 26, 10, 28, 12);
  carveRect(grid, 28, 8, 33, 14);

  // Quiosques decorativos na praça — só bloqueiam passagem, não a rota principal.
  wallRect(grid, 10, 10, 10, 10);
  wallRect(grid, 16, 10, 16, 10);

  const markers = {
    S: [{ gx: 13, gy: 11 }],
    // Portal de volta pra Ala Central — sempre disponível, sem gancho.
    P: [{ gx: 13, gy: 3 }],
    // Porta de entrada pra Torre de Segurança (Fase 05).
    E: [{ gx: 13, gy: 18 }],
    // Porta de entrada pro Arsenal Blindado (Fase 06) — só aparece depois
    // de towerCleared (ver DistrictScene).
    G: [{ gx: 3, gy: 11 }],
    // Porta de entrada pro Nexo de Transporte (Fase 07) — só aparece depois
    // de arsenalCleared (ver DistrictScene).
    Z: [{ gx: 22, gy: 11 }],
    // Porta de entrada pra Central de Vigilância (Fase 08) — só aparece
    // depois de nexusCleared (ver DistrictScene). Fecha o arco do Distrito.
    V: [{ gx: 31, gy: 11 }],
    // Contrabandista + buraco pro Submundo — só aparecem depois de
    // vigilanceCleared (ver DistrictScene), na mesma alcova da Central de
    // Vigilância (é o que a fase acabou de expor).
    CB: [{ gx: 29, gy: 13 }],
    BU: [{ gx: 31, gy: 13 }],
    N: [{ gx: 12, gy: 12 }, { gx: 14, gy: 12 }]
  };

  return { grid, markers, width: WIDTH, height: HEIGHT };
}
