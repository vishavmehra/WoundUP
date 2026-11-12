"""gen_gear_spur.py - the spur_gear family: parametric aged-brass storybook spur gears (forge family).

Not run directly. The family runner builds it:

    "$B" --background --factory-startup --python-exit-code 1 --python blender/scripts/forge.py -- \
         --family spur_gear --only gear_spur_12_m1,gear_spur_16_m1,gear_spur_24_m1 --out-root <dir>

forge.py reads the manifest entries, calls build(entry, PARAMS[id]) once per id in a fresh scene, then bakes vertex AO into
COLOR_0, runs the QA gate, exports with the library profile and renders the contact sheet (docs/BLENDER_PRODUCTION_GUIDELINES
section 4). This file holds the geometry and PARAMS, the generator parameters keyed by asset id (section 4.4).

Every gear shares ONE module, m1 = MODULE_REF = 3.6158 mm (owner decision 5 pending; the manifest default), so any two
gears of the family mesh. Tip diameter = m * (teeth + 2 * 0.85): 12T 49.5 mm, 16T 64.0 mm, 24T 92.9 mm.

Model space (what ends up in the GLB, glTF Y-up): rotation axis = local +Z, front face towards +Z, origin = centre of the
bore at mid-thickness, tooth 0 points along +X. The mesh is built in this space at 100x (1 unit = 1 cm, so tiny bevels stay far
above Blender's merge tolerances), then rotated into Blender space (x, y, z) -> (x, -z, y) (Blender-side the rotation axis is the
Y axis, front face towards -Y) and scaled to metres. The glTF exporter's Y-up conversion then returns exactly the model-space axes.

Finish: a constants-only Mat_AgedBrass proxy, metric box-projected UVs (1 UV unit = 0.1 m), baked AO in COLOR_0 and one
COL_Grab sphere. The brass look itself is the shared textured library material, swapped in by name at runtime (ADR-032).
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
from lib import empties, materials, uvmetric

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
    rivet_nseg: int = 8                  # sides of a rivet dome
    bolt_nseg: int = 8                   # sides of a bolt head
    ring_spacing: float = 1.0            # x the target edge length on the rim, flange and hub circles (more = fewer triangles)

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
    rim_check: dict = field(default_factory=dict)

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
    n_att_R = max(2, int(math.ceil(2 * d_R * p.R_R / (0.0034 * p.ring_spacing))))
    n_att_F = max(2, int(math.ceil(2 * d_F * p.r_F / (0.0026 * p.ring_spacing))))
    n_win_R = max(5, int(math.ceil((span - 2 * d_R) * p.R_R / (0.0046 * p.ring_spacing))))
    n_win_F = max(2, int(math.ceil((span - 2 * d_F) * p.r_F / (0.0026 * p.ring_spacing))))

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

    def tri_area(a_, b_, c_):
        return 0.5 * ((b_[0] - a_[0]) * (c_[1] - a_[1]) - (b_[1] - a_[1]) * (c_[0] - a_[0]))

    n_override = 0
    while i < no or j < ni:
        # angle-matched zipper, but never accept a folded (non-positive area) triangle: slanted flanks seen from an
        # inner-circle vertex at a very different angle would otherwise flip and render as holes
        adv_o = j >= ni or (i < no and ao[i + 1] <= ai[j + 1])
        if i < no and j < ni:
            a_out = tri_area(pl.V[o_ids[i % no]], pl.V[o_ids[(i + 1) % no]], pl.V[i_ids[j % ni]])
            a_inn = tri_area(pl.V[i_ids[j % ni]], pl.V[o_ids[i % no]], pl.V[i_ids[(j + 1) % ni]])
            ok_o, ok_i = a_out > 1e-12, a_inn > 1e-12
            if adv_o and not ok_o and ok_i:
                adv_o, n_override = False, n_override + 1
            elif (not adv_o) and not ok_i and ok_o:
                adv_o, n_override = True, n_override + 1
        if adv_o:
            pl.faces.append([o_ids[i % no], o_ids[(i + 1) % no], i_ids[j % ni]])
            i += 1
        else:
            pl.faces.append([i_ids[j % ni], o_ids[i % no], i_ids[(j + 1) % ni]])
            j += 1
        pl.heights.append(p.h_rim)
        pl.kinds.append("rim")
    rim_tris = [f for f, k_ in zip(pl.faces, pl.kinds) if k_ == "rim"]
    areas = np.array([tri_area(pl.V[f[0]], pl.V[f[1]], pl.V[f[2]]) for f in rim_tris])
    poly_area = lambda ids: 0.5 * sum(pl.V[ids[k]][0] * pl.V[ids[(k + 1) % len(ids)]][1] - pl.V[ids[(k + 1) % len(ids)]][0] * pl.V[ids[k]][1] for k in range(len(ids)))
    expect = poly_area(o_ids) - poly_area(i_ids)
    pl.rim_check = dict(tris=len(rim_tris), folded=int((areas <= 1e-12).sum()), overridden=n_override,
                        area_error=float(areas.sum() - expect))
    assert pl.rim_check["folded"] == 0 and abs(pl.rim_check["area_error"]) < 1e-9, f"rim triangulation invalid: {pl.rim_check}"
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
            v, f = pan_head(cx * S, cy * S, z0 * S, sign, a * S, h * S, nseg=p.bolt_nseg, skirt=0.00018 * S, phase=math.atan2(cy, cx))
        else:
            v, f = dome_shell(cx * S, cy * S, z0 * S, sign, a * S, h * S, nseg=p.rivet_nseg, rings=1, skirt=0.00018 * S,
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
# mesh (Blender space, metres) -> forge family interface
# ======================================================================================
def build_gear_mesh(p: GearParams, name: str):
    pl = build_plan(p)
    bm = build_relief(pl)
    r_bore_cm = p.r_bore * S
    n_bore = bevel_convex(bm, p.bore_chamfer * S, only=lambda e: all(abs(math.hypot(v.co.x, v.co.y) - r_bore_cm) < 1e-4 for v in e.verts))
    n_edge = bevel_convex(bm, p.bevel * S)
    bm = union_rivets(bm, p)
    # the exact boolean merges coplanar fans into thin concave n-gons whose Newell normal is unreliable and whose
    # triangulation can emit zero-area triangles: triangulate them ourselves and drop the degenerate leftovers
    ng = [f for f in bm.faces if len(f.verts) > 4]
    bmesh.ops.triangulate(bm, faces=ng, quad_method="BEAUTY", ngon_method="BEAUTY")
    bmesh.ops.dissolve_degenerate(bm, dist=1e-4, edges=bm.edges)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    n_sharp = mark_shading(bm)
    wu.log(f"{name}: rim check {pl.rim_check}; bevelled bore={n_bore} edges={n_edge}; sharp edges={n_sharp}")
    M = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1))) @ Matrix.Scale(1.0 / S, 4)
    bmesh.ops.transform(bm, matrix=M, verts=bm.verts)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return me, pl


def apply_weighted_normals(obj):
    wu.select_only(obj)
    md = obj.modifiers.new("wn", "WEIGHTED_NORMAL")
    md.keep_sharp = True
    md.weight = 100
    md.mode = "FACE_AREA"
    bpy.ops.object.modifier_apply(modifier=md.name)


def geometry_check(p: GearParams):
    """Measure the finished mesh (not the parameters): tooth count, tooth 0 centred on +X, bore radius, bore centre."""
    def run(g, objs):
        me = objs[0].data
        c = np.empty(len(me.vertices) * 3)
        me.vertices.foreach_get("co", c)
        c = c.reshape(-1, 3)
        x, y = c[:, 0], c[:, 2]                                   # the gear plane in glTF axes (Blender z is glTF y)
        r, ang = np.hypot(x, y), np.arctan2(y, x)
        pitch = 2 * math.pi / p.teeth
        tip = r >= p.Ro - 0.0003
        k = np.round(ang[tip] / pitch).astype(int)
        resid = ang[tip] - k * pitch
        teeth, off = len(set(k % p.teeth)), math.degrees(abs(float(resid.mean())))
        bore = r <= p.r_bore + 1e-6
        g.info.update(teethFound=teeth, tooth0OffsetDeg=round(off, 4), boreRadiusMm=round(float(r.min()) * 1000, 4),
                      boreCentreMm=[round(float((x[bore].max() + x[bore].min()) * 500), 4), round(float((y[bore].max() + y[bore].min()) * 500), 4)])
        if teeth != p.teeth:
            g.fail("Q13", f"{teeth} teeth found in the mesh, {p.teeth} expected")
        if off > 0.05:
            g.fail("Q13", f"tooth 0 is {off:.3f} deg off +X (limit 0.05)")
        if abs(float(r.min()) - p.r_bore) > 5e-5:
            g.fail("Q13", f"bore radius {r.min() * 1000:.4f} mm, expected {p.r_bore * 1000:.4f} mm")
        if max(abs(v) for v in g.info["boreCentreMm"]) > 0.05:
            g.fail("Q13", f"bore centre {g.info['boreCentreMm']} mm is off the origin")
    return run


FAMILY = "spur_gear"

# Generator parameters keyed by asset id (BLENDER_PRODUCTION_GUIDELINES 4.4; the manifest has no field for them yet).
# `grab_radius` is the COL_Grab sphere in metres: the gear's tip radius, so the invisible collider never reaches past the
# visible footprint (INTERACTION_SPEC 7.2: never enlarge the visible mesh; minimum 12 mm). It must equal
# PartDefinition.grab.colliderRadius (Agent 2).
# One shared detail tier keeps the family looking alike and every gear inside its 4,000-triangle ceiling (the 24-tooth gear was
# 5,024 triangles at the shipped settings). One segment on a 0.8 mm tooth fillet and a coarser rim, flange and hub circle are below what
# a Quest resolves; the 8 rivets and 4 bolts per face, the chamfers, the filleted spokes and the flanged hub are unchanged.
# The 36-tooth gear (not built here) still needs a lighter tier: 4,768 triangles at these settings.
DETAIL = dict(tip_fillet_segs=1, root_fillet_segs=1, ring_spacing=1.4, rivet_nseg=8, bolt_nseg=6)
PARAMS = {
    "gear_spur_10_m1": dict(teeth=10, **DETAIL, grab_radius=0.0212),
    "gear_spur_12_m1": dict(teeth=12, **DETAIL, grab_radius=0.0248),
    "gear_spur_20_m1": dict(teeth=20, **DETAIL, grab_radius=0.0392),
    "gear_spur_16_m1": dict(teeth=16, **DETAIL, grab_radius=0.0320),
    "gear_spur_24_m1": dict(teeth=24, **DETAIL, grab_radius=0.0465),
}


def build(entry: dict, params: dict):
    """Build one gear in the current (empty) scene. Returns ([root mesh, helper empties...], QA hints)."""
    kw = {k: v for k, v in params.items() if k != "grab_radius"}
    p = GearParams(**kw).derive()
    name = entry["meshes"][0]
    wu.log(f"== {entry['id']}: teeth={p.teeth} tip D={p.tip_diameter * 1000:.3f} mm module={p.m * 1000:.4f} mm")
    me, _ = build_gear_mesh(p, name)
    obj = wu.link_object(name, me)
    apply_weighted_normals(obj)
    materials.assign(obj, entry["materials"][0])
    uvmetric.box_project(obj)
    obj["wu"] = dict(id=entry["id"], family=FAMILY, teeth=p.teeth, moduleMm=round(p.m * 1000, 4),
                     tipRadiusM=round(p.Ro, 5), rotationAxis="+Z")
    col = empties.add_collider(obj, "Grab", "sphere", params["grab_radius"])
    return [obj, col], dict(origin=("centre", "centre", "centre"), thin_axis_z=True, closed=True, checks=[geometry_check(p)])


if __name__ == "__main__":
    raise SystemExit("gen_gear_spur.py is a forge family. Run blender/scripts/forge.py --family spur_gear --only <ids> --out-root <dir>")
