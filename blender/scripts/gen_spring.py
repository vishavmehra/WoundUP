"""gen_spring.py - the spring family: a flat mainspring on a flanged arbor, healthy and worn (forge family).

    "$B" --background --factory-startup --python-exit-code 1 --python blender/scripts/forge.py -- \
         --family spring --only spring_standard,spring_worn --out-root <dir>

Size 30 x 30 x 33.2 mm (ADR-042, MUSIC_BOX_BLUEPRINT sections 6.3 and 11): a coil of 30 mm across and 10 mm wide on an arbor that runs
from the 10T spring pinion's inboard face (z -21.2) through the pinion bore and the coil to the Music Box wall's outer face (z +12.0).
The arbor is 7.6 mm like the shaft (the pinion's bore is 8.0 mm); its outboard end is a bush-fit boss with a 5.1 mm square socket for the
winding key's 5 x 5 mm drive and a 7.5 mm counterbore for the key's 6 mm collar. At the Music Box socket (53.0, 53.2, 22.3) the coil clears
the front wall (inner face z 39.0) and the lid (underside y 70.0) with 1.7 mm to spare.

A flat ribbon (1.2 mm thick, 7 mm wide: Springs and Winding board, mainspring 1 to 3 mm by 8 to 15 mm scaled to the part) wound as
an Archimedean spiral on a drum with two chamfered flanges, the outer end running off tangentially with two rivets.
spring_standard is the regular spiral. spring_worn (PRODUCT_SPEC section 8, GAMEPLAY_SYSTEMS section 12.1: the player must be able to tell
it from the healthy one at a glance) keeps the same fit and the same arbor but is tired in four ways you can see from across the
bench: coil spacing that swings between crowded and slack, ribbon leaning out of plane, a pinched kink where the ribbon is crushed
and bulged, an outer end that has sagged and splayed away from the pack, and a darker tarnish (extra vertex AO, see tarnish).

Model space: rotation axis = local +Z, origin = the arbor axis, built in mm and exported in metres.
"""
from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np

import wu_common as wu
from lib import empties, vertex_ao
from mathutils import Matrix, Vector

import gen_mech_common as mc
import gen_fastener as fz
from gen_gear_spur import dome_shell

FAMILY = "spring"
T_RIB, W_RIB = 1.2, 7.0                 # ribbon thickness (radial) and width (z), mm
R_IN = 4.2                              # ribbon centreline radius at the arbor (the outer radius is a PARAMS value)

SPAN = 30.0                             # the approved x and y size (mm); r_out is fitted so the coil bounding box is this wide
PARAMS = {
    "spring_standard": dict(wear=0.0, turns=5.5, grab_radius=0.020),
    "spring_worn": dict(wear=1.0, turns=4.5, grab_radius=0.020, tarnish=0.66),   # a tired spring has fewer, looser turns and a smaller pack
}

# Arbor, z from the pinion end (-21.2) to the wall's outer face (+12.0). Shaft 7.6 mm (the pinion bore is 8.0 mm), drum 3.7 mm radius (the ribbon embeds 0.1 mm in it) between
# two chamfered flanges 5.2 mm radius, a bush-fit boss of 4.4 mm radius at the outboard end.
Z_LO, Z_HI = -21.2, 12.0
R_SHAFT, R_BOSS = 3.8, 4.4
ARBOR = [(0.0, Z_LO), (3.2, Z_LO), (R_SHAFT, Z_LO + 0.6),                                   # chamfered tip, flush with the pinion's inboard face
         (R_SHAFT, -4.6), (4.8, -4.6), (5.2, -4.2), (5.2, -3.7), (3.7, -3.7),               # shaft, then the lower flange
         (3.7, 3.7), (5.2, 3.7), (5.2, 4.2), (4.8, 4.6), (R_SHAFT, 4.6),                    # drum and the upper flange
         (R_SHAFT, 6.0), (R_BOSS, 6.6), (R_BOSS, Z_HI - 0.25), (R_BOSS - 0.25, Z_HI), (0.0, Z_HI)]  # shoulder, boss, chamfered end
