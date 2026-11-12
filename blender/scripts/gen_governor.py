"""gen_governor.py - the governor family: the Music Box's speed regulator, a fly-ball (Watt) governor in brass (forge family).

    "$B" --background --factory-startup --python-exit-code 1 --python blender/scripts/forge.py -- \
         --family governor --only governor_standard --out-root <dir>

Two nodes, as the manifest asks (meshes Governor_Frame and Governor_Weights):
  Governor_Frame   (root, Mat_AgedBrass)     two ring plates joined by three posts: the static cage, 24 mm across and 30 mm tall.
  Governor_Weights (child, Mat_PolishedBrass) the moving part: a bored sleeve (radius 4.0 mm: it rides on the 8 mm shaft), a hinge
                    collar on top and a sliding collar below, three arms and three links, and three fly balls. The node is
                    modelled in place about the axis (identity transform, origin = the rotation centre) with nothing static
                    beneath it, so the runtime rotates it about local +Z from the solver angle and nothing drifts.
PIV_WeightsAxis marks that axis. The balls are fixed at their running position (the swing out with speed is not modelled).

Model space: rotation axis = local +Z, origin = centre of the bore, built in mm and exported in metres.
"""
from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np

import wu_common as wu
from lib import empties

import gen_mech_common as mc

FAMILY = "governor"
BORE_R = 4.0
PARAMS = {"governor_standard": dict(grab_radius=0.012)}      # 12 mm: the minimum, and the governor's own radius

PLATE_R, PLATE_Z0, PLATE_Z1 = 12.0, 12.5, 15.0               # ring plates at |z| 12.5 to 15
POST_R, POST_RAD = 0.9, 10.9                                 # three posts on a 10.9 mm circle
BALL_R, BALL_AT = 2.5, 8.2                                   # fly ball radius and the radius of its centre
POST_AT = (90.0, 210.0, 330.0)                               # degrees
ARMS_AT = (30.0, 150.0, 270.0)                               # the balls hang between the posts


def plate_loop(sign):
    z0, z1 = sign * PLATE_Z0, sign * PLATE_Z1
    return [(5.3, z1), (11.6, z1), (PLATE_R, z1 - sign * 0.4), (PLATE_R, z0 + sign * 0.4), (11.6, z0), (5.3, z0)]


def sleeve_loop():
    """Bored sleeve: bore 4.0 mm, ends within the plate openings, hinge collar on top and sliding collar below."""
    return [(4.5, -14.2), (4.9, -13.8), (4.9, -9.6), (5.6, -9.2), (5.6, -6.8), (4.9, -6.4), (4.9, 6.4), (5.6, 6.8), (5.6, 9.2),
            (4.9, 9.6), (4.9, 13.8), (4.5, 14.2), (BORE_R, 14.2), (BORE_R, -14.2)]


def build(entry: dict, params: dict):
    # ---- frame: two plates and three posts
    fb = mc.bmesh.new()
    for sign in (+1, -1):
        mc.lathe(fb, plate_loop(sign), nseg=20)
    for deg in POST_AT:
        t = math.radians(deg)
        x, y = POST_RAD * math.cos(t), POST_RAD * math.sin(t)
        mc.bar(fb, (x, y, -13.6), (x, y, 13.6), POST_R, nseg=6)
    frame = mc.make_object(fb, entry["meshes"][0], [entry["materials"][0]])
    frame["wu"] = dict(id=entry["id"], family=FAMILY, shaftBoreRadiusMm=BORE_R, rotationAxis="+Z", movingNode=entry["meshes"][1])
    # ---- weights: sleeve, arms, links, balls
    wb = mc.bmesh.new()
    mc.lathe(wb, sleeve_loop(), nseg=14)
    for deg in ARMS_AT:
        t = math.radians(deg)
        c, s = math.cos(t), math.sin(t)
        mc.bar(wb, (5.3 * c, 5.3 * s, 8.2), (BALL_AT * c, BALL_AT * s, 1.0), 0.65, nseg=6)      # arm: hinge collar to ball
        mc.bar(wb, (5.3 * c, 5.3 * s, -8.0), (BALL_AT * c, BALL_AT * s, -1.0), 0.5, nseg=6)    # link: sliding collar to ball
        mc.sphere(wb, (BALL_AT * c, BALL_AT * s, 0.0), BALL_R, nseg=10, nrings=6)
    weights = mc.make_object(wb, entry["meshes"][1], [entry["materials"][1]], parent=frame)
    weights["wu"] = dict(id=entry["id"], family=FAMILY, role="moving", rotationAxis="+Z")
    col = empties.add_collider(frame, "Grab", "sphere", params["grab_radius"])
    piv = empties.add_pivot(frame, "WeightsAxis", (0.0, 0.0, 0.0), (0.0, 0.0, 1.0), "rotation_axis", "+Z")

    def fits(g, objs):
        c = np.empty(len(weights.data.vertices) * 3)
        weights.data.vertices.foreach_get("co", c)
        c = c.reshape(-1, 3)
        r = np.hypot(c[:, 0], c[:, 2])                                        # the axis is Blender Y
        bore = r[r < 4.4e-3]
        pf = np.empty(len(frame.data.vertices) * 3)
        frame.data.vertices.foreach_get("co", pf)
        pf = pf.reshape(-1, 3)
        # clearances, measured: sleeve outer radius vs the plate openings, ball reach vs the plate radius
        sleeve_max = float(r[np.abs(c[:, 1]) > 13.0e-3].max())
        ball_reach = float(r.max())
        g.info.update(boreRadiusMm=round(float(bore.min()) * 1000, 4), sleeveInPlateMm=round(sleeve_max * 1000, 3),
                      ballReachMm=round(ball_reach * 1000, 3))
        if abs(float(bore.min()) - BORE_R * 1e-3) > 5e-5:
            g.fail("Q13", f"bore radius {bore.min() * 1000:.4f} mm, expected {BORE_R} mm")
        if ball_reach * 1000 > PLATE_R - 0.5:
            g.fail("Q13", f"balls reach {ball_reach * 1000:.2f} mm, beyond the {PLATE_R} mm plates")
        if sleeve_max * 1000 > 5.3 - 0.1:
            g.fail("Q13", f"sleeve radius {sleeve_max * 1000:.2f} mm does not clear the 5.3 mm plate opening")

    return [frame, weights, col, piv], dict(origin=("centre", "centre", "centre"), closed=True, checks=[fits])


if __name__ == "__main__":
    raise SystemExit("gen_governor.py is a forge family. Run blender/scripts/forge.py --family governor --only <ids> --out-root <dir>")
