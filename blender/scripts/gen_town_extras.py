"""gen_town_extras.py - World extras: town_houses, town_props_set (forge family 'environment'), lantern_workbench ('workshop'),
run_lever ('interaction') and gift_engraving_plate ('gifts'). One script, like gen_workshop.py: FAMILY comes from --family.

Not run directly. The family runner builds one family per run:

    "$B" --background --factory-startup --python-exit-code 1 --python blender/scripts/forge.py -- \
         --family environment --only town_houses,town_props_set --out-root <dir> --owner World [--manifest <file>]

Scale: docs/TOCKTON_DIMENSIONS.md section 7 (1:48: Mira 35 mm, Bakery door 44 mm, Bakery eave 135 mm). Houses and props are
authored in the town frame at scale 1.0 (centimetres below, metres in the file). The workbench pieces (lantern, lever, plate) are
real size (1:1, 'Real size at workbench scale').

town_houses     four storybook houses as four nodes of one file, laid out in a row 12 mm apart (the town places each node itself):
                  TownHouse_Tall     3 storeys, narrow, front gable, teal roof          4.4 x 6.1 cm, ridge 16.8, chimney 18.3 cm
                  TownHouse_Corner   2 storeys + steep attic, oriel bay, walnut roof    4.6 x 6.1 cm
                  TownHouse_Cottage  2 storeys, eaves to the street, teal dormer         7.0 x 6.7 cm
                  TownHouse_Jetty    2 storeys, jettied upper floor, front gable, teal   7.1 x 7.3 cm
                cream render (Mat_PaintedWood), walnut half-timbering (Mat_Walnut), teal shutters, doors and roofs (Mat_TealPaint),
                lit panes and door lanterns (Mat_WarmEmissive: dark while frozen, glowing when the town wakes). Four slots per house.
                The left dressing zone (9.5 x 10.5 cm) takes Tall + Corner, the right (16 x 10.5 cm) Cottage + Jetty.
town_props_set  seven props, each its own node, each instanced by the town: bench, fence segment, small tree, shrub, flower planter
                (the only flowers in the town), signboard, path edging piece.
Every node of both sets carries extras.wu.originM = the floor-contact centre of that piece in the file frame (the layout is baked into
the vertex data, transforms are identity): the runtime places a copy at originM.
"""
from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bmesh
import bpy
from mathutils import Vector

import wu_common as wu
from lib import empties
from gen_town_kit import (Part, T, Rx, Ry, Rz, box, boolean, cylinder, ellipsoid, grid_subdivide, lathe, merge_cutters, opening,
                          prism, xf)
from gen_lamp_post import sweep as tube, catmull, taper


def _family() -> str:
    a = wu.script_args()
    return a[a.index("--family") + 1] if "--family" in a else "environment"


FAMILY = _family()
PW, WN, TL, EM, AB, PB, ST, GL, AGB = ("Mat_PaintedWood", "Mat_Walnut", "Mat_TealPaint", "Mat_WarmEmissive", "Mat_AgedBrass",
                                       "Mat_PolishedBrass", "Mat_Stone", "Mat_WarmGlass", "Mat_AgedBrass")
CREASE = 35.0


class XPart(Part):
    """Part whose shells never share an exact vertex: the QA gate counts coincident vertices of overlapping closed shells as doubles."""

    def to_object(self, crisp_deg=CREASE):
        dm = bmesh.ops.find_doubles(self.bm, verts=self.bm.verts, dist=2e-5)["targetmap"]
        for i, v in enumerate(dm):
            v.co += Vector((0.0004 * (1 + i % 3), 0.0003 * (1 + i % 2), -0.00035))
        return super().to_object(crisp_deg)

    def bounds(self):
        co = [v.co for v in self.bm.verts]
        return Vector((min(c.x for c in co), min(c.y for c in co), min(c.z for c in co))), Vector((max(c.x for c in co), max(c.y for c in co), max(c.z for c in co)))

    def shift(self, dx, dy=0.0, dz=0.0):
        bmesh.ops.transform(self.bm, matrix=T(dx, dy, dz), verts=self.bm.verts)


def mv(sh, x=0.0, y=0.0, z=0.0):
    return xf(sh, T(x, y, z))


def lump(c, r, nu=12, nv=8):
    return ellipsoid(c, r, nu, nv)


# ======================================================================================
# town houses
# ======================================================================================
def ring(d, margin, z0, z1, n=6, bev=0.035):
    """Frame round an opening dict(x0, x1, y0, ys, rise): the outline grown by `margin`, minus the opening, z0..z1."""
    ro = margin * 0.5 if d["rise"] > 0 else 0.0
    outer = prism(opening(d["x0"] - margin, d["x1"] + margin, d["y0"] - margin, d["ys"], d["rise"] + ro, n), "xy", z0, z1, bev=bev)
    inner = prism(opening(d["x0"], d["x1"], d["y0"], d["ys"], d["rise"], n), "xy", z0 - 0.3, z1 + 0.3)
    return boolean(outer, [inner])


class Feat:
    """A wall opening and its trim, built facing +Z on the plane z = 0 (the wall face): `cut` is the cutter, `parts` [(shell, mat)]."""

    def __init__(self, cut, parts):
        self.cut, self.parts = cut, parts

    def put(self, *mats):
        xf(self.cut, *mats)
        for s, _ in self.parts:
            xf(s, *mats)
        return self


def make_window(xc, yb, w, h, arch=0.0, shut="none", sill=True, depth=0.30):
    x0, x1 = xc - w / 2, xc + w / 2
    ys = yb + h - arch
    d = dict(x0=x0, x1=x1, y0=yb, ys=ys, rise=arch)
    cut = prism(opening(x0, x1, yb, ys, arch, 6), "xy", -depth, 0.6)
    parts = [(ring(d, 0.20, 0.01, 0.15), WN),
             (prism(opening(x0 + 0.06, x1 - 0.06, yb + 0.06, ys, max(arch - 0.05, 0.0), 6), "xy", -depth - 0.02, -depth + 0.07), EM),
             (box((xc, yb + h / 2, -depth + 0.13), (0.09, h - 0.12, 0.12)), WN),
             (box((xc, yb + h * 0.55, -depth + 0.14), (w - 0.14, 0.09, 0.10)), WN)]
    if shut != "none":
        sw = 0.42
        for s in {"both": (-1, 1), "L": (-1,), "R": (1,)}[shut]:
            xs = xc + s * (w / 2 + 0.22 + sw / 2)
            parts.append((box((xs, yb + h / 2, 0.08), (sw, h + 0.12, 0.13), bev=0.025), TL))
            parts.append((box((xs, yb + h / 2, 0.16), (sw - 0.16, h - 0.28, 0.06)), TL))
    if sill:
        parts.append((box((xc, yb - 0.10, 0.20), (w + 0.55, 0.16, 0.42), bev=0.035, top_only=True), WN))
    return Feat(cut, parts)


