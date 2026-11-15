"""gen_governor.py - the governor family: the Music Box's speed regulator, a fly-ball (Watt) governor in brass (forge family).

    "$B" --background --factory-startup --python-exit-code 1 --python blender/scripts/forge.py -- \
         --family governor --only governor_standard --out-root <dir>

Size 30.6 x 24 x 34.2 mm (ADR-042, MUSIC_BOX_BLUEPRINT sections 6.1, 6.3 and 11). Local +Z is the spindle (Music Box +X), the origin is the
centre of the weights on that axis (the socket position); local -X points at the Music Box's front wall. The frame arm stops 15.45 mm from the
axis (case governor socket z 21.299, so the arm end is at z 36.75): the three bolt heads of the case's Seat_Governor pad stand to z 36.95, the
pad plate's top is z 37.4 and its locating peg (r 2.0 mm) reaches z 33.2, so the arm ends 0.2 mm short of the bolt heads (0.65 mm short of the
plate) and its end is a fork (FORK_HALF, FORK_DEPTH) that clips round the peg. The oval plate (15.15 and 12.0 mm semi-axes) makes up the
approved 30.6 mm in x. If the socket or the pad changes, change ARM_END (and PLATE_RX = 30.6 - |ARM_END|).

Two nodes, as the manifest asks (meshes Governor_Frame and Governor_Weights):
  Governor_Frame   (root, Mat_AgedBrass)     the static part: a bearing plate (24 mm high, z 7 to 12) with a frame arm that runs 17.7 mm from the
                    spindle to the front wall's Seat_Governor, and three guard posts that reach back over the weights.
  Governor_Weights (child, Mat_PolishedBrass) the moving part, in place about the axis (identity transform, nothing static beneath it): the
                    SPINDLE (7.6 mm, so it rides in the 12T pinion's 8.0 mm bore), a sliding collar and a hinge collar, three arms and three links, and
                    three fly balls. The spindle runs from z -22.2 (flush with the pinion's outer face) through the plate's bearing bore to z 11.6.
Axial layout (mm, local z): pinion -22.2 to -7.0 (a separate part on the spindle), 1.0 mm clear, weights -6.0 to 6.0, 1.0 mm clear, plate 7.0 to 12.0.
Nothing but the 7.6 mm spindle lies in the pinion's z range, and the balls (reach 9.9 mm) clear the posts (inner face 10.3 mm).
PIV_WeightsAxis marks the axis. The balls are fixed at their running position (the swing out with speed is not modelled).
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
import gen_fastener as fast

FAMILY = "governor"
BORE_R = 4.0                                                  # the 12T pinion's bore radius
PARAMS = {"governor_standard": dict(grab_radius=0.012)}      # 12 mm: the minimum, and the governor's own radius

R_SPINDLE = 3.8                                              # 7.6 mm spindle in the 8.0 mm bore
Z_TIP, Z_END = -22.2, 11.6                                   # spindle from the pinion's outer face to inside the bearing plate
PLATE_RX, PLATE_RY, PLATE_Z0, PLATE_Z1 = 15.15, 12.0, 7.0, 12.0  # bearing plate: 24 mm high, 30.3 wide (an oval plate), 5 mm thick (the blueprint's frame arm, x 2.88 to 2.38 cm)
PLATE_BORE = 4.3                                             # bearing bore, 0.5 mm over the spindle
ARM_END, ARM_HALF = -15.45, 5.0                              # frame arm end: 15.45 mm from the spindle = z 36.75, 0.2 mm short of the Seat_Governor bolt heads (z 36.95; pad plate top z 37.4)
FORK_HALF, FORK_DEPTH = 2.2, 4.0                             # the arm end is a fork round the pad's locating peg (r 2.0 mm, tip z 33.2 = 3.55 mm behind the arm end): 0.2 mm each side, 0.45 mm deep
POST_R, POST_RAD, POST_Z = 0.7, 11.0, -5.5                   # three guard posts from the plate down to z -5.5
POST_AT = (90.0, 210.0, 330.0)                               # degrees
BALL_R, BALL_AT = 2.4, 7.5                                   # fly ball radius and the radius of its centre (reach 9.9 mm)
ARMS_AT = (30.0, 150.0, 270.0)                               # the balls hang between the posts
COLLAR_R = 5.4                                               # sliding collar (z -6.0 to -3.4) and hinge collar (z 3.4 to 6.0)


def spindle_loop():
    """Solid spindle (turns with the weights): plain 7.6 mm shaft, two collars, chamfered tips."""
    return [(0.0, Z_TIP), (3.2, Z_TIP), (R_SPINDLE, Z_TIP + 0.6), (R_SPINDLE, -6.0),
            (4.9, -6.0), (COLLAR_R, -5.5), (COLLAR_R, -3.9), (4.9, -3.4), (R_SPINDLE, -3.4),
            (R_SPINDLE, 3.4), (4.9, 3.4), (COLLAR_R, 3.9), (COLLAR_R, 5.5), (4.9, 6.0), (R_SPINDLE, 6.0),
            (R_SPINDLE, Z_END - 0.4), (3.4, Z_END), (0.0, Z_END)]


def plate_outline():
    """Plate disc and frame arm as one outline (counter-clockwise): the disc, open on its -x side, then the arm."""
    phi = math.asin(ARM_HALF / PLATE_RY)
    a0, a1 = -(math.pi - phi), math.pi - phi
    pts = [(PLATE_RX * math.cos(a0 + (a1 - a0) * k / 33), PLATE_RY * math.sin(a0 + (a1 - a0) * k / 33)) for k in range(34)]
    return pts + [(ARM_END, ARM_HALF), (ARM_END, -ARM_HALF)]


def build(entry: dict, params: dict):
    # ---- frame: bearing plate with its arm, guard posts
    fb = mc.bmesh.new()
    mc.prism(fb, plate_outline(), PLATE_Z0, PLATE_Z1)
    bore = mc.bmesh.new()
    mc.lathe(bore, [(0.0, PLATE_Z0 - 1.0), (PLATE_BORE, PLATE_Z0 - 1.0), (PLATE_BORE, PLATE_Z1 + 1.0), (0.0, PLATE_Z1 + 1.0)], nseg=24)
    fork = mc.bmesh.new()
    mc.prism(fork, [(ARM_END - 1.0, -FORK_HALF), (ARM_END + FORK_DEPTH, -FORK_HALF), (ARM_END + FORK_DEPTH, FORK_HALF), (ARM_END - 1.0, FORK_HALF)],
             PLATE_Z0 - 1.0, PLATE_Z1 + 1.0)
    fb = mc.boolean(fb, [bore, fork])
    mc.bevel_hard(fb, 0.4)
    for deg in POST_AT:
        t = math.radians(deg)
        x, y = POST_RAD * math.cos(t), POST_RAD * math.sin(t)
        mc.bar(fb, (x, y, POST_Z), (x, y, PLATE_Z0 + 1.5), POST_R, nseg=6)
    frame = mc.make_object(fb, entry["meshes"][0], [entry["materials"][0]])
    frame["wu"] = dict(id=entry["id"], family=FAMILY, shaftBoreRadiusMm=BORE_R, rotationAxis="+Z", movingNode=entry["meshes"][1],
                       frameArmEndLocalXMm=ARM_END, forkHalfMm=FORK_HALF, forkDepthMm=FORK_DEPTH, spindleZMm=[Z_TIP, Z_END], weightsZMm=[-6.0, 6.0], plateZMm=[PLATE_Z0, PLATE_Z1])
    # ---- weights: spindle, collars, arms, links, balls
    wb = mc.bmesh.new()
    mc.lathe(wb, spindle_loop(), nseg=14)
    for deg in ARMS_AT:
        t = math.radians(deg)
        c, s = math.cos(t), math.sin(t)
        mc.bar(wb, (5.0 * c, 5.0 * s, 4.7), (BALL_AT * c, BALL_AT * s, 1.0), 0.6, nseg=6)       # arm: hinge collar to ball
        mc.bar(wb, (5.0 * c, 5.0 * s, -4.7), (BALL_AT * c, BALL_AT * s, -1.0), 0.5, nseg=6)     # link: sliding collar to ball
        mc.sphere(wb, (BALL_AT * c, BALL_AT * s, 0.0), BALL_R, nseg=8, nrings=5)
    weights = mc.make_object(wb, entry["meshes"][1], [entry["materials"][1]], parent=frame)
    weights["wu"] = dict(id=entry["id"], family=FAMILY, role="moving", rotationAxis="+Z", spindleRadiusMm=R_SPINDLE)
    col = empties.add_collider(frame, "Grab", "sphere", params["grab_radius"])
    piv = empties.add_pivot(frame, "WeightsAxis", (0.0, 0.0, 0.0), (0.0, 0.0, 1.0), "rotation_axis", "+Z")
    # ADR-050 / INTRICATE_ASSEMBLY_DESIGN 8.1, 11.2: the pinion's hub spans z -22.2 to -7.0 (centre -14.6, the blueprint's gear spacing is radial, not axial); the frame
    # screw sits on the bearing plate's outer face (z +12.0), 9.5 mm from the spindle towards the front wall (local -X), well inside the 30.3 mm oval.
    socks = [empties.add_socket(frame, "Pinion", (0.0, 0.0, -14.6e-3), ["spur_gear"], axis_g=(0.0, 0.0, 1.0), slot="governor_pinion", carried=True,
                                note="gear plane centre, slides on from the outboard (-Z) end"),
             fast.hw_socket(frame, "FrameScrew", "screw_slot_m3", (-9.5e-3, 0.0, 12.0e-3), (0.0, 0.0, 1.0), slot="screw_governor_frame", carried=True,
                            note="on the bearing plate's outer face")]

    def verts_mm(o):
        """Mesh vertices in model space, mm: Blender (x, y, z) -> model (x, -z, y); the spindle is model Z = Blender Y... see wu.g2b."""
        c = np.empty(len(o.data.vertices) * 3)
        o.data.vertices.foreach_get("co", c)
        c = c.reshape(-1, 3) * 1000.0
        return c[:, 0], c[:, 2], -c[:, 1]                                      # glTF/model (x, y, z) = Blender (x, z, -y)

    def fits(g, objs):
        wx, wy, wz = verts_mm(weights)
        fx, fy, fz = verts_mm(frame)
        wr, fr = np.hypot(wx, wy), np.hypot(fx, fy)
        in_pinion = wz < -7.0 + 1e-6                                            # the pinion lies at z -22.2 to -7.0
        spindle_max = float(wr[in_pinion].max())
        frame_in_pinion = int((fz < -7.0 + 1e-6).sum())
        ball_reach = float(wr[np.abs(wz) < 3.0].max())
        post_inner = POST_RAD - POST_R
        bore_min = float(fr[(fz > PLATE_Z0 - 1e-3) & (fr < 5.0)].min())
        g.info.update(spindleMaxRadiusMm=round(spindle_max, 4), ballReachMm=round(ball_reach, 3), postInnerMm=post_inner,
                      plateBoreMm=round(bore_min, 3), frameVertsInPinionZone=frame_in_pinion,
                      sizeFrameMm=[round(float(fx.max() - fx.min()), 3), round(float(fy.max() - fy.min()), 3), round(float(fz.max() - fz.min()), 3)])
        if spindle_max > BORE_R - 0.1:
            g.fail("Q13", f"spindle radius {spindle_max:.3f} mm leaves no clearance in the pinion's {BORE_R} mm bore")
        if frame_in_pinion:
            g.fail("Q13", f"{frame_in_pinion} frame vertices lie in the pinion's z range")
        if ball_reach > post_inner - 0.3:
            g.fail("Q13", f"balls reach {ball_reach:.2f} mm, the posts' inner face is {post_inner:.2f} mm")
        if bore_min < R_SPINDLE + 0.3:
            g.fail("Q13", f"plate bore {bore_min:.2f} mm does not clear the {R_SPINDLE} mm spindle")

    return [frame, weights, col, piv] + socks, dict(closed=True, checks=[fits])


if __name__ == "__main__":
    raise SystemExit("gen_governor.py is a forge family. Run blender/scripts/forge.py --family governor --only <ids> --out-root <dir>")
