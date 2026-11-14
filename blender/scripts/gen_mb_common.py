"""gen_mb_common.py - shared geometry builder of the Music Box generators (gen_music_box_case, gen_cylinder, gen_comb).

Not a forge family, never run directly. Imported by the three generators of the Machines agent.

Everything is modelled in CENTIMETRES in glTF axes (x right, y up, z towards the viewer), because a bevel of 0.5 mm then sits far
above Blender's merge tolerances (BLENDER_PRODUCTION_GUIDELINES 6.3). finish() rotates the result into Blender space (x, y, z) ->
(x, -z, y), scales it to metres and gives it its material slots, weighted normals and metric box-projected UVs, exactly as the gear
generator does. A Builder collects CLOSED shells (boxes, lathes, lofts, prisms, tubes) into one bmesh; shells may overlap (a brass
band sits proud of a walnut wall), but they never share a vertex, so mesh_qa reports no duplicate vertices.
"""
from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bmesh
import bpy
from mathutils import Matrix, Vector

import wu_common as wu
from lib import materials, uvmetric

S = 100.0                                                         # build scale: 1 unit = 1 cm


def T(loc=(0.0, 0.0, 0.0), rot=(0.0, 0.0, 0.0), scale=(1.0, 1.0, 1.0)) -> Matrix:
    """Translate . rotate (degrees, XYZ) . scale."""
    m = Matrix.Translation(loc)
    m = m @ Matrix.Rotation(math.radians(rot[2]), 4, "Z") @ Matrix.Rotation(math.radians(rot[1]), 4, "Y") @ Matrix.Rotation(math.radians(rot[0]), 4, "X")
    return m @ Matrix.Diagonal((scale[0], scale[1], scale[2], 1.0))


def P3(plane: str, u: float, v: float, h: float):
    """2D (u, v) plus a height h along the plane normal -> 3D point. 'xz': h is y; 'xy': h is z; 'zy': h is x."""
    if plane == "xz":
        return (u, h, v)
    if plane == "xy":
        return (u, v, h)
    if plane == "zy":
        return (h, v, u)
    raise ValueError(plane)


def rrect(w, d, r, nx=8, nz=4, nc=3, cx=0.0, cz=0.0):
    """Counter-clockwise rounded rectangle loop (u = x, v = z) with a CONSTANT vertex count 4*(nc+1) + 2*nx + 2*nz, whatever w, d, r:
    rings of different size therefore loft index to index. nz points run along the two sides at x = +-w/2, nx along z = +-d/2."""
    r = max(0.02, min(r, w / 2 - 1e-3, d / 2 - 1e-3))
    hx, hz = w / 2 - r, d / 2 - r
    corners = [(hx, -hz, -90.0), (hx, hz, 0.0), (-hx, hz, 90.0), (-hx, -hz, 180.0)]
    pts = []
    for k, (ax, az, a0) in enumerate(corners):
        for i in range(nc + 1):
            a = math.radians(a0 + 90.0 * i / nc)
            pts.append((cx + ax + r * math.cos(a), cz + az + r * math.sin(a)))
        nxt = corners[(k + 1) % 4]
        a1 = math.radians(nxt[2])
        p0 = pts[-1]
        p1 = (cx + nxt[0] + r * math.cos(a1), cz + nxt[1] + r * math.sin(a1))
        n = nz if k % 2 == 0 else nx
        for i in range(1, n + 1):
            t = i / (n + 1)
            pts.append((p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t))
    return pts


def offset_polyline(pts, d):
    """Offset an OPEN 2D polyline by d to its left (mitred). Left of the travel direction (dx, dy) is (-dy, dx)."""
    n = len(pts)
    segs = []
    for i in range(n - 1):
        dx, dy = pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]
        l = math.hypot(dx, dy)
        segs.append((-dy / l, dx / l))
    out = []
    for i in range(n):
        a = segs[max(i - 1, 0)]
        b = segs[min(i, n - 2)]
        mx, my = a[0] + b[0], a[1] + b[1]
        ml = math.hypot(mx, my)
        mx, my = mx / ml, my / ml
        k = 1.0 / max(0.35, mx * a[0] + my * a[1])
        out.append((pts[i][0] + mx * d * k, pts[i][1] + my * d * k))
    return out


