"""gen_ct_common.py - small helpers shared by the Clock Tower set generators (gen_escapement, gen_cam, gen_spring_barrel, gen_pendulum,
gen_clock_tower). Not a generator: forge.py never loads it. Builds on gen_mech_common (mm, rotation axis +Z, glTF model space).
"""
from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bmesh
from mathutils import Vector, geometry

import gen_mech_common as mc

new = bmesh.new


def merge(dst, src, slot=0):
    """Append the faces of a standalone closed shell `src` to `dst` (material slot `slot`) and free it. Shells overlap, never weld."""
    vmap = {v: dst.verts.new(v.co) for v in src.verts}
    for f in src.faces:
        try:
            nf = dst.faces.new([vmap[v] for v in f.verts])
        except ValueError:
            continue
        nf.material_index = slot
    src.free()


def pol(r, deg):
    a = math.radians(deg)
    return (r * math.cos(a), r * math.sin(a))


def circle(r, n, c=(0.0, 0.0), phase=0.0):
    return [(c[0] + r * math.cos(phase + 2 * math.pi * i / n), c[1] + r * math.sin(phase + 2 * math.pi * i / n)) for i in range(n)]


def arc(c, r, a0, a1, n):
    """n + 1 points on a circle arc from a0 to a1 degrees."""
    return [(c[0] + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)), c[1] + r * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]


def strip(center, w0, w1=None):
    """Polygon of a flat strip along the polyline `center`, width tapering from w0 to w1 (flat ends)."""
    w1 = w0 if w1 is None else w1
    n = len(center)
    left, right = [], []
    for i, (x, y) in enumerate(center):
        a = center[min(i + 1, n - 1)]
        b = center[max(i - 1, 0)]
        tx, ty = a[0] - b[0], a[1] - b[1]
        L = math.hypot(tx, ty) or 1.0
        nx, ny = -ty / L, tx / L
        w = (w0 + (w1 - w0) * i / max(n - 1, 1)) / 2
        left.append((x + nx * w, y + ny * w))
        right.append((x - nx * w, y - ny * w))
    return left + right[::-1]


def prism_holes(bm, outer, holes, z0, z1):
    """Extrude a polygon with holes between z0 and z1 (closed solid). outer / holes: [(x, y)...]."""
    rings = [outer] + list(holes)
    flat = [p for r in rings for p in r]
    tris = geometry.tessellate_polygon([[Vector((x, y, 0.0)) for x, y in r] for r in rings])
    lo = [bm.verts.new((x, y, z0)) for x, y in flat]
    hi = [bm.verts.new((x, y, z1)) for x, y in flat]
    off = 0
    for r in rings:
        n = len(r)
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((lo[off + i], lo[off + j], hi[off + j], hi[off + i]))
        off += n
    for a, b, c in tris:
        ar = (flat[b][0] - flat[a][0]) * (flat[c][1] - flat[a][1]) - (flat[b][1] - flat[a][1]) * (flat[c][0] - flat[a][0])
        if ar < 0:
            b, c = c, b
        bm.faces.new((hi[a], hi[b], hi[c]))
        bm.faces.new((lo[a], lo[c], lo[b]))


def bevel_top(bm, width, z):
    """Chamfer only the convex edges of the top outline (both ends at height z); the buried bottom outline stays untouched."""
    bm.edges.ensure_lookup_table()
    sel = [e for e in bm.edges if e.is_manifold and e.is_convex and all(abs(v.co.z - z) < 1e-6 for v in e.verts)]
    if sel:
        bmesh.ops.bevel(bm, geom=sel, offset=width, offset_type="OFFSET", segments=1, profile=0.5, affect="EDGES", clamp_overlap=True, loop_slide=True)


def shell_prism(poly, z0, z1, bevel=0.0, holes=(), top_only=False):
    bm = new()
    if holes:
        prism_holes(bm, poly, holes, z0, z1)
    else:
        mc.prism(bm, poly, z0, z1)
    mc.clean(bm)
    if bevel > 0:
        bevel_top(bm, bevel, z1) if top_only else mc.bevel_hard(bm, bevel)
    return bm


def shell_lathe(loop, nseg, bevel=0.0, center=(0.0, 0.0), phase=0.0):
    bm = new()
    mc.lathe(bm, loop, nseg, phase=phase, center=center)
    mc.clean(bm)
    if bevel > 0:
        mc.bevel_hard(bm, bevel)
    return bm


def shell_box(lo, hi, bevel=0.0):
    bm = new()
    mc.box(bm, lo, hi, bevel)
    mc.clean(bm)
    return bm


def shell_sphere(c, r, nseg=12, nrings=6):
    bm = new()
    mc.sphere(bm, c, r, nseg, nrings)
    mc.clean(bm)
    return bm


def bar_shell(p0, p1, r, nseg=8):
    bm = new()
    mc.bar(bm, p0, p1, r, nseg)
    mc.clean(bm)
    return bm


def move(bm, d):
    bmesh.ops.translate(bm, vec=Vector(d), verts=bm.verts)
    return bm


def lathe_along(loop, nseg, axis, loc, bevel=0.0):
    """Solid of revolution whose axis points along `axis` (3-tuple) at `loc`."""
    bm = shell_lathe(loop, nseg, bevel)
    mc.place(bm, bm.verts, loc, axis)
    return bm
