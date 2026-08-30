// Utilitário de desenho "pixel a pixel" usado pelo BootScene para gerar
// sprites com aparência de pixel art de verdade (bordas duras, contorno
// automático de 1px) em vez das formas suaves (fillCircle/fillRoundedRect)
// do Phaser, que ficam com cara de ícone vetorial em resoluções pequenas.

export function createGrid(w, h) {
  return { w, h, cells: Array.from({ length: h }, () => Array(w).fill(null)) };
}

export function fillRect(grid, x0, y0, w, h, color) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      if (x >= 0 && x < grid.w && y >= 0 && y < grid.h) grid.cells[y][x] = color;
    }
  }
}

export function fillCircle(grid, cx, cy, r, color) {
  const r2 = r * r;
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const dx = x - cx + 0.5;
      const dy = y - cy + 0.5;
      if (dx * dx + dy * dy <= r2) grid.cells[y][x] = color;
    }
  }
}

// Esvazia uma região circular de volta pro "transparente" (null) — usado pra
// abrir o miolo de um anel/badge a partir de um círculo já preenchido.
export function clearCircle(grid, cx, cy, r) {
  const r2 = r * r;
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const dx = x - cx + 0.5;
      const dy = y - cy + 0.5;
      if (dx * dx + dy * dy <= r2) grid.cells[y][x] = null;
    }
  }
}

// Repinta apenas células já preenchidas (nunca muda a silhueta) — usado
// para detalhes/painéis internos (viseira, costura, luz) sem furar o contorno.
export function paintOver(grid, x0, y0, w, h, color) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      if (x >= 0 && x < grid.w && y >= 0 && y < grid.h && grid.cells[y][x] != null) {
        grid.cells[y][x] = color;
      }
    }
  }
}

export function setPixel(grid, x, y, color) {
  if (x >= 0 && x < grid.w && y >= 0 && y < grid.h) grid.cells[y][x] = color;
}

// Repinta células já preenchidas com base em ruído simplex (nunca muda a
// silhueta, igual paintOver) — dá um acabamento orgânico "sombreado em
// camadas" (manchas, veios, corrosão) em vez de blocos lisos de cor sólida.
// `noise2D` vem de simplex-noise; `threshold` em [-1,1] controla quanta área
// vira `color` (quanto maior, menos células afetadas). `region` (opcional,
// {x0,y0,w,h}) restringe o efeito a uma sub-área — usado quando a forma que
// deve receber o ruído fica colada a outra forma já pintada no mesmo grid
// (ex.: um glifo por cima de um anel), pra não vazar manchas pra fora dela.
export function mottle(grid, noise2D, { color, threshold = 0.15, scale = 0.22, offsetX = 0, offsetY = 0, region = null } = {}) {
  const x0 = region ? Math.max(0, region.x0) : 0;
  const y0 = region ? Math.max(0, region.y0) : 0;
  const x1 = region ? Math.min(grid.w, region.x0 + region.w) : grid.w;
  const y1 = region ? Math.min(grid.h, region.y0 + region.h) : grid.h;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (grid.cells[y][x] == null) continue;
      const n = noise2D((x + offsetX) * scale, (y + offsetY) * scale);
      if (n > threshold) grid.cells[y][x] = color;
    }
  }
}

// Renderiza o grid num Graphics: primeiro passo desenha o contorno de 1px
// (qualquer célula vazia vizinha a uma célula preenchida), depois o preenchimento.
export function renderGrid(g, grid, outlineColor = 0x05060c) {
  const { w, h, cells } = grid;

  g.fillStyle(outlineColor, 1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (cells[y][x] != null) continue;
      const hasNeighbor =
        (x > 0 && cells[y][x - 1] != null) ||
        (x < w - 1 && cells[y][x + 1] != null) ||
        (y > 0 && cells[y - 1][x] != null) ||
        (y < h - 1 && cells[y + 1][x] != null);
      if (hasNeighbor) g.fillRect(x, y, 1, 1);
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = cells[y][x];
      if (c == null) continue;
      g.fillStyle(c, 1);
      g.fillRect(x, y, 1, 1);
    }
  }
}