def offset_closed(pts, d):
    """Offset a CLOSED 2D polygon by d (d > 0 grows it), mitred, whatever its orientation."""
    n = len(pts)
    area = sum(pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1] for i in range(n))
    sgn = 1.0 if area > 0 else -1.0                                   # CCW: outward normal is (dy, -dx)
    segs = []
    for i in range(n):
        dx, dy = pts[(i + 1) % n][0] - pts[i][0], pts[(i + 1) % n][1] - pts[i][1]
        l = math.hypot(dx, dy)
        segs.append((sgn * dy / l, -sgn * dx / l))
    out = []
    for i in range(n):
        a, b = segs[i - 1], segs[i]
        mx, my = a[0] + b[0], a[1] + b[1]
        ml = math.hypot(mx, my)
        mx, my = mx / ml, my / ml
        k = 1.0 / max(0.35, mx * a[0] + my * a[1])
        out.append((pts[i][0] + mx * d * k, pts[i][1] + my * d * k))
    return out


def bevel_edges(bm, width, seg=2, min_angle=35.0):
    """Round/chamfer the convex hard edges (face angle >= min_angle) of a temporary bmesh."""
    bm.edges.ensure_lookup_table()
    sel = [e for e in bm.edges if e.is_manifold and e.is_convex and e.calc_face_angle(0.0) >= math.radians(min_angle)]
    if sel and width > 0:
        bmesh.ops.bevel(bm, geom=sel, offset=width, offset_type="OFFSET", segments=seg, profile=0.5, affect="EDGES",
                        clamp_overlap=True, loop_slide=True)
    return len(sel)


