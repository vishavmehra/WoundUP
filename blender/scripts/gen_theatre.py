"""gen_theatre.py - the Tockton theatre facade (forge family 'theatre', entry theatre_facade).

Not run directly. The family runner builds it:

    "$B" --background --factory-startup --python-exit-code 1 --python blender/scripts/forge.py -- \
         --family theatre --only theatre_facade --out-root <dir> --owner Machines [--manifest <file>]

A painted playhouse front at 1:48 (docs/TOCKTON_DIMENSIONS.md sections 3.3, 6, 11F; working values pending owner approval):
20.0 x 18.0 x 5.5 cm, double doors 4.5 wide and 6.0 tall at local x +5.0 to +9.5 (the aisle side). Symmetrical front on a stone
plinth: the entrance bay on the right and a matching lit arched window on the left, fluted-pilaster bays between, a teal panel with
a lit rose window in the middle, a lit clerestory, a teal frieze with brass dentils under a deep cornice, and a curved gable parapet
with a brass sun and ball finials. Facade only: behind the doors is an empty vestibule whose back wall is a lit panel (it shows when
the doors open); there is no stage, curtain or performance prop (CLAUDE.md section 14).

Nodes:
    TheatreFacade_Shell     (root) plinth, walls with the door recess and window openings, pilasters, frieze, cornice, panels
    TheatreFacade_Marquee   canopy over the entrance with a teal board, brass trim and a row of warm bulbs
    TheatreFacade_Pediment  curved gable parapet with a teal panel, a brass sun and finials
    PIV_DoorL / PIV_DoorR   hinge pivots (+Y axis, identity rotation) at the opening's left and right edge, floor level
    TheatreFacade_Door_L / _R   the leaves, children of their pivot (the mesh origin IS the hinge): rotate the pivot about Y to open

The doors open INWARDS: rotate PIV_DoorL by +100 degrees and PIV_DoorR by -100 degrees about Y (wu.openRotationY on each pivot). Frozen and awakened looks are runtime states of
the same materials (Mat_WarmEmissive is dark when frozen). Model space: origin at the centre of the floor-contact face, +Y up, front +Z.
"""
from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np

import wu_common as wu
from lib import empties
from gen_town_kit import (Part, T, Rx, Ry, Rz, arch_pts, box, boolean, cylinder, ellipsoid, lathe, open_edges, opening, prism, to_m, xf)

FAMILY = "theatre"

HX = 10.0                     # half width
ZB, ZW, ZP = -2.75, 1.75, 2.25   # back face, wall face, plinth front
PL = 0.60                     # plinth top, door floor
TOP = 14.40                   # top of the main block
DOORS = dict(x0=5.0, x1=9.5, y0=PL, ys=4.7, rise=1.3)       # 4.5 wide, 6.0 tall (PL + 4.1 + 1.3 = 6.0 above the sill 0.6 -> head 6.6)
BIGWIN = dict(x0=-9.5, x1=-5.0, y0=1.5, ys=4.9, rise=1.2)
CLERESTORY = [dict(x0=xc - 1.0, x1=xc + 1.0, y0=9.4, ys=11.9, rise=0.7) for xc in (-7.25, 7.25)]
GOLD = "Mat_PolishedBrass"


def op(d, grow=0.0, n=12):
    return opening(d["x0"] - grow, d["x1"] + grow, d["y0"] - grow, d["ys"], d["rise"] + grow * 0.5, n)


def cutter(d, z0, z1, grow=0.0):
    return prism(op(d, grow), "xy", z0, z1)


def ring(d, margin, z0, z1, bev=0.04):
    outer = prism(op(d, margin), "xy", z0, z1, bev=bev)
    return boolean(outer, [cutter(d, z0 - 0.2, z1 + 0.2)])


def arch_y(d, x):
    """Height of the arch of an opening spec at x."""
    half = (d["x1"] - d["x0"]) / 2.0
    xm = (d["x0"] + d["x1"]) / 2.0
    R = (half * half + d["rise"] ** 2) / (2 * d["rise"])
    cy = d["ys"] + d["rise"] - R
    return cy + math.sqrt(max(R * R - (x - xm) ** 2, 0.0))


