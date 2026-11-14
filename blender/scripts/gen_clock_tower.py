"""gen_clock_tower.py - the Clock Tower housing set: base, shell, dial, hands and bell (forge family 'clock_tower', Machines agent).

    "$B" --background --factory-startup --python-exit-code 1 --python blender/scripts/forge.py -- \
         --family clock_tower --only clock_tower_base,clock_tower_shell,clock_face,clock_hands,clock_bell --out-root <dir> --owner Machines

Sizes: docs/TOCKTON_DIMENSIONS.md section 11 and docs/blueprints/MACHINE_SLOT_MAPPINGS.md (owner-approved). The machine is 95 x 280 x 95 mm on a
105 mm plot: base 0 to 60 mm (file clock_tower_base), shell 60 to 280 mm (file clock_tower_shell, its origin on the floor-contact face, so the
runtime stacks it at y = 60 mm), clock face diameter 60 mm centred 190 mm up (shell y 130) on the front.
Built in mm in glTF model space (+Y up, front = +Z), exported in metres. gen_ct_common / gen_mech_common supply the shell toolkit.

clock_tower_base   95 x 60 x 95. Two-course stone plinth, four door steps, four walls (the front one pierced by the arched entrance that shows the
                   pendulum), four corner buttresses with brass straps, two blind side arches with walnut doors, and a ring capstone with a brass bead
                   (opening 54 mm square for the pendulum and the drive shaft). Interior 83 x 83 mm between the walls.
clock_tower_shell  80 x 220 x 80. Lower ring, an open belfry (four round columns, walnut parapets, brass balusters), the cream render tower body
                   (hollow, walnut quoins and girts, four arched windows, a round 56 mm aperture for the dial), upper ring, teal tiled hip roof, front
                   gable, four corner spires and a flag. Mount the dial at (0, 130, +37.6) mm, the bell at (0, 56, 0) mm.
clock_face         60 x 60 x 4. Cream enamel disc, brass bezel, brass numerals I to XII (raised 0.45 mm) and an arbor collar. +Z toward the viewer.
clock_hands        6 x 32 x 3. Two nodes on one pivot (the arbor, origin): the hour hand (root) and the minute hand, both at twelve, walnut.
clock_bell         30 x 28 x 30. Brass bell on a yoke whose gudgeon pins lie on the Z axis (PIV_Swing, swing seen from the front), and the clapper as
                   ClockBell_Striker (PIV_Striker, axis +Z). Origin: the top of the yoke.
"""
from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from mathutils import Vector

from lib import empties

import gen_mech_common as mc
import gen_ct_common as ct

FAMILY = "clock_tower"
STONE, WALNUT, CREAM, TEAL, BRASS, GLASS, FABRIC, ENAMEL, ABRASS = ("Mat_Stone", "Mat_Walnut", "Mat_PaintedWood", "Mat_TealPaint", "Mat_PolishedBrass",
                                                                    "Mat_WarmGlass", "Mat_Fabric", "Mat_CreamEnamel", "Mat_AgedBrass")

PARAMS = {
    "clock_tower_base": dict(half=47.5, height=60.0, wall_outer=44.5, wall_inner=41.5, arch_hw=13.0, arch_spring=31.0),
    "clock_tower_shell": dict(half=40.0, height=220.0, body_half=36.0, face_y=130.0, face_z=37.6, bell_y=56.0),
    "clock_face": dict(r_bezel=30.0, r_disc=27.8, numeral_r=19.5, numeral_h=6.0),
    "clock_hands": dict(hour_len=17.0, minute_len=27.0, tail=5.0),
    "clock_bell": dict(lip_r=15.0, height=28.0, pin_len=5.0, pivot_y=-1.5),
}


# ======================================================================================
# toolkit (mm, world axes, +Y up, front +Z)
# ======================================================================================
def sq(h):
    return [(-h, -h), (h, -h), (h, h), (-h, h)]


def hp(poly, z0, z1, bevel=0.0, holes=()):
    """Prism whose axis is world Z: polygon in the xy plane, extruded between z0 and z1."""
    return ct.shell_prism(poly, z0, z1, bevel, holes=list(holes))


