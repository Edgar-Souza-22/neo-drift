# Neo Drift — Colônia de Quarentena

Sprites pixel-art gerados por `neo-sprites/build_colonia.py` (pipeline
pixelGrid / Pillow, o mesmo de Mercado Negro). Outline 1px ortogonal
`#060A04` nos sprites/props/inimigos; boss `#040804`. Sem anti-alias,
sem sombra projetada, sem diamantes isométricos. Pisos/parede **não**
levam inundação neon — o verde tóxico `#6DFF4A` aparece só em lâmpadas
minúsculas, `floor_toxic`, cápsula, inimigos, boss e o selo da porta.

## Como empacotar no jogo

Copiar `png/*.png` para:

`C:\\Users\\LS.NOT 110\\Documents\\Projetos\\neo-isometric-rpg\\art\\colonia\\png\\`

O BootScene atualmente só faz glob em `art/neo-sprites-lote6` e
`art/mercado-negro` — é preciso adicionar um glob para
`art/colonia/png/*.png`. (Este lote **não** editou o laptop.)

Chaves Phaser = nome do arquivo sem `.png`. Drop-in de animação = frame 0
(`enemy_infected.png` = `enemy_infected_0`). Origin 0.5/0.5 nos personagens.
`pixelArt: true`, `TILE_SIZE = 32`.

Anims sugeridas:

```js
['enemy_infected','enemy_bloated','enemy_enfermeiro','boss_matriarch'].forEach(k => {
  this.anims.create({ key: k+'_idle', frames: [0,1,2,3].map(i => ({ key: `${k}_${i}` })), frameRate: 6, repeat: -1 });
});
```

## Tiles 32×32 (opacos)

| file | size | fps | notes |
|---|---|---|---|
| `png/floor_colonia.png` | 32×32 | 1 | placas azeitona `#141810`/`#1e2618`, sheen molhado, 1 mancha de ferrugem, 1 rebite escuro. Corredor quieto. Sem poças verdes. |
| `png/floor_colonia_vent.png` | 32×32 | 1 | mesmo oliva, grelha, **poucos** pixels de vazamento tóxico por baixo. |
| `png/floor_colonia_stain.png` | 32×32 | 1 | smear orgânico `#1a2214`/`#2a3a1c` — fluido seco, não piscina neon. Ainda azuleja. |
| `png/floor_toxic.png` | 32×32 | 1 | **hazard**: poço `#0c1608`, duas poças `#1a3a10`/`#244818`, brilho esparso `#6dff4a`/`#9fff6a`/`#c8ff90`. |
| `png/wall_colonia.png` | 32×32 | 1 | placas oliva, viga de ferrugem de largura total, lâmpada tóxica 2px, stencil minúsculo. |
| `png/door_colonia.png` | 32×32 | 1 | escotilha de quarentena, duas folhas oliva/ferrugem, moldura escura, selo verde + diamante biohazard. A cena tinge `0xff4a5e` se trancada — **não** é ciano. |
| `sheets/tiles_colonia.png` | 192×32 | 1 | floor \| vent \| stain \| toxic \| wall \| door |
| `piskel/tiles_colonia.piskel` | 32×32 | 1 | 6 frames |

## Tambores de filtro (puzzle, 32×32)

Mesmo layout (tambor industrial visto de cima). Só o mostrador muda.

| file | size | fps | notes |
|---|---|---|---|
| `png/tile_filter_0.png` | 32×32 | 1 | **fechado** — dial `#8A2020` core `#FF6A6A`, tick vertical |
| `png/tile_filter_1.png` | 32×32 | 1 | **meio** — dial `#C9A03A` core `#FFE066` |
| `png/tile_filter_2.png` | 32×32 | 1 | **aberto** — dial `#5AD040` core `#C8FF90` |
| `sheets/tile_filter.png` | 96×32 | 1 | 3 estados |
| `piskel/tile_filter.piskel` | 32×32 | 1 | 3 frames |

## Prop

