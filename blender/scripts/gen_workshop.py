"""gen_workshop.py - World family B generators: trunk_main, workbench, parts_tray, parcel, letter_envelope, blueprint_sheet,
machine_base_handle, gift_box (forge families trunk, workshop, interaction, gifts).

Not run directly. forge.py loads it once per family (the FAMILY below is read from the --family argument, so one script serves
the four folders):

    "$B" --background --factory-startup --python-exit-code 1 --python blender/scripts/forge.py -- \
         --family trunk --only trunk_main --out-root <dir> --owner World --manifest <private manifest>

Authoring space is glTF axes in centimetres (see gen_wk_kit.py). Sizes follow docs/TOCKTON_DIMENSIONS.md (Opus draft awaiting
the owner's approval, used as working values) and PRODUCT_SPEC 3.2; the choice is stated per asset below.

FRAMEWORK NOTES (for the lead, nothing in lib/ or forge.py was edited)
  * Animation clips: forge exports profile L (no animations) and qa_gate Q22 rejects a clip, so no one-shot clip is shipped. Each
    moving part is its own node under a PIV_ empty (TrunkLid, Parcel flap, Letter flap, Gift lid) so the runtime can tween it.
  * Hinged parts sit under a PIV_ empty and carry the negative of its translation (declared as pivot nodes via hints
    pivot_nodes / manifest pivotNodes), so the raw mesh stays in the asset frame and the Q04 box check keeps working.
  * Vertex AO is baked in a documented pose (lid open) through gen_wk_kit.POLICY, which wraps lib.vertex_ao.bake for this process
    only. The clean fix is a generator hint (hints["ao_pose"]) that forge calls around the bake.
"""
from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np

import bmesh
import bpy
from mathutils import Vector

import wu_common as wu
from lib import empties
import gen_wk_kit as K
from gen_wk_kit import (Part, cylinder, dome, finish, lathe, make_profile, move, rbox, rot, rr_sweep, sweep, rect_section,
                        round_section, pose_rotate, POLICY, round_loop, prism_x, prism_y)


def _family() -> str:
    a = wu.script_args()
    return a[a.index("--family") + 1] if "--family" in a else "workshop"


FAMILY = _family()
PARAMS = {i: {} for i in ("trunk_main", "workbench", "parts_tray", "parcel", "letter_envelope", "blueprint_sheet",
                          "machine_base_handle", "gift_box")}
M = lambda cm: cm / 100.0                                          # centimetres -> metres (helper empties are placed in metres)


def _root(obj, entry):
    obj["wu"] = dict(id=entry["id"], family=FAMILY)
    return obj


# ======================================================================================
# machine_base_handle: a brass pull that stands out of the front of every machine base
# ======================================================================================
def build_handle(entry, p):
    br = 0                                                           # Mat_PolishedBrass
    part = Part("BaseHandle", ["Mat_PolishedBrass"])
    plate = rr_sweep(make_profile([(0.5, 0.0), (0.0, 0.0), (0.0, 0.2), (0.5, 0.2)], [0, 0.06, 0.06, 0], [br] * 3, n=2),
                     a=1.5, b=0.6, r=0.5, k=8, space=0.4)
    part.add(move(rot(plate, 90, "x"), (0, 0, 0)))
    for sx in (-1, 1):
        part.add(cylinder((sx * 0.95, 0, 0.1), (0, 0, 1), 0.2, 0.85, nseg=10, r_end=0.04))
        part.add(dome((sx * 1.2, 0, 0.2), 0.16, 0.07, axis=(0, 0, 1), nseg=8))
    part.add(cylinder((-1.25, 0, 0.9), (1, 0, 0), 0.3, 2.5, nseg=16, r_end=0.12, n=2))
    for sx in (-0.62, 0.62):                                         # turned collars on the grip, flared feet on the posts
        part.add(cylinder((sx - 0.07, 0, 0.9), (1, 0, 0), 0.355, 0.14, nseg=16, r_end=0.04))
    for sx in (-1, 1):
        part.add(cylinder((sx * 0.95, 0, 0.18), (0, 0, 1), 0.3, 0.14, nseg=12, r_end=0.05))
    obj = _root(part.build(), entry)
    col = empties.add_collider(obj, "Grab", "sphere", M(1.2), (0.0, 0.0, M(0.9)))
    col.parent = obj
    return [obj, col], dict(origin=("centre", "centre", "min"), closed=True)


# ======================================================================================
# shared little helpers
# ======================================================================================
def plate_z(c, w, h, t, r_plan=0.5, r_edge=0.06, k=3, mat=0, space=1.0):
    """Plate standing in the x-y plane: centre (c.x, c.y), width w (x), height h (y), thickness t growing from c.z along +z."""
    prof = make_profile([(min(w, h) / 2 - 0.05, 0.0), (0.0, 0.0), (0.0, t), (min(w, h) / 2 - 0.05, t)], [0, r_edge, r_edge, 0], [mat] * 3, n=1)
    s = rr_sweep(prof, a=w / 2, b=h / 2, r=r_plan, k=k, space=space)
    return move(rot(s, 90, "x"), (c[0], c[1], c[2]))


