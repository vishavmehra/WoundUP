"""gen_tockton_base.py - round walnut "velvet stand" / Tockton diorama base (M0 test stage, later the town base).

    blender --background --factory-startup --python blender/scripts/gen_tockton_base.py -- [options]

Options
    --diameter D         overall diameter in metres (default 0.46)
    --height H           overall height in metres (default 0.045)
    --inset-diameter D   recessed velvet top diameter (default diameter - 0.06 = 0.40)
    --segments N         revolve segments (default 72; must be divisible by 3)
    --res R              walnut texture resolution (default 1024; brass / velvet use R/2)
    --clay               geometry only (fast shape review)
    --views a,b,c        preview views (default: front,threequarter,top,closeup,grazing)
    --no-previews        skip the render step
    --out PATH           GLB path override (default public/assets/models/environment/tockton_base_round.glb)

Model space = glTF space (Y up): origin at the centre of the BOTTOM face (y = 0 is table contact), rotation axis = +Y,
so no rotation is needed. In Blender it is built Z-up (axis = Z); the exporter's Y-up conversion maps Blender Z to glTF Y.

The whole body is ONE closed revolved surface (single hand-authored profile: foot -> cove -> brass band -> upper
moulding -> top lip -> recessed velvet floor with a flush brass inlay), so there are no hidden interior faces. Material
runs on that profile: Mat_Walnut / Mat_AgedBrass / Mat_VelvetTeal. Eight brass studs are boolean-unioned onto the moulding.
"""
from __future__ import annotations

import math
import os
import sys
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np

import bmesh
import bpy
from mathutils import Matrix, Vector

import wu_common as wu

W, B, V = 0, 1, 2    # material slots: walnut, aged brass, teal velvet


@dataclass
class BaseParams:
    diameter: float = 0.46
    height: float = 0.045
    inset_diameter: float | None = None
    recess: float = 0.004
    segments: int = 72
    studs: int = 8
    stud_radius: float = 0.0022
    stud_height: float = 0.0013

    def derive(self):
        self.R = self.diameter / 2.0
        self.r_in = (self.inset_diameter if self.inset_diameter else self.diameter - 0.06) / 2.0
        self.y_floor = self.height - self.recess
        assert self.segments % 3 == 0
        return self


# ======================================================================================
# profile
# ======================================================================================
def build_profile(p: BaseParams):
    """Closed-solid profile polyline (r, y) traversed bottom-centre -> out -> up -> in -> top-centre (solid on the left).
    Returns pts, mat (per segment), sec (per segment tag)."""
    R, H, yf = p.R, p.height, p.y_floor
    pts, mat, sec = [(0.0, 0.0)], [], []

    def seg(r, y, m, s):
        pts.append((float(r), float(y)))
        mat.append(m)
        sec.append(s)

    def arc(cx, cy, rad, a0, a1, n, m, s):
        for i in range(1, n + 1):
            a = math.radians(a0 + (a1 - a0) * i / n)
            seg(cx + rad * math.cos(a), cy + rad * math.sin(a), m, s)

    r_o = p.r_in - 0.0075          # inlay outer edge (velvet border outside it)
    r_c = r_o - 0.0030
    r_i = r_o - 0.0060
    assert R - 0.0102 > p.r_in + 0.0016 + 0.004, "diameter too small for this moulding / inset"
    seg(R - 0.0032, 0.0, W, "bottom")                       # flat underside (fan)
    seg(R, 0.0032, W, "A")                                  # bottom chamfer
    seg(R, 0.0062, W, "A")                                  # foot wall
    arc(R - 0.0020, 0.0062, 0.0020, 0, 90, 3, W, "A")       # foot round-over
    seg(R - 0.0085, 0.0082, W, "A")                         # foot ledge
    arc(R - 0.0085, 0.0182, 0.0100, -90, -180, 6, W, "A")   # lower cove
    seg(R - 0.0185, 0.0215, W, "A")                         # neck (lower)
    seg(R - 0.0165, 0.0215, B, "band")                      # brass fillet band: underside
    seg(R - 0.0160, 0.0220, B, "band")                      # chamfer
    seg(R - 0.0160, 0.0240, B, "band")                      # face
    seg(R - 0.0165, 0.0245, B, "band")                      # chamfer
    seg(R - 0.0185, 0.0245, B, "band")                      # top
    seg(R - 0.0185, 0.0268, W, "B")                         # neck (upper)
    seg(R - 0.0085, 0.0268, W, "B")                         # upper moulding underside
    seg(R - 0.0042, 0.0292, W, "B")                         # outward chamfer
    seg(R - 0.0042, 0.0390, W, "B")                         # vertical face (studs sit here)
    arc(R - 0.0102, 0.0390, 0.0060, 0, 90, 4, W, "B")       # top bullnose
    seg(p.r_in + 0.0016, H, W, "B")                         # top lip (flat)
    seg(p.r_in, H - 0.0016, W, "B")                         # inset chamfer
    seg(p.r_in, yf, W, "B")                                 # inset wall
    seg(r_o, yf, V, "velvet")                               # velvet border
    seg(r_o, yf - 0.0002, B, "inlay")                       # flush brass inlay (slightly crowned)
    seg(r_c, yf + 0.0001, B, "inlay")
    seg(r_i, yf - 0.0002, B, "inlay")
    seg(r_i, yf, B, "inlay")
    seg(0.0, yf, V, "velvet")                               # velvet disc (fan)
    return np.array(pts), mat, sec


