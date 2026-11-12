"""gen_tockton_environment.py - the Tockton environment family (forge family 'environment'): the velvet stand and the town ground.

Not run directly. The family runner builds it:

    "$B" --background --factory-startup --python-exit-code 1 --python blender/scripts/forge.py -- \
         --family environment --only town_ground,tockton_base_round --out-root <dir> --owner World [--manifest <file>]

tockton_base_round  Library-profile rework of the M0 stand: the SAME profile, 0.46 m across, 0.045 m high, velvet top at
                    y = 0.041 (docs: blender/README.md), but Mat_Walnut / Mat_AgedBrass / Mat_VelvetTeal constant proxies, metric
                    UVs, baked vertex AO and no embedded images. The profile and the eight brass studs are the M0 design; the
                    shells overlap (studs are embedded) instead of being boolean-unioned.
town_ground         The Tockton ground, 60 x 30 cm (docs/TOCKTON_DIMENSIONS.md option A, working values pending owner approval):
                    a thin walnut board 3 mm high, a low stone kerb round its edge, hand-laid pavers on the street, the central
                    aisle and the front kerb, and four plots (Clock Tower, Music Box, Carousel, Windmill) as stone-block
                    foundations with a pale painted floor, 6 mm high. Plot centres and sizes are TOCKTON_DIMENSIONS section 3.3.
                    Each plot carries SOCKET_Plot<Name> (the placement point, +Y mating axis) and COL_Plot<Name> (a box over the pad).

Model space (glTF Y-up): origin at the centre of the floor-contact face. Everything is built in cm and scaled to metres by the kit.
"""
from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np

import bmesh
import bpy
from mathutils import Matrix, Vector

import wu_common as wu
from lib import empties
from gen_town_kit import (Part, T, Ry, box, circle_pts, boolean, lathe, open_edges, prism, rounded_rect, to_m, xf)

FAMILY = "environment"

# ======================================================================================
# tockton_base_round
# ======================================================================================
W_, B_, V_ = 0, 1, 2      # slots of Part(["Mat_Walnut", "Mat_AgedBrass", "Mat_VelvetTeal"])


def stand_profile(R=23.0, H=4.5, r_in=20.0, recess=0.4):
    """The M0 profile (gen_tockton_base.build_profile) in cm: foot -> cove -> brass band -> upper moulding -> top lip -> recessed
    velvet floor with a flush brass inlay. Returns [(r, y)], [material per segment]."""
    yf = H - recess
    pts, mat = [(0.0, 0.0)], []

    def seg(r, y, m):
        pts.append((float(r), float(y)))
        mat.append(m)

    def arc(cx, cy, rad, a0, a1, n, m):
        for i in range(1, n + 1):
            a = math.radians(a0 + (a1 - a0) * i / n)
            seg(cx + rad * math.cos(a), cy + rad * math.sin(a), m)

    r_o = r_in - 0.75
    r_c = r_o - 0.30
    r_i = r_o - 0.60
    seg(R - 0.32, 0.0, W_)
    seg(R, 0.32, W_)
    seg(R, 0.62, W_)
    arc(R - 0.20, 0.62, 0.20, 0, 90, 3, W_)
    seg(R - 0.85, 0.82, W_)
    arc(R - 0.85, 1.82, 1.00, -90, -180, 6, W_)
    seg(R - 1.85, 2.15, W_)
    seg(R - 1.65, 2.15, B_)
    seg(R - 1.60, 2.20, B_)
    seg(R - 1.60, 2.40, B_)
    seg(R - 1.65, 2.45, B_)
    seg(R - 1.85, 2.45, B_)
    seg(R - 1.85, 2.68, W_)
    seg(R - 0.85, 2.68, W_)
    seg(R - 0.42, 2.92, W_)
    seg(R - 0.42, 3.90, W_)
    arc(R - 1.02, 3.90, 0.60, 0, 90, 4, W_)
    seg(r_in + 0.16, H, W_)
    seg(r_in, H - 0.16, W_)
    seg(r_in, yf, W_)
    seg(r_o, yf, V_)
    seg(r_o, yf - 0.02, B_)
    seg(r_c, yf + 0.01, B_)
    seg(r_i, yf - 0.02, B_)
    seg(r_i, yf, B_)
    seg(0.0, yf, V_)
    return pts, mat