def screws(part, pts, axis, mat, r=0.2, h=0.1, nseg=8):
    for p in pts:
        part.add(dome(p, r, h, axis, nseg, mat))


def arc_pts(t1, p, t2, n):
    """Quadratic bezier from t1 to t2 with control p (the corner), n+1 points (matches fillet_poly)."""
    t1, p, t2 = (np.asarray(v, float) for v in (t1, p, t2))
    return [tuple((1 - s) ** 2 * t1 + 2 * s * (1 - s) * p + s * s * t2) for s in np.linspace(0, 1, n + 1)]


def _pivot(root, name, loc_cm, label):
    return empties.add_pivot(root, name, tuple(M(v) for v in loc_cm), (0.0, 0.0, 1.0), "hinge", label)


# ======================================================================================
# trunk_main: 35 x 20 x 25 cm walnut steamer trunk (PRODUCT_SPEC 3.2; seam at 14 cm, lid pivot at the back, TOCKTON_DIMENSIONS 4)
# ======================================================================================
A, BZ, R0 = 16.8, 11.8, 1.4              # wood half width, half depth, plan corner radius (guards and hinge reach +-17.5 / +-12.5)
SEAM = 14.0
HINGE = (0.0, SEAM, -12.1)               # hinge pin axis, 0.3 cm behind the wood so the barrel stays inside the 25 cm depth
OPEN_DEG = 95.0                          # TOCKTON_DIMENSIONS 4: the opening limit (the runtime tweens PIV_Lid about +X)
STRAP_X = 9.0
ROOF = 18.3
ARC = 2.1
GUARD = 0.54


def _trunk_body():
    pts = [(11.2, 0.0), (-0.3, 0.0), (-0.3, 1.1), (0.0, 1.4), (0.0, 5.9), (0.2, 6.1), (0.0, 6.3), (0.0, 9.6), (0.2, 9.8), (0.0, 10.0),
           (0.0, 13.7), (0.28, SEAM), (1.3, SEAM), (1.5, 13.8), (1.5, 2.9), (1.9, 2.5), (10.9, 2.5)]
    rad = [0, 0.22, 0.12, 0.16, 0, 0, 0, 0, 0, 0, 0, 0, 0.1, 0.05, 0, 0.35, 0]
    prof = make_profile(pts, rad, [0] * 12 + [1] * 4, n=2, max_len=2.6)
    return rr_sweep(prof, A, BZ, R0, k=2, space=1.9)


def _trunk_lid():
    pts = [(11.0, 17.2), (1.5, 17.2), (1.5, 14.2), (1.3, SEAM), (0.28, SEAM), (0.0, 14.28), (0.0, 15.0), (0.2, 15.2), (0.0, 15.4),
           (0.0, ROOF), (11.0, ROOF)]
    rad = [0, 0.5, 0, 0, 0, 0, 0, 0, 0, ARC, 0]
    prof = make_profile(pts, rad, [1, 1, 1] + [0] * 7, n=4, max_len=2.6)
    return rr_sweep(prof, A, BZ, R0, k=2, space=1.9)


def _lid_strap_path(x):
    """Outer surface of the lid along z at x: front wall, rounded roof edge, flat roof, back edge, back wall."""
    front = [(x, 14.45, BZ), (x, ROOF - ARC, BZ)]
    arc = arc_pts((0, ROOF - ARC), (0, ROOF), (ARC, ROOF), 5)
    f_arc = [(x, y, BZ - d) for d, y in arc]
    b_arc = [(x, y, -(BZ - d)) for d, y in arc[::-1]]
    path = front + f_arc[1:] + b_arc[:-1] + [(x, 14.45, -BZ)]
    path = [np.asarray(p, float) for p in path]
    out = [path[0]]
    for a, b in zip(path[:-1], path[1:]):                           # keep flats from being one long quad (AO resolution)
        k = max(1, int(math.ceil(np.linalg.norm(b - a) / 3.0)))
        out += [a + (b - a) * (q / k) for q in range(1, k + 1)]
    return [tuple(p) for p in out]


