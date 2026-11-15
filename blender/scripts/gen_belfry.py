"""gen_belfry.py - the belfry family: the Tockton Belfry housing and its weathervane (forge family 'belfry', Machines agent).

    "$B" --background --factory-startup --python-exit-code 1 --python blender/scripts/forge.py -- \
         --family belfry --only belfry_base,belfry_vane --out-root <dir> --owner Machines [--manifest <file>]

Spec: docs/blueprints/BELFRY_BLUEPRINT.md (sixth machine, ADR-048).

belfry_base   76 x 276 x 58 mm on the 8.0 x 6.0 cm pad `plot_belfry`. One mesh node, Belfry_Plinth (the root, everything static): a stepped stone plinth 35 mm
              tall, a back wall of laid stone blocks that turns into a cream belfry wall with three arched louvres above y 238, a walnut timber frame (four
              corner posts, side girts, two diagonal braces), the belfry deck (hole for the shaft), a walnut bell beam with two brass hooks, a teal flat cap with a
              fascia and the shaft bush, and the brass hardware the parts seat on: Boss_S, Stud_C, Mount_Foot (the bearing's bracket), Seat_BevelB (a hanger and
              a shelf under the lower bevel), Seat_Flywheel (an arm and a horseshoe under the flywheel's rim). The front and the bell's side stay open: the
              works are the show, and the bell and the vane are lifted in from the front. 11 SOCKET_ empties (BELFRY_BLUEPRINT section 7.1) plus SOCKET_BaseHandle,
              COL_Case; PIV_BellSwing (the pins' axis) and PIV_ShaftAxis (the vertical line the shaft group turns about) mark axes for the runtime, nothing in the housing moves.
belfry_vane   64 x 16 x 31 mm. A hub (8 mm bore, blind) with a turned collar and neck, a cross with four ball ends, a pierced-free flat brass arrow (head +X,
              swallow tail -X, a small horizontal tail fin) and a ball finial. Modelled finial-DOWN: the finial is at local -Z (z -27 to +4), because the part's +Z
              points down the tower by the sign rule (socket rotation Rx(+90)), so seated it stands up. Origin on the hub's bore axis, mid-height of the hub;
              turns about local +Z at +0.48 rad/s. COL_Grab sphere r 16 mm at the arrow's centre; PIV_Axis on the bore axis.

Model space (glTF Y-up, millimetres): origin at the centre of the floor-contact face, +Y up, +Z towards the player. The works: spring arbor S (-5, 59), second
axle C (-5, 100), the vertical shaft on x -5, z 11.7 from y 104 to 284. The two axes cross at (-5, 100, 11.7), the apex of the rule; the bevel pair is NOT seated at it:
the library gear_bevel_12 has teeth that dig 0.95 mm into the other gear's root at every phase when both cones touch, so each gear sits further out along its own axis
(BEVEL_A_OUT_MM back along -Z, BEVEL_B_OUT_MM up along +Y, measured over tooth phases on the real GLBs by blender/scripts/bevel_fit.py). Parts seat along -Z (or -Y for the
shaft line), so no stud has a cap.
"""
from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bmesh
import bpy
from mathutils import Matrix, Quaternion

import wu_common as wu
from lib import empties

import gen_mech_common as mc
import gen_ct_common as ct
from gen_clock_tower import ABRASS, BRASS, CREAM, STONE, TEAL, WALNUT, arch, ball_y, box, face_to, finish, hp, horseshoe, lathe_y, put, stroke, vp
from gen_well import block_wall, rotate_y, xprism, zring, zstud

FAMILY = "belfry"
PARAMS = {"belfry_base": dict(), "belfry_vane": dict()}

MATS = [STONE, WALNUT, CREAM, TEAL, ABRASS, BRASS]
ST, WA, PW, TL, AB, BR = range(6)
S_AX = (-5.0, 59.0)
C_AX = (-5.0, 100.0)
SHAFT_X, SHAFT_Z = -5.0, 11.7
Z_PLATE = -23.0
# How far each bevel gear sits out from the apex (-5, 100, 11.7) along its own axis, away from it, millimetres. Found with blender/scripts/bevel_fit.py: with both at
# 0 the pair crosses at every phase (deepest 0.95 mm); at 1.0 and 2.4 it clears all the way round a tooth pitch with 0.42 mm to spare, and the 20T behind bevel A is 1.5 mm off.
BEVEL_A_OUT_MM = 1.0
BEVEL_B_OUT_MM = 2.4


