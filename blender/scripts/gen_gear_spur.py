"""gen_gear_spur.py - parametric aged-brass storybook spur gear (hero hand-grab test object).

    blender --background --factory-startup --python blender/scripts/gen_gear_spur.py -- [options]

Options
    --teeth N            tooth count (default 16)
    --tip-diameter D     metres; default = MODULE * (teeth + 2) so every size shares one module (16T -> 0.064)
    --thickness T        face width in metres (default 0.012)
    --bore B             bore diameter in metres (default 0.008)
    --res R              texture resolution (default 1024)
    --clay               geometry only (no bake / textures) - fast shape review
    --views a,b,c        preview views to render (default: front,threequarter,top,macro,grazing)
    --no-previews        skip the render step
    --out PATH           GLB path override (default: public/assets/models/props/gear_spur_<N>_brass.glb for N=16,
                         blender/exports/variants/ for other sizes)

Model space (what ends up in the GLB, glTF Y-up): rotation axis = local +Z, front face towards +Z, origin = centre of
the bore at mid-thickness, tooth 0 points along +X. The mesh is built in this space at 100x (1 unit = 1 cm, so tiny
bevels stay far above Blender's merge tolerances), then rotated into Blender space (x, y, z) -> (x, -z, y)
(Blender-side the rotation axis is the Y axis, front face towards -Y) and scaled to metres before any normal /
texture work. The glTF exporter's Y-up conversion then returns exactly the model-space axes.
"""
from __future__ import annotations

import math
import os
import sys
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np

import bmesh
import bpy
from mathutils import Matrix, Vector

import wu_common as wu

S = 100.0                              # build scale (1 unit = 1 cm)
ADDENDUM = 0.85                        # x module (short, chunky storybook teeth)
MODULE_REF = 0.064 / (16 + 2 * ADDENDUM)   # 16T / 0.064 m tip diameter => one module for the whole gear family


# ======================================================================================
# parameters
# ======================================================================================
@dataclass
class GearParams:
    teeth: int = 16
    tip_diameter: float | None = None
    thickness: float = 0.012
    bore: float = 0.008
    hub_protrusion: float = 0.0016      # hub boss stands proud of each rim face
    spoke_thickness_ratio: float = 0.75  # spoke face width / rim face width (spokes are recessed)
    spokes: int = 4
    flank_angle_deg: float = 11.0       # straight flank inclination (storybook: blunter than a 20 deg involute)
    addendum: float = ADDENDUM          # x module
    dedendum: float = 1.00              # x module
    tooth_pitch_fraction: float = 0.48  # tooth thickness at pitch circle / circular pitch (rest = gap + backlash)
    tip_fillet: float = 0.22            # x module
    root_fillet: float = 0.25           # x module
    rim_width: float = 0.0055           # radial width below the root circle
    bevel: float = 0.00045              # edge bevel on every convex hard edge
    bore_chamfer: float = 0.00060
    rivet_radius: float = 0.00080
    rivet_height: float = 0.00062
    rivets_per_face: int = 8
    bolts_per_face: int = 4
    bolt_radius: float = 0.00058
    bolt_height: float = 0.00050
    tip_fillet_segs: int = 2
    root_fillet_segs: int = 2
    spoke_fillet_segs: int = 2

    def derive(self):
        z = self.teeth
        self.m = (self.tip_diameter / (z + 2 * self.addendum)) if self.tip_diameter else MODULE_REF
        self.Ro = self.m * (z + 2 * self.addendum) / 2.0
        self.tip_diameter = 2 * self.Ro
        self.Rp = self.m * z / 2.0
        self.Rr = self.Rp - self.dedendum * self.m
        self.R_R = self.Rr - self.rim_width                                  # rim inner radius
        self.r_bore = self.bore / 2.0
        self.r_F = min(max(0.0085, 0.20 * self.Ro), 0.62 * self.R_R)         # hub flange radius
        self.r_B = self.r_bore + 0.45 * (self.r_F - self.r_bore)             # hub boss radius
        k = float(np.clip((self.R_R - self.r_F) / 0.0110, 0.55, 1.25))
        self.hw_F = 0.0036 * k                                               # spoke half width at hub end
        self.hw_R = 0.0027 * k                                               # ... at rim end
        self.rho_f = min(0.0012, 0.18 * (self.R_R - self.r_F))               # spoke fillet radius
        self.h_rim = self.thickness / 2.0
        self.h_spoke = self.h_rim * self.spoke_thickness_ratio
        self.h_boss = self.h_rim + self.hub_protrusion
        self.rho_tip = self.tip_fillet * self.m
        self.rho_root = self.root_fillet * self.m
        return self