SQUARE, SQ_Z0, CB_R, CB_Z0 = 5.1, 2.5, 3.75, 10.0   # key socket: square 5.1 mm from z 2.5, then a 7.5 mm counterbore from z 10.0 that swallows the square's corners (3.61 mm) and holds the key's 6 mm collar


def gauss(x, c, s):
    return math.exp(-((x - c) / s) ** 2)


STEP_IN, STEP_OUT, IN_TURNS = 45.0, 18.0, 2.0     # degrees per segment inside / outside the first IN_TURNS (STEP_OUT divides 90, so vertices sit on the axes)


def spiral(turns, wear, r_out, phase=0.0):
    """Centreline points and per-point ribbon sections of the (possibly worn) spiral.

    Vertices are placed every STEP_OUT degrees, aligned to the x and y axes through `phase` (a multiple of STEP_OUT), so the coil's box is
    the circle's and not an inscribed polygon's."""
    th_total = 2 * math.pi * turns
    n = 4000
    ths = np.linspace(0.0, th_total, n)
    pitch = 1.0 + 0.45 * wear * np.sin(0.5 * ths + 0.6) + 0.15 * wear * np.sin(1.5 * ths)               # slack and crowded coils
    integ = np.concatenate([[0.0], np.cumsum(0.5 * (pitch[1:] + pitch[:-1]) * np.diff(ths))])
    r = R_IN + (r_out - R_IN) * integ / integ[-1]
    splay = wear * 1.6 * np.clip((ths - (th_total - 2.4 * math.pi)) / (2.4 * math.pi), 0.0, 1.0) ** 2   # last 1.2 turns lift off the pack
    kink = wear * 1.0 * np.exp(-((ths - 0.62 * th_total - 0.5) / 0.30) ** 2)                            # bulged kink
    r = r + splay + kink
    xs, ys = r * np.cos(ths + phase), r * np.sin(ths + phase)
    xs = xs + wear * 0.5 * (ths / th_total) ** 1.5                                                         # outer pack has slumped sideways
    zs = -wear * 1.1 * (ths / th_total) ** 2 * (0.55 + 0.45 * np.cos(ths + 0.5))                          # and sagged
    cut = 2 * math.pi * IN_TURNS
    d_in, d_out = math.radians(STEP_IN), math.radians(STEP_OUT)
    targets = np.concatenate([np.arange(0.0, cut, d_in), np.arange(cut, th_total - 1e-9, d_out), [th_total]])
    px, py, pz = np.interp(targets, ths, xs), np.interp(targets, ths, ys), np.interp(targets, ths, zs)
    return np.stack([px, py, pz], axis=1), targets, th_total


def min_gap(P):
    """Smallest centreline distance between ribbon parts more than 15 mm apart along the ribbon (xy plane)."""
    xy = P[:, :2]
    seg = np.hypot(*np.diff(xy, axis=0).T)
    s = np.concatenate([[0.0], np.cumsum(seg)])
    D = np.hypot(xy[:, None, 0] - xy[None, :, 0], xy[:, None, 1] - xy[None, :, 1])
    far = np.abs(s[:, None] - s[None, :]) > 15.0
    return float(D[far].min())


def section_fn(pth, th_total, wear):
    def sec(i):
        th = float(pth[i])
        hh = 0.5 * W_RIB * (1.0 - 0.45 * wear * gauss(th, 0.62 * th_total, 0.45))                      # crushed, narrower at the kink
        tau = wear * 0.20 * math.sin(th + 0.9) * (0.4 + 0.6 * th / th_total)                           # ribbon leans out of plane
        c, sn = math.cos(tau), math.sin(tau)
        pts = [(-0.5 * T_RIB, -hh), (0.5 * T_RIB, -hh), (0.5 * T_RIB, hh), (-0.5 * T_RIB, hh)]
        return [(a * c - b * sn, a * sn + b * c) for a, b in pts]
    return sec