def build_trunk(entry, p):
    wood, velvet, pol, fab, aged = 0, 1, 2, 3, 4
    body = Part("Trunk_Body", ["Mat_Walnut", "Mat_VelvetTeal"]).add(_trunk_body())
    lid = Part("Trunk_Lid", ["Mat_Walnut", "Mat_VelvetTeal", "Mat_PolishedBrass", "Mat_Fabric", "Mat_AgedBrass"]).add(_trunk_lid())
    guards = Part("Trunk_CornerGuard", ["Mat_PolishedBrass"])
    hinge = Part("Trunk_Hinge", ["Mat_AgedBrass"])
    strap = Part("Trunk_Strap", ["Mat_Fabric", "Mat_AgedBrass"])
    latch = Part("Trunk_Latch", ["Mat_PolishedBrass", "Mat_AgedBrass"])
    handle = Part("Trunk_Handle", ["Mat_AgedBrass", "Mat_Fabric"])

    # -- straps: lid straps wrap the roof, body straps run down the front and back --------------------------------
    for sx in (-STRAP_X, STRAP_X):
        sec = rect_section(2.6, 0.4, 0.09, v0=-0.06)
        lid.add(sweep(_lid_strap_path(sx), sec, (1, 0, 0), outward=(sx, 16.0, 0.0), mat=fab))
        for z in (-6.0, 0.0, 6.0):
            lid.add(dome((sx, ROOF + 0.34, z), 0.34, 0.2, (0, 1, 0), 8, aged))
        for sz in (-1, 1):
            lid.add(dome((sx, 15.3, sz * (BZ + 0.34)), 0.32, 0.2, (0, 0, sz), 8, aged))
            strap.add(sweep([(sx, 13.78, sz * BZ), (sx, 1.7, sz * BZ)], sec, (1, 0, 0), outward=(sx, 8.0, 0.0), mat=0))
            for y in (3.4, 7.7, 12.0):
                strap.add(dome((sx, y, sz * (BZ + 0.34)), 0.32, 0.2, (0, 0, sz), 8, 1))

    # -- corner guards: chunky polished-brass caps, bottom of the body and top of the lid ---------------------------
    for sx in (-1, 1):
        for sz in (-1, 1):
            cx, cz = sx * (A + GUARD - 1.7), sz * (BZ + GUARD - 1.7)
            guards.add(rbox((cx, 0.0, cz), (3.4, 4.6, 3.4), r_edge=0.3, r_plan=0.7, k=3, mat=0, space=1.4, n=2))
            for dx, dz, ax in ((sx * 1.7, 0.6 * sz, (sx, 0, 0)), (0.6 * sx, sz * 1.7, (0, 0, sz))):
                guards.add(dome((cx + dx, 2.3, cz + dz), 0.3, 0.16, ax, 8, 0))
            lid.add(rbox((cx, 14.6, cz), (3.4, 4.2, 3.4), r_edge=0.3, r_plan=0.7, k=3, mat=pol, space=1.4, n=2))
            lid.add(dome((cx, 14.6 + 4.2, cz), 0.3, 0.16, (0, 1, 0), 8, aged))

    # -- hinges: static barrel and body leaf in Trunk_Hinge, the lid leaf in Trunk_Lid -----------------------------
    for sx in (-13.3, 13.3):
        hinge.add(cylinder((sx - 2.3, HINGE[1], HINGE[2]), (1, 0, 0), 0.4, 4.6, nseg=14, r_end=0.12, n=2))
        for e in (-1, 1):
            hinge.add(dome((sx + e * 2.3, HINGE[1], HINGE[2]), 0.3, 0.14, (e, 0, 0), 8, 0))
        hinge.add(plate_z((sx, 12.3, -12.15), 4.6, 3.8, 0.4, r_plan=0.55, mat=0))
        screws(hinge, [(sx + dx, 11.5 + dy, -12.15) for dx in (-1.5, 1.5) for dy in (0.0, 1.8)], (0, 0, -1), 0)
        lid.add(plate_z((sx, 15.6, -12.15), 4.6, 3.4, 0.4, r_plan=0.55, mat=aged))
        screws(lid, [(sx + dx, 15.0 + dy, -12.15) for dx in (-1.5, 1.5) for dy in (0.0, 1.6)], (0, 0, -1), aged)

    # -- latch: toothed lock plate with a keyhole on the body, hasp tab hanging from the lid ------------------------
    lc = (0.0, 11.35, BZ)
    lp = make_profile([(0.0, 0.0), (2.35, 0.0), (2.35, 0.3), (0.0, 0.3)], [0, 0, 0.1, 0], [0] * 3, n=1)
    latch.add(lathe(lp, lc, (0, 0, 1), nseg=14 * 4, mod=K.smooth_tooth(14, 0.17)))
    ring = make_profile([(0.0, 0.0), (1.55, 0.0), (1.55, 0.1), (0.0, 0.1)], [0, 0, 0.04, 0], [0] * 3, n=1)
    latch.add(lathe(ring, (lc[0], lc[1], lc[2] + 0.28), (0, 0, 1), nseg=24))
    latch.add(cylinder((lc[0], lc[1] + 0.3, lc[2] + 0.36), (0, 0, 1), 0.36, 0.1, nseg=14, r_end=0.03, mat=1))
    latch.add(plate_z((lc[0], lc[1] - 0.3, lc[2] + 0.36), 0.36, 1.0, 0.1, r_plan=0.12, r_edge=0.02, k=1, mat=1))
    screws(latch, [(lc[0] + dx, lc[1] + dy, lc[2] + 0.28) for dx, dy in ((-1.85, 0), (1.85, 0), (0, -1.85))], (0, 0, 1), 1, r=0.2, h=0.1)
    tab = make_profile([(0.0, 0.0), (1.3, 0.0), (1.3, 0.24), (0.0, 0.24)], [0, 0, 0.06, 0], [pol] * 3, n=1)
    lid.add(move(rot(rr_sweep(tab, a=1.3, b=1.85, r=0.9, k=4, space=1.0), 90, "x"), (0.0, 14.55, BZ + 0.3)))
    lid.add(dome((0.0, 15.7, BZ + 0.54), 0.3, 0.16, (0, 0, 1), 8, aged))

    # -- handle: leather grip on brass brackets, riding on the lid ------------------------------------------------
    grip_path, _ = K.fillet_poly([(-4.4, 18.55, 0), (-4.4, 19.5, 0), (4.4, 19.5, 0), (4.4, 18.55, 0)], [0, 1.4, 1.4, 0], 5)
    handle.add(sweep([tuple(q) for q in grip_path], round_section(0.5, 10), (0, 0, 1), mat=1))
    for sx in (-4.4, 4.4):
        handle.add(rbox((sx, ROOF - 0.04, 0.0), (2.2, 0.5, 1.7), r_edge=0.14, r_plan=0.45, k=3, mat=0, space=1.2))
        handle.add(cylinder((sx, ROOF + 0.4, 0.0), (0, 1, 0), 0.68, 0.5, nseg=12, r_end=0.14, mat=0))

    # -- build the nodes and the hierarchy -------------------------------------------------------------------------
    root = _root(body.build(), entry)
    objs = [root]
    for part in (hinge, guards, strap, latch):
        objs.append(part.build(parent=root))
    piv = _pivot(root, "Lid", HINGE, "+X")
    minus = tuple(-v for v in wu.g2b(tuple(M(c) for c in HINGE)))
    lid_o = lid.build(parent=piv, location=minus)
    handle_o = handle.build(parent=piv, location=minus)
    col = empties.add_collider(root, "Latch", "sphere", M(1.8), (0.0, M(13.8), M(12.5)))
    objs += [piv, lid_o, handle_o, col]
    POLICY["pose"] = lambda: pose_rotate(piv, -OPEN_DEG, "X")
    POLICY["hide"] = {"Trunk_Body": ["Trunk_Strap", "Trunk_CornerGuard", "Trunk_Hinge", "Trunk_Latch"]}
    return objs, dict(origin=("centre", "min", "centre"), closed=True, pivot_nodes=[lid_o, handle_o])


