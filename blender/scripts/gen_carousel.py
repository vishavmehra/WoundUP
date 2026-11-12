"""gen_carousel.py - the carousel family: base, platform, column, canopy, horse, lamp (forge family, Machines agent).

Not run directly. Build with:

    "$B" --background --factory-startup --python-exit-code 1 --python blender/scripts/forge.py -- \
         --family carousel --only carousel_base,carousel_platform,... --out-root <dir> --owner Machines [--manifest <file>]

Sizes come from docs/TOCKTON_DIMENSIONS.md section 11 (owner-approved): the machine is 13.5 x 18 cm, base D 13.0 x 3.0, platform D 12.5
(poles 8.5 cm), open band 3.6 to 12.0, canopy 12.0 to 16.0 with finial and flag to 18.0. Machine coordinates (cm, +Y up, origin on the axis at
the floor): base 0 to 3.0, platform underside 3.0 (top 3.6), column bottom 3.0, upper ring 11.0 to 12.0 (column file y 8.4 to 9.0), canopy
frieze underside 12.0.

Axes (the lead's brief, not the manifest text): the platform rotates about its local +Y, the vertical axis, with its origin on the axis at its
underside; PIV_Platform carries wu.axis "+Y". CarouselColumn_UpperRing and the three poles belong to the rotating group (the ring is its own
node with its pivot on the same axis).

Everything is built in cm in glTF axes (+Y up, front = +Z) as chamfered, hand-modelled forms: surfaces of revolution, lofted tubes and
a scalloped shell. The result is rotated into Blender space and scaled to metres, exactly like gen_gear_spur.py. Angles `a` are measured
from the front (+Z) towards +X: pol(r, a) = (r sin a, r cos a).
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

FAMILY = "carousel"
S = 100.0
TAU = 2 * math.pi
CREAM, TEAL, WALNUT, BRASS, PAINT, GLOW = ("Mat_CreamEnamel", "Mat_TealPaint", "Mat_Walnut", "Mat_PolishedBrass",
                                           "Mat_PaintedWood", "Mat_WarmEmissive")


def pol(r, a):
    return r * math.sin(a), r * math.cos(a)


# ======================================================================================
# shell kit (cm). Every builder returns a closed, outward-oriented bmesh.
# ======================================================================================
def grid_shell(P, wrap_rows=False, wrap_cols=True, cap_rows=False, cap_cols=False, mat_fn=None, name="shell"):
    """Quad grid P[row, col] -> closed shell. Coincident points (axis, collapsed tips) are welded inside the grid only."""
    P = np.asarray(P, float)
    R, C = P.shape[:2]
    bm = bmesh.new()
    cache = {}

    def V(i, j):
        p = P[i, j]
        k = (round(float(p[0]), 5), round(float(p[1]), 5), round(float(p[2]), 5))
        if k not in cache:
            cache[k] = bm.verts.new((float(p[0]), float(p[1]), float(p[2])))
        return cache[k]

    def face(vs, mat=0):
        u = []
        for v in vs:
            if not u or u[-1] is not v:
                u.append(v)
        if len(u) > 1 and u[0] is u[-1]:
            u.pop()
        if len(u) < 3 or len(set(u)) < len(u):
            return
        try:
            bm.faces.new(u).material_index = mat
        except ValueError:
            pass

    for i in range(R if wrap_rows else R - 1):
        i2 = (i + 1) % R
        for j in range(C if wrap_cols else C - 1):
            j2 = (j + 1) % C
            face([V(i, j), V(i, j2), V(i2, j2), V(i2, j)], mat_fn(i, j) if mat_fn else 0)
    if cap_rows and not wrap_rows:
        face([V(0, j) for j in range(C)])
        face([V(R - 1, j) for j in range(C)])
    if cap_cols and not wrap_cols:
        face([V(i, 0) for i in range(R)])
        face([V(i, C - 1) for i in range(R)])
    return seal(bm, name)


def seal(bm, name):
    bm.verts.ensure_lookup_table()
    for v in [v for v in bm.verts if not v.link_faces]:
        bm.verts.remove(v)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bad = [e for e in bm.edges if len(e.link_faces) != 2]
    if bad:
        raise RuntimeError(f"{name}: {len(bad)} open or non-manifold edges")
    if signed_volume(bm) < 0:                    # recalc can orient a torus-like shell inside out: flip it (volume must be positive)
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    return bm


def signed_volume(bm):
    vol = 0.0
    for f in bm.faces:
        vs = [l.vert.co for l in f.loops]
        for i in range(1, len(vs) - 1):
            vol += vs[0].dot(vs[i].cross(vs[i + 1])) / 6.0
    return vol


def round_profile(pts, rad, segs=1, only=None):
    """Chamfer (segs=1) or round (segs>1, quadratic) the corners of a closed (r, y) polygon. Axis points (r=0) and straight runs stay."""
    pts = [np.array(p, float) for p in pts]
    if rad <= 0:
        return pts
    out = []
    n = len(pts)
    for i, p in enumerate(pts):
        a, b = pts[i - 1], pts[(i + 1) % n]
        u, v = a - p, b - p
        lu, lv = np.linalg.norm(u), np.linalg.norm(v)
        if p[0] < 1e-9 or lu < 1e-9 or lv < 1e-9 or abs(u[0] * v[1] - u[1] * v[0]) / (lu * lv) < 0.05 or (only and not only(i)):
            out.append(p)
            continue
        c = min(rad, 0.45 * lu, 0.45 * lv)
        p1, p2 = p + u / lu * c, p + v / lv * c
        for k in range(segs + 1):
            t = k / segs
            out.append((1 - t) ** 2 * p1 + 2 * (1 - t) * t * p + t * t * p2)
    return out


def subdivide(pts, maxseg):
    """Split long profile edges: vertex AO (COLOR_0) only resolves as finely as the vertices, and a vertex buried in a neighbouring shell
    bakes to 0, so a tall quad between two buried rows would render black."""
    out = []
    for i, a in enumerate(pts):
        a, b = np.asarray(a, float), np.asarray(pts[(i + 1) % len(pts)], float)
        out.append(a)
        L = float(np.linalg.norm(b - a))
        if L > maxseg and not (a[0] < 1e-9 and b[0] < 1e-9):
            k = int(math.ceil(L / maxseg))
            out.extend(a + (b - a) * t / k for t in range(1, k))
    return out


def lathe(profile, n=48, a0=0.0, a1=TAU, name="lathe", maxseg=0.45):
    """Closed (r, y) polygon revolved about +Y. A partial sweep (a0..a1) gets flat end caps."""
    full = abs((a1 - a0) - TAU) < 1e-9
    cols = n if full else n + 1
    prof = np.asarray(subdivide(profile, maxseg), float)
    ang = [a0 + (a1 - a0) * j / n for j in range(cols)]
    P = np.zeros((len(prof), cols, 3))
    for i, (r, y) in enumerate(prof):
        for j, a in enumerate(ang):
            P[i, j] = (r * math.sin(a), y, r * math.cos(a))
    return grid_shell(P, wrap_rows=True, wrap_cols=full, cap_cols=not full, name=name)


def ring_rect(r0, r1, y0, y1, rad=0.05, segs=1):
    return round_profile([(r0, y0), (r1, y0), (r1, y1), (r0, y1)], rad, segs)


def disc_rect(r1, y0, y1, rad=0.05, segs=1):
    return round_profile([(0, y0), (r1, y0), (r1, y1), (0, y1)], rad, segs)


def sphere_profile(r, yc, k=8, cut0=-90.0, cut1=90.0):
    return [(max(0.0, r * math.cos(math.radians(t))), yc + r * math.sin(math.radians(t)))
            for t in np.linspace(cut0, cut1, k + 1)]


def loft(path, rx, ry, sides=10, ref=(0, 1, 0), caps=True, closed=False, name="loft"):
    """Elliptical tube along a polyline: rx along side = tangent x ref, ry along up = side x tangent. caps -> rounded, welded tips."""
    P = [Vector(p) for p in path]
    n = len(P)
    T = [((P[(i + 1) % n] - P[i - 1]) if closed else (P[min(i + 1, n - 1)] - P[max(i - 1, 0)])).normalized() for i in range(n)]
    st = [(P[i], T[i], float(rx[i]), float(ry[i])) for i in range(n)]
    if caps and not closed:
        def ext(p, t, a, b, s):
            r = max(a, b)
            return [(p + s * t * r * 0.55, t, a * 0.86, b * 0.86), (p + s * t * r * 0.88, t, a * 0.52, b * 0.52), (p + s * t * r, t, 0.0, 0.0)]
        st = ext(*st[0], -1)[::-1] + st + ext(*st[-1], +1)
    rf = Vector(ref)
    G = np.zeros((len(st), sides, 3))
    for i, (p, t, a, b) in enumerate(st):
        side = t.cross(rf)
        if side.length < 1e-4:
            side = t.cross(Vector((1, 0, 0)) if abs(t.x) < 0.9 else Vector((0, 0, 1)))
        side.normalize()
        up = side.cross(t).normalized()
        for j in range(sides):
            f = TAU * j / sides
            G[i, j] = p + side * (a * math.cos(f)) + up * (b * math.sin(f))
    return grid_shell(G, wrap_rows=closed, wrap_cols=True, name=name)


def prism(poly_xz, y0, y1, name="prism"):
    n = len(poly_xz)
    P = np.array([[(x, y0, z) for x, z in poly_xz], [(x, y1, z) for x, z in poly_xz]])
    bm = grid_shell(P, wrap_rows=False, wrap_cols=True, cap_rows=True, name=name)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4], quad_method="BEAUTY", ngon_method="BEAUTY")
    return bm


def box(sx, sy, sz, name="box"):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = (v.co.x * sx, v.co.y * sy, v.co.z * sz)
    return seal(bm, name)


def bevel_convex(bm, width, min_angle_deg=40.0, segments=1):
    bm.edges.ensure_lookup_table()
    bm.normal_update()
    sel = [e for e in bm.edges if e.is_manifold and e.is_convex and e.calc_face_angle(0.0) >= math.radians(min_angle_deg)]
    bmesh.ops.bevel(bm, geom=sel, offset=width, offset_type="OFFSET", segments=segments, profile=0.5, affect="EDGES",
                    clamp_overlap=True, loop_slide=True)
    return seal(bm, "bevelled")


def xform(bm, M):
    bmesh.ops.transform(bm, matrix=M, verts=bm.verts)
    return bm


def radial(bm, r, a, y):
    """Place a part built with its axis on +Y and its base at the origin so that +Y points outwards (radially) at angle a."""
    x, z = pol(r, a)
    return xform(bm, Matrix.Translation((x, y, z)) @ Matrix.Rotation(a, 4, "Y") @ Matrix.Rotation(math.pi / 2, 4, "X"))


def at(bm, x, y, z, a=0.0):
    return xform(bm, Matrix.Translation((x, y, z)) @ Matrix.Rotation(a, 4, "Y"))


class Acc:
    """One output mesh: shells joined with a material index (None keeps the shell's own indices)."""

    def __init__(self, name, mats):
        self.name, self.mats, self.bm = name, list(mats), bmesh.new()

    def add(self, src, mat=0):
        vm = {v: self.bm.verts.new(v.co) for v in src.verts}
        for f in src.faces:
            nf = self.bm.faces.new([vm[v] for v in f.verts])
            if mat is not None:
                nf.material_index = mat
            else:
                nf.material_index = f.material_index
        src.free()
        return self


# ======================================================================================
# finish: shading, Blender space, materials, UVs
# ======================================================================================
def mark_shading(bm, crisp_deg=50.0):
    bm.normal_update()
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        if len(e.link_faces) == 2:
            e.smooth = e.calc_face_angle(0.0) < math.radians(crisp_deg)


def to_object(acc: Acc, parent=None):
    bm = acc.bm
    ng = [f for f in bm.faces if len(f.verts) > 4]
    if ng:
        bmesh.ops.triangulate(bm, faces=ng, quad_method="BEAUTY", ngon_method="BEAUTY")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mark_shading(bm)
    M = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1))) @ Matrix.Scale(1.0 / S, 4)
    bmesh.ops.transform(bm, matrix=M, verts=bm.verts)
    me = bpy.data.meshes.new(acc.name)
    bm.to_mesh(me)
    dbl = len(bmesh.ops.find_doubles(bm, verts=bm.verts, dist=1e-7)["targetmap"])
    bm.free()
    obj = wu.link_object(acc.name, me)
    wu.select_only(obj)
    md = obj.modifiers.new("wn", "WEIGHTED_NORMAL")
    md.keep_sharp, md.weight, md.mode = True, 100, "FACE_AREA"
    bpy.ops.object.modifier_apply(modifier=md.name)
    for m in acc.mats:
        obj.data.materials.append(materials.make_proxy(m))
    uvmetric.box_project(obj)
    if parent is not None:
        obj.parent = parent
    if dbl:
        wu.log(f"WARNING {acc.name}: {dbl} coincident vertices")
    return obj