def m(v):
    return tuple(c / 1000.0 for c in v)


def shifted(poly, dx=0.0, dy=0.0):
    return [(x + dx, y + dy) for x, y in poly]


# ======================================================================================
# belfry_base
# ======================================================================================
def build_body():
    bm = ct.new()

    # --- plinth: lower course, upper course, cornice, raised panels --------------------------------------------------
    put(bm, box((-37.4, 0.4, -28.4), (37.4, 12.8, 28.4), 0.3), ST)                       # the plinth's core: the joints between the three bands show it
    for y0, y1 in ((0.0, 4.4), (4.9, 8.9), (9.4, 13.0)):                                # three stone bands, 0.5 mm joints
        put(bm, box((-38.0, y0, -29.0), (38.0, y1, 29.0), 0.5), ST)
    put(bm, box((-36.8, 12.8, -27.8), (36.8, 31.8, 27.8), 0.6), ST)
    put(bm, box((-37.6, 31.6, -28.6), (37.6, 35.0, 28.6), 0.6), ST)
    put(bm, box((-37.7, 33.2, -28.7), (37.7, 33.8, 28.7), 0.2), BR)                     # a brass bead at the cornice
    for x0, x1 in ((-33.0, -12.5), (-9.5, 9.5), (12.5, 33.0)):                          # raised panels on the front of the upper course
        put(bm, box((x0, 17.2, 27.5), (x1, 29.2, 28.5), 0.4), ST)
    for sx in (-1, 1):
        for z0, z1 in ((-24.0, -2.4), (2.4, 24.0)):
            lo, hi = sorted((sx * 36.5, sx * 37.4))
            put(bm, box((lo, 17.2, z0), (hi, 29.2, z1), 0.4), ST)

    # --- back wall: stone blocks below the belfry, cream wall with three arched louvres above ----------------------
    put(bm, box((-34.9, 34.9, -28.4), (34.9, 238.2, -24.8), 0.3), ST)
    n_blocks = block_wall(bm, ST, -33.6, 33.6, 36.0, 236.0, Z_PLATE, -25.6, rowh=11.0, bw=14.6)
    arches = [shifted(arch(8.5, 241.0, 257.0, 12), cx) for cx in (-24.0, 0.0, 24.0)]
    put(bm, hp([(-34.9, 237.9), (34.9, 237.9), (34.9, 273.9), (-34.9, 273.9)], -28.4, Z_PLATE, 0.4, holes=arches), PW)
    for cx in (-24.0, 0.0, 24.0):
        put(bm, hp(shifted(horseshoe(8.6, 10.6, 241.0, 257.0, 12), cx), Z_PLATE - 0.02, Z_PLATE + 0.7, 0.25), WA)
    put(bm, box((-35.3, 236.4, -28.9), (35.3, 239.2, -22.6), 0.4), WA)                  # sill course above the stone
    # left wall of the belfry: two arched louvres along z (no wall on the right, where the bell is, and none at the front)
    arches_l = [shifted(arch(9.0, 241.0, 256.0, 12), cz) for cz in (-12.0, 13.0)]
    put(bm, hp([(-27.9, 237.95), (27.9, 237.95), (27.9, 273.9), (-27.9, 273.9)], 33.8, 37.2, 0.4, holes=arches_l), PW, 3)
    for cz in (-12.0, 13.0):
        put(bm, hp(shifted(horseshoe(9.1, 11.1, 241.0, 256.0, 12), cz), 36.6, 37.4, 0.25), WA, 3)

    # --- timber frame: four posts, side girts, diagonal braces, deck, bell beam ------------------------------------
    for sx in (-1, 1):
        lo, hi = sorted((sx * 33.9, sx * 37.2))
        put(bm, box((lo, 34.9, 25.4), (hi, 273.9, 28.3), 0.5), WA)                      # front post
        put(bm, box((lo, 34.9, -28.3), (hi, 273.9, -22.5), 0.5), WA)                    # back post
        lo2, hi2 = sorted((sx * 33.95, sx * 37.15))
        put(bm, box((lo2, 148.6, -28.25), (hi2, 153.0, 28.25), 0.5), WA)                # side girt
        for y in (52.0, 166.0, 226.0):                                                  # brass collars on the posts
            lo3, hi3 = sorted((sx * 33.6, sx * 37.5))
            put(bm, box((lo3, y, 25.1), (hi3, y + 2.4, 28.6), 0.3), BR)
            put(bm, box((lo3, y, -28.6), (hi3, y + 2.4, -22.2), 0.3), BR)
        lo4, hi4 = sorted((sx * 34.15, sx * 36.95))
        zA, zB = (26.3, -23.6) if sx < 0 else (-23.6, 26.3)
        put(bm, xprism(stroke((zA, 44.0), (zB, 96.0), 4.2), lo4, hi4, 0.4), WA)         # diagonal brace
        for y in (86.0, 126.0, 196.0):                                                  # domed brass studs on the front posts
            cx = sx * 35.55
            put(bm, ct.lathe_along([(0.0, 0.0), (1.3, 0.0), (1.3, 0.2), (0.8, 0.55), (0.0, 0.65)], 10, (0.0, 0.0, 1.0), (cx, y, 28.3 - 0.02)), BR)
    put(bm, vp([(-34.2, -23.0), (34.2, -23.0), (34.2, 28.2), (-34.2, 28.2)], 233.0, 238.0, 0.5, [ct.circle(5.1, 24, (SHAFT_X, SHAFT_Z))]), WA)    # belfry deck
    put(bm, box((16.8, 270.7, -27.6), (23.2, 273.9, 27.6), 0.5), WA)                    # bell beam
    for x0, x1 in ((15.4, 18.0), (22.0, 24.6)):                                         # the bell's two hooks: cheeks round the gudgeon pins
        for z0, z1 in ((11.8, 14.6), (-14.6, -11.8)):
            put(bm, box((x0, 266.0, z0), (x1, 270.8, z1), 0.3), BR)

    # --- cap: a flat teal deck with a fascia, and the shaft bush ----------------------------------------------------
    put(bm, vp([(-38.0, -29.0), (38.0, -29.0), (38.0, 29.0), (-38.0, 29.0)], 273.8, 275.8, 0.5, [ct.circle(5.1, 24, (SHAFT_X, SHAFT_Z))]), TL)
    put(bm, box((-37.4, 270.6, 26.9), (37.4, 273.9, 28.7), 0.35), TL)                   # front fascia
    put(bm, box((36.2, 270.6, -28.7), (37.8, 273.9, 28.6), 0.35), TL)                   # right fascia
    for i in range(17):                                                                 # dentils under the cap, front and right
        x = -34.0 + i * 4.25
        put(bm, box((x, 269.4, 27.0), (x + 2.2, 270.8, 28.6), 0.0), TL)
    for i in range(13):
        z = -24.0 + i * 4.1
        put(bm, box((36.3, 269.4, z), (37.7, 270.8, z + 2.2), 0.0), TL)
    put(bm, lathe_y([(5.1, 273.4), (8.0, 273.4), (8.0, 275.3), (7.4, 275.9), (5.1, 275.9)], 28, (SHAFT_X, 0.0, SHAFT_Z)), BR)       # Bush_Cap, top 0.1 under the hub

    # --- hardware the parts seat on ---------------------------------------------------------------------------------
    put(bm, zring(S_AX[0], S_AX[1], Z_PLATE - 0.4, Z_PLATE + 0.6, 4.7, 7.6), AB)        # Boss_S
    put(bm, zstud(C_AX[0], C_AX[1], Z_PLATE - 0.2, 6.2, 3.7), AB)                       # Stud_C (stops 0.5 mm short of bevel A's front face, clear of the lower bevel's hub)
    put(bm, zring(C_AX[0], C_AX[1], Z_PLATE - 0.3, Z_PLATE + 0.5, 3.6, 6.4), AB)
    put(bm, box((-20.0, 128.2, -23.2), (16.5, 134.0, 1.6), 0.5), AB)                    # Mount_Foot: the bearing's bracket, foot towards the plate
    put(bm, box((12.6, 99.0, 0.0), (16.4, 134.2, 4.0), 0.4), AB)                        # Seat_BevelB: hanger from the bracket ...
    put(bm, box((12.65, 99.0, -0.05), (16.35, 102.8, 15.0), 0.4), AB)
    put(bm, box((-11.0, 99.0, 9.0), (16.4, 102.8, 15.0), 0.4), AB)                      # ... and a shelf under the lower bevel's hub
    put(bm, box((-13.0, 160.0, -23.2), (3.0, 167.4, -11.0), 0.5), AB)                   # Seat_Flywheel: arm from the wall ...
    ring = ct.arc((SHAFT_X, SHAFT_Z), 24.0, 160.0, 380.0, 22) + ct.arc((SHAFT_X, SHAFT_Z), 14.0, 380.0, 160.0, 22)
    put(bm, vp(ring, 160.0, 167.4, 0.5), AB)                                            # ... and a horseshoe under the rim, open to the front
    return bm, n_blocks