# ======================================================================================
# workbench: 45 x 3 x 25 cm walnut bench (IS 3 size, TOCKTON_DIMENSIONS 5.1 height and zones): a velvet build pad between a tray
# seat and a blueprint seat, brass corner marks on the two seats, a brass-framed pad, two drawer fronts on the front apron
# ======================================================================================
def build_workbench(entry, p):
    wood, vel, brass = 0, 1, 2
    top = Part("Workbench_Top", ["Mat_Walnut", "Mat_VelvetTeal", "Mat_PolishedBrass"])
    frame = Part("Workbench_Frame", ["Mat_Walnut"])
    drawer = Part("Workbench_Drawer", ["Mat_Walnut", "Mat_PolishedBrass"])
    prof = make_profile([(9.6, 2.0), (0.0, 2.0), (0.0, 2.9), (9.6, 2.9)], [0, 0.32, 0.32, 0], [wood] * 3, n=3, max_len=2.6)
    top.add(rr_sweep(prof, 22.5, 12.5, 1.0, k=3, space=2.0))
    pad = make_profile([(8.4, 2.85), (0.0, 2.85), (0.0, 3.0), (8.4, 3.0)], [0, 0.05, 0.07, 0], [vel] * 3, n=2, max_len=2.5)
    top.add(rr_sweep(pad, 9.0, 10.5, 0.45, k=2, space=2.0, cx=0.25))
    string = ([(0.88, 2.87), (1.0, 2.87), (1.0, 2.93), (0.88, 2.93)], [brass] * 3)                    # brass stringing line round the top
    top.add(rr_sweep(string, 22.5, 12.5, 1.0, k=3, space=2.0, closed=True))
    border = ([(-0.04, 2.86), (-0.4, 2.86), (-0.4, 2.96), (-0.04, 2.96)], [brass] * 3)
    top.add(rr_sweep(border, 9.0, 10.5, 0.45, k=2, space=2.0, cx=0.25, closed=True))
    for x0, x1 in ((-21.75, -9.25), (9.75, 21.75)):                  # the tray seat and the blueprint seat
        for X, ix in ((x0, 1), (x1, -1)):
            for Z, iz in ((-10.5, 1), (10.5, -1)):
                top.add(rbox((X + ix * 0.8, 2.88, Z + iz * 0.14), (1.6, 0.09, 0.28), r_edge=0.0, mat=brass))
                top.add(rbox((X + ix * 0.1405, 2.88, Z + iz * 0.9), (0.271, 0.09, 1.4), r_edge=0.0, mat=brass))   # overlaps the first bar, shares no vertex
    frame.add(rbox((0.0, 0.5, 0.0), (43.0, 1.55, 23.0), r_edge=0.12, r_plan=0.8, k=2, mat=0, space=3.0))
    for fx in (-19.8, 19.8):
        for fz in (-9.6, 9.6):
            prof_f = make_profile([(0.0, 0.0), (0.9, 0.0), (1.1, 0.15), (1.1, 0.35), (0.8, 0.58), (0.0, 0.58)], None, [wood] * 5)
            frame.add(lathe(prof_f, (fx, 0.0, fz), (0, 1, 0), 12))
    for dx in (-10.6, 10.6):                                         # drawer fronts with pulls on the front apron (apron face z = 11.5)
        drawer.add(rbox((dx, 0.72, 11.55), (9.4, 1.16, 0.3), r_edge=0.1, r_plan=0.12, k=1, mat=0, space=3.0))
        drawer.add(cylinder((dx, 1.3, 11.84), (0, 0, 1), 0.3, 0.42, nseg=10, r_end=0.12, mat=1, n=2))
    drawer.add(plate_z((0.0, 1.3, 11.5), 6.4, 1.08, 0.12, r_plan=0.3, r_edge=0.04, k=2, mat=1))
    root = _root(top.build(), entry)
    POLICY["neutral"] = {"Workbench_Top"}                            # the pad, frame and marks sit embedded in the top: baked AO would spike
    objs = [root, frame.build(parent=root), drawer.build(parent=root)]
    for nm, x, acc in (("Tray", -15.5, ["parts_tray"]), ("Build", 0.25, ["music_box_case", "carousel_base", "windmill_base", "clock_tower_base"]),
                       ("Blueprint", 15.75, ["blueprint_sheet", "parcel"])):
        objs.append(empties.add_socket(root, nm, (M(x), M(3.0), 0.0), acc, (0.0, 1.0, 0.0)))
    return objs, dict(origin=("centre", "min", "centre"), closed=True)


