"""gen_wk_kit.py - modelling kit shared by the World generators of family B (trunk, workshop, interaction, gifts).

Not run directly; imported by gen_workshop.py, which forge.py loads. Everything is authored in glTF axes and centimetres
(x right, y up, z towards the viewer; 1 unit = 1 cm so that bevels stay far above Blender's merge tolerances) and converted to
Blender space and metres when a Part is built. The kit has four surface generators and one assembler:

    rr_sweep    a profile (inset d, height y) swept around a rounded rectangle: hollow boxes, lids, slabs, trays, pillow tops
    lathe       a profile (radius, height) turned about an axis, optional polar modulation: knobs, domes, rivets, gear plates
    sweep       a 2D cross-section swept along a 3D path: straps, handles, string, ribbon, rolled paper
    skin        the low-level ring skinner they all use
    Part        collects finished shells into one mesh object (own cleanup per shell), shades, assigns library proxies, UVs
"""
from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np

import bmesh
import bpy
from mathutils import Matrix, Quaternion, Vector

import wu_common as wu
from lib import materials, uvmetric, vertex_ao

S = 100.0                                   # build scale: 1 unit = 1 cm


def G(p):
    """glTF (x, y up, z front) -> Blender (x, -z, y)."""
    return (float(p[0]), -float(p[2]), float(p[1]))


# ======================================================================================
# polylines: fillet and refine (generic dimension)
# ======================================================================================
def fillet_poly(pts, radii=None, n=3):
    """Round the interior corners of a polyline. radii[i] is the tangent length at pts[i] (0 = keep sharp). Returns (points,
    seg) with seg[j] = index of the ORIGINAL segment that follows output point j (carries per-segment data such as materials)."""
    pts = [np.asarray(p, float) for p in pts]
    m = len(pts)
    radii = [0.0] * m if radii is None else list(radii)
    out, seg = [pts[0]], [0]
    for i in range(1, m - 1):
        r = radii[i]
        if r <= 0:
            out.append(pts[i]); seg.append(i)
            continue
        A, P, B = pts[i - 1], pts[i], pts[i + 1]
        u, v = A - P, B - P
        lu, lv = float(np.linalg.norm(u)), float(np.linalg.norm(v))
        if lu < 1e-9 or lv < 1e-9:
            out.append(P); seg.append(i)
            continue
        u, v = u / lu, v / lv
        ang = math.acos(max(-1.0, min(1.0, float(u @ v))))
        if ang > math.pi - 1e-3:                                   # straight through
            out.append(P); seg.append(i)
            continue
        t = r                                                        # tangent length (r is the setback, not a circle radius)
        t = min(t, lu * (1.0 if (i - 1 == 0 or radii[i - 1] <= 0) else 0.5), lv * (1.0 if (i + 1 == m - 1 or radii[i + 1] <= 0) else 0.5))
        T1, T2 = P + u * t, P + v * t
        for s in np.linspace(0.0, 1.0, n + 1):
            out.append((1 - s) ** 2 * T1 + 2 * s * (1 - s) * P + s * s * T2)
            seg.append(i)
    out.append(pts[-1]); seg.append(m - 2)
    keep = [0]                                                       # drop consecutive duplicates (a fillet that eats a whole leg)
    for j in range(1, len(out)):
        if float(np.linalg.norm(out[j] - out[keep[-1]])) > 1e-9:
            keep.append(j)
    return [out[j] for j in keep], [seg[j] for j in keep]


def round_loop(pts, radii, n=2):
    """Round every corner of a CLOSED polygon (any dimension). radii: one value or one per vertex (tangent setback)."""
    pts = [np.asarray(p, float) for p in pts]
    m = len(pts)
    radii = [radii] * m if np.isscalar(radii) else list(radii)
    out = []
    for i in range(m):
        A, P, B = pts[i - 1], pts[i], pts[(i + 1) % m]
        u, v = A - P, B - P
        lu, lv = float(np.linalg.norm(u)), float(np.linalg.norm(v))
        t = min(radii[i], 0.45 * lu, 0.45 * lv)
        if t <= 1e-9:
            out.append(P)
            continue
        T1, T2 = P + u / lu * t, P + v / lv * t
        out += [(1 - s) ** 2 * T1 + 2 * s * (1 - s) * P + s * s * T2 for s in np.linspace(0.0, 1.0, n + 1)]
    keep = [0]
    for j in range(1, len(out)):
        if float(np.linalg.norm(out[j] - out[keep[-1]])) > 1e-9:
            keep.append(j)
    if len(keep) > 1 and float(np.linalg.norm(out[keep[-1]] - out[0])) <= 1e-9:
        keep.pop()
    return [out[j] for j in keep]


