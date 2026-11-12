"""gen_bakery.py - Otto's bakery (forge family 'bakery', entry bakery_building).

Not run directly. The family runner builds it:

    "$B" --background --factory-startup --python-exit-code 1 --python blender/scripts/forge.py -- \
         --family bakery --only bakery_building --out-root <dir> --owner Machines [--manifest <file>]

A small two-storey town bakery at 1:48 (docs/TOCKTON_DIMENSIONS.md sections 3.3, 6, 7; working values pending owner approval):
13.0 x 9.5 cm footprint, eaves at 13.5 cm, chimney top at 19.0 cm. Stone ground floor laid in courses (grooves cut in), a
half-timbered cream plaster upper floor, a teal tiled roof (every tile is a modelled shell) with a walnut ridge and brass finials,
a striped awning with scalloped valance, a stone-arched oven mouth that glows through Mat_WarmEmissive, lit upper windows,
an open serving hatch for Otto and a panelled arched door.

Nodes (all children of the root Bakery_Shell, transforms applied):
    Bakery_Shell    walls, plinth, timber frame, roof, awning, sign, lanterns       Stone, PaintedWood, Walnut, TealPaint, AgedBrass, WarmEmissive
    Bakery_Chimney  stone stack with flue pot, standing in the roof                 Stone
    Bakery_Oven     arch surround, glow plate (emissive), three loaves              Stone, WarmEmissive, PaintedWood
    Bakery_Window   hatch frame and counter, two lit upper windows                  Walnut, WarmEmissive
    Bakery_Door     panelled arched door, frame, hinges, knob                       Walnut, AgedBrass
    SOCKET_Baker    where Otto's feet stand: (-4.5, 0.4, 2.75) cm (TOCKTON_DIMENSIONS section 7), +Z facing, accepts figure_otto
    SOCKET_Smoke    chimney mouth (4.0, 19.0, -2.75) cm, +Y, accepts fx_smoke (a runtime effect)

Frozen and awakened looks are runtime states of the same materials: Mat_WarmEmissive (oven, upper windows, lanterns) is dark when frozen.
Model space: origin at the centre of the floor-contact face (x centre, y 0, z centre), +Y up, front towards +Z.
"""
from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np

import bpy
from mathutils import Vector

import wu_common as wu
from lib import empties
from gen_town_kit import (Part, T, Rx, Ry, Rz, arch_pts, box, boolean, cylinder, ellipsoid, lathe, merge_cutters, open_edges,
                          opening, prism, to_m, xf)

FAMILY = "bakery"

# ---- layout, cm (glTF axes) -------------------------------------------------------------------------------------------
X0, X1 = -6.0, 6.0            # stone wall faces
ZB, ZF = -4.25, 4.20          # back and front wall faces
PL = 0.60                     # plinth top = door threshold
Y1 = 6.20                     # top of the stone ground floor
UX = 5.95                     # upper plaster half width
UZB, UZF = -4.20, 4.15        # upper plaster faces (a hair behind the stone)
EAVE = 13.5
THETA = math.radians(36.0)
TAN, COS, SIN = math.tan(THETA), math.cos(THETA), math.sin(THETA)
ROOF_T = 0.50
TIP_Z = 4.75                  # eave tips
Y_E = EAVE - (TIP_Z - ZF) * TAN          # roof slab underside at the tips
TV = ROOF_T / COS
Y_TIP_TOP = Y_E + TV
ROOF_X = 6.5
TILE_T = 0.14
COURSES = 9
COURSE_H = (Y1 - PL) / COURSES

DOOR = dict(x0=-0.90, x1=1.20, y0=PL, ys=4.20, rise=0.80)
HATCH = dict(x0=-5.25, x1=-2.40, y0=1.20, ys=4.40, rise=0.60)
OVEN = dict(x0=2.45, x1=5.10, y0=1.00, ys=3.70, rise=0.90)
UP_WIN = [dict(x0=xc - 1.1, x1=xc + 1.1, y0=8.0, ys=10.95, rise=0.50) for xc in (-3.3, 3.3)]


def op(d, grow=0.0, n=10):
    """Opening polygon (xy plane) of a spec dict, grown by `grow` on every side."""
    return opening(d["x0"] - grow, d["x1"] + grow, d["y0"] - grow, d["ys"], d["rise"] + grow * 0.5, n)


