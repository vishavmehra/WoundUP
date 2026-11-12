"""gen_shaft.py - the shaft family: turned aged-brass shafts with stepped journals and banded stop collars (forge family).

    "$B" --background --factory-startup --python-exit-code 1 --python blender/scripts/forge.py -- \
         --family shaft --only shaft_short,shaft_long --out-root <dir>

Fit: the spur gears' bore is 8.0 mm (radius 4.0). The shaft body is 7.6 mm, the two stop collars are exactly 8.0 mm, so a gear
slides on the body and stops against a collar, and the part's width is the 8.0 mm of TOCKTON_DIMENSIONS. Model space: rotation
axis = local +Z, origin = midpoint of the length, built in mm and exported in metres.
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np

import wu_common as wu
from lib import empties

import gen_mech_common as mc

FAMILY = "shaft"
BORE_R = 4.0                           # the gears' bore radius (gen_gear_spur GearParams.bore / 2)
R_BODY, R_COLLAR, R_JOURNAL = 3.8, 4.0, 3.2
PARAMS = {
    "shaft_short": dict(length=90.0),   # TOCKTON_DIMENSIONS 11: the Music Box arbor needs 9.2 cm of its 11.8 cm interior
    "shaft_long": dict(length=150.0),   # between the Carousel's 11 cm and the Windmill's 16 cm (Q16, owner decision pending)
}


def half_profile():
    """(r, z) from the end face inwards, z measured from the end (mm)."""
    return [(0.0, 0.0), (2.7, 0.0), (R_JOURNAL, 0.5),                  # chamfered tip
            (R_JOURNAL, 7.5), (R_BODY, 8.1),                           # journal, then a chamfered shoulder up to the body
            (R_BODY, 9.9), (R_COLLAR, 10.1), (R_COLLAR, 10.9),         # stop collar: chamfered band ...
            (3.62, 11.4), (R_COLLAR, 11.9),                            # ... with a turned V groove ...
            (R_COLLAR, 12.7), (R_BODY, 12.9)]                          # ... and a chamfered back edge


def build(entry: dict, params: dict):
    L = params["length"]
    h = L / 2.0
    hp = half_profile()
    lower = [(r, -h + z) for r, z in hp]                               # from the -Z end towards the middle
    upper = [(r, h - z) for r, z in hp][::-1]                          # from the middle to the +Z end
    loop = lower + upper
    bm = mc.bmesh.new()
    mc.lathe(bm, loop, nseg=28)
    name = entry["meshes"][0]
    obj = mc.make_object(bm, name, [entry["materials"][0]])
    obj["wu"] = dict(id=entry["id"], family=FAMILY, lengthMm=L, boreFitRadiusMm=BORE_R, rotationAxis="+Z")
    col = empties.add_collider(obj, "Grab", "box", (0.012, 0.012, h * mc.MM))   # 12 mm half-extent across, the whole length along

    def fits_the_bore(g, objs):
        c = np.empty(len(obj.data.vertices) * 3)
        obj.data.vertices.foreach_get("co", c)
        c = c.reshape(-1, 3)
        rmax = float(np.hypot(c[:, 0], c[:, 2]).max())                  # the shaft axis is Blender Y
        g.info.update(maxRadiusMm=round(rmax * 1000, 4), lengthMm=round((c[:, 1].max() - c[:, 1].min()) * 1000, 3))
        if rmax > BORE_R * 1e-3 + 1e-6:
            g.fail("Q13", f"shaft radius {rmax * 1000:.4f} mm is over the gears' {BORE_R} mm bore")
        if abs((c[:, 1].max() - c[:, 1].min()) * 1000 - L) > 0.01:
            g.fail("Q13", f"shaft length is not {L} mm")

    return [obj, col], dict(origin=("centre", "centre", "centre"), closed=True, checks=[fits_the_bore])


if __name__ == "__main__":
    raise SystemExit("gen_shaft.py is a forge family. Run blender/scripts/forge.py --family shaft --only <ids> --out-root <dir>")