# ======================================================================================
# 2D plan geometry
# ======================================================================================
def fillet_line_circle(a, b, rc, rho, inside, side):
    """Fillet circle (radius rho) tangent to the line eta = a + b*xi and to the origin-centred circle of radius rc.
    side=+1/-1: fillet centre on the +eta/-eta side of the line. inside: fillet circle inside (True) / outside the circle.
    Of the two solutions the one with larger xi is returned. -> (centre, tangent point on line, tangent point on circle)"""
    k = math.hypot(1.0, b)
    n = np.array([-b, 1.0]) / k
    c = a / k
    d = c + side * rho
    ro = rc - rho if inside else rc + rho
    s2 = ro * ro - d * d
    if s2 < 0:
        raise ValueError("fillet does not fit")
    s = math.sqrt(s2)
    u = np.array([1.0, b]) / k
    c1, c2 = d * n + s * u, d * n - s * u
    o = c1 if c1[0] > c2[0] else c2
    t_line = o - side * rho * n
    t_circ = o * (rc / math.hypot(o[0], o[1]))
    return o, t_line, t_circ


def arc_pts(o, rho, p0, p1, nseg):
    a0 = math.atan2(p0[1] - o[1], p0[0] - o[0])
    a1 = math.atan2(p1[1] - o[1], p1[0] - o[0])
    d = (a1 - a0 + math.pi) % (2 * math.pi) - math.pi
    pts = np.array([o + rho * np.array([math.cos(a0 + d * i / nseg), math.sin(a0 + d * i / nseg)]) for i in range(nseg + 1)])
    pts[0], pts[-1] = p0, p1
    return pts


def rot2(p, ang):
    c, s = math.cos(ang), math.sin(ang)
    p = np.asarray(p)
    return np.stack([p[..., 0] * c - p[..., 1] * s, p[..., 0] * s + p[..., 1] * c], axis=-1)


def mirror_eta(p):
    q = np.array(p, dtype=float).copy()
    q[..., 1] *= -1
    return q


def tooth_outline(p: GearParams):
    """CCW outline of the whole toothed rim, tooth 0 on +X. Straight trapezoid flanks (conjugate enough for visual
    meshing of any two gears of the same module) + analytic line/circle fillets at tip and root."""
    t = math.tan(math.radians(p.flank_angle_deg))
    hp = 0.5 * p.tooth_pitch_fraction * math.pi * p.m
    c = hp + p.Rp * t
    a, b = c, -t                                    # upper flank: eta = c - t*xi
    # tip land is a straight chord (saves a vertex per tooth); fillet against a circle slightly larger than Ro so the
    # chord midpoint lies exactly on the tip circle (bbox / tip diameter stay exact)
    ro_eff = p.Ro
    for _ in range(4):
        ot, tl_t, tc_t = fillet_line_circle(a, b, ro_eff, p.rho_tip, inside=True, side=-1)
        ro_eff = p.Ro / math.cos(math.atan2(tc_t[1], tc_t[0]))
    orr, tl_r, tc_r = fillet_line_circle(a, b, p.Rr, p.rho_root, inside=False, side=+1)
    th_tc_r = math.atan2(tc_r[1], tc_r[0])
    assert th_tc_r < math.pi / p.teeth - 0.0004, f"root fillets collide ({math.degrees(th_tc_r):.2f} deg)"
    tip_f = arc_pts(ot, p.rho_tip, tc_t, tl_t, p.tip_fillet_segs)      # tip circle -> flank
    root_f = arc_pts(orr, p.rho_root, tl_r, tc_r, p.root_fillet_segs)  # flank -> root circle
    upper = list(tip_f) + list(root_f)
    lower = [mirror_eta(q) for q in reversed(upper)]
    tooth = lower + upper
    out = []
    for k in range(p.teeth):
        out.extend(rot2(np.array(tooth), 2 * math.pi * k / p.teeth))
    return np.array(out)


@dataclass
class Plan:
    V: list = field(default_factory=list)
    faces: list = field(default_factory=list)
    heights: list = field(default_factory=list)
    kinds: list = field(default_factory=list)
    loops: dict = field(default_factory=dict)
    flank_chains: list = field(default_factory=list)
    circles: dict = field(default_factory=dict)
    circle_angles: dict = field(default_factory=dict)

    def add(self, x, y):
        self.V.append((float(x), float(y)))
        return len(self.V) - 1