def cutter(d, z0, z1, grow=0.0):
    return prism(op(d, grow), "xy", z0, z1)


def ring(d, margin, z0, z1, mat_bev=0.05):
    """A frame round an opening: outer outline minus the opening, z0..z1."""
    outer = prism(op(d, margin), "xy", z0, z1, bev=mat_bev)
    return boolean(outer, [cutter(d, z0 - 0.2, z1 + 0.2)])


# ======================================================================================
# the shell
# ======================================================================================
def stone_ground_floor():
    cx, cz = (X0 + X1) / 2, (ZB + ZF) / 2
    blk = box((cx, (0.45 + Y1) / 2, cz), (X1 - X0, Y1 - 0.45, ZF - ZB), bev=0.07)
    # openings: Otto's hatch with the alcove behind it, the door, the oven pocket
    alcove = box((-3.8, (0.40 + 5.30) / 2, (-2.8 + 3.6) / 2), (3.8, 4.9, 6.4))
    cuts = [alcove, cutter(HATCH, 3.30, ZF + 0.3), cutter(DOOR, 3.60, ZF + 0.3), cutter(OVEN, 3.30, ZF + 0.3)]
    wall = boolean(blk, cuts, self_overlap=False)
    # mortar courses: horizontal lines and staggered vertical joints on the front, both sides and the back
    g, jw = 0.07, 0.07
    h_cut, v_cut = [], []
    for k in range(1, COURSES):
        y = PL + COURSE_H * k
        h_cut += [box((cx, y, ZF), (X1 - X0 + 0.4, g, 0.12)), box((cx, y, ZB), (X1 - X0 + 0.4, g, 0.12)),
                  box((X0, y, cz), (0.12, g, ZF - ZB + 0.4)), box((X1, y, cz), (0.12, g, ZF - ZB + 0.4))]
    for k in range(COURSES):
        yc = PL + COURSE_H * (k + 0.5)
        hh = COURSE_H - g
        off = 0.8 if k % 2 else 0.0
        for x in np.arange(X0 + 1.2 + off, X1 - 0.5, 1.6):
            v_cut.append(box((x, yc, ZF), (jw, hh, 0.12)))
            v_cut.append(box((x, yc, ZB), (jw, hh, 0.12)))
        for z in np.arange(ZB + 1.0 + off, ZF - 0.5, 1.55):
            v_cut.append(box((X0, yc, z), (0.12, hh, jw)))
            v_cut.append(box((X1, yc, z), (0.12, hh, jw)))
    wall = boolean(wall, [merge_cutters(h_cut)], self_overlap=True)
    wall = boolean(wall, [merge_cutters(v_cut[i::2]) for i in range(2)], self_overlap=True)
    return wall


def quoins():
    """Alternating long and short corner stones standing a little proud of the stone walls (front corners and the back corners)."""
    out = []
    for k in range(COURSES):
        yc = PL + COURSE_H * (k + 0.5)
        long_ = k % 2 == 0
        for sx in (-1, 1):
            xe = sx * X1
            lx, lz = (0.62, 0.62) if long_ else (0.40, 0.40)
            for zc, sz in ((ZF, 1), (ZB, -1)):
                out.append(box((xe - sx * (lx / 2 - 0.05), yc, zc - sz * (0.62 / 2 - 0.05)), (lx, COURSE_H - 0.10, 0.62), bev=0.05))
                out.append(box((xe - sx * (0.62 / 2 - 0.05), yc, zc - sz * (lz / 2 - 0.05)), (0.62, COURSE_H - 0.10, lz), bev=0.05))
    return out