def revolve_mats(prof, mats, n):
    """Closed solid of revolution about y with a material index per profile segment (slots W_, B_, V_)."""
    bm = bmesh.new()
    rings = []
    for r, y in prof:
        if r < 1e-9:
            rings.append([bm.verts.new((0.0, y, 0.0))])
        else:
            rings.append([bm.verts.new((r * math.cos(2 * math.pi * j / n), y, r * math.sin(2 * math.pi * j / n))) for j in range(n)])
    for i in range(len(prof) - 1):
        a, b = rings[i], rings[i + 1]
        for j in range(n):
            j2 = (j + 1) % n
            if len(a) == 1:
                vs = [a[0], b[j2], b[j]]
            elif len(b) == 1:
                vs = [a[j], a[j2], b[0]]
            else:
                vs = [a[j], a[j2], b[j2], b[j]]
            bm.faces.new(vs).material_index = mats[i]
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def stud(theta_deg, r_wall, y_c, a=0.22, h=0.13, skirt=0.06, n=12):
    """A domed brass stud standing on the vertical moulding face at angle theta (cm). The base ring sits inside the wall."""
    rs = (a * a + h * h) / (2 * h)
    phi_b = math.asin(min(1.0, a / rs))
    prof = [(0.0, -skirt), (a, -skirt), (a, 0.0)]
    for f in (0.75, 0.40):
        phi = phi_b * f
        prof.append((rs * math.sin(phi), rs * (math.cos(phi) - math.cos(phi_b))))
    prof.append((0.0, h))
    bm = lathe(prof, n)
    th = math.radians(theta_deg)
    t_ = Vector((-math.sin(th), 0.0, math.cos(th)))
    r_ = Vector((math.cos(th), 0.0, math.sin(th)))
    u_ = Vector((0.0, 1.0, 0.0))
    M = Matrix(((t_.x, r_.x, u_.x, 0), (t_.y, r_.y, u_.y, 0), (t_.z, r_.z, u_.z, 0), (0, 0, 0, 1)))
    xf(bm, M)
    xf(bm, Matrix.Translation(r_ * r_wall + u_ * y_c))
    return bm


def build_stand(entry, p):
    part = Part(entry["meshes"][0], ["Mat_Walnut", "Mat_AgedBrass", "Mat_VelvetTeal"])
    prof, mats = stand_profile(R=p["diameter"] * 50.0, H=p["height"] * 100.0, r_in=(p["diameter"] - 0.06) * 50.0)
    part.add(revolve_mats(prof, mats, p["segments"]))
    R = p["diameter"] * 50.0
    for k in range(p["studs"]):
        part.add(stud(360.0 * k / p["studs"] + 22.5, R - 0.42 - 0.02, 0.5 * (2.92 + 3.90)), "Mat_AgedBrass")
    obj = part.to_object(crisp_deg=40.0)
    obj["wu"] = dict(id=entry["id"], family=FAMILY, diameterM=p["diameter"], heightM=p["height"], velvetTopM=round(p["height"] - 0.004, 4))
    return [obj], dict(origin=("centre", "min", "centre"), closed=True)


# ======================================================================================
# town_ground
# ======================================================================================
# TOCKTON_DIMENSIONS section 3.3, town space, centimetres, s = 1: (name, plot id, machine asset, cx, cz, width x, depth z, round)
PLOTS = [
    ("PlotClockTower", "plot_clock_tower", "clock_tower_base", -24.25, 8.25, 10.5, 10.5, False),
    ("PlotMusicBox", "plot_music_box", "music_box_case", -11.00, 8.00, 14.0, 11.0, False),
    ("PlotCarousel", "plot_carousel", "carousel_base", 11.00, 6.50, 14.0, 14.0, True),
    ("PlotWindmill", "plot_windmill", "windmill_base", 24.25, 8.25, 10.5, 10.5, False),
]
HX, HZ = 30.0, 15.0           # the ground, 60 x 30 cm
SLAB_H = 0.30                 # the walnut board
KERB_H = 0.46                 # the stone kerb round the edge
PAVER_TOP = 0.42              # street pavers
PAD_TOP = 0.60                # pads, 6 mm (TOCKTON_DIMENSIONS 3.1)
SINK = 0.10                   # every shell stands this far inside the one below it (no coplanar faces, no gaps)


def _hits(rect, avoid):
    x0, x1, z0, z1 = rect
    for a in avoid:
        if a[0] == "c":                                        # ("c", cx, cz, r) circle
            nx, nz = min(max(a[1], x0), x1), min(max(a[2], z0), z1)
            if math.hypot(nx - a[1], nz - a[2]) < a[3]:
                return True
        elif x0 < a[1] and x1 > a[0] and z0 < a[3] and z1 > a[2]:   # (x0, x1, z0, z1)
            return True
    return False