def build_plan(p: GearParams) -> Plan:
    pl = Plan()
    two_pi = 2 * math.pi
    ns = p.spokes
    # ---- outline
    outline = tooth_outline(p)
    out_idx = [pl.add(*q) for q in outline]
    out_ang = np.arctan2(outline[:, 1], outline[:, 0])
    pl.loops["outline"] = outline
    # ---- spoke fillets (local frame, spoke along +x, upper flank)
    b_s = (p.hw_R - p.hw_F) / (p.R_R - p.r_F)
    a_s = p.hw_F - b_s * p.r_F
    o_r, tl_r, tc_r = fillet_line_circle(a_s, b_s, p.R_R, p.rho_f, inside=True, side=+1)
    o_h, tl_h, tc_h = fillet_line_circle(a_s, b_s, p.r_F, p.rho_f, inside=False, side=+1)
    rimfil = arc_pts(o_r, p.rho_f, tl_r, tc_r, p.spoke_fillet_segs)   # Tl_r ... Tc_r
    hubfil = arc_pts(o_h, p.rho_f, tc_h, tl_h, p.spoke_fillet_segs)   # Tc_h ... Tl_h
    d_R = math.atan2(tc_r[1], tc_r[0])
    d_F = math.atan2(tc_h[1], tc_h[0])
    span = two_pi / ns
    n_att_R = max(2, int(math.ceil(2 * d_R * p.R_R / 0.0034)))
    n_att_F = max(2, int(math.ceil(2 * d_F * p.r_F / 0.0026)))
    n_win_R = max(5, int(math.ceil((span - 2 * d_R) * p.R_R / 0.0046)))
    n_win_F = max(2, int(math.ceil((span - 2 * d_F) * p.r_F / 0.0026)))

    def circle(radius, delta, n_att, n_win, with_att=True):
        """Vertex loop on a circle: per spoke an attach arc [-delta,+delta] then window-arc interior points."""
        idx, ang, att = [], [], []
        for k in range(ns):
            ak = span * k
            at = [ak - delta + 2 * delta * i / n_att for i in range(n_att + 1)]
            ids = [pl.add(radius * math.cos(t_), radius * math.sin(t_)) for t_ in at]
            att.append(ids)
            idx += ids
            ang += at
            lo, hi = ak + delta, ak + span - delta
            for i in range(1, n_win):
                t_ = lo + (hi - lo) * i / n_win
                idx.append(pl.add(radius * math.cos(t_), radius * math.sin(t_)))
                ang.append(t_)
        return idx, np.array(ang), att

    CR, CR_ang, attR = circle(p.R_R, d_R, n_att_R, n_win_R)
    CF, CF_ang, attF = circle(p.r_F, d_F, n_att_F, n_win_F)
    CB = [pl.add(p.r_B * math.cos(t_), p.r_B * math.sin(t_)) for t_ in CF_ang]
    BO = [pl.add(p.r_bore * math.cos(t_), p.r_bore * math.sin(t_)) for t_ in CF_ang]
    for name, r in (("rim_inner", p.R_R), ("flange", p.r_F), ("boss", p.r_B), ("bore", p.r_bore)):
        pl.circles[name] = r
    pl.circle_angles = {"rim_inner": np.sort(CR_ang % two_pi), "flange": np.sort(CF_ang % two_pi),
                        "boss": np.sort(CF_ang % two_pi), "bore": np.sort(CF_ang % two_pi)}

    # ---- rim: zipper strip between outline and rim-inner circle (angle-ordered triangles)
    theta0 = -math.pi / p.teeth - 0.02

    def ordered(idx, ang):
        a = (np.asarray(ang) - theta0) % two_pi
        o = np.argsort(a)
        return [idx[i] for i in o], a[o]

    o_ids, o_a = ordered(out_idx, out_ang)
    i_ids, i_a = ordered(CR, CR_ang)
    no, ni = len(o_ids), len(i_ids)
    ao = list(o_a) + [o_a[0] + two_pi]
    ai = list(i_a) + [i_a[0] + two_pi]
    i = j = 0
    while i < no or j < ni:
        adv_o = j >= ni or (i < no and ao[i + 1] <= ai[j + 1])
        if adv_o:
            pl.faces.append([o_ids[i % no], o_ids[(i + 1) % no], i_ids[j % ni]])
            i += 1
        else:
            pl.faces.append([i_ids[j % ni], o_ids[i % no], i_ids[(j + 1) % ni]])
            j += 1
        pl.heights.append(p.h_rim)
        pl.kinds.append("rim")
    # ---- flange ring + boss ring (quads, radial)
    nf = len(CF)
    for i in range(nf):
        j = (i + 1) % nf
        pl.faces.append([CF[i], CF[j], CB[j], CB[i]]); pl.heights.append(p.h_rim); pl.kinds.append("flange")
        pl.faces.append([CB[i], CB[j], BO[j], BO[i]]); pl.heights.append(p.h_boss); pl.kinds.append("boss")
    # ---- spokes
    for k in range(ns):
        ak = span * k
        poly = list(attF[k][::-1])
        for q in mirror_eta(hubfil)[1:]:
            poly.append(pl.add(*rot2(q, ak)))
        for q in mirror_eta(rimfil)[:-1]:
            poly.append(pl.add(*rot2(q, ak)))
        poly.append(attR[k][0])
        poly += attR[k][1:]
        for q in rimfil[::-1][1:]:
            poly.append(pl.add(*rot2(q, ak)))
        for q in hubfil[::-1][:-1]:
            poly.append(pl.add(*rot2(q, ak)))
        pl.faces.append(poly); pl.heights.append(p.h_spoke); pl.kinds.append("spoke")
        # flank chains (plan polylines) for UV strips: hub circle tangent -> ... -> rim circle tangent
        up = np.vstack([hubfil, rimfil])
        pl.flank_chains.append(rot2(up, ak))
        pl.flank_chains.append(rot2(mirror_eta(up), ak))
    return pl


