"""gen_mech_extras.py - the remaining Mechanical-library parts: pulley, cam, follower, crank (G0-optional) and ratchet wheel, pawl,
flywheel, rigid coupling, worm screw (future G2). Not a forge family itself: forge loads the thin wrappers gen_pulley.py, gen_cam.py,
gen_follower.py, gen_crank.py, gen_ratchet.py, gen_pawl.py, gen_flywheel.py, gen_coupling.py and gen_worm_gear.py (each declares its
FAMILY and PARAMS and re-exports `build`), so every manifest `blenderSource` keeps its own name.

    "$B" --background --factory-startup --python-exit-code 1 --python blender/scripts/forge.py -- \
         --family pulley --only pulley_standard --out-root <dir>

House style (identical to the spur gears, shaft and bevel gear): aged brass, 4.0 mm bore RADIUS (8 mm hole, the shaft's fit) with a
0.6 mm chamfered mouth, 45 degree chamfers on every hard edge, domed rivet heads (gen_gear_spur.dome_shell, r 0.8 mm, 0.62 mm high),
metric box UVs and one constants-only Mat_AgedBrass proxy. Model space: rotation axis = local +Z, origin on the rotation centre,
tooth / arm 0 along +X or +Y as noted per part. Authored in mm (see gen_mech_common), exported in metres.
"""
from __future__ import annotations

import math
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np

import wu_common as wu
from lib import empties

import gen_mech_common as mc
from gen_gear_spur import dome_shell

BORE_R = 4.0
MOUTH = 0.6                                        # bore mouth chamfer (matches gear_bevel_12)
RIVET_A, RIVET_H = 0.8, 0.62                        # same domed head as the gears


# ======================================================================================
# helpers
# ======================================================================================
def family_of(entry):
    return Path(entry["glbPath"]).parent.name


def capsule(p0, p1, r0, r1, n=10):
    """Counter-clockwise outline of a (tapered) capsule: radius r0 round p0, r1 round p1."""
    d = math.atan2(p1[1] - p0[1], p1[0] - p0[0])
    pts = [(p1[0] + r1 * math.cos(d - math.pi / 2 + math.pi * i / n), p1[1] + r1 * math.sin(d - math.pi / 2 + math.pi * i / n)) for i in range(n + 1)]
    pts += [(p0[0] + r0 * math.cos(d + math.pi / 2 + math.pi * i / n), p0[1] + r0 * math.sin(d + math.pi / 2 + math.pi * i / n)) for i in range(n + 1)]
    return pts


def lathe_bm(loop, nseg, center=(0.0, 0.0), phase=0.0):
    bm = mc.bmesh.new()
    mc.lathe(bm, loop, nseg=nseg, center=center, phase=phase)
    return bm


def prism_bm(poly, z0, z1):
    bm = mc.bmesh.new()
    mc.prism(bm, poly, z0, z1)
    return bm


def bore_cutter(h, nseg=32):
    """Through bore of radius 4.0 with a 45 degree mouth chamfer at both faces z = -h and z = +h."""
    r1 = BORE_R + MOUTH + 0.8
    return lathe_bm([(0.0, -h - 0.8), (r1, -h - 0.8), (BORE_R, -h + MOUTH), (BORE_R, h - MOUTH), (r1, h + 0.8), (0.0, h + 0.8)], nseg)


def window_cutter(c, r, h, nseg=10, ch=0.5):
    """Round lightening window through a plate with faces at z = -h and +h, chamfered 0.5 mm at both faces."""
    return lathe_bm([(0.0, -h - 1.0), (r + ch + 1.0, -h - 1.0), (r, -h + ch), (r, h - ch), (r + ch + 1.0, h + 1.0), (0.0, h + 1.0)], nseg, center=c)


def rivet_bm(items, nseg=6):
    """items: [(x, y, z_face, sign, a, h)] -> one closed-shell bmesh of domed heads standing on the faces (skirt sunk into the body)."""
    bm = mc.bmesh.new()
    for (x, y, z0, sign, a, h) in items:
        v, f = dome_shell(x, y, z0, sign, a, h, nseg=nseg, rings=1, skirt=0.18, phase=math.atan2(y, x))
        vs = [bm.verts.new(c) for c in v]
        for q in f:
            bm.faces.new([vs[i] for i in q])
    mc.bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def ring_rivets(cx, cy, radius, n, z_face, a=RIVET_A, h=RIVET_H, start_deg=0.0, faces=(1, -1)):
    out = []
    for sign in faces:
        for i in range(n):
            t = math.radians(start_deg) + 2 * math.pi * i / n
            out.append((cx + radius * math.cos(t), cy + radius * math.sin(t), sign * z_face, sign, a, h))
    return out