def timber_frame():
    out = []
    pw, pr = 0.50, 0.14                                # post width, proud
    yl, yh = 6.1, 13.45
    ym, hh = (yl + yh) / 2, yh - yl
    for sx in (-1, 1):                                  # corner posts, front and back
        out.append(box((sx * (UX - pw / 2 + 0.05), ym, UZF + pr / 2 - 0.02), (pw, hh, pr + 0.04), bev=0.04))
        out.append(box((sx * (UX - pw / 2 + 0.05), ym, UZB - pr / 2 + 0.02), (pw, hh, pr + 0.04), bev=0.04))
        out.append(box((sx * 1.35, ym, UZF + pr / 2 - 0.02), (0.42, hh, pr + 0.04), bev=0.04))
    for z in (-2.1, 0.0, 2.1):                          # side posts
        for sx in (-1, 1):
            out.append(box((sx * (UX + pr / 2 - 0.02), ym, z), (pr + 0.04, hh, 0.42), bev=0.04))
    # rails: jetty band, mid rail, top plate (front, back and both sides)
    for yc, h, pr_ in ((6.40, 0.62, 0.24), (12.72, 0.42, 0.14), (13.30, 0.40, 0.14)):
        out.append(box((0, yc, UZF + pr_ / 2 - 0.04), (UX * 2 + 0.14, h, pr_ + 0.04), bev=0.045))
        out.append(box((0, yc, UZB - pr_ / 2 + 0.04), (UX * 2 + 0.14, h, pr_ + 0.04), bev=0.045))
        for sx in (-1, 1):
            out.append(box((sx * (UX + pr_ / 2 - 0.04), yc, (UZF + UZB) / 2), (pr_ + 0.04, h, UZF - UZB + 0.14), bev=0.045))
    # diagonal braces beside the windows (front) and between the side posts
    def brace(p0, p1, plane_z=None, plane_x=None):
        (a0, b0), (a1, b1) = p0, p1
        L = math.hypot(a1 - a0, b1 - b0)
        ang = math.degrees(math.atan2(b1 - b0, a1 - a0))
        if plane_z is not None:
            sh = box((0, 0, 0), (L, 0.30, 0.16), bev=0.035)
            xf(sh, Rz(ang), T((a0 + a1) / 2, (b0 + b1) / 2, plane_z))
        else:
            sh = box((0, 0, 0), (0.16, 0.30, L), bev=0.035)
            xf(sh, Rx(-ang), T(plane_x, (b0 + b1) / 2, (a0 + a1) / 2))
        return sh
    for sx in (-1, 1):
        out.append(brace((sx * 5.55, 6.7), (sx * 4.55, 7.95), plane_z=UZF + 0.06))
        out.append(brace((sx * 5.55, 12.55), (sx * 4.55, 11.4), plane_z=UZF + 0.06))
        out.append(brace((sx * 1.2, 6.7), (sx * 2.0, 7.7), plane_z=UZF + 0.06))
        out.append(brace((-4.0, 6.7), (-2.4, 8.4), plane_x=sx * (UX + 0.06)) if False else brace((-3.0, 6.7), (-1.6, 8.3), plane_x=sx * (UX + 0.06)))
        out.append(brace((3.0, 6.7), (1.6, 8.3), plane_x=sx * (UX + 0.06)))
    return out


def upper_floor():
    prof = [(UZB, 6.1), (UZF, 6.1), (UZF, EAVE + 0.12), (0.0, EAVE + 3.12), (UZB, EAVE + 0.12)]
    blk = prism(prof, "zy", -UX, UX, bev=0.05)
    cuts = [cutter(w, 3.75, UZF + 0.3) for w in UP_WIN]
    return boolean(blk, cuts, self_overlap=False)


def roof_slab():
    pts = [(TIP_Z, Y_E), (TIP_Z, Y_E + TV), (0.0, Y_E + TV + TIP_Z * TAN), (-TIP_Z, Y_E + TV), (-TIP_Z, Y_E), (0.0, Y_E + TIP_Z * TAN)]
    return prism(pts, "zy", -ROOF_X, ROOF_X, bev=0.05)


def roof_tiles():
    """Every tile a shell: 9 rows per side, 12 per row, alternate rows offset by half a tile, tops chamfered."""
    out = []
    n, pitch_x = 12, 2 * ROOF_X / 12
    ls = TIP_Z / COS
    rows = 9
    pitch = (ls - 0.10) / rows
    for side in (1, -1):
        for k in range(rows):
            s = 0.42 + k * pitch
            surf = Vector((0.0, Y_TIP_TOP + s * SIN, side * (TIP_Z - s * COS)))
            nrm = Vector((0.0, COS, side * SIN))
            ctr = surf + nrm * (TILE_T / 2 - 0.03)
            off = (pitch_x / 2) if k % 2 else 0.0
            for i in range(-1, n + 1):
                xa = -ROOF_X + off + pitch_x * i
                xb = xa + pitch_x
                xa, xb = max(xa, -ROOF_X + 0.03), min(xb, ROOF_X - 0.03)
                if xb - xa < 0.35:
                    continue
                sh = box((0, 0, 0), (xb - xa - 0.05, TILE_T, 0.80), bev=0.04, top_only=True)
                xf(sh, Rx(side * math.degrees(THETA)), T((xa + xb) / 2, ctr.y, ctr.z))
                out.append(sh)
    return out


