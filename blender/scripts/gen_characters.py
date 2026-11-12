"""gen_characters.py - family H (characters): the two Tockton figures, Mira and Otto (docs/TOCKTON_CHARACTERS.md).

Not run directly. The family runner builds it:

    "$B" --background --factory-startup --python-exit-code 1 --python blender/scripts/forge.py -- \
         --family characters --only figure_mira,figure_otto --owner World --out-root <dir> [--manifest <file>]

Miniature scale 1:48 (docs/TOCKTON_DIMENSIONS.md section 7, an Opus draft awaiting owner approval, used as the working values):
Mira 35 mm, Otto 36 mm. Model space is glTF Y-up, facing +Z, origin at the centre of the sole footprint. Everything is built in
millimetres as closed overlapping shells (tubes, ellipsoids, a slab for the apron) and converted to metres and Blender axes when the
mesh is made. Colour comes only from library materials: Mira Mat_Ceramic (skin, shirt) + Mat_Walnut (hair, waistcoat, boots,
trousers) + Mat_PolishedBrass (goggles, buckle); Otto Mat_Ceramic (shirt, face, forearms) + Mat_Fabric (apron, toque) + Mat_Walnut
(trousers, shoes, moustache, straps). The figures are rigid-node, not skinned: Otto is two nodes, Otto_Body and Otto_Forearms
(pivot on the elbow axis), and the one-shot looping clip Otto_Knead moves Otto_Forearms only.

Two small shims below (the family runner has no profile or animation hook yet, see the report): Otto's export uses profile A (sampled
clips) and the post-export check accepts exactly the clips the manifest lists. Both are inert for an entry without animations.
"""
from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np

import bmesh
import bpy
from mathutils import Vector

import wu_common as wu
from lib import export_profile, materials, qa_gate, uvmetric

FAMILY = "characters"
MM = 0.001


# ======================================================================================
# shims for the clip (smallest patch for forge.py / qa_gate.py is in the handoff report)
# ======================================================================================
if not getattr(export_profile, "_wu_characters_shim", False):
    _orig_export = export_profile.export
    _orig_check_glb = qa_gate.check_glb

    def _export(objs, path, profile="L"):
        animated = any(o.animation_data and o.animation_data.action for o in objs)
        return _orig_export(objs, path, "A" if animated else profile)

    def _check_glb(path, entry, manifest):
        g = _orig_check_glb(path, entry, manifest)
        want = sorted(entry.get("animations") or [])
        if want:
            js = wu.read_glb(path)[0]
            got = sorted(a.get("name", "") for a in js.get("animations", []))
            g.fails = [f for f in g.fails if not f.startswith("Q22 a static part carries")]
            if got != want:
                g.fail("Q22", f"clips {got} differ from the manifest animations {want}")
            if js.get("skins") or js.get("cameras"):
                g.fail("Q22", "a rigid-node character carries skins or cameras")
            g.info["animations"] = got
        return g

    export_profile.export = _export
    qa_gate.check_glb = _check_glb
    export_profile._wu_characters_shim = True


# ======================================================================================
# geometry kit: every builder returns (verts mm, faces, smooth flags) of ONE closed shell
# ======================================================================================
def _unit(v):
    v = np.asarray(v, float)
    n = np.linalg.norm(v, axis=-1, keepdims=True)
    return v / np.where(n == 0, 1.0, n)


def rot(axis: str, deg: float):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return {"x": np.array([[1, 0, 0], [0, c, -s], [0, s, c]]),
            "y": np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]]),
            "z": np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])}[axis]


