"""gen_structural.py - the structural family: a pillow-block bearing and a flat support bracket in aged brass (forge family).

    "$B" --background --factory-startup --python-exit-code 1 --python blender/scripts/forge.py -- \
         --family structural --only bearing_pillow_block,bracket_support --out-root <dir>

Both carry the 8 mm shaft (radius 4.0 mm, the spur gears' bore) in a bore at the origin, shaft axis = local +Z, +Y up; the origin is
the centre of the shaft seat, not the box centre. Built in mm from bevelled boxes, lathes and an extruded outline joined with
exact booleans; every hole is cut with a chamfered cutter so no convex edge is left raw. Sizes: TOCKTON_DIMENSIONS section 11
(proposals): bearing 30 x 22 x 12 mm, bracket 22 x 45 x 6 mm with the seat 35 mm above its foot.
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
from gen_gear_spur import dome_shell

FAMILY = "structural"
BORE_R = 4.0

PARAMS = {
    "bearing_pillow_block": dict(grab_radius=0.012),
    "bracket_support": dict(grab_radius=0.012),
}


def new():
    return mc.bmesh.new()


def tool(fn, *a, **k):
    b = new()
    fn(b, *a, **k)
    return b


def bore_cutter(z_half, chamfer=0.6):
    """Bore of radius 4.0 through a part whose end planes sit at +-z_half, chamfered at both ends."""
    o = chamfer + 0.8
    return [(0.0, -z_half - 0.8), (BORE_R + o, -z_half - 0.8), (BORE_R, -z_half + chamfer), (BORE_R, z_half - chamfer),
            (BORE_R + o, z_half + 0.8), (0.0, z_half + 0.8)]


def screw_cutter(r, z0, z1, chamfer=0.4):
    """Round hole of radius r between the planes z0 and z1 (the part's faces), chamfered at both faces; built about +Z."""
    f = chamfer + 0.8
    return [(0.0, z0 - 0.8), (r + f, z0 - 0.8), (r, z0 + chamfer), (r, z1 - chamfer), (r + f, z1 + 0.8), (0.0, z1 + 0.8)]


def rivets(bm, pts, sign_z, z0):
    """Domed rivet heads (the spur gear's heads) on a face at z0; pts [(x, y)]."""
    for (x, y) in pts:
        v, f = dome_shell(x, y, z0, sign_z, 0.8, 0.62, nseg=6, rings=1, skirt=0.18, phase=math.atan2(y, x))
        vs = [bm.verts.new(c) for c in v]
        for q in f:
            bm.faces.new([vs[i] for i in q])


# ---------------------------------------------------------------------------------------------------
# pillow block
# ---------------------------------------------------------------------------------------------------
def pillow_outline():
    """Counter-clockwise housing silhouette in XY, extruded 12 mm along the shaft: 30 mm base plate, 21 mm body, 22.8 mm cap lugs and the
    round barrel (radius 8.5) as one outline, so the housing needs no union boolean. The left half sits 0.03 mm lower than the right on
    the three horizontal steps: a perfectly mirrored outline puts collinear vertices on both sides of the cap, and the tessellator
    then emits zero-area slivers that the exact boolean tears into open edges."""
    e = 0.03
    pts = [(-15.0, -10.0), (15.0, -10.0), (15.0, -6.0), (10.5, -6.0), (10.5, -0.4), (11.4, -0.4), (11.4, 3.0)]
    a0 = math.asin(3.0 / 8.5)
    pts.append((8.5 * math.cos(a0), 3.0))
    n = 26
    for i in range(1, n):
        a = a0 + (math.pi - 2 * a0) * i / n
        pts.append((8.5 * math.cos(a), 8.5 * math.sin(a)))
    pts += [(-8.5 * math.cos(a0), 3.0 + e), (-11.4, 3.0 + e), (-11.4, -0.4 + e), (-10.5, -0.4 + e), (-10.5, -6.0 + e), (-15.0, -6.0 + e)]
    return pts


def build_pillow(entry, params):
    bm = new()
    mc.prism(bm, pillow_outline(), -6.0, 6.0)
    mc.clean(bm)
    mc.bevel_hard(bm, 0.5)
    cuts = [tool(mc.lathe, bore_cutter(6.0), nseg=36)]
    for sx in (-1, 1):                                                                           # base bolt holes along Y
        c = new()
        v = mc.lathe(c, screw_cutter(1.8, -10.0, -6.0), nseg=14)
        mc.place(c, v, (sx * 12.5, 0, 0), (0, 1, 0))
        cuts.append(c)
    bm = mc.boolean(bm, cuts, "DIFFERENCE")
    # the oil cup and the four cap bolts are separate closed shells sunk into the housing (no union boolean: see pillow_outline)
    v = mc.lathe(bm, [(0.0, 8.0), (1.3, 8.0), (1.3, 9.6), (2.5, 10.0), (2.5, 11.2), (1.8, 12.0), (0.0, 12.0)], nseg=14)
    mc.place(bm, v, (0, 0, 0), (0, 1, 0))
    for sx in (-1, 1):
        for sz in (-1, 1):
            mc.hex_head(bm, (sx * 9.7, 3.0, sz * 3.2), (0, 1, 0), 1.6, 1.5, spin=math.radians(15))
    name = entry["meshes"][0]
    obj = mc.make_object(bm, name, [entry["materials"][0]])
    obj["wu"] = dict(id=entry["id"], family=FAMILY, shaftBoreRadiusMm=BORE_R, shaftAxis="+Z")
    col = empties.add_collider(obj, "Grab", "sphere", params["grab_radius"])
    return [obj, col], dict(closed=True, checks=[bore_check(obj)])


# ---------------------------------------------------------------------------------------------------
# support bracket
# ---------------------------------------------------------------------------------------------------
def bracket_outline():
    """Counter-clockwise plate outline: foot 22 wide, flared web 12 wide, round lobe of radius 10 around the seat at the origin."""
    pts = [(-11.0, -35.0), (11.0, -35.0), (11.0, -31.0)]
    for i in range(1, 8):                                                    # right flare: quadratic Bezier (11,-31) -> (6,-13)
        t = i / 7
        pts.append(((1 - t) ** 2 * 11.0 + 2 * t * (1 - t) * 6.0 + t * t * 6.0, (1 - t) ** 2 * -31.0 + 2 * t * (1 - t) * -27.0 + t * t * -13.0))
    a0 = math.atan2(-8.0, 6.0)
    a1 = math.pi - a0                                                        # arc from -53.13 deg over the top to 233.13 deg
    n = 20
    pts.append((6.0, -8.0))
    for i in range(1, n):
        a = a0 + (a1 - a0) * i / n
        pts.append((10.0 * math.cos(a), 10.0 * math.sin(a)))
    pts.append((-6.0, -8.0))
    for i in range(7, 0, -1):                                                # left flare, mirrored
        t = i / 7
        pts.append((-((1 - t) ** 2 * 11.0 + 2 * t * (1 - t) * 6.0 + t * t * 6.0), (1 - t) ** 2 * -31.0 + 2 * t * (1 - t) * -27.0 + t * t * -13.0))
    pts.append((-11.0, -31.0))
    return pts


def build_bracket(entry, params):
    bm = new()
    mc.prism(bm, bracket_outline(), -2.0, 2.0)                               # 4 mm plate
    mc.clean(bm)
    mc.bevel_hard(bm, 0.45)
    cuts = [tool(mc.lathe, [(0.0, -2.8), (5.0, -2.8), (5.0, 2.8), (0.0, 2.8)], nseg=20)]      # seat opening, hidden behind the boss ring
    slot = new()                                                             # lightening slot in the web, chamfered both faces
    mc.loft(slot, [(mc.stadium(0, -25.2, -16.8, 2.4, 0.8, 7), -2.4), (mc.stadium(0, -25.2, -16.8, 2.4, 0.0, 7), -1.6),
                   (mc.stadium(0, -25.2, -16.8, 2.4, 0.0, 7), 1.6), (mc.stadium(0, -25.2, -16.8, 2.4, 0.8, 7), 2.4)])
    cuts.append(slot)
    for sx in (-1, 1):                                                       # screw holes in the foot
        c = new()
        v = mc.lathe(c, screw_cutter(1.3, -2.0, 2.0), nseg=10)
        mc.place(c, v, (sx * 7.5, -33.0, 0))
        cuts.append(c)
    bm = mc.boolean(bm, cuts, "DIFFERENCE")
    # boss ring with the 8 mm shaft bore, and rivet heads: separate closed shells that overlap the plate (no union boolean)
    mc.lathe(bm, [(4.6, -3.0), (6.2, -3.0), (6.8, -2.4), (6.8, 2.4), (6.2, 3.0), (4.6, 3.0), (BORE_R, 2.4), (BORE_R, -2.4)], nseg=24)
    ring = [(8.6 * math.cos(math.radians(a)), 8.6 * math.sin(math.radians(a))) for a in (90, 210, 330)]
    rivets(bm, ring, +1, 2.0)
    rivets(bm, ring, -1, -2.0)
    name = entry["meshes"][0]
    obj = mc.make_object(bm, name, [entry["materials"][0]])
    obj["wu"] = dict(id=entry["id"], family=FAMILY, shaftBoreRadiusMm=BORE_R, shaftAxis="+Z", seatHeightAboveFootMm=35.0)
    col = empties.add_collider(obj, "Grab", "sphere", params["grab_radius"], loc_g=(0.0, -0.012, 0.0))
    return [obj, col], dict(closed=True, checks=[bore_check(obj)])


def bore_check(obj):
    def run(g, objs):
        c = np.empty(len(obj.data.vertices) * 3)
        obj.data.vertices.foreach_get("co", c)
        c = c.reshape(-1, 3)
        r = np.hypot(c[:, 0], c[:, 2])                                       # the shaft axis is Blender Y; the seat is at the origin
        near = r[r < 5.5e-3]
        g.info.update(boreRadiusMm=round(float(near.min()) * 1000, 4))
        if abs(float(near.min()) - BORE_R * 1e-3) > 5e-5:
            g.fail("Q13", f"bore radius {near.min() * 1000:.4f} mm, expected {BORE_R} mm")
    return run


def build(entry, params):
    return {"bearing_pillow_block": build_pillow, "bracket_support": build_bracket}[entry["id"]](entry, params)


if __name__ == "__main__":
    raise SystemExit("gen_structural.py is a forge family. Run blender/scripts/forge.py --family structural --only <ids> --out-root <dir>")
