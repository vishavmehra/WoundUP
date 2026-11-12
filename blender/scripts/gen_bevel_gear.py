"""gen_bevel_gear.py - the bevel_gear family: a 12-tooth, 90 degree straight bevel gear in aged brass (forge family).

    "$B" --background --factory-startup --python-exit-code 1 --python blender/scripts/forge.py -- \
         --family bevel_gear --only gear_bevel_12 --out-root <dir>

Same module token as the spur family, m1 = 3.6158 mm (owner decision 5 pending). A 1:1 bevel pair meshes at 45 degrees, so the
pitch cone has a half angle of 45 degrees and the cone height from the apex to the pitch circle equals the pitch radius. The
tooth outline comes from the spur generator with its radial addendum / dedendum scaled by cos 45, so the outer diameter is
the textbook m (z + 2 * 0.85 * cos 45) = 47.74 mm. The teeth are that outline lofted to a copy scaled about the cone apex
(every tooth edge runs through the apex), on a solid cone with a flanged front hub, a stub on the back, six lightening windows and
twelve domed rivets on the back face.

Model space: rotation axis = local +Z, teeth narrow towards +Z, front face (hub) towards +Z, tooth 0 on +X, origin = bore centre at
mid-height of the 12 mm overall height. Built in mm, exported in metres.
"""
from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np

import wu_common as wu
from lib import empties

import gen_mech_common as mc
from gen_gear_spur import ADDENDUM, GearParams, dome_shell, tooth_outline

FAMILY = "bevel_gear"
COS45 = math.cos(math.radians(45.0))
Z_BACK, Z_FRONT = -5.0, 1.0            # back plane of the toothed cone, front (small) plane (mm); face width 6 mm
Z_MIN, Z_MAX = -6.0, 6.0               # overall height 12 mm (hub stubs front and back)
BORE_R = 4.0

PARAMS = {
    "gear_bevel_12": dict(teeth=12, tip_fillet_segs=1, root_fillet_segs=1, tip_fillet=0.16, root_fillet=0.18, grab_radius=0.0239),
}


def outline_mm(teeth, **kw):
    p = GearParams(teeth=teeth, addendum=ADDENDUM * COS45, dedendum=1.0 * COS45, **kw).derive()
    return p, tooth_outline(p) * 1000.0


def cone_body(bm, outline, rp):
    """Toothed frustum: the outline in the back plane and a copy scaled about the apex in the front plane."""
    z_a = Z_BACK + rp                                           # apex height: 45 degree pitch cone
    s = (z_a - Z_FRONT) / (z_a - Z_BACK)
    n = len(outline)
    back = [bm.verts.new((x, y, Z_BACK)) for x, y in outline]
    front = [bm.verts.new((x * s, y * s, Z_FRONT)) for x, y in outline]
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((back[i], back[j], front[j], front[i]))
    cb, cf = bm.verts.new((0, 0, Z_BACK)), bm.verts.new((0, 0, Z_FRONT))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((cb, back[j], back[i]))
        bm.faces.new((cf, front[i], front[j]))
    return s


def hub_loop():
    """(r, z): stepped hub, back stub r 6.4, front flange r 8.8 and boss r 7.2, all chamfered."""
    return [(0.0, Z_MIN), (5.8, Z_MIN), (6.4, Z_MIN + 0.6), (6.4, 0.6), (8.8, 0.6), (8.8, 1.9), (8.4, 2.3), (7.2, 2.3),
            (7.2, Z_MAX - 0.6), (6.6, Z_MAX), (0.0, Z_MAX)]


def bore_cutter():
    return [(0.0, Z_MIN - 0.8), (BORE_R + 1.4, Z_MIN - 0.8), (BORE_R, Z_MIN + 0.6), (BORE_R, Z_MAX - 0.6), (BORE_R + 1.4, Z_MAX + 0.8),
            (0.0, Z_MAX + 0.8)]


def window_cutter(r):
    """Lightening hole through the web, chamfered where it meets the back plane and the front plane."""
    return [(0.0, Z_BACK - 1.0), (r + 1.0, Z_BACK - 1.0), (r, Z_BACK + 0.5), (r, Z_FRONT - 0.5), (r + 1.0, Z_FRONT + 0.5), (0.0, Z_FRONT + 0.5)]