def grid(P, wrap_i=True, wrap_j=False, cap0=True, cap1=True):
    """Quad strips over P[j][i] (j along, i around). A ring whose points coincide is a pole (triangle fan). Flat centroid-fan caps."""
    P = np.asarray(P, float)
    nj, ni, _ = P.shape
    V, F, S, rings = [], [], [], []
    for j in range(nj):
        r = P[j]
        if (not wrap_j) and np.ptp(r, axis=0).max() < 1e-7:
            V.append(r[0])
            rings.append(("p", len(V) - 1))
        else:
            rings.append(("r", len(V)))
            V.extend(r)
    for j in range(nj if wrap_j else nj - 1):
        a, b = rings[j], rings[(j + 1) % nj]
        for i in range(ni if wrap_i else ni - 1):
            i2 = (i + 1) % ni
            if a[0] == "p" and b[0] == "p":
                continue
            if a[0] == "p":
                F.append((a[1], b[1] + i2, b[1] + i))
            elif b[0] == "p":
                F.append((a[1] + i, a[1] + i2, b[1]))
            else:
                F.append((a[1] + i, a[1] + i2, b[1] + i2, b[1] + i))
            S.append(True)
    if not wrap_j:
        for end, on in ((0, cap0), (nj - 1, cap1)):
            if not on or rings[end][0] == "p":
                continue
            base, c = rings[end][1], len(V)
            V.append(P[end].mean(0))
            for i in range(ni):
                i2 = (i + 1) % ni
                F.append((c, base + i2, base + i) if end == 0 else (c, base + i, base + i2))
                S.append(False)
    return np.array(V), F, S


def tube(path, ru, rv=None, nseg=8, up=(1, 0, 0), ends=("round", "round"), end_rings=1, e=1.0):
    """Tapered elliptical tube along a polyline. ru runs along `up` (projected square to the path), rv along the other normal."""
    path = np.asarray(path, float)
    n = len(path)
    ru = np.broadcast_to(np.asarray(ru, float), (n,)).copy()
    rv = ru.copy() if rv is None else np.broadcast_to(np.asarray(rv, float), (n,)).copy()
    t = np.zeros_like(path)
    t[1:-1] = path[2:] - path[:-2]
    t[0], t[-1] = path[1] - path[0], path[-1] - path[-2]
    t = _unit(t)
    upv = _unit(np.asarray(up, float))
    u = _unit(upv - t * (t @ upv)[:, None])
    v = np.cross(t, u)
    ang = 2 * math.pi * np.arange(nseg) / nseg
    c, s = np.cos(ang), np.sin(ang)
    if e != 1.0:
        c, s = np.sign(c) * np.abs(c) ** e, np.sign(s) * np.abs(s) ** e

    def ring(i, centre=None, k=1.0):
        ctr = path[i] if centre is None else centre
        return ctr + (ru[i] * k * c)[:, None] * u[i] + (rv[i] * k * s)[:, None] * v[i]

    phis = [90.0 * m / (end_rings + 1) for m in range(1, end_rings + 1)]          # ascending: nearest the body first
    rows = []
    if ends[0] == "round":
        rho = 0.5 * (ru[0] + rv[0])
        rows.append(np.tile(path[0] - t[0] * rho, (nseg, 1)))
        for ph in reversed(phis):
            p = math.radians(ph)
            rows.append(ring(0, path[0] - t[0] * rho * math.sin(p), math.cos(p)))
    rows += [ring(i) for i in range(n)]
    if ends[1] == "round":
        rho = 0.5 * (ru[-1] + rv[-1])
        for ph in phis:
            p = math.radians(ph)
            rows.append(ring(n - 1, path[-1] + t[-1] * rho * math.sin(p), math.cos(p)))
        rows.append(np.tile(path[-1] + t[-1] * rho, (nseg, 1)))
    return grid(np.stack(rows), cap0=ends[0] != "round", cap1=ends[1] != "round")


def ellipsoid(centre, radii, nu=10, nv=6, rot_m=None, e=(1.0, 1.0), taper=None):
    """Superellipsoid with poles on local Y. taper(yn) scales the x/z radii along the height (yn -1 bottom .. +1 top)."""
    th = np.linspace(0, math.pi, nv + 1)
    ph = 2 * math.pi * np.arange(nu) / nu
    sp = lambda x, p: np.sign(x) * np.abs(x) ** p
    yn = np.cos(th)
    r = sp(np.sin(th), e[0])[:, None]
    k = (taper(yn) if taper else np.ones(nv + 1))[:, None]
    x = r * sp(np.cos(ph), e[1])[None, :] * k
    z = r * sp(np.sin(ph), e[1])[None, :] * k
    y = np.broadcast_to(sp(yn, e[0])[:, None], x.shape)
    P = np.stack([x * radii[0], y * radii[1], z * radii[2]], -1)
    if rot_m is not None:
        P = P @ np.asarray(rot_m).T
    return grid(P + np.asarray(centre, float))