# ======================================================================================
# relief solid: planar subdivision + per-face half-height -> watertight solid with step walls
# ======================================================================================
def build_relief(pl: Plan, scale=S) -> bmesh.types.BMesh:
    from collections import defaultdict
    V, faces, fh = pl.V, pl.faces, pl.heights
    emap = defaultdict(list)
    vh = defaultdict(set)
    for fi, f in enumerate(faces):
        n = len(f)
        for k in range(n):
            a, b = f[k], f[(k + 1) % n]
            emap[(min(a, b), max(a, b))].append((fi, a, b))
            vh[a].add(fh[fi])
    bm = bmesh.new()
    cache = {}

    def gv(v, z):
        key = (v, round(z * 1e8))
        if key not in cache:
            cache[key] = bm.verts.new((V[v][0] * scale, V[v][1] * scale, z * scale))
        return cache[key]

    def chain(v, z0, z1):
        zs = sorted({s * h for h in vh[v] for s in (-1, 1)})
        return [z for z in zs if z0 - 1e-12 <= z <= z1 + 1e-12]

    for fi, f in enumerate(faces):
        h = fh[fi]
        bm.faces.new([gv(v, h) for v in f])
        bm.faces.new([gv(v, -h) for v in reversed(f)])

    def wall(i, j, z0, z1):
        pts = [gv(i, z0)] + [gv(j, z) for z in chain(j, z0, z1)] + [gv(i, z) for z in reversed(chain(i, z0, z1))][:-1]
        bm.faces.new(pts)

    for (a, b), lst in emap.items():
        if len(lst) == 1:
            fi, i, j = lst[0]
            wall(i, j, -fh[fi], fh[fi])
        else:
            (f1, i1, j1), (f2, i2, j2) = lst
            h1, h2 = fh[f1], fh[f2]
            if abs(h1 - h2) < 1e-12:
                continue
            if h1 > h2:
                i, j, hi, lo = i1, j1, h1, h2
            else:
                i, j, hi, lo = i2, j2, h2, h1
            wall(i, j, lo, hi)
            wall(i, j, -hi, -lo)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def bevel_convex(bm, width, min_angle_deg=60.0, only=None, segments=1):
    """Chamfer/round convex hard edges. `only`: optional predicate(edge) restricting the selection."""
    bm.edges.ensure_lookup_table()
    sel = []
    for e in bm.edges:
        if not e.is_manifold or not e.is_convex:
            continue
        if e.calc_face_angle(0.0) < math.radians(min_angle_deg):
            continue
        if only is not None and not only(e):
            continue
        sel.append(e)
    bmesh.ops.bevel(bm, geom=sel, offset=width, offset_type="OFFSET", segments=segments, profile=0.5,
                    affect="EDGES", clamp_overlap=True, loop_slide=True)
    return len(sel)


# ======================================================================================
# rivets / bolt heads (closed domed shells, embedded base) - unioned into the body
# ======================================================================================
def pan_head(cx, cy, z0, sign, a, h, nseg=8, skirt=0.00018, phase=0.0):
    """Closed flat-topped pan head (base ring -> shoulder ring + flat cap), unit-agnostic like dome_shell."""
    verts, faces = [], []

    def ring(r, z):
        base = len(verts)
        for i in range(nseg):
            t = phase + 2 * math.pi * i / nseg
            verts.append((cx + r * math.cos(t), cy + r * math.sin(t), z0 + sign * z))
        return base

    r_bot, r0 = ring(a, -skirt), ring(a, 0.0)
    r2 = ring(0.70 * a, h)
    for lo, hi in ((r_bot, r0), (r0, r2)):
        for i in range(nseg):
            j = (i + 1) % nseg
            q = [lo + i, lo + j, hi + j, hi + i]
            faces.append(q if sign > 0 else q[::-1])
    cap = [r2 + i for i in range(nseg)]
    faces.append(cap if sign > 0 else cap[::-1])
    bot = [r_bot + i for i in range(nseg)][::-1]
    faces.append(bot if sign > 0 else bot[::-1])
    return verts, faces


def dome_shell(cx, cy, z0, sign, a, h, nseg=8, rings=2, skirt=0.00018, phase=0.0):
    """Closed spherical-cap dome standing on a face at z0 (normal +z if sign=+1, -z if sign=-1), metres.
    Returns (verts, faces) in metres; the skirt + base cap sit inside the body and vanish in the boolean union."""
    rs = (a * a + h * h) / (2 * h)
    phi_b = math.asin(min(1.0, a / rs))
    verts, faces = [], []

    def ring(r, z):
        base = len(verts)
        for i in range(nseg):
            t = phase + 2 * math.pi * i / nseg
            verts.append((cx + r * math.cos(t), cy + r * math.sin(t), z0 + sign * z))
        return base

    r_bot = ring(a, -skirt)
    r0 = ring(a, 0.0)
    mids = []
    fr = {1: [0.62], 2: [0.40, 0.75]}[rings] if rings in (1, 2) else [0.62]
    for f in sorted(fr, reverse=True):
        phi = phi_b * f
        mids.append(ring(rs * math.sin(phi), rs * (math.cos(phi) - math.cos(phi_b))))
    apex = len(verts)
    verts.append((cx, cy, z0 + sign * h))
    stacks = [r_bot, r0] + mids

    def quad_band(lo, hi):
        for i in range(nseg):
            j = (i + 1) % nseg
            q = [lo + i, lo + j, hi + j, hi + i]
            faces.append(q if sign > 0 else q[::-1])

    for lo, hi in zip(stacks[:-1], stacks[1:]):
        quad_band(lo, hi)
    for i in range(nseg):
        j = (i + 1) % nseg
        t = [stacks[-1] + i, stacks[-1] + j, apex]
        faces.append(t if sign > 0 else t[::-1])
    cap = [r_bot + i for i in range(nseg)][::-1]
    faces.append(cap if sign > 0 else cap[::-1])
    return verts, faces