def make_round(xc, yc, r, depth=0.30):
    cut = cylinder((xc, yc, (0.6 - depth) / 2), r, depth + 0.6, n=14, axis="z")
    frame = boolean(cylinder((xc, yc, 0.08), r + 0.20, 0.14, n=14, axis="z", bev=0.03), [cylinder((xc, yc, 0.08), r, 0.8, n=14, axis="z")])
    parts = [(frame, WN), (cylinder((xc, yc, -depth + 0.02), r - 0.05, 0.09, n=14, axis="z"), EM),
             (box((xc, yc, -depth + 0.12), (2 * r - 0.1, 0.08, 0.1)), WN), (box((xc, yc, -depth + 0.13), (0.08, 2 * r - 0.1, 0.1)), WN)]
    return Feat(cut, parts)


def make_door(xc, w, h, y0):
    arch = 0.5
    ys = y0 + h - arch
    d = dict(x0=xc - w / 2, x1=xc + w / 2, y0=y0, ys=ys, rise=arch)
    cut = prism(opening(d["x0"], d["x1"], y0 - 0.2, ys, arch, 6), "xy", -0.38, 0.6)
    leaf = prism(opening(d["x0"] + 0.05, d["x1"] - 0.05, y0, ys, arch - 0.05, 6), "xy", -0.30, -0.12, bev=0.03)
    parts = [(ring(d, 0.26, 0.01, 0.20), WN), (leaf, TL),
             (box((xc, y0 + 1.05, -0.10), (w - 0.5, 1.5, 0.08), bev=0.03), TL), (box((xc, y0 + h * 0.74 - 0.1, -0.10), (w - 0.5, 0.95, 0.08), bev=0.03), TL),
             (lump((xc + w / 2 - 0.30, y0 + 1.85, -0.07), (0.10, 0.10, 0.09), 8, 5), WN),
             (box((xc, 0.12 + 0.0, 0.40), (w + 0.7, 0.24, 0.80), bev=0.04, top_only=True), WN)]
    return Feat(cut, parts)


def wall_lantern(x, y, zf=0.0):
    z = zf + 0.46
    parts = [(box((x, y + 0.36, zf + 0.22), (0.07, 0.07, 0.46)), WN), (cylinder((x, y + 0.27, z), 0.17, 0.09, n=8, r_top=0.09), WN),
             (cylinder((x, y - 0.27, z), 0.15, 0.07, n=8), WN), (cylinder((x, y, z), 0.115, 0.50, n=8), EM)]
    for sx, sz in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
        parts.append((box((x + sx * 0.14, y, z + sz * 0.14), (0.045, 0.5, 0.045)), WN))
    return parts


def roof_prism(R, ve, theta, T_, plane, a0, a1, delta=0.06, bev=0.025):
    """Gable roof across a ridge: eave tips at +-R (underside height ve), shingle courses stepped along the slope, extruded a0..a1."""
    th = math.radians(theta)
    c, s = math.cos(th), math.sin(th)
    ve_top = ve + T_ / c
    L = R / c
    N = max(4, round(L / 0.62))
    P = lambda t: (R - t * c, ve_top + t * s)
    right = []
    for i in range(N):
        p0, p1 = P(L * i / N), P(L * (i + 1) / N)
        jit = 0.0 if i == N - 1 else 0.004 * math.sin(1.9 * i + 0.6)      # tails exactly on one line leave a zero-area ear in the end caps
        right += [(p0[0] + s * delta, p0[1] + c * delta), (p1[0], p1[1] + jit)]
    left = [(-x, y) for x, y in reversed(right[:-1])]
    pts = [(R, ve), (R, ve_top)] + right + left + [(-R, ve_top), (-R, ve), (0.0, ve + R * math.tan(th))]
    return prism(pts, plane, a0, a1, bev=bev), ve_top + R * math.tan(th)


