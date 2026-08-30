#!/usr/bin/env python3
"""
Neo Drift sprite batch — pixelGrid pipeline in Python.

Recreates src/utils/pixelGrid.js + the BootScene generators for the first
art batch (player walk/atk, drone, containment tiles, items, worker NPC).

No anti-alias, no drop shadows, no isometric diamonds. Integer pixels only.
Outline is baked into each PNG (1px orthogonal-neighbor, color #05060C by
default) so the user can pack images without going through generateTexture.

Re-run:  python3 /workspace/neo-sprites/build_sprites.py
"""

from __future__ import annotations

import base64
import io
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent
PNG_DIR = ROOT / "png"
SHEET_DIR = ROOT / "sheets"
PISKEL_DIR = ROOT / "piskel"
PREVIEW_DIR = ROOT / "preview-8x"

# ---------------------------------------------------------------------------
# Palette (0xRRGGBB ints, same as BootScene)
# ---------------------------------------------------------------------------
OUTLINE = 0x05060C
VISOR = 0x37F0FF
MINT = 0x9FFFE8
BOOT_GLOW = 0x18E8FF
SHOULDER = 0x2F8FE0
HELMET_DARK = 0x232A52
HELMET_LIGHT = 0x3B4270
BODY_DARK = 0x1C2038
BODY_LIGHT = 0x2F3560
LEGS = 0x101225
ENEMY_RED = 0xFF3B52
ENEMY_HULL = 0x33101A
ENEMY_MID = 0x5C1C2A
ENEMY_FIN = 0x7A1F2C
ENEMY_HIGHLIGHT = 0xFFB3C0
HAZARD_YELLOW = 0xE8B93D
GOLD = 0xFFE066
ORANGE = 0xFF8A3D
WALL_BODY = 0x272C4E
WALL_FRAME = 0x14172A
WALL_ACCENT = 0xFFB347
WALL_PLATE = 0x3A4178
FLOOR_A = 0x232742
FLOOR_B = 0x2C3156
SKIN = 0xD8C9A0
HELMET_SEAM = 0x171A33
BLADE = 0xF2FFFF
GAUNTLET = 0xBFE9FF
SWORD_BLADE = 0xDFF7FF
SWORD_HILT = 0x8A5A2B
WORKER_BODY = 0x2F4A3C
WORKER_LEGS = 0x3C6B52
WORKER_BRIM = 0xD1A900
DOOR_BG = 0x0A1C22
DOOR_LEAF = 0x123338
DOOR_RIVET = 0x2FB8C8
HAZARD_BASE = 0x18161A
HAZARD_BAR = 0x0A0A0C
ARMOR_BODY = 0xFFE9C2
ARMOR_STRIPE = 0xFF9D3D
ARMOR_GLINT = 0xFFD27A
MEDKIT_BODY = 0xE8ECF0
MEDKIT_LIP = 0xC7CED6
PISTOL_BODY = 0x3A4178
PISTOL_LIGHT = 0x5F6BB0
PISTOL_GRIP_TIP = 0x0A0C18

TILE = 32


def rgb(c: int) -> tuple[int, int, int]:
    return ((c >> 16) & 255, (c >> 8) & 255, c & 255)


def shade(color: int, dr: int, dg: int, db: int) -> int:
    r = max(0, min(255, ((color >> 16) & 255) + dr))
    g = max(0, min(255, ((color >> 8) & 255) + dg))
    b = max(0, min(255, (color & 255) + db))
    return (r << 16) | (g << 8) | b


# ---------------------------------------------------------------------------
# pixelGrid.js
# ---------------------------------------------------------------------------
def create_grid(w: int, h: int) -> dict:
    return {"w": w, "h": h, "cells": [[None] * w for _ in range(h)]}


def fill_rect(grid, x0, y0, w, h, color):
    for y in range(y0, y0 + h):
        for x in range(x0, x0 + w):
            if 0 <= x < grid["w"] and 0 <= y < grid["h"]:
                grid["cells"][y][x] = color


def fill_circle(grid, cx, cy, r, color):
    r2 = r * r
    for y in range(grid["h"]):
        for x in range(grid["w"]):
            dx = x - cx + 0.5
            dy = y - cy + 0.5
            if dx * dx + dy * dy <= r2:
                grid["cells"][y][x] = color


def paint_over(grid, x0, y0, w, h, color):
    for y in range(y0, y0 + h):
        for x in range(x0, x0 + w):
            if 0 <= x < grid["w"] and 0 <= y < grid["h"] and grid["cells"][y][x] is not None:
                grid["cells"][y][x] = color


