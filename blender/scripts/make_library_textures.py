"""make_library_textures.py - tileable texture sets for the shared Mat_* material library (ADR-032).

    blender --background --factory-startup --python blender/scripts/make_library_textures.py -- --out <dir> [options]

Options
    --out DIR          REQUIRED output root (R1: no default path). Normally public/assets/materials.
    --only A,B         build only these library names (default: all). library.json is merged, not replaced.
    --sheet FILE.png   also render one contact sheet (spheres + flat tiles) from the textures just written.
    --sheet-samples N  Cycles samples for the sheet (default 64).
    --cpu              render the sheet on the CPU.

Writes, per textured material, public/assets/materials/<slug>/{baseColor.jpg, orm.png, normal.png} and a
library.json that the runtime registry (src/materials) loads.

Rules (docs/BLENDER_PRODUCTION_GUIDELINES.md section 7, ADR-032 / ADR-034):
    * Every set tiles seamlessly. ONE TILE COVERS 0.1 m: a mesh that uses a library material needs UVs at
      1 UV unit = 0.1 m of surface (metres * 10), one map named UVMap.
    * baseColor = sRGB JPEG; orm = occlusion R, roughness G, metallic B (PNG); normal = tangent space, OpenGL (+Y up).
    * Albedo is neutral: no baked light or shadow, so the game can desaturate and re-tint (frozen / awakened).
    * Maps are at most 1024 px; the whole library stays at or under 48 MiB of GPU texture (mips included).
    * Grain, brush strokes and thread rows run along +U (texture x).
"""
from __future__ import annotations

import sys

sys.dont_write_bytecode = True  # R4: importing wu_common must not write __pycache__ into the repository

import argparse
import hashlib
import json
import math
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bmesh
import bpy
from mathutils import Vector

import wu_common as wu

TILE_M = 0.1          # metres of surface per UV unit
MAX_PX = 1024
BUDGET_MIB = 48.0
JPEG_QUALITY = 90


def gpu_mib(w: int, h: int) -> float:
    """GPU memory after decode with the mip chain: w * h * 4 bytes * 4/3 (validator V33)."""
    return w * h * 4 * (4.0 / 3.0) / (1024 * 1024)


# --------------------------------------------------------------------------------------
# small helpers
# --------------------------------------------------------------------------------------
def T(X, Y, cx: int, cy: int, octaves: int, seed: int, gain: float = 0.5):
    """Tileable fbm with cx x cy lattice cells per tile at the base octave (0..1)."""
    return wu.fbm2(X * cx, Y * cy, octaves, seed, (cx, cy), gain)


def col(hex_: str) -> np.ndarray:
    return wu.hex_to_linear(hex_).astype(np.float32)


def hex_of(linear) -> str:
    c = np.clip(np.rint(wu.linear_to_srgb(np.asarray(linear, np.float64)) * 255.0), 0, 255).astype(int)
    return "#%02X%02X%02X" % tuple(c)


def mix(a, b, t):
    return wu._mix(a, np.broadcast_to(b, a.shape), t)


def pack(col_lin, ao, rough, metal, normal):
    """Final map dict. col_lin is linear; base becomes sRGB-encoded."""
    orm = np.stack([np.clip(ao, 0, 1), np.clip(rough, 0.04, 1.0), np.clip(metal, 0, 1)], axis=-1).astype(np.float32)
    return dict(base=wu.linear_to_srgb(np.clip(col_lin, 0, 1)).astype(np.float32), orm=orm, normal=normal)


# --------------------------------------------------------------------------------------
# generators. Each takes the working size n and returns dict(base, orm, normal) of (n, n, 3).
# --------------------------------------------------------------------------------------
def gen_aged_brass(n):
    # hammered / peened aged brass from the shared look in wu_common.BRASS; 1 mm dimples at 0.1 m per tile
    return wu.brass_maps(n, tile=True, seed=11, dimple_cells=110, scratch_count=110)