# ======================================================================================
# parts_tray: 12.5 x 2.5 x 21 cm (TOCKTON_DIMENSIONS 5.2): walnut tray, velvet lining, eight fitted compartments
# ======================================================================================
TRAY_COLS = {-1: (-5.55, 0.09, (-4.4, 0.6, 5.2)), 1: (0.31, 5.55, (-6.0, -1.2, 3.6))}      # per column: x range and its row dividers (z)


def build_tray(entry, p):
    body = Part("PartsTray_Body", ["Mat_Walnut", "Mat_VelvetTeal"])
    div = Part("PartsTray_Divider", ["Mat_Walnut"])
    prof = make_profile([(5.2, 0.0), (0.0, 0.0), (0.0, 2.5), (0.42, 2.5), (0.65, 2.28), (0.65, 0.62), (5.2, 0.6)], [0, 0.14, 0.1, 0.06, 0, 0.12, 0],
                        [0] * 4 + [1] * 2, n=2, max_len=2.4)
    body.add(rr_sweep(prof, 6.25, 10.5, 0.6, k=2, space=2.6))
    div.add(rbox((0.2, 0.55, 0.0), (0.22, 1.45, 19.8), r_edge=0.03, mat=0, space=30.0))
    sockets = []
    for col, (x0, x1, zs) in TRAY_COLS.items():
        edges = [-9.85] + list(zs) + [9.85]
        for z in zs:
            div.add(rbox(((x0 + x1) / 2, 0.55, z), (x1 - x0 + 0.2, 1.45, 0.22), r_edge=0.03, mat=0, space=30.0))
        for i in range(len(edges) - 1):
            sockets.append(((x0 + x1) / 2, (edges[i] + edges[i + 1]) / 2))
    root = _root(body.build(), entry)
    objs = [root, div.build(parent=root)]
    for i, (x, z) in enumerate(sockets, 1):
        objs.append(empties.add_socket(root, f"Slot{i:02d}", (M(x), M(0.6), M(z)), ["part"], (0.0, 1.0, 0.0)))
    return objs, dict(origin=("centre", "min", "centre"), closed=True)


# ======================================================================================
# parcel: 12 x 6 x 9 cm brown-paper parcel (TOCKTON_DIMENSIONS 5.2); the flap hinges at the back top edge, the string unties
# ======================================================================================
PB = (5.9, 4.44)                             # carton half sizes
PBOX_H, PFLAP_H = 5.0, 5.3
RS = 0.06                                    # string radius