class Builder:
    """Collects closed shells into one bmesh (cm, glTF axes) with one material slot per distinct library name."""

    def __init__(self):
        self.bm = bmesh.new()
        self.slots: list[str] = []
        self.shells = 0

    def slot(self, name: str) -> int:
        if name not in self.slots:
            self.slots.append(name)
        return self.slots.index(name)

    def _merge(self, src, mat, xf=None):
        if xf is not None:
            bmesh.ops.transform(src, matrix=xf, verts=src.verts)
        bmesh.ops.recalc_face_normals(src, faces=src.faces)       # after the transform: a mirror flips the winding
        idx = self.slot(mat)
        vm = {v: self.bm.verts.new(v.co) for v in src.verts}
        for f in src.faces:
            nf = self.bm.faces.new([vm[v] for v in f.verts])
            nf.material_index = idx
        src.free()
        self.shells += 1

    # ---- primitives -------------------------------------------------------------------------------------------------
    def box(self, c, size, mat, bev=0.0, seg=2, xf=None, min_angle=35.0):
        """Bevelled box centred at c, size (sx, sy, sz). xf is applied about c."""
        src = bmesh.new()
        bmesh.ops.create_cube(src, size=1.0)
        bmesh.ops.scale(src, vec=Vector(size), verts=src.verts)
        if bev > 0:
            bevel_edges(src, min(bev, 0.45 * min(size)), seg, min_angle)
        self._merge(src, mat, Matrix.Translation(c) @ (xf if xf is not None else Matrix.Identity(4)))

    def lathe(self, prof, mat, axis="y", c=(0.0, 0.0, 0.0), segs=24, phase=0.0, loop=False, xf=None, caps=True):
        """Revolve prof = [(r, h)] about an axis (x, y or z): h runs along the axis. r == 0 makes a pole vertex. loop=True closes the
        profile into a ring-shaped (toroidal) solid. An open profile whose ends are not on the axis gets flat end caps."""
        src = bmesh.new()

        def pt(r, th, h):
            a, b = r * math.cos(th), r * math.sin(th)
            return {"z": (a, b, h), "y": (a, h, b), "x": (h, a, b)}[axis]

        rings = []
        for r, h in prof:
            if r < 1e-9:
                rings.append(src.verts.new(pt(0.0, 0.0, h)))
            else:
                rings.append([src.verts.new(pt(r, phase + 2 * math.pi * i / segs, h)) for i in range(segs)])
        n = len(prof)
        pairs = [(i, i + 1) for i in range(n - 1)] + ([(n - 1, 0)] if loop else [])
        for a, b in pairs:
            ra, rb = rings[a], rings[b]
            for i in range(segs):
                j = (i + 1) % segs
                if isinstance(ra, list) and isinstance(rb, list):
                    src.faces.new([ra[i], ra[j], rb[j], rb[i]])
                elif isinstance(ra, list):
                    src.faces.new([ra[i], ra[j], rb])
                elif isinstance(rb, list):
                    src.faces.new([ra, rb[j], rb[i]])
        if caps and not loop:
            for end in (0, n - 1):
                if isinstance(rings[end], list):
                    src.faces.new(rings[end])
        self._merge(src, mat, Matrix.Translation(c) @ (xf if xf is not None else Matrix.Identity(4)))

    def loft(self, rings, mat, closed=False, cap_first=False, cap_last=False, xf=None, poke=True):
        """Quad skin between consecutive rings (equal-length lists of 3D points). closed joins the last ring to the first (torus)."""
        src = bmesh.new()
        vr = [[src.verts.new(p) for p in ring] for ring in rings]
        n = len(vr[0])
        pairs = [(i, i + 1) for i in range(len(vr) - 1)] + ([(len(vr) - 1, 0)] if closed else [])
        for a, b in pairs:
            for i in range(n):
                j = (i + 1) % n
                src.faces.new([vr[a][i], vr[a][j], vr[b][j], vr[b][i]])
        caps = []
        if cap_first:
            caps.append(src.faces.new(vr[0]))
        if cap_last:
            caps.append(src.faces.new(vr[-1]))
        if caps and poke:
            # The caps are CONVEX rounded rectangles with collinear points on their straight sides. Blender's exporter ear-clips such an
            # n-gon into zero-area slivers (validator V13), and long slivers also smear the vertex AO. A centre vertex gives a clean fan.
            bmesh.ops.poke(src, faces=caps, offset=0.0, use_relative_offset=False, center_mode="BOUNDS")
        self._merge(src, mat, xf)

    def prism(self, poly, plane, h0, h1, mat, bev=0.0, seg=1, xf=None, min_angle=35.0, sub=0.0):
        """Extrude a closed 2D polygon (u, v) between heights h0 and h1 along the plane normal (see P3). sub > 0 triangulates the caps and
        halves every edge longer than sub, so the vertex AO has vertices across a large flat face."""
        src = bmesh.new()
        bot = [src.verts.new(P3(plane, u, v, h0)) for u, v in poly]
        top = [src.verts.new(P3(plane, u, v, h1)) for u, v in poly]
        n = len(poly)
        for i in range(n):
            j = (i + 1) % n
            src.faces.new([bot[i], bot[j], top[j], top[i]])
        src.faces.new(bot)
        src.faces.new(top)
        if sub > 0:
            bmesh.ops.triangulate(src, faces=[f for f in src.faces if len(f.verts) > 4])
            for _ in range(5):
                src.edges.ensure_lookup_table()
                long_edges = [e for e in src.edges if e.calc_length() > sub]
                if not long_edges:
                    break
                bmesh.ops.subdivide_edges(src, edges=long_edges, cuts=1, use_grid_fill=True)
        if bev > 0:
            bevel_edges(src, bev, seg, min_angle)
        self._merge(src, mat, xf)

    def band(self, plane, w, d, r, h0, prof, mat, cu=0.0, cv=0.0, nx=8, nz=4, nc=3, xf=None):
        """Closed brass strip around a rounded rectangle: prof = [(offset, height)] is the cross-section polygon, offset measured
        outwards from the (w, d, r) outline, height from h0 along the plane normal. Rounded rectangles stay rounded rectangles
        under offsetting (r + offset), so no mitre maths is needed."""
        rings = []
        for o, h in prof:
            pts = rrect(w + 2 * o, d + 2 * o, r + o, nx, nz, nc, cu, cv)
            rings.append([P3(plane, u, v, h0 + h) for u, v in pts])
        self.loft(rings, mat, closed=True, xf=xf)

    def slab_loop(self, plane, loop, h0, h1, mat, insets=(0.55, 1.1), xf=None):
        """A thin plate (h0 to h1) over a closed 2D polygon whose top face is built from concentric inset rings instead of one n-gon, so the
        vertex AO has vertices across it and the shading stays smooth (a triangulated fan gives star-shaped smudges)."""
        rings = [[P3(plane, u, v, h0) for u, v in loop], [P3(plane, u, v, h1) for u, v in loop]]
        for s in insets:
            rings.append([P3(plane, u, v, h1) for u, v in offset_closed(loop, -s)])
        self.loft(rings, mat, cap_first=True, cap_last=True, xf=xf)

    def slab_rrect(self, plane, w, d, r, h0, h1, mat, cu=0.0, cv=0.0, insets=(0.55, 1.1), nx=8, nz=4, nc=3, xf=None):
        """slab_loop for a rounded rectangle. The inset rings are smaller rounded rectangles (radius r - inset, clamped), which keep the
        same vertex count and never fold at the corners; offset_closed's mitred insets fold once the inset exceeds the corner radius
        (36 of 160 top faces of a 10 x 3.7 cm panel came out upside down, which shaded as dark wedges)."""
        def ring(s, h):
            return [P3(plane, u, v, h) for u, v in rrect(w - 2 * s, d - 2 * s, r - s, nx, nz, nc, cu, cv)]
        self.loft([ring(0.0, h0), ring(0.0, h1)] + [ring(s, h1) for s in insets], mat, cap_first=True, cap_last=True, xf=xf)

    def slab_convex(self, plane, loop, h0, h1, mat, scales=(0.85, 0.70), xf=None):
        """slab_loop for any CONVEX polygon: the inner rings are the outline scaled towards its centroid, which cannot fold."""
        cu = sum(u for u, _ in loop) / len(loop)
        cv = sum(v for _, v in loop) / len(loop)
        rings = [[P3(plane, u, v, h0) for u, v in loop], [P3(plane, u, v, h1) for u, v in loop]]
        for k in scales:
            rings.append([P3(plane, cu + (u - cu) * k, cv + (v - cv) * k, h1) for u, v in loop])
        self.loft(rings, mat, cap_first=True, cap_last=True, xf=xf)

    def band_loop(self, plane, loop, h0, prof, mat, xf=None):
        """Like band(), around any closed 2D polygon (offsets by offset_closed)."""
        rings = [[P3(plane, u, v, h0 + h) for u, v in offset_closed(loop, o)] for o, h in prof]
        self.loft(rings, mat, closed=True, xf=xf)

    def mirror_x(self):
        """Mirror everything built so far across x = 0 and re-orient every shell outwards."""
        bmesh.ops.transform(self.bm, matrix=Matrix.Diagonal((-1.0, 1.0, 1.0, 1.0)), verts=self.bm.verts)
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)

    def tube(self, pts, radii, mat, normal=(0.0, 0.0, 1.0), sides=6, xf=None):
        """Round wire along a PLANAR polyline lying in the plane with the given normal; radii per point (taper); flat end caps."""
        src = bmesh.new()
        nrm = Vector(normal).normalized()
        rings = []
        n = len(pts)
        for i, p in enumerate(pts):
            a, b = Vector(pts[max(i - 1, 0)]), Vector(pts[min(i + 1, n - 1)])
            t = (b - a).normalized()
            u = nrm.cross(t).normalized()
            rr = radii[i] if isinstance(radii, (list, tuple)) else radii
            ring = []
            for k in range(sides):
                th = 2 * math.pi * k / sides
                ring.append(src.verts.new(Vector(p) + u * (rr * math.cos(th)) + nrm * (rr * math.sin(th))))
            rings.append(ring)
        for a in range(n - 1):
            for i in range(sides):
                j = (i + 1) % sides
                src.faces.new([rings[a][i], rings[a][j], rings[a + 1][j], rings[a + 1][i]])
        src.faces.new(rings[0])
        src.faces.new(rings[-1])
        self._merge(src, mat, xf)

    def ellipsoid(self, c, radii, mat, segs=10, rows=5, xf=None):
        prof = [(0.0, -1.0)] + [(math.sin(math.pi * k / rows), -math.cos(math.pi * k / rows)) for k in range(1, rows)] + [(0.0, 1.0)]
        self.lathe(prof, mat, axis="y", segs=segs, xf=Matrix.Translation(c) @ (xf if xf is not None else Matrix.Identity(4)) @ Matrix.Diagonal((radii[0], radii[1], radii[2], 1.0)))

    # ---- output -----------------------------------------------------------------------------------------------------
    def subdivide(self, max_len: float, rounds=4):
        """Halve every edge longer than max_len (vertex AO needs vertices where contact shadows fall)."""
        for _ in range(rounds):
            self.bm.edges.ensure_lookup_table()
            long_edges = [e for e in self.bm.edges if e.calc_length() > max_len]
            if not long_edges:
                break
            bmesh.ops.subdivide_edges(self.bm, edges=long_edges, cuts=1, use_grid_fill=True)