def revolve(prof_pts, mats, N):
    """Closed revolved surface (Blender Z-up). Returns bmesh with an int face layer 'seg' (profile segment index)."""
    bm = bmesh.new()
    seg_layer = bm.faces.layers.int.new("seg")
    rings = []
    for (r, y) in prof_pts:
        if r < 1e-12:
            rings.append([bm.verts.new((0.0, 0.0, y))])
        else:
            rings.append([bm.verts.new((r * math.cos(2 * math.pi * j / N), r * math.sin(2 * math.pi * j / N), y)) for j in range(N)])
    mats_ = list(mats)
    for i in range(len(prof_pts) - 1):
        a, b = rings[i], rings[i + 1]
        for j in range(N):
            j2 = (j + 1) % N
            if len(a) == 1:
                vs = [a[0], b[j2], b[j]]
            elif len(b) == 1:
                vs = [a[j], a[j2], b[0]]
            else:
                vs = [a[j], a[j2], b[j2], b[j]]
            f = bm.faces.new(vs)
            f.material_index = mats_[i]
            f[seg_layer] = i
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def stud_shell(p: BaseParams, theta: float, r_wall: float, y_c: float):
    """Closed domed stud on the vertical moulding face at angle theta (Blender space, metres)."""
    from gen_gear_spur import dome_shell
    v, f = dome_shell(0.0, 0.0, 0.0, 1, p.stud_radius, p.stud_height, nseg=12, rings=2, skirt=0.0004)
    rh = Vector((math.cos(theta), math.sin(theta), 0.0))
    th = Vector((-math.sin(theta), math.cos(theta), 0.0))
    up = Vector((0.0, 0.0, 1.0))
    c = rh * r_wall + up * y_c
    return [tuple(c + th * x + up * y + rh * z) for (x, y, z) in v], f