def vp(poly, y0, y1, bevel=0.0, holes=()):
    """Prism whose axis is world Y: polygon of (x, z) pairs, extruded between y0 and y1."""
    f = lambda ring: [(x, -z) for x, z in ring]
    bm = ct.shell_prism(f(poly), y0, y1, bevel, holes=[f(h) for h in holes])
    mc.place(bm, bm.verts, (0.0, 0.0, 0.0), (0.0, 1.0, 0.0))
    return bm


_CS = [(1, 0), (0, 1), (-1, 0), (0, -1)]


def face_to(bm, k):
    """Turn a shell built on the front (+Z) side to side k: 1 = +X, 2 = back, 3 = -X (rotation about +Y, handedness kept)."""
    c, s = _CS[k % 4]
    for v in bm.verts:
        x, y, z = v.co
        v.co.x, v.co.z = x * c + z * s, -x * s + z * c
    return bm


def put(dst, shell, slot=0, k=0):
    ct.merge(dst, face_to(shell, k) if k else shell, slot)


def box(lo, hi, bevel=0.4):
    return ct.shell_box(lo, hi, bevel)


def arch(hw, y0, ysp, n=12):
    """Round-headed opening outline (x, y): flat bottom at y0, springing at ysp, semicircle of radius hw."""
    return [(-hw, y0), (hw, y0)] + ct.arc((0.0, ysp), hw, 0, 180, n)


def horseshoe(ri, ro, y0, ysp, n=12):
    """The band between two concentric arches (inner radius ri, outer ro), open at the bottom."""
    return [(-ro, y0), (-ri, y0)] + ct.arc((0.0, ysp), ri, 180, 0, n) + [(ri, y0), (ro, y0)] + ct.arc((0.0, ysp), ro, 0, 180, n)


def lathe_y(loop, nseg, loc):
    """Solid of revolution about the vertical axis through loc; loop = [(r, height)]."""
    return ct.lathe_along(loop, nseg, (0.0, 1.0, 0.0), loc)


def ball_y(c, r, nseg=10, nr=6):
    """Sphere with its poles on the Y axis, so the top really is c.y + r."""
    loop = [(0.0, r)] + [(r * math.sin(math.pi * i / nr), r * math.cos(math.pi * i / nr)) for i in range(1, nr)] + [(0.0, -r)]
    return lathe_y(loop, nseg, c)


def finish(entry, bm, name, mats, parent=None):
    return mc.make_object(bm, name, mats, parent)


def root_wu(obj, entry, **extra):
    obj["wu"] = dict(id=entry["id"], family=FAMILY, **extra)


# ======================================================================================
# clock_tower_base
# ======================================================================================
def wall_poly(front):
    if front:
        return [(-43.0, 4.4), (-13.0, 4.4)] + ct.arc((0.0, 31.0), 13.0, 180, 0, 14) + [(13.0, 4.4), (43.0, 4.4), (43.0, 54.3), (-43.0, 54.3)]
    return [(-43.0, 4.4), (43.0, 4.4), (43.0, 54.3), (-43.0, 54.3)]