def ridge_and_finials():
    yr = Y_TIP_TOP + TIP_Z * TAN + TILE_T - 0.02
    cap = prism([(-0.55, yr - 0.18), (0.55, yr - 0.18), (0.40, yr + 0.30), (-0.40, yr + 0.30)], "zy", -ROOF_X, ROOF_X, bev=0.05)
    fins = []
    for sx in (-1, 1):
        prof = [(0, 0.0), (0.30, 0.0), (0.30, 0.10), (0.16, 0.26), (0.16, 0.40), (0.30, 0.52), (0.30, 0.70), (0.20, 0.86), (0.0, 0.95)]
        f = lathe(prof, 12)
        xf(f, T(sx * (ROOF_X - 0.55), yr + 0.15, 0.0))
        fins.append(f)
    return cap, fins


def awning():
    """Eight stripes, alternate teal and cream, sloping down 0.5 cm over the 0.55 cm it stands out, each with a scalloped valance."""
    teal, cream = [], []
    n = 8
    w = 12.0 / n
    for i in range(n):
        xa, xb = -6.0 + w * i + 0.02, -6.0 + w * (i + 1) - 0.02
        pts = [(ZF - 0.08, 6.02), (TIP_Z, 5.52), (TIP_Z, 5.40), (ZF - 0.08, 5.90)]
        sh = prism(pts, "zy", xa, xb, bev=0.025)
        xc = (xa + xb) / 2
        val = [(xc - (w / 2 - 0.05) * math.cos(a), 5.47 - 0.46 * math.sin(a)) for a in np.linspace(0, math.pi, 9)]
        sc = prism(val, "xy", TIP_Z - 0.10, TIP_Z - 0.02, bev=0.02)
        (teal if i % 2 == 0 else cream).extend([sh, sc])
    brackets = [box((sx * 5.80, 5.80, ZF + 0.26), (0.16, 0.16, 0.56), bev=0.03) for sx in (-1, 1)]
    return teal, cream, brackets


def sign_medallion():
    disc = cylinder((0, 9.7, 4.20), 1.02, 0.22, n=24, axis="z", bev=0.04)
    plate = cylinder((0, 9.7, 4.31), 0.84, 0.10, n=24, axis="z")
    loaf = ellipsoid((0, 9.62, 4.40), (0.50, 0.26, 0.16), 14, 8)
    knots = [ellipsoid((x, 9.72 + dy, 4.43), (0.045, 0.04, 0.03), 8, 6) for x in (-0.28, -0.1, 0.08, 0.26) for dy in (0.16,)]
    return disc, plate, loaf, knots


def lantern(xc, yc=3.55):
    """Brass wall lantern with a warm core; returns (brass shells, emissive shells). Stays inside the 4.75 cm depth."""
    zc = 4.43
    brass = [box((xc, yc + 0.78, (ZF + zc) / 2 - 0.02), (0.12, 0.12, zc - ZF + 0.12), bev=0.02),
             cylinder((xc, yc - 0.34, zc), 0.27, 0.08, n=12, bev=0.015),
             cylinder((xc, yc + 0.40, zc), 0.27, 0.22, n=12, r_top=0.07),
             cylinder((xc, yc + 0.56, zc), 0.09, 0.14, n=8)]
    for a in range(4):
        brass.append(box((xc + 0.21 * math.cos(math.radians(45 + 90 * a)), yc + 0.03, zc + 0.21 * math.sin(math.radians(45 + 90 * a))), (0.05, 0.62, 0.05)))
    glow = [cylinder((xc, yc + 0.03, zc), 0.19, 0.62, n=12)]
    return brass, glow


def steps():
    return [box((0.15, 0.17, 4.46), (3.0, 0.34, 0.52), bev=0.06, top_only=True)]


