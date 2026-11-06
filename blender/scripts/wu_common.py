"""wu_common.py - shared Blender pipeline helpers for Wound Up hero assets.

Run only inside Blender (bpy):
    blender --background --factory-startup --python blender/scripts/gen_<asset>.py -- <args>

Contents
    * palette + sRGB/linear helpers
    * numpy texture synthesis (periodic value noise, fbm, Worley dimples, scratches,
      height->normal, aged-brass / walnut / teal-velvet material maps)
    * plain-PNG writer (zlib level 9, adaptive row filters) + JPEG save helper
    * glTF-friendly PBR material builder (baseColor + ORM + normal, optional sheen)
    * Cycles AO / cavity / edge bake helper
    * plain GLB export (no Draco, no meshopt, no KTX2) + GLB inspector
    * topology / UV QA helpers
    * Cycles studio preview renderer

Conventions (see blender/README.md): metres, scale 1, all transforms applied, glTF Y-up on export.
"""
from __future__ import annotations

import json
import math
import os
import struct
import sys
import tempfile
import time
import zlib
from pathlib import Path

import numpy as np

import bmesh
import bpy
from mathutils import Matrix, Vector

# --------------------------------------------------------------------------------------
# paths
# --------------------------------------------------------------------------------------
REPO_ROOT = Path(__file__).resolve().parents[2]
BLENDER_DIR = REPO_ROOT / "blender"
SOURCE_DIR = BLENDER_DIR / "source"
PREVIEW_DIR = BLENDER_DIR / "previews"
EXPORT_DIR = BLENDER_DIR / "exports"
MODEL_DIR = REPO_ROOT / "public" / "assets" / "models"


def script_args() -> list[str]:
    """Arguments after the first '--' on the Blender command line."""
    argv = sys.argv
    return argv[argv.index("--") + 1:] if "--" in argv else []


def log(*a):
    print("[wu]", *a, flush=True)


# --------------------------------------------------------------------------------------
# palette / colour
# --------------------------------------------------------------------------------------
PALETTE_HEX = {
    "brass": "#C9A227",   # aged brass
    "walnut": "#5B3A24",  # walnut
    "cream": "#F2E6CF",   # cream
    "teal": "#1F5C5C",    # deep teal
    "lamp": "#FFC66D",    # warm lamp glow
}


def hex_to_srgb(h: str) -> np.ndarray:
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)], dtype=np.float64)


def srgb_to_linear(c):
    c = np.asarray(c, dtype=np.float64)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(c):
    c = np.clip(np.asarray(c, dtype=np.float64), 0.0, 1.0)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1.0 / 2.4) - 0.055)


def hex_to_linear(h: str) -> np.ndarray:
    return srgb_to_linear(hex_to_srgb(h))


# Look parameters shared by every asset so brass / walnut / velvet match across files.
BRASS = dict(
    base="#AE8233",       # aged brass: palette #C9A227 pushed warmer/darker (reads as metal, not plastic)
    worn="#DFC368",       # polished-by-handling edges
    patina="#3A2610",     # dark olive-brown tarnish in crevices (not green)
    copper="#8A5A2E",     # slightly redder alloy patches
    metallic=0.90, metallic_patina=0.58, metallic_edge=0.95,
    rough=0.40, rough_edge=0.27, rough_patina=0.62,
)
WALNUT = dict(light="#5E3F28", base="#4B2F1D", dark="#2D1A0F", line="#1F1108", rough=0.58)
VELVET = dict(base="#194E4E", dark="#103536", light="#215E5D", sheen_tint=(0.022, 0.060, 0.060), rough=0.94)


# --------------------------------------------------------------------------------------
# numpy noise / texture synthesis
# --------------------------------------------------------------------------------------
_LAT_CACHE: dict = {}


def _lattice(seed: int, nx: int, ny: int) -> np.ndarray:
    key = (seed, nx, ny)
    if key not in _LAT_CACHE:
        _LAT_CACHE[key] = np.random.default_rng(seed).random((nx, ny), dtype=np.float32)
        if len(_LAT_CACHE) > 64:
            _LAT_CACHE.pop(next(iter(_LAT_CACHE)))
    return _LAT_CACHE[key]


def noise2(px, py, seed=0, wrap=(0, 0)):
    """Value noise (quintic). px,py: lattice-space coords. wrap=(wx,wy) integer periods (0 = aperiodic)."""
    wx, wy = wrap
    nx = int(wx) if wx else 521
    ny = int(wy) if wy else 523
    lat = _lattice(seed, nx, ny)
    fx0 = np.floor(px)
    fy0 = np.floor(py)
    fx = (px - fx0).astype(np.float32)
    fy = (py - fy0).astype(np.float32)
    ix = fx0.astype(np.int64)
    iy = fy0.astype(np.int64)
    x0, x1 = ix % nx, (ix + 1) % nx
    y0, y1 = iy % ny, (iy + 1) % ny
    u = fx * fx * fx * (fx * (fx * 6 - 15) + 10)
    v = fy * fy * fy * (fy * (fy * 6 - 15) + 10)
    a, b, c, d = lat[x0, y0], lat[x1, y0], lat[x0, y1], lat[x1, y1]
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v


def fbm2(px, py, octaves=4, seed=0, wrap=(0, 0), gain=0.5):
    tot = 0.0
    amp = 1.0
    norm = 0.0
    for o in range(octaves):
        f = 2 ** o
        w = (wrap[0] * f if wrap[0] else 0, wrap[1] * f if wrap[1] else 0)
        tot = tot + amp * noise2(px * f, py * f, seed + 131 * o, w)
        norm += amp
        amp *= gain
    return (tot / norm).astype(np.float32)


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def grid(n_x: int, n_y: int | None = None):
    """Pixel-centre normalised coords, shape (n_y, n_x): X along columns, Y along rows (row 0 = v 0 = bottom)."""
    n_y = n_y or n_x
    xs = (np.arange(n_x, dtype=np.float32) + 0.5) / n_x
    ys = (np.arange(n_y, dtype=np.float32) + 0.5) / n_y
    return np.meshgrid(xs, ys)