def build_base(entry, p):
    N = "ClockTowerBase_"
    bm = ct.new()
    put(bm, box((-47.5, 0.0, -47.5), (47.5, 3.0, 47.5), 0.7))
    put(bm, box((-45.8, 2.8, -45.8), (45.8, 4.6, 45.8), 0.5))
    root = finish(entry, bm, N + "Platform", [STONE])
    root_wu(root, entry, interiorMm=[83.0, 83.0], floorYMm=4.6, capstoneOpeningMm=[54.0, 54.0])

    bm = ct.new()                                                        # door steps, one centred on each face
    for k in range(4):
        put(bm, box((-15.0, 2.9, 45.0), (15.0, 4.3, 47.1), 0.4), 0, k)
    step = finish(entry, bm, N + "Step", [STONE], root)

    bm = ct.new()                                                        # the entrance arch and the keystone
    put(bm, hp(horseshoe(13.0, 16.0, 4.4, 31.0, 14), 41.0, 46.0, 0.4), 0)
    put(bm, hp(horseshoe(11.8, 13.3, 4.6, 31.0, 14), 42.0, 44.0, 0.2), 1)
    put(bm, hp([(-1.9, 45.2), (1.9, 45.2), (2.7, 50.3), (-2.7, 50.3)], 41.4, 46.6, 0.25), 1)
    arch_e = finish(entry, bm, N + "EntranceArch", [STONE, BRASS], root)

    bm = ct.new()                                                        # blind side arches: frame, walnut door, brass inlay
    for k in (1, 3):
        put(bm, hp(horseshoe(10.0, 13.0, 4.4, 26.0, 12), 44.0, 46.0, 0.3), 0, k)
        put(bm, hp(arch(10.3, 4.4, 26.0, 12), 44.0, 45.0, 0.25), 1, k)
        put(bm, hp(horseshoe(8.2, 9.2, 8.0, 25.4, 10), 44.8, 45.5, 0.15), 2, k)
        put(bm, hp([(-1.5, 35.5), (1.5, 35.5), (2.1, 39.8), (-2.1, 39.8)], 44.0, 46.4, 0.2), 2, k)
    arch_s = finish(entry, bm, N + "ArchPanel", [STONE, WALNUT, BRASS], root)

    bm = ct.new()                                                        # the four walls with skirting, cornice and raised flank panels
    for k in range(4):
        put(bm, hp(wall_poly(k == 0), 41.5, 44.5, 0.25), 0, k)
        put(bm, box((-44.2, 50.6, 41.0), (44.2, 54.3, 45.4), 0.4), 0, k)
        for x0, x1 in (((-44.2, -14.2), (14.2, 44.2)) if k == 0 else ((-44.2, 44.2),)):
            put(bm, box((x0, 4.4, 41.0), (x1, 8.4, 45.3), 0.4), 0, k)
        for x0, x1 in ((17.0, 38.0), (-38.0, -17.0)):
            put(bm, box((x0, 12.0, 44.0), (x1, 46.0, 45.2), 0.4), 0, k)
    walls = finish(entry, bm, N + "WallPanel", [STONE], root)

    bm = ct.new()                                                        # corner buttresses with a brass strap each
    for sx in (1, -1):
        for sz in (1, -1):
            lo, hi = sorted((sx * 37.8, sx * 45.8)), sorted((sz * 37.8, sz * 45.8))
            put(bm, box((lo[0], 4.5, hi[0]), (lo[1], 54.3, hi[1]), 0.8), 0)
            lo2, hi2 = sorted((sx * 37.5, sx * 46.1)), sorted((sz * 37.5, sz * 46.1))
            put(bm, box((lo2[0], 28.0, hi2[0]), (lo2[1], 30.6, hi2[1]), 0.4), 1)
    corners = finish(entry, bm, N + "CornerBlock", [STONE, BRASS], root)

    bm = ct.new()                                                        # ring capstone and its brass bead (top of the part at 60.0)
    put(bm, vp(sq(46.5), 54.0, 59.2, 0.6, [sq(27.0)]), 0)
    put(bm, vp(sq(41.5), 58.8, 60.0, 0.25, [sq(38.5)]), 1)
    cap = finish(entry, bm, N + "Capstone", [STONE, BRASS], root)

    col = empties.add_collider(root, "Case", "box", (0.0475, 0.030, 0.0475), (0.0, 0.030, 0.0))
    sock = empties.add_socket(root, "BaseHandle", (0.0, 0.030, -0.0452), ["machine_base_handle"], axis_g=(0, 0, -1))
    return [root, step, arch_e, arch_s, walls, corners, cap, col, sock], dict(origin=("centre", "min", "centre"), closed=True)