def build_shell(entry):
    part = Part(entry["meshes"][0], ["Mat_Stone", "Mat_PaintedWood", "Mat_Walnut", "Mat_TealPaint", "Mat_AgedBrass", "Mat_WarmEmissive"])
    part.add(box((0, 0.30, -0.025), (12.3, 0.60, 8.75), bev=0.10, top_only=True), "Mat_Stone")      # plinth
    part.add(stone_ground_floor(), "Mat_Stone")
    part.add_all(quoins(), "Mat_Stone")
    part.add_all(steps(), "Mat_Stone")
    for w in UP_WIN:                                                                                  # window sills
        part.add(box(((w["x0"] + w["x1"]) / 2, 7.85, 4.30), (2.7, 0.24, 0.50), bev=0.05, top_only=True), "Mat_Stone")
    part.add(upper_floor(), "Mat_PaintedWood")
    part.add_all(timber_frame(), "Mat_Walnut")
    part.add(roof_slab(), "Mat_Walnut")
    part.add_all(roof_tiles(), "Mat_TealPaint")
    cap, fins = ridge_and_finials()
    part.add(cap, "Mat_Walnut")
    part.add_all(fins, "Mat_AgedBrass")
    teal, cream, brackets = awning()
    part.add_all(teal, "Mat_TealPaint")
    part.add_all(cream, "Mat_PaintedWood")
    part.add_all(brackets, "Mat_AgedBrass")
    disc, plate, loaf, knots = sign_medallion()
    part.add(disc, "Mat_AgedBrass")
    part.add(plate, "Mat_TealPaint")
    part.add(loaf, "Mat_PaintedWood")
    part.add_all(knots, "Mat_AgedBrass")
    b, g = lantern(1.82)
    part.add_all(b, "Mat_AgedBrass")
    part.add_all(g, "Mat_WarmEmissive")
    return part


def build_chimney(entry):
    part = Part("Bakery_Chimney", ["Mat_Stone"])
    cx, cz = 4.0, -2.75
    courses = 7
    y0, y1 = 13.0, 17.7
    h = (y1 - y0) / courses
    for k in range(courses):
        j = 0.05 if k % 2 else 0.0
        part.add(box((cx, y0 + h * (k + 0.5), cz), (1.55 + j, h - 0.04, 1.55 + j), bev=0.05), "Mat_Stone")
    part.add(box((cx, 17.95, cz), (2.00, 0.36, 2.00), bev=0.06), "Mat_Stone")                          # corbelled cap
    part.add(box((cx, 18.26, cz), (1.80, 0.30, 1.80), bev=0.05), "Mat_Stone")
    part.add(cylinder((cx, 18.64, cz), 0.52, 0.72, n=16, r_top=0.46, bev=0.04), "Mat_Stone")           # flue pot, top at 19.0
    return part


def build_oven(entry):
    part = Part("Bakery_Oven", ["Mat_Stone", "Mat_WarmEmissive", "Mat_PaintedWood"])
    part.add(ring(OVEN, 0.38, ZF - 0.05, ZF + 0.22), "Mat_Stone")                                      # arch surround
    # keystone
    xc = (OVEN["x0"] + OVEN["x1"]) / 2
    part.add(box((xc, OVEN["ys"] + OVEN["rise"] + 0.36, ZF + 0.14), (0.62, 0.50, 0.40), bev=0.05), "Mat_Stone")
    inner = dict(OVEN, x0=OVEN["x0"] + 0.12, x1=OVEN["x1"] - 0.12, y0=OVEN["y0"] + 0.12, rise=OVEN["rise"] - 0.1)
    part.add(prism(op(inner), "xy", 3.34, 3.56, bev=0.03), "Mat_WarmEmissive")                         # the glow, at the back of the pocket
    for i, dx in enumerate((-0.75, 0.0, 0.75)):
        part.add(ellipsoid((xc + dx, OVEN["y0"] + 0.20, 3.92 + (0.10 if i == 1 else 0.0)), (0.40, 0.23, 0.26), 12, 8), "Mat_PaintedWood")
    return part