def rivet_positions(p: GearParams):
    """[(cx, cy, z_surface, sign, radius, height, kind)] in metres."""
    out = []
    r_riv = 0.5 * (p.Rr + p.R_R)
    r_bolt = 0.5 * (p.r_F + p.r_B)
    for sign in (+1, -1):
        for i in range(p.rivets_per_face):
            t = 2 * math.pi * i / p.rivets_per_face
            out.append((r_riv * math.cos(t), r_riv * math.sin(t), sign * p.h_rim, sign, p.rivet_radius, p.rivet_height, "rivet"))
        for i in range(p.bolts_per_face):
            t = math.pi / p.bolts_per_face + 2 * math.pi * i / p.bolts_per_face
            out.append((r_bolt * math.cos(t), r_bolt * math.sin(t), sign * p.h_rim, sign, p.bolt_radius, p.bolt_height, "bolt"))
    return out


def union_rivets(bm_body, p: GearParams):
    """Boolean-union the domed heads (modifier, EXACT) and return the result as a new bmesh."""
    me = bpy.data.meshes.new("_gear_body")
    bm_body.to_mesh(me)
    body = wu.link_object("_gear_body", me)
    bmr = bmesh.new()
    for (cx, cy, z0, sign, a, h, kind) in rivet_positions(p):
        if kind == "bolt":
            v, f = pan_head(cx * S, cy * S, z0 * S, sign, a * S, h * S, nseg=8, skirt=0.00018 * S, phase=math.atan2(cy, cx))
        else:
            v, f = dome_shell(cx * S, cy * S, z0 * S, sign, a * S, h * S, nseg=8, rings=1, skirt=0.00018 * S,
                              phase=math.atan2(cy, cx))
        vs = [bmr.verts.new(c) for c in v]
        for q in f:
            bmr.faces.new([vs[i] for i in q])
    bmesh.ops.recalc_face_normals(bmr, faces=bmr.faces)
    mr = bpy.data.meshes.new("_gear_rivets")
    bmr.to_mesh(mr)
    bmr.free()
    riv = wu.link_object("_gear_rivets", mr)
    wu.select_only(body)
    md = body.modifiers.new("union", "BOOLEAN")
    md.operation = "UNION"
    md.solver = "EXACT"
    md.operand_type = "OBJECT"
    md.object = riv
    bpy.ops.object.modifier_apply(modifier=md.name)
    bm = bmesh.new()
    bm.from_mesh(body.data)
    for o in (body, riv):
        mesh = o.data
        bpy.data.objects.remove(o)
        bpy.data.meshes.remove(mesh)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    return bm


# ======================================================================================
# shading: crisp chamfers, smooth walls, flat faces stay flat
# ======================================================================================
def _ftype(f):
    nz = abs(f.normal.z)
    return "wall" if nz < 0.15 else ("top" if nz > 0.97 else "cham")


def mark_shading(bm):
    bm.normal_update()
    for f in bm.faces:
        f.smooth = True
    sharp = 0
    for e in bm.edges:
        if len(e.link_faces) != 2:
            continue
        ang = e.calc_face_angle(0.0)
        f1, f2 = e.link_faces
        crisp = ang >= math.radians(60) or (ang >= math.radians(25) and _ftype(f1) != _ftype(f2))
        e.smooth = not crisp
        sharp += crisp
    return sharp


# ======================================================================================
# UV atlas: front / back planar discs, arc-length wall strips, rivet tiles (uniform texel density)
# ======================================================================================
def _poly_param(pts, closed, P):
    """Closest-point arc-length parameter + distance of 2D points P (n,2) on polyline pts (m,2)."""
    pts = np.asarray(pts, float)
    if closed:
        a, b = pts, np.roll(pts, -1, axis=0)
    else:
        a, b = pts[:-1], pts[1:]
    seg = b - a
    ln = np.hypot(seg[:, 0], seg[:, 1])
    cum = np.concatenate([[0.0], np.cumsum(ln)])
    P = np.atleast_2d(P)
    d = P[:, None, :] - a[None, :, :]
    t = np.clip((d * seg[None]).sum(-1) / np.maximum(ln ** 2, 1e-18)[None], 0, 1)
    proj = a[None] + t[..., None] * seg[None]
    dist = np.hypot(P[:, None, 0] - proj[..., 0], P[:, None, 1] - proj[..., 1])
    j = dist.argmin(1)
    idx = np.arange(len(P))
    return cum[j] + t[idx, j] * ln[j], dist[idx, j]