def set_pixel(grid, x, y, color):
    if 0 <= x < grid["w"] and 0 <= y < grid["h"]:
        grid["cells"][y][x] = color


def render_grid(grid, outline_color: int = OUTLINE) -> Image.Image:
    """Bake fill + 1px orthogonal-neighbor outline into an RGBA PNG image."""
    w, h = grid["w"], grid["h"]
    cells = grid["cells"]
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = img.load()
    oc = rgb(outline_color) + (255,)

    for y in range(h):
        for x in range(w):
            if cells[y][x] is not None:
                continue
            has_neighbor = (
                (x > 0 and cells[y][x - 1] is not None)
                or (x < w - 1 and cells[y][x + 1] is not None)
                or (y > 0 and cells[y - 1][x] is not None)
                or (y < h - 1 and cells[y + 1][x] is not None)
            )
            if has_neighbor:
                px[x, y] = oc

    for y in range(h):
        for x in range(w):
            c = cells[y][x]
            if c is None:
                continue
            r, g, b = rgb(c)
            px[x, y] = (r, g, b, 255)
    return img


def save_png(img: Image.Image, name: str) -> Path:
    path = PNG_DIR / f"{name}.png"
    img.save(path, "PNG")
    return path


def hstrip(frames: list[Image.Image]) -> Image.Image:
    w, h = frames[0].size
    sheet = Image.new("RGBA", (w * len(frames), h), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.paste(f, (i * w, 0))
    return sheet


def preview_8x(img: Image.Image) -> Image.Image:
    w, h = img.size
    return img.resize((w * 8, h * 8), Image.NEAREST)


def png_to_data_uri(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def write_piskel(name: str, description: str, frames: list[Image.Image], fps: int) -> Path:
    w, h = frames[0].size
    n = len(frames)
    strip = hstrip(frames)
    layer = [
        {
            "name": "Layer 1",
            "opacity": 1,
            "frameCount": n,
            "chunks": [
                {
                    "layout": [list(range(n))],
                    "base64PNG": png_to_data_uri(strip),
                }
            ],
        }
    ]
    doc = {
        "modelVersion": 2,
        "piskel": {
            "name": name,
            "description": description,
            "fps": fps,
            "height": h,
            "width": w,
            "layers": json.dumps(layer, separators=(",", ":")),
        },
    }
    path = PISKEL_DIR / f"{name}.piskel"
    path.write_text(json.dumps(doc, indent=2), encoding="utf-8")
    return path


def composite(base: Image.Image, overlay: Image.Image) -> Image.Image:
    """Stamp overlay's opaque pixels over base (NPC head over body)."""
    out = base.copy()
    bp, op = out.load(), overlay.load()
    w, h = out.size
    for y in range(h):
        for x in range(w):
            p = op[x, y]
            if p[3] != 0:
                bp[x, y] = p
    return out


# ---------------------------------------------------------------------------
# Player 16×22
# ---------------------------------------------------------------------------
def _mottle_armor(grid):
    """A few deterministic wear pixels on the dark torso — not simplex soup."""
    dark = shade(BODY_DARK, -8, -8, -6)
    light = shade(BODY_DARK, 8, 8, 10)
    for x, y in ((4, 13), (11, 14), (4, 16), (10, 16)):
        if grid["cells"][y][x] == BODY_DARK:
            grid["cells"][y][x] = dark
    for x, y in ((6, 15), (9, 13)):
        if grid["cells"][y][x] == BODY_DARK:
            grid["cells"][y][x] = light


def build_player_base(left_y: int, right_y: int, mottle: bool = True) -> dict:
    """Port of BootScene._buildPlayerBase with a 4-frame walk (leftY/rightY)."""
    grid = create_grid(16, 22)
    fill_circle(grid, 8, 6, 5, HELMET_DARK)
    paint_over(grid, 3, 3, 10, 3, HELMET_LIGHT)
    fill_rect(grid, 3, 9, 10, 9, BODY_DARK)
    paint_over(grid, 5, 10, 6, 3, BODY_LIGHT)
    if mottle:
        _mottle_armor(grid)
    fill_rect(grid, 1, 9, 3, 5, SHOULDER)
    fill_rect(grid, 12, 9, 3, 5, SHOULDER)

    fill_rect(grid, 5, left_y, 3, 4, LEGS)
    fill_rect(grid, 8, right_y, 3, 4, LEGS)
    # Glow on the last on-canvas row of each boot (improves the original
    # shuffle where the receding leg's glow clipped off y=22).
    left_glow = min(left_y + 3, grid["h"] - 1)
    right_glow = min(right_y + 3, grid["h"] - 1)
    paint_over(grid, 5, left_glow, 3, 1, BOOT_GLOW)
    paint_over(grid, 8, right_glow, 3, 1, BOOT_GLOW)
    return grid


WALK = (
    (18, 18),  # 0 plant
    (17, 19),  # 1 left forward
    (18, 18),  # 2 contact
    (19, 17),  # 3 right forward
)

DOWN_ATK0 = [(13, 10), (14, 9), (14, 8), (15, 7), (15, 6), (15, 5), (15, 4)]
DOWN_ATK1 = [(13, 9), (14, 8), (14, 7), (15, 6), (15, 5), (15, 4), (15, 3)]
SIDE_ATK0 = [(14, 11), (15, 10), (15, 9), (15, 8), (15, 7), (15, 6)]
SIDE_ATK1 = [(14, 10), (15, 9), (15, 8), (15, 7), (15, 6), (15, 5), (15, 4)]


def paint_down(grid):
    paint_over(grid, 3, 6, 10, 2, VISOR)


def paint_up(grid):
    set_pixel(grid, 7, 0, BOOT_GLOW)
    set_pixel(grid, 8, 0, BOOT_GLOW)
    paint_over(grid, 7, 2, 2, 7, HELMET_SEAM)


def paint_side(grid, gauntlet=True):
    paint_over(grid, 10, 6, 2, 2, VISOR)
    if gauntlet:
        fill_rect(grid, 13, 11, 2, 1, GAUNTLET)


def raise_right_arm(grid):
    """1px shoulder lift for atk1, still inside 16×22."""
    fill_rect(grid, 12, 8, 3, 1, SHOULDER)


def make_player(direction: str, left_y: int, right_y: int, *,
                blade=None, atk1=False, gauntlet=True) -> Image.Image:
    grid = build_player_base(left_y, right_y)
    if direction == "down":
        paint_down(grid)
    elif direction == "up":
        paint_up(grid)
    elif direction == "side":
        paint_side(grid, gauntlet=gauntlet)
    if atk1:
        raise_right_arm(grid)
        if direction == "side":
            fill_rect(grid, 13, 10, 2, 1, GAUNTLET)
    if blade:
        for x, y in blade:
            set_pixel(grid, x, y, BLADE)
    return render_grid(grid)


# ---------------------------------------------------------------------------
# Drone enemy 18×16
# ---------------------------------------------------------------------------
def make_enemy(dy: int, thruster: int) -> Image.Image:
    grid = create_grid(18, 16)
    cy = 7 + dy
    fill_circle(grid, 9, cy, 6, ENEMY_HULL)
    fill_circle(grid, 9, cy, 4, ENEMY_MID)
    fill_circle(grid, 9, cy, 2, ENEMY_RED)
    set_pixel(grid, 7, 5 + dy, ENEMY_HIGHLIGHT)
    fill_rect(grid, 0, 6 + dy, 3, 4, ENEMY_FIN)
    fill_rect(grid, 15, 6 + dy, 3, 4, ENEMY_FIN)
    fill_rect(grid, 7, 13 + dy, 4, 2, thruster)
    return render_grid(grid)


# ---------------------------------------------------------------------------
# Tiles 32×32 (containment biome) — structure from BootScene + rivets/wear
# ---------------------------------------------------------------------------
def _tile_wear(grid, base, spots_dark, spots_light):
    d = shade(base, -10, -10, -8)
    l = shade(base, 8, 8, 10)
    for x, y in spots_dark:
        if grid["cells"][y][x] == base:
            grid["cells"][y][x] = d
    for x, y in spots_light:
        if grid["cells"][y][x] == base:
            grid["cells"][y][x] = l


def make_floor() -> Image.Image:
    s = TILE
    base, edge = FLOOR_A, FLOOR_B
    bevel = shade(base, 18, 18, 22)
    grid = create_grid(s, s)
    fill_rect(grid, 0, 0, s, s, base)
    paint_over(grid, 0, 0, s, 1, bevel)
    paint_over(grid, 0, 0, 1, s, bevel)
    paint_over(grid, s // 2 - 1, 0, 1, s, edge)
    paint_over(grid, 0, s // 2 - 1, s, 1, edge)
    for x, y in ((3, 3), (s - 4, 3), (3, s - 4), (s - 4, s - 4)):
        set_pixel(grid, x, y, edge)
    # extra inner rivets + 1px wear (replaces omitted simplex mottle)
    bolt = shade(edge, -6, -6, -4)
    for x, y in ((8, 8), (23, 8), (8, 23), (23, 23)):
        set_pixel(grid, x, y, bolt)
        set_pixel(grid, x + 1, y, shade(base, 12, 12, 14))  # tiny glint
    _tile_wear(
        grid, base,
        spots_dark=((6, 5), (11, 10), (20, 6), (25, 12), (14, 22), (22, 26)),
        spots_light=((7, 20), (10, 27), (18, 9), (26, 21)),
    )
    return render_grid(grid)


def make_floor_vent() -> Image.Image:
    s = TILE
    base, edge = FLOOR_A, FLOOR_B
    grid = create_grid(s, s)
    fill_rect(grid, 0, 0, s, s, base)
    y = 4
    while y < s - 2:
        paint_over(grid, 3, y, s - 6, 1, edge)
        y += 4
    paint_over(grid, 2, 2, s - 4, 1, edge)
    paint_over(grid, 2, s - 3, s - 4, 1, edge)
    # grate holes (darker 1px between slats) + corner rivets
    hole = shade(base, -14, -14, -10)
    for gy in (6, 10, 14, 18, 22, 26):
        for gx in (6, 12, 19, 25):
            set_pixel(grid, gx, gy, hole)
    for x, y in ((3, 3), (s - 4, 3), (3, s - 4), (s - 4, s - 4)):
        set_pixel(grid, x, y, edge)
    _tile_wear(grid, base, ((5, 8), (24, 16), (9, 28)), ((16, 7), (21, 23)))
    return render_grid(grid)


def make_wall() -> Image.Image:
    s = TILE
    body, frame, accent, plate = WALL_BODY, WALL_FRAME, WALL_ACCENT, WALL_PLATE
    grid = create_grid(s, s)
    fill_rect(grid, 0, 0, s, s, frame)
    fill_rect(grid, 2, 2, s - 4, s - 4, body)
    paint_over(grid, 2, 2, s - 4, 2, accent)
    paint_over(grid, s // 2 - 1, 4, 1, s - 8, shade(frame, 8, 8, 10))
    fill_rect(grid, 6, 8, 5, 5, plate)
    fill_rect(grid, s - 11, 8, 5, 5, plate)
    fill_rect(grid, 6, s - 13, 5, 5, plate)
    fill_rect(grid, s - 11, s - 13, 5, 5, plate)
    rivet = shade(frame, 8, 8, 8)
    for x, y in ((8, 10), (s - 9, 10), (8, s - 11), (s - 9, s - 11)):
        set_pixel(grid, x, y, rivet)
        set_pixel(grid, x - 1, y - 1, shade(plate, 16, 16, 18))  # plate glint
    _tile_wear(
        grid, body,
        spots_dark=((4, 6), (12, 16), (20, 6), (27, 18), (10, 26)),
        spots_light=((5, 14), (24, 15), (16, 22)),
    )
    return render_grid(grid, outline_color=0x0A0B16)


def make_door() -> Image.Image:
    s = TILE
    grid = create_grid(s, s)
    fill_rect(grid, 0, 0, s, s, DOOR_BG)
    fill_rect(grid, 2, 2, 12, s - 4, DOOR_LEAF)
    fill_rect(grid, s - 14, 2, 12, s - 4, DOOR_LEAF)
    fill_rect(grid, s // 2 - 2, 2, 4, s - 4, BOOT_GLOW)
    paint_over(grid, s // 2 - 1, 2, 2, s - 4, MINT)
    for y in (6, 14, s - 10):
        set_pixel(grid, 5, y, DOOR_RIVET)
        set_pixel(grid, s - 6, y, DOOR_RIVET)
        set_pixel(grid, 6, y, shade(DOOR_LEAF, 18, 22, 20))
        set_pixel(grid, s - 7, y, shade(DOOR_LEAF, 18, 22, 20))
    # inner leaf bevel
    paint_over(grid, 2, 2, 1, s - 4, shade(DOOR_LEAF, 14, 16, 14))
    paint_over(grid, s - 3, 2, 1, s - 4, shade(DOOR_LEAF, -10, -10, -8))
    return render_grid(grid, outline_color=0x03080A)


def make_floor_hazard() -> Image.Image:
    s = TILE
    grid = create_grid(s, s)
    for y in range(s):
        for x in range(s):
            band = (x + y) % 16
            set_pixel(grid, x, y, HAZARD_YELLOW if band < 8 else HAZARD_BASE)
    paint_over(grid, 0, 0, s, 2, HAZARD_BAR)
    paint_over(grid, 0, s - 2, s, 2, HAZARD_BAR)
    # a couple of scuff pixels on yellow bands
    scuff = shade(HAZARD_YELLOW, -18, -16, -8)
    for x, y in ((5, 8), (18, 12), (10, 22), (24, 20)):
        if grid["cells"][y][x] == HAZARD_YELLOW:
            grid["cells"][y][x] = scuff
    return render_grid(grid)


# ---------------------------------------------------------------------------
# Items 20×20
# ---------------------------------------------------------------------------
def make_item_sword() -> Image.Image:
    s = 20
    grid = create_grid(s, s)
    fill_rect(grid, 9, 2, 2, 9, SWORD_BLADE)
    set_pixel(grid, 8, 3, SWORD_BLADE)
    set_pixel(grid, 11, 3, SWORD_BLADE)
    set_pixel(grid, 8, 4, SWORD_BLADE)
    set_pixel(grid, 11, 4, SWORD_BLADE)
    fill_rect(grid, 5, 12, 10, 2, GOLD)
    fill_rect(grid, 9, 14, 2, 4, SWORD_HILT)
    set_pixel(grid, 9, 18, GOLD)
    set_pixel(grid, 10, 18, GOLD)
    return render_grid(grid, outline_color=0x0A1520)


def make_item_pistol() -> Image.Image:
    s = 20
    grid = create_grid(s, s)
    fill_rect(grid, 3, 6, 11, 4, PISTOL_BODY)
    paint_over(grid, 3, 6, 11, 1, PISTOL_LIGHT)
    fill_rect(grid, 13, 7, 5, 2, BODY_DARK)
    set_pixel(grid, 17, 7, VISOR)
    set_pixel(grid, 17, 8, BOOT_GLOW)
    fill_rect(grid, 4, 10, 4, 7, BODY_DARK)
    fill_rect(grid, 4, 16, 5, 2, PISTOL_GRIP_TIP)
    return render_grid(grid)


def make_item_armor() -> Image.Image:
    s = 20
    grid = create_grid(s, s)
    rows = [
        (5, 14, 2), (4, 15, 3), (3, 16, 4), (3, 16, 5), (3, 16, 6),
        (4, 15, 7), (4, 15, 8), (5, 14, 9), (5, 14, 10),
        (6, 13, 11), (7, 12, 12), (8, 11, 13), (9, 10, 14),
    ]
    for x0, x1, y in rows:
        fill_rect(grid, x0, y, x1 - x0 + 1, 1, ARMOR_BODY)
    fill_rect(grid, 9, 6, 2, 6, ARMOR_STRIPE)
    set_pixel(grid, 9, 6, ARMOR_GLINT)
    return render_grid(grid, outline_color=0x2A1600)


def make_item_medkit() -> Image.Image:
    s = 20
    grid = create_grid(s, s)
    fill_rect(grid, 2, 4, 16, 12, MEDKIT_BODY)
    paint_over(grid, 2, 4, 16, 2, MEDKIT_LIP)
    fill_rect(grid, 8, 6, 4, 8, ENEMY_RED)
    fill_rect(grid, 5, 9, 10, 4, ENEMY_RED)
    return render_grid(grid, outline_color=BODY_DARK)


def make_item_keycard() -> Image.Image:
    s = 20
    grid = create_grid(s, s)
    fill_rect(grid, 2, 4, 16, 12, BODY_DARK)
    fill_rect(grid, 3, 5, 14, 10, VISOR)
    fill_rect(grid, 5, 7, 6, 2, BODY_DARK)
    set_pixel(grid, 13, 8, GOLD)
    set_pixel(grid, 14, 8, GOLD)
    return render_grid(grid)


# ---------------------------------------------------------------------------
# NPC worker 14×20 — body + head as two outlined layers, then composited
# (matches generateWorkerNPC + the combined look of npc_worker@8x.png)
# ---------------------------------------------------------------------------
def make_npc_worker() -> Image.Image:
    """Body + head on one grid, one outline — combined look of npc_worker@8x."""
    grid = create_grid(14, 20)
    fill_rect(grid, 2, 9, 10, 9, WORKER_BODY)
    fill_rect(grid, 2, 16, 4, 4, WORKER_LEGS)
    fill_rect(grid, 8, 16, 4, 4, WORKER_LEGS)
    fill_circle(grid, 7, 6, 4, SKIN)
    paint_over(grid, 3, 3, 8, 3, GOLD)
    fill_rect(grid, 2, 6, 10, 1, WORKER_BRIM)
    return render_grid(grid)


# ---------------------------------------------------------------------------
# Manifest + verify
# ---------------------------------------------------------------------------
def unique_colors(img: Image.Image) -> list[tuple]:
    return sorted({img.getpixel((x, y)) for y in range(img.height) for x in range(img.width)})


def verify(path: Path, w: int, h: int, expect_transparent_corners: bool) -> list[str]:
    issues = []
    img = Image.open(path).convert("RGBA")
    if img.size != (w, h):
        issues.append(f"{path.name}: size {img.size} != {(w, h)}")
    px = img.load()
    corners = (px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1])
    if expect_transparent_corners:
        for c in corners:
            if c[3] != 0:
                issues.append(f"{path.name}: corner not transparent {c}")
                break
    colors = unique_colors(img)
    # anti-alias smell: more than ~18 unique colors on a tiny sprite
    if len(colors) > 22:
        issues.append(f"{path.name}: {len(colors)} unique colors (possible AA)")
    return issues


def write_manifest(rows: list[dict]) -> None:
    lines = [
        "# Neo Drift — sprite batch 1",
        "",
        "Top-down **orthogonal** (not isometric). Generated by `build_sprites.py`",
        "from the game's own pixelGrid pipeline (Pillow). Outline is baked into",
        "every PNG.",
        "",
        "## How to open in Piskel",
        "",
        "1. Go to https://www.piskelapp.com",
        "2. **File → Open** (or drag the `.piskel` onto the page)",
        "3. Each file is one animation / tileset; frames are a horizontal strip",
        "   inside the layer chunk.",
        "",
        "## How to pack",
        "",
        "- Drop `png/` into [TexturePacker](https://www.codeandweb.com/texturepacker)",
        "  or [free-tex-packer](https://github.com/odrick/free-tex-packer-core).",
        "- Texture keys **are the filenames without `.png`** (`player_down_0`,",
        "  `enemy`, `floor_vent`, `item_sword`, …) so they drop into Phaser",
        "  `this.add.sprite(..., key)` / `anims.create` as-is.",
        "- `player_*_atk.png` is attack frame 0 (drop-in for the current game",
        "  key). `player_*_atk1.png` is the follow-through.",
        "- `enemy.png` is hover frame 0 (drop-in). `enemy_0`…`enemy_3` are the loop.",
        "- Sheets in `sheets/` are already horizontal strips if you prefer to",
        "  slice (`frameWidth` × `frameHeight`) instead of packing individuals.",
        "",
        "Suggested Phaser anims:",
        "",
        "```js",
        "// walk — 4 frames @ 6 fps",
        "this.anims.create({ key: 'walk_down', frames: [0,1,2,3].map(i => ({ key: `player_down_${i}` })), frameRate: 6, repeat: -1 });",
        "// attack — 2 frames @ 8 fps",
        "this.anims.create({ key: 'atk_down', frames: [{ key: 'player_down_atk' }, { key: 'player_down_atk1' }], frameRate: 8 });",
        "// drone hover — 4 frames @ 8 fps",
        "this.anims.create({ key: 'enemy_hover', frames: [0,1,2,3].map(i => ({ key: `enemy_${i}` })), frameRate: 8, repeat: -1 });",
        "```",
        "",
        "## Files",
        "",
        "| file | size | fps | notes |",
        "|---|---|---|---|",
    ]
    for r in rows:
        lines.append(f"| `{r['file']}` | {r['size']} | {r['fps']} | {r['notes']} |")
    lines += [
        "",
        "## Palette",
        "",
        "`outline #05060C`, `visor #37F0FF`, `mint #9FFFE8`, `bootGlow #18E8FF`,",
        "`shoulder #2F8FE0`, `helmetDark #232A52`, `helmetLight #3B4270`,",
        "`bodyDark #1C2038`, `bodyLight #2F3560`, `legs #101225`, `enemyRed #FF3B52`,",
        "`enemyHull #33101A`, `enemyMid #5C1C2A`, `hazardYellow #E8B93D`, `gold #FFE066`,",
        "`orange #FF8A3D`, `wallBody #272C4E`, `wallFrame #14172A`, `wallAccent #FFB347`,",
        "`floorA #232742`, `floorB #2C3156`, `skin #D8C9A0`, plus a few derived shades",
        "(bevel, wear, rivet glint) — no anti-aliased in-betweens.",
        "",
        "Re-run: `python3 /workspace/neo-sprites/build_sprites.py`",
        "",
    ]
    (ROOT / "MANIFEST.md").write_text("\n".join(lines), encoding="utf-8")


def main():
    for d in (PNG_DIR, SHEET_DIR, PISKEL_DIR, PREVIEW_DIR):
        d.mkdir(parents=True, exist_ok=True)

    native: dict[str, Image.Image] = {}
    manifest_rows: list[dict] = []

    def add(key: str, img: Image.Image, fps, notes):
        native[key] = img
        save_png(img, key)
        preview_8x(img).save(PREVIEW_DIR / f"{key}@8x.png", "PNG")
        w, h = img.size
        manifest_rows.append({"file": f"png/{key}.png", "size": f"{w}×{h}", "fps": fps, "notes": notes})

    # --- player walk ---
    for d in ("down", "up", "side"):
        frames = []
        for i, (ly, ry) in enumerate(WALK):
            img = make_player(d, ly, ry)
            add(f"player_{d}_{i}", img, 6, f"walk {d} frame {i} (leftY={ly}, rightY={ry})")
            frames.append(img)
        sheet = hstrip(frames)
        sheet.save(SHEET_DIR / f"player_{d}.png", "PNG")
        write_piskel(f"player_{d}", f"Neo Drift player walk {d}", frames, 6)
        manifest_rows.append({
            "file": f"sheets/player_{d}.png",
            "size": f"{16 * 4}×22",
            "fps": 6,
            "notes": f"horizontal strip, 4 frames × 16×22",
        })
        manifest_rows.append({
            "file": f"piskel/player_{d}.piskel",
            "size": "16×22",
            "fps": 6,
            "notes": f"Piskel animation, 4 frames",
        })

    # --- player attack ---
    atk_spec = {
        "down": (DOWN_ATK0, DOWN_ATK1, True),
        "up": (DOWN_ATK0, DOWN_ATK1, False),
        "side": (SIDE_ATK0, SIDE_ATK1, False),
    }
    for d, (b0, b1, g0) in atk_spec.items():
        a0 = make_player(d, 18, 18, blade=b0, gauntlet=g0)
        a1 = make_player(d, 18, 18, blade=b1, atk1=True, gauntlet=False)
        add(f"player_{d}_atk", a0, 8, f"attack {d} frame 0 (drop-in key)")
        add(f"player_{d}_atk1", a1, 8, f"attack {d} frame 1 (extend + arm raise)")
        sheet = hstrip([a0, a1])
        sheet.save(SHEET_DIR / f"player_{d}_atk.png", "PNG")
        write_piskel(f"player_{d}_atk", f"Neo Drift player attack {d}", [a0, a1], 8)
        manifest_rows.append({
            "file": f"sheets/player_{d}_atk.png",
            "size": "32×22",
            "fps": 8,
            "notes": "horizontal strip, 2 frames × 16×22",
        })
        manifest_rows.append({
            "file": f"piskel/player_{d}_atk.piskel",
            "size": "16×22",
            "fps": 8,
            "notes": "Piskel animation, 2 frames",
        })

    # --- drone ---
    # bob cy 0,+1,0,-1 ; pulse thruster orange/gold
    enemy_frames = [
        make_enemy(0, ORANGE),
        make_enemy(1, GOLD),
        make_enemy(0, GOLD),
        make_enemy(-1, ORANGE),
    ]
    for i, img in enumerate(enemy_frames):
        add(f"enemy_{i}", img, 8, f"drone hover frame {i}")
    add("enemy", enemy_frames[0], 8, "drop-in alias of enemy_0")
    hstrip(enemy_frames).save(SHEET_DIR / "enemy.png", "PNG")
    write_piskel("enemy", "Neo Drift drone hover", enemy_frames, 8)
    manifest_rows.append({"file": "sheets/enemy.png", "size": "72×16", "fps": 8, "notes": "4 frames × 18×16"})
    manifest_rows.append({"file": "piskel/enemy.piskel", "size": "18×16", "fps": 8, "notes": "Piskel animation, 4 frames"})

    # --- tiles ---
    tiles = [
        ("floor", make_floor(), "containment floor plates + rivets"),
        ("floor_vent", make_floor_vent(), "vent grate variant"),
        ("wall", make_wall(), "containment wall family"),
        ("door", make_door(), "sliding door + glow seam"),
        ("floor_hazard", make_floor_hazard(), "hazard stripes"),
    ]
    tile_imgs = []
    for key, img, notes in tiles:
        add(key, img, 1, notes)
        tile_imgs.append(img)
    hstrip(tile_imgs).save(SHEET_DIR / "tiles.png", "PNG")
    write_piskel("tiles", "Neo Drift containment tiles", tile_imgs, 1)
    manifest_rows.append({"file": "sheets/tiles.png", "size": "160×32", "fps": 1, "notes": "floor, vent, wall, door, hazard"})
    manifest_rows.append({"file": "piskel/tiles.piskel", "size": "32×32", "fps": 1, "notes": "5 tiles as frames"})

    # --- items ---
    items = [
        ("item_sword", make_item_sword(), "energy blade pickup"),
        ("item_pistol", make_item_pistol(), "pulse pistol"),
        ("item_armor", make_item_armor(), "chest armor"),
        ("item_medkit", make_item_medkit(), "HP kit"),
        ("item_keycard", make_item_keycard(), "access card"),
    ]
    item_imgs = []
    for key, img, notes in items:
        add(key, img, 1, notes)
        item_imgs.append(img)
    hstrip(item_imgs).save(SHEET_DIR / "items.png", "PNG")
    write_piskel("items", "Neo Drift items", item_imgs, 1)
    manifest_rows.append({"file": "sheets/items.png", "size": "100×20", "fps": 1, "notes": "sword, pistol, armor, medkit, keycard"})
    manifest_rows.append({"file": "piskel/items.piskel", "size": "20×20", "fps": 1, "notes": "5 items as frames"})

    # --- npc ---
    add("npc_worker", make_npc_worker(), 1, "worker body+head composited")

    write_manifest(manifest_rows)

    # --- verify ---
    checks = [
        ("player_down_0", 16, 22, True),
        ("player_up_0", 16, 22, True),
        ("player_side_0", 16, 22, True),
        ("player_down_3", 16, 22, True),
        ("player_down_atk", 16, 22, True),
        ("player_down_atk1", 16, 22, True),
        ("player_side_atk1", 16, 22, True),
        ("enemy_0", 18, 16, True),
        ("enemy_3", 18, 16, True),
        ("enemy", 18, 16, True),
        ("floor", 32, 32, False),
        ("floor_vent", 32, 32, False),
        ("wall", 32, 32, False),
        ("door", 32, 32, False),
        ("floor_hazard", 32, 32, False),
        ("item_sword", 20, 20, True),
        ("item_pistol", 20, 20, True),
        ("item_armor", 20, 20, True),
        ("item_medkit", 20, 20, True),
        ("item_keycard", 20, 20, True),
        ("npc_worker", 14, 20, True),
    ]
    issues = []
    for key, w, h, tc in checks:
        issues.extend(verify(PNG_DIR / f"{key}.png", w, h, tc))

    # outline present on characters (some #05060C pixels)
    for key in ("player_down_0", "enemy", "item_sword", "npc_worker"):
        img = Image.open(PNG_DIR / f"{key}.png")
        cols = unique_colors(img)
        has_outline = any(c[:3] == rgb(OUTLINE) and c[3] == 255 for c in cols)
        if not has_outline:
            issues.append(f"{key}: missing outline #05060C")

    print(f"wrote {len(list(PNG_DIR.glob('*.png')))} native PNGs")
    print(f"wrote {len(list(SHEET_DIR.glob('*.png')))} sheets")
    print(f"wrote {len(list(PISKEL_DIR.glob('*.piskel')))} piskels")
    print(f"wrote {len(list(PREVIEW_DIR.glob('*.png')))} 8x previews")
    if issues:
        print("VERIFY ISSUES:")
        for i in issues:
            print(" -", i)
    else:
        print("VERIFY OK")

    # color report for a few keys
    for key in ("player_down_0", "enemy_0", "floor", "wall", "door", "item_sword", "npc_worker"):
        img = Image.open(PNG_DIR / f"{key}.png")
        cols = [c for c in unique_colors(img) if c[3] != 0]
        print(f"  {key} {img.size} opaque-colors={len(cols)}")


if __name__ == "__main__":
    main()
