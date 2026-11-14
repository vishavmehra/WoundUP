"""gen_tockton_environment.py - the Tockton environment family (forge family 'environment'): the velvet stand and the town ground.

Not run directly. The family runner builds it:

    "$B" --background --factory-startup --python-exit-code 1 --python blender/scripts/forge.py -- \
         --family environment --only town_ground,tockton_base_round --out-root <dir> --owner World [--manifest <file>]

tockton_base_round  The velvet stand, resized by TOCKTON_DIMENSIONS section 9 (ADR-042): a rounded-rectangle plinth 0.64 x 0.045 x 0.59 m
                    (the id stays, it no longer describes a round stand). Origin at the centre of the BOTTOM face; the velvet top is
                    the highest surface, y = 0.045 = the stage root, so the lead places the node at (0, -0.045, +0.125) m under the
                    stage root and the town stands on the velvet with no air gap. Same storybook look as the M0 round stand: walnut
                    moulding, brass band, twelve brass studs, a brass bead and a velvet cushion with a rounded shoulder (M0 sank the
                    velvet 4 mm below a walnut lip; that recess would leave the town floating, so the lip is gone). Mat_Walnut /
                    Mat_AgedBrass / Mat_VelvetTeal constant proxies, metric UVs, baked vertex AO, no images. Shells overlap (studs).
town_ground         The Tockton ground, 60 x 30 cm (docs/TOCKTON_DIMENSIONS.md option A): a thin walnut board 3 mm high, a low stone
                    kerb round its edge, hand-laid pavers on the street, the central aisle and the front kerb, and four plots (Clock
                    Tower, Music Box, Carousel, Windmill) as stone-block foundations with a pale painted floor, 6 mm high. Plot
                    centres and sizes are TOCKTON_DIMENSIONS section 3.3. Each plot carries SOCKET_Plot<Name> (the placement point,
                    +Y mating axis) and COL_Plot<Name> (a box over the pad).
                    Light build (ADR-034 pressure, GLBs before Enter): every paver, block and board is an open-bottomed frustum standing
                    on the board (no hidden under-floor faces), its skirt faces smooth-shaded and sharing vertices (12 vertices where a
                    bevelled box took 40), UVs projected from above so no seam splits a vertex on export. The street and plot meshes
                    are therefore not watertight (closed = false): every open edge lies on the board.

Model space (glTF Y-up): origin at the centre of the floor-contact face (stand: bottom face). Everything is built in cm and scaled to
metres by the kit.
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
from lib import empties, materials, uvmetric
from gen_town_kit import (Part, TO_BLENDER, apply_weighted_normals, lathe, open_edges, prism, rounded_rect, to_m, xf)

FAMILY = "environment"

# ======================================================================================
# tockton_base_round
# ======================================================================================
W_, B_, V_ = 0, 1, 2      # slots of Part(["Mat_Walnut", "Mat_AgedBrass", "Mat_VelvetTeal"])


def plinth_profile(H=4.5):
    """Cross-section of the stand [(inset d from the outer wall, y)] bottom to top, and a material slot per segment (cm).
    The lower moulding is the M0 stand's (foot, cove, brass band, upper moulding); the top is a velvet cushion at y = H with a
    rounded shoulder and a brass bead, so the velvet is the highest surface and sits exactly at the stage root."""
    pts, mat = [(0.32, 0.0)], []

    def seg(d, y, m):
        pts.append((float(d), float(y)))
        mat.append(m)

    def arc(cd, cy, rad, a0, a1, n, m):      # centre (cd, cy) in (inset, y); angle as in the M0 round profile (r = R - d)
        for i in range(1, n + 1):
            a = math.radians(a0 + (a1 - a0) * i / n)
            seg(cd - rad * math.cos(a), cy + rad * math.sin(a), m)

    seg(0.0, 0.32, W_)
    seg(0.0, 0.62, W_)
    arc(0.20, 0.62, 0.20, 0, 90, 3, W_)
    seg(0.85, 0.82, W_)
    arc(0.85, 1.82, 1.00, -90, -180, 6, W_)
    seg(1.85, 2.15, W_)
    seg(1.65, 2.15, B_)                      # brass band
    seg(1.60, 2.20, B_)
    seg(1.60, 2.40, B_)
    seg(1.65, 2.45, B_)
    seg(1.85, 2.45, B_)
    seg(1.85, 2.68, W_)
    seg(0.85, 2.68, W_)
    seg(0.42, 2.92, W_)                      # upper moulding: the studs stand on this wall
    seg(0.42, H - 0.88, W_)
    seg(0.34, H - 0.84, B_)                  # brass bead between the walnut and the velvet
    seg(0.34, H - 0.58, B_)
    seg(0.42, H - 0.54, B_)
    seg(0.42, H - 0.30, V_)                  # velvet flank and its rounded shoulder
    arc(0.72, H - 0.30, 0.30, 0, 90, 3, V_)
    return pts, mat


def sweep_rounded_rect(prof, mats, hx, hz, rc, n):
    """Closed solid: the profile swept round a rounded rectangle (half sizes hx, hz, corner radius rc), bottom and top closed by a fan
    to a centre vertex. Ring points correspond 1:1 (an inset ring keeps the corner centres), so a profile inset d is rounded_rect(hx - d,
    hz - d, rc - d)."""
    bm = bmesh.new()
    rings = [[bm.verts.new((x, y, z)) for x, z in rounded_rect(hx - d, hz - d, rc - d, n)] for d, y in prof]
    m = len(rings[0])
    for i in range(len(prof) - 1):
        for j in range(m):
            bm.faces.new([rings[i][j], rings[i][(j + 1) % m], rings[i + 1][(j + 1) % m], rings[i + 1][j]]).material_index = mats[i]
    for ring, (d, y), slot, up in ((rings[0], prof[0], W_, False), (rings[-1], prof[-1], V_, True)):
        pole = bm.verts.new((0.0, y, 0.0))
        for j in range(m):
            vs = [pole, ring[j], ring[(j + 1) % m]] if up else [pole, ring[(j + 1) % m], ring[j]]
            bm.faces.new(vs).material_index = slot
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def stud(x, z, nx, nz, y_c, a=0.22, h=0.13, skirt=0.06, n=10):
    """A domed brass stud on a vertical wall: its base ring at (x, z) (cm) just inside the wall, standing out along the horizontal
    outward normal (nx, nz)."""
    rs = (a * a + h * h) / (2 * h)
    phi_b = math.asin(min(1.0, a / rs))
    prof = [(0.0, -skirt), (a, -skirt), (a, 0.0)]
    for f in (0.75, 0.40):
        phi = phi_b * f
        prof.append((rs * math.sin(phi), rs * (math.cos(phi) - math.cos(phi_b))))
    prof.append((0.0, h))
    bm = lathe(prof, n)
    t_, r_, u_ = Vector((-nz, 0.0, nx)), Vector((nx, 0.0, nz)), Vector((0.0, 1.0, 0.0))
    M = Matrix(((t_.x, r_.x, u_.x, 0), (t_.y, r_.y, u_.y, 0), (t_.z, r_.z, u_.z, 0), (0, 0, 0, 1)))
    xf(bm, M)
    xf(bm, Matrix.Translation(Vector((x, y_c, z))))
    return bm


def stud_sites(hx, hz, rc, d):
    """Twelve studs on the wall at inset d: one at the middle of each corner arc and two on every straight run."""
    out = []
    s = math.sqrt(0.5)
    for sx in (1, -1):
        for sz in (1, -1):
            out.append((sx * (hx - rc) + sx * s * (rc - d), sz * (hz - rc) + sz * s * (rc - d), sx * s, sz * s))
    for sg in (1, -1):
        for k in (-0.5, 0.5):
            out.append((sg * (hx - d), k * (hz - rc), float(sg), 0.0))      # the two end walls (x = +-hx)
            out.append((k * (hx - rc), sg * (hz - d), 0.0, float(sg)))      # the front and back walls
    return out


def build_stand(entry, p):
    part = Part(entry["meshes"][0], ["Mat_Walnut", "Mat_AgedBrass", "Mat_VelvetTeal"])
    hx, hz, H, rc = p["width"] * 50.0, p["depth"] * 50.0, p["height"] * 100.0, p["corner"] * 100.0
    prof, mats = plinth_profile(H)
    part.add(sweep_rounded_rect(prof, mats, hx, hz, rc, p["corner_segs"]))
    y_stud = 0.5 * (2.92 + H - 0.88)
    for x, z, nx, nz in stud_sites(hx, hz, rc, 0.42 + 0.02):
        part.add(stud(x, z, nx, nz, y_stud), "Mat_AgedBrass")
    obj = part.to_object(crisp_deg=40.0)
    obj["wu"] = dict(id=entry["id"], family=FAMILY, sizeM=[p["width"], p["depth"]], heightM=p["height"], velvetTopM=p["height"])
    return [obj], dict(origin=("centre", "min", "centre"), closed=True)


# ======================================================================================
# town_ground
# ======================================================================================
# TOCKTON_DIMENSIONS section 3.3, town space, centimetres, s = 1: (name, plot id, machine asset, cx, cz, width x, depth z, round)
# (the Windmill pad is the mill-room base, 10.5 x 14.06 at z +6.47: section 13 item 1, 2026-11-14)
PLOTS = [
    ("PlotClockTower", "plot_clock_tower", "clock_tower_base", -24.25, 8.25, 10.5, 10.5, False),
    ("PlotMusicBox", "plot_music_box", "music_box_case", -11.00, 8.00, 14.0, 11.0, False),
    ("PlotCarousel", "plot_carousel", "carousel_base", 11.00, 6.50, 14.0, 14.0, True),
    ("PlotWindmill", "plot_windmill", "windmill_base", 24.25, 6.47, 10.5, 14.06, False),
]
HX, HZ = 30.0, 15.0           # the ground, 60 x 30 cm
SLAB_H = 0.30                 # the walnut board
KERB_H = 0.46                 # the stone kerb round the edge
PAVER_TOP = 0.42              # street pavers
PAD_TOP = 0.60                # pads, 6 mm (TOCKTON_DIMENSIONS 3.1)
PAVER_INS = 0.075             # horizontal run of a paver skirt = the old chamfer width
BLOCK_INS = 0.08              # foundation block batter
BOARD_INS = 0.04              # floor board skirt


def _area(poly):
    return 0.5 * sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1] for i in range(len(poly)))


def inset_poly(poly, d):
    """A convex polygon [(x, z)] (either winding) moved inwards by d: every edge line is offset and neighbours are intersected."""
    n, sg = len(poly), (1.0 if _area(poly) > 0 else -1.0)
    lines = []
    for i in range(n):
        (x0, z0), (x1, z1) = poly[i], poly[(i + 1) % n]
        L = math.hypot(x1 - x0, z1 - z0)
        ux, uz = (x1 - x0) / L, (z1 - z0) / L
        lines.append((x0 - uz * sg * d, z0 + ux * sg * d, ux, uz))
    out = []
    for i in range(n):
        px, pz, ux, uz = lines[i - 1]
        qx, qz, vx, vz = lines[i]
        t = ((qx - px) * vz - (qz - pz) * vx) / (ux * vz - uz * vx)
        out.append((px + ux * t, pz + uz * t))
    return out


def rect_poly(xc, zc, hw, hd, ang=0.0):
    """Rectangle of half sizes hw (x) and hd (z) turned `ang` degrees about its centre (the way Ry() turned the old boxes)."""
    c, s = math.cos(math.radians(ang)), math.sin(math.radians(ang))
    return [(xc + x * c + z * s, zc - x * s + z * c) for x, z in ((-hw, -hd), (hw, -hd), (hw, hd), (-hw, hd))]


def frustum(poly, y0, y1, ins):
    """A paver, block or board: the convex base polygon at y0 standing on the board, a top inset by `ins` at y1, n sloped skirt faces
    and NO bottom face (it would lie inside the board). Open shell, outward normals."""
    top = inset_poly(poly, ins)
    bm = bmesh.new()
    lo = [bm.verts.new((x, y0, z)) for x, z in poly]
    hi = [bm.verts.new((x, y1, z)) for x, z in top]
    n = len(poly)
    f_top = bm.faces.new(hi)
    for i in range(n):
        bm.faces.new([lo[i], lo[(i + 1) % n], hi[(i + 1) % n], hi[i]])
    bm.normal_update()
    if f_top.normal.y < 0:
        bmesh.ops.reverse_faces(bm, faces=list(bm.faces))
    return bm


def strip_rings(profile, ring_fn):
    """Open strip: the profile [(inset d, y)] swept along the rings ring_fn(d) -> [(x, z)] (same point count for every d). The first
    and last ring are left open. Outward normals: the horizontal top segment must face up."""
    bm = bmesh.new()
    rings = [[bm.verts.new((x, y, z)) for x, z in ring_fn(d)] for d, y in profile]
    m = len(rings[0])
    seg_faces = []
    for i in range(len(profile) - 1):
        seg_faces.append([bm.faces.new([rings[i][j], rings[i][(j + 1) % m], rings[i + 1][(j + 1) % m], rings[i + 1][j]]) for j in range(m)])
    bm.normal_update()
    top = next(i for i in range(len(profile) - 1) if profile[i][1] == profile[i + 1][1])
    if seg_faces[top][0].normal.y < 0:
        bmesh.ops.reverse_faces(bm, faces=list(bm.faces))
    return bm


def _mark_shading(bm, crisp_deg=25.0, smooth_skirts=True):
    """Smooth everywhere except where a (near) horizontal face meets a face turned by >= crisp_deg: tops stay flat and crisp, the skirt
    faces of a paver blend into each other and share vertices on export. smooth_skirts False: every edge turned by >= crisp_deg is crisp
    (the foundation blocks and floor boards keep sharp corners, 20 vertices each)."""
    bm.normal_update()
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        if len(e.link_faces) != 2:
            continue
        a, b = e.link_faces
        flat = abs(a.normal.y) > 0.95 or abs(b.normal.y) > 0.95
        e.smooth = not ((flat or not smooth_skirts) and e.calc_face_angle(0.0) >= math.radians(crisp_deg))


def _planar_uv(obj, tile_m=uvmetric.TILE_M):
    """Metric UVs projected straight down (u = x, v = y of the Blender object, 0.1 m per UV unit): identical to the box projection on every
    top face, and continuous across the smooth skirts, so no seam splits a vertex on export."""
    me = obj.data
    for uvl in list(me.uv_layers):
        me.uv_layers.remove(uvl)
    uvl = me.uv_layers.new(name=uvmetric.UV_NAME)
    co = np.empty(len(me.vertices) * 3, np.float64)
    me.vertices.foreach_get("co", co)
    vi = np.empty(len(me.loops), np.int64)
    me.loops.foreach_get("vertex_index", vi)
    uvl.data.foreach_set("uv", (co.reshape(-1, 3)[vi][:, :2] / tile_m).astype(np.float32).ravel())
    me.update()


class FlatPart(Part):
    """Part for open frustum shells: the pipeline of Part.to_object with the shading rule and the UV projection above."""

    def __init__(self, name, mats, smooth_skirts=True):
        super().__init__(name, mats)
        self.smooth_skirts = smooth_skirts

    def to_object(self, crisp_deg=25.0):
        bm = self.bm
        bm.normal_update()
        ng = [f for f in bm.faces if len(f.verts) > 4]
        if ng:
            bmesh.ops.triangulate(bm, faces=ng, quad_method="BEAUTY", ngon_method="EAR_CLIP")
        _mark_shading(bm, crisp_deg, self.smooth_skirts)
        used = sorted({f.material_index for f in bm.faces})
        slot = {u: i for i, u in enumerate(used)}
        for f in bm.faces:
            f.material_index = slot[f.material_index]
        bmesh.ops.transform(bm, matrix=TO_BLENDER, verts=bm.verts)
        me = bpy.data.meshes.new(self.name)
        bm.to_mesh(me)
        bm.free()
        for u in used:
            me.materials.append(materials.make_proxy(self.mats[u]))
        obj = wu.link_object(self.name, me)
        apply_weighted_normals(obj)
        _planar_uv(obj)
        return obj


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
    avoid: rects (x0, x1, z0, z1) and circles ("c", cx, cz, r) a paver must not touch. The random draws are those of the box version,
    so the layout is the one the town already had."""
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
            ang = rng.uniform(-2.2, 2.2)
            part.add(frustum(rect_poly((xa + xb) / 2, zc, (xb - xa - gap) / 2, (rd - gap) / 2, ang), SLAB_H, top, PAVER_INS), "Mat_Stone")
            n += 1
    return n