def timber(hw, zf, yb, yt, occ):
    """Corner posts and studs of one front face; occ = occupied x intervals; a knee brace where a gap is wide."""
    out = [box((sx * (hw - 0.17), (yb + yt) / 2, zf + 0.04), (0.34, yt - yb, 0.20), bev=0.03) for sx in (-1, 1)]
    cur, gaps = -hw + 0.40, []
    for a, b in sorted(occ):
        if a > cur:
            gaps.append((cur, min(a, hw - 0.40)))
        cur = max(cur, b)
    if cur < hw - 0.40:
        gaps.append((cur, hw - 0.40))
    for a, b in gaps:
        if b - a < 0.7:
            continue
        out.append(box(((a + b) / 2, (yb + yt) / 2, zf + 0.04), (0.26, yt - yb, 0.18), bev=0.03))
        if b - a >= 1.1:
            p0, p1 = ((a + 0.1, yb + 0.35), (b - 0.1, yt - 0.35)) if (a + b) / 2 > 0 else ((b - 0.1, yb + 0.35), (a + 0.1, yt - 0.35))
            Ln = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
            sh = box((0, 0, 0), (Ln, 0.26, 0.14), bev=0.03)
            xf(sh, Rz(math.degrees(math.atan2(p1[1] - p0[1], p1[0] - p0[0]))), T((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, zf + 0.04))
            out.append(sh)
    return out


def build_house(sp):
    hw, hd, pl, ov, ovr = sp["hw"], sp["hd"], sp["pl"], sp["ov"], sp["ovr"]
    levels, theta = sp["levels"], sp["theta"]
    tn = math.tan(math.radians(theta))
    ye = pl + sum(L["h"] for L in levels)
    front = sp["gable"] == "front"
    P = XPart(sp["name"], [PW, WN, TL, EM])
    P.add(box((0, pl / 2, 0), (2 * hw + 0.24, pl, 2 * hd + 0.24), bev=0.06, top_only=True), WN)
    zf_top = hd + max(L.get("j", 0.0) for L in levels)
    base = pl
    bounds = []
    for k, L in enumerate(levels):
        zf = hd + L.get("j", 0.0)
        y0, y1 = base - (0.05 if k == 0 else 0.06), base + L["h"]
        blk = box((0, (y0 + y1) / 2, (zf - hd) / 2), (2 * hw, y1 - y0, zf + hd), bev=0.06)
        grid_subdivide(blk, 1.8)
        cuts, occ = [], []
        feats = []
        for wd in L.get("win", []):
            f = make_window(wd["x"], base + wd["y"], wd["w"], wd["h"], wd.get("arch", 0.0), wd.get("shut", "none")).put(T(0, 0, zf))
            feats.append(f)
            e = wd["w"] / 2 + (0.22 + 0.42 if wd.get("shut", "none") in ("both", "L") else 0.30)
            e2 = wd["w"] / 2 + (0.22 + 0.42 if wd.get("shut", "none") in ("both", "R") else 0.30)
            occ.append((wd["x"] - e, wd["x"] + e2))
        if "door" in L:
            dd = L["door"]
            feats.append(make_door(dd["x"], dd["w"], dd["h"], pl).put(T(0, 0, zf)))
            occ.append((dd["x"] - dd["w"] / 2 - 0.35, dd["x"] + dd["w"] / 2 + 0.35))
            for s, m in wall_lantern(dd["lx"], pl + 2.55, zf):
                P.add(s, m)
        if "oriel" in L:
            o = L["oriel"]
            ow, oh, op_ = o["w"], o["h"], o["proj"]
            ob = box((o["x"], base + o["y"] + oh / 2, zf + op_ / 2 - 0.02), (ow, oh, op_ + 0.04), bev=0.05)
            wf = make_window(o["x"], base + o["y"] + 0.38, ow - 0.5, oh - 0.75, 0.0, "none", sill=False).put(T(0, 0, zf + op_))
            P.add(boolean(ob, [wf.cut], self_overlap=False), PW)
            for s, m in wf.parts:
                P.add(s, m)
            P.add(box((o["x"], base + o["y"] - 0.20, zf + op_ / 2), (ow + 0.16, 0.34, op_ + 0.12), bev=0.04), WN)       # bearer
            P.add(prism([(zf - 0.05, base + o["y"] - 0.04), (zf + op_ * 0.8, base + o["y"] - 0.04), (zf - 0.05, base + o["y"] - 0.95)], "zy", o["x"] - 0.24, o["x"] + 0.24, bev=0.03), WN)
            P.add(prism([(zf - 0.05, base + o["y"] + oh + 0.55), (zf + op_ + 0.18, base + o["y"] + oh + 0.02), (zf + op_ + 0.18, base + o["y"] + oh - 0.08), (zf - 0.05, base + o["y"] + oh - 0.08)],
                        "zy", o["x"] - ow / 2 - 0.14, o["x"] + ow / 2 + 0.14, bev=0.03), TL)
            occ.append((o["x"] - ow / 2 - 0.1, o["x"] + ow / 2 + 0.1))
        for sd in L.get("side", []):
            for sx in (-1, 1):
                f = make_window(0.0, base + sd["y"], sd["w"], sd["h"], sd.get("arch", 0.0), "none").put(Ry(90 * sx), T(sx * hw, 0, sd["z"]))
                feats.append(f)
        cuts = [f.cut for f in feats]
        P.add(boolean(blk, cuts, self_overlap=False) if cuts else blk, PW)
        for f in feats:
            for s, m in f.parts:
                P.add(s, m)
        for s in timber(hw, zf, base + (0.0 if k else 0.0), y1, occ):
            P.add(s, WN)
        # rail at the top of this level on the front; the jetty beam when the level above steps out
        P.add(box((0, y1 - 0.12 if k == len(levels) - 1 else y1, zf + 0.05), (2 * hw + 0.1, 0.26, 0.22), bev=0.03), WN)
        for sx in (-1, 1):
            P.add(box((sx * (hw + 0.05), y1 - 0.12 if k == len(levels) - 1 else y1, (zf - hd) / 2), (0.22, 0.26, zf + hd + 0.1), bev=0.03), WN)
            for zs in (-hd * 0.62, hd * 0.55):
                if not any(abs(zs - sd["z"]) < 0.9 for sd in L.get("side", [])):
                    P.add(box((sx * (hw + 0.04), (base + y1) / 2, zs), (0.18, y1 - base, 0.30), bev=0.03), WN)
        bounds.append((base, y1, zf))
        base = y1
    # jetty beams and corbels under a stepped-out level
    for k in range(1, len(levels)):
        j = levels[k].get("j", 0.0) - levels[k - 1].get("j", 0.0)
        if j > 0.05:
            yb_ = bounds[k][0]
            zf0 = hd + levels[k - 1].get("j", 0.0)
            P.add(box((0, yb_ - 0.25, zf0 + j / 2 - 0.01), (2 * hw + 0.10, 0.50, j + 0.34), bev=0.04), WN)
            for xs in (-hw + 0.3, 0.0, hw - 0.3):
                P.add(prism([(zf0 + 0.02, yb_ - 1.05), (zf0 + j + 0.1, yb_ - 0.50), (zf0 + 0.02, yb_ - 0.50)], "zy", xs - 0.14, xs + 0.14, bev=0.03), WN)
    # back wall: posts and rails only
    for s in timber(hw, hd, pl, ye, []):
        xf(s, Ry(180))
        P.add(s, WN)
    P.add(xf(box((0, ye - 0.12, hd + 0.05), (2 * hw + 0.1, 0.26, 0.22), bev=0.03), Ry(180)), WN)
    # ---- gable block, attic windows
    if front:
        gp = [(-hw + 0.03, ye - 0.10), (hw - 0.03, ye - 0.10), (hw - 0.03, ye + 0.09), (0.0, ye + hw * tn + 0.05), (-hw + 0.03, ye + 0.09)]
        gab = prism(gp, "xy", -hd + 0.02, zf_top - 0.02)
        feats = []
        if sp.get("attic_r"):
            feats.append(make_round(0.0, ye + hw * tn * 0.44, sp["attic_r"]).put(T(0, 0, zf_top)))
        gab = boolean(gab, [f.cut for f in feats], self_overlap=False) if feats else gab
        P.add(gab, PW)
        for f in feats:
            for s, m in f.parts:
                P.add(s, m)
        R = hw + ov
        roof, y_ridge = roof_prism(R, ye - ov * tn, theta, 0.42, "xy", -hd - ovr, zf_top + ovr)
        ridge_x0, ridge_x1 = -hd - ovr, zf_top + ovr
    else:
        gp = [(-hd + 0.03, ye - 0.10), (hd - 0.03, ye - 0.10), (hd - 0.03, ye + 0.09), (0.0, ye + hd * tn + 0.05), (-hd + 0.03, ye + 0.09)]
        gab = prism(gp, "zy", -hw + 0.02, hw - 0.02)
        feats = []
        if sp.get("attic_r"):
            for sx in (-1, 1):
                feats.append(make_round(0.0, ye + hd * tn * 0.40, sp["attic_r"]).put(Ry(90 * sx), T(sx * (hw - 0.02), 0, 0)))
        gab = boolean(gab, [f.cut for f in feats], self_overlap=False) if feats else gab
        P.add(gab, PW)
        for f in feats:
            for s, m in f.parts:
                P.add(s, m)
        R = hd + ov
        roof, y_ridge = roof_prism(R, ye - ov * tn, theta, 0.42, "zy", -hw - ovr, hw + ovr)
        ridge_x0, ridge_x1 = -hw - ovr, hw + ovr
    rm = sp["roof"]
    P.add(roof, rm)
    # ridge cap, rake band and pendant (front gable), chimney
    yr = y_ridge - 0.04
    cap_pts = [(-0.45, yr - 0.20), (0.45, yr - 0.20), (0.30, yr + 0.13), (-0.30, yr + 0.13)]
    P.add(prism(cap_pts, "xy" if front else "zy", ridge_x0, ridge_x1, bev=0.03), rm)
    if front:
        dv = 0.55 / math.cos(math.radians(theta))
        ve = ye - ov * tn
        zb = zf_top + ovr
        band = prism([(R, ve), (0.0, ve + R * tn), (-R, ve), (-(R - dv / tn), ve), (0.0, ve + R * tn - dv), (R - dv / tn, ve)], "xy", zb - 0.22, zb - 0.02, bev=0.02)
        P.add(band, TL if rm == WN else WN)
        pend = lathe([(0, 0), (0.10, 0.05), (0.07, 0.30), (0.14, 0.46), (0.0, 0.90)], 8)
        xf(pend, Rz(180), T(0.0, ve + R * tn - dv + 0.55, zb - 0.12))
        P.add(pend, WN)
    cx, cz, cw = sp["chim"]
    cb = y_ridge - 1.55
    ct = y_ridge + 1.35
    P.add(box((cx, (cb + ct) / 2, cz), (cw, ct - cb, cw), bev=0.04), PW)
    P.add(box((cx, ct + 0.12, cz), (cw + 0.34, 0.24, cw + 0.34), bev=0.04), WN)
    for dx in (-0.2, 0.2):
        P.add(cylinder((cx + dx * (cw / 0.9), ct + 0.50, cz), 0.13, 0.52, n=8, r_top=0.11), WN)
    # dormer on the front slope of a side-ridge roof
    if sp.get("dormer"):
        dw = sp["dormer"]
        zd = hd - 0.2
        roof_y = lambda z: ye - ov * tn + 0.42 / math.cos(math.radians(theta)) + (R - z) * tn
        yb_d = ye + 0.55
        yt_d = yb_d + 2.6
        body = box((0, (yb_d + yt_d) / 2, zd - 0.85), (dw, yt_d - yb_d, 1.7), bev=0.05)
        wf = make_window(0.0, yb_d + 0.45 + 0.30, dw - 0.7, 1.45, 0.4, "none", sill=True).put(T(0, 0, zd))
        P.add(boolean(body, [wf.cut], self_overlap=False), PW)
        for s, m in wf.parts:
            P.add(s, m)
        hwd = dw / 2
        gd = prism([(-hwd + 0.02, yt_d - 0.10), (hwd - 0.02, yt_d - 0.10), (hwd - 0.02, yt_d + 0.05), (0.0, yt_d + hwd * math.tan(math.radians(40)) + 0.05), (-hwd + 0.02, yt_d + 0.05)], "xy", zd - 1.68, zd - 0.03)
        P.add(gd, PW)
        Rd = hwd + 0.22
        droof, _ = roof_prism(Rd, yt_d - 0.22 * math.tan(math.radians(40)), 40, 0.30, "xy", zd - 1.75, zd + 0.30, delta=0.04)
        P.add(droof, TL)
    return P, dict(eave=ye, ridge=y_ridge, chimney=ct + 0.76)


HOUSES = [
    dict(name="TownHouse_Tall", hw=1.90, hd=2.70, pl=0.50, ov=0.30, ovr=0.38, gable="front", theta=54, roof=TL, attic_r=0.50, chim=(0.0, -1.5, 0.90),
         levels=[dict(h=4.5, door=dict(x=0.0, w=1.3, h=3.5, lx=1.32)),
                 dict(h=4.4, win=[dict(x=0.0, y=1.1, w=1.2, h=2.1, shut="both")], side=[dict(z=0.0, y=1.2, w=0.9, h=1.7)]),
                 dict(h=4.1, win=[dict(x=0.0, y=1.0, w=1.2, h=2.0, arch=0.5, shut="both")], side=[dict(z=0.0, y=1.1, w=0.9, h=1.6)])]),
    dict(name="TownHouse_Corner", hw=2.00, hd=2.70, pl=0.50, ov=0.30, ovr=0.38, gable="front", theta=58, roof=WN, attic_r=0.50, chim=(0.0, -1.5, 0.85),
         levels=[dict(h=4.4, door=dict(x=0.75, w=1.3, h=3.4, lx=-0.05),
                      win=[dict(x=-0.95, y=1.2, w=0.9, h=1.9, shut="L")], side=[dict(z=0.0, y=1.2, w=0.9, h=1.7)]),
                 dict(h=4.3, oriel=dict(x=-0.35, w=1.7, y=0.9, h=2.3, proj=0.75),
                      win=[dict(x=1.22, y=1.1, w=0.6, h=1.9, arch=0.3, shut="R")], side=[dict(z=0.0, y=1.2, w=0.9, h=1.7)])]),
    dict(name="TownHouse_Cottage", hw=3.40, hd=2.90, pl=0.50, ov=0.45, ovr=0.30, gable="side", theta=42, roof=WN, attic_r=0.55, chim=(2.2, 0.0, 0.95),
         dormer=1.9,
         levels=[dict(h=4.4, door=dict(x=0.0, w=1.4, h=3.5, lx=1.18),
                      win=[dict(x=-2.05, y=1.2, w=1.2, h=2.0), dict(x=2.05, y=1.2, w=1.2, h=2.0)], side=[dict(z=0.0, y=1.2, w=1.0, h=1.8)]),
                 dict(h=3.9, win=[dict(x=-1.95, y=0.8, w=1.1, h=1.9, arch=0.4, shut="both"), dict(x=1.95, y=0.8, w=1.1, h=1.9, arch=0.4, shut="both")],
                      side=[dict(z=0.0, y=0.9, w=1.0, h=1.7)])]),
    dict(name="TownHouse_Jetty", hw=3.20, hd=3.00, pl=0.50, ov=0.35, ovr=0.40, gable="front", theta=47, roof=TL, attic_r=0.55, chim=(0.0, -1.4, 0.95),
         levels=[dict(h=4.4, door=dict(x=-1.7, w=1.4, h=3.5, lx=-0.40), win=[dict(x=1.5, y=1.2, w=1.5, h=2.0)], side=[dict(z=0.0, y=1.2, w=1.0, h=1.8)]),
                 dict(h=4.0, j=0.45,
                      win=[dict(x=-1.9, y=0.9, w=1.1, h=1.9, shut="L"), dict(x=0.0, y=0.9, w=1.1, h=1.9), dict(x=1.9, y=0.9, w=1.1, h=1.9, shut="R")],
                      side=[dict(z=0.0, y=1.0, w=1.0, h=1.7)])]),
]


def build_houses(entry, p):
    parts, metas = [], []
    for sp in HOUSES:
        P, m = build_house(sp)
        lo, hi = P.bounds()
        wu.log(f"{sp['name']}: {P.stats()} bbox cm {tuple(round(v, 2) for v in (hi - lo))} eave {m['eave']:.2f} ridge {m['ridge']:.2f} chimney {m['chimney']:.2f}")
        parts.append((P, lo, hi))
        metas.append(m)
    return lay_row(parts, metas, entry, gap=1.2, extras=lambda sp, m, w, d: dict(kind="house", zone="left" if sp["name"] in ("TownHouse_Tall", "TownHouse_Corner") else "right",
                                                                                  footprintCm=[round(w, 2), round(d, 2)], eaveM=round(m["eave"] * 0.01, 4), ridgeM=round(m["ridge"] * 0.01, 4),
                                                                                  topM=round(m["chimney"] * 0.01, 4)), specs=HOUSES)


def lay_row(parts, metas, entry, gap, extras, specs, names=None):
    """Bake a row layout: each piece's bbox centred on z = 0, pieces `gap` cm apart along x, the row centred on x = 0. Returns forge objs."""
    total = sum(hi.x - lo.x for _, lo, hi in parts) + gap * (len(parts) - 1)
    cur = -total / 2
    objs, root = [], None
    for (P, lo, hi), m, sp in zip(parts, metas, specs):
        w, d = hi.x - lo.x, hi.z - lo.z
        cx, cz = (lo.x + hi.x) / 2, (lo.z + hi.z) / 2
        dx, dz = cur + w / 2 - cx, -cz
        P.shift(dx, 0.0, dz)
        o = P.to_object()
        o["wu"] = {**extras(sp, m, w, d), "originM": [round(dx * 0.01, 5), 0.0, round(dz * 0.01, 5)]}
        if root is None:
            root = o
            o["wu"] = {**o["wu"], "id": entry["id"], "family": FAMILY}
        else:
            o.parent = root
        objs.append(o)
        cur += w + gap
    return objs, dict(origin=("centre", "min", "centre"), closed=True)


# ======================================================================================
# town props
# ======================================================================================
def p_bench():
    P = XPart("TownProp_Bench", [WN, AB])
    for i in range(5):
        P.add(box((0, 1.0, -0.56 + 0.28 * i), (4.2, 0.16, 0.25), bev=0.03), WN)
    for y in (1.50, 1.84, 2.16):
        sh = box((0, 0, 0), (4.2, 0.27, 0.12), bev=0.03)
        xf(sh, Rx(-9), T(0, y, -0.62 - (y - 1.2) * 0.16))
        P.add(sh, WN)
    for sx in (-1, 1):
        x = sx * 1.95
        P.add(box((x, 0.83, 0.58), (0.22, 1.66, 0.22), bev=0.03), AB)
        rear = box((0, 0, 0), (0.22, 2.35, 0.20), bev=0.03)
        xf(rear, Rx(-9), T(x, 1.17, -0.62))
        P.add(rear, AB)
        P.add(box((x, 1.70, -0.02), (0.26, 0.14, 1.52), bev=0.03), AB)
        P.add(box((x, 0.06, 0.58), (0.34, 0.12, 0.40), bev=0.02), AB)
        P.add(box((x, 0.06, -0.80), (0.34, 0.12, 0.40), bev=0.02), AB)
        P.add(lump((x, 1.78, 0.66), (0.17, 0.17, 0.17), 10, 6), AB)
        P.add(lump((x, 2.42, -0.89), (0.15, 0.15, 0.15), 10, 6), AB)
    return P, dict(kind="bench", sizeCm=[4.4, 2.6, 1.8])


def p_fence():
    P = XPart("TownProp_Fence", [PW, WN])
    for sx in (-1, 1):
        P.add(box((sx * 2.85, 0.85, 0), (0.36, 1.7, 0.36), bev=0.04), WN)
        cap = lathe([(0, 0), (0.32, 0), (0.22, 0.17), (0.0, 0.44)], 4, phase=math.pi / 4)
        P.add(mv(cap, sx * 2.85, 1.7, 0.0), WN)
    for i in range(11):
        h = 1.26 - 0.05 * (i % 3 == 1)
        pk = prism([(-0.19, 0.0), (0.19, 0.0), (0.19, h - 0.22), (0.0, h), (-0.19, h - 0.22)], "xy", -0.10, 0.06, bev=0.02)
        P.add(mv(pk, -2.5 + 0.5 * i, 0.12, 0.0), PW)
    for y in (0.42, 0.95):
        P.add(box((0, y, -0.15), (5.7, 0.20, 0.12), bev=0.02), WN)
    return P, dict(kind="fence", sizeCm=[6.0, 1.7, 0.4])


def p_tree():
    P = XPart("TownProp_Tree", [WN, TL])
    P.add(lathe([(0, 0), (0.62, 0), (0.50, 0.25), (0.34, 0.9), (0.28, 1.8), (0.30, 2.8), (0.24, 3.6), (0, 3.7)], 14), WN)
    for ang in (20, 140, 260):
        br = cylinder((0, 0, 0), 0.16, 1.7, n=8, r_top=0.10)
        xf(br, T(0, 0.85, 0), Rz(-38), Ry(ang), T(0, 3.1, 0))
        P.add(br, WN)
    for c, r in (((0, 5.5, 0), (1.95, 1.75, 1.95)), ((1.35, 4.8, 0.4), (1.2, 1.0, 1.1)), ((-1.3, 4.9, -0.5), (1.25, 1.05, 1.2)),
                 ((0.3, 4.6, -1.4), (1.1, 0.95, 1.1)), ((-0.4, 4.7, 1.35), (1.15, 0.95, 1.1)), ((0.2, 6.9, 0.2), (1.2, 1.0, 1.15)),
                 ((-0.9, 6.2, 0.9), (1.0, 0.9, 0.95))):
        P.add(lump(c, r, 14, 9), TL)
    return P, dict(kind="tree", sizeCm=[5.1, 7.9, 4.8])


def p_shrub():
    P = XPart("TownProp_Shrub", [TL])
    for c, r in (((0, 0.80, 0), (1.2, 0.80, 1.15)), ((0.85, 0.62, 0.3), (0.8, 0.62, 0.75)), ((-0.8, 0.66, -0.2), (0.85, 0.66, 0.8)),
                 ((0.1, 0.56, -0.85), (0.75, 0.56, 0.7)), ((-0.2, 1.15, 0.3), (0.8, 0.72, 0.75)), ((0.5, 0.9, -0.4), (0.62, 0.55, 0.6))):
        P.add(lump(c, r, 12, 8), TL)
    return P, dict(kind="shrub", sizeCm=[3.0, 1.9, 2.5])


def p_planter():
    P = XPart("TownProp_Planter", [WN, AB, TL, PW])
    P.add(box((0, 0.62, 0), (3.9, 0.95, 1.2), bev=0.07, segs=2), WN)
    for sx in (-1, 1):
        for sz in (-1, 1):
            P.add(box((sx * 1.62, 0.10, sz * 0.46), (0.30, 0.20, 0.30), bev=0.03), WN)
    for sx in (-1, 1):
        P.add(box((sx * 1.25, 0.62, 0.0), (0.22, 0.99, 1.26), bev=0.03), AB)
    P.add(box((0, 1.07, 0), (3.6, 0.14, 0.95)), WN)
    for z in (-0.62, 0.62):
        P.add(box((0, 1.10, z), (4.0, 0.10, 0.12), bev=0.02), WN)
    for x in (-1.97, 1.97):
        P.add(box((x, 1.10, 0), (0.12, 0.10, 1.12), bev=0.02), WN)
    for x, z, r in ((-1.3, 0.0, 0.5), (-0.65, 0.18, 0.45), (0.0, -0.1, 0.52), (0.65, 0.15, 0.46), (1.3, -0.05, 0.5)):
        P.add(lump((x, 1.32, z), (r, 0.36, r * 0.82), 10, 6), TL)
    fl = [(-1.45, 0.05), (-1.0, -0.2), (-0.55, 0.22), (-0.1, -0.15), (0.3, 0.2), (0.75, -0.2), (1.2, 0.18), (1.5, -0.1), (-0.3, 0.0)]
    for i, (x, z) in enumerate(fl):
        yt = 1.62 + 0.28 * ((i * 5) % 3)
        P.add(mv(lathe([(0, 0), (0.035, 0), (0.035, yt - 1.3), (0, yt - 1.3)], 5), x, 1.30, z), TL)
        P.add(lump((x, yt + 0.02, z), (0.17, 0.12, 0.17), 8, 5), PW if i % 3 != 1 else AB)
        P.add(lump((x, yt + 0.10, z), (0.075, 0.06, 0.075), 6, 4), AB if i % 3 != 1 else PW)
    return P, dict(kind="planter", sizeCm=[4.0, 2.1, 1.3])


def p_sign():
    P = XPart("TownProp_Signboard", [WN, TL, PW, AB])
    px = -1.0
    P.add(mv(lathe([(0, 0), (0.34, 0), (0.34, 0.25), (0.24, 0.4), (0.20, 1.0), (0.20, 4.5), (0.28, 4.6), (0.22, 4.8), (0, 4.88)], 10), px, 0, 0), WN)
    P.add(box((px, 0.10, 0), (0.95, 0.20, 0.95), bev=0.04), WN)
    P.add(box((0.375, 4.25, 0), (2.75, 0.18, 0.20), bev=0.03), WN)
    br = box((0, 0, 0), (1.15, 0.12, 0.12), bev=0.02)
    xf(br, Rz(40), T(px + 0.45, 3.85, 0))
    P.add(br, WN)
    P.add(box((0.45, 3.0, 0), (2.1, 1.35, 0.14), bev=0.04), TL)
    for z in (0.09, -0.09):
        P.add(box((0.45, 3.0, z), (1.72, 0.98, 0.06), bev=0.02), PW)
    for sx in (-1, 1):
        P.add(box((0.45 + sx * 0.70, 3.99, 0), (0.06, 0.34, 0.05)), AB)
        for sy in (-1, 1):
            for z in (0.09, -0.09):
                P.add(lump((0.45 + sx * 0.93, 3.0 + sy * 0.56, z * 1.3), (0.07, 0.07, 0.07), 6, 4), AB)
    return P, dict(kind="signboard", sizeCm=[3.3, 5.0, 1.0])


def p_edging():
    P = XPart("TownProp_PathEdging", [ST])
    w, gap = 0.92, 0.07
    x0 = -(6 * w + 5 * gap) / 2 + w / 2
    for i in range(6):
        h = 0.40 + 0.03 * ((i * 7) % 3)
        P.add(box((x0 + i * (w + gap), h / 2, 0.0), (w - 0.02 * (i % 2), h, 0.80 - 0.04 * ((i + 1) % 3)), bev=0.07, segs=2), ST)
    return P, dict(kind="pathEdging", sizeCm=[6.0, 0.46, 0.8])


def build_props(entry, p):
    parts, metas, specs = [], [], []
    for fn in (p_bench, p_fence, p_tree, p_shrub, p_planter, p_sign, p_edging):
        P, m = fn()
        lo, hi = P.bounds()
        wu.log(f"{P.name}: {P.stats()} bbox cm {tuple(round(v, 2) for v in (hi - lo))}")
        parts.append((P, lo, hi))
        metas.append(m)
        specs.append(P.name)
    return lay_row(parts, metas, entry, gap=1.0, extras=lambda sp, m, w, d: dict(kind=m["kind"], footprintCm=[round(w, 2), round(d, 2)]), specs=specs)


# ======================================================================================
# workbench lantern (real size)
# ======================================================================================
def build_lantern(entry, p):
    body, glass, core = XPart("Lantern_Body", [PB]), XPart("Lantern_Glass", [GL]), XPart("Lantern_Core", [EM])
    body.add(lathe([(0, 0), (2.7, 0), (2.7, 0.2), (2.5, 0.34), (2.5, 0.5), (2.15, 0.7), (2.05, 1.0), (0, 1.0)], 6), PB)
    body.add(lathe([(0, 0.95), (1.92, 0.95), (1.92, 1.3), (0, 1.3)], 6), PB)
    for k in range(6):
        a = math.radians(60 * k)
        body.add(cylinder((2.0 * math.cos(a), 4.55, 2.0 * math.sin(a)), 0.14, 7.2, n=8), PB)
    body.add(lathe([(0, 7.95), (2.2, 7.95), (2.35, 8.1), (2.35, 8.28), (2.12, 8.42), (1.9, 8.62), (1.7, 9.1), (1.35, 9.7), (0.95, 10.1), (0.55, 10.3), (0.5, 10.5), (0.0, 10.5)], 6), PB)
    body.add(lump((0, 10.62, 0), (0.30, 0.30, 0.30), 10, 6), PB)
    body.add(tube(catmull([(-1.15, 9.0, 0), (-1.35, 9.9, 0), (-0.9, 10.9, 0), (0.0, 11.35, 0), (0.9, 10.9, 0), (1.35, 9.9, 0), (1.15, 9.0, 0)], 4),
                  taper((0, 0.12), (1, 0.12)), 8), PB)
    body.add(lathe([(0, 1.25), (0.35, 1.25), (0.25, 1.5), (0.22, 2.2), (0.6, 2.35), (0.66, 2.55), (0.0, 2.55)], 12), PB)
    glass.add(lathe([(0, 1.0), (1.88, 1.0), (1.88, 7.98), (0, 7.98)], 6), GL)
    core.add(lathe([(0, 2.55), (0.28, 2.62), (0.52, 2.95), (0.55, 3.4), (0.42, 3.95), (0.22, 4.5), (0, 5.0)], 12), EM)
    wu.log(f"lantern shells: body {body.stats()} glass {glass.stats()} core {core.stats()}")
    root = body.to_object()
    root["wu"] = dict(id=entry["id"], family=FAMILY, heightM=0.1147)
    objs = [root]
    for part in (glass, core):
        o = part.to_object()
        o.parent = root
        objs.append(o)
    return objs, dict(origin=("centre", "min", "centre"), closed=True)


# ======================================================================================
# run lever (real size): walnut base, brass yoke and quadrant plate, handle on PIV_Handle (hinge axis +X)
# ======================================================================================
HINGE_Y, HINGE_Z = 3.0, 0.0
LEAN, PULL_DEG, ARM, KNOB_R = -20.0, 85.0, 7.4, 0.95


def build_lever(entry, p):
    base, handle = XPart("RunLever_Base", [WN, PB]), XPart("RunLever_Handle", [PB])
    Dh = 3.55
    base.add(box((0, 0.6, 0), (8.4, 1.2, 2 * Dh), bev=0.14, segs=2), WN)
    base.add(box((0, 0.20, 0), (8.0, 0.40, 2 * Dh - 0.4), bev=0.06), WN)
    # yoke cheeks (rounded tops round the pin) and the quadrant plate outside the right cheek, all brass
    for sx in (-1, 1):
        cheek = [(HINGE_Z + 1.1, 1.15), (HINGE_Z + 1.1, HINGE_Y)] + [(HINGE_Z + 1.1 * math.cos(math.radians(a)), HINGE_Y + 1.1 * math.sin(math.radians(a))) for a in range(30, 181, 30)] + [(HINGE_Z - 1.1, 1.15)]
        P_ = prism(cheek, "zy", sx * 0.72 - 0.13, sx * 0.72 + 0.13, bev=0.03)
        base.add(P_, PB)
        base.add(mv(cylinder((0, 0, 0), 0.34, 0.14, n=12, axis="x"), sx * 0.90, HINGE_Y, HINGE_Z), PB)
    R_, a0, a1 = 3.5, -34.0, 78.0
    arc = [(HINGE_Z + R_ * math.sin(math.radians(a)), HINGE_Y + R_ * math.cos(math.radians(a))) for a in [a0 + (a1 - a0) * i / 14 for i in range(15)]]
    plate = [(arc[0][0], 1.15), (arc[-1][0], 1.15)] + arc[::-1]
    base.add(prism(plate, "zy", 0.98, 1.24, bev=0.04), PB)
    for i in range(8):                                                  # tick studs along the arc
        a = math.radians(a0 + 6 + (a1 - a0 - 12) * i / 7)
        base.add(mv(lump((0, 0, 0), (0.07, 0.07, 0.07), 6, 4), 1.36, HINGE_Y + (R_ - 0.25) * math.cos(a), HINGE_Z + (R_ - 0.25) * math.sin(a)), PB)
    for sx in (-1, 1):
        for sz in (-1, 1):
            base.add(mv(lump((0, 0, 0), (0.22, 0.10, 0.22), 8, 4), sx * 3.5, 1.2, sz * 2.8), PB)
    # handle: hub, tapered arm with turned collars, pear knob; built upright about the hinge, then leaned back by LEAN
    hub = cylinder((0, 0, 0), 0.78, 0.92, n=16, axis="x", bev=0.04)
    h = [hub]
    arm = lathe([(0, 0.4), (0.40, 0.4), (0.38, 2.4), (0.55, 2.55), (0.55, 2.85), (0.36, 3.0), (0.33, 4.6), (0.50, 4.75), (0.50, 4.9), (0.34, 5.05),
                 (0.30, 6.5), (0.46, 6.62), (0, 6.62)], 14)
    h.append(arm)
    ball = lump((0, ARM + 0.0, 0), (KNOB_R, KNOB_R * 1.08, KNOB_R), 16, 10)
    h.append(ball)
    for s in h:
        xf(s, Rx(LEAN), T(0, HINGE_Y, HINGE_Z))
        handle.add(s, PB)
    wu.log(f"lever shells: base {base.stats()} handle {handle.stats()}")
    root = base.to_object()
    root["wu"] = dict(id=entry["id"], family=FAMILY)
    piv = empties.add_pivot(root, "Handle", tuple(v * 0.01 for v in (0.0, HINGE_Y, HINGE_Z)), (0.0, 0.0, 1.0), "hinge", "+X")
    piv["wu"] = {**piv["wu"].to_dict(), "closedDeg": 0.0, "openDeg": PULL_DEG, "note": "rotation about +X, positive pulls the knob towards the player"}
    ho = handle.to_object()
    ho.parent = piv
    ho.location = -wu.g2b(tuple(v * 0.01 for v in (0.0, HINGE_Y, HINGE_Z)))
    ang = math.radians(LEAN)
    kc = (0.0, (HINGE_Y + ARM * math.cos(ang)) * 0.01, (HINGE_Z + ARM * math.sin(ang)) * 0.01)
    col = empties.add_collider(root, "Grab", "sphere", 0.014, kc)
    return [root, piv, ho, col], dict(origin=("centre", "min", "centre"), closed=True, pivot_nodes=[ho])


# ======================================================================================
# gift engraving plate (real size): a brass nameplate on a wedge, the engraving field is its own node (runtime text texture)
# ======================================================================================
TILT = 16.0


def build_plate(entry, p):
    frame, field = XPart("GiftPlate_Frame", [PB]), XPart("GiftPlate_Field", [AGB])
    W, D, Tk = 6.2, 2.6, 0.26
    sh = [box((0, 0, 0), (W, Tk, D), bev=0.07, segs=2)]
    for z in (-D / 2 + 0.11, D / 2 - 0.11):
        sh.append(box((0, Tk / 2 + 0.03, z), (W - 0.2, 0.10, 0.17), bev=0.02))
    for x in (-W / 2 + 0.11, W / 2 - 0.11):
        sh.append(box((x, Tk / 2 + 0.03, 0), (0.17, 0.10, D - 0.2), bev=0.02))
    for x in (-W / 2 + 0.38, W / 2 - 0.38):
        for z in (-D / 2 + 0.38, D / 2 - 0.38):
            sh.append(mv(lump((0, 0, 0), (0.12, 0.06, 0.12), 8, 4), x, Tk / 2 + 0.02, z))
    fld = box((0, Tk / 2 - 0.005, 0), (W - 0.95, 0.07, D - 0.62), bev=0.0)
    t = math.radians(TILT)
    lift = (D / 2) * math.sin(t) + (Tk / 2) * math.cos(t)
    for s in sh + [fld]:
        xf(s, Rx(TILT), T(0, lift, 0))
    zf_ = (D / 2) * math.cos(t) - (Tk / 2) * math.sin(t)          # front-bottom edge of the plate
    zb_ = -(D / 2) * math.cos(t) - (Tk / 2) * math.sin(t)          # back-bottom edge
    yfront = lift - (D / 2) * math.sin(t) - (Tk / 2) * math.cos(t)
    ytop = lambda z: yfront + (zf_ - z) * math.tan(t) + 0.02
    z1, z2 = zf_ - 0.30, zb_ + 0.04
    wedge = prism([(z1, 0.0), (z2, 0.0), (z2, ytop(z2)), (z1, ytop(z1))], "zy", -W / 2 + 0.55, W / 2 - 0.55, bev=0.04)
    for s in sh:
        frame.add(s, PB)
    frame.add(wedge, PB)
    field.add(fld, AGB)
    wu.log(f"plate shells: frame {frame.stats()} field {field.stats()} lift {lift:.3f} yfront {yfront:.3f}")
    root = frame.to_object()
    root["wu"] = dict(id=entry["id"], family=FAMILY, tiltDeg=TILT, textUv="GiftPlate_Field front face UV 0..1 (u right, v up)")
    fo = field.to_object()
    fo.parent = root
    field_uv(fo, t)
    return [root, fo], dict(origin=("centre", "min", "centre"), closed=True)


def field_uv(obj, t):
    """Engraving face: UV 0..1 over the face that looks up-and-front (the runtime paints the text there)."""
    import numpy as np
    me = obj.data
    nb = np.array([0.0, -math.sin(t), math.cos(t)])                 # glTF normal (0, cos t, sin t) in Blender axes
    up = np.array([0.0, math.cos(t), math.sin(t)])
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    faces = [p for p in me.polygons if np.dot(np.array(p.normal), nb) > 0.98]
    vs = sorted({me.loops[l].vertex_index for p in faces for l in p.loop_indices})
    pts = co[vs]
    u0, u1 = pts[:, 0].min(), pts[:, 0].max()
    vv = pts @ up
    v0, v1 = vv.min(), vv.max()
    uv = me.uv_layers["UVMap"].data
    for p in faces:
        for l in p.loop_indices:
            c = co[me.loops[l].vertex_index]
            uv[l].uv = ((c[0] - u0) / (u1 - u0), (c @ up - v0) / (v1 - v0))
    me.update()


BUILDERS = {"town_houses": build_houses, "town_props_set": build_props, "lantern_workbench": build_lantern, "run_lever": build_lever,
            "gift_engraving_plate": build_plate}
PARAMS = {i: {} for i in BUILDERS}


def build(entry: dict, params: dict):
    return BUILDERS[entry["id"]](entry, params)


if __name__ == "__main__":
    raise SystemExit("gen_town_extras.py is a forge family script. Run blender/scripts/forge.py --family <environment|workshop|interaction|gifts>")