| file | size | fps | notes |
|---|---|---|---|
| `png/prop_capsule.png` | 14×22 | 1 | tanque de vidro de quarentena, tampas de metal, fluido verde, 2–3 px de glow. Cantos transparentes. |
| `sheets/prop_capsule.png` | 14×22 | 1 | 1 frame |
| `piskel/prop_capsule.piskel` | 14×22 | 1 | 1 frame |

## Inimigos — idle 4 frames @ 6 fps

Silhuetas distintas de `enemy_smuggler` (capuz 16×20), `enemy_dweller`
(blob feral 16×20) e `enemy_enforcer` (ombreira dourada 20×20).

| file | size | fps | notes |
|---|---|---|---|
| `png/enemy_infected.png` | 16×20 | 6 | drop-in = frame 0. Humanóide curvado, pele verde, trapos marrons, um braço caído, olhos `#6dff4a`. |
| `png/enemy_infected_0.png` … `_3.png` | 16×20 | 6 | idle: head bob 1px + flap do trapo |
| `sheets/enemy_infected.png` | 64×20 | 6 | 4 frames |
| `piskel/enemy_infected.piskel` | 16×20 | 6 | 4 frames |
| `png/enemy_bloated.png` | 22×22 | 6 | drop-in. Tronco inchado enorme (círculo r≈8), cabeça pequena, pernas curtas, pústulas. |
| `png/enemy_bloated_0.png` … `_3.png` | 22×22 | 6 | idle: squash da barriga 1px + pulso das pústulas |
| `sheets/enemy_bloated.png` | 88×22 | 6 | 4 frames |
| `piskel/enemy_bloated.piskel` | 22×22 | 6 | 4 frames |
| `png/enemy_enfermeiro.png` | 24×28 | 6 | drop-in. Mini-boss: máscara de gás com fenda verde, avental branco rasgado sobre casaco, cajado-seringa. |
| `png/enemy_enfermeiro_0.png` … `_3.png` | 24×28 | 6 | idle: pulso da viseira + tilt 1px da agulha |
| `sheets/enemy_enfermeiro.png` | 96×28 | 6 | 4 frames |
| `piskel/enemy_enfermeiro.piskel` | 24×28 | 6 | 4 frames |

## Boss — Matriarca

| file | size | fps | notes |
|---|---|---|---|
| `png/boss_matriarch.png` | 48×46 | 6 | drop-in = frame 0. Criatura orgânica (não humana, não mecha). Massa de carne, dois lóbulos inferiores, sacos de ovos com núcleos tóxicos, poço central pulsante. Outline `#040804`. |
| `png/boss_matriarch_0.png` … `_3.png` | 48×46 | 6 | idle: pulso do núcleo (raio/brilho) + throb dos sacos + squash vertical 1px |
| `sheets/boss_matriarch.png` | 192×46 | 6 | 4 frames |
| `piskel/boss_matriarch.piskel` | 48×46 | 6 | 4 frames |

## Previews 8× (nearest)

Em `preview-8x/`: cada chave `@8x.png` e as sheets `*_sheet@8x.png`
(`tiles_colonia_sheet@8x`, `tile_filter_sheet@8x`, inimigos, boss).

## Paleta

| nome | hex | uso |
|---|---|---|
| OLIVE_A / OLIVE_B | `#141810` / `#1e2618` | piso / parede |
| STAIN_A / STAIN_B | `#1a2214` / `#2a3a1c` | smear seco |
| TOXIC / HI / HOT / DK / PIT | `#6dff4a` / `#9fff6a` / `#c8ff90` / `#3a6a20` / `#0c1608` | hazard, glow, inimigos |
| FLESH / LT / DK | `#3a4a28` / `#5a6a38` / `#1a2410` | boss |
| SKIN / SKIN_DK | `#5a7a3a` / `#3a5228` | infectado / inchado |
| RAG / COAT / APRON / MASK / NEEDLE | `#3a3428` / `#3a4034` / `#d8dcc8` / `#1a2018` / `#c8d0d8` | enfermeiro |
| RUST / METAL | `#4a2c22` / `#3a4038` | desgaste |
| COL_OUT / BOSS_OUT | `#060a04` / `#040804` | outline |

