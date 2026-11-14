"""gen_cam_common.py - polar relief toolkit shared by the cam generators (gen_cam.py: cam_eccentric, gen_cam_hourly.py: cam_hourly_chime).
Not a generator: forge.py never loads it.

A cam is a flat plate whose outline is a radius profile r(theta), so it is built like the spur gears: a planar polar grid (rings of n
vertices at the same angles, outline first, bore last) with one half height per strip between two rings, turned into a watertight
stepped solid by gen_gear_spur.build_relief (step walls come from the height differences, windows from the strips left out). That
gives a single closed manifold, a raised track along the profile, a recessed web, a proud hub boss, and enough vertices on every
flat face for the baked vertex AO to interpolate smoothly (a big n-gon cap with vertices only on its border smears it).

Authoring space is millimetres in glTF model space, rotation axis +Z, bore on the origin, exactly like gen_mech_common.
"""
from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np

import gen_gear_spur as gs
import gen_mech_common as mc
from gen_gear_spur import dome_shell

BORE_R = 4.0          # the family's 8 mm hole (the shaft's fit)
MOUTH = 0.6           # chamfered bore mouth, as on the gears
BEVEL = 0.4           # edge chamfer on every convex hard edge


def theta_grid(n):
    return [360.0 * i / n for i in range(n)]


def _key(x, y):
    return (round(x * 1e4), round(y * 1e4))


def relief(angles, rings, bands, windows=()):
    """Stepped plate from a polar grid -> (bmesh in mm, keys).
    angles: the vertex angles in degrees, strictly increasing and spanning less than 360 (they need not be evenly spaced: put
            the samples where the profile bends and let the dwells be coarse). n = len(angles).
    rings: radii per ring, OUTERMOST first; each a float or a list of n radii (one per angle).
    bands[k]: half height (z = +-h) of the strip between ring k and ring k+1; a float, or a list of n heights (strip i spans
              angles[i] to angles[i + 1]), so a track can climb in z as well as in radius.
    windows: {(k, i)}: strips left out, i.e. holes through the plate.
    keys[k] is the set of (x, y) lookup keys of ring k's vertices, for chamfer()."""
    n = len(angles)
    assert all(b > a for a, b in zip(angles, angles[1:])) and angles[-1] - angles[0] < 360.0, "angles must increase and not wrap"
    pl = gs.Plan()
    V = []
    for R in rings:
        rr = [float(R)] * n if np.isscalar(R) else list(R)
        V.append([pl.add(r * math.cos(math.radians(a)), r * math.sin(math.radians(a))) for a, r in zip(angles, rr)])
    for k, h in enumerate(bands):
        for i in range(n):
            if (k, i) in windows:
                continue
            j = (i + 1) % n
            pl.faces.append([V[k][i], V[k][j], V[k + 1][j], V[k + 1][i]])
            pl.heights.append(h if np.isscalar(h) else h[i])
            pl.kinds.append(f"band{k}")
    return gs.build_relief(pl, scale=1.0), [{_key(*pl.V[v]) for v in ring} for ring in V]


def chamfer(bm, keys, rings=(0,), bevel=BEVEL):
    """Bore mouth first (0.6 mm, the last ring), then the convex hard edges that lie on the listed rings (0 = outline, 2 = hub boss
    in a four-ring plate). Edges on the other rings stay crisp: each chamfered edge costs two triangles and these parts have a
    1,500-triangle ceiling."""
    on_bore = lambda e: all(_key(v.co.x, v.co.y) in keys[-1] for v in e.verts)
    gs.bevel_convex(bm, MOUTH, only=on_bore)
    sel = set().union(*[keys[k] for k in rings])
    gs.bevel_convex(bm, bevel, only=lambda e: all(_key(v.co.x, v.co.y) in sel for v in e.verts))


def rivet_shells(items, nseg=6):
    """items: [(x, y, z_face, sign, a, h)] -> ONE bmesh of closed domed heads standing on the faces (skirt sunk into the body)."""
    bm = mc.bmesh.new()
    for (x, y, z0, sign, a, h) in items:
        v, f = dome_shell(x, y, z0, sign, a, h, nseg=nseg, rings=1, skirt=0.18, phase=math.atan2(y, x))
        vs = [bm.verts.new(c) for c in v]
        for q in f:
            bm.faces.new([vs[i] for i in q])
    mc.bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def pin_shell(x, y, z0, sign, r, h, nseg=10, ch=0.3):
    """A closed round pin standing on a face at z0 (height h, chamfered top, base sunk 0.4 mm into the body)."""
    bm = mc.bmesh.new()
    v = mc.lathe(bm, [(0.0, -0.4), (r, -0.4), (r, h - ch), (r - ch, h), (0.0, h)], nseg)
    if sign < 0:
        for q in v:
            q.co.z = -q.co.z
        mc.bmesh.ops.reverse_faces(bm, faces=bm.faces)
    mc.bmesh.ops.translate(bm, vec=(x, y, z0), verts=v)
    return bm


def union_shells(bm, shells):
    out = mc.boolean(bm, shells, "UNION")
    mc.clean(out)
    return out


def bore_check(g, objs):
    """The bore is the only geometry near the axis: its radius must be the family's 4.0 mm (rotation axis = Blender Y)."""
    me = objs[0].data
    c = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get("co", c)
    c = c.reshape(-1, 3)
    r = np.hypot(c[:, 0], c[:, 2])
    g.info["boreRadiusMm"] = round(float(r.min()) * 1000, 4)
    if abs(float(r.min()) - BORE_R * 1e-3) > 5e-5:
        g.fail("Q13", f"bore radius {r.min() * 1000:.4f} mm, expected {BORE_R} mm")


def outline_stats(bm_or_obj):
    """(max radius, x extent, y extent) in mm of a finished Blender mesh object (gear plane = Blender x, z)."""
    me = bm_or_obj.data
    c = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get("co", c)
    c = c.reshape(-1, 3) * 1000.0
    return float(np.hypot(c[:, 0], c[:, 2]).max()), float(np.ptp(c[:, 0])), float(np.ptp(c[:, 2]))