class GearUV:
    """Analytic atlas (all in UV units; k = UV units per metre, identical everywhere => uniform texel density):
       top half   : front disc (x,y) planar | back disc (-x,y) planar | one tile per rivet/bolt head
       bottom half: wall strips (plan arc length x height) for every vertical loop, shelf-packed."""

    def __init__(self, p: GearParams, pl: Plan):
        self.p, self.pl = p, pl
        self.loops = {"outline": dict(kind="poly", pts=pl.loops["outline"], closed=True, hz=p.h_rim)}
        for i, ch in enumerate(pl.flank_chains):
            self.loops[f"flank{i}"] = dict(kind="poly", pts=ch, closed=False, hz=p.h_spoke)
        for name, hz in (("rim_inner", p.h_rim), ("flange", p.h_rim), ("boss", p.h_boss), ("bore", p.h_boss)):
            self.loops[name] = dict(kind="circle", r=pl.circles[name], closed=True, hz=hz)
        for name, lp in self.loops.items():
            # right-handed strips: outward wall normal must equal (d/du x d/dv). Inward-facing loops run reversed.
            lp["flip"] = name in ("rim_inner", "bore") or (name.startswith("flank") and int(name[5:]) % 2 == 0)
            if lp["kind"] == "poly":
                pts = np.asarray(lp["pts"], float)
                nxt = np.roll(pts, -1, 0) if lp["closed"] else pts[1:]
                prv = pts if lp["closed"] else pts[:-1]
                cum = np.concatenate([[0.0], np.cumsum(np.hypot(*(nxt - prv).T))])
                lp["L"] = float(cum[-1])
                lp["verts_s"] = cum[:-1] if lp["closed"] else cum
            else:
                ang = pl.circle_angles[name]
                lp["theta0"] = float(ang[0])
                lp["L"] = 2 * math.pi * lp["r"]
                lp["verts_s"] = ((ang - ang[0]) % (2 * math.pi)) * lp["r"]
        self.rivets = rivet_positions(p)
        self._pack()

    def _try_pack(self, k, g):
        pieces, y, x, row_h = [], g, g, 0.0
        for name, lp in sorted(self.loops.items(), key=lambda kv: -kv[1]["hz"]):
            n_p = max(1, int(math.ceil((lp["L"] * k + 0.03) / (1 - 2 * g))))
            vs = np.sort(np.asarray(lp["verts_s"]))
            cuts = [0.0]
            for j in range(1, n_p):
                cuts.append(float(vs[np.abs(vs - lp["L"] * j / n_p).argmin()]))
            cuts.append(lp["L"] + 1e-9)
            lp["cuts"] = cuts
            for j in range(n_p):
                w = (cuts[j + 1] - cuts[j]) * k + 0.012
                h = 2 * lp["hz"] * k + 0.012
                if x + w > 1 - g + 1e-9:
                    y += row_h + g
                    x, row_h = g, 0.0
                pieces.append(dict(loop=name, j=j, u0=x + 0.006, v0=y + 0.006, h=h, w=w))
                x += w + g
                row_h = max(row_h, h)
        return pieces if (y + row_h) <= 0.5 - g else None

    def _pack(self):
        p = self.p
        g = 0.018
        k = min(0.235 / p.Ro, 6.2)
        pieces = None
        for _ in range(60):
            pieces = self._try_pack(k, g)
            if pieces is not None:
                break
            k *= 0.97
        assert pieces is not None, "wall strips do not fit the atlas"
        self.k, self.g, self.pieces = k, g, pieces
        wall_top = max(pc["v0"] + pc["h"] for pc in pieces)
        v_lo, v_hi = wall_top + g + p.Ro * k, 0.94 - p.Ro * k
        self.disc_v = min(max(v_lo, 0.5 + p.Ro * k * 0.0 + (v_hi - v_lo) * 0.5), v_hi) if v_hi >= v_lo else v_lo
        self.front_c, self.back_c = (0.25, self.disc_v), (0.75, self.disc_v)
        self.tile = 2 * p.rivet_radius * k + 0.012

    def _piece(self, name, j):
        return next(pc for pc in self.pieces if pc["loop"] == name and pc["j"] == j)

    def assign(self, bm):
        uvl = bm.loops.layers.uv.verify()
        k, p = self.k, self.p
        names = list(self.loops)
        stats = dict(front=0, back=0, wall=0, rivet=0, mirrored_uv_faces=0)
        riv = np.array([(r[0], r[1], r[2], r[4]) for r in self.rivets])
        for f in bm.faces:
            c = f.calc_center_median()
            cm = np.array([c.x, c.y, c.z]) / S
            ri = -1
            if abs(cm[2]) > p.h_rim + 3e-5:
                d = np.hypot(riv[:, 0] - cm[0], riv[:, 1] - cm[1])
                m = (d < riv[:, 3] * 1.18) & (np.sign(riv[:, 2]) == np.sign(cm[2]))
                if m.any():
                    ri = int(np.argmin(np.where(m, d, 9)))
            if ri >= 0:
                cx, cy, sign = self.rivets[ri][0], self.rivets[ri][1], self.rivets[ri][3]
                u0 = 0.03 + (ri % 24) * self.tile
                v0 = 1 - 0.02 - self.tile * (ri // 24 + 1)
                for l in f.loops:
                    x, y = l.vert.co.x / S, l.vert.co.y / S
                    l[uvl].uv = (u0 + self.tile / 2 + (x - cx) * k * sign, v0 + self.tile / 2 + (y - cy) * k)
                stats["rivet"] += 1
                continue
            nz = f.normal.z
            if abs(nz) > 0.45:
                front = nz > 0
                cu, cv = self.front_c if front else self.back_c
                for l in f.loops:
                    x, y = l.vert.co.x / S, l.vert.co.y / S
                    l[uvl].uv = (cu + (x if front else -x) * k, cv + y * k)
                stats["front" if front else "back"] += 1
                continue
            best, bd = None, 9.0
            for name in names:
                lp = self.loops[name]
                if lp["kind"] == "circle":
                    d = abs(math.hypot(cm[0], cm[1]) - lp["r"])
                else:
                    d = float(_poly_param(lp["pts"], lp["closed"], cm[None, :2])[1][0])
                if d < bd - 1e-9:
                    best, bd = name, d
            lp = self.loops[best]
            vp = np.array([[l.vert.co.x / S, l.vert.co.y / S, l.vert.co.z / S] for l in f.loops])
            if lp["kind"] == "circle":
                sc = ((math.atan2(cm[1], cm[0]) - lp["theta0"]) % (2 * math.pi)) * lp["r"]
                sv = ((np.arctan2(vp[:, 1], vp[:, 0]) - lp["theta0"]) % (2 * math.pi)) * lp["r"]
            else:
                sc = float(_poly_param(lp["pts"], lp["closed"], cm[None, :2])[0][0])
                sv = _poly_param(lp["pts"], lp["closed"], vp[:, :2])[0]
            if lp["closed"]:
                sv = sv + lp["L"] * np.round((sc - sv) / lp["L"])
            cuts = lp["cuts"]
            j = max(0, min(len(cuts) - 2, int(np.searchsorted(cuts, sc, side="right") - 1)))
            pc = self._piece(best, j)
            wlen = cuts[j + 1] - cuts[j]
            for l, su, zi in zip(f.loops, sv, vp[:, 2]):
                du = (wlen - (su - cuts[j])) if lp["flip"] else (su - cuts[j])
                l[uvl].uv = (pc["u0"] + du * k, pc["v0"] + (zi + lp["hz"]) * k)
            stats["wall"] += 1
        for f in bm.faces:
            uvs = np.array([l[uvl].uv[:] for l in f.loops])
            ar = 0.5 * (np.dot(uvs[:, 0], np.roll(uvs[:, 1], -1)) - np.dot(uvs[:, 1], np.roll(uvs[:, 0], -1)))
            if ar < -1e-9:
                stats["mirrored_uv_faces"] += 1
        return stats


# ======================================================================================
# build (mesh in Blender space, metres) -> bake -> textures -> export -> QA -> previews
# ======================================================================================
def build_gear_mesh(p: GearParams, name: str):
    pl = build_plan(p)
    bm = build_relief(pl)
    r_bore_cm = p.r_bore * S
    n_bore = bevel_convex(bm, p.bore_chamfer * S, only=lambda e: all(abs(math.hypot(v.co.x, v.co.y) - r_bore_cm) < 1e-4 for v in e.verts))
    n_edge = bevel_convex(bm, p.bevel * S)
    bm = union_rivets(bm, p)
    n_sharp = mark_shading(bm)
    uv = GearUV(p, pl)
    ustats = uv.assign(bm)
    wu.log(f"plan verts={len(pl.V)} faces={len(pl.faces)}; bevelled bore={n_bore} edges={n_edge}; sharp edges={n_sharp}; UV faces={ustats}; "
           f"atlas k={uv.k:.2f} UV/m (= {uv.k * 1024 / 1000:.2f} px/mm @1024)")
    M = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1))) @ Matrix.Scale(1.0 / S, 4)
    bmesh.ops.transform(bm, matrix=M, verts=bm.verts)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.uv_layers.active.name = "UVMap" if me.uv_layers.active else "UVMap"
    return me, pl, uv


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
    ap.add_argument("--teeth", type=int, default=16)
    ap.add_argument("--tip-diameter", type=float, default=None)
    ap.add_argument("--thickness", type=float, default=0.012)
    ap.add_argument("--bore", type=float, default=0.008)
    ap.add_argument("--res", type=int, default=1024)
    ap.add_argument("--clay", action="store_true")
    ap.add_argument("--views", default="front,threequarter,top,macro,grazing")
    ap.add_argument("--no-previews", action="store_true")
    ap.add_argument("--out", default=None)
    ap.add_argument("--preview-prefix", default=None)
    ap.add_argument("--preview-res", default="1280x960")
    ap.add_argument("--preview-samples", type=int, default=96)
    a = ap.parse_args(argv)

    p = GearParams(teeth=a.teeth, tip_diameter=a.tip_diameter, thickness=a.thickness, bore=a.bore).derive()
    nm = f"GearSpur{p.teeth}_Brass"
    asset = f"gear_spur_{p.teeth}_brass"
    deliverable = p.teeth == 16 and a.tip_diameter is None
    glb = Path(a.out) if a.out else ((wu.MODEL_DIR / "props" / f"{asset}.glb") if deliverable else (wu.EXPORT_DIR / "variants" / f"{asset}.glb"))
    blend = (wu.SOURCE_DIR / f"{asset}.blend") if deliverable else (wu.EXPORT_DIR / "variants" / f"{asset}.blend")
    wu.log(f"== {nm}: teeth={p.teeth} tip D={p.tip_diameter * 1000:.3f} mm module={p.m * 1000:.4f} mm thickness={p.thickness * 1000:.1f} bore={a.bore * 1000:.1f}")

    wu.reset_scene()
    me, pl, uv = build_gear_mesh(p, nm)
    obj = wu.link_object(nm, me)
    place = bpy.data.materials.new("_placeholder")
    me.materials.append(place)
    apply_weighted_normals(obj)

    if not a.clay:
        res = a.res
        passes = [dict(name="mask", constant=1.0),
                  dict(name="ao", distance=0.010, samples=192),
                  dict(name="cav", distance=0.0035, samples=160),
                  dict(name="edge", distance=0.0007, inside=True, samples=160)]
        bk = wu.bake_maps(obj, res, passes, margin=8, samples=192)
        mask = bk["mask"][0] > 0.5
        ao = np.where(mask, bk["ao"][0], 1.0)
        cav = np.where(mask, np.clip((1 - bk["cav"][0]) * 1.5, 0, 1), 0.0)
        edge = np.where(mask, np.clip((1 - bk["edge"][0]) * 1.6 - 0.05, 0, 1), 0.0)
        wu.log(f"bake stats: ao mean={ao[mask].mean():.3f} cav mean={cav[mask].mean():.3f} edge mean={edge[mask].mean():.3f} mask={mask.mean() * 100:.1f}%")
        maps = wu.brass_maps(res, ao=ao, cavity=cav, edge=edge, seed=11)
        import tempfile
        tex_dir = Path(tempfile.mkdtemp(prefix="wu_gear_tex_"))
        imgs = wu.make_textures(asset, "brass", maps, tex_dir)
        mat = wu.build_pbr_material("Mat_AgedBrass", imgs["base"], imgs["orm"], imgs["normal"])
        me.materials[0] = mat
    else:
        mat = bpy.data.materials.new("Mat_AgedBrass")
        mat.use_nodes = True
        b = mat.node_tree.nodes["Principled BSDF"]
        b.inputs["Base Color"].default_value = (*wu.hex_to_linear(wu.BRASS["base"]), 1)
        b.inputs["Metallic"].default_value = 0.85
        b.inputs["Roughness"].default_value = 0.45
        me.materials[0] = mat
    bpy.data.materials.remove(place)
    obj.name = nm
    me.name = nm
    for ob in list(bpy.data.objects):
        if ob is not obj:
            bpy.data.objects.remove(ob)

    # ---- QA on source mesh
    wu.log("MESH QA:", wu.mesh_qa(obj))
    if not a.clay:
        wu.log("UV QA:", wu.uv_qa(obj, 1024))
        wu.log("texel density px/m:", wu.texel_density(obj, a.res))

    # ---- save .blend + export GLB
    blend.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.outliner.orphans_purge(do_recursive=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend), compress=True)
    wu.log("saved", blend, f"{blend.stat().st_size / 1024:.0f} KB")
    wu.export_glb([obj], glb)
    rep = wu.inspect_glb(glb)

    if a.no_previews:
        return rep
    # ---- previews rendered from the RE-IMPORTED GLB (round trip proof)
    w, h = (int(x) for x in a.preview_res.split("x"))
    prefix = a.preview_prefix or asset
    render_previews(glb, prefix, a.views.split(","), (w, h), a.preview_samples, p)
    return rep