def build_base(entry, p):
    bm, n_blocks = build_body()
    root = finish(entry, bm, "Belfry_Plinth", MATS)
    root["wu"] = dict(id=entry["id"], family=FAMILY, sizeMm=[76.0, 276.0, 58.0], blocks=n_blocks, studC=list(C_AX), bossS=list(S_AX),
                      shaftAxisMm=dict(x=SHAFT_X, z=SHAFT_Z, yFrom=104.0, yTo=284.0), apexMm=[SHAFT_X, C_AX[1], SHAFT_Z], bevelOutMm=dict(a=BEVEL_A_OUT_MM, b=BEVEL_B_OUT_MM),
                      features=dict(Mount_Foot="y 128.2-134.0, z -23.2 to 1.6", Seat_BevelB="hanger x 12.6-16.4 and shelf y 99-102.8, z 9-15",
                                    Seat_Flywheel="arm and horseshoe y 160-167.4", Bush_Cap="y 273.4-275.9 on the cap, ri 5.1", BellHooks="cheeks z +-(11.8-14.6) round the gudgeon pins, x 15.4-24.6"),
                      note="proposal: docs/blueprints/BELFRY_BLUEPRINT.md; sockets of section 7.1")
    helpers = [empties.add_collider(root, "Case", "box", (0.038, 0.138, 0.029), (0.0, 0.138, 0.0))]
    swing = empties.add_pivot(root, "BellSwing", m((20.0, 268.5, 0.0)), (0, 0, 1), "rotation_axis", "+Z")
    swing["wu"] = dict(type="pivot", kind="rotation_axis", axis="+Z", role="bell_swing", swingRad=0.12, partPivot="PIV_Swing",
                       note="the bell's gudgeon pins (z 10 to 15 each side) hang in the brass hooks on this axis; the part swings about its own PIV_Swing, which lands here when the bell is seated at SOCKET_Bell")
    shaft = empties.add_pivot(root, "ShaftAxis", m((SHAFT_X, 194.0, SHAFT_Z)), (0, -1, 0), "rotation_axis", "-Y")
    shaft["wu"] = dict(type="pivot", kind="rotation_axis", axis="-Y", role="vertical_shaft", yFromM=0.104, yToM=0.284,
                       note="bevel B, the shaft, the flywheel and the vane turn about this line, about their own local +Z, which points down (sign rule, BELFRY_BLUEPRINT section 1)")
    helpers += [swing, shaft]
    prop = dict(proposal=True, basis="docs/blueprints/BELFRY_BLUEPRINT.md section 7.1")
    I, RX = dict(axis=(0, 0, 1), euler=[0, 0, 0], quat=[0.0, 0.0, 0.0, 1.0], seats=(0, 0, -1)), dict(axis=(0, -1, 0), euler=[90, 0, 0], quat=[0.7071068, 0.0, 0.0, 0.7071068], seats=(0, -1, 0))
    # (node, slot id, no., position mm, family, accepts, intended, rotation, seats along, depends on)
    S = [
        ("GearPinion", "pinion", 1, (-5.0, 59.0, -14.4), "spur_gear", ["spur_gear"], "gear_spur_12_m1", I, []),
        ("Spring", "spring", 2, (-5.0, 59.0, -0.8), "spring", ["spring_standard", "spring_worn"], "spring_standard", I, ["pinion"]),
        ("Key", "key", 3, (-5.0, 59.0, 6.2), "winding_key", ["winding_key"], "winding_key", I, ["spring"]),
        ("GearDrive", "drive_gear", 4, (-5.0, 100.0, -14.4), "spur_gear", ["spur_gear"], "gear_spur_20_m1", I, ["pinion"]),
        ("BevelB", "bevel_b", 5, (-5.0, 110.0 + BEVEL_B_OUT_MM, 11.7), "bevel_gear", ["gear_bevel_12"], "gear_bevel_12", RX, []),
        ("BevelA", "bevel_a", 6, (-5.0, 100.0, 1.7 - BEVEL_A_OUT_MM), "bevel_gear", ["gear_bevel_12"], "gear_bevel_12", I, ["drive_gear", "bevel_b"]),
        ("BearingFoot", "bearing_foot", 7, (-5.0, 128.0, 11.7), "structural", ["bearing_pillow_block"], "bearing_pillow_block", RX, []),
        ("Flywheel", "flywheel", 8, (-5.0, 175.0, 11.7), "flywheel", ["flywheel_standard"], "flywheel_standard", RX, []),
        ("Shaft", "shaft", 9, (-5.0, 194.0, 11.7), "shaft", ["shaft_long"], "shaft_long", RX, ["bevel_b", "bearing_foot", "flywheel"]),
        ("Vane", "vane", 10, (-5.0, 280.0, 11.7), "vane", ["belfry_vane"], "belfry_vane", RX, ["shaft"]),
        ("Bell", "bell", 11, (20.0, 270.0, 0.0), "structural", ["clock_bell"], "clock_bell", dict(I, seats=(0, 1, 0)), []),
    ]
    for node, sid, no, pos, fam, acc, intended, rot, deps in S:
        note = f"slot {no} of 11" + ("; local +Z points down the tower by the sign rule" if rot is RX else "")
        helpers.append(empties.add_socket(root, node, m(pos), acc, axis_g=rot["axis"], slot=sid, slotNo=no, partFamily=fam, intended=intended,
                                          seatsAlong=list(rot["seats"]), rotationEulerDeg=rot["euler"], rotationQuat=rot["quat"], dependsOn=deps, note=note, **prop))
    helpers.append(empties.add_socket(root, "BaseHandle", m((0.0, 10.0, 29.0)), ["machine_base_handle"], axis_g=(0, 0, 1), slot="base_handle", partFamily="fitting",
                                      note="fixed fitting of every machine base, not one of the 11 slots; front centre of the plinth, 1 cm up", **prop))
    return [root] + helpers, dict(origin=("centre", "min", "centre"), closed=True)


