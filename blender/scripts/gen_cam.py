"""gen_cam.py - forge family `cam`: cam_eccentric (the hourly chime cam has its own file, gen_cam_hourly.py).

    "$B" --background --factory-startup --python-exit-code 1 --python blender/scripts/forge.py -- \
         --family cam --only cam_eccentric --out-root <dir>

cam_eccentric is a snail / drop cam: a brass plate whose outline is NOT a circle about the shaft. Seen from the front the radius
climbs slowly from the 9.5 mm base circle to a 15 mm nose over 190 degrees (simple harmonic rise), dwells at the nose for 20 degrees,
drops back in 70 degrees and dwells on the base circle for 80 degrees (throw 5.5 mm), so the follower roller visibly rides up a
slope and falls off the nose. A raised 2.4 mm track follows the outline, the web inside it is recessed, the 8 mm bored hub stands
proud on both sides (8 mm overall) and three domed rivets sit in the recess behind the nose. Built like the gears (polar relief
solid, one closed manifold, 0.4 mm chamfers, 0.6 mm bore mouth), see gen_cam_common.

Rotation axis local +Z, origin the bore centre (the rotation axis, NOT the middle of the plate), nose on +X.
"""
from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import wu_common as wu
from lib import empties

import gen_cam_common as cc
import gen_mech_common as mc

FAMILY = "cam"
PARAMS = {
    "cam_eccentric": dict(r_base=9.5, r_nose=15.0, hold_nose=10.0, fall=70.0, hold_base=80.0, rise=190.0, track=2.4,
                          h_track=2.6, h_web=1.9, h_boss=4.0, boss_r=6.2, rivets_deg=(-45.0, -8.0, 22.0), rivet_r=9.9, grab=0.0125),
}


def snail_radius(theta_deg, p):
    """Radius from the shaft at an angle (degrees, nose on 0): dwell at the nose, fall, dwell on the base circle, slow harmonic rise."""
    t = theta_deg % 360.0
    r0, r1 = p["r_base"], p["r_nose"]
    hn, fall, hb = p["hold_nose"], p["fall"], p["hold_base"]
    if t <= hn or t >= 360.0 - hn:
        return r1
    if t < hn + fall:
        u = (t - hn) / fall
        return r0 + (r1 - r0) * 0.5 * (1 + math.cos(math.pi * u))
    if t <= hn + fall + hb:
        return r0
    u = (t - (hn + fall + hb)) / p["rise"]
    return r0 + (r1 - r0) * 0.5 * (1 - math.cos(math.pi * u))


def snail_angles(p):
    """28 vertex angles, dense where the profile bends (nose, fall, rise) and coarse on the constant-radius dwell on the base circle."""
    hn, fall, hb = p["hold_nose"], p["fall"], p["hold_base"]
    a = [-hn, 0.0, hn]
    a += [hn + fall * k / 7 for k in range(1, 8)]                          # fall, ends at the start of the base dwell
    a += [hn + fall + hb * k / 4 for k in range(1, 5)]                     # base dwell
    a += [hn + fall + hb + p["rise"] * k / 15 for k in range(1, 15)]       # rise (the 15th sample would sit on the first one)
    return a


def build_eccentric(entry, p):
    angles = snail_angles(p)
    outline = [snail_radius(a, p) for a in angles]
    track = [r - p["track"] for r in outline]
    bm, keys = cc.relief(angles, [outline, track, p["boss_r"], cc.BORE_R], [p["h_track"], p["h_web"], p["h_boss"]])
    cc.chamfer(bm, keys, rings=(0, 1, 2))
    items = []
    for deg in p["rivets_deg"]:
        t = math.radians(deg)
        x, y = p["rivet_r"] * math.cos(t), p["rivet_r"] * math.sin(t)
        # the rivet (0.8 mm) must sit on the web with 0.5 mm to spare against the track: the recess behind the nose is wide enough
        room = snail_radius(deg, p) - p["track"] - (p["rivet_r"] + 0.8)
        assert room >= 0.5, f"rivet at {deg} deg has only {room:.2f} mm to the track"
        for sign in (1, -1):
            items.append((x, y, sign * p["h_web"], sign, 0.8, 0.62))
    bm = cc.union_shells(bm, [cc.rivet_shells(items, 6)])
    obj = mc.make_object(bm, entry["meshes"][0], [entry["materials"][0]])
    rmax, sx, sy = cc.outline_stats(obj)
    obj["wu"] = dict(id=entry["id"], family=FAMILY, profile="snail", baseRadiusMm=p["r_base"], noseRadiusMm=p["r_nose"],
                     throwMm=round(p["r_nose"] - p["r_base"], 3), noseDeg=0.0, boreRadiusMm=cc.BORE_R, rotationAxis="+Z")
    wu.log(f"{entry['id']}: max radius {rmax:.3f} mm, plate {sx:.2f} x {sy:.2f} mm")
    col = empties.add_collider(obj, "Grab", "sphere", p["grab"])
    return [obj, col], dict(thin_axis_z=True, closed=True, checks=[cc.bore_check])


build = build_eccentric                       # forge calls build(entry, PARAMS[id])


if __name__ == "__main__":
    raise SystemExit("gen_cam.py is a forge family. Run blender/scripts/forge.py --family cam --only cam_eccentric --out-root <dir>")