def kerb_ring(part):
    """The low stone kerb round the board: outer wall, 45 degree chamfers, a flat top 5 mm wide, inner wall (open at the board)."""
    prof = [(0.0, SLAB_H), (0.0, KERB_H - 0.06), (0.06, KERB_H), (0.56, KERB_H), (0.62, KERB_H - 0.06), (0.62, SLAB_H)]
    part.add(strip_rings(prof, lambda d: rounded_rect(HX - 0.08 - d, HZ - 0.08 - d, 1.12 - d, 6)), "Mat_Stone")


def block_ring_rect(part, rng, cx, cz, w, d, t=0.70):
    """Foundation ring of laid stone blocks round a rectangular pad (corners belong to the long sides)."""

    def block(xc, zc, bw, bd, top):
        part.add(frustum(rect_poly(xc, zc, bw / 2, bd / 2), SLAB_H, top, BLOCK_INS), "Mat_Stone")

    def blocks(x0, x1, zc, depth):          # a run along x
        nb = max(2, int(round((x1 - x0) / 1.35)))
        L = (x1 - x0) / nb
        for i in range(nb):
            top = PAD_TOP - (rng.uniform(0.0, 0.035) if (i + int(zc * 7)) % 3 else 0.0)
            block(x0 + L * (i + 0.5), zc, L - 0.10, depth - 0.05, top)

    def blocks_z(z0, z1, xc, width):        # a run along z
        nb = max(2, int(round((z1 - z0) / 1.35)))
        L = (z1 - z0) / nb
        for i in range(nb):
            top = PAD_TOP - (rng.uniform(0.0, 0.035) if (i + int(xc * 7)) % 3 else 0.0)
            block(xc, z0 + L * (i + 0.5), width - 0.05, L - 0.10, top)

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
        poly = [(cx + ro * math.cos(a), cz + ro * math.sin(a)) for a in np.linspace(a0, a1, 3)] + \
               [(cx + ri * math.cos(a), cz + ri * math.sin(a)) for a in np.linspace(a1, a0, 3)]
        top = PAD_TOP - (rng.uniform(0.0, 0.035) if i % 3 else 0.0)
        part.add(frustum(poly, SLAB_H, top, BLOCK_INS), "Mat_Stone")
    return ri