def hex_screw(c, z_to, r=2.0, h=1.3, spin=0.0):
    """Hex set-screw head standing on a cylinder surface at c, sunk 1 mm so the curved wall never leaves a gap."""
    bm = mc.bmesh.new()
    v = mc.lathe(bm, [(0.0, -1.0), (r, -1.0), (r, h - 0.25), (r - 0.25, h), (0.0, h)], 6, phase=spin)
    mc.place(bm, v, c, z_to)
    return bm


def union(bm, tools):
    out = mc.boolean(bm, tools, "UNION")
    mc.clean(out)
    return out


def cut(bm, tools):
    out = mc.boolean(bm, tools, "DIFFERENCE")
    mc.clean(out)
    return out


def bore_check(g, objs):
    """The bore is the only geometry near the axis: its radius must be the gears' 4.0 mm."""
    me = objs[0].data
    c = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get("co", c)
    c = c.reshape(-1, 3)
    r = np.hypot(c[:, 0], c[:, 2])                  # the rotation axis is Blender Y
    g.info["boreRadiusMm"] = round(float(r.min()) * 1000, 4)
    if abs(float(r.min()) - BORE_R * 1e-3) > 5e-5:
        g.fail("Q13", f"bore radius {r.min() * 1000:.4f} mm, expected {BORE_R} mm")


def finish(bm, entry, wu_extra, col, hints=None):
    name = entry["meshes"][0]
    obj = mc.make_object(bm, name, [entry["materials"][0]])
    obj["wu"] = dict(id=entry["id"], family=family_of(entry), rotationAxis="+Z", boreRadiusMm=BORE_R, **wu_extra)
    c = col(obj)
    h = dict(closed=True, checks=[bore_check])
    h.update(hints or {})
    return [obj, c], h


def sphere_col(radius_m):
    return lambda obj: empties.add_collider(obj, "Grab", "sphere", radius_m)


def box_col(half_m, loc_m):
    return lambda obj: empties.add_collider(obj, "Grab", "box", half_m, loc_g=loc_m)


SYM = ("centre", "centre", "centre")


# ======================================================================================
# pulley_standard: grooved belt pulley, 30 x 10 mm
# ======================================================================================
def build_pulley(entry, params):
    R, Rg, hh = 15.0, 11.8, 4.4                          # 8.8 mm body + two 0.62 mm rivet heads = 10 mm overall
    half = [(4.6, -hh), (6.0, -hh), (6.6, -hh + 0.6), (6.6, -1.5), (9.8, -1.5), (9.8, -hh + 0.6), (10.4, -hh), (14.4, -hh), (R, -hh + 0.6),
            (R, -3.1), (Rg, -0.8)]
    loop = half + [(r, -z) for r, z in reversed(half)] + [(4.0, hh - 0.6), (4.0, -hh + 0.6)]
    bm = lathe_bm(loop, params.get("nseg", 22))
    mc.clean(bm)
    bm = union(bm, [rivet_bm(ring_rivets(0, 0, 12.4, params.get("rivets", 6), hh, start_deg=30.0), params.get("rivet_nseg", 6))])
    return finish(bm, entry, dict(diameterMm=2 * R, grooveRadiusMm=Rg, widthMm=10.0), sphere_col(0.015),
                  dict(origin=SYM, thin_axis_z=True))


