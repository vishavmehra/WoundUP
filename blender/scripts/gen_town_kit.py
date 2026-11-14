"""gen_town_kit.py - shared bmesh toolkit of the Tockton town generators (gen_tockton_environment, gen_bakery, gen_theatre).

Not a forge family: forge.py only loads the generator named by an entry. This module is imported by those generators.

Build space: centimetres, glTF axes (x right, y UP, z towards the viewer). Shapes are standalone closed bmesh shells; a Part
collects shells per material slot and turns them into ONE Blender mesh object (metres, Blender Z-up, transforms applied) that
follows the forge rules: library proxy materials only, crisp chamfers, smooth curved walls, weighted normals, metric UVs.

Shells overlap instead of welding: a Part is a kit-bash of closed solids (kit-bashing is how a miniature is built; the hidden
parts cost a few triangles). Boolean cuts are done per shell before it joins a Part, on single-material shells, so a reveal
face always takes the wall's material.
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
from lib import materials, uvmetric

CM = 0.01
TO_BLENDER = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1))) @ Matrix.Scale(CM, 4)   # (x,y,z)cm -> (x,-z,y) m


# ======================================================================================
# transforms
# ======================================================================================
def T(x=0.0, y=0.0, z=0.0):
    return Matrix.Translation((x, y, z))


def Ry(deg):
    return Matrix.Rotation(math.radians(deg), 4, "Y")


def Rx(deg):
    return Matrix.Rotation(math.radians(deg), 4, "X")


def Rz(deg):
    return Matrix.Rotation(math.radians(deg), 4, "Z")


def xf(bm, *mats):
    """Apply matrices left to right (xf(bm, A, B) = B @ A applied to the points)."""
    m = Matrix.Identity(4)
    for a in mats:
        m = a @ m
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    return bm


# ======================================================================================
# shells (standalone closed bmeshes)
# ======================================================================================
def _finish_shell(bm):
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def bevel_edges(bm, width, edges=None, min_angle=30.0, segments=1):
    """Chamfer (or round, segments > 1) convex hard edges; `edges` restricts the selection to a list."""
    sel = []
    for e in (edges if edges is not None else bm.edges):
        if not e.is_manifold or not e.is_convex:
            continue
        if edges is None and e.calc_face_angle(0.0) < math.radians(min_angle):
            continue
        sel.append(e)
    if sel and width > 0:
        bmesh.ops.bevel(bm, geom=sel, offset=width, offset_type="OFFSET", segments=segments, profile=0.5,
                        affect="EDGES", clamp_overlap=True, loop_slide=True)
    return bm


def box(c, s, bev=0.0, segs=1, top_only=False, bottom=True):
    """Axis-aligned box at centre c = (x, y, z), size s = (sx, sy, sz). bev: chamfer of its edges; top_only: only the top ring."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * s[0], v.co.y * s[1], v.co.z * s[2]))
    if bev > 0:
        if top_only:
            ymax = s[1] / 2 - 1e-6
            edges = [e for e in bm.edges if all(v.co.y > ymax for v in e.verts)]
            bevel_edges(bm, bev, edges, segments=segs)
        else:
            bevel_edges(bm, bev, None, min_angle=10.0, segments=segs)
    xf(bm, T(*c))
    return _finish_shell(bm)


def _pt(plane, u, v, a):
    return {"xz": (u, a, v), "xy": (u, v, a), "zy": (a, v, u)}[plane]


def _dedupe(pts):
    out = []
    for p in pts:
        if not out or math.hypot(p[0] - out[-1][0], p[1] - out[-1][1]) > 1e-6:
            out.append((float(p[0]), float(p[1])))
    if len(out) > 1 and math.hypot(out[0][0] - out[-1][0], out[0][1] - out[-1][1]) < 1e-6:
        out.pop()
    return out


