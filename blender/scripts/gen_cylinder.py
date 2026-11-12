"""gen_cylinder.py - the cylinder family: the pinned brass melody cylinder of the Music Box (forge family 'cylinder').

    "$B" --background --factory-startup --python-exit-code 1 --python blender/scripts/forge.py -- \
         --family cylinder --only cylinder_music_box --out-root <dir> --owner Machines [--manifest <file>]

Model space (what ends up in the GLB, glTF Y-up): rotation axis = local +Z, origin = the rotation centre (middle of the drum),
drum 32 mm across the end rims and 65 mm long including the two hubs, an 8 mm bore through it (the shaft_short arbor). Built in
centimetres, rotated to Blender axes and scaled to metres by gen_mb_common.finish().

Size: TOCKTON_DIMENSIONS.md section 11 (Opus draft, awaiting owner approval): [0.032, 0.032, 0.065]. The manifest still carries the
board's 0.05 x 0.05 x 0.14.

Pins: one revolution of a melody. Pin j sits at angle 360 j / 72 (every 9th step is a rest) on one of 18 channels along the drum;
the 18 channels are the 18 tines of comb_music_box (same pitch, same order, drum +Z = comb +X). The pattern is visual only until the
melody is authored (gap G-17).
"""
from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bmesh

import wu_common as wu
from lib import empties
from gen_mb_common import Builder, finish

FAMILY = "cylinder"

# generator parameters keyed by asset id (GUIDELINES 4.4). `grab_radius` is COL_Grab in metres (must equal PartDefinition.grab.colliderRadius).
PARAMS = {
    "cylinder_music_box": dict(
        segs=32,                 # facets round the drum: divisible by 4 keeps the rim at 32.0 mm in x and y; sagitta 0.08 mm
        r_rim=1.60, r_drum=1.50, half_len=3.25, drum_half=2.50,
        r_bore=0.40, r_hub=0.64,
        channels=18, channel_span=2.30,      # channel centres z = +-2.30 cm, 17 pitches
        steps=72, rest_every=9,
        pin_base_r=1.46, pin_tip_r=1.592, pin_bw=0.062,
        grab_radius=0.020,
    )
}


def profile(p):
    h, hd = p["half_len"], p["drum_half"]
    rb, rh, rr, rd = p["r_bore"], p["r_hub"], p["r_rim"], p["r_drum"]
    # one end, from the drum outwards: step up to the rim, rim wall, 45 degree chamfer, plate face, hub wall, hub end face
    side = [(rd, hd), (rr, hd + 0.07), (rr, hd + 0.20), (rr - 0.07, hd + 0.28), (rh, hd + 0.28), (rh - 0.04, h), (rb, h)]
    neg = [(r, -z) for r, z in side]
    # closed loop: bore wall bottom -> negative end outwards -> drum (rings at +-1.25 for the AO gradient) -> positive end -> bore wall top
    loop = [neg[-1]] + [neg[i] for i in range(len(neg) - 2, -1, -1)]
    loop += [(rd, -hd / 2), (rd, hd / 2)]
    loop += side
    return loop


def pin_events(p):
    """[(channel, angle_deg)] for one revolution: a wavy melodic contour with a rest every rest_every-th step."""
    ev = []
    for j in range(p["steps"]):
        if j % p["rest_every"] == p["rest_every"] - 1:
            continue
        c = round(8.5 + 6.0 * math.sin(2 * math.pi * j / 12 + 0.6) + 2.5 * math.sin(2 * math.pi * j / 5))
        ev.append((min(max(c, 0), p["channels"] - 1), 360.0 * j / p["steps"] + 2.5))
    return ev


def add_pin(b: Builder, p, z, ang_deg):
    """A squat four-sided pyramid (6 triangles), base sunk 0.4 mm into the drum so the facets never open a gap."""
    th = math.radians(ang_deg)
    er, et = (math.cos(th), math.sin(th), 0.0), (-math.sin(th), math.cos(th), 0.0)
    src = bmesh.new()
    r, hw = p["pin_base_r"], p["pin_bw"]
    base = [src.verts.new((er[0] * r + et[0] * su * hw, er[1] * r + et[1] * su * hw, z + sv * hw))
            for su, sv in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    tip = src.verts.new((er[0] * p["pin_tip_r"], er[1] * p["pin_tip_r"], z))
    for i in range(4):
        src.faces.new([base[i], base[(i + 1) % 4], tip])
    src.faces.new(base)
    b._merge(src, "Mat_PolishedBrass")


def build(entry: dict, params: dict):
    p = params
    name = entry["meshes"][0]
    b = Builder()
    b.lathe(profile(p), "Mat_AgedBrass", axis="z", segs=p["segs"], loop=True)
    pitch = 2 * p["channel_span"] / (p["channels"] - 1)
    ev = pin_events(p)
    for c, ang in ev:
        add_pin(b, p, -p["channel_span"] + c * pitch, ang)
    wu.log(f"== {entry['id']}: {len(ev)} pins on {p['channels']} channels, pitch {pitch * 10:.3f} mm")
    obj = finish(b, name)
    obj["wu"] = dict(id=entry["id"], family=FAMILY, rotationAxis="+Z", pins=len(ev), channels=p["channels"], channelPitchMm=round(pitch * 10, 3))
    col = empties.add_collider(obj, "Grab", "sphere", p["grab_radius"])

    def check(g, objs):
        import numpy as np
        me = obj.data
        c = np.empty(len(me.vertices) * 3)
        me.vertices.foreach_get("co", c)
        c = c.reshape(-1, 3)                                      # Blender axes: the drum axis is Y
        r = np.hypot(c[:, 0], c[:, 2])
        g.info.update(maxRadiusMm=round(float(r.max()) * 1000, 3), pins=len(ev))
        if r.max() > p["r_rim"] / 100 + 1e-6:
            g.fail("Q13", f"a pin or rim reaches radius {r.max() * 1000:.3f} mm, the rim is {p['r_rim'] * 10:.1f} mm")
    return [obj, col], dict(origin=("centre", "centre", "centre"), closed=True, checks=[check])


if __name__ == "__main__":
    raise SystemExit("gen_cylinder.py is a forge family. Run blender/scripts/forge.py --family cylinder --only cylinder_music_box --out-root <dir>")