def refine(pts, seg, max_len):
    """Insert points so that no segment is longer than max_len."""
    out, sg = [pts[0]], [seg[0]]
    for j in range(len(pts) - 1):
        a, b = pts[j], pts[j + 1]
        k = max(1, int(math.ceil(float(np.linalg.norm(b - a)) / max_len - 1e-9)))
        for q in range(1, k):
            out.append(a + (b - a) * (q / k)); sg.append(seg[j])
        out.append(b); sg.append(seg[j + 1] if j + 1 < len(seg) else seg[j])
    return out, sg


def make_profile(pts, radii=None, segmats=None, n=2, max_len=None):
    """pts [(a, b)], radii per point, segmats per original segment -> (points, material per output segment)."""
    p, seg = fillet_poly(pts, radii, n)
    if max_len:
        p, seg = refine(p, seg, max_len)
    sm = segmats if segmats is not None else [0] * (len(pts) - 1)
    return p, [sm[min(seg[j], len(sm) - 1)] for j in range(len(p) - 1)]


# ======================================================================================
# shells
# ======================================================================================
def _face(bm, vs, mat):
    try:
        f = bm.faces.new(vs)
    except ValueError:
        return None
    f.material_index = mat
    return f


def skin(rings, mats=None, closed=False, caps=(True, True)):
    """rings: list of rings, each a list of N glTF-space points (a ring of length 1 is an apex). mats[i] = material of the band
    between ring i and i+1. closed: the last ring joins the first (torus). Returns a raw bmesh (call finish())."""
    bm = bmesh.new()
    V = [[bm.verts.new(G(p)) for p in ring] for ring in rings]
    n = len(rings)
    for i in range(n if closed else n - 1):
        a, b = V[i], V[(i + 1) % n]
        m = mats[i] if mats is not None else 0
        na, nb = len(a), len(b)
        if na == 1 and nb == 1:
            continue
        if na == 1:
            for j in range(nb):
                _face(bm, [a[0], b[(j + 1) % nb], b[j]], m)
        elif nb == 1:
            for j in range(na):
                _face(bm, [a[j], a[(j + 1) % na], b[0]], m)
        else:
            assert na == nb, (na, nb)
            for j in range(na):
                _face(bm, [a[j], a[(j + 1) % na], b[(j + 1) % nb], b[j]], m)
    if not closed:
        m0 = mats[0] if mats is not None else 0
        m1 = mats[-1] if mats is not None else 0
        if caps[0] and len(V[0]) > 2:
            _face(bm, V[0][::-1], m0)
        if caps[1] and len(V[-1]) > 2:
            _face(bm, V[-1], m1)
    return bm


def finish(bm, merge=1e-4):
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=merge)
    bmesh.ops.dissolve_degenerate(bm, dist=1e-5, edges=bm.edges)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def rr_ring(a, b, r, k, mx, mz, y, cx=0.0, cz=0.0):
    """Rounded rectangle in the x-z plane at height y: half sizes a (x) and b (z), corner radius r, k arc segments per corner
    (k = 0: sharp corners), mx / mz interior points on the x-parallel / z-parallel straights. N = 4(k+1) + 2mx + 2mz."""
    pts = []
    sx = (1, -1, -1, 1)
    sz = (1, 1, -1, -1)
    kk = max(k, 0)
    for c in range(4):
        r_ = min(r, a, b) if k > 0 else 0.0
        ccx, ccz = sx[c] * (a - r_), sz[c] * (b - r_)
        if k == 0:
            arc = [(sx[c] * a, sz[c] * b)]
        else:
            arc = [(ccx + r_ * math.cos(math.radians(90 * c + 90 * j / k)), ccz + r_ * math.sin(math.radians(90 * c + 90 * j / k)))
                   for j in range(k + 1)]
        pts.append(arc)
    ring = []
    for c in range(4):
        ring.extend(pts[c])
        nxt = pts[(c + 1) % 4][0]
        cur = pts[c][-1]
        m = mx if c in (0, 2) else mz
        for q in range(1, m + 1):
            t = q / (m + 1)
            ring.append((cur[0] + (nxt[0] - cur[0]) * t, cur[1] + (nxt[1] - cur[1]) * t))
    return [(cx + p[0], y, cz + p[1]) for p in ring]