def build_window(entry):
    part = Part("Bakery_Window", ["Mat_Walnut", "Mat_WarmEmissive"])
    part.add(ring(HATCH, 0.34, ZF - 0.05, ZF + 0.20), "Mat_Walnut")                                    # hatch frame
    xh = (HATCH["x0"] + HATCH["x1"]) / 2
    part.add(box((xh, 1.08, ZF + 0.22), (HATCH["x1"] - HATCH["x0"] + 0.9, 0.22, 0.62), bev=0.05, top_only=True), "Mat_Walnut")   # serving counter
    for w in UP_WIN:
        xc = (w["x0"] + w["x1"]) / 2
        part.add(ring(w, 0.30, UZF - 0.04, UZF + 0.22), "Mat_Walnut")
        pane = dict(w, x0=w["x0"] + 0.06, x1=w["x1"] - 0.06, y0=w["y0"] + 0.06, rise=w["rise"] - 0.04)
        part.add(prism(op(pane), "xy", 3.86, 3.98, bev=0.025), "Mat_WarmEmissive")
        part.add(box((xc, (w["y0"] + w["ys"] + w["rise"]) / 2 - 0.1, UZF - 0.05), (0.14, w["ys"] + w["rise"] - w["y0"] - 0.14, 0.16), bev=0.03), "Mat_Walnut")
        for yb in (9.0, 10.1):
            part.add(box((xc, yb, UZF - 0.05), (w["x1"] - w["x0"] - 0.1, 0.12, 0.16), bev=0.03), "Mat_Walnut")
    return part


def build_door(entry):
    part = Part("Bakery_Door", ["Mat_Walnut", "Mat_AgedBrass"])
    d = DOOR
    part.add(ring(d, 0.32, ZF - 0.05, ZF + 0.22), "Mat_Walnut")                                        # frame
    leaf = dict(d, x0=d["x0"] + 0.06, x1=d["x1"] - 0.06, y0=d["y0"] + 0.0, rise=d["rise"] - 0.05)
    part.add(prism(op(leaf), "xy", 3.96, ZF - 0.02, bev=0.04), "Mat_Walnut")
    xm = (leaf["x0"] + leaf["x1"]) / 2
    pw = (leaf["x1"] - leaf["x0"] - 0.45) / 2
    for dx in (-1, 1):
        part.add(box((xm + dx * (pw / 2 + 0.07), 1.80, ZF + 0.02), (pw, 1.40, 0.08), bev=0.03), "Mat_Walnut")
        part.add(box((xm + dx * (pw / 2 + 0.07), 3.55, ZF + 0.02), (pw, 1.15, 0.08), bev=0.03), "Mat_Walnut")
    for yh in (1.35, 4.05):
        part.add(box((leaf["x0"] + 0.36, yh, ZF + 0.07), (0.72, 0.11, 0.05), bev=0.02), "Mat_AgedBrass")
    part.add(ellipsoid((leaf["x1"] - 0.34, 2.65, ZF + 0.10), (0.13, 0.13, 0.09), 10, 6), "Mat_AgedBrass")
    return part


def build(entry: dict, params: dict):
    shell, chim, oven, win, door = build_shell(entry), build_chimney(entry), build_oven(entry), build_window(entry), build_door(entry)
    wu.log(f"bakery faces: shell {shell.stats()} chimney {chim.stats()} oven {oven.stats()} window {win.stats()} door {door.stats()}")
    root = shell.to_object()
    root["wu"] = dict(id=entry["id"], family=FAMILY, eaveM=0.135, chimneyTopM=0.19)
    kids = []
    for part in (chim, oven, win, door):
        o = part.to_object()
        o.parent = root
        kids.append(o)
    baker = empties.add_socket(root, "Baker", to_m((-4.5, 0.4, 2.75)), ["figure_otto"], axis_g=(0.0, 0.0, 1.0), note="Otto's feet; faces +Z")
    smoke = empties.add_socket(root, "Smoke", to_m((4.0, 19.0, -2.75)), ["fx_smoke"], axis_g=(0.0, 1.0, 0.0), note="chimney mouth")
    return [root] + kids + [baker, smoke], dict(origin=("centre", "min", "centre"), closed=True)


PARAMS = {"bakery_building": dict()}

if __name__ == "__main__":
    raise SystemExit("gen_bakery.py is a forge family. Run blender/scripts/forge.py --family bakery --only bakery_building --out-root <dir>")
