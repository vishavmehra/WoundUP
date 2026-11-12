"""gen_cam_hourly.py - the Clock Tower hourly chime cam: a pierced brass disc with ONE ramped trip lobe (forge family 'cam').

    "$B" --background --factory-startup --python-exit-code 1 --python blender/scripts/forge.py -- \
         --family cam --only cam_hourly_chime --out-root <dir> --owner Machines

(Its own generator file: gen_cam.py belongs to the Mechanical library's cam_eccentric.)

25 x 25 x 6 mm: a disc of radius 12.5 (z +-1.2) with five lightening holes, a bored hub (bore radius 4.0, hub radius 6.8, z +-3.0) and a
single curved lobe on the front face (a stepped crescent, four heights rising to a 3.0 mm crest), so the bell's striker lever rides up the
lobe once per turn and is thrown off its crest to strike. The lobe sits at 20 to 72 degrees.
Rotation axis local +Z, origin the rotation centre, one mesh in Mat_AgedBrass, built in mm and exported in metres.
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

FAMILY = "cam"
BORE_R = 4.0
BRASS = "Mat_AgedBrass"
PARAMS = {"cam_hourly_chime": dict(r=12.5, disc_half=1.2, hub_r=6.8, hub_half=3.0, grab=0.0125, lobe_deg=(20.0, 72.0), lobe_r=(8.6, 11.8))}


def lobe_poly(r0, r1, a0, a1, n=6):
    """Crescent polygon between radii r0 < r1 over a0..a1 with rounded (half-width) ends."""
    rm, hw = (r0 + r1) / 2, (r1 - r0) / 2
    d = math.degrees(hw / rm)
    c0, c1 = ct.pol(rm, a0 + d), ct.pol(rm, a1 - d)
    outer = ct.arc((0, 0), r1, a0 + d, a1 - d, n)
    cap1 = ct.arc(c1, hw, a1 - d, a1 - d + 180, 3)[1:-1]
    inner = ct.arc((0, 0), r0, a1 - d, a0 + d, n)
    cap0 = ct.arc(c0, hw, a0 + d + 180, a0 + d + 360, 3)[1:-1]
    return outer + cap1 + inner + cap0


def build(entry: dict, p: dict):
    bm = ct.new()
    holes = [ct.circle(2.3, 8, ct.pol(8.0, 110 + 50 * k)) for k in range(5)]
    ct.merge(bm, ct.shell_prism(ct.circle(p["r"], 36), -p["disc_half"], p["disc_half"], 0.3, holes=holes))
    hh, hr = p["hub_half"], p["hub_r"]
    ct.merge(bm, ct.shell_lathe([(BORE_R, -hh), (hr - 0.5, -hh), (hr, -hh + 0.5), (hr, hh - 0.5), (hr - 0.5, hh), (BORE_R, hh)], 20))
    a0, a1 = p["lobe_deg"]
    r0, r1 = p["lobe_r"]
    for k, top in enumerate((1.6, 2.1, 2.55, 3.0)):                        # stepped ramp: four crescents, each shorter and narrower, the crest last
        ct.merge(bm, ct.shell_prism(lobe_poly(r0 + 0.1 * k, r1 - 0.1 * k, a0 + (a1 - a0) * k / 5.0, a1), 0.8, top, 0.2, top_only=True))
    obj = mc.make_object(bm, entry["meshes"][0], [BRASS])
    obj["wu"] = dict(id=entry["id"], family=FAMILY, lobes=1, lobeDeg=[a0, a1], boreRadiusMm=BORE_R, rotationAxis="+Z")
    col = empties.add_collider(obj, "Grab", "sphere", p["grab"], (0, 0, 0))
    return [obj, col], dict(origin=("centre", "centre", "centre"), thin_axis_z=True, closed=True)


if __name__ == "__main__":
    raise SystemExit("gen_cam_hourly.py is a forge family. Run blender/scripts/forge.py --family cam --only cam_hourly_chime --out-root <dir>")
