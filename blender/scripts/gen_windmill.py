"""gen_windmill.py - the windmill family (forge family): base drum, tapered tower, four-sail rotor and millstone.

Not run directly. The family runner builds it:

    "$B" --background --factory-startup --python-exit-code 1 --python blender/scripts/forge.py -- \
         --family windmill --only windmill_base,windmill_tower,windmill_sails,windmill_millstone --out-root <dir> --owner Machines

Sizes are the owner-approved TOCKTON_DIMENSIONS.md section 6 / 11 values (1:1 workbench scale): base 9.5 x 3.5 x 9.5 cm (interior
8.3 cm), tower 3.5 to 23.0 cm above the table, hub 19.0 cm high, sails diameter 16.0 cm, millstone diameter 5.0 cm.

Every mesh is built in glTF axes (x right, y up, z towards the player) at 100x (1 unit = 1 cm) so chamfers stay far above Blender's
merge tolerances, then swizzled to Blender space (x, y, z) -> (x, -z, y) and scaled to metres, exactly like the gear family.
Parts are closed solids that may interpenetrate (no booleans); pieces never share a vertex position, so mesh_qa reports no doubles.
Tower, base: origin at the centre of the floor-contact face, +Y up. Sails, millstone: rotation axis = local +Z, origin on the axis,
front face towards +Z; rotation is never baked (the solver supplies the angle). The tower's SOCKET_Rotor is where the sails'
origin sits; the base's SOCKET_Tower is where the tower's origin sits.

Finish: constants-only library proxies (Mat_PaintedWood cream walls and teal-free palette: walnut, aged and polished brass, deep teal
paint for the roof, door and base panels, stone, cream fabric sails, warm emissive window panes). No red, navy or lilac from the boards.
"""
from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np

import bmesh
import bpy
from mathutils import Matrix, Vector

import wu_common as wu
from lib import empties, materials, uvmetric

S = 100.0                                   # build scale: 1 unit = 1 cm
FAMILY = "windmill"
TO_BLENDER = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1))) @ Matrix.Scale(1.0 / S, 4)
Y_TO_Z = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))      # rotate a Y-axis lathe onto the Z axis


# ======================================================================================
# piece kit: every function returns a CLOSED solid bmesh, cm, glTF axes
# ======================================================================================
def bevel_convex(bm, width, min_angle_deg=40.0):
    bm.edges.ensure_lookup_table()
    sel = [e for e in bm.edges if e.is_manifold and e.is_convex and e.calc_face_angle(0.0) >= math.radians(min_angle_deg)]
    if sel:
        bmesh.ops.bevel(bm, geom=sel, offset=width, offset_type="OFFSET", segments=1, profile=0.5, affect="EDGES",
                        clamp_overlap=True, loop_slide=True)


MAXE = 0.9      # longest edge (cm) of a piece: vertex AO needs vertices where the shading changes, not only at the joints


def subdiv(bm, maxe=MAXE):
    for _ in range(8):
        long = [e for e in bm.edges if e.calc_length() > maxe]
        if not long:
            break
        bmesh.ops.subdivide_edges(bm, edges=long, cuts=1, use_grid_fill=True)


def xf(bm, M):
    bmesh.ops.transform(bm, matrix=M, verts=bm.verts)
    return bm


def mv(x, y, z):
    return Matrix.Translation((x, y, z))


def p_box(w, h, d, c=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= w
        v.co.y *= h
        v.co.z *= d
    subdiv(bm)
    if c > 0:
        bevel_convex(bm, min(c, 0.45 * min(w, h, d)))
    return bm


def beam(p0, p1, w, h, up=(0, 1, 0), c=0.0):
    """Box of cross-section w x h running from p0 to p1; h lies along `up` (made orthogonal to the run)."""
    p0, p1, up = Vector(p0), Vector(p1), Vector(up)
    d = p1 - p0
    x = d.normalized()
    z = (up - x * up.dot(x)).normalized()
    y = z.cross(x)
    m = (p0 + p1) / 2
    M = Matrix(((x.x, y.x, z.x, m.x), (x.y, y.y, z.y, m.y), (x.z, y.z, z.z, m.z), (0, 0, 0, 1)))
    return xf(p_box(d.length, w, h, c), M)


def chamfer2d(pts, c):
    """Cut every convex corner of a closed (r, y) profile that is off the axis by c (profile may be CW or CCW)."""
    n = len(pts)
    sgn = 1.0 if sum(pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1] for i in range(n)) > 0 else -1.0
    out = []
    for i in range(n):
        p0, p1, p2 = pts[i - 1], pts[i], pts[(i + 1) % n]
        e1, e2 = (p1[0] - p0[0], p1[1] - p0[1]), (p2[0] - p1[0], p2[1] - p1[1])
        l1, l2 = math.hypot(*e1), math.hypot(*e2)
        convex = sgn * (e1[0] * e2[1] - e1[1] * e2[0]) > 1e-9
        if abs(p1[0]) < 1e-9 or not convex or c <= 0 or l1 < 2.2 * c or l2 < 2.2 * c:
            out.append(p1)
        else:
            out += [(p1[0] - e1[0] / l1 * c, p1[1] - e1[1] / l1 * c), (p1[0] + e2[0] / l2 * c, p1[1] + e2[1] / l2 * c)]
    return out


