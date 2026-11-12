"""gen_pendulum.py - the Clock Tower pendulum: a brass rod with a lenticular bob (forge family 'pendulum').

    "$B" --background --factory-startup --python-exit-code 1 --python blender/scripts/forge.py -- \
         --family pendulum --only pendulum_clock --out-root <dir> --owner Machines

18 x 70 x 6 mm hanging DOWN (-Y) from its suspension point, which is the origin (the top of the suspension block, centred in x and z).
Two nodes, as the manifest asks: Pendulum_Rod (root, Mat_AgedBrass: suspension block with a pin, the rod, two turned collars and the
adjusting nut) and Pendulum_Bob (child, Mat_PolishedBrass: a lens 18 mm across and 6 mm thick, with a raised sun boss ringed by a groove).
The group swings about local +Z through PIV_Suspension at the origin: the bob is built in place with identity transform, so rotating the
root rotates both and nothing drifts. COL_Grab (radius 12 mm, the minimum) is centred on the bob.
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

FAMILY = "pendulum"
AB, PB = "Mat_AgedBrass", "Mat_PolishedBrass"
PARAMS = {"pendulum_clock": dict(bob_y=-58.0, bob_r=9.0, rod_r=1.1, length=70.0, grab=0.012)}


def build(entry: dict, p: dict):
    by, L = p["bob_y"], p["length"]
    rod = ct.new()
    ct.merge(rod, ct.shell_box((-3.2, -3.4, -1.5), (3.2, 0.0, 1.5), 0.35))                                     # suspension block, top at y = 0
    ct.merge(rod, ct.shell_box((-1.0, -5.6, -1.0), (1.0, -3.0, 1.0), 0.2))                                      # tongue under the block
    ct.merge(rod, ct.lathe_along([(0, 0), (p["rod_r"], 0), (p["rod_r"], L - 5.0 - 2.4), (0, L - 5.0 - 2.4)], 10, (0, -1, 0), (0, -5.0, 0)))   # the rod to y = -(L - 2.4), inside the nut
    for y0, h in ((-14.0, 2.6), (-24.0, 1.4)):                                                                  # turned collars
        ct.merge(rod, ct.lathe_along([(0, 0), (2.0, 0), (2.4, 0.4), (2.4, h - 0.4), (2.0, h), (0, h)], 14, (0, -1, 0), (0, y0, 0)))
    ct.merge(rod, ct.lathe_along([(0, 0), (2.5, 0), (2.9, 0.5), (2.9, 2.9), (2.5, 3.4), (0, 3.4)], 6, (0, -1, 0), (0, -(L - 3.4), 0)))   # hex adjusting nut, bottom at y = -L
    root = mc.make_object(rod, entry["meshes"][0], [AB])
    root["wu"] = dict(id=entry["id"], family=FAMILY, swingAxis="+Z", pivot="PIV_Suspension", bobCentreMm=[0.0, by, 0.0], rotationAxis="+Z")
    bob = ct.new()
    r = p["bob_r"]
    lens = [(0.0, 3.0), (2.6, 3.0), (3.0, 2.5), (3.8, 2.5), (4.2, 3.0), (5.2, 3.0), (6.2, 2.5), (8.0, 1.7), (r - 0.3, 1.0), (r, 0.5), (r, -0.5),
            (r - 0.3, -1.0), (8.0, -1.7), (6.2, -2.5), (5.2, -3.0), (0.0, -3.0)]
    ct.merge(bob, ct.shell_lathe(lens, 36, 0.0, (0.0, by)))
    bobo = mc.make_object(bob, entry["meshes"][1], [PB], parent=root)
    piv = empties.add_pivot(root, "Suspension", (0, 0, 0), (0, 0, 1), "rotation_axis", "+Z")
    col = empties.add_collider(root, "Grab", "sphere", p["grab"], (0, by * 1e-3, 0))
    return [root, bobo, piv, col], dict(origin=("centre", "max", "centre"), closed=True)


if __name__ == "__main__":
    raise SystemExit("gen_pendulum.py is a forge family. Run blender/scripts/forge.py --family pendulum --only pendulum_clock --out-root <dir>")