# ======================================================================================
# belfry_vane
# ======================================================================================
ARROW_C = -20.2                                   # the arrow's height along -z


def arrow_outline(c):
    """The arrow in (x, z): head +X, long shaft, swallow tail at -X (a flat plate seen from the front when the vane points along x)."""
    return [(32.0, c), (21.5, c - 4.4), (23.2, c - 0.62), (-20.5, c - 0.62), (-26.0, c - 5.0), (-32.0, c - 5.0), (-28.0, c),
            (-32.0, c + 5.0), (-26.0, c + 5.0), (-20.5, c + 0.62), (23.2, c + 0.62), (21.5, c + 4.4)][::-1]


def build_vane(entry, p):
    # hub, blind bore: open at +z (the shaft enters from below), 1.1 mm of skin on top; the shaft's top end stops 0.1 mm under the ceiling
    hub = ct.lathe_along([(4.0, 4.0), (7.2, 4.0), (8.0, 3.2), (8.0, -4.3), (6.9, -5.2), (0.0, -5.2), (0.0, -4.1), (4.0, -4.1)], 22, (0.0, 0.0, 1.0), (0.0, 0.0, 0.0))
    bm = ct.new()
    ct.merge(bm, hub, 1)
    # the turned spike: collar, ogee neck, a bulge where the cross passes, the rod, and the ball finial
    spike = [(0.0, -5.1), (3.9, -5.1), (3.9, -5.8), (3.0, -6.5), (2.2, -7.4), (1.9, -8.6), (1.7, -9.4), (2.5, -10.2), (2.6, -10.8), (2.5, -11.4), (1.5, -12.2),
             (1.15, -13.5)]
    r_b, zc_b = 2.0, -25.0                                                         # ball finial, top at z -27.0
    phi0 = math.asin(1.15 / r_b)
    spike.append((1.15, zc_b + r_b * math.cos(phi0)))
    for k in range(1, 9):
        phi = phi0 + (math.pi - phi0) * k / 8
        spike.append((r_b * math.sin(phi) if k < 8 else 0.0, zc_b + r_b * math.cos(phi)))
    ct.merge(bm, ct.lathe_along(spike, 14, (0.0, 0.0, 1.0), (0.0, 0.0, 0.0)), 0)
    # cross: four arms with ball ends (x +-14, y +-6.8), at z -10.8
    ct.merge(bm, ct.lathe_along([(0.0, -14.0), (0.75, -14.0), (0.75, 14.0), (0.0, 14.0)], 8, (1.0, 0.0, 0.0), (0.0, 0.0, -10.8)), 0)
    ct.merge(bm, ct.lathe_along([(0.0, -6.5), (0.75, -6.5), (0.75, 6.5), (0.0, 6.5)], 8, (0.0, 1.0, 0.0), (0.0, 0.0, -10.8)), 0)
    for bx, by in ((14.2, 0.0), (-14.2, 0.0), (0.0, 6.8), (0.0, -6.8)):
        ct.merge(bm, ct.move(ct.shell_sphere((0.0, 0.0, 0.0), 1.25, 8, 4), (bx, by, -10.8)), 0)
    # the arrow: a flat plate in the xz plane, y thickness +-0.55
    plate = ct.shell_prism(arrow_outline(ARROW_C), -0.55, 0.55, 0.15)
    bmesh.ops.rotate(plate, cent=(0.0, 0.0, 0.0), matrix=Matrix.Rotation(math.radians(90.0), 3, "X"), verts=plate.verts)    # (x, zz, t) -> (x, -t, zz)
    ct.merge(bm, plate, 0)
    fin = ct.shell_prism([(-31.2, -8.0), (-24.0, -6.2), (-24.0, 6.2), (-31.2, 8.0)], ARROW_C - 0.5, ARROW_C + 0.5, 0.15)             # a small horizontal tail fin
    ct.merge(bm, fin, 0)
    root = finish(entry, bm, "Belfry_Vane", [BRASS, ABRASS])
    root["wu"] = dict(id=entry["id"], family=FAMILY, rotationAxis="+Z", finial="local -Z (finial-down: seated with Rx(+90) it stands up)",
                      hubMm=dict(boreRadius=4.0, bottomZ=4.0, topZ=-5.2), arrowCentreZMm=ARROW_C, note="turns about local +Z at +0.48 rad/s; blind bore, the shaft ends 0.1 mm under the ceiling")
    col = empties.add_collider(root, "Grab", "sphere", 0.016, (0.0, 0.0, ARROW_C * 1e-3))
    axis = empties.add_pivot(root, "Axis", (0.0, 0.0, 0.0), (0, 0, 1), "rotation_axis", "+Z")
    axis["wu"] = dict(type="pivot", kind="rotation_axis", axis="+Z", role="vane_axis", note="the hub's bore axis through the origin; the vane sweeps about it at +0.48 rad/s")
    return [root, col, axis], dict(closed=True, thin_axis_z=False)


BUILDERS = {"belfry_base": build_base, "belfry_vane": build_vane}


def build(entry: dict, params: dict):
    return BUILDERS[entry["id"]](entry, params)


if __name__ == "__main__":
    raise SystemExit("gen_belfry.py is a forge family. Run blender/scripts/forge.py --family belfry --only <ids> --out-root <dir>")