def _loop_xy(plane, cx, cy, sa, sb, n=16, along_z=0.0):
    """Closed ellipse path of string: plane 'xy' (x = cx + sa cos, y = cy + sb sin, z = along_z) or 'zy' (z, y; x = along_z)."""
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        a, y = cx + sa * math.cos(t), cy + sb * math.sin(t)
        pts.append((a, y, along_z) if plane == "xy" else (along_z, y, a))
    return pts


def build_parcel(entry, p):
    paper = Part("Parcel_Box", ["Mat_CreamPaper"])
    flap = Part("Parcel_Flap", ["Mat_CreamPaper"])
    string = Part("Parcel_String", ["Mat_Fabric"])
    prof = make_profile([(3.8, 0.0), (0.0, 0.0), (0.0, PBOX_H), (0.18, PBOX_H), (0.32, 4.85), (0.32, 0.45), (3.8, 0.45)],
                        [0, 0.22, 0.18, 0.05, 0, 0.15, 0], [0] * 6, n=2, max_len=2.4)
    paper.add(rr_sweep(prof, PB[0], PB[1], 0.35, k=2, space=2.4))
    for sx in (-1, 1):                                               # paper folds on the two ends: one rising from below, one falling from above
        lo = round_loop([(-4.05, 0.3), (4.05, 0.3), (0.0, 3.3)], 0.25, 2)
        hi = round_loop([(-4.05, 4.8), (4.05, 4.8), (0.0, 2.4)], 0.25, 2)
        paper.add(prism_x([tuple(q) for q in lo], sx * 5.84, sx * 5.93))
        paper.add(prism_x([tuple(q) for q in hi], sx * 5.91, sx * 6.0))
    fp = make_profile([(3.8, PBOX_H), (0.0, PBOX_H), (0.0, PFLAP_H), (3.8, PFLAP_H)], [0, 0.1, 0.14, 0], [0] * 3, n=2, max_len=2.4)
    flap.add(rr_sweep(fp, PB[0], PB[1], 0.35, k=2, space=2.4))
    # string: a band round each cross-section and a four-loop bow over the crossing
    ya, yb, zb, xb = 0.12, PFLAP_H, PB[1], PB[0]            # the string sits half sunk into the paper
    sec = round_section(RS, 6)
    band_a = round_loop([(0, ya, -zb), (0, ya, zb), (0, yb, zb), (0, yb, -zb)], 0.45, 2)
    band_b = round_loop([(-xb, ya, 0), (xb, ya, 0), (xb, yb, 0), (-xb, yb, 0)], 0.45, 2)
    string.add(sweep([tuple(q) for q in band_a], sec, (1, 0, 0), closed=True))
    string.add(sweep([tuple(q) for q in band_b], sec, (0, 0, 1), closed=True))
    string.add(lathe(make_profile([(0.0, -0.2), (0.32, -0.1), (0.36, 0.08), (0.22, 0.24), (0.0, 0.3)], None, [0] * 4), (0.0, PFLAP_H + 0.1, 0.0), (0, 1, 0), 10))
    crest = 6.0 - RS
    for s in (-1, 1):
        string.add(sweep(_loop_xy("xy", s * 1.35, crest - 0.3, 1.25, 0.3, 14), sec, (0, 0, 1), closed=True))
        string.add(sweep(_loop_xy("zy", s * 1.35, crest - 0.3, 1.25, 0.3, 14), sec, (1, 0, 0), closed=True))
    root = _root(paper.build(), entry)
    hinge = (0.0, 5.15, -PB[1])
    piv = _pivot(root, "Flap", hinge, "+X")
    minus = tuple(-v for v in wu.g2b(tuple(M(c) for c in hinge)))
    flap_o = flap.build(parent=piv, location=minus)
    string_o = string.build(parent=root)
    col = empties.add_collider(root, "Open", "box", (M(4.0), M(1.0), M(3.0)), (0.0, M(5.4), 0.0))
    POLICY["pose"] = lambda: pose_rotate(piv, -105.0, "X")
    POLICY["hide"] = {"Parcel_Box": ["Parcel_String"], "Parcel_Flap": ["Parcel_String"]}
    return [root, piv, flap_o, string_o, col], dict(origin=("centre", "min", "centre"), closed=True, pivot_nodes=[flap_o])