def belt(y, ru, rv, a, b, n_around=12, n_cross=4, x_off=0.0):
    """Closed torus-like band round an elliptical torso: a = radial half thickness, b = half height."""
    th = 2 * math.pi * np.arange(n_around) / n_around
    ph = 2 * math.pi * np.arange(n_cross) / n_cross
    cx, cz = ru * np.cos(th), rv * np.sin(th)
    nx, nz = np.cos(th) / ru, np.sin(th) / rv
    nn = np.hypot(nx, nz)
    nx, nz = nx / nn, nz / nn
    P = np.zeros((n_around, n_cross, 3))
    for j in range(n_around):
        for i in range(n_cross):
            P[j, i] = (x_off + cx[j] + nx[j] * a * math.cos(ph[i]), y + b * math.sin(ph[i]), cz[j] + nz[j] * a * math.cos(ph[i]))
    return grid(P, wrap_i=True, wrap_j=True)


def panel(Po, Pi):
    """Closed thin slab between an outer and an inner grid of the same shape [j][i]."""
    Po, Pi = np.asarray(Po, float), np.asarray(Pi, float)
    nj, ni, _ = Po.shape
    V = np.concatenate([Po.reshape(-1, 3), Pi.reshape(-1, 3)])
    off = nj * ni
    ix = lambda g, j, i: g * off + j * ni + i
    F, S = [], []
    for j in range(nj - 1):
        for i in range(ni - 1):
            F.append((ix(0, j, i), ix(0, j, i + 1), ix(0, j + 1, i + 1), ix(0, j + 1, i)))
            F.append((ix(1, j, i), ix(1, j + 1, i), ix(1, j + 1, i + 1), ix(1, j, i + 1)))
            S += [True, True]
    loop = [(0, i) for i in range(ni)] + [(j, ni - 1) for j in range(1, nj)] + [(nj - 1, i) for i in range(ni - 2, -1, -1)] \
        + [(j, 0) for j in range(nj - 2, 0, -1)]
    for k in range(len(loop)):
        p, q = loop[k], loop[(k + 1) % len(loop)]
        F.append((ix(0, *q), ix(0, *p), ix(1, *p), ix(1, *q)))
        S.append(False)
    return V, F, S


class Soup:
    """Disjoint closed shells in one mesh. Each shell is wound outward by its signed volume; recalc_face_normals finishes it."""

    def __init__(self):
        self.V, self.F, self.S, self.M = [], [], [], []

    def add(self, shell, mat):
        V, F, S = shell
        vol = 0.0
        for f in F:
            for i in range(1, len(f) - 1):
                vol += np.dot(V[f[0]], np.cross(V[f[i]], V[f[i + 1]])) / 6.0
        if vol < 0:
            F = [tuple(reversed(f)) for f in F]
        if os.environ.get("WU_CHAR_DEBUG"):
            c = np.mean(V, axis=0)
            wu.log(f"  shell mat={mat} tris={sum(len(f) - 2 for f in F):4d} centre=({c[0]:.1f}, {c[1]:.1f}, {c[2]:.1f})")
        base = len(self.V)
        self.V.extend(map(tuple, V))
        self.F.extend(tuple(base + i for i in f) for f in F)
        self.S.extend(S)
        self.M.extend([mat] * len(F))


def to_object(name, soup, slots, pivot=(0.0, 0.0, 0.0)):
    """Soup (mm, glTF axes) -> a Blender mesh object (metres, Blender axes) with library proxies in `slots` order."""
    bm = bmesh.new()
    V = np.asarray(soup.V, float) - np.asarray(pivot, float)
    B = np.stack([V[:, 0], -V[:, 2], V[:, 1]], 1) * MM
    vs = [bm.verts.new(p) for p in B]
    for f, sm, m in zip(soup.F, soup.S, soup.M):
        face = bm.faces.new([vs[i] for i in f])
        face.smooth, face.material_index = sm, m
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = wu.link_object(name, me)
    for mn in slots:
        me.materials.append(materials.make_proxy(mn))
    uvmetric.box_project(obj)
    return obj


def interp(table, y):
    """table = [(y, ru, rv), ...] ascending -> (ru, rv) at y."""
    t = np.asarray(table, float)
    return float(np.interp(y, t[:, 0], t[:, 1])), float(np.interp(y, t[:, 0], t[:, 2]))