def extents(acc: Acc):
    c = np.array([v.co[:] for v in acc.bm.verts])
    return c.min(0), c.max(0)


def log_ext(label, accs):
    lo = np.min([extents(a)[0] for a in accs], axis=0)
    hi = np.max([extents(a)[1] for a in accs], axis=0)
    wu.log(f"{label}: extent cm x {lo[0]:.3f}..{hi[0]:.3f} y {lo[1]:.3f}..{hi[1]:.3f} z {lo[2]:.3f}..{hi[2]:.3f}  size {hi[0]-lo[0]:.3f} x {hi[1]-lo[1]:.3f} x {hi[2]-lo[2]:.3f}")


def finish(entry, accs, extra_wu=None):
    names = [a.name for a in accs]
    assert sorted(names) == sorted(entry["meshes"]), (names, entry["meshes"])
    log_ext(entry["id"], accs)
    root = to_object(accs[0])
    root["wu"] = dict(id=entry["id"], family=FAMILY, **(extra_wu or {}))
    objs = [root] + [to_object(a, root) for a in accs[1:]]
    return root, objs


# ======================================================================================
# carousel_base  (D 13.0 x 3.0, origin: centre of the floor-contact face)
# ======================================================================================
def build_base(entry, P):
    n = P.get("n", 64)
    ring = Acc("CarouselBase_Ring", [WALNUT, BRASS])
    prof = [(0, .40), (6.10, .40), (6.45, .75), (6.45, .98), (6.28, 1.12), (6.28, 2.45), (6.50, 2.62), (6.50, 2.90), (6.32, 2.96),
            (5.90, 2.96), (5.90, .70), (0, .70)]
    ring.add(lathe(round_profile(prof, .10), n, name="ring"), 0)
    for (r0, r1, y0, y1) in ((6.30, 6.49, .80, .92), (6.20, 6.36, 1.14, 1.26), (6.20, 6.36, 2.34, 2.46), (5.95, 6.30, 2.90, 3.00), (.90, 1.80, .64, .90)):
        ring.add(lathe(ring_rect(r0, r1, y0, y1, .035), n, name="band"), 1)

    panel = Acc("CarouselBase_Panel", [TEAL, BRASS])
    half, bar = 0.506, 0.07
    for g in range(4):
        ac = math.radians(90 * g)
        panel.add(bevel_convex(lathe(ring_rect(6.20, 6.40, 1.30, 2.30, 0.0), 14, ac - half, ac + half, name="pf"), .035), 0)
        e = 0.006
        for (a0, a1, y0, y1) in ((ac - half - e, ac + half + e, 2.18, 2.32), (ac - half - e, ac + half + e, 1.28, 1.42),
                                 (ac + half - bar, ac + half + e, 1.28, 2.32), (ac - half - e, ac - half + bar, 1.28, 2.32)):
            side = y1 - y0 > 1.0
            panel.add(bevel_convex(lathe(ring_rect(6.21 if side else 6.22, 6.455 if side else 6.45, y0, y1, 0.0), 6, a0, a1, name="fr"), .03), 1)
        ros = lathe(round_profile([(0, 0), (.52, 0), (.52, .04), (.40, .07), (.2, .10), (0, .11)], .025), 20, name="ros")
        panel.add(radial(ros, 6.36, ac, 1.80), 1)

    foot = Acc("CarouselBase_Foot", [BRASS])
    fp = round_profile([(0, 0), (.40, 0), (.52, .12), (.52, .22), (.40, .34), (.25, .44), (0, .46)], .06, 2)
    for g in range(4):
        x, z = pol(5.2, math.radians(45 + 90 * g))
        foot.add(at(lathe(fp, 20, name="foot"), x, 0, z), 0)

    root, objs = finish(entry, [ring, panel, foot])
    objs.append(empties.add_collider(root, "Case", "box", (0.065, 0.015, 0.065), (0, 0.015, 0)))
    objs.append(empties.add_socket(root, "BaseHandle", (0, 0.0086, 0.0645), ["machine_base_handle"], axis_g=(0, 0, 1)))
    return objs, dict(origin=("centre", "min", "centre"), closed=True)


