"""gen_spring.py - the spring family: a flat mainspring on a flanged arbor, healthy and worn (forge family).

    "$B" --background --factory-startup --python-exit-code 1 --python blender/scripts/forge.py -- \
         --family spring --only spring_standard,spring_worn --out-root <dir>

A flat ribbon (1.2 mm thick, 7 mm wide: Springs and Winding board, mainspring 1 to 3 mm by 8 to 15 mm scaled to the 45 mm part) wound as
an Archimedean spiral on a drum with two chamfered flanges and short end stubs, the outer end running off tangentially with two rivets.
spring_standard is the regular spiral. spring_worn (PRODUCT_SPEC section 8, GAMEPLAY_SYSTEMS section 12.1: the player must be able to tell
it from the healthy one at a glance) keeps the same fit and the same arbor but is tired in four ways you can see from across the
bench: coil spacing that swings between crowded and slack, ribbon leaning out of plane, a pinched kink where the ribbon is crushed
and bulged, an outer end that has sagged and splayed away from the pack, and a darker tarnish (extra vertex AO, see tarnish).

Model space: rotation axis = local +Z, origin = the arbor axis, built in mm and exported in metres.
"""
from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np

import wu_common as wu
from lib import empties, vertex_ao
from mathutils import Vector

import gen_mech_common as mc
from gen_gear_spur import dome_shell

FAMILY = "spring"
T_RIB, W_RIB = 1.2, 7.0                 # ribbon thickness (radial) and width (z), mm
R_IN = 4.2                              # ribbon centreline radius at the arbor (the outer radius is a PARAMS value)

PARAMS = {
    "spring_standard": dict(wear=0.0, turns=6.0, r_out=21.2, grab_radius=0.0225),
    "spring_worn": dict(wear=1.0, turns=5.0, r_out=19.2, grab_radius=0.0225, tarnish=0.66),   # a tired spring has lost pack radius
}

# (r, z) loop of the arbor: drum 3.6 mm, two chamfered flanges 5.2 mm, end stubs 2.3 mm
ARBOR = [(0.0, 5.0), (2.3, 5.0), (2.3, 4.6), (4.8, 4.6), (5.2, 4.2), (5.2, 3.7), (3.6, 3.7),
         (3.6, -3.7), (5.2, -3.7), (5.2, -4.2), (4.8, -4.6), (2.3, -4.6), (2.3, -5.0), (0.0, -5.0)]


def gauss(x, c, s):
    return math.exp(-((x - c) / s) ** 2)


def spiral(turns, wear, r_out):
    """Centreline points and per-point ribbon sections of the (possibly worn) spiral."""
    th_total = 2 * math.pi * turns
    n = 4000
    ths = np.linspace(0.0, th_total, n)
    pitch = 1.0 + 0.45 * wear * np.sin(0.5 * ths + 0.6) + 0.15 * wear * np.sin(1.5 * ths)      # slack and crowded coils
    integ = np.concatenate([[0.0], np.cumsum(0.5 * (pitch[1:] + pitch[:-1]) * np.diff(ths))])
    r = R_IN + (r_out - R_IN) * integ / integ[-1]
    splay = wear * 2.4 * np.clip((ths - (th_total - 2.4 * math.pi)) / (2.4 * math.pi), 0.0, 1.0) ** 2   # last 1.2 turns lift off the pack
    kink = wear * 1.0 * np.exp(-((ths - 0.62 * th_total - 0.5) / 0.30) ** 2)                            # bulged kink
    r = r + splay + kink
    xs, ys = r * np.cos(ths), r * np.sin(ths)
    xs = xs + wear * 0.9 * (ths / th_total) ** 1.5                                                         # outer pack has slumped sideways
    zs = -wear * 1.1 * (ths / th_total) ** 2 * (0.55 + 0.45 * np.cos(ths + 0.5))                          # and sagged
    d = np.hypot(np.diff(xs), np.diff(ys))
    s = np.concatenate([[0.0], np.cumsum(d)])
    # resample along the ribbon: short segments on the tight inner coils, long ones outside (about 19 degrees per segment)
    rr = np.hypot(xs, ys)
    targets, cur = [0.0], 0.0
    while cur < s[-1]:
        k = min(int(np.searchsorted(s, cur)), n - 1)
        cur += min(max(rr[k] * 0.33, 2.6), 4.8)
        targets.append(min(cur, s[-1]))
    targets = np.array(targets)
    idx = np.searchsorted(s, targets).clip(1, n - 1)
    f = (targets - s[idx - 1]) / np.maximum(s[idx] - s[idx - 1], 1e-9)
    px = xs[idx - 1] + (xs[idx] - xs[idx - 1]) * f
    py = ys[idx - 1] + (ys[idx] - ys[idx - 1]) * f
    pz = zs[idx - 1] + (zs[idx] - zs[idx - 1]) * f
    pth = ths[idx - 1] + (ths[idx] - ths[idx - 1]) * f
    return np.stack([px, py, pz], axis=1), pth, th_total