def prism(pts, plane, a0, a1, bev=0.0, segs=1, min_angle=30.0, top_only=False):
    """Closed prism: the 2D polygon `pts` in `plane` ('xz' extrudes along y, 'xy' along z, 'zy' along x) from a0 to a1.
    top_only (plane 'xz' only): chamfer just the ring of edges at the top (y = a1), the way a paver or a block is laid."""
    pts = _dedupe(pts)
    bm = bmesh.new()
    lo = [bm.verts.new(_pt(plane, u, v, a0)) for u, v in pts]
    hi = [bm.verts.new(_pt(plane, u, v, a1)) for u, v in pts]
    n = len(pts)
    bm.faces.new(lo)
    bm.faces.new(hi)
    for i in range(n):
        bm.faces.new([lo[i], lo[(i + 1) % n], hi[(i + 1) % n], hi[i]])
    _finish_shell(bm)
    if bev > 0:
        if top_only:
            top = [e for e in bm.edges if all(abs(v.co.y - a1) < 1e-6 for v in e.verts)]
            bevel_edges(bm, bev, top, segments=segs)
        else:
            bevel_edges(bm, bev, None, min_angle=min_angle, segments=segs)
    return bm


def lathe(prof, n=16, c=(0.0, 0.0, 0.0), phase=0.0):
    """Solid of revolution about the y axis through c. prof = [(r, y)...] bottom to top, first and last on the axis (r = 0) for a
    closed solid, or any r > 0 end (then it must be capped by the caller); r == 0 points become single vertices."""
    bm = bmesh.new()
    rings = []
    for r, y in prof:
        if r < 1e-9:
            rings.append([bm.verts.new((0.0, y, 0.0))])
        else:
            rings.append([bm.verts.new((r * math.cos(phase + 2 * math.pi * j / n), y, r * math.sin(phase + 2 * math.pi * j / n)))
                          for j in range(n)])
    for i in range(len(prof) - 1):
        a, b = rings[i], rings[i + 1]
        for j in range(n):
            j2 = (j + 1) % n
            if len(a) == 1 and len(b) == 1:
                continue
            if len(a) == 1:
                bm.faces.new([a[0], b[j2], b[j]])
            elif len(b) == 1:
                bm.faces.new([a[j], a[j2], b[0]])
            else:
                bm.faces.new([a[j], a[j2], b[j2], b[j]])
    _finish_shell(bm)
    xf(bm, T(*c))
    return bm


def cylinder(c, r, h, n=16, axis="y", bev=0.0, r_top=None):
    """Cylinder (or frustum when r_top is given) centred at c, along `axis` ('x', 'y' or 'z')."""
    rt = r if r_top is None else r_top
    bm = lathe([(0.0, -h / 2), (r, -h / 2), (rt, h / 2), (0.0, h / 2)], n)
    if bev > 0:
        bevel_edges(bm, bev, None, min_angle=40.0)
    if axis == "x":
        xf(bm, Rz(-90))
    elif axis == "z":
        xf(bm, Rx(90))
    xf(bm, T(*c))
    return bm


def ellipsoid(c, radii, nu=12, nv=8):
    """UV ellipsoid (poles on y)."""
    prof = [(0.0, -1.0)]
    for i in range(1, nv):
        a = -math.pi / 2 + math.pi * i / nv
        prof.append((math.cos(a), math.sin(a)))
    prof.append((0.0, 1.0))
    bm = lathe(prof, nu)
    for v in bm.verts:
        v.co = Vector((v.co.x * radii[0], v.co.y * radii[1], v.co.z * radii[2]))
    xf(bm, T(*c))
    return bm