def paver_rows(part, rng, rect, w=1.45, d=0.95, gap=0.14, top_h=PAVER_TOP, avoid=()):
    """Hand-laid pavers in staggered rows filling `rect` = (x0, x1, z0, z1): slightly different widths, tiny turns, tops a little uneven.
    avoid: rects (x0, x1, z0, z1) and circles ("c", cx, cz, r) a paver must not touch."""
    x0, x1, z0, z1 = rect
    nrows = max(1, int(round((z1 - z0) / d)))
    rd = (z1 - z0) / nrows
    n = 0
    for r in range(nrows):
        zc = z0 + rd * (r + 0.5)
        x = x0
        if r % 2:
            x -= w * rng.uniform(0.35, 0.65)
        while x < x1 - 0.25:
            wi = w * rng.uniform(0.82, 1.18)
            if x + wi > x1 - 0.4 * w:
                wi = x1 - x
            xa, xb = max(x, x0), min(x + wi, x1)
            x += wi
            if xb - xa < 0.45:
                continue
            if avoid and _hits((xa, xb, zc - rd / 2, zc + rd / 2), avoid):
                continue
            top = top_h + rng.uniform(-0.025, 0.02)
            y0 = SLAB_H - SINK
            sh = box((0, 0, 0), (xb - xa - gap, top - y0, rd - gap), bev=0.075, top_only=True)
            xf(sh, Ry(rng.uniform(-2.2, 2.2)), T((xa + xb) / 2, (y0 + top) / 2, zc))
            part.add(sh, "Mat_Stone")
            n += 1
    return n


def kerb_ring(part):
    outer = rounded_rect(HX - 0.08, HZ - 0.08, 1.12, 6)
    inner = rounded_rect(HX - 0.08 - 0.62, HZ - 0.08 - 0.62, 0.50, 6)
    ring = prism(outer, "xz", SLAB_H - SINK, KERB_H, bev=0.06, top_only=True)
    cut = prism(inner, "xz", 0.0, 1.0)
    part.add(boolean(ring, [cut]), "Mat_Stone")


def block_ring_rect(part, rng, cx, cz, w, d, t=0.70):
    """Foundation ring of laid stone blocks round a rectangular pad (corners belong to the long sides)."""
    n = 0

    def blocks(x0, x1, zc, depth):          # a run along x
        nb = max(2, int(round((x1 - x0) / 1.35)))
        L = (x1 - x0) / nb
        for i in range(nb):
            top = PAD_TOP - (rng.uniform(0.0, 0.035) if (i + int(zc * 7)) % 3 else 0.0)
            y0 = SLAB_H - SINK
            sh = box((0, 0, 0), (L - 0.10, top - y0, depth - 0.05), bev=0.06, top_only=True)
            xf(sh, T(x0 + L * (i + 0.5), (y0 + top) / 2, zc))
            part.add(sh, "Mat_Stone")

    def blocks_z(z0, z1, xc, width):        # a run along z
        nb = max(2, int(round((z1 - z0) / 1.35)))
        L = (z1 - z0) / nb
        for i in range(nb):
            top = PAD_TOP - (rng.uniform(0.0, 0.035) if (i + int(xc * 7)) % 3 else 0.0)
            y0 = SLAB_H - SINK
            sh = box((0, 0, 0), (width - 0.05, top - y0, L - 0.10), bev=0.06, top_only=True)
            xf(sh, T(xc, (y0 + top) / 2, z0 + L * (i + 0.5)))
            part.add(sh, "Mat_Stone")

    x0, x1, z0, z1 = cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2
    blocks(x0, x1, z0 + t / 2, t)
    blocks(x0, x1, z1 - t / 2, t)
    blocks_z(z0 + t, z1 - t, x0 + t / 2, t)
    blocks_z(z0 + t, z1 - t, x1 - t / 2, t)
    return (x0 + t, x1 - t, z0 + t, z1 - t)


def block_ring_round(part, rng, cx, cz, r, t=0.70):
    ro, ri = r, r - t
    n = max(12, int(round(2 * math.pi * (ro + ri) / 2 / 1.40)))
    da = 2 * math.pi / n
    gap_a = 0.10 / ((ro + ri) / 2)
    for i in range(n):
        a0, a1 = da * i + gap_a / 2, da * (i + 1) - gap_a / 2
        poly = [(ro * math.cos(a), ro * math.sin(a)) for a in np.linspace(a0, a1, 3)] + \
               [(ri * math.cos(a), ri * math.sin(a)) for a in np.linspace(a1, a0, 3)]
        top = PAD_TOP - (rng.uniform(0.0, 0.035) if i % 3 else 0.0)
        sh = prism(poly, "xz", SLAB_H - SINK, top, bev=0.06, top_only=True)
        xf(sh, T(cx, 0, cz))
        part.add(sh, "Mat_Stone")
    return ri