# ======================================================================================
# carousel_platform  (rotates about +Y; origin on the axis at the underside)
# ======================================================================================
def star_poly(ro, ri, k=8):
    return [pol(ro if i % 2 == 0 else ri, TAU * i / (2 * k)) for i in range(2 * k)]


def build_platform(entry, P):
    n = P.get("n", 72)
    disc = Acc("CarouselPlatform_Disc", [WALNUT, TEAL, CREAM, BRASS])
    disc.add(lathe(ring_rect(1.20, 6.15, 0.0, .50, .05), n, name="d0"), 0)
    disc.add(lathe(ring_rect(5.95, 6.25, .08, .60, .10, 2), n, name="rim"), 3)
    disc.add(lathe(ring_rect(.90, 1.75, 0.0, .78, .06), n, name="hub"), 3)
    disc.add(lathe(ring_rect(1.65, 5.25, .46, .58, .03), n, name="cream"), 2)
    disc.add(lathe(ring_rect(5.20, 5.98, .46, .54, .03), n, name="tealring"), 1)
    star = bevel_convex(prism(star_poly(4.6, 2.2), .56, .64, "star"), .025)
    disc.add(star, 1)

    pole = Acc("CarouselPlatform_Pole", [BRASS])
    pp = round_profile([(0, .50), (.34, .50), (.34, .72), (.22, .84), (.12, .84), (.12, 1.55), (.21, 1.60), (.21, 1.72), (.12, 1.77),
                        (.12, 7.50), (.21, 7.55), (.21, 7.67), (.12, 7.72), (.12, 9.00), (.15, 9.00), (.15, 9.10), (0, 9.10)], .03)
    for a in (math.pi, math.radians(60), math.radians(-60)):
        x, z = pol(4.2, a)
        pole.add(at(lathe(pp, 16, name="pole"), x, 0, z), 0)

    root, objs = finish(entry, [disc, pole], extra_wu=dict(rotationAxis="+Y", poleRadiusCm=4.2, poleAnglesDeg=[180, 60, -60], poleBaseY=0.006))
    objs.append(empties.add_pivot(root, "Platform", (0, 0, 0), (0, 1, 0), "rotation_axis", "+Y"))
    objs.append(empties.add_collider(root, "Case", "box", (0.0625, 0.0455, 0.0625), (0, 0.0455, 0)))
    return objs, dict(origin=("centre", "min", "centre"), closed=True, bake_ao=True)