# ======================================================================================
# clock_tower_shell
# ======================================================================================
COLUMN = [(0.0, 0.0), (3.8, 0.0), (4.0, 0.5), (4.0, 1.7), (3.3, 2.5), (2.9, 3.5), (2.9, 40.4), (3.3, 41.4), (4.0, 42.4), (4.0, 45.6), (3.7, 46.2), (0.0, 46.2)]
BALUSTER = [(0.0, 0.0), (0.75, 0.0), (0.75, 0.5), (0.45, 1.1), (0.9, 2.3), (0.9, 3.2), (0.45, 4.4), (0.75, 5.2), (0.75, 6.2), (0.0, 6.2)]
NEWEL = [(0.0, 0.0), (1.5, 0.0), (1.5, 1.0), (1.1, 1.6), (1.1, 5.4), (1.6, 6.4), (1.6, 8.0), (0.8, 9.0), (0.0, 9.4)]
SPIRE = [(0.0, 0.0), (4.2, 0.0), (4.2, 0.8), (3.5, 1.4), (3.0, 2.2), (2.4, 10.0), (1.6, 18.0), (0.6, 24.0), (0.0, 25.6)]
POLE = [(0.0, 0.0), (1.6, 0.0), (1.6, 0.8), (0.9, 1.4), (0.45, 2.0), (0.45, 10.9), (0.0, 10.9)]


def tile_outline(s, nt=4, bump=0.55):
    """Square of half-size s whose sides carry nt tile bumps (plan view; the bump crests reach s); the same point count at every s."""
    pts = []
    for k in range(4):
        for j in range(nt):
            t0 = -s + 2.0 * s * j / nt
            tm = -s + 2.0 * s * (j + 0.5) / nt
            for t, o in ((t0, -bump), (tm, 0.0)):
                pts.append([(t, -(s + o)), (s + o, t), (-t, s + o), (-(s + o), -t)][k])
    return pts


def roof_course(y0, sb, h=3.5, drop=3.6):
    """One frustum of the tiled roof (world axes). The caps are centre fans: the outline has collinear joints that the ear-clip would turn into slivers."""
    bm = ct.new()
    vs = [[bm.verts.new((x, y, z)) for x, z in tile_outline(s)] for s, y in ((sb, y0), (sb - drop, y0 + h))]
    n = len(vs[0])
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((vs[0][i], vs[0][j], vs[1][j], vs[1][i]))
    for ring, y, flip in ((vs[0], y0, True), (vs[1], y0 + h, False)):
        c = bm.verts.new((0.0, y, 0.0))
        for i in range(n):
            a, b = ring[i], ring[(i + 1) % n]
            bm.faces.new((c, b, a) if flip else (c, a, b))
    mc.clean(bm)
    if sb > 14.0:                                                        # the small apex courses have tiles too narrow for a chamfer
        mc.bevel_hard(bm, 0.22)
    return bm


def flag_cloth():
    bm = ct.new()
    n = 9
    path = [Vector((0.3 + 1.35 * i, 215.2, 1.4 * math.sin(0.85 * i) * min(1.0, i / 2.0))) for i in range(n)]
    mc.sweep(bm, path, (0.0, 1.0, 0.0), lambda i: (lambda h: [(-0.35, -h), (0.35, -h), (0.35, h), (-0.35, h)])((6.0 - 2.8 * i / (n - 1)) / 2.0))
    return bm