# ======================================================================================
# letter_envelope: closed envelope 12 x 0.4 x 8.5 cm (TOCKTON_DIMENSIONS 5.2) with a V flap, a wax seal on its tip (the pinch target)
# and a tri-fold sheet inside that the runtime slides out; the text itself is run-time UI
# ======================================================================================
def build_letter(entry, p):
    env = Part("Letter_Envelope", ["Mat_CreamPaper"])
    flap = Part("Letter_Flap", ["Mat_CreamPaper"])
    seal = Part("Letter_Seal", ["Mat_WarmEmissive"])
    sheet = Part("Letter_Sheet", ["Mat_CreamPaper"])
    prof = make_profile([(3.8, 0.0), (0.0, 0.0), (0.0, 0.19), (0.9, 0.25), (3.8, 0.26)], [0, 0.05, 0.03, 0, 0], [0] * 4, n=1, max_len=2.2)
    env.add(rr_sweep(prof, 6.0, 4.25, 0.15, k=1, space=2.2))
    tri = round_loop([(-6.0, -4.25), (6.0, -4.25), (0.0, 0.62)], 0.4, 2)
    flap.add(prism_y([(float(q[0]), float(q[1])) for q in tri], 0.265, 0.305))
    sp = make_profile([(0.0, -0.05), (0.7, -0.05), (0.76, 0.02), (0.7, 0.085), (0.5, 0.115), (0.34, 0.085), (0.22, 0.085), (0.0, 0.1)], None, [0] * 7)
    seal.add(lathe(sp, (0.0, 0.285, 0.0), (0, 1, 0), 28, mod=lambda t: 1.0 + 0.045 * math.cos(7 * t)))
    sheet.add(rbox((0.0, 0.05, 0.0), (11.0, 0.14, 5.2), r_edge=0.04, r_plan=0.1, k=1, mat=0, space=6.0))
    root = _root(env.build(), entry)
    hinge = (0.0, 0.285, -4.25)
    piv = _pivot(root, "Flap", hinge, "+X")
    minus = tuple(-v for v in wu.g2b(tuple(M(c) for c in hinge)))
    flap_o = flap.build(parent=piv, location=minus)
    seal_o = seal.build(parent=root)
    sheet_o = sheet.build(parent=root)
    col = empties.add_collider(root, "Pinch", "box", (M(1.4), M(0.9), M(1.4)), (0.0, M(0.4), 0.0))
    POLICY["pose"] = lambda: pose_rotate(piv, -160.0, "X")
    POLICY["neutral"] = {"Letter_Sheet"}
    POLICY["hide"] = {"Letter_Envelope": ["Letter_Seal", "Letter_Sheet"], "Letter_Flap": ["Letter_Seal"]}
    return [root, piv, flap_o, seal_o, sheet_o, col], dict(origin=("centre", "min", "centre"), closed=True, pivot_nodes=[flap_o])


# ======================================================================================
# blueprint_sheet: 12 x 1.2 x 20 cm paper, flat, with its far edge curled into a loose roll (TOCKTON_DIMENSIONS 5.2)
# ======================================================================================
def build_blueprint(entry, p):
    sheet = Part("Blueprint_Sheet", ["Mat_CreamPaper"])
    t, dec = 0.05, 0.55
    R = (1.2 - t) / (1.0 + (1.0 - dec / 3.0))                        # outer top of the roll = 1.2 cm
    rr = lambda deg: R * (1.0 - dec * (-90.0 - deg) / 540.0)
    z0 = -10.0 + rr(-180.0)                                          # leftmost point of the curl sits at z = -10
    cy = R + t / 2
    path = [(0.0, t / 2, 10.0)]
    zz = 10.0
    while zz - 2.0 > z0:
        zz -= 2.0
        path.append((0.0, t / 2, zz))
    for k in range(0, 61):                                           # 1.5 turns, 6 steps per quarter turn
        deg = -90.0 - 540.0 * k / 60.0
        r = rr(deg)
        path.append((0.0, cy + r * math.sin(math.radians(deg)), z0 + r * math.cos(math.radians(deg))))
    sec = rect_section(12.0, t, 0.02, v0=-t / 2)
    sheet.add(sweep(path, sec, (1, 0, 0)))
    root = _root(sheet.build(), entry)
    return [root], dict(origin=("centre", "min", "centre"), closed=True)


