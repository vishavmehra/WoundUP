"""gen_winding_key.py - the winding key: a polished-brass double-lobed bow on a collared stem with a square drive (forge family).

    "$B" --background --factory-startup --python-exit-code 1 --python blender/scripts/forge.py -- \
         --family winding_key --only winding_key --out-root <dir>

The "Standard (functional)" key of the Springs and Winding board: two oval lobes with open eyes, a central spine, a stem with a
shoulder collar and a bead, and a 5 x 5 mm square drive. The player pinches the bow and turns the wrist about the drive axis (local +Z).
Size 30 x 6 x 40 mm (TOCKTON_DIMENSIONS section 11: bow 30 x 24 mm, 40 mm along the turn axis). Material slot 0 Mat_PolishedBrass (bow and
spine), slot 1 Mat_AgedBrass (stem and drive): two primitives, as the manifest budget allows.

Model space: turn axis = local +Z, origin = centre of the drive square, bow towards +Z, bow plane = XZ, built in mm, exported in metres.
"""
from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import wu_common as wu
from lib import empties
from mathutils import Vector

import gen_mech_common as mc

FAMILY = "winding_key"
PARAMS = {"winding_key": dict(grab_radius=0.018)}              # the key is small: a 18 mm pinch target at the bow, mesh not enlarged

LOBE_AT, LOBE_A, LOBE_B, BOW_Z = 7.4, 5.6, 10.0, 24.0         # lobe centre x, path semi-axes (x, z), bow centre z
TUBE_W, TUBE_T, CH = 2.0, 3.0, 1.0                             # tube half width (in plane), half thickness (y), section chamfer

STEM = [(0.0, 3.0), (2.4, 3.0), (3.0, 3.6), (3.0, 5.0), (2.3, 5.7), (2.3, 7.2), (2.9, 7.6), (2.9, 8.6), (2.3, 9.0), (2.3, 13.0),
        (0.0, 13.0)]
SECTION = [(TUBE_W, -TUBE_T + CH), (TUBE_W, TUBE_T - CH), (TUBE_W - CH, TUBE_T), (-TUBE_W + CH, TUBE_T), (-TUBE_W, TUBE_T - CH),
           (-TUBE_W, -TUBE_T + CH), (-TUBE_W + CH, -TUBE_T), (TUBE_W - CH, -TUBE_T)]


def build(entry: dict, params: dict):
    bm = mc.bmesh.new()
    before = mc.snapshot(bm)
    for sx in (-1, 1):                                          # the two lobes: oval tubes in the XZ plane
        path = [Vector((sx * LOBE_AT + LOBE_A * math.cos(2 * math.pi * k / 26), 0.0, BOW_Z + LOBE_B * math.sin(2 * math.pi * k / 26)))
                for k in range(26)]
        mc.sweep(bm, path, (0, 1, 0), SECTION, closed=True)
    mc.box(bm, (-2.2, -TUBE_T, 11.0), (2.2, TUBE_T, 26.0), bevel=0.9)                          # central spine
    mc.tag_new(bm, before, 0)
    before = mc.snapshot(bm)
    mc.box(bm, (-2.5, -2.5, -4.0), (2.5, 2.5, 3.0), bevel=0.4)                                 # square drive
    mc.lathe(bm, STEM, nseg=18)                                                                # shoulder, bead and neck
    mc.tag_new(bm, before, 1)
    name = entry["meshes"][0]
    obj = mc.make_object(bm, name, entry["materials"])
    obj["wu"] = dict(id=entry["id"], family=FAMILY, turnAxis="+Z", driveSquareMm=5.0, bowMm=[30.0, 24.0])
    col = empties.add_collider(obj, "Grab", "sphere", params["grab_radius"], loc_g=(0.0, 0.0, BOW_Z * mc.MM))
    return [obj, col], dict(closed=True)


if __name__ == "__main__":
    raise SystemExit("gen_winding_key.py is a forge family. Run blender/scripts/forge.py --family winding_key --only winding_key --out-root <dir>")
