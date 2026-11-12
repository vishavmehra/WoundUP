"""gen_cylinder.py - the cylinder family: the pinned brass melody cylinder of the Music Box (forge family 'cylinder').

    "$B" --background --factory-startup --python-exit-code 1 --python blender/scripts/forge.py -- \
         --family cylinder --only cylinder_music_box --out-root <dir> --owner Machines [--manifest <file>]

Model space (what ends up in the GLB, glTF Y-up): rotation axis = local +Z, origin = the rotation centre (middle of the drum),
drum 32 mm across the end rims and 58.6 mm long including the two stepped hubs, an 8 mm bore through it (the shaft_short arbor).
Built in centimetres, rotated to Blender axes and scaled to metres by gen_mb_common.finish().

Size: docs/blueprints/MUSIC_BOX_BLUEPRINT.md sections 6.3 and 11, [0.032, 0.032, 0.0586] (lead proposal, awaiting owner approval; it
supersedes the 65 mm of TOCKTON_DIMENSIONS.md section 11 because the arbor carries two gears). The manifest still carries the board's
0.05 x 0.05 x 0.14.

Pins: one revolution of a melody, 72 steps of 5 degrees. The 18 channels along the drum are the 18 tines of comb_music_box (same pitch,
same order, drum +Z = comb +X). The tune is written as eight phrases of eight notes, each a rising or falling run of one or two channels
per step, so the pins read as helical lines winding round the drum, with a bass pin under four of the phrases and a rest step between
phrases. The pattern is visual only until the melody is authored (gap G-17).
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
        segs=28,                 # facets round the drum: divisible by 4 keeps the rim at 32.0 mm in x and y; sagitta 0.10 mm
        r_rim=1.60, r_drum=1.44, half_len=2.93, drum_half=2.45,
        r_bore=0.40, r_hub=0.64, r_hub_outer=0.84,
        channels=18, channel_span=2.20,      # channel centres z = +-2.20 cm, 17 pitches of 2.588 mm
        steps=72,
        # (first step, first channel, channel step per step, notes): a run per phrase; a rest step follows each phrase
        phrases=((0, 4, +1, 8), (9, 14, -1, 8), (18, 2, +2, 8), (27, 9, +1, 8), (36, 17, -2, 8), (45, 5, +1, 8), (54, 15, -1, 8), (63, 1, +2, 8)),
        bass=((0, 0), (18, 0), (36, 1), (54, 0)),
        pin_base_r=1.40, pin_tip_r=1.592, pin_bw=0.078,
        grab_radius=0.020,
    )
}


def profile(p):
    h, hd = p["half_len"], p["drum_half"]
    rb, rh, rho, rr, rd = p["r_bore"], p["r_hub"], p["r_hub_outer"], p["r_rim"], p["r_drum"]
    # one end, from the drum outwards: step up to the rim, rim wall, 45 degree chamfer, plate face, two-tier hub, bore
    side = [(rd, hd), (rr, hd + 0.07), (rr, hd + 0.18), (rr - 0.07, hd + 0.26), (rho, hd + 0.26), (rho, hd + 0.32), (rh, hd + 0.32), (rh - 0.02, h), (rb, h)]
    neg = [(r, -z) for r, z in side]
    # closed loop: bore wall bottom -> negative end outwards -> drum (rings at +-hd/2 for the AO gradient) -> positive end -> bore wall top
    loop = [neg[-1]] + [neg[i] for i in range(len(neg) - 2, -1, -1)]
    loop += [(rd, -hd / 2), (rd, hd / 2)]
    loop += side
    return loop


def pin_events(p):
    """[(channel, angle_deg)] for one revolution: eight rising or falling runs (helical lines on the drum) plus four bass pins."""
    ev = []
    for s0, c0, dc, n in p["phrases"]:
        for k in range(n):
            ev.append((c0 + dc * k, 360.0 * (s0 + k) / p["steps"] + 2.5))
    for s0, c in p["bass"]:
        ev.append((c, 360.0 * s0 / p["steps"] + 2.5))
    assert all(0 <= c < p["channels"] for c, _ in ev), "a pin is off the drum"
    assert len({(c, round(a, 3)) for c, a in ev}) == len(ev), "two pins coincide"
    return ev


def add_pin(b: Builder, p, z, ang_deg):
    """A squat three-sided pyramid (4 triangles), base sunk 0.4 mm into the drum so the facets never open a gap."""
    th = math.radians(ang_deg)
    er, et = (math.cos(th), math.sin(th), 0.0), (-math.sin(th), math.cos(th), 0.0)
    src = bmesh.new()
    r, hw = p["pin_base_r"], p["pin_bw"]
    base = [src.verts.new((er[0] * r + et[0] * su * hw, er[1] * r + et[1] * su * hw, z + sv * hw))
            for su, sv in ((-0.87, -0.5), (0.87, -0.5), (0.0, 1.0))]
    tip = src.verts.new((er[0] * p["pin_tip_r"], er[1] * p["pin_tip_r"], z))
    for i in range(3):
        src.faces.new([base[i], base[(i + 1) % 3], tip])
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