def arch_pts(x0, x1, y_spring, rise, n=10):
    """Points of a segmental arch from (x0, y_spring) over the top to (x1, y_spring), apex y_spring + rise. Includes both ends."""
    half = (x1 - x0) / 2.0
    xm = (x0 + x1) / 2.0
    if rise <= 1e-6:
        return [(x0, y_spring), (x1, y_spring)]
    R = (half * half + rise * rise) / (2 * rise)
    cy = y_spring + rise - R
    a0 = math.atan2(y_spring - cy, x0 - xm)
    a1 = math.atan2(y_spring - cy, x1 - xm)
    return [(xm + R * math.cos(a0 + (a1 - a0) * i / n), cy + R * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]


def opening(x0, x1, y0, y_spring, rise, n=10):
    """Closed polygon (xy plane): a rectangle from y0 to y_spring with a segmental arch on top (rise 0 = flat)."""
    return [(x0, y0), (x1, y0)] + arch_pts(x1, x0, y_spring, rise, n)[:]


def rounded_rect(hx, hz, r, n=6):
    """Rounded rectangle polygon (xz plane) of half sizes hx, hz and corner radius r, CCW."""
    pts = []
    for cx, cz, a0 in ((hx - r, hz - r, 0), (-hx + r, hz - r, 90), (-hx + r, -hz + r, 180), (hx - r, -hz + r, 270)):
        for i in range(n + 1):
            a = math.radians(a0 + 90 * i / n)
            pts.append((cx + r * math.cos(a), cz + r * math.sin(a)))
    return pts


def circle_pts(r, n=24, phase=0.0):
    return [(r * math.cos(phase + 2 * math.pi * i / n), r * math.sin(phase + 2 * math.pi * i / n)) for i in range(n)]


# ======================================================================================
# boolean
# ======================================================================================
def boolean(bm_a, cutters, op="DIFFERENCE", self_overlap=True):
    """Boolean `op` of shell A with each cutter shell (exact solver). Single-material shells only (all faces index 0)."""
    me = bpy.data.meshes.new("_tk_a")
    bm_a.to_mesh(me)
    dummy = bpy.data.materials.new("_tk_dummy")
    me.materials.append(dummy)
    body = wu.link_object("_tk_a", me)
    for b in cutters:
        mb = bpy.data.meshes.new("_tk_b")
        b.to_mesh(mb)
        mb.materials.append(dummy)
        ob = wu.link_object("_tk_b", mb)
        wu.select_only(body)
        md = body.modifiers.new("bool", "BOOLEAN")
        md.operation, md.solver, md.operand_type, md.object = op, "EXACT", "OBJECT", ob
        md.use_self = self_overlap
        bpy.ops.object.modifier_apply(modifier=md.name)
        bpy.data.objects.remove(ob)
        bpy.data.meshes.remove(mb)
    out = bmesh.new()
    out.from_mesh(body.data)
    me = body.data
    bpy.data.objects.remove(body)
    bpy.data.meshes.remove(me)
    bpy.data.materials.remove(dummy)
    bmesh.ops.remove_doubles(out, verts=out.verts, dist=1e-4)
    out.normal_update()                        # ear clipping projects along the stored face normal: it must be current
    ng = [f for f in out.faces if len(f.verts) > 4]
    if ng:
        bmesh.ops.triangulate(out, faces=ng, quad_method="BEAUTY", ngon_method="EAR_CLIP")
    bmesh.ops.dissolve_degenerate(out, dist=1e-4, edges=out.edges)
    return out


def merge_cutters(shells):
    """Join several standalone shells into ONE bmesh (a single operand for the boolean; they may overlap, use_self handles it)."""
    out = bmesh.new()
    for s in shells:
        copy_into(out, s)
    return out


def copy_into(dst, src, mi=0):
    """Append the faces of `src` to `dst`. mi: the material slot for all of them, or None to keep each face's own index."""
    vmap = {v: dst.verts.new(v.co) for v in src.verts}
    n = 0
    for f in src.faces:
        try:
            nf = dst.faces.new([vmap[v] for v in f.verts])
        except ValueError:                     # duplicate face (two shells welded by distance): skip
            continue
        nf.material_index = f.material_index if mi is None else mi
        nf.smooth = f.smooth
        n += 1
    return n


def open_edges(bm):
    return sum(1 for e in bm.edges if len(e.link_faces) != 2)


def grid_subdivide(bm, max_len=1.5, min_area=0.8, rounds=4, axis=None):
    """Cut the big flat faces into a grid of about max_len cm. The AO bake is per vertex: a wall whose only vertices sit under a
    timber frame or a roof edge would bake dark across its whole face. Only faces over min_area cm2 are touched, so bevel strips
    and small parts keep their cheap topology. axis (0 x, 1 y, 2 z): only faces facing along that axis. Faces with more than 6 vertices (arch caps, outlines) are left alone: a grid fill does not suit them."""
    for _ in range(rounds):
        bm.normal_update()
        edges = {e for f in bm.faces if f.calc_area() > min_area and len(f.verts) <= 6 and (axis is None or abs(f.normal[axis]) > 0.9)
                 for e in f.edges if e.calc_length() > max_len}
        if not edges:
            break
        bmesh.ops.subdivide_edges(bm, edges=list(edges), cuts=1, use_grid_fill=True)
    bm.normal_update()
    ng = [f for f in bm.faces if len(f.verts) > 4]
    if ng:
        bmesh.ops.triangulate(bm, faces=ng, quad_method="BEAUTY", ngon_method="EAR_CLIP")
    bmesh.ops.dissolve_degenerate(bm, dist=1e-4, edges=bm.edges)
    return bm


# ======================================================================================
# Part: one Blender mesh object from many shells
# ======================================================================================
def mark_shading(bm, crisp_deg=28.0):
    bm.normal_update()
    for f in bm.faces:
        f.smooth = True
    sharp = 0
    for e in bm.edges:
        if len(e.link_faces) != 2:
            continue
        crisp = e.calc_face_angle(0.0) >= math.radians(crisp_deg)
        e.smooth = not crisp
        sharp += crisp
    return sharp


def apply_weighted_normals(obj):
    wu.select_only(obj)
    md = obj.modifiers.new("wn", "WEIGHTED_NORMAL")
    md.keep_sharp = True
    md.weight = 100
    md.mode = "FACE_AREA"
    bpy.ops.object.modifier_apply(modifier=md.name)


class Part:
    """Collector for the shells of one mesh node. mats: the library material names this node may use."""

    def __init__(self, name, mats):
        self.name, self.mats, self.bm = name, list(mats), bmesh.new()

    def add(self, shell, mat=None):
        """Append a shell. mat None: keep the shell's own per-face material indices (they index self.mats)."""
        copy_into(self.bm, shell, None if mat is None else self.mats.index(mat))
        shell.free()
        return self

    def add_all(self, shells, mat):
        for s in shells:
            self.add(s, mat)
        return self

    def stats(self):
        return dict(faces=len(self.bm.faces), open_edges=open_edges(self.bm))

    def to_object(self, crisp_deg=28.0):
        bm = self.bm
        bm.normal_update()                     # ear clipping projects along the stored face normal: it must be current
        ng = [f for f in bm.faces if len(f.verts) > 4]
        if ng:
            bmesh.ops.triangulate(bm, faces=ng, quad_method="BEAUTY", ngon_method="EAR_CLIP")
        mark_shading(bm, crisp_deg)
        used = sorted({f.material_index for f in bm.faces})
        slot = {u: i for i, u in enumerate(used)}
        for f in bm.faces:
            f.material_index = slot[f.material_index]
        bmesh.ops.transform(bm, matrix=TO_BLENDER, verts=bm.verts)
        me = bpy.data.meshes.new(self.name)
        bm.to_mesh(me)
        bm.free()
        for u in used:
            me.materials.append(materials.make_proxy(self.mats[u]))
        obj = wu.link_object(self.name, me)
        apply_weighted_normals(obj)
        uvmetric.box_project(obj)
        return obj


def to_m(p):
    """cm (x, y, z) -> metres, for the empties helpers."""
    return tuple(float(v) * CM for v in p)
