#!/usr/bin/env python3
"""
Neo Drift sprite batch — pixelGrid pipeline in Python.

Recreates src/utils/pixelGrid.js + the BootScene generators for the first
art batches (lote 1 walk/tiles/items + lote 2 melee/throw, enemies, biome tiles
+ lote 3 logo/boss + lote 4 NPC body/head splits).

No anti-alias, no drop shadows, no isometric diamonds. Integer pixels only.
Outline is baked into each PNG (1px orthogonal-neighbor, color #05060C by
default) so the user can pack images without going through generateTexture.

Re-run:  python3 /workspace/neo-sprites/build_sprites.py
"""

from __future__ import annotations

import base64
import io
import json
import math
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
MAGENTA = 0xFF5FD0
RING_LIGHT = 0xCFFFFF
BOSS_OUTLINE = 0x140308
BOSS_HULL = 0x1C0509
BOSS_MID = 0x2A0A12
BOSS_PLATE = 0x4A1522
BOSS_ACCENT = 0x7A1F2C
BOSS_ACCENT2 = 0x5A1520
CORE_HOT = 0xFF5A1F
CORE_HI = 0xFFD08A
ALT_OUTLINE = 0x080A14
HERALD_OUTLINE = 0x05020A

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


def polish_pixel(grid, x, y, color):
    """Recolor an already-filled cell — never grows the silhouette."""
    if 0 <= x < grid["w"] and 0 <= y < grid["h"] and grid["cells"][y][x] is not None:
        grid["cells"][y][x] = color


def clear_circle(grid, cx, cy, r):
    r2 = r * r
    for y in range(grid["h"]):
        for x in range(grid["w"]):
            dx = x - cx + 0.5
            dy = y - cy + 0.5
            if dx * dx + dy * dy <= r2:
                grid["cells"][y][x] = None


def stamp_grid(dst, src, ox, oy):
    for y in range(src["h"]):
        for x in range(src["w"]):
            c = src["cells"][y][x]
            if c is not None:
                set_pixel(dst, x + ox, y + oy, c)


def bresenham(x0, y0, x1, y1):
    pts = []
    dx, dy = abs(x1 - x0), abs(y1 - y0)
    sx = 1 if x0 < x1 else -1
    sy = 1 if y0 < y1 else -1
    err = dx - dy
    x, y = x0, y0
    while True:
        pts.append((x, y))
        if x == x1 and y == y1:
            break
        e2 = 2 * err
        if e2 > -dy:
            err -= dy
            x += sx
        if e2 < dx:
            err += dx
            y += sy
    return pts