def gen_polished_brass(n):
    seed = 61
    X, Y = wu.grid(n)
    smudge = T(X, Y, 6, 6, 4, seed)
    brush = T(X, Y, 2, 300, 2, seed + 1)              # brushed streaks along U
    fine = T(X, Y, 128, 128, 2, seed + 2)
    scr = wu.scratch_map(n, max(40, n // 8), seed + 3, min_len=n * 0.04, max_len=n * 0.30, blur=0)
    base = col("#DDBB5E")
    tone = 1.0 + (smudge - 0.5) * 0.06 + (brush - 0.5) * 0.05 + (fine - 0.5) * 0.02
    c = base[None, None, :] * tone[..., None]
    c = mix(c, col("#EBD487"), np.clip(scr * 0.35, 0, 1))
    rough = 0.17 + (smudge - 0.5) * 0.12 + (brush - 0.5) * 0.08 + scr * 0.10
    metal = 0.97 - (smudge - 0.5) * 0.03
    normal = wu.combine_normals([(brush, "rms", 0.015), (-wu.blur_periodic(scr, 1), "p99", 0.03)], wrap=True)
    return pack(c, np.ones((n, n), np.float32), rough, metal, normal)


def gen_walnut(n):
    """Tileable walnut: rings run along U, 24 rings per 0.1 m tile (4.2 mm pitch, as wu_common.walnut_maps)."""
    seed = 17
    X, Y = wu.grid(n)
    warp = T(X, Y, 3, 5, 4, seed) - 0.5
    warp2 = T(X, Y, 9, 36, 3, seed + 1) - 0.5
    ph = Y * 24 + 2.2 * warp + 0.8 * warp2
    ring = 0.5 + 0.5 * np.sin(2 * math.pi * ph)
    line = np.clip((1.0 - ring) ** 2.4, 0, 1)                      # thin dark grain lines
    tone = T(X, Y, 4, 12, 4, seed + 2)
    tone2 = T(X, Y, 18, 160, 3, seed + 3)
    pores = wu.smoothstep(0.70, 0.88, T(X, Y, 36, 320, 2, seed + 4))
    fine = T(X, Y, 64, 480, 2, seed + 5)
    light, base, dark, lin = (col(wu.WALNUT[k]) for k in ("light", "base", "dark", "line"))
    t = np.clip((tone - 0.5) * 1.4 + (tone2 - 0.5) * 0.5 + 0.5, 0, 1)
    c = mix(mix(np.zeros((n, n, 3), np.float32) + dark, light, t), base, np.full((n, n), 0.35, np.float32))
    c = mix(c, lin, np.clip(line * 0.55, 0, 1))
    c = mix(c, lin, pores * 0.45)
    c = c * (0.96 + (fine - 0.5) * 0.10)[..., None]
    rough = wu.WALNUT["rough"] + line * 0.05 + pores * 0.06 + (fine - 0.5) * 0.05 - (tone - 0.5) * 0.04
    height = -pores * 0.9 - line * 0.35 + (fine - 0.5) * 0.12
    normal = wu.height_to_normal(height, 0.05, wrap=True)
    return pack(c, 1.0 - pores * 0.25, np.clip(rough, 0.4, 0.85), np.zeros((n, n), np.float32), normal)


def gen_velvet(n):
    """Tileable teal velvet (wu_common.velvet_maps is not periodic, so its formulas are repeated with wrap)."""
    seed = 31
    X, Y = wu.grid(n)
    nap = T(X, Y, 4, 4, 4, seed)
    nap2 = T(X, Y, 11, 7, 3, seed + 2)
    cw = int(n * 0.9)
    fib = wu.noise2(X * cw, Y * cw, seed + 4, (cw, cw))
    fib2 = wu.noise2(X * (cw // 2), Y * (cw // 2), seed + 8, (cw // 2, cw // 2))
    base, dark, light = (col(wu.VELVET[k]) for k in ("base", "dark", "light"))
    t = np.clip(0.5 + (nap - 0.5) * 1.1 + (nap2 - 0.5) * 0.45, 0, 1)
    c = mix(mix(np.zeros((n, n, 3), np.float32) + dark, light, t), base, np.full((n, n), 0.45, np.float32))
    c = c * (0.96 + (fib - 0.5) * 0.12 + (fib2 - 0.5) * 0.06)[..., None]
    rough = np.clip(wu.VELVET["rough"] + (fib - 0.5) * 0.04 - (nap - 0.5) * 0.04, 0.78, 1.0)
    height = fib * 0.7 + fib2 * 0.5 + (nap - 0.5) * 0.15
    normal = wu.height_to_normal(height, 0.045, wrap=True)
    return pack(c, np.ones((n, n), np.float32), rough, np.zeros((n, n), np.float32), normal)


def _paint(n, base_hex, seed, rough, brush_y, chip_cov, under_hex, under_metal, grain, tone_amp=0.10):
    """Satin paint with brush strokes along U, faint wood grain beneath and sparse chips down to the substrate."""
    X, Y = wu.grid(n)
    brush = T(X, Y, 3, brush_y, 3, seed)
    brush2 = T(X, Y, 7, brush_y * 2, 2, seed + 1)
    blot = T(X, Y, 5, 5, 4, seed + 2)
    ph = Y * 16 + 2.5 * (T(X, Y, 3, 5, 3, seed + 3) - 0.5)
    gl = np.clip((1.0 - (0.5 + 0.5 * np.sin(2 * math.pi * ph))) ** 2.4, 0, 1) * grain
    cf = T(X, Y, 20, 20, 4, seed + 4) + 0.10 * T(X, Y, 90, 90, 2, seed + 5)
    thr = float(np.quantile(cf, 1.0 - chip_cov))
    chip = wu.smoothstep(thr, thr + 0.06, cf)
    tone = 1.0 + (blot - 0.5) * tone_amp + (brush - 0.5) * 0.05 - gl * 0.06
    c = col(base_hex)[None, None, :] * tone[..., None]
    c = mix(c, col(under_hex), chip * 0.92)
    r = rough + (brush2 - 0.5) * 0.08 + (blot - 0.5) * 0.05 + chip * 0.22
    height = brush * 0.28 + brush2 * 0.10 - gl * 0.6 - chip * 0.9
    normal = wu.height_to_normal(height, 0.05, wrap=True)
    return pack(c, 1.0 - chip * 0.35, r, chip * under_metal, normal)


def gen_painted_wood(n):
    return _paint(n, "#D6C49A", 71, 0.52, 60, 0.006, wu.PALETTE_HEX["walnut"], 0.0, 1.0)


def gen_teal_paint(n):
    return _paint(n, wu.PALETTE_HEX["teal"], 83, 0.46, 70, 0.010, "#8C7440", 0.80, 0.0, tone_amp=0.07)


def _glaze(n, base_hex, seed, rough, craze, speck, peel_slope):
    """Glossy fired glaze: faint crazing web, orange-peel relief, sparse iron specks."""
    X, Y = wu.grid(n)
    ridged = 1.0 - np.abs(2.0 * T(X, Y, 10, 10, 4, seed) - 1.0)
    web = wu.smoothstep(0.965, 0.995, ridged) * craze
    peel = T(X, Y, 56, 56, 3, seed + 1)
    pool = T(X, Y, 4, 4, 3, seed + 2)
    sp = wu.smoothstep(0.985, 0.998, wu.noise2(X * (n // 2), Y * (n // 2), seed + 9, (n // 2, n // 2))) * speck
    tone = 1.0 + (pool - 0.5) * 0.05 + (peel - 0.5) * 0.02 - web * 0.07
    c = col(base_hex)[None, None, :] * tone[..., None]
    c = mix(c, col("#6B5A3C"), np.clip(sp * 0.6, 0, 1))
    r = rough + (peel - 0.5) * 0.05 + (pool - 0.5) * 0.06 + web * 0.25
    height = peel * 0.3 - web * 0.8 - sp * 0.3
    normal = wu.height_to_normal(height, peel_slope, wrap=True)
    return pack(c, 1.0 - web * 0.3, r, np.zeros((n, n), np.float32), normal)


def gen_cream_enamel(n):
    return _glaze(n, wu.PALETTE_HEX["cream"], 91, 0.20, 1.0, 0.0, 0.02)


def gen_ceramic(n):
    return _glaze(n, "#EADFC8", 97, 0.30, 0.55, 0.8, 0.035)


def gen_cream_paper(n):
    seed = 41
    X, Y = wu.grid(n)
    mott = T(X, Y, 6, 6, 4, seed)
    mott2 = T(X, Y, 24, 24, 3, seed + 1)
    g = n // 2
    grain = wu.noise2(X * g, Y * g, seed + 5, (g, g))
    fib = wu.scratch_map(n, 1400, seed + 2, min_len=n * 0.012, max_len=n * 0.06, blur=1)
    fib2 = wu.scratch_map(n, 900, seed + 3, min_len=n * 0.010, max_len=n * 0.05, blur=1)
    tone = 1.0 + (mott - 0.5) * 0.07 + (mott2 - 0.5) * 0.04 + (grain - 0.5) * 0.02 + fib * 0.06 - fib2 * 0.07
    c = col("#EFE3C8")[None, None, :] * tone[..., None]
    rough = 0.88 + (mott2 - 0.5) * 0.06 + (grain - 0.5) * 0.04
    height = fib * 0.6 - fib2 * 0.4 + grain * 0.3
    normal = wu.height_to_normal(height, 0.04, wrap=True)
    return pack(c, 1.0 - fib2 * 0.15, rough, np.zeros((n, n), np.float32), normal)


def gen_fabric(n):
    """Plain-weave canvas, 64 threads per 0.1 m (1.6 mm pitch). N must be even so the weave tiles."""
    N, seed = 64, 53
    X, Y = wu.grid(n)
    U, V = X * N, Y * N
    i, j = np.floor(U), np.floor(V)
    prof_u = np.sin(math.pi * (U - i)) ** 0.6            # warp thread cross-section across u
    prof_v = np.sin(math.pi * (V - j)) ** 0.6            # weft thread cross-section across v
    m_w = 0.5 + 0.5 * np.cos(math.pi * (V - 0.5) + math.pi * i)   # warp over/under along its length
    m_f = 0.5 - 0.5 * np.cos(math.pi * (U - 0.5) + math.pi * j)
    hw = prof_u * (0.45 + 0.55 * m_w)
    hf = prof_v * (0.45 + 0.55 * m_f)
    h = np.maximum(hw, hf)
    rng = np.random.default_rng(seed)
    ru, rv = rng.random(N).astype(np.float32), rng.random(N).astype(np.float32)
    thread = np.where(hw >= hf, ru[i.astype(int) % N], rv[j.astype(int) % N])
    slub = T(X, Y, 8, 8, 4, seed + 1)
    mott = T(X, Y, 5, 5, 3, seed + 2)
    tone = (1.0 + (thread - 0.5) * 0.14 + (slub - 0.5) * 0.08 + (mott - 0.5) * 0.05) * (0.62 + 0.38 * h)
    c = col("#D8C7A0")[None, None, :] * tone[..., None]
    rough = 0.86 + (thread - 0.5) * 0.06
    normal = wu.height_to_normal(h + (slub - 0.5) * 0.1, 0.30, wrap=True)
    return pack(c, 0.5 + 0.5 * h, rough, np.zeros((n, n), np.float32), normal)


def gen_stone(n):
    """Warm limestone: pebbly aggregate cells, broad mottling, pits."""
    seed = 29
    X, Y = wu.grid(n)
    d, bd = wu.worley_dimples(n, 36, seed)
    grain = T(X, Y, 8, 8, 5, seed + 1)
    fine = T(X, Y, 120, 120, 3, seed + 2)
    pit = wu.smoothstep(0.78, 0.90, T(X, Y, 60, 60, 3, seed + 3))
    tone = 1.0 + (grain - 0.5) * 0.28 + (bd - 0.5) * 0.14 + (fine - 0.5) * 0.10 - pit * 0.25
    c = col("#B0A48C")[None, None, :] * tone[..., None]
    rough = 0.86 + (fine - 0.5) * 0.10 - (bd - 0.5) * 0.04
    height = -pit * 0.8 + fine * 0.4 - d * 0.3 + grain * 0.2
    normal = wu.height_to_normal(height, 0.07, wrap=True)
    return pack(c, 1.0 - pit * 0.4, rough, np.zeros((n, n), np.float32), normal)


# --------------------------------------------------------------------------------------
# library table, in manifest order (meta.materialLibrary)
#   sizes: px per map, base / orm / normal.  Constants-only materials have gen=None.
# --------------------------------------------------------------------------------------
SHEEN_VELVET_LINEAR = wu.VELVET["sheen_tint"]

LIBRARY = {
    "Mat_AgedBrass": dict(slug="aged_brass", gen=gen_aged_brass, sizes=(1024, 512, 512)),
    "Mat_Walnut": dict(slug="walnut", gen=gen_walnut, sizes=(1024, 512, 512)),
    "Mat_VelvetTeal": dict(slug="velvet_teal", gen=gen_velvet, sizes=(512, 256, 512), physical=True),
    "Mat_PolishedBrass": dict(slug="polished_brass", gen=gen_polished_brass, sizes=(512, 256, 256)),
    "Mat_PaintedWood": dict(slug="painted_wood", gen=gen_painted_wood, sizes=(512, 256, 512)),
    "Mat_CreamPaper": dict(slug="cream_paper", gen=gen_cream_paper, sizes=(512, 256, 256)),
    "Mat_CreamEnamel": dict(slug="cream_enamel", gen=gen_cream_enamel, sizes=(512, 256, 256)),
    "Mat_TealPaint": dict(slug="teal_paint", gen=gen_teal_paint, sizes=(512, 256, 256)),
    "Mat_WarmGlass": dict(slug="warm_glass", gen=None, constants=dict(
        color="#FFD9A3", roughness=0.04, metalness=0.0, alpha=dict(opacity=0.28))),
    "Mat_Fabric": dict(slug="fabric", gen=gen_fabric, sizes=(512, 256, 512)),
    "Mat_Stone": dict(slug="stone", gen=gen_stone, sizes=(512, 256, 512)),
    "Mat_WarmEmissive": dict(slug="warm_emissive", gen=None, constants=dict(
        color=wu.PALETTE_HEX["cream"], roughness=0.5, metalness=0.0,
        emissive=dict(color=wu.PALETTE_HEX["lamp"], strength=1.5))),
    "Mat_Ceramic": dict(slug="ceramic", gen=gen_ceramic, sizes=(512, 256, 256)),
}


# --------------------------------------------------------------------------------------
# resize, QA, write
# --------------------------------------------------------------------------------------
def down(a, size, normal=False):
    a = wu.resize_map(a, size).astype(np.float32)
    if normal:
        v = a * 2.0 - 1.0
        v /= np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-6)
        a = (v * 0.5 + 0.5).astype(np.float32)
    return a


def seam_ratio(a) -> float:
    """How bad the wrap seam is: the mean step across the wrap edge divided by the WORST mean step of any interior
    line, per axis (max of both). A texture that tiles gives well under 1.0, because the seam line is just one more
    line; a texture that does not tile gives several. Robust against sparse features (chips, specks)."""
    worst = 0.0
    for ax in (0, 1):
        other = 1 - ax
        lines = np.abs(np.diff(a, axis=ax)).mean(axis=(other, 2))
        edge = float(np.abs(np.take(a, 0, axis=ax) - np.take(a, -1, axis=ax)).mean())
        worst = max(worst, edge / (float(lines.max()) + 1e-9))
    return worst


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build_material(name: str, spec: dict, out: Path) -> dict:
    """Generate, write and describe one library material. Returns its library.json entry."""
    slug = spec["slug"]
    if spec["gen"] is None:                                    # constants only, no image
        c = spec["constants"]
        d = dict(type="standard", color=c["color"], roughness=c["roughness"], metalness=c["metalness"])
        if "alpha" in c:
            d["alpha"] = c["alpha"]
        if "emissive" in c:
            d["emissive"] = c["emissive"]
        d["tiling"] = dict(uvUnitMetres=TILE_M, repeat=[1, 1])
        d["proxy"] = dict(baseColor=c["color"], metallic=c["metalness"], roughness=c["roughness"])
        d["proxy"].update({k: c[k] for k in ("alpha", "emissive") if k in c})
        d["gpuMiB"] = 0.0
        return d
    sz_base, sz_orm, sz_nrm = spec["sizes"]
    n = max(spec["sizes"])
    maps = spec["gen"](n)
    seam = max(seam_ratio(maps[k]) for k in ("base", "orm", "normal"))
    base = down(maps["base"], sz_base)
    orm = down(maps["orm"], sz_orm)
    nrm = down(maps["normal"], sz_nrm, normal=True)
    d_out = out / slug
    d_out.mkdir(parents=True, exist_ok=True)
    files = {"baseColor": d_out / "baseColor.jpg", "orm": d_out / "orm.png", "normal": d_out / "normal.png"}
    wu.write_jpeg(files["baseColor"], base, JPEG_QUALITY)
    wu.write_png(files["orm"], orm)
    wu.write_png(files["normal"], nrm)
    sizes = {"baseColor": sz_base, "orm": sz_orm, "normal": sz_nrm}
    tex = {}
    for slot, p in files.items():
        tex[slot] = dict(file=f"{slug}/{p.name}", size=sizes[slot], bytes=p.stat().st_size, sha256=sha(p))
    mean_lin = wu.srgb_to_linear(maps["base"]).reshape(-1, 3).mean(axis=0)
    d = dict(
        type="physical" if spec.get("physical") else "standard",
        color="#FFFFFF", roughness=1.0, metalness=1.0, normalScale=1.0,
        textures=tex,
        tiling=dict(uvUnitMetres=TILE_M, repeat=[1, 1]),
        proxy=dict(baseColor=hex_of(mean_lin), metallic=round(float(maps["orm"][..., 2].mean()), 3),
                   roughness=round(float(maps["orm"][..., 1].mean()), 3)),
        gpuMiB=round(sum(gpu_mib(s, s) for s in sizes.values()), 3),
    )
    if spec.get("physical"):
        d["sheen"] = dict(color=hex_of(SHEEN_VELVET_LINEAR), roughness=0.4)
    wu.log(f"{name:18s} {sz_base}/{sz_orm}/{sz_nrm}px  {d['gpuMiB']:6.2f} MiB  seam x{seam:.2f}  "
           f"files {sum(t['bytes'] for t in tex.values()) / 1024:.0f} KB  proxy {d['proxy']}")
    d["_seam"] = round(seam, 3)
    return d


def write_library(out: Path, only: list[str] | None) -> dict:
    path = out / "library.json"
    lib = json.loads(path.read_text(encoding="utf-8")) if (only and path.exists()) else {"materials": {}}
    mats = lib.get("materials", {})
    seams = {}
    for name, spec in LIBRARY.items():
        if only and name not in only:
            continue
        d = build_material(name, spec, out)
        seams[name] = d.pop("_seam", None)
        mats[name] = d
    ordered = {k: mats[k] for k in LIBRARY if k in mats}
    total = round(sum(m.get("gpuMiB", 0.0) for m in ordered.values()), 3)
    lib = dict(
        schemaVersion=1,
        generator="blender/scripts/make_library_textures.py",
        uvUnitMetres=TILE_M,
        conventions=dict(
            texel="1 UV unit = 0.1 m of surface; one texture tile covers 10 cm",
            baseColor="sRGB JPEG", orm="occlusion R, roughness G, metallic B (PNG, linear)",
            normal="tangent space, OpenGL (+Y up), PNG, linear", colors="hex strings are sRGB",
        ),
        budget=dict(limitMiB=BUDGET_MIB, totalMiB=total, maxPx=MAX_PX, formula="w*h*4*4/3 per image, each image once"),
        materials=ordered,
    )
    path.write_text(json.dumps(lib, indent=2) + "\n", encoding="utf-8")
    wu.log(f"library.json: {len(ordered)} materials, {total:.2f} MiB of {BUDGET_MIB:.0f} MiB -> {path}")
    return dict(lib=lib, seams=seams)


# --------------------------------------------------------------------------------------
# contact sheet: one slab (1.5 tiles, shows the repeat) and one sphere per material, rendered in Cycles
# --------------------------------------------------------------------------------------
def _slab(name, size):
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    h = size / 2
    vs = [bm.verts.new(p) for p in ((-h, -h, 0), (h, -h, 0), (h, h, 0), (-h, h, 0))]
    f = bm.faces.new(vs)
    for lp in f.loops:
        lp[uv].uv = (lp.vert.co.x / TILE_M, lp.vert.co.y / TILE_M)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return me


def _sphere(name, r):
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    bmesh.ops.create_uvsphere(bm, u_segments=96, v_segments=48, radius=r, calc_uvs=True)
    su, sv = 2 * math.pi * r / TILE_M, math.pi * r / TILE_M
    for f in bm.faces:
        f.smooth = True
        for lp in f.loops:
            u, v = lp[uv].uv
            lp[uv].uv = (u * su, v * sv)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return me


def _sheet_material(name: str, d: dict, root: Path):
    tex = d.get("textures")
    if tex:
        imgs = {}
        for slot, t in tex.items():
            imgs[slot] = wu.load_packed_image(root / t["file"], f"{name}_{slot}", srgb=(slot == "baseColor"))
        sheen = SHEEN_VELVET_LINEAR if d["type"] == "physical" else None
        mat = wu.build_pbr_material(name, imgs.get("baseColor"), imgs.get("orm"), imgs.get("normal"),
                                    extension="REPEAT", sheen_tint=sheen)
        return mat
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    b = mat.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*wu.hex_to_linear(d["color"]), 1.0)
    b.inputs["Roughness"].default_value = d["roughness"]
    b.inputs["Metallic"].default_value = d["metalness"]
    if "alpha" in d:
        b.inputs["Alpha"].default_value = d["alpha"]["opacity"]
    if "emissive" in d:
        b.inputs["Emission Color"].default_value = (*wu.hex_to_linear(d["emissive"]["color"]), 1.0)
        b.inputs["Emission Strength"].default_value = d["emissive"]["strength"]
    return mat


def render_sheet(lib: dict, root: Path, path: Path, samples: int, gpu: bool):
    scene = wu.reset_scene()
    wu.setup_cycles(scene, samples=samples, denoise=True, gpu=gpu)
    wu.build_studio(scene, 0.55, floor_z=0.0, backdrop_hex="#6B6256", key_energy=0.55, world_strength=0.09)
    names = list(lib["materials"])
    cols, pitch_x, pitch_y = 5, 0.19, 0.21
    rows = math.ceil(len(names) / cols)
    ink = bpy.data.materials.new("label_ink")
    ink.use_nodes = True
    ink_bsdf = ink.node_tree.nodes["Principled BSDF"]
    ink_bsdf.inputs["Base Color"].default_value = (*wu.hex_to_linear("#2A2118"), 1.0)
    # emissive cream: legible on the floor whatever the reflected light or shadow of the neighbouring tile (Gate F)
    ink_bsdf.inputs["Emission Color"].default_value = (*wu.hex_to_linear("#F2E6CF"), 1.0)
    ink_bsdf.inputs["Emission Strength"].default_value = 1.4
    for k, name in enumerate(names):
        cx = (k % cols - (cols - 1) / 2) * pitch_x
        cy = ((rows - 1) / 2 - k // cols) * pitch_y
        mat = _sheet_material(name, lib["materials"][name], root)
        slab = wu.link_object(f"slab_{name}", _slab(f"slab_{name}", 0.15), scene)
        slab.location = (cx, cy, 0.0004)
        slab.data.materials.append(mat)
        ball = wu.link_object(f"ball_{name}", _sphere(f"ball_{name}", 0.035), scene)
        ball.location = (cx, cy, 0.0004 + 0.035)
        ball.data.materials.append(mat)
        cu = bpy.data.curves.new(f"lbl_{name}", "FONT")
        cu.body = name.replace("Mat_", "")
        cu.size = 0.013
        cu.align_x = "CENTER"
        lbl = wu.link_object(f"lbl_{name}", cu, scene)
        lbl.location = (cx, cy - 0.094, 0.0008)
        lbl.data.materials.append(ink)
    wu.make_camera(scene, (0, -0.92, 1.18), (0, -0.01, 0), lens=50.0)
    wu.render_to(scene, path, res=(1920, 1080), samples=samples, max_kb=1800)


# --------------------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(prog="make_library_textures.py")
    ap.add_argument("--out", required=True, help="output root (required, no default)")
    ap.add_argument("--only", default="")
    ap.add_argument("--sheet", default="")
    ap.add_argument("--sheet-samples", type=int, default=64)
    ap.add_argument("--cpu", action="store_true")
    a = ap.parse_args(wu.script_args())
    out = Path(a.out).resolve()
    only = [s for s in a.only.split(",") if s] or None
    if only:
        bad = [s for s in only if s not in LIBRARY]
        if bad:
            raise SystemExit(f"unknown library names: {bad}; known: {list(LIBRARY)}")
    res = write_library(out, only)
    lib = res["lib"]
    over = lib["budget"]["totalMiB"] > BUDGET_MIB
    too_big = [(n, t["size"]) for n, m in lib["materials"].items() for t in m.get("textures", {}).values()
               if t["size"] > MAX_PX]
    bad_seam = {n: s for n, s in res["seams"].items() if s and s > 1.25}
    wu.log(f"budget {'EXCEEDED' if over else 'ok'}; maps over {MAX_PX}px: {too_big or 'none'}; "
           f"seam ratio over 1.25: {bad_seam or 'none'}")
    if a.sheet:
        render_sheet(lib, out, Path(a.sheet).resolve(), a.sheet_samples, not a.cpu)
    if over or too_big or bad_seam:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