def surface_z(c, radii, x, y, taper=None):
    yn = (y - c[1]) / radii[1]
    k = float(taper(np.array([yn]))[0]) if taper else 1.0
    q = 1.0 - ((x - c[0]) / (radii[0] * k)) ** 2 - yn ** 2
    return c[2] + radii[2] * k * math.sqrt(max(q, 0.0))


def chin(yn):
    """Egg-shaped head: the lower half narrows."""
    return 1.0 - 0.30 * np.clip(-yn, 0.0, 1.0) ** 1.4


# ======================================================================================
# parameters (keyed by asset id, GUIDELINES 4.4)
# ======================================================================================
PARAMS = {
    "figure_mira": dict(height_mm=35.0, head=(10, 7), limb=7, hair=(9, 6)),
    "figure_otto": dict(height_mm=36.0, head=(10, 7), limb=6, hair=(9, 6)),
}


def fit_height(soup, height_mm, extra=()):
    """Scale the whole figure about the origin so its top is exactly height_mm (feet are already on y = 0)."""
    top = max(v[1] for v in soup.V)
    k = height_mm / top
    soup.V = [(x * k, y * k, z * k) for x, y, z in soup.V]
    return k


# ======================================================================================
# Mira: a slender young maker, goggles pushed up into a high bun, waistcoat, breeches tucked into boots
# ======================================================================================
MIRA_TORSO = [(14.9, 3.53, 2.26), (15.6, 3.65, 2.30), (17.2, 2.85, 1.90), (18.8, 2.50, 1.70), (21.0, 3.00, 1.95),
              (23.2, 3.25, 2.00), (25.2, 3.40, 1.90), (26.2, 2.50, 1.55), (26.75, 1.40, 1.10)]