def union_studs(bm, p: BaseParams):
    me = bpy.data.meshes.new("_base_body")
    bm.to_mesh(me)
    tmp_mats = [bpy.data.materials.new(f"_tmp_slot{i}") for i in range(3)]
    for m_ in tmp_mats:
        me.materials.append(m_)
    body = wu.link_object("_base_body", me)
    bmr = bmesh.new()
    r_wall = p.R - 0.0042
    y_c = 0.5 * (0.0292 + 0.0390)
    for k in range(p.studs):
        v, f = stud_shell(p, 2 * math.pi * k / p.studs, r_wall, y_c)
        vs = [bmr.verts.new(c) for c in v]
        for q in f:
            bmr.faces.new([vs[i] for i in q])
    bmesh.ops.recalc_face_normals(bmr, faces=bmr.faces)
    mr = bpy.data.meshes.new("_base_studs")
    bmr.to_mesh(mr)
    bmr.free()
    for m_ in tmp_mats:
        mr.materials.append(m_)
    for poly in mr.polygons:
        poly.material_index = B
    st = wu.link_object("_base_studs", mr)
    wu.select_only(body)
    md = body.modifiers.new("union", "BOOLEAN")
    md.operation, md.solver, md.operand_type, md.object = "UNION", "EXACT", "OBJECT", st
    bpy.ops.object.modifier_apply(modifier=md.name)
    out = bmesh.new()
    out.from_mesh(body.data)
    for o in (body, st):
        mesh = o.data
        bpy.data.objects.remove(o)
        bpy.data.meshes.remove(mesh)
    for m_ in tmp_mats:
        bpy.data.materials.remove(m_)
    bpy.context.view_layer.update()
    bmesh.ops.remove_doubles(out, verts=out.verts, dist=1e-7)
    # stud faces (anything standing proud of the moulding face) are brass
    n = 0
    for f in out.faces:
        c = f.calc_center_median()
        if 0.0285 < c.z < 0.0395 and math.hypot(c.x, c.y) > r_wall + 5e-5:
            f.material_index = B
            n += 1
    return out, n


# ======================================================================================
# shading + UV atlas
# ======================================================================================
def mark_shading(bm, crisp_deg=40.0):
    bm.normal_update()
    for f in bm.faces:
        f.smooth = True
    n = 0
    for e in bm.edges:
        if len(e.link_faces) == 2:
            crisp = e.calc_face_angle(0.0) >= math.radians(crisp_deg)
            e.smooth = not crisp
            n += crisp
    return n