def worley_dimples(n: int, cells: int, seed: int):
    """Tileable Worley F1 distance (cell units) and per-cell depth factor; for hammered/peened relief."""
    rng = np.random.default_rng(seed)
    pts = rng.random((cells, cells, 2), dtype=np.float32)
    depth = rng.random((cells, cells), dtype=np.float32)
    g = (np.arange(n, dtype=np.float32) + 0.5) / n * cells
    X, Y = np.meshgrid(g, g)
    ix = np.floor(X).astype(np.int64)
    iy = np.floor(Y).astype(np.int64)
    best = np.full((n, n), 1e9, np.float32)
    bd = np.zeros((n, n), np.float32)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            cx = (ix + dx) % cells
            cy = (iy + dy) % cells
            qx = ix + dx + pts[cy, cx, 0]
            qy = iy + dy + pts[cy, cx, 1]
            d2 = (X - qx) ** 2 + (Y - qy) ** 2
            m = d2 < best
            best = np.where(m, d2, best)
            bd = np.where(m, depth[cy, cx], bd)
    return np.sqrt(best), bd


def blur_periodic(a, passes=1):
    k = (1, 4, 6, 4, 1)
    for _ in range(passes):
        for ax in (0, 1):
            a = sum(w * np.roll(a, s, axis=ax) for w, s in zip(k, (-2, -1, 0, 1, 2))) / 16.0
    return a


def scratch_map(n: int, count: int, seed: int, min_len=30, max_len=220, blur=1):
    """Thin random scratches (tileable splat). Returns 0..1 float32."""
    rng = np.random.default_rng(seed)
    x0 = rng.random(count) * n
    y0 = rng.random(count) * n
    ang = rng.random(count) * math.pi
    ln = rng.uniform(min_len, max_len, count)
    amp = rng.uniform(0.35, 1.0, count)
    bend = rng.normal(0, 0.35, count)
    ns = int(max_len * 2)
    t = np.linspace(-0.5, 0.5, ns)[None, :]
    a = ang[:, None] + bend[:, None] * t
    xs = x0[:, None] + np.cos(a) * ln[:, None] * t
    ys = y0[:, None] + np.sin(a) * ln[:, None] * t
    valid = (np.abs(t) * ln[:, None]) <= (ln[:, None] * 0.5)
    w = np.broadcast_to(amp[:, None], xs.shape) * valid
    xs, ys, w = xs.ravel(), ys.ravel(), w.ravel()
    fx = xs - np.floor(xs)
    fy = ys - np.floor(ys)
    ix = np.floor(xs).astype(np.int64)
    iy = np.floor(ys).astype(np.int64)
    buf = np.zeros(n * n, np.float64)
    for ox, oy, ww in ((0, 0, (1 - fx) * (1 - fy)), (1, 0, fx * (1 - fy)), (0, 1, (1 - fx) * fy), (1, 1, fx * fy)):
        idx = ((iy + oy) % n) * n + ((ix + ox) % n)
        buf += np.bincount(idx, weights=w * ww * 0.5, minlength=n * n)
    out = np.clip(buf.reshape(n, n), 0, 1).astype(np.float32)
    return blur_periodic(out, blur) if blur else out