def rr_sweep(profile, a, b, r, k=2, space=2.0, cx=0.0, cz=0.0, rmin=0.08, caps=(True, True), closed=False):
    """profile = (points [(d, y)], segment materials). Ring i has half sizes (a - d, b - d) and corner radius max(r - d, rmin), so a
    negative d flares outwards and a positive d steps inwards. Returns a raw bmesh."""
    pts, mats = profile
    mx = max(0, int(round(2 * max(a - (r if k else 0), 0) / space)) - 1)
    mz = max(0, int(round(2 * max(b - (r if k else 0), 0) / space)) - 1)
    rings = []
    for d, y in pts:
        ad, bd = max(a - d, 0.05), max(b - d, 0.05)
        rings.append(rr_ring(ad, bd, max(r - d, rmin) if k else 0.0, k, mx, mz, y, cx, cz))
    if closed:                                                       # profile is a closed loop: a torus (frames, sleeves)
        mats = list(mats) + [mats[-1]]
    return skin(rings, mats, closed=closed, caps=caps)


def rbox(c, size, r_edge=0.2, r_plan=0.0, k=0, mat=0, space=2.5, n=1):
    """Box centred at c (x, y bottom, z) with edge chamfers/rounds on its horizontal edges; r_plan rounds the vertical edges
    (k arc segments)."""
    sx, h, sz = size
    a, b = sx / 2, sz / 2
    d0 = max(min(a, b) - 0.06, 0.0)
    prof = make_profile([(d0, 0.0), (0.0, 0.0), (0.0, h), (d0, h)], [0, r_edge, r_edge, 0], [mat] * 3, n=n, max_len=space)
    return _shift_y(rr_sweep(prof, a, b, r_plan, k=k, space=space, cx=c[0], cz=c[2]), c[1])


def _shift_y(bm, dy):
    for v in bm.verts:
        v.co.z += dy                                              # Blender z is glTF y
    return bm


def lathe(profile, c=(0.0, 0.0, 0.0), axis=(0.0, 1.0, 0.0), nseg=12, phase=0.0, mod=None):
    """profile = (points [(r, h)], segment materials), r >= 0 (r = 0 is an apex). The profile turns about `axis` through c.
    mod(theta) scales every ring radius (gear teeth, scallops). Returns a raw bmesh."""
    pts, mats = profile
    A = np.asarray(axis, float)
    A = A / np.linalg.norm(A)
    helper = np.array([1.0, 0, 0]) if abs(A[0]) < 0.9 else np.array([0, 0, 1.0])
    U = np.cross(A, helper); U /= np.linalg.norm(U)
    Vv = np.cross(A, U)
    cc = np.asarray(c, float)
    rings = []
    for r, h in pts:
        if r < 1e-6:
            rings.append([tuple(cc + h * A)])
            continue
        ring = []
        for j in range(nseg):
            t = phase + 2 * math.pi * j / nseg
            rr = r * (mod(t) if mod else 1.0)
            ring.append(tuple(cc + h * A + rr * (math.cos(t) * U + math.sin(t) * Vv)))
        rings.append(ring)
    return skin(rings, mats)