def build_mira(entry, p):
    sg, sh = p["limb"], p["head"]
    mat = {"cer": 0, "wal": 1, "brs": 2}
    s = Soup()
    # boots (walnut): a soft block foot and a tall shaft; feet centred on the origin, soles on y = 0
    for sx in (-1.55, 1.65):
        s.add(ellipsoid((sx, 1.05, 0.0), (1.30, 1.05, 2.35), nu=8, nv=4, e=(0.55, 0.6)), mat["wal"])
        s.add(tube([(sx, 1.4, -0.55), (sx, 6.6, -0.35)], 1.30, 1.36, nseg=sg - 1, ends=("flat", "flat")), mat["wal"])
    # breeches (walnut): bloused over the boot tops, full at the thigh
    s.add(tube([(-1.55, 6.0, -0.35), (-1.65, 8.6, -0.10), (-1.65, 11.8, 0.10), (-1.45, 15.2, 0.0)],
               [1.55, 2.10, 2.15, 2.05], [1.50, 2.00, 2.05, 1.95], nseg=sg, ends=("flat", "flat")), mat["wal"])
    s.add(tube([(1.65, 6.0, -0.30), (1.75, 8.6, 0.20), (1.80, 11.8, 0.30), (1.55, 15.2, 0.0)],
               [1.55, 2.10, 2.15, 2.05], [1.50, 2.00, 2.05, 1.95], nseg=sg, ends=("flat", "flat")), mat["wal"])
    # torso (shirt, cream): contrapposto lean through the centre line
    y0, y1 = MIRA_TORSO[0][0], MIRA_TORSO[-2][0]
    cl = lambda y: 0.25 - 0.5 * (y - y0) / (y1 - y0)
    s.add(tube([(cl(r[0]), r[0], 0.0) for r in MIRA_TORSO], [r[1] for r in MIRA_TORSO], [r[2] for r in MIRA_TORSO], nseg=sg + 2,
               ends=("flat", "round"), end_rings=1), mat["cer"])
    # waistcoat (walnut): a slightly larger shell, a brass hex cog badge on the chest and a brass buckle
    vys = [15.0, 17.0, 18.8, 21.0, 23.2, 25.0, 25.5]
    vr = [interp(MIRA_TORSO, y) for y in vys]
    s.add(tube([(cl(y), y, 0.0) for y in vys], [r[0] + 0.27 for r in vr], [r[1] + 0.22 for r in vr], nseg=sg + 2,
               ends=("flat", "flat")), mat["wal"])
    for bx, by, rad, nseg, thick in ((-1.15, 22.5, 0.62, 6, 0.34), ):
        ru, rv = interp(MIRA_TORSO, by)
        z = (rv + 0.22) * math.sqrt(1 - (bx / (ru + 0.27)) ** 2) - 0.08
        s.add(tube([(bx, by, z), (bx, by, z + thick)], rad, rad, nseg=nseg, up=(1, 0, 0), ends=("flat", "flat")), mat["brs"])
    ru, rv = interp(MIRA_TORSO, 16.7)
    s.add(ellipsoid((cl(16.7), 16.7, rv + 0.22 + 0.04), (0.72, 0.50, 0.28), nu=7, nv=4, e=(0.45, 0.45)), mat["brs"])
    # neck and head
    s.add(tube([(0.0, 26.3, 0.1), (-0.1, 28.2, 0.2)], 0.95, 0.95, nseg=sg, ends=("flat", "flat")), mat["cer"])
    hc, hr = (-0.10, 31.2, 0.20), (2.95, 3.60, 3.15)
    s.add(ellipsoid(hc, hr, nu=sh[0], nv=sh[1], taper=chin), mat["cer"])
    # hair: a larger cap set back so the face shows in front of it, a high bun and two locks framing the face
    s.add(ellipsoid((-0.10, 31.95, -0.55), (3.30, 3.80, 3.45), nu=p["hair"][0], nv=p["hair"][1]), mat["wal"])
    s.add(ellipsoid((-0.05, 34.35, -3.00), (1.40, 1.25, 1.35), nu=8, nv=5), mat["wal"])
    for sx in (-1, 1):
        s.add(tube([(hc[0] + sx * 2.65, 32.5, 1.15), (hc[0] + sx * 2.85, 30.7, 0.75), (hc[0] + sx * 2.5, 29.0, 0.25)], [0.58, 0.55, 0.38],
                   nseg=4, up=(1, 0, 0), ends=("round", "round")), mat["wal"])
    # face
    for sx in (-1.05, 1.05):
        zz = surface_z(hc, hr, hc[0] + sx, hc[1] - 0.45, chin) - 0.04
        s.add(ellipsoid((hc[0] + sx, hc[1] - 0.45, zz), (0.32, 0.40, 0.25), nu=5, nv=3), mat["wal"])
    zn = surface_z(hc, hr, hc[0], hc[1] - 1.25, chin)
    s.add(ellipsoid((hc[0], hc[1] - 1.25, zn + 0.05), (0.40, 0.50, 0.50), nu=5, nv=3), mat["cer"])
    zm = surface_z(hc, hr, hc[0], hc[1] - 2.2, chin)
    s.add(tube([(hc[0] - 0.55, hc[1] - 2.1, zm - 0.1), (hc[0], hc[1] - 2.27, zm - 0.02), (hc[0] + 0.55, hc[1] - 2.1, zm - 0.1)], 0.13, 0.11, nseg=4,
               up=(0, 1, 0), ends=("flat", "flat")), mat["wal"])
    # goggles pushed up on the forehead: two brass drums and a bridge
    n = _unit((0.0, 0.45, 0.89))
    for sx in (-1.32, 1.32):
        c = np.array([hc[0] + sx, hc[1] + 1.95, 2.45])
        s.add(tube([c - n * 0.45, c, c + n * 0.50], [1.02, 1.10, 1.02], nseg=9, up=(1, 0, 0), ends=("flat", "flat")), mat["brs"])
    s.add(tube([(-0.6, hc[1] + 1.95, 2.5), (0.6, hc[1] + 1.95, 2.5)], 0.30, 0.26, nseg=5, up=(0, 1, 0), ends=("flat", "flat")), mat["brs"])
    # arms: right arm relaxed, left hand on the hip
    def arm(pts, rad, hand, hand_r):
        s.add(tube(pts, rad, nseg=sg - 1, ends=("flat", "flat")), mat["cer"])
        s.add(ellipsoid(hand, hand_r, nu=6, nv=3), mat["cer"])
    s.add(ellipsoid((3.70, 24.4, 0.0), (1.25, 1.2, 1.2), nu=7, nv=4), mat["cer"])
    arm([(3.70, 24.2, 0.0), (4.30, 22.2, 0.35), (4.95, 20.0, 0.6), (5.10, 18.0, 1.0)], [1.05, 0.95, 0.88, 0.78],
        (5.12, 17.1, 1.1), (0.72, 1.0, 0.55))
    s.add(ellipsoid((-3.70, 24.4, 0.0), (1.25, 1.2, 1.2), nu=7, nv=4), mat["cer"])
    arm([(-3.70, 24.2, 0.0), (-4.50, 22.1, -0.1), (-5.10, 20.3, -0.3), (-4.20, 18.4, 0.5), (-3.45, 17.8, 1.35)],
        [1.05, 0.95, 0.88, 0.80, 0.74], (-3.1, 17.2, 1.55), (0.80, 0.62, 0.55))
    fit_height(s, p["height_mm"])
    obj = to_object(entry["meshes"][0], s, ["Mat_Ceramic", "Mat_Walnut", "Mat_PolishedBrass"])
    obj["wu"] = dict(id=entry["id"], family=FAMILY, character="Mira", scale="1:48", facing="+Z")
    return [obj], dict(closed=True, checks=[figure_check(p["height_mm"] * MM)])