# ======================================================================================
# carousel_column  (column D 1.6, upper ring D 12.5; origin: floor-contact centre; machine y 3.0 to 12.0)
# ======================================================================================
def build_column(entry, P):
    n = P.get("n", 48)
    col = Acc("CarouselColumn_Column", [TEAL, BRASS, WALNUT])
    col.add(lathe(round_profile([(0, 0), (.80, 0), (.80, 8.35), (0, 8.35)], .04), n, name="shaft"), 0)
    col.add(lathe(ring_rect(.55, .87, .08, .52, .04), n, name="bearing"), 1)
    col.add(lathe(round_profile([(.60, .88), (1.35, .88), (1.35, 1.12), (1.0, 1.30), (.60, 1.30)], .05), n, name="collar"), 1)
    col.add(lathe(ring_rect(.60, .98, 4.15, 4.40, .05), n, name="midband"), 1)
    col.add(lathe(ring_rect(.60, .98, 2.20, 2.38, .04), n, name="b1"), 1)
    col.add(lathe(ring_rect(.60, .98, 6.20, 6.38, .04), n, name="b2"), 1)
    col.add(lathe(round_profile([(.60, 7.40), (1.05, 7.40), (1.10, 7.65), (1.45, 7.95), (1.55, 8.32), (.60, 8.32)], .05), n, name="capital"), 1)
    col.add(lathe(ring_rect(.55, 1.12, 5.05, 5.30, .05), n, name="swell"), 2)

    ur = Acc("CarouselColumn_UpperRing", [BRASS, TEAL])
    ur.add(lathe(round_profile([(0, 8.42), (1.75, 8.42), (1.75, 9.00), (0, 9.00)], .08), n, name="hub"), 0)
    ur.add(lathe(ring_rect(5.55, 6.25, 8.42, 9.00, .10, 2), 96, name="ring"), 0)
    for g in range(6):
        a = math.radians(60 * g)
        sp = bevel_convex(box(.44, .50, 4.0, "spoke"), .06)
        ur.add(xform(sp, Matrix.Rotation(a, 4, "Y") @ Matrix.Translation((0, 8.74, 3.75))), 1)
    for a in (math.pi, math.radians(60), math.radians(-60)):
        x, z = pol(4.2, a)
        ur.add(at(lathe(round_profile([(.14, 8.30), (.34, 8.30), (.34, 8.46), (.14, 8.46)], .04), 16, name="cup"), x, 0, z), 0)

    root, objs = finish(entry, [col, ur], extra_wu=dict(upperRingRotatesWithPlatform=True))
    return objs, dict(origin=("centre", "min", "centre"), closed=True)