class BaseUV:
    """Walnut: arc-length strips (3 slices around x 2 profile sections) + bottom disc tile, grain along u.
       Brass: tiled planar-in-(theta, s) with integer repeats (tiling is intentional). Velvet: planar disc in [0,1]^2."""
    SLICES = 3
    SLICE0 = math.radians(20.0)        # slice seams keep clear of the studs (multiples of 45 deg)

    def __init__(self, p: BaseParams, prof, mats, secs):
        self.p = p
        pts = np.asarray(prof)
        self.pts = pts
        ln = np.hypot(*(pts[1:] - pts[:-1]).T)
        self.cum = np.concatenate([[0.0], np.cumsum(ln)])
        self.secs = secs
        self.mats = mats
        self.sec_range = {}
        for s in ("A", "B", "band", "inlay"):
            idx = [i for i, t in enumerate(secs) if t == s]
            self.sec_range[s] = (idx[0], idx[-1])      # segment index range, inclusive
        self.L = {s: float(self.cum[b + 1] - self.cum[a]) for s, (a, b) in self.sec_range.items()}
        self.R_ref = p.R
        self._layout()

    def _layout(self):
        K = self.SLICES
        pad, g = 0.008, 0.008
        arc_slice = 2 * math.pi * self.R_ref / K
        bottom_h = 0.11
        kw_w = (1 - 2 * (g + pad)) / arc_slice
        avail = 1 - g - bottom_h
        kw_h = (avail - 2 * K * (2 * pad + g) ) / (K * (self.L["A"] + self.L["B"]))
        self.kw = min(kw_w, kw_h)
        self.pad, self.g, self.arc_slice = pad, g, arc_slice
        self.pieces = {}
        y = bottom_h + g
        for s in ("A", "B"):
            for k in range(K):
                h = self.L[s] * self.kw + 2 * pad
                self.pieces[(s, k)] = dict(u0=g + pad, v0=y + pad, w=arc_slice * self.kw, h=self.L[s] * self.kw)
                y += h + g
        # bottom disc tile (planar), centred bottom-left
        self.bt_c = (0.07 + 0.0, 0.065)
        self.bt_k = 0.055 / (self.p.R - 0.0032)

    def seg_of(self, r, z, allowed=None):
        """Nearest profile segment (index) to point (r,z), optionally restricted to a set of indices."""
        a = self.pts[:-1]
        b = self.pts[1:]
        d = b - a
        t = np.clip(((r - a[:, 0]) * d[:, 0] + (z - a[:, 1]) * d[:, 1]) / np.maximum((d ** 2).sum(1), 1e-18), 0, 1)
        proj = a + t[:, None] * d
        dist = np.hypot(r - proj[:, 0], z - proj[:, 1])
        if allowed is not None:
            m = np.full(len(a), 1e9)
            m[list(allowed)] = 0
            dist = dist + m
        i = int(dist.argmin())
        return i, float(t[i])

    def s_at(self, r, z, i_hint=None, allowed=None):
        i, t = self.seg_of(r, z, allowed)
        return float(self.cum[i] + t * (self.cum[i + 1] - self.cum[i])), i

    def assign(self, bm):
        uvl = bm.loops.layers.uv.verify()
        p, K = self.p, self.SLICES
        D_v = 2 * p.r_in
        stats = dict(walnut=0, brass=0, velvet=0, bottom=0, stud=0, mirrored=0)
        r_wall = p.R - 0.0042
        walnut_idx = [i for i, mm in enumerate(self.mats) if mm == W]
        brass_idx = [i for i, mm in enumerate(self.mats) if mm == B]
        n_band = max(1, round(2 * math.pi * (p.R - 0.0160) / 0.12))
        n_inlay = max(1, round(2 * math.pi * (p.r_in - 0.0105) / 0.12))
        kb = 1 / 0.12
        for f in bm.faces:
            c = f.calc_center_median()
            cr, cth = math.hypot(c.x, c.y), math.atan2(c.y, c.x)
            m = f.material_index
            if m == V:
                for l in f.loops:
                    l[uvl].uv = (0.5 + l.vert.co.x / D_v, 0.5 + l.vert.co.y / D_v)
                stats["velvet"] += 1
                continue
            if m == W:
                i, _ = self.seg_of(cr, c.z, allowed=walnut_idx)
                sec = self.secs[i]
                if sec == "bottom":
                    for l in f.loops:
                        l[uvl].uv = (self.bt_c[0] - l.vert.co.x * self.bt_k, self.bt_c[1] + l.vert.co.y * self.bt_k)
                    stats["bottom"] += 1
                    continue
                a, b = self.sec_range[sec]
                allowed = range(a, b + 1)
                th_c = (cth - self.SLICE0) % (2 * math.pi)
                k = min(K - 1, int(th_c / (2 * math.pi / K)))
                pc = self.pieces[(sec, k)]
                s0 = self.cum[a]
                for l in f.loops:
                    r_, z_ = math.hypot(l.vert.co.x, l.vert.co.y), l.vert.co.z
                    th = (math.atan2(l.vert.co.y, l.vert.co.x) - self.SLICE0) % (2 * math.pi)
                    # keep the angle continuous with the face centre (faces never span the slice seams)
                    th = th + 2 * math.pi * round((th_c - th) / (2 * math.pi))
                    s, _ = self.s_at(r_, z_, allowed=allowed)
                    l[uvl].uv = (pc["u0"] + (th * self.R_ref - k * self.arc_slice) * self.kw, pc["v0"] + (s - s0) * self.kw)
                stats["walnut"] += 1
                continue
            # brass
            if cr > r_wall + 5e-5 and 0.0285 < c.z < 0.0395:        # studs: local planar
                k = int(round(cth / (2 * math.pi / p.studs))) % p.studs
                th = 2 * math.pi * k / p.studs
                rh, tg = Vector((math.cos(th), math.sin(th), 0)), Vector((-math.sin(th), math.cos(th), 0))
                cc = rh * r_wall + Vector((0, 0, 0.5 * (0.0292 + 0.0390)))
                for l in f.loops:
                    d = l.vert.co - cc
                    l[uvl].uv = (0.5 + d.dot(tg) * kb * 0.5, 0.5 + d.z * kb * 0.5)
                stats["stud"] += 1
                continue
            i, _ = self.seg_of(cr, c.z, allowed=brass_idx)
            sec = self.secs[i]
            a, b = self.sec_range[sec]
            n_rep = n_band if sec == "band" else n_inlay
            for l in f.loops:
                r_, z_ = math.hypot(l.vert.co.x, l.vert.co.y), l.vert.co.z
                th = math.atan2(l.vert.co.y, l.vert.co.x)
                th = th + 2 * math.pi * round((cth - th) / (2 * math.pi))
                s, _ = self.s_at(r_, z_, allowed=range(a, b + 1))
                l[uvl].uv = (th / (2 * math.pi) * n_rep + 0.5, (s - self.cum[a]) * kb + 0.1)
            stats["brass"] += 1
        for f in bm.faces:
            uvs = np.array([l[uvl].uv[:] for l in f.loops])
            ar = 0.5 * (np.dot(uvs[:, 0], np.roll(uvs[:, 1], -1)) - np.dot(uvs[:, 1], np.roll(uvs[:, 0], -1)))
            if ar < -1e-9 and f.material_index != B:
                stats["mirrored"] += 1
        return stats

    # ---- texture-space helpers --------------------------------------------------------
    def walnut_coordinates(self, size):
        """(T, S) metre coordinates for every texel of the walnut atlas (gutters extend their piece), + piece mask."""
        T = np.zeros((size, size), np.float32)
        S = np.zeros((size, size), np.float32)
        xs = (np.arange(size) + 0.5) / size
        U, Vv = np.meshgrid(xs, xs)
        for (sec, k), pc in self.pieces.items():
            a, b = self.sec_range[sec]
            u_lo, u_hi = pc["u0"] - self.pad, pc["u0"] + pc["w"] + self.pad
            v_lo, v_hi = pc["v0"] - self.pad, pc["v0"] + pc["h"] + self.pad
            m = (U >= u_lo) & (U < u_hi) & (Vv >= v_lo) & (Vv < v_hi)
            T[m] = ((U[m] - pc["u0"]) / self.kw + k * self.arc_slice / self.R_ref * self.R_ref).astype(np.float32) + 0.0
            S[m] = ((Vv[m] - pc["v0"]) / self.kw + self.cum[a]).astype(np.float32)
        # bottom tile + anything uncovered: generic planar wood
        m = (T == 0) & (S == 0)
        T[m] = (U[m] * 1.0).astype(np.float32)
        S[m] = (Vv[m] * 1.0).astype(np.float32)
        return T + self.SLICE0 * self.R_ref, S


