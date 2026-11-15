"""gen_fastener.py - the fastener family: pins, dowel, collar, washer, bush, screw and clip in brass (forge family 'fastener').

    "$B" --background --factory-startup --python-exit-code 1 --python blender/scripts/forge.py -- \
         --family fastener --only pin_taper_2,pin_dowel_3,collar_set_8,washer_plain_8,bush_split_8,screw_slot_m3,clip_angle_small --out-root <dir>

docs/blueprints/INTRICATE_ASSEMBLY_DESIGN.md sections 4.1 and 11, ADR-050 (P0 subset: spacer_sleeve_8 and nut_hex_8 are P2 and not built here).
Category tiny_fastener (ADR-034): 300 triangles, 1 primitive, 1 material, 0 texture, 30 KB. Brass only (Mat_AgedBrass, Mat_PolishedBrass).

Conventions (every piece): local +Z is the fastening axis and points OUT of the host, towards the head or the free end the player sees; the origin
is on that axis (the centre of the part's box, except the bush); built in mm in glTF model space, exported in metres. COL_Grab is an invisible
sphere of 15 mm (pins, dowel, washer, screw) or 12 mm (collar, bush, clip): the visible mesh is never enlarged.

SEAT: `seat_mm` is the signed distance from a piece's origin to the host surface it seats against, measured along the piece's +Z. A host socket
that wants the surface at point P with outward axis A puts the piece's ORIGIN at P - A * seat_mm. Use `hw_socket()` so every host agrees.

    pin_taper_2      14 mm taper pin (2.0 to 1.6 mm), dome head 2.8 mm at +Z      seat 6.1  (head underside; the body goes into the host)
    pin_dowel_3      12 mm plain dowel, 3 mm, chamfered ends                      seat 0    (origin = host surface, 6 mm in and 6 mm out)
    collar_set_8     5 mm set collar, bore 8.0, OD 10.0                           seat 0    (origin = centre of the ring)
    washer_plain_8   0.94 mm washer, bore 8.2, OD 14.0                            seat 0
    bush_split_8     6 mm C-shaped half bush, bore 8.2, OD 12.0, 240 deg, open +Y seat 0    (origin = shaft axis; the opening faces local +Y)
    screw_slot_m3    M3 slotted pan-head screw, 8 mm shank, head 6 x 1.8 mm      seat 3.1  (head underside)
    clip_angle_small 16 x 6 x 8 angle clip, M3 hole in the plate                  seat 2.4  (the plate's underside; the flange reaches 6.4 mm back past it, over the host's edge)
"""
from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np

import bmesh
from mathutils import Vector

import wu_common as wu
from lib import empties

import gen_mech_common as mc

FAMILY = "fastener"
FINISH = {"aged": "Mat_AgedBrass", "polished": "Mat_PolishedBrass"}

# id -> data shared with the host generators (seat) and with this file (finish, collider, mesh node name)
HW = {
    "pin_taper_2": dict(node="Pin_Taper2", mat="Mat_PolishedBrass", seat_mm=6.1, grab=0.015),
    "pin_dowel_3": dict(node="Pin_Dowel3", mat="Mat_PolishedBrass", seat_mm=0.0, grab=0.015),
    "collar_set_8": dict(node="Collar_Set8", mat="Mat_AgedBrass", seat_mm=0.0, grab=0.012),
    "washer_plain_8": dict(node="Washer_Plain8", mat="Mat_AgedBrass", seat_mm=0.0, grab=0.015),
    "bush_split_8": dict(node="Bush_Split8", mat="Mat_AgedBrass", seat_mm=0.0, grab=0.012),
    "screw_slot_m3": dict(node="Screw_SlotM3", mat="Mat_PolishedBrass", seat_mm=3.1, grab=0.015),
    "clip_angle_small": dict(node="Clip_AngleSmall", mat="Mat_AgedBrass", seat_mm=2.4, grab=0.012),
}
PARAMS = {i: dict(HW[i]) for i in HW}                       # forge wants PARAMS keyed by asset id; the table above is the single source

