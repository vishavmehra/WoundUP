"""gen_lamp_post.py - the Tockton street lamp (forge family 'environment'): one GLB instanced along the town paths (ADR-030).

Not run directly. The family runner builds it:

    "$B" --background --factory-startup --python-exit-code 1 --python blender/scripts/forge.py -- \
         --family environment --only lamp_post --out-root <dir> --owner World [--manifest <file>]

Scale (docs/TOCKTON_DIMENSIONS section 7, 1:48): the lamp is 65 mm tall = a 3.1 m street lamp. Mira is 35 mm (1.86 x), the Bakery
door 44 mm (1.48 x), the Bakery 190 mm: the lamp reads as street furniture, taller than a door and far below the eaves.

Parts, all in one pass of the town kit (shells overlap, nothing is welded):
  LampPost_Housing  Mat_AgedBrass  scalloped plinth, mid ring, bracket boss, two mirrored scroll brackets (an S-arm up to the
                                   lantern plate and a volute curl below it), neck collar, hexagonal lantern plate, six corner
                                   ribs, top rim, burner cup and the ball-and-spike finial
                    Mat_TealPaint  the slim tapered post and the hexagonal ogee roof
                    Mat_WarmGlass  one hexagonal glass frustum (alpha; allowAlpha in the manifest)
  LampPost_Bulb     Mat_WarmEmissive  the teardrop core; the runtime animates its emissive strength (no point light, CLAUDE.md 8)

Model space (glTF Y-up): origin at the centre of the foot on the ground, +Y up; the scrolls lie in the X-Y plane and the lantern
is a hexagon with a vertex on +X, so the box is symmetric in x and z. Built in cm, scaled to metres by the kit.
"""
from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bmesh
import bpy
from mathutils import Vector

import wu_common as wu
from gen_town_kit import Part, ellipsoid, lathe, to_m  # noqa: F401  (to_m kept for future sockets)

FAMILY = "environment"
BR, TL, GL = "Mat_AgedBrass", "Mat_TealPaint", "Mat_WarmGlass"
CREASE_DEG = 35.0                       # a 12-gon ring (30 deg) shades smooth, the hexagon (60 deg) and a scroll's hex section stay crisp


def catmull(pts, per_seg):
    """Uniform Catmull-Rom through pts (end points doubled): about per_seg samples between neighbours, both ends included."""
    P = [pts[0]] + list(pts) + [pts[-1]]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = (Vector(P[i + k]) for k in (-1, 0, 1, 2))
        for s in range(per_seg):
            t = s / per_seg
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(Vector(pts[-1]))
    return out


def sweep(path, radii, n=6, ref=(0.0, 0.0, 1.0)):
    """Closed tube: an n-gon section swept along `path` with the radius `radii(i, N)` and fan caps on both ends."""
    N = len(path)
    bm = bmesh.new()
    rings = []
    for i, p in enumerate(path):
        t = (path[min(i + 1, N - 1)] - path[max(i - 1, 0)]).normalized()
        u = t.cross(Vector(ref))
        if u.length < 1e-6:
            u = t.cross(Vector((1.0, 0.0, 0.0)))
        u.normalize()
        v = t.cross(u)
        r = radii(i, N)
        rings.append([bm.verts.new(p + r * (math.cos(2 * math.pi * k / n) * u + math.sin(2 * math.pi * k / n) * v)) for k in range(n)])
    for a, b in zip(rings, rings[1:]):
        for k in range(n):
            bm.faces.new([a[k], a[(k + 1) % n], b[(k + 1) % n], b[k]])
    for ring, end in ((rings[0], path[0]), (rings[-1], path[-1])):
        c = bm.verts.new(end)
        for k in range(n):
            bm.faces.new([ring[(k + 1) % n], ring[k], c])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def taper(*stops):
    """Radius profile by fraction along the path: taper((0, .09), (.5, .07), (1, .06))."""
    def f(i, N):
        s = i / max(N - 1, 1)
        for (s0, r0), (s1, r1) in zip(stops, stops[1:]):
            if s <= s1:
                return r0 + (r1 - r0) * (s - s0) / max(s1 - s0, 1e-9)
        return stops[-1][1]
    return f


def mirrored(pts):
    return [(-x, y, z) for x, y, z in pts]