def volute(cx, cy, r0, r1, a0_deg, turns, n, sign=1.0):
    """Planar spiral from radius r0 to r1 (an inward scroll), n points."""
    pts = []
    for i in range(n):
        t = i / (n - 1)
        r = r0 * (r1 / r0) ** t
        a = math.radians(a0_deg) + sign * 2 * math.pi * turns * t
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a), 0.0))
    return pts


def mark_shading(bm, sharp_deg=38.0):
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


def finish(b: Builder, name: str, parent=None, weld=False):
    """Builder -> a Blender mesh object in metres, Blender axes, at the origin, with proxy materials, weighted normals and UVs."""
    bm = b.bm
    if weld:
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    big = [f for f in bm.faces if len(f.verts) > 4]                   # concave or oddly shaped n-gons (straps, tines): triangulate here, so the
    if big:                                                           # exporter never ear-clips them into zero-area triangles
        bmesh.ops.triangulate(bm, faces=big, quad_method="BEAUTY", ngon_method="BEAUTY")
    sharp = mark_shading(bm)
    M = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1))) @ Matrix.Scale(1.0 / S, 4)
    bmesh.ops.transform(bm, matrix=M, verts=bm.verts)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for mname in b.slots:
        me.materials.append(materials.make_proxy(mname))
    obj = wu.link_object(name, me)
    if parent is not None:
        obj.parent = parent
    wu.select_only(obj)
    md = obj.modifiers.new("wn", "WEIGHTED_NORMAL")
    md.keep_sharp = True
    md.weight = 100
    md.mode = "FACE_AREA"
    bpy.ops.object.modifier_apply(modifier=md.name)
    uvmetric.box_project(obj)
    wu.log(f"{name}: {b.shells} shells, {len(obj.data.vertices)} verts, {sum(len(p.vertices) - 2 for p in obj.data.polygons)} tris, sharp edges {sharp}, slots {b.slots}")
    return obj