def gear_views(p: GearParams):
    """glTF-space camera specs: name -> (camera position, target, lens, key light direction or None)."""
    R = p.Ro
    return {
        "front": ((0, 0, 7.2 * R), (0, 0, 0), 85, None),
        "threequarter": ((3.6 * R, 2.6 * R, 5.6 * R), (0, 0, 0), 85, None),
        "top": ((0.05 * R, 7.0 * R, 0.9 * R), (0, 0, 0), 85, None),
        "macro": ((0.58 * R + 0.012, 0.58 * R + 0.010, 0.006 + 0.036), (0.58 * R, 0.58 * R, 0.005), 100, None),
        "grazing": ((2.6 * R, 2.2 * R, 6.2 * R), (0, 0, 0), 85, (-1.0, 0.10, 0.16)),
    }


def render_previews(glb, prefix, views, res, samples, p):
    scene = wu.reset_scene()
    wu.setup_cycles(scene, samples=samples)
    objs = wu.import_glb(glb)
    zmin = min((o.matrix_world @ Vector(c)).z for o in objs if o.type == "MESH" for c in o.bound_box)
    wu.build_studio(scene, 0.064, floor_z=zmin - 0.0003)
    specs = gear_views(p)
    for name in views:
        pos, tgt, lens, key = specs[name]
        cam = wu.make_camera(scene, wu.g2b(pos), wu.g2b(tgt), lens)
        wu.isolate_key(scene, key is not None)
        wu.set_key_light(scene, wu.g2b(key) if key else None, 0.064, 2.2 if key else 1.0)
        wu.render_to(scene, wu.PREVIEW_DIR / f"{prefix}_{name}.png", res=res, samples=samples, max_kb=600)
        bpy.data.objects.remove(cam)


if __name__ == "__main__":
    run(wu.script_args())