# ======================================================================================
# carousel_canopy  (origin: central axis at the underside of the frieze ring; machine y 12.0 to 18.0)
# ======================================================================================
K_GORES, M_COLS = 6, 10
R_HEM, Y_RIM, Y_APEX, DROP, THICK = 6.75, 1.75, 4.00, 0.70, 0.09


def roof_y(r):
    return Y_RIM + (Y_APEX - Y_RIM) * (1 - (r / R_HEM) ** 1.8)


def hem_drop(j):
    x = 2 * ((j % M_COLS) / M_COLS) - 1
    return DROP * math.sqrt(max(0.0, 1 - x * x))


def roof_shell(ns=8):
    C = K_GORES * M_COLS
    prof = [(R_HEM * i / ns, roof_y(R_HEM * i / ns)) for i in range(ns + 1)]
    out, inn = [], []
    for i, (r, y) in enumerate(prof):
        dr = prof[min(i + 1, ns)][0] - prof[max(i - 1, 0)][0]
        dy = prof[min(i + 1, ns)][1] - prof[max(i - 1, 0)][1]
        nl = math.hypot(dr, dy)
        nr, ny = (-dy / nl, dr / nl) if i else (0.0, 1.0)
        out.append([(r, y, j) for j in range(C)])
        inn.append([(r - THICK * nr, y - THICK * ny, j) for j in range(C)])
    for s in (0.5, 1.0):
        out.append([(R_HEM, Y_RIM - s * hem_drop(j), j) for j in range(C)])
        inn.append([(R_HEM - THICK, Y_RIM - s * hem_drop(j), j) for j in range(C)])

    def pts(rows):
        return [[(r * math.sin(TAU * j / C), y, r * math.cos(TAU * j / C)) for (r, y, j) in row] for row in rows]
    Pall = np.array(pts(out) + pts(inn)[::-1])
    H = len(out)
    return grid_shell(Pall, wrap_rows=True, wrap_cols=True, mat_fn=lambda i, j: (1 if (j // M_COLS) % 2 == 0 else 0) if i < H - 1 else 0, name="roof")


def build_canopy(entry, P):
    roof = Acc("CarouselCanopy_Roof", [CREAM, TEAL])
    roof.add(roof_shell(), None)

    rib = Acc("CarouselCanopy_Rib", [BRASS])
    for g in range(K_GORES):
        a = TAU * g / K_GORES
        path, rxs, rys = [], [], []
        for r in np.linspace(0.9, 6.55, 10):
            dy = (roof_y(r + 0.01) - roof_y(r - 0.01)) / 0.02
            nl = math.hypot(1, dy)
            rr, yy = r + (-dy / nl) * 0.06, roof_y(r) + (1 / nl) * 0.06
            x, z = pol(rr, a)
            path.append((x, yy, z)); rxs.append(.10); rys.append(.065)
        rib.add(loft(path, rxs, rys, 8, name="rib"), 0)
        x, z = pol(6.55, a)
        rib.add(at(lathe(sphere_profile(.17, 0, 6), 12, name="drop"), x, Y_RIM - .10, z), 0)
    C = K_GORES * M_COLS
    hp = [(pol(R_HEM - .04, TAU * j / C)[0], Y_RIM - hem_drop(j), pol(R_HEM - .04, TAU * j / C)[1]) for j in range(C)]
    rib.add(loft(hp, [.06] * C, [.06] * C, 6, closed=True, name="piping"), 0)

    fr = Acc("CarouselCanopy_Frieze", [TEAL, BRASS, CREAM])
    fr.add(lathe(ring_rect(5.70, 6.20, .20, 1.25, .04), 96, name="band"), 0)
    fr.add(lathe(ring_rect(5.75, 6.35, 0.0, .25, .08, 2), 96, name="bead"), 1)
    fr.add(lathe(ring_rect(5.55, 6.50, 1.18, 1.50, .09, 2), 96, name="cornice"), 1)
    for g in range(K_GORES):
        a = TAU * (g + 0.5) / K_GORES
        fr.add(radial(lathe(round_profile([(0, 0), (.30, 0), (.30, .05), (.22, .11), (0, .14)], .03), 16, name="med"), 6.14, a, .72), 2)
        fr.add(radial(lathe(ring_rect(.27, .39, 0, .08, .025), 16, name="medring"), 6.12, a, .72), 1)

    fin = Acc("CarouselCanopy_Finial", [BRASS])
    fin_prof = round_profile([(0, 3.90), (.85, 3.90), (.85, 4.05), (.55, 4.15), (.30, 4.20), (.20, 4.30), (.14, 4.55), (.34, 4.70), (.40, 4.88),
                              (.34, 5.06), (.14, 5.20), (.05, 5.30), (.05, 5.84), (.08, 5.88), (.08, 5.95), (.04, 6.00), (0, 6.00)], .03)
    fin.add(lathe(fin_prof, 24, name="finial"), 0)

    flag = Acc("CarouselCanopy_Flag", [TEAL])
    U, V = 9, 1
    front, back = [], []
    for v in range(V + 1):
        rowf, rowb = [], []
        for u in range(U + 1):
            t = u / U
            top, bot = 5.88 - 0.10 * t, 5.40 + 0.30 * t
            y = bot + (top - bot) * v / V
            x = 0.04 + 1.05 * t
            w = 0.07 * math.sin(TAU * 1.15 * t) * t
            rowf.append((x, y, w + .018)); rowb.append((x, y, w - .018))
        front.append(rowf); back.append(rowb)
    flag.add(grid_shell(np.array(front + back[::-1]), wrap_rows=True, wrap_cols=False, cap_cols=True, name="flag"), 0)

    root, objs = finish(entry, [roof, rib, fr, fin, flag])
    for g in range(K_GORES):
        a = TAU * g / K_GORES
        x, z = pol(6.16, a)
        objs.append(empties.add_socket(root, f"Lamp{g}", (x / 100, 0.0072, z / 100), ["carousel_lamp"], axis_g=(math.sin(a), 0, math.cos(a)),
                                       lampAxis="+Y"))
    objs.append(empties.add_collider(root, "Case", "box", (0.0675, 0.03, 0.0675), (0, 0.03, 0)))
    return objs, dict(origin=("centre", "min", "centre"), closed=True)


# ======================================================================================
# carousel_horse  (3.0 long x 2.4 tall x 0.8 wide; origin: where the pole meets the platform; rests 2.7 cm above it)
# ======================================================================================
ZS = 0.92        # length scale applied to the designed z coordinates


def P3(x, y, z):
    return (x, y, z * ZS)


def ellipse_ring(cx, cy, cz, rx, ry, k=12):
    return [P3(cx + rx * math.cos(TAU * i / k), cy + ry * math.sin(TAU * i / k), cz) for i in range(k)]


def smooth(st, sub=2):
    """Catmull-Rom resample of a station list (any tuple length): the silhouette of a lofted form stays round between stations."""
    Q = [np.array(p, float) for p in st]
    n, out = len(Q), []
    for i in range(n - 1):
        p0, p1, p2, p3 = Q[max(i - 1, 0)], Q[i], Q[i + 1], Q[min(i + 2, n - 1)]
        for k in range(sub):
            t = k / sub
            out.append(0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t ** 3))
    return out + [Q[-1]]


def build_horse(entry, P):
    body = Acc("CarouselHorse_Body", [PAINT, BRASS])

    def tube(x, pts, sides, ref=(0, 1, 0), mat=0, sub=2, name="tube"):
        pts = smooth(pts, sub) if sub > 1 else [np.array(p, float) for p in pts]
        body.add(loft([P3(x, p[1], p[0]) for p in pts], [p[2] for p in pts], [p[3] for p in pts], sides, ref=ref, name=name), mat)

    tube(0, [(-1.00, 1.50, .24, .30), (-.70, 1.56, .30, .36), (-.30, 1.52, .31, .36), (.10, 1.48, .30, .37), (.50, 1.52, .30, .39),
             (.85, 1.68, .24, .36), (1.10, 1.90, .17, .30), (1.28, 2.08, .14, .24), (1.42, 2.12, .15, .20), (1.58, 1.98, .12, .17),
             (1.74, 1.82, .095, .12), (1.84, 1.74, .085, .09)], 10, name="torso")
    tube(.17, [(.62, 1.30, .15, .13), (.90, 1.20, .11, .10), (1.12, 1.10, .085, .08), (1.14, .86, .07, .065), (1.02, .68, .06, .055), (1.00, .56, .085, .07)], 6, (1, 0, 0), name="leg")
    tube(-.17, [(.62, 1.30, .15, .13), (.88, 1.02, .11, .10), (1.14, .84, .085, .08), (1.28, .58, .065, .06), (1.30, .34, .06, .055), (1.34, .14, .085, .07)], 6, (1, 0, 0), name="leg")
    tube(.17, [(-.78, 1.35, .20, .16), (-.62, 1.00, .13, .11), (-.92, .66, .09, .08), (-1.00, .34, .065, .06), (-1.00, .10, .085, .07)], 6, (1, 0, 0), name="leg")
    tube(-.17, [(-.78, 1.35, .20, .16), (-.52, 1.02, .13, .11), (-.62, .78, .09, .08), (-.84, .62, .065, .06), (-.90, .44, .085, .07)], 6, (1, 0, 0), name="leg")
    tube(0, [(-.95, 1.66, .09, .07), (-1.18, 1.76, .12, .07), (-1.40, 1.66, .15, .07), (-1.46, 1.38, .15, .065), (-1.40, 1.08, .12, .055), (-1.28, .86, .06, .04)], 6, (1, 0, 0), name="tail")
    tube(0, [(.88, 2.04, .05, .10), (1.10, 2.22, .05, .11), (1.28, 2.32, .05, .10), (1.42, 2.32, .05, .08)], 6, name="mane", sub=1)
    for s_ in (1, -1):
        body.add(loft([P3(s_ * .08, 2.22, 1.40), P3(s_ * .09, 2.44, 1.42)], [.045, .02], [.035, .015], 6, name="ear"), 0)
    # brass: gilded saddle pad, girth, breast collar, noseband and browband
    body.add(loft([P3(0, 1.84, -.20), P3(0, 1.90, .08), P3(0, 1.86, .38)], [.34, .36, .34], [.07, .08, .07], 10, name="saddle"), 1)
    for (cz, cy, rx, ry) in ((.38, 1.50, .335, .415), (.64, 1.54, .335, .43), (1.70, 1.82, .125, .145), (1.40, 2.08, .185, .235)):
        body.add(loft(ellipse_ring(0, cy, cz, rx, ry), [.03] * 12, [.03] * 12, 4, ref=(0, 0, 1), closed=True, name="strap"), 1)

    lo, hi = extents(body)
    tgt = (0.8, 2.4, 3.0)
    sx, sy, sz = tgt[0] / (hi[0] - lo[0]), tgt[1] / (hi[1] - lo[1]), tgt[2] / (hi[2] - lo[2])
    Y0 = 2.7
    for v in body.bm.verts:
        v.co = (v.co.x * sx, (v.co.y - lo[1]) * sy + Y0, v.co.z * sz)
    wu.log(f"horse fit scale x{sx:.3f} y{sy:.3f} z{sz:.3f}")

    slv = Acc("CarouselHorse_Sleeve", [BRASS])
    y = lambda v: Y0 + (v - lo[1]) * sy
    sp = round_profile([(.15, y(.96)), (.26, y(.96)), (.26, y(1.02)), (.21, y(1.08)), (.21, y(1.80)), (.24, y(1.86)), (.24, y(1.96)), (.27, y(2.02)),
                        (.27, y(2.10)), (.21, y(2.16)), (.21, y(2.22)), (.15, y(2.22))], .02)
    slv.add(lathe(sp, 16, name="sleeve", maxseg=1.0), 0)

    root, objs = finish(entry, [body, slv])
    objs.append(empties.add_collider(root, "Grab", "sphere", 0.015, (0, (Y0 + 1.15 * sy) / 100, 0.002)))
    return objs, dict(closed=True)


# ======================================================================================
# carousel_lamp  (D 0.8 x 1.0 tall; origin: centre of the mounting collar, +Y along the lamp)
# ======================================================================================
def build_lamp(entry, P):
    hou = Acc("CarouselLamp_Housing", [BRASS])
    base = round_profile([(0, 0), (.40, 0), (.40, .08), (.30, .15), (.18, .20), (.18, .26), (.26, .30), (0, .30)], .03)
    hou.add(lathe(base, 24, name="base"), 0)
    hou.add(lathe(round_profile([(0, .86), (.20, .86), (.20, .90), (.12, .96), (.06, 1.0), (0, 1.0)], .02), 24, name="cap"), 0)
    bulb = Acc("CarouselLamp_Bulb", [GLOW])
    bulb.add(lathe(sphere_profile(.36, .56, 10, -90, 90), 24, name="bulb"), 0)
    root, objs = finish(entry, [hou, bulb])
    return objs, dict(origin=("centre", "min", "centre"), closed=True)


BUILDERS = {"carousel_base": build_base, "carousel_platform": build_platform, "carousel_column": build_column,
            "carousel_canopy": build_canopy, "carousel_horse": build_horse, "carousel_lamp": build_lamp}
PARAMS = {k: {} for k in BUILDERS}


def build(entry: dict, params: dict):
    wu.log(f"== {entry['id']}")
    return BUILDERS[entry["id"]](entry, params)


if __name__ == "__main__":
    raise SystemExit("gen_carousel.py is a forge family. Run blender/scripts/forge.py --family carousel --only <ids> --out-root <dir>")