def build_town_ground(entry, p):
    rng = np.random.default_rng(p["seed"])
    slab = Part("TownGround_Slab", ["Mat_Walnut"])
    slab.add(prism(rounded_rect(HX, HZ, 1.2, 6), "xz", 0.0, SLAB_H, bev=0.075), "Mat_Walnut")
    street = FlatPart("TownGround_Street", ["Mat_Stone"])
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
    plot = FlatPart("TownGround_Plot", ["Mat_Stone", "Mat_PaintedWood"], smooth_skirts=False)
    y_b = PAD_TOP - 0.03
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
            else:
                poly = rect_poly((xa + xb) / 2, (z0 + z1) / 2, (xb - xa) / 2, (z1 - z0) / 2)
            plot.add(frustum(poly, SLAB_H, y_b, BOARD_INS), "Mat_PaintedWood")
    wu.log(f"town_ground: {n_pav} pavers; open edges of the board = {open_edges(slab.bm)} (street and plot shells are open on purpose)")
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
    return [root] + kids + helpers, dict(origin=("centre", "min", "centre"), closed=False)


PARAMS = {
    "tockton_base_round": dict(width=0.64, depth=0.59, height=0.045, corner=0.05, corner_segs=8),
    "town_ground": dict(seed=11),
}


def build(entry: dict, params: dict):
    return {"tockton_base_round": build_stand, "town_ground": build_town_ground}[entry["id"]](entry, params)


if __name__ == "__main__":
    raise SystemExit("gen_tockton_environment.py is a forge family. Run blender/scripts/forge.py --family environment --only <ids> --out-root <dir>")
