"""gen_escapement.py - the Clock Tower escapement: a hooked-tooth escape wheel and its rocking anchor (forge family 'escapement').

    "$B" --background --factory-startup --python-exit-code 1 --python blender/scripts/forge.py -- \
         --family escapement --only escapement_wheel,escapement_anchor --out-root <dir> --owner Machines

escapement_wheel   35.0 mm across, 24 hooked teeth (tip radius 17.5, root 14.4), a pierced rim on five curved spokes and a bored hub
                   (bore radius 4.0 mm, the shaft's 8 mm). Tooth 0 tip on +X. Turns clockwise seen from +Z. Origin: the rotation centre.
escapement_anchor  30 x 20 mm: two pallet blocks joined to a bored hub by curved arms, and a crutch arm with a fork eye pointing up. The
                   arbor (origin) is 20.6 mm above the wheel's centre; at that distance the pallets sit on the wheel's tip circle at
                   +-39 degrees from vertical, 78 degrees = 6.5 teeth apart (a locking span). Origin: the arbor, bbox centred in x and y.
Both: rotation axis local +Z, thin axis z, one mesh in Mat_AgedBrass, built in mm and exported in metres. Moving-part rule: the part
is one node with its pivot at the origin (the solver turns the wheel and rocks the anchor).
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

FAMILY = "escapement"
BORE_R = 4.0
BRASS = "Mat_AgedBrass"

W = dict(teeth=24, r_tip=17.5, r_root=14.4, r_rim_in=12.4, rim_half=1.7, hub_r=6.6, hub_half=2.0, spoke_half=1.3, spokes=5, grab=0.0175)
A = dict(arbor_to_wheel=20.6, pallet_deg=39.0, grab=0.012)

PARAMS = {"escapement_wheel": W, "escapement_anchor": A}


def tooth_outline(p):
    """Closed outline of the toothed rim (mm). Per tooth: valley, a concave claw ramp (4 points) up to the tip, then a steep front face
    down to the next valley. Tips sit on multiples of the pitch angle, so tooth 0 is on +X. Mirrored so the wheel turns clockwise."""
    n, rt, rr = p["teeth"], p["r_tip"], p["r_root"]
    pitch = 360.0 / n
    pts = []
    for k in range(n):
        tip = k * pitch
        for u in (0.0, 0.40, 0.70, 0.90, 1.0):
            r = rr + (rt - rr) * u ** 1.8
            pts.append(ct.pol(r, -(tip - 0.70 * pitch * (1.0 - u))))
    return pts


def spoke_poly(p, k):
    base = 360.0 / p["spokes"] * k + 18.0
    c = [ct.pol(5.6 + (13.6 - 5.6) * i / 4, base + 24.0 * (i / 4) ** 1.3) for i in range(5)]
    return ct.strip(c, 2.6, 1.7)


def build_wheel(entry, p):
    bm = ct.new()
    rim = ct.shell_prism(tooth_outline(p), -p["rim_half"], p["rim_half"], 0.0, holes=[ct.circle(p["r_rim_in"], p["teeth"])])
    ct.merge(bm, rim)
    hub = ct.shell_lathe([(BORE_R, -p["hub_half"]), (p["hub_r"] - 0.5, -p["hub_half"]), (p["hub_r"], -p["hub_half"] + 0.5), (p["hub_r"], p["hub_half"] - 0.5),
                          (p["hub_r"] - 0.5, p["hub_half"]), (BORE_R, p["hub_half"])], 20)
    ct.merge(bm, hub)
    for k in range(p["spokes"]):
        ct.merge(bm, ct.shell_prism(spoke_poly(p, k), -p["spoke_half"], p["spoke_half"], 0.25))
    obj = mc.make_object(bm, entry["meshes"][0], [BRASS])
    obj["wu"] = dict(id=entry["id"], family=FAMILY, teeth=p["teeth"], tipRadiusMm=p["r_tip"], boreRadiusMm=BORE_R, rotationAxis="+Z", turns="clockwise seen from +Z")
    col = empties.add_collider(obj, "Grab", "sphere", p["grab"], (0, 0, 0))
    return [obj, col], dict(origin=("centre", "centre", "centre"), thin_axis_z=True, closed=True)


def pallet(sign):
    pts = [(10.6, -5.0), (14.2, -3.4), (15.0, -7.0), (11.9, -10.18)]
    return [(sign * x, y) for x, y in pts] if sign > 0 else [(-x, y) for x, y in pts][::-1]


def build_anchor(entry, p):
    bm = ct.new()
    ct.merge(bm, ct.shell_lathe([(BORE_R, -2.0), (5.9, -2.0), (6.4, -1.5), (6.4, 1.5), (5.9, 2.0), (BORE_R, 2.0)], 24))
    for s in (1, -1):
        centre = [(s * x, y) for x, y in ((3.6, -2.2), (7.4, -3.0), (10.6, -4.8), (12.2, -6.2))]
        ct.merge(bm, ct.shell_prism(ct.strip(centre, 3.1, 2.6), -1.4, 1.4, 0.25))
        ct.merge(bm, ct.shell_prism(pallet(s), -1.7, 1.7, 0.25))
    crutch =[(-1.5, 2.0), (1.5, 2.0), (1.4, 8.6)] + ct.arc((0.0, 8.6), 1.4, 0, 180, 8)[1:-1] + [(-1.4, 8.6)]
    ct.merge(bm, ct.shell_prism(crutch, -1.2, 1.2, 0.2, holes=[ct.circle(0.6, 8, (0.0, 8.4))]))
    obj = mc.make_object(bm, entry["meshes"][0], [BRASS])
    obj["wu"] = dict(id=entry["id"], family=FAMILY, arborToWheelCentreMm=p["arbor_to_wheel"], palletSpanDeg=2 * p["pallet_deg"], rotationAxis="+Z",
                     fitsWheel="escapement_wheel", note="the crutch tip (y +8.4) carries the pendulum fork pin")
    col = empties.add_collider(obj, "Grab", "sphere", p["grab"], (0, 0, 0))
    return [obj, col], dict(origin=("centre", "centre", "centre"), thin_axis_z=True, closed=True)


def build(entry: dict, params: dict):
    return (build_wheel if entry["id"] == "escapement_wheel" else build_anchor)(entry, params)


if __name__ == "__main__":
    raise SystemExit("gen_escapement.py is a forge family. Run blender/scripts/forge.py --family escapement --only <ids> --out-root <dir>")