# ======================================================================================
# cam_eccentric: eccentric disc, R 15, offset 3 mm (throw 6 mm), 8 mm hub, 30 x 30 x 8 mm
# ======================================================================================
def build_cam(entry, params):
    R, e = 15.0, 3.0
    disc = lathe_bm([(0.0, 3.2), (R - 0.6, 3.2), (R, 2.6), (R, -2.6), (R - 0.6, -3.2), (0.0, -3.2)], 32, center=(e, 0.0))
    boss = lathe_bm([(0.0, -4.0), (5.9, -4.0), (6.5, -3.4), (6.5, 3.4), (5.9, 4.0), (0.0, 4.0)], 24)
    bm = union(disc, [boss])
    bm = cut(bm, [bore_cutter(4.0)])
    mc.bevel_hard(bm, 0.4)
    mc.clean(bm)
    bm = union(bm, [rivet_bm(ring_rivets(e, 0, 11.0, params.get("rivets", 5), 3.2, start_deg=36.0), params.get("rivet_nseg", 6))])
    return finish(bm, entry, dict(discRadiusMm=R, eccentricityMm=e, throwMm=2 * e), sphere_col(0.015), dict(thin_axis_z=True))


# ======================================================================================
# follower_roller: pivot lever with a 12 mm roller on a pin, 12 x 30 x 8 mm
# ======================================================================================
def build_follower(entry, params):
    L = 18.0                                              # pivot centre to roller centre (+Y)
    boss = lathe_bm([(0.0, -3.8), (5.4, -3.8), (6.0, -3.2), (6.0, 3.2), (5.4, 3.8), (0.0, 3.8)], 24)
    plate = capsule((0.0, 0.0), (0.0, L), 4.8, 3.6, 8)
    roller = lathe_bm([(0.0, -2.1), (5.4, -2.1), (6.0, -1.5), (6.0, 1.5), (5.4, 2.1), (0.0, 2.1)], 28, center=(0.0, L))
    bm = union(prism_bm(plate, 2.0, 3.4), [prism_bm(plate, -3.4, -2.0), boss, roller])
    bm = cut(bm, [bore_cutter(3.8)])
    mc.bevel_hard(bm, 0.35)
    mc.clean(bm)
    items = []
    for sign in (1, -1):
        items.append((0.0, L, sign * 3.4, sign, 1.5, 0.6))                 # roller pin head
        items.append((0.0, 9.0, sign * 3.4, sign, 0.8, RIVET_H))           # rivet on the arm
    bm = union(bm, [rivet_bm(items, params.get("rivet_nseg", 6))])
    return finish(bm, entry, dict(rollerRadiusMm=6.0, armLengthMm=L), box_col((0.006, 0.015, 0.004), (0.0, 0.009, 0.0)))


# ======================================================================================
# crank_standard: hub, tapered arm with a lightening slot, offset pin and handle, 40 x 12 x 8 mm
# ======================================================================================
def build_crank(entry, params):
    A = 28.0                                              # hub centre to crank pin (+X)
    hub = lathe_bm([(0.0, -2.8), (5.4, -2.8), (6.0, -2.2), (6.0, 2.2), (5.4, 2.8), (0.0, 2.8)], 22)
    arm = prism_bm(capsule((0.0, 0.0), (A, 0.0), 5.0, 4.4, 8), -1.6, 1.6)
    pin = lathe_bm([(0.0, 1.0), (2.0, 1.0), (2.0, 2.4), (2.9, 2.4), (3.4, 2.9), (3.4, 4.7), (2.9, 5.2), (0.0, 5.2)], 20, center=(A, 0.0))
    bm = union(arm, [hub, pin])
    slot = prism_bm(capsule((11.0, 0.0), (21.0, 0.0), 1.5, 1.5, 6), -3.0, 3.0)
    bm = cut(bm, [bore_cutter(2.8), slot])
    mc.bevel_hard(bm, 0.35)
    mc.clean(bm)
    items = [(8.3, y, sign * 1.6, sign, 0.7, 0.55) for sign in (1, -1) for y in (-3.0, 3.0)]
    bm = union(bm, [rivet_bm(items, params.get("rivet_nseg", 6))])
    return finish(bm, entry, dict(throwMm=A, handleSide="+Z"), box_col((0.020, 0.006, 0.004), (0.014, 0.0, 0.0012)))


