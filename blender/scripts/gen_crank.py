"""gen_crank.py - forge family `crank`: crank_standard. Built with the shared Mechanical-library toolkit (gen_mech_extras.py).

    "$B" --background --factory-startup --python-exit-code 1 --python blender/scripts/forge.py --          --family crank --only crank_standard --out-root <dir>

Size 40 x 12 x 8 mm (ADR-042, TOCKTON_DIMENSIONS section 11): x runs from the hub's -6.0 mm to THROW + the arm's 4.4 mm end radius, so the throw
(hub centre to crank pin) is 29.6 mm. The earlier 28 mm throw gave 38.4 mm.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import gen_mech_common as mc
from gen_mech_extras import (bore_cutter, box_col, capsule, cut, finish, lathe_bm, prism_bm, rivet_bm, union)

FAMILY = "crank"
THROW = 29.6                                          # hub centre to crank pin (+X): -6.0 (hub) to 29.6 + 4.4 (arm end) = 40.0 mm
PARAMS = {"crank_standard": {}}


def build(entry, params):
    A = THROW
    hub = lathe_bm([(0.0, -2.8), (5.4, -2.8), (6.0, -2.2), (6.0, 2.2), (5.4, 2.8), (0.0, 2.8)], 24)    # 24 segments: vertices on the y axis, so the box is exactly 12.0 mm
    arm = prism_bm(capsule((0.0, 0.0), (A, 0.0), 5.0, 4.4, 8), -1.6, 1.6)
    pin = lathe_bm([(0.0, 1.0), (2.0, 1.0), (2.0, 2.4), (2.9, 2.4), (3.4, 2.9), (3.4, 4.7), (2.9, 5.2), (0.0, 5.2)], 20, center=(A, 0.0))
    bm = union(arm, [hub, pin])
    slot = prism_bm(capsule((11.0, 0.0), (22.0, 0.0), 1.5, 1.5, 6), -3.0, 3.0)
    bm = cut(bm, [bore_cutter(2.8), slot])
    mc.bevel_hard(bm, 0.35)
    mc.clean(bm)
    items = [(8.3, y, sign * 1.6, sign, 0.7, 0.55) for sign in (1, -1) for y in (-3.0, 3.0)]
    bm = union(bm, [rivet_bm(items, params.get("rivet_nseg", 6))])
    return finish(bm, entry, dict(throwMm=A, handleSide="+Z"), box_col((0.020, 0.006, 0.004), (0.014, 0.0, 0.0012)))


if __name__ == "__main__":
    raise SystemExit("gen_crank.py is a forge family. Run blender/scripts/forge.py --family crank --only crank_standard --out-root <dir>")