def _grad(h, wrap=True):
    if wrap:
        return (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5, (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5
    dy, dx = np.gradient(h)
    return dx, dy


def height_to_normal(h, rms_slope=0.08, wrap=True):
    """Tangent-space OpenGL (+Y up) normal map from a height field (row 0 = v 0); RMS slope normalised."""
    return combine_normals([(h, "rms", rms_slope)], wrap)


def combine_normals(parts, wrap=True):
    """parts: [(height, mode, target)] mode 'rms' (RMS slope = target) or 'p99' (99.5th percentile slope = target)."""
    gx = gy = 0.0
    for h, mode, target in parts:
        dx, dy = _grad(h, wrap)
        if mode == "rms":
            sc = target / (math.sqrt(float(np.mean(dx * dx + dy * dy))) + 1e-9)
        else:
            sc = target / (float(np.percentile(np.hypot(dx, dy), 99.5)) + 1e-9)
        gx = gx + dx * sc
        gy = gy + dy * sc
    nx, ny, nz = -gx, -gy, np.ones_like(gx)
    inv = 1.0 / np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.stack([nx * inv * 0.5 + 0.5, ny * inv * 0.5 + 0.5, nz * inv * 0.5 + 0.5], axis=-1).astype(np.float32)


def _mix(a, b, t):
    t = t[..., None]
    return a * (1 - t) + b * t


def brass_maps(n: int, ao=None, cavity=None, edge=None, seed=11, tile=False, dimple_cells=None,
               scratch_count=None, peen_slope=0.040, scratch_slope=0.10):
    """Aged-brass texture set. Inputs optional (n,n) maps in 0..1:
        ao      ambient occlusion (goes ONLY into ORM.R)
        cavity  1 in tight crevices (drives patina / roughness)
        edge    1 on convex worn edges (drives polish / lower roughness)
    Returns dict(base=(n,n,3) sRGB-encoded 0..1, orm=(n,n,3), normal=(n,n,3))."""
    z = np.zeros((n, n), np.float32)
    ao = np.ones((n, n), np.float32) if ao is None else ao.astype(np.float32)
    cavity = z if cavity is None else cavity.astype(np.float32)
    edge = z if edge is None else edge.astype(np.float32)
    X, Y = grid(n)
    W = (8, 8) if tile else (0, 0)
    # hammered micro variation + broad tonal blotches
    blot = fbm2(X * 8, Y * 8, 5, seed, W)
    blot2 = fbm2(X * 24, Y * 24, 3, seed + 7, (24, 24) if tile else (0, 0))
    fine = fbm2(X * 96, Y * 96, 3, seed + 3, (96, 96) if tile else (0, 0))
    cells = dimple_cells or max(48, int(n / 3.6))
    d, bd = worley_dimples(n, cells, seed + 5)
    bowl = (1 - np.clip(d / 0.62, 0, 1) ** 2) ** 1.5 * (0.45 + 0.55 * bd)
    # crevice patina: cavity driven, broken up by blotches
    patina = np.clip(cavity * 1.35 + (blot - 0.5) * 1.0 - 0.10, 0, 1)
    patina = np.clip(patina + smoothstep(0.60, 0.88, blot2) * 0.50, 0, 1)
    patina = smoothstep(0.05, 0.95, patina)
    scr = scratch_map(n, scratch_count or max(60, n // 5), seed + 9, min_len=n * 0.03, max_len=n * 0.20, blur=0)
    base = hex_to_linear(BRASS["base"]).astype(np.float32)
    worn = hex_to_linear(BRASS["worn"]).astype(np.float32)
    pat = hex_to_linear(BRASS["patina"]).astype(np.float32)
    cop = hex_to_linear(BRASS["copper"]).astype(np.float32)
    col = np.broadcast_to(base, (n, n, 3)).copy()
    col = _mix(col, np.broadcast_to(cop, col.shape), smoothstep(0.52, 0.80, fbm2(X * 5 + 3.7, Y * 5 + 1.3, 3, seed + 21, (5, 5) if tile else (0, 0))) * 0.55)
    tone = 1.0 + (blot - 0.5) * 0.34 + (fine - 0.5) * 0.06 - bowl * 0.04
    col = col * tone[..., None]
    col = _mix(col, np.broadcast_to(pat, col.shape), patina * 0.78)
    col = _mix(col, np.broadcast_to(worn, col.shape), np.clip(edge * 0.55 + scr * 0.28, 0, 1))
    rough = (BRASS["rough"] + (fine - 0.5) * 0.10 + (blot - 0.5) * 0.16 - bowl * 0.03
             + (BRASS["rough_patina"] - BRASS["rough"]) * patina
             + (BRASS["rough_edge"] - BRASS["rough"]) * np.clip(edge * 0.8 + scr * 0.6, 0, 1))
    metal = (BRASS["metallic"] + (BRASS["metallic_patina"] - BRASS["metallic"]) * patina
             + (BRASS["metallic_edge"] - BRASS["metallic"]) * edge)
    rough = np.clip(rough, 0.2, 0.9)
    metal = np.clip(metal, 0.4, 1.0)
    peen = bowl * 0.8 + (fine - 0.5) * 0.35 + (blot2 - 0.5) * 0.25
    normal = combine_normals([(peen, "rms", peen_slope), (-blur_periodic(scr, 1), "p99", scratch_slope)], wrap=True)
    orm = np.stack([np.clip(ao, 0, 1), rough, metal], axis=-1).astype(np.float32)
    return dict(base=linear_to_srgb(col).astype(np.float32), orm=orm, normal=normal)


def velvet_maps(n: int, ao=None, seed=31):
    """Deep-teal velvet: soft nap patches, sub-millimetre fibre noise, near-matte roughness."""
    ao = np.ones((n, n), np.float32) if ao is None else ao.astype(np.float32)
    X, Y = grid(n)
    nap = fbm2(X * 4, Y * 4, 4, seed)                     # crushed / brushed pile patches
    nap2 = fbm2(X * 11 + 5.1, Y * 7 + 2.3, 3, seed + 2)   # secondary mottling
    fib = noise2(X * n * 0.9, Y * n * 0.9, seed + 4)      # ~1 px fibre grain
    fib2 = noise2(X * n * 0.45 + 7, Y * n * 0.45 + 3, seed + 8)
    base = hex_to_linear(VELVET["base"]).astype(np.float32)
    dark = hex_to_linear(VELVET["dark"]).astype(np.float32)
    light = hex_to_linear(VELVET["light"]).astype(np.float32)
    t = np.clip(0.5 + (nap - 0.5) * 1.1 + (nap2 - 0.5) * 0.45, 0, 1)
    col = _mix(np.broadcast_to(dark, (n, n, 3)).copy(), np.broadcast_to(light, (n, n, 3)).copy(), t)
    col = _mix(col, np.broadcast_to(base, col.shape), np.full((n, n), 0.45, np.float32))
    col *= (0.96 + (fib - 0.5) * 0.12 + (fib2 - 0.5) * 0.06)[..., None]
    rough = np.clip(VELVET["rough"] + (fib - 0.5) * 0.04 - (nap - 0.5) * 0.04, 0.78, 1.0)
    height = fib * 0.7 + fib2 * 0.5 + (nap - 0.5) * 0.15
    normal = height_to_normal(height, 0.045, wrap=True)
    orm = np.stack([np.clip(ao, 0, 1), rough, np.zeros((n, n), np.float32)], axis=-1)
    return dict(base=linear_to_srgb(col).astype(np.float32), orm=orm.astype(np.float32), normal=normal)


def walnut_maps(T, S, period, ao=None, seed=17, normal_slope=0.05):
    """Walnut from (T,S) metre coordinates per texel. T runs ALONG the grain (circumference, periodic with
    `period` metres), S runs ACROSS the grain. Returns dict(base, orm, normal)."""
    n_y, n_x = T.shape
    ao = np.ones(T.shape, np.float32) if ao is None else ao.astype(np.float32)
    tc = T / period  # 0..1 around the circumference (wraps)

    def cells(f):
        return max(1, int(round(period * f)))

    c_low, c_mid, c_hi = cells(4.0), cells(12.0), cells(220.0)
    warp = fbm2(tc * c_low, S * 18.0, 4, seed, (c_low, 0)) - 0.5
    warp2 = fbm2(tc * c_mid, S * 90.0, 3, seed + 1, (c_mid, 0)) - 0.5
    ph = S / 0.0042 + 3.2 * warp + 1.1 * warp2
    ring = 0.5 + 0.5 * np.sin(2 * math.pi * ph)
    line = np.clip((1.0 - ring) ** 2.4, 0, 1)                      # thin dark grain lines
    tone = fbm2(tc * cells(5.0), S * 14.0, 4, seed + 2, (cells(5.0), 0))
    tone2 = fbm2(tc * cells(30.0), S * 220.0, 3, seed + 3, (cells(30.0), 0))
    pores = smoothstep(0.70, 0.88, fbm2(tc * c_hi, S * 1500.0, 2, seed + 4, (c_hi, 0)))
    fine = fbm2(tc * cells(90.0), S * 700.0, 2, seed + 5, (cells(90.0), 0))
    light = hex_to_linear(WALNUT["light"]).astype(np.float32)
    base = hex_to_linear(WALNUT["base"]).astype(np.float32)
    dark = hex_to_linear(WALNUT["dark"]).astype(np.float32)
    lin = hex_to_linear(WALNUT["line"]).astype(np.float32)
    t = np.clip((tone - 0.5) * 1.4 + (tone2 - 0.5) * 0.5 + 0.5, 0, 1)
    col = _mix(np.broadcast_to(dark, T.shape + (3,)).copy(), np.broadcast_to(light, T.shape + (3,)).copy(), t)
    col = _mix(col, np.broadcast_to(base, col.shape), np.full(T.shape, 0.35, np.float32))
    col = _mix(col, np.broadcast_to(lin, col.shape), np.clip(line * 0.55, 0, 1))
    col = _mix(col, np.broadcast_to(lin, col.shape), pores * 0.45)
    col *= (0.96 + (fine - 0.5) * 0.10)[..., None]
    rough = np.clip(WALNUT["rough"] + line * 0.05 + pores * 0.06 + (fine - 0.5) * 0.05 - (tone - 0.5) * 0.04, 0.4, 0.85)
    height = -pores * 0.9 - line * 0.35 + (fine - 0.5) * 0.12
    normal = height_to_normal(height, normal_slope, wrap=False)
    orm = np.stack([np.clip(ao, 0, 1), rough, np.zeros(T.shape, np.float32)], axis=-1)
    return dict(base=linear_to_srgb(col).astype(np.float32), orm=orm.astype(np.float32), normal=normal)


# --------------------------------------------------------------------------------------
# image files (plain PNG / JPEG), Blender image datablocks
# --------------------------------------------------------------------------------------
def _png_chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def write_png(path, rgb: np.ndarray):
    """Write (H,W,3) float 0..1 (row 0 = bottom, i.e. image space) as 8-bit RGB PNG. Row 0 of the file is the TOP
    row, so the array is flipped. zlib level 9 with per-row adaptive filtering. No gAMA/sRGB/iCCP chunks."""
    a = np.clip(np.rint(np.asarray(rgb) * 255.0), 0, 255).astype(np.uint8)[::-1]
    h, w, c = a.shape
    i16 = a.astype(np.int16)
    left = np.zeros_like(i16)
    left[:, 1:] = i16[:, :-1]
    up = np.zeros_like(i16)
    up[1:] = i16[:-1]
    ul = np.zeros_like(i16)
    ul[1:, 1:] = i16[:-1, :-1]
    p = left + up - ul
    pa, pb, pc = np.abs(p - left), np.abs(p - up), np.abs(p - ul)
    paeth = np.where((pa <= pb) & (pa <= pc), left, np.where(pb <= pc, up, ul))
    filt = [i16, (i16 - left) & 255, (i16 - up) & 255, (i16 - ((left + up) >> 1)) & 255, (i16 - paeth) & 255]
    cost = [np.abs(((f + 128) & 255) - 128).sum(axis=(1, 2)) for f in filt]
    choice = np.argmin(np.stack(cost, 0), axis=0)
    out = np.empty((h, 1 + w * c), np.uint8)
    out[:, 0] = choice
    stack = np.stack(filt, 0).astype(np.uint8)
    out[:, 1:] = stack[choice, np.arange(h)].reshape(h, w * c)
    raw = zlib.compress(out.tobytes(), 9)
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    data = b"\x89PNG\r\n\x1a\n" + _png_chunk(b"IHDR", ihdr) + _png_chunk(b"IDAT", raw) + _png_chunk(b"IEND", b"")
    Path(path).write_bytes(data)


def write_jpeg(path, rgb: np.ndarray, quality=92):
    """JPEG via Blender (sRGB-encoded 0..1 input, row 0 = bottom)."""
    h, w, _ = rgb.shape
    img = bpy.data.images.new("_tmp_jpg", w, h, alpha=False, float_buffer=False)
    px = np.ones((h, w, 4), np.float32)
    px[..., :3] = np.clip(rgb, 0, 1)
    img.pixels.foreach_set(px.ravel())
    img.file_format = "JPEG"
    img.filepath_raw = str(path)
    img.save(quality=quality)
    bpy.data.images.remove(img)


def load_packed_image(path, name: str, srgb: bool):
    """Load a file as a FILE image datablock and pack its bytes (the exporter then embeds them untouched)."""
    img = bpy.data.images.load(str(path), check_existing=False)
    img.name = name
    img.colorspace_settings.name = "sRGB" if srgb else "Non-Color"
    img.pack()
    return img


def new_float_image(name: str, size: int, data_linear=True):
    img = bpy.data.images.new(name, size, size, alpha=False, float_buffer=True, is_data=data_linear)
    return img


def image_to_array(img) -> np.ndarray:
    w, h = img.size
    buf = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(buf)
    return buf.reshape(h, w, 4)


def resize_map(a: np.ndarray, size: int) -> np.ndarray:
    """Box/linear resize of a 2D map to size x size (supports up- and down-scale by integer-ish factors)."""
    h, w = a.shape[:2]
    if h == size and w == size:
        return a
    if h > size and h % size == 0:
        f = h // size
        return a.reshape(size, f, size, f, *a.shape[2:]).mean(axis=(1, 3))
    ys = (np.arange(size) + 0.5) / size * h - 0.5
    xs = (np.arange(size) + 0.5) / size * w - 0.5
    y0 = np.clip(np.floor(ys).astype(int), 0, h - 1)
    x0 = np.clip(np.floor(xs).astype(int), 0, w - 1)
    y1, x1 = np.clip(y0 + 1, 0, h - 1), np.clip(x0 + 1, 0, w - 1)
    fy = (ys - np.floor(ys))[:, None]
    fx = (xs - np.floor(xs))[None, :]
    if a.ndim == 3:
        fy, fx = fy[..., None], fx[..., None]
    top = a[y0][:, x0] * (1 - fx) + a[y0][:, x1] * fx
    bot = a[y1][:, x0] * (1 - fx) + a[y1][:, x1] * fx
    return top * (1 - fy) + bot * fy


# --------------------------------------------------------------------------------------
# materials
# --------------------------------------------------------------------------------------
def _gltf_group():
    name = "glTF Material Output"
    ng = bpy.data.node_groups.get(name)
    if ng is None:
        ng = bpy.data.node_groups.new(name, "ShaderNodeTree")
        ng.interface.new_socket("Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    return ng


def build_pbr_material(name: str, base_img, orm_img, normal_img, *, extension="EXTEND", sheen_tint=None,
                       sheen_roughness=0.4, normal_strength=1.0, uv_map="UVMap", rough_fallback=0.5):
    """Principled material wired the way the glTF exporter expects:
       baseColor (sRGB image), ORM image -> Separate Color R/G/B -> glTF 'Occlusion' / Roughness / Metallic,
       tangent-space normal map. Optional Principled Sheen (exports as KHR_materials_sheen)."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.use_backface_culling = True          # closed solids: export doubleSided = false (halves back-face fill on Quest)
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    out.location = (700, 0)
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (400, 0)
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    uv = nt.nodes.new("ShaderNodeUVMap")
    uv.uv_map = uv_map
    uv.location = (-900, 0)

    def tex(image, y, colorspace):
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = image
        t.interpolation = "Linear"
        t.extension = extension
        t.location = (-600, y)
        image.colorspace_settings.name = colorspace
        nt.links.new(uv.outputs["UV"], t.inputs["Vector"])
        return t

    if base_img is not None:
        t = tex(base_img, 300, "sRGB")
        nt.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
    if orm_img is not None:
        t = tex(orm_img, 0, "Non-Color")
        sep = nt.nodes.new("ShaderNodeSeparateColor")
        sep.mode = "RGB"
        sep.location = (-250, 0)
        nt.links.new(t.outputs["Color"], sep.inputs["Color"])
        nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
        nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
        grp = nt.nodes.new("ShaderNodeGroup")
        grp.node_tree = _gltf_group()
        grp.location = (100, -400)
        nt.links.new(sep.outputs["Red"], grp.inputs["Occlusion"])
    else:
        bsdf.inputs["Roughness"].default_value = rough_fallback
    if normal_img is not None:
        t = tex(normal_img, -300, "Non-Color")
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.space = "TANGENT"
        nm.uv_map = uv_map
        nm.inputs["Strength"].default_value = normal_strength
        nm.location = (100, -250)
        nt.links.new(t.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    if sheen_tint is not None:
        bsdf.inputs["Sheen Weight"].default_value = 1.0
        bsdf.inputs["Sheen Roughness"].default_value = sheen_roughness
        bsdf.inputs["Sheen Tint"].default_value = (*sheen_tint, 1.0)
    return mat


def make_textures(asset: str, tag: str, maps: dict, workdir: Path, jpeg_quality=92):
    """Write maps{base,orm,normal} to disk (base -> JPEG, orm/normal -> PNG), load packed. Returns images dict."""
    workdir = Path(workdir)
    workdir.mkdir(parents=True, exist_ok=True)
    out = {}
    write_jpeg(workdir / f"{asset}_{tag}_baseColor.jpg", maps["base"], jpeg_quality)
    out["base"] = load_packed_image(workdir / f"{asset}_{tag}_baseColor.jpg", f"{asset}_{tag}_baseColor", True)
    if maps.get("orm") is not None:
        write_png(workdir / f"{asset}_{tag}_orm.png", maps["orm"])
        out["orm"] = load_packed_image(workdir / f"{asset}_{tag}_orm.png", f"{asset}_{tag}_orm", False)
    if maps.get("normal") is not None:
        write_png(workdir / f"{asset}_{tag}_normal.png", maps["normal"])
        out["normal"] = load_packed_image(workdir / f"{asset}_{tag}_normal.png", f"{asset}_{tag}_normal", False)
    return out


# --------------------------------------------------------------------------------------
# scene helpers, devices
# --------------------------------------------------------------------------------------
def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    try:
        bpy.context.preferences.filepaths.save_version = 0      # no .blend1 backups in the repo
    except Exception:
        pass
    return bpy.context.scene


def setup_cycles(scene, samples=96, denoise=True, gpu=True):
    scene.render.engine = "CYCLES"
    cy = scene.cycles
    cy.samples = samples
    cy.use_adaptive_sampling = False
    cy.use_denoising = denoise
    if denoise:
        try:
            cy.denoiser = "OPENIMAGEDENOISE"
        except Exception:
            pass
    cy.device = "CPU"
    if gpu:
        try:
            prefs = bpy.context.preferences.addons["cycles"].preferences
            prefs.compute_device_type = "OPTIX"
            prefs.refresh_devices()
            used = False
            for d in prefs.devices:
                d.use = d.type == "OPTIX"
                used |= d.use
            if used:
                cy.device = "GPU"
        except Exception as e:  # pragma: no cover
            log("GPU setup failed, using CPU:", e)
    cy.max_bounces = 10
    cy.diffuse_bounces = 4
    cy.glossy_bounces = 6
    cy.transmission_bounces = 4
    cy.caustics_reflective = False
    cy.caustics_refractive = False
    return scene


def link_object(name: str, mesh, scene=None):
    scene = scene or bpy.context.scene
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    return obj


def select_only(obj):
    bpy.context.view_layer.update()
    for o in list(bpy.context.view_layer.objects):
        if o is not None:
            o.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


# --------------------------------------------------------------------------------------
# AO / cavity / edge bake (Cycles, EMIT bake of an Ambient Occlusion node)
# --------------------------------------------------------------------------------------
def bake_maps(obj, size: int, passes: list[dict], margin=8, samples=192, slots: list[int] | None = None):
    """passes: dict(name, distance, inside=False, only_local=False). Distances are in OBJECT units.
    Returns {pass_name: {slot_index: (size,size) float32 array (row 0 = v 0)}}.
    Faces of each material slot are baked into that slot's own image so the UV space may be reused per slot."""
    scene = bpy.context.scene
    setup_cycles(scene, samples=samples, denoise=False)
    scene.cycles.use_adaptive_sampling = False
    me = obj.data
    orig = list(me.materials)
    slots = slots if slots is not None else list(range(len(orig)))
    result: dict = {}
    select_only(obj)
    for p in passes:
        imgs = {}
        temps = []
        scene.cycles.samples = p.get("samples", samples)
        for i in range(len(orig)):
            mat = bpy.data.materials.new(f"_bake_{p['name']}_{i}")
            mat.use_nodes = True
            nt = mat.node_tree
            nt.nodes.clear()
            em = nt.nodes.new("ShaderNodeEmission")
            out = nt.nodes.new("ShaderNodeOutputMaterial")
            if p.get("constant") is not None:
                c = float(p["constant"])
                em.inputs["Color"].default_value = (c, c, c, 1.0)
            else:
                ao = nt.nodes.new("ShaderNodeAmbientOcclusion")
                ao.samples = 16
                ao.inside = bool(p.get("inside", False))
                ao.only_local = bool(p.get("only_local", False))
                ao.inputs["Distance"].default_value = p["distance"]
                nt.links.new(ao.outputs["AO"], em.inputs["Color"])
            nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
            img = bpy.data.images.new(f"_bake_{p['name']}_{i}", size, size, alpha=False, float_buffer=True, is_data=True)
            tx = nt.nodes.new("ShaderNodeTexImage")
            tx.image = img
            nt.nodes.active = tx
            tx.select = True
            temps.append(mat)
            imgs[i] = img
            me.materials[i] = mat
        t0 = time.time()
        bpy.ops.object.bake(type="EMIT", margin=margin, margin_type="EXTEND", use_clear=True, target="IMAGE_TEXTURES")
        log(f"bake '{p['name']}' {size}px dist={p.get('distance', 0):.5g} -> {time.time() - t0:.1f}s")
        result[p["name"]] = {i: image_to_array(imgs[i])[..., 0].copy() for i in slots}
        for i in range(len(orig)):
            me.materials[i] = orig[i]
        for mat in temps:
            bpy.data.materials.remove(mat)
        for img in imgs.values():
            bpy.data.images.remove(img)
    return result


# --------------------------------------------------------------------------------------
# export / inspect
# --------------------------------------------------------------------------------------
def export_glb(objs, path: Path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.view_layer.update()
    for o in list(bpy.context.view_layer.objects):
        if o is not None:
            o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    kw = dict(
        filepath=str(path), export_format="GLB", use_selection=True, export_yup=True, export_apply=True,
        export_normals=True, export_tangents=False, export_texcoords=True, export_materials="EXPORT",
        export_image_format="AUTO", export_jpeg_quality=92, export_image_quality=92,
        export_draco_mesh_compression_enable=False, export_meshopt_compression_enable=False,
        export_cameras=False, export_lights=False, export_animations=False, export_skins=False,
        export_morph=False, export_extras=False, export_attributes=False, export_vertex_color="NONE",
        export_gn_mesh=False, export_use_gltfpack=False, export_unused_images=False,
        export_unused_textures=False, export_keep_originals=False,
    )
    props = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
    kw = {k: v for k, v in kw.items() if k in props}
    bpy.ops.export_scene.gltf(**kw)
    log("exported", path, f"{path.stat().st_size / 1024:.1f} KB")
    return path


def read_glb(path):
    data = Path(path).read_bytes()
    magic, ver, length = struct.unpack("<4sII", data[:12])
    assert magic == b"glTF" and length == len(data), "bad GLB header"
    off = 12
    js = binc = None
    while off < len(data):
        clen, ctype = struct.unpack("<II", data[off:off + 8])
        chunk = data[off + 8: off + 8 + clen]
        if ctype == 0x4E4F534A:
            js = json.loads(chunk.decode("utf8"))
        elif ctype == 0x004E4942:
            binc = chunk
        off += 8 + clen
    return js, binc, len(data)


def _image_size(b: bytes):
    if b[:8] == b"\x89PNG\r\n\x1a\n":
        return struct.unpack(">II", b[16:24])
    if b[:3] == b"\xff\xd8\xff":
        i = 2
        while i < len(b):
            if b[i] != 0xFF:
                i += 1
                continue
            m = b[i + 1]
            if m in (0xC0, 0xC1, 0xC2):
                h, w = struct.unpack(">HH", b[i + 5:i + 9])
                return w, h
            i += 2 + struct.unpack(">H", b[i + 2:i + 4])[0]
    return None


def inspect_glb(path, verbose=True) -> dict:
    js, binc, total = read_glb(path)
    rep = {"bytes": total, "extensionsUsed": js.get("extensionsUsed", []),
           "extensionsRequired": js.get("extensionsRequired", [])}
    bv = js.get("bufferViews", [])
    acc = js.get("accessors", [])
    rep["nodes"] = [(n.get("name"), n.get("translation"), n.get("rotation"), n.get("scale"), n.get("mesh")) for n in js.get("nodes", [])]
    rep["meshes"] = [m.get("name") for m in js.get("meshes", [])]
    verts = tris = 0
    mn = np.full(3, 1e30)
    mx = np.full(3, -1e30)
    geom_bytes = 0
    for m in js.get("meshes", []):
        for pr in m["primitives"]:
            pa = acc[pr["attributes"]["POSITION"]]
            verts += pa["count"]
            mn = np.minimum(mn, pa["min"])
            mx = np.maximum(mx, pa["max"])
            tris += acc[pr["indices"]]["count"] // 3
            for k, a in pr["attributes"].items():
                geom_bytes += bv[acc[a]["bufferView"]]["byteLength"]
            geom_bytes += bv[acc[pr["indices"]]["bufferView"]]["byteLength"]
    rep.update(verts=verts, tris=tris, bbox_min=mn.tolist(), bbox_max=mx.tolist(), geometry_bytes=geom_bytes)
    rep["materials"] = []
    for mt in js.get("materials", []):
        pbr = mt.get("pbrMetallicRoughness", {})
        rep["materials"].append(dict(
            name=mt.get("name"), baseColorFactor=pbr.get("baseColorFactor"),
            baseColorTex=pbr.get("baseColorTexture", {}).get("index"),
            mrTex=pbr.get("metallicRoughnessTexture", {}).get("index"),
            occTex=mt.get("occlusionTexture", {}).get("index"),
            normalTex=mt.get("normalTexture", {}).get("index"),
            roughnessFactor=pbr.get("roughnessFactor"), metallicFactor=pbr.get("metallicFactor"),
            extensions=mt.get("extensions")))
    rep["textures"] = []
    for i, t in enumerate(js.get("textures", [])):
        im = js["images"][t["source"]]
        blob = binc[bv[im["bufferView"]]["byteOffset"] if "byteOffset" in bv[im["bufferView"]] else 0:][: bv[im["bufferView"]]["byteLength"]]
        rep["textures"].append(dict(index=i, image=im.get("name"), mime=im.get("mimeType"), size=_image_size(blob),
                                    bytes=bv[im["bufferView"]]["byteLength"], sampler=t.get("sampler")))
    rep["samplers"] = js.get("samplers", [])
    rep["image_bytes"] = sum(t["bytes"] for t in rep["textures"])
    rep["external_uris"] = [im.get("uri") for im in js.get("images", []) if "uri" in im] + \
                           [b.get("uri") for b in js.get("buffers", []) if "uri" in b]
    if verbose:
        log("GLB", Path(path).name, f"{total / 1024:.1f} KB  tris={tris} verts={verts}")
        log("  extensionsUsed:", rep["extensionsUsed"], "required:", rep["extensionsRequired"])
        log("  nodes:", rep["nodes"], "meshes:", rep["meshes"])
        log("  POSITION min:", np.round(mn, 6).tolist(), " max:", np.round(mx, 6).tolist())
        for m in rep["materials"]:
            log("  material:", m)
        for t in rep["textures"]:
            log("  texture:", t)
        log("  geometry bytes:", geom_bytes, " image bytes:", rep["image_bytes"], " external uris:", rep["external_uris"])
    return rep


# --------------------------------------------------------------------------------------
# QA
# --------------------------------------------------------------------------------------
def mesh_qa(obj) -> dict:
    """Topology + transform QA on a Blender object (mesh data at final scale)."""
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.edges.ensure_lookup_table()
    nonman = [e for e in bm.edges if len(e.link_faces) != 2]
    loose_v = [v for v in bm.verts if not v.link_edges]
    loose_e = [e for e in bm.edges if not e.link_faces]
    wind_bad = 0
    for e in bm.edges:
        if len(e.link_faces) == 2:
            l = e.link_loops
            if l[0].vert == l[1].vert:
                wind_bad += 1
    dbl = bmesh.ops.find_doubles(bm, verts=bm.verts, dist=1e-7)["targetmap"]
    zero_area = sum(1 for f in bm.faces if f.calc_area() < 1e-14)
    # global outward orientation: signed volume > 0
    vol = 0.0
    for f in bm.faces:
        vs = [l.vert.co for l in f.loops]
        for i in range(1, len(vs) - 1):
            vol += vs[0].dot(vs[i].cross(vs[i + 1])) / 6.0
    tri_count = sum(len(f.verts) - 2 for f in bm.faces)
    ngons = sum(1 for f in bm.faces if len(f.verts) > 4)
    quads = sum(1 for f in bm.faces if len(f.verts) == 4)
    bm.free()
    rep = dict(
        verts=len(me.vertices), faces=len(me.polygons), tris=tri_count, quads=quads, ngons=ngons,
        non_manifold_edges=len(nonman), loose_verts=len(loose_v), loose_edges=len(loose_e),
        inconsistent_winding_edges=wind_bad, duplicate_verts=len(dbl), zero_area_faces=zero_area,
        signed_volume=vol, modifiers=len(obj.modifiers),
        location=tuple(round(x, 9) for x in obj.location), rotation=tuple(round(x, 9) for x in obj.rotation_euler),
        scale=tuple(round(x, 9) for x in obj.scale), parent=obj.parent.name if obj.parent else None,
        materials=[m.name if m else None for m in me.materials], uv_layers=[u.name for u in me.uv_layers],
    )
    return rep


def uv_qa(obj, size=1024, group_by_material=True) -> dict:
    """Rasterise UV triangles (pixel-centre sampling) per material: overlap fraction and out-of-range count."""
    me = obj.data
    me.calc_loop_triangles()
    uvl = me.uv_layers.active.data
    res = {}
    mats = sorted({p.material_index for p in me.polygons})
    for mi in mats:
        cover = np.zeros((size, size), np.int16)
        oor = 0
        area_uv = 0.0
        n_tri = 0
        for lt in me.loop_triangles:
            if me.polygons[lt.polygon_index].material_index != mi:
                continue
            uv = np.array([uvl[i].uv[:] for i in lt.loops], np.float64)
            n_tri += 1
            if (uv < -1e-6).any() or (uv > 1 + 1e-6).any():
                oor += 1
            a = uv * size
            x0, y0 = np.floor(a.min(0)).astype(int)
            x1, y1 = np.ceil(a.max(0)).astype(int)
            area_uv += abs(np.cross(a[1] - a[0], a[2] - a[0])) * 0.5
            if x1 - x0 > size or y1 - y0 > size:
                continue
            x0, y0 = max(x0, 0), max(y0, 0)
            x1, y1 = min(x1, size - 1), min(y1, size - 1)
            if x1 < x0 or y1 < y0:
                continue
            xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
            p0, p1, p2 = a
            d = (p1[1] - p2[1]) * (p0[0] - p2[0]) + (p2[0] - p1[0]) * (p0[1] - p2[1])
            if abs(d) < 1e-12:
                continue
            l0 = ((p1[1] - p2[1]) * (xs - p2[0]) + (p2[0] - p1[0]) * (ys - p2[1])) / d
            l1 = ((p2[1] - p0[1]) * (xs - p2[0]) + (p0[0] - p2[0]) * (ys - p2[1])) / d
            l2 = 1 - l0 - l1
            m = (l0 > 1e-9) & (l1 > 1e-9) & (l2 > 1e-9)
            cover[y0:y1 + 1, x0:x1 + 1][m] += 1
        covered = int((cover > 0).sum())
        overl = int((cover > 1).sum())
        res[me.materials[mi].name if me.materials[mi] else mi] = dict(
            triangles=n_tri, covered_px=covered, coverage_pct=round(100 * covered / size / size, 2),
            overlap_px=overl, overlap_pct_of_covered=round(100 * overl / max(covered, 1), 3), out_of_range_tris=oor)
    return res


def texel_density(obj, size=1024) -> dict:
    """px per metre statistics (UV area -> 3D area) per material, from face area ratios."""
    me = obj.data
    uvl = me.uv_layers.active.data
    out = {}
    for mi in sorted({p.material_index for p in me.polygons}):
        ratios = []
        for p in me.polygons:
            if p.material_index != mi or p.area < 1e-10:
                continue
            uv = np.array([uvl[l].uv[:] for l in p.loop_indices])
            x, y = uv[:, 0], uv[:, 1]
            a_uv = 0.5 * abs(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1)))
            if a_uv > 0:
                ratios.append(math.sqrt(a_uv / p.area) * size)
        if ratios:
            r = np.array(ratios)
            out[me.materials[mi].name] = dict(p10=round(float(np.percentile(r, 10)), 1), median=round(float(np.median(r)), 1),
                                              p90=round(float(np.percentile(r, 90)), 1))
    return out


# --------------------------------------------------------------------------------------
# preview rendering (Cycles studio)
# --------------------------------------------------------------------------------------
def g2b(v):
    """glTF-space (x, y_up, z_toward_viewer) -> Blender-space."""
    return Vector((v[0], -v[2], v[1]))


def _look_at(cam, target):
    d = Vector(target) - cam.location
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


# studio calibration: a mid-grey (18 %) diffuse surface lit by the key renders around sRGB 0.45-0.55
KEY_E, FILL_E, RIM_E, WORLD_E = 1.85, 0.42, 1.50, 0.12


def build_studio(scene, scale: float, floor_z=0.0, backdrop_hex="#8B7E68", key_dir=(-0.8, -1.0, 0.9), key_energy=1.0,
                 world_strength=WORLD_E):
    """Cream cyclorama backdrop, warm key / cool fill / warm rim area lights, gradient world. Blender-space (Z up)."""
    s = scale
    # cyclorama sweep (floor -> radius -> wall), extruded along X
    prof = [(-6 * s, 0.0)]
    rad = 2.0 * s
    wall_y = 3.2 * s
    prof.append((wall_y - rad, 0.0))
    for k in range(1, 13):
        a = math.radians(90 * k / 12)
        prof.append((wall_y - rad + math.sin(a) * rad, rad - math.cos(a) * rad))
    prof.append((wall_y, 7 * s))
    bm = bmesh.new()
    w = 9 * s
    rows = []
    for (y, z) in prof:
        rows.append((bm.verts.new((-w, y, z + floor_z)), bm.verts.new((w, y, z + floor_z))))
    for i in range(len(rows) - 1):
        bm.faces.new((rows[i][0], rows[i][1], rows[i + 1][1], rows[i + 1][0]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new("studio_backdrop")
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    bd = link_object("studio_backdrop", me, scene)
    mat = bpy.data.materials.new("studio_backdrop_mat")
    mat.use_nodes = True
    b = mat.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*hex_to_linear(backdrop_hex), 1.0)
    b.inputs["Roughness"].default_value = 0.9
    bd.data.materials.append(mat)
    # world gradient
    world = bpy.data.worlds.new("studio_world")
    scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Generated"], sep.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[0].color = (*hex_to_linear("#1A1816"), 1)
    ramp.color_ramp.elements[1].position = 0.9
    ramp.color_ramp.elements[1].color = (*hex_to_linear("#8A857B"), 1)
    nt.links.new(sep.outputs["Z"], ramp.inputs["Fac"])
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = world_strength
    nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
    wo = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(bg.outputs["Background"], wo.inputs["Surface"])

    def area(name, loc, energy, color, size, target=(0, 0, 0)):
        ld = bpy.data.lights.new(name, "AREA")
        ld.energy = energy * s * s * 120.0
        ld.color = color
        ld.size = size * s
        ld.shape = "SQUARE"
        o = link_object(name, ld, scene)
        o.location = Vector(loc) * s
        o.rotation_euler = (Vector(target) * s - o.location).to_track_quat("-Z", "Y").to_euler()
        return o

    kd = Vector(key_dir).normalized() * 3.0
    area("key", kd, KEY_E * key_energy, (1.0, 0.91, 0.78), 1.3)
    area("fill", (2.6, -1.8, 1.4), FILL_E, (0.80, 0.88, 1.0), 3.4)
    area("rim", (1.2, 2.8, 1.8), RIM_E, (1.0, 0.84, 0.62), 1.1)
    return bd


def set_key_light(scene, direction, scale, energy_mult=1.0):
    """Re-aim the studio key light. direction: Blender-space vector from the target towards the light (None = default)."""
    key = scene.objects.get("key")
    if key is None:
        return
    d = Vector(direction if direction is not None else (-0.8, -1.0, 0.9)).normalized() * 3.0 * scale
    key.location = d
    key.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    key.data.energy = KEY_E * energy_mult * scale * scale * 120.0


def isolate_key(scene, on: bool):
    """Raking-light mode: dim fill / rim lights and the world so the low key light carves relief."""
    k = 0.12 if on else 1.0
    for nm in ("fill", "rim"):
        o = scene.objects.get(nm)
        if o is not None:
            if "_e0" not in o:
                o["_e0"] = o.data.energy
            o.data.energy = o["_e0"] * k
    if scene.world and scene.world.node_tree:
        for n in scene.world.node_tree.nodes:
            if n.type == "BACKGROUND":
                if "_s0" not in scene.world:
                    scene.world["_s0"] = n.inputs["Strength"].default_value
                n.inputs["Strength"].default_value = scene.world["_s0"] * (0.25 if on else 1.0)


def make_camera(scene, loc, target, lens=70.0, name="cam"):
    cd = bpy.data.cameras.new(name)
    cd.lens = lens
    cd.sensor_width = 36
    cd.clip_start = 0.0005
    cd.clip_end = 50
    cam = link_object(name, cd, scene)
    cam.location = Vector(loc)
    _look_at(cam, target)
    scene.camera = cam
    return cam


def set_view_transform(scene):
    for vt in ("Khronos PBR Neutral", "Standard"):
        try:
            scene.view_settings.view_transform = vt
            scene.view_settings.look = "None"
            break
        except TypeError:
            continue
    scene.view_settings.exposure = 0.0
    scene.display_settings.display_device = "sRGB"


def render_to(scene, path, res=(1280, 960), samples=96, max_kb=None):
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 100
    scene.cycles.samples = samples
    set_view_transform(scene)
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(path)
    t0 = time.time()
    bpy.ops.render.render(write_still=True)
    log(f"render {path.name} {res} {samples}spp -> {time.time() - t0:.1f}s, {path.stat().st_size / 1024:.0f} KB")
    if max_kb and path.stat().st_size > max_kb * 1024:
        _downscale_png(path, max_kb)


def _downscale_png(path: Path, max_kb: int):
    img = bpy.data.images.load(str(path))
    w, h = img.size
    while path.stat().st_size > max_kb * 1024 and w > 480:
        w, h = int(w * 0.88), int(h * 0.88)
        img.scale(w, h)
        img.file_format = "PNG"
        img.filepath_raw = str(path)
        img.save()
        log(f"  downscaled {path.name} -> {w}x{h} {path.stat().st_size / 1024:.0f} KB")
    bpy.data.images.remove(img)


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    return [o for o in bpy.data.objects if o not in before]