# ======================================================================================
# gift_box: authored as a 20 cm cube with 18 cm clear inside (TOCKTON_DIMENSIONS 5.2); the viewer scales it uniformly.
# Carton + paper sleeve + plug lid + two teal ribbon bands + a four-loop bow (the bow crest is the top of the cube)
# ======================================================================================
def build_gift(entry, p):
    paper, teal = 0, 0
    box = Part("GiftBox_Box", ["Mat_CreamPaper"])
    wrap = Part("GiftBox_Wrap", ["Mat_CreamPaper"])
    lid = Part("GiftBox_Lid", ["Mat_CreamPaper"])
    rib = Part("GiftBox_Ribbon", ["Mat_TealPaint"])
    bow = Part("GiftBox_Bow", ["Mat_TealPaint"])
    A_, H_, SL = 9.86, 17.6, 0.26                                    # outer half width, rim height, paper sleeve thickness
    sp = 3.4
    bp = make_profile([(8.0, 0.0), (SL, 0.0), (SL, H_), (SL + 0.6, H_), (SL + 0.6, 0.7), (8.0, 0.7)], [0, 0.22, 0.2, 0.06, 0.1, 0], [0] * 5, n=2, max_len=sp)
    box.add(rr_sweep(bp, A_, A_, 0.45, k=2, space=sp))
    sl_pts = round_loop([(0.0, 0.0), (SL + 0.02, 0.0), (SL + 0.02, H_), (0.0, H_)], 0.06, 1)
    sl_pts, sl_m = [tuple(q) for q in sl_pts], [0] * len(sl_pts)
    wrap.add(rr_sweep((sl_pts, sl_m), A_, A_, 0.45, k=2, space=sp, closed=True))
    for sx in (-1, 1):                                               # two paper folds on each of the +-x faces
        lo = round_loop([(-6.2, 0.4), (6.2, 0.4), (0.0, 9.4)], 0.5, 2)
        hi = round_loop([(-6.2, H_ - 0.4), (6.2, H_ - 0.4), (0.0, 8.2)], 0.5, 2)
        wrap.add(prism_x([tuple(q) for q in lo], sx * (A_ - 0.03), sx * (A_ + 0.06)))
        wrap.add(prism_x([tuple(q) for q in hi], sx * (A_ + 0.0), sx * (A_ + 0.14)))
    lp = make_profile([(8.0, 16.2), (1.1, 16.2), (1.1, H_), (0.0, H_), (0.0, H_ + 1.0), (8.0, H_ + 1.0)], [0, 0.14, 0, 0.08, 0.3, 0], [0] * 5, n=2, max_len=sp)
    lid.add(rr_sweep(lp, A_, A_, 0.45, k=2, space=sp))
    top = H_ + 1.0
    for axis in ("x", "z"):                                          # ribbon bands: closed loops round the box, tucked under the base
        pts = [(0.0, 0.3, -A_), (0.0, 0.3, A_), (0.0, top, A_), (0.0, top, -A_)] if axis == "z" else \
              [(-A_, 0.3, 0.0), (A_, 0.3, 0.0), (A_, top, 0.0), (-A_, top, 0.0)]
        loop = [tuple(q) for q in round_loop(pts, 1.1, 3)]
        out = []
        for a, b in zip(loop, loop[1:] + loop[:1]):
            out.append(a)
            seg_n = int(math.ceil(np.linalg.norm(np.array(b) - np.array(a)) / 4.0))
            out += [tuple(np.array(a) + (np.array(b) - np.array(a)) * (q / seg_n)) for q in range(1, seg_n)] if seg_n > 1 else []
        off = 0.0 if axis == "z" else 0.03
        sec = rect_section(2.4, 0.2 + off, 0.04, v0=-0.06)
        rib.add(sweep(out, sec, (1, 0, 0) if axis == "z" else (0, 0, 1), outward=(0.0, 9.0, 0.0), closed=True))
    sec_b = [(-0.9, -0.05), (0.9, -0.05), (0.9, 0.05), (-0.9, 0.05)]
    by = top + 0.2
    bow.add(rbox((0.0, top - 0.2, 0.0), (2.4, 1.05, 2.4), r_edge=0.3, r_plan=0.6, k=2, mat=0, space=3.0, n=2))
    for s in (-1, 1):
        bow.add(sweep(_loop_xy("xy", s * 3.3, by + 0.45, 2.6, 0.7, 16), sec_b, (0, 0, 1), closed=True))
        bow.add(sweep(_loop_xy("zy", s * 3.3, by + 0.45, 2.6, 0.7, 16), sec_b, (1, 0, 0), closed=True))
    root = _root(box.build(), entry)
    lid_o = lid.build(parent=root)
    objs = [root, wrap.build(parent=root), lid_o, rib.build(parent=root), bow.build(parent=root)]
    objs.append(empties.add_collider(root, "Unwrap", "box", (M(10.0), M(1.5), M(10.0)), (0.0, M(top), 0.0)))
    lid_obj = lid_o
    def lift():
        lid_obj.location.z += 0.30
        bpy.context.view_layer.update()
        return lambda: (setattr(lid_obj.location, "z", lid_obj.location.z - 0.30), bpy.context.view_layer.update())
    POLICY["pose"] = lift
    POLICY["hide"] = {"GiftBox_Box": ["GiftBox_Wrap", "GiftBox_Ribbon", "GiftBox_Bow"], "GiftBox_Wrap": ["GiftBox_Ribbon", "GiftBox_Bow"],
                      "GiftBox_Lid": ["GiftBox_Ribbon", "GiftBox_Bow"]}
    return objs, dict(origin=("centre", "min", "centre"), closed=True)


# ======================================================================================
BUILDERS = {"machine_base_handle": build_handle, "trunk_main": build_trunk, "workbench": build_workbench, "parts_tray": build_tray,
            "parcel": build_parcel, "letter_envelope": build_letter, "blueprint_sheet": build_blueprint, "gift_box": build_gift}


def build(entry: dict, params: dict):
    POLICY.clear()
    return BUILDERS[entry["id"]](entry, params)


if __name__ == "__main__":
    raise SystemExit("gen_workshop.py is a forge family script. Run blender/scripts/forge.py --family <trunk|workshop|interaction|gifts>")