def tarnish(obj, factor):
    """Extra darkening of the baked vertex AO (COLOR_0 multiplies the base colour): the worn spring ships darker and more tarnished.
    Runs from a QA-gate callback because forge.py has no post-bake hook; values stay inside 0..1."""
    ca = obj.data.color_attributes.get(vertex_ao.AO_NAME)
    a = vertex_ao.read(obj)
    co = np.empty(len(obj.data.vertices) * 3)
    obj.data.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    n = 0.5 + 0.5 * np.sin(co[:, 0] * 380.0 + 1.3) * np.sin(co[:, 2] * 310.0 - 0.4)                    # patchy, not a flat multiply
    a[:, :3] *= (factor + (1.0 - factor) * 0.45 * n)[:, None]
    ca.data.foreach_set("color", np.clip(a, 0.0, 1.0).ravel().astype(np.float32))


def make_coil(bm, wear, turns, r_out, phase):
    """The ribbon and its two rivets, written into bm. Returns (wear amplitude actually used, centreline gap)."""
    amp = 1.0
    while True:                                                    # keep the coils from touching however tired they look
        P, pth, th_total = spiral(turns, wear * amp, r_out, phase)
        gap = min_gap(P)
        if gap >= T_RIB + 0.35 or wear == 0.0:
            break
        amp *= 0.85
    t_end = P[-1] - P[-2]
    T = np.array([t_end[0], t_end[1], 0.0])
    T /= np.linalg.norm(T)
    lift = wear * amp * 1.2
    tail = [P[-1] + T * 3.0 + np.array([0, 0, -lift * 0.4]), P[-1] + T * 6.0 + np.array([0, 0, -lift])]
    path = [Vector(p) for p in list(P) + tail]
    sec = section_fn(np.concatenate([pth, [pth[-1], pth[-1]]]), th_total, wear * amp)
    mc.sweep(bm, path, (0, 0, 1), sec)
    u = Vector((T[1], -T[0], 0.0))                                  # outward normal of the tail (counter-clockwise travel)
    for dz in (-1.6, 1.6):
        v, f = dome_shell(0.0, 0.0, 0.0, +1, 1.0, 0.7, nseg=6, rings=1, skirt=0.25)
        vs = [bm.verts.new(c) for c in v]
        for q in f:
            bm.faces.new([vs[i] for i in q])
        mc.place(bm, vs, path[-2] + u * (0.5 * T_RIB) + Vector((0, 0, dz)), u)
    return amp, gap


def extents(bm):
    c = np.array([v.co[:2] for v in bm.verts])
    return c.min(axis=0), c.max(axis=0)


def spans(bm):
    lo, hi = extents(bm)
    return hi - lo


def fit_coil(wear, turns):
    """Choose the outer radius and the start phase. For every phase (a multiple of STEP_OUT, so vertices sit on the axes) bisect r_out until the
    wider xy span is SPAN (30 mm); the narrower span is then stretched to SPAN in build(). Among the phases that need at most a 2.5 % stretch keep the
    one whose coil reaches least towards local -x (the Music Box's front wall) and local +y (its lid), because the part is 30 mm across inside a box
    that leaves only 1 mm there: the spiral's outer turn is not centred on the arbor, so a half turn of phase changes the margin by up to 1 mm."""
    cands = []
    for deg in np.arange(0.0, 360.0, STEP_OUT):
        phase = math.radians(float(deg))
        lo, hi = 8.0, 16.0
        for _ in range(14):
            mid = 0.5 * (lo + hi)
            t = mc.bmesh.new()
            make_coil(t, wear, turns, mid, phase)
            w = float(spans(t).max())
            t.free()
            lo, hi = (mid, hi) if w < SPAN else (lo, mid)
        t = mc.bmesh.new()
        make_coil(t, wear, turns, lo, phase)
        e0, e1 = extents(t)
        t.free()
        k = SPAN / (e1 - e0)
        cands.append((float(max(k)), float(max(-e0[0] * k[0], e1[1] * k[1])), lo, phase, e1 - e0))
    ok = [c for c in cands if c[0] <= 1.025] or sorted(cands)[:1]
    best = min(ok, key=lambda c: c[1])
    return best[1], best[2], best[3], best[4]


def append_bm(dst, src):
    """Copy the verts and faces of bmesh src into dst (closed shells stay closed) and free src."""
    vm = {v: dst.verts.new(v.co) for v in src.verts}
    for f in src.faces:
        dst.faces.new([vm[v] for v in f.verts])
    src.free()