# ======================================================================================
def build_shell(entry):
    part = Part(entry["meshes"][0], ["Mat_Stone", "Mat_PaintedWood", "Mat_TealPaint", GOLD, "Mat_WarmEmissive"])
    part.add(box((0, PL / 2, (ZB + ZP) / 2), (HX * 2, PL, ZP - ZB), bev=0.09, top_only=True), "Mat_Stone")      # plinth
    part.add(box((7.10, 0.17, 2.50), (5.5, 0.34, 0.50), bev=0.06, top_only=True), "Mat_Stone")                    # entrance apron step, front at z = 2.75
    # ---- main block: door recess, vestibule, big window and clerestory cut out
    blk = box((0, (0.45 + TOP) / 2, (ZB + 0.10 + ZW) / 2), (HX * 2 - 0.2, TOP - 0.45, ZW - ZB - 0.10), bev=0.07)
    vest = box((7.25, (PL + 6.7) / 2, (-1.4 + 1.25) / 2), (4.9, 6.1, 2.65))
    cuts = [vest, cutter(DOORS, 1.0, ZW + 0.3), cutter(BIGWIN, 1.15, ZW + 0.3)] + [cutter(w, 1.2, ZW + 0.3) for w in CLERESTORY]
    part.add(boolean(blk, cuts, self_overlap=False), "Mat_PaintedWood")
    # lit panels behind the windows (and the vestibule back wall, seen when the doors open)
    part.add(box((7.25, 3.6, -1.30), (4.4, 6.0, 0.14), bev=0.03), "Mat_WarmEmissive")
    pane = dict(BIGWIN, x0=BIGWIN["x0"] + 0.1, x1=BIGWIN["x1"] - 0.1, y0=BIGWIN["y0"] + 0.1, rise=BIGWIN["rise"] - 0.06)
    part.add(prism(op(pane), "xy", 1.18, 1.32, bev=0.03), "Mat_WarmEmissive")
    for w in CLERESTORY:
        p2 = dict(w, x0=w["x0"] + 0.08, x1=w["x1"] - 0.08, y0=w["y0"] + 0.08, rise=w["rise"] - 0.04)
        part.add(prism(op(p2), "xy", 1.22, 1.34, bev=0.025), "Mat_WarmEmissive")
        part.add(ring(w, 0.26, ZW - 0.05, ZW + 0.20), GOLD)
        xc = (w["x0"] + w["x1"]) / 2
        part.add(box((xc, (w["y0"] + w["ys"] + w["rise"]) / 2, 1.42), (0.12, w["ys"] + w["rise"] - w["y0"] - 0.1, 0.16), bev=0.03), GOLD)
        part.add(box((xc, 10.5, 1.42), (w["x1"] - w["x0"] - 0.1, 0.11, 0.16), bev=0.03), GOLD)
    # big arched window: brass frame, mullions, stone sill
    part.add(ring(BIGWIN, 0.38, ZW - 0.05, ZW + 0.24), GOLD)
    xw = (BIGWIN["x0"] + BIGWIN["x1"]) / 2
    part.add(box((xw, (BIGWIN["y0"] + BIGWIN["ys"] + BIGWIN["rise"]) / 2, 1.45), (0.13, BIGWIN["ys"] + BIGWIN["rise"] - BIGWIN["y0"] - 0.1, 0.18), bev=0.03), GOLD)
    for yb in (3.0, 4.6):
        part.add(box((xw, yb, 1.45), (BIGWIN["x1"] - BIGWIN["x0"] - 0.1, 0.12, 0.18), bev=0.03), GOLD)
    part.add(box((xw, 1.30, ZW + 0.28), (BIGWIN["x1"] - BIGWIN["x0"] + 1.0, 0.26, 0.62), bev=0.05, top_only=True), "Mat_Stone")
    # door surround: brass-lined arch with a keystone
    part.add(ring(DOORS, 0.42, ZW - 0.05, ZW + 0.26), "Mat_Stone")
    xd = (DOORS["x0"] + DOORS["x1"]) / 2
    part.add(box((xd, DOORS["ys"] + DOORS["rise"] + 0.45, ZW + 0.20), (0.8, 0.62, 0.36), bev=0.06), GOLD)
    # centre bay: raised teal panel with a brass border and a lit rose window
    part.add(box((0, 5.9, ZW + 0.08), (8.0, 7.3, 0.30), bev=0.07), "Mat_TealPaint")
    for sy, h, w_ in ((9.45, 0.18, 8.2), (2.30, 0.18, 8.2)):
        part.add(box((0, sy, ZW + 0.24), (w_, h, 0.16), bev=0.04), GOLD)
    for sx in (-4.1, 4.1):
        part.add(box((sx, 5.88, ZW + 0.24), (0.18, 7.3, 0.16), bev=0.04), GOLD)
    part.add(cylinder((0, 6.2, ZW + 0.30), 2.45, 0.22, n=28, axis="z", bev=0.05), GOLD)
    part.add(cylinder((0, 6.2, ZW + 0.40), 2.05, 0.18, n=28, axis="z", bev=0.03), "Mat_WarmEmissive")
    for a in range(0, 180, 45):
        b = box((0, 0, 0), (4.3, 0.12, 0.14), bev=0.025)
        xf(b, Rz(a), T(0, 6.2, ZW + 0.52))
        part.add(b, GOLD)
    part.add(cylinder((0, 6.2, ZW + 0.55), 0.38, 0.2, n=16, axis="z", bev=0.04), GOLD)
    # fluted pilasters with brass bases and capitals
    for xp in (-9.72, -4.72, 4.72, 9.72):
        edge = abs(xp) > 9.0
        xp = math.copysign(9.70, xp) if edge else xp
        part.add(box((xp, (PL + 14.0) / 2, ZW + 0.17), (0.56, 14.0 - PL, 0.58), bev=0.05), "Mat_PaintedWood")
        for yy, hh in ((PL + 0.15, 0.30), (13.75, 0.34)):
            part.add(box((xp, yy + hh / 2, ZW + 0.20), (0.60 if edge else 0.78, hh, 0.72), bev=0.05), GOLD)
    # frieze, dentils, cornice
    part.add(box((0, 13.45, ZW + 0.10), (HX * 2 - 0.1, 0.95, 0.34), bev=0.05), "Mat_TealPaint")
    for x in np.arange(-9.5, 9.6, 0.76):
        part.add(box((x, 13.78, ZW + 0.42), (0.34, 0.30, 0.32), bev=0.03), GOLD)
    part.add(box((0, 14.20, (ZW + 0.55 + 0.9) / 2 + 0.05), (HX * 2, 0.62, 1.30), bev=0.07), "Mat_PaintedWood")
    part.add(box((0, 14.62, 1.20), (HX * 2 - 0.1, 0.28, 2.0), bev=0.05), "Mat_PaintedWood")
    # entrance apron brass kick strip + the frieze sits proud of the pilasters' tops
    part.add(box((0, 0.98, ZW + 0.20), (HX * 2 - 1.8, 0.16, 0.16), bev=0.03), GOLD)
    return part