# ======================================================================================
# ratchet_wheel (G2): 20 chunky saw teeth, R 20, six lightening windows, 6 mm thick
# ======================================================================================
def build_ratchet(entry, params):
    N, Rt, Rr = 20, 20.0, 17.0
    p = 2 * math.pi / N
    poly = []
    for i in range(N):
        t = i * p
        for dr, dt in ((Rr, 0.0), (Rt, 0.05 * p), (Rt, 0.15 * p)):          # steep face, tip land; the long ramp runs to the next root
            poly.append((dr * math.cos(t + dt), dr * math.sin(t + dt)))
    disc = prism_bm(poly, -2.5, 2.5)
    boss = lathe_bm([(0.0, -3.0), (6.2, -3.0), (6.8, -2.4), (6.8, 2.4), (6.2, 3.0), (0.0, 3.0)], 24)
    bm = union(disc, [boss])
    win = [window_cutter((11.8 * math.cos(math.radians(60 * k)), 11.8 * math.sin(math.radians(60 * k))), 2.9, 2.5, 10) for k in range(6)]
    bm = cut(bm, [bore_cutter(3.0)] + win)
    mc.bevel_hard(bm, 0.4)
    mc.clean(bm)
    rv = [(15.8 * math.cos(math.radians(30 + 60 * k)), 15.8 * math.sin(math.radians(30 + 60 * k)), s * 2.5, s, RIVET_A, RIVET_H) for s in (1, -1) for k in range(6)]
    bm = union(bm, [rivet_bm(rv, params.get("rivet_nseg", 6))])
    return finish(bm, entry, dict(teeth=N, tipRadiusMm=Rt, rootRadiusMm=Rr, drive="steep face at +angle"), sphere_col(0.020),
                  dict(origin=SYM, thin_axis_z=True))


# ======================================================================================
# pawl_standard (G2): pivot boss, tapered arm with a lightening slot and a wedge hook
# ======================================================================================
def build_pawl(entry, params):
    hook = [(0.0, -4.8), (14.0, -3.8), (21.0, -3.4), (23.2, -7.0), (26.0, -7.0), (26.6, -3.0), (24.6, 1.8), (14.0, 3.4), (0.0, 4.8)]
    boss = lathe_bm([(0.0, -2.6), (5.4, -2.6), (6.0, -2.0), (6.0, 2.0), (5.4, 2.6), (0.0, 2.6)], 24)
    bm = union(prism_bm(hook, -1.6, 1.6), [boss])
    slot = prism_bm(capsule((8.5, 0.0), (15.0, 0.1), 1.0, 1.0, 8), -3.0, 3.0)
    bm = cut(bm, [bore_cutter(2.6), slot])
    mc.bevel_hard(bm, 0.35)
    mc.clean(bm)
    items = [(19.6, -0.2, s * 1.6, s, 0.75, 0.55) for s in (1, -1)]
    bm = union(bm, [rivet_bm(items, params.get("rivet_nseg", 6))])
    return finish(bm, entry, dict(hookTipMm=[26.0, -7.0]), box_col((0.0168, 0.0065, 0.0026), (0.0107, -0.0005, 0.0)))


# ======================================================================================
# flywheel_standard (G2): heavy rim, recessed web with six windows, flanged hub, 52 x 12 mm
# ======================================================================================
def build_flywheel(entry, params):
    Ro, Ri, hh = 26.0, 19.5, 6.0
    half = [(4.6, -hh), (8.0, -hh), (8.8, -5.2), (8.8, -2.0), (Ri, -2.0), (Ri, -5.2), (Ri + 0.8, -hh), (Ro - 0.8, -hh), (Ro, -5.2)]
    loop = half + [(r, -z) for r, z in reversed(half)] + [(4.0, 5.4), (4.0, -5.4)]
    loop = [(r, z) for r, z in loop]
    bm = lathe_bm(loop, params.get("nseg", 24))
    mc.clean(bm)
    win = [window_cutter((14.2 * math.cos(math.radians(60 * k + 30)), 14.2 * math.sin(math.radians(60 * k + 30))), 4.2, 2.0, 10) for k in range(6)]
    bm = cut(bm, win)
    mc.bevel_hard(bm, 0.4)
    mc.clean(bm)
    bm = union(bm, [rivet_bm(ring_rivets(0, 0, 22.75, params.get("rivets", 6), hh, start_deg=0.0), params.get("rivet_nseg", 6))])
    return finish(bm, entry, dict(diameterMm=2 * Ro, rimWidthMm=2 * hh), sphere_col(0.026), dict(origin=SYM, thin_axis_z=True))