def build_shell(entry, p):
    N = "ClockTower_"
    bm = ct.new()                                                        # lower ring (root)
    put(bm, vp(sq(40.0), 0.0, 6.0, 0.7, [sq(30.0)]), 0)
    put(bm, vp(sq(38.6), 5.7, 10.0, 0.5, [sq(30.0)]), 0)
    put(bm, vp(sq(39.2), 9.5, 10.6, 0.25, [sq(36.0)]), 1)
    root = finish(entry, bm, N + "LowerRing", [STONE, BRASS])
    root_wu(root, entry, floorOpeningMm=[60.0, 60.0], mount=dict(clockFaceMm=[0.0, p["face_y"], p["face_z"]], bellMm=[0.0, p["bell_y"], 0.0]))

    bm = ct.new()                                                        # four round columns, brass collars
    for sx in (1, -1):
        for sz in (1, -1):
            put(bm, lathe_y(COLUMN, 16, (sx * 36.0, 9.8, sz * 36.0)), 0)
            for y in (14.8, 49.6):
                put(bm, lathe_y([(2.6, 0.0), (3.4, 0.0), (3.4, 1.0), (2.6, 1.0)], 16, (sx * 36.0, y, sz * 36.0)), 1)
    pillar = finish(entry, bm, N + "Pillar", [CREAM, BRASS], root)

    bm = ct.new()                                                        # walnut parapet rails and a newel on each side
    for k in range(4):
        put(bm, box((-33.0, 10.0, 34.4), (33.0, 13.2, 37.6), 0.5), 0, k)
        put(bm, box((-33.0, 19.0, 34.0), (33.0, 21.8, 38.0), 0.6), 0, k)
        put(bm, lathe_y(NEWEL, 10, (0.0, 13.0, 36.0)), 0, k)
    balcony = finish(entry, bm, N + "BalconyFrame", [WALNUT], root)

    bm = ct.new()                                                        # brass balusters: two runs of eight on each side
    for k in range(4):
        for s in (1, -1):
            for i in range(8):
                put(bm, lathe_y(BALUSTER, 6, (s * (5.2 + 3.7 * i), 13.0, 36.0)), 0, k)
    railing = finish(entry, bm, N + "Railing", [BRASS], root)

    body = vp(sq(36.0), 55.8, 168.0, 0.0, [sq(33.0)])                    # tower body: hollow, then the windows and the dial aperture are cut
    tools = [face_to(hp(arch(7.0, 70.0, 86.0, 12), 30.0, 40.0), k) for k in range(4)]
    tools.append(ct.lathe_along([(0.0, 30.0), (28.0, 30.0), (28.0, 40.0), (0.0, 40.0)], 48, (0.0, 0.0, 1.0), (0.0, p["face_y"], 0.0)))
    bm = mc.boolean(body, tools)
    for sx in (1, -1):
        for sz in (1, -1):
            lo, hi = sorted((sx * 33.6, sx * 37.6)), sorted((sz * 33.6, sz * 37.6))
            put(bm, box((lo[0], 60.0, hi[0]), (lo[1], 160.0, hi[1]), 0.5), 1)
    for k in range(4):                                                   # half-timbering below the dial: two studs and two braces on every face
        for sg in (1, -1):
            put(bm, box((sg * 17.0 - 1.1, 61.0, 35.4), (sg * 17.0 + 1.1, 95.6, 37.0), 0.3), 1, k)
            put(bm, hp(stroke((sg * 33.0, 62.5), (sg * 18.0, 82.0), 2.0), 35.4, 37.0, 0.25), 1, k)
    put(bm, vp(sq(37.4), 55.6, 60.0, 0.5, [sq(34.4)]), 1)
    put(bm, vp(sq(37.9), 59.8, 61.0, 0.3, [sq(35.0)]), 2)
    put(bm, vp(sq(37.2), 95.4, 98.0, 0.4, [sq(34.6)]), 1)
    put(bm, vp(sq(38.0), 160.6, 166.4, 0.5, [sq(34.6)]), 1)
    put(bm, vp(sq(38.6), 166.2, 168.0, 0.3, [sq(35.8)]), 2)
    middle = finish(entry, bm, N + "MiddleRing", [CREAM, WALNUT, BRASS], root)

    bm = ct.new()                                                        # four arched windows: brass frame, sill, bars, warm glass
    for k in range(4):
        put(bm, hp(horseshoe(6.4, 8.6, 70.0, 86.0, 12), 34.8, 37.4, 0.3), 0, k)
        put(bm, box((-9.4, 68.8, 34.8), (9.4, 70.6, 38.4), 0.4), 0, k)
        put(bm, box((-0.45, 70.4, 34.6), (0.45, 92.4, 36.6), 0.15), 0, k)
        put(bm, box((-6.6, 80.0, 34.6), (6.6, 80.9, 36.6), 0.15), 0, k)
        put(bm, hp(arch(6.7, 70.2, 86.0, 12), 34.2, 34.9, 0.1), 1, k)
    window = finish(entry, bm, N + "Window", [BRASS, GLASS], root)

    bm = ct.new()                                                        # upper ring: walnut course and a brass bead
    put(bm, vp(sq(39.0), 167.8, 178.0, 0.7, [sq(33.0)]), 0)
    put(bm, vp(sq(39.8), 168.2, 169.4, 0.25, [sq(37.0)]), 1)
    upper = finish(entry, bm, N + "UpperRing", [WALNUT, BRASS], root)

    bm = ct.new()                                                        # teal tiled hip roof, nine courses
    for k in range(9):
        put(bm, roof_course(177.7 + 3.5 * k, 40.0 - 4.125 * k), 0)
    roof = finish(entry, bm, N + "RoofTiles", [TEAL], root)

    bm = ct.new()                                                        # front gable: cream face, teal roof, brass trim
    put(bm, box((-9.0, 177.8, 16.0), (9.0, 185.2, 38.4), 0.5), 0)
    put(bm, hp([(-9.4, 185.0), (9.4, 185.0), (0.0, 192.8)], 38.2, 39.6, 0.25), 0)
    put(bm, hp([(-11.6, 184.2), (11.6, 184.2), (0.0, 195.2)], 14.0, 39.0, 0.4), 1)
    put(bm, box((-11.6, 177.9, 38.6), (11.6, 179.0, 40.0), 0.3), 2)
    put(bm, lathe_y_z([(1.6, 0.0), (2.5, 0.0), (2.5, 0.8), (1.6, 0.8)], 16, (0.0, 188.0, 39.2)), 2)
    put(bm, ball_y((0.0, 195.9, 38.0), 0.9, 8, 4), 2)
    gable = finish(entry, bm, N + "RoofArch", [CREAM, TEAL, BRASS], root)

    bm = ct.new()                                                        # four corner spires
    for sx in (1, -1):
        for sz in (1, -1):
            put(bm, lathe_y(SPIRE, 16, (sx * 35.5, 177.6, sz * 35.5)), 0)
            put(bm, lathe_y([(2.5, 2.0), (3.5, 2.0), (3.5, 3.0), (2.6, 3.0)], 16, (sx * 35.5, 177.6, sz * 35.5)), 1)
            put(bm, ball_y((sx * 35.5, 177.6 + 26.4, sz * 35.5), 1.0, 8, 4), 1)
    spire = finish(entry, bm, N + "Spire", [TEAL, BRASS], root)

    bm = ct.new()                                                        # flag: brass pole to 220.0 and a rippled cloth pennant
    put(bm, lathe_y(POLE, 10, (0.0, 208.4, 0.0)), 0)
    put(bm, ball_y((0.0, 219.05, 0.0), 0.95, 10, 6), 0)
    put(bm, flag_cloth(), 1)
    flag = finish(entry, bm, N + "Flag", [BRASS, FABRIC], root)

    col = empties.add_collider(root, "Case", "box", (0.040, 0.110, 0.040), (0.0, 0.110, 0.0))
    s1 = empties.add_socket(root, "Face", (0.0, p["face_y"] * 1e-3, p["face_z"] * 1e-3), ["clock_face"], axis_g=(0, 0, 1))
    s2 = empties.add_socket(root, "Bell", (0.0, p["bell_y"] * 1e-3, 0.0), ["clock_bell"], axis_g=(0, -1, 0))
    return [root, pillar, balcony, railing, middle, window, upper, roof, gable, spire, flag, col, s1, s2], dict(origin=("centre", "min", "centre"), closed=True)