def parapet_profile(n=25):
    """(x, y) outline of the curved gable parapet: a flat shoulder at 16.1 with end plinths, rising in a cosine hump to 18.0."""
    pts = [(-HX, 14.55), (-HX, 16.65), (-9.2, 16.65), (-9.2, 16.1), (-6.0, 16.1)]
    xs = np.linspace(-6.0, 6.0, n)
    pts += [(float(x), float(16.1 + 1.9 * max(math.cos(math.pi * x / 12.0), 0.0) ** 1.35)) for x in xs[1:-1]]
    pts += [(6.0, 16.1), (9.2, 16.1), (9.2, 16.65), (HX, 16.65), (HX, 14.55)]
    return pts


def build_pediment(entry):
    part = Part("TheatreFacade_Pediment", ["Mat_PaintedWood", "Mat_TealPaint", GOLD])
    prof = parapet_profile()
    part.add(prism(prof, "xy", 0.45, 1.70, bev=0.06), "Mat_PaintedWood")
    c = (0.0, 16.3)
    inner = [(c[0] + (x - c[0]) * 0.78, c[1] + (y - c[1]) * 0.62 + 0.12) for x, y in parapet_profile() if y > 16.0 and abs(x) < 6.1]
    inner = [(x, max(y, 16.28)) for x, y in inner]
    if len(inner) > 3:
        part.add(prism(inner, "xy", 1.62, 1.86, bev=0.04), "Mat_TealPaint")
    part.add(cylinder((0, 16.75, 1.95), 0.62, 0.20, n=24, axis="z", bev=0.04), GOLD)                       # brass sun
    for a in range(0, 360, 30):
        r = box((0, 0, 0), (0.12, 0.42, 0.14), bev=0.025)
        xf(r, Rz(a - 90))
        xf(r, T(0.87 * math.cos(math.radians(a)), 16.75 + 0.87 * math.sin(math.radians(a)), 1.95))
        part.add(r, GOLD)
    for sx in (-1, 1):                                                                                      # ball finials on the end plinths
        part.add(lathe([(0, 0.0), (0.34, 0.0), (0.34, 0.12), (0.2, 0.28), (0.2, 0.42), (0.38, 0.62), (0.38, 0.84), (0.22, 1.02), (0.0, 1.10)], 14,
                       (sx * 9.62, 16.62, 1.28)), GOLD)
    return part