# ======================================================================================
# build / textures / export / previews
# ======================================================================================
def build_base_mesh(p: BaseParams, name: str):
    prof, mats, secs = build_profile(p)
    N = p.segments
    bm = revolve(prof, mats, N)
    wu.log(f"profile points={len(prof)} segments={len(mats)}; revolve N={N}: faces={len(bm.faces)}")
    bm, n_stud_faces = union_studs(bm, p)
    n_sharp = mark_shading(bm)
    uv = BaseUV(p, prof, mats, secs)
    st = uv.assign(bm)
    wu.log(f"studs faces={n_stud_faces}; sharp edges={n_sharp}; UV faces={st}; walnut atlas kw={uv.kw:.1f} UV/m "
           f"(= {uv.kw * 1024 / 1000:.2f} px/mm @1024)")
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.uv_layers.active.name = "UVMap"
    return me, uv


def apply_weighted_normals(obj):
    wu.select_only(obj)
    md = obj.modifiers.new("wn", "WEIGHTED_NORMAL")
    md.keep_sharp = True
    md.weight = 100
    md.mode = "FACE_AREA"
    bpy.ops.object.modifier_apply(modifier=md.name)


def run(argv):
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--diameter", type=float, default=0.46)
    ap.add_argument("--height", type=float, default=0.045)
    ap.add_argument("--inset-diameter", type=float, default=None)
    ap.add_argument("--segments", type=int, default=72)
    ap.add_argument("--res", type=int, default=1024)
    ap.add_argument("--clay", action="store_true")
    ap.add_argument("--views", default="front,threequarter,top,closeup,grazing")
    ap.add_argument("--no-previews", action="store_true")
    ap.add_argument("--out", default=None)
    ap.add_argument("--preview-prefix", default=None)
    ap.add_argument("--preview-res", default="1280x960")
    ap.add_argument("--preview-samples", type=int, default=96)
    a = ap.parse_args(argv)
    p = BaseParams(diameter=a.diameter, height=a.height, inset_diameter=a.inset_diameter, segments=a.segments).derive()
    nm, asset = "TocktonBaseRound", "tockton_base_round"
    glb = Path(a.out) if a.out else wu.MODEL_DIR / "environment" / f"{asset}.glb"
    blend = wu.SOURCE_DIR / f"{asset}.blend"
    wu.log(f"== {nm}: D={p.diameter * 1000:.0f} mm  H={p.height * 1000:.1f} mm  inset D={2 * p.r_in * 1000:.0f} mm  N={p.segments}")

    wu.reset_scene()
    me, uv = build_base_mesh(p, nm)
    obj = wu.link_object(nm, me)
    for nme in ("Mat_Walnut", "Mat_AgedBrass", "Mat_VelvetTeal"):
        me.materials.append(bpy.data.materials.new("_ph_" + nme))
    apply_weighted_normals(obj)

    if a.clay:
        cols = {"Mat_Walnut": "#5B3A24", "Mat_AgedBrass": wu.BRASS["base"], "Mat_VelvetTeal": "#1F5C5C"}
        for i, (nme, hx) in enumerate(cols.items()):
            m = bpy.data.materials.new(nme)
            m.use_nodes = True
            b = m.node_tree.nodes["Principled BSDF"]
            b.inputs["Base Color"].default_value = (*wu.hex_to_linear(hx), 1)
            b.inputs["Roughness"].default_value = 0.5
            b.inputs["Metallic"].default_value = 0.85 if i == 1 else 0.0
            me.materials[i] = m
    else:
        res = a.res
        passes = [dict(name="mask", constant=1.0),
                  dict(name="ao", distance=0.012 * (p.diameter / 0.46), samples=160)]
        bk = wu.bake_maps(obj, res, passes, margin=8, samples=160)
        import tempfile
        tex = Path(tempfile.mkdtemp(prefix="wu_base_tex_"))
        # ---- walnut (grain follows the circumference; evaluated from 3D position of every atlas texel)
        mk = bk["mask"][W] > 0.5
        ao_w = np.where(mk, bk["ao"][W], 1.0)
        T, Sx = uv.walnut_coordinates(res)
        wal = wu.walnut_maps(T, Sx, 2 * math.pi * p.R, ao=ao_w, seed=17)
        imgs_w = wu.make_textures(asset, "walnut", dict(base=wal["base"], orm=wal["orm"], normal=wu.resize_map(wal["normal"], res // 2)), tex)
        # ---- velvet (512 planar)
        vres = res // 2
        mkv = wu.resize_map(bk["mask"][V], vres) > 0.5
        ao_v = np.where(mkv, wu.resize_map(bk["ao"][V], vres), 1.0)
        vel = wu.velvet_maps(vres, ao=ao_v, seed=31)
        imgs_v = wu.make_textures(asset, "velvet", vel, tex)
        # ---- brass (512 tileable, shared look with the gear)
        brs = wu.brass_maps(vres, ao=None, cavity=None, edge=None, seed=11, tile=True)
        imgs_b = wu.make_textures(asset, "brass", brs, tex)
        mats = [wu.build_pbr_material("Mat_Walnut", imgs_w["base"], imgs_w["orm"], imgs_w["normal"]),
                wu.build_pbr_material("Mat_AgedBrass", imgs_b["base"], imgs_b["orm"], imgs_b["normal"], extension="REPEAT"),
                wu.build_pbr_material("Mat_VelvetTeal", imgs_v["base"], imgs_v["orm"], imgs_v["normal"],
                                      sheen_tint=wu.VELVET["sheen_tint"], sheen_roughness=0.55)]
        for i, m in enumerate(mats):
            me.materials[i] = m
    for m in [m for m in bpy.data.materials if m.name.startswith("_ph_")]:
        bpy.data.materials.remove(m)
    for ob in list(bpy.data.objects):
        if ob is not obj:
            bpy.data.objects.remove(ob)
    obj.name = me.name = nm

    wu.log("MESH QA:", wu.mesh_qa(obj))
    if not a.clay:
        wu.log("UV QA:", wu.uv_qa(obj, 1024))
    bpy.ops.outliner.orphans_purge(do_recursive=True)
    if not a.clay:                                       # a --clay shape review must never overwrite the shipped source
        blend.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(blend), compress=True)
        wu.log("saved", blend, f"{blend.stat().st_size / 1024:.0f} KB")
    wu.export_glb([obj], glb)
    rep = wu.inspect_glb(glb)
    if a.no_previews:
        return rep
    w, h = (int(x) for x in a.preview_res.split("x"))
    render_previews(glb, a.preview_prefix or asset, a.views.split(","), (w, h), a.preview_samples, p)
    return rep


def base_views(p: BaseParams):
    """glTF-space camera specs: name -> (position, target, lens, key direction or None)."""
    R, H = p.R, p.height
    return {
        "front": ((0.0, 0.20 * R + 0.02, 3.9 * R), (0, 0.45 * H, 0), 50, None),
        "threequarter": ((2.7 * R, 1.9 * R, 2.7 * R), (0, 0.3 * H, 0), 50, None),
        "top": ((0.001, 4.6 * R, 0.002), (0, 0, 0), 50, None),
        "closeup": ((p.r_in + 0.008 + 0.070, 0.085, 0.085), (p.r_in + 0.008, 0.036, 0.0), 85, None),
        "grazing": ((2.2 * R, 1.25 * R, 2.5 * R), (0, 0.3 * H, 0), 50, (-1.0, 0.09, 0.10)),
    }


def render_previews(glb, prefix, views, res, samples, p):
    scene = wu.reset_scene()
    wu.setup_cycles(scene, samples=samples)
    objs = wu.import_glb(glb)
    zmin = min((o.matrix_world @ Vector(c)).z for o in objs if o.type == "MESH" for c in o.bound_box)
    scale = 0.5 * p.diameter / 0.23 * 0.4 / 0.4
    wu.build_studio(scene, 0.40 * p.diameter / 0.46 * 1.0, floor_z=zmin - 0.0002)
    specs = base_views(p)
    for name in views:
        pos, tgt, lens, key = specs[name]
        cam = wu.make_camera(scene, wu.g2b(pos), wu.g2b(tgt), lens)
        wu.isolate_key(scene, key is not None)
        wu.set_key_light(scene, wu.g2b(key) if key else None, 0.40 * p.diameter / 0.46, 2.2 if key else 1.0)
        wu.render_to(scene, wu.PREVIEW_DIR / f"{prefix}_{name}.png", res=res, samples=samples, max_kb=600)
        bpy.data.objects.remove(cam)


if __name__ == "__main__":
    run(wu.script_args())