# ---- shared sizes (mm): the existing parts these fit -------------------------------------------------------------------------------------
SHAFT_R = 3.8                       # shaft_short body; gear bore 8.0 (r 4.0)
WASHER_BORE_R, WASHER_OD_R, WASHER_T = 4.1, 7.0, 0.94      # fills one 1.0 mm axial gap of MUSIC_BOX_BLUEPRINT 6.1 with 0.03 mm to each side
COLLAR_BORE_R, COLLAR_OD_R, COLLAR_L = 4.0, 5.0, 5.0       # the cylinder's end counterbore is 5.2 mm deep and r 5.2 mm
BUSH_BORE_R, BUSH_OD_R, BUSH_L = 4.1, 6.0, 6.0             # the bracket's bush seat is r 6.1 mm through the 6.0 mm boss
SCREW_R, HEAD_R, HEAD_H, SCREW_L = 1.5, 3.0, 1.8, 8.0


def hw_socket(parent, name: str, hw_id: str, seat_g_m, axis_g, **extra):
    """SOCKET_<name> on a host for piece `hw_id`: the host surface point `seat_g_m` (glTF metres) with outward axis `axis_g`.
    The socket sits where the piece's ORIGIN goes (origin = seat - axis * seat_mm); its +Z is `axis_g`. accepts is the exact asset id."""
    a = Vector(axis_g).normalized()
    s = HW[hw_id]["seat_mm"] * 1e-3
    loc = tuple(float(seat_g_m[i]) - float(a[i]) * s for i in range(3))
    return empties.add_socket(parent, name, loc, [hw_id], axis_g=(a.x, a.y, a.z), hardware=hw_id, seatMm=HW[hw_id]["seat_mm"], **extra)


# ======================================================================================
# meshes (mm, +Z axis)
# ======================================================================================
def arc_lathe(bm, loop, a0_deg, a1_deg, nseg):
    """Revolve the closed (r, z) polygon `loop` about +Z from a0 to a1 degrees (open arc: both ends capped with the profile)."""
    n = len(loop)
    rings = []
    for i in range(nseg + 1):
        t = math.radians(a0_deg + (a1_deg - a0_deg) * i / nseg)
        rings.append([bm.verts.new((r * math.cos(t), r * math.sin(t), z)) for r, z in loop])
    for i in range(nseg):
        for k in range(n):
            k2 = (k + 1) % n
            bm.faces.new((rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]))
    bm.faces.new(rings[0])
    bm.faces.new(rings[-1][::-1])
    return [v for r in rings for v in r]


def mesh_pin_taper():
    bm = mc.bmesh.new()
    # tip chamfer, taper 1.6 to 2.0 mm over the 13.1 mm body, then a 2.8 mm domed head whose underside is the seat plane at z = +6.1
    mc.lathe(bm, [(0.0, -7.0), (0.55, -7.0), (0.80, -6.75), (1.0, 6.1), (1.4, 6.1), (1.4, 6.4), (1.1, 6.8), (0.55, 6.97), (0.0, 7.0)], nseg=12)
    return bm


def mesh_pin_dowel():
    bm = mc.bmesh.new()
    mc.lathe(bm, [(0.0, -6.0), (1.15, -6.0), (1.5, -5.65), (1.5, 5.65), (1.15, 6.0), (0.0, 6.0)], nseg=14)
    return bm


def mesh_collar():
    bm = mc.bmesh.new()
    h = COLLAR_L / 2
    mc.lathe(bm, [(4.2, -h), (4.65, -h), (COLLAR_OD_R, -h + 0.35), (COLLAR_OD_R, h - 0.35), (4.65, h), (4.2, h), (COLLAR_BORE_R, h - 0.2),
                  (COLLAR_BORE_R, -h + 0.2)], nseg=16)
    return bm


def mesh_washer():
    bm = mc.bmesh.new()
    h = WASHER_T / 2
    mc.lathe(bm, [(WASHER_BORE_R, -h), (WASHER_OD_R - 0.12, -h), (WASHER_OD_R, -h + 0.12), (WASHER_OD_R, h - 0.12), (WASHER_OD_R - 0.12, h),
                  (WASHER_BORE_R, h)], nseg=20)
    return bm


def mesh_bush():
    """C-shaped half bush: a 240 degree arc of the bushing ring, opening towards +Y (the ends sit 3 mm above the axis: 6 sin 30 deg)."""
    bm = mc.bmesh.new()
    h = BUSH_L / 2
    c = 0.3
    arc_lathe(bm, [(BUSH_BORE_R, -h + c), (BUSH_BORE_R + c, -h), (BUSH_OD_R - c, -h), (BUSH_OD_R, -h + c), (BUSH_OD_R, h - c), (BUSH_OD_R - c, h),
                   (BUSH_BORE_R + c, h), (BUSH_BORE_R, h - c)], 150.0, 390.0, 14)
    return bm