def build_housing(p):
    n, h = p["n_round"], Part("LampPost_Housing", [BR, TL, GL])
    # ---- brass: scalloped plinth with a bead ring (the "base collar")
    h.add(lathe([(0, 0), (0.90, 0), (0.90, 0.14), (0.84, 0.22), (0.84, 0.30), (0.62, 0.48), (0.46, 0.66), (0.40, 0.86), (0.40, 0.96),
                 (0.50, 1.00), (0.50, 1.12), (0.40, 1.18), (0, 1.18)], 16), BR)
    # ---- teal: tapered post, a slight belly low down and a slim upper shaft
    h.add(lathe([(0, 1.10), (0.33, 1.10), (0.31, 1.35), (0.27, 1.70), (0.26, 2.30), (0.22, 2.62), (0.20, 3.20), (0.20, 3.74), (0.20, 3.95), (0.20, 4.12), (0.20, 4.35), (0, 4.35)], n), TL)   # rings along the exposed run: the AO bake is per vertex
    # ---- brass: mid ring, bracket boss, neck collar flaring into the lantern plate
    h.add(lathe([(0, 2.02), (0.36, 2.02), (0.40, 2.08), (0.40, 2.16), (0.36, 2.22), (0, 2.22)], n), BR)
    h.add(lathe([(0, 2.72), (0.24, 2.72), (0.31, 2.88), (0.34, 3.20), (0.31, 3.52), (0.24, 3.68), (0, 3.68)], n), BR)
    h.add(lathe([(0, 4.18), (0.30, 4.18), (0.40, 4.25), (0.40, 4.33), (0.32, 4.40), (0.46, 4.50), (0.60, 4.58), (0, 4.58)], n), BR)
    # ---- brass: two mirrored scroll brackets, an S-arm to the lantern plate and a volute curl beneath it
    arm = [(0.18, 3.55, 0), (0.55, 3.50, 0), (0.92, 3.66, 0), (1.04, 4.00, 0), (0.88, 4.30, 0), (0.66, 4.46, 0)]
    curl = [(0.18, 2.98, 0), (0.50, 2.78, 0), (0.82, 2.86, 0), (0.92, 3.10, 0), (0.78, 3.26, 0), (0.62, 3.18, 0), (0.64, 3.04, 0)]
    for side in (arm, mirrored(arm)):
        h.add(sweep(catmull(side, p["scroll_samples"]), taper((0, 0.09), (0.5, 0.075), (1, 0.06))), BR)
    for side in (curl, mirrored(curl)):
        path = catmull(side, p["scroll_samples"])
        h.add(sweep(path, taper((0, 0.085), (0.6, 0.06), (1, 0.075))), BR)
        h.add(ellipsoid(tuple(path[-1]), (0.105, 0.105, 0.105), 8, 5), BR)       # the scroll's terminal bead
    # ---- lantern: hexagonal plate, glass frustum, six corner ribs, top rim
    h.add(lathe([(0, 4.50), (0.78, 4.50), (0.90, 4.58), (0.90, 4.68), (0.82, 4.74), (0, 4.74)], 6), BR)
    h.add(lathe([(0, 4.70), (0.64, 4.70), (0.80, 5.48), (0, 5.48)], 6), GL)
    for k in range(6):
        a = math.radians(60 * k)
        pts = [Vector(((0.64 + 0.04) * math.cos(a), 4.72, (0.64 + 0.04) * math.sin(a))), Vector(((0.80 + 0.04) * math.cos(a), 5.46, (0.80 + 0.04) * math.sin(a)))]
        h.add(sweep(pts, taper((0, 0.05), (1, 0.05))), BR)
    h.add(lathe([(0, 5.44), (0.82, 5.44), (0.88, 5.50), (0.88, 5.58), (0.80, 5.64), (0, 5.64)], 6), BR)
    h.add(lathe([(0, 4.66), (0.22, 4.66), (0.22, 4.80), (0.12, 4.84), (0, 4.84)], 10), BR)           # burner cup under the flame
    # ---- teal: hexagonal ogee roof; brass: ball-and-spike finial
    h.add(lathe([(0, 5.60), (0.98, 5.60), (0.98, 5.68), (0.90, 5.74), (0.74, 5.90), (0.54, 6.06), (0.38, 6.18), (0.28, 6.26), (0.22, 6.30), (0, 6.30)], 6), TL)
    h.add(lathe([(0, 6.24), (0.09, 6.24), (0.09, 6.30), (0.15, 6.34), (0.17, 6.40), (0.14, 6.45), (0.07, 6.48), (0, p["height_cm"])], 10), BR)
    return h


def build_bulb():
    b = Part("LampPost_Bulb", ["Mat_WarmEmissive"])
    b.add(lathe([(0, 4.78), (0.10, 4.80), (0.22, 4.92), (0.28, 5.08), (0.24, 5.24), (0.14, 5.36), (0.06, 5.42), (0, 5.44)], 10), "Mat_WarmEmissive")
    return b


def build(entry: dict, params: dict):
    housing, bulb = build_housing(params), build_bulb()
    wu.log(f"lamp_post shells: housing {housing.stats()} bulb {bulb.stats()}")
    root = housing.to_object(CREASE_DEG)
    root["wu"] = dict(id=entry["id"], family=FAMILY, heightM=params["height_cm"] / 100.0)
    core = bulb.to_object(CREASE_DEG)
    core.parent = root
    return [root, core], dict(origin=("centre", "min", "centre"), closed=True)


# Generator parameters keyed by asset id (GUIDELINES 4.4). height_cm = 6.5: 3.1 m at 1:48 (TOCKTON_DIMENSIONS section 7); it is the
# finial tip and must equal the manifest approxDimensionsM[1] x 100.
PARAMS = {"lamp_post": dict(height_cm=6.5, n_round=12, scroll_samples=3)}

if __name__ == "__main__":
    raise SystemExit("gen_lamp_post.py is a forge family. Run blender/scripts/forge.py --family environment --only lamp_post --out-root <dir>")