def sweep(path, section, binormal, outward=None, mat=0, closed=False, caps=(True, True)):
    """Sweep section [(u, v)] (u along `binormal`, v along the normal) along the 3D polyline `path`. outward: a point; the normal
    is flipped to face away from it (asymmetric sections such as straps). Returns a raw bmesh."""
    P = [np.asarray(p, float) for p in path]
    P = [q for j, q in enumerate(P) if j == 0 or float(np.linalg.norm(q - P[j - 1])) > 1e-9]
    n = len(P)
    B0 = np.asarray(binormal, float)
    rings, nrm_sign = [], None
    for i in range(n):
        if closed:
            T = P[(i + 1) % n] - P[(i - 1) % n]
        elif i == 0:
            T = P[1] - P[0]
        elif i == n - 1:
            T = P[-1] - P[-2]
        else:
            T = P[i + 1] - P[i - 1]
        T = T / np.linalg.norm(T)
        B = B0 - (B0 @ T) * T
        B = B / np.linalg.norm(B)
        N = np.cross(B, T)
        if outward is not None:
            if nrm_sign is None:
                nrm_sign = 1.0 if float(N @ (P[i] - np.asarray(outward, float))) >= 0 else -1.0
            N = N * nrm_sign
        rings.append([tuple(P[i] + u * B + v * N) for (u, v) in section])
    return skin(rings, [mat] * (n if closed else n - 1), closed=closed, caps=caps)


def rect_section(w, t, chamfer=0.05, v0=0.0):
    """Octagon-ish section: width w (u), thickness t (v from v0 up to v0 + t), chamfered corners."""
    c = min(chamfer, w / 2 - 1e-3, t / 2 - 1e-3)
    h = w / 2
    return [(-h + c, v0), (h - c, v0), (h, v0 + c), (h, v0 + t - c), (h - c, v0 + t), (-h + c, v0 + t), (-h, v0 + t - c), (-h, v0 + c)]


def round_section(r, n=8, v0=0.0):
    return [(r * math.cos(2 * math.pi * i / n), v0 + r * math.sin(2 * math.pi * i / n)) for i in range(n)]


# ======================================================================================
# small shapes
# ======================================================================================
def prism_y(poly_xz, y0, y1, mat=0):
    """Closed prism over a convex polygon in the x-z plane, from y0 to y1."""
    return skin([[(x, y0, z) for x, z in poly_xz], [(x, y1, z) for x, z in poly_xz]], [mat])


def prism_x(poly_zy, x0, x1, mat=0):
    """Closed prism over a convex polygon (z, y) in the y-z plane, from x0 to x1."""
    return skin([[(x0, y, z) for z, y in poly_zy], [(x1, y, z) for z, y in poly_zy]], [mat])


def dome(c, r, h, axis=(0, 1, 0), nseg=8, mat=0):
    """Rivet / bolt head: a low domed cap standing on a surface at c, its base skirt sunk 0.05 cm into the surface."""
    prof = ([(0.0, -0.05), (r, -0.05), (r, 0.0), (r * 0.9, h * 0.55), (r * 0.55, h * 0.9), (0.0, h)], [mat] * 5)
    return lathe(prof, c, axis, nseg)


def cylinder(c, axis, r, length, nseg=12, r_end=0.05, mat=0, n=1):
    """Cylinder from c along `axis`; r_end rounds / chamfers both end edges (n segments)."""
    re = min(r_end, r * 0.9, length * 0.45)
    pts, mats = make_profile([(0.0, 0.0), (r, 0.0), (r, length), (0.0, length)], [0, re, re, 0], [mat] * 3, n=n)
    return lathe((pts, mats), c, axis, nseg)


def rot(bm, deg, axis="x", about=(0.0, 0.0, 0.0)):
    """Rotate a shell by `deg` about a glTF axis ('x', 'y' or 'z') through `about` (glTF cm)."""
    a = math.radians(deg)
    M = {"x": Matrix.Rotation(a, 4, "X"), "y": Matrix.Rotation(a, 4, "Z"), "z": Matrix.Rotation(-a, 4, "Y")}[axis]
    bmesh.ops.rotate(bm, cent=G(about), matrix=M.to_3x3(), verts=bm.verts)
    return bm