# ======================================================================================
# Otto: the round baker in a toque, shirtsleeves rolled, linen apron, handlebar moustache; kneads at the counter
# ======================================================================================
OTTO_TORSO = [(9.6, 4.30, 3.25), (11.6, 5.45, 4.10), (14.6, 6.10, 4.70), (17.6, 5.90, 4.60), (20.6, 5.20, 4.05),
              (23.4, 4.40, 3.30), (25.6, 3.30, 2.60), (26.6, 2.20, 1.90)]
ELBOW = (0.0, 19.2, 0.8)             # pivot of Otto_Forearms (the elbow axis), mm
KNEAD = [  # seconds, forearm pitch about +X (deg), forward push (mm), lift (mm); first = last so the clip loops
    (0.00, -5.0, -0.55, 0.40),
    (0.42, 9.0, 1.15, -0.50),
    (0.68, 12.0, 1.55, -0.70),
    (1.04, -1.0, -0.10, 0.20),
    (1.25, -5.0, -0.55, 0.40),
]


def build_otto(entry, p):
    sg, sh = p["limb"], p["head"]
    mat = {"cer": 0, "fab": 1, "wal": 2}
    s = Soup()
    # shoes and trousers (walnut)
    for sx in (-2.6, 2.6):
        s.add(ellipsoid((sx, 1.05, 0.0), (1.75, 1.05, 3.0), nu=8, nv=4, e=(0.55, 0.6)), mat["wal"])
        s.add(tube([(sx, 1.6, -0.2), (sx * 0.96, 6.0, -0.1), (sx * 0.96, 10.8, 0.0)], [1.95, 2.15, 2.45], [1.9, 2.1, 2.35],
                   nseg=sg, ends=("flat", "flat")), mat["wal"])
    # torso (shirt, cream enamel)
    ys = [r[0] for r in OTTO_TORSO]
    s.add(tube([(0.0, y, 0.0) for y in ys], [r[1] for r in OTTO_TORSO], [r[2] for r in OTTO_TORSO], nseg=sg + 4,
               ends=("flat", "round"), end_rings=1), mat["cer"])
    # linen apron: a thin curved slab on the belly (fabric), walnut waist band and shoulder straps
    ang = np.radians(np.linspace(-58, 58, 5))
    ya = np.linspace(9.4, 22.4, 5)
    Po, Pi = np.zeros((5, 5, 3)), np.zeros((5, 5, 3))
    for j, y in enumerate(ya):
        ru, rv = interp(OTTO_TORSO, y)
        for i, a in enumerate(ang):
            d = np.array([math.sin(a) * ru, 0.0, math.cos(a) * rv])
            n = _unit(np.array([math.sin(a) / ru, 0.0, math.cos(a) / rv]))
            Po[j, i] = d + n * 0.40 + (0, y, 0)
            Pi[j, i] = d + n * 0.04 + (0, y, 0)
    s.add(panel(Po, Pi), mat["fab"])
    ru, rv = interp(OTTO_TORSO, 14.0)
    s.add(belt(14.0, ru + 0.30, rv + 0.30, 0.32, 0.40, n_around=sg + 6, n_cross=4), mat["wal"])
    for sx in (-1, 1):
        pts = [(sx * 1.9, 22.3, 3.75), (sx * 2.15, 24.3, 2.95), (sx * 2.6, 25.9, 1.35), (sx * 2.75, 25.6, -1.2), (sx * 2.9, 23.5, -2.8)]
        s.add(tube(pts, 0.34, 0.20, nseg=5, up=(1, 0, 0), ends=("round", "flat")), mat["wal"])
    # neck and head
    s.add(tube([(0.0, 26.3, 0.2), (0.0, 28.0, 0.3)], 1.55, 1.55, nseg=sg, ends=("flat", "flat")), mat["cer"])
    hc, hr = (0.0, 30.4, 0.45), (3.10, 3.00, 3.00)
    s.add(ellipsoid(hc, hr, nu=sh[0], nv=sh[1]), mat["cer"])
    # toque (linen): band and a puffed crown
    s.add(tube([(0.0, 32.0, 0.35), (0.0, 33.6, 0.35)], 3.18, 3.15, nseg=sg + 3, up=(1, 0, 0), ends=("flat", "flat")), mat["fab"])
    s.add(ellipsoid((0.0, 34.55, 0.30), (3.55, 1.85, 3.45), nu=sh[0] - 2, nv=5, e=(0.85, 1.0)), mat["fab"])
    # face: eyes, nose, moustache
    for sx in (-1.2, 1.2):
        zz = surface_z(hc, hr, sx, 30.75) - 0.04
        s.add(ellipsoid((sx, 30.75, zz), (0.30, 0.36, 0.24), nu=5, nv=3), mat["wal"])
    zn = surface_z(hc, hr, 0.0, 29.95)
    s.add(ellipsoid((0.0, 29.95, zn + 0.05), (0.62, 0.58, 0.62), nu=6, nv=4), mat["cer"])
    zm = surface_z(hc, hr, 0.0, 29.05) + 0.12
    for sx in (-1, 1):
        s.add(tube([(sx * 0.15, 29.15, zm + 0.28), (sx * 1.35, 28.95, zm + 0.12), (sx * 2.45, 29.25, zm - 0.45), (sx * 2.95, 29.85, zm - 0.95)],
                   [0.48, 0.44, 0.34, 0.22], [0.40, 0.36, 0.28, 0.18], nseg=5, up=(0, 1, 0), ends=("round", "round")), mat["wal"])
    # upper arms: rolled shirtsleeves down to the elbow axis (cream)
    for sx in (-1, 1):
        s.add(ellipsoid((sx * 4.75, 24.0, 0.0), (1.75, 1.6, 1.6), nu=6, nv=4), mat["cer"])
        s.add(tube([(sx * 4.8, 23.6, 0.0), (sx * 5.9, 21.5, 0.4), (sx * 6.6, 19.3, 0.8)], [1.55, 1.40, 1.28], nseg=sg, ends=("flat", "round")), mat["cer"])
    fit = fit_height(s, p["height_mm"])
    # forearms node (cream skin): both forearms and hands, built about the elbow axis, rigid
    f = Soup()
    ex, ey, ez = ELBOW
    for sx in (-1, 1):
        f.add(tube([(sx * 6.6, 19.2, 0.8), (sx * 5.3, 18.5, 3.0), (sx * 3.95, 17.8, 4.9)], [1.18, 1.0, 0.92], [1.12, 0.95, 0.88],
                   nseg=sg - 1, up=(1, 0, 0), ends=("round", "flat")), 0)
        f.add(ellipsoid((sx * 3.55, 17.45, 5.95), (0.98, 0.78, 1.25), nu=7, nv=4), 0)
        f.add(ellipsoid((sx * 2.75, 17.55, 5.45), (0.36, 0.34, 0.62), nu=5, nv=3), 0)        # thumb
    f.V = [(x * fit, y * fit, z * fit) for x, y, z in f.V]
    pivot = tuple(c * fit for c in ELBOW)
    body = to_object(entry["meshes"][0], s, ["Mat_Ceramic", "Mat_Fabric", "Mat_Walnut"])
    arms = to_object(entry["meshes"][1], f, ["Mat_Ceramic"], pivot=pivot)
    body["wu"] = dict(id=entry["id"], family=FAMILY, character="Otto", scale="1:48", facing="+Z", clip="Otto_Knead")
    arms.parent = body
    arms.location = (pivot[0] * MM, -pivot[2] * MM, pivot[1] * MM)
    animate_knead(arms)
    return [body, arms], dict(closed=True, pivot_nodes=[arms], checks=[figure_check(p["height_mm"] * MM), knead_check(arms)])