def mesh_screw():
    bm = mc.bmesh.new()
    top = HEAD_H + 3.1                                                              # 4.9: head top; the head underside is at 3.1
    mc.lathe(bm, [(0.0, -4.9), (1.2, -4.9), (SCREW_R, -4.6), (SCREW_R, 3.1), (HEAD_R, 3.1), (HEAD_R, 3.8), (2.5, 4.45), (1.3, 4.85), (0.0, top)], nseg=14)
    mc.clean(bm)
    slot = mc.bmesh.new()
    mc.box(slot, (-0.4, -3.5, 3.95), (0.4, 3.5, 5.5))                               # the slot: 0.8 mm wide, 0.95 mm deep, across the dome
    return mc.boolean(bm, [slot], "DIFFERENCE")


def mesh_clip():
    """Angle clip that clamps over the edge of a part: a 1.6 mm plate on top (z +2.4 to +4.0, 16 mm in x, 6 mm in y) with a 1.6 mm flange down its -Y edge
    (y -3.0 to -1.4) reaching 6.4 mm below the plate's underside (z -4.0), and an M3 clearance hole through the plate. The plate's underside (z = +2.4) is the
    seat plane; the flange hangs on the host's far side. On the comb the flange covers the back face of the block and the plate lies on the rear shelf."""
    bm = mc.bmesh.new()
    poly = [(-4.0, -3.0), (4.0, -3.0), (4.0, 3.0), (2.4, 3.0), (2.4, -1.4), (-4.0, -1.4)]       # (z, y), counter-clockwise
    v = mc.prism(bm, poly, -8.0, 8.0)                                                           # extruded along w, then (z, y, w) -> (x, y, z)
    for q in v:
        x, y, z = q.co
        q.co = (z, y, x)
    mc.clean(bm)
    mc.bevel_hard(bm, 0.25)
    hole = mc.bmesh.new()
    mc.lathe(hole, [(0.0, 1.0), (1.65, 1.0), (1.65, 5.0), (0.0, 5.0)], nseg=16)
    return mc.boolean(bm, [hole], "DIFFERENCE")


MESHES = {"pin_taper_2": mesh_pin_taper, "pin_dowel_3": mesh_pin_dowel, "collar_set_8": mesh_collar, "washer_plain_8": mesh_washer,
          "bush_split_8": mesh_bush, "screw_slot_m3": mesh_screw, "clip_angle_small": mesh_clip}
DESCRIBE = {
    "pin_taper_2": dict(function="locks a gear to its shaft", headEnd="+Z"),
    "pin_dowel_3": dict(function="anchors the spring's outer end", headEnd=None),
    "collar_set_8": dict(function="holds the cylinder on its arbor", headEnd=None),
    "washer_plain_8": dict(function="fills one 1 mm axial gap", headEnd=None),
    "bush_split_8": dict(function="lines a bracket's bearing seat", headEnd=None, opening="+Y"),
    "screw_slot_m3": dict(function="pegs a part down", headEnd="+Z", turnAxis="+Z"),
    "clip_angle_small": dict(function="holds the comb to its seat", headEnd=None),
}


def build(entry: dict, params: dict):
    i = entry["id"]
    bm = MESHES[i]()
    obj = mc.make_object(bm, entry["meshes"][0], entry["materials"])
    obj["wu"] = dict(id=i, family=FAMILY, hardware=True, axis="+Z", seatMm=params["seat_mm"], **DESCRIBE[i])
    col = empties.add_collider(obj, "Grab", "sphere", params["grab"])
    objs = [obj, col]
    hints = dict(closed=True)
    if i != "bush_split_8":
        hints["origin"] = ("centre", "centre", "centre")
    if i == "clip_angle_small":
        # the screw seats on the plate's outer face (z = +4.0): head underside at P, origin at P - A * 3.1 (z = +0.9 mm)
        objs.append(hw_socket(obj, "Screw", "screw_slot_m3", (0.0, 0.0, 4.0e-3), (0.0, 0.0, 1.0), role="clip_screw"))
    return objs, hints


if __name__ == "__main__":
    raise SystemExit("gen_fastener.py is a forge family. Run blender/scripts/forge.py --family fastener --only <ids> --out-root <dir>")
