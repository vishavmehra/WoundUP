"""gen_spring_barrel.py - the Clock Tower mainspring barrel: a drum with a flange, a cover and a ratchet ring (forge family 'spring').

    "$B" --background --factory-startup --python-exit-code 1 --python blender/scripts/forge.py -- \
         --family spring --only spring_barrel --out-root <dir> --owner Machines

30 x 30 x 12 mm. Mat_AgedBrass: the drum (radius 14.0, a beaded band) with its back flange (radius 15.0) and a bored hub (bore radius 4.0,
the shaft's 8 mm). Mat_PolishedBrass: the cover plate (radius 14.8, a rolled rim, a raised boss) and the ratchet ring on it (20 hooked teeth,
tip radius 11.8) that the winding click catches. The coil itself is spring_standard (45 mm part, it lives inside: this barrel is the housing).
Rotation axis local +Z, origin the rotation centre, built in mm and exported in metres. This file is in family 'spring' but is not part of
gen_spring.py: it has its own generator so the two never touch each other.
"""
from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import wu_common as wu
from lib import empties

import gen_mech_common as mc
import gen_ct_common as ct

FAMILY = "spring"
BORE_R = 4.0
AB, PB = "Mat_AgedBrass", "Mat_PolishedBrass"
PARAMS = {"spring_barrel": dict(teeth=20, r_tip=11.8, r_root=10.2, nseg=28, grab=0.015)}


def ratchet_outline(n, r_tip, r_root):
    """Saw teeth, valley then a short curved ramp up to the tip and a steep drop; tooth 0 tip on +X."""
    pts = []
    pitch = 360.0 / n
    for k in range(n):
        for u in (0.0, 0.55, 0.85, 1.0):
            pts.append(ct.pol(r_root + (r_tip - r_root) * u ** 1.6, -(k * pitch - 0.72 * pitch * (1.0 - u))))
    return pts


def build(entry: dict, p: dict):
    n = p["nseg"]
    bm = ct.new()
    # aged brass: flange + drum + bored hub, one revolved profile (r, z)
    drum = [(BORE_R, -6.0), (14.4, -6.0), (15.0, -5.4), (15.0, -4.6), (14.0, -4.4), (14.0, -0.9), (14.4, -0.6), (14.4, 0.6),
            (14.0, 0.9), (14.0, 4.2), (BORE_R, 4.2)]
    ct.merge(bm, ct.shell_lathe(drum, n), 0)
    # polished brass: cover plate with a rolled rim and a raised boss
    cover = [(BORE_R, 4.1), (14.2, 4.1), (14.8, 4.5), (14.8, 5.0), (14.4, 5.4), (7.0, 5.4), (6.6, 6.0), (BORE_R, 6.0)]
    ct.merge(bm, ct.shell_lathe(cover, n), 1)
    # polished brass: the ratchet ring, raised 0.5 mm from the cover (z 5.4 -> 5.9), bored to leave the boss free
    ct.merge(bm, ct.shell_prism(ratchet_outline(p["teeth"], p["r_tip"], p["r_root"]), 5.2, 5.9, 0.0, holes=[ct.circle(7.6, 20)]), 1)
    obj = mc.make_object(bm, entry["meshes"][0], [AB, PB])
    obj["wu"] = dict(id=entry["id"], family=FAMILY, ratchetTeeth=p["teeth"], boreRadiusMm=BORE_R, rotationAxis="+Z", holds="spring_standard")
    col = empties.add_collider(obj, "Grab", "sphere", p["grab"], (0, 0, 0))
    return [obj, col], dict(origin=("centre", "centre", "centre"), thin_axis_z=True, closed=True)


if __name__ == "__main__":
    raise SystemExit("gen_spring_barrel.py is a forge family. Run blender/scripts/forge.py --family spring --only spring_barrel --out-root <dir>")