def lathe_y_z(loop, nseg, loc):
    """Solid of revolution about the +Z axis through loc (a ring on the front face); loop = [(r, depth)]."""
    return ct.lathe_along(loop, nseg, (0.0, 0.0, 1.0), loc)


# ======================================================================================
# clock_face
# ======================================================================================
H_N = 6.0
GLYPH = {"I": [((0.0, 0.0), (0.0, H_N))],
         "V": [((-2.0, H_N), (-0.15, 0.0)), ((2.0, H_N), (0.15, 0.0))],
         "X": [((-2.1, H_N), (2.1, 0.0)), ((2.1, H_N), (-2.1, 0.0))]}
ADV = {"I": 1.9, "V": 4.6, "X": 4.6}
ROMAN = ["XII", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI"]


def stroke(p0, p1, w=0.95):
    (x0, y0), (x1, y1) = p0, p1
    L = math.hypot(x1 - x0, y1 - y0)
    nx, ny = -(y1 - y0) / L * w / 2, (x1 - x0) / L * w / 2
    return [(x0 + nx, y0 + ny), (x1 + nx, y1 + ny), (x1 - nx, y1 - ny), (x0 - nx, y0 - ny)]


def numeral_strokes(s):
    """Strokes of a Roman numeral string, centred on the origin, upright (x, y in mm)."""
    cs, x = [], 0.0
    for c in s:
        cs.append(x + ADV[c] / 2)
        x += ADV[c]
    shift = (cs[0] + cs[-1]) / 2
    return [((a[0] + cx - shift, a[1] - H_N / 2), (b[0] + cx - shift, b[1] - H_N / 2)) for c, cx in zip(s, cs) for a, b in GLYPH[c]]


def build_face(entry, p):
    disc = ct.new()
    ct.merge(disc, ct.shell_lathe([(0.0, -2.0), (27.0, -2.0), (p["r_disc"], -1.3), (p["r_disc"], 0.2), (27.2, 0.6), (3.4, 0.6), (0.0, 0.9)], 32))
    root = mc.make_object(disc, "ClockFace_Disc", [ENAMEL])
    root_wu(root, entry, mount="SOCKET_Hands", dialFrontZMm=0.6)
    bz = ct.new()
    ct.merge(bz, ct.shell_lathe([(27.0, -1.6), (29.4, -1.6), (30.0, -1.0), (30.0, 1.0), (29.4, 1.7), (28.6, 2.0), (27.8, 2.0), (27.0, 1.4)], 32))
    ct.merge(bz, ct.shell_lathe([(0.0, 0.4), (3.0, 0.4), (3.0, 0.9), (2.2, 1.3), (0.0, 1.3)], 20))
    for h, s in enumerate(ROMAN):                                        # h = 0 is twelve o'clock
        a = math.radians(30.0 * h)
        cx, cy = p["numeral_r"] * math.sin(a), p["numeral_r"] * math.cos(a)
        for q0, q1 in numeral_strokes(s):
            ct.merge(bz, ct.shell_prism(stroke((q0[0] + cx, q0[1] + cy), (q1[0] + cx, q1[1] + cy)), 0.45, 1.05, 0.0), 0)
    bezel = mc.make_object(bz, "ClockFace_Bezel", [BRASS], root)
    sock = empties.add_socket(root, "Hands", (0.0, 0.0, 0.0013), ["clock_hands"], axis_g=(0, 0, 1))
    return [root, bezel, sock], dict(origin=("centre", "centre", "centre"), closed=True)


# ======================================================================================
# clock_hands
# ======================================================================================
HOUR = [(-0.9, -3.0), (0.9, -3.0), (0.9, 6.0), (1.5, 7.8), (2.9, 9.6), (3.0, 11.2), (2.2, 13.0), (1.0, 15.2), (0.35, 17.0), (-0.35, 17.0), (-1.0, 15.2),
        (-2.2, 13.0), (-3.0, 11.2), (-2.9, 9.6), (-1.5, 7.8), (-0.9, 6.0)]
MINUTE = [(-1.3, -4.4), (-0.8, -5.0), (0.8, -5.0), (1.3, -4.4), (1.3, -3.0), (0.7, -1.5), (0.9, 4.0), (1.3, 10.0), (1.7, 15.0), (1.9, 17.5), (1.4, 21.5),
          (0.8, 25.0), (0.35, 27.0), (-0.35, 27.0), (-0.8, 25.0), (-1.4, 21.5), (-1.9, 17.5), (-1.7, 15.0), (-1.3, 10.0), (-0.9, 4.0), (-0.7, -1.5), (-1.3, -3.0)]


def build_hands(entry, p):
    bm = ct.new()
    ct.merge(bm, ct.shell_prism(HOUR, -1.2, -0.2, 0.2, holes=[ct.circle(0.8, 10, (0.0, 11.4))]))
    ct.merge(bm, ct.shell_lathe([(0.0, -1.5), (1.9, -1.5), (2.3, -1.1), (2.3, -0.3), (1.9, 0.2), (0.0, 0.2)], 20))
    root = mc.make_object(bm, "ClockHands_Hour", [WALNUT])
    root_wu(root, entry, restPose="twelve", rotationAxis="+Z", pivot="PIV_Arbor", note="turned by the runtime from the local clock, not by the solver")
    bm = ct.new()
    ct.merge(bm, ct.shell_prism(MINUTE, 0.2, 1.2, 0.2, holes=[ct.circle(0.7, 10, (0.0, 17.2))]))
    ct.merge(bm, ct.shell_lathe([(0.0, -0.1), (1.9, -0.1), (2.1, 0.2), (2.1, 1.0), (1.6, 1.5), (0.0, 1.5)], 20))
    minute = mc.make_object(bm, "ClockHands_Minute", [WALNUT], root)
    piv = empties.add_pivot(root, "Arbor", (0.0, 0.0, 0.0), (0.0, 0.0, 1.0), "rotation_axis", "+Z")
    return [root, minute, piv], dict(closed=True)


# ======================================================================================
# clock_bell
# ======================================================================================
BELL = [(0.0, -4.0), (3.0, -4.1), (5.6, -5.4), (8.2, -7.8), (9.6, -10.8), (10.3, -11.3), (10.3, -12.3), (9.9, -12.8), (11.4, -17.4), (13.2, -21.4),
        (14.6, -24.6), (15.0, -26.6), (14.5, -28.0), (12.7, -28.0), (12.4, -26.0), (10.6, -21.4), (8.6, -15.8), (6.8, -10.4), (3.8, -6.6), (0.0, -5.8)]


def build_bell(entry, p):
    bm = ct.new()
    ct.merge(bm, lathe_y(BELL, 24, (0.0, 0.0, 0.0)))
    ct.merge(bm, box((-3.0, -4.4, -11.0), (3.0, 0.0, 11.0), 0.7))                       # headstock
    for sg in (1, -1):                                                                  # gudgeon pins on the Z axis, top tangent to y = 0
        ct.merge(bm, ct.lathe_along([(0.0, 0.0), (1.5, 0.0), (1.5, 4.4), (1.0, 5.0), (0.0, 5.0)], 12, (0.0, 0.0, sg), (0.0, p["pivot_y"], sg * 10.0)))
    root = mc.make_object(bm, "ClockBell_Bell", [BRASS])
    root_wu(root, entry, swingAxis="+Z", pivot="PIV_Swing", strikerPivot="PIV_Striker", note="origin = top of the yoke; the bell swings about the gudgeon pins")
    st = ct.new()
    ct.merge(st, ct.shell_sphere((0.0, -17.6, 0.0), 2.3, 10, 6))
    ct.merge(st, ct.bar_shell((0.0, -6.0, 0.0), (0.0, -16.0, 0.0), 0.65, 8))
    ct.merge(st, box((-1.3, -7.4, -0.9), (1.3, -5.5, 0.9), 0.3))
    striker = mc.make_object(st, "ClockBell_Striker", [ABRASS], root)
    swing = empties.add_pivot(root, "Swing", (0.0, p["pivot_y"] * 1e-3, 0.0), (0.0, 0.0, 1.0), "rotation_axis", "+Z")
    pst = empties.add_pivot(root, "Striker", (0.0, -6.4e-3, 0.0), (0.0, 0.0, 1.0), "rotation_axis", "+Z")
    return [root, striker, swing, pst], dict(origin=("centre", "max", "centre"), closed=True)


BUILDERS = {"clock_tower_base": build_base, "clock_tower_shell": build_shell, "clock_face": build_face, "clock_hands": build_hands, "clock_bell": build_bell}


def build(entry: dict, params: dict):
    return BUILDERS[entry["id"]](entry, params)


if __name__ == "__main__":
    raise SystemExit("gen_clock_tower.py is a forge family. Run blender/scripts/forge.py --family clock_tower --only <ids> --out-root <dir>")