def min_gap(P):
    """Smallest centreline distance between ribbon parts more than 15 mm apart along the ribbon (xy plane)."""
    xy = P[:, :2]
    seg = np.hypot(*np.diff(xy, axis=0).T)
    s = np.concatenate([[0.0], np.cumsum(seg)])
    D = np.hypot(xy[:, None, 0] - xy[None, :, 0], xy[:, None, 1] - xy[None, :, 1])
    far = np.abs(s[:, None] - s[None, :]) > 15.0
    return float(D[far].min())


def section_fn(pth, th_total, wear):
    def sec(i):
        th = float(pth[i])
        hh = 0.5 * W_RIB * (1.0 - 0.45 * wear * gauss(th, 0.62 * th_total, 0.45))                      # crushed, narrower at the kink
        tau = wear * 0.20 * math.sin(th + 0.9) * (0.4 + 0.6 * th / th_total)                           # ribbon leans out of plane
        c, sn = math.cos(tau), math.sin(tau)
        pts = [(-0.5 * T_RIB, -hh), (0.5 * T_RIB, -hh), (0.5 * T_RIB, hh), (-0.5 * T_RIB, hh)]
        return [(a * c - b * sn, a * sn + b * c) for a, b in pts]
    return sec


def tarnish(obj, factor):
    """Extra darkening of the baked vertex AO (COLOR_0 multiplies the base colour): the worn spring ships darker and more tarnished.
    Runs from a QA-gate callback because forge.py has no post-bake hook; values stay inside 0..1."""
    ca = obj.data.color_attributes.get(vertex_ao.AO_NAME)
    a = vertex_ao.read(obj)
    co = np.empty(len(obj.data.vertices) * 3)
    obj.data.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    n = 0.5 + 0.5 * np.sin(co[:, 0] * 380.0 + 1.3) * np.sin(co[:, 2] * 310.0 - 0.4)                    # patchy, not a flat multiply
    a[:, :3] *= (factor + (1.0 - factor) * 0.45 * n)[:, None]
    ca.data.foreach_set("color", np.clip(a, 0.0, 1.0).ravel().astype(np.float32))


def build(entry: dict, params: dict):
    wear, turns = params["wear"], params["turns"]
    amp = 1.0
    while True:                                                    # keep the coils from touching however tired they look
        P, pth, th_total = spiral(turns, wear * amp, params["r_out"])
        gap = min_gap(P)
        if gap >= T_RIB + 0.35 or wear == 0.0:
            break
        amp *= 0.85
    wu.log(f"== {entry['id']}: turns={turns} wear={wear * amp:.2f} centreline gap min {gap:.2f} mm ({len(P)} segments)")
    t_end = P[-1] - P[-2]
    T = np.array([t_end[0], t_end[1], 0.0])
    T /= np.linalg.norm(T)
    lift = wear * amp * 1.2
    tail = [P[-1] + T * 3.0 + np.array([0, 0, -lift * 0.4]), P[-1] + T * 6.0 + np.array([0, 0, -lift])]
    path = [Vector(p) for p in list(P) + tail]
    sec = section_fn(np.concatenate([pth, [pth[-1], pth[-1]]]), th_total, wear * amp)
    bm = mc.bmesh.new()
    mc.lathe(bm, ARBOR, nseg=18)
    mc.sweep(bm, path, (0, 0, 1), sec)
    u = Vector((T[1], -T[0], 0.0))                                  # outward normal of the tail (counter-clockwise travel)
    for dz in (-1.6, 1.6):
        v, f = dome_shell(0.0, 0.0, 0.0, +1, 1.0, 0.7, nseg=6, rings=1, skirt=0.25)
        vs = [bm.verts.new(c) for c in v]
        for q in f:
            bm.faces.new([vs[i] for i in q])
        mc.place(bm, vs, path[-2] + u * (0.5 * T_RIB) + Vector((0, 0, dz)), u)
    name = entry["meshes"][0]
    obj = mc.make_object(bm, name, [entry["materials"][0]])
    obj["wu"] = dict(id=entry["id"], family=FAMILY, worn=bool(wear), coilTurns=turns, ribbonMm=[T_RIB, W_RIB], rotationAxis="+Z")
    col = empties.add_collider(obj, "Grab", "sphere", params["grab_radius"])
    checks = []
    if params.get("tarnish"):
        def dark(g, objs):
            tarnish(obj, params["tarnish"])
            g.info["tarnishFactor"] = params["tarnish"]
        checks.append(dark)
    return [obj, col], dict(thin_axis_z=True, closed=True, checks=checks)


if __name__ == "__main__":
    raise SystemExit("gen_spring.py is a forge family. Run blender/scripts/forge.py --family spring --only <ids> --out-root <dir>")