def move(bm, d):
    bmesh.ops.translate(bm, vec=G(d), verts=bm.verts)
    return bm


def smooth_tooth(n_teeth, amp, sharp=1.6):
    """Polar modulation for lathe(): n teeth, trapezoid-ish wave of relative amplitude amp."""
    return lambda t: 1.0 + amp * 0.5 * float(np.clip(sharp * math.cos(n_teeth * t), -1.0, 1.0))


# ======================================================================================
# shading
# ======================================================================================
def mark_shading(bm, crisp_deg=50.0):
    bm.normal_update()
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        if len(e.link_faces) == 2:
            e.smooth = e.calc_face_angle(0.0) < math.radians(crisp_deg)


def apply_weighted_normals(obj):
    wu.select_only(obj)
    md = obj.modifiers.new("wn", "WEIGHTED_NORMAL")
    md.keep_sharp = True
    md.weight = 100
    md.mode = "FACE_AREA"
    bpy.ops.object.modifier_apply(modifier=md.name)


# ======================================================================================
# Part: one exported mesh object
# ======================================================================================
class Part:
    def __init__(self, name: str, mats: list[str]):
        self.name, self.mats, self.bm = name, list(mats), bmesh.new()

    def add(self, shell):
        finish(shell)
        me = bpy.data.meshes.new("_shell")
        shell.to_mesh(me)
        shell.free()
        self.bm.from_mesh(me)
        bpy.data.meshes.remove(me)
        return self

    def build(self, parent=None, location=(0.0, 0.0, 0.0)):
        bm = self.bm
        used = sorted({f.material_index for f in bm.faces})
        remap = {m: i for i, m in enumerate(used)}
        for f in bm.faces:
            f.material_index = remap[f.material_index]
        assert all(math.isfinite(c) for v in bm.verts for c in v.co), f"{self.name}: non-finite vertex (zero-length sweep segment?)"
        mark_shading(bm)
        bmesh.ops.transform(bm, matrix=Matrix.Scale(1.0 / S, 4), verts=bm.verts)
        me = bpy.data.meshes.new(self.name)
        bm.to_mesh(me)
        bm.free()
        obj = wu.link_object(self.name, me)
        for m in used:
            me.materials.append(materials.make_proxy(self.mats[m]))
        apply_weighted_normals(obj)
        uvmetric.box_project(obj)
        if parent is not None:
            obj.parent = parent
        obj.location = location
        return obj


# ======================================================================================
# ambient-occlusion policy (a documented workaround, see gen_workshop.py FRAMEWORK NOTES)
# ======================================================================================
POLICY: dict = {}      # filled by a generator's build(): {"pose": fn -> restore, "neutral": {mesh names}, "hide": {mesh name: [mesh names hidden while it bakes]}}
_bake0 = vertex_ao.bake


def _bake(obj, samples=64):
    if obj.name in POLICY.get("neutral", ()):
        return vertex_ao.neutral(obj)
    hidden = [bpy.data.objects[n] for n in POLICY.get("hide", {}).get(obj.name, ()) if n in bpy.data.objects]
    was = [(o, o.hide_render) for o in hidden]                       # shells that sit embedded in this mesh would put dark spikes in its AO
    for o in hidden:
        o.hide_render = True
    pose = POLICY.get("pose")
    restore = pose() if pose else None
    try:
        return _bake0(obj, samples)
    finally:
        if restore:
            restore()
        for o, h in was:
            o.hide_render = h


if vertex_ao.bake is _bake0:
    vertex_ao.bake = _bake


def pose_rotate(pivot, deg, axis="X"):
    """Temporarily rotate a pivot empty (Blender-space rotation about its local axis); returns the restore callable."""
    q0 = pivot.rotation_quaternion.copy()
    pivot.rotation_quaternion = Quaternion({"X": (1, 0, 0), "Y": (0, 1, 0), "Z": (0, 0, 1)}[axis], math.radians(deg)) @ q0
    bpy.context.view_layer.update()

    def restore():
        pivot.rotation_quaternion = q0
        bpy.context.view_layer.update()
    return restore