def build_town_ground(entry, p):
    rng = np.random.default_rng(p["seed"])
    slab = Part("TownGround_Slab", ["Mat_Walnut"])
    slab.add(prism(rounded_rect(HX, HZ, 1.2, 6), "xz", 0.0, SLAB_H, bev=0.075), "Mat_Walnut")
    street = Part("TownGround_Street", ["Mat_Stone"])
    kerb_ring(street)
    n_pav = 0
    ways = ((-29.35, 29.35, -4.5, -1.55),             # the street across the back of the plots
            (-3.9, 3.9, -1.40, 13.45),                # the central aisle
            (-29.35, 29.35, 13.60, 14.35))            # the front kerb, against the workbench
    for rect in ways:
        n_pav += paver_rows(street, rng, rect)
    # the rest of the ground: larger, lower flagstones round the plots and ways, so no board is left bare
    keep_out = [(a[0] - 0.30, a[1] + 0.30, a[2] - 0.30, a[3] + 0.30) for a in ways]
    for name, pid, machine, cx, cz, w, d, rnd in PLOTS:
        keep_out.append(("c", cx, cz, w / 2 + 0.35) if rnd else (cx - w / 2 - 0.35, cx + w / 2 + 0.35, cz - d / 2 - 0.35, cz + d / 2 + 0.35))
    n_pav += paver_rows(street, rng, (-29.35, 29.35, -14.35, 14.35), w=1.85, d=1.25, gap=0.16, top_h=0.385, avoid=keep_out)
    plot = Part("TownGround_Plot", ["Mat_Stone", "Mat_PaintedWood"])
    y_a, y_b = SLAB_H - SINK, PAD_TOP - 0.03
    for name, pid, machine, cx, cz, w, d, rnd in PLOTS:
        if rnd:
            ri = block_ring_round(plot, rng, cx, cz, w / 2) - 0.04
        else:
            x0, x1, z0, z1 = block_ring_rect(plot, rng, cx, cz, w, d)
            x0, x1, z0, z1 = x0 + 0.02, x1 - 0.02, z0 + 0.02, z1 - 0.02
        # floor boards 1.5 cm wide with a hairline between them, running along z
        if rnd:
            wx0, wx1 = cx - ri, cx + ri
        else:
            wx0, wx1 = x0, x1
        nb = max(3, int(round((wx1 - wx0) / 1.55)))
        bw = (wx1 - wx0) / nb
        for i in range(nb):
            xa, xb = wx0 + bw * i + 0.04, wx0 + bw * (i + 1) - 0.04
            if rnd:
                def zc_(xx):
                    return math.sqrt(max(ri * ri - (xx - cx) ** 2, 1e-4)) - 0.04
                xs = np.linspace(xa, xb, 3)
                poly = [(xx, cz + zc_(xx)) for xx in xs[::-1]] + [(xx, cz - zc_(xx)) for xx in xs]
                poly = [(a_, b_) for a_, b_ in poly]
                sh = prism(poly, "xz", y_a, y_b, bev=0.04, top_only=True)
            else:
                sh = box(((xa + xb) / 2, (y_a + y_b) / 2, (z0 + z1) / 2), (xb - xa, y_b - y_a, z1 - z0), bev=0.04, top_only=True)
            plot.add(sh, "Mat_PaintedWood")
    wu.log(f"town_ground: {n_pav} pavers; open edges slab/street/plot = {open_edges(slab.bm)}/{open_edges(street.bm)}/{open_edges(plot.bm)}")
    root = slab.to_object()
    root["wu"] = dict(id=entry["id"], family=FAMILY, plots=[pl[1] for pl in PLOTS], sizeM=[0.60, 0.30], padTopM=PAD_TOP * 0.01)
    kids = []
    for part in (street, plot):
        o = part.to_object()
        o.parent = root
        kids.append(o)
    helpers = []
    for name, pid, machine, cx, cz, w, d, rnd in PLOTS:
        helpers.append(empties.add_socket(root, name, to_m((cx, PAD_TOP, cz)), [machine], axis_g=(0.0, 1.0, 0.0), plot=pid))
        helpers.append(empties.add_collider(root, name, "box", (w * 0.005, 0.005, d * 0.005), to_m((cx, PAD_TOP + 0.5, cz))))
    return [root] + kids + helpers, dict(origin=("centre", "min", "centre"), closed=True)


PARAMS = {
    "tockton_base_round": dict(diameter=0.46, height=0.045, segments=72, studs=8),
    "town_ground": dict(seed=11),
}


def build(entry: dict, params: dict):
    return {"tockton_base_round": build_stand, "town_ground": build_town_ground}[entry["id"]](entry, params)


if __name__ == "__main__":
    raise SystemExit("gen_tockton_environment.py is a forge family. Run blender/scripts/forge.py --family environment --only <ids> --out-root <dir>")