def paint_line(grid, x0, y0, x1, y1, color, thick=1):
    r = max(0, thick // 2)
    for x, y in bresenham(x0, y0, x1, y1):
        if thick <= 1:
            set_pixel(grid, x, y, color)
        else:
            fill_rect(grid, x - r, y - r, thick, thick, color)


def fill_diamond(grid, cx, cy, r, color):
    for y in range(cy - r, cy + r + 1):
        for x in range(cx - r, cx + r + 1):
            if abs(x - cx) + abs(y - cy) <= r:
                set_pixel(grid, x, y, color)


def radial_tick(grid, cx, cy, deg, r0, r1, color):
    rad = math.radians(deg)
    ca, sa = math.cos(rad), math.sin(rad)
    for i in range(r1 - r0 + 1):
        rr = r0 + i
        set_pixel(grid, round(cx + ca * rr), round(cy + sa * rr), color)


def crescent_pts(cx, cy, r, a0, a1, thick=2):
    """Integer crescent. Degrees, 0=east, CCW; y grows down."""
    pts = set()
    sweep = a1 - a0
    n = max(8, int(abs(sweep) * max(r, 1) * math.pi / 180.0))
    for i in range(n + 1):
        a = math.radians(a0 + sweep * i / n)
        ca, sa = math.cos(a), math.sin(a)
        for k in range(thick):
            rr = r - k
            pts.add((round(cx + rr * ca), round(cy + rr * sa)))
    return pts


def paint_energy_blade(grid, core_pts):
    """#F2FFFF core with #37F0FF orthogonal edge, then baked outline wraps it."""
    cores = {(int(x), int(y)) for x, y in core_pts}
    for x, y in cores:
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if (nx, ny) not in cores:
                set_pixel(grid, nx, ny, VISOR)
    for x, y in cores:
        set_pixel(grid, x, y, BLADE)


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
# Batch 4 — NPCs split into body + head layers (BootScene generate*NPC)
# Same canvas per character. NPC.js overlays head on body and bobs only the
# head sprite; body stays planted. Each layer bakes its own 1px outline.
# Overlap at the neck is OK. Head pixels are NEVER drawn into the body PNG.
# Recipes copy BootScene fillRect/fillCircle/paintOver/setPixel coords;
# polish is 1px rivets / visor glints on already-filled cells only.
# ---------------------------------------------------------------------------
def make_npc_guard_body() -> Image.Image:
    grid = create_grid(14, 20)
    fill_rect(grid, 2, 9, 10, 9, 0x1C2233)
    paint_over(grid, 4, 10, 6, 3, 0x2F3B52)
    fill_rect(grid, 0, 9, 3, 5, 0x3A4560)
    fill_rect(grid, 11, 9, 3, 5, 0x3A4560)
    fill_rect(grid, 2, 16, 4, 4, 0x101318)
    fill_rect(grid, 8, 16, 4, 4, 0x101318)
    polish_pixel(grid, 1, 11, shade(0x3A4560, 22, 22, 24))
    polish_pixel(grid, 12, 11, shade(0x3A4560, 22, 22, 24))
    polish_pixel(grid, 5, 11, shade(0x2F3B52, 18, 18, 20))
    return render_grid(grid)


def make_npc_guard_head() -> Image.Image:
    grid = create_grid(14, 20)
    fill_circle(grid, 7, 5, 4, 0x232A3A)
    fill_rect(grid, 4, 5, 6, 2, 0xFF3B52)
    set_pixel(grid, 5, 5, 0xFFB3C0)
    polish_pixel(grid, 6, 2, shade(0x232A3A, 20, 20, 24))
    polish_pixel(grid, 8, 5, 0xFF6A78)
    return render_grid(grid)


def make_npc_engineer_body() -> Image.Image:
    grid = create_grid(14, 20)
    fill_rect(grid, 2, 9, 10, 9, 0xB87333)
    paint_over(grid, 2, 13, 10, 2, 0xFFB347)
    fill_rect(grid, 2, 16, 4, 4, 0x5A3A1C)
    fill_rect(grid, 8, 16, 4, 4, 0x5A3A1C)
    polish_pixel(grid, 6, 13, 0xFFE9C2)
    polish_pixel(grid, 7, 13, 0xE8A030)
    polish_pixel(grid, 4, 11, shade(0xB87333, 18, 12, 8))
    return render_grid(grid)


def make_npc_engineer_head() -> Image.Image:
    grid = create_grid(14, 20)
    fill_circle(grid, 7, 5, 4, 0xD8C9A0)
    fill_rect(grid, 3, 3, 8, 2, 0x2A2A2A)
    set_pixel(grid, 5, 4, 0x9FFFE8)
    set_pixel(grid, 9, 4, 0x9FFFE8)
    polish_pixel(grid, 4, 3, shade(0x2A2A2A, 28, 28, 28))
    polish_pixel(grid, 6, 2, shade(0xD8C9A0, 12, 10, 8))
    return render_grid(grid)


def make_npc_worker_body() -> Image.Image:
    grid = create_grid(14, 20)
    fill_rect(grid, 2, 9, 10, 9, 0x2F4A3C)
    fill_rect(grid, 2, 16, 4, 4, 0x3C6B52)
    fill_rect(grid, 8, 16, 4, 4, 0x3C6B52)
    polish_pixel(grid, 4, 11, shade(0x2F4A3C, 20, 22, 18))
    polish_pixel(grid, 9, 11, shade(0x2F4A3C, 20, 22, 18))
    return render_grid(grid)


def make_npc_worker_head() -> Image.Image:
    grid = create_grid(14, 20)
    fill_circle(grid, 7, 6, 4, 0xD8C9A0)
    paint_over(grid, 3, 3, 8, 3, 0xFFE066)
    fill_rect(grid, 2, 6, 10, 1, 0xD1A900)
    polish_pixel(grid, 4, 4, 0xFFF6B0)
    polish_pixel(grid, 5, 3, shade(0xFFE066, 16, 16, 12))
    return render_grid(grid)


def make_npc_coordinator_body() -> Image.Image:
    grid = create_grid(14, 20)
    fill_rect(grid, 1, 9, 12, 8, 0x3A1F4A)
    paint_over(grid, 1, 9, 12, 2, 0x5C3070)
    set_pixel(grid, 7, 12, 0xFFD27A)
    set_pixel(grid, 7, 13, 0xFFE9C2)
    fill_rect(grid, 2, 17, 4, 3, 0x1A0F22)
    fill_rect(grid, 8, 17, 4, 3, 0x1A0F22)
    polish_pixel(grid, 4, 11, shade(0x3A1F4A, 18, 10, 20))
    polish_pixel(grid, 2, 9, shade(0x5C3070, 22, 16, 24))
    return render_grid(grid)


def make_npc_coordinator_head() -> Image.Image:
    grid = create_grid(14, 20)
    fill_circle(grid, 7, 5, 4, 0xD8C9A0)
    paint_over(grid, 3, 3, 8, 2, 0x1A1A1A)
    polish_pixel(grid, 5, 3, 0x2A2A2A)
    polish_pixel(grid, 6, 4, shade(0xD8C9A0, 10, 8, 6))
    return render_grid(grid)


def make_npc_herald_body() -> Image.Image:
    grid = create_grid(16, 24)
    fill_rect(grid, 1, 10, 14, 12, 0x241040)
    paint_over(grid, 1, 10, 14, 3, 0x3A1F5A)
    fill_rect(grid, 6, 13, 4, 5, 0x0D0616)
    set_pixel(grid, 8, 15, 0xFF5FD0)
    fill_rect(grid, 1, 20, 5, 4, 0x160A28)
    fill_rect(grid, 10, 20, 5, 4, 0x160A28)
    polish_pixel(grid, 8, 14, 0xFF8AE0)
    polish_pixel(grid, 2, 11, shade(0x3A1F5A, 20, 12, 28))
    polish_pixel(grid, 13, 11, shade(0x3A1F5A, 20, 12, 28))
    return render_grid(grid, outline_color=HERALD_OUTLINE)


def make_npc_herald_head() -> Image.Image:
    grid = create_grid(16, 24)
    fill_circle(grid, 8, 6, 5, 0x160A28)
    paint_over(grid, 3, 3, 10, 4, 0x0D0616)
    set_pixel(grid, 6, 7, 0x9FFFFF)
    set_pixel(grid, 10, 7, 0x9FFFFF)
    polish_pixel(grid, 6, 6, 0xE0FFFF)
    polish_pixel(grid, 5, 4, shade(0x0D0616, 18, 12, 22))
    return render_grid(grid, outline_color=HERALD_OUTLINE)


# ---------------------------------------------------------------------------
# Batch 2 — player melee / throw on 24×28 (body stamped at +4,+3)
# ---------------------------------------------------------------------------
ATK_W, ATK_H = 24, 28
ATK_OX, ATK_OY = 4, 3


def make_player_atk_grid(direction, left_y, right_y, *,
                         raise_arm=False, gauntlet=True, body_dx=0):
    body = build_player_base(left_y, right_y)
    if direction == "down":
        paint_down(body)
    elif direction == "up":
        paint_up(body)
    elif direction == "side":
        paint_side(body, gauntlet=gauntlet)
    if raise_arm:
        raise_right_arm(body)
        if direction == "side":
            fill_rect(body, 13, 10, 2, 1, GAUNTLET)
    grid = create_grid(ATK_W, ATK_H)
    stamp_grid(grid, body, ATK_OX + body_dx, ATK_OY)
    return grid


def _blade_down(frame: int):
    """Down: visor toward camera. Slash across bottom-right then down."""
    if frame == 0:  # windup back/up
        pts = crescent_pts(8, 9, 7, 200, 305, 2)
        pts |= set(bresenham(10, 13, 7, 10))
        return pts
    if frame == 1:  # peak slash — longest
        pts = crescent_pts(14, 15, 11, 8, 132, 2)
        pts |= crescent_pts(14, 15, 10, 16, 124, 1)
        return pts
    if frame == 2:  # follow-through past, lower
        pts = crescent_pts(11, 20, 8, 70, 200, 2)
        return pts
    # recover — blade by right hip
    return set(bresenham(16, 17, 18, 23)) | {(17, 20), (18, 21)}


def _blade_up(frame: int):
    """Up: back view, slash toward top."""
    if frame == 0:
        pts = crescent_pts(16, 16, 6, 20, 120, 2)
        pts |= set(bresenham(15, 15, 17, 18))
        return pts
    if frame == 1:
        pts = crescent_pts(12, 11, 11, 220, 330, 2)
        pts |= crescent_pts(12, 11, 10, 228, 322, 1)
        return pts
    if frame == 2:
        pts = crescent_pts(16, 8, 7, 300, 30, 2)
        return pts
    return set(bresenham(16, 17, 18, 22)) | {(17, 20)}


def _blade_side(frame: int):
    """Side: facing right. Slash to the right."""
    if frame == 0:  # cocked back/up over shoulder
        pts = crescent_pts(8, 10, 8, 200, 290, 2)
        pts |= set(bresenham(10, 13, 7, 11))
        return pts
    if frame == 1:  # longest — extended right
        pts = crescent_pts(16, 13, 9, -45, 55, 2)
        pts |= crescent_pts(16, 13, 8, -35, 45, 1)
        pts |= set(bresenham(16, 14, 19, 12))
        return pts
    if frame == 2:  # past, down-right
        pts = crescent_pts(18, 18, 7, 20, 130, 2)
        return pts
    return set(bresenham(17, 17, 19, 22)) | {(18, 20)}


def _blade_throw_down(frame: int):
    if frame == 0:  # cocked over shoulder
        pts = crescent_pts(11, 7, 6, 220, 320, 2)
        pts |= set(bresenham(12, 12, 11, 9))
        return pts
    if frame == 1:  # leaving hand, forward/down
        pts = crescent_pts(17, 18, 5, 10, 140, 2)
        return pts
    return set()


def _blade_throw_up(frame: int):
    if frame == 0:
        pts = crescent_pts(12, 7, 6, 200, 320, 2)
        pts |= set(bresenham(12, 12, 12, 9))
        return pts
    if frame == 1:
        pts = crescent_pts(12, 4, 5, 220, 330, 2)
        return pts
    return set()


def _blade_throw_side(frame: int):
    if frame == 0:
        pts = crescent_pts(8, 8, 6, 200, 300, 2)
        pts |= set(bresenham(10, 13, 8, 10))
        return pts
    if frame == 1:
        pts = crescent_pts(20, 12, 5, -40, 50, 2)
        return pts
    return set()


_BLADE = {
    "down": _blade_down,
    "up": _blade_up,
    "side": _blade_side,
}
_THROW_BLADE = {
    "down": _blade_throw_down,
    "up": _blade_throw_up,
    "side": _blade_throw_side,
}


def make_player_melee(direction: str, frame: int) -> Image.Image:
    # 0 coiled, 1 peak + arm raise, 2 slight step, 3 almost idle
    if frame == 0:
        ly, ry, raise_arm, dx = 18, 18, False, (-1 if direction == "side" else 0)
        gauntlet = direction != "down"
    elif frame == 1:
        ly, ry, raise_arm, dx = 18, 18, True, (1 if direction == "side" else 0)
        gauntlet = False
    elif frame == 2:
        ly, ry, raise_arm, dx = 17, 19, False, (1 if direction == "side" else 0)
        gauntlet = direction == "side"
    else:
        ly, ry, raise_arm, dx = 18, 18, False, 0
        gauntlet = direction == "side"
    grid = make_player_atk_grid(
        direction, ly, ry, raise_arm=raise_arm, gauntlet=gauntlet, body_dx=dx
    )
    paint_energy_blade(grid, _BLADE[direction](frame))
    return render_grid(grid)


def make_player_throw(direction: str, frame: int) -> Image.Image:
    if frame == 0:
        ly, ry, raise_arm, dx = 18, 18, True, 0
        gauntlet = direction == "side"
    elif frame == 1:
        ly, ry, raise_arm, dx = 18, 18, True, (1 if direction == "side" else 0)
        gauntlet = direction == "side"
    else:
        ly, ry, raise_arm, dx = 18, 18, False, 0
        gauntlet = direction == "side"
    grid = make_player_atk_grid(
        direction, ly, ry, raise_arm=raise_arm, gauntlet=gauntlet, body_dx=dx
    )
    pts = _THROW_BLADE[direction](frame)
    if pts:
        paint_energy_blade(grid, pts)
    return render_grid(grid)


def make_blade_shot(frame: int) -> Image.Image:
    grid = create_grid(16, 16)
    a0 = 200 + frame * 90
    pts = crescent_pts(8, 8, 6, a0, a0 + 155, 2)
    pts |= crescent_pts(8, 8, 5, a0 + 10, a0 + 145, 1)
    paint_energy_blade(grid, pts)
    set_pixel(grid, 8, 8, BLADE)
    return render_grid(grid)


def make_slash(frame: int) -> Image.Image:
    """40×40 melee arc. BootScene: mint arc 200→340°, r=16, 4px. 3 frames."""
    grid = create_grid(40, 40)
    cx, cy = 20, 20
    if frame == 0:
        for p in crescent_pts(cx, cy, 14, 220, 290, 2):
            set_pixel(grid, p[0], p[1], MINT)
        for p in crescent_pts(cx, cy, 13, 230, 280, 1):
            set_pixel(grid, p[0], p[1], BLADE)
    elif frame == 1:
        for p in crescent_pts(cx, cy, 16, 200, 340, 3):
            set_pixel(grid, p[0], p[1], MINT)
        for p in crescent_pts(cx, cy, 15, 208, 332, 1):
            set_pixel(grid, p[0], p[1], BLADE)
        for p in crescent_pts(cx, cy, 14, 214, 326, 1):
            set_pixel(grid, p[0], p[1], 0xFFFFFF)
    else:
        pts = sorted(crescent_pts(cx, cy, 17, 230, 350, 2))
        for i, p in enumerate(pts):
            if i % 3 != 2:
                set_pixel(grid, p[0], p[1], MINT if i % 2 == 0 else VISOR)
    return render_grid(grid)


def make_bullet() -> Image.Image:
    grid = create_grid(10, 5)
    fill_rect(grid, 0, 1, 8, 3, MINT)
    fill_rect(grid, 7, 2, 3, 1, 0xFFFFFF)
    return render_grid(grid, outline_color=0x0A1520)


# ---------------------------------------------------------------------------
# Batch 2 — regular enemies (BootScene silhouettes + hover/pulse)
# ---------------------------------------------------------------------------
def make_enemy_tank(dy=0, pulse=0) -> Image.Image:
    grid = create_grid(22, 20)
    fill_rect(grid, 2, 17 + dy, 5, 3, 0x1C1D24)
    fill_rect(grid, 15, 17 + dy, 5, 3, 0x1C1D24)
    fill_rect(grid, 2, 3 + dy, 18, 14, 0x2A2A33)
    fill_rect(grid, 5, 6 + dy, 12, 8, 0x44454F)
    fill_rect(grid, 13, 9 + dy, 4, 2, 0xFF3B52)
    set_pixel(grid, 13, 9 + dy, 0xFFE0E6 if pulse else 0xFFB3C0)
    if pulse:
        paint_over(grid, 14, 9 + dy, 2, 2, 0xFF6A78)
    fill_rect(grid, 10, 0 + dy, 2, 3, 0x8F92A8)
    for dx_, dy_ in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        fill_rect(grid, 11 + dx_ * 6 - 1, 10 + dy + dy_ * 4 - 1, 2, 2, 0x1C1D24)
    return render_grid(grid, outline_color=0x0C0C11)


def make_enemy_foundry(dy=0, pulse=0) -> Image.Image:
    grid = create_grid(18, 16)
    cy = 7 + dy
    fill_circle(grid, 9, cy, 6, 0x1A1010)
    fill_circle(grid, 9, cy, 4, 0x3A1A0A)
    fill_circle(grid, 9, cy, 2, 0xFFF2C2 if pulse else 0xFFCF3D)
    set_pixel(grid, 7, 5 + dy, 0xFFFFFF if pulse else 0xFFF2C2)
    fill_rect(grid, 0, 6 + dy, 3, 4, 0x2A1006)
    fill_rect(grid, 15, 6 + dy, 3, 4, 0x2A1006)
    fill_rect(grid, 7, 13 + dy, 4, 2, GOLD if pulse else 0xFF5A1F)
    return render_grid(grid)


def make_enemy_electric(dy=0, pulse=0) -> Image.Image:
    grid = create_grid(18, 16)
    cy = 8 + dy
    fill_circle(grid, 9, cy, 6, 0x0A1420)
    fill_circle(grid, 9, cy, 4, 0x163A4A)
    fill_circle(grid, 9, cy, 2, 0xFFFFFF if pulse else 0x9FFFFF)
    set_pixel(grid, 7, 6 + dy, 0xFFFFFF)
    spark = 0x9FFFFF if pulse else 0x37F0FF
    fill_rect(grid, 0, 7 + dy, 2, 2, spark)
    fill_rect(grid, 16, 7 + dy, 2, 2, spark)
    fill_rect(grid, 8, 14 + dy, 3, 2, 0xFFFFFF if pulse else 0x9FFFFF)
    return render_grid(grid)


def make_enemy_jammer(dy=0, pulse=0) -> Image.Image:
    grid = create_grid(18, 16)
    fill_rect(grid, 4, 2 + dy, 10, 12, 0x140A1E)
    set_pixel(grid, 4, 2 + dy, None)
    set_pixel(grid, 13, 2 + dy, None)
    set_pixel(grid, 4, 13 + dy, None)
    set_pixel(grid, 13, 13 + dy, None)
    fill_rect(grid, 6, 4 + dy, 6, 8, 0x2A1440)
    fill_circle(grid, 9, 8 + dy, 3, 0xFFE6FF if pulse else 0xD88BFF)
    set_pixel(grid, 8, 6 + dy, 0xFFFFFF if pulse else 0xFFE6FF)
    fill_rect(grid, 8, 0 + dy, 2, 3, 0x2A1440)
    tip = 0xFFE6FF if pulse else 0xFF3DF0
    set_pixel(grid, 8, 0 + dy, tip)
    set_pixel(grid, 9, 0 + dy, tip)
    fill_rect(grid, 0, 6 + dy, 3, 4, 0x3A1F5A)
    fill_rect(grid, 15, 6 + dy, 3, 4, 0x3A1F5A)
    return render_grid(grid)


def make_enemy_shooter(dy=0, pulse=0) -> Image.Image:
    grid = create_grid(18, 16)
    cy = 8 + dy
    fill_circle(grid, 9, cy, 6, 0x0C1420)
    fill_circle(grid, 9, cy, 4, 0x1C3A5A)
    fill_circle(grid, 9, cy, 2, 0xFFFFFF if pulse else 0x9FD0FF)
    set_pixel(grid, 7, 6 + dy, 0xFFFFFF)
    fill_rect(grid, 14, 7 + dy, 5, 2, 0x2A4A6A)
    set_pixel(grid, 17, 7 + dy, 0xFFFFFF if pulse else 0x9FD0FF)
    fill_rect(grid, 0, 6 + dy, 3, 4, 0x2A3A4A)
    fill_rect(grid, 7, 13 + dy, 4, 2, 0x9FD0FF if pulse else 0x4A90D9)
    return render_grid(grid)


def make_enemy_sentinel(frame=0) -> Image.Image:
    grid = create_grid(16, 14)
    fill_rect(grid, 3, 8, 10, 5, 0x1C1830)
    fill_rect(grid, 5, 3, 6, 6, 0x2A2450)
    fill_circle(grid, 8, 6, 3, 0xFFE6FF if frame else 0xD88BFF)
    set_pixel(grid, 7, 5, 0xFFFFFF if frame else 0xFFE6FF)
    fill_rect(grid, 2, 10, 3, 3, 0x120E20)
    fill_rect(grid, 11, 10, 3, 3, 0x120E20)
    return render_grid(grid, outline_color=0x08050F)


def make_enemy_miniboss(dy=0, pulse=0) -> Image.Image:
    grid = create_grid(26, 24)
    fill_rect(grid, 2, 20 + dy, 6, 4, 0x1C1D24)
    fill_rect(grid, 18, 20 + dy, 6, 4, 0x1C1D24)
    fill_rect(grid, 2, 3 + dy, 22, 18, 0x2A2A33)
    fill_rect(grid, 5, 6 + dy, 16, 11, 0x44454F)
    fill_rect(grid, 10, 9 + dy, 6, 4, 0xFFF2C2 if pulse else 0xFFCF3D)
    set_pixel(grid, 10, 9 + dy, 0xFFFFFF if pulse else 0xFFF2C2)
    fill_rect(grid, 11, 0 + dy, 4, 4, 0x8F92A8)
    paint_over(grid, 5, 6 + dy, 16, 2, 0x5F6270)
    for dx_, dy_ in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        fill_rect(grid, 13 + dx_ * 8 - 1, 12 + dy + dy_ * 6 - 1, 2, 2, 0x1C1D24)
    return render_grid(grid, outline_color=0x0C0C11)


def make_enemy_phasejumper(frame=0) -> Image.Image:
    grid = create_grid(18, 18)
    fill_rect(grid, 6, 6, 6, 6, 0x1A0E2A)
    fill_circle(grid, 9, 9, 3, 0xFF8AE0 if frame % 2 else 0xFF5FD0)
    fill_circle(grid, 9, 9, 1, 0xFFFFFF if frame % 2 == 0 else 0xFF5FD0)
    offs = (
        ((0, 0), (0, 0), (0, 0), (0, 0)),
        ((-1, 0), (1, 0), (0, 1), (0, -1)),
        ((0, 0), (0, 0), (0, 0), (0, 0)),
        ((1, 0), (-1, 0), (0, -1), (0, 1)),
    )[frame]
    frags = ((1, 2, 3, 3), (14, 1, 3, 4), (2, 13, 4, 3), (13, 14, 3, 3))
    for (x, y, w, h), (dx, dy) in zip(frags, offs):
        fill_rect(grid, x + dx, y + dy, w, h, 0x2A1740)
    set_pixel(grid, 2 + offs[0][0], 3 + offs[0][1], 0x37F0FF)
    set_pixel(grid, 15 + offs[1][0], 2 + offs[1][1], 0x37F0FF)
    return render_grid(grid, outline_color=0x0A0614)


def make_enemy_portalguardian(frame=0) -> Image.Image:
    s, c = 30, 15
    grid = create_grid(s, s)
    fill_circle(grid, c, c, 14, 0x1A0E2A)
    clear_circle(grid, c, c, 12)
    fill_circle(grid, c, c, 10, 0x2A1A40)
    fill_circle(grid, c, c, 6, 0xFF8AE0 if frame % 2 else 0xFF5FD0)
    fill_circle(grid, c, c, 3, 0xFFFFFF if frame % 2 == 0 else 0xFF5FD0)
    for deg in (30 + frame * 15, 130 + frame * 15, 210 + frame * 15, 300 + frame * 15):
        rad = math.radians(deg)
        fill_circle(grid, round(c + math.cos(rad) * 13), round(c + math.sin(rad) * 13), 2, 0x37F0FF)
    fill_rect(grid, 0, 13, 6, 4, 0x2A1A40)
    fill_rect(grid, 24, 15, 6, 3, 0x2A1A40)
    return render_grid(grid, outline_color=0x08050F)


def make_enemy_sentry(frame=0) -> Image.Image:
    grid = create_grid(18, 18)
    fill_rect(grid, 2, 13, 14, 4, 0x1C2230)
    fill_rect(grid, 0, 8, 3, 4, 0x1C2230)
    fill_rect(grid, 15, 8, 3, 4, 0x1C2230)
    fill_circle(grid, 9, 8, 7, 0x232C38)
    fill_circle(grid, 9, 8, 5, 0x0A120F)
    fill_circle(grid, 9, 8, 3, 0x7AFFC0 if frame % 2 else 0x3DFFA0)
    set_pixel(grid, 7, 6, 0xFFFFFF if frame % 2 else 0xE0FFE8)
    fill_circle(grid, 14, 3, 1, 0xFFC2C8 if frame % 2 else 0xFF4A5E)
    return render_grid(grid, outline_color=0x05080A)


def make_enemy_dweller(frame=0) -> Image.Image:
    grid = create_grid(16, 20)
    cloth, cloth_light = 0x1C1A16, 0x2C281F
    eye = 0xFFFFFF if frame % 2 else 0xDFFFB0
    fill_circle(grid, 8, 6, 5, cloth)
    paint_over(grid, 4, 3, 8, 3, cloth_light)
    set_pixel(grid, 6, 7, eye)
    set_pixel(grid, 10, 7, eye)
    fill_rect(grid, 3, 10, 10, 7, cloth)
    paint_over(grid, 4, 11, 4, 3, cloth_light)
    fill_rect(grid, 0, 11, 3, 6, cloth)
    fill_rect(grid, 13, 11, 3, 6, cloth)
    hem = 1 if frame in (1, 2) else 0
    fill_rect(grid, 3, 17, 3, 2 + hem, cloth)
    fill_rect(grid, 7, 17, 2, 3 - (1 if frame == 1 else 0), cloth)
    fill_rect(grid, 11, 17, 2, 2 + (1 if frame == 2 else 0), cloth)
    return render_grid(grid, outline_color=0x05060A)


def hover4(maker) -> list:
    """bob 0,+1,0,-1 with accent pulse on odd frames."""
    return [maker(dy, pulse) for dy, pulse in ((0, 0), (1, 1), (0, 1), (-1, 0))]


# ---------------------------------------------------------------------------
# Batch 2 — biome floors / vents / walls / doors / puzzle tiles
# ---------------------------------------------------------------------------
def make_floor_colors(base, edge) -> Image.Image:
    s = TILE
    bevel = shade(base, 18, 18, 22)
    grid = create_grid(s, s)
    fill_rect(grid, 0, 0, s, s, base)
    paint_over(grid, 0, 0, s, 1, bevel)
    paint_over(grid, 0, 0, 1, s, bevel)
    paint_over(grid, s // 2 - 1, 0, 1, s, edge)
    paint_over(grid, 0, s // 2 - 1, s, 1, edge)
    for x, y in ((3, 3), (s - 4, 3), (3, s - 4), (s - 4, s - 4)):
        set_pixel(grid, x, y, edge)
    bolt = shade(edge, -6, -6, -4)
    for x, y in ((8, 8), (23, 8), (8, 23), (23, 23)):
        set_pixel(grid, x, y, bolt)
        set_pixel(grid, x + 1, y, shade(base, 12, 12, 14))
    _tile_wear(
        grid, base,
        spots_dark=((6, 5), (11, 10), (20, 6), (25, 12), (14, 22), (22, 26)),
        spots_light=((7, 20), (10, 27), (18, 9), (26, 21)),
    )
    return render_grid(grid)


def make_vent_colors(base, edge) -> Image.Image:
    s = TILE
    grid = create_grid(s, s)
    fill_rect(grid, 0, 0, s, s, base)
    y = 4
    while y < s - 2:
        paint_over(grid, 3, y, s - 6, 1, edge)
        y += 4
    paint_over(grid, 2, 2, s - 4, 1, edge)
    paint_over(grid, 2, s - 3, s - 4, 1, edge)
    hole = shade(base, -14, -14, -10)
    for gy in (6, 10, 14, 18, 22, 26):
        for gx in (6, 12, 19, 25):
            set_pixel(grid, gx, gy, hole)
    for x, y in ((3, 3), (s - 4, 3), (3, s - 4), (s - 4, s - 4)):
        set_pixel(grid, x, y, edge)
    _tile_wear(grid, base, ((5, 8), (24, 16), (9, 28)), ((16, 7), (21, 23)))
    return render_grid(grid)


def make_floor_town_panel(base=0x1E2338, edge=0x272C4A) -> Image.Image:
    s = TILE
    grid = create_grid(s, s)
    fill_rect(grid, 0, 0, s, s, base)
    for x in range(5, s - 2, 6):
        paint_over(grid, x, 3, 1, s - 6, edge)
    paint_over(grid, 2, 2, s - 4, 1, edge)
    paint_over(grid, 2, s - 3, s - 4, 1, edge)
    for x, y in ((3, 3), (s - 4, 3), (3, s - 4), (s - 4, s - 4)):
        set_pixel(grid, x, y, edge)
    _tile_wear(grid, base, ((6, 8), (18, 14), (12, 24)), ((22, 7), (9, 20)))
    return render_grid(grid)


def make_floor_town_light(base=0x1E2338, edge=0x272C4A) -> Image.Image:
    s = TILE
    grid = create_grid(s, s)
    fill_rect(grid, 0, 0, s, s, base)
    paint_over(grid, 0, 0, s, 1, edge)
    paint_over(grid, 0, 0, 1, s, edge)
    fill_rect(grid, s // 2 - 5, s // 2 - 5, 10, 10, 0x123338)
    fill_rect(grid, s // 2 - 3, s // 2 - 3, 6, 6, 0x37F0FF)
    set_pixel(grid, s // 2 - 1, s // 2 - 1, 0xDFFFFF)
    for x, y in ((3, 3), (s - 4, 3), (3, s - 4), (s - 4, s - 4)):
        set_pixel(grid, x, y, edge)
    _tile_wear(grid, base, ((6, 6), (24, 10)), ((20, 26),))
    return render_grid(grid)


def make_electric_floor() -> Image.Image:
    s = TILE
    grid = create_grid(s, s)
    fill_rect(grid, 0, 0, s, s, 0x0A1420)
    paint_over(grid, 0, 0, s, 2, 0x37F0FF)
    paint_over(grid, 0, s - 2, s, 2, 0x37F0FF)
    zigzag = ((3, 4), (7, 10), (4, 16), (9, 22), (14, 26), (20, 20), (26, 24), (29, 18), (24, 12), (28, 6))
    for x, y in zigzag:
        set_pixel(grid, x, y, 0x9FFFFF)
        set_pixel(grid, x + 1, y, 0xFFFFFF)
    _tile_wear(grid, 0x0A1420, ((8, 8), (18, 14), (12, 28)), ((22, 8),))
    return render_grid(grid, outline_color=0x030608)


def make_district_floor(base=0x14161E, edge=0x1E222C) -> Image.Image:
    s = TILE
    grid = create_grid(s, s)
    fill_rect(grid, 0, 0, s, s, base)
    paint_over(grid, 3, 3, s - 6, s - 6, edge)
    paint_over(grid, 6, 6, s - 12, s - 12, base)
    for x, y in ((5, 5), (s - 6, 5), (5, s - 6), (s - 6, s - 6)):
        set_pixel(grid, x, y, 0x2A2F3C)
    _tile_wear(grid, base, ((8, 8), (20, 12), (14, 24)), ((10, 18), (22, 22)))
    return render_grid(grid)


def make_district_puddle(base=0x14161E, edge=0x1E222C) -> Image.Image:
    s = TILE
    grid = create_grid(s, s)
    fill_rect(grid, 0, 0, s, s, base)
    fill_circle(grid, s / 2, s / 2 + 2, 10, 0x1C2838)
    fill_circle(grid, s / 2 - 3, s / 2, 3, 0xFF5FD0)
    fill_circle(grid, s / 2 + 4, s / 2 + 3, 2, 0x37F0FF)
    for x, y in ((3, 3), (s - 4, 3), (3, s - 4), (s - 4, s - 4)):
        set_pixel(grid, x, y, 0x2A2F3C)
    _tile_wear(grid, base, ((6, 6), (24, 8)), ((20, 26),))
    return render_grid(grid, outline_color=edge)


def make_wall_family(body, frame, accent, plate, outline) -> Image.Image:
    s = TILE
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
        set_pixel(grid, x - 1, y - 1, shade(plate, 16, 16, 18))
    _tile_wear(
        grid, body,
        spots_dark=((4, 6), (12, 16), (20, 6), (27, 18), (10, 26)),
        spots_light=((5, 14), (24, 15), (16, 22)),
    )
    return render_grid(grid, outline_color=outline)


def make_wall_district() -> Image.Image:
    s, base = TILE, 0x22252E
    grid = create_grid(s, s)
    fill_rect(grid, 0, 0, s, s, 0x121319)
    fill_rect(grid, 1, 1, s - 2, s - 2, base)
    for x, y in ((4, 3), (5, 4), (5, 5), (6, 6), (6, 7), (7, 8)):
        set_pixel(grid, x, y, 0x0D0E12)
    for x, y in ((26, 20), (25, 21), (25, 22), (24, 23), (23, 24)):
        set_pixel(grid, x, y, 0x0D0E12)
    fill_rect(grid, 22, 5, 3, 22, 0x0A1016)
    fill_rect(grid, 23, 6, 1, 20, 0xFF5FD0)
    set_pixel(grid, 23, 6, 0xFFE0F8)
    set_pixel(grid, 23, 25, 0xFFE0F8)
    fill_rect(grid, 4, s - 9, 6, 2, 0x1A1D24)
    _tile_wear(grid, base, ((8, 10), (14, 16), (18, 8)), ((10, 22), (16, 12)))
    return render_grid(grid, outline_color=0x08090C)


def make_wall_tower() -> Image.Image:
    s, base = TILE, 0x1C2436
    grid = create_grid(s, s)
    fill_rect(grid, 0, 0, s, s, 0x0E1420)
    fill_rect(grid, 1, 1, s - 2, s - 2, base)
    for y in (9, 16, 23):
        paint_over(grid, 3, y, s - 6, 1, 0x3F6FA8)
    paint_over(grid, 3, 16, s - 6, 1, 0x6FD0FF)
    fill_rect(grid, 5, 4, 2, 2, 0x6FD0FF)
    fill_rect(grid, s - 7, 4, 2, 2, 0x6FD0FF)
    set_pixel(grid, 5, 4, 0xDFFFFF)
    set_pixel(grid, s - 7, 4, 0xDFFFFF)
    _tile_wear(grid, base, ((8, 12), (20, 20)), ((14, 8),))
    return render_grid(grid, outline_color=0x060A12)


def make_wall_arsenal() -> Image.Image:
    s, base = TILE, 0x2C3A20
    grid = create_grid(s, s)
    fill_rect(grid, 0, 0, s, s, 0x14190E)
    fill_rect(grid, 2, 2, s - 4, s - 4, base)
    for i in range(10):
        x, y = s - 2 - i, 2 + i
        c = 0xE8B93D if i % 2 == 0 else 0x14190E
        set_pixel(grid, x, y, c)
        set_pixel(grid, x - 1, y, c)
    for cx, cy in ((5, 5), (s - 6, 5), (5, s - 6), (s - 6, s - 6)):
        fill_circle(grid, cx, cy, 3, 0x1A1F12)
        fill_circle(grid, cx, cy, 2, 0x5A6A3A)
        set_pixel(grid, cx - 1, cy - 1, 0x9AAE5F)
    _tile_wear(grid, base, ((10, 12), (18, 20), (8, 22)), ((14, 16),))
    # a couple of rust spots (simplex stand-in)
    for x, y in ((12, 18), (20, 14), (7, 24)):
        if grid["cells"][y][x] == base:
            grid["cells"][y][x] = 0x6A4020
    return render_grid(grid, outline_color=0x0A0D07)


def make_wall_nexus() -> Image.Image:
    s, base = TILE, 0x241A3C
    grid = create_grid(s, s)
    fill_rect(grid, 0, 0, s, s, 0x120C20)
    fill_rect(grid, 2, 2, s - 4, s - 4, base)
    paint_over(grid, s // 2 - 1, 3, 1, s - 6, 0x8A3DFF)
    paint_over(grid, s // 2, 9, 6, 1, 0x8A3DFF)
    paint_over(grid, s // 2 - 6, 20, 6, 1, 0x8A3DFF)
    set_pixel(grid, s // 2 - 1, 9, 0xE0C8FF)
    set_pixel(grid, s // 2, 20, 0xE0C8FF)
    set_pixel(grid, s // 2 + 5, 9, 0xE0C8FF)
    set_pixel(grid, s // 2 - 6, 20, 0xE0C8FF)
    _tile_wear(grid, base, ((6, 8), (20, 14), (10, 24)), ((16, 18),))
    return render_grid(grid, outline_color=0x08050F)


def make_wall_vigilancia() -> Image.Image:
    s, base = TILE, 0x18201E
    grid = create_grid(s, s)
    fill_rect(grid, 0, 0, s, s, 0x0A0F0E)
    fill_rect(grid, 2, 2, s - 4, s - 4, base)
    fill_rect(grid, 8, 9, 16, 14, 0x081210)
    for y in range(11, 22, 3):
        paint_over(grid, 9, y, 14, 1, 0x123A2C)
    paint_over(grid, 9, 10, 14, 1, 0x3DFFA0)
    paint_over(grid, 9, 20, 14, 1, 0x2A8A5C)
    fill_circle(grid, s - 7, 7, 2, 0xFF4A5E)
    set_pixel(grid, s - 8, 6, 0xFFC2C8)
    _tile_wear(grid, base, ((5, 6), (26, 24)), ((6, 26),))
    return render_grid(grid, outline_color=0x040807)


def make_wall_submundo() -> Image.Image:
    s, base = TILE, 0x1C1815
    grid = create_grid(s, s)
    fill_rect(grid, 0, 0, s, s, 0x0E0B09)
    fill_rect(grid, 1, 1, s - 2, s - 2, base)
    for x, length in ((6, 18), (14, 24), (23, 14), (27, 20)):
        paint_over(grid, x, 1, 1, length, 0x0F120D)
    for x, y in ((9, 20), (19, 8), (22, 25), (5, 27)):
        fill_circle(grid, x, y, 1, 0x3A4A2C)
    for x, y in ((17, 5), (18, 6), (18, 7), (19, 8)):
        set_pixel(grid, x, y, 0x080A07)
    _tile_wear(grid, base, ((8, 12), (20, 16)), ((12, 22), (24, 10)))
    return render_grid(grid, outline_color=0x050403)


def make_wall_fantasma() -> Image.Image:
    s, grout, tile = TILE, 0x1E2024, 0x2A2D33
    grid = create_grid(s, s)
    fill_rect(grid, 0, 0, s, s, 0x0C0D10)
    fill_rect(grid, 1, 1, s - 2, s - 2, grout)
    for y in range(2, s - 2, 6):
        for x in range(2, s - 2, 8):
            fill_rect(grid, x, y, 6, 4, tile)
    fill_rect(grid, 10, 14, 6, 4, 0x0A0B0D)
    fill_rect(grid, 18, 20, 6, 4, 0x0A0B0D)
    set_pixel(grid, 12, 15, 0x14161A)
    _tile_wear(grid, tile, ((4, 4), (20, 8), (12, 26)), ((6, 16),))
    return render_grid(grid, outline_color=0x05060A)


def make_door_tower() -> Image.Image:
    s = TILE
    grid = create_grid(s, s)
    fill_rect(grid, 0, 0, s, s, 0x0A1420)
    fill_rect(grid, 3, 2, s - 6, s - 4, 0x16283A)
    paint_over(grid, 3, 2, s - 6, 1, 0x4A7AA8)
    paint_over(grid, 3, s - 3, s - 6, 1, 0x4A7AA8)
    for y in (7, 14, 21):
        paint_over(grid, 5, y, s - 10, 1, 0x2F6F9A)
    fill_rect(grid, s // 2 - 1, 3, 2, s - 6, 0x37C8FF)
    paint_over(grid, s // 2 - 1, 3, 1, s - 6, 0xCFFFFF)
    for y in (8, 16, 24):
        set_pixel(grid, 6, y, 0x4A7AA8)
        set_pixel(grid, s - 7, y, 0x4A7AA8)
    return render_grid(grid, outline_color=0x040810)


def make_door_arsenal() -> Image.Image:
    s = TILE
    grid = create_grid(s, s)
    fill_rect(grid, 0, 0, s, s, 0x10160C)
    fill_rect(grid, 1, 1, s - 2, s - 2, 0x2C3A20)
    for x in range(1, s - 1):
        if ((x + 2) // 3) % 2 == 0:
            set_pixel(grid, x, 2, 0xE8B93D)
            set_pixel(grid, x, 3, 0xE8B93D)
            set_pixel(grid, x, s - 4, 0xE8B93D)
            set_pixel(grid, x, s - 3, 0xE8B93D)
    fill_circle(grid, s / 2, s / 2, 7, 0x1A2412)
    fill_circle(grid, s / 2, s / 2, 5, 0x4A5F32)
    fill_circle(grid, s / 2, s / 2, 2, 0x1A2412)
    for deg in (0, 90, 180, 270):
        rad = math.radians(deg)
        set_pixel(grid, round(s / 2 + math.cos(rad) * 7), round(s / 2 + math.sin(rad) * 7), 0x8FAE5F)
    for cx, cy in ((4, 5), (s - 5, 5), (4, s - 6), (s - 5, s - 6)):
        fill_circle(grid, cx, cy, 2, 0x1A2412)
        set_pixel(grid, cx - 1, cy - 1, 0x9AAE5F)
    return render_grid(grid, outline_color=0x080A05)


def make_door_nexus() -> Image.Image:
    s, cx, cy = TILE, TILE / 2, TILE / 2
    grid = create_grid(s, s)
    fill_rect(grid, 0, 0, s, s, 0x0C081A)
    fill_circle(grid, cx, cy, 14, 0x2A1A4A)
    fill_circle(grid, cx, cy, 11, 0x8A3DFF)
    fill_circle(grid, cx, cy, 8, 0x100A20)
    fill_circle(grid, cx, cy, 4, 0xC9A0FF)
    set_pixel(grid, int(cx), int(cy), 0xFFFFFF)
    return render_grid(grid, outline_color=0x05030C)


def make_door_vigilancia() -> Image.Image:
    s, cx, cy = TILE, TILE / 2, TILE / 2
    grid = create_grid(s, s)
    fill_rect(grid, 0, 0, s, s, 0x0A0F0E)
    fill_circle(grid, cx, cy, 14, 0x18201E)
    fill_circle(grid, cx, cy, 11, 0x081210)
    fill_circle(grid, cx, cy, 8, 0x3DFFA0)
    fill_circle(grid, cx, cy, 4, 0x081210)
    set_pixel(grid, int(cx) - 2, int(cy) - 2, 0xE0FFE8)
    for deg in (30, 150, 270):
        rad = math.radians(deg)
        set_pixel(grid, round(cx + math.cos(rad) * 13), round(cy + math.sin(rad) * 13), 0x2A8A5C)
    return render_grid(grid, outline_color=0x040807)


def _puzzle_base(frame=0x3A4050, panel=0x0D0F16, outline=0x05060A):
    s = TILE
    grid = create_grid(s, s)
    fill_rect(grid, 0, 0, s, s, outline)  # fully opaque corners
    fill_rect(grid, 1, 1, s - 2, s - 2, frame)
    fill_rect(grid, 3, 3, s - 6, s - 6, panel)
    return grid


def make_tile_sequence(on: bool) -> Image.Image:
    grid = _puzzle_base()
    s = TILE
    if on:
        fill_circle(grid, s / 2, s / 2, 9, 0x9FFFE8)
        fill_circle(grid, s / 2, s / 2, 5, 0xFFFFFF)
    else:
        fill_circle(grid, s / 2, s / 2, 8, 0x4A2020)
    return render_grid(grid, outline_color=0x05060A)


def make_tile_circuit(on: bool) -> Image.Image:
    grid = _puzzle_base()
    s = TILE
    col = 0x9FFFE8 if on else 0x5A2020
    paint_over(grid, 3, s // 2 - 1, s - 6, 2, col)
    paint_over(grid, s // 2 - 1, 3, 2, s - 6, col)
    if on:
        fill_circle(grid, s / 2, s / 2, 5, 0xFFFFFF)
        fill_circle(grid, s / 2, s / 2, 3, 0x9FFFE8)
    else:
        fill_circle(grid, s / 2, s / 2, 4, 0x6A2828)
    return render_grid(grid, outline_color=0x05060A)


def make_trap(state: str) -> Image.Image:
    grid = _puzzle_base(frame=0x2C3A20)
    spots = ((8, 8), (16, 8), (24, 8), (8, 16), (16, 16), (24, 16), (8, 24), (16, 24), (24, 24))
    if state == "off":
        for x, y in spots:
            fill_rect(grid, x - 1, y - 1, 3, 3, 0x1C1F28)
    elif state == "warn":
        for x, y in spots:
            fill_rect(grid, x - 1, y - 1, 3, 3, 0x5A4A10)
            set_pixel(grid, x, y, 0xFFCF3D)
    else:
        for x, y in spots:
            fill_circle(grid, x, y, 2, 0xFF3B52)
            set_pixel(grid, x, y - 1, 0xFFE9EC)
    return render_grid(grid, outline_color=0x05060A)


def make_tile_signal(on: bool) -> Image.Image:
    grid = _puzzle_base()
    if on:
        fill_rect(grid, 8, 10, 16, 12, 0x0D3A28)
        fill_rect(grid, 9, 11, 14, 10, 0x3DFFA0)
        set_pixel(grid, 10, 12, 0xFFFFFF)
        fill_circle(grid, 22, 20, 1, 0xFF4A5E)
    else:
        fill_rect(grid, 8, 10, 16, 12, 0x081210)
        paint_over(grid, 9, 14, 14, 1, 0x0F1A16)
        fill_circle(grid, 22, 20, 1, 0x2A2F3C)
    return render_grid(grid, outline_color=0x05060A)


# ---------------------------------------------------------------------------
# Batch 3 — Neo Industries floor logo, Guardião Núcleo, factory mecha alt
# ---------------------------------------------------------------------------
GLYPH_WEAR = 0x6AD4C0
RING_DARK = 0x0A4A55
RING_TICK = 0x2DBEE1
BOLT = 0x1C2038
BOLT_GLINT = 0x4A5580
RIVET_NEON = 0x18E8FF


def make_floor_logo(glow: bool = False) -> Image.Image:
    """96×96 corporate floor decal. Transparent outside the emblem."""
    s = 96
    cx = cy = s / 2
    grid = create_grid(s, s)
    if glow:
        dark, body, light = VISOR, 0x9FFFFF, 0xFFFFFF
        glyph, glyph_light = 0xC7FFFA, 0xFFFFFF
        tick = RING_LIGHT
    else:
        dark, body, light = RING_DARK, VISOR, RING_LIGHT
        glyph, glyph_light = MINT, 0xC7FFFA
        tick = RING_TICK

    # Beveled neon tube (dark outer / cyan body / inner highlight).
    fill_circle(grid, cx, cy, 46, dark)
    fill_circle(grid, cx, cy, 44, body)
    fill_circle(grid, cx, cy, 41, light)
    clear_circle(grid, cx, cy, 40)

    # Circuit / dial ticks in the gap (cardinals slightly longer).
    for deg in range(0, 360, 15):
        r0, r1 = (34, 39) if deg % 90 == 0 else (36, 39)
        radial_tick(grid, cx, cy, deg, r0, r1, tick)

    # Inner ring.
    fill_circle(grid, cx, cy, 34, dark)
    fill_circle(grid, cx, cy, 33, body)
    if glow:
        fill_circle(grid, cx, cy, 32, light)
    clear_circle(grid, cx, cy, 31)

    # Monogram N: 8px bars + clean 6px diagonal (diagonal first, bars on top).
    for x, y in bresenham(36, 28, 59, 67):
        fill_rect(grid, x - 2, y - 2, 6, 6, glyph)
    fill_rect(grid, 30, 26, 8, 44, glyph)
    fill_rect(grid, 58, 26, 8, 44, glyph)
    paint_over(grid, 30, 26, 2, 44, glyph_light)
    paint_over(grid, 58, 26, 2, 44, glyph_light)
    paint_over(grid, 30, 26, 8, 2, glyph_light)
    paint_over(grid, 58, 26, 8, 2, glyph_light)

    # Deterministic wear (not simplex) — a few scuffs on tube + glyph.
    if not glow:
        for x, y in ((48, 4), (20, 10), (74, 12), (10, 48), (85, 50),
                     (22, 78), (70, 82), (48, 90), (34, 40), (60, 52)):
            if grid["cells"][y][x] == body:
                grid["cells"][y][x] = dark
        for x, y in ((32, 38), (62, 48), (36, 58), (54, 62)):
            if grid["cells"][y][x] == glyph:
                grid["cells"][y][x] = GLYPH_WEAR

    # 6 rivets on the outer tube, slightly inset so they sit on the body.
    for deg in (20, 80, 140, 200, 260, 320):
        rad = math.radians(deg)
        bx = round(cx + math.cos(rad) * 45)
        by = round(cy + math.sin(rad) * 45)
        fill_rect(grid, bx - 1, by - 1, 3, 3, BOLT)
        set_pixel(grid, bx - 1, by - 1, BOLT_GLINT)
        set_pixel(grid, bx, by, RIVET_NEON if glow else VISOR)

    return render_grid(grid)


def make_boss(frame: int = 0) -> Image.Image:
    """44×42 Guardião Núcleo — plated hydraulic factory guardian, 3/4 top-down."""
    grid = create_grid(44, 42)
    hull, mid, plate = BOSS_HULL, BOSS_MID, BOSS_PLATE
    acc, acc2 = BOSS_ACCENT, BOSS_ACCENT2

    # Pulse via color + 1px halo, not a growing meat blob.
    core_c = (CORE_HOT, CORE_HOT, ORANGE, CORE_HOT)[frame]
    hi_c = (CORE_HI, CORE_HI, GOLD, CORE_HI)[frame]
    seam = (ORANGE, ORANGE, CORE_HI, VISOR)[frame]
    muzzle = (ORANGE, ORANGE, CORE_HI, ORANGE)[frame]
    visor = (CORE_HOT, ORANGE, CORE_HI, VISOR)[frame]
    muzzle_hi = (CORE_HI, GOLD, GOLD, CORE_HI)[frame]
    halo = frame in (1, 2)

    # --- hydraulic feet at canvas bottom ---
    fill_rect(grid, 4, 39, 13, 3, hull)
    fill_rect(grid, 5, 37, 11, 2, mid)
    fill_rect(grid, 6, 36, 9, 1, plate)
    fill_rect(grid, 4, 40, 4, 2, plate)
    fill_rect(grid, 26, 39, 14, 3, hull)
    fill_rect(grid, 27, 37, 12, 2, mid)
    fill_rect(grid, 28, 36, 10, 1, plate)
    fill_rect(grid, 36, 40, 4, 2, plate)

    # thin piston rods + cylinder rings + hip joints
    fill_rect(grid, 10, 31, 3, 6, mid)
    fill_rect(grid, 11, 31, 1, 6, plate)
    fill_rect(grid, 9, 33, 5, 1, plate)
    fill_circle(grid, 11, 31, 2, plate)
    set_pixel(grid, 10, 32, seam)
    fill_rect(grid, 31, 31, 3, 6, mid)
    fill_rect(grid, 32, 31, 1, 6, plate)
    fill_rect(grid, 30, 33, 5, 1, plate)
    fill_circle(grid, 32, 31, 2, plate)
    set_pixel(grid, 33, 32, seam)

    # hip bar
    fill_rect(grid, 8, 27, 28, 4, hull)
    fill_rect(grid, 10, 28, 24, 2, mid)
    paint_over(grid, 11, 29, 22, 1, seam)

    # torso plates + waist inset (angular, not stacked circles)
    fill_rect(grid, 11, 9, 20, 18, mid)
    set_pixel(grid, 11, 9, None)
    set_pixel(grid, 30, 9, None)
    fill_rect(grid, 9, 13, 3, 12, hull)
    fill_rect(grid, 31, 13, 3, 12, hull)
    fill_rect(grid, 12, 9, 18, 4, plate)
    fill_rect(grid, 13, 24, 16, 4, hull)
    paint_over(grid, 12, 14, 18, 1, hull)
    paint_over(grid, 12, 15, 18, 1, seam)

    # displaced armor plates
    fill_rect(grid, 12, 6, 6, 4, acc)
    fill_rect(grid, 24, 5, 5, 5, acc2)
    fill_rect(grid, 7, 22, 4, 5, acc2)
    fill_rect(grid, 31, 22, 5, 5, acc)
    set_pixel(grid, 13, 7, CORE_HI if frame == 2 else plate)

    # head / visor slit
    fill_rect(grid, 16, 3, 11, 6, hull)
    fill_rect(grid, 17, 4, 9, 4, mid)
    paint_over(grid, 18, 6, 7, 1, visor)
    set_pixel(grid, 19, 5, visor)

    # left shoulder (smaller) + stub gun
    fill_rect(grid, 2, 11, 8, 8, plate)
    fill_rect(grid, 3, 12, 6, 6, mid)
    fill_rect(grid, 1, 14, 3, 3, hull)
    paint_over(grid, 3, 15, 6, 1, seam)
    set_pixel(grid, 1, 15, muzzle)

    # right shoulder cannon — pauldron + protruding barrel
    fill_rect(grid, 28, 5, 10, 13, plate)
    fill_rect(grid, 29, 6, 8, 11, acc)
    fill_rect(grid, 36, 9, 6, 6, hull)
    fill_rect(grid, 37, 10, 5, 4, mid)
    paint_over(grid, 39, 9, 1, 6, acc)
    fill_rect(grid, 41, 10, 3, 4, muzzle)
    fill_rect(grid, 42, 11, 2, 2, muzzle_hi)
    set_pixel(grid, 40, 11, muzzle_hi)

    # armored core window (dark well + plate lip) + smaller core
    fill_rect(grid, 16, 16, 9, 8, hull)
    fill_rect(grid, 16, 16, 9, 1, acc)
    fill_rect(grid, 16, 23, 9, 1, acc)
    fill_rect(grid, 16, 16, 1, 8, acc)
    fill_rect(grid, 24, 16, 1, 8, acc)
    fill_circle(grid, 20, 19, 3, core_c)
    fill_circle(grid, 20, 19, 1, hi_c)
    set_pixel(grid, 19, 18, hi_c)
    if halo:
        for x, y in ((18, 17), (22, 17), (18, 21), (22, 21)):
            set_pixel(grid, x, y, core_c)
    set_pixel(grid, 20, 24, seam)
    set_pixel(grid, 21, 25, seam)

    for x, y in ((14, 18), (26, 21), (12, 17)):
        if grid["cells"][y][x] == mid:
            grid["cells"][y][x] = hull

    return render_grid(grid, outline_color=BOSS_OUTLINE)


def make_boss_alt(frame: int = 0) -> Image.Image:
    """44×42 factory security mecha — navy/chrome + magenta/cyan Neo seams."""
    grid = create_grid(44, 42)
    navy, mid, chrome = BODY_DARK, BODY_LIGHT, HELMET_LIGHT
    dark = LEGS

    core_r = (3, 3, 4, 3)[frame]
    hi_r = (1, 1, 2, 1)[frame]
    core_c = (MAGENTA, MAGENTA, 0xFF8AE0, VISOR)[frame]
    hi_c = (0xFFE6FF, 0xFFFFFF, 0xFFFFFF, RING_LIGHT)[frame]
    seam_a = (MAGENTA, MAGENTA, 0xFF8AE0, MAGENTA)[frame]
    seam_b = (VISOR, VISOR, RING_LIGHT, VISOR)[frame]
    visor = (VISOR, RING_LIGHT, 0xFFFFFF, MAGENTA)[frame]
    muzzle = (MAGENTA, 0xFF8AE0, MAGENTA, VISOR)[frame]

    # angular foot pads
    fill_rect(grid, 4, 39, 13, 3, dark)
    fill_rect(grid, 5, 37, 11, 2, navy)
    fill_rect(grid, 6, 36, 9, 1, mid)
    fill_rect(grid, 4, 40, 3, 2, chrome)
    fill_rect(grid, 26, 39, 14, 3, dark)
    fill_rect(grid, 27, 37, 12, 2, navy)
    fill_rect(grid, 28, 36, 10, 1, mid)
    fill_rect(grid, 36, 40, 4, 2, chrome)

    # pistons
    fill_rect(grid, 10, 31, 3, 6, navy)
    fill_rect(grid, 11, 31, 1, 6, chrome)
    fill_rect(grid, 9, 33, 5, 1, mid)
    fill_circle(grid, 11, 31, 2, chrome)
    set_pixel(grid, 10, 32, seam_b)
    fill_rect(grid, 31, 31, 3, 6, navy)
    fill_rect(grid, 32, 31, 1, 6, chrome)
    fill_rect(grid, 30, 33, 5, 1, mid)
    fill_circle(grid, 32, 31, 2, chrome)
    set_pixel(grid, 33, 32, seam_a)

    # hip bar + split neon
    fill_rect(grid, 8, 27, 28, 4, dark)
    fill_rect(grid, 10, 28, 24, 2, navy)
    paint_over(grid, 11, 29, 10, 1, seam_b)
    paint_over(grid, 22, 29, 11, 1, seam_a)

    # angular / hex-ish torso
    fill_rect(grid, 11, 9, 20, 18, navy)
    set_pixel(grid, 11, 9, None)
    set_pixel(grid, 12, 9, None)
    set_pixel(grid, 29, 9, None)
    set_pixel(grid, 30, 9, None)
    fill_rect(grid, 13, 8, 16, 4, chrome)
    fill_rect(grid, 9, 13, 3, 11, dark)
    fill_rect(grid, 32, 13, 3, 11, dark)
    fill_rect(grid, 13, 24, 16, 4, dark)
    fill_rect(grid, 14, 10, 14, 3, mid)
    paint_over(grid, 13, 15, 16, 1, seam_b)

    # visor head
    fill_rect(grid, 16, 3, 12, 6, navy)
    fill_rect(grid, 17, 4, 10, 4, chrome)
    paint_over(grid, 18, 6, 8, 1, visor)
    set_pixel(grid, 19, 5, visor)
    set_pixel(grid, 24, 5, visor)

    # chest chevron (1-bit) above the diamond
    set_pixel(grid, 21, 12, seam_a)
    set_pixel(grid, 20, 13, seam_a)
    set_pixel(grid, 22, 13, seam_a)
    set_pixel(grid, 19, 14, seam_a)
    set_pixel(grid, 23, 14, seam_a)

    # left shoulder (small, boxy) + stencil N
    fill_rect(grid, 1, 11, 9, 8, chrome)
    fill_rect(grid, 2, 12, 7, 6, mid)
    fill_rect(grid, 0, 14, 3, 3, navy)
    paint_over(grid, 2, 14, 7, 1, seam_a)
    set_pixel(grid, 1, 15, muzzle)
    for y, xs in ((12, (3, 6)), (13, (3, 4, 6)), (14, (3, 5, 6)),
                  (15, (3, 6)), (16, (3, 6))):
        for x in xs:
            set_pixel(grid, x, y, seam_b)

    # right cannon — boxy housing + cooling fins + barrel
    fill_rect(grid, 28, 4, 10, 14, chrome)
    fill_rect(grid, 29, 5, 8, 12, mid)
    for fy in (6, 8, 10, 12, 14):
        fill_rect(grid, 29, fy, 3, 1, seam_b)
    fill_rect(grid, 36, 9, 6, 6, navy)
    fill_rect(grid, 37, 10, 5, 4, dark)
    paint_over(grid, 39, 9, 1, 6, chrome)
    fill_rect(grid, 41, 10, 3, 4, muzzle)
    fill_rect(grid, 42, 11, 2, 2, hi_c)

    # diamond core in a dark well
    fill_diamond(grid, 21, 19, 5, dark)
    fill_diamond(grid, 21, 19, core_r, core_c)
    fill_diamond(grid, 21, 19, hi_r, hi_c)
    set_pixel(grid, 20, 18, hi_c)

    fill_rect(grid, 12, 7, 5, 3, mid)
    fill_rect(grid, 25, 6, 5, 3, navy)
    set_pixel(grid, 26, 7, seam_a)

    return render_grid(grid, outline_color=ALT_OUTLINE)


def make_boss_aura() -> Image.Image:
    """72×72 white tick-ring (game tints it). Cleaner 3px ring + inner hairline."""
    s = 72
    c = s / 2
    grid = create_grid(s, s)
    fill_circle(grid, c, c, 34, 0xFFFFFF)
    clear_circle(grid, c, c, 31)
    fill_circle(grid, c, c, 26, 0xFFFFFF)
    clear_circle(grid, c, c, 25)
    for deg, r0, r1 in (
        (15, 32, 36),
        (95, 32, 35),
        (160, 32, 37),
        (210, 32, 35),
        (260, 32, 36),
        (320, 33, 35),
        (0, 31, 35),
        (90, 31, 34),
        (180, 31, 35),
        (270, 31, 34),
    ):
        radial_tick(grid, c, c, deg, r0, r1, 0xFFFFFF)
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
    if len(colors) > 28:
        issues.append(f"{path.name}: {len(colors)} unique colors (possible AA)")
    return issues


def verify_npc_split(key: str, w: int, h: int, outline: int) -> list[str]:
    """Body: transparent top. Head: transparent bottom. Exact canvas size."""
    issues = []
    body = Image.open(PNG_DIR / f"{key}_body.png").convert("RGBA")
    head = Image.open(PNG_DIR / f"{key}_head.png").convert("RGBA")
    if body.size != (w, h):
        issues.append(f"{key}_body: size {body.size} != {(w, h)}")
    if head.size != (w, h):
        issues.append(f"{key}_head: size {head.size} != {(w, h)}")
    bp, hp = body.load(), head.load()
    for y in range(3):
        for x in range(w):
            if bp[x, y][3] != 0:
                issues.append(f"{key}_body: opaque pixel in transparent top ({x},{y}) {bp[x, y]}")
                break
        else:
            continue
        break
    for y in range(h - 4, h):
        for x in range(w):
            if hp[x, y][3] != 0:
                issues.append(f"{key}_head: opaque pixel in transparent bottom ({x},{y}) {hp[x, y]}")
                break
        else:
            continue
        break
    if not any(bp[x, y][3] for y in range(h // 2, h) for x in range(w)):
        issues.append(f"{key}_body: no opaque pixels in lower half")
    if not any(hp[x, y][3] for y in range(h // 2) for x in range(w)):
        issues.append(f"{key}_head: no opaque pixels in upper half")
    for name, img in ((f"{key}_body", body), (f"{key}_head", head)):
        cols = unique_colors(img)
        if not any(c[:3] == rgb(outline) and c[3] == 255 for c in cols):
            issues.append(f"{name}: missing outline #{outline:06X}")
        if len(cols) > 28:
            issues.append(f"{name}: {len(cols)} unique colors (possible AA)")
    return issues


def write_manifest(batch1: list[dict], batch2: list[dict], batch3: list[dict] | None = None, batch4: list[dict] | None = None) -> None:
    lines = [
        "# Neo Drift — sprite batches 1, 2, 3 & 4",
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
        "- Texture keys **are the filenames without `.png`** so they drop into Phaser",
        "  `this.add.sprite(..., key)` / `anims.create` as-is.",
        "- `enemy.png` is hover frame 0 (drop-in). `enemy_0`…`enemy_3` are the loop.",
        "- Same pattern for every regular enemy (`enemy_tank.png` = `enemy_tank_0`).",
        "- Sheets in `sheets/` are already horizontal strips if you prefer to",
        "  slice (`frameWidth` × `frameHeight`) instead of packing individuals.",
        "- NPCs are **two keys** (`npc_*_body` + `npc_*_head`). Do **not** pack a",
        "  combined `npc_worker.png` — that combined key was removed so packing",
        "  cannot pick the wrong texture. `preview-8x/npc_*_composed@8x.png` is",
        "  preview-only (body then head stamped) and is not a game key.",
        "",
        "Suggested Phaser anims:",
        "",
        "```js",
        "// walk — 4 frames @ 6 fps (16×22, lote 1)",
        "this.anims.create({ key: 'walk_down', frames: [0,1,2,3].map(i => ({ key: `player_down_${i}` })), frameRate: 6, repeat: -1 });",
        "// melee — 4 frames @ 10 fps (24×28 — see Batch 2 note)",
        "this.anims.create({ key: 'atk_down', frames: [0,1,2,3].map(i => ({ key: `player_down_atk${i}` })), frameRate: 10 });",
        "// throw — 3 frames @ 8 fps (24×28)",
        "this.anims.create({ key: 'throw_down', frames: [0,1,2].map(i => ({ key: `player_down_throw${i}` })), frameRate: 8 });",
        "// blade projectile — 4 spin frames @ 12 fps (16×16)",
        "this.anims.create({ key: 'blade_shot', frames: [0,1,2,3].map(i => ({ key: `blade_shot_${i}` })), frameRate: 12, repeat: -1 });",
        "// drone hover — 4 frames @ 8 fps",
        "this.anims.create({ key: 'enemy_hover', frames: [0,1,2,3].map(i => ({ key: `enemy_${i}` })), frameRate: 8, repeat: -1 });",
        "// floor logo pulse — 2 frames @ 4 fps (96×96)",
        "this.anims.create({ key: 'floor_logo_pulse', frames: [0,1].map(i => ({ key: `floor_logo_${i}` })), frameRate: 4, repeat: -1 });",
        "// boss idle — 4 frames @ 6 fps (44×42)",
        "this.anims.create({ key: 'boss_idle', frames: [0,1,2,3].map(i => ({ key: `boss_${i}` })), frameRate: 6, repeat: -1 });",
        "// boss_alt idle — 4 frames @ 6 fps (44×42)",
        "this.anims.create({ key: 'boss_alt_idle', frames: [0,1,2,3].map(i => ({ key: `boss_alt_${i}` })), frameRate: 6, repeat: -1 });",
        "```",
        "",
        "## Batch 1",
        "",
        "| file | size | fps | notes |",
        "|---|---|---|---|",
    ]
    for r in batch1:
        lines.append(f"| `{r['file']}` | {r['size']} | {r['fps']} | {r['notes']} |")
    lines += [
        "",
        "## Batch 2",
        "",
        "Melee and throw poses are **24×28** (not 16×22). The 16×22 body is stamped",
        "at offset `(+4, +3)` so feet still sit near the bottom and padding is",
        "symmetric — `origin` `0.5, 0.5` keeps the body centered the same as walk",
        "frames. If a hitbox / shadow was authored against 16×22, add 4px X / 3px Y",
        "padding or tweak `setOrigin` / `setDisplayOrigin`.",
        "",
        "Drop-in aliases:",
        "",
        "- `player_{down,up,side}_atk` = `atk1` (peak swing, longest silhouette)",
        "- `player_{dir}_atk0..atk3` = the 4-frame melee (10 fps)",
        "- `player_{dir}_throw0..throw2` = the 3-frame throw (8 fps)",
        "- `blade_shot.png` = `blade_shot_0`; `slash.png` = `slash_1` (peak arc)",
        "- `enemy_<type>.png` = frame 0 of that hover/pulse loop",
        "",
        "| file | size | fps | notes |",
        "|---|---|---|---|",
    ]
    for r in batch2:
        lines.append(f"| `{r['file']}` | {r['size']} | {r['fps']} | {r['notes']} |")
    lines += [
        "",
        "## Batch 3",
        "",
        "Neo Industries floor decal + Guardião Núcleo (containment-wing guardian)",
        "redesign and a factory-security mecha alternative. Same pixelGrid pipeline,",
        "integer pixels, 1px baked outline, no anti-alias.",
        "",
        "Drop-in aliases:",
        "",
        "- `floor_logo.png` = `floor_logo_0` (rest). `floor_logo_glow.png` = `floor_logo_1` (brighter ring)",
        "- `boss.png` = `boss_1` (core mid-pulse). `boss_0`…`boss_3` idle @ 6 fps",
        "- `boss_alt.png` = `boss_alt_0`. `boss_alt_0`…`boss_alt_3` idle @ 6 fps",
        "- `boss_aura.png` 72×72 white ring; tint in-game",
        "",
        "Hitboxes stay the BootScene sizes: logo 96×96 (transparent outside the ring),",
        "boss / boss_alt 44×42 (feet at the bottom, transparent corners), aura 72×72.",
        "Boss outline `#140308`. Alt outline `#080A14`. Logo/aura default `#05060C`.",
        "",
        "| file | size | fps | notes |",
        "|---|---|---|---|",
    ]
    for r in (batch3 or []):
        lines.append(f"| `{r['file']}` | {r['size']} | {r['fps']} | {r['notes']} |")
    lines += [
        "",
        "## Batch 4",
        "",
        "Town NPCs split into **body** and **head** textures (BootScene",
        "`generateGuardNPC` / `generateEngineerNPC` / `generateWorkerNPC` /",
        "`generateCoordinatorNPC` / `generateHeraldNPC`).",
        "",
        "- Guard / engineer / worker / coordinator: **14×20**, outline `#05060C`.",
        "- Herald (Emissária Kess): **16×24**, outline `#05020A`.",
        "- Body PNG: torso / shoulders / legs only. Head area stays transparent.",
        "- Head PNG: head / helmet only. Body area stays transparent.",
        "- Same canvas size per character so they overlay 1:1. Each layer bakes",
        "  its own 1px outline — overlapping outlines at the neck are OK.",
        "- **NPC.js** overlays the head sprite on the body sprite and bobs **only",
        "  the head** vertically; the body stays planted on the ground.",
        "- Sheets are `[body | head]` side by side (28×20 or 32×24). Not an",
        "  animation (2 frames), so no `.piskel`.",
        "- Composed 8× previews (`preview-8x/npc_*_composed@8x.png`) stamp body",
        "  then head for viewing. They are **not** game keys and must not be packed.",
        "- Combined `npc_worker.png` (body+head on one grid) was **removed** so",
        "  packing cannot use the wrong texture.",
        "",
        "| file | size | fps | notes |",
        "|---|---|---|---|",
    ]
    for r in (batch4 or []):
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
        "`floorA #232742`, `floorB #2C3156`, `skin #D8C9A0`, `blade #F2FFFF`,",
        "`magenta #FF5FD0`, `ringLight #CFFFFF`, `bossHull #1C0509` / `#2A0A12` / `#4A1522`,",
        "`core #FF5A1F` / `#FFD08A`, `heraldOutline #05020A`, plus BootScene biome",
        "pairs, NPC coat/helmet colors, and derived shades (bevel, wear, rivet",
        "glint) — no anti-aliased in-betweens.",
        "",
        "Re-run: `python3 /workspace/neo-sprites/build_sprites.py`",
        "",
    ]
    (ROOT / "MANIFEST.md").write_text("\n".join(lines), encoding="utf-8")


def _emit_anim(add, rows, key, frames, fps, notes):
    for i, img in enumerate(frames):
        add(f"{key}_{i}" if not key.startswith("player_") else f"{key}{i}", img, fps, f"{notes} frame {i}", rows)
    # caller handles drop-in aliases + sheets


def main():
    for d in (PNG_DIR, SHEET_DIR, PISKEL_DIR, PREVIEW_DIR):
        d.mkdir(parents=True, exist_ok=True)

    native: dict[str, Image.Image] = {}
    b1: list[dict] = []
    b2: list[dict] = []
    b3: list[dict] = []
    b4: list[dict] = []

    def add(key: str, img: Image.Image, fps, notes, rows):
        native[key] = img
        save_png(img, key)
        preview_8x(img).save(PREVIEW_DIR / f"{key}@8x.png", "PNG")
        w, h = img.size
        rows.append({"file": f"png/{key}.png", "size": f"{w}×{h}", "fps": fps, "notes": notes})

    def sheet_and_piskel(name, frames, fps, rows, desc, notes):
        sheet = hstrip(frames)
        sheet.save(SHEET_DIR / f"{name}.png", "PNG")
        write_piskel(name, desc, frames, fps)
        w, h = frames[0].size
        rows.append({"file": f"sheets/{name}.png", "size": f"{w * len(frames)}×{h}", "fps": fps, "notes": notes})
        rows.append({"file": f"piskel/{name}.piskel", "size": f"{w}×{h}", "fps": fps, "notes": f"Piskel animation, {len(frames)} frames"})
        return sheet

    # --- lote 1: player walk ---
    for d in ("down", "up", "side"):
        frames = []
        for i, (ly, ry) in enumerate(WALK):
            img = make_player(d, ly, ry)
            add(f"player_{d}_{i}", img, 6, f"walk {d} frame {i} (leftY={ly}, rightY={ry})", b1)
            frames.append(img)
        sheet_and_piskel(f"player_{d}", frames, 6, b1, f"Neo Drift player walk {d}", f"horizontal strip, 4 frames × 16×22")

    # --- lote 1: drone ---
    enemy_frames = [
        make_enemy(0, ORANGE),
        make_enemy(1, GOLD),
        make_enemy(0, GOLD),
        make_enemy(-1, ORANGE),
    ]
    for i, img in enumerate(enemy_frames):
        add(f"enemy_{i}", img, 8, f"drone hover frame {i}", b1)
    add("enemy", enemy_frames[0], 8, "drop-in alias of enemy_0", b1)
    sheet_and_piskel("enemy", enemy_frames, 8, b1, "Neo Drift drone hover", "4 frames × 18×16")

    # --- lote 1: containment tiles ---
    tiles = [
        ("floor", make_floor(), "containment floor plates + rivets"),
        ("floor_vent", make_floor_vent(), "vent grate variant"),
        ("wall", make_wall(), "containment wall family"),
        ("door", make_door(), "sliding door + glow seam"),
        ("floor_hazard", make_floor_hazard(), "hazard stripes"),
    ]
    tile_imgs = []
    for key, img, notes in tiles:
        add(key, img, 1, notes, b1)
        tile_imgs.append(img)
    sheet_and_piskel("tiles", tile_imgs, 1, b1, "Neo Drift containment tiles", "floor, vent, wall, door, hazard")

    # --- lote 1: items ---
    items = [
        ("item_sword", make_item_sword(), "energy blade pickup"),
        ("item_pistol", make_item_pistol(), "pulse pistol"),
        ("item_armor", make_item_armor(), "chest armor"),
        ("item_medkit", make_item_medkit(), "HP kit"),
        ("item_keycard", make_item_keycard(), "access card"),
    ]
    item_imgs = []
    for key, img, notes in items:
        add(key, img, 1, notes, b1)
        item_imgs.append(img)
    sheet_and_piskel("items", item_imgs, 1, b1, "Neo Drift items", "sword, pistol, armor, medkit, keycard")

    # combined npc_worker.png removed — packing must use npc_worker_body/head

    # ======================================================================
    # BATCH 2
    # ======================================================================

    # --- player melee 24×28, 4 frames @ 10 fps ---
    for d in ("down", "up", "side"):
        frames = []
        for i in range(4):
            img = make_player_melee(d, i)
            add(f"player_{d}_atk{i}", img, 10, f"melee {d} frame {i} (24×28)", b2)
            frames.append(img)
        add(f"player_{d}_atk", frames[1], 10, f"drop-in alias of player_{d}_atk1 (peak swing)", b2)
        sheet_and_piskel(
            f"player_{d}_atk", frames, 10, b2,
            f"Neo Drift player melee {d}",
            "horizontal strip, 4 frames × 24×28",
        )

    # --- player throw 24×28, 3 frames @ 8 fps ---
    for d in ("down", "up", "side"):
        frames = []
        for i in range(3):
            img = make_player_throw(d, i)
            add(f"player_{d}_throw{i}", img, 8, f"throw {d} frame {i} (24×28)", b2)
            frames.append(img)
        sheet_and_piskel(
            f"player_{d}_throw", frames, 8, b2,
            f"Neo Drift player throw {d}",
            "horizontal strip, 3 frames × 24×28",
        )

    # --- thrown blade projectile ---
    blade_frames = [make_blade_shot(i) for i in range(4)]
    for i, img in enumerate(blade_frames):
        add(f"blade_shot_{i}", img, 12, f"spinning energy glaive frame {i}", b2)
    add("blade_shot", blade_frames[0], 12, "drop-in alias of blade_shot_0", b2)
    sheet_and_piskel("blade_shot", blade_frames, 12, b2, "Neo Drift thrown blade", "4 frames × 16×16")

    # --- slash FX ---
    slash_frames = [make_slash(i) for i in range(3)]
    for i, img in enumerate(slash_frames):
        add(f"slash_{i}", img, 10, f"melee arc FX frame {i}", b2)
    add("slash", slash_frames[1], 10, "drop-in alias of slash_1 (peak arc)", b2)
    sheet_and_piskel("slash", slash_frames, 10, b2, "Neo Drift melee slash FX", "3 frames × 40×40")

    add("bullet", make_bullet(), 1, "pulse bolt 10×5 (BootScene generateBullet)", b2)

    # --- regular enemies ---
    enemy_sets = [
        ("enemy_tank", hover4(make_enemy_tank), 8, "armored tank hover", "22×20"),
        ("enemy_foundry", hover4(make_enemy_foundry), 8, "foundry drone hover", "18×16"),
        ("enemy_electric", hover4(make_enemy_electric), 8, "electric drone hover", "18×16"),
        ("enemy_jammer", hover4(make_enemy_jammer), 8, "jammer drone hover", "18×16"),
        ("enemy_shooter", hover4(make_enemy_shooter), 8, "shooter drone hover", "18×16"),
        ("enemy_sentinel", [make_enemy_sentinel(0), make_enemy_sentinel(1)], 4, "sentinel turret lens pulse", "16×14"),
        ("enemy_miniboss", hover4(make_enemy_miniboss), 8, "elite / vault guardian hover", "26×24"),
        ("enemy_phasejumper", [make_enemy_phasejumper(i) for i in range(4)], 8, "phase jumper fragment drift", "18×18"),
        ("enemy_portalguardian", [make_enemy_portalguardian(i) for i in range(4)], 8, "portal guardian pulse", "30×30"),
        ("enemy_sentry", [make_enemy_sentry(i) for i in range(4)], 6, "sentry camera pulse", "18×18"),
        ("enemy_dweller", [make_enemy_dweller(i) for i in range(4)], 6, "tunnel dweller sway", "16×20"),
    ]
    for key, frames, fps, notes, size in enemy_sets:
        for i, img in enumerate(frames):
            add(f"{key}_{i}", img, fps, f"{notes} frame {i}", b2)
        add(key, frames[0], fps, f"drop-in alias of {key}_0", b2)
        sheet_and_piskel(key, frames, fps, b2, f"Neo Drift {notes}", f"{len(frames)} frames × {size}")

    # --- biome floors ---
    biome_specs = [
        ("floor_town", lambda: make_floor_colors(0x1E2338, 0x272C4A), "town plates 0x1e2338 / 0x272c4a"),
        ("floor_town_panel", make_floor_town_panel, "town vertical-panel variant"),
        ("floor_town_light", make_floor_town_light, "town embedded light"),
        ("floor_foundry", lambda: make_floor_colors(0x2A1A1A, 0x4A2C22), "foundry plates"),
        ("floor_foundry_vent", lambda: make_vent_colors(0x2A1A1A, 0x4A2C22), "foundry vent"),
        ("floor_reactor", lambda: make_floor_colors(0x1A2438, 0x243252), "reactor plates"),
        ("floor_reactor_vent", lambda: make_vent_colors(0x1A2438, 0x243252), "reactor vent"),
        ("floor_electric", make_electric_floor, "electrified zigzag"),
        ("floor_core", lambda: make_floor_colors(0x1C1830, 0x2A2450), "core plates"),
        ("floor_core_vent", lambda: make_vent_colors(0x1C1830, 0x2A2450), "core vent"),
        ("floor_tower", lambda: make_floor_colors(0x1A2028, 0x24303C), "tower plates"),
        ("floor_tower_vent", lambda: make_vent_colors(0x1A2028, 0x24303C), "tower vent"),
        ("floor_district", make_district_floor, "district wet asphalt"),
        ("floor_district_puddle", make_district_puddle, "district neon puddle"),
        ("floor_arsenal", lambda: make_floor_colors(0x1C2418, 0x2C3A20), "arsenal plates"),
        ("floor_arsenal_vent", lambda: make_vent_colors(0x1C2418, 0x2C3A20), "arsenal vent"),
        ("floor_nexus", lambda: make_floor_colors(0x1C1430, 0x2E1F52), "nexus plates"),
        ("floor_nexus_vent", lambda: make_vent_colors(0x1C1430, 0x2E1F52), "nexus vent"),
        ("floor_vigilancia", lambda: make_floor_colors(0x141C1A, 0x1E2C28), "vigilancia plates"),
        ("floor_vigilancia_vent", lambda: make_vent_colors(0x141C1A, 0x1E2C28), "vigilancia vent"),
        ("floor_submundo", lambda: make_floor_colors(0x161412, 0x201C18), "submundo plates"),
        ("floor_submundo_vent", lambda: make_vent_colors(0x161412, 0x201C18), "submundo vent"),
        ("floor_fantasma", lambda: make_floor_colors(0x1A1A1C, 0x26262A), "fantasma plates"),
        ("floor_fantasma_vent", lambda: make_vent_colors(0x1A1A1C, 0x26262A), "fantasma vent"),
    ]
    biome_row = []
    biome_keys_row = (
        "floor_town", "floor_foundry", "floor_reactor", "floor_electric",
        "floor_core", "floor_tower", "floor_district", "floor_arsenal",
        "floor_nexus", "floor_vigilancia", "floor_submundo", "floor_fantasma",
    )
    biome_imgs = {}
    for key, maker, notes in biome_specs:
        img = maker()
        add(key, img, 1, notes, b2)
        biome_imgs[key] = img
    for k in biome_keys_row:
        biome_row.append(biome_imgs[k])
    sheet_and_piskel("tiles_biomes", biome_row, 1, b2, "Neo Drift biome floors", "12 representative biome floors")

    # --- walls ---
    wall_specs = [
        ("wall_foundry", lambda: make_wall_family(0x3A2420, 0x1C1210, 0xFF6A3D, 0x5A3226, 0x120A08), "foundry family wall"),
        ("wall_reactor", lambda: make_wall_family(0x223048, 0x101A2A, 0x37F0FF, 0x2F5F78, 0x08121E), "reactor family wall"),
        ("wall_core", lambda: make_wall_family(0x2A2450, 0x140F2A, 0xB37AFF, 0x4A3A7A, 0x0C081C), "core family wall"),
        ("wall_district", make_wall_district, "district neon facade"),
        ("wall_tower", make_wall_tower, "tower clean sci-fi panel"),
        ("wall_arsenal", make_wall_arsenal, "arsenal scratched steel"),
        ("wall_nexus", make_wall_nexus, "nexus energy conduits"),
        ("wall_vigilancia", make_wall_vigilancia, "vigilancia monitor bank"),
        ("wall_submundo", make_wall_submundo, "submundo wet rock"),
        ("wall_fantasma", make_wall_fantasma, "fantasma subway tile"),
    ]
    wall_imgs = []
    for key, maker, notes in wall_specs:
        img = maker()
        add(key, img, 1, notes, b2)
        wall_imgs.append(img)
    sheet_and_piskel("tiles_walls", wall_imgs, 1, b2, "Neo Drift biome walls", "10 biome walls")

    # --- doors ---
    door_specs = [
        ("door_tower", make_door_tower, "tower blue-seam door"),
        ("door_arsenal", make_door_arsenal, "arsenal hatch + lock wheel"),
        ("door_nexus", make_door_nexus, "nexus portal ring"),
        ("door_vigilancia", make_door_vigilancia, "vigilancia camera iris"),
    ]
    door_imgs = []
    for key, maker, notes in door_specs:
        img = maker()
        add(key, img, 1, notes, b2)
        door_imgs.append(img)
    sheet_and_piskel("tiles_doors", door_imgs, 1, b2, "Neo Drift biome doors", "tower, arsenal, nexus, vigilancia")

    # --- puzzle tiles ---
    puzzle_specs = [
        ("tile_sequence_off", lambda: make_tile_sequence(False), "sequence pad off"),
        ("tile_sequence_on", lambda: make_tile_sequence(True), "sequence pad on"),
        ("tile_circuit_off", lambda: make_tile_circuit(False), "circuit cell off"),
        ("tile_circuit_on", lambda: make_tile_circuit(True), "circuit cell on"),
        ("trap_off", lambda: make_trap("off"), "spike trap retracted"),
        ("trap_warn", lambda: make_trap("warn"), "spike trap warning"),
        ("trap_on", lambda: make_trap("on"), "spike trap raised"),
        ("tile_signal_off", lambda: make_tile_signal(False), "signal monitor off"),
        ("tile_signal_on", lambda: make_tile_signal(True), "signal monitor on"),
    ]
    puzzle_imgs = []
    for key, maker, notes in puzzle_specs:
        img = maker()
        add(key, img, 1, notes, b2)
        puzzle_imgs.append(img)
    sheet_and_piskel("tiles_puzzles", puzzle_imgs, 1, b2, "Neo Drift puzzle tiles", "sequence / circuit / trap / signal")

    # ======================================================================
    # BATCH 3
    # ======================================================================

    logo_frames = [make_floor_logo(False), make_floor_logo(True)]
    add("floor_logo_0", logo_frames[0], 4, "Neo Industries floor decal rest", b3)
    add("floor_logo_1", logo_frames[1], 4, "Neo Industries floor decal glow pulse", b3)
    add("floor_logo", logo_frames[0], 4, "drop-in alias of floor_logo_0", b3)
    add("floor_logo_glow", logo_frames[1], 4, "drop-in alias of floor_logo_1 (brighter ring)", b3)
    sheet_and_piskel(
        "floor_logo", logo_frames, 4, b3,
        "Neo Industries floor logo pulse",
        "horizontal strip, 2 frames × 96×96 @ 4 fps",
    )

    boss_frames = [make_boss(i) for i in range(4)]
    for i, img in enumerate(boss_frames):
        add(f"boss_{i}", img, 6, f"Guardião Núcleo idle pulse frame {i}", b3)
    add("boss", boss_frames[1], 6, "drop-in alias of boss_1 (core mid-pulse)", b3)
    sheet_and_piskel(
        "boss", boss_frames, 6, b3,
        "Neo Drift Guardião Núcleo idle",
        "horizontal strip, 4 frames × 44×42",
    )

    alt_frames = [make_boss_alt(i) for i in range(4)]
    for i, img in enumerate(alt_frames):
        add(f"boss_alt_{i}", img, 6, f"factory security mecha idle pulse frame {i}", b3)
    add("boss_alt", alt_frames[0], 6, "drop-in alias of boss_alt_0", b3)
    sheet_and_piskel(
        "boss_alt", alt_frames, 6, b3,
        "Neo Drift factory security mecha idle",
        "horizontal strip, 4 frames × 44×42",
    )

    add("boss_aura", make_boss_aura(), 1, "72×72 white tick-ring (tint in-game)", b3)

    # ======================================================================
    # BATCH 4 — NPC body / head layers (NPC.js overlays head, bobs head only)
    # ======================================================================
    for leftover in (
        PNG_DIR / "npc_worker.png",
        PREVIEW_DIR / "npc_worker@8x.png",
    ):
        if leftover.exists():
            leftover.unlink()

    npc_sets = [
        ("npc_guard", make_npc_guard_body(), make_npc_guard_head(),
         "guard tactical armor + visored helmet", 14, 20, OUTLINE),
        ("npc_engineer", make_npc_engineer_body(), make_npc_engineer_head(),
         "engineer coverall + brow goggles", 14, 20, OUTLINE),
        ("npc_worker", make_npc_worker_body(), make_npc_worker_head(),
         "factory worker coverall + hard hat", 14, 20, OUTLINE),
        ("npc_coordinator", make_npc_coordinator_body(), make_npc_coordinator_head(),
         "coordinator long coat + badge", 14, 20, OUTLINE),
        ("npc_herald", make_npc_herald_body(), make_npc_herald_head(),
         "herald hooded cloak + cyan eyes", 16, 24, HERALD_OUTLINE),
    ]
    for key, body, head, notes, nw, nh, _oc in npc_sets:
        add(f"{key}_body", body, 1,
            f"{notes} — BODY only (torso/shoulders/legs; head area transparent)", b4)
        add(f"{key}_head", head, 1,
            f"{notes} — HEAD only (head/helmet; body area transparent). "
            "NPC.js overlays on body and bobs only this sprite", b4)
        sheet = hstrip([body, head])
        sheet.save(SHEET_DIR / f"{key}.png", "PNG")
        b4.append({
            "file": f"sheets/{key}.png",
            "size": f"{nw * 2}×{nh}",
            "fps": 1,
            "notes": "[body|head] side by side (not an animation)",
        })
        composed = composite(body, head)
        preview_8x(composed).save(PREVIEW_DIR / f"{key}_composed@8x.png", "PNG")
        preview_8x(sheet).save(PREVIEW_DIR / f"{key}_sheet@8x.png", "PNG")

    # 8x previews of the sheets the user will want to look at
    highlight_sheets = [
        "player_down_atk", "player_up_atk", "player_side_atk",
        "player_down_throw", "player_side_throw", "blade_shot", "slash",
        "enemy_tank", "enemy_foundry", "enemy_electric",
        "enemy_jammer", "enemy_shooter", "enemy_portalguardian", "enemy_dweller",
        "tiles_biomes", "tiles_walls", "tiles_doors",
        "floor_logo", "boss", "boss_alt",
    ]
    for name in highlight_sheets:
        pth = SHEET_DIR / f"{name}.png"
        if pth.exists():
            preview_8x(Image.open(pth)).save(PREVIEW_DIR / f"{name}_sheet@8x.png", "PNG")

    write_manifest(b1, b2, b3, b4)

    # --- verify ---
    checks = [
        ("player_down_0", 16, 22, True),
        ("player_up_0", 16, 22, True),
        ("player_side_0", 16, 22, True),
        ("player_down_3", 16, 22, True),
        ("player_down_atk0", 24, 28, True),
        ("player_down_atk1", 24, 28, True),
        ("player_down_atk", 24, 28, True),
        ("player_up_atk2", 24, 28, True),
        ("player_side_atk3", 24, 28, True),
        ("player_down_throw0", 24, 28, True),
        ("player_side_throw1", 24, 28, True),
        ("player_up_throw2", 24, 28, True),
        ("blade_shot_0", 16, 16, True),
        ("blade_shot_3", 16, 16, True),
        ("slash", 40, 40, True),
        ("slash_0", 40, 40, True),
        ("bullet", 10, 5, False),  # fills to canvas edge like BootScene
        ("enemy_0", 18, 16, True),
        ("enemy", 18, 16, True),
        ("enemy_tank", 22, 20, True),
        ("enemy_foundry", 18, 16, True),
        ("enemy_electric", 18, 16, True),
        ("enemy_jammer", 18, 16, True),
        ("enemy_shooter", 18, 16, True),
        ("enemy_sentinel", 16, 14, True),
        ("enemy_miniboss", 26, 24, True),
        ("enemy_phasejumper", 18, 18, True),
        ("enemy_portalguardian", 30, 30, True),
        ("enemy_sentry", 18, 18, True),
        ("enemy_dweller", 16, 20, True),
        ("floor", 32, 32, False),
        ("floor_town", 32, 32, False),
        ("floor_electric", 32, 32, False),
        ("floor_district_puddle", 32, 32, False),
        ("wall_foundry", 32, 32, False),
        ("wall_arsenal", 32, 32, False),
        ("wall_fantasma", 32, 32, False),
        ("door_tower", 32, 32, False),
        ("door_nexus", 32, 32, False),
        ("tile_sequence_on", 32, 32, False),
        ("trap_on", 32, 32, False),
        ("tile_signal_on", 32, 32, False),
        ("item_sword", 20, 20, True),
        ("npc_guard_body", 14, 20, True),
        ("npc_guard_head", 14, 20, True),
        ("npc_engineer_body", 14, 20, True),
        ("npc_engineer_head", 14, 20, True),
        ("npc_worker_body", 14, 20, True),
        ("npc_worker_head", 14, 20, True),
        ("npc_coordinator_body", 14, 20, True),
        ("npc_coordinator_head", 14, 20, True),
        ("npc_herald_body", 16, 24, True),
        ("npc_herald_head", 16, 24, True),
        ("floor_logo", 96, 96, True),
        ("floor_logo_0", 96, 96, True),
        ("floor_logo_1", 96, 96, True),
        ("floor_logo_glow", 96, 96, True),
        ("boss", 44, 42, True),
        ("boss_0", 44, 42, True),
        ("boss_1", 44, 42, True),
        ("boss_2", 44, 42, True),
        ("boss_3", 44, 42, True),
        ("boss_alt", 44, 42, True),
        ("boss_alt_0", 44, 42, True),
        ("boss_alt_3", 44, 42, True),
        ("boss_aura", 72, 72, True),
    ]
    issues = []
    for key, w, h, tc in checks:
        issues.extend(verify(PNG_DIR / f"{key}.png", w, h, tc))

    for key in ("player_down_0", "player_down_atk1", "enemy", "npc_worker_body", "npc_worker_head", "blade_shot"):
        img = Image.open(PNG_DIR / f"{key}.png")
        cols = unique_colors(img)
        has_outline = any(c[:3] == rgb(OUTLINE) and c[3] == 255 for c in cols)
        if not has_outline:
            issues.append(f"{key}: missing outline #05060C")

    # tiles must be fully opaque
    for key in ("floor_town", "floor_electric", "wall_district", "door_arsenal", "trap_off", "tile_circuit_on"):
        img = Image.open(PNG_DIR / f"{key}.png").convert("RGBA")
        if any(c[3] == 0 for c in unique_colors(img)):
            issues.append(f"{key}: tile has transparent pixels")

    for key, nw, nh, oc in (
        ("npc_guard", 14, 20, OUTLINE),
        ("npc_engineer", 14, 20, OUTLINE),
        ("npc_worker", 14, 20, OUTLINE),
        ("npc_coordinator", 14, 20, OUTLINE),
        ("npc_herald", 16, 24, HERALD_OUTLINE),
    ):
        issues.extend(verify_npc_split(key, nw, nh, oc))

    leftover = PNG_DIR / "npc_worker.png"
    if leftover.exists():
        issues.append("png/npc_worker.png still present (combined key should be removed)")

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

    # batch 3 outlines
    for key, oc in (("boss", BOSS_OUTLINE), ("boss_alt", ALT_OUTLINE), ("floor_logo", OUTLINE), ("boss_aura", OUTLINE)):
        img = Image.open(PNG_DIR / f"{key}.png")
        cols = unique_colors(img)
        has_outline = any(c[:3] == rgb(oc) and c[3] == 255 for c in cols)
        if not has_outline:
            issues.append(f"{key}: missing outline #{oc:06X}")

    for key in (
        "player_down_atk1", "player_side_throw1", "blade_shot_0",
        "enemy_tank", "enemy_dweller", "floor_electric", "wall_arsenal", "door_nexus",
        "floor_logo", "boss", "boss_alt", "boss_aura",
        "npc_worker_body", "npc_worker_head", "npc_herald_body", "npc_herald_head",
        "npc_guard_body", "npc_guard_head",
    ):
        img = Image.open(PNG_DIR / f"{key}.png")
        cols = [c for c in unique_colors(img) if c[3] != 0]
        print(f"  {key} {img.size} opaque-colors={len(cols)}")


if __name__ == "__main__":
    main()
