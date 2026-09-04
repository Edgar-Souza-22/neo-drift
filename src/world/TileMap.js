import { TILE_SIZE } from '../utils/constants.js';

// Marcadores especiais lidos do layout e removidos do grid de colisão
// (a célula por baixo do marcador é sempre piso).
const MARKERS = new Set(['S', 'E', 'B', 'I', 'N', 'X', 'T', 'A']);

const HAZARD_PULSE = {
  electric: { alpha: 0.5, duration: 260 },
  toxic: { alpha: 0.58, duration: 780 }
};

export default class TileMap {
  // `layout` pode ser um array de strings ('#'/'.'+marcadores, ex.: TownScene)
  // ou, se `options.markers` for passado, um grid 2D já pronto (array de arrays
  // de '#'/'.') construído por código — usado por mapas maiores/gerados, onde
  // contar caracteres manualmente é fonte fácil de erro.
  constructor(scene, layout, options = {}) {
    this.scene = scene;
    this.rows = layout.length;
    this.cols = layout[0].length;
    this.grid = layout.map((row) => (Array.isArray(row) ? [...row] : row.split('')));
    this.wallTexture = options.wallTexture || 'wall';
    this.floorTexture = options.floorTexture || 'floor';
    this.floorVariants = options.floorVariants || [{ key: this.floorTexture, weight: 1 }];

    if (options.markers) {
      this.markers = options.markers;
    } else {
      this.markers = {};
      this._extractMarkers();
    }

    this.hazardTextures = {
      electric: options.electrifiedTexture || options.hazardTextures?.electric || 'floor_electric',
      toxic: options.hazardTextures?.toxic || 'floor_toxic'
    };

    // Piso perigoso por tipo (elétrico, tóxico, …). Cada célula guarda o
    // `kind`; a cena consulta `getHazard` / wrappers e aplica o efeito.
    // `electrifiedTiles` continua aceito — a Ala do Reator não precisa mudar.
    this.hazardByCell = new Map();
    for (const t of options.electrifiedTiles || []) {
      this.hazardByCell.set(`${t.gx},${t.gy}`, 'electric');
    }
    for (const t of options.hazardTiles || []) {
      this.hazardByCell.set(`${t.gx},${t.gy}`, t.kind || 'electric');
    }

    this._buildTiles();
  }

  _extractMarkers() {
    for (let gy = 0; gy < this.rows; gy++) {
      for (let gx = 0; gx < this.cols; gx++) {
        const ch = this.grid[gy][gx];
        if (MARKERS.has(ch)) {
          if (!this.markers[ch]) this.markers[ch] = [];
          this.markers[ch].push({ gx, gy });
          this.grid[gy][gx] = '.';
        }
      }
    }
  }

  gridToWorld(gx, gy) {
    return { x: gx * TILE_SIZE + TILE_SIZE / 2, y: gy * TILE_SIZE + TILE_SIZE / 2 };
  }

  _pickFloorTexture() {
    const total = this.floorVariants.reduce((sum, v) => sum + v.weight, 0);
    let r = Math.random() * total;
    for (const variant of this.floorVariants) {
      if (r < variant.weight) return variant.key;
      r -= variant.weight;
    }
    return this.floorVariants[0].key;
  }

  _buildTiles() {
    const byKind = { electric: [], toxic: [] };
    for (let gy = 0; gy < this.rows; gy++) {
      for (let gx = 0; gx < this.cols; gx++) {
        const wall = this.grid[gy][gx] === '#';
        const kind = wall ? null : this.hazardByCell.get(`${gx},${gy}`);
        const world = this.gridToWorld(gx, gy);
        const key = wall
          ? this.wallTexture
          : kind
            ? this.hazardTextures[kind] || this.floorTexture
            : this._pickFloorTexture();
        const img = this.scene.add.image(world.x, world.y, key);
        img.setDepth(wall ? gy * 10 + 3 : -5000);
        if (kind && byKind[kind]) byKind[kind].push(img);
      }
    }
    // Pulso de alpha por tipo — elétrico "descarga" rápido; tóxico "respira"
    // mais lento, como lodo.
    for (const [kind, images] of Object.entries(byKind)) {
      if (!images.length) continue;
      const pulse = HAZARD_PULSE[kind] || HAZARD_PULSE.electric;
      this.scene.tweens.add({
        targets: images,
        alpha: pulse.alpha,
        duration: pulse.duration,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut'
      });
    }
  }

  isWalkable(gx, gy) {
    if (gx < 0 || gy < 0 || gy >= this.rows || gx >= this.cols) return false;
    return this.grid[gy][gx] !== '#';
  }

  getHazard(gx, gy) {
    return this.hazardByCell.get(`${Math.round(gx)},${Math.round(gy)}`) || null;
  }

  isElectrified(gx, gy) {
    return this.getHazard(gx, gy) === 'electric';
  }

  isToxic(gx, gy) {
    return this.getHazard(gx, gy) === 'toxic';
  }

  // Usado por portas trancadas: alterna a colisão de uma célula em tempo real
  // (a célula é renderizada por baixo de um sprite de porta dedicado, então o
  // tile visual original não precisa mudar).
  setWalkable(gx, gy, walkable) {
    this.grid[gy][gx] = walkable ? '.' : '#';
  }

  marker(key) {
    return this.markers[key] ? this.markers[key][0] : null;
  }

  allMarkers(key) {
    return this.markers[key] || [];
  }

  worldBounds() {
    return { width: this.cols * TILE_SIZE, height: this.rows * TILE_SIZE };
  }
}