def p_lathe(prof, seg=32, c=0.0, phase=0.0):
    """Revolve a closed (r, y) profile about the Y axis (vertices on the axis stay single points). c = profile chamfer."""
    if c:
        prof = chamfer2d(prof, c)
    dense = []
    for i, p0 in enumerate(prof):
        p1 = prof[(i + 1) % len(prof)]
        dense.append(p0)
        if p0[0] < 1e-9 and p1[0] < 1e-9:
            continue
        for k in range(1, int(math.ceil(math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / MAXE))):
            f = k / math.ceil(math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / MAXE)
            dense.append((p0[0] + (p1[0] - p0[0]) * f, p0[1] + (p1[1] - p0[1]) * f))
    prof = dense
    bm = bmesh.new()
    rings = []
    for r, y in prof:
        if r < 1e-9:
            rings.append([bm.verts.new((0.0, y, 0.0))])
        else:
            rings.append([bm.verts.new((r * math.sin(phase + 2 * math.pi * j / seg), y, r * math.cos(phase + 2 * math.pi * j / seg)))
                          for j in range(seg)])
    n = len(prof)
    for i in range(n):
        a, b = rings[i], rings[(i + 1) % n]
        if len(a) == 1 and len(b) == 1:
            continue
        for j in range(seg):
            k = (j + 1) % seg
            if len(a) == 1:
                bm.faces.new((a[0], b[j], b[k]))
            elif len(b) == 1:
                bm.faces.new((a[j], b[0], a[k]))
            else:
                bm.faces.new((a[j], a[k], b[k], b[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def rect_prof(r0, r1, y0, y1):
    return [(r0, y0), (r1, y0), (r1, y1), (r0, y1)]


def p_ball(r, seg=16, rings=6):
    prof = [(0.0, -r)] + [(r * math.sin(math.pi * i / rings), -r * math.cos(math.pi * i / rings)) for i in range(1, rings)] + [(0.0, r)]
    return p_lathe(prof, seg)


def p_strip(th, ylo, yhi, r_in, r_out, c=0.0):
    """Closed ring-sector solid over the angles `th` (radians from +Z towards +X), floor ylo[k], ceiling yhi[k] per column."""
    bm = bmesh.new()

    def V(r, t, y):
        return bm.verts.new((r * math.sin(t), y, r * math.cos(t)))
    OL = [V(r_out, t, y) for t, y in zip(th, ylo)]
    OH = [V(r_out, t, y) for t, y in zip(th, yhi)]
    IL = [V(r_in, t, y) for t, y in zip(th, ylo)]
    IH = [V(r_in, t, y) for t, y in zip(th, yhi)]
    n = len(th)
    for k in range(n - 1):
        j = k + 1
        bm.faces.new((OL[k], OL[j], OH[j], OH[k]))
        bm.faces.new((IL[k], IH[k], IH[j], IL[j]))
        bm.faces.new((OH[k], OH[j], IH[j], IH[k]))
        bm.faces.new((OL[k], IL[k], IL[j], OL[j]))
    bm.faces.new((OL[0], IL[0], IH[0], OH[0]))
    bm.faces.new((OL[n - 1], OH[n - 1], IH[n - 1], IL[n - 1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    subdiv(bm)
    if c:
        bevel_convex(bm, min(c, 0.4 * min(r_out - r_in, min(h - l for h, l in zip(yhi, ylo)))))
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=2e-4)
    return bm


def p_prism(pts, z0, z1, c=0.0):
    """Convex or simple polygon (x, y) extruded from z0 to z1."""
    bm = bmesh.new()
    f = [bm.verts.new((x, y, z1)) for x, y in pts]
    b = [bm.verts.new((x, y, z0)) for x, y in pts]
    bm.faces.new(f)
    bm.faces.new(b[::-1])
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((b[i], b[j], f[j], f[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.triangulate(bm, faces=[f_ for f_ in bm.faces if len(f_.verts) > 4])
    subdiv(bm)
    if c:
        bevel_convex(bm, min(c, 0.4 * abs(z1 - z0)))
    return bm


def p_ringx(outer, inner, z0, z1, c=0.0):
    """Frame: two loops of equal length (outer, inner) extruded from z0 to z1."""
    bm = bmesh.new()
    fo = [bm.verts.new((x, y, z1)) for x, y in outer]
    fi = [bm.verts.new((x, y, z1)) for x, y in inner]
    bo = [bm.verts.new((x, y, z0)) for x, y in outer]
    bi = [bm.verts.new((x, y, z0)) for x, y in inner]
    n = len(outer)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((fo[i], fo[j], fi[j], fi[i]))
        bm.faces.new((bo[i], bi[i], bi[j], bo[j]))
        bm.faces.new((bo[i], bo[j], fo[j], fo[i]))
        bm.faces.new((bi[i], fi[i], fi[j], bi[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    subdiv(bm)
    if c:
        bevel_convex(bm, c)
    return bm


def arch_pts(a, y0, ys, n=8, inset=0.0):
    """Round-headed opening outline, CCW: half width a, floor y0, springing line ys. Equal point count for any inset."""
    a2, y2 = a - inset, y0 + inset
    pts = [(-a2, y2), (a2, y2)]
    pts += [(a2 * math.cos(math.pi * i / n), ys + a2 * math.sin(math.pi * i / n)) for i in range(n + 1)]
    return pts


def cols(a0, a1, step):
    n = max(2, int(math.ceil(abs(a1 - a0) / step)))
    return [a0 + (a1 - a0) * i / n for i in range(n + 1)]


class Acc:
    """Collects closed pieces (with a library material each) into one mesh."""

    def __init__(self):
        self.bm = bmesh.new()
        self.mats: list[str] = []

    def add(self, piece, mat, M=None):
        if M is not None:
            xf(piece, M)
        bmesh.ops.recalc_face_normals(piece, faces=piece.faces)
        if mat not in self.mats:
            self.mats.append(mat)
        idx = self.mats.index(mat)
        vm = {v: self.bm.verts.new(v.co) for v in piece.verts}
        for f in piece.faces:
            nf = self.bm.faces.new([vm[v] for v in f.verts])
            nf.material_index = idx
        piece.free()


def _ftype(f):
    nz = abs(f.normal.y)
    return "wall" if nz < 0.15 else ("top" if nz > 0.97 else "cham")


def mark_shading(bm, sharp_deg=30.0):
    bm.normal_update()
    for f in bm.faces:
        f.smooth = True
    n = 0
    for e in bm.edges:
        if len(e.link_faces) != 2:
            continue
        crisp = e.calc_face_angle(0.0) >= math.radians(sharp_deg)
        e.smooth = not crisp
        n += crisp
    return n


def weighted_normals(obj):
    wu.select_only(obj)
    md = obj.modifiers.new("wn", "WEIGHTED_NORMAL")
    md.keep_sharp = True
    md.weight = 100
    md.mode = "FACE_AREA"
    bpy.ops.object.modifier_apply(modifier=md.name)


def to_object(acc: Acc, name: str, parent=None):
    """Acc -> mesh object in Blender space (metres), library proxy materials, weighted normals, metric UVs."""
    bm = acc.bm
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mark_shading(bm)
    bmesh.ops.transform(bm, matrix=TO_BLENDER, verts=bm.verts)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    n_tri = sum(len(f.verts) - 2 for f in bm.faces)
    bm.free()
    for m in acc.mats:
        me.materials.append(materials.make_proxy(m))
    obj = wu.link_object(name, me)
    if parent is not None:
        obj.parent = parent
    weighted_normals(obj)
    uvmetric.box_project(obj)
    wu.log(f"  {name}: {n_tri} tris, materials {acc.mats}")
    return obj


def finish(objs_acc, entry, extra_wu=None):
    """objs_acc = [(name, Acc), ...], first is the root. Returns the created objects (root first)."""
    out = []
    root = None
    for name, acc in objs_acc:
        o = to_object(acc, name, root)
        if root is None:
            root = o
            root["wu"] = dict(id=entry["id"], family=FAMILY, **(extra_wu or {}))
        out.append(o)
    return out


# ======================================================================================
# base: 9.5 cm drum, four arched panels, brass rings, stone floor, four feet
# ======================================================================================
R_BASE = 4.75


def build_base(entry, p):
    names = entry["meshes"]            # RingTop (root), RingBottom, Panel, Foot
    ring_top, ring_bot, panels, feet = Acc(), Acc(), Acc(), Acc()
    # brass top ring: tower platform (r 4.25) rests on it; y 3.0 to 3.5
    ring_top.add(p_lathe(rect_prof(3.8, R_BASE, 3.0, 3.5), 48, c=0.09), "Mat_AgedBrass")
    # brass bottom ring + stone floor disc
    ring_bot.add(p_lathe(rect_prof(3.5, R_BASE, 0.30, 1.0), 48, c=0.09), "Mat_AgedBrass")
    ring_bot.add(p_lathe([(0, 0.32), (3.56, 0.32), (3.56, 0.92), (0, 0.92)], 48, c=0.05), "Mat_Stone")
    # four teal panels, each an arched arcade bay: piers + sill + arched lintel as overlapping closed strips
    ri, ro, y0, y1 = 4.15, 4.62, 0.95, 3.05
    a, ys = 1.20, 1.55                                     # opening half width and springing line (arc top at 2.75)
    rm = 0.5 * (ri + ro)
    th_a = a / rm                                          # half angle of the opening
    half = math.radians(46.0)                              # each panel spans 92 degrees: 2 degrees overlap into its neighbours
    ov = math.radians(0.62)                                # lintel and sill reach this far into the piers
    for k in range(4):
        R = Matrix.Rotation(math.radians(90.0 * k), 4, "Y")
        for sgn in (-1, 1):                                # piers: full height, jamb 0.43 degrees past the lintel's end column
            t = [sgn * v for v in cols(th_a + math.radians(0.43), half, math.radians(2.37))]
            panels.add(p_strip(t, [y0] * len(t), [y1] * len(t), ri, ro, c=0.06), "Mat_TealPaint", R)
        sv = [-a + 2 * a * i / 16 for i in range(17)]          # arch columns: even steps in s, y = ys + sqrt(a^2 - s^2)
        t = [-th_a - ov] + [v / rm for v in sv] + [th_a + ov]
        yl = [ys] + [ys + math.sqrt(max(a * a - v * v, 0.0)) for v in sv] + [ys]
        panels.add(p_strip(t, yl, [y1] * len(t), ri, ro, c=0.06), "Mat_TealPaint", R)
        t2 = cols(-th_a - ov, th_a + ov, math.radians(5.0))
        panels.add(p_strip(t2, [y0] * len(t2), [1.20] * len(t2), ri, ro, c=0.04), "Mat_TealPaint", R)
    # four brass pilasters cover the panel seams
    for k in range(4):
        ang = math.radians(45.0 + 90.0 * k)
        panels.add(p_box(0.46, 2.12, 0.55, 0.05), "Mat_AgedBrass", mv(*at(ang, 2.0, 4.46)) @ Matrix.Rotation(ang, 4, "Y"))
    # four feet
    for k in range(4):
        ang = math.radians(45.0 + 90.0 * k)
        M = mv(3.6 * math.sin(ang), 0.17, 3.6 * math.cos(ang)) @ Matrix.Rotation(ang, 4, "Y")
        feet.add(p_box(0.9, 0.34, 0.9, 0.06), "Mat_Walnut", M)
    objs = finish([(names[0], ring_top), (names[1], ring_bot), (names[2], panels), (names[3], feet)], entry,
                  dict(footprintCm=9.5, interiorCm=8.3))
    root = objs[0]
    hx, hy = 0.0475, 0.0175
    col = empties.add_collider(root, "Case", "box", (hx, hy, hx), loc_g=(0, hy, 0))
    # proposals: blueprint sockets do not exist yet (G-12). Positions are in the base's own frame, metres.
    s1 = empties.add_socket(root, "BaseHandle", (0.0, 0.0175, 0.0475), ["machine_base_handle"], axis_g=(0, 0, 1))
    s2 = empties.add_socket(root, "Tower", (0.0, 0.035, 0.0), ["windmill_tower"], axis_g=(0, 1, 0))
    s3 = empties.add_socket(root, "Millstone", (0.0, 0.0155, 0.0), ["windmill_millstone"], axis_g=(0, 1, 0))
    return objs + [col, s1, s2, s3], dict(origin=("centre", "min", "centre"), closed=True)


# ======================================================================================
# tower: painted-wood frustum, stone plinth, balcony, door, windows, tiled teal roof, brass finial
# ======================================================================================
SLOPE = 0.0935
ALPHA = math.atan(SLOPE)


def rw(y):
    """Tower wall radius at height y (cm above the platform's floor face)."""
    return 3.35 - SLOPE * (y - 0.5)


def wall_M(theta, y):
    """Frame on the wall surface: x along the wall tangent (+theta), y up the wall slope, z out of the wall."""
    rh = Vector((math.sin(theta), 0, math.cos(theta)))
    th = Vector((math.cos(theta), 0, -math.sin(theta)))
    up = Vector((0, 1, 0))
    u = up * math.cos(ALPHA) - rh * math.sin(ALPHA)
    n = rh * math.cos(ALPHA) + up * math.sin(ALPHA)
    P = rh * rw(y) + Vector((0, y, 0))
    return Matrix(((th.x, u.x, n.x, P.x), (th.y, u.y, n.y, P.y), (th.z, u.z, n.z, P.z), (0, 0, 0, 1)))


def at(theta, y, r):
    return Vector((r * math.sin(theta), y, r * math.cos(theta)))


HUB_Y = 15.5          # rotor axis height above the tower floor (19.0 cm above the table)
ROTOR_Z = 4.7         # rotor plane in front of the tower axis (roof eave radius 3.4 + 1.3)


def build_tower(entry, p):
    (n_walls, n_slat, n_rail, n_plat, n_cap, n_frame, n_tiles, n_win, n_shut, n_door) = entry["meshes"]
    walls, slat, rail, plat, cap, frame, tiles, win, shut, door = (Acc() for _ in range(10))
    top = 11.3
    # ---- walls: cream painted frustum, stone plinth, walnut belt
    walls.add(p_lathe([(0, 0.45), (rw(0.45), 0.45), (rw(top), top), (0, top)], 32, c=0.07), "Mat_PaintedWood")
    walls.add(p_lathe([(0, 0.4), (rw(0.4) + 0.13, 0.4), (rw(1.4) + 0.13, 1.4), (0, 1.4)], 32, c=0.06), "Mat_Stone")
    walls.add(p_lathe(rect_prof(rw(11.0) - 0.15, rw(11.0) + 0.17, 10.8, 11.18), 32, c=0.05), "Mat_Walnut")
    walls.add(p_lathe(rect_prof(rw(5.4) - 0.15, rw(5.4) + 0.12, 5.3, 5.55), 32, c=0.04), "Mat_Walnut")
    # ---- slats: four walnut corner supports following the taper
    for s_ in (-1, 1):
        for f_ in (58.0, 122.0):
            th = math.radians(s_ * f_)
            p0, p1 = at(th, 1.2, rw(1.2) + 0.10), at(th, 10.7, rw(10.7) + 0.10)
            slat.add(beam(p0, p1, 0.38, 0.26, up=Vector((math.sin(th), 0, math.cos(th))), c=0.045), "Mat_Walnut")
    # ---- platform (balcony floor): walnut disc, brass inlay ring
    plat.add(p_lathe(rect_prof(0, 4.25, 0.0, 0.5), 48, c=0.11), "Mat_Walnut")
    plat.add(p_lathe(rect_prof(3.5, 3.64, 0.46, 0.54), 48), "Mat_AgedBrass")
    # ---- railing: four arc segments (door gap at the front), rails, balusters, posts, brass ball caps
    seg_half = math.radians(31.0)
    for k in range(4):
        tc = math.radians(45.0 + 90.0 * k)
        t = [tc + v for v in cols(-seg_half, seg_half, math.radians(5.2))]
        rail.add(p_strip(t, [1.55] * len(t), [1.68] * len(t), 3.88, 4.12, c=0.03), "Mat_Walnut")
        rail.add(p_strip(t, [0.62] * len(t), [0.74] * len(t), 3.88, 4.12, c=0.03), "Mat_Walnut")
        for i in range(1, 6):
            b = tc + seg_half * (-1 + 2 * i / 6)
            rail.add(p_box(0.09, 0.95, 0.09), "Mat_AgedBrass", mv(*at(b, 1.12, 4.0)) @ Matrix.Rotation(b, 4, "Y"))
        for sgn in (-1, 1):
            b = tc + sgn * (seg_half + math.radians(0.8))
            M = mv(*at(b, 1.09, 4.0)) @ Matrix.Rotation(b, 4, "Y")
            rail.add(p_box(0.30, 1.26, 0.30, 0.04), "Mat_Walnut", M)
            rail.add(p_ball(0.19, 12, 5), "Mat_AgedBrass", mv(*at(b, 1.79, 4.0)))
    # ---- roof frame: curb ring, eight posts, eight corbel struts under the eaves
    frame.add(p_lathe(rect_prof(2.05, 2.78, 11.25, 11.7), 32, c=0.07), "Mat_Walnut")
    for k in range(8):
        b = math.radians(22.5 + 45.0 * k)
        frame.add(p_box(0.28, 0.9, 0.28, 0.03), "Mat_Walnut", mv(*at(b, 12.0, 2.55)) @ Matrix.Rotation(b, 4, "Y"))
        t = math.radians(45.0 * k)
        frame.add(beam(at(t, 11.45, 2.35), at(t, 12.15, 3.05), 0.24, 0.24, up=(0, 1, 0), c=0.03), "Mat_Walnut")
    # ---- roof: seven stepped teal courses on a concave cone, solid
    R_e, lip, N = 3.25, 0.12, 7
    y_0, y_N = 12.05, 17.7
    ys = [y_0 + (y_N - y_0) * i / N for i in range(N + 1)]
    rs = [R_e * (1 - i / N) ** 1.3 for i in range(N + 1)]
    prof = [(0.0, 12.55), (R_e + lip, y_0 - 0.10), (R_e + lip, y_0 + 0.04)]
    for i in range(1, N):
        prof += [(rs[i], ys[i] - 0.10), (rs[i] + lip, ys[i] - 0.10), (rs[i] + lip, ys[i] + 0.04)]
    prof += [(0.30, y_N), (0.0, y_N)]
    tiles.add(p_lathe(prof, 32, c=0.035), "Mat_TealPaint")
    # ---- finial and rotor axle (RoofCap): brass
    cap.add(p_lathe(rect_prof(0, 0.55, 17.55, 17.88), 24, c=0.05), "Mat_AgedBrass")
    cap.add(p_ball(0.42, 20, 8), "Mat_PolishedBrass", mv(0, 18.2, 0))
    cap.add(p_lathe([(0, 18.42), (0.16, 18.5), (0.06, 19.25), (0.10, 19.35), (0.08, 19.46), (0, 19.5)], 16), "Mat_PolishedBrass")
    zs, ze = 0.7, ROTOR_Z - 0.9 + 0.05                    # axle runs from inside the roof to 0.05 into the rotor hub
    cap.add(p_lathe(rect_prof(0, 0.5, zs, ze), 20, c=0.05), "Mat_AgedBrass", mv(0, HUB_Y, 0) @ Y_TO_Z)
    cap.add(p_lathe(rect_prof(0, 0.85, 0.85, 1.32), 24, c=0.07), "Mat_AgedBrass", mv(0, HUB_Y, 0) @ Y_TO_Z)
    cap.add(p_lathe(rect_prof(0, 0.62, ROTOR_Z - 1.55, ROTOR_Z - 1.2), 24, c=0.05), "Mat_AgedBrass", mv(0, HUB_Y, 0) @ Y_TO_Z)
    # ---- door on the balcony: walnut arched frame, teal leaf, brass handle and strap hinges
    Md = wall_M(0.0, 0.55)
    door.add(p_ringx(arch_pts(0.88, 0, 2.1), arch_pts(0.88, 0, 2.1, inset=0.19), -0.16, 0.30, c=0.04), "Mat_Walnut", Md)
    door.add(p_prism(arch_pts(0.72, 0.10, 2.1), -0.13, 0.20), "Mat_TealPaint", Md)
    for sx in (-1, 1):
        door.add(p_box(0.07, 2.2, 0.05), "Mat_Walnut", Md @ mv(sx * 0.28, 1.15, 0.21))
    for yy in (0.6, 1.85):
        door.add(p_box(0.62, 0.11, 0.05, 0.015), "Mat_AgedBrass", Md @ mv(-0.30, yy, 0.22))
    door.add(p_ball(0.10, 12, 5), "Mat_PolishedBrass", Md @ mv(0.40, 1.15, 0.27))
    # ---- two arched windows with warm panes, mullions, sills; one louvred shutter beside each
    for sgn in (-1, 1):
        Mw = wall_M(sgn * math.radians(26.0), 6.15)
        win.add(p_ringx(arch_pts(0.64, 0, 1.25), arch_pts(0.64, 0, 1.25, inset=0.15), -0.12, 0.17, c=0.03), "Mat_Walnut", Mw)
        win.add(p_prism(arch_pts(0.52, 0.10, 1.25), -0.10, 0.03), "Mat_WarmEmissive", Mw)
        win.add(p_box(0.07, 1.55, 0.07), "Mat_Walnut", Mw @ mv(0, 0.95, 0.04))
        win.add(p_box(1.06, 0.07, 0.07), "Mat_Walnut", Mw @ mv(0, 0.85, 0.04))
        win.add(p_box(1.50, 0.14, 0.36, 0.03), "Mat_Walnut", Mw @ mv(0, -0.05, 0.05))
        Ms = wall_M(sgn * (math.radians(26.0) + 0.98 / rw(6.5)), 6.15)     # shutter on its own spot of the curved wall
        shut.add(p_box(0.50, 1.84, 0.12, 0.02), "Mat_Walnut", Ms @ mv(0, 0.98, 0.0))     # backing board
        for i in range(6):
            shut.add(p_box(0.44, 0.14, 0.09, 0.015), "Mat_Walnut", Ms @ mv(0, 0.28 + 0.285 * i, 0.10))   # louvre slats
        for yy in (0.10, 1.86):
            shut.add(p_box(0.52, 0.13, 0.11, 0.02), "Mat_Walnut", Ms @ mv(0, yy, 0.08))
    objs = finish([(n_walls, walls), (n_slat, slat), (n_rail, rail), (n_plat, plat), (n_cap, cap), (n_frame, frame),
                   (n_tiles, tiles), (n_win, win), (n_shut, shut), (n_door, door)], entry, dict(heightCm=19.5))
    root = objs[0]
    hx, hy = 0.0425, 0.0975
    col = empties.add_collider(root, "Case", "box", (hx, hy, hx), loc_g=(0, hy, 0))
    s1 = empties.add_socket(root, "Rotor", (0.0, HUB_Y / S, ROTOR_Z / S), ["windmill_sails"], axis_g=(0, 0, 1))
    return objs + [col, s1], dict(origin=("centre", "min", "centre"), closed=True)


# ======================================================================================
# sails: four lattice sails on a hub, axis +Z, plane at z = 0
# ======================================================================================
def build_sails(entry, p):
    n_blade, n_hub, n_cap = entry["meshes"]
    blade, hub, cap = Acc(), Acc(), Acc()
    for k in range(4):
        R = Matrix.Rotation(math.radians(90.0 * k), 4, "Z")
        # stock: walnut spar with a brass ferrule at the tip and a brass root bracket
        blade.add(beam((0, 0.8, 0), (0, 7.9, 0), 0.34, 0.30, up=(0, 0, 1), c=0.045), "Mat_Walnut", R)
        blade.add(beam((0, 7.6, 0), (0, 8.0, 0), 0.44, 0.40, up=(0, 0, 1), c=0.05), "Mat_AgedBrass", R)
        blade.add(p_box(0.52, 0.55, 0.48, 0.06), "Mat_AgedBrass", R @ mv(0, 1.32, 0))
        # sail frame: two long rails, two cross rails; panel x 0.25..2.15, y 2.0..7.5
        for x0, x1 in ((0.25, 0.50), (1.90, 2.15)):
            blade.add(beam((0.5 * (x0 + x1), 2.0, 0), (0.5 * (x0 + x1), 7.5, 0), x1 - x0, 0.24, up=(0, 0, 1), c=0.04), "Mat_Walnut", R)
        for yy in (2.125, 7.375):
            blade.add(beam((0.40, yy, 0), (2.0, yy, 0), 0.25, 0.22, up=(0, 0, 1), c=0.04), "Mat_Walnut", R)
        # lattice: two long and six cross bars in front of the canvas
        for x in (0.25 + 1.9 / 3, 0.25 + 2 * 1.9 / 3):
            blade.add(beam((x, 2.2, 0), (x, 7.3, 0), 0.12, 0.12, up=(0, 0, 1)), "Mat_Walnut", R)
        for i in range(6):
            yy = 2.25 + 5.0 * (i + 1) / 7
            blade.add(beam((0.47, yy, 0), (1.93, yy, 0), 0.12, 0.11, up=(0, 0, 1)), "Mat_Walnut", R)
        blade.add(p_box(1.70, 5.30, 0.045, 0.01), "Mat_Fabric", R @ mv(1.20, 4.75, -0.02))
    # hub (axis Z): walnut drum z -0.9..0.05, brass bands and boss
    hub.add(p_lathe(rect_prof(0, 1.15, -0.9, 0.05), 32, c=0.10), "Mat_Walnut", Y_TO_Z)
    hub.add(p_lathe(rect_prof(0, 1.24, -0.62, -0.30), 32, c=0.05), "Mat_AgedBrass", Y_TO_Z)
    hub.add(p_lathe(rect_prof(0, 0.98, -0.02, 0.22), 32, c=0.05), "Mat_AgedBrass", Y_TO_Z)
    # cap: polished brass dome, front of the rotor at z = +0.6
    prof = [(0.0, 0.0), (0.82, 0.0)] + [(0.82 * math.cos(math.pi / 2 * i / 6), 0.14 + 0.46 * math.sin(math.pi / 2 * i / 6)) for i in range(0, 6)] + [(0.0, 0.60)]
    cap.add(p_lathe(prof, 32), "Mat_PolishedBrass", Y_TO_Z)
    objs = finish([(n_blade, blade), (n_hub, hub), (n_cap, cap)], entry, dict(rotationAxis="+Z", sails=4))
    root = objs[0]
    col = empties.add_collider(root, "Grab", "sphere", 0.025)
    piv = empties.add_pivot(root, "Axis", (0, 0, 0), (0, 0, 1))
    return objs + [col, piv], dict(thin_axis_z=True, closed=True)


# ======================================================================================
# millstone: round stone with a furrowed face, brass eye bushing; axis +Z, face towards +Z
# ======================================================================================
def p_polar(rings, J):
    """Closed quad torus: `rings` is a cyclic list of (r, z_fn(phi)) rings, J points per ring."""
    bm = bmesh.new()
    vs = []
    for r, zf in rings:
        row = []
        for j in range(J):
            ph = 2 * math.pi * j / J
            row.append(bm.verts.new((r * math.cos(ph), r * math.sin(ph), zf(ph, r))))
        vs.append(row)
    n = len(rings)
    for i in range(n):
        a, b = vs[i], vs[(i + 1) % n]
        for j in range(J):
            k = (j + 1) % J
            bm.faces.new((a[j], a[k], b[k], b[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    subdiv(bm, 1.2)
    return bm


def build_millstone(entry, p):
    name = entry["meshes"][0]
    acc = Acc()
    R, T, c, r_eye = 2.5, 0.6, 0.10, 0.45
    J, GROOVES, D = 128, 16, 0.085
    zones = [(r_eye, 0.0), (0.85, 0.0), (1.15, 1.0), (1.5, 1.0), (1.85, 1.0), (2.15, 0.45), (R - c - 0.02, 0.0)]

    def top(env):
        def f(ph, r):
            v = max(0.0, math.cos(GROOVES * (ph - 0.115 * r)))          # skewed harp furrows
            return T - D * env * v * v
        return f
    rings = [(r, top(e)) for r, e in zones]
    rings += [(R, lambda ph, r: T - c), (R, lambda ph, r: -T + c), (R - c, lambda ph, r: -T), (r_eye, lambda ph, r: -T)]
    acc.add(p_polar(rings, J), "Mat_Stone")
    acc.add(p_lathe([(0.30, -0.58), (r_eye + 0.04, -0.58), (r_eye + 0.04, 0.58), (0.30, 0.58)], 24, c=0.03), "Mat_AgedBrass", Y_TO_Z)
    objs = finish([(name, acc)], entry, dict(rotationAxis="+Z", diameterCm=5.0))
    root = objs[0]
    col = empties.add_collider(root, "Grab", "sphere", 0.025)
    piv = empties.add_pivot(root, "Axis", (0, 0, 0), (0, 0, 1))
    return objs + [col, piv], dict(origin=("centre", "centre", "centre"), thin_axis_z=True, closed=True)


PARAMS = {"windmill_base": {}, "windmill_tower": {}, "windmill_sails": {}, "windmill_millstone": {}}
BUILDERS = {"windmill_base": build_base, "windmill_tower": build_tower, "windmill_sails": build_sails,
            "windmill_millstone": build_millstone}


def build(entry: dict, params: dict):
    wu.log(f"== {entry['id']}")
    return BUILDERS[entry["id"]](entry, params)


if __name__ == "__main__":
    raise SystemExit("gen_windmill.py is a forge family. Run blender/scripts/forge.py --family windmill --only <ids> --out-root <dir>")
