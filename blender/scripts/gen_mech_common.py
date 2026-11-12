"""gen_mech_common.py - the small bmesh toolkit shared by the Mechanical-library generators (shaft, spring, bevel gear,
structural parts, governor, winding key). Not a generator itself: forge.py never loads it, the gen_*.py files import it.

Authoring space is MILLIMETRES (1 unit = 1 mm) in glTF model space: rotation / long axis = +Z, +Y up. That keeps a 0.45 mm
chamfer at 0.45 units, far above Blender's merge tolerances (the gear generator uses 1 unit = 1 cm for the same reason).
`make_object` then rotates the mesh into Blender space (x, y, z) -> (x, -z, y), scales it to metres and bakes the finish
exactly as gen_gear_spur does (weighted normals, crisp chamfers, metric box UVs, one proxy material per slot).
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

MM = 0.001


# ======================================================================================
# primitives (all write into a bmesh and return the new verts)
# ======================================================================================
def lathe(bm, loop, nseg=24, phase=0.0, center=(0.0, 0.0)):
    """Solid of revolution about +Z. `loop` is a CLOSED (r, z) outline; a point with r ~ 0 collapses onto the axis (a fan),
    so a solid cylinder starts and ends on the axis and a bored part is a loop that never touches it."""
    cx, cy = center
    rings = []
    new = []
    for r, z in loop:
        if r < 1e-9:
            v = bm.verts.new((cx, cy, z))
            rings.append(v)
            new.append(v)
        else:
            ring = [bm.verts.new((cx + r * math.cos(phase + 2 * math.pi * k / nseg), cy + r * math.sin(phase + 2 * math.pi * k / nseg), z))
                    for k in range(nseg)]
            rings.append(ring)
            new += ring
    n = len(loop)
    for i in range(n):
        a, b = rings[i], rings[(i + 1) % n]
        a_ax, b_ax = isinstance(a, bmesh.types.BMVert), isinstance(b, bmesh.types.BMVert)
        if a_ax and b_ax:
            continue
        for k in range(nseg):
            k2 = (k + 1) % nseg
            if a_ax:
                bm.faces.new((a, b[k], b[k2]))
            elif b_ax:
                bm.faces.new((a[k2], a[k], b))
            else:
                bm.faces.new((a[k], a[k2], b[k2], b[k]))
    return new


def sphere(bm, c, r, nseg=12, nrings=6):
    """UV sphere (poles on +Z) centred at c."""
    loop = [(0.0, r)] + [(r * math.sin(math.pi * i / nrings), r * math.cos(math.pi * i / nrings)) for i in range(1, nrings)] + [(0.0, -r)]
    v = lathe(bm, loop, nseg)
    place(bm, v, c)
    return v


def prism(bm, poly, z0, z1):
    """Extrude a simple polygon [(x, y)...] between z0 and z1. Caps are n-gons (triangulated by `clean`)."""
    lo = [bm.verts.new((x, y, z0)) for x, y in poly]
    hi = [bm.verts.new((x, y, z1)) for x, y in poly]
    n = len(poly)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    cap_tris(bm, poly, lo, hi)
    return lo + hi


def cap_tris(bm, poly, lo, hi):
    """Triangulate a planar outline with the robust tessellator (EAR_CLIP on an n-gon mis-fills concave outlines) and cap both
    ends: hi counter-clockwise (normal +z), lo clockwise."""
    from mathutils import geometry
    tris = geometry.tessellate_polygon([[Vector((x, y, 0.0)) for x, y in poly]])
    for a, b, c in tris:
        ar = (poly[b][0] - poly[a][0]) * (poly[c][1] - poly[a][1]) - (poly[b][1] - poly[a][1]) * (poly[c][0] - poly[a][0])
        if ar < 0:
            b, c = c, b
        bm.faces.new((hi[a], hi[b], hi[c]))
        bm.faces.new((lo[a], lo[c], lo[b]))


def loft(bm, rings):
    """Loft closed planar rings [(poly_xy, z), ...] with the same vertex count: quad bands, n-gon caps."""
    vs = [[bm.verts.new((x, y, z)) for x, y in poly] for poly, z in rings]
    n = len(vs[0])
    for a, b in zip(vs[:-1], vs[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    cap_tris(bm, rings[0][0], vs[-1], vs[0])                 # the rings share one outline; the caps follow its winding
    return [v for r in vs for v in r]


def stadium(cx, y0, y1, r, off=0.0, n=10):
    """Slot outline: two semicircles of radius r + off centred (cx, y0) and (cx, y1), y0 < y1, counter-clockwise."""
    rr = r + off
    top = [(cx + rr * math.cos(math.pi * i / n), y1 + rr * math.sin(math.pi * i / n)) for i in range(n + 1)]
    bot = [(cx + rr * math.cos(math.pi + math.pi * i / n), y0 + rr * math.sin(math.pi + math.pi * i / n)) for i in range(n + 1)]
    return top + bot


def box(bm, lo, hi, bevel=0.0, segments=1):
    """Axis-aligned box from lo to hi, with every edge chamfered by `bevel`."""
    ret = bmesh.ops.create_cube(bm, size=1.0)
    verts = ret["verts"]
    lo, hi = Vector(lo), Vector(hi)
    c, d = (lo + hi) / 2, hi - lo
    for v in verts:
        v.co = Vector((c.x + v.co.x * d.x, c.y + v.co.y * d.y, c.z + v.co.z * d.z))
    if bevel > 0:
        edges = list({e for v in verts for e in v.link_edges})
        bmesh.ops.bevel(bm, geom=edges, offset=bevel, offset_type="OFFSET", segments=segments, profile=0.5, affect="EDGES",
                        clamp_overlap=True, loop_slide=True)
    return verts


def bar(bm, p0, p1, r, nseg=6):
    """Round bar between two points (flat ends)."""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    v = lathe(bm, [(0.0, 0.0), (r, 0.0), (r, d.length), (0.0, d.length)], nseg)
    place(bm, v, p0, d)
    return v


def sweep(bm, path, normal, section, closed=False):
    """Sweep a planar section along a planar path. path: [Vector]; normal: the plane normal; section: [(a, b)] or
    callable(i) -> [(a, b)], a along the in-plane left-hand normal u = T x n (outward for a counter-clockwise path), b along n.
    Returns the rings. Open sweeps are capped with n-gons."""
    n = Vector(normal).normalized()
    pts = [Vector(p) for p in path]
    N = len(pts)
    rings = []
    for i in range(N):
        a_ = pts[(i + 1) % N] if (closed or i < N - 1) else pts[i]
        b_ = pts[(i - 1) % N] if (closed or i > 0) else pts[i]
        t = (a_ - b_).normalized()
        u = t.cross(n).normalized()
        sec = section(i) if callable(section) else section
        rings.append([bm.verts.new(pts[i] + u * a + n * b) for a, b in sec])
    m = len(rings[0])
    last = N if closed else N - 1
    for i in range(last):
        r0, r1 = rings[i], rings[(i + 1) % N]
        for k in range(m):
            k2 = (k + 1) % m
            bm.faces.new((r0[k], r0[k2], r1[k2], r1[k]))
    if not closed:
        bm.faces.new(rings[0][::-1])
        bm.faces.new(rings[-1])
    return rings


def place(bm, verts, loc=(0.0, 0.0, 0.0), z_to=(0.0, 0.0, 1.0)):
    """Rotate a shape built about +Z so +Z points along z_to, then move it to loc."""
    q = Vector((0.0, 0.0, 1.0)).rotation_difference(Vector(z_to).normalized())
    M = Matrix.Translation(Vector(loc)) @ q.to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=M, verts=list(verts))


def hex_head(bm, c, z_to, r, h, spin=0.0):
    """Six-sided bolt head standing on a surface at c (r = circumradius, h = height); bottom sunk 0.3 mm into the body."""
    v = lathe(bm, [(0.0, -0.3), (r, -0.3), (r, h - 0.25), (r - 0.25, h), (0.0, h)], 6, phase=spin)
    place(bm, v, c, z_to)
    return v


# ======================================================================================
# combine, clean, shade, finish
# ======================================================================================
def boolean(bm, tools, op="DIFFERENCE"):
    """Apply each bmesh in `tools` to `bm` with the EXACT boolean solver. Consumes bm and the tools; returns a new bmesh."""
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)                 # the exact solver needs outward, consistent operands
    me = bpy.data.meshes.new("_b_body")
    bm.to_mesh(me)
    bm.free()
    body = wu.link_object("_b_body", me)
    for i, t in enumerate(tools):
        mt = bpy.data.meshes.new(f"_b_tool{i}")
        bmesh.ops.recalc_face_normals(t, faces=t.faces)
        t.to_mesh(mt)
        t.free()
        tool = wu.link_object(f"_b_tool{i}", mt)
        wu.select_only(body)
        md = body.modifiers.new("b", "BOOLEAN")
        md.operation = op
        md.solver = "EXACT"
        md.operand_type = "OBJECT"
        md.object = tool
        bpy.ops.object.modifier_apply(modifier=md.name)
        bpy.data.objects.remove(tool)
        bpy.data.meshes.remove(mt)
    out = bmesh.new()
    out.from_mesh(body.data)
    mesh = body.data
    bpy.data.objects.remove(body)
    bpy.data.meshes.remove(mesh)
    return out


def bevel_hard(bm, width, min_angle_deg=60.0, segments=1):
    """Chamfer the convex hard edges (same rule as the gear generator)."""
    bm.edges.ensure_lookup_table()
    sel = [e for e in bm.edges if e.is_manifold and e.is_convex and e.calc_face_angle(0.0) >= math.radians(min_angle_deg)]
    if sel:
        bmesh.ops.bevel(bm, geom=sel, offset=width, offset_type="OFFSET", segments=segments, profile=0.5, affect="EDGES",
                        clamp_overlap=True, loop_slide=True)
    return len(sel)


def clean(bm):
    """Triangulate the n-gons the booleans and caps leave, drop degenerate bits, merge doubles, orient outward."""
    ng = [f for f in bm.faces if len(f.verts) > 4]
    if ng:
        bmesh.ops.triangulate(bm, faces=ng, quad_method="BEAUTY", ngon_method="EAR_CLIP")
    bmesh.ops.dissolve_degenerate(bm, dist=1e-4, edges=bm.edges)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)


def shade(bm, crisp_deg=40.0):
    """Smooth the curved walls, keep chamfers and flats crisp (weighted normals then use the sharp edges)."""
    bm.normal_update()
    thr = math.radians(crisp_deg)
    for f in bm.faces:
        f.smooth = True
    n = 0
    for e in bm.edges:
        if len(e.link_faces) == 2:
            e.smooth = e.calc_face_angle(0.0) < thr
            n += not e.smooth
    return n


def snapshot(bm):
    """Set of the faces that exist now; pair with tag_new to give the faces built afterwards a material slot."""
    return set(bm.faces)


def tag_new(bm, before, slot):
    for f in bm.faces:
        if f not in before:
            f.material_index = slot


def to_mesh(bm, name):
    """bmesh (mm, model space) -> Blender mesh (metres, Blender space)."""
    clean(bm)
    n_sharp = shade(bm)
    M = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1))) @ Matrix.Scale(MM, 4)
    bmesh.ops.transform(bm, matrix=M, verts=bm.verts)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return me, n_sharp


def apply_weighted_normals(obj):
    wu.select_only(obj)
    md = obj.modifiers.new("wn", "WEIGHTED_NORMAL")
    md.keep_sharp = True
    md.weight = 100
    md.mode = "FACE_AREA"
    bpy.ops.object.modifier_apply(modifier=md.name)


def make_object(bm, name, mats, parent=None):
    """Finish a bmesh into a linked mesh object with proxy materials (slot i = mats[i]) and metric UVs."""
    me, n_sharp = to_mesh(bm, name)
    obj = wu.link_object(name, me)
    apply_weighted_normals(obj)
    obj.data.materials.clear()
    for m in mats:
        obj.data.materials.append(materials.make_proxy(m))
    uvmetric.box_project(obj)
    if parent is not None:
        obj.parent = parent
    wu.log(f"{name}: {len(me.polygons)} faces, sharp edges {n_sharp}")
    return obj