def teeth_check(p, rp):
    def run(g, objs):
        me = objs[0].data
        c = np.empty(len(me.vertices) * 3)
        me.vertices.foreach_get("co", c)
        c = c.reshape(-1, 3)
        x, y, zm = c[:, 0], c[:, 2], -c[:, 1]                        # gear plane = (x, y); model z = -Blender y
        r, ang = np.hypot(x, y), np.arctan2(y, x)
        sel = (r > rp * 1e-3) & (zm < (Z_BACK + 1.5) * 1e-3)
        a = np.sort(np.degrees(ang[sel]))
        gaps = np.diff(np.concatenate([a, [a[0] + 360.0]]))
        teeth = int((gaps > 12.0).sum())                              # the gap between two teeth above the pitch circle is 15.6 deg
        near0 = a[np.abs(a) < 8.0]
        off = float(abs(near0.mean())) if len(near0) else 99.0
        g.info.update(teethFound=teeth, tooth0OffsetDeg=round(off, 3), boreRadiusMm=round(float(r.min()) * 1000, 4),
                      outerDiameterMm=round(float(r.max()) * 2000, 3))
        if teeth != p.teeth:
            g.fail("Q13", f"{teeth} teeth found, {p.teeth} expected")
        if off > 0.3:
            g.fail("Q13", f"tooth 0 is {off:.3f} deg off +X")
        if abs(float(r.min()) - BORE_R * 1e-3) > 5e-5:
            g.fail("Q13", f"bore radius {r.min() * 1000:.4f} mm, expected {BORE_R} mm")
    return run


def build(entry: dict, params: dict):
    kw = {k: v for k, v in params.items() if k not in ("teeth", "grab_radius")}
    p, outline = outline_mm(params["teeth"], **kw)
    rp = p.Rp * 1000.0
    wu.log(f"== {entry['id']}: teeth={p.teeth} module={p.m * 1000:.4f} mm pitch R={rp:.3f} mm tip R(plane)={p.Ro * 1000:.3f} mm")
    bm = mc.bmesh.new()
    s = cone_body(bm, outline, rp)
    mc.clean(bm)
    n_b = mc.bevel_hard(bm, 0.45)
    hub = mc.bmesh.new()
    mc.lathe(hub, hub_loop(), nseg=36)
    bm = mc.boolean(bm, [hub], "UNION")
    tools = []
    b = mc.bmesh.new()
    mc.lathe(b, bore_cutter(), nseg=36)
    tools.append(b)
    for k in range(6):                                           # six lightening windows behind alternate teeth
        w = mc.bmesh.new()
        mc.lathe(w, window_cutter(1.5), nseg=12, center=(11.1 * math.cos(math.radians(30 + 60 * k)), 11.1 * math.sin(math.radians(30 + 60 * k))))
        tools.append(w)
    bm = mc.boolean(bm, tools, "DIFFERENCE")
    rv = mc.bmesh.new()                                          # rivets: 12 on the back face (same heads as the spur gears)
    for k in range(12):
        t = math.radians(15 + 30 * k)
        v, f = dome_shell(16.4 * math.cos(t), 16.4 * math.sin(t), Z_BACK, -1, 0.8, 0.62, nseg=8, rings=1, skirt=0.18, phase=t)
        vs = [rv.verts.new(c) for c in v]
        for q in f:
            rv.faces.new([vs[i] for i in q])
    mc.bmesh.ops.recalc_face_normals(rv, faces=rv.faces)
    bm = mc.boolean(bm, [rv], "UNION")
    name = entry["meshes"][0]
    obj = mc.make_object(bm, name, [entry["materials"][0]])
    obj["wu"] = dict(id=entry["id"], family=FAMILY, teeth=p.teeth, moduleMm=round(p.m * 1000, 4), pitchConeDeg=45.0,
                     outerDiameterMm=round(2 * (rp + p.addendum * p.m * 1000), 3), rotationAxis="+Z")
    col = empties.add_collider(obj, "Grab", "sphere", params["grab_radius"])
    wu.log(f"{name}: scale s={s:.4f}, bevelled {n_b} edges")
    return [obj, col], dict(origin=("centre", "centre", "centre"), thin_axis_z=True, closed=True, checks=[teeth_check(p, rp)])


if __name__ == "__main__":
    raise SystemExit("gen_bevel_gear.py is a forge family. Run blender/scripts/forge.py --family bevel_gear --only <ids> --out-root <dir>")