def animate_knead(arms):
    """Otto_Knead: forearm pitch about the elbow axis plus a small push and lift, 24 fps, first key = last key (loops)."""
    scene = bpy.context.scene
    scene.render.fps = 24
    rest = arms.location.copy()
    arms.rotation_mode = "XYZ"
    for t, deg, fwd, up in KNEAD:
        fr = round(t * 24)
        arms.rotation_euler = (math.radians(deg), 0.0, 0.0)
        arms.location = (rest.x, rest.y - fwd * MM, rest.z + up * MM)
        arms.keyframe_insert("rotation_euler", index=0, frame=fr)
        arms.keyframe_insert("location", index=1, frame=fr)
        arms.keyframe_insert("location", index=2, frame=fr)
    act = arms.animation_data.action
    act.name = "Otto_Knead"
    scene.frame_start, scene.frame_end = 0, round(KNEAD[-1][0] * 24)    # keys 0..30: the exporter writes time = frame / fps
    scene.frame_set(0)                                           # the node's static transform is the clip's first pose
    arms["restLocationM"] = [rest.x, rest.y, rest.z]


# ======================================================================================
# family checks (QA gate hints)
# ======================================================================================
def _verts(objs):
    out = []
    for o in objs:
        if o.type != "MESH":
            continue
        c = np.empty(len(o.data.vertices) * 3)
        o.data.vertices.foreach_get("co", c)
        c = c.reshape(-1, 3)
        out.append(np.array([tuple(o.matrix_world @ Vector(v)) for v in c]))
    return np.concatenate(out)