def build_marquee(entry):
    part = Part("TheatreFacade_Marquee", ["Mat_TealPaint", GOLD, "Mat_WarmEmissive"])
    xc, w = 6.95, 5.7
    part.add(box((xc, 8.00, 2.50), (w, 1.25, 0.40), bev=0.07), "Mat_TealPaint")                             # fascia board, front face at z = 2.70
    part.add(box((xc, 8.78, 2.20), (w + 0.2, 0.22, 1.10), bev=0.06, top_only=True), "Mat_TealPaint")        # canopy
    part.add(box((xc, 7.30, 2.40), (w + 0.1, 0.16, 0.70), bev=0.04), "Mat_TealPaint")                       # soffit
    for sy in (8.62, 7.38):
        part.add(box((xc, sy, 2.55), (w + 0.08, 0.12, 0.18), bev=0.03), GOLD)
    for sx in (xc - w / 2 - 0.02, xc + w / 2 + 0.02):
        part.add(box((sx, 8.0, 2.55), (0.14, 1.36, 0.18), bev=0.03), GOLD)
    for i in range(9):
        part.add(ellipsoid((xc - w / 2 + 0.45 + i * (w - 0.9) / 8, 7.52, 2.55), (0.17, 0.17, 0.17), 10, 6), "Mat_WarmEmissive")
    part.add(box((xc, 8.0, 2.715), (w - 1.0, 0.62, 0.05), bev=0.02), GOLD)                                  # name plate
    return part


def build_door(entry, side):
    """Leaf of the double door; mesh origin at the hinge (floor level, mid-thickness). side +1 = left leaf (hinge on the left edge)."""
    name = "TheatreFacade_Door_L" if side > 0 else "TheatreFacade_Door_R"
    part = Part(name, ["Mat_Walnut", GOLD])
    d = DOORS
    xm = (d["x0"] + d["x1"]) / 2
    hinge = d["x0"] if side > 0 else d["x1"]
    inset = 0.04
    xa, xb = (d["x0"] + inset, xm - inset) if side > 0 else (xm + inset, d["x1"] - inset)
    xs = np.linspace(xa, xb, 8)
    top = [(float(x), arch_y(d, float(x)) - 0.10) for x in xs]
    pts = [(xa, d["y0"]), (xb, d["y0"])] + top[::-1] if side > 0 else [(xa, d["y0"]), (xb, d["y0"])] + top[::-1]
    # polygon in the plane: bottom edge, then the arched top from xb back to xa
    leaf = prism([(x - hinge, y - d["y0"]) for x, y in pts], "xy", -0.15, 0.15, bev=0.04)
    part.add(leaf, "Mat_Walnut")
    wlen = abs(xb - xa)
    sgn = 1 if side > 0 else -1
    xc = sgn * (inset + wlen / 2)
    for y0, y1 in ((0.45, 2.30), (2.75, 3.80)):                                                             # raised panels, front and back
        for zc in (0.17, -0.17):
            part.add(box((xc, (y0 + y1) / 2, zc), (wlen - 0.55, y1 - y0, 0.07), bev=0.03), "Mat_Walnut")
    mid = sgn * (inset + wlen)                                                                              # the meeting edge: a brass astragal
    part.add(box((mid - sgn * 0.05, 2.7, 0.0), (0.10, 5.0, 0.34), bev=0.02), GOLD)
    for yh in (0.9, 3.6):                                                                                   # strap hinges
        part.add(box((sgn * (inset + 0.40), yh, 0.17), (0.80, 0.14, 0.06), bev=0.02), GOLD)
    part.add(ellipsoid((mid - sgn * 0.35, 2.55, 0.26), (0.15, 0.15, 0.10), 10, 6), GOLD)                    # handle boss
    part.add(box((mid - sgn * 0.35, 2.05, 0.23), (0.07, 0.42, 0.05), bev=0.015), GOLD)
    return part, hinge


def build(entry: dict, params: dict):
    shell, mar, ped = build_shell(entry), build_marquee(entry), build_pediment(entry)
    dl, hl = build_door(entry, +1)
    dr, hr = build_door(entry, -1)
    wu.log(f"theatre faces: shell {shell.stats()} marquee {mar.stats()} pediment {ped.stats()} doorL {dl.stats()} doorR {dr.stats()}")
    root = shell.to_object()
    root["wu"] = dict(id=entry["id"], family=FAMILY, doorsOpenInwards=True)
    kids = []
    for part in (mar, ped):
        o = part.to_object()
        o.parent = root
        kids.append(o)
    pivots, leaves = [], []
    for part, hinge, nm, sign in ((dl, hl, "DoorL", +1), (dr, hr, "DoorR", -1)):
        piv = empties.add_pivot(root, nm, to_m((hinge, PL, 1.5 + 0.0)), axis_g=(0.0, 0.0, 1.0), kind="hinge", axis_label="+Y")
        piv["wu"] = dict(type="pivot", kind="hinge", axis="+Y", openRotationY=(100.0 if sign > 0 else -100.0), note="degrees about +Y; doors open inwards")
        leaf = part.to_object()
        leaf.parent = piv
        pivots.append(piv)
        leaves.append(leaf)
    return [root] + kids + pivots + leaves, dict(origin=("centre", "min", "centre"), closed=True)


PARAMS = {"theatre_facade": dict()}

if __name__ == "__main__":
    raise SystemExit("gen_theatre.py is a forge family. Run blender/scripts/forge.py --family theatre --only theatre_facade --out-root <dir>")