# ======================================================================================
# coupling_rigid (G2): turned sleeve, 14.4 x 26 mm, banded, two hex set screws
# ======================================================================================
def build_coupling(entry, params):
    half = [(4.6, -13.0), (6.4, -13.0), (7.2, -12.2), (7.2, -9.0), (6.6, -8.4), (6.6, -1.8), (7.2, -1.2)]
    loop = half + [(r, -z) for r, z in reversed(half)] + [(4.0, 12.4), (4.0, -12.4)]
    loop = [(r, z) for r, z in loop]
    bm = lathe_bm(loop, params.get("nseg", 28))
    mc.clean(bm)
    screws = [hex_screw((0.0, 6.6, -4.6), (0, 1, 0), spin=0.0), hex_screw((0.0, -6.6, 4.6), (0, -1, 0), spin=0.0)]
    bm = union(bm, screws)
    return finish(bm, entry, dict(diameterMm=14.4, lengthMm=26.0), box_col((0.0084, 0.0084, 0.013), (0.0, 0.0, 0.0)), dict(origin=SYM))


# ======================================================================================
# worm_gear (G2): single-start right-hand worm screw, pitch 6 mm, 21 mm over the thread, 28 mm long
# ======================================================================================
def build_worm(entry, params):
    n, pitch, Rc, Rt, hz = params.get("nphi", 20), 6.0, 7.4, 10.4, 9.0          # steps per turn, lead, core radius, thread tip radius, thread half length
    prof = [(7.0, -1.6), (Rt, -0.6), (Rt, 0.6), (7.0, 1.6)]                    # trapezoid thread section, base sunk 0.4 mm into the core
    z0 = -hz - 2.0
    steps = int(round(n * (2 * hz + 4.0) / pitch))
    ridge = mc.bmesh.new()
    rings = []
    for j in range(steps + 1):
        phi = 2 * math.pi * j / n
        zc = z0 + pitch * j / n
        rings.append([ridge.verts.new((r * math.cos(phi), r * math.sin(phi), zc + z)) for r, z in prof])
    k = len(prof)
    for a, b in zip(rings[:-1], rings[1:]):
        for i in range(k):
            ridge.faces.new((a[i], a[(i + 1) % k], b[(i + 1) % k], b[i]))
    ridge.faces.new(rings[0][::-1])
    ridge.faces.new(rings[-1])
    mc.bmesh.ops.recalc_face_normals(ridge, faces=ridge.faces)
    slab = lathe_bm([(0.0, -hz), (12.0, -hz), (12.0, hz), (0.0, hz)], 8)
    ridge = mc.boolean(ridge, [slab], "INTERSECT")
    mc.clean(ridge)
    core = lathe_bm([(4.6, -14.0), (5.4, -14.0), (6.0, -13.4), (6.0, -hz), (7.0, -hz), (Rc, -hz + 0.4), (Rc, hz - 0.4), (7.0, hz), (6.0, hz),
                     (6.0, 13.4), (5.4, 14.0), (4.6, 14.0), (4.0, 13.4), (4.0, -13.4)], n)
    mc.clean(core)
    bm = union(core, [ridge])
    return finish(bm, entry, dict(leadMm=pitch, starts=1, hand="right", threadTipRadiusMm=Rt, coreRadiusMm=Rc),
                  box_col((0.0104, 0.0104, 0.014), (0.0, 0.0, 0.0)), dict(origin=SYM))


BUILDERS = {
    "pulley_standard": build_pulley, "cam_eccentric": build_cam, "follower_roller": build_follower, "crank_standard": build_crank,
    "ratchet_wheel": build_ratchet, "pawl_standard": build_pawl, "flywheel_standard": build_flywheel, "coupling_rigid": build_coupling,
    "worm_gear": build_worm,
}
FAMILY_IDS = {"pulley": "pulley_standard", "cam": "cam_eccentric", "follower": "follower_roller", "crank": "crank_standard",
              "ratchet": "ratchet_wheel", "pawl": "pawl_standard", "flywheel": "flywheel_standard", "coupling": "coupling_rigid",
              "worm_gear": "worm_gear"}


def build(entry, params):
    wu.log(f"== {entry['id']}")
    return BUILDERS[entry["id"]](entry, params)


if __name__ == "__main__":
    raise SystemExit("gen_mech_extras.py is a library for the gen_<family>.py wrappers; run blender/scripts/forge.py --family <folder> --only <id>")