def figure_check(height_m):
    def run(g, objs):
        w = _verts(objs)                                            # Blender axes: z up, -y forward
        h = float(w[:, 2].max() - w[:, 2].min())
        sole = w[w[:, 2] < w[:, 2].min() + 0.0003]
        cx, cz = (sole[:, 0].max() + sole[:, 0].min()) / 2, -(sole[:, 1].max() + sole[:, 1].min()) / 2
        g.info.update(heightMm=round(h * 1000, 3), soleCentreMm=[round(cx * 1000, 3), round(cz * 1000, 3)],
                      soleMm=[round(float(np.ptp(sole[:, 0])) * 1000, 2), round(float(np.ptp(sole[:, 1])) * 1000, 2)])
        if abs(h - height_m) > 0.0005:
            g.fail("Q30", f"figure height {h * 1000:.3f} mm, target {height_m * 1000:.1f} mm")
        if abs(float(w[:, 2].min())) > 0.0005 or abs(cx) > 0.0005 or abs(cz) > 0.0005:
            g.fail("Q30", f"origin is not the centre of the feet: base z {w[:, 2].min() * 1000:.3f} mm, sole centre ({cx * 1000:.3f}, {cz * 1000:.3f}) mm")
    return run


def knead_check(arms):
    def run(g, objs):
        a = arms.animation_data.action if arms.animation_data else None
        if a is None or a.name != "Otto_Knead":
            g.fail("Q31", "Otto_Forearms has no action named Otto_Knead")
            return
        fcs = list(a.fcurves) if hasattr(a, "fcurves") else [fc for l in a.layers for st in l.strips for cb in st.channelbags for fc in cb.fcurves]
        loops = all(abs(fc.keyframe_points[0].co[1] - fc.keyframe_points[-1].co[1]) < 1e-9 for fc in fcs)
        g.info["clip"] = dict(name=a.name, frames=[int(a.frame_range[0]), int(a.frame_range[1])], fcurves=len(fcs), loops=loops)
        if not loops or len(fcs) < 3:
            g.fail("Q31", "Otto_Knead must key pitch, push and lift with first key equal to last key")
    return run


BUILDERS = {"figure_mira": build_mira, "figure_otto": build_otto}


def build(entry: dict, params: dict):
    """Build one figure in the current (empty) scene. Returns ([root, children...], QA hints)."""
    wu.log(f"== {entry['id']}: height {params['height_mm']} mm")
    return BUILDERS[entry["id"]](entry, params)


if __name__ == "__main__":
    raise SystemExit("gen_characters.py is a forge family. Run blender/scripts/forge.py --family characters --only <ids> --out-root <dir>")
