#!/usr/bin/env python3
"""
Neo Drift sprite batch — pixelGrid pipeline in Python.

Recreates src/utils/pixelGrid.js + the BootScene generators for the first
art batches (lote 1 walk/tiles/items + lote 2 melee/throw, enemies, biome tiles
+ lote 3 logo/boss + lote 4 NPC body/head splits + lote 5 remaining named bosses
+ lote 6 remaining pickups / props / FX).

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


def hstrip_mixed(frames: list[Image.Image], align: str = "bottom") -> Image.Image:
    """Catalog strip for mixed native sizes (bottom-aligned, no uniform cell)."""
    heights = [f.size[1] for f in frames]
    widths = [f.size[0] for f in frames]
    h = max(heights)
    sheet = Image.new("RGBA", (sum(widths), h), (0, 0, 0, 0))
    x = 0
    for f, fw, fh in zip(frames, widths, heights):
        y = h - fh if align == "bottom" else 0
        sheet.paste(f, (x, y))
        x += fw
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
    polish_pixel(grid, 6, 7, 0xE0FFFF)
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
# Batch 5 — remaining named bosses (drop-in key = frame 0, 4-frame idle @ 6 fps)
# ---------------------------------------------------------------------------
FOUNDRY_OUTLINE = 0x0D0304
REACTOR_OUTLINE = 0x050A12
VIGIA_OUTLINE = 0x08050F
CURATOR_OUTLINE = 0x05080F
TANK_OUTLINE = 0x0A0D08


def fill_ring(grid, cx, cy, r_out, r_in, color):
    fill_circle(grid, cx, cy, r_out, color)
    clear_circle(grid, cx, cy, r_in)


def fill_ellipse_ring(grid, cx, cy, rx, ry, rx_in, ry_in, color):
    """Flat hover-ring: outer ellipse minus inner ellipse."""
    for y in range(grid["h"]):
        for x in range(grid["w"]):
            dx = x - cx + 0.5
            dy = y - cy + 0.5
            if (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1:
                if (dx * dx) / (rx_in * rx_in) + (dy * dy) / (ry_in * ry_in) > 1:
                    set_pixel(grid, x, y, color)


def fill_hex(grid, cx, cy, r, color):
    for y in range(cy - r, cy + r + 1):
        dy = abs(y - cy)
        w = r - dy // 2
        fill_rect(grid, cx - w, y, w * 2 + 1, 1, color)


def paint_chevron(grid, cx, cy, direction, color):
    """1-bit chevron. direction: 0=E, 1=S, 2=W, 3=N."""
    set_pixel(grid, cx, cy, color)
    if direction == 0:
        set_pixel(grid, cx - 1, cy - 1, color)
        set_pixel(grid, cx - 1, cy + 1, color)
        set_pixel(grid, cx + 1, cy, color)
    elif direction == 1:
        set_pixel(grid, cx - 1, cy - 1, color)
        set_pixel(grid, cx + 1, cy - 1, color)
        set_pixel(grid, cx, cy + 1, color)
    elif direction == 2:
        set_pixel(grid, cx + 1, cy - 1, color)
        set_pixel(grid, cx + 1, cy + 1, color)
        set_pixel(grid, cx - 1, cy, color)
    else:
        set_pixel(grid, cx - 1, cy + 1, color)
        set_pixel(grid, cx + 1, cy + 1, color)
        set_pixel(grid, cx, cy - 1, color)


def paint_dish(grid, cx, cy, r, body, well, accent, facing_deg):
    fill_circle(grid, cx, cy, r, body)
    fill_circle(grid, cx, cy, max(1, r - 2), well)
    rad = math.radians(facing_deg)
    set_pixel(grid, round(cx + math.cos(rad) * (r - 1)),
              round(cy + math.sin(rad) * (r - 1)), accent)
    set_pixel(grid, round(cx + math.cos(rad) * max(0, r - 3)),
              round(cy + math.sin(rad) * max(0, r - 3)), accent)


def omit_pattern(grid, phase, stride, x0=0, y0=0, x1=None, y1=None):
    x1 = grid["w"] if x1 is None else x1
    y1 = grid["h"] if y1 is None else y1
    for y in range(y0, y1):
        for x in range(x0, x1):
            if grid["cells"][y][x] is None:
                continue
            if (x * 3 + y * 2 + phase) % stride == 0:
                grid["cells"][y][x] = None


def recolor_map(grid, mapping):
    for y in range(grid["h"]):
        for x in range(grid["w"]):
            c = grid["cells"][y][x]
            if c in mapping:
                grid["cells"][y][x] = mapping[c]


def make_boss_foundry(frame: int = 0) -> Image.Image:
    """46×40 Fundidor Primordial — wide furnace, twin chimneys, chest mouth beam."""
    grid = create_grid(46, 40)
    hull, mid, plate = 0x1A0508, 0x330A10, 0x5A1015
    dark, chim = 0x100304, 0x2A0A0C
    magma, gold, white = 0xFF7A2F, 0xFFCF3D, 0xFFFFFF
    ember = 0xFF9D3D
    fist_hot = 0xFF5A1F

    mouth_core = (gold, white, white, gold)[frame]
    mouth_mid = (magma, gold, white, magma)[frame]
    mouth_r = (3, 4, 5, 3)[frame]
    spark = frame in (1, 2)

    # plinth feet (furnace stands, not hydraulic mech legs)
    fill_rect(grid, 10, 36, 10, 3, dark)
    fill_rect(grid, 11, 35, 8, 1, hull)
    fill_rect(grid, 26, 36, 11, 3, dark)
    fill_rect(grid, 27, 35, 9, 1, hull)
    fill_rect(grid, 10, 38, 3, 1, plate)
    fill_rect(grid, 34, 38, 3, 1, plate)

    # wide furnace body — trapezoid, plated
    fill_rect(grid, 10, 12, 26, 24, hull)
    fill_rect(grid, 8, 16, 30, 18, mid)
    fill_rect(grid, 12, 12, 22, 4, plate)
    set_pixel(grid, 10, 12, None)
    set_pixel(grid, 35, 12, None)
    set_pixel(grid, 8, 16, None)
    set_pixel(grid, 37, 16, None)
    paint_over(grid, 12, 20, 22, 1, hull)
    paint_over(grid, 12, 21, 22, 1, magma)
    fill_rect(grid, 14, 32, 18, 3, hull)

    # magma cracks
    for x0, y0, x1, y1 in (
        (12, 15, 16, 19), (30, 14, 34, 19), (14, 28, 18, 32), (29, 27, 33, 31),
    ):
        paint_line(grid, x0, y0, x1, y1, magma)
    for x, y in ((13, 18), (32, 17), (17, 29), (31, 28), (20, 14), (26, 33)):
        polish_pixel(grid, x, y, ember if spark else magma)

    # twin chimneys — left taller/wider, right shorter
    fill_rect(grid, 9, 4, 7, 10, chim)
    fill_rect(grid, 10, 3, 5, 2, hull)
    fill_circle(grid, 12, 3, 3, chim)
    fill_circle(grid, 12, 2, 2, ember if frame != 3 else magma)
    if spark:
        set_pixel(grid, 11, 0, gold)
        set_pixel(grid, 13, 1, magma)
        if frame == 2:
            set_pixel(grid, 14, 0, white)
    fill_rect(grid, 30, 8, 6, 8, chim)
    fill_rect(grid, 31, 7, 4, 2, hull)
    fill_circle(grid, 33, 7, 2, chim)
    fill_circle(grid, 33, 6, 2, ember if frame >= 1 else magma)
    if frame == 2:
        set_pixel(grid, 32, 4, gold)
        set_pixel(grid, 34, 5, magma)
    if frame == 3:
        set_pixel(grid, 12, 1, magma)
        set_pixel(grid, 33, 5, magma)

    # huge furnace MOUTH in chest — beam source (not a shoulder cannon)
    fill_circle(grid, 23, 22, 8, dark)
    fill_rect(grid, 16, 19, 14, 7, dark)
    fill_circle(grid, 23, 22, 6, mouth_mid)
    fill_circle(grid, 23, 22, mouth_r, mouth_core)
    set_pixel(grid, 20, 20, white if frame == 2 else gold)
    # lip rivets
    for x in (16, 30):
        set_pixel(grid, x, 22, plate)
    # telegraph / beam tell down from mouth toward player
    if frame == 1:
        fill_rect(grid, 22, 29, 2, 4, magma)
    elif frame == 2:
        fill_rect(grid, 21, 28, 4, 6, magma)
        fill_rect(grid, 22, 29, 2, 5, white)

    # drum fists — right visibly larger, hanging at sides
    fill_circle(grid, 3, 24, 6, plate)
    fill_circle(grid, 3, 24, 3, fist_hot if frame in (1, 2) else magma)
    fill_circle(grid, 43, 26, 7, plate)
    fill_circle(grid, 43, 26, 3, fist_hot if frame in (1, 2) else magma)
    set_pixel(grid, 2, 23, ember)
    set_pixel(grid, 42, 24, ember)

    return render_grid(grid, outline_color=FOUNDRY_OUTLINE)


def make_boss_reactor(frame: int = 0) -> Image.Image:
    """42×44 Titã Voltaico — floating tesla core, no legs, hover ring, orbiting orbs."""
    grid = create_grid(42, 44)
    hull, mid = 0x0A1420, 0x162C44
    cyan, spark, white = 0x37F0FF, 0x9FFFFF, 0xFFFFFF
    band = 0x18E8FF
    dy = (0, -1, 0, 1)[frame]
    core_r = (4, 5, 6, 4)[frame]
    hi_r = (2, 2, 3, 1)[frame]
    core_c = (cyan, cyan, white, cyan)[frame]
    hi_c = (white, spark, white, spark)[frame]

    # FLAT hover ring planted on the floor — must not read as legs.
    ring_c = band if frame != 2 else white
    fill_ellipse_ring(grid, 21, 40, 16, 4, 11, 2, hull)
    fill_ellipse_ring(grid, 21, 40, 15, 3, 12, 1.6, ring_c)
    # lightning-mark ticks (attack tell: ring-mark then strike)
    tick_col = spark if frame in (1, 2) else cyan
    for deg in (0 + frame * 30, 90 + frame * 30, 180 + frame * 30, 270 + frame * 30):
        rad = math.radians(deg)
        tx = round(21 + math.cos(rad) * 14)
        ty = round(40 + math.sin(rad) * 3)
        set_pixel(grid, tx, ty, tick_col)

    by = 17 + dy
    fill_circle(grid, 21, by, 12, hull)
    fill_circle(grid, 21, by, 9, mid)
    fill_circle(grid, 21, by, 6, hull)
    fill_circle(grid, 21, by, core_r, core_c)
    fill_circle(grid, 21, by, hi_r, hi_c)
    set_pixel(grid, 19, by - 2, white)

    # tesla-coil horns — stacked discs, asymmetric heights
    fill_rect(grid, 9, 4 + dy, 3, 8, mid)
    fill_circle(grid, 10, 5 + dy, 3, hull)
    fill_circle(grid, 10, 2 + dy, 4, hull)
    fill_circle(grid, 10, 2 + dy, 2, spark if frame in (1, 2) else cyan)
    fill_rect(grid, 30, 8 + dy, 3, 6, mid)
    fill_circle(grid, 31, 8 + dy, 3, hull)
    fill_circle(grid, 31, 6 + dy, 3, hull)
    fill_circle(grid, 31, 6 + dy, 1, spark if frame == 2 else cyan)
    if frame == 1:
        set_pixel(grid, 10, 0 + dy, spark)
        set_pixel(grid, 12, 1 + dy, cyan)
    if frame == 2:
        set_pixel(grid, 10, 0 + dy, white)
        set_pixel(grid, 12, 1 + dy, spark)
        set_pixel(grid, 31, 4 + dy, white)
        paint_line(grid, 10, 3 + dy, 16, 8 + dy, spark)
        paint_line(grid, 31, 6 + dy, 26, 10 + dy, spark)

    # orbiting spark orbs (around the BODY, not the ring)
    orbs = (
        (20 + frame * 25, 15, 3),
        (110 + frame * 25, 13, 2),
        (200 + frame * 25, 14, 3),
        (300 + frame * 25, 12, 2),
    )
    for deg, rr, rad in orbs:
        ox = round(21 + math.cos(math.radians(deg)) * rr)
        oy = round(by + math.sin(math.radians(deg)) * rr)
        oy = max(4, min(32, oy))  # keep off the hover ring and corners
        ox = max(3, min(38, ox))
        fill_circle(grid, ox, oy, rad, spark if frame != 3 else cyan)
        if frame == 2:
            set_pixel(grid, ox, oy, white)

    return render_grid(grid, outline_color=REACTOR_OUTLINE)


def make_boss_core(frame: int = 0) -> Image.Image:
    """46×46 Vigia Central — command node, many lenses, twin dishes, summon blink."""
    grid = create_grid(46, 46)
    hull, mid, dark = 0x140A1E, 0x2A1440, 0x0A0614
    violet, mag, white = 0x9F5FFF, 0xD88BFF, 0xFFFFFF
    dish = 0x1A1330

    # violet command-node body (faceted, not a furnace / tesla / tank)
    fill_hex(grid, 23, 26, 14, hull)
    fill_hex(grid, 23, 26, 10, mid)
    fill_circle(grid, 23, 26, 8, dark)
    fill_circle(grid, 23, 26, 5, mag if frame != 3 else violet)
    fill_circle(grid, 23, 26, 2, white)
    set_pixel(grid, 21, 24, white)

    # twin dish antennas on top (asymmetric)
    paint_dish(grid, 15, 5, 4, dish, mag, white if frame == 0 else violet, 270 + frame * 20)
    paint_dish(grid, 32, 3, 3, dish, mag, white if frame == 2 else violet, 250 + frame * 25)
    fill_rect(grid, 14, 8, 2, 6, mid)
    fill_rect(grid, 31, 6, 2, 8, mid)

    # satellite lenses around the body — blink in sequence (summon tell)
    # 0: rest (center only)  1: NW  2: NE+SE (fury double)  3: SW
    sats = [
        (7, 15, 5, 1),
        (39, 13, 4, 2),
        (5, 36, 4, 3),
        (41, 37, 5, 2),
        (12, 40, 3, 1),  # extra low lens — "many eyes"
    ]
    on_set = ({}, {1}, {2}, {3})[frame]
    for cx, cy, r, idx in sats:
        lit = idx in on_set
        fill_circle(grid, cx, cy, r, dish)
        fill_circle(grid, cx, cy, max(1, r - 2), mag if lit else violet)
        if lit:
            fill_circle(grid, cx, cy, 1, white)
            set_pixel(grid, cx - 1, cy - 1, white)
        else:
            set_pixel(grid, cx - 1, cy - 1, violet)

    return render_grid(grid, outline_color=VIGIA_OUTLINE)


def make_boss_curator(frame: int = 0) -> Image.Image:
    """44×44 Curador Supremo — slim prism android, glitch/fade idle, solid frame 0."""
    grid = create_grid(44, 44)
    teal_d, teal, teal_m = 0x0A1A1C, 0x0E2A2C, 0x1A4044
    cyan, mag, gold, white = 0x37F0FF, 0xFF5FD0, 0xFFD27A, 0xFFFFFF
    glass = 0x8FC9FF

    # slim legs
    fill_rect(grid, 16, 28, 4, 12, teal_d)
    fill_rect(grid, 24, 28, 4, 12, teal_d)
    fill_rect(grid, 16, 38, 4, 3, teal_m)
    fill_rect(grid, 24, 38, 4, 3, teal_m)
    paint_over(grid, 16, 30, 1, 10, cyan)
    paint_over(grid, 27, 30, 1, 10, mag)

    # narrow torso + faceted crystal core
    fill_rect(grid, 16, 14, 12, 15, teal)
    set_pixel(grid, 16, 14, None)
    set_pixel(grid, 27, 14, None)
    fill_rect(grid, 17, 15, 10, 4, teal_m)
    fill_hex(grid, 22, 21, 5, teal_d)
    fill_hex(grid, 22, 21, 3, (glass, cyan, gold, mag)[frame])
    fill_hex(grid, 22, 21, 1, white)
    # high-contrast edge shards on torso
    paint_over(grid, 16, 18, 1, 8, cyan)
    paint_over(grid, 27, 18, 1, 8, mag)
    set_pixel(grid, 18, 16, gold)
    set_pixel(grid, 25, 16, gold)

    # head + visor
    fill_rect(grid, 17, 5, 10, 9, teal_d)
    fill_rect(grid, 18, 6, 8, 6, teal_m)
    paint_over(grid, 19, 9, 6, 1, cyan if frame != 2 else white)
    set_pixel(grid, 20, 8, white)
    set_pixel(grid, 23, 8, mag if frame == 2 else white)
    fill_hex(grid, 22, 6, 2, glass)

    # thin arms slightly out (AoE explosion read)
    fill_rect(grid, 8, 16, 8, 3, teal)
    fill_rect(grid, 28, 16, 8, 3, teal)
    fill_rect(grid, 6, 15, 3, 5, teal_m)
    fill_rect(grid, 35, 15, 3, 5, teal_m)
    set_pixel(grid, 6, 16, gold)
    set_pixel(grid, 37, 16, gold)
    paint_over(grid, 8, 16, 8, 1, cyan)
    paint_over(grid, 28, 16, 8, 1, mag)

    # prism shards (afterimage-friendly)
    shards = ((4, 10, gold), (40, 12, cyan), (5, 32, cyan), (39, 34, mag),
              (10, 8, mag), (34, 8, gold), (12, 36, gold), (32, 36, cyan))
    for sx, sy, col in shards:
        fill_diamond(grid, sx, sy, 2, col)
        set_pixel(grid, sx, sy, white)

    # frame 2: AoE explosion tell — 1px ring around the body
    if frame == 2:
        fill_ring(grid, 22, 22, 16, 15, gold)
        fill_ring(grid, 22, 22, 18, 17, mag)

    if frame != 0:
        # afterimage: copy prism pixels 1–2px to the side
        ox = 1 if frame == 1 else 2
        extras = []
        for y in range(grid["h"]):
            for x in range(grid["w"]):
                c = grid["cells"][y][x]
                if c in (cyan, mag, gold, glass):
                    extras.append((x + ox, y, c))
        for x, y, c in extras:
            if 1 <= x < 43 and 1 <= y < 43 and grid["cells"][y][x] is None:
                set_pixel(grid, x, y, c)
        # glitch/fade by omitting pixels (alpha-like). frame 0 stays fully opaque.
        stride = 5 if frame == 1 else 3 if frame == 2 else 6
        omit_pattern(grid, 7 + frame, stride, x0=2, y0=2, x1=42, y1=42)
        if frame == 2:
            recolor_map(grid, {mag: 0x5A6A6A, cyan: 0x7A9A9A, gold: 0x8A8A70})
        elif frame == 3:
            recolor_map(grid, {mag: 0x7A4A70, cyan: 0x4A8A8A})

    return render_grid(grid, outline_color=CURATOR_OUTLINE)


def make_boss_tank(frame: int = 0) -> Image.Image:
    """56×44 tanque do Arsenal Blindado — low hull, treads, long horizontal cannon."""
    grid = create_grid(56, 44)
    td, tm = 0x1C2418, 0x2C3A20
    hull, hlit = 0x3A4A2A, 0x4A5A38
    tur, tlit = 0x445536, 0x566A44
    barrel, dark = 0x232B18, 0x18161A
    haz, gold, muzzle = 0xE8B93D, 0xFFE066, 0x9FFF6A
    lamp = 0xFFF2C2

    # treads along the underside (3/4 vehicle) — click by shifting grousers
    fill_rect(grid, 4, 30, 40, 11, td)
    fill_rect(grid, 5, 31, 38, 9, tm)
    off = frame % 2
    for x in range(6 + off * 2, 42, 4):
        paint_over(grid, x, 32, 2, 7, dark)
    fill_circle(grid, 10, 40, 3, td)
    fill_circle(grid, 22, 40, 3, td)
    fill_circle(grid, 34, 40, 3, td)
    fill_circle(grid, 40, 40, 2, td)
    # gaps between bogies so it reads as treads, not a brick
    fill_rect(grid, 15, 39, 3, 4, None)
    fill_rect(grid, 27, 39, 3, 4, None)
    polish_pixel(grid, 10, 39, hlit if off else tm)
    polish_pixel(grid, 22, 39, tm if off else hlit)
    polish_pixel(grid, 34, 39, hlit if off else tm)

    # low wide hull
    fill_rect(grid, 6, 14, 36, 18, hull)
    paint_over(grid, 6, 14, 36, 3, hlit)
    set_pixel(grid, 6, 14, None)
    set_pixel(grid, 41, 14, None)
    fill_rect(grid, 8, 28, 32, 4, dark)
    # hazard stripes on the right-front of the hull
    for i in range(4):
        fill_rect(grid, 30 + i * 3, 24, 3, 5, haz if i % 2 == 0 else dark)

    # turret
    fill_circle(grid, 24, 18, 9, tur)
    paint_over(grid, 16, 11, 14, 4, tlit)
    fill_circle(grid, 24, 18, 3, dark)
    fill_circle(grid, 24, 18, 1, muzzle if frame != 2 else gold)

    # long HORIZONTAL barrel pointing right (artillery, not a shoulder stub)
    fill_rect(grid, 32, 15, 20, 6, barrel)
    paint_over(grid, 32, 15, 20, 1, tlit)
    fill_rect(grid, 50, 14, 5, 8, dark)
    mz = (gold, 0xFF8A3D, 0xFFFFFF, gold)[frame]
    fill_rect(grid, 52, 15, 3, 6, mz)
    if frame == 2:
        fill_rect(grid, 54, 16, 2, 4, 0xFFFFFF)
        set_pixel(grid, 51, 17, 0xFFFFFF)

    # asymmetric bits — antenna left, exhaust right
    fill_rect(grid, 12, 6, 2, 9, td)
    set_pixel(grid, 12, 5, muzzle if frame % 2 == 0 else gold)
    fill_circle(grid, 38, 12, 3, 0x2A2015)
    set_pixel(grid, 38, 10, 0xFF8A3D if frame >= 1 else gold)

    # headlights (asymmetric)
    fill_circle(grid, 40, 28, 2, lamp)
    set_pixel(grid, 18, 28, lamp)

    return render_grid(grid, outline_color=TANK_OUTLINE)


def make_boss_router(frame: int = 0) -> Image.Image:
    """56×56 O Roteador — square chassis + corner satellite dishes (the guns)."""
    grid = create_grid(56, 56)
    hull, mid, light = 0x1C1430, 0x2E1F52, 0x4A3278
    cyan, mag, white = 0x37F0FF, 0xFF5FD0, 0xFFFFFF
    cx, cy = 28, 28

    # arms out to corner pods
    pods = ((10, 10), (46, 10), (10, 46), (46, 46))
    for px, py in pods:
        paint_line(grid, cx, cy, px, py, mid, thick=3)
        paint_line(grid, cx, cy, px, py, cyan, thick=1)

    # square-ish chassis (cut corners — not a train, not a tank, not a diamond blob)
    fill_rect(grid, 16, 16, 24, 24, hull)
    fill_rect(grid, 18, 18, 20, 20, mid)
    for x, y in ((16, 16), (39, 16), (16, 39), (39, 39)):
        set_pixel(grid, x, y, None)
        set_pixel(grid, x + (1 if x == 16 else -1), y, None)
        set_pixel(grid, x, y + (1 if y == 16 else -1), None)
    paint_over(grid, 18, 18, 20, 2, light)
    fill_circle(grid, cx, cy, 5, cyan)
    fill_circle(grid, cx, cy, 2, white)

    # portal chevrons — cycle which pad is next (teleport-between-nodes tell)
    chevs = ((28, 19, 3), (37, 28, 0), (28, 37, 1), (19, 28, 2))  # N E S W
    active = frame % 4
    for i, (x, y, d) in enumerate(chevs):
        paint_chevron(grid, x, y, d, white if i == active else (cyan if i == (active + 1) % 4 else light))

    # 4 dish/satellite pods on corners — the actual guns. dishes rotate.
    face = (45 + frame * 25, 135 + frame * 25, 225 + frame * 25, 315 + frame * 25)
    for (px, py), deg, i in zip(pods, face, range(4)):
        body = mid if i != active else light
        paint_dish(grid, px, py, 6, hull, body, white if i == active else cyan, deg)
        fill_rect(grid, px - 1, py - 1, 3, 3, mag if i == active else cyan)

    return render_grid(grid, outline_color=OUTLINE)


def make_boss_emissora(frame: int = 0) -> Image.Image:
    """56×56 A Emissora — broadcast tower + one giant camera-eye (not many lenses)."""
    grid = create_grid(56, 56)
    dark, base, mid = 0x0A1210, 0x141C1A, 0x1E2C28
    green, hi, white = 0x3DFFA0, 0xE0FFE8, 0xFFFFFF
    rec, rec_hi = 0xFF4A5E, 0xFFC2C8
    cx = 28

    # tripod / plinth
    fill_rect(grid, 10, 46, 36, 7, dark)
    fill_rect(grid, 12, 47, 32, 5, base)
    fill_rect(grid, 8, 44, 6, 8, dark)
    fill_rect(grid, 42, 44, 6, 8, dark)
    # summon nubs (sentinel tell)
    nub = green if frame in (1, 2) else mid
    fill_rect(grid, 14, 42, 4, 4, nub)
    fill_rect(grid, 38, 42, 4, 4, nub)
    if frame == 2:
        set_pixel(grid, 15, 43, white)
        set_pixel(grid, 40, 43, white)

    # tower shaft
    fill_rect(grid, 22, 24, 12, 22, base)
    paint_over(grid, 22, 24, 12, 2, mid)
    paint_over(grid, 24, 26, 8, 18, dark)
    paint_over(grid, 27, 26, 2, 18, green if frame % 2 else mid)

    # giant camera-eye (ONE lens — Vigia has many small ones)
    fill_circle(grid, cx, 18, 16, base)
    fill_circle(grid, cx, 18, 13, dark)
    iris_r = (7, 8, 10, 7)[frame]
    pupil_r = (3, 4, 5, 3)[frame]
    fill_circle(grid, cx, 18, iris_r, green)
    fill_circle(grid, cx, 18, pupil_r, dark)
    set_pixel(grid, cx - 4, 14, hi if frame != 2 else white)
    # iris ticks
    for deg in (30, 150, 270):
        radial_tick(grid, cx, 18, deg, iris_r - 1, iris_r + 2, 0x2A8A5C)
    if frame == 2:
        # beam + mark tell: crosshair in the dilated iris
        paint_over(grid, cx - 6, 18, 13, 1, white)
        paint_over(grid, cx, 12, 1, 13, white)
        fill_ring(grid, cx, 48, 6, 4, green)

    # recording light
    fill_circle(grid, 40, 6, 2, rec_hi if frame % 2 else rec)
    set_pixel(grid, 39, 5, rec_hi)

    # side broadcast dish — sweeps each frame
    paint_dish(grid, 46, 20, 7, mid, dark, green, 0 + frame * 35)
    fill_rect(grid, 38, 19, 4, 3, base)

    # top antenna mast
    fill_rect(grid, 27, 1, 2, 5, mid)
    set_pixel(grid, 27, 1, green)
    set_pixel(grid, 28, 1, hi if frame == 1 else green)

    return render_grid(grid, outline_color=OUTLINE)


def make_boss_ghosttrain(frame: int = 0) -> Image.Image:
    """72×40 O Trem Fantasma — long sideways loco+cars, skull-lamp, ghost frames."""
    grid = create_grid(72, 40)
    hull, mid, light = 0x2A241C, 0x3A3830, 0x5A564C
    dark, trim = 0x161410, 0x0E1216
    phantom, white = 0x9FFFE8, 0xFFFFFF
    lamp = (phantom, white, phantom, 0x4A7A70)[frame]

    # rear ragged ghost trail (car 2 dissolving into nothing)
    for y in range(12, 30):
        for x in range(0, 8):
            if (x * 3 + y * 2) % 5 == 0:
                set_pixel(grid, x, y, hull if frame < 2 else 0x3A4848)

    # car 2 (rear)
    fill_rect(grid, 6, 12, 16, 16, hull)
    paint_over(grid, 6, 12, 16, 2, mid)
    fill_rect(grid, 9, 16, 5, 5, trim)
    fill_rect(grid, 10, 17, 3, 3, phantom if frame != 3 else 0x4A7A70)
    fill_rect(grid, 16, 16, 5, 5, trim)
    fill_rect(grid, 17, 17, 3, 3, phantom if frame != 3 else 0x4A7A70)

    # car 1
    fill_rect(grid, 22, 11, 18, 17, mid)
    paint_over(grid, 22, 11, 18, 2, light)
    fill_rect(grid, 25, 15, 5, 6, trim)
    fill_rect(grid, 26, 16, 3, 4, 0x4A7A70 if frame >= 2 else phantom)
    fill_rect(grid, 32, 15, 5, 6, trim)
    fill_rect(grid, 33, 16, 3, 4, 0x4A7A70 if frame >= 2 else phantom)
    # coupler
    fill_rect(grid, 20, 18, 3, 3, dark)
    fill_rect(grid, 39, 18, 3, 3, dark)

    # locomotive
    fill_rect(grid, 40, 10, 20, 18, mid)
    fill_circle(grid, 58, 19, 9, mid)
    paint_over(grid, 40, 10, 20, 2, light)
    # cab window
    fill_rect(grid, 44, 14, 7, 7, trim)
    fill_rect(grid, 45, 15, 5, 5, phantom)
    set_pixel(grid, 46, 16, white)

    # chimney + ragged smoke
    fill_rect(grid, 50, 3, 6, 8, hull)
    paint_over(grid, 50, 3, 6, 2, light)
    for x, y in ((48, 1), (52, 0), (55, 1), (49, 2)):
        if frame != 3:
            set_pixel(grid, x, y, phantom if frame < 2 else light)

    # skull-lamp (the "eye" / charge tell) at the nose
    fill_circle(grid, 64, 19, 5, light)
    fill_circle(grid, 64, 19, 3, lamp)
    set_pixel(grid, 62, 18, dark)
    set_pixel(grid, 65, 18, dark)
    set_pixel(grid, 63, 20, dark)
    if frame == 1:
        set_pixel(grid, 64, 19, white)

    # cowcatcher / charge blade
    fill_rect(grid, 56, 27, 14, 3, trim)
    fill_rect(grid, 62, 30, 5, 3, trim)
    fill_rect(grid, 56, 30, 4, 2, trim)

    # wheels — 4 trucks, click highlight
    for i, x in enumerate((10, 24, 38, 52)):
        fill_rect(grid, x, 28, 8, 6, trim)
        fill_circle(grid, x + 2, 35, 2, light)
        fill_circle(grid, x + 6, 35, 2, light)
        polish_pixel(grid, x + 2 + (frame % 2), 34, phantom)

    # phantom underglow
    paint_over(grid, 8, 27, 50, 1, phantom if frame < 2 else 0x4A7A70)

    if frame >= 2:
        recolor_map(grid, {
            hull: 0x3A4848,
            mid: 0x4A5854,
            light: 0x6A7874,
            phantom: 0xCFFFF0,
            0x4A7A70: 0x8AB0A8,
        })
        # dissolve the whole consist; keep the skull-lamp denser so the face still reads
        omit_pattern(grid, 11 + frame, 3 if frame == 2 else 2)
        omit_pattern(grid, 5, 3, x0=0, y0=10, x1=24, y1=32)  # extra rear fade
        if frame == 3:
            omit_pattern(grid, 2, 3, x0=0, y0=0, x1=40, y1=40)

    return render_grid(grid, outline_color=OUTLINE)

# ---------------------------------------------------------------------------
# Batch 6 — remaining procedural pickups, props, FX
# BootScene silhouettes, then 1px polish so each reads uniquely at a glance.
# Do not redo item_sword/pistol/armor/medkit/keycard, slash, bullet, door_nexus.
# ---------------------------------------------------------------------------
def make_item_ammo() -> Image.Image:
    """Two cartridges side by side. Orange tips, brass cases. 20×20."""
    s = 20
    grid = create_grid(s, s)
    brass = 0xFFCF6B
    tip = 0xFF9D3D
    glint = 0xFFF2CF
    groove = shade(brass, -28, -22, -12)
    head = shade(brass, -12, -10, -8)
    for i, ox in enumerate((5, 11)):
        fill_rect(grid, ox, 3, 4, 2, tip)
        fill_rect(grid, ox, 5, 4, 10, brass)
        set_pixel(grid, ox + (1 if i == 0 else 2), 6, glint)
        paint_over(grid, ox, 14, 4, 1, groove)
        paint_over(grid, ox, 5, 1, 10, shade(brass, -18, -14, -8))
        paint_over(grid, ox + 3, 5, 1, 10, shade(brass, 18, 14, 8))
        set_pixel(grid, ox + 1, 14, glint)
        set_pixel(grid, ox + 2, 14, head)
    return render_grid(grid, outline_color=0x2A1600)


def make_item_pilebunker() -> Image.Image:
    """Thick pile-driver: square hammer, piston, orange face. Heavier than sword."""
    s = 20
    grid = create_grid(s, s)
    metal = 0x5A1015
    metal_light = 0x7A1F2C
    fill_rect(grid, 8, 12, 4, 6, 0x2A2F45)
    paint_over(grid, 8, 12, 4, 1, 0x3A4166)
    fill_rect(grid, 6, 8, 8, 5, metal)
    paint_over(grid, 6, 8, 8, 1, metal_light)
    fill_rect(grid, 7, 3, 6, 6, metal_light)
    fill_rect(grid, 8, 2, 4, 1, 0xFF8A3D)
    set_pixel(grid, 9, 2, 0xFFE9C2)
    # square ears — heavier silhouette vs the thin sword
    fill_rect(grid, 5, 4, 2, 4, metal)
    fill_rect(grid, 13, 4, 2, 4, metal)
    paint_over(grid, 5, 4, 10, 1, metal_light)
    # piston rings + rivets (already-filled cells)
    paint_over(grid, 8, 14, 4, 1, 0x1C2038)
    paint_over(grid, 8, 16, 4, 1, 0x1C2038)
    set_pixel(grid, 7, 10, 0xFFB3C0)
    set_pixel(grid, 12, 10, 0xFFB3C0)
    set_pixel(grid, 10, 5, shade(metal_light, 20, 10, 10))
    return render_grid(grid, outline_color=0x0D0304)


def make_item_smg() -> Image.Image:
    """Compact Neural SMG — long mag DOWN is the tell vs pistol."""
    s = 20
    grid = create_grid(s, s)
    fill_rect(grid, 2, 7, 12, 3, 0x2A3A4A)
    paint_over(grid, 2, 7, 12, 1, 0x4A90D9)
    fill_rect(grid, 13, 8, 5, 2, 0x1C2038)
    set_pixel(grid, 17, 8, 0x9FD0FF)
    fill_rect(grid, 4, 10, 4, 8, 0x0C1420)
    paint_over(grid, 4, 10, 4, 1, 0x1C3A5A)
    # stock stub + front sight + mag windows (mag stays the long downward tell)
    fill_rect(grid, 1, 8, 1, 2, 0x2A3A4A)
    set_pixel(grid, 12, 6, 0x4A90D9)
    paint_over(grid, 5, 12, 2, 1, 0x1C3A5A)
    paint_over(grid, 5, 14, 2, 1, 0x1C3A5A)
    paint_over(grid, 5, 16, 2, 1, 0x1C3A5A)
    set_pixel(grid, 17, 9, 0x9FD0FF)
    return render_grid(grid)


def make_item_shotgun() -> Image.Image:
    """Shock Shotgun — widest gun, double barrel visible."""
    s = 20
    grid = create_grid(s, s)
    fill_rect(grid, 1, 8, 13, 4, 0x4A3A2A)
    paint_over(grid, 1, 8, 13, 1, 0x6B5540)
    fill_rect(grid, 13, 8, 6, 2, 0x1C1410)
    fill_rect(grid, 13, 10, 6, 2, 0x1C1410)
    set_pixel(grid, 18, 8, 0x3A3028)
    set_pixel(grid, 18, 10, 0x3A3028)
    fill_rect(grid, 3, 12, 3, 6, 0x1C2038)
    # seam between twin barrels + pump forend + bead sight
    paint_over(grid, 13, 9, 6, 1, 0x0A0806)
    fill_rect(grid, 7, 12, 6, 2, 0x3A2A1C)
    paint_over(grid, 7, 12, 6, 1, 0x5A4430)
    set_pixel(grid, 12, 7, 0x6B5540)
    set_pixel(grid, 4, 16, 0x0A0C18)
    return render_grid(grid, outline_color=0x0D0304)


def make_item_railgun() -> Image.Image:
    """Longest barrel, energy-core stripe — reads as 'pierces'."""
    s = 20
    grid = create_grid(s, s)
    fill_rect(grid, 0, 8, 18, 4, 0x2A3A4A)
    paint_over(grid, 0, 8, 18, 1, 0x4A90D9)
    paint_over(grid, 2, 9, 14, 2, 0xDFF7FF)
    fill_rect(grid, 3, 12, 4, 6, 0x1C2038)
    fill_rect(grid, 3, 17, 5, 2, 0x0A0C18)
    set_pixel(grid, 17, 9, 0xFFFFFF)
    # heatsink fins + hotter muzzle + capacitor box
    for fx in (4, 8, 12):
        set_pixel(grid, fx, 7, 0x4A90D9)
    set_pixel(grid, 17, 10, 0xFFFFFF)
    paint_over(grid, 16, 8, 2, 4, 0x4A90D9)
    set_pixel(grid, 17, 9, 0xFFFFFF)
    fill_rect(grid, 1, 6, 3, 2, 0x1C2038)
    set_pixel(grid, 2, 6, 0xDFF7FF)
    return render_grid(grid)


def make_item_stim() -> Image.Image:
    """Syringe — green fluid, glass, plunger, needle. Unique silhouette."""
    s = 20
    grid = create_grid(s, s)
    fill_rect(grid, 8, 3, 4, 10, 0xDFE8F0)
    fill_rect(grid, 9, 4, 2, 8, 0x2DFFB0)
    fill_rect(grid, 7, 1, 6, 2, 0x8A94A8)
    fill_rect(grid, 8, 13, 4, 2, 0x8A94A8)
    fill_rect(grid, 9, 15, 2, 4, 0xC7CED6)
    set_pixel(grid, 9, 18, 0xFFFFFF)
    # measurement ticks, bubble, plunger highlight
    paint_over(grid, 8, 5, 1, 1, 0x8A94A8)
    paint_over(grid, 8, 8, 1, 1, 0x8A94A8)
    paint_over(grid, 8, 11, 1, 1, 0x8A94A8)
    set_pixel(grid, 10, 6, 0x9FFFE8)
    set_pixel(grid, 8, 1, 0xC7CED6)
    set_pixel(grid, 10, 18, 0xFFFFFF)
    return render_grid(grid, outline_color=0x0A1520)


def make_item_emp() -> Image.Image:
    """Violet orb + pulse ticks + pin."""
    s = 20
    grid = create_grid(s, s)
    fill_circle(grid, 10, 11, 6, 0x1A1330)
    fill_circle(grid, 10, 11, 4, 0x9F5FFF)
    fill_circle(grid, 10, 11, 2, 0xFFFFFF)
    fill_rect(grid, 9, 3, 2, 4, 0x2A2450)
    set_pixel(grid, 9, 3, 0xD88BFF)
    for deg in (20, 110, 200, 290):
        rad = math.radians(deg)
        bx = round(10 + math.cos(rad) * 8)
        by = round(11 + math.sin(rad) * 8)
        set_pixel(grid, bx, by, 0xD88BFF)
    # pin ring + extra tick length so pulses read as EMP not a marble
    set_pixel(grid, 10, 3, 0xD88BFF)
    set_pixel(grid, 8, 4, 0x2A2450)
    set_pixel(grid, 11, 4, 0x2A2450)
    radial_tick(grid, 10, 11, 20, 7, 9, 0xD88BFF)
    return render_grid(grid, outline_color=0x08050F)


def make_prop_crate() -> Image.Image:
    """Cargo crate 18×18 — battens, gold rivets, wear."""
    grid = create_grid(18, 18)
    body = 0x4A3A2A
    fill_rect(grid, 1, 1, 16, 16, body)
    _tile_wear(
        grid, body,
        spots_dark=((5, 5), (10, 6), (8, 12), (11, 15), (6, 11)),
        spots_light=((6, 14), (9, 5), (12, 11), (7, 16)),
    )
    paint_over(grid, 1, 1, 16, 3, 0x6B5540)
    fill_rect(grid, 1, 1, 3, 16, 0x2F2419)
    fill_rect(grid, 14, 1, 3, 16, 0x2F2419)
    fill_rect(grid, 1, 8, 16, 2, 0x2F2419)
    # gold rivets at batten crossings
    for x, y in ((4, 4), (13, 4), (4, 8), (13, 8), (4, 13), (13, 13)):
        set_pixel(grid, x, y, 0xFFB347)
    set_pixel(grid, 9, 5, 0x2F2419)  # stencil tick
    return render_grid(grid)


def make_prop_barrel() -> Image.Image:
    """Cylinder 14×18 — hoops + orange bung."""
    grid = create_grid(14, 18)
    fill_rect(grid, 2, 1, 10, 16, 0x3A4A4A)
    paint_over(grid, 3, 1, 8, 16, 0x4F6363)
    _tile_wear(
        grid, 0x4F6363,
        spots_dark=((4, 6), (9, 7), (5, 10), (8, 15)),
        spots_light=((6, 5), (7, 14), (4, 9)),
    )
    paint_over(grid, 2, 3, 10, 2, 0x1C2424)
    paint_over(grid, 2, 12, 10, 2, 0x1C2424)
    paint_over(grid, 2, 1, 10, 1, 0x2A3838)  # top rim
    set_pixel(grid, 6, 8, 0xFF8A3D)
    set_pixel(grid, 7, 8, 0xFF8A3D)
    set_pixel(grid, 6, 7, 0xFFB347)
    paint_over(grid, 3, 3, 8, 1, 0x2A3838)
    paint_over(grid, 3, 13, 8, 1, 0x2A3838)
    return render_grid(grid)


def make_prop_pipe() -> Image.Image:
    """Vertical pipe + mid valve wheel. 14×30."""
    grid = create_grid(14, 30)
    fill_rect(grid, 4, 0, 6, 30, 0x2A2F45)
    paint_over(grid, 4, 0, 2, 30, 0x3A4166)
    _tile_wear(
        grid, 0x2A2F45,
        spots_dark=((6, 4), (8, 8), (7, 22), (9, 26)),
        spots_light=((8, 5), (6, 24), (9, 11)),
    )
    fill_rect(grid, 3, 0, 8, 2, 0x2A2F45)   # top flange
    fill_rect(grid, 3, 28, 8, 2, 0x2A2F45)  # bottom flange
    fill_circle(grid, 7, 15, 6, 0x3A4178)
    fill_rect(grid, 1, 14, 12, 2, 0x3A4178)  # horizontal spoke
    fill_rect(grid, 6, 9, 2, 12, 0x3A4178)   # vertical spoke
    fill_circle(grid, 7, 15, 3, 0x1C2038)
    set_pixel(grid, 7, 15, 0xFF8A3D)
    return render_grid(grid)


def make_prop_console() -> Image.Image:
    """Firewall console — dark violet rack, magenta status LEDs. 16×26."""
    grid = create_grid(16, 26)
    fill_rect(grid, 1, 1, 14, 24, 0x140F24)
    fill_rect(grid, 3, 3, 10, 18, 0x241A40)
    for y in range(5, 19, 4):
        paint_over(grid, 4, y, 8, 1, 0x3A2A5A)
        set_pixel(grid, 12, y, 0xD88BFF)
    fill_rect(grid, 4, 21, 8, 2, 0x0D0A18)
    set_pixel(grid, 8, 22, 0xFF3DF0)
    # vent + alternating LED brightness
    paint_over(grid, 5, 2, 6, 1, 0x0D0A18)
    set_pixel(grid, 12, 5, 0xFF3DF0)
    set_pixel(grid, 12, 13, 0xFF5FD0)
    set_pixel(grid, 4, 22, 0xD88BFF)
    set_pixel(grid, 11, 22, 0x3A2A5A)
    return render_grid(grid, outline_color=0x08050F)


def make_prop_kiosk() -> Image.Image:
    """Neon District stall — magenta awning, dark body, cyan pixel. 20×22."""
    grid = create_grid(20, 22)
    fill_rect(grid, 1, 8, 18, 13, 0x1E222C)
    paint_over(grid, 1, 8, 18, 2, 0x2A2F3C)
    fill_rect(grid, 0, 4, 20, 5, 0xFF5FD0)
    paint_over(grid, 0, 4, 20, 1, 0xFFB3EA)
    fill_rect(grid, 3, 11, 5, 6, 0x14161E)
    set_pixel(grid, 5, 13, 0x37F0FF)
    # screen glow + counter + awning scallops
    set_pixel(grid, 6, 14, 0x37F0FF)
    set_pixel(grid, 4, 13, 0x1A3040)
    fill_rect(grid, 10, 16, 7, 2, 0x14161E)
    set_pixel(grid, 12, 16, 0x37F0FF)
    for x in range(1, 19, 3):
        polish_pixel(grid, x, 8, 0xC44AA8)
    return render_grid(grid, outline_color=0x0A0B10)


def make_prop_hole() -> Image.Image:
    """Submundo hole — irregular rubble rim, dark void. NOT a tech portal. 40×40."""
    s = 40
    cx = s / 2
    cy = s / 2
    rock_dark = 0x1A1512
    rock_mid = 0x2A221C
    void = 0x050403
    grid = create_grid(s, s)
    fill_circle(grid, cx, cy, 17, rock_dark)
    fill_circle(grid, cx, cy, 14, rock_mid)
    fill_circle(grid, cx, cy, 11, void)
    for deg in (15, 80, 140, 210, 300):
        rad = math.radians(deg)
        fill_circle(grid, cx + math.cos(rad) * 15.5, cy + math.sin(rad) * 15.5, 3, void)
    for deg in (50, 170, 260):
        rad = math.radians(deg)
        fill_circle(grid, cx + math.cos(rad) * 17, cy + math.sin(rad) * 17, 2, rock_dark)
    for dx, dy in ((-9, -6), (8, -8), (-7, 9), (9, 7)):
        set_pixel(grid, int(cx + dx), int(cy + dy), 0x14100D)
    # extra rubble chunks + nibble the perfect circle
    for dx, dy, w, h in (
        (-14, -4, 3, 2), (12, -10, 3, 2), (-11, 11, 2, 3), (13, 9, 3, 2),
        (0, -18, 2, 2), (-16, 3, 2, 2),
    ):
        fill_rect(grid, int(cx + dx), int(cy + dy), w, h, rock_dark)
    for x, y in ((20, 3), (6, 11), (33, 21), (15, 36), (31, 7), (8, 30)):
        if 0 <= x < s and 0 <= y < s:
            grid["cells"][y][x] = None
    polish_pixel(grid, 16, 12, shade(rock_mid, 14, 10, 8))
    polish_pixel(grid, 24, 26, shade(rock_mid, -10, -8, -6))
    polish_pixel(grid, 18, 28, 0x14100D)
    return render_grid(grid, outline_color=0x080605)


def make_portal(frame: int = 0) -> Image.Image:
    """Nexo teleport — concentric magenta/cyan rings, white core, 4 asymmetric ticks.
    4-frame spin: ticks rotate 90° so the motion reads (ticks are NOT 90°-spaced).
    """
    s = 44
    c = s / 2
    grid = create_grid(s, s)
    fill_circle(grid, c, c, 21, MAGENTA)
    clear_circle(grid, c, c, 17)
    fill_circle(grid, c, c, 15, VISOR)
    clear_circle(grid, c, c, 11)
    fill_circle(grid, c, c, 6, 0xFFFFFF)
    # brighter inner lip on the magenta ring (already-filled)
    for deg in range(0, 360, 12):
        rad = math.radians(deg)
        polish_pixel(
            grid,
            round(c + math.cos(rad) * 18),
            round(c + math.sin(rad) * 18),
            0xFFB3EA,
        )
    # asymmetric ticks: different sizes + uneven angles so 90° step is visible
    ticks = (
        (18, 2, False),
        (105, 1, False),
        (195, 2, True),
        (300, 2, False),
    )
    rot = frame * 90
    for deg, r, extra in ticks:
        a = deg + rot
        rad = math.radians(a)
        bx = round(c + math.cos(rad) * 19)
        by = round(c + math.sin(rad) * 19)
        fill_circle(grid, bx, by, r, 0xFFFFFF)
        if extra:
            radial_tick(grid, c, c, a, 19, 22, 0xFFFFFF)
    return render_grid(grid)


def make_bolt(frame: int = 0) -> Image.Image:
    """Guardião Núcleo homing bolt — pixel orb with baked outline. 12×12."""
    s = 12
    c = s / 2
    grid = create_grid(s, s)
    fill_circle(grid, c, c, 5, CORE_HOT)
    fill_circle(grid, c, c, 3 if frame else 2, CORE_HI)
    if frame:
        set_pixel(grid, 6, 6, 0xFFFFFF)
        set_pixel(grid, 5, 5, 0xFFFFFF)
    else:
        set_pixel(grid, 5, 5, CORE_HI)
    return render_grid(grid)


def make_particle() -> Image.Image:
    """Generic impact spark — white 3px blob + 1px dark outline. 6×6."""
    grid = create_grid(6, 6)
    set_pixel(grid, 2, 1, 0xFFFFFF)
    set_pixel(grid, 1, 2, 0xFFFFFF)
    set_pixel(grid, 2, 2, 0xFFFFFF)
    set_pixel(grid, 3, 2, 0xFFFFFF)
    set_pixel(grid, 2, 3, 0xFFFFFF)
    return render_grid(grid)


def make_target_reticle() -> Image.Image:
    """Tank siege aim — white ring + cross + corner ticks + center dot. 48×48.
    Kept white so in-game tint works.
    """
    s = 48
    c = s / 2
    grid = create_grid(s, s)
    fill_circle(grid, c, c, 20, 0xFFFFFF)
    clear_circle(grid, c, c, 17)
    fill_rect(grid, int(c) - 1, 4, 2, 11, 0xFFFFFF)
    fill_rect(grid, int(c) - 1, s - 15, 2, 11, 0xFFFFFF)
    fill_rect(grid, 4, int(c) - 1, 11, 2, 0xFFFFFF)
    fill_rect(grid, s - 15, int(c) - 1, 11, 2, 0xFFFFFF)
    fill_circle(grid, c, c, 2, 0xFFFFFF)
    # corner L ticks (outside the ring, inset from canvas corners)
    w = 0xFFFFFF
    fill_rect(grid, 6, 6, 5, 2, w)
    fill_rect(grid, 6, 6, 2, 5, w)
    fill_rect(grid, 37, 6, 5, 2, w)
    fill_rect(grid, 40, 6, 2, 5, w)
    fill_rect(grid, 6, 40, 5, 2, w)
    fill_rect(grid, 6, 37, 2, 5, w)
    fill_rect(grid, 37, 40, 5, 2, w)
    fill_rect(grid, 40, 37, 2, 5, w)
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


def write_manifest(batch1: list[dict], batch2: list[dict], batch3: list[dict] | None = None, batch4: list[dict] | None = None, batch5: list[dict] | None = None, batch6: list[dict] | None = None) -> None:
    lines = [
        "# Neo Drift — sprite batches 1, 2, 3, 4, 5 & 6",
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
        "- Named bosses (batch 5): drop-in key = frame 0 (`boss_foundry.png` =",
        "  `boss_foundry_0`). Do **not** replace `boss` / `boss_alt` (Guardião Núcleo).",
        "- Batch 6 drop-ins: `portal.png` = `portal_0`, `bolt.png` = `bolt_0`.",
        "  `sheets/props.png` and `sheets/props_tall.png` are mixed-size catalogs",
        "  (not uniform frameWidth strips). Pack the individual `png/` keys.",
        "- Do **not** redo `item_sword` / `item_pistol` / `item_armor` / `item_medkit`",
        "  / `item_keycard`, `slash`, `bullet`, or `door_nexus`.",
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
        "// named bosses — 4 frames @ 6 fps (drop-in = frame 0)",
        "['boss_foundry','boss_reactor','boss_core','boss_curator','boss_tank','boss_router','boss_emissora','boss_ghosttrain'].forEach(k => {",
        "  this.anims.create({ key: k+'_idle', frames: [0,1,2,3].map(i => ({ key: `${k}_${i}` })), frameRate: 6, repeat: -1 });",
        "});",
        "// portal spin — 4 frames @ 8 fps (44×44). portal.png = portal_0",
        "this.anims.create({ key: 'portal_spin', frames: [0,1,2,3].map(i => ({ key: `portal_${i}` })), frameRate: 8, repeat: -1 });",
        "// bolt pulse — 2 frames @ 8 fps (12×12). bolt.png = bolt_0",
        "this.anims.create({ key: 'bolt_pulse', frames: [0,1].map(i => ({ key: `bolt_${i}` })), frameRate: 8, repeat: -1 });",
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
        "## Batch 5",
        "",
        "Remaining named bosses. **Drop-in key = frame 0** for every one.",
        "`boss` / `boss_alt` (Guardião Núcleo, plated red mech + right shoulder cannon)",
        "are **not** redrawn. 4-frame idle @ 6 fps pulses the attack tell.",
        "Hitboxes stay the BootScene `generateTexture` sizes. Transparent corners.",
        "Integer pixels, 1px baked outline, no anti-alias.",
        "",
        "| name | phase | size | attack | key |",
        "|---|---|---|---|---|",
        "| Fundidor Primordial | 02 Ala de Fundição | 46×40 | Stops, aims, 0.5s thin red telegraph then 0.5s solid red beam. Drum-fist melee. Vulnerable while firing. | `boss_foundry` = `_0` |",
        "| Titã Voltaico | 03 Ala do Reator | 42×44 | Never stops chasing melee; marks player with a ring, lightning strikes ~0.7s later (two bolts in fury). | `boss_reactor` = `_0` |",
        "| Vigia Central | 04 Núcleo de Comando | 46×46 | No own projectile. Chases melee and periodically summons Defense Sentinels. Fury: faster/double summons. | `boss_core` = `_0` |",
        "| Curador Supremo | 05 Torre de Segurança / Distrito Neon | 44×44 | Teleports next to the player, brief tell, melee AoE explosion. Only boss that suddenly changes position. | `boss_curator` = `_0` (fully opaque) |",
        "| tanque do Arsenal Blindado | 06 Arsenal Blindado | 56×44 | Charge / cannon (heavy artillery). | `boss_tank` = `_0` |",
        "| O Roteador | 07 Nexo de Transporte | 56×56 | Anchors and teleports between fixed arena nodes; satellites actually shoot. | `boss_router` = `_0` |",
        "| A Emissora | 08 Central de Vigilância | 56×56 | Combines mark + telegraphed beam with summoning Sentinels. | `boss_emissora` = `_0` |",
        "| O Trem Fantasma | 09 Estação Fantasma / Submundo | 72×40 | Charge locked to axes + periodic ghost phase (intangible, reappears on a new track). | `boss_ghosttrain` = `_0` |",
        "",
        "Outlines (from BootScene `renderGrid`): foundry `#0D0304`, reactor `#050A12`,",
        "core `#08050F`, curator `#05080F`, tank `#0A0D08`, router / emissora /",
        "ghosttrain `#05060C`.",
        "",
        "| file | size | fps | notes |",
        "|---|---|---|---|",
    ]
    for r in (batch5 or []):
        lines.append(f"| `{r['file']}` | {r['size']} | {r['fps']} | {r['notes']} |")
    lines += [
        "",
        "## Batch 6",
        "",
        "Remaining procedural pickups, props, and FX. BootScene silhouettes,",
        "polished 1px so each reads uniquely. Integer pixels, 1px baked outline,",
        "no anti-alias. Hitboxes stay the BootScene `generateTexture` sizes.",
        "Transparent corners on icons / props / FX (pipe/railgun/kiosk may touch",
        "a canvas *edge*, never a corner).",
        "",
        "Drop-in aliases:",
        "",
        "- `portal.png` = `portal_0` (nexo teleport, NOT `door_nexus`)",
        "- `bolt.png` = `bolt_0` (Guardião Núcleo homing bolt)",
        "- `sheets/items_more.png` — 7× 20×20: ammo, pilebunker, smg, shotgun,",
        "  railgun, stim, emp",
        "- `sheets/props.png` — crate + barrel + kiosk (mixed sizes, bottom-aligned)",
        "- `sheets/props_tall.png` — pipe + console (mixed sizes, bottom-aligned)",
        "- hole and portal are also individual `png/` keys (portal has a 4-frame sheet)",
        "",
        "Outlines: ammo `#2A1600`, pilebunker / shotgun `#0D0304`, stim `#0A1520`,",
        "emp / console `#08050F`, kiosk `#0A0B10`, hole `#080605`, smg / railgun /",
        "crate / barrel / pipe / portal / bolt / particle / reticle `#05060C`.",
        "",
        "| file | size | fps | notes |",
        "|---|---|---|---|",
    ]
    for r in (batch6 or []):
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
        "`core #FF5A1F` / `#FFD08A`, `heraldOutline #05020A`, batch-5 foundry rust/ember",
        "`#1A0508`/`#330A10`/`#FF7A2F`/`#FFCF3D`, reactor cyan `#0A1420`/`#162C44`/`#37F0FF`,",
        "vigia violet `#140A1E`/`#2A1440`/`#9F5FFF`, curator teal+prism, tank olive/gold,",
        "router nexus `#1C1430`/`#2E1F52`, emissora `#141C1A`/`#3DFFA0`, ghost `#9FFFE8`,",
        "batch-6 ammo brass `#FFCF6B`/`#FF9D3D`, pilebunker metal `#5A1015`/`#7A1F2C`,",
        "smg/rail `#2A3A4A`/`#4A90D9`, shotgun wood `#4A3A2A`, stim `#2DFFB0`/`#DFE8F0`,",
        "emp/core violet `#1A1330`/`#9F5FFF`, crate rivets `#FFB347`, hole rubble",
        "`#1A1512`/`#2A221C`/`#050403`, portal magenta/cyan `#FF5FD0`/`#37F0FF`,",
        "bolt `#FF5A1F`/`#FFD08A`, plus BootScene biome pairs, NPC coat/helmet colors,",
        "and derived shades (bevel, wear, rivet glint) — no anti-aliased in-betweens.",
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
    b5: list[dict] = []
    b6: list[dict] = []

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

    # ======================================================================
    # BATCH 5 — remaining named bosses (drop-in = frame 0, idle @ 6 fps)
    # ======================================================================
    boss5 = [
        ("boss_foundry", make_boss_foundry, 46, 40, "Fundidor Primordial idle (mouth/beam + chimney sparks)"),
        ("boss_reactor", make_boss_reactor, 42, 44, "Titã Voltaico idle (core flicker + horn spark + 1px bob)"),
        ("boss_core", make_boss_core, 46, 46, "Vigia Central idle (lenses blink in sequence)"),
        ("boss_curator", make_boss_curator, 44, 44, "Curador Supremo idle (glitch/fade teleport tell)"),
        ("boss_tank", make_boss_tank, 56, 44, "tanque idle (tread click + muzzle charge)"),
        ("boss_router", make_boss_router, 56, 56, "O Roteador idle (dishes rotate, node lights cycle)"),
        ("boss_emissora", make_boss_emissora, 56, 56, "A Emissora idle (iris dilates + dish sweep)"),
        ("boss_ghosttrain", make_boss_ghosttrain, 72, 40, "Trem Fantasma idle (2 solid + 2 ghost frames)"),
    ]
    for key, maker, bw, bh, notes in boss5:
        frames = [maker(i) for i in range(4)]
        for i, img in enumerate(frames):
            add(f"{key}_{i}", img, 6, f"{notes} frame {i}", b5)
        add(key, frames[0], 6, f"drop-in alias of {key}_0", b5)
        sheet_and_piskel(
            key, frames, 6, b5,
            f"Neo Drift {notes}",
            f"horizontal strip, 4 frames × {bw}×{bh}",
        )

    # ======================================================================
    # BATCH 6 — remaining pickups, props, FX
    # ======================================================================
    more_items = [
        ("item_ammo", make_item_ammo(), "two cartridges, orange tips / brass"),
        ("item_pilebunker", make_item_pilebunker(), "square pile-driver, heavier than sword"),
        ("item_smg", make_item_smg(), "compact SMG Neural, long mag down"),
        ("item_shotgun", make_item_shotgun(), "Shock Shotgun, widest, double barrel"),
        ("item_railgun", make_item_railgun(), "longest barrel, energy core stripe"),
        ("item_stim", make_item_stim(), "syringe, green fluid"),
        ("item_emp", make_item_emp(), "violet EMP orb + pulse ticks + pin"),
    ]
    more_imgs = []
    for key, img, notes in more_items:
        add(key, img, 1, notes, b6)
        more_imgs.append(img)
    items_more = hstrip(more_imgs)
    items_more.save(SHEET_DIR / "items_more.png", "PNG")
    b6.append({
        "file": "sheets/items_more.png",
        "size": f"{more_imgs[0].size[0] * len(more_imgs)}×{more_imgs[0].size[1]}",
        "fps": 1,
        "notes": "ammo | pilebunker | smg | shotgun | railgun | stim | emp (7× 20×20)",
    })
    preview_8x(items_more).save(PREVIEW_DIR / "items_more_sheet@8x.png", "PNG")

    crate = make_prop_crate()
    barrel = make_prop_barrel()
    pipe = make_prop_pipe()
    console = make_prop_console()
    kiosk = make_prop_kiosk()
    hole = make_prop_hole()
    add("prop_crate", crate, 1, "cargo crate, dark battens, gold rivets, wear", b6)
    add("prop_barrel", barrel, 1, "cylinder barrel, two hoops, orange bung", b6)
    add("prop_pipe", pipe, 1, "vertical pipe + valve wheel at mid", b6)
    add("prop_console", console, 1, "firewall console, dark violet rack, magenta LEDs", b6)
    add("prop_kiosk", kiosk, 1, "Neon District stall, magenta awning, cyan pixel", b6)
    add("prop_hole", hole, 1, "Submundo rubble hole / void (not a tech portal)", b6)

    props_row = hstrip_mixed([crate, barrel, kiosk])
    props_row.save(SHEET_DIR / "props.png", "PNG")
    b6.append({
        "file": "sheets/props.png",
        "size": f"{props_row.size[0]}×{props_row.size[1]}",
        "fps": 1,
        "notes": "crate 18×18 | barrel 14×18 | kiosk 20×22 (mixed, bottom-aligned)",
    })
    preview_8x(props_row).save(PREVIEW_DIR / "props_sheet@8x.png", "PNG")

    tall = hstrip_mixed([pipe, console])
    tall.save(SHEET_DIR / "props_tall.png", "PNG")
    b6.append({
        "file": "sheets/props_tall.png",
        "size": f"{tall.size[0]}×{tall.size[1]}",
        "fps": 1,
        "notes": "pipe 14×30 | console 16×26 (mixed, bottom-aligned)",
    })
    preview_8x(tall).save(PREVIEW_DIR / "props_tall_sheet@8x.png", "PNG")

    crate_barrel_pipe = hstrip_mixed([crate, barrel, pipe])
    preview_8x(crate_barrel_pipe).save(PREVIEW_DIR / "props_crate_barrel_pipe@8x.png", "PNG")

    portal_frames = [make_portal(i) for i in range(4)]
    for i, img in enumerate(portal_frames):
        add(f"portal_{i}", img, 8, f"nexo teleport spin frame {i}", b6)
    add("portal", portal_frames[0], 8, "drop-in alias of portal_0 (NOT door_nexus)", b6)
    sheet_and_piskel(
        "portal", portal_frames, 8, b6,
        "Neo Drift nexo teleport spin",
        "horizontal strip, 4 frames × 44×44 @ 8 fps",
    )

    bolt_frames = [make_bolt(0), make_bolt(1)]
    for i, img in enumerate(bolt_frames):
        add(f"bolt_{i}", img, 8, f"homing bolt pulse frame {i}", b6)
    add("bolt", bolt_frames[0], 8, "drop-in alias of bolt_0", b6)
    sheet_and_piskel(
        "bolt", bolt_frames, 8, b6,
        "Neo Drift Guardião Núcleo homing bolt",
        "horizontal strip, 2 frames × 12×12 @ 8 fps",
    )

    add("particle", make_particle(), 1, "impact spark, white 3px blob + 1px outline", b6)
    add("target_reticle", make_target_reticle(), 1, "tank siege aim, white ring+cross+corners+dot (tint in-game)", b6)

    # 8x previews of the sheets the user will want to look at
    highlight_sheets = [
        "player_down_atk", "player_up_atk", "player_side_atk",
        "player_down_throw", "player_side_throw", "blade_shot", "slash",
        "enemy_tank", "enemy_foundry", "enemy_electric",
        "enemy_jammer", "enemy_shooter", "enemy_portalguardian", "enemy_dweller",
        "tiles_biomes", "tiles_walls", "tiles_doors",
        "floor_logo", "boss", "boss_alt",
        "boss_foundry", "boss_reactor", "boss_core", "boss_curator",
        "boss_tank", "boss_router", "boss_emissora", "boss_ghosttrain",
        "items_more", "props", "props_tall", "portal", "bolt",
    ]
    for name in highlight_sheets:
        pth = SHEET_DIR / f"{name}.png"
        if pth.exists():
            preview_8x(Image.open(pth)).save(PREVIEW_DIR / f"{name}_sheet@8x.png", "PNG")

    write_manifest(b1, b2, b3, b4, b5, b6)

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
        ("npc_herald_body", 16, 24, False),  # feet + outline reach canvas bottom corners
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
        ("boss_foundry", 46, 40, True),
        ("boss_foundry_0", 46, 40, True),
        ("boss_foundry_3", 46, 40, True),
        ("boss_reactor", 42, 44, True),
        ("boss_reactor_0", 42, 44, True),
        ("boss_reactor_2", 42, 44, True),
        ("boss_core", 46, 46, True),
        ("boss_core_0", 46, 46, True),
        ("boss_curator", 44, 44, True),
        ("boss_curator_0", 44, 44, True),
        ("boss_curator_2", 44, 44, True),
        ("boss_tank", 56, 44, True),
        ("boss_tank_0", 56, 44, True),
        ("boss_router", 56, 56, True),
        ("boss_router_0", 56, 56, True),
        ("boss_emissora", 56, 56, True),
        ("boss_emissora_0", 56, 56, True),
        ("boss_ghosttrain", 72, 40, True),
        ("boss_ghosttrain_0", 72, 40, True),
        ("boss_ghosttrain_2", 72, 40, True),
        ("item_ammo", 20, 20, True),
        ("item_pilebunker", 20, 20, True),
        ("item_smg", 20, 20, True),
        ("item_shotgun", 20, 20, True),
        ("item_railgun", 20, 20, True),
        ("item_stim", 20, 20, True),
        ("item_emp", 20, 20, True),
        ("prop_crate", 18, 18, True),
        ("prop_barrel", 14, 18, True),
        ("prop_pipe", 14, 30, True),
        ("prop_console", 16, 26, True),
        ("prop_kiosk", 20, 22, True),
        ("prop_hole", 40, 40, True),
        ("portal", 44, 44, True),
        ("portal_0", 44, 44, True),
        ("portal_3", 44, 44, True),
        ("bolt", 12, 12, True),
        ("bolt_0", 12, 12, True),
        ("bolt_1", 12, 12, True),
        ("particle", 6, 6, True),
        ("target_reticle", 48, 48, True),
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

    for key, oc in (
        ("item_ammo", 0x2A1600), ("item_pilebunker", 0x0D0304),
        ("item_smg", OUTLINE), ("item_shotgun", 0x0D0304),
        ("item_railgun", OUTLINE), ("item_stim", 0x0A1520),
        ("item_emp", 0x08050F), ("prop_crate", OUTLINE),
        ("prop_barrel", OUTLINE), ("prop_pipe", OUTLINE),
        ("prop_console", 0x08050F), ("prop_kiosk", 0x0A0B10),
        ("prop_hole", 0x080605), ("portal", OUTLINE),
        ("bolt", OUTLINE), ("particle", OUTLINE),
        ("target_reticle", OUTLINE),
    ):
        img = Image.open(PNG_DIR / f"{key}.png")
        cols = unique_colors(img)
        if not any(c[:3] == rgb(oc) and c[3] == 255 for c in cols):
            issues.append(f"{key}: missing outline #{oc:06X}")

    # reticle must stay white (game tints it)
    ret = Image.open(PNG_DIR / "target_reticle.png").convert("RGBA")
    ret_cols = {c[:3] for c in unique_colors(ret) if c[3] != 0}
    if rgb(0xFFFFFF) not in ret_cols:
        issues.append("target_reticle: missing pure white")
    non_white = ret_cols - {rgb(0xFFFFFF), rgb(OUTLINE)}
    if non_white:
        issues.append(f"target_reticle: unexpected colors {sorted(non_white)}")

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

    # batch 3 / 5 outlines
    for key, oc in (
        ("boss", BOSS_OUTLINE), ("boss_alt", ALT_OUTLINE),
        ("floor_logo", OUTLINE), ("boss_aura", OUTLINE),
        ("boss_foundry", FOUNDRY_OUTLINE), ("boss_reactor", REACTOR_OUTLINE),
        ("boss_core", VIGIA_OUTLINE), ("boss_curator", CURATOR_OUTLINE),
        ("boss_tank", TANK_OUTLINE), ("boss_router", OUTLINE),
        ("boss_emissora", OUTLINE), ("boss_ghosttrain", OUTLINE),
    ):
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
        "boss_foundry", "boss_reactor", "boss_core", "boss_curator",
        "boss_tank", "boss_router", "boss_emissora", "boss_ghosttrain",
        "item_ammo", "item_pilebunker", "item_smg", "item_shotgun",
        "item_railgun", "item_stim", "item_emp",
        "prop_crate", "prop_barrel", "prop_pipe", "prop_console",
        "prop_kiosk", "prop_hole", "portal", "bolt", "particle", "target_reticle",
    ):
        img = Image.open(PNG_DIR / f"{key}.png")
        cols = [c for c in unique_colors(img) if c[3] != 0]
        print(f"  {key} {img.size} opaque-colors={len(cols)}")


if __name__ == "__main__":
    main()