def make_arbor():
    """Lathe arbor with the key socket cut by the exact boolean: a 5.1 mm square pocket and a 7.5 mm counterbore at the outboard end."""
    a = mc.bmesh.new()
    mc.lathe(a, ARBOR, nseg=16)
    sq = mc.bmesh.new()
    mc.box(sq, (-SQUARE / 2, -SQUARE / 2, SQ_Z0), (SQUARE / 2, SQUARE / 2, CB_Z0 + 0.3))
    cb = mc.bmesh.new()
    mc.lathe(cb, [(0.0, CB_Z0), (CB_R, CB_Z0), (CB_R, Z_HI + 1.0), (0.0, Z_HI + 1.0)], nseg=16)
    return mc.boolean(a, [sq, cb])


def build(entry: dict, params: dict):
    wear, turns = params["wear"], params["turns"]
    reach, r_out, phase, sp = fit_coil(wear, turns)
    bm = mc.bmesh.new()
    amp, gap = make_coil(bm, wear, turns, r_out, phase)
    sp = spans(bm)
    k = SPAN / sp                                                  # a worn coil is not round: stretch it in xy (a ribbon has no bore or teeth) to the exact size
    mc.bmesh.ops.transform(bm, matrix=Matrix.Diagonal((k[0], k[1], 1.0, 1.0)), verts=bm.verts)
    wu.log(f"== {entry['id']}: turns={turns} r_out={r_out:.3f} phase={math.degrees(phase):.0f} deg wear={wear * amp:.2f} centreline gap min {gap:.2f} mm "
           f"coil span {sp[0]:.3f} x {sp[1]:.3f} mm, stretched by {k[0]:.4f} x {k[1]:.4f}, reach to front wall / lid {reach:.2f} mm")
    append_bm(bm, make_arbor())
    name = entry["meshes"][0]
    obj = mc.make_object(bm, name, [entry["materials"][0]])
    obj["wu"] = dict(id=entry["id"], family=FAMILY, worn=bool(wear), coilTurns=turns, ribbonMm=[T_RIB, W_RIB], rotationAxis="+Z",
                     arborMm=dict(zLo=Z_LO, zHi=Z_HI, radius=R_SHAFT, keySquare=SQUARE, keySquareFromZ=SQ_Z0, counterboreRadius=CB_R, counterboreFromZ=CB_Z0))
    col = empties.add_collider(obj, "Grab", "sphere", params["grab_radius"])
    # ADR-050 / INTRICATE_ASSEMBLY_DESIGN 8.1, 11.2: what the spring carries. +Z points to the key; the pinion hub spans z -21.2 to -6.0 (the arbor's inboard end),
    # the lower flange face is at z -4.6, so the washer sits in the 1.4 mm between; the key's 5 mm drive square (key z -4 to +3) goes into the arbor socket
    # at z 3.0 to 10.0 and its 6 mm collar into the counterbore at z 10.6 to 12.0.
    socks = [fz.hw_socket(obj, "Washer", "washer_plain_8", (0.0, 0.0, -5.3e-3), (0.0, 0.0, 1.0), slot="washer_spring", carried=True, note="between the pinion and the coil"),
             empties.add_socket(obj, "Pinion", (0.0, 0.0, -13.6e-3), ["spur_gear"], axis_g=(0.0, 0.0, 1.0), slot="spring_pinion", carried=True,
                                note="gear plane centre; slides on from the inboard end (-Z)"),
             empties.add_socket(obj, "Key", (0.0, 0.0, 7.0e-3), ["winding_key"], axis_g=(0.0, 0.0, 1.0), slot="winding_key", carried=True,
                                note="centre of the key's drive square; the square enters the arbor socket from the outboard end (+Z)")]
    checks = []
    if params.get("tarnish"):
        def dark(g, objs):
            tarnish(obj, params["tarnish"])
            g.info["tarnishFactor"] = params["tarnish"]
        checks.append(dark)
    return [obj, col] + socks, dict(closed=True, checks=checks)


if __name__ == "__main__":
    raise SystemExit("gen_spring.py is a forge family. Run blender/scripts/forge.py --family spring --only <ids> --out-root <dir>")
